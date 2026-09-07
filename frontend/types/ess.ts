export type EssCompany = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type EssOrgUnit = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type EssEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  status?: string | null;
  company?: EssCompany | null;
  branch?: EssOrgUnit | null;
  department?: EssOrgUnit | null;
  division?: EssOrgUnit | null;
  employeeType?: EssOrgUnit | null;
  profile?: Record<string, unknown> | null;
};

export type EssMeResponse = {
  user: {
    id?: string;
    email?: string;
    displayName?: string;
  };
  employee: EssEmployee;
};

export type EssLocation = {
  id: string;
  code: string;
  nameTh: string;
};

export type EssDevice = {
  id: string;
  code: string;
  name: string;
};

export type EssAttendanceLog = {
  id: string;
  workDate?: string | null;
  logTime?: string | null;
  logType?: string | null;
  session?: string | null;
  channel?: string | null;
  status?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  accuracy?: string | number | null;
  note?: string | null;
  location?: EssLocation | null;
  device?: EssDevice | null;
  createdAt?: string | null;
};

export type EssLeaveType = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  description?: string | null;
  isPaid?: boolean | null;
  requiresAttachment?: boolean | null;
  allowHalfDay?: boolean | null;
  allowHourly?: boolean | null;
  deductQuota?: boolean | null;
  affectAttendance?: boolean | null;
  affectPayroll?: boolean | null;
  minLeaveUnitMinutes?: number | null;
  maxLeaveDaysPerRequest?: number | string | null;
  allowBackdated?: boolean | null;
  maxBackdatedDays?: number | null;
  backdatedRequiresAttachment?: boolean | null;
  backdatedRequiresHrApproval?: boolean | null;
  allowNegativeBalance?: boolean | null;
  negativeBalanceMode?: string | null;
  includeHoliday?: boolean | null;
  includeWeekend?: boolean | null;
  attachmentRequiredAfterDays?: number | string | null;
};

export type EssLeaveBalance = {
  id: string;
  year: number;
  leaveType?: EssLeaveType | null;
  entitlementDays: number;
  carriedForwardDays: number;
  adjustedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  note?: string | null;
};

export type EssAttachment = {
  id: string;
  title: string;
  description?: string | null;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  storageProvider?: string | null;
  storageKey?: string | null;
  bucketName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  uploadedAt?: string | null;
  uploadedById?: string | null;
  uploadedBy?: {
    id: string;
    email?: string | null;
    displayName?: string | null;
  } | null;
};


export type EssApprovalUserSummary = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

export type EssApprovalEmployeeSummary = {
  id: string;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  position?: string | null;
};

export type EssApprovalPositionSummary = {
  id: string;
  code?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
};

export type EssLeaveApprovalStep = {
  id: string;
  stepNo: number;
  nameTh: string;
  description?: string | null;
  approverType?: string | null;
  roleCode?: string | null;
  status?: string | null;
  reason?: string | null;
  note?: string | null;
  actedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  expectedApprover?: EssApprovalUserSummary | null;
  expectedEmployee?: EssApprovalEmployeeSummary | null;
  position?: EssApprovalPositionSummary | null;
  actedBy?: EssApprovalUserSummary | null;
};

export type EssLeaveApprovalLog = {
  id: string;
  action?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt?: string | null;
  approvedBy?: EssApprovalUserSummary | null;
};

export type EssOvertimeApprovalStep = {
  id: string;
  stepNo: number;
  nameTh: string;
  description?: string | null;
  approverType?: string | null;
  roleCode?: string | null;
  status?: string | null;
  reason?: string | null;
  note?: string | null;
  actedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  expectedApprover?: EssApprovalUserSummary | null;
  expectedEmployee?: EssApprovalEmployeeSummary | null;
  position?: EssApprovalPositionSummary | null;
  actedBy?: EssApprovalUserSummary | null;
};

export type EssOvertimeApprovalLog = {
  id: string;
  action?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt?: string | null;
  approvedBy?: EssApprovalUserSummary | null;
};

export type EssTimeAdjustApprovalStep = {
  id: string;
  stepNo: number;
  nameTh: string;
  description?: string | null;
  approverType?: string | null;
  roleCode?: string | null;
  status?: string | null;
  reason?: string | null;
  note?: string | null;
  actedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  expectedApprover?: EssApprovalUserSummary | null;
  expectedEmployee?: EssApprovalEmployeeSummary | null;
  position?: EssApprovalPositionSummary | null;
  actedBy?: EssApprovalUserSummary | null;
};

export type EssTimeAdjustLog = {
  id: string;
  action?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt?: string | null;
  actedBy?: EssApprovalUserSummary | null;
};

export type EssJsonObject = Record<string, unknown>;

export type EssLeaveRequest = {
  id: string;
  requestNo?: string | null;
  leaveType?: EssLeaveType | null;
  startDate?: string | null;
  endDate?: string | null;
  totalDays?: number | string | null;
  totalMinutes?: number | string | null;
  dayType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isRetroactive?: boolean | null;
  retroactiveReason?: string | null;
  reason?: string | null;
  contactInfo?: string | null;
  note?: string | null;
  status?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  requiresPayrollCorrection?: boolean | null;
  policySnapshot?: EssJsonObject | null;
  balanceSnapshotBefore?: EssJsonObject | null;
  balanceSnapshotAfter?: EssJsonObject | null;
  approvalSteps?: EssLeaveApprovalStep[];
  approvalLogs?: EssLeaveApprovalLog[];
  attachments?: EssAttachment[];
};

export type EssOvertimeRequest = {
  id: string;
  requestNo?: string | null;
  workDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | string | null;
  totalHours?: number | string | null;
  workType?: string | null;
  reason?: string | null;
  note?: string | null;
  status?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  approvalSteps?: EssOvertimeApprovalStep[];
  approvalLogs?: EssOvertimeApprovalLog[];
  attachments?: EssAttachment[];
};

export type EssTimeAdjustRequest = {
  id: string;
  requestNo?: string | null;
  originalAttendanceLogId?: string | null;
  appliedAttendanceLogId?: string | null;
  adjustType?: string | null;
  targetLogType?: string | null;
  requestedLogTime?: string | null;
  requestedLogType?: string | null;
  reason?: string | null;
  note?: string | null;
  status?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  originalAttendanceLog?: Record<string, unknown> | null;
  appliedAttendanceLog?: Record<string, unknown> | null;
  approvalSteps?: EssTimeAdjustApprovalStep[];
  logs?: EssTimeAdjustLog[];
  attachments?: EssAttachment[];
};

export type EssDashboardResponse = {
  employee: EssEmployee;
  metrics: {
    todayAttendanceCount: number;
    leaveTypeCount: number;
    pendingLeaveCount: number;
    pendingOvertimeCount: number;
    pendingTimeAdjustCount: number;
  };
  todayAttendance: EssAttendanceLog[];
  leaveSummary: EssLeaveBalance[];
  recentLeaveRequests: EssLeaveRequest[];
  recentOvertimeRequests: EssOvertimeRequest[];
  recentTimeAdjustRequests: EssTimeAdjustRequest[];
};

export type EssListParams = {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
};

export type EssLeaveRequestListParams = EssListParams & {
  year?: number;
  status?: string;
  leaveTypeId?: string;
  search?: string;
};

export type EssOvertimeRequestListParams = EssListParams & {
  year?: number;
  status?: string;
  workType?: string;
  search?: string;
};

export type EssTimeAdjustRequestListParams = EssListParams & {
  year?: number;
  status?: string;
  adjustType?: string;
  targetLogType?: string;
  search?: string;
};

export type EssYearParams = {
  year?: number;
};

export type EssBaseRequestSummary = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
};

export type EssLeaveRequestSummary = EssBaseRequestSummary & {
  totalDays: number;
};

export type EssOvertimeRequestSummary = EssBaseRequestSummary & {
  totalHours: number;
  approvedHours: number;
};

export type EssTimeAdjustRequestSummary = EssBaseRequestSummary;

export type EssListResponse<T, Summary = undefined> = {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: Summary;
};

export type CreateEssLeaveRequestForm = {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  dayType?: "FULL_DAY" | "HALF_DAY_MORNING" | "HALF_DAY_AFTERNOON" | "HOURLY";
  startTime?: string;
  endTime?: string;
  totalMinutes?: number;
  retroactiveReason?: string;
  reason: string;
  contactInfo?: string;
  note?: string;
  submit?: boolean;
};

export type EssOvertimeWorkType = "WORKDAY" | "HOLIDAY" | "SPECIAL_HOLIDAY";

/** ประเภทวันที่ระบบจับให้จากปฏิทินวันหยุด ผู้ยื่นเลือกเองไม่ได้ */
export type EssOvertimeDayType = {
  workDate: string;
  workType: EssOvertimeWorkType;
  label: string;
  holidayName: string | null;
  reason: string;
};

export type CreateEssOvertimeRequestForm = {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  reason: string;
  note?: string;
  submit?: boolean;
};

export type CreateEssTimeAdjustRequestForm = {
  originalAttendanceLogId?: string | null;
  adjustType:
    | "MISSING_CHECK_IN"
    | "MISSING_CHECK_OUT"
    | "WRONG_TIME"
    | "DEVICE_ERROR"
    | "OUTSIDE_WORK"
    | "OTHER";
  targetLogType: "CHECK_IN" | "CHECK_OUT" | "BREAK_START" | "BREAK_END";
  requestedLogTime: string;
  reason: string;
  note?: string | null;
  submit?: boolean;
};

export type EssRequestActionForm = {
  reason?: string;
  note?: string;
};

export type UploadEssAttachmentForm = {
  title: string;
  description?: string;
  file: File;
};

export type EssSalarySlipEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  company?: EssCompany | null;
  branch?: EssOrgUnit | null;
  department?: EssOrgUnit | null;
  employeeType?: EssOrgUnit | null;
};

export type EssSalarySlip = {
  id: string;
  year: number;
  month: number;
  period: {
    label: string;
    dateFrom: string;
    dateTo: string;
  };
  employee: EssSalarySlipEmployee;
  earnings: {
    baseSalary: number;
    allowanceAmount: number;
    bonusAmount: number;
    overtimeAmount: number;
    totalEarnings: number;
  };
  deductions: {
    socialSecurityEmployee: number;
    taxAmount: number;
    absenceDeduction: number;
    lateDeduction: number;
    otherDeduction: number;
    totalDeductions: number;
  };
  overtime: {
    approvedOtCount: number;
    approvedOtHours: number;
    approvedOtAmount: number;
  };
  netPay: number;
  status: string;
  warning?: string;
};

export type EssSalarySlipListResponse = {
  employee: EssSalarySlipEmployee;
  year: number;
  items: EssSalarySlip[];
  warning?: string;
};

export type EssSalarySlipListParams = {
  year?: number;
};

export type EssScheduleEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  company?: EssCompany | null;
  branch?: EssOrgUnit | null;
  department?: EssOrgUnit | null;
  employeeType?: EssOrgUnit | null;
};

export type EssScheduleDayType =
  | "WORKDAY"
  | "WEEKEND"
  | "HOLIDAY"
  | "LEAVE"
  | "OVERTIME"
  | "ATTENDANCE"
  | "TIME_ADJUST";

export type EssScheduleDayStatus =
  | "NORMAL"
  | "HAS_ATTENDANCE"
  | "ON_LEAVE"
  | "HAS_OT"
  | "HAS_TIME_ADJUST"
  | "MIXED";

export type EssScheduleDay = {
  date: string;
  dayOfMonth: number;
  dayName: string;
  isWeekend: boolean;
  /** วันหยุดพิเศษของบริษัท (ไม่รวมวันหยุดประจำสัปดาห์) */
  isHoliday?: boolean;
  holidayName?: string | null;
  types: EssScheduleDayType[];
  status: EssScheduleDayStatus;
  attendanceLogs: EssAttendanceLog[];
  leaveRequests: EssLeaveRequest[];
  overtimeRequests: EssOvertimeRequest[];
  timeAdjustRequests: EssTimeAdjustRequest[];
};

export type EssScheduleResponse = {
  employee: EssScheduleEmployee;
  year: number;
  month: number;
  period: {
    label: string;
    dateFrom: string;
    dateTo: string;
  };
  summary: {
    workDays: number;
    weekendDays: number;
    attendanceDays: number;
    leaveDays: number;
    overtimeDays: number;
    timeAdjustDays: number;
  };
  days: EssScheduleDay[];
  warning?: string;
};

export type EssScheduleParams = {
  year?: number;
  month?: number;
};