import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { stat, unlink } from 'fs/promises';
import { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { UploadLeaveAttachmentDto } from '../dto/upload-leave-attachment.dto';
import {
  createLeaveAttachmentStorageKey,
  getLeaveAttachmentAbsolutePath,
  LEAVE_ATTACHMENT_BUCKET,
  LEAVE_ATTACHMENT_STORAGE_PROVIDER,
} from '../leave-attachment-storage.util';

@Injectable()
export class LeaveAttachmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAttachments(leaveRequestId: string, scope: TenantScope) {
    await this.ensureLeaveRequestExists(leaveRequestId, scope);

    return (this.prisma as any).leaveAttachment.findMany({
      where: {
        leaveRequestId,
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
    leaveRequestId: string,
    dto: UploadLeaveAttachmentDto,
    file: Express.Multer.File,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id: leaveRequestId,
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
      throw new NotFoundException('ไม่พบใบลา');
    }

    if (request.status !== 'DRAFT' && request.status !== 'SUBMITTED') {
      await this.safelyDeleteUploadedFile(file.path);
      throw new BadRequestException(
        'แนบหลักฐานได้เฉพาะใบลาสถานะร่างหรือรออนุมัติเท่านั้น',
      );
    }

    const storageKey = createLeaveAttachmentStorageKey({
      leaveRequestId: request.id,
      filename: file.filename,
    });

    return (this.prisma as any).leaveAttachment.create({
      data: {
        leaveRequestId: request.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageProvider: LEAVE_ATTACHMENT_STORAGE_PROVIDER,
        storageKey,
        bucketName: LEAVE_ATTACHMENT_BUCKET,
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
    leaveRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    await this.ensureLeaveRequestExists(leaveRequestId, scope);

    const attachment = await (this.prisma as any).leaveAttachment.findFirst({
      where: {
        id: attachmentId,
        leaveRequestId,
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('ไม่พบรูปหลักฐานใบลา');
    }

    if (attachment.storageProvider !== LEAVE_ATTACHMENT_STORAGE_PROVIDER) {
      throw new BadRequestException('Storage provider นี้ยังไม่รองรับ');
    }

    const filePath = getLeaveAttachmentAbsolutePath(attachment.storageKey);

    let fileStat: Awaited<ReturnType<typeof stat>>;

    try {
      fileStat = await stat(filePath);
    } catch {
      throw new NotFoundException('ไม่พบรูปหลักฐานใน storage');
    }

    if (!fileStat.isFile()) {
      throw new NotFoundException('ไม่พบรูปหลักฐานใน storage');
    }

    return {
      filePath,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType || 'application/octet-stream',
      size: fileStat.size,
    };
  }

  async removeAttachment(
    leaveRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id: leaveRequestId,
        deletedAt: null,
        ...this.tenantFilter(scope),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบใบลา');
    }

    if (request.status !== 'DRAFT' && request.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'ลบหลักฐานได้เฉพาะใบลาสถานะร่างหรือรออนุมัติเท่านั้น',
      );
    }

    const attachment = await (this.prisma as any).leaveAttachment.findFirst({
      where: {
        id: attachmentId,
        leaveRequestId,
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('ไม่พบรูปหลักฐานใบลา');
    }

    await (this.prisma as any).leaveAttachment.update({
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

  /**
   * ตัวกรองบริษัทของใบลา — ใบลาไม่มี companyId ตรง จึงกรองผ่าน employee
   *
   * ไฟล์แนบใบลามักเป็นใบรับรองแพทย์ซึ่งเป็นข้อมูลอ่อนไหว ถ้าไม่กรอง
   * ผู้ใช้ที่รู้ id ใบลาของบริษัทอื่นจะเปิดดู แนบไฟล์ และลบไฟล์ข้ามบริษัทได้
   * ตอบ 404 เหมือนไม่มีรายการ เพื่อไม่ยืนยันการมีอยู่ของใบลาที่ไม่มีสิทธิ์เห็น
   */
  private tenantFilter(scope: TenantScope) {
    return scope.level !== 'GLOBAL' && scope.companyId
      ? { employee: { is: { companyId: scope.companyId } } }
      : {};
  }

  private async ensureLeaveRequestExists(id: string, scope: TenantScope) {
    const request = await this.prisma.leaveRequest.findFirst({
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
      throw new NotFoundException('ไม่พบใบลา');
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
