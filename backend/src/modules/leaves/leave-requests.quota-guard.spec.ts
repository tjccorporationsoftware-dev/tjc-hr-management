import { LeaveRequestsService } from './leave-requests.service';

/**
 * เงื่อนไข "ห้ามลาเกินโควตา" จากหน้า ตั้งค่า > นโยบายการทำงาน > การลา
 *
 * ค่าเริ่มต้นต้องบล็อกเสมอ เพื่อให้เท่ากับพฤติกรรมเดิมของระบบ
 * ปิดสวิตช์เมื่อไหร่จึงยอมให้ยอดคงเหลือติดลบ
 */
type QuotaGuard = {
  shouldBlockOverQuota(leaveType: {
    enforceQuotaLimit?: boolean | null;
  }): boolean;
  shouldDeductLeaveQuota(leaveType: { deductQuota?: boolean | null }): boolean;
};

describe('LeaveRequestsService · ห้ามลาเกินโควตา', () => {
  const service = Object.create(
    LeaveRequestsService.prototype,
  ) as unknown as QuotaGuard;

  describe('shouldBlockOverQuota', () => {
    it('เปิดสวิตช์ = บล็อกเมื่อโควตาไม่พอ', () => {
      expect(service.shouldBlockOverQuota({ enforceQuotaLimit: true })).toBe(
        true,
      );
    });

    it('ปิดสวิตช์ = ยื่นได้ ยอดติดลบ', () => {
      expect(service.shouldBlockOverQuota({ enforceQuotaLimit: false })).toBe(
        false,
      );
    });

    it('ไม่ได้ตั้งค่า = บล็อก (เท่าพฤติกรรมเดิมของระบบ)', () => {
      expect(service.shouldBlockOverQuota({})).toBe(true);
      expect(service.shouldBlockOverQuota({ enforceQuotaLimit: null })).toBe(
        true,
      );
      expect(
        service.shouldBlockOverQuota({ enforceQuotaLimit: undefined }),
      ).toBe(true);
    });
  });

  describe('shouldDeductLeaveQuota', () => {
    it('หักโควตาเป็นค่าเริ่มต้น', () => {
      expect(service.shouldDeductLeaveQuota({})).toBe(true);
      expect(service.shouldDeductLeaveQuota({ deductQuota: true })).toBe(true);
    });

    it('ประเภทลาที่ไม่หักโควตา ข้ามการตรวจยอดคงเหลือ', () => {
      expect(service.shouldDeductLeaveQuota({ deductQuota: false })).toBe(
        false,
      );
    });
  });
});
