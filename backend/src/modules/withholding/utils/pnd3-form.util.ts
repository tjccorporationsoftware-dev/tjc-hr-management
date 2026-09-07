import { THAI_MONTH_NAMES } from '../../payroll/utils/payroll-pnd1-form.util';

/**
 * ตัวจัดรูปข้อมูลของแบบ ภ.ง.ด.3
 * -----------------------------------------------------------------------------
 * ภ.ง.ด.3 ยื่นรายเดือนเหมือน ภ.ง.ด.1 แต่เป็นภาษีของผู้รับเงินที่ไม่ใช่ลูกจ้าง
 * ตามมาตรา 40(5)-(8) จึงมีช่องที่ ภ.ง.ด.1 ไม่มี
 *
 *   ประเภทเงินได้   ข้อความอธิบายว่าจ่ายเป็นค่าอะไร (ค่าเช่า ค่าขนส่ง ฯลฯ)
 *   อัตราภาษี       ร้อยละที่หัก ต่างกันตามประเภทเงินได้
 *   ที่อยู่           ต้องมี ต่างจากใบแนบ ภ.ง.ด.1 ที่ไม่มีช่องนี้
 *   สาขาที่          ของผู้รับเงิน ไม่ใช่ของผู้จ่าย
 *
 * หนึ่งคนมีได้หลายบรรทัดในเดือนเดียว ถ้าจ่ายหลายครั้งหรือหลายประเภทเงินได้
 * — ต่างจาก ภ.ง.ด.1 ที่รวมเป็นบรรทัดเดียวต่อคน
 */

/** บรรทัดต่อใบแนบหนึ่งแผ่น — นับจากแบบพิมพ์ฉบับทางการ (แนวนอน) */
export const PND3_ROWS_PER_ATTACHMENT = 6;

export type Pnd3PaymentRow = {
  sequence: number;
  /** เลขประจำตัวผู้เสียภาษีของผู้รับเงิน 13 หลัก */
  identityNo: string;
  /** สาขาที่ของผู้รับเงิน 5 หลัก */
  branchNo: string;
  title: string;
  firstName: string;
  lastName: string;
  fullName: string;
  address: string;
  /** วันที่จ่ายในรูป dd/MM/yyyy พ.ศ. */
  paidOnText: string;
  incomeTypeLabel: string;
  /** อัตราภาษีร้อยละ แสดงแบบตัดศูนย์ท้ายทิ้ง (3 ไม่ใช่ 3.000) */
  taxRateText: string;
  amount: number;
  taxAmount: number;
  /** เงื่อนไข 1/2/3 ตามหมายเหตุท้ายใบแนบ */
  condition: string;
  missing: string[];
};

export type Pnd3Attachment = {
  sheetNo: number;
  rows: Pnd3PaymentRow[];
  amount: number;
  taxAmount: number;
};

export type Pnd3Form = {
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
  month: number;
  gregorianYear: number;
  buddhistYear: number;
  rows: Pnd3PaymentRow[];
  attachments: Pnd3Attachment[];
  totals: {
    /** จำนวน "ราย" คือจำนวนผู้รับเงินที่ไม่ซ้ำ ไม่ใช่จำนวนบรรทัด */
    payeeCount: number;
    rowCount: number;
    amount: number;
    taxAmount: number;
  };
  issuedOn: {
    day: number;
    monthName: string;
    buddhistYear: number;
  } | null;
  missingCompanyFields: string[];
  incompleteRowCount: number;
};

const CONDITION_CODE: Record<string, string> = {
  WITHHELD: '1',
  PAID_ALWAYS: '2',
  PAID_ONCE: '3',
};

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

/** dd/MM/yyyy พ.ศ. — ตัดสตริงตรง ๆ ไม่ผ่าน Date เลี่ยง timezone เลื่อนวัน */
function toThaiDateText(value: Date | string) {
  const text =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return '';

  const [, year, month, day] = match;
  return `${day}/${month}/${Number(year) + 543}`;
}

/** อัตราภาษี 3.000 ให้แสดงเป็น 3 ส่วน 0.750 ให้เป็น 0.75 */
function rateText(value: number) {
  return String(Number(value.toFixed(3)));
}

type PaymentInput = {
  paidOn: Date | string;
  incomeTypeLabel: string;
  taxRatePercent: unknown;
  amount: unknown;
  taxAmount: unknown;
  condition: string;
  payee: {
    taxId: string;
    branchNo: string;
    title: string | null;
    firstName: string | null;
    lastName: string | null;
    name: string;
    address: string | null;
  };
};

type CompanyInput = {
  nameTh?: string | null;
  nameEn?: string | null;
  code?: string | null;
  taxId?: string | null;
  address?: string | null;
};

function toNumber(value: unknown) {
  const amount = Number(asText(value) || value);
  return Number.isFinite(amount) ? amount : 0;
}

function buildIssuedOn(value?: string | null) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
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

export function buildPnd3Form(
  payments: PaymentInput[],
  company: CompanyInput,
  period: { year: number; month: number },
  issueDate?: string | null,
): Pnd3Form {
  const rows: Pnd3PaymentRow[] = payments.map((payment, index) => {
    const { payee } = payment;

    const identityNo = digitsOnly(payee.taxId, 13);
    const address = asText(payee.address).trim();
    const paidOnText = toThaiDateText(payment.paidOn);

    const missing: string[] = [];
    if (identityNo.length !== 13) missing.push('เลขประจำตัวผู้เสียภาษี');
    if (!address) missing.push('ที่อยู่');
    if (!payment.incomeTypeLabel.trim()) missing.push('ประเภทเงินได้');

    return {
      sequence: index + 1,
      identityNo,
      branchNo: digitsOnly(payee.branchNo, 5).padStart(5, '0'),
      title: asText(payee.title),
      firstName: asText(payee.firstName),
      lastName: asText(payee.lastName),
      fullName: payee.name,
      address,
      paidOnText,
      incomeTypeLabel: payment.incomeTypeLabel.trim(),
      taxRateText: rateText(toNumber(payment.taxRatePercent)),
      amount: round2(toNumber(payment.amount)),
      taxAmount: round2(toNumber(payment.taxAmount)),
      condition: CONDITION_CODE[payment.condition] ?? '1',
      missing,
    };
  });

  const attachments: Pnd3Attachment[] = [];
  for (let start = 0; start < rows.length; start += PND3_ROWS_PER_ATTACHMENT) {
    const slice = rows.slice(start, start + PND3_ROWS_PER_ATTACHMENT);

    attachments.push({
      sheetNo: attachments.length + 1,
      rows: slice,
      amount: round2(slice.reduce((sum, row) => sum + row.amount, 0)),
      taxAmount: round2(slice.reduce((sum, row) => sum + row.taxAmount, 0)),
    });
  }

  const address = asText(company.address).trim();
  const companyTaxId = digitsOnly(company.taxId, 13);

  const missingCompanyFields: string[] = [];
  if (companyTaxId.length !== 13)
    missingCompanyFields.push('เลขประจำตัวผู้เสียภาษี 13 หลัก');
  if (!address) missingCompanyFields.push('ที่อยู่สถานประกอบการ');

  /* ช่อง "จำนวนราย" บนหน้าปกนับหัวคน ไม่ใช่จำนวนบรรทัด คนหนึ่งจ่ายหลายครั้งได้ */
  const payeeCount = new Set(rows.map((row) => row.identityNo)).size;

  return {
    company: {
      name: company.nameTh || company.nameEn || company.code || '',
      taxId: companyTaxId,
      /* สาขาที่ของผู้จ่าย — ระบบยังไม่มีช่องเก็บ ใช้สำนักงานใหญ่ไปก่อน */
      branchNo: '00000',
      address,
      postalCode: extractPostalCode(address),
      addressParts: splitAddress(address),
    },
    month: period.month,
    gregorianYear: period.year,
    buddhistYear: period.year + 543,
    rows,
    attachments,
    totals: {
      payeeCount,
      rowCount: rows.length,
      amount: round2(rows.reduce((sum, row) => sum + row.amount, 0)),
      taxAmount: round2(rows.reduce((sum, row) => sum + row.taxAmount, 0)),
    },
    issuedOn: buildIssuedOn(issueDate),
    missingCompanyFields,
    incompleteRowCount: rows.filter((row) => row.missing.length > 0).length,
  };
}
