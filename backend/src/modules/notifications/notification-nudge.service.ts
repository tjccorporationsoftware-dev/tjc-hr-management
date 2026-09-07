import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

import { NotificationsService } from './notifications.service';

/**
 * NotificationNudgeService
 * -----------------------------------------------------------------------------
 * แจ้งเตือนที่ **เด้งเข้ามือถือ** สำหรับเรื่องที่ผู้ใช้ต้องรู้ตอนนั้น ไม่ใช่ตอน
 * เปิดแอปมาเจอเอง — สามเรื่องในไฟล์นี้ไม่มีเจ้าของอยู่ในโมดูลไหนโดยตรง จึงอยู่
 * รวมกันที่นี่ (ของที่เป็นเรื่องลงเวลาอยู่ที่ `AttendanceNudgeService` แทน
 * เพราะต้องใช้ตัวหากะของโมดูลลงเวลา)
 *
 *   1. สลิปเงินเดือนงวดใหม่เปิดให้ดูแล้ว
 *   2. ใบที่รอเราอนุมัติค้างเกินสองวัน
 *   3. ลูกทีมเริ่มลาพรุ่งนี้ (บอกหัวหน้าให้รู้ล่วงหน้าหนึ่งวัน)
 *
 * ทุกตัวกันเด้งซ้ำด้วย `sourceKey` จึงเรียกซ้ำได้ปลอดภัย
 */

/** ค้างนานกว่านี้ถือว่าลืม ไม่ใช่ "กำลังพิจารณา" */
const STALE_APPROVAL_DAYS = 2;

/** งวดที่เพิ่งเปิดให้ดูภายในกี่ชั่วโมงถึงจะยังนับว่า "ใหม่" พอจะเด้ง */
const PAYSLIP_READY_WINDOW_HOURS = 30;

const PAGE_SIZE = 200;

@Injectable()
export class NotificationNudgeService {
  private readonly logger = new Logger(NotificationNudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * สลิปงวดใหม่พร้อมให้ดู
   *
   * เกณฑ์ "พร้อมดู" ต้องตรงกับที่ ESS ใช้กรอง (`run.status ∈ APPROVED, PAID`)
   * ไม่งั้นจะเด้งบอกว่ามีสลิปแล้วผู้ใช้กดเข้าไปเจอจอว่าง
   */
  async syncPayslipReadyNudges(now: Date = new Date()) {
    const since = new Date(
      now.getTime() - PAYSLIP_READY_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const runs = await this.prisma.payrollRun.findMany({
      where: {
        deletedAt: null,
        status: { in: ['APPROVED', 'PAID'] },
        updatedAt: { gte: since },
      },
      select: {
        id: true,
        period: { select: { code: true, name: true } },
      },
    });

    let notifiedCount = 0;

    for (const run of runs) {
      const periodName =
        run.period?.name ?? run.period?.code ?? 'งวดเงินเดือนล่าสุด';

      let cursorId: string | null = null;

      for (;;) {
        /* ระบุชนิดผลลัพธ์เอง — client ที่ generate ไว้คืน any ให้ตารางนี้ */
        const items = (await this.prisma.payrollItem.findMany({
          where: {
            runId: run.id,
            status: { in: ['APPROVED', 'PAID'] },
            employee: { deletedAt: null, userId: { not: null } },
          },
          take: PAGE_SIZE,
          orderBy: { id: 'asc' },
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          select: {
            employee: { select: { id: true, userId: true } },
            id: true,
          },
        })) as {
          employee: { id: string; userId: string | null } | null;
          id: string;
        }[];

        if (items.length === 0) break;

        cursorId = items[items.length - 1]?.id ?? null;

        for (const item of items) {
          if (!item.employee?.userId) continue;

          await this.notifications.notifyNudge([item.employee.userId], {
            entityId: run.id,
            entityType: 'PayrollRun',
            link: '/payroll/my-slips',
            message: `สลิป${periodName} เปิดให้ดูในแอปแล้ว`,
            severity: 'SUCCESS',
            sourceKey: `nudge:payslip-ready:${run.id}:${item.employee.id}`,
            title: 'สลิปเงินเดือนงวดใหม่พร้อมแล้ว',
            type: 'PAYSLIP_READY',
          });

          notifiedCount += 1;
        }

        if (items.length < PAGE_SIZE) break;
      }
    }

    return { notifiedCount, runCount: runs.length };
  }

  /**
   * ใบที่รอเราอนุมัติค้างเกินสองวัน
   *
   * อ่านจากตาราง `Notification` ที่ระบบสร้างไว้ตอนใบเข้าคิว แทนที่จะไล่ถาม
   * ตารางขั้นอนุมัติของทั้งห้าประเภท (ลา/OT/แก้เวลา/นอกสถานที่/เอกสาร) —
   * แจ้งเตือนเดิมถูกปิดทิ้งเมื่อใบถูกดำเนินการแล้ว ใบที่ยัง "ค้าง" จึงเท่ากับ
   * แจ้งเตือนที่ยังไม่ถูกปิดพอดี และได้ทั้งห้าประเภทโดยไม่ต้องเขียนห้าคิวรี
   *
   * รวมเป็นข้อความเดียวต่อคน ไม่ใช่เด้งทีละใบ — คนที่มีใบค้างสิบใบไม่ควรได้
   * แจ้งเตือนสิบครั้งในนาทีเดียว
   */
  async syncStaleApprovalNudges(now: Date = new Date()) {
    const cutoff = new Date(
      now.getTime() - STALE_APPROVAL_DAYS * 24 * 60 * 60 * 1000,
    );
    const dateKey = this.formatDateKey(now);

    const pending = (await (
      this.prisma as never as {
        notification: {
          groupBy: (
            args: unknown,
          ) => Promise<{ _count: { _all: number }; userId: string }[]>;
        };
      }
    ).notification.groupBy({
      by: ['userId'],
      where: {
        createdAt: { lte: cutoff },
        readAt: null,
        type: { endsWith: '_PENDING_APPROVAL' },
      },
      _count: { _all: true },
    })) as { _count: { _all: number }; userId: string }[];

    for (const group of pending) {
      await this.notifications.notifyNudge([group.userId], {
        entityId: `${group.userId}:${dateKey}`,
        entityType: 'ApprovalQueue',
        link: '/approvals',
        message: `มีคำขอ ${group._count._all} รายการรอคุณอนุมัตินานกว่า ${STALE_APPROVAL_DAYS} วัน`,
        severity: 'WARNING',
        sourceKey: `nudge:stale-approval:${group.userId}:${dateKey}`,
        title: 'มีคำขอค้างในคิวของคุณ',
        type: 'APPROVAL_QUEUE_STALE',
      });
    }

    return { notifiedCount: pending.length };
  }

  /**
   * ลูกทีมเริ่มลาพรุ่งนี้ — บอกหัวหน้าล่วงหน้าหนึ่งวัน
   *
   * ส่งถึง `supervisor` ของพนักงานเท่านั้น ไม่ส่งถึงผู้อนุมัติทุกคนในสาย เพราะ
   * คนที่ต้องจัดคนแทนคือหัวหน้าโดยตรง ส่วนฝ่ายบุคคลเห็นภาพรวมจากปฏิทินทีมอยู่แล้ว
   */
  async syncLeaveStartingTomorrowNudges(now: Date = new Date()) {
    const tomorrow = this.startOfDay(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateKey = this.formatDateKey(tomorrow);

    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        deletedAt: null,
        startDate: tomorrow,
        status: 'APPROVED',
      },
      select: {
        employee: {
          select: {
            displayName: true,
            firstName: true,
            lastName: true,
            supervisor: { select: { id: true, userId: true } },
          },
        },
        endDate: true,
        id: true,
        leaveType: { select: { nameTh: true } },
      },
    });

    let notifiedCount = 0;

    for (const leave of leaves) {
      const supervisorUserId = leave.employee?.supervisor?.userId;

      if (!supervisorUserId) continue;

      const employeeName =
        leave.employee?.displayName ??
        [leave.employee?.firstName, leave.employee?.lastName]
          .filter(Boolean)
          .join(' ');
      const leaveTypeName = leave.leaveType?.nameTh ?? 'ลา';

      await this.notifications.notifyNudge([supervisorUserId], {
        entityId: leave.id,
        entityType: 'LeaveRequest',
        link: '/team/calendar',
        message: `${employeeName || 'ลูกทีม'} ${leaveTypeName} เริ่มพรุ่งนี้ (${dateKey})`,
        severity: 'INFO',
        sourceKey: `nudge:leave-tomorrow:${leave.id}`,
        title: 'พรุ่งนี้มีลูกทีมลา',
        type: 'LEAVE_STARTS_TOMORROW',
      });

      notifiedCount += 1;
    }

    return { dateKey, notifiedCount };
  }

  /** เรียกรวมจากงานตั้งเวลา — คืนสรุปไว้ให้ log อ่านได้ในบรรทัดเดียว */
  async syncDailyNudges(now: Date = new Date()) {
    const payslip = await this.syncPayslipReadyNudges(now);
    const approval = await this.syncStaleApprovalNudges(now);
    const leave = await this.syncLeaveStartingTomorrowNudges(now);

    this.logger.log(
      `สะกิดประจำวัน: สลิปใหม่ ${payslip.notifiedCount} · คิวค้าง ${approval.notifiedCount} · ลาพรุ่งนี้ ${leave.notifiedCount}`,
    );

    return { approval, leave, payslip };
  }

  private startOfDay(value: Date) {
    const next = new Date(value);
    next.setHours(0, 0, 0, 0);

    return next;
  }

  private formatDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
