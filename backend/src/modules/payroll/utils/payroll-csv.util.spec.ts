import {
  buildCsv,
  csvDigits,
  csvEscape,
  csvMoney,
  safeFileName,
  toDateOnlyText,
} from './payroll-csv.util';

describe('payroll-csv.util', () => {
  describe('csvEscape', () => {
    it('ข้อความธรรมดาไม่ต้องครอบเครื่องหมายคำพูด', () => {
      expect(csvEscape('สมชาย ใจดี')).toBe('สมชาย ใจดี');
    });

    it('มีคอมมาต้องครอบด้วยเครื่องหมายคำพูด', () => {
      expect(csvEscape('กรุงเทพฯ, ประเทศไทย')).toBe('"กรุงเทพฯ, ประเทศไทย"');
    });

    it('มีเครื่องหมายคำพูดต้อง escape เป็นสองตัว', () => {
      expect(csvEscape('บริษัท "เอ" จำกัด')).toBe('"บริษัท ""เอ"" จำกัด"');
    });

    it('ขึ้นบรรทัดใหม่ต้องครอบไว้ ไม่ให้แถวเพี้ยน', () => {
      expect(csvEscape('บรรทัด1\nบรรทัด2')).toBe('"บรรทัด1\nบรรทัด2"');
    });

    it('ค่าว่างและ null เป็นช่องว่าง', () => {
      expect(csvEscape(null)).toBe('');
      expect(csvEscape(undefined)).toBe('');
    });
  });

  describe('buildCsv', () => {
    it('ขึ้นต้นด้วย BOM ให้ Excel อ่านภาษาไทยได้', () => {
      const csv = buildCsv(['ชื่อ'], [{ ชื่อ: 'สมชาย' }]);

      expect(csv.charCodeAt(0)).toBe(0xfeff);
    });

    it('เรียงคอลัมน์ตามหัวตารางเสมอ', () => {
      const csv = buildCsv(
        ['รหัส', 'ชื่อ', 'ยอด'],
        [{ ยอด: '100.00', รหัส: 'E001', ชื่อ: 'สมชาย' }],
      );
      const rows = csv.replace('﻿', '').split('\r\n');

      expect(rows[0]).toBe('รหัส,ชื่อ,ยอด');
      expect(rows[1]).toBe('E001,สมชาย,100.00');
    });

    it('ช่องที่ไม่มีข้อมูลเป็นค่าว่าง ไม่ใช่ undefined', () => {
      const csv = buildCsv(['รหัส', 'ชื่อ'], [{ รหัส: 'E001' }]);

      expect(csv.replace('﻿', '').split('\r\n')[1]).toBe('E001,');
    });

    it('ไม่มีข้อมูล ยังได้หัวตาราง', () => {
      expect(buildCsv(['รหัส'], []).replace('﻿', '')).toBe('รหัส');
    });
  });

  describe('csvMoney', () => {
    it('ทศนิยม 2 ตำแหน่งเสมอ ไม่มีคอมมาคั่นหลัก', () => {
      expect(csvMoney(1234.5)).toBe('1234.50');
      expect(csvMoney(0)).toBe('0.00');
      expect(csvMoney('875')).toBe('875.00');
    });

    it('ค่าเพี้ยนหรือว่าง เป็น 0.00', () => {
      expect(csvMoney(null)).toBe('0.00');
      expect(csvMoney('ไม่ใช่ตัวเลข')).toBe('0.00');
    });
  });

  describe('csvDigits', () => {
    it('เก็บเฉพาะตัวเลข ตัดขีดและช่องว่างออก', () => {
      expect(csvDigits('1-2345-67890-12-3')).toBe('1234567890123');
      expect(csvDigits('123-4-56789-0')).toBe('123456789 0'.replace(' ', ''));
    });

    it('เลข 0 นำหน้าต้องไม่หาย', () => {
      expect(csvDigits('0123456789')).toBe('0123456789');
    });

    it('ค่าว่างเป็นข้อความว่าง', () => {
      expect(csvDigits(null)).toBe('');
    });
  });

  describe('safeFileName', () => {
    it('ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ออก', () => {
      expect(safeFileName('สปส 1-10/2569', 'report')).toBe('-1-10-2569');
    });

    it('ค่าว่างใช้ชื่อสำรอง', () => {
      expect(safeFileName('', 'report')).toBe('report');
      expect(safeFileName(null, 'report')).toBe('report');
    });
  });

  describe('toDateOnlyText', () => {
    it('คืนรูปแบบ YYYY-MM-DD', () => {
      expect(toDateOnlyText(new Date('2026-07-27T10:30:00.000Z'))).toBe(
        '2026-07-27',
      );
    });

    it('ค่าว่างหรือวันที่เพี้ยน คืนข้อความว่าง', () => {
      expect(toDateOnlyText(null)).toBe('');
      expect(toDateOnlyText('ไม่ใช่วันที่')).toBe('');
    });
  });
});
