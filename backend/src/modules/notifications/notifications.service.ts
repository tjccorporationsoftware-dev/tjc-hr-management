import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import {
  DocumentRequestStatus,
  HrReviewStatus,
  LeaveRequestStatus,
  AttendanceReviewStatus,
  MasterStatus,
  PayrollPeriodStatus,
  OffsiteRequestStatus,
  OvertimeRequestStatus,
  TimeAdjustRequestStatus,
  UserStatus,
  LeaveApprovalAction,
  OvertimeApprovalAction,
  TimeAdjustApprovalAction,
  DocumentApprovalAction,
} from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CompanyPayrollSettingsService } from "../settings/company-payroll-settings.service";
import { SystemSettingsService } from "../settings/system-settings.service";
import {
  buildCurrentLeaveApprovalStepWhere,
  buildCurrentOvertimeApprovalStepWhere,
  buildCurrentTimeAdjustApprovalStepWhere,
} from "../approvals/helpers/approval-scope.helper";
import type { ApproverEmployee } from "../approvals/types/approval-center.types";
import type {
  CurrentNotificationUser,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  NotificationItem,
  NotificationListQuery,
  NotificationListResponse,
  NotificationListStatus,
  NotificationRealtimeEvent,
  NotificationSeverity,
  NotificationSummaryResponse,
  NotificationActor,
} from "./types/notification.types";

type NotificationRecord = {
  id: string;
  userId: string;
  sourceKey: string;
  title: string;
  message: string;
  type: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  count: number;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * NotificationsService
 * -----------------------------------------------------------------------------
 * Phase 1B/1C ของระบบแจ้งเตือนในเว็บ
 * - เก็บรายการแจ้งเตือนลงตาราง Notification เพื่อให้มี read/unread จริง
 * - sidebar badge ยังใช้จำนวนงานค้างจริงจากระบบเดิม ไม่ผูกกับ read/unread
 * - summary endpoint ใช้สำหรับ polling จึงไม่สร้าง audit log จาก controller
 * - inbox / mark read / read all ถูก audit ที่ controller ตามแนวระบบเดิม
 * - stream ใช้ SSE/fetch stream สำหรับอัปเดตกระดิ่งแบบ realtime โดยไม่สร้าง audit log
 */

const NOTIFICATION_STREAM_SYNC_INTERVAL_MS = 15_000;
const NOTIFICATION_STREAM_HEARTBEAT_INTERVAL_MS = 30_000;
const NOTIFICATION_SUMMARY_CACHE_TTL_MS = 15_000;

type NotificationSubscriber = (event: NotificationRealtimeEvent) => void;

type NotificationSummaryCacheEntry = {
  expiresAt: number;
  value: NotificationSummaryResponse;
};

type PayrollReviewCompanyScope = {
  id: string;
  code: string | null;
  nameTh: string | null;
  nameEn: string | null;
};

type PayrollReviewWindow = {
  periodId: string | null;
  periodKey: string;
  label: string;
  startDate: Date;
  endDate: Date;
  companyId: string | null;
  companyLabel: string | null;
};

/** ข้อมูลที่ตัวส่ง push ต้องใช้ — ตรงกับที่บันทึกลงตารางแจ้งเตือน */
export type NotificationPushPayload = {
  entityId: string;
  entityType: string;
  message: string;
  title: string;
  type: string;
  userIds: string[];
};

export type NotificationPushDispatcher = (
  payload: NotificationPushPayload,
) => Promise<void> | void;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly subscribers = new Map<string, Set<NotificationSubscriber>>();
  private readonly summaryCache = new Map<string, NotificationSummaryCacheEntry>();
  private pushDispatcher: NotificationPushDispatcher | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly companyPayrollSettingsService: CompanyPayrollSettingsService,
  ) {}

  async stream(
    currentUser: CurrentNotificationUser,
    response: Response,
  ): Promise<void> {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    let closed = false;
    let lastSnapshotSignature = "";
    let syncIntervalId: ReturnType<typeof setInterval> | null = null;
    let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;
    let resolveStream: (() => void) | null = null;

    const cleanup = () => {
      if (closed) return;

      closed = true;
      unsubscribe?.();
      unsubscribe = null;

      if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
      }

      if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
      }

      resolveStream?.();
      resolveStream = null;
    };

    const safeWrite = (payload: string) => {
      if (closed || response.destroyed || response.writableEnded) {
        return false;
      }

      try {
        response.write(payload);
        return true;
      } catch {
        cleanup();
        return false;
      }
    };

    const writeEvent = (event: NotificationRealtimeEvent) => {
      const payload = [
        `event: ${event.type.toLowerCase()}`,
        `data: ${JSON.stringify(event)}`,
        "",
        "",
      ].join("\n");

      safeWrite(payload);
    };

    const writeHeartbeat = () => {
      safeWrite(`: heartbeat ${new Date().toISOString()}\n\n`);
    };

    unsubscribe = this.subscribe(currentUser.id, writeEvent);

    const sendSnapshot = async (
      type: NotificationRealtimeEvent["type"] = "NOTIFICATION_UPDATED",
      force = false,
    ) => {
      if (closed) return;

      try {
        const summary = await this.getSummary(currentUser);
        const event = this.toRealtimeEvent(type, summary);
        const nextSignature = this.createRealtimeSignature(event);

        if (force || nextSignature !== lastSnapshotSignature) {
          lastSnapshotSignature = nextSignature;
          writeEvent(event);
        }
      } catch {
        // ไม่ปิด stream จาก error รอบเดียว ให้ polling fallback ฝั่ง frontend ช่วยรองรับ
      }
    };

    void sendSnapshot("CONNECTED", true);

    syncIntervalId = setInterval(() => {
      void sendSnapshot();
    }, NOTIFICATION_STREAM_SYNC_INTERVAL_MS);

    heartbeatIntervalId = setInterval(() => {
      writeHeartbeat();
    }, NOTIFICATION_STREAM_HEARTBEAT_INTERVAL_MS);

    return new Promise((resolve) => {
      resolveStream = resolve;

      response.on("close", cleanup);
      response.on("finish", cleanup);
      response.on("error", cleanup);
    });
  }

  async getSummary(
    currentUser: CurrentNotificationUser,
  ): Promise<NotificationSummaryResponse> {
    const cached = this.getCachedSummary(currentUser.id);

    if (cached) {
      return cached;
    }

    await this.syncAttendanceAlerts(currentUser);
    await this.syncPayrollReviewAlerts(currentUser);

    const liveItems = await this.buildNotificationItems(currentUser);
    await this.syncLiveNotifications(currentUser, liveItems);
    await this.closeResolvedAttendanceLiveNotifications(currentUser, liveItems);
    await this.closeResolvedApprovalLiveNotifications(currentUser, liveItems);

    const sidebarBadges = this.buildSidebarBadges(liveItems);
    const unreadCount = await this.notificationDelegate.count({
      where: {
        userId: currentUser.id,
        readAt: null,
      },
    });
    const items = await this.listNotifications(currentUser, {
      onlyUnread: true,
      take: 5,
    });

    const summary = {
      totalCount: liveItems.reduce((sum, item) => sum + item.count, 0),
      unreadCount,
      items,
      sidebarBadges,
      generatedAt: new Date().toISOString(),
    };

    this.setCachedSummary(currentUser.id, summary);

    return summary;
  }

  async listNotificationHistory(
    currentUser: CurrentNotificationUser,
    query: NotificationListQuery = {},
  ): Promise<NotificationListResponse> {
    await this.syncAttendanceAlerts(currentUser);
    await this.syncPayrollReviewAlerts(currentUser);

    const liveItems = await this.buildNotificationItems(currentUser);
    await this.syncLiveNotifications(currentUser, liveItems);
    await this.closeResolvedAttendanceLiveNotifications(currentUser, liveItems);
    await this.closeResolvedApprovalLiveNotifications(currentUser, liveItems);

    const status = this.normalizeNotificationListStatus(query.status);
    const page = this.normalizePositiveInteger(query.page, 1, 1, 9999);
    const limit = this.normalizePositiveInteger(query.limit, 20, 5, 100);
    const entityTypeWhere = query.entityTypes?.length
      ? { entityType: { in: query.entityTypes } }
      : query.excludeEntityTypes?.length
        ? {
            OR: [
              { entityType: null },
              { entityType: { notIn: query.excludeEntityTypes } },
            ],
          }
        : {};
    const where = {
      userId: currentUser.id,
      ...(status === "unread" ? { readAt: null } : {}),
      ...(status === "read" ? { readAt: { not: null } } : {}),
      ...entityTypeWhere,
    };

    const [total, records] = await Promise.all([
      this.notificationDelegate.count({ where }),
      this.notificationDelegate.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: await this.toNotificationItems(records as NotificationRecord[]),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        status,
      },
      generatedAt: new Date().toISOString(),
    };
  }


  async getUnreadCount(currentUser: CurrentNotificationUser): Promise<number> {
    return this.notificationDelegate.count({
      where: {
        userId: currentUser.id,
        readAt: null,
      },
    });
  }

  async getInbox(
    currentUser: CurrentNotificationUser,
  ): Promise<NotificationSummaryResponse> {
    await this.syncAttendanceAlerts(currentUser);
    await this.syncPayrollReviewAlerts(currentUser);

    const liveItems = await this.buildNotificationItems(currentUser);
    await this.syncLiveNotifications(currentUser, liveItems);
    await this.closeResolvedAttendanceLiveNotifications(currentUser, liveItems);
    await this.closeResolvedApprovalLiveNotifications(currentUser, liveItems);

    const [unreadCount, items] = await Promise.all([
      this.notificationDelegate.count({
        where: {
          userId: currentUser.id,
          readAt: null,
        },
      }),
      this.listNotifications(currentUser, {
        take: 20,
      }),
    ]);

    return {
      totalCount: items.length,
      unreadCount,
      items,
      sidebarBadges: this.buildSidebarBadges(liveItems),
      generatedAt: new Date().toISOString(),
    };
  }

  async markRead(
    currentUser: CurrentNotificationUser,
    id: string,
  ): Promise<MarkNotificationReadResponse> {
    const existing = (await this.notificationDelegate.findFirst({
      where: {
        id,
        userId: currentUser.id,
      },
    })) as NotificationRecord | null;

    if (!existing) {
      throw new NotFoundException("ไม่พบรายการแจ้งเตือน");
    }

    const readAt = existing.readAt ?? new Date();

    if (!existing.readAt) {
      await this.notificationDelegate.update({
        where: { id },
        data: { readAt },
      });
    }

    this.invalidateSummaryCache([currentUser.id]);
    await this.emitNotificationUpdated(currentUser);

    return {
      success: true,
      id,
      readAt: readAt.toISOString(),
    };
  }

  async markAllRead(
    currentUser: CurrentNotificationUser,
  ): Promise<MarkAllNotificationsReadResponse> {
    const readAt = new Date();
    const result = await this.notificationDelegate.updateMany({
      where: {
        userId: currentUser.id,
        readAt: null,
      },
      data: {
        readAt,
      },
    });

    this.invalidateSummaryCache([currentUser.id]);
    await this.emitNotificationUpdated(currentUser);

    return {
      success: true,
      readAt: readAt.toISOString(),
      updatedCount: result.count,
    };
  }

  private getCachedSummary(userId?: string | null) {
    if (!userId) return null;

    const entry = this.summaryCache.get(userId);

    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.summaryCache.delete(userId);
      return null;
    }

    return entry.value;
  }

  private setCachedSummary(
    userId: string | null | undefined,
    summary: NotificationSummaryResponse,
  ) {
    if (!userId) return;

    this.summaryCache.set(userId, {
      expiresAt: Date.now() + NOTIFICATION_SUMMARY_CACHE_TTL_MS,
      value: summary,
    });
  }

  private invalidateSummaryCache(userIds: Array<string | null | undefined>) {
    this.uniqueUserIds(userIds).forEach((userId) => {
      this.summaryCache.delete(userId);
    });
  }

  private subscribe(userId: string, subscriber: NotificationSubscriber) {
    const currentSubscribers = this.subscribers.get(userId) ?? new Set();
    currentSubscribers.add(subscriber);
    this.subscribers.set(userId, currentSubscribers);

    return () => {
      currentSubscribers.delete(subscriber);

      if (currentSubscribers.size === 0) {
        this.subscribers.delete(userId);
      }
    };
  }

  private async emitNotificationUpdated(currentUser: CurrentNotificationUser) {
    const currentSubscribers = this.subscribers.get(currentUser.id);

    if (!currentSubscribers || currentSubscribers.size === 0) {
      return;
    }

    try {
      const summary = await this.getSummary(currentUser);
      const event = this.toRealtimeEvent("NOTIFICATION_UPDATED", summary);

      currentSubscribers.forEach((subscriber) => subscriber(event));
    } catch {
      // ไม่ให้ realtime emit ทำให้ flow หลักของการอ่านแจ้งเตือนล่ม
    }
  }

  private toRealtimeEvent(
    type: NotificationRealtimeEvent["type"],
    summary: NotificationSummaryResponse,
  ): NotificationRealtimeEvent {
    return {
      type,
      totalCount: summary.totalCount,
      unreadCount: summary.unreadCount,
      sidebarBadges: summary.sidebarBadges,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  private createHeartbeatEvent(): NotificationRealtimeEvent {
    return {
      type: "HEARTBEAT",
      totalCount: 0,
      unreadCount: 0,
      sidebarBadges: {},
      generatedAt: new Date().toISOString(),
    };
  }

  private createRealtimeSignature(event: NotificationRealtimeEvent) {
    return JSON.stringify({
      totalCount: event.totalCount,
      unreadCount: event.unreadCount,
      sidebarBadges: event.sidebarBadges,
      itemKeys: event.summary?.items.map((item) => ({
        id: item.id,
        key: item.key,
        count: item.count,
        readAt: item.readAt ?? null,
        updatedAt: item.updatedAt ?? null,
      })),
    });
  }

  async notifyTimeAdjustPendingApproval(timeAdjustRequestId: string) {
    const request = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id: timeAdjustRequestId,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
        approvalSteps: {
          where: {
            status: "PENDING",
          },
          orderBy: {
            stepNo: "asc",
          },
          take: 1,
          select: {
            id: true,
            stepNo: true,
            nameTh: true,
            expectedApproverId: true,
            roleCode: true,
          },
        },
      },
    });

    const currentStep = request?.approvalSteps[0];

    if (!request || !currentStep) {
      return;
    }

    const recipientUserIds = await this.resolveTimeAdjustStepRecipientUserIds({
      expectedApproverId: currentStep.expectedApproverId,
      roleCode: currentStep.roleCode,
    });

    await this.upsertNotificationForUsers(recipientUserIds, {
      sourceKey: this.timeAdjustPendingSourceKey(
        timeAdjustRequestId,
        currentStep.stepNo,
      ),
      title: `${this.getEmployeeDisplayName(request.employee)} ยื่นคำขอแก้ไขเวลา`,
      message: `${this.getEmployeeDisplayName(
        request.employee,
      )} ยื่นคำขอแก้ไขเวลา วันที่ ${this.formatThaiDateTime(
        request.requestedLogTime,
      )}`,
      type: "TIME_ADJUST_PENDING_APPROVAL",
      severity: "WARNING",
      entityType: "TimeAdjustRequest",
      entityId: timeAdjustRequestId,
      link: "/approvals?type=TIME_ADJUST&status=SUBMITTED",
      metadata: {
        source: "TIME_ADJUST_WORKFLOW",
        action: "PENDING_APPROVAL",
        requestId: timeAdjustRequestId,
        requestNo: request.requestNo,
        employeeId: request.employeeId,
        requesterEmployeeId: request.employeeId,
        requesterUserId: request.employee.userId,
        actorEmployeeId: request.employeeId,
        actorUserId: request.employee.userId,
        stepId: currentStep.id,
        stepNo: currentStep.stepNo,
        stepName: currentStep.nameTh,
        requestedLogTime: request.requestedLogTime.toISOString(),
      },
    });
  }

  async notifyTimeAdjustApproved(timeAdjustRequestId: string) {
    const request =
      await this.findTimeAdjustRequestForRequesterNotification(
        timeAdjustRequestId,
      );

    if (!request) return;

    const actorUserId = await this.findLatestTimeAdjustActorUserId(
      timeAdjustRequestId,
      [TimeAdjustApprovalAction.APPROVE],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveTimeAdjustRequesterUserIds(request),
      {
        sourceKey: `time-adjust:${timeAdjustRequestId}:approved`,
        title: `${actorName} ได้อนุมัติคำขอแก้ไขเวลาของคุณแล้ว`,
        message: `คำขอแก้ไขเวลาวันที่ ${this.formatThaiDateTime(
          request.requestedLogTime,
        )} ได้รับอนุมัติและบันทึกเข้าระบบเวลาแล้ว`,
        type: "TIME_ADJUST_APPROVED",
        severity: "SUCCESS",
        entityType: "TimeAdjustRequest",
        entityId: timeAdjustRequestId,
        link: "/ess/requests/time-adjust",
        metadata: {
          source: "TIME_ADJUST_WORKFLOW",
          action: "APPROVED",
          requestId: timeAdjustRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          requestedLogTime: request.requestedLogTime.toISOString(),
        },
      },
    );
  }

  async notifyTimeAdjustRejected(timeAdjustRequestId: string) {
    const request =
      await this.findTimeAdjustRequestForRequesterNotification(
        timeAdjustRequestId,
      );

    if (!request) return;

    const actorUserId = await this.findLatestTimeAdjustActorUserId(
      timeAdjustRequestId,
      [TimeAdjustApprovalAction.REJECT],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveTimeAdjustRequesterUserIds(request),
      {
        sourceKey: `time-adjust:${timeAdjustRequestId}:rejected`,
        title: `${actorName} ได้ปฏิเสธคำขอแก้ไขเวลาของคุณ`,
        message: `คำขอแก้ไขเวลาวันที่ ${this.formatThaiDateTime(
          request.requestedLogTime,
        )} ถูกปฏิเสธ กรุณาตรวจสอบรายละเอียดคำขอ`,
        type: "TIME_ADJUST_REJECTED",
        severity: "DANGER",
        entityType: "TimeAdjustRequest",
        entityId: timeAdjustRequestId,
        link: "/ess/requests/time-adjust",
        metadata: {
          source: "TIME_ADJUST_WORKFLOW",
          action: "REJECTED",
          requestId: timeAdjustRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          requestedLogTime: request.requestedLogTime.toISOString(),
        },
      },
    );
  }

  async notifyTimeAdjustReturnedForReview(timeAdjustRequestId: string) {
    const request =
      await this.findTimeAdjustRequestForRequesterNotification(
        timeAdjustRequestId,
      );

    if (!request) return;

    const actorUserId = await this.findLatestTimeAdjustActorUserId(
      timeAdjustRequestId,
      [TimeAdjustApprovalAction.CANCEL],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveTimeAdjustRequesterUserIds(request),
      {
        sourceKey: `time-adjust:${timeAdjustRequestId}:returned-for-review`,
        title: `${actorName} ส่งกลับคำขอแก้ไขเวลาของคุณให้ตรวจสอบ`,
        message: `คำขอแก้ไขเวลาวันที่ ${this.formatThaiDateTime(
          request.requestedLogTime,
        )} ถูกส่งกลับ กรุณาแก้ไขข้อมูลแล้วส่งขออนุมัติใหม่`,
        type: "TIME_ADJUST_RETURNED_FOR_REVIEW",
        severity: "WARNING",
        entityType: "TimeAdjustRequest",
        entityId: timeAdjustRequestId,
        link: "/ess/requests/time-adjust",
        metadata: {
          source: "TIME_ADJUST_WORKFLOW",
          action: "RETURNED_FOR_REVIEW",
          requestId: timeAdjustRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          requestedLogTime: request.requestedLogTime.toISOString(),
        },
      },
    );
  }

  async closeTimeAdjustPendingNotifications(timeAdjustRequestId: string) {
    const sourceKeyPrefix = `time-adjust:${timeAdjustRequestId}:pending:`;
    const readAt = new Date();
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        sourceKey: {
          startsWith: sourceKeyPrefix,
        },
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    })) as Array<{ id: string; userId: string }>;

    if (existingRecords.length === 0) {
      return;
    }

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: existingRecords.map((record) => record.id),
        },
      },
      data: {
        readAt,
      },
    });

    this.emitNotificationUpdatedSignal(
      existingRecords.map((record) => record.userId),
    );
  }

  async notifyLeavePendingApproval(leaveRequestId: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: {
        id: leaveRequestId,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
        leaveType: {
          select: {
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        approvalSteps: {
          where: {
            status: "PENDING",
          },
          orderBy: {
            stepNo: "asc",
          },
          take: 1,
          select: {
            id: true,
            stepNo: true,
            nameTh: true,
            expectedApproverId: true,
            expectedEmployeeId: true,
            roleCode: true,
            expectedEmployee: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    const currentStep = request?.approvalSteps[0];

    if (!request || !currentStep) {
      return;
    }

    const recipientUserIds = await this.resolveLeaveStepRecipientUserIds({
      expectedApproverId: currentStep.expectedApproverId,
      expectedEmployeeId: currentStep.expectedEmployeeId,
      expectedEmployeeUserId: currentStep.expectedEmployee?.userId ?? null,
      roleCode: currentStep.roleCode,
    });

    await this.upsertNotificationForUsers(recipientUserIds, {
      sourceKey: this.leavePendingSourceKey(leaveRequestId, currentStep.stepNo),
      title: `${this.getEmployeeDisplayName(request.employee)} ยื่นใบลา`,
      message: `${this.getEmployeeDisplayName(
        request.employee,
      )} ยื่นใบลา ${this.getLeaveTypeDisplayName(
        request.leaveType,
      )} วันที่ ${this.formatThaiDateRange(
        request.startDate,
        request.endDate,
      )}`,
      type: "LEAVE_PENDING_APPROVAL",
      severity: "WARNING",
      entityType: "LeaveRequest",
      entityId: leaveRequestId,
      link: "/approvals?type=LEAVE&status=SUBMITTED",
      metadata: {
        source: "LEAVE_WORKFLOW",
        action: "PENDING_APPROVAL",
        requestId: leaveRequestId,
        requestNo: request.requestNo,
        employeeId: request.employeeId,
        requesterEmployeeId: request.employeeId,
        requesterUserId: request.employee.userId,
        actorEmployeeId: request.employeeId,
        actorUserId: request.employee.userId,
        leaveTypeCode: request.leaveType.code,
        stepId: currentStep.id,
        stepNo: currentStep.stepNo,
        stepName: currentStep.nameTh,
        startDate: request.startDate.toISOString(),
        endDate: request.endDate.toISOString(),
      },
    });
  }

  async notifyLeaveApproved(leaveRequestId: string) {
    const request =
      await this.findLeaveRequestForRequesterNotification(leaveRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestLeaveActorUserId(leaveRequestId, [
      LeaveApprovalAction.APPROVE,
    ]);
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveLeaveRequesterUserIds(request),
      {
        sourceKey: `leave:${leaveRequestId}:approved`,
        title: `${actorName} ได้อนุมัติใบลาของคุณแล้ว`,
        message: `ใบลา ${this.getLeaveTypeDisplayName(
          request.leaveType,
        )} ช่วง ${this.formatThaiDateRange(
          request.startDate,
          request.endDate,
        )} ได้รับการอนุมัติแล้ว`,
        type: "LEAVE_APPROVED",
        severity: "SUCCESS",
        entityType: "LeaveRequest",
        entityId: leaveRequestId,
        link: "/ess/requests/leave",
        metadata: {
          source: "LEAVE_WORKFLOW",
          action: "APPROVED",
          requestId: leaveRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          leaveTypeCode: request.leaveType.code,
          startDate: request.startDate.toISOString(),
          endDate: request.endDate.toISOString(),
        },
      },
    );
  }

  async notifyLeaveRejected(leaveRequestId: string) {
    const request =
      await this.findLeaveRequestForRequesterNotification(leaveRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestLeaveActorUserId(leaveRequestId, [
      LeaveApprovalAction.REJECT,
    ]);
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveLeaveRequesterUserIds(request),
      {
        sourceKey: `leave:${leaveRequestId}:rejected`,
        title: `${actorName} ได้ปฏิเสธใบลาของคุณ`,
        message: `ใบลา ${this.getLeaveTypeDisplayName(
          request.leaveType,
        )} ช่วง ${this.formatThaiDateRange(
          request.startDate,
          request.endDate,
        )} ถูกปฏิเสธ กรุณาตรวจสอบรายละเอียด`,
        type: "LEAVE_REJECTED",
        severity: "DANGER",
        entityType: "LeaveRequest",
        entityId: leaveRequestId,
        link: "/ess/requests/leave",
        metadata: {
          source: "LEAVE_WORKFLOW",
          action: "REJECTED",
          requestId: leaveRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          leaveTypeCode: request.leaveType.code,
          startDate: request.startDate.toISOString(),
          endDate: request.endDate.toISOString(),
        },
      },
    );
  }

  async notifyLeaveReturnedForReview(leaveRequestId: string) {
    const request =
      await this.findLeaveRequestForRequesterNotification(leaveRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestLeaveActorUserId(leaveRequestId, [
      LeaveApprovalAction.CANCEL,
    ]);
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveLeaveRequesterUserIds(request),
      {
        sourceKey: `leave:${leaveRequestId}:returned-for-review`,
        title: `${actorName} ส่งกลับใบลาของคุณให้ตรวจสอบ`,
        message: `ใบลา ${this.getLeaveTypeDisplayName(
          request.leaveType,
        )} ช่วง ${this.formatThaiDateRange(
          request.startDate,
          request.endDate,
        )} ถูกส่งกลับ กรุณาแก้ไขข้อมูลแล้วส่งขออนุมัติใหม่`,
        type: "LEAVE_RETURNED_FOR_REVIEW",
        severity: "WARNING",
        entityType: "LeaveRequest",
        entityId: leaveRequestId,
        link: "/ess/requests/leave",
        metadata: {
          source: "LEAVE_WORKFLOW",
          action: "RETURNED_FOR_REVIEW",
          requestId: leaveRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          leaveTypeCode: request.leaveType.code,
          startDate: request.startDate.toISOString(),
          endDate: request.endDate.toISOString(),
        },
      },
    );
  }

  async closeLeavePendingNotifications(leaveRequestId: string) {
    const sourceKeyPrefix = `leave:${leaveRequestId}:pending:`;
    const readAt = new Date();
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        sourceKey: {
          startsWith: sourceKeyPrefix,
        },
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    })) as Array<{ id: string; userId: string }>;

    if (existingRecords.length === 0) {
      return;
    }

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: existingRecords.map((record) => record.id),
        },
      },
      data: {
        readAt,
      },
    });

    this.emitNotificationUpdatedSignal(
      existingRecords.map((record) => record.userId),
    );
  }

  async notifyOvertimePendingApproval(overtimeRequestId: string) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id: overtimeRequestId,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
        approvalSteps: {
          where: {
            status: "PENDING",
          },
          orderBy: {
            stepNo: "asc",
          },
          take: 1,
          select: {
            id: true,
            stepNo: true,
            nameTh: true,
            expectedApproverId: true,
            expectedEmployeeId: true,
            roleCode: true,
            expectedEmployee: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    const currentStep = request?.approvalSteps[0];

    if (!request || !currentStep) {
      return;
    }

    const recipientUserIds = await this.resolveOvertimeStepRecipientUserIds({
      expectedApproverId: currentStep.expectedApproverId,
      expectedEmployeeId: currentStep.expectedEmployeeId,
      expectedEmployeeUserId: currentStep.expectedEmployee?.userId ?? null,
      roleCode: currentStep.roleCode,
    });

    await this.upsertNotificationForUsers(recipientUserIds, {
      sourceKey: this.overtimePendingSourceKey(
        overtimeRequestId,
        currentStep.stepNo,
      ),
      title: `${this.getEmployeeDisplayName(request.employee)} ยื่นคำขอ OT`,
      message: `${this.getEmployeeDisplayName(
        request.employee,
      )} ยื่นคำขอ OT วันที่ ${this.formatThaiDateRange(
        request.workDate,
        request.workDate,
      )} เวลา ${this.formatThaiTimeRange(
        request.startTime,
        request.endTime,
      )} (${this.formatDecimalHours(request.totalHours)} ชม.)`,
      type: "OVERTIME_PENDING_APPROVAL",
      severity: "WARNING",
      entityType: "OvertimeRequest",
      entityId: overtimeRequestId,
      link: "/approvals?type=OVERTIME&status=SUBMITTED",
      metadata: {
        source: "OVERTIME_WORKFLOW",
        action: "PENDING_APPROVAL",
        requestId: overtimeRequestId,
        requestNo: request.requestNo,
        employeeId: request.employeeId,
        requesterEmployeeId: request.employeeId,
        requesterUserId: request.employee.userId,
        actorEmployeeId: request.employeeId,
        actorUserId: request.employee.userId,
        workDate: request.workDate.toISOString(),
        startTime: request.startTime.toISOString(),
        endTime: request.endTime.toISOString(),
        totalHours: this.formatDecimalHours(request.totalHours),
        workType: request.workType,
        stepId: currentStep.id,
        stepNo: currentStep.stepNo,
        stepName: currentStep.nameTh,
      },
    });
  }

  async notifyOvertimeApproved(overtimeRequestId: string) {
    const request =
      await this.findOvertimeRequestForRequesterNotification(overtimeRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestOvertimeActorUserId(
      overtimeRequestId,
      [OvertimeApprovalAction.APPROVE],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveOvertimeRequesterUserIds(request),
      {
        sourceKey: `overtime:${overtimeRequestId}:approved`,
        title: `${actorName} ได้อนุมัติคำขอ OT ของคุณแล้ว`,
        message: `คำขอ OT วันที่ ${this.formatThaiDateRange(
          request.workDate,
          request.workDate,
        )} เวลา ${this.formatThaiTimeRange(
          request.startTime,
          request.endTime,
        )} (${this.formatDecimalHours(
          request.totalHours,
        )} ชม.) ได้รับการอนุมัติแล้ว`,
        type: "OVERTIME_APPROVED",
        severity: "SUCCESS",
        entityType: "OvertimeRequest",
        entityId: overtimeRequestId,
        link: "/ess/requests/overtime",
        metadata: {
          source: "OVERTIME_WORKFLOW",
          action: "APPROVED",
          requestId: overtimeRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          workDate: request.workDate.toISOString(),
          startTime: request.startTime.toISOString(),
          endTime: request.endTime.toISOString(),
          totalHours: this.formatDecimalHours(request.totalHours),
          workType: request.workType,
        },
      },
    );
  }

  async notifyOvertimeRejected(overtimeRequestId: string) {
    const request =
      await this.findOvertimeRequestForRequesterNotification(overtimeRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestOvertimeActorUserId(
      overtimeRequestId,
      [OvertimeApprovalAction.REJECT],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveOvertimeRequesterUserIds(request),
      {
        sourceKey: `overtime:${overtimeRequestId}:rejected`,
        title: `${actorName} ได้ปฏิเสธคำขอ OT ของคุณ`,
        message: `คำขอ OT วันที่ ${this.formatThaiDateRange(
          request.workDate,
          request.workDate,
        )} เวลา ${this.formatThaiTimeRange(
          request.startTime,
          request.endTime,
        )} ถูกปฏิเสธ กรุณาตรวจสอบรายละเอียด`,
        type: "OVERTIME_REJECTED",
        severity: "DANGER",
        entityType: "OvertimeRequest",
        entityId: overtimeRequestId,
        link: "/ess/requests/overtime",
        metadata: {
          source: "OVERTIME_WORKFLOW",
          action: "REJECTED",
          requestId: overtimeRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          workDate: request.workDate.toISOString(),
          startTime: request.startTime.toISOString(),
          endTime: request.endTime.toISOString(),
          totalHours: this.formatDecimalHours(request.totalHours),
          workType: request.workType,
        },
      },
    );
  }

  async notifyOvertimeReturnedForReview(overtimeRequestId: string) {
    const request =
      await this.findOvertimeRequestForRequesterNotification(overtimeRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestOvertimeActorUserId(
      overtimeRequestId,
      [OvertimeApprovalAction.CANCEL],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveOvertimeRequesterUserIds(request),
      {
        sourceKey: `overtime:${overtimeRequestId}:returned-for-review`,
        title: `${actorName} ส่งกลับคำขอ OT ของคุณให้ตรวจสอบ`,
        message: `คำขอ OT วันที่ ${this.formatThaiDateRange(
          request.workDate,
          request.workDate,
        )} เวลา ${this.formatThaiTimeRange(
          request.startTime,
          request.endTime,
        )} ถูกส่งกลับ กรุณาแก้ไขข้อมูลแล้วส่งขออนุมัติใหม่`,
        type: "OVERTIME_RETURNED_FOR_REVIEW",
        severity: "WARNING",
        entityType: "OvertimeRequest",
        entityId: overtimeRequestId,
        link: "/ess/requests/overtime",
        metadata: {
          source: "OVERTIME_WORKFLOW",
          action: "RETURNED_FOR_REVIEW",
          requestId: overtimeRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          workDate: request.workDate.toISOString(),
          startTime: request.startTime.toISOString(),
          endTime: request.endTime.toISOString(),
          totalHours: this.formatDecimalHours(request.totalHours),
          workType: request.workType,
        },
      },
    );
  }

  async closeOvertimePendingNotifications(overtimeRequestId: string) {
    const sourceKeyPrefix = `overtime:${overtimeRequestId}:pending:`;
    const readAt = new Date();
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        sourceKey: {
          startsWith: sourceKeyPrefix,
        },
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    })) as Array<{ id: string; userId: string }>;

    if (existingRecords.length === 0) {
      return;
    }

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: existingRecords.map((record) => record.id),
        },
      },
      data: {
        readAt,
      },
    });

    this.emitNotificationUpdatedSignal(
      existingRecords.map((record) => record.userId),
    );
  }

  async notifyOffsitePendingApproval(offsiteWorkRequestId: string) {
    const request = await this.prisma.offsiteWorkRequest.findFirst({
      where: {
        id: offsiteWorkRequestId,
        deletedAt: null,
      },
      select: {
        id: true,
        requestNo: true,
        employeeId: true,
        workDate: true,
        startTime: true,
        endTime: true,
        locationName: true,
        approvalSnapshot: true,
      },
    });

    const currentStep = this.findPendingOffsiteStep(request?.approvalSnapshot);

    if (!request || !currentStep) {
      return;
    }

    const employee = await this.findEmployeeForNotification(request.employeeId);

    if (!employee) {
      return;
    }

    const recipientUserIds = await this.resolveOffsiteStepRecipientUserIds({
      expectedApproverId: currentStep.expectedApproverId ?? null,
      expectedEmployeeId: currentStep.expectedEmployeeId ?? null,
      roleCode: currentStep.roleCode ?? null,
    });

    await this.upsertNotificationForUsers(recipientUserIds, {
      sourceKey: this.offsitePendingSourceKey(
        offsiteWorkRequestId,
        currentStep.stepNo,
      ),
      title: `${this.getEmployeeDisplayName(employee)} ยื่นคำขอทำงานนอกสถานที่`,
      message: `${this.getEmployeeDisplayName(
        employee,
      )} ยื่นคำขอทำงานนอกสถานที่ วันที่ ${this.formatThaiDateRange(
        request.workDate,
        request.workDate,
      )} เวลา ${this.formatPlainTimeRange(
        request.startTime,
        request.endTime,
      )} ที่ ${request.locationName}`,
      type: "OFFSITE_PENDING_APPROVAL",
      severity: "WARNING",
      entityType: "OffsiteWorkRequest",
      entityId: offsiteWorkRequestId,
      link: "/approvals?type=OFFSITE&status=SUBMITTED",
      metadata: {
        source: "OFFSITE_WORKFLOW",
        action: "PENDING_APPROVAL",
        requestId: offsiteWorkRequestId,
        requestNo: request.requestNo,
        employeeId: request.employeeId,
        requesterEmployeeId: request.employeeId,
        requesterUserId: employee.userId,
        actorEmployeeId: request.employeeId,
        actorUserId: employee.userId,
        workDate: request.workDate.toISOString(),
        startTime: request.startTime,
        endTime: request.endTime,
        locationName: request.locationName,
        stepNo: currentStep.stepNo,
        stepName: currentStep.nameTh,
      },
    });
  }

  async notifyOffsiteApproved(offsiteWorkRequestId: string) {
    const request =
      await this.findOffsiteRequestForRequesterNotification(
        offsiteWorkRequestId,
      );

    if (!request) return;

    const actorUserId =
      this.findLatestOffsiteActorUserId(request.approvalSnapshot, [
        "APPROVED",
      ]) ?? request.approvedById;
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveOffsiteRequesterUserIds(request),
      {
        sourceKey: `offsite:${offsiteWorkRequestId}:approved`,
        title: `${actorName} ได้อนุมัติคำขอทำงานนอกสถานที่ของคุณแล้ว`,
        message: `คำขอ Offsite วันที่ ${this.formatThaiDateRange(
          request.workDate,
          request.workDate,
        )} เวลา ${this.formatPlainTimeRange(
          request.startTime,
          request.endTime,
        )} (${request.locationName}) ได้รับการอนุมัติแล้ว`,
        type: "OFFSITE_APPROVED",
        severity: "SUCCESS",
        entityType: "OffsiteWorkRequest",
        entityId: offsiteWorkRequestId,
        link: "/ess/requests/offsite",
        metadata: {
          source: "OFFSITE_WORKFLOW",
          action: "APPROVED",
          requestId: offsiteWorkRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          workDate: request.workDate.toISOString(),
          startTime: request.startTime,
          endTime: request.endTime,
          locationName: request.locationName,
        },
      },
    );
  }

  async notifyOffsiteRejected(offsiteWorkRequestId: string) {
    const request =
      await this.findOffsiteRequestForRequesterNotification(
        offsiteWorkRequestId,
      );

    if (!request) return;

    const actorUserId =
      this.findLatestOffsiteActorUserId(request.approvalSnapshot, [
        "REJECTED",
      ]) ?? request.rejectedById;
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveOffsiteRequesterUserIds(request),
      {
        sourceKey: `offsite:${offsiteWorkRequestId}:rejected`,
        title: `${actorName} ได้ปฏิเสธคำขอทำงานนอกสถานที่ของคุณ`,
        message: `คำขอ Offsite วันที่ ${this.formatThaiDateRange(
          request.workDate,
          request.workDate,
        )} เวลา ${this.formatPlainTimeRange(
          request.startTime,
          request.endTime,
        )} (${request.locationName}) ถูกปฏิเสธ กรุณาตรวจสอบรายละเอียด`,
        type: "OFFSITE_REJECTED",
        severity: "DANGER",
        entityType: "OffsiteWorkRequest",
        entityId: offsiteWorkRequestId,
        link: "/ess/requests/offsite",
        metadata: {
          source: "OFFSITE_WORKFLOW",
          action: "REJECTED",
          requestId: offsiteWorkRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          workDate: request.workDate.toISOString(),
          startTime: request.startTime,
          endTime: request.endTime,
          locationName: request.locationName,
        },
      },
    );
  }

  async notifyOffsiteReturnedForReview(offsiteWorkRequestId: string) {
    const request =
      await this.findOffsiteRequestForRequesterNotification(
        offsiteWorkRequestId,
      );

    if (!request) return;

    const actorUserId = this.findLatestOffsiteActorUserId(
      request.approvalSnapshot,
      ["CANCELLED"],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveOffsiteRequesterUserIds(request),
      {
        sourceKey: `offsite:${offsiteWorkRequestId}:returned-for-review`,
        title: `${actorName} ส่งกลับคำขอทำงานนอกสถานที่ของคุณให้ตรวจสอบ`,
        message: `คำขอ Offsite วันที่ ${this.formatThaiDateRange(
          request.workDate,
          request.workDate,
        )} เวลา ${this.formatPlainTimeRange(
          request.startTime,
          request.endTime,
        )} (${request.locationName}) ถูกส่งกลับ กรุณาแก้ไขข้อมูลแล้วส่งขออนุมัติใหม่`,
        type: "OFFSITE_RETURNED_FOR_REVIEW",
        severity: "WARNING",
        entityType: "OffsiteWorkRequest",
        entityId: offsiteWorkRequestId,
        link: "/ess/requests/offsite",
        metadata: {
          source: "OFFSITE_WORKFLOW",
          action: "RETURNED_FOR_REVIEW",
          requestId: offsiteWorkRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          workDate: request.workDate.toISOString(),
          startTime: request.startTime,
          endTime: request.endTime,
          locationName: request.locationName,
        },
      },
    );
  }

  async closeOffsitePendingNotifications(offsiteWorkRequestId: string) {
    const sourceKeyPrefix = `offsite:${offsiteWorkRequestId}:pending:`;
    const readAt = new Date();
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        sourceKey: {
          startsWith: sourceKeyPrefix,
        },
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    })) as Array<{ id: string; userId: string }>;

    if (existingRecords.length === 0) {
      return;
    }

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: existingRecords.map((record) => record.id),
        },
      },
      data: {
        readAt,
      },
    });

    this.emitNotificationUpdatedSignal(
      existingRecords.map((record) => record.userId),
    );
  }

  async notifyDocumentPendingApproval(documentRequestId: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
        documentType: {
          select: {
            code: true,
            nameTh: true,
            nameEn: true,
            approvalLevels: true,
          },
        },
      },
    });

    if (!request || request.status !== DocumentRequestStatus.SUBMITTED) {
      return;
    }

    const currentLevel = request.currentLevel || 1;
    const recipientUserIds = await this.resolveDocumentApproverUserIds();

    await this.upsertNotificationForUsers(recipientUserIds, {
      sourceKey: this.documentPendingSourceKey(documentRequestId, currentLevel),
      title: `${this.getDocumentRequesterDisplayName(
        request.employee,
        request.submittedById,
      )} ส่งคำขอเอกสาร`,
      message: `${this.getDocumentRequesterDisplayName(
        request.employee,
        request.submittedById,
      )} ส่งคำขอเอกสาร ${this.getDocumentTypeDisplayName(
        request.documentType,
      )} (${request.requestNo})`,
      type: "DOCUMENT_PENDING_APPROVAL",
      severity: "WARNING",
      entityType: "DocumentRequest",
      entityId: documentRequestId,
      link: "/approvals?type=DOCUMENT&status=SUBMITTED",
      metadata: {
        source: "DOCUMENT_WORKFLOW",
        action: "PENDING_APPROVAL",
        requestId: documentRequestId,
        requestNo: request.requestNo,
        employeeId: request.employeeId,
        requesterEmployeeId: request.employeeId,
        requesterUserId: request.employee?.userId ?? request.submittedById,
        actorEmployeeId: request.employeeId,
        actorUserId: request.employee?.userId ?? request.submittedById,
        documentTypeCode: request.documentType.code,
        currentLevel,
        approvalLevels: request.documentType.approvalLevels,
      },
    });
  }

  async notifyDocumentApproved(documentRequestId: string) {
    const request =
      await this.findDocumentRequestForRequesterNotification(documentRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestDocumentActorUserId(
      documentRequestId,
      [
        DocumentApprovalAction.APPROVE,
        DocumentApprovalAction.APPROVE_LEVEL_1,
        DocumentApprovalAction.APPROVE_LEVEL_2,
      ],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveDocumentRequesterUserIds(request),
      {
        sourceKey: `document:${documentRequestId}:approved`,
        title: `${actorName} ได้อนุมัติเอกสารของคุณแล้ว`,
        message: `คำขอเอกสาร ${this.getDocumentTypeDisplayName(
          request.documentType,
        )} (${request.requestNo}) ได้รับการอนุมัติแล้ว`,
        type: "DOCUMENT_APPROVED",
        severity: "SUCCESS",
        entityType: "DocumentRequest",
        entityId: documentRequestId,
        link: "/ess/requests/documents",
        metadata: {
          source: "DOCUMENT_WORKFLOW",
          action: "APPROVED",
          requestId: documentRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee?.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          documentTypeCode: request.documentType.code,
        },
      },
    );
  }

  async notifyDocumentRejected(documentRequestId: string) {
    const request =
      await this.findDocumentRequestForRequesterNotification(documentRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestDocumentActorUserId(
      documentRequestId,
      [DocumentApprovalAction.REJECT],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveDocumentRequesterUserIds(request),
      {
        sourceKey: `document:${documentRequestId}:rejected`,
        title: `${actorName} ได้ปฏิเสธเอกสารของคุณ`,
        message: `คำขอเอกสาร ${this.getDocumentTypeDisplayName(
          request.documentType,
        )} (${request.requestNo}) ถูกปฏิเสธ กรุณาตรวจสอบรายละเอียด`,
        type: "DOCUMENT_REJECTED",
        severity: "DANGER",
        entityType: "DocumentRequest",
        entityId: documentRequestId,
        link: "/ess/requests/documents",
        metadata: {
          source: "DOCUMENT_WORKFLOW",
          action: "REJECTED",
          requestId: documentRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee?.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          documentTypeCode: request.documentType.code,
        },
      },
    );
  }

  async notifyDocumentReturnedForReview(documentRequestId: string) {
    const request =
      await this.findDocumentRequestForRequesterNotification(documentRequestId);

    if (!request) return;

    const actorUserId = await this.findLatestDocumentActorUserId(
      documentRequestId,
      [DocumentApprovalAction.CANCEL],
    );
    const actor = await this.findEmployeeActorByUserId(actorUserId);
    const actorName = this.getActorDisplayName(actor);

    await this.upsertNotificationForUsers(
      this.resolveDocumentRequesterUserIds(request),
      {
        sourceKey: `document:${documentRequestId}:returned-for-review`,
        title: `${actorName} ส่งกลับเอกสารของคุณให้ตรวจสอบ`,
        message: `คำขอเอกสาร ${this.getDocumentTypeDisplayName(
          request.documentType,
        )} (${request.requestNo}) ถูกส่งกลับ กรุณาแก้ไขข้อมูลแล้วส่งขออนุมัติใหม่`,
        type: "DOCUMENT_RETURNED_FOR_REVIEW",
        severity: "WARNING",
        entityType: "DocumentRequest",
        entityId: documentRequestId,
        link: "/ess/requests/documents",
        metadata: {
          source: "DOCUMENT_WORKFLOW",
          action: "RETURNED_FOR_REVIEW",
          requestId: documentRequestId,
          requestNo: request.requestNo,
          employeeId: request.employeeId,
          requesterEmployeeId: request.employeeId,
          requesterUserId: request.employee?.userId ?? request.submittedById,
          ...this.buildActorMetadata(actorUserId, actor),
          documentTypeCode: request.documentType.code,
        },
      },
    );
  }

  async closeDocumentPendingNotifications(documentRequestId: string) {
    const sourceKeyPrefix = `document:${documentRequestId}:pending:`;
    const readAt = new Date();
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        sourceKey: {
          startsWith: sourceKeyPrefix,
        },
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    })) as Array<{ id: string; userId: string }>;

    if (existingRecords.length === 0) {
      return;
    }

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: existingRecords.map((record) => record.id),
        },
      },
      data: {
        readAt,
      },
    });

    this.emitNotificationUpdatedSignal(
      existingRecords.map((record) => record.userId),
    );
  }

  private get notificationDelegate() {
    return (this.prisma as any).notification;
  }

  /**
   * แจ้งเตือนแบบ "สะกิด" ของงานตั้งเวลา — เข้าทางเดียวกับแจ้งเตือนคำขอ
   *
   * ใช้ `upsertNotificationForUsers` ตัวเดียวกับแจ้งเตือนคำขอ/อนุมัติ เพราะ
   * ทางนั้นยิง push เข้ามือถือให้ด้วย ต่างจากทางของ Attendance Alert เดิมที่
   * เขียนลงตารางอย่างเดียว (ผู้ใช้เห็นก็ต่อเมื่อเปิดกระดิ่งเอง)
   *
   * `sourceKey` เป็นตัวกันซ้ำ — งานตั้งเวลาวิ่งซ้ำได้ทุกนาทีโดยไม่เด้งซ้ำ
   */
  async notifyNudge(
    userIds: Array<string | null | undefined>,
    params: {
      sourceKey: string;
      title: string;
      message: string;
      type: string;
      severity: NotificationSeverity;
      entityType: string;
      entityId: string;
      link: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.upsertNotificationForUsers(userIds, {
      ...params,
      metadata: params.metadata ?? {},
    });
  }

  private async upsertNotificationForUsers(
    userIds: Array<string | null | undefined>,
    params: {
      sourceKey: string;
      title: string;
      message: string;
      type: string;
      severity: NotificationSeverity;
      entityType: string;
      entityId: string;
      link: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const uniqueUserIds = this.uniqueUserIds(userIds);

    if (uniqueUserIds.length === 0) {
      return;
    }

    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        const existing = (await this.notificationDelegate.findFirst({
          where: {
            userId,
            sourceKey: params.sourceKey,
          },
        })) as NotificationRecord | null;

        const data = {
          userId,
          sourceKey: params.sourceKey,
          title: params.title,
          message: params.message,
          type: params.type,
          severity: params.severity,
          entityType: params.entityType,
          entityId: params.entityId,
          link: params.link,
          count: 1,
          metadata: params.metadata,
          readAt: null,
        };

        if (!existing) {
          await this.notificationDelegate.create({ data });
          return;
        }

        await this.notificationDelegate.update({
          where: {
            id: existing.id,
          },
          data,
        });
      }),
    );

    this.emitNotificationUpdatedSignal(uniqueUserIds);

    /*
     * ส่ง push ต่อให้ผู้ที่ลงทะเบียนไว้ (ปัจจุบันคือ MobilePushService)
     *
     * ใช้วิธีลงทะเบียน callback แทนการ inject service ของ mobile เข้ามาตรง ๆ
     * เพื่อไม่ให้ core หันไปพึ่ง MobileModule ซึ่งจะกลับทิศของ ADR-001
     * และทำให้เกิด circular dependency
     *
     * fire-and-forget โดยตั้งใจ — push ส่งไม่ออกต้องไม่ทำให้การอนุมัติล้มเหลว
     * การแจ้งเตือนในระบบถูกบันทึกไปแล้วตั้งแต่บรรทัดบน ผู้ใช้ยังเห็นในแอปอยู่ดี
     */
    void this.dispatchPush({
      entityId: params.entityId,
      entityType: params.entityType,
      message: params.message,
      title: params.title,
      type: params.type,
      userIds: uniqueUserIds,
    });
  }

  private async dispatchPush(payload: NotificationPushPayload) {
    if (!this.pushDispatcher) {
      return;
    }

    try {
      await this.pushDispatcher(payload);
    } catch (error) {
      this.logger.warn(
        `ส่ง push ไม่สำเร็จ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * ลงทะเบียนตัวส่ง push
   *
   * เรียกครั้งเดียวตอน bootstrap ถ้าไม่มีใครลงทะเบียน ระบบทำงานปกติทุกอย่าง
   * เพียงแต่ไม่มี push ซึ่งเป็นสถานะที่ยอมรับได้ (เช่นตอนรันเทสหรือ CI)
   */
  setPushDispatcher(dispatcher: NotificationPushDispatcher | null) {
    this.pushDispatcher = dispatcher;
  }

  private async resolveTimeAdjustStepRecipientUserIds(params: {
    expectedApproverId: string | null;
    roleCode: string | null;
  }) {
    if (params.expectedApproverId) {
      const expectedApprover = await this.prisma.user.findFirst({
        where: {
          id: params.expectedApproverId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (expectedApprover) {
        return [expectedApprover.id];
      }
    }

    if (params.roleCode) {
      const roleUsers = await this.findActiveUsersByRoleCodes([
        params.roleCode,
      ]);

      if (roleUsers.length > 0) {
        return roleUsers;
      }
    }

    return this.findActiveUsersByRoleCodes(["ADMIN", "SUPER_ADMIN"]);
  }

  private async findActiveUsersByRoleCodes(roleCodes: string[]) {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roles: {
          some: {
            role: {
              code: {
                in: roleCodes,
              },
              isActive: true,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    return users.map((user) => user.id);
  }

  private async findActiveUsersByPermissionCodes(permissionCodes: string[]) {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roles: {
          some: {
            role: {
              isActive: true,
              permissions: {
                some: {
                  permission: {
                    code: {
                      in: permissionCodes,
                    },
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    return users.map((user) => user.id);
  }

  private async findTimeAdjustRequestForRequesterNotification(
    timeAdjustRequestId: string,
  ) {
    return this.prisma.timeAdjustRequest.findFirst({
      where: {
        id: timeAdjustRequestId,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
      },
    });
  }

  private resolveTimeAdjustRequesterUserIds(request: {
    submittedById: string | null;
    employee: {
      userId: string | null;
    };
  }) {
    return this.uniqueUserIds([request.employee.userId, request.submittedById]);
  }

  private async resolveLeaveStepRecipientUserIds(params: {
    expectedApproverId: string | null;
    expectedEmployeeId: string | null;
    expectedEmployeeUserId: string | null;
    roleCode: string | null;
  }) {
    if (params.expectedApproverId) {
      const expectedApprover = await this.prisma.user.findFirst({
        where: {
          id: params.expectedApproverId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (expectedApprover) {
        return [expectedApprover.id];
      }
    }

    if (params.expectedEmployeeUserId) {
      const expectedEmployeeUser = await this.prisma.user.findFirst({
        where: {
          id: params.expectedEmployeeUserId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (expectedEmployeeUser) {
        return [expectedEmployeeUser.id];
      }
    }

    if (params.expectedEmployeeId) {
      const expectedEmployee = await this.prisma.employee.findFirst({
        where: {
          id: params.expectedEmployeeId,
          deletedAt: null,
        },
        select: {
          userId: true,
        },
      });

      if (expectedEmployee?.userId) {
        const expectedEmployeeUser = await this.prisma.user.findFirst({
          where: {
            id: expectedEmployee.userId,
            status: UserStatus.ACTIVE,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

        if (expectedEmployeeUser) {
          return [expectedEmployeeUser.id];
        }
      }
    }

    if (params.roleCode) {
      const roleUsers = await this.findActiveUsersByRoleCodes([
        params.roleCode,
      ]);

      if (roleUsers.length > 0) {
        return roleUsers;
      }
    }

    return this.findActiveUsersByRoleCodes(["ADMIN", "SUPER_ADMIN"]);
  }

  private async findLeaveRequestForRequesterNotification(
    leaveRequestId: string,
  ) {
    return this.prisma.leaveRequest.findFirst({
      where: {
        id: leaveRequestId,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
        leaveType: {
          select: {
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
      },
    });
  }

  private resolveLeaveRequesterUserIds(request: {
    submittedById: string | null;
    employee: {
      userId: string | null;
    };
  }) {
    return this.uniqueUserIds([request.employee.userId, request.submittedById]);
  }

  private async resolveOvertimeStepRecipientUserIds(params: {
    expectedApproverId: string | null;
    expectedEmployeeId: string | null;
    expectedEmployeeUserId: string | null;
    roleCode: string | null;
  }) {
    if (params.expectedApproverId) {
      const expectedApprover = await this.prisma.user.findFirst({
        where: {
          id: params.expectedApproverId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (expectedApprover) {
        return [expectedApprover.id];
      }
    }

    if (params.expectedEmployeeUserId) {
      const expectedEmployeeUser = await this.prisma.user.findFirst({
        where: {
          id: params.expectedEmployeeUserId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (expectedEmployeeUser) {
        return [expectedEmployeeUser.id];
      }
    }

    if (params.expectedEmployeeId) {
      const expectedEmployee = await this.prisma.employee.findFirst({
        where: {
          id: params.expectedEmployeeId,
          deletedAt: null,
        },
        select: {
          userId: true,
        },
      });

      if (expectedEmployee?.userId) {
        const expectedEmployeeUser = await this.prisma.user.findFirst({
          where: {
            id: expectedEmployee.userId,
            status: UserStatus.ACTIVE,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

        if (expectedEmployeeUser) {
          return [expectedEmployeeUser.id];
        }
      }
    }

    if (params.roleCode) {
      const roleUsers = await this.findActiveUsersByRoleCodes([
        params.roleCode,
      ]);

      if (roleUsers.length > 0) {
        return roleUsers;
      }
    }

    return this.findActiveUsersByRoleCodes(["ADMIN", "SUPER_ADMIN"]);
  }

  private async findOvertimeRequestForRequesterNotification(
    overtimeRequestId: string,
  ) {
    return this.prisma.overtimeRequest.findFirst({
      where: {
        id: overtimeRequestId,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
      },
    });
  }

  private resolveOvertimeRequesterUserIds(request: {
    submittedById: string | null;
    employee: {
      userId: string | null;
    };
  }) {
    return this.uniqueUserIds([request.employee.userId, request.submittedById]);
  }

  private async resolveOffsiteStepRecipientUserIds(params: {
    expectedApproverId: string | null;
    expectedEmployeeId: string | null;
    roleCode: string | null;
  }) {
    return this.resolveOvertimeStepRecipientUserIds({
      expectedApproverId: params.expectedApproverId,
      expectedEmployeeId: params.expectedEmployeeId,
      expectedEmployeeUserId: null,
      roleCode: params.roleCode,
    });
  }

  private async findOffsiteRequestForRequesterNotification(
    offsiteWorkRequestId: string,
  ) {
    const request = await this.prisma.offsiteWorkRequest.findFirst({
      where: {
        id: offsiteWorkRequestId,
        deletedAt: null,
      },
      select: {
        id: true,
        requestNo: true,
        employeeId: true,
        submittedById: true,
        approvedById: true,
        rejectedById: true,
        approvalSnapshot: true,
        workDate: true,
        startTime: true,
        endTime: true,
        locationName: true,
      },
    });

    if (!request) return null;

    const employee = await this.findEmployeeForNotification(request.employeeId);

    if (!employee) return null;

    return {
      ...request,
      employee,
    };
  }

  private resolveOffsiteRequesterUserIds(request: {
    submittedById: string | null;
    employee: {
      userId: string | null;
    };
  }) {
    return this.uniqueUserIds([request.employee.userId, request.submittedById]);
  }

  private async resolveDocumentApproverUserIds() {
    const permissionUsers = await this.findActiveUsersByPermissionCodes([
      "DOCUMENT_APPROVE",
    ]);

    if (permissionUsers.length > 0) {
      return permissionUsers;
    }

    return this.findActiveUsersByRoleCodes(["ADMIN", "SUPER_ADMIN"]);
  }

  private async findDocumentRequestForRequesterNotification(
    documentRequestId: string,
  ) {
    return this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            userId: true,
          },
        },
        documentType: {
          select: {
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
      },
    });
  }

  private resolveDocumentRequesterUserIds(request: {
    submittedById: string | null;
    employee: {
      userId: string | null;
    } | null;
  }) {
    return this.uniqueUserIds([
      request.employee?.userId,
      request.submittedById,
    ]);
  }

  private documentPendingSourceKey(documentRequestId: string, stepNo: number) {
    return `document:${documentRequestId}:pending:${stepNo}`;
  }

  private getDocumentTypeDisplayName(documentType: {
    code: string;
    nameTh: string;
    nameEn: string | null;
  }) {
    return documentType.nameTh || documentType.nameEn || documentType.code;
  }

  private getDocumentRequesterDisplayName(
    employee: {
      employeeCode: string;
      firstName: string;
      lastName: string;
      displayName: string | null;
    } | null,
    submittedById: string | null,
  ) {
    if (employee) {
      return this.getEmployeeDisplayName(employee);
    }

    return submittedById ? `ผู้ใช้งาน ${submittedById}` : "ผู้ยื่นคำขอ";
  }

  private offsitePendingSourceKey(
    offsiteWorkRequestId: string,
    stepNo: number,
  ) {
    return `offsite:${offsiteWorkRequestId}:pending:${stepNo}`;
  }

  private findPendingOffsiteStep(snapshot: unknown) {
    const value = snapshot as {
      steps?: Array<{
        id?: string;
        stepNo: number;
        nameTh: string;
        expectedApproverId?: string | null;
        expectedEmployeeId?: string | null;
        roleCode?: string | null;
        status: string;
      }>;
    } | null;

    return value?.steps?.find((step) => step.status === "PENDING") ?? null;
  }

  private async findEmployeeForNotification(employeeId: string) {
    return this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        userId: true,
      },
    });
  }

  private formatPlainTimeRange(startTime: string, endTime: string) {
    return `${startTime} - ${endTime}`;
  }

  private overtimePendingSourceKey(overtimeRequestId: string, stepNo: number) {
    return `overtime:${overtimeRequestId}:pending:${stepNo}`;
  }

  private formatThaiTimeRange(startTime: Date, endTime: Date) {
    const formatter = new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${formatter.format(startTime)} - ${formatter.format(endTime)}`;
  }

  private formatDecimalHours(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric.toLocaleString("th-TH") : "0";
  }

  private leavePendingSourceKey(leaveRequestId: string, stepNo: number) {
    return `leave:${leaveRequestId}:pending:${stepNo}`;
  }

  private getLeaveTypeDisplayName(leaveType: {
    code: string;
    nameTh: string;
    nameEn: string | null;
  }) {
    return leaveType.nameTh || leaveType.nameEn || leaveType.code;
  }

  private formatThaiDateRange(startDate: Date, endDate: Date) {
    const formatter = new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
    });
    const start = formatter.format(startDate);
    const end = formatter.format(endDate);

    return start === end ? start : `${start} - ${end}`;
  }

  private formatThaiDate(value: Date) {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
    }).format(value);
  }

  private formatDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  private timeAdjustPendingSourceKey(
    timeAdjustRequestId: string,
    stepNo: number,
  ) {
    return `time-adjust:${timeAdjustRequestId}:pending:${stepNo}`;
  }

  private getEmployeeDisplayName(employee: {
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
  }) {
    const fullName = `${employee.firstName} ${employee.lastName}`.trim();
    return employee.displayName || fullName || employee.employeeCode;
  }

  private formatThaiDateTime(value: Date) {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  }

  private uniqueUserIds(userIds: Array<string | null | undefined>) {
    return Array.from(
      new Set(userIds.filter((userId): userId is string => Boolean(userId))),
    );
  }

  private async findEmployeeActorByUserId(userId: string | null | undefined) {
    if (!userId) {
      return null;
    }

    return this.prisma.employee.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        userId: true,
      },
    });
  }

  private getActorDisplayName(
    actor: {
      employeeCode: string;
      firstName: string;
      lastName: string;
      displayName: string | null;
    } | null,
  ) {
    return actor ? this.getEmployeeDisplayName(actor) : "ผู้อนุมัติ";
  }

  private buildActorMetadata(
    actorUserId: string | null | undefined,
    actor: { id: string } | null,
  ) {
    return {
      actorUserId: actorUserId ?? null,
      actorEmployeeId: actor?.id ?? null,
    };
  }

  private async findLatestTimeAdjustActorUserId(
    timeAdjustRequestId: string,
    actions: TimeAdjustApprovalAction[],
  ) {
    const log = await this.prisma.timeAdjustLog.findFirst({
      where: {
        timeAdjustRequestId,
        action: { in: actions },
        actedById: { not: null },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        actedById: true,
      },
    });

    return log?.actedById ?? null;
  }

  private async findLatestLeaveActorUserId(
    leaveRequestId: string,
    actions: LeaveApprovalAction[],
  ) {
    const log = await this.prisma.leaveApprovalLog.findFirst({
      where: {
        leaveRequestId,
        action: { in: actions },
        approvedById: { not: null },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        approvedById: true,
      },
    });

    return log?.approvedById ?? null;
  }

  private async findLatestOvertimeActorUserId(
    overtimeRequestId: string,
    actions: OvertimeApprovalAction[],
  ) {
    const log = await this.prisma.overtimeApprovalLog.findFirst({
      where: {
        overtimeRequestId,
        action: { in: actions },
        approvedById: { not: null },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        approvedById: true,
      },
    });

    return log?.approvedById ?? null;
  }

  private async findLatestDocumentActorUserId(
    documentRequestId: string,
    actions: DocumentApprovalAction[],
  ) {
    const approval = await this.prisma.documentApproval.findFirst({
      where: {
        documentRequestId,
        action: { in: actions },
        actedById: { not: null },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        actedById: true,
      },
    });

    return approval?.actedById ?? null;
  }

  private findLatestOffsiteActorUserId(snapshot: unknown, statuses: string[]) {
    const value = snapshot as {
      steps?: Array<{
        status?: string;
        actedById?: string | null;
        actedAt?: string | null;
      }>;
    } | null;

    const matchedStep = value?.steps
      ?.filter(
        (step) =>
          Boolean(step.actedById) &&
          Boolean(step.actedAt) &&
          Boolean(step.status) &&
          statuses.includes(step.status ?? ""),
      )
      .sort(
        (a, b) =>
          new Date(b.actedAt ?? 0).getTime() -
          new Date(a.actedAt ?? 0).getTime(),
      )[0];

    return matchedStep?.actedById ?? null;
  }

  private emitNotificationUpdatedSignal(
    userIds: Array<string | null | undefined>,
  ) {
    const uniqueUserIds = this.uniqueUserIds(userIds);
    this.invalidateSummaryCache(uniqueUserIds);

    const event: NotificationRealtimeEvent = {
      type: "NOTIFICATION_UPDATED",
      totalCount: 0,
      unreadCount: 0,
      sidebarBadges: {},
      generatedAt: new Date().toISOString(),
    };

    uniqueUserIds.forEach((userId) => {
      const currentSubscribers = this.subscribers.get(userId);

      if (!currentSubscribers || currentSubscribers.size === 0) {
        return;
      }

      currentSubscribers.forEach((subscriber) => subscriber(event));
    });
  }

  private async syncAttendanceAlerts(currentUser: CurrentNotificationUser) {
    await this.syncEmployeeAttendanceAlerts(currentUser);
  }

  async syncScheduledAttendanceAlerts(targetDate: Date = new Date()) {
    const workDate = this.startOfDay(targetDate);

    /*
     * ดึงทีละหน้า ไม่ดึงทั้งวันมาไว้ในหน่วยความจำพร้อมกัน
     *
     * งานนี้เป็นงานตั้งเวลาที่กวาดพนักงานทุกคนของทุกบริษัทในวันเดียว
     * ของเดิมเป็น findMany ที่ไม่จำกัดจำนวน บริษัทที่มีพนักงานหลักพัน
     * จะโหลดทั้งหมดขึ้นมาพร้อมกันแล้ววนยิง upsert ต่อทีละคน
     * ตารางนี้โตขึ้นทุกวันโดยไม่มีเพดาน จึงต้องแบ่งหน้าตั้งแต่ต้น
     *
     * ใช้ cursor แทน skip เพราะ skip ทำให้ฐานข้อมูลต้องนับข้ามใหม่ทุกหน้า
     */
    const pageSize = 200;

    const changedUserIds: string[] = [];
    let syncedEmployeeCount = 0;
    let changedNotificationCount = 0;
    let closedNotificationCount = 0;
    let cursorId: string | null = null;

    for (;;) {
      const summaries = await this.prisma.attendanceDailySummary.findMany({
        where: {
          workDate,
        },
        take: pageSize,
        orderBy: { id: "asc" },
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          employeeId: true,
          workDate: true,
          morningInAt: true,
          afternoonInAt: true,
          checkOutAt: true,
          isMorningMissing: true,
          isAfternoonMissing: true,
          isCheckoutMissing: true,
          hasMissingLog: true,
          isAbsent: true,
          totalLateMinutes: true,
          earlyCheckoutMinutes: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
              userId: true,
            },
          },
        },
      });

      if (summaries.length === 0) {
        break;
      }

      cursorId = summaries[summaries.length - 1]?.id ?? null;

      for (const summary of summaries) {
        if (!summary.employee?.userId) {
          continue;
        }

        syncedEmployeeCount += 1;

        const activeAlerts = this.buildEmployeeAttendanceAlertItems(
          summary.employee,
          summary,
        );
        const activeSourceKeys = activeAlerts.map((alert) => alert.sourceKey);

        for (const alert of activeAlerts) {
          const changed = await this.upsertAttendanceNotificationForUser(
            summary.employee.userId,
            alert,
          );

          if (changed) {
            changedNotificationCount += 1;
            changedUserIds.push(summary.employee.userId);
          }
        }

        const closedUserIds = await this.closeResolvedEmployeeAttendanceAlerts({
          userId: summary.employee.userId,
          employeeId: summary.employee.id,
          dateKey: this.formatDateKey(summary.workDate),
          activeSourceKeys,
        });

        if (closedUserIds.length > 0) {
          closedNotificationCount += closedUserIds.length;
          changedUserIds.push(...closedUserIds);
        }
      }

      if (summaries.length < pageSize) {
        break;
      }
    }

    const hrResult = await this.syncHrAttendanceIssueNotification(workDate);
    changedUserIds.push(...hrResult.changedUserIds);

    this.emitNotificationUpdatedSignal(changedUserIds);

    return {
      syncedEmployeeCount,
      changedNotificationCount,
      closedNotificationCount,
      hrRecipientCount: hrResult.hrRecipientCount,
      workDate: this.formatDateKey(workDate),
    };
  }

  private async syncEmployeeAttendanceAlerts(
    currentUser: CurrentNotificationUser,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: currentUser.id,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        userId: true,
      },
    });

    if (!employee?.userId) {
      return;
    }

    const today = this.startOfDay(new Date());
    const todayKey = this.formatDateKey(today);
    const summary = await this.prisma.attendanceDailySummary.findFirst({
      where: {
        employeeId: employee.id,
        workDate: today,
      },
      select: {
        id: true,
        employeeId: true,
        workDate: true,
        morningInAt: true,
        afternoonInAt: true,
        checkOutAt: true,
        isMorningMissing: true,
        isAfternoonMissing: true,
        isCheckoutMissing: true,
        hasMissingLog: true,
        isAbsent: true,
        totalLateMinutes: true,
        earlyCheckoutMinutes: true,
      },
    });

    const activeAlerts = summary
      ? this.buildEmployeeAttendanceAlertItems(employee, summary)
      : [];
    const activeSourceKeys = activeAlerts.map((alert) => alert.sourceKey);

    const changedUserIds: string[] = [];

    for (const alert of activeAlerts) {
      const changed = await this.upsertAttendanceNotificationForUser(
        employee.userId,
        alert,
      );

      if (changed) {
        changedUserIds.push(employee.userId);
      }
    }

    const closedUserIds = await this.closeResolvedEmployeeAttendanceAlerts({
      userId: employee.userId,
      employeeId: employee.id,
      dateKey: todayKey,
      activeSourceKeys,
    });

    this.emitNotificationUpdatedSignal([...changedUserIds, ...closedUserIds]);
  }

  private buildEmployeeAttendanceAlertItems(
    employee: {
      id: string;
      employeeCode: string;
      firstName: string;
      lastName: string;
      displayName: string | null;
    },
    summary: {
      id: string;
      employeeId: string;
      workDate: Date;
      morningInAt: Date | null;
      afternoonInAt: Date | null;
      checkOutAt: Date | null;
      isMorningMissing: boolean;
      isAfternoonMissing: boolean;
      isCheckoutMissing: boolean;
      hasMissingLog: boolean;
      isAbsent: boolean;
      totalLateMinutes: number;
      earlyCheckoutMinutes: number;
    },
  ) {
    const dateKey = this.formatDateKey(summary.workDate);
    const thaiDate = this.formatThaiDate(summary.workDate);
    const employeeName = this.getEmployeeDisplayName(employee);
    const baseMetadata = {
      source: "ATTENDANCE_DAILY_SUMMARY",
      workDate: dateKey,
      employeeId: employee.id,
      attendanceDailySummaryId: summary.id,
      active: true,
    };

    const alerts: Array<{
      isActive: boolean;
      sourceKey: string;
      title: string;
      message: string;
      type: string;
      severity: NotificationSeverity;
      entityType: string;
      entityId: string;
      link: string;
      count: number;
      metadata: Record<string, unknown>;
    }> = [
      {
        isActive: summary.isAbsent,
        sourceKey: this.attendanceAlertSourceKey(
          summary.employeeId,
          dateKey,
          "absent",
        ),
        title: "ระบบพบรายการขาดงาน",
        message: `${thaiDate} ระบบพบว่า ${employeeName} ไม่มีรายการเวลาเข้าออกงาน กรุณาตรวจสอบหรือยื่นคำขอแก้ไขเวลา`,
        type: "ATTENDANCE_ABSENT_ALERT",
        severity: "DANGER",
        entityType: "AttendanceDailySummary",
        entityId: summary.id,
        link: "/ess/my-attendance",
        count: 1,
        metadata: {
          ...baseMetadata,
          alertKind: "absent",
        },
      },
      {
        isActive: summary.isMorningMissing,
        sourceKey: this.attendanceAlertSourceKey(
          summary.employeeId,
          dateKey,
          "missing-morning",
        ),
        title: "ยังไม่มีเวลาเข้าเช้า",
        message: `${thaiDate} ยังไม่มีเวลาเข้าเช้า กรุณาตรวจสอบหรือยื่นคำขอแก้ไขเวลา`,
        type: "ATTENDANCE_MISSING_MORNING_ALERT",
        severity: "WARNING",
        entityType: "AttendanceDailySummary",
        entityId: summary.id,
        link: "/ess/my-attendance",
        count: 1,
        metadata: {
          ...baseMetadata,
          alertKind: "missing-morning",
        },
      },
      {
        isActive: summary.isAfternoonMissing,
        sourceKey: this.attendanceAlertSourceKey(
          summary.employeeId,
          dateKey,
          "missing-afternoon",
        ),
        title: "ยังไม่มีเวลาเข้าบ่าย",
        message: `${thaiDate} ยังไม่มีเวลาเข้าบ่าย กรุณาตรวจสอบหรือยื่นคำขอแก้ไขเวลา`,
        type: "ATTENDANCE_MISSING_AFTERNOON_ALERT",
        severity: "WARNING",
        entityType: "AttendanceDailySummary",
        entityId: summary.id,
        link: "/ess/my-attendance",
        count: 1,
        metadata: {
          ...baseMetadata,
          alertKind: "missing-afternoon",
        },
      },
      {
        isActive: summary.isCheckoutMissing,
        sourceKey: this.attendanceAlertSourceKey(
          summary.employeeId,
          dateKey,
          "missing-checkout",
        ),
        title: "ยังไม่มีเวลาออกงาน",
        message: `${thaiDate} ยังไม่มีเวลาออกงาน กรุณาตรวจสอบหรือยื่นคำขอแก้ไขเวลา`,
        type: "ATTENDANCE_MISSING_CHECKOUT_ALERT",
        severity: "WARNING",
        entityType: "AttendanceDailySummary",
        entityId: summary.id,
        link: "/ess/my-attendance",
        count: 1,
        metadata: {
          ...baseMetadata,
          alertKind: "missing-checkout",
        },
      },
      {
        isActive: summary.totalLateMinutes > 0,
        sourceKey: this.attendanceAlertSourceKey(
          summary.employeeId,
          dateKey,
          "late",
        ),
        title: "ระบบพบรายการมาสาย",
        message: `${thaiDate} ระบบพบว่าคุณมาสายรวม ${summary.totalLateMinutes.toLocaleString(
          "th-TH",
        )} นาที`,
        type: "ATTENDANCE_LATE_ALERT",
        severity: "WARNING",
        entityType: "AttendanceDailySummary",
        entityId: summary.id,
        link: "/ess/my-attendance",
        count: summary.totalLateMinutes,
        metadata: {
          ...baseMetadata,
          alertKind: "late",
          totalLateMinutes: summary.totalLateMinutes,
        },
      },
      {
        isActive: summary.earlyCheckoutMinutes > 0,
        sourceKey: this.attendanceAlertSourceKey(
          summary.employeeId,
          dateKey,
          "early-leave",
        ),
        title: "ระบบพบรายการกลับก่อน",
        message: `${thaiDate} ระบบพบว่าคุณออกก่อนเวลารวม ${summary.earlyCheckoutMinutes.toLocaleString(
          "th-TH",
        )} นาที`,
        type: "ATTENDANCE_EARLY_LEAVE_ALERT",
        severity: "DANGER",
        entityType: "AttendanceDailySummary",
        entityId: summary.id,
        link: "/ess/my-attendance",
        count: summary.earlyCheckoutMinutes,
        metadata: {
          ...baseMetadata,
          alertKind: "early-leave",
          earlyCheckoutMinutes: summary.earlyCheckoutMinutes,
        },
      },
    ];

    return alerts.filter((alert) => alert.isActive);
  }

  private async upsertAttendanceNotificationForUser(
    userId: string,
    params: {
      sourceKey: string;
      title: string;
      message: string;
      type: string;
      severity: NotificationSeverity;
      entityType: string;
      entityId: string;
      link: string;
      count: number;
      metadata: Record<string, unknown>;
    },
  ) {
    const existing = (await this.notificationDelegate.findFirst({
      where: {
        userId,
        sourceKey: params.sourceKey,
      },
    })) as NotificationRecord | null;

    const nextData = {
      userId,
      sourceKey: params.sourceKey,
      title: params.title,
      message: params.message,
      type: params.type,
      severity: params.severity,
      entityType: params.entityType,
      entityId: params.entityId,
      link: params.link,
      count: params.count,
      metadata: params.metadata,
      readAt:
        existing && !this.isResolvedNotification(existing)
          ? existing.readAt
          : null,
    };

    if (!existing) {
      await this.notificationDelegate.create({ data: nextData });
      return true;
    }

    const shouldUpdate =
      existing.title !== params.title ||
      existing.message !== params.message ||
      existing.type !== params.type ||
      existing.severity !== params.severity ||
      existing.entityType !== params.entityType ||
      existing.entityId !== params.entityId ||
      existing.link !== params.link ||
      existing.count !== params.count ||
      this.isResolvedNotification(existing);

    if (!shouldUpdate) {
      return false;
    }

    await this.notificationDelegate.update({
      where: {
        id: existing.id,
      },
      data: nextData,
    });

    return true;
  }

  private async closeResolvedEmployeeAttendanceAlerts(params: {
    userId: string;
    employeeId: string;
    dateKey: string;
    activeSourceKeys: string[];
  }) {
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        userId: params.userId,
        sourceKey: {
          startsWith: `attendance:${params.employeeId}:${params.dateKey}:`,
        },
      },
      select: {
        id: true,
        userId: true,
        sourceKey: true,
        readAt: true,
      },
    })) as Array<{
      id: string;
      userId: string;
      sourceKey: string;
      readAt: Date | null;
    }>;

    const activeSourceKeySet = new Set(params.activeSourceKeys);
    const recordsToClose = existingRecords.filter(
      (record) => !activeSourceKeySet.has(record.sourceKey),
    );

    if (recordsToClose.length === 0) {
      return [];
    }

    const readAt = new Date();

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: recordsToClose.map((record) => record.id),
        },
      },
      data: {
        readAt,
        metadata: {
          source: "ATTENDANCE_DAILY_SUMMARY",
          active: false,
          resolvedAt: readAt.toISOString(),
        },
      },
    });

    return recordsToClose.map((record) => record.userId);
  }

  private async syncHrAttendanceIssueNotification(workDate: Date) {
    const [permissionUserIds, adminUserIds, item] = await Promise.all([
      this.findActiveUsersByPermissionCodes([
        "ATTENDANCE_READ",
        "ATTENDANCE_READ_ALL",
      ]),
      this.findActiveUsersByRoleCodes(["ADMIN", "SUPER_ADMIN"]),
      this.buildAttendanceIssueItemByDate(workDate),
    ]);
    const recipientUserIds = this.uniqueUserIds([
      ...permissionUserIds,
      ...adminUserIds,
    ]);

    if (!item) {
      const changedUserIds = await this.closeNotificationSourceKeyForUsers(
        recipientUserIds,
        "attendance-daily-issues",
      );

      return {
        changedUserIds,
        hrRecipientCount: recipientUserIds.length,
      };
    }

    const changedUserIds = await this.syncNotificationItemForUsers(
      recipientUserIds,
      item,
    );

    return {
      changedUserIds,
      hrRecipientCount: recipientUserIds.length,
    };
  }

  private async syncNotificationItemForUsers(
    userIds: Array<string | null | undefined>,
    item: NotificationItem,
  ) {
    const uniqueUserIds = this.uniqueUserIds(userIds);
    const changedUserIds: string[] = [];

    for (const userId of uniqueUserIds) {
      const existing = (await this.notificationDelegate.findFirst({
        where: {
          userId,
          sourceKey: item.key,
        },
      })) as NotificationRecord | null;

      const data = {
        userId,
        sourceKey: item.key,
        title: item.title,
        message: item.message,
        type: item.type ?? this.toNotificationType(item.key),
        severity: item.severity,
        entityType: item.entityType ?? null,
        entityId: item.entityId ?? null,
        link: item.href,
        count: item.count,
        metadata: {
          source: "SCHEDULED_PENDING_COUNT",
          count: item.count,
          active: true,
        },
      };

      if (!existing) {
        await this.notificationDelegate.create({
          data: {
            ...data,
            readAt: null,
          },
        });
        changedUserIds.push(userId);
        continue;
      }

      const countIncreased = item.count > existing.count;
      const isResolved = this.isResolvedNotification(existing);
      const shouldUpdate =
        existing.title !== item.title ||
        existing.message !== item.message ||
        existing.count !== item.count ||
        existing.severity !== item.severity ||
        existing.entityType !== (item.entityType ?? null) ||
        existing.entityId !== (item.entityId ?? null) ||
        existing.link !== item.href ||
        isResolved;

      if (!shouldUpdate) {
        continue;
      }

      await this.notificationDelegate.update({
        where: {
          id: existing.id,
        },
        data: {
          ...data,
          readAt: countIncreased || isResolved ? null : existing.readAt,
        },
      });
      changedUserIds.push(userId);
    }

    return changedUserIds;
  }

  private async closeNotificationSourceKeyForUsers(
    userIds: Array<string | null | undefined>,
    sourceKey: string,
  ) {
    const uniqueUserIds = this.uniqueUserIds(userIds);

    if (uniqueUserIds.length === 0) {
      return [];
    }

    const records = (await this.notificationDelegate.findMany({
      where: {
        userId: {
          in: uniqueUserIds,
        },
        sourceKey,
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    })) as Array<{ id: string; userId: string }>;

    if (records.length === 0) {
      return [];
    }

    const readAt = new Date();
    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: records.map((record) => record.id),
        },
      },
      data: {
        readAt,
        metadata: {
          source: "SCHEDULED_PENDING_COUNT",
          active: false,
          resolvedAt: readAt.toISOString(),
        },
      },
    });

    return records.map((record) => record.userId);
  }

  private async closeResolvedAttendanceLiveNotifications(
    currentUser: CurrentNotificationUser,
    liveItems: NotificationItem[],
  ) {
    if (!currentUser.id) {
      return;
    }

    const hasAttendanceIssues = liveItems.some(
      (item) => item.key === "attendance-daily-issues",
    );

    if (hasAttendanceIssues) {
      return;
    }

    const readAt = new Date();
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        userId: currentUser.id,
        sourceKey: "attendance-daily-issues",
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    })) as Array<{ id: string; userId: string }>;

    if (existingRecords.length === 0) {
      return;
    }

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: existingRecords.map((record) => record.id),
        },
      },
      data: {
        readAt,
      },
    });

    this.emitNotificationUpdatedSignal(
      existingRecords.map((record) => record.userId),
    );
  }

  private async closeResolvedApprovalLiveNotifications(
    currentUser: CurrentNotificationUser,
    liveItems: NotificationItem[],
  ) {
    if (!currentUser.id) {
      return;
    }

    const pendingApprovalKeys = [
      "pending-leave-requests",
      "pending-overtime-requests",
      "pending-time-adjust-requests",
      "pending-offsite-requests",
      "pending-document-requests",
    ];
    const activeKeys = new Set(liveItems.map((item) => item.key));
    const inactiveKeys = pendingApprovalKeys.filter(
      (key) => !activeKeys.has(key),
    );

    if (inactiveKeys.length === 0) {
      return;
    }

    const readAt = new Date();
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        userId: currentUser.id,
        sourceKey: {
          in: inactiveKeys,
        },
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    })) as Array<{ id: string; userId: string }>;

    if (existingRecords.length === 0) {
      return;
    }

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: existingRecords.map((record) => record.id),
        },
      },
      data: {
        readAt,
      },
    });

    this.emitNotificationUpdatedSignal(
      existingRecords.map((record) => record.userId),
    );
  }

  private isResolvedNotification(record: NotificationRecord) {
    const metadata = record.metadata as {
      active?: boolean;
      resolvedAt?: string | null;
    } | null;

    return Boolean(metadata?.resolvedAt || metadata?.active === false);
  }

  private attendanceAlertSourceKey(
    employeeId: string,
    dateKey: string,
    alertKind: string,
  ) {
    return `attendance:${employeeId}:${dateKey}:${alertKind}`;
  }

  private async syncPayrollReviewAlerts(currentUser: CurrentNotificationUser) {
    if (
      !this.hasAnyPermission(currentUser, [
        "PAYROLL_READ",
        "APPROVAL_ACCESS",
        "ATTENDANCE_READ",
        "ATTENDANCE_READ_ALL",
      ])
    ) {
      return;
    }

    await this.syncScheduledPayrollReviewAlerts(new Date());
  }

  async syncScheduledPayrollReviewAlerts(targetDate: Date = new Date()) {
    const recipientUserIds = await this.resolvePayrollReviewRecipientUserIds();

    if (recipientUserIds.length === 0) {
      return {
        periodKey: this.formatDateKey(this.startOfDay(targetDate)),
        recipientCount: 0,
        activeItemCount: 0,
        changedNotificationCount: 0,
        closedNotificationCount: 0,
      };
    }

    const windows = await this.resolvePayrollReviewWindows(targetDate);
    const items = (await Promise.all(
      windows.map((window) => this.buildPayrollReviewAlertItems(window)),
    )).flat();
    const activeSourceKeys = items.map((item) => item.key);
    const changedUserIds: string[] = [];
    let changedNotificationCount = 0;

    for (const item of items) {
      const changedForItem = await this.syncNotificationItemForUsers(
        recipientUserIds,
        item,
      );
      changedNotificationCount += changedForItem.length;
      changedUserIds.push(...changedForItem);
    }

    const closedUserIds = await this.closeInactivePayrollReviewNotifications({
      userIds: recipientUserIds,
      activeSourceKeys,
    });

    this.emitNotificationUpdatedSignal([...changedUserIds, ...closedUserIds]);

    return {
      periodKey: windows.map((window) => window.periodKey).join(","),
      recipientCount: recipientUserIds.length,
      activeItemCount: items.length,
      changedNotificationCount,
      closedNotificationCount: closedUserIds.length,
    };
  }

  private async resolvePayrollReviewRecipientUserIds() {
    const [permissionUserIds, adminUserIds] = await Promise.all([
      this.findActiveUsersByPermissionCodes([
        "PAYROLL_READ",
        "APPROVAL_ACCESS",
        "ATTENDANCE_READ_ALL",
      ]),
      this.findActiveUsersByRoleCodes(["ADMIN", "SUPER_ADMIN"]),
    ]);

    return this.uniqueUserIds([...permissionUserIds, ...adminUserIds]);
  }

  private async resolvePayrollReviewWindows(targetDate: Date) {
    const companies = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        status: MasterStatus.ACTIVE,
      },
      orderBy: [{ code: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        nameTh: true,
        nameEn: true,
      },
    });

    if (companies.length === 0) {
      return [await this.resolvePayrollReviewWindow(targetDate, null)];
    }

    return Promise.all(
      companies.map((company) => this.resolvePayrollReviewWindow(targetDate, company)),
    );
  }

  private async resolvePayrollReviewWindow(
    targetDate: Date,
    company: PayrollReviewCompanyScope | null,
  ): Promise<PayrollReviewWindow> {
    const targetDay = this.startOfDay(targetDate);
    const companyId = company?.id ?? null;
    const companyLabel = this.formatPayrollReviewCompanyLabel(company);
    const activePeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        startDate: {
          lte: targetDay,
        },
        endDate: {
          gte: targetDay,
        },
        status: {
          in: [
            PayrollPeriodStatus.DRAFT,
            PayrollPeriodStatus.OPEN,
            PayrollPeriodStatus.LOCKED,
          ],
        },
      },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        code: true,
        name: true,
        startDate: true,
        endDate: true,
      },
    });

    if (activePeriod) {
      const periodKey = activePeriod.code || activePeriod.id;

      return {
        periodId: activePeriod.id,
        periodKey: this.payrollReviewPeriodKey(companyId, periodKey),
        label: activePeriod.name || activePeriod.code,
        startDate: this.startOfDay(activePeriod.startDate),
        endDate: this.startOfDay(activePeriod.endDate),
        companyId,
        companyLabel,
      };
    }

    const settings = await this.resolvePayrollReviewSettings(companyId);
    const fallbackPeriod = this.resolvePayrollReviewWindowFromSettings(
      targetDay,
      {
        payrollPeriodStartDay: settings.payrollPeriodStartDay,
        payrollCutoffDay: settings.payrollCutoffDay,
      },
    );

    return {
      periodId: null,
      periodKey: this.payrollReviewPeriodKey(companyId, fallbackPeriod.periodKey),
      label: this.formatThaiDateRange(
        fallbackPeriod.startDate,
        fallbackPeriod.endDate,
      ),
      startDate: fallbackPeriod.startDate,
      endDate: fallbackPeriod.endDate,
      companyId,
      companyLabel,
    };
  }

  private async resolvePayrollReviewSettings(companyId: string | null) {
    if (companyId) {
      return this.companyPayrollSettingsService.resolvePayrollCalculationSettings(
        companyId,
      );
    }

    const settings = await this.systemSettingsService.getSystemSettings();

    return {
      payrollPeriodStartDay: settings.payrollPeriodStartDay,
      payrollCutoffDay: settings.payrollCutoffDay,
    };
  }

  private formatPayrollReviewCompanyLabel(
    company: PayrollReviewCompanyScope | null,
  ) {
    if (!company) return null;

    return company.nameTh || company.nameEn || company.code || company.id;
  }

  private payrollReviewPeriodKey(companyId: string | null, periodKey: string) {
    return companyId
      ? ["company", companyId, periodKey].join(":")
      : ["global", periodKey].join(":");
  }

  private resolvePayrollReviewWindowFromSettings(
    targetDay: Date,
    settings: {
      payrollPeriodStartDay?: number | null;
      payrollCutoffDay?: number | null;
    },
  ) {
    const startDay = this.normalizePayrollCutoffDay(
      settings.payrollPeriodStartDay,
      26,
    );
    const cutoffDay = this.normalizePayrollCutoffDay(
      settings.payrollCutoffDay,
      25,
    );
    const targetKey = this.formatDateKey(targetDay);
    const baseYear = targetDay.getFullYear();
    const baseMonth = targetDay.getMonth() + 1;

    const candidates = [-1, 0, 1].map((offset) =>
      this.buildPayrollReviewWindowForMonth(
        baseYear,
        baseMonth + offset,
        startDay,
        cutoffDay,
      ),
    );

    return (
      candidates.find((candidate) => {
        const startKey = this.formatDateKey(candidate.startDate);
        const endKey = this.formatDateKey(candidate.endDate);
        return startKey <= targetKey && targetKey <= endKey;
      }) || candidates[1]
    );
  }

  private buildPayrollReviewWindowForMonth(
    year: number,
    month: number,
    startDay: number,
    cutoffDay: number,
  ) {
    const payrollMonthDate = new Date(year, month - 1, 1);
    const payrollYear = payrollMonthDate.getFullYear();
    const payrollMonth = payrollMonthDate.getMonth();
    const crossesMonth = startDay > cutoffDay;
    const startDate = this.createClampedDate(
      payrollYear,
      payrollMonth - (crossesMonth ? 1 : 0),
      startDay,
    );
    const endDate = this.createClampedDate(
      payrollYear,
      payrollMonth,
      cutoffDay,
    );

    return {
      periodKey: [
        "payroll-settings",
        this.formatDateKey(startDate),
        this.formatDateKey(endDate),
      ].join(":"),
      startDate,
      endDate,
    };
  }

  private normalizePayrollCutoffDay(
    value: number | null | undefined,
    fallback: number,
  ) {
    const day = Number(value);
    if (!Number.isFinite(day)) return fallback;
    return Math.min(Math.max(Math.trunc(day), 1), 31);
  }

  private createClampedDate(year: number, monthIndex: number, day: number) {
    return new Date(
      year,
      monthIndex,
      Math.min(day, new Date(year, monthIndex + 1, 0).getDate()),
    );
  }

  private async buildPayrollReviewAlertItems(window: PayrollReviewWindow) {
    const endExclusive = this.addDays(window.endDate, 1);
    const employeeCompanyWhere = window.companyId
      ? { employee: { companyId: window.companyId } }
      : {};
    const companyWhere = window.companyId
      ? { companyId: window.companyId }
      : {};
    const [
      attendanceNotReadyCount,
      pendingTimeAdjustCount,
      pendingOvertimeCount,
      pendingOffsiteCount,
      hrReviewPendingCount,
    ] = await Promise.all([
      this.prisma.attendanceDailySummary.count({
        where: {
          ...employeeCompanyWhere,
          workDate: {
            gte: window.startDate,
            lt: endExclusive,
          },
          sentToPayrollAt: null,
          OR: [
            { readyForPayrollAt: null },
            {
              reviewStatus: {
                in: [
                  AttendanceReviewStatus.CALCULATED,
                  AttendanceReviewStatus.NEED_REVIEW,
                  AttendanceReviewStatus.REVIEWED,
                ],
              },
            },
            { hasMissingLog: true },
            { isAbsent: true },
            { totalLateMinutes: { gt: 0 } },
            { earlyCheckoutMinutes: { gt: 0 } },
          ],
        },
      }),
      this.prisma.timeAdjustRequest.count({
        where: {
          ...employeeCompanyWhere,
          deletedAt: null,
          status: TimeAdjustRequestStatus.SUBMITTED,
          requestedLogTime: {
            gte: window.startDate,
            lt: endExclusive,
          },
        },
      }),
      this.prisma.overtimeRequest.count({
        where: {
          ...employeeCompanyWhere,
          deletedAt: null,
          status: OvertimeRequestStatus.SUBMITTED,
          workDate: {
            gte: window.startDate,
            lt: endExclusive,
          },
        },
      }),
      this.prisma.offsiteWorkRequest.count({
        where: {
          ...companyWhere,
          deletedAt: null,
          status: {
            in: [
              OffsiteRequestStatus.SUBMITTED,
              OffsiteRequestStatus.MANAGER_APPROVED,
            ],
          },
          workDate: {
            gte: window.startDate,
            lt: endExclusive,
          },
        },
      }),
      this.prisma.hrReviewItem.count({
        where: {
          ...companyWhere,
          ...(window.periodId ? { periodId: window.periodId } : {}),
          sentToPayrollAt: null,
          status: {
            in: [HrReviewStatus.REVIEWED, HrReviewStatus.ON_HOLD],
          },
        },
      }),
    ]);

    const periodText = window.companyLabel
      ? `${window.companyLabel} · ${window.label}`
      : window.label;
    const items: Array<NotificationItem | null> = [
      this.createItem({
        key: this.payrollReviewSourceKey(
          window.periodKey,
          "attendance-not-ready",
        ),
        title: "ตรวจสอบก่อนเข้าเงินเดือน",
        message: `งวด ${periodText} มีข้อมูลเวลาทำงาน ${attendanceNotReadyCount} รายการที่ยังไม่พร้อมเข้าเงินเดือน`,
        count: attendanceNotReadyCount,
        href: "/hr-review",
        severity: "DANGER",
        entityType: "AttendanceDailySummary",
      }),
      this.createItem({
        key: this.payrollReviewSourceKey(
          window.periodKey,
          "pending-time-adjust",
        ),
        title: "คำขอแก้เวลาค้างก่อนเข้าเงินเดือน",
        message: `งวด ${periodText} มีคำขอแก้เวลา ${pendingTimeAdjustCount} รายการค้างอนุมัติก่อนเข้าเงินเดือน`,
        count: pendingTimeAdjustCount,
        href: "/hr/time-adjust",
        severity: "WARNING",
        entityType: "TimeAdjustRequest",
      }),
      this.createItem({
        key: this.payrollReviewSourceKey(window.periodKey, "pending-overtime"),
        title: "OT ค้างก่อนเข้าเงินเดือน",
        message: `งวด ${periodText} มีคำขอ OT ${pendingOvertimeCount} รายการยังไม่อนุมัติก่อนคำนวณเงินเดือน`,
        count: pendingOvertimeCount,
        href: "/hr/overtime",
        severity: "WARNING",
        entityType: "OvertimeRequest",
      }),
      this.createItem({
        key: this.payrollReviewSourceKey(window.periodKey, "pending-offsite"),
        title: "Offsite Work ค้างก่อนเข้าเงินเดือน",
        message: `งวด ${periodText} มีคำขอทำงานนอกสถานที่ ${pendingOffsiteCount} รายการค้างตรวจสอบก่อนเข้าเงินเดือน`,
        count: pendingOffsiteCount,
        href: "/hr/offsite",
        severity: "WARNING",
        entityType: "OffsiteWorkRequest",
      }),
      this.createItem({
        key: this.payrollReviewSourceKey(window.periodKey, "hr-review-pending"),
        title: "รายการ HR Review ค้างส่งเข้าเงินเดือน",
        message: `งวด ${periodText} มีรายการตรวจสอบก่อนเข้าเงินเดือน ${hrReviewPendingCount} รายการที่ยังไม่ส่งเข้าเงินเดือน`,
        count: hrReviewPendingCount,
        href: "/hr-review",
        severity: "INFO",
        entityType: "HrReviewItem",
      }),
    ];

    return items.filter((item): item is NotificationItem => Boolean(item));
  }

  private async closeInactivePayrollReviewNotifications(params: {
    userIds: Array<string | null | undefined>;
    activeSourceKeys: string[];
  }) {
    const uniqueUserIds = this.uniqueUserIds(params.userIds);

    if (uniqueUserIds.length === 0) {
      return [];
    }

    const records = (await this.notificationDelegate.findMany({
      where: {
        userId: {
          in: uniqueUserIds,
        },
        sourceKey: {
          startsWith: "payroll-review:",
        },
        readAt: null,
      },
      select: {
        id: true,
        userId: true,
        sourceKey: true,
      },
    })) as Array<{ id: string; userId: string; sourceKey: string }>;

    const activeSourceKeySet = new Set(params.activeSourceKeys);
    const recordsToClose = records.filter(
      (record) => !activeSourceKeySet.has(record.sourceKey),
    );

    if (recordsToClose.length === 0) {
      return [];
    }

    const readAt = new Date();

    await this.notificationDelegate.updateMany({
      where: {
        id: {
          in: recordsToClose.map((record) => record.id),
        },
      },
      data: {
        readAt,
        metadata: {
          source: "PAYROLL_REVIEW_ALERT",
          active: false,
          resolvedAt: readAt.toISOString(),
        },
      },
    });

    return recordsToClose.map((record) => record.userId);
  }

  private payrollReviewSourceKey(periodKey: string, alertKind: string) {
    return `payroll-review:${periodKey}:${alertKind}`;
  }

  private async buildNotificationItems(currentUser: CurrentNotificationUser) {
    const tasks: Array<Promise<NotificationItem | null>> = [
      this.buildPendingLeaveItem(currentUser),
      this.buildPendingOvertimeItem(currentUser),
      this.buildPendingTimeAdjustItem(currentUser),
      this.buildPendingOffsiteItem(currentUser),
      this.buildAttendanceIssueItem(currentUser),
      this.buildHrReviewItem(currentUser),
      this.buildPendingDocumentItem(currentUser),
    ];

    const items = await Promise.all(tasks);

    return items.filter((item): item is NotificationItem => Boolean(item));
  }

  private async syncLiveNotifications(
    currentUser: CurrentNotificationUser,
    items: NotificationItem[],
  ) {
    if (!currentUser.id || items.length === 0) {
      return;
    }

    const sourceKeys = items.map((item) => item.key);
    const existingRecords = (await this.notificationDelegate.findMany({
      where: {
        userId: currentUser.id,
        sourceKey: {
          in: sourceKeys,
        },
      },
    })) as NotificationRecord[];

    const existingBySourceKey = new Map(
      existingRecords.map((record) => [record.sourceKey, record]),
    );

    await Promise.all(
      items.map(async (item) => {
        const existing = existingBySourceKey.get(item.key);
        const nextData = this.toNotificationData(currentUser, item);

        if (!existing) {
          await this.notificationDelegate.create({ data: nextData });
          return;
        }

        const countIncreased = item.count > existing.count;
        const shouldUpdate =
          existing.title !== item.title ||
          existing.message !== item.message ||
          existing.count !== item.count ||
          existing.severity !== item.severity ||
          existing.entityType !== (item.entityType ?? null) ||
          existing.entityId !== (item.entityId ?? null) ||
          existing.link !== item.href;

        if (!shouldUpdate) {
          return;
        }

        await this.notificationDelegate.update({
          where: {
            id: existing.id,
          },
          data: {
            ...nextData,
            readAt: countIncreased ? null : existing.readAt,
          },
        });
      }),
    );
  }

  private toNotificationData(
    currentUser: CurrentNotificationUser,
    item: NotificationItem,
  ) {
    const type = item.type ?? this.toNotificationType(item.key);

    return {
      userId: currentUser.id,
      sourceKey: item.key,
      title: item.title,
      message: item.message,
      type,
      severity: item.severity,
      entityType: item.entityType ?? null,
      entityId: item.entityId ?? null,
      link: item.href,
      count: item.count,
      metadata: {
        source: "LIVE_PENDING_COUNT",
        count: item.count,
      },
    };
  }

  private normalizeNotificationListStatus(
    status?: NotificationListQuery["status"],
  ): NotificationListStatus {
    if (status === "unread" || status === "read" || status === "all") {
      return status;
    }

    return "all";
  }

  private normalizePositiveInteger(
    value: NotificationListQuery["page"],
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(value ?? fallback);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    const normalized = Math.trunc(parsed);

    if (normalized < min) return min;
    if (normalized > max) return max;

    return normalized;
  }

  private async listNotifications(
    currentUser: CurrentNotificationUser,
    options: { onlyUnread?: boolean; take?: number } = {},
  ) {
    const records = (await this.notificationDelegate.findMany({
      where: {
        userId: currentUser.id,
        ...(options.onlyUnread ? { readAt: null } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: options.take ?? 20,
    })) as NotificationRecord[];

    return this.toNotificationItems(records);
  }

  private async toNotificationItems(records: NotificationRecord[]) {
    const actorMap = await this.buildNotificationActorMap(records);

    return records.map((record) => this.toNotificationItem(record, actorMap));
  }

  private toNotificationItem(
    record: NotificationRecord,
    actorMap: Map<string, NotificationActor> = new Map(),
  ): NotificationItem {
    const employeeId = this.extractNotificationActorEmployeeId(record);
    const actor = employeeId ? (actorMap.get(employeeId) ?? null) : null;

    /*
     * ผู้รับเองไม่นับเป็น "ผู้ทำ"
     *
     * แจ้งเตือนที่ระบบสร้างเอง (มาสาย เวลาไม่ครบ) ไม่มี actor จริง แต่ metadata
     * มี `employeeId` ของเจ้าตัวติดมาด้วยเพื่อใช้อ้างอิงรายการ ตัวหา actor จึง
     * ตกมาใช้ค่านั้นแล้วคืนเป็น "ผู้ทำ" — ผลคือผู้ใช้เห็นรูปกับชื่อตัวเอง
     * มาบอกว่าตัวเองมาสาย ซึ่งอ่านแล้วสับสนว่าใครเป็นคนแจ้ง
     *
     * ไม่แก้ที่ตัวหา เพราะการตกมาใช้ `employeeId` ถูกต้องสำหรับแจ้งเตือนของ
     * หัวหน้าที่พูดถึงลูกทีม (เช่น "ลูกทีมเริ่มลาพรุ่งนี้") ซึ่งต้องเห็นหน้าคนนั้น
     */
    return {
      id: record.id,
      key: record.sourceKey,
      title: record.title,
      message: record.message,
      count: record.count,
      href: record.link ?? "#",
      severity: this.normalizeSeverity(record.severity),
      entityType: record.entityType,
      entityId: record.entityId,
      type: record.type,
      readAt: record.readAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      actor: actor && actor.userId === record.userId ? null : actor,
    };
  }

  private async buildNotificationActorMap(records: NotificationRecord[]) {
    const employeeIds = Array.from(
      new Set(
        records
          .map((record) => this.extractNotificationActorEmployeeId(record))
          .filter((employeeId): employeeId is string => Boolean(employeeId)),
      ),
    );

    if (employeeIds.length === 0) {
      return new Map<string, NotificationActor>();
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        id: {
          in: employeeIds,
        },
        deletedAt: null,
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        position: true,
        userId: true,
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        department: {
          select: {
            nameTh: true,
            nameEn: true,
          },
        },
        positionMaster: {
          select: {
            nameTh: true,
            nameEn: true,
          },
        },
      },
    });

    return new Map(
      employees.map((employee) => [
        employee.id,
        {
          userId: employee.userId ?? employee.user?.id ?? null,
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          displayName:
            employee.displayName ||
            `${employee.firstName} ${employee.lastName}`.trim() ||
            employee.user?.displayName ||
            employee.employeeCode,
          avatarUrl: employee.user?.avatarUrl ?? null,
          position:
            employee.positionMaster?.nameTh ??
            employee.positionMaster?.nameEn ??
            employee.position ??
            null,
          departmentName:
            employee.department?.nameTh ?? employee.department?.nameEn ?? null,
        } satisfies NotificationActor,
      ]),
    );
  }

  private extractNotificationActorEmployeeId(record: NotificationRecord) {
    if (!record.metadata || typeof record.metadata !== "object") {
      return null;
    }

    const metadata = record.metadata as Record<string, unknown>;
    const actorEmployeeId = metadata.actorEmployeeId;
    const actorUserId = metadata.actorUserId;

    if (typeof actorEmployeeId === "string" && actorEmployeeId.length > 0) {
      return actorEmployeeId;
    }

    if (typeof actorUserId === "string" && actorUserId.length > 0) {
      return null;
    }

    const employeeId = metadata.employeeId;

    return typeof employeeId === "string" && employeeId.length > 0
      ? employeeId
      : null;
  }

  private async buildPendingLeaveItem(currentUser: CurrentNotificationUser) {
    if (
      !this.hasAnyPermission(currentUser, ["APPROVAL_ACCESS", "LEAVE_APPROVE"])
    ) {
      return null;
    }

    const approver = await this.resolveNotificationApprover(currentUser);
    if (!approver) return null;

    const count = await this.prisma.leaveRequest.count({
      where: {
        status: LeaveRequestStatus.SUBMITTED,
        deletedAt: null,
        approvalSteps: {
          some: buildCurrentLeaveApprovalStepWhere(approver),
        },
      },
    });

    return this.createItem({
      key: "pending-leave-requests",
      title: "การลา",
      message: `มีใบลาที่รอคุณอนุมัติ/ตรวจสอบ ${count} รายการ`,
      count,
      href: "/approvals?type=LEAVE&status=SUBMITTED",
      severity: "WARNING",
      entityType: "LeaveRequest",
    });
  }

  private async buildPendingOvertimeItem(currentUser: CurrentNotificationUser) {
    if (
      !this.hasAnyPermission(currentUser, ["APPROVAL_ACCESS", "OT_APPROVE"])
    ) {
      return null;
    }

    const approver = await this.resolveNotificationApprover(currentUser);
    if (!approver) return null;

    const count = await this.prisma.overtimeRequest.count({
      where: {
        status: OvertimeRequestStatus.SUBMITTED,
        deletedAt: null,
        approvalSteps: {
          some: buildCurrentOvertimeApprovalStepWhere(approver),
        },
      },
    });

    return this.createItem({
      key: "pending-overtime-requests",
      title: "OT",
      message: `มีคำขอ OT ที่รอคุณอนุมัติ/ตรวจสอบ ${count} รายการ`,
      count,
      href: "/approvals?type=OVERTIME&status=SUBMITTED",
      severity: "WARNING",
      entityType: "OvertimeRequest",
    });
  }

  private async buildPendingTimeAdjustItem(
    currentUser: CurrentNotificationUser,
  ) {
    if (
      !this.hasAnyPermission(currentUser, [
        "APPROVAL_ACCESS",
        "TIME_ADJUST_APPROVE",
      ])
    ) {
      return null;
    }

    const approver = await this.resolveNotificationApprover(currentUser);
    if (!approver) return null;

    const count = await this.prisma.timeAdjustRequest.count({
      where: {
        status: TimeAdjustRequestStatus.SUBMITTED,
        deletedAt: null,
        approvalSteps: {
          some: buildCurrentTimeAdjustApprovalStepWhere(approver),
        },
      },
    });

    return this.createItem({
      key: "pending-time-adjust-requests",
      title: "ขอแก้เวลา",
      message: `มีคำขอแก้ไขเวลาที่รอคุณอนุมัติ/ตรวจสอบ ${count} รายการ`,
      count,
      href: "/approvals?type=TIME_ADJUST&status=SUBMITTED",
      severity: "WARNING",
      entityType: "TimeAdjustRequest",
    });
  }

  private async buildPendingOffsiteItem(currentUser: CurrentNotificationUser) {
    if (
      !this.hasAnyPermission(currentUser, [
        "APPROVAL_ACCESS",
        "OFFSITE_REQUEST_APPROVE",
      ])
    ) {
      return null;
    }

    const approver = await this.resolveNotificationApprover(currentUser);
    if (!approver) return null;

    const prisma = this.prisma as any;
    const items = await prisma.offsiteWorkRequest.findMany({
      where: {
        status: {
          in: [
            OffsiteRequestStatus.SUBMITTED,
            OffsiteRequestStatus.MANAGER_APPROVED,
          ],
        },
        deletedAt: null,
      },
      select: {
        id: true,
        approvalSnapshot: true,
      },
      take: 5000,
    });
    const count = items.filter((item: any) =>
      this.isOffsiteRequestPendingForApprover(item, approver),
    ).length;

    return this.createItem({
      key: "pending-offsite-requests",
      title: "Offsite Work",
      message: `มีคำขอทำงานนอกสถานที่ที่รอคุณตรวจสอบ ${count} รายการ`,
      count,
      href: "/approvals?type=OFFSITE&status=SUBMITTED",
      severity: "WARNING",
      entityType: "OffsiteWorkRequest",
    });
  }

  private async buildAttendanceIssueItem(currentUser: CurrentNotificationUser) {
    if (
      !this.hasAnyPermission(currentUser, [
        "ATTENDANCE_READ",
        "ATTENDANCE_READ_ALL",
      ])
    ) {
      return null;
    }

    return this.buildAttendanceIssueItemByDate(this.startOfDay(new Date()));
  }

  private async buildAttendanceIssueItemByDate(workDate: Date) {
    const [count, missingCount, absentCount, lateCount, earlyLeaveCount] =
      await Promise.all([
        this.prisma.attendanceDailySummary.count({
          where: {
            workDate,
            OR: [
              { hasMissingLog: true },
              { isAbsent: true },
              { totalLateMinutes: { gt: 0 } },
              { earlyCheckoutMinutes: { gt: 0 } },
            ],
          },
        }),
        this.prisma.attendanceDailySummary.count({
          where: {
            workDate,
            hasMissingLog: true,
          },
        }),
        this.prisma.attendanceDailySummary.count({
          where: {
            workDate,
            isAbsent: true,
          },
        }),
        this.prisma.attendanceDailySummary.count({
          where: {
            workDate,
            totalLateMinutes: { gt: 0 },
          },
        }),
        this.prisma.attendanceDailySummary.count({
          where: {
            workDate,
            earlyCheckoutMinutes: { gt: 0 },
          },
        }),
      ]);

    return this.createItem({
      key: "attendance-daily-issues",
      title: "ตรวจเวลาทำงานรายวัน",
      message: `วันนี้มีรายการเวลาที่ควรตรวจสอบ ${count} รายการ: ข้อมูลไม่ครบ ${missingCount}, ขาดงาน ${absentCount}, มาสาย ${lateCount}, กลับก่อน ${earlyLeaveCount}`,
      count,
      href: "/attendance",
      severity: "DANGER",
      entityType: "AttendanceDailySummary",
    });
  }

  private async buildHrReviewItem(currentUser: CurrentNotificationUser) {
    if (
      !this.hasAnyPermission(currentUser, ["APPROVAL_ACCESS", "PAYROLL_READ"])
    ) {
      return null;
    }

    const count = await this.prisma.hrReviewItem.count({
      where: {
        status: {
          in: [HrReviewStatus.REVIEWED, HrReviewStatus.ON_HOLD],
        },
        sentToPayrollAt: null,
      },
    });

    return this.createItem({
      key: "hr-review-pending",
      title: "ตรวจสอบก่อนเข้าเงินเดือน",
      message: `มีรายการที่ยังไม่ส่งเข้าเงินเดือน ${count} รายการ`,
      count,
      href: "/hr-review",
      severity: "INFO",
      entityType: "HrReviewItem",
    });
  }

  private async buildPendingDocumentItem(currentUser: CurrentNotificationUser) {
    if (
      !this.hasAnyPermission(currentUser, [
        "APPROVAL_ACCESS",
        "DOCUMENT_APPROVE",
      ])
    ) {
      return null;
    }

    const approver = await this.resolveNotificationApprover(currentUser);
    if (!approver) return null;

    const items = await this.prisma.documentRequest.findMany({
      where: {
        status: DocumentRequestStatus.SUBMITTED,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            supervisorId: true,
          },
        },
        documentType: {
          select: {
            approvalLevels: true,
          },
        },
      },
      take: 5000,
    });
    const count = items.filter((item) =>
      this.isDocumentRequestPendingForApprover(item, approver),
    ).length;

    return this.createItem({
      key: "pending-document-requests",
      title: "เอกสารพนักงาน",
      message: `มีคำขอเอกสารที่รอคุณดำเนินการ ${count} รายการ`,
      count,
      href: "/approvals?type=DOCUMENT&status=SUBMITTED",
      severity: "WARNING",
      entityType: "DocumentRequest",
    });
  }

  private async resolveNotificationApprover(
    currentUser: CurrentNotificationUser,
  ): Promise<ApproverEmployee | null> {
    const userId = currentUser.id;
    if (!userId) return null;

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: {
          notIn: ["RESIGNED", "TERMINATED", "INACTIVE"],
        },
      },
      select: {
        id: true,
        userId: true,
        companyId: true,
        branchId: true,
        departmentId: true,
        divisionId: true,
        positionId: true,
      },
    });

    if (!employee) return null;

    return {
      ...employee,
      roleCodes: await this.resolveNotificationRoleCodes(currentUser),
    };
  }

  private async resolveNotificationRoleCodes(
    currentUser: CurrentNotificationUser,
  ) {
    const roleCodes = new Set(
      (currentUser.roles ?? [])
        .map((role) => String(role).toUpperCase())
        .filter(Boolean),
    );

    if (currentUser.id) {
      const user = await this.prisma.user.findUnique({
        where: { id: currentUser.id },
        select: {
          roles: {
            select: {
              role: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      });

      (user?.roles ?? []).forEach((row) => {
        const code = row.role.code;
        if (code) roleCodes.add(code.toUpperCase());
      });
    }

    return Array.from(roleCodes);
  }

  private isOffsiteRequestPendingForApprover(
    item: { approvalSnapshot?: unknown },
    approver: ApproverEmployee,
  ) {
    const pendingStep = this.getNotificationSnapshotSteps(
      item.approvalSnapshot,
    ).find((step) => step.status === "PENDING");

    return pendingStep
      ? this.canActNotificationApprovalStep(pendingStep, approver)
      : false;
  }

  private isDocumentRequestPendingForApprover(
    item: {
      currentLevel?: number | null;
      employee?: { supervisorId?: string | null } | null;
    },
    approver: ApproverEmployee,
  ) {
    const currentLevel = Number(item.currentLevel || 1);
    const roleCodes = this.normalizeNotificationRoleCodes(approver.roleCodes);

    if (currentLevel <= 1) {
      return (
        item.employee?.supervisorId === approver.id ||
        this.hasNotificationAdminRole(roleCodes)
      );
    }

    return this.hasNotificationHrRole(roleCodes);
  }

  private getNotificationSnapshotSteps(snapshot: unknown): any[] {
    const value = snapshot as { steps?: any[] } | null;
    return Array.isArray(value?.steps) ? value.steps : [];
  }

  private canActNotificationApprovalStep(
    step: any,
    approver: ApproverEmployee,
  ) {
    const roleCodes = this.normalizeNotificationRoleCodes(approver.roleCodes);

    if (step.expectedEmployeeId === approver.id) return true;
    if (approver.userId && step.expectedApproverId === approver.userId)
      return true;
    if (approver.positionId && step.positionId === approver.positionId)
      return true;
    if (
      step.roleCode &&
      roleCodes.includes(String(step.roleCode).toUpperCase())
    )
      return true;
    if (
      this.isNotificationHrStep(step) &&
      this.hasNotificationHrRole(roleCodes)
    )
      return true;
    if (
      String(step.approverType).toUpperCase() === "EXECUTIVE" &&
      this.hasNotificationExecutiveRole(roleCodes)
    ) {
      return true;
    }
    if (
      this.hasNotificationAdminRole(roleCodes) &&
      ["HR_ADMIN", "EXECUTIVE"].includes(
        String(step.approverType).toUpperCase(),
      )
    ) {
      return true;
    }

    return false;
  }

  private isNotificationHrStep(step: any) {
    const markers = [step.approverType, step.roleCode, step.nameTh]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase());

    return markers.some((value) => value.includes("HR"));
  }

  private normalizeNotificationRoleCodes(roleCodes?: string[] | null) {
    return Array.from(
      new Set(
        (roleCodes ?? [])
          .map((code) => String(code).toUpperCase())
          .filter(Boolean),
      ),
    );
  }

  private hasNotificationHrRole(roleCodes: string[]) {
    return roleCodes.some((code) =>
      [
        "HR_ADMIN",
        "HR_MANAGER",
        "HR",
        "SYSTEM_ADMIN",
        "SUPER_ADMIN",
        "ADMIN",
      ].includes(code),
    );
  }

  private hasNotificationExecutiveRole(roleCodes: string[]) {
    return roleCodes.some((code) =>
      [
        "EXECUTIVE",
        "CEO",
        "DIRECTOR",
        "SYSTEM_ADMIN",
        "SUPER_ADMIN",
        "ADMIN",
      ].includes(code),
    );
  }

  private hasNotificationAdminRole(roleCodes: string[]) {
    return roleCodes.some((code) =>
      ["SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(code),
    );
  }

  private createItem(params: {
    key: string;
    title: string;
    message: string;
    count: number;
    href: string;
    severity: NotificationSeverity;
    entityType: string;
  }): NotificationItem | null {
    if (params.count <= 0) {
      return null;
    }

    return params;
  }

  private buildSidebarBadges(items: NotificationItem[]) {
    const badges: Record<string, number> = {};

    items.forEach((item) => {
      const href = this.normalizeSidebarBadgeHref(item.href);
      badges[href] = (badges[href] ?? 0) + item.count;
    });

    const hrDashboardTotal = items
      .filter((item) =>
        [
          "/approvals",
          "/hr/leaves",
          "/hr/overtime",
          "/hr/time-adjust",
          "/hr/offsite",
          "/attendance",
          "/hr-review",
          "/documents",
        ].includes(this.normalizeSidebarBadgeHref(item.href)),
      )
      .reduce((sum, item) => sum + item.count, 0);

    if (hrDashboardTotal > 0) {
      badges["/hr/dashboard"] = hrDashboardTotal;
    }

    return badges;
  }

  private normalizeSidebarBadgeHref(href: string) {
    if (href.startsWith("/approvals")) {
      return "/approvals";
    }

    return href;
  }

  private hasAnyPermission(
    currentUser: CurrentNotificationUser,
    permissions: string[],
  ) {
    const permissionSet = new Set(currentUser.permissions ?? []);
    return permissions.some((permission) => permissionSet.has(permission));
  }

  private normalizeSeverity(severity: string): NotificationSeverity {
    if (
      severity === "SUCCESS" ||
      severity === "WARNING" ||
      severity === "DANGER" ||
      severity === "INFO"
    ) {
      return severity;
    }

    return "INFO";
  }

  private toNotificationType(key: string) {
    return key.toUpperCase().replace(/-/g, "_");
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}
