export type ReportCode =
  | "ATTENDANCE"
  | "PAYROLL_BASIC"
  | "SOCIAL_SECURITY"
  | "LEAVE_QUOTA"
  | "WORK_STATUS"
  | "ATTENDANCE_LOG"
  | "LEAVE_REQUEST"
  | "EMPLOYEE_REGISTER";

export type ReportJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ExportFileFormat = "CSV" | "XLSX" | "PDF" | "JSON";

export type ReportLogAction =
  | "VIEW"
  | "CREATE_EXPORT"
  | "DOWNLOAD"
  | "CANCEL"
  | "ERROR";



export type ReportDataQueryParams = {
  page?: number;
  pageSize?: number;
  sortBy?: "default" | "employee" | "dateDesc" | "dateAsc";
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  year?: number;
};

export type ReportCatalogItem = {
  code: ReportCode;
  name: string;
  description: string;
  supportedFormats: ExportFileFormat[];
};

export type ReportCompany = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type ReportEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
};

export type ReportOrgUnit = {
  id: string;
  code: string;
  nameTh: string;
};

export type ReportDataResponse = {
  reportCode: ReportCode;
  title: string;
  warning?: string;
  filters: ReportDataQueryParams;
  metrics: Record<string, number>;
  summaryByEmployee?: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ReportJob = {
  id: string;
  companyId?: string | null;
  reportCode: ReportCode;
  name: string;
  description?: string | null;
  status: ReportJobStatus;
  params?: Record<string, unknown> | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
  errorMessage?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
  company?: ReportCompany | null;
  exportFiles?: ExportFile[];
  logs?: ReportLog[];
};

export type ReportJobListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  reportCode?: ReportCode | "";
  status?: ReportJobStatus | "";
  dateFrom?: string;
  dateTo?: string;
};

export type ReportJobListSummary = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
};

export type ReportJobListResponse = {
  items: ReportJob[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: ReportJobListSummary;
};

export type CreateReportJobForm = {
  reportCode: ReportCode;
  companyId?: string;
  name?: string;
  description?: string;
  format?: ExportFileFormat;
  params?: Record<string, unknown>;
};

export type ReportJobActionForm = {
  reason?: string;
  note?: string;
};

export type ExportFile = {
  id: string;
  companyId?: string | null;
  reportJobId?: string | null;
  reportCode: ReportCode;
  format: ExportFileFormat;
  title: string;
  description?: string | null;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  storageProvider: string;
  storageKey: string;
  bucketName?: string | null;
  downloadedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  company?: ReportCompany | null;
  reportJob?: {
    id: string;
    reportCode: ReportCode;
    name: string;
    status: ReportJobStatus;
  } | null;
};

export type ExportFileListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  reportJobId?: string;
  reportCode?: ReportCode | "";
  format?: ExportFileFormat | "";
  dateFrom?: string;
  dateTo?: string;
};

export type ExportFileListSummary = {
  total: number;
  csv: number;
  xlsx: number;
  pdf: number;
  json: number;
};

export type ExportFileListResponse = {
  items: ExportFile[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: ExportFileListSummary;
};

export type ReportLog = {
  id: string;
  companyId?: string | null;
  reportJobId?: string | null;
  exportFileId?: string | null;
  reportCode?: ReportCode | null;
  action: ReportLogAction;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  company?: ReportCompany | null;
  reportJob?: {
    id: string;
    reportCode: ReportCode;
    name: string;
    status: ReportJobStatus;
  } | null;
  exportFile?: {
    id: string;
    title: string;
    fileName: string;
    format: ExportFileFormat;
  } | null;
};

export type ReportLogListParams = {
  page?: number;
  pageSize?: number;
  companyId?: string;
  reportJobId?: string;
  exportFileId?: string;
  reportCode?: ReportCode | "";
  action?: ReportLogAction | "";
  dateFrom?: string;
  dateTo?: string;
};

export type ReportLogListSummary = {
  total: number;
  view: number;
  download: number;
  createExport: number;
  cancel: number;
  error: number;
};

export type ReportLogListResponse = {
  items: ReportLog[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: ReportLogListSummary;
};

export type ProcessReportJobResponse = {
  job: ReportJob;
  exportFile: ExportFile;
};

export type ReportQueueJob = {
  id: string;
  name: string;
  state: string;
  data: {
    reportJobId: string;
    currentUserId?: string | null;
  };
  attemptsMade: number;
  failedReason?: string | null;
  progress?: unknown;
  timestamp?: number;
  processedOn?: number | null;
  finishedOn?: number | null;
};

export type EnqueueReportJobResponse = {
  queued: boolean;
  reportJobId: string;
  queueJob: ReportQueueJob;
  message: string;
};

export type ReportQueueJobStatusResponse = {
  queueJob: ReportQueueJob | null;
};
/* ==========================================================
   สถิติการใช้งานระบบ — GET /reports/statistics
   ==========================================================
   รูปร่างตรงกับ ReportStatisticsService ฝั่ง backend
   ตัวเลขทุกบล็อกอ้างช่วงเวลาเดียวกัน ยกเว้นยอดคงเหลือ ณ ปัจจุบัน
   ที่ระบุไว้ในชื่อฟิลด์เอง (เช่น activeTotal, probationInProgress) */

export type StatCount = { key: string; count: number };
export type StatDayCount = { key: string; count: number };

export type ReportStatistics = {
  generatedAt: string;
  range: { dateFrom: string; dateTo: string; days: number };
  scope: { companyId: string | null; branchId: string | null };

  workforce: {
    activeTotal: number;
    newHires: number;
    separations: number;
    netChange: number;
    byStatus: StatCount[];
    byEmploymentType: StatCount[];
    byDepartment: StatCount[];
  };

  attendance: {
    recordedDays: number;
    lateDays: number;
    lateMinutes: number;
    absentDays: number;
    missingLogDays: number;
    approvedOtHours: number;
    payableOtHours: number;
    deductionAmount: number;
    /** null = ยังไม่มีบันทึกในช่วงนี้ ไม่ใช่ 0% */
    attendanceRate: number | null;
  };

  leave: {
    totalRequests: number;
    approvedDays: number;
    byStatus: Array<StatCount & { days: number }>;
    byType: Array<StatCount & { days: number }>;
  };

  overtime: {
    totalRequests: number;
    approvedHours: number;
    byStatus: Array<StatCount & { hours: number }>;
  };

  payroll: {
    totalRuns: number;
    paidEmployees: number;
    grossPay: number;
    netPay: number;
    deductions: number;
    byStatus: StatCount[];
  };

  recruitment: {
    openPostings: number;
    newApplications: number;
    interviews: number;
    offers: number;
    hired: number;
    postingsByStatus: StatCount[];
    applicationsByStage: StatCount[];
  };

  lifecycle: {
    probationInProgress: number;
    offboardingInProgress: number;
    probationByStatus: StatCount[];
    offboardingByStatus: StatCount[];
    onboardingTasksByStatus: StatCount[];
  };

  documents: {
    documentRequests: number;
    exportsGenerated: number;
    complaints: number;
    requestsByStatus: StatCount[];
    exportsByFormat: StatCount[];
    reportJobsByStatus: StatCount[];
  };

  system: {
    totalEvents: number;
    failedEvents: number;
    logins: number;
    failedLogins: number;
    /** true = การแจกแจงคิดจากรายการล่าสุดเท่านั้น ไม่ใช่ทั้งช่วง */
    breakdownTruncated: boolean;
    byAction: StatCount[];
    byEntity: StatCount[];
    byDay: StatDayCount[];
    topUsers: Array<{
      userId: string;
      email: string | null;
      displayName: string | null;
      lastLoginAt: string | null;
      count: number;
      failed: number;
    }>;
  };
};

export type ReportStatisticsParams = {
  companyId?: string;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  days?: number;
};

export type ReportUserActivity = {
  user: {
    id: string;
    email: string;
    displayName: string;
    lastLoginAt: string | null;
    status: string;
  };
  range: { dateFrom: string; dateTo: string; days: number };
  total: number;
  failed: number;
  byAction: StatCount[];
  byEntity: StatCount[];
  byDay: StatDayCount[];
  recent: Array<{
    action: string;
    entity: string;
    description: string | null;
    path: string | null;
    statusCode: number | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
};
