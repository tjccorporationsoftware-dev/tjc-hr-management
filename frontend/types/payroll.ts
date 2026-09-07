export type PayrollStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "DRAFT"
  | "OPEN"
  | "LOCKED"
  | "CLOSED"
  | "CANCELLED"
  | "CALCULATING"
  | "CALCULATED"
  | "REVIEWED"
  | "APPROVED"
  | "PAID"
  | "FAILED";

export type PayrollLineType =
  | "EARNING"
  | "DEDUCTION"
  | "EMPLOYER_CONTRIBUTION"
  | "INFO";

export type PayrollLineSourceType =
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

export type PayrollPaymentMethod =
  | "BANK_TRANSFER"
  | "CASH"
  | "CHEQUE"
  | "OTHER";

export type PayrollCompanySummary = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  logoUrl?: string | null;
};

export type PayrollUserSummary = {
  id: string;
  email: string;
  displayName: string;
};

export type PayrollDepartmentSummary = {
  id: string;
  code: string;
  nameTh: string;
};

export type PayrollBranchSummary = {
  id: string;
  code: string;
  nameTh: string;
};

export type PayrollEmployeeSummary = {
  id: string;
  employeeCode: string;
  title: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  position: string | null;
  status: string;
  /** false = ไม่ต้องลงเวลาเลย (ผู้บริหาร / เหมาจ่าย) */
  attendanceTrackingRequired?: boolean;
  /** รอบลงเวลาที่ยกเว้นเป็นรายคน เช่น พนักงานจัดส่งไม่ต้องกดเข้างานบ่าย */
  attendanceExemptSessions?: Array<"MORNING_IN" | "AFTERNOON_IN" | "CHECK_OUT">;
  /** ระดับตำแหน่ง (1 = ผู้บริหารสูงสุด) ใช้เรียงให้ผู้บริหารขึ้นก่อน */
  positionMaster?: { level?: number | null } | null;
  department: PayrollDepartmentSummary | null;
  branch: PayrollBranchSummary | null;
};

export type PayrollPageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PayrollListParams = {
  q?: string;
  companyId?: string;
  branchId?: string;
  employeeId?: string;
  periodId?: string;
  runId?: string;
  status?: string;
  employeeStatus?: string;
  month?: number;
  year?: number;
  page?: number;
  pageSize?: number;
};

export type PayrollComponent = {
  id: string;
  companyId: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  type: PayrollLineType;
  sourceType: PayrollLineSourceType;
  isTaxable: boolean;
  isSocialSecurityBase: boolean;
  isRecurring: boolean;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company: PayrollCompanySummary;
};

export type PayrollPeriod = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  paymentDate: string;
  status: "DRAFT" | "OPEN" | "LOCKED" | "CLOSED" | "CANCELLED";
  lockedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company: PayrollCompanySummary;
  _count?: {
    runs: number;
  };
};

/**
 * ฐานของค่าจ้าง — บอกว่าตัวเลข baseSalary หมายถึงอะไร
 * รายเดือน = ยอดต่อเดือน / รายวัน = ค่าแรงต่อวัน / รายชั่วโมง = ค่าแรงต่อชั่วโมง
 */
export type SalaryBasis = "MONTHLY" | "DAILY" | "HOURLY";

export type EmployeeCompensation = {
  id: string;
  companyId: string;
  employeeId: string;
  effectiveDate: string;
  baseSalary: string;
  salaryBasis: SalaryBasis;
  paymentMethod: PayrollPaymentMethod;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  socialSecurityEnabled: boolean;
  taxEnabled: boolean;
  status: "ACTIVE" | "INACTIVE";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company: PayrollCompanySummary;
  employee: PayrollEmployeeSummary;
};

export type PayrollRunPeriodSummary = {
  id: string;
  code: string;
  name: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  paymentDate: string;
  status: string;
};


export type PayrollRunListSummary = {
  total: number;
  draft: number;
  calculating: number;
  calculated: number;
  reviewed: number;
  approved: number;
  paid: number;
  cancelled: number;
  failed: number;
  waitingReviewOrApproval: number;
  totalEmployees: number;
  totalEarnings: number;
  totalDeductions: number;
  totalGrossPay: number;
  totalNetPay: number;
};

export type PayrollPaymentMethodSummary = {
  bankTransfer: number;
  cash: number;
  cheque: number;
  other: number;
  missing: number;
  label: string;
};

export type PayrollRunStandardTotals = {
  employeeCount: number;
  baseSalary: number;
  otherEarnings: number;
  overtime: number;
  totalEarnings: number;
  taxableEarnings: number;
  nonTaxableEarnings: number;
  socialSecurityBaseEarnings: number;
  attendanceDeductions: number;
  leaveDeductions: number;
  statutoryDeductions: number;
  employeeSocialSecurity: number;
  taxAmount: number;
  adjustmentDeductions: number;
  otherDeductions: number;
  totalDeductions: number;
  employerContributions: number;
  totalGrossPay: number;
  totalNetPay: number;
  negativeNetPayCount: number;
};

export type PayrollRunStandardSummary = {
  runType: string | null;
  runTypeLabel: string;
  payFrequency: string | null;
  payFrequencyLabel: string;
  currency: string | null;
  paymentReference: string | null;
  paymentMethodSummary: PayrollPaymentMethodSummary;
  totals: PayrollRunStandardTotals;
};

export type PayrollRunEasyEmployeeSummary = {
  itemId: string;
  employeeId: string;
  baseSalary: number;
  otherEarnings: number;
  overtimeEarnings: number;
  totalEarnings: number;
  taxableEarnings: number;
  nonTaxableEarnings: number;
  socialSecurityBaseEarnings: number;
  attendanceDeductions: number;
  leaveDeductions: number;
  taxSocialDeductions: number;
  employeeSocialSecurity: number;
  taxAmount: number;
  adjustmentDeductions: number;
  otherDeductions: number;
  totalDeductions: number;
  employerContributions: number;
  totalGrossPay: number;
  totalNetPay: number;
  paymentMethod: PayrollPaymentMethod | null;
  paymentMethodLabel: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNoMasked: string | null;
};

export type PayrollRunEasySummary = {
  rows: PayrollRunEasyEmployeeSummary[];
  employeeCount: number;
  baseSalaryTotal: number;
  otherEarningsTotal: number;
  overtimeTotal: number;
  totalEarnings: number;
  attendanceDeductionsTotal: number;
  leaveDeductionsTotal: number;
  taxSocialDeductionsTotal: number;
  adjustmentDeductionsTotal: number;
  otherDeductionsTotal: number;
  totalDeductions: number;
  totalGrossPay: number;
  totalNetPay: number;
  taxableEarningsTotal: number;
  nonTaxableEarningsTotal: number;
  socialSecurityBaseEarningsTotal: number;
  employeeSocialSecurityTotal: number;
  taxAmountTotal: number;
  employerContributionTotal: number;
  paymentMethodSummary: PayrollPaymentMethodSummary;
  earningLineCount: number;
  deductionLineCount: number;
  sourceLineCount: number;
};

export type PayrollRunBranchSummary = {
  branchId: string | null;
  branchCode: string | null;
  branchName: string;
  employeeCount: number;
  totalEarnings: number;
  totalDeductions: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalTax: number;
  totalSocialSecurity: number;
  totalEmployerContribution: number;
  totalLateMinutes: number;
  totalAbsentDays: number;
};

export type PayrollRunDetailSummary = {
  employees: number;
  withCompensation: number;
  missingCompensation: number;
  absentDays: number;
  unpaidLeaveDays: number;
  lateMinutes: number;
  overtimeHours: number;
  earningLines: number;
  deductionLines: number;
  earningLineCount: number;
  deductionLineCount: number;
  sourceLineCount: number;
  negativeNetPayCount: number;
  validationIssues: number;
  easy: PayrollRunEasySummary;
  standard: PayrollRunStandardSummary;
};

export type PayrollSettingSnapshot = {
  companyId?: string | null;
  source?: "COMPANY" | "SYSTEM_DEFAULT" | string | null;
  capturedAt?: string | null;
  payrollCutoffDay?: string | number | null;
  payrollPeriodStartDay?: string | number | null;
  salaryDivisorDays?: string | number | null;
  workingHoursPerDay?: string | number | null;
  socialSecurityEmployeeRate?: string | number | null;
  socialSecurityEmployerRate?: string | number | null;
  socialSecurityMinBase?: string | number | null;
  socialSecurityMaxBase?: string | number | null;
  [key: string]: unknown;
};

export type PayrollRun = {
  id: string;
  companyId: string;
  periodId: string;
  runNo: string;
  name: string | null;
  status:
    | "DRAFT"
    | "CALCULATING"
    | "CALCULATED"
    | "REVIEWED"
    | "APPROVED"
    | "PAID"
    | "CANCELLED"
    | "FAILED";
  /** สาขาที่รอบนี้ครอบคลุม — ว่าง = ทั้งบริษัท */
  branchIds?: string[];
  totalEmployees: number;
  totalEarnings: string;
  totalDeductions: string;
  totalGrossPay: string;
  totalNetPay: string;
  calculatedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdById: string | null;
  calculatedById: string | null;
  reviewedById: string | null;
  approvedById: string | null;
  paidById: string | null;
  cancelledById: string | null;
  note: string | null;
  errorMessage: string | null;
  payrollSettingSnapshot?: PayrollSettingSnapshot | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company: PayrollCompanySummary;
  period: PayrollRunPeriodSummary;
  createdBy?: PayrollUserSummary | null;
  calculatedBy?: PayrollUserSummary | null;
  reviewedBy?: PayrollUserSummary | null;
  approvedBy?: PayrollUserSummary | null;
  paidBy?: PayrollUserSummary | null;
  cancelledBy?: PayrollUserSummary | null;
  _count?: {
    items: number;
  };
  branchSummary?: PayrollRunBranchSummary[];
  calculationVerification?: PayrollCalculationVerificationResponse | null;
};

export type PayrollLine = {
  id: string;
  payrollItemId: string;
  componentId: string | null;
  code: string;
  name: string;
  type: PayrollLineType;
  sourceType: PayrollLineSourceType;
  sourceId: string | null;
  quantity: string | null;
  rate: string | null;
  amount: string;
  isTaxable: boolean;
  isSocialSecurityBase: boolean;
  sortOrder: number;
  note: string | null;
  createdAt: string;
  component?: PayrollComponent | null;
};

export type PayrollItemSnapshot = {
  compensationId?: string | null;
  effectiveDate?: string | null;
  employee?: {
    id?: string | null;
    employeeCode?: string | null;
    name?: string | null;
    position?: string | null;
    department?: string | null;
    departmentId?: string | null;
    departmentCode?: string | null;
    branch?: string | null;
    branchId?: string | null;
    branchCode?: string | null;
  } | null;
  compensation?: {
    baseSalary?: string | number | null;
    paymentMethod?: PayrollPaymentMethod | null;
    bankName?: string | null;
    bankAccountNo?: string | null;
    bankAccountName?: string | null;
    socialSecurityEnabled?: boolean | null;
    taxEnabled?: boolean | null;
  } | null;
  attendance?: Record<string, unknown> | null;
  handoff?: Record<string, unknown> | null;
  recurring?: Record<string, unknown> | null;
  adjustment?: Record<string, unknown> | null;
  socialSecurity?: Record<string, unknown> | null;
  tax?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type PayrollItem = {
  id: string;
  runId: string;
  employeeId: string;
  compensationId: string | null;
  status: string;
  baseSalary: string;
  totalEarnings: string;
  totalDeductions: string;
  totalGrossPay: string;
  totalNetPay: string;
  workingDays: string;
  paidLeaveDays: string;
  unpaidLeaveDays: string;
  absentDays: string;
  lateMinutes: number;
  overtimeHours: string;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  snapshot: PayrollItemSnapshot | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  employee: PayrollEmployeeSummary;
  compensation: EmployeeCompensation | null;
  lines: PayrollLine[];
};

export type PayrollRunDetail = PayrollRun & {
  items: PayrollItem[];
  branchSummary?: PayrollRunBranchSummary[];
  summary?: PayrollRunDetailSummary;
  calculationVerification?: PayrollCalculationVerificationResponse | null;
};

export type PayrollRunResponseMode = "detail" | "summary";

export type PayrollRunActionOptions = {
  response?: PayrollRunResponseMode;
};

export type PayrollRunProgressStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";

export type PayrollRunProgressOperation =
  | "CALCULATION"
  | "ATTENDANCE_RECALCULATION";

export type PayrollRunProgressResponse = {
  runId: string;
  operation: PayrollRunProgressOperation | null;
  status: PayrollRunProgressStatus;
  step: string | null;
  message: string;
  percent: number;
  processedEmployees: number;
  totalEmployees: number;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  elapsedMs: number;
  errorMessage: string | null;
};

export type PayrollComponentsResponse = {
  data: PayrollComponent[];
  meta: PayrollPageMeta;
};

export type PayrollPeriodListSummary = {
  total: number;
  draft: number;
  open: number;
  locked: number;
  closed: number;
  cancelled: number;
  runCount: number;
};

export type PayrollPeriodsResponse = {
  data: PayrollPeriod[];
  meta: PayrollPageMeta;
  summary?: PayrollPeriodListSummary;
};

export type EmployeeCompensationListSummary = {
  total: number;
  active: number;
  inactive: number;
  totalBaseSalary: number;
  totalCompensationAmount: number;
};

export type EmployeeCompensationsResponse = {
  data: EmployeeCompensation[];
  meta: PayrollPageMeta;
  summary?: EmployeeCompensationListSummary;
};

export type PayrollRunsResponse = {
  data: PayrollRun[];
  meta: PayrollPageMeta;
  summary?: PayrollRunListSummary;
};

export type CreatePayrollRunPayload = {
  companyId: string;
  periodId: string;
  runNo?: string;
  name?: string;
  note?: string;
  /** สาขาที่รอบนี้ครอบคลุม — ไม่ส่งหรือส่งว่าง = ทั้งบริษัท */
  branchIds?: string[];
};

export type CalculatePayrollRunPayload = {
  employeeIds?: string[];
};

export type CancelPayrollRunPayload = {
  reason?: string;
};

export type ReviewPayrollRunPayload = {
  note?: string;
};

export type ApprovePayrollRunPayload = {
  note?: string;
};

export type MarkPayrollRunPaidPayload = {
  paymentReference?: string;
  note?: string;
};

export type PayrollPayslip = PayrollItem & {
  payslipDetailsVisible?: boolean;
  run: PayrollRun & {
    period: PayrollPeriod;
    company: PayrollCompanySummary;
    payslipDetailsVisible?: boolean;
  };
};

export type PayrollPayslipPeriodOption = {
  runId: string;
  periodId: string;
  periodCode: string;
  periodName: string;
  runNo: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  paymentDate?: string | null;
  totalEarnings: number;
  totalDeductions: number;
  totalNetPay: number;
};

export type PayrollPayslipListSummary = {
  total: number;
  ready: number;
  paid: number;
  totalGrossPay: number;
  totalEarnings: number;
  totalDeductions: number;
  totalNetPay: number;
  latestNetPay: number;
  latestPeriodName?: string | null;
  latestPaymentDate?: string | null;
  periods?: PayrollPayslipPeriodOption[];
  selectedRunId?: string | null;
};

export type PayrollPayslipsResponse = {
  data: PayrollPayslip[];
  meta: PayrollPageMeta;
  summary?: PayrollPayslipListSummary;
};
export type CreateEmployeeCompensationPayload = {
  companyId: string;
  employeeId: string;
  effectiveDate: string;

  baseSalary: string;
  salaryBasis?: SalaryBasis;

  paymentMethod?: PayrollPaymentMethod;

  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;

  socialSecurityEnabled?: boolean;
  taxEnabled?: boolean;

  status?: "ACTIVE" | "INACTIVE";
  note?: string;
};

export type UpdateEmployeeCompensationPayload = {
  effectiveDate?: string;

  baseSalary?: string;
  salaryBasis?: SalaryBasis;

  paymentMethod?: PayrollPaymentMethod;

  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;

  socialSecurityEnabled?: boolean;
  taxEnabled?: boolean;

  status?: "ACTIVE" | "INACTIVE";
  note?: string;
};

export type CreatePayrollPeriodPayload = {
  companyId: string;
  code: string;
  name: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  paymentDate: string;
  status?: "DRAFT" | "OPEN" | "LOCKED" | "CLOSED" | "CANCELLED";
};

export type UpdatePayrollPeriodPayload = {
  code?: string;
  name?: string;
  year?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
  paymentDate?: string;
  status?: "DRAFT" | "OPEN" | "LOCKED" | "CLOSED" | "CANCELLED";
};

export type PayrollAttendanceDeductionStatus = "NO_SUMMARY" | "MATCHED" | "NEEDS_IMPORT";

export type PayrollAttendanceDeductionRow = {
  employee: PayrollEmployeeSummary;
  payrollItemId: string | null;
  payrollItemStatus: string | null;
  dailySummaryCount: number;
  lockedSummaryCount: number;
  totalLateMinutes: number;
  lateDays: number;
  latePenaltyAmount: string;
  missingLogDays: number;
  missingLogOccurrences: number;
  missingLogPenaltyAmount: string;
  earlyCheckoutMinutes?: number;
  earlyCheckoutDays?: number;
  earlyCheckoutPenaltyAmount?: string;
  absentDays: string;
  absentDeductionAmount: string;
  unpaidLeaveDays: string;
  unpaidLeaveDeductionAmount: string;
  payrollAttendanceDeductionAmount: string;
  totalDeductionAmount: string;
  importedDeductionAmount: string;
  importedLineCount: number;
  status: PayrollAttendanceDeductionStatus;
};

export type PayrollAttendanceDeductionTotals = {
  employeeCount: number;
  dailySummaryCount: number;
  totalLateMinutes: number;
  latePenaltyAmount: string;
  missingLogDays: number;
  missingLogPenaltyAmount: string;
  earlyCheckoutMinutes?: number;
  earlyCheckoutDays?: number;
  earlyCheckoutPenaltyAmount?: string;
  absentDays: string;
  absentDeductionAmount: string;
  unpaidLeaveDays: string;
  unpaidLeaveDeductionAmount: string;
  payrollAttendanceDeductionAmount: string;
  importedDeductionAmount: string;
  needsImportCount: number;
  noSummaryCount: number;
};

export type PayrollAttendanceDeductionsResponse = {
  run: Pick<PayrollRun, "id" | "runNo" | "name" | "status"> & {
    company: PayrollCompanySummary;
    period: PayrollRunPeriodSummary;
  };
  totals: PayrollAttendanceDeductionTotals;
  items: PayrollAttendanceDeductionRow[];
};


export type PayrollRunValidationSeverity = "CRITICAL" | "WARNING" | "INFO";

export type PayrollRunValidationStatus = "PASS" | "FAIL" | "WARN" | "INFO";

export type PayrollRunValidationIssueItem = {
  employeeId?: string | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  departmentName?: string | null;
  detail: string;
  amount?: string | null;
};

export type PayrollRunValidationCheck = {
  code: string;
  title: string;
  description: string;
  severity: PayrollRunValidationSeverity;
  status: PayrollRunValidationStatus;
  count: number;
  blocking: boolean;
  recommendation: string | null;
  items: PayrollRunValidationIssueItem[];
};

export type PayrollRunValidationResponse = {
  run: Pick<PayrollRun, "id" | "runNo" | "name" | "status"> & {
    company: PayrollCompanySummary;
    period: PayrollRunPeriodSummary;
  };
  summary: {
    isApprovable: boolean;
    isPayable: boolean;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    blockingCount: number;
    checkedAt: string;
  };
  attendance?: {
    totals: PayrollAttendanceDeductionTotals;
  };
  payslipPublication?: PayrollPayslipPublicationStatusResponse;
  checks: PayrollRunValidationCheck[];
};

export type PayrollPayslipPublicationStatusResponse = {
  run: Pick<PayrollRun, "id" | "runNo" | "name" | "status"> & {
    itemCount: number;
  };
  isPublished: boolean;
  payslipsPublishedAt: string | null;
  payslipsPublishedById: string | null;
  payslipsUnpublishedAt: string | null;
  payslipsUnpublishedById: string | null;
  payslipDetailsVisible: boolean;
  payslipDetailsVisibilityUpdatedAt: string | null;
  payslipDetailsVisibilityUpdatedById: string | null;
};

export type PayrollReadinessIssueItem = PayrollRunValidationIssueItem;

export type PayrollReadinessCheck = {
  code: string;
  title: string;
  description: string;
  severity: PayrollRunValidationSeverity;
  status: PayrollRunValidationStatus;
  count: number;
  blocking: boolean;
  recommendation: string | null;
  items: PayrollReadinessIssueItem[];
};

export type PayrollReadinessResponse = {
  run: Pick<PayrollRun, "id" | "runNo" | "name" | "status"> & {
    company: PayrollCompanySummary;
    period: PayrollRunPeriodSummary;
  };
  summary: {
    isReady: boolean;
    employeeCount: number;
    periodDayCount: number;
    dailySummaryCount: number;
    readyDailySummaryCount: number;
    lockedDailySummaryCount: number;
    attendanceDeductionAmount: string;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    blockingCount: number;
    checkedAt: string;
  };
  checks: PayrollReadinessCheck[];
};



export type PayrollSourcePreviewItemCategory = "RECURRING" | "ADJUSTMENT";

export type PayrollSourcePreviewMatchStatus =
  | "MATCHED"
  | "EXCLUDED"
  | "ALREADY_IMPORTED"
  | "IMPORTED_OTHER_RUN";

export type PayrollSourcePreviewItem = {
  id: string;
  category: PayrollSourcePreviewItemCategory;
  code: string;
  name: string;
  type: PayrollLineType | string;
  sourceType: PayrollLineSourceType | string;
  amount: string;
  quantity: string;
  rate: string;
  isTaxable: boolean;
  isSocialSecurityBase: boolean;
  status: string;
  effectiveDate: string | null;
  endDate: string | null;
  periodId: string | null;
  payrollRunId: string | null;
  matchStatus: PayrollSourcePreviewMatchStatus;
  matchStatusLabel: string;
  actionLabel: string;
  reasons: string[];
  lineId: string | null;
  payrollItemId: string | null;
};

export type PayrollSourcePreviewEmployeeTotals = {
  matchedEarningAmount: string;
  matchedDeductionAmount: string;
  matchedInfoCount: number;
  alreadyImportedCount: number;
  excludedCount: number;
  importedOtherRunCount: number;
};

export type PayrollSourcePreviewEmployee = {
  employee: PayrollEmployeeSummary;
  totals: PayrollSourcePreviewEmployeeTotals;
  recurringItems: PayrollSourcePreviewItem[];
  adjustmentItems: PayrollSourcePreviewItem[];
  warnings: string[];
};

export type PayrollSourcePreviewResponse = {
  run: Pick<PayrollRun, "id" | "runNo" | "name" | "status"> & {
    company: PayrollCompanySummary;
    period: PayrollRunPeriodSummary;
  };
  summary: {
    employeeCount: number;
    recurringItemCount: number;
    adjustmentItemCount: number;
    matchedRecurringItemCount: number;
    matchedAdjustmentItemCount: number;
    alreadyImportedItemCount: number;
    excludedItemCount: number;
    importedOtherRunCount: number;
    matchedEarningAmount: string;
    matchedDeductionAmount: string;
    matchedInfoCount: number;
    checkedAt: string;
  };
  employees: PayrollSourcePreviewEmployee[];
};


export type PayrollCalculationVerificationStatus =
  | "CREATED"
  | "MISSING"
  | "DUPLICATED"
  | "AMOUNT_MISMATCH";

export type PayrollCalculationVerificationSource = {
  id: string;
  category: PayrollSourcePreviewItemCategory;
  code: string;
  name: string;
  type: PayrollLineType | string;
  sourceType: PayrollLineSourceType | string;
  amount: string;
  actualAmount: string | null;
  status: PayrollCalculationVerificationStatus;
  statusLabel: string;
  reason: string;
  lineId: string | null;
  payrollItemId: string | null;
  lineCount: number;
  lines: Array<{
    lineId: string;
    payrollItemId: string;
    code: string;
    name: string;
    type: PayrollLineType | string;
    amount: string;
  }>;
};

export type PayrollCalculationVerificationEmployee = {
  employee: PayrollEmployeeSummary;
  payrollItemId: string;
  totals: {
    expectedSourceCount: number;
    createdSourceCount: number;
    missingSourceCount: number;
    duplicateSourceCount: number;
    amountMismatchCount: number;
    expectedEarningAmount: string;
    expectedDeductionAmount: string;
  };
  recurringSources: PayrollCalculationVerificationSource[];
  adjustmentSources: PayrollCalculationVerificationSource[];
  missingSources: PayrollCalculationVerificationSource[];
  duplicateSources: PayrollCalculationVerificationSource[];
  amountMismatchSources: PayrollCalculationVerificationSource[];
};

export type PayrollCalculationVerificationResponse = {
  run: Pick<PayrollRun, "id" | "runNo" | "name" | "status"> & {
    company: PayrollCompanySummary;
    period: PayrollRunPeriodSummary;
  };
  summary: {
    employeeCount: number;
    expectedSourceCount: number;
    createdSourceCount: number;
    missingSourceCount: number;
    duplicateSourceCount: number;
    amountMismatchCount: number;
    expectedRecurringCount: number;
    expectedAdjustmentCount: number;
    missingRecurringCount: number;
    missingAdjustmentCount: number;
    expectedEarningAmount: string;
    expectedDeductionAmount: string;
    checkedAt: string;
    isComplete: boolean;
  };
  employees: PayrollCalculationVerificationEmployee[];
};

export type PayrollLineAuditIssueItem = PayrollRunValidationIssueItem & {
  lineId?: string | null;
  code?: string | null;
  sourceType?: PayrollLineSourceType | string | null;
  sourceId?: string | null;
};

export type PayrollLineAuditCheck = {
  code: string;
  title: string;
  description: string;
  severity: PayrollRunValidationSeverity;
  status: PayrollRunValidationStatus;
  count: number;
  blocking: boolean;
  recommendation: string | null;
  items: PayrollLineAuditIssueItem[];
};

export type PayrollLineAuditResponse = {
  run: Pick<PayrollRun, "id" | "runNo" | "name" | "status"> & {
    company: PayrollCompanySummary;
    period: PayrollRunPeriodSummary;
  };
  summary: {
    isTraceable: boolean;
    lineCount: number;
    lineWithSourceCount: number;
    sourceMissingCount: number;
    manualSourceCount: number;
    componentMappedCount: number;
    componentMissingCount: number;
    itemTotalMismatchCount: number;
    runTotalMismatchCount: number;
    attendanceMismatchCount: number;
    adjustmentMissingCount: number;
    overtimeMissingCount: number;
    attendanceExpectedAmount: string;
    attendanceLineAmount: string;
    adjustmentLineAmount: string;
    overtimeLineAmount: string;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    blockingCount: number;
    checkedAt: string;
  };
  checks: PayrollLineAuditCheck[];
};

export type PayrollDryRunEmployeeEstimate = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  baseSalary: string;
  allowanceAmount?: string;
  recurringEarnings?: string;
  recurringDeductions?: string;
  adjustmentEarnings?: string;
  adjustmentDeductions?: string;
  estimatedDeduction: string;
  estimatedNetPay: string;
};

export type PayrollDryRunResponse = {
  readiness: PayrollReadinessResponse;
  estimate: {
    isDryRun: boolean;
    willWriteDatabase: boolean;
    employeeCount: number;
    employeeWithCompensationCount: number;
    baseSalaryAmount: string;
    allowanceAmount: string;
    recurringEarnings?: string;
    recurringDeductions?: string;
    adjustmentEarnings: string;
    attendanceDeductionAmount: string;
    adjustmentDeductions: string;
    totalEarnings: string;
    totalDeductions: string;
    totalNetPay: string;
    sampleEmployees: PayrollDryRunEmployeeEstimate[];
  };
};

/* =========================================================
   PAYROLL TAX FULL SYSTEM TYPES
   ---------------------------------------------------------
   ข้อมูลภาษีหัก ณ ที่จ่ายที่ผูกกับ Tax Engine ใน Payroll Run แล้ว
   ข้อมูลภาษีพนักงานไม่มีสายอนุมัติ — บันทึกแล้วใช้คำนวณทันที
========================================================= */

export type PayrollTaxYear = {
  id: string;
  companyId: string;
  taxYear: number;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  personalExpenseRate: string;
  personalExpenseMax: string;
  standardPersonalAllowance: string;
  roundingMethod: string;
  taxAveragingMethod: string;
  isActive: boolean;
  status: "ACTIVE" | "INACTIVE";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company?: PayrollCompanySummary;
  brackets?: PayrollTaxBracket[];
  allowanceTypes?: PayrollTaxAllowanceType[];
  allowanceLimitGroups?: PayrollTaxAllowanceLimitGroup[];
  _count?: {
    brackets?: number;
    allowanceTypes?: number;
    profiles?: number;
    yearSummaries?: number;
    calculations?: number;
  };
};

export type PayrollTaxBracket = {
  id: string;
  taxYearId: string;
  minIncome: string;
  maxIncome: string | null;
  rate: string;
  quickDeduction: string;
  sortOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type PayrollTaxAllowanceType = {
  id: string;
  taxYearId: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  category: string;
  defaultAmount: string;
  maxAmount: string | null;
  /** เพดานเป็นสัดส่วนของเงินได้ "0.1500" = 15% */
  maxPercentOfIncome: string | null;
  percentBase: PayrollAllowancePercentBase;
  /** ตัวคูณยอดที่หักได้ เช่น "2" สำหรับบริจาคเพื่อการศึกษา */
  deductionMultiplier: string;
  limitGroupCode: string | null;
  isSystem: boolean;
  requiresAttachment: boolean;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  taxYear?: PayrollTaxYear;
};

/** ฐานที่ใช้คิดเพดานแบบเปอร์เซ็นต์ — เงินบริจาคใช้ฐานหลังหักค่าลดหย่อนอื่น */
export type PayrollAllowancePercentBase =
  | "GROSS_INCOME"
  | "NET_AFTER_ALLOWANCE";

/** กลุ่มเพดานรวม เช่น กองทุนเกษียณที่รวมกันไม่เกิน 500,000 */
export type PayrollTaxAllowanceLimitGroup = {
  id: string;
  taxYearId: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  maxAmount: string | null;
  maxPercentOfIncome: string | null;
  percentBase: PayrollAllowancePercentBase;
  isSystem: boolean;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type EmployeeTaxAllowance = {
  id: string;
  taxProfileId: string;
  allowanceTypeId: string;
  declaredAmount: string;
  note: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  allowanceType?: PayrollTaxAllowanceType;
};

export type EmployeeTaxProfile = {
  id: string;
  companyId: string;
  employeeId: string;
  taxYearId: string;
  taxEnabled: boolean;
  taxId: string | null;
  maritalStatus: string | null;
  spouseHasIncome: boolean;
  note: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company?: PayrollCompanySummary;
  employee: PayrollEmployeeSummary & {
    profile?: {
      taxId?: string | null;
      maritalStatus?: string | null;
    } | null;
  };
  taxYear: PayrollTaxYear;
  allowances?: EmployeeTaxAllowance[];
};

export type PayrollTaxOverview = {
  taxYears: number;
  profiles: number;
  allowanceTypes: number;
  phase: string;
  note: string;
};

/**
 * HAS_ALLOWANCE  = แจ้งค่าลดหย่อนไว้แล้ว
 * DEFAULT_ONLY   = ยังไม่แจ้ง ระบบคิดให้ด้วยลดหย่อนส่วนตัว + ประกันสังคม
 */
export type PayrollTaxCoverageStatus =
  | "HAS_ALLOWANCE"
  | "DEFAULT_ONLY"
  | "NO_TAX_YEAR"
  | "TAX_DISABLED";

export type PayrollTaxCoverageItem = {
  employeeId: string;
  companyId: string;
  compensationId: string;
  taxYearId: string | null;
  taxEnabled: boolean;
  taxStatus: PayrollTaxCoverageStatus;
  profileId: string | null;
  taxId: string | null;
  allowanceCount: number;
  updatedAt: string | null;
  employee: PayrollEmployeeSummary & {
    profile?: {
      taxId?: string | null;
      maritalStatus?: string | null;
    } | null;
  };
  company?: PayrollCompanySummary;
  taxYear?: PayrollTaxYear | null;
  profile?: EmployeeTaxProfile | null;
};

export type PayrollTaxCoverageSummary = {
  totalEmployees: number;
  taxEnabledEmployees: number;
  taxDisabledEmployees: number;
  employeesWithAllowance: number;
  employeesUsingDefaultOnly: number;
  noTaxYearEmployees: number;
  taxYearId?: string | null;
  taxYearName?: string | null;
  taxYear?: number | null;
};

export type PayrollTaxProfileCoverageResponse = {
  data: PayrollTaxCoverageItem[];
  meta: PayrollPageMeta;
  summary: PayrollTaxCoverageSummary;
  taxYear: PayrollTaxYear | null;
};

export type PayrollTaxProfileSummary = {
  total: number;
};

export type PayrollTaxYearsResponse = {
  data: PayrollTaxYear[];
  meta: PayrollPageMeta;
};

export type EmployeeTaxProfilesResponse = {
  data: EmployeeTaxProfile[];
  meta: PayrollPageMeta;
  summary?: PayrollTaxProfileSummary;
};

export type CreatePayrollTaxYearPayload = {
  companyId: string;
  taxYear: number;
  code?: string;
  name?: string;
  startDate: string;
  endDate: string;
  personalExpenseRate?: string;
  personalExpenseMax?: string;
  standardPersonalAllowance?: string;
  roundingMethod?: string;
  taxAveragingMethod?: string;
  isActive?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  note?: string;
};

export type UpdatePayrollTaxYearPayload = Partial<Omit<CreatePayrollTaxYearPayload, "companyId" | "taxYear">>;

export type CreatePayrollTaxBracketPayload = {
  taxYearId: string;
  minIncome: string;
  maxIncome?: string;
  rate: string;
  quickDeduction?: string;
  sortOrder?: number;
  note?: string;
};

export type UpdatePayrollTaxBracketPayload = Partial<Omit<CreatePayrollTaxBracketPayload, "taxYearId">>;

export type CreatePayrollTaxAllowanceTypePayload = {
  taxYearId: string;
  code: string;
  nameTh: string;
  nameEn?: string;
  description?: string;
  category?: string;
  defaultAmount?: string;
  maxAmount?: string;
  maxPercentOfIncome?: string;
  percentBase?: PayrollAllowancePercentBase;
  deductionMultiplier?: string;
  limitGroupCode?: string;
  isSystem?: boolean;
  requiresAttachment?: boolean;
  sortOrder?: number;
  status?: "ACTIVE" | "INACTIVE";
  note?: string;
};

export type UpdatePayrollTaxAllowanceTypePayload = Partial<Omit<CreatePayrollTaxAllowanceTypePayload, "taxYearId">>;

export type CreateEmployeeTaxProfilePayload = {
  companyId: string;
  employeeId: string;
  taxYearId: string;
  taxEnabled?: boolean;
  taxId?: string;
  maritalStatus?: string;
  spouseHasIncome?: boolean;
  note?: string;
};

export type UpdateEmployeeTaxProfilePayload = Partial<Omit<CreateEmployeeTaxProfilePayload, "companyId" | "employeeId" | "taxYearId">>;

export type CopyEmployeeTaxProfilesPayload = {
  companyId: string;
  fromTaxYearId?: string;
  toTaxYearId: string;
  overwrite?: boolean;
};

export type CopyEmployeeTaxProfilesResult = {
  fromTaxYear: { id: string; taxYear: number };
  toTaxYear: { id: string; taxYear: number };
  createdProfiles: number;
  updatedProfiles: number;
  skippedProfiles: number;
  copiedAllowances: number;
  skippedAllowanceCodes: string[];
};

export type UpsertEmployeeTaxAllowancePayload = {
  allowanceTypeId: string;
  declaredAmount: string;
  note?: string;
  attachmentUrl?: string;
};

export type UpdateEmployeeTaxAllowancePayload = Partial<Omit<UpsertEmployeeTaxAllowancePayload, "allowanceTypeId">>;

/* =========================================================
   PAYROLL TAX FULL SYSTEM - PHASE 3 PREVIEW TYPES
   ---------------------------------------------------------
   ทดลองคำนวณภาษีหัก ณ ที่จ่ายโดยยังไม่สร้าง PayrollLine TAX จริง
========================================================= */

export type PayrollTaxPreviewWarning = {
  code: string;
  title: string;
  detail: string;
  severity: "INFO" | "WARNING" | "BLOCKING";
};

export type PayrollTaxEmployeePreview = {
  companyId: string;
  employeeId: string;
  taxYear: {
    id: string;
    taxYear: number;
    code: string;
    name: string;
    roundingMethod: string;
    taxAveragingMethod: string;
  };
  taxProfile: {
    id: string;
    taxEnabled: boolean;
    taxId: string | null;
    updatedAt: string | null;
  } | null;
  taxableIncomeCurrentRun: string;
  projectedAnnualIncome: string;
  expenseDeduction: string;
  allowanceTotal: string;
  netTaxableIncome: string;
  annualTax: string;
  taxWithheldYtd: string;
  remainingTax: string;
  currentRunTax: string;
  roundingAdjustment: string;
  remainingPeriods: number;
  warnings: PayrollTaxPreviewWarning[];
  calculationSnapshot: Record<string, unknown>;
};

export type PayrollRunTaxPreviewRow = {
  employeeId: string;
  payrollItemId?: string;
  employeeCode: string;
  employeeName: string;
  departmentName?: string;
  taxEnabled: boolean;
  status: "CALCULATED" | "NEED_SETUP" | "SKIPPED";
  currentRunTax: string;
  annualTax?: string;
  projectedAnnualIncome?: string;
  netTaxableIncome?: string;
  allowanceTotal?: string;
  warnings: PayrollTaxPreviewWarning[];
};

export type PayrollRunTaxPreviewResponse = {
  run: {
    id: string;
    runNo: string;
    name: string | null;
    status: string;
    company: PayrollCompanySummary;
    period: PayrollPeriod;
  };
  summary: {
    employeeCount: number;
    calculatedCount: number;
    needSetupCount: number;
    skippedCount: number;
    warningCount: number;
    blockingCount: number;
    totalCurrentRunTax: string;
    remainingPeriods: number;
    isPreviewOnly: boolean;
    willWritePayrollLine: boolean;
    checkedAt: string;
  };
  rows: PayrollRunTaxPreviewRow[];
  warnings: PayrollTaxPreviewWarning[];
};

export type PayrollTaxPreviewPayload = {
  companyId?: string;
  employeeId: string;
  taxYearId?: string;
  monthlyIncome?: number;
  bonusIncome?: number;
  otherTaxableIncome?: number;
  taxableIncomeYtd?: number;
  socialSecurityYtd?: number;
  taxWithheldYtd?: number;
  remainingPeriods?: number;
};

export type PayrollRunTaxPreviewPayload = {
  taxYearId?: string;
  remainingPeriods?: number;
};

/* =========================================================
   PAYROLL TAX FULL SYSTEM - PHASE 5 REPORT TYPES
   ---------------------------------------------------------
   รายงานภาษีหัก ณ ที่จ่ายสำหรับบัญชีและ HR
========================================================= */

export type PayrollTaxReportQuery = {
  companyId?: string;
  taxYearId?: string;
  payrollRunId?: string;
  employeeId?: string;
  year?: number;
  month?: number;
  status?: string;
  pageSize?: number;
};

export type PayrollTaxMonthlyReportRow = {
  id: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  companyTaxId?: string | null;
  companyAddress?: string | null;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  branchCode?: string | null;
  branchName?: string | null;
  taxId: string | null;
  taxYearId: string;
  taxYear: number | null;
  taxYearName: string | null;
  payrollRunId: string;
  payrollRunNo: string;
  payrollRunName: string;
  payrollRunStatus: string;
  periodCode: string;
  periodName: string;
  paymentDate: string | null;
  paymentYear?: number | null;
  taxMonth?: number | null;
  taxableIncomeCurrentRun: string;
  projectedAnnualIncome: string;
  expenseDeduction: string;
  allowanceTotal: string;
  netTaxableIncome: string;
  annualTax: string;
  taxWithheldYtd: string;
  remainingTax: string;
  currentRunTax: string;
  roundingAdjustment: string;
  status: string;
  createdAt: string;
};

export type PayrollTaxMonthlyReportSummary = {
  reportType: "MONTHLY";
  companyId: string | null;
  taxYearId: string | null;
  payrollRunId: string | null;
  month: number | null;
  year: number | null;
  employeeCount: number;
  totalTaxableIncome: string;
  totalAllowance: string;
  totalNetTaxableIncome: string;
  totalTaxWithheld: string;
};

export type PayrollTaxAnnualReportRow = {
  companyId: string;
  companyCode: string;
  companyName: string;
  companyTaxId?: string | null;
  companyAddress?: string | null;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeAddress?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
  taxId: string | null;
  taxYearId: string;
  taxYear: number | null;
  taxYearName: string | null;
  payrollRunCount: number;
  totalTaxableIncome: string;
  totalExpenseDeduction: string;
  totalAllowance: string;
  totalNetTaxableIncome: string;
  totalAnnualTaxEstimate: string;
  totalTaxWithheld: string;
  lastPaymentDate: string | null;
};

export type PayrollTaxAnnualReportSummary = {
  reportType: "ANNUAL";
  companyId: string | null;
  taxYearId: string | null;
  taxYear: number | null;
  employeeCount: number;
  totalTaxableIncome: string;
  totalTaxWithheld: string;
};

export type PayrollTaxMonthlyReportResponse = {
  summary: PayrollTaxMonthlyReportSummary;
  data: PayrollTaxMonthlyReportRow[];
};

export type PayrollTaxAnnualReportResponse = {
  summary: PayrollTaxAnnualReportSummary;
  data: PayrollTaxAnnualReportRow[];
};



export type PayrollTaxPnd1ReportRow = {
  sequence: number;
  formType: "PND1";
  companyId: string;
  companyCode: string;
  companyName: string;
  companyTaxId: string | null;
  companyAddress: string | null;
  branchCode: string;
  branchName: string | null;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeTaxId: string | null;
  employeeAddress: string | null;
  incomeType: string;
  payrollRunId: string;
  payrollRunNo: string;
  payrollRunName: string;
  payrollRunStatus?: string | null;
  paymentDate: string | null;
  taxMonth: number | null;
  paymentYear?: number | null;
  taxYear: number | null;
  paidAmount: string;
  taxWithheldAmount: string;
  note: string | null;
};

export type PayrollTaxPnd1ReportSummary = {
  reportType: "PND1";
  companyId: string | null;
  taxYearId: string | null;
  month: number | null;
  year: number | null;
  employeeCount: number;
  totalPaidAmount: string;
  totalTaxWithheld: string;
  filingRunStatuses?: string[];
};

export type PayrollTaxPnd1ReportResponse = {
  summary: PayrollTaxPnd1ReportSummary;
  data: PayrollTaxPnd1ReportRow[];
};

export type PayrollTaxPnd1AReportRow = {
  sequence: number;
  formType: "PND1A";
  companyId: string;
  companyCode: string;
  companyName: string;
  companyTaxId: string | null;
  companyAddress: string | null;
  branchCode: string;
  branchName: string | null;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeTaxId: string | null;
  employeeAddress: string | null;
  incomeType: string;
  taxYearId: string;
  taxYear: number | null;
  payrollRunCount: number;
  totalPaidAmount: string;
  totalTaxWithheldAmount: string;
  lastPaymentDate: string | null;
  certificateNo: string;
  filingRunStatuses?: string[];
};

export type PayrollTaxPnd1AReportSummary = {
  reportType: "PND1A";
  companyId: string | null;
  taxYearId: string | null;
  taxYear: number | null;
  employeeCount: number;
  totalPaidAmount: string;
  totalTaxWithheld: string;
  filingRunStatuses?: string[];
};

export type PayrollTaxPnd1AReportResponse = {
  summary: PayrollTaxPnd1AReportSummary;
  data: PayrollTaxPnd1AReportRow[];
};

export type PayrollTaxPnd1ADisplayBreakdownRow = {
  label: string;
  amount: string;
  source: string;
  group: string;
};

export type PayrollTaxPnd1ADisplayMonthlyBreakdown = {
  id: string;
  periodName: string;
  payrollRunName: string;
  payrollRunStatus: string;
  paymentDate: string | null;
  incomeRows: PayrollTaxPnd1ADisplayBreakdownRow[];
  deductionRows: PayrollTaxPnd1ADisplayBreakdownRow[];
  totalIncome: string;
  totalDeduction: string;
  netPay: string;
  taxableIncome: string;
  taxWithheld: string;
};

export type PayrollTaxPnd1ADetailBreakdown = {
  payrollSummary: {
    incomeRows: PayrollTaxPnd1ADisplayBreakdownRow[];
    deductionRows: PayrollTaxPnd1ADisplayBreakdownRow[];
    totalIncome: string;
    totalDeduction: string;
    netPay: string;
  };
  taxComputationRows: PayrollTaxPnd1ADisplayBreakdownRow[];
  monthlyRows: PayrollTaxPnd1ADisplayMonthlyBreakdown[];
};

export type PayrollTaxPnd1ADetailMonthlyRow = {
  id: string;
  payrollRunId: string;
  payrollItemId: string;
  payrollRunNo: string;
  payrollRunName: string;
  payrollRunStatus: string;
  periodCode: string;
  periodName: string;
  paymentDate: string | null;
  paymentYear: number | null;
  taxMonth: number | null;
  baseSalary: string;
  totalEarnings: string;
  totalDeductions: string;
  totalGrossPay: string;
  totalNetPay: string;
  taxableIncomeCurrentRun: string;
  regularTaxableIncomeCurrentRun: string;
  oneTimeTaxableIncomeCurrentRun: string;
  bonusIncome: string;
  overtimeIncome: string;
  otherTaxableIncome: string;
  projectedAnnualIncome: string;
  expenseDeduction: string;
  allowanceTotal: string;
  netTaxableIncome: string;
  annualTax: string;
  taxWithheldYtd: string;
  remainingTax: string;
  currentRunTax: string;
  roundingAdjustment: string;
  calculationStatus: string;
  calculationFormula: string | null;
  snapshot: {
    formula: string | null;
    remainingPeriods: string | number | null;
    standardAllowance: string | number | null;
    projectedAnnualIncomeBeforeCurrentOneTime: string | number | null;
    annualTaxBeforeCurrentOneTimeIncome: string | number | null;
    regularCurrentRunTaxRaw: string | number | null;
    oneTimeIncomeCurrentRunTaxRaw: string | number | null;
    uncappedCurrentRunTaxRaw: string | number | null;
  };
  lineSummary: {
    taxableEarnings: string;
    nonTaxableEarnings: string;
    socialSecurity: string;
    attendanceDeduction: string;
    leaveDeduction: string;
    taxDeduction: string;
    otherDeduction: string;
  };
  lines: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    sourceType: string;
    quantity: string | null;
    rate: string | null;
    amount: string;
    isTaxable: boolean;
    isSocialSecurityBase: boolean;
    note: string | null;
  }>;
};

export type PayrollTaxPnd1ADetailResponse = {
  summary: {
    reportType: "PND1A_DETAIL";
    companyId: string;
    taxYearId: string;
    employeeId: string;
    taxYear: number | null;
    employeeCount: number;
    payrollRunCount: number;
    totalPaidAmount: string;
    totalRegularIncome: string;
    totalOneTimeIncome: string;
    totalBonusIncome: string;
    totalOvertimeIncome: string;
    totalOtherTaxableIncome: string;
    totalExpenseDeduction: string;
    totalAllowance: string;
    totalNetTaxableIncome: string;
    annualTaxEstimate: string;
    totalTaxWithheldAmount: string;
    lastPaymentDate: string | null;
    averageWithholdingRate: string;
    filingRunStatuses?: string[];
  };
  company: {
    id: string;
    code: string;
    name: string;
    taxId: string | null;
    address: string | null;
  };
  employee: {
    id: string;
    code: string;
    name: string;
    taxId: string | null;
    address: string | null;
    branchCode: string | null;
    branchName: string | null;
    departmentName: string | null;
  };
  taxYear: {
    id: string;
    year: number | null;
    name: string | null;
    personalExpenseRate: string | null;
    personalExpenseMax: string | null;
    standardPersonalAllowance: string | null;
    taxAveragingMethod: string | null;
    roundingMethod: string | null;
  };
  taxProfile: {
    id: string;
    taxEnabled: boolean;
    maritalStatus: string | null;
    spouseHasIncome: boolean;
    updatedAt: string | null;
  } | null;
  allowances: Array<{
    id: string;
    code: string | null;
    name: string;
    declaredAmount: string;
    note: string | null;
  }>;
  breakdown?: PayrollTaxPnd1ADetailBreakdown;
  calculationBasis: {
    incomeType: string;
    incomeDescription: string;
    expenseDeductionRule: string;
    personalAllowanceRule: string;
    taxRateRule: string;
    source: string;
  };
  monthlyRows: PayrollTaxPnd1ADetailMonthlyRow[];
};

export type PayrollTaxWithholdingCertificateDraft = {
  certificateType: string;
  certificateNo: string;
  issueDate: string | null;
  status: string;
  note: string;
  company: {
    id: string;
    code: string;
    name: string;
    taxId: string | null;
    address: string | null;
  };
  employee: {
    id: string;
    code: string;
    name: string;
    taxId: string | null;
    address: string | null;
  };
  taxYear: { id: string; year: number | null; name: string | null };
  incomeType: string;
  incomeTypeCode: string;
  paidAmount: string;
  taxWithheldAmount: string;
  paymentCount: number;
  lastPaymentDate: string | null;
  rows: PayrollTaxMonthlyReportRow[];
};

/* ---------------------------------------------------------------- */
/* บันไดค่าชดเชย (พ.ร.บ.คุ้มครองแรงงาน ม.118)                        */
/* ---------------------------------------------------------------- */

export type SeveranceTier = {
  id?: string;
  /** อายุงานขั้นต่ำเป็นเดือนที่ได้ขั้นนี้ */
  minServiceMonths: number;
  /** จำนวนวันค่าจ้างที่ได้รับ */
  payDays: number;
  note?: string | null;
};

export type SeveranceTierInput = {
  minServiceMonths: number;
  payDays: number;
  note?: string;
};

export type SeveranceTiersResponse = {
  companyId: string;
  /** true = ยังไม่ได้ตั้งเอง ระบบใช้ขั้นต่ำตามกฎหมายให้ */
  usingStatutoryDefault: boolean;
  tiers: SeveranceTier[];
  statutoryTiers: Array<{ minServiceMonths: number; payDays: number }>;
};
