/**
 * ประเภทเงินได้ที่ต้องหักภาษี ณ ที่จ่าย สำหรับผู้รับเงินที่ไม่ใช่ลูกจ้าง
 * -----------------------------------------------------------------------------
 * อัตราตามคำสั่งกรมสรรพากร ท.ป.4/2528 และที่แก้ไขเพิ่มเติม
 *
 * อัตราในตารางนี้เป็นแค่ "ค่าตั้งต้น" ตอนเลือกประเภทเงินได้ ผู้ใช้แก้อัตราราย
 * รายการได้เสมอ เพราะกรณีจริงมีข้อยกเว้นเยอะ เช่น ผู้รับเงินอยู่ต่างประเทศ
 * หรือมีอนุสัญญาภาษีซ้อน ระบบจึงเก็บอัตราที่ใช้จริงไว้ที่รายการจ่าย ไม่ใช่
 * ไปอ่านจากตารางนี้ตอนออกแบบยื่น — ถ้าอัตราเปลี่ยนทีหลัง เอกสารเก่าจะไม่เพี้ยน
 *
 * label คือข้อความที่พิมพ์ลงช่อง "ประเภทเงินได้" บนใบแนบ ภ.ง.ด.3 แก้ได้รายรายการ
 * ถ้าต้องระบุให้ชัดกว่ารายการมาตรฐาน
 */

export type WithholdingIncomeType = {
  code: string;
  label: string;
  /** อัตราภาษีร้อยละที่ใช้เป็นค่าตั้งต้น */
  defaultRate: number;
  /** มาตราที่อ้างอิง ใช้แสดงให้ผู้ใช้เลือกได้ถูก */
  section: string;
  /**
   * ข้อควรระวังของประเภทนี้ ให้หน้าจอเอาไปเตือนตอนเลือก
   *
   * มีเฉพาะประเภทที่อัตราขึ้นกับว่าผู้รับเป็นบุคคลธรรมดาหรือนิติบุคคล
   * ค่าตั้งต้นเลือกได้แค่ค่าเดียว ถ้าไม่บอกไว้ผู้ใช้จะยื่นด้วยอัตราผิดโดยไม่รู้ตัว
   */
  note?: string;
};

export const WITHHOLDING_INCOME_TYPES: WithholdingIncomeType[] = [
  {
    code: 'COMMISSION',
    label: 'ค่านายหน้า ค่าจ้างทำงานให้',
    defaultRate: 3,
    section: '40(2)',
  },
  {
    code: 'ROYALTY',
    label: 'ค่าแห่งลิขสิทธิ์ กู๊ดวิลล์ สิทธิบัตร',
    defaultRate: 3,
    section: '40(3)',
  },
  {
    code: 'INTEREST',
    label: 'ดอกเบี้ย',
    defaultRate: 1,
    section: '40(4)(ก)',
    note: 'จ่ายให้นิติบุคคล 1% · จ่ายให้บุคคลธรรมดา 15%',
  },
  {
    code: 'DIVIDEND',
    label: 'เงินปันผล เงินส่วนแบ่งกำไร',
    defaultRate: 10,
    section: '40(4)(ข)',
  },
  {
    code: 'RENT',
    label: 'ค่าเช่าอสังหาริมทรัพย์',
    defaultRate: 5,
    section: '40(5)',
  },
  {
    code: 'SHIP_RENT',
    label: 'ค่าเช่าเรือตามกฎหมายว่าด้วยการส่งเสริมพาณิชยนาวี',
    defaultRate: 1,
    section: '40(5)',
  },
  {
    code: 'PROFESSIONAL',
    label: 'ค่าวิชาชีพอิสระ',
    defaultRate: 3,
    section: '40(6)',
    note: 'กฎหมาย · โรคศิลปะ · วิศวกรรม · สถาปัตยกรรม · บัญชี · ประณีตศิลปกรรม',
  },
  {
    code: 'CONTRACT_WORK',
    label: 'ค่าจ้างทำของ',
    defaultRate: 3,
    section: '40(7)(8)',
  },
  {
    code: 'SERVICE',
    label: 'ค่าบริการ',
    defaultRate: 3,
    section: '40(8)',
  },
  {
    code: 'ADVERTISING',
    label: 'ค่าโฆษณา',
    defaultRate: 2,
    section: '40(8)',
  },
  {
    code: 'TRANSPORT',
    label: 'ค่าขนส่ง',
    defaultRate: 1,
    section: '40(8)',
    note: 'ไม่รวมค่าโดยสารสาธารณะ ซึ่งไม่ต้องหักภาษี ณ ที่จ่าย',
  },
  {
    code: 'INSURANCE_PREMIUM',
    label: 'ค่าเบี้ยประกันวินาศภัย',
    defaultRate: 1,
    section: '40(8)',
    note: 'หักเฉพาะเบี้ยที่จ่ายให้บริษัทประกันวินาศภัยในประเทศ',
  },
  {
    code: 'SALES_PROMOTION',
    label: 'รางวัล ส่วนลด จากการส่งเสริมการขาย',
    defaultRate: 3,
    section: '40(8)',
  },
  {
    code: 'PRIZE',
    label: 'รางวัลจากการประกวด แข่งขัน ชิงโชค',
    defaultRate: 5,
    section: '40(8)',
  },
  {
    code: 'PERFORMER',
    label: 'ค่าจ้างนักแสดงสาธารณะ',
    defaultRate: 5,
    section: '40(8)',
    note: 'นักแสดงในไทย 5% · นักแสดงต่างประเทศใช้อัตราก้าวหน้า 5-37%',
  },
  {
    code: 'NON_PROFIT_SERVICE',
    label: 'ค่าจ้างทำของ ค่าบริการ ที่จ่ายให้มูลนิธิหรือสมาคม',
    defaultRate: 10,
    section: '40(8)',
    note: 'ไม่ใช้กับมูลนิธิหรือสมาคมที่เป็นองค์การสาธารณกุศลตามประกาศ',
  },
  {
    code: 'OTHER',
    label: 'อื่น ๆ',
    defaultRate: 3,
    section: '40(8)',
    note: 'ใช้เมื่อไม่ตรงกับรายการมาตรฐาน — อย่าลืมแก้อัตราและข้อความบนแบบฟอร์ม',
  },
];

const BY_CODE = new Map(
  WITHHOLDING_INCOME_TYPES.map((type) => [type.code, type]),
);

export function findWithholdingIncomeType(code: string) {
  return BY_CODE.get(code) ?? null;
}
