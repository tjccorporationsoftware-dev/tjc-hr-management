import { buildPayslipFileName } from './payroll-payslip-pdf.util';

/**
 * ชื่อไฟล์สลิป
 * ==========
 * เดิมสร้างอยู่ในตัวออก PDF ตอนนี้แยกออกมาเพราะการออกทั้งรอบเป็น ZIP
 * ต้องใช้ชื่อเดียวกัน — ไฟล์ในซิปกับไฟล์ที่โหลดทีละใบต้องตั้งชื่อเหมือนกัน
 * ไม่งั้น HR ที่เอาสองทางมาปนกันจะได้ไฟล์ซ้ำที่ดูเหมือนคนละใบ
 *
 * ที่ต้องล้างอักขระเพราะรหัสงวดกับรหัสพนักงานมาจากที่ผู้ใช้กรอกเอง
 * ตัวที่ระบบไฟล์ห้ามใช้ (เช่น / \ : ?) หลุดเข้าไปแล้วซิปจะเสียทั้งไฟล์
 */

const payslip = (employeeCode: string, periodCode: string) =>
  ({
    employee: { employeeCode },
    run: { period: { code: periodCode } },
  }) as never;

describe('buildPayslipFileName', () => {
  it('ตั้งชื่อจากรหัสพนักงานและรหัสงวด', () => {
    expect(buildPayslipFileName(payslip('670001', 'PAY-2569-07'), 'FULL')).toBe(
      'salary-slip-670001-PAY-2569-07.pdf',
    );
  });

  it('ครึ่งหน้า A5 ต่อท้ายด้วย -a5 ให้แยกออกจากเต็มหน้า', () => {
    expect(buildPayslipFileName(payslip('670001', 'PAY-2569-07'), 'HALF')).toBe(
      'salary-slip-670001-PAY-2569-07-a5.pdf',
    );
  });

  it('ล้างอักขระที่ระบบไฟล์ห้ามใช้ออก', () => {
    const name = buildPayslipFileName(payslip('67/001', 'งวด 07:2569'), 'FULL');

    expect(name).not.toMatch(/[/\\:?*"<>|]/);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('ไม่ทิ้งขีดคั่นติดกันหลายตัวจากการล้างอักขระ', () => {
    const name = buildPayslipFileName(payslip('67  001', 'PAY///2569'), 'FULL');

    expect(name).not.toContain('--');
  });

  it('ชื่อไฟล์ของคนละคนต้องไม่ชนกัน', () => {
    const first = buildPayslipFileName(
      payslip('670001', 'PAY-2569-07'),
      'FULL',
    );
    const second = buildPayslipFileName(
      payslip('670002', 'PAY-2569-07'),
      'FULL',
    );

    expect(first).not.toBe(second);
  });
});
