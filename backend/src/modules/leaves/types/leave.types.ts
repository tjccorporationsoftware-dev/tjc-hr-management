/**
 * Shared Leave module types
 * -----------------------------------------------------------------------------
 * รวม type ที่ใช้ซ้ำหลายไฟล์ในโมดูล leaves ไว้จุดเดียว
 * เพื่อลดการประกาศ type ซ้ำใน controller/service หลายไฟล์
 */

/**
 * รูปแบบข้อมูล user ที่ได้จาก @CurrentUser()
 * หมายเหตุ: บาง guard ส่ง id, บางจุดส่ง userId จึงรองรับทั้งสองชื่อ
 */
export type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
};

/**
 * รูปแบบวันลาที่ใช้คำนวณจำนวนวันลา
 */
export type LeaveDayType =
  | 'FULL_DAY'
  | 'HALF_DAY_MORNING'
  | 'HALF_DAY_AFTERNOON'
  | 'HOURLY';

/**
 * สถานะใบลาหลักที่ระบบใช้ใน request lifecycle
 */
export type LeaveRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

/**
 * สถานะ approval step ของใบลา
 * ใช้คู่กับ Approval Matrix เพื่อรู้ว่าขั้นไหนรออนุมัติ/ผ่าน/ไม่ผ่าน
 */
export type LeaveApprovalStepStatus =
  | 'WAITING'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';
