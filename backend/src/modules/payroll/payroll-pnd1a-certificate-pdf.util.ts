import { formatBahtText } from './payroll-document.util';
import { RD_CERTIFICATE_TEMPLATE } from './rd-form-template.asset';
import {
  FormStamp,
  stampMoney,
  type StampedPage,
} from './utils/payroll-pdf-stamp.util';
import type {
  Pnd1aForm,
  Pnd1aPersonRow,
} from './utils/payroll-pnd1a-form.util';
import type { Pnd1aFormFile } from './payroll-pnd1a-summary-pdf.util';

/**
 * หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
 * -----------------------------------------------------------------------------
 * ปั๊มลงบนแบบพิมพ์ฉบับทางการของกรมสรรพากร (เวกเตอร์ ดู rd-form-template.asset.ts)
 * ปั๊มลงบนแบบพิมพ์ฉบับทางการของกรมสรรพากร (เวกเตอร์ ดู rd-form-template.asset.ts)
 * ออกให้พนักงานคนละหนึ่งหน้า แนบไปกับ ภ.ง.ด.1ก และให้พนักงานเก็บไว้ยื่นภาษีเอง
 * ยอดของทุกใบรวมกันต้องเท่ากับใบสรุป ภ.ง.ด.1ก ของปีเดียวกัน
 *
 * ช่องเงินได้ใช้บรรทัดที่ 1 (เงินเดือน ค่าจ้าง ตามมาตรา 40(1)) บรรทัดเดียว
 * เพราะระบบจ่ายเฉพาะเงินเดือนพนักงาน ไม่มีเงินได้ประเภทอื่น
 *
 * ช่อง "เงินที่จ่ายเข้ากองทุน" เว้นว่างไว้ — ระบบยังไม่ได้รวมยอดสะสมทั้งปีของ
 * ประกันสังคมมาที่รายงานนี้ ปล่อยว่างดีกว่าพิมพ์ 0.00 ทั้งที่พนักงานจ่ายจริง
 */

/** พิกัดบนแบบ 50 ทวิ (หน่วยเป็นพิกเซลของภาพ 1240 x 1754) */
const CERT = {
  payer: {
    taxIdBoxes: { x: 782, y: 180, width: 376 },
    name: { x: 122, y: 222, width: 620 },
    address: { x: 122, y: 262, width: 1030 },
  },
  payee: {
    taxIdBoxes: { x: 782, y: 324, width: 376 },
    name: { x: 122, y: 366, width: 620 },
    address: { x: 122, y: 418, width: 1030 },
  },
  sequence: { x: 198, y: 482, width: 88 },
  /** ติ๊ก "(1) ภ.ง.ด.1ก" */
  formTick: { x: 441, y: 481 },
  /** บรรทัดที่ 1 ของตาราง — เงินเดือน ค่าจ้าง ตามมาตรา 40 (1) */
  incomeRow: {
    y: 620,
    yearCenter: 760,
    paidRight: 980,
    taxRight: 1136,
  },
  totalRow: { y: 1352, paidRight: 980, taxRight: 1136 },
  /** ยอดภาษีเป็นตัวอักษร วางกลางแถบสีเทา */
  bahtText: { x: 390, y: 1398, width: 770 },
  /** ติ๊ก "(1) หัก ณ ที่จ่าย" ในบรรทัดผู้จ่ายเงิน */
  withholdTick: { x: 180, y: 1478 },
  issuedOn: { day: 700, month: 782, year: 900, y: 1576 },
};

/*
 * ขนาดตัวอักษรตั้งไว้สำหรับ Sarabun ที่ฝังในไฟล์ ซึ่งกว้างกว่า AngsanaUPC ราว 20%
 * เทมเพลตถูกฝังครั้งเดียวแล้ววาดซ้ำทุกหน้า ไฟล์จึงไม่บวมตามจำนวนพนักงาน
 */
function stampCertificate(
  page: StampedPage,
  form: Pnd1aForm,
  person: Pnd1aPersonRow,
  employeeIndex: number,
) {
  const { company, issuedOn } = form;

  page.idDigits(
    CERT.payer.taxIdBoxes.x,
    CERT.payer.taxIdBoxes.y,
    CERT.payer.taxIdBoxes.width,
    company.taxId,
    18,
  );
  page.text(CERT.payer.name.x, CERT.payer.name.y, company.name, {
    width: CERT.payer.name.width,
    size: 19,
  });
  page.text(CERT.payer.address.x, CERT.payer.address.y, company.address, {
    width: CERT.payer.address.width,
    size: 17,
  });

  page.idDigits(
    CERT.payee.taxIdBoxes.x,
    CERT.payee.taxIdBoxes.y,
    CERT.payee.taxIdBoxes.width,
    person.identityNo,
    18,
  );
  page.text(CERT.payee.name.x, CERT.payee.name.y, person.fullName, {
    width: CERT.payee.name.width,
    size: 19,
  });
  page.text(CERT.payee.address.x, CERT.payee.address.y, person.address, {
    width: CERT.payee.address.width,
    size: 17,
  });

  page.text(CERT.sequence.x, CERT.sequence.y, String(employeeIndex + 1), {
    width: CERT.sequence.width,
    align: 'center',
    size: 18,
  });
  page.tick(CERT.formTick.x, CERT.formTick.y, 18);

  page.text(
    CERT.incomeRow.yearCenter - 70,
    CERT.incomeRow.y,
    String(form.buddhistYear || ''),
    { width: 140, align: 'center', size: 18 },
  );
  page.text(
    CERT.incomeRow.paidRight - 140,
    CERT.incomeRow.y,
    stampMoney(person.paidAmount),
    { width: 140, align: 'right', size: 18 },
  );
  page.text(
    CERT.incomeRow.taxRight - 130,
    CERT.incomeRow.y,
    stampMoney(person.taxWithheld),
    { width: 130, align: 'right', size: 18 },
  );

  page.text(
    CERT.totalRow.paidRight - 140,
    CERT.totalRow.y,
    stampMoney(person.paidAmount),
    { width: 140, align: 'right', size: 18 },
  );
  page.text(
    CERT.totalRow.taxRight - 130,
    CERT.totalRow.y,
    stampMoney(person.taxWithheld),
    { width: 130, align: 'right', size: 18 },
  );
  page.text(
    CERT.bahtText.x,
    CERT.bahtText.y,
    formatBahtText(person.taxWithheld),
    { width: CERT.bahtText.width, align: 'center', size: 18 },
  );

  page.tick(CERT.withholdTick.x, CERT.withholdTick.y, 18);

  if (issuedOn) {
    page.text(CERT.issuedOn.day, CERT.issuedOn.y, String(issuedOn.day), {
      width: 56,
      align: 'center',
      size: 18,
    });
    page.text(CERT.issuedOn.month, CERT.issuedOn.y, issuedOn.monthName, {
      width: 106,
      align: 'center',
      size: 18,
    });
    page.text(
      CERT.issuedOn.year,
      CERT.issuedOn.y,
      String(issuedOn.buddhistYear),
      { width: 74, align: 'center', size: 18 },
    );
  }
}

export async function generatePnd1aCertificatePdf(
  form: Pnd1aForm,
): Promise<Pnd1aFormFile> {
  const stamp = await FormStamp.create(RD_CERTIFICATE_TEMPLATE);

  form.rows.forEach((person, index) => {
    stampCertificate(stamp.addPage(), form, person, index);
  });

  return {
    buffer: await stamp.save(),
    fileName: `50-tawi-${form.buddhistYear}.pdf`,
    mimeType: 'application/pdf',
  };
}
