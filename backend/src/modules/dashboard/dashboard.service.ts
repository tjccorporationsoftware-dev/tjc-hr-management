import { Injectable } from "@nestjs/common";
import {
  AttendanceLogStatus,
  AttendanceReviewStatus,
  AuditAction,
  DocumentRequestStatus,
  AttendanceLogType,
  EmployeeStatus,
  HrReviewStatus,
  LeaveRequestStatus,
  MasterStatus,
  OffsiteRequestStatus,
  OvertimeRequestStatus,
  PayrollLineSourceType,
  PayrollLineType,
  PayrollRunStatus,
  ProbationStatus,
  ResignationStatus,
  TimeAdjustRequestStatus,
  UserStatus,
} from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import type {
  AuthenticatedUser,
  TenantScope,
} from "../../common/interfaces/authenticated-user.interface";
import {
  deductsWholeDayAbsence,
  resolveSalaryRates,
} from "../../common/utils/salary-rate.util";
import {
  applyOvertimeAmountRounding,
  type OvertimeAmountRoundingModeValue,
} from "../overtime/utils/overtime-amount.util";
import { pickOvertimePolicy } from "../overtime/utils/overtime-policy.util";
import { PrismaService } from "../../database/prisma.service";
import { SystemSettingsService } from "../settings/system-settings.service";

type Trend = "up" | "down" | "neutral";

type MonthRange = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

type PayrollDashboardSummaryFilters = {
  companyId?: string | null;
  branchId?: string | null;
};


/**
 * ช่องทางลงเวลาที่เอาไปแสดงบน dashboard
 * -------------------------------------
 * enum `AttendanceChannel` มี 8 ค่า แต่ในเชิงการใช้งานจริงมีแค่ 3 ทางที่พนักงาน
 * ลงเวลาเองได้ ที่เหลือเป็นรายละเอียดของ 3 ทางนั้น หรือเป็นค่าที่ไม่มีโค้ดไหนเขียนเลย
 *   GPS    = ลงเวลาผ่านเว็บที่แนบพิกัดมาด้วย (resolveCheckChannel อัปเกรด WEB -> GPS
 *            เมื่อ dto มี latitude/longitude) ฝั่ง source ยังเป็น "WEB" อยู่
 *   QR     ไม่มีโค้ดไหนเขียนค่านี้ลงฐาน
 *   KIOSK  ตู้ที่ตั้งไว้หน้างาน ถือเป็นอุปกรณ์เหมือนเครื่องสแกน
 *   IMPORT นำเข้าจากไฟล์ของเครื่องสแกน (mapChannelToPunchSource ก็ตีเป็น SCANNER)
 *   MANUAL ไม่ได้มาจากพนักงาน แต่มาจาก HR คีย์ให้/ระบบลงให้ตอนอนุมัติคำขอแก้เวลา
 *          จึงต้องแยกออกมา ไม่งั้นยอด "เว็บ" จะพองด้วยรายการที่ไม่มีใครลงเวลาจริง
 *
 * การจับกลุ่มนี้ตรงกับ `mapChannelToPunchSource` ของ AttendanceService
 * (WEB / MOBILE_APP / SCANNER) เพื่อให้ตัวเลขบน dashboard พูดตรงกับที่ API บันทึก
 */
const ATTENDANCE_CHANNEL_BUCKETS = [
  { key: "WEB", label: "เว็บ", channels: ["WEB", "GPS", "QR"] },
  { key: "MOBILE", label: "แอปมือถือ", channels: ["MOBILE"] },
  { key: "DEVICE", label: "เครื่องสแกน", channels: ["DEVICE", "KIOSK", "IMPORT"] },
  { key: "MANUAL", label: "HR บันทึกให้", channels: ["MANUAL"] },
] as const;

const DEPARTMENT_COLORS = [
  "#60a5fa",
  "#22c55e",
  "#14b8a6",
  "#8b5cf6",
  "#f59e0b",
  "#64748b",
];

/** ป้ายไทยของประเภทวันลา — ใช้ในป๊อปอัพรายละเอียดของแอปมือถือ */
const LEAVE_DAY_TYPE_LABEL: Record<string, string> = {
  FULL_DAY: "เต็มวัน",
  HALF_DAY_MORNING: "ครึ่งวันเช้า",
  HALF_DAY_AFTERNOON: "ครึ่งวันบ่าย",
  HOURLY: "ลาเป็นชั่วโมง",
};

/** ป้ายไทยของประเภทวันที่ทำโอที — อัตราจ่ายต่างกันตามประเภท */
const OVERTIME_WORK_TYPE_LABEL: Record<string, string> = {
  WORKDAY: "วันทำงาน",
  HOLIDAY: "วันหยุด",
  SPECIAL_HOLIDAY: "วันหยุดพิเศษ",
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  /* =========================================================
     TENANT SCOPE HELPERS
     ---------------------------------------------------------
     ทุก dashboard ต้องกรองข้อมูลตาม scope ของผู้เรียก (GLOBAL/COMPANY/BRANCH)
     เพื่อไม่ให้เห็นข้อมูลข้ามบริษัท/สาขา
     - scopeDirect: model ที่มี companyId + branchId ตรง (Employee, Department)
     - scopeViaEmployee: model ที่ scope ผ่าน relation employee
       (AttendanceLog, LeaveRequest, OvertimeRequest, TimeAdjustRequest, EmployeeResignation)
     - scopeCompany: model ที่มีแค่ companyId ไม่มี branchId
       (DocumentRequest, HrReviewItem, PayrollPeriod, PayrollRun, ProbationRecord)
  ========================================================= */

  private scopeDirect(scope: TenantScope): {
    companyId?: string;
    branchId?: string | null;
  } {
    if (scope.level === "GLOBAL" || !scope.companyId) {
      return {};
    }
    if (scope.level === "COMPANY") {
      return { companyId: scope.companyId };
    }
    return { companyId: scope.companyId, branchId: scope.branchId };
  }

  private scopeViaEmployee(scope: TenantScope): {
    employee?: { is: { companyId?: string; branchId?: string | null } };
  } {
    const inner = this.scopeDirect(scope);
    return Object.keys(inner).length ? { employee: { is: inner } } : {};
  }

  /**
   * scope สำหรับ query ตาราง Branch เอง
   *
   * ใช้ scopeDirect กับตารางนี้ไม่ได้ เพราะ Branch ไม่มีคอลัมน์ `branchId`
   * ตัวมันเองคือสาขา คีย์ที่ต้องเทียบจึงเป็น `id`
   * ของเดิมพัง (P2009) เฉพาะผู้ใช้ระดับสาขาเท่านั้น — ระดับบริษัท/GLOBAL
   * scopeDirect ไม่ใส่ branchId มาให้ จึงรอดมาโดยไม่มีใครเห็น
   */
  private scopeBranchSelf(scope: TenantScope): {
    companyId?: string;
    id?: string;
  } {
    if (scope.level === "GLOBAL" || !scope.companyId) {
      return {};
    }
    if (scope.level === "COMPANY" || !scope.branchId) {
      return { companyId: scope.companyId };
    }
    return { companyId: scope.companyId, id: scope.branchId };
  }

  private scopeCompany(scope: TenantScope): { companyId?: string } {
    if (scope.level === "GLOBAL" || !scope.companyId) {
      return {};
    }
    return { companyId: scope.companyId };
  }

  /** companyId/branchId ที่มีผลจริงตาม scope (ไว้ส่งต่อให้ helper ที่รับ filter) */
  private scopeIds(scope: TenantScope): {
    companyId?: string;
    branchId?: string;
  } {
    return {
      companyId: scope.level === "GLOBAL" ? undefined : scope.companyId ?? undefined,
      branchId:
        scope.level === "BRANCH" ? scope.branchId ?? undefined : undefined,
    };
  }

  async getOverview(scope: TenantScope) {
    const now = new Date();

    const currentMonthStart = this.startOfMonth(now);
    const nextMonthStart = this.addMonths(currentMonthStart, 1);
    const previousMonthStart = this.addMonths(currentMonthStart, -1);

    const months = this.getLastMonths(6, now);

    const [
      totalEmployees,
      previousEmployees,
      totalDepartments,
      previousDepartments,
      currentOpenLeaveRequests,
      previousOpenLeaveRequests,
      currentOtHours,
      previousOtHours,
      attendanceTrend,
      monthlyStats,
      departmentDistribution,
      recentRequests,
    ] = await Promise.all([
      this.countActiveEmployees(scope),
      this.countActiveEmployees(scope, {
        createdBefore: currentMonthStart,
      }),
      this.countDepartments(scope),
      this.countDepartments(scope, {
        createdBefore: currentMonthStart,
      }),
      this.countOpenLeaveRequests(scope),
      this.countOpenLeaveRequests(scope, {
        createdBefore: currentMonthStart,
      }),
      this.sumApprovedOtHours(scope, currentMonthStart, nextMonthStart),
      this.sumApprovedOtHours(scope, previousMonthStart, currentMonthStart),
      this.buildAttendanceTrend(scope, months),
      this.buildMonthlyStats(scope, months),
      this.buildDepartmentDistribution(scope),
      this.buildRecentRequests(scope),
    ]);

    const currentAttendanceRate = await this.calculateAttendanceRate(
      scope,
      currentMonthStart,
      nextMonthStart,
    );

    const previousAttendanceRate = await this.calculateAttendanceRate(
      scope,
      previousMonthStart,
      currentMonthStart,
    );

    return {
      generatedAt: new Date().toISOString(),

      summary: {
        totalEmployees: {
          value: totalEmployees,
          change: totalEmployees - previousEmployees,
          changeText: this.formatPeopleChange(
            totalEmployees - previousEmployees,
          ),
          trend: this.toTrend(totalEmployees - previousEmployees),
        },

        attendanceRate: {
          value: currentAttendanceRate,
          change: this.round(currentAttendanceRate - previousAttendanceRate, 1),
          changeText: this.formatPercentChange(
            currentAttendanceRate - previousAttendanceRate,
          ),
          trend: this.toTrend(currentAttendanceRate - previousAttendanceRate),
        },

        openLeaveRequests: {
          value: currentOpenLeaveRequests,
          change: currentOpenLeaveRequests - previousOpenLeaveRequests,
          changeText: this.formatCountChange(
            currentOpenLeaveRequests - previousOpenLeaveRequests,
          ),
          trend: this.toTrend(
            currentOpenLeaveRequests - previousOpenLeaveRequests,
          ),
        },

        departments: {
          value: totalDepartments,
          change: totalDepartments - previousDepartments,
          changeText:
            totalDepartments - previousDepartments === 0
              ? "เท่าเดิมจากเดือนก่อน"
              : this.formatCountChange(totalDepartments - previousDepartments),
          trend: this.toTrend(totalDepartments - previousDepartments),
        },

        totalOtHours: {
          value: currentOtHours,
          change: this.round(currentOtHours - previousOtHours, 1),
          changeText: this.formatHourChange(currentOtHours - previousOtHours),
          trend: this.toTrend(currentOtHours - previousOtHours),
        },
      },

      attendanceTrend,
      monthlyStats,
      departmentDistribution,
      recentRequests,

      insights: this.buildInsights({
        attendanceRateChange: currentAttendanceRate - previousAttendanceRate,
        otHoursChange: currentOtHours - previousOtHours,
        openLeaveChange: currentOpenLeaveRequests - previousOpenLeaveRequests,
      }),
    };
  }

  /* =========================================================
     BATCH 8 AGGREGATE DASHBOARD SUMMARY API
     ---------------------------------------------------------
     Backend is the source of truth. These methods return dashboard-ready
     summaries so frontend pages do not need to load 4-8 list endpoints and
     filter sensitive data in the browser.
  ========================================================= */

  async getMyDashboardSummary(currentUser: AuthenticatedUser) {
    const now = new Date();
    const today = this.startOfDay(now);
    const tomorrow = this.addDays(today, 1);
    const currentMonthStart = this.startOfMonth(now);
    const nextMonthStart = this.addMonths(currentMonthStart, 1);

    const employee = await this.prisma.employee.findFirst({
      where: {
        deletedAt: null,
        userId: currentUser.id,
      },
      select: this.employeeMiniSelect(),
    });

    const [attendanceToday, leaveRequestsThisMonth, overtimeRequestsThisMonth] =
      employee
        ? await Promise.all([
            this.prisma.attendanceLog.findMany({
              where: {
                deletedAt: null,
                employeeId: employee.id,
                workDate: {
                  gte: today,
                  lt: tomorrow,
                },
                status: {
                  not: AttendanceLogStatus.CANCELLED,
                },
              },
              orderBy: {
                logTime: "asc",
              },
              take: 20,
            }),
            this.prisma.leaveRequest.count({
              where: {
                deletedAt: null,
                employeeId: employee.id,
                startDate: {
                  gte: currentMonthStart,
                  lt: nextMonthStart,
                },
              },
            }),
            this.prisma.overtimeRequest.count({
              where: {
                deletedAt: null,
                employeeId: employee.id,
                workDate: {
                  gte: currentMonthStart,
                  lt: nextMonthStart,
                },
              },
            }),
          ])
        : [[], 0, 0];

    return {
      generatedAt: new Date().toISOString(),
      user: {
        id: currentUser.id,
        email: currentUser.email,
        displayName: currentUser.displayName,
        roles: currentUser.roles ?? [],
        permissions: currentUser.permissions ?? [],
      },
      employee,
      summary: {
        attendanceLogCountToday: attendanceToday.length,
        leaveRequestsThisMonth,
        overtimeRequestsThisMonth,
      },
      attendanceToday,
    };
  }

  async getHrDashboardSummary(scope: TenantScope) {
    const now = new Date();
    const today = this.getBangkokWorkDate(now);
    const currentMonthStart = this.startOfWorkMonth(today);
    const nextMonthStart = this.addWorkMonths(currentMonthStart, 1);
    const next30Days = this.addWorkDays(today, 31);
    const months = this.getLastWorkMonths(6, today);
    const scopeIds = this.scopeIds(scope);

    const newEmployeesWhere = {
      deletedAt: null,
      ...this.scopeDirect(scope),
      startDate: {
        gte: currentMonthStart,
        lt: nextMonthStart,
      },
    };

    const probationDueSoonWhere = {
      deletedAt: null,
      ...this.scopeCompany(scope),
      status: ProbationStatus.IN_PROGRESS,
      endDate: {
        gte: today,
        lt: next30Days,
      },
    };

    const hrReviewDashboardStatuses = [
      HrReviewStatus.REVIEWED,
      HrReviewStatus.PAYROLL_READY,
      HrReviewStatus.ON_HOLD,
    ];

    const [
      totalEmployees,
      activeEmployees,
      newEmployeesThisMonthCount,
      newEmployeesThisMonth,
      resignedThisMonth,
      attendanceLogs,
      checkInRows,
      lateRows,
      approvedLeaveRequestsToday,
      submittedOvertimeCount,
      submittedTimeAdjustCount,
      documentRequestsCount,
      pendingHrReviewCount,
      hrReviewItems,
      probationDueSoonCount,
      probationRecords,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: { deletedAt: null, ...this.scopeDirect(scope) },
      }),
      this.prisma.employee.count({ where: this.activeEmployeeWhere(scope) }),
      this.prisma.employee.count({ where: newEmployeesWhere }),
      this.prisma.employee.findMany({
        where: newEmployeesWhere,
        orderBy: { startDate: "desc" },
        take: 8,
        select: this.employeeMiniSelect(),
      }),
      this.prisma.employeeResignation.count({
        where: {
          ...this.scopeViaEmployee(scope),
          status: ResignationStatus.APPROVED,
          effectiveDate: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
      }),
      this.prisma.attendanceLog.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          workDate: today,
          status: {
            not: AttendanceLogStatus.CANCELLED,
          },
        },
        orderBy: { logTime: "desc" },
        take: 100,
        include: {
          employee: {
            select: this.attendanceEmployeeSelect(),
          },
        },
      }),
      this.prisma.attendanceLog.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          workDate: today,
          logType: AttendanceLogType.CHECK_IN,
          status: {
            not: AttendanceLogStatus.CANCELLED,
          },
        },
        distinct: ["employeeId"],
        select: {
          employeeId: true,
        },
      }),
      this.prisma.attendanceLog.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          workDate: today,
          status: AttendanceLogStatus.LATE,
        },
        distinct: ["employeeId"],
        select: {
          employeeId: true,
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: today },
          endDate: { gte: today },
        },
        distinct: ["employeeId"],
        select: {
          employeeId: true,
        },
      }),
      this.prisma.overtimeRequest.count({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: OvertimeRequestStatus.SUBMITTED,
          workDate: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
      }),
      this.prisma.timeAdjustRequest.count({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: TimeAdjustRequestStatus.SUBMITTED,
          requestedLogTime: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
      }),
      this.prisma.documentRequest.count({
        where: {
          deletedAt: null,
          ...this.scopeCompany(scope),
          status: DocumentRequestStatus.SUBMITTED,
        },
      }),
      this.prisma.hrReviewItem.count({
        where: {
          ...this.scopeCompany(scope),
          status: {
            in: hrReviewDashboardStatuses,
          },
        },
      }),
      this.findHrReviewDashboardItems({
        statuses: hrReviewDashboardStatuses,
        take: 8,
        companyId: scopeIds.companyId,
      }),
      this.prisma.probationRecord.count({
        where: probationDueSoonWhere,
      }),
      this.prisma.probationRecord.findMany({
        where: probationDueSoonWhere,
        orderBy: { endDate: "asc" },
        take: 8,
        include: {
          employee: {
            select: this.employeeMiniSelect(),
          },
        },
      }),
    ]);

    const checkInEmployeeIds = new Set(
      checkInRows.map((row) => row.employeeId),
    );
    const lateEmployeeIds = new Set(lateRows.map((row) => row.employeeId));
    const leaveTodayEmployeeIds = new Set(
      approvedLeaveRequestsToday.map((row) => row.employeeId),
    );
    const employeeIdsWithValidTodayStatus = new Set([
      ...checkInEmployeeIds,
      ...leaveTodayEmployeeIds,
    ]);

    const missingCheckInWhere = {
      ...this.activeEmployeeWhere(scope),
      id: {
        notIn: [...employeeIdsWithValidTodayStatus],
      },
    };

    const [missingCheckInTodayCount, missingCheckIn] = await Promise.all([
      this.prisma.employee.count({ where: missingCheckInWhere }),
      this.prisma.employee.findMany({
        where: missingCheckInWhere,
        orderBy: { employeeCode: "asc" },
        take: 8,
        select: this.employeeMiniSelect(),
      }),
    ]);

    const [departmentHeadcount, employeeStatus, monthlyTrend, monthBreakdown] =
      await Promise.all([
        this.buildDepartmentHeadcountGroups(scope),
        this.buildStatusHeadcountGroups(scope),
        this.buildHrDashboardMonthlyTrend(scope, months),
        this.buildHrMonthlyBreakdown(scope, currentMonthStart, nextMonthStart),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalEmployees,
        activeEmployees,
        newEmployeesThisMonth: newEmployeesThisMonthCount,
        resignedThisMonth,
        checkInToday: checkInEmployeeIds.size,
        lateToday: lateEmployeeIds.size,
        missingCheckInToday: missingCheckInTodayCount,
        leaveToday: leaveTodayEmployeeIds.size,
        submittedOvertime: submittedOvertimeCount,
        submittedTimeAdjust: submittedTimeAdjustCount,
        pendingDocuments: documentRequestsCount,
        pendingHrReview: pendingHrReviewCount,
        probationDueSoon: probationDueSoonCount,
      },
      charts: {
        departmentHeadcount,
        employeeStatus,
        attendanceToday: [
          {
            label: "เข้างานปกติ",
            value: Math.max(0, checkInEmployeeIds.size - lateEmployeeIds.size),
          },
          {
            label: "มาสาย",
            value: lateEmployeeIds.size,
          },
          {
            label: "ยังไม่พบเวลาเข้า",
            value: missingCheckInTodayCount,
          },
          {
            label: "ลาวันนี้",
            value: leaveTodayEmployeeIds.size,
          },
        ],
        requestQueue: [
          {
            label: "HR Review",
            value: pendingHrReviewCount,
          },
          {
            label: "OT รออนุมัติ",
            value: submittedOvertimeCount,
          },
          {
            label: "ขอแก้เวลา",
            value: submittedTimeAdjustCount,
          },
          {
            label: "คำขอเอกสาร",
            value: documentRequestsCount,
          },
        ],
        monthlyTrend,
        // ชุด "เดือนนี้" — คำขอ ใบลาแยกประเภท และสภาพการลงเวลา
        currentMonthLabel: this.formatThaiMonth(currentMonthStart),
        requestTypes: monthBreakdown.requestTypes,
        leaveByType: monthBreakdown.leaveByType,
        attendanceChannel: monthBreakdown.attendanceChannel,
        attendanceCondition: monthBreakdown.attendanceCondition,
      },
      newEmployeesThisMonth,
      missingCheckIn,
      attendanceLogs,
      hrReviewItems,
      probationRecords,
    };
  }

  /**
   * โครงสร้างรายได้/รายการหักของงวดที่คำนวณแล้วล่าสุดในปีนั้น
   * ------------------------------------------------------
   * แยก "รายได้ประจำ" (เงินเดือนฐาน) ออกจาก "ไม่ประจำ" (OT เบี้ยเลี้ยง โบนัส)
   * เพราะสองก้อนนี้บริหารคนละแบบ — ก้อนประจำคือภาระผูกพัน ก้อนไม่ประจำคือ
   * ส่วนที่กดได้ถ้าคุมงานดีขึ้น
   */
  private async buildPayrollComposition(runIds: string[]) {
    if (runIds.length === 0) {
      return { earnings: [], deductions: [] };
    }

    const groups = await this.prisma.payrollLine.groupBy({
      by: ["type", "sourceType"],
      where: { payrollItem: { runId: { in: runIds } } },
      _sum: { amount: true },
    });

    const earningLabels: Record<string, string> = {
      BASE_SALARY: "เงินเดือนประจำ",
      OVERTIME: "ค่าล่วงเวลา",
      ALLOWANCE: "เบี้ยเลี้ยง/ค่าตำแหน่ง",
      BONUS: "โบนัส/รางวัล",
      ATTENDANCE: "ปรับตามการทำงาน",
      ADJUSTMENT: "ปรับปรุงรายการ",
    };

    const deductionLabels: Record<string, string> = {
      TAX: "ภาษีหัก ณ ที่จ่าย",
      SOCIAL_SECURITY: "ประกันสังคม",
      ATTENDANCE: "หักจากเวลาทำงาน",
      LEAVE: "หักวันลาไม่รับค่าจ้าง",
      ADJUSTMENT: "ปรับปรุงรายการ",
    };

    const pick = (
      type: PayrollLineType,
      labels: Record<string, string>,
      fallback: string,
    ) =>
      groups
        .filter((group) => group.type === type)
        .map((group) => ({
          key: group.sourceType,
          label: labels[group.sourceType] ?? fallback,
          amount: this.round(this.toNumber(group._sum.amount)),
          /** รายได้ประจำ = ผูกพันทุกงวด ส่วนที่เหลือผันตามงาน */
          recurring: group.sourceType === "BASE_SALARY",
        }))
        .filter((row) => row.amount > 0)
        .sort((a, b) => b.amount - a.amount);

    return {
      earnings: pick(PayrollLineType.EARNING, earningLabels, "รายได้อื่น"),
      deductions: pick(PayrollLineType.DEDUCTION, deductionLabels, "รายการหักอื่น"),
    };
  }

  /**
   * เงินเดือน ภาษี และประกันสังคมรายเดือนของทั้งปี
   * ---------------------------------------------
   * แยกออกมาเป็น endpoint ของตัวเองแทนที่จะยัดรวมกับ hr/dashboard-summary
   * เพราะเป็นข้อมูลเงิน ต้องบังคับสิทธิ์ PAYROLL_READ ต่างหาก
   * คนที่เห็นแค่งาน HR ทั่วไปจะไม่ได้ payload ก้อนนี้ติดไปด้วย
   */
  async getHrPayrollSummary(scope: TenantScope, requestedYear?: number) {
    const today = this.getBangkokWorkDate(new Date());
    const companyWhere = this.scopeCompany(scope);

    const yearGroups = await this.prisma.payrollPeriod.groupBy({
      by: ["year"],
      where: { deletedAt: null, ...companyWhere },
      orderBy: { year: "desc" },
    });

    const availableYears = yearGroups.map((group) => group.year);
    const fallbackYear = availableYears[0] ?? today.getUTCFullYear();
    const year =
      requestedYear && availableYears.includes(requestedYear)
        ? requestedYear
        : fallbackYear;

    const periods = await this.prisma.payrollPeriod.findMany({
      where: { deletedAt: null, ...companyWhere, year },
      select: { id: true, month: true, status: true },
    });

    const runs = periods.length
      ? await this.prisma.payrollRun.findMany({
          where: {
            deletedAt: null,
            ...companyWhere,
            periodId: { in: periods.map((period) => period.id) },
            status: { not: PayrollRunStatus.CANCELLED },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            periodId: true,
            status: true,
            totalEmployees: true,
            totalEarnings: true,
            totalDeductions: true,
            totalNetPay: true,
          },
        })
      : [];

    // หนึ่งงวดควรมีรอบที่ใช้จริงรอบเดียว — เอารอบล่าสุดที่ยังไม่ถูกยกเลิก
    const runByPeriodId = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!runByPeriodId.has(run.periodId)) runByPeriodId.set(run.periodId, run);
    }

    const monthByPeriodId = new Map(
      periods.map((period) => [period.id, period.month]),
    );

    const activeRuns = [...runByPeriodId.values()];

    /*
     * ฐานเงินเดือนอยู่ที่ PayrollItem ส่วนภาษี/ประกันสังคมอยู่ที่ PayrollLine
     * ทั้งคู่ผูกกับรอบคำนวณ ไม่ใช่กับงวด จึงต้องถามเป็นรอบ ๆ ไป
     * (ปีหนึ่งมีไม่เกิน 12 รอบ จำนวน query จึงคงที่)
     */
    const runDetails = await Promise.all(
      activeRuns.map(async (run) => {
        const [itemSums, lineGroups] = await Promise.all([
          this.prisma.payrollItem.aggregate({
            where: { runId: run.id },
            _sum: { baseSalary: true, overtimeHours: true },
          }),
          this.prisma.payrollLine.groupBy({
            by: ["code"],
            where: {
              payrollItem: { runId: run.id },
              code: {
                in: ["TAX", "SOCIAL_SECURITY", "SOCIAL_SECURITY_EMPLOYER"],
              },
            },
            _sum: { amount: true },
          }),
        ]);

        const lineAmount = (code: string) =>
          this.toNumber(
            lineGroups.find((group) => group.code === code)?._sum.amount,
          );

        const totalEarnings = this.toNumber(run.totalEarnings);
        const baseSalary = this.toNumber(itemSums._sum.baseSalary);

        return {
          month: monthByPeriodId.get(run.periodId) ?? 0,
          status: run.status,
          employees: run.totalEmployees,
          baseSalary,
          // "รายรับอื่น" = ทุกอย่างที่ไม่ใช่ฐานเงินเดือน (OT เบี้ยเลี้ยง โบนัส ฯลฯ)
          otherEarnings: Math.max(0, this.round(totalEarnings - baseSalary)),
          totalEarnings,
          deductions: this.toNumber(run.totalDeductions),
          netPay: this.toNumber(run.totalNetPay),
          tax: lineAmount("TAX"),
          socialSecurityEmployee: lineAmount("SOCIAL_SECURITY"),
          socialSecurityEmployer: lineAmount("SOCIAL_SECURITY_EMPLOYER"),
        };
      }),
    );

    const months = Array.from({ length: 12 }, (_, index) => {
      const monthNo = index + 1;
      const detail = runDetails.find((item) => item.month === monthNo);
      const label = this.formatThaiMonthShort(new Date(Date.UTC(year, index, 1)));

      return {
        month: monthNo,
        label,
        hasRun: Boolean(detail),
        status: detail?.status ?? null,
        employees: detail?.employees ?? 0,
        baseSalary: detail?.baseSalary ?? 0,
        otherEarnings: detail?.otherEarnings ?? 0,
        deductions: detail?.deductions ?? 0,
        netPay: detail?.netPay ?? 0,
        tax: detail?.tax ?? 0,
        socialSecurityEmployee: detail?.socialSecurityEmployee ?? 0,
        socialSecurityEmployer: detail?.socialSecurityEmployer ?? 0,
      };
    });

    const sum = (pick: (row: (typeof months)[number]) => number) =>
      this.round(months.reduce((total, row) => total + pick(row), 0));

    /*
     * "เดือนล่าสุด" ต้องเป็นเดือนที่คำนวณออกมาเป็นเงินแล้วจริง ๆ
     * งวดที่เพิ่งเปิดยังเป็น DRAFT ยอดเป็นศูนย์ทั้งแถว ถ้าหยิบมาโชว์
     * ตัวเลขภาษี/ประกันสังคมบนหน้าจะกลายเป็น 0 ทั้งที่เดือนก่อนมีข้อมูล
     */
    const monthsDesc = [...months].reverse();
    const latest =
      monthsDesc.find((row) => row.hasRun && row.netPay > 0) ??
      monthsDesc.find((row) => row.hasRun) ??
      null;

    // โครงสร้างรายได้/รายหักคิดจากงวดล่าสุดที่มีเงินจริง ไม่ใช่ทั้งปีรวมกัน
    const latestRunId = latest
      ? activeRuns.find(
          (run) => monthByPeriodId.get(run.periodId) === latest.month,
        )?.id
      : undefined;

    const composition = await this.buildPayrollComposition(
      latestRunId ? [latestRunId] : [],
    );

    return {
      generatedAt: new Date().toISOString(),
      year,
      availableYears: availableYears.length ? availableYears : [year],
      months,
      totals: {
        baseSalary: sum((row) => row.baseSalary),
        otherEarnings: sum((row) => row.otherEarnings),
        deductions: sum((row) => row.deductions),
        netPay: sum((row) => row.netPay),
        tax: sum((row) => row.tax),
        socialSecurityEmployee: sum((row) => row.socialSecurityEmployee),
        socialSecurityEmployer: sum((row) => row.socialSecurityEmployer),
        // นับเฉพาะงวดที่คำนวณออกมาเป็นเงินแล้ว งวดที่เพิ่งเปิด (DRAFT) ยังไม่นับ
        runCount: months.filter((row) => row.netPay > 0).length,
        periodCount: periods.length,
      },
      latestMonth: latest,
      /* รอบที่ตัวเลข "งวดล่าสุด" มาจาก — ใช้ต่อยอดแยกรายสาขา/แผนกได้โดยไม่ต้อง
         ไล่หาซ้ำเอง ซึ่งเสี่ยงเลือกคนละรอบกับที่หน้าจอโชว์อยู่ */
      latestRunId: latestRunId ?? null,
      composition,
    };
  }

  /**
   * ค่าจ้างของ "วันเดียว" จากคนที่มาทำงานจริง
   * -------------------------------------------
   * เริ่มนับเมื่อ **เห็นเวลาเข้างานของคนนั้น** — มีสแกนเมื่อไรถือว่าวันนั้น
   * มีค่าแรงเต็มวัน แล้วค่อยหักสิ่งที่ระบบตั้งไว้ออก: มาสาย ลืมสแกน
   * ออกก่อนเวลา ขาดงานบางส่วน และวันลาที่ไม่รับค่าจ้าง (ลาเป็นชั่วโมงหัก
   * ตามชั่วโมงจริง ไม่ปัดเป็นครึ่งวัน)
   *
   * ที่ต้องยึด "มีสแกน" ไม่ใช่ "มีแถวสรุปเวลา": ตัวคำนวณเวลาสร้างแถวสรุป
   * ให้พนักงานทุกคนตั้งแต่ต้นวัน ถ้านับแถวสรุปเป็นการมาทำงาน เช้าวันที่ยัง
   * ไม่มีใครสแกนจะขึ้นเป็นค่าแรงของทั้งบริษัททันที
   *
   * ยอดหักทุกตัวอ่านจากสรุปรายวันที่เครื่องคำนวณเวลาทำไว้แล้ว (ADR-001)
   * ซึ่งคิดตามนโยบายเวลาที่ตั้งไว้ในระบบ ไม่ได้ตั้งกติกาใหม่ที่นี่ ส่วนวันลา
   * ถ้าสรุปรายวันยังไม่ได้คำนวณ จะถอยไปอ่านจากใบลาที่อนุมัติแล้วของวันนั้นแทน
   *
   * อัตราค่าแรงต่อวัน/ต่อชั่วโมงใช้ `resolveSalaryRates` ตัวเดียวกับเครื่อง
   * คิดเงินเดือน — พนักงานรายวันค่าแรง 500 ต้องได้ 500 ไม่ใช่ 500/30
   * ส่วนอัตรา OT ใช้ `rateMultiplier` จากนโยบายจริงของบริษัท ไม่ใช่ 1.5 ตายตัว
   */
  async getExecutiveDailyCost(
    scope: TenantScope,
    filters: { branchId?: string; date?: string; departmentId?: string } = {},
  ) {
    const workDate = this.resolveWorkDate(filters.date);

    const employeeWhere: Prisma.EmployeeWhereInput = {
      ...this.activeEmployeeWhere(scope),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };

    const [employees, summaries, leaves, otRequests, setting, policies] =
      await Promise.all([
        this.prisma.employee.findMany({
          where: employeeWhere,
          orderBy: { employeeCode: "asc" },
          select: {
            id: true,
            companyId: true,
            employeeTypeId: true,
            branchId: true,
            branch: { select: { id: true, nameTh: true } },
            departmentId: true,
            department: { select: { id: true, nameTh: true } },
            /* ค่าจ้างที่มีผล ณ วันนั้น ไม่ใช่ค่าล่าสุดเสมอไป — คนที่เพิ่งปรับ
               เงินเดือนเดือนนี้ ต้นทุนของเดือนก่อนต้องเป็นอัตราเก่า */
            compensations: {
              where: {
                deletedAt: null,
                status: MasterStatus.ACTIVE,
                effectiveDate: { lte: workDate },
                OR: [{ endDate: null }, { endDate: { gte: workDate } }],
              },
              orderBy: { effectiveDate: "desc" },
              take: 1,
              select: { baseSalary: true, salaryBasis: true },
            },
          },
        }),
        this.prisma.attendanceDailySummary.findMany({
          where: { ...this.scopeViaEmployee(scope), workDate },
          select: {
            employeeId: true,
            isAbsent: true,
            absentDays: true,
            absentDeductionAmount: true,
            unpaidLeaveDeductionAmount: true,
            latePenaltyAmount: true,
            missingLogPenaltyAmount: true,
            earlyCheckoutPenaltyAmount: true,
            totalLateMinutes: true,
            paidLeaveMinutes: true,
            unpaidLeaveMinutes: true,
            payableOtMinutes: true,
            approvedOtMinutes: true,
            morningInAt: true,
            afternoonInAt: true,
            checkOutAt: true,
          },
        }),
        /* ใบลาที่ครอบวันนั้น — ใช้เป็นแหล่งสำรองเมื่อสรุปรายวันยังไม่ถูก
           คำนวณ และเป็นตัวบอกว่าลาแบบได้รับค่าจ้างหรือไม่ */
        this.prisma.leaveRequest.findMany({
          where: {
            deletedAt: null,
            ...this.scopeViaEmployee(scope),
            status: LeaveRequestStatus.APPROVED,
            startDate: { lte: workDate },
            endDate: { gte: workDate },
          },
          select: {
            employeeId: true,
            dayType: true,
            totalMinutes: true,
            leaveType: { select: { isPaid: true } },
          },
        }),
        this.prisma.overtimeRequest.findMany({
          where: {
            deletedAt: null,
            ...this.scopeViaEmployee(scope),
            status: OvertimeRequestStatus.APPROVED,
            workDate,
          },
          select: { employeeId: true, totalHours: true, workType: true },
        }),
        scope.companyId
          ? this.prisma.companyPayrollSetting.findFirst({
              where: { companyId: scope.companyId },
              select: { salaryDivisorDays: true, workingHoursPerDay: true },
            })
          : null,
        this.prisma.overtimePolicy.findMany({
          where: {
            deletedAt: null,
            status: MasterStatus.ACTIVE,
            ...(scope.companyId ? { companyId: scope.companyId } : {}),
          },
          select: {
            amountRoundingMode: true,
            branchId: true,
            companyId: true,
            employeeTypeId: true,
            rateMultiplier: true,
            workType: true,
          },
        }),
      ]);

    const salaryDivisorDays =
      setting?.salaryDivisorDays && setting.salaryDivisorDays > 0
        ? setting.salaryDivisorDays
        : 30;
    const workingHoursPerDay =
      setting?.workingHoursPerDay && setting.workingHoursPerDay > 0
        ? setting.workingHoursPerDay
        : 8;
    const minutesPerDay = workingHoursPerDay * 60;

    const summaryByEmployeeId = new Map(
      summaries.map((summary) => [summary.employeeId, summary]),
    );

    /* วันลาของแต่ละคนจากใบลา — ใช้เมื่อสรุปรายวันยังไม่มีตัวเลขลาให้
       ลาเป็นชั่วโมงคิดตามนาทีจริง ครึ่งวันคิด 0.5 ที่เหลือคิดเต็มวัน */
    const leaveDaysFromRequests = new Map<
      string,
      { paid: number; unpaid: number }
    >();
    for (const leave of leaves) {
      const days =
        String(leave.dayType) === "HOURLY"
          ? Math.min(1, this.toNumber(leave.totalMinutes) / minutesPerDay)
          : String(leave.dayType).startsWith("HALF_DAY")
            ? 0.5
            : 1;
      const bucket = leaveDaysFromRequests.get(leave.employeeId) ?? {
        paid: 0,
        unpaid: 0,
      };

      if (leave.leaveType?.isPaid === false) bucket.unpaid += days;
      else bucket.paid += days;

      leaveDaysFromRequests.set(leave.employeeId, bucket);
    }

    const otByEmployeeId = new Map<
      string,
      { hours: number; workType: string }[]
    >();
    for (const request of otRequests) {
      const rows = otByEmployeeId.get(request.employeeId) ?? [];
      rows.push({
        hours: this.toNumber(request.totalHours),
        workType: String(request.workType),
      });
      otByEmployeeId.set(request.employeeId, rows);
    }

    const counts = {
      absent: 0,
      late: 0,
      leavePaid: 0,
      leaveUnpaid: 0,
      overtime: 0,
      total: employees.length,
      worked: 0,
    };

    const amounts = {
      absence: 0,
      late: 0,
      leave: 0,
      overtime: 0,
      timePenalty: 0,
      unpaidLeave: 0,
      worked: 0,
    };

    let overtimeHours = 0;
    let lateMinutes = 0;
    let paidLeaveHours = 0;
    let unpaidLeaveHours = 0;
    let missingWage = 0;
    /* คนที่มีชั่วโมง OT จ่ายได้ แต่ยังไม่มีนโยบายอัตราให้ใช้ — ยอดค่าล่วงเวลา
       จะขาดไปเท่ากับคนกลุ่มนี้ จอต้องบอก ไม่ใช่เดาอัตราแล้วเงียบ */
    let missingOtPolicy = 0;
    /* จำนวน "วันคน" ที่มีค่าแรงจริง ใช้หาค่าเฉลี่ยต่อคนโดยไม่เพี้ยนเพราะครึ่งวัน */
    let paidDays = 0;

    type Unit = {
      deduction: number;
      id: string | null;
      label: string;
      leave: number;
      overtime: number;
      people: number;
      total: number;
      worked: number;
    };

    const branchUnits = new Map<string, Unit>();
    const departmentUnits = new Map<string, Unit>();

    const addUnit = (
      units: Map<string, Unit>,
      id: string | null,
      label: string,
      row: {
        deduction: number;
        leave: number;
        overtime: number;
        worked: number;
      },
    ) => {
      const key = id ?? label;
      const unit = units.get(key) ?? {
        deduction: 0,
        id,
        label,
        leave: 0,
        overtime: 0,
        people: 0,
        total: 0,
        worked: 0,
      };

      unit.deduction += row.deduction;
      unit.leave += row.leave;
      unit.overtime += row.overtime;
      unit.worked += row.worked;
      unit.people += 1;
      unit.total += row.worked + row.leave + row.overtime - row.deduction;
      units.set(key, unit);
    };

    for (const employee of employees) {
      const compensation = employee.compensations[0] ?? null;
      const summary = summaryByEmployeeId.get(employee.id) ?? null;
      const requested = leaveDaysFromRequests.get(employee.id) ?? null;
      const rates = resolveSalaryRates(
        this.toNumber(compensation?.baseSalary),
        { salaryDivisorDays, workingHoursPerDay },
        compensation?.salaryBasis,
      );

      /* สรุปรายวันมาก่อนเสมอ (เป็นตัวที่ payroll ใช้) ใบลาเป็นแหล่งสำรอง */
      const summaryPaidDays = this.toNumber(summary?.paidLeaveMinutes) / minutesPerDay;
      const summaryUnpaidDays =
        this.toNumber(summary?.unpaidLeaveMinutes) / minutesPerDay;
      const paidLeaveDays =
        summaryPaidDays > 0 ? summaryPaidDays : (requested?.paid ?? 0);
      const unpaidLeaveDays =
        summaryUnpaidDays > 0 ? summaryUnpaidDays : (requested?.unpaid ?? 0);

      const absentDays = this.toNumber(summary?.absentDays);
      /* "มาทำงาน" = มีเวลาสแกนของวันนั้นจริง ไม่ใช่แค่มีแถวสรุป */
      const present = Boolean(
        summary?.morningInAt ?? summary?.afternoonInAt ?? summary?.checkOutAt,
      );
      const monthlyBasis = deductsWholeDayAbsence(compensation?.salaryBasis);

      if (present) counts.worked += 1;
      if (summary?.isAbsent || absentDays > 0) counts.absent += 1;
      if (paidLeaveDays > 0) counts.leavePaid += 1;
      if (unpaidLeaveDays > 0) counts.leaveUnpaid += 1;

      /*
       * เห็นเวลาเข้างานเมื่อไร = เริ่มคิดค่าแรงของวันนั้นทันที
       *
       * รายเดือนได้เต็มวันแล้วค่อยหักตามที่ระบบคำนวณไว้ ส่วนรายวัน/รายชั่วโมง
       * ได้ตามส่วนที่ทำงานจริงอยู่แล้ว จึงไม่มีอะไรให้หักซ้ำอีก
       * (`deductsWholeDayAbsence` เป็นตัวเดียวกับที่ payroll ใช้ตัดสิน)
       */
      const workedDays = present
        ? monthlyBasis
          ? 1
          : Math.min(1, Math.max(0, 1 - absentDays - unpaidLeaveDays))
        : 0;
      const workedWage = rates.exactDailyRate * workedDays;

      /* ลารับค่าจ้างของคนที่ไม่ได้มา — จ่ายจริงแต่ไม่มีคนอยู่หน้างาน
         คนที่มาทำงานแล้วลาบางส่วนไม่ต้องบวกซ้ำ เพราะค่าแรงเต็มวันคลุมอยู่แล้ว */
      const leaveWage =
        !present && paidLeaveDays > 0
          ? rates.exactDailyRate * Math.min(1, paidLeaveDays)
          : 0;

      /* ยอดหักทั้งหมดใช้ของที่เครื่องคำนวณเวลาทำไว้ตามนโยบายที่ตั้งในระบบ
         ถ้ายังไม่ได้คำนวณยอดลาไม่รับค่าจ้าง ค่อยคิดจากอัตราต่อวันเป็นตัวสำรอง */
      const unpaidLeaveDeduction =
        present && monthlyBasis
          ? this.toNumber(summary?.unpaidLeaveDeductionAmount) ||
            rates.exactDailyRate * Math.min(1, unpaidLeaveDays)
          : 0;
      const absenceDeduction =
        present && monthlyBasis
          ? this.toNumber(summary?.absentDeductionAmount)
          : 0;
      const lateDeduction = present
        ? this.toNumber(summary?.latePenaltyAmount)
        : 0;
      const timePenalty = present
        ? this.toNumber(summary?.missingLogPenaltyAmount) +
          this.toNumber(summary?.earlyCheckoutPenaltyAmount)
        : 0;

      if (present) {
        lateMinutes += this.toNumber(summary?.totalLateMinutes);
        if (this.toNumber(summary?.totalLateMinutes) > 0) counts.late += 1;
      }

      if (workedDays > 0 && rates.exactDailyRate <= 0) missingWage += 1;

      paidLeaveHours += paidLeaveDays * workingHoursPerDay;
      unpaidLeaveHours += unpaidLeaveDays * workingHoursPerDay;
      paidDays += workedDays + (leaveWage > 0 ? Math.min(1, paidLeaveDays) : 0);

      /*
       * ชั่วโมง OT ที่จ่ายจริงอยู่ที่สรุปรายวัน (ผ่านกติกาปัดเศษ/ขั้นต่ำแล้ว)
       * แต่ "ประเภทวัน" ซึ่งเป็นตัวกำหนดอัตราอยู่ที่ใบคำขอ จึงเกลี่ยนาทีที่
       * จ่ายได้ลงตามสัดส่วนชั่วโมงของแต่ละใบ เพื่อให้ได้อัตราถูกใบถูกวัน
       */
      const payableHours =
        this.toNumber(summary?.payableOtMinutes) / 60 ||
        this.toNumber(summary?.approvedOtMinutes) / 60;
      const requests = otByEmployeeId.get(employee.id) ?? [];
      const requestHours = requests.reduce((sum, row) => sum + row.hours, 0);

      let overtimeAmount = 0;
      let withoutOtPolicy = false;
      if (payableHours > 0) {
        /* ไม่มีใบให้เกลี่ย = ถือเป็นวันทำงานปกติทั้งก้อน */
        const lines =
          requests.length > 0 && requestHours > 0
            ? requests.map((request) => ({
                hours: (request.hours / requestHours) * payableHours,
                workType: request.workType,
              }))
            : [{ hours: payableHours, workType: "WORKDAY" }];

        for (const line of lines) {
          const policy = pickOvertimePolicy(policies, {
            branchId: employee.branchId ?? null,
            companyId: employee.companyId ?? null,
            employeeTypeId: employee.employeeTypeId ?? null,
            workType: line.workType,
          });

          /*
           * ยังไม่ได้ตั้งนโยบายให้คนกลุ่มนี้ = ไม่รู้อัตรา ไม่ใช่ 1.5 ตามกฎหมาย
           *
           * เดิมตรงนี้เดาอัตราขั้นต่ำตามกฎหมายให้ ซึ่งทำให้ยอดบนจอไม่ตรงกับสลิป
           * ที่ payroll ออก (บริษัทที่ตั้งอัตราต่ำกว่าขั้นต่ำก็มีจริง) และไม่มี
           * อะไรบอกผู้ใช้ว่าตัวเลขนั้นมาจากการเดา
           */
          if (!policy) {
            withoutOtPolicy = true;
            continue;
          }

          overtimeAmount += applyOvertimeAmountRounding(
            line.hours *
              rates.exactHourlyRate *
              this.toNumber(policy.rateMultiplier),
            policy.amountRoundingMode as OvertimeAmountRoundingModeValue,
          );
        }

        if (withoutOtPolicy) missingOtPolicy += 1;

        overtimeHours += payableHours;
        counts.overtime += 1;
      }

      amounts.worked += workedWage;
      amounts.leave += leaveWage;
      amounts.overtime += overtimeAmount;
      amounts.unpaidLeave += unpaidLeaveDeduction;
      amounts.absence += absenceDeduction;
      amounts.late += lateDeduction;
      amounts.timePenalty += timePenalty;

      const deduction =
        unpaidLeaveDeduction + absenceDeduction + lateDeduction + timePenalty;

      /* หน่วยงานนับเฉพาะคนที่มีเงินในวันนั้น ไม่งั้นสาขาที่หยุดทั้งสาขาจะโผล่
         มาเป็นแถวยอดศูนย์ */
      if (workedWage + leaveWage + overtimeAmount > 0) {
        const row = {
          deduction,
          leave: leaveWage,
          overtime: overtimeAmount,
          worked: workedWage,
        };

        addUnit(
          branchUnits,
          employee.branch?.id ?? null,
          employee.branch?.nameTh ?? "ไม่ระบุสาขา",
          row,
        );
        addUnit(
          departmentUnits,
          employee.department?.id ?? null,
          employee.department?.nameTh ?? "ไม่ระบุแผนก",
          row,
        );
      }
    }

    const deductionTotal =
      amounts.unpaidLeave + amounts.absence + amounts.late + amounts.timePenalty;
    const total =
      amounts.worked + amounts.leave + amounts.overtime - deductionTotal;

    const unitList = (units: Map<string, Unit>) =>
      [...units.values()]
        .map((unit) => ({
          ...unit,
          deduction: this.round(unit.deduction),
          leave: this.round(unit.leave),
          overtime: this.round(unit.overtime),
          total: this.round(unit.total),
          worked: this.round(unit.worked),
        }))
        .sort((left, right) => right.total - left.total);

    return {
      date: workDate.toISOString().slice(0, 10),
      counts,
      amounts: {
        absence: this.round(amounts.absence),
        deduction: this.round(deductionTotal),
        late: this.round(amounts.late),
        leave: this.round(amounts.leave),
        overtime: this.round(amounts.overtime),
        timePenalty: this.round(amounts.timePenalty),
        total: this.round(total),
        unpaidLeave: this.round(amounts.unpaidLeave),
        worked: this.round(amounts.worked),
      },
      lateMinutes: Math.round(lateMinutes),
      overtimeHours: this.round(overtimeHours),
      paidDays: this.round(paidDays),
      paidLeaveHours: this.round(paidLeaveHours),
      unpaidLeaveHours: this.round(unpaidLeaveHours),
      /* จำนวนคนที่มีค่าแรงในวันนั้นแต่ยังไม่มีบันทึกอัตราค่าจ้าง — ยอดรวมจะ
         ต่ำกว่าจริงเท่ากับคนกลุ่มนี้ จอต้องเตือน ไม่ใช่เงียบ */
      employeesWithoutWage: missingWage,
      /* จำนวนคนที่มี OT จ่ายได้แต่ยังไม่มีนโยบายอัตรา — ยอดค่าล่วงเวลาจะขาด */
      employeesWithoutOtPolicy: missingOtPolicy,
      salaryDivisorDays,
      workingHoursPerDay,
      byBranch: unitList(branchUnits),
      byDepartment: unitList(departmentUnits),
    };
  }

  /**
   * ต้นทุนค่าแรงของรอบคำนวณหนึ่ง แยกตามสาขาและแผนก
   * ------------------------------------------------
   * ใช้ snapshot สาขา/แผนกที่ติดอยู่กับ PayrollItem เป็นหลัก เพราะเป็นหน่วยงาน
   * "ณ วันที่จ่ายเงิน" — คนที่ย้ายสาขาเดือนถัดมาต้องไม่ทำให้ยอดของงวดเก่าขยับ
   * ส่วนหน่วยงานปัจจุบันเป็นตัวสำรองสำหรับรอบเก่าที่คำนวณไว้ก่อนมีช่อง snapshot
   *
   * ไม่มีชื่อพนักงานหรือยอดรายคนออกไป — endpoint นี้เป็น "ภาพรวมค่าจ้าง"
   * ไม่ใช่ "เงินเดือนของใครคนหนึ่ง" (เหตุผลเดียวกับที่เขียนไว้ในตัว mapper)
   */
  async getPayrollUnitCost(runId?: string | null) {
    if (!runId) return { byBranch: [], byDepartment: [] };

    const items = await this.prisma.payrollItem.findMany({
      where: { runId },
      select: {
        branchId: true,
        branchName: true,
        departmentId: true,
        departmentName: true,
        totalEarnings: true,
        totalNetPay: true,
        employee: {
          select: {
            branchId: true,
            branch: { select: { nameTh: true } },
            departmentId: true,
            department: { select: { nameTh: true } },
          },
        },
      },
    });

    const group = (
      pick: (item: (typeof items)[number]) => {
        id: string | null;
        label: string;
      },
    ) => {
      const buckets = new Map<
        string,
        { id: string | null; label: string; people: number; netPay: number; earnings: number }
      >();

      for (const item of items) {
        const { id, label } = pick(item);
        const key = id ?? label;
        const row = buckets.get(key) ?? {
          id,
          label,
          people: 0,
          netPay: 0,
          earnings: 0,
        };

        row.people += 1;
        row.netPay += this.toNumber(item.totalNetPay);
        row.earnings += this.toNumber(item.totalEarnings);
        buckets.set(key, row);
      }

      return [...buckets.values()]
        .map((row) => ({
          ...row,
          netPay: this.round(row.netPay),
          earnings: this.round(row.earnings),
        }))
        .sort((left, right) => right.netPay - left.netPay);
    };

    return {
      byBranch: group((item) => ({
        id: item.branchId ?? item.employee?.branchId ?? null,
        label:
          item.branchName ?? item.employee?.branch?.nameTh ?? "ไม่ระบุสาขา",
      })),
      byDepartment: group((item) => ({
        id: item.departmentId ?? item.employee?.departmentId ?? null,
        label:
          item.departmentName ??
          item.employee?.department?.nameTh ??
          "ไม่ระบุแผนก",
      })),
    };
  }

  /**
   * ใครมา ใครลา ใครสาย "วันนี้" รายคน
   * ---------------------------------
   * ผู้บริหารเปิดดูแล้วต้องเห็นชื่อคนได้เลย ไม่ใช่เห็นแค่ยอดรวม
   * กรองตามแผนก/สาขา/สถานะได้ และเรียงคนที่มีปัญหาขึ้นก่อนเสมอ
   */
  async getExecutiveAttendanceToday(
    scope: TenantScope,
    filters: {
      departmentId?: string;
      branchId?: string;
      status?: string;
      /**
       * วันที่ต้องการดู (YYYY-MM-DD) — ไม่ส่งมาคือ "วันนี้" ตามเวลากรุงเทพ
       *
       * มีไว้ให้จอ "ลา/โอที รายวัน" ของผู้บริหารเลื่อนดูย้อนหลังได้ ไม่ใช่
       * ผูกกับวันนี้อย่างเดียวเหมือนตอนที่จอนี้มีแค่ผู้ใช้รายเดียว
       */
      date?: string;
    } = {},
  ) {
    const today = this.resolveWorkDate(filters.date);
    const hoursPerDay = await this.getWorkingHoursPerDay(scope);

    const employeeWhere: Prisma.EmployeeWhereInput = {
      ...this.activeEmployeeWhere(scope),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };

    const [employees, summaries, logs, leaves, otRequests, departments, branches] =
      await Promise.all([
        this.prisma.employee.findMany({
          where: employeeWhere,
          orderBy: { employeeCode: "asc" },
          select: {
            id: true,
            employeeCode: true,
            nickname: true,
            title: true,
            firstName: true,
            lastName: true,
            position: true,
            department: { select: { id: true, nameTh: true } },
            branch: { select: { id: true, nameTh: true } },
            /* รูปโปรไฟล์อยู่ที่ User ไม่ใช่ Employee — พนักงานที่ยังไม่มีบัญชี
               ผู้ใช้จึงไม่มีรูป แอปต้องมีตัวสำรอง (อักษรย่อ) เสมอ */
            user: { select: { avatarUrl: true } },
          },
        }),
        /*
         * ใช้สรุปรายวันเป็นแหล่งหลัก เพราะเป็นตัวเดียวกับที่หน้า "ตรวจเวลาทำงานรายวัน"
         * ใช้ จึงได้ครบทั้งเข้าเช้า/เข้าบ่าย/ออกงาน และนาทีสายที่ผ่านกติกากะแล้ว
         */
        this.prisma.attendanceDailySummary.findMany({
          where: { ...this.scopeViaEmployee(scope), workDate: today },
          select: {
            employeeId: true,
            morningInAt: true,
            afternoonInAt: true,
            checkOutAt: true,
            totalLateMinutes: true,
            hasMissingLog: true,
            isMorningMissing: true,
            isAfternoonMissing: true,
            isCheckoutMissing: true,
            /* โอทีที่อนุมัติแล้วของวันนั้น — จอ "ลา/โอที รายวัน" ใช้ตัวนี้
               เป็นแหล่งเดียวกับที่ตัวชี้วัดรายเดือนใช้ ตัวเลขจึงตรงกันเสมอ */
            approvedOtMinutes: true,
          },
        }),
        // สำรองไว้เผื่อยังไม่ได้คำนวณสรุปของวันนี้ (ตัวคำนวณทำงานเป็นคิว)
        this.prisma.attendanceLog.findMany({
          where: {
            deletedAt: null,
            ...this.scopeViaEmployee(scope),
            workDate: today,
            status: { not: AttendanceLogStatus.CANCELLED },
          },
          orderBy: { logTime: "asc" },
          select: {
            employeeId: true,
            logType: true,
            logTime: true,
            status: true,
          },
        }),
        /*
         * นับใบลาของวันนั้นตั้งแต่ "ยื่นแล้ว" ไม่ต้องรออนุมัติ (ลูกค้าเลือกกติกานี้)
         *
         * ต้องใช้ชุดสถานะเดียวกับยอด "ลาวันนี้" ของห้องผู้บริหาร ไม่งั้นตัวเลข
         * สรุปกับรายชื่อที่กดเข้ามาดูจะไม่ตรงกัน แล้วไม่มีใครรู้ว่าอันไหนถูก
         */
        this.prisma.leaveRequest.findMany({
          where: {
            deletedAt: null,
            ...this.scopeViaEmployee(scope),
            status: {
              in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.APPROVED],
            },
            startDate: { lte: today },
            endDate: { gte: today },
          },
          select: {
            id: true,
            employeeId: true,
            startDate: true,
            endDate: true,
            totalDays: true,
            totalMinutes: true,
            dayType: true,
            startTime: true,
            endTime: true,
            approvedAt: true,
            reason: true,
            createdAt: true,
            leaveType: { select: { nameTh: true, nameEn: true, code: true } },
          },
        }),
        /* ใบโอทีของวันนั้น — ใช้ทำรายละเอียดในป๊อปอัพ (ยื่นเมื่อไร กี่โมงถึงกี่โมง)
           ส่วนชั่วโมงที่โชว์เป็นตัวเลขหลักยังมาจากสรุปรายวันเหมือนเดิม
           เพื่อให้ตรงกับตัวเลขที่ใช้คิดเงิน */
        this.prisma.overtimeRequest.findMany({
          where: {
            deletedAt: null,
            ...this.scopeViaEmployee(scope),
            status: OvertimeRequestStatus.APPROVED,
            workDate: today,
          },
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            employeeId: true,
            startTime: true,
            endTime: true,
            totalHours: true,
            workType: true,
            approvedAt: true,
            reason: true,
            createdAt: true,
          },
        }),
        this.prisma.department.findMany({
          where: { deletedAt: null, ...this.scopeDirect(scope) },
          orderBy: { code: "asc" },
          select: { id: true, code: true, nameTh: true },
        }),
        this.prisma.branch.findMany({
          where: { deletedAt: null, ...this.scopeBranchSelf(scope) },
          orderBy: { code: "asc" },
          select: { id: true, code: true, nameTh: true },
        }),
      ]);

    const summaryByEmployee = new Map(
      summaries.map((row) => [row.employeeId, row]),
    );

    /**
     * รายละเอียดใบคำขอต่อคน — ใช้เปิดป๊อปอัพรายละเอียด
     *
     * ส่งเป็นอาเรย์เพราะคนหนึ่งมีได้หลายใบในวันเดียว (ลาเช้ากับบ่ายคนละใบ
     * หรือโอทีสองช่วง) การส่งใบเดียวจะทำให้ป๊อปอัพโกหกว่ามีแค่ใบนั้น
     */
    const requestsByEmployee = new Map<
      string,
      {
        id: string;
        kind: "LEAVE" | "OT";
        label: string;
        from: string;
        to: string;
        amount: number;
        reason: string;
        submittedAt: string;
        /** อนุมัติเมื่อไร — null เมื่อระบบบันทึกให้โดยไม่ผ่านสายอนุมัติ */
        approvedAt: string | null;
        /** เต็มวัน/ครึ่งวัน ของใบลา หรือ วันทำงาน/วันหยุด ของใบโอที */
        detail: string | null;
        /** ช่วงเวลาในวัน (ใบลาบางส่วนของวัน) เช่น "13:00–17:00" */
        clock: string | null;
      }[]
    >();

    const pushRequest = (
      employeeId: string,
      request: {
        id: string;
        kind: "LEAVE" | "OT";
        label: string;
        from: string;
        to: string;
        amount: number;
        reason: string;
        submittedAt: string;
        approvedAt: string | null;
        detail: string | null;
        clock: string | null;
      },
    ) => {
      const list = requestsByEmployee.get(employeeId) ?? [];

      list.push(request);
      requestsByEmployee.set(employeeId, list);
    };

    for (const leave of leaves) {
      pushRequest(leave.employeeId, {
        id: leave.id,
        kind: "LEAVE",
        label:
          leave.leaveType?.nameTh ||
          leave.leaveType?.nameEn ||
          leave.leaveType?.code ||
          "ลางาน",
        from: leave.startDate.toISOString(),
        to: leave.endDate.toISOString(),
        /* ใบที่ระบุนาทีไว้ใช้ค่าตรง ๆ ส่วนใบที่บอกเป็นวันค่อยคูณชั่วโมงทำงาน
           ต่อวันของบริษัท — แม่นกว่าการคูณทุกใบด้วยค่าเดียว */
        amount:
          leave.totalMinutes > 0
            ? Math.round((leave.totalMinutes / 60) * 100) / 100
            : Math.round(Number(leave.totalDays ?? 0) * hoursPerDay * 100) / 100,
        reason: leave.reason,
        submittedAt: leave.createdAt.toISOString(),
        approvedAt: leave.approvedAt?.toISOString() ?? null,
        detail: LEAVE_DAY_TYPE_LABEL[leave.dayType] ?? null,
        clock:
          leave.startTime && leave.endTime
            ? `${leave.startTime}–${leave.endTime}`
            : null,
      });
    }

    for (const request of otRequests) {
      pushRequest(request.employeeId, {
        id: request.id,
        kind: "OT",
        label: "ทำโอที",
        from: request.startTime.toISOString(),
        to: request.endTime.toISOString(),
        amount: Number(request.totalHours ?? 0),
        reason: request.reason,
        submittedAt: request.createdAt.toISOString(),
        approvedAt: request.approvedAt?.toISOString() ?? null,
        detail: OVERTIME_WORK_TYPE_LABEL[request.workType] ?? null,
        clock: null,
      });
    }

    const leaveByEmployee = new Map(
      leaves.map((leave) => [
        leave.employeeId,
        leave.leaveType?.nameTh ||
          leave.leaveType?.nameEn ||
          leave.leaveType?.code ||
          "ลางาน",
      ]),
    );

    type FallbackLogs = {
      checkIns: Date[];
      checkOutAt: Date | null;
      late: boolean;
    };

    const logByEmployee = new Map<string, FallbackLogs>();

    for (const log of logs) {
      const info = logByEmployee.get(log.employeeId) ?? {
        checkIns: [],
        checkOutAt: null,
        late: false,
      };

      if (log.logType === AttendanceLogType.CHECK_IN) {
        info.checkIns.push(log.logTime);
      }
      if (log.logType === AttendanceLogType.CHECK_OUT) {
        info.checkOutAt = log.logTime;
      }
      if (log.status === AttendanceLogStatus.LATE) info.late = true;

      logByEmployee.set(log.employeeId, info);
    }

    const rows = employees.map((employee) => {
      const summary = summaryByEmployee.get(employee.id);
      const fallback = logByEmployee.get(employee.id);
      const leaveLabel = leaveByEmployee.get(employee.id);

      const morningInAt = summary?.morningInAt ?? fallback?.checkIns[0] ?? null;
      const afternoonInAt =
        summary?.afternoonInAt ?? fallback?.checkIns[1] ?? null;
      const checkOutAt = summary?.checkOutAt ?? fallback?.checkOutAt ?? null;

      const lateMinutes = summary
        ? summary.totalLateMinutes
        : fallback?.late
          ? null // มี log ว่าสายแต่ยังไม่รู้กี่นาที (สรุปรายวันยังไม่คำนวณ)
          : 0;

      const hasTime = Boolean(morningInAt || afternoonInAt || checkOutAt);

      /*
       * "มาสาย" เป็นคุณสมบัติของคนที่มาทำงาน ไม่ใช่สถานะแยก
       * ของเดิมแยกเป็นคนละถัง คนที่มาสายเลยหายจากยอด "มาทำงาน"
       */
      const status = leaveLabel ? "LEAVE" : hasTime ? "PRESENT" : "ABSENT";
      const late = status === "PRESENT" && (lateMinutes === null || lateMinutes > 0);

      const missing = summary
        ? summary.hasMissingLog ||
          summary.isMorningMissing ||
          summary.isAfternoonMissing ||
          summary.isCheckoutMissing
        : status === "PRESENT" && !checkOutAt;

      /* ชั่วโมงทศนิยม ไม่ใช่นาที — ผู้บริหารอ่าน "1.5 ชม." ง่ายกว่า "90 นาที" */
      const otHours = summary
        ? Math.round((summary.approvedOtMinutes / 60) * 100) / 100
        : 0;

      return {
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: [employee.title, employee.firstName, employee.lastName]
          .filter(Boolean)
          .join(" "),
        position: employee.position,
        departmentId: employee.department?.id ?? null,
        department: employee.department?.nameTh ?? null,
        branchId: employee.branch?.id ?? null,
        branch: employee.branch?.nameTh ?? null,
        avatarUrl: employee.user?.avatarUrl ?? null,
        status,
        late,
        lateMinutes,
        hasMissingLog: missing,
        leaveType: leaveLabel ?? null,
        requests: requestsByEmployee.get(employee.id) ?? [],
        otHours,
        morningInAt: morningInAt?.toISOString() ?? null,
        afternoonInAt: afternoonInAt?.toISOString() ?? null,
        checkOutAt: checkOutAt?.toISOString() ?? null,
      };
    });

    /** เรียงตามความเร่งด่วน: ยังไม่มา -> มาสาย -> ลงเวลาไม่ครบ -> ลา -> ปกติ */
    const urgency = (row: (typeof rows)[number]) => {
      if (row.status === "ABSENT") return 0;
      if (row.late) return 1;
      if (row.hasMissingLog) return 2;
      if (row.status === "LEAVE") return 3;
      return 4;
    };

    rows.sort((a, b) => {
      const diff = urgency(a) - urgency(b);
      if (diff !== 0) return diff;
      return a.employeeCode.localeCompare(b.employeeCode);
    });

    const present = rows.filter((row) => row.status === "PRESENT");

    const otRows = rows.filter((row) => row.otHours > 0);

    const summaryCounts = {
      total: rows.length,
      present: present.length,
      late: present.filter((row) => row.late).length,
      missing: present.filter((row) => row.hasMissingLog).length,
      leave: rows.filter((row) => row.status === "LEAVE").length,
      absent: rows.filter((row) => row.status === "ABSENT").length,
      /* จำนวน "คนที่มีโอที" กับ "ชั่วโมงรวม" ต้องแยกกัน — 10 ชม. จากคนเดียว
         กับจาก 10 คน เป็นคนละเรื่องสำหรับคนที่ต้องอนุมัติต้นทุน */
      otPeople: otRows.length,
      otHours:
        Math.round(otRows.reduce((sum, row) => sum + row.otHours, 0) * 100) /
        100,
    };

    interface UnitBucket {
      label: string;
      total: number;
      present: number;
      late: number;
      leave: number;
      absent: number;
      otPeople: number;
      otHours: number;
    }

    const emptyBucket = (label: string): UnitBucket => ({
      label,
      total: 0,
      present: 0,
      late: 0,
      leave: 0,
      absent: 0,
      otPeople: 0,
      otHours: 0,
    });

    const accumulate = (bucket: UnitBucket, row: (typeof rows)[number]) => {
      bucket.total += 1;
      if (row.status === "PRESENT") {
        bucket.present += 1;
        if (row.late) bucket.late += 1;
      }
      if (row.status === "LEAVE") bucket.leave += 1;
      if (row.status === "ABSENT") bucket.absent += 1;
      if (row.otHours > 0) {
        bucket.otPeople += 1;
        bucket.otHours = Math.round((bucket.otHours + row.otHours) * 100) / 100;
      }
    };

    const byDepartment = new Map<string, UnitBucket>();
    const byBranch = new Map<string, UnitBucket>();

    for (const row of rows) {
      const departmentKey = row.departmentId ?? "__none__";
      const departmentBucket =
        byDepartment.get(departmentKey) ??
        emptyBucket(row.department ?? "ไม่ระบุแผนก");

      accumulate(departmentBucket, row);
      byDepartment.set(departmentKey, departmentBucket);

      const branchKey = row.branchId ?? "__none__";
      const branchBucket =
        byBranch.get(branchKey) ?? emptyBucket(row.branch ?? "ไม่ระบุสาขา");

      accumulate(branchBucket, row);
      byBranch.set(branchKey, branchBucket);
    }

    const statusFilter = filters.status?.trim().toUpperCase();
    const filtered =
      statusFilter === "LATE"
        ? rows.filter((row) => row.late)
        : statusFilter === "MISSING"
          ? rows.filter((row) => row.hasMissingLog)
          : statusFilter === "PRESENT" ||
              statusFilter === "LEAVE" ||
              statusFilter === "ABSENT"
            ? rows.filter((row) => row.status === statusFilter)
            : rows;

    return {
      generatedAt: new Date().toISOString(),
      workDate: today.toISOString().slice(0, 10),
      summary: summaryCounts,
      byDepartment: [...byDepartment.entries()]
        .map(([id, value]) => ({ id: id === "__none__" ? null : id, ...value }))
        .sort((a, b) => b.absent + b.late - (a.absent + a.late)),
      byBranch: [...byBranch.entries()]
        .map(([id, value]) => ({ id: id === "__none__" ? null : id, ...value }))
        .sort((a, b) => b.leave + b.otPeople - (a.leave + a.otPeople)),
      filterOptions: {
        departments: departments.map((item) => ({
          id: item.id,
          label: item.nameTh || item.code,
        })),
        branches: branches.map((item) => ({
          id: item.id,
          label: item.nameTh || item.code,
        })),
      },
      rows: filtered,
    };
  }

  /**
   * ลาและโอทีสะสม "ทั้งงวด" รายคน
   * -----------------------------
   * คนละคำถามกับจอรายวัน: รายวันถามว่า "วันนี้ใครไม่อยู่" ส่วนอันนี้ถามว่า
   * "ทั้งงวดใครลาเยอะ ใครทำโอทีเยอะ" — ตัวเลขจึงเป็นผลรวมของช่วง ไม่ใช่สถานะ
   * ณ วันเดียว (คนหนึ่งลาสามวันในงวดต้องนับเป็น 3 วัน ไม่ใช่ "ลา/ไม่ลา")
   *
   * ใช้ AttendanceDailySummary เป็นแหล่งเดียว เพราะมีทั้งวันลา
   * (`leaveDurationDays` รองรับลาครึ่งวัน) และนาทีโอทีที่อนุมัติแล้วอยู่ในแถว
   * เดียวกันต่อคนต่อวัน — groupBy ทีเดียวจบ ไม่ต้องยิงสองตารางแล้วมาจับคู่เอง
   */
  async getExecutiveLeaveOtPeriod(
    scope: TenantScope,
    filters: {
      from: string;
      to: string;
      branchId?: string;
      departmentId?: string;
    },
  ) {
    const from = this.resolveWorkDate(filters.from);
    const to = this.resolveWorkDate(filters.to);
    const hoursPerDay = await this.getWorkingHoursPerDay(scope);

    const employeeWhere: Prisma.EmployeeWhereInput = {
      ...this.activeEmployeeWhere(scope),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };

    const [employees, totals, leaves, otRequests] = await Promise.all([
      this.prisma.employee.findMany({
        where: employeeWhere,
        orderBy: { employeeCode: "asc" },
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          position: true,
          department: { select: { id: true, nameTh: true } },
          branch: { select: { id: true, nameTh: true } },
          user: { select: { avatarUrl: true } },
        },
      }),
      this.prisma.attendanceDailySummary.groupBy({
        by: ["employeeId"],
        where: {
          ...this.scopeViaEmployee(scope),
          workDate: { gte: from, lte: to },
        },
        _sum: { leaveDurationDays: true, approvedOtMinutes: true },
      }),
      /* ใบคำขอของทั้งช่วง — ใช้ทำรายละเอียดในป๊อปอัพ ตัวเลขสรุปยังมาจาก
         สรุปรายวันเหมือนเดิม (ใบลาหนึ่งใบกินหลายวัน จะเอามาบวกเป็นวันไม่ได้) */
      this.prisma.leaveRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: to },
          endDate: { gte: from },
        },
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          employeeId: true,
          startDate: true,
          endDate: true,
          totalDays: true,
          totalMinutes: true,
          dayType: true,
          startTime: true,
          endTime: true,
          approvedAt: true,
          reason: true,
          createdAt: true,
          leaveType: { select: { nameTh: true, nameEn: true, code: true } },
        },
      }),
      this.prisma.overtimeRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: OvertimeRequestStatus.APPROVED,
          workDate: { gte: from, lte: to },
        },
        orderBy: { startTime: "desc" },
        select: {
          id: true,
          employeeId: true,
          startTime: true,
          endTime: true,
          totalHours: true,
          workType: true,
          approvedAt: true,
          reason: true,
          createdAt: true,
        },
      }),
    ]);

    const requestsByEmployee = new Map<
      string,
      {
        id: string;
        kind: "LEAVE" | "OT";
        label: string;
        from: string;
        to: string;
        amount: number;
        reason: string;
        submittedAt: string;
        /** อนุมัติเมื่อไร — null เมื่อระบบบันทึกให้โดยไม่ผ่านสายอนุมัติ */
        approvedAt: string | null;
        /** เต็มวัน/ครึ่งวัน ของใบลา หรือ วันทำงาน/วันหยุด ของใบโอที */
        detail: string | null;
        /** ช่วงเวลาในวัน (ใบลาบางส่วนของวัน) เช่น "13:00–17:00" */
        clock: string | null;
      }[]
    >();

    const pushRequest = (
      employeeId: string,
      request: (typeof requestsByEmployee) extends Map<string, infer V>
        ? V extends (infer Item)[]
          ? Item
          : never
        : never,
    ) => {
      const list = requestsByEmployee.get(employeeId) ?? [];

      list.push(request);
      requestsByEmployee.set(employeeId, list);
    };

    for (const leave of leaves) {
      pushRequest(leave.employeeId, {
        id: leave.id,
        kind: "LEAVE",
        label:
          leave.leaveType?.nameTh ||
          leave.leaveType?.nameEn ||
          leave.leaveType?.code ||
          "ลางาน",
        from: leave.startDate.toISOString(),
        to: leave.endDate.toISOString(),
        amount: Number(leave.totalDays ?? 0),
        reason: leave.reason,
        submittedAt: leave.createdAt.toISOString(),
        approvedAt: leave.approvedAt?.toISOString() ?? null,
        detail: LEAVE_DAY_TYPE_LABEL[leave.dayType] ?? null,
        clock:
          leave.startTime && leave.endTime
            ? `${leave.startTime}–${leave.endTime}`
            : null,
      });
    }

    for (const request of otRequests) {
      pushRequest(request.employeeId, {
        id: request.id,
        kind: "OT",
        label: "ทำโอที",
        from: request.startTime.toISOString(),
        to: request.endTime.toISOString(),
        amount: Number(request.totalHours ?? 0),
        reason: request.reason,
        submittedAt: request.createdAt.toISOString(),
        approvedAt: request.approvedAt?.toISOString() ?? null,
        detail: OVERTIME_WORK_TYPE_LABEL[request.workType] ?? null,
        clock: null,
      });
    }

    const totalByEmployee = new Map(
      totals.map((row) => [
        row.employeeId,
        {
          leaveDays: Number(row._sum.leaveDurationDays ?? 0),
          otMinutes: row._sum.approvedOtMinutes ?? 0,
        },
      ]),
    );

    const rows = employees
      .map((employee) => {
        const total = totalByEmployee.get(employee.id);
        /* สรุปรายวันเก็บวันลาไว้เป็น "วัน" — คูณชั่วโมงทำงานต่อวันให้เป็นชั่วโมง
           เพื่อให้หน่วยตรงกับที่จอแสดง (และตรงกับใบคำขอในป๊อปอัพ) */
        const leaveHours =
          Math.round((total?.leaveDays ?? 0) * hoursPerDay * 100) / 100;
        const otHours = Math.round(((total?.otMinutes ?? 0) / 60) * 100) / 100;

        return {
          id: employee.id,
          employeeCode: employee.employeeCode,
          name: [employee.title, employee.firstName, employee.lastName]
            .filter(Boolean)
            .join(" "),
          position: employee.position,
          departmentId: employee.department?.id ?? null,
          department: employee.department?.nameTh ?? null,
          branchId: employee.branch?.id ?? null,
          branch: employee.branch?.nameTh ?? null,
          avatarUrl: employee.user?.avatarUrl ?? null,
          leaveHours,
          otHours,
          requests: requestsByEmployee.get(employee.id) ?? [],
        };
      })
      /* คนที่ไม่ลาและไม่มีโอทีเลยทั้งงวดไม่ต้องอยู่ในรายการ — จอนี้เปิดมาเพื่อดู
         "ใครมีรายการ" ไม่ใช่ทะเบียนพนักงานทั้งบริษัทที่ส่วนใหญ่เป็นศูนย์ */
      .filter((row) => row.leaveHours > 0 || row.otHours > 0);

    const round2 = (value: number) => Math.round(value * 100) / 100;

    const summary = {
      leavePeople: rows.filter((row) => row.leaveHours > 0).length,
      leaveHours: round2(rows.reduce((sum, row) => sum + row.leaveHours, 0)),
      otPeople: rows.filter((row) => row.otHours > 0).length,
      otHours: round2(rows.reduce((sum, row) => sum + row.otHours, 0)),
    };

    interface PeriodBucket {
      label: string;
      leavePeople: number;
      leaveHours: number;
      otPeople: number;
      otHours: number;
    }

    const bucketsOf = (
      keyOf: (row: (typeof rows)[number]) => string,
      labelOf: (row: (typeof rows)[number]) => string,
    ) => {
      const map = new Map<string, PeriodBucket>();

      for (const row of rows) {
        const key = keyOf(row);
        const bucket = map.get(key) ?? {
          label: labelOf(row),
          leavePeople: 0,
          leaveHours: 0,
          otPeople: 0,
          otHours: 0,
        };

        if (row.leaveHours > 0) {
          bucket.leavePeople += 1;
          bucket.leaveHours = round2(bucket.leaveHours + row.leaveHours);
        }
        if (row.otHours > 0) {
          bucket.otPeople += 1;
          bucket.otHours = round2(bucket.otHours + row.otHours);
        }

        map.set(key, bucket);
      }

      return [...map.entries()]
        .map(([id, value]) => ({ id: id === "__none__" ? null : id, ...value }))
        .sort((a, b) => b.otHours + b.leaveHours - (a.otHours + a.leaveHours));
    };

    return {
      generatedAt: new Date().toISOString(),
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      summary,
      byBranch: bucketsOf(
        (row) => row.branchId ?? "__none__",
        (row) => row.branch ?? "ไม่ระบุสาขา",
      ),
      byDepartment: bucketsOf(
        (row) => row.departmentId ?? "__none__",
        (row) => row.department ?? "ไม่ระบุแผนก",
      ),
      rows,
    };
  }

  /**
   * ตัวชี้วัดระดับผู้บริหาร
   * ----------------------
   * ต่างจาก Dashboard HR ตรงที่ไม่นับ "เหตุการณ์รายวัน" แต่คิดเป็น
   * อัตราส่วน · ต่อหัว · เทียบเดือนก่อน · และแยกรายหน่วยงาน
   * เพราะผู้บริหารบริหารผ่านหัวหน้าแต่ละหน่วย ต้องรู้ว่าปัญหาอยู่ที่หน่วยไหน
   *
   * แหล่งข้อมูล:
   *   AttendanceDailySummary — นาทีสาย วันขาด นาที OT วันลา และเงินที่หักจริง
   *   PayrollItem            — ต้นทุนจริงต่อคน (มี snapshot แผนกในตัว)
   *   EmployeeResignation    — คนออกเพื่อคิดอัตราลาออก
   */
  async getExecutiveInsights(scope: TenantScope) {
    const now = new Date();
    const today = this.getBangkokWorkDate(now);
    const monthStart = this.startOfWorkMonth(today);
    const nextMonthStart = this.addWorkMonths(monthStart, 1);
    const prevMonthStart = this.addWorkMonths(monthStart, -1);
    const months = this.getLastWorkMonths(6, today);

    const [departments, activeEmployees, current, previous, trend] =
      await Promise.all([
        this.prisma.department.findMany({
          where: { deletedAt: null, ...this.scopeDirect(scope) },
          select: { id: true, code: true, nameTh: true, nameEn: true },
        }),
        this.prisma.employee.findMany({
          where: this.activeEmployeeWhere(scope),
          select: { id: true, departmentId: true, startDate: true },
        }),
        this.buildExecutiveMonthMetrics(scope, monthStart, nextMonthStart),
        this.buildExecutiveMonthMetrics(scope, prevMonthStart, monthStart),
        Promise.all(
          this.getLastWorkMonths(6, today).map(async (month) => ({
            month: month.label,
            ...(await this.buildExecutiveMonthMetrics(
              scope,
              month.start,
              month.end,
            )),
          })),
        ),
      ]);

    const headcount = activeEmployees.length;
    const departmentById = new Map(
      departments.map((department) => [
        department.id,
        department.nameTh || department.nameEn || department.code,
      ]),
    );

    const headcountByDepartment = new Map<string, number>();
    for (const employee of activeEmployees) {
      const key = employee.departmentId ?? "__none__";
      headcountByDepartment.set(key, (headcountByDepartment.get(key) ?? 0) + 1);
    }

    // อายุงานเฉลี่ยของคนที่ยังอยู่ — ใช้ประเมินว่าองค์กรรักษาคนได้แค่ไหน
    const tenureMonths = activeEmployees
      .map((employee) => this.monthsBetween(employee.startDate, today))
      .filter((value) => value !== null) as number[];
    const avgTenureMonths = tenureMonths.length
      ? this.round(
          tenureMonths.reduce((sum, value) => sum + value, 0) /
            tenureMonths.length,
          1,
        )
      : 0;

    const [probationPassed, probationClosed] = await Promise.all([
      this.prisma.probationRecord.count({
        where: {
          deletedAt: null,
          ...this.scopeCompany(scope),
          status: ProbationStatus.PASSED,
        },
      }),
      this.prisma.probationRecord.count({
        where: {
          deletedAt: null,
          ...this.scopeCompany(scope),
          status: { in: [ProbationStatus.PASSED, ProbationStatus.FAILED] },
        },
      }),
    ]);

    const perHead = (value: number, people: number) =>
      people > 0 ? this.round(value / people, 1) : 0;

    const departmentRows = [...headcountByDepartment.entries()]
      .map(([departmentId, people]) => {
        const stats = current.byDepartment.get(departmentId) ?? {
          otMinutes: 0,
          lateMinutes: 0,
          absentDays: 0,
          workDays: 0,
          netPay: 0,
          resignations: 0,
        };

        return {
          id: departmentId === "__none__" ? null : departmentId,
          label:
            departmentId === "__none__"
              ? "ไม่ระบุแผนก"
              : (departmentById.get(departmentId) ?? "ไม่ระบุแผนก"),
          headcount: people,
          costPerHead: people > 0 ? this.round(stats.netPay / people) : 0,
          otHoursPerHead: perHead(stats.otMinutes / 60, people),
          lateMinutesPerHead: perHead(stats.lateMinutes, people),
          absenceRate:
            stats.workDays > 0
              ? this.round((stats.absentDays / stats.workDays) * 100, 1)
              : 0,
          turnoverRate:
            people > 0 ? this.round((stats.resignations / people) * 100, 1) : 0,
        };
      })
      .sort((a, b) => b.headcount - a.headcount);

    return {
      generatedAt: new Date().toISOString(),
      periodLabel: this.formatThaiMonth(monthStart),

      workforce: {
        headcount,
        avgTenureMonths,
        turnoverRate:
          headcount > 0
            ? this.round((current.resignations / headcount) * 100, 1)
            : 0,
        turnoverRatePrev:
          headcount > 0
            ? this.round((previous.resignations / headcount) * 100, 1)
            : 0,
        resigned: current.resignations,
        resignedPrev: previous.resignations,
        hired: current.hired,
        hiredPrev: previous.hired,
        probationPassRate:
          probationClosed > 0
            ? this.round((probationPassed / probationClosed) * 100, 1)
            : 0,
      },

      discipline: {
        absenceRate:
          current.workDays > 0
            ? this.round((current.absentDays / current.workDays) * 100, 2)
            : 0,
        absenceRatePrev:
          previous.workDays > 0
            ? this.round((previous.absentDays / previous.workDays) * 100, 2)
            : 0,
        lateMinutesPerHead: perHead(current.lateMinutes, headcount),
        lateMinutesPerHeadPrev: perHead(previous.lateMinutes, headcount),
        leaveDaysPerHead: perHead(current.leaveDays, headcount),
        leaveDaysPerHeadPrev: perHead(previous.leaveDays, headcount),
        penaltyAmount: this.round(current.penaltyAmount),
        penaltyAmountPrev: this.round(previous.penaltyAmount),
      },

      cost: {
        costPerHead: perHead(current.netPay, current.paidEmployees || headcount),
        costPerHeadPrev: perHead(
          previous.netPay,
          previous.paidEmployees || headcount,
        ),
        otHoursPerHead: perHead(current.otMinutes / 60, headcount),
        otHoursPerHeadPrev: perHead(previous.otMinutes / 60, headcount),
        otCostShare:
          current.earnings > 0
            ? this.round((current.otPay / current.earnings) * 100, 1)
            : 0,
        netPay: this.round(current.netPay),
        earnings: this.round(current.earnings),
        otPay: this.round(current.otPay),
      },

      departments: departmentRows,

      trend: trend.map((item) => ({
        month: item.month,
        costPerHead: perHead(item.netPay, item.paidEmployees || headcount),
        otHoursPerHead: perHead(item.otMinutes / 60, headcount),
        absenceRate:
          item.workDays > 0
            ? this.round((item.absentDays / item.workDays) * 100, 2)
            : 0,
        turnoverRate:
          headcount > 0
            ? this.round((item.resignations / headcount) * 100, 2)
            : 0,
      })),
    };
  }

  /**
   * ตัวเลขดิบของ "หนึ่งเดือน" ที่ตัวชี้วัดผู้บริหารต้องใช้
   * แยกออกมาเพราะต้องคิดซ้ำหลายรอบ (เดือนนี้ เดือนก่อน และย้อนหลัง 6 เดือน)
   */
  private async buildExecutiveMonthMetrics(
    scope: TenantScope,
    start: Date,
    end: Date,
  ) {
    const [summaryRows, employees, resignationRows, hired, runs] =
      await Promise.all([
        this.prisma.attendanceDailySummary.groupBy({
          by: ["employeeId"],
          where: {
            ...this.scopeViaEmployee(scope),
            workDate: { gte: start, lt: end },
          },
          _sum: {
            totalLateMinutes: true,
            absentDays: true,
            approvedOtMinutes: true,
            leaveDurationDays: true,
            /*
             * ค่าปรับด้านวินัยครบทุกก้อน — เดิมรวมแค่ "มาสาย" กับ "ขาดงาน"
             * ยอด "เงินหักจากวินัย" บนห้องผู้บริหารจึงต่ำกว่าที่หักจริง
             *
             * `missingLogPenaltyAmount` เป็นยอดรวมของเช้า/บ่าย/ออกงานอยู่แล้ว
             * (ดู attendance-calculation-engine) ห้ามบวกสามก้อนย่อยซ้ำเข้าไปอีก
             * ส่วน `unpaidLeaveDeductionAmount` ไม่นับ เพราะเป็นการลาไม่รับค่าจ้าง
             * ไม่ใช่ค่าปรับจากวินัย
             */
            latePenaltyAmount: true,
            missingLogPenaltyAmount: true,
            earlyCheckoutPenaltyAmount: true,
            absentDeductionAmount: true,
          },
          _count: { _all: true },
        }),
        this.prisma.employee.findMany({
          where: { deletedAt: null, ...this.scopeDirect(scope) },
          select: { id: true, departmentId: true },
        }),
        this.prisma.employeeResignation.findMany({
          where: {
            ...this.scopeViaEmployee(scope),
            status: ResignationStatus.APPROVED,
            effectiveDate: { gte: start, lt: end },
          },
          select: { employee: { select: { departmentId: true } } },
        }),
        this.prisma.employee.count({
          where: {
            deletedAt: null,
            ...this.scopeDirect(scope),
            startDate: { gte: start, lt: end },
          },
        }),
        this.prisma.payrollRun.findMany({
          where: {
            deletedAt: null,
            ...this.scopeCompany(scope),
            status: { not: PayrollRunStatus.CANCELLED },
            period: { startDate: { lt: end }, endDate: { gte: start } },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, periodId: true },
        }),
      ]);

    const departmentByEmployee = new Map(
      employees.map((employee) => [
        employee.id,
        employee.departmentId ?? "__none__",
      ]),
    );

    type DepartmentStats = {
      otMinutes: number;
      lateMinutes: number;
      absentDays: number;
      workDays: number;
      netPay: number;
      resignations: number;
    };

    const byDepartment = new Map<string, DepartmentStats>();
    const bucket = (key: string) => {
      const existing = byDepartment.get(key);
      if (existing) return existing;

      const created: DepartmentStats = {
        otMinutes: 0,
        lateMinutes: 0,
        absentDays: 0,
        workDays: 0,
        netPay: 0,
        resignations: 0,
      };
      byDepartment.set(key, created);
      return created;
    };

    let lateMinutes = 0;
    let absentDays = 0;
    let otMinutes = 0;
    let leaveDays = 0;
    let penaltyAmount = 0;
    let workDays = 0;

    for (const row of summaryRows) {
      const late = this.toNumber(row._sum.totalLateMinutes);
      const absent = this.toNumber(row._sum.absentDays);
      const ot = this.toNumber(row._sum.approvedOtMinutes);
      const leave = this.toNumber(row._sum.leaveDurationDays);
      const penalty =
        this.toNumber(row._sum.latePenaltyAmount) +
        this.toNumber(row._sum.missingLogPenaltyAmount) +
        this.toNumber(row._sum.earlyCheckoutPenaltyAmount) +
        this.toNumber(row._sum.absentDeductionAmount);
      const days = row._count._all;

      lateMinutes += late;
      absentDays += absent;
      otMinutes += ot;
      leaveDays += leave;
      penaltyAmount += penalty;
      workDays += days;

      const stats = bucket(departmentByEmployee.get(row.employeeId) ?? "__none__");
      stats.lateMinutes += late;
      stats.absentDays += absent;
      stats.otMinutes += ot;
      stats.workDays += days;
    }

    let resignations = 0;
    for (const row of resignationRows) {
      resignations += 1;
      bucket(row.employee?.departmentId ?? "__none__").resignations += 1;
    }

    // งวดหนึ่งเอารอบล่าสุดรอบเดียว กันบวกซ้ำเมื่อมีการคำนวณใหม่
    const runByPeriod = new Map<string, string>();
    for (const run of runs) {
      if (!runByPeriod.has(run.periodId)) runByPeriod.set(run.periodId, run.id);
    }
    const runIds = [...runByPeriod.values()];

    let netPay = 0;
    let earnings = 0;
    let otPay = 0;
    let paidEmployees = 0;

    if (runIds.length > 0) {
      const [itemsByDepartment, itemTotals, otLines] = await Promise.all([
        this.prisma.payrollItem.groupBy({
          by: ["departmentId"],
          where: { runId: { in: runIds } },
          _sum: { totalNetPay: true },
        }),
        this.prisma.payrollItem.aggregate({
          where: { runId: { in: runIds } },
          _sum: { totalNetPay: true, totalEarnings: true },
          _count: { _all: true },
        }),
        this.prisma.payrollLine.aggregate({
          where: {
            payrollItem: { runId: { in: runIds } },
            sourceType: PayrollLineSourceType.OVERTIME,
          },
          _sum: { amount: true },
        }),
      ]);

      netPay = this.toNumber(itemTotals._sum.totalNetPay);
      earnings = this.toNumber(itemTotals._sum.totalEarnings);
      otPay = this.toNumber(otLines._sum.amount);
      paidEmployees = itemTotals._count._all;

      for (const row of itemsByDepartment) {
        bucket(row.departmentId ?? "__none__").netPay += this.toNumber(
          row._sum.totalNetPay,
        );
      }
    }

    return {
      lateMinutes,
      absentDays,
      otMinutes,
      leaveDays,
      penaltyAmount,
      workDays,
      resignations,
      hired,
      netPay,
      earnings,
      otPay,
      paidEmployees,
      byDepartment,
    };
  }

  /** จำนวนเดือนเต็มระหว่างสองวัน — ใช้คิดอายุงาน */
  private monthsBetween(from: Date | null | undefined, to: Date) {
    if (!from) return null;

    const months =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth());

    return months >= 0 ? months : null;
  }

  async getPayrollDashboardSummary(
    filters: PayrollDashboardSummaryFilters = {},
    scope: TenantScope,
  ) {
    const scopeIds = this.scopeIds(scope);
    // COMPANY/BRANCH: ล็อกตาม scope เสมอ ไม่เชื่อค่า companyId/branchId ที่ client ส่งมา
    // GLOBAL: เลือกกรองเองได้จาก query
    const requestedCompanyId =
      scope.level === "GLOBAL"
        ? this.normalizeFilterId(filters.companyId)
        : (scopeIds.companyId ?? null);
    const requestedBranchId =
      scope.level === "BRANCH"
        ? (scopeIds.branchId ?? null)
        : this.normalizeFilterId(filters.branchId);

    const selectedBranch = requestedBranchId
      ? await this.prisma.branch.findFirst({
          where: {
            id: requestedBranchId,
            deletedAt: null,
            ...(requestedCompanyId ? { companyId: requestedCompanyId } : {}),
          },
          select: {
            id: true,
            companyId: true,
          },
        })
      : null;

    const companyId = requestedCompanyId ?? selectedBranch?.companyId;
    const branchId = selectedBranch?.id;

    const scopedEmployeeIds = branchId
      ? (
          await this.prisma.employee.findMany({
            where: {
              deletedAt: null,
              branchId,
              ...(companyId ? { companyId } : {}),
            },
            select: { id: true },
          })
        ).map((employee) => employee.id)
      : null;

    const periodWhere: Prisma.PayrollPeriodWhereInput = {
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
    };
    const runWhere: Prisma.PayrollRunWhereInput = {
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
      ...(branchId
        ? {
            items: {
              some: {
                branchId,
              },
            },
          }
        : {}),
    };
    const activeCompensationWhere: Prisma.EmployeeCompensationWhereInput = {
      deletedAt: null,
      status: MasterStatus.ACTIVE,
      ...(companyId ? { companyId } : {}),
      ...(branchId
        ? {
            employee: {
              deletedAt: null,
              branchId,
              ...(companyId ? { companyId } : {}),
            },
          }
        : {}),
    };
    const hrReviewWhere: Prisma.HrReviewItemWhereInput = {
      status: HrReviewStatus.PAYROLL_READY,
      ...(companyId ? { companyId } : {}),
      ...(scopedEmployeeIds
        ? scopedEmployeeIds.length > 0
          ? { employeeId: { in: scopedEmployeeIds } }
          : { employeeId: "__no_employee_in_scope__" }
        : {}),
    };
    const attendancePayrollReadyWhere: Prisma.AttendanceDailySummaryWhereInput = {
      reviewStatus: {
        in: [
          AttendanceReviewStatus.READY_FOR_PAYROLL,
          AttendanceReviewStatus.LOCKED,
        ],
      },
      sentToPayrollAt: null,
      ...(companyId || branchId
        ? {
            employee: {
              deletedAt: null,
              ...(companyId ? { companyId } : {}),
              ...(branchId ? { branchId } : {}),
            },
          }
        : {}),
    };

    const runsPromise = branchId
      ? this.prisma.payrollRun
          .findMany({
            where: runWhere,
            orderBy: { createdAt: "desc" },
            take: 100,
            include: {
              company: {
                select: this.companyMiniSelect(),
              },
              period: {
                include: {
                  company: {
                    select: this.companyMiniSelect(),
                  },
                },
              },
              items: {
                where: {
                  branchId,
                },
                select: {
                  employeeId: true,
                  totalEarnings: true,
                  totalDeductions: true,
                  totalGrossPay: true,
                  totalNetPay: true,
                },
              },
            },
          })
          .then((items) =>
            items.map((run) => {
              const { items: payrollItems, ...runData } = run;
              const employeeCount = new Set(
                payrollItems.map((item) => item.employeeId),
              ).size;
              const totalEarnings = payrollItems.reduce(
                (sum, item) => sum + this.toNumber(item.totalEarnings),
                0,
              );
              const totalDeductions = payrollItems.reduce(
                (sum, item) => sum + this.toNumber(item.totalDeductions),
                0,
              );
              const totalGrossPay = payrollItems.reduce(
                (sum, item) => sum + this.toNumber(item.totalGrossPay),
                0,
              );
              const totalNetPay = payrollItems.reduce(
                (sum, item) => sum + this.toNumber(item.totalNetPay),
                0,
              );

              return {
                ...runData,
                totalEmployees: employeeCount,
                totalEarnings: this.round(totalEarnings, 2),
                totalDeductions: this.round(totalDeductions, 2),
                totalGrossPay: this.round(totalGrossPay, 2),
                totalNetPay: this.round(totalNetPay, 2),
                _count: {
                  items: payrollItems.length,
                },
              };
            }),
          )
      : this.prisma.payrollRun.findMany({
          where: runWhere,
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            company: {
              select: this.companyMiniSelect(),
            },
            period: {
              include: {
                company: {
                  select: this.companyMiniSelect(),
                },
              },
            },
          },
        });

    const [
      filterCompanies,
      filterBranches,
      periods,
      runs,
      activeCompensationCount,
      legacyPayrollReadyItems,
      legacyPayrollReadyCount,
      attendancePayrollReadyItems,
      attendancePayrollReadyEmployees,
    ] = await Promise.all([
      this.prisma.company.findMany({
        where: {
          deletedAt: null,
          status: MasterStatus.ACTIVE,
          ...(scopeIds.companyId ? { id: scopeIds.companyId } : {}),
        },
        orderBy: { code: "asc" },
        select: this.companyMiniSelect(),
      }),
      companyId
        ? this.prisma.branch.findMany({
            where: {
              deletedAt: null,
              status: MasterStatus.ACTIVE,
              companyId,
            },
            orderBy: { code: "asc" },
            select: this.companyMiniSelect(),
          })
        : Promise.resolve([]),
      this.prisma.payrollPeriod.findMany({
        where: periodWhere,
        orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          company: {
            select: this.companyMiniSelect(),
          },
        },
      }),
      runsPromise,
      this.prisma.employeeCompensation.count({
        where: activeCompensationWhere,
      }),
      this.findHrReviewDashboardItems({
        statuses: [HrReviewStatus.PAYROLL_READY],
        take: 8,
        companyId,
        employeeIds: scopedEmployeeIds ?? undefined,
      }),
      scopedEmployeeIds && scopedEmployeeIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.hrReviewItem.count({
            where: hrReviewWhere,
          }),
      this.findAttendancePayrollReadyDashboardItems(8, {
        companyId,
        branchId,
      }),
      this.prisma.attendanceDailySummary.findMany({
        where: attendancePayrollReadyWhere,
        distinct: ["employeeId"],
        select: {
          employeeId: true,
        },
      }),
    ]);

    const pendingRunStatuses: PayrollRunStatus[] = [
      PayrollRunStatus.DRAFT,
      PayrollRunStatus.CALCULATING,
      PayrollRunStatus.CALCULATED,
      PayrollRunStatus.REVIEWED,
      PayrollRunStatus.APPROVED,
    ];

    const pendingRuns = runs.filter((run) =>
      pendingRunStatuses.includes(run.status),
    );
    const paidRuns = runs.filter((run) => run.status === PayrollRunStatus.PAID);
    const totalNetPay = runs.reduce(
      (sum, run) => sum + this.toNumber(run.totalNetPay),
      0,
    );

    const attendancePayrollReadyCount = attendancePayrollReadyEmployees.length;
    const payrollReadyItems = [
      ...attendancePayrollReadyItems,
      ...legacyPayrollReadyItems,
    ].slice(0, 8);

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        companyId: companyId ?? null,
        branchId: branchId ?? null,
      },
      filterOptions: {
        companies: filterCompanies,
        branches: filterBranches,
      },
      periods,
      runs,
      payrollReadyItems,
      summary: {
        activeCompensationCount,
        payrollReadyCount:
          attendancePayrollReadyCount + legacyPayrollReadyCount,
        attendancePayrollReadyCount,
        legacyPayrollReadyCount,
        pendingRunCount: pendingRuns.length,
        paidRunCount: paidRuns.length,
        totalNetPay: this.round(totalNetPay, 2),
      },
    };
  }

  async getExecutiveDashboardSummary(scope: TenantScope) {
    const now = new Date();
    const today = this.startOfDay(now);
    const tomorrow = this.addDays(today, 1);
    const currentMonthStart = this.startOfMonth(now);
    const nextMonthStart = this.addMonths(currentMonthStart, 1);
    const scopeIds = this.scopeIds(scope);

    /*
     * ชุดวันที่แบบ "work date" (อิงเวลาไทย) ใช้กับ builder ที่แชร์กับ Dashboard HR
     * เพื่อให้ตัวเลขของผู้บริหารตรงกับที่ HR เห็น ไม่ใช่คนละวันเพราะ timezone
     */
    const workToday = this.getBangkokWorkDate(now);
    const workMonthStart = this.startOfWorkMonth(workToday);
    const nextWorkMonthStart = this.addWorkMonths(workMonthStart, 1);

    const [
      totalEmployees,
      activeEmployees,
      probationEmployees,
      currentMonthNewEmployees,
      byDepartment,
      byStatus,
      attendanceLogs,
      leaveTodayEmployees,
      approvedOtHours,
      pendingHrReview,
      periods,
      runs,
      payrollRunAggregate,
      paidPayrollRunAggregate,
      monthBreakdown,
      checkInRows,
      lateRows,
      leaveTodayRows,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: { deletedAt: null, ...this.scopeDirect(scope) },
      }),
      this.prisma.employee.count({ where: this.activeEmployeeWhere(scope) }),
      this.prisma.employee.count({
        where: {
          deletedAt: null,
          ...this.scopeDirect(scope),
          status: EmployeeStatus.PROBATION,
        },
      }),
      this.prisma.employee.count({
        where: {
          deletedAt: null,
          ...this.scopeDirect(scope),
          startDate: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
      }),
      this.buildDepartmentHeadcountGroups(scope),
      this.buildStatusHeadcountGroups(scope),
      this.prisma.attendanceLog.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          workDate: {
            gte: today,
            lt: tomorrow,
          },
          status: {
            not: AttendanceLogStatus.CANCELLED,
          },
        },
        take: 100,
        orderBy: { logTime: "desc" },
      }),
      /*
       * "ลาวันนี้" = **จำนวนคน** ที่ลาจริงในวันนั้น ไม่ใช่จำนวนใบลา
       *
       * สองอย่างที่ต่างจากการนับใบตรง ๆ:
       *   1. `distinct` รายพนักงาน — คนที่มีใบลาซ้อนกันสองใบในวันเดียว
       *      (ลาป่วยครึ่งเช้า + ลากิจครึ่งบ่าย) ต้องนับเป็นคนเดียว
       *   2. ตัดวันหยุดของพนักงานคนนั้นออก (ทำต่อหลัง Promise.all) — ใบลาเก็บ
       *      เป็นช่วง `startDate`–`endDate` ใบที่ลายาวคร่อมวันอาทิตย์จึงเข้า
       *      เงื่อนไขของวันอาทิตย์ด้วย ทั้งที่วันนั้นไม่ใช่วันทำงานอยู่แล้ว
       *      คนคนนั้นไม่ได้ "หายไปจากกำลังคน" ในวันหยุด
       *
       * ดึงขอบเขตของพนักงานมาด้วย เพราะวันหยุดขึ้นกับบริษัท/สาขา/แผนกของแต่ละคน
       * (มีทั้งวันหยุดประจำสัปดาห์ ปฏิทินวันหยุด วันสลับ และคำสั่งให้มาทำงาน)
       */
      this.prisma.leaveRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: {
            in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.APPROVED],
          },
          startDate: { lte: today },
          endDate: { gte: today },
        },
        select: {
          employeeId: true,
          employee: {
            select: {
              id: true,
              branchId: true,
              companyId: true,
              departmentId: true,
              divisionId: true,
              employeeTypeId: true,
            },
          },
        },
        distinct: ["employeeId"],
      }),
      this.sumApprovedOtHours(scope, currentMonthStart, nextMonthStart),
      this.findHrReviewDashboardItems({
        statuses: [
          HrReviewStatus.REVIEWED,
          HrReviewStatus.PAYROLL_READY,
          HrReviewStatus.ON_HOLD,
        ],
        take: 8,
        companyId: scopeIds.companyId,
      }),
      this.prisma.payrollPeriod.findMany({
        where: { deletedAt: null, ...this.scopeCompany(scope) },
        orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
        take: 20,
        include: { company: { select: this.companyMiniSelect() } },
      }),
      this.prisma.payrollRun.findMany({
        where: { deletedAt: null, ...this.scopeCompany(scope) },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          company: { select: this.companyMiniSelect() },
          period: {
            include: { company: { select: this.companyMiniSelect() } },
          },
        },
      }),
      this.prisma.payrollRun.aggregate({
        where: { deletedAt: null, ...this.scopeCompany(scope) },
        _count: { _all: true },
        _sum: {
          totalEmployees: true,
          totalEarnings: true,
          totalDeductions: true,
          totalNetPay: true,
        },
      }),
      this.prisma.payrollRun.aggregate({
        where: {
          deletedAt: null,
          ...this.scopeCompany(scope),
          status: PayrollRunStatus.PAID,
        },
        _count: { _all: true },
        _sum: {
          totalEmployees: true,
          totalEarnings: true,
          totalDeductions: true,
          totalNetPay: true,
        },
      }),
      this.buildHrMonthlyBreakdown(scope, workMonthStart, nextWorkMonthStart),
      this.prisma.attendanceLog.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          workDate: workToday,
          logType: AttendanceLogType.CHECK_IN,
          status: { not: AttendanceLogStatus.CANCELLED },
        },
        distinct: ["employeeId"],
        select: { employeeId: true },
      }),
      this.prisma.attendanceLog.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          workDate: workToday,
          status: AttendanceLogStatus.LATE,
        },
        distinct: ["employeeId"],
        select: { employeeId: true },
      }),
      /*
       * คนที่ถูกยกเว้นจาก "ขาดสแกน" — ต้องใช้ชุดสถานะเดียวกับยอด "ลาวันนี้"
       *
       * เดิมยอดลานับใบที่ยื่นแล้วด้วย แต่ตรงนี้ยกเว้นเฉพาะใบที่อนุมัติแล้ว
       * คนที่ยื่นลาไว้แต่ยังไม่มีใครกดอนุมัติจึงถูกนับเป็น "ลา" และ "ขาดสแกน"
       * พร้อมกันในหน้าจอเดียวกัน
       */
      this.prisma.leaveRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: {
            in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.APPROVED],
          },
          startDate: { lte: workToday },
          endDate: { gte: workToday },
        },
        distinct: ["employeeId"],
        select: { employeeId: true },
      }),
    ]);

    /*
     * นับ "คน" ไม่ใช่ "รายการ" — ของเดิมนับจำนวน log ที่สถานะ LATE
     * คนที่ถูกบันทึกสายสองรอบในวันเดียวจึงถูกนับสองครั้ง
     */
    const checkInEmployeeIds = new Set(checkInRows.map((row) => row.employeeId));
    const leaveEmployeeIds = new Set(leaveTodayRows.map((row) => row.employeeId));
    const checkInCount = checkInEmployeeIds.size;
    const lateTodayCount = new Set(lateRows.map((row) => row.employeeId)).size;

    const missingCheckInToday = await this.prisma.employee.count({
      where: {
        ...this.activeEmployeeWhere(scope),
        id: { notIn: [...checkInEmployeeIds, ...leaveEmployeeIds] },
      },
    });

    /*
     * ตัดคนที่ "วันนี้เป็นวันหยุดของเขาอยู่แล้ว" ออกจากยอดลา
     *
     * โหลดค่าตั้งค่าครั้งเดียวต่อบริษัท ไม่ใช่ครั้งเดียวต่อคน — พนักงานที่ลา
     * คร่อมวันเดียวกันส่วนใหญ่อยู่บริษัทเดียวกัน การถามซ้ำทุกแถวคือคำขอที่
     * เสียเปล่าตามจำนวนคนลา
     */
    const holidaySettingsByCompany = new Map<
      string | null,
      Awaited<ReturnType<SystemSettingsService["getSystemSettings"]>>
    >();

    for (const row of leaveTodayEmployees) {
      const companyId = row.employee?.companyId ?? null;

      if (!holidaySettingsByCompany.has(companyId)) {
        holidaySettingsByCompany.set(
          companyId,
          await this.systemSettings.getSystemSettings(companyId),
        );
      }
    }

    const leaveTodayCount = leaveTodayEmployees.filter((row) => {
      const settings = holidaySettingsByCompany.get(
        row.employee?.companyId ?? null,
      );

      if (!settings) return true;

      return !this.systemSettings.resolveEmployeeAttendanceHolidayInfo(
        workToday,
        settings,
        row.employee ?? {},
      ).isHoliday;
    }).length;

    const pendingRequestCount = monthBreakdown.requestTypes.reduce(
      (total, item) => total + item.pending,
      0,
    );

    return {
      generatedAt: new Date().toISOString(),
      manpower: {
        metrics: {
          totalEmployees,
          activeEmployees,
          probationEmployees,
          currentMonthNewEmployees,
          pendingRequests: pendingRequestCount,
          activeRate:
            totalEmployees > 0
              ? this.round((activeEmployees / totalEmployees) * 100, 1)
              : 0,
        },
        charts: {
          byDepartment,
          byStatus,
        },
      },
      summary: {
        checkInToday: checkInCount,
        lateToday: lateTodayCount,
        leaveToday: leaveTodayCount,
        missingCheckInToday,
        pendingHrReview: pendingHrReview.length,
        approvedOtHours,
      },

      payroll: {
        summary: {
          totalRuns: payrollRunAggregate._count?._all ?? 0,
          paidRuns: paidPayrollRunAggregate._count?._all ?? 0,
          totalEmployees: this.toNumber(
            payrollRunAggregate._sum?.totalEmployees,
          ),
          totalEarnings: this.round(
            this.toNumber(payrollRunAggregate._sum?.totalEarnings),
            2,
          ),
          totalDeductions: this.round(
            this.toNumber(payrollRunAggregate._sum?.totalDeductions),
            2,
          ),
          totalNetPay: this.round(
            this.toNumber(payrollRunAggregate._sum?.totalNetPay),
            2,
          ),
          paidEmployees: this.toNumber(
            paidPayrollRunAggregate._sum?.totalEmployees,
          ),
          paidEarnings: this.round(
            this.toNumber(paidPayrollRunAggregate._sum?.totalEarnings),
            2,
          ),
          paidDeductions: this.round(
            this.toNumber(paidPayrollRunAggregate._sum?.totalDeductions),
            2,
          ),
          paidNetPay: this.round(
            this.toNumber(paidPayrollRunAggregate._sum?.totalNetPay),
            2,
          ),
        },
      },
      payrollPeriods: periods,
      payrollRuns: runs,
      hrReviewItems: pendingHrReview,
    };
  }

  async getAdminDashboardSummary(scope: TenantScope) {
    const now = new Date();
    const today = this.startOfDay(now);
    const tomorrow = this.addDays(today, 1);

    // COMPANY/BRANCH admin เห็นเฉพาะผู้ใช้ในบริษัทตน + โรลระบบ (companyId null) และโรลบริษัทตน
    const companyId = this.scopeIds(scope).companyId;
    const userScopeWhere: Prisma.UserWhereInput = companyId
      ? { scopedCompanyId: companyId }
      : {};
    const roleScopeWhere: Prisma.RoleWhereInput = companyId
      ? { OR: [{ companyId: null }, { companyId }] }
      : {};

    const [
      userCount,
      activeUserCount,
      roleCount,
      permissionCount,
      failedLoginCount,
      auditLogCountToday,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null, ...userScopeWhere } }),
      this.prisma.user.count({
        where: { deletedAt: null, status: UserStatus.ACTIVE, ...userScopeWhere },
      }),
      this.prisma.role.count({ where: { isActive: true, ...roleScopeWhere } }),
      this.prisma.permission.count({ where: { isActive: true } }),
      this.prisma.auditLog.count({
        where: {
          action: AuditAction.LOGIN_FAILED,
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        userCount,
        activeUserCount,
        roleCount,
        permissionCount,
        failedLoginCount,
        auditLogCountToday,
      },
    };
  }

  /**
   * แปลง "YYYY-MM-DD" ที่ผู้ใช้เลือกเป็นวันทำงาน (UTC เที่ยงคืน) แบบเดียวกับ
   * `getBangkokWorkDate` — ค่าที่อ่านไม่ออกให้ตกกลับเป็นวันนี้ ไม่ใช่ throw
   * เพราะจอที่เรียกมาเป็นจอ "อ่านอย่างเดียว" การพังทั้งจอเพราะพารามิเตอร์
   * เพี้ยนหนึ่งตัวแย่กว่าการแสดงวันนี้ให้ดูไปก่อน
   */
  /**
   * ชั่วโมงทำงานต่อวันของบริษัท — ใช้แปลง "วันลา" เป็น "ชั่วโมงลา"
   *
   * ผู้บริหารอ่าน "0.3 วัน" ไม่ออกว่านานแค่ไหน แต่ "2.4 ชม." เข้าใจทันที
   * ค่าจริงมาจาก CompanyPayrollSetting เพราะแต่ละบริษัทตั้งไม่เท่ากัน
   * ตกกลับเป็น 8 เมื่อยังไม่ได้ตั้งค่า (ค่าเดียวกับที่ attendance.service ใช้)
   */
  private async getWorkingHoursPerDay(scope: TenantScope) {
    if (!scope.companyId) return 8;

    const setting = await this.prisma.companyPayrollSetting.findFirst({
      where: { companyId: scope.companyId },
      select: { workingHoursPerDay: true },
    });

    return setting?.workingHoursPerDay && setting.workingHoursPerDay > 0
      ? setting.workingHoursPerDay
      : 8;
  }

  private resolveWorkDate(date?: string) {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split("-").map(Number);
      const parsed = new Date(Date.UTC(year!, month! - 1, day!));

      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return this.getBangkokWorkDate(new Date());
  }

  /**
   * แนวโน้มการเข้างานย้อนหลัง — อัตรามาทำงานรายวันของทั้งบริษัทหรือรายบริษัทในเครือ
   *
   * ตอบคำถามที่ตัวเลข "วันนี้" ตอบไม่ได้: วันนี้ 92% ดีหรือแย่ ถ้าไม่รู้ว่าสอง
   * สัปดาห์ที่ผ่านมาอยู่แถว 85% หรือ 98% — ตัวเลขวันเดียวไม่มีเส้นฐานให้เทียบ
   *
   * ## ทำไมอ่านจาก AttendanceDailySummary ไม่ใช่จาก AttendanceLog
   *
   * สรุปรายวันคือแถวที่ระบบสร้างให้ "คนที่ต้องทำงานวันนั้น" หลังหักวันหยุดกับ
   * กะของแต่ละคนไปแล้ว จำนวนแถวจึงเป็นฐาน (คนที่ต้องมา) ได้ตรง ๆ ถ้านับจาก
   * log จะได้แค่ตัวเศษ (คนที่มา) แล้วต้องเดาฐานเอง ซึ่งเป็นที่มาของ "ขาดงาน
   * 108 คน" ในวันอาทิตย์
   *
   * วันที่ไม่มีแถวสรุปเลย = วันหยุดของทั้งองค์กร ส่งกลับไปเป็น `expected: 0`
   * ให้แอปวาดเป็นช่องว่าง ไม่ใช่จุดที่ร่วงลงศูนย์
   */
  async getExecutiveAttendanceTrend(
    scope: TenantScope,
    filters: { branchId?: string; days?: number } = {},
  ) {
    const days = Math.min(Math.max(Math.trunc(filters.days ?? 14), 7), 60);
    const workToday = this.getBangkokWorkDate(new Date());
    const from = new Date(workToday);
    from.setUTCDate(from.getUTCDate() - (days - 1));

    const scopeWhere = this.scopeViaEmployee(scope);
    const branchId = filters.branchId?.trim() || undefined;

    /*
     * ตัวกรองบริษัทในเครือซ้อนลงใน scope เดิม ไม่ใช่เขียนทับ — ผู้ใช้ระดับสาขา
     * ต้องกรองได้เฉพาะในขอบเขตของตัวเองอยู่ดี
     */
    const employeeWhere = {
      ...(scopeWhere.employee?.is ?? {}),
      ...(branchId ? { branchId } : {}),
    };

    const [rows, branches] = await Promise.all([
      this.prisma.attendanceDailySummary.findMany({
        where: {
          workDate: { gte: from, lte: workToday },
          ...(Object.keys(employeeWhere).length
            ? { employee: { is: employeeWhere } }
            : {}),
        },
        select: {
          workDate: true,
          morningInAt: true,
          totalLateMinutes: true,
          isAbsent: true,
          leaveRequestId: true,
          approvedOtMinutes: true,
        },
      }),
      this.prisma.branch.findMany({
        where: { deletedAt: null, ...this.scopeBranchSelf(scope) },
        orderBy: { nameTh: "asc" },
        select: { id: true, nameTh: true, code: true },
      }),
    ]);

    const buckets = new Map<
      string,
      {
        absent: number;
        expected: number;
        late: number;
        leave: number;
        ot: number;
        present: number;
      }
    >();

    for (let index = 0; index < days; index += 1) {
      const date = new Date(from);
      date.setUTCDate(date.getUTCDate() + index);
      buckets.set(date.toISOString().slice(0, 10), {
        absent: 0,
        expected: 0,
        late: 0,
        leave: 0,
        ot: 0,
        present: 0,
      });
    }

    for (const row of rows) {
      const key = row.workDate.toISOString().slice(0, 10);
      const bucket = buckets.get(key);

      if (!bucket) continue;

      bucket.expected += 1;

      /* โอทีนับแยกจากสถานะการมาทำงาน — คนที่ลาครึ่งวันแล้วทำโอทีตอนเย็นมีจริง */
      if (row.approvedOtMinutes > 0) bucket.ot += 1;

      if (row.leaveRequestId) {
        bucket.leave += 1;
      } else if (row.morningInAt) {
        bucket.present += 1;
        if (row.totalLateMinutes > 0) bucket.late += 1;
      } else if (row.isAbsent) {
        bucket.absent += 1;
      }
    }

    const points = [...buckets.entries()].map(([date, value]) => {
      /*
       * ฐานของอัตราคือคนที่ต้องมาทำงานจริง = ทั้งหมดลบคนลา — คนลาไม่ได้
       * "ไม่มา" โดยไม่มีเหตุผล การนับเขาไว้ในฐานทำให้วันที่มีคนลาเยอะดูเหมือน
       * วันที่คนไม่มาทำงาน
       */
      const base = Math.max(value.expected - value.leave, 0);

      return {
        absent: value.absent,
        date,
        expected: value.expected,
        late: value.late,
        leave: value.leave,
        ot: value.ot,
        present: value.present,
        rate: base > 0 ? this.round((value.present / base) * 100, 1) : 0,
        /** true = วันนั้นไม่มีใครต้องทำงาน (วันหยุด) แอปวาดเป็นช่องว่าง */
        restDay: value.expected === 0,
      };
    });

    const worked = points.filter((point) => !point.restDay);

    return {
      generatedAt: new Date().toISOString(),
      filterOptions: {
        branches: branches.map((item) => ({
          id: item.id,
          label: item.nameTh || item.code,
        })),
      },
      filters: { branchId: branchId ?? null, days },
      points,
      summary: {
        /** เฉลี่ยเฉพาะวันทำงาน วันหยุดไม่ถ่วงค่าเฉลี่ยลง */
        averageRate: worked.length
          ? this.round(
              worked.reduce((sum, point) => sum + point.rate, 0) / worked.length,
              1,
            )
          : 0,
        latestRate: worked.length ? (worked[worked.length - 1]?.rate ?? 0) : 0,
        workedDays: worked.length,
      },
    };
  }

  private getBangkokWorkDate(date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);

    return new Date(Date.UTC(year, month - 1, day));
  }

  private addWorkDays(date: Date, amount: number) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + amount,
      ),
    );
  }

  private startOfWorkMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private addWorkMonths(date: Date, amount: number) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1),
    );
  }


  private normalizeFilterId(value?: string | null) {
    const trimmed = String(value ?? "").trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private getLastWorkMonths(count: number, date: Date) {
    const current = this.startOfWorkMonth(date);

    return Array.from({ length: count }, (_, index) => {
      const start = this.addWorkMonths(current, index - count + 1);
      const end = this.addWorkMonths(start, 1);

      return {
        key: this.monthKey(start),
        label: this.formatThaiMonth(start),
        start,
        end,
      };
    });
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, amount: number) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + amount,
    );
  }

  private companyMiniSelect() {
    return {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
    };
  }

  private employeeMiniSelect() {
    return {
      id: true,
      employeeCode: true,

      nickname: true,
      title: true,
      firstName: true,
      lastName: true,
      displayName: true,
      position: true,
      startDate: true,
      probationEndDate: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      company: {
        select: this.companyMiniSelect(),
      },
      branch: {
        select: this.companyMiniSelect(),
      },
      department: {
        select: this.companyMiniSelect(),
      },
      division: {
        select: this.companyMiniSelect(),
      },
      positionMaster: {
        select: this.companyMiniSelect(),
      },
    };
  }

  private attendanceEmployeeSelect() {
    return {
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
        select: this.companyMiniSelect(),
      },
      branch: {
        select: this.companyMiniSelect(),
      },
      department: {
        select: this.companyMiniSelect(),
      },
      division: {
        select: this.companyMiniSelect(),
      },
    };
  }

  private async findAttendancePayrollReadyDashboardItems(
    take: number,
    filters: PayrollDashboardSummaryFilters = {},
  ) {
    const companyId = this.normalizeFilterId(filters.companyId);
    const branchId = this.normalizeFilterId(filters.branchId);

    const records = await this.prisma.attendanceDailySummary.findMany({
      where: {
        reviewStatus: {
          in: [
            AttendanceReviewStatus.READY_FOR_PAYROLL,
            AttendanceReviewStatus.LOCKED,
          ],
        },
        sentToPayrollAt: null,
        ...(companyId || branchId
          ? {
              employee: {
                deletedAt: null,
                ...(companyId ? { companyId } : {}),
                ...(branchId ? { branchId } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }],
      take,
      include: {
        employee: {
          select: this.employeeMiniSelect(),
        },
      },
    });

    return records.map((record) => ({
      id: `attendance:${record.id}`,
      sourceType: "ATTENDANCE",
      sourceId: record.id,
      requestNo: null,
      title: "Attendance พร้อมเข้า Payroll",
      reason: record.calculationNote,
      sourceStatus: record.reviewStatus,
      reviewStatus: record.reviewStatus,
      submittedAt: null,
      approvedAt:
        record.readyForPayrollAt ?? record.lockedAt ?? record.updatedAt,
      createdAt: record.createdAt,
      employee: record.employee ?? null,
      detail: {
        workDate: record.workDate,
        reviewStatus: record.reviewStatus,
        payrollPeriodId: record.payrollPeriodId,
      },
      review: null,
    }));
  }

  private async findHrReviewDashboardItems(params: {
    statuses: HrReviewStatus[];
    take: number;
    companyId?: string | null;
    employeeIds?: string[];
  }) {
    const companyId = this.normalizeFilterId(params.companyId);

    if (params.employeeIds && params.employeeIds.length === 0) {
      return [];
    }

    const records = await this.prisma.hrReviewItem.findMany({
      where: {
        status: {
          in: params.statuses,
        },
        ...(companyId ? { companyId } : {}),
        ...(params.employeeIds
          ? { employeeId: { in: params.employeeIds } }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: params.take,
    });

    const employeeIds = [
      ...new Set(records.map((record) => record.employeeId)),
    ];
    const employees = employeeIds.length
      ? await this.prisma.employee.findMany({
          where: {
            id: { in: employeeIds },
          },
          select: this.employeeMiniSelect(),
        })
      : [];
    const employeeMap = new Map(
      employees.map((employee) => [employee.id, employee]),
    );

    return records.map((record) => ({
      id: `${record.sourceType}:${record.sourceId}`,
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      requestNo: null,
      title: this.hrReviewTitle(record.sourceType),
      reason: record.reason,
      sourceStatus: "APPROVED",
      reviewStatus: record.status,
      submittedAt: null,
      approvedAt:
        record.reviewedAt ?? record.payrollReadyAt ?? record.createdAt,
      createdAt: record.createdAt,
      employee: employeeMap.get(record.employeeId) ?? null,
      detail: {},
      review: {
        id: record.id,
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        status: record.status,
        periodId: record.periodId,
        payrollRunId: record.payrollRunId,
        reviewedAt: record.reviewedAt,
        reviewedById: record.reviewedById,
        payrollReadyAt: record.payrollReadyAt,
        payrollReadyById: record.payrollReadyById,
        sentToPayrollAt: record.sentToPayrollAt,
        sentToPayrollById: record.sentToPayrollById,
        heldAt: record.heldAt,
        heldById: record.heldById,
        reason: record.reason,
        note: record.note,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    }));
  }

  private hrReviewTitle(sourceType: string) {
    const map: Record<string, string> = {
      LEAVE: "ใบลาที่ผ่านอนุมัติ",
      OVERTIME: "OT ที่ผ่านอนุมัติ",
      TIME_ADJUST: "ขอแก้เวลาที่ผ่านอนุมัติ",
    };

    return map[sourceType] ?? sourceType;
  }

  private async buildDepartmentHeadcountGroups(scope: TenantScope) {
    const departments = await this.prisma.department.findMany({
      where: { deletedAt: null, ...this.scopeDirect(scope) },
      select: {
        id: true,
        code: true,
        nameTh: true,
        nameEn: true,
        _count: {
          select: {
            employees: {
              where: this.activeEmployeeWhere(scope),
            },
          },
        },
      },
      orderBy: { code: "asc" },
    });

    return departments
      .map((department) => ({
        id: department.id,
        code: department.code,
        name: department.nameTh || department.nameEn || department.code,
        label: department.nameTh || department.nameEn || department.code,
        count: department._count.employees,
      }))
      .filter((department) => department.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  private async buildStatusHeadcountGroups(scope: TenantScope) {
    const groups = await this.prisma.employee.groupBy({
      by: ["status"],
      where: { deletedAt: null, ...this.scopeDirect(scope) },
      _count: { _all: true },
    });

    return groups
      .map((group) => ({
        status: group.status,
        label: this.employeeStatusLabel(group.status),
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private employeeStatusLabel(status: string) {
    const map: Record<string, string> = {
      ACTIVE: "ปฏิบัติงาน",
      PROBATION: "ทดลองงาน",
      SUSPENDED: "พักงาน",
      RESIGNED: "ลาออก",
      TERMINATED: "สิ้นสุดจ้าง",
      INACTIVE: "ไม่ใช้งาน",
    };

    return map[status] ?? status;
  }

  private activeEmployeeWhere(
    scope: TenantScope,
    params?: { createdBefore?: Date },
  ): Prisma.EmployeeWhereInput {
    return {
      deletedAt: null,
      ...this.scopeDirect(scope),
      status: {
        notIn: [
          EmployeeStatus.RESIGNED,
          EmployeeStatus.TERMINATED,
          EmployeeStatus.INACTIVE,
        ],
      },
      ...(params?.createdBefore
        ? {
            createdAt: {
              lt: params.createdBefore,
            },
          }
        : {}),
    };
  }

  private async countActiveEmployees(
    scope: TenantScope,
    params?: { createdBefore?: Date },
  ) {
    return this.prisma.employee.count({
      where: this.activeEmployeeWhere(scope, params),
    });
  }

  private async countDepartments(
    scope: TenantScope,
    params?: { createdBefore?: Date },
  ) {
    return this.prisma.department.count({
      where: {
        deletedAt: null,
        ...this.scopeDirect(scope),
        ...(params?.createdBefore
          ? {
              createdAt: {
                lt: params.createdBefore,
              },
            }
          : {}),
      },
    });
  }

  private async countOpenLeaveRequests(
    scope: TenantScope,
    params?: { createdBefore?: Date },
  ) {
    return this.prisma.leaveRequest.count({
      where: {
        deletedAt: null,
        ...this.scopeViaEmployee(scope),
        status: LeaveRequestStatus.SUBMITTED,
        ...(params?.createdBefore
          ? {
              createdAt: {
                lt: params.createdBefore,
              },
            }
          : {}),
      },
    });
  }

  private async sumApprovedOtHours(scope: TenantScope, start: Date, end: Date) {
    const result = await this.prisma.overtimeRequest.aggregate({
      where: {
        deletedAt: null,
        ...this.scopeViaEmployee(scope),
        status: OvertimeRequestStatus.APPROVED,
        workDate: {
          gte: start,
          lt: end,
        },
      },
      _sum: {
        totalHours: true,
      },
    });

    return this.round(this.toNumber(result._sum.totalHours), 1);
  }

  private async calculateAttendanceRate(
    scope: TenantScope,
    start: Date,
    end: Date,
  ) {
    const employeeCount = await this.prisma.employee.count({
      where: this.activeEmployeeWhere(scope, {
        createdBefore: end,
      }),
    });

    if (employeeCount <= 0) {
      return 0;
    }

    const checkedInEmployees = await this.prisma.attendanceLog.findMany({
      where: {
        deletedAt: null,
        ...this.scopeViaEmployee(scope),
        logType: AttendanceLogType.CHECK_IN,
        status: {
          not: AttendanceLogStatus.CANCELLED,
        },
        workDate: {
          gte: start,
          lt: end,
        },
      },
      distinct: ["employeeId"],
      select: {
        employeeId: true,
      },
    });

    return this.round((checkedInEmployees.length / employeeCount) * 100, 1);
  }

  private async buildAttendanceTrend(scope: TenantScope, months: MonthRange[]) {
    const rows = await Promise.all(
      months.map(async (month) => {
        const rate = await this.calculateAttendanceRate(
          scope,
          month.start,
          month.end,
        );

        return {
          month: month.label,
          rate,
        };
      }),
    );

    return rows;
  }

  private async buildMonthlyStats(scope: TenantScope, months: MonthRange[]) {
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];

    const [leaveRows, otRows, missingRows] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: {
            in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.APPROVED],
          },
          startDate: {
            gte: firstMonth.start,
            lt: lastMonth.end,
          },
        },
        select: {
          startDate: true,
          totalDays: true,
        },
      }),

      this.prisma.overtimeRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: {
            in: [
              OvertimeRequestStatus.SUBMITTED,
              OvertimeRequestStatus.APPROVED,
            ],
          },
          workDate: {
            gte: firstMonth.start,
            lt: lastMonth.end,
          },
        },
        select: {
          workDate: true,
          totalHours: true,
        },
      }),

      this.prisma.attendanceLog.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
          status: {
            in: [
              AttendanceLogStatus.MISSING_CHECKIN,
              AttendanceLogStatus.MISSING_CHECKOUT,
            ],
          },
          workDate: {
            gte: firstMonth.start,
            lt: lastMonth.end,
          },
        },
        select: {
          workDate: true,
        },
      }),
    ]);

    return months.map((month) => {
      const leave = leaveRows
        .filter((item) => this.monthKey(item.startDate) === month.key)
        .reduce((sum, item) => sum + this.toNumber(item.totalDays), 0);

      const ot = otRows
        .filter((item) => this.monthKey(item.workDate) === month.key)
        .reduce((sum, item) => sum + this.toNumber(item.totalHours), 0);

      const absent = missingRows.filter(
        (item) => this.monthKey(item.workDate) === month.key,
      ).length;

      return {
        month: month.label,
        leave: this.round(leave, 1),
        ot: this.round(ot, 1),
        absent,
      };
    });
  }

  private async buildDepartmentDistribution(scope: TenantScope) {
    const departments = await this.prisma.department.findMany({
      where: {
        deletedAt: null,
        ...this.scopeDirect(scope),
      },
      select: {
        id: true,
        nameTh: true,
        nameEn: true,
        _count: {
          select: {
            employees: {
              where: this.activeEmployeeWhere(scope),
            },
          },
        },
      },
      orderBy: {
        nameTh: "asc",
      },
    });

    const mapped = departments
      .map((department) => ({
        name: department.nameEn || department.nameTh,
        value: department._count.employees,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    const top = mapped.slice(0, 5);
    const otherValue = mapped
      .slice(5)
      .reduce((sum, item) => sum + item.value, 0);

    const total = mapped.reduce((sum, item) => sum + item.value, 0);

    const rows =
      otherValue > 0
        ? [...top, { name: "Other Departments", value: otherValue }]
        : top;

    return rows.map((item, index) => ({
      name: item.name,
      value: item.value,
      percent:
        total > 0 ? `${this.round((item.value / total) * 100, 1)}%` : "0%",
      color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length],
    }));
  }

  private async buildRecentRequests(scope: TenantScope) {
    const [leaveRequests, overtimeRequests] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
        },
        take: 5,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              displayName: true,
              nickname: true,
            },
          },
          leaveType: {
            select: {
              nameTh: true,
              nameEn: true,
            },
          },
        },
      }),

      this.prisma.overtimeRequest.findMany({
        where: {
          deletedAt: null,
          ...this.scopeViaEmployee(scope),
        },
        take: 5,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              displayName: true,
              nickname: true,
            },
          },
        },
      }),
    ]);

    const leaveItems = leaveRequests.map((item) => ({
      id: item.id,
      kind: "LEAVE" as const,
      type: item.leaveType?.nameTh || item.leaveType?.nameEn || "ลา",
      requester: this.employeeName(item.employee),
      detail: `${this.formatThaiDate(item.startDate)} - ${this.formatThaiDate(
        item.endDate,
      )} (${this.toNumber(item.totalDays).toLocaleString("th-TH")} วัน)`,
      date: this.formatThaiDateTime(item.createdAt),
      status: this.requestStatusLabel(item.status),
      statusTone: this.requestStatusTone(item.status),
      createdAt: item.createdAt.toISOString(),
    }));

    const overtimeItems = overtimeRequests.map((item) => ({
      id: item.id,
      kind: "OT" as const,
      type: "OT",
      requester: this.employeeName(item.employee),
      detail: `OT ${this.toNumber(item.totalHours).toLocaleString("th-TH")} ชม.`,
      date: this.formatThaiDateTime(item.createdAt),
      status: this.requestStatusLabel(item.status),
      statusTone: this.requestStatusTone(item.status),
      createdAt: item.createdAt.toISOString(),
    }));

    return [...leaveItems, ...overtimeItems]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 4);
  }

  private buildInsights(params: {
    attendanceRateChange: number;
    otHoursChange: number;
    openLeaveChange: number;
  }) {
    return [
      {
        key: "attendance",
        title: "อัตราการเข้างาน",
        detail: this.formatPercentChange(params.attendanceRateChange),
        trend: this.toTrend(params.attendanceRateChange),
      },
      {
        key: "ot",
        title: "OT ชั่วโมงรวม",
        detail: this.formatHourChange(params.otHoursChange),
        trend: this.toTrend(params.otHoursChange),
      },
      {
        key: "leave",
        title: "คำขอลาที่รออนุมัติ",
        detail: this.formatCountChange(params.openLeaveChange),
        trend: this.toTrend(params.openLeaveChange),
      },
    ];
  }

  /**
   * สรุปคำขอ ใบลา และการลงเวลาของ "เดือนปัจจุบัน"
   * -------------------------------------------
   * สี่ชุดนี้ตอบคนละคำถามของเดือนเดียวกัน จึงคิดจากช่วงวันเดียวกันทั้งหมด
   *   requestTypes        คำขอแต่ละประเภทเข้ามากี่ใบ ค้างอนุมัติกี่ใบ
   *   leaveByType         ใบลาเดือนนี้เป็นการลาประเภทไหน กี่ใบ กี่วัน
   *   attendanceChannel   พนักงานลงเวลาผ่านช่องทางไหน
   *   attendanceCondition สภาพการลงเวลา (ปกติ/สาย/ออกก่อน/ไม่ครบคู่)
   *
   * วันที่ที่ใช้กรองของแต่ละประเภทคือ "วันที่ของเรื่อง" ไม่ใช่วันที่สร้างรายการ
   * (ลาใช้วันเริ่มลา OT ใช้วันที่ทำงาน) ให้ตรงกับที่ใช้ในหน้าคำขอ
   */
  private async buildHrMonthlyBreakdown(
    scope: TenantScope,
    monthStart: Date,
    monthEnd: Date,
  ) {
    const range = { gte: monthStart, lt: monthEnd };
    const viaEmployee = this.scopeViaEmployee(scope);
    const companyWhere = this.scopeCompany(scope);

    const countedLeaveStatuses = [
      LeaveRequestStatus.SUBMITTED,
      LeaveRequestStatus.APPROVED,
    ];

    const [
      leaveTotal,
      leavePending,
      overtimeTotal,
      overtimePending,
      timeAdjustTotal,
      timeAdjustPending,
      offsiteTotal,
      offsitePending,
      documentTotal,
      documentPending,
      leaveGroups,
      channelGroups,
      channelGpsGroups,
      conditionGroups,
    ] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: {
          deletedAt: null,
          ...viaEmployee,
          status: { in: countedLeaveStatuses },
          startDate: range,
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          deletedAt: null,
          ...viaEmployee,
          status: LeaveRequestStatus.SUBMITTED,
          startDate: range,
        },
      }),
      this.prisma.overtimeRequest.count({
        where: {
          deletedAt: null,
          ...viaEmployee,
          status: {
            in: [
              OvertimeRequestStatus.SUBMITTED,
              OvertimeRequestStatus.APPROVED,
            ],
          },
          workDate: range,
        },
      }),
      this.prisma.overtimeRequest.count({
        where: {
          deletedAt: null,
          ...viaEmployee,
          status: OvertimeRequestStatus.SUBMITTED,
          workDate: range,
        },
      }),
      this.prisma.timeAdjustRequest.count({
        where: {
          deletedAt: null,
          ...viaEmployee,
          status: {
            in: [
              TimeAdjustRequestStatus.SUBMITTED,
              TimeAdjustRequestStatus.APPROVED,
            ],
          },
          requestedLogTime: range,
        },
      }),
      this.prisma.timeAdjustRequest.count({
        where: {
          deletedAt: null,
          ...viaEmployee,
          status: TimeAdjustRequestStatus.SUBMITTED,
          requestedLogTime: range,
        },
      }),
      // OffsiteWorkRequest ไม่มี relation ไป Employee ในสคีมา มีแต่ companyId
      // จึงกรองได้แค่ระดับบริษัท (เหมือน DocumentRequest / HrReviewItem)
      this.prisma.offsiteWorkRequest.count({
        where: {
          deletedAt: null,
          ...companyWhere,
          status: {
            in: [
              OffsiteRequestStatus.SUBMITTED,
              OffsiteRequestStatus.MANAGER_APPROVED,
              OffsiteRequestStatus.HR_APPROVED,
              OffsiteRequestStatus.APPROVED,
            ],
          },
          workDate: range,
        },
      }),
      this.prisma.offsiteWorkRequest.count({
        where: {
          deletedAt: null,
          ...companyWhere,
          status: {
            in: [
              OffsiteRequestStatus.SUBMITTED,
              OffsiteRequestStatus.MANAGER_APPROVED,
            ],
          },
          workDate: range,
        },
      }),
      this.prisma.documentRequest.count({
        where: {
          deletedAt: null,
          ...companyWhere,
          status: {
            in: [
              DocumentRequestStatus.SUBMITTED,
              DocumentRequestStatus.APPROVED,
            ],
          },
          createdAt: range,
        },
      }),
      this.prisma.documentRequest.count({
        where: {
          deletedAt: null,
          ...companyWhere,
          status: DocumentRequestStatus.SUBMITTED,
          createdAt: range,
        },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ["leaveTypeId"],
        where: {
          deletedAt: null,
          ...viaEmployee,
          status: { in: countedLeaveStatuses },
          startDate: range,
        },
        _count: { _all: true },
        _sum: { totalDays: true },
      }),
      this.prisma.attendanceLog.groupBy({
        by: ["channel"],
        where: {
          deletedAt: null,
          ...viaEmployee,
          workDate: range,
          status: { not: AttendanceLogStatus.CANCELLED },
        },
        _count: { _all: true },
      }),
      // นับแยกว่ารายการไหนแนบพิกัดมาด้วย — GPS เป็นคุณสมบัติของการลงเวลา ไม่ใช่ช่องทาง
      this.prisma.attendanceLog.groupBy({
        by: ["channel"],
        where: {
          deletedAt: null,
          ...viaEmployee,
          workDate: range,
          status: { not: AttendanceLogStatus.CANCELLED },
          latitude: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.attendanceLog.groupBy({
        by: ["logType", "status"],
        where: {
          deletedAt: null,
          ...viaEmployee,
          workDate: range,
          status: { not: AttendanceLogStatus.CANCELLED },
        },
        _count: { _all: true },
      }),
    ]);

    const leaveTypes = leaveGroups.length
      ? await this.prisma.leaveType.findMany({
          where: { id: { in: leaveGroups.map((group) => group.leaveTypeId) } },
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            isPaid: true,
          },
        })
      : [];

    const leaveTypeById = new Map(leaveTypes.map((type) => [type.id, type]));

    const conditionCount = (
      match: (row: (typeof conditionGroups)[number]) => boolean,
    ) =>
      conditionGroups
        .filter(match)
        .reduce((total, row) => total + row._count._all, 0);

    return {
      requestTypes: [
        {
          key: "LEAVE",
          label: "ใบลา",
          total: leaveTotal,
          pending: leavePending,
        },
        {
          key: "OVERTIME",
          label: "ทำงานล่วงเวลา",
          total: overtimeTotal,
          pending: overtimePending,
        },
        {
          key: "TIME_ADJUST",
          label: "ขอแก้เวลา",
          total: timeAdjustTotal,
          pending: timeAdjustPending,
        },
        {
          key: "OFFSITE",
          label: "ทำงานนอกสถานที่",
          total: offsiteTotal,
          pending: offsitePending,
        },
        {
          key: "DOCUMENT",
          label: "คำขอเอกสาร",
          total: documentTotal,
          pending: documentPending,
        },
      ],

      leaveByType: leaveGroups
        .map((group) => {
          const type = leaveTypeById.get(group.leaveTypeId);

          return {
            id: group.leaveTypeId,
            code: type?.code ?? null,
            label: type?.nameTh || type?.nameEn || type?.code || "ไม่ระบุ",
            isPaid: type?.isPaid ?? null,
            count: group._count._all,
            days: this.round(this.toNumber(group._sum.totalDays), 1),
          };
        })
        .sort((a, b) => b.count - a.count),

      attendanceChannel: ATTENDANCE_CHANNEL_BUCKETS.map((bucket) => {
        const inBucket = (rows: typeof channelGroups) =>
          rows
            .filter((row) =>
              (bucket.channels as readonly string[]).includes(row.channel),
            )
            .reduce((total, row) => total + row._count._all, 0);

        return {
          key: bucket.key,
          label: bucket.label,
          count: inBucket(channelGroups),
          gpsCount: inBucket(channelGpsGroups),
        };
      })
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count),

      attendanceCondition: [
        {
          key: "CHECK_IN_NORMAL",
          label: "เข้างานตรงเวลา",
          count: conditionCount(
            (row) =>
              row.logType === AttendanceLogType.CHECK_IN &&
              row.status === AttendanceLogStatus.NORMAL,
          ),
        },
        {
          key: "LATE",
          label: "เข้างานสาย",
          count: conditionCount(
            (row) => row.status === AttendanceLogStatus.LATE,
          ),
        },
        {
          key: "CHECK_OUT_NORMAL",
          label: "ออกงานตามเวลา",
          count: conditionCount(
            (row) =>
              row.logType === AttendanceLogType.CHECK_OUT &&
              row.status === AttendanceLogStatus.NORMAL,
          ),
        },
        {
          key: "EARLY_LEAVE",
          label: "ออกก่อนเวลา",
          count: conditionCount(
            (row) => row.status === AttendanceLogStatus.EARLY_LEAVE,
          ),
        },
        {
          key: "MISSING",
          label: "ลงเวลาไม่ครบคู่",
          count: conditionCount(
            (row) =>
              row.status === AttendanceLogStatus.MISSING_CHECKIN ||
              row.status === AttendanceLogStatus.MISSING_CHECKOUT,
          ),
        },
        {
          key: "EDITED",
          label: "เพิ่ม/แก้ไขย้อนหลัง",
          count: conditionCount(
            (row) =>
              row.status === AttendanceLogStatus.MANUAL_ADDED ||
              row.status === AttendanceLogStatus.EDITED,
          ),
        },
      ].filter((row) => row.count > 0),
    };
  }

  private async buildHrDashboardMonthlyTrend(
    scope: TenantScope,
    months: MonthRange[],
  ) {
    return Promise.all(
      months.map(async (month) => {
        const [newEmployees, resignations, leaveRequests, overtimeAggregate] =
          await Promise.all([
            this.prisma.employee.count({
              where: {
                deletedAt: null,
                ...this.scopeDirect(scope),
                startDate: {
                  gte: month.start,
                  lt: month.end,
                },
              },
            }),
            this.prisma.employeeResignation.count({
              where: {
                ...this.scopeViaEmployee(scope),
                status: ResignationStatus.APPROVED,
                effectiveDate: {
                  gte: month.start,
                  lt: month.end,
                },
              },
            }),
            this.prisma.leaveRequest.count({
              where: {
                deletedAt: null,
                ...this.scopeViaEmployee(scope),
                status: {
                  in: [
                    LeaveRequestStatus.SUBMITTED,
                    LeaveRequestStatus.APPROVED,
                  ],
                },
                startDate: {
                  gte: month.start,
                  lt: month.end,
                },
              },
            }),
            this.prisma.overtimeRequest.aggregate({
              where: {
                deletedAt: null,
                ...this.scopeViaEmployee(scope),
                status: {
                  in: [
                    OvertimeRequestStatus.SUBMITTED,
                    OvertimeRequestStatus.APPROVED,
                  ],
                },
                workDate: {
                  gte: month.start,
                  lt: month.end,
                },
              },
              _sum: {
                totalHours: true,
              },
            }),
          ]);

        return {
          month: month.label,
          newEmployees,
          resignations,
          leaveRequests,
          overtimeHours: this.round(
            this.toNumber(overtimeAggregate._sum.totalHours),
            1,
          ),
        };
      }),
    );
  }

  private getLastMonths(count: number, date: Date) {
    const current = this.startOfMonth(date);

    return Array.from({ length: count }, (_, index) => {
      const start = this.addMonths(current, index - count + 1);
      const end = this.addMonths(start, 1);

      return {
        key: this.monthKey(start),
        label: this.formatThaiMonth(start),
        start,
        end,
      };
    });
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private addMonths(date: Date, amount: number) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  private monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}`;
  }

  private formatThaiMonth(date: Date) {
    return new Intl.DateTimeFormat("th-TH", {
      month: "short",
      year: "2-digit",
      timeZone: "Asia/Bangkok",
    }).format(date);
  }

  /** ชื่อเดือนล้วน ๆ ใช้กับกราฟที่บอกปีไว้ที่หัวเรื่องแล้ว */
  private formatThaiMonthShort(date: Date) {
    return new Intl.DateTimeFormat("th-TH", {
      month: "short",
      timeZone: "UTC",
    }).format(date);
  }

  private formatThaiDate(date: Date) {
    return new Intl.DateTimeFormat("th-TH", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      timeZone: "Asia/Bangkok",
    }).format(date);
  }

  private formatThaiDateTime(date: Date) {
    return new Intl.DateTimeFormat("th-TH", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Bangkok",
    }).format(date);
  }

  private employeeName(
    employee?: {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    } | null,
  ) {
    if (!employee) return "-";

    return (
      employee.displayName ||
      [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
      "-"
    );
  }

  private requestStatusLabel(status: string) {
    const map: Record<string, string> = {
      DRAFT: "ร่าง",
      SUBMITTED: "รออนุมัติ",
      APPROVED: "อนุมัติแล้ว",
      REJECTED: "ไม่อนุมัติ",
      CANCELLED: "ยกเลิก",
    };

    return map[status] ?? status;
  }

  private requestStatusTone(status: string) {
    const map: Record<string, "amber" | "emerald" | "rose" | "slate"> = {
      DRAFT: "slate",
      SUBMITTED: "amber",
      APPROVED: "emerald",
      REJECTED: "rose",
      CANCELLED: "slate",
    };

    return map[status] ?? "slate";
  }

  private toTrend(value: number): Trend {
    if (value > 0) return "up";
    if (value < 0) return "down";
    return "neutral";
  }

  private formatPeopleChange(value: number) {
    if (value === 0) return "เท่าเดิมจากเดือนก่อน";
    return `${Math.abs(value).toLocaleString("th-TH")} คน จากเดือนก่อน`;
  }

  private formatCountChange(value: number) {
    if (value === 0) return "เท่าเดิมจากเดือนก่อน";
    return `${Math.abs(value).toLocaleString("th-TH")} จากเดือนก่อน`;
  }

  private formatPercentChange(value: number) {
    if (value === 0) return "เท่าเดิมจากเดือนก่อน";
    return `${Math.abs(this.round(value, 1)).toLocaleString("th-TH")}%
 จากเดือนก่อน`;
  }

  private formatHourChange(value: number) {
    if (value === 0) return "เท่าเดิมจากเดือนก่อน";
    return `${Math.abs(this.round(value, 1)).toLocaleString("th-TH")} ชั่วโมง จากเดือนก่อน`;
  }

  private round(value: number, digits = 2) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined || value === "") return 0;

    if (
      typeof value === "object" &&
      value !== null &&
      "toNumber" in value &&
      typeof (value as { toNumber: () => number }).toNumber === "function"
    ) {
      return (value as { toNumber: () => number }).toNumber();
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }
}
