import puppeteer from 'puppeteer';

import { escapeHtml } from './payroll-document.util';
import {
  PND1_ATTACHMENT_IMAGE,
  PND1_FORM_HEIGHT,
  PND1_FORM_WIDTH,
} from './pnd1-form.asset';
import { PDFDocument } from 'pdf-lib';

import { RD_PND1_COVER_TEMPLATE } from './rd-form-template.asset';
import { FormStamp, stampMoney } from './utils/payroll-pdf-stamp.util';
import {
  pnd1Money,
  THAI_MONTH_NAMES,
  type Pnd1Attachment,
  type Pnd1Form,
  type Pnd1PersonRow,
} from './utils/payroll-pnd1-form.util';

/**
 * แบบ ภ.ง.ด.1 ฉบับพิมพ์
 * -----------------------------------------------------------------------------
 * พิมพ์ข้อมูลทับลงบนภาพแบบพิมพ์เปล่าของกรมสรรพากร วิธีเดียวกับระบบเดิมของลูกค้า
 * (ดู pnd1-form.asset.ts) เอกสารประกอบด้วย
 *
 *   หน้า 1      หน้าปก — ข้อมูลผู้มีหน้าที่หักภาษี เดือนที่จ่าย และตารางสรุป
 *   หน้า 2..N   ใบแนบ — รายชื่อผู้มีเงินได้แผ่นละ 21 คน พร้อมยอดรวมท้ายแผ่น
 *
 * ทุกพิกัดในไฟล์นี้อ้างอิงระบบพิกัดของภาพ (1240 x 1754) แล้วแปลงเป็น % ตอนวาง
 * จึงไม่ผูกกับ DPI ที่พิมพ์จริง แก้ตำแหน่งให้ดูที่ตาราง COVER / SHEET ด้านล่าง
 * ที่เดียว ไม่ต้องไล่แก้ใน HTML
 */

export type Pnd1FormFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

/* ---------------------------------------------------------------
   พิกัดบนหน้าปก (หน่วยเป็นพิกเซลของภาพ 1240 x 1754)
   --------------------------------------------------------------- */
/*
 * ขนาดตัวอักษรบนหน้าปกเล็กกว่าบนใบแนบ เพราะหน้าปกใช้ฟอนต์ Sarabun ที่ฝังในไฟล์
 * ส่วนใบแนบยังใช้ AngsanaUPC ผ่าน HTML — Sarabun กว้างกว่าที่ขนาดเท่ากันราว 20%
 */
const COVER = {
  /** เลขประจำตัวผู้เสียภาษีของบริษัท — ช่องแรกเริ่มที่ x นี้ */
  taxIdBoxes: { x: 342, y: 204, width: 344 },
  companyName: { x: 88, y: 294, width: 640 },
  branchBoxes: { x: 574, y: 266, width: 111 },
  /* ที่อยู่แยกลงช่องย่อยของแบบพิมพ์ ไม่พิมพ์ทั้งก้อนทับป้าย */
  houseNo: { x: 128, y: 364, width: 150 },
  moo: { x: 338, y: 364, width: 60 },
  subDistrict: { x: 470, y: 397, width: 290 },
  district: { x: 176, y: 427, width: 210 },
  province: { x: 450, y: 427, width: 300 },
  postalBoxes: { x: 192, y: 462, width: 110 },
  buddhistYear: { x: 1094, y: 246 },
  /** ช่องติ๊กเดือน เรียงคอลัมน์ละ 3 เดือน */
  monthColumns: [713, 831, 949, 1066],
  monthRows: [293, 343, 394],
  normalFiling: { x: 182, y: 553 },
  attachmentTick: { x: 555, y: 649 },
  attachmentCount: { x: 1060, y: 648 },
  /** ตารางสรุป — บรรทัดที่ 1, 6 และ 8 เท่านั้นที่มีตัวเลขของเรา */
  summaryRows: { first: 872, total: 1172, grand: 1248 },
  summaryColumns: { count: 766, income: 940, tax: 1118 },
  filedOn: { day: 545, month: 596, year: 797, y: 1528 },
};

/* ---------------------------------------------------------------
   พิกัดบนใบแนบ
   --------------------------------------------------------------- */
const SHEET = {
  taxIdBoxes: { x: 652, y: 58, width: 262 },
  branchBoxes: { x: 1130, y: 102, width: 74 },
  incomeTypeTick: { x: 140, y: 133 },
  sheetNo: { x: 1032, y: 196 },
  sheetTotal: { x: 1136, y: 196 },
  /** ตารางรายชื่อ */
  table: {
    /*
     * วัดจากเส้นตารางในภาพแบบพิมพ์จริง ไม่ใช่กะจากสายตา
     * แถวแรกเริ่มที่ 278 แถวสุดท้ายจบที่ 1541 · 21 แถว = 60.14 ต่อแถว
     * ถ้าใช้ค่าที่คลาดไปแม้แค่หนึ่งหน่วย พอถึงแถวท้าย ๆ ข้อความจะเลื่อนข้ามเส้น
     */
    firstRowTop: 278,
    rowHeight: 60.14,
    sequenceCenter: 74,
    idBoxes: { x: 116, width: 269 },
    firstName: { x: 132, width: 238 },
    lastName: { x: 432, width: 234 },
    paidOnCenter: 733,
    paidAmountRight: 950,
    taxRight: 1138,
    conditionCenter: 1180,
    /** ระยะจากขอบบนของแถวถึงบรรทัดเลขบัตร และบรรทัดชื่อ */
    idOffset: 13,
    nameOffset: 36,
  },
  totalRow: { y: 1552, paidRight: 950, taxRight: 1138 },
  filedOn: { day: 905, month: 1008, year: 1142, y: 1690 },
};

function pct(value: number, total: number) {
  return `${((value / total) * 100).toFixed(4)}%`;
}

/**
 * แปลงหน่วยพิกัดของภาพเป็นมิลลิเมตรบนกระดาษ A4
 *
 * ขนาดตัวอักษรใช้ % ไม่ได้ เพราะ CSS คิด font-size เป็น % ของฟอนต์ตัวแม่
 * ไม่ใช่ของขนาดหน้า ถ้าใช้ % ตัวอักษรจะเล็กจนอ่านไม่ออก
 * ภาพกว้าง 1240 ยาว 1754 มีสัดส่วนเท่ากับ A4 พอดี จึงใช้ตัวคูณเดียวได้ทั้งสองแกน
 */
const MM_PER_UNIT = 297 / PND1_FORM_HEIGHT;

function mm(value: number) {
  return `${(value * MM_PER_UNIT).toFixed(3)}mm`;
}

/** วางกล่องข้อความไว้ที่พิกัดหนึ่งบนภาพแบบพิมพ์ */
function place(
  x: number,
  y: number,
  text: string,
  options: {
    width?: number;
    align?: 'left' | 'center' | 'right';
    size?: number;
    bold?: boolean;
    letterSpacing?: number;
  } = {},
) {
  if (!text) return '';

  const { width, align = 'left', size = 27.5, bold, letterSpacing } = options;

  const style = [
    `left:${pct(x, PND1_FORM_WIDTH)}`,
    `top:${pct(y, PND1_FORM_HEIGHT)}`,
    width === undefined ? '' : `width:${pct(width, PND1_FORM_WIDTH)}`,
    `font-size:${mm(size)}`,
    `text-align:${align}`,
    bold ? 'font-weight:700' : '',
    letterSpacing === undefined ? '' : `letter-spacing:${mm(letterSpacing)}`,
  ]
    .filter(Boolean)
    .join(';');

  return `<div class="f" style="${style}">${escapeHtml(text)}</div>`;
}

/** เครื่องหมายถูกในช่องสี่เหลี่ยม */
function tick(x: number, y: number) {
  return `<div class="tick" style="left:${pct(x, PND1_FORM_WIDTH)};top:${pct(
    y,
    PND1_FORM_HEIGHT,
  )};font-size:${mm(26)}">&#10003;</div>`;
}

/**
 * วางเลข 13 หลักลงในช่องสี่เหลี่ยมเรียงกัน
 *
 * ช่องบนแบบพิมพ์แบ่งเป็นกลุ่ม 1-4-5-2-1 มีเส้นคั่นระหว่างกลุ่ม จึงคำนวณตำแหน่ง
 * ทีละหลักแทนที่จะใช้ letter-spacing ก้อนเดียว ไม่งั้นหลักท้าย ๆ จะเลื่อนออกนอกช่อง
 */
const ID_GROUPS = [1, 4, 5, 2, 1];

function placeIdDigits(
  x: number,
  y: number,
  width: number,
  digits: string,
  size: number,
) {
  if (!digits) return '';

  const boxCount = 13;
  const gapCount = ID_GROUPS.length - 1;
  /* ช่องว่างระหว่างกลุ่มกว้างราวหนึ่งในสามของช่องตัวเลข วัดจากภาพแบบพิมพ์ */
  const boxWidth = width / (boxCount + gapCount / 3);
  const gapWidth = boxWidth / 3;

  const cells: string[] = [];
  let cursor = x;
  let index = 0;

  for (const [groupIndex, groupSize] of ID_GROUPS.entries()) {
    for (let i = 0; i < groupSize; i += 1) {
      const digit = digits[index] ?? '';
      index += 1;

      if (digit) {
        cells.push(
          place(cursor, y, digit, {
            width: boxWidth,
            align: 'center',
            size,
          }),
        );
      }

      cursor += boxWidth;
    }

    if (groupIndex < gapCount) cursor += gapWidth;
  }

  return cells.join('');
}

/** ตัวเลขเรียงลงช่องแบบเดียวกันแต่ไม่มีเส้นคั่นกลุ่ม (สาขาที่ / รหัสไปรษณีย์) */
function placePlainDigits(
  x: number,
  y: number,
  width: number,
  digits: string,
  size: number,
) {
  if (!digits) return '';

  const boxWidth = width / digits.length;

  return digits
    .split('')
    .map((digit, index) =>
      place(x + index * boxWidth, y, digit, {
        width: boxWidth,
        align: 'center',
        size,
      }),
    )
    .join('');
}

/**
 * หน้าปก ภ.ง.ด.1 — ปั๊มลงบนแบบพิมพ์ฉบับทางการของกรมสรรพากร (เวกเตอร์)
 *
 * ใช้ระบบพิกัดชุดเดียวกับใบแนบ (1240 x 1754) ตัวปั๊มแปลงเป็นหน่วย point ให้เอง
 * จึงยกตำแหน่งที่วัดไว้ตอนใช้ภาพสแกนมาใช้ต่อได้ทั้งหมด
 */
async function buildCoverPdf(form: Pnd1Form) {
  const { company, totals } = form;

  const stamp = await FormStamp.create(RD_PND1_COVER_TEMPLATE);
  const page = stamp.addPage();

  page.idDigits(
    COVER.taxIdBoxes.x,
    COVER.taxIdBoxes.y,
    COVER.taxIdBoxes.width,
    company.taxId,
    21,
  );
  page.text(COVER.companyName.x, COVER.companyName.y, company.name, {
    width: COVER.companyName.width,
    size: 24,
  });
  page.plainDigits(
    COVER.branchBoxes.x,
    COVER.branchBoxes.y,
    COVER.branchBoxes.width,
    company.branchNo,
    21,
  );

  page.text(COVER.houseNo.x, COVER.houseNo.y, company.addressParts.houseNo, {
    width: COVER.houseNo.width,
    size: 22,
  });
  page.text(COVER.moo.x, COVER.moo.y, company.addressParts.moo, {
    width: COVER.moo.width,
    size: 22,
  });
  page.text(
    COVER.subDistrict.x,
    COVER.subDistrict.y,
    company.addressParts.subDistrict,
    { width: COVER.subDistrict.width, size: 22 },
  );
  page.text(COVER.district.x, COVER.district.y, company.addressParts.district, {
    width: COVER.district.width,
    size: 22,
  });
  page.text(COVER.province.x, COVER.province.y, company.addressParts.province, {
    width: COVER.province.width,
    size: 22,
  });
  page.plainDigits(
    COVER.postalBoxes.x,
    COVER.postalBoxes.y,
    COVER.postalBoxes.width,
    company.postalCode,
    21,
  );

  page.text(
    COVER.buddhistYear.x,
    COVER.buddhistYear.y,
    String(form.buddhistYear || ''),
    { size: 24 },
  );

  /* เดือนเรียงคอลัมน์ละ 3 เดือน — เดือน 1-3 คอลัมน์แรก 4-6 คอลัมน์ที่สอง */
  const monthIndex = form.month - 1;
  if (monthIndex >= 0 && monthIndex < 12) {
    page.tick(
      COVER.monthColumns[Math.floor(monthIndex / 3)],
      COVER.monthRows[monthIndex % 3],
    );
  }

  page.tick(COVER.normalFiling.x, COVER.normalFiling.y);
  page.tick(COVER.attachmentTick.x, COVER.attachmentTick.y);
  page.text(
    COVER.attachmentCount.x,
    COVER.attachmentCount.y,
    String(form.attachments.length),
    { width: 46, align: 'center', size: 23 },
  );

  /* ตารางสรุป — บรรทัด 1 (เงินได้ 40(1) ทั่วไป), บรรทัด 6 (รวม), บรรทัด 8 (ยอดสุทธิ) */
  const summaryRow = (y: number, withCount: boolean, withIncome: boolean) => {
    if (withCount) {
      page.text(COVER.summaryColumns.count - 100, y, String(totals.count), {
        width: 100,
        align: 'right',
        size: 23,
      });
    }
    if (withIncome) {
      page.text(
        COVER.summaryColumns.income - 180,
        y,
        stampMoney(totals.paidAmount),
        { width: 180, align: 'right', size: 23 },
      );
    }
    page.text(
      COVER.summaryColumns.tax - 170,
      y,
      stampMoney(totals.taxWithheld),
      { width: 170, align: 'right', size: 23 },
    );
  };

  summaryRow(COVER.summaryRows.first, true, true);
  summaryRow(COVER.summaryRows.total, true, true);
  summaryRow(COVER.summaryRows.grand, false, false);

  page.text(
    COVER.filedOn.month,
    COVER.filedOn.y,
    THAI_MONTH_NAMES[monthIndex] ?? '',
    { width: 130, align: 'center', size: 22 },
  );
  page.text(
    COVER.filedOn.year,
    COVER.filedOn.y,
    String(form.buddhistYear || ''),
    { width: 95, align: 'center', size: 22 },
  );

  return stamp.save();
}

function renderPersonRow(row: Pnd1PersonRow, indexInSheet: number) {
  const { table } = SHEET;
  const top = table.firstRowTop + indexInSheet * table.rowHeight;

  return [
    place(
      table.sequenceCenter - 30,
      top + table.nameOffset,
      String(row.sequence),
      {
        width: 60,
        align: 'center',
        size: 26,
      },
    ),
    placeIdDigits(
      table.idBoxes.x,
      top + table.idOffset,
      table.idBoxes.width,
      row.identityNo,
      23,
    ),
    place(
      table.firstName.x,
      top + table.nameOffset,
      `${row.title}${row.firstName}`,
      { width: table.firstName.width, size: 26 },
    ),
    place(table.lastName.x, top + table.nameOffset, row.lastName, {
      width: table.lastName.width,
      size: 26,
    }),
    place(table.paidOnCenter - 60, top + table.nameOffset, row.paidOnText, {
      width: 120,
      align: 'center',
      size: 26,
    }),
    place(
      table.paidAmountRight - 150,
      top + table.nameOffset,
      pnd1Money(row.paidAmount),
      { width: 150, align: 'right', size: 26 },
    ),
    place(
      table.taxRight - 150,
      top + table.nameOffset,
      pnd1Money(row.taxWithheld),
      {
        width: 150,
        align: 'right',
        size: 26,
      },
    ),
    place(table.conditionCenter - 25, top + table.nameOffset, row.condition, {
      width: 50,
      align: 'center',
      size: 26,
    }),
  ].join('');
}

function renderAttachment(
  form: Pnd1Form,
  sheet: Pnd1Attachment,
  sheetCount: number,
) {
  return `
  <section class="page">
    <img class="bg" src="${PND1_ATTACHMENT_IMAGE}" alt="" />
    ${placeIdDigits(
      SHEET.taxIdBoxes.x,
      SHEET.taxIdBoxes.y,
      SHEET.taxIdBoxes.width,
      form.company.taxId,
      23,
    )}
    ${placePlainDigits(
      SHEET.branchBoxes.x,
      SHEET.branchBoxes.y,
      SHEET.branchBoxes.width,
      form.company.branchNo,
      23,
    )}
    ${tick(SHEET.incomeTypeTick.x, SHEET.incomeTypeTick.y)}
    ${place(SHEET.sheetNo.x, SHEET.sheetNo.y, String(sheet.sheetNo), { width: 50, align: 'center', size: 26 })}
    ${place(SHEET.sheetTotal.x, SHEET.sheetTotal.y, String(sheetCount), { width: 50, align: 'center', size: 26 })}
    ${sheet.rows.map((row, index) => renderPersonRow(row, index)).join('')}
    ${place(SHEET.totalRow.paidRight - 150, SHEET.totalRow.y, pnd1Money(sheet.paidAmount), { width: 150, align: 'right', size: 26, bold: true })}
    ${place(SHEET.totalRow.taxRight - 150, SHEET.totalRow.y, pnd1Money(sheet.taxWithheld), { width: 150, align: 'right', size: 26, bold: true })}
    ${place(SHEET.filedOn.month, SHEET.filedOn.y, THAI_MONTH_NAMES[form.month - 1] ?? '', { width: 120, align: 'center', size: 26 })}
    ${place(SHEET.filedOn.year, SHEET.filedOn.y, String(form.buddhistYear || ''), { width: 80, align: 'center', size: 26 })}
  </section>`;
}

export function buildPnd1FormHtml(form: Pnd1Form) {
  const sheetCount = form.attachments.length;

  /*
   * HTML นี้เหลือแค่ใบแนบ — หน้าปกย้ายไปปั๊มบนแบบพิมพ์เวกเตอร์ของกรมสรรพากรแล้ว
   * (ดู buildCoverPdf) สองส่วนถูกเย็บรวมกันตอนท้ายใน generatePnd1FormPdf
   */
  const pages = form.attachments
    .map((sheet) => renderAttachment(form, sheet, sheetCount))
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>ภ.ง.ด.1 เดือน ${form.month}/${form.buddhistYear}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }

    * { box-sizing: border-box; }

    /*
     * ไฟล์ตัวอย่างของลูกค้าฝัง AngsanaUPC ไว้ทุกหน้า จึงใช้ตัวเดียวกันให้หน้าตาตรงกัน
     * Angsana ตัวเล็กกว่า Sarabun มากที่ขนาดเท่ากัน ขนาดในตาราง COVER/SHEET จึงตั้ง
     * ไว้ใหญ่กว่าที่เคยใช้ตอนยังเป็น Sarabun ถ้าเปลี่ยนฟอนต์ต้องปรับขนาดตามด้วย
     */
    body {
      margin: 0;
      font-family: "Angsana New", "AngsanaUPC", "TH Sarabun New", "Sarabun",
        "Leelawadee UI", "Tahoma", sans-serif;
      color: #101828;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      position: relative;
      width: 210mm;
      height: 297mm;
      overflow: hidden;
      page-break-after: always;
    }

    .page:last-child { page-break-after: auto; }

    /* ภาพแบบพิมพ์เปล่าเป็นพื้นหลัง ข้อมูลทุกชิ้นวางทับด้วยตำแหน่งสัมบูรณ์ */
    .bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
    }

    .f {
      position: absolute;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
    }

    .tick {
      position: absolute;
      line-height: 1;
      font-weight: 700;
      /* Angsana ไม่มีอักขระเครื่องหมายถูก ต้องยืมจากฟอนต์สัญลักษณ์ */
      font-family: "Segoe UI Symbol", "Tahoma", sans-serif;
    }
  </style>
</head>
<body>
  ${pages}
</body>
</html>`;
}

function getChromeExecutablePath() {
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}

export async function generatePnd1FormPdf(
  form: Pnd1Form,
): Promise<Pnd1FormFile> {
  /*
   * เอกสารประกอบด้วยสองส่วนที่สร้างคนละทาง แล้วเย็บรวมเป็นไฟล์เดียว
   *   หน้าปก  ปั๊มบนแบบพิมพ์ฉบับทางการ (เวกเตอร์) ด้วย pdf-lib
   *   ใบแนบ   ยังพิมพ์ทับภาพสแกน 21 บรรทัด/แผ่น ด้วย Puppeteer
   * ใบแนบยังไม่เปลี่ยนเพราะฉบับทางการเป็นแนวนอน 8 บรรทัด/แผ่น ซึ่งเป็นคนละรูปเล่ม
   */
  const coverBytes = await buildCoverPdf(form);
  const attachmentBytes = await renderAttachmentsPdf(form);

  const doc = await PDFDocument.load(coverBytes);
  const attachments = await PDFDocument.load(attachmentBytes);
  const pages = await doc.copyPages(attachments, attachments.getPageIndices());
  pages.forEach((page) => doc.addPage(page));

  const monthPart = String(form.month).padStart(2, '0');

  return {
    buffer: Buffer.from(await doc.save({ useObjectStreams: true })),
    fileName: `pnd1-${form.gregorianYear}-${monthPart}.pdf`,
    mimeType: 'application/pdf',
  };
}

/** เรนเดอร์เฉพาะใบแนบเป็น PDF ก้อนหนึ่ง ไว้เย็บต่อท้ายหน้าปก */
async function renderAttachmentsPdf(form: Pnd1Form) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildPnd1FormHtml(form), { waitUntil: 'load' });

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
