/**
 * HR Review / Payroll Handoff Types
 * ---------------------------------
 * Type กลางสำหรับหน้า HR Review Center
 *
 * Flow หลักของ feature นี้:
 * 1) Leave / OT / Time Adjust ถูกอนุมัติครบทุก step แล้ว
 * 2) รายการจะมาแสดงที่ HR Review Center
 * 3) HR ตรวจสอบเอกสาร/ความถูกต้อง
 * 4) HR ทำเครื่องหมายว่า "พร้อมเข้าเงินเดือน"
 * 5) Payroll Run จะนำรายการ PAYROLL_READY ไปคำนวณต่อ
 */

export type HrReviewSourceType = "ALL" | "LEAVE" | "OVERTIME" | "TIME_ADJUST";

export type HrReviewItemSourceType = Exclude<HrReviewSourceType, "ALL">;

export type HrReviewDisplayStatus =
  | "ALL"
  | "WAITING_REVIEW"
  | "REVIEWED"
  | "PAYROLL_READY"
  | "ON_HOLD"
  | "SENT_TO_PAYROLL"
  | "CANCELLED";

export type HrReviewEmployeeSummary = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  position: string | null;
  /** ระดับตำแหน่ง (1 = ผู้บริหารสูงสุด) ใช้เรียงให้ผู้บริหารขึ้นก่อน */
  positionMaster?: { level?: number | null } | null;
  companyId?: string | null;
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

export type HrReviewRecordSummary = {
  id: string;
  sourceType: HrReviewItemSourceType;
  sourceId: string;
  status: Exclude<HrReviewDisplayStatus, "ALL" | "WAITING_REVIEW">;
  periodId?: string | null;
  payrollRunId?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  payrollReadyAt?: string | null;
  payrollReadyById?: string | null;
  sentToPayrollAt?: string | null;
  sentToPayrollById?: string | null;
  heldAt?: string | null;
  heldById?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HrReviewItem = {
  /** id ฝั่ง frontend ใช้รูปแบบ SOURCE_TYPE:SOURCE_ID เช่น OVERTIME:xxx */
  id: string;
  sourceType: HrReviewItemSourceType;
  sourceId: string;
  requestNo?: string | null;
  title: string;
  reason?: string | null;
  sourceStatus: string;
  reviewStatus: HrReviewDisplayStatus;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  employee?: HrReviewEmployeeSummary | null;
  detail: Record<string, unknown>;
  review?: HrReviewRecordSummary | null;
};

export type HrReviewListParams = {
  page?: number;
  pageSize?: number;
  type?: HrReviewSourceType;
  status?: HrReviewDisplayStatus;
  companyId?: string;
  employeeId?: string;
  periodId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

export type HrReviewListResponse = {
  items: HrReviewItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type HrReviewActionForm = {
  periodId?: string;
  payrollRunId?: string;
  reason?: string;
  note?: string;
};
