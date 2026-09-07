import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ApprovalsService } from '../../approvals/approvals.service';
import { DocumentWorkflowService } from '../../document-workflow/document-workflow.service';
import { MobileIdempotencyService } from '../application/mobile-idempotency.service';
import { ApprovalActionDto } from '../../approvals/dto/approval-action.dto';
import { LeaveAttachmentService } from '../../leaves/services/leave-attachment.service';
import { OvertimeRequestsService } from '../../overtime/overtime-requests.service';
import { TimeAdjustRequestsService } from '../../time-adjust/time-adjust-requests.service';
import { MobileApprovalListQueryDto } from '../dto/mobile-approval.dto';
import {
  toMobileApprovalDetail,
  toMobileApprovalListItem,
} from '../mappers/mobile-approval.mapper';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import { IdempotencyKey } from '../decorators/mobile-client.decorator';
import {
  MOBILE_API_PREFIX,
  MOBILE_IDEMPOTENCY_SCOPES,
} from '../mobile.constants';

/**
 * กล่องรออนุมัติของหัวหน้า (BE-3)
 *
 * ประเภท endpoint: PASSTHROUGH — ApprovalsService เป็นเจ้าของทั้งการคัดว่า
 * ใบไหนถึงคิวใคร และการตรวจสิทธิ์ตอนกดอนุมัติ ที่นี่แค่รวมเป็น endpoint เดียว
 * แล้วย่อ payload ให้พอดีจอมือถือ
 *
 * ## คำร้องเอกสาร (DOCUMENT)
 *
 * เดิมตัดออกเพราะกลัวหัวหน้ากดอนุมัติโดยไม่ได้เปิดไฟล์อ่าน ตอนนี้รองรับแล้ว
 * โดยแก้ที่ต้นเหตุแทนการตัดฟีเจอร์: **ปุ่มอนุมัติจะยังกดไม่ได้จนกว่าจะเปิดดู
 * ไฟล์แนบครบทุกไฟล์** (ฝั่งแอปบังคับ ดู approvals.tsx) และไฟล์เปิดผ่าน
 * endpoint ของกล่องอนุมัติที่ตรวจสิทธิ์ผู้อนุมัติทุกครั้ง ไม่ใช่ลิงก์สาธารณะ
 *
 * ใบที่ไม่มีไฟล์แนบเลยกดได้ทันที เพราะไม่มีอะไรให้อ่าน
 */
const MOBILE_APPROVAL_TYPES = [
  'LEAVE',
  'OVERTIME',
  'TIME_ADJUST',
  'OFFSITE',
  'DOCUMENT',
] as const;

type MobileApprovalType = (typeof MOBILE_APPROVAL_TYPES)[number];

const ACTION_SLUGS = ['approve', 'reject', 'return'] as const;

type ApprovalAction = (typeof ACTION_SLUGS)[number];

type DownloadFile = {
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
};

const TYPE_BY_SLUG: Record<string, MobileApprovalType> = {
  document: 'DOCUMENT',
  leave: 'LEAVE',
  offsite: 'OFFSITE',
  overtime: 'OVERTIME',
  'time-adjust': 'TIME_ADJUST',
};

@Controller(`${MOBILE_API_PREFIX}/approvals`)
export class MobileApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly documents: DocumentWorkflowService,
    private readonly leaveAttachments: LeaveAttachmentService,
    private readonly overtimeRequests: OvertimeRequestsService,
    private readonly timeAdjustRequests: TimeAdjustRequestsService,
    private readonly idempotency: MobileIdempotencyService,
  ) {}

  @Get()
  @Auth('ESS_ACCESS', 'APPROVAL_ACCESS')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileApprovalListQueryDto = {},
  ) {
    const requestedType = query.type ? TYPE_BY_SLUG[query.type] : undefined;

    if (query.type && !requestedType) {
      throw new BadRequestException('ประเภทคำขอไม่ถูกต้อง');
    }

    const result = await this.approvals.findMobileApprovals(user, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      q: query.search?.trim() || undefined,
      status: (query.status ?? 'SUBMITTED') as never,
      type: (requestedType ?? 'ALL') as never,
    });

    return {
      items: ((result.items ?? []) as Record<string, unknown>[]).map((item) =>
        toMobileApprovalListItem(item as never),
      ),
      meta: result.meta,
    };
  }

  @Get(':type/:id')
  @Auth('ESS_ACCESS', 'APPROVAL_ACCESS')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    const approvalType = TYPE_BY_SLUG[type];

    if (!approvalType) {
      throw new BadRequestException('ประเภทคำขอไม่ถูกต้อง');
    }

    const item = await this.approvals.findApprovalDetail(
      user,
      approvalType,
      id,
    );

    return toMobileApprovalDetail(item as never);
  }

  @Get(':type/:id/attachments/:attachmentId/download')
  @Auth('ESS_ACCESS', 'APPROVAL_ACCESS')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const approvalType = TYPE_BY_SLUG[type];

    if (!approvalType || approvalType === 'OFFSITE') {
      throw new BadRequestException('ประเภทคำขอนี้ไม่มีไฟล์แนบที่เปิดผ่านแอปได้');
    }

    /*
     * ตรวจว่าใบนี้อยู่ในคิวของผู้เรียกก่อนเปิดไฟล์เสมอ
     *
     * ไฟล์แนบของใบลาคือใบรับรองแพทย์ ส่วนของใบขอเอกสารคือเอกสารประกอบที่อาจ
     * มีสำเนาบัตรประชาชน — ทั้งคู่เปิดได้เฉพาะคนที่ต้องตัดสินใจกับใบนั้นจริง
     */
    await this.approvals.ensureApprovalInScope(user, approvalType, id);

    const file =
      approvalType === 'LEAVE'
        ? await this.leaveAttachments.getAttachmentFileForDownload(
            id,
            attachmentId,
            user.scope,
          )
        : approvalType === 'OVERTIME'
          ? await this.overtimeRequests.getAttachmentFileForDownload(
              id,
              attachmentId,
              user.scope,
            )
          : approvalType === 'DOCUMENT'
            ? await this.documents.getDocumentFileForDownload(
                id,
                attachmentId,
                user.scope,
              )
            : await this.timeAdjustRequests.getAttachmentFileForDownload(
                id,
                attachmentId,
                user.scope,
              );

    return this.sendAttachment(response, file);
  }

  /**
   * กดอนุมัติ / ไม่อนุมัติ / ส่งกลับ
   *
   * รวมเป็น route เดียวโดยตั้งใจ (ต่างจากเว็บที่แยก 15 route) เพราะฝั่งแอป
   * ทั้งสามปุ่มอยู่บนจอเดียวกันและ payload เหมือนกันหมด
   * การแยกเป็นสิบกว่า route จะได้โค้ดซ้ำโดยไม่ได้อะไรเพิ่ม
   */
  @Post(':type/:id/:action')
  @MobileAuth('ESS_ACCESS', 'APPROVAL_ACCESS')
  async act(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() dto: ApprovalActionDto,
    @IdempotencyKey() key: string | null,
  ) {
    const approvalType = TYPE_BY_SLUG[type];

    if (!approvalType) {
      throw new BadRequestException('ประเภทคำขอไม่ถูกต้อง');
    }

    if (!ACTION_SLUGS.includes(action as ApprovalAction)) {
      throw new BadRequestException(
        `การกระทำไม่ถูกต้อง รองรับเฉพาะ ${ACTION_SLUGS.join(', ')}`,
      );
    }

    /*
     * ไม่อนุมัติและส่งกลับต้องมีเหตุผลเสมอ
     * ผู้ยื่นที่ได้แค่คำว่า "ไม่อนุมัติ" ลอย ๆ จะเดินไปถามหัวหน้าอยู่ดี
     * และไม่รู้ว่าต้องแก้อะไรถ้าจะยื่นใหม่
     */
    if (action !== 'approve' && !dto?.reason?.trim()) {
      throw new BadRequestException(
        action === 'reject'
          ? 'กรุณาระบุเหตุผลที่ไม่อนุมัติ'
          : 'กรุณาระบุสิ่งที่ต้องแก้ไขก่อนส่งกลับ',
      );
    }

    const handler = {
      LEAVE: {
        approve: this.approvals.approveLeaveRequest,
        reject: this.approvals.rejectLeaveRequest,
        return: this.approvals.returnLeaveRequest,
      },
      OFFSITE: {
        approve: this.approvals.approveOffsiteRequest,
        reject: this.approvals.rejectOffsiteRequest,
        return: this.approvals.returnOffsiteRequest,
      },
      OVERTIME: {
        approve: this.approvals.approveOvertimeRequest,
        reject: this.approvals.rejectOvertimeRequest,
        return: this.approvals.returnOvertimeRequest,
      },
      TIME_ADJUST: {
        approve: this.approvals.approveTimeAdjustRequest,
        reject: this.approvals.rejectTimeAdjustRequest,
        return: this.approvals.returnTimeAdjustRequest,
      },
      DOCUMENT: {
        approve: this.approvals.approveDocumentRequest,
        reject: this.approvals.rejectDocumentRequest,
        return: this.approvals.returnDocumentRequest,
      },
    }[approvalType][action as ApprovalAction];

    return this.idempotency.executeOptional({
      key,
      requestPayload: { action, approvalType, dto, id },
      scope: MOBILE_IDEMPOTENCY_SCOPES.approvalMutation,
      userId: user.id,
      handler: () => handler.call(this.approvals, user, id, dto),
    });
  }

  private sendAttachment(response: Response, file: DownloadFile) {
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');

    return response.sendFile(file.filePath);
  }
}
