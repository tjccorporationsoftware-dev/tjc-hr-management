import { PayrollWorkmenCompensationService } from './payroll-workmen-compensation.service';
import type { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';

/**
 * กติกาที่คุ้มไว้ในไฟล์นี้
 * -----------------------------------------------------------------------------
 * 1. เพดาน 20,000 เป็น "ต่อคนต่อเดือน" ต้องตัดรายเดือนก่อนแล้วค่อยรวมทั้งปี
 *    ถ้ารวมทั้งปีก่อนแล้วค่อยตัดที่ 240,000 คนที่ค่าจ้างขึ้น ๆ ลง ๆ จะได้เลขเกินจริง
 * 2. ยอดรวมของ กท.20ก ต้องเท่ากับช่อง (ค) ของ กท.20 เสมอ เพราะยื่นคู่กัน
 * 3. ค่าล่วงเวลากับโบนัสไม่ใช่ค่าจ้างของกองทุนนี้ ต้องไม่โผล่ในยอดที่ต้องแจ้ง
 */

const SCOPE: TenantScope = {
  level: 'GLOBAL',
  companyId: null,
  branchId: null,
};

type Line = { sourceType: string; amount: number };

function item(
  employeeId: string,
  month: number,
  lines: Line[],
  salaryBasis: 'MONTHLY' | 'DAILY' = 'MONTHLY',
) {
  return {
    employeeId,
    compensation: { salaryBasis },
    run: { period: { month } },
    employee: {
      title: 'นาย',
      firstName: 'สมชาย',
      lastName: employeeId,
      position: 'พนักงาน',
      company: { nameTh: 'บริษัท ทดสอบ จำกัด' },
      branch: null,
      department: { nameTh: 'บริหาร' },
      division: null,
      positionMaster: null,
    },
    lines,
  };
}

function buildService(items: unknown[]) {
  const prisma = {
    company: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'company-1',
        code: 'C1',
        nameTh: 'บริษัท ทดสอบ จำกัด',
        nameEn: null,
        logoUrl: null,
        taxId: null,
        address: null,
        email: null,
        phone: null,
        socialSecurityAccountNo: '1234567890',
        socialSecurityBranchNo: '000000',
        workmenCompensationCode: '10100',
        workmenCompensationRate: 0.2,
      }),
    },
    payrollItem: { findMany: jest.fn().mockResolvedValue(items) },
    employeeCompensation: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  return new PayrollWorkmenCompensationService(prisma);
}

describe('PayrollWorkmenCompensationService', () => {
  it('ตัดเพดานรายเดือนก่อนรวมทั้งปี ไม่ใช่รวมทั้งปีแล้วค่อยตัด', async () => {
    /*
     * เดือนแรกได้ 30,000 (เกินเพดาน 10,000) เดือนที่สองได้ 5,000
     * ตัดรายเดือน  20,000 + 5,000 = 25,000  ← ถูก
     * รวมก่อนตัด   35,000 ไม่ถึง 240,000 จึงไม่ถูกตัดเลย = 35,000  ← ผิด
     */
    const service = buildService([
      item('emp-1', 1, [{ sourceType: 'BASE_SALARY', amount: 30_000 }]),
      item('emp-1', 2, [{ sourceType: 'BASE_SALARY', amount: 5_000 }]),
    ]);

    const report = await service.getReport('company-1', 2026, SCOPE);

    expect(report.employees).toHaveLength(1);
    expect(report.employees[0].reportableWage).toBe(25_000);
  });

  it('ยอดรวม กท.20ก เท่ากับช่อง (ค) ของ กท.20', async () => {
    const service = buildService([
      item('emp-1', 1, [{ sourceType: 'BASE_SALARY', amount: 30_000 }]),
      item('emp-2', 1, [{ sourceType: 'BASE_SALARY', amount: 12_000 }]),
      item('emp-2', 2, [
        { sourceType: 'BASE_SALARY', amount: 12_000 },
        { sourceType: 'POSITION_ALLOWANCE', amount: 3_000 },
      ]),
    ]);

    const report = await service.getReport('company-1', 2026, SCOPE);

    expect(report.employeeTotals.reportableWage).toBe(report.totals.netWage);
  });

  it('ค่าล่วงเวลาและโบนัสไม่นับเป็นค่าจ้างที่ต้องแจ้ง แต่ยังนับในช่อง (จ)', async () => {
    const service = buildService([
      item('emp-1', 1, [
        { sourceType: 'BASE_SALARY', amount: 15_000 },
        { sourceType: 'OVERTIME', amount: 4_000 },
        { sourceType: 'BONUS', amount: 10_000 },
      ]),
    ]);

    const report = await service.getReport('company-1', 2026, SCOPE);

    expect(report.employees[0].reportableWage).toBe(15_000);
    expect(report.annualTaxSummary.totalIncome).toBe(29_000);
    expect(report.annualTaxSummary.overtime).toBe(4_000);
  });

  it('คนที่ได้เฉพาะค่าล่วงเวลาไม่ขึ้นในรายชื่อ แต่ยังนับใน ภ.ง.ด.1ก', async () => {
    const service = buildService([
      item('emp-1', 1, [{ sourceType: 'BASE_SALARY', amount: 15_000 }]),
      item('emp-2', 1, [{ sourceType: 'OVERTIME', amount: 2_000 }]),
    ]);

    const report = await service.getReport('company-1', 2026, SCOPE);

    expect(report.employees.map((row) => row.employeeId)).toEqual(['emp-1']);
    expect(report.employeeTotals.count).toBe(1);
    expect(report.annualTaxSummary.employeeCount).toBe(2);
  });

  it('รับปีเป็น ค.ศ. แล้วแปลงเป็น พ.ศ. ให้แบบฟอร์ม', async () => {
    const service = buildService([]);

    const report = await service.getReport('company-1', 2026, SCOPE);

    expect(report.gregorianYear).toBe(2026);
    expect(report.buddhistYear).toBe(2569);
  });

  it('พนักงานรายวันขึ้นประเภทให้ถูกและแยกช่องค่าจ้างรายวัน', async () => {
    const service = buildService([
      item('emp-1', 1, [{ sourceType: 'BASE_SALARY', amount: 9_000 }], 'DAILY'),
    ]);

    const report = await service.getReport('company-1', 2026, SCOPE);

    expect(report.employees[0].employmentType).toBe('พนักงานรายวัน');
    expect(report.months[0].dailyWage).toBe(9_000);
    expect(report.months[0].monthlySalary).toBe(0);
  });
});
