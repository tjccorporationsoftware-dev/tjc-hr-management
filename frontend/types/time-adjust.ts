export type TimeAdjustRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type TimeAdjustApprovalAction =
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "CANCEL";

export type TimeAdjustType =
  | "MISSING_CHECK_IN"
  | "MISSING_CHECK_OUT"
  | "WRONG_TIME"
  | "DEVICE_ERROR"
  | "OUTSIDE_WORK"
  | "OTHER";

export type AttendanceLogType =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "BREAK_START"
  | "BREAK_END";

export type DecimalLike = number | string;

export type TimeAdjustUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  profileImageUrl?: string | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
};

export type TimeAdjustEmployee = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  divisionId?: string | null;
  employeeTypeId?: string | null;
  positionId?: string | null;
  userId?: string | null;
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
  avatarUrl?: string | null;
  profileImageUrl?: string | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
  user?: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    profileImageUrl?: string | null;
    imageUrl?: string | null;
    photoUrl?: string | null;
  } | null;
};

export type TimeAdjustAttendanceLog = {
  id: string;
  employeeId: string;
  workDate: string;
  logType: AttendanceLogType;
  logTime: string;
  session?: string | null;
  channel: string;
  status: string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type TimeAdjustLog = {
  id: string;
  timeAdjustRequestId: string;
  action: TimeAdjustApprovalAction;
  oldStatus?: TimeAdjustRequestStatus | null;
  newStatus?: TimeAdjustRequestStatus | null;
  reason?: string | null;
  note?: string | null;
  actedById?: string | null;
  createdAt: string;
  actedBy?: TimeAdjustUser | null;
};

export type TimeAdjustAttachment = {
  id: string;
  timeAdjustRequestId: string;

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

  uploadedBy?: TimeAdjustUser | null;
};


export type TimeAdjustApprovalStepStatus =
  | "WAITING"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "SKIPPED";

export type TimeAdjustApprovalStepApproverType =
  | "SUPERVISOR"
  | "POSITION"
  | "EMPLOYEE"
  | "ROLE"
  | "HR_ADMIN"
  | "EXECUTIVE";

export type TimeAdjustApprovalStep = {
  id: string;
  timeAdjustRequestId: string;
  matrixId?: string | null;
  matrixStepId?: string | null;
  stepNo: number;
  nameTh: string;
  description?: string | null;
  approverType: TimeAdjustApprovalStepApproverType;
  expectedApproverId?: string | null;
  expectedEmployeeId?: string | null;
  positionId?: string | null;
  roleCode?: string | null;
  minApproverCount?: number | null;
  approvedCount?: number | null;
  status: TimeAdjustApprovalStepStatus;
  actedById?: string | null;
  actedAt?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
  expectedApprover?: TimeAdjustUser | null;
  expectedEmployee?: (Pick<
    TimeAdjustEmployee,
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
  actedBy?: TimeAdjustUser | null;
};

export type TimeAdjustRequest = {
  id: string;
  requestNo?: string | null;

  employeeId: string;

  originalAttendanceLogId?: string | null;
  appliedAttendanceLogId?: string | null;

  adjustType: TimeAdjustType;
  targetLogType: AttendanceLogType;

  originalLogTime?: string | null;
  requestedLogTime: string;

  reason: string;
  note?: string | null;

  status: TimeAdjustRequestStatus;

  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;

  submittedById?: string | null;
  approvedById?: string | null;
  rejectedById?: string | null;
  cancelledById?: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  employee: TimeAdjustEmployee;
  originalAttendanceLog?: TimeAdjustAttendanceLog | null;
  appliedAttendanceLog?: TimeAdjustAttendanceLog | null;

  submittedBy?: TimeAdjustUser | null;
  approvedBy?: TimeAdjustUser | null;
  rejectedBy?: TimeAdjustUser | null;
  cancelledBy?: TimeAdjustUser | null;

  logs?: TimeAdjustLog[];
  approvalSteps?: TimeAdjustApprovalStep[];
  attachments?: TimeAdjustAttachment[];
};

export type PaginatedMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TimeAdjustRequestListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  employeeId?: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  divisionId?: string;
  employeeTypeId?: string;
  status?: "" | TimeAdjustRequestStatus;
  excludeDraft?: "true" | "false" | "1" | "0";
  adjustType?: "" | TimeAdjustType;
  targetLogType?: "" | AttendanceLogType;
  dateFrom?: string;
  dateTo?: string;
  attachmentStatus?: "" | "HAS_ATTACHMENT" | "NO_ATTACHMENT";
};

export type CreateTimeAdjustRequestForm = {
  employeeId?: string;
  originalAttendanceLogId?: string | null;
  adjustType: TimeAdjustType;
  targetLogType: AttendanceLogType;
  requestedLogTime: string;
  reason: string;
  note?: string | null;
  submit?: boolean;
};

export type UpdateTimeAdjustRequestForm = {
  originalAttendanceLogId?: string | null;
  adjustType?: TimeAdjustType;
  targetLogType?: AttendanceLogType;
  requestedLogTime?: string;
  reason?: string;
  note?: string | null;
};

export type TimeAdjustRequestActionForm = {
  reason?: string;
  note?: string;
};

export type TimeAdjustRequestListSummary = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
  missingCheckIn: number;
  missingCheckOut: number;
  missingPunch: number;
  wrongTime: number;
  deviceError: number;
  outsideWork: number;
  other: number;
  checkIn: number;
  checkOut: number;
  breakStart: number;
  breakEnd: number;
};

export type TimeAdjustRequestListResponse = {
  items: TimeAdjustRequest[];
  meta: PaginatedMeta;
  summary?: TimeAdjustRequestListSummary;
};

export type TimeAdjustAttendanceLogWithEmployee = TimeAdjustAttendanceLog & {
  employee?: TimeAdjustEmployee | null;
};

export type TimeAdjustEmployeeListResponse = {
  items: TimeAdjustEmployee[];
  meta: PaginatedMeta;
};

export type TimeAdjustAttendanceLogListParams = {
  page?: number;
  pageSize?: number;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type TimeAdjustAttendanceLogListResponse = {
  items: TimeAdjustAttendanceLogWithEmployee[];
  meta: PaginatedMeta;
};