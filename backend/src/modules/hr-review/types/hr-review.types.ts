/**
 * HR Review / Payroll Handoff Types
 * ----------------------------------
 * ไฟล์นี้เก็บ type กลางของโมดูล HR Review เพื่อไม่ให้ controller/service ยาวเกินไป
 *
 * แนวคิดของโมดูลนี้:
 * - Approval Center = หัวหน้า/ผู้อนุมัติ กดอนุมัติคำขอ
 * - HR Review Center = HR ตรวจสอบรายการที่อนุมัติครบแล้ว ก่อนส่งเข้า Payroll
 *
 * ใน Phase นี้เรายังไม่สร้าง PayrollLine จริงทันที
 * แต่จะเก็บสถานะ handoff ไว้ก่อนว่า HR ตรวจแล้ว / พร้อมเข้าเงินเดือน / ส่งเข้า Payroll แล้ว
 */

export type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

export type HrReviewSourceType = 'LEAVE' | 'OVERTIME' | 'TIME_ADJUST';

/**
 * WAITING_REVIEW เป็นสถานะคำนวณจากระบบ ไม่ได้เก็บใน DB
 * ถ้า source APPROVED แล้วแต่ยังไม่มี HrReviewItem แปลว่ายังรอ HR ตรวจ
 */
export type HrReviewDisplayStatus =
  | 'ALL'
  | 'WAITING_REVIEW'
  | 'REVIEWED'
  | 'PAYROLL_READY'
  | 'ON_HOLD'
  | 'SENT_TO_PAYROLL'
  | 'CANCELLED';

export type HrReviewEmployeeSummary = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  position: string | null;
  companyId: string;
  company?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  branch?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  department?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
};

export type HrReviewSourceSummary = {
  id: string;
  type: HrReviewSourceType;
  requestNo: string | null;
  title: string;
  reason: string | null;
  status: string;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  employee: HrReviewEmployeeSummary | null;
  detail: Record<string, unknown>;
};

export type HrReviewRecordSummary = {
  id: string;
  sourceType: HrReviewSourceType;
  sourceId: string;
  status: Exclude<HrReviewDisplayStatus, 'ALL' | 'WAITING_REVIEW'>;
  periodId: string | null;
  payrollRunId: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  payrollReadyAt: Date | null;
  payrollReadyById: string | null;
  sentToPayrollAt: Date | null;
  sentToPayrollById: string | null;
  heldAt: Date | null;
  heldById: string | null;
  reason: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type HrReviewItem = {
  id: string;
  sourceType: HrReviewSourceType;
  sourceId: string;
  requestNo: string | null;
  title: string;
  reason: string | null;
  sourceStatus: string;
  reviewStatus: HrReviewDisplayStatus;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  employee: HrReviewEmployeeSummary | null;
  detail: Record<string, unknown>;
  review: HrReviewRecordSummary | null;
};

export type HrReviewSourceLookup = {
  sourceType: HrReviewSourceType;
  sourceId: string;
};
