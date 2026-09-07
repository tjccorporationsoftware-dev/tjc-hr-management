import puppeteer, { type Browser } from 'puppeteer';

import {
  escapeHtml,
  formatBahtText,
  formatDate,
  formatMoney,
  renderCompanyLogo,
  toAmount as numberValue,
  type DocumentCompany,
} from './payroll-document.util';

/**
 * สลิปเงินเดือน (PDF)
 * -------------------
 * วางเป็น "เอกสาร" ไม่ใช่หน้าจอสรุป — มีกรอบเต็มใบ หัวจดหมายของบริษัท
 * ตารางรายได้/รายการหักวางคู่กันในตารางเดียวแบบสลิปทางการ ปิดท้ายด้วย
 * ยอดสุทธิพร้อมจำนวนเงินเป็นตัวอักษร และช่องลงนามผู้จ่าย/ผู้รับเงิน
 *
 * ความสูงของตารางถูกตรึงไว้อย่างน้อย MIN_LINE_ROWS แถว เพื่อให้สลิปของทุกคน
 * ในงวดเดียวกันสูงเท่ากัน เวลาพิมพ์ออกมาเป็นปึกแล้วดูเป็นชุดเดียวกัน
 */

type PayslipLine = {
  code: string;
  name: string;
  type: string;
  sourceType?: string | null;
  amount: unknown;
};

type PayslipLike = {
  id: string;
  baseSalary: unknown;
  totalEarnings: unknown;
  totalDeductions: unknown;
  totalGrossPay: unknown;
  totalNetPay: unknown;
  employee: {
    employeeCode: string;
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    position?: string | null;
    department?: {
      nameTh?: string | null;
    } | null;
    branch?: {
      code?: string | null;
      nameTh?: string | null;
      nameEn?: string | null;
      /* ข้อมูลหัวสลิปเฉพาะสาขา — ดู resolvePayslipLetterhead */
      usePayslipHeader?: boolean | null;
      logoUrl?: string | null;
      taxId?: string | null;
      taxBranchNo?: string | null;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
      payslipNote?: string | null;
    } | null;
  };
  run: {
    runNo: string;
    name?: string | null;
    status: string;
    company: {
      code: string;
      nameTh: string;
      nameEn?: string | null;
      logoUrl?: string | null;
      taxId?: string | null;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
    };
    period: {
      code: string;
      name: string;
      startDate: Date | string;
      endDate: Date | string;
      paymentDate: Date | string;
    };
  };
  lines: PayslipLine[];
  payslipDetailsVisible?: boolean;
};

/**
 * รูปแบบกระดาษ
 * - FULL: A4 เต็มใบ ใบละคน เหมาะกับแนบซอง/เก็บเข้าแฟ้ม
 * - HALF: A5 แนวนอน (ครึ่ง A4) พิมพ์ลง A4 ได้ 2 ใบต่อแผ่นแล้วตัดแบ่ง ประหยัดกระดาษ
 */
export type PayslipPaperLayout = 'FULL' | 'HALF';

export const PAYSLIP_PAPER_LAYOUTS: PayslipPaperLayout[] = ['FULL', 'HALF'];

export function toPayslipPaperLayout(value: unknown): PayslipPaperLayout {
  return value === 'HALF' ? 'HALF' : 'FULL';
}

export type PayslipPdfResult = {
  buffer: Buffer;
  fileName: string;
};

/** จำนวนแถวขั้นต่ำของตารางรายการ เพื่อให้สลิปทุกใบสูงเท่ากัน */
const MIN_LINE_ROWS: Record<PayslipPaperLayout, number> = {
  FULL: 8,
  HALF: 5,
};

/** ขนาดกระดาษของแต่ละรูปแบบ ใช้ทั้งใน @page และตอนสั่ง puppeteer */
const PAPER_CSS: Record<PayslipPaperLayout, string> = {
  FULL: 'size: A4 portrait; margin: 12mm 12mm 10mm;',
  HALF: 'size: A5 landscape; margin: 7mm 8mm;',
};

const RUN_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'ฉบับร่าง',
  CALCULATING: 'กำลังคำนวณ',
  CALCULATED: 'คำนวณแล้ว',
  REVIEWED: 'ตรวจสอบแล้ว',
  APPROVED: 'อนุมัติแล้ว',
  PAID: 'จ่ายเงินแล้ว',
  CANCELLED: 'ยกเลิก',
  FAILED: 'ไม่สำเร็จ',
};

/**
 * หัวจดหมายของสลิป
 * ----------------
 * ปกติใช้ข้อมูลบริษัท แต่สาขาที่ตั้งค่า "ใช้ข้อมูลสาขาเป็นหัวสลิป" ไว้จะแทนที่
 * ทีละช่อง — ช่องไหนสาขาไม่ได้กรอกก็ถอยไปใช้ของบริษัทเหมือนเดิม ไม่ใช่ปล่อยว่าง
 * (สาขาที่กรอกแค่โลโก้จึงยังได้ที่อยู่/เบอร์ของบริษัทมาเต็ม)
 */
function resolvePayslipLetterhead(payslip: PayslipLike): DocumentCompany {
  const company = payslip.run.company;
  const branch = payslip.employee.branch;

  if (!branch?.usePayslipHeader) return company;

  const pick = (branchValue?: string | null, companyValue?: string | null) =>
    branchValue?.trim() ? branchValue : companyValue;

  return {
    code: branch.code || company.code,
    nameTh: pick(branch.nameTh, company.nameTh),
    nameEn: pick(branch.nameEn, company.nameEn),
    logoUrl: pick(branch.logoUrl, company.logoUrl),
    taxId: pick(
      // เลขภาษีของสาขาพิมพ์คู่กับเลขที่สาขาเสมอ กรมสรรพากรดูสองตัวนี้ด้วยกัน
      branch.taxId?.trim() && branch.taxBranchNo?.trim()
        ? `${branch.taxId} (สาขา ${branch.taxBranchNo})`
        : branch.taxId,
      company.taxId,
    ),
    address: pick(branch.address, company.address),
    phone: pick(branch.phone, company.phone),
    email: pick(branch.email, company.email),
  };
}

function getEmployeeName(payslip: PayslipLike) {
  return (
    payslip.employee.displayName ||
    [
      payslip.employee.title,
      payslip.employee.firstName,
      payslip.employee.lastName,
    ]
      .filter(Boolean)
      .join(' ') ||
    payslip.employee.employeeCode
  );
}

function shouldHideLine(line: PayslipLine) {
  return line.type === 'EMPLOYER_CONTRIBUTION' || line.type === 'INFO';
}

function sortLines(lines: PayslipLine[]) {
  return [...lines].sort((a, b) => {
    const amountDiff =
      Math.abs(numberValue(b.amount)) - Math.abs(numberValue(a.amount));
    if (amountDiff !== 0) return amountDiff;
    return a.name.localeCompare(b.name, 'th');
  });
}

function renderFieldCell(label: string, value: unknown, span = 1) {
  return `
    <td class="field" ${span > 1 ? `colspan="${span}"` : ''}>
      <div class="field-label">${escapeHtml(label)}</div>
      <div class="field-value">${escapeHtml(value || '-')}</div>
    </td>
  `;
}

function renderItemCell(line: PayslipLine | undefined) {
  if (!line) return '<td class="item empty-cell"></td>';

  const code = line.code?.trim();

  return `
    <td class="item">
      <span class="item-name">${escapeHtml(line.name)}</span>
      ${code ? `<span class="item-code">${escapeHtml(code)}</span>` : ''}
    </td>
  `;
}

function renderAmountCell(line: PayslipLine | undefined) {
  if (!line) return '<td class="amount empty-cell"></td>';

  return `<td class="amount">${formatMoney(line.amount)}</td>`;
}

/**
 * รายได้และรายการหักวางคู่กันบรรทัดต่อบรรทัด — ฝั่งที่รายการน้อยกว่าจะเว้นว่าง
 * ไม่ใช่ดันแถวขึ้นมา เพื่อให้อ่านเทียบกันได้และกรอบตารางไม่ขาดตอน
 */
function renderPairedRows(
  earnings: PayslipLine[],
  deductions: PayslipLine[],
  minRows: number,
) {
  const sortedEarnings = sortLines(earnings);
  const sortedDeductions = sortLines(deductions);
  const rowCount = Math.max(
    sortedEarnings.length,
    sortedDeductions.length,
    minRows,
  );

  return Array.from({ length: rowCount }, (_, index) => {
    const earning = sortedEarnings[index];
    const deduction = sortedDeductions[index];

    return `
      <tr>
        ${renderItemCell(earning)}
        ${renderAmountCell(earning)}
        ${renderItemCell(deduction)}
        ${renderAmountCell(deduction)}
      </tr>
    `;
  })
    .concat(
      /* แถวเปล่าที่ยืดจนเต็มหน้า เพื่อไม่ให้ครึ่งล่างของกระดาษว่าง */
      `
      <tr class="filler">
        <td class="item empty-cell"></td>
        <td class="amount empty-cell"></td>
        <td class="item empty-cell"></td>
        <td class="amount empty-cell"></td>
      </tr>
    `,
    )
    .join('');
}

export function buildPayslipHtml(
  payslip: PayslipLike,
  layout: PayslipPaperLayout,
) {
  const isHalf = layout === 'HALF';
  const payslipDetailsVisible = payslip.payslipDetailsVisible !== false;
  const earnings = payslipDetailsVisible
    ? payslip.lines.filter(
        (line) => line.type === 'EARNING' && !shouldHideLine(line),
      )
    : [];
  const deductions = payslipDetailsVisible
    ? payslip.lines.filter(
        (line) => line.type === 'DEDUCTION' && !shouldHideLine(line),
      )
    : [];

  const company = resolvePayslipLetterhead(payslip);
  const branchNote = payslip.employee.branch?.payslipNote?.trim() || '';
  const employeeName = getEmployeeName(payslip);
  const companyName = company.nameTh || company.nameEn || company.code || '';
  const companyNameEn = company.nameEn || '';
  const statusLabel =
    RUN_STATUS_LABEL[payslip.run.status] ?? payslip.run.status;

  const contactLine = [
    company.phone ? `โทร. ${company.phone}` : null,
    company.email,
    company.taxId ? `เลขประจำตัวผู้เสียภาษี ${company.taxId}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return `
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>สลิปเงินเดือน ${escapeHtml(payslip.employee.employeeCode)} ${escapeHtml(payslip.run.period.code)}</title>
  <style>
    * { box-sizing: border-box; }

    @page { ${PAPER_CSS[layout]} }

    :root {
      --ink: #111827;
      --ink-soft: #4b5563;
      --ink-faint: #6b7280;
      --rule-strong: #64748b;
      --rule: #cbd5e1;
      --rule-soft: #e2e8f0;
      --accent: #1e3a8a;
      --accent-bg: #eff6ff;
    }

    html,
    body {
      height: 100%;
    }

    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: var(--ink);
      /* TH Sarabun New คือฟอนต์เอกสารราชการไทย ถ้าเครื่องที่เรนเดอร์ไม่มี
         จะไล่ลงมาที่ Sarabun / Garuda (มากับ fonts-thai-tlwg ในอิมเมจ) */
      font-family: "TH Sarabun New", "Sarabun", "Garuda", "Leelawadee UI",
        "Noto Sans Thai", Tahoma, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /*
     * เอกสารกินเต็มหน้ากระดาษเสมอ ไม่ปล่อยครึ่งล่างว่าง — ส่วนที่ยืดคือตาราง
     * รายการ (ดูแถว .filler) ส่วนยอดสุทธิ/ช่องลงนาม/ท้ายเอกสารจึงไปอยู่ก้นหน้า
     * ถ้ารายการยาวเกินหนึ่งหน้า flex จะไม่ยืดเพิ่ม ตารางไหลไปหน้าถัดไปตามปกติ
     */
    .sheet {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      border: 1px solid var(--rule-strong);
    }

    .grow {
      flex: 1 1 auto;
    }

    /* ---------- หัวจดหมาย ---------- */

    .letterhead {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--rule);
    }

    .logo {
      width: 52px;
      height: 52px;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid var(--rule);
    }

    .logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 4px;
    }

    .logo-fallback {
      background: #f8fafc;
      color: var(--ink-soft);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    .letterhead-body {
      flex: 1;
      min-width: 0;
    }

    .company-name {
      font-size: 16px;
      font-weight: 800;
      line-height: 1.25;
    }

    .company-name-en {
      margin-top: 1px;
      color: var(--ink-soft);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.01em;
    }

    .company-line {
      margin-top: 4px;
      color: var(--ink-faint);
      font-size: 10.5px;
      line-height: 1.4;
    }

    /* ---------- ชื่อเอกสาร ---------- */

    .doc-title {
      padding: 10px 14px 11px;
      text-align: center;
      border-bottom: 1px solid var(--rule);
      background: #f8fafc;
    }

    .doc-title h1 {
      margin: 0;
      font-size: 19px;
      font-weight: 800;
      letter-spacing: 0.01em;
    }

    .doc-title .en {
      margin-top: 2px;
      color: var(--ink-soft);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .doc-title .period {
      margin-top: 5px;
      font-size: 12px;
      font-weight: 700;
    }

    /* ---------- ตารางข้อมูล ---------- */

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead {
      display: table-header-group;
    }

    tr {
      break-inside: avoid;
    }

    .field-table td.field {
      padding: 6px 10px 7px;
      border-right: 1px solid var(--rule-soft);
      border-bottom: 1px solid var(--rule-soft);
      vertical-align: top;
    }

    .field-table tr:last-child td.field {
      border-bottom: 0;
    }

    .field-table td.field:last-child {
      border-right: 0;
    }

    .field-label {
      color: var(--ink-faint);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .field-value {
      margin-top: 1px;
      font-size: 12px;
      font-weight: 700;
      word-break: break-word;
    }

    /* ---------- ตารางรายการ ---------- */

    .lines {
      /* ตารางเป็นตัวเดียวที่ยืด แถวข้อมูลสูงคงที่ ส่วนเกินตกไปที่ .filler */
      height: 100%;
      border-top: 1px solid var(--rule-strong);
    }

    .lines th {
      padding: 6px 10px;
      background: #f1f5f9;
      border-bottom: 1px solid var(--rule);
      border-right: 1px solid var(--rule-soft);
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-align: left;
    }

    .lines th.amount-head {
      text-align: right;
    }

    .lines th:last-child,
    .lines td:last-child {
      border-right: 0;
    }

    .lines td {
      height: 21px;
      padding: 3px 10px;
      border-bottom: 1px solid #f1f5f9;
      border-right: 1px solid var(--rule-soft);
      vertical-align: top;
    }

    .lines td.item {
      width: 30%;
    }

    .lines td.amount {
      width: 20%;
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .item-name {
      font-size: 11.5px;
    }

    .item-code {
      margin-left: 5px;
      color: #9ca3af;
      font-size: 9px;
      letter-spacing: 0.02em;
    }

    /*
     * แถวสุดท้ายของ tbody ไม่กำหนดความสูง จึงกินพื้นที่ที่เหลือของหน้าไปทั้งหมด
     * แล้ววาดเส้นบรรทัดซ้ำทุก 21px ให้จังหวะเดียวกับแถวข้างบน ตารางจึงดูมีเส้น
     * ต่อเนื่องถึงแถวรวม แทนที่จะเป็นช่องว่างโล่ง ๆ
     */
    .lines tbody tr.filler td {
      height: auto;
      background-image: repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent 20px,
        #f1f5f9 20px,
        #f1f5f9 21px
      );
    }

    .lines tfoot td {
      height: auto;
      padding: 7px 10px;
      border-top: 1px solid var(--rule-strong);
      border-bottom: 0;
      font-size: 12px;
      font-weight: 800;
      background: #f8fafc;
    }

    .lines tfoot td.amount {
      font-size: 13px;
    }

    /* ---------- ยอดสุทธิ ---------- */

    /*
     * ยอดสุทธิ + ช่องลงนาม + ท้ายเอกสาร ต้องอยู่หน้าเดียวกันเสมอ ไม่งั้นสลิปที่
     * รายการยาวเกินหนึ่งหน้านิดเดียวจะได้หน้า 2 ที่มีแต่บรรทัดท้ายเอกสารบรรทัดเดียว
     */
    .closing {
      break-inside: avoid;
    }

    .net {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 14px 11px;
      border-top: 1px solid var(--rule-strong);
      background: var(--accent-bg);
    }

    .net-label {
      font-size: 13px;
      font-weight: 800;
    }

    .net-text {
      margin-top: 2px;
      color: var(--ink-soft);
      font-size: 11px;
    }

    .net-value {
      color: var(--accent);
      font-size: 22px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.01em;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .net-value .unit {
      margin-left: 4px;
      font-size: 12px;
      font-weight: 700;
    }

    /* ---------- กรณีปิดรายละเอียด ---------- */

    .details-hidden {
      padding: 16px 14px;
      border-top: 1px solid var(--rule);
      text-align: center;
    }

    .details-hidden-title {
      font-size: 12px;
      font-weight: 800;
    }

    .details-hidden-message {
      margin-top: 3px;
      color: var(--ink-faint);
      font-size: 11px;
      line-height: 1.5;
    }

    /* ---------- ลงนาม ---------- */

    .signatures {
      display: flex;
      gap: 24px;
      padding: 26px 14px 14px;
      border-top: 1px solid var(--rule);
    }

    .signature {
      flex: 1;
      text-align: center;
    }

    .signature-line {
      margin: 0 auto;
      width: 78%;
      border-bottom: 1px dotted #94a3b8;
    }

    .signature-role {
      margin-top: 5px;
      font-size: 11px;
      font-weight: 700;
    }

    .signature-date {
      margin-top: 1px;
      color: var(--ink-faint);
      font-size: 10px;
    }

    /* ---------- ท้ายเอกสาร ---------- */

    .footer {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 14px;
      padding: 6px 14px 7px;
      border-top: 1px solid var(--rule-soft);
      color: var(--ink-faint);
      font-size: 9.5px;
    }

    .confidential {
      font-weight: 700;
      letter-spacing: 0.04em;
    }

    /* ---------- โหมดครึ่งหน้า (A5 แนวนอน) ---------- */

    /*
     * เนื้อหาเท่าเดิมทุกอย่าง แค่บีบระยะและขนาดตัวอักษรลงให้พอดีครึ่ง A4
     * ชื่อเอกสารย้ายไปอยู่แถวเดียวกับหัวจดหมาย เพื่อประหยัดความสูงไปหนึ่งแถบ
     */
    body.half {
      font-size: 10.5px;
      line-height: 1.35;
    }

    body.half .letterhead {
      align-items: center;
      gap: 9px;
      padding: 7px 10px;
    }

    body.half .logo {
      width: 38px;
      height: 38px;
    }

    body.half .company-name {
      font-size: 12.5px;
    }

    body.half .company-name-en,
    body.half .company-line {
      font-size: 8.6px;
      margin-top: 1px;
    }

    body.half .title-inline {
      flex: 0 0 auto;
      text-align: right;
    }

    body.half .title-inline h1 {
      margin: 0;
      font-size: 13.5px;
      font-weight: 800;
    }

    body.half .title-inline .en {
      color: var(--ink-soft);
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    body.half .title-inline .period {
      margin-top: 2px;
      font-size: 9.5px;
      font-weight: 700;
    }

    body.half .field-table td.field {
      padding: 4px 8px 5px;
    }

    body.half .field-label {
      font-size: 8.2px;
    }

    body.half .field-value {
      font-size: 10.5px;
    }

    body.half .lines th {
      padding: 4px 8px;
      font-size: 9px;
    }

    body.half .lines td {
      height: 17px;
      padding: 2px 8px;
    }

    body.half .item-name {
      font-size: 10px;
    }

    body.half .item-code {
      font-size: 8px;
      margin-left: 4px;
    }

    body.half .lines tbody tr.filler td {
      background-image: repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent 16px,
        #f1f5f9 16px,
        #f1f5f9 17px
      );
    }

    body.half .lines tfoot td {
      padding: 5px 8px;
      font-size: 10.5px;
    }

    body.half .lines tfoot td.amount {
      font-size: 11px;
    }

    body.half .net {
      padding: 6px 10px 7px;
    }

    body.half .net-label {
      font-size: 11px;
    }

    body.half .net-text {
      font-size: 9px;
    }

    body.half .net-value {
      font-size: 17px;
    }

    body.half .net-value .unit {
      font-size: 10px;
    }

    body.half .details-hidden {
      padding: 10px;
    }

    body.half .details-hidden-title {
      font-size: 10.5px;
    }

    body.half .details-hidden-message {
      font-size: 9.5px;
    }

    body.half .signatures {
      gap: 16px;
      padding: 16px 10px 8px;
    }

    body.half .signature-role {
      margin-top: 3px;
      font-size: 9.5px;
    }

    body.half .signature-date {
      font-size: 8.4px;
    }

    body.half .footer {
      padding: 4px 10px 5px;
      font-size: 8.2px;
    }
  </style>
</head>
<body class="${isHalf ? 'half' : 'full'}">
  <div class="sheet">
    <div class="letterhead">
      ${renderCompanyLogo(company)}
      <div class="letterhead-body">
        <div class="company-name">${escapeHtml(companyName)}</div>
        ${
          companyNameEn
            ? `<div class="company-name-en">${escapeHtml(companyNameEn)}</div>`
            : ''
        }
        ${
          company.address
            ? `<div class="company-line">${escapeHtml(company.address)}</div>`
            : ''
        }
        ${contactLine ? `<div class="company-line">${escapeHtml(contactLine)}</div>` : ''}
      </div>
      ${
        isHalf
          ? `
      <div class="title-inline">
        <h1>ใบแจ้งการจ่ายเงินเดือน</h1>
        <div class="en">Salary Slip</div>
        <div class="period">งวด ${escapeHtml(payslip.run.period.name)}</div>
      </div>
      `
          : ''
      }
    </div>

    ${
      isHalf
        ? ''
        : `
    <div class="doc-title">
      <h1>ใบแจ้งการจ่ายเงินเดือน</h1>
      <div class="en">Salary Slip</div>
      <div class="period">
        งวด ${escapeHtml(payslip.run.period.name)}
        (${escapeHtml(formatDate(payslip.run.period.startDate))} - ${escapeHtml(formatDate(payslip.run.period.endDate))})
      </div>
    </div>
    `
    }

    <table class="field-table">
      <tbody>
        <tr>
          ${renderFieldCell('รหัสพนักงาน', payslip.employee.employeeCode)}
          ${renderFieldCell('ชื่อ - นามสกุล', employeeName, 2)}
          ${renderFieldCell('ตำแหน่ง', payslip.employee.position)}
        </tr>
        <tr>
          ${renderFieldCell('แผนก', payslip.employee.department?.nameTh)}
          ${renderFieldCell('สาขา', payslip.employee.branch?.nameTh)}
          ${renderFieldCell('วันที่จ่าย', formatDate(payslip.run.period.paymentDate))}
          ${renderFieldCell('เงินเดือนประจำ', `${formatMoney(payslip.baseSalary)} บาท`)}
        </tr>
        <tr>
          ${renderFieldCell('รหัสงวด', payslip.run.period.code)}
          ${renderFieldCell('เลขที่รอบคำนวณ', payslip.run.runNo)}
          ${
            /* หัวเอกสารแบบครึ่งหน้าย่อจนไม่มีที่ลงช่วงงวด จึงย้ายมาไว้แถวนี้แทน */
            isHalf
              ? `${renderFieldCell(
                  'ช่วงงวด',
                  `${formatDate(payslip.run.period.startDate)} - ${formatDate(payslip.run.period.endDate)}`,
                )}
          ${renderFieldCell('สถานะเอกสาร', statusLabel)}`
              : renderFieldCell('สถานะเอกสาร', statusLabel, 2)
          }
        </tr>
      </tbody>
    </table>

    ${
      payslipDetailsVisible
        ? `
    <table class="lines grow">
      <thead>
        <tr>
          <th>รายการรายได้</th>
          <th class="amount-head">จำนวนเงิน</th>
          <th>รายการหัก</th>
          <th class="amount-head">จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>
        ${renderPairedRows(earnings, deductions, MIN_LINE_ROWS[layout])}
      </tbody>
      <tfoot>
        <tr>
          <td>รวมรายได้</td>
          <td class="amount">${formatMoney(payslip.totalEarnings)}</td>
          <td>รวมรายการหัก</td>
          <td class="amount">${formatMoney(payslip.totalDeductions)}</td>
        </tr>
      </tfoot>
    </table>
    `
        : `
    <div class="details-hidden grow">
      <div class="details-hidden-title">บริษัทปิดการแสดงรายละเอียดรายรับ / รายการหักของงวดนี้</div>
      <div class="details-hidden-message">
        ยอดรายได้รวม ${formatMoney(payslip.totalEarnings)} บาท ·
        รายการหักรวม ${formatMoney(payslip.totalDeductions)} บาท<br />
        หากต้องการดูรายการย่อย กรุณาติดต่อฝ่ายบุคคลหรือฝ่ายเงินเดือน
      </div>
    </div>
    `
    }

    <div class="closing">
    <div class="net">
      <div>
        <div class="net-label">เงินสุทธิที่ได้รับ</div>
        <div class="net-text">(${escapeHtml(formatBahtText(payslip.totalNetPay))})</div>
      </div>
      <div class="net-value">
        ${formatMoney(payslip.totalNetPay)}<span class="unit">บาท</span>
      </div>
    </div>

    <div class="signatures">
      <div class="signature">
        <div class="signature-line">&nbsp;</div>
        <div class="signature-role">ผู้จ่ายเงิน</div>
        <div class="signature-date">วันที่ ......... / ......... / .........</div>
      </div>
      <div class="signature">
        <div class="signature-line">&nbsp;</div>
        <div class="signature-role">ผู้รับเงิน</div>
        <div class="signature-date">วันที่ ......... / ......... / .........</div>
      </div>
    </div>

    <div class="footer">
      <div class="confidential">เอกสารลับเฉพาะบุคคล — โปรดเก็บรักษาไว้เป็นความลับ${
        branchNote ? `  ·  ${escapeHtml(branchNote)}` : ''
      }</div>
      <div>ออกจากระบบเมื่อ ${escapeHtml(new Date().toLocaleString('th-TH'))}</div>
    </div>
    </div>
  </div>
</body>
</html>
`;
}

function getChromeExecutablePath() {
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}

export function buildPayslipFileName(
  payslip: PayslipLike,
  layout: PayslipPaperLayout,
) {
  const suffix = layout === 'HALF' ? '-a5' : '';

  return `salary-slip-${payslip.employee.employeeCode}-${payslip.run.period.code}${suffix}.pdf`
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-');
}

export function launchPayslipBrowser() {
  return puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

/**
 * เรนเดอร์สลิปหนึ่งใบด้วย browser ที่เปิดค้างไว้แล้ว
 *
 * แยกออกมาเพื่อให้การออกสลิปทั้งรอบ (ZIP) เปิด Chromium ครั้งเดียวแล้ววนใช้ซ้ำได้
 * วัดแล้วต่างกันชัดเจน — เปิด-ปิดใหม่ทุกใบ ~1,280 ms ต่อใบ แต่ใช้ซ้ำเหลือ ~300 ms
 * ผู้เรียกเป็นคนรับผิดชอบปิด browser เอง
 */
export async function renderPayslipPdfWithBrowser(
  browser: Browser,
  payslip: PayslipLike,
  layout: PayslipPaperLayout = 'FULL',
): Promise<PayslipPdfResult> {
  const page = await browser.newPage();

  try {
    await page.setContent(buildPayslipHtml(payslip, layout), {
      waitUntil: 'load',
    });

    /*
     * ขนาดกระดาษและระยะขอบคุมจาก @page ในสตริง HTML ที่เดียว (preferCSSPageSize)
     * ไม่งั้นระยะขอบของ puppeteer จะบวกทับ แล้วกรอบเอกสารโดนตัดขอบตอนพิมพ์
     * และโหมดครึ่งหน้าจะไม่ได้ขนาด A5 ตามที่ตั้งไว้
     */
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    return {
      buffer: Buffer.from(pdf),
      fileName: buildPayslipFileName(payslip, layout),
    };
  } finally {
    /* ปิดทุกครั้ง ไม่งั้นแท็บค้างสะสมตอนวนสร้างทั้งรอบ */
    await page.close();
  }
}

export async function generatePayslipPdf(
  payslip: PayslipLike,
  layout: PayslipPaperLayout = 'FULL',
): Promise<PayslipPdfResult> {
  const browser = await launchPayslipBrowser();

  try {
    return await renderPayslipPdfWithBrowser(browser, payslip, layout);
  } finally {
    await browser.close();
  }
}
