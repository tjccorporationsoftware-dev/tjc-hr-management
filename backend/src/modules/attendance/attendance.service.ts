import { createHash } from "node:crypto";
import { employeeDisplayName } from "../../common/utils/employee-display-name.util";

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  AttendanceChannel,
  AuditAction,
  AttendanceEditAction,
  AttendanceLogStatus,
  AttendanceLogType,
  AttendanceReviewStatus,
  PayrollPeriodStatus,
  Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { assertNotReferenced } from "../../common/database/hard-delete.util";
import { applyOvertimeAmountRounding } from "../overtime/utils/overtime-amount.util";
import { pickOvertimePolicy } from "../overtime/utils/overtime-policy.util";
import {
  deductsWholeDayAbsence,
  resolveSalaryRates,
} from "../../common/utils/salary-rate.util";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";
import {
  assertBranchScopedWrite,
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
  tenantWhere,
} from "../../common/tenant/tenant-scope.util";
import {
  AttendanceCalculationEngineService,
  type EmployeeAttendanceExemption,
} from "./attendance-calculation-engine.service";
import { AttendanceSummaryQueueService } from "./attendance-summary-queue.service";
import { AttendanceRecalculationScopeService } from "./attendance-recalculation-scope.service";
import { AttendanceProgressService } from "./attendance-progress.service";
import {
  attachAttendanceReviewState,
  DEFAULT_LATE_REVIEW_THRESHOLD_MINUTES,
  resolveAttendanceReviewState,
} from "./attendance-review-reason.helper";
import { OffsiteLocationVerificationService } from "../offsite-work/offsite-location-verification.service";
import {
  AttendanceHolidayInfo,
  SystemSettingsService,
} from "../settings/system-settings.service";
import { CompanyPayrollSettingsService } from "../settings/company-payroll-settings.service";
import { AuditService } from "../audit/audit.service";

import { CheckAttendanceDto } from "./dto/check-attendance.dto";
import { CreateManualAttendanceLogDto } from "./dto/create-manual-attendance-log.dto";
import { ListAttendanceLogsQueryDto } from "./dto/list-attendance-logs-query.dto";
import { UpdateAttendanceLogDto } from "./dto/update-attendance-log.dto";
import { CancelAttendanceLogDto } from "./dto/cancel-attendance-log.dto";
import { CreateAttendanceLocationDto } from "./dto/create-attendance-location.dto";
import { UpdateAttendanceLocationDto } from "./dto/update-attendance-location.dto";
import { CreateAttendanceDeviceDto } from "./dto/create-attendance-device.dto";
import { UpdateAttendanceDeviceDto } from "./dto/update-attendance-device.dto";
import {
  CreateAttendanceDeviceEnrollmentDto,
  UpdateAttendanceDeviceEnrollmentDto,
} from "./dto/attendance-device-enrollment.dto";
import {
  AttendanceDevicePunchBatchDto,
  AttendanceDevicePunchItemDto,
} from "./dto/attendance-device-punch.dto";
import { PushDeviceEmployeesDto } from "./dto/push-device-employees.dto";
import {
  CreateAttendancePolicyDto,
  EffectiveAttendancePolicyQueryDto,
  ListAttendancePoliciesQueryDto,
  UpdateAttendancePolicyDto,
} from "./dto/attendance-policy.dto";
import {
  AssignEmployeeWorkShiftDto,
  ListEmployeeWorkShiftsQueryDto,
  UpdateEmployeeAttendanceExemptionDto,
} from "./dto/employee-work-shift.dto";
import {
  PunchAttendanceDto,
  PunchContextQueryDto,
} from "./dto/punch-attendance.dto";
import {
  ListAttendanceDailySummariesQueryDto,
  RecalculateAttendanceDailySummariesDto,
} from "./dto/attendance-daily-summary.dto";
import {
  AttendanceMonthlyReviewActionDto,
  AttendanceMonthlyReviewDetailQueryDto,
  AttendanceMonthlyReviewQueryDto,
  AttendanceMonthlyReviewScopeActionDto,
} from "./dto/attendance-monthly-review.dto";
import {
  AttendanceDailyReviewActionDto,
  BulkAttendanceDailyReviewActionDto,
} from "./dto/attendance-daily-review-action.dto";
import { UpdateMissingLogPenaltyWaiverDto } from "./dto/attendance-penalty-waiver.dto";
import {
  assertWorkDateNotLocked,
  checkWorkDateLocked,
} from './utils/attendance-lock.util';
import {
  isWithinRuleWindow,
  resolveShiftWindow,
  resolveWorkDateOffset,
} from './utils/shift-window.util';

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

type MonthlyReviewNextStatus = Extract<
  AttendanceReviewStatus,
  "READY_FOR_PAYROLL" | "LOCKED"
>;

const LATE_REVIEW_THRESHOLD_MINUTES = DEFAULT_LATE_REVIEW_THRESHOLD_MINUTES;

type ResolvedPunchRule = {
  rule: any;
  sessionCode: string;
  session: string;
  logType: AttendanceLogType;
  status: AttendanceLogStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  isOutsideSession: boolean;
};

type DailyCalculationEmployee = {
  id: string;
  companyId: string;
  /** วันเริ่มงาน ใช้กันไม่ให้คำนวณวันก่อนเป็นพนักงาน */
  startDate?: Date | string | null;
  /** วันสุดท้ายของการเป็นพนักงาน ใช้กันไม่ให้วันหลังลาออกกลายเป็นขาดงาน */
  employmentEndDate?: Date | string | null;
  branchId: string | null;
  departmentId?: string | null;
  divisionId?: string | null;
  employeeTypeId?: string | null;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  /** false = ไม่ต้องลงเวลาเลย (ผู้บริหาร / เหมาจ่าย) */
  attendanceTrackingRequired?: boolean | null;
  /** ช่วงลงเวลาที่ยกเว้นรายคน เช่น พนักงานจัดส่งไม่ต้องกดเข้างานบ่าย */
  attendanceExemptSessions?: string[] | null;
};

type DailyCalculationContext = {
  policiesByScopeDate?: Map<string, any>;
  /** กะที่ผูกไว้รายคน โหลดครั้งเดียวต่อพนักงาน คนที่ไม่มีเก็บเป็น [] */
  shiftAssignmentsByEmployeeId?: Map<string, any[]>;
  logsByEmployeeDate?: Map<string, any[]>;
  leavesByEmployeeId?: Map<string, any[]>;
  compensationsByEmployeeId?: Map<string, any[]>;
  overtimeRequestsByEmployeeDate?: Map<string, any[]>;
  payrollSettings?: PayrollCalculationSettings;
  payrollSettingsByCompanyId?: Map<string, PayrollCalculationSettings>;
  attendanceHolidaySettings?: AttendanceHolidaySettingsContext;
  attendanceHolidaySettingsByCompanyId?: Map<
    string,
    AttendanceHolidaySettingsContext
  >;
  /**
   * สถานะรีวิวเดิมของสรุปรายวัน โหลดมาเป็นก้อนเดียวตอนเริ่มคำนวณ
   *
   * ก่อนหน้านี้อ่านทีละวันด้วย findUnique ในลูป — คำนวณทั้งงวด (พนักงาน 122 คน
   * × 31 วัน) จึงยิงคำสั่งเพิ่มอีกเกือบ 4,000 ครั้งโดยไม่จำเป็น
   */
  existingSummaryByEmployeeDate?: Map<string, any>;
  /*
   * คำขอที่ต้องอ่านรายวัน — เดิมยิงทีละวันในลูปรวม 6 คำสั่งต่อพนักงานต่อวัน
   * (นับคำขอค้างอนุมัติ 4 + คำขอนอกสถานที่ 1 + คำขอแก้เวลา 1)
   * คำนวณทั้งงวด 109 คน x 31 วัน จึงยิงเกินไปสองหมื่นคำสั่ง
   * โหลดทีเดียวทั้งช่วงแล้วแจกจากหน่วยความจำแทน
   */
  offsiteRequestsByEmployeeDate?: Map<string, any[]>;
  timeAdjustRequestsByEmployeeDate?: Map<string, any[]>;
  /** ใบลาที่ยังรออนุมัติ คนละชุดกับ leavesByEmployeeId ที่โหลดเฉพาะที่อนุมัติแล้ว */
  pendingLeavesByEmployeeId?: Map<string, any[]>;
  pendingOvertimeByEmployeeDate?: Map<string, any[]>;
};

type AttendanceHolidaySettingsContext = {
  attendanceWeeklyHolidays: string[];
  attendanceCustomHolidays: Array<{ date: string; name: string }>;
  attendanceHolidayWorkOverrides?: Array<{
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
  }>;
};

type LeaveCoverage = {
  coversMorning: boolean;
  coversAfternoon: boolean;
  coversCheckout: boolean;
  durationDays: number;
  isUnpaid: boolean;
  paidLeaveMinutes: number;
  unpaidLeaveMinutes: number;
  unpaidDurationDays: number;
  coveredSessions: Array<"MORNING" | "AFTERNOON" | "CHECKOUT">;
  leaveRequestIds: string[];
  leaveTypeIds: string[];
  coverageReason: string | null;
};

type UnpaidLeaveDeductionSnapshot = {
  amount: number;
  baseSalary: number;
  salaryDivisorDays: number;
  workingHoursPerDay: number;
  dailyRate: number;
  hourlyRate: number;
  unpaidLeaveMinutes: number;
  unpaidLeaveHours: number;
  /**
   * ค่าปรับจาก LeavePolicy — หักค่าจ้างกี่เท่าต่อวันลา
   * เก็บลง snapshot เพื่อให้สลิปย้อนหลังไม่เปลี่ยนเมื่อ HR แก้นโยบายภายหลัง
   */
  unpaidDeductionMultiplier: number;
  amountBeforeMultiplier: number;
  calculationMethod: "BASE_SALARY_CONFIGURED_DAYS_HOURS";
  missingCompensation: boolean;
};

/**
 * ค่าปรับตั้งต้นเมื่อหานโยบายของพนักงานคนนั้นไม่เจอ
 * ต้องเป็น 1 ไม่ใช่ 0 — ถ้าเป็น 0 ลาไม่รับค่าจ้างจะหยุดหักเงินเงียบ ๆ
 */
const DEFAULT_UNPAID_DEDUCTION_MULTIPLIER = 1;

/**
 * อ่านการยกเว้นการลงเวลาที่ตั้งไว้รายพนักงาน แล้วแปลงให้เครื่องคำนวณใช้
 *
 * ตั้ง default เป็น "ต้องลงเวลา" เมื่ออ่านค่าไม่ได้ เพื่อให้พลาดไปทางเข้มไว้ก่อน
 * ดีกว่าปล่อยให้คนที่ต้องลงเวลาหลุดการตรวจเพราะข้อมูลขาด
 */
function resolveEmployeeExemption(employee: {
  attendanceTrackingRequired?: boolean | null;
  attendanceExemptSessions?: string[] | null;
}): EmployeeAttendanceExemption {
  const allowed = ['MORNING_IN', 'AFTERNOON_IN', 'CHECK_OUT'] as const;

  return {
    trackingRequired: employee.attendanceTrackingRequired !== false,
    exemptSessions: (employee.attendanceExemptSessions ?? []).filter(
      (code): code is (typeof allowed)[number] =>
        (allowed as readonly string[]).includes(code),
    ),
  };
}

type AbsenceDeductionSnapshot = {
  amount: number;
  baseSalary: number;
  payrollPeriodStartDate: string | null;
  payrollPeriodEndDate: string | null;
  /** จำนวนวันจริงในงวด — เก็บไว้ให้ตรวจสอบย้อนหลังได้ ไม่ได้ใช้เป็นตัวหารแล้ว */
  payrollPeriodDays: number;
  /** ตัวหารที่ใช้จริง มาจากการตั้งค่าของบริษัท */
  salaryDivisorDays: number;
  absentDays: number;
  dailyRate: number;
  calculationMethod: "BASE_SALARY_CONFIGURED_DAYS";
  missingCompensation: boolean;
};

type DailyDeductionCapSnapshot = {
  amount: number;
  baseSalary: number;
  salaryDivisorDays: number;
  dailyRate: number;
  calculationMethod: "BASE_SALARY_CONFIGURED_DAYS";
  missingCompensation: boolean;
};

type PayrollCalculationSettings = {
  payrollCutoffDay: number;
  payrollPeriodStartDay: number;
  salaryDivisorDays: number;
  workingHoursPerDay: number;
};

const DEFAULT_PAYROLL_CALCULATION_SETTINGS: PayrollCalculationSettings = {
  payrollCutoffDay: 25,
  payrollPeriodStartDay: 26,
  salaryDivisorDays: 30,
  workingHoursPerDay: 8,
};

/**
 * นาทีทำงานต่อวัน ใช้เป็นเพดานของเวลาลาในหนึ่งวัน และตัวหารตอนแปลงนาที -> วัน
 * ค่าจริงมาจาก CompanyPayrollSetting.workingHoursPerDay ของบริษัทนั้น
 * ถ้าบริษัทยังไม่ได้ตั้งค่า จะได้ 8 ชม. เท่าค่า default เดิม
 */
const DEFAULT_WORKING_MINUTES_PER_DAY =
  DEFAULT_PAYROLL_CALCULATION_SETTINGS.workingHoursPerDay * 60;

const MAX_RECALCULATE_DAYS = 31;
const DEFAULT_EARLY_CHECKOUT_PENALTY_PER_MINUTE = 5;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  private readonly bangkokDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceCalculationEngine: AttendanceCalculationEngineService,
    private readonly attendanceSummaryQueue: AttendanceSummaryQueueService,
    private readonly attendanceRecalculationScope: AttendanceRecalculationScopeService,
    private readonly offsiteLocationVerification: OffsiteLocationVerificationService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly companyPayrollSettingsService: CompanyPayrollSettingsService,
    private readonly attendanceProgressService: AttendanceProgressService,
    private readonly auditService: AuditService,
  ) {}

  private toAttendanceSourceDate(value: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }

  private normalizeAttendanceSourceRows(rows: any[], mapper: (row: any) => Record<string, unknown>) {
    return [...rows]
      .map(mapper)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }

  private buildAttendanceSourceHash(input: {
    employeeId: string;
    workDate: Date;
    logs: any[];
    approvedLeaves: any[];
    offsiteRequests: any[];
    timeAdjustRequests: any[];
    overtimeCoverage: any;
    policy: any;
    sessionRules: any[];
    holiday: AttendanceHolidayInfo;
    dailyDeductionCap: DailyDeductionCapSnapshot;
    unpaidLeaveDeduction: UnpaidLeaveDeductionSnapshot;
    absenceDeduction: AbsenceDeductionSnapshot;
    calculation: any;
    reviewReasonCodes: string[];
    pendingApprovalCounts?: {
      leave: number;
      overtime: number;
      timeAdjust: number;
      offsite: number;
    };
  }) {
    const source = {
      version: 3,
      employeeId: input.employeeId,
      workDate: this.toDateKey(input.workDate),
      logs: this.normalizeAttendanceSourceRows(input.logs, (log) => ({
        id: log.id ?? null,
        logTime: this.toAttendanceSourceDate(log.logTime),
        logType: log.logType ?? null,
        session: log.session ?? null,
        status: log.status ?? null,
        isOffsite: Boolean(log.isOffsite),
        offsiteRequestId: log.offsiteRequestId ?? null,
        deletedAt: this.toAttendanceSourceDate(log.deletedAt),
      })),
      leaves: this.normalizeAttendanceSourceRows(input.approvedLeaves, (leave) => ({
        id: leave.id ?? null,
        status: leave.status ?? null,
        startDate: this.toAttendanceSourceDate(leave.startDate),
        endDate: this.toAttendanceSourceDate(leave.endDate),
        dayType: leave.dayType ?? null,
        startTime: leave.startTime ?? null,
        endTime: leave.endTime ?? null,
        totalMinutes: Number(leave.totalMinutes ?? 0),
        totalDays: Number(leave.totalDays ?? 0),
        leaveTypeId: leave.leaveTypeId ?? null,
        isPaid: leave.leaveType?.isPaid ?? null,
        updatedAt: this.toAttendanceSourceDate(leave.updatedAt),
      })),
      offsiteRequests: this.normalizeAttendanceSourceRows(
        input.offsiteRequests,
        (request) => ({
          id: request.id ?? null,
          status: request.status ?? null,
          workDate: this.toAttendanceSourceDate(request.workDate),
          startTime: request.startTime ?? null,
          endTime: request.endTime ?? null,
          updatedAt: this.toAttendanceSourceDate(request.updatedAt),
        }),
      ),
      timeAdjustRequests: this.normalizeAttendanceSourceRows(
        input.timeAdjustRequests,
        (request) => ({
          id: request.id ?? null,
          status: request.status ?? null,
          adjustType: request.adjustType ?? null,
          targetLogType: request.targetLogType ?? null,
          originalLogTime: this.toAttendanceSourceDate(request.originalLogTime),
          requestedLogTime: this.toAttendanceSourceDate(request.requestedLogTime),
          originalAttendanceLogId: request.originalAttendanceLogId ?? null,
          appliedAttendanceLogId: request.appliedAttendanceLogId ?? null,
          updatedAt: this.toAttendanceSourceDate(request.updatedAt),
        }),
      ),
      pendingApprovals: {
        leave: Number(input.pendingApprovalCounts?.leave ?? 0),
        overtime: Number(input.pendingApprovalCounts?.overtime ?? 0),
        timeAdjust: Number(input.pendingApprovalCounts?.timeAdjust ?? 0),
        offsite: Number(input.pendingApprovalCounts?.offsite ?? 0),
      },
      overtime: {
        approvedOtMinutes: Number(input.overtimeCoverage?.approvedOtMinutes ?? 0),
        payableOtMinutes: Number(input.overtimeCoverage?.payableOtMinutes ?? 0),
        requestIds: [...(input.overtimeCoverage?.requestIds ?? [])].sort(),
        requests: this.normalizeAttendanceSourceRows(
          input.overtimeCoverage?.requests ?? [],
          (request) => ({
            id: request.id ?? null,
            workDate: request.workDate ?? null,
            startTime: request.startTime ?? null,
            endTime: request.endTime ?? null,
            totalMinutes: Number(request.totalMinutes ?? 0),
            workType: request.workType ?? null,
            rateMultiplier: Number(request.rateMultiplier ?? 0),
            amountPreview: Number(request.amountPreview ?? 0),
          }),
        ),
      },
      policy: {
        id: input.policy?.id ?? null,
        code: input.policy?.code ?? null,
        updatedAt: this.toAttendanceSourceDate(input.policy?.updatedAt),
        latePenaltyRatePerMinute: Number(input.policy?.latePenaltyRatePerMinute ?? 0),
        missingLogPenaltyPerDay: Number(input.policy?.missingLogPenaltyPerDay ?? 0),
        missingPenaltyMode: input.policy?.missingPenaltyMode ?? null,
        maxLatePenaltyPerDay: input.policy?.maxLatePenaltyPerDay ?? null,
        maxMissingPenaltyPerDay: input.policy?.maxMissingPenaltyPerDay ?? null,
        lateGraceMinutes: Number(input.policy?.lateGraceMinutes ?? 0),
        lateRoundingMinutes: Number(input.policy?.lateRoundingMinutes ?? 0),
        sessionRules: this.normalizeAttendanceSourceRows(
          input.sessionRules,
          (rule) => ({
            id: rule.id ?? null,
            sessionCode: rule.sessionCode ?? null,
            punchType: rule.punchType ?? null,
            openTime: rule.openTime ?? null,
            expectedTime: rule.expectedTime ?? null,
            closeTime: rule.closeTime ?? null,
            lateAfterTime: rule.lateAfterTime ?? null,
            lateGraceMinutes: Number(rule.lateGraceMinutes ?? 0),
            earlyBeforeTime: rule.earlyBeforeTime ?? null,
            earlyLeavePenaltyPerMinute: Number(
              rule.earlyLeavePenaltyPerMinute ?? 0,
            ),
            collectLateOutMinutes: rule.collectLateOutMinutes ?? null,
            sortOrder: Number(rule.sortOrder ?? 0),
            updatedAt: this.toAttendanceSourceDate(rule.updatedAt),
          }),
        ),
      },
      holiday: {
        isHoliday: Boolean(input.holiday?.isHoliday),
        isWorkingHoliday: Boolean(input.holiday?.isWorkingHoliday),
        date: input.holiday?.date ?? null,
        name: input.holiday?.name ?? null,
        source: input.holiday?.source ?? null,
        baseHoliday: input.holiday?.baseHoliday ?? null,
        workOverride: input.holiday?.workOverride ?? null,
      },
      compensation: {
        dailyDeductionCap: input.dailyDeductionCap,
        unpaidLeaveDeduction: input.unpaidLeaveDeduction,
        absenceDeduction: input.absenceDeduction,
      },
      result: {
        morningInAt: this.toAttendanceSourceDate(input.calculation?.morningIn?.logTime),
        afternoonInAt: this.toAttendanceSourceDate(
          input.calculation?.afternoonIn?.logTime,
        ),
        checkOutAt: this.toAttendanceSourceDate(input.calculation?.checkOut?.logTime),
        morningLateMinutes: Number(input.calculation?.morningLateMinutes ?? 0),
        afternoonLateMinutes: Number(input.calculation?.afternoonLateMinutes ?? 0),
        totalLateMinutes: Number(input.calculation?.totalLateMinutes ?? 0),
        isMorningMissing: Boolean(input.calculation?.isMorningMissing),
        isAfternoonMissing: Boolean(input.calculation?.isAfternoonMissing),
        isCheckoutMissing: Boolean(input.calculation?.isCheckoutMissing),
        hasMissingLog: Boolean(input.calculation?.hasMissingLog),
        isAbsent: Boolean(input.calculation?.isAbsent),
        absentDays: Number(input.calculation?.absentDays ?? 0),
        earlyCheckoutMinutes: Number(input.calculation?.earlyCheckoutMinutes ?? 0),
        lateCheckoutMinutes: Number(input.calculation?.lateCheckoutMinutes ?? 0),
        latePenaltyAmount: Number(input.calculation?.latePenaltyAmount ?? 0),
        missingLogPenaltyAmount: Number(
          input.calculation?.missingLogPenaltyAmount ?? 0,
        ),
        earlyCheckoutPenaltyAmount: Number(
          input.calculation?.earlyCheckoutPenaltyAmount ?? 0,
        ),
        absentDeductionAmount: Number(
          input.calculation?.absentDeductionAmount ?? 0,
        ),
        unpaidLeaveDeductionAmount: Number(
          input.calculation?.unpaidLeaveDeductionAmount ?? 0,
        ),
        totalDeductionAmount: Number(input.calculation?.totalDeductionAmount ?? 0),
        paidLeaveMinutes: Number(input.calculation?.paidLeaveMinutes ?? 0),
        unpaidLeaveMinutes: Number(input.calculation?.unpaidLeaveMinutes ?? 0),
        offsiteMinutes: Number(input.calculation?.offsiteMinutes ?? 0),
        approvedOtMinutes: Number(input.overtimeCoverage?.approvedOtMinutes ?? 0),
        payableOtMinutes: Number(input.overtimeCoverage?.payableOtMinutes ?? 0),
        reviewReasonCodes: [...input.reviewReasonCodes].sort(),
      },
    };

    return createHash("sha256")
      .update(JSON.stringify(source))
      .digest("hex");
  }

  private getAttendanceReviewSnapshot(snapshot: unknown) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return null;
    }

    const attendanceReview = (snapshot as Record<string, any>).attendanceReview;
    return attendanceReview &&
      typeof attendanceReview === "object" &&
      !Array.isArray(attendanceReview)
      ? (attendanceReview as Record<string, any>)
      : null;
  }

  private buildAttendanceReviewPolicySnapshot(params: {
    basePolicySnapshot: Record<string, unknown>;
    existingPolicySnapshot: unknown;
    reviewState: ReturnType<typeof resolveAttendanceReviewState>;
    sourceHash: string;
    invalidation?: {
      invalidatedAt: Date;
      invalidatedById: string;
      oldStatus: AttendanceReviewStatus;
      newStatus: AttendanceReviewStatus;
      previousSourceHash: string | null;
    } | null;
  }) {
    const existingSnapshot =
      params.existingPolicySnapshot &&
      typeof params.existingPolicySnapshot === "object" &&
      !Array.isArray(params.existingPolicySnapshot)
        ? (params.existingPolicySnapshot as Record<string, any>)
        : {};
    const existingReview = this.getAttendanceReviewSnapshot(existingSnapshot) ?? {};

    return {
      ...params.basePolicySnapshot,
      ...(Array.isArray(existingSnapshot.dailyReviewActions)
        ? { dailyReviewActions: existingSnapshot.dailyReviewActions }
        : {}),
      ...(existingSnapshot.attendanceRecalculation &&
      typeof existingSnapshot.attendanceRecalculation === "object" &&
      !Array.isArray(existingSnapshot.attendanceRecalculation)
        ? { attendanceRecalculation: existingSnapshot.attendanceRecalculation }
        : {}),
      attendanceReview: {
        ...existingReview,
        version: 2,
        hasReviewIssue: params.reviewState.hasReviewIssue,
        reviewReasons: params.reviewState.reviewReasons,
        sourceHash: params.sourceHash,
        ...(params.invalidation
          ? {
              lastInvalidation: {
                eventCode: "ATTENDANCE_REVIEW_INVALIDATED",
                invalidatedAt: params.invalidation.invalidatedAt.toISOString(),
                invalidatedById: params.invalidation.invalidatedById,
                oldStatus: params.invalidation.oldStatus,
                newStatus: params.invalidation.newStatus,
                previousSourceHash: params.invalidation.previousSourceHash,
                sourceHash: params.sourceHash,
              },
            }
          : {}),
      },
    };
  }

  private async writeAttendanceReviewInvalidatedAudit(params: {
    summaryId: string;
    employeeId: string;
    workDate: Date;
    actorId: string;
    oldStatus: AttendanceReviewStatus;
    newStatus: AttendanceReviewStatus;
    oldSourceHash: string | null;
    newSourceHash: string;
    oldReviewReasonCodes: string[];
    newReviewReasonCodes: string[];
    oldTotalDeductionAmount: number;
    newTotalDeductionAmount: number;
  }) {
    try {
      await this.auditService.createLog({
        action: AuditAction.UPDATE,
        entity: "AttendanceDailySummary",
        entityId: params.summaryId,
        description: "ยกเลิกผลการตรวจ Attendance เดิม เนื่องจากข้อมูลต้นทางหรือผลคำนวณเปลี่ยน",
        userId: params.actorId,
        metadata: {
          eventCode: "ATTENDANCE_REVIEW_INVALIDATED",
          triggerSourceType: "ATTENDANCE_RECALCULATION",
          employeeId: params.employeeId,
          workDate: this.toDateKey(params.workDate),
          oldStatus: params.oldStatus,
          newStatus: params.newStatus,
          oldSourceHash: params.oldSourceHash,
          newSourceHash: params.newSourceHash,
          oldReviewReasonCodes: params.oldReviewReasonCodes,
          newReviewReasonCodes: params.newReviewReasonCodes,
          oldTotalDeductionAmount: this.roundMoney(
            params.oldTotalDeductionAmount,
          ),
          newTotalDeductionAmount: this.roundMoney(
            params.newTotalDeductionAmount,
          ),
        },
      });
    } catch (error) {
      this.logger.warn(
        `ไม่สามารถบันทึก Audit Log การยกเลิกผลตรวจ Attendance summaryId=${params.summaryId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async findAll(query: ListAttendanceLogsQueryDto, scope: TenantScope) {
    if (query.employeeId) {
      await this.assertEmployeesWithinAttendanceScope([query.employeeId], scope);
    }

    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.AttendanceLogWhereInput = {
      deletedAt: null,
    };

    // Hard tenant boundary — scope ผ่าน relation employee (Pattern B)
    const scopeWhere = tenantWhere(scope) as Prisma.EmployeeWhereInput;
    if (Object.keys(scopeWhere).length > 0) {
      where.AND = [{ employee: { is: scopeWhere } }];
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.logType) {
      where.logType = query.logType;
    }

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      where.workDate = {};

      if (query.dateFrom) {
        where.workDate.gte = this.toDateOnly(query.dateFrom);
      }

      if (query.dateTo) {
        where.workDate.lte = this.toDateOnly(query.dateTo);
      }
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.employee = {
        OR: [
          {
            employeeCode: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            firstName: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            lastName: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            nickname: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            displayName: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ workDate: "desc" }, { logTime: "desc" }],
        include: this.defaultAttendanceLogInclude(),
      }),
      this.prisma.attendanceLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string, scope: TenantScope) {
    const attendanceLog = await this.prisma.attendanceLog.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        ...this.defaultAttendanceLogInclude(),
        editLogs: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            editedBy: {
              select: {
                id: true,
                email: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!attendanceLog) {
      throw new NotFoundException("ไม่พบข้อมูลลงเวลา");
    }

    this.assertAttendanceEntityWithinScope(scope, {
      companyId: attendanceLog.employee?.company?.id ?? null,
      branchId: attendanceLog.employee?.branch?.id ?? null,
    });

    return attendanceLog;
  }

  async findMyToday(currentUserId: string) {
    const employee = await this.findEmployeeByUserId(currentUserId);
    const now = new Date();
    const workDate = await this.resolveWorkDateForPunch(employee, now);

    const holiday =
      await this.systemSettingsService.getEmployeeAttendanceHolidayInfo(
        workDate,
        employee,
      );

    const logs = await this.prisma.attendanceLog.findMany({
      where: {
        employeeId: employee.id,
        workDate,
        deletedAt: null,
      },
      orderBy: {
        logTime: "asc",
      },
      include: this.defaultAttendanceLogInclude(),
    });

    const latestLog = logs
      .filter((log) => log.status !== AttendanceLogStatus.CANCELLED)
      .at(-1);

    return {
      employee,
      workDate,
      latestLog,
      logs,
      holiday,
      /*
       * วันหยุดก็ลงเวลาได้ — มีกรณีถูกเรียกมาทำงานวันหยุดจริง สรุปรายวันของ
       * วันนั้นเข้าทาง storeHolidayDailySummary อยู่แล้ว (ไม่มีค่าปรับ ไม่นับสาย)
       * ส่วนค่าแรงวันหยุดคิดจากใบ OT ที่อนุมัติ ไม่ได้คิดจากการมีเวลาเข้าออก
       */
      canCheckIn:
        !latestLog ||
        latestLog.logType === AttendanceLogType.CHECK_OUT ||
        latestLog.status === AttendanceLogStatus.CANCELLED,
      canCheckOut: latestLog?.logType === AttendanceLogType.CHECK_IN,
    };
  }

  async checkIn(
    dto: CheckAttendanceDto,
    currentUserId: string,
    requestMeta: RequestMeta,
  ) {
    const employee = await this.findEmployeeByUserId(currentUserId);
    const now = new Date();
    const workDate = await this.resolveWorkDateForPunch(employee, now);

    // งวดที่ปิดและจ่ายเงินไปแล้ว ห้ามมีเวลาไหลเข้าเพิ่มไม่ว่าจากทางไหน
    await this.ensureWorkDateNotLocked(employee.id, workDate);
    await this.ensureAttendanceRefsAreValid(dto.locationId, dto.deviceId);
    await this.validateGpsAttendanceLocation(dto);

    const latestLog = await this.findLatestLogOfWorkDate(employee.id, workDate);

    if (
      latestLog &&
      latestLog.status !== AttendanceLogStatus.CANCELLED &&
      latestLog.logType === AttendanceLogType.CHECK_IN
    ) {
      throw new BadRequestException("มีการลงเวลาเข้างานแล้ว");
    }

    const attendanceLog = await this.prisma.attendanceLog.create({
      data: {
        employeeId: employee.id,
        workDate,
        logType: AttendanceLogType.CHECK_IN,
        logTime: now,
        channel: dto.channel ?? this.resolveCheckChannel(dto),
        status: AttendanceLogStatus.NORMAL,
        locationId: dto.locationId,
        deviceId: dto.deviceId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        gpsAccuracy: dto.gpsAccuracy,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        note: dto.note,
        createdById: currentUserId,
      },
      include: this.defaultAttendanceLogInclude(),
    });

    await this.enqueueDailySummaryRecalculation(
      employee.id,
      workDate,
      currentUserId,
      {
        sourceType: "ATTENDANCE_LOG",
        sourceId: attendanceLog.id,
        sourceAction: "CHECK_IN_CREATED",
      },
    );

    return attendanceLog;
  }

  async checkOut(
    dto: CheckAttendanceDto,
    currentUserId: string,
    requestMeta: RequestMeta,
  ) {
    const employee = await this.findEmployeeByUserId(currentUserId);
    const now = new Date();
    const workDate = await this.resolveWorkDateForPunch(employee, now);

    // งวดที่ปิดและจ่ายเงินไปแล้ว ห้ามมีเวลาไหลเข้าเพิ่มไม่ว่าจากทางไหน
    await this.ensureWorkDateNotLocked(employee.id, workDate);
    await this.ensureAttendanceRefsAreValid(dto.locationId, dto.deviceId);
    await this.validateGpsAttendanceLocation(dto);

    const latestLog = await this.findLatestLogOfWorkDate(employee.id, workDate);

    if (!latestLog || latestLog.logType !== AttendanceLogType.CHECK_IN) {
      throw new BadRequestException(
        "ยังไม่มีรายการเข้างานที่สามารถลงเวลาออกได้",
      );
    }

    const attendanceLog = await this.prisma.attendanceLog.create({
      data: {
        employeeId: employee.id,
        workDate,
        logType: AttendanceLogType.CHECK_OUT,
        logTime: now,
        channel: dto.channel ?? this.resolveCheckChannel(dto),
        status: AttendanceLogStatus.NORMAL,
        locationId: dto.locationId,
        deviceId: dto.deviceId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        gpsAccuracy: dto.gpsAccuracy,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        note: dto.note,
        createdById: currentUserId,
      },
      include: this.defaultAttendanceLogInclude(),
    });

    await this.enqueueDailySummaryRecalculation(
      employee.id,
      workDate,
      currentUserId,
      {
        sourceType: "ATTENDANCE_LOG",
        sourceId: attendanceLog.id,
        sourceAction: "CHECK_OUT_CREATED",
      },
    );

    return attendanceLog;
  }

  /**
   * กันการแก้เวลาทำงานของวันที่ปิดงวดไปแล้ว
   *
   * เดิมมีการตรวจล็อกเฉพาะตอนเปลี่ยนสถานะใน HR Review
   * แต่เส้นทางเขียนเวลาจริง (เพิ่ม/แก้/ยกเลิก) ไม่ได้ตรวจเลย
   * จึงบันทึกเวลาเข้าไปในงวดที่ล็อกและจ่ายเงินไปแล้วได้
   * ทำให้ log กับสรุปรายวันขัดกันเอง และถ้ามีใครกดคำนวณใหม่ภายหลัง
   * ตัวเลขจะเปลี่ยนหลังจ่ายเงินไปแล้วโดยไม่มีร่องรอยว่าจ่ายไปเท่าไร
   */
  private async ensureWorkDateNotLocked(employeeId: string, workDate: Date) {
    await assertWorkDateNotLocked(this.prisma, employeeId, workDate);
  }

  /** คืนเหตุผลแทนการโยน error — ใช้กับการนำเข้าเป็นชุดที่ต้องข้ามเฉพาะรายการที่ติดล็อก */
  private async checkWorkDateLocked(employeeId: string, workDate: Date) {
    return checkWorkDateLocked(this.prisma, employeeId, workDate);
  }

  async createManualLog(
    dto: CreateManualAttendanceLogDto,
    currentUserId: string,
    requestMeta: RequestMeta,
    scope: TenantScope,
  ) {
    const employee = await this.ensureEmployeeExists(dto.employeeId);
    // พนักงานปลายทางต้องอยู่ในบริษัท/สาขาของผู้ทำรายการ
    assertWithinScope(scope, {
      companyId: employee.companyId,
      branchId: employee.branchId,
    });
    await this.ensureAttendanceRefsAreValid(dto.locationId, dto.deviceId);

    const logTime = new Date(dto.logTime);
    const workDate = await this.resolveWorkDateForPunch(employee, logTime);

    await this.ensureWorkDateNotLocked(dto.employeeId, workDate);

    const attendanceLog = await this.prisma.attendanceLog.create({
      data: {
        employeeId: dto.employeeId,
        workDate,
        logType: dto.logType,
        logTime,
        channel: dto.channel ?? AttendanceChannel.MANUAL,
        status: dto.status ?? AttendanceLogStatus.MANUAL_ADDED,
        locationId: dto.locationId,
        deviceId: dto.deviceId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        gpsAccuracy: dto.gpsAccuracy,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        note: dto.note,
        createdById: currentUserId,
      },
      include: this.defaultAttendanceLogInclude(),
    });

    await this.prisma.attendanceEditLog.create({
      data: {
        attendanceLogId: attendanceLog.id,
        action: AttendanceEditAction.CREATE_MANUAL,
        newLogTime: attendanceLog.logTime,
        newStatus: attendanceLog.status,
        newChannel: attendanceLog.channel,
        reason: "เพิ่มรายการลงเวลาโดย HR/Admin",
        note: dto.note,
        editedById: currentUserId,
      },
    });

    await this.enqueueDailySummaryRecalculation(
      dto.employeeId,
      workDate,
      currentUserId,
      {
        sourceType: "ATTENDANCE_LOG",
        sourceId: attendanceLog.id,
        sourceAction: "MANUAL_LOG_CREATED",
      },
    );

    return attendanceLog;
  }

  async updateLog(
    id: string,
    dto: UpdateAttendanceLogDto,
    currentUserId: string,
    scope: TenantScope,
  ) {
    const currentLog = await this.prisma.attendanceLog.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: { select: { companyId: true, branchId: true } },
      },
    });

    if (!currentLog) {
      throw new NotFoundException("ไม่พบข้อมูลลงเวลา");
    }

    assertWithinScope(scope, {
      companyId: currentLog.employee.companyId,
      branchId: currentLog.employee.branchId,
    });

    if (currentLog.status === AttendanceLogStatus.CANCELLED) {
      throw new BadRequestException("รายการนี้ถูกยกเลิกแล้ว ไม่สามารถแก้ไขได้");
    }

    await this.ensureWorkDateNotLocked(
      currentLog.employeeId,
      currentLog.workDate,
    );

    await this.ensureAttendanceRefsAreValid(
      dto.locationId === null ? undefined : dto.locationId,
      dto.deviceId === null ? undefined : dto.deviceId,
    );

    const newLogTime = dto.logTime ? new Date(dto.logTime) : currentLog.logTime;
    const newWorkDate = dto.logTime
      ? await this.resolveWorkDateForPunch(currentLog.employee, newLogTime)
      : currentLog.workDate;

    // ตรวจ "วันปลายทาง" ด้วย ไม่งั้นย้ายรายการจากวันที่เปิดอยู่
    // เข้าไปในวันที่ล็อกแล้วได้ ซึ่งเลี่ยงตัวกันไปทั้งดุ้น
    if (newWorkDate.getTime() !== currentLog.workDate.getTime()) {
      await this.ensureWorkDateNotLocked(currentLog.employeeId, newWorkDate);
    }

    const updatedLog = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceLog.update({
        where: {
          id,
        },
        data: {
          workDate: newWorkDate,
          logTime: newLogTime,
          channel: dto.channel ?? currentLog.channel,
          status: dto.status ?? AttendanceLogStatus.EDITED,
          locationId:
            dto.locationId === undefined
              ? currentLog.locationId
              : dto.locationId,
          deviceId:
            dto.deviceId === undefined ? currentLog.deviceId : dto.deviceId,
          latitude:
            dto.latitude === undefined ? currentLog.latitude : dto.latitude,
          longitude:
            dto.longitude === undefined ? currentLog.longitude : dto.longitude,
          gpsAccuracy:
            dto.gpsAccuracy === undefined
              ? currentLog.gpsAccuracy
              : dto.gpsAccuracy,
          note: dto.note === undefined ? currentLog.note : dto.note,
        },
        include: this.defaultAttendanceLogInclude(),
      });

      await tx.attendanceEditLog.create({
        data: {
          attendanceLogId: id,
          action: AttendanceEditAction.UPDATE_TIME,
          oldLogTime: currentLog.logTime,
          newLogTime: updated.logTime,
          oldStatus: currentLog.status,
          newStatus: updated.status,
          oldChannel: currentLog.channel,
          newChannel: updated.channel,
          reason: dto.reason,
          note: dto.note ?? undefined,
          editedById: currentUserId,
        },
      });

      return updated;
    });

    await this.enqueueDailySummaryRecalculation(
      currentLog.employeeId,
      currentLog.workDate,
      currentUserId,
      {
        sourceType: "ATTENDANCE_LOG",
        sourceId: currentLog.id,
        sourceAction: "LOG_UPDATED_OLD_WORK_DATE",
      },
    );

    if (
      this.toDateKey(currentLog.workDate) !==
      this.toDateKey(updatedLog.workDate)
    ) {
      await this.enqueueDailySummaryRecalculation(
        updatedLog.employeeId,
        updatedLog.workDate,
        currentUserId,
        {
          sourceType: "ATTENDANCE_LOG",
          sourceId: updatedLog.id,
          sourceAction: "LOG_UPDATED_NEW_WORK_DATE",
        },
      );
    }

    return updatedLog;
  }

  async cancelLog(
    id: string,
    dto: CancelAttendanceLogDto,
    currentUserId: string,
    scope: TenantScope,
  ) {
    const currentLog = await this.prisma.attendanceLog.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: { select: { companyId: true, branchId: true } },
      },
    });

    if (!currentLog) {
      throw new NotFoundException("ไม่พบข้อมูลลงเวลา");
    }

    assertWithinScope(scope, {
      companyId: currentLog.employee.companyId,
      branchId: currentLog.employee.branchId,
    });

    if (currentLog.status === AttendanceLogStatus.CANCELLED) {
      throw new BadRequestException("รายการนี้ถูกยกเลิกแล้ว");
    }

    await this.ensureWorkDateNotLocked(
      currentLog.employeeId,
      currentLog.workDate,
    );

    const cancelledLog = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceLog.update({
        where: {
          id,
        },
        data: {
          status: AttendanceLogStatus.CANCELLED,
          deletedAt: new Date(),
          note: dto.note ?? currentLog.note,
        },
        include: this.defaultAttendanceLogInclude(),
      });

      await tx.attendanceEditLog.create({
        data: {
          attendanceLogId: id,
          action: AttendanceEditAction.CANCEL,
          oldLogTime: currentLog.logTime,
          newLogTime: currentLog.logTime,
          oldStatus: currentLog.status,
          newStatus: AttendanceLogStatus.CANCELLED,
          oldChannel: currentLog.channel,
          newChannel: currentLog.channel,
          reason: dto.reason,
          note: dto.note,
          editedById: currentUserId,
        },
      });

      return updated;
    });

    await this.enqueueDailySummaryRecalculation(
      currentLog.employeeId,
      currentLog.workDate,
      currentUserId,
      {
        sourceType: "ATTENDANCE_LOG",
        sourceId: currentLog.id,
        sourceAction: "LOG_CANCELLED",
      },
    );

    return cancelledLog;
  }

  async findLocations(scope: TenantScope) {
    const where: Prisma.AttendanceLocationWhereInput = {
      deletedAt: null,
    };

    if (scope.level !== "GLOBAL") {
      where.companyId = scope.companyId ?? undefined;
    }

    if (scope.level === "BRANCH") {
      where.OR = [{ branchId: scope.branchId }, { branchId: null }];
    }

    return this.prisma.attendanceLocation.findMany({
      where,
      orderBy: [{ company: { code: "asc" } }, { code: "asc" }],
      include: this.defaultAttendanceLocationInclude(),
    });
  }

  async findLocation(id: string, scope: TenantScope) {
    const location = await this.prisma.attendanceLocation.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.defaultAttendanceLocationInclude(),
    });

    if (!location) {
      throw new NotFoundException("ไม่พบสถานที่ลงเวลา");
    }

    assertWithinScope(scope, {
      companyId: location.companyId,
      branchId: location.branchId,
    });

    return location;
  }

  async createLocation(dto: CreateAttendanceLocationDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);
    assertWithinScope(scope, { companyId, branchId: dto.branchId ?? null });

    await this.ensureCompanyExists(companyId);

    if (dto.branchId) {
      await this.ensureBranchExists(dto.branchId, companyId);
    }

    await this.ensureLocationCodeIsAvailable(companyId, dto.code);

    this.validateAttendanceLocationGpsConfig({
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusMeters: dto.radiusMeters ?? 100,
    });

    return this.prisma.attendanceLocation.create({
      data: {
        companyId,
        branchId: dto.branchId,
        code: dto.code.trim(),
        nameTh: dto.nameTh.trim(),
        nameEn: dto.nameEn?.trim(),
        type: dto.type ?? "OFFICE",
        address: dto.address?.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters ?? 100,
        status: dto.status ?? "ACTIVE",
      },
      include: this.defaultAttendanceLocationInclude(),
    });
  }

  async updateLocation(
    id: string,
    dto: UpdateAttendanceLocationDto,
    scope: TenantScope,
  ) {
    const currentLocation = await this.prisma.attendanceLocation.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!currentLocation) {
      throw new NotFoundException("ไม่พบสถานที่ลงเวลา");
    }

    assertWithinScope(scope, {
      companyId: currentLocation.companyId,
      branchId: currentLocation.branchId,
    });

    if (dto.branchId !== undefined && dto.branchId !== null) {
      assertWithinScope(scope, {
        companyId: currentLocation.companyId,
        branchId: dto.branchId,
      });
      await this.ensureBranchExists(dto.branchId, currentLocation.companyId);
    }

    if (dto.code && dto.code !== currentLocation.code) {
      await this.ensureLocationCodeIsAvailable(
        currentLocation.companyId,
        dto.code,
        id,
      );
    }

    this.validateAttendanceLocationGpsConfig({
      latitude:
        dto.latitude === undefined
          ? this.toNullableNumber(currentLocation.latitude)
          : dto.latitude,
      longitude:
        dto.longitude === undefined
          ? this.toNullableNumber(currentLocation.longitude)
          : dto.longitude,
      radiusMeters: dto.radiusMeters ?? currentLocation.radiusMeters,
    });

    return this.prisma.attendanceLocation.update({
      where: {
        id,
      },
      data: {
        branchId:
          dto.branchId === undefined ? currentLocation.branchId : dto.branchId,
        code: dto.code?.trim(),
        nameTh: dto.nameTh?.trim(),
        nameEn: dto.nameEn === undefined ? undefined : dto.nameEn,
        type: dto.type,
        address: dto.address === undefined ? undefined : dto.address,
        latitude: dto.latitude === undefined ? undefined : dto.latitude,
        longitude: dto.longitude === undefined ? undefined : dto.longitude,
        radiusMeters: dto.radiusMeters,
        status: dto.status,
      },
      include: this.defaultAttendanceLocationInclude(),
    });
  }

  async removeLocation(id: string, scope: TenantScope) {
    const currentLocation = await this.prisma.attendanceLocation.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!currentLocation) {
      throw new NotFoundException("ไม่พบสถานที่ลงเวลา");
    }

    assertWithinScope(scope, {
      companyId: currentLocation.companyId,
      branchId: currentLocation.branchId,
    });

    /* ลบแล้วคือลบจริง — ถ้ายังมีของผูกอยู่ ให้บอกว่าติดอะไร */
    await assertNotReferenced(
      this.prisma,
      "attendance_locations",
      id,
      "จุดลงเวลานี้",
    );

    return this.prisma.attendanceLocation.delete({
      where: { id },
      include: this.defaultAttendanceLocationInclude(),
    });
  }

  async findDevices(scope: TenantScope) {
    const scopedCompanyId = effectiveCompanyId(scope, undefined);
    return this.prisma.attendanceDevice.findMany({
      where: {
        deletedAt: null,
        // AttendanceDevice ไม่มี companyId ตรง → scope ผ่าน branch.companyId
        ...(scopedCompanyId
          ? { branch: { is: { companyId: scopedCompanyId } } }
          : {}),
      },
      orderBy: {
        code: "asc",
      },
      include: this.defaultAttendanceDeviceInclude(),
    });
  }

  async findDevice(id: string) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.defaultAttendanceDeviceInclude(),
    });

    if (!device) {
      throw new NotFoundException("ไม่พบอุปกรณ์ลงเวลา");
    }

    return device;
  }

  async createDevice(dto: CreateAttendanceDeviceDto, scope: TenantScope) {
    await this.ensureDeviceCodeIsAvailable(dto.code);

    // อุปกรณ์ไม่มี companyId ตรง → ผูก scope ผ่านสาขา
    await this.assertDeviceBranchWithinScope(scope, dto.branchId ?? null);

    if (dto.branchId) {
      await this.ensureBranchExists(dto.branchId);
    }

    if (dto.locationId) {
      await this.ensureLocationExists(dto.locationId);
    }

    return this.prisma.attendanceDevice.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        type: dto.type ?? "OTHER",
        serialNo: dto.serialNo?.trim(),
        ipAddress: dto.ipAddress?.trim(),
        description: dto.description?.trim(),
        brand: dto.brand?.trim(),
        model: dto.model?.trim(),
        port: dto.port ?? null,
        commKey: dto.commKey?.trim(),
        firmwareVersion: dto.firmwareVersion?.trim(),
        branchId: dto.branchId,
        locationId: dto.locationId,
        status: dto.status ?? "ACTIVE",
      },
      include: this.defaultAttendanceDeviceInclude(),
    });
  }

  async updateDevice(
    id: string,
    dto: UpdateAttendanceDeviceDto,
    scope: TenantScope,
  ) {
    const currentDevice = await this.prisma.attendanceDevice.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!currentDevice) {
      throw new NotFoundException("ไม่พบอุปกรณ์ลงเวลา");
    }

    // อุปกรณ์เดิมต้องอยู่ในขอบเขตของผู้ใช้ (ผ่านสาขาปัจจุบัน)
    await this.assertDeviceBranchWithinScope(scope, currentDevice.branchId);

    if (dto.code && dto.code !== currentDevice.code) {
      await this.ensureDeviceCodeIsAvailable(dto.code, id);
    }

    if (dto.branchId !== undefined && dto.branchId !== null) {
      // ย้ายไปสาขาใหม่ ต้องยังอยู่ในขอบเขตด้วย
      await this.assertDeviceBranchWithinScope(scope, dto.branchId);
      await this.ensureBranchExists(dto.branchId);
    }

    if (dto.locationId !== undefined && dto.locationId !== null) {
      await this.ensureLocationExists(dto.locationId);
    }

    return this.prisma.attendanceDevice.update({
      where: {
        id,
      },
      data: {
        code: dto.code?.trim(),
        name: dto.name?.trim(),
        type: dto.type,
        serialNo: dto.serialNo === undefined ? undefined : dto.serialNo,
        ipAddress: dto.ipAddress === undefined ? undefined : dto.ipAddress,
        description:
          dto.description === undefined ? undefined : dto.description,
        brand: dto.brand === undefined ? undefined : dto.brand,
        model: dto.model === undefined ? undefined : dto.model,
        port: dto.port === undefined ? undefined : dto.port,
        commKey: dto.commKey === undefined ? undefined : dto.commKey,
        firmwareVersion:
          dto.firmwareVersion === undefined ? undefined : dto.firmwareVersion,
        branchId:
          dto.branchId === undefined ? currentDevice.branchId : dto.branchId,
        locationId:
          dto.locationId === undefined
            ? currentDevice.locationId
            : dto.locationId,
        status: dto.status,
      },
      include: this.defaultAttendanceDeviceInclude(),
    });
  }

  async removeDevice(id: string, scope: TenantScope) {
    const currentDevice = await this.prisma.attendanceDevice.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!currentDevice) {
      throw new NotFoundException("ไม่พบอุปกรณ์ลงเวลา");
    }

    await this.assertDeviceBranchWithinScope(scope, currentDevice.branchId);

    /*
     * ลบแล้วคือลบจริง — การผูกพนักงานกับเครื่องนี้เป็นของเครื่องเอง
     * ฐานข้อมูลลบตามให้อยู่แล้ว (Cascade) ส่วนรายการลงเวลาที่อ้างถึงเครื่อง
     * จะเป็นตัวขวาง เพราะประวัติการสแกนต้องรู้ว่ามาจากเครื่องไหน
     */
    await assertNotReferenced(
      this.prisma,
      "attendance_devices",
      id,
      "เครื่องสแกนนี้",
    );

    return this.prisma.attendanceDevice.delete({
      where: { id },
      include: this.defaultAttendanceDeviceInclude(),
    });
  }

  /* ---------------------------------------------------------------- */
  /* ผูกพนักงานกับรหัสผู้ใช้ในเครื่องสแกน                                */
  /* ---------------------------------------------------------------- */

  async findDeviceEnrollments(deviceId: string, scope: TenantScope) {
    const device = await this.findDeviceWithinScope(deviceId, scope);

    return this.prisma.attendanceDeviceEnrollment.findMany({
      where: {
        deviceId: device.id,
        deletedAt: null,
      },
      orderBy: [{ status: "asc" }, { deviceUserId: "asc" }],
      include: this.defaultEnrollmentInclude(),
    });
  }

  async createDeviceEnrollment(
    deviceId: string,
    dto: CreateAttendanceDeviceEnrollmentDto,
    scope: TenantScope,
  ) {
    const device = await this.findDeviceWithinScope(deviceId, scope);
    const deviceUserId = dto.deviceUserId.trim();

    if (!deviceUserId) {
      throw new BadRequestException("กรุณาระบุรหัสผู้ใช้ในเครื่อง");
    }

    await this.ensureEmployeeExistsForEnrollment(dto.employeeId);
    await this.ensureEnrollmentIsAvailable(
      device.id,
      deviceUserId,
      dto.employeeId,
    );

    return this.prisma.attendanceDeviceEnrollment.create({
      data: {
        deviceId: device.id,
        employeeId: dto.employeeId,
        deviceUserId,
        fingerCount: dto.fingerCount ?? null,
        note: dto.note?.trim() || null,
        enrolledAt: dto.enrolledAt ? new Date(dto.enrolledAt) : new Date(),
        status: dto.status ?? "ACTIVE",
      },
      include: this.defaultEnrollmentInclude(),
    });
  }

  async updateDeviceEnrollment(
    deviceId: string,
    enrollmentId: string,
    dto: UpdateAttendanceDeviceEnrollmentDto,
    scope: TenantScope,
  ) {
    const device = await this.findDeviceWithinScope(deviceId, scope);
    const current = await this.prisma.attendanceDeviceEnrollment.findFirst({
      where: { id: enrollmentId, deviceId: device.id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบการผูกพนักงานกับเครื่องนี้");
    }

    const nextDeviceUserId = dto.deviceUserId?.trim() ?? current.deviceUserId;
    const nextEmployeeId = dto.employeeId ?? current.employeeId;

    if (dto.employeeId && dto.employeeId !== current.employeeId) {
      await this.ensureEmployeeExistsForEnrollment(dto.employeeId);
    }

    if (
      nextDeviceUserId !== current.deviceUserId ||
      nextEmployeeId !== current.employeeId
    ) {
      await this.ensureEnrollmentIsAvailable(
        device.id,
        nextDeviceUserId,
        nextEmployeeId,
        current.id,
      );
    }

    return this.prisma.attendanceDeviceEnrollment.update({
      where: { id: current.id },
      data: {
        employeeId: nextEmployeeId,
        deviceUserId: nextDeviceUserId,
        ...(dto.fingerCount !== undefined
          ? { fingerCount: dto.fingerCount }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.enrolledAt !== undefined
          ? { enrolledAt: dto.enrolledAt ? new Date(dto.enrolledAt) : null }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      include: this.defaultEnrollmentInclude(),
    });
  }

  async removeDeviceEnrollment(
    deviceId: string,
    enrollmentId: string,
    scope: TenantScope,
  ) {
    const device = await this.findDeviceWithinScope(deviceId, scope);
    const current = await this.prisma.attendanceDeviceEnrollment.findFirst({
      where: { id: enrollmentId, deviceId: device.id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบการผูกพนักงานกับเครื่องนี้");
    }

    /* ลบแล้วคือลบจริง — ไม่เหลือแถวค้างจองรหัสในเครื่องไว้ */
    return this.prisma.attendanceDeviceEnrollment.delete({
      where: { id: current.id },
      include: this.defaultEnrollmentInclude(),
    });
  }

  /* ---------------------------------------------------------------- */
  /* รับข้อมูลสแกนจากเครื่อง                                            */
  /* ---------------------------------------------------------------- */

  /**
   * รับรายการสแกนจากเครื่อง (หรือ middleware ที่ดึงจากเครื่อง) มาสร้าง AttendanceLog
   *
   * - แมปพนักงานผ่านตารางผูกพนักงาน ถ้าไม่เจอจะข้ามและรายงานกลับไป
   * - กันบันทึกซ้ำด้วย rawScannerRecordId เวลาดึงข้อมูลรอบเดิมซ้ำ
   * - ถ้าเครื่องไม่ระบุเข้า/ออก จะสลับให้เองตามรายการล่าสุดของวันนั้น
   */
  async ingestDevicePunches(
    deviceId: string,
    dto: AttendanceDevicePunchBatchDto,
    scope: TenantScope,
    currentUserId: string,
  ) {
    const device = await this.findDeviceWithinScope(deviceId, scope);
    return this.applyDevicePunchRecords(device, dto.punches, currentUserId);
  }

  /**
   * รับ push จากเครื่องโดยตรง (โปรโตคอล ADMS/iclock) ระบุตัวด้วย Serial Number
   *
   * เครื่องคือตัวยืนยันตัวตนเอง (SN) จึงไม่ผูก scope ผู้ใช้ — company มาจากสาขาของเครื่อง
   * ใช้ pipeline เดียวกับการ ingest แบบมี auth
   */
  async ingestDevicePushBySerial(
    serialNo: string,
    records: AttendanceDevicePunchItemDto[],
  ) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: { serialNo, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException(
        `ไม่พบอุปกรณ์ที่มี Serial ${serialNo} ในระบบ`,
      );
    }

    return this.applyDevicePunchRecords(device, records, null);
  }

  /**
   * แกนกลางแปลงรายการสแกน → AttendanceLog
   * createdById = null สำหรับ push จากเครื่อง (ไม่มีผู้ใช้)
   */
  private async applyDevicePunchRecords(
    device: { id: string; status: string; locationId: string | null },
    records: AttendanceDevicePunchItemDto[],
    createdById: string | null,
  ) {
    if (device.status !== "ACTIVE") {
      throw new BadRequestException("อุปกรณ์นี้ถูกปิดใช้งานอยู่");
    }

    const enrollments = await this.prisma.attendanceDeviceEnrollment.findMany({
      where: { deviceId: device.id, deletedAt: null, status: "ACTIVE" },
      select: { deviceUserId: true, employeeId: true },
    });

    const employeeIdByDeviceUserId = new Map(
      enrollments.map((item) => [item.deviceUserId, item.employeeId]),
    );

    const created: string[] = [];
    const skippedDuplicate: string[] = [];
    // รายการที่ตกอยู่ในงวดเงินเดือนที่ปิดแล้ว — ทิ้งแต่ต้องรายงานให้เห็น
    const skippedLocked: string[] = [];
    const unmatchedDeviceUserIds = new Set<string>();

    // เผลอแตะซ้ำภายในช่วงนี้ = ถือเป็นสแกนซ้ำ ทิ้ง (จุดอ่อนคลาสสิกของเครื่องสแกนนิ้ว)
    const SCANNER_DEDUP_WINDOW_MS = 3 * 60 * 1000;

    // ข้อมูล scope ของพนักงานที่ผูกไว้ ใช้หานโยบายรอบลงเวลา
    const employeeIds = [...new Set(enrollments.map((item) => item.employeeId))];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
        companyId: true,
        branchId: true,
        employeeTypeId: true,
      },
    });
    const employeeById = new Map(employees.map((item) => [item.id, item]));

    // cache นโยบายต่อ (พนักงาน + วัน) กันโหลดซ้ำเมื่อมีหลาย punch
    const policyCache = new Map<string, any>();

    // เรียงตามเวลาก่อน เพื่อให้ fallback สลับเข้า/ออกถูกลำดับ
    const punches = [...records].sort(
      (a, b) =>
        new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime(),
    );

    for (const punch of punches) {
      const deviceUserId = punch.deviceUserId.trim();
      const logTime = new Date(punch.punchedAt);

      if (Number.isNaN(logTime.getTime())) {
        throw new BadRequestException(`เวลาสแกนไม่ถูกต้อง: ${punch.punchedAt}`);
      }

      // id ประจำ record เก็บ audit + ใช้กันซ้ำ (เครื่องไม่ส่งมาให้สังเคราะห์เอง)
      const rawRecordId =
        punch.rawRecordId ??
        `${device.id}:${deviceUserId}:${logTime.toISOString()}`;

      // payload ดิบไว้ดูย้อนหลัง
      const payload = {
        deviceUserId,
        punchedAt: punch.punchedAt,
        logType: punch.logType ?? null,
        note: punch.note ?? null,
      };

      // เคยเก็บ raw event นี้แล้ว = เครื่องยิงซ้ำ (offline replay) ข้าม
      const seen = await this.prisma.attendanceRawEvent.findUnique({
        where: {
          deviceId_rawRecordId: { deviceId: device.id, rawRecordId },
        },
        select: { id: true },
      });

      if (seen) {
        skippedDuplicate.push(rawRecordId);
        continue;
      }

      const employeeId = employeeIdByDeviceUserId.get(deviceUserId);

      // รหัสในเครื่องยังไม่ผูกพนักงาน → เก็บ log ดิบไว้ (UNMATCHED) แต่ไม่สร้างการลงเวลา
      if (!employeeId) {
        unmatchedDeviceUserIds.add(deviceUserId);
        await this.recordRawScanEvent({
          deviceId: device.id,
          rawRecordId,
          deviceUserId,
          logTime,
          payload,
          status: "UNMATCHED",
        });
        continue;
      }

      // จัดเข้า/ออกตามนโยบายรอบลงเวลา (เหมือนการลงเวลาผ่านเว็บ)
      const employee = employeeById.get(employeeId);
      const calendarDate = this.getWorkDateFromLogTime(logTime);
      const cacheKey = `${employeeId}|${this.toDateKey(calendarDate)}`;
      let policy = policyCache.get(cacheKey);
      if (!policy && employee) {
        policy = await this.getPunchPolicy(employee, calendarDate);
        policyCache.set(cacheKey, policy);
      }

      // กะข้ามคืน: แตะออกงานตอนตีสองเป็นงานของวันทำงานเมื่อวาน ไม่ใช่วันนี้
      const workDate = employee
        ? await this.resolveWorkDateForPunch(employee, logTime)
        : calendarDate;

      /*
       * เครื่องสแกนเป็นทางเดียวที่เขียนเวลาได้โดยไม่ต้องล็อกอิน
       * ถ้าไม่ตรวจล็อกงวดตรงนี้ ข้อมูลจะไหลเข้างวดที่จ่ายเงินไปแล้วได้เรื่อย ๆ
       * ทิ้งรายการนั้นแทนการโยน error เพื่อไม่ให้ทั้งชุดที่อัปโหลดมาล้มตาม
       */
      const periodLockError = await this.checkWorkDateLocked(employeeId, workDate);

      if (periodLockError) {
        skippedLocked.push(rawRecordId);
        await this.recordRawScanEvent({
          deviceId: device.id,
          rawRecordId,
          deviceUserId,
          logTime,
          payload,
          status: "LOCKED",
          employeeCode: employeeById.get(employeeId)?.employeeCode ?? null,
          errorMessage: periodLockError,
        });
        continue;
      }

      const rule =
        !punch.logType && policy
          ? this.findSessionRuleByTime(policy, logTime)
          : undefined;

      let logType: AttendanceLogType;
      let session: string | null = null;
      let status: AttendanceLogStatus = AttendanceLogStatus.NORMAL;

      if (punch.logType) {
        // เครื่องระบุเข้า/ออกมาเอง ใช้ตามนั้น
        logType = punch.logType;
      } else if (rule) {
        // ตกในหน้าต่างเวลาของรอบไหน = เข้า/ออก + รอบ + สาย ตามนโยบายนั้น
        const resolved = this.resolvePunchRule(policy, rule, logTime);
        logType = resolved.logType;
        session = resolved.session;
        status = resolved.status;
      } else {
        // นอกทุกหน้าต่างเวลา (หรือไม่มีนโยบาย) → สลับเข้า/ออกเป็น fallback
        logType = await this.resolveNextScannerLogType(employeeId, workDate);
      }

      /*
       * กันแตะซ้ำ — ใช้กติกาเดียวกับการลงเวลาผ่านเว็บ/มือถือ
       *
       * เดิมเครื่องสแกนดูแค่ระยะเวลา (ทิ้งถ้ามี log ภายใน ±3 นาที) ซึ่งกันได้แค่
       * แตะรัว ๆ แตะห่างกัน 4 นาทีก็ได้ log ใหม่ทุกครั้ง วันหนึ่งจึงมี log ซ้ำ
       * ของรอบเดียวกันหลายตัว หน้าตรวจเวลารายวันรกจน HR อ่านไม่ออก
       *
       * ตอนนี้ถามตรง ๆ ว่า "วันนี้รอบนี้มีคนแตะไปแล้วหรือยัง" เหมือนที่ punch() ทำ
       * ผลคือแตะกี่ครั้งก็ได้รายการเดียวต่อรอบ ตรงกับที่ผู้ใช้เข้าใจ
       *
       * **ที่ยอมแลก** รอบออกงานจะรับแค่ครั้งแรก คนที่แตะออก 17:05 แล้วกลับมาทำ OT
       * ต่อจนสองทุ่ม เวลาออกจะยังเป็น 17:05 — ตกลงกันแล้วว่าให้ยื่นขอ OT แทน
       *
       * การแตะที่ถูกทิ้งยังถูกเก็บเป็น raw event ไว้ให้ HR ย้อนดูได้ทุกครั้ง
       * ไม่ได้หายไปเฉย ๆ (ดู recordRawScanEvent ด้านล่าง)
       */
      const duplicate = session
        ? await this.prisma.attendanceLog.findFirst({
            where: {
              employeeId,
              workDate,
              session,
              deletedAt: null,
              status: { not: AttendanceLogStatus.CANCELLED },
            },
            select: { id: true, logTime: true },
          })
        : /*
           * ไม่มี session = ตกนอกทุกหน้าต่างเวลา จึงไม่มี "รอบ" ให้เทียบ
           * เคสนี้ยังต้องใช้ระยะเวลาเป็นตัวกัน ไม่งั้นแตะรัว ๆ จะได้ log ทุกครั้ง
           */
          await this.prisma.attendanceLog.findFirst({
            where: {
              employeeId,
              deletedAt: null,
              status: { not: AttendanceLogStatus.CANCELLED },
              logTime: {
                gte: new Date(logTime.getTime() - SCANNER_DEDUP_WINDOW_MS),
                lte: new Date(logTime.getTime() + SCANNER_DEDUP_WINDOW_MS),
              },
            },
            select: { id: true, logTime: true },
          });

      if (duplicate) {
        skippedDuplicate.push(rawRecordId);
        await this.recordRawScanEvent({
          deviceId: device.id,
          rawRecordId,
          deviceUserId,
          logTime,
          payload,
          status: "DUPLICATE",
          employeeCode: employeeById.get(employeeId)?.employeeCode ?? null,
          normalizedLogId: duplicate.id,
          errorMessage: session
            ? `รอบ ${session} ของวันนี้บันทึกไว้แล้วเมื่อ ${this.formatBangkokTime(duplicate.logTime)}`
            : `มีการลงเวลาห่างไม่ถึง 3 นาทีเมื่อ ${this.formatBangkokTime(duplicate.logTime)}`,
        });
        continue;
      }

      const attendanceLog = await this.prisma.attendanceLog.create({
        data: {
          employeeId,
          workDate,
          logType,
          logTime,
          channel: AttendanceChannel.DEVICE,
          status,
          source: "SCANNER",
          session,
          rawScannerRecordId: rawRecordId,
          deviceId: device.id,
          locationId: device.locationId,
          note: punch.note?.trim() || null,
          createdById,
        },
        select: { id: true },
      });

      created.push(attendanceLog.id);

      // เก็บ log ดิบของสแกนที่สร้างการลงเวลาสำเร็จ (MATCHED)
      await this.recordRawScanEvent({
        deviceId: device.id,
        rawRecordId,
        deviceUserId,
        logTime,
        payload,
        status: "MATCHED",
        employeeCode: employeeById.get(employeeId)?.employeeCode ?? null,
        normalizedLogId: attendanceLog.id,
      });

      await this.enqueueDailySummaryRecalculation(
        employeeId,
        workDate,
        createdById ?? "system-device-push",
        {
          sourceType: "ATTENDANCE_LOG",
          sourceId: attendanceLog.id,
          sourceAction: "SCANNER_PUNCH_CREATED",
        },
      );
    }

    const now = new Date();
    await this.prisma.attendanceDevice.update({
      where: { id: device.id },
      data: { lastSyncAt: now, lastOnlineAt: now },
    });

    return {
      deviceId: device.id,
      receivedCount: records.length,
      createdCount: created.length,
      duplicateCount: skippedDuplicate.length,
      lockedCount: skippedLocked.length,
      unmatchedCount: unmatchedDeviceUserIds.size,
      unmatchedDeviceUserIds: [...unmatchedDeviceUserIds],
      syncedAt: now,
    };
  }

  /**
   * เก็บ log ดิบของทุกครั้งที่เครื่องยิงสแกนเข้ามา (audit trail)
   * รวมเคสที่ไม่แมปพนักงาน/ซ้ำ เพื่อให้ตรวจย้อนหลังได้ว่าเกิดอะไรขึ้น
   * best-effort — ถ้าเก็บไม่ได้ก็ไม่ให้กระทบการลงเวลาหลัก
   */
  private async recordRawScanEvent(input: {
    deviceId: string;
    rawRecordId: string;
    deviceUserId: string;
    logTime: Date;
    payload: Prisma.InputJsonValue;
    status: string;
    employeeCode?: string | null;
    normalizedLogId?: string | null;
    errorMessage?: string | null;
  }) {
    try {
      await this.prisma.attendanceRawEvent.create({
        data: {
          deviceId: input.deviceId,
          rawRecordId: input.rawRecordId,
          rawEmployeeRef: input.deviceUserId,
          employeeCode: input.employeeCode ?? null,
          logTime: input.logTime,
          payload: input.payload,
          normalizeStatus: input.status,
          errorMessage: input.errorMessage ?? null,
          normalizedLogId: input.normalizedLogId ?? null,
          normalizedAt: input.normalizedLogId ? new Date() : null,
        },
      });
    } catch (error) {
      // unique (deviceId, rawRecordId) ชน = เคยเก็บแล้ว ไม่เป็นไร
      this.logger.warn(
        `เก็บ raw scan event ไม่สำเร็จ device=${input.deviceId} raw=${input.rawRecordId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** ประวัติการสแกนดิบของเครื่อง (ทุกครั้งที่ยิงเข้ามา) */
  async findDeviceScanLogs(
    deviceId: string,
    scope: TenantScope,
    params: {
      page?: number;
      pageSize?: number;
      status?: string;
      deviceUserId?: string;
    } = {},
  ) {
    const device = await this.findDeviceWithinScope(deviceId, scope);

    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize ?? 50), 1), 200);

    const where: Prisma.AttendanceRawEventWhereInput = {
      deviceId: device.id,
      ...(params.status ? { normalizeStatus: params.status } : {}),
      ...(params.deviceUserId ? { rawEmployeeRef: params.deviceUserId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceRawEvent.findMany({
        where,
        orderBy: { logTime: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendanceRawEvent.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  /**
   * สรุปประวัติการสแกนของเครื่องเป็นรายคน
   *
   * หน้าจอเดิมไล่รายการดิบเรียงตามเวลา พอคนหนึ่งแตะวันละหลายครั้งก็กลายเป็น
   * รายการยาวเหยียดที่ดูไม่ออกว่าใครเป็นใคร ตัวนี้ยุบให้เหลือบรรทัดละคน
   * แล้วค่อยกดเข้าไปดูรายการดิบของคนนั้นทีหลัง
   *
   * จัดกลุ่มด้วยรหัสในเครื่อง ไม่ใช่รหัสพนักงาน เพราะรายการที่ยังไม่ผูกพนักงาน
   * ไม่มีรหัสพนักงานให้จับกลุ่ม แต่ต้องเห็นด้วยว่ามีใครแตะเข้ามา
   */
  async findDeviceScanLogPeople(deviceId: string, scope: TenantScope) {
    const device = await this.findDeviceWithinScope(deviceId, scope);

    const [grouped, enrollments] = await Promise.all([
      this.prisma.attendanceRawEvent.groupBy({
        by: ["rawEmployeeRef", "normalizeStatus"],
        where: { deviceId: device.id },
        _count: { _all: true },
        _max: { logTime: true },
      }),
      this.prisma.attendanceDeviceEnrollment.findMany({
        where: { deviceId: device.id, deletedAt: null },
        include: this.defaultEnrollmentInclude(),
      }),
    ]);

    const enrollmentByDeviceUserId = new Map(
      enrollments.map((item) => [item.deviceUserId, item]),
    );

    type ScanPersonRow = {
      deviceUserId: string;
      employeeId: string | null;
      employeeCode: string | null;
      employeeName: string | null;
      enrolled: boolean;
      total: number;
      matched: number;
      duplicate: number;
      unmatched: number;
      locked: number;
      lastScanAt: Date | null;
    };

    const nameOf = (employee: {
      displayName: string | null;
      firstName: string;
      lastName: string;
      nickname?: string | null;
    } | null | undefined) => {
      if (!employee) return null;

      // หน้าจอ HR — ต่อชื่อเล่นให้เหมือนทุกหน้า
      return employeeDisplayName(employee, { includeTitle: false });
    };

    const rows = new Map<string, ScanPersonRow>();

    for (const item of grouped) {
      const deviceUserId = item.rawEmployeeRef ?? "";
      const enrollment = enrollmentByDeviceUserId.get(deviceUserId);
      const employee = enrollment?.employee ?? null;

      const row: ScanPersonRow = rows.get(deviceUserId) ?? {
        deviceUserId,
        employeeId: employee?.id ?? null,
        employeeCode: employee?.employeeCode ?? null,
        employeeName: nameOf(employee),
        enrolled: Boolean(enrollment),
        total: 0,
        matched: 0,
        duplicate: 0,
        unmatched: 0,
        locked: 0,
        lastScanAt: null,
      };

      const count = item._count._all;
      row.total += count;

      if (item.normalizeStatus === "MATCHED") row.matched += count;
      else if (item.normalizeStatus === "DUPLICATE") row.duplicate += count;
      else if (item.normalizeStatus === "UNMATCHED") row.unmatched += count;
      else if (item.normalizeStatus === "LOCKED") row.locked += count;

      const lastOfGroup = item._max.logTime;
      if (lastOfGroup && (!row.lastScanAt || lastOfGroup > row.lastScanAt)) {
        row.lastScanAt = lastOfGroup;
      }

      rows.set(deviceUserId, row);
    }

    /*
     * คนที่ผูกไว้แล้วแต่ยังไม่เคยแตะ ต้องขึ้นในรายการด้วย
     * ไม่งั้นแยกไม่ออกระหว่าง "ยังไม่มาแตะ" กับ "ยังไม่ได้ผูกกับเครื่อง"
     */
    for (const enrollment of enrollments) {
      if (rows.has(enrollment.deviceUserId)) continue;

      const employee = enrollment.employee ?? null;

      rows.set(enrollment.deviceUserId, {
        deviceUserId: enrollment.deviceUserId,
        employeeId: employee?.id ?? null,
        employeeCode: employee?.employeeCode ?? null,
        employeeName: nameOf(employee),
        enrolled: true,
        total: 0,
        matched: 0,
        duplicate: 0,
        unmatched: 0,
        locked: 0,
        lastScanAt: null,
      });
    }

    // คนที่แตะล่าสุดอยู่บนสุด คนที่ยังไม่เคยแตะไปท้ายสุด
    const items = [...rows.values()].sort((a, b) => {
      if (a.lastScanAt && b.lastScanAt) {
        return b.lastScanAt.getTime() - a.lastScanAt.getTime();
      }

      if (a.lastScanAt) return -1;
      if (b.lastScanAt) return 1;

      return a.deviceUserId.localeCompare(b.deviceUserId, "th");
    });

    return {
      items,
      meta: {
        people: items.length,
        scans: items.reduce((sum, item) => sum + item.total, 0),
        unenrolled: items.filter((item) => !item.enrolled).length,
      },
    };
  }

  /**
   * ส่งทะเบียนพนักงานลงเครื่องสแกน
   *
   * ส่งตรงไปที่เครื่องไม่ได้ — ADMS ให้เครื่องเป็นฝ่ายมาถามเอาคำสั่งไปเอง
   * ตัวนี้จึงแค่ตั้งคำสั่งเข้าคิว แล้วรอเครื่องมา poll (ปกติภายในไม่กี่วินาที)
   *
   * ผูกรหัสในเครื่องให้อัตโนมัติสำหรับคนที่ยังไม่มี เพื่อไม่ให้เกิดกรณีที่ชื่อ
   * ลงเครื่องแล้วแต่ระบบยังไม่รู้ว่ารหัสนั้นเป็นของใคร (แตะแล้วตกเป็นรายการ
   * ไม่มีเจ้าของ) — ผูกในระบบกับส่งลงเครื่องต้องเกิดพร้อมกันเสมอ
   */
  async pushEmployeesToDevice(
    deviceId: string,
    dto: PushDeviceEmployeesDto,
    scope: TenantScope,
    currentUserId: string,
  ) {
    const device = await this.findDeviceWithinScope(deviceId, scope);

    if (device.status !== "ACTIVE") {
      throw new BadRequestException("อุปกรณ์นี้ถูกปิดใช้งานอยู่");
    }

    const employeeIds = dto.employeeIds?.filter(Boolean) ?? [];

    /*
     * ไม่ระบุรายชื่อ = ส่งทั้งสาขาของเครื่อง
     * เครื่องที่ไม่ได้ผูกสาขาไว้จะไม่รู้ว่า "ทั้งสาขา" คือใครบ้าง
     * ให้ผิดพลาดตรงนี้ ดีกว่าเผลอส่งพนักงานทั้งบริษัทลงเครื่องเดียว
     */
    if (employeeIds.length === 0 && !device.branchId) {
      throw new BadRequestException(
        "เครื่องนี้ยังไม่ได้ผูกสาขา — เลือกพนักงานเป็นรายคน หรือกำหนดสาขาให้เครื่องก่อน",
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        ...(employeeIds.length > 0
          ? { id: { in: employeeIds } }
          : { branchId: device.branchId, status: "ACTIVE" }),
      },
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
        firstName: true,
        lastName: true,
        companyId: true,
        branchId: true,
      },
      orderBy: { employeeCode: "asc" },
    });

    if (employees.length === 0) {
      throw new BadRequestException("ไม่พบพนักงานที่จะส่งลงเครื่อง");
    }

    // เลือกรายคนมาก็ต้องอยู่ในขอบเขตที่ผู้ใช้ดูแลอยู่ ไม่ใช่ยิง id อะไรมาก็ได้
    for (const employee of employees) {
      assertWithinScope(scope, {
        companyId: employee.companyId,
        branchId: employee.branchId,
      });
    }

    const enrollments = await this.prisma.attendanceDeviceEnrollment.findMany({
      where: { deviceId: device.id, deletedAt: null },
      select: { id: true, employeeId: true, deviceUserId: true },
    });

    const enrollmentByEmployeeId = new Map(
      enrollments.map((item) => [item.employeeId, item]),
    );

    /*
     * รหัสในเครื่องเป็นเลขรันนิ่ง เริ่มที่ 1 แล้วไล่ต่อจากเลขสูงสุดที่มีอยู่
     * ไม่เอาเลขที่เคยใช้แล้วกลับมาใช้ซ้ำ เพราะลายนิ้วมือเก่าที่ค้างในเครื่อง
     * จะกลายเป็นของคนใหม่ทันทีโดยไม่มีใครรู้
     *
     * ต้องนับรวมแถวที่ยกเลิกการผูกไปแล้วด้วย — เลขที่เคยแจกไปยังอยู่ในเครื่องจริง
     * ไม่ได้หายไปตามแถวในฐานข้อมูล
     */
    const usedDeviceUserIds =
      await this.prisma.attendanceDeviceEnrollment.findMany({
        where: { deviceId: device.id },
        select: { deviceUserId: true },
      });

    let nextDeviceUserId = usedDeviceUserIds.reduce((max, item) => {
      const value = Number(item.deviceUserId);
      return Number.isInteger(value) && value > max ? value : max;
    }, 0);

    const queued: Array<{
      employeeCode: string;
      employeeName: string;
      deviceUserId: string;
      isNew: boolean;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const employee of employees) {
        const existing = enrollmentByEmployeeId.get(employee.id);
        let deviceUserId = existing?.deviceUserId;

        if (!deviceUserId) {
          nextDeviceUserId += 1;
          deviceUserId = String(nextDeviceUserId);

          await tx.attendanceDeviceEnrollment.create({
            data: {
              deviceId: device.id,
              employeeId: employee.id,
              deviceUserId,
              note: "ผูกอัตโนมัติตอนส่งรายชื่อลงเครื่อง",
              status: "ACTIVE",
            },
          });
        }

        await tx.attendanceDeviceCommand.create({
          data: {
            deviceId: device.id,
            employeeId: employee.id,
            kind: "USERINFO",
            command: this.buildUserInfoCommand(deviceUserId, employee.firstName),
            createdById: currentUserId,
          },
        });

        queued.push({
          employeeCode: employee.employeeCode,
          employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
          deviceUserId,
          isNew: !existing,
        });
      }
    });

    return {
      queuedCount: queued.length,
      newEnrollmentCount: queued.filter((item) => item.isNew).length,
      items: queued,
    };
  }

  /**
   * ประกอบคำสั่งลงทะเบียนผู้ใช้ตามรูปแบบของ ADMS (คั่นช่องด้วย tab)
   *
   * ส่งแค่ชื่อจริง ไม่ใส่นามสกุล เพราะช่อง Name ของเครื่องยาวจำกัด (24 ไบต์)
   * ซึ่งภาษาไทยกินตัวละ 3 ไบต์ = ราว 8 ตัวอักษรเท่านั้น ใส่เกินแล้วเครื่องตัดทิ้งเอง
   * แบบไม่บอกใคร ตัดตั้งแต่ต้นทางให้เห็นผลตรงกันดีกว่า
   */
  private buildUserInfoCommand(deviceUserId: string, firstName: string) {
    const name = this.truncateToBytes(firstName.trim(), 24);

    return [
      `DATA UPDATE USERINFO PIN=${deviceUserId}`,
      `Name=${name}`,
      "Pri=0",
      "Passwd=",
      "Card=",
      "Grp=1",
      "TZ=0000000000000000",
      "Verify=-1",
      "ViceCard=",
    ].join("\t");
  }

  /** ตัดข้อความไม่ให้เกินจำนวนไบต์ โดยไม่ตัดกลางตัวอักษร */
  private truncateToBytes(value: string, maxBytes: number) {
    if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;

    let result = "";

    for (const char of value) {
      if (Buffer.byteLength(result + char, "utf8") > maxBytes) break;
      result += char;
    }

    return result;
  }

  /** รายการคำสั่งล่าสุดของเครื่อง ไว้ดูว่าส่งถึงใครแล้วบ้าง */
  async findDeviceCommands(
    deviceId: string,
    scope: TenantScope,
    params: { limit?: number } = {},
  ) {
    const device = await this.findDeviceWithinScope(deviceId, scope);
    const limit = Math.min(Math.max(Number(params.limit ?? 100), 1), 500);

    const [items, grouped] = await Promise.all([
      this.prisma.attendanceDeviceCommand.findMany({
        where: { deviceId: device.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              nickname: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.attendanceDeviceCommand.groupBy({
        by: ["status"],
        where: { deviceId: device.id },
        _count: { _all: true },
      }),
    ]);

    const countOf = (status: string) =>
      grouped.find((item) => item.status === status)?._count._all ?? 0;

    return {
      items,
      meta: {
        pending: countOf("PENDING"),
        sent: countOf("SENT"),
        done: countOf("DONE"),
        failed: countOf("FAILED"),
      },
    };
  }

  /**
   * เครื่องมาถามว่ามีคำสั่งอะไรให้ทำบ้าง (ไม่ผ่านการล็อกอิน ระบุตัวด้วย Serial)
   *
   * ทำเครื่องหมายว่าส่งไปแล้วทันที ไม่รอผลตอบกลับ เพราะถ้าปล่อยไว้เป็น PENDING
   * รอบ poll ถัดไป (ทุก ~5 วินาที) จะหยิบคำสั่งเดิมไปทำซ้ำไม่รู้จบ
   */
  async takePendingCommandsBySerial(serialNo: string, limit = 20) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: { serialNo, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!device || device.status !== "ACTIVE") return [];

    const pending = await this.prisma.attendanceDeviceCommand.findMany({
      where: { deviceId: device.id, status: "PENDING" },
      orderBy: { seq: "asc" },
      take: limit,
      select: { id: true, seq: true, command: true },
    });

    if (pending.length === 0) return [];

    await this.prisma.attendanceDeviceCommand.updateMany({
      where: { id: { in: pending.map((item) => item.id) } },
      data: { status: "SENT", sentAt: new Date() },
    });

    return pending;
  }

  /** เครื่องรายงานผลของคำสั่งกลับมา (Return=0 คือสำเร็จ) */
  async ackDeviceCommand(serialNo: string, seq: number, returnCode: number) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: { serialNo, deletedAt: null },
      select: { id: true },
    });

    if (!device) return;

    await this.prisma.attendanceDeviceCommand.updateMany({
      where: { deviceId: device.id, seq },
      data: {
        status: returnCode === 0 ? "DONE" : "FAILED",
        returnCode,
        respondedAt: new Date(),
        errorMessage:
          returnCode === 0 ? null : `เครื่องตอบรหัสข้อผิดพลาด ${returnCode}`,
      },
    });
  }


  /** สลับเข้า/ออกอัตโนมัติเมื่อเครื่องไม่ได้บอกว่าเป็นสแกนเข้าหรือออก */
  private async resolveNextScannerLogType(employeeId: string, workDate: Date) {
    const latestLog = await this.findLatestLogOfWorkDate(employeeId, workDate);

    return latestLog?.logType === AttendanceLogType.CHECK_IN
      ? AttendanceLogType.CHECK_OUT
      : AttendanceLogType.CHECK_IN;
  }

  private async findDeviceWithinScope(deviceId: string, scope: TenantScope) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: { id: deviceId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException("ไม่พบอุปกรณ์ลงเวลา");
    }

    await this.assertDeviceBranchWithinScope(scope, device.branchId);

    return device;
  }

  private async ensureEmployeeExistsForEnrollment(employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException("ไม่พบพนักงานที่ต้องการผูกกับเครื่อง");
    }
  }

  private async ensureEnrollmentIsAvailable(
    deviceId: string,
    deviceUserId: string,
    employeeId: string,
    ignoreId?: string,
  ) {
    const duplicated = await this.prisma.attendanceDeviceEnrollment.findFirst({
      where: {
        deviceId,
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
        OR: [{ deviceUserId }, { employeeId }],
      },
      select: { deviceUserId: true, employeeId: true },
    });

    if (!duplicated) return;

    throw new BadRequestException(
      duplicated.deviceUserId === deviceUserId
        ? `รหัสผู้ใช้ ${deviceUserId} ถูกใช้ในเครื่องนี้แล้ว`
        : "พนักงานคนนี้ถูกผูกกับเครื่องนี้อยู่แล้ว",
    );
  }

  private defaultEnrollmentInclude() {
    return {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          displayName: true,
          firstName: true,
          lastName: true,
          branchId: true,
          departmentId: true,
        },
      },
    } satisfies Prisma.AttendanceDeviceEnrollmentInclude;
  }

  async findPolicies(query: ListAttendancePoliciesQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const skip = (page - 1) * pageSize;
    const prisma = this.prisma as any;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.employeeTypeId ? { employeeTypeId: query.employeeTypeId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const [items, total, active, inactive, ruleGroups] = await this.prisma.$transaction([
      prisma.attendancePolicy.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          sessionRules: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: "asc" }, { openTime: "asc" }],
          },
        },
        orderBy: [
          { status: "asc" },
          { companyId: "asc" },
          { branchId: "asc" },
          { effectiveFrom: "desc" },
          { code: "asc" },
        ],
      }),
      prisma.attendancePolicy.count({ where }),
      prisma.attendancePolicy.count({ where: { ...where, status: "ACTIVE" } }),
      prisma.attendancePolicy.count({ where: { ...where, status: "INACTIVE" } }),
      prisma.attendanceSessionRule.groupBy({
        by: ["status"],
        where: {
          deletedAt: null,
          policy: where,
        },
        _count: { _all: true },
        orderBy: { status: "asc" },
      }),
    ]);

    const activeRules = ruleGroups.find((item: any) => item.status === "ACTIVE")?._count?._all ?? 0;
    const inactiveRules = ruleGroups.find((item: any) => item.status === "INACTIVE")?._count?._all ?? 0;

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        total,
        active,
        inactive,
        activeRules,
        inactiveRules,
        totalRules: activeRules + inactiveRules,
      },
    };
  }

  async findEffectivePolicy(query: EffectiveAttendancePolicyQueryDto) {
    await this.ensureCompanyExists(query.companyId);

    if (query.branchId) {
      await this.ensureBranchExists(query.branchId, query.companyId);
    }

    const effectiveDate = query.date
      ? this.toDateOnly(query.date)
      : this.getWorkDateFromLogTime(new Date());
    const policy = await this.findEffectivePolicyForScope(
      query.companyId,
      query.branchId ?? null,
      effectiveDate,
      query.employeeTypeId ?? null,
    );

    return (
      policy ??
      this.buildDefaultPolicy(
        query.companyId,
        query.branchId ?? null,
        effectiveDate,
      )
    );
  }

  /**
   * บัญชีระดับสาขาแก้ได้เฉพาะกะของสาขาตัวเองเท่านั้น
   *
   * assertWithinScope ปล่อยผ่านเมื่อ branchId เป็น null เพราะ read path ต้องอ่านค่ากลางของบริษัทได้
   * แต่ write path ปล่อยไม่ได้ ไม่งั้นผู้ใช้สาขาเดียวจะสร้าง/แก้/ปิด กะระดับบริษัท
   * ซึ่งกระทบทุกสาขาที่ไม่ได้ตั้งแยก รวมสาขาที่ตัวเองไม่มีสิทธิ์ด้วย
   */
  private assertShiftWritableByScope(
    scope: TenantScope,
    branchId: string | null | undefined,
  ) {
    assertBranchScopedWrite(scope, branchId, "กะการทำงาน");
  }

  async createPolicy(
    dto: CreateAttendancePolicyDto,
    scope: TenantScope,
    currentUserId: string,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    assertWithinScope(scope, { companyId, branchId: dto.branchId ?? null });
    this.assertShiftWritableByScope(scope, dto.branchId ?? null);

    await this.ensureCompanyExists(companyId);

    if (dto.branchId) {
      await this.ensureBranchExists(dto.branchId, companyId);
    }

    if (dto.employeeTypeId) {
      await this.ensureEmployeeTypeExists(dto.employeeTypeId, companyId);
    }

    const prisma = this.prisma as any;
    const code = dto.code.trim().toUpperCase();
    const duplicated = await prisma.attendancePolicy.findFirst({
      where: { companyId, code, deletedAt: null },
      select: { id: true },
    });

    if (duplicated) {
      throw new BadRequestException("รหัสนโยบายเวลานี้ถูกใช้งานแล้ว");
    }

    const created = await prisma.attendancePolicy.create({
      data: {
        companyId,
        branchId: dto.branchId || null,
        employeeTypeId: dto.employeeTypeId || null,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        morningCheckInDeadline: dto.morningCheckInDeadline ?? "08:00",
        afternoonCheckInDeadline: dto.afternoonCheckInDeadline ?? "13:00",
        checkoutAllowedFrom: dto.checkoutAllowedFrom ?? "17:00",
        latePenaltyRatePerMinute: dto.latePenaltyRatePerMinute ?? 5,
        missingLogPenaltyPerDay: dto.missingLogPenaltyPerDay ?? 50,
        priority: dto.priority ?? 100,
        lateGraceMinutes: dto.lateGraceMinutes ?? 0,
        lateRoundingMinutes: dto.lateRoundingMinutes ?? 0,
        maxLatePenaltyPerDay: dto.maxLatePenaltyPerDay ?? null,
        maxMissingPenaltyPerDay: dto.maxMissingPenaltyPerDay ?? null,
        missingPenaltyMode: dto.missingPenaltyMode ?? "PER_SESSION",
        offsiteEnabled: dto.offsiteEnabled ?? false,
        requireOffsiteApproval: dto.requireOffsiteApproval ?? true,
        timezone: dto.timezone?.trim() || "Asia/Bangkok",
        effectiveFrom: this.toDateOnly(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? this.toDateOnly(dto.effectiveTo) : null,
        status: dto.status ?? "ACTIVE",
      },
    });

    await this.attendanceRecalculationScope.enqueuePolicyImpact({
      policies: [created],
      requestedById: currentUserId,
      sourceId: created.id,
      sourceAction: "CREATE_POLICY",
    });

    return created;
  }

  async updatePolicy(
    id: string,
    dto: UpdateAttendancePolicyDto,
    scope: TenantScope,
    currentUserId: string,
  ) {
    const prisma = this.prisma as any;
    const current = await prisma.attendancePolicy.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบนโยบายเวลาเข้าออกงาน");
    }

    assertWithinScope(scope, {
      companyId: current.companyId,
      branchId: current.branchId,
    });
    // ทั้งกะเดิมและปลายทางที่จะย้ายไป ต้องอยู่ในสาขาที่ตัวเองดูแล
    this.assertShiftWritableByScope(scope, current.branchId);

    if (dto.branchId !== undefined) {
      this.assertShiftWritableByScope(scope, dto.branchId ?? null);
    }

    if (dto.branchId !== undefined && dto.branchId !== null) {
      assertWithinScope(scope, {
        companyId: current.companyId,
        branchId: dto.branchId,
      });
      await this.ensureBranchExists(dto.branchId, current.companyId);
    }

    if (dto.employeeTypeId !== undefined && dto.employeeTypeId !== null) {
      await this.ensureEmployeeTypeExists(dto.employeeTypeId, current.companyId);
    }

    const updated = await prisma.attendancePolicy.update({
      where: { id },
      data: {
        branchId: dto.branchId === undefined ? undefined : dto.branchId || null,
        employeeTypeId:
          dto.employeeTypeId === undefined
            ? undefined
            : dto.employeeTypeId || null,
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        morningCheckInDeadline: dto.morningCheckInDeadline,
        afternoonCheckInDeadline: dto.afternoonCheckInDeadline,
        checkoutAllowedFrom: dto.checkoutAllowedFrom,
        latePenaltyRatePerMinute: dto.latePenaltyRatePerMinute,
        missingLogPenaltyPerDay: dto.missingLogPenaltyPerDay,
        priority: dto.priority,
        lateGraceMinutes: dto.lateGraceMinutes,
        lateRoundingMinutes: dto.lateRoundingMinutes,
        maxLatePenaltyPerDay:
          dto.maxLatePenaltyPerDay === undefined
            ? undefined
            : dto.maxLatePenaltyPerDay,
        maxMissingPenaltyPerDay:
          dto.maxMissingPenaltyPerDay === undefined
            ? undefined
            : dto.maxMissingPenaltyPerDay,
        missingPenaltyMode: dto.missingPenaltyMode,
        offsiteEnabled: dto.offsiteEnabled,
        requireOffsiteApproval: dto.requireOffsiteApproval,
        timezone: dto.timezone?.trim(),
        effectiveFrom: dto.effectiveFrom
          ? this.toDateOnly(dto.effectiveFrom)
          : undefined,
        effectiveTo:
          dto.effectiveTo === undefined
            ? undefined
            : dto.effectiveTo
              ? this.toDateOnly(dto.effectiveTo)
              : null,
        status: dto.status,
      },
    });

    await this.attendanceRecalculationScope.enqueuePolicyImpact({
      policies: [current, updated],
      requestedById: currentUserId,
      sourceId: id,
      sourceAction: "UPDATE_POLICY",
    });

    return updated;
  }

  async removePolicy(
    id: string,
    scope: TenantScope,
    currentUserId: string,
  ) {
    const prisma = this.prisma as any;
    const current = await prisma.attendancePolicy.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        employeeTypeId: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบนโยบายเวลาเข้าออกงาน");
    }

    assertWithinScope(scope, {
      companyId: current.companyId,
      branchId: current.branchId,
    });
    this.assertShiftWritableByScope(scope, current.branchId);

    /* ลบแล้วคือลบจริง — รอบลงเวลาใต้กะนี้ฐานข้อมูลลบตามให้ (Cascade) */
    await assertNotReferenced(
      this.prisma,
      "attendance_policies",
      id,
      "กะการทำงานนี้",
    );

    await prisma.attendancePolicy.delete({ where: { id } });

    await this.attendanceRecalculationScope.enqueuePolicyImpact({
      policies: [current],
      requestedById: currentUserId,
      sourceId: id,
      sourceAction: "REMOVE_POLICY",
    });

    return { id, deleted: true };
  }

  /* ------------------------------------------------------------------ */
  /* ผูกพนักงานเข้ากะการทำงาน                                             */
  /* ------------------------------------------------------------------ */

  /**
   * พนักงานทั้งหมดในขอบเขต พร้อมบอกว่าใครถูกผูกกะไหนอยู่
   * คนที่ไม่ถูกผูกจะขึ้นว่าใช้กะตามสาขา/บริษัท ตามเดิม
   */
  async findEmployeeShiftAssignments(
    query: ListEmployeeWorkShiftsQueryDto,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const companyId = effectiveCompanyId(scope, query.companyId);
    const branchId = query.branchId?.trim() || null;

    // กันไม่ให้ผู้ใช้ระดับสาขาขอดูข้ามสาขา หรือระดับบริษัทขอข้ามบริษัท
    assertWithinScope(scope, { companyId: companyId ?? null, branchId });

    const where: Record<string, unknown> = {
      deletedAt: null,
      status: "ACTIVE",
      // tenantWhere ล็อกตามสิทธิ์จริงของผู้ใช้ ตัวกรองด้านล่างทำได้แค่แคบลง
      ...tenantWhere(scope),
      ...(companyId ? { companyId } : {}),
      ...(branchId ? { branchId } : {}),
    };

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { employeeCode: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { nickname: { contains: search, mode: "insensitive" } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
        title: true,
        firstName: true,
        lastName: true,
        branchId: true,
        employeeTypeId: true,
        // ต้องส่งไปให้หน้าเว็บแสดงสถานะการยกเว้นปัจจุบัน ไม่งั้นผู้ใช้ติ๊กทับของเดิมโดยไม่รู้ตัว
        attendanceTrackingRequired: true,
        attendanceExemptSessions: true,
        branch: { select: { id: true, code: true, nameTh: true } },
        // แผนกใช้จัดกลุ่มรายชื่อ ให้ตรงกับหน้าตรวจเวลาทำงานและทะเบียนพนักงาน
        department: { select: { id: true, code: true, nameTh: true } },
        employeeType: { select: { id: true, nameTh: true } },
        // ระดับตำแหน่งใช้เรียงผู้บริหารขึ้นก่อน ให้ตรงกับรายชื่อหน้าอื่นของระบบ
        positionMaster: { select: { id: true, nameTh: true, level: true } },
        workShifts: {
          where: {
            status: "ACTIVE",
            deletedAt: null,
            policy: { status: "ACTIVE", deletedAt: null },
          },
          select: {
            id: true,
            policyId: true,
            effectiveFrom: true,
            effectiveTo: true,
            note: true,
            policy: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ effectiveFrom: "desc" }],
        },
      },
      orderBy: [
        { positionMaster: { level: "asc" } },
        { employeeCode: "asc" },
      ],
      take: 500,
    });

    const items = employees.map((employee: any) => ({
      ...employee,
      assignment: employee.workShifts?.[0] ?? null,
    }));

    const filtered =
      query.assignment === "ASSIGNED"
        ? items.filter((item: any) => item.assignment)
        : query.assignment === "UNASSIGNED"
          ? items.filter((item: any) => !item.assignment)
          : items;

    return {
      items: filtered,
      summary: {
        total: items.length,
        assigned: items.filter((item: any) => item.assignment).length,
        unassigned: items.filter((item: any) => !item.assignment).length,
      },
    };
  }

  /**
   * ตั้งการยกเว้นการลงเวลาให้พนักงานหลายคนพร้อมกัน
   *
   * แยกเป็น endpoint ของตัวเองแทนที่จะไปฝากไว้กับการแก้ข้อมูลพนักงาน
   * เพราะคนที่ตั้งเรื่องนี้คือผู้ดูแลกะการทำงาน ไม่ใช่ HR ที่แก้ประวัติพนักงาน
   * และต้องตั้งทีละหลายคนได้ (เช่น ทั้งตำแหน่งพนักงานจัดส่ง)
   *
   * ส่งเฉพาะฟิลด์ที่ต้องการเปลี่ยน ฟิลด์ที่ไม่ส่งมาจะคงค่าเดิมไว้
   */
  async updateEmployeeAttendanceExemptions(
    dto: UpdateEmployeeAttendanceExemptionDto,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;

    const employees = await prisma.employee.findMany({
      where: {
        id: { in: dto.employeeIds },
        deletedAt: null,
        ...(tenantWhere(scope) as Prisma.EmployeeWhereInput),
      },
      select: { id: true, companyId: true, branchId: true },
    });

    if (employees.length !== dto.employeeIds.length) {
      throw new NotFoundException(
        'มีพนักงานบางคนไม่พบ หรืออยู่นอกขอบเขตที่คุณดูแล',
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.trackingRequired !== undefined) {
      data.attendanceTrackingRequired = dto.trackingRequired;
    }
    if (dto.exemptSessions !== undefined) {
      data.attendanceExemptSessions = dto.exemptSessions;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('ไม่มีข้อมูลที่ต้องแก้ไข');
    }

    const result = await prisma.employee.updateMany({
      where: { id: { in: dto.employeeIds } },
      data,
    });

    return { updated: result.count };
  }

  /** ผูกพนักงานหลายคนเข้ากะเดียว — ปิดการผูกเดิมของแต่ละคนก่อนเพื่อไม่ให้ซ้อนกัน */
  async assignEmployeesToShift(
    policyId: string,
    dto: AssignEmployeeWorkShiftDto,
    scope: TenantScope,
    currentUserId: string,
  ) {
    const prisma = this.prisma as any;

    const policy = await prisma.attendancePolicy.findFirst({
      where: { id: policyId, deletedAt: null },
      select: { id: true, companyId: true, branchId: true },
    });

    if (!policy) {
      throw new NotFoundException("ไม่พบกะการทำงานนี้");
    }

    assertWithinScope(scope, {
      companyId: policy.companyId,
      branchId: policy.branchId,
    });

    const employees = await prisma.employee.findMany({
      where: {
        id: { in: dto.employeeIds },
        companyId: policy.companyId,
        deletedAt: null,
        // กะที่ผูกกับสาขา รับได้เฉพาะพนักงานสาขานั้น
        ...(policy.branchId ? { branchId: policy.branchId } : {}),
        // ผู้ใช้ระดับสาขาจัดคนข้ามสาขาไม่ได้
        ...tenantWhere(scope),
      },
      select: { id: true },
    });

    if (employees.length !== dto.employeeIds.length) {
      throw new BadRequestException(
        policy.branchId
          ? "มีพนักงานบางคนไม่ได้อยู่ในสาขาของกะนี้ หรืออยู่นอกสิทธิ์ของคุณ"
          : "มีพนักงานบางคนไม่อยู่ในบริษัทเดียวกับกะนี้ หรืออยู่นอกสิทธิ์ของคุณ",
      );
    }

    const effectiveFrom = dto.effectiveFrom
      ? this.toDateOnly(dto.effectiveFrom)
      : this.getWorkDateFromLogTime(new Date());
    const effectiveTo = dto.effectiveTo ? this.toDateOnly(dto.effectiveTo) : null;

    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException("วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มมีผล");
    }

    await this.prisma.$transaction(async (tx: any) => {
      // 1 คนอยู่ได้กะเดียว ณ เวลาหนึ่ง ปิดของเดิมทิ้งก่อน
      await tx.employeeWorkShift.updateMany({
        where: {
          employeeId: { in: dto.employeeIds },
          status: "ACTIVE",
          deletedAt: null,
        },
        data: { status: "INACTIVE", deletedAt: new Date() },
      });

      await tx.employeeWorkShift.createMany({
        data: dto.employeeIds.map((employeeId) => ({
          employeeId,
          policyId,
          effectiveFrom,
          effectiveTo,
          note: dto.note?.trim() || null,
          assignedById: currentUserId,
          status: "ACTIVE" as const,
        })),
      });
    });

    return { policyId, assigned: dto.employeeIds.length };
  }

  /** เอาพนักงานออกจากกะ กลับไปใช้กะตามสาขา/บริษัท */
  async removeEmployeesFromShift(
    policyId: string,
    dto: AssignEmployeeWorkShiftDto,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;

    const policy = await prisma.attendancePolicy.findFirst({
      where: { id: policyId, deletedAt: null },
      select: { id: true, companyId: true, branchId: true },
    });

    if (!policy) {
      throw new NotFoundException("ไม่พบกะการทำงานนี้");
    }

    assertWithinScope(scope, {
      companyId: policy.companyId,
      branchId: policy.branchId,
    });

    const result = await prisma.employeeWorkShift.updateMany({
      where: {
        policyId,
        employeeId: { in: dto.employeeIds },
        status: "ACTIVE",
        deletedAt: null,
      },
      data: { status: "INACTIVE", deletedAt: new Date() },
    });

    return { policyId, removed: result.count };
  }

  async getPunchContext(
    currentUserId: string,
    query: PunchContextQueryDto = {},
  ) {
    const employee = await this.findEmployeeByUserId(currentUserId);
    const punchedAt = query.punchedAt ? new Date(query.punchedAt) : new Date();

    if (Number.isNaN(punchedAt.getTime())) {
      throw new BadRequestException("เวลาที่ส่งมาไม่ถูกต้อง");
    }

    const workDate = await this.resolveWorkDateForPunch(employee, punchedAt);
    const holiday =
      await this.systemSettingsService.getEmployeeAttendanceHolidayInfo(
        workDate,
        employee,
      );
    const policy = await this.getPunchPolicy(employee, workDate);
    const rules = this.getPolicySessionRules(policy);
    /*
     * วันหยุดก็หารอบให้ตามปกติ — เดิมบังคับเป็น null ทำให้แอปได้
     * currentSession เป็น null แล้วปุ่มลงเวลาดับทั้งวัน ทั้งที่พนักงานถูก
     * เรียกมาทำงานจริง
     */
    const currentRule = query.punchType
      ? this.findSessionRuleByCode(policy, query.punchType)
      : this.findSessionRuleByTime(policy, punchedAt);
    const todayLogs = await this.prisma.attendanceLog.findMany({
      where: {
        employeeId: employee.id,
        workDate,
        deletedAt: null,
        status: { not: AttendanceLogStatus.CANCELLED },
      },
      orderBy: [{ logTime: "asc" }],
      include: this.defaultAttendanceLogInclude(),
    });

    const approvedOffsiteRequests =
      await this.offsiteLocationVerification.listApprovedForPunch({
        employeeId: employee.id,
        workDate,
      });

    const preview = currentRule
      ? this.resolvePunchRule(policy, currentRule, punchedAt)
      : null;
    const existing = preview
      ? todayLogs.find((log) => log.session === preview.session)
      : null;

    // geofence บังคับเฉพาะพนักงานที่ตั้ง attendanceGeofenceRequired เท่านั้น
    const geofenceRequired = employee.attendanceGeofenceRequired;
    /*
     * ดึงพิกัดสาขาเสมอ ไม่ใช่เฉพาะตอนบังคับตรวจ — แอปมือถือเอาไปบอกพนักงานที่
     * ลงเวลาได้ทุกที่ว่าตอนนี้อยู่ห่างจากบริษัทเท่าไร เดิมคืน null ให้คนกลุ่มนี้
     * แอปจึงไม่มีพิกัดอ้างอิงเลยและคำนวณระยะไม่ได้
     *
     * การ "บังคับ" ยังอ่านจาก `attendanceMethods.geofenceRequired` ตัวเดียว
     * เหมือนเดิม การมีพิกัดติดมาไม่ได้แปลว่าต้องอยู่ในเขต
     */
    const geofenceLocation = await this.resolveBranchGeofenceLocation(employee);

    return {
      workDate,
      punchedAt,
      holiday,
      attendanceMethods: {
        allowed: employee.allowedAttendanceMethods ?? [],
        geofenceRequired,
      },
      geofence: geofenceLocation
        ? {
            locationId: geofenceLocation.id,
            code: geofenceLocation.code,
            name: geofenceLocation.nameTh,
            latitude: Number(geofenceLocation.latitude),
            longitude: Number(geofenceLocation.longitude),
            radiusMeters: geofenceLocation.radiusMeters,
            /* มีพิกัดไม่ได้แปลว่าบังคับ — ธงบังคับมาจากตัวพนักงานอย่างเดียว */
            required: geofenceRequired,
          }
        : null,
      policy: {
        id: policy.id,
        code: policy.code,
        name: policy.name,
        timezone: policy.timezone ?? "Asia/Bangkok",
        isDefault: Boolean(policy.isDefault),
      },
      currentSession: preview
        ? {
            ruleId: currentRule!.id,
            sessionCode: preview.sessionCode,
            label: currentRule!.label,
            punchType: currentRule!.punchType,
            openTime: currentRule!.openTime,
            expectedTime: currentRule!.expectedTime,
            closeTime: currentRule!.closeTime,
            statusPreview: preview.status,
            lateMinutesPreview: preview.lateMinutes,
            earlyLeaveMinutesPreview: preview.earlyLeaveMinutes,
            earlyLeavePenaltyPerMinute:
              preview.rule.punchType === "CHECK_OUT"
                ? this.resolveEarlyLeavePenaltyPerMinute(preview.rule, policy)
                : 0,
            earlyLeavePenaltyPreview:
              preview.earlyLeaveMinutes * this.resolveEarlyLeavePenaltyPerMinute(preview.rule, policy),
            canPunch: !existing && !preview.isOutsideSession,
            blockReason: existing ? "วันนี้มีการบันทึกรอบนี้แล้ว" : null,
          }
        : null,
      sessionRules: rules.map((rule) => ({
        id: rule.id,
        sessionCode: rule.sessionCode,
        label: rule.label,
        punchType: rule.punchType,
        openTime: rule.openTime,
        expectedTime: rule.expectedTime,
        closeTime: rule.closeTime,
        lateAfterTime: rule.lateAfterTime ?? null,
        earlyBeforeTime: rule.earlyBeforeTime ?? null,
        lateOutAfterTime: rule.lateOutAfterTime ?? null,
        latePenaltyPerMinute: Number(rule.latePenaltyPerMinute ?? 0),
        missingPenaltyAmount: Number(rule.missingPenaltyAmount ?? 0),
        earlyLeavePenaltyPerMinute: this.resolveEarlyLeavePenaltyPerMinute(rule, policy),
        sortOrder: rule.sortOrder,
      })),
      todayLogs,
      approvedOffsiteRequests,
    };
  }

  async punch(
    dto: PunchAttendanceDto,
    currentUserId: string,
    requestMeta: RequestMeta,
  ) {
    const employee = await this.findEmployeeByUserId(currentUserId);
    const punchedAt = dto.punchedAt ? new Date(dto.punchedAt) : new Date();

    if (Number.isNaN(punchedAt.getTime())) {
      throw new BadRequestException("เวลาที่ส่งมาไม่ถูกต้อง");
    }

    const workDate = await this.resolveWorkDateForPunch(employee, punchedAt);
    // งวดที่ปิดและจ่ายเงินไปแล้ว ห้ามมีเวลาไหลเข้าเพิ่มไม่ว่าจากทางไหน
    await this.ensureWorkDateNotLocked(employee.id, workDate);
    const policy = await this.getPunchPolicy(employee, workDate);
    const rule = dto.punchType
      ? this.findSessionRuleByCode(policy, dto.punchType)
      : this.findSessionRuleByTime(policy, punchedAt);

    if (!rule) {
      throw new BadRequestException(
        dto.punchType
          ? "ไม่พบรอบลงเวลานี้ในนโยบายที่มีผลกับพนักงาน"
          : "เวลานี้อยู่นอกช่วงรอบลงเวลาที่ตั้งค่าไว้",
      );
    }

    const resolved = this.resolvePunchRule(policy, rule, punchedAt);

    if (resolved.isOutsideSession) {
      throw new BadRequestException(
        `เวลานี้อยู่นอกช่วง ${rule.label} (${rule.openTime}-${rule.closeTime})`,
      );
    }

    const channel = this.resolvePunchChannel(dto.source, dto);
    // ตรวจว่าพนักงานได้รับอนุญาตให้ลงเวลาด้วยวิธีนี้หรือไม่ (เว็บ/แอป/เครื่องสแกน)
    this.assertAttendanceMethodAllowed(employee, dto.source);
    await this.ensureAttendanceRefsAreValid(dto.locationId, dto.deviceId);
    if (!dto.offsiteRequestId) {
      await this.validateGpsAttendanceLocation({ ...dto, channel });
    }

    const offsiteVerification = dto.offsiteRequestId
      ? await this.offsiteLocationVerification.verifyForPunch({
          employeeId: employee.id,
          workDate,
          punchedAt,
          offsiteRequestId: dto.offsiteRequestId,
        })
      : null;

    // ลงเวลาที่สำนักงาน (ไม่ใช่ offsite) → บังคับ geofence เฉพาะพนักงานที่ตั้ง attendanceGeofenceRequired
    // การลงเวลา Offsite ตรวจจากคำขอ วันที่ และช่วงเวลา โดยไม่เก็บหรือตรวจพิกัด
    const officeVerification =
      dto.offsiteRequestId || !employee.attendanceGeofenceRequired
        ? null
        : await this.enforceBranchGeofence(employee, dto);

    const prisma = this.prisma as any;
    const existing = await prisma.attendanceLog.findFirst({
      where: {
        employeeId: employee.id,
        workDate,
        session: resolved.session,
        deletedAt: null,
        status: { not: AttendanceLogStatus.CANCELLED },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException("วันนี้มีการบันทึกรายการนี้แล้ว");
    }

    const attendanceLog = await prisma.attendanceLog.create({
      data: {
        employeeId: employee.id,
        workDate,
        logType: resolved.logType,
        logTime: punchedAt,
        channel,
        source: dto.source ?? this.mapChannelToPunchSource(channel),
        session: resolved.session,
        status: resolved.status,
        locationId: dto.locationId ?? officeVerification?.locationId,
        deviceId: dto.deviceId,
        latitude: dto.offsiteRequestId ? null : dto.latitude,
        longitude: dto.offsiteRequestId ? null : dto.longitude,
        gpsAccuracy: dto.offsiteRequestId ? null : dto.gpsAccuracy,
        isOffsite: Boolean(dto.offsiteRequestId),
        offsiteRequestId: dto.offsiteRequestId,
        locationVerified:
          officeVerification?.verified ??
          offsiteVerification?.locationVerified ??
          null,
        distanceFromApprovedLocationMeters:
          officeVerification?.distanceMeters ?? null,
        gpsVerificationStatus:
          officeVerification?.status ?? null,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        note: this.buildPunchNote(
          this.buildOffsitePunchNote(dto.note, offsiteVerification),
          rule,
          resolved,
        ),
        createdById: currentUserId,
      },
      include: this.defaultAttendanceLogInclude(),
    });

    await this.enqueueDailySummaryRecalculation(
      employee.id,
      workDate,
      currentUserId,
      {
        sourceType: "ATTENDANCE_LOG",
        sourceId: attendanceLog.id,
        sourceAction: "SESSION_PUNCH_CREATED",
      },
    );

    return attendanceLog;
  }

  private assertAttendanceEntityWithinScope(
    scope: TenantScope,
    target: { companyId: string | null; branchId: string | null },
  ) {
    if (scope.level === "GLOBAL") return;

    if (!scope.companyId || target.companyId !== scope.companyId) {
      throw new ForbiddenException("ไม่มีสิทธิ์เข้าถึงข้อมูลของบริษัทนี้");
    }

    if (
      scope.level === "BRANCH" &&
      (!scope.branchId || target.branchId !== scope.branchId)
    ) {
      throw new ForbiddenException("ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขานี้");
    }
  }

  private async normalizeAttendanceScopeFilters<
    T extends { companyId?: string; branchId?: string },
  >(input: T, scope: TenantScope): Promise<T> {
    assertWithinScope(scope, {
      companyId: input.companyId,
      branchId: input.branchId,
    });

    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, deletedAt: null },
        select: { id: true, companyId: true },
      });

      if (!branch) {
        throw new NotFoundException("ไม่พบสาขาที่เลือก");
      }

      if (input.companyId && branch.companyId !== input.companyId) {
        throw new BadRequestException(
          "สาขาที่เลือกไม่ได้อยู่ภายใต้บริษัทที่ระบุ",
        );
      }

      this.assertAttendanceEntityWithinScope(scope, {
        companyId: branch.companyId,
        branchId: branch.id,
      });
    }

    return {
      ...input,
      companyId: effectiveCompanyId(scope, input.companyId),
      branchId:
        scope.level === "BRANCH"
          ? (scope.branchId ?? undefined)
          : input.branchId,
    };
  }

  private async assertEmployeesWithinAttendanceScope(
    employeeIds: string[],
    scope: TenantScope,
  ) {
    const uniqueIds = Array.from(new Set(employeeIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, companyId: true, branchId: true },
    });

    if (employees.length !== uniqueIds.length) {
      throw new NotFoundException("ไม่พบพนักงานบางรายการที่เลือก");
    }

    for (const employee of employees) {
      this.assertAttendanceEntityWithinScope(scope, employee);
    }

    return employees;
  }

  private async loadDailySummariesWithinAttendanceScope(
    summaryIds: string[],
    scope: TenantScope,
  ) {
    const uniqueIds = Array.from(new Set(summaryIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    const prisma = this.prisma as any;
    const summaries = await prisma.attendanceDailySummary.findMany({
      where: { id: { in: uniqueIds } },
      include: this.defaultDailySummaryInclude(),
    });

    if (summaries.length !== uniqueIds.length) {
      throw new NotFoundException("ไม่พบสรุปเวลาบางรายการที่เลือก");
    }

    for (const summary of summaries) {
      this.assertAttendanceEntityWithinScope(scope, {
        companyId: summary.employee?.companyId ?? null,
        branchId: summary.employee?.branchId ?? null,
      });
    }

    return summaries;
  }

  async findDailySummaries(
    query: ListAttendanceDailySummariesQueryDto,
    tenantScope: TenantScope,
  ) {
    const scopedQuery = await this.normalizeAttendanceScopeFilters(
      query,
      tenantScope,
    );

    if (scopedQuery.employeeId) {
      await this.assertEmployeesWithinAttendanceScope(
        [scopedQuery.employeeId],
        tenantScope,
      );
    }

    return this.findDailySummariesByScope(scopedQuery, undefined, tenantScope);
  }

  async findMyDailySummaries(
    currentUserId: string,
    query: ListAttendanceDailySummariesQueryDto,
  ) {
    const employee = await this.findEmployeeByUserId(currentUserId);
    return this.findDailySummariesByScope({
      ...query,
      employeeId: employee.id,
    });
  }

  async findTeamDailySummaries(
    currentUserId: string,
    query: ListAttendanceDailySummariesQueryDto,
  ) {
    const manager = await this.findEmployeeByUserId(currentUserId);
    const teamMembers = await this.prisma.employee.findMany({
      where: {
        supervisorId: manager.id,
        deletedAt: null,
        status: { notIn: ["RESIGNED", "TERMINATED", "INACTIVE"] },
      },
      select: { id: true },
    });

    return this.findDailySummariesByScope(query, {
      employeeIds: teamMembers.map((employee) => employee.id),
    });
  }

  async recalculateDailySummaries(
    dto: RecalculateAttendanceDailySummariesDto,
    currentUserId: string,
    tenantScope: TenantScope = { level: "GLOBAL", companyId: null, branchId: null },
  ) {
    const progressId = dto.progressId?.trim();

    if (progressId) {
      this.attendanceProgressService.start(progressId, currentUserId);
    }

    const updateProgress = (
      input: Parameters<AttendanceProgressService["update"]>[2],
    ) => {
      if (!progressId) return;
      this.attendanceProgressService.update(progressId, currentUserId, input);
    };

    const completeProgress = (
      result: {
        calculated: number;
        skippedLocked: number;
        errorCount: number;
      },
      message?: string,
    ) => {
      if (!progressId) return;
      this.attendanceProgressService.complete(
        progressId,
        currentUserId,
        result,
        message,
      );
    };

    /* ผู้ใช้กดหยุดหรือยัง — ลูปคำนวณถามที่ขอบของแต่ละกลุ่ม */
    const isCancelRequested = () =>
      Boolean(progressId) &&
      this.attendanceProgressService.isCancelRequested(progressId as string);

    const cancelProgress = (result: {
      calculated: number;
      skippedLocked: number;
      errorCount: number;
    }) => {
      if (!progressId) return;
      this.attendanceProgressService.cancelled(
        progressId,
        currentUserId,
        result,
      );
    };

    try {
      dto = await this.normalizeAttendanceScopeFilters(dto, tenantScope);
      if (dto.employeeId) {
        await this.assertEmployeesWithinAttendanceScope(
          [dto.employeeId],
          tenantScope,
        );
      }

      updateProgress({
        step: "VALIDATE_RANGE",
        message: "ตรวจสอบช่วงวันที่ที่ต้องการคำนวณ",
        percent: 5,
      });

      const dateFrom = this.toDateOnly(dto.dateFrom);
      const requestedDateTo = this.toDateOnly(dto.dateTo);

      if (dateFrom > requestedDateTo) {
        throw new BadRequestException("dateFrom ต้องไม่มากกว่า dateTo");
      }

      const dateTo = this.capDateToToday(requestedDateTo);

      if (dateFrom > dateTo) {
        const result = {
          calculated: 0,
          skippedLocked: 0,
          errorCount: 0,
          employeeCount: 0,
          dayCount: 0,
          items: [],
          errors: [],
        };
        completeProgress(result, "ไม่มีวันที่ที่ต้องคำนวณ");
        return result;
      }

      const dayCount = this.countDaysInclusive(dateFrom, dateTo);

      if (dayCount > MAX_RECALCULATE_DAYS) {
        throw new BadRequestException(
          `คำนวณย้อนหลังได้ไม่เกิน ${MAX_RECALCULATE_DAYS} วันต่อครั้ง`,
        );
      }

      updateProgress({
        step: "LOAD_EMPLOYEES",
        message: "กำลังโหลดรายชื่อพนักงานตามตัวกรอง",
        percent: 10,
        dayCount,
      });

      // ล็อกขอบเขตตาม scope ของผู้ใช้: COMPANY/BRANCH จะถูกบังคับเป็นบริษัท/สาขาของตนเสมอ
      // (แม้ client ไม่ได้ส่งตัวกรองมา) เพื่อกันการคำนวณข้ามบริษัท
      assertWithinScope(tenantScope, {
        companyId: dto.companyId,
        branchId: dto.branchId,
      });
      const scopedCompanyId = effectiveCompanyId(tenantScope, dto.companyId);
      const scopedBranchId =
        tenantScope.level === "BRANCH"
          ? (tenantScope.branchId ?? undefined)
          : dto.branchId;

      const employees = await this.prisma.employee.findMany({
        where: {
          deletedAt: null,
          /*
           * ใครควรถูกคำนวณสรุปเวลาในช่วงนี้
           *
           * เดิมตัดคนที่สถานะเป็น RESIGNED ออกทั้งหมด คนที่ทำงานถึงกลางงวด
           * แล้วลาออกจึงไม่มีสรุปเวลาสักวันเดียว ทั้งที่มาทำงานจริงครึ่งงวด
           * ผลคือสาย/ขาด/ลาไม่รับค่าจ้างของเขาไม่เข้าเงินเดือนงวดสุดท้าย
           * และหน้าตรวจก่อนเข้าเงินเดือนก็ปิดงวดไม่ได้เพราะข้อมูลไม่ครบ
           *
           * เปลี่ยนเป็นดูว่า "ช่วงที่เป็นพนักงานทับกับช่วงที่คำนวณไหม"
           * ให้ตรงกับเกณฑ์ที่ payroll ใช้เลือกคนเข้างวด (findLatestCompensationsForRun)
           */
          OR: [
            {
              employmentEndDate: null,
              status: { notIn: ["RESIGNED", "TERMINATED", "INACTIVE"] },
            },
            { employmentEndDate: { gte: dateFrom } },
          ],
          ...(dto.employeeId ? { id: dto.employeeId } : {}),
          ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
          ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
          ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
        },
        select: {
          id: true,
          companyId: true,
          startDate: true,
          employmentEndDate: true,
          branchId: true,
          departmentId: true,
          divisionId: true,
          employeeTypeId: true,
          employeeCode: true,
          nickname: true,
          firstName: true,
          lastName: true,
          displayName: true,
          attendanceTrackingRequired: true,
          attendanceExemptSessions: true,
        },
        orderBy: [{ employeeCode: "asc" }],
      });

      const employeeIds = employees.map((employee) => employee.id);
      const workDates = this.enumerateDateOnlyRange(dateFrom, dateTo);
      const totalItems = employeeIds.length * workDates.length;

      updateProgress({
        step: "PREPARE_DATA",
        message: `พบพนักงาน ${employees.length} ราย รวม ${totalItems} รายการที่ต้องตรวจ`,
        percent: 16,
        employeeCount: employees.length,
        dayCount,
        totalItems,
        processedItems: 0,
      });

      if (employeeIds.length === 0) {
        const result = {
          calculated: 0,
          skippedLocked: 0,
          errorCount: 0,
          employeeCount: 0,
          dayCount,
          items: [],
          errors: [],
        };
        completeProgress(result, "ไม่พบพนักงานตามตัวกรองที่เลือก");
        return result;
      }

      const prisma = this.prisma as any;

      updateProgress({
        step: "LOAD_LOCKED_SUMMARIES",
        message: "ตรวจสอบรายการที่ล็อกและส่งเข้า Payroll แล้ว",
        percent: 20,
      });

      const lockedSummaries = await prisma.attendanceDailySummary.findMany({
        where: {
          employeeId: { in: employeeIds },
          workDate: { gte: dateFrom, lte: dateTo },
          OR: [
            { lockedAt: { not: null } },
            { sentToPayrollAt: { not: null } },
            { payrollRunId: { not: null } },
            { reviewStatus: { in: [AttendanceReviewStatus.LOCKED, AttendanceReviewStatus.SENT_TO_PAYROLL] } },
          ],
        },
        select: { employeeId: true, workDate: true },
      });
      const lockedSummaryKeys = new Set(
        lockedSummaries.map(
          (summary: any) =>
            `${summary.employeeId}:${this.toDateKey(summary.workDate)}`,
        ),
      );

      updateProgress({
        step: "LOAD_SOURCE_DATA",
        message: "กำลังโหลดเวลาเข้าออก การลา ค่าตอบแทน และ OT",
        percent: 25,
      });

      const [
        logs,
        leaves,
        compensations,
        approvedOvertimeRequests,
        offsiteRequests,
        timeAdjustRequests,
        pendingLeaves,
        pendingOvertimeRequests,
      ] = await Promise.all([
          this.prisma.attendanceLog.findMany({
            where: {
              employeeId: { in: employeeIds },
              workDate: { gte: dateFrom, lte: dateTo },
              deletedAt: null,
              status: { not: AttendanceLogStatus.CANCELLED },
            },
            orderBy: [
              { employeeId: "asc" },
              { workDate: "asc" },
              { logTime: "asc" },
            ],
          }),
          prisma.leaveRequest.findMany({
            where: {
              employeeId: { in: employeeIds },
              status: "APPROVED",
              deletedAt: null,
              startDate: { lte: dateTo },
              endDate: { gte: dateFrom },
            },
            include: { leaveType: true },
            orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
          }),
          prisma.employeeCompensation.findMany({
            where: {
              employeeId: { in: employeeIds },
              effectiveDate: { lte: dateTo },
              status: "ACTIVE",
              deletedAt: null,
            },
            orderBy: [
              { employeeId: "asc" },
              { effectiveDate: "desc" },
              { updatedAt: "desc" },
            ],
            select: {
              employeeId: true,
              effectiveDate: true,
              baseSalary: true,
              salaryBasis: true,
              updatedAt: true,
            },
          }),
          prisma.overtimeRequest.findMany({
            where: {
              employeeId: { in: employeeIds },
              status: "APPROVED",
              deletedAt: null,
              workDate: { gte: dateFrom, lte: dateTo },
            },
            orderBy: [
              { employeeId: "asc" },
              { workDate: "asc" },
              { startTime: "asc" },
            ],
            select: {
              id: true,
              requestNo: true,
              employeeId: true,
              workDate: true,
              startTime: true,
              endTime: true,
              totalHours: true,
              workType: true,
              reason: true,
              approvedAt: true,
            },
          }),
          /* คำขอนอกสถานที่ทั้งช่วง ใช้ได้ทั้งตอนคิด coverage และตอนนับคำขอค้าง */
          prisma.offsiteWorkRequest.findMany({
            where: {
              employeeId: { in: employeeIds },
              workDate: { gte: dateFrom, lte: dateTo },
              deletedAt: null,
              status: { not: "CANCELLED" },
            },
            orderBy: [{ createdAt: "desc" }],
          }),
          /*
           * คำขอแก้เวลาเทียบด้วย requestedLogTime ซึ่งเป็นเวลาจริง ไม่ใช่ workDate
           * จึงต้องกางขอบเขตเป็นเวลาไทยของวันแรกถึงวันสุดท้าย แล้วค่อยจัดกลุ่มตามวันไทย
           */
          prisma.timeAdjustRequest.findMany({
            where: {
              employeeId: { in: employeeIds },
              deletedAt: null,
              status: { not: "DRAFT" },
              requestedLogTime: {
                gte: this.buildBangkokDateTimeBoundary(dateFrom),
                lte: this.buildBangkokDateTimeBoundary(dateTo, true),
              },
            },
            orderBy: [{ requestedLogTime: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              employeeId: true,
              requestNo: true,
              adjustType: true,
              targetLogType: true,
              originalAttendanceLogId: true,
              appliedAttendanceLogId: true,
              originalLogTime: true,
              requestedLogTime: true,
              status: true,
              submittedAt: true,
              approvedAt: true,
              rejectedAt: true,
              cancelledAt: true,
              updatedAt: true,
            },
          }),
          prisma.leaveRequest.findMany({
            where: {
              employeeId: { in: employeeIds },
              deletedAt: null,
              status: "SUBMITTED",
              startDate: { lte: dateTo },
              endDate: { gte: dateFrom },
            },
            select: { employeeId: true, startDate: true, endDate: true },
          }),
          prisma.overtimeRequest.findMany({
            where: {
              employeeId: { in: employeeIds },
              deletedAt: null,
              status: "SUBMITTED",
              workDate: { gte: dateFrom, lte: dateTo },
            },
            select: { employeeId: true, workDate: true },
          }),
        ]);

      updateProgress({
        step: "BUILD_CONTEXT",
        message: "เตรียมนโยบายวันหยุดและค่าที่ใช้คำนวณ",
        percent: 31,
      });

      const context: DailyCalculationContext = {
        policiesByScopeDate: new Map(),
        shiftAssignmentsByEmployeeId: new Map(),
        logsByEmployeeDate: this.groupAttendanceLogsByEmployeeDate(logs),
        leavesByEmployeeId: this.groupRowsByEmployeeId(leaves),
        compensationsByEmployeeId: this.groupRowsByEmployeeId(compensations),
        overtimeRequestsByEmployeeDate:
          this.groupOvertimeRequestsByEmployeeDate(approvedOvertimeRequests),
        offsiteRequestsByEmployeeDate:
          this.groupOvertimeRequestsByEmployeeDate(offsiteRequests),
        timeAdjustRequestsByEmployeeDate:
          this.groupTimeAdjustRequestsByEmployeeDate(timeAdjustRequests),
        pendingLeavesByEmployeeId: this.groupRowsByEmployeeId(pendingLeaves),
        pendingOvertimeByEmployeeDate:
          this.groupOvertimeRequestsByEmployeeDate(pendingOvertimeRequests),
        payrollSettings: await this.getPayrollCalculationSettings(),
        payrollSettingsByCompanyId:
          await this.getPayrollCalculationSettingsByCompanyIds(
            employees.map((employee) => employee.companyId),
          ),
        attendanceHolidaySettingsByCompanyId:
          await this.getAttendanceHolidaySettingsByCompanyIds(
            employees.map((employee) => employee.companyId),
          ),
        /* สถานะรีวิวเดิมทั้งช่วง โหลดทีเดียวแทนการอ่านทีละวันในลูป */
        existingSummaryByEmployeeDate: new Map(
          (
            await (this.prisma as any).attendanceDailySummary.findMany({
              where: {
                employeeId: { in: employeeIds },
                workDate: { gte: dateFrom, lte: dateTo },
              },
              select: {
                id: true,
                employeeId: true,
                workDate: true,
                reviewStatus: true,
                reviewedAt: true,
                reviewedById: true,
                readyForPayrollAt: true,
                readyForPayrollById: true,
                lockedAt: true,
                lockedById: true,
                sentToPayrollAt: true,
                sentToPayrollById: true,
                payrollPeriodId: true,
                payrollRunId: true,
                policySnapshot: true,
                totalDeductionAmount: true,
                /* การตัดสินใจของ HR ต้องรอดจากการคำนวณใหม่ */
                missingLogPenaltyWaived: true,
                penaltyWaivedReason: true,
                penaltyWaivedAt: true,
                penaltyWaivedById: true,
                penaltyWaivedAmount: true,
                afternoonPenaltyWaived: true,
                afternoonPenaltyWaivedReason: true,
                afternoonPenaltyWaivedAmount: true,
              },
            })
          ).map((summary: any) => [
            this.buildEmployeeDateKey(summary.employeeId, summary.workDate),
            summary,
          ]),
        ),
      };

      updateProgress({
        step: "CALCULATE",
        message: `เริ่มคำนวณ Attendance ${totalItems} รายการ`,
        percent: 35,
      });

      /*
       * ล้างสรุปเวลาที่อยู่นอกช่วงการเป็นพนักงานทิ้งก่อน
       *
       * การข้ามไม่คำนวณอย่างเดียวไม่พอ เพราะลำดับงานจริงคือคำนวณเวลาไว้ก่อน
       * แล้ว HR ค่อยปิดเคสลาออกทีหลัง แถวของวันหลังลาออกที่สร้างไปแล้วจะค้าง
       * เป็นขาดงานถาวร คำนวณใหม่กี่รอบก็ไม่หาย เพราะรอบใหม่แค่ "ไม่แตะ" มัน
       *
       * แถวที่ล็อกหรือส่งเข้าเงินเดือนไปแล้วไม่ยุ่ง ต้องให้ HR ปลดล็อกเองก่อน
       */
      const staleRanges = employees
        .map((employee) => {
          const start = employee.startDate
            ? this.toDateOnly(employee.startDate as any)
            : null;
          const end = (employee as any).employmentEndDate
            ? this.toDateOnly((employee as any).employmentEndDate)
            : null;
          if (!start && !end) return null;

          const or: any[] = [];
          if (start && !Number.isNaN(start.getTime())) or.push({ workDate: { lt: start } });
          if (end && !Number.isNaN(end.getTime())) or.push({ workDate: { gt: end } });
          if (or.length === 0) return null;

          return { employeeId: employee.id, OR: or };
        })
        .filter(Boolean) as any[];

      let removedOutsideEmployment = 0;
      if (staleRanges.length > 0) {
        const removed = await (this.prisma as any).attendanceDailySummary.deleteMany({
          where: {
            workDate: { gte: dateFrom, lte: dateTo },
            lockedAt: null,
            sentToPayrollAt: null,
            payrollRunId: null,
            reviewStatus: { notIn: ["LOCKED", "SENT_TO_PAYROLL"] },
            OR: staleRanges,
          },
        });
        removedOutsideEmployment = removed.count ?? 0;
      }

      const results: any[] = [];
      const errors: Array<{
        employeeId: string;
        employeeCode?: string | null;
        workDate: string;
        message: string;
      }> = [];
      let calculated = 0;
      let skippedLocked = 0;
      let skippedBeforeStart = 0;
      let processedItems = 0;

      const bumpProgress = (message: string) => {
        processedItems += 1;
        if (!progressId) return;
        this.attendanceProgressService.updateItemProgress(
          progressId,
          currentUserId,
          processedItems,
          totalItems,
          `${message} ${processedItems}/${totalItems} รายการ`,
        );
      };

      /*
       * แยกรายการที่ต้องคำนวณจริงออกมาก่อน
       *
       * การข้าม (ยังไม่เป็นพนักงาน / พ้นสภาพ / ล็อกแล้ว) ไม่แตะฐานข้อมูลเลย
       * จึงนับให้จบตรงนี้ทีเดียว เหลือเฉพาะงานที่ต้องยิง DB ไปเข้าคิวคำนวณ
       */
      const pendingItems: Array<{
        employee: (typeof employees)[number];
        workDate: Date;
      }> = [];

      for (const employee of employees) {
        for (const workDate of workDates) {
          if (
            this.isBeforeEmploymentStart(employee, workDate) ||
            this.isAfterEmploymentEnd(employee, workDate)
          ) {
            skippedBeforeStart += 1;
            bumpProgress("ตรวจรายการแล้ว");
            continue;
          }

          if (lockedSummaryKeys.has(`${employee.id}:${this.toDateKey(workDate)}`)) {
            skippedLocked += 1;
            bumpProgress("ตรวจรายการแล้ว");
            continue;
          }

          pendingItems.push({ employee, workDate });
        }
      }

      /*
       * คำนวณครั้งละกลุ่มแทนทีละรายการ
       *
       * แต่ละรายการเป็นอิสระต่อกัน (ข้อมูลต้นทางโหลดมาเป็นก้อนไว้ใน context แล้ว)
       * ที่เหลือคือรอ DB ตอบทีละคำสั่ง การรอพร้อมกันเป็นกลุ่มจึงลดเวลารวมลงมาก
       * โดยผลลัพธ์ของแต่ละรายการไม่เปลี่ยน
       *
       * ไม่ตั้งให้สูงกว่านี้เพราะ connection pool ของ Prisma มีจำกัด
       * ยิงพร้อมกันเกินขนาด pool จะกลายเป็นรอคิว connection แทน ไม่ได้เร็วขึ้น
       */
      const CALCULATION_CONCURRENCY = 12;

      let cancelled = false;

      for (
        let offset = 0;
        offset < pendingItems.length;
        offset += CALCULATION_CONCURRENCY
      ) {
        /*
         * ถามที่ขอบของกลุ่ม ไม่ใช่กลางกลุ่ม
         * แต่ละรายการกำลังเขียนสรุปรายวันอยู่ ตัดกลางทางจะได้ข้อมูลค้างครึ่ง ๆ กลาง ๆ
         * รายการที่คำนวณไปแล้วถูกต้องทุกรายการ ที่เหลือแค่ยังไม่ได้คำนวณใหม่
         */
        if (isCancelRequested()) {
          cancelled = true;
          break;
        }

        const chunk = pendingItems.slice(offset, offset + CALCULATION_CONCURRENCY);

        const settled = await Promise.all(
          chunk.map(async ({ employee, workDate }) => {
            try {
              const summary = await this.calculateAndStoreDailySummary(
                employee,
                workDate,
                currentUserId,
                context,
              );

              await this.attendanceSummaryQueue.markManualRecalculationCompleted({
                employeeId: employee.id,
                workDate: this.toDateKey(workDate),
                summaryId: summary.id,
                requestedById: currentUserId,
              });

              return { ok: true as const, summary };
            } catch (error) {
              return {
                ok: false as const,
                error: {
                  employeeId: employee.id,
                  employeeCode: employee.employeeCode,
                  workDate: this.toDateKey(workDate),
                  message:
                    error instanceof Error
                      ? error.message
                      : "ไม่สามารถคำนวณสรุปรายวันนี้ได้",
                },
              };
            }
          }),
        );

        for (const outcome of settled) {
          if (outcome.ok) {
            calculated += 1;
            results.push(outcome.summary);
          } else {
            errors.push(outcome.error);
          }
          bumpProgress("คำนวณแล้ว");
        }
      }

      /*
       * ตอนถูกสั่งหยุด ห้ามดันตัวเลขไปเต็ม
       * เดิมอัปเดตตรงนี้ทุกกรณี ทำให้กล่องขึ้น 3,689/3,689 · 97%
       * ทั้งที่คำนวณจริงไปแค่บางส่วน อ่านแล้วเข้าใจผิดว่าทำครบแล้ว
       */
      if (!cancelled) {
        updateProgress({
          step: "FINALIZE",
          message: "กำลังสรุปผลและเตรียมข้อมูลแสดงบนหน้า Attendance",
          percent: 97,
          processedItems: totalItems,
          totalItems,
        });
      }

      const result = {
        calculated,
        skippedLocked,
        /** วันที่ข้ามเพราะยังไม่เป็นพนักงาน หรือพ้นสภาพแล้ว — บอกให้รู้ว่าไม่ได้เงียบหาย */
        skippedBeforeStart,
        /** สรุปเวลาที่ลบทิ้งเพราะอยู่นอกช่วงการเป็นพนักงาน */
        removedOutsideEmployment,
        errorCount: errors.length,
        employeeCount: employees.length,
        dayCount,
        items: results,
        errors,
      };

      const skipNote =
        skippedBeforeStart > 0
          ? ` · ข้าม ${skippedBeforeStart} รายการที่อยู่ก่อนวันเริ่มงาน`
          : "";

      if (cancelled) {
        /* บอกให้ชัดว่าหยุดกลางทาง ไม่ใช่คำนวณครบแล้ว จะได้ไม่เข้าใจผิดว่าตัวเลขสมบูรณ์ */
        cancelProgress(result);
      } else {
        completeProgress(
          result,
          errors.length > 0
            ? `คำนวณเสร็จสิ้น พบข้อผิดพลาด ${errors.length} รายการ${skipNote}`
            : `คำนวณ Attendance เสร็จสิ้น${skipNote}`,
        );
      }

      return { ...result, cancelled };
    } catch (error) {
      if (progressId) {
        this.attendanceProgressService.fail(
          progressId,
          currentUserId,
          error instanceof Error ? error.message : "คำนวณ Attendance ไม่สำเร็จ",
        );
      }
      throw error;
    }
  }


  async findMonthlyDailySummaryReview(
    query: AttendanceMonthlyReviewQueryDto,
    scope: TenantScope,
  ) {
    // Tenant boundary: ตรวจค่าที่ client ส่งและล็อก company/branch ตาม scope
    // ก่อนสร้าง raw SQL เพื่อให้ list, summary และ action ใช้ขอบเขตเดียวกัน
    query = await this.normalizeAttendanceScopeFilters(query, scope);
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const reviewPage = await this.buildMonthlyDailySummaryReviewAggregatePage(
      query,
      page,
      pageSize,
    );

    const items = reviewPage.hasEffectiveDateRange
      ? await this.enrichMonthlyReviewPayrollPreview(reviewPage.items, {
          dateFrom: reviewPage.dateFrom,
          dateTo: reviewPage.effectiveDateTo,
        })
      : reviewPage.items;

    return {
      items,
      meta: {
        page,
        pageSize,
        total: reviewPage.summary.total,
        totalPages: Math.max(1, Math.ceil(reviewPage.summary.total / pageSize)),
      },
      summary: reviewPage.summary,
    };
  }

  private async buildMonthlyDailySummaryReviewScope(
    query: Pick<
      AttendanceMonthlyReviewQueryDto,
      | "dateFrom"
      | "dateTo"
      | "search"
      | "companyId"
      | "branchId"
      | "departmentId"
      | "issue"
    >,
  ) {
    const reviewPage = await this.buildMonthlyDailySummaryReviewAggregatePage(
      query,
      1,
      50_000,
    );
    const items = reviewPage.hasEffectiveDateRange
      ? await this.enrichMonthlyReviewPayrollPreview(reviewPage.items, {
          dateFrom: reviewPage.dateFrom,
          dateTo: reviewPage.effectiveDateTo,
        })
      : reviewPage.items;

    return {
      items,
      employeeCount: reviewPage.employeeCount,
      dateFrom: reviewPage.dateFrom,
      dateTo: reviewPage.dateTo,
      effectiveDateTo: reviewPage.effectiveDateTo,
      fullPeriodDayCount: reviewPage.fullPeriodDayCount,
      reviewDayCount: reviewPage.reviewDayCount,
    };
  }

  private buildMonthlyReviewEmployeeWhereSql(
    query: Pick<
      AttendanceMonthlyReviewQueryDto,
      "search" | "companyId" | "branchId" | "departmentId"
    >,
    periodStartDate?: Date,
  ) {
    /*
     * คนที่ลาออกกลางงวดต้องยังอยู่ในหน้าตรวจก่อนเข้าเงินเดือน
     *
     * เดิมตัดทุกคนที่สถานะ RESIGNED ทิ้ง พอ HR ปิดเคสลาออกแล้ว คนนั้นจะหาย
     * จากหน้านี้ทันที ทั้งที่งวดสุดท้ายของเขายังไม่ได้ตรวจและยังไม่ได้ล็อก
     * ผลคือปิดงวดไม่ได้ และยอดหักของวันที่เขายังทำงานอยู่ไม่เข้าเงินเดือน
     */
    const employmentOverlapSql = periodStartDate
      ? Prisma.sql`(
          (e."employmentEndDate" IS NULL AND e."status" NOT IN ('RESIGNED', 'TERMINATED', 'INACTIVE'))
          OR e."employmentEndDate" >= ${periodStartDate}
        )`
      : Prisma.sql`e."status" NOT IN ('RESIGNED', 'TERMINATED', 'INACTIVE')`;

    const whereParts: Prisma.Sql[] = [
      Prisma.sql`e."deletedAt" IS NULL`,
      employmentOverlapSql,
    ];

    if (query.companyId) {
      whereParts.push(Prisma.sql`e."companyId" = ${query.companyId}`);
    }
    if (query.branchId) {
      whereParts.push(Prisma.sql`e."branchId" = ${query.branchId}`);
    }
    if (query.departmentId) {
      whereParts.push(Prisma.sql`e."departmentId" = ${query.departmentId}`);
    }

    const search = query.search?.trim();
    if (search) {
      const searchPattern = `%${search}%`;
      whereParts.push(Prisma.sql`(
        e."employeeCode" ILIKE ${searchPattern}
        OR e."firstName" ILIKE ${searchPattern}
        OR e."lastName" ILIKE ${searchPattern}
        OR COALESCE(e."nickname", '') ILIKE ${searchPattern}
        OR COALESCE(e."displayName", '') ILIKE ${searchPattern}
      )`);
    }

    return Prisma.sql`${Prisma.join(whereParts, " AND ")}`;
  }

  private buildMonthlyReviewIssueSql(issue?: string) {
    const normalizedIssue = !issue || issue === "ALL" ? "" : issue;
    const hasAlertsSql = Prisma.sql`(
      r."status" IN ('NEED_REVIEW', 'DATA_INCOMPLETE')
      OR r."lateOverThresholdDayCount" > 0
      OR r."missingLogCount" > 0
      OR r."absentDayCount" > 0
      OR r."earlyCheckoutMinutes" > 0
      OR r."lateCheckoutMinutes" > 0
      OR r."paidLeaveMinutes" > 0
      OR r."unpaidLeaveMinutes" > 0
      OR r."offsiteMinutes" > 0
      OR r."approvedOtMinutes" > 0
      OR r."payableOtMinutes" > 0
      OR r."pendingApprovalRequestCount" > 0
      OR r."totalDeductionAmount" > 0
      OR r."payrollLinkedCount" > 0
    )`;

    if (!normalizedIssue) return Prisma.sql`TRUE`;
    if (normalizedIssue === "ALERTS") return hasAlertsSql;
    if (normalizedIssue === "NORMAL_READY") {
      return Prisma.sql`NOT ${hasAlertsSql} AND r."status" IN ('READY_FOR_PAYROLL', 'LOCKED')`;
    }
    if (normalizedIssue === "NEED_REVIEW") {
      return Prisma.sql`r."status" IN ('NEED_REVIEW', 'DATA_INCOMPLETE')`;
    }
    if (normalizedIssue === "MISSING_LOG") return Prisma.sql`r."missingLogCount" > 0`;
    if (normalizedIssue === "ABSENT") return Prisma.sql`r."absentDayCount" > 0`;
    if (normalizedIssue === "LATE") return Prisma.sql`r."lateOverThresholdDayCount" > 0`;
    if (normalizedIssue === "EARLY_CHECKOUT") return Prisma.sql`r."earlyCheckoutMinutes" > 0`;
    if (normalizedIssue === "LATE_CHECKOUT") return Prisma.sql`r."lateCheckoutMinutes" > 0`;
    if (normalizedIssue === "LEAVE") {
      return Prisma.sql`(r."paidLeaveMinutes" > 0 OR r."unpaidLeaveMinutes" > 0)`;
    }
    if (normalizedIssue === "UNPAID_LEAVE") return Prisma.sql`r."unpaidLeaveMinutes" > 0`;
    if (normalizedIssue === "OFFSITE") return Prisma.sql`r."offsiteMinutes" > 0`;
    if (normalizedIssue === "PENALTY") return Prisma.sql`r."totalDeductionAmount" > 0`;
    if (normalizedIssue === "READY_FOR_PAYROLL") {
      return Prisma.sql`r."status" = 'READY_FOR_PAYROLL'`;
    }
    if (normalizedIssue === "LOCKED") return Prisma.sql`r."status" = 'LOCKED'`;

    return Prisma.sql`TRUE`;
  }

  private buildMonthlyReviewAggregateBaseSql(params: {
    query: Pick<
      AttendanceMonthlyReviewQueryDto,
      "search" | "companyId" | "branchId" | "departmentId"
    >;
    dateFrom: Date;
    effectiveDateTo: Date;
    dateFromKey: string;
    dateToKey: string;
    isRequestedPeriodEnded: boolean;
  }) {
    const employeeWhereSql = this.buildMonthlyReviewEmployeeWhereSql(
      params.query,
      params.dateFrom,
    );
    const legacyActionableSql = Prisma.sql`(
      s."hasMissingLog" = true
      OR s."isMorningMissing" = true
      OR s."isAfternoonMissing" = true
      OR s."isCheckoutMissing" = true
      OR s."isAbsent" = true
      OR COALESCE(s."absentDays", 0) > 0
      OR COALESCE(s."totalLateMinutes", 0) > ${LATE_REVIEW_THRESHOLD_MINUTES}
      OR COALESCE(s."earlyCheckoutMinutes", 0) > 0
      OR COALESCE(s."missingLogPenaltyAmount", 0) > 0
      OR COALESCE(s."absentDeductionAmount", 0) > 0
      OR COALESCE(s."earlyCheckoutPenaltyAmount", 0) > 0
      OR s."offsiteStatus" IN ('DRAFT', 'SUBMITTED', 'MANAGER_APPROVED')
      OR COALESCE(s."calculationNote", '') ILIKE '%ต้องตรวจสอบ%'
      OR COALESCE(s."calculationNote", '') ILIKE '%ผิดปกติ%'
    )`;
    const requiresReviewSql = Prisma.sql`(
      s."reviewStatus" = 'NEED_REVIEW'
      AND (
        COALESCE(s."policySnapshot"->'attendanceReview'->>'hasReviewIssue', '') = 'true'
        OR (
          COALESCE(s."policySnapshot"->'attendanceReview'->>'hasReviewIssue', '') = ''
          AND ${legacyActionableSql}
        )
      )
    )`;

    return Prisma.sql`
      WITH eligible_employees AS (
        SELECT
          e.id,
          /*
           * จำนวนวันที่ "ควรมี" สรุปเวลาของคนนี้ คิดจากช่วงที่เป็นพนักงานจริง
           * ไม่ใช่จำนวนวันของทั้งงวด
           *
           * เดิมเทียบกับจำนวนวันทั้งงวดตายตัว คนที่เข้างานกลางงวดจึงค้างเป็น
           * DATA_INCOMPLETE ตลอดกาล ส่งเข้าเงินเดือนไม่ได้ ล็อกงวดไม่ได้
           * ทั้งที่ข้อมูลของเขาครบตั้งแต่วันแรกที่เป็นพนักงานแล้ว
           *
           * expectedDays       = ทับซ้อนกับทั้งงวด ใช้ตัดสินว่าพร้อมส่ง/ล็อกได้ไหม
           * reviewExpectedDays = ทับซ้อนกับช่วงที่ผ่านมาแล้ว ใช้บอกว่าข้อมูลยังขาด
           */
          GREATEST(
            (
              LEAST(${params.dateToKey}::date, COALESCE(e."employmentEndDate"::date, ${params.dateToKey}::date))
              - GREATEST(${params.dateFromKey}::date, COALESCE(e."startDate"::date, ${params.dateFromKey}::date))
            ) + 1,
            0
          )::int AS "expectedDays",
          GREATEST(
            (
              LEAST(
                ${this.toDateKey(params.effectiveDateTo)}::date,
                COALESCE(e."employmentEndDate"::date, ${this.toDateKey(params.effectiveDateTo)}::date)
              )
              - GREATEST(${params.dateFromKey}::date, COALESCE(e."startDate"::date, ${params.dateFromKey}::date))
            ) + 1,
            0
          )::int AS "reviewExpectedDays",
          e."companyId",
          e."branchId",
          e."departmentId",
          e."employeeTypeId",
          e."employeeCode",
          e.title,
          e."firstName",
          e."lastName",
          e."displayName",
          e.nickname,
          e.position,
          e.status,
          e."attendanceTrackingRequired",
          e."attendanceExemptSessions",
          c.id AS "company_id",
          c.code AS "company_code",
          c."nameTh" AS "company_nameTh",
          b.id AS "branch_id",
          b.code AS "branch_code",
          b."nameTh" AS "branch_nameTh",
          d.id AS "department_id",
          d.code AS "department_code",
          d."nameTh" AS "department_nameTh",
          -- คอลัมน์สำหรับจัดลำดับให้ตรงกับที่หน้าเว็บจัดกลุ่ม (สาขา → แผนก → ระดับตำแหน่ง)
          dc."sortOrder" AS "department_sortOrder",
          p.level AS "position_level",
          u.id AS "user_id",
          u.email AS "user_email",
          u."displayName" AS "user_displayName",
          u."avatarUrl" AS "user_avatarUrl"
        FROM employees e
        LEFT JOIN "Company" c ON c.id = e."companyId"
        LEFT JOIN "Branch" b ON b.id = e."branchId"
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        LEFT JOIN department_catalog dc ON dc.id = d."catalogId"
        LEFT JOIN "Position" p ON p.id = e."positionId"
        LEFT JOIN "User" u ON u.id = e."userId"
        WHERE ${employeeWhereSql}
      ),
      daily_rollup AS (
        SELECT
          s."employeeId",
          COUNT(*)::int AS "summaryCount",
          COALESCE(ARRAY_AGG(s.id ORDER BY s."workDate") FILTER (WHERE s.id IS NOT NULL), ARRAY[]::text[]) AS "summaryIds",
          COALESCE(ARRAY_AGG(s.id ORDER BY s."workDate") FILTER (WHERE ${requiresReviewSql}), ARRAY[]::text[]) AS "needReviewSummaryIds",
          COALESCE(ARRAY_AGG(s.id ORDER BY s."workDate") FILTER (WHERE s."reviewStatus" = 'READY_FOR_PAYROLL'), ARRAY[]::text[]) AS "readySummaryIds",
          COALESCE(ARRAY_AGG(s.id ORDER BY s."workDate") FILTER (WHERE s."reviewStatus" = 'LOCKED' OR s."lockedAt" IS NOT NULL), ARRAY[]::text[]) AS "lockedSummaryIds",
          COUNT(*) FILTER (WHERE ${requiresReviewSql})::int AS "needReviewCount",
          COUNT(*) FILTER (WHERE s."reviewStatus" = 'CALCULATED')::int AS "calculatedCount",
          COUNT(*) FILTER (WHERE s."reviewStatus" = 'REVIEWED')::int AS "reviewedCount",
          COUNT(*) FILTER (WHERE s."reviewStatus" = 'READY_FOR_PAYROLL')::int AS "readyForPayrollCount",
          COUNT(*) FILTER (WHERE s."reviewStatus" = 'LOCKED' OR s."lockedAt" IS NOT NULL)::int AS "lockedCount",
          COUNT(*) FILTER (WHERE s."reviewStatus" = 'SENT_TO_PAYROLL' OR s."sentToPayrollAt" IS NOT NULL)::int AS "sentToPayrollCount",
          COUNT(*) FILTER (WHERE COALESCE(s."totalLateMinutes", 0) > 0)::int AS "lateDayCount",
          COUNT(*) FILTER (WHERE COALESCE(s."totalLateMinutes", 0) > ${LATE_REVIEW_THRESHOLD_MINUTES})::int AS "lateOverThresholdDayCount",
          COUNT(*) FILTER (WHERE s."hasMissingLog" = true AND s."isAbsent" = false)::int AS "missingLogCount",
          COUNT(*) FILTER (WHERE s."isAbsent" = true OR COALESCE(s."absentDays", 0) > 0)::int AS "absentDayCount",
          COUNT(*) FILTER (WHERE COALESCE(s."unpaidLeaveMinutes", 0) > 0)::int AS "unpaidLeaveDayCount",
          COUNT(*) FILTER (WHERE COALESCE(s."offsiteMinutes", 0) > 0)::int AS "offsiteDayCount",
          COUNT(*) FILTER (WHERE COALESCE(s."earlyCheckoutMinutes", 0) > 0)::int AS "earlyCheckoutDayCount",
          COUNT(*) FILTER (WHERE COALESCE(s."lateCheckoutMinutes", s."extraPresenceMinutes", 0) > 0)::int AS "lateCheckoutDayCount",
          COUNT(*) FILTER (WHERE COALESCE(s."paidLeaveMinutes", 0) > 0)::int AS "paidLeaveDayCount",
          COUNT(*) FILTER (WHERE s."payrollRunId" IS NOT NULL OR s."sentToPayrollAt" IS NOT NULL)::int AS "payrollLinkedCount",
          COALESCE(SUM(s."totalLateMinutes"), 0)::int AS "totalLateMinutes",
          COALESCE(SUM(CASE WHEN COALESCE(s."totalLateMinutes", 0) > ${LATE_REVIEW_THRESHOLD_MINUTES} THEN s."totalLateMinutes" ELSE 0 END), 0)::int AS "lateOverThresholdMinutes",
          COALESCE(SUM(s."morningLateMinutes"), 0)::int AS "morningLateMinutes",
          COALESCE(SUM(s."afternoonLateMinutes"), 0)::int AS "afternoonLateMinutes",
          COALESCE(SUM(s."paidLeaveMinutes"), 0)::int AS "paidLeaveMinutes",
          COALESCE(SUM(s."unpaidLeaveMinutes"), 0)::int AS "unpaidLeaveMinutes",
          COALESCE(SUM(s."offsiteMinutes"), 0)::int AS "offsiteMinutes",
          COALESCE(SUM(s."earlyCheckoutMinutes"), 0)::int AS "earlyCheckoutMinutes",
          COALESCE(SUM(COALESCE(s."lateCheckoutMinutes", s."extraPresenceMinutes", 0)), 0)::int AS "lateCheckoutMinutes",
          COALESCE(SUM(s."approvedOtMinutes"), 0)::int AS "approvedOtMinutes",
          COALESCE(SUM(s."payableOtMinutes"), 0)::int AS "payableOtMinutes",
          COALESCE(SUM(s."latePenaltyAmount"), 0)::numeric AS "latePenaltyAmount",
          COALESCE(SUM(s."missingLogPenaltyAmount"), 0)::numeric AS "missingLogPenaltyAmount",
          COALESCE(SUM(s."absentDeductionAmount"), 0)::numeric AS "absentDeductionAmount",
          COALESCE(SUM(s."unpaidLeaveDeductionAmount"), 0)::numeric AS "unpaidLeaveDeductionAmount",
          COALESCE(SUM(s."earlyCheckoutPenaltyAmount"), 0)::numeric AS "earlyCheckoutPenaltyAmount",
          COALESCE(SUM(s."totalDeductionAmount"), 0)::numeric AS "totalDeductionAmount"
        FROM attendance_daily_summaries s
        INNER JOIN eligible_employees ee ON ee.id = s."employeeId"
        WHERE s."workDate" BETWEEN ${params.dateFrom} AND ${params.effectiveDateTo}
        GROUP BY s."employeeId"
      ),
      pending_leave AS (
        SELECT lr."employeeId", COUNT(*)::int AS count
        FROM leave_requests lr
        INNER JOIN eligible_employees ee ON ee.id = lr."employeeId"
        WHERE lr."deletedAt" IS NULL
          AND lr.status = 'SUBMITTED'
          AND lr."startDate" <= ${params.effectiveDateTo}
          AND lr."endDate" >= ${params.dateFrom}
        GROUP BY lr."employeeId"
      ),
      pending_overtime AS (
        SELECT ot."employeeId", COUNT(*)::int AS count
        FROM overtime_requests ot
        INNER JOIN eligible_employees ee ON ee.id = ot."employeeId"
        WHERE ot."deletedAt" IS NULL
          AND ot.status = 'SUBMITTED'
          AND ot."workDate" BETWEEN ${params.dateFrom} AND ${params.effectiveDateTo}
        GROUP BY ot."employeeId"
      ),
      pending_time_adjust AS (
        SELECT ta."employeeId", COUNT(*)::int AS count
        FROM time_adjust_requests ta
        INNER JOIN eligible_employees ee ON ee.id = ta."employeeId"
        WHERE ta."deletedAt" IS NULL
          AND ta.status = 'SUBMITTED'
          AND ta."requestedLogTime" BETWEEN ${params.dateFrom} AND ${this.endOfDate(params.effectiveDateTo)}
        GROUP BY ta."employeeId"
      ),
      pending_offsite AS (
        SELECT os."employeeId", COUNT(*)::int AS count
        FROM offsite_work_requests os
        INNER JOIN eligible_employees ee ON ee.id = os."employeeId"
        WHERE os."deletedAt" IS NULL
          AND os.status IN ('SUBMITTED', 'MANAGER_APPROVED')
          AND os."workDate" BETWEEN ${params.dateFrom} AND ${params.effectiveDateTo}
        GROUP BY os."employeeId"
      ),
      monthly_rows AS (
        SELECT
          ee.id AS "employeeId",
          json_build_object(
            'id', ee.id,
            'companyId', ee."companyId",
            'employeeTypeId', ee."employeeTypeId",
            'employeeCode', ee."employeeCode",
            'title', ee.title,
            'firstName', ee."firstName",
            'lastName', ee."lastName",
            'displayName', ee."displayName",
            'nickname', ee.nickname,
            'position', ee.position,
            'status', ee.status,
            -- หน้าตรวจก่อนเข้าเงินเดือนใช้สองค่านี้จัดลำดับแถวตามกติกาลงเวลาของแต่ละคน
            'attendanceTrackingRequired', ee."attendanceTrackingRequired",
            'attendanceExemptSessions', ee."attendanceExemptSessions",
            'company', CASE WHEN ee."company_id" IS NULL THEN NULL ELSE json_build_object('id', ee."company_id", 'code', ee."company_code", 'nameTh', ee."company_nameTh") END,
            'branch', CASE WHEN ee."branch_id" IS NULL THEN NULL ELSE json_build_object('id', ee."branch_id", 'code', ee."branch_code", 'nameTh', ee."branch_nameTh") END,
            'department', CASE WHEN ee."department_id" IS NULL THEN NULL ELSE json_build_object('id', ee."department_id", 'code', ee."department_code", 'nameTh', ee."department_nameTh") END,
            'user', CASE WHEN ee."user_id" IS NULL THEN NULL ELSE json_build_object('id', ee."user_id", 'email', ee."user_email", 'displayName', ee."user_displayName", 'avatarUrl', ee."user_avatarUrl") END
          ) AS employee,
          COALESCE(dr."summaryCount", 0)::int AS "summaryCount",
          GREATEST(ee."reviewExpectedDays" - COALESCE(dr."summaryCount", 0), 0)::int AS "missingSummaryCount",
          COALESCE(dr."needReviewCount", 0)::int AS "needReviewCount",
          COALESCE(dr."calculatedCount", 0)::int AS "calculatedCount",
          COALESCE(dr."reviewedCount", 0)::int AS "reviewedCount",
          COALESCE(dr."readyForPayrollCount", 0)::int AS "readyForPayrollCount",
          COALESCE(dr."lockedCount", 0)::int AS "lockedCount",
          COALESCE(dr."sentToPayrollCount", 0)::int AS "sentToPayrollCount",
          COALESCE(dr."lateDayCount", 0)::int AS "lateDayCount",
          COALESCE(dr."lateOverThresholdDayCount", 0)::int AS "lateOverThresholdDayCount",
          COALESCE(dr."missingLogCount", 0)::int AS "missingLogCount",
          COALESCE(dr."absentDayCount", 0)::int AS "absentDayCount",
          COALESCE(dr."unpaidLeaveDayCount", 0)::int AS "unpaidLeaveDayCount",
          COALESCE(dr."offsiteDayCount", 0)::int AS "offsiteDayCount",
          COALESCE(dr."earlyCheckoutDayCount", 0)::int AS "earlyCheckoutDayCount",
          COALESCE(dr."lateCheckoutDayCount", 0)::int AS "lateCheckoutDayCount",
          COALESCE(dr."paidLeaveDayCount", 0)::int AS "paidLeaveDayCount",
          COALESCE(dr."payrollLinkedCount", 0)::int AS "payrollLinkedCount",
          COALESCE(dr."totalLateMinutes", 0)::int AS "totalLateMinutes",
          COALESCE(dr."lateOverThresholdMinutes", 0)::int AS "lateOverThresholdMinutes",
          COALESCE(dr."morningLateMinutes", 0)::int AS "morningLateMinutes",
          COALESCE(dr."afternoonLateMinutes", 0)::int AS "afternoonLateMinutes",
          COALESCE(dr."paidLeaveMinutes", 0)::int AS "paidLeaveMinutes",
          COALESCE(dr."unpaidLeaveMinutes", 0)::int AS "unpaidLeaveMinutes",
          COALESCE(dr."offsiteMinutes", 0)::int AS "offsiteMinutes",
          COALESCE(dr."earlyCheckoutMinutes", 0)::int AS "earlyCheckoutMinutes",
          COALESCE(dr."lateCheckoutMinutes", 0)::int AS "lateCheckoutMinutes",
          COALESCE(dr."approvedOtMinutes", 0)::int AS "approvedOtMinutes",
          COALESCE(dr."payableOtMinutes", 0)::int AS "payableOtMinutes",
          COALESCE(dr."latePenaltyAmount", 0)::numeric AS "latePenaltyAmount",
          COALESCE(dr."missingLogPenaltyAmount", 0)::numeric AS "missingLogPenaltyAmount",
          COALESCE(dr."absentDeductionAmount", 0)::numeric AS "absentDeductionAmount",
          COALESCE(dr."unpaidLeaveDeductionAmount", 0)::numeric AS "unpaidLeaveDeductionAmount",
          COALESCE(dr."earlyCheckoutPenaltyAmount", 0)::numeric AS "earlyCheckoutPenaltyAmount",
          COALESCE(dr."totalDeductionAmount", 0)::numeric AS "totalDeductionAmount",
          COALESCE(pl.count, 0)::int AS "pendingLeaveRequestCount",
          COALESCE(po.count, 0)::int AS "pendingOvertimeRequestCount",
          COALESCE(pt.count, 0)::int AS "pendingTimeAdjustRequestCount",
          COALESCE(poff.count, 0)::int AS "pendingOffsiteRequestCount",
          (COALESCE(pl.count, 0) + COALESCE(po.count, 0) + COALESCE(pt.count, 0) + COALESCE(poff.count, 0))::int AS "pendingApprovalRequestCount",
          COALESCE(dr."summaryIds", ARRAY[]::text[]) AS "summaryIds",
          COALESCE(dr."needReviewSummaryIds", ARRAY[]::text[]) AS "needReviewSummaryIds",
          COALESCE(dr."readySummaryIds", ARRAY[]::text[]) AS "readySummaryIds",
          COALESCE(dr."lockedSummaryIds", ARRAY[]::text[]) AS "lockedSummaryIds",
          CASE
            WHEN COALESCE(dr."sentToPayrollCount", 0) = COALESCE(dr."summaryCount", 0) AND COALESCE(dr."summaryCount", 0) > 0 THEN 'SENT_TO_PAYROLL'
            WHEN COALESCE(dr."lockedCount", 0) = COALESCE(dr."summaryCount", 0) AND COALESCE(dr."summaryCount", 0) > 0 THEN 'LOCKED'
            WHEN COALESCE(dr."summaryCount", 0) = 0 OR GREATEST(ee."reviewExpectedDays" - COALESCE(dr."summaryCount", 0), 0) > 0 THEN 'DATA_INCOMPLETE'
            WHEN COALESCE(dr."needReviewCount", 0) > 0
              OR (COALESCE(pl.count, 0) + COALESCE(po.count, 0) + COALESCE(pt.count, 0) + COALESCE(poff.count, 0)) > 0
              THEN 'NEED_REVIEW'
            WHEN COALESCE(dr."readyForPayrollCount", 0) + COALESCE(dr."lockedCount", 0) = COALESCE(dr."summaryCount", 0) AND COALESCE(dr."summaryCount", 0) > 0 THEN 'READY_FOR_PAYROLL'
            WHEN COALESCE(dr."reviewedCount", 0) + COALESCE(dr."readyForPayrollCount", 0) + COALESCE(dr."lockedCount", 0) = COALESCE(dr."summaryCount", 0) AND COALESCE(dr."summaryCount", 0) > 0 THEN 'REVIEWED'
            ELSE 'CALCULATED'
          END AS "status",
          (
            ${params.isRequestedPeriodEnded}
            AND COALESCE(dr."summaryCount", 0) = ee."expectedDays"
            AND GREATEST(ee."reviewExpectedDays" - COALESCE(dr."summaryCount", 0), 0) = 0
            AND COALESCE(dr."needReviewCount", 0) = 0
            AND COALESCE(dr."payrollLinkedCount", 0) = 0
            AND (COALESCE(pl.count, 0) + COALESCE(po.count, 0) + COALESCE(pt.count, 0) + COALESCE(poff.count, 0)) = 0
            AND NOT (
              COALESCE(dr."readyForPayrollCount", 0) + COALESCE(dr."lockedCount", 0) = COALESCE(dr."summaryCount", 0)
              OR COALESCE(dr."lockedCount", 0) = COALESCE(dr."summaryCount", 0)
              OR COALESCE(dr."sentToPayrollCount", 0) = COALESCE(dr."summaryCount", 0)
            )
          ) AS "canReadyForPayroll",
          (
            ${params.isRequestedPeriodEnded}
            AND COALESCE(dr."summaryCount", 0) = ee."expectedDays"
            AND GREATEST(ee."reviewExpectedDays" - COALESCE(dr."summaryCount", 0), 0) = 0
            AND COALESCE(dr."payrollLinkedCount", 0) = 0
            AND COALESCE(dr."readyForPayrollCount", 0) + COALESCE(dr."lockedCount", 0) = COALESCE(dr."summaryCount", 0)
            AND COALESCE(dr."readyForPayrollCount", 0) > 0
            AND (COALESCE(pl.count, 0) + COALESCE(po.count, 0) + COALESCE(pt.count, 0) + COALESCE(poff.count, 0)) = 0
          ) AS "canLock",
          ee."employeeCode" AS "employeeCode",
          ee."firstName" AS "firstName",
          ee."branch_nameTh" AS "sortBranchName",
          ee."department_sortOrder" AS "sortDepartmentOrder",
          ee."department_nameTh" AS "sortDepartmentName",
          ee."position_level" AS "sortPositionLevel"
        FROM eligible_employees ee
        LEFT JOIN daily_rollup dr ON dr."employeeId" = ee.id
        LEFT JOIN pending_leave pl ON pl."employeeId" = ee.id
        LEFT JOIN pending_overtime po ON po."employeeId" = ee.id
        LEFT JOIN pending_time_adjust pt ON pt."employeeId" = ee.id
        LEFT JOIN pending_offsite poff ON poff."employeeId" = ee.id
      )
    `;
  }

  private async buildMonthlyDailySummaryReviewAggregatePage(
    query: Pick<
      AttendanceMonthlyReviewQueryDto,
      | "dateFrom"
      | "dateTo"
      | "search"
      | "companyId"
      | "branchId"
      | "departmentId"
      | "issue"
    >,
    page: number,
    pageSize: number,
  ) {
    const dateFrom = this.toDateOnly(query.dateFrom);
    const dateTo = this.toDateOnly(query.dateTo);

    this.ensureValidDateRange(dateFrom, dateTo);

    const today = this.getTodayDateOnly();
    const isRequestedPeriodEnded = dateTo <= today;
    const effectiveDateTo = this.capDateToToday(dateTo);
    const hasEffectiveDateRange = dateFrom <= effectiveDateTo;
    const fullPeriodDayCount = this.countInclusiveDays(dateFrom, dateTo);
    const reviewDayCount = hasEffectiveDateRange
      ? this.countInclusiveDays(dateFrom, effectiveDateTo)
      : 0;
    const safePage = Math.max(page, 1);
    const safePageSize = Math.min(Math.max(pageSize, 1), 50_000);
    const offset = (safePage - 1) * safePageSize;

    const baseSql = this.buildMonthlyReviewAggregateBaseSql({
      query,
      dateFrom,
      effectiveDateTo,
      dateFromKey: this.toDateKey(dateFrom),
      dateToKey: this.toDateKey(dateTo),
      isRequestedPeriodEnded,
    });
    const issueSql = this.buildMonthlyReviewIssueSql(query.issue);

    const rows = await this.prisma.$queryRaw<
      Array<{ items: any; summary: any; employeeCount: number | bigint }>
    >(Prisma.sql`
      ${baseSql},
      filtered_rows AS (
        SELECT r.*
        FROM monthly_rows r
        WHERE ${issueSql}
      ),
      total_summary AS (
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "status" = 'READY_FOR_PAYROLL')::int AS "readyForPayroll",
          COUNT(*) FILTER (WHERE "status" IN ('NEED_REVIEW', 'DATA_INCOMPLETE') OR "pendingApprovalRequestCount" > 0)::int AS "needReview",
          COUNT(*) FILTER (WHERE "status" = 'LOCKED')::int AS locked,
          COUNT(*) FILTER (WHERE "status" = 'SENT_TO_PAYROLL')::int AS "sentToPayroll",
          COUNT(*) FILTER (WHERE "status" = 'REVIEWED')::int AS reviewed,
          COALESCE(SUM("missingSummaryCount"), 0)::int AS "missingSummaryCount",
          COALESCE(SUM("needReviewCount"), 0)::int AS "needReviewDayCount",
          COALESCE(SUM("missingLogCount"), 0)::int AS "missingLogCount",
          COALESCE(SUM("absentDayCount"), 0)::int AS "absentDayCount",
          COALESCE(SUM("lateDayCount"), 0)::int AS "lateDayCount",
          COALESCE(SUM("lateOverThresholdDayCount"), 0)::int AS "lateOverThresholdDayCount",
          COALESCE(SUM("lateOverThresholdMinutes"), 0)::int AS "lateOverThresholdMinutes",
          COALESCE(SUM("unpaidLeaveDayCount"), 0)::int AS "unpaidLeaveDayCount",
          COALESCE(SUM("earlyCheckoutDayCount"), 0)::int AS "earlyCheckoutDayCount",
          COALESCE(SUM("earlyCheckoutMinutes"), 0)::int AS "earlyCheckoutMinutes",
          COALESCE(SUM("totalLateMinutes"), 0)::int AS "totalLateMinutes",
          COALESCE(SUM("approvedOtMinutes"), 0)::int AS "approvedOtMinutes",
          COALESCE(SUM("payableOtMinutes"), 0)::int AS "payableOtMinutes",
          0::numeric AS "approvedOvertimeAmountPreview",
          COALESCE(SUM("latePenaltyAmount"), 0)::numeric AS "latePenaltyAmount",
          COALESCE(SUM("missingLogPenaltyAmount"), 0)::numeric AS "missingLogPenaltyAmount",
          COALESCE(SUM("absentDeductionAmount"), 0)::numeric AS "absentDeductionAmount",
          COALESCE(SUM("unpaidLeaveDeductionAmount"), 0)::numeric AS "unpaidLeaveDeductionAmount",
          COALESCE(SUM("earlyCheckoutPenaltyAmount"), 0)::numeric AS "earlyCheckoutPenaltyAmount",
          COALESCE(SUM("totalDeductionAmount"), 0)::numeric AS "totalDeductionAmount"
        FROM filtered_rows
      ),
      paged_rows AS (
        SELECT *
        FROM filtered_rows
        /*
         * เรียงให้ตรงกับที่หน้าเว็บจัดกลุ่ม (สาขา → แผนก) ไม่งั้นพอแบ่งหน้า
         * หัวข้อสาขาเดียวกันจะโผล่ซ้ำหลายหน้า
         * ผู้บริหารขึ้นก่อน: แผนกเรียงตาม sortOrder ของทะเบียนแผนกมาตรฐาน
         * (บริหาร = 10 มาก่อนทุกแผนก) และในแผนกเรียงตามระดับตำแหน่ง (1 = สูงสุด)
         */
        ORDER BY
          "sortBranchName" ASC NULLS LAST,
          "sortDepartmentOrder" ASC NULLS LAST,
          "sortDepartmentName" ASC NULLS LAST,
          "sortPositionLevel" ASC NULLS LAST,
          "employeeCode" ASC NULLS LAST,
          "firstName" ASC NULLS LAST,
          "employeeId" ASC
        LIMIT ${safePageSize} OFFSET ${offset}
      ),
      employee_count AS (
        SELECT COUNT(*)::int AS count FROM eligible_employees
      )
      SELECT
        COALESCE((SELECT json_agg(row_to_json(paged_rows)) FROM paged_rows), '[]'::json) AS items,
        (SELECT row_to_json(total_summary) FROM total_summary) AS summary,
        (SELECT count FROM employee_count) AS "employeeCount"
    `);

    const result = rows[0] ?? { items: [], summary: null, employeeCount: 0 };
    const rawItems = Array.isArray(result.items) ? result.items : [];
    const summary = this.normalizeMonthlyAggregateSummary(result.summary);

    return {
      items: rawItems.map((row: any) =>
        this.buildMonthlyReviewAggregateItem(row, {
          dateFrom,
          dateTo,
          fullPeriodDayCount,
        }),
      ),
      summary,
      employeeCount: Number(result.employeeCount ?? 0),
      dateFrom,
      dateTo,
      effectiveDateTo,
      fullPeriodDayCount,
      reviewDayCount,
      hasEffectiveDateRange,
    };
  }

  private buildMonthlyReviewAggregateItem(
    row: any,
    params: { dateFrom: Date; dateTo: Date; fullPeriodDayCount: number },
  ) {
    const blockerMessages: string[] = [];
    const missingSummaryCount = this.toSafeNumber(row.missingSummaryCount);
    const needReviewCount = this.toSafeNumber(row.needReviewCount);
    const payrollLinkedCount = this.toSafeNumber(row.payrollLinkedCount);
    const pendingApprovalRequestCount = this.toSafeNumber(
      row.pendingApprovalRequestCount,
    );

    if (missingSummaryCount > 0) {
      blockerMessages.push(
        `ยังไม่มี daily summary ${missingSummaryCount.toLocaleString("th-TH")} วัน`,
      );
    }
    if (needReviewCount > 0) {
      blockerMessages.push(
        `มีรายการ NEED_REVIEW ${needReviewCount.toLocaleString("th-TH")} วัน`,
      );
    }
    if (payrollLinkedCount > 0) {
      blockerMessages.push("มีรายการที่ส่งหรือผูกกับ Payroll แล้ว");
    }
    if (pendingApprovalRequestCount > 0) {
      blockerMessages.push(
        `มีคำขอรออนุมัติ ${pendingApprovalRequestCount.toLocaleString("th-TH")} รายการ`,
      );
    }

    return {
      employeeId: row.employeeId,
      employee: row.employee,
      dateFrom: this.toDateKey(params.dateFrom),
      dateTo: this.toDateKey(params.dateTo),
      dayCount: params.fullPeriodDayCount,
      summaryCount: this.toSafeNumber(row.summaryCount),
      missingSummaryCount,
      needReviewCount,
      calculatedCount: this.toSafeNumber(row.calculatedCount),
      reviewedCount: this.toSafeNumber(row.reviewedCount),
      readyForPayrollCount: this.toSafeNumber(row.readyForPayrollCount),
      lockedCount: this.toSafeNumber(row.lockedCount),
      sentToPayrollCount: this.toSafeNumber(row.sentToPayrollCount),
      lateDayCount: this.toSafeNumber(row.lateDayCount),
      lateOverThresholdDayCount: this.toSafeNumber(row.lateOverThresholdDayCount),
      missingLogCount: this.toSafeNumber(row.missingLogCount),
      absentDayCount: this.toSafeNumber(row.absentDayCount),
      unpaidLeaveDayCount: this.toSafeNumber(row.unpaidLeaveDayCount),
      offsiteDayCount: this.toSafeNumber(row.offsiteDayCount),
      earlyCheckoutDayCount: this.toSafeNumber(row.earlyCheckoutDayCount),
      lateCheckoutDayCount: this.toSafeNumber(row.lateCheckoutDayCount),
      paidLeaveDayCount: this.toSafeNumber(row.paidLeaveDayCount),
      payrollLinkedCount,
      totalLateMinutes: this.toSafeNumber(row.totalLateMinutes),
      lateOverThresholdMinutes: this.toSafeNumber(row.lateOverThresholdMinutes),
      morningLateMinutes: this.toSafeNumber(row.morningLateMinutes),
      afternoonLateMinutes: this.toSafeNumber(row.afternoonLateMinutes),
      paidLeaveMinutes: this.toSafeNumber(row.paidLeaveMinutes),
      unpaidLeaveMinutes: this.toSafeNumber(row.unpaidLeaveMinutes),
      offsiteMinutes: this.toSafeNumber(row.offsiteMinutes),
      earlyCheckoutMinutes: this.toSafeNumber(row.earlyCheckoutMinutes),
      lateCheckoutMinutes: this.toSafeNumber(row.lateCheckoutMinutes),
      approvedOtMinutes: this.toSafeNumber(row.approvedOtMinutes),
      payableOtMinutes: this.toSafeNumber(row.payableOtMinutes),
      latePenaltyAmount: this.roundMoney(this.toSafeNumber(row.latePenaltyAmount)),
      missingLogPenaltyAmount: this.roundMoney(this.toSafeNumber(row.missingLogPenaltyAmount)),
      absentDeductionAmount: this.roundMoney(this.toSafeNumber(row.absentDeductionAmount)),
      unpaidLeaveDeductionAmount: this.roundMoney(this.toSafeNumber(row.unpaidLeaveDeductionAmount)),
      earlyCheckoutPenaltyAmount: this.roundMoney(this.toSafeNumber(row.earlyCheckoutPenaltyAmount)),
      totalDeductionAmount: this.roundMoney(this.toSafeNumber(row.totalDeductionAmount)),
      pendingLeaveRequestCount: this.toSafeNumber(row.pendingLeaveRequestCount),
      pendingOvertimeRequestCount: this.toSafeNumber(row.pendingOvertimeRequestCount),
      pendingTimeAdjustRequestCount: this.toSafeNumber(row.pendingTimeAdjustRequestCount),
      pendingOffsiteRequestCount: this.toSafeNumber(row.pendingOffsiteRequestCount),
      pendingApprovalRequestCount,
      status: row.status,
      canReadyForPayroll: Boolean(row.canReadyForPayroll),
      canLock: Boolean(row.canLock),
      blockerMessages,
      summaryIds: Array.isArray(row.summaryIds) ? row.summaryIds : [],
      needReviewSummaryIds: Array.isArray(row.needReviewSummaryIds)
        ? row.needReviewSummaryIds
        : [],
      readySummaryIds: Array.isArray(row.readySummaryIds) ? row.readySummaryIds : [],
      lockedSummaryIds: Array.isArray(row.lockedSummaryIds) ? row.lockedSummaryIds : [],
    };
  }

  private normalizeMonthlyAggregateSummary(rawSummary: any) {
    const summary = rawSummary ?? {};

    return {
      total: this.toSafeNumber(summary.total),
      readyForPayroll: this.toSafeNumber(summary.readyForPayroll),
      needReview: this.toSafeNumber(summary.needReview),
      locked: this.toSafeNumber(summary.locked),
      sentToPayroll: this.toSafeNumber(summary.sentToPayroll),
      reviewed: this.toSafeNumber(summary.reviewed),
      missingSummaryCount: this.toSafeNumber(summary.missingSummaryCount),
      needReviewDayCount: this.toSafeNumber(summary.needReviewDayCount),
      missingLogCount: this.toSafeNumber(summary.missingLogCount),
      absentDayCount: this.toSafeNumber(summary.absentDayCount),
      lateDayCount: this.toSafeNumber(summary.lateDayCount),
      lateOverThresholdDayCount: this.toSafeNumber(summary.lateOverThresholdDayCount),
      lateOverThresholdMinutes: this.toSafeNumber(summary.lateOverThresholdMinutes),
      unpaidLeaveDayCount: this.toSafeNumber(summary.unpaidLeaveDayCount),
      earlyCheckoutDayCount: this.toSafeNumber(summary.earlyCheckoutDayCount),
      earlyCheckoutMinutes: this.toSafeNumber(summary.earlyCheckoutMinutes),
      totalLateMinutes: this.toSafeNumber(summary.totalLateMinutes),
      approvedOtMinutes: this.toSafeNumber(summary.approvedOtMinutes),
      payableOtMinutes: this.toSafeNumber(summary.payableOtMinutes),
      approvedOvertimeAmountPreview: this.roundMoney(
        this.toSafeNumber(summary.approvedOvertimeAmountPreview),
      ),
      latePenaltyAmount: this.roundMoney(this.toSafeNumber(summary.latePenaltyAmount)),
      missingLogPenaltyAmount: this.roundMoney(
        this.toSafeNumber(summary.missingLogPenaltyAmount),
      ),
      absentDeductionAmount: this.roundMoney(
        this.toSafeNumber(summary.absentDeductionAmount),
      ),
      unpaidLeaveDeductionAmount: this.roundMoney(
        this.toSafeNumber(summary.unpaidLeaveDeductionAmount),
      ),
      earlyCheckoutPenaltyAmount: this.roundMoney(
        this.toSafeNumber(summary.earlyCheckoutPenaltyAmount),
      ),
      totalDeductionAmount: this.roundMoney(
        this.toSafeNumber(summary.totalDeductionAmount),
      ),
    };
  }

  async findMonthlyDailySummaryReviewDetail(
    employeeId: string,
    query: AttendanceMonthlyReviewDetailQueryDto,
    scope: TenantScope,
  ) {
    const dateFrom = this.toDateOnly(query.dateFrom);
    const dateTo = this.toDateOnly(query.dateTo);

    this.ensureValidDateRange(dateFrom, dateTo);

    const today = this.getTodayDateOnly();
    const isRequestedPeriodEnded = dateTo <= today;
    const effectiveDateTo = this.capDateToToday(dateTo);
    const hasEffectiveDateRange = dateFrom <= effectiveDateTo;
    const fullPeriodDayCount = this.countInclusiveDays(dateFrom, dateTo);
    const reviewDayCount = hasEffectiveDateRange
      ? this.countInclusiveDays(dateFrom, effectiveDateTo)
      : 0;

    const prisma = this.prisma as any;
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        employeeTypeId: true,
        employeeCode: true,
        nickname: true,
        title: true,
        firstName: true,
        lastName: true,
        displayName: true,
        position: true,
        status: true,
        company: { select: { id: true, code: true, nameTh: true } },
        branch: { select: { id: true, code: true, nameTh: true } },
        department: { select: { id: true, code: true, nameTh: true } },
        user: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException("ไม่พบพนักงานที่ต้องการดูรายละเอียดรายเดือน");
    }

    this.assertAttendanceEntityWithinScope(scope, {
      companyId: employee.companyId,
      branchId: employee.branchId,
    });

    const [dailySummaries, offsiteRequests] = await Promise.all([
      hasEffectiveDateRange
        ? prisma.attendanceDailySummary.findMany({
            where: {
              employeeId,
              workDate: { gte: dateFrom, lte: effectiveDateTo },
            },
            orderBy: [{ workDate: "asc" }],
            include: this.defaultDailySummaryInclude(),
          })
        : [],
      hasEffectiveDateRange
        ? prisma.offsiteWorkRequest.findMany({
            where: {
              employeeId,
              deletedAt: null,
              workDate: { gte: dateFrom, lte: effectiveDateTo },
            },
            orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
          })
        : [],
    ]);

    const enrichedDailySummaries = await this.enrichDailySummariesWithAttendanceContext(dailySummaries);
    const dayCount = fullPeriodDayCount;
    const baseSummary = this.buildMonthlyReviewEmployeeSummary({
      employee,
      summaries: enrichedDailySummaries,
      dateFrom,
      dateTo,
      dayCount,
      expectedSummaryDayCount: reviewDayCount,
      isRequestedPeriodEnded,
    });
    const [summary] = hasEffectiveDateRange
      ? await this.enrichMonthlyReviewPayrollPreview([baseSummary], {
          dateFrom,
          dateTo: effectiveDateTo,
        })
      : [baseSummary];

    return {
      employeeId,
      employee,
      dateFrom: this.toDateKey(dateFrom),
      dateTo: this.toDateKey(dateTo),
      dayCount,
      summary,
      dailySummaries: enrichedDailySummaries,
      offsiteRequests,
    };
  }

  async monthlyMarkDailySummariesReadyForPayroll(
    dto: AttendanceMonthlyReviewActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.monthlyUpdateDailySummariesReviewStatus({
      dto,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.READY_FOR_PAYROLL,
    });
  }

  async monthlyLockDailySummaries(
    dto: AttendanceMonthlyReviewActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.monthlyUpdateDailySummariesReviewStatus({
      dto,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.LOCKED,
    });
  }

  async monthlyMarkDailySummariesReadyForPayrollByPeriod(
    dto: AttendanceMonthlyReviewScopeActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.monthlyUpdateDailySummariesReviewStatusByPeriod({
      dto,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.READY_FOR_PAYROLL,
    });
  }

  async monthlyLockDailySummariesByPeriod(
    dto: AttendanceMonthlyReviewScopeActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.monthlyUpdateDailySummariesReviewStatusByPeriod({
      dto,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.LOCKED,
    });
  }

  private async monthlyUpdateDailySummariesReviewStatusByPeriod(params: {
    dto: AttendanceMonthlyReviewScopeActionDto;
    currentUserId: string;
    tenantScope: TenantScope;
    nextStatus: MonthlyReviewNextStatus;
  }) {
    const scopedDto = await this.normalizeAttendanceScopeFilters(
      params.dto,
      params.tenantScope,
    );
    const dateFrom = this.toDateOnly(scopedDto.dateFrom);
    const dateTo = this.toDateOnly(scopedDto.dateTo);
    this.ensureValidDateRange(dateFrom, dateTo);

    const today = this.getTodayDateOnly();
    if (dateTo > today) {
      throw new BadRequestException(
        `ข้อมูลยังไม่ครบงวด ${this.countInclusiveDays(dateFrom, dateTo).toLocaleString("th-TH")} วัน กรุณารอให้ถึงวันที่ ${this.toDateKey(dateTo)} ก่อนส่งเข้า Payroll`,
      );
    }

    const reviewScope = await this.buildMonthlyDailySummaryReviewScope({
      dateFrom: scopedDto.dateFrom,
      dateTo: scopedDto.dateTo,
      search: scopedDto.search,
      companyId: scopedDto.companyId,
      branchId: scopedDto.branchId,
      departmentId: scopedDto.departmentId,
    });

    const scopeItems = reviewScope.items.filter((item: any) =>
      this.matchesMonthlyReviewIssue(item, scopedDto.issue || "ALL"),
    );
    const scopeEmployeeCount = scopeItems.length;
    const uniqueCandidateEmployeeIds: string[] = Array.from(
      new Set<string>(
        scopeItems
          .filter((item: any) =>
            params.nextStatus === AttendanceReviewStatus.READY_FOR_PAYROLL
              ? Boolean(item.canReadyForPayroll)
              : Boolean(item.canLock),
          )
          .map((item: any) => String(item.employeeId || ""))
          .filter(Boolean),
      ),
    );

    if (uniqueCandidateEmployeeIds.length === 0) {
      return {
        updated: 0,
        employeeCount: 0,
        scopeEmployeeCount,
        skippedEmployeeCount: scopeEmployeeCount,
        successEmployeeCount: 0,
        errorCount: 0,
        items: [],
        errors: [],
      };
    }

    const chunkSize = 100;
    const results: any[] = [];
    const errors: Array<{ employeeId: string; message: string }> = [];

    for (let index = 0; index < uniqueCandidateEmployeeIds.length; index += chunkSize) {
      const employeeIds = uniqueCandidateEmployeeIds.slice(index, index + chunkSize);
      const result = await this.monthlyUpdateDailySummariesReviewStatus({
        dto: {
          dateFrom: scopedDto.dateFrom,
          dateTo: scopedDto.dateTo,
          employeeIds,
          reason: scopedDto.reason,
          note:
            scopedDto.note ??
            (params.nextStatus === AttendanceReviewStatus.READY_FOR_PAYROLL
              ? "Marked ready for payroll by period from monthly review mode"
              : "Locked by period from monthly review mode"),
        },
        currentUserId: params.currentUserId,
        tenantScope: params.tenantScope,
        nextStatus: params.nextStatus,
      });

      results.push(...(result.items ?? []));
      errors.push(...(result.errors ?? []));
    }

    return {
      updated: results.reduce((sum, item) => sum + Number(item.updated ?? 0), 0),
      employeeCount: uniqueCandidateEmployeeIds.length,
      scopeEmployeeCount,
      skippedEmployeeCount: Math.max(
        scopeEmployeeCount - uniqueCandidateEmployeeIds.length,
        0,
      ),
      successEmployeeCount: results.length,
      errorCount: errors.length,
      items: results,
      errors,
    };
  }

  private async findPendingMonthlyApprovalCountByEmployeeId(params: {
    employeeIds: string[];
    dateFrom: Date;
    dateTo: Date;
  }) {
    const employeeIds = Array.from(new Set(params.employeeIds.filter(Boolean)));
    const result = new Map<string, number>();
    if (employeeIds.length === 0) return result;

    const prisma = this.prisma as any;
    const [leaveGroups, overtimeGroups, timeAdjustGroups, offsiteGroups] =
      await Promise.all([
        prisma.leaveRequest.groupBy({
          by: ["employeeId"],
          where: {
            employeeId: { in: employeeIds },
            deletedAt: null,
            status: "SUBMITTED",
            startDate: { lte: params.dateTo },
            endDate: { gte: params.dateFrom },
          },
          _count: { _all: true },
        }),
        prisma.overtimeRequest.groupBy({
          by: ["employeeId"],
          where: {
            employeeId: { in: employeeIds },
            deletedAt: null,
            status: "SUBMITTED",
            workDate: { gte: params.dateFrom, lte: params.dateTo },
          },
          _count: { _all: true },
        }),
        prisma.timeAdjustRequest.groupBy({
          by: ["employeeId"],
          where: {
            employeeId: { in: employeeIds },
            deletedAt: null,
            status: "SUBMITTED",
            requestedLogTime: {
              gte: params.dateFrom,
              lte: this.endOfDate(params.dateTo),
            },
          },
          _count: { _all: true },
        }),
        prisma.offsiteWorkRequest.groupBy({
          by: ["employeeId"],
          where: {
            employeeId: { in: employeeIds },
            deletedAt: null,
            status: { in: ["SUBMITTED", "MANAGER_APPROVED"] },
            workDate: { gte: params.dateFrom, lte: params.dateTo },
          },
          _count: { _all: true },
        }),
      ]);

    for (const groups of [leaveGroups, overtimeGroups, timeAdjustGroups, offsiteGroups]) {
      for (const group of groups) {
        result.set(
          group.employeeId,
          (result.get(group.employeeId) ?? 0) + Number(group._count?._all ?? 0),
        );
      }
    }

    return result;
  }

  private async monthlyUpdateDailySummariesReviewStatus(params: {
    dto: AttendanceMonthlyReviewActionDto;
    currentUserId: string;
    tenantScope: TenantScope;
    nextStatus: MonthlyReviewNextStatus;
  }) {
    const dateFrom = this.toDateOnly(params.dto.dateFrom);
    const dateTo = this.toDateOnly(params.dto.dateTo);
    this.ensureValidDateRange(dateFrom, dateTo);

    const today = this.getTodayDateOnly();
    if (dateTo > today) {
      throw new BadRequestException(
        `ข้อมูลยังไม่ครบงวด ${this.countInclusiveDays(dateFrom, dateTo).toLocaleString("th-TH")} วัน กรุณารอให้ถึงวันที่ ${this.toDateKey(dateTo)} ก่อนส่งเข้า Payroll`,
      );
    }

    const uniqueEmployeeIds = Array.from(
      new Set(params.dto.employeeIds.filter(Boolean)),
    );

    if (uniqueEmployeeIds.length === 0) {
      throw new BadRequestException("กรุณาเลือกพนักงานที่ต้องการดำเนินการ");
    }

    // ตรวจทุก employeeId ก่อนเริ่มอัปเดต เพื่อให้ bulk action เป็น all-or-nothing
    // ในกรณีมี ID ข้าม company/branch scope ปะปนมาในคำขอเดียวกัน
    await this.assertEmployeesWithinAttendanceScope(
      uniqueEmployeeIds,
      params.tenantScope,
    );

    const prisma = this.prisma as any;
    /*
     * ดึงเฉพาะคอลัมน์ที่ตรรกะการเปลี่ยนสถานะใช้จริง
     *
     * ของเดิมใช้ include เต็มซึ่งพ่วง 6 ตารางย่อย (บริษัท สาขา แผนก ผู้ใช้ ใบลา
     * ประเภทลา) มาทุกแถวของทั้งงวด ทั้งที่เอาไปตัดสินใจแค่คอลัมน์ตัวเลขกับ JSON
     * และค่าที่ส่งกลับให้หน้าจอมีแค่ id กับตัวนับ
     */
    const summaries = await prisma.attendanceDailySummary.findMany({
      where: {
        employeeId: { in: uniqueEmployeeIds },
        workDate: { gte: dateFrom, lte: dateTo },
      },
      orderBy: [{ employeeId: "asc" }, { workDate: "asc" }],
      select: this.dailySummaryReviewTransitionSelect(),
    });

    const summariesByEmployeeId = this.groupRowsByEmployeeId(summaries);
    const pendingApprovalCountByEmployeeId =
      await this.findPendingMonthlyApprovalCountByEmployeeId({
        employeeIds: uniqueEmployeeIds,
        dateFrom,
        dateTo,
      });
    const results: any[] = [];
    const errors: Array<{ employeeId: string; message: string }> = [];
    const dayCount = this.countInclusiveDays(dateFrom, dateTo);

    /*
     * จำนวนวันที่คาดว่าต้องมีสรุปเวลา ต้องตัดตามช่วงที่เป็นพนักงานจริง
     *
     * ระบบไม่สร้างสรุปเวลาของวันก่อนเริ่มงานและหลังพ้นสภาพอยู่แล้ว (กันหักขาดงานผี)
     * ถ้าตรงนี้ยังนับเต็มทั้งงวด คนที่เข้าใหม่หรือลาออกกลางงวดจะติดว่า
     * "ยังมีวันที่ไม่มี daily summary" ตลอดไป แล้วปิดงวดเงินเดือนไม่ได้ทั้งงวด
     * โดยไม่มีทางแก้จากหน้าจอ เพราะสั่งคำนวณกี่ครั้งก็ไม่เกิดวันที่ขาดไปได้
     */
    const employmentWindows = await prisma.employee.findMany({
      where: { id: { in: uniqueEmployeeIds } },
      select: { id: true, startDate: true, employmentEndDate: true },
    });
    const expectedDayCountByEmployeeId = new Map<string, number>();
    for (const employee of employmentWindows as Array<{
      id: string;
      startDate: Date | null;
      employmentEndDate: Date | null;
    }>) {
      const from =
        employee.startDate && employee.startDate > dateFrom
          ? employee.startDate
          : dateFrom;
      const to =
        employee.employmentEndDate && employee.employmentEndDate < dateTo
          ? employee.employmentEndDate
          : dateTo;
      expectedDayCountByEmployeeId.set(
        employee.id,
        from > to ? 0 : this.countInclusiveDays(from, to),
      );
    }

    for (const employeeId of uniqueEmployeeIds) {
      const employeeSummaries = summariesByEmployeeId.get(employeeId) ?? [];
      const validation = this.validateMonthlyReviewAction(
        employeeSummaries,
        expectedDayCountByEmployeeId.get(employeeId) ?? dayCount,
        params.nextStatus,
        pendingApprovalCountByEmployeeId.get(employeeId) ?? 0,
      );

      if (!validation.ok) {
        errors.push({ employeeId, message: validation.message });
        continue;
      }

      const idsToUpdate = employeeSummaries
        .filter((summary: any) =>
          this.shouldUpdateSummaryForMonthlyAction(summary, params.nextStatus),
        )
        .map((summary: any) => summary.id);

      if (idsToUpdate.length === 0) {
        results.push({ employeeId, updated: 0, skipped: employeeSummaries.length });
        continue;
      }

      const idsToUpdateSet = new Set(idsToUpdate);
      const bulkResult = await this.bulkUpdateDailySummaryReviewStatusFromExistingSummaries({
        summaries: employeeSummaries.filter((summary: any) =>
          idsToUpdateSet.has(summary.id),
        ),
        currentUserId: params.currentUserId,
        nextStatus: params.nextStatus,
        allowNeedReviewToReady: false,
        dto: {
          reason: params.dto.reason,
          note:
            params.dto.note ??
            (params.nextStatus === AttendanceReviewStatus.READY_FOR_PAYROLL
              ? "Marked ready for payroll from monthly review mode"
              : "Locked from monthly review mode"),
        },
      });

      results.push({
        employeeId,
        updated: bulkResult.updated,
        skipped: employeeSummaries.length - idsToUpdate.length,
        errorCount: bulkResult.errorCount,
        errors: bulkResult.errors,
      });
    }

    return {
      updated: results.reduce((sum, item) => sum + Number(item.updated ?? 0), 0),
      employeeCount: uniqueEmployeeIds.length,
      successEmployeeCount: results.length,
      errorCount: errors.length,
      items: results,
      errors,
    };
  }

  async markDailySummaryReviewed(
    id: string,
    dto: AttendanceDailyReviewActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.updateDailySummaryReviewStatus({
      id,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.REVIEWED,
      dto,
    });
  }

  async cancelDailySummaryReviewed(
    id: string,
    dto: AttendanceDailyReviewActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    await this.loadDailySummariesWithinAttendanceScope([id], tenantScope);
    const nextStatus = await this.resolveDailySummaryCancelReviewStatus(id);

    return this.updateDailySummaryReviewStatus({
      id,
      currentUserId,
      tenantScope,
      nextStatus,
      dto,
    });
  }

  /**
   * ปุ่ม "ไม่หัก / หักตามเดิม" ค่าปรับลืมสแกนของวันนั้น
   * ------------------------------------------------
   * ยกเว้นเฉพาะค่าปรับลืมสแกน ไม่แตะค่าปรับมาสาย/กลับก่อน/ขาดงาน
   * ตัวเลขนาทีและสถานะขาดสแกนยังคงตามจริง เปลี่ยนแค่ยอดเงินที่หัก
   */
  async setDailySummaryMissingLogPenaltyWaiver(
    id: string,
    dto: UpdateMissingLogPenaltyWaiverDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const existing = await prisma.attendanceDailySummary.findUnique({
      where: { id },
      include: this.defaultDailySummaryInclude(),
    });

    if (!existing) {
      throw new NotFoundException("ไม่พบสรุปเวลารายวันที่เลือก");
    }

    this.assertAttendanceEntityWithinScope(tenantScope, {
      companyId: existing.employee?.companyId ?? null,
      branchId: existing.employee?.branchId ?? null,
    });

    if (existing.lockedAt || existing.sentToPayrollAt || existing.payrollRunId) {
      throw new BadRequestException(
        "วันนี้ถูกล็อกหรือส่งเข้างวดเงินเดือนแล้ว แก้การหักไม่ได้",
      );
    }

    const waived = Boolean(dto.waived);
    const alreadyWaived = Boolean(existing.missingLogPenaltyWaived);

    if (waived === alreadyWaived) {
      return existing;
    }

    const now = new Date();
    const reason = dto.reason?.trim() || null;
    const currentTotal = this.toSafeNumber(existing.totalDeductionAmount);

    const data: Record<string, unknown> = waived
      ? (() => {
          const amount = this.roundMoney(
            this.toSafeNumber(existing.missingLogPenaltyAmount),
          );
          return {
            missingLogPenaltyWaived: true,
            penaltyWaivedAmount: amount,
            penaltyWaivedReason: reason,
            penaltyWaivedAt: now,
            penaltyWaivedById: currentUserId,
            missingLogPenaltyAmount: 0,
            totalDeductionAmount: this.roundMoney(
              Math.max(0, currentTotal - amount),
            ),
          };
        })()
      : (() => {
          /* คืนยอดที่เคยยกเว้นไว้ กลับไปหักตามที่ตัวคำนวณคิดไว้เดิม */
          const amount = this.roundMoney(
            this.toSafeNumber(existing.penaltyWaivedAmount),
          );
          return {
            missingLogPenaltyWaived: false,
            penaltyWaivedAmount: 0,
            penaltyWaivedReason: null,
            penaltyWaivedAt: null,
            penaltyWaivedById: null,
            missingLogPenaltyAmount: amount,
            totalDeductionAmount: this.roundMoney(currentTotal + amount),
          };
        })();

    data.policySnapshot = this.addDailyReviewActionToPolicySnapshot(
      existing.policySnapshot,
      {
        action: waived ? "WAIVE_MISSING_LOG" : "RESTORE_MISSING_LOG",
        actorId: currentUserId,
        reason,
        note: null,
        actedAt: now.toISOString(),
      },
    );

    return prisma.attendanceDailySummary.update({
      where: { id },
      data,
      include: this.defaultDailySummaryInclude(),
    });
  }

  async markDailySummaryReadyForPayroll(
    id: string,
    dto: AttendanceDailyReviewActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.updateDailySummaryReviewStatus({
      id,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.READY_FOR_PAYROLL,
      dto,
    });
  }

  async lockDailySummary(
    id: string,
    dto: AttendanceDailyReviewActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.updateDailySummaryReviewStatus({
      id,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.LOCKED,
      dto,
    });
  }

  async bulkMarkDailySummariesReadyForPayroll(
    dto: BulkAttendanceDailyReviewActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.bulkUpdateDailySummaryReviewStatus({
      ids: dto.ids,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.READY_FOR_PAYROLL,
      dto,
    });
  }

  async bulkLockDailySummaries(
    dto: BulkAttendanceDailyReviewActionDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    return this.bulkUpdateDailySummaryReviewStatus({
      ids: dto.ids,
      currentUserId,
      tenantScope,
      nextStatus: AttendanceReviewStatus.LOCKED,
      dto,
    });
  }

  /**
   * เขียนสถานะรีวิวของสรุปเวลาหลายแถวด้วยคำสั่งเดียว
   *
   * ฟิลด์ที่รองรับคือชุดเดียวกับที่ buildDailySummaryReviewStatusUpdateData ผลิต
   * ถ้าแถวไหนไม่มีฟิลด์นั้นในชุดที่จะเขียน แปลว่าการเปลี่ยนสถานะนี้ไม่แตะมัน
   * จึงส่งค่าเดิมของแถวนั้นกลับลงไป ไม่ใช่ null (ไม่งั้นจะล้างเวลาที่เคยบันทึกไว้)
   */
  private async writeDailySummaryReviewStatusChunk(
    chunk: Array<{ id: string; data: Record<string, unknown> }>,
    summaryById: Map<string, any>,
  ) {
    if (chunk.length === 0) return;

    const prisma = this.prisma as any;
    const now = new Date();
    const values: unknown[] = [];
    const tuples: string[] = [];

    const pick = (
      item: { id: string; data: Record<string, unknown> },
      field: string,
    ) =>
      Object.prototype.hasOwnProperty.call(item.data, field)
        ? item.data[field]
        : (summaryById.get(item.id)?.[field] ?? null);

    const toDate = (value: unknown) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date;
    };

    for (const item of chunk) {
      const base = values.length;
      values.push(
        item.id,
        String(pick(item, "reviewStatus") ?? ""),
        JSON.stringify(pick(item, "policySnapshot") ?? null),
        toDate(pick(item, "reviewedAt")),
        (pick(item, "reviewedById") as string | null) ?? null,
        toDate(pick(item, "readyForPayrollAt")),
        (pick(item, "readyForPayrollById") as string | null) ?? null,
        toDate(pick(item, "lockedAt")),
        (pick(item, "lockedById") as string | null) ?? null,
      );
      tuples.push(
        `($${base + 1}::text, $${base + 2}::text, $${base + 3}::jsonb,` +
          ` $${base + 4}::timestamp, $${base + 5}::text,` +
          ` $${base + 6}::timestamp, $${base + 7}::text,` +
          ` $${base + 8}::timestamp, $${base + 9}::text)`,
      );
    }

    values.push(now);

    const sql =
      `UPDATE "attendance_daily_summaries" AS s SET
         "reviewStatus"        = v."reviewStatus"::"AttendanceReviewStatus",
         "policySnapshot"      = v."policySnapshot",
         "reviewedAt"          = v."reviewedAt",
         "reviewedById"        = v."reviewedById",
         "readyForPayrollAt"   = v."readyForPayrollAt",
         "readyForPayrollById" = v."readyForPayrollById",
         "lockedAt"            = v."lockedAt",
         "lockedById"          = v."lockedById",
         "updatedAt"           = $${values.length}::timestamp
       FROM (VALUES ${tuples.join(", ")}) AS v(
         "id", "reviewStatus", "policySnapshot", "reviewedAt", "reviewedById",
         "readyForPayrollAt", "readyForPayrollById", "lockedAt", "lockedById"
       )
       WHERE s."id" = v."id"`;

    const affected = await prisma.$executeRawUnsafe(sql, ...values);

    if (Number(affected) !== chunk.length) {
      throw new Error(
        `เขียนสถานะสรุปเวลาไม่ครบ ได้ ${affected} จาก ${chunk.length} แถว`,
      );
    }
  }

  private async bulkUpdateDailySummaryReviewStatusFromExistingSummaries(params: {
    summaries: any[];
    currentUserId: string;
    nextStatus: AttendanceReviewStatus;
    dto: AttendanceDailyReviewActionDto;
    allowNeedReviewToReady?: boolean;
  }) {
    const uniqueSummaries = Array.from(
      new Map(
        params.summaries
          .filter((summary) => summary?.id)
          .map((summary) => [summary.id, summary]),
      ).values(),
    );

    if (uniqueSummaries.length === 0) {
      return { updated: 0, errorCount: 0, items: [], errors: [] };
    }

    await this.assertDailySummariesFreshForTransition(
      uniqueSummaries,
      params.nextStatus,
    );

    const now = new Date();
    const prisma = this.prisma as any;
    const errors: Array<{ id: string; message: string }> = [];
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const summary of uniqueSummaries) {
      try {
        this.ensureDailySummaryCanMoveToStatus(summary, params.nextStatus, {
          allowNeedReviewToReady: params.allowNeedReviewToReady,
        });
        updates.push({
          id: summary.id,
          data: this.buildDailySummaryReviewStatusUpdateData({
            existing: summary,
            currentUserId: params.currentUserId,
            nextStatus: params.nextStatus,
            dto: params.dto,
            now,
          }),
        });
      } catch (error) {
        errors.push({
          id: summary.id,
          message:
            error instanceof Error
              ? error.message
              : "ไม่สามารถอัปเดตสถานะสรุปเวลารายวันนี้ได้",
        });
      }
    }

    /*
     * เขียนเป็นก้อน ไม่ยิงทีละแถว
     *
     * ล็อกทั้งงวดแตะราว 3,500 แถว ถ้ายิง UPDATE ทีละแถวคือวิ่งไป-กลับฐานข้อมูล
     * 3,500 รอบ วัดได้ ~43 ms/แถว รวมกว่า 70 วินาที ผู้ใช้นั่งดูปุ่มหมุน
     * รวมเป็นคำสั่งเดียวต่อชุดด้วย UPDATE ... FROM (VALUES ...) เหลือหลักร้อย ms
     *
     * ค่าที่เขียนยังคำนวณด้วย buildDailySummaryReviewStatusUpdateData เหมือนเดิมทุกแถว
     * (policySnapshot ต่อท้ายและตัดเหลือ 20 รายการใน JS) SQL แค่ทำหน้าที่ส่งลงไป
     * ฟิลด์ที่การเปลี่ยนสถานะนั้นไม่แตะ ให้ส่งค่าเดิมจากแถวที่โหลดมาแล้วกลับลงไป
     * ผลลัพธ์จึงเท่ากับของเดิมเป๊ะ
     */
    const updated: Array<{ id: string }> = [];
    const summaryById = new Map(uniqueSummaries.map((row) => [row.id, row]));
    const chunkSize = 500;

    for (let index = 0; index < updates.length; index += chunkSize) {
      const chunk = updates.slice(index, index + chunkSize);

      try {
        await this.writeDailySummaryReviewStatusChunk(chunk, summaryById);
        updated.push(...chunk.map((item) => ({ id: item.id })));
      } catch {
        /* ถอยไปเขียนทีละแถว เพื่อบอกได้ว่าแถวไหนพัง ไม่ใช่ล้มทั้งชุดเงียบ ๆ */
        for (const item of chunk) {
          try {
            const row = await prisma.attendanceDailySummary.update({
              where: { id: item.id },
              data: item.data,
              select: { id: true },
            });
            updated.push(row);
          } catch (error) {
            errors.push({
              id: item.id,
              message:
                error instanceof Error
                  ? error.message
                  : "ไม่สามารถอัปเดตสถานะสรุปเวลารายวันนี้ได้",
            });
          }
        }
      }
    }

    return {
      updated: updated.length,
      errorCount: errors.length,
      items: updated,
      errors,
    };
  }

  private async bulkUpdateDailySummaryReviewStatus(params: {
    ids: string[];
    currentUserId: string;
    tenantScope: TenantScope;
    nextStatus: AttendanceReviewStatus;
    dto: AttendanceDailyReviewActionDto;
    allowNeedReviewToReady?: boolean;
  }) {
    const uniqueIds = Array.from(new Set(params.ids.filter(Boolean)));

    if (uniqueIds.length === 0) {
      throw new BadRequestException(
        "กรุณาเลือกรายการสรุปเวลาที่ต้องการดำเนินการ",
      );
    }

    // โหลดและตรวจ scope ของทุก ID ให้ครบก่อนเริ่ม transaction ใด ๆ
    // หากมีเพียงหนึ่งรายการข้าม scope จะยกเลิกทั้งคำขอโดยไม่อัปเดตบางส่วน
    const summaries = await this.loadDailySummariesWithinAttendanceScope(
      uniqueIds,
      params.tenantScope,
    );

    return this.bulkUpdateDailySummaryReviewStatusFromExistingSummaries({
      summaries,
      currentUserId: params.currentUserId,
      nextStatus: params.nextStatus,
      dto: params.dto,
      allowNeedReviewToReady: params.allowNeedReviewToReady,
    });
  }

  private async resolveDailySummaryCancelReviewStatus(id: string) {
    const existing = await (this.prisma as any).attendanceDailySummary.findUnique({
      where: { id },
      include: this.defaultDailySummaryInclude(),
    });

    if (!existing) {
      throw new NotFoundException("ไม่พบสรุปเวลารายวันที่เลือก");
    }

    const [enriched] = await this.enrichDailySummariesWithAttendanceContext([existing]);

    return this.hasActionableDailySummaryReviewIssue(enriched)
      ? AttendanceReviewStatus.NEED_REVIEW
      : AttendanceReviewStatus.CALCULATED;
  }

  private async updateDailySummaryReviewStatus(params: {
    id: string;
    currentUserId: string;
    tenantScope: TenantScope;
    nextStatus: AttendanceReviewStatus;
    dto: AttendanceDailyReviewActionDto;
    allowNeedReviewToReady?: boolean;
  }) {
    const prisma = this.prisma as any;
    const existing = await prisma.attendanceDailySummary.findUnique({
      where: { id: params.id },
      include: this.defaultDailySummaryInclude(),
    });

    if (!existing) {
      throw new NotFoundException("ไม่พบสรุปเวลารายวันที่เลือก");
    }

    this.assertAttendanceEntityWithinScope(params.tenantScope, {
      companyId: existing.employee?.companyId ?? null,
      branchId: existing.employee?.branchId ?? null,
    });

    await this.assertDailySummariesFreshForTransition(
      [existing],
      params.nextStatus,
    );

    this.ensureDailySummaryCanMoveToStatus(existing, params.nextStatus, {
      allowNeedReviewToReady: params.allowNeedReviewToReady,
    });

    const data = this.buildDailySummaryReviewStatusUpdateData({
      existing,
      currentUserId: params.currentUserId,
      nextStatus: params.nextStatus,
      dto: params.dto,
      now: new Date(),
    });

    return prisma.attendanceDailySummary.update({
      where: { id: params.id },
      data,
      include: this.defaultDailySummaryInclude(),
    });
  }

  private buildDailySummaryReviewStatusUpdateData(params: {
    existing: any;
    currentUserId: string;
    nextStatus: AttendanceReviewStatus;
    dto: AttendanceDailyReviewActionDto;
    now: Date;
  }) {
    const policySnapshot = this.addDailyReviewActionToPolicySnapshot(
      params.existing.policySnapshot,
      {
        action: params.nextStatus,
        actorId: params.currentUserId,
        reason: params.dto.reason?.trim() || null,
        note: params.dto.note?.trim() || null,
        actedAt: params.now.toISOString(),
      },
    );

    const data: Record<string, unknown> = {
      reviewStatus: params.nextStatus,
      policySnapshot,
    };

    if (
      params.nextStatus === AttendanceReviewStatus.NEED_REVIEW ||
      params.nextStatus === AttendanceReviewStatus.CALCULATED
    ) {
      data.reviewedAt = null;
      data.reviewedById = null;
      data.readyForPayrollAt = null;
      data.readyForPayrollById = null;
      data.lockedAt = null;
      data.lockedById = null;
    }

    if (params.nextStatus === AttendanceReviewStatus.REVIEWED) {
      data.reviewedAt = params.now;
      data.reviewedById = params.currentUserId;
      data.readyForPayrollAt = null;
      data.readyForPayrollById = null;
      data.lockedAt = null;
      data.lockedById = null;
    }

    if (params.nextStatus === AttendanceReviewStatus.READY_FOR_PAYROLL) {
      data.readyForPayrollAt = params.now;
      data.readyForPayrollById = params.currentUserId;
      if (!params.existing.reviewedAt) {
        data.reviewedAt = params.now;
        data.reviewedById = params.currentUserId;
      }
    }

    if (params.nextStatus === AttendanceReviewStatus.LOCKED) {
      data.lockedAt = params.now;
      data.lockedById = params.currentUserId;
      if (!params.existing.readyForPayrollAt) {
        data.readyForPayrollAt = params.now;
        data.readyForPayrollById = params.currentUserId;
      }
    }

    return data;
  }

  private getAttendanceRecalculationSnapshot(snapshot: unknown) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return null;
    }

    const marker = (snapshot as Record<string, any>).attendanceRecalculation;
    return marker && typeof marker === "object" && !Array.isArray(marker)
      ? (marker as Record<string, any>)
      : null;
  }

  private buildAttendanceSummaryQueueKey(summary: any) {
    return `${String(summary.employeeId ?? summary.employee?.id ?? "")}:${this.toDateKey(
      summary.workDate instanceof Date
        ? summary.workDate
        : this.toDateOnly(summary.workDate),
    )}`;
  }

  private async assertDailySummariesFreshForTransition(
    summaries: any[],
    nextStatus: AttendanceReviewStatus,
  ) {
    if (
      nextStatus !== AttendanceReviewStatus.READY_FOR_PAYROLL &&
      nextStatus !== AttendanceReviewStatus.LOCKED
    ) {
      return;
    }

    const pendingKeys =
      await this.attendanceSummaryQueue.findPendingRecalculationKeys();

    for (const summary of summaries) {
      const marker = this.getAttendanceRecalculationSnapshot(
        summary.policySnapshot,
      );
      const markerStatus = String(marker?.status ?? "").toUpperCase();
      const queueKey = this.buildAttendanceSummaryQueueKey(summary);
      const calculatedAt = summary.calculatedAt
        ? new Date(summary.calculatedAt)
        : null;
      const queuedAt = marker?.queuedAt ? new Date(marker.queuedAt) : null;
      const reviewSnapshot = this.getAttendanceReviewSnapshot(
        summary.policySnapshot,
      );
      const sourceHash = String(reviewSnapshot?.sourceHash ?? "").trim();

      if (pendingKeys.has(queueKey)) {
        throw new BadRequestException(
          "มีงานคำนวณ Attendance ของรายการนี้กำลังรอหรือกำลังประมวลผล กรุณารอให้เสร็จก่อนพร้อมล็อก",
        );
      }

      if (["PENDING", "PROCESSING", "RETRYING"].includes(markerStatus)) {
        throw new BadRequestException(
          "ข้อมูล Attendance มีการเปลี่ยนแปลงและยังคำนวณใหม่ไม่เสร็จ กรุณารอก่อนพร้อมล็อก",
        );
      }

      if (markerStatus === "FAILED") {
        throw new BadRequestException(
          "การคำนวณ Attendance ล่าสุดไม่สำเร็จ กรุณาตรวจสอบข้อผิดพลาดและคำนวณใหม่",
        );
      }

      if (!calculatedAt || Number.isNaN(calculatedAt.getTime())) {
        throw new BadRequestException(
          "ไม่พบเวลาคำนวณ Attendance ล่าสุด กรุณาคำนวณใหม่ก่อนพร้อมล็อก",
        );
      }

      if (
        queuedAt &&
        !Number.isNaN(queuedAt.getTime()) &&
        queuedAt.getTime() > calculatedAt.getTime()
      ) {
        throw new BadRequestException(
          "ข้อมูล Attendance ล่าสุดใหม่กว่าผลคำนวณ กรุณาคำนวณใหม่ก่อนพร้อมล็อก",
        );
      }

      if (!sourceHash) {
        throw new BadRequestException(
          "สรุป Attendance ยังไม่มี Source Version ล่าสุด กรุณาคำนวณใหม่ก่อนพร้อมล็อก",
        );
      }
    }
  }

  private ensureDailySummaryCanMoveToStatus(
    summary: any,
    nextStatus: AttendanceReviewStatus,
    options: { allowNeedReviewToReady?: boolean } = {},
  ) {
    const currentStatus = summary.reviewStatus as AttendanceReviewStatus;

    if (currentStatus === AttendanceReviewStatus.SENT_TO_PAYROLL) {
      throw new BadRequestException(
        "สรุปเวลารายวันนี้ส่งเข้า Payroll แล้ว ไม่สามารถเปลี่ยนสถานะได้",
      );
    }

    if (summary.payrollRunId || summary.sentToPayrollAt) {
      throw new BadRequestException(
        "สรุปเวลารายวันนี้ถูกผูกกับ Payroll แล้ว ไม่สามารถเปลี่ยนสถานะผ่าน HR Review ได้",
      );
    }

    if (currentStatus === AttendanceReviewStatus.LOCKED || summary.lockedAt) {
      throw new BadRequestException(
        "สรุปเวลารายวันนี้ล็อกแล้ว ไม่สามารถเปลี่ยนสถานะได้",
      );
    }

    if (nextStatus === AttendanceReviewStatus.READY_FOR_PAYROLL) {
      if (
        currentStatus === AttendanceReviewStatus.NEED_REVIEW &&
        this.hasActionableDailySummaryReviewIssue(summary) &&
        !options.allowNeedReviewToReady
      ) {
        throw new BadRequestException(
          "รายการนี้ยังเป็น NEED_REVIEW ต้องให้ HR กดตรวจจากหน้ารายเดือนหรือยืนยันตรวจแล้วก่อนส่งเข้าเงินเดือน",
        );
      }
    }

    if (nextStatus === AttendanceReviewStatus.LOCKED) {
      if (currentStatus !== AttendanceReviewStatus.READY_FOR_PAYROLL) {
        throw new BadRequestException(
          "ต้องเปลี่ยนสถานะเป็น READY_FOR_PAYROLL ก่อนจึงจะล็อกวันได้",
        );
      }
    }
  }

  private addDailyReviewActionToPolicySnapshot(
    snapshot: unknown,
    action: {
      action: AttendanceReviewStatus | string;
      actorId: string;
      reason: string | null;
      note: string | null;
      actedAt: string;
    },
  ) {
    const base =
      snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? { ...(snapshot as Record<string, unknown>) }
        : {};

    const history = Array.isArray(base.dailyReviewActions)
      ? (base.dailyReviewActions as unknown[])
      : [];

    return {
      ...base,
      dailyReviewActions: [...history, action].slice(-20),
    };
  }



  private buildMonthlyReviewEmployeeSummary(params: {
    employee: any;
    summaries: any[];
    dateFrom: Date;
    dateTo: Date;
    dayCount: number;
    expectedSummaryDayCount?: number;
    isRequestedPeriodEnded?: boolean;
  }) {
    const {
      employee,
      summaries,
      dateFrom,
      dateTo,
      dayCount,
      expectedSummaryDayCount = dayCount,
      isRequestedPeriodEnded = true,
    } = params;
    const counts = {
      summaryCount: summaries.length,
      missingSummaryCount: Math.max(expectedSummaryDayCount - summaries.length, 0),
      needReviewCount: 0,
      calculatedCount: 0,
      reviewedCount: 0,
      readyForPayrollCount: 0,
      lockedCount: 0,
      sentToPayrollCount: 0,
      lateDayCount: 0,
      lateOverThresholdDayCount: 0,
      missingLogCount: 0,
      absentDayCount: 0,
      unpaidLeaveDayCount: 0,
      offsiteDayCount: 0,
      earlyCheckoutDayCount: 0,
      lateCheckoutDayCount: 0,
      paidLeaveDayCount: 0,
      payrollLinkedCount: 0,
    };

    const totals = {
      totalLateMinutes: 0,
      lateOverThresholdMinutes: 0,
      morningLateMinutes: 0,
      afternoonLateMinutes: 0,
      paidLeaveMinutes: 0,
      unpaidLeaveMinutes: 0,
      offsiteMinutes: 0,
      earlyCheckoutMinutes: 0,
      lateCheckoutMinutes: 0,
      approvedOtMinutes: 0,
      payableOtMinutes: 0,
      latePenaltyAmount: 0,
      missingLogPenaltyAmount: 0,
      absentDeductionAmount: 0,
      unpaidLeaveDeductionAmount: 0,
      earlyCheckoutPenaltyAmount: 0,
      totalDeductionAmount: 0,
    };

    const summaryIds: string[] = [];
    const needReviewSummaryIds: string[] = [];
    const readySummaryIds: string[] = [];
    const lockedSummaryIds: string[] = [];
    const blockerMessages: string[] = [];

    for (const summary of summaries) {
      summaryIds.push(summary.id);
      const reviewStatus = summary.reviewStatus as AttendanceReviewStatus;

      const reviewState = resolveAttendanceReviewState(summary);
      if (reviewState.requiresReview) {
        counts.needReviewCount += 1;
        needReviewSummaryIds.push(summary.id);
      } else if (reviewStatus === AttendanceReviewStatus.REVIEWED) {
        counts.reviewedCount += 1;
      } else if (reviewStatus === AttendanceReviewStatus.READY_FOR_PAYROLL) {
        counts.readyForPayrollCount += 1;
        readySummaryIds.push(summary.id);
      } else if (reviewStatus === AttendanceReviewStatus.LOCKED || summary.lockedAt) {
        counts.lockedCount += 1;
        lockedSummaryIds.push(summary.id);
      } else if (reviewStatus === AttendanceReviewStatus.SENT_TO_PAYROLL || summary.sentToPayrollAt) {
        counts.sentToPayrollCount += 1;
      } else {
        counts.calculatedCount += 1;
      }

      if (summary.payrollRunId || summary.sentToPayrollAt) {
        counts.payrollLinkedCount += 1;
      }

      const totalLateMinutes = Number(summary.totalLateMinutes ?? 0);
      const hasMissingLog = Boolean(summary.hasMissingLog);
      const isAbsent = Boolean(summary.isAbsent);
      const absentDays = Number(summary.absentDays ?? 0);
      const paidLeaveMinutes = Number(summary.paidLeaveMinutes ?? 0);
      const unpaidLeaveMinutes = Number(summary.unpaidLeaveMinutes ?? 0);
      const offsiteMinutes = Number(summary.offsiteMinutes ?? 0);
      const earlyCheckoutMinutes = Number(summary.earlyCheckoutMinutes ?? 0);
      const lateCheckoutMinutes = Number(
        summary.lateCheckoutMinutes ?? summary.extraPresenceMinutes ?? 0,
      );

      if (totalLateMinutes > 0) counts.lateDayCount += 1;
      if (this.isLateOverReviewThreshold(summary)) {
        counts.lateOverThresholdDayCount += 1;
      }
      if (hasMissingLog && !isAbsent) counts.missingLogCount += 1;
      if (isAbsent || absentDays > 0) counts.absentDayCount += 1;
      if (paidLeaveMinutes > 0) counts.paidLeaveDayCount += 1;
      if (unpaidLeaveMinutes > 0) counts.unpaidLeaveDayCount += 1;
      if (offsiteMinutes > 0) counts.offsiteDayCount += 1;
      if (earlyCheckoutMinutes > 0) counts.earlyCheckoutDayCount += 1;
      if (lateCheckoutMinutes > 0) counts.lateCheckoutDayCount += 1;

      totals.totalLateMinutes += totalLateMinutes;
      if (this.isLateOverReviewThreshold(summary)) {
        totals.lateOverThresholdMinutes += totalLateMinutes;
      }
      totals.morningLateMinutes += Number(summary.morningLateMinutes ?? 0);
      totals.afternoonLateMinutes += Number(summary.afternoonLateMinutes ?? 0);
      totals.paidLeaveMinutes += paidLeaveMinutes;
      totals.unpaidLeaveMinutes += unpaidLeaveMinutes;
      totals.offsiteMinutes += offsiteMinutes;
      totals.earlyCheckoutMinutes += earlyCheckoutMinutes;
      totals.lateCheckoutMinutes += lateCheckoutMinutes;
      totals.approvedOtMinutes += Number(summary.approvedOtMinutes ?? 0);
      totals.payableOtMinutes += Number(summary.payableOtMinutes ?? 0);
      totals.latePenaltyAmount += Number(summary.latePenaltyAmount ?? 0);
      totals.missingLogPenaltyAmount += Number(summary.missingLogPenaltyAmount ?? 0);
      totals.absentDeductionAmount += Number(summary.absentDeductionAmount ?? 0);
      totals.unpaidLeaveDeductionAmount += Number(summary.unpaidLeaveDeductionAmount ?? 0);
      totals.earlyCheckoutPenaltyAmount += Number(summary.earlyCheckoutPenaltyAmount ?? 0);
      totals.totalDeductionAmount += Number(summary.totalDeductionAmount ?? 0);
    }

    if (counts.missingSummaryCount > 0) {
      blockerMessages.push(
        `ยังไม่มี daily summary ${counts.missingSummaryCount.toLocaleString("th-TH")} วัน`,
      );
    }

    if (counts.needReviewCount > 0) {
      blockerMessages.push(
        `มีรายการ NEED_REVIEW ${counts.needReviewCount.toLocaleString("th-TH")} วัน`,
      );
    }

    if (counts.payrollLinkedCount > 0) {
      blockerMessages.push("มีรายการที่ส่งหรือผูกกับ Payroll แล้ว");
    }

    const status = this.resolveMonthlyReviewStatus(counts);

    return {
      employeeId: employee.id,
      employee,
      dateFrom: this.toDateKey(dateFrom),
      dateTo: this.toDateKey(dateTo),
      dayCount,
      ...counts,
      ...totals,
      status,
      canReadyForPayroll:
        isRequestedPeriodEnded &&
        counts.summaryCount === dayCount &&
        counts.missingSummaryCount === 0 &&
        counts.needReviewCount === 0 &&
        counts.payrollLinkedCount === 0 &&
        status !== "READY_FOR_PAYROLL" &&
        status !== "LOCKED" &&
        status !== "SENT_TO_PAYROLL",
      canLock:
        isRequestedPeriodEnded &&
        counts.summaryCount === dayCount &&
        counts.missingSummaryCount === 0 &&
        counts.payrollLinkedCount === 0 &&
        counts.readyForPayrollCount + counts.lockedCount === summaries.length &&
        counts.readyForPayrollCount > 0,
      blockerMessages,
      summaryIds,
      needReviewSummaryIds,
      readySummaryIds,
      lockedSummaryIds,
    };
  }

  private toSafeNumber(value: unknown) {
    if (value === null || value === undefined || value === "") return 0;
    const next = typeof value === "number" ? value : Number(value);
    return Number.isFinite(next) ? next : 0;
  }

  private isLateOverReviewThreshold(item: any) {
    return this.toSafeNumber(item?.totalLateMinutes) > LATE_REVIEW_THRESHOLD_MINUTES;
  }

  private isInformationalCalculationNoteForReview(part: string) {
    const normalized = part.trim();
    if (!normalized) return true;
    if (normalized.includes("วันหยุด")) return true;

    const normalizedUpper = normalized.toUpperCase();
    const hasDeductionSignal =
      normalized.includes("ไม่ได้รับค่าจ้าง") ||
      normalized.includes("ไม่รับค่าจ้าง") ||
      normalized.includes("ยอดหัก") ||
      normalized.includes("หัก") ||
      normalized.includes("ต้องตรวจสอบ") ||
      normalized.includes("ผิดปกติ");

    const informationalNotePrefixes = [
      "ไม่มีรายการหักเงิน",
      "มีใบลาอนุมัติ",
      "ทำงานนอกสถานที่ที่อนุมัติแล้ว",
      "ทำงานนอกสถานที่อนุมัติแล้ว",
      "OT ที่อนุมัติแล้ว",
      "มี OT อนุมัติ",
      "มีรายการ OT อนุมัติ",
      "มาสายรวม",
      "ออกก่อนเวลา",
      "กลับช้า",
      "จำกัดค่ามาสายและออกก่อนเวลาไม่เกิน",
    ];

    if (
      informationalNotePrefixes.some((prefix) => normalized.startsWith(prefix)) &&
      !hasDeductionSignal
    ) {
      return true;
    }

    const isPaidLeaveNote =
      normalized.includes("ได้รับค่าจ้าง") && !hasDeductionSignal;

    if (isPaidLeaveNote) return true;

    const isLeaveDayTypeOnlyNote =
      (normalized.startsWith("ลา:") || normalized.startsWith("ลา ")) &&
      ["HALF_DAY_MORNING", "HALF_DAY_AFTERNOON", "FULL_DAY"].some((token) =>
        normalizedUpper.includes(token),
      ) &&
      !hasDeductionSignal;

    if (isLeaveDayTypeOnlyNote) return true;

    const isLeaveInfoOnlyNote =
      normalized.includes("ลา") &&
      [
        "ครึ่งเช้า",
        "ครึ่งบ่าย",
        "เต็มวัน",
        "HALF_DAY_MORNING",
        "HALF_DAY_AFTERNOON",
        "FULL_DAY",
      ].some((token) => normalizedUpper.includes(token.toUpperCase())) &&
      !hasDeductionSignal;

    return isLeaveInfoOnlyNote;
  }

  private hasActionableCalculationNoteForReview(note: unknown) {
    if (!note) return false;

    return String(note)
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => !this.isInformationalCalculationNoteForReview(part));
  }

  private hasActionableDailySummaryReviewIssue(summary: any) {
    return resolveAttendanceReviewState(summary).hasReviewIssue;
  }

  private getApprovedOvertimeAmountPreview(item: any) {
    const direct = this.toSafeNumber(item.approvedOvertimeAmountPreview);
    if (direct > 0) return this.roundMoney(direct);

    return this.roundMoney(
      this.toSafeNumber(item.approvedOvertimeWorkdayAmountPreview) +
        this.toSafeNumber(item.approvedOvertimeHolidayAmountPreview) +
        this.toSafeNumber(item.approvedOvertimeSpecialHolidayAmountPreview),
    );
  }

  private buildAttendanceDailySummaryListSummary(items: any[], total: number) {
    const summary = {
      total,
      needReview: 0,
      reviewed: 0,
      readyForPayroll: 0,
      locked: 0,
      sentToPayroll: 0,
      issueCount: 0,
      missingLogCount: 0,
      absentCount: 0,
      lateCount: 0,
      totalLateMinutes: 0,
      lateOverThresholdMinutes: 0,
      approvedOtMinutes: 0,
      payableOtMinutes: 0,
      approvedOvertimeAmountPreview: 0,
      latePenaltyAmount: 0,
      missingLogPenaltyAmount: 0,
      absentDeductionAmount: 0,
      unpaidLeaveDeductionAmount: 0,
      earlyCheckoutCount: 0,
      earlyCheckoutMinutes: 0,
      earlyCheckoutPenaltyAmount: 0,
      totalDeductionAmount: 0,
      timeAdjustRequestCount: 0,
      pendingTimeAdjustRequestCount: 0,
      approvedTimeAdjustRequestCount: 0,
      rejectedTimeAdjustRequestCount: 0,
    };

    for (const item of items) {
      const status = String(item.reviewStatus ?? item.calculationStatus ?? "").toUpperCase();
      const totalLateMinutes = this.toSafeNumber(item.totalLateMinutes);
      const totalDeductionAmount = this.toSafeNumber(item.totalDeductionAmount);
      const pendingTimeAdjustCount = this.toSafeNumber(item.pendingTimeAdjustRequestCount);
      const timeAdjustRequestCount = this.toSafeNumber(item.timeAdjustRequestCount);
      const reviewState = resolveAttendanceReviewState(item);
      const hasIssue = reviewState.hasReviewIssue;

      if (reviewState.requiresReview) {
        summary.needReview += 1;
      }
      if (status === "REVIEWED") summary.reviewed += 1;
      if (status === "READY_FOR_PAYROLL") summary.readyForPayroll += 1;
      if (status === "LOCKED" || item.lockedAt) summary.locked += 1;
      if (status === "SENT_TO_PAYROLL" || item.sentToPayrollAt || item.payrollRunId) {
        summary.sentToPayroll += 1;
      }
      if (hasIssue) summary.issueCount += 1;
      if (item.hasMissingLog && !item.isAbsent) summary.missingLogCount += 1;
      if (item.isAbsent) summary.absentCount += 1;
      if (totalLateMinutes > 0) summary.lateCount += 1;
      if (this.toSafeNumber(item.earlyCheckoutMinutes) > 0) summary.earlyCheckoutCount += 1;

      summary.totalLateMinutes += totalLateMinutes;
      summary.approvedOtMinutes += this.toSafeNumber(item.approvedOtMinutes);
      summary.payableOtMinutes += this.toSafeNumber(item.payableOtMinutes);
      summary.approvedOvertimeAmountPreview += this.getApprovedOvertimeAmountPreview(item);
      summary.latePenaltyAmount += this.toSafeNumber(item.latePenaltyAmount);
      summary.missingLogPenaltyAmount += this.toSafeNumber(item.missingLogPenaltyAmount);
      summary.absentDeductionAmount += this.toSafeNumber(item.absentDeductionAmount);
      summary.unpaidLeaveDeductionAmount += this.toSafeNumber(item.unpaidLeaveDeductionAmount);
      summary.earlyCheckoutMinutes += this.toSafeNumber(item.earlyCheckoutMinutes);
      summary.earlyCheckoutPenaltyAmount += this.toSafeNumber(item.earlyCheckoutPenaltyAmount);
      summary.totalDeductionAmount += totalDeductionAmount;
      summary.timeAdjustRequestCount += timeAdjustRequestCount;
      summary.pendingTimeAdjustRequestCount += pendingTimeAdjustCount;
      summary.approvedTimeAdjustRequestCount += this.toSafeNumber(item.approvedTimeAdjustRequestCount);
      summary.rejectedTimeAdjustRequestCount += this.toSafeNumber(item.rejectedTimeAdjustRequestCount);
    }

    return {
      ...summary,
      approvedOvertimeAmountPreview: this.roundMoney(summary.approvedOvertimeAmountPreview),
      latePenaltyAmount: this.roundMoney(summary.latePenaltyAmount),
      missingLogPenaltyAmount: this.roundMoney(summary.missingLogPenaltyAmount),
      absentDeductionAmount: this.roundMoney(summary.absentDeductionAmount),
      unpaidLeaveDeductionAmount: this.roundMoney(summary.unpaidLeaveDeductionAmount),
      earlyCheckoutPenaltyAmount: this.roundMoney(summary.earlyCheckoutPenaltyAmount),
      totalDeductionAmount: this.roundMoney(summary.totalDeductionAmount),
    };
  }

  private buildAttendanceMonthlyReviewListSummary(items: any[], total: number) {
    const summary = {
      total,
      readyForPayroll: 0,
      needReview: 0,
      locked: 0,
      sentToPayroll: 0,
      reviewed: 0,
      missingSummaryCount: 0,
      needReviewDayCount: 0,
      missingLogCount: 0,
      absentDayCount: 0,
      lateDayCount: 0,
      lateOverThresholdDayCount: 0,
      lateOverThresholdMinutes: 0,
      unpaidLeaveDayCount: 0,
      earlyCheckoutDayCount: 0,
      earlyCheckoutMinutes: 0,
      totalLateMinutes: 0,
      approvedOtMinutes: 0,
      payableOtMinutes: 0,
      approvedOvertimeAmountPreview: 0,
      latePenaltyAmount: 0,
      missingLogPenaltyAmount: 0,
      absentDeductionAmount: 0,
      unpaidLeaveDeductionAmount: 0,
      earlyCheckoutPenaltyAmount: 0,
      totalDeductionAmount: 0,
    };

    for (const item of items) {
      const status = String(item.status ?? "").toUpperCase();
      const blockerCount = Array.isArray(item.blockerMessages) ? item.blockerMessages.length : 0;
      const needsReview =
        this.toSafeNumber(item.needReviewCount) > 0 ||
        blockerCount > 0 ||
        status === "NEED_REVIEW" ||
        status === "DATA_INCOMPLETE";

      if (status === "READY_FOR_PAYROLL") summary.readyForPayroll += 1;
      if (status === "LOCKED") summary.locked += 1;
      if (status === "SENT_TO_PAYROLL") summary.sentToPayroll += 1;
      if (status === "REVIEWED") summary.reviewed += 1;
      if (needsReview) summary.needReview += 1;

      summary.missingSummaryCount += this.toSafeNumber(item.missingSummaryCount);
      summary.needReviewDayCount += this.toSafeNumber(item.needReviewCount);
      summary.missingLogCount += this.toSafeNumber(item.missingLogCount);
      summary.absentDayCount += this.toSafeNumber(item.absentDayCount);
      summary.lateDayCount += this.toSafeNumber(item.lateDayCount);
      summary.lateOverThresholdDayCount += this.toSafeNumber(item.lateOverThresholdDayCount);
      summary.unpaidLeaveDayCount += this.toSafeNumber(item.unpaidLeaveDayCount);
      summary.earlyCheckoutDayCount += this.toSafeNumber(item.earlyCheckoutDayCount);
      summary.earlyCheckoutMinutes += this.toSafeNumber(item.earlyCheckoutMinutes);
      summary.totalLateMinutes += this.toSafeNumber(item.totalLateMinutes);
      summary.lateOverThresholdMinutes += this.toSafeNumber(item.lateOverThresholdMinutes);
      summary.approvedOtMinutes += this.toSafeNumber(item.approvedOtMinutes);
      summary.payableOtMinutes += this.toSafeNumber(item.payableOtMinutes);
      summary.approvedOvertimeAmountPreview += this.getApprovedOvertimeAmountPreview(item);
      summary.latePenaltyAmount += this.toSafeNumber(item.latePenaltyAmount);
      summary.missingLogPenaltyAmount += this.toSafeNumber(item.missingLogPenaltyAmount);
      summary.absentDeductionAmount += this.toSafeNumber(item.absentDeductionAmount);
      summary.unpaidLeaveDeductionAmount += this.toSafeNumber(item.unpaidLeaveDeductionAmount);
      summary.earlyCheckoutPenaltyAmount += this.toSafeNumber(item.earlyCheckoutPenaltyAmount);
      summary.totalDeductionAmount += this.toSafeNumber(item.totalDeductionAmount);
    }

    return {
      ...summary,
      approvedOvertimeAmountPreview: this.roundMoney(summary.approvedOvertimeAmountPreview),
      latePenaltyAmount: this.roundMoney(summary.latePenaltyAmount),
      missingLogPenaltyAmount: this.roundMoney(summary.missingLogPenaltyAmount),
      absentDeductionAmount: this.roundMoney(summary.absentDeductionAmount),
      unpaidLeaveDeductionAmount: this.roundMoney(summary.unpaidLeaveDeductionAmount),
      earlyCheckoutPenaltyAmount: this.roundMoney(summary.earlyCheckoutPenaltyAmount),
      totalDeductionAmount: this.roundMoney(summary.totalDeductionAmount),
    };
  }

  private async enrichMonthlyReviewPayrollPreview(
    items: any[],
    params: { dateFrom: Date; dateTo: Date },
  ) {
    if (items.length === 0) return items;

    const employeeIds = items.map((item) => item.employeeId).filter(Boolean);
    if (employeeIds.length === 0) return items;

    const prisma = this.prisma as any;
    const payrollSettingsFallback = await this.getPayrollCalculationSettings();
    const payrollSettingsByCompanyId = await this.getPayrollCalculationSettingsByCompanyIds(
      items.map((item) => item.employee?.companyId ?? item.employee?.company?.id ?? item.companyId),
    );

    const [
      approvedOvertimeGroups,
      pendingLeaveGroups,
      pendingOvertimeGroups,
      pendingTimeAdjustGroups,
      pendingOffsiteGroups,
      compensations,
      overtimePolicies,
      employeeScopes,
    ] = await Promise.all([
      prisma.overtimeRequest.groupBy({
        by: ["employeeId", "workType"],
        where: {
          employeeId: { in: employeeIds },
          status: "APPROVED",
          deletedAt: null,
          workDate: { gte: params.dateFrom, lte: params.dateTo },
        },
        _sum: { totalHours: true },
        _count: { _all: true },
      }),
      prisma.leaveRequest.groupBy({
        by: ["employeeId"],
        where: {
          employeeId: { in: employeeIds },
          status: "SUBMITTED",
          deletedAt: null,
          startDate: { lte: params.dateTo },
          endDate: { gte: params.dateFrom },
        },
        _count: { _all: true },
      }),
      prisma.overtimeRequest.groupBy({
        by: ["employeeId"],
        where: {
          employeeId: { in: employeeIds },
          status: "SUBMITTED",
          deletedAt: null,
          workDate: { gte: params.dateFrom, lte: params.dateTo },
        },
        _count: { _all: true },
      }),
      prisma.timeAdjustRequest.groupBy({
        by: ["employeeId"],
        where: {
          employeeId: { in: employeeIds },
          status: "SUBMITTED",
          deletedAt: null,
          requestedLogTime: { gte: params.dateFrom, lte: this.endOfDate(params.dateTo) },
        },
        _count: { _all: true },
      }),
      prisma.offsiteWorkRequest.groupBy({
        by: ["employeeId"],
        where: {
          employeeId: { in: employeeIds },
          status: { in: ["SUBMITTED", "MANAGER_APPROVED"] },
          deletedAt: null,
          workDate: { gte: params.dateFrom, lte: params.dateTo },
        },
        _count: { _all: true },
      }),
      prisma.employeeCompensation.findMany({
        where: {
          employeeId: { in: employeeIds },
          deletedAt: null,
          status: "ACTIVE",
          effectiveDate: { lte: params.dateTo },
          OR: [{ endDate: null }, { endDate: { gte: params.dateFrom } }],
        },
        orderBy: [
          { employeeId: "asc" },
          { effectiveDate: "desc" },
          { createdAt: "desc" },
        ],
        select: {
          employeeId: true,
          baseSalary: true,
          salaryBasis: true,
          effectiveDate: true,
        },
      }),
      prisma.overtimePolicy.findMany({
        where: {
          deletedAt: null,
          status: "ACTIVE",
        },
        orderBy: [{ rateMultiplier: "asc" }, { createdAt: "asc" }],
        select: {
          branchId: true,
          companyId: true,
          employeeTypeId: true,
          workType: true,
          rateMultiplier: true,
          amountRoundingMode: true,
        },
      }),
      /* สาขา/บริษัท/ประเภทของแต่ละคน — อ่านเองไม่พึ่ง select ของผู้เรียก
         ซึ่งไม่ได้ติดสาขามาทุกทาง */
      prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true,
          branchId: true,
          companyId: true,
          employeeTypeId: true,
        },
      }),
    ]);

    const compensationByEmployeeId = new Map<string, any>();
    for (const compensation of compensations) {
      if (!compensationByEmployeeId.has(compensation.employeeId)) {
        compensationByEmployeeId.set(compensation.employeeId, compensation);
      }
    }

    const pendingByEmployeeId = new Map<string, {
      leave: number;
      overtime: number;
      timeAdjust: number;
      offsite: number;
    }>();
    const ensurePending = (employeeId: string) => {
      const current = pendingByEmployeeId.get(employeeId) ?? {
        leave: 0,
        overtime: 0,
        timeAdjust: 0,
        offsite: 0,
      };
      pendingByEmployeeId.set(employeeId, current);
      return current;
    };

    const addPendingCount = (
      groups: any[],
      key: "leave" | "overtime" | "timeAdjust" | "offsite",
    ) => {
      for (const group of groups) {
        ensurePending(group.employeeId)[key] += Number(group._count?._all ?? 0);
      }
    };

    addPendingCount(pendingLeaveGroups, "leave");
    addPendingCount(pendingOvertimeGroups, "overtime");
    addPendingCount(pendingTimeAdjustGroups, "timeAdjust");
    addPendingCount(pendingOffsiteGroups, "offsite");

    const scopeByEmployeeId = new Map<string, any>(
      employeeScopes.map((row: any) => [row.id, row]),
    );

    /*
     * จับคู่นโยบาย OT ด้วยกติกาเดียวกับที่ payroll ใช้ตอนคิดเงินจริง
     *
     * ของเดิมจับคู่แค่ บริษัท + ประเภทพนักงาน แล้วเก็บ "ตัวแรกที่เจอ" จาก
     * รายการที่เรียงอัตราจากน้อยไปมาก — พอบริษัทตั้งนโยบายรายสาขาเมื่อไร
     * ยอด preview จะกลายเป็นอัตราต่ำสุดของทุกสาขาโดยไม่มีใครรู้
     */
    const policyFor = (item: any, workType: string) => {
      const scope = scopeByEmployeeId.get(item.employeeId);

      return pickOvertimePolicy(overtimePolicies as any[], {
        branchId: scope?.branchId ?? null,
        companyId:
          scope?.companyId ??
          item.employee?.companyId ??
          item.employee?.company?.id ??
          null,
        employeeTypeId: scope?.employeeTypeId ?? null,
        workType,
      });
    };

    /*
     * ไม่มีนโยบายที่ใช้กับคนนี้ = ไม่รู้อัตรา จึงคิดเป็น 0
     *
     * เดิมเดาอัตราขั้นต่ำตามกฎหมาย (1.5/2/3) ให้เงียบ ๆ ซึ่งทำให้ยอด preview
     * ไม่ตรงกับสลิปของบริษัทที่ตั้งอัตราไว้ต่างจากกฎหมาย และไม่มีอะไรบอก HR
     * ว่าตัวเลขนั้นมาจากการเดา ยอด 0 ทำให้เห็นทันทีว่ายังไม่ได้ตั้งนโยบาย
     */
    const policyMultiplier = (item: any, workType: string) => {
      const policy = policyFor(item, workType);

      return policy ? Number(policy.rateMultiplier ?? 0) : 0;
    };

    // ยอด preview ต้องปัดเศษแบบเดียวกับที่ payroll คิดจริง ไม่งั้นตัวเลขจะไม่ตรงกัน
    const policyAmountRounding = (item: any, workType: string) =>
      policyFor(item, workType)?.amountRoundingMode ?? "NONE";

    const previewByEmployeeId = new Map<string, any>();
    const ensurePreview = (item: any) => {
      const existing = previewByEmployeeId.get(item.employeeId);
      if (existing) return existing;

      const compensation = compensationByEmployeeId.get(item.employeeId);
      const baseSalary = Number(compensation?.baseSalary ?? 0);
      const itemCompanyId = item.employee?.companyId ?? item.employee?.company?.id ?? item.companyId;
      const itemPayrollSettings = itemCompanyId
        ? payrollSettingsByCompanyId.get(itemCompanyId) ?? payrollSettingsFallback
        : payrollSettingsFallback;
      const salaryDivisorDays = itemPayrollSettings.salaryDivisorDays;
      const workingHoursPerDay = itemPayrollSettings.workingHoursPerDay;
      // ต้องรู้ฐานค่าจ้างก่อน ไม่งั้นค่าแรงรายวัน 500 จะถูกหาร 30 กลายเป็น 16.67
      const rates = resolveSalaryRates(
        baseSalary,
        { salaryDivisorDays, workingHoursPerDay },
        compensation?.salaryBasis,
      );
      const dailyRate = this.roundMoney(rates.exactDailyRate);
      const hourlyRate = this.roundMoney(rates.exactHourlyRate);

      const preview = {
        baseSalaryAmount: this.roundMoney(baseSalary),
        salaryDivisorDays,
        workingHoursPerDay,
        dailyRatePreview: dailyRate,
        hourlyRatePreview: hourlyRate,
        approvedOvertimeRequestCount: 0,
        approvedOvertimeHours: 0,
        approvedOvertimeAmountPreview: 0,
        approvedOvertimeWorkdayHours: 0,
        approvedOvertimeWorkdayAmountPreview: 0,
        approvedOvertimeHolidayHours: 0,
        approvedOvertimeHolidayAmountPreview: 0,
        approvedOvertimeSpecialHolidayHours: 0,
        approvedOvertimeSpecialHolidayAmountPreview: 0,
      };

      previewByEmployeeId.set(item.employeeId, preview);
      return preview;
    };

    const itemByEmployeeId = new Map(items.map((item) => [item.employeeId, item]));
    for (const overtime of approvedOvertimeGroups) {
      const item = itemByEmployeeId.get(overtime.employeeId);
      if (!item) continue;

      const preview = ensurePreview(item);
      const hours = Number(overtime._sum?.totalHours ?? 0);
      if (!Number.isFinite(hours) || hours <= 0) continue;

      const workType = overtime.workType || "WORKDAY";
      const multiplier = policyMultiplier(item, workType);
      const rate = this.roundMoney(preview.hourlyRatePreview * multiplier);
      const amount = this.roundMoney(
        applyOvertimeAmountRounding(
          hours * rate,
          policyAmountRounding(item, workType),
        ),
      );

      preview.approvedOvertimeRequestCount += Number(overtime._count?._all ?? 0);
      preview.approvedOvertimeHours = this.roundNumber(preview.approvedOvertimeHours + hours, 2);
      preview.approvedOvertimeAmountPreview = this.roundMoney(preview.approvedOvertimeAmountPreview + amount);

      if (workType === "HOLIDAY") {
        preview.approvedOvertimeHolidayHours = this.roundNumber(preview.approvedOvertimeHolidayHours + hours, 2);
        preview.approvedOvertimeHolidayAmountPreview = this.roundMoney(preview.approvedOvertimeHolidayAmountPreview + amount);
      } else if (workType === "SPECIAL_HOLIDAY") {
        preview.approvedOvertimeSpecialHolidayHours = this.roundNumber(preview.approvedOvertimeSpecialHolidayHours + hours, 2);
        preview.approvedOvertimeSpecialHolidayAmountPreview = this.roundMoney(preview.approvedOvertimeSpecialHolidayAmountPreview + amount);
      } else {
        preview.approvedOvertimeWorkdayHours = this.roundNumber(preview.approvedOvertimeWorkdayHours + hours, 2);
        preview.approvedOvertimeWorkdayAmountPreview = this.roundMoney(preview.approvedOvertimeWorkdayAmountPreview + amount);
      }
    }

    return items.map((item) => {
      const preview = ensurePreview(item);
      const pending = pendingByEmployeeId.get(item.employeeId) ?? {
        leave: 0,
        overtime: 0,
        timeAdjust: 0,
        offsite: 0,
      };
      const pendingApprovalRequestCount =
        pending.leave + pending.overtime + pending.timeAdjust + pending.offsite;
      const approvedOvertimeMinutes = Math.round(
        Number(preview.approvedOvertimeHours ?? 0) * 60,
      );
      const totalDeductionAmount = Number(item.totalDeductionAmount ?? 0);
      const payrollImpactAmountPreview = this.roundMoney(
        preview.approvedOvertimeAmountPreview - totalDeductionAmount,
      );
      const blockerMessages = [...(item.blockerMessages ?? [])];

      if (pendingApprovalRequestCount > 0) {
        blockerMessages.push(
          `มีคำขอรออนุมัติ ${pendingApprovalRequestCount.toLocaleString("th-TH")} รายการ`,
        );
      }

      const immutableStatus = ["SENT_TO_PAYROLL", "LOCKED"].includes(
        String(item.status ?? "").toUpperCase(),
      );
      const effectiveStatus =
        pendingApprovalRequestCount > 0 && !immutableStatus
          ? "NEED_REVIEW"
          : item.status;

      return {
        ...item,
        ...preview,
        status: effectiveStatus,
        approvedOtMinutes: Math.max(
          Number(item.approvedOtMinutes ?? 0),
          approvedOvertimeMinutes,
        ),
        payableOtMinutes: Math.max(
          Number(item.payableOtMinutes ?? 0),
          approvedOvertimeMinutes,
        ),
        pendingLeaveRequestCount: pending.leave,
        pendingOvertimeRequestCount: pending.overtime,
        pendingTimeAdjustRequestCount: pending.timeAdjust,
        pendingOffsiteRequestCount: pending.offsite,
        pendingApprovalRequestCount,
        payrollImpactAmountPreview,
        blockerMessages,
        canReadyForPayroll: item.canReadyForPayroll && pendingApprovalRequestCount === 0,
        canLock: item.canLock && pendingApprovalRequestCount === 0,
      };
    });
  }

  private endOfDate(value: Date) {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private resolveMonthlyReviewStatus(counts: {
    summaryCount: number;
    missingSummaryCount: number;
    needReviewCount: number;
    sentToPayrollCount: number;
    lockedCount: number;
    readyForPayrollCount: number;
    reviewedCount: number;
  }) {
    if (counts.sentToPayrollCount === counts.summaryCount && counts.summaryCount > 0) {
      return "SENT_TO_PAYROLL";
    }
    if (counts.lockedCount === counts.summaryCount && counts.summaryCount > 0) {
      return "LOCKED";
    }
    if (counts.summaryCount === 0 || counts.missingSummaryCount > 0) {
      return "DATA_INCOMPLETE";
    }

    if (counts.needReviewCount > 0) return "NEED_REVIEW";
    if (counts.readyForPayrollCount + counts.lockedCount === counts.summaryCount) {
      return "READY_FOR_PAYROLL";
    }
    if (
      counts.reviewedCount + counts.readyForPayrollCount + counts.lockedCount ===
      counts.summaryCount
    ) {
      return "REVIEWED";
    }

    return "CALCULATED";
  }

  private matchesMonthlyReviewIssue(item: any, issue?: string) {
    if (!issue || issue === "ALL") return true;

    const hasAlerts =
      item.status === "NEED_REVIEW" ||
      item.status === "DATA_INCOMPLETE" ||
      Number(item.lateOverThresholdDayCount ?? 0) > 0 ||
      Number(item.missingLogCount ?? 0) > 0 ||
      Number(item.absentDayCount ?? 0) > 0 ||
      Number(item.earlyCheckoutMinutes ?? 0) > 0 ||
      Number(item.lateCheckoutMinutes ?? 0) > 0 ||
      Number(item.paidLeaveMinutes ?? 0) > 0 ||
      Number(item.unpaidLeaveMinutes ?? 0) > 0 ||
      Number(item.offsiteMinutes ?? 0) > 0 ||
      Number(item.approvedOvertimeAmountPreview ?? 0) > 0 ||
      Number(item.pendingApprovalRequestCount ?? 0) > 0 ||
      Number(item.totalDeductionAmount ?? 0) > 0 ||
      Number(item.payrollLinkedCount ?? 0) > 0;

    if (issue === "ALERTS") return hasAlerts;
    if (issue === "NORMAL_READY") {
      return (
        !hasAlerts &&
        (item.status === "READY_FOR_PAYROLL" || item.status === "LOCKED")
      );
    }
    if (issue === "NEED_REVIEW") {
      return item.status === "NEED_REVIEW" || item.status === "DATA_INCOMPLETE";
    }
    if (issue === "MISSING_LOG") return Number(item.missingLogCount ?? 0) > 0;
    if (issue === "ABSENT") return Number(item.absentDayCount ?? 0) > 0;
    if (issue === "LATE") return Number(item.lateOverThresholdDayCount ?? 0) > 0;
    if (issue === "EARLY_CHECKOUT") {
      return Number(item.earlyCheckoutMinutes ?? 0) > 0;
    }
    if (issue === "LATE_CHECKOUT") {
      return Number(item.lateCheckoutMinutes ?? 0) > 0;
    }
    if (issue === "LEAVE") {
      return (
        Number(item.paidLeaveMinutes ?? 0) > 0 ||
        Number(item.unpaidLeaveMinutes ?? 0) > 0
      );
    }
    if (issue === "UNPAID_LEAVE") return Number(item.unpaidLeaveMinutes ?? 0) > 0;
    if (issue === "OFFSITE") return Number(item.offsiteMinutes ?? 0) > 0;
    if (issue === "PENALTY") return Number(item.totalDeductionAmount ?? 0) > 0;
    if (issue === "READY_FOR_PAYROLL") {
      return item.status === "READY_FOR_PAYROLL";
    }
    if (issue === "LOCKED") return item.status === "LOCKED";

    return true;
  }

  private validateMonthlyReviewAction(
    summaries: any[],
    dayCount: number,
    nextStatus: MonthlyReviewNextStatus,
    pendingApprovalRequestCount = 0,
  ) {
    if (summaries.length < dayCount) {
      return {
        ok: false,
        message: "ยังมีวันที่ไม่มี daily summary กรุณาคำนวณสรุปเวลาให้ครบช่วงงวดก่อน",
      };
    }

    if (
      summaries.some(
        (summary) =>
          summary.reviewStatus === AttendanceReviewStatus.SENT_TO_PAYROLL ||
          summary.sentToPayrollAt ||
          summary.payrollRunId,
      )
    ) {
      return {
        ok: false,
        message: "มีรายการที่ส่งหรือผูกกับ Payroll แล้ว ไม่สามารถเปลี่ยนสถานะผ่าน Monthly Review ได้",
      };
    }

    if (pendingApprovalRequestCount > 0) {
      return {
        ok: false,
        message: `ยังมีคำขอรออนุมัติ ${pendingApprovalRequestCount.toLocaleString("th-TH")} รายการ กรุณาดำเนินการให้เสร็จก่อนพร้อมหรือล็อกงวด`,
      };
    }

    if (nextStatus === AttendanceReviewStatus.READY_FOR_PAYROLL) {
      const needsReviewCount = summaries.filter(
        (summary) => resolveAttendanceReviewState(summary).requiresReview,
      ).length;

      if (needsReviewCount > 0) {
        return {
          ok: false,
          message: `ยังมีรายการต้องตรวจสอบ ${needsReviewCount.toLocaleString("th-TH")} วัน กรุณาตรวจในหน้า Attendance ก่อนส่งเข้า Payroll`,
        };
      }

      return { ok: true, message: "" };
    }

    if (
      summaries.some(
        (summary) =>
          summary.reviewStatus !== AttendanceReviewStatus.READY_FOR_PAYROLL &&
          summary.reviewStatus !== AttendanceReviewStatus.LOCKED,
      )
    ) {
      return {
        ok: false,
        message: "ต้อง Ready Payroll ให้ครบช่วงงวดก่อนจึงจะ Lock ได้",
      };
    }

    return { ok: true, message: "" };
  }

  private shouldUpdateSummaryForMonthlyAction(
    summary: any,
    nextStatus: MonthlyReviewNextStatus,
  ) {
    if (
      summary.reviewStatus === AttendanceReviewStatus.SENT_TO_PAYROLL ||
      summary.sentToPayrollAt ||
      summary.payrollRunId ||
      summary.reviewStatus === AttendanceReviewStatus.LOCKED ||
      summary.lockedAt
    ) {
      return false;
    }

    if (nextStatus === AttendanceReviewStatus.READY_FOR_PAYROLL) {
      return summary.reviewStatus !== AttendanceReviewStatus.READY_FOR_PAYROLL;
    }

    return summary.reviewStatus === AttendanceReviewStatus.READY_FOR_PAYROLL;
  }

  private getTodayDateOnly() {
    return this.getWorkDateFromLogTime(new Date());
  }

  private capDateToToday(dateTo: Date) {
    const today = this.getTodayDateOnly();
    return dateTo > today ? today : dateTo;
  }

  private ensureValidDateRange(dateFrom: Date, dateTo: Date) {
    if (dateFrom > dateTo) {
      throw new BadRequestException("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด");
    }

    if (this.countInclusiveDays(dateFrom, dateTo) > 62) {
      throw new BadRequestException(
        "Monthly HR Review รองรับช่วงวันที่ไม่เกิน 62 วันต่อครั้ง",
      );
    }
  }

  private countInclusiveDays(dateFrom: Date, dateTo: Date) {
    const start = Date.UTC(
      dateFrom.getUTCFullYear(),
      dateFrom.getUTCMonth(),
      dateFrom.getUTCDate(),
    );
    const end = Date.UTC(
      dateTo.getUTCFullYear(),
      dateTo.getUTCMonth(),
      dateTo.getUTCDate(),
    );

    return Math.floor((end - start) / 86_400_000) + 1;
  }


  private appendWhereAnd(where: Record<string, unknown>, condition: Record<string, unknown>) {
    const existing = where.AND;

    if (!existing) {
      where.AND = [condition];
      return;
    }

    if (Array.isArray(existing)) {
      existing.push(condition);
      return;
    }

    where.AND = [existing, condition];
  }

  private buildBangkokDateTimeBoundary(date: Date, endOfDay = false) {
    return new Date(
      `${this.toDateKey(date)}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`,
    );
  }

  private buildTimeAdjustEmployeeWhere(
    query: ListAttendanceDailySummariesQueryDto,
    employeeWhere: Record<string, unknown>,
    scope?: { employeeIds?: string[] },
  ) {
    const where: Record<string, unknown> = {
      ...employeeWhere,
    };

    if (scope?.employeeIds?.length) {
      where.id = { in: scope.employeeIds };
    }

    if (query.employeeId) {
      where.id = query.employeeId;
    }

    return where;
  }

  private async applyDailySummaryTimeAdjustIssueFilter(
    where: Record<string, unknown>,
    query: ListAttendanceDailySummariesQueryDto,
    employeeWhere: Record<string, unknown>,
    scope?: { employeeIds?: string[] },
  ) {
    const timeAdjustWhere: Record<string, unknown> = {
      deletedAt: null,
      status: { not: "DRAFT" },
    };

    const requestedLogTime: Record<string, Date> = {};
    if (query.dateFrom) {
      requestedLogTime.gte = this.buildBangkokDateTimeBoundary(
        this.toDateOnly(query.dateFrom),
      );
    }
    if (query.dateTo) {
      requestedLogTime.lte = this.buildBangkokDateTimeBoundary(
        this.toDateOnly(query.dateTo),
        true,
      );
    }
    if (Object.keys(requestedLogTime).length > 0) {
      timeAdjustWhere.requestedLogTime = requestedLogTime;
    }

    if (query.employeeId) {
      timeAdjustWhere.employeeId = query.employeeId;
    }

    const requestEmployeeWhere = this.buildTimeAdjustEmployeeWhere(
      query,
      employeeWhere,
      scope,
    );
    if (Object.keys(requestEmployeeWhere).length > 0) {
      timeAdjustWhere.employee = requestEmployeeWhere;
    }

    const requests = await (this.prisma as any).timeAdjustRequest.findMany({
      where: timeAdjustWhere,
      select: {
        employeeId: true,
        requestedLogTime: true,
      },
      orderBy: [{ requestedLogTime: "desc" }],
    });

    const pairMap = new Map<string, { employeeId: string; workDate: Date }>();
    for (const request of requests) {
      if (!request.employeeId || !request.requestedLogTime) continue;
      const workDate = this.getWorkDateFromLogTime(request.requestedLogTime);
      pairMap.set(this.buildEmployeeDateKey(request.employeeId, workDate), {
        employeeId: request.employeeId,
        workDate,
      });
    }

    if (pairMap.size === 0) {
      this.appendWhereAnd(where, { id: "__no_time_adjust_daily_summary__" });
      return;
    }

    this.appendWhereAnd(where, {
      OR: Array.from(pairMap.values()).map((pair) => ({
        employeeId: pair.employeeId,
        workDate: pair.workDate,
      })),
    });
  }

  private applyDailySummaryIssueFilter(where: Record<string, unknown>, issue?: string) {
    if (!issue || issue === "ALL") return;

    if (issue === "ALERTS") {
      where.OR = [
        { reviewStatus: AttendanceReviewStatus.NEED_REVIEW },
        { hasMissingLog: true },
        { isAbsent: true },
        { totalLateMinutes: { gt: LATE_REVIEW_THRESHOLD_MINUTES } },
        { earlyCheckoutMinutes: { gt: 0 } },
        { missingLogPenaltyAmount: { gt: 0 } },
        { absentDeductionAmount: { gt: 0 } },
        { earlyCheckoutPenaltyAmount: { gt: 0 } },
      ];
      return;
    }

    if (issue === "NORMAL_READY") {
      where.reviewStatus = { in: [AttendanceReviewStatus.READY_FOR_PAYROLL, AttendanceReviewStatus.LOCKED] };
      where.hasMissingLog = false;
      where.isAbsent = false;
      where.totalDeductionAmount = 0;
      return;
    }

    if (issue === "NEED_REVIEW") where.reviewStatus = AttendanceReviewStatus.NEED_REVIEW;
    if (issue === "READY_FOR_PAYROLL") where.reviewStatus = AttendanceReviewStatus.READY_FOR_PAYROLL;
    if (issue === "LOCKED") where.reviewStatus = AttendanceReviewStatus.LOCKED;
    if (issue === "MISSING_LOG") {
      where.hasMissingLog = true;
      where.isAbsent = false;
    }
    if (issue === "MISSING_MORNING") where.isMorningMissing = true;
    if (issue === "MISSING_AFTERNOON") where.isAfternoonMissing = true;
    if (issue === "MISSING_CHECKOUT") where.isCheckoutMissing = true;
    if (issue === "ABSENT") where.isAbsent = true;
    if (issue === "LATE") where.totalLateMinutes = { gt: 0 };
    if (issue === "EARLY_CHECKOUT") where.earlyCheckoutMinutes = { gt: 0 };
    if (issue === "LATE_CHECKOUT") where.lateCheckoutMinutes = { gt: 0 };
    if (issue === "LEAVE") where.leaveRequestId = { not: null };
    if (issue === "UNPAID_LEAVE") where.unpaidLeaveDeductionAmount = { gt: 0 };
    if (issue === "OFFSITE") where.offsiteMinutes = { gt: 0 };
    if (issue === "PENALTY") where.totalDeductionAmount = { gt: 0 };
  }

  private async findDailySummariesByScope(
    query: ListAttendanceDailySummariesQueryDto,
    scope?: { employeeIds?: string[] },
    tenantScope: TenantScope = { level: "GLOBAL", companyId: null, branchId: null },
  ) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const skip = (page - 1) * pageSize;
    const prisma = this.prisma as any;

    const where: Record<string, unknown> = {};

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (scope?.employeeIds) {
      where.employeeId = { in: scope.employeeIds };
    }

    if (query.dateFrom || query.dateTo) {
      where.workDate = {} as Record<string, Date>;

      if (query.dateFrom) {
        (where.workDate as Record<string, Date>).gte = this.toDateOnly(
          query.dateFrom,
        );
      }

      if (query.dateTo) {
        (where.workDate as Record<string, Date>).lte = this.toDateOnly(
          query.dateTo,
        );
      }
    }

    if (query.hasMissingLog !== undefined) {
      where.hasMissingLog = query.hasMissingLog;
    }

    if (query.leaveIsPaid !== undefined) {
      where.leaveIsPaid = query.leaveIsPaid;
    }

    if (query.reviewStatus) {
      where.reviewStatus = query.reviewStatus;
    }

    if (query.hasPenalty === true) {
      where.OR = [
        { latePenaltyAmount: { gt: 0 } },
        { missingLogPenaltyAmount: { gt: 0 } },
        { absentDeductionAmount: { gt: 0 } },
        { unpaidLeaveDeductionAmount: { gt: 0 } },
        { totalDeductionAmount: { gt: 0 } },
      ];
    } else if (query.hasPenalty === false) {
      where.latePenaltyAmount = 0;
      where.missingLogPenaltyAmount = 0;
      where.absentDeductionAmount = 0;
      where.unpaidLeaveDeductionAmount = 0;
      where.totalDeductionAmount = 0;
    }

    const issue = query.issue;
    if (issue && issue !== "TIME_ADJUST") {
      this.applyDailySummaryIssueFilter(where, issue);
    }

    const employeeWhere: Record<string, unknown> = {};

    const scopedCompanyId = effectiveCompanyId(tenantScope, query.companyId);
    if (scopedCompanyId) employeeWhere.companyId = scopedCompanyId;
    // BRANCH scope: ล็อกสาขาเป็นของผู้ใช้เสมอ (เมินค่าที่ client ส่ง) ให้สอดคล้องกับ recalculateDailySummaries
    // ป้องกันไม่ให้รายการโชว์ข้ามสาขา ทั้งที่คำนวณใหม่ทำได้แค่สาขาตัวเอง
    const scopedBranchId =
      tenantScope.level === "BRANCH"
        ? (tenantScope.branchId ?? undefined)
        : query.branchId;
    if (scopedBranchId) employeeWhere.branchId = scopedBranchId;
    if (query.departmentId) employeeWhere.departmentId = query.departmentId;
    if (query.divisionId) employeeWhere.divisionId = query.divisionId;
    if (query.employeeTypeId) employeeWhere.employeeTypeId = query.employeeTypeId;

    if (query.search?.trim()) {
      const search = query.search.trim();
      employeeWhere.OR = [
        { employeeCode: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { nickname: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (Object.keys(employeeWhere).length > 0) {
      where.employee = employeeWhere;
    }

    if (issue === "TIME_ADJUST") {
      await this.applyDailySummaryTimeAdjustIssueFilter(
        where,
        query,
        employeeWhere,
        scope,
      );
    }

    const [items, total, summaryRows] = await this.prisma.$transaction([
      prisma.attendanceDailySummary.findMany({
        where,
        skip,
        take: pageSize,
        /*
         * เรียงให้ตรงกับที่หน้าเว็บจัดกลุ่ม: วันที่ → สาขา → แผนก
         *
         * เดิมเรียงแค่ วันที่ → รหัสพนักงาน ซึ่งไม่มีสาขา/แผนกอยู่ในลำดับเลย
         * พอแบ่งหน้า (20 แถว) หัวข้อสาขาเดียวกันจึงโผล่ซ้ำหลายท่อนในวันเดียวกัน
         *
         * ผู้บริหารขึ้นก่อนเหมือนทะเบียนพนักงาน: ชั้นแผนกใช้ sortOrder ของทะเบียน
         * แผนกมาตรฐาน (บริหาร = 10 มาก่อนทุกแผนก) ชั้นคนใช้ระดับตำแหน่ง (1 = สูงสุด)
         */
        orderBy: [
          { workDate: "desc" },
          { employee: { branch: { nameTh: "asc" } } },
          { employee: { department: { catalog: { sortOrder: "asc" } } } },
          { employee: { department: { nameTh: "asc" } } },
          { employee: { positionMaster: { level: "asc" } } },
          { employee: { employeeCode: "asc" } },
        ],
        include: this.defaultDailySummaryInclude(),
      }),
      prisma.attendanceDailySummary.count({ where }),
      prisma.attendanceDailySummary.findMany({
        where,
        orderBy: [{ workDate: "desc" }],
        select: {
          id: true,
          employeeId: true,
          workDate: true,
          morningLateMinutes: true,
          afternoonLateMinutes: true,
          totalLateMinutes: true,
          hasMissingLog: true,
          isAbsent: true,
          absentDays: true,
          latePenaltyAmount: true,
          missingLogPenaltyAmount: true,
          absentDeductionAmount: true,
          unpaidLeaveDeductionAmount: true,
          totalDeductionAmount: true,
          approvedOtMinutes: true,
          payableOtMinutes: true,
          reviewStatus: true,
          calculationStatus: true,
          calculationNote: true,
          lockedAt: true,
          sentToPayrollAt: true,
          payrollRunId: true,
          employee: {
            select: {
              id: true,
              companyId: true,
              employeeTypeId: true,
            },
          },
        },
      }),
    ]);

    const [enrichedItems, enrichedSummaryRows] = await Promise.all([
      this.enrichDailySummariesWithAttendanceContext(items),
      this.enrichDailySummariesWithAttendanceContext(summaryRows),
    ]);

    return {
      items: enrichedItems.map((item: any) => this.trimDailySummaryPayload(item)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: this.buildAttendanceDailySummaryListSummary(enrichedSummaryRows, total),
    };
  }

  /**
   * ตัด policySnapshot ให้เหลือเฉพาะคีย์ที่หน้าเว็บใช้จริง
   *
   * snapshot เต็มคือสำเนานโยบายทั้งฉบับ (sessionRules, ค่าปรับ, การปัดเศษ ฯลฯ)
   * ราว 3,500 ตัวอักษรต่อแถว ซึ่งเหมือนกันแทบทุกแถวเพราะมีนโยบายเดียวทั้งบริษัท
   * แต่ถูกส่งซ้ำไปทุกแถว ทำให้ขอสรุปแค่ 20 แถวได้ก้อนตอบกลับ 151 KB
   *
   * หน้าตรวจเวลาใช้แค่ holiday กับ workingHoliday ส่วนหน้าตรวจก่อนเข้าเงินเดือน
   * ใช้ attendanceReview เท่านั้น ตัดที่เหลือทิ้งลดขนาดลง 94%
   * ตัวเต็มยังอยู่ครบในฐานข้อมูล ฝั่งคำนวณและ audit อ่านได้เหมือนเดิม
   */
  private trimDailySummaryPayload(item: any) {
    const snapshot = item?.policySnapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return item;
    }

    return {
      ...item,
      policySnapshot: {
        holiday: snapshot.holiday ?? null,
        workingHoliday: snapshot.workingHoliday ?? null,
        attendanceReview: snapshot.attendanceReview ?? null,
      },
    };
  }

  private async enqueueDailySummaryRecalculation(
    employeeId: string,
    workDate: Date,
    requestedById: string,
    source: {
      sourceType?: "ATTENDANCE_LOG" | "SYSTEM";
      sourceId?: string | null;
      sourceAction?: string | null;
    } = {},
  ) {
    try {
      await this.attendanceSummaryQueue.enqueueDailySummaryRecalculation({
        employeeId,
        workDate: this.toDateKey(workDate),
        requestedById,
        sourceType: source.sourceType ?? "ATTENDANCE_LOG",
        sourceId: source.sourceId ?? null,
        sourceAction: source.sourceAction ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `ไม่สามารถส่งงานคำนวณสรุปเวลาเข้า Queue ได้ employeeId=${employeeId} workDate=${this.toDateKey(
          workDate,
        )}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * เวลาที่มีการเขียนรายการลงเวลาล่าสุดของพนักงานคนนี้ในวันนั้น
   *
   * ใช้ตรวจว่างานคำนวณอ่านข้อมูลไปครบหรือยัง
   * ตอนบันทึกเวลาทั้งวันรวดเดียว (เข้า/บ่าย/ออก) ระบบยิงเข้ามาสามครั้งติดกัน
   * งานคำนวณตั้งเวลาไว้ 1 วินาที ถ้ารายการที่สาม commit ช้ากว่านั้นนิดเดียว
   * งานจะอ่านเจอแค่สองรายการแล้วสรุปว่า "ลืมสแกนออก" หักเงิน 50 บาททิ้งไว้
   * โดยไม่มีงานรอบใหม่มาแก้ให้ เพราะการยิงครั้งที่สามไปรวมกับงานเดิมที่รอคิวอยู่
   */
  async findLatestAttendanceLogWriteAt(employeeId: string, workDate: string) {
    const latest = await this.prisma.attendanceLog.findFirst({
      where: {
        employeeId,
        workDate: this.toDateOnly(workDate),
        deletedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    return latest?.updatedAt ?? null;
  }

  /**
   * ลายนิ้วมือของข้อมูลลงเวลาในวันนั้น ใช้ตรวจว่ามีอะไรเปลี่ยนระหว่างคำนวณ
   *
   * ของเดิมเทียบ `updatedAt ล่าสุด > เวลาที่เริ่มคำนวณ` ซึ่งพลาดสองกรณี:
   *   1. `@updatedAt` ถูก stamp ตอนรันคำสั่ง ไม่ใช่ตอน commit
   *      ธุรกรรมที่ stamp ก่อนงานนี้เริ่ม แต่ commit ทีหลัง จะถูกมองว่า "ไม่มีอะไรเปลี่ยน"
   *   2. กรองด้วย `deletedAt: null` ทำให้การลบรายการไม่ถูกนับว่าเป็นการเปลี่ยนแปลงเลย
   *
   * ลายนิ้วมือนับ "ทุกแถวรวมที่ถูกลบ" จึงจับได้ทั้งเพิ่ม แก้ และลบ
   * โดยไม่ต้องพึ่งการเทียบเวลาที่เชื่อไม่ได้
   */
  async getAttendanceLogFingerprint(employeeId: string, workDate: string) {
    const result = await this.prisma.attendanceLog.aggregate({
      where: {
        employeeId,
        workDate: this.toDateOnly(workDate),
      },
      _count: { _all: true },
      _max: { updatedAt: true },
    });

    const activeCount = await this.prisma.attendanceLog.count({
      where: {
        employeeId,
        workDate: this.toDateOnly(workDate),
        deletedAt: null,
      },
    });

    return [
      result._count._all,
      activeCount,
      result._max.updatedAt?.getTime() ?? 0,
    ].join("|");
  }

  async recalculateDailySummaryFromQueue(params: {
    employeeId: string;
    workDate: string;
    requestedById: string;
  }) {
    const prisma = this.prisma as any;
    const workDate = this.toDateOnly(params.workDate);

    const existing = await prisma.attendanceDailySummary.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: params.employeeId,
          workDate,
        },
      },
      select: {
        id: true,
        reviewStatus: true,
        lockedAt: true,
        sentToPayrollAt: true,
        payrollRunId: true,
      },
    });

    if (
      existing?.lockedAt ||
      existing?.sentToPayrollAt ||
      existing?.payrollRunId ||
      existing?.reviewStatus === AttendanceReviewStatus.SENT_TO_PAYROLL ||
      existing?.reviewStatus === AttendanceReviewStatus.LOCKED
    ) {
      return {
        skipped: true,
        reason: "SUMMARY_LOCKED_OR_SENT_TO_PAYROLL",
        summaryId: existing.id,
      };
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: params.employeeId,
        deletedAt: null,
        // เกณฑ์เดียวกับการคำนวณยกช่วง — คนที่ออกไปแล้วยังต้องคำนวณวันที่ยังเป็นพนักงานได้
        OR: [
          {
            employmentEndDate: null,
            status: { notIn: ["RESIGNED", "TERMINATED", "INACTIVE"] },
          },
          { employmentEndDate: { gte: workDate } },
        ],
      },
      select: {
        id: true,
        companyId: true,
        startDate: true,
        employmentEndDate: true,
        branchId: true,
        departmentId: true,
        divisionId: true,
        employeeTypeId: true,
        employeeCode: true,
        nickname: true,
        firstName: true,
        lastName: true,
        displayName: true,
        attendanceTrackingRequired: true,
        attendanceExemptSessions: true,
      },
    });

    if (!employee) {
      return {
        skipped: true,
        reason: "EMPLOYEE_NOT_FOUND_OR_INACTIVE",
        summaryId: null,
      };
    }

    if (this.isBeforeEmploymentStart(employee, workDate)) {
      return {
        skipped: true,
        reason: "BEFORE_EMPLOYMENT_START",
        summaryId: null,
      };
    }

    if (this.isAfterEmploymentEnd(employee, workDate)) {
      return {
        skipped: true,
        reason: "AFTER_EMPLOYMENT_END",
        summaryId: null,
      };
    }

    const summary = await this.calculateAndStoreDailySummary(
      employee,
      workDate,
      params.requestedById,
    );

    return {
      skipped: false,
      summaryId: summary.id,
      employeeId: params.employeeId,
      workDate: this.toDateKey(workDate),
    };
  }

  /**
   * วันก่อนเริ่มงาน ห้ามคำนวณสรุปรายวัน
   * ---------------------------------
   * เดิมการคำนวณย้อนหลังวนพนักงานคูณทุกวันในช่วงโดยไม่ดูวันเริ่มงาน
   * วันที่ยังไม่เป็นพนักงานจึงไม่มีบันทึกเวลา + มีกะผูกอยู่ = เข้าเงื่อนไขขาดงาน
   * แล้วไหลไปเป็นรายการหักเงินใน payroll ทั้งที่คนยังไม่ได้เข้าทำงานด้วยซ้ำ
   *
   * คนเข้ากลางงวดจึงโดนหักขาดงานย้อนไปถึงต้นงวด ซึ่งมองไม่ออกจากตัวเลข
   * เพราะหน้าตาเหมือนวันขาดงานจริงทุกประการ
   */
  /**
   * วันหลังพ้นสภาพพนักงาน ห้ามคำนวณสรุปรายวัน
   * -------------------------------------
   * คู่กับ isBeforeEmploymentStart แต่เป็นด้านท้าย
   *
   * คนที่ลาออกกลางงวดไม่มีบันทึกเวลาหลังวันสุดท้าย พอมีกะผูกอยู่ วันที่เหลือ
   * ของงวดจึงเข้าเงื่อนไขขาดงานทุกวัน เช่น ออกวันที่ 10 ของงวดที่จบวันที่ 25
   * จะโดนตีเป็นขาดงาน 13 วันแล้วหักเงินจนงวดสุดท้ายแทบไม่เหลือ
   *
   * หน้าตาเหมือนขาดงานจริงทุกประการ ตรวจด้วยตาแทบไม่มีทางจับได้
   */
  private isAfterEmploymentEnd(
    employee: DailyCalculationEmployee,
    workDate: Date,
  ) {
    const endDate = (employee as { employmentEndDate?: Date | string | null })
      .employmentEndDate;
    if (!endDate) return false;

    /*
     * ห้ามโยน exception จากตรงนี้เด็ดขาด — เมธอดนี้ถูกเรียกใน loop คำนวณ
     * ของพนักงานทุกคนทุกวัน ค่าวันที่เสียของคนเดียวต้องไม่ล้มทั้งรอบ
     * (toDateOnly โยนได้ถ้าข้อความไม่ใช่วันที่ จึงต้อง parse เองแบบไม่โยน)
     */
    const parsed = endDate instanceof Date ? endDate : new Date(endDate);
    if (Number.isNaN(parsed.getTime())) return false;

    return workDate.getTime() > parsed.getTime();
  }

  private isBeforeEmploymentStart(
    employee: DailyCalculationEmployee,
    workDate: Date,
  ) {
    if (!employee.startDate) return false;

    // startDate เก็บเป็น @db.Date = เที่ยงคืน UTC เทียบกับ workDate ได้ตรง ๆ
    const startDate =
      employee.startDate instanceof Date
        ? employee.startDate
        : this.toDateOnly(employee.startDate);

    if (Number.isNaN(startDate.getTime())) return false;

    return workDate.getTime() < startDate.getTime();
  }

  private async calculateAndStoreDailySummary(
    employee: DailyCalculationEmployee,
    workDate: Date,
    calculatedById: string,
    context: DailyCalculationContext = {},
  ) {
    const prisma = this.prisma as any;
    const policy = await this.getEffectivePolicyForDailySummary(
      employee,
      workDate,
      context,
    );

    const logs =
      context.logsByEmployeeDate?.get(
        this.buildEmployeeDateKey(employee.id, workDate),
      ) ??
      (await this.prisma.attendanceLog.findMany({
        where: {
          employeeId: employee.id,
          workDate,
          deletedAt: null,
          status: { not: AttendanceLogStatus.CANCELLED },
        },
        orderBy: { logTime: "asc" },
      }));

    const holiday = await this.resolveAttendanceHolidayInfo(
      employee,
      workDate,
      context,
    );

    if (holiday.isHoliday) {
      return this.storeHolidayDailySummary(
        employee,
        workDate,
        policy,
        logs,
        calculatedById,
        holiday,
        context,
      );
    }

    const approvedLeaves =
      this.pickApprovedLeavesForWorkDate(
        context.leavesByEmployeeId?.get(employee.id) ?? [],
        workDate,
      ) ??
      (await prisma.leaveRequest.findMany({
        where: {
          employeeId: employee.id,
          status: "APPROVED",
          deletedAt: null,
          startDate: { lte: workDate },
          endDate: { gte: workDate },
        },
        include: { leaveType: true },
        orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
      }));

    const leave = approvedLeaves[0] ?? null;
    const sessionRules = this.getPolicySessionRules(policy);
    // ต้องรู้ชั่วโมงทำงานต่อวันก่อนคิด leave coverage เพราะใช้เป็นเพดานเวลาลาต่อวัน
    const payrollSettings = this.resolvePayrollCalculationSettingsForEmployee(
      employee,
      context,
    );
    const workingMinutesPerDay =
      this.resolveWorkingMinutesPerDay(payrollSettings);
    const leaveCoverage = this.resolveLeaveCoverage(
      approvedLeaves,
      workDate,
      policy,
      sessionRules,
      workingMinutesPerDay,
    );
    const offsiteRequestsForDay = await this.findOffsiteRequestsForDailySummary(
      employee.id,
      workDate,
      context,
    );
    const offsiteRequestCoverage = this.resolveOffsiteRequestCoverage(
      offsiteRequestsForDay,
      sessionRules,
    );
    const timeAdjustRequestsForDay =
      await this.findTimeAdjustRequestsForDailySummary(
        employee.id,
        workDate,
        context,
      );
    const pendingTimeAdjustRequestCount = timeAdjustRequestsForDay.filter(
      (request: any) => request.status === "SUBMITTED",
    ).length;
    const pendingApprovalCounts =
      await this.findPendingApprovalCountsForDailySummary(
        employee.id,
        workDate,
        {
          timeAdjust: pendingTimeAdjustRequestCount,
          offsite: offsiteRequestsForDay.filter((request: any) =>
            ["SUBMITTED", "MANAGER_APPROVED"].includes(String(request.status)),
          ).length,
        },
        context,
      );
    const overtimeCoverage = await this.findApprovedOvertimeCoverageForDailySummary(
      employee.id,
      workDate,
      context,
    );

    const dailyDeductionCap =
      await this.resolveDailyDeductionCapForDailySummary(
        employee.id,
        workDate,
        payrollSettings,
        context.compensationsByEmployeeId?.get(employee.id) ?? [],
      );
    // ค่าปรับจากนโยบายการลาของพนักงานคนนี้ (ไม่เจอ = 1 เท่า เท่าพฤติกรรมเดิม)
    const unpaidDeductionMultiplier =
      leaveCoverage.unpaidLeaveMinutes > 0
        ? await this.resolveUnpaidLeaveDeductionMultiplier(
            employee,
            approvedLeaves,
          )
        : DEFAULT_UNPAID_DEDUCTION_MULTIPLIER;

    /*
     * ลาไม่รับค่าจ้างเต็มวันของพนักงานรายวัน/รายชั่วโมง ไม่ต้องหักอีก
     *
     * ค่าจ้างของคนกลุ่มนี้คิดจากวันที่มาทำงานจริง วันที่ลาทั้งวันจึงไม่มีเงิน
     * ตั้งต้นให้หักอยู่แล้ว ต่างจากลาไม่เต็มวันที่ยังนับเป็นวันทำงานหนึ่งวัน
     * จึงต้องหักตามชั่วโมงที่ขาดไปตามปกติ
     */
    const unpaidLeaveMinutesToDeduct =
      this.coversWholeDay(leaveCoverage) &&
      !deductsWholeDayAbsence(
        this.pickCompensationForWorkDate(
          context.compensationsByEmployeeId?.get(employee.id) ?? [],
          workDate,
        )?.salaryBasis,
      )
        ? 0
        : leaveCoverage.unpaidLeaveMinutes;

    const unpaidLeaveDeduction =
      await this.resolveUnpaidLeaveDeductionForDailySummary(
        employee.id,
        workDate,
        unpaidLeaveMinutesToDeduct,
        payrollSettings,
        context.compensationsByEmployeeId?.get(employee.id) ?? [],
        unpaidDeductionMultiplier,
      );
    const unpaidLeaveDeductionAmount = unpaidLeaveDeduction.amount;

    /*
     * อ่านสรุปเดิมของวันนี้ก่อนคำนวณ
     *
     * ต้องอ่านก่อน เพราะการยกเว้นค่าปรับช่วงบ่ายที่ HR ตั้งไว้ ต้องส่งเข้า
     * เครื่องคำนวณตั้งแต่ต้น ไม่ใช่ไปลบยอดทีหลัง (ยอดผ่านเพดานรายวันมาแล้ว)
     */
    const existingSummaryKey = this.buildEmployeeDateKey(employee.id, workDate);
    const existingReviewState = context.existingSummaryByEmployeeDate
      ? (context.existingSummaryByEmployeeDate.get(existingSummaryKey) ?? null)
      : await prisma.attendanceDailySummary.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate,
        },
      },
      select: {
        id: true,
        reviewStatus: true,
        reviewedAt: true,
        reviewedById: true,
        readyForPayrollAt: true,
        readyForPayrollById: true,
        lockedAt: true,
        lockedById: true,
        sentToPayrollAt: true,
        sentToPayrollById: true,
        payrollPeriodId: true,
        payrollRunId: true,
        policySnapshot: true,
        totalDeductionAmount: true,
        /* การตัดสินใจของ HR ต้องรอดจากการคำนวณใหม่ ไม่งั้นกดคำนวณทีเดียวหายหมด */
        missingLogPenaltyWaived: true,
        penaltyWaivedReason: true,
        penaltyWaivedAt: true,
        penaltyWaivedById: true,
        penaltyWaivedAmount: true,
        afternoonPenaltyWaived: true,
        afternoonPenaltyWaivedReason: true,
        afternoonPenaltyWaivedAmount: true,
      },
    });

    if (
      existingReviewState?.lockedAt ||
      existingReviewState?.sentToPayrollAt ||
      existingReviewState?.payrollRunId ||
      existingReviewState?.reviewStatus === AttendanceReviewStatus.LOCKED ||
      existingReviewState?.reviewStatus === AttendanceReviewStatus.SENT_TO_PAYROLL
    ) {
      throw new BadRequestException(
        "สรุปเวลารายวันนี้ล็อกหรือส่งเข้า Payroll แล้ว ต้องแก้ผ่าน Correction Workflow",
      );
    }

    // ใช้เวลาอ้างอิงเดียวกันตลอดการคำนวณรอบนี้ เพื่อไม่ให้รอบที่ยังไม่ปิดถูกตีเป็นขาดรายการลงเวลาเร็วเกินไป
    const calculationAsOf = new Date();

    const preliminaryCalculation =
      this.attendanceCalculationEngine.calculateDailySummaryDraft({
        workDate,
        policy,
        sessionRules,
        logs,
        leave,
        leaveCoverage,
        unpaidLeaveDeductionAmount,
        absentDeductionAmount: 0,
        dailyDeductionCap,
        offsiteCoverage: offsiteRequestCoverage,
        asOf: calculationAsOf,
        employeeExemption: resolveEmployeeExemption(employee),
        waiveAfternoonPenalty: Boolean(
          existingReviewState?.afternoonPenaltyWaived,
        ),
      });

    const absenceDeduction = preliminaryCalculation.isAbsent
      ? await this.resolveAbsenceDeductionForDailySummary(
          employee.id,
          workDate,
          payrollSettings,
          context.compensationsByEmployeeId?.get(employee.id) ?? [],
        )
      : this.buildEmptyAbsenceDeduction(0, false, workDate, payrollSettings);

    /*
     * นาทีที่ "ใบลาหมดแล้วแต่ยังไม่กลับเข้างาน"
     * --------------------------------------
     * ใบลารายชั่วโมงที่คลุมเวลาเช็คอินของรอบไหน จะปลดรอบนั้นทั้งรอบ
     * ไม่คิดสายอีกเลย ซึ่งถูกแล้วสำหรับช่วงที่ลาไว้ แต่ถ้ากลับเข้ามาช้ากว่า
     * เวลาสิ้นสุดของใบลา นาทีส่วนเกินนั้นเดิมหายไปจากทุกยอด — ไม่เป็นสาย
     * ไม่เป็นลา ไม่เป็นขาดงาน พนักงานจึงได้ค่าจ้างเต็มทั้งที่ไม่ได้อยู่ทำงาน
     *
     * ที่นี่คิดแค่ "จำนวนนาที" เพราะต้องใช้ช่วงเวลาทำงานจริงมาตัด
     * ส่วนการคิดเป็นเงินอยู่ที่เครื่องคำนวณ ซึ่งใช้อัตราค่าปรับมาสายของรอบนั้น
     * เหมือนใบลาที่ไม่ได้คลุมเวลาเช็คอิน จะได้ไม่มีสองมาตรฐานสำหรับเรื่องเดียวกัน
     */
    const uncoveredAfterLeaveMinutes = this.resolveUncoveredAfterLeaveMinutes({
      logs,
      leaveCoverage,
      policy,
      sessionRules,
      isAbsent: preliminaryCalculation.isAbsent,
    });

    const calculation =
      this.attendanceCalculationEngine.calculateDailySummaryDraft({
        workDate,
        policy,
        sessionRules,
        logs,
        leave,
        leaveCoverage,
        unpaidLeaveDeductionAmount,
        absentDeductionAmount: absenceDeduction.amount,
        uncoveredAfterLeaveMinutes,
        dailyDeductionCap,
        offsiteCoverage: offsiteRequestCoverage,
        asOf: calculationAsOf,
        employeeExemption: resolveEmployeeExemption(employee),
        waiveAfternoonPenalty: Boolean(
          existingReviewState?.afternoonPenaltyWaived,
        ),
      });


    const basePolicySnapshot = this.addAttendanceHolidayToPolicySnapshot(
      this.addApprovedOvertimeCoverageToPolicySnapshot(
        this.addOffsiteCoverageToPolicySnapshot(
          this.addAbsenceDeductionToPolicySnapshot(
            this.addLeaveCoverageToPolicySnapshot(
              calculation.policySnapshot,
              leaveCoverage,
              approvedLeaves,
              unpaidLeaveDeduction,
            ),
            absenceDeduction,
          ),
          offsiteRequestCoverage,
        ),
        overtimeCoverage,
      ),
      holiday,
    );
    const calculationNote =
      [
        calculation.calculationNote,
        unpaidLeaveDeduction.missingCompensation &&
        leaveCoverage.unpaidLeaveMinutes > 0
          ? "ไม่พบฐานเงินเดือนสำหรับคำนวณลาไม่ได้รับค่าจ้าง ต้องตรวจสอบ"
          : null,
        absenceDeduction.missingCompensation && calculation.isAbsent
          ? "ไม่พบฐานเงินเดือนสำหรับคำนวณขาดงาน ต้องตรวจสอบ"
          : null,
        dailyDeductionCap.missingCompensation &&
        (calculation.totalLateMinutes > 0 ||
          calculation.earlyCheckoutMinutes > 0 ||
          calculation.latePenaltyAmount > 0 ||
          calculation.earlyCheckoutPenaltyAmount > 0)
          ? "ไม่พบฐานเงินเดือนสำหรับจำกัดค่ามาสายและออกก่อนเวลา ต้องตรวจสอบ"
          : null,
      ]
        .filter(Boolean)
        .join(" / ") || null;
    const calculatedReviewState = resolveAttendanceReviewState({
      ...calculation,
      offsiteStatus: offsiteRequestCoverage.status ?? calculation.offsiteStatus,
      pendingLeaveRequestCount: pendingApprovalCounts.leave,
      pendingOvertimeRequestCount: pendingApprovalCounts.overtime,
      pendingTimeAdjustRequestCount: pendingApprovalCounts.timeAdjust,
      pendingOffsiteRequestCount: pendingApprovalCounts.offsite,
      timeAdjustRequests: timeAdjustRequestsForDay,
      policySnapshot: basePolicySnapshot,
      calculationStatus: "CALCULATED",
      calculationNote,
    });
    const calculatedReviewStatus = calculatedReviewState.hasReviewIssue
      ? AttendanceReviewStatus.NEED_REVIEW
      : AttendanceReviewStatus.CALCULATED;
    const sourceHash = this.buildAttendanceSourceHash({
      employeeId: employee.id,
      workDate,
      logs,
      approvedLeaves,
      offsiteRequests: offsiteRequestsForDay,
      timeAdjustRequests: timeAdjustRequestsForDay,
      overtimeCoverage,
      policy,
      sessionRules,
      holiday,
      dailyDeductionCap,
      unpaidLeaveDeduction,
      absenceDeduction,
      calculation,
      pendingApprovalCounts,
      reviewReasonCodes: calculatedReviewState.reviewReasons.map(
        (reason) => reason.code,
      ),
    });
    const existingAttendanceReview = this.getAttendanceReviewSnapshot(
      existingReviewState?.policySnapshot,
    );
    const previousSourceHash =
      typeof existingAttendanceReview?.sourceHash === "string"
        ? existingAttendanceReview.sourceHash
        : null;
    const preserveStatuses: AttendanceReviewStatus[] = [
      AttendanceReviewStatus.REVIEWED,
      AttendanceReviewStatus.READY_FOR_PAYROLL,
    ];
    const sourceChanged = Boolean(
      existingReviewState &&
        preserveStatuses.includes(existingReviewState.reviewStatus) &&
        (!previousSourceHash || previousSourceHash !== sourceHash),
    );
    const preservedReviewState =
      existingReviewState &&
      preserveStatuses.includes(existingReviewState.reviewStatus) &&
      !sourceChanged
        ? existingReviewState
        : null;
    const invalidation =
      existingReviewState && sourceChanged
        ? {
            invalidatedAt: new Date(),
            invalidatedById: calculatedById,
            oldStatus: existingReviewState.reviewStatus,
            newStatus: calculatedReviewStatus,
            previousSourceHash,
          }
        : null;
    const policySnapshot = this.buildAttendanceReviewPolicySnapshot({
      basePolicySnapshot,
      existingPolicySnapshot: existingReviewState?.policySnapshot,
      reviewState: calculatedReviewState,
      sourceHash,
      invalidation,
    });

    /* การตัดสินใจของ HR ต้องข้ามการคำนวณใหม่มาได้ ไม่งั้นกดคำนวณทีเดียวหายหมด */
    const penaltyWaiver = this.applyMissingLogPenaltyWaiver(
      {
        missingLogPenaltyAmount: calculation.missingLogPenaltyAmount,
        totalDeductionAmount: calculation.totalDeductionAmount,
      },
      existingReviewState,
    );

    const data = {
      morningInAt: calculation.morningIn?.logTime ?? null,
      afternoonInAt: calculation.afternoonIn?.logTime ?? null,
      checkOutAt: calculation.checkOut?.logTime ?? null,
      morningLateMinutes: calculation.morningLateMinutes,
      afternoonLateMinutes: calculation.afternoonLateMinutes,
      totalLateMinutes: calculation.totalLateMinutes,
      isMorningMissing: calculation.isMorningMissing,
      isAfternoonMissing: calculation.isAfternoonMissing,
      isCheckoutMissing: calculation.isCheckoutMissing,
      hasMissingLog: calculation.hasMissingLog,
      isAbsent: calculation.isAbsent,
      absentDays: calculation.absentDays,
      earlyCheckoutMinutes: calculation.earlyCheckoutMinutes,
      lateCheckoutMinutes: calculation.lateCheckoutMinutes,
      extraPresenceMinutes: calculation.extraPresenceMinutes,
      latePenaltyAmount: calculation.latePenaltyAmount,
      missingLogPenaltyAmount: penaltyWaiver.missingLogPenaltyAmount,
      missingMorningPenaltyAmount: calculation.missingMorningPenaltyAmount,
      missingAfternoonPenaltyAmount: calculation.missingAfternoonPenaltyAmount,
      missingCheckoutPenaltyAmount: calculation.missingCheckoutPenaltyAmount,
      earlyCheckoutPenaltyAmount: calculation.earlyCheckoutPenaltyAmount,
      absentDeductionAmount: calculation.absentDeductionAmount,
      unpaidLeaveDeductionAmount: calculation.unpaidLeaveDeductionAmount,
      totalDeductionAmount: penaltyWaiver.totalDeductionAmount,
      missingLogPenaltyWaived: penaltyWaiver.missingLogPenaltyWaived,
      penaltyWaivedReason: penaltyWaiver.penaltyWaivedReason,
      penaltyWaivedAt: penaltyWaiver.penaltyWaivedAt,
      penaltyWaivedById: penaltyWaiver.penaltyWaivedById,
      penaltyWaivedAmount: penaltyWaiver.penaltyWaivedAmount,
      /* การยกเว้นค่าปรับช่วงบ่ายถูกคิดไปแล้วในเครื่องคำนวณ ที่นี่แค่เก็บสถานะต่อ */
      afternoonPenaltyWaived: Boolean(
        existingReviewState?.afternoonPenaltyWaived,
      ),
      afternoonPenaltyWaivedReason:
        existingReviewState?.afternoonPenaltyWaivedReason ?? null,
      afternoonPenaltyWaivedAmount:
        calculation.afternoonPenaltyWaivedAmount ?? 0,
      paidLeaveMinutes: calculation.paidLeaveMinutes,
      unpaidLeaveMinutes: calculation.unpaidLeaveMinutes,
      offsiteMinutes: Math.max(
        calculation.offsiteMinutes,
        offsiteRequestCoverage.minutes,
      ),
      approvedOtMinutes: overtimeCoverage.approvedOtMinutes,
      payableOtMinutes: overtimeCoverage.payableOtMinutes,
      offsiteStatus: offsiteRequestCoverage.status ?? calculation.offsiteStatus,
      reviewStatus: preservedReviewState
        ? preservedReviewState.reviewStatus
        : calculatedReviewStatus,
      leaveRequestId: leave?.id ?? null,
      leaveTypeId: leave?.leaveTypeId ?? null,
      leaveIsPaid: leave?.leaveType?.isPaid ?? null,
      leaveDayType: leave?.dayType ?? null,
      leaveDurationDays: leaveCoverage.durationDays,
      policyId: policy.id === "default-attendance-policy" ? null : policy.id,
      policySnapshot,
      calculationStatus: "CALCULATED",
      calculationNote,
      calculatedAt: new Date(),
      calculatedById,
      ...(preservedReviewState
        ? {
            reviewedAt: preservedReviewState.reviewedAt,
            reviewedById: preservedReviewState.reviewedById,
            readyForPayrollAt: preservedReviewState.readyForPayrollAt,
            readyForPayrollById: preservedReviewState.readyForPayrollById,
            lockedAt: preservedReviewState.lockedAt,
            lockedById: preservedReviewState.lockedById,
            sentToPayrollAt: preservedReviewState.sentToPayrollAt,
            sentToPayrollById: preservedReviewState.sentToPayrollById,
            payrollPeriodId: preservedReviewState.payrollPeriodId,
            payrollRunId: preservedReviewState.payrollRunId,
          }
        : {
            reviewedAt: null,
            reviewedById: null,
            readyForPayrollAt: null,
            readyForPayrollById: null,
            lockedAt: null,
            lockedById: null,
          }),
    };

    const summary = await prisma.attendanceDailySummary.upsert({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate,
        },
      },
      create: {
        employeeId: employee.id,
        workDate,
        ...data,
      },
      update: data,
      include: this.defaultDailySummaryInclude(),
    });

    if (existingReviewState && sourceChanged) {
      const oldReviewReasons = Array.isArray(
        existingAttendanceReview?.reviewReasons,
      )
        ? existingAttendanceReview.reviewReasons
        : [];
      await this.writeAttendanceReviewInvalidatedAudit({
        summaryId: summary.id,
        employeeId: employee.id,
        workDate,
        actorId: calculatedById,
        oldStatus: existingReviewState.reviewStatus,
        newStatus: calculatedReviewStatus,
        oldSourceHash: previousSourceHash,
        newSourceHash: sourceHash,
        oldReviewReasonCodes: oldReviewReasons
          .map((reason: any) => String(reason?.code ?? ""))
          .filter(Boolean),
        newReviewReasonCodes: calculatedReviewState.reviewReasons.map(
          (reason) => reason.code,
        ),
        oldTotalDeductionAmount: Number(
          existingReviewState.totalDeductionAmount ?? 0,
        ),
        newTotalDeductionAmount: Number(calculation.totalDeductionAmount ?? 0),
      });
    }

    return this.grantSubstituteHolidayCreditIfEligible({
      employee,
      workDate,
      holiday,
      summary,
      calculatedById,
    });
  }

  private async grantSubstituteHolidayCreditIfEligible(params: {
    employee: DailyCalculationEmployee;
    workDate: Date;
    holiday: AttendanceHolidayInfo;
    summary: any;
    calculatedById: string;
  }) {
    const { employee, workDate, holiday, summary, calculatedById } = params;

    if (
      !holiday?.isWorkingHoliday ||
      holiday.workOverride?.grantSubstituteHoliday === false
    ) {
      return summary;
    }

    const hasCheckIn = Boolean(summary.morningInAt || summary.afternoonInAt);
    const hasCheckOut = Boolean(summary.checkOutAt);
    const hasMissingLog = Boolean(summary.hasMissingLog);
    const reviewStatus = String(summary.reviewStatus ?? "").toUpperCase();
    const calculationStatus = String(
      summary.calculationStatus ?? "",
    ).toUpperCase();

    if (
      !hasCheckIn ||
      !hasCheckOut ||
      hasMissingLog ||
      reviewStatus === "NEED_REVIEW"
    ) {
      return summary;
    }

    if (calculationStatus === "HOLIDAY") {
      return summary;
    }

    const employeeName =
      employee.displayName ||
      [employee.firstName, employee.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      employee.employeeCode ||
      employee.id;

    const result =
      await this.systemSettingsService.grantSubstituteHolidayCreditForWorkingHoliday(
        {
          companyId: employee.companyId,
          employeeId: employee.id,
          employeeCode: employee.employeeCode ?? null,
          employeeName,
          earnedDate: workDate,
          holidayName: holiday.baseHoliday?.name ?? holiday.name ?? null,
          workOverrideName: holiday.workOverride?.name ?? holiday.name ?? null,
          reason: holiday.workOverride?.reason ?? null,
          sourceSummaryId: summary.id,
          grantedById: calculatedById,
          grantedDays: 1,
          grantedMinutes: 480,
          holidayId:
            holiday.baseHoliday?.source === "CUSTOM"
              ? (holiday.workOverride?.holidayId ?? null)
              : null,
          workAssignmentId: holiday.workOverride?.id ?? null,
        },
      );

    const policySnapshot = this.addSubstituteHolidayCreditToPolicySnapshot(
      summary.policySnapshot,
      result.credit,
      result.created,
    );

    return (this.prisma as any).attendanceDailySummary.update({
      where: { id: summary.id },
      data: { policySnapshot },
      include: this.defaultDailySummaryInclude(),
    });
  }

  /**
   * วันนี้เป็นวันหยุดของพนักงานคนนี้หรือไม่
   *
   * การคำนวณแบบยกช่วง (หน้าจอกดคำนวณใหม่) เตรียมตั้งค่าวันหยุดมาใน context
   * แต่การคำนวณทีละวันจากคิว (เช่นตอนแก้เวลา อนุมัติใบลา หรือแก้นโยบาย)
   * เรียกมาโดยไม่มี context
   *
   * เดิมกรณีไม่มี context จะคืน "ไม่ใช่วันหยุด" ตายตัว ผลคือวันอาทิตย์
   * กลายเป็นวันทำงานที่ไม่มีใครสแกน = ขาดงาน แล้วหักเงินเต็มวันทันที
   * และเป็นแบบนั้นเฉพาะรายการที่คิวไปคำนวณซ้ำ ทำให้ตัวเลขสองเส้นทางไม่ตรงกัน
   */
  private async resolveAttendanceHolidayInfo(
    employee: DailyCalculationEmployee,
    workDate: Date,
    context: DailyCalculationContext,
  ): Promise<AttendanceHolidayInfo> {
    // ใช้ตั้งค่าวันหยุดของบริษัทพนักงานคนนั้นก่อน (per-company)
    const holidaySettings =
      context.attendanceHolidaySettingsByCompanyId?.get(employee.companyId) ??
      context.attendanceHolidaySettings;

    if (holidaySettings) {
      return this.systemSettingsService.resolveEmployeeAttendanceHolidayInfo(
        workDate,
        holidaySettings as any,
        employee,
      );
    }

    return this.systemSettingsService.getEmployeeAttendanceHolidayInfo(
      workDate,
      employee,
    );
  }

  private async storeHolidayDailySummary(
    employee: DailyCalculationEmployee,
    workDate: Date,
    policy: any,
    logs: any[],
    calculatedById: string,
    holiday: AttendanceHolidayInfo,
    context: DailyCalculationContext = {},
  ) {
    const prisma = this.prisma as any;
    const morningIn = this.findMorningInLog(logs);
    const afternoonIn = this.findAfternoonInLog(logs, morningIn?.id);
    const checkOut = this.findCheckOutLog(logs);
    const sessionRules = this.getPolicySessionRules(policy);
    const [overtimeCoverage, offsiteRequestsForDay, timeAdjustRequestsForDay] =
      await Promise.all([
        this.findApprovedOvertimeCoverageForDailySummary(
          employee.id,
          workDate,
          context,
        ),
        this.findOffsiteRequestsForDailySummary(employee.id, workDate, context),
        this.findTimeAdjustRequestsForDailySummary(
          employee.id,
          workDate,
          context,
        ),
      ]);
    const pendingApprovalCounts =
      await this.findPendingApprovalCountsForDailySummary(
        employee.id,
        workDate,
        {
          timeAdjust: timeAdjustRequestsForDay.filter(
            (request: any) => request.status === "SUBMITTED",
          ).length,
          offsite: offsiteRequestsForDay.filter((request: any) =>
            ["SUBMITTED", "MANAGER_APPROVED"].includes(String(request.status)),
          ).length,
        },
        context,
      );

    /* ตอนคำนวณทั้งงวดโหลดสถานะรีวิวมาเป็นก้อนแล้ว ไม่ต้องอ่านซ้ำทีละวัน */
    const cachedReviewState = context.existingSummaryByEmployeeDate?.get(
      this.buildEmployeeDateKey(employee.id, workDate),
    );
    const existingReviewState = context.existingSummaryByEmployeeDate
      ? (cachedReviewState ?? null)
      : await prisma.attendanceDailySummary.findUnique({
          where: {
            employeeId_workDate: {
              employeeId: employee.id,
              workDate,
            },
          },
          select: {
            id: true,
            reviewStatus: true,
            reviewedAt: true,
            reviewedById: true,
            readyForPayrollAt: true,
            readyForPayrollById: true,
            lockedAt: true,
            lockedById: true,
            sentToPayrollAt: true,
            sentToPayrollById: true,
            payrollPeriodId: true,
            payrollRunId: true,
            policySnapshot: true,
            totalDeductionAmount: true,
            /* การตัดสินใจของ HR ต้องรอดจากการคำนวณใหม่ */
            missingLogPenaltyWaived: true,
            penaltyWaivedReason: true,
            penaltyWaivedAt: true,
            penaltyWaivedById: true,
            penaltyWaivedAmount: true,
            afternoonPenaltyWaived: true,
            afternoonPenaltyWaivedReason: true,
            afternoonPenaltyWaivedAmount: true,
          },
        });

    if (
      existingReviewState?.lockedAt ||
      existingReviewState?.sentToPayrollAt ||
      existingReviewState?.payrollRunId ||
      existingReviewState?.reviewStatus === AttendanceReviewStatus.LOCKED ||
      existingReviewState?.reviewStatus === AttendanceReviewStatus.SENT_TO_PAYROLL
    ) {
      throw new BadRequestException(
        "สรุปเวลารายวันนี้ล็อกหรือส่งเข้า Payroll แล้ว ต้องแก้ผ่าน Correction Workflow",
      );
    }

    const basePolicySnapshot = this.addApprovedOvertimeCoverageToPolicySnapshot(
      {
        policy: {
          id: policy.id,
          code: policy.code,
          name: policy.name,
          timezone: policy.timezone ?? "Asia/Bangkok",
        },
        sessionRules: sessionRules.map((rule) => ({
          id: rule.id,
          sessionCode: rule.sessionCode,
          label: rule.label,
          punchType: rule.punchType,
          openTime: rule.openTime,
          expectedTime: rule.expectedTime,
          closeTime: rule.closeTime,
          sortOrder: rule.sortOrder,
        })),
        holiday,
      },
      overtimeCoverage,
    );
    const holidayCalculation = {
      morningIn,
      afternoonIn,
      checkOut,
      morningLateMinutes: 0,
      afternoonLateMinutes: 0,
      totalLateMinutes: 0,
      isMorningMissing: false,
      isAfternoonMissing: false,
      isCheckoutMissing: false,
      hasMissingLog: false,
      isAbsent: false,
      absentDays: 0,
      earlyCheckoutMinutes: 0,
      lateCheckoutMinutes: 0,
      extraPresenceMinutes: 0,
      latePenaltyAmount: 0,
      missingLogPenaltyAmount: 0,
      earlyCheckoutPenaltyAmount: 0,
      absentDeductionAmount: 0,
      unpaidLeaveDeductionAmount: 0,
      totalDeductionAmount: 0,
      /* วันหยุดไม่มีค่าปรับอยู่แล้ว แต่อุ้มการตัดสินใจไว้เผื่อวันนั้นกลับมาเป็นวันทำงาน */
      missingLogPenaltyWaived: Boolean(
        existingReviewState?.missingLogPenaltyWaived,
      ),
      penaltyWaivedReason: existingReviewState?.penaltyWaivedReason ?? null,
      penaltyWaivedAt: existingReviewState?.penaltyWaivedAt ?? null,
      penaltyWaivedById: existingReviewState?.penaltyWaivedById ?? null,
      penaltyWaivedAmount: 0,
      afternoonPenaltyWaived: Boolean(
        existingReviewState?.afternoonPenaltyWaived,
      ),
      afternoonPenaltyWaivedReason:
        existingReviewState?.afternoonPenaltyWaivedReason ?? null,
      afternoonPenaltyWaivedAmount: 0,
      paidLeaveMinutes: 0,
      unpaidLeaveMinutes: 0,
      offsiteMinutes: 0,
    };
    const reviewState = resolveAttendanceReviewState({
      ...holidayCalculation,
      policySnapshot: basePolicySnapshot,
      pendingLeaveRequestCount: pendingApprovalCounts.leave,
      pendingOvertimeRequestCount: pendingApprovalCounts.overtime,
      pendingTimeAdjustRequestCount: pendingApprovalCounts.timeAdjust,
      pendingOffsiteRequestCount: pendingApprovalCounts.offsite,
      calculationStatus: "HOLIDAY",
      calculationNote: holiday.name ?? "วันหยุด",
    });
    const calculatedReviewStatus = reviewState.hasReviewIssue
      ? AttendanceReviewStatus.NEED_REVIEW
      : AttendanceReviewStatus.CALCULATED;
    const payrollSettings = this.resolvePayrollCalculationSettingsForEmployee(
      employee,
      context,
    );
    const dailyDeductionCap = this.buildEmptyDailyDeductionCap(
      false,
      payrollSettings,
    );
    const unpaidLeaveDeduction = this.buildEmptyUnpaidLeaveDeduction(
      0,
      false,
      payrollSettings,
    );
    const absenceDeduction = this.buildEmptyAbsenceDeduction(
      0,
      false,
      workDate,
      payrollSettings,
    );
    const sourceHash = this.buildAttendanceSourceHash({
      employeeId: employee.id,
      workDate,
      logs,
      approvedLeaves: [],
      offsiteRequests: offsiteRequestsForDay,
      timeAdjustRequests: timeAdjustRequestsForDay,
      overtimeCoverage,
      policy,
      sessionRules,
      holiday,
      dailyDeductionCap,
      unpaidLeaveDeduction,
      absenceDeduction,
      calculation: holidayCalculation,
      pendingApprovalCounts,
      reviewReasonCodes: reviewState.reviewReasons.map((reason) => reason.code),
    });
    const existingAttendanceReview = this.getAttendanceReviewSnapshot(
      existingReviewState?.policySnapshot,
    );
    const previousSourceHash =
      typeof existingAttendanceReview?.sourceHash === "string"
        ? existingAttendanceReview.sourceHash
        : null;
    const preserveStatuses: AttendanceReviewStatus[] = [
      AttendanceReviewStatus.REVIEWED,
      AttendanceReviewStatus.READY_FOR_PAYROLL,
    ];
    const sourceChanged = Boolean(
      existingReviewState &&
        preserveStatuses.includes(existingReviewState.reviewStatus) &&
        (!previousSourceHash || previousSourceHash !== sourceHash),
    );
    const preservedReviewState =
      existingReviewState &&
      preserveStatuses.includes(existingReviewState.reviewStatus) &&
      !sourceChanged
        ? existingReviewState
        : null;
    const invalidation =
      existingReviewState && sourceChanged
        ? {
            invalidatedAt: new Date(),
            invalidatedById: calculatedById,
            oldStatus: existingReviewState.reviewStatus,
            newStatus: calculatedReviewStatus,
            previousSourceHash,
          }
        : null;
    const policySnapshot = this.buildAttendanceReviewPolicySnapshot({
      basePolicySnapshot,
      existingPolicySnapshot: existingReviewState?.policySnapshot,
      reviewState,
      sourceHash,
      invalidation,
    });

    const data = {
      morningInAt: morningIn?.logTime ?? null,
      afternoonInAt: afternoonIn?.logTime ?? null,
      checkOutAt: checkOut?.logTime ?? null,
      morningLateMinutes: 0,
      afternoonLateMinutes: 0,
      totalLateMinutes: 0,
      isMorningMissing: false,
      isAfternoonMissing: false,
      isCheckoutMissing: false,
      hasMissingLog: false,
      isAbsent: false,
      absentDays: 0,
      earlyCheckoutMinutes: 0,
      lateCheckoutMinutes: 0,
      extraPresenceMinutes: 0,
      latePenaltyAmount: 0,
      missingLogPenaltyAmount: 0,
      missingMorningPenaltyAmount: 0,
      missingAfternoonPenaltyAmount: 0,
      missingCheckoutPenaltyAmount: 0,
      earlyCheckoutPenaltyAmount: 0,
      absentDeductionAmount: 0,
      unpaidLeaveDeductionAmount: 0,
      totalDeductionAmount: 0,
      paidLeaveMinutes: 0,
      unpaidLeaveMinutes: 0,
      offsiteMinutes: 0,
      approvedOtMinutes: overtimeCoverage.approvedOtMinutes,
      payableOtMinutes: overtimeCoverage.payableOtMinutes,
      offsiteStatus: null,
      reviewStatus: preservedReviewState
        ? preservedReviewState.reviewStatus
        : calculatedReviewStatus,
      leaveRequestId: null,
      leaveTypeId: null,
      leaveIsPaid: null,
      leaveDayType: null,
      leaveDurationDays: 0,
      policyId: policy.id === "default-attendance-policy" ? null : policy.id,
      policySnapshot,
      calculationStatus: "HOLIDAY",
      calculationNote: holiday.name ?? "วันหยุด",
      calculatedAt: new Date(),
      calculatedById,
      ...(preservedReviewState
        ? {
            reviewedAt: preservedReviewState.reviewedAt,
            reviewedById: preservedReviewState.reviewedById,
            readyForPayrollAt: preservedReviewState.readyForPayrollAt,
            readyForPayrollById: preservedReviewState.readyForPayrollById,
            lockedAt: preservedReviewState.lockedAt,
            lockedById: preservedReviewState.lockedById,
            sentToPayrollAt: preservedReviewState.sentToPayrollAt,
            sentToPayrollById: preservedReviewState.sentToPayrollById,
            payrollPeriodId: preservedReviewState.payrollPeriodId,
            payrollRunId: preservedReviewState.payrollRunId,
          }
        : {
            reviewedAt: null,
            reviewedById: null,
            readyForPayrollAt: null,
            readyForPayrollById: null,
            lockedAt: null,
            lockedById: null,
          }),
    };

    const summary = await prisma.attendanceDailySummary.upsert({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate,
        },
      },
      create: {
        employeeId: employee.id,
        workDate,
        ...data,
      },
      update: data,
      include: this.defaultDailySummaryInclude(),
    });

    if (existingReviewState && sourceChanged) {
      const oldReviewReasons = Array.isArray(
        existingAttendanceReview?.reviewReasons,
      )
        ? existingAttendanceReview.reviewReasons
        : [];
      await this.writeAttendanceReviewInvalidatedAudit({
        summaryId: summary.id,
        employeeId: employee.id,
        workDate,
        actorId: calculatedById,
        oldStatus: existingReviewState.reviewStatus,
        newStatus: calculatedReviewStatus,
        oldSourceHash: previousSourceHash,
        newSourceHash: sourceHash,
        oldReviewReasonCodes: oldReviewReasons
          .map((reason: any) => String(reason?.code ?? ""))
          .filter(Boolean),
        newReviewReasonCodes: [],
        oldTotalDeductionAmount: Number(
          existingReviewState.totalDeductionAmount ?? 0,
        ),
        newTotalDeductionAmount: 0,
      });
    }

    return summary;
  }

  private async getEffectivePolicyForDailySummary(
    employee: DailyCalculationEmployee,
    workDate: Date,
    context: DailyCalculationContext,
  ) {
    // กะที่ผูกรายคนต้องชนะขอบเขตเสมอ จึงเช็คก่อนแตะ cache ของขอบเขต
    const assigned = await this.findAssignedShift(employee.id, workDate, context);
    if (assigned) return assigned;

    const key = [
      employee.companyId,
      employee.branchId ?? "ALL_BRANCHES",
      employee.employeeTypeId ?? "ALL_EMPLOYEE_TYPES",
      this.toDateKey(workDate),
    ].join("|");

    if (context.policiesByScopeDate?.has(key)) {
      return context.policiesByScopeDate.get(key);
    }

    const policy =
      (await this.findEffectivePolicyForScope(
        employee.companyId,
        employee.branchId,
        workDate,
        employee.employeeTypeId,
      )) ??
      this.buildDefaultPolicy(employee.companyId, employee.branchId, workDate);

    context.policiesByScopeDate?.set(key, policy);

    return policy;
  }

  /**
   * กะที่ผูกไว้กับพนักงานคนนี้ ณ วันที่กำหนด — ไม่มีก็คืน null ให้ไปใช้ค่าตามขอบเขตต่อ
   * โหลดรายการของพนักงานครั้งเดียวต่อรอบคำนวณ คนที่ไม่เคยถูกผูกจึงไม่มีต้นทุนเพิ่มรายวัน
   */
  private async findAssignedShift(
    employeeId: string,
    workDate: Date,
    context: DailyCalculationContext,
  ) {
    const cache = context.shiftAssignmentsByEmployeeId;
    let assignments = cache?.get(employeeId);

    if (!assignments) {
      const prisma = this.prisma as any;
      assignments = await prisma.employeeWorkShift.findMany({
        where: {
          employeeId,
          status: "ACTIVE",
          deletedAt: null,
          policy: { status: "ACTIVE", deletedAt: null },
        },
        include: {
          policy: {
            include: {
              sessionRules: {
                where: { deletedAt: null, status: "ACTIVE" },
                orderBy: [{ sortOrder: "asc" }, { openTime: "asc" }],
              },
            },
          },
        },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      });

      cache?.set(employeeId, assignments ?? []);
    }

    // effectiveFrom/To เก็บเป็น @db.Date = เที่ยงคืน UTC เหมือน workDate เทียบตรงได้เลย
    const match = (assignments ?? []).find((item: any) => {
      const from = new Date(item.effectiveFrom);
      const to = item.effectiveTo ? new Date(item.effectiveTo) : null;
      return from <= workDate && (!to || to >= workDate);
    });

    return match?.policy ?? null;
  }

  private async enrichDailySummariesWithAttendanceContext(items: any[]) {
    const overtimeItems = await this.enrichDailySummariesWithApprovedOvertime(items);
    const timeAdjustItems =
      await this.enrichDailySummariesWithTimeAdjustRequests(overtimeItems);
    const pendingItems =
      await this.enrichDailySummariesWithPendingApprovalRequests(timeAdjustItems);
    const channelItems =
      await this.enrichDailySummariesWithPunchChannels(pendingItems);

    return channelItems.map((item) =>
      attachAttendanceReviewState({ ...item }),
    );
  }

  /**
   * บอกว่าแต่ละรอบลงเวลาด้วยอุปกรณ์อะไร — เครื่องสแกนนิ้ว แอปมือถือ หรือ HR แก้มือ
   *
   * สรุปรายวันเก็บแค่ "เวลา" ไม่ได้เก็บช่องทาง ต้องไปดูที่ตัวรอยตอก
   * ยิงคำสั่งเดียวต่อหนึ่งหน้าผลลัพธ์ ไม่ใช่ทีละแถว และเลือกมาเฉพาะ 3 คอลัมน์
   * เพื่อไม่ให้ก้อนตอบกลับบวมเหมือนตอนที่ส่ง policySnapshot เต็ม ๆ ไปทุกแถว
   */
  private async enrichDailySummariesWithPunchChannels(items: any[]) {
    if (!items.length) return items;

    const employeeIds = Array.from(
      new Set(items.map((item) => item.employeeId).filter(Boolean)),
    );
    const dateKeys = items
      .map((item) => this.toDateKey(item.workDate))
      .filter(Boolean)
      .sort();
    if (!employeeIds.length || !dateKeys.length) return items;

    const logs = await (this.prisma as any).attendanceLog.findMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: {
          gte: this.toDateOnly(dateKeys[0]),
          lte: this.toDateOnly(dateKeys[dateKeys.length - 1]),
        },
        deletedAt: null,
        status: { not: AttendanceLogStatus.CANCELLED },
      },
      select: {
        employeeId: true,
        workDate: true,
        logTime: true,
        channel: true,
        source: true,
      },
      orderBy: [{ logTime: "asc" }],
    });

    /* จับคู่ด้วยเวลาที่ตรงกันพอดี เพราะสรุปรายวันเก็บ logTime ของรอยนั้นมาตรง ๆ */
    const byKey = new Map<string, { channel: string; source: string | null }>();
    for (const log of logs) {
      const key = `${log.employeeId}|${new Date(log.logTime).toISOString()}`;
      byKey.set(key, { channel: String(log.channel), source: log.source ?? null });
    }

    const pick = (employeeId: string, at: Date | string | null) => {
      if (!at) return null;
      return byKey.get(`${employeeId}|${new Date(at).toISOString()}`) ?? null;
    };

    return items.map((item) => ({
      ...item,
      punchChannels: {
        morning: pick(item.employeeId, item.morningInAt),
        afternoon: pick(item.employeeId, item.afternoonInAt),
        checkout: pick(item.employeeId, item.checkOutAt),
      },
    }));
  }

  private async enrichDailySummariesWithPendingApprovalRequests(items: any[]) {
    if (!items.length) return items;

    const employeeIds = Array.from(
      new Set(items.map((item) => item.employeeId).filter(Boolean)),
    );
    const dateKeys = Array.from(
      new Set(items.map((item) => this.toDateKey(item.workDate)).filter(Boolean)),
    );
    if (!employeeIds.length || !dateKeys.length) return items;

    const dateFrom = this.toDateOnly(dateKeys.sort()[0]);
    const dateTo = this.toDateOnly(dateKeys.sort()[dateKeys.length - 1]);
    const itemKeys = new Set(
      items.map((item) => this.buildEmployeeDateKey(item.employeeId, item.workDate)),
    );
    const counts = new Map<
      string,
      { leave: number; overtime: number; timeAdjust: number; offsite: number }
    >();
    const increment = (
      employeeId: string,
      workDate: Date,
      kind: "leave" | "overtime" | "timeAdjust" | "offsite",
    ) => {
      const key = this.buildEmployeeDateKey(employeeId, workDate);
      if (!itemKeys.has(key)) return;
      const current = counts.get(key) ?? {
        leave: 0,
        overtime: 0,
        timeAdjust: 0,
        offsite: 0,
      };
      current[kind] += 1;
      counts.set(key, current);
    };

    const prisma = this.prisma as any;
    const [leaves, overtimes, timeAdjusts, offsites] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          deletedAt: null,
          status: "SUBMITTED",
          startDate: { lte: dateTo },
          endDate: { gte: dateFrom },
        },
        select: { employeeId: true, startDate: true, endDate: true },
      }),
      prisma.overtimeRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          deletedAt: null,
          status: "SUBMITTED",
          workDate: { gte: dateFrom, lte: dateTo },
        },
        select: { employeeId: true, workDate: true },
      }),
      prisma.timeAdjustRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          deletedAt: null,
          status: "SUBMITTED",
          requestedLogTime: {
            gte: this.buildBangkokDateTimeBoundary(dateFrom),
            lte: this.buildBangkokDateTimeBoundary(dateTo, true),
          },
        },
        select: { employeeId: true, requestedLogTime: true },
      }),
      prisma.offsiteWorkRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          deletedAt: null,
          status: { in: ["SUBMITTED", "MANAGER_APPROVED"] },
          workDate: { gte: dateFrom, lte: dateTo },
        },
        select: { employeeId: true, workDate: true },
      }),
    ]);

    for (const leave of leaves) {
      const start = new Date(Math.max(this.toDateOnly(leave.startDate).getTime(), dateFrom.getTime()));
      const end = new Date(Math.min(this.toDateOnly(leave.endDate).getTime(), dateTo.getTime()));
      for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        increment(leave.employeeId, cursor, "leave");
      }
    }
    for (const overtime of overtimes) increment(overtime.employeeId, overtime.workDate, "overtime");
    for (const request of timeAdjusts) {
      increment(
        request.employeeId,
        this.getWorkDateFromLogTime(request.requestedLogTime),
        "timeAdjust",
      );
    }
    for (const offsite of offsites) increment(offsite.employeeId, offsite.workDate, "offsite");

    return items.map((item) => {
      const key = this.buildEmployeeDateKey(item.employeeId, item.workDate);
      const pending = counts.get(key) ?? { leave: 0, overtime: 0, timeAdjust: 0, offsite: 0 };
      return {
        ...item,
        pendingLeaveRequestCount: pending.leave,
        pendingOvertimeRequestCount: pending.overtime,
        pendingTimeAdjustRequestCount: Math.max(
          Number(item.pendingTimeAdjustRequestCount ?? 0),
          pending.timeAdjust,
        ),
        pendingOffsiteRequestCount: pending.offsite,
        pendingApprovalRequestCount:
          pending.leave + pending.overtime + pending.timeAdjust + pending.offsite,
      };
    });
  }

  private async enrichDailySummariesWithTimeAdjustRequests(items: any[]) {
    if (!items.length) return items;

    const employeeIds = Array.from(
      new Set(items.map((item) => item.employeeId).filter(Boolean)),
    );
    const workDates = Array.from(
      new Map(
        items
          .filter((item) => item.workDate)
          .map((item) => [this.toDateKey(item.workDate), item.workDate]),
      ).values(),
    );

    if (!employeeIds.length || !workDates.length) return items;

    const dateOnlyValues = workDates.map((value) => this.toDateOnly(value as any));
    const dateFrom = new Date(Math.min(...dateOnlyValues.map((date) => date.getTime())));
    const dateTo = new Date(Math.max(...dateOnlyValues.map((date) => date.getTime())));

    const requests = await (this.prisma as any).timeAdjustRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        deletedAt: null,
        status: { not: "DRAFT" },
        requestedLogTime: {
          gte: this.buildBangkokDateTimeBoundary(dateFrom),
          lte: this.buildBangkokDateTimeBoundary(dateTo, true),
        },
      },
      orderBy: [
        { employeeId: "asc" },
        { requestedLogTime: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        requestNo: true,
        employeeId: true,
        adjustType: true,
        targetLogType: true,
        originalLogTime: true,
        requestedLogTime: true,
        reason: true,
        note: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        rejectedAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
        submittedBy: {
          select: { id: true, displayName: true, email: true },
        },
        approvedBy: {
          select: { id: true, displayName: true, email: true },
        },
        rejectedBy: {
          select: { id: true, displayName: true, email: true },
        },
        originalAttendanceLog: {
          select: {
            id: true,
            logTime: true,
            logType: true,
            session: true,
            status: true,
          },
        },
        appliedAttendanceLog: {
          select: {
            id: true,
            logTime: true,
            logType: true,
            session: true,
            status: true,
          },
        },
        attendanceEditLogs: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            oldLogTime: true,
            newLogTime: true,
            reason: true,
            note: true,
            createdAt: true,
          },
        },
      },
    });

    const requestsByEmployeeDate = new Map<string, any[]>();
    for (const request of requests) {
      const workDate = this.getWorkDateFromLogTime(request.requestedLogTime);
      const key = this.buildEmployeeDateKey(request.employeeId, workDate);
      const current = requestsByEmployeeDate.get(key) ?? [];
      const editLog = Array.isArray(request.attendanceEditLogs)
        ? request.attendanceEditLogs.find((log: any) => log.oldLogTime || log.newLogTime)
        : null;
      current.push({
        ...request,
        workDate: this.toDateKey(workDate),
        originalLogTime:
          request.originalLogTime ??
          editLog?.oldLogTime ??
          request.originalAttendanceLog?.logTime ??
          null,
        appliedLogTime:
          request.appliedAttendanceLog?.logTime ??
          editLog?.newLogTime ??
          request.requestedLogTime ??
          null,
      });
      requestsByEmployeeDate.set(key, current);
    }

    return items.map((item) => {
      const key = this.buildEmployeeDateKey(item.employeeId, item.workDate);
      const timeAdjustRequests = requestsByEmployeeDate.get(key) ?? [];
      const pendingCount = timeAdjustRequests.filter(
        (request) => request.status === "SUBMITTED",
      ).length;
      const approvedCount = timeAdjustRequests.filter(
        (request) => request.status === "APPROVED",
      ).length;
      const rejectedCount = timeAdjustRequests.filter(
        (request) => request.status === "REJECTED",
      ).length;
      const cancelledCount = timeAdjustRequests.filter(
        (request) => request.status === "CANCELLED",
      ).length;

      return {
        ...item,
        timeAdjustRequests,
        timeAdjustRequestCount: timeAdjustRequests.length,
        pendingTimeAdjustRequestCount: pendingCount,
        approvedTimeAdjustRequestCount: approvedCount,
        rejectedTimeAdjustRequestCount: rejectedCount,
        cancelledTimeAdjustRequestCount: cancelledCount,
      };
    });
  }

  private async enrichDailySummariesWithApprovedOvertime(items: any[]) {
    if (!items.length) return items;

    const employeeIds = Array.from(
      new Set(items.map((item) => item.employeeId).filter(Boolean)),
    );
    const workDates = Array.from(
      new Map(
        items
          .filter((item) => item.workDate)
          .map((item) => [this.toDateKey(item.workDate), item.workDate]),
      ).values(),
    );

    if (!employeeIds.length || !workDates.length) return items;

    const dateOnlyValues = workDates.map((value) => this.toDateOnly(value as any));
    const dateFrom = new Date(Math.min(...dateOnlyValues.map((date) => date.getTime())));
    const dateTo = new Date(Math.max(...dateOnlyValues.map((date) => date.getTime())));

    const payrollSettingsFallback = await this.getPayrollCalculationSettings();
    const payrollSettingsByCompanyId = await this.getPayrollCalculationSettingsByCompanyIds(
      items.map((item) => item.employee?.companyId ?? item.employee?.company?.id ?? item.companyId),
    );

    const [requests, compensations, overtimePolicies, employeeScopes] =
      await Promise.all([
      (this.prisma as any).overtimeRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          workDate: { in: workDates },
          status: "APPROVED",
          deletedAt: null,
        },
        orderBy: [
          { employeeId: "asc" },
          { workDate: "asc" },
          { startTime: "asc" },
        ],
        select: {
          id: true,
          requestNo: true,
          employeeId: true,
          workDate: true,
          startTime: true,
          endTime: true,
          totalHours: true,
          workType: true,
          reason: true,
          approvedAt: true,
        },
      }),
      (this.prisma as any).employeeCompensation.findMany({
        where: {
          employeeId: { in: employeeIds },
          deletedAt: null,
          status: "ACTIVE",
          effectiveDate: { lte: dateTo },
          OR: [{ endDate: null }, { endDate: { gte: dateFrom } }],
        },
        orderBy: [
          { employeeId: "asc" },
          { effectiveDate: "desc" },
          { updatedAt: "desc" },
        ],
        select: {
          employeeId: true,
          effectiveDate: true,
          endDate: true,
          baseSalary: true,
          salaryBasis: true,
        },
      }),
      (this.prisma as any).overtimePolicy.findMany({
        where: {
          deletedAt: null,
          status: "ACTIVE",
        },
        orderBy: [{ rateMultiplier: "asc" }, { createdAt: "asc" }],
        select: {
          branchId: true,
          companyId: true,
          employeeTypeId: true,
          workType: true,
          rateMultiplier: true,
          amountRoundingMode: true,
        },
      }),
      /* สาขา/บริษัท/ประเภทของแต่ละคน — ใช้จับคู่นโยบาย OT ให้ตรงกับ payroll */
      (this.prisma as any).employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true,
          branchId: true,
          companyId: true,
          employeeTypeId: true,
        },
      }),
    ]);

    const requestsByEmployeeDate = this.groupOvertimeRequestsByEmployeeDate(requests);
    const compensationsByEmployeeId = this.groupRowsByEmployeeId(compensations);

    const findCompensationForDate = (employeeId: string, workDateValue: unknown) => {
      const workDate = this.toDateOnly(workDateValue as any);
      const rows = compensationsByEmployeeId.get(employeeId) ?? [];

      return rows.find((row: any) => {
        const effectiveDate = this.toDateOnly(row.effectiveDate);
        const endDate = row.endDate ? this.toDateOnly(row.endDate) : null;
        return effectiveDate <= workDate && (!endDate || endDate >= workDate);
      });
    };

    const scopeByEmployeeId = new Map<string, any>(
      employeeScopes.map((row: any) => [row.id, row]),
    );

    /*
     * จับคู่นโยบาย OT ด้วยกติกาเดียวกับที่ payroll ใช้ตอนคิดเงินจริง
     *
     * ของเดิมจับคู่แค่ บริษัท + ประเภทพนักงาน แล้วเก็บ "ตัวแรกที่เจอ" จาก
     * รายการที่เรียงอัตราจากน้อยไปมาก — พอบริษัทตั้งนโยบายรายสาขาเมื่อไร
     * ยอด preview จะกลายเป็นอัตราต่ำสุดของทุกสาขาโดยไม่มีใครรู้
     */
    const policyFor = (item: any, workType: string) => {
      const scope = scopeByEmployeeId.get(item.employeeId);

      return pickOvertimePolicy(overtimePolicies as any[], {
        branchId: scope?.branchId ?? null,
        companyId:
          scope?.companyId ??
          item.employee?.companyId ??
          item.employee?.company?.id ??
          null,
        employeeTypeId: scope?.employeeTypeId ?? null,
        workType,
      });
    };

    /*
     * ไม่มีนโยบายที่ใช้กับคนนี้ = ไม่รู้อัตรา จึงคิดเป็น 0
     *
     * เดิมเดาอัตราขั้นต่ำตามกฎหมาย (1.5/2/3) ให้เงียบ ๆ ซึ่งทำให้ยอด preview
     * ไม่ตรงกับสลิปของบริษัทที่ตั้งอัตราไว้ต่างจากกฎหมาย และไม่มีอะไรบอก HR
     * ว่าตัวเลขนั้นมาจากการเดา ยอด 0 ทำให้เห็นทันทีว่ายังไม่ได้ตั้งนโยบาย
     */
    const policyMultiplier = (item: any, workType: string) => {
      const policy = policyFor(item, workType);

      return policy ? Number(policy.rateMultiplier ?? 0) : 0;
    };

    // ยอด preview ต้องปัดเศษแบบเดียวกับที่ payroll คิดจริง ไม่งั้นตัวเลขจะไม่ตรงกัน
    const policyAmountRounding = (item: any, workType: string) =>
      policyFor(item, workType)?.amountRoundingMode ?? "NONE";

    return items.map((item) => {
      const key = this.buildEmployeeDateKey(item.employeeId, item.workDate);
      const dailyRequests = requestsByEmployeeDate.get(key) ?? [];
      const compensation = findCompensationForDate(item.employeeId, item.workDate);
      const baseSalary = Number(compensation?.baseSalary ?? 0);
      const itemCompanyId = item.employee?.companyId ?? item.employee?.company?.id ?? item.companyId;
      const itemPayrollSettings = itemCompanyId
        ? payrollSettingsByCompanyId.get(itemCompanyId) ?? payrollSettingsFallback
        : payrollSettingsFallback;
      const salaryDivisorDays = itemPayrollSettings.salaryDivisorDays;
      const workingHoursPerDay = itemPayrollSettings.workingHoursPerDay;
      // ต้องรู้ฐานค่าจ้างก่อน ไม่งั้นค่าแรงรายวัน 500 จะถูกหาร 30 กลายเป็น 16.67
      const rates = resolveSalaryRates(
        baseSalary,
        { salaryDivisorDays, workingHoursPerDay },
        compensation?.salaryBasis,
      );
      const dailyRate = this.roundMoney(rates.exactDailyRate);
      const hourlyRate = this.roundMoney(rates.exactHourlyRate);
      const requestsWithAmount = dailyRequests.map((request: any) => {
        const hours = Number(request.totalHours ?? 0);
        const workType = String(request.workType ?? "WORKDAY");
        const multiplier = policyMultiplier(item, workType);
        const rate = this.roundMoney(hourlyRate * multiplier);
        const amount =
          hours > 0
            ? this.roundMoney(
                applyOvertimeAmountRounding(
                  hours * rate,
                  policyAmountRounding(item, workType),
                ),
              )
            : 0;

        return {
          ...request,
          rateMultiplier: multiplier,
          ratePreview: rate,
          amountPreview: amount,
        };
      });
      const overtimeCoverage = this.buildApprovedOvertimeCoverageSnapshot(
        requestsWithAmount,
      );
      const workday = overtimeCoverage.byWorkType?.WORKDAY ?? { hours: 0, amount: 0 };
      const holiday = overtimeCoverage.byWorkType?.HOLIDAY ?? { hours: 0, amount: 0 };
      const specialHoliday = overtimeCoverage.byWorkType?.SPECIAL_HOLIDAY ?? {
        hours: 0,
        amount: 0,
      };

      if (overtimeCoverage.requestCount === 0) {
        return {
          ...item,
          baseSalaryAmount: this.roundMoney(baseSalary),
          salaryDivisorDays,
          workingHoursPerDay,
          dailyRatePreview: dailyRate,
          hourlyRatePreview: hourlyRate,
          approvedOvertimeRequestCount: 0,
          approvedOvertimeHours: 0,
          approvedOvertimeAmountPreview: 0,
          approvedOvertimeWorkdayHours: 0,
          approvedOvertimeWorkdayAmountPreview: 0,
          approvedOvertimeHolidayHours: 0,
          approvedOvertimeHolidayAmountPreview: 0,
          approvedOvertimeSpecialHolidayHours: 0,
          approvedOvertimeSpecialHolidayAmountPreview: 0,
          payrollImpactAmountPreview: this.roundMoney(-Number(item.totalDeductionAmount ?? 0)),
        };
      }

      const approvedOtMinutes = Math.max(
        Number(item.approvedOtMinutes ?? 0),
        overtimeCoverage.approvedOtMinutes,
      );
      const payableOtMinutes = Math.max(
        Number(item.payableOtMinutes ?? 0),
        overtimeCoverage.payableOtMinutes,
      );
      const approvedOvertimeAmountPreview = this.roundMoney(
        overtimeCoverage.amountPreview ?? 0,
      );

      return {
        ...item,
        baseSalaryAmount: this.roundMoney(baseSalary),
        salaryDivisorDays,
        workingHoursPerDay,
        dailyRatePreview: dailyRate,
        hourlyRatePreview: hourlyRate,
        approvedOtMinutes,
        payableOtMinutes,
        approvedOvertimeRequestCount: overtimeCoverage.requestCount,
        approvedOvertimeHours: this.roundNumber(approvedOtMinutes / 60, 2),
        approvedOvertimeAmountPreview,
        approvedOvertimeWorkdayHours: this.roundNumber(workday.hours ?? 0, 2),
        approvedOvertimeWorkdayAmountPreview: this.roundMoney(workday.amount ?? 0),
        approvedOvertimeHolidayHours: this.roundNumber(holiday.hours ?? 0, 2),
        approvedOvertimeHolidayAmountPreview: this.roundMoney(holiday.amount ?? 0),
        approvedOvertimeSpecialHolidayHours: this.roundNumber(specialHoliday.hours ?? 0, 2),
        approvedOvertimeSpecialHolidayAmountPreview: this.roundMoney(specialHoliday.amount ?? 0),
        payrollImpactAmountPreview: this.roundMoney(
          approvedOvertimeAmountPreview - Number(item.totalDeductionAmount ?? 0),
        ),
        policySnapshot: this.addApprovedOvertimeCoverageToPolicySnapshot(
          item.policySnapshot,
          overtimeCoverage,
        ),
      };
    });
  }

  private groupOvertimeRequestsByEmployeeDate(requests: any[]) {
    const groups = new Map<string, any[]>();

    for (const request of requests) {
      const key = this.buildEmployeeDateKey(request.employeeId, request.workDate);
      const current = groups.get(key) ?? [];
      current.push(request);
      groups.set(key, current);
    }

    return groups;
  }

  private async findApprovedOvertimeCoverageForDailySummary(
    employeeId: string,
    workDate: Date,
    context: DailyCalculationContext = {},
  ) {
    const key = this.buildEmployeeDateKey(employeeId, workDate);
    const requests =
      context.overtimeRequestsByEmployeeDate?.get(key) ??
      (await (this.prisma as any).overtimeRequest.findMany({
        where: {
          employeeId,
          workDate,
          status: "APPROVED",
          deletedAt: null,
        },
        orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          requestNo: true,
          employeeId: true,
          workDate: true,
          startTime: true,
          endTime: true,
          totalHours: true,
          workType: true,
          reason: true,
          approvedAt: true,
        },
      }));

    return this.buildApprovedOvertimeCoverageSnapshot(requests);
  }

  private buildApprovedOvertimeCoverageSnapshot(requests: any[]) {
    const rows = requests.filter((request) => {
      const hours = Number(request.totalHours ?? 0);
      return Number.isFinite(hours) && hours > 0;
    });

    let totalMinutes = 0;
    let totalAmount = 0;
    const byWorkType = new Map<
      string,
      { hours: number; minutes: number; count: number; amount: number }
    >();

    for (const request of rows) {
      const hours = Number(request.totalHours ?? 0);
      const minutes = Math.round(hours * 60);
      const amount = this.roundMoney(Number(request.amountPreview ?? 0));
      totalMinutes += minutes;
      totalAmount = this.roundMoney(totalAmount + amount);

      const workType = String(request.workType ?? "WORKDAY");
      const current = byWorkType.get(workType) ?? {
        hours: 0,
        minutes: 0,
        count: 0,
        amount: 0,
      };
      current.hours = this.roundNumber(current.hours + hours, 2);
      current.minutes += minutes;
      current.count += 1;
      current.amount = this.roundMoney(current.amount + amount);
      byWorkType.set(workType, current);
    }

    return {
      approvedOtMinutes: totalMinutes,
      payableOtMinutes: totalMinutes,
      amountPreview: totalAmount,
      requestCount: rows.length,
      requestIds: rows.map((request) => request.id),
      requests: rows.map((request) => ({
        id: request.id,
        requestNo: request.requestNo ?? null,
        workDate: request.workDate ? this.toDateKey(request.workDate) : null,
        startTime: request.startTime ?? null,
        endTime: request.endTime ?? null,
        totalHours: this.roundNumber(Number(request.totalHours ?? 0), 2),
        totalMinutes: Math.round(Number(request.totalHours ?? 0) * 60),
        workType: request.workType ?? "WORKDAY",
        rateMultiplier: request.rateMultiplier ?? null,
        ratePreview: request.ratePreview ?? null,
        amountPreview: this.roundMoney(Number(request.amountPreview ?? 0)),
        reason: request.reason ?? null,
        approvedAt: request.approvedAt ?? null,
      })),
      byWorkType: Object.fromEntries(byWorkType.entries()),
    };
  }

  private addApprovedOvertimeCoverageToPolicySnapshot(
    snapshot: unknown,
    overtimeCoverage: any,
  ) {
    const base =
      snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? { ...(snapshot as Record<string, unknown>) }
        : {};

    return {
      ...base,
      approvedOvertimeCoverage: overtimeCoverage,
    };
  }

  /**
   * คำขอแก้เวลาไม่มีคอลัมน์ workDate ต้องถอดวันจาก requestedLogTime ตามเวลาไทย
   * ถ้าใช้วัน UTC ตรง ๆ คำขอช่วงเช้า (ก่อนเจ็ดโมงเช้าไทย) จะตกไปอยู่วันก่อนหน้า
   */
  private groupTimeAdjustRequestsByEmployeeDate(requests: any[]) {
    const groups = new Map<string, any[]>();

    for (const request of requests) {
      const bangkokDate = new Date(
        new Date(request.requestedLogTime).getTime() + 7 * 60 * 60 * 1000,
      );
      const key = `${request.employeeId}|${bangkokDate.toISOString().slice(0, 10)}`;
      const current = groups.get(key) ?? [];
      current.push(request);
      groups.set(key, current);
    }

    return groups;
  }

  private groupAttendanceLogsByEmployeeDate(logs: any[]) {
    const groups = new Map<string, any[]>();

    for (const log of logs) {
      const key = this.buildEmployeeDateKey(log.employeeId, log.workDate);
      const current = groups.get(key) ?? [];
      current.push(log);
      groups.set(key, current);
    }

    return groups;
  }

  private groupRowsByEmployeeId(rows: any[]) {
    const groups = new Map<string, any[]>();

    for (const row of rows) {
      const current = groups.get(row.employeeId) ?? [];
      current.push(row);
      groups.set(row.employeeId, current);
    }

    return groups;
  }

  private buildEmployeeDateKey(employeeId: string, workDate: Date) {
    return `${employeeId}|${this.toDateKey(workDate)}`;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private pickApprovedLeavesForWorkDate(leaves: any[], workDate: Date) {
    const matched = leaves.filter(
      (leave) => leave.startDate <= workDate && leave.endDate >= workDate,
    );

    if (matched.length === 0) {
      return null;
    }

    return matched.sort((a, b) => {
      const aApproved = new Date(
        a.approvedAt ?? a.updatedAt ?? a.createdAt ?? 0,
      ).getTime();
      const bApproved = new Date(
        b.approvedAt ?? b.updatedAt ?? b.createdAt ?? 0,
      ).getTime();
      return bApproved - aApproved;
    });
  }

  /** ใบลาที่คลุมครบทั้งสามรอบ = ไม่ต้องมาทำงานเลยทั้งวัน */
  private coversWholeDay(leaveCoverage: {
    coversMorning?: boolean;
    coversAfternoon?: boolean;
    coversCheckout?: boolean;
  }) {
    return Boolean(
      leaveCoverage.coversMorning &&
        leaveCoverage.coversAfternoon &&
        leaveCoverage.coversCheckout,
    );
  }

  private pickCompensationForWorkDate(compensations: any[], workDate: Date) {
    return (
      compensations.find(
        (compensation) => compensation.effectiveDate <= workDate,
      ) ?? null
    );
  }


  private async resolveDailyDeductionCapForDailySummary(
    employeeId: string,
    workDate: Date,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
    contextCompensations: any[] = [],
  ): Promise<DailyDeductionCapSnapshot> {
    const contextCompensation = this.pickCompensationForWorkDate(
      contextCompensations,
      workDate,
    );
    const contextBaseSalary = this.toPositiveMoney(
      contextCompensation?.baseSalary,
    );

    if (contextBaseSalary > 0) {
      return this.calculateDailyDeductionCapFromBaseSalary(
        contextBaseSalary,
        settings,
        contextCompensation?.salaryBasis,
      );
    }

    const compensation = await this.findBestCompensationForUnpaidLeave(
      employeeId,
      workDate,
    );

    if (compensation) {
      return this.calculateDailyDeductionCapFromBaseSalary(
        compensation.baseSalary,
        settings,
        (compensation as any).salaryBasis,
      );
    }

    return this.buildEmptyDailyDeductionCap(true, settings);
  }

  private calculateDailyDeductionCapFromBaseSalary(
    baseSalaryValue: unknown,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
    salaryBasis?: unknown,
  ): DailyDeductionCapSnapshot {
    const baseSalary = Number(baseSalaryValue ?? 0);
    const normalizedSettings =
      this.normalizePayrollCalculationSettings(settings);

    if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
      return this.buildEmptyDailyDeductionCap(true, normalizedSettings);
    }

    const salaryDivisorDays = normalizedSettings.salaryDivisorDays;
    const dailyRate = this.roundMoney(
      resolveSalaryRates(baseSalary, normalizedSettings, salaryBasis)
        .exactDailyRate,
    );

    return {
      amount: dailyRate,
      baseSalary: this.roundMoney(baseSalary),
      salaryDivisorDays,
      dailyRate,
      calculationMethod: "BASE_SALARY_CONFIGURED_DAYS",
      missingCompensation: false,
    };
  }

  private buildEmptyDailyDeductionCap(
    missingCompensation = false,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
  ): DailyDeductionCapSnapshot {
    const normalizedSettings =
      this.normalizePayrollCalculationSettings(settings);

    return {
      amount: 0,
      baseSalary: 0,
      salaryDivisorDays: normalizedSettings.salaryDivisorDays,
      dailyRate: 0,
      calculationMethod: "BASE_SALARY_CONFIGURED_DAYS",
      missingCompensation,
    };
  }


  private async resolveAbsenceDeductionForDailySummary(
    employeeId: string,
    workDate: Date,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
    contextCompensations: any[] = [],
  ): Promise<AbsenceDeductionSnapshot> {
    const contextCompensation = this.pickCompensationForWorkDate(
      contextCompensations,
      workDate,
    );
    const contextBaseSalary = this.toPositiveMoney(
      contextCompensation?.baseSalary,
    );

    if (contextBaseSalary > 0) {
      return this.calculateAbsenceDeductionFromBaseSalary(
        contextBaseSalary,
        workDate,
        settings,
        contextCompensation?.salaryBasis,
      );
    }

    const compensation = await this.findBestCompensationForUnpaidLeave(
      employeeId,
      workDate,
    );

    if (compensation) {
      return this.calculateAbsenceDeductionFromBaseSalary(
        compensation.baseSalary,
        workDate,
        settings,
        (compensation as any).salaryBasis,
      );
    }

    return this.buildEmptyAbsenceDeduction(1, true, workDate, settings);
  }

  private calculateAbsenceDeductionFromBaseSalary(
    baseSalaryValue: unknown,
    workDate: Date,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
    salaryBasis?: unknown,
  ): AbsenceDeductionSnapshot {
    const baseSalary = Number(baseSalaryValue ?? 0);
    if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
      return this.buildEmptyAbsenceDeduction(1, true, workDate, settings);
    }

    /*
     * พนักงานรายวัน/รายชั่วโมงได้ค่าจ้างตามวันที่มาทำงานจริง
     * วันที่ขาดงานจึงไม่มีค่าจ้างให้หักซ้ำอีก ถ้าหักจะเสียสองเท่า
     */
    if (!deductsWholeDayAbsence(salaryBasis)) {
      return this.buildEmptyAbsenceDeduction(1, false, workDate, settings);
    }

    const normalizedSettings =
      this.normalizePayrollCalculationSettings(settings);
    const period = this.resolvePayrollPeriodForWorkDate(workDate, settings);

    /*
     * ใช้ตัวหารเดียวกับการหักลาไม่รับค่าจ้าง (salaryDivisorDays ของบริษัท)
     *
     * เดิมหารด้วยจำนวนวันจริงในงวด (28-31) ขณะที่ลาไม่รับค่าจ้างหารด้วยค่าที่ตั้งไว้ (30)
     * ทำให้การขาดงาน 1 วันกับลาไม่รับค่าจ้าง 1 วัน หักเงินไม่เท่ากันทั้งที่เป็น
     * การไม่ได้ทำงาน 1 วันเหมือนกัน เช่น ก.พ. เงินเดือน 30,000
     * ขาดงานหัก 1,071.43 แต่ลาไม่รับค่าจ้างหัก 1,000.00 และกลับด้านในเดือน 31 วัน
     *
     * ยังเก็บ payrollPeriodDays ไว้ในผลลัพธ์เพื่อให้ตรวจย้อนหลังได้ว่างวดนั้นมีกี่วัน
     */
    const salaryDivisorDays = normalizedSettings.salaryDivisorDays;
    const dailyRate = this.roundMoney(baseSalary / salaryDivisorDays);

    return {
      amount: dailyRate,
      baseSalary: this.roundMoney(baseSalary),
      payrollPeriodStartDate: this.toDateKey(period.dateFrom),
      payrollPeriodEndDate: this.toDateKey(period.dateTo),
      payrollPeriodDays: period.dayCount,
      salaryDivisorDays,
      absentDays: 1,
      dailyRate,
      calculationMethod: "BASE_SALARY_CONFIGURED_DAYS",
      missingCompensation: false,
    };
  }

  private buildEmptyAbsenceDeduction(
    absentDays: number,
    missingCompensation = false,
    workDate = new Date(),
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
  ): AbsenceDeductionSnapshot {
    const normalizedSettings =
      this.normalizePayrollCalculationSettings(settings);
    const period = this.resolvePayrollPeriodForWorkDate(workDate, settings);

    return {
      amount: 0,
      baseSalary: 0,
      payrollPeriodStartDate: this.toDateKey(period.dateFrom),
      payrollPeriodEndDate: this.toDateKey(period.dateTo),
      payrollPeriodDays: period.dayCount,
      salaryDivisorDays: normalizedSettings.salaryDivisorDays,
      absentDays,
      dailyRate: 0,
      calculationMethod: "BASE_SALARY_CONFIGURED_DAYS",
      missingCompensation,
    };
  }

  private resolvePayrollPeriodForWorkDate(
    workDate: Date,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
  ) {
    const normalizedSettings = this.normalizePayrollCalculationSettings(settings);
    const startDay = normalizedSettings.payrollPeriodStartDay;
    const cutoffDay = normalizedSettings.payrollCutoffDay;
    const year = workDate.getUTCFullYear();
    const month = workDate.getUTCMonth();
    const day = workDate.getUTCDate();

    let dateFrom: Date;
    let dateTo: Date;

    if (startDay > cutoffDay) {
      dateFrom = day >= startDay
        ? this.createClampedUtcDate(year, month, startDay)
        : this.createClampedUtcDate(year, month - 1, startDay);
      dateTo = day >= startDay
        ? this.createClampedUtcDate(year, month + 1, cutoffDay)
        : this.createClampedUtcDate(year, month, cutoffDay);
    } else if (day < startDay) {
      dateFrom = this.createClampedUtcDate(year, month - 1, startDay);
      dateTo = this.createClampedUtcDate(year, month - 1, cutoffDay);
    } else if (day > cutoffDay) {
      dateFrom = this.createClampedUtcDate(year, month + 1, startDay);
      dateTo = this.createClampedUtcDate(year, month + 1, cutoffDay);
    } else {
      dateFrom = this.createClampedUtcDate(year, month, startDay);
      dateTo = this.createClampedUtcDate(year, month, cutoffDay);
    }

    return {
      dateFrom,
      dateTo,
      dayCount: this.countInclusiveDays(dateFrom, dateTo),
    };
  }

  private createClampedUtcDate(year: number, monthIndex: number, day: number) {
    const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDayOfMonth)));
  }

  private async resolveUnpaidLeaveDeductionForDailySummary(
    employeeId: string,
    workDate: Date,
    unpaidLeaveMinutes: number,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
    contextCompensations: any[] = [],
    unpaidDeductionMultiplier = DEFAULT_UNPAID_DEDUCTION_MULTIPLIER,
  ): Promise<UnpaidLeaveDeductionSnapshot> {
    const normalizedMinutes = Math.max(
      Math.round(Number(unpaidLeaveMinutes ?? 0)),
      0,
    );

    if (normalizedMinutes <= 0) {
      return this.buildEmptyUnpaidLeaveDeduction(
        0,
        false,
        settings,
        unpaidDeductionMultiplier,
      );
    }

    // ใช้ compensation ที่ preload มาก่อนเฉพาะกรณีมี baseSalary จริงเท่านั้น
    // ถ้ามี record ACTIVE แต่ baseSalary = 0 ต้อง fallback ไปค้นหา record อื่น ไม่ใช่ปล่อยยอดหักเป็น 0
    const contextCompensation = this.pickCompensationForWorkDate(
      contextCompensations,
      workDate,
    );
    const contextBaseSalary = this.toPositiveMoney(
      contextCompensation?.baseSalary,
    );

    if (contextBaseSalary > 0) {
      return this.calculateUnpaidLeaveDeductionFromBaseSalary(
        contextBaseSalary,
        normalizedMinutes,
        settings,
        unpaidDeductionMultiplier,
        contextCompensation?.salaryBasis,
      );
    }

    const compensation = await this.findBestCompensationForUnpaidLeave(
      employeeId,
      workDate,
    );

    if (compensation) {
      return this.calculateUnpaidLeaveDeductionFromBaseSalary(
        compensation.baseSalary,
        normalizedMinutes,
        settings,
        unpaidDeductionMultiplier,
        (compensation as any).salaryBasis,
      );
    }

    return this.buildEmptyUnpaidLeaveDeduction(
      normalizedMinutes,
      true,
      settings,
      unpaidDeductionMultiplier,
    );
  }

  /**
   * หา "ค่าปรับ" ของประเภทลาที่ทำให้เกิดเวลาลาไม่รับค่าจ้างในวันนั้น
   *
   * มาจาก LeavePolicy ที่ตรงกับ สาขา x ประเภทพนักงาน มากที่สุด
   * - วันเดียวมีลาไม่รับค่าจ้างหลายใบ -> ใช้ค่าสูงสุด (HR ต้องรีวิวอยู่แล้ว)
   * - หานโยบายไม่เจอ -> คืน 1 เท่า เพื่อไม่ให้ยอดหักหายไปเงียบ ๆ
   */
  private async resolveUnpaidLeaveDeductionMultiplier(
    employee: {
      companyId?: string | null;
      branchId?: string | null;
      employeeTypeId?: string | null;
    },
    approvedLeaves: any[],
  ): Promise<number> {
    const unpaidLeaveTypeIds = Array.from(
      new Set(
        (approvedLeaves ?? [])
          .filter((leave) => leave?.leaveType && !leave.leaveType.isPaid)
          .map((leave) => String(leave.leaveTypeId ?? leave.leaveType?.id))
          .filter(Boolean),
      ),
    );

    if (unpaidLeaveTypeIds.length === 0 || !employee.companyId) {
      return DEFAULT_UNPAID_DEDUCTION_MULTIPLIER;
    }

    const policies = await (this.prisma as any).leavePolicy.findMany({
      where: {
        companyId: employee.companyId,
        leaveTypeId: { in: unpaidLeaveTypeIds },
        deletedAt: null,
        status: "ACTIVE",
        AND: [
          {
            OR: employee.branchId
              ? [{ branchId: employee.branchId }, { branchId: null }]
              : [{ branchId: null }],
          },
          {
            OR: employee.employeeTypeId
              ? [
                  { employeeTypeId: employee.employeeTypeId },
                  { employeeTypeId: null },
                ]
              : [{ employeeTypeId: null }],
          },
        ],
      },
      select: {
        leaveTypeId: true,
        branchId: true,
        employeeTypeId: true,
        unpaidDeductionMultiplier: true,
      },
    });

    if (!policies || policies.length === 0) {
      return DEFAULT_UNPAID_DEDUCTION_MULTIPLIER;
    }

    // เลือกนโยบายที่เจาะจงที่สุดของแต่ละประเภทลา แล้วค่อยเอาค่าสูงสุด
    const bestByLeaveType = new Map<
      string,
      { score: number; multiplier: number }
    >();

    for (const policy of policies) {
      const score =
        (employee.branchId && policy.branchId === employee.branchId ? 2 : 0) +
        (employee.employeeTypeId &&
        policy.employeeTypeId === employee.employeeTypeId
          ? 1
          : 0);
      const current = bestByLeaveType.get(policy.leaveTypeId);

      if (!current || score > current.score) {
        bestByLeaveType.set(policy.leaveTypeId, {
          score,
          multiplier: this.normalizeUnpaidDeductionMultiplier(
            policy.unpaidDeductionMultiplier,
          ),
        });
      }
    }

    const multipliers = Array.from(bestByLeaveType.values()).map(
      (item) => item.multiplier,
    );

    return multipliers.length > 0
      ? Math.max(...multipliers)
      : DEFAULT_UNPAID_DEDUCTION_MULTIPLIER;
  }

  private async findBestCompensationForUnpaidLeave(
    employeeId: string,
    workDate: Date,
  ) {
    const rows = await (this.prisma as any).employeeCompensation.findMany({
      where: {
        employeeId,
        effectiveDate: { lte: workDate },
        deletedAt: null,
        baseSalary: { gt: 0 },
      },
      orderBy: [{ effectiveDate: "desc" }, { updatedAt: "desc" }],
      take: 20,
      select: {
        id: true,
        baseSalary: true,
        salaryBasis: true,
        status: true,
        approvalStatus: true,
        effectiveDate: true,
        updatedAt: true,
      },
    });

    if (!rows.length) return null;

    return [...rows].sort((a, b) => {
      const aActive = String(a.status ?? "") === "ACTIVE" ? 0 : 1;
      const bActive = String(b.status ?? "") === "ACTIVE" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const aApproved = String(a.approvalStatus ?? "") === "APPROVED" ? 0 : 1;
      const bApproved = String(b.approvalStatus ?? "") === "APPROVED" ? 0 : 1;
      if (aApproved !== bApproved) return aApproved - bApproved;

      const aEffective = new Date(a.effectiveDate ?? 0).getTime();
      const bEffective = new Date(b.effectiveDate ?? 0).getTime();
      if (aEffective !== bEffective) return bEffective - aEffective;

      const aUpdated = new Date(a.updatedAt ?? 0).getTime();
      const bUpdated = new Date(b.updatedAt ?? 0).getTime();
      return bUpdated - aUpdated;
    })[0];
  }

  private async findEmployeeByUserId(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: {
          notIn: ["RESIGNED", "TERMINATED", "INACTIVE"],
        },
      },
    });

    if (!employee) {
      throw new BadRequestException(
        "บัญชีผู้ใช้นี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถลงเวลาเองได้",
      );
    }

    return employee;
  }

  private async ensureEmployeeExists(employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
      },
    });

    if (!employee) {
      throw new NotFoundException("ไม่พบข้อมูลพนักงาน");
    }

    return employee;
  }

  private async findLatestLogOfWorkDate(employeeId: string, workDate: Date) {
    return this.prisma.attendanceLog.findFirst({
      where: {
        employeeId,
        workDate,
        deletedAt: null,
        status: {
          not: AttendanceLogStatus.CANCELLED,
        },
      },
      orderBy: {
        logTime: "desc",
      },
    });
  }

  private resolveCheckChannel(dto: CheckAttendanceDto) {
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      return AttendanceChannel.GPS;
    }

    return AttendanceChannel.WEB;
  }

  private getWorkDateFromLogTime(logTime: Date) {
    const { year, month, day } = this.getBangkokDateParts(logTime);

    return new Date(Date.UTC(year, month - 1, day));
  }

  /**
   * วันทำงานที่การตอกบัตรครั้งนี้เป็นของ — รองรับกะข้ามคืน
   *
   * กะ 22:00-02:00 การตอกออกงานตอนตีสองเกิดขึ้น "วันปฏิทินถัดไป" แต่เป็นงาน
   * ของวันทำงานเมื่อวาน ถ้ายึดวันปฏิทินตรง ๆ จะเกิดสองปัญหาพร้อมกัน คือ
   * วันเมื่อวานขึ้นว่าขาดรายการออกงาน และวันนี้มีรายการออกงานลอยมาโดยไม่มีการเข้างาน
   *
   * ต้องรู้กะก่อนถึงจะรู้วันทำงาน แต่ก็ต้องรู้วันทำงานก่อนถึงจะหากะได้
   * จึงหากะจากวันปฏิทินก่อนแล้วค่อยขยับวัน — คลาดเคลื่อนได้เฉพาะวันที่พนักงาน
   * เปลี่ยนกะพอดี ซึ่งยังดีกว่าการคิดผิดทุกวันแบบเดิม
   */
  private async resolveWorkDateForPunch(employee: any, logTime: Date) {
    const calendarDate = this.getWorkDateFromLogTime(logTime);

    const policy = await this.getPunchPolicy(employee, calendarDate);
    const window = resolveShiftWindow(this.getPolicySessionRules(policy));

    if (!window.crossesMidnight) return calendarDate;

    const offset = resolveWorkDateOffset(
      this.getBangkokMinutes(logTime),
      window,
    );

    if (offset === 0) return calendarDate;

    return new Date(calendarDate.getTime() + offset * 24 * 60 * 60 * 1000);
  }

  private toDateOnly(value: string) {
    const date =
      value.length === 10
        ? new Date(`${value}T00:00:00+07:00`)
        : new Date(value);

    return this.getWorkDateFromLogTime(date);
  }

  private getBangkokDateParts(date: Date) {
    const parts = this.bangkokDateFormatter.formatToParts(date);

    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);

    return {
      year,
      month,
      day,
    };
  }

  /**
   * หากะการทำงานของพนักงาน 1 คน ณ วันที่กำหนด
   * ลำดับ: ผูกรายคน -> กะเริ่มต้นของสาขา -> กะเริ่มต้นของบริษัท
   * พนักงานที่ยังไม่ถูกผูกจะได้ผลลัพธ์เท่าเดิมทุกประการ
   */
  private async findShiftForEmployee(employee: any, workDate: Date) {
    const prisma = this.prisma as any;

    const assignment = await prisma.employeeWorkShift.findFirst({
      where: {
        employeeId: employee.id,
        status: "ACTIVE",
        deletedAt: null,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
        policy: {
          status: "ACTIVE",
          deletedAt: null,
        },
      },
      include: {
        policy: {
          include: {
            sessionRules: {
              where: { deletedAt: null, status: "ACTIVE" },
              orderBy: [{ sortOrder: "asc" }, { openTime: "asc" }],
            },
          },
        },
      },
      // ผูกทับกันหลายช่วง ให้ช่วงที่เริ่มทีหลังชนะ
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    });

    if (assignment?.policy) return assignment.policy;

    return this.findEffectivePolicyForScope(
      employee.companyId,
      employee.branchId,
      workDate,
      employee.employeeTypeId,
    );
  }

  private async findEffectivePolicyForScope(
    companyId: string,
    branchId: string | null | undefined,
    effectiveDate: Date,
    employeeTypeId?: string | null,
  ) {
    const prisma = this.prisma as any;
    return prisma.attendancePolicy.findFirst({
      where: {
        companyId,
        status: "ACTIVE",
        deletedAt: null,
        effectiveFrom: { lte: effectiveDate },
        AND: [
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: effectiveDate } },
            ],
          },
          branchId
            ? { OR: [{ branchId }, { branchId: null }] }
            : { branchId: null },
          employeeTypeId
            ? { OR: [{ employeeTypeId }, { employeeTypeId: null }] }
            : { employeeTypeId: null },
        ],
      },
      include: {
        sessionRules: {
          where: { deletedAt: null, status: "ACTIVE" },
          orderBy: [{ sortOrder: "asc" }, { openTime: "asc" }],
        },
      },
      orderBy: [
        { priority: "desc" },
        // ต้องเป็น nulls last: ค่า null = ใช้ทั้งบริษัท ซึ่งกว้างกว่า จึงต้องแพ้ของที่เจาะจงกว่า
        // ถ้าปล่อยตาม default ของ Postgres (nulls first ใน desc) กะรายสาขาจะถูกกะบริษัทบดบังตลอด
        { branchId: { sort: "desc", nulls: "last" } },
        { employeeTypeId: { sort: "desc", nulls: "last" } },
        { effectiveFrom: "desc" },
        { updatedAt: "desc" },
      ],
    });
  }

  private buildDefaultPolicy(
    companyId: string,
    branchId: string | null,
    effectiveDate: Date,
  ) {
    return {
      id: "default-attendance-policy",
      companyId,
      branchId,
      employeeTypeId: null,
      code: "DEFAULT_ATTENDANCE_POLICY",
      name: "นโยบายเวลาเข้าออกงานมาตรฐาน",
      description: "กฎเริ่มต้นของระบบก่อนตั้งค่านโยบายจริง",
      morningCheckInDeadline: "08:00",
      afternoonCheckInDeadline: "13:00",
      checkoutAllowedFrom: "17:00",
      latePenaltyRatePerMinute: 5,
      missingLogPenaltyPerDay: 50,
      priority: 100,
      lateGraceMinutes: 0,
      lateRoundingMinutes: 0,
      maxLatePenaltyPerDay: null,
      maxMissingPenaltyPerDay: null,
      missingPenaltyMode: "PER_SESSION",
      offsiteEnabled: false,
      requireOffsiteApproval: true,
      timezone: "Asia/Bangkok",
      effectiveFrom: effectiveDate,
      effectiveTo: null,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      isDefault: true,
    };
  }

  /**
   * กะที่มีผลกับพนักงานคนนี้ในวันนั้น พร้อมรอบลงเวลาที่เรียงแล้ว
   *
   * เปิดออกมาให้งานเตือนของมือถือ (`AttendanceNudgeService`) ใช้ แทนที่จะให้
   * โมดูลนั้นเขียนตรรกะหากะซ้ำเอง — ผูกกะรายคน/รายสาขา/ค่าเริ่มต้นบริษัท
   * มีลำดับความสำคัญของมันอยู่ ถ้าเขียนสองที่จะเพี้ยนกันทันทีที่แก้ที่เดียว
   */
  async getEffectivePunchSessions(employee: any, workDate: Date) {
    const policy = await this.getPunchPolicy(employee, workDate);

    return { policy, rules: this.getPolicySessionRules(policy) };
  }

  private async getPunchPolicy(employee: any, workDate: Date) {
    const policy = await this.findShiftForEmployee(employee, workDate);

    return (
      policy ??
      this.buildDefaultPolicy(employee.companyId, employee.branchId, workDate)
    );
  }

  private getPolicySessionRules(policy: any) {
    if (Array.isArray(policy?.sessionRules) && policy.sessionRules.length > 0) {
      return [...policy.sessionRules].sort((a, b) => {
        const sortA = Number(a.sortOrder ?? 0);
        const sortB = Number(b.sortOrder ?? 0);
        if (sortA !== sortB) return sortA - sortB;
        return String(a.openTime).localeCompare(String(b.openTime));
      });
    }

    return this.buildDefaultSessionRules(policy);
  }

  private buildDefaultSessionRules(policy: any) {
    return [
      {
        id: "default-morning-in",
        policyId: policy.id,
        sessionCode: "MORNING_IN",
        label: "ลงเวลาเข้า รอบที่ 1",
        punchType: "CHECK_IN",
        openTime: "06:00",
        expectedTime: policy?.morningCheckInDeadline ?? "08:00",
        closeTime: "11:59",
        lateAfterTime: policy?.morningCheckInDeadline ?? "08:00",
        lateGraceMinutes: Number(policy?.lateGraceMinutes ?? 0),
        sortOrder: 1,
      },
      {
        id: "default-afternoon-in",
        policyId: policy.id,
        sessionCode: "AFTERNOON_IN",
        label: "ลงเวลาเข้า รอบที่ 2",
        punchType: "CHECK_IN",
        openTime: "12:00",
        expectedTime: policy?.afternoonCheckInDeadline ?? "13:00",
        closeTime: "16:59",
        lateAfterTime: policy?.afternoonCheckInDeadline ?? "13:00",
        lateGraceMinutes: Number(policy?.lateGraceMinutes ?? 0),
        sortOrder: 2,
      },
      {
        id: "default-check-out",
        policyId: policy.id,
        sessionCode: "CHECK_OUT",
        label: "ออกงาน",
        punchType: "CHECK_OUT",
        openTime: "00:00",
        expectedTime: policy?.checkoutAllowedFrom ?? "17:00",
        closeTime: "23:59",
        earlyBeforeTime: policy?.checkoutAllowedFrom ?? "17:00",
        lateOutAfterTime: policy?.checkoutAllowedFrom ?? "17:00",
        earlyLeavePenaltyPerMinute: this.resolveEarlyLeavePenaltyPerMinute(null, policy),
        collectLateOutMinutes: true,
        sortOrder: 3,
      },
    ];
  }

  private findSessionRuleByCode(policy: any, sessionCode: string) {
    return this.getPolicySessionRules(policy).find(
      (rule) => rule.sessionCode === sessionCode,
    );
  }

  private findSessionRuleByTime(policy: any, punchedAt: Date) {
    const minutes = this.getBangkokMinutes(punchedAt);

    // ช่วงเปิด-ปิดของรอบอาจคร่อมเที่ยงคืน (เช่นรอบออกงาน 23:00-04:00)
    // การเทียบ open <= t <= close ตรง ๆ จะไม่มีทางเป็นจริงและหา rule ไม่เจอเลย
    return this.getPolicySessionRules(policy).find((rule) =>
      isWithinRuleWindow(minutes, rule.openTime, rule.closeTime),
    );
  }

  private resolvePunchRule(
    policy: any,
    rule: any,
    punchedAt: Date,
  ): ResolvedPunchRule {
    const sessionCode = String(rule.sessionCode);
    const session = this.mapSessionCodeToLogSession(sessionCode);
    const logType =
      rule.punchType === "CHECK_OUT"
        ? AttendanceLogType.CHECK_OUT
        : AttendanceLogType.CHECK_IN;
    const status = this.resolvePunchStatusFromRule(rule, punchedAt);
    const minutes = this.getBangkokMinutes(punchedAt);
    const open = this.parseTimeToMinutes(rule.openTime);
    const close = this.parseTimeToMinutes(rule.closeTime);

    return {
      rule,
      sessionCode,
      session,
      logType,
      status,
      lateMinutes: this.resolveLateMinutesFromRule(rule, punchedAt, policy),
      earlyLeaveMinutes: this.resolveEarlyLeaveMinutesFromRule(rule, punchedAt),
      isOutsideSession:
        rule.punchType === "CHECK_OUT" ? minutes > close : minutes < open || minutes > close,
    };
  }

  private mapSessionCodeToLogSession(sessionCode: string) {
    if (sessionCode === "MORNING_IN") return "MORNING";
    if (sessionCode === "AFTERNOON_IN") return "AFTERNOON";
    if (sessionCode === "CHECK_OUT") return "EVENING";
    if (sessionCode === "OFFSITE_IN") return "OFFSITE_IN";
    if (sessionCode === "OFFSITE_OUT") return "OFFSITE_OUT";
    return "CUSTOM";
  }

  private resolvePunchStatusFromRule(rule: any, punchedAt: Date) {
    if (rule.punchType === "CHECK_OUT") {
      return this.resolveEarlyLeaveMinutesFromRule(rule, punchedAt) > 0
        ? AttendanceLogStatus.EARLY_LEAVE
        : AttendanceLogStatus.NORMAL;
    }

    return this.resolveLateMinutesFromRule(rule, punchedAt) > 0
      ? AttendanceLogStatus.LATE
      : AttendanceLogStatus.NORMAL;
  }

  private resolveLateMinutesFromRule(rule: any, punchedAt: Date, policy?: any) {
    if (rule.punchType === "CHECK_OUT") return 0;

    const lateAfter = rule.lateAfterTime ?? rule.expectedTime;
    const lateAfterMinutes = this.parseTimeToMinutes(lateAfter);
    const punchedMinutes = this.getBangkokMinutes(punchedAt);
    const grace = Number(
      rule.lateGraceMinutes ?? policy?.lateGraceMinutes ?? 0,
    );
    const lateMinutes = punchedMinutes - lateAfterMinutes - grace;

    if (lateMinutes <= 0) return 0;

    const rounding = Number(policy?.lateRoundingMinutes ?? 0);
    if (rounding > 0) {
      return Math.ceil(lateMinutes / rounding) * rounding;
    }

    return lateMinutes;
  }

  private resolveEarlyLeaveMinutesFromRule(rule: any, punchedAt: Date) {
    if (rule.punchType !== "CHECK_OUT") return 0;

    const earlyBefore = rule.earlyBeforeTime ?? rule.expectedTime;
    const earlyBeforeMinutes = this.parseTimeToMinutes(earlyBefore);
    const punchedMinutes = this.getBangkokMinutes(punchedAt);
    return Math.max(0, earlyBeforeMinutes - punchedMinutes);
  }

  private resolveEarlyLeavePenaltyPerMinute(rule: any | null, policy?: any) {
    const fromRule = Number(rule?.earlyLeavePenaltyPerMinute ?? 0);
    if (Number.isFinite(fromRule) && fromRule > 0) return fromRule;

    const fromPolicy = Number(policy?.latePenaltyRatePerMinute ?? 0);
    if (Number.isFinite(fromPolicy) && fromPolicy > 0) return fromPolicy;

    return DEFAULT_EARLY_CHECKOUT_PENALTY_PER_MINUTE;
  }

  private buildPunchNote(
    note: string | undefined,
    rule: any,
    resolved: ResolvedPunchRule,
  ) {
    const parts = [note?.trim()].filter(Boolean) as string[];
    parts.push(`sessionRule=${rule.sessionCode}`);

    if (resolved.lateMinutes > 0) {
      parts.push(`lateMinutes=${resolved.lateMinutes}`);
    }

    if (resolved.earlyLeaveMinutes > 0) {
      parts.push(`earlyLeaveMinutes=${resolved.earlyLeaveMinutes}`);
    }

    return parts.join(" | ") || undefined;
  }

  private resolvePunchChannel(
    source: string | undefined,
    dto: PunchAttendanceDto,
  ) {
    if (source === "MOBILE_APP") return AttendanceChannel.MOBILE;
    if (source === "SCANNER") return AttendanceChannel.DEVICE;
    if (dto.latitude !== undefined && dto.longitude !== undefined)
      return AttendanceChannel.GPS;
    return AttendanceChannel.WEB;
  }

  private mapChannelToPunchSource(channel: AttendanceChannel) {
    if (channel === AttendanceChannel.MOBILE) return "MOBILE_APP";
    if (
      channel === AttendanceChannel.DEVICE ||
      channel === AttendanceChannel.IMPORT
    )
      return "SCANNER";
    return "WEB";
  }

  private parseTimeToMinutes(value: string) {
    const [hour = "0", minute = "0"] = value.split(":");
    return Number(hour) * 60 + Number(minute);
  }

  /**
   * เวลาแบบ HH:mm ตามเวลาไทย — ใช้เขียนข้อความอธิบายให้คนอ่าน
   *
   * ต้องระบุโซนเวลาเสมอ ห้ามพึ่งนาฬิกาของเครื่องที่รันเซิร์ฟเวอร์
   * เพราะข้อความนี้ไปโผล่ในหน้าตรวจของ HR ถ้าเลื่อนไปเจ็ดชั่วโมงจะไล่ปัญหาผิดทาง
   */
  private formatBangkokTime(date: Date) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  private getBangkokMinutes(date: Date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(
      parts.find((part) => part.type === "minute")?.value ?? 0,
    );

    return hour * 60 + minute;
  }

  private countDaysInclusive(dateFrom: Date, dateTo: Date) {
    return Math.floor((dateTo.getTime() - dateFrom.getTime()) / 86_400_000) + 1;
  }

  private enumerateDateOnlyRange(dateFrom: Date, dateTo: Date) {
    const dates: Date[] = [];
    const current = new Date(dateFrom);

    while (current <= dateTo) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private calculateLateMinutes(
    logTime: Date,
    workDate: Date,
    deadline: string,
  ) {
    const deadlineDate = this.buildBangkokDateTime(workDate, deadline);
    const diffMs = logTime.getTime() - deadlineDate.getTime();

    if (diffMs <= 0) {
      return 0;
    }

    return Math.ceil(diffMs / 60_000);
  }

  private buildBangkokDateTime(workDate: Date, time: string) {
    const [hour = "0", minute = "0"] = time.split(":");
    const year = workDate.getUTCFullYear();
    const month = workDate.getUTCMonth();
    const day = workDate.getUTCDate();

    // Asia/Bangkok = UTC+7. Convert local HH:mm to UTC Date.
    return new Date(
      Date.UTC(year, month, day, Number(hour) - 7, Number(minute), 0, 0),
    );
  }

  private findMorningInLog(logs: any[]) {
    const checkIns = logs.filter(
      (log) => log.logType === AttendanceLogType.CHECK_IN,
    );

    const sessionLog = checkIns.find((log) => log.session === "MORNING");

    if (sessionLog) return sessionLog;

    // Legacy logs ที่ยังไม่มี session: ให้ถือว่าเป็นเข้าเช้าเฉพาะรายการก่อนเที่ยง
    // เพื่อไม่ให้ check-in บ่าย 13:00 ถูกจับผิดเป็นเข้าเช้าแล้วทำให้ missing บ่ายเพี้ยน
    return (
      checkIns.find(
        (log) => !log.session && this.getBangkokMinutes(log.logTime) < 12 * 60,
      ) ?? null
    );
  }

  private findAfternoonInLog(logs: any[], morningLogId?: string) {
    const checkIns = logs.filter(
      (log) =>
        log.logType === AttendanceLogType.CHECK_IN && log.id !== morningLogId,
    );

    const sessionLog = checkIns.find((log) => log.session === "AFTERNOON");

    if (sessionLog) return sessionLog;

    return (
      checkIns.find(
        (log) => !log.session && this.getBangkokMinutes(log.logTime) >= 12 * 60,
      ) ?? null
    );
  }

  private findCheckOutLog(logs: any[]) {
    const checkoutLogs = logs.filter(
      (log) =>
        log.logType === AttendanceLogType.CHECK_OUT ||
        log.session === "EVENING",
    );

    return checkoutLogs.at(-1) ?? null;
  }

  /**
   * แปลงนาทีทำงานต่อวันจากค่าตั้งของบริษัท
   * ใช้เป็นเพดานเวลาลาต่อวัน และตัวหารตอนแปลงนาทีลาเป็นจำนวนวัน
   */
  private resolveWorkingMinutesPerDay(settings?: {
    workingHoursPerDay?: number | null;
  }): number {
    const hours = Number(settings?.workingHoursPerDay ?? 0);

    if (!Number.isFinite(hours) || hours <= 0) {
      return DEFAULT_WORKING_MINUTES_PER_DAY;
    }

    return Math.round(hours * 60);
  }

  private resolveLeaveCoverage(
    leaves?: any[] | null,
    workDate?: Date,
    policy?: any,
    sessionRules: any[] = [],
    workingMinutesPerDay: number = DEFAULT_WORKING_MINUTES_PER_DAY,
  ): LeaveCoverage {
    const empty = this.emptyLeaveCoverage();

    if (!leaves || leaves.length === 0 || !workDate) {
      return empty;
    }

    const coveredSessions = new Set<"MORNING" | "AFTERNOON" | "CHECKOUT">();
    const leaveRequestIds: string[] = [];
    const leaveTypeIds: string[] = [];
    const coverageReasons: string[] = [];
    let durationDays = 0;
    let paidLeaveMinutes = 0;
    let unpaidLeaveMinutes = 0;
    let unpaidDurationDays = 0;

    for (const leave of leaves) {
      const single = this.resolveSingleLeaveCoverage(
        leave,
        workDate,
        policy,
        sessionRules,
        workingMinutesPerDay,
      );

      if (!single) continue;

      if (single.coversMorning) coveredSessions.add("MORNING");
      if (single.coversAfternoon) coveredSessions.add("AFTERNOON");
      if (single.coversCheckout) coveredSessions.add("CHECKOUT");

      durationDays += single.durationDays;
      paidLeaveMinutes += single.paidLeaveMinutes;
      unpaidLeaveMinutes += single.unpaidLeaveMinutes;
      unpaidDurationDays += single.unpaidDurationDays;

      if (leave.id) leaveRequestIds.push(leave.id);
      if (leave.leaveTypeId) leaveTypeIds.push(leave.leaveTypeId);
      if (single.coverageReason) coverageReasons.push(single.coverageReason);
    }

    if (
      coveredSessions.size === 0 &&
      durationDays <= 0 &&
      paidLeaveMinutes <= 0 &&
      unpaidLeaveMinutes <= 0
    ) {
      return empty;
    }

    return {
      coversMorning: coveredSessions.has("MORNING"),
      coversAfternoon: coveredSessions.has("AFTERNOON"),
      coversCheckout: coveredSessions.has("CHECKOUT"),
      durationDays: this.roundLeaveDays(Math.min(durationDays, 1)),
      isUnpaid: unpaidLeaveMinutes > 0 && paidLeaveMinutes <= 0,
      paidLeaveMinutes: Math.min(
        Math.round(paidLeaveMinutes),
        workingMinutesPerDay,
      ),
      unpaidLeaveMinutes: Math.min(
        Math.round(unpaidLeaveMinutes),
        workingMinutesPerDay,
      ),
      unpaidDurationDays: this.roundLeaveDays(Math.min(unpaidDurationDays, 1)),
      coveredSessions: Array.from(coveredSessions),
      leaveRequestIds: Array.from(new Set(leaveRequestIds)),
      leaveTypeIds: Array.from(new Set(leaveTypeIds)),
      coverageReason: Array.from(new Set(coverageReasons)).join(", ") || null,
    };
  }

  private emptyLeaveCoverage(): LeaveCoverage {
    return {
      coversMorning: false,
      coversAfternoon: false,
      coversCheckout: false,
      durationDays: 0,
      isUnpaid: false,
      paidLeaveMinutes: 0,
      unpaidLeaveMinutes: 0,
      unpaidDurationDays: 0,
      coveredSessions: [],
      leaveRequestIds: [],
      leaveTypeIds: [],
      coverageReason: null,
    };
  }

  private resolveSingleLeaveCoverage(
    leave: any,
    workDate: Date,
    policy?: any,
    sessionRules: any[] = [],
    workingMinutesPerDay: number = DEFAULT_WORKING_MINUTES_PER_DAY,
  ) {
    const isPaid = Boolean(leave.leaveType?.isPaid);
    const dayType = leave.dayType;
    const totalDays = Number(leave.totalDays ?? 0);

    const hourlyWindow = this.resolveHourlyLeaveWindow(
      leave,
      workDate,
      policy,
      sessionRules,
      workingMinutesPerDay,
    );

    let base: {
      coversMorning: boolean;
      coversAfternoon: boolean;
      coversCheckout: boolean;
      durationDays: number;
      leaveMinutes: number;
      coverageReason: string;
    } | null = null;

    if (dayType === "HOURLY") {
      if (!hourlyWindow) {
        // ถ้าใบลารายชั่วโมงไม่มี startTime/endTime ที่ถูกต้อง ห้าม fallback เป็นเต็มวันเด็ดขาด
        // ไม่เช่นนั้น HR Review จะขึ้นว่าลาครอบคลุมทั้งวันและยอดหักจะผิด
        return null;
      }
      base = hourlyWindow;
    } else if (dayType === "HALF_DAY_MORNING") {
      base = {
        coversMorning: true,
        coversAfternoon: false,
        coversCheckout: false,
        durationDays: 0.5,
        leaveMinutes: Math.round(workingMinutesPerDay / 2),
        coverageReason: "HALF_DAY_MORNING",
      };
    } else if (dayType === "HALF_DAY_AFTERNOON") {
      base = {
        coversMorning: false,
        coversAfternoon: true,
        coversCheckout: true,
        durationDays: 0.5,
        leaveMinutes: Math.round(workingMinutesPerDay / 2),
        coverageReason: "HALF_DAY_AFTERNOON",
      };
    } else {
      const durationDays = this.resolveFullDayDurationForWorkDate(
        leave,
        workDate,
        totalDays,
      );
      base = {
        coversMorning: true,
        coversAfternoon: true,
        coversCheckout: true,
        durationDays,
        leaveMinutes: this.estimateLeaveMinutesFromDays(
          durationDays,
          workingMinutesPerDay,
        ),
        coverageReason: "FULL_DAY",
      };
    }

    if (!base) return null;

    const durationDays = this.roundLeaveDays(
      Math.min(Math.max(base.durationDays, 0), 1),
    );
    const leaveMinutes = Math.min(
      Math.max(Math.round(base.leaveMinutes), 0),
      workingMinutesPerDay,
    );

    return {
      ...base,
      durationDays,
      leaveMinutes,
      paidLeaveMinutes: isPaid ? leaveMinutes : 0,
      unpaidLeaveMinutes: isPaid ? 0 : leaveMinutes,
      unpaidDurationDays: isPaid
        ? 0
        : this.roundLeaveDays(leaveMinutes / workingMinutesPerDay),
      coverageReason: `${leave.leaveType?.code ?? leave.leaveType?.nameTh ?? "LEAVE"}:${base.coverageReason}`,
    };
  }

  private resolveFullDayDurationForWorkDate(
    leave: any,
    workDate: Date,
    totalDays: number,
  ) {
    if (!Number.isFinite(totalDays) || totalDays <= 0) {
      return 1;
    }

    if (totalDays <= 1) {
      return totalDays;
    }

    const startDate =
      leave.startDate instanceof Date
        ? leave.startDate
        : new Date(leave.startDate);
    const endDate =
      leave.endDate instanceof Date ? leave.endDate : new Date(leave.endDate);
    const dayCount = this.countDaysInclusive(
      this.getWorkDateFromLogTime(startDate),
      this.getWorkDateFromLogTime(endDate),
    );

    if (dayCount <= 1) {
      return Math.min(totalDays, 1);
    }

    // กรณีใบลาหลายวัน ให้คิดผลกระทบรายวันไม่เกิน 1 วันต่อ daily summary
    return Math.min(this.roundLeaveDays(totalDays / dayCount), 1);
  }

  private resolveHourlyLeaveWindow(
    leave: any,
    workDate: Date,
    policy?: any,
    sessionRules: any[] = [],
    workingMinutesPerDay: number = DEFAULT_WORKING_MINUTES_PER_DAY,
  ) {
    const startTime =
      leave.startTime ??
      leave.leaveStartTime ??
      leave.startAt ??
      leave.leaveStartAt ??
      null;
    const endTime =
      leave.endTime ??
      leave.leaveEndTime ??
      leave.endAt ??
      leave.leaveEndAt ??
      null;

    if (!startTime || !endTime) {
      return null;
    }

    const startMinutes = this.resolveLeaveTimeToBangkokMinutes(
      startTime,
      workDate,
    );
    const endMinutes = this.resolveLeaveTimeToBangkokMinutes(endTime, workDate);

    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      return null;
    }

    const morningCheckpoint = this.getSessionCheckpointMinutes(
      sessionRules,
      "MORNING_IN",
      policy?.morningCheckInDeadline ?? "08:00",
    );
    const afternoonCheckpoint = this.getSessionCheckpointMinutes(
      sessionRules,
      "AFTERNOON_IN",
      policy?.afternoonCheckInDeadline ?? "13:00",
    );
    const checkoutCheckpoint = this.getSessionCheckpointMinutes(
      sessionRules,
      "CHECK_OUT",
      policy?.checkoutAllowedFrom ?? "17:00",
    );

    const coversMinute = (minute: number) =>
      Number.isFinite(minute) && startMinutes <= minute && endMinutes >= minute;
    const requestWindowMinutes = endMinutes - startMinutes;
    const workingSegments = this.resolveHourlyLeaveWorkingSegments(
      sessionRules,
      policy,
    );
    const leaveMinutes = this.calculateOverlapMinutes(
      startMinutes,
      endMinutes,
      workingSegments,
    );

    if (leaveMinutes <= 0) {
      return null;
    }

    const durationDays = leaveMinutes / workingMinutesPerDay;

    return {
      coversMorning: coversMinute(morningCheckpoint),
      coversAfternoon: coversMinute(afternoonCheckpoint),
      coversCheckout: coversMinute(checkoutCheckpoint),
      durationDays: this.roundLeaveDays(durationDays),
      leaveMinutes,
      /*
       * นาทีสิ้นสุดของใบลา (เวลาไทย) — ต้องส่งออกไปด้วย ไม่ใช่ใช้แค่ในนี้
       *
       * ใบลารายชั่วโมงที่คลุมเวลาเช็คอินของรอบไหน จะทำให้รอบนั้นไม่ถูกบังคับทั้งรอบ
       * ถ้าพนักงานกลับเข้ามาช้ากว่าเวลาที่ลาไว้ นาทีส่วนเกินจะไม่ถูกคิดอะไรเลย
       * เช่น ลา 08:00-08:30 แต่เข้างาน 08:34 — 4 นาทีนั้นหายไปจากทุกยอด
       * ผู้เรียกใช้ค่านี้เทียบกับเวลาเข้างานจริงเพื่อคิดนาทีที่ยังไม่มีอะไรรองรับ
       */
      endMinutes,
      coverageReason: `HOURLY_${this.minutesToTime(startMinutes)}_${this.minutesToTime(endMinutes)}_WORKING_${leaveMinutes}_OF_${requestWindowMinutes}`,
    };
  }

  private resolveHourlyLeaveWorkingSegments(
    sessionRules: any[] = [],
    policy?: any,
  ) {
    const morningRule = sessionRules.find(
      (item) => item.sessionCode === "MORNING_IN",
    );
    const afternoonRule = sessionRules.find(
      (item) => item.sessionCode === "AFTERNOON_IN",
    );
    const checkoutRule = sessionRules.find(
      (item) => item.sessionCode === "CHECK_OUT",
    );

    const morningStart = this.getSessionCheckpointMinutes(
      sessionRules,
      "MORNING_IN",
      policy?.morningCheckInDeadline ?? "08:00",
    );
    const morningEnd = this.parseTimeToMinutes(
      afternoonRule?.openTime ?? morningRule?.closeTime ?? "12:00",
    );
    const afternoonStart = this.getSessionCheckpointMinutes(
      sessionRules,
      "AFTERNOON_IN",
      policy?.afternoonCheckInDeadline ?? "13:00",
    );
    const afternoonEnd = this.getSessionCheckpointMinutes(
      sessionRules,
      "CHECK_OUT",
      policy?.checkoutAllowedFrom ?? checkoutRule?.expectedTime ?? "17:00",
    );

    const segments = [
      { start: morningStart, end: morningEnd },
      { start: afternoonStart, end: afternoonEnd },
    ].filter(
      (segment) =>
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end > segment.start,
    );

    return segments.length > 0
      ? segments
      : [
          { start: 8 * 60, end: 12 * 60 },
          { start: 13 * 60, end: 17 * 60 },
        ];
  }

  /**
   * นาทีที่ใบลาหมดแล้วแต่ยังไม่กลับเข้างาน แยกตามรอบ
   *
   * คิดเฉพาะใบลารายชั่วโมงที่ "คลุมเวลาเช็คอินของรอบ" เพราะเฉพาะกรณีนี้ที่รอบนั้น
   * ถูกปลดออกจากการคิดสายทั้งรอบ ใบลาที่ไม่คลุมเวลาเช็คอินไม่ต้องมาทางนี้
   * เพราะเครื่องคำนวณหักกลบแล้วคิดส่วนเกินเป็นสายให้อยู่แล้ว
   * ส่วนใบลาครึ่งวัน/เต็มวันก็ไม่เข้าเงื่อนไข เพราะปลดทั้งรอบตามเจตนา
   *
   * นับเฉพาะนาทีที่ตกอยู่ในช่วงเวลาทำงานจริง จะได้ไม่ไปนับพักเที่ยงเป็นเวลาสาย
   * เช่น ลา 08:00-12:00 แล้วเข้างานบ่าย 13:00 ต้องได้ 0 ไม่ใช่ 60
   */
  private resolveUncoveredAfterLeaveMinutes(params: {
    logs: any[];
    leaveCoverage: any;
    policy?: any;
    sessionRules?: any[];
    isAbsent: boolean;
  }): { morning: number; afternoon: number } {
    const empty = { morning: 0, afternoon: 0 };

    // ขาดงานทั้งวันมียอดหักของตัวเองอยู่แล้ว ไม่ต้องซ้อนอีกชั้น
    if (params.isAbsent) return empty;

    const coverage = params.leaveCoverage;
    const leaveEndMinutes = Number(coverage?.endMinutes);
    if (!Number.isFinite(leaveEndMinutes)) return empty;

    const segments = this.resolveHourlyLeaveWorkingSegments(
      params.sessionRules ?? [],
      params.policy,
    );

    const firstCheckInMinutes = (session: "MORNING" | "AFTERNOON") => {
      const times = params.logs
        .filter((log) => log?.logType === "CHECK_IN")
        .map((log) => this.getBangkokMinutes(log.logTime))
        .filter((minute) => Number.isFinite(minute));

      // รอบเช้า/บ่ายแยกกันที่เที่ยง เหมือนที่ระบบใช้แยกรอบอยู่แล้ว
      const inSession =
        session === "MORNING"
          ? times.filter((minute) => minute < 12 * 60)
          : times.filter((minute) => minute >= 12 * 60);

      return inSession.length ? Math.min(...inSession) : null;
    };

    const minutesFor = (session: "MORNING" | "AFTERNOON", covered: boolean) => {
      if (!covered) return 0;

      const checkInMinutes = firstCheckInMinutes(session);
      if (checkInMinutes === null || checkInMinutes <= leaveEndMinutes) return 0;

      return this.calculateOverlapMinutes(
        leaveEndMinutes,
        checkInMinutes,
        segments,
      );
    };

    return {
      morning: minutesFor("MORNING", Boolean(coverage?.coversMorning)),
      afternoon: minutesFor("AFTERNOON", Boolean(coverage?.coversAfternoon)),
    };
  }

  private calculateOverlapMinutes(
    startMinutes: number,
    endMinutes: number,
    segments: Array<{ start: number; end: number }>,
  ) {
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes))
      return 0;
    if (endMinutes <= startMinutes) return 0;

    return segments.reduce((total, segment) => {
      const overlapStart = Math.max(startMinutes, segment.start);
      const overlapEnd = Math.min(endMinutes, segment.end);

      return total + Math.max(overlapEnd - overlapStart, 0);
    }, 0);
  }

  private getSessionCheckpointMinutes(
    sessionRules: any[],
    sessionCode: string,
    fallbackTime: string,
  ) {
    const rule = sessionRules.find((item) => item.sessionCode === sessionCode);
    const time =
      rule?.lateAfterTime ??
      rule?.earlyBeforeTime ??
      rule?.expectedTime ??
      fallbackTime;

    return this.parseTimeToMinutes(time);
  }

  private estimateLeaveMinutesFromDays(
    durationDays: number,
    workingMinutesPerDay: number = DEFAULT_WORKING_MINUTES_PER_DAY,
  ) {
    if (!Number.isFinite(durationDays) || durationDays <= 0) return 0;
    return Math.round(durationDays * workingMinutesPerDay);
  }

  private resolveLeaveTimeToBangkokMinutes(value: unknown, workDate: Date) {
    if (typeof value === "string") {
      if (/^\d{2}:\d{2}/.test(value)) {
        return this.parseTimeToMinutes(value.slice(0, 5));
      }

      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return this.isSameBangkokDate(parsed, workDate)
          ? this.getBangkokMinutes(parsed)
          : null;
      }
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return this.isSameBangkokDate(value, workDate)
        ? this.getBangkokMinutes(value)
        : null;
    }

    return null;
  }

  private isSameBangkokDate(date: Date, workDate: Date) {
    const dateParts = this.getBangkokDateParts(date);
    const workParts = this.getBangkokDateParts(workDate);

    return (
      dateParts.year === workParts.year &&
      dateParts.month === workParts.month &&
      dateParts.day === workParts.day
    );
  }

  private minutesToTime(totalMinutes: number) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  private roundLeaveDays(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return Math.round(value * 100) / 100;
  }

  private async findPendingApprovalCountsForDailySummary(
    employeeId: string,
    workDate: Date,
    known: { timeAdjust?: number; offsite?: number } = {},
    context: DailyCalculationContext = {},
  ) {
    const prisma = this.prisma as any;

    /*
     * ตอนคำนวณทั้งงวดจะมีข้อมูลครบอยู่ใน context แล้ว นับจากหน่วยความจำได้เลย
     * ไม่ต้องยิงอีกสี่คำสั่งต่อวัน — เหลือ fallback ไว้ให้การคำนวณรายวันเดี่ยว ๆ
     */
    if (context.pendingLeavesByEmployeeId && context.pendingOvertimeByEmployeeDate) {
      const key = this.buildEmployeeDateKey(employeeId, workDate);

      const leaveCount = (
        context.pendingLeavesByEmployeeId.get(employeeId) ?? []
      ).filter(
        (leave) => leave.startDate <= workDate && leave.endDate >= workDate,
      ).length;

      const timeAdjustCount =
        known.timeAdjust ??
        (context.timeAdjustRequestsByEmployeeDate?.get(key) ?? []).filter(
          (request) => request.status === "SUBMITTED",
        ).length;

      const offsiteCount =
        known.offsite ??
        (context.offsiteRequestsByEmployeeDate?.get(key) ?? []).filter(
          (request) =>
            request.status === "SUBMITTED" ||
            request.status === "MANAGER_APPROVED",
        ).length;

      return {
        leave: leaveCount,
        overtime: (context.pendingOvertimeByEmployeeDate.get(key) ?? []).length,
        timeAdjust: timeAdjustCount,
        offsite: offsiteCount,
      };
    }

    const [leave, overtime, timeAdjust, offsite] = await Promise.all([
      prisma.leaveRequest.count({
        where: {
          employeeId,
          deletedAt: null,
          status: "SUBMITTED",
          startDate: { lte: workDate },
          endDate: { gte: workDate },
        },
      }),
      prisma.overtimeRequest.count({
        where: {
          employeeId,
          deletedAt: null,
          status: "SUBMITTED",
          workDate,
        },
      }),
      known.timeAdjust === undefined
        ? prisma.timeAdjustRequest.count({
            where: {
              employeeId,
              deletedAt: null,
              status: "SUBMITTED",
              requestedLogTime: {
                gte: this.buildBangkokDateTimeBoundary(workDate),
                lte: this.buildBangkokDateTimeBoundary(workDate, true),
              },
            },
          })
        : Promise.resolve(known.timeAdjust),
      known.offsite === undefined
        ? prisma.offsiteWorkRequest.count({
            where: {
              employeeId,
              deletedAt: null,
              status: { in: ["SUBMITTED", "MANAGER_APPROVED"] },
              workDate,
            },
          })
        : Promise.resolve(known.offsite),
    ]);

    return {
      leave: Number(leave ?? 0),
      overtime: Number(overtime ?? 0),
      timeAdjust: Number(timeAdjust ?? 0),
      offsite: Number(offsite ?? 0),
    };
  }

  private async findTimeAdjustRequestsForDailySummary(
    employeeId: string,
    workDate: Date,
    context: DailyCalculationContext = {},
  ) {
    if (context.timeAdjustRequestsByEmployeeDate) {
      return (
        context.timeAdjustRequestsByEmployeeDate.get(
          this.buildEmployeeDateKey(employeeId, workDate),
        ) ?? []
      );
    }

    return (this.prisma as any).timeAdjustRequest.findMany({
      where: {
        employeeId,
        deletedAt: null,
        status: { not: "DRAFT" },
        requestedLogTime: {
          gte: this.buildBangkokDateTimeBoundary(workDate),
          lte: this.buildBangkokDateTimeBoundary(workDate, true),
        },
      },
      orderBy: [{ requestedLogTime: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        requestNo: true,
        adjustType: true,
        targetLogType: true,
        originalAttendanceLogId: true,
        appliedAttendanceLogId: true,
        originalLogTime: true,
        requestedLogTime: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        rejectedAt: true,
        cancelledAt: true,
        updatedAt: true,
      },
    });
  }

  private async findOffsiteRequestsForDailySummary(
    employeeId: string,
    workDate: Date,
    context: DailyCalculationContext = {},
  ) {
    if (context.offsiteRequestsByEmployeeDate) {
      return (
        context.offsiteRequestsByEmployeeDate.get(
          this.buildEmployeeDateKey(employeeId, workDate),
        ) ?? []
      );
    }

    const prisma = this.prisma as any;
    return prisma.offsiteWorkRequest.findMany({
      where: {
        employeeId,
        workDate,
        deletedAt: null,
        status: { not: "CANCELLED" },
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  private resolveOffsiteRequestCoverage(
    requests: any[],
    sessionRules: any[] = [],
  ) {
    const activeRequests = requests.filter(
      (request) => request?.status && request.status !== "CANCELLED",
    );

    if (activeRequests.length === 0) {
      return {
        coversMorning: false,
        coversAfternoon: false,
        coversCheckout: false,
        coveredSessions: [] as Array<"MORNING" | "AFTERNOON" | "CHECKOUT">,
        status: null as string | null,
        minutes: 0,
        needsReview: false,
        requestIds: [] as string[],
        source: "NONE",
        coverageReason: null as string | null,
      };
    }

    const approvedRequests = activeRequests.filter((request) =>
      ["HR_APPROVED", "APPROVED"].includes(String(request.status)),
    );

    const statusPriority = [
      "SUBMITTED",
      "MANAGER_APPROVED",
      "HR_REJECTED",
      "MANAGER_REJECTED",
      "HR_APPROVED",
      "APPROVED",
      "DRAFT",
      "REJECTED",
    ];

    const primary = [...activeRequests].sort((a, b) => {
      const aIndex = statusPriority.indexOf(String(a.status));
      const bIndex = statusPriority.indexOf(String(b.status));
      return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
    })[0];

    const coveredSessions = new Set<"MORNING" | "AFTERNOON" | "CHECKOUT">();
    let minutes = 0;

    for (const request of approvedRequests) {
      const startMinutes = this.parseTimeToMinutes(
        String(request.startTime ?? ""),
      );
      const endMinutes = this.parseTimeToMinutes(String(request.endTime ?? ""));

      if (
        !Number.isFinite(startMinutes) ||
        !Number.isFinite(endMinutes) ||
        endMinutes <= startMinutes
      ) {
        continue;
      }

      minutes += endMinutes - startMinutes;

      for (const rule of sessionRules) {
        const session = this.mapSessionRuleToSummarySession(
          String(rule.sessionCode ?? ""),
        );
        if (!session) continue;

        const expectedMinutes = this.parseTimeToMinutes(
          String(
            rule.expectedTime ??
              rule.lateAfterTime ??
              rule.earlyBeforeTime ??
              rule.openTime ??
              "",
          ),
        );
        if (!Number.isFinite(expectedMinutes)) continue;

        // อนุมัติ Offsite แล้วให้ครอบคลุมรอบลงเวลาที่เวลามาตรฐานอยู่ในช่วง Offsite
        // เช่น 08:00-17:00 ครอบคลุม เข้าเช้า / เข้าเที่ยง / ออกงาน
        if (startMinutes <= expectedMinutes && expectedMinutes <= endMinutes) {
          coveredSessions.add(session);
        }
      }
    }

    const hasApproved = approvedRequests.length > 0;
    const requestIds = activeRequests
      .map((request) => String(request.id))
      .filter(Boolean);

    return {
      coversMorning: coveredSessions.has("MORNING"),
      coversAfternoon: coveredSessions.has("AFTERNOON"),
      coversCheckout: coveredSessions.has("CHECKOUT"),
      coveredSessions: [...coveredSessions],
      status: String(primary.status ?? ""),
      minutes: Number.isFinite(minutes) ? Math.max(minutes, 0) : 0,
      needsReview: !hasApproved,
      requestIds,
      source: "OFFSITE_WORK_REQUEST",
      coverageReason: hasApproved
        ? `HR อนุมัติทำงานนอกสถานที่ ครอบคลุม ${[...coveredSessions].join(", ") || "บางช่วงเวลา"}`
        : "คำขอทำงานนอกสถานที่ยังไม่ผ่าน HR อนุมัติขั้นสุดท้าย",
    };
  }

  private mapSessionRuleToSummarySession(
    sessionCode: string,
  ): "MORNING" | "AFTERNOON" | "CHECKOUT" | null {
    if (sessionCode === "MORNING_IN") return "MORNING";
    if (sessionCode === "AFTERNOON_IN") return "AFTERNOON";
    if (sessionCode === "CHECK_OUT") return "CHECKOUT";
    return null;
  }

  private addAttendanceHolidayToPolicySnapshot(
    snapshot: any,
    holiday: AttendanceHolidayInfo,
  ) {
    if (!holiday?.isWorkingHoliday) {
      return snapshot;
    }

    return {
      ...(snapshot ?? {}),
      holiday,
      workingHoliday: {
        date: holiday.date,
        name: holiday.name,
        baseHoliday: holiday.baseHoliday ?? null,
        workOverride: holiday.workOverride ?? null,
        grantSubstituteHoliday:
          holiday.workOverride?.grantSubstituteHoliday ?? true,
      },
    };
  }

  private addSubstituteHolidayCreditToPolicySnapshot(
    snapshot: any,
    credit: any,
    created: boolean,
  ) {
    return {
      ...(snapshot ?? {}),
      substituteHolidayCredit: {
        id: credit.id,
        employeeId: credit.employeeId,
        employeeCode: credit.employeeCode ?? null,
        employeeName: credit.employeeName ?? null,
        earnedDate: credit.earnedDate,
        grantedDays: credit.grantedDays,
        grantedMinutes: credit.grantedMinutes,
        status: credit.status,
        created,
        grantedAt: credit.grantedAt ?? null,
        sourceSummaryId: credit.sourceSummaryId ?? null,
      },
    };
  }


  private addAbsenceDeductionToPolicySnapshot(
    policySnapshot: Record<string, unknown> | null | undefined,
    absenceDeduction: AbsenceDeductionSnapshot,
  ) {
    return {
      ...(policySnapshot ?? {}),
      absenceDeduction: {
        amount: absenceDeduction.amount,
        baseSalary: absenceDeduction.baseSalary,
        payrollPeriodStartDate: absenceDeduction.payrollPeriodStartDate,
        payrollPeriodEndDate: absenceDeduction.payrollPeriodEndDate,
        payrollPeriodDays: absenceDeduction.payrollPeriodDays,
        absentDays: absenceDeduction.absentDays,
        dailyRate: absenceDeduction.dailyRate,
        calculationMethod: absenceDeduction.calculationMethod,
        missingCompensation: absenceDeduction.missingCompensation,
        formula: "baseSalary / payrollPeriodDays * absentDays",
      },
    };
  }

  private addOffsiteCoverageToPolicySnapshot(
    snapshot: unknown,
    offsiteCoverage: {
      coversMorning?: boolean;
      coversAfternoon?: boolean;
      coversCheckout?: boolean;
      coveredSessions?: Array<"MORNING" | "AFTERNOON" | "CHECKOUT">;
      status: string | null;
      minutes: number;
      needsReview: boolean;
      requestIds: string[];
      source: string;
      coverageReason?: string | null;
    },
  ) {
    const base = (
      snapshot && typeof snapshot === "object" ? snapshot : {}
    ) as Record<string, any>;
    if (!offsiteCoverage.status && offsiteCoverage.requestIds.length === 0)
      return base;

    return {
      ...base,
      approvedOffsiteCoverage: {
        ...(base.approvedOffsiteCoverage ?? {}),
        coversMorning: offsiteCoverage.coversMorning ?? false,
        coversAfternoon: offsiteCoverage.coversAfternoon ?? false,
        coversCheckout: offsiteCoverage.coversCheckout ?? false,
        coveredSessions: offsiteCoverage.coveredSessions ?? [],
        status: offsiteCoverage.status,
        minutes: offsiteCoverage.minutes,
        needsReview: offsiteCoverage.needsReview,
        offsiteRequestIds: offsiteCoverage.requestIds,
        source: offsiteCoverage.source,
        coverageReason: offsiteCoverage.coverageReason ?? null,
      },
    };
  }

  private addLeaveCoverageToPolicySnapshot(
    policySnapshot: Record<string, unknown> | null | undefined,
    leaveCoverage: LeaveCoverage,
    leaves: any[],
    unpaidLeaveDeduction?: UnpaidLeaveDeductionSnapshot,
  ) {
    return {
      ...(policySnapshot ?? {}),
      unpaidLeaveDeduction: unpaidLeaveDeduction
        ? {
            amount: unpaidLeaveDeduction.amount,
            baseSalary: unpaidLeaveDeduction.baseSalary,
            salaryDivisorDays: unpaidLeaveDeduction.salaryDivisorDays,
            workingHoursPerDay: unpaidLeaveDeduction.workingHoursPerDay,
            dailyRate: unpaidLeaveDeduction.dailyRate,
            hourlyRate: unpaidLeaveDeduction.hourlyRate,
            unpaidLeaveMinutes: unpaidLeaveDeduction.unpaidLeaveMinutes,
            unpaidLeaveHours: unpaidLeaveDeduction.unpaidLeaveHours,
            unpaidDeductionMultiplier:
              unpaidLeaveDeduction.unpaidDeductionMultiplier,
            amountBeforeMultiplier:
              unpaidLeaveDeduction.amountBeforeMultiplier,
            calculationMethod: unpaidLeaveDeduction.calculationMethod,
            missingCompensation: unpaidLeaveDeduction.missingCompensation,
            formula:
              "baseSalary / salaryDivisorDays / workingHoursPerDay * unpaidLeaveHours * unpaidDeductionMultiplier",
          }
        : null,
      approvedLeaveCoverage: {
        coversMorning: leaveCoverage.coversMorning,
        coversAfternoon: leaveCoverage.coversAfternoon,
        coversCheckout: leaveCoverage.coversCheckout,
        coveredSessions: leaveCoverage.coveredSessions,
        durationDays: leaveCoverage.durationDays,
        paidLeaveMinutes: leaveCoverage.paidLeaveMinutes,
        unpaidLeaveMinutes: leaveCoverage.unpaidLeaveMinutes,
        unpaidDurationDays: leaveCoverage.unpaidDurationDays,
        coverageReason: leaveCoverage.coverageReason,
        leaveRequestIds: leaveCoverage.leaveRequestIds,
        leaveTypeIds: leaveCoverage.leaveTypeIds,
        leaves: leaves.map((leave) => ({
          id: leave.id,
          requestNo: leave.requestNo,
          leaveTypeId: leave.leaveTypeId,
          leaveTypeCode: leave.leaveType?.code ?? null,
          leaveTypeName: leave.leaveType?.nameTh ?? null,
          isPaid: Boolean(leave.leaveType?.isPaid),
          dayType: leave.dayType,
          startDate: leave.startDate ? this.toDateKey(leave.startDate) : null,
          endDate: leave.endDate ? this.toDateKey(leave.endDate) : null,
          startTime: leave.startTime ?? null,
          endTime: leave.endTime ?? null,
          totalMinutes: leave.totalMinutes ?? 0,
          totalDays: String(leave.totalDays ?? 0),
        })),
      },
    };
  }

  private async calculateUnpaidLeaveDeduction(
    employeeId: string,
    workDate: Date,
    unpaidLeaveMinutes: number,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
  ): Promise<UnpaidLeaveDeductionSnapshot> {
    if (unpaidLeaveMinutes <= 0) {
      return this.buildEmptyUnpaidLeaveDeduction(0, false, settings);
    }

    const compensation = await this.findBestCompensationForUnpaidLeave(
      employeeId,
      workDate,
    );

    if (!compensation) {
      return this.buildEmptyUnpaidLeaveDeduction(
        unpaidLeaveMinutes,
        true,
        settings,
      );
    }

    return this.calculateUnpaidLeaveDeductionFromBaseSalary(
      compensation.baseSalary,
      unpaidLeaveMinutes,
      settings,
    );
  }

  private calculateUnpaidLeaveDeductionFromBaseSalary(
    baseSalaryValue: unknown,
    unpaidLeaveMinutes: number,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
    unpaidDeductionMultiplier = DEFAULT_UNPAID_DEDUCTION_MULTIPLIER,
    salaryBasis?: unknown,
  ): UnpaidLeaveDeductionSnapshot {
    const normalizedMinutes = Math.max(
      Math.round(Number(unpaidLeaveMinutes ?? 0)),
      0,
    );
    const multiplier = this.normalizeUnpaidDeductionMultiplier(
      unpaidDeductionMultiplier,
    );

    if (normalizedMinutes <= 0) {
      return this.buildEmptyUnpaidLeaveDeduction(0, false, settings, multiplier);
    }

    const baseSalary = Number(baseSalaryValue ?? 0);
    const normalizedSettings =
      this.normalizePayrollCalculationSettings(settings);

    if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
      return this.buildEmptyUnpaidLeaveDeduction(
        normalizedMinutes,
        true,
        normalizedSettings,
        multiplier,
      );
    }

    const salaryDivisorDays = normalizedSettings.salaryDivisorDays;
    const workingHoursPerDay = normalizedSettings.workingHoursPerDay;
    const unpaidLeaveHours = normalizedMinutes / 60;

    /*
     * คิดยอดจากค่าจ้างเต็มก่อน แล้วค่อยปัดเศษครั้งเดียวตอนจบ
     *
     * เดิมปัดอัตรารายวันและรายชั่วโมงระหว่างทางแล้วคูณกลับขึ้นมา ทำให้ยอดเพี้ยน
     * เช่น เงินเดือน 25,000 ลาไม่รับค่าจ้าง 1 วัน
     *   เดิม  25,000/30 = 833.33 -> /8 = 104.17 -> x8 = 833.36
     *   ใหม่  25,000/30/8 x 8    = 833.33  ตรงกับค่าจ้างหนึ่งวันพอดี
     *
     * อัตรารายวัน/รายชั่วโมงที่คืนออกไปยังปัดเศษไว้เหมือนเดิม เพราะใช้แสดงผล
     */
    const { exactDailyRate, exactHourlyRate } = resolveSalaryRates(
      baseSalary,
      normalizedSettings,
      salaryBasis,
    );
    const dailyRate = this.roundMoney(exactDailyRate);
    const hourlyRate = this.roundMoney(exactHourlyRate);

    const amountBeforeMultiplier = this.roundMoney(
      exactHourlyRate * unpaidLeaveHours,
    );
    const amount = this.roundMoney(
      exactHourlyRate * unpaidLeaveHours * multiplier,
    );

    return {
      amount,
      baseSalary: this.roundMoney(baseSalary),
      salaryDivisorDays,
      workingHoursPerDay,
      dailyRate,
      hourlyRate,
      unpaidLeaveMinutes: normalizedMinutes,
      unpaidLeaveHours: this.roundNumber(unpaidLeaveHours),
      unpaidDeductionMultiplier: multiplier,
      amountBeforeMultiplier,
      calculationMethod: "BASE_SALARY_CONFIGURED_DAYS_HOURS",
      missingCompensation: false,
    };
  }

  /**
   * ค่าปรับต้องเป็นตัวเลขไม่ติดลบ ถ้าค่าเพี้ยน/หายไป ให้กลับไปใช้ 1 เท่า
   * (พฤติกรรมเดิมของระบบก่อนมีฟิลด์นี้)
   */
  private normalizeUnpaidDeductionMultiplier(value: unknown): number {
    const multiplier = Number(value ?? DEFAULT_UNPAID_DEDUCTION_MULTIPLIER);

    if (!Number.isFinite(multiplier) || multiplier < 0) {
      return DEFAULT_UNPAID_DEDUCTION_MULTIPLIER;
    }

    return multiplier;
  }

  private buildEmptyUnpaidLeaveDeduction(
    unpaidLeaveMinutes: number,
    missingCompensation = false,
    settings = DEFAULT_PAYROLL_CALCULATION_SETTINGS,
    unpaidDeductionMultiplier = DEFAULT_UNPAID_DEDUCTION_MULTIPLIER,
  ): UnpaidLeaveDeductionSnapshot {
    const normalizedMinutes = Math.max(
      Math.round(Number(unpaidLeaveMinutes ?? 0)),
      0,
    );

    const normalizedSettings =
      this.normalizePayrollCalculationSettings(settings);

    return {
      amount: 0,
      baseSalary: 0,
      salaryDivisorDays: normalizedSettings.salaryDivisorDays,
      workingHoursPerDay: normalizedSettings.workingHoursPerDay,
      dailyRate: 0,
      hourlyRate: 0,
      unpaidLeaveMinutes: normalizedMinutes,
      unpaidLeaveHours: this.roundNumber(normalizedMinutes / 60),
      unpaidDeductionMultiplier: this.normalizeUnpaidDeductionMultiplier(
        unpaidDeductionMultiplier,
      ),
      amountBeforeMultiplier: 0,
      calculationMethod: "BASE_SALARY_CONFIGURED_DAYS_HOURS",
      missingCompensation,
    };
  }

  private async getPayrollCalculationSettings(
    companyId?: string | null,
  ): Promise<PayrollCalculationSettings> {
    if (companyId) {
      const companySettings =
        await this.companyPayrollSettingsService.resolvePayrollCalculationSettings(
          companyId,
        );

      return this.normalizePayrollCalculationSettings({
        payrollCutoffDay: companySettings.payrollCutoffDay,
        payrollPeriodStartDay: companySettings.payrollPeriodStartDay,
        salaryDivisorDays: companySettings.salaryDivisorDays,
        workingHoursPerDay: companySettings.workingHoursPerDay,
      });
    }

    const rows = await this.prisma.$queryRaw<Array<{ value: unknown }>>`
      SELECT "value"
      FROM system_settings
      WHERE "id" = 'system'
      LIMIT 1
    `;

    const raw =
      rows[0]?.value &&
      typeof rows[0].value === "object" &&
      !Array.isArray(rows[0].value)
        ? (rows[0].value as Record<string, unknown>)
        : {};

    return this.normalizePayrollCalculationSettings({
      payrollCutoffDay: raw.payrollCutoffDay,
      payrollPeriodStartDay: raw.payrollPeriodStartDay,
      salaryDivisorDays: raw.salaryDivisorDays,
      workingHoursPerDay: raw.workingHoursPerDay,
    });
  }

  private async getPayrollCalculationSettingsByCompanyIds(
    companyIds: Array<string | null | undefined>,
  ): Promise<Map<string, PayrollCalculationSettings>> {
    const uniqueCompanyIds = Array.from(
      new Set(companyIds.filter((companyId): companyId is string => Boolean(companyId))),
    );

    const entries = await Promise.all(
      uniqueCompanyIds.map(async (companyId) => [
        companyId,
        await this.getPayrollCalculationSettings(companyId),
      ] as const),
    );

    return new Map(entries);
  }

  /**
   * ตั้งค่าวันหยุดของแต่ละบริษัท (per-company) สำหรับการคำนวณสรุปเวลาแบบ batch
   * ที่อาจมีพนักงานหลายบริษัทในรอบเดียว
   */
  private async getAttendanceHolidaySettingsByCompanyIds(
    companyIds: Array<string | null | undefined>,
  ): Promise<Map<string, AttendanceHolidaySettingsContext>> {
    const uniqueCompanyIds = Array.from(
      new Set(
        companyIds.filter((companyId): companyId is string => Boolean(companyId)),
      ),
    );

    const entries = await Promise.all(
      uniqueCompanyIds.map(
        async (companyId) =>
          [
            companyId,
            (await this.systemSettingsService.getSystemSettings(
              companyId,
            )) as unknown as AttendanceHolidaySettingsContext,
          ] as const,
      ),
    );

    return new Map(entries);
  }

  private resolvePayrollCalculationSettingsForEmployee(
    employee: { companyId?: string | null; company?: { id?: string | null } | null },
    context?: DailyCalculationContext,
  ): PayrollCalculationSettings {
    const companyId = employee.companyId ?? employee.company?.id ?? null;

    if (companyId) {
      const companySettings = context?.payrollSettingsByCompanyId?.get(companyId);
      if (companySettings) return companySettings;
    }

    return context?.payrollSettings ?? DEFAULT_PAYROLL_CALCULATION_SETTINGS;
  }

  private normalizePayrollCalculationSettings(
    value: Partial<Record<keyof PayrollCalculationSettings, unknown>>,
  ): PayrollCalculationSettings {
    const payrollCutoffDay = this.normalizeInteger(
      value.payrollCutoffDay,
      DEFAULT_PAYROLL_CALCULATION_SETTINGS.payrollCutoffDay,
      1,
      31,
    );
    const payrollPeriodStartDay = this.normalizeInteger(
      value.payrollPeriodStartDay,
      DEFAULT_PAYROLL_CALCULATION_SETTINGS.payrollPeriodStartDay,
      1,
      31,
    );
    const salaryDivisorDays = this.normalizeInteger(
      value.salaryDivisorDays,
      DEFAULT_PAYROLL_CALCULATION_SETTINGS.salaryDivisorDays,
      1,
      31,
    );
    const workingHoursPerDay = this.normalizeInteger(
      value.workingHoursPerDay,
      DEFAULT_PAYROLL_CALCULATION_SETTINGS.workingHoursPerDay,
      1,
      24,
    );

    return {
      payrollCutoffDay,
      payrollPeriodStartDay,
      salaryDivisorDays,
      workingHoursPerDay,
    };
  }

  private normalizeInteger(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) {
    const numberValue = Number(value ?? fallback);
    if (
      !Number.isInteger(numberValue) ||
      numberValue < min ||
      numberValue > max
    ) {
      return fallback;
    }

    return numberValue;
  }

  private toPositiveMoney(value: unknown) {
    const numberValue = Number(value ?? 0);

    if (!Number.isFinite(numberValue) || numberValue <= 0) {
      return 0;
    }

    return numberValue;
  }

  /**
   * HR กดยกเว้นค่าปรับลืมสแกนของวันไหนไว้ ให้การตัดสินใจนั้นรอดจากการคำนวณใหม่
   * ตัวคำนวณยังนับนาที/สถานะขาดสแกนตามจริงทุกอย่าง แค่ยอดค่าปรับเป็น 0
   */
  private applyMissingLogPenaltyWaiver(
    amounts: {
      missingLogPenaltyAmount: number;
      totalDeductionAmount: number;
    },
    existingReviewState: any,
  ) {
    const waived = Boolean(existingReviewState?.missingLogPenaltyWaived);
    const carried = {
      missingLogPenaltyWaived: waived,
      penaltyWaivedReason: existingReviewState?.penaltyWaivedReason ?? null,
      penaltyWaivedAt: existingReviewState?.penaltyWaivedAt ?? null,
      penaltyWaivedById: existingReviewState?.penaltyWaivedById ?? null,
    };

    if (!waived) {
      return { ...amounts, ...carried, penaltyWaivedAmount: 0 };
    }

    /* ยอดแยกรายช่วง (เช้า/บ่าย/ออก) ไม่ถูกล้าง หน้าจอจะได้บอกได้ว่าขาดช่วงไหน
       และกด "กลับมาหัก" ทีหลังก็คืนยอดรวมจาก penaltyWaivedAmount ได้ทันที */
    const waivedAmount = this.roundMoney(
      this.toSafeNumber(amounts.missingLogPenaltyAmount),
    );

    return {
      ...carried,
      penaltyWaivedAmount: waivedAmount,
      missingLogPenaltyAmount: 0,
      totalDeductionAmount: this.roundMoney(
        Math.max(
          0,
          this.toSafeNumber(amounts.totalDeductionAmount) - waivedAmount,
        ),
      ),
    };
  }

  private roundMoney(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.round(value * 100) / 100;
  }

  private roundNumber(value: number, precision = 4) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  private buildDailySummaryNote(params: {
    leave?: any;
    leaveCoverage?: LeaveCoverage;
    hasMissingLog: boolean;
    totalLateMinutes: number;
    totalDeductionAmount: number;
  }) {
    const notes: string[] = [];

    if (params.leave) {
      const leaveTypeName =
        params.leave.leaveType?.nameTh ?? params.leave.leaveType?.code ?? "";
      const leaveMode = params.leave.leaveType?.isPaid ? "Paid" : "Unpaid";
      const coverage = params.leaveCoverage?.coverageReason;

      notes.push(
        `มีใบลาอนุมัติ ${leaveTypeName} (${leaveMode}${coverage ? `: ${coverage}` : ""})`.trim(),
      );
    }

    if (params.totalLateMinutes > 0) {
      notes.push(`มาสายรวม ${params.totalLateMinutes} นาที`);
    }

    if (params.hasMissingLog) {
      notes.push("มีรอบลงเวลาที่ไม่พบรายการในช่วงที่ไม่ได้ลา");
    }

    if (params.totalDeductionAmount <= 0) {
      notes.push("ไม่มีรายการหักเงิน");
    }

    return notes.join(" / ") || null;
  }

  /**
   * คอลัมน์ที่พอสำหรับตัดสินใจเปลี่ยนสถานะรีวิว/พร้อมจ่าย/ล็อก และเขียนกลับ
   * ใช้แทน include เต็มในงานที่แตะทั้งงวด ซึ่งมีเป็นพัน ๆ แถว
   */
  private dailySummaryReviewTransitionSelect() {
    return {
      id: true,
      employeeId: true,
      workDate: true,
      calculatedAt: true,
      policySnapshot: true,
      reviewStatus: true,
      reviewedAt: true,
      reviewedById: true,
      readyForPayrollAt: true,
      readyForPayrollById: true,
      lockedAt: true,
      lockedById: true,
      sentToPayrollAt: true,
      payrollRunId: true,
      /* ใช้โดย resolveAttendanceReviewState ตอนเช็คว่ายังมีวันต้องตรวจอยู่ไหม */
      isAbsent: true,
      absentDays: true,
      isMorningMissing: true,
      isAfternoonMissing: true,
      isCheckoutMissing: true,
      hasMissingLog: true,
      totalLateMinutes: true,
      earlyCheckoutMinutes: true,
      latePenaltyAmount: true,
      earlyCheckoutPenaltyAmount: true,
      unpaidLeaveMinutes: true,
      offsiteStatus: true,
    };
  }

  private defaultDailySummaryInclude() {
    return {
      employee: {
        select: {
          id: true,
          companyId: true,
          branchId: true,
          employeeTypeId: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          status: true,
          attendanceGeofenceRequired: true,
          allowedAttendanceMethods: true,
          // หน้าตรวจเวลาใช้สองฟิลด์นี้จัดลำดับแถว — คนที่ต้องลงครบ 3 รอบ
          // ต้องแยกออกจากคนที่ยกเว้นบางรอบ ไม่งั้นช่อง "—" ปนกับ "ไม่พบเวลา"
          attendanceTrackingRequired: true,
          attendanceExemptSessions: true,
          // ระดับตำแหน่งใช้เรียงให้ผู้บริหารขึ้นก่อนในทุกหน้าที่มีรายชื่อพนักงาน
          positionMaster: { select: { level: true } },
          company: { select: { id: true, code: true, nameTh: true } },
          branch: { select: { id: true, code: true, nameTh: true } },
          department: { select: { id: true, code: true, nameTh: true } },
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
      leaveRequest: {
        select: {
          id: true,
          requestNo: true,
          startDate: true,
          endDate: true,
          dayType: true,
          totalDays: true,
          startTime: true,
          endTime: true,
          totalMinutes: true,
          status: true,
        },
      },
      leaveType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
          isPaid: true,
        },
      },
    };
  }

  private buildOffsitePunchNote(
    note: string | undefined,
    verification: {
      status: string;
      reasons: string[];
    } | null,
  ) {
    const parts: string[] = [];
    if (note?.trim()) parts.push(note.trim());
    if (verification) {
      parts.push(`Offsite: ตรวจคำขอและช่วงเวลา ${verification.status}`);
      if (verification.reasons.length > 0) {
        parts.push(verification.reasons.join(" / "));
      }
    }
    return parts.join(" | ") || undefined;
  }

  private defaultAttendanceLogInclude() {
    return {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          status: true,
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
          branch: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
          department: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
          division: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
        },
      },
      device: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      location: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          type: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    } satisfies Prisma.AttendanceLogInclude;
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      throw new NotFoundException("ไม่พบข้อมูลบริษัท");
    }

    return company;
  }

  /**
   * อุปกรณ์ลงเวลาไม่มี companyId ตรง จึงตรวจ scope ผ่านสาขาที่ผูก
   * - GLOBAL: ผ่านได้ทุกกรณี
   * - COMPANY/BRANCH: ต้องระบุสาขา และสาขานั้นต้องอยู่ในบริษัท/สาขาของผู้ใช้
   */
  private async assertDeviceBranchWithinScope(
    scope: TenantScope,
    branchId: string | null,
  ) {
    if (scope.level === "GLOBAL") {
      return;
    }

    if (!branchId) {
      throw new BadRequestException("กรุณาระบุสาขาของอุปกรณ์ลงเวลา");
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { companyId: true },
    });

    if (!branch) {
      throw new NotFoundException("ไม่พบข้อมูลสาขา");
    }

    assertWithinScope(scope, { companyId: branch.companyId, branchId });
  }

  private async ensureBranchExists(branchId: string, companyId?: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
      },
    });

    if (!branch) {
      throw new NotFoundException("ไม่พบข้อมูลสาขา");
    }

    return branch;
  }

  private async ensureEmployeeTypeExists(
    employeeTypeId: string,
    companyId?: string,
  ) {
    const employeeType = await (this.prisma as any).employeeType.findFirst({
      where: {
        id: employeeTypeId,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
      },
    });

    if (!employeeType) {
      throw new NotFoundException(
        "ไม่พบประเภทพนักงาน หรือประเภทพนักงานไม่ได้อยู่ในบริษัทที่เลือก",
      );
    }

    return employeeType;
  }

  private async ensureLocationExists(locationId: string) {
    const location = await this.prisma.attendanceLocation.findFirst({
      where: {
        id: locationId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!location) {
      throw new NotFoundException("ไม่พบสถานที่ลงเวลา");
    }

    return location;
  }

  private async ensureLocationCodeIsAvailable(
    companyId: string,
    code: string,
    excludeId?: string,
  ) {
    const location = await this.prisma.attendanceLocation.findFirst({
      where: {
        companyId,
        code: code.trim(),
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (location) {
      throw new BadRequestException("รหัสสถานที่ลงเวลานี้ถูกใช้งานแล้ว");
    }
  }

  private async ensureDeviceCodeIsAvailable(code: string, excludeId?: string) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: {
        code: code.trim(),
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (device) {
      throw new BadRequestException("รหัสอุปกรณ์ลงเวลานี้ถูกใช้งานแล้ว");
    }
  }

  private defaultAttendanceLocationInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
        },
      },
      branch: {
        select: {
          id: true,
          code: true,
          nameTh: true,
        },
      },
    } satisfies Prisma.AttendanceLocationInclude;
  }


  private validateAttendanceLocationGpsConfig(config: {
    latitude?: number | string | Prisma.Decimal | null;
    longitude?: number | string | Prisma.Decimal | null;
    radiusMeters?: number | null;
  }) {
    const latitude = this.toNullableNumber(config.latitude);
    const longitude = this.toNullableNumber(config.longitude);

    if ((latitude === null) !== (longitude === null)) {
      throw new BadRequestException(
        "กรุณาระบุทั้งละติจูดและลองจิจูด หรือเว้นว่างทั้งคู่",
      );
    }

    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      throw new BadRequestException("Latitude ไม่ถูกต้อง");
    }

    if (
      longitude !== null &&
      (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    ) {
      throw new BadRequestException("Longitude ไม่ถูกต้อง");
    }

    if (config.radiusMeters === null || config.radiusMeters === undefined) {
      throw new BadRequestException("กรุณาระบุรัศมีของจุดลงเวลา");
    }

    if (!Number.isInteger(config.radiusMeters) || config.radiusMeters < 1) {
      throw new BadRequestException("รัศมีต้องเป็นจำนวนเต็มมากกว่า 0 เมตร");
    }
  }

  private toNullableNumber(
    value?: number | string | Prisma.Decimal | null,
  ): number | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return Number.NaN;
    }

    return numericValue;
  }

  private defaultAttendanceDeviceInclude() {
    return {
      branch: {
        select: {
          id: true,
          code: true,
          nameTh: true,
        },
      },
      location: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          type: true,
        },
      },
    } satisfies Prisma.AttendanceDeviceInclude;
  }

  private async ensureAttendanceRefsAreValid(
    locationId?: string,
    deviceId?: string,
  ) {
    if (locationId) {
      await this.ensureLocationExists(locationId);
    }

    if (deviceId) {
      await this.ensureDeviceExists(deviceId);
    }
  }

  private async ensureDeviceExists(deviceId: string) {
    const device = await this.prisma.attendanceDevice.findFirst({
      where: {
        id: deviceId,
        deletedAt: null,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!device) {
      throw new NotFoundException(
        "ไม่พบอุปกรณ์ลงเวลา หรืออุปกรณ์ไม่พร้อมใช้งาน",
      );
    }

    return device;
  }

  private async validateGpsAttendanceLocation(dto: {
    channel?: string;
    locationId?: string;
    latitude?: number;
    longitude?: number;
    gpsAccuracy?: number;
  }) {
    if (dto.channel !== "GPS") {
      return;
    }

    if (dto.latitude === undefined || dto.longitude === undefined) {
      throw new BadRequestException("กรุณาส่งพิกัด GPS ก่อนลงเวลา");
    }

    if (dto.latitude < -90 || dto.latitude > 90) {
      throw new BadRequestException("Latitude ไม่ถูกต้อง");
    }

    if (dto.longitude < -180 || dto.longitude > 180) {
      throw new BadRequestException("Longitude ไม่ถูกต้อง");
    }

    // Phase 3: ESS Check-in แนบ GPS เพื่อเก็บหลักฐานย้อนหลังได้
    // แต่ยังไม่บังคับให้เลือก AttendanceLocation เพราะหน้า ESS ยังไม่มี flow เลือกจุดลงเวลา
    // ถ้ามี locationId ส่งมา จึงค่อย validate ระยะจากสถานที่ตาม policy เดิม
    if (!dto.locationId) {
      return;
    }

    const location = await this.prisma.attendanceLocation.findFirst({
      where: {
        id: dto.locationId,
        deletedAt: null,
        status: "ACTIVE",
      },
      select: {
        id: true,
        code: true,
        nameTh: true,
        latitude: true,
        longitude: true,
        radiusMeters: true,
      },
    });

    if (!location) {
      throw new NotFoundException(
        "ไม่พบสถานที่ลงเวลา หรือสถานที่ไม่พร้อมใช้งาน",
      );
    }

    if (location.latitude === null || location.longitude === null) {
      throw new BadRequestException("สถานที่ลงเวลานี้ยังไม่ได้กำหนดพิกัด GPS");
    }

    const locationLatitude = Number(location.latitude);
    const locationLongitude = Number(location.longitude);
    const distanceMeters = this.calculateDistanceMeters(
      dto.latitude,
      dto.longitude,
      locationLatitude,
      locationLongitude,
    );

    if (distanceMeters > location.radiusMeters) {
      throw new BadRequestException(
        `อยู่นอกพื้นที่ลงเวลา ระยะห่างประมาณ ${Math.round(
          distanceMeters,
        ).toLocaleString(
          "th-TH",
        )} เมตร จาก ${location.nameTh} ซึ่งอนุญาตไม่เกิน ${location.radiusMeters.toLocaleString(
          "th-TH",
        )} เมตร`,
      );
    }
  }

  /**
   * หาจุดลงเวลา (AttendanceLocation) ที่ใช้ล้อมรั้ว GPS ของพนักงาน โดยยึด "ตามสาขา"
   * - ต้องเป็นจุด ACTIVE ของสาขาพนักงาน และตั้งพิกัด lat/lng ไว้แล้ว
   * - ถ้าสาขายังไม่ได้ตั้งจุด → คืน null = ยังไม่บังคับ geofence สำหรับสาขานั้น
   */
  // แปลง source ของ punch → วิธีลงเวลา (AttendanceMethod) สำหรับตรวจสิทธิ์
  private mapPunchSourceToMethod(
    source: string | undefined,
  ): "WEB" | "MOBILE" | "DEVICE" {
    if (source === "MOBILE_APP") return "MOBILE";
    if (source === "SCANNER") return "DEVICE";
    return "WEB";
  }

  private assertAttendanceMethodAllowed(
    employee: { allowedAttendanceMethods?: string[] | null },
    source: string | undefined,
  ) {
    const allowed = employee.allowedAttendanceMethods ?? [];
    // ไม่ได้ตั้งค่าไว้ = อนุญาตทุกวิธี (เข้ากันได้กับข้อมูลเดิม)
    if (allowed.length === 0) {
      return;
    }

    const method = this.mapPunchSourceToMethod(source);
    if (!allowed.includes(method)) {
      const label: Record<string, string> = {
        WEB: "เว็บ",
        MOBILE: "แอปมือถือ",
        DEVICE: "เครื่องสแกน",
      };
      throw new BadRequestException(
        `พนักงานคนนี้ไม่ได้รับอนุญาตให้ลงเวลาผ่าน${label[method] ?? method} กรุณาติดต่อ HR`,
      );
    }
  }

  private async resolveBranchGeofenceLocation(employee: {
    companyId: string;
    branchId: string | null;
    attendanceLocationId?: string | null;
  }) {
    /*
     * จุดที่ผูกให้รายคนมาก่อนเสมอ — สาขาที่ไม่มีเครื่องสแกนใช้ GPS แทน และบางคน
     * ประจำหน้างานคนละที่กับสาขาที่สังกัด ถ้าจุดนั้นถูกปิด/ลบ/ยังไม่ปักหมุด
     * ให้ตกไปใช้ของสาขาเหมือนเดิม ไม่ใช่ล็อกจนลงเวลาไม่ได้
     */
    if (employee.attendanceLocationId) {
      const pinned = await this.prisma.attendanceLocation.findFirst({
        where: {
          id: employee.attendanceLocationId,
          companyId: employee.companyId,
          deletedAt: null,
          status: "ACTIVE",
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          id: true,
          code: true,
          nameTh: true,
          branchId: true,
          latitude: true,
          longitude: true,
          radiusMeters: true,
        },
      });
      if (pinned) return pinned;
    }

    // ผู้สมัคร: จุดที่ตรงสาขาพนักงาน (ถ้ามีสาขา) หรือจุดระดับบริษัท (branchId = null = ทุกสาขา)
    const candidates = await this.prisma.attendanceLocation.findMany({
      where: {
        companyId: employee.companyId,
        deletedAt: null,
        status: "ACTIVE",
        latitude: { not: null },
        longitude: { not: null },
        OR: [
          ...(employee.branchId ? [{ branchId: employee.branchId }] : []),
          { branchId: null },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        nameTh: true,
        branchId: true,
        latitude: true,
        longitude: true,
        radiusMeters: true,
      },
    });

    if (candidates.length === 0) {
      return null;
    }

    // เลือกจุดเฉพาะสาขาก่อน แล้วค่อย fallback ไปจุดระดับบริษัท (ทุกสาขา)
    return (
      candidates.find(
        (location) =>
          employee.branchId !== null && location.branchId === employee.branchId,
      ) ??
      candidates.find((location) => location.branchId === null) ??
      candidates[0]
    );
  }

  /**
   * บังคับ geofence สำหรับการลงเวลาที่สำนักงาน (ไม่ใช่ offsite)
   * - ถ้าสาขามีจุดลงเวลาที่ตั้งพิกัดไว้ → ต้องมี GPS และต้องอยู่ในรัศมี ไม่งั้นบล็อก
   * - ถ้าสาขายังไม่ได้ตั้งจุด → คืน null (ไม่บังคับ)
   */
  private async enforceBranchGeofence(
    employee: {
      companyId: string;
      branchId: string | null;
      attendanceLocationId?: string | null;
    },
    dto: { latitude?: number; longitude?: number },
  ): Promise<{
    locationId: string;
    distanceMeters: number;
    verified: boolean;
    status: string;
  } | null> {
    const location = await this.resolveBranchGeofenceLocation(employee);
    if (!location) {
      return null;
    }

    if (dto.latitude === undefined || dto.longitude === undefined) {
      throw new BadRequestException(
        "ต้องเปิด GPS และอนุญาตการเข้าถึงตำแหน่งเพื่อลงเวลาที่สำนักงาน",
      );
    }

    const distanceMeters = this.calculateDistanceMeters(
      dto.latitude,
      dto.longitude,
      Number(location.latitude),
      Number(location.longitude),
    );

    if (distanceMeters > location.radiusMeters) {
      throw new BadRequestException(
        `อยู่นอกพื้นที่ลงเวลา ระยะห่างประมาณ ${Math.round(
          distanceMeters,
        ).toLocaleString(
          "th-TH",
        )} เมตร จาก ${location.nameTh} ซึ่งอนุญาตไม่เกิน ${location.radiusMeters.toLocaleString(
          "th-TH",
        )} เมตร`,
      );
    }

    return {
      locationId: location.id,
      distanceMeters,
      verified: true,
      status: "VERIFIED",
    };
  }

  private calculateDistanceMeters(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ) {
    const earthRadiusMeters = 6371000;

    const lat1Rad = this.toRadians(latitude1);
    const lat2Rad = this.toRadians(latitude2);
    const deltaLatRad = this.toRadians(latitude2 - latitude1);
    const deltaLongRad = this.toRadians(longitude2 - longitude1);

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLongRad / 2) *
        Math.sin(deltaLongRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }
}
