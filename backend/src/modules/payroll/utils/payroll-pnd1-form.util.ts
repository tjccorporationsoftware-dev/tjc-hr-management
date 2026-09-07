/**
 * ตัวจัดรูปข้อมูลกลางของแบบ ภ.ง.ด.1
 * -----------------------------------------------------------------------------
 * แบบ ภ.ง.ด.1 ออกได้สามรูปแบบ และทั้งสามต้องได้ตัวเลขชุดเดียวกันเป๊ะ ๆ
 *
 *   PDF    แบบฟอร์มราชการ  หน้าปก 1 + ใบแนบ N แผ่น
 *   TXT    ไฟล์นำส่ง e-Filing คั่นด้วย | เข้ารหัส UTF-8
 *   XLSX   ตารางไว้ตรวจและแก้ต่อ
 *
 * ไฟล์นี้แปลงผลของ getPnd1Report ให้เป็นโครงที่ทั้งสามใช้ร่วมกัน ถ้าปล่อยให้แต่ละ
 * ไฟล์ไปตัดชื่อ/ปัดเศษ/ตัดหน้าเอง สามใบจะค่อย ๆ เพี้ยนออกจากกันโดยไม่มีใครรู้
 *
 * อ้างอิงรูปแบบจากไฟล์ตัวอย่างของลูกค้าใน
 * docs/ข้อมูลรูปแบบไฟล์รายงาน/ภงด1
 */

/** จำนวนบรรทัดต่อใบแนบหนึ่งแผ่น — นับจากไฟล์ตัวอย่าง (แผ่นแรกลำดับ 1-21 แผ่นสองเริ่ม 22) */
export const ROWS_PER_ATTACHMENT = 21;

/**
 * รหัสแบบในไฟล์นำส่ง — อ่านได้จากช่องแรกของทุกบรรทัดในไฟล์ตัวอย่าง
 *
 * 401 = เงินได้ตามมาตรา 40(1) · N = ยื่นปกติ (หน้าปกของตัวอย่างติ๊ก "ยื่นปกติ")
 * ยังไม่ได้ยืนยันกับเอกสารสเปกของกรมสรรพากร ถ้าลูกค้ายื่นเพิ่มเติมต้องเช็คตัวอักษรท้าย
 */
export const PND1_FILING_FORM_CODE = '401N';

/**
 * เงื่อนไขการหักภาษี ตามหมายเหตุท้ายใบแนบ
 *   1 = หัก ณ ที่จ่าย   2 = ออกให้ตลอดไป   3 = ออกให้ครั้งเดียว
 * ระบบยังไม่มีที่เก็บว่านายจ้างออกภาษีแทนหรือไม่ จึงลง 1 เหมือนไฟล์ตัวอย่างทุกบรรทัด
 */
export const PND1_DEFAULT_CONDITION = '1';

/** เลขสาขาของกรมสรรพากรสำหรับสำนักงานใหญ่ */
export const RD_HEAD_OFFICE_BRANCH = '00000';

export type Pnd1PersonRow = {
  sequence: number;
  /** เลขประจำตัวผู้เสียภาษีของผู้มีเงินได้ = เลขบัตรประชาชน 13 หลัก */
  identityNo: string;
  title: string;
  firstName: string;
  lastName: string;
  /** วันที่จ่ายในรูป dd/MM/yyyy พ.ศ. */
  paidOnText: string;
  paidAmount: number;
  taxWithheld: number;
  condition: string;
  /** ข้อมูลที่ยังขาดของคนนี้ ใช้เตือนก่อนยื่น */
  missing: string[];
};

export type Pnd1Attachment = {
  /** แผ่นที่ (เริ่มที่ 1) */
  sheetNo: number;
  rows: Pnd1PersonRow[];
  /** ยอดรวมเฉพาะแผ่นนี้ ตามช่องท้ายใบแนบ */
  paidAmount: number;
  taxWithheld: number;
};

export type Pnd1Form = {
  company: {
    name: string;
    /** เลขประจำตัวผู้เสียภาษี 13 หลัก ตัดอักขระอื่นออกแล้ว */
    taxId: string;
    /** สาขาที่ 5 หลัก — สำนักงานใหญ่คือ 00000 */
    branchNo: string;
    address: string;
    postalCode: string;
    /** ที่อยู่แยกช่องให้ตรงกับแบบพิมพ์ ซึ่งมีช่องเลขที่ หมู่ที่ ตำบล อำเภอ จังหวัด แยกกัน */
    addressParts: {
      houseNo: string;
      moo: string;
      subDistrict: string;
      district: string;
      province: string;
    };
  };
  /** เดือนที่จ่ายเงินได้ 1-12 */
  month: number;
  /** ปีที่จ่าย ค.ศ. */
  gregorianYear: number;
  buddhistYear: number;
  rows: Pnd1PersonRow[];
  attachments: Pnd1Attachment[];
  totals: {
    count: number;
    paidAmount: number;
    taxWithheld: number;
  };
  /** ข้อมูลบริษัทที่ยังขาด ต้องเติมก่อนยื่นจริง */
  missingCompanyFields: string[];
  /** จำนวนคนที่ข้อมูลไม่ครบ แยกตามเรื่อง */
  incompleteRowCount: number;
};

export const THAI_MONTH_NAMES = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

/**
 * แปลงค่าที่รับมาแบบไม่รู้ชนิดให้เป็นข้อความอย่างปลอดภัย
 * ค่าที่ไม่ใช่ชนิดพื้นฐาน (เช่น Decimal ของ Prisma หรือออบเจกต์) จะได้
 * "[object Object]" ถ้าแปลงตรง ๆ จึงตัดทิ้งเป็นค่าว่างแทน ดีกว่าเอาขยะลงไฟล์นำส่ง
 */
function asText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function toNumber(value: unknown) {
  const amount = Number(asText(value).replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function digitsOnly(value: unknown, length?: number) {
  const digits = asText(value).replace(/\D/g, '');
  return length === undefined ? digits : digits.slice(0, length);
}

/**
 * แปลงวันที่จ่ายเป็น dd/MM/yyyy พ.ศ.
 *
 * ค่าที่ได้จากรายงานเป็น 'yyyy-MM-dd' อยู่แล้ว จึงตัดสตริงตรง ๆ ไม่ผ่าน Date
 * เพราะแปลงเป็น Date แล้วเจอ timezone จะเลื่อนไปวันก่อนหน้าได้ในเครื่องที่ตั้ง UTC+7
 */
function toThaiDateText(value: unknown) {
  const text = asText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return '';

  const [, year, month, day] = match;
  return `${day}/${month}/${Number(year) + 543}`;
}

/**
 * วันสุดท้ายของเดือนที่จ่าย ใช้เมื่องวดไม่มีวันที่จ่ายบันทึกไว้
 * ไฟล์ตัวอย่างลงวันสิ้นเดือนทุกบรรทัด (31/08/2569) จึงเป็น fallback ที่ตรงกับของเดิม
 */
function endOfMonthText(gregorianYear: number, month: number) {
  const day = new Date(Date.UTC(gregorianYear, month, 0)).getUTCDate();
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${
    gregorianYear + 543
  }`;
}

/** ดึงรหัสไปรษณีย์จากที่อยู่ — ระบบเก็บที่อยู่เป็นข้อความก้อนเดียว ไม่ได้แยกช่อง */
function extractPostalCode(address: string) {
  const match = /(?:^|[^\d])(\d{5})(?!\d)/.exec(address);
  return match ? match[1] : '';
}

/**
 * แยกที่อยู่ก้อนเดียวออกเป็นช่องย่อยตามที่แบบพิมพ์ต้องการ
 *
 * ระบบเก็บที่อยู่บริษัทเป็นข้อความบรรทัดเดียว แต่แบบ ภ.ง.ด.1 มีช่องแยก
 * เลขที่ / หมู่ที่ / ตำบล-แขวง / อำเภอ-เขต / จังหวัด ถ้าพิมพ์ทั้งก้อนลงไปจะทับป้าย
 * ของแบบพิมพ์จนอ่านไม่ออก จึงตัดด้วยคำนำหน้าที่ที่อยู่ไทยใช้เป็นมาตรฐาน
 *
 * ตัดไม่ได้ก็คืนค่าว่าง แล้วผู้ใช้เขียนด้วยมือบนแบบที่พิมพ์ออกมา ดีกว่าพิมพ์ทับ
 */
function splitAddress(address: string) {
  const pick = (pattern: RegExp) => {
    const match = pattern.exec(address);
    return match ? match[1].trim() : '';
  };

  return {
    /* เลขที่บ้านคือกลุ่มแรกสุดของสตริง ก่อนจะถึงคำว่า หมู่/ตำบล/ถนน */
    houseNo: pick(/^\s*([\d/-]+)/),
    moo: pick(/(?:หมู่ที่|หมู่|ม\.)\s*([\dก-๙]+)/),
    subDistrict: pick(/(?:ตำบล|ต\.|แขวง)\s*([^\s]+)/),
    district: pick(/(?:อำเภอ|อ\.|เขต)\s*([^\s]+)/),
    province: pick(/(?:จังหวัด|จ\.)\s*([^\s\d]+)/),
  };
}

type Pnd1ReportRow = {
  employeeTitle?: string | null;
  employeeFirstName?: string | null;
  employeeLastName?: string | null;
  employeeName?: string | null;
  employeeNationalId?: string | null;
  employeeTaxId?: string | null;
  paymentDate?: string | null;
  paidAmount?: unknown;
  taxWithheldAmount?: unknown;
};

type Pnd1ReportInput = {
  summary: {
    month?: number | null;
    year?: number | null;
  };
  data: Pnd1ReportRow[];
};

type Pnd1CompanyInput = {
  nameTh?: string | null;
  nameEn?: string | null;
  code?: string | null;
  taxId?: string | null;
  address?: string | null;
};

/**
 * แยกชื่อกับนามสกุลเมื่อไม่มีฟิลด์แยก
 * ใช้เฉพาะข้อมูลเก่าที่ยังไม่ได้แยกช่อง — คำแรกที่ตรงคำนำหน้าจะถูกตัดออกก่อน
 */
const KNOWN_TITLES = ['นางสาว', 'นาง', 'นาย', 'ว่าที่ร้อยตรี', 'ดร.'];

function splitDisplayName(displayName: string) {
  let rest = displayName.trim();
  let title = '';

  for (const candidate of KNOWN_TITLES) {
    if (rest.startsWith(candidate)) {
      title = candidate;
      rest = rest.slice(candidate.length).trim();
      break;
    }
  }

  const parts = rest.split(/\s+/).filter(Boolean);
  return {
    title,
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

export function buildPnd1Form(
  report: Pnd1ReportInput,
  company: Pnd1CompanyInput,
): Pnd1Form {
  const month = Number(report.summary.month ?? 0);
  const gregorianYear = Number(report.summary.year ?? 0);
  const fallbackDate =
    month >= 1 && month <= 12 && gregorianYear > 0
      ? endOfMonthText(gregorianYear, month)
      : '';

  const rows: Pnd1PersonRow[] = report.data.map((row, index) => {
    const parts =
      row.employeeFirstName || row.employeeLastName
        ? {
            title: row.employeeTitle ?? '',
            firstName: row.employeeFirstName ?? '',
            lastName: row.employeeLastName ?? '',
          }
        : splitDisplayName(String(row.employeeName ?? ''));

    /*
     * ผู้มีเงินได้เป็นบุคคลธรรมดา เลขประจำตัวผู้เสียภาษีคือเลขบัตรประชาชน
     * ถ้าไม่มีเลขบัตรค่อยใช้เลขผู้เสียภาษีที่กรอกไว้ในโปรไฟล์ภาษี
     */
    const identityNo =
      digitsOnly(row.employeeNationalId, 13) ||
      digitsOnly(row.employeeTaxId, 13);

    const paidOnText = toThaiDateText(row.paymentDate) || fallbackDate;

    const missing: string[] = [];
    if (identityNo.length !== 13) missing.push('เลขประจำตัวประชาชน');
    if (!parts.firstName) missing.push('ชื่อ');
    if (!parts.lastName) missing.push('นามสกุล');
    if (!paidOnText) missing.push('วันที่จ่าย');

    return {
      sequence: index + 1,
      identityNo,
      title: parts.title,
      firstName: parts.firstName,
      lastName: parts.lastName,
      paidOnText,
      paidAmount: round2(toNumber(row.paidAmount)),
      taxWithheld: round2(toNumber(row.taxWithheldAmount)),
      condition: PND1_DEFAULT_CONDITION,
      missing,
    };
  });

  /* ตัดเป็นใบแนบทีละ 21 บรรทัด พร้อมยอดรวมท้ายแผ่นตามที่แบบฟอร์มต้องมี */
  const attachments: Pnd1Attachment[] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_ATTACHMENT) {
    const slice = rows.slice(start, start + ROWS_PER_ATTACHMENT);

    attachments.push({
      sheetNo: attachments.length + 1,
      rows: slice,
      paidAmount: round2(
        slice.reduce((total, row) => total + row.paidAmount, 0),
      ),
      taxWithheld: round2(
        slice.reduce((total, row) => total + row.taxWithheld, 0),
      ),
    });
  }

  const address = String(company.address ?? '').trim();
  const companyTaxId = digitsOnly(company.taxId, 13);

  const missingCompanyFields: string[] = [];
  if (companyTaxId.length !== 13)
    missingCompanyFields.push('เลขประจำตัวผู้เสียภาษี 13 หลัก');
  if (!address) missingCompanyFields.push('ที่อยู่สถานประกอบการ');

  return {
    company: {
      name: company.nameTh || company.nameEn || company.code || '',
      taxId: companyTaxId,
      /*
       * "สาขาที่" ของกรมสรรพากรเป็นคนละเลขกับลำดับที่สาขาของประกันสังคม
       * ระบบยังไม่มีช่องเก็บเลขสาขาของสรรพากร จึงลง 00000 = สำนักงานใหญ่
       * ตรงกับไฟล์ตัวอย่าง ถ้าลูกค้ายื่นในนามสาขาต้องเพิ่มช่องนี้ก่อน
       */
      branchNo: RD_HEAD_OFFICE_BRANCH,
      address,
      postalCode: extractPostalCode(address),
      addressParts: splitAddress(address),
    },
    month,
    gregorianYear,
    buddhistYear: gregorianYear > 0 ? gregorianYear + 543 : 0,
    rows,
    attachments,
    totals: {
      count: rows.length,
      paidAmount: round2(rows.reduce((sum, row) => sum + row.paidAmount, 0)),
      taxWithheld: round2(rows.reduce((sum, row) => sum + row.taxWithheld, 0)),
    },
    missingCompanyFields,
    incompleteRowCount: rows.filter((row) => row.missing.length > 0).length,
  };
}

/** ยอดเงินแบบมีตัวคั่นหลักพัน ใช้ในเอกสารที่คนอ่าน */
export function pnd1Money(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
