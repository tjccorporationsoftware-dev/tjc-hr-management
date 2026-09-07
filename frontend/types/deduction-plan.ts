import type { PaginatedMeta } from "@/types/leave";

/** ประเภทแผนหักเงินเดือนแบบผ่อนงวด */
export type DeductionPlanType =
  | "STUDENT_LOAN"
  | "EMPLOYEE_LOAN"
  | "COOPERATIVE"
  | "OTHER"
  | "WORK_GUARANTEE"
  | "DAMAGE_PAYMENT";

export type DeductionPlanStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "SUSPENDED"
  | "CANCELLED";

export const DEDUCTION_PLAN_TYPE_LABEL: Record<DeductionPlanType, string> = {
  STUDENT_LOAN: "กยศ. / กรอ.",
  EMPLOYEE_LOAN: "เงินกู้พนักงาน",
  COOPERATIVE: "สหกรณ์",
  WORK_GUARANTEE: "เงินประกันการทำงาน",
  DAMAGE_PAYMENT: "ชำระค่าเสียหาย",
  OTHER: "ผ่อนอื่น ๆ",
};

export const DEDUCTION_PLAN_STATUS_LABEL: Record<DeductionPlanStatus, string> = {
  ACTIVE: "กำลังหัก",
  COMPLETED: "หักครบแล้ว",
  SUSPENDED: "พักไว้",
  CANCELLED: "ยกเลิก",
};

export type DeductionPlanEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  branch?: { id: string; code: string; nameTh: string } | null;
  department?: { id: string; code: string; nameTh: string } | null;
};

export type DeductionPlanEntry = {
  id: string;
  payrollRunId: string;
  payrollRunNo?: string | null;
  payrollRunStatus?: string | null;
  paymentDate?: string | null;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  isPartial: boolean;
  note?: string | null;
  createdAt: string;
};

export type DeductionPlan = {
  id: string;
  companyId: string;
  employeeId: string;
  employee?: DeductionPlanEmployee | null;
  planType: DeductionPlanType;
  code: string;
  name: string;
  referenceNo?: string | null;
  /** null = ไม่กำหนดยอดเต็ม หักไปเรื่อย ๆ */
  totalAmount: number | null;
  installmentAmount: number;
  paidAmount: number;
  outstandingAmount: number | null;
  remainingInstallments: number | null;
  progressPercent: number | null;
  startDate: string;
  endDate?: string | null;
  priority: number;
  allowPartialDeduction: boolean;
  status: DeductionPlanStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeductionPlanDetail = DeductionPlan & {
  entries: DeductionPlanEntry[];
};

export type DeductionPlanListResponse = {
  data: DeductionPlan[];
  meta: PaginatedMeta;
  summary: {
    total: number;
    active: number;
    completed: number;
    suspended: number;
    outstandingTotal: number;
  };
};

export type DeductionPlanListParams = {
  page?: number;
  pageSize?: number;
  companyId?: string;
  employeeId?: string;
  planType?: DeductionPlanType;
  status?: DeductionPlanStatus;
  q?: string;
};

export type CreateDeductionPlanForm = {
  companyId?: string;
  employeeId: string;
  planType: DeductionPlanType;
  code: string;
  name: string;
  referenceNo?: string | null;
  totalAmount?: number | null;
  installmentAmount: number;
  paidAmount?: number;
  startDate: string;
  endDate?: string | null;
  priority?: number;
  allowPartialDeduction?: boolean;
  note?: string | null;
};

export type UpdateDeductionPlanForm = Partial<
  Omit<CreateDeductionPlanForm, "companyId" | "employeeId" | "planType" | "code">
>;
