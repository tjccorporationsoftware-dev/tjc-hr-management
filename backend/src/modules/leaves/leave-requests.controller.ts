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
import { diskStorage } from 'multer';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveRequestActionDto } from './dto/leave-request-action.dto';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { UploadLeaveAttachmentDto } from './dto/upload-leave-attachment.dto';
import {
  createLeaveAttachmentFileName,
  ensureLeaveAttachmentStorageDir,
  LEAVE_ATTACHMENT_MAX_FILE_SIZE,
  leaveAttachmentFileFilter,
  validateLeaveAttachmentFile,
} from './leave-attachment-storage.util';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveAttachmentService } from './services/leave-attachment.service';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import type { CurrentUserLike } from './types/leave.types';

type RequestWithParams = Request & {
  params: {
    id?: string;
  };
};

@Auth()
@Controller('leaves/requests')
export class LeaveRequestsController {
  /**
   * Controller นี้เป็นชั้น route ของใบลาเท่านั้น
   * ---------------------------------------------------------------------------
   * หน้าที่หลักคือรับ request จาก frontend แล้วส่งต่อให้ LeaveRequestsService
   * ไม่ควรใส่ business logic หนัก ๆ ใน controller เพื่อให้ดูแลรักษาง่าย
   *
   * ข้อสำคัญ: route เดิมต้องคงไว้ เพื่อไม่ให้ frontend / Approval Center พัง
   */
  constructor(
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly leaveAttachmentService: LeaveAttachmentService,
  ) {}

  /* -------------------------------------------------------------------------
   * SELF-SERVICE ROUTES
   * ใช้สำหรับพนักงานจัดการใบลาของตัวเอง
   * ต้องวางก่อน route :id เสมอ เพื่อไม่ให้คำว่า my ถูกตีความเป็น id
   * ---------------------------------------------------------------------- */

  @Get('my')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveRequest',
    description: 'ดูรายการใบลาของตนเอง',
  })
  findMy(
    @Query() query: ListLeaveRequestsQueryDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.findMy(query, currentUser);
  }

  @Get('my/:id')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveRequest',
    description: 'ดูรายละเอียดใบลาของตนเอง',
  })
  findMyOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.findMyOne(id, currentUser);
  }

  @Patch('my/:id')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveRequest',
    description: 'แก้ไขใบลาของตนเอง',
  })
  updateMy(
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.updateMy(id, dto, currentUser);
  }

  @Post('my/:id/submit')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveRequest',
    description: 'ส่งใบลาของตนเองเพื่อขออนุมัติ',
  })
  submitMy(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.submitMy(id, currentUser);
  }

  @Post('my/:id/cancel')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveRequest',
    description: 'ยกเลิกใบลาของตนเอง',
  })
  cancelMy(
    @Param('id') id: string,
    @Body() dto: LeaveRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.cancelMy(id, dto, currentUser);
  }

  /* -------------------------------------------------------------------------
   * APPROVAL ROUTES
   * ใช้สำหรับผู้อนุมัติหรือ Approval Center
   * ---------------------------------------------------------------------- */

  @Get('approvals/pending')
  @RequirePermissions('LEAVE_APPROVE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveRequest',
    description: 'ดูรายการใบลาที่รออนุมัติของผู้ใช้งาน',
  })
  findPendingApprovals(
    @Query() query: ListLeaveRequestsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.leaveRequestsService.findPendingApprovals(
      query,
      currentUser,
      currentUser.scope,
    );
  }

  /* -------------------------------------------------------------------------
   * ADMIN / HR ROUTES
   * ใช้สำหรับ HR, ผู้ดูแลระบบ หรือผู้มีสิทธิ์ดู/จัดการใบลาทั้งหมด
   * ---------------------------------------------------------------------- */

  @Get()
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveRequest',
    description: 'ดูรายการใบลา',
  })
  findAll(
    @Query() query: ListLeaveRequestsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.leaveRequestsService.findAll(query, currentUser.scope);
  }

  /* -------------------------------------------------------------------------
   * ATTACHMENT ROUTES (ฝั่ง HR / ผู้ดูแล)
   * ใช้ตอนยื่นใบลาแทนพนักงาน ซึ่งต้องแนบใบรับรองแพทย์ให้ครบก่อนส่งเข้าคิว
   * ฝั่งพนักงานยื่นเองใช้ /ess/leave-requests/:id/attachments แทน
   * ---------------------------------------------------------------------- */

  @Get(':id/attachments')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveAttachment',
    description: 'ดูไฟล์หลักฐานแนบใบลา',
  })
  findAttachments(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.leaveAttachmentService.findAttachments(id, currentUser.scope);
  }

  @Post(':id/attachments/upload')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'LeaveAttachment',
    description: 'อัปโหลดไฟล์หลักฐานแนบใบลา',
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
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadLeaveAttachmentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    validateLeaveAttachmentFile(file);

    return this.leaveAttachmentService.uploadAttachment(
      id,
      dto,
      file,
      currentUser.scope,
      currentUser.id,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('LEAVE_DELETE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'LeaveAttachment',
    description: 'ลบไฟล์หลักฐานแนบใบลา',
  })
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.leaveAttachmentService.removeAttachment(
      id,
      attachmentId,
      currentUser.scope,
    );
  }

  @Get(':id/attachments/:attachmentId/download')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'LeaveAttachment',
    description: 'เปิดหรือดาวน์โหลดหลักฐานแนบใบลา',
  })
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.leaveAttachmentService.getAttachmentFileForDownload(
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

  @Get(':id')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveRequest',
    description: 'ดูรายละเอียดใบลา',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.leaveRequestsService.findOne(id, currentUser.scope);
  }

  @Post()
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'LeaveRequest',
    description: 'สร้างใบลา',
  })
  create(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.leaveRequestsService.create(dto, currentUser, currentUser.scope);
  }

  @Patch(':id')
  @RequirePermissions('LEAVE_UPDATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveRequest',
    description: 'แก้ไขใบลา',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.leaveRequestsService.update(id, dto, currentUser.scope);
  }

  @Post(':id/submit')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveRequest',
    description: 'ส่งใบลาเพื่อขออนุมัติ',
  })
  submit(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.submit(id, currentUser);
  }

  @Post(':id/approve')
  @RequirePermissions('LEAVE_APPROVE')
  @Audit({
    action: AuditAction.APPROVE,
    entity: 'LeaveRequest',
    description: 'อนุมัติใบลา',
  })
  approve(
    @Param('id') id: string,
    @Body() dto: LeaveRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.approve(id, dto, currentUser);
  }

  @Post(':id/reject')
  @RequirePermissions('LEAVE_APPROVE')
  @Audit({
    action: AuditAction.REJECT,
    entity: 'LeaveRequest',
    description: 'ไม่อนุมัติใบลา',
  })
  reject(
    @Param('id') id: string,
    @Body() dto: LeaveRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.reject(id, dto, currentUser);
  }

  @Post(':id/cancel')
  @RequirePermissions('LEAVE_DELETE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveRequest',
    description: 'ยกเลิกใบลา',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: LeaveRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.cancel(id, dto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions('LEAVE_DELETE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'LeaveRequest',
    description: 'ลบ/ยกเลิกใบลา',
  })
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveRequestsService.remove(id, currentUser);
  }
}
