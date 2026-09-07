import {
  PND1_DEFAULT_CONDITION,
  RD_HEAD_OFFICE_BRANCH,
  THAI_MONTH_NAMES,
} from './payroll-pnd1-form.util';

/**
 * ตัวจัดรูปข้อมูลกลางของแบบ ภ.ง.ด.1ก
 * -----------------------------------------------------------------------------
 * แบบยื่นประจำปี ออกเป็นเอกสารสามใบที่ใช้ข้อมูลชุดเดียวกัน
 *
 *   ใบสรุป      หน้าปก 1 หน้า — ยอดรวมทั้งปีของทั้งบริษัท
 *   ใบแนบ       รายชื่อผู้มีเงินได้แผ่นละ 21 คน พร้อมที่อยู่
 *   50 ทวิ      หนังสือรับรองการหักภาษี หนึ่งหน้าต่อพนักงานหนึ่งคน
 *
 * ทั้งสามใบต้องได้ตัวเลขตรงกัน ยอดรวมของใบแนบทุกแผ่นต้องเท่ากับใบสรุป
 * และผลรวมของ 50 ทวิ ทุกใบก็ต้องเท่ากันด้วย จึงคิดที่เดียวแล้วแจกไปใช้
 *
 * อ้างอิงรูปแบบจาก docs/ข้อมูลรูปแบบไฟล์รายงาน/ภงด1ก
 */

/** บรรทัดต่อใบแนบหนึ่งแผ่น — นับจากไฟล์ตัวอย่าง (141 คน = 7 แผ่น) */
export const PND1A_ROWS_PER_ATTACHMENT = 21;

export type Pnd1aPersonRow = {
  sequence: number;
  /** เลขประจำตัวผู้เสียภาษีของผู้มีเงินได้ = เลขบัตรประชาชน 13 หลัก */
  identityNo: string;
  title: string;
  firstName: string;
  lastName: string;
  fullName: string;
  /** ที่อยู่ผู้มีเงินได้ — ใบแนบและ 50 ทวิ มีช่องนี้ ต่างจาก ภ.ง.ด.1 */
  address: string;
  paidAmount: number;
  taxWithheld: number;
  /** ประเภทเงินได้ ไฟล์ตัวอย่างพิมพ์เป็น "(1)" ในช่องเงื่อนไข */
  condition: string;
  missing: string[];
};

export type Pnd1aAttachment = {
  sheetNo: number;
  rows: Pnd1aPersonRow[];
  paidAmount: number;
  taxWithheld: number;
};

export type Pnd1aForm = {
  company: {
    name: string;
    taxId: string;
    branchNo: string;
    address: string;
    postalCode: string;
    addressParts: {
      houseNo: string;
      moo: string;
      subDistrict: string;
      district: string;
      province: string;
    };
  };
  /** ปีภาษี ค.ศ. และ พ.ศ. */
  gregorianYear: number;
  buddhistYear: number;
  rows: Pnd1aPersonRow[];
  attachments: Pnd1aAttachment[];
  totals: {
    count: number;
    paidAmount: number;
    taxWithheld: number;
  };
  /**
   * วันที่ออกเอกสาร — ผู้ใช้เลือกได้ตอนสั่งพิมพ์ (ดูกล่อง "ระบุวันออกเอกสาร")
   * null = ไม่ระบุ ให้เว้นช่องไว้เขียนด้วยมือ
   */
  issuedOn: {
    day: number;
    monthName: string;
    buddhistYear: number;
  } | null;
  missingCompanyFields: string[];
  incompleteRowCount: number;
};

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? String(value)
        : '';
  const amount = Number(text.replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function asText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function digitsOnly(value: unknown, length: number) {
  return asText(value).replace(/\D/g, '').slice(0, length);
}

function extractPostalCode(address: string) {
  const match = /(?:^|[^\d])(\d{5})(?!\d)/.exec(address);
  return match ? match[1] : '';
}

function splitAddress(address: string) {
  const pick = (pattern: RegExp) => {
    const match = pattern.exec(address);
    return match ? match[1].trim() : '';
  };

  return {
    houseNo: pick(/^\s*([\d/-]+)/),
    moo: pick(/(?:หมู่ที่|หมู่|ม\.)\s*([\dก-๙]+)/),
    subDistrict: pick(/(?:ตำบล|ต\.|แขวง)\s*([^\s]+)/),
    district: pick(/(?:อำเภอ|อ\.|เขต)\s*([^\s]+)/),
    province: pick(/(?:จังหวัด|จ\.)\s*([^\s\d]+)/),
  };
}

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

type Pnd1aReportRow = {
  employeeTitle?: string | null;
  employeeFirstName?: string | null;
  employeeLastName?: string | null;
  employeeName?: string | null;
  employeeNationalId?: string | null;
  employeeTaxId?: string | null;
  employeeAddress?: string | null;
  totalPaidAmount?: unknown;
  totalTaxWithheldAmount?: unknown;
};

type Pnd1aReportInput = {
  summary: { taxYear?: number | null };
  data: Pnd1aReportRow[];
};

type Pnd1aCompanyInput = {
  nameTh?: string | null;
  nameEn?: string | null;
  code?: string | null;
  taxId?: string | null;
  address?: string | null;
};

/**
 * วันที่ออกเอกสารที่ผู้ใช้เลือก
 * รับเป็น 'yyyy-MM-dd' (ค.ศ.) ตามที่ปฏิทินฝั่งหน้าจอส่งมา
 * ถ้าไม่ส่งมาแปลว่า "ไม่ระบุ" — เอกสารจะเว้นช่องวันที่ไว้ให้เขียนเอง
 */
export type Pnd1aIssueDateInput = string | null | undefined;

function buildIssuedOn(value: Pnd1aIssueDateInput) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;

  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;

  return {
    day: Number(day),
    monthName: THAI_MONTH_NAMES[monthIndex],
    buddhistYear: Number(year) + 543,
  };
}

export function buildPnd1aForm(
  report: Pnd1aReportInput,
  company: Pnd1aCompanyInput,
  issueDate?: Pnd1aIssueDateInput,
): Pnd1aForm {
  const gregorianYear = Number(report.summary.taxYear ?? 0);

  const rows: Pnd1aPersonRow[] = report.data.map((row, index) => {
    const parts =
      row.employeeFirstName || row.employeeLastName
        ? {
            title: row.employeeTitle ?? '',
            firstName: row.employeeFirstName ?? '',
            lastName: row.employeeLastName ?? '',
          }
        : splitDisplayName(asText(row.employeeName));

    const identityNo =
      digitsOnly(row.employeeNationalId, 13) ||
      digitsOnly(row.employeeTaxId, 13);

    /* ที่อยู่พนักงานเก็บเป็น "-" เมื่อไม่มี ต้องกันไม่ให้ขีดโผล่บนแบบฟอร์ม */
    const address = asText(row.employeeAddress).trim();

    const missing: string[] = [];
    if (identityNo.length !== 13) missing.push('เลขประจำตัวประชาชน');
    if (!parts.firstName) missing.push('ชื่อ');
    if (!parts.lastName) missing.push('นามสกุล');
    if (!address || address === '-') missing.push('ที่อยู่');

    return {
      sequence: index + 1,
      identityNo,
      title: parts.title,
      firstName: parts.firstName,
      lastName: parts.lastName,
      fullName: [parts.title, parts.firstName, parts.lastName]
        .filter(Boolean)
        .join(' '),
      address: address === '-' ? '' : address,
      paidAmount: round2(toNumber(row.totalPaidAmount)),
      taxWithheld: round2(toNumber(row.totalTaxWithheldAmount)),
      condition: `(${PND1_DEFAULT_CONDITION})`,
      missing,
    };
  });

  const attachments: Pnd1aAttachment[] = [];
  for (let start = 0; start < rows.length; start += PND1A_ROWS_PER_ATTACHMENT) {
    const slice = rows.slice(start, start + PND1A_ROWS_PER_ATTACHMENT);

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

  const address = asText(company.address).trim();
  const companyTaxId = digitsOnly(company.taxId, 13);

  const missingCompanyFields: string[] = [];
  if (companyTaxId.length !== 13)
    missingCompanyFields.push('เลขประจำตัวผู้เสียภาษี 13 หลัก');
  if (!address) missingCompanyFields.push('ที่อยู่สถานประกอบการ');

  return {
    company: {
      name: company.nameTh || company.nameEn || company.code || '',
      taxId: companyTaxId,
      branchNo: RD_HEAD_OFFICE_BRANCH,
      address,
      postalCode: extractPostalCode(address),
      addressParts: splitAddress(address),
    },
    gregorianYear,
    buddhistYear: gregorianYear > 0 ? gregorianYear + 543 : 0,
    rows,
    attachments,
    totals: {
      count: rows.length,
      paidAmount: round2(rows.reduce((sum, row) => sum + row.paidAmount, 0)),
      taxWithheld: round2(rows.reduce((sum, row) => sum + row.taxWithheld, 0)),
    },
    issuedOn: buildIssuedOn(issueDate),
    missingCompanyFields,
    incompleteRowCount: rows.filter((row) => row.missing.length > 0).length,
  };
}
