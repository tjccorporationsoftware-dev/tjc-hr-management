import {
  executiveAttendanceSchema,
  executiveInsightsSchema,
  executiveManpowerSchema,
  executivePayrollSchema,
  reportJobSchema,
} from '@/features/executive/executive-views';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * สัญญาข้อมูลของห้องผู้บริหาร
 *
 * จุดที่ต้องคุมเป็นพิเศษคือ **การ์ดต้นทุนต้องหายไปทั้งใบ** เมื่อผู้ใช้ไม่มี
 * สิทธิ์ดูเงินเดือน ไม่ใช่แสดงศูนย์ — ผู้บริหารที่เห็น "ต้นทุนต่อหัว 0 บาท"
 * จะอ่านว่าองค์กรไม่มีค่าใช้จ่าย ไม่ได้อ่านว่าตัวเองไม่มีสิทธิ์ดู
 */
describe('สัญญาข้อมูลของห้องผู้บริหาร', () => {
  it('ตัวชี้วัดรับ payload ที่ไม่มีก้อนต้นทุนได้ และตั้ง costVisible เป็น false', () => {
    const parsed = executiveInsightsSchema.parse({
      cost: null,
      costVisible: false,
      discipline: {},
      workforce: {},
    });

    expect(parsed.costVisible).toBe(false);
    expect(parsed.cost).toBeNull();
    expect(parsed.departments).toEqual([]);
    expect(parsed.trend).toEqual([]);
  });

  it('ตัวชี้วัดเติมศูนย์ให้ทุกช่องที่ backend ไม่ได้ส่งมา', () => {
    const parsed = executiveInsightsSchema.parse({
      discipline: { absenceRate: 2.1 },
      workforce: { headcount: 18 },
    });

    expect(parsed.workforce.headcount).toBe(18);
    expect(parsed.workforce.turnoverRate).toBe(0);
    expect(parsed.discipline.absenceRatePrev).toBe(0);
  });

  it('กำลังคนรับกราฟที่ยังไม่มีข้อมูลได้โดยไม่ล้ม', () => {
    const parsed = executiveManpowerSchema.parse({
      breakdown: {},
      filterOptions: {},
      metrics: {},
    });

    expect(parsed.breakdown.byDepartment).toEqual([]);
    expect(parsed.filterOptions.companies).toEqual([]);
    expect(parsed.metrics.totalEmployees).toBe(0);
  });

  it('เวลาวันนี้รายคนคงลำดับตามที่ backend ส่งมา', () => {
    const parsed = executiveAttendanceSchema.parse({
      filterOptions: {},
      rows: [
        { id: 'e-1', name: 'ขาด', status: 'ABSENT' },
        { id: 'e-2', name: 'สาย', status: 'PRESENT', late: true },
      ],
      summary: { absent: 1 },
    });

    expect(parsed.rows.map((row) => row.id)).toEqual(['e-1', 'e-2']);
    expect(parsed.rows[1]?.late).toBe(true);
    expect(parsed.summary.present).toBe(0);
  });

  it('ค่าจ้างรับปีที่ยังไม่มีข้อมูลได้', () => {
    const parsed = executivePayrollSchema.parse({
      composition: {},
      totals: {},
      year: 2026,
    });

    expect(parsed.months).toEqual([]);
    expect(parsed.composition.earnings).toEqual([]);
    expect(parsed.totals.employerCost).toBe(0);
  });

  it('งานรายงานแปลงเวลาเป็น Date และรับงานที่ยังไม่เสร็จได้', () => {
    const parsed = reportJobSchema.parse({
      createdAt: '2026-08-21T02:00:00.000Z',
      id: 'job-1',
      reportCode: 'ATTENDANCE',
      status: 'PROCESSING',
    });

    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.exportFileId).toBeUndefined();
  });
});

describe('query key ของห้องผู้บริหาร', () => {
  it('แยก cache ตามตัวกรองกำลังคน', () => {
    expect(queryKeys.executiveManpower({ branchId: 'b-1' })).not.toEqual(
      queryKeys.executiveManpower({ branchId: 'b-2' }),
    );
  });

  it('แยก cache ตามตัวกรองเวลาวันนี้', () => {
    expect(queryKeys.executiveAttendance({ status: 'ABSENT' })).not.toEqual(
      queryKeys.executiveAttendance({}),
    );
  });

  it('แยก cache ของค่าจ้างตามปี', () => {
    expect(queryKeys.executivePayroll(2025)).not.toEqual(
      queryKeys.executivePayroll(2026),
    );
  });
});
