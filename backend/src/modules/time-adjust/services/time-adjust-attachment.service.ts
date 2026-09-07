import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { stat, unlink } from 'fs/promises';
import { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { UploadTimeAdjustAttachmentDto } from '../dto/upload-time-adjust-attachment.dto';
import {
  createTimeAdjustAttachmentStorageKey,
  getTimeAdjustAttachmentAbsolutePath,
  TIME_ADJUST_ATTACHMENT_BUCKET,
  TIME_ADJUST_ATTACHMENT_STORAGE_PROVIDER,
} from '../time-adjust-attachment-storage.util';

/*
 * TimeAdjustAttachmentService
 * ---------------------------------------------------------
 * รวมงานเกี่ยวกับไฟล์แนบของคำขอแก้เวลาไว้ที่เดียว
 *
 * เหตุผลที่แยกออกจาก TimeAdjustRequestsService:
 * - service หลักจะได้ไม่ยาวเกินไป
 * - upload/download/remove เป็นคนละความรับผิดชอบกับ approval flow
 * - แก้ storage ในอนาคตได้ง่าย เช่น เปลี่ยนจาก LOCAL เป็น S3/MinIO
 */
@Injectable()
export class TimeAdjustAttachmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAttachments(timeAdjustRequestId: string, scope: TenantScope) {
    await this.ensureTimeAdjustRequestExists(timeAdjustRequestId, scope);

    return this.prisma.timeAdjustAttachment.findMany({
      where: {
        timeAdjustRequestId,
        deletedAt: null,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async uploadAttachment(
    timeAdjustRequestId: string,
    dto: UploadTimeAdjustAttachmentDto,
    file: Express.Multer.File,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    const request = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id: timeAdjustRequestId,
        deletedAt: null,
        ...this.tenantFilter(scope),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!request) {
      await this.safelyDeleteUploadedFile(file.path);
      throw new NotFoundException('ไม่พบคำขอแก้เวลา');
    }

    if (request.status === 'APPROVED') {
      await this.safelyDeleteUploadedFile(file.path);
      throw new BadRequestException('ไม่สามารถแนบไฟล์ในคำขอที่อนุมัติแล้ว');
    }

    const storageKey = createTimeAdjustAttachmentStorageKey({
      timeAdjustRequestId: request.id,
      filename: file.filename,
    });

    return this.prisma.timeAdjustAttachment.create({
      data: {
        timeAdjustRequestId: request.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageProvider: TIME_ADJUST_ATTACHMENT_STORAGE_PROVIDER,
        storageKey,
        bucketName: TIME_ADJUST_ATTACHMENT_BUCKET,
        uploadedById: currentUserId ?? null,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });
  }

  async getAttachmentFileForDownload(
    timeAdjustRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    await this.ensureTimeAdjustRequestExists(timeAdjustRequestId, scope);

    const attachment = await this.prisma.timeAdjustAttachment.findFirst({
      where: {
        id: attachmentId,
        timeAdjustRequestId,
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('ไม่พบไฟล์หลักฐานคำขอแก้เวลา');
    }

    const filePath = getTimeAdjustAttachmentAbsolutePath(attachment.storageKey);

    let fileStat: Awaited<ReturnType<typeof stat>>;

    try {
      fileStat = await stat(filePath);
    } catch {
      throw new NotFoundException('ไม่พบไฟล์หลักฐานใน storage');
    }

    if (!fileStat.isFile()) {
      throw new NotFoundException('ไม่พบไฟล์หลักฐานใน storage');
    }

    return {
      filePath,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType || 'application/octet-stream',
      size: fileStat.size,
    };
  }

  async removeAttachment(
    timeAdjustRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    const request = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id: timeAdjustRequestId,
        deletedAt: null,
        ...this.tenantFilter(scope),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอแก้เวลา');
    }

    if (request.status === 'APPROVED') {
      throw new BadRequestException('ไม่สามารถลบไฟล์ของคำขอที่อนุมัติแล้ว');
    }

    const attachment = await this.prisma.timeAdjustAttachment.findFirst({
      where: {
        id: attachmentId,
        timeAdjustRequestId,
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('ไม่พบไฟล์หลักฐานคำขอแก้เวลา');
    }

    /*
     * ใบที่อยู่ในคิวอนุมัติต้องมีหลักฐานเหลืออย่างน้อยหนึ่งไฟล์เสมอ
     *
     * ไม่อย่างนั้นจะยื่นพร้อมรูปให้ผ่านด่านตอนส่ง แล้วลบรูปทิ้งทีหลัง
     * ทำให้ผู้อนุมัติเห็นใบเปล่า ๆ ทั้งที่ระบบบังคับให้แนบ
     */
    if (request.status === 'SUBMITTED') {
      const remaining = await this.prisma.timeAdjustAttachment.count({
        where: {
          timeAdjustRequestId,
          deletedAt: null,
          id: { not: attachmentId },
        },
      });

      if (remaining === 0) {
        throw new BadRequestException(
          'คำขอที่รออนุมัติต้องมีรูปหลักฐานอย่างน้อย 1 รูป กรุณาแนบรูปใหม่ก่อนลบรูปเดิม',
        );
      }
    }

    await this.prisma.timeAdjustAttachment.update({
      where: {
        id: attachmentId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      id: attachmentId,
      deleted: true,
    };
  }

  /** ตัวกรองบริษัท — คำขอไม่มี companyId ตรง จึงกรองผ่าน employee */
  private tenantFilter(scope: TenantScope) {
    return scope.level !== 'GLOBAL' && scope.companyId
      ? { employee: { is: { companyId: scope.companyId } } }
      : {};
  }

  /**
   * @param scope ขอบเขตของผู้เรียก — กรองผ่าน employee.companyId
   *
   * ไฟล์แนบคำขอแก้เวลาเป็นหลักฐานการลงเวลาของพนักงาน ถ้าไม่กรองตรงนี้
   * ผู้ใช้ที่รู้ id คำขอของบริษัทอื่นจะเปิดดูและดาวน์โหลดไฟล์ข้ามบริษัทได้
   * ตอบ 404 เหมือนไม่มีรายการ เพื่อไม่ยืนยันการมีอยู่ของคำขอที่ไม่มีสิทธิ์เห็น
   */
  private async ensureTimeAdjustRequestExists(id: string, scope: TenantScope) {
    const request = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.tenantFilter(scope),
      },
      select: {
        id: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอแก้เวลา');
    }

    return request;
  }

  private async safelyDeleteUploadedFile(filePath?: string) {
    if (!filePath) return;

    try {
      await unlink(filePath);
    } catch {
      // ignore cleanup error
    }
  }
}
