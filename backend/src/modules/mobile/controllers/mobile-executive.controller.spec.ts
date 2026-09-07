import 'reflect-metadata';

import { ForbiddenException } from '@nestjs/common';

import { REQUIRED_PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { MobileExecutiveOrchestrator } from '../application/mobile-executive.orchestrator';
import {
  toMobileExecutiveAttendanceToday,
  toMobileExecutiveManpower,
  toMobileExecutivePayroll,
} from '../mappers/mobile-executive.mapper';
import { MobileExecutiveController } from './mobile-executive.controller';

/**
 * ห้องผู้บริหารบนมือถือ
 *
 * ความเสี่ยงหลักของโมดูลนี้คือ **ข้อมูลรั่วเกินสิทธิ์** — EXECUTIVE_VIEW เปิด
 * ประตูห้อง แต่เงินเดือน ผังองค์กร และรายงานต้องมีสิทธิ์เพิ่มอีกชั้น
 * เทสชุดนี้จึงคุมสองอย่าง: ด่านเข้าห้องต้องอยู่ครบทุก route และด่านย่อยต้อง
 * ปฏิเสธจริงเมื่อผู้ใช้ไม่มีสิทธิ์ ไม่ใช่แค่ซ่อนบน UI
 */
describe('MobileExecutiveController · สิทธิ์', () => {
  const ROUTES = [
    'summary',
    'insights',
    'manpower',
    'attendanceToday',
    'payroll',
    'organization',
    'reportCatalog',
    'reportJobs',
    'createReport',
  ] as const;

  it('ทุก route ต้องผ่านด่าน ESS_ACCESS + EXECUTIVE_VIEW', () => {
    for (const route of ROUTES) {
      const permissions = Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        MobileExecutiveController.prototype[route],
      ) as string[] | undefined;

      expect({ route, permissions }).toEqual({
        route,
        permissions: ['ESS_ACCESS', 'EXECUTIVE_VIEW'],
      });
    }
  });

  it('ดาวน์โหลดไฟล์รายงานต้องมี REPORT_EXPORT เพิ่มที่ระดับ route', () => {
    const permissions = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      MobileExecutiveController.prototype.downloadReport,
    ) as string[] | undefined;

    expect(permissions).toEqual([
      'ESS_ACCESS',
      'EXECUTIVE_VIEW',
      'REPORT_EXPORT',
    ]);
  });
});

describe('MobileExecutiveOrchestrator · ด่านสิทธิ์ย่อย', () => {
  function build(permissions: string[]) {
    const dashboard = {
      getExecutiveAttendanceToday: jest.fn(async () => ({})),
      getExecutiveDashboardSummary: jest.fn(async () => ({})),
      getExecutiveInsights: jest.fn(async () => ({
        cost: { costPerHead: 52000 },
        departments: [{ costPerHead: 52000, headcount: 4, label: 'บัญชี' }],
        trend: [{ costPerHead: 51000, month: '2026-07' }],
        workforce: { headcount: 18 },
      })),
      getHrPayrollSummary: jest.fn(async () => ({ months: [], year: 2026 })),
    };
    const manpower = { getOverview: jest.fn(async () => ({})) };
    const organization = { getOrgChart: jest.fn(async () => ({})) };
    const reports = {
      createJob: jest.fn(async () => ({ id: 'job-1' })),
      findMobileMyJobs: jest.fn(async () => ({ items: [], meta: {} })),
      getCatalog: jest.fn(() => [{ code: 'ATTENDANCE' }]),
      processJob: jest.fn(async () => ({
        exportFile: { fileName: 'report.xlsx', id: 'export-1' },
      })),
    };

    const orchestrator = new MobileExecutiveOrchestrator(
      dashboard as never,
      manpower as never,
      organization as never,
      reports as never,
    );

    const user = {
      id: 'user-1',
      permissions,
      scope: { companyId: 'company-1' },
    } as never;

    return { dashboard, orchestrator, reports, user };
  }

  const EXEC = ['ESS_ACCESS', 'EXECUTIVE_VIEW'];

  it('ผู้บริหารที่ไม่มี PAYROLL_READ เปิดจอเงินเดือนไม่ได้', async () => {
    const { orchestrator, user } = build(EXEC);

    await expect(orchestrator.payroll(user, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('ผู้บริหารที่ไม่มี PAYROLL_READ ยังดูตัวชี้วัดได้ แต่ไม่เห็นต้นทุน', async () => {
    const { orchestrator, user } = build(EXEC);

    const result = await orchestrator.insights(user);

    expect(result.costVisible).toBe(false);
    expect(result.cost).toBeNull();
    /* ต้นทุนต่อหัวรายแผนกและใน trend ต้องถูกกลบด้วย ไม่ใช่หลุดไปทางอ้อม */
    expect(result.departments[0]?.costPerHead).toBe(0);
    expect(result.trend[0]?.costPerHead).toBe(0);
    /* ตัวเลขที่ไม่เกี่ยวกับเงินยังต้องอยู่ครบ */
    expect(result.workforce.headcount).toBe(18);
  });

  it('ผู้บริหารที่มี PAYROLL_READ เห็นต้นทุนครบ', async () => {
    const { orchestrator, user } = build([...EXEC, 'PAYROLL_READ']);

    const result = await orchestrator.insights(user);

    expect(result.costVisible).toBe(true);
    expect(result.cost?.costPerHead).toBe(52000);
    expect(result.departments[0]?.costPerHead).toBe(52000);
  });

  it('ผังองค์กรต้องมี ORG_READ', async () => {
    const denied = build(EXEC);
    await expect(
      denied.orchestrator.organizationChart(denied.user),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const allowed = build([...EXEC, 'ORG_READ']);
    await expect(
      allowed.orchestrator.organizationChart(allowed.user),
    ).resolves.toBeDefined();
  });

  it('รายการรายงานต้องมี REPORT_VIEW และการสร้างต้องมี REPORT_EXPORT', async () => {
    const viewer = build([...EXEC, 'REPORT_VIEW']);

    await expect(
      viewer.orchestrator.reportCatalog(viewer.user),
    ).resolves.toBeDefined();
    await expect(
      viewer.orchestrator.createReport(viewer.user, {
        reportCode: 'ATTENDANCE' as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ขอรายงานแล้วต้องสั่งประมวลผลต่อทันที ไม่ทิ้งงานค้างไว้', async () => {
    const { orchestrator, reports, user } = build([...EXEC, 'REPORT_EXPORT']);

    const result = await orchestrator.createReport(user, {
      reportCode: 'ATTENDANCE' as never,
    });

    expect(reports.createJob).toHaveBeenCalled();
    expect(reports.processJob).toHaveBeenCalledWith('job-1', 'user-1');
    expect(result).toEqual({
      exportFileId: 'export-1',
      fileName: 'report.xlsx',
      jobId: 'job-1',
    });
  });
});

describe('mapper ของห้องผู้บริหาร', () => {
  it('กำลังคนยุบชื่อฟิลด์ของกราฟให้เป็นรูปเดียว', () => {
    const result = toMobileExecutiveManpower({
      charts: {
        byBranch: [{ id: 'branch-1', nameTh: 'สำนักงานใหญ่', total: 12 }],
        byDepartment: [{ id: 'dept-1', label: 'บัญชี', count: 4 }],
      },
      filters: { companies: [{ id: 'company-1', nameTh: 'TJC' }] },
      metrics: { activeEmployees: 16, totalEmployees: 18 },
    });

    expect(result.breakdown.byDepartment[0]).toEqual({
      count: 4,
      id: 'dept-1',
      label: 'บัญชี',
    });
    expect(result.breakdown.byBranch[0]).toEqual({
      count: 12,
      id: 'branch-1',
      label: 'สำนักงานใหญ่',
    });
    expect(result.filterOptions.companies[0]?.label).toBe('TJC');
    expect(result.metrics.totalEmployees).toBe(18);
  });

  it('เวลาวันนี้รายคนคงลำดับที่ service จัดมาให้ ไม่เรียงใหม่', () => {
    const result = toMobileExecutiveAttendanceToday({
      rows: [
        { id: 'e-1', name: 'ขาดงาน', status: 'ABSENT' },
        { id: 'e-2', late: true, name: 'มาสาย', status: 'PRESENT' },
        { id: 'e-3', name: 'ปกติ', status: 'PRESENT' },
      ],
      summary: { absent: 1, late: 1, present: 2, total: 3 },
      workDate: '2026-08-21',
    });

    expect(result.rows.map((row) => row.id)).toEqual(['e-1', 'e-2', 'e-3']);
    expect(result.summary.absent).toBe(1);
  });

  it('ส่งชั่วโมงโอทีและสาขาต่อคนไปให้แอป เพื่อให้จอลา/โอทีรายวันใช้ได้', () => {
    const result = toMobileExecutiveAttendanceToday({
      rows: [
        {
          branch: 'สำนักงานใหญ่',
          branchId: 'branch-1',
          id: 'e-1',
          name: 'ทำโอที',
          otHours: 2.5,
          status: 'PRESENT',
        },
        { id: 'e-2', leaveType: 'ลากิจ', name: 'ลางาน', status: 'LEAVE' },
      ],
      summary: { leave: 1, otHours: 2.5, otPeople: 1, present: 1, total: 2 },
      workDate: '2026-08-21',
    });

    expect(result.rows[0]?.otHours).toBe(2.5);
    expect(result.rows[0]?.branchId).toBe('branch-1');
    expect(result.rows[1]?.leaveType).toBe('ลากิจ');
    expect(result.summary.otHours).toBe(2.5);
    expect(result.summary.otPeople).toBe(1);
  });

  it('ยอดรวมรายสาขามาคู่กับรายแผนก ใช้รูปร่างเดียวกันทั้งคู่', () => {
    const result = toMobileExecutiveAttendanceToday({
      byBranch: [
        { id: 'branch-1', label: 'สำนักงานใหญ่', leave: 2, otHours: 6, otPeople: 3, total: 40 },
        /* หน่วยที่ไม่ระบุต้องมีป้ายของตัวเอง ไม่ใช่ค่าว่าง */
        { leave: 1, total: 5 },
      ],
      byDepartment: [{ id: 'dept-1', label: 'ผลิต', leave: 1, otHours: 4, otPeople: 2, total: 20 }],
    });

    expect(result.byBranch[0]?.otHours).toBe(6);
    expect(result.byBranch[0]?.otPeople).toBe(3);
    expect(result.byBranch[1]?.label).toBe('ไม่ระบุสาขา');
    expect(result.byDepartment[0]?.label).toBe('ผลิต');
    expect(result.byDepartment[0]?.otHours).toBe(4);
  });

  it('เงินเดือนตัดเดือนที่ยังไม่ได้ทำรอบออกจากกราฟ', () => {
    const result = toMobileExecutivePayroll({
      availableYears: [2026, 2025],
      months: [
        { hasRun: true, label: 'ม.ค.', netPay: 500000 },
        { hasRun: false, label: 'ก.พ.', netPay: 0 },
        { hasRun: true, label: 'มี.ค.', netPay: 520000 },
      ],
      totals: { netPay: 1020000, socialSecurityEmployer: 51000 },
      year: 2026,
    });

    expect(result.months.map((month) => month.label)).toEqual([
      'ม.ค.',
      'มี.ค.',
    ]);
    expect(result.totals.employerCost).toBe(51000);
    expect(result.availableYears).toEqual([2026, 2025]);
  });

  it('เงินเดือนแยกฝั่งรายได้กับรายการหักออกจากกัน', () => {
    const result = toMobileExecutivePayroll({
      composition: {
        deductions: [{ amount: 30000, label: 'ภาษี' }],
        earnings: [{ amount: 80000, label: 'ค่าล่วงเวลา' }],
      },
    });

    expect(result.composition.earnings[0]?.label).toBe('ค่าล่วงเวลา');
    expect(result.composition.deductions[0]?.label).toBe('ภาษี');
  });
});
