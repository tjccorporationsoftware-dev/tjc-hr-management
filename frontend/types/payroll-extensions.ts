/**
 * Payroll Extensions Types
 * ------------------------------------------------------------
 * ใช้ร่วมกับหน้า Payroll Extensions
 * - ค่าตอบแทน/รายหักประจำของพนักงาน
 * - รายการเพิ่ม/หักเฉพาะงวด
 * - กติกาหักเงินจาก Attendance
 */

export type PayrollLineType =
  | "EARNING"
  | "DEDUCTION"
  | "EMPLOYER_CONTRIBUTION"
  | "INFO";

export type PayrollSourceType =
  | "MANUAL"
  | "BASE_SALARY"
  | "OVERTIME"
  | "ATTENDANCE"
  | "LEAVE"
  | "SOCIAL_SECURITY"
  | "TAX"
  | "ALLOWANCE"
  | "BONUS"
  | "ADJUSTMENT"
  | "IMPORT"
  | "OTHER";

export type PayrollRecordStatus = "ACTIVE" | "INACTIVE";
export type PayrollAdjustmentStatus = "DRAFT" | "APPROVED" | "CANCELLED" | "IMPORTED";

export type AttendancePayrollRuleKind =
  | "LATE"
  | "EARLY_LEAVE"
  | "MISSING_CHECK_IN"
  | "MISSING_CHECK_OUT"
  | "ABSENCE";

export type AttendancePayrollRuleUnit =
  | "FIXED"
  | "PER_OCCURRENCE"
  | "PER_MINUTE"
  | "PER_HOUR"
  | "PER_DAY";

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<T, S = unknown> = {
  items: T[];
  meta: PageMeta;
  summary?: S;
};


export type EmployeeCompensationItemListSummary = {
  total: number;
  active: number;
  inactive: number;
  earningAmount: number;
  deductionAmount: number;
  netAmount: number;
};

export type AttendancePayrollRuleListSummary = {
  total: number;
  active: number;
  inactive: number;
  late: number;
  earlyLeave: number;
  missingCheckIn: number;
  missingCheckOut: number;
  absence: number;
};

export type PayrollAdjustmentListSummary = {
  total: number;
  draft: number;
  approved: number;
  cancelled: number;
  imported: number;
  earningAmount: number;
  deductionAmount: number;
  netAmount: number;
};

export type PayrollCompany = {
  id: string;
  code?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
};

export type PayrollEmployee = {
  id: string;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  /**
   * บัญชีผู้ใช้ที่ผูกกับพนักงานคนนี้ — รูปประจำตัวเก็บอยู่ที่นี่ ไม่ได้อยู่บน Employee
   * (/employees ส่งมาให้อยู่แล้ว ดู employeeListInclude ฝั่ง backend)
   */
  user?: {
    id?: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    status?: string | null;
  } | null;
  position?: string | null;
  /** ระดับตำแหน่ง (1 = ผู้บริหารสูงสุด) ใช้เรียงให้ผู้บริหารขึ้นก่อน */
  positionMaster?: { level?: number | null } | null;
  status?: string | null;
  companyId?: string | null;
  company?: PayrollCompany | null;
  branchId?: string | null;
  branch?: {
    id: string;
    code?: string | null;
    nameTh?: string | null;
    nameEn?: string | null;
  } | null;
  department?: {
    id: string;
    code?: string | null;
    nameTh?: string | null;
  } | null;
  employeeTypeId?: string | null;
  employeeType?: {
    id: string;
    code?: string | null;
    nameTh?: string | null;
    nameEn?: string | null;
  } | null;
  /** false = ไม่ต้องลงเวลาเลย (ผู้บริหาร / เหมาจ่าย) */
  attendanceTrackingRequired?: boolean;
  /** รอบลงเวลาที่ยกเว้นเป็นรายคน เช่น พนักงานจัดส่งไม่ต้องกดเข้างานบ่าย */
  attendanceExemptSessions?: Array<"MORNING_IN" | "AFTERNOON_IN" | "CHECK_OUT">;
};

export type PayrollPeriod = {
  id: string;
  companyId?: string | null;
  code?: string | null;
  name?: string | null;
  nameTh?: string | null;
  year?: number | null;
  month?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  paymentDate?: string | null;
  status?: string | null;
};

export type PayrollComponent = {
  id: string;
  companyId?: string | null;
  code: string;
  nameTh?: string | null;
  nameEn?: string | null;
  name?: string | null;
  type: PayrollLineType;
  sourceType?: PayrollSourceType | null;
  status?: PayrollRecordStatus | string | null;
  /** ธงตั้งต้นของรายการ ใช้เติมให้ฟอร์มตอนเลือกจากรายการที่ระบบมีให้ */
  isTaxable?: boolean | null;
  isSocialSecurityBase?: boolean | null;
  sortOrder?: number | null;
};

export type EmployeeCompensationItem = {
  id: string;
  companyId: string;
  employeeId: string;
  compensationId?: string | null;
  componentId?: string | null;
  code: string;
  name: string;
  type: PayrollLineType;
  sourceType?: PayrollSourceType | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  amount: number | string;
  effectiveDate: string;
  endDate?: string | null;
  isTaxable?: boolean | null;
  isSocialSecurityBase?: boolean | null;
  /** true = หารตามวันที่เป็นพนักงานจริงเมื่อเข้า/ออกกลางงวด · false = จ่ายเต็มเสมอ */
  prorateByEmploymentDays?: boolean | null;
  sortOrder?: number | null;
  status?: PayrollRecordStatus | string | null;
  note?: string | null;
  employee?: PayrollEmployee | null;
  component?: PayrollComponent | null;
  company?: PayrollCompany | null;
};

export type CreateEmployeeCompensationItemPayload = {
  companyId: string;
  employeeId: string;
  compensationId?: string | null;
  componentId?: string | null;
  code: string;
  name: string;
  type: PayrollLineType;
  sourceType?: PayrollSourceType;
  quantity?: number;
  rate?: number;
  amount: number;
  effectiveDate: string;
  endDate?: string | null;
  isTaxable?: boolean;
  isSocialSecurityBase?: boolean;
  /** ไม่ส่งมา = true (หารตามวัน) */
  prorateByEmploymentDays?: boolean;
  sortOrder?: number;
  status?: PayrollRecordStatus;
  note?: string | null;
};

export type UpdateEmployeeCompensationItemPayload = Partial<
  Omit<CreateEmployeeCompensationItemPayload, "companyId" | "employeeId" | "compensationId">
>;


export type PayrollRunSummary = {
  id: string;
  periodId?: string | null;
  runNo?: string | null;
  name?: string | null;
  status?: string | null;
  calculatedAt?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  period?: PayrollPeriod | null;
};

export type PayrollAdjustment = {
  id: string;
  companyId: string;
  employeeId: string;
  periodId?: string | null;
  payrollRunId?: string | null;
  componentId?: string | null;
  code: string;
  name: string;
  type: PayrollLineType;
  sourceType?: PayrollSourceType | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  amount: number | string;
  effectiveDate?: string | null;
  status?: PayrollAdjustmentStatus | string | null;
  approvedAt?: string | null;
  importedAt?: string | null;
  cancelledAt?: string | null;
  isTaxable?: boolean | null;
  isSocialSecurityBase?: boolean | null;
  sortOrder?: number | null;
  reason?: string | null;
  note?: string | null;
  employee?: PayrollEmployee | null;
  component?: PayrollComponent | null;
  period?: PayrollPeriod | null;
  payrollRun?: PayrollRunSummary | null;
  company?: PayrollCompany | null;
};

export type CreatePayrollAdjustmentPayload = {
  companyId: string;
  employeeId: string;
  periodId?: string | null;
  componentId?: string | null;
  code: string;
  name: string;
  type: PayrollLineType;
  sourceType?: PayrollSourceType;
  quantity?: number;
  rate?: number;
  amount: number;
  effectiveDate?: string | null;
  isTaxable?: boolean;
  isSocialSecurityBase?: boolean;
  sortOrder?: number;
  reason?: string | null;
  note?: string | null;
};

export type UpdatePayrollAdjustmentPayload = Partial<
  Omit<CreatePayrollAdjustmentPayload, "companyId" | "employeeId">
>;

export type AttendancePayrollRule = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description?: string | null;
  kind: AttendancePayrollRuleKind;
  unit?: AttendancePayrollRuleUnit | null;
  componentId?: string | null;
  componentCode?: string | null;
  useSalaryRate?: boolean | null;
  rateAmount?: number | string | null;
  graceMinutes?: number | null;
  salaryDivisorDays?: number | string | null;
  salaryDivisorHours?: number | string | null;
  maxDeductionAmount?: number | string | null;
  isTaxable?: boolean | null;
  isSocialSecurityBase?: boolean | null;
  sortOrder?: number | null;
  status?: PayrollRecordStatus | string | null;
  note?: string | null;
  company?: PayrollCompany | null;
  component?: PayrollComponent | null;
};

export type CreateAttendancePayrollRulePayload = {
  companyId: string;
  code: string;
  name: string;
  description?: string | null;
  kind: AttendancePayrollRuleKind;
  unit?: AttendancePayrollRuleUnit;
  componentId?: string | null;
  componentCode?: string | null;
  useSalaryRate?: boolean;
  rateAmount?: number | null;
  graceMinutes?: number;
  salaryDivisorDays?: number;
  salaryDivisorHours?: number;
  maxDeductionAmount?: number | null;
  isTaxable?: boolean;
  isSocialSecurityBase?: boolean;
  sortOrder?: number;
  status?: PayrollRecordStatus;
  note?: string | null;
};

export type UpdateAttendancePayrollRulePayload = Partial<CreateAttendancePayrollRulePayload>;

export type PayrollExtensionListParams = {
  page?: number;
  pageSize?: number;
  companyId?: string;
  employeeId?: string;
  branchId?: string;
  employeeStatus?: string;
  periodId?: string;
  componentId?: string;
  type?: PayrollLineType;
  status?: string;
  kind?: AttendancePayrollRuleKind;
  q?: string;
};
