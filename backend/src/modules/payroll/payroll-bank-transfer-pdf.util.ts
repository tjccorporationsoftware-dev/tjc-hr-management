import puppeteer from 'puppeteer';

import {
  DOCUMENT_BASE_CSS,
  escapeHtml,
  formatBahtText,
  formatDate,
  formatDateTime,
  formatMoney,
  renderLetterhead,
  type DocumentCompany,
} from './payroll-document.util';

/**
 * หนังสือนำส่งรายการโอนเงินเข้าบัญชีเงินเดือน (PDF)
 * -----------------------------------------------------------------------------
 * เอกสารนี้คือ "ใบปะหน้า" ของไฟล์นำเข้าธนาคาร ไม่ใช่ตัวไฟล์นำเข้าเอง
 * ธนาคารรับไฟล์ข้อมูลไปประมวลผล ส่วนกระดาษใบนี้คือคำสั่งที่มีลายเซ็นผู้มีอำนาจ
 * กำกับว่าให้หักบัญชีไหน จำนวนเท่าไร กี่รายการ — ใช้สองทางพร้อมกัน
 *   1. ยื่นธนาคารคู่กับไฟล์ หรือแนบไปกับระบบ Cash Management
 *   2. เสนอผู้มีอำนาจอนุมัติภายในก่อนส่งเงินออก
 *
 * A4 แนวตั้ง เพราะเป็นหนังสือราชการธุรกิจ ไม่ใช่ตารางกว้าง — 6 คอลัมน์พอดีหน้า
 *
 * ธีมใช้ร่วมกับเอกสาร payroll ตัวอื่น (payroll-document.util) เพื่อให้เอกสาร
 * ทุกใบที่ออกจากระบบเป็นชุดเดียวกัน
 */

/*
 * จำนวนแถวสูงสุดต่อหน้า — ต้องแยกตามว่าหน้านั้นแบกอะไรอยู่บ้าง
 *
 * ท้ายเอกสาร (ช่องลงนาม + กล่องธนาคาร) กินพื้นที่ราว 9 แถว ถ้าใช้โควตาเดียว
 * ทุกหน้า พอรายการพอดีเต็มหน้า ช่องลงนามจะถูกดันไปอยู่หน้าถัดไปตัวเดียวโดด ๆ
 * ซึ่งอ่านแล้วเหมือนเอกสารขาด และคนเซ็นต้องพลิกหน้าไปเซ็นในหน้าที่ไม่มีตัวเลข
 */
/** จบในหน้าเดียว — แบกทั้งหัวเอกสารและท้ายเอกสาร */
const ROWS_SINGLE_PAGE = 14;
/** หน้าแรกที่ยังมีหน้าต่อ — แบกหัวเอกสารอย่างเดียว */
const ROWS_FIRST_PAGE = 20;
/** หน้ากลาง — ไม่แบกอะไรเลย */
const ROWS_NEXT_PAGE = 34;
/** หน้าสุดท้าย — แบกท้ายเอกสาร */
const ROWS_LAST_PAGE = 24;

export type BankTransferPdfRow = {
  sequence: number;
  employeeCode?: string | null;
  employeeName: string;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName: string;
  netPay: number;
  /** ข้อมูลที่ยังขาด ทำให้โอนไม่ได้ */
  missingFields: string[];
};

export type BankTransferPdfSummary = {
  employeeCount: number;
  totalNetPay: number;
  incompleteCount: number;
  missingCompanyFields: string[];
};

export type BankTransferPdfCompany = DocumentCompany & {
  bankCompanyCode?: string | null;
  bankDebitAccountNo?: string | null;
};

export type BankTransferPdfInput = {
  company: BankTransferPdfCompany;
  run: {
    runNo: string;
    periodName?: string | null;
    periodStartDate?: Date | string | null;
    periodEndDate?: Date | string | null;
    paymentDate?: Date | string | null;
    status?: string | null;
  };
  rows: BankTransferPdfRow[];
  summary: BankTransferPdfSummary;
  /** ชื่อรูปแบบไฟล์ที่แนบไปด้วย เช่น "กรุงไทย (KTB iPay)" */
  formatLabel?: string | null;
};

export type BankTransferPdfFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

function moneyText(value: unknown) {
  return formatMoney(value);
}

function dateText(value: Date | string | null | undefined) {
  return formatDate(value);
}

function safeFilePart(value: string | null | undefined) {
  return (
    (value || 'bank-transfer')
      .replace(/[^\w.\-ก-๙]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'bank-transfer'
  );
}

/**
 * ธนาคารปลายทางที่พบในรายการ — ถ้ามีเจ้าเดียวจะได้พาดหัวจดหมายถึงธนาคารนั้นตรง ๆ
 * ถ้าโอนข้ามหลายธนาคารก็บอกจำนวนแทน
 */
function destinationBanks(rows: BankTransferPdfRow[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => (row.bankName ?? '').trim())
        .filter((name) => name.length > 0),
    ),
  );
}

function renderFieldCell(label: string, value: unknown, span = 1) {
  return `
    <td class="field" ${span > 1 ? `colspan="${span}"` : ''}>
      <div class="field-label">${escapeHtml(label)}</div>
      <div class="field-value">${escapeHtml(value || '-')}</div>
    </td>
  `;
}

function renderSignature(role: string, hint: string) {
  return `
    <div class="signature">
      <div class="signature-line">&nbsp;</div>
      <div class="signature-name">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
      <div class="signature-role">${escapeHtml(role)}</div>
      <div class="signature-hint">${escapeHtml(hint)}</div>
    </div>
  `;
}

function renderRow(row: BankTransferPdfRow) {
  const incomplete = row.missingFields.length > 0;

  return `
    <tr class="${incomplete ? 'incomplete' : ''}">
      <td class="center">${row.sequence}${incomplete ? ' <span class="mark">*</span>' : ''}</td>
      <td>${escapeHtml(row.employeeCode || '-')}</td>
      <td>${escapeHtml(row.bankAccountName || row.employeeName)}</td>
      <td>${escapeHtml(row.bankName || '-')}</td>
      <td class="acct">${escapeHtml(row.bankAccountNo || '-')}</td>
      <td class="amount">${moneyText(row.netPay)}</td>
    </tr>
  `;
}

/**
 * ตัดรายการเป็นหน้า ๆ โดยกันที่ให้ท้ายเอกสารเสมอ
 *
 * เดินสองรอบ: รอบแรกลองใส่ตามโควตาปกติ ถ้าหน้าสุดท้ายแน่นเกินกว่าจะวาง
 * ท้ายเอกสารได้ ก็ย้ายแถวส่วนเกินไปตั้งหน้าใหม่ แทนที่จะปล่อยให้ช่องลงนาม
 * ไปอยู่หน้าเปล่าลำพัง
 */
function paginate(rows: BankTransferPdfRow[]) {
  if (rows.length === 0) return [[]];
  if (rows.length <= ROWS_SINGLE_PAGE) return [rows];

  const pages: BankTransferPdfRow[][] = [];
  let cursor = 0;

  while (cursor < rows.length) {
    const isFirst = pages.length === 0;
    const remaining = rows.length - cursor;

    /*
     * ถ้าที่เหลือจบในหน้านี้ได้ แปลว่าหน้านี้ต้องแบกท้ายเอกสารด้วย จึงต้องวัด
     * ด้วยโควตาของ "หน้าที่มีท้ายเอกสาร" ไม่ใช่โควตาปกติ ถ้าเกินก็กันแถวไว้
     * อย่างน้อยหนึ่งแถวให้หน้าถัดไป เพื่อไม่ให้ช่องลงนามไปอยู่หน้าเปล่าลำพัง
     */
    const closingCapacity = isFirst ? ROWS_SINGLE_PAGE : ROWS_LAST_PAGE;
    const normalCapacity = isFirst ? ROWS_FIRST_PAGE : ROWS_NEXT_PAGE;

    const size =
      remaining <= closingCapacity
        ? remaining
        : Math.min(normalCapacity, remaining - 1);

    pages.push(rows.slice(cursor, cursor + size));
    cursor += size;
  }

  return pages;
}

function renderTable(
  pageRows: BankTransferPdfRow[],
  options: {
    carriedForward: number;
    isLastPage: boolean;
    total: number;
    totalCount: number;
  },
) {
  const runningTotal =
    options.carriedForward +
    pageRows.reduce((sum, row) => sum + row.netPay, 0);

  /*
   * ยอดยกมา/ยกไป เป็นธรรมเนียมของเอกสารการเงินหลายหน้า — คนตรวจจะไล่ยอดต่อ
   * ระหว่างหน้าได้โดยไม่ต้องบวกเองใหม่ทั้งชุด
   */
  const carryRow =
    options.carriedForward > 0
      ? `
        <tr class="carry">
          <td colspan="5">ยอดยกมา</td>
          <td class="amount">${moneyText(options.carriedForward)}</td>
        </tr>`
      : '';

  const footRow = options.isLastPage
    ? `
      <tr class="grand">
        <td colspan="5">รวมทั้งสิ้น ${options.totalCount} รายการ</td>
        <td class="amount">${moneyText(options.total)}</td>
      </tr>`
    : `
      <tr class="carry">
        <td colspan="5">ยอดยกไป</td>
        <td class="amount">${moneyText(runningTotal)}</td>
      </tr>`;

  return `
    <table class="data-table">
      <colgroup>
        <col style="width:8%" />
        <col style="width:12%" />
        <col style="width:30%" />
        <col style="width:16%" />
        <col style="width:17%" />
        <col style="width:17%" />
      </colgroup>
      <thead>
        <tr>
          <th class="center">ลำดับ</th>
          <th>รหัสพนักงาน</th>
          <th>ชื่อบัญชี</th>
          <th>ธนาคาร</th>
          <th>เลขที่บัญชี</th>
          <th class="amount">จำนวนเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        ${carryRow}
        ${pageRows.map(renderRow).join('')}
      </tbody>
      <tfoot>${footRow}</tfoot>
    </table>
  `;
}

function renderInstruction(input: BankTransferPdfInput) {
  const { company, run, summary, rows } = input;
  const banks = destinationBanks(rows);

  const bankLine =
    banks.length === 1
      ? banks[0]
      : `${banks.length} ธนาคาร (ดูรายละเอียดในตาราง)`;

  const periodLabel = run.periodName || run.runNo;
  const periodRange =
    run.periodStartDate && run.periodEndDate
      ? `${dateText(run.periodStartDate)} - ${dateText(run.periodEndDate)}`
      : '';

  return `
    <div class="doc-title">
      <h1>หนังสือแจ้งการโอนเงินเข้าบัญชีเงินเดือน</h1>
      <div class="en">Payroll Credit Transfer Instruction</div>
      <div class="subtitle">
        งวด ${escapeHtml(periodLabel)}${periodRange ? ` (${escapeHtml(periodRange)})` : ''}
      </div>
    </div>

    <div class="salutation">
      <div class="line">
        <span class="lead">เรียน</span>
        <span>ผู้จัดการ ${escapeHtml(bankLine)}</span>
        <span class="blank">สาขา</span>
      </div>
      <p>
        บริษัทขอให้ธนาคารดำเนินการโอนเงินเข้าบัญชีเงินฝากของพนักงาน
        ตามรายละเอียดที่แนบมาพร้อมหนังสือฉบับนี้
        โดยหักเงินจากบัญชีของบริษัทตามที่ระบุไว้ด้านล่าง
      </p>
    </div>

    <table class="field-table">
      <tbody>
        <tr>
          ${renderFieldCell('บัญชีที่ให้หักเงิน', company.bankDebitAccountNo)}
          ${renderFieldCell('รหัสบริษัท', company.bankCompanyCode)}
          ${renderFieldCell('วันที่ต้องการให้เงินเข้าบัญชี', dateText(run.paymentDate))}
        </tr>
        <tr>
          ${renderFieldCell('เลขที่รอบคำนวณ', run.runNo)}
          ${renderFieldCell('รูปแบบไฟล์ที่แนบ', input.formatLabel)}
          ${renderFieldCell('ออกเอกสารเมื่อ', formatDateTime(new Date()))}
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="total-item">
        <div class="total-label">จำนวนรายการ</div>
        <div class="total-value">${summary.employeeCount}<span class="unit"> รายการ</span></div>
      </div>
      <div class="total-item net">
        <div class="total-label">ยอดโอนรวมทั้งสิ้น</div>
        <div class="total-value">${moneyText(summary.totalNetPay)}<span class="unit"> บาท</span></div>
      </div>
    </div>

    <div class="baht-text">
      จำนวนเงินตัวอักษร &nbsp;<strong>( ${escapeHtml(formatBahtText(summary.totalNetPay))} )</strong>
    </div>
  `;
}

/**
 * แถบเตือนข้อมูลไม่ครบ — วางท้ายเอกสาร ไม่ใช่ซ่อนไว้ในตาราง
 * เอกสารนี้สั่งให้เงินออกจากบัญชีจริง คนเซ็นต้องเห็นก่อนเซ็นว่ามีอะไรค้าง
 */
function renderWarnings(input: BankTransferPdfInput) {
  const { summary, rows } = input;
  const incomplete = rows.filter((row) => row.missingFields.length > 0);

  if (incomplete.length === 0 && summary.missingCompanyFields.length === 0) {
    return '';
  }

  const companyPart = summary.missingCompanyFields.length
    ? `<li>ข้อมูลบริษัทยังไม่ครบ: ${escapeHtml(summary.missingCompanyFields.join(' · '))} — สร้างไฟล์นำเข้าธนาคารไม่ได้จนกว่าจะกรอกครบ</li>`
    : '';

  const rowPart = incomplete.length
    ? `<li>มี ${incomplete.length} รายการที่ข้อมูลบัญชีไม่ครบ (ทำเครื่องหมาย <span class="mark">*</span> ไว้ในตาราง) โอนไม่ได้จนกว่าจะเติมข้อมูล:
        <div class="warn-names">${incomplete
          .slice(0, 12)
          .map(
            (row) =>
              `${escapeHtml(row.employeeName)} — ขาด${escapeHtml(row.missingFields.join('/'))}`,
          )
          .join(' · ')}${incomplete.length > 12 ? ` · และอีก ${incomplete.length - 12} รายการ` : ''}</div>
      </li>`
    : '';

  return `
    <div class="warning">
      <div class="warning-title">ตรวจก่อนลงนาม</div>
      <ul>${companyPart}${rowPart}</ul>
    </div>
  `;
}

function renderClosing(input: BankTransferPdfInput) {
  return `
    <div class="closing">
      ${renderWarnings(input)}

      <div class="signatures">
        ${renderSignature('ผู้จัดทำ', 'ฝ่ายทรัพยากรบุคคล')}
        ${renderSignature('ผู้มีอำนาจลงนาม', 'ตามเงื่อนไขที่แจ้งธนาคาร')}
        ${renderSignature('ผู้มีอำนาจลงนาม', 'ตามเงื่อนไขที่แจ้งธนาคาร')}
      </div>

      <div class="stamp-note">ประทับตราสำคัญของบริษัท (ถ้ามี)</div>

      <div class="bank-box">
        <div class="bank-box-title">สำหรับเจ้าหน้าที่ธนาคาร</div>
        <div class="bank-box-grid">
          <div><span>ผู้รับเรื่อง</span><i></i></div>
          <div><span>วันที่รับ</span><i></i></div>
          <div><span>เลขที่อ้างอิง</span><i></i></div>
        </div>
      </div>

      <div class="footer">
        <div class="confidential">เอกสารลับ — ใช้ภายในองค์กรและยื่นธนาคารเท่านั้น</div>
        <div>ออกจากระบบเมื่อ ${escapeHtml(formatDateTime(new Date()))}</div>
      </div>
    </div>
  `;
}

function buildHtml(input: BankTransferPdfInput) {
  const pages = paginate(input.rows);
  const total = input.summary.totalNetPay;

  let carried = 0;

  const body = pages
    .map((pageRows, index) => {
      const isFirst = index === 0;
      const isLast = index === pages.length - 1;
      const carriedForward = carried;
      carried += pageRows.reduce((sum, row) => sum + row.netPay, 0);

      return `
        <section class="sheet${isFirst ? '' : ' continued'}">
          ${isFirst ? renderLetterhead(input.company) : ''}
          ${isFirst ? renderInstruction(input) : `<div class="cont-head">รายการโอนเงินเข้าบัญชี (ต่อ) · งวด ${escapeHtml(input.run.periodName || input.run.runNo)}</div>`}
          ${renderTable(pageRows, {
            carriedForward,
            isLastPage: isLast,
            total,
            totalCount: input.summary.employeeCount,
          })}
          ${isLast ? renderClosing(input) : ''}
        </section>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>หนังสือแจ้งการโอนเงินเข้าบัญชีเงินเดือน ${escapeHtml(input.run.runNo)}</title>
  <style>
    ${DOCUMENT_BASE_CSS}

    body { font-size: 12px; }

    /* กระดาษแนวตั้ง หัวจดหมายจึงกลับมาเป็นบล็อกซ้ายตามปกติ ไม่ใช่แบ่งซ้าย-ขวา */
    .sheet {
      min-height: auto;
      border: 0;
      padding: 0;
      break-after: page;
    }

    .sheet:last-child { break-after: auto; }

    .letterhead { padding: 0 0 8px; border-bottom: 2px solid var(--ink); }
    .logo { width: 58px; height: 58px; }
    .company-name { font-size: 17px; }

    .doc-title {
      flex: none;
      max-width: none;
      padding: 7px 0 6px;
      border-left: 0;
      text-align: center;
    }

    .doc-title h1 { font-size: 17px; }
    .doc-title .en { font-size: 9.5px; }
    .doc-title .subtitle { font-size: 12px; }

    .cont-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--rule);
      font-size: 12.5px;
      font-weight: 800;
    }

    /* ---------- คำนำหนังสือ ---------- */

    .salutation { margin-bottom: 6px; }

    .salutation .line {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-size: 12.5px;
      font-weight: 700;
    }

    .salutation .lead { min-width: 34px; }

    .salutation .blank {
      flex: 1;
      border-bottom: 1px dotted #94a3b8;
      font-weight: 400;
      color: var(--ink-faint);
    }

    .salutation p {
      margin: 5px 0 0;
      text-indent: 34px;
      line-height: 1.5;
      color: var(--ink-soft);
    }

    /* ---------- ตารางข้อมูลคำสั่ง ---------- */

    .field-table {
      margin-bottom: 8px;
      border: 1px solid var(--rule);
    }

    /* ธีมกลางเผื่อระยะไว้สำหรับกระดาษแนวนอน หน้านี้แนวตั้งจึงบีบลงได้ */
    .field-table td.field { padding: 5px 12px; }

    /* ---------- ยอดรวม ---------- */

    .totals {
      display: grid;
      grid-template-columns: 1fr 1.6fr;
      border: 1px solid var(--rule);
      border-top: 0;
    }

    .total-item {
      padding: 6px 12px 7px;
      border-right: 1px solid var(--rule-soft);
    }

    .total-item:last-child { border-right: 0; }
    .total-item.net { background: var(--accent-bg); }

    .total-label {
      color: var(--ink-faint);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .total-value {
      margin-top: 2px;
      font-size: 19px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .total-item.net .total-value { color: var(--accent); font-size: 22px; }
    .total-value .unit { font-size: 11px; font-weight: 700; }

    .baht-text {
      padding: 5px 12px 6px;
      border: 1px solid var(--rule);
      border-top: 0;
      margin-bottom: 8px;
      font-size: 12px;
      text-align: center;
    }

    /* ---------- ตารางรายการ ---------- */

    .data-table {
      table-layout: fixed;
      border: 1px solid var(--rule);
    }

    .data-table th {
      padding: 5px 8px;
      background: #f1f5f9;
      border-bottom: 1px solid var(--rule);
      border-right: 1px solid var(--rule-soft);
      font-size: 10.5px;
      font-weight: 800;
      text-align: left;
    }

    .data-table td {
      padding: 3px 8px;
      border-bottom: 1px solid #f1f5f9;
      border-right: 1px solid var(--rule-soft);
      font-size: 11.4px;
      line-height: 1.3;
      vertical-align: middle;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .data-table tbody tr:nth-child(even) td { background: #fafcfe; }

    .data-table th:last-child,
    .data-table td:last-child { border-right: 0; }

    .data-table .amount,
    .data-table th.amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .data-table .acct {
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }

    .data-table .center,
    .data-table th.center { text-align: center; }

    /* แถวข้อมูลไม่ครบต้องสะดุดตาคนเซ็น ไม่ใช่กลืนไปกับแถวปกติ */
    .data-table tr.incomplete td,
    .data-table tbody tr.incomplete:nth-child(even) td { background: #fff7ed; }

    .mark { color: #b45309; font-weight: 800; }

    /*
     * ค่าเริ่มต้นของ tfoot คือ table-footer-group ที่เบราว์เซอร์พิมพ์ซ้ำทุกหน้า
     * บังคับเป็น row-group ให้แถวรวมโผล่ครั้งเดียวตอนจบตารางของหน้านั้นจริง ๆ
     */
    .data-table tfoot { display: table-row-group; }

    .data-table tfoot td {
      padding: 5px 8px;
      border-top: 1px solid var(--rule-strong);
      border-bottom: 0;
      background: #f8fafc;
      font-size: 11.8px;
      font-weight: 800;
    }

    .data-table tfoot tr.grand td {
      background: var(--accent-bg);
      color: var(--accent);
      font-size: 12.5px;
    }

    .data-table tfoot tr.carry td {
      color: var(--ink-soft);
      font-weight: 700;
    }

    .data-table tbody tr.carry td {
      background: #f8fafc;
      color: var(--ink-soft);
      font-weight: 700;
    }

    /* ---------- ท้ายเอกสาร ---------- */

    .closing { break-inside: avoid; }

    .warning {
      margin-top: 12px;
      padding: 8px 12px 9px;
      border: 1px solid #fdba74;
      background: #fff7ed;
      font-size: 11px;
    }

    .warning-title {
      color: #9a3412;
      font-weight: 800;
      margin-bottom: 3px;
    }

    .warning ul { margin: 0; padding-left: 16px; }
    .warning li { margin-top: 2px; }

    .warn-names {
      margin-top: 2px;
      color: var(--ink-soft);
      font-size: 10.4px;
      line-height: 1.5;
    }

    .signatures { gap: 18px; padding: 14px 0 6px; }
    .signature-hint {
      margin-top: 1px;
      color: var(--ink-faint);
      font-size: 9.4px;
    }

    .stamp-note {
      text-align: center;
      color: var(--ink-faint);
      font-size: 9.6px;
    }

    .bank-box {
      margin-top: 10px;
      border: 1px solid var(--rule);
    }

    .bank-box-title {
      padding: 4px 10px;
      background: #f1f5f9;
      border-bottom: 1px solid var(--rule);
      font-size: 11px;
      font-weight: 800;
    }

    .bank-box-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
    }

    .bank-box-grid > div {
      padding: 7px 10px 11px;
      border-right: 1px solid var(--rule-soft);
      font-size: 10.4px;
      color: var(--ink-faint);
    }

    .bank-box-grid > div:last-child { border-right: 0; }

    .bank-box-grid i {
      display: block;
      margin-top: 11px;
      border-bottom: 1px dotted #94a3b8;
    }

    .footer { padding: 4px 0 0; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

function getChromeExecutablePath() {
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}

export async function generateBankTransferPdf(
  input: BankTransferPdfInput,
): Promise<BankTransferPdfFile> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(input), { waitUntil: 'load' });

    /*
     * เอกสารยาวหลายหน้าได้ตามจำนวนพนักงาน จึงต้องมีเลขหน้า ซึ่งทำได้ทาง
     * footerTemplate เท่านั้น และ footerTemplate ใช้ร่วมกับ preferCSSPageSize
     * ไม่ได้ ขนาดกระดาษกับระยะขอบจึงสั่งจากฝั่ง puppeteer แทน @page
     */
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;padding:0 14mm;font-size:8px;color:#6b7280;
                    font-family:'TH Sarabun New','Sarabun','Garuda',Tahoma,sans-serif;
                    display:flex;justify-content:space-between;">
          <span>${escapeHtml(input.company.nameTh || input.company.nameEn || '')} · ${escapeHtml(input.run.runNo)}</span>
          <span>หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
      margin: {
        top: '14mm',
        right: '14mm',
        bottom: '16mm',
        left: '14mm',
      },
    });

    return {
      buffer: Buffer.from(pdf),
      fileName: `bank-transfer-${safeFilePart(input.run.runNo)}.pdf`,
      mimeType: 'application/pdf',
    };
  } finally {
    await browser.close();
  }
}

export { buildHtml as buildBankTransferHtml };
