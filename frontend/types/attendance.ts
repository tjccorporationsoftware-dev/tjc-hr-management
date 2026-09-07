import type { PaginationMeta } from "@/types/employee";
import type { OffsiteWorkRequest } from "@/types/offsite-work";

export type MasterStatus = "ACTIVE" | "INACTIVE";

export type AttendanceLogType =
  "CHECK_IN" | "CHECK_OUT" | "BREAK_START" | "BREAK_END";

export type AttendanceChannel =
  "WEB" | "MOBILE" | "GPS" | "QR" | "KIOSK" | "DEVICE" | "MANUAL" | "IMPORT";

export type AttendanceLogStatus =
  | "NORMAL"
  | "LATE"
  | "EARLY_LEAVE"
  | "MISSING_CHECKIN"
  | "MISSING_CHECKOUT"
  | "MANUAL_ADDED"
  | "EDITED"
  | "CANCELLED"
  | "OUT_OF_SESSION";

export type AttendanceDeviceType =
  | "FINGERPRINT"
  | "FACE_SCAN"
  | "QR_KIOSK"
  | "TABLET"
  | "MOBILE_APP"
  | "WEB_DEVICE"
  | "OTHER";

export type AttendanceLocationType =
  | "OFFICE"
  | "BRANCH"
  | "SITE"
  | "CUSTOMER_SITE"
  | "WFH"
  | "REMOTE"
  | "TEMPORARY_SITE"
  | "OTHER";

export type AttendanceEditAction =
  "CREATE_MANUAL" | "UPDATE_TIME" | "CANCEL" | "RESTORE";

export type AttendanceEmployeeRef = {
  id: string;
  companyId?: string | null;
  branchId?: string | null;
  employeeTypeId?: string | null;
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
  company: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  branch: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  department: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  division: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  user?: {
    id: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
};

export type AttendanceUserRef = {
  id: string;
  email: string;
  displayName: string;
};

export type AttendanceLocation = {
  id: string;
  companyId: string;
  branchId: string | null;
  code: string;
  nameTh: string;
  nameEn: string | null;
  type: AttendanceLocationType;
  address: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  radiusMeters: number;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
};

export type AttendanceDevice = {
  id: string;
  code: string;
  name: string;
  type: AttendanceDeviceType;
  serialNo: string | null;
  ipAddress: string | null;
  description: string | null;
  /** ข้อมูลเชื่อมต่อของเครื่องสแกน (ลายนิ้วมือ/ใบหน้า) */
  brand: string | null;
  model: string | null;
  port: number | null;
  commKey: string | null;
  firmwareVersion: string | null;
  lastSyncAt: string | null;
  lastOnlineAt: string | null;
  branchId: string | null;
  locationId: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  branch?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  location?: {
    id: string;
    code: string;
    nameTh: string;
    type: AttendanceLocationType;
  } | null;
};

/** ผูกพนักงานกับรหัสผู้ใช้ในเครื่องสแกน */
export type AttendanceDeviceEnrollment = {
  id: string;
  deviceId: string;
  employeeId: string;
  deviceUserId: string;
  fingerCount: number | null;
  note: string | null;
  enrolledAt: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string | null;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    branchId: string | null;
    departmentId: string | null;
  } | null;
};

/** log ดิบของทุกครั้งที่เครื่องยิงสแกนเข้ามา (audit trail, append-only) */
export type AttendanceScanLog = {
  id: string;
  deviceId: string | null;
  rawRecordId: string;
  /** รหัสผู้ใช้ในเครื่อง (ก่อนแมปพนักงาน) */
  rawEmployeeRef: string | null;
  /** รหัสพนักงานที่แมปได้ (ถ้าแมป) */
  employeeCode: string | null;
  logTime: string;
  payload: unknown;
  /** MATCHED | UNMATCHED | DUPLICATE | ... */
  normalizeStatus: string;
  normalizedLogId: string | null;
  normalizedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type AttendanceScanLogListParams = {
  page?: number;
  pageSize?: number;
  status?: string;
  /** ดูเฉพาะรหัสผู้ใช้ในเครื่องนี้ (ใช้ตอนกดเข้าไปดูรายคน) */
  deviceUserId?: string;
};

/** คำสั่งที่รอส่ง/ส่งไปแล้วยังเครื่องสแกน */
export type AttendanceDeviceCommand = {
  id: string;
  seq: number;
  deviceId: string;
  command: string;
  kind: string;
  employeeId: string | null;
  /** PENDING | SENT | DONE | FAILED */
  status: string;
  returnCode: number | null;
  errorMessage: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type AttendanceDeviceCommandListResponse = {
  items: AttendanceDeviceCommand[];
  meta: {
    pending: number;
    sent: number;
    done: number;
    failed: number;
  };
};

export type PushDeviceEmployeesResult = {
  queuedCount: number;
  /** จำนวนคนที่เพิ่งถูกผูกรหัสในเครื่องให้อัตโนมัติ */
  newEnrollmentCount: number;
  items: Array<{
    employeeCode: string;
    employeeName: string;
    deviceUserId: string;
    isNew: boolean;
  }>;
};

/** หนึ่งบรรทัดในหน้าสรุปการสแกนรายคน */
export type AttendanceScanLogPerson = {
  deviceUserId: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  /** ผูกกับพนักงานในระบบแล้วหรือยัง */
  enrolled: boolean;
  total: number;
  matched: number;
  duplicate: number;
  unmatched: number;
  locked: number;
  lastScanAt: string | null;
};

export type AttendanceScanLogPeopleResponse = {
  items: AttendanceScanLogPerson[];
  meta: {
    people: number;
    scans: number;
    unenrolled: number;
  };
};

export type AttendanceScanLogListResponse = {
  items: AttendanceScanLog[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

/** ผลลัพธ์การรับข้อมูลสแกนจากเครื่อง */
export type AttendanceDevicePunchResult = {
  deviceId: string;
  receivedCount: number;
  createdCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  unmatchedDeviceUserIds: string[];
  syncedAt: string;
};

export type AttendanceEditLog = {
  id: string;
  attendanceLogId: string;
  action: AttendanceEditAction;
  oldLogTime: string | null;
  newLogTime: string | null;
  oldStatus: AttendanceLogStatus | null;
  newStatus: AttendanceLogStatus | null;
  oldChannel: AttendanceChannel | null;
  newChannel: AttendanceChannel | null;
  reason: string;
  note: string | null;
  editedById: string | null;
  createdAt: string;
  editedBy?: AttendanceUserRef | null;
};

export type AttendanceLog = {
  id: string;
  employeeId: string;
  workDate: string;
  logType: AttendanceLogType;
  logTime: string;
  channel: AttendanceChannel;
  status: AttendanceLogStatus;
  source?: AttendancePunchSource | string | null;
  session?: "MORNING" | "AFTERNOON" | "EVENING" | string | null;
  rawScannerRecordId?: string | null;
  deviceId: string | null;
  locationId: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  gpsAccuracy: string | number | null;
  isOffsite?: boolean;
  offsiteRequestId?: string | null;
  locationVerified?: boolean | null;
  distanceFromApprovedLocationMeters?: string | number | null;
  gpsVerificationStatus?: string | null;
  photoUrl?: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  note: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;

  employee: AttendanceEmployeeRef;
  device: Pick<AttendanceDevice, "id" | "code" | "name" | "type"> | null;
  location: Pick<AttendanceLocation, "id" | "code" | "nameTh" | "type"> | null;
  createdBy: AttendanceUserRef | null;
  editLogs?: AttendanceEditLog[];
};

export type AttendanceLogListResponse = {
  items: AttendanceLog[];
  meta: PaginationMeta;
};

export type AttendanceLogListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  logType?: AttendanceLogType;
  channel?: AttendanceChannel;
  status?: AttendanceLogStatus;
};

export type AttendanceManualLogForm = {
  employeeId: string;
  logType: AttendanceLogType;
  logTime: string;
  channel?: AttendanceChannel;
  status?: AttendanceLogStatus;
  locationId?: string;
  deviceId?: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  note?: string;
};

export type AttendanceUpdateLogForm = {
  logTime?: string;
  channel?: AttendanceChannel;
  status?: AttendanceLogStatus;
  locationId?: string | null;
  deviceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracy?: number | null;
  note?: string | null;
  reason: string;
};

export type CancelAttendanceLogForm = {
  reason: string;
  note?: string;
};

export type CheckAttendanceForm = {
  channel?: AttendanceChannel;
  locationId?: string;
  deviceId?: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  note?: string;
};

export type AttendanceMyToday = {
  employee: {
    id: string;
    employeeCode: string;
    title: string | null;
    firstName: string;
    lastName: string;
    displayName: string | null;
    position: string | null;
    status: string;
  };
  workDate: string;
  latestLog: AttendanceLog | null;
  holiday?: AttendanceHolidayInfo;
  logs: AttendanceLog[];
  canCheckIn: boolean;
  canCheckOut: boolean;
};

export type AttendanceLocationForm = {
  companyId: string;
  branchId?: string;
  code: string;
  nameTh: string;
  nameEn?: string;
  type?: AttendanceLocationType;
  address?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  status?: MasterStatus;
};

export type AttendanceLocationUpdateForm = {
  branchId?: string | null;
  code?: string;
  nameTh?: string;
  nameEn?: string | null;
  type?: AttendanceLocationType;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number;
  status?: MasterStatus;
};

export type AttendanceDeviceForm = {
  code: string;
  name: string;
  type?: AttendanceDeviceType;
  serialNo?: string;
  ipAddress?: string;
  description?: string;
  brand?: string;
  model?: string;
  port?: number;
  commKey?: string;
  firmwareVersion?: string;
  branchId?: string;
  locationId?: string;
  status?: MasterStatus;
};

export type AttendanceDeviceUpdateForm = {
  code?: string;
  name?: string;
  type?: AttendanceDeviceType;
  serialNo?: string | null;
  ipAddress?: string | null;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  port?: number | null;
  commKey?: string | null;
  firmwareVersion?: string | null;
  branchId?: string | null;
  locationId?: string | null;
  status?: MasterStatus;
};

export type AttendanceDeviceEnrollmentForm = {
  employeeId: string;
  deviceUserId: string;
  fingerCount?: number;
  note?: string;
  enrolledAt?: string;
  status?: MasterStatus;
};

export type AttendanceDeviceEnrollmentUpdateForm = {
  employeeId?: string;
  deviceUserId?: string;
  fingerCount?: number | null;
  note?: string | null;
  enrolledAt?: string | null;
  status?: MasterStatus;
};

export type AttendanceDevicePunchInput = {
  deviceUserId: string;
  punchedAt: string;
  logType?: AttendanceLogType;
  rawRecordId?: string;
  note?: string;
};
export type AttendancePunchType =
  | "MORNING_IN"
  | "AFTERNOON_IN"
  | "CHECK_OUT"
  | "OFFSITE_IN"
  | "OFFSITE_OUT"
  | "CUSTOM";
export type AttendancePunchSource = "WEB" | "MOBILE_APP" | "SCANNER";

export type MissingPenaltyMode = "PER_SESSION" | "PER_DAY";

export type AttendanceSessionCode =
  | "MORNING_IN"
  | "AFTERNOON_IN"
  | "CHECK_OUT"
  | "OFFSITE_IN"
  | "OFFSITE_OUT"
  | "CUSTOM";

export type AttendanceSessionType = "CHECK_IN" | "CHECK_OUT";

export type AttendanceReviewStatus =
  | "CALCULATED"
  | "NEED_REVIEW"
  | "REVIEWED"
  | "READY_FOR_PAYROLL"
  | "SENT_TO_PAYROLL"
  | "LOCKED";

export type AttendanceReviewReasonCode =
  | "MISSING_MORNING"
  | "MISSING_AFTERNOON"
  | "MISSING_CHECKOUT"
  | "MISSING_LOG"
  | "ABSENT"
  | "LATE_OVER_THRESHOLD"
  | "EARLY_CHECKOUT"
  | "OUT_OF_SESSION"
  | "OFFSITE_PENDING_APPROVAL"
  | "PENDING_LEAVE"
  | "PENDING_OVERTIME"
  | "PENDING_OFFSITE"
  | "PENDING_TIME_ADJUST"
  | "MISSING_COMPENSATION"
  | "CALCULATION_ERROR"
  | "RECALCULATION_PENDING"
  | "RECALCULATION_FAILED"
  | "STALE_SUMMARY"
  | "LEGACY_REVIEW_STATUS"
  | string;

export type AttendanceReviewReason = {
  code: AttendanceReviewReasonCode;
  label: string;
  detail?: string | null;
};

export type AttendancePolicy = {
  id: string;
  companyId: string;
  branchId: string | null;
  employeeTypeId?: string | null;
  code: string;
  name: string;
  description: string | null;
  morningCheckInDeadline: string;
  afternoonCheckInDeadline: string;
  checkoutAllowedFrom: string;
  latePenaltyRatePerMinute: string | number;
  missingLogPenaltyPerDay: string | number;
  priority?: number;
  lateGraceMinutes?: number;
  lateRoundingMinutes?: number;
  maxLatePenaltyPerDay?: string | number | null;
  maxMissingPenaltyPerDay?: string | number | null;
  missingPenaltyMode?: MissingPenaltyMode;
  offsiteEnabled?: boolean;
  requireOffsiteApproval?: boolean;
  timezone: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDefault?: boolean;
  /** backend include มาให้ตอน list เพื่อให้หน้าตั้งค่าสรุปเวลาได้โดยไม่ต้องยิงซ้ำ */
  sessionRules?: AttendanceSessionRule[];
};

export type AttendancePolicyListParams = {
  page?: number;
  pageSize?: number;
  companyId?: string;
  branchId?: string;
  employeeTypeId?: string;
  q?: string;
  status?: "ACTIVE" | "INACTIVE";
};

export type AttendancePolicyListSummary = {
  total: number;
  active: number;
  inactive: number;
  totalRules: number;
  activeRules: number;
  inactiveRules: number;
};

export type AttendancePolicyListResponse = {
  items: AttendancePolicy[];
  meta: PaginationMeta;
  summary?: AttendancePolicyListSummary;
};

export type AttendancePolicyForm = {
  companyId: string;
  branchId?: string | null;
  employeeTypeId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  morningCheckInDeadline?: string;
  afternoonCheckInDeadline?: string;
  checkoutAllowedFrom?: string;
  latePenaltyRatePerMinute?: number;
  missingLogPenaltyPerDay?: number;
  priority?: number;
  lateGraceMinutes?: number;
  lateRoundingMinutes?: number;
  maxLatePenaltyPerDay?: number | null;
  maxMissingPenaltyPerDay?: number | null;
  missingPenaltyMode?: MissingPenaltyMode;
  offsiteEnabled?: boolean;
  requireOffsiteApproval?: boolean;
  timezone?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status?: MasterStatus;
};

export type AttendancePolicyUpdateForm = Partial<
  Omit<AttendancePolicyForm, "companyId">
>;

export type AttendanceSessionRule = {
  id: string;
  policyId: string;
  sessionCode: AttendanceSessionCode;
  label: string;
  punchType: AttendanceSessionType;
  openTime: string;
  expectedTime: string;
  closeTime: string;
  lateAfterTime: string | null;
  lateUntilTime: string | null;
  earlyBeforeTime: string | null;
  lateOutAfterTime: string | null;
  requirePunch: boolean;
  allowEarlyPunch: boolean;
  earlyPunchGraceMinutes: number;
  lateGraceMinutes: number;
  latePenaltyPerMinute: string | number;
  missingPenaltyAmount: string | number;
  earlyLeavePenaltyPerMinute: string | number;
  collectLateOutMinutes: boolean;
  autoCreateOt: boolean;
  sortOrder: number;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AttendanceSessionRuleListParams = {
  status?: MasterStatus;
  punchType?: AttendanceSessionType;
};

export type AttendanceSessionRuleForm = {
  sessionCode: AttendanceSessionCode;
  label: string;
  punchType: AttendanceSessionType;
  openTime: string;
  expectedTime: string;
  closeTime: string;
  lateAfterTime?: string | null;
  lateUntilTime?: string | null;
  earlyBeforeTime?: string | null;
  lateOutAfterTime?: string | null;
  requirePunch?: boolean;
  allowEarlyPunch?: boolean;
  earlyPunchGraceMinutes?: number;
  lateGraceMinutes?: number;
  latePenaltyPerMinute?: number;
  missingPenaltyAmount?: number;
  earlyLeavePenaltyPerMinute?: number;
  collectLateOutMinutes?: boolean;
  autoCreateOt?: boolean;
  sortOrder?: number;
  status?: MasterStatus;
};

export type AttendanceSessionRuleUpdateForm =
  Partial<AttendanceSessionRuleForm>;

export type ReorderAttendanceSessionRulesForm = {
  items: Array<{
    id: string;
    sortOrder: number;
  }>;
};

export type AttendanceHolidayWorkOverride = {
  date: string;
  name: string;
  reason?: string | null;
  appliesToAll?: boolean;
  grantSubstituteHoliday?: boolean;
  companyIds?: string[];
  branchIds?: string[];
  departmentIds?: string[];
  divisionIds?: string[];
  employeeTypeIds?: string[];
  employeeIds?: string[];
};

export type AttendanceHolidayInfo = {
  isHoliday: boolean;
  date: string;
  name: string | null;
  source: "WEEKLY" | "CUSTOM" | "WORK_OVERRIDE" | null;
  isWorkingHoliday?: boolean;
  baseHoliday?: {
    isHoliday: boolean;
    date: string;
    name: string | null;
    source: "WEEKLY" | "CUSTOM" | null;
  } | null;
  workOverride?: AttendanceHolidayWorkOverride | null;
};

export type AttendancePunchContextParams = {
  punchedAt?: string;
  punchType?: AttendancePunchType;
};

export type AttendancePunchCurrentSession = {
  ruleId: string;
  sessionCode: AttendanceSessionCode;
  label: string;
  punchType: AttendanceSessionType;
  openTime: string;
  expectedTime: string;
  closeTime: string;
  statusPreview: AttendanceLogStatus;
  lateMinutesPreview: number;
  earlyLeaveMinutesPreview: number;
  earlyLeavePenaltyPerMinute?: number;
  earlyLeavePenaltyPreview?: number;
  canPunch: boolean;
  blockReason: string | null;
};

export type AttendancePunchContextRule = {
  id: string;
  sessionCode: AttendanceSessionCode;
  label: string;
  punchType: AttendanceSessionType;
  openTime: string;
  expectedTime: string;
  closeTime: string;
  lateAfterTime?: string | null;
  earlyBeforeTime?: string | null;
  lateOutAfterTime?: string | null;
  latePenaltyPerMinute: number;
  missingPenaltyAmount: number;
  earlyLeavePenaltyPerMinute?: number;
  sortOrder: number;
};

export type AttendancePunchGeofence = {
  locationId: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  required: boolean;
};

export type AttendancePunchMethodContext = {
  allowed: Array<"WEB" | "MOBILE" | "DEVICE">;
  geofenceRequired: boolean;
};

export type AttendancePunchContext = {
  workDate: string;
  punchedAt: string;
  holiday?: AttendanceHolidayInfo;
  geofence?: AttendancePunchGeofence | null;
  attendanceMethods?: AttendancePunchMethodContext | null;
  policy: {
    id: string;
    code: string;
    name: string;
    timezone: string;
    isDefault: boolean;
  };
  currentSession: AttendancePunchCurrentSession | null;
  sessionRules: AttendancePunchContextRule[];
  todayLogs: AttendanceLog[];
  approvedOffsiteRequests?: OffsiteWorkRequest[];
};

export type PunchAttendanceForm = {
  punchType?: AttendancePunchType;
  source?: AttendancePunchSource;
  punchedAt?: string;
  locationId?: string;
  deviceId?: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  offsiteRequestId?: string;
  note?: string;
};

export type AttendanceDailyTimeAdjustRequest = {
  id: string;
  requestNo: string | null;
  employeeId: string;
  workDate?: string | null;
  adjustType: string;
  targetLogType: AttendanceLogType;
  originalLogTime: string | null;
  requestedLogTime: string;
  appliedLogTime?: string | null;
  reason: string;
  note: string | null;
  status:
    "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED" | string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  submittedBy?: AttendanceUserRef | null;
  approvedBy?: AttendanceUserRef | null;
  rejectedBy?: AttendanceUserRef | null;
  originalAttendanceLog?: Pick<
    AttendanceLog,
    "id" | "logTime" | "logType" | "session" | "status"
  > | null;
  appliedAttendanceLog?: Pick<
    AttendanceLog,
    "id" | "logTime" | "logType" | "session" | "status"
  > | null;
  attendanceEditLogs?: Array<{
    id: string;
    oldLogTime: string | null;
    newLogTime: string | null;
    reason: string;
    note: string | null;
    createdAt: string;
  }>;
};

export type AttendanceDailySummary = {
  id: string;
  employeeId: string;
  workDate: string;
  /** อุปกรณ์ที่ใช้ลงเวลาของแต่ละรอบ — หลังบ้านเติมมาให้จากตัวรอยตอก */
  punchChannels?: {
    morning: { channel: string; source: string | null } | null;
    afternoon: { channel: string; source: string | null } | null;
    checkout: { channel: string; source: string | null } | null;
  } | null;
  morningInAt: string | null;
  afternoonInAt: string | null;
  checkOutAt: string | null;
  morningLateMinutes: number;
  afternoonLateMinutes: number;
  totalLateMinutes: number;
  isMorningMissing: boolean;
  isAfternoonMissing: boolean;
  isCheckoutMissing: boolean;
  hasMissingLog: boolean;
  isAbsent?: boolean;
  absentDays?: string | number;
  latePenaltyAmount: string | number;
  missingLogPenaltyAmount: string | number;
  absentDeductionAmount?: string | number;
  unpaidLeaveDeductionAmount: string | number;
  earlyCheckoutPenaltyAmount?: string | number;
  totalDeductionAmount: string | number;
  earlyCheckoutMinutes?: number;
  lateCheckoutMinutes?: number;
  extraPresenceMinutes?: number;
  missingMorningPenaltyAmount?: string | number;
  missingAfternoonPenaltyAmount?: string | number;
  missingCheckoutPenaltyAmount?: string | number;
  paidLeaveMinutes?: number;
  unpaidLeaveMinutes?: number;
  offsiteMinutes?: number;
  approvedOtMinutes?: number;
  payableOtMinutes?: number;
  baseSalaryAmount?: string | number;
  salaryDivisorDays?: number;
  workingHoursPerDay?: number;
  dailyRatePreview?: string | number;
  hourlyRatePreview?: string | number;
  approvedOvertimeRequestCount?: number;
  approvedOvertimeHours?: number;
  approvedOvertimeAmountPreview?: string | number;
  approvedOvertimeWorkdayHours?: number;
  approvedOvertimeWorkdayAmountPreview?: string | number;
  approvedOvertimeHolidayHours?: number;
  approvedOvertimeHolidayAmountPreview?: string | number;
  approvedOvertimeSpecialHolidayHours?: number;
  approvedOvertimeSpecialHolidayAmountPreview?: string | number;
  payrollImpactAmountPreview?: string | number;
  offsiteStatus?: string | null;
  reviewStatus?: AttendanceReviewStatus;
  hasReviewIssue?: boolean;
  requiresReview?: boolean;
  reviewReasons?: AttendanceReviewReason[];
  reviewedAt?: string | null;
  reviewedById?: string | null;
  /* HR กดไม่หักค่าปรับลืมสแกนของวันนี้ไว้ */
  missingLogPenaltyWaived?: boolean;
  penaltyWaivedReason?: string | null;
  penaltyWaivedAt?: string | null;
  penaltyWaivedById?: string | null;
  penaltyWaivedAmount?: string | number;
  readyForPayrollAt?: string | null;
  readyForPayrollById?: string | null;
  lockedById?: string | null;
  payrollPeriodId?: string | null;
  payrollRunId?: string | null;
  sentToPayrollAt?: string | null;
  sentToPayrollById?: string | null;
  leaveRequestId: string | null;
  leaveTypeId: string | null;
  leaveIsPaid: boolean | null;
  leaveDayType:
    "FULL_DAY" | "HALF_DAY_MORNING" | "HALF_DAY_AFTERNOON" | "HOURLY" | null;
  leaveDurationDays: string | number;
  policyId: string | null;
  policySnapshot:
    | (Record<string, unknown> & {
        approvedLeaveCoverage?: {
          coveredSessions?: Array<"MORNING" | "AFTERNOON" | "CHECKOUT">;
          paidLeaveMinutes?: number;
          unpaidLeaveMinutes?: number;
          coverageReason?: string | null;
        } | null;
        holiday?: AttendanceHolidayInfo | null;
        workingHoliday?: {
          date?: string | null;
          name?: string | null;
          baseHoliday?: AttendanceHolidayInfo["baseHoliday"];
          workOverride?: AttendanceHolidayWorkOverride | null;
          grantSubstituteHoliday?: boolean;
        } | null;
        approvedOffsiteCoverage?: {
          status?: string | null;
          minutes?: number;
          needsReview?: boolean;
          attendanceLogIds?: string[];
          offsiteRequestIds?: string[];
        } | null;
        unpaidLeaveDeduction?: {
          amount?: number | string;
          baseSalary?: number | string;
          salaryDivisorDays?: number;
          workingHoursPerDay?: number;
          dailyRate?: number | string;
          hourlyRate?: number | string;
          unpaidLeaveMinutes?: number | string | null;
          unpaidLeaveHours?: number | string | null;
          calculationMethod?: string;
          missingCompensation?: boolean;
        } | null;
        attendanceReview?: {
          version?: number;
          hasReviewIssue?: boolean;
          reviewReasons?: AttendanceReviewReason[];
          sourceHash?: string;
          lastInvalidation?: {
            eventCode?: "ATTENDANCE_REVIEW_INVALIDATED" | string;
            invalidatedAt?: string;
            invalidatedById?: string;
            oldStatus?: AttendanceReviewStatus | string;
            newStatus?: AttendanceReviewStatus | string;
            previousSourceHash?: string | null;
            sourceHash?: string;
          } | null;
        } | null;
      })
    | null;
  calculationStatus: string;
  calculationNote: string | null;
  calculatedAt: string;
  calculatedById: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    title?: string | null;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    position?: string | null;
    status?: string;
    attendanceGeofenceRequired?: boolean;
    allowedAttendanceMethods?: Array<"WEB" | "MOBILE" | "DEVICE">;
    /** false = ไม่ต้องลงเวลาเลย (ผู้บริหาร / เหมาจ่าย) */
    attendanceTrackingRequired?: boolean;
    /** รอบลงเวลาที่ยกเว้นเป็นรายคน เช่น พนักงานจัดส่งไม่ต้องกดเข้างานบ่าย */
    attendanceExemptSessions?: Array<
      "MORNING_IN" | "AFTERNOON_IN" | "CHECK_OUT"
    >;
    /** ระดับตำแหน่ง (1 = ผู้บริหารสูงสุด) ใช้เรียงให้ผู้บริหารขึ้นก่อน */
    positionMaster?: { level?: number | null } | null;
    company?: { id: string; code: string; nameTh: string } | null;
    branch?: { id: string; code: string; nameTh: string } | null;
    department?: { id: string; code: string; nameTh: string } | null;
    user?: {
      id: string;
      email?: string | null;
      displayName?: string | null;
      avatarUrl?: string | null;
    } | null;
  };
  leaveRequest?: {
    id: string;
    requestNo?: string | null;
    startDate: string;
    endDate: string;
    dayType: "FULL_DAY" | "HALF_DAY_MORNING" | "HALF_DAY_AFTERNOON" | "HOURLY";
    totalDays: string | number;
    totalMinutes?: string | number | null;
    startTime?: string | null;
    endTime?: string | null;
    status: string;
  } | null;
  leaveType?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
    isPaid: boolean;
  } | null;
  timeAdjustRequests?: AttendanceDailyTimeAdjustRequest[];
  timeAdjustRequestCount?: number;
  pendingLeaveRequestCount?: number;
  pendingOvertimeRequestCount?: number;
  pendingTimeAdjustRequestCount?: number;
  pendingOffsiteRequestCount?: number;
  pendingApprovalRequestCount?: number;
  approvedTimeAdjustRequestCount?: number;
  rejectedTimeAdjustRequestCount?: number;
  cancelledTimeAdjustRequestCount?: number;
};

export type AttendanceDailyReviewActionPayload = {
  reason?: string;
  note?: string;
};

export type BulkAttendanceDailyReviewActionPayload =
  AttendanceDailyReviewActionPayload & {
    ids: string[];
  };

export type BulkAttendanceDailyReviewActionResponse = {
  updated: number;
  errorCount: number;
  items: AttendanceDailySummary[];
  errors: Array<{ id: string; message: string }>;
};

export type AttendanceDailyReviewIssue =
  | "ALL"
  | "ALERTS"
  | "NORMAL_READY"
  | "NEED_REVIEW"
  | "MISSING_LOG"
  | "MISSING_MORNING"
  | "MISSING_AFTERNOON"
  | "MISSING_CHECKOUT"
  | "ABSENT"
  | "LATE"
  | "EARLY_CHECKOUT"
  | "LATE_CHECKOUT"
  | "LEAVE"
  | "UNPAID_LEAVE"
  | "OFFSITE"
  | "PENALTY"
  | "READY_FOR_PAYROLL"
  | "LOCKED"
  | "TIME_ADJUST";

export type AttendanceMonthlyReviewStatus =
  | "DATA_INCOMPLETE"
  | "CALCULATED"
  | "NEED_REVIEW"
  | "REVIEWED"
  | "READY_FOR_PAYROLL"
  | "SENT_TO_PAYROLL"
  | "LOCKED";

export type AttendanceMonthlyReviewIssue = AttendanceDailyReviewIssue;

export type AttendanceMonthlyReviewItem = {
  employeeId: string;
  employee: AttendanceEmployeeRef;
  dateFrom: string;
  dateTo: string;
  dayCount: number;
  summaryCount: number;
  missingSummaryCount: number;
  needReviewCount: number;
  calculatedCount: number;
  reviewedCount: number;
  readyForPayrollCount: number;
  lockedCount: number;
  sentToPayrollCount: number;
  lateDayCount: number;
  missingLogCount: number;
  absentDayCount?: number;
  unpaidLeaveDayCount: number;
  offsiteDayCount: number;
  earlyCheckoutDayCount?: number;
  lateCheckoutDayCount?: number;
  paidLeaveDayCount?: number;
  payrollLinkedCount: number;
  totalLateMinutes: number;
  morningLateMinutes: number;
  afternoonLateMinutes: number;
  paidLeaveMinutes: number;
  unpaidLeaveMinutes: number;
  offsiteMinutes: number;
  earlyCheckoutMinutes?: number;
  lateCheckoutMinutes?: number;
  approvedOtMinutes: number;
  payableOtMinutes: number;
  baseSalaryAmount?: string | number;
  salaryDivisorDays?: number;
  workingHoursPerDay?: number;
  dailyRatePreview?: string | number;
  hourlyRatePreview?: string | number;
  approvedOvertimeRequestCount?: number;
  approvedOvertimeHours?: number;
  approvedOvertimeAmountPreview?: string | number;
  approvedOvertimeWorkdayHours?: number;
  approvedOvertimeWorkdayAmountPreview?: string | number;
  approvedOvertimeHolidayHours?: number;
  approvedOvertimeHolidayAmountPreview?: string | number;
  approvedOvertimeSpecialHolidayHours?: number;
  approvedOvertimeSpecialHolidayAmountPreview?: string | number;
  pendingLeaveRequestCount?: number;
  pendingOvertimeRequestCount?: number;
  pendingTimeAdjustRequestCount?: number;
  approvedTimeAdjustRequestCount?: number;
  rejectedTimeAdjustRequestCount?: number;
  pendingOffsiteRequestCount?: number;
  pendingApprovalRequestCount?: number;
  payrollImpactAmountPreview?: string | number;
  latePenaltyAmount: string | number;
  missingLogPenaltyAmount: string | number;
  absentDeductionAmount?: string | number;
  unpaidLeaveDeductionAmount: string | number;
  earlyCheckoutPenaltyAmount?: string | number;
  totalDeductionAmount: string | number;
  status: AttendanceMonthlyReviewStatus;
  canReadyForPayroll: boolean;
  canLock: boolean;
  blockerMessages: string[];
  summaryIds: string[];
  needReviewSummaryIds: string[];
  readySummaryIds: string[];
  lockedSummaryIds: string[];
};

export type AttendanceMonthlyReviewListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  dateFrom: string;
  dateTo: string;
  issue?: AttendanceMonthlyReviewIssue;
};

export type AttendanceMonthlyReviewListSummary = {
  total: number;
  readyForPayroll: number;
  needReview: number;
  locked: number;
  sentToPayroll: number;
  reviewed: number;
  missingSummaryCount: number;
  needReviewDayCount: number;
  missingLogCount: number;
  absentDayCount?: number;
  lateDayCount: number;
  unpaidLeaveDayCount: number;
  totalLateMinutes: number;
  approvedOtMinutes: number;
  payableOtMinutes: number;
  approvedOvertimeAmountPreview: string | number;
  latePenaltyAmount: string | number;
  missingLogPenaltyAmount: string | number;
  absentDeductionAmount?: string | number;
  unpaidLeaveDeductionAmount: string | number;
  earlyCheckoutDayCount?: number;
  earlyCheckoutMinutes?: number;
  earlyCheckoutPenaltyAmount?: string | number;
  totalDeductionAmount: string | number;
  pendingTimeAdjustRequestCount?: number;
  approvedTimeAdjustRequestCount?: number;
  rejectedTimeAdjustRequestCount?: number;
};

export type AttendanceMonthlyReviewListResponse = {
  items: AttendanceMonthlyReviewItem[];
  meta: PaginationMeta;
  summary?: AttendanceMonthlyReviewListSummary;
};

export type AttendanceMonthlyReviewDetailParams = {
  dateFrom: string;
  dateTo: string;
};

export type AttendanceMonthlyReviewDetailResponse = {
  employeeId: string;
  employee: AttendanceEmployeeRef;
  dateFrom: string;
  dateTo: string;
  dayCount: number;
  summary: AttendanceMonthlyReviewItem;
  dailySummaries: AttendanceDailySummary[];
  offsiteRequests: OffsiteWorkRequest[];
};

export type AttendanceMonthlyReviewActionPayload =
  AttendanceDailyReviewActionPayload & {
    dateFrom: string;
    dateTo: string;
    employeeIds: string[];
  };

export type AttendanceMonthlyReviewPeriodActionPayload =
  AttendanceDailyReviewActionPayload & {
    dateFrom: string;
    dateTo: string;
    search?: string;
    companyId?: string;
    branchId?: string;
    departmentId?: string;
    issue?: AttendanceMonthlyReviewIssue;
  };

export type AttendanceMonthlyReviewActionResponse = {
  updated: number;
  employeeCount: number;
  scopeEmployeeCount?: number;
  skippedEmployeeCount?: number;
  successEmployeeCount: number;
  errorCount: number;
  items: Array<{
    employeeId: string;
    updated: number;
    skipped: number;
    errorCount?: number;
    errors?: Array<{ id: string; message: string }>;
  }>;
  errors: Array<{ employeeId: string; message: string }>;
};

export type AttendanceDailySummaryListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  divisionId?: string;
  employeeTypeId?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  hasMissingLog?: boolean;
  hasPenalty?: boolean;
  leaveIsPaid?: boolean;
  reviewStatus?: AttendanceReviewStatus;
  issue?: AttendanceDailyReviewIssue;
};

export type AttendanceDailySummaryListSummary = {
  total: number;
  needReview: number;
  reviewed: number;
  readyForPayroll: number;
  locked: number;
  sentToPayroll: number;
  issueCount: number;
  missingLogCount: number;
  absentCount?: number;
  lateCount: number;
  totalLateMinutes: number;
  approvedOtMinutes: number;
  payableOtMinutes: number;
  approvedOvertimeAmountPreview: string | number;
  latePenaltyAmount: string | number;
  missingLogPenaltyAmount: string | number;
  absentDeductionAmount?: string | number;
  unpaidLeaveDeductionAmount: string | number;
  earlyCheckoutCount?: number;
  earlyCheckoutMinutes?: number;
  earlyCheckoutPenaltyAmount?: string | number;
  totalDeductionAmount: string | number;
  timeAdjustRequestCount?: number;
  pendingTimeAdjustRequestCount?: number;
  approvedTimeAdjustRequestCount?: number;
  rejectedTimeAdjustRequestCount?: number;
};

export type AttendanceDailySummaryListResponse = {
  items: AttendanceDailySummary[];
  meta: PaginationMeta;
  summary?: AttendanceDailySummaryListSummary;
};

export type RecalculateAttendanceDailySummariesForm = {
  progressId?: string;
  dateFrom: string;
  dateTo: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  divisionId?: string;
  employeeTypeId?: string;
  employeeId?: string;
  force?: boolean;
};

export type AttendanceRecalculationProgressStatus =
  "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLING" | "CANCELLED";

export type AttendanceRecalculationProgressResponse = {
  progressId: string;
  status: AttendanceRecalculationProgressStatus;
  step: string;
  message: string;
  percent: number;
  processedItems: number;
  totalItems: number;
  employeeCount: number;
  dayCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  errorMessage: string | null;
  result: {
    calculated: number;
    skippedLocked: number;
    errorCount: number;
  } | null;
};

export type RecalculateAttendanceDailySummariesResponse = {
  /** true = ผู้ใช้สั่งหยุดกลางทาง ตัวเลขในนี้จึงเป็นแค่ส่วนที่ทำไปได้ */
  cancelled?: boolean;
  calculated: number;
  skippedLocked: number;
  errorCount?: number;
  employeeCount: number;
  dayCount: number;
  items: AttendanceDailySummary[];
  errors?: Array<{
    employeeId: string;
    employeeCode?: string | null;
    workDate: string;
    message: string;
  }>;
};

/* ------------------------------------------------------------------ */
/* ผูกพนักงานเข้ากะการทำงาน                                             */
/* ------------------------------------------------------------------ */

export type EmployeeShiftAssignment = {
  id: string;
  policyId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  note?: string | null;
  policy: {
    id: string;
    code: string;
    name: string;
  };
};

export type EmployeeShiftRow = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  branchId?: string | null;
  employeeTypeId?: string | null;
  branch?: { id: string; code?: string | null; nameTh: string } | null;
  department?: { id: string; code?: string | null; nameTh: string } | null;
  employeeType?: { id: string; nameTh: string } | null;
  positionMaster?: {
    id: string;
    nameTh: string;
    /** ระดับตำแหน่ง (1 = ผู้บริหารสูงสุด) ใช้เรียงลำดับอาวุโส */
    level?: number | null;
  } | null;
  /** false = ไม่ต้องลงเวลาเข้าออกเลย (ผู้บริหาร / พนักงานเหมาจ่าย) */
  attendanceTrackingRequired?: boolean;
  /** ช่วงที่ยกเว้นรายคน เช่น ['AFTERNOON_IN'] = ไม่ต้องกดเข้างานบ่าย */
  attendanceExemptSessions?: string[];
  /** null = ยังไม่ถูกผูก ใช้กะตามสาขา/บริษัท */
  assignment: EmployeeShiftAssignment | null;
};

/** ตั้งการยกเว้นการลงเวลาให้พนักงานหลายคนพร้อมกัน */
export type UpdateAttendanceExemptionForm = {
  employeeIds: string[];
  /** ไม่ส่ง = คงค่าเดิม */
  trackingRequired?: boolean;
  /** ไม่ส่ง = คงค่าเดิม */
  exemptSessions?: string[];
};

export type EmployeeShiftAssignmentListResponse = {
  items: EmployeeShiftRow[];
  summary: {
    total: number;
    assigned: number;
    unassigned: number;
  };
};

export type AssignEmployeeShiftForm = {
  employeeIds: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  note?: string | null;
};
