/**
 * คำเรียกสถานะกลางของทั้งระบบ
 * ============================
 * เดิมแต่ละหน้านิยาม map ของตัวเอง รวม 17 ไฟล์ แล้วเพี้ยนกันจริง
 * (24 สถานะที่ข้อความไม่ตรงกัน และ 13 สถานะที่สีไม่ตรงกัน) เช่น
 *   DRAFT      -> "ร่าง" ในหน้าอนุมัติ แต่ "แบบร่าง" ในหน้าลาของหัวหน้า
 *   SUBMITTED  -> "รออนุมัติ" เกือบทุกที่ แต่ "รอหัวหน้าอนุมัติ" ในหน้า ESS
 *   SUBMITTED  -> amber-100 ในหน้าหนึ่ง แต่ amber-200 ในอีกหน้า
 *
 * แยกตามโดเมนแทนที่จะทำ map แบนใบเดียว เพราะรหัสเดียวกันมีความหมายต่างกันจริง
 * ตามบริบท และถ้ารวมมั่วจะแปลผิด:
 *   OPEN    = "เปิดงวด" ใน payroll แต่ = "เปิดรับสมัคร" ใน recruitment
 *   CLOSED  = "ปิดงวด"  ใน payroll แต่ = "ปิดรับแล้ว"   ใน recruitment
 *   FAILED  = "ผิดพลาด" ในงาน job  แต่ = "ไม่ผ่านทดลองงาน" ใน probation
 *
 * ข้อความที่เลือกใช้คือคำที่ถูกใช้มากที่สุดในโค้ดเดิมของแต่ละโดเมน
 * ไม่ได้คิดคำใหม่ เพื่อให้ผู้ใช้เห็นการเปลี่ยนแปลงน้อยที่สุด
 *
 * สียังเป็นชุดเดิม (blue/emerald/amber/rose/...) ยังไม่เปลี่ยนเป็น sky/cyan
 * การไล่สีทำเป็นรอบแยกทีละหน้า แต่หลังรวมแล้วจะแก้ที่ไฟล์นี้จุดเดียว
 */

export type StatusTone =
  "slate" | "amber" | "emerald" | "red" | "blue" | "violet" | "orange";

export type StatusMeta = {
  label: string;
  tone: StatusTone;
};

/** สีของ badge ต่อ tone — จุดเดียวที่กำหนดสีสถานะทั้งระบบ */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  red: "border-red-200 bg-red-50 text-red-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
};

type Vocabulary = Record<string, StatusMeta>;

/** คำขอที่ต้องอนุมัติ: ลา / OT / ทำงานนอกสถานที่ / แก้เวลา / เอกสาร */
export const REQUEST_STATUS: Vocabulary = {
  DRAFT: { label: "ร่าง", tone: "slate" },
  SUBMITTED: { label: "รออนุมัติ", tone: "amber" },
  MANAGER_APPROVED: { label: "หัวหน้าอนุมัติแล้ว", tone: "violet" },
  HR_APPROVED: { label: "HR อนุมัติแล้ว", tone: "emerald" },
  APPROVED: { label: "อนุมัติแล้ว", tone: "emerald" },
  MANAGER_REJECTED: { label: "หัวหน้าไม่อนุมัติ", tone: "red" },
  HR_REJECTED: { label: "HR ไม่อนุมัติ", tone: "red" },
  REJECTED: { label: "ไม่อนุมัติ", tone: "red" },
  RETURNED: { label: "ตีกลับ", tone: "orange" },
  CANCELLED: { label: "ยกเลิก", tone: "slate" },
  PENDING: { label: "รอดำเนินการ", tone: "amber" },
  COMPLETED: { label: "เสร็จสิ้น", tone: "emerald" },
};

/** สถานะการจ้างของพนักงาน */
export const EMPLOYEE_STATUS: Vocabulary = {
  ACTIVE: { label: "ปฏิบัติงาน", tone: "emerald" },
  PROBATION: { label: "ทดลองงาน", tone: "blue" },
  SUSPENDED: { label: "พักงาน", tone: "amber" },
  RESIGNED: { label: "ลาออก", tone: "slate" },
  TERMINATED: { label: "เลิกจ้าง", tone: "red" },
  INACTIVE: { label: "ไม่ใช้งาน", tone: "slate" },
};

/** งวดเงินเดือนและรอบคำนวณ */
export const PAYROLL_STATUS: Vocabulary = {
  DRAFT: { label: "แบบร่าง", tone: "slate" },
  OPEN: { label: "เปิดงวด", tone: "blue" },
  CALCULATING: { label: "กำลังคำนวณ", tone: "amber" },
  CALCULATED: { label: "คำนวณแล้ว", tone: "blue" },
  REVIEWED: { label: "ตรวจแล้ว", tone: "violet" },
  APPROVED: { label: "อนุมัติแล้ว", tone: "emerald" },
  LOCKED: { label: "ล็อกงวด", tone: "violet" },
  PAID: { label: "จ่ายแล้ว", tone: "emerald" },
  CLOSED: { label: "ปิดงวด", tone: "emerald" },
  FAILED: { label: "ผิดพลาด", tone: "red" },
  CANCELLED: { label: "ยกเลิก", tone: "slate" },
  ACTIVE: { label: "ใช้งาน", tone: "emerald" },
  INACTIVE: { label: "ไม่ใช้งาน", tone: "slate" },
};

/** ขั้นตอนตรวจสอบเวลาทำงานก่อนส่งเข้าเงินเดือน */
export const ATTENDANCE_REVIEW_STATUS: Vocabulary = {
  /*
   * ชื่อสถานะจริงจาก backend คือ CALCULATED / READY_FOR_PAYROLL
   * ของเดิมมีแต่คีย์เก่า (WAITING_REVIEW / PAYROLL_READY) สองสถานะนี้จึงหลุด
   * ไปแสดงเป็นตัวพิมพ์ใหญ่ภาษาอังกฤษบนหน้าจอ
   */
  CALCULATED: { label: "คำนวณแล้ว", tone: "blue" },
  READY_FOR_PAYROLL: { label: "พร้อมเข้าเงินเดือน", tone: "emerald" },
  WAITING_REVIEW: { label: "รอตรวจ", tone: "amber" },
  NEED_REVIEW: { label: "ต้องตรวจสอบ", tone: "orange" },
  REVIEWED: { label: "ตรวจแล้ว", tone: "violet" },
  PAYROLL_READY: { label: "พร้อมเข้าเงินเดือน", tone: "emerald" },
  SENT_TO_PAYROLL: { label: "ส่งเข้าเงินเดือนแล้ว", tone: "violet" },
  LOCKED: { label: "ล็อกแล้ว", tone: "violet" },
  ON_HOLD: { label: "พักรายการ", tone: "orange" },
  NORMAL: { label: "ปกติ", tone: "emerald" },
};

/** งานในเช็กลิสต์ onboarding / offboarding */
export const TASK_STATUS: Vocabulary = {
  PENDING: { label: "รอดำเนินการ", tone: "slate" },
  IN_PROGRESS: { label: "กำลังทำ", tone: "blue" },
  COMPLETED: { label: "เสร็จสิ้น", tone: "emerald" },
  OVERDUE: { label: "เกินกำหนด", tone: "red" },
  ON_HOLD: { label: "พักรายการ", tone: "orange" },
  CANCELLED: { label: "ยกเลิก", tone: "slate" },
};

/** ประกาศงานและผู้สมัคร (ATS) */
export const RECRUITMENT_STATUS: Vocabulary = {
  DRAFT: { label: "ร่าง", tone: "slate" },
  OPEN: { label: "เปิดรับสมัคร", tone: "emerald" },
  ON_HOLD: { label: "พักรับสมัคร", tone: "orange" },
  CLOSED: { label: "ปิดรับแล้ว", tone: "slate" },
  PENDING: { label: "รอสัมภาษณ์", tone: "amber" },
  PASSED: { label: "ผ่าน", tone: "emerald" },
  FAILED: { label: "ไม่ผ่าน", tone: "red" },
  CANCELLED: { label: "ยกเลิก", tone: "slate" },
};

/** ใบโยกย้าย/ปรับตำแหน่ง */
export const EMPLOYEE_TRANSFER_STATUS: Vocabulary = {
  SCHEDULED: { label: "รอถึงวันมีผล", tone: "amber" },
  APPLIED: { label: "มีผลแล้ว", tone: "emerald" },
  CANCELLED: { label: "ยกเลิก", tone: "slate" },
};

/** ทดลองงาน */
export const PROBATION_STATUS: Vocabulary = {
  IN_PROGRESS: { label: "อยู่ระหว่างทดลองงาน", tone: "blue" },
  PASSED: { label: "ผ่านทดลองงาน", tone: "emerald" },
  FAILED: { label: "ไม่ผ่านทดลองงาน", tone: "red" },
  CANCELLED: { label: "ยกเลิก", tone: "slate" },
};

/** งานสร้างรายงานแบบ background */
export const REPORT_JOB_STATUS: Vocabulary = {
  PENDING: { label: "รอดำเนินการ", tone: "slate" },
  IN_PROGRESS: { label: "กำลังสร้าง", tone: "blue" },
  COMPLETED: { label: "สำเร็จ", tone: "emerald" },
  FAILED: { label: "ล้มเหลว", tone: "red" },
};

/**
 * คำที่หน้า ESS ใช้ ต่างจาก REQUEST_STATUS โดยตั้งใจ
 * ------------------------------------------------
 * ฝั่งพนักงานมองคำขอจากมุมตัวเอง จึงบอกว่ากำลังรอ "ใคร" อนุมัติ ไม่ใช่แค่
 * "รออนุมัติ" เฉย ๆ และใช้โทนสีคนละชุดกับหน้าฝั่ง HR/หัวหน้า
 *
 * ยกมาจากของเดิมทั้งข้อความและสี เพื่อไม่ให้หน้าตาเปลี่ยนตอนรวมไฟล์
 * ถ้ารอบไล่สี ESS ตัดสินใจใช้คำ/สีเดียวกับส่วนกลาง ให้ลบ override ตรงนี้ทิ้ง
 */
export const ESS_REQUEST_STATUS: Vocabulary = {
  ...REQUEST_STATUS,
  DRAFT: { label: "ร่าง", tone: "amber" },
  SUBMITTED: { label: "รอหัวหน้าอนุมัติ", tone: "blue" },
  MANAGER_APPROVED: { label: "รอ HR ตรวจสอบ", tone: "violet" },
  PENDING: { label: "รอดำเนินการ", tone: "blue" },
  NORMAL: { label: "ปกติ", tone: "emerald" },
};

const FALLBACK: StatusMeta = { label: "-", tone: "slate" };

/** ข้อมูลสถานะจากคลังคำที่ระบุ ถ้าไม่รู้จักจะคืนรหัสดิบไปแสดงแทนการซ่อน */
export function statusMeta(
  vocabulary: Vocabulary,
  status?: string | null,
): StatusMeta {
  if (!status) return FALLBACK;

  return vocabulary[status] ?? { label: status, tone: "slate" };
}

export function statusLabel(vocabulary: Vocabulary, status?: string | null) {
  return statusMeta(vocabulary, status).label;
}

export function statusToneClass(
  vocabulary: Vocabulary,
  status?: string | null,
) {
  return STATUS_TONE_CLASS[statusMeta(vocabulary, status).tone];
}
