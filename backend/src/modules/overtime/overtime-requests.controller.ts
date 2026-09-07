import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { diskStorage } from 'multer';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { ListOvertimeRequestsQueryDto } from './dto/list-overtime-requests-query.dto';
import { OvertimeDayTypeQueryDto } from './dto/overtime-day-type-query.dto';
import { OvertimeRequestActionDto } from './dto/overtime-request-action.dto';
import { UpdateOvertimeRequestDto } from './dto/update-overtime-request.dto';
import { UploadOvertimeAttachmentDto } from './dto/upload-overtime-attachment.dto';

import { OvertimeRequestsService } from './overtime-requests.service';
import {
  createOvertimeAttachmentFileName,
  ensureOvertimeAttachmentStorageDir,
  overtimeAttachmentFileFilter,
  OVERTIME_ATTACHMENT_MAX_FILE_SIZE,
  validateOvertimeAttachmentFile,
} from './overtime-attachment-storage.util';

type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
};

/** ผู้เรียกที่ต้องใช้ทั้งรหัสผู้ใช้และขอบเขตบริษัท */
type ScopedActor = CurrentUserLike &
  Pick<
    import('../../common/interfaces/authenticated-user.interface').AuthenticatedUser,
    'scope'
  >;

type ScopedUser = Pick<
  import('../../common/interfaces/authenticated-user.interface').AuthenticatedUser,
  'scope'
>;

type RequestWithParams = Request & {
  params: {
    id?: string;
  };
};

@Auth()
@Controller('overtime/requests')
export class OvertimeRequestsController {
  constructor(
    private readonly overtimeRequestsService: OvertimeRequestsService,
  ) {}

  /*
   * =========================================================
   * SELF-SERVICE ROUTES
   * ต้องวางก่อน :id เสมอ ไม่อย่างนั้นคำว่า my จะถูกมองเป็น id
   * ใช้สำหรับหน้า /overtime ของพนักงานทั่วไป
   * =========================================================
   */

  @Get('my')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimeRequest',
    description: 'ดูรายการคำขอ OT ของตนเอง',
  })
  findMy(
    @Query() query: ListOvertimeRequestsQueryDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.findMy(query, currentUser);
  }

  @Get('my/day-type')
  @RequirePermissions('OT_CREATE')
  dayTypeForMe(
    @Query() query: OvertimeDayTypeQueryDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.overtimeRequestsService.previewDayType(
      { workDate: query.workDate },
      currentUser,
      currentUser.scope,
    );
  }

  @Get('my/:id')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimeRequest',
    description: 'ดูรายละเอียดคำขอ OT ของตนเอง',
  })
  findMyOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.findMyOne(id, currentUser);
  }

  @Get('my/:id/attachments')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimeAttachment',
    description: 'ดูไฟล์หลักฐานคำขอ OT ของตนเอง',
  })
  findMyAttachments(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.findMyAttachments(id, currentUser);
  }

  @Post('my/:id/attachments/upload')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'OvertimeAttachment',
    description: 'อัปโหลดไฟล์หลักฐานคำขอ OT ของตนเอง',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          const dir = ensureOvertimeAttachmentStorageDir(req.params.id);
          callback(null, dir);
        },
        filename: (_req, file, callback) => {
          callback(null, createOvertimeAttachmentFileName(file.originalname));
        },
      }),
      fileFilter: overtimeAttachmentFileFilter,
      limits: {
        fileSize: OVERTIME_ATTACHMENT_MAX_FILE_SIZE,
      },
    }),
  )
  uploadMyAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadOvertimeAttachmentDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    validateOvertimeAttachmentFile(file);

    return this.overtimeRequestsService.uploadMyAttachment(
      id,
      dto,
      file,
      currentUser,
    );
  }

  @Get('my/:id/attachments/:attachmentId/download')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'OvertimeAttachment',
    description: 'เปิดหรือดาวน์โหลดไฟล์หลักฐานคำขอ OT ของตนเอง',
  })
  async downloadMyAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: CurrentUserLike,
    @Res() response: Response,
  ) {
    const file =
      await this.overtimeRequestsService.getMyAttachmentFileForDownload(
        id,
        attachmentId,
        currentUser,
      );

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');

    return response.sendFile(file.filePath);
  }

  @Delete('my/:id/attachments/:attachmentId')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'OvertimeAttachment',
    description: 'ลบไฟล์หลักฐานคำขอ OT ของตนเอง',
  })
  removeMyAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.removeMyAttachment(
      id,
      attachmentId,
      currentUser,
    );
  }

  @Patch('my/:id')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimeRequest',
    description: 'แก้ไขคำขอ OT ของตนเอง',
  })
  updateMy(
    @Param('id') id: string,
    @Body() dto: UpdateOvertimeRequestDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.updateMy(id, dto, currentUser);
  }

  @Post('my/:id/submit')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimeRequest',
    description: 'ส่งคำขอ OT ของตนเองเพื่อขออนุมัติ',
  })
  submitMy(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.submitMy(id, currentUser);
  }

  @Post('my/:id/cancel')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimeRequest',
    description: 'ยกเลิกคำขอ OT ของตนเอง',
  })
  cancelMy(
    @Param('id') id: string,
    @Body() dto: OvertimeRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.cancelMy(id, dto, currentUser);
  }

  /*
   * =========================================================
   * ADMIN / APPROVER ROUTES
   * สำหรับฝ่าย HR / ผู้อนุมัติ / ผู้ดูแลระบบ
   * =========================================================
   */

  @Get()
  @RequirePermissions('OT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimeRequest',
    description: 'ดูรายการคำขอ OT',
  })
  findAll(
    @Query() query: ListOvertimeRequestsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimeRequestsService.findAll(query, currentUser.scope);
  }

  @Get('day-type')
  @RequirePermissions('OT_CREATE')
  dayType(
    @Query() query: OvertimeDayTypeQueryDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.overtimeRequestsService.previewDayType(
      query,
      currentUser,
      currentUser.scope,
    );
  }

  @Get(':id')
  @RequirePermissions('OT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimeRequest',
    description: 'ดูรายละเอียดคำขอ OT',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimeRequestsService.findOne(id, currentUser.scope);
  }

  @Get(':id/attachments')
  @RequirePermissions('OT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OvertimeAttachment',
    description: 'ดูไฟล์หลักฐานคำขอ OT',
  })
  findAttachments(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimeRequestsService.findAttachments(id, currentUser.scope);
  }

  @Post(':id/attachments/upload')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'OvertimeAttachment',
    description: 'อัปโหลดไฟล์หลักฐานคำขอ OT',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          const dir = ensureOvertimeAttachmentStorageDir(req.params.id);
          callback(null, dir);
        },
        filename: (_req, file, callback) => {
          callback(null, createOvertimeAttachmentFileName(file.originalname));
        },
      }),
      fileFilter: overtimeAttachmentFileFilter,
      limits: {
        fileSize: OVERTIME_ATTACHMENT_MAX_FILE_SIZE,
      },
    }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadOvertimeAttachmentDto,
    @CurrentUser() currentUser: ScopedActor,
  ) {
    validateOvertimeAttachmentFile(file);

    return this.overtimeRequestsService.uploadAttachment(
      id,
      dto,
      file,
      currentUser.scope,
      currentUser.userId ?? currentUser.id,
    );
  }

  @Get(':id/attachments/:attachmentId/download')
  @RequirePermissions('OT_READ')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'OvertimeAttachment',
    description: 'เปิดหรือดาวน์โหลดไฟล์หลักฐานคำขอ OT',
  })
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file =
      await this.overtimeRequestsService.getAttachmentFileForDownload(
        id,
        attachmentId,
        currentUser.scope,
      );

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');

    return response.sendFile(file.filePath);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('OT_DELETE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'OvertimeAttachment',
    description: 'ลบไฟล์หลักฐานคำขอ OT',
  })
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimeRequestsService.removeAttachment(
      id,
      attachmentId,
      currentUser.scope,
    );
  }

  @Post()
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OvertimeRequest',
    description: 'สร้างคำขอ OT',
  })
  create(
    @Body() dto: CreateOvertimeRequestDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.overtimeRequestsService.create(
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Patch(':id')
  @RequirePermissions('OT_UPDATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimeRequest',
    description: 'แก้ไขคำขอ OT',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOvertimeRequestDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.overtimeRequestsService.update(id, dto, currentUser.scope);
  }

  @Post(':id/submit')
  @RequirePermissions('OT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimeRequest',
    description: 'ส่งคำขอ OT เพื่อขออนุมัติ',
  })
  submit(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.submit(id, currentUser);
  }

  @Post(':id/approve')
  @RequirePermissions('OT_APPROVE')
  @Audit({
    action: AuditAction.APPROVE,
    entity: 'OvertimeRequest',
    description: 'อนุมัติคำขอ OT',
  })
  approve(
    @Param('id') id: string,
    @Body() dto: OvertimeRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.approve(id, dto, currentUser);
  }

  @Post(':id/reject')
  @RequirePermissions('OT_APPROVE')
  @Audit({
    action: AuditAction.REJECT,
    entity: 'OvertimeRequest',
    description: 'ไม่อนุมัติคำขอ OT',
  })
  reject(
    @Param('id') id: string,
    @Body() dto: OvertimeRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.reject(id, dto, currentUser);
  }

  @Post(':id/cancel')
  @RequirePermissions('OT_DELETE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OvertimeRequest',
    description: 'ยกเลิกคำขอ OT',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: OvertimeRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.cancel(id, dto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions('OT_DELETE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'OvertimeRequest',
    description: 'ลบ/ยกเลิกคำขอ OT',
  })
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.overtimeRequestsService.remove(id, currentUser);
  }
}