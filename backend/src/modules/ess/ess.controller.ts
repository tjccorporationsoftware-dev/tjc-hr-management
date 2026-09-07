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

import { EssService } from './ess.service';
import { EssListQueryDto } from './dto/ess-list-query.dto';
import { EssYearQueryDto } from './dto/ess-year-query.dto';

import { CreateLeaveRequestDto } from '../leaves/dto/create-leave-request.dto';
import { LeaveRequestActionDto } from '../leaves/dto/leave-request-action.dto';
import { UpdateLeaveRequestDto } from '../leaves/dto/update-leave-request.dto';
import { UploadLeaveAttachmentDto } from '../leaves/dto/upload-leave-attachment.dto';

import {
  createLeaveAttachmentFileName,
  ensureLeaveAttachmentStorageDir,
  leaveAttachmentFileFilter,
  LEAVE_ATTACHMENT_MAX_FILE_SIZE,
  validateLeaveAttachmentFile,
} from '../leaves/leave-attachment-storage.util';

import { CreateOvertimeRequestDto } from '../overtime/dto/create-overtime-request.dto';
import { OvertimeDayTypeQueryDto } from '../overtime/dto/overtime-day-type-query.dto';
import { OvertimeRequestActionDto } from '../overtime/dto/overtime-request-action.dto';
import { UpdateOvertimeRequestDto } from '../overtime/dto/update-overtime-request.dto';
import { UploadOvertimeAttachmentDto } from '../overtime/dto/upload-overtime-attachment.dto';
import {
  createOvertimeAttachmentFileName,
  ensureOvertimeAttachmentStorageDir,
  overtimeAttachmentFileFilter,
  OVERTIME_ATTACHMENT_MAX_FILE_SIZE,
  validateOvertimeAttachmentFile,
} from '../overtime/overtime-attachment-storage.util';

import { CreateTimeAdjustRequestDto } from '../time-adjust/dto/create-time-adjust-request.dto';
import { TimeAdjustRequestActionDto } from '../time-adjust/dto/time-adjust-request-action.dto';
import { UpdateTimeAdjustRequestDto } from '../time-adjust/dto/update-time-adjust-request.dto';
import { UploadTimeAdjustAttachmentDto } from '../time-adjust/dto/upload-time-adjust-attachment.dto';
import {
  createTimeAdjustAttachmentFileName,
  ensureTimeAdjustAttachmentStorageDir,
  timeAdjustAttachmentFileFilter,
  TIME_ADJUST_ATTACHMENT_MAX_FILE_SIZE,
  validateTimeAdjustAttachmentFile,
} from '../time-adjust/time-adjust-attachment-storage.util';

type CurrentUserPayload = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

type RequestWithParams = Request & {
  params: {
    id?: string;
  };
};

@Controller('ess')
@Auth()
@RequirePermissions('ESS_ACCESS')
export class EssController {
  constructor(private readonly essService: EssService) {}

  @Get('me')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESS',
    description: 'ดูข้อมูลพนักงานของตนเองใน ESS',
  })
  getMe(@CurrentUser() currentUser: CurrentUserPayload) {
    return this.essService.getMe(currentUser);
  }

  @Get('dashboard')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSDashboard',
    description: 'ดูหน้า Dashboard ของ ESS',
  })
  getDashboard(@CurrentUser() currentUser: CurrentUserPayload) {
    return this.essService.getDashboard(currentUser);
  }

  @Get('attendance')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSAttendance',
    description: 'ดูประวัติลงเวลาของตนเอง',
  })
  getMyAttendance(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: EssListQueryDto,
  ) {
    return this.essService.getMyAttendance(currentUser, query);
  }

  @Get('leave-balances')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSLeaveBalance',
    description: 'ดูสิทธิวันลาของตนเอง',
  })
  getMyLeaveBalances(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: EssYearQueryDto,
  ) {
    return this.essService.getMyLeaveBalances(currentUser, query);
  }

  @Get('leave-requests')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSLeaveRequest',
    description: 'ดูคำขอลาของตนเอง',
  })
  getMyLeaveRequests(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: EssListQueryDto,
  ) {
    return this.essService.getMyLeaveRequests(currentUser, query);
  }

  @Get('overtime-requests')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSOvertimeRequest',
    description: 'ดูคำขอ OT ของตนเอง',
  })
  getMyOvertimeRequests(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: EssListQueryDto,
  ) {
    return this.essService.getMyOvertimeRequests(currentUser, query);
  }

  /* วางก่อน :id ทุกเส้น เพื่อไม่ให้ day-type ถูกอ่านเป็นรหัสใบ */
  @Get('overtime-requests/day-type')
  getMyOvertimeDayType(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: OvertimeDayTypeQueryDto,
  ) {
    return this.essService.getMyOvertimeDayType(currentUser, query.workDate);
  }

  @Get('time-adjust-requests')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSTimeAdjustRequest',
    description: 'ดูคำขอแก้เวลาของตนเอง',
  })
  getMyTimeAdjustRequests(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: EssListQueryDto,
  ) {
    return this.essService.getMyTimeAdjustRequests(currentUser, query);
  }

  @Post('leave-requests')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'ESSLeaveRequest',
    description: 'พนักงานสร้างใบลาของตนเองผ่าน ESS',
  })
  createMyLeaveRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.essService.createMyLeaveRequest(currentUser, dto);
  }

  @Post('leave-requests/:id/submit')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSLeaveRequest',
    description: 'พนักงานส่งใบลาของตนเองเพื่อขออนุมัติผ่าน ESS',
  })
  submitMyLeaveRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.submitMyLeaveRequest(currentUser, id);
  }

  @Post('leave-requests/:id/cancel')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSLeaveRequest',
    description: 'พนักงานยกเลิกใบลาของตนเองผ่าน ESS',
  })
  cancelMyLeaveRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: LeaveRequestActionDto,
  ) {
    return this.essService.cancelMyLeaveRequest(currentUser, id, dto);
  }

  @Patch('leave-requests/:id')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSLeaveRequest',
    description: 'พนักงานแก้ไขใบลาของตนเองผ่าน ESS',
  })
  updateMyLeaveRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
  ) {
    return this.essService.updateMyLeaveRequest(currentUser, id, dto);
  }

  @Delete('leave-requests/:id')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'ESSLeaveRequest',
    description: 'พนักงานลบใบลาของตนเองผ่าน ESS',
  })
  deleteMyLeaveRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.deleteMyLeaveRequest(currentUser, id);
  }

  @Get('leave-requests/:id/attachments')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSLeaveAttachment',
    description: 'พนักงานดูรูปหลักฐานใบลาของตนเองผ่าน ESS',
  })
  findMyLeaveAttachments(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.findMyLeaveAttachments(currentUser, id);
  }

  @Post('leave-requests/:id/attachments/upload')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'ESSLeaveAttachment',
    description: 'พนักงานอัปโหลดรูปหลักฐานใบลาของตนเองผ่าน ESS',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          const dir = ensureLeaveAttachmentStorageDir(req.params.id);
          callback(null, dir);
        },
        filename: (_req, file, callback) => {
          callback(null, createLeaveAttachmentFileName(file.originalname));
        },
      }),
      fileFilter: leaveAttachmentFileFilter,
      limits: {
        fileSize: LEAVE_ATTACHMENT_MAX_FILE_SIZE,
      },
    }),
  )
  uploadMyLeaveAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadLeaveAttachmentDto,
  ) {
    validateLeaveAttachmentFile(file);

    return this.essService.uploadMyLeaveAttachment(
      currentUser,
      id,
      dto,
      file,
    );
  }

  @Get('leave-requests/:id/attachments/:attachmentId/download')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'ESSLeaveAttachment',
    description: 'พนักงานเปิดหรือดาวน์โหลดรูปหลักฐานใบลาของตนเองผ่าน ESS',
  })
  async downloadMyLeaveAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const file = await this.essService.getMyLeaveAttachmentFileForDownload(
      currentUser,
      id,
      attachmentId,
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

  @Delete('leave-requests/:id/attachments/:attachmentId')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'ESSLeaveAttachment',
    description: 'พนักงานลบรูปหลักฐานใบลาของตนเองผ่าน ESS',
  })
  removeMyLeaveAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.essService.removeMyLeaveAttachment(
      currentUser,
      id,
      attachmentId,
    );
  }

  @Post('overtime-requests')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'ESSOvertimeRequest',
    description: 'พนักงานสร้างคำขอ OT ของตนเองผ่าน ESS',
  })
  createMyOvertimeRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Body() dto: CreateOvertimeRequestDto,
  ) {
    return this.essService.createMyOvertimeRequest(currentUser, dto);
  }

  @Post('overtime-requests/:id/submit')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSOvertimeRequest',
    description: 'พนักงานส่งคำขอ OT ของตนเองเพื่อขออนุมัติผ่าน ESS',
  })
  submitMyOvertimeRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.submitMyOvertimeRequest(currentUser, id);
  }

  @Post('overtime-requests/:id/cancel')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSOvertimeRequest',
    description: 'พนักงานยกเลิกคำขอ OT ของตนเองผ่าน ESS',
  })
  cancelMyOvertimeRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: OvertimeRequestActionDto,
  ) {
    return this.essService.cancelMyOvertimeRequest(currentUser, id, dto);
  }

  @Patch('overtime-requests/:id')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSOvertimeRequest',
    description: 'พนักงานแก้ไขคำขอ OT ของตนเองผ่าน ESS',
  })
  updateMyOvertimeRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateOvertimeRequestDto,
  ) {
    return this.essService.updateMyOvertimeRequest(currentUser, id, dto);
  }

  @Delete('overtime-requests/:id')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'ESSOvertimeRequest',
    description: 'พนักงานลบคำขอ OT ของตนเองผ่าน ESS',
  })
  deleteMyOvertimeRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.deleteMyOvertimeRequest(currentUser, id);
  }

  @Get('overtime-requests/:id/attachments')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSOvertimeAttachment',
    description: 'พนักงานดูไฟล์แนบคำขอ OT ของตนเองผ่าน ESS',
  })
  findMyOvertimeAttachments(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.findMyOvertimeAttachments(currentUser, id);
  }

  @Post('overtime-requests/:id/attachments/upload')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'ESSOvertimeAttachment',
    description: 'พนักงานอัปโหลดไฟล์แนบคำขอ OT ของตนเองผ่าน ESS',
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
  uploadMyOvertimeAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadOvertimeAttachmentDto,
  ) {
    validateOvertimeAttachmentFile(file);

    return this.essService.uploadMyOvertimeAttachment(
      currentUser,
      id,
      dto,
      file,
    );
  }

  @Get('overtime-requests/:id/attachments/:attachmentId/download')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'ESSOvertimeAttachment',
    description: 'พนักงานเปิดหรือดาวน์โหลดไฟล์แนบคำขอ OT ของตนเองผ่าน ESS',
  })
  async downloadMyOvertimeAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const file = await this.essService.getMyOvertimeAttachmentFileForDownload(
      currentUser,
      id,
      attachmentId,
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

  @Delete('overtime-requests/:id/attachments/:attachmentId')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'ESSOvertimeAttachment',
    description: 'พนักงานลบไฟล์แนบคำขอ OT ของตนเองผ่าน ESS',
  })
  removeMyOvertimeAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.essService.removeMyOvertimeAttachment(
      currentUser,
      id,
      attachmentId,
    );
  }

  @Post('time-adjust-requests')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'ESSTimeAdjustRequest',
    description: 'พนักงานสร้างคำขอแก้เวลาของตนเองผ่าน ESS',
  })
  createMyTimeAdjustRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Body() dto: CreateTimeAdjustRequestDto,
  ) {
    return this.essService.createMyTimeAdjustRequest(currentUser, dto);
  }

  @Post('time-adjust-requests/:id/submit')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSTimeAdjustRequest',
    description: 'พนักงานส่งคำขอแก้เวลาของตนเองเพื่อขออนุมัติผ่าน ESS',
  })
  submitMyTimeAdjustRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.submitMyTimeAdjustRequest(currentUser, id);
  }

  @Post('time-adjust-requests/:id/cancel')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSTimeAdjustRequest',
    description: 'พนักงานยกเลิกคำขอแก้เวลาของตนเองผ่าน ESS',
  })
  cancelMyTimeAdjustRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: TimeAdjustRequestActionDto,
  ) {
    return this.essService.cancelMyTimeAdjustRequest(currentUser, id, dto);
  }

  @Patch('time-adjust-requests/:id')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ESSTimeAdjustRequest',
    description: 'พนักงานแก้ไขคำขอแก้เวลาของตนเองผ่าน ESS',
  })
  updateMyTimeAdjustRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTimeAdjustRequestDto,
  ) {
    return this.essService.updateMyTimeAdjustRequest(currentUser, id, dto);
  }

  @Delete('time-adjust-requests/:id')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'ESSTimeAdjustRequest',
    description: 'พนักงานลบคำขอแก้เวลาของตนเองผ่าน ESS',
  })
  deleteMyTimeAdjustRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.deleteMyTimeAdjustRequest(currentUser, id);
  }

  @Get('time-adjust-requests/:id/attachments')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSTimeAdjustAttachment',
    description: 'พนักงานดูไฟล์แนบคำขอแก้เวลาของตนเองผ่าน ESS',
  })
  findMyTimeAdjustAttachments(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.essService.findMyTimeAdjustAttachments(currentUser, id);
  }

  @Post('time-adjust-requests/:id/attachments/upload')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'ESSTimeAdjustAttachment',
    description: 'พนักงานอัปโหลดไฟล์แนบคำขอแก้เวลาของตนเองผ่าน ESS',
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
  uploadMyTimeAdjustAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadTimeAdjustAttachmentDto,
  ) {
    validateTimeAdjustAttachmentFile(file);

    return this.essService.uploadMyTimeAdjustAttachment(
      currentUser,
      id,
      dto,
      file,
    );
  }

  @Get('time-adjust-requests/:id/attachments/:attachmentId/download')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'ESSTimeAdjustAttachment',
    description: 'พนักงานเปิดหรือดาวน์โหลดไฟล์แนบคำขอแก้เวลาของตนเองผ่าน ESS',
  })
  async downloadMyTimeAdjustAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const file =
      await this.essService.getMyTimeAdjustAttachmentFileForDownload(
        currentUser,
        id,
        attachmentId,
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

  @Delete('time-adjust-requests/:id/attachments/:attachmentId')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'ESSTimeAdjustAttachment',
    description: 'พนักงานลบไฟล์แนบคำขอแก้เวลาของตนเองผ่าน ESS',
  })
  removeMyTimeAdjustAttachment(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.essService.removeMyTimeAdjustAttachment(
      currentUser,
      id,
      attachmentId,
    );
  }
}