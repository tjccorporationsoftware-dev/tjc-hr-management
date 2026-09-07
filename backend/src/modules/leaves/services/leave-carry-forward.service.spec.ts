import { LeaveCarryForwardService } from './leave-carry-forward.service';

/**
 * สูตรสะสมวันลาข้ามปี และการหมดอายุของวันสะสม
 *
 * ตัวเลขพวกนี้ไปโผล่เป็นโควตาตั้งต้นของพนักงานในปีถัดไป
 * ถ้าไฟล์นี้แดง แปลว่าสิทธิ์วันลาของพนักงานกำลังจะเปลี่ยน
 */
type CarryMath = {
  remainingDays(balance: Balance): number;
  resolveCarryForwardDays(balance: Balance, policy: Policy): number;
  resolveCarryForwardExpiryDate(
    balanceYear: number,
    policy: Policy,
    quotaAccrualYears?: number,
  ): Date;
  resolveExpiringDays(balance: Balance): number;
};

type Balance = {
  entitlementDays: number;
  carriedForwardDays: number;
  adjustedDays: number;
  usedDays: number;
  pendingDays: number;
};

type Policy = {
  allowCarryForward: boolean;
  carryForwardLimitDays: number;
  carryForwardExpireMonth?: number | null;
  carryForwardExpireDay?: number | null;
};

const balance = (overrides: Partial<Balance> = {}): Balance => ({
  entitlementDays: 0,
  carriedForwardDays: 0,
  adjustedDays: 0,
  usedDays: 0,
  pendingDays: 0,
  ...overrides,
});

describe('LeaveCarryForwardService · สะสมวันลาข้ามปี', () => {
  const service = Object.create(
    LeaveCarryForwardService.prototype,
  ) as unknown as CarryMath;

  describe('remainingDays', () => {
    it('รวมสิทธิ์ + ยกมา + ปรับ แล้วหักที่ใช้และรออนุมัติ', () => {
      expect(
        service.remainingDays(
          balance({
            entitlementDays: 6,
            carriedForwardDays: 2,
            adjustedDays: 1,
            usedDays: 3,
            pendingDays: 1,
          }),
        ),
      ).toBe(5);
    });

    it('ใช้เกินสิทธิ์ ได้ค่าติดลบตามจริง', () => {
      expect(
        service.remainingDays(balance({ entitlementDays: 3, usedDays: 5 })),
      ).toBe(-2);
    });
  });

  describe('resolveCarryForwardDays', () => {
    const allow: Policy = {
      allowCarryForward: true,
      carryForwardLimitDays: 5,
    };

    it('ปิดการสะสม ไม่ยกอะไรไปเลย', () => {
      expect(
        service.resolveCarryForwardDays(balance({ entitlementDays: 10 }), {
          allowCarryForward: false,
          carryForwardLimitDays: 5,
        }),
      ).toBe(0);
    });

    it('ยกไปเท่าที่เหลือ เมื่อยังไม่ชนเพดาน', () => {
      expect(
        service.resolveCarryForwardDays(
          balance({ entitlementDays: 6, usedDays: 3 }),
          allow,
        ),
      ).toBe(3);
    });

    it('ยกไปได้ไม่เกินเพดานที่ตั้งไว้', () => {
      expect(
        service.resolveCarryForwardDays(
          balance({ entitlementDays: 12, usedDays: 1 }),
          allow,
        ),
      ).toBe(5);
    });

    it('เพดาน 0 = ไม่จำกัด ยกไปทั้งหมด', () => {
      expect(
        service.resolveCarryForwardDays(
          balance({ entitlementDays: 12, usedDays: 1 }),
          { allowCarryForward: true, carryForwardLimitDays: 0 },
        ),
      ).toBe(11);
    });

    it('ไม่มีวันเหลือ ไม่ยกอะไรไป', () => {
      expect(
        service.resolveCarryForwardDays(
          balance({ entitlementDays: 6, usedDays: 6 }),
          allow,
        ),
      ).toBe(0);
    });

    it('ยอดติดลบ ไม่ยกหนี้ข้ามปี', () => {
      expect(
        service.resolveCarryForwardDays(
          balance({ entitlementDays: 3, usedDays: 8 }),
          allow,
        ),
      ).toBe(0);
    });

    it('วันรออนุมัติถูกกันไว้ ไม่ถูกยกไปปีหน้า', () => {
      expect(
        service.resolveCarryForwardDays(
          balance({ entitlementDays: 6, usedDays: 2, pendingDays: 2 }),
          allow,
        ),
      ).toBe(2);
    });

    it('ปัดเป็นครึ่งวัน ให้ยังยื่นลาครึ่งวันได้', () => {
      expect(
        service.resolveCarryForwardDays(
          balance({ entitlementDays: 6, usedDays: 3.25 }),
          allow,
        ),
      ).toBe(3);
    });
  });

  describe('resolveCarryForwardExpiryDate', () => {
    const policy: Policy = {
      allowCarryForward: true,
      carryForwardLimitDays: 5,
    };

    it('ไม่กำหนดวันหมดอายุ = สิ้นปีนั้น', () => {
      const date = service.resolveCarryForwardExpiryDate(2026, policy, 1);

      expect(date.toISOString().slice(0, 10)).toBe('2026-12-31');
    });

    it('จำนวนปีสะสม 2 = ใช้ได้ถึงสิ้นปีถัดไป', () => {
      const date = service.resolveCarryForwardExpiryDate(2026, policy, 2);

      expect(date.toISOString().slice(0, 10)).toBe('2027-12-31');
    });

    it('กำหนดวัน/เดือนหมดอายุไว้ ใช้วันนั้นแทนสิ้นปี', () => {
      const date = service.resolveCarryForwardExpiryDate(
        2026,
        { ...policy, carryForwardExpireMonth: 3, carryForwardExpireDay: 31 },
        1,
      );

      expect(date.toISOString().slice(0, 10)).toBe('2026-03-31');
    });

    it('จำนวนปีสะสมเพี้ยนหรือไม่ระบุ ถือว่า 1 ปี', () => {
      expect(
        service
          .resolveCarryForwardExpiryDate(2026, policy, 0)
          .toISOString()
          .slice(0, 10),
      ).toBe('2026-12-31');
      expect(
        service
          .resolveCarryForwardExpiryDate(2026, policy)
          .toISOString()
          .slice(0, 10),
      ).toBe('2026-12-31');
    });
  });

  describe('resolveExpiringDays', () => {
    it('ยกมาแล้วไม่ได้ใช้เลย ตัดทิ้งทั้งหมด', () => {
      expect(
        service.resolveExpiringDays(
          balance({ entitlementDays: 6, carriedForwardDays: 2 }),
        ),
      ).toBe(2);
    });

    it('ใช้ไปบางส่วนแล้ว ตัดได้ไม่เกินที่ยังเหลือ', () => {
      // สิทธิ์ 6 + ยกมา 2 = 8 ใช้ไป 7 เหลือ 1
      expect(
        service.resolveExpiringDays(
          balance({ entitlementDays: 6, carriedForwardDays: 2, usedDays: 7 }),
        ),
      ).toBe(1);
    });

    it('ใช้หมดแล้ว ไม่ต้องตัดอะไร', () => {
      expect(
        service.resolveExpiringDays(
          balance({ entitlementDays: 6, carriedForwardDays: 2, usedDays: 8 }),
        ),
      ).toBe(0);
    });

    it('ไม่มียอดยกมา ไม่ต้องตัด', () => {
      expect(service.resolveExpiringDays(balance({ entitlementDays: 6 }))).toBe(
        0,
      );
    });

    it('วันรออนุมัติถูกกันไว้ ไม่ถูกตัดทิ้ง', () => {
      // สิทธิ์ 6 + ยกมา 2 = 8 ใช้ 5 รออนุมัติ 2 เหลือใช้ได้ 1
      expect(
        service.resolveExpiringDays(
          balance({
            entitlementDays: 6,
            carriedForwardDays: 2,
            usedDays: 5,
            pendingDays: 2,
          }),
        ),
      ).toBe(1);
    });
  });
});
