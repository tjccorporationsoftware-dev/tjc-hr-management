export type MasterStatus = "ACTIVE" | "INACTIVE";

export type OvertimeRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type OvertimeWorkType = "WORKDAY" | "HOLIDAY" | "SPECIAL_HOLIDAY";

/** ผลจาก GET /overtime/requests/day-type — ระบบตัดสินประเภทวันจากปฏิทินวันหยุดให้ */
export type OvertimeDayTypePreview = {
  workDate: string;
  workType: OvertimeWorkType;
  label: string;
  holidayName: string | null;
  reason: string;
};

/** "เวลาคำนวณ" — เริ่มคำนวณทันที หรือเริ่มนับหลังผ่านขั้นต่ำ */
export type OvertimeCalcStartMode = "IMMEDIATE" | "AFTER_MIN_MINUTES";

/** "การปัดเศษชั่วโมง" ก่อนคูณอัตรา */
export type OvertimeHourRoundingMode =
  | "NONE"
  | "HALF_HOUR_DOWN"
  | "HALF_HOUR_UP"
  | "HOUR_DOWN"
  | "HOUR_UP";

/** "ปัดเศษจำนวนเงิน" หลังคูณอัตรา */
export type OvertimeAmountRoundingMode =
  | "NONE"
  | "ROUND_DOWN"
  | "ROUND_UP"
  | "ROUND_NEAREST";

export type OvertimeApprovalAction = "SUBMIT" | "APPROVE" | "REJECT" | "CANCEL";

export type DecimalLike = number | string;

export type OvertimeCompany = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type OvertimeEmployeeType = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type OvertimeEmployee = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  positionId?: string | null;
  userId?: string | null;
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
  positionMaster?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
    level?: number | null;
    sortOrder?: number | null;
  } | null;
  user?: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
  } | null;
};

export type OvertimeUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type OvertimeAttachment = {
  id: string;
  overtimeRequestId: string;

  title: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  storageProvider: string;
  storageKey: string;
  bucketName?: string | null;
  description?: string | null;

  uploadedById?: string | null;
  createdAt: string;
  deletedAt?: string | null;

  uploadedBy?: OvertimeUser | null;
};

export type OvertimePolicy = {
  id: string;
  companyId: string;
  branchId?: string | null;
  employeeTypeId?: string | null;

  code: string;
  nameTh: string;
  nameEn?: string | null;
  description?: string | null;

  workType: OvertimeWorkType;
  rateMultiplier: DecimalLike;
  minMinutes: number;
  maxHoursPerDay?: DecimalLike | null;

  calcStartMode: OvertimeCalcStartMode;
  hourRoundingMode: OvertimeHourRoundingMode;
  amountRoundingMode: OvertimeAmountRoundingMode;
  includeInTax: boolean;
  includeInSocialSecurity: boolean;

  requireApproval: boolean;

  status: MasterStatus;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  company?: OvertimeCompany;
  branch?: (OvertimeCompany & { companyId?: string }) | null;
  employeeType?: OvertimeEmployeeType | null;
};


export type OvertimeApprovalStepStatus =
  | "WAITING"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "SKIPPED";

export type OvertimeApprovalStepApproverType =
  | "SUPERVISOR"
  | "POSITION"
  | "EMPLOYEE"
  | "ROLE"
  | "HR_ADMIN"
  | "EXECUTIVE";

export type OvertimeApprovalStep = {
  id: string;
  overtimeRequestId: string;
  matrixId?: string | null;
  matrixStepId?: string | null;
  stepNo: number;
  nameTh: string;
  description?: string | null;
  approverType: OvertimeApprovalStepApproverType;
  expectedApproverId?: string | null;
  expectedEmployeeId?: string | null;
  positionId?: string | null;
  roleCode?: string | null;
  minApproverCount?: number | null;
  approvedCount?: number | null;
  status: OvertimeApprovalStepStatus;
  actedById?: string | null;
  actedAt?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
  expectedApprover?: OvertimeUser | null;
  expectedEmployee?: (Pick<
    OvertimeEmployee,
    | "id"
    | "employeeCode"
    | "title"
    | "firstName"
    | "lastName"
    | "displayName"
    | "position"
    | "userId"
    | "positionMaster"
    | "user"
  >) | null;
  position?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
    level?: number | null;
  } | null;
  actedBy?: OvertimeUser | null;
};

export type OvertimeApprovalLog = {
  id: string;
  overtimeRequestId: string;

  action: OvertimeApprovalAction;
  oldStatus?: OvertimeRequestStatus | null;
  newStatus?: OvertimeRequestStatus | null;

  reason?: string | null;
  note?: string | null;

  approvedById?: string | null;
  createdAt: string;

  approvedBy?: OvertimeUser | null;
};

export type OvertimeRequest = {
  id: string;
  requestNo?: string | null;

  employeeId: string;

  workDate: string;
  startTime: string;
  endTime: string;

  breakMinutes: number;
  totalHours: DecimalLike;

  workType: OvertimeWorkType;

  reason: string;
  note?: string | null;

  status: OvertimeRequestStatus;

  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;

  submittedById?: string | null;
  cancelledById?: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  employee: OvertimeEmployee;
  approvedBy?: OvertimeUser | null;
  submittedBy?: OvertimeUser | null;
  cancelledBy?: OvertimeUser | null;
  approvalLogs?: OvertimeApprovalLog[];
  approvalSteps?: OvertimeApprovalStep[];
  attachments?: OvertimeAttachment[];
};

export type PaginatedMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OvertimePolicyListParams = {
  companyId?: string;
  branchId?: string;
  employeeTypeId?: string;
  workType?: "" | OvertimeWorkType;
  status?: "" | MasterStatus;
  search?: string;
};

export type OvertimePolicyListSummary = {
  total: number;
  active: number;
  inactive: number;
  workday: number;
  holiday: number;
  specialHoliday: number;
  requireApproval: number;
  averageRate: number | string;
};

export type CreateOvertimePolicyForm = {
  companyId: string;
  branchId?: string | null;
  employeeTypeId?: string | null;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  description?: string | null;
  workType?: OvertimeWorkType;
  rateMultiplier: number;
  minMinutes?: number;
  maxHoursPerDay?: number | null;
  calcStartMode?: OvertimeCalcStartMode;
  hourRoundingMode?: OvertimeHourRoundingMode;
  amountRoundingMode?: OvertimeAmountRoundingMode;
  includeInTax?: boolean;
  includeInSocialSecurity?: boolean;
  requireApproval?: boolean;
  status?: MasterStatus;
};

export type UpdateOvertimePolicyForm = Partial<CreateOvertimePolicyForm>;

/* ------------------------------------------------------------------ */
/* matrix : OT ประเภทวัน 1 ชนิด × ประเภทพนักงานทั้งหมด                   */
/* ------------------------------------------------------------------ */

export type OvertimeMatrixInheritedFrom = "COMPANY" | "ALL_EMPLOYEE_TYPES";

export type OvertimeMatrixRow = {
  employeeType: OvertimeEmployeeType;
  policy: OvertimePolicy | null;
  /** true = ตั้งค่าเฉพาะขอบเขตนี้เอง / false = สืบทอดมา */
  isOwnScope: boolean;
  inheritedFrom: OvertimeMatrixInheritedFrom | null;
};

export type OvertimeMatrixResponse = {
  workType: OvertimeWorkType;
  branchId: string | null;
  employeeTypes: OvertimeEmployeeType[];
  rows: OvertimeMatrixRow[];
  overriddenBranches: Array<{
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  }>;
  summary: {
    configured: number;
    enabled: number;
    inherited: number;
    missing: number;
  };
};

export type SaveOvertimeMatrixRowForm = {
  employeeTypeId: string;
  enabled?: boolean;
  rateMultiplier: number;
  minMinutes?: number;
  maxHoursPerDay?: number | null;
  calcStartMode?: OvertimeCalcStartMode;
  hourRoundingMode?: OvertimeHourRoundingMode;
  amountRoundingMode?: OvertimeAmountRoundingMode;
  includeInTax?: boolean;
  includeInSocialSecurity?: boolean;
  requireApproval?: boolean;
};

export type SaveOvertimeMatrixForm = {
  companyId: string;
  branchId?: string | null;
  workType: OvertimeWorkType;
  nameTh?: string;
  nameEn?: string | null;
  description?: string | null;
  rows: SaveOvertimeMatrixRowForm[];
};

export type SetOvertimeMatrixStatusForm = {
  companyId: string;
  branchId?: string | null;
  workType: OvertimeWorkType;
  enabled: boolean;
};

export type OvertimeRequestListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  employeeId?: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  divisionId?: string;
  employeeTypeId?: string;
  status?: "" | OvertimeRequestStatus;
  excludeDraft?: "true" | "false" | "1" | "0";
  workType?: "" | OvertimeWorkType;
  dateFrom?: string;
  dateTo?: string;
  attachmentStatus?: "HAS_ATTACHMENT" | "NO_ATTACHMENT";
};

export type CreateOvertimeRequestForm = {
  employeeId?: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  workType?: OvertimeWorkType;
  reason: string;
  note?: string;
  submit?: boolean;
};

export type UpdateOvertimeRequestForm = {
  workDate?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  workType?: OvertimeWorkType;
  reason?: string;
  note?: string | null;
};

export type OvertimeRequestActionForm = {
  reason?: string;
  note?: string;
};

export type OvertimeRequestListSummary = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
  totalHours: number;
  approvedHours: number;
  workday?: number;
  holiday?: number;
  specialHoliday?: number;
  teamTotal?: number;
};

export type OvertimeRequestListResponse = {
  items: OvertimeRequest[];
  meta: PaginatedMeta;
  summary: OvertimeRequestListSummary;
};