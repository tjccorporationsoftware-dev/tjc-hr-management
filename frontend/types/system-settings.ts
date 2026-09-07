export type AttendanceHolidayWeekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type AttendanceCustomHolidayType = "COMPANY" | "SPECIAL" | "PUBLIC";
export type AttendanceHolidaySwapScopeType = "COMPANY" | "BRANCH" | "DEPARTMENT" | "EMPLOYEE";
export type AttendanceHolidaySwapStatus = "ACTIVE" | "CANCELLED";

export type AttendanceCustomHoliday = {
  id?: string;
  date: string;
  name: string;
  holidayType?: AttendanceCustomHolidayType;
};

export type AttendanceHolidayWorkAssignmentTargetType =
  | "ALL"
  | "COMPANY"
  | "BRANCH"
  | "DEPARTMENT"
  | "DIVISION"
  | "EMPLOYEE_TYPE"
  | "EMPLOYEE";

export type AttendanceHolidayWorkOverride = {
  id?: string;
  holidayId?: string;
  date: string;
  holidayName?: string | null;
  name: string;
  reason?: string | null;
  appliesToAll?: boolean;
  grantSubstituteHoliday?: boolean;
  targetType?: AttendanceHolidayWorkAssignmentTargetType;
  targetId?: string | null;
  companyIds?: string[];
  branchIds?: string[];
  departmentIds?: string[];
  divisionIds?: string[];
  employeeTypeIds?: string[];
  employeeIds?: string[];
};

export type CreateHolidayCalendarPayload = {
  date: string;
  name?: string;
  holidayType?: AttendanceCustomHolidayType;
};

export type CreateHolidayWorkAssignmentPayload = {
  holidayId: string;
  targetType: AttendanceHolidayWorkAssignmentTargetType;
  targetIds?: string[];
  name?: string;
  reason?: string | null;
  grantSubstituteHoliday?: boolean;
};

export type AttendanceHolidaySwap = {
  id: string;
  /** null = ให้วันหยุดเพิ่ม ไม่ได้เอาวันหยุดวันไหนไปแลก */
  originalHolidayDate: string | null;
  swappedHolidayDate: string;
  scopeType: AttendanceHolidaySwapScopeType;
  scopeId: string;
  scopeName?: string | null;
  name?: string | null;
  reason?: string | null;
  status: AttendanceHolidaySwapStatus;
  createdAt: string;
  updatedAt: string;
  createdById?: string | null;
  updatedById?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledReason?: string | null;
};

export type CreateHolidaySwapPayload = {
  /** ไม่ส่ง = ให้วันหยุดเพิ่มโดยไม่ต้องแลกกับวันไหน */
  originalHolidayDate?: string | null;
  swappedHolidayDate: string;
  scopeType: AttendanceHolidaySwapScopeType;
  scopeId: string;
  name?: string | null;
  reason?: string | null;
};

export type CancelHolidaySwapPayload = {
  cancelReason?: string | null;
};


export type AttendanceSubstituteHolidayCreditStatus = "AVAILABLE" | "USED" | "CANCELLED";

export type AttendanceSubstituteHolidayCredit = {
  id: string;
  employeeId: string;
  employeeCode?: string | null;
  employeeName?: string | null;
  earnedDate: string;
  holidayId?: string | null;
  workAssignmentId?: string | null;
  holidayName?: string | null;
  workOverrideName?: string | null;
  reason?: string | null;
  grantedDays: number;
  grantedMinutes: number;
  status: AttendanceSubstituteHolidayCreditStatus;
  sourceType: "WORKING_HOLIDAY_ATTENDANCE";
  sourceSummaryId?: string | null;
  grantedAt: string;
  grantedById?: string | null;
  usedAt?: string | null;
  usedById?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledReason?: string | null;
};

export type SystemSettings = {
  id: string;
  organizationName: string;
  timezone: "Asia/Bangkok" | "UTC";
  locale: "th-TH" | "en-US";
  dateFormat: "DD/MM/YYYY พ.ศ." | "DD/MM/YYYY" | "YYYY-MM-DD";
  timeFormat: "HH:mm" | "HH:mm:ss";
  fiscalYearStartMonth: number;
  attendanceWeeklyHolidays: AttendanceHolidayWeekday[];
  attendanceCustomHolidays: AttendanceCustomHoliday[];
  attendanceHolidayWorkOverrides: AttendanceHolidayWorkOverride[];
  attendanceSubstituteHolidayCredits: AttendanceSubstituteHolidayCredit[];
  attendanceHolidaySwaps?: AttendanceHolidaySwap[];
  payrollCutoffDay: number;
  payrollPeriodStartDay: number;
  salaryDivisorDays: number;
  workingHoursPerDay: number;
  socialSecurityEmployeeRate: number;
  socialSecurityEmployerRate: number;
  socialSecurityMinBase: number;
  socialSecurityMaxBase: number;
  fileUploadMaxMb: number;
  allowedFileTypes: string[];
  sessionTimeoutMinutes: number;
  passwordMinLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  requireTwoFactor: boolean;
  enableEmailNotification: boolean;
  enableLineNotification: boolean;
  maintenanceMode: boolean;
  createdAt: string;
  updatedAt: string;
  createdById?: string | null;
  updatedById?: string | null;
};

export type SystemSettingsValue = Omit<
  SystemSettings,
  "id" | "createdAt" | "updatedAt" | "createdById" | "updatedById"
>;

export type UpdateSystemSettingsPayload = Partial<
  Pick<
    SystemSettings,
    | "organizationName"
    | "timezone"
    | "locale"
    | "dateFormat"
    | "timeFormat"
    | "fiscalYearStartMonth"
    | "attendanceWeeklyHolidays"
    | "payrollCutoffDay"
    | "payrollPeriodStartDay"
    | "salaryDivisorDays"
    | "workingHoursPerDay"
    | "socialSecurityEmployeeRate"
    | "socialSecurityEmployerRate"
    | "socialSecurityMinBase"
    | "socialSecurityMaxBase"
    | "fileUploadMaxMb"
    | "allowedFileTypes"
    | "sessionTimeoutMinutes"
    | "passwordMinLength"
    | "requireUppercase"
    | "requireLowercase"
    | "requireNumber"
    | "requireSymbol"
    | "requireTwoFactor"
    | "enableEmailNotification"
    | "enableLineNotification"
    | "maintenanceMode"
  >
>;


export type CompanyPayrollSettingSource = "COMPANY" | "SYSTEM_DEFAULT";

export type CompanyPayrollSettingCompany = {
  id: string;
  code?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
};

export type CompanyPayrollSetting = {
  id?: string | null;
  companyId: string;
  company?: CompanyPayrollSettingCompany | null;
  payrollCutoffDay: number;
  payrollPeriodStartDay: number;
  salaryDivisorDays: number;
  workingHoursPerDay: number;
  socialSecurityEmployeeRate: number;
  socialSecurityEmployerRate: number;
  socialSecurityMinBase: number;
  socialSecurityMaxBase: number;
  status: "ACTIVE" | "INACTIVE";
  source: CompanyPayrollSettingSource;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type UpdateCompanyPayrollSettingsPayload = Partial<
  Pick<
    CompanyPayrollSetting,
    | "payrollCutoffDay"
    | "payrollPeriodStartDay"
    | "salaryDivisorDays"
    | "workingHoursPerDay"
    | "socialSecurityEmployeeRate"
    | "socialSecurityEmployerRate"
    | "socialSecurityMinBase"
    | "socialSecurityMaxBase"
  >
>;

export type CompanyPayrollSettingAuditItem = {
  id: string;
  settingId: string;
  companyId: string;
  previousValue: UpdateCompanyPayrollSettingsPayload;
  newValue: UpdateCompanyPayrollSettingsPayload;
  changedById?: string | null;
  changedBy?: {
    id: string;
    email?: string | null;
    displayName?: string | null;
  } | null;
  createdAt: string;
};

export type CompanyPayrollSettingAuditResponse = {
  data: CompanyPayrollSettingAuditItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type SystemSettingsAuditItem = {
  id: string;
  settingId: string;
  previousValue: SystemSettingsValue;
  newValue: SystemSettingsValue;
  changedById?: string | null;
  changedBy?: {
    id: string;
    email?: string | null;
    displayName?: string | null;
  } | null;
  createdAt: string;
};

export type SystemSettingsAuditResponse = {
  data: SystemSettingsAuditItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
