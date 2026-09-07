import { unlink } from 'node:fs/promises';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import type { Response } from 'express';
import { diskStorage } from 'multer';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { UploadLeaveAttachmentDto } from '../../leaves/dto/upload-leave-attachment.dto';
import {
  createLeaveAttachmentFileName,
  ensureLeaveAttachmentStorageDir,
  LEAVE_ATTACHMENT_MAX_FILE_SIZE,
  leaveAttachmentFileFilter,
  validateLeaveAttachmentFile,
} from '../../leaves/leave-attachment-storage.util';
import { LeaveRequestsService } from '../../leaves/leave-requests.service';
import { LeaveAttachmentService } from '../../leaves/services/leave-attachment.service';
import { UploadOvertimeAttachmentDto } from '../../overtime/dto/upload-overtime-attachment.dto';
import {
  createOvertimeAttachmentFileName,
  ensureOvertimeAttachmentStorageDir,
  OVERTIME_ATTACHMENT_MAX_FILE_SIZE,
  overtimeAttachmentFileFilter,
  validateOvertimeAttachmentFile,
} from '../../overtime/overtime-attachment-storage.util';
import { OvertimeRequestsService } from '../../overtime/overtime-requests.service';
import {
  createTimeAdjustAttachmentFileName,
  ensureTimeAdjustAttachmentStorageDir,
  TIME_ADJUST_ATTACHMENT_MAX_FILE_SIZE,
  timeAdjustAttachmentFileFilter,
  validateTimeAdjustAttachmentFile,
} from '../../time-adjust/time-adjust-attachment-storage.util';
import { UploadTimeAdjustAttachmentDto } from '../../time-adjust/dto/upload-time-adjust-attachment.dto';
import { TimeAdjustRequestsService } from '../../time-adjust/time-adjust-requests.service';
import { MobileIdempotencyService } from '../application/mobile-idempotency.service';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import { IdempotencyKey } from '../decorators/mobile-client.decorator';
import {
  MOBILE_API_PREFIX,
  MOBILE_IDEMPOTENCY_SCOPES,
} from '../mobile.constants';

/** ตรงกับที่ controller ฝั่งเว็บใช้ — multer ยังไม่ผ่าน validation ตอน destination ถูกเรียก */
type RequestWithParams = Request & { params: { id?: string } };

type DownloadFile = {
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
};

function sendAttachment(response: Response, file: DownloadFile) {
  response.setHeader('Content-Type', file.mimeType);
  response.setHeader('Content-Length', String(file.size));
  response.setHeader(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  );
  response.setHeader('Cache-Control', 'private, no-store');

  return response.sendFile(file.filePath);
}

/**
 * แนบหลักฐานในใบคำขอจากแอป
 *
 * แยกเป็นคนละ route ต่อประเภทเพราะแต่ละโมดูลมีที่เก็บไฟล์ ตัวกรองชนิดไฟล์
 * และเพดานขนาดของตัวเอง การรวมเป็น route เดียวแล้วเลือก config ตอน runtime
 * ทำไม่ได้ — FileInterceptor ผูก config ตั้งแต่ตอนประกาศ
 *
 * **ข้อสำคัญด้านสิทธิ์**: `uploadAttachment` ของ service เดิมค้นใบด้วย tenant scope
 * ซึ่งกว้างระดับบริษัท ไม่ใช่ "ของฉัน" ถ้าเรียกตรง ๆ พนักงานจะแนบไฟล์เข้าใบลา
 * ของเพื่อนร่วมบริษัทได้ ทุก route ที่นี่จึงเรียก `findMyOne` ก่อนเสมอ
 * ซึ่งจะโยน 404 ทันทีถ้าใบนั้นไม่ใช่ของผู้เรียก
 *
 * งานนอกสถานที่ไม่มี route ที่นี่ เพราะโมดูลนั้นเก็บหลักฐานเป็น `attachmentUrl`
 * ที่ส่งมาพร้อมตอนสร้างใบ ไม่ได้ใช้ระบบไฟล์แนบแบบเดียวกัน
 */
@Controller(`${MOBILE_API_PREFIX}/requests`)
export class MobileRequestAttachmentsController {
  constructor(
    private readonly leaveAttachmentService: LeaveAttachmentService,
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly overtimeRequestsService: OvertimeRequestsService,
    private readonly timeAdjustRequestsService: TimeAdjustRequestsService,
    private readonly idempotency: MobileIdempotencyService,
  ) {}

  /* ------------------------------------------------------------- ใบลา */

  @Get('leave/:id/attachments')
  @Auth('ESS_ACCESS', 'LEAVE_CREATE')
  async listLeaveAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.leaveRequestsService.findMyOne(id, user);

    return this.leaveAttachmentService.findAttachments(id, user.scope);
  }

  @Get('leave/:id/attachments/:attachmentId/download')
  @Auth('ESS_ACCESS', 'LEAVE_CREATE')
  async downloadLeaveAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    await this.leaveRequestsService.findMyOne(id, user);
    const file = await this.leaveAttachmentService.getAttachmentFileForDownload(
      id,
      attachmentId,
      user.scope,
    );

    return sendAttachment(response, file);
  }

  @Delete('leave/:id/attachments/:attachmentId')
  @MobileAuth('ESS_ACCESS', 'LEAVE_CREATE')
  async deleteLeaveAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'delete', attachmentId, id, type: 'LEAVE' },
      async () => {
        await this.leaveRequestsService.findMyOne(id, user);
        return this.leaveAttachmentService.removeAttachment(
          id,
          attachmentId,
          user.scope,
        );
      },
    );
  }

  @Post('leave/:id/attachments')
  @MobileAuth('ESS_ACCESS', 'LEAVE_CREATE')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: leaveAttachmentFileFilter,
      limits: { fileSize: LEAVE_ATTACHMENT_MAX_FILE_SIZE },
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          callback(null, ensureLeaveAttachmentStorageDir(req.params.id));
        },
        filename: (_req, file, callback) => {
          callback(null, createLeaveAttachmentFileName(file.originalname));
        },
      }),
    }),
  )
  async uploadLeaveAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadLeaveAttachmentDto,
    @IdempotencyKey() key: string | null,
  ) {
    validateLeaveAttachmentFile(file);
    return this.mutateUpload(
      user,
      key,
      { action: 'upload', dto, id, type: 'LEAVE' },
      file,
      async () => {
        await this.leaveRequestsService.findMyOne(id, user);
        return this.leaveAttachmentService.uploadAttachment(
          id,
          dto,
          file,
          user.scope,
          user.id,
        );
      },
    );
  }

  /* --------------------------------------------------------------- OT */

  @Get('overtime/:id/attachments')
  @Auth('ESS_ACCESS', 'OT_CREATE')
  async listOvertimeAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.overtimeRequestsService.findMyAttachments(id, user);
  }

  @Get('overtime/:id/attachments/:attachmentId/download')
  @Auth('ESS_ACCESS', 'OT_CREATE')
  async downloadOvertimeAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const file = await this.overtimeRequestsService.getMyAttachmentFileForDownload(
      id,
      attachmentId,
      user,
    );

    return sendAttachment(response, file);
  }

  @Delete('overtime/:id/attachments/:attachmentId')
  @MobileAuth('ESS_ACCESS', 'OT_CREATE')
  async deleteOvertimeAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'delete', attachmentId, id, type: 'OVERTIME' },
      async () => {
        await this.overtimeRequestsService.findMyOne(id, user);
        return this.overtimeRequestsService.removeAttachment(
          id,
          attachmentId,
          user.scope,
        );
      },
    );
  }

  @Post('overtime/:id/attachments')
  @MobileAuth('ESS_ACCESS', 'OT_CREATE')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: overtimeAttachmentFileFilter,
      limits: { fileSize: OVERTIME_ATTACHMENT_MAX_FILE_SIZE },
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          callback(null, ensureOvertimeAttachmentStorageDir(req.params.id));
        },
        filename: (_req, file, callback) => {
          callback(null, createOvertimeAttachmentFileName(file.originalname));
        },
      }),
    }),
  )
  async uploadOvertimeAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadOvertimeAttachmentDto,
    @IdempotencyKey() key: string | null,
  ) {
    validateOvertimeAttachmentFile(file);
    return this.mutateUpload(
      user,
      key,
      { action: 'upload', dto, id, type: 'OVERTIME' },
      file,
      async () => {
        await this.overtimeRequestsService.findMyOne(id, user);
        return this.overtimeRequestsService.uploadAttachment(
          id,
          dto,
          file,
          user.scope,
          user.id,
        );
      },
    );
  }

  /* --------------------------------------------------------- แก้เวลา */

  @Get('time-adjust/:id/attachments')
  @Auth('ESS_ACCESS', 'TIME_ADJUST_CREATE')
  async listTimeAdjustAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.timeAdjustRequestsService.findMyAttachments(id, user);
  }

  @Get('time-adjust/:id/attachments/:attachmentId/download')
  @Auth('ESS_ACCESS', 'TIME_ADJUST_CREATE')
  async downloadTimeAdjustAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const file =
      await this.timeAdjustRequestsService.getMyAttachmentFileForDownload(
        id,
        attachmentId,
        user,
      );

    return sendAttachment(response, file);
  }

  @Delete('time-adjust/:id/attachments/:attachmentId')
  @MobileAuth('ESS_ACCESS', 'TIME_ADJUST_CREATE')
  async deleteTimeAdjustAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'delete', attachmentId, id, type: 'TIME_ADJUST' },
      async () => {
        await this.timeAdjustRequestsService.findMyOne(id, user);
        return this.timeAdjustRequestsService.removeAttachment(
          id,
          attachmentId,
          user.scope,
        );
      },
    );
  }

  @Post('time-adjust/:id/attachments')
  @MobileAuth('ESS_ACCESS', 'TIME_ADJUST_CREATE')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: timeAdjustAttachmentFileFilter,
      limits: { fileSize: TIME_ADJUST_ATTACHMENT_MAX_FILE_SIZE },
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          callback(null, ensureTimeAdjustAttachmentStorageDir(req.params.id));
        },
        filename: (_req, file, callback) => {
          callback(null, createTimeAdjustAttachmentFileName(file.originalname));
        },
      }),
    }),
  )
  async uploadTimeAdjustAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadTimeAdjustAttachmentDto,
    @IdempotencyKey() key: string | null,
  ) {
    validateTimeAdjustAttachmentFile(file);
    return this.mutateUpload(
      user,
      key,
      { action: 'upload', dto, id, type: 'TIME_ADJUST' },
      file,
      async () => {
        await this.timeAdjustRequestsService.findMyOne(id, user);
        return this.timeAdjustRequestsService.uploadAttachment(
          id,
          dto,
          file,
          user.scope,
          user.id,
        );
      },
    );
  }

  private mutate<T>(
    user: AuthenticatedUser,
    key: string | null,
    requestPayload: unknown,
    handler: () => Promise<T>,
  ) {
    return this.idempotency.executeOptional({
      handler,
      key,
      requestPayload,
      scope: MOBILE_IDEMPOTENCY_SCOPES.requestAttachmentMutation,
      userId: user.id,
    });
  }

  private mutateUpload<T>(
    user: AuthenticatedUser,
    key: string | null,
    requestPayload: Record<string, unknown>,
    file: Express.Multer.File,
    handler: () => Promise<T>,
  ) {
    return this.idempotency.executeOptional({
      handler,
      key,
      requestPayload: {
        ...requestPayload,
        file: {
          mimetype: file.mimetype,
          originalname: file.originalname,
          size: file.size,
        },
      },
      responseStatus: 201,
      scope: MOBILE_IDEMPOTENCY_SCOPES.requestAttachmentMutation,
      userId: user.id,
      onReusedKey: () => this.cleanupUploadedFile(file),
    });
  }

  private async cleanupUploadedFile(file: Express.Multer.File) {
    if (!file?.path) return;
    await unlink(file.path).catch(() => undefined);
  }

}
