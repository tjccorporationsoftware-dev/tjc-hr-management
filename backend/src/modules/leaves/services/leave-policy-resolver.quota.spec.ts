import { LeavePolicyResolverService } from './leave-policy-resolver.service';

/**
 * โควตาวันลาตามอายุงาน — จุดที่พังจริงตอนตั้งระบบใหม่
 *
 * ประเภทลาที่นับอายุงานจาก "วันบรรจุ" (พักร้อน ป่วย ลากิจไม่รับค่าจ้าง ลาคลอด)
 * ต้องให้ผลเหมือนกันไม่ว่านโยบายนั้นจะมีขั้นบันไดอายุงานหรือไม่
 * เดิมมีขั้นบันได = 0 วัน / ไม่มีขั้นบันได = เต็มโควตา ซึ่งขัดกันเอง
 */
describe('LeavePolicyResolverService · resolveQuotaDays', () => {
  const service = Object.create(
    LeavePolicyResolverService.prototype,
  ) as LeavePolicyResolverService;

  const policy = (annualQuotaDays: number, tiers: Array<[number, number]> = []) =>
    ({
      annualQuotaDays,
      quotaTiers: tiers.map(([minServiceMonths, quotaDays], index) => ({
        minServiceMonths,
        quotaDays,
        sortOrder: index,
      })),
    }) as never;

  const byProbation = { serviceStartBasis: 'PROBATION_PASS_DATE', prorateFirstYear: true } as const;
  const byHire = { serviceStartBasis: 'HIRE_DATE', prorateFirstYear: true } as const;

  const endOf2026 = new Date(2026, 11, 31);

  describe('ยังไม่บรรจุ + ประเภทลานับจากวันบรรจุ', () => {
    const notConfirmed = {
      startDate: new Date(2022, 9, 3),
      probationPassedAt: null,
    };

    it('มีขั้นบันไดอายุงาน = ยังไม่ได้โควตา', () => {
      expect(
        service.resolveQuotaDays(policy(6, [[0, 6]]), byProbation, notConfirmed, endOf2026),
      ).toEqual({ quotaDays: 0, serviceMonths: null, prorated: false });
    });

    it('ไม่มีขั้นบันไดอายุงาน = ยังไม่ได้โควตาเหมือนกัน', () => {
      expect(
        service.resolveQuotaDays(policy(6), byProbation, notConfirmed, endOf2026),
      ).toEqual({ quotaDays: 0, serviceMonths: null, prorated: false });
    });
  });

  describe('บรรจุแล้ว', () => {
    it('อายุงานเกิน 1 ปี = เต็มโควตา ไม่เฉลี่ย', () => {
      const result = service.resolveQuotaDays(
        policy(6, [[0, 6]]),
        byProbation,
        { startDate: new Date(2022, 9, 3), probationPassedAt: new Date(2023, 0, 30) },
        endOf2026,
      );

      expect(result.quotaDays).toBe(6);
      expect(result.prorated).toBe(false);
    });

    it('บรรจุกลางปี = เฉลี่ยตามเดือนที่เหลือ', () => {
      // บรรจุ 30 มิ.ย. 2026 -> สิ้นปีอายุงาน 6 เดือน -> 6 x 6/12 = 3
      const result = service.resolveQuotaDays(
        policy(6, [[0, 6]]),
        byProbation,
        { startDate: new Date(2026, 2, 2), probationPassedAt: new Date(2026, 5, 30) },
        endOf2026,
      );

      expect(result).toEqual({ quotaDays: 3, serviceMonths: 6, prorated: true });
    });

    it('เลือกขั้นบันไดสูงสุดที่อายุงานถึง', () => {
      const tiered = policy(6, [
        [0, 6],
        [60, 10],
        [120, 15],
      ]);

      // บรรจุ ม.ค. 2018 -> สิ้นปี 2026 อายุงาน 107 เดือน -> ขั้น 60 เดือน = 10 วัน
      const result = service.resolveQuotaDays(
        tiered,
        byProbation,
        { startDate: new Date(2018, 0, 8), probationPassedAt: new Date(2018, 0, 8) },
        endOf2026,
      );

      expect(result.quotaDays).toBe(10);
    });
  });

  describe('ประเภทลาที่นับจากวันเริ่มงาน', () => {
    it('ไม่ต้องรอบรรจุ ใช้วันเริ่มงานได้เลย', () => {
      const result = service.resolveQuotaDays(
        policy(3, [[0, 3]]),
        byHire,
        { startDate: new Date(2022, 9, 3), probationPassedAt: null },
        endOf2026,
      );

      expect(result.quotaDays).toBe(3);
    });
  });
});

/**
 * สิทธิลาตามกฎหมายต้องไม่ถูกปิดด้วยการตั้งค่า
 *
 * ต้องแก้ทั้งสองที่พร้อมกัน ไม่งั้นเกิดสภาพขัดกันเอง:
 * assertEligible ปล่อยให้ยื่นได้ แต่โควตาคำนวณได้ 0 แล้วถูกบล็อกซ้ำ
 * ด้วยเงื่อนไข "ห้ามลาเกินโควตา" — สุดท้ายก็ยังลาป่วยไม่ได้อยู่ดี
 */
describe('resolveQuotaDays · สิทธิลาตามกฎหมาย', () => {
  const service = Object.create(
    LeavePolicyResolverService.prototype,
  ) as LeavePolicyResolverService;

  const policy = (annualQuotaDays: number) =>
    ({ annualQuotaDays, quotaTiers: [] }) as never;

  const asOf = new Date(2026, 11, 31);

  /** เข้างานต้นปี ยังไม่ผ่านทดลองงาน */
  const notConfirmed = {
    startDate: new Date(2026, 0, 1),
    probationPassedAt: null,
  };

  const sickByProbation = {
    code: 'SICK',
    referenceCode: null,
    serviceStartBasis: 'PROBATION_PASS_DATE' as const,
    prorateFirstYear: false,
  };

  const annualByProbation = {
    code: 'ANNUAL',
    referenceCode: null,
    serviceStartBasis: 'PROBATION_PASS_DATE' as const,
    prorateFirstYear: false,
  };

  it('ลาป่วยที่ถูกตั้งให้นับจากวันบรรจุ ยังได้โควตาเต็มแม้ยังไม่ผ่านทดลองงาน', () => {
    const result = service.resolveQuotaDays(
      policy(30),
      sickByProbation,
      notConfirmed,
      asOf,
    );

    expect(result.quotaDays).toBe(30);
  });

  it('ลาพักร้อนที่ตั้งแบบเดียวกัน ยังได้ 0 ตามที่บริษัทตั้ง — ไม่ใช่สิทธิตามกฎหมาย', () => {
    const result = service.resolveQuotaDays(
      policy(10),
      annualByProbation,
      notConfirmed,
      asOf,
    );

    expect(result.quotaDays).toBe(0);
  });
});
