import type { ApprovalItem } from './approvals';
import type { AttendanceLog, AttendanceLogListQuery } from './attendance';
import type { EmployeeListItem, EmployeeListResponse, PaginationMeta } from './employee';
import type { LeaveRequest, LeaveRequestListParams, LeaveRequestListSummary } from './leave';
import type { OffsiteWorkRequest, OffsiteWorkRequestListParams, OffsiteWorkRequestListSummary } from './offsite-work';
import type { TimeAdjustRequest, TimeAdjustRequestListParams, TimeAdjustRequestListSummary } from './time-adjust';
import type { OvertimeRequest, OvertimeRequestListParams, OvertimeRequestListSummary } from './overtime';

export type ManagerTeamListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  q?: string;
  status?: string;
};

export type ManagerTeamListSummary = {
  total: number;
  active: number;
  probation: number;
  suspended: number;
  resigned: number;
  terminated: number;
  inactive: number;
  other: number;
};

export type ManagerTeamListResponse = EmployeeListResponse & {
  summary: ManagerTeamListSummary;
};

export type ManagerAttendanceListParams = Pick<
  AttendanceLogListQuery,
  'page' | 'pageSize' | 'search' | 'dateFrom' | 'dateTo' | 'logType' | 'channel' | 'status'
>;

export type ManagerAttendanceListSummary = {
  teamTotal: number;
  checkedIn: number;
  late: number;
  missing: number;
  missingCheckIn: EmployeeListItem[];
};

export type ManagerAttendanceListResponse = {
  items: AttendanceLog[];
  meta: PaginationMeta;
  summary: ManagerAttendanceListSummary;
};

export type ManagerLeaveListParams = Pick<
  LeaveRequestListParams,
  'page' | 'pageSize' | 'search' | 'dateFrom' | 'dateTo' | 'status'
>;

export type ManagerLeaveListResponse = {
  items: LeaveRequest[];
  meta: PaginationMeta;
  summary: LeaveRequestListSummary & { teamTotal: number };
};

export type ManagerOvertimeListParams = Pick<
  OvertimeRequestListParams,
  'page' | 'pageSize' | 'search' | 'dateFrom' | 'dateTo' | 'status' | 'workType'
>;

export type ManagerOvertimeListResponse = {
  items: OvertimeRequest[];
  meta: PaginationMeta;
  summary: OvertimeRequestListSummary & { teamTotal: number };
};

export type ManagerOffsiteListParams = Pick<
  OffsiteWorkRequestListParams,
  'page' | 'pageSize' | 'search' | 'dateFrom' | 'dateTo' | 'status' | 'locationType'
>;

export type ManagerOffsiteListResponse = {
  items: OffsiteWorkRequest[];
  meta: PaginationMeta;
  summary: OffsiteWorkRequestListSummary & { teamTotal: number };
};

export type ManagerTimeAdjustListParams = Pick<
  TimeAdjustRequestListParams,
  'page' | 'pageSize' | 'search' | 'dateFrom' | 'dateTo' | 'status' | 'adjustType' | 'targetLogType'
>;

export type ManagerTimeAdjustListResponse = {
  items: TimeAdjustRequest[];
  meta: PaginationMeta;
  summary: TimeAdjustRequestListSummary & { teamTotal: number };
};

export type ManagerDashboardAttendanceTrendPoint = {
  date: string;
  label: string;
  checkedIn: number;
  late: number;
  missing: number;
};

export type ManagerDashboardPendingBreakdownPoint = {
  type: string;
  label: string;
  count: number;
};

export type ManagerDashboardTopLateEmployee = {
  employee: EmployeeListItem;
  count: number;
};

export type ManagerDashboardDailyAttendanceSummary = {
  id: string;
  employeeId: string;
  workDate: string;
  morningInAt: string | null;
  afternoonInAt: string | null;
  checkOutAt: string | null;
  morningLateMinutes: number;
  afternoonLateMinutes: number;
  totalLateMinutes: number;
  lateCheckoutMinutes: number;
  earlyCheckoutMinutes: number;
  isMorningMissing: boolean;
  isAfternoonMissing: boolean;
  isCheckoutMissing: boolean;
  hasMissingLog: boolean;
  isAbsent: boolean;
  paidLeaveMinutes: number;
  unpaidLeaveMinutes: number;
  offsiteMinutes: number;
  approvedOtMinutes: number;
  employee: EmployeeListItem;
};

export type ManagerDashboardResponse = {
  manager: EmployeeListItem;
  team: EmployeeListItem[];
  attendanceLogs: AttendanceLog[];
  dailyAttendanceSummaries?: ManagerDashboardDailyAttendanceSummary[];
  leaveRequests: LeaveRequest[];
  overtimeRequests: OvertimeRequest[];
  timeAdjustRequests?: TimeAdjustRequest[];
  offsiteRequests?: unknown[];
  approvals?: ApprovalItem[];
  summary: {
    teamTotal: number;
    checkedIn: number;
    notCheckedIn: number;
    late: number;
    pendingApprovals: number;
    pendingLeave?: number;
    pendingOvertime?: number;
    pendingTimeAdjust?: number;
    pendingOffsite?: number;
    onLeaveToday?: number;
    offsiteToday?: number;
    approvedOvertimeHoursThisMonth?: number;
    oldPendingApprovals?: number;
  };
  insight?: {
    attendanceRate: number;
    lateRate: number;
    missingRate: number;
    pendingApprovalRate: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  };
  charts?: {
    attendanceTrend?: ManagerDashboardAttendanceTrendPoint[];
    pendingBreakdown?: ManagerDashboardPendingBreakdownPoint[];
  };
  followUps?: {
    missingCheckIn?: EmployeeListItem[];
    upcomingLeaves?: LeaveRequest[];
    topLateEmployees?: ManagerDashboardTopLateEmployee[];
  };
};

/* ---------------------------------------------------------------------------
 * สรุปทีมรายคน (/manager/team/summary)
 * ใช้กับแดชบอร์ดหน้าแรกของหัวหน้างาน — วันนี้ + สะสมทั้งเดือน + วันลาคงเหลือ
 * ------------------------------------------------------------------------ */

export type ManagerTodayStatus =
  | 'PRESENT'
  | 'LATE'
  | 'LEAVE'
  | 'OFFSITE'
  | 'ABSENT'
  | 'NOT_CHECKED_IN'
  | 'HOLIDAY';

export type ManagerTeamSummaryToday = {
  teamTotal: number;
} & Record<ManagerTodayStatus, number>;

export type ManagerTeamMemberToday = {
  status: ManagerTodayStatus;
  morningInAt: string | null;
  afternoonInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  otMinutes: number;
  hasMissingLog: boolean;
  /** เวลาเข้างานตามกะ (HH:mm) */
  expectedInAt: string | null;
  /** เลยเวลาเข้างานตามกะแล้วแต่ยังไม่มีการลงเวลา (เฉพาะตอนดูของวันนี้) */
  isOverdue: boolean;
};

export type ManagerTeamMemberShift = {
  name: string;
  morningDeadline: string;
  afternoonDeadline: string;
  checkoutFrom: string;
};

export type ManagerTeamMemberPreviousMonth = {
  lateDays: number;
  lateMinutes: number;
  absentDays: number;
  missingDays: number;
  otHours: number;
};

export type ManagerTeamMemberMonth = {
  recordedDays: number;
  presentDays: number;
  lateDays: number;
  lateMinutes: number;
  absentDays: number;
  missingDays: number;
  leaveDays: number;
  otMinutes: number;
  otHours: number;
  /** ค่าหักจากมาสาย/ขาด/ลงเวลาไม่ครบ ที่สะสมในเดือนนี้ */
  deductionAmount: number;
  attendanceRate: number;
};

export type ManagerTeamLeaveBalance = {
  leaveTypeId: string;
  code: string | null;
  nameTh: string | null;
  entitlementDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

export type ManagerTeamMemberSummary = {
  employee: EmployeeListItem;
  today: ManagerTeamMemberToday;
  month: ManagerTeamMemberMonth;
  previousMonth: ManagerTeamMemberPreviousMonth;
  shift: ManagerTeamMemberShift | null;
  leaveBalances: ManagerTeamLeaveBalance[];
  pendingRequests: number;
};

export type ManagerTeamSummaryResponse = {
  date: string;
  month: string;
  holiday: { name: string } | null;
  today: ManagerTeamSummaryToday;
  monthTotals: {
    lateDays: number;
    lateMinutes: number;
    absentDays: number;
    missingDays: number;
    leaveDays: number;
    otHours: number;
    recordedDays: number;
    presentDays: number;
    attendanceRate: number;
  };
  members: ManagerTeamMemberSummary[];
};

export type ManagerTeamSummaryParams = {
  /** วันที่ที่ต้องการดู (ค่าเริ่มต้น = วันนี้) รูปแบบ YYYY-MM-DD */
  date?: string;
  /** เดือนที่ต้องการสรุป (ค่าเริ่มต้น = เดือนของ date) รูปแบบ YYYY-MM */
  month?: string;
};

/* ปฏิทินทีมรายเดือน (/manager/team/calendar) */

export type ManagerCalendarLeave = {
  employeeId: string;
  name: string;
  leaveType: string | null;
  status: string;
};

export type ManagerCalendarOffsite = {
  employeeId: string;
  name: string;
  locationName: string | null;
};

export type ManagerCalendarDay = {
  date: string;
  /** 0 = อาทิตย์ ... 6 = เสาร์ */
  weekday: number;
  isHoliday: boolean;
  holidayName: string | null;
  leaves: ManagerCalendarLeave[];
  offsites: ManagerCalendarOffsite[];
  awayTotal: number;
};

export type ManagerTeamCalendarResponse = {
  month: string;
  teamTotal: number;
  days: ManagerCalendarDay[];
};
