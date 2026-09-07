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
import { CreateTimeAdjustRequestDto } from './dto/create-time-adjust-request.dto';
import { ListTimeAdjustRequestsQueryDto } from './dto/list-time-adjust-requests-query.dto';
import { TimeAdjustRequestActionDto } from './dto/time-adjust-request-action.dto';
import { UpdateTimeAdjustRequestDto } from './dto/update-time-adjust-request.dto';
import { UploadTimeAdjustAttachmentDto } from './dto/upload-time-adjust-attachment.dto';
import { TimeAdjustRequestsService } from './time-adjust-requests.service';
import {
  createTimeAdjustAttachmentFileName,
  ensureTimeAdjustAttachmentStorageDir,
  timeAdjustAttachmentFileFilter,
  TIME_ADJUST_ATTACHMENT_MAX_FILE_SIZE,
  validateTimeAdjustAttachmentFile,
} from './time-adjust-attachment-storage.util';

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
@Controller('time-adjust/requests')
export class TimeAdjustRequestsController {
  constructor(
    private readonly timeAdjustRequestsService: TimeAdjustRequestsService,
  ) {}

  @Get()
  @RequirePermissions('TIME_ADJUST_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'TimeAdjustRequest',
    description: 'ดูรายการคำขอแก้เวลา',
  })
  findAll(
    @Query() query: ListTimeAdjustRequestsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.timeAdjustRequestsService.findAll(query, currentUser.scope);
  }

   @Get('my')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'TimeAdjustRequest',
    description: 'ดูรายการคำขอแก้เวลาของตนเอง',
  })
  findMy(
    @Query() query: ListTimeAdjustRequestsQueryDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.findMy(query, currentUser);
  }

  @Get('my/attendance-logs')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'AttendanceLog',
    description: 'ดูรายการลงเวลาของตนเองสำหรับคำขอแก้เวลา',
  })
  findMyAttendanceLogs(
    @Query() query: ListTimeAdjustRequestsQueryDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.findMyAttendanceLogs(
      query,
      currentUser,
    );
  }

  @Post('my')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'TimeAdjustRequest',
    description: 'สร้างคำขอแก้เวลาของตนเอง',
  })
  createMy(
    @Body() dto: CreateTimeAdjustRequestDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.createMy(dto, currentUser);
  }

  @Get('my/:id')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'TimeAdjustRequest',
    description: 'ดูรายละเอียดคำขอแก้เวลาของตนเอง',
  })
  findMyOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.findMyOne(id, currentUser);
  }

  @Patch('my/:id')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'TimeAdjustRequest',
    description: 'แก้ไขคำขอแก้เวลาของตนเอง',
  })
  updateMy(
    @Param('id') id: string,
    @Body() dto: UpdateTimeAdjustRequestDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.updateMy(id, dto, currentUser);
  }

  @Post('my/:id/submit')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'TimeAdjustRequest',
    description: 'ส่งคำขอแก้เวลาของตนเองเพื่อขออนุมัติ',
  })
  submitMy(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.submitMy(id, currentUser);
  }

  @Post('my/:id/cancel')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'TimeAdjustRequest',
    description: 'ยกเลิกคำขอแก้เวลาของตนเอง',
  })
  cancelMy(
    @Param('id') id: string,
    @Body() dto: TimeAdjustRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.cancelMy(id, dto, currentUser);
  }

  @Get('my/:id/attachments')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'TimeAdjustAttachment',
    description: 'ดูไฟล์หลักฐานคำขอแก้เวลาของตนเอง',
  })
  findMyAttachments(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.findMyAttachments(id, currentUser);
  }

  @Post('my/:id/attachments/upload')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'TimeAdjustAttachment',
    description: 'อัปโหลดไฟล์หลักฐานคำขอแก้เวลาของตนเอง',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          const dir = ensureTimeAdjustAttachmentStorageDir(req.params.id);
          callback(null, dir);
        },
        filename: (_req, file, callback) => {
          callback(null, createTimeAdjustAttachmentFileName(file.originalname));
        },
      }),
      fileFilter: timeAdjustAttachmentFileFilter,
      limits: {
        fileSize: TIME_ADJUST_ATTACHMENT_MAX_FILE_SIZE,
      },
    }),
  )
  uploadMyAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadTimeAdjustAttachmentDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    validateTimeAdjustAttachmentFile(file);

    return this.timeAdjustRequestsService.uploadMyAttachment(
      id,
      dto,
      file,
      currentUser,
    );
  }

  @Get('my/:id/attachments/:attachmentId/download')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'TimeAdjustAttachment',
    description: 'เปิดหรือดาวน์โหลดไฟล์หลักฐานคำขอแก้เวลาของตนเอง',
  })
  async downloadMyAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: CurrentUserLike,
    @Res() response: Response,
  ) {
    const file =
      await this.timeAdjustRequestsService.getMyAttachmentFileForDownload(
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
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'TimeAdjustAttachment',
    description: 'ลบไฟล์หลักฐานคำขอแก้เวลาของตนเอง',
  })
  removeMyAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.removeMyAttachment(
      id,
      attachmentId,
      currentUser,
    );
  }

  @Get(':id')
  @RequirePermissions('TIME_ADJUST_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'TimeAdjustRequest',
    description: 'ดูรายละเอียดคำขอแก้เวลา',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.timeAdjustRequestsService.findOne(id, currentUser.scope);
  }

  @Post()
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'TimeAdjustRequest',
    description: 'สร้างคำขอแก้เวลา',
  })
  create(
    @Body() dto: CreateTimeAdjustRequestDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.timeAdjustRequestsService.create(
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Patch(':id')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'TimeAdjustRequest',
    description: 'แก้ไขคำขอแก้เวลา',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimeAdjustRequestDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.timeAdjustRequestsService.update(id, dto, currentUser.scope);
  }

  @Post(':id/submit')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'TimeAdjustRequest',
    description: 'ส่งคำขอแก้เวลาเพื่อขออนุมัติ',
  })
  submit(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.submit(id, currentUser);
  }

  @Post(':id/approve')
  @RequirePermissions('TIME_ADJUST_APPROVE')
  @Audit({
    action: AuditAction.APPROVE,
    entity: 'TimeAdjustRequest',
    description: 'อนุมัติคำขอแก้เวลา',
  })
  approve(
    @Param('id') id: string,
    @Body() dto: TimeAdjustRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.approve(id, dto, currentUser);
  }

  @Post(':id/reject')
  @RequirePermissions('TIME_ADJUST_APPROVE')
  @Audit({
    action: AuditAction.REJECT,
    entity: 'TimeAdjustRequest',
    description: 'ไม่อนุมัติคำขอแก้เวลา',
  })
  reject(
    @Param('id') id: string,
    @Body() dto: TimeAdjustRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.reject(id, dto, currentUser);
  }

  @Post(':id/cancel')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'TimeAdjustRequest',
    description: 'ยกเลิกคำขอแก้เวลา',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: TimeAdjustRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.timeAdjustRequestsService.cancel(id, dto, currentUser);
  }

  @Get(':id/attachments')
  @RequirePermissions('TIME_ADJUST_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'TimeAdjustAttachment',
    description: 'ดูไฟล์หลักฐานคำขอแก้เวลา',
  })
  findAttachments(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.timeAdjustRequestsService.findAttachments(
      id,
      currentUser.scope,
    );
  }

  @Post(':id/attachments/upload')
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'TimeAdjustAttachment',
    description: 'อัปโหลดไฟล์หลักฐานคำขอแก้เวลา',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          const dir = ensureTimeAdjustAttachmentStorageDir(req.params.id);
          callback(null, dir);
        },
        filename: (_req, file, callback) => {
          callback(null, createTimeAdjustAttachmentFileName(file.originalname));
        },
      }),
      fileFilter: timeAdjustAttachmentFileFilter,
      limits: {
        fileSize: TIME_ADJUST_ATTACHMENT_MAX_FILE_SIZE,
      },
    }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadTimeAdjustAttachmentDto,
    @CurrentUser() currentUser: ScopedActor,
  ) {
    validateTimeAdjustAttachmentFile(file);

    return this.timeAdjustRequestsService.uploadAttachment(
      id,
      dto,
      file,
      currentUser.scope,
      currentUser.userId ?? currentUser.id,
    );
  }

  @Get(':id/attachments/:attachmentId/download')
  @RequirePermissions('TIME_ADJUST_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'TimeAdjustAttachment',
    description: 'เปิดหรือดาวน์โหลดไฟล์หลักฐานคำขอแก้เวลา',
  })
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file =
      await this.timeAdjustRequestsService.getAttachmentFileForDownload(
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
  @RequirePermissions('TIME_ADJUST_CREATE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'TimeAdjustAttachment',
    description: 'ลบไฟล์หลักฐานคำขอแก้เวลา',
  })
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.timeAdjustRequestsService.removeAttachment(
      id,
      attachmentId,
      currentUser.scope,
    );
  }
}