import { BadRequestException } from '@nestjs/common';

import {
  assertValidEmployeeCode,
  buildEmployeeCodePrefix,
  generateEmployeeCode,
  isValidEmployeeCode,
} from './employee-code.util';

/**
 * กติการหัสพนักงาน (2569-09-11) — อักษรอังกฤษ/ตัวเลขเท่านั้น เพราะใช้เป็นชื่อผู้ใช้ล็อกอิน
 * และตัวออกรหัสอัตโนมัติต้องต่อเลขจากทะเบียนจริงของลูกค้า (รูปแบบ ปี พ.ศ. 2 หลัก + ลำดับ 4 หลัก)
 */
describe('employee-code.util', () => {
  describe('isValidEmployeeCode / assertValidEmployeeCode', () => {
    it.each(['690034', 'ABC123', 'abc', '114', 'A1b2C3'])(
      'รับ "%s"',
      (code) => {
        expect(isValidEmployeeCode(code)).toBe(true);
        expect(assertValidEmployeeCode(code)).toBe(code);
      },
    );

    it.each([
      'TJC-69-0001',
      'EMP 001',
      '69_0034',
      '690034.',
      'พนง001',
      '６９００３４',
      '',
      'A'.repeat(21),
    ])('ปฏิเสธ "%s"', (code) => {
      expect(isValidEmployeeCode(code)).toBe(false);
      expect(() => assertValidEmployeeCode(code)).toThrow(BadRequestException);
    });

    it('ตัดช่องว่างหัวท้ายให้ก่อนตรวจ', () => {
      expect(assertValidEmployeeCode('  690034 ')).toBe('690034');
    });
  });

  describe('generateEmployeeCode', () => {
    const tx = (codes: string[]) =>
      ({
        employee: {
          findMany: jest.fn(async () =>
            codes.map((employeeCode) => ({ employeeCode })),
          ),
        },
      }) as never;

    it('ส่วนนำคือปี พ.ศ. สองหลักของวันเริ่มงาน', () => {
      expect(buildEmployeeCodePrefix(new Date(2026, 8, 11))).toBe('69');
      expect(buildEmployeeCodePrefix(new Date(2025, 0, 1))).toBe('68');
    });

    it('ต่อเลขจากรหัสสูงสุดของปีนั้น', async () => {
      const code = await generateEmployeeCode(
        tx(['690001', '690054', '690010']),
        { companyId: 'c1', startDate: new Date(2026, 8, 11) },
      );
      expect(code).toBe('690055');
    });

    it('ปีใหม่เริ่มที่ 0001 และไม่นับรหัสรูปแบบอื่นที่บังเอิญขึ้นต้นเหมือนกัน', async () => {
      const code = await generateEmployeeCode(tx(['69', '6912345', '69A001']), {
        companyId: 'c1',
        startDate: new Date(2026, 8, 11),
      });
      expect(code).toBe('690001');
    });

    it('รหัสที่ออกให้ผ่านกติกาเดียวกับที่คนกรอกเอง', async () => {
      const code = await generateEmployeeCode(tx([]), {
        companyId: 'c1',
        startDate: new Date(2026, 8, 11),
      });
      expect(isValidEmployeeCode(code)).toBe(true);
    });
  });
});
