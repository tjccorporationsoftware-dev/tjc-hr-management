import { buildPnd1Form } from './payroll-pnd1-form.util';
import { buildPnd1FilingFile } from './payroll-pnd1-filing.util';

/**
 * กติกาที่คุ้มไว้ในไฟล์นี้
 * -----------------------------------------------------------------------------
 * 1. ผังไฟล์นำส่งต้องมี 11 ช่องคั่นด้วย | และเรียงตามไฟล์ตัวอย่างของกรมสรรพากร
 * 2. ตัดใบแนบแผ่นละ 21 บรรทัด และยอดท้ายแผ่นต้องเท่ากับผลรวมของแผ่นนั้น
 * 3. คนที่เลขบัตรไม่ครบ 13 หลักต้องถูกทำเครื่องหมายไว้ ไม่ใช่ปล่อยผ่านไปยื่น
 */

const COMPANY = {
  nameTh: 'บริษัท ทดสอบ จำกัด',
  taxId: '0-3255-63000-20-3',
  address:
    '311/1 หมู่ที่ 4 ตำบลคำน้ำแซบ อำเภอวารินชำราบ จังหวัดอุบลราชธานี 34190',
};

function person(overrides: Record<string, unknown> = {}) {
  return {
    employeeTitle: 'นางสาว',
    employeeFirstName: 'ณัฐพร',
    employeeLastName: 'มาลาวงศ์',
    employeeNationalId: '1349900469459',
    paymentDate: '2026-08-31',
    paidAmount: '26840.00',
    taxWithheldAmount: '0.00',
    ...overrides,
  };
}

function build(rows: Record<string, unknown>[], month = 8, year = 2026) {
  return buildPnd1Form({ summary: { month, year }, data: rows }, COMPANY);
}

describe('ไฟล์นำส่ง ภ.ง.ด.1', () => {
  it('เรียงช่องตามไฟล์ตัวอย่างของกรมสรรพากร', () => {
    const file = buildPnd1FilingFile(build([person()]));
    const line = file.content.split('\r\n')[0];

    expect(line).toBe(
      '401N|00001|1349900469459|นางสาว|ณัฐพร||มาลาวงศ์|31/08/2569|26840.00|0.00|1',
    );
    expect(line.split('|')).toHaveLength(11);
  });

  it('ลำดับที่เติมศูนย์หน้าให้ครบ 5 หลัก', () => {
    const file = buildPnd1FilingFile(build(Array.from({ length: 12 }, person)));
    const lines = file.content.trim().split('\r\n');

    expect(lines[0].split('|')[1]).toBe('00001');
    expect(lines[11].split('|')[1]).toBe('00012');
  });

  it('จบบรรทัดด้วย CRLF ตามไฟล์ตัวอย่าง', () => {
    const file = buildPnd1FilingFile(build([person(), person()]));

    expect(file.content.endsWith('\r\n')).toBe(true);
    expect(file.content.split('\r\n').filter(Boolean)).toHaveLength(2);
  });

  it('ตัดตัวคั่นที่ปนมาในชื่อ ไม่ให้จำนวนช่องเพี้ยน', () => {
    const file = buildPnd1FilingFile(
      build([person({ employeeLastName: 'มาลา|วงศ์' })]),
    );

    expect(file.content.split('\r\n')[0].split('|')).toHaveLength(11);
  });

  it('แจ้งคนที่เลขบัตรไม่ครบ 13 หลัก', () => {
    const file = buildPnd1FilingFile(
      build([person(), person({ employeeNationalId: '12345' })]),
    );

    expect(file.incompleteRows).toHaveLength(1);
    expect(file.incompleteRows[0].sequence).toBe(2);
    expect(file.incompleteRows[0].missing).toContain('เลขประจำตัวประชาชน');
  });
});

describe('การจัดหน้าใบแนบ ภ.ง.ด.1', () => {
  it('ตัดแผ่นละ 21 บรรทัด', () => {
    const form = build(Array.from({ length: 44 }, person));

    expect(form.attachments.map((sheet) => sheet.rows.length)).toEqual([
      21, 21, 2,
    ]);
    expect(form.attachments[2].sheetNo).toBe(3);
  });

  it('ยอดท้ายแผ่นเท่ากับผลรวมของแผ่นนั้น และรวมทุกแผ่นเท่ายอดรวมทั้งแบบ', () => {
    const form = build(
      Array.from({ length: 25 }, (_, index) =>
        person({
          paidAmount: String(1000 + index),
          taxWithheldAmount: '10.50',
        }),
      ),
    );

    const sheetSum = form.attachments.reduce(
      (total, sheet) => total + sheet.paidAmount,
      0,
    );

    expect(Math.round(sheetSum * 100) / 100).toBe(form.totals.paidAmount);
    expect(form.attachments[0].taxWithheld).toBe(21 * 10.5);
  });

  it('แปลงวันที่จ่ายเป็น พ.ศ. โดยไม่ผ่าน Date ที่จะโดน timezone เลื่อนวัน', () => {
    const form = build([person({ paymentDate: '2026-01-01' })], 1);

    expect(form.rows[0].paidOnText).toBe('01/01/2569');
  });

  it('ไม่มีวันที่จ่ายให้ใช้วันสิ้นเดือนของงวด', () => {
    const form = build([person({ paymentDate: null })], 2);

    expect(form.rows[0].paidOnText).toBe('28/02/2569');
  });

  it('แยกที่อยู่ลงช่องของแบบพิมพ์', () => {
    const form = build([person()]);

    expect(form.company.addressParts).toEqual({
      houseNo: '311/1',
      moo: '4',
      subDistrict: 'คำน้ำแซบ',
      district: 'วารินชำราบ',
      province: 'อุบลราชธานี',
    });
    expect(form.company.postalCode).toBe('34190');
    expect(form.company.taxId).toBe('0325563000203');
    expect(form.company.branchNo).toBe('00000');
  });

  it('แยกชื่อจากชื่อเต็มได้เมื่อไม่มีฟิลด์แยก', () => {
    const form = build([
      {
        employeeName: 'นางสาว ศุมลธิดา สิงห์ชู',
        employeeNationalId: '1349900469459',
        paymentDate: '2026-08-31',
        paidAmount: '100',
        taxWithheldAmount: '0',
      },
    ]);

    expect(form.rows[0].title).toBe('นางสาว');
    expect(form.rows[0].firstName).toBe('ศุมลธิดา');
    expect(form.rows[0].lastName).toBe('สิงห์ชู');
  });
});
