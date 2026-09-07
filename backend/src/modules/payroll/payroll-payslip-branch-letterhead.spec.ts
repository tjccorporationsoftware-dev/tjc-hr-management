import { buildPayslipHtml } from './payroll-payslip-pdf.util';

/**
 * หัวสลิปของสาขาที่ออกเอกสารในนามตัวเอง
 *
 * สาขาที่คนละที่ตั้ง คนละเบอร์ติดต่อกับสำนักงานใหญ่ ตั้งหัวสลิปของตัวเองได้
 * แต่ต้องถอยไปใช้ค่าของบริษัท "ทีละช่อง" ไม่ใช่ทั้งชุด — สาขาที่กรอกมาแค่โลโก้
 * ต้องยังได้ที่อยู่และเบอร์ของบริษัทมาเต็ม ไม่ใช่เหลือหัวจดหมายว่าง ๆ
 */
describe('สลิปเงินเดือน · หัวจดหมายของสาขา', () => {
  const company = {
    code: 'TJC',
    nameTh: 'บริษัท ทีเจซี คอร์ปอเรชั่น จำกัด',
    nameEn: 'TJC Corporation',
    logoUrl: null,
    taxId: '0105500000001',
    address: '99 ถนนสุขุมวิท กรุงเทพฯ',
    phone: '02-000-0000',
    email: 'hr@tjc.co.th',
  };

  const makePayslip = (branch: Record<string, unknown> | null) => ({
    id: 'item-1',
    baseSalary: 30000,
    totalEarnings: 30000,
    totalDeductions: 1500,
    totalGrossPay: 30000,
    totalNetPay: 28500,
    payslipDetailsVisible: true,
    employee: {
      employeeCode: '690034',
      firstName: 'ผดุงเดช',
      lastName: 'คำแดง',
      position: 'โปรแกรมเมอร์',
      department: { nameTh: 'โปรแกรมเมอร์' },
      branch,
    },
    run: {
      runNo: 'RUN-1',
      status: 'PAID',
      company,
      period: {
        code: '2026-08',
        name: 'สิงหาคม 2569',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        paymentDate: '2026-08-31',
      },
    },
    lines: [
      { code: 'BASE', name: 'เงินเดือน', type: 'EARNING', amount: 30000 },
      { code: 'SSO', name: 'ประกันสังคม', type: 'DEDUCTION', amount: 1500 },
    ],
  });

  it('สาขาไม่ได้เปิดใช้หัวสลิปของตัวเอง → ใช้ข้อมูลบริษัทเหมือนเดิม', () => {
    const html = buildPayslipHtml(
      makePayslip({
        code: 'ART',
        nameTh: 'บริษัท เอ.อาร์.ที. เอกซ์โพเนนเชียล จำกัด',
        address: '1 ถนนสาขา ชลบุรี',
        usePayslipHeader: false,
      }) as never,
      'FULL',
    );

    expect(html).toContain('บริษัท ทีเจซี คอร์ปอเรชั่น จำกัด');
    expect(html).toContain('99 ถนนสุขุมวิท กรุงเทพฯ');
    expect(html).not.toContain('1 ถนนสาขา ชลบุรี');
  });

  it('เปิดใช้หัวสลิปของสาขา → ใช้ชื่อ ที่อยู่ และเบอร์ของสาขาแทน', () => {
    const html = buildPayslipHtml(
      makePayslip({
        code: 'ART',
        nameTh: 'บริษัท เอ.อาร์.ที. เอกซ์โพเนนเชียล จำกัด',
        address: '1 ถนนสาขา ชลบุรี',
        phone: '038-111-111',
        usePayslipHeader: true,
      }) as never,
      'FULL',
    );

    expect(html).toContain('บริษัท เอ.อาร์.ที. เอกซ์โพเนนเชียล จำกัด');
    expect(html).toContain('1 ถนนสาขา ชลบุรี');
    expect(html).toContain('038-111-111');
    expect(html).not.toContain('99 ถนนสุขุมวิท กรุงเทพฯ');
  });

  it('ช่องที่สาขาเว้นว่าง ถอยไปใช้ของบริษัททีละช่อง ไม่ใช่หายทั้งชุด', () => {
    const html = buildPayslipHtml(
      makePayslip({
        code: 'ART',
        nameTh: 'บริษัท เอ.อาร์.ที. เอกซ์โพเนนเชียล จำกัด',
        // ตั้งแค่ชื่อ — ที่อยู่/เบอร์/อีเมล ยังไม่ได้กรอก
        usePayslipHeader: true,
      }) as never,
      'FULL',
    );

    expect(html).toContain('บริษัท เอ.อาร์.ที. เอกซ์โพเนนเชียล จำกัด');
    expect(html).toContain('99 ถนนสุขุมวิท กรุงเทพฯ');
    expect(html).toContain('02-000-0000');
  });

  it('เลขภาษีของสาขาพิมพ์คู่กับเลขที่สาขาเสมอ (สรรพากรดูสองตัวนี้ด้วยกัน)', () => {
    const html = buildPayslipHtml(
      makePayslip({
        code: 'ART',
        nameTh: 'สาขาชลบุรี',
        taxId: '1312312123123',
        taxBranchNo: '00002',
        usePayslipHeader: true,
      }) as never,
      'FULL',
    );

    expect(html).toContain('1312312123123 (สาขา 00002)');
  });

  it('หมายเหตุท้ายสลิปของสาขาต่อท้ายข้อความลับ ไม่ได้แทนที่', () => {
    const html = buildPayslipHtml(
      makePayslip({
        code: 'ART',
        nameTh: 'สาขาชลบุรี',
        usePayslipHeader: true,
        payslipNote: 'สอบถามฝ่ายบุคคลสาขา โทร. 038-111-111',
      }) as never,
      'FULL',
    );

    expect(html).toContain('เอกสารลับเฉพาะบุคคล');
    expect(html).toContain('สอบถามฝ่ายบุคคลสาขา โทร. 038-111-111');
  });

  it('ไม่มีข้อมูลสาขาเลย → ยังออกสลิปได้ด้วยหัวจดหมายของบริษัท', () => {
    const html = buildPayslipHtml(makePayslip(null) as never, 'FULL');

    expect(html).toContain('บริษัท ทีเจซี คอร์ปอเรชั่น จำกัด');
    expect(html).toContain('690034');
  });
});
