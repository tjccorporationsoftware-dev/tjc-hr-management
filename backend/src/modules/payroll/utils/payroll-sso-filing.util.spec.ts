import {
  SSO_RECORD_LAYOUT,
  SSO_TITLE_CODES,
  buildSsoFilingFile,
  type SsoFilingRow,
} from './payroll-sso-filing.util';

/**
 * แยกบรรทัดโดยไม่ใช้ trim เพราะช่อง filler ท้ายบรรทัดเป็นช่องว่างที่ต้องคงไว้
 * ถ้า trim ทิ้ง ความกว้างบรรทัดสุดท้ายจะสั้นกว่าจริง
 */
function splitLines(content: string) {
  return content.split('\r\n').filter((line) => line.length > 0);
}

/** ตัดช่องตามผังโดยนับตำแหน่งสะสม จะได้ไม่ต้องนับ offset ด้วยมือในทุกเทส */
function fieldOf(
  line: string,
  record: 'header' | 'detail',
  field: string,
): string {
  const layout = SSO_RECORD_LAYOUT[record] as Record<string, number>;
  let offset = 0;

  for (const [name, width] of Object.entries(layout)) {
    if (name === field) return line.slice(offset, offset + width);
    offset += width;
  }

  throw new Error(`ไม่มีช่อง "${field}" ในระเบียน "${record}"`);
}

const context = {
  companyName: 'บริษัท อัลฟ่า จำกัด',
  accountNo: '1234567890',
  branchNo: '000000',
  wageMonthDate: '2026-07-25',
  paymentDate: '2026-08-15',
  employeeRatePercent: 5,
  runNo: 'RUN-2569-12',
};

const row = (overrides: Partial<SsoFilingRow> = {}): SsoFilingRow => ({
  sequence: 1,
  title: 'นาย',
  firstName: 'สมชาย',
  lastName: 'ทองคำ',
  employeeName: 'นาย สมชาย ทองคำ',
  nationalId: '1234567890123',
  socialSecurityNo: '1234567890123',
  actualWage: 20000,
  contributionBase: 17500,
  employeeContributionFiled: 875,
  employerContributionFiled: 875,
  ...overrides,
});

describe('payroll-sso-filing.util', () => {
  it('ทุกบรรทัดกว้าง 135 ตัวอักษรตาม format 135', () => {
    const file = buildSsoFilingFile([row(), row({ sequence: 2 })], context);
    const lines = splitLines(file.content);

    expect(SSO_RECORD_LAYOUT.lineWidth).toBe(135);
    expect(lines).toHaveLength(3); // header + 2 detail
    for (const line of lines) {
      expect(line).toHaveLength(135);
    }
  });

  /* format 135 ไม่มีระเบียนท้ายไฟล์ ยอดรวมอยู่ในระเบียนหัวไฟล์ */
  it('มีแค่หัวไฟล์กับรายคน ไม่มีระเบียนท้ายไฟล์', () => {
    const file = buildSsoFilingFile([row(), row({ sequence: 2 })], context);
    const lines = splitLines(file.content);

    expect(lines[0].startsWith('1')).toBe(true);
    expect(lines[1].startsWith('2')).toBe(true);
    expect(lines[2].startsWith('2')).toBe(true);
    expect(lines.some((line) => line.startsWith('3'))).toBe(false);
  });

  it('หัวไฟล์เก็บเลขบัญชีนายจ้างและลำดับสาขาแบบเติมศูนย์ซ้าย', () => {
    const file = buildSsoFilingFile([row()], context);
    const header = splitLines(file.content)[0];

    expect(fieldOf(header, 'header', 'accountNo')).toBe('1234567890');
    expect(fieldOf(header, 'header', 'branchNo')).toBe('000000');
  });

  /* วันที่ชำระเป็น ววดดปป และงวดเป็น ดดปป โดยใช้ปี พ.ศ. สองหลักท้าย */
  it('วันที่ชำระเป็น ววดดปป และงวดเดือนเป็น ดดปป ปี พ.ศ.', () => {
    const file = buildSsoFilingFile([row()], context);
    const header = splitLines(file.content)[0];

    expect(fieldOf(header, 'header', 'paymentDate')).toBe('150869');
    expect(fieldOf(header, 'header', 'salaryPeriod')).toBe('0769');
  });

  it('อัตราเงินสมทบเก็บเป็น 4 หลัก ทศนิยม 2 ตำแหน่งโดยปริยาย', () => {
    const file = buildSsoFilingFile([row()], context);
    const header = splitLines(file.content)[0];

    expect(fieldOf(header, 'header', 'contributionRate')).toBe('0500');
  });

  it('หัวไฟล์สรุปจำนวนคนและยอดรวมทั้งสามช่อง', () => {
    const file = buildSsoFilingFile(
      [
        row(),
        row({
          sequence: 2,
          actualWage: 10000,
          employeeContributionFiled: 500,
          employerContributionFiled: 500,
        }),
      ],
      context,
    );
    const header = splitLines(file.content)[0];

    expect(fieldOf(header, 'header', 'insuredCount')).toBe('000002');
    // ค่าจ้างรวม 30,000.00 = 3,000,000 สตางค์
    expect(fieldOf(header, 'header', 'totalWage')).toBe('000000003000000');
    // เงินสมทบรวมสองฝั่ง 2,750.00
    expect(fieldOf(header, 'header', 'totalContribution')).toBe('00000000275000');
    expect(fieldOf(header, 'header', 'totalEmployeeContribution')).toBe(
      '000000137500',
    );
    expect(fieldOf(header, 'header', 'totalEmployerContribution')).toBe(
      '000000137500',
    );
  });

  /* ระเบียนรายคนแยกคำนำหน้า/ชื่อ/สกุลคนละช่อง ไม่ใช่ชื่อเต็มช่องเดียว */
  it('ระเบียนรายคนแยกคำนำหน้า ชื่อ และสกุลคนละช่อง', () => {
    const file = buildSsoFilingFile([row()], context);
    const detail = splitLines(file.content)[1];

    expect(fieldOf(detail, 'detail', 'titleCode')).toBe(SSO_TITLE_CODES['นาย']);
    expect(fieldOf(detail, 'detail', 'firstName').trim()).toBe('สมชาย');
    expect(fieldOf(detail, 'detail', 'lastName').trim()).toBe('ทองคำ');
  });

  it('ไม่มีชื่อแยกช่อง ให้ตัดคำนำหน้าและชื่อออกจากชื่อเต็มได้', () => {
    const file = buildSsoFilingFile(
      [
        row({
          title: null,
          firstName: null,
          lastName: null,
          employeeName: 'นางสาว มาลี ใจดี',
        }),
      ],
      context,
    );
    const detail = splitLines(file.content)[1];

    expect(fieldOf(detail, 'detail', 'titleCode')).toBe(
      SSO_TITLE_CODES['นางสาว'],
    );
    expect(fieldOf(detail, 'detail', 'firstName').trim()).toBe('มาลี');
    expect(fieldOf(detail, 'detail', 'lastName').trim()).toBe('ใจดี');
  });

  /*
   * คำนำหน้าที่ไม่มีรหัสรองรับจะได้ช่องว่าง ซึ่ง สปส. อาจปฏิเสธทั้งไฟล์
   * ต้องรายงานกลับไปให้เห็น ไม่ใช่ปล่อยเงียบ
   */
  it('คำนำหน้าที่ไม่มีรหัส ต้องรายงานกลับ ไม่ปล่อยเงียบ', () => {
    const file = buildSsoFilingFile(
      [row({ title: 'ว่าที่ร้อยตรี' })],
      context,
    );

    expect(file.unmappedTitles).toEqual(['ว่าที่ร้อยตรี']);
    expect(file.note).toContain('ว่าที่ร้อยตรี');
  });

  it('เงินสมทบเป็นสตางค์ ไม่มีจุดทศนิยม', () => {
    const file = buildSsoFilingFile([row()], context);
    const detail = splitLines(file.content)[1];

    // 875.00 บาท = 87,500 สตางค์
    expect(fieldOf(detail, 'detail', 'contribution')).toBe('000000087500');
  });

  /*
   * คำชี้แจงข้อ 1 ท้ายแบบ สปส.1-10 ให้กรอกค่าจ้าง "ที่จ่ายจริง"
   * เพดานมีผลเฉพาะตอนคำนวณเงินสมทบ ไฟล์จึงต้องเป็นค่าจ้างจริง ไม่ใช่ 17,500
   */
  it('ค่าจ้างในไฟล์เป็นค่าจ้างที่จ่ายจริง ไม่ใช่ฐานหลังชนเพดาน', () => {
    const file = buildSsoFilingFile(
      [row({ actualWage: 20000, contributionBase: 17500 })],
      context,
    );
    const detail = splitLines(file.content)[1];

    expect(fieldOf(detail, 'detail', 'wage')).toBe('00000002000000');
  });

  /*
   * คำชี้แจงข้อ 6: ผู้ประกันตนที่ไม่มีค่าจ้างต้องอยู่ในแบบด้วย
   * โดยช่องค่าจ้างและเงินสมทบเป็น 0 — ห้ามคัดออกจากไฟล์
   */
  it('คนที่ไม่มีค่าจ้างยังต้องอยู่ในไฟล์ โดยค่าจ้างและเงินสมทบเป็น 0', () => {
    const file = buildSsoFilingFile(
      [
        row(),
        row({
          sequence: 2,
          actualWage: 0,
          contributionBase: 0,
          employeeContributionFiled: 0,
          employerContributionFiled: 0,
        }),
      ],
      context,
    );
    const detail = splitLines(file.content)[2];

    expect(file.filedRows).toBe(2);
    expect(fieldOf(detail, 'detail', 'wage')).toBe('00000000000000');
    expect(fieldOf(detail, 'detail', 'contribution')).toBe('000000000000');
  });

  it('ไม่มีทั้งเลขบัตรและเลขผู้ประกันตน ต้องถูกข้าม', () => {
    const file = buildSsoFilingFile(
      [row(), row({ sequence: 2, nationalId: null, socialSecurityNo: null })],
      context,
    );

    expect(splitLines(file.content)).toHaveLength(2); // header + 1 detail
    expect(file.note).toContain('ข้าม 1 คน');
  });

  it('ไม่มีเลขผู้ประกันตนแต่มีเลขบัตร ยังยื่นได้', () => {
    const file = buildSsoFilingFile([row({ socialSecurityNo: null })], context);

    expect(splitLines(file.content)).toHaveLength(2);
  });

  /*
   * เดิมคืนไฟล์พร้อม missingCompanyFields ให้ผู้เรียกไปตรวจเอง ซึ่งไม่มีใครตรวจ
   * ผลคือยื่นไฟล์ที่หัวไฟล์ไม่มีเลขบัญชีนายจ้างเข้า สปส. ได้จริง
   * ตอนนี้ปฏิเสธตั้งแต่ต้นทางแทน
   */
  it('ไม่ได้ตั้งเลขที่บัญชีนายจ้าง ต้องสร้างไฟล์ไม่ได้', () => {
    expect(() =>
      buildSsoFilingFile([row()], { ...context, accountNo: null }),
    ).toThrow('เลขที่บัญชีนายจ้าง');
  });

  it('ทุกคนขาดเลขผู้ประกันตนและเลขบัตร ต้องสร้างไฟล์ไม่ได้', () => {
    expect(() =>
      buildSsoFilingFile(
        [row({ socialSecurityNo: null, nationalId: null })],
        context,
      ),
    ).toThrow('ไม่มีผู้ประกันตนที่ข้อมูลครบพอจะยื่นได้');
  });

  it('ขาดบางคน ยังสร้างไฟล์ได้ แต่ต้องคืนรายชื่อคนที่ถูกข้าม', () => {
    const file = buildSsoFilingFile(
      [row(), row({ socialSecurityNo: null, nationalId: null })],
      context,
    );

    expect(file.totalRows).toBe(2);
    expect(file.filedRows).toBe(1);
    expect(file.skipped).toHaveLength(1);
    expect(file.skipped[0].missing).toContain('เลขผู้ประกันตน');
  });

  it('ติดธงว่ายังต้องทดสอบอัปโหลดก่อนใช้จริง พร้อมรายการข้อสมมติ', () => {
    const file = buildSsoFilingFile([row()], context);

    expect(file.requiresSpecReview).toBe(true);
    expect(file.recordWidth).toBe(135);
    expect(file.assumptions.length).toBeGreaterThan(0);
    expect(file.note).toContain('format 135');
    expect(file.fileName).toBe('sso-1-10-RUN-2569-12.txt');
  });
});
