export type ProfileRole = {
  id: string;
  code: string;
  name: string;
};

export type ProfileMasterRef = {
  id: string;
  code?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
  name?: string | null;
  description?: string | null;
  status?: string | null;
};

export type ProfilePositionRef = ProfileMasterRef & {
  level?: number | null;
  sortOrder?: number | null;
};

export type ProfileUser = {
  id: string;
  email: string;
  displayName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status: string;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  roles: ProfileRole[];
  permissions: string[];
};

export type ProfileEmployeePersonal = {
  id?: string;
  employeeId?: string;
  gender?: string | null;
  birthDate?: string | null;
  nationalId?: string | null;
  passportNo?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  religion?: string | null;
  currentAddress?: string | null;
  registeredAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactAddress?: string | null;
  /** ผู้ติดต่อฉุกเฉินคนที่สอง */
  emergencyContactName2?: string | null;
  emergencyContactPhone2?: string | null;
  emergencyContactRelation2?: string | null;
  emergencyContactAddress2?: string | null;
  personalEmail?: string | null;
  workPhoneExt?: string | null;
  lineId?: string | null;
  bloodType?: string | null;
  educationLevel?: string | null;
  educationInstitute?: string | null;
  educationMajor?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  note?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProfileSimpleUser = {
  id?: string;
  email?: string | null;
  displayName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  status?: string | null;
  lastLoginAt?: string | null;
};

export type ProfileSupervisor = {
  id: string;
  employeeCode?: string | null;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
};

export type ProfileEmployeeDocument = {
  id: string;
  type?: string | null;
  title?: string | null;
  description?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  storageProvider?: string | null;
  storageKey?: string | null;
  bucketName?: string | null;
  issuedDate?: string | null;
  expiredDate?: string | null;
  status?: string | null;
  uploadedBy?: ProfileSimpleUser | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProfileWorkHistory = {
  id: string;
  type?: string | null;
  effectiveDate?: string | null;
  title?: string | null;
  description?: string | null;
  oldPosition?: string | null;
  newPosition?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  oldCompany?: ProfileMasterRef | null;
  newCompany?: ProfileMasterRef | null;
  oldBranch?: ProfileMasterRef | null;
  newBranch?: ProfileMasterRef | null;
  oldDepartment?: ProfileMasterRef | null;
  newDepartment?: ProfileMasterRef | null;
  oldDivision?: ProfileMasterRef | null;
  newDivision?: ProfileMasterRef | null;
  oldEmployeeType?: ProfileMasterRef | null;
  newEmployeeType?: ProfileMasterRef | null;
  createdBy?: ProfileSimpleUser | null;
  createdAt?: string | null;
};

export type ProfileAttendanceLog = {
  id: string;
  workDate?: string | null;
  logType?: string | null;
  logTime?: string | null;
  session?: string | null;
  status?: string | null;
  channel?: string | null;
  source?: string | null;
  note?: string | null;
  device?: ProfileMasterRef | null;
  location?: ProfileMasterRef | null;
};

export type ProfileLeaveBalance = {
  id: string;
  year?: number | null;
  entitledDays?: number | null;
  carriedForwardDays?: number | null;
  usedDays?: number | null;
  pendingDays?: number | null;
  remainingDays?: number | null;
  leaveType?: ProfileMasterRef | null;
};

export type ProfileLeaveRequest = {
  id: string;
  requestNo?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dayType?: string | null;
  totalDays?: number | null;
  totalMinutes?: number | null;
  reason?: string | null;
  status?: string | null;
  leaveType?: ProfileMasterRef | null;
  submittedAt?: string | null;
  createdAt?: string | null;
};

export type ProfileOvertimeRequest = {
  id: string;
  requestNo?: string | null;
  workDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  totalHours?: number | null;
  totalMinutes?: number | null;
  reason?: string | null;
  status?: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
};

export type ProfileTimeAdjustRequest = {
  id: string;
  requestNo?: string | null;
  workDate?: string | null;
  requestedLogTime?: string | null;
  requestedCheckInAt?: string | null;
  requestedCheckOutAt?: string | null;
  reason?: string | null;
  status?: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
};

export type ProfileDocumentRequest = {
  id: string;
  requestNo?: string | null;
  documentType?: ProfileMasterRef | null;
  purpose?: string | null;
  status?: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
};

export type ProfileEmployeeSummary = {
  hasEmployeeProfile: boolean;
  documentCount: number;
  activeDocumentCount: number;
  expiredDocumentCount: number;
  workHistoryCount: number;
  resignationCount: number;
  attendanceLogCount: number;
  leaveBalanceCount: number;
  leaveRequestCount: number;
  pendingLeaveRequestCount: number;
  approvedLeaveRequestCount: number;
  overtimeRequestCount: number;
  pendingOvertimeRequestCount: number;
  approvedOvertimeRequestCount: number;
  timeAdjustRequestCount: number;
  documentRequestCount: number;
  complaintCount: number;
  evaluationResultCount: number;
  warningLetterCount: number;
  disciplinaryHistoryCount: number;
  onboardingTaskCount: number;
  onboardingDocumentCount: number;
  probationRecordCount: number;
  compensationCount?: number;
  payrollItemCount?: number;
};

export type ProfileEmployee = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  positionId?: string | null;
  positionMaster?: ProfilePositionRef | null;
  supervisorId?: string | null;
  supervisor?: ProfileSupervisor | null;
  startDate: string;
  probationEndDate?: string | null;
  status: string;
  company: ProfileMasterRef;
  branch?: ProfileMasterRef | null;
  department?: ProfileMasterRef | null;
  division?: ProfileMasterRef | null;
  employeeType?: ProfileMasterRef | null;
  user?: ProfileSimpleUser | null;
  profile?: ProfileEmployeePersonal | null;
  documents?: ProfileEmployeeDocument[];
  workHistories?: ProfileWorkHistory[];
  attendanceLogs?: ProfileAttendanceLog[];
  leaveBalances?: ProfileLeaveBalance[];
  leaveRequests?: ProfileLeaveRequest[];
  overtimeRequests?: ProfileOvertimeRequest[];
  timeAdjustRequests?: ProfileTimeAdjustRequest[];
  documentRequests?: ProfileDocumentRequest[];
  probationRecords?: Array<Record<string, unknown>>;
  onboardingTasks?: Array<Record<string, unknown>>;
  warningLetters?: Array<Record<string, unknown>>;
  disciplinaryHistories?: Array<Record<string, unknown>>;
};

export type MyProfileResponse = {
  user: ProfileUser;
  employee: ProfileEmployee | null;
  summary?: ProfileEmployeeSummary | null;
};

/**
 * ช่องที่พนักงานแก้เองได้ — ตรงกับ UpdateMyProfileDto ฝั่ง backend
 * ข้อมูลสังกัด/ตำแหน่ง/บัญชีธนาคาร/เลขบัตรประชาชน ไม่อยู่ในนี้โดยตั้งใจ
 */
export type UpdateMyProfilePayload = {
  displayName?: string;
  phone?: string | null;

  maritalStatus?: string;
  nationality?: string | null;
  religion?: string | null;
  bloodType?: string | null;
  lineId?: string | null;
  personalEmail?: string | null;

  currentAddress?: string | null;
  registeredAddress?: string | null;

  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactAddress?: string | null;
  emergencyContactName2?: string | null;
  emergencyContactPhone2?: string | null;
  emergencyContactRelation2?: string | null;
  emergencyContactAddress2?: string | null;

  educationLevel?: string | null;
  educationInstitute?: string | null;
  educationMajor?: string | null;
};
