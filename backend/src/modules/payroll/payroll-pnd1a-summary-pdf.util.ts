import { RD_PND1A_SUMMARY_TEMPLATE } from './rd-form-template.asset';
import { FormStamp, stampMoney } from './utils/payroll-pdf-stamp.util';
import type { Pnd1aForm } from './utils/payroll-pnd1a-form.util';

/**
 * ใบสรุป ภ.ง.ด.1ก — แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย ประจำปี
 * -----------------------------------------------------------------------------
 * หน้าเดียว ปั๊มลงบนแบบพิมพ์ฉบับทางการของกรมสรรพากร (เวกเตอร์ ดู rd-form-template.asset.ts)
 *
 * ต่างจากหน้าปกของ ภ.ง.ด.1 ตรงที่
 *   ไม่มีช่องติ๊กเดือน  ใช้ช่อง "ประจำปีภาษี" แทน
 *   ตารางสรุปมี 6 บรรทัด ไม่มีบรรทัดเงินเพิ่มกับยอดรวมสุทธิ
 *   ช่อง "ยื่นวันที่" เติมจากวันที่ออกเอกสารที่ผู้ใช้เลือกตอนสั่งพิมพ์
 *
 * พิกัดทั้งหมดอยู่ในตาราง SUMMARY ที่เดียว แก้ตำแหน่งให้แก้ที่นั่น
 */

export type Pnd1aFormFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

const SUMMARY = {
  taxIdBoxes: { x: 355, y: 234, width: 336 },
  branchBoxes: { x: 588, y: 298, width: 108 },
  companyName: { x: 112, y: 320, width: 560 },
  houseNo: { x: 155, y: 398, width: 130 },
  moo: { x: 350, y: 398, width: 50 },
  subDistrict: { x: 468, y: 427, width: 215 },
  district: { x: 196, y: 456, width: 158 },
  province: { x: 458, y: 456, width: 216 },
  postalBoxes: { x: 224, y: 484, width: 106 },
  /** ปีภาษีบนกล่องขวา */
  taxYear: { x: 1062, y: 282, width: 100 },
  normalFiling: { x: 732, y: 414 },
  attachmentTick: { x: 542, y: 699 },
  attachmentCount: { x: 1045, y: 701, width: 60 },
  /** ตารางสรุป — ใช้แค่บรรทัด 1 (เงินได้ 40(1) ทั่วไป) และบรรทัด 6 (รวม) */
  rows: { first: 916, total: 1197 },
  columns: { count: 762, income: 946, tax: 1136 },
  filedOn: { day: 478, month: 598, year: 748, y: 1452 },
};

/*
 * ขนาดตัวอักษรตั้งไว้สำหรับฟอนต์ Sarabun ที่ฝังในไฟล์ ซึ่งกว้างกว่า AngsanaUPC
 * ที่เคยใช้ผ่าน HTML ราว 20% ถ้าเปลี่ยนฟอนต์ต้องปรับตัวเลขในตาราง SUMMARY ตาม
 */
export async function generatePnd1aSummaryPdf(
  form: Pnd1aForm,
): Promise<Pnd1aFormFile> {
  const { company, totals, issuedOn } = form;

  const stamp = await FormStamp.create(RD_PND1A_SUMMARY_TEMPLATE);
  const page = stamp.addPage();

  page.idDigits(
    SUMMARY.taxIdBoxes.x,
    SUMMARY.taxIdBoxes.y,
    SUMMARY.taxIdBoxes.width,
    company.taxId,
    21,
  );
  page.plainDigits(
    SUMMARY.branchBoxes.x,
    SUMMARY.branchBoxes.y,
    SUMMARY.branchBoxes.width,
    company.branchNo,
    21,
  );
  page.text(SUMMARY.companyName.x, SUMMARY.companyName.y, company.name, {
    width: SUMMARY.companyName.width,
    size: 22,
  });

  page.text(
    SUMMARY.houseNo.x,
    SUMMARY.houseNo.y,
    company.addressParts.houseNo,
    {
      width: SUMMARY.houseNo.width,
      size: 20,
    },
  );
  page.text(SUMMARY.moo.x, SUMMARY.moo.y, company.addressParts.moo, {
    width: SUMMARY.moo.width,
    size: 20,
  });
  page.text(
    SUMMARY.subDistrict.x,
    SUMMARY.subDistrict.y,
    company.addressParts.subDistrict,
    { width: SUMMARY.subDistrict.width, size: 20 },
  );
  page.text(
    SUMMARY.district.x,
    SUMMARY.district.y,
    company.addressParts.district,
    { width: SUMMARY.district.width, size: 20 },
  );
  page.text(
    SUMMARY.province.x,
    SUMMARY.province.y,
    company.addressParts.province,
    { width: SUMMARY.province.width, size: 20 },
  );
  page.plainDigits(
    SUMMARY.postalBoxes.x,
    SUMMARY.postalBoxes.y,
    SUMMARY.postalBoxes.width,
    company.postalCode,
    21,
  );

  page.text(
    SUMMARY.taxYear.x,
    SUMMARY.taxYear.y,
    String(form.buddhistYear || ''),
    { width: SUMMARY.taxYear.width, size: 22 },
  );

  page.tick(SUMMARY.normalFiling.x, SUMMARY.normalFiling.y);
  page.tick(SUMMARY.attachmentTick.x, SUMMARY.attachmentTick.y);
  page.text(
    SUMMARY.attachmentCount.x,
    SUMMARY.attachmentCount.y,
    String(form.attachments.length),
    { width: SUMMARY.attachmentCount.width, align: 'center', size: 21 },
  );

  /* ตารางสรุป — บรรทัด 1 (เงินได้ 40(1) ทั่วไป) และบรรทัด 6 (รวม) */
  for (const y of [SUMMARY.rows.first, SUMMARY.rows.total]) {
    page.text(SUMMARY.columns.count - 100, y, String(totals.count), {
      width: 100,
      align: 'right',
      size: 21,
    });
    page.text(SUMMARY.columns.income - 170, y, stampMoney(totals.paidAmount), {
      width: 170,
      align: 'right',
      size: 21,
    });
    page.text(SUMMARY.columns.tax - 170, y, stampMoney(totals.taxWithheld), {
      width: 170,
      align: 'right',
      size: 21,
    });
  }

  if (issuedOn) {
    page.text(SUMMARY.filedOn.day, SUMMARY.filedOn.y, String(issuedOn.day), {
      width: 40,
      align: 'center',
      size: 20,
    });
    page.text(SUMMARY.filedOn.month, SUMMARY.filedOn.y, issuedOn.monthName, {
      width: 110,
      align: 'center',
      size: 20,
    });
    page.text(
      SUMMARY.filedOn.year,
      SUMMARY.filedOn.y,
      String(issuedOn.buddhistYear),
      { width: 90, align: 'center', size: 20 },
    );
  }

  return {
    buffer: await stamp.save(),
    fileName: `pnd1a-summary-${form.buddhistYear}.pdf`,
    mimeType: 'application/pdf',
  };
}

/* ทิ้งท้าย: ตัวเก่าที่ใช้ HTML + ภาพสแกนถูกแทนที่ด้วยการปั๊มบนเทมเพลตเวกเตอร์แล้ว */
