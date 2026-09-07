import {
  BANK_FORMAT_LABEL,
  KTB_TOTAL_WIDTH,
  buildBankTransferFile,
  type BankTransferRow,
} from './payroll-bank-format.util';

/**
 * แยกบรรทัดโดยไม่ใช้ trim เพราะช่อง filler ท้ายบรรทัดเป็นช่องว่างที่ต้องคงไว้
 * ถ้า trim ทิ้ง ความกว้างบรรทัดสุดท้ายจะสั้นกว่าจริง
 */
function splitLines(content: string) {
  return content.split('\r\n').filter((line) => line.length > 0);
}

const context = {
  companyName: 'บริษัท อัลฟ่า จำกัด',
  companyCode: 'ALPHA01',
  debitAccountNo: '123-4-56789-0',
  paymentDate: '2026-07-27',
  runNo: 'RUN-2569-12',
};

const row = (overrides: Partial<BankTransferRow> = {}): BankTransferRow => ({
  sequence: 1,
  employeeCode: 'E001',
  employeeName: 'สมชาย ทองคำ',
  bankAccountNo: '9876543210',
  bankAccountName: 'สมชาย ทองคำ',
  bankName: 'กรุงไทย',
  netPay: 26586,
  ...overrides,
});

describe('payroll-bank-format.util', () => {
  describe('KTB iPay', () => {
    it('ทุกบรรทัดกว้างเท่ากันตามที่ประกาศไว้', () => {
      const file = buildBankTransferFile(
        'KTB_IPAY',
        [row(), row({ sequence: 2 })],
        context,
      );
      const lines = splitLines(file.content);

      expect(lines).toHaveLength(3); // header + 2 detail
      for (const line of lines) {
        expect(line).toHaveLength(KTB_TOTAL_WIDTH);
      }
    });

    it('บรรทัดแรกเป็น header (ขึ้นต้นด้วย 1) บรรทัดถัดไปเป็นรายการ (2)', () => {
      const file = buildBankTransferFile('KTB_IPAY', [row()], context);
      const lines = splitLines(file.content);

      expect(lines[0].startsWith('1')).toBe(true);
      expect(lines[1].startsWith('2')).toBe(true);
    });

    it('จำนวนเงินเป็นสตางค์ ไม่มีจุดทศนิยม', () => {
      const file = buildBankTransferFile(
        'KTB_IPAY',
        [row({ netPay: 1234.5 })],
        context,
      );
      const detail = splitLines(file.content)[1];

      // 1,234.50 บาท = 123450 สตางค์
      expect(detail).toContain('0000000123450');
    });

    it('ข้ามรายการที่ไม่มีเลขบัญชี เพราะธนาคารจะปฏิเสธทั้งไฟล์', () => {
      const file = buildBankTransferFile(
        'KTB_IPAY',
        [row(), row({ sequence: 2, bankAccountNo: null })],
        context,
      );
      const lines = splitLines(file.content);

      expect(lines).toHaveLength(2); // header + 1 detail
      expect(file.note).toContain('ข้าม 1 รายการ');
    });

    /*
     * เดิมคืนไฟล์ที่มีแต่บรรทัดหัว แล้วผู้ใช้ส่งเข้าธนาคารจริงได้
     * โดยหน้าจอยังขึ้นยอดเงินครบ ธนาคารจะตีกลับทั้งไฟล์
     * ตอนนี้ปฏิเสธตั้งแต่ต้นทางแทน
     */
    it('ทุกรายการยอดเงินเป็นศูนย์ ต้องสร้างไฟล์ไม่ได้', () => {
      expect(() =>
        buildBankTransferFile('KTB_IPAY', [row({ netPay: 0 })], context),
      ).toThrow('ไม่มีรายการที่มีเลขบัญชีธนาคารครบ');
    });

    it('ขาดเลขบัญชีบางคน ยังสร้างไฟล์ได้ แต่ต้องคืนรายชื่อที่ถูกข้าม', () => {
      const file = buildBankTransferFile(
        'KTB_IPAY',
        [row(), row({ bankAccountNo: null })],
        context,
      );

      expect(file.totalRows).toBe(2);
      expect(file.filedRows).toBe(1);
      expect(file.skipped).toHaveLength(1);
      expect(file.skipped?.[0].missing).toContain('เลขที่บัญชีธนาคาร');
    });

    it('ติดธงว่ายังต้องเทียบสเปกธนาคารก่อนใช้จริง', () => {
      const file = buildBankTransferFile('KTB_IPAY', [row()], context);

      expect(file.requiresSpecReview).toBe(true);
      expect(file.note).toContain('สเปก');
      expect(file.fileName).toBe('ktb-ipay-RUN-2569-12.txt');
    });

    it('ไม่มีรายการเลย ต้องสร้างไฟล์ไม่ได้', () => {
      expect(() => buildBankTransferFile('KTB_IPAY', [], context)).toThrow(
        'ไม่มีรายการจ่ายเงินในรอบนี้',
      );
    });
  });

  describe('CSV รูปแบบกลาง', () => {
    it('เป็นไฟล์ CSV มี BOM และไม่ต้องเทียบสเปก', () => {
      const file = buildBankTransferFile('GENERIC_CSV', [row()], context);

      expect(file.content.charCodeAt(0)).toBe(0xfeff);
      expect(file.requiresSpecReview).toBe(false);
      expect(file.fileName).toBe('bank-transfer-RUN-2569-12.csv');
    });

    it('เก็บรายการที่ยังไม่มีเลขบัญชีไว้ด้วย เพื่อให้ HR เห็นว่าใครตกหล่น', () => {
      const file = buildBankTransferFile(
        'GENERIC_CSV',
        [row({ bankAccountNo: null })],
        context,
      );

      expect(file.content).toContain('E001');
    });
  });

  it('มีชื่อไทยกำกับทุกรูปแบบที่รองรับ', () => {
    expect(BANK_FORMAT_LABEL.KTB_IPAY).toContain('กรุงไทย');
    expect(BANK_FORMAT_LABEL.GENERIC_CSV).toContain('CSV');
  });
});
