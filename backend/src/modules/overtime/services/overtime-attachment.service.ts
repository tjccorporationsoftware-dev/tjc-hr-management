import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { stat, unlink } from 'fs/promises';
import { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { UploadOvertimeAttachmentDto } from '../dto/upload-overtime-attachment.dto';
import {
  createOvertimeAttachmentStorageKey,
  getOvertimeAttachmentAbsolutePath,
  OVERTIME_ATTACHMENT_BUCKET,
  OVERTIME_ATTACHMENT_STORAGE_PROVIDER,
} from '../overtime-attachment-storage.util';

/*
 * OvertimeAttachmentService
 * ---------------------------------------------------------
 * Responsibilities:
 * - Read OT attachment lists.
 * - Save uploaded attachment metadata.
 * - Resolve local file paths for download.
 * - Soft-delete attachment records.
 *
 * File validation and storage path creation still live in
 * overtime-attachment-storage.util.ts because those utilities are used by the
 * controller/multer layer before the service receives the file.
 */
@Injectable()
export class OvertimeAttachmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAttachments(overtimeRequestId: string, scope: TenantScope) {
    await this.ensureOvertimeRequestExists(overtimeRequestId, scope);

    return this.prisma.overtimeAttachment.findMany({
      where: {
        overtimeRequestId,
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
    overtimeRequestId: string,
    dto: UploadOvertimeAttachmentDto,
    file: Express.Multer.File,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id: overtimeRequestId,
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
      throw new NotFoundException('ไม่พบคำขอ OT');
    }

    if (request.status !== 'DRAFT' && request.status !== 'SUBMITTED') {
      await this.safelyDeleteUploadedFile(file.path);
      throw new BadRequestException(
        'แนบหลักฐานได้เฉพาะคำขอสถานะร่างหรือรออนุมัติเท่านั้น',
      );
    }

    const storageKey = createOvertimeAttachmentStorageKey({
      overtimeRequestId: request.id,
      filename: file.filename,
    });

    return this.prisma.overtimeAttachment.create({
      data: {
        overtimeRequestId: request.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageProvider: OVERTIME_ATTACHMENT_STORAGE_PROVIDER,
        storageKey,
        bucketName: OVERTIME_ATTACHMENT_BUCKET,
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
    overtimeRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    await this.ensureOvertimeRequestExists(overtimeRequestId, scope);

    const attachment = await this.prisma.overtimeAttachment.findFirst({
      where: {
        id: attachmentId,
        overtimeRequestId,
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('ไม่พบไฟล์หลักฐาน OT');
    }

    if (attachment.storageProvider !== OVERTIME_ATTACHMENT_STORAGE_PROVIDER) {
      throw new BadRequestException('Storage provider นี้ยังไม่รองรับ');
    }

    const filePath = getOvertimeAttachmentAbsolutePath(attachment.storageKey);

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
    overtimeRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id: overtimeRequestId,
        deletedAt: null,
        ...this.tenantFilter(scope),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอ OT');
    }

    if (request.status !== 'DRAFT' && request.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'ลบหลักฐานได้เฉพาะคำขอสถานะร่างหรือรออนุมัติเท่านั้น',
      );
    }

    const attachment = await this.prisma.overtimeAttachment.findFirst({
      where: {
        id: attachmentId,
        overtimeRequestId,
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('ไม่พบไฟล์หลักฐาน OT');
    }

    /*
     * ใบที่อยู่ในคิวอนุมัติต้องมีหลักฐานเหลืออย่างน้อยหนึ่งไฟล์เสมอ
     *
     * ไม่อย่างนั้นจะยื่นพร้อมรูปให้ผ่านด่านตอนส่ง แล้วลบรูปทิ้งทีหลัง
     * ทำให้หัวหน้าเห็นใบเปล่า ๆ ทั้งที่ระบบบังคับให้แนบ
     */
    if (request.status === 'SUBMITTED') {
      const remaining = await this.prisma.overtimeAttachment.count({
        where: {
          overtimeRequestId,
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

    await this.prisma.overtimeAttachment.update({
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
   * ไฟล์แนบคำขอ OT เป็นหลักฐานการทำงานของพนักงาน ถ้าไม่กรองตรงนี้
   * ผู้ใช้ที่รู้ id คำขอของบริษัทอื่นจะเปิดดูและดาวน์โหลดไฟล์ข้ามบริษัทได้
   * ตอบ 404 เหมือนไม่มีรายการ เพื่อไม่ยืนยันการมีอยู่ของคำขอที่ไม่มีสิทธิ์เห็น
   */
  private async ensureOvertimeRequestExists(id: string, scope: TenantScope) {
    const request = await this.prisma.overtimeRequest.findFirst({
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
      throw new NotFoundException('ไม่พบคำขอ OT');
    }

    return request;
  }

  private async safelyDeleteUploadedFile(filePath?: string) {
    if (!filePath) {
      return;
    }

    try {
      await unlink(filePath);
    } catch {
      // ignore cleanup error
    }
  }
}
