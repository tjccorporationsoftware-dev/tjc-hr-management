export type MasterStatus = "ACTIVE" | "INACTIVE";

export type OffboardingStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type OffboardingTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "WAIVED"
  | "CANCELLED";

export type OffboardingReasonType =
  | "RESIGNATION"
  | "TERMINATION"
  | "END_OF_CONTRACT"
  | "RETIREMENT"
  | "LAYOFF"
  | "OTHER";

export type OffboardingListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type OrgRef = {
  id: string;
  code: string;
  nameTh?: string | null;
};

export type OffboardingEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  startDate?: string | null;
  status?: string;
  department?: OrgRef | null;
  branch?: OrgRef | null;
};

/* ---------------- Checklist ---------------- */

export type OffboardingChecklistItem = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  ownerRole?: string | null;
  sortOrder: number;
  isRequired: boolean;
};

export type OffboardingChecklist = {
  id: string;
  companyId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  status: MasterStatus;
  createdAt: string;
  items: OffboardingChecklistItem[];
  company?: OrgRef | null;
};

export type OffboardingChecklistListSummary = {
  total: number;
  active: number;
  inactive: number;
};

export type CreateOffboardingChecklistForm = {
  companyId?: string;
  code: string;
  name: string;
  description?: string;
  status?: MasterStatus;
  items: Array<{
    title: string;
    description?: string;
    category?: string;
    ownerRole?: string;
    sortOrder?: number;
    isRequired?: boolean;
  }>;
};

/* ---------------- Task ---------------- */

export type OffboardingTask = {
  id: string;
  companyId: string;
  employeeId: string;
  caseId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  ownerRole?: string | null;
  status: OffboardingTaskStatus;
  dueDate?: string | null;
  completedAt?: string | null;
  note?: string | null;
  isRequired: boolean;
  createdAt: string;
  employee?: OffboardingEmployee;
};

/* ---------------- Exit interview ---------------- */

export type ExitInterview = {
  id: string;
  caseId: string;
  interviewDate?: string | null;
  primaryReason?: string | null;
  recommendScore?: number | null;
  wouldRehire?: boolean | null;
  whatWorkedWell?: string | null;
  whatToImprove?: string | null;
  note?: string | null;
};

export type SaveExitInterviewForm = {
  interviewDate?: string;
  primaryReason?: string;
  recommendScore?: number;
  wouldRehire?: boolean;
  whatWorkedWell?: string;
  whatToImprove?: string;
  note?: string;
};

/* ---------------- Case ---------------- */

export type OffboardingCase = {
  id: string;
  companyId: string;
  employeeId: string;
  resignationId?: string | null;
  checklistId?: string | null;
  reasonType: OffboardingReasonType;
  lastWorkingDate: string;
  effectiveDate: string;
  status: OffboardingStatus;
  accessRevokedAt?: string | null;
  payrollStoppedAt?: string | null;
  socialSecurityNotifiedAt?: string | null;
  unusedLeaveDays?: string | number | null;
  severancePay?: string | number | null;
  finalPayNote?: string | null;
  note?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  company?: OrgRef | null;
  employee?: OffboardingEmployee;
  checklist?: { id: string; code: string; name: string } | null;
  resignation?: {
    id: string;
    reason: string;
    resignationDate: string;
    effectiveDate: string;
    status: string;
  } | null;
  exitInterview?: ExitInterview | null;
  tasks?: OffboardingTask[];
  /** วันลาคงเหลือของปีที่พ้นสภาพ ดึงจากสมุดวันลา (มีเฉพาะตอนเปิดดูรายละเอียด) */
  leaveBalances?: OffboardingLeaveBalance[];
  /** ผลคำนวณค่าชดเชยล่าสุดที่บันทึกไว้กับใบ */
  severanceBreakdown?: SeveranceQuote | null;
  severanceCalculatedAt?: string | null;
  /** งวดเงินเดือนที่ครอบวันพ้นสภาพ คำนวณไปหรือยัง */
  finalPayroll?: {
    period: { id: string; code?: string | null; name?: string | null; status: string } | null;
    calculated: boolean;
    runStatus?: string | null;
  } | null;
  _count?: { tasks: number };
};

export type OffboardingLeaveBalance = {
  leaveTypeId: string;
  code: string;
  nameTh: string;
  isPaid: boolean;
  year: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

export type OffboardingCaseListSummary = {
  total: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  /** เลยวันพ้นสภาพแล้วแต่ยังไม่ปิดสิทธิ์ */
  accessPending: number;
};

export type OffboardingCaseListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  employeeId?: string;
  /** สาขา/แผนกของพนักงานที่ออก */
  branchId?: string;
  departmentId?: string;
  status?: OffboardingStatus | "";
};

export type CreateOffboardingCaseForm = {
  companyId?: string;
  employeeId: string;
  resignationId?: string;
  checklistId?: string;
  reasonType?: OffboardingReasonType;
  lastWorkingDate: string;
  effectiveDate: string;
  note?: string;
};

export type UpdateOffboardingCaseForm = {
  checklistId?: string;
  reasonType?: OffboardingReasonType;
  lastWorkingDate?: string;
  effectiveDate?: string;
  unusedLeaveDays?: number;
  severancePay?: number;
  finalPayNote?: string;
  note?: string;
};

export type CreateOffboardingTaskForm = {
  caseId: string;
  title: string;
  description?: string;
  category?: string;
  ownerRole?: string;
  dueDate?: string;
  isRequired?: boolean;
};

/* ---------------- ค่าชดเชยตอนออกจากงาน ---------------- */

export type SeveranceLine = {
  code: "SEVERANCE" | "NOTICE_PAY" | "UNUSED_LEAVE" | "SPECIAL_SEVERANCE" | "OTHER";
  nameTh: string;
  days: number;
  amount: number;
  /** เฉพาะค่าชดเชยตามกฎหมายที่ได้สิทธิยกเว้นภาษี */
  isStatutorySeverance: boolean;
};

export type SeveranceQuote = {
  employee: { id: string; employeeCode: string; fullName: string };
  serviceMonths: number;
  serviceYears: number;
  monthlyWage: number;
  severance: {
    dailyWage: number;
    severanceDays: number;
    lines: SeveranceLine[];
    statutorySeveranceAmount: number;
    totalAmount: number;
  };
  tax: {
    grossSeparationIncome: number;
    exemptAmount: number;
    taxableSeparationIncome: number;
    canCalculateSeparately: boolean;
    serviceExpense: number;
    halfDeduction: number;
    netSeparationIncome: number;
    separateTax: number;
  };
  netPayout: number;
  warnings: string[];
};
