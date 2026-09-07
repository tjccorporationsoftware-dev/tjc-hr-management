import {
  PND1_FILING_FORM_CODE,
  type Pnd1Form,
  type Pnd1PersonRow,
} from './payroll-pnd1-form.util';

/**
 * ไฟล์นำส่ง ภ.ง.ด.1 สำหรับระบบ e-Filing ของกรมสรรพากร
 * -----------------------------------------------------------------------------
 * ผังอ่านจากไฟล์ตัวอย่างของลูกค้าโดยตรง (docs/ข้อมูลรูปแบบไฟล์รายงาน/ภงด1)
 * หนึ่งบรรทัดต่อผู้มีเงินได้หนึ่งคน ไม่มีหัวไฟล์และไม่มีท้ายไฟล์
 *
 *   401N|00001|1349900469459|นางสาว|ณัฐพร||มาลาวงศ์|31/08/2569|26840.00|0.00|1
 *    1     2         3          4      5   6    7        8         9      10 11
 *
 *   1  รหัสแบบ            401N = มาตรา 40(1) ยื่นปกติ
 *   2  ลำดับที่           5 หลัก เติมศูนย์หน้า
 *   3  เลขประจำตัวผู้เสียภาษีของผู้มีเงินได้ (เลขบัตรประชาชน 13 หลัก)
 *   4  คำนำหน้าชื่อ
 *   5  ชื่อ
 *   6  ชื่อกลาง (ไฟล์ตัวอย่างว่างทุกบรรทัด)
 *   7  นามสกุล
 *   8  วันที่จ่าย dd/MM/yyyy พ.ศ.
 *   9  จำนวนเงินได้ ทศนิยม 2 ตำแหน่ง ไม่มีตัวคั่นหลักพัน
 *   10 ภาษีที่หัก ทศนิยม 2 ตำแหน่ง
 *   11 เงื่อนไขการหักภาษี (1 = หัก ณ ที่จ่าย)
 *
 * ต่างจากไฟล์ประกันสังคมสองเรื่องที่พลาดง่าย
 *   ประกันสังคม  ความกว้างคงที่ 135 ไบต์  เข้ารหัส TIS-620
 *   ภ.ง.ด.1      คั่นด้วย |  ความยาวไม่คงที่  เข้ารหัส **UTF-8**
 * ถ้าเผลอส่ง TIS-620 ให้ไฟล์นี้ ชื่อภาษาไทยจะเพี้ยนทั้งไฟล์
 */

export const PND1_FILING_ENCODING = 'utf8';

/** ตัวคั่นช่อง — ถ้าข้อมูลมีอักขระนี้ปนต้องตัดออก ไม่งั้นจำนวนช่องจะเพี้ยน */
const DELIMITER = '|';

const FIELD_COUNT = 11;

/**
 * สิ่งที่ยังไม่ได้ยืนยันกับสเปกของกรมสรรพากร
 * เอามาจากไฟล์ตัวอย่างของระบบเดิมล้วน ๆ ต้องยิงไฟล์จริงเข้าระบบทดสอบก่อนใช้งาน
 */
export const PND1_FILING_UNVERIFIED = [
  'รหัสแบบ 401N — อ่านจากไฟล์ตัวอย่าง ยังไม่รู้ว่ายื่นเพิ่มเติมต้องใช้รหัสอะไร',
  'ช่องที่ 6 (ชื่อกลาง) ว่างทุกบรรทัดในตัวอย่าง ยังไม่ยืนยันว่าใช้เก็บอะไร',
  'เงื่อนไขการหักภาษีลง 1 ทุกบรรทัด ระบบยังไม่มีที่เก็บกรณีนายจ้างออกภาษีแทน',
];

/** ตัดตัวคั่นและตัวขึ้นบรรทัดใหม่ออกจากข้อความ ไม่ให้ทำโครงไฟล์พัง */
function clean(value: string) {
  return value.replace(/[|\r\n]/g, ' ').trim();
}

function amount(value: number) {
  return value.toFixed(2);
}

function buildLine(row: Pnd1PersonRow) {
  const fields = [
    PND1_FILING_FORM_CODE,
    String(row.sequence).padStart(5, '0'),
    row.identityNo,
    clean(row.title),
    clean(row.firstName),
    '', // ชื่อกลาง — ตัวอย่างเว้นว่างทุกบรรทัด
    clean(row.lastName),
    row.paidOnText,
    amount(row.paidAmount),
    amount(row.taxWithheld),
    row.condition,
  ];

  /*
   * กันพลาดตอนแก้ผังในอนาคต — เพิ่มหรือลบช่องแล้วลืมแก้เอกสารข้างบน
   * ไฟล์ที่ช่องไม่ครบจะถูกระบบสรรพากรตีกลับโดยไม่บอกว่าบรรทัดไหน
   */
  if (fields.length !== FIELD_COUNT) {
    throw new Error(
      `ไฟล์นำส่ง ภ.ง.ด.1 ต้องมี ${FIELD_COUNT} ช่องต่อบรรทัด แต่สร้างได้ ${fields.length}`,
    );
  }

  return fields.join(DELIMITER);
}

export function buildPnd1FilingFile(form: Pnd1Form) {
  const lines = form.rows.map(buildLine);

  /* ไฟล์ตัวอย่างจบบรรทัดด้วย CRLF ตามธรรมเนียมไฟล์นำส่งของราชการ */
  const content = lines.length > 0 ? `${lines.join('\r\n')}\r\n` : '';

  const monthPart = String(form.month).padStart(2, '0');

  return {
    content,
    fileName: `pnd1-${form.gregorianYear}-${monthPart}.txt`,
    lineCount: lines.length,
    /** คนที่ข้อมูลไม่ครบ ต้องเตือนก่อนให้ดาวน์โหลดไปยื่น */
    incompleteRows: form.rows
      .filter((row) => row.missing.length > 0)
      .map((row) => ({
        sequence: row.sequence,
        name: `${row.title}${row.firstName} ${row.lastName}`.trim(),
        missing: row.missing,
      })),
    unverified: PND1_FILING_UNVERIFIED,
  };
}
