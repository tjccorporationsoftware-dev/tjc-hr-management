import {
  hasNonAsciiLocalPart,
  normalizeEmail,
  normalizeOptionalEmail,
} from './email.util';

describe('email.util', () => {
  describe('normalizeEmail', () => {
    it('แปลงเป็นพิมพ์เล็กและตัดช่องว่างหัวท้าย', () => {
      expect(normalizeEmail('  MiXeD@GMAIL.com  ')).toBe('mixed@gmail.com');
    });

    it('อีเมลที่ถูกอยู่แล้วต้องไม่เปลี่ยน', () => {
      expect(normalizeEmail('a.b+tag@example.co.th')).toBe(
        'a.b+tag@example.co.th',
      );
    });
  });

  describe('normalizeOptionalEmail', () => {
    it('ปล่อย null / undefined ผ่านไปตามเดิม', () => {
      expect(normalizeOptionalEmail(null)).toBeNull();
      expect(normalizeOptionalEmail(undefined)).toBeUndefined();
    });

    it('ช่องว่างล้วนถือว่าไม่ได้กรอก', () => {
      expect(normalizeOptionalEmail('   ')).toBeNull();
    });
  });

  describe('hasNonAsciiLocalPart', () => {
    /*
     * เคสจริงที่ทำให้พนักงานล็อกอินไม่ได้ — พิมพ์อีเมลตอนแป้นพิมพ์ยังเป็นภาษาไทย
     * ได้ไม้จัตวา (U+0E4B) ติดมาหน้าอีเมลโดยแทบมองไม่เห็น
     */
    it('จับวรรณยุกต์ไทยที่ติดมาหน้าอีเมลได้', () => {
      expect(hasNonAsciiLocalPart('๋j@gmail.com')).toBe(true);
    });

    it('จับอักษรไทยเต็มตัวได้', () => {
      expect(hasNonAsciiLocalPart('สมชาย@gmail.com')).toBe(true);
    });

    it('อีเมลภาษาอังกฤษปกติต้องไม่ถูกจับ', () => {
      expect(hasNonAsciiLocalPart('somchai@gmail.com')).toBe(false);
    });

    it('ดูเฉพาะส่วนหน้า @ ไม่สนโดเมน', () => {
      expect(hasNonAsciiLocalPart('somchai@บริษัท.ไทย')).toBe(false);
    });
  });
});
