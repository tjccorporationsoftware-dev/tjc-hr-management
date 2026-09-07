export type MasterStatus = "ACTIVE" | "INACTIVE";

export type LeaveRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type LeaveDayType =
  | "FULL_DAY"
  | "HALF_DAY_MORNING"
  | "HALF_DAY_AFTERNOON"
  | "HOURLY";

export type LeaveApprovalAction = "SUBMIT" | "APPROVE" | "REJECT" | "CANCEL";

export type LeaveApprovalStepStatus =
  | "WAITING"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "SKIPPED";

export type ApprovalStepApproverType =
  | "SUPERVISOR"
  | "POSITION"
  | "EMPLOYEE"
  | "ROLE"
  | "HR_ADMIN"
  | "EXECUTIVE";

export type DecimalLike = number | string;

export type LeaveCompany = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type LeaveEmployeeType = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type LeaveEmployee = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  positionId?: string | null;
  positionMaster?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
    level?: number | null;
    sortOrder?: number | null;
  } | null;
  supervisorId?: string | null;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  divisionId?: string | null;
  employeeTypeId?: string | null;
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
  division?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  employeeType?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  avatarUrl?: string | null;
  profileImageUrl?: string | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
  user?: {
    id?: string | null;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    profileImageUrl?: string | null;
    imageUrl?: string | null;
    photoUrl?: string | null;
  } | null;
};

export type LeaveUser = {
  id: string;
  email: string;
  displayName: string;
};

/** เงื่อนไข "ลาได้ทั้งเพศชายและเพศหญิง / เฉพาะเพศหญิง / เฉพาะเพศชาย" */
export type LeaveGenderEligibility = "ALL" | "MALE" | "FEMALE";

/** เงื่อนไข "นับอายุงานจากวันที่เริ่มงาน / วันที่บรรจุ" */
export type LeaveServiceStartBasis = "HIRE_DATE" | "PROBATION_PASS_DATE";

/** เงื่อนไข "ไม่ปัดเศษ / ปัดให้เต็มครึ่งชั่วโมงลา / ปัดให้เต็มครึ่งวันลา" */
export type LeaveRoundingMode = "NONE" | "HALF_HOUR_UP" | "HALF_DAY_UP";

export type LeaveQuotaDisplayUnit = "DAY" | "HOUR";

/** คอลัมน์ "ระยะเวลาทำงาน / โควตา" — โควตาขั้นบันไดตามอายุงาน */
export type LeaveQuotaTier = {
  id: string;
  policyId: string;
  minServiceMonths: number;
  quotaDays: DecimalLike;
  sortOrder: number;
};

export type LeaveType = {
  id: string;
  companyId: string;
  catalogId?: string | null;
  referenceCode?: string | null;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  description?: string | null;
  isPaid: boolean;
  requiresAttachment: boolean;
  allowHalfDay: boolean;
  allowHourly: boolean;
  deductQuota?: boolean;
  affectAttendance?: boolean;
  affectPayroll?: boolean;
  minLeaveUnitMinutes?: number;
  maxLeaveDaysPerRequest?: DecimalLike | null;
  /** ลาล่วงหน้า — ต้องยื่นก่อนวันลาอย่างน้อยกี่วัน */
  advanceNoticeDays?: number;
  allowBackdated?: boolean;
  /** ลาย้อนหลัง */
  maxBackdatedDays?: number;
  backdatedRequiresAttachment?: boolean;
  backdatedRequiresHrApproval?: boolean;
  allowNegativeBalance?: boolean;
  negativeBalanceMode?: string | null;
  /** ห้ามลาเกินโควตา */
  enforceQuotaLimit?: boolean;
  includeHoliday?: boolean;
  includeWeekend?: boolean;
  attachmentRequiredAfterDays?: DecimalLike | null;
  /** จำนวนปีสะสม */
  quotaAccrualYears?: number;
  genderEligibility?: LeaveGenderEligibility;
  serviceStartBasis?: LeaveServiceStartBasis;
  /** ต้องผ่านการบรรจุก่อนถึงจะยื่นลาประเภทนี้ได้ (คนละเรื่องกับฐานนับอายุงาน) */
  requireProbationPassed?: boolean;
  /** เฉลี่ยโควตาในปี */
  prorateFirstYear?: boolean;
  roundingMode?: LeaveRoundingMode;
  quotaDisplayUnit?: LeaveQuotaDisplayUnit;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: LeaveCompany;
  catalog?: LeaveTypeCatalogItem | null;
  policies?: LeavePolicy[];
};

/** ประเภทการลามาตรฐานระดับระบบ (ยังไม่ผูกกับบริษัท) */
export type LeaveTypeCatalogItem = {
  id: string;
  referenceCode: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  description?: string | null;
  sortOrder: number;
  isSystem: boolean;
  isPaid: boolean;
  requiresAttachment: boolean;
  advanceNoticeDays: number;
  maxBackdatedDays: number;
  quotaAccrualYears: number;
  genderEligibility: LeaveGenderEligibility;
  serviceStartBasis: LeaveServiceStartBasis;
  /** ต้องผ่านการบรรจุก่อนถึงจะยื่นลาประเภทนี้ได้ (คนละเรื่องกับฐานนับอายุงาน) */
  requireProbationPassed: boolean;
  prorateFirstYear: boolean;
  roundingMode: LeaveRoundingMode;
  quotaDisplayUnit: LeaveQuotaDisplayUnit;
  enforceQuotaLimit: boolean;
  includeHoliday: boolean;
  includeWeekend: boolean;
  defaultMaxConsecutiveDays?: number | null;
  defaultAnnualQuotaDays: DecimalLike;
  defaultUnpaidDeductionMultiplier: DecimalLike;
  defaultIncludeInTax: boolean;
  defaultIncludeInSocialSecurity: boolean;
  defaultAllowCarryForward: boolean;
  status: MasterStatus;
};

/** 1 แถวในรายการซ้ายมือของหน้าตั้งค่าการลา */
export type LeaveCatalogRow = LeaveTypeCatalogItem & {
  /** บริษัทนี้เปิดใช้แล้วหรือยัง */
  enabled: boolean;
  companyLeaveType: LeaveType | null;
};

export type LeaveCatalogListResponse = {
  companyId: string;
  items: LeaveCatalogRow[];
  customTypes: LeaveType[];
  summary: {
    total: number;
    enabled: number;
    custom: number;
  };
};

/** 1 แถวของตาราง "โควตาตามประเภทพนักงาน" */
export type LeavePolicyMatrixRow = {
  employeeType: LeaveEmployeeType;
  policy: LeavePolicy | null;
  /** true = ตั้งค่าเฉพาะขอบเขตนี้เอง, false = สืบทอดมา */
  isOwnScope: boolean;
  inheritedFrom: "COMPANY" | "ALL_EMPLOYEE_TYPES" | null;
};

export type LeaveTypeMatrixResponse = {
  leaveType: LeaveType;
  branchId: string | null;
  employeeTypes: LeaveEmployeeType[];
  rows: LeavePolicyMatrixRow[];
  overriddenBranches: Array<{
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  }>;
};

export type SaveLeaveTypeMatrixForm = {
  branchId?: string | null;
  nameTh?: string;
  nameEn?: string | null;
  description?: string | null;
  isPaid?: boolean;
  requiresAttachment?: boolean;
  attachmentRequiredAfterDays?: number | null;
  allowHalfDay?: boolean;
  allowHourly?: boolean;
  minLeaveUnitMinutes?: number;
  maxLeaveDaysPerRequest?: number | null;
  deductQuota?: boolean;
  affectAttendance?: boolean;
  affectPayroll?: boolean;
  advanceNoticeDays?: number;
  allowBackdated?: boolean;
  maxBackdatedDays?: number;
  backdatedRequiresAttachment?: boolean;
  backdatedRequiresHrApproval?: boolean;
  enforceQuotaLimit?: boolean;
  includeHoliday?: boolean;
  includeWeekend?: boolean;
  quotaAccrualYears?: number;
  genderEligibility?: LeaveGenderEligibility;
  serviceStartBasis?: LeaveServiceStartBasis;
  /** ต้องผ่านการบรรจุก่อนถึงจะยื่นลาประเภทนี้ได้ (คนละเรื่องกับฐานนับอายุงาน) */
  requireProbationPassed?: boolean;
  prorateFirstYear?: boolean;
  roundingMode?: LeaveRoundingMode;
  quotaDisplayUnit?: LeaveQuotaDisplayUnit;
  status?: MasterStatus;
  policies?: Array<{
    employeeTypeId?: string | null;
    annualQuotaDays: number;
    maxConsecutiveDays?: number | null;
    allowCarryForward?: boolean;
    carryForwardLimitDays?: number;
    requireApproval?: boolean;
    unpaidDeductionMultiplier?: number;
    includeInTax?: boolean;
    includeInSocialSecurity?: boolean;
    status?: MasterStatus;
    quotaTiers?: Array<{ minServiceMonths: number; quotaDays: number }>;
  }>;
};

export type CopyLeavePolicyForm = {
  fromCompanyId: string;
  fromBranchId?: string | null;
  toCompanyId: string;
  toBranchId?: string | null;
  mode?: "MERGE" | "REPLACE";
  catalogIds?: string[];
};

export type CopyLeavePolicyResult = {
  copiedLeaveTypes: number;
  copiedPolicies: number;
  mode: "MERGE" | "REPLACE";
};

export type LeavePolicy = {
  id: string;
  companyId: string;
  branchId?: string | null;
  leaveTypeId: string;
  employeeTypeId?: string | null;
  annualQuotaDays: DecimalLike;
  maxConsecutiveDays?: number | null;
  allowCarryForward: boolean;
  carryForwardLimitDays: DecimalLike;
  requireApproval: boolean;
  /** ค่าปรับ — หักค่าจ้างกี่เท่าต่อวันลา */
  unpaidDeductionMultiplier?: DecimalLike;
  /** นำไปคำนวณ */
  includeInTax?: boolean;
  includeInSocialSecurity?: boolean;
  quotaTiers?: LeaveQuotaTier[];
  quotaPeriod?: string | null;
  monthlyAccrualDays?: DecimalLike | null;
  probationEligibleAfterDays?: number | null;
  carryForwardExpireMonth?: number | null;
  carryForwardExpireDay?: number | null;
  maxBackdatedDaysOverride?: number | null;
  requireAttachmentAfterDays?: DecimalLike | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: LeaveCompany;
  branch?: (LeaveCompany & { companyId?: string }) | null;
  leaveType?: Pick<
    LeaveType,
    | "id"
    | "code"
    | "nameTh"
    | "nameEn"
    | "isPaid"
    | "requiresAttachment"
    | "status"
  >;
  employeeType?: LeaveEmployeeType | null;
};

export type LeaveBalance = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitlementDays: number;
  carriedForwardDays: number;
  adjustedDays: number;
  usedDays: number;
  pendingDays: number;
  totalAvailableBeforeUsed: number;
  remainingDays: number;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: LeaveEmployee;
  leaveType: Pick<
    LeaveType,
    | "id"
    | "code"
    | "nameTh"
    | "nameEn"
    | "isPaid"
    | "requiresAttachment"
    | "deductQuota"
    | "affectAttendance"
    | "affectPayroll"
    | "allowBackdated"
    | "backdatedRequiresAttachment"
  >;
};

export type LeaveApprovalLog = {
  id: string;
  leaveRequestId: string;
  action: LeaveApprovalAction;
  oldStatus?: LeaveRequestStatus | null;
  newStatus?: LeaveRequestStatus | null;
  reason?: string | null;
  note?: string | null;
  approvedById?: string | null;
  createdAt: string;
  approvedBy?: LeaveUser | null;
};

export type LeaveAttachment = {
  id: string;
  leaveRequestId?: string;
  title: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  storageProvider?: string | null;
  storageKey: string;
  bucketName?: string | null;
  description?: string | null;
  uploadedById?: string | null;
  createdAt: string;
  uploadedBy?: LeaveUser | null;
};

export type LeaveApprovalStep = {
  id: string;
  leaveRequestId: string;
  matrixId?: string | null;
  matrixStepId?: string | null;
  stepNo: number;
  nameTh: string;
  description?: string | null;
  approverType: ApprovalStepApproverType;
  expectedApproverId?: string | null;
  expectedEmployeeId?: string | null;
  positionId?: string | null;
  roleCode?: string | null;
  minApproverCount: number;
  approvedCount: number;
  status: LeaveApprovalStepStatus;
  actedById?: string | null;
  actedAt?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  expectedApprover?: LeaveUser | null;
  expectedEmployee?: {
    id: string;
    employeeCode: string;
    title?: string | null;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    position?: string | null;
    userId?: string | null;
    avatarUrl?: string | null;
    profileImageUrl?: string | null;
    imageUrl?: string | null;
    photoUrl?: string | null;
    user?: {
      id?: string | null;
      email?: string | null;
      displayName?: string | null;
      avatarUrl?: string | null;
      profileImageUrl?: string | null;
      imageUrl?: string | null;
      photoUrl?: string | null;
    } | null;
    positionMaster?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
  } | null;
  position?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
    level?: number | null;
  } | null;
  actedBy?: LeaveUser | null;
};

export type LeaveRequest = {
  id: string;
  requestNo?: string | null;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  dayType: LeaveDayType;
  totalDays: DecimalLike;
  startTime?: string | null;
  endTime?: string | null;
  totalMinutes?: number | null;
  isRetroactive?: boolean | null;
  retroactiveReason?: string | null;
  requiresPayrollCorrection?: boolean | null;
  correctionPayrollPeriodId?: string | null;
  reason: string;
  contactInfo?: string | null;
  note?: string | null;
  status: LeaveRequestStatus;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  submittedById?: string | null;
  cancelledById?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  employee: LeaveEmployee;
  approvedBy?: LeaveUser | null;
  leaveType: Pick<
    LeaveType,
    | "id"
    | "code"
    | "nameTh"
    | "nameEn"
    | "isPaid"
    | "requiresAttachment"
    | "deductQuota"
    | "affectAttendance"
    | "affectPayroll"
    | "allowBackdated"
    | "backdatedRequiresAttachment"
  >;
  submittedBy?: LeaveUser | null;
  cancelledBy?: LeaveUser | null;
  attachments?: LeaveAttachment[];
  leaveBalance?: Pick<
    LeaveBalance,
    | "id"
    | "employeeId"
    | "leaveTypeId"
    | "year"
    | "entitlementDays"
    | "carriedForwardDays"
    | "adjustedDays"
    | "usedDays"
    | "pendingDays"
    | "totalAvailableBeforeUsed"
    | "remainingDays"
    | "note"
  > | null;
  approvalLogs?: LeaveApprovalLog[];
  approvalSteps?: LeaveApprovalStep[];
};

export type PaginatedMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type LeaveTypeListParams = {
  search?: string;
  companyId?: string;
  status?: "" | MasterStatus;
};

export type LeaveTypeListSummary = {
  total: number;
  active: number;
  inactive: number;
  paid: number;
  requiresAttachment: number;
};

export type LeavePolicyListSummary = {
  total: number;
  active: number;
  inactive: number;
  requireApproval: number;
  carryForward: number;
};

export type CreateLeaveTypeForm = {
  companyId: string;
  code: string;
  nameTh: string;
  nameEn?: string;
  description?: string;
  isPaid?: boolean;
  requiresAttachment?: boolean;
  allowHalfDay?: boolean;
  allowHourly?: boolean;
  deductQuota?: boolean;
  affectAttendance?: boolean;
  affectPayroll?: boolean;
  minLeaveUnitMinutes?: number;
  maxLeaveDaysPerRequest?: number | null;
  allowBackdated?: boolean;
  maxBackdatedDays?: number;
  backdatedRequiresAttachment?: boolean;
  backdatedRequiresHrApproval?: boolean;
  allowNegativeBalance?: boolean;
  negativeBalanceMode?: string | null;
  includeHoliday?: boolean;
  includeWeekend?: boolean;
  attachmentRequiredAfterDays?: number | null;
  status?: MasterStatus;
};

export type UpdateLeaveTypeForm = Partial<
  Omit<CreateLeaveTypeForm, "companyId">
>;

export type LeavePolicyListParams = {
  companyId?: string;
  branchId?: string;
  leaveTypeId?: string;
  employeeTypeId?: string;
  status?: "" | MasterStatus;
};

export type CreateLeavePolicyForm = {
  companyId: string;
  branchId?: string | null;
  leaveTypeId: string;
  employeeTypeId?: string | null;
  annualQuotaDays: number;
  maxConsecutiveDays?: number | null;
  allowCarryForward?: boolean;
  carryForwardLimitDays?: number;
  requireApproval?: boolean;
  quotaPeriod?: string;
  monthlyAccrualDays?: number;
  probationEligibleAfterDays?: number | null;
  carryForwardExpireMonth?: number | null;
  carryForwardExpireDay?: number | null;
  maxBackdatedDaysOverride?: number | null;
  requireAttachmentAfterDays?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  status?: MasterStatus;
};

export type UpdateLeavePolicyForm = Partial<
  Omit<CreateLeavePolicyForm, "companyId" | "leaveTypeId">
>;

export type LeaveRequestListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  employeeId?: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  divisionId?: string;
  employeeTypeId?: string;
  leaveTypeId?: string;
  status?: "" | LeaveRequestStatus;
  excludeDraft?: "true" | "false" | "1" | "0";
  dateFrom?: string;
  dateTo?: string;
  isRetroactive?: "true" | "false" | "1" | "0";
  requiresPayrollCorrection?: "true" | "false" | "1" | "0";
  attachmentStatus?: "HAS_ATTACHMENT" | "NO_ATTACHMENT" | "MISSING_REQUIRED";
  payrollImpact?: "AFFECTS_PAYROLL";
  attendanceImpact?: "AFFECTS_ATTENDANCE";
};

export type CreateLeaveRequestForm = {
  employeeId?: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  dayType?: LeaveDayType;
  startTime?: string;
  endTime?: string;
  totalMinutes?: number;
  retroactiveReason?: string;
  reason: string;
  contactInfo?: string;
  note?: string;
  submit?: boolean;
};

export type UpdateLeaveRequestForm = {
  leaveTypeId?: string;
  startDate?: string;
  endDate?: string;
  dayType?: LeaveDayType;
  startTime?: string;
  endTime?: string;
  totalMinutes?: number;
  retroactiveReason?: string;
  reason?: string;
  contactInfo?: string | null;
  note?: string | null;
};

export type LeaveRequestActionForm = {
  reason?: string;
  note?: string;
};

export type LeaveBalanceListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  employeeId?: string;
  leaveTypeId?: string;
  companyId?: string;
  year?: number;
};

export type GenerateLeaveBalancesForm = {
  employeeId: string;
  year?: number;
  overwriteEntitlement?: boolean;
};

export type GenerateLeaveBalancesBulkForm = {
  /** ไม่ส่ง = ทุกคนที่ยังทำงานอยู่ในขอบเขตของผู้ใช้ */
  employeeIds?: string[];
  branchId?: string;
  departmentId?: string;
  year?: number;
  /** true = คำนวณสิทธิ์ตามนโยบายใหม่ทับของเดิม (ไม่แตะยอดที่ปรับเองและที่ใช้ไปแล้ว) */
  overwriteEntitlement?: boolean;
};

export type GenerateLeaveBalancesBulkResult = {
  year: number;
  employeeCount: number;
  succeeded: number;
  balanceCount: number;
  overwritten: boolean;
  failed: Array<{
    employeeId: string;
    employeeCode: string;
    displayName: string | null;
    reason: string;
  }>;
};

export type UpdateLeaveBalanceForm = {
  entitlementDays?: number;
  carriedForwardDays?: number;
  adjustedDays?: number;
  note?: string | null;
};

export type LeaveRequestListSummary = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
  totalDays: number;
  onLeaveToday: number;
};

export type LeaveBalanceSummary = {
  entitlementDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

export type LeaveRequestListResponse = {
  items: LeaveRequest[];
  meta: PaginatedMeta;
  summary: LeaveRequestListSummary;
};

export type LeaveBalanceListResponse = {
  items: LeaveBalance[];
  meta: PaginatedMeta;
};

export type MyLeaveBalanceResponse = {
  items: LeaveBalance[];
  summary: LeaveBalanceSummary;
};
