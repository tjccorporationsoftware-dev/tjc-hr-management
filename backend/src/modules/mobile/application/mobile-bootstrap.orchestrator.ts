import { Injectable, Logger } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ApprovalsService } from '../../approvals/approvals.service';
import { EssService } from '../../ess/ess.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SystemSettingsService } from '../../settings/system-settings.service';
import type {
  MobileClientContext,
  MobileFeatureFlags,
} from '../types/mobile-context.types';
import { MobileCompatibilityService } from './mobile-compatibility.service';
import { MobileFeatureFlagService } from './mobile-feature-flag.service';
import { MobileTodayOrchestrator } from './mobile-today.orchestrator';

/** ส่วนที่ไม่ critical ต้องไม่ทำให้ทั้งหน้าแรกล่ม — ตัดจบที่เวลานี้แล้วตอบ null */
const OPTIONAL_SECTION_TIMEOUT_MS = 3_000;

type EmployeeLike = {
  allowedAttendanceMethods?: string[] | null;
  branch?: unknown;
  company?: unknown;
  companyId?: string | null;
  department?: unknown;
  displayName?: string | null;
  division?: unknown;
  employeeCode?: string;
  employeeType?: unknown;
  firstName?: string | null;
  id: string;
  lastName?: string | null;
  nickname?: string | null;
  position?: string | null;
  positionMaster?: { nameTh?: string | null } | null;
  startDate?: Date | null;
  title?: string | null;
};

/**
 * BE-MOB-003 — Bootstrap Orchestrator
 *
 * รวมทุกอย่างที่หน้าแรกต้องใช้ให้จบใน request เดียว (ลด network waterfall)
 * ข้อบังคับตามบทที่ 12.9:
 *   - เรียก Service เดิม ไม่ query Prisma เอง
 *   - ไม่แก้ข้อมูล ไม่เขียนอะไรจาก GET
 *   - ไม่ bypass permission/tenant scope (ทุก service resolve employee จาก userId เอง)
 */
@Injectable()
export class MobileBootstrapOrchestrator {
  private readonly logger = new Logger(MobileBootstrapOrchestrator.name);

  constructor(
    private readonly approvalsService: ApprovalsService,
    private readonly essService: EssService,
    private readonly notificationsService: NotificationsService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly todayOrchestrator: MobileTodayOrchestrator,
    private readonly featureFlagService: MobileFeatureFlagService,
    private readonly compatibilityService: MobileCompatibilityService,
  ) {}

  async getBootstrap(user: AuthenticatedUser, client: MobileClientContext) {
    const me = await this.essService.getMe({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    const employee = me.employee as unknown as EmployeeLike;
    const featureFlags = this.featureFlagService.resolve({
      employee,
      permissions: user.permissions,
    });

    const [settings, today, dashboard, notifications, pendingApprovals] =
      await Promise.all([
      this.optional('settings', () =>
        this.systemSettingsService.getSystemSettings(employee.companyId ?? null),
      ),
      this.optional('today', () =>
        this.todayOrchestrator.getToday(user.id, featureFlags),
      ),
      this.optional('dashboard', () =>
        this.essService.getDashboard({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        }),
      ),
      this.optional('notifications', () =>
        this.notificationsService.getSummary(user),
      ),
      featureFlags.approvals
        ? this.optional('pendingApprovals', () =>
            this.approvalsService.countMobilePendingApprovals(user),
          )
        : Promise.resolve(0),
    ]);

    return {
      server: {
        now: new Date(),
        timezone: settings?.timezone ?? 'Asia/Bangkok',
      },
      compatibility: this.compatibilityService.resolve(client),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? null,
      },
      employee: this.toEmployeeSummary(employee),
      organization: this.toOrganization(employee),
      permissions: user.permissions,
      featureFlags,
      today,
      summary: this.toSummary(dashboard, notifications, pendingApprovals),
    };
  }

  async getToday(user: AuthenticatedUser) {
    const me = await this.essService.getMe({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    const featureFlags = this.featureFlagService.resolve({
      employee: me.employee as unknown as EmployeeLike,
      permissions: user.permissions,
    });

    return this.todayOrchestrator.getToday(user.id, featureFlags);
  }

  /**
   * ข้อมูลพนักงานเวอร์ชันย่อ — ส่งเฉพาะ field ที่หน้าแรกใช้จริง (Data minimization บทที่ 20.6)
   * ห้ามใส่เลขบัญชี เลขบัตรประชาชน หรือข้อมูลภาษี
   */
  private toEmployeeSummary(employee: EmployeeLike) {
    const firstName = employee.firstName ?? null;
    const lastName = employee.lastName ?? null;

    return {
      id: employee.id,
      employeeCode: employee.employeeCode ?? null,
      title: employee.title ?? null,
      firstName,
      lastName,
      nickname: employee.nickname ?? null,
      /**
       * ชื่อที่พร้อมแสดงผล — แอปไม่ต้องมาต่อคำเอง
       *
       * ประกอบจากชื่อ-นามสกุลก่อน **ไม่ใช่หยิบ `displayName` ที่ HR กรอกไว้**
       * เพราะช่องนั้นเก็บคำนำหน้าติดมาด้วย ("นางสาว สุภาพร สองเมือง") ซึ่งบน
       * จอมือถือที่กว้างจำกัดจะกินที่จนชื่อจริงถูกตัดหาย และหัวจอที่ทักด้วย
       * คำนำหน้าอ่านเหมือนหนังสือราชการมากกว่าแอปที่เปิดดูทุกเช้า
       * คำนำหน้ายังส่งไปแยกในช่อง `title` ให้จอที่ต้องใช้จริง (เอกสาร/ราชการ)
       */
      displayName:
        [firstName, lastName].filter(Boolean).join(' ') ||
        employee.displayName ||
        null,
      // ตำแหน่งมีได้สองที่: ข้อความอิสระ กับ master data ที่ผูกไว้
      positionName: employee.positionMaster?.nameTh ?? employee.position ?? null,
      startDate: employee.startDate ?? null,
    };
  }

  private toOrganization(employee: EmployeeLike) {
    return {
      company: employee.company ?? null,
      branch: employee.branch ?? null,
      department: employee.department ?? null,
      division: employee.division ?? null,
      employeeType: employee.employeeType ?? null,
    };
  }

  private toSummary(
    dashboard: Awaited<ReturnType<EssService['getDashboard']>> | null,
    notifications: { unreadCount: number } | null,
    pendingApprovals: number | null,
  ) {
    const leaveAvailable = (dashboard?.leaveSummary ?? []).reduce(
      (total, item) => total + (item.remainingDays ?? 0),
      0,
    );

    const pendingRequests =
      (dashboard?.metrics.pendingLeaveCount ?? 0) +
      (dashboard?.metrics.pendingOvertimeCount ?? 0) +
      (dashboard?.metrics.pendingTimeAdjustCount ?? 0);

    return {
      leaveAvailable,
      pendingRequests,
      unreadNotifications: notifications?.unreadCount ?? 0,
      // field ใหม่แบบ additive — build เก่ายังอ่าน pendingActions ได้เหมือนเดิม
      pendingApprovals: pendingApprovals ?? 0,
      // pendingActions = งานที่ "ผู้ใช้ต้องลงมือแก้" ยังไม่มีต้นทางจริงจนกว่าจะทำ
      // หน้า attendance issues (Phase 3) จึงยังไม่ตอบตัวเลขมั่ว ๆ ออกไป
      pendingActions: 0,
    };
  }

  /**
   * ครอบส่วนที่ไม่ critical ด้วย timeout + กันล้ม
   * bootstrap ต้องตอบได้เสมอ ตราบใดที่ยังรู้ว่า user เป็นใครและผูกกับพนักงานคนไหน
   */
  private async optional<T>(
    section: string,
    run: () => Promise<T>,
  ): Promise<T | null> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        run(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), OPTIONAL_SECTION_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      this.logger.warn(
        `bootstrap section "${section}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
