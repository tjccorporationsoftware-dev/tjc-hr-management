export type ApprovalRequestKind =
  | 'ALL'
  | 'LEAVE'
  | 'OVERTIME'
  | 'TIME_ADJUST'
  | 'OFFSITE'
  | 'DOCUMENT';

export type ApprovalRequestStatusFilter =
  | 'ALL'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED';

export type ApprovalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | (string & {});

export type ApprovalStepStatus =
  | 'WAITING'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SKIPPED'
  | 'CANCELLED'
  | (string & {});

export type ApprovalEmployee = {
  id?: string | null;
  employeeCode?: string | null;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  position?: string | null;
  avatarUrl?: string | null;
  profileImageUrl?: string | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
  user?: {
    id?: string | null;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  company?: {
    id?: string;
    code?: string;
    nameTh?: string | null;
  } | null;
  branch?: {
    id?: string;
    code?: string;
    nameTh?: string | null;
  } | null;
  department?: {
    id?: string;
    code?: string;
    nameTh?: string | null;
  } | null;
  division?: {
    id?: string;
    code?: string;
    nameTh?: string | null;
  } | null;
  employeeType?: {
    id?: string;
    code?: string;
    nameTh?: string | null;
  } | null;
  positionMaster?: {
    id?: string;
    code?: string;
    nameTh?: string | null;
    nameEn?: string | null;
    level?: number | null;
  } | null;
};

export type ApprovalUser = {
  id?: string | null;
  email?: string | null;
  displayName?: string | null;
};

export type ApprovalStep = {
  id: string;
  stepNo: number;
  nameTh: string;
  description?: string | null;
  approverType?: string | null;
  expectedApproverId?: string | null;
  expectedEmployeeId?: string | null;
  positionId?: string | null;
  roleCode?: string | null;
  status: ApprovalStepStatus;
  actedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  reason?: string | null;
  note?: string | null;
  approvedBy?: ApprovalUser | null;
  actedBy?: ApprovalUser | null;
  expectedApprover?: ApprovalUser | null;
  expectedEmployee?: ApprovalEmployee | null;
  position?: {
    id?: string;
    code?: string;
    nameTh?: string | null;
  } | null;
};

export type ApprovalLog = {
  id: string;
  action: string;
  oldStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt: string;
  approvedBy?: ApprovalUser | null;
  actedBy?: ApprovalUser | null;
};

export type ApprovalItem = {
  id: string;
  type: Exclude<ApprovalRequestKind, 'ALL'>;
  requestNo?: string | null;
  title: string;
  reason?: string | null;

  /**
   * สถานะที่ใช้แสดงใน Approval Center ของผู้ใช้งานปัจจุบัน
   * - SUBMITTED = ยังรอผู้ใช้คนนี้อนุมัติ
   * - APPROVED = ผู้ใช้อนุมัติขั้นของตนเองแล้ว หรือเอกสารอนุมัติครบแล้ว
   * - REJECTED = ผู้ใช้ไม่อนุมัติแล้ว หรือเอกสารถูก reject แล้ว
   */
  status: ApprovalStatus;

  /** สถานะจริงของเอกสารหลัก เช่น LeaveRequest / OvertimeRequest / TimeAdjustRequest */
  requestStatus?: ApprovalStatus;

  submittedAt?: string | null;
  createdAt: string;
  employee?: ApprovalEmployee | null;
  approvalSteps?: ApprovalStep[];
  approvalLogs?: ApprovalLog[];
  detail: Record<string, unknown>;
};

export type ApprovalListParams = {
  page?: number;
  pageSize?: number;
  type?: ApprovalRequestKind;
  status?: ApprovalRequestStatusFilter;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  urgentOnly?: boolean;
};

export type ApprovalChartPoint = {
  label: string;
  value: number;
};

export type ApprovalDonutPoint = {
  label: string;
  value: number;
  color: string;
};

export type ApprovalNextSevenDaySummary = {
  key: string;
  weekday: string;
  date: number;
  month: string;
  today: boolean;
  count: number;
};

export type ApprovalOldestPendingSummary = {
  id: string;
  type: Exclude<ApprovalRequestKind, 'ALL'>;
  employeeName: string;
  submittedAt?: string | null;
} | null;

export type ApprovalListSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  returned: number;
  leave: number;
  overtime: number;
  timeAdjust: number;
  offsite: number;
  document: number;
  urgent: number;
  today: number;
  week: number;
  overtimeTotalHours: number;
  overtimeAverageHours: number;
  overtimeNoAttachment: number;
  timeAdjustNoAttachment: number;
  oldestPending: ApprovalOldestPendingSummary;
  leaveNextSevenDays: ApprovalNextSevenDaySummary[];
  monthlyTrend: ApprovalChartPoint[];
  donutData: ApprovalDonutPoint[];
};

export type ApprovalListResponse = {
  items: ApprovalItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: ApprovalListSummary;
};

export type ApprovalActionForm = {
  reason?: string;
  note?: string;
};
