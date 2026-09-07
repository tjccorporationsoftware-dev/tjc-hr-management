import puppeteer from 'puppeteer';

import { PND1A_ATTACHMENT_IMAGE } from './pnd1a-form.asset';
import {
  FORM_OVERLAY_CSS,
  formMoney,
  getChromeExecutablePath,
  place,
  placeIdDigits,
  placePlainDigits,
  tick,
} from './utils/payroll-form-overlay.util';
import type {
  Pnd1aAttachment,
  Pnd1aForm,
  Pnd1aPersonRow,
} from './utils/payroll-pnd1a-form.util';
import type { Pnd1aFormFile } from './payroll-pnd1a-summary-pdf.util';

/**
 * ใบแนบ ภ.ง.ด.1ก — รายชื่อผู้มีเงินได้แผ่นละ 21 คน
 * -----------------------------------------------------------------------------
 * ต่างจากใบแนบของ ภ.ง.ด.1 ตรงที่แต่ละบรรทัดมีสองชั้น
 *
 *   ชั้นบน   เลขประจำตัวผู้เสียภาษี + ชื่อ + ชื่อสกุล
 *   ชั้นล่าง ที่อยู่ของผู้มีเงินได้
 *
 * และยอดเป็นยอด "ทั้งปี" ไม่ใช่ยอดของงวดเดียว
 * ยอดรวมของทุกแผ่นต้องเท่ากับตัวเลขบนใบสรุป
 */

/** พิกัดบนใบแนบ (หน่วยเป็นพิกเซลของภาพ 1240 x 1754) */
const SHEET = {
  taxIdBoxes: { x: 603, y: 57, width: 279 },
  branchBoxes: { x: 1124, y: 97, width: 112 },
  incomeTypeTick: { x: 139, y: 127 },
  sheetNo: { x: 1026, y: 188, width: 50 },
  sheetTotal: { x: 1144, y: 188, width: 46 },
  table: {
    /* วัดจากเส้นตารางจริง: แถวแรก 272 · แถวสุดท้ายจบ 1535 · 21 แถว = 60.14 */
    firstRowTop: 272,
    rowHeight: 60.14,
    sequenceCenter: 71,
    idBoxes: { x: 110, width: 272 },
    firstName: { x: 424, width: 168 },
    lastName: { x: 656, width: 196 },
    address: { x: 146, width: 700 },
    paidRight: 988,
    taxRight: 1144,
    conditionCenter: 1185,
    /** ระยะจากขอบบนของแถวถึงแต่ละบรรทัดย่อย */
    idOffset: 11,
    nameOffset: 13,
    addressOffset: 37,
  },
  totalRow: { y: 1542, paidRight: 988, taxRight: 1144 },
  filedOn: { day: 897, month: 950, year: 1098, y: 1668 },
};

function renderPersonRow(row: Pnd1aPersonRow, indexInSheet: number) {
  const { table } = SHEET;
  const top = table.firstRowTop + indexInSheet * table.rowHeight;

  return [
    place(
      table.sequenceCenter - 30,
      top + table.nameOffset,
      String(row.sequence),
      { width: 60, align: 'center', size: 22 },
    ),
    placeIdDigits(
      table.idBoxes.x,
      top + table.idOffset,
      table.idBoxes.width,
      row.identityNo,
      21,
    ),
    place(
      table.firstName.x,
      top + table.nameOffset,
      `${row.title}${row.firstName}`,
      { width: table.firstName.width, size: 21 },
    ),
    place(table.lastName.x, top + table.nameOffset, row.lastName, {
      width: table.lastName.width,
      size: 21,
    }),
    place(table.address.x, top + table.addressOffset, row.address, {
      width: table.address.width,
      size: 19,
    }),
    place(
      table.paidRight - 150,
      top + table.nameOffset + 12,
      formMoney(row.paidAmount),
      { width: 150, align: 'right', size: 21 },
    ),
    place(
      table.taxRight - 140,
      top + table.nameOffset + 12,
      formMoney(row.taxWithheld),
      { width: 140, align: 'right', size: 21 },
    ),
    place(
      table.conditionCenter - 25,
      top + table.nameOffset + 12,
      row.condition,
      { width: 50, align: 'center', size: 20 },
    ),
  ].join('');
}

function renderSheet(
  form: Pnd1aForm,
  sheet: Pnd1aAttachment,
  sheetCount: number,
) {
  const { issuedOn } = form;

  return `
  <section class="page">
    <img class="bg" src="${PND1A_ATTACHMENT_IMAGE}" alt="" />
    ${placeIdDigits(
      SHEET.taxIdBoxes.x,
      SHEET.taxIdBoxes.y,
      SHEET.taxIdBoxes.width,
      form.company.taxId,
      21,
    )}
    ${placePlainDigits(
      SHEET.branchBoxes.x,
      SHEET.branchBoxes.y,
      SHEET.branchBoxes.width,
      form.company.branchNo,
      20,
    )}
    ${tick(SHEET.incomeTypeTick.x, SHEET.incomeTypeTick.y, 22)}
    ${place(SHEET.sheetNo.x, SHEET.sheetNo.y, String(sheet.sheetNo), {
      width: SHEET.sheetNo.width,
      align: 'center',
      size: 21,
    })}
    ${place(SHEET.sheetTotal.x, SHEET.sheetTotal.y, String(sheetCount), {
      width: SHEET.sheetTotal.width,
      align: 'center',
      size: 21,
    })}
    ${sheet.rows.map((row, index) => renderPersonRow(row, index)).join('')}
    ${place(
      SHEET.totalRow.paidRight - 150,
      SHEET.totalRow.y,
      formMoney(sheet.paidAmount),
      { width: 150, align: 'right', size: 22 },
    )}
    ${place(
      SHEET.totalRow.taxRight - 140,
      SHEET.totalRow.y,
      formMoney(sheet.taxWithheld),
      { width: 140, align: 'right', size: 22 },
    )}
    ${
      issuedOn
        ? `
    ${place(SHEET.filedOn.day, SHEET.filedOn.y, String(issuedOn.day), { width: 24, align: 'center', size: 21 })}
    ${place(SHEET.filedOn.month, SHEET.filedOn.y, issuedOn.monthName, { width: 96, align: 'center', size: 21 })}
    ${place(SHEET.filedOn.year, SHEET.filedOn.y, String(issuedOn.buddhistYear), { width: 58, align: 'center', size: 21 })}`
        : ''
    }
  </section>`;
}

export function buildPnd1aAttachmentHtml(form: Pnd1aForm) {
  const sheetCount = form.attachments.length;

  const pages = form.attachments
    .map((sheet) => renderSheet(form, sheet, sheetCount))
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>ใบแนบ ภ.ง.ด.1ก ประจำปีภาษี ${form.buddhistYear}</title>
  <style>${FORM_OVERLAY_CSS}</style>
</head>
<body>
  ${pages}
</body>
</html>`;
}

export async function generatePnd1aAttachmentPdf(
  form: Pnd1aForm,
): Promise<Pnd1aFormFile> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildPnd1aAttachmentHtml(form), {
      waitUntil: 'load',
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    return {
      buffer: Buffer.from(pdf),
      fileName: `pnd1a-attachment-${form.buddhistYear}.pdf`,
      mimeType: 'application/pdf',
    };
  } finally {
    await browser.close();
  }
}
