import {
  PayrollLineSourceType,
  PayrollLineType,
} from '../../../generated/prisma/client';

/**
 * ความหมายของ isTaxable / isSocialSecurityBase ขึ้นกับชนิดของรายการ
 *
 *   EARNING   true = เงินก้อนนี้ "บวก" เข้าฐานภาษี / ฐานประกันสังคม
 *   DEDUCTION true = ยอดที่หัก "ลบ" ออกจากฐานภาษี / ฐานประกันสังคม
 *
 * รายการหักแบ่งเป็นสองแบบ
 *   1) หักเพราะไม่ได้ทำงาน (ลาไม่รับค่าจ้าง ขาดงาน) -> ลูกจ้างไม่ได้รับเงินก้อนนั้นจริง
 *      จึงต้องลดทั้งฐานภาษีและฐานประกันสังคม ไม่งั้นจะเก็บภาษีจากเงินที่ไม่ได้รับ
 *   2) หักจากเงินที่ได้รับแล้ว (ภาษี ประกันสังคม เงินกู้ ค่าปรับ) -> ค่าจ้างเกิดขึ้นครบแล้ว
 *      ไม่ลดฐานใด ๆ
 *
 * ค่าที่ตั้งไว้นี้เป็นเพียงค่าตั้งต้นตอนสร้างบริษัทใหม่
 * แต่ละบริษัทแก้ได้เองที่หน้าตั้งค่ารายการเงินเดือน
 */
export type DefaultPayrollComponent = {
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
  type: PayrollLineType;
  sourceType: PayrollLineSourceType;
  isTaxable: boolean;
  /**
   * ผลต่อฐานประกันสังคม
   *   EARNING   = true แปลว่า "นับเข้าฐาน"
   *   DEDUCTION = true แปลว่า "หักออกจากฐาน"
   *
   * รายการที่หักเพราะไม่ได้ทำงาน (ลาไม่รับค่าจ้าง ขาดงาน) ตั้งเป็น false
   * ตามที่ผู้ใช้เลือกไว้ 2569-08-25 คือให้คิดเงินสมทบจาก "เงินเดือนเต็ม"
   * ไม่ลดฐานตามวันที่ไม่ได้ทำงาน — แบบเดียวกับไฟล์ของระบบเงินเดือนเดิม
   *
   * ฐานภาษี (isTaxable) ยังลดตามเดิม สองฐานนี้จึงไม่เท่ากันโดยตั้งใจ
   * เก็บภาษีจากค่าจ้างที่ลูกจ้างไม่ได้รับไม่ได้ แต่ฐานเงินสมทบเป็นเรื่องนโยบาย
   *
   * บริษัทที่ต้องการให้ลดฐานตามค่าจ้างจริง ตั้งทับได้ที่ attendance_payroll_rules
   * ซึ่งมีลำดับสูงกว่าธงในตารางนี้
   */
  isSocialSecurityBase: boolean;
  isRecurring: boolean;
  sortOrder: number;
};

export const DEFAULT_PAYROLL_COMPONENTS: DefaultPayrollComponent[] = [
  {
    code: 'BASE_SALARY',
    nameTh: 'เงินเดือนประจำ',
    nameEn: 'Base Salary',
    description: 'เงินเดือนหลักของพนักงานประจำงวด',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.BASE_SALARY,
    isTaxable: true,
    isSocialSecurityBase: true,
    isRecurring: true,
    sortOrder: 10,
  },
  {
    code: 'POSITION_ALLOWANCE',
    nameTh: 'เงินประจำตำแหน่ง',
    nameEn: 'Position Allowance',
    description: 'เงินประจำตำแหน่งจากข้อมูลค่าตอบแทนพนักงาน',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ALLOWANCE,
    isTaxable: true,
    /*
     * เข้าฐานประกันสังคม
     * -----------------
     * พ.ร.บ.ประกันสังคม ม.5 นิยามค่าจ้างว่า "เงินทุกประเภทที่นายจ้างจ่ายให้ลูกจ้าง
     * เป็นค่าตอบแทนการทำงานในวันและเวลาทำงานปกติ … ไม่ว่าจะเรียกชื่ออย่างไร"
     * เงินประจำตำแหน่งจ่ายประจำทุกงวด จำนวนแน่นอน ไม่ผูกกับค่าใช้จ่ายที่เกิดจริง
     * จึงเข้านิยาม การไม่นับเข้าฐานคือการนำส่งขาด ซึ่ง สปส. ประเมินย้อนหลังได้
     *
     * ต่างจาก TRANSPORT_ALLOWANCE / PHONE_ALLOWANCE ที่ยังไม่นับ เพราะต้องดูก่อน
     * ว่าจ่ายแบบเหมาจ่ายประจำ (= ค่าจ้าง) หรือชดใช้ตามบิลจริง (= ไม่ใช่ค่าจ้าง)
     * ถ้าบริษัทไหนจ่ายแบบเหมา ให้เปิดธงนี้ของรายการนั้นเพิ่มเอง
     */
    isSocialSecurityBase: true,
    isRecurring: true,
    sortOrder: 20,
  },
  {
    code: 'TRANSPORT_ALLOWANCE',
    nameTh: 'ค่าเดินทาง',
    nameEn: 'Transport Allowance',
    description: 'ค่าเดินทางจากข้อมูลค่าตอบแทนพนักงาน',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ALLOWANCE,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 30,
  },
  {
    code: 'PHONE_ALLOWANCE',
    nameTh: 'ค่าโทรศัพท์',
    nameEn: 'Phone Allowance',
    description: 'ค่าโทรศัพท์จากข้อมูลค่าตอบแทนพนักงาน',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ALLOWANCE,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 40,
  },
  /* ---------- เงินเพิ่มที่บริษัทเลือกใช้ได้ตามนโยบายของตัวเอง ----------
   * ชุดนี้ไม่มีตัวไหนถูกคำนวณอัตโนมัติ HR เป็นคนใส่ยอดเองทุกงวด หรือผูกเป็น
   * รายการประจำรายคน มีไว้เพื่อไม่ต้องพิมพ์ชื่อกับตั้งธงใหม่ทุกครั้ง
   *
   * ธง isSocialSecurityBase ตั้งตามนิยาม "ค่าจ้าง" ของ พ.ร.บ.ประกันสังคม ม.5 คือ
   * เงินที่จ่ายตอบแทนการทำงานในเวลาทำงานปกติ จ่ายประจำ จำนวนแน่นอน
   *   เข้าฐาน     เงินประจำตำแหน่ง · เงินเพิ่มระดับบริหาร · ค่าจ้างตกเบิก · คอมมิชชัน
   *   ไม่เข้าฐาน  โบนัส · เบี้ยเลี้ยง · เงินจูงใจ (จ่ายเมื่อเข้าเงื่อนไข ไม่ใช่ค่าตอบแทนเวลาทำงาน)
   * แต่ละบริษัทปรับได้เองที่หน้าตั้งค่า เพราะข้อเท็จจริงของแต่ละที่ไม่เหมือนกัน
   */
  {
    code: 'EXECUTIVE_ALLOWANCE',
    nameTh: 'เงินเพิ่มระดับบริหาร',
    nameEn: 'Executive Allowance',
    description: 'เงินเพิ่มประจำสำหรับผู้บริหาร จ่ายเท่ากันทุกงวด',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ALLOWANCE,
    isTaxable: true,
    isSocialSecurityBase: true,
    isRecurring: true,
    sortOrder: 25,
  },
  {
    code: 'VEHICLE_ALLOWANCE',
    nameTh: 'ค่าพาหนะ',
    nameEn: 'Vehicle Allowance',
    description: 'ค่าใช้จ่ายเกี่ยวกับยานพาหนะที่จ่ายให้พนักงาน',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ALLOWANCE,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 35,
  },
  {
    code: 'PER_DIEM',
    nameTh: 'เบี้ยเลี้ยง',
    nameEn: 'Per Diem',
    description: 'เบี้ยเลี้ยงระหว่างปฏิบัติงาน ยอดเปลี่ยนตามงานแต่ละงวด',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 50,
  },
  {
    code: 'ATTENDANCE_INCENTIVE',
    nameTh: 'เงินจูงใจการมาทำงาน',
    nameEn: 'Attendance Incentive',
    description: 'เงินที่จ่ายเมื่อพนักงานมาทำงานครบตามเงื่อนไขที่บริษัทกำหนด',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 55,
  },
  {
    code: 'COMMISSION',
    nameTh: 'ค่าคอมมิชชัน',
    nameEn: 'Commission',
    description: 'ค่าตอบแทนตามผลงานหรือยอดขายที่ทำได้',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: true,
    isSocialSecurityBase: true,
    isRecurring: false,
    sortOrder: 60,
  },
  {
    code: 'RETRO_PAY',
    nameTh: 'ค่าจ้างตกเบิก',
    nameEn: 'Retroactive Pay',
    description: 'ค่าจ้างของงวดก่อนที่จ่ายไม่ครบ แล้วมาจ่ายเพิ่มในงวดนี้',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: true,
    isSocialSecurityBase: true,
    isRecurring: false,
    sortOrder: 65,
  },
  {
    code: 'BONUS',
    nameTh: 'โบนัส',
    nameEn: 'Bonus',
    description: 'เงินรางวัลประจำปีหรือตามผลประกอบการ จ่ายเป็นครั้งคราว',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.BONUS,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 70,
  },
  {
    /*
     * ไม่ใช่เงินได้ใหม่ แต่เป็นการคืนภาษีที่หักเกินไปในงวดก่อน
     * จึงต้องไม่บวกกลับเข้าฐานภาษี ไม่งั้นจะกลายเป็นเก็บภาษีจากเงินที่คืนให้
     */
    code: 'TAX_REFUND',
    nameTh: 'เงินคืนภาษีหักเกิน',
    nameEn: 'Tax Refund',
    description: 'คืนภาษีที่หักเกินจากงวดก่อนให้พนักงาน',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 80,
  },
  {
    code: 'OTHER_EARNING',
    nameTh: 'รายได้อื่น ๆ',
    nameEn: 'Other Earning',
    description: 'รายได้ประจำอื่น ๆ จากข้อมูลค่าตอบแทนพนักงาน',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.ALLOWANCE,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 90,
  },
  {
    code: 'OVERTIME_PAY',
    nameTh: 'ค่าล่วงเวลา',
    nameEn: 'Overtime Pay',
    description: 'ค่าล่วงเวลาวันทำงานปกติจากคำขอ OT ที่อนุมัติแล้ว',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.OVERTIME,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 110,
  },
  {
    code: 'OT_HOLIDAY',
    nameTh: 'ค่าล่วงเวลาวันหยุด',
    nameEn: 'Holiday Overtime Pay',
    description: 'ค่าล่วงเวลาวันหยุดจากคำขอ OT ที่อนุมัติแล้ว',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.OVERTIME,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 111,
  },
  {
    code: 'OT_SPECIAL_HOLIDAY',
    nameTh: 'ค่าล่วงเวลาวันหยุดพิเศษ',
    nameEn: 'Special Holiday Overtime Pay',
    description: 'ค่าล่วงเวลาวันหยุดพิเศษจากคำขอ OT ที่อนุมัติแล้ว',
    type: PayrollLineType.EARNING,
    sourceType: PayrollLineSourceType.OVERTIME,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 112,
  },
  {
    code: 'UNPAID_LEAVE_DEDUCTION',
    nameTh: 'หักลาไม่รับค่าจ้าง',
    nameEn: 'Unpaid Leave Deduction',
    description:
      'รายการหักจากใบลาที่เป็นลาไม่รับค่าจ้าง ลดฐานภาษีแต่ไม่ลดฐานประกันสังคม',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.LEAVE,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 310,
  },
  {
    code: 'LATE_DEDUCTION',
    nameTh: 'หักมาสาย',
    nameEn: 'Late Deduction',
    description:
      'ค่าปรับมาสายจาก Attendance Daily Summary เป็นการหักจากค่าจ้างที่เกิดขึ้นแล้ว จึงไม่ลดฐานภาษี/ประกันสังคม',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ATTENDANCE,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 610,
  },
  {
    code: 'MISSING_LOG_DEDUCTION',
    nameTh: 'หักลืมสแกนเวลา',
    nameEn: 'Missing Log Deduction',
    description: 'รายการหักจาก Attendance Daily Summary กรณีลืมสแกนเวลา',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ATTENDANCE,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 620,
  },
  {
    code: 'EARLY_LEAVE_DEDUCTION',
    nameTh: 'หักออกก่อนเวลา',
    nameEn: 'Early Checkout Deduction',
    description: 'รายการหักจาก Attendance Daily Summary กรณีออกก่อนเวลา',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ATTENDANCE,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 625,
  },
  {
    code: 'ABSENCE_DEDUCTION',
    nameTh: 'หักขาดงาน',
    nameEn: 'Absence Deduction',
    description:
      'รายการหักจาก Attendance Daily Summary กรณีขาดงาน ลดฐานภาษีแต่ไม่ลดฐานประกันสังคม',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ATTENDANCE,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 630,
  },
  {
    code: 'ATTENDANCE_UNPAID_LEAVE_DEDUCTION',
    nameTh: 'หักลาไม่รับค่าจ้าง',
    nameEn: 'Attendance Unpaid Leave Deduction',
    description:
      'รายการหักลาไม่รับค่าจ้างจาก Attendance Daily Summary ใช้เมื่อไม่มี Leave Handoff เพื่อกันยอดหายและป้องกันหักซ้ำ ลดฐานภาษีแต่ไม่ลดฐานประกันสังคม',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ATTENDANCE,
    isTaxable: true,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 640,
  },
  /* ---------- รายการหักที่บริษัทเลือกใช้ได้ ----------
   * ทั้งชุดนี้เป็นการ "หักจากเงินที่ลูกจ้างได้รับแล้ว" ค่าจ้างเกิดขึ้นครบก่อนแล้ว
   * จึงตั้ง isTaxable / isSocialSecurityBase เป็น false ทั้งหมด ไม่ลดฐานใด ๆ
   * ต่างจากการหักเพราะไม่ได้ทำงาน (ลาไม่รับค่าจ้าง ขาดงาน) ที่ต้องลดฐาน
   *
   * ถ้าตั้งผิดเป็น true จะกลายเป็นว่าคนที่ผ่อนสินค้าหรือใช้หนี้ เสียภาษีและ
   * นำส่งประกันสังคมน้อยกว่าคนเงินเดือนเท่ากันที่ไม่มีรายการหัก ซึ่งไม่ถูก
   */
  {
    code: 'STUDENT_LOAN',
    nameTh: 'กองทุนกู้ยืม กยศ.',
    nameEn: 'Student Loan (SLF)',
    description: 'หักนำส่งกองทุนเงินให้กู้ยืมเพื่อการศึกษา',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 710,
  },
  {
    code: 'ICL_LOAN',
    nameTh: 'กองทุนกู้ยืม กรอ.',
    nameEn: 'Income Contingent Loan',
    description: 'หักนำส่งกองทุนเงินกู้ยืมที่ผูกกับรายได้ในอนาคต',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 715,
  },
  {
    code: 'ADVANCE_REPAYMENT',
    nameTh: 'คืนเงินยืมล่วงหน้า',
    nameEn: 'Advance Repayment',
    description: 'ผ่อนคืนเงินที่เบิกล่วงหน้าหรือยืมจากบริษัท',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 720,
  },
  {
    code: 'INSTALLMENT_DEDUCTION',
    nameTh: 'ผ่อนชำระสินค้าของบริษัท',
    nameEn: 'Company Purchase Installment',
    description: 'ผ่อนค่าสินค้าที่ซื้อจากบริษัทเป็นงวด',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 725,
  },
  {
    code: 'ROOM_RENT',
    nameTh: 'ค่าที่พัก',
    nameEn: 'Accommodation',
    description: 'ค่าที่พักที่บริษัทจัดให้ แล้วหักจากเงินเดือน',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: true,
    sortOrder: 730,
  },
  {
    code: 'UNIFORM_DEDUCTION',
    nameTh: 'ค่าเครื่องแบบพนักงาน',
    nameEn: 'Uniform Deduction',
    description: 'ค่าเครื่องแบบหรือชุดปฏิบัติงานที่หักจากเงินเดือน',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 735,
  },
  {
    code: 'WORK_GUARANTEE',
    nameTh: 'เงินประกันการทำงาน',
    nameEn: 'Work Guarantee Deposit',
    description: 'เงินประกันการทำงานที่เก็บไว้และคืนเมื่อพ้นสภาพ',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 740,
  },
  {
    code: 'PENALTY',
    nameTh: 'เงินค่าปรับ',
    nameEn: 'Penalty',
    description: 'ค่าปรับตามระเบียบบริษัท นอกเหนือจากค่าปรับมาสายที่ระบบคิดให้',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 745,
  },
  {
    code: 'DAMAGE_DEDUCTION',
    nameTh: 'ชดใช้ความเสียหาย',
    nameEn: 'Damage Compensation',
    description: 'เงินชดใช้ความเสียหายที่พนักงานต้องรับผิด',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 750,
  },
  {
    code: 'WITHHOLDING_TAX',
    nameTh: 'หัก ณ ที่จ่าย',
    nameEn: 'Withholding Tax',
    description: 'ภาษีหัก ณ ที่จ่ายที่ไม่ได้มาจากตัวคำนวณภาษีเงินได้ประจำงวด',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.TAX,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 915,
  },
  {
    /*
     * เงินก้อนที่จ่ายเมื่อออกจากงานคิดภาษีแยกจากเงินเดือนประจำงวด
     * (กฎกระทรวง ฉบับที่ 126 และ ม.48(5)) จึงต้องแยกรายการ ไม่รวมกับ TAX
     * ไม่งั้นยอดใน ภ.ง.ด.1 ของงวดสุดท้ายจะปนกันจนตรวจย้อนไม่ได้
     */
    code: 'SEVERANCE_TAX',
    nameTh: 'ภาษีเงินได้จากการออกจากงาน',
    nameEn: 'Separation Income Tax',
    description: 'ภาษีของเงินก้อนที่จ่ายเมื่อออกจากงาน คิดแยกจากเงินเดือนประจำงวด',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.TAX,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 920,
  },
  {
    code: 'OTHER_DEDUCTION',
    nameTh: 'รายการหักอื่น ๆ',
    nameEn: 'Other Deduction',
    description: 'รายการหักอื่น ๆ หรือรายการปรับเงินเดือนเฉพาะงวด',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.ADJUSTMENT,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 700,
  },
  {
    code: 'PAID_LEAVE_DAYS',
    nameTh: 'ข้อมูลวันลาที่ได้รับค่าจ้าง',
    nameEn: 'Paid Leave Days',
    description:
      'รายการข้อมูลประกอบจากใบลาที่ได้รับค่าจ้าง ไม่กระทบยอดเงินสุทธิ',
    type: PayrollLineType.INFO,
    sourceType: PayrollLineSourceType.LEAVE,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 810,
  },
  {
    code: 'TIME_ADJUST_INFO',
    nameTh: 'ข้อมูลปรับเวลา',
    nameEn: 'Time Adjust Info',
    description: 'รายการข้อมูลประกอบจากคำขอปรับเวลา ไม่กระทบยอดเงินสุทธิ',
    type: PayrollLineType.INFO,
    sourceType: PayrollLineSourceType.ATTENDANCE,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 820,
  },
  {
    code: 'ATTENDANCE_UNPAID_LEAVE_RECONCILE',
    nameTh: 'ข้อมูลลาไม่รับค่าจ้างจาก Attendance',
    nameEn: 'Attendance Unpaid Leave Reconcile',
    description:
      'รายการข้อมูลประกอบสำหรับ reconcile ยอดลาไม่รับค่าจ้างจาก Attendance เพื่อป้องกันหักซ้ำ',
    type: PayrollLineType.INFO,
    sourceType: PayrollLineSourceType.ATTENDANCE,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 830,
  },
  {
    code: 'SOCIAL_SECURITY',
    nameTh: 'ประกันสังคม',
    nameEn: 'Social Security',
    description:
      'รายการหักเงินสมทบประกันสังคมฝั่งลูกจ้างที่คำนวณจาก Payroll Run',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.SOCIAL_SECURITY,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 900,
  },
  {
    code: 'SOCIAL_SECURITY_EMPLOYER',
    nameTh: 'เงินสมทบประกันสังคมนายจ้าง',
    nameEn: 'Employer Social Security Contribution',
    description:
      'เงินสมทบประกันสังคมฝั่งนายจ้าง แสดงในสลิปเพื่อประกอบข้อมูล แต่ไม่หักเงินสุทธิพนักงาน',
    type: PayrollLineType.EMPLOYER_CONTRIBUTION,
    sourceType: PayrollLineSourceType.SOCIAL_SECURITY,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 905,
  },
  {
    code: 'TAX',
    nameTh: 'ภาษีหัก ณ ที่จ่าย',
    nameEn: 'Withholding Tax',
    description:
      'ภาษีหัก ณ ที่จ่ายที่ Tax Engine คำนวณให้อัตโนมัติตอนคำนวณรอบการจ่าย',
    type: PayrollLineType.DEDUCTION,
    sourceType: PayrollLineSourceType.TAX,
    isTaxable: false,
    isSocialSecurityBase: false,
    isRecurring: false,
    sortOrder: 910,
  },
];

export const DEFAULT_PAYROLL_COMPONENT_CODES = DEFAULT_PAYROLL_COMPONENTS.map(
  (component) => component.code,
);
