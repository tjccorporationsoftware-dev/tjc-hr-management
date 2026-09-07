/**
 * ตัวช่วยสร้างไฟล์แบบความกว้างคงที่ (fixed-width)
 * -----------------------------------------------------------------------------
 * ไฟล์นำส่งของธนาคารและหน่วยงานราชการส่วนใหญ่เป็นแบบนี้
 * ทุกช่องต้องกว้างเท่าที่กำหนดเป๊ะ ไม่งั้นระบบปลายทางอ่านผิดตำแหน่งทั้งบรรทัด
 */

/** ค่าที่ใส่ในไฟล์ fixed-width ได้ — object ไม่รับ เพราะจะกลายเป็น [object Object] */
export type FixedWidthValue = string | number | null | undefined;

function toText(value: FixedWidthValue) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/** ชิดซ้าย เติมช่องว่างขวา — ใช้กับข้อความ เช่น ชื่อ */
export function padText(value: FixedWidthValue, width: number) {
  const text = toText(value);
  if (text.length >= width) return text.slice(0, width);
  return text.padEnd(width, ' ');
}

/** ชิดขวา เติมศูนย์ซ้าย — ใช้กับตัวเลข เช่น เลขที่บัญชี */
export function padNumber(value: FixedWidthValue, width: number) {
  const digits = toText(value).replace(/\D/g, '');
  if (digits.length >= width) return digits.slice(-width);
  return digits.padStart(width, '0');
}

/**
 * จำนวนเงินแบบไม่มีจุดทศนิยม (หน่วยสตางค์)
 * ไฟล์ธนาคารเกือบทั้งหมดใช้แบบนี้ เช่น 1,234.50 บาท -> 000000123450
 */
export function padAmountSatang(value: FixedWidthValue, width: number) {
  const amount = Number(value ?? 0);
  const satang = Math.round((Number.isFinite(amount) ? amount : 0) * 100);
  return String(Math.max(satang, 0)).padStart(width, '0');
}

/** วันที่รูปแบบ DDMMYYYY (ปี ค.ศ.) */
export function formatDateDMY(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '00000000';

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());

  return `${day}${month}${year}`;
}

/**
 * วันที่รูปแบบ ววดดปป (6 หลัก ปี พ.ศ. สองหลักท้าย)
 * ไฟล์นำส่งของ สปส. ใช้แบบนี้ ต่างจาก formatDateDMY ที่เป็น 8 หลักปี ค.ศ.
 */
export function formatDateDMY6(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '000000';

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String((date.getUTCFullYear() + 543) % 100).padStart(2, '0');

  return `${day}${month}${year}`;
}

/** เดือนปีรูปแบบ ดดปป (4 หลัก ปี พ.ศ. สองหลักท้าย) */
export function formatMonthYear4(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '0000';

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String((date.getUTCFullYear() + 543) % 100).padStart(2, '0');

  return `${month}${year}`;
}

/** เดือนปีรูปแบบ MMYYYY (ปี พ.ศ.) — หน่วยงานราชการไทยใช้ปีพุทธศักราช */
export function formatMonthBuddhistYear(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '000000';

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear() + 543;

  return `${month}${year}`;
}

/** ต่อทุกช่องเป็นบรรทัดเดียว พร้อมตรวจว่าความกว้างรวมตรงตามที่ประกาศ */
export function buildFixedWidthLine(
  segments: Array<{ value: string; width: number; name: string }>,
) {
  const line = segments
    .map((segment) => {
      if (segment.value.length !== segment.width) {
        throw new Error(
          `ช่อง "${segment.name}" ต้องกว้าง ${segment.width} ตัวอักษร แต่ได้ ${segment.value.length}`,
        );
      }
      return segment.value;
    })
    .join('');

  return line;
}

/** ไฟล์ fixed-width ใช้ CRLF และปิดท้ายด้วยบรรทัดว่าง ตามที่ระบบปลายทางส่วนใหญ่คาดหวัง */
export function joinFixedWidthLines(lines: string[]) {
  return lines.length ? `${lines.join('\r\n')}\r\n` : '';
}
