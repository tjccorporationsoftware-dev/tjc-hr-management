export type DashboardTrend = "up" | "down" | "neutral";

export type DashboardSummaryMetric = {
  value: number;
  change: number;
  changeText: string;
  trend: DashboardTrend;
};

export type DashboardOverviewResponse = {
  generatedAt: string;

  summary: {
    totalEmployees: DashboardSummaryMetric;
    attendanceRate: DashboardSummaryMetric;
    openLeaveRequests: DashboardSummaryMetric;
    departments: DashboardSummaryMetric;
    totalOtHours: DashboardSummaryMetric;
  };

  attendanceTrend: Array<{
    month: string;
    rate: number;
  }>;

  monthlyStats: Array<{
    month: string;
    leave: number;
    ot: number;
    absent: number;
  }>;

  departmentDistribution: Array<{
    name: string;
    value: number;
    percent: string;
    color: string;
  }>;

  recentRequests: Array<{
    id: string;
    kind: "LEAVE" | "OT";
    type: string;
    requester: string;
    detail: string;
    date: string;
    status: string;
    statusTone: "amber" | "emerald" | "rose" | "slate";
    createdAt: string;
  }>;

  insights: Array<{
    key: string;
    title: string;
    detail: string;
    trend: DashboardTrend;
  }>;
};
export type DashboardEmployeeMini = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  startDate?: string | null;
  probationEndDate?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  company?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;
  branch?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;
  department?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;
  division?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;
  positionMaster?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;
};

export type DashboardHrReviewItem = {
  id: string;
  sourceType: string;
  sourceId: string;
  requestNo?: string | null;
  title: string;
  reason?: string | null;
  sourceStatus?: string | null;
  reviewStatus: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  employee: DashboardEmployeeMini | null;
  detail?: Record<string, unknown>;
  review?: Record<string, unknown> | null;
};

export type DashboardAttendanceLogItem = {
  id: string;
  employeeId: string;
  workDate: string;
  logTime: string;
  logType: string;
  status: string;
  source?: string | null;
  session?: string | null;
  employee: DashboardEmployeeMini;
};

export type HrDashboardChartNumberItem = {
  label: string;
  value: number;
};

export type HrDashboardDepartmentChartItem = {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  label?: string | null;
  count: number;
};

export type HrDashboardStatusChartItem = {
  status: string;
  label: string;
  count: number;
};

export type HrDashboardMonthlyTrendItem = {
  month: string;
  newEmployees: number;
  resignations: number;
  leaveRequests: number;
  overtimeHours: number;
};

export type HrDashboardRequestTypeItem = {
  key: string;
  label: string;
  total: number;
  pending: number;
};

export type HrDashboardLeaveTypeItem = {
  id: string;
  code?: string | null;
  label: string;
  isPaid?: boolean | null;
  count: number;
  days: number;
};

export type HrDashboardAttendanceChannelItem = {
  key: string;
  label: string;
  count: number;
  /** จำนวนที่แนบพิกัดมาด้วย — GPS เป็นคุณสมบัติของการลงเวลา ไม่ใช่ช่องทางแยก */
  gpsCount: number;
};

export type HrDashboardAttendanceConditionItem = {
  key: string;
  label: string;
  count: number;
};

export type HrPayrollMonthItem = {
  month: number;
  label: string;
  hasRun: boolean;
  status?: string | null;
  employees: number;
  baseSalary: number;
  otherEarnings: number;
  deductions: number;
  netPay: number;
  tax: number;
  socialSecurityEmployee: number;
  socialSecurityEmployer: number;
};

export type ExecutiveDepartmentInsight = {
  id: string | null;
  label: string;
  headcount: number;
  costPerHead: number;
  otHoursPerHead: number;
  lateMinutesPerHead: number;
  absenceRate: number;
  turnoverRate: number;
};

/** ตัวชี้วัดระดับผู้บริหาร — อัตราส่วน ต่อหัว และเทียบเดือนก่อน */
export type ExecutiveInsightsResponse = {
  generatedAt: string;
  periodLabel: string;
  workforce: {
    headcount: number;
    avgTenureMonths: number;
    turnoverRate: number;
    turnoverRatePrev: number;
    resigned: number;
    resignedPrev: number;
    hired: number;
    hiredPrev: number;
    probationPassRate: number;
  };
  discipline: {
    absenceRate: number;
    absenceRatePrev: number;
    lateMinutesPerHead: number;
    lateMinutesPerHeadPrev: number;
    leaveDaysPerHead: number;
    leaveDaysPerHeadPrev: number;
    penaltyAmount: number;
    penaltyAmountPrev: number;
  };
  cost: {
    costPerHead: number;
    costPerHeadPrev: number;
    otHoursPerHead: number;
    otHoursPerHeadPrev: number;
    otCostShare: number;
    netPay: number;
    earnings: number;
    otPay: number;
  };
  departments: ExecutiveDepartmentInsight[];
  trend: Array<{
    month: string;
    costPerHead: number;
    otHoursPerHead: number;
    absenceRate: number;
    turnoverRate: number;
  }>;
};

export type HrPayrollSummaryResponse = {
  generatedAt: string;
  year: number;
  availableYears: number[];
  months: HrPayrollMonthItem[];
  totals: {
    baseSalary: number;
    otherEarnings: number;
    deductions: number;
    netPay: number;
    tax: number;
    socialSecurityEmployee: number;
    socialSecurityEmployer: number;
    runCount: number;
    periodCount: number;
  };
  latestMonth: HrPayrollMonthItem | null;
  /** โครงสร้างรายได้/รายการหักของงวดล่าสุดที่คำนวณแล้ว */
  composition?: {
    earnings: PayrollCompositionItem[];
    deductions: PayrollCompositionItem[];
  };
};

export type PayrollCompositionItem = {
  key: string;
  label: string;
  amount: number;
  /** true = รายได้ประจำ (ผูกพันทุกงวด) */
  recurring: boolean;
};

/** มาสายเป็นคุณสมบัติของคนที่มาทำงาน ไม่ใช่สถานะแยก */
export type ExecutiveAttendanceStatus = "PRESENT" | "LEAVE" | "ABSENT";

export type ExecutiveAttendanceRow = {
  id: string;
  employeeCode: string;
  name: string;
  position?: string | null;
  departmentId?: string | null;
  department?: string | null;
  branch?: string | null;
  status: ExecutiveAttendanceStatus;
  late: boolean;
  /** null = ระบบรู้ว่าสายแต่ยังไม่ได้คำนวณจำนวนนาที */
  lateMinutes: number | null;
  hasMissingLog: boolean;
  leaveType?: string | null;
  morningInAt?: string | null;
  afternoonInAt?: string | null;
  checkOutAt?: string | null;
};

/** ใครมา ใครลา ใครสายวันนี้ รายคน */
export type ExecutiveAttendanceTodayResponse = {
  generatedAt: string;
  workDate: string;
  summary: {
    total: number;
    present: number;
    /** จำนวนคนที่มาสาย — เป็นส่วนหนึ่งของ present */
    late: number;
    /** ลงเวลาไม่ครบตามกะที่ตั้งไว้ */
    missing: number;
    leave: number;
    absent: number;
  };
  byDepartment: Array<{
    id: string | null;
    label: string;
    total: number;
    present: number;
    late: number;
    leave: number;
    absent: number;
  }>;
  filterOptions: {
    departments: Array<{ id: string; label: string }>;
    branches: Array<{ id: string; label: string }>;
  };
  rows: ExecutiveAttendanceRow[];
};

export type HrDashboardSummaryResponse = {
  generatedAt: string;
  summary: {
    totalEmployees: number;
    activeEmployees: number;
    newEmployeesThisMonth: number;
    resignedThisMonth: number;
    checkInToday: number;
    lateToday: number;
    missingCheckInToday: number;
    leaveToday: number;
    submittedOvertime: number;
    submittedTimeAdjust: number;
    pendingDocuments: number;
    pendingHrReview: number;
    probationDueSoon: number;
  };
  charts?: {
    departmentHeadcount?: HrDashboardDepartmentChartItem[];
    employeeStatus?: HrDashboardStatusChartItem[];
    attendanceToday?: HrDashboardChartNumberItem[];
    requestQueue?: HrDashboardChartNumberItem[];
    monthlyTrend?: HrDashboardMonthlyTrendItem[];
    currentMonthLabel?: string;
    requestTypes?: HrDashboardRequestTypeItem[];
    leaveByType?: HrDashboardLeaveTypeItem[];
    attendanceChannel?: HrDashboardAttendanceChannelItem[];
    attendanceCondition?: HrDashboardAttendanceConditionItem[];
  };
  newEmployeesThisMonth: DashboardEmployeeMini[];
  missingCheckIn: DashboardEmployeeMini[];
  attendanceLogs: DashboardAttendanceLogItem[];
  hrReviewItems: DashboardHrReviewItem[];
  probationRecords: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    employee: DashboardEmployeeMini;
  }>;
};

export type PayrollDashboardFilterParams = {
  companyId?: string;
  branchId?: string;
};

export type PayrollDashboardFilterOption = {
  id: string;
  code?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
};

export type PayrollDashboardSummaryResponse = {
  generatedAt: string;
  filters?: {
    companyId?: string | null;
    branchId?: string | null;
  };
  filterOptions?: {
    companies: PayrollDashboardFilterOption[];
    branches: PayrollDashboardFilterOption[];
  };
  summary: {
    activeCompensationCount: number;
    payrollReadyCount: number;
    attendancePayrollReadyCount?: number;
    legacyPayrollReadyCount?: number;
    pendingRunCount: number;
    paidRunCount: number;
    totalNetPay: number;
  };
  periods: Array<Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
  payrollReadyItems: DashboardHrReviewItem[];
};

export type ExecutiveDashboardSummaryResponse = {
  generatedAt: string;
  manpower: {
    metrics: {
      totalEmployees: number;
      activeEmployees: number;
      probationEmployees: number;
      currentMonthNewEmployees: number;
      pendingRequests: number;
      activeRate: number;
    };
    charts: {
      byDepartment: Array<{
        id?: string | null;
        code?: string | null;
        name?: string | null;
        label?: string | null;
        count: number;
      }>;
      byStatus: Array<{
        status: string;
        label: string;
        count: number;
      }>;
    };
  };
  summary: {
    checkInToday: number;
    lateToday: number;
    leaveToday: number;
    missingCheckInToday: number;
    pendingHrReview: number;
    approvedOtHours: number;
  };

  payroll?: {
    summary: {
      totalRuns: number;
      paidRuns: number;
      totalEmployees: number;
      totalEarnings: number;
      totalDeductions: number;
      totalNetPay: number;
      paidEmployees: number;
      paidEarnings: number;
      paidDeductions: number;
      paidNetPay: number;
    };
  };
  payrollPeriods: Array<Record<string, unknown>>;
  payrollRuns: Array<Record<string, unknown>>;
  hrReviewItems: DashboardHrReviewItem[];
};

export type MyDashboardSummaryResponse = {
  generatedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    permissions: string[];
  };
  employee: DashboardEmployeeMini | null;
  summary: {
    attendanceLogCountToday: number;
    leaveRequestsThisMonth: number;
    overtimeRequestsThisMonth: number;
  };
  attendanceToday: Array<Record<string, unknown>>;
};

export type AdminDashboardSummaryResponse = {
  generatedAt: string;
  summary: {
    userCount: number;
    activeUserCount: number;
    roleCount: number;
    permissionCount: number;
    failedLoginCount: number;
    auditLogCountToday: number;
  };
};
