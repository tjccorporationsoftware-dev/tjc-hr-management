import { MobileBootstrapOrchestrator } from './mobile-bootstrap.orchestrator';
import { MobileCompatibilityService } from './mobile-compatibility.service';
import { MobileFeatureFlagService } from './mobile-feature-flag.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { MobileClientContext } from '../types/mobile-context.types';

/**
 * BE-MOB-003 — Bootstrap Orchestrator
 *
 * สองเรื่องที่ต้องพิสูจน์:
 *   1) map ข้อมูลพนักงานจาก "ชื่อคอลัมน์จริง" ของ Employee ไม่ใช่ชื่อที่เดาเอา
 *      (เคยพลาดมาแล้ว: ใช้ firstNameTh/lastNameTh ซึ่งไม่มีในสคีมา ทำให้ชื่อว่างทั้งแอป)
 *   2) ส่วนที่ไม่ critical ล่ม ต้องไม่ทำให้ทั้ง bootstrap ล่มตาม
 */
describe('MobileBootstrapOrchestrator', () => {
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'employee@example.com',
    displayName: 'บัญชีผู้ใช้',
    permissions: ['ESS_ACCESS', 'ATTENDANCE_CHECKIN'],
    roles: ['EMPLOYEE'],
    scope: { level: 'BRANCH', companyId: 'c1', branchId: 'b1' },
  };

  const client: MobileClientContext = {
    appBuild: 100,
    appVersion: '1.0.0',
    installationId: 'install-1',
    ipAddress: null,
    osVersion: null,
    platform: 'android',
    userAgent: null,
  };

  const employee = {
    id: 'emp-1',
    employeeCode: 'EMP-0005',
    title: 'นาย',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    nickname: 'ชาย',
    displayName: null,
    position: 'พนักงานทั่วไป',
    startDate: new Date('2026-01-05T00:00:00.000Z'),
    companyId: 'c1',
    allowedAttendanceMethods: ['WEB', 'MOBILE'],
    company: { id: 'c1', code: 'TJC', nameTh: 'บริษัททดสอบ' },
    branch: null,
    department: null,
    division: null,
    employeeType: null,
  };

  function buildOrchestrator(overrides?: {
    dashboardError?: Error;
    notificationsError?: Error;
    todayError?: Error;
  }) {
    const approvalsService = {
      countMobilePendingApprovals: jest.fn(async () => 4),
    };

    const essService = {
      getMe: jest.fn(async () => ({ user: {}, employee })),
      getDashboard: jest.fn(async () => {
        if (overrides?.dashboardError) {
          throw overrides.dashboardError;
        }

        return {
          metrics: {
            pendingLeaveCount: 1,
            pendingOvertimeCount: 2,
            pendingTimeAdjustCount: 0,
          },
          leaveSummary: [{ remainingDays: 6 }, { remainingDays: 2.5 }],
        };
      }),
    };

    const notificationsService = {
      getSummary: jest.fn(async () => {
        if (overrides?.notificationsError) {
          throw overrides.notificationsError;
        }

        return { unreadCount: 6 };
      }),
    };

    const systemSettingsService = {
      getSystemSettings: jest.fn(async () => ({ timezone: 'Asia/Bangkok' })),
    };

    const todayOrchestrator = {
      getToday: jest.fn(async () => {
        if (overrides?.todayError) {
          throw overrides.todayError;
        }

        return { heroState: 'NOT_CHECKED_IN', canCheckIn: true };
      }),
    };

    const orchestrator = new MobileBootstrapOrchestrator(
      approvalsService as never,
      essService as never,
      notificationsService as never,
      systemSettingsService as never,
      todayOrchestrator as never,
      new MobileFeatureFlagService(),
      new MobileCompatibilityService({
        get: jest.fn((_key: string, fallback?: string) => fallback),
      } as never),
    );

    return {
      approvalsService,
      essService,
      notificationsService,
      orchestrator,
      todayOrchestrator,
    };
  }

  it('ต้อง map ชื่อพนักงานจากคอลัมน์จริงของ Employee', async () => {
    const { orchestrator } = buildOrchestrator();

    const result = await orchestrator.getBootstrap(user, client);

    expect(result.employee).toMatchObject({
      employeeCode: 'EMP-0005',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      nickname: 'ชาย',
      positionName: 'พนักงานทั่วไป',
      title: 'นาย',
    });
  });

  it('ไม่มี displayName ต้องประกอบชื่อให้แอปพร้อมแสดง', async () => {
    const { orchestrator } = buildOrchestrator();

    const result = await orchestrator.getBootstrap(user, client);

    expect(result.employee.displayName).toBe('สมชาย ใจดี');
  });

  it('ต้องไม่ส่งข้อมูลอ่อนไหวออกไปกับ bootstrap', async () => {
    const { orchestrator } = buildOrchestrator();

    const result = await orchestrator.getBootstrap(user, client);
    const serialized = JSON.stringify(result);

    for (const forbidden of ['bankAccount', 'citizenId', 'taxId', 'salary']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('ต้องรวมยอดคำขอค้างและวันลาคงเหลือจาก dashboard เดิม', async () => {
    const { orchestrator } = buildOrchestrator();

    const result = await orchestrator.getBootstrap(user, client);

    expect(result.summary).toMatchObject({
      leaveAvailable: 8.5,
      pendingRequests: 3,
      unreadNotifications: 6,
    });
  });

  it('ส่วนที่ไม่ critical ล่ม ต้องยังตอบ bootstrap ได้', async () => {
    const { orchestrator } = buildOrchestrator({
      dashboardError: new Error('dashboard ล่ม'),
      notificationsError: new Error('notification ล่ม'),
      todayError: new Error('today ล่ม'),
    });

    const result = await orchestrator.getBootstrap(user, client);

    expect(result.employee.employeeCode).toBe('EMP-0005');
    expect(result.today).toBeNull();
    expect(result.summary).toMatchObject({
      leaveAvailable: 0,
      pendingRequests: 0,
      unreadNotifications: 0,
    });
  });

  it('featureFlags ต้อง resolve จากสิทธิ์จริงของผู้ใช้', async () => {
    const { orchestrator } = buildOrchestrator();

    const result = await orchestrator.getBootstrap(user, client);

    expect(result.featureFlags.attendance).toBe(true);
    // ไม่มี PAYROLL_SLIP_VIEW จึงต้องปิดสลิป
    expect(result.featureFlags.payslip).toBe(false);
  });

  it('ตอบ pendingApprovals จาก Approval scope จริงเมื่อผู้ใช้มีสิทธิ์อนุมัติ', async () => {
    const { approvalsService, orchestrator } = buildOrchestrator();
    const managerUser = {
      ...user,
      permissions: [...user.permissions, 'APPROVAL_ACCESS'],
    } as AuthenticatedUser;

    const result = await orchestrator.getBootstrap(managerUser, client);

    expect(approvalsService.countMobilePendingApprovals).toHaveBeenCalledWith(
      managerUser,
    );
    expect(result.summary.pendingApprovals).toBe(4);
    expect(result.summary.pendingActions).toBe(0);
  });

});
