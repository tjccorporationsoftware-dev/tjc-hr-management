import { BadRequestException } from '@nestjs/common';

import {
  assertWorkDateNotLocked,
  checkWorkDateLocked,
} from './utils/attendance-lock.util';

/**
 * งวดที่ปิดและล็อกแล้วต้องแก้เวลาทำงานไม่ได้
 *
 * เคสที่เคยพังจริง:
 *  1. ระบบตรวจสถานะล็อกเฉพาะตอนเปลี่ยนสถานะใน HR Review แต่เส้นทางเขียนเวลาจริง
 *     (ลงเวลาเข้า/ออกเอง, เครื่องสแกน, อนุมัติคำขอแก้เวลา) ไม่ตรวจเลย
 *  2. วันที่ยังไม่มีแถวสรุปรายวัน (พนักงานไม่มาและไม่มีใครกดคำนวณ) หลุดออกไปทั้งหมด
 *     ทั้งที่งวดเงินเดือนปิดและจ่ายเงินไปแล้ว
 *
 * ผลคือ log กับสรุปรายวันขัดกันเอง และถ้ามีใครกดคำนวณใหม่ภายหลัง
 * ตัวเลขจะเปลี่ยนหลังจ่ายเงินโดยไม่มีร่องรอยว่าจ่ายไปเท่าไร
 */
describe('ล็อกงวด · กันแก้เวลาที่ปิดงวดแล้ว', () => {
  const workDate = new Date('2026-07-10T00:00:00.000Z');

  function buildDb(summary: unknown, lockedPeriod: unknown = null) {
    return {
      attendanceDailySummary: {
        findFirst: jest.fn().mockResolvedValue(summary),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({ companyId: 'com-1' }),
      },
      payrollPeriod: {
        findFirst: jest.fn().mockResolvedValue(lockedPeriod),
      },
    };
  }

  describe('ระดับสรุปรายวัน', () => {
    it('สรุปรายวันปกติที่ยังไม่ล็อก และงวดยังเปิดอยู่ ให้ผ่านได้', async () => {
      const db = buildDb({
        lockedAt: null,
        reviewStatus: 'CALCULATED',
        payrollRunId: null,
        sentToPayrollAt: null,
      });

      await expect(checkWorkDateLocked(db, 'emp-1', workDate)).resolves.toBeNull();
    });

    it('ล็อกด้วยเวลา lockedAt ต้องปฏิเสธ', async () => {
      const db = buildDb({
        lockedAt: new Date(),
        reviewStatus: 'REVIEWED',
        payrollRunId: null,
        sentToPayrollAt: null,
      });

      await expect(
        assertWorkDateNotLocked(db, 'emp-1', workDate),
      ).rejects.toThrow(BadRequestException);
    });

    it('ล็อกด้วยสถานะ LOCKED ต้องปฏิเสธ', async () => {
      const db = buildDb({
        lockedAt: null,
        reviewStatus: 'LOCKED',
        payrollRunId: null,
        sentToPayrollAt: null,
      });

      await expect(
        assertWorkDateNotLocked(db, 'emp-1', workDate),
      ).rejects.toThrow(BadRequestException);
    });

    it('ส่งเข้า Payroll แล้วต้องปฏิเสธ แม้ยังไม่ได้ล็อก', async () => {
      const db = buildDb({
        lockedAt: null,
        reviewStatus: 'READY_FOR_PAYROLL',
        payrollRunId: 'run-1',
        sentToPayrollAt: new Date(),
      });

      await expect(
        assertWorkDateNotLocked(db, 'emp-1', workDate),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ระดับงวดเงินเดือน — รูรั่วที่ไม่มีแถวสรุปรายวัน', () => {
    it('ไม่มีสรุปรายวัน แต่งวดปิดไปแล้ว ต้องปฏิเสธ', async () => {
      const db = buildDb(null, { name: 'งวดกรกฎาคม 2569' });
      const reason = await checkWorkDateLocked(db, 'emp-1', workDate);

      expect(reason).toContain('งวดกรกฎาคม 2569');
    });

    it('ไม่มีสรุปรายวัน และงวดยังเปิดอยู่ ให้ผ่านได้', async () => {
      const db = buildDb(null, null);

      await expect(checkWorkDateLocked(db, 'emp-1', workDate)).resolves.toBeNull();
    });

    it('ค้นงวดด้วยบริษัทของพนักงาน และวันที่ต้องอยู่ในช่วงงวด', async () => {
      const db = buildDb(null, null);
      await checkWorkDateLocked(db, 'emp-1', workDate);

      const where = db.payrollPeriod.findFirst.mock.calls[0][0].where;

      expect(where.companyId).toBe('com-1');
      expect(where.startDate).toEqual({ lte: workDate });
      expect(where.endDate).toEqual({ gte: workDate });
      // งวดที่ถูกยกเลิกหรือลบแล้วต้องไม่บล็อก
      expect(where.deletedAt).toBeNull();
      expect(where.cancelledAt).toBeNull();
    });

    it('หาพนักงานไม่เจอ ไม่บล็อก (ปล่อยให้ชั้นอื่นจัดการ)', async () => {
      const db = buildDb(null, { name: 'งวดใดก็ตาม' });
      db.employee.findUnique.mockResolvedValue(null);

      await expect(checkWorkDateLocked(db, 'emp-1', workDate)).resolves.toBeNull();
      expect(db.payrollPeriod.findFirst).not.toHaveBeenCalled();
    });

    it('สรุปรายวันล็อกอยู่แล้ว ไม่ต้องไปถามระดับงวดซ้ำ', async () => {
      const db = buildDb({
        lockedAt: new Date(),
        reviewStatus: 'LOCKED',
        payrollRunId: null,
        sentToPayrollAt: null,
      });

      await checkWorkDateLocked(db, 'emp-1', workDate);

      expect(db.payrollPeriod.findFirst).not.toHaveBeenCalled();
    });
  });
});
