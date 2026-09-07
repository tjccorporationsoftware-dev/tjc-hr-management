import { BadRequestException } from '@nestjs/common';

import { LeavePolicyResolverService } from './leave-policy-resolver.service';

/**
 * ด่าน "ต้องผ่านการบรรจุก่อนถึงจะลาได้"
 * -----------------------------------------------------------------------------
 * เคสที่หลุดถึงมือลูกค้าจริง (2569-08-18)
 *
 * ของเดิมใช้ `serviceStartBasis` ตัวเดียวทำสองหน้าที่ปนกัน
 *   1. ฐานนับอายุงานเพื่อคิดโควตา
 *   2. ด่านบล็อกไม่ให้ยื่นใบลา — โยน error ไม่ใช่แค่ให้โควตา 0
 *
 * HR ตั้งให้ลาพักร้อนนับอายุงานจากวันบรรจุ ซึ่งถูกต้อง แต่ผลพลอยได้คือ
 * ลาป่วยกับลาคลอดที่ตั้งค่าเดียวกันไว้ กลายเป็นบล็อกพนักงานทดลองงานไปด้วย
 * ป่วยแล้วยื่นใบลาไม่ได้ ต้องขาดงานและถูกหักเงินแทน — ขัด ม.32 และ ม.41
 *
 * ตอนนี้แยกเป็น `requireProbationPassed` ให้ HR กดเปิดเองทีละประเภท
 * และเพดานล่างตามกฎหมายยังอยู่เหนือปุ่มนั้นเสมอ
 */
describe('LeavePolicyResolverService · assertEligible ด่านผ่านทดลองงาน', () => {
  const service = Object.create(
    LeavePolicyResolverService.prototype,
  ) as LeavePolicyResolverService;

  /** ค่าที่ไม่เกี่ยวกับด่านนี้ ตั้งให้ผ่านหมด จะได้เหลือตัวแปรเดียวที่ทดสอบ */
  const leaveType = (overrides: Record<string, unknown>) =>
    ({
      id: 'lt-1',
      nameTh: 'ประเภททดสอบ',
      advanceNoticeDays: 0,
      genderEligibility: 'ALL',
      serviceStartBasis: 'HIRE_DATE',
      prorateFirstYear: false,
      enforceQuotaLimit: true,
      quotaAccrualYears: 1,
      ...overrides,
    }) as never;

  const employee = (probationPassedAt: Date | null) =>
    ({
      profile: { gender: 'FEMALE' },
      startDate: new Date(2026, 6, 16),
      probationPassedAt,
    }) as never;

  const call = (type: unknown, probationPassedAt: Date | null) =>
    service.assertEligible({
      leaveType: type as never,
      employee: employee(probationPassedAt),
      startDate: new Date(2026, 7, 20),
      isRetroactive: false,
    });

  const notPassed = null;
  const passed = new Date(2026, 5, 1);

  describe('ปุ่มปิดอยู่', () => {
    /* ข้อสำคัญที่สุด — ค่าเริ่มต้นต้องไม่กั้นใคร */
    it('ไม่ส่งค่ามาเลย ต้องยื่นได้', () => {
      expect(() => call(leaveType({}), notPassed)).not.toThrow();
    });

    it('ปิดไว้ชัดเจน ต้องยื่นได้', () => {
      expect(() =>
        call(leaveType({ requireProbationPassed: false }), notPassed),
      ).not.toThrow();
    });

    /*
     * หัวใจของการแยกฟิลด์ — นับอายุงานจากวันบรรจุ แต่ไม่ได้ห้ามยื่น
     * ก่อนแก้ เคสนี้คือเคสที่บล็อกลาป่วยทั้งบริษัท
     */
    it('นับอายุงานจากวันบรรจุ แต่ไม่ได้เปิดปุ่ม ต้องยื่นได้', () => {
      expect(() =>
        call(
          leaveType({
            serviceStartBasis: 'PROBATION_PASS_DATE',
            code: 'ANNUAL',
          }),
          notPassed,
        ),
      ).not.toThrow();
    });
  });

  describe('ปุ่มเปิดอยู่', () => {
    it('ยังไม่ผ่านบรรจุ ต้องยื่นไม่ได้', () => {
      expect(() =>
        call(
          leaveType({ requireProbationPassed: true, code: 'ANNUAL' }),
          notPassed,
        ),
      ).toThrow(BadRequestException);
    });

    it('ผ่านบรรจุแล้ว ต้องยื่นได้', () => {
      expect(() =>
        call(
          leaveType({ requireProbationPassed: true, code: 'ANNUAL' }),
          passed,
        ),
      ).not.toThrow();
    });
  });

  /*
   * เพดานล่างตามกฎหมาย — บริษัทตั้งค่าให้แย่กว่านี้ไม่ได้
   * ใช้รหัสจริงที่ seed สร้าง ไม่ใช่รหัสเปล่า ๆ เพราะรหัสเปล่าไม่มีอยู่จริง
   */
  describe('สิทธิลาตามกฎหมาย เปิดปุ่มแล้วก็ไม่มีผล', () => {
    const statutory: Array<[string, string]> = [
      ['ลาป่วยมีใบรับรองแพทย์ (ม.32)', 'SICK_CERTIFIED'],
      ['ลาป่วยไม่ได้รับค่าจ้าง (ม.32)', 'SICK_UNPAID'],
      ['ลาคลอดได้รับค่าจ้าง (ม.41)', 'MATERNITY_PAID'],
      ['ลากิจไม่ได้รับค่าจ้าง (ม.34)', 'PERSONAL_UNPAID'],
      ['ลาเพื่อทำหมัน (ม.33)', 'STERILIZATION'],
    ];

    for (const [label, code] of statutory) {
      it(`${label} ยังยื่นได้ทั้งที่ยังไม่ผ่านบรรจุ`, () => {
        expect(() =>
          call(
            leaveType({
              requireProbationPassed: true,
              serviceStartBasis: 'PROBATION_PASS_DATE',
              code,
            }),
            notPassed,
          ),
        ).not.toThrow();
      });
    }
  });
});
