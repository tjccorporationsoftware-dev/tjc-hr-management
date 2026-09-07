import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFEmbeddedPage, type PDFFont } from 'pdf-lib';

import { THAI_PDF_FONT } from '../thai-pdf-font.asset';

/**
 * เครื่องมือพิมพ์ข้อมูลทับแบบพิมพ์ราชการฉบับเวกเตอร์
 * -----------------------------------------------------------------------------
 * ของเดิมใช้ภาพสแกนเป็นพื้นหลังแล้วพิมพ์ทับด้วย HTML + Puppeteer ซึ่งได้ผลลัพธ์
 * หยาบเพราะพื้นหลังเป็นแรสเตอร์ ตัวนี้ใช้หน้า PDF ฉบับทางการของกรมสรรพากรเป็น
 * เทมเพลตแล้ววาดข้อความทับด้วย pdf-lib ผลที่ได้เป็นเวกเตอร์ทั้งหน้า
 *
 * ระบบพิกัดยังเป็นชุดเดิม (1240 x 1754 = A4 ที่ 150 DPI) เพื่อให้ตำแหน่งที่วัดไว้
 * แล้วทั้งหมดใช้ต่อได้ ตัวนี้แปลงเป็นหน่วย point ของ PDF ให้เอง
 *
 * ข้อควรรู้ของ pdf-lib
 *   - แกน y นับจากล่างขึ้นบน ตรงข้ามกับ CSS
 *   - drawText วางที่ "เส้นฐาน" ของตัวอักษร ไม่ใช่ขอบบนของกล่องข้อความ
 *   - ไม่มี text-align ต้องวัดความกว้างแล้วเลื่อนเอง
 */

/**
 * ระบบพิกัดอ้างอิง = A4 ที่ 150 DPI
 * แนวตั้ง 1240 x 1754 · แนวนอนสลับด้านเป็น 1754 x 1240
 * ตัวปั๊มเลือกให้เองจากสัดส่วนหน้าเทมเพลต ผู้เรียกจึงวัดพิกัดจากภาพหน้านั้นได้ตรง ๆ
 */
export const FORM_UNIT_SHORT = 1240;
export const FORM_UNIT_LONG = 1754;

/**
 * สัดส่วนจากขอบบนของกล่องข้อความถึงเส้นฐาน
 * ใช้แปลงพิกัดแบบ CSS (วัดจากขอบบน) มาเป็นพิกัดของ pdf-lib (วัดที่เส้นฐาน)
 * ค่านี้ประมาณความสูงส่วนบนของตัวอักษรเทียบกับขนาดฟอนต์
 */
const BASELINE_RATIO = 0.76;

const INK = rgb(0.06, 0.09, 0.16);

export type StampOptions = {
  width?: number;
  align?: 'left' | 'center' | 'right';
  size?: number;
};

export class FormStamp {
  private constructor(
    private readonly doc: PDFDocument,
    private readonly template: PDFEmbeddedPage,
    private readonly font: PDFFont,
    /** ขนาดหน้าจริงเป็น point */
    private readonly pageWidth: number,
    private readonly pageHeight: number,
  ) {}

  /**
   * เตรียมเอกสารจากเทมเพลตหนึ่งหน้า
   * ฝังหน้าเทมเพลตครั้งเดียวแล้ววาดซ้ำได้หลายหน้า ขนาดไฟล์จึงไม่บวมตามจำนวนหน้า
   * (สำคัญมากกับ 50 ทวิ ที่ออกคนละหน้าเป็นร้อยหน้า)
   */
  static async create(templateBase64: string) {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const source = await PDFDocument.load(
      Buffer.from(templateBase64, 'base64'),
    );
    const [templatePage] = source.getPages();
    const { width, height } = templatePage.getSize();

    const template = await doc.embedPage(templatePage);
    const font = await doc.embedFont(Buffer.from(THAI_PDF_FONT, 'base64'), {
      subset: true,
    });

    return new FormStamp(doc, template, font, width, height);
  }

  /** เพิ่มหน้าใหม่ที่วางเทมเพลตไว้แล้ว พร้อมให้พิมพ์ข้อมูลทับ */
  addPage() {
    const page = this.doc.addPage([this.pageWidth, this.pageHeight]);
    page.drawPage(this.template, {
      x: 0,
      y: 0,
      width: this.pageWidth,
      height: this.pageHeight,
    });

    return new StampedPage(page, this.font, this.pageWidth, this.pageHeight);
  }

  async save() {
    return Buffer.from(await this.doc.save({ useObjectStreams: true }));
  }
}

/** ช่องว่างระหว่างกลุ่มของช่องเลข 13 หลัก (แบ่ง 1-4-5-2-1) */
const ID_GROUPS = [1, 4, 5, 2, 1];

export class StampedPage {
  constructor(
    private readonly page: ReturnType<PDFDocument['addPage']>,
    private readonly font: PDFFont,
    private readonly pageWidth: number,
    private readonly pageHeight: number,
  ) {}

  /** หน้าแนวนอนสลับด้านของระบบพิกัด ผู้เรียกจึงวัดจากภาพหน้านั้นได้ตรง ๆ */
  private get unitWidth() {
    return this.pageWidth > this.pageHeight ? FORM_UNIT_LONG : FORM_UNIT_SHORT;
  }

  private get unitHeight() {
    return this.pageWidth > this.pageHeight ? FORM_UNIT_SHORT : FORM_UNIT_LONG;
  }

  private get scaleX() {
    return this.pageWidth / this.unitWidth;
  }

  private get scaleY() {
    return this.pageHeight / this.unitHeight;
  }

  /** วางข้อความที่พิกัดหนึ่ง โดย y คือขอบบนของกล่องข้อความแบบเดียวกับ CSS */
  text(x: number, y: number, value: string, options: StampOptions = {}) {
    if (!value) return;

    const { width, align = 'left', size = 23 } = options;
    const fontSize = size * this.scaleY;

    let left = x * this.scaleX;

    if (width !== undefined && align !== 'left') {
      const boxWidth = width * this.scaleX;
      const textWidth = this.font.widthOfTextAtSize(value, fontSize);
      left +=
        align === 'center' ? (boxWidth - textWidth) / 2 : boxWidth - textWidth;
    }

    this.page.drawText(value, {
      x: left,
      y: this.pageHeight - (y * this.scaleY + fontSize * BASELINE_RATIO),
      size: fontSize,
      font: this.font,
      color: INK,
    });
  }

  /**
   * เครื่องหมายถูก วาดเป็นเส้นสองเส้น ไม่พึ่งอักขระในฟอนต์
   * ฟอนต์ไทยหลายตัวไม่มี U+2713 ถ้าใช้ตัวอักษรจะได้กล่องว่าง
   */
  tick(x: number, y: number, size = 26) {
    const s = size * this.scaleY;
    const left = x * this.scaleX;
    const top = this.pageHeight - y * this.scaleY;

    const stroke = {
      thickness: Math.max(0.8, s * 0.09),
      color: INK,
    };

    this.page.drawLine({
      start: { x: left + s * 0.16, y: top - s * 0.52 },
      end: { x: left + s * 0.4, y: top - s * 0.78 },
      ...stroke,
    });
    this.page.drawLine({
      start: { x: left + s * 0.4, y: top - s * 0.78 },
      end: { x: left + s * 0.84, y: top - s * 0.16 },
      ...stroke,
    });
  }

  /**
   * เลข 13 หลักลงช่องสี่เหลี่ยมที่แบ่งกลุ่ม 1-4-5-2-1
   * คำนวณตำแหน่งทีละหลัก ไม่ใช้ระยะห่างตัวอักษรก้อนเดียว ไม่งั้นหลักท้ายเลื่อนออกช่อง
   */
  idDigits(x: number, y: number, width: number, digits: string, size: number) {
    if (!digits) return;

    const gapCount = ID_GROUPS.length - 1;
    const boxWidth = width / (13 + gapCount / 3);
    const gapWidth = boxWidth / 3;

    let cursor = x;
    let index = 0;

    for (const [groupIndex, groupSize] of ID_GROUPS.entries()) {
      for (let i = 0; i < groupSize; i += 1) {
        const digit = digits[index] ?? '';
        index += 1;

        if (digit) {
          this.text(cursor, y, digit, {
            width: boxWidth,
            align: 'center',
            size,
          });
        }

        cursor += boxWidth;
      }

      if (groupIndex < gapCount) cursor += gapWidth;
    }
  }

  /** ตัวเลขเรียงลงช่องที่ไม่มีเส้นคั่นกลุ่ม (สาขาที่ / รหัสไปรษณีย์) */
  plainDigits(
    x: number,
    y: number,
    width: number,
    digits: string,
    size: number,
  ) {
    if (!digits) return;

    const boxWidth = width / digits.length;

    digits.split('').forEach((digit, index) => {
      this.text(x + index * boxWidth, y, digit, {
        width: boxWidth,
        align: 'center',
        size,
      });
    });
  }
}

/** ยอดเงินแบบมีตัวคั่นหลักพัน */
export function stampMoney(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
