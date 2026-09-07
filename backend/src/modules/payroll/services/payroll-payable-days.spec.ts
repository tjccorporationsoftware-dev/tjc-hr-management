import { PayrollAttendanceDeductionImportService } from './payroll-attendance-deduction-import.service';

/**
 * การนับ "วันที่ต้องจ่ายค่าจ้าง" ของพนักงานรายวัน/รายชั่วโมง
 *
 * ตัวเลขนี้คูณกับอัตราต่อวันกลายเป็นค่าจ้างทั้งงวดโดยตรง เงื่อนไขใน
 * where จึงเป็นสาระของเงินเดือน ไม่ใช่รายละเอียดทางเทคนิค
 *
 * กติกาที่ต้องตรึงไว้
 *   - นับวันที่มีการสแกนอย่างน้อยหนึ่งรอบ
 *   - นับวันลาที่ได้รับค่าจ้าง แม้ไม่มีการสแกน (ม.56/ม.57 — ลาป่วย
 *     มีใบรับรองแพทย์ต้องได้ค่าจ้าง ถ้าไม่นับ พนักงานรายวันจะโดนจ่ายขาด)
 *   - ไม่นับวันขาดงาน
 *   - ไม่กรองสถานะรีวิว เพราะค่าจ้างต้องไม่กลายเป็นศูนย์เงียบ ๆ
 *     เพียงเพราะ HR ยังไม่ล็อกเวลา
 */
const service = Object.create(
  PayrollAttendanceDeductionImportService.prototype,
) as PayrollAttendanceDeductionImportService;

const PARAMS = {
  employeeId: 'emp-1',
  periodStartDate: new Date('2026-06-26T00:00:00.000Z'),
  periodEndDate: new Date('2026-07-25T00:00:00.000Z'),
};

function fakeTx() {
  const count = jest.fn().mockResolvedValue(24);
  return { tx: { attendanceDailySummary: { count } } as never, count };
}

describe('countPayableDaysForPeriod', () => {
  it('คืนจำนวนวันจากฐานข้อมูลตรง ๆ', async () => {
    const { tx } = fakeTx();

    await expect(service.countPayableDaysForPeriod(tx, PARAMS)).resolves.toBe(24);
  });

  it('กรองตามพนักงานและช่วงงวดที่ขอ', async () => {
    const { tx, count } = fakeTx();
    await service.countPayableDaysForPeriod(tx, PARAMS);

    const where = count.mock.calls[0][0].where;
    expect(where.employeeId).toBe('emp-1');
    expect(where.workDate).toEqual({
      gte: PARAMS.periodStartDate,
      lte: PARAMS.periodEndDate,
    });
  });

  it('วันขาดงานต้องไม่ถูกนับเป็นวันจ่ายเงิน', async () => {
    const { tx, count } = fakeTx();
    await service.countPayableDaysForPeriod(tx, PARAMS);

    expect(count.mock.calls[0][0].where.isAbsent).toBe(false);
  });

  it('วันลาที่ได้รับค่าจ้างต้องนับ แม้ไม่มีการสแกนเลย', async () => {
    const { tx, count } = fakeTx();
    await service.countPayableDaysForPeriod(tx, PARAMS);

    const or = count.mock.calls[0][0].where.OR;
    expect(or).toContainEqual({ leaveIsPaid: true });
  });

  it('การสแกนรอบใดรอบหนึ่งก็พอ ไม่ต้องครบสามรอบ', async () => {
    const { tx, count } = fakeTx();
    await service.countPayableDaysForPeriod(tx, PARAMS);

    const or = count.mock.calls[0][0].where.OR;
    expect(or).toContainEqual({ morningInAt: { not: null } });
    expect(or).toContainEqual({ afternoonInAt: { not: null } });
    expect(or).toContainEqual({ checkOutAt: { not: null } });
  });

  /*
   * ห้ามกรองสถานะรีวิว/ล็อก — ถ้าใครเผลอเพิ่ม reviewStatus เข้าไปใน where
   * พนักงานรายวันของงวดที่ยังไม่ล็อกจะได้ค่าจ้าง 0 บาททันที
   */
  it('ต้องไม่กรองสถานะรีวิวหรือการล็อก', async () => {
    const { tx, count } = fakeTx();
    await service.countPayableDaysForPeriod(tx, PARAMS);

    const where = count.mock.calls[0][0].where;
    expect(where.reviewStatus).toBeUndefined();
    expect(where.lockedAt).toBeUndefined();
    expect(where.sentToPayrollAt).toBeUndefined();
  });
});
