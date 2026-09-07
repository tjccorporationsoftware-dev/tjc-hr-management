import { BadRequestException } from '@nestjs/common';

import { assertDateRangeNotLocked } from './utils/attendance-lock.util';

/**
 * ตัวกันช่วงวันที่ในงวดที่ปิดแล้ว — ใช้กับ อนุมัติ/ยกเลิก ใบลา OT และงานนอกสถานที่
 *
 * เคสจริงที่จับได้ตอนตรวจส่งมอบ: ยกเลิกใบลาที่อยู่ในงวดล็อก + คำนวณเงินเดือน
 * แล้วสำเร็จเฉย ๆ (201) โดยไม่เข้ากลไกแก้ไขย้อนหลังใด ๆ — สรุปเวลาที่ล็อกไม่ถูก
 * คำนวณตาม ใบลากับเงินที่จ่ายจริงจึงขัดกันเองโดยไม่มีอะไรฟ้องเลย
 */
const RANGE = {
  start: new Date('2026-07-01T00:00:00.000Z'),
  end: new Date('2026-07-03T00:00:00.000Z'),
};

function buildDb(options: {
  lockedSummary?: unknown;
  lockedPeriod?: unknown;
  employee?: unknown;
}) {
  return {
    attendanceDailySummary: {
      findFirst: jest.fn().mockResolvedValue(options.lockedSummary ?? null),
    },
    employee: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.employee ?? { companyId: 'com-1' }),
    },
    payrollPeriod: {
      findFirst: jest.fn().mockResolvedValue(options.lockedPeriod ?? null),
    },
  };
}

describe('assertDateRangeNotLocked', () => {
  it('ช่วงวันที่ไม่มีอะไรล็อก ต้องผ่านเงียบ ๆ', async () => {
    const db = buildDb({});

    await expect(
      assertDateRangeNotLocked(db as never, 'emp-1', RANGE.start, RANGE.end),
    ).resolves.toBeUndefined();
  });

  it('มีสรุปเวลาที่ล็อกแล้วแม้วันเดียวในช่วง ต้องโยนทันที', async () => {
    const db = buildDb({
      lockedSummary: { workDate: new Date('2026-07-02T00:00:00.000Z') },
    });

    await expect(
      assertDateRangeNotLocked(db as never, 'emp-1', RANGE.start, RANGE.end),
    ).rejects.toThrow(BadRequestException);
    // ต้องไม่เสียเวลาไปเช็คงวดต่อ เพราะเจอเหตุปฏิเสธแล้ว
    expect(db.payrollPeriod.findFirst).not.toHaveBeenCalled();
  });

  it('เงื่อนไขค้นสรุปเวลา ต้องครอบทุกสัญญาณการล็อก', async () => {
    const db = buildDb({});
    await assertDateRangeNotLocked(db as never, 'emp-1', RANGE.start, RANGE.end);

    const where = db.attendanceDailySummary.findFirst.mock.calls[0][0].where;
    expect(where.employeeId).toBe('emp-1');
    expect(where.workDate).toEqual({ gte: RANGE.start, lte: RANGE.end });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { payrollRunId: { not: null } },
        { sentToPayrollAt: { not: null } },
        { lockedAt: { not: null } },
        { reviewStatus: 'LOCKED' },
        { reviewStatus: 'SENT_TO_PAYROLL' },
      ]),
    );
  });

  /*
   * วันที่ไม่มีแถวสรุป (ไม่มา + ไม่มีใครกดคำนวณ) ยังต้องติดล็อกระดับงวด
   * ไม่งั้นวันว่างของงวดที่ปิดแล้วจะกลายเป็นช่องยัดใบลาย้อนหลัง
   */
  it('ไม่มีสรุปเวลา แต่ช่วงคาบเกี่ยวงวดที่ปิดแล้ว ต้องโยน', async () => {
    const db = buildDb({ lockedPeriod: { name: 'งวด ก.ค. 2026' } });

    await expect(
      assertDateRangeNotLocked(db as never, 'emp-1', RANGE.start, RANGE.end),
    ).rejects.toThrow(/งวดเงินเดือน/);
  });

  it('เงื่อนไขค้นงวด ต้องเทียบแบบช่วงคาบเกี่ยว ไม่ใช่วันเดียว', async () => {
    const db = buildDb({});
    await assertDateRangeNotLocked(db as never, 'emp-1', RANGE.start, RANGE.end);

    const where = db.payrollPeriod.findFirst.mock.calls[0][0].where;
    // งวดเริ่มก่อนวันจบของช่วง และจบหลังวันเริ่มของช่วง = คาบเกี่ยว
    expect(where.startDate).toEqual({ lte: RANGE.end });
    expect(where.endDate).toEqual({ gte: RANGE.start });
    expect(where.companyId).toBe('com-1');
  });

  it('หาพนักงานไม่เจอ ต้องไม่ล้ม (ปล่อยให้ชั้นถัดไปจัดการ)', async () => {
    const db = buildDb({ employee: null });

    await expect(
      assertDateRangeNotLocked(db as never, 'emp-1', RANGE.start, RANGE.end),
    ).resolves.toBeUndefined();
  });
});
