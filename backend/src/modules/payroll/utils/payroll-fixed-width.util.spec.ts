import {
  buildFixedWidthLine,
  formatDateDMY,
  formatMonthBuddhistYear,
  joinFixedWidthLines,
  padAmountSatang,
  padNumber,
  padText,
} from './payroll-fixed-width.util';

/**
 * ไฟล์ fixed-width ที่ความกว้างผิดแม้ตัวอักษรเดียว ระบบปลายทางจะอ่านผิดทั้งบรรทัด
 * เทสต์ชุดนี้จึงคุมเรื่องความกว้างเป็นหลัก
 */
describe('payroll-fixed-width.util', () => {
  describe('padText', () => {
    it('ชิดซ้าย เติมช่องว่างจนครบความกว้าง', () => {
      expect(padText('สมชาย', 10)).toBe('สมชาย     ');
      expect(padText('สมชาย', 10)).toHaveLength(10);
    });

    it('ยาวเกินต้องตัดทิ้ง ไม่ให้ดันช่องถัดไปเพี้ยน', () => {
      expect(padText('abcdefghij', 5)).toBe('abcde');
    });

    it('ค่าว่างได้ช่องว่างเต็มความกว้าง', () => {
      expect(padText(null, 4)).toBe('    ');
    });
  });

  describe('padNumber', () => {
    it('ชิดขวา เติมศูนย์ซ้าย', () => {
      expect(padNumber('12345', 10)).toBe('0000012345');
    });

    it('ตัดขีดและช่องว่างออกก่อนเติมศูนย์', () => {
      expect(padNumber('123-4-56789-0', 11)).toBe('01234567890');
    });

    it('ยาวเกินเก็บหลักท้าย เพราะเลขบัญชีสำคัญที่หลักท้าย', () => {
      expect(padNumber('9876543210123', 10)).toBe('6543210123');
    });

    it('ค่าว่างได้ศูนย์ทั้งหมด', () => {
      expect(padNumber(null, 5)).toBe('00000');
    });
  });

  describe('padAmountSatang', () => {
    it('แปลงบาทเป็นสตางค์ ไม่มีจุดทศนิยม', () => {
      expect(padAmountSatang(1234.5, 12)).toBe('000000123450');
      expect(padAmountSatang(875, 9)).toBe('000087500');
    });

    it('ปัดเศษสตางค์ให้ลงตัว', () => {
      expect(padAmountSatang(0.005, 6)).toBe('000001');
    });

    it('ศูนย์และค่าติดลบเป็นศูนย์', () => {
      expect(padAmountSatang(0, 5)).toBe('00000');
      expect(padAmountSatang(-100, 5)).toBe('00000');
    });
  });

  describe('formatDateDMY', () => {
    it('รูปแบบ DDMMYYYY ปี ค.ศ.', () => {
      expect(formatDateDMY('2026-07-27')).toBe('27072026');
    });

    it('วันที่เพี้ยนได้ศูนย์', () => {
      expect(formatDateDMY('ไม่ใช่วันที่')).toBe('00000000');
    });
  });

  describe('formatMonthBuddhistYear', () => {
    it('รูปแบบ MMYYYY ปี พ.ศ.', () => {
      expect(formatMonthBuddhistYear('2026-07-27')).toBe('072569');
    });

    it('วันที่เพี้ยนได้ศูนย์', () => {
      expect(formatMonthBuddhistYear('ไม่ใช่วันที่')).toBe('000000');
    });
  });

  describe('buildFixedWidthLine', () => {
    it('ต่อทุกช่องเป็นบรรทัดเดียว', () => {
      const line = buildFixedWidthLine([
        { name: 'a', value: '12', width: 2 },
        { name: 'b', value: 'xyz', width: 3 },
      ]);

      expect(line).toBe('12xyz');
    });

    it('ความกว้างไม่ตรงต้อง error ทันที ไม่ปล่อยไฟล์เสียออกไป', () => {
      expect(() =>
        buildFixedWidthLine([{ name: 'เลขบัญชี', value: '123', width: 5 }]),
      ).toThrow('เลขบัญชี');
    });
  });

  describe('joinFixedWidthLines', () => {
    it('ใช้ CRLF และปิดท้ายด้วยขึ้นบรรทัดใหม่', () => {
      expect(joinFixedWidthLines(['aaa', 'bbb'])).toBe('aaa\r\nbbb\r\n');
    });

    it('ไม่มีบรรทัดเลย ได้ไฟล์ว่าง', () => {
      expect(joinFixedWidthLines([])).toBe('');
    });
  });
});
