import {
  forceLogoutClient,
  getAccessToken,
  setAccessToken,
} from "./auth-token";
import {
  isAttendanceWorkflowMutation,
  notifyAttendanceWorkflowChanged,
} from "./attendance-workflow-events";
import type { ApiResponse, ApiSuccessResponse } from "@/types/auth";
import type {
  CreateEmployeeTransferPayload,
  EmployeeTransferItem,
  EmployeeTransferListParams,
  EmployeeTransferListResponse,
} from "@/types/employee-transfer";
import type {
  CompanyDataDeleteResult,
  CompanyDataListParams,
  CompanyDataListResponse,
  CompanyDataPurgeResult,
  CompanyDataSummaryResponse,
  CompanyDatasetsResponse,
} from "@/types/company-data";

import type {
  AttendanceDailyReviewActionPayload,
  AttendanceDailySummary,
  AttendanceDailySummaryListParams,
  AttendanceDailySummaryListResponse,
  AttendanceDevice,
  AttendanceDeviceEnrollment,
  AttendanceDeviceEnrollmentForm,
  AttendanceDeviceEnrollmentUpdateForm,
  AttendanceDeviceForm,
  AttendanceDevicePunchInput,
  AttendanceDevicePunchResult,
  AttendanceDeviceUpdateForm,
  AttendanceLocation,
  AttendanceLocationForm,
  AttendanceLocationUpdateForm,
  AttendanceScanLogListParams,
  AttendanceScanLogListResponse,
  AttendanceDeviceCommandListResponse,
  PushDeviceEmployeesResult,
  AttendanceScanLogPeopleResponse,
  AttendanceLog,
  AttendanceLogListQuery,
  AttendanceLogListResponse,
  AttendanceMonthlyReviewActionPayload,
  AttendanceMonthlyReviewActionResponse,
  AttendanceMonthlyReviewPeriodActionPayload,
  AttendanceMonthlyReviewDetailParams,
  AttendanceMonthlyReviewDetailResponse,
  AttendanceMonthlyReviewListParams,
  AttendanceMonthlyReviewListResponse,
  AttendanceManualLogForm,
  AttendanceMyToday,
  BulkAttendanceDailyReviewActionPayload,
  BulkAttendanceDailyReviewActionResponse,
  AttendancePunchContext,
  AttendancePunchContextParams,
  AttendanceRecalculationProgressResponse,
  AttendancePolicy,
  AttendancePolicyForm,
  AttendancePolicyListParams,
  AttendancePolicyListResponse,
  AssignEmployeeShiftForm,
  UpdateAttendanceExemptionForm,
  EmployeeShiftAssignmentListResponse,
  AttendancePolicyUpdateForm,
  AttendanceSessionRule,
  AttendanceSessionRuleForm,
  AttendanceSessionRuleListParams,
  AttendanceSessionRuleUpdateForm,
  AttendanceUpdateLogForm,
  ReorderAttendanceSessionRulesForm,
  CancelAttendanceLogForm,
  CheckAttendanceForm,
  PunchAttendanceForm,
  RecalculateAttendanceDailySummariesForm,
  RecalculateAttendanceDailySummariesResponse,
} from "@/types/attendance";
import type {
  BankTransferFilingReport,
  BankTransferFormat,
  FilingReportKind,
  SocialSecurityFilingReport,
  StudentLoanFilingReport,
} from "@/types/payroll-filing";
import type {
  CreateDeductionPlanForm,
  DeductionPlan,
  DeductionPlanDetail,
  DeductionPlanListParams,
  DeductionPlanListResponse,
  UpdateDeductionPlanForm,
} from "@/types/deduction-plan";
import type {
  CopyLeavePolicyForm,
  CopyLeavePolicyResult,
  CreateLeavePolicyForm,
  CreateLeaveRequestForm,
  CreateLeaveTypeForm,
  GenerateLeaveBalancesBulkForm,
  GenerateLeaveBalancesBulkResult,
  GenerateLeaveBalancesForm,
  LeaveBalance,
  LeaveCatalogListResponse,
  LeaveTypeMatrixResponse,
  SaveLeaveTypeMatrixForm,
  LeaveBalanceListParams,
  LeaveBalanceListResponse,
  LeavePolicy,
  LeavePolicyListParams,
  LeaveRequest,
  LeaveRequestActionForm,
  LeaveRequestListParams,
  LeaveRequestListResponse,
  MyLeaveBalanceResponse,
  LeaveType,
  LeaveTypeListParams,
  LeaveTypeListSummary,
  LeavePolicyListSummary,
  UpdateLeaveBalanceForm,
  UpdateLeavePolicyForm,
  UpdateLeaveRequestForm,
  UpdateLeaveTypeForm,
} from "@/types/leave";
import type {
  DataImportCommitResult,
  DataImportDatasetInfo,
  DataImportHistoryItem,
  DataImportListParams,
  DataImportListResponse,
  DataImportPreview,
  DataImportRunForm,
  UploadDataImportForm,
} from "@/types/data-import";
import type {
  CreateOffsiteWorkRequestForm,
  OffsiteWorkActionForm,
  OffsiteWorkRequest,
  OffsiteWorkRequestListParams,
  OffsiteWorkRequestListResponse,
  UpdateOffsiteWorkRequestForm,
  VerifyOffsiteLocationForm,
  VerifyOffsiteLocationResponse,
} from "@/types/offsite-work";
import type {
  CreateOvertimePolicyForm,
  CreateOvertimeRequestForm,
  OvertimeAttachment,
  OvertimeMatrixResponse,
  OvertimePolicy,
  OvertimePolicyListParams,
  OvertimePolicyListSummary,
  OvertimeRequest,
  OvertimeRequestActionForm,
  OvertimeRequestListParams,
  OvertimeRequestListResponse,
  OvertimeWorkType,
  SaveOvertimeMatrixForm,
  SetOvertimeMatrixStatusForm,
  UpdateOvertimePolicyForm,
  UpdateOvertimeRequestForm,
} from "@/types/overtime";
import type {
  CreateTimeAdjustRequestForm,
  TimeAdjustAttachment,
  TimeAdjustRequest,
  TimeAdjustRequestActionForm,
  TimeAdjustRequestListParams,
  TimeAdjustRequestListResponse,
  UpdateTimeAdjustRequestForm,
  TimeAdjustAttendanceLogListParams,
  TimeAdjustAttendanceLogListResponse,
  TimeAdjustEmployeeListResponse,
} from "@/types/time-adjust";
import type { EmployeeListResponse } from "@/types/employee";
import type {
  Complaint,
  ComplaintActionForm,
  ComplaintListParams,
  ComplaintListResponse,
  CreateComplaintForm,
  CreateDocumentRequestForm,
  CreateDocumentTemplateForm,
  CreateDocumentTypeForm,
  CreateResignDocumentRequestForm,
  CreateSalaryCertificateRequestForm,
  CreateVisaCertificateRequestForm,
  CreateWorkCertificateRequestForm,
  DocumentFile,
  DocumentPreset,
  DocumentRequest,
  DocumentRequestActionForm,
  DocumentRequestListParams,
  DocumentRequestListResponse,
  DocumentTemplate,
  DocumentTemplateListParams,
  DocumentTemplateListResponse,
  DocumentType,
  DocumentTypeListParams,
  DocumentTypeListResponse,
  GenerateDocumentPdfForm,
  RenderDocumentResponse,
  UpdateComplaintForm,
  UpdateDocumentRequestForm,
  UpdateDocumentTemplateForm,
  UpdateDocumentTypeForm,
} from "@/types/document-workflow";
import type {
  CreateEvaluationFormForm,
  CreateEvaluationResultForm,
  CreateEvaluatorForm,
  EvaluationForm,
  EvaluationFormListParams,
  EvaluationFormListResponse,
  EvaluationResult,
  EvaluationResultListParams,
  EvaluationResultListResponse,
  Evaluator,
  EvaluatorListParams,
  UpdateEvaluationFormForm,
  UpdateEvaluationResultForm,
  CreateDisciplinaryHistoryForm,
  CreateWarningLetterForm,
  DisciplinaryHistory,
  DisciplinaryHistoryListParams,
  DisciplinaryHistoryListResponse,
  UpdateWarningLetterForm,
  WarningLetter,
  WarningLetterActionForm,
  WarningLetterListParams,
  WarningLetterListResponse,
} from "@/types/performance";
import type {
  ManpowerOrgGroup,
  ManpowerOverview,
  ManpowerPositionGroup,
  ManpowerQueryParams,
  ManpowerStatusGroup,
} from "@/types/manpower";

import type {
  CreateOnboardingChecklistForm,
  CreateOnboardingDocumentForm,
  CreateOnboardingTaskForm,
  CreateProbationRecordForm,
  OnboardingChecklist,
  OnboardingChecklistListParams,
  OnboardingChecklistListSummary,
  OnboardingDocument,
  OnboardingDocumentActionForm,
  OnboardingDocumentListParams,
  OnboardingDocumentListSummary,
  OnboardingListMeta,
  OnboardingTask,
  OnboardingTaskActionForm,
  OnboardingTaskListParams,
  OnboardingProgressListParams,
  OnboardingProgressResponse,
  OnboardingTaskListSummary,
  ProbationActionForm,
  ProbationRecord,
  ProbationRecordListParams,
  ProbationRecordListSummary,
  UpdateOnboardingChecklistForm,
  UpdateOnboardingTaskForm,
} from "@/types/onboarding";
import type {
  CreateOffboardingCaseForm,
  CreateOffboardingChecklistForm,
  CreateOffboardingTaskForm,
  ExitInterview,
  MasterStatus,
  OffboardingCase,
  OffboardingCaseListParams,
  OffboardingCaseListSummary,
  SeveranceQuote,
  OffboardingChecklist,
  OffboardingChecklistListSummary,
  OffboardingListMeta,
  OffboardingTask,
  SaveExitInterviewForm,
  UpdateOffboardingCaseForm,
} from "@/types/offboarding";
import type {
  CreateJobApplicationForm,
  CreateJobInterviewForm,
  CreateJobOfferForm,
  CreateJobPostingForm,
  HireApplicantForm,
  HireApplicantResult,
  JobApplication,
  JobApplicationListParams,
  JobApplicationListSummary,
  JobApplicationStage,
  JobInterview,
  JobOffer,
  JobOfferStatus,
  JobPosting,
  JobPostingListParams,
  JobPostingListSummary,
  RecordInterviewResultForm,
  RecruitmentListMeta,
} from "@/types/recruitment";


import type {
  CreateReportJobForm,
  ExportFileListParams,
  ExportFileListResponse,
  ProcessReportJobResponse,
  ReportCatalogItem,
  ReportDataQueryParams,
  ReportDataResponse,
  ReportJob,
  ReportJobActionForm,
  ReportJobListParams,
  ReportJobListResponse,
  ReportLogListParams,
  ReportLogListResponse,
  ReportStatistics,
  ReportStatisticsParams,
  ReportUserActivity,
  EnqueueReportJobResponse,
  ReportQueueJobStatusResponse,
} from "@/types/reports";

import type {
  CreateEssLeaveRequestForm,
  CreateEssOvertimeRequestForm,
  CreateEssTimeAdjustRequestForm,
  EssAttachment,
  EssAttendanceLog,
  EssDashboardResponse,
  EssLeaveBalance,
  EssLeaveRequest,
  EssLeaveRequestListParams,
  EssLeaveRequestSummary,
  EssListParams,
  EssListResponse,
  EssMeResponse,
  EssOvertimeDayType,
  EssOvertimeRequestSummary,
  EssOvertimeRequest,
  EssOvertimeRequestListParams,
  EssRequestActionForm,
  EssTimeAdjustRequest,
  EssTimeAdjustRequestListParams,
  EssTimeAdjustRequestSummary,
  EssYearParams,
  UploadEssAttachmentForm,
  EssScheduleParams,
  EssScheduleResponse,
} from "@/types/ess";
import type {
  ApprovalActionForm,
  ApprovalListParams,
  ApprovalListResponse,
} from "@/types/approvals";
import type {
  HrReviewActionForm,
  HrReviewItem,
  HrReviewListParams,
  HrReviewListResponse,
} from "@/types/hr-review";
import type {
  MonitoringHealth,
  MonitoringMetrics,
  MonitoringOverview,
  MonitoringReadiness,
} from "@/types/monitoring";
import type {
  AuditCriticalActions,
  AuditLogItem,
  AuditLogListParams,
  AuditLogListResponse,
  AuditSummary,
} from "@/types/audit";
import type {
  BranchItem,
  CompanyItem,
  PaginationMeta as OrganizationPaginationMeta,
} from "@/types/organization";
import type {
  TrashActionResponse,
  TrashListParams,
  TrashListResponse,
  TrashSummary,
} from "@/types/trash";
import type {
  CalculatePayrollRunPayload,
  CancelPayrollRunPayload,
  CreatePayrollRunPayload,
  EmployeeCompensation,
  EmployeeCompensationListSummary,
  EmployeeCompensationsResponse,
  PayrollComponent,
  PayrollComponentsResponse,
  PayrollListParams,
  PayrollPageMeta,
  PayrollPeriod,
  PayrollPeriodListSummary,
  PayrollPeriodsResponse,
  PayrollRun,
  PayrollRunDetail,
  PayrollRunListSummary,
  PayrollRunsResponse,
  PayrollRunActionOptions,
  PayrollRunProgressResponse,
  PayrollAttendanceDeductionsResponse,
  PayrollPayslipPublicationStatusResponse,
  PayrollRunValidationResponse,
  PayrollLineAuditResponse,
  PayrollSourcePreviewResponse,
  PayrollReadinessResponse,
  PayrollDryRunResponse,
  ApprovePayrollRunPayload,
  MarkPayrollRunPaidPayload,
  ReviewPayrollRunPayload,
  PayrollPayslip,
  PayrollPayslipListSummary,
  PayrollPayslipsResponse,
  CreateEmployeeCompensationPayload,
  UpdateEmployeeCompensationPayload,
  CreatePayrollPeriodPayload,
  UpdatePayrollPeriodPayload,
  PayrollTaxOverview,
  PayrollTaxProfileCoverageResponse,
  PayrollTaxYear,
  PayrollTaxYearsResponse,
  PayrollTaxBracket,
  PayrollTaxAllowanceType,
  EmployeeTaxProfile,
  EmployeeTaxProfilesResponse,
  CreatePayrollTaxYearPayload,
  UpdatePayrollTaxYearPayload,
  CreatePayrollTaxBracketPayload,
  UpdatePayrollTaxBracketPayload,
  CreatePayrollTaxAllowanceTypePayload,
  UpdatePayrollTaxAllowanceTypePayload,
  CreateEmployeeTaxProfilePayload,
  UpdateEmployeeTaxProfilePayload,
  CopyEmployeeTaxProfilesPayload,
  CopyEmployeeTaxProfilesResult,
  UpsertEmployeeTaxAllowancePayload,
  UpdateEmployeeTaxAllowancePayload,
  PayrollTaxEmployeePreview,
  PayrollRunTaxPreviewResponse,
  PayrollTaxPreviewPayload,
  PayrollRunTaxPreviewPayload,
  PayrollTaxReportQuery,
  PayrollTaxMonthlyReportResponse,
  PayrollTaxAnnualReportResponse,
  PayrollTaxPnd1ReportResponse,
  PayrollTaxPnd1AReportResponse,
  PayrollTaxPnd1ADetailResponse,
  PayrollTaxWithholdingCertificateDraft,
  SeveranceTierInput,
  SeveranceTiersResponse,
} from "@/types/payroll";

import type {
  MyProfileResponse,
  UpdateMyProfilePayload,
} from "@/types/profile";

import type {
  AttendanceCustomHoliday,
  AttendanceHolidaySwap,
  AttendanceHolidayWorkOverride,
  AttendanceSubstituteHolidayCredit,
  CompanyPayrollSetting,
  CompanyPayrollSettingAuditItem,
  CompanyPayrollSettingAuditResponse,
  CancelHolidaySwapPayload,
  CreateHolidayCalendarPayload,
  CreateHolidaySwapPayload,
  CreateHolidayWorkAssignmentPayload,
  SystemSettings,
  SystemSettingsAuditItem,
  SystemSettingsAuditResponse,
  UpdateCompanyPayrollSettingsPayload,
  UpdateSystemSettingsPayload,
} from "@/types/system-settings";

import type {
  AdminDashboardSummaryResponse,
  DashboardOverviewResponse,
  ExecutiveDashboardSummaryResponse,
  ExecutiveAttendanceTodayResponse,
  ExecutiveInsightsResponse,
  HrDashboardSummaryResponse,
  HrPayrollSummaryResponse,
  MyDashboardSummaryResponse,
  PayrollDashboardFilterParams,
  PayrollDashboardSummaryResponse,
} from "@/types/dashboard";
import type {
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  NotificationInboxResponse,
  NotificationListParams,
  NotificationListResponse,
  NotificationRealtimeEvent,
  NotificationStreamSubscription,
  NotificationSummaryResponse,
} from "@/types/notification";
import type {
  ManagerAttendanceListParams,
  ManagerAttendanceListResponse,
  ManagerDashboardResponse,
  ManagerLeaveListParams,
  ManagerLeaveListResponse,
  ManagerOffsiteListParams,
  ManagerOffsiteListResponse,
  ManagerOvertimeListParams,
  ManagerOvertimeListResponse,
  ManagerTeamListParams,
  ManagerTeamListResponse,
  ManagerTeamCalendarResponse,
  ManagerTeamSummaryParams,
  ManagerTeamSummaryResponse,
  ManagerTimeAdjustListParams,
  ManagerTimeAdjustListResponse,
} from "@/types/manager";

import type { AuthSession, AuthSessionListResponse, AuthSessionListSummary, RevokeSessionResponse } from "@/types/auth";

/* =========================================================
   CORE API CLIENT
   ---------------------------------------------------------
   จุดตั้งค่ากลางของ API ฝั่ง Frontend
   - API_BASE_URL: URL หลักของ Backend
   - ApiClientError: รูปแบบ error กลาง
   - requestApi / apiFetch / apiFetchWithMeta / apiFetchBlob
   - buildQueryString: แปลง object เป็น query string
========================================================= */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type ApiFetchOptions = RequestInit & {
  auth?: boolean;
  /** เวลารอสูงสุดต่อหนึ่ง request หน่วยมิลลิวินาที ใส่ 0 เพื่อปิดการจับเวลา */
  timeoutMs?: number;
};

/*
 * เวลารอสูงสุดของ request ปกติ
 *
 * เคสที่เจอจริง: หลังบ้านหลุดการเชื่อมต่อฐานข้อมูลแล้วไม่ตอบกลับเลย
 * หน้าจอค้างที่ปุ่มจางเป็นสิบนาทีโดยไม่บอกอะไร ผู้ใช้ไม่มีทางรู้ว่าติดอะไร
 * และมักจะกดซ้ำหรือปิดหน้าไปทั้งที่งานอาจยังทำงานอยู่ข้างหลัง
 *
 * ตั้งไว้ 3 นาทีเพราะงานหนักของระบบนี้ เช่น คำนวณเงินเดือนทั้งบริษัท
 * หรือปิดจ่ายแล้วไล่ล็อกเวลาทำงานทั้งงวด ใช้เวลาเกินหนึ่งนาทีเป็นเรื่องปกติ
 */
const DEFAULT_API_TIMEOUT_MS = 180_000;

/**
 * refresh ต้องสั้นกว่า timeout ปกติมาก
 * ถ้าปล่อยยาวเท่ากัน ผู้ใช้จะค้างรอสามนาทีก่อนรู้ว่าต้องล็อกอินใหม่
 */
const REFRESH_TIMEOUT_MS = 15_000;

export class ApiClientError extends Error {
  code: string;
  status: number;
  requestId?: string;
  details?: unknown;

  constructor(params: {
    message: string;
    code: string;
    status: number;
    requestId?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
    this.details = params.details;
  }

  /**
   * ถูกปฏิเสธเพราะไม่มีสิทธิ์ ไม่ใช่เพราะไม่มีข้อมูล
   *
   * เดิมหน้าจอจับ error ไม่ได้แยกกรณีนี้ ผู้ใช้ที่ไม่มีสิทธิ์จึงเห็นข้อความว่า
   * "ไม่มีข้อมูล" ทั้งที่ข้อมูลมีอยู่ — ทำให้เข้าใจว่าระบบพังหรือข้อมูลหาย
   * แล้วไปแจ้งทีมผิดเรื่อง
   */
  get isForbidden() {
    return this.status === 403;
  }

  /** เชื่อมต่อ API ไม่ได้เลย (เซิร์ฟเวอร์ล่ม / เน็ตหลุด) */
  get isUnreachable() {
    return this.status === 0 || this.code === "API_ERROR";
  }
}

/**
 * แปลง error ของ API เป็นข้อความที่ผู้ใช้อ่านแล้วรู้ว่าต้องทำอะไรต่อ
 *
 * @param fallback ข้อความเมื่อไม่รู้จัก error ตัวนั้น
 */
export function apiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  if (error.isForbidden) {
    return (
      error.message ||
      "คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ หากต้องใช้งานให้ติดต่อผู้ดูแลระบบ"
    );
  }

  if (error.isUnreachable) {
    return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง";
  }

  return error.message || fallback;
}

/**
 * ต่ออายุ Access Token เมื่อเจอ 401
 * =================================
 * Access Token มีอายุสั้น (production บังคับไม่เกิน 30 นาที) ส่วน Refresh Token
 * อยู่ใน HttpOnly cookie อายุ 7 วัน เดิมหน้าเว็บไม่เคยเรียก /auth/refresh
 * ระหว่างใช้งานเลย — เรียกเฉพาะตอนเปิดหน้าใหม่ที่ยังไม่มี token ใน sessionStorage
 * ผลคือพอ token หมดอายุ คำขอถัดไปได้ 401 แล้วผู้ใช้ถูกเด้งออกทันที
 * ทั้งที่ session ฝั่งเซิร์ฟเวอร์ยังใช้ได้อีกหลายวัน
 *
 * บนเครื่องพัฒนามองไม่เห็นปัญหานี้ เพราะ ACCESS_TOKEN_EXPIRES_IN ตั้งไว้ 8 ชั่วโมง
 * ยาวกว่ารอบการทดสอบ
 *
 * single-flight: ถ้าหลายคำขอเจอ 401 พร้อมกัน (หน้าเดียวยิงหลาย endpoint)
 * ทุกตัวต้องรอ refresh รอบเดียวกัน ไม่ใช่ต่างคนต่างยิง เพราะการ refresh
 * หมุน Refresh Token ใหม่ทุกครั้ง — ยิงซ้อนกันจะทำให้ตัวที่มาทีหลังใช้ token
 * ที่ถูกหมุนทิ้งไปแล้ว แล้วเซิร์ฟเวอร์จะเพิกถอน session ทั้งใบทิ้ง
 */
let refreshInFlight: Promise<boolean> | null = null;

async function performTokenRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: { accessToken?: string };
    } | null;

    const token = payload?.data?.accessToken;

    if (!token) {
      return false;
    }

    setAccessToken(token);
    return true;
  } catch {
    // เน็ตหลุดหรือ refresh token หมดอายุ — ให้ผู้เรียกไปทาง logout ตามเดิม
    return false;
  }
}

function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performTokenRefresh().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

/**
 * คำขอนี้ควรลองต่ออายุ token แล้วยิงซ้ำไหม
 *
 * ต้องกัน /auth/refresh ตัวเองไว้ ไม่งั้นถ้ามันตอบ 401 จะวนเรียกตัวเองไม่จบ
 * ส่วน /auth/login กับ /auth/2fa/verify เรียกด้วย auth:false อยู่แล้ว
 * จึงถูกกันด้วยเงื่อนไข options.auth
 */
function shouldAttemptRefresh(path: string, options: ApiFetchOptions) {
  return options.auth !== false && !path.startsWith("/auth/refresh");
}

function createHeaders(options: ApiFetchOptions) {
  const token = getAccessToken();
  const headers = new Headers(options.headers);

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

async function requestApi<T>(
  path: string,
  options: ApiFetchOptions = {},
  /** ยิงซ้ำหลังต่ออายุ token แล้ว — กันไม่ให้วนซ้ำเกินหนึ่งรอบ */
  isRetry = false,
): Promise<ApiSuccessResponse<T>> {
  const headers = createHeaders(options);
  const { timeoutMs, ...init } = options;
  const limit = timeoutMs ?? DEFAULT_API_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
      /*
       * ถ้าผู้เรียกส่ง signal มาเองให้ใช้อันนั้น ไม่งั้นใช้ตัวจับเวลาของเรา
       * เพื่อกันหน้าจอค้างรอคำตอบที่ไม่มีวันมา
       */
      signal: init.signal ?? (limit > 0 ? AbortSignal.timeout(limit) : undefined),
    });
  } catch (error) {
    const aborted =
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new ApiClientError({
      message: aborted
        ? "เซิร์ฟเวอร์ไม่ตอบสนองภายในเวลาที่กำหนด กรุณาลองใหม่อีกครั้ง"
        : "ไม่สามารถเชื่อมต่อ API ได้",
      code: aborted ? "API_TIMEOUT" : "API_UNREACHABLE",
      status: 0,
    });
  }

  /*
   * 401 = Access Token หมดอายุหรือถูกเพิกถอน
   * ลองต่ออายุด้วย Refresh Token ก่อนหนึ่งครั้ง แล้วยิงคำขอเดิมซ้ำ
   * ทำตรงนี้ก่อนอ่าน body เพราะรอบใหม่จะได้ response ของตัวเองอยู่แล้ว
   * ถ้าต่ออายุไม่สำเร็จ ปล่อยให้ไหลลงไปทาง forceLogout ตามเดิม
   */
  if (
    response.status === 401 &&
    !isRetry &&
    shouldAttemptRefresh(path, options)
  ) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      return requestApi<T>(path, options, true);
    }
  }

  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null;

  if (!payload) {
    throw new ApiClientError({
      message: "ไม่สามารถเชื่อมต่อ API ได้",
      code: "API_ERROR",
      status: response.status,
    });
  }

  if (payload.success === false) {
    if (response.status === 401 && options.auth !== false) {
      forceLogoutClient(payload.error.code || "UNAUTHORIZED");
    }

    throw new ApiClientError({
      message: payload.error.message,
      code: payload.error.code,
      status: response.status,
      requestId: payload.requestId,
      details: payload.error.details,
    });
  }

  if (!response.ok) {
    /*
     * แยก 403 ออกจาก "เชื่อมต่อไม่ได้"
     *
     * เซิร์ฟเวอร์ตอบกลับมาแล้ว แค่ปฏิเสธเพราะสิทธิ์ไม่พอ
     * ถ้าเหมารวมเป็น API_ERROR ผู้ใช้จะเห็นว่า "เชื่อมต่อไม่ได้"
     * ทั้งที่ปัญหาคือสิทธิ์ แล้วไปแจ้งทีมว่าเซิร์ฟเวอร์ล่ม
     */
    if (response.status === 403) {
      throw new ApiClientError({
        message:
          "คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ หากต้องใช้งานให้ติดต่อผู้ดูแลระบบ",
        code: "FORBIDDEN",
        status: 403,
        requestId: payload.requestId,
      });
    }

    throw new ApiClientError({
      message: "ไม่สามารถเชื่อมต่อ API ได้",
      code: "API_ERROR",
      status: response.status,
      requestId: payload.requestId,
    });
  }

  if (isAttendanceWorkflowMutation(path, options.method)) {
    notifyAttendanceWorkflowChanged({
      path,
      method: String(options.method ?? "GET").toUpperCase(),
      source: "api",
    });
  }

  return payload;
}

function buildQueryString(params?: object) {
  if (!params) {
    return "";
  }

  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const payload = await requestApi<T>(path, options);
  return payload.data;
}

export async function apiFetchWithMeta<T, M = unknown, S = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<{
  data: T;
  meta?: M;
  summary?: S;
  requestId?: string;
}> {
  const payload = await requestApi<T>(path, options);
  const payloadWithSummary = payload as typeof payload & { summary?: S };

  return {
    data: payload.data,
    meta: payload.meta as M | undefined,
    summary: payloadWithSummary.summary,
    requestId: payload.requestId,
  };
}

export async function apiFetchBlob(
  path: string,
  options: ApiFetchOptions = {},
  /** ยิงซ้ำหลังต่ออายุ token แล้ว — กันไม่ให้วนซ้ำเกินหนึ่งรอบ */
  isRetry = false,
): Promise<Blob> {
  const headers = createHeaders(options);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  /*
   * ต้องต่ออายุ token ตรงนี้ด้วย ไม่ใช่แค่ใน requestApi
   * การดาวน์โหลดสลิปเงินเดือนและรายงานไม่ได้ผ่าน requestApi
   * ถ้าไม่ทำ ผู้ใช้จะกดดาวน์โหลดแล้วถูกเด้งออกทั้งที่หน้าอื่นยังใช้ได้
   */
  if (
    response.status === 401 &&
    !isRetry &&
    shouldAttemptRefresh(path, options)
  ) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      return apiFetchBlob(path, options, true);
    }
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiResponse<unknown> | null;

    if (payload?.success === false) {
      throw new ApiClientError({
        message: payload.error.message,
        code: payload.error.code,
        status: response.status,
        requestId: payload.requestId,
        details: payload.error.details,
      });
    }

    throw new ApiClientError({
      message: "ไม่สามารถดาวน์โหลดไฟล์ได้",
      code: "API_ERROR",
      status: response.status,
    });
  }

  if (contentType.includes("application/json")) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiResponse<unknown> | null;

    if (payload?.success === false) {
      if (response.status === 401 && options.auth !== false) {
        forceLogoutClient(payload.error.code || "UNAUTHORIZED");
      }

      throw new ApiClientError({
        message: payload.error.message,
        code: payload.error.code,
        status: response.status,
        requestId: payload.requestId,
        details: payload.error.details,
      });
    }

    throw new ApiClientError({
      message:
        "API ส่งข้อมูลกลับมาเป็น JSON ไม่ใช่ไฟล์จริง กรุณาตรวจสอบ Download API",
      code: "INVALID_FILE_RESPONSE",
      status: response.status,
      requestId: payload?.requestId,
    });
  }

  return response.blob();
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

/* =========================================================
   AUDIT & MONITORING API
   ---------------------------------------------------------
   ใช้กับหน้า Audit / Monitoring / Security
   - Audit Log
   - Audit Summary
   - Health / Readiness / Metrics
========================================================= */

export async function getAuditLogs(
  params?: AuditLogListParams,
): Promise<AuditLogListResponse> {
  const result = await apiFetchWithMeta<
    AuditLogItem[],
    AuditLogListResponse["meta"]
  >(`/audit/logs${buildQueryString(params)}`);

  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
  };
}

export async function getAuditSummary(days = 7) {
  return apiFetch<AuditSummary>(`/audit/summary${buildQueryString({ days })}`);
}

export async function getAuditCriticalActions(days = 7, limit = 20) {
  return apiFetch<AuditCriticalActions>(
    `/audit/critical-actions${buildQueryString({ days, limit })}`,
  );
}

export async function getMonitoringHealth() {
  return apiFetch<MonitoringHealth>("/monitoring/health", {
    auth: false,
  });
}

export async function getMonitoringReadiness() {
  return apiFetch<MonitoringReadiness>("/monitoring/readiness", {
    auth: false,
  });
}

export async function getMonitoringMetrics() {
  return apiFetch<MonitoringMetrics>("/monitoring/metrics");
}

export async function getMonitoringOverview() {
  return apiFetch<MonitoringOverview>("/monitoring/overview");
}

/* =========================================================
   AUTH API
   ---------------------------------------------------------
   ใช้กับระบบ session ของผู้ใช้งาน
   - ดู session ปัจจุบัน
   - revoke session รายตัว
   - revoke session อื่นทั้งหมด
========================================================= */

const emptyAuthSessionSummary: AuthSessionListSummary = {
  total: 0,
  active: 0,
  inactive: 0,
  revoked: 0,
  expired: 0,
};

export async function getMyAuthSessions(): Promise<AuthSessionListResponse> {
  const result = await apiFetchWithMeta<AuthSession[], unknown, AuthSessionListSummary>(
    "/auth/sessions",
  );

  return {
    data: result.data,
    summary: result.summary ?? emptyAuthSessionSummary,
  };
}

export async function revokeAuthSession(sessionId: string) {
  return apiFetch<RevokeSessionResponse>(
    `/auth/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function revokeOtherAuthSessions() {
  return apiFetch<RevokeSessionResponse>("/auth/sessions/revoke-others", {
    method: "POST",
  });
}

/* =========================================================
   MANAGER SCOPED API
   ---------------------------------------------------------
   ใช้สำหรับหน้าหัวหน้างานเท่านั้น
   Backend จะ scope ข้อมูลจาก current user เอง ห้ามส่ง managerId จาก frontend
========================================================= */

export async function getManagerDashboard() {
  return apiFetch<ManagerDashboardResponse>("/manager/dashboard");
}

export async function getManagerTeamSummary(
  params: ManagerTeamSummaryParams = {},
) {
  return apiFetch<ManagerTeamSummaryResponse>(
    `/manager/team/summary${buildQueryString(params)}`,
  );
}

export async function getManagerTeamCalendar(params: { month?: string } = {}) {
  return apiFetch<ManagerTeamCalendarResponse>(
    `/manager/team/calendar${buildQueryString(params)}`,
  );
}

export async function getManagerTeam(params: ManagerTeamListParams = {}) {
  return apiFetch<ManagerTeamListResponse>(
    `/manager/team${buildQueryString(params)}`,
  );
}

export async function getManagerAttendance(
  params: ManagerAttendanceListParams = {},
) {
  return apiFetch<ManagerAttendanceListResponse>(
    `/manager/attendance${buildQueryString(params)}`,
  );
}

export async function getManagerLeaves(params: ManagerLeaveListParams = {}) {
  return apiFetch<ManagerLeaveListResponse>(
    `/manager/leaves${buildQueryString(params)}`,
  );
}

export async function getManagerOvertime(
  params: ManagerOvertimeListParams = {},
) {
  return apiFetch<ManagerOvertimeListResponse>(
    `/manager/overtime${buildQueryString(params)}`,
  );
}

export async function getManagerOffsite(
  params: ManagerOffsiteListParams = {},
) {
  return apiFetch<ManagerOffsiteListResponse>(
    `/manager/offsite${buildQueryString(params)}`,
  );
}

export async function getManagerTimeAdjust(
  params: ManagerTimeAdjustListParams = {},
) {
  return apiFetch<ManagerTimeAdjustListResponse>(
    `/manager/time-adjust${buildQueryString(params)}`,
  );
}

/* =========================================================
   ATTENDANCE API
   ---------------------------------------------------------
   ใช้กับระบบลงเวลา
   - Attendance Logs
   - Check In / Check Out
   - Manual Log
   - Attendance Location
   - Attendance Device
========================================================= */

export async function getAttendanceLogs(query: AttendanceLogListQuery = {}) {
  const queryString = buildQueryString({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    employeeId: query.employeeId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    logType: query.logType,
    channel: query.channel,
    status: query.status,
  });

  return apiFetch<AttendanceLogListResponse>(`/attendance/logs${queryString}`);
}

export async function getAttendanceLog(id: string) {
  return apiFetch<AttendanceLog>(`/attendance/logs/${id}`);
}

export async function getMyAttendanceToday() {
  return apiFetch<AttendanceMyToday>("/attendance/my/today");
}

export async function getAttendancePunchContext(
  params: AttendancePunchContextParams = {},
) {
  const queryString = buildQueryString({
    punchedAt: params.punchedAt,
    punchType: params.punchType,
  });

  return apiFetch<AttendancePunchContext>(
    `/attendance/punch/context${queryString}`,
  );
}

export async function checkInAttendance(payload: CheckAttendanceForm) {
  return apiFetch<AttendanceLog>("/attendance/check-in", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function checkOutAttendance(payload: CheckAttendanceForm) {
  return apiFetch<AttendanceLog>("/attendance/check-out", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function punchAttendance(payload: PunchAttendanceForm) {
  return apiFetch<AttendanceLog>("/attendance/punch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createManualAttendanceLog(
  payload: AttendanceManualLogForm,
) {
  return apiFetch<AttendanceLog>("/attendance/logs/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAttendanceLog(
  id: string,
  payload: AttendanceUpdateLogForm,
) {
  return apiFetch<AttendanceLog>(`/attendance/logs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function cancelAttendanceLog(
  id: string,
  payload: CancelAttendanceLogForm,
) {
  return apiFetch<AttendanceLog>(`/attendance/logs/${id}/cancel`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAttendanceDailySummaries(
  params?: AttendanceDailySummaryListParams,
) {
  return apiFetch<AttendanceDailySummaryListResponse>(
    `/attendance/daily-summaries${buildQueryString(params)}`,
  );
}

export async function getAttendanceMonthlyReview(
  params: AttendanceMonthlyReviewListParams,
) {
  return apiFetch<AttendanceMonthlyReviewListResponse>(
    `/attendance/daily-summaries/monthly-review${buildQueryString(params)}`,
  );
}

export async function getAttendanceMonthlyReviewDetail(
  employeeId: string,
  params: AttendanceMonthlyReviewDetailParams,
) {
  return apiFetch<AttendanceMonthlyReviewDetailResponse>(
    `/attendance/daily-summaries/monthly-review/${employeeId}/details${buildQueryString(params)}`,
  );
}

export async function markAttendanceMonthlyReviewReadyForPayroll(
  payload: AttendanceMonthlyReviewActionPayload,
) {
  return apiFetch<AttendanceMonthlyReviewActionResponse>(
    "/attendance/daily-summaries/monthly-ready-for-payroll",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function lockAttendanceMonthlyReview(
  payload: AttendanceMonthlyReviewActionPayload,
) {
  return apiFetch<AttendanceMonthlyReviewActionResponse>(
    "/attendance/daily-summaries/monthly-lock",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function markAttendanceMonthlyReviewReadyForPayrollByPeriod(
  payload: AttendanceMonthlyReviewPeriodActionPayload,
) {
  return apiFetch<AttendanceMonthlyReviewActionResponse>(
    "/attendance/daily-summaries/monthly-ready-for-payroll/by-period",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function lockAttendanceMonthlyReviewByPeriod(
  payload: AttendanceMonthlyReviewPeriodActionPayload,
) {
  return apiFetch<AttendanceMonthlyReviewActionResponse>(
    "/attendance/daily-summaries/monthly-lock/by-period",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getMyAttendanceDailySummaries(
  params?: AttendanceDailySummaryListParams,
) {
  return apiFetch<AttendanceDailySummaryListResponse>(
    `/attendance/daily-summaries/my${buildQueryString(params)}`,
  );
}

export async function getTeamAttendanceDailySummaries(
  params?: AttendanceDailySummaryListParams,
) {
  return apiFetch<AttendanceDailySummaryListResponse>(
    `/attendance/daily-summaries/team${buildQueryString(params)}`,
  );
}

export async function getAttendanceRecalculationProgress(
  progressId: string,
) {
  return apiFetch<AttendanceRecalculationProgressResponse>(
    `/attendance/daily-summaries/recalculate/progress/${encodeURIComponent(progressId)}`,
  );
}

/** ขอหยุดการคำนวณ — ระบบจะหยุดที่ขอบของกลุ่มถัดไป ไม่ตัดกลางรายการ */
export async function cancelAttendanceRecalculation(progressId: string) {
  return apiFetch<AttendanceRecalculationProgressResponse>(
    `/attendance/daily-summaries/recalculate/progress/${encodeURIComponent(progressId)}/cancel`,
    { method: "POST" },
  );
}

export async function recalculateAttendanceDailySummaries(
  payload: RecalculateAttendanceDailySummariesForm,
) {
  return apiFetch<RecalculateAttendanceDailySummariesResponse>(
    "/attendance/daily-summaries/recalculate",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function markAttendanceDailySummaryReviewed(
  id: string,
  payload: AttendanceDailyReviewActionPayload = {},
) {
  return apiFetch<AttendanceDailySummary>(
    `/attendance/daily-summaries/${id}/review`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function cancelAttendanceDailySummaryReviewed(
  id: string,
  payload: AttendanceDailyReviewActionPayload = {},
) {
  return apiFetch<AttendanceDailySummary>(
    `/attendance/daily-summaries/${id}/unreview`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/**
 * ปุ่ม "ไม่หัก / หักตามเดิม" ค่าปรับลืมสแกนของวันนั้น
 * ยกเว้นเฉพาะค่าปรับลืมสแกน ไม่กระทบมาสาย/กลับก่อน/ขาดงาน
 */
export async function setAttendanceMissingLogPenaltyWaiver(
  id: string,
  payload: { waived: boolean; reason?: string },
) {
  return apiFetch<AttendanceDailySummary>(
    `/attendance/daily-summaries/${id}/missing-log-penalty-waiver`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function markAttendanceDailySummaryReadyForPayroll(
  id: string,
  payload: AttendanceDailyReviewActionPayload = {},
) {
  return apiFetch<AttendanceDailySummary>(
    `/attendance/daily-summaries/${id}/ready-for-payroll`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function lockAttendanceDailySummary(
  id: string,
  payload: AttendanceDailyReviewActionPayload = {},
) {
  return apiFetch<AttendanceDailySummary>(
    `/attendance/daily-summaries/${id}/lock`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function bulkMarkAttendanceDailySummariesReadyForPayroll(
  payload: BulkAttendanceDailyReviewActionPayload,
) {
  return apiFetch<BulkAttendanceDailyReviewActionResponse>(
    "/attendance/daily-summaries/bulk-ready-for-payroll",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function bulkLockAttendanceDailySummaries(
  payload: BulkAttendanceDailyReviewActionPayload,
) {
  return apiFetch<BulkAttendanceDailyReviewActionResponse>(
    "/attendance/daily-summaries/bulk-lock",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getAttendanceLocations() {
  return apiFetch<AttendanceLocation[]>("/attendance/locations");
}

export async function getAttendanceLocation(id: string) {
  return apiFetch<AttendanceLocation>(`/attendance/locations/${id}`);
}

export async function getAttendancePolicies(
  params?: AttendancePolicyListParams,
) {
  return apiFetch<AttendancePolicyListResponse>(
    `/attendance/policies${buildQueryString(params)}`,
  );
}

export async function getEmployeeShiftAssignments(params?: {
  companyId?: string;
  branchId?: string;
  search?: string;
  assignment?: "ALL" | "ASSIGNED" | "UNASSIGNED";
}) {
  return apiFetch<EmployeeShiftAssignmentListResponse>(
    `/attendance/policies/shift-assignments${buildQueryString(params)}`,
  );
}

export async function assignEmployeesToShift(
  policyId: string,
  payload: AssignEmployeeShiftForm,
) {
  return apiFetch<{ policyId: string; assigned: number }>(
    `/attendance/policies/${policyId}/assign-employees`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/**
 * ตั้งการยกเว้นการลงเวลาให้พนักงานหลายคนพร้อมกัน
 *
 * ส่งเฉพาะฟิลด์ที่ต้องการเปลี่ยน ฟิลด์ที่ไม่ส่งจะคงค่าเดิม
 * จึงติ๊กทีละเรื่องได้โดยไม่เผลอล้างอีกเรื่องทิ้ง
 */
export async function updateAttendanceExemptions(
  payload: UpdateAttendanceExemptionForm,
) {
  return apiFetch<{ updated: number }>(
    "/attendance/policies/employee-exemptions",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function removeEmployeesFromShift(
  policyId: string,
  payload: AssignEmployeeShiftForm,
) {
  return apiFetch<{ policyId: string; removed: number }>(
    `/attendance/policies/${policyId}/remove-employees`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function getEffectiveAttendancePolicy(params: {
  companyId: string;
  branchId?: string | null;
  date?: string;
}) {
  return apiFetch<AttendancePolicy>(
    `/attendance/policies/effective${buildQueryString(params)}`,
  );
}

export async function createAttendancePolicy(payload: AttendancePolicyForm) {
  return apiFetch<AttendancePolicy>("/attendance/policies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAttendancePolicy(
  id: string,
  payload: AttendancePolicyUpdateForm,
) {
  return apiFetch<AttendancePolicy>(`/attendance/policies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAttendancePolicy(id: string) {
  return apiFetch<{ id: string; deleted?: boolean }>(
    `/attendance/policies/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getAttendanceSessionRules(
  policyId: string,
  params?: AttendanceSessionRuleListParams,
) {
  return apiFetch<AttendanceSessionRule[]>(
    `/attendance/policies/${policyId}/session-rules${buildQueryString(params)}`,
  );
}

export async function createAttendanceSessionRule(
  policyId: string,
  payload: AttendanceSessionRuleForm,
) {
  return apiFetch<AttendanceSessionRule>(
    `/attendance/policies/${policyId}/session-rules`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateAttendanceSessionRule(
  id: string,
  payload: AttendanceSessionRuleUpdateForm,
) {
  return apiFetch<AttendanceSessionRule>(`/attendance/session-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAttendanceSessionRule(id: string) {
  return apiFetch<{ id: string; deleted?: boolean }>(
    `/attendance/session-rules/${id}`,
    { method: "DELETE" },
  );
}

export async function reorderAttendanceSessionRules(
  policyId: string,
  payload: ReorderAttendanceSessionRulesForm,
) {
  return apiFetch<AttendanceSessionRule[]>(
    `/attendance/policies/${policyId}/session-rules/reorder`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function createAttendanceLocation(
  payload: AttendanceLocationForm,
) {
  return apiFetch<AttendanceLocation>("/attendance/locations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAttendanceLocation(
  id: string,
  payload: AttendanceLocationUpdateForm,
) {
  return apiFetch<AttendanceLocation>(`/attendance/locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAttendanceLocation(id: string) {
  return apiFetch<AttendanceLocation>(`/attendance/locations/${id}`, {
    method: "DELETE",
  });
}

export async function getAttendanceDevices() {
  return apiFetch<AttendanceDevice[]>("/attendance/devices");
}

export async function getAttendanceDevice(id: string) {
  return apiFetch<AttendanceDevice>(`/attendance/devices/${id}`);
}

export async function createAttendanceDevice(payload: AttendanceDeviceForm) {
  return apiFetch<AttendanceDevice>("/attendance/devices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAttendanceDevice(
  id: string,
  payload: AttendanceDeviceUpdateForm,
) {
  return apiFetch<AttendanceDevice>(`/attendance/devices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAttendanceDevice(id: string) {
  return apiFetch<AttendanceDevice>(`/attendance/devices/${id}`, {
    method: "DELETE",
  });
}

/* ---------------------------------------------------------
   ผูกพนักงานกับรหัสผู้ใช้ในเครื่องสแกน
--------------------------------------------------------- */

export async function getAttendanceDeviceEnrollments(deviceId: string) {
  return apiFetch<AttendanceDeviceEnrollment[]>(
    `/attendance/devices/${deviceId}/enrollments`,
  );
}

export async function createAttendanceDeviceEnrollment(
  deviceId: string,
  payload: AttendanceDeviceEnrollmentForm,
) {
  return apiFetch<AttendanceDeviceEnrollment>(
    `/attendance/devices/${deviceId}/enrollments`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function updateAttendanceDeviceEnrollment(
  deviceId: string,
  enrollmentId: string,
  payload: AttendanceDeviceEnrollmentUpdateForm,
) {
  return apiFetch<AttendanceDeviceEnrollment>(
    `/attendance/devices/${deviceId}/enrollments/${enrollmentId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export async function deleteAttendanceDeviceEnrollment(
  deviceId: string,
  enrollmentId: string,
) {
  return apiFetch<AttendanceDeviceEnrollment>(
    `/attendance/devices/${deviceId}/enrollments/${enrollmentId}`,
    { method: "DELETE" },
  );
}

/** ประวัติการสแกนดิบของเครื่อง (ทุกครั้งที่ยิงเข้ามา รวมที่ไม่แมป/ซ้ำ) */
export async function getAttendanceDeviceScanLogs(
  deviceId: string,
  params?: AttendanceScanLogListParams,
) {
  return apiFetch<AttendanceScanLogListResponse>(
    `/attendance/devices/${deviceId}/scan-logs${buildQueryString(params)}`,
  );
}

/* ------------------------------------------------------------------ */
/* platform - ข้อมูลรายบริษัท                                          */
/* ------------------------------------------------------------------ */

/** รายชื่อชุดข้อมูลที่หน้าดูแลข้อมูลรายบริษัทรองรับ */
export async function getCompanyDataDatasets() {
  return apiFetch<CompanyDatasetsResponse>("/platform/company-data/datasets");
}

/** จำนวนข้อมูลแต่ละชุดของบริษัทที่เลือก */
export async function getCompanyDataSummary(companyId: string) {
  return apiFetch<CompanyDataSummaryResponse>(
    `/platform/company-data/summary${buildQueryString({ companyId })}`,
  );
}

export async function getCompanyDataItems(params: CompanyDataListParams) {
  return apiFetch<CompanyDataListResponse>(
    `/platform/company-data/items${buildQueryString(params)}`,
  );
}

/** ลบรายการที่เลือก (ลงถังขยะถ้าตารางรองรับ) */
export async function deleteCompanyDataItems(input: {
  companyId: string;
  dataset: string;
  ids: string[];
}) {
  return apiFetch<CompanyDataDeleteResult>("/platform/company-data/delete", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** ลบทั้งชุดตามช่วงวันที่ ต้องพิมพ์ชื่อบริษัทยืนยัน */
export async function purgeCompanyData(input: {
  companyId: string;
  dataset: string;
  confirmName: string;
  from?: string;
  to?: string;
}) {
  return apiFetch<CompanyDataPurgeResult>("/platform/company-data/purge", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * ส่งทะเบียนพนักงานลงเครื่องสแกน
 * ไม่ส่ง employeeIds = ทั้งสาขาที่เครื่องสังกัด
 */
export async function pushAttendanceDeviceEmployees(
  deviceId: string,
  employeeIds?: string[],
) {
  return apiFetch<PushDeviceEmployeesResult>(
    `/attendance/devices/${deviceId}/push-employees`,
    { method: "POST", body: JSON.stringify({ employeeIds }) },
  );
}

/** สถานะคำสั่งที่ส่งลงเครื่อง (รอเครื่องมารับ/ส่งแล้ว/สำเร็จ/ล้มเหลว) */
export async function getAttendanceDeviceCommands(deviceId: string) {
  return apiFetch<AttendanceDeviceCommandListResponse>(
    `/attendance/devices/${deviceId}/commands`,
  );
}

/** สรุปการสแกนของเครื่องเป็นรายคน (ยุบรายการดิบให้เหลือบรรทัดละคน) */
export async function getAttendanceDeviceScanLogPeople(deviceId: string) {
  return apiFetch<AttendanceScanLogPeopleResponse>(
    `/attendance/devices/${deviceId}/scan-logs/people`,
  );
}

/** ส่งรายการสแกนจากเครื่องเข้าระบบ (ใช้ทดสอบ/นำเข้าย้อนหลังได้ด้วย) */
export async function ingestAttendanceDevicePunches(
  deviceId: string,
  punches: AttendanceDevicePunchInput[],
) {
  return apiFetch<AttendanceDevicePunchResult>(
    `/attendance/devices/${deviceId}/punches`,
    { method: "POST", body: JSON.stringify({ punches }) },
  );
}

/* =========================================================
   OFFSITE WORK API
   ---------------------------------------------------------
   ใช้กับ Phase 6: ทำงานนอกสถานที่ / WFH / Site Work
========================================================= */

export async function getOffsiteWorkRequests(
  params: OffsiteWorkRequestListParams = {},
) {
  return apiFetch<OffsiteWorkRequestListResponse>(
    `/offsite-work/requests${buildQueryString(params)}`,
  );
}

export async function getMyOffsiteWorkRequests(
  params: OffsiteWorkRequestListParams = {},
) {
  return apiFetch<OffsiteWorkRequestListResponse>(
    `/offsite-work/requests/my${buildQueryString(params)}`,
  );
}

export async function getMyApprovedOffsiteWorkRequests(workDate?: string) {
  return apiFetch<OffsiteWorkRequest[]>(
    `/offsite-work/requests/my/approved${buildQueryString({ workDate })}`,
  );
}

export async function getPendingOffsiteWorkApprovals(
  params: OffsiteWorkRequestListParams = {},
) {
  return apiFetch<OffsiteWorkRequestListResponse>(
    `/offsite-work/requests/approvals/pending${buildQueryString(params)}`,
  );
}

export async function getOffsiteWorkRequest(id: string) {
  return apiFetch<OffsiteWorkRequest>(`/offsite-work/requests/${id}`);
}

export async function createOffsiteWorkRequest(
  payload: CreateOffsiteWorkRequestForm,
) {
  return apiFetch<OffsiteWorkRequest>("/offsite-work/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOffsiteWorkRequest(
  id: string,
  payload: UpdateOffsiteWorkRequestForm,
) {
  return apiFetch<OffsiteWorkRequest>(`/offsite-work/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitOffsiteWorkRequest(id: string) {
  return apiFetch<OffsiteWorkRequest>(`/offsite-work/requests/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function approveOffsiteWorkRequest(
  id: string,
  payload: OffsiteWorkActionForm = {},
) {
  return apiFetch<OffsiteWorkRequest>(`/offsite-work/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectOffsiteWorkRequest(
  id: string,
  payload: OffsiteWorkActionForm = {},
) {
  return apiFetch<OffsiteWorkRequest>(`/offsite-work/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelOffsiteWorkRequest(
  id: string,
  payload: OffsiteWorkActionForm = {},
) {
  return apiFetch<OffsiteWorkRequest>(`/offsite-work/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelMyOffsiteWorkRequest(
  id: string,
  payload: OffsiteWorkActionForm = {},
) {
  return apiFetch<OffsiteWorkRequest>(
    `/offsite-work/requests/my/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function verifyOffsiteLocation(
  payload: VerifyOffsiteLocationForm,
) {
  return apiFetch<VerifyOffsiteLocationResponse>(
    "/offsite-work/verify-location",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/* =========================================================
   LEAVE API
   ---------------------------------------------------------
   ใช้กับระบบลา
   - Leave Type
   - Leave Policy
   - Leave Request
   - Leave Balance
========================================================= */

export async function getLeaveTypes(params?: LeaveTypeListParams) {
  return apiFetch<LeaveType[]>(`/leaves/types${buildQueryString(params)}`);
}

/* --- ประเภทการลามาตรฐานระดับระบบ + การเปิด/ปิดใช้ต่อบริษัท --- */

export async function getLeaveCatalog(params?: {
  companyId?: string;
  search?: string;
  enabledOnly?: "true" | "false";
}) {
  return apiFetch<LeaveCatalogListResponse>(
    `/leaves/catalog${buildQueryString(params)}`,
  );
}

export async function enableLeaveCatalogItem(
  catalogId: string,
  companyId?: string,
) {
  return apiFetch<LeaveType>(`/leaves/catalog/${catalogId}/enable`, {
    method: "POST",
    body: JSON.stringify({ companyId }),
  });
}

export async function disableLeaveCatalogItem(
  catalogId: string,
  companyId?: string,
) {
  return apiFetch<{ id: string; enabled: boolean }>(
    `/leaves/catalog/${catalogId}/disable`,
    {
      method: "POST",
      body: JSON.stringify({ companyId }),
    },
  );
}

export async function getLeaveTypeMatrix(
  leaveTypeId: string,
  branchId?: string | null,
) {
  return apiFetch<LeaveTypeMatrixResponse>(
    `/leaves/catalog/types/${leaveTypeId}/matrix${buildQueryString({
      branchId: branchId ?? undefined,
    })}`,
  );
}

export async function saveLeaveTypeMatrix(
  leaveTypeId: string,
  payload: SaveLeaveTypeMatrixForm,
) {
  return apiFetch<LeaveType>(`/leaves/catalog/types/${leaveTypeId}/matrix`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function copyLeavePolicies(payload: CopyLeavePolicyForm) {
  return apiFetch<CopyLeavePolicyResult>("/leaves/catalog/copy", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getLeaveTypesSummary(params?: LeaveTypeListParams) {
  return apiFetch<LeaveTypeListSummary>(
    `/leaves/types/summary${buildQueryString(params)}`,
  );
}

export async function getEssLeaveTypes(params?: LeaveTypeListParams) {
  return apiFetch<LeaveType[]>(
    `/leaves/types/requestable${buildQueryString(params)}`,
  );
}

export async function getLeaveType(id: string) {
  return apiFetch<LeaveType>(`/leaves/types/${id}`);
}

export async function createLeaveType(payload: CreateLeaveTypeForm) {
  return apiFetch<LeaveType>("/leaves/types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateLeaveType(
  id: string,
  payload: UpdateLeaveTypeForm,
) {
  return apiFetch<LeaveType>(`/leaves/types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteLeaveType(id: string) {
  return apiFetch<{ id: string; deleted: boolean; mode: string }>(
    `/leaves/types/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getLeavePolicies(params?: LeavePolicyListParams) {
  return apiFetch<LeavePolicy[]>(`/leaves/policies${buildQueryString(params)}`);
}

export async function getLeavePoliciesSummary(params?: LeavePolicyListParams) {
  return apiFetch<LeavePolicyListSummary>(
    `/leaves/policies/summary${buildQueryString(params)}`,
  );
}

export async function getLeavePolicy(id: string) {
  return apiFetch<LeavePolicy>(`/leaves/policies/${id}`);
}

export async function createLeavePolicy(payload: CreateLeavePolicyForm) {
  return apiFetch<LeavePolicy>("/leaves/policies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateLeavePolicy(
  id: string,
  payload: UpdateLeavePolicyForm,
) {
  return apiFetch<LeavePolicy>(`/leaves/policies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteLeavePolicy(id: string) {
  return apiFetch<{ id: string; deleted: boolean; mode: string }>(
    `/leaves/policies/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getLeaveRequests(params?: LeaveRequestListParams) {
  return apiFetch<LeaveRequestListResponse>(
    `/leaves/requests${buildQueryString(params)}`,
  );
}

export async function getLeaveRequest(id: string) {
  return apiFetch<LeaveRequest>(`/leaves/requests/${id}`);
}

export async function createLeaveRequest(payload: CreateLeaveRequestForm) {
  return apiFetch<LeaveRequest>("/leaves/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateLeaveRequest(
  id: string,
  payload: UpdateLeaveRequestForm,
) {
  return apiFetch<LeaveRequest>(`/leaves/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitLeaveRequest(id: string) {
  return apiFetch<LeaveRequest>(`/leaves/requests/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function approveLeaveRequest(
  id: string,
  payload: LeaveRequestActionForm = {},
) {
  return apiFetch<LeaveRequest>(`/leaves/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectLeaveRequest(
  id: string,
  payload: LeaveRequestActionForm = {},
) {
  return apiFetch<LeaveRequest>(`/leaves/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelLeaveRequest(
  id: string,
  payload: LeaveRequestActionForm = {},
) {
  return apiFetch<LeaveRequest>(`/leaves/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteLeaveRequest(id: string) {
  return apiFetch<LeaveRequest>(`/leaves/requests/${id}`, {
    method: "DELETE",
  });
}

export async function getLeaveBalances(params?: LeaveBalanceListParams) {
  return apiFetch<LeaveBalanceListResponse>(
    `/leaves/balances${buildQueryString(params)}`,
  );
}

export async function getMyLeaveBalances(year?: number) {
  return apiFetch<MyLeaveBalanceResponse>(
    `/leaves/balances/my${buildQueryString({ year })}`,
  );
}

export async function getLeaveBalance(id: string) {
  return apiFetch<LeaveBalance>(`/leaves/balances/${id}`);
}

export async function generateLeaveBalances(
  payload: GenerateLeaveBalancesForm,
) {
  return apiFetch<LeaveBalance[]>("/leaves/balances/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateLeaveBalancesBulk(
  payload: GenerateLeaveBalancesBulkForm,
) {
  return apiFetch<GenerateLeaveBalancesBulkResult>(
    "/leaves/balances/generate-bulk",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateLeaveBalance(
  id: string,
  payload: UpdateLeaveBalanceForm,
) {
  return apiFetch<LeaveBalance>(`/leaves/balances/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/* =========================================================
   OVERTIME API
   ---------------------------------------------------------
   ใช้กับระบบขอทำงานล่วงเวลา
   - Overtime Policy
   - Overtime Request
   - Overtime Attachment
========================================================= */

export async function getOvertimePolicies(params?: OvertimePolicyListParams) {
  return apiFetch<OvertimePolicy[]>(
    `/overtime/policies${buildQueryString(params)}`,
  );
}

export async function getOvertimePoliciesSummary(params?: OvertimePolicyListParams) {
  return apiFetch<OvertimePolicyListSummary>(
    `/overtime/policies/summary${buildQueryString(params)}`,
  );
}

export async function getOvertimePolicy(id: string) {
  return apiFetch<OvertimePolicy>(`/overtime/policies/${id}`);
}

export async function createOvertimePolicy(payload: CreateOvertimePolicyForm) {
  return apiFetch<OvertimePolicy>("/overtime/policies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOvertimePolicy(
  id: string,
  payload: UpdateOvertimePolicyForm,
) {
  return apiFetch<OvertimePolicy>(`/overtime/policies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteOvertimePolicy(id: string) {
  return apiFetch<{ id: string; deleted: boolean; mode: string }>(
    `/overtime/policies/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getOvertimeMatrix(params: {
  companyId: string;
  branchId?: string | null;
  workType: OvertimeWorkType;
}) {
  return apiFetch<OvertimeMatrixResponse>(
    `/overtime/policies/matrix${buildQueryString({
      companyId: params.companyId,
      branchId: params.branchId ?? undefined,
      workType: params.workType,
    })}`,
  );
}

export async function saveOvertimeMatrix(payload: SaveOvertimeMatrixForm) {
  return apiFetch<OvertimeMatrixResponse>("/overtime/policies/matrix", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function setOvertimeMatrixStatus(
  payload: SetOvertimeMatrixStatusForm,
) {
  return apiFetch<OvertimeMatrixResponse>("/overtime/policies/matrix/status", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getOvertimeRequests(params?: OvertimeRequestListParams) {
  return apiFetch<OvertimeRequestListResponse>(
    `/overtime/requests${buildQueryString(params)}`,
  );
}

export async function getOvertimeRequest(id: string) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/${id}`);
}

export async function createOvertimeRequest(
  payload: CreateOvertimeRequestForm,
) {
  return apiFetch<OvertimeRequest>("/overtime/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOvertimeRequest(
  id: string,
  payload: UpdateOvertimeRequestForm,
) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitOvertimeRequest(id: string) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function approveOvertimeRequest(
  id: string,
  payload: OvertimeRequestActionForm = {},
) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectOvertimeRequest(
  id: string,
  payload: OvertimeRequestActionForm = {},
) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelOvertimeRequest(
  id: string,
  payload: OvertimeRequestActionForm = {},
) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteOvertimeRequest(id: string) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/${id}`, {
    method: "DELETE",
  });
}
export async function getOvertimeAttachments(overtimeRequestId: string) {
  return apiFetch<OvertimeAttachment[]>(
    `/overtime/requests/${overtimeRequestId}/attachments`,
  );
}

export async function uploadOvertimeAttachment(
  overtimeRequestId: string,
  payload: FormData,
) {
  return apiFetch<OvertimeAttachment>(
    `/overtime/requests/${overtimeRequestId}/attachments/upload`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function downloadOvertimeAttachment(
  overtimeRequestId: string,
  attachmentId: string,
) {
  return apiFetchBlob(
    `/overtime/requests/${overtimeRequestId}/attachments/${attachmentId}/download`,
  );
}

export async function deleteOvertimeAttachment(
  overtimeRequestId: string,
  attachmentId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/overtime/requests/${overtimeRequestId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  );
}
/* =========================================================
   TIME ADJUST API
   ---------------------------------------------------------
   ใช้กับระบบขอแก้ไขเวลา
   - Time Adjust Request
   - Time Adjust Attachment
   - Employee / Attendance Log options
========================================================= */

export async function getTimeAdjustRequests(
  params?: TimeAdjustRequestListParams,
) {
  return apiFetch<TimeAdjustRequestListResponse>(
    `/time-adjust/requests${buildQueryString(params)}`,
  );
}

export async function getTimeAdjustRequest(id: string) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/${id}`);
}

export async function createTimeAdjustRequest(
  payload: CreateTimeAdjustRequestForm,
) {
  return apiFetch<TimeAdjustRequest>("/time-adjust/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTimeAdjustRequest(
  id: string,
  payload: UpdateTimeAdjustRequestForm,
) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitTimeAdjustRequest(id: string) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function approveTimeAdjustRequest(
  id: string,
  payload: TimeAdjustRequestActionForm = {},
) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectTimeAdjustRequest(
  id: string,
  payload: TimeAdjustRequestActionForm = {},
) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelTimeAdjustRequest(
  id: string,
  payload: TimeAdjustRequestActionForm = {},
) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTimeAdjustAttachments(timeAdjustRequestId: string) {
  return apiFetch<TimeAdjustAttachment[]>(
    `/time-adjust/requests/${timeAdjustRequestId}/attachments`,
  );
}

export async function uploadTimeAdjustAttachment(
  timeAdjustRequestId: string,
  payload: FormData,
) {
  return apiFetch<TimeAdjustAttachment>(
    `/time-adjust/requests/${timeAdjustRequestId}/attachments/upload`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function downloadTimeAdjustAttachment(
  timeAdjustRequestId: string,
  attachmentId: string,
) {
  return apiFetchBlob(
    `/time-adjust/requests/${timeAdjustRequestId}/attachments/${attachmentId}/download`,
  );
}

export async function deleteTimeAdjustAttachment(
  timeAdjustRequestId: string,
  attachmentId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/time-adjust/requests/${timeAdjustRequestId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * รายชื่อพนักงาน "ทุกคน" สำหรับตัวเลือกที่ค้นหาฝั่งหน้าเว็บ
 *
 * ตัวเลือกพนักงานในกล่องผูกเครื่องสแกนกรองจากรายการที่โหลดไว้ก่อน ไม่ได้ยิง
 * ค้นหาไปที่เซิร์ฟเวอร์ — ถ้าโหลดมาแค่หน้าแรก คนที่อยู่ถัดจากคนที่ร้อยจะหา
 * ไม่เจอเลยทั้งที่มีอยู่ในระบบ (เจอครั้งแรกตอนพนักงานเกินร้อยคน 11 ก.ย. 2569)
 *
 * backend จำกัดหน้าละร้อย จึงไล่ดึงทีละหน้าจนครบตาม totalPages แทน
 */
export async function getTimeAdjustEmployees() {
  const pageSize = 100;
  const first = await apiFetch<TimeAdjustEmployeeListResponse>(
    `/employees?page=1&pageSize=${pageSize}`,
  );

  const totalPages = first.meta?.totalPages ?? 1;

  if (totalPages <= 1) {
    return first;
  }

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      apiFetch<TimeAdjustEmployeeListResponse>(
        `/employees?page=${index + 2}&pageSize=${pageSize}`,
      ),
    ),
  );

  return {
    items: [...first.items, ...rest.flatMap((page) => page.items)],
    meta: { ...first.meta, page: 1, pageSize: first.meta.total },
  };
}

export async function getTimeAdjustAttendanceLogs(
  params?: TimeAdjustAttendanceLogListParams,
) {
  return apiFetch<TimeAdjustAttendanceLogListResponse>(
    `/attendance/logs${buildQueryString(params)}`,
  );
}

/* =========================================================
   DOCUMENT WORKFLOW API
   ---------------------------------------------------------
   ใช้กับระบบเอกสารและคำร้อง
   - Document Type
   - Document Request
   - Document Template / Preset
   - Complaint
========================================================= */

export async function getDocumentTypes(params?: DocumentTypeListParams) {
  return apiFetch<DocumentTypeListResponse>(
    `/documents/types${buildQueryString(params)}`,
  );
}

export async function getEssDocumentTypes(params?: DocumentTypeListParams) {
  return apiFetch<DocumentTypeListResponse>(
    `/documents/ess/types${buildQueryString(params)}`,
  );
}

export async function getDocumentType(id: string) {
  return apiFetch<DocumentType>(`/documents/types/${id}`);
}

export async function getDocumentRequests(params?: DocumentRequestListParams) {
  return apiFetch<DocumentRequestListResponse>(
    `/documents/requests${buildQueryString(params)}`,
  );
}

export async function getEssDocumentRequests(params?: DocumentRequestListParams) {
  return apiFetch<DocumentRequestListResponse>(
    `/documents/ess/requests${buildQueryString(params)}`,
  );
}

export async function getDocumentRequest(id: string) {
  return apiFetch<DocumentRequest>(`/documents/requests/${id}`);
}

export async function createDocumentRequest(
  payload: CreateDocumentRequestForm,
) {
  return apiFetch<DocumentRequest>("/documents/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createEssDocumentRequest(
  payload: CreateDocumentRequestForm,
) {
  return apiFetch<DocumentRequest>("/documents/ess/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDocumentRequest(
  id: string,
  payload: UpdateDocumentRequestForm,
) {
  return apiFetch<DocumentRequest>(`/documents/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateEssDocumentRequest(
  id: string,
  payload: UpdateDocumentRequestForm,
) {
  return apiFetch<DocumentRequest>(`/documents/ess/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitDocumentRequest(id: string) {
  return apiFetch<DocumentRequest>(`/documents/requests/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function submitEssDocumentRequest(id: string) {
  return apiFetch<DocumentRequest>(`/documents/ess/requests/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function approveDocumentRequest(
  id: string,
  payload: DocumentRequestActionForm = {},
) {
  return apiFetch<DocumentRequest>(`/documents/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectDocumentRequest(
  id: string,
  payload: DocumentRequestActionForm = {},
) {
  return apiFetch<DocumentRequest>(`/documents/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelDocumentRequest(
  id: string,
  payload: DocumentRequestActionForm = {},
) {
  return apiFetch<DocumentRequest>(`/documents/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelEssDocumentRequest(
  id: string,
  payload: DocumentRequestActionForm = {},
) {
  return apiFetch<DocumentRequest>(`/documents/ess/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteDocumentRequest(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/documents/requests/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function deleteEssDocumentRequest(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/documents/ess/requests/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function uploadSignedDocumentFile(
  documentRequestId: string,
  payload: FormData,
) {
  return apiFetch<DocumentFile>(
    `/documents/requests/${documentRequestId}/files/signed`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function uploadEssDocumentFile(
  documentRequestId: string,
  payload: FormData,
) {
  return apiFetch<DocumentFile>(
    `/documents/ess/requests/${documentRequestId}/files/upload`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function deleteEssDocumentFile(
  documentRequestId: string,
  fileId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/documents/ess/requests/${documentRequestId}/files/${fileId}`,
    {
      method: "DELETE",
    },
  );
}

export async function uploadDocumentFile(
  documentRequestId: string,
  payload: FormData,
) {
  return apiFetch<DocumentFile>(
    `/documents/requests/${documentRequestId}/files/upload`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function downloadDocumentFile(
  documentRequestId: string,
  fileId: string,
) {
  return apiFetchBlob(
    `/documents/requests/${documentRequestId}/files/${fileId}/download`,
  );
}

export async function downloadEssDocumentFile(
  documentRequestId: string,
  fileId: string,
) {
  return apiFetchBlob(
    `/documents/ess/requests/${documentRequestId}/files/${fileId}/download`,
  );
}

export async function deleteDocumentFile(
  documentRequestId: string,
  fileId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/documents/requests/${documentRequestId}/files/${fileId}`,
    {
      method: "DELETE",
    },
  );
}

export async function renderDocumentRequest(
  documentRequestId: string,
  templateId?: string,
) {
  return apiFetch<RenderDocumentResponse>(
    `/documents/requests/${documentRequestId}/render${buildQueryString({
      templateId,
    })}`,
  );
}

export async function generateDocumentPdf(
  documentRequestId: string,
  payload: GenerateDocumentPdfForm = {},
) {
  return apiFetch<DocumentFile>(
    `/documents/requests/${documentRequestId}/generate-pdf`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getDocumentTemplates(
  params?: DocumentTemplateListParams,
) {
  return apiFetch<DocumentTemplateListResponse>(
    `/documents/templates${buildQueryString(params)}`,
  );
}

export async function getDocumentTemplate(id: string) {
  return apiFetch<DocumentTemplate>(`/documents/templates/${id}`);
}

export async function getDocumentPresets() {
  return apiFetch<DocumentPreset[]>("/documents/presets");
}

export async function createWorkCertificateRequest(
  payload: CreateWorkCertificateRequestForm,
) {
  return apiFetch<DocumentRequest>("/documents/presets/work-certificate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createSalaryCertificateRequest(
  payload: CreateSalaryCertificateRequestForm,
) {
  return apiFetch<DocumentRequest>("/documents/presets/salary-certificate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createVisaCertificateRequest(
  payload: CreateVisaCertificateRequestForm,
) {
  return apiFetch<DocumentRequest>("/documents/presets/visa-certificate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createResignDocumentRequest(
  payload: CreateResignDocumentRequestForm,
) {
  return apiFetch<DocumentRequest>("/documents/presets/resign-document", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getComplaints(params?: ComplaintListParams) {
  return apiFetch<ComplaintListResponse>(
    `/documents/complaints${buildQueryString(params)}`,
  );
}

export async function getComplaint(id: string) {
  return apiFetch<Complaint>(`/documents/complaints/${id}`);
}

export async function createComplaint(payload: CreateComplaintForm) {
  return apiFetch<Complaint>("/documents/complaints", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateComplaint(
  id: string,
  payload: UpdateComplaintForm,
) {
  return apiFetch<Complaint>(`/documents/complaints/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function processComplaint(
  id: string,
  payload: ComplaintActionForm = {},
) {
  return apiFetch<Complaint>(`/documents/complaints/${id}/process`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resolveComplaint(
  id: string,
  payload: ComplaintActionForm = {},
) {
  return apiFetch<Complaint>(`/documents/complaints/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function closeComplaint(
  id: string,
  payload: ComplaintActionForm = {},
) {
  return apiFetch<Complaint>(`/documents/complaints/${id}/close`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelComplaint(
  id: string,
  payload: ComplaintActionForm = {},
) {
  return apiFetch<Complaint>(`/documents/complaints/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ESS: เรื่องร้องเรียนของตนเอง — backend ผูก employeeId จากบัญชีผู้ใช้เสมอ */

export async function getEssComplaints(params?: ComplaintListParams) {
  return apiFetch<ComplaintListResponse>(
    `/documents/ess/complaints${buildQueryString(params)}`,
  );
}

export async function getEssComplaint(id: string) {
  return apiFetch<Complaint>(`/documents/ess/complaints/${id}`);
}

export async function createEssComplaint(payload: CreateComplaintForm) {
  return apiFetch<Complaint>("/documents/ess/complaints", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelEssComplaint(
  id: string,
  payload: ComplaintActionForm = {},
) {
  return apiFetch<Complaint>(`/documents/ess/complaints/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteComplaint(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/documents/complaints/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function createDocumentType(payload: CreateDocumentTypeForm) {
  return apiFetch<DocumentType>("/documents/types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDocumentType(
  id: string,
  payload: UpdateDocumentTypeForm,
) {
  return apiFetch<DocumentType>(`/documents/types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteDocumentType(id: string) {
  return apiFetch<{ id: string; deleted: boolean; usedByRequests?: number }>(
    `/documents/types/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function createDocumentTemplate(
  payload: CreateDocumentTemplateForm,
) {
  return apiFetch<DocumentTemplate>("/documents/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDocumentTemplate(
  id: string,
  payload: UpdateDocumentTemplateForm,
) {
  return apiFetch<DocumentTemplate>(`/documents/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteDocumentTemplate(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/documents/templates/${id}`,
    {
      method: "DELETE",
    },
  );
}

/* =========================================================
   PERFORMANCE API
   ---------------------------------------------------------
   ใช้กับระบบประเมินผลและวินัย
   - Evaluation Form / Result
   - Evaluator
   - Warning Letter
   - Disciplinary History
========================================================= */

export async function getEvaluationForms(params?: EvaluationFormListParams) {
  return apiFetch<EvaluationFormListResponse>(
    `/performance/forms${buildQueryString(params)}`,
  );
}

export async function getEvaluationForm(id: string) {
  return apiFetch<EvaluationForm>(`/performance/forms/${id}`);
}

export async function createEvaluationForm(payload: CreateEvaluationFormForm) {
  return apiFetch<EvaluationForm>("/performance/forms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEvaluationForm(
  id: string,
  payload: UpdateEvaluationFormForm,
) {
  return apiFetch<EvaluationForm>(`/performance/forms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteEvaluationForm(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/performance/forms/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getEvaluators(params?: EvaluatorListParams) {
  return apiFetch<Evaluator[]>(
    `/performance/evaluators${buildQueryString(params)}`,
  );
}

export async function createEvaluator(payload: CreateEvaluatorForm) {
  return apiFetch<Evaluator>("/performance/evaluators", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteEvaluator(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/performance/evaluators/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getEvaluationResults(
  params?: EvaluationResultListParams,
) {
  return apiFetch<EvaluationResultListResponse>(
    `/performance/results${buildQueryString(params)}`,
  );
}

export async function getEvaluationResult(id: string) {
  return apiFetch<EvaluationResult>(`/performance/results/${id}`);
}

export async function createEvaluationResult(
  payload: CreateEvaluationResultForm,
) {
  return apiFetch<EvaluationResult>("/performance/results", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEvaluationResult(
  id: string,
  payload: UpdateEvaluationResultForm,
) {
  return apiFetch<EvaluationResult>(`/performance/results/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitEvaluationResult(id: string, note?: string) {
  return apiFetch<EvaluationResult>(`/performance/results/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function finalizeEvaluationResult(id: string, note?: string) {
  return apiFetch<EvaluationResult>(`/performance/results/${id}/finalize`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function cancelEvaluationResult(id: string, note?: string) {
  return apiFetch<EvaluationResult>(`/performance/results/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function getWarningLetters(params?: WarningLetterListParams) {
  return apiFetch<WarningLetterListResponse>(
    `/performance/warnings${buildQueryString(params)}`,
  );
}

export async function getWarningLetter(id: string) {
  return apiFetch<WarningLetter>(`/performance/warnings/${id}`);
}

export async function createWarningLetter(payload: CreateWarningLetterForm) {
  return apiFetch<WarningLetter>("/performance/warnings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWarningLetter(
  id: string,
  payload: UpdateWarningLetterForm,
) {
  return apiFetch<WarningLetter>(`/performance/warnings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function issueWarningLetter(id: string) {
  return apiFetch<WarningLetter>(`/performance/warnings/${id}/issue`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function acknowledgeWarningLetter(
  id: string,
  payload: WarningLetterActionForm = {},
) {
  return apiFetch<WarningLetter>(`/performance/warnings/${id}/acknowledge`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelWarningLetter(
  id: string,
  payload: WarningLetterActionForm = {},
) {
  return apiFetch<WarningLetter>(`/performance/warnings/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteWarningLetter(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/performance/warnings/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getDisciplinaryHistories(
  params?: DisciplinaryHistoryListParams,
) {
  return apiFetch<DisciplinaryHistoryListResponse>(
    `/performance/disciplinary-histories${buildQueryString(params)}`,
  );
}

export async function createDisciplinaryHistory(
  payload: CreateDisciplinaryHistoryForm,
) {
  return apiFetch<DisciplinaryHistory>("/performance/disciplinary-histories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* =========================================================
   MANPOWER API
   ---------------------------------------------------------
   ใช้กับรายงานกำลังคน
   - Overview
   - Department / Branch / Position / Status grouping
========================================================= */

export async function getManpowerOverview(params?: ManpowerQueryParams) {
  return apiFetch<ManpowerOverview>(
    `/manpower/overview${buildQueryString(params)}`,
  );
}

export async function getManpowerByDepartment(params?: ManpowerQueryParams) {
  return apiFetch<ManpowerOrgGroup[]>(
    `/manpower/by-department${buildQueryString(params)}`,
  );
}

export async function getManpowerByBranch(params?: ManpowerQueryParams) {
  return apiFetch<ManpowerOrgGroup[]>(
    `/manpower/by-branch${buildQueryString(params)}`,
  );
}

export async function getManpowerByPosition(params?: ManpowerQueryParams) {
  return apiFetch<ManpowerPositionGroup[]>(
    `/manpower/by-position${buildQueryString(params)}`,
  );
}

export async function getManpowerByStatus(params?: ManpowerQueryParams) {
  return apiFetch<ManpowerStatusGroup[]>(
    `/manpower/by-status${buildQueryString(params)}`,
  );
}

/* =========================================================
   ONBOARDING API
   ---------------------------------------------------------
   ใช้กับระบบรับพนักงานใหม่และทดลองงาน
   - Checklist
   - Task
   - Document
   - Probation
========================================================= */

/**
 * โมดูล onboarding ส่ง list กลับมาเป็น array ตรง ๆ ใน `data`
 * แล้ววาง meta/summary ไว้ระดับเดียวกับ data (ต่างจากโมดูลอื่นที่ห่อไว้ใน data)
 * จึงต้องประกอบร่างกลับเป็น { items, meta, summary } ให้หน้าเพจใช้งาน
 */
function toOnboardingListResponse<T, S>(response: {
  data: T[];
  meta?: OnboardingListMeta;
  summary?: S;
}): { items: T[]; meta: OnboardingListMeta; summary?: S } {
  const items = Array.isArray(response.data) ? response.data : [];

  return {
    items,
    meta:
      response.meta ??
      ({
        total: items.length,
        page: 1,
        pageSize: items.length,
        totalPages: 1,
      } as OnboardingListMeta),
    summary: response.summary,
  };
}

export async function getOnboardingChecklists(
  params?: OnboardingChecklistListParams,
) {
  const response = await apiFetchWithMeta<
    OnboardingChecklist[],
    OnboardingListMeta,
    OnboardingChecklistListSummary
  >(`/onboarding/checklists${buildQueryString(params)}`);

  return toOnboardingListResponse(response);
}

export async function getOnboardingChecklist(id: string) {
  return apiFetch<OnboardingChecklist>(`/onboarding/checklists/${id}`);
}

export async function createOnboardingChecklist(
  payload: CreateOnboardingChecklistForm,
) {
  return apiFetch<OnboardingChecklist>("/onboarding/checklists", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOnboardingChecklist(
  id: string,
  payload: UpdateOnboardingChecklistForm,
) {
  return apiFetch<OnboardingChecklist>(`/onboarding/checklists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteOnboardingChecklist(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/onboarding/checklists/${id}`,
    {
      method: "DELETE",
    },
  );
}

/** ความคืบหน้าพนักงานใหม่รายคน — ใช้ในแท็บ "พนักงานใหม่" ของหน้า /onboarding */
export async function getOnboardingProgress(
  params?: OnboardingProgressListParams,
) {
  return apiFetch<OnboardingProgressResponse>(
    `/onboarding/progress${buildQueryString(params)}`,
  );
}

export async function getOnboardingTasks(params?: OnboardingTaskListParams) {
  const response = await apiFetchWithMeta<
    OnboardingTask[],
    OnboardingListMeta,
    OnboardingTaskListSummary
  >(`/onboarding/tasks${buildQueryString(params)}`);

  return toOnboardingListResponse(response);
}

export async function getOnboardingTask(id: string) {
  return apiFetch<OnboardingTask>(`/onboarding/tasks/${id}`);
}

export async function createOnboardingTask(payload: CreateOnboardingTaskForm) {
  return apiFetch<OnboardingTask>("/onboarding/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOnboardingTask(
  id: string,
  payload: UpdateOnboardingTaskForm,
) {
  return apiFetch<OnboardingTask>(`/onboarding/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** กางเช็กลิสต์ทั้งชุดเป็นงานต้อนรับให้พนักงานคนหนึ่ง — ข้ามข้อที่มีอยู่แล้ว */
export async function applyOnboardingChecklist(
  checklistId: string,
  payload: { employeeId: string; dueDate?: string },
) {
  return apiFetch<{ created: number; skipped: number }>(
    `/onboarding/checklists/${checklistId}/apply`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function startOnboardingTask(id: string) {
  return apiFetch<OnboardingTask>(`/onboarding/tasks/${id}/start`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function completeOnboardingTask(
  id: string,
  payload: OnboardingTaskActionForm = {},
) {
  return apiFetch<OnboardingTask>(`/onboarding/tasks/${id}/complete`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelOnboardingTask(
  id: string,
  payload: OnboardingTaskActionForm = {},
) {
  return apiFetch<OnboardingTask>(`/onboarding/tasks/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOnboardingDocuments(
  params?: OnboardingDocumentListParams,
) {
  const response = await apiFetchWithMeta<
    OnboardingDocument[],
    OnboardingListMeta,
    OnboardingDocumentListSummary
  >(`/onboarding/documents${buildQueryString(params)}`);

  return toOnboardingListResponse(response);
}

export async function createOnboardingDocument(
  payload: CreateOnboardingDocumentForm,
) {
  return apiFetch<OnboardingDocument>("/onboarding/documents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** แนบไฟล์ให้รายการเอกสารพนักงานใหม่ — แนบแล้วสถานะเป็น "ส่งแล้ว รอตรวจ" ทันที */
export async function uploadOnboardingDocumentFile(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<OnboardingDocument>(`/onboarding/documents/${id}/upload`, {
    method: "POST",
    body: form,
  });
}

/** ลิงก์เปิดไฟล์แนบ (inline) — ใช้กับ <a> ตรง ๆ ไม่ผ่าน fetch */
export function getOnboardingDocumentFileUrl(id: string) {
  return `${API_BASE_URL}/onboarding/documents/${id}/file`;
}

/** ลบรายการเอกสารที่เพิ่มผิด — ที่ตรวจผ่านแล้ว backend จะไม่ยอมให้ลบ */
export async function deleteOnboardingDocument(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/onboarding/documents/${id}`,
    { method: "DELETE" },
  );
}

export async function submitOnboardingDocument(
  id: string,
  payload: OnboardingDocumentActionForm = {},
) {
  return apiFetch<OnboardingDocument>(`/onboarding/documents/${id}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyOnboardingDocument(
  id: string,
  payload: OnboardingDocumentActionForm = {},
) {
  return apiFetch<OnboardingDocument>(`/onboarding/documents/${id}/verify`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectOnboardingDocument(
  id: string,
  payload: OnboardingDocumentActionForm = {},
) {
  return apiFetch<OnboardingDocument>(`/onboarding/documents/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function waiveOnboardingDocument(
  id: string,
  payload: OnboardingDocumentActionForm = {},
) {
  return apiFetch<OnboardingDocument>(`/onboarding/documents/${id}/waive`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getProbationRecords(params?: ProbationRecordListParams) {
  const response = await apiFetchWithMeta<
    ProbationRecord[],
    OnboardingListMeta,
    ProbationRecordListSummary
  >(`/onboarding/probations${buildQueryString(params)}`);

  return toOnboardingListResponse(response);
}

export async function getProbationRecord(id: string) {
  return apiFetch<ProbationRecord>(`/onboarding/probations/${id}`);
}

export async function createProbationRecord(
  payload: CreateProbationRecordForm,
) {
  return apiFetch<ProbationRecord>("/onboarding/probations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * บันทึกผลประเมินทดลองงานอย่างเดียว ไม่ตัดสินผ่าน/ไม่ผ่าน
 * การตัดสินยังต้องไปกดที่แท็บทดลองงานหลังตรวจผลแล้ว
 */
export async function saveProbationEvaluation(
  id: string,
  payload: {
    formId: string;
    scoreItems: Array<{
      questionId: string;
      score?: number;
      textValue?: string;
      note?: string;
    }>;
    summary?: string;
    evaluatorEmployeeId?: string;
  },
) {
  return apiFetch<ProbationRecord>(`/onboarding/probations/${id}/evaluation`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reviewProbationRecord(
  id: string,
  payload: ProbationActionForm,
) {
  return apiFetch<ProbationRecord>(`/onboarding/probations/${id}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* =========================================================
   REPORT API
   ---------------------------------------------------------
   ใช้กับระบบรายงานและ export
   - Report Catalog
   - Report Jobs
   - Export Files
   - Report Data
========================================================= */

export async function getReportCatalog() {
  return apiFetch<ReportCatalogItem[]>("/reports/catalog");
}

export async function getReportJobs(params?: ReportJobListParams) {
  return apiFetch<ReportJobListResponse>(
    `/reports/jobs${buildQueryString(params)}`,
  );
}

export async function getReportJob(id: string) {
  return apiFetch<ReportJob>(`/reports/jobs/${id}`);
}

export async function createReportJob(payload: CreateReportJobForm) {
  return apiFetch<ReportJob>("/reports/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function markReportJobProcessing(id: string) {
  return apiFetch<ReportJob>(`/reports/jobs/${id}/processing`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function markReportJobCompleted(id: string) {
  return apiFetch<ReportJob>(`/reports/jobs/${id}/complete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function markReportJobFailed(
  id: string,
  payload: ReportJobActionForm = {},
) {
  return apiFetch<ReportJob>(`/reports/jobs/${id}/fail`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelReportJob(
  id: string,
  payload: ReportJobActionForm = {},
) {
  return apiFetch<ReportJob>(`/reports/jobs/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getExportFiles(params?: ExportFileListParams) {
  return apiFetch<ExportFileListResponse>(
    `/reports/exports${buildQueryString(params)}`,
  );
}

export async function getReportLogs(params?: ReportLogListParams) {
  return apiFetch<ReportLogListResponse>(
    `/reports/logs${buildQueryString(params)}`,
  );
}

/** สถิติการใช้งานทั้งระบบในช่วงเวลาที่เลือก — ใช้ในหน้าศูนย์เอกสารและสถิติ */
export async function getReportStatistics(params?: ReportStatisticsParams) {
  return apiFetch<ReportStatistics>(
    `/reports/statistics${buildQueryString(params)}`,
  );
}

/** กิจกรรมของผู้ใช้รายคน — ต้องมี ORG_MANAGE เพิ่มจาก REPORT_VIEW */
export async function getReportUserActivity(
  userId: string,
  params?: { dateFrom?: string; dateTo?: string; days?: number },
) {
  return apiFetch<ReportUserActivity>(
    `/reports/statistics/users/${userId}${buildQueryString(params)}`,
  );
}

export async function getAttendanceReportData(params?: ReportDataQueryParams) {
  return apiFetch<ReportDataResponse>(
    `/reports/data/attendance${buildQueryString(params)}`,
  );
}

export async function getWorkStatusReportData(
  params?: ReportDataQueryParams,
) {
  return apiFetch<ReportDataResponse>(
    `/reports/data/work-status${buildQueryString(params)}`,
  );
}

export async function getAttendanceLogReportData(
  params?: ReportDataQueryParams,
) {
  return apiFetch<ReportDataResponse>(
    `/reports/data/attendance-log${buildQueryString(params)}`,
  );
}

export async function getLeaveRequestReportData(
  params?: ReportDataQueryParams,
) {
  return apiFetch<ReportDataResponse>(
    `/reports/data/leave-request${buildQueryString(params)}`,
  );
}

export async function getEmployeeRegisterReportData(
  params?: ReportDataQueryParams,
) {
  return apiFetch<ReportDataResponse>(
    `/reports/data/employee-register${buildQueryString(params)}`,
  );
}

export async function getLeaveQuotaReportData(params?: ReportDataQueryParams) {
  return apiFetch<ReportDataResponse>(
    `/reports/data/leave-quota${buildQueryString(params)}`,
  );
}

export async function getPayrollBasicReportData(
  params?: ReportDataQueryParams,
) {
  return apiFetch<ReportDataResponse>(
    `/reports/data/payroll-basic${buildQueryString(params)}`,
  );
}

export async function getSocialSecurityReportData(
  params?: ReportDataQueryParams,
) {
  return apiFetch<ReportDataResponse>(
    `/reports/data/social-security${buildQueryString(params)}`,
  );
}

export async function processReportJob(id: string) {
  return apiFetch<ProcessReportJobResponse>(`/reports/jobs/${id}/process`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function downloadReportExportFile(
  id: string,
  fallbackFileName = "report-export",
  /** ยิงซ้ำหลังต่ออายุ token แล้ว — กันไม่ให้วนซ้ำเกินหนึ่งรอบ */
  isRetry = false,
): Promise<void> {
  const token = getAccessToken();

  const response = await fetch(
    `${API_BASE_URL}/reports/exports/${encodeURIComponent(id)}/download`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );

  // ไฟล์ export เป็นข้อมูลเงินเดือน/ภาษี ผู้ใช้มักเปิดค้างไว้นานก่อนกดโหลด
  // จึงเป็นจุดที่ token หมดอายุระหว่างทางได้ง่ายที่สุดจุดหนึ่ง
  if (response.status === 401 && !isRetry) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      return downloadReportExportFile(id, fallbackFileName, true);
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      forceLogoutClient("UNAUTHORIZED");
    }

    let message = "ดาวน์โหลดไฟล์ไม่สำเร็จ";

    try {
      const data = await response.json();
      message = data?.message || message;
    } catch {
      const text = await response.text();
      message = text || message;
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  const fileName =
    getFileNameFromContentDisposition(contentDisposition) || fallbackFileName;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}

function getFileNameFromContentDisposition(value: string | null) {
  if (!value) return null;

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const normalMatch = value.match(/filename="?([^"]+)"?/i);

  if (normalMatch?.[1]) {
    return decodeURIComponent(normalMatch[1]);
  }

  return null;
}

/* =========================================================
   ESS (EMPLOYEE SELF SERVICE) API
   ---------------------------------------------------------
   ใช้กับหน้าพนักงานบริการตนเอง
   - ESS Dashboard
   - Attendance / Leave / Overtime / Time Adjust
   - ESS Attachments
========================================================= */

export async function getEssMe() {
  return apiFetch<EssMeResponse>("/ess/me");
}

export async function getEssDashboard() {
  return apiFetch<EssDashboardResponse>("/ess/dashboard");
}

export async function getEssAttendance(params?: EssListParams) {
  return apiFetch<EssListResponse<EssAttendanceLog>>(
    `/ess/attendance${buildQueryString(params)}`,
  );
}

export async function getEssLeaveBalances(params?: EssYearParams) {
  return apiFetch<EssLeaveBalance[]>(
    `/ess/leave-balances${buildQueryString(params)}`,
  );
}

export async function getEssLeaveRequests(params?: EssLeaveRequestListParams) {
  return apiFetch<EssListResponse<EssLeaveRequest, EssLeaveRequestSummary>>(
    `/ess/leave-requests${buildQueryString(params)}`,
  );
}

export async function getEssOvertimeRequests(params?: EssOvertimeRequestListParams) {
  return apiFetch<EssListResponse<EssOvertimeRequest, EssOvertimeRequestSummary>>(
    `/ess/overtime-requests${buildQueryString(params)}`,
  );
}

export async function getEssTimeAdjustRequests(params?: EssTimeAdjustRequestListParams) {
  return apiFetch<EssListResponse<EssTimeAdjustRequest, EssTimeAdjustRequestSummary>>(
    `/ess/time-adjust-requests${buildQueryString(params)}`,
  );
}

export async function createEssLeaveRequest(
  payload: CreateEssLeaveRequestForm,
) {
  return apiFetch<EssLeaveRequest>("/ess/leave-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitEssLeaveRequest(id: string) {
  return apiFetch<EssLeaveRequest>(`/ess/leave-requests/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelEssLeaveRequest(
  id: string,
  payload: EssRequestActionForm = {},
) {
  return apiFetch<EssLeaveRequest>(`/ess/leave-requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getEssLeaveAttachments(id: string) {
  return apiFetch<EssAttachment[]>(
    `/ess/leave-requests/${encodeURIComponent(id)}/attachments`,
  );
}

export async function uploadEssLeaveAttachment(
  id: string,
  payload: UploadEssAttachmentForm,
) {
  return uploadEssAttachment<EssAttachment>(
    `/ess/leave-requests/${encodeURIComponent(id)}/attachments/upload`,
    payload,
  );
}

export async function downloadEssLeaveAttachment(
  id: string,
  attachmentId: string,
  fallbackFileName = "leave-evidence",
) {
  return downloadEssAttachment(
    `/ess/leave-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}/download`,
    fallbackFileName,
  );
}

export async function previewEssLeaveAttachment(
  id: string,
  attachmentId: string,
  fallbackFileName = "leave-evidence",
) {
  return fetchEssAttachmentObjectUrl(
    `/ess/leave-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}/download`,
    fallbackFileName,
  );
}

export async function deleteEssLeaveAttachment(
  id: string,
  attachmentId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/ess/leave-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: "DELETE",
    },
  );
}

/** ถามระบบว่าวันที่เลือกเป็นวันประเภทไหนตามปฏิทินวันหยุด ก่อนยื่นใบ OT */
export async function getEssOvertimeDayType(workDate: string) {
  return apiFetch<EssOvertimeDayType>(
    `/ess/overtime-requests/day-type${buildQueryString({ workDate })}`,
  );
}

export async function createEssOvertimeRequest(
  payload: CreateEssOvertimeRequestForm,
) {
  return apiFetch<EssOvertimeRequest>("/ess/overtime-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitEssOvertimeRequest(id: string) {
  return apiFetch<EssOvertimeRequest>(`/ess/overtime-requests/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelEssOvertimeRequest(
  id: string,
  payload: EssRequestActionForm = {},
) {
  return apiFetch<EssOvertimeRequest>(`/ess/overtime-requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createEssTimeAdjustRequest(
  payload: CreateEssTimeAdjustRequestForm,
) {
  return apiFetch<EssTimeAdjustRequest>("/ess/time-adjust-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitEssTimeAdjustRequest(id: string) {
  return apiFetch<EssTimeAdjustRequest>(
    `/ess/time-adjust-requests/${id}/submit`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function cancelEssTimeAdjustRequest(
  id: string,
  payload: EssRequestActionForm = {},
) {
  return apiFetch<EssTimeAdjustRequest>(
    `/ess/time-adjust-requests/${id}/cancel`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getEssOvertimeAttachments(id: string) {
  return apiFetch<EssAttachment[]>(
    `/ess/overtime-requests/${encodeURIComponent(id)}/attachments`,
  );
}

export async function uploadEssOvertimeAttachment(
  id: string,
  payload: UploadEssAttachmentForm,
) {
  return uploadEssAttachment<EssAttachment>(
    `/ess/overtime-requests/${encodeURIComponent(id)}/attachments/upload`,
    payload,
  );
}

export async function downloadEssOvertimeAttachment(
  id: string,
  attachmentId: string,
  fallbackFileName = "overtime-attachment",
) {
  return downloadEssAttachment(
    `/ess/overtime-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}/download`,
    fallbackFileName,
  );
}

export async function previewEssOvertimeAttachment(
  id: string,
  attachmentId: string,
  fallbackFileName = "overtime-evidence",
) {
  return fetchEssAttachmentObjectUrl(
    `/ess/overtime-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}/download`,
    fallbackFileName,
  );
}

export async function deleteEssOvertimeAttachment(
  id: string,
  attachmentId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/ess/overtime-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function getEssTimeAdjustAttachments(id: string) {
  return apiFetch<EssAttachment[]>(
    `/ess/time-adjust-requests/${encodeURIComponent(id)}/attachments`,
  );
}

export async function uploadEssTimeAdjustAttachment(
  id: string,
  payload: UploadEssAttachmentForm,
) {
  return uploadEssAttachment<EssAttachment>(
    `/ess/time-adjust-requests/${encodeURIComponent(id)}/attachments/upload`,
    payload,
  );
}

export async function downloadEssTimeAdjustAttachment(
  id: string,
  attachmentId: string,
  fallbackFileName = "time-adjust-attachment",
) {
  return downloadEssAttachment(
    `/ess/time-adjust-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}/download`,
    fallbackFileName,
  );
}

export async function previewEssTimeAdjustAttachment(
  id: string,
  attachmentId: string,
  fallbackFileName = "time-adjust-evidence",
) {
  return fetchEssAttachmentObjectUrl(
    `/ess/time-adjust-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}/download`,
    fallbackFileName,
  );
}

export async function deleteEssTimeAdjustAttachment(
  id: string,
  attachmentId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/ess/time-adjust-requests/${encodeURIComponent(
      id,
    )}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: "DELETE",
    },
  );
}

async function uploadEssAttachment<T>(
  path: string,
  payload: UploadEssAttachmentForm,
) {
  const token = getAccessToken();
  const formData = new FormData();

  formData.append("title", payload.title);
  formData.append("description", payload.description ?? "");
  formData.append("file", payload.file);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.success === false) {
    throw new ApiClientError({
      message:
        data?.error?.message || data?.message || "อัปโหลดไฟล์แนบไม่สำเร็จ",
      code: data?.error?.code || "UPLOAD_FAILED",
      status: response.status,
      requestId: data?.requestId,
      details: data?.error?.details,
    });
  }

  return (data?.data ?? data) as T;
}

/**
 * เปิดไฟล์หลักฐานที่พนักงานแนบมา สำหรับ "ผู้อนุมัติ" (HR / หัวหน้างาน)
 * ==============================================================
 * คนละชุดกับฝั่ง ESS ที่เจ้าตัวเปิดของตัวเอง — ตัวนี้ยิงไปที่ปลายทางฝั่งหลังบ้าน
 * ซึ่งคุมด้วยสิทธิ์ LEAVE_READ / OT_READ / TIME_ADJUST_READ ที่ทั้ง HR_ADMIN
 * และ MANAGER มีอยู่แล้ว จึงไม่ต้องเปิดสิทธิ์เพิ่ม
 *
 * ต้องโหลดเป็น blob ไม่ใช่ชี้ <img src> ตรง ๆ เพราะปลายทางต้องใช้ token
 * ซึ่งเก็บอยู่ใน sessionStorage และส่งทาง Authorization header เท่านั้น
 * แท็ก <img> แนบ header ไม่ได้ ถ้าชี้ตรงจะได้ 401 ทุกครั้ง
 */
export async function previewApprovalAttachment(
  type: "LEAVE" | "OVERTIME" | "TIME_ADJUST",
  requestId: string,
  attachmentId: string,
  fallbackFileName = "attachment",
) {
  const base =
    type === "LEAVE"
      ? "/leaves/requests"
      : type === "OVERTIME"
        ? "/overtime/requests"
        : "/time-adjust/requests";

  return fetchEssAttachmentObjectUrl(
    `${base}/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(
      attachmentId,
    )}/download`,
    fallbackFileName,
  );
}

async function fetchEssAttachmentObjectUrl(path: string, fallbackFileName: string) {
  const token = getAccessToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    let message = "เปิดไฟล์แนบไม่สำเร็จ";

    try {
      const data = await response.json();
      message = data?.error?.message || data?.message || message;
    } catch {
      const text = await response.text();
      message = text || message;
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  const fileName =
    getFileNameFromContentDisposition(contentDisposition) || fallbackFileName;

  return {
    objectUrl: window.URL.createObjectURL(blob),
    fileName,
    contentType: blob.type || response.headers.get("content-type") || "",
  };
}

async function downloadEssAttachment(path: string, fallbackFileName: string) {
  const token = getAccessToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    let message = "ดาวน์โหลดไฟล์แนบไม่สำเร็จ";

    try {
      const data = await response.json();
      message = data?.error?.message || data?.message || message;
    } catch {
      const text = await response.text();
      message = text || message;
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  const fileName =
    getFileNameFromContentDisposition(contentDisposition) || fallbackFileName;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}

/* =========================================================
   APPROVAL CENTER API
   ---------------------------------------------------------
   ใช้กับหน้าศูนย์อนุมัติรวม
   - Pending Approvals
   - Approve / Reject Leave
   - Approve / Reject Overtime
   - Approve / Reject Time Adjust
   - Approve / Reject Offsite
   - Approve / Reject Document
========================================================= */

export async function getPendingApprovals(params?: ApprovalListParams) {
  return apiFetch<ApprovalListResponse>(
    `/approvals/pending${buildQueryString(params)}`,
  );
}

export async function approveApprovalLeaveRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/leave/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectApprovalLeaveRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/leave/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function returnApprovalLeaveRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/leave/${encodeURIComponent(id)}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveApprovalOvertimeRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/overtime/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectApprovalOvertimeRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/overtime/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function returnApprovalOvertimeRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/overtime/${encodeURIComponent(id)}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveApprovalTimeAdjustRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/time-adjust/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectApprovalTimeAdjustRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/time-adjust/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function returnApprovalTimeAdjustRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/time-adjust/${encodeURIComponent(id)}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveApprovalOffsiteRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/offsite/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectApprovalOffsiteRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/offsite/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function returnApprovalOffsiteRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/offsite/${encodeURIComponent(id)}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveApprovalDocumentRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/document/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectApprovalDocumentRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/document/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function returnApprovalDocumentRequest(
  id: string,
  payload: ApprovalActionForm = {},
) {
  return apiFetch(`/approvals/document/${encodeURIComponent(id)}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* =========================================================
   HR REVIEW / PAYROLL HANDOFF API
   ---------------------------------------------------------
   ใช้กับหน้า HR Review Center
   - แสดงรายการ Leave / OT / Time Adjust ที่อนุมัติครบแล้ว
   - ให้ HR ตรวจสอบก่อนส่งเข้า Payroll
   - endpoint backend อยู่ที่ /hr-review
========================================================= */

export async function getHrReviewItems(params?: HrReviewListParams) {
  return apiFetch<HrReviewListResponse>(
    `/hr-review${buildQueryString(params)}`,
  );
}

export async function getHrReviewItem(sourceType: string, sourceId: string) {
  return apiFetch<HrReviewItem>(
    `/hr-review/${encodeURIComponent(sourceType)}/${encodeURIComponent(
      sourceId,
    )}`,
  );
}

export async function reviewHrReviewItem(
  sourceType: string,
  sourceId: string,
  payload: HrReviewActionForm = {},
) {
  return apiFetch<HrReviewItem>(
    `/hr-review/${encodeURIComponent(sourceType)}/${encodeURIComponent(
      sourceId,
    )}/review`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function markHrReviewPayrollReady(
  sourceType: string,
  sourceId: string,
  payload: HrReviewActionForm = {},
) {
  return apiFetch<HrReviewItem>(
    `/hr-review/${encodeURIComponent(sourceType)}/${encodeURIComponent(
      sourceId,
    )}/payroll-ready`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function holdHrReviewItem(
  sourceType: string,
  sourceId: string,
  payload: HrReviewActionForm = {},
) {
  return apiFetch<HrReviewItem>(
    `/hr-review/${encodeURIComponent(sourceType)}/${encodeURIComponent(
      sourceId,
    )}/hold`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function markHrReviewSentToPayroll(
  sourceType: string,
  sourceId: string,
  payload: HrReviewActionForm = {},
) {
  return apiFetch<HrReviewItem>(
    `/hr-review/${encodeURIComponent(sourceType)}/${encodeURIComponent(
      sourceId,
    )}/sent-to-payroll`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function cancelHrReviewItem(
  sourceType: string,
  sourceId: string,
  payload: HrReviewActionForm = {},
) {
  return apiFetch<HrReviewItem>(
    `/hr-review/${encodeURIComponent(sourceType)}/${encodeURIComponent(
      sourceId,
    )}/cancel`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/* =========================================================
   ESS PAYROLL & SCHEDULE API
   ---------------------------------------------------------
   ใช้กับข้อมูลเงินเดือน/ตารางงานของพนักงานใน ESS
   - Salary Slips
   - Salary Slip PDF
   - ESS Schedule
========================================================= */

export async function getEssSalarySlips(
  params?: PayrollListParams,
): Promise<PayrollPayslipsResponse> {
  const result = await apiFetchWithMeta<
    PayrollPayslip[],
    PayrollPageMeta,
    PayrollPayslipListSummary
  >(`/ess/salary-slips${buildQueryString(params)}`);

  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
    summary: result.summary,
  };
}

export async function getEssSalarySlip(itemId: string) {
  return apiFetch<PayrollPayslip>(
    `/ess/salary-slips/${encodeURIComponent(itemId)}`,
  );
}

export async function getEssSchedule(params?: EssScheduleParams) {
  return apiFetch<EssScheduleResponse>(
    `/ess/schedule${buildQueryString(params)}`,
  );
}

/* =========================================================
   REPORT QUEUE API
   ---------------------------------------------------------
   ใช้กับระบบประมวลผลรายงานแบบ async/queue
========================================================= */

export async function enqueueProcessReportJob(id: string) {
  return apiFetch<EnqueueReportJobResponse>(
    `/reports/jobs/${encodeURIComponent(id)}/process-async`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function getReportQueueJob(queueJobId: string) {
  return apiFetch<ReportQueueJobStatusResponse>(
    `/reports/queue/jobs/${encodeURIComponent(queueJobId)}`,
  );
}

/* =========================================================
   PAYROLL API
   ---------------------------------------------------------
   ใช้กับหน้า /payroll หลักเท่านั้น
   - Payroll Components
   - Payroll Periods
   - Employee Compensations
   - Payroll Runs
   - Payslip PDF

   หมายเหตุ:
   - หน้า /payroll = งวดเงินเดือน / คำนวณเงินเดือน / Payroll Run
   - หน้า /payroll/compensation ใช้ lib/payroll-extensions-api.ts เพิ่มเติม
========================================================= */

export async function getPayrollComponents(
  params?: PayrollListParams,
): Promise<PayrollComponentsResponse> {
  const result = await apiFetchWithMeta<PayrollComponent[], PayrollPageMeta>(
    `/payroll/components${buildQueryString(params)}`,
  );

  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
  };
}

export async function getPayrollPeriods(
  params?: PayrollListParams,
): Promise<PayrollPeriodsResponse> {
  /*
   * ต้องส่ง summary ต่อไปให้หน้าจอด้วย
   * หลังบ้านนับจำนวนงวดแยกตามสถานะและจำนวน Run มาให้แล้ว
   * ถ้าทิ้งไป การ์ดสรุปด้านบนหน้า /payroll/periods จะขึ้น 0 ทุกช่อง
   * ทั้งที่รายการข้างล่างมีงวดอยู่จริง ซึ่งอ่านแล้วเข้าใจว่ายังไม่มีอะไรเลย
   */
  const result = await apiFetchWithMeta<
    PayrollPeriod[],
    PayrollPageMeta,
    PayrollPeriodListSummary
  >(`/payroll/periods${buildQueryString(params)}`);

  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
    summary: result.summary,
  };
}

export async function createPayrollPeriod(payload: CreatePayrollPeriodPayload) {
  return apiFetch<PayrollPeriod>("/payroll/periods", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePayrollPeriod(
  id: string,
  payload: UpdatePayrollPeriodPayload,
) {
  return apiFetch<PayrollPeriod>(`/payroll/periods/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deletePayrollPeriod(id: string) {
  return apiFetch<PayrollPeriod>(`/payroll/periods/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * backend หนีบ pageSize ไว้ที่ 100 เงียบ ๆ (ไม่ error)
 * ถ้าหน้าไหนขอมากกว่านั้นเพื่อเอาทั้งบริษัท จะได้มาแค่ 100 คนแรกโดยไม่รู้ตัว
 * จึงต้องไล่ขอทีละหน้าแล้วต่อกันเอง
 */
const COMPENSATION_PAGE_LIMIT = 100;

export async function getEmployeeCompensations(
  params?: PayrollListParams,
): Promise<EmployeeCompensationsResponse> {
  const wanted = Number(params?.pageSize ?? 20);

  if (wanted > COMPENSATION_PAGE_LIMIT) {
    const collected: EmployeeCompensation[] = [];
    let page = Number(params?.page ?? 1);
    let lastMeta: PayrollPageMeta | undefined;
    let lastSummary: EmployeeCompensationListSummary | undefined;

    for (;;) {
      const pageResult = await apiFetchWithMeta<
        EmployeeCompensation[],
        PayrollPageMeta,
        EmployeeCompensationListSummary
      >(
        `/payroll/compensations${buildQueryString({
          ...params,
          page,
          pageSize: COMPENSATION_PAGE_LIMIT,
        })}`,
      );

      collected.push(...pageResult.data);
      lastMeta = pageResult.meta;
      lastSummary = pageResult.summary;

      const total = pageResult.meta?.total ?? collected.length;
      if (
        pageResult.data.length === 0 ||
        collected.length >= Math.min(wanted, total)
      ) {
        break;
      }
      page += 1;
    }

    return {
      data: collected.slice(0, wanted),
      meta: lastMeta ?? {
        page: 1,
        pageSize: wanted,
        total: collected.length,
        totalPages: 1,
      },
      summary: lastSummary,
    };
  }

  const result = await apiFetchWithMeta<
    EmployeeCompensation[],
    PayrollPageMeta,
    EmployeeCompensationListSummary
  >(`/payroll/compensations${buildQueryString(params)}`);

  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
    summary: result.summary,
  };
}

export async function createEmployeeCompensation(
  payload: CreateEmployeeCompensationPayload,
) {
  return apiFetch<EmployeeCompensation>("/payroll/compensations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEmployeeCompensation(
  id: string,
  payload: UpdateEmployeeCompensationPayload,
) {
  return apiFetch<EmployeeCompensation>(
    `/payroll/compensations/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteEmployeeCompensation(id: string) {
  return apiFetch<EmployeeCompensation>(
    `/payroll/compensations/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

/** งวดเดียวพร้อมบริษัท — ใช้ตอนเปิดหน้า /payroll/:periodId ตรง ๆ */
export async function getPayrollPeriodById(id: string) {
  return apiFetch<PayrollPeriod>(`/payroll/periods/${encodeURIComponent(id)}`);
}

export async function getPayrollRuns(
  params?: PayrollListParams,
): Promise<PayrollRunsResponse> {
  const result = await apiFetchWithMeta<PayrollRun[], PayrollPageMeta, PayrollRunListSummary>(
    `/payroll/runs${buildQueryString(params)}`,
  );

  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
    summary: result.summary,
  };
}

export async function getPayrollRunById(id: string) {
  return apiFetch<PayrollRunDetail>(`/payroll/runs/${id}`);
}

export async function getPayrollRunProgress(id: string) {
  return apiFetch<PayrollRunProgressResponse>(`/payroll/runs/${id}/progress`);
}

function buildPayrollRunActionQuery(options?: PayrollRunActionOptions) {
  return options?.response === "summary" ? "?response=summary" : "";
}

export async function getPayrollRunAttendanceDeductions(id: string) {
  return apiFetch<PayrollAttendanceDeductionsResponse>(
    `/payroll/runs/${id}/attendance-deductions`,
  );
}

export async function getPayrollRunValidation(id: string) {
  return apiFetch<PayrollRunValidationResponse>(
    `/payroll/runs/${id}/validation`,
  );
}

export async function getPayrollRunReadiness(id: string) {
  return apiFetch<PayrollReadinessResponse>(
    `/payroll/runs/${id}/readiness`,
  );
}

export async function getPayrollRunLineAudit(id: string) {
  return apiFetch<PayrollLineAuditResponse>(
    `/payroll/runs/${id}/line-audit`,
  );
}

export async function getPayrollRunSourcePreview(id: string) {
  return apiFetch<PayrollSourcePreviewResponse>(
    `/payroll/runs/${id}/source-preview`,
  );
}

export async function precheckPayrollRun(
  id: string,
  payload: CalculatePayrollRunPayload = {},
) {
  return apiFetch<PayrollReadinessResponse>(`/payroll/runs/${id}/precheck`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function dryRunPayrollRun(
  id: string,
  payload: CalculatePayrollRunPayload = {},
) {
  return apiFetch<PayrollDryRunResponse>(`/payroll/runs/${id}/dry-run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPayrollRunPayslipPublicationStatus(id: string) {
  return apiFetch<PayrollPayslipPublicationStatusResponse>(
    `/payroll/runs/${id}/payslip-publication-status`,
  );
}

export async function publishPayrollRunPayslips(id: string) {
  return apiFetch<PayrollPayslipPublicationStatusResponse>(
    `/payroll/runs/${id}/publish-payslips`,
    { method: "POST" },
  );
}

export async function unpublishPayrollRunPayslips(id: string) {
  return apiFetch<PayrollPayslipPublicationStatusResponse>(
    `/payroll/runs/${id}/unpublish-payslips`,
    { method: "POST" },
  );
}

export async function showPayrollRunPayslipDetails(id: string) {
  return apiFetch<PayrollPayslipPublicationStatusResponse>(
    `/payroll/runs/${id}/show-payslip-details`,
    { method: "POST" },
  );
}

export async function hidePayrollRunPayslipDetails(id: string) {
  return apiFetch<PayrollPayslipPublicationStatusResponse>(
    `/payroll/runs/${id}/hide-payslip-details`,
    { method: "POST" },
  );
}

export function importPayrollRunAttendanceDeductions(
  id: string,
  options: PayrollRunActionOptions & { response: "summary" },
): Promise<PayrollRun>;
export function importPayrollRunAttendanceDeductions(
  id: string,
  options?: PayrollRunActionOptions,
): Promise<PayrollRunDetail>;
export function importPayrollRunAttendanceDeductions(
  id: string,
  options?: PayrollRunActionOptions,
) {
  return apiFetch<PayrollRun | PayrollRunDetail>(
    `/payroll/runs/${id}/import-attendance-deductions${buildPayrollRunActionQuery(options)}`,
    { method: "POST" },
  );
}

export function recalculatePayrollRunAttendanceDeductions(
  id: string,
  options: PayrollRunActionOptions & { response: "summary" },
): Promise<PayrollRun>;
export function recalculatePayrollRunAttendanceDeductions(
  id: string,
  options?: PayrollRunActionOptions,
): Promise<PayrollRunDetail>;
export function recalculatePayrollRunAttendanceDeductions(
  id: string,
  options?: PayrollRunActionOptions,
) {
  return apiFetch<PayrollRun | PayrollRunDetail>(
    `/payroll/runs/${id}/recalculate-attendance-deductions${buildPayrollRunActionQuery(options)}`,
    { method: "POST" },
  );
}

export async function createPayrollRun(payload: CreatePayrollRunPayload) {
  return apiFetch<PayrollRun>("/payroll/runs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function calculatePayrollRun(
  id: string,
  payload: CalculatePayrollRunPayload | undefined,
  options: PayrollRunActionOptions & { response: "summary" },
): Promise<PayrollRun>;
export function calculatePayrollRun(
  id: string,
  payload?: CalculatePayrollRunPayload,
  options?: PayrollRunActionOptions,
): Promise<PayrollRunDetail>;
export function calculatePayrollRun(
  id: string,
  payload: CalculatePayrollRunPayload = {},
  options?: PayrollRunActionOptions,
) {
  return apiFetch<PayrollRun | PayrollRunDetail>(
    `/payroll/runs/${id}/calculate${buildPayrollRunActionQuery(options)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function reviewPayrollRun(
  id: string,
  payload: ReviewPayrollRunPayload | undefined,
  options: PayrollRunActionOptions & { response: "summary" },
): Promise<PayrollRun>;
export function reviewPayrollRun(
  id: string,
  payload?: ReviewPayrollRunPayload,
  options?: PayrollRunActionOptions,
): Promise<PayrollRunDetail>;
export function reviewPayrollRun(
  id: string,
  payload: ReviewPayrollRunPayload = {},
  options?: PayrollRunActionOptions,
) {
  return apiFetch<PayrollRun | PayrollRunDetail>(
    `/payroll/runs/${id}/review${buildPayrollRunActionQuery(options)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function approvePayrollRun(
  id: string,
  payload: ApprovePayrollRunPayload | undefined,
  options: PayrollRunActionOptions & { response: "summary" },
): Promise<PayrollRun>;
export function approvePayrollRun(
  id: string,
  payload?: ApprovePayrollRunPayload,
  options?: PayrollRunActionOptions,
): Promise<PayrollRunDetail>;
export function approvePayrollRun(
  id: string,
  payload: ApprovePayrollRunPayload = {},
  options?: PayrollRunActionOptions,
) {
  return apiFetch<PayrollRun | PayrollRunDetail>(
    `/payroll/runs/${id}/approve${buildPayrollRunActionQuery(options)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function markPayrollRunPaid(
  id: string,
  payload: MarkPayrollRunPaidPayload | undefined,
  options: PayrollRunActionOptions & { response: "summary" },
): Promise<PayrollRun>;
export function markPayrollRunPaid(
  id: string,
  payload?: MarkPayrollRunPaidPayload,
  options?: PayrollRunActionOptions,
): Promise<PayrollRunDetail>;
export function markPayrollRunPaid(
  id: string,
  payload: MarkPayrollRunPaidPayload = {},
  options?: PayrollRunActionOptions,
) {
  return apiFetch<PayrollRun | PayrollRunDetail>(
    `/payroll/runs/${id}/paid${buildPayrollRunActionQuery(options)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function cancelPayrollRun(
  id: string,
  payload: CancelPayrollRunPayload | undefined,
  options: PayrollRunActionOptions & { response: "summary" },
): Promise<PayrollRun>;
export function cancelPayrollRun(
  id: string,
  payload?: CancelPayrollRunPayload,
  options?: PayrollRunActionOptions,
): Promise<PayrollRun>;
export function cancelPayrollRun(
  id: string,
  payload: CancelPayrollRunPayload = {},
  options?: PayrollRunActionOptions,
) {
  return apiFetch<PayrollRun>(
    `/payroll/runs/${id}/cancel${buildPayrollRunActionQuery(options)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function downloadPayrollPayslipPdf(
  itemId: string,
  layout: PayslipPaperLayout = "FULL",
) {
  return apiFetchBlob(
    `/payroll/payslips/${encodeURIComponent(itemId)}/pdf${buildQueryString({ layout })}`,
  );
}

export async function downloadPayrollRunExcel(runId: string) {
  return apiFetchBlob(`/payroll/runs/${encodeURIComponent(runId)}/export/excel`);
}

export async function downloadPayrollRunPdf(runId: string) {
  return apiFetchBlob(`/payroll/runs/${encodeURIComponent(runId)}/export/pdf`);
}

/** รูปแบบกระดาษของสลิป — FULL = A4 เต็มใบ, HALF = A5 ครึ่ง A4 (2 ใบต่อแผ่น) */
export type PayslipPaperLayout = "FULL" | "HALF";

/**
 * สลิปทุกคนในรอบ รวมเป็นไฟล์ ZIP ไฟล์เดียว
 *
 * ฝั่ง backend ทยอยส่งข้อมูลระหว่างสร้าง ไม่ได้รอจนครบ เบราว์เซอร์จึงขึ้นแถบ
 * ดาวน์โหลดทันทีและไม่ถูกตัดการเชื่อมต่อระหว่างรอ (130 คนใช้เวลาราว 1 นาที)
 */
export async function downloadPayrollRunPayslipsZip(
  runId: string,
  layout: PayslipPaperLayout = "FULL",
) {
  return apiFetchBlob(
    `/payroll/runs/${encodeURIComponent(runId)}/payslips/zip${buildQueryString({ layout })}`,
  );
}

export async function downloadEssSalarySlipPdf(
  itemId: string,
  layout: PayslipPaperLayout = "FULL",
) {
  return apiFetchBlob(
    `/ess/salary-slips/${encodeURIComponent(itemId)}/pdf${buildQueryString({ layout })}`,
  );
}

/* =========================================================
   ORGANIZATION API
========================================================= */

export async function getOrganizationCompanies(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  q?: string;
}) {
  const response = await apiFetchWithMeta<
    CompanyItem[],
    OrganizationPaginationMeta
  >(`/organization/companies${buildQueryString(params)}`);

  return {
    items: response.data,
    meta: response.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? response.data.length),
      total: response.data.length,
      totalPages: 1,
    },
  };
}

export async function getOrganizationBranches(params?: {
  companyId?: string;
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const response = await apiFetchWithMeta<
    BranchItem[],
    OrganizationPaginationMeta
  >(`/organization/branches${buildQueryString(params)}`);

  return {
    items: response.data,
    meta: response.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? response.data.length),
      total: response.data.length,
      totalPages: 1,
    },
  };
}

/* =========================================================
   SYSTEM SETTINGS API
========================================================= */

export async function getSystemSettings() {
  return apiFetch<SystemSettings>("/settings/system");
}

export async function getCompanyPayrollSetting(companyId: string) {
  return apiFetch<CompanyPayrollSetting>(
    `/settings/payroll/company-settings/${encodeURIComponent(companyId)}`,
  );
}

export async function updateCompanyPayrollSetting(
  companyId: string,
  payload: UpdateCompanyPayrollSettingsPayload,
) {
  return apiFetch<CompanyPayrollSetting>(
    `/settings/payroll/company-settings/${encodeURIComponent(companyId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function resetCompanyPayrollSetting(companyId: string) {
  return apiFetch<CompanyPayrollSetting>(
    `/settings/payroll/company-settings/${encodeURIComponent(companyId)}/reset`,
    { method: "POST" },
  );
}

export async function getCompanyPayrollSettingAudit(
  companyId: string,
  params?: { page?: number; pageSize?: number },
): Promise<CompanyPayrollSettingAuditResponse> {
  const response = await apiFetchWithMeta<
    CompanyPayrollSettingAuditItem[],
    CompanyPayrollSettingAuditResponse["meta"]
  >(
    `/settings/payroll/company-settings/${encodeURIComponent(
      companyId,
    )}/audit${buildQueryString(params)}`,
  );

  return {
    data: response.data,
    meta: response.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? response.data.length),
      total: response.data.length,
      totalPages: 1,
    },
  };
}

/**
 * รายชื่อพนักงานสำหรับให้ HR เลือก "ออกเอกสารให้ใคร"
 * ถ้าไม่เลือก backend จะ fallback เป็นพนักงานของบัญชีที่ล็อกอินอยู่
 */
export async function getDocumentEmployees(params?: {
  q?: string;
  pageSize?: number;
}) {
  return apiFetch<EmployeeListResponse>(
    `/employees${buildQueryString({
      page: 1,
      pageSize: Math.min(params?.pageSize ?? 100, 100),
      status: "ACTIVE",
      q: params?.q,
    })}`,
  );
}

export async function getHolidaySettingEmployees(params?: {
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const requestedPage = Math.max(1, params?.page ?? 1);
  const requestedPageSize = Math.max(1, params?.pageSize ?? 100);

  // The employees API validates pageSize with a maximum of 100.
  // Holiday settings may need more than 100 employees for selection,
  // so fetch safely in chunks and return the same list response shape.
  const apiPageSize = Math.min(requestedPageSize, 100);

  if (requestedPageSize <= apiPageSize) {
    return apiFetch<EmployeeListResponse>(
      `/employees${buildQueryString({
        page: requestedPage,
        pageSize: apiPageSize,
        status: "ACTIVE",
        q: params?.q,
      })}`,
    );
  }

  const startIndex = (requestedPage - 1) * requestedPageSize;
  let apiPage = Math.floor(startIndex / apiPageSize) + 1;
  const offsetInFirstPage = startIndex % apiPageSize;
  const items: EmployeeListResponse["items"] = [];
  let total = 0;

  while (items.length < requestedPageSize) {
    const response = await apiFetch<EmployeeListResponse>(
      `/employees${buildQueryString({
        page: apiPage,
        pageSize: apiPageSize,
        status: "ACTIVE",
        q: params?.q,
      })}`,
    );

    total = response.meta.total;

    const pageItems =
      apiPage === Math.floor(startIndex / apiPageSize) + 1
        ? response.items.slice(offsetInFirstPage)
        : response.items;

    items.push(...pageItems);

    if (apiPage >= response.meta.totalPages || response.items.length === 0) {
      break;
    }

    apiPage += 1;
  }

  return {
    items: items.slice(0, requestedPageSize),
    meta: {
      page: requestedPage,
      pageSize: requestedPageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / requestedPageSize)),
    },
  } satisfies EmployeeListResponse;
}

export async function updateSystemSettings(
  payload: UpdateSystemSettingsPayload,
) {
  return apiFetch<SystemSettings>("/settings/system", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getHolidayCalendars() {
  return apiFetch<AttendanceCustomHoliday[]>(
    "/settings/system/holidays/calendar",
  );
}

export async function createHolidayCalendar(
  payload: CreateHolidayCalendarPayload,
) {
  return apiFetch<AttendanceCustomHoliday[]>(
    "/settings/system/holidays/calendar",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteHolidayCalendar(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/settings/system/holidays/calendar/${id}`,
    {
      method: "DELETE",
    },
  );
}


export async function getHolidaySwaps() {
  return apiFetch<AttendanceHolidaySwap[]>(
    "/settings/system/holidays/swaps",
  );
}

export async function createHolidaySwap(payload: CreateHolidaySwapPayload) {
  return apiFetch<AttendanceHolidaySwap[]>(
    "/settings/system/holidays/swaps",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function cancelHolidaySwap(
  id: string,
  payload?: CancelHolidaySwapPayload,
) {
  return apiFetch<{ id: string; cancelled: boolean }>(
    `/settings/system/holidays/swaps/${id}/cancel`,
    {
      method: "PATCH",
      body: JSON.stringify(payload ?? {}),
    },
  );
}

export async function deleteHolidaySwap(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/settings/system/holidays/swaps/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getHolidayWorkAssignments() {
  return apiFetch<AttendanceHolidayWorkOverride[]>(
    "/settings/system/holidays/work-assignments",
  );
}

export async function createHolidayWorkAssignments(
  payload: CreateHolidayWorkAssignmentPayload,
) {
  return apiFetch<AttendanceHolidayWorkOverride[]>(
    "/settings/system/holidays/work-assignments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function cancelHolidayWorkAssignment(id: string) {
  return apiFetch<{ id: string; cancelled: boolean }>(
    `/settings/system/holidays/work-assignments/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getSubstituteHolidayCredits() {
  return apiFetch<AttendanceSubstituteHolidayCredit[]>(
    "/settings/system/holidays/substitute-credits",
  );
}

export async function cancelSubstituteHolidayCredit(id: string) {
  return apiFetch<{ id: string; cancelled: boolean }>(
    `/settings/system/holidays/substitute-credits/${id}/cancel`,
    {
      method: "PATCH",
    },
  );
}

export async function restoreSubstituteHolidayCredit(id: string) {
  return apiFetch<{ id: string; restored: boolean }>(
    `/settings/system/holidays/substitute-credits/${id}/restore`,
    {
      method: "PATCH",
    },
  );
}

export async function deleteSubstituteHolidayCredit(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/settings/system/holidays/substitute-credits/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getSystemSettingsAudit(params?: {
  page?: number;
  pageSize?: number;
}): Promise<SystemSettingsAuditResponse> {
  const response = await apiFetchWithMeta<
    SystemSettingsAuditItem[],
    SystemSettingsAuditResponse["meta"]
  >(`/settings/system/audit${buildQueryString(params)}`);

  return {
    data: response.data,
    meta: response.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? response.data.length),
      total: response.data.length,
      totalPages: 1,
    },
  };
}

/* =========================================================
   DASHBOARD API
========================================================= */

export async function getDashboardOverview() {
  return apiFetch<DashboardOverviewResponse>("/dashboard/overview");
}

export async function getMyDashboardSummary() {
  return apiFetch<MyDashboardSummaryResponse>("/dashboard/me");
}

export async function getHrDashboardSummary() {
  return apiFetch<HrDashboardSummaryResponse>("/hr/dashboard-summary");
}

/** เงินเดือน/ภาษี/ประกันสังคมของหน้า Dashboard HR — ต้องมีสิทธิ์ PAYROLL_READ */
export async function getHrDashboardPayrollSummary(year?: number) {
  return apiFetch<HrPayrollSummaryResponse>(
    `/hr/dashboard-payroll-summary${buildQueryString(year ? { year } : undefined)}`,
  );
}

export async function getPayrollDashboardSummary(
  params?: PayrollDashboardFilterParams,
) {
  return apiFetch<PayrollDashboardSummaryResponse>(
    `/payroll/dashboard-summary${buildQueryString(params)}`,
  );
}

/** ใครมา ใครลา ใครสายวันนี้ รายคน */
export async function getExecutiveAttendanceToday(params?: {
  departmentId?: string;
  branchId?: string;
  status?: string;
}) {
  return apiFetch<ExecutiveAttendanceTodayResponse>(
    `/executive/attendance-today${buildQueryString(params)}`,
  );
}

/** ตัวชี้วัดระดับผู้บริหาร (อัตราส่วน/ต่อหัว/รายแผนก) */
export async function getExecutiveInsights() {
  return apiFetch<ExecutiveInsightsResponse>("/executive/insights");
}

export async function getExecutiveDashboardSummary() {
  return apiFetch<ExecutiveDashboardSummaryResponse>(
    "/executive/dashboard-summary",
  );
}

export async function getAdminDashboardSummary() {
  return apiFetch<AdminDashboardSummaryResponse>("/admin/dashboard-summary");
}

type NotificationStreamHandlers = {
  onEvent: (event: NotificationRealtimeEvent) => void;
  onError?: (error?: unknown) => void;
};

const NOTIFICATION_STREAM_RETRY_BASE_MS = 3_000;
const NOTIFICATION_STREAM_RETRY_MAX_MS = 30_000;

function isExpectedNotificationStreamDisconnect(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();

    return (
      message.includes("failed to fetch") ||
      message.includes("load failed") ||
      message.includes("networkerror") ||
      message.includes("connection") ||
      message.includes("reset")
    );
  }

  return false;
}

function parseNotificationStreamChunk(chunk: string) {
  const dataLines = chunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}

export function openNotificationStream(
  handlers: NotificationStreamHandlers,
): NotificationStreamSubscription {
  const controller = new AbortController();
  let retryTimerId: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  function clearRetryTimer() {
    if (retryTimerId) {
      clearTimeout(retryTimerId);
      retryTimerId = null;
    }
  }

  function scheduleReconnect() {
    if (controller.signal.aborted || retryTimerId) {
      return;
    }

    const delay = Math.min(
      NOTIFICATION_STREAM_RETRY_BASE_MS * 2 ** retryCount,
      NOTIFICATION_STREAM_RETRY_MAX_MS,
    );

    retryCount += 1;
    retryTimerId = setTimeout(() => {
      retryTimerId = null;
      void runStream();
    }, delay);
  }

  async function runStream() {
    try {
      const headers = createHeaders({
        headers: {
          Accept: "text/event-stream",
        },
      });

      const response = await fetch(`${API_BASE_URL}/notifications/stream`, {
        method: "GET",
        headers,
        credentials: "include",
        signal: controller.signal,
      });

      /*
       * SSE เปิดค้างไว้ตลอดเวลาที่ผู้ใช้เปิดหน้าเว็บ จึงเป็นตัวแรกที่เจอ token
       * หมดอายุ ถ้าเด้ง logout ทันทีผู้ใช้จะถูกไล่ออกทั้งที่ยังไม่ได้ทำอะไรเลย
       * ต่ออายุแล้วต่อสายใหม่ผ่านกลไก retry เดิม
       */
      if (response.status === 401) {
        const refreshed = await refreshAccessToken();

        if (refreshed) {
          scheduleReconnect();
          return;
        }

        forceLogoutClient("UNAUTHORIZED");
        return;
      }

      if (!response.ok || !response.body) {
        throw new ApiClientError({
          message: "ไม่สามารถเปิด realtime แจ้งเตือนได้",
          code: "NOTIFICATION_STREAM_ERROR",
          status: response.status,
        });
      }

      retryCount = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        chunks.forEach((chunk) => {
          const data = parseNotificationStreamChunk(chunk);

          if (!data) {
            return;
          }

          try {
            handlers.onEvent(JSON.parse(data) as NotificationRealtimeEvent);
          } catch {
            // ข้าม event ที่ parse ไม่ได้ โดยไม่ทำให้ stream หลักล่ม
          }
        });
      }

      if (!controller.signal.aborted) {
        scheduleReconnect();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      if (!isExpectedNotificationStreamDisconnect(error)) {
        handlers.onError?.(error);
      }

      scheduleReconnect();
    }
  }

  void runStream();

  return {
    close: () => {
      clearRetryTimer();
      controller.abort();
    },
  };
}

export async function getNotificationSummary() {
  return apiFetch<NotificationSummaryResponse>("/notifications/summary");
}

export async function getNotificationInbox() {
  return apiFetch<NotificationInboxResponse>("/notifications/inbox");
}

export async function getNotifications(params: NotificationListParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.status && params.status !== "all") {
    searchParams.set("status", params.status);
  }

  if (params.page) {
    searchParams.set("page", String(params.page));
  }

  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }

  const queryString = searchParams.toString();

  return apiFetch<NotificationListResponse>(
    `/notifications${queryString ? `?${queryString}` : ""}`,
  );
}

export async function markNotificationRead(id: string) {
  return apiFetch<MarkNotificationReadResponse>(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsRead() {
  return apiFetch<MarkAllNotificationsReadResponse>("/notifications/read-all", {
    method: "PATCH",
  });
}

/* =========================================================
   PUBLIC FILE URL HELPER
   ---------------------------------------------------------
   ใช้แปลง path ของไฟล์ public เช่น avatar ให้เป็น URL เต็ม
========================================================= */

export function getPublicFileUrl(path?: string | null) {
  if (!path) return "";

  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }

  const apiOrigin = new URL(API_BASE_URL).origin;

  if (path.startsWith("/")) {
    return `${apiOrigin}${path}`;
  }

  return `${apiOrigin}/${path}`;
}

/* =========================================================
   PROFILE API
   ---------------------------------------------------------
   ใช้กับข้อมูลโปรไฟล์ผู้ใช้งานปัจจุบัน
   - Get / Update Profile
   - Upload / Delete Avatar
========================================================= */

export async function getMyProfile() {
  return apiFetch<MyProfileResponse>("/profile/me");
}

export async function updateMyProfile(payload: UpdateMyProfilePayload) {
  return apiFetch<MyProfileResponse>("/profile/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadMyAvatar(file: File) {
  const formData = new FormData();
  formData.set("avatar", file);

  return apiFetch<MyProfileResponse>("/profile/me/avatar", {
    method: "POST",
    body: formData,
  });
}

export async function deleteMyAvatar() {
  return apiFetch<MyProfileResponse>("/profile/me/avatar", {
    method: "DELETE",
  });
}

/* =========================================================
   MY REQUESTS API
   ---------------------------------------------------------
   ใช้กับรายการคำขอของผู้ใช้งานปัจจุบัน
   - My Leave Requests
   - My Overtime Requests
   - My Time Adjust Requests
   - My Attachments
========================================================= */

export async function getMyLeaveRequests(
  params?: Omit<LeaveRequestListParams, "employeeId">,
) {
  return apiFetch<LeaveRequestListResponse>(
    `/leaves/requests/my${buildQueryString(params)}`,
  );
}

export async function getMyLeaveRequest(id: string) {
  return apiFetch<LeaveRequest>(`/leaves/requests/my/${id}`);
}

export async function updateMyLeaveRequest(
  id: string,
  payload: UpdateLeaveRequestForm,
) {
  return apiFetch<LeaveRequest>(`/leaves/requests/my/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitMyLeaveRequest(id: string) {
  return apiFetch<LeaveRequest>(`/leaves/requests/my/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelMyLeaveRequest(
  id: string,
  payload: LeaveRequestActionForm = {},
) {
  return apiFetch<LeaveRequest>(`/leaves/requests/my/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getMyOvertimeRequests(
  params?: Omit<OvertimeRequestListParams, "employeeId">,
) {
  return apiFetch<OvertimeRequestListResponse>(
    `/overtime/requests/my${buildQueryString(params)}`,
  );
}

export async function getMyOvertimeRequest(id: string) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/my/${id}`);
}

export async function updateMyOvertimeRequest(
  id: string,
  payload: UpdateOvertimeRequestForm,
) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/my/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitMyOvertimeRequest(id: string) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/my/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelMyOvertimeRequest(
  id: string,
  payload: OvertimeRequestActionForm = {},
) {
  return apiFetch<OvertimeRequest>(`/overtime/requests/my/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getMyOvertimeAttachments(overtimeRequestId: string) {
  return apiFetch<OvertimeAttachment[]>(
    `/overtime/requests/my/${overtimeRequestId}/attachments`,
  );
}

export async function uploadMyOvertimeAttachment(
  overtimeRequestId: string,
  payload: FormData,
) {
  return apiFetch<OvertimeAttachment>(
    `/overtime/requests/my/${overtimeRequestId}/attachments/upload`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function downloadMyOvertimeAttachment(
  overtimeRequestId: string,
  attachmentId: string,
) {
  return apiFetchBlob(
    `/overtime/requests/my/${overtimeRequestId}/attachments/${attachmentId}/download`,
  );
}

export async function deleteMyOvertimeAttachment(
  overtimeRequestId: string,
  attachmentId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/overtime/requests/my/${overtimeRequestId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  );
}

export async function getMyTimeAdjustRequests(
  params?: TimeAdjustRequestListParams,
) {
  return apiFetch<TimeAdjustRequestListResponse>(
    `/time-adjust/requests/my${buildQueryString(params)}`,
  );
}

export async function getMyTimeAdjustRequest(id: string) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/my/${id}`);
}

export async function createMyTimeAdjustRequest(
  payload: CreateTimeAdjustRequestForm,
) {
  return apiFetch<TimeAdjustRequest>("/time-adjust/requests/my", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMyTimeAdjustRequest(
  id: string,
  payload: UpdateTimeAdjustRequestForm,
) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/my/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitMyTimeAdjustRequest(id: string) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/my/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelMyTimeAdjustRequest(
  id: string,
  payload: TimeAdjustRequestActionForm = {},
) {
  return apiFetch<TimeAdjustRequest>(`/time-adjust/requests/my/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getMyTimeAdjustAttachments(timeAdjustRequestId: string) {
  return apiFetch<TimeAdjustAttachment[]>(
    `/time-adjust/requests/my/${timeAdjustRequestId}/attachments`,
  );
}

export async function uploadMyTimeAdjustAttachment(
  timeAdjustRequestId: string,
  payload: FormData,
) {
  return apiFetch<TimeAdjustAttachment>(
    `/time-adjust/requests/my/${timeAdjustRequestId}/attachments/upload`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function downloadMyTimeAdjustAttachment(
  timeAdjustRequestId: string,
  attachmentId: string,
) {
  return apiFetchBlob(
    `/time-adjust/requests/my/${timeAdjustRequestId}/attachments/${attachmentId}/download`,
  );
}

export async function deleteMyTimeAdjustAttachment(
  timeAdjustRequestId: string,
  attachmentId: string,
) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/time-adjust/requests/my/${timeAdjustRequestId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  );
}

export async function getMyTimeAdjustAttendanceLogs(
  params?: TimeAdjustAttendanceLogListParams,
) {
  return apiFetch<TimeAdjustAttendanceLogListResponse>(
    `/time-adjust/requests/my/attendance-logs${buildQueryString(params)}`,
  );
}

/* =========================================================
   ESS SELF-SERVICE EDIT / DELETE ALIASES
   ---------------------------------------------------------
   ใช้กับหน้า /ess/requests/* ที่ import ชื่อฟังก์ชันกลุ่ม Ess*
   เพื่อให้ชื่อ function ตรงกับหน้าจอและ build ผ่าน
========================================================= */

export async function updateEssLeaveRequest(
  id: string,
  payload: Partial<CreateEssLeaveRequestForm>,
) {
  return apiFetch<EssLeaveRequest>(
    `/ess/leave-requests/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteEssLeaveRequest(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/ess/leave-requests/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function updateEssOvertimeRequest(
  id: string,
  payload: Partial<CreateEssOvertimeRequestForm>,
) {
  return apiFetch<EssOvertimeRequest>(
    `/ess/overtime-requests/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteEssOvertimeRequest(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/ess/overtime-requests/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function updateEssTimeAdjustRequest(
  id: string,
  payload: Partial<CreateEssTimeAdjustRequestForm>,
) {
  return apiFetch<EssTimeAdjustRequest>(
    `/ess/time-adjust-requests/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteEssTimeAdjustRequest(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/ess/time-adjust-requests/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function updateMyOffsiteWorkRequest(
  id: string,
  payload: UpdateOffsiteWorkRequestForm,
) {
  return apiFetch<OffsiteWorkRequest>(
    `/offsite-work/requests/my/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteMyOffsiteWorkRequest(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/offsite-work/requests/my/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}



/* =========================================================
   PAYROLL TAX API - PHASE 1A
   ---------------------------------------------------------
   ใช้กับหน้า /payroll/tax สำหรับวางฐานข้อมูลภาษีหัก ณ ที่จ่าย
   ยังไม่ผูก Tax Engine เข้ากับ Payroll Run จริง
========================================================= */

export async function getPayrollTaxOverview(companyId?: string) {
  return apiFetch<PayrollTaxOverview>(
    `/payroll/tax/overview${buildQueryString({ companyId })}`,
  );
}



export async function getPayrollTaxProfileCoverage(
  params?: PayrollListParams & { taxYearId?: string; status?: string },
): Promise<PayrollTaxProfileCoverageResponse> {
  const result = await apiFetchWithMeta<
    PayrollTaxProfileCoverageResponse["data"],
    PayrollPageMeta,
    PayrollTaxProfileCoverageResponse["summary"]
  >(`/payroll/tax/profile-coverage${buildQueryString(params)}`);
  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
    summary: result.summary ?? {
      totalEmployees: result.data.length,
      taxEnabledEmployees: result.data.filter((item) => item.taxEnabled).length,
      taxDisabledEmployees: result.data.filter((item) => !item.taxEnabled).length,
      employeesWithAllowance: result.data.filter((item) => item.taxStatus === "HAS_ALLOWANCE").length,
      employeesUsingDefaultOnly: result.data.filter((item) => item.taxStatus === "DEFAULT_ONLY").length,
      noTaxYearEmployees: result.data.filter((item) => item.taxStatus === "NO_TAX_YEAR").length,
      taxYearId: null,
      taxYearName: null,
      taxYear: null,
    },
    taxYear: (result as unknown as PayrollTaxProfileCoverageResponse).taxYear ?? null,
  };
}

export async function getPayrollTaxYears(
  params?: PayrollListParams,
): Promise<PayrollTaxYearsResponse> {
  const result = await apiFetchWithMeta<PayrollTaxYear[], PayrollPageMeta>(
    `/payroll/tax/years${buildQueryString(params)}`,
  );
  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
  };
}

export async function getPayrollTaxYear(id: string) {
  return apiFetch<PayrollTaxYear>(`/payroll/tax/years/${encodeURIComponent(id)}`);
}

export async function createPayrollTaxYear(payload: CreatePayrollTaxYearPayload) {
  return apiFetch<PayrollTaxYear>("/payroll/tax/years", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePayrollTaxYear(
  id: string,
  payload: UpdatePayrollTaxYearPayload,
) {
  return apiFetch<PayrollTaxYear>(`/payroll/tax/years/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deletePayrollTaxYear(id: string) {
  return apiFetch<PayrollTaxYear>(`/payroll/tax/years/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getPayrollTaxBrackets(params?: { taxYearId?: string }) {
  return apiFetch<PayrollTaxBracket[]>(
    `/payroll/tax/brackets${buildQueryString(params)}`,
  );
}

export async function createPayrollTaxBracket(
  payload: CreatePayrollTaxBracketPayload,
) {
  return apiFetch<PayrollTaxBracket>("/payroll/tax/brackets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePayrollTaxBracket(
  id: string,
  payload: UpdatePayrollTaxBracketPayload,
) {
  return apiFetch<PayrollTaxBracket>(
    `/payroll/tax/brackets/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deletePayrollTaxBracket(id: string) {
  return apiFetch<PayrollTaxBracket>(
    `/payroll/tax/brackets/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function getPayrollTaxAllowanceTypes(params?: {
  taxYearId?: string;
  q?: string;
  status?: string;
}) {
  return apiFetch<PayrollTaxAllowanceType[]>(
    `/payroll/tax/allowance-types${buildQueryString(params)}`,
  );
}

export async function createPayrollTaxAllowanceType(
  payload: CreatePayrollTaxAllowanceTypePayload,
) {
  return apiFetch<PayrollTaxAllowanceType>("/payroll/tax/allowance-types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePayrollTaxAllowanceType(
  id: string,
  payload: UpdatePayrollTaxAllowanceTypePayload,
) {
  return apiFetch<PayrollTaxAllowanceType>(
    `/payroll/tax/allowance-types/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deletePayrollTaxAllowanceType(id: string) {
  return apiFetch<PayrollTaxAllowanceType>(
    `/payroll/tax/allowance-types/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function getEmployeeTaxProfiles(
  params?: PayrollListParams & { taxYearId?: string },
): Promise<EmployeeTaxProfilesResponse> {
  const result = await apiFetchWithMeta<
    EmployeeTaxProfile[],
    PayrollPageMeta,
    EmployeeTaxProfilesResponse["summary"]
  >(`/payroll/tax/profiles${buildQueryString(params)}`);
  return {
    data: result.data,
    meta: result.meta ?? {
      page: Number(params?.page ?? 1),
      pageSize: Number(params?.pageSize ?? 20),
      total: result.data.length,
      totalPages: 1,
    },
    summary: result.summary,
  };
}

export async function getEmployeeTaxProfile(id: string) {
  return apiFetch<EmployeeTaxProfile>(
    `/payroll/tax/profiles/${encodeURIComponent(id)}`,
  );
}

export async function createEmployeeTaxProfile(
  payload: CreateEmployeeTaxProfilePayload,
) {
  return apiFetch<EmployeeTaxProfile>("/payroll/tax/profiles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEmployeeTaxProfile(
  id: string,
  payload: UpdateEmployeeTaxProfilePayload,
) {
  return apiFetch<EmployeeTaxProfile>(
    `/payroll/tax/profiles/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

/** ยกค่าลดหย่อนของทั้งบริษัทจากปีภาษีก่อนหน้ามาตั้งต้นปีใหม่ */
export async function copyEmployeeTaxProfiles(
  payload: CopyEmployeeTaxProfilesPayload,
) {
  return apiFetch<CopyEmployeeTaxProfilesResult>(
    "/payroll/tax/profiles/copy",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteEmployeeTaxProfile(id: string) {
  return apiFetch<EmployeeTaxProfile>(
    `/payroll/tax/profiles/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function upsertEmployeeTaxAllowance(
  profileId: string,
  payload: UpsertEmployeeTaxAllowancePayload,
) {
  return apiFetch<EmployeeTaxProfile>(
    `/payroll/tax/profiles/${encodeURIComponent(profileId)}/allowances`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateEmployeeTaxAllowance(
  id: string,
  payload: UpdateEmployeeTaxAllowancePayload,
) {
  return apiFetch<EmployeeTaxProfile>(
    `/payroll/tax/allowances/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteEmployeeTaxAllowance(id: string) {
  return apiFetch<EmployeeTaxProfile>(
    `/payroll/tax/allowances/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}



export async function getPayrollTaxMonthlyReport(
  params?: PayrollTaxReportQuery,
): Promise<PayrollTaxMonthlyReportResponse> {
  const result = await apiFetchWithMeta<
    PayrollTaxMonthlyReportResponse["data"],
    unknown,
    PayrollTaxMonthlyReportResponse["summary"]
  >(`/payroll/tax/reports/monthly${buildQueryString(params)}`);

  const rows = result.data ?? [];

  return {
    data: rows,
    summary: result.summary ?? {
      reportType: "MONTHLY",
      companyId: params?.companyId ?? null,
      taxYearId: params?.taxYearId ?? null,
      payrollRunId: params?.payrollRunId ?? null,
      month: params?.month ?? null,
      year: params?.year ?? null,
      employeeCount: rows.length,
      totalTaxableIncome: "0",
      totalAllowance: "0",
      totalNetTaxableIncome: "0",
      totalTaxWithheld: "0",
    },
  };
}

export async function getPayrollTaxAnnualReport(
  params?: PayrollTaxReportQuery,
): Promise<PayrollTaxAnnualReportResponse> {
  const result = await apiFetchWithMeta<
    PayrollTaxAnnualReportResponse["data"],
    unknown,
    PayrollTaxAnnualReportResponse["summary"]
  >(`/payroll/tax/reports/annual${buildQueryString(params)}`);

  const rows = result.data ?? [];

  return {
    data: rows,
    summary: result.summary ?? {
      reportType: "ANNUAL",
      companyId: params?.companyId ?? null,
      taxYearId: params?.taxYearId ?? null,
      taxYear: null,
      employeeCount: rows.length,
      totalTaxableIncome: "0",
      totalTaxWithheld: "0",
    },
  };
}


export async function getPayrollTaxPnd1Report(
  params?: PayrollTaxReportQuery,
): Promise<PayrollTaxPnd1ReportResponse> {
  const result = await apiFetchWithMeta<
    PayrollTaxPnd1ReportResponse["data"],
    unknown,
    PayrollTaxPnd1ReportResponse["summary"]
  >(`/payroll/tax/reports/pnd1${buildQueryString(params)}`);

  const rows = result.data ?? [];

  return {
    data: rows,
    summary: result.summary ?? {
      reportType: "PND1",
      companyId: params?.companyId ?? null,
      taxYearId: params?.taxYearId ?? null,
      month: params?.month ?? null,
      year: params?.year ?? null,
      employeeCount: rows.length,
      totalPaidAmount: "0",
      totalTaxWithheld: "0",
    },
  };
}

export async function getPayrollTaxPnd1AReport(
  params?: PayrollTaxReportQuery,
): Promise<PayrollTaxPnd1AReportResponse> {
  const result = await apiFetchWithMeta<
    PayrollTaxPnd1AReportResponse["data"],
    unknown,
    PayrollTaxPnd1AReportResponse["summary"]
  >(`/payroll/tax/reports/pnd1a${buildQueryString(params)}`);

  const rows = result.data ?? [];

  return {
    data: rows,
    summary: result.summary ?? {
      reportType: "PND1A",
      companyId: params?.companyId ?? null,
      taxYearId: params?.taxYearId ?? null,
      taxYear: null,
      employeeCount: rows.length,
      totalPaidAmount: "0",
      totalTaxWithheld: "0",
    },
  };
}

export async function getPayrollTaxPnd1ADetail(
  employeeId: string,
  params?: PayrollTaxReportQuery,
) {
  return apiFetch<PayrollTaxPnd1ADetailResponse>(
    `/payroll/tax/reports/pnd1a/detail/${encodeURIComponent(employeeId)}${buildQueryString(params)}`,
  );
}

/** ร่าง 50 ทวิ ของพนักงานที่ล็อกอินอยู่ (ESS) */
export async function getMyWithholdingCertificate(params?: { year?: number }) {
  return apiFetch<PayrollTaxWithholdingCertificateDraft>(
    `/ess/salary-slips/tax-certificate${buildQueryString(params)}`,
  );
}

export async function getPayrollTaxWithholdingCertificateDraft(
  employeeId: string,
  params?: PayrollTaxReportQuery,
) {
  return apiFetch<PayrollTaxWithholdingCertificateDraft>(
    `/payroll/tax/reports/withholding-certificate/${encodeURIComponent(employeeId)}${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxMonthlyReportCsv(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/monthly/export${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxAnnualReportCsv(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/annual/export${buildQueryString(params)}`,
  );
}


export async function downloadPayrollTaxPnd1ReportCsv(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1/export${buildQueryString(params)}`,
  );
}

/**
 * แบบ ภ.ง.ด.1 สามรูปแบบสำหรับยื่นจริง
 *
 *   form-pdf   แบบพิมพ์ราชการ หน้าปก + ใบแนบ
 *   form-xlsx  ตารางไว้ตรวจก่อนยื่น
 *   e-filing   ไฟล์นำส่งระบบ e-Filing (คั่นด้วย | เข้ารหัส UTF-8)
 */
export async function downloadPayrollTaxPnd1FormPdf(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1/form-pdf${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxPnd1FormXlsx(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1/form-xlsx${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxPnd1FilingFile(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1/e-filing${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxPnd1AReportCsv(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1a/export${buildQueryString(params)}`,
  );
}

/* ---------------- ภาษีหัก ณ ที่จ่ายของผู้รับเงินที่ไม่ใช่ลูกจ้าง (ภ.ง.ด.3) ---------------- */

export type WithholdingIncomeType = {
  code: string;
  label: string;
  defaultRate: number;
  section: string;
  /** ข้อควรระวังของประเภทนี้ เช่น อัตราต่างกันตามชนิดผู้รับเงิน */
  note?: string;
};

export type WithholdingPayee = {
  id: string;
  companyId: string;
  type: "INDIVIDUAL" | "JURISTIC";
  taxId: string;
  branchNo: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  note: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export type WithholdingPayment = {
  id: string;
  companyId: string;
  payeeId: string;
  paidOn: string;
  incomeTypeCode: string;
  incomeTypeLabel: string;
  taxRatePercent: string;
  amount: string;
  taxAmount: string;
  condition: "WITHHELD" | "PAID_ALWAYS" | "PAID_ONCE";
  reference: string | null;
  note: string | null;
  payee: WithholdingPayee;
};

/*
 * สามเส้นนี้ต้องอ่านผลลัพธ์ให้ตรงกับ ResponseInterceptor ของ backend
 * -----------------------------------------------------------------------------
 * service คืน { data, summary } แล้ว interceptor "แบน" ออกมาเป็น
 *   { success, data, meta, summary, requestId }
 * ดังนั้น apiFetch (ที่คืน payload.data) จึงได้ "อาร์เรย์" มาตรง ๆ ไม่ใช่ { data }
 * และ summary ไปอยู่ชั้นซองซึ่ง apiFetch มองไม่เห็น ต้องใช้ apiFetchWithMeta
 *
 * ของเดิมประกาศเป็น { data: ... } ผลคือ .data เป็น undefined ทุกครั้ง
 * ทะเบียนผู้รับเงินเลยว่างตลอดแม้บันทึกลงฐานข้อมูลสำเร็จ
 */
export async function fetchWithholdingIncomeTypes() {
  return apiFetch<WithholdingIncomeType[]>("/withholding/income-types");
}

export async function fetchWithholdingPayees(params?: {
  companyId?: string;
  search?: string;
}) {
  return apiFetch<WithholdingPayee[]>(
    `/withholding/payees${buildQueryString(params)}`,
  );
}

export async function createWithholdingPayee(payload: Record<string, unknown>) {
  return apiFetch<WithholdingPayee>("/withholding/payees", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWithholdingPayee(
  id: string,
  payload: Record<string, unknown>,
) {
  return apiFetch<WithholdingPayee>(`/withholding/payees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteWithholdingPayee(id: string) {
  return apiFetch<WithholdingPayee>(`/withholding/payees/${id}`, {
    method: "DELETE",
  });
}

export type WithholdingPaymentSummary = {
  count: number;
  amount: number;
  taxAmount: number;
};

export async function fetchWithholdingPayments(params?: {
  companyId?: string;
  year?: number;
  month?: number;
  search?: string;
}) {
  return apiFetchWithMeta<
    WithholdingPayment[],
    unknown,
    WithholdingPaymentSummary
  >(`/withholding/payments${buildQueryString(params)}`);
}

export async function createWithholdingPayment(
  payload: Record<string, unknown>,
) {
  return apiFetch<WithholdingPayment>("/withholding/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWithholdingPayment(
  id: string,
  payload: Record<string, unknown>,
) {
  return apiFetch<WithholdingPayment>(`/withholding/payments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteWithholdingPayment(id: string) {
  return apiFetch<WithholdingPayment>(`/withholding/payments/${id}`, {
    method: "DELETE",
  });
}

/** แบบพิมพ์ ภ.ง.ด.3 — หน้าปก + ใบแนบ (แนวนอน 6 บรรทัด/แผ่น) */
export async function downloadPnd3FormPdf(params?: {
  companyId?: string;
  year?: number;
  month?: number;
  issueDate?: string;
}) {
  return apiFetchBlob(`/withholding/pnd3/form-pdf${buildQueryString(params)}`);
}

export async function downloadPnd3TableCsv(params?: {
  companyId?: string;
  year?: number;
  month?: number;
}) {
  return apiFetchBlob(`/withholding/pnd3/table-csv${buildQueryString(params)}`);
}

/**
 * ตาราง CSV ของแบบ ภ.ง.ด.1 / ภ.ง.ด.1ก
 * คอลัมน์เรียงตามช่องบนแบบพิมพ์ และมาจากข้อมูลชุดเดียวกับ PDF ใช้ตรวจก่อนยื่น
 */
export async function downloadPayrollTaxPnd1TableCsv(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1/table-csv${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxPnd1aTableCsv(
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1a/table-csv${buildQueryString(params)}`,
  );
}

/**
 * เอกสาร ภ.ง.ด.1ก สามใบสำหรับยื่นจริง
 *
 * issueDate = วันที่ออกเอกสาร (yyyy-MM-dd ค.ศ.) ที่ผู้ใช้เลือกในกล่องก่อนดาวน์โหลด
 * ไม่ส่ง = ไม่ระบุ แบบฟอร์มจะเว้นช่องวันที่ไว้
 */
export async function downloadPayrollTaxPnd1aSummaryPdf(
  params?: PayrollTaxReportQuery & { issueDate?: string },
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1a/summary-pdf${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxPnd1aAttachmentPdf(
  params?: PayrollTaxReportQuery & { issueDate?: string },
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1a/attachment-pdf${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxPnd1aCertificatePdf(
  params?: PayrollTaxReportQuery & { issueDate?: string },
) {
  return apiFetchBlob(
    `/payroll/tax/reports/pnd1a/certificate-pdf${buildQueryString(params)}`,
  );
}

export async function downloadPayrollTaxWithholdingCertificateCsv(
  employeeId: string,
  params?: PayrollTaxReportQuery,
) {
  return apiFetchBlob(
    `/payroll/tax/reports/withholding-certificate/${encodeURIComponent(employeeId)}/export${buildQueryString(params)}`,
  );
}

export async function previewEmployeePayrollTax(
  payload: PayrollTaxPreviewPayload,
) {
  return apiFetch<PayrollTaxEmployeePreview>("/payroll/tax/calculate-preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function previewPayrollRunTax(
  runId: string,
  payload: PayrollRunTaxPreviewPayload = {},
) {
  return apiFetch<PayrollRunTaxPreviewResponse>(
    `/payroll/runs/${encodeURIComponent(runId)}/tax-preview`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/* =========================================================
   TRASH / RECYCLE BIN
   ========================================================= */

export async function getTrashSummary(params?: TrashListParams) {
  return apiFetch<TrashSummary>(`/trash/summary${buildQueryString(params)}`);
}

export async function getTrashItems(params?: TrashListParams): Promise<TrashListResponse> {
  const result = await apiFetchWithMeta<
    TrashListResponse["data"],
    TrashListResponse["meta"],
    TrashListResponse["summary"]
  >(`/trash/items${buildQueryString(params)}`);

  return {
    data: result.data ?? [],
    meta: result.meta,
    summary: result.summary,
  };
}

export async function restoreTrashItem(type: string, id: string) {
  return apiFetch<TrashActionResponse>(
    `/trash/items/${encodeURIComponent(type)}/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}

export async function permanentlyDeleteTrashItem(type: string, id: string) {
  return apiFetch<TrashActionResponse>(
    `/trash/items/${encodeURIComponent(type)}/${encodeURIComponent(id)}/permanent`,
    { method: "DELETE" },
  );
}

/* =========================================================
   OFFBOARDING API
   ---------------------------------------------------------
   กระบวนการพนักงานออกจากงาน
   - Checklist (แม่แบบรายการคืนของ)
   - Case (เคสรายคน)
   - Task (รายการเคลียร์ของ)
   - Exit interview
========================================================= */

export async function getOffboardingChecklists(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  status?: MasterStatus | "";
}) {
  return apiFetch<{
    items: OffboardingChecklist[];
    meta: OffboardingListMeta;
    summary?: OffboardingChecklistListSummary;
  }>(`/offboarding/checklists${buildQueryString(params)}`);
}

export async function createOffboardingChecklist(
  payload: CreateOffboardingChecklistForm,
) {
  return apiFetch<OffboardingChecklist>("/offboarding/checklists", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOffboardingChecklist(
  id: string,
  payload: Partial<CreateOffboardingChecklistForm>,
) {
  return apiFetch<OffboardingChecklist>(`/offboarding/checklists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteOffboardingChecklist(id: string) {
  return apiFetch<{ success: boolean }>(`/offboarding/checklists/${id}`, {
    method: "DELETE",
  });
}

export async function getOffboardingCases(params?: OffboardingCaseListParams) {
  return apiFetch<{
    items: OffboardingCase[];
    meta: OffboardingListMeta;
    summary?: OffboardingCaseListSummary;
  }>(`/offboarding/cases${buildQueryString(params)}`);
}

export async function getOffboardingCase(id: string) {
  return apiFetch<OffboardingCase>(`/offboarding/cases/${id}`);
}

export async function createOffboardingCase(
  payload: CreateOffboardingCaseForm,
) {
  return apiFetch<OffboardingCase>("/offboarding/cases", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOffboardingCase(
  id: string,
  payload: UpdateOffboardingCaseForm,
) {
  return apiFetch<OffboardingCase>(`/offboarding/cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function revokeOffboardingAccess(id: string) {
  return apiFetch<OffboardingCase>(`/offboarding/cases/${id}/revoke-access`, {
    method: "POST",
  });
}

/** คำนวณค่าชดเชย + ภาษีเงินก้อน แล้วบันทึกผลลงใบ (กดซ้ำได้) */
export async function calculateOffboardingSeverance(id: string) {
  return apiFetch<SeveranceQuote>(
    `/offboarding/cases/${id}/calculate-severance`,
    { method: "POST" },
  );
}

/** ส่งเงินงวดสุดท้ายเข้างวดเงินเดือนที่ครอบวันพ้นสภาพ */
export async function sendOffboardingFinalPayToPayroll(id: string) {
  return apiFetch<{
    period: { id: string; code?: string | null; name?: string | null } | null;
    adjustmentCount: number;
    totalEarning: number;
    separateTax: number;
  }>(`/offboarding/cases/${id}/send-final-pay-to-payroll`, { method: "POST" });
}

export async function stopOffboardingPayroll(id: string) {
  return apiFetch<OffboardingCase>(`/offboarding/cases/${id}/stop-payroll`, {
    method: "POST",
  });
}

export async function notifyOffboardingSocialSecurity(id: string) {
  return apiFetch<OffboardingCase>(
    `/offboarding/cases/${id}/notify-social-security`,
    { method: "POST" },
  );
}

export async function completeOffboardingCase(id: string, note?: string) {
  return apiFetch<OffboardingCase>(`/offboarding/cases/${id}/complete`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function cancelOffboardingCase(id: string, note?: string) {
  return apiFetch<OffboardingCase>(`/offboarding/cases/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function createOffboardingTask(
  payload: CreateOffboardingTaskForm,
) {
  return apiFetch<OffboardingTask>("/offboarding/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function actOnOffboardingTask(
  id: string,
  action: "start" | "complete" | "waive" | "cancel",
  note?: string,
) {
  return apiFetch<OffboardingTask>(`/offboarding/tasks/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function saveExitInterview(
  caseId: string,
  payload: SaveExitInterviewForm,
) {
  return apiFetch<ExitInterview>(
    `/offboarding/cases/${caseId}/exit-interview`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/* =========================================================
   RECRUITMENT / ATS API
   ---------------------------------------------------------
   ประกาศงาน -> ผู้สมัคร -> สัมภาษณ์ -> เสนอจ้าง -> จ้างเป็นพนักงาน
========================================================= */

export async function getJobPostings(params?: JobPostingListParams) {
  return apiFetch<{
    items: JobPosting[];
    meta: RecruitmentListMeta;
    summary?: JobPostingListSummary;
  }>(`/recruitment/postings${buildQueryString(params)}`);
}

export async function getJobPosting(id: string) {
  return apiFetch<JobPosting>(`/recruitment/postings/${id}`);
}

export async function createJobPosting(payload: CreateJobPostingForm) {
  return apiFetch<JobPosting>("/recruitment/postings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateJobPosting(
  id: string,
  payload: Partial<CreateJobPostingForm>,
) {
  return apiFetch<JobPosting>(`/recruitment/postings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteJobPosting(id: string) {
  return apiFetch<{ success: boolean }>(`/recruitment/postings/${id}`, {
    method: "DELETE",
  });
}

export async function getJobApplications(params?: JobApplicationListParams) {
  return apiFetch<{
    items: JobApplication[];
    meta: RecruitmentListMeta;
    summary?: JobApplicationListSummary;
  }>(`/recruitment/applications${buildQueryString(params)}`);
}

export async function getJobApplication(id: string) {
  return apiFetch<JobApplication>(`/recruitment/applications/${id}`);
}

export async function createJobApplication(
  payload: CreateJobApplicationForm,
) {
  return apiFetch<JobApplication>("/recruitment/applications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateJobApplication(
  id: string,
  payload: Partial<CreateJobApplicationForm> & { screeningScore?: number },
) {
  return apiFetch<JobApplication>(`/recruitment/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function moveJobApplicationStage(
  id: string,
  stage: JobApplicationStage,
  rejectReason?: string,
) {
  return apiFetch<JobApplication>(`/recruitment/applications/${id}/stage`, {
    method: "POST",
    body: JSON.stringify({ stage, rejectReason }),
  });
}

export async function hireJobApplicant(
  id: string,
  payload: HireApplicantForm = {},
) {
  return apiFetch<HireApplicantResult>(`/recruitment/applications/${id}/hire`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createJobInterview(payload: CreateJobInterviewForm) {
  return apiFetch<JobInterview>("/recruitment/interviews", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function recordJobInterviewResult(
  id: string,
  payload: RecordInterviewResultForm,
) {
  return apiFetch<JobInterview>(`/recruitment/interviews/${id}/result`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createJobOffer(payload: CreateJobOfferForm) {
  return apiFetch<JobOffer>("/recruitment/offers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateJobOfferStatus(
  id: string,
  status: JobOfferStatus,
  note?: string,
) {
  return apiFetch<JobOffer>(`/recruitment/offers/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  });
}

/* =========================================================
   Payroll Deduction Plan
   - แผนหักเงินเดือนแบบผ่อนงวด (กยศ. เงินกู้พนักงาน สหกรณ์)
   - การหักจริงเกิดตอนคำนวณ payroll run ไม่ได้เกิดจาก endpoint พวกนี้
========================================================= */

/**
 * รายการแผนหักผ่อนงวด
 *
 * ต้องใช้ apiFetchWithMeta ไม่ใช่ apiFetch
 * เพราะ backend ส่ง meta และ summary มาที่ระดับบนสุดของ envelope
 * ส่วน apiFetch คืนเฉพาะ data ทำให้สองก้อนนั้นหายไปทั้งหมด
 *
 * เคสที่เคยพัง: สร้างแผนหักสำเร็จแล้วแต่หน้าแสดง "ทั้งหมด 0" และตารางว่าง
 * เพราะหน้าอ่าน result.data / result.summary ซึ่งกลายเป็น undefined
 */
export async function getDeductionPlans(
  params?: DeductionPlanListParams,
): Promise<DeductionPlanListResponse> {
  const payload = await apiFetchWithMeta<
    DeductionPlanListResponse["data"],
    DeductionPlanListResponse["meta"],
    DeductionPlanListResponse["summary"]
  >(`/payroll/deduction-plans${buildQueryString(params)}`);

  return {
    data: payload.data ?? [],
    meta:
      payload.meta ?? { page: 1, pageSize: 0, total: 0, totalPages: 0 },
    summary:
      payload.summary ?? {
        total: 0,
        active: 0,
        completed: 0,
        suspended: 0,
        outstandingTotal: 0,
      },
  };
}

export async function getDeductionPlan(id: string) {
  return apiFetch<DeductionPlanDetail>(`/payroll/deduction-plans/${id}`);
}

export async function createDeductionPlan(payload: CreateDeductionPlanForm) {
  return apiFetch<DeductionPlan>("/payroll/deduction-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDeductionPlan(
  id: string,
  payload: UpdateDeductionPlanForm,
) {
  return apiFetch<DeductionPlan>(`/payroll/deduction-plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function suspendDeductionPlan(id: string, reason?: string) {
  return apiFetch<DeductionPlan>(`/payroll/deduction-plans/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function resumeDeductionPlan(id: string) {
  return apiFetch<DeductionPlan>(`/payroll/deduction-plans/${id}/resume`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelDeductionPlan(id: string, reason?: string) {
  return apiFetch<DeductionPlan>(`/payroll/deduction-plans/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function deleteDeductionPlan(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/payroll/deduction-plans/${id}`,
    { method: "DELETE" },
  );
}

/* =========================================================
   Payroll Filing Reports
   - รายงานนำส่งหน่วยงาน อ้างอิงจากรอบการจ่ายที่คำนวณแล้ว
   - สปส.1-10 / ไฟล์โอนธนาคาร / นำส่ง กยศ.
========================================================= */

export async function getSocialSecurityFilingReport(runId: string) {
  return apiFetch<SocialSecurityFilingReport>(
    `/payroll/runs/${runId}/filings/social-security`,
  );
}

export async function getBankTransferFilingReport(runId: string) {
  return apiFetch<BankTransferFilingReport>(
    `/payroll/runs/${runId}/filings/bank-transfer`,
  );
}

export async function getStudentLoanFilingReport(runId: string) {
  return apiFetch<StudentLoanFilingReport>(
    `/payroll/runs/${runId}/filings/student-loan`,
  );
}

/**
 * ดาวน์โหลดไฟล์นำส่งเป็น CSV
 *
 * ใช้ apiFetchBlob เพื่อให้แนบ token และจัดการ error เหมือน request อื่น
 * ชื่อไฟล์กำหนดฝั่ง client เพราะ header ภาษาไทยอ่านข้ามเบราว์เซอร์ไม่แน่นอน
 */
export async function downloadFilingReportCsv(
  runId: string,
  kind: FilingReportKind,
  fileName: string,
) {
  return downloadFilingFile(
    `/payroll/runs/${runId}/filings/${kind}/export`,
    fileName,
  );
}

/** ไฟล์นำส่งประกันสังคมสำหรับอัปโหลดเข้าระบบ e-Service (ข้อความความกว้างคงที่) */
export async function downloadSsoEFilingFile(runId: string, fileName: string) {
  return downloadFilingFile(
    `/payroll/runs/${runId}/filings/social-security/e-filing`,
    fileName,
  );
}

/** ไฟล์นำเข้าระบบจ่ายเงินเดือนของธนาคาร */
export async function downloadBankTransferFile(
  runId: string,
  format: BankTransferFormat,
  fileName: string,
) {
  return downloadFilingFile(
    `/payroll/runs/${runId}/filings/bank-transfer/file?format=${format}`,
    fileName,
  );
}

async function downloadFilingFile(path: string, fileName: string) {
  const blob = await apiFetchBlob(path);

  const url = window.URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.URL.revokeObjectURL(url);
  }

  return fileName;
}

/* ---------------------------------------------------------------- */
/* บันไดค่าชดเชย (พ.ร.บ.คุ้มครองแรงงาน ม.118)                        */
/* ---------------------------------------------------------------- */

export async function getSeveranceTiers(companyId: string) {
  return apiFetch<SeveranceTiersResponse>(
    `/payroll/severance/tiers?companyId=${encodeURIComponent(companyId)}`,
  );
}

export async function replaceSeveranceTiers(
  companyId: string,
  tiers: SeveranceTierInput[],
) {
  return apiFetch<{ companyId: string; savedCount: number }>(
    "/payroll/severance/tiers",
    {
      method: "PUT",
      body: JSON.stringify({ companyId, tiers }),
    },
  );
}

/* ---------------------------------------------------------------- */
/* นำเข้าข้อมูลจากไฟล์ Excel                                          */
/* ---------------------------------------------------------------- */

export async function getDataImportDatasets() {
  return apiFetch<DataImportDatasetInfo[]>("/data-import/datasets");
}

export async function getDataImports(params?: DataImportListParams) {
  return apiFetch<DataImportListResponse>(
    `/data-import${buildQueryString(params)}`,
  );
}

export async function getDataImport(id: string) {
  return apiFetch<DataImportHistoryItem>(
    `/data-import/${encodeURIComponent(id)}`,
  );
}

/** อัปโหลดไฟล์แล้วให้หลังบ้านอ่านโครงไฟล์ + พรีวิวรอบแรก */
export async function uploadDataImport(payload: UploadDataImportForm) {
  const formData = new FormData();

  formData.append("type", payload.type);
  formData.append("duplicateMode", payload.duplicateMode);
  formData.append("file", payload.file);

  return apiFetch<DataImportPreview>("/data-import/uploads", {
    method: "POST",
    body: formData,
  });
}

/** พรีวิวซ้ำหลังแก้การจับคู่คอลัมน์ — ยังไม่เขียนข้อมูลจริง */
export async function previewDataImport(id: string, payload: DataImportRunForm) {
  return apiFetch<DataImportPreview>(
    `/data-import/${encodeURIComponent(id)}/preview`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function commitDataImport(id: string, payload: DataImportRunForm) {
  return apiFetch<DataImportCommitResult>(
    `/data-import/${encodeURIComponent(id)}/commit`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function cancelDataImport(id: string) {
  return apiFetch<DataImportHistoryItem>(
    `/data-import/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

/* =========================================================
   โยกย้าย/ปรับตำแหน่ง (HR › โยกย้ายพนักงาน)
   ---------------------------------------------------------
   ใบโยกย้ายตั้งวันที่มีผลล่วงหน้าได้ ระบบจะอัปเดตทะเบียนพนักงานให้เอง
   เมื่อถึงวัน จึงไม่ต้องมีคนคอยจำแล้วกลับมาแก้ทะเบียนเองในวันนั้น
========================================================= */

export async function getEmployeeTransfers(params?: EmployeeTransferListParams) {
  return apiFetch<EmployeeTransferListResponse>(
    `/employee-transfers${buildQueryString(params)}`,
  );
}

export async function getEmployeeTransfer(id: string) {
  return apiFetch<EmployeeTransferItem>(
    `/employee-transfers/${encodeURIComponent(id)}`,
  );
}

export async function createEmployeeTransfer(
  payload: CreateEmployeeTransferPayload,
) {
  return apiFetch<EmployeeTransferItem>("/employee-transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelEmployeeTransfer(
  id: string,
  payload?: { cancelReason?: string },
) {
  return apiFetch<EmployeeTransferItem>(
    `/employee-transfers/${encodeURIComponent(id)}/cancel`,
    {
      method: "PATCH",
      body: JSON.stringify(payload ?? {}),
    },
  );
}

/** สั่งให้ใบที่ตั้งไว้มีผลทันที โดยไม่รอถึงวันที่กำหนด */
export async function applyEmployeeTransfer(id: string) {
  return apiFetch<EmployeeTransferItem>(
    `/employee-transfers/${encodeURIComponent(id)}/apply`,
    {
      method: "PATCH",
    },
  );
}
