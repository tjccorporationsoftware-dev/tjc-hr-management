/**
 * แปลรหัสสถานะจากฐานข้อมูลเป็นคำไทยที่คนอ่านรู้เรื่อง
 * -----------------------------------------------------------------------------
 * API สถิติคืนค่ามาเป็นรหัสดิบ (APPROVED, IN_PROGRESS, ...) เพราะเป็นการนับ
 * แบบ groupBy ตรง ๆ การแปลจึงอยู่ฝั่งหน้าจอที่เดียว
 *
 * รหัสที่ไม่รู้จักให้คืนค่าเดิม ไม่ใช่ "ไม่ทราบ" — ถ้าวันหนึ่งมีสถานะใหม่เพิ่ม
 * จะได้ยังเห็นว่าเป็นสถานะอะไร แทนที่จะกลายเป็นแถวไม่ทราบกองรวมกัน
 */

function pick(map: Record<string, string>) {
  return (key: string) => map[key] ?? key;
}

export const employeeStatusText = pick({
  ACTIVE: "ทำงานอยู่",
  PROBATION: "ทดลองงาน",
  RESIGNED: "ลาออกแล้ว",
  TERMINATED: "เลิกจ้าง",
  RETIRED: "เกษียณ",
  SUSPENDED: "พักงาน",
  INACTIVE: "ไม่ใช้งาน",
});

export const leaveStatusText = pick({
  DRAFT: "ร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิก",
});

export const overtimeStatusText = pick({
  DRAFT: "ร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิก",
});

export const payrollRunStatusText = pick({
  DRAFT: "ร่าง",
  CALCULATED: "คำนวณแล้ว",
  REVIEWED: "ตรวจแล้ว",
  APPROVED: "อนุมัติแล้ว",
  PAID: "จ่ายแล้ว",
  CANCELLED: "ยกเลิก",
  FAILED: "คำนวณไม่สำเร็จ",
});

export const postingStatusText = pick({
  DRAFT: "ร่าง",
  OPEN: "เปิดรับสมัคร",
  ON_HOLD: "พักรับสมัคร",
  CLOSED: "ปิดรับแล้ว",
  CANCELLED: "ยกเลิก",
});

export const jobStageText = pick({
  NEW: "ผู้สมัครใหม่",
  SCREENING: "คัดกรอง",
  INTERVIEW: "สัมภาษณ์",
  OFFER: "เสนอจ้าง",
  HIRED: "จ้างแล้ว",
  REJECTED: "ไม่ผ่าน",
  WITHDRAWN: "ถอนตัว",
});

export const probationStatusText = pick({
  IN_PROGRESS: "อยู่ระหว่างทดลองงาน",
  PASSED: "ผ่าน",
  FAILED: "ไม่ผ่าน",
  EXTENDED: "ขยายเวลา",
  CANCELLED: "ยกเลิก",
});

export const offboardingStatusText = pick({
  IN_PROGRESS: "ดำเนินการอยู่",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
});

export const requestStatusText = pick({
  DRAFT: "ร่าง",
  SUBMITTED: "รอดำเนินการ",
  IN_REVIEW: "กำลังตรวจ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
});

export const taskStatusText = pick({
  PENDING: "รอดำเนินการ",
  QUEUED: "เข้าคิวแล้ว",
  IN_PROGRESS: "กำลังทำ",
  PROCESSING: "กำลังสร้าง",
  DONE: "เสร็จแล้ว",
  COMPLETED: "เสร็จแล้ว",
  SUCCESS: "สำเร็จ",
  FAILED: "ไม่สำเร็จ",
  CANCELLED: "ยกเลิก",
  SKIPPED: "ข้าม",
});

/** การกระทำใน AuditLog */
export const auditActionText = pick({
  CREATE: "สร้าง",
  UPDATE: "แก้ไข",
  DELETE: "ลบ",
  VIEW: "เปิดดู",
  EXPORT: "ส่งออกไฟล์",
  IMPORT: "นำเข้าข้อมูล",
  APPROVE: "อนุมัติ",
  REJECT: "ไม่อนุมัติ",
  LOGIN: "เข้าสู่ระบบ",
  LOGOUT: "ออกจากระบบ",
  LOGIN_FAILED: "เข้าสู่ระบบไม่สำเร็จ",
  LOGIN_LOCKED: "บัญชีถูกล็อก",
  TWO_FACTOR_REQUIRED: "ขอรหัสยืนยันสองชั้น",
  TWO_FACTOR_SUCCESS: "ยืนยันสองชั้นสำเร็จ",
  TWO_FACTOR_FAILED: "ยืนยันสองชั้นไม่สำเร็จ",
  PASSWORD_CHANGED: "เปลี่ยนรหัสผ่าน",
});
