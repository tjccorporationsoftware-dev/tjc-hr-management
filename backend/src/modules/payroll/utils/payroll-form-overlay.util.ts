import { escapeHtml } from '../payroll-document.util';

/**
 * ตัวช่วยพิมพ์ข้อมูลทับบนภาพแบบพิมพ์ราชการ
 * -----------------------------------------------------------------------------
 * แบบ ภ.ง.ด.1 / ภ.ง.ด.1ก / 50 ทวิ ใช้วิธีเดียวกันหมด คือเอาภาพแบบพิมพ์เปล่าของ
 * กรมสรรพากรมาเป็นพื้นหลัง แล้ววางข้อความทับด้วยตำแหน่งสัมบูรณ์
 *
 * ทุกพิกัดอ้างอิงระบบพิกัดของภาพ (1240 x 1754 = A4 ที่ 150 DPI) แล้วแปลงเป็น
 * เปอร์เซ็นต์ตอนวาง จึงไม่ผูกกับ DPI ที่พิมพ์จริง
 */

export const FORM_WIDTH = 1240;
export const FORM_HEIGHT = 1754;

/**
 * แปลงหน่วยพิกัดของภาพเป็นมิลลิเมตรบนกระดาษ A4
 *
 * ขนาดตัวอักษรใช้ % ไม่ได้ เพราะ CSS คิด font-size เป็น % ของฟอนต์ตัวแม่
 * ไม่ใช่ของขนาดหน้า ถ้าใช้ % ตัวอักษรจะเล็กจนอ่านไม่ออก
 * ภาพมีสัดส่วนเท่ากับ A4 พอดี จึงใช้ตัวคูณเดียวได้ทั้งสองแกน
 */
const MM_PER_UNIT = 297 / FORM_HEIGHT;

export function mm(value: number) {
  return `${(value * MM_PER_UNIT).toFixed(3)}mm`;
}

export function pct(value: number, total: number) {
  return `${((value / total) * 100).toFixed(4)}%`;
}

export type PlaceOptions = {
  width?: number;
  align?: 'left' | 'center' | 'right';
  size?: number;
  bold?: boolean;
};

/** วางกล่องข้อความไว้ที่พิกัดหนึ่งบนภาพแบบพิมพ์ */
export function place(
  x: number,
  y: number,
  text: string,
  options: PlaceOptions = {},
) {
  if (!text) return '';

  const { width, align = 'left', size = 23, bold } = options;

  const style = [
    `left:${pct(x, FORM_WIDTH)}`,
    `top:${pct(y, FORM_HEIGHT)}`,
    width === undefined ? '' : `width:${pct(width, FORM_WIDTH)}`,
    `font-size:${mm(size)}`,
    `text-align:${align}`,
    bold ? 'font-weight:700' : '',
  ]
    .filter(Boolean)
    .join(';');

  return `<div class="f" style="${style}">${escapeHtml(text)}</div>`;
}

/** เครื่องหมายถูกในช่องสี่เหลี่ยม */
export function tick(x: number, y: number, size = 26) {
  return `<div class="tick" style="left:${pct(x, FORM_WIDTH)};top:${pct(
    y,
    FORM_HEIGHT,
  )};font-size:${mm(size)}">&#10003;</div>`;
}

/**
 * วางเลข 13 หลักลงในช่องสี่เหลี่ยมเรียงกัน
 *
 * ช่องบนแบบพิมพ์แบ่งเป็นกลุ่ม 1-4-5-2-1 มีเส้นคั่นระหว่างกลุ่ม จึงคำนวณตำแหน่ง
 * ทีละหลักแทนที่จะใช้ letter-spacing ก้อนเดียว ไม่งั้นหลักท้าย ๆ จะเลื่อนออกนอกช่อง
 */
const ID_GROUPS = [1, 4, 5, 2, 1];

export function placeIdDigits(
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
          place(cursor, y, digit, { width: boxWidth, align: 'center', size }),
        );
      }

      cursor += boxWidth;
    }

    if (groupIndex < gapCount) cursor += gapWidth;
  }

  return cells.join('');
}

/** ตัวเลขเรียงลงช่องแบบไม่มีเส้นคั่นกลุ่ม (สาขาที่ / รหัสไปรษณีย์) */
export function placePlainDigits(
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

/** ยอดเงินแบบมีตัวคั่นหลักพัน */
export function formMoney(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * CSS ที่เอกสารแบบพิมพ์ทุกใบใช้ร่วมกัน
 *
 * ฟอนต์ต้องเป็น AngsanaUPC เหมือนไฟล์ตัวอย่างของลูกค้า (ตรวจได้จาก /BaseFont
 * ในไฟล์ PDF) ถ้าเปลี่ยนฟอนต์ต้องปรับขนาดในตารางพิกัดตามด้วย เพราะ Angsana
 * ตัวเล็กกว่า Sarabun มากที่ขนาดเท่ากัน
 */
export const FORM_OVERLAY_CSS = `
  @page { size: A4 portrait; margin: 0; }

  * { box-sizing: border-box; }

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
`;

export function getChromeExecutablePath() {
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}
