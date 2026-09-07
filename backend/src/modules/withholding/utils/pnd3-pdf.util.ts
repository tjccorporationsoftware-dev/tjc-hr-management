import { PDFDocument } from 'pdf-lib';

import {
  FormStamp,
  stampMoney,
  type StampedPage,
} from '../../payroll/utils/payroll-pdf-stamp.util';
import { THAI_MONTH_NAMES } from '../../payroll/utils/payroll-pnd1-form.util';
import {
  RD_PND3_ATTACHMENT_TEMPLATE,
  RD_PND3_COVER_TEMPLATE,
} from '../rd-pnd3-template.asset';
import type {
  Pnd3Attachment,
  Pnd3Form,
  Pnd3PaymentRow,
} from './pnd3-form.util';

/**
 * แบบ ภ.ง.ด.3 ฉบับพิมพ์
 * -----------------------------------------------------------------------------
 * ปั๊มลงบนแบบพิมพ์ฉบับทางการของกรมสรรพากร (เวกเตอร์) วิธีเดียวกับ ภ.ง.ด.1
 *
 *   หน้า 1      หน้าปก — ข้อมูลผู้จ่าย เดือนที่จ่าย และตารางสรุป 4 บรรทัด
 *   หน้า 2..N   ใบแนบ **แนวนอน** 6 บรรทัด/แผ่น
 *
 * หน้าปกกับใบแนบคนละแนวกัน ระบบพิกัดจึงคนละชุด — หน้าปกใช้ 1240x1754
 * ใบแนบใช้ 1754x1240 ตัวปั๊มสลับให้เองตามสัดส่วนหน้า
 */

export type Pnd3FormFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

/** พิกัดบนหน้าปก (หน่วยพิกเซลของภาพ A4 แนวตั้ง 1240 x 1754) */
const COVER = {
  taxIdBoxes: { x: 320, y: 203, width: 332 },
  branchBoxes: { x: 559, y: 269, width: 117 },
  companyName: { x: 100, y: 297, width: 560 },
  houseNo: { x: 118, y: 360, width: 145 },
  moo: { x: 322, y: 360, width: 55 },
  subDistrict: { x: 440, y: 393, width: 230 },
  district: { x: 163, y: 426, width: 195 },
  province: { x: 440, y: 426, width: 230 },
  postalBoxes: { x: 179, y: 463, width: 111 },
  buddhistYear: { x: 1105, y: 254 },
  monthColumns: [696, 817, 933, 1047],
  monthRows: [293, 343, 393],
  normalFiling: { x: 166, y: 548 },
  /** "นำส่งภาษีตาม (1) มาตรา 3 เตรส" — งานจ้างทำของ/บริการทั่วไปใช้ข้อนี้ */
  remitSection3: { x: 258, y: 635 },
  attachmentTick: { x: 559, y: 703 },
  /** หน้าปกแยกสองช่อง — "ราย" นับหัวคน "แผ่น" นับใบแนบ */
  attachmentPayees: { x: 1046, y: 712, width: 76 },
  attachmentSheets: { x: 1046, y: 748, width: 76 },
  /** ตารางสรุป 4 บรรทัด — ใช้บรรทัด 1, 2 และ 4 */
  rows: { income: 1038, tax: 1077, grand: 1155 },
  amountRight: 1078,
  filedOn: { day: 498, month: 596, year: 790, y: 1432 },
};

/** พิกัดบนใบแนบ (หน่วยพิกเซลของภาพ A4 แนวนอน 1754 x 1240) */
const SHEET = {
  taxIdBoxes: { x: 793, y: 30, width: 334 },
  branchBoxes: { x: 1617, y: 28, width: 125 },
  sheetNo: { x: 1440, y: 70, width: 65 },
  sheetTotal: { x: 1588, y: 70, width: 70 },
  table: {
    /* วัดจากเส้นตารางจริงบนแบบพิมพ์ 6 บรรทัด/แผ่น */
    firstRowTop: 221,
    rowHeight: 119.5,
    sequenceCenter: 71,
    idBoxes: { x: 114, width: 371 },
    payeeBranch: { x: 570, width: 129 },
    firstName: { x: 166, width: 316 },
    lastName: { x: 579, width: 231 },
    address: { x: 164, width: 643 },
    paidOnCenter: 882,
    incomeType: { x: 955, width: 225 },
    rateCenter: 1207,
    amountRight: 1470,
    taxRight: 1680,
    conditionCenter: 1722,
    /** ระยะจากขอบบนของแถวถึงแต่ละบรรทัดย่อย */
    idOffset: 12,
    nameOffset: 55,
    addressOffset: 88,
  },
  totalRow: { y: 940, amountRight: 1470, taxRight: 1680 },
  filedOn: { day: 1258, month: 1345, year: 1520, y: 1150 },
};

function stampCover(page: StampedPage, form: Pnd3Form) {
  const { company, totals, issuedOn } = form;

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

  const monthIndex = form.month - 1;
  if (monthIndex >= 0 && monthIndex < 12) {
    page.tick(
      COVER.monthColumns[Math.floor(monthIndex / 3)],
      COVER.monthRows[monthIndex % 3],
    );
  }

  page.tick(COVER.normalFiling.x, COVER.normalFiling.y);
  page.tick(COVER.remitSection3.x, COVER.remitSection3.y);
  page.tick(COVER.attachmentTick.x, COVER.attachmentTick.y);

  /* หน้าปกแยกสองช่อง — จำนวน "ราย" นับหัวคน จำนวน "แผ่น" นับใบแนบ */
  page.text(
    COVER.attachmentPayees.x,
    COVER.attachmentPayees.y,
    String(totals.payeeCount),
    { width: COVER.attachmentPayees.width, align: 'center', size: 22 },
  );
  page.text(
    COVER.attachmentSheets.x,
    COVER.attachmentSheets.y,
    String(form.attachments.length),
    { width: COVER.attachmentSheets.width, align: 'center', size: 22 },
  );

  page.text(
    COVER.amountRight - 180,
    COVER.rows.income,
    stampMoney(totals.amount),
    { width: 180, align: 'right', size: 23 },
  );
  page.text(
    COVER.amountRight - 180,
    COVER.rows.tax,
    stampMoney(totals.taxAmount),
    { width: 180, align: 'right', size: 23 },
  );
  /* บรรทัด 4 = ยอดภาษี + เงินเพิ่ม ระบบไม่มีเงินเพิ่มจึงเท่ากับบรรทัด 2 */
  page.text(
    COVER.amountRight - 180,
    COVER.rows.grand,
    stampMoney(totals.taxAmount),
    { width: 180, align: 'right', size: 23 },
  );

  if (issuedOn) {
    page.text(COVER.filedOn.day, COVER.filedOn.y, String(issuedOn.day), {
      width: 40,
      align: 'center',
      size: 22,
    });
    page.text(COVER.filedOn.month, COVER.filedOn.y, issuedOn.monthName, {
      width: 130,
      align: 'center',
      size: 22,
    });
    page.text(
      COVER.filedOn.year,
      COVER.filedOn.y,
      String(issuedOn.buddhistYear),
      { width: 95, align: 'center', size: 22 },
    );
  } else {
    /* ไม่ระบุวันที่ก็ยังพิมพ์เดือนของงวดไว้ให้ ผู้เซ็นจะได้ไม่ต้องเขียนเอง */
    page.text(
      COVER.filedOn.month,
      COVER.filedOn.y,
      THAI_MONTH_NAMES[monthIndex] ?? '',
      { width: 130, align: 'center', size: 22 },
    );
  }
}

function stampRow(
  page: StampedPage,
  row: Pnd3PaymentRow,
  indexInSheet: number,
) {
  const { table } = SHEET;
  const top = table.firstRowTop + indexInSheet * table.rowHeight;

  page.text(
    table.sequenceCenter - 30,
    top + table.nameOffset,
    String(row.sequence),
    { width: 60, align: 'center', size: 20 },
  );
  page.idDigits(
    table.idBoxes.x,
    top + table.idOffset,
    table.idBoxes.width,
    row.identityNo,
    18,
  );
  page.plainDigits(
    table.payeeBranch.x,
    top + table.idOffset,
    table.payeeBranch.width,
    row.branchNo,
    18,
  );

  page.text(
    table.firstName.x,
    top + table.nameOffset,
    `${row.title}${row.firstName}`.trim() || row.fullName,
    { width: table.firstName.width, size: 19 },
  );
  page.text(table.lastName.x, top + table.nameOffset, row.lastName, {
    width: table.lastName.width,
    size: 19,
  });
  page.text(table.address.x, top + table.addressOffset, row.address, {
    width: table.address.width,
    size: 17,
  });

  page.text(table.paidOnCenter - 60, top + table.nameOffset, row.paidOnText, {
    width: 120,
    align: 'center',
    size: 18,
  });
  page.text(table.incomeType.x, top + table.nameOffset, row.incomeTypeLabel, {
    width: table.incomeType.width,
    size: 18,
  });
  page.text(table.rateCenter - 30, top + table.nameOffset, row.taxRateText, {
    width: 60,
    align: 'center',
    size: 18,
  });
  page.text(
    table.amountRight - 130,
    top + table.nameOffset,
    stampMoney(row.amount),
    { width: 130, align: 'right', size: 18 },
  );
  page.text(
    table.taxRight - 120,
    top + table.nameOffset,
    stampMoney(row.taxAmount),
    { width: 120, align: 'right', size: 18 },
  );
  page.text(table.conditionCenter - 20, top + table.nameOffset, row.condition, {
    width: 40,
    align: 'center',
    size: 18,
  });
}

function stampSheet(
  page: StampedPage,
  form: Pnd3Form,
  sheet: Pnd3Attachment,
  sheetCount: number,
) {
  page.idDigits(
    SHEET.taxIdBoxes.x,
    SHEET.taxIdBoxes.y,
    SHEET.taxIdBoxes.width,
    form.company.taxId,
    18,
  );
  page.plainDigits(
    SHEET.branchBoxes.x,
    SHEET.branchBoxes.y,
    SHEET.branchBoxes.width,
    form.company.branchNo,
    18,
  );
  page.text(SHEET.sheetNo.x, SHEET.sheetNo.y, String(sheet.sheetNo), {
    width: SHEET.sheetNo.width,
    align: 'center',
    size: 19,
  });
  page.text(SHEET.sheetTotal.x, SHEET.sheetTotal.y, String(sheetCount), {
    width: SHEET.sheetTotal.width,
    align: 'center',
    size: 19,
  });

  sheet.rows.forEach((row, index) => stampRow(page, row, index));

  page.text(
    SHEET.totalRow.amountRight - 130,
    SHEET.totalRow.y,
    stampMoney(sheet.amount),
    { width: 130, align: 'right', size: 19 },
  );
  page.text(
    SHEET.totalRow.taxRight - 120,
    SHEET.totalRow.y,
    stampMoney(sheet.taxAmount),
    { width: 120, align: 'right', size: 19 },
  );

  if (form.issuedOn) {
    page.text(SHEET.filedOn.day, SHEET.filedOn.y, String(form.issuedOn.day), {
      width: 40,
      align: 'center',
      size: 18,
    });
    page.text(SHEET.filedOn.month, SHEET.filedOn.y, form.issuedOn.monthName, {
      width: 115,
      align: 'center',
      size: 18,
    });
    page.text(
      SHEET.filedOn.year,
      SHEET.filedOn.y,
      String(form.issuedOn.buddhistYear),
      { width: 140, align: 'center', size: 18 },
    );
  }
}

export async function generatePnd3FormPdf(
  form: Pnd3Form,
): Promise<Pnd3FormFile> {
  /*
   * หน้าปกกับใบแนบคนละแนวกระดาษ จึงปั๊มแยกกันสองเอกสารแล้วเย็บรวม
   * pdf-lib รองรับหน้าคนละขนาดในไฟล์เดียวอยู่แล้ว
   */
  const cover = await FormStamp.create(RD_PND3_COVER_TEMPLATE);
  stampCover(cover.addPage(), form);
  const coverBytes = await cover.save();

  const doc = await PDFDocument.load(coverBytes);

  if (form.attachments.length > 0) {
    const sheets = await FormStamp.create(RD_PND3_ATTACHMENT_TEMPLATE);
    form.attachments.forEach((sheet) =>
      stampSheet(sheets.addPage(), form, sheet, form.attachments.length),
    );

    const attachments = await PDFDocument.load(await sheets.save());
    const pages = await doc.copyPages(
      attachments,
      attachments.getPageIndices(),
    );
    pages.forEach((page) => doc.addPage(page));
  }

  const monthPart = String(form.month).padStart(2, '0');

  return {
    buffer: Buffer.from(await doc.save({ useObjectStreams: true })),
    fileName: `pnd3-${form.gregorianYear}-${monthPart}.pdf`,
    mimeType: 'application/pdf',
  };
}
