import { DocumentWorkflowService } from './document-workflow.service';

/**
 * จำนวนเงินเป็นตัวอักษรและอายุงาน ถูกพิมพ์ลงหนังสือรับรองที่ใช้ยื่นธนาคาร/สถานทูต
 * ผิดแม้แต่หลักเดียวคือเอกสารใช้ไม่ได้ จึงล็อกพฤติกรรมไว้ด้วยเทสต์
 */
describe('DocumentWorkflowService · render tokens', () => {
  // method ที่เทสต์เป็น pure function ไม่แตะ prisma/notifications
  const service = new DocumentWorkflowService(
    null as never,
    null as never,
  ) as unknown as {
    formatBahtText: (amount: number) => string;
    formatMoney: (amount: number) => string;
    calculateServiceDuration: (
      startDate: Date,
      endDate: Date,
    ) => { years: number; months: number; text: string };
    buildNextSerialNo: (prefix: string, latestSerialNo: string | null) => string;
  };

  describe('formatBahtText', () => {
    it.each([
      [0, 'ศูนย์บาทถ้วน'],
      [1, 'หนึ่งบาทถ้วน'],
      [10, 'สิบบาทถ้วน'],
      [11, 'สิบเอ็ดบาทถ้วน'],
      [20, 'ยี่สิบบาทถ้วน'],
      [21, 'ยี่สิบเอ็ดบาทถ้วน'],
      [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
      [1_000, 'หนึ่งพันบาทถ้วน'],
      [25_500, 'สองหมื่นห้าพันห้าร้อยบาทถ้วน'],
      [100_000, 'หนึ่งแสนบาทถ้วน'],
      [1_000_000, 'หนึ่งล้านบาทถ้วน'],
      [1_000_001, 'หนึ่งล้านหนึ่งบาทถ้วน'],
      [2_500_250, 'สองล้านห้าแสนสองร้อยห้าสิบบาทถ้วน'],
    ])('แปลง %s เป็น "%s"', (amount, expected) => {
      expect(service.formatBahtText(amount)).toBe(expected);
    });

    it('รองรับเศษสตางค์', () => {
      expect(service.formatBahtText(1_250.5)).toBe(
        'หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์',
      );
      expect(service.formatBahtText(20.25)).toBe(
        'ยี่สิบบาทยี่สิบห้าสตางค์',
      );
    });

    it('ปัดเศษที่เกินสองตำแหน่งก่อนแปลง', () => {
      expect(service.formatBahtText(99.999)).toBe('หนึ่งร้อยบาทถ้วน');
    });
  });

  describe('formatMoney', () => {
    it('คงทศนิยมสองตำแหน่งเสมอ', () => {
      expect(service.formatMoney(25_500)).toBe('25,500.00');
      expect(service.formatMoney(1_250.5)).toBe('1,250.50');
    });
  });

  describe('buildNextSerialNo', () => {
    it('เริ่มที่ 0001 เมื่อยังไม่เคยออกเลข', () => {
      expect(service.buildNextSerialNo('TJC-2026', null)).toBe('TJC-2026-0001');
    });

    it('เดินเลขต่อจากเลขล่าสุด', () => {
      expect(service.buildNextSerialNo('TJC-2026', 'TJC-2026-0001')).toBe(
        'TJC-2026-0002',
      );
      expect(service.buildNextSerialNo('TJC-2026', 'TJC-2026-0009')).toBe(
        'TJC-2026-0010',
      );
    });

    it('ไม่ตัดหลักเมื่อเลขเกินสี่หลัก', () => {
      expect(service.buildNextSerialNo('TJC-2026', 'TJC-2026-9999')).toBe(
        'TJC-2026-10000',
      );
    });

    it('รองรับ prefix ที่มีขีดคั่นหลายชั้น (รหัสบริษัทมีขีด)', () => {
      // split('-').pop() แบบเดิมพังกับกรณีนี้ จึงต้องตัดด้วยความยาว prefix
      expect(
        service.buildNextSerialNo('TJC-HR-2026', 'TJC-HR-2026-0042'),
      ).toBe('TJC-HR-2026-0043');
    });

    it('เริ่มใหม่ที่ 0001 ถ้าเลขล่าสุดผิดรูปแบบ', () => {
      expect(service.buildNextSerialNo('TJC-2026', 'TJC-2026-ABCD')).toBe(
        'TJC-2026-0001',
      );
      expect(service.buildNextSerialNo('TJC-2026', 'TJC-2026-')).toBe(
        'TJC-2026-0001',
      );
    });

    it('ใช้กับเลขคำขอรายวันได้เหมือนกัน', () => {
      expect(
        service.buildNextSerialNo('DOC20260723', 'DOC20260723-0123'),
      ).toBe('DOC20260723-0124');
    });
  });

  describe('calculateServiceDuration', () => {
    it('นับปีและเดือนแบบไม่ปัดขึ้น', () => {
      const result = service.calculateServiceDuration(
        new Date('2020-03-15'),
        new Date('2026-07-22'),
      );

      expect(result).toEqual({ years: 6, months: 4, text: '6 ปี 4 เดือน' });
    });

    it('ยังไม่ครบเดือนถือว่าไม่ถึงหนึ่งเดือน', () => {
      const result = service.calculateServiceDuration(
        new Date('2026-07-10'),
        new Date('2026-07-22'),
      );

      expect(result).toEqual({
        years: 0,
        months: 0,
        text: 'น้อยกว่า 1 เดือน',
      });
    });

    it('ไม่นับเดือนที่ยังไม่ถึงวันครบรอบ', () => {
      const result = service.calculateServiceDuration(
        new Date('2025-01-31'),
        new Date('2026-01-30'),
      );

      expect(result.years).toBe(0);
      expect(result.months).toBe(11);
    });

    it('วันที่ในอนาคตไม่ทำให้อายุงานติดลบ', () => {
      const result = service.calculateServiceDuration(
        new Date('2027-01-01'),
        new Date('2026-07-22'),
      );

      expect(result).toEqual({
        years: 0,
        months: 0,
        text: 'น้อยกว่า 1 เดือน',
      });
    });
  });
});
