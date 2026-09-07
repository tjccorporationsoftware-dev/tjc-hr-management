import puppeteer from 'puppeteer';

import {
  DOCUMENT_BASE_CSS,
  escapeHtml,
  renderLetterhead,
} from './payroll-document.util';
import type {
  WorkmenCompensationReport,
  WorkmenEmployeeRow,
} from './services/payroll-workmen-compensation.service';
import type { WorkmenFormFile } from './payroll-workmen-form-pdf.util';

/**
 * รายงานกองทุนเงินทดแทนประจำปี (กท.20ก) — ฉบับพิมพ์
 * -----------------------------------------------------------------------------
 * ไฟล์ตัวอย่างของลูกค้ามีแต่ Excel เพราะเอาไว้ส่งต่อ ไฟล์นี้เป็นฉบับสำหรับพิมพ์
 * แนบสำนวนหรือเก็บเข้าแฟ้ม จึงมีหัวจดหมายและเลขหน้าเหมือนเอกสารเงินเดือนใบอื่น
 * แต่คอลัมน์และยอดรวมยังตรงกับ Excel ทุกช่อง
 *
 * เอกสารนี้แนบไปกับแบบ กท.20 ยอดท้ายตารางจึงต้องเท่ากับช่อง (ค) ของ กท.20
 * ถ้าสองใบไม่ตรงกันแปลว่ามีที่หนึ่งตัดเพดาน 20,000/คน/เดือน ผิด
 */

/** จำนวนบรรทัดต่อหน้า — หน้าแรกเสียที่ให้หัวจดหมายกับหัวเรื่อง */
const ROWS_FIRST_PAGE = 22;
const ROWS_NEXT_PAGE = 30;

function money(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** ตัดรายชื่อเป็นหน้า ๆ ตามโควตาบรรทัดของแต่ละหน้า */
function paginate(rows: WorkmenEmployeeRow[]) {
  if (rows.length === 0) return [[]];

  const pages: WorkmenEmployeeRow[][] = [];
  let cursor = 0;

  while (cursor < rows.length) {
    const capacity = pages.length === 0 ? ROWS_FIRST_PAGE : ROWS_NEXT_PAGE;
    pages.push(rows.slice(cursor, cursor + capacity));
    cursor += capacity;
  }

  return pages;
}

function renderRows(rows: WorkmenEmployeeRow[], startIndex: number) {
  return rows
    .map(
      (person, offset) => `
      <tr>
        <td class="no">${startIndex + offset + 1}</td>
        <td>${escapeHtml(person.fullName)}</td>
        <td>${escapeHtml(person.branchName)}</td>
        <td>${escapeHtml(person.departmentName)}</td>
        <td>${escapeHtml(person.positionName)}</td>
        <td class="type">${escapeHtml(person.employmentType)}</td>
        <td class="amount">${money(person.reportableWage)}</td>
      </tr>`,
    )
    .join('');
}

export function buildWorkmenAnnualHtml(report: WorkmenCompensationReport) {
  const { company, employeeTotals } = report;
  const pages = paginate(report.employees);

  const missing =
    report.missingCompanyFields.length > 0
      ? `<div class="warn">ยังไม่ได้กรอก ${escapeHtml(
          report.missingCompanyFields.join(' · '),
        )} — เติมที่หน้าข้อมูลบริษัทก่อนยื่นจริง</div>`
      : '';

  const rateText =
    company.workmenCompensationRate === null
      ? '-'
      : String(company.workmenCompensationRate);

  let cursor = 0;

  const body = pages
    .map((rows, pageIndex) => {
      const startIndex = cursor;
      cursor += rows.length;

      const isLast = pageIndex === pages.length - 1;

      const head =
        pageIndex === 0
          ? `
        ${renderLetterhead(
          company,
          '<div class="doc-title">รายงานกองทุนเงินทดแทนประจำปี<br /><span>แบบ กท.20 ก</span></div>',
        )}
        <div class="meta">
          <span>ประจำปี <strong>${report.buddhistYear}</strong></span>
          <span>เลขที่บัญชี <strong>${escapeHtml(
            company.socialSecurityAccountNo || '-',
          )}</strong></span>
          <span>รหัสกิจการ <strong>${escapeHtml(
            company.workmenCompensationCode || '-',
          )}</strong></span>
          <span>อัตราเงินสมทบ <strong>${escapeHtml(rateText)}</strong></span>
        </div>
        ${missing}`
          : '';

      const foot = isLast
        ? `<tfoot>
            <tr>
              <td colspan="6">รวมจำนวนคน ${employeeTotals.count} คน</td>
              <td class="amount">${money(employeeTotals.reportableWage)}</td>
            </tr>
          </tfoot>`
        : '';

      const closing = isLast
        ? `
        <div class="note">
          ค่าจ้างที่ต้องแจ้งคิดจากค่าจ้างตามกฎหมาย ไม่รวมค่าล่วงเวลาและโบนัส
          และตัดเพดานที่ 20,000 บาท/คน/เดือน ก่อนรวมทั้งปี
          ยอดรวมข้างต้นต้องเท่ากับช่อง (ค) ของแบบ กท.20 ปีเดียวกัน
        </div>
        <div class="signature">
          <div class="sign-box">
            <div class="sign-line"></div>
            <div>ลงชื่อ ................................................ นายจ้าง</div>
            <div class="sign-sub">(................................................)</div>
            <div class="sign-sub">ตำแหน่ง ................................................</div>
          </div>
        </div>`
        : '';

      return `
      <section class="sheet${isLast ? '' : ' more'}">
        ${head}
        <table class="list">
          <colgroup>
            <col style="width:6%" />
            <col style="width:23%" />
            <col style="width:20%" />
            <col style="width:13%" />
            <col style="width:19%" />
            <col style="width:10%" />
            <col style="width:15%" />
          </colgroup>
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>ชื่อ-นามสกุล</th>
              <th>สำนักงานสาขา</th>
              <th>แผนก</th>
              <th>ตำแหน่ง</th>
              <th>ประเภท</th>
              <th class="amount">ค่าจ้างที่ต้องแจ้ง</th>
            </tr>
          </thead>
          <tbody>
            ${renderRows(rows, startIndex)}
          </tbody>
          ${foot}
        </table>
        ${closing}
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>รายงานกองทุนเงินทดแทนประจำปี (กท.20ก) ${report.buddhistYear}</title>
  <style>
    ${DOCUMENT_BASE_CSS}

    @page { size: A4 portrait; margin: 12mm 10mm 14mm; }

    .sheet.more { break-after: page; }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 22px;
      margin: 10px 0 8px;
      font-size: 11px;
    }

    .warn {
      margin-bottom: 8px;
      padding: 6px 10px;
      border-left: 3px solid #b45309;
      background: #fef3c7;
      font-size: 10.5px;
    }

    table.list {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 10.5px;
    }

    table.list th,
    table.list td {
      border: 1px solid #94a3b8;
      padding: 4px 6px;
      vertical-align: middle;
      word-wrap: break-word;
    }

    table.list thead th {
      background: #e2e8f0;
      font-weight: 700;
      text-align: center;
    }

    table.list td.no,
    table.list td.type { text-align: center; }
    table.list .amount { text-align: right; }

    table.list tbody tr:nth-child(even) td { background: #f8fafc; }

    /* ให้แถวรวมเป็นกลุ่มของตัวเอง จะได้ไม่ถูกดันไปโผล่หน้าใหม่ลำพัง */
    table.list tfoot { display: table-row-group; }
    table.list tfoot td {
      font-weight: 700;
      background: #e2e8f0;
    }

    .note {
      margin-top: 8px;
      font-size: 10px;
      color: #475569;
      line-height: 1.5;
    }

    .signature {
      margin-top: 26px;
      display: flex;
      justify-content: flex-end;
    }

    .sign-box { width: 46%; text-align: center; font-size: 11px; }
    .sign-line { height: 26px; }
    .sign-sub { margin-top: 6px; }
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

export async function generateWorkmenAnnualPdf(
  report: WorkmenCompensationReport,
): Promise<WorkmenFormFile> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildWorkmenAnnualHtml(report), {
      waitUntil: 'load',
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;padding:0 10mm;font-size:8px;color:#64748b;
                    display:flex;justify-content:space-between;">
          <span>รายงานกองทุนเงินทดแทนประจำปี (กท.20 ก) ประจำปี ${report.buddhistYear}</span>
          <span>หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });

    return {
      buffer: Buffer.from(pdf),
      fileName: `kt-20-k-${report.buddhistYear}.pdf`,
      mimeType: 'application/pdf',
    };
  } finally {
    await browser.close();
  }
}
