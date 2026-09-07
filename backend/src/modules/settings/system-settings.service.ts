import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../../database/prisma.service';
import { UpdateSystemSettingsDto } from './dto/system-settings.dto';
import { AttendanceRecalculationScopeService } from '../attendance/attendance-recalculation-scope.service';

type HolidayWeekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type AttendanceCustomHolidayType = 'COMPANY' | 'SPECIAL' | 'PUBLIC';
type AttendanceHolidayWorkAssignmentTargetType =
  | 'ALL'
  | 'COMPANY'
  | 'BRANCH'
  | 'DEPARTMENT'
  | 'DIVISION'
  | 'EMPLOYEE_TYPE'
  | 'EMPLOYEE';

type AttendanceCustomHoliday = {
  id?: string;
  date: string;
  name: string;
  holidayType: AttendanceCustomHolidayType;
};

type AttendanceSubstituteHolidayCreditStatus = 'AVAILABLE' | 'USED' | 'CANCELLED';
type AttendanceHolidaySwapScopeType = 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'EMPLOYEE';
type AttendanceHolidaySwapStatus = 'ACTIVE' | 'CANCELLED';

export type AttendanceHolidaySwap = {
  id: string;
  /** null = ให้วันหยุดเพิ่ม ไม่ได้เอาวันหยุดวันไหนไปแลก */
  originalHolidayDate: string | null;
  swappedHolidayDate: string;
  scopeType: AttendanceHolidaySwapScopeType;
  scopeId: string;
  scopeName: string | null;
  name: string | null;
  reason: string | null;
  status: AttendanceHolidaySwapStatus;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  updatedById: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancelledReason: string | null;
};

export type AttendanceSubstituteHolidayCredit = {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string | null;
  earnedDate: string;
  holidayId?: string | null;
  workAssignmentId?: string | null;
  holidayName: string | null;
  workOverrideName: string | null;
  reason: string | null;
  grantedDays: number;
  grantedMinutes: number;
  status: AttendanceSubstituteHolidayCreditStatus;
  sourceType: 'WORKING_HOLIDAY_ATTENDANCE';
  sourceSummaryId: string | null;
  grantedAt: string;
  grantedById: string | null;
  usedAt: string | null;
  usedById: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancelledReason: string | null;
};

export type AttendanceHolidayWorkOverride = {
  id?: string;
  holidayId?: string;
  date: string;
  holidayName?: string | null;
  name: string;
  reason: string | null;
  appliesToAll: boolean;
  grantSubstituteHoliday: boolean;
  targetType?: AttendanceHolidayWorkAssignmentTargetType;
  targetId?: string | null;
  companyIds: string[];
  branchIds: string[];
  departmentIds: string[];
  divisionIds: string[];
  employeeTypeIds: string[];
  employeeIds: string[];
};

export type AttendanceEmployeeHolidayScope = {
  id?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  divisionId?: string | null;
  employeeTypeId?: string | null;
};

export type AttendanceHolidayInfo = {
  isHoliday: boolean;
  date: string;
  name: string | null;
  source: 'WEEKLY' | 'CUSTOM' | 'WORK_OVERRIDE' | 'HOLIDAY_SWAP' | null;
  /** ชนิดวันหยุดจากปฏิทิน มีเฉพาะ source = CUSTOM (บริษัท/พิเศษ/นักขัตฤกษ์) */
  holidayType?: AttendanceCustomHolidayType | null;
  isWorkingHoliday?: boolean;
  baseHoliday?: {
    isHoliday: boolean;
    date: string;
    name: string | null;
    source: 'WEEKLY' | 'CUSTOM' | 'HOLIDAY_SWAP' | null;
  } | null;
  workOverride?: AttendanceHolidayWorkOverride | null;
  holidaySwap?: AttendanceHolidaySwap | null;
};

type SystemSettingsValue = {
  organizationName: string;
  timezone: 'Asia/Bangkok' | 'UTC';
  locale: 'th-TH' | 'en-US';
  dateFormat: 'DD/MM/YYYY พ.ศ.' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: 'HH:mm' | 'HH:mm:ss';
  fiscalYearStartMonth: number;
  attendanceWeeklyHolidays: HolidayWeekday[];
  attendanceCustomHolidays: AttendanceCustomHoliday[];
  attendanceHolidayWorkOverrides: AttendanceHolidayWorkOverride[];
  attendanceSubstituteHolidayCredits: AttendanceSubstituteHolidayCredit[];
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
};

type SystemSettingsDbRow = {
  id: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  updatedById: string | null;
};

type SystemSettingsAuditDbRow = {
  id: string;
  settingId: string;
  previousValue: unknown;
  newValue: unknown;
  changedById: string | null;
  createdAt: Date;
  changedByEmail: string | null;
  changedByDisplayName: string | null;
};

const SYSTEM_SETTING_ID = 'system';
const HOLIDAY_WEEKDAY_VALUES: HolidayWeekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const HOLIDAY_TYPE_VALUES: AttendanceCustomHolidayType[] = ['COMPANY', 'SPECIAL', 'PUBLIC'];
const HOLIDAY_WORK_ASSIGNMENT_TARGET_TYPES: AttendanceHolidayWorkAssignmentTargetType[] = ['ALL', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'DIVISION', 'EMPLOYEE_TYPE', 'EMPLOYEE'];
const SUBSTITUTE_HOLIDAY_CREDIT_STATUSES: AttendanceSubstituteHolidayCreditStatus[] = ['AVAILABLE', 'USED', 'CANCELLED'];
const HOLIDAY_SWAP_SCOPE_TYPES: AttendanceHolidaySwapScopeType[] = ['COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE'];
const WEEKDAY_BY_UTC_DAY: HolidayWeekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const DEFAULT_SYSTEM_SETTINGS: SystemSettingsValue = {
  organizationName: 'HR-TJC GROUP',
  timezone: 'Asia/Bangkok',
  locale: 'th-TH',
  dateFormat: 'DD/MM/YYYY พ.ศ.',
  timeFormat: 'HH:mm',
  fiscalYearStartMonth: 1,
  attendanceWeeklyHolidays: ['SUN'],
  attendanceCustomHolidays: [],
  attendanceHolidayWorkOverrides: [],
  attendanceSubstituteHolidayCredits: [],
  payrollCutoffDay: 25,
  payrollPeriodStartDay: 26,
  salaryDivisorDays: 30,
  workingHoursPerDay: 8,
  socialSecurityEmployeeRate: 5,
  socialSecurityEmployerRate: 5,
  socialSecurityMinBase: 1650,
  socialSecurityMaxBase: 17500,
  fileUploadMaxMb: 20,
  allowedFileTypes: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'],
  sessionTimeoutMinutes: 480,
  passwordMinLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
  requireTwoFactor: false,
  enableEmailNotification: true,
  enableLineNotification: false,
  maintenanceMode: false,
};

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceRecalculationScope: AttendanceRecalculationScopeService,
  ) {}

  async getSystemSettings(companyId?: string | null) {
    const row = await this.findOrCreateSystemSettings(null, companyId);
    return this.hydrateAttendanceHolidayData(
      this.mapSettingsRow(row),
      companyId,
    );
  }

  async getPayrollCalculationSettings() {
    const row = await this.findOrCreateSystemSettings(null);
    const settings = this.normalizeSettingsValue(row.value);

    return {
      payrollCutoffDay: settings.payrollCutoffDay,
      payrollPeriodStartDay: settings.payrollPeriodStartDay,
      salaryDivisorDays: settings.salaryDivisorDays,
      workingHoursPerDay: settings.workingHoursPerDay,
      socialSecurityEmployeeRate: settings.socialSecurityEmployeeRate,
      socialSecurityEmployerRate: settings.socialSecurityEmployerRate,
      socialSecurityMinBase: settings.socialSecurityMinBase,
      socialSecurityMaxBase: settings.socialSecurityMaxBase,
    };
  }

  async getAttendanceHolidayInfo(
    workDate: Date,
    companyId?: string | null,
  ): Promise<AttendanceHolidayInfo> {
    const settings = await this.getSystemSettings(companyId);
    return this.resolveAttendanceHolidayInfo(workDate, settings);
  }

  async getEmployeeAttendanceHolidayInfo(
    workDate: Date,
    employee: AttendanceEmployeeHolidayScope,
  ): Promise<AttendanceHolidayInfo> {
    // วันหยุด/ตั้งค่าเป็นของบริษัทพนักงานคนนั้น
    const settings = await this.getSystemSettings(employee.companyId ?? null);
    return this.resolveEmployeeAttendanceHolidayInfo(workDate, settings, employee);
  }

  async listHolidayCalendars(companyId?: string | null): Promise<AttendanceCustomHoliday[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      date: Date | string;
      name: string;
      holidayType: AttendanceCustomHolidayType;
    }>>`
      SELECT "id", "date", "name", "holidayType"
      FROM "holiday_calendars"
      WHERE "deletedAt" IS NULL AND "status" = 'ACTIVE'
        AND "companyId" = ${companyId ?? null}
      ORDER BY "date" ASC
    `;

    return rows.map((row) => ({
      id: row.id,
      date: this.toDateKey(new Date(row.date)),
      name: row.name,
      holidayType: row.holidayType,
    }));
  }

  async createHolidayCalendar(dto: { date: string; name?: string; holidayType?: AttendanceCustomHolidayType }, userId: string | null, companyId: string) {
    const date = this.normalizeDateKeyOrThrow(dto.date, 'วันที่วันหยุดไม่ถูกต้อง');
    const name = String(dto.name ?? '').trim() || 'วันหยุดพิเศษ';
    const holidayType = HOLIDAY_TYPE_VALUES.includes(String(dto.holidayType ?? '').toUpperCase() as AttendanceCustomHolidayType)
      ? (String(dto.holidayType).toUpperCase() as AttendanceCustomHolidayType)
      : 'SPECIAL';
    const id = randomUUID();

    await this.prisma.$executeRaw`
      INSERT INTO "holiday_calendars" (
        "id", "companyId", "date", "name", "holidayType", "status", "createdAt", "updatedAt", "createdById", "updatedById"
      )
      VALUES (
        ${id}, ${companyId}, ${date}::date, ${name}, ${holidayType}::"HolidayCalendarType", 'ACTIVE'::"MasterStatus", NOW(), NOW(), ${userId ?? null}, ${userId ?? null}
      )
      ON CONFLICT ("companyId", "date") DO UPDATE SET
        "name" = EXCLUDED."name",
        "holidayType" = EXCLUDED."holidayType",
        "status" = 'ACTIVE',
        "deletedAt" = NULL,
        "deletedById" = NULL,
        "updatedAt" = NOW(),
        "updatedById" = ${userId ?? null}
    `;

    if (userId) {
      await this.attendanceRecalculationScope.enqueueHolidayDateImpact({
        companyId,
        workDate: date,
        requestedById: userId,
        sourceId: id,
        sourceAction: 'UPSERT_HOLIDAY_CALENDAR',
      });
    }

    return this.listHolidayCalendars(companyId);
  }

  async deleteHolidayCalendar(id: string, userId: string | null, companyId: string) {
    const currentRows = await this.prisma.$queryRaw<Array<{ id: string; date: Date | string }>>`
      SELECT "id", "date"
      FROM "holiday_calendars"
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "companyId" = ${companyId}
      LIMIT 1
    `;

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "holiday_calendars"
      SET "status" = 'INACTIVE', "deletedAt" = NOW(), "deletedById" = ${userId ?? null}, "updatedAt" = NOW(), "updatedById" = ${userId ?? null}
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "companyId" = ${companyId}
      RETURNING "id"
    `;

    if (!rows[0]) {
      throw new NotFoundException('ไม่พบวันหยุดที่ต้องการลบ');
    }

    await this.prisma.$executeRaw`
      UPDATE "holiday_work_assignments"
      SET "status" = 'CANCELLED', "deletedAt" = NOW(), "cancelledAt" = NOW(), "cancelledById" = ${userId ?? null}, "updatedAt" = NOW(), "updatedById" = ${userId ?? null}
      WHERE "holidayId" = ${id} AND "deletedAt" IS NULL
    `;

    if (userId && currentRows[0]) {
      await this.attendanceRecalculationScope.enqueueHolidayDateImpact({
        companyId,
        workDate: currentRows[0].date,
        requestedById: userId,
        sourceId: id,
        sourceAction: 'DELETE_HOLIDAY_CALENDAR',
      });
    }

    return { id, deleted: true };
  }


  async listHolidaySwaps(companyId?: string | null): Promise<AttendanceHolidaySwap[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      originalHolidayDate: Date | string | null;
      swappedHolidayDate: Date | string;
      scopeType: AttendanceHolidaySwapScopeType;
      scopeId: string;
      scopeName: string | null;
      name: string | null;
      reason: string | null;
      status: AttendanceHolidaySwapStatus;
      createdAt: Date | string;
      updatedAt: Date | string;
      createdById: string | null;
      updatedById: string | null;
      cancelledAt: Date | string | null;
      cancelledById: string | null;
      cancelledReason: string | null;
    }>>`
      SELECT
        s."id",
        s."originalHolidayDate",
        s."swappedHolidayDate",
        s."scopeType",
        s."scopeId",
        CASE
          WHEN s."scopeType"::text = 'COMPANY' THEN (
            SELECT c."nameTh" FROM "Company" c WHERE c."id" = s."scopeId" LIMIT 1
          )
          WHEN s."scopeType"::text = 'BRANCH' THEN (
            SELECT b."nameTh" FROM "Branch" b WHERE b."id" = s."scopeId" LIMIT 1
          )
          WHEN s."scopeType"::text = 'DEPARTMENT' THEN (
            SELECT d."nameTh" FROM "Department" d WHERE d."id" = s."scopeId" LIMIT 1
          )
          WHEN s."scopeType"::text = 'EMPLOYEE' THEN (
            SELECT CONCAT(e."employeeCode", ' - ', COALESCE(NULLIF(e."displayName", ''), CONCAT(e."firstName", ' ', e."lastName")))
            FROM "employees" e
            WHERE e."id" = s."scopeId"
            LIMIT 1
          )
          ELSE NULL
        END AS "scopeName",
        s."name",
        s."reason",
        s."status",
        s."createdAt",
        s."updatedAt",
        s."createdById",
        s."updatedById",
        s."cancelledAt",
        s."cancelledById",
        s."cancelledReason"
      FROM "holiday_swaps" s
      WHERE s."deletedAt" IS NULL
        AND s."companyId" = ${companyId ?? null}
      ORDER BY s."originalHolidayDate" DESC, s."createdAt" DESC
    `;

    return rows.map((row) => this.mapHolidaySwapRow(row));
  }

  async createHolidaySwap(dto: {
    originalHolidayDate?: string | null;
    swappedHolidayDate: string;
    scopeType: AttendanceHolidaySwapScopeType;
    scopeId: string;
    name?: string | null;
    reason?: string | null;
  }, userId: string | null, companyId: string) {
    /*
     * ไม่ส่งวันหยุดเดิมมา = ให้วันหยุดเพิ่มโดยไม่เอาวันไหนไปแลก
     *
     * เคสจริงคือพนักงานที่บริษัทให้หยุดเพิ่ม โดยไม่เคยมาทำงานในวันหยุดของตัวเอง
     * จึงไม่มีวันไหนให้เอามาแลก ถ้าบังคับให้กรอกแล้วผู้ใช้ยัดวันมั่ว ๆ ลงไป
     * วันนั้นจะกลายเป็นวันทำงานแล้วถูกนับขาดงานแทน คือย้ายปัญหาไปที่อื่น
     */
    const originalHolidayDate = dto.originalHolidayDate
      ? this.normalizeDateKeyOrThrow(dto.originalHolidayDate, 'วันที่หยุดเดิมไม่ถูกต้อง')
      : null;
    const swappedHolidayDate = this.normalizeDateKeyOrThrow(dto.swappedHolidayDate, 'วันที่หยุดใหม่ไม่ถูกต้อง');

    if (originalHolidayDate && originalHolidayDate === swappedHolidayDate) {
      throw new BadRequestException('วันที่หยุดเดิมและวันที่หยุดใหม่ต้องไม่ซ้ำกัน');
    }

    const scopeType = String(dto.scopeType ?? '').trim().toUpperCase() as AttendanceHolidaySwapScopeType;
    if (!HOLIDAY_SWAP_SCOPE_TYPES.includes(scopeType)) {
      throw new BadRequestException('ขอบเขตการสลับวันหยุดไม่ถูกต้อง');
    }

    const scopeId = String(dto.scopeId ?? '').trim();
    if (!scopeId) {
      throw new BadRequestException('กรุณาเลือกบริษัท สาขา แผนก หรือพนักงานที่มีผล');
    }

    await this.assertHolidaySwapScopeExists(scopeType, scopeId);

    /* IS NOT DISTINCT FROM เทียบ NULL กับ NULL ว่าเท่ากันได้ ต่างจาก = ที่ให้ NULL เสมอ */
    const duplicateRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "holiday_swaps"
      WHERE "companyId" = ${companyId}
        AND "originalHolidayDate" IS NOT DISTINCT FROM ${originalHolidayDate}::date
        AND "swappedHolidayDate" = ${swappedHolidayDate}::date
        AND "scopeType" = ${scopeType}::"HolidaySwapScopeType"
        AND "scopeId" = ${scopeId}
        AND "status" = 'ACTIVE'
        AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (duplicateRows[0]) {
      throw new BadRequestException('มีรายการสลับวันหยุดนี้อยู่แล้ว');
    }

    const id = randomUUID();
    const name = this.normalizeNullableString(dto.name) ?? 'สลับวันหยุด';
    const reason = this.normalizeNullableString(dto.reason);

    await this.prisma.$executeRaw`
      INSERT INTO "holiday_swaps" (
        "id", "companyId", "originalHolidayDate", "swappedHolidayDate", "scopeType", "scopeId", "name", "reason",
        "status", "createdAt", "updatedAt", "createdById", "updatedById"
      )
      VALUES (
        ${id}, ${companyId}, ${originalHolidayDate}::date, ${swappedHolidayDate}::date, ${scopeType}::"HolidaySwapScopeType", ${scopeId}, ${name}, ${reason},
        'ACTIVE'::"HolidaySwapStatus", NOW(), NOW(), ${userId ?? null}, ${userId ?? null}
      )
    `;

    if (userId) {
      const impact = {
        companyId,
        requestedById: userId,
        sourceId: id,
        scopeType: scopeType as AttendanceHolidayWorkAssignmentTargetType,
        scopeIds: [scopeId],
      };
      /* เคสให้วันหยุดเพิ่มไม่มีวันหยุดเดิม จึงไม่มีวันไหนต้องคำนวณใหม่ฝั่งนั้น */
      if (originalHolidayDate) {
        await this.attendanceRecalculationScope.enqueueHolidayDateImpact({
          ...impact,
          workDate: originalHolidayDate,
          sourceAction: 'CREATE_HOLIDAY_SWAP_ORIGINAL',
        });
      }
      await this.attendanceRecalculationScope.enqueueHolidayDateImpact({
        ...impact,
        workDate: swappedHolidayDate,
        sourceAction: 'CREATE_HOLIDAY_SWAP_REPLACEMENT',
      });
    }

    return this.listHolidaySwaps(companyId);
  }

  async cancelHolidaySwap(id: string, dto: { cancelReason?: string | null } | undefined, userId: string | null, companyId: string) {
    const cancelReason = this.normalizeNullableString(dto?.cancelReason) ?? 'ยกเลิกจากหน้าตั้งค่าวันหยุด';
    const currentRows = await this.prisma.$queryRaw<Array<{
      id: string;
      originalHolidayDate: Date | string | null;
      swappedHolidayDate: Date | string;
      scopeType: AttendanceHolidaySwapScopeType;
      scopeId: string;
    }>>`
      SELECT "id", "originalHolidayDate", "swappedHolidayDate", "scopeType", "scopeId"
      FROM "holiday_swaps"
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "status" = 'ACTIVE' AND "companyId" = ${companyId}
      LIMIT 1
    `;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "holiday_swaps"
      SET
        "status" = 'CANCELLED',
        "cancelledAt" = NOW(),
        "cancelledById" = ${userId ?? null},
        "cancelledReason" = ${cancelReason},
        "updatedAt" = NOW(),
        "updatedById" = ${userId ?? null}
      WHERE "id" = ${id}
        AND "deletedAt" IS NULL
        AND "status" = 'ACTIVE'
        AND "companyId" = ${companyId}
      RETURNING "id"
    `;

    if (!rows[0]) {
      throw new NotFoundException('ไม่พบรายการสลับวันหยุดที่ต้องการยกเลิก');
    }

    if (userId && currentRows[0]) {
      await this.enqueueHolidaySwapRecalculation(
        currentRows[0],
        userId,
        companyId,
        'CANCEL_HOLIDAY_SWAP',
      );
    }

    return { id, cancelled: true };
  }

  async deleteHolidaySwap(id: string, userId: string | null, companyId: string) {
    const currentRows = await this.prisma.$queryRaw<Array<{
      id: string;
      originalHolidayDate: Date | string | null;
      swappedHolidayDate: Date | string;
      scopeType: AttendanceHolidaySwapScopeType;
      scopeId: string;
    }>>`
      SELECT "id", "originalHolidayDate", "swappedHolidayDate", "scopeType", "scopeId"
      FROM "holiday_swaps"
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "companyId" = ${companyId}
      LIMIT 1
    `;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "holiday_swaps"
      SET
        "deletedAt" = NOW(),
        "deletedById" = ${userId ?? null},
        "updatedAt" = NOW(),
        "updatedById" = ${userId ?? null}
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "companyId" = ${companyId}
      RETURNING "id"
    `;

    if (!rows[0]) {
      throw new NotFoundException('ไม่พบรายการสลับวันหยุดที่ต้องการลบ');
    }

    if (userId && currentRows[0]) {
      await this.enqueueHolidaySwapRecalculation(
        currentRows[0],
        userId,
        companyId,
        'DELETE_HOLIDAY_SWAP',
      );
    }

    return { id, deleted: true };
  }

  async listHolidayWorkAssignments(companyId?: string | null): Promise<AttendanceHolidayWorkOverride[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      holidayId: string;
      holidayDate: Date | string;
      holidayName: string;
      name: string;
      reason: string | null;
      grantSubstituteHoliday: boolean;
      targetType: AttendanceHolidayWorkAssignmentTargetType;
      targetId: string;
    }>>`
      SELECT
        a."id",
        a."holidayId",
        h."date" AS "holidayDate",
        h."name" AS "holidayName",
        a."name",
        a."reason",
        a."grantSubstituteHoliday",
        a."targetType",
        a."targetId"
      FROM "holiday_work_assignments" a
      INNER JOIN "holiday_calendars" h ON h."id" = a."holidayId"
      WHERE a."deletedAt" IS NULL
        AND h."deletedAt" IS NULL
        AND a."status" = 'ACTIVE'
        AND h."status" = 'ACTIVE'
        AND a."companyId" = ${companyId ?? null}
      ORDER BY h."date" DESC, a."createdAt" DESC
    `;

    return rows.map((row) => this.mapHolidayWorkAssignmentRow(row));
  }

  async createHolidayWorkAssignments(dto: {
    holidayId: string;
    targetType: AttendanceHolidayWorkAssignmentTargetType;
    targetIds?: string[];
    name?: string;
    reason?: string | null;
    grantSubstituteHoliday?: boolean;
  }, userId: string | null, companyId: string) {
    const targetType = String(dto.targetType ?? '').trim().toUpperCase() as AttendanceHolidayWorkAssignmentTargetType;
    if (!HOLIDAY_WORK_ASSIGNMENT_TARGET_TYPES.includes(targetType)) {
      throw new BadRequestException('ประเภทกลุ่มที่ต้องมาทำงานไม่ถูกต้อง');
    }

    // วันหยุดต้องอยู่ในบริษัทของผู้ใช้
    const holidayRows = await this.prisma.$queryRaw<Array<{ id: string; date: Date | string; name: string }>>`
      SELECT "id", "date", "name"
      FROM "holiday_calendars"
      WHERE "id" = ${dto.holidayId} AND "deletedAt" IS NULL AND "status" = 'ACTIVE'
        AND "companyId" = ${companyId}
      LIMIT 1
    `;

    const holiday = holidayRows[0];
    if (!holiday) {
      throw new NotFoundException('ไม่พบวันหยุดที่ต้องการกำหนดคนมาทำงาน');
    }

    const targetIds = targetType === 'ALL'
      ? ['ALL']
      : Array.from(new Set((dto.targetIds ?? []).map((item) => String(item).trim()).filter(Boolean)));

    if (targetType !== 'ALL' && targetIds.length === 0) {
      throw new BadRequestException('กรุณาเลือกพนักงานหรือกลุ่มที่ต้องมาทำงานอย่างน้อย 1 รายการ');
    }

    const name = String(dto.name ?? '').trim() || 'ทำงานในวันหยุด';
    const reason = this.normalizeNullableString(dto.reason);
    const grantSubstituteHoliday = dto.grantSubstituteHoliday !== false;

    for (const targetId of targetIds) {
      const id = randomUUID();
      await this.prisma.$executeRaw`
        INSERT INTO "holiday_work_assignments" (
          "id", "companyId", "holidayId", "targetType", "targetId", "name", "reason", "grantSubstituteHoliday",
          "status", "createdAt", "updatedAt", "createdById", "updatedById"
        )
        VALUES (
          ${id}, ${companyId}, ${holiday.id}, ${targetType}::"HolidayWorkAssignmentTargetType", ${targetId}, ${name}, ${reason}, ${grantSubstituteHoliday},
          'ACTIVE'::"HolidayWorkAssignmentStatus", NOW(), NOW(), ${userId ?? null}, ${userId ?? null}
        )
        ON CONFLICT ("holidayId", "targetType", "targetId") DO UPDATE SET
          "name" = EXCLUDED."name",
          "reason" = EXCLUDED."reason",
          "grantSubstituteHoliday" = EXCLUDED."grantSubstituteHoliday",
          "status" = 'ACTIVE',
          "deletedAt" = NULL,
          "cancelledAt" = NULL,
          "cancelledById" = NULL,
          "cancelledReason" = NULL,
          "updatedAt" = NOW(),
          "updatedById" = ${userId ?? null}
      `;
    }

    if (userId) {
      await this.attendanceRecalculationScope.enqueueHolidayDateImpact({
        companyId,
        workDate: holiday.date,
        requestedById: userId,
        sourceId: holiday.id,
        sourceAction: 'UPSERT_HOLIDAY_WORK_ASSIGNMENT',
        scopeType: targetType,
        scopeIds: targetIds,
      });
    }

    return this.listHolidayWorkAssignments(companyId);
  }

  async cancelHolidayWorkAssignment(id: string, userId: string | null, companyId: string) {
    const currentRows = await this.prisma.$queryRaw<Array<{
      id: string;
      holidayDate: Date | string;
      targetType: AttendanceHolidayWorkAssignmentTargetType;
      targetId: string;
    }>>`
      SELECT a."id", h."date" AS "holidayDate", a."targetType", a."targetId"
      FROM "holiday_work_assignments" a
      INNER JOIN "holiday_calendars" h ON h."id" = a."holidayId"
      WHERE a."id" = ${id} AND a."deletedAt" IS NULL AND a."companyId" = ${companyId}
      LIMIT 1
    `;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "holiday_work_assignments"
      SET
        "status" = 'CANCELLED',
        "deletedAt" = NOW(),
        "cancelledAt" = NOW(),
        "cancelledById" = ${userId ?? null},
        "cancelledReason" = 'ยกเลิกจากหน้าตั้งค่าวันหยุด',
        "updatedAt" = NOW(),
        "updatedById" = ${userId ?? null}
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "companyId" = ${companyId}
      RETURNING "id"
    `;

    if (!rows[0]) {
      throw new NotFoundException('ไม่พบรายการคนที่ต้องมาทำงานในวันหยุด');
    }

    if (userId && currentRows[0]) {
      await this.attendanceRecalculationScope.enqueueHolidayDateImpact({
        companyId,
        workDate: currentRows[0].holidayDate,
        requestedById: userId,
        sourceId: id,
        sourceAction: 'CANCEL_HOLIDAY_WORK_ASSIGNMENT',
        scopeType: currentRows[0].targetType,
        scopeIds: [currentRows[0].targetId],
      });
    }

    return { id, cancelled: true };
  }

  async listSubstituteHolidayCredits(companyId?: string | null): Promise<AttendanceSubstituteHolidayCredit[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      employeeId: string;
      employeeCode: string | null;
      employeeName: string | null;
      earnedDate: Date | string;
      holidayId: string | null;
      workAssignmentId: string | null;
      holidayName: string | null;
      workOverrideName: string | null;
      reason: string | null;
      grantedDays: any;
      grantedMinutes: number;
      status: AttendanceSubstituteHolidayCreditStatus;
      sourceType: 'WORKING_HOLIDAY_ATTENDANCE';
      sourceSummaryId: string | null;
      grantedAt: Date | string;
      grantedById: string | null;
      usedAt: Date | string | null;
      usedById: string | null;
      cancelledAt: Date | string | null;
      cancelledById: string | null;
      cancelledReason: string | null;
    }>>`
      SELECT
        c."id",
        c."employeeId",
        e."employeeCode" AS "employeeCode",
        COALESCE(e."displayName", concat(e."firstName", ' ', e."lastName")) AS "employeeName",
        c."earnedDate",
        c."holidayId",
        c."workAssignmentId",
        c."holidayNameSnapshot" AS "holidayName",
        c."workAssignmentNameSnapshot" AS "workOverrideName",
        c."reasonSnapshot" AS "reason",
        c."grantedDays",
        c."grantedMinutes",
        c."status",
        c."sourceType",
        c."sourceSummaryId",
        c."grantedAt",
        c."grantedById",
        c."usedAt",
        c."usedById",
        c."cancelledAt",
        c."cancelledById",
        c."cancelledReason"
      FROM "substitute_holiday_credits" c
      LEFT JOIN "employees" e ON e."id" = c."employeeId"
      WHERE c."deletedAt" IS NULL
        AND c."companyId" = ${companyId ?? null}
      ORDER BY c."earnedDate" DESC, c."createdAt" DESC
    `;

    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.employeeName ?? null,
      earnedDate: this.toDateKey(new Date(row.earnedDate)),
      holidayId: row.holidayId,
      workAssignmentId: row.workAssignmentId,
      holidayName: row.holidayName,
      workOverrideName: row.workOverrideName,
      reason: row.reason,
      grantedDays: Number(row.grantedDays ?? 1),
      grantedMinutes: Number(row.grantedMinutes ?? 480),
      status: row.status,
      sourceType: 'WORKING_HOLIDAY_ATTENDANCE',
      sourceSummaryId: row.sourceSummaryId,
      grantedAt: this.toIsoString(row.grantedAt),
      grantedById: row.grantedById,
      usedAt: row.usedAt ? this.toIsoString(row.usedAt) : null,
      usedById: row.usedById,
      cancelledAt: row.cancelledAt ? this.toIsoString(row.cancelledAt) : null,
      cancelledById: row.cancelledById,
      cancelledReason: row.cancelledReason,
    }));
  }

  async cancelSubstituteHolidayCredit(id: string, userId: string | null, companyId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "substitute_holiday_credits"
      SET "status" = 'CANCELLED', "cancelledAt" = NOW(), "cancelledById" = ${userId ?? null}, "cancelledReason" = 'ยกเลิกจากหน้าตั้งค่าวันหยุด', "updatedAt" = NOW()
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "status" <> 'USED' AND "companyId" = ${companyId}
      RETURNING "id"
    `;

    if (!rows[0]) throw new NotFoundException('ไม่พบสิทธิ์หยุดชดเชยที่ยกเลิกได้');
    return { id, cancelled: true };
  }

  async restoreSubstituteHolidayCredit(id: string, userId: string | null, companyId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "substitute_holiday_credits"
      SET "status" = 'AVAILABLE', "cancelledAt" = NULL, "cancelledById" = NULL, "cancelledReason" = NULL, "updatedAt" = NOW()
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "status" = 'CANCELLED' AND "companyId" = ${companyId}
      RETURNING "id"
    `;

    if (!rows[0]) throw new NotFoundException('ไม่พบสิทธิ์หยุดชดเชยที่คืนสถานะได้');
    return { id, restored: true };
  }

  async deleteSubstituteHolidayCredit(id: string, userId: string | null, companyId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "substitute_holiday_credits"
      SET "deletedAt" = NOW(), "deletedById" = ${userId ?? null}, "updatedAt" = NOW()
      WHERE "id" = ${id} AND "deletedAt" IS NULL AND "companyId" = ${companyId}
      RETURNING "id"
    `;

    if (!rows[0]) throw new NotFoundException('ไม่พบสิทธิ์หยุดชดเชยที่ต้องการลบ');
    return { id, deleted: true };
  }

  async grantSubstituteHolidayCreditForWorkingHoliday(params: {
    companyId: string;
    employeeId: string;
    employeeCode?: string | null;
    employeeName?: string | null;
    earnedDate: Date | string;
    holidayName?: string | null;
    workOverrideName?: string | null;
    reason?: string | null;
    sourceSummaryId?: string | null;
    grantedById?: string | null;
    grantedDays?: number;
    grantedMinutes?: number;
    holidayId?: string | null;
    workAssignmentId?: string | null;
  }): Promise<{ credit: AttendanceSubstituteHolidayCredit; created: boolean }> {
    const earnedDate = typeof params.earnedDate === 'string'
      ? this.normalizeDateKeyOrThrow(params.earnedDate.slice(0, 10), 'วันที่ทำงานวันหยุดไม่ถูกต้อง')
      : this.toDateKey(params.earnedDate);

    const existing = await this.findSubstituteHolidayCredit(params.employeeId, earnedDate);
    if (existing) return { credit: existing, created: false };

    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "substitute_holiday_credits" (
        "id", "companyId", "employeeId", "earnedDate", "holidayId", "workAssignmentId", "holidayNameSnapshot", "workAssignmentNameSnapshot", "reasonSnapshot",
        "grantedDays", "grantedMinutes", "status", "sourceType", "sourceSummaryId", "grantedAt", "grantedById", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${params.companyId}, ${params.employeeId}, ${earnedDate}::date, ${params.holidayId ?? null}, ${params.workAssignmentId ?? null}, ${params.holidayName ?? null}, ${params.workOverrideName ?? null}, ${params.reason ?? null},
        ${Number(params.grantedDays ?? 1)}, ${Number(params.grantedMinutes ?? 480)}, 'AVAILABLE'::"SubstituteHolidayCreditStatus", 'WORKING_HOLIDAY_ATTENDANCE'::"SubstituteHolidayCreditSourceType", ${params.sourceSummaryId ?? null}, NOW(), ${params.grantedById ?? null}, NOW(), NOW()
      )
      ON CONFLICT ("employeeId", "earnedDate", "sourceType") DO NOTHING
    `;

    const credit = await this.findSubstituteHolidayCredit(params.employeeId, earnedDate);
    if (!credit) throw new BadRequestException('ไม่สามารถสร้างสิทธิ์หยุดชดเชยได้');
    return { credit, created: credit.id === id };
  }

  private async enqueueHolidaySwapRecalculation(
    swap: {
      id: string;
      /** ว่าง = ให้วันหยุดเพิ่ม ไม่มีวันหยุดเดิมให้คำนวณใหม่ */
      originalHolidayDate: Date | string | null;
      swappedHolidayDate: Date | string;
      scopeType: AttendanceHolidaySwapScopeType;
      scopeId: string;
    },
    requestedById: string,
    companyId: string,
    sourceAction: string,
  ) {
    const impact = {
      companyId,
      requestedById,
      sourceId: swap.id,
      scopeType: swap.scopeType as AttendanceHolidayWorkAssignmentTargetType,
      scopeIds: [swap.scopeId],
    };
    if (swap.originalHolidayDate) {
      await this.attendanceRecalculationScope.enqueueHolidayDateImpact({
        ...impact,
        workDate: swap.originalHolidayDate,
        sourceAction: `${sourceAction}_ORIGINAL`,
      });
    }
    await this.attendanceRecalculationScope.enqueueHolidayDateImpact({
      ...impact,
      workDate: swap.swappedHolidayDate,
      sourceAction: `${sourceAction}_REPLACEMENT`,
    });
  }

  resolveEmployeeAttendanceHolidayInfo(
    workDate: Date,
    settings: Pick<SystemSettingsValue, 'attendanceWeeklyHolidays' | 'attendanceCustomHolidays' | 'attendanceHolidayWorkOverrides'> & {
      attendanceHolidaySwaps?: AttendanceHolidaySwap[];
    },
    employee: AttendanceEmployeeHolidayScope,
  ): AttendanceHolidayInfo {
    const baseHoliday = this.resolveAttendanceHolidayInfo(workDate, settings);
    const dateKey = this.toDateKey(workDate);
    const matchedOriginalSwap = this.findMatchedHolidaySwap(
      dateKey,
      settings.attendanceHolidaySwaps ?? [],
      employee,
      'ORIGINAL',
    );
    const matchedReplacementSwap = this.findMatchedHolidaySwap(
      dateKey,
      settings.attendanceHolidaySwaps ?? [],
      employee,
      'REPLACEMENT',
    );

    const effectiveBaseHoliday: AttendanceHolidayInfo = matchedOriginalSwap
      ? {
          isHoliday: false,
          date: dateKey,
          name: matchedOriginalSwap.name || 'สลับเป็นวันทำงาน',
          source: 'HOLIDAY_SWAP',
          isWorkingHoliday: false,
          baseHoliday: baseHoliday.isHoliday
            ? {
                isHoliday: baseHoliday.isHoliday,
                date: baseHoliday.date,
                name: baseHoliday.name,
                source: baseHoliday.source as 'WEEKLY' | 'CUSTOM' | 'HOLIDAY_SWAP' | null,
              }
            : null,
          workOverride: null,
          holidaySwap: matchedOriginalSwap,
        }
      : matchedReplacementSwap
        ? {
            isHoliday: true,
            date: dateKey,
            name: matchedReplacementSwap.name || 'วันหยุดที่สลับมา',
            source: 'HOLIDAY_SWAP',
            isWorkingHoliday: false,
            baseHoliday: null,
            workOverride: null,
            holidaySwap: matchedReplacementSwap,
          }
        : baseHoliday;

    const override = (settings.attendanceHolidayWorkOverrides ?? []).find(
      (item) => item.date === dateKey && this.isHolidayWorkOverrideMatched(item, employee),
    );

    if (!override) {
      return {
        ...effectiveBaseHoliday,
        isWorkingHoliday: false,
        baseHoliday: effectiveBaseHoliday.baseHoliday ?? (effectiveBaseHoliday.isHoliday ? {
          isHoliday: effectiveBaseHoliday.isHoliday,
          date: effectiveBaseHoliday.date,
          name: effectiveBaseHoliday.name,
          source: effectiveBaseHoliday.source as 'WEEKLY' | 'CUSTOM' | 'HOLIDAY_SWAP' | null,
        } : null),
        workOverride: null,
        holidaySwap: effectiveBaseHoliday.holidaySwap ?? matchedOriginalSwap ?? matchedReplacementSwap ?? null,
      };
    }

    return {
      isHoliday: false,
      date: dateKey,
      name: override.name || effectiveBaseHoliday.name || 'ทำงานในวันหยุด',
      source: 'WORK_OVERRIDE',
      isWorkingHoliday: true,
      baseHoliday: effectiveBaseHoliday.isHoliday ? {
        isHoliday: effectiveBaseHoliday.isHoliday,
        date: effectiveBaseHoliday.date,
        name: effectiveBaseHoliday.name,
        source: effectiveBaseHoliday.source as 'WEEKLY' | 'CUSTOM' | 'HOLIDAY_SWAP' | null,
      } : null,
      workOverride: override,
      holidaySwap: effectiveBaseHoliday.holidaySwap ?? matchedOriginalSwap ?? matchedReplacementSwap ?? null,
    };
  }

  resolveAttendanceHolidayInfo(
    workDate: Date,
    settings: Pick<SystemSettingsValue, 'attendanceWeeklyHolidays' | 'attendanceCustomHolidays'>,
  ): AttendanceHolidayInfo {
    const dateKey = this.toDateKey(workDate);
    const customHoliday = (settings.attendanceCustomHolidays ?? []).find(
      (item) => item.date === dateKey,
    );

    if (customHoliday) {
      return {
        isHoliday: true,
        date: dateKey,
        name: customHoliday.name || 'วันหยุดพิเศษ',
        source: 'CUSTOM',
        holidayType: customHoliday.holidayType ?? 'SPECIAL',
      };
    }

    const weekday = WEEKDAY_BY_UTC_DAY[workDate.getUTCDay()];
    const isWeeklyHoliday = (settings.attendanceWeeklyHolidays ?? []).includes(weekday);

    return {
      isHoliday: isWeeklyHoliday,
      date: dateKey,
      name: isWeeklyHoliday ? `วันหยุดประจำสัปดาห์ (${weekday})` : null,
      source: isWeeklyHoliday ? 'WEEKLY' : null,
    };
  }

  async updateSystemSettings(dto: UpdateSystemSettingsDto, userId?: string | null, companyId?: string | null) {
    const settingId = this.resolveSettingId(companyId);
    const currentRow = await this.findOrCreateSystemSettings(userId ?? null, companyId);
    const currentValue = this.normalizeSettingsValue(currentRow.value);
    const nextValue = this.normalizeSettingsValue({
      ...currentValue,
      ...this.normalizePatch(dto),
    });

    const changed = JSON.stringify(currentValue) !== JSON.stringify(nextValue);

    if (!changed) {
      return this.hydrateAttendanceHolidayData(this.mapSettingsRow(currentRow), companyId);
    }

    const nextJson = JSON.stringify(nextValue);
    const previousJson = JSON.stringify(currentValue);

    const rows = await this.prisma.$queryRaw<SystemSettingsDbRow[]>`
      UPDATE system_settings
      SET
        "value" = ${nextJson}::jsonb,
        "updatedAt" = NOW(),
        "updatedById" = ${userId ?? null}
      WHERE "id" = ${settingId}
      RETURNING "id", "value", "createdAt", "updatedAt", "createdById", "updatedById"
    `;

    const updatedRow = rows[0];

    if (!updatedRow) {
      throw new NotFoundException('ไม่พบรายการตั้งค่าระบบ');
    }

    await this.prisma.$executeRaw`
      INSERT INTO system_settings_audit (
        "id",
        "settingId",
        "previousValue",
        "newValue",
        "changedById",
        "createdAt"
      )
      VALUES (
        ${randomUUID()},
        ${settingId},
        ${previousJson}::jsonb,
        ${nextJson}::jsonb,
        ${userId ?? null},
        NOW()
      )
    `;

    const attendanceHolidaySettingChanged =
      JSON.stringify(currentValue.attendanceWeeklyHolidays) !==
        JSON.stringify(nextValue.attendanceWeeklyHolidays) ||
      JSON.stringify(currentValue.attendanceCustomHolidays) !==
        JSON.stringify(nextValue.attendanceCustomHolidays) ||
      JSON.stringify(currentValue.attendanceHolidayWorkOverrides) !==
        JSON.stringify(nextValue.attendanceHolidayWorkOverrides);

    if (attendanceHolidaySettingChanged && userId && companyId) {
      await this.attendanceRecalculationScope.enqueueCompanyAttendanceSummaries({
        companyId,
        requestedById: userId,
        sourceId: settingId,
        sourceAction: 'UPDATE_ATTENDANCE_HOLIDAY_SETTINGS',
      });
    }

    return this.hydrateAttendanceHolidayData(this.mapSettingsRow(updatedRow), companyId);
  }

  async getSystemSettingsAudit(params?: { page?: number; pageSize?: number; companyId?: string | null }) {
    const page = Math.max(Number(params?.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(params?.pageSize ?? 20), 1), 100);
    const offset = (page - 1) * pageSize;
    const settingId = this.resolveSettingId(params?.companyId);

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<SystemSettingsAuditDbRow[]>`
        SELECT
          a."id",
          a."settingId",
          a."previousValue",
          a."newValue",
          a."changedById",
          a."createdAt",
          u."email" AS "changedByEmail",
          u."displayName" AS "changedByDisplayName"
        FROM system_settings_audit a
        LEFT JOIN "User" u ON u."id" = a."changedById"
        WHERE a."settingId" = ${settingId}
        ORDER BY a."createdAt" DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM system_settings_audit
        WHERE "settingId" = ${settingId}
      `,
    ]);

    const total = Number(totals[0]?.count ?? 0);

    return {
      data: rows.map((row) => ({
        id: row.id,
        settingId: row.settingId,
        previousValue: this.normalizeSettingsValue(row.previousValue),
        newValue: this.normalizeSettingsValue(row.newValue),
        changedById: row.changedById,
        changedBy: row.changedById
          ? {
              id: row.changedById,
              email: row.changedByEmail,
              displayName: row.changedByDisplayName,
            }
          : null,
        createdAt: row.createdAt,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * แต่ละบริษัทมีแถวตั้งค่าของตัวเอง (id = "system::<companyId>")
   * ส่วน platform admin (ไม่มี companyId) ใช้แถว "system" เป็นค่าตั้งต้นของแพลตฟอร์ม
   */
  private resolveSettingId(companyId?: string | null): string {
    return companyId ? `${SYSTEM_SETTING_ID}::${companyId}` : SYSTEM_SETTING_ID;
  }

  private async findOrCreateSystemSettings(
    userId: string | null,
    companyId?: string | null,
  ) {
    const settingId = this.resolveSettingId(companyId);
    const existing = await this.findSystemSettingsRow(companyId);

    if (existing) {
      return existing;
    }

    // แถวใหม่ของบริษัท: สืบทอดค่าตั้งต้นจากแถวกลางของแพลตฟอร์ม (ถ้ามี) ไม่งั้นใช้ default
    let seedValue: unknown = DEFAULT_SYSTEM_SETTINGS;
    if (companyId) {
      const platformRow = await this.findSystemSettingsRow(null);
      if (platformRow?.value) {
        seedValue = this.normalizeSettingsValue(platformRow.value);
      }
    }

    const defaultJson = JSON.stringify(seedValue);

    await this.prisma.$executeRaw`
      INSERT INTO system_settings (
        "id",
        "value",
        "createdAt",
        "updatedAt",
        "createdById",
        "updatedById"
      )
      VALUES (
        ${settingId},
        ${defaultJson}::jsonb,
        NOW(),
        NOW(),
        ${userId},
        ${userId}
      )
      ON CONFLICT ("id") DO NOTHING
    `;

    const created = await this.findSystemSettingsRow(companyId);

    if (!created) {
      throw new NotFoundException('ไม่สามารถสร้างรายการตั้งค่าระบบเริ่มต้นได้');
    }

    return created;
  }

  private async findSystemSettingsRow(companyId?: string | null) {
    const settingId = this.resolveSettingId(companyId);
    const rows = await this.prisma.$queryRaw<SystemSettingsDbRow[]>`
      SELECT "id", "value", "createdAt", "updatedAt", "createdById", "updatedById"
      FROM system_settings
      WHERE "id" = ${settingId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private mapSettingsRow(row: SystemSettingsDbRow) {
    const value = this.normalizeSettingsValue(row.value);

    return {
      id: row.id,
      ...value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdById: row.createdById,
      updatedById: row.updatedById,
    };
  }

  private async hydrateAttendanceHolidayData<T extends SystemSettingsValue & Record<string, any>>(settings: T, companyId?: string | null): Promise<T & { attendanceHolidaySwaps: AttendanceHolidaySwap[] }> {
    const [customHolidays, workOverrides, substituteCredits, holidaySwaps] = await Promise.all([
      this.listHolidayCalendars(companyId),
      this.listHolidayWorkAssignments(companyId),
      this.listSubstituteHolidayCredits(companyId),
      this.listHolidaySwaps(companyId),
    ]);

    return {
      ...settings,
      attendanceCustomHolidays: customHolidays,
      attendanceHolidayWorkOverrides: workOverrides,
      attendanceSubstituteHolidayCredits: substituteCredits,
      attendanceHolidaySwaps: holidaySwaps,
    };
  }


  private mapHolidaySwapRow(row: {
    id: string;
    originalHolidayDate: Date | string | null;
    swappedHolidayDate: Date | string;
    scopeType: AttendanceHolidaySwapScopeType;
    scopeId: string;
    scopeName: string | null;
    name: string | null;
    reason: string | null;
    status: AttendanceHolidaySwapStatus;
    createdAt: Date | string;
    updatedAt: Date | string;
    createdById: string | null;
    updatedById: string | null;
    cancelledAt: Date | string | null;
    cancelledById: string | null;
    cancelledReason: string | null;
  }): AttendanceHolidaySwap {
    return {
      id: row.id,
      /* ว่าง = ให้วันหยุดเพิ่ม ไม่ได้แลกกับวันไหน */
      originalHolidayDate: row.originalHolidayDate
        ? this.toDateKey(new Date(row.originalHolidayDate))
        : null,
      swappedHolidayDate: this.toDateKey(new Date(row.swappedHolidayDate)),
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      scopeName: row.scopeName,
      name: row.name,
      reason: row.reason,
      status: row.status,
      createdAt: this.toIsoString(row.createdAt),
      updatedAt: this.toIsoString(row.updatedAt),
      createdById: row.createdById,
      updatedById: row.updatedById,
      cancelledAt: row.cancelledAt ? this.toIsoString(row.cancelledAt) : null,
      cancelledById: row.cancelledById,
      cancelledReason: row.cancelledReason,
    };
  }

  private mapHolidayWorkAssignmentRow(row: {
    id: string;
    holidayId: string;
    holidayDate: Date | string;
    holidayName: string;
    name: string;
    reason: string | null;
    grantSubstituteHoliday: boolean;
    targetType: AttendanceHolidayWorkAssignmentTargetType;
    targetId: string;
  }): AttendanceHolidayWorkOverride {
    const targetId = row.targetId === 'ALL' ? null : row.targetId;
    const override: AttendanceHolidayWorkOverride = {
      id: row.id,
      holidayId: row.holidayId,
      date: this.toDateKey(new Date(row.holidayDate)),
      holidayName: row.holidayName,
      name: row.name,
      reason: row.reason,
      appliesToAll: row.targetType === 'ALL',
      grantSubstituteHoliday: row.grantSubstituteHoliday,
      targetType: row.targetType,
      targetId,
      companyIds: [],
      branchIds: [],
      departmentIds: [],
      divisionIds: [],
      employeeTypeIds: [],
      employeeIds: [],
    };

    if (targetId) {
      if (row.targetType === 'COMPANY') override.companyIds = [targetId];
      if (row.targetType === 'BRANCH') override.branchIds = [targetId];
      if (row.targetType === 'DEPARTMENT') override.departmentIds = [targetId];
      if (row.targetType === 'DIVISION') override.divisionIds = [targetId];
      if (row.targetType === 'EMPLOYEE_TYPE') override.employeeTypeIds = [targetId];
      if (row.targetType === 'EMPLOYEE') override.employeeIds = [targetId];
    }

    return override;
  }

  private async findSubstituteHolidayCredit(employeeId: string, earnedDate: string): Promise<AttendanceSubstituteHolidayCredit | null> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      employeeId: string;
      employeeCode: string | null;
      employeeName: string | null;
      earnedDate: Date | string;
      holidayId: string | null;
      workAssignmentId: string | null;
      holidayName: string | null;
      workOverrideName: string | null;
      reason: string | null;
      grantedDays: any;
      grantedMinutes: number;
      status: AttendanceSubstituteHolidayCreditStatus;
      sourceType: 'WORKING_HOLIDAY_ATTENDANCE';
      sourceSummaryId: string | null;
      grantedAt: Date | string;
      grantedById: string | null;
      usedAt: Date | string | null;
      usedById: string | null;
      cancelledAt: Date | string | null;
      cancelledById: string | null;
      cancelledReason: string | null;
    }>>`
      SELECT
        c."id",
        c."employeeId",
        e."employeeCode" AS "employeeCode",
        COALESCE(e."displayName", concat(e."firstName", ' ', e."lastName")) AS "employeeName",
        c."earnedDate",
        c."holidayId",
        c."workAssignmentId",
        c."holidayNameSnapshot" AS "holidayName",
        c."workAssignmentNameSnapshot" AS "workOverrideName",
        c."reasonSnapshot" AS "reason",
        c."grantedDays",
        c."grantedMinutes",
        c."status",
        c."sourceSummaryId",
        c."grantedAt",
        c."grantedById",
        c."usedAt",
        c."usedById",
        c."cancelledAt",
        c."cancelledById",
        c."cancelledReason"
      FROM "substitute_holiday_credits" c
      LEFT JOIN "employees" e ON e."id" = c."employeeId"
      WHERE c."employeeId" = ${employeeId}
        AND c."earnedDate" = ${earnedDate}::date
        AND c."sourceType" = 'WORKING_HOLIDAY_ATTENDANCE'
        AND c."deletedAt" IS NULL
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      earnedDate: this.toDateKey(new Date(row.earnedDate)),
      holidayId: row.holidayId,
      workAssignmentId: row.workAssignmentId,
      holidayName: row.holidayName,
      workOverrideName: row.workOverrideName,
      reason: row.reason,
      grantedDays: Number(row.grantedDays ?? 1),
      grantedMinutes: Number(row.grantedMinutes ?? 480),
      status: row.status,
      sourceType: 'WORKING_HOLIDAY_ATTENDANCE',
      sourceSummaryId: row.sourceSummaryId,
      grantedAt: this.toIsoString(row.grantedAt),
      grantedById: row.grantedById,
      usedAt: row.usedAt ? this.toIsoString(row.usedAt) : null,
      usedById: row.usedById,
      cancelledAt: row.cancelledAt ? this.toIsoString(row.cancelledAt) : null,
      cancelledById: row.cancelledById,
      cancelledReason: row.cancelledReason,
    };
  }

  private normalizePatch(dto: UpdateSystemSettingsDto): Partial<SystemSettingsValue> {
    const patch: Partial<SystemSettingsValue> = {};

    if (dto.organizationName !== undefined) patch.organizationName = dto.organizationName.trim();
    if (dto.timezone !== undefined) patch.timezone = dto.timezone;
    if (dto.locale !== undefined) patch.locale = dto.locale;
    if (dto.dateFormat !== undefined) patch.dateFormat = dto.dateFormat;
    if (dto.timeFormat !== undefined) patch.timeFormat = dto.timeFormat;
    if (dto.fiscalYearStartMonth !== undefined) patch.fiscalYearStartMonth = dto.fiscalYearStartMonth;
    if (dto.attendanceWeeklyHolidays !== undefined) {
      patch.attendanceWeeklyHolidays = this.normalizeWeeklyHolidays(dto.attendanceWeeklyHolidays);
    }
    // รายการวันหยุด/การมาทำงานวันหยุด/สิทธิ์หยุดชดเชยถูกเก็บในตารางจริงแล้ว
    // ไม่รับการเขียนทับผ่าน JSON system_settings อีกต่อไป
    if (dto.payrollCutoffDay !== undefined) patch.payrollCutoffDay = dto.payrollCutoffDay;
    if (dto.payrollPeriodStartDay !== undefined) patch.payrollPeriodStartDay = dto.payrollPeriodStartDay;
    if (dto.salaryDivisorDays !== undefined) patch.salaryDivisorDays = dto.salaryDivisorDays;
    if (dto.workingHoursPerDay !== undefined) patch.workingHoursPerDay = dto.workingHoursPerDay;
    if (dto.socialSecurityEmployeeRate !== undefined) patch.socialSecurityEmployeeRate = dto.socialSecurityEmployeeRate;
    if (dto.socialSecurityEmployerRate !== undefined) patch.socialSecurityEmployerRate = dto.socialSecurityEmployerRate;
    if (dto.socialSecurityMinBase !== undefined) patch.socialSecurityMinBase = dto.socialSecurityMinBase;
    if (dto.socialSecurityMaxBase !== undefined) patch.socialSecurityMaxBase = dto.socialSecurityMaxBase;
    if (dto.fileUploadMaxMb !== undefined) patch.fileUploadMaxMb = dto.fileUploadMaxMb;
    if (dto.allowedFileTypes !== undefined) {
      patch.allowedFileTypes = this.normalizeFileTypes(dto.allowedFileTypes);
    }
    if (dto.sessionTimeoutMinutes !== undefined) patch.sessionTimeoutMinutes = dto.sessionTimeoutMinutes;
    if (dto.passwordMinLength !== undefined) patch.passwordMinLength = dto.passwordMinLength;
    if (dto.requireUppercase !== undefined) patch.requireUppercase = dto.requireUppercase;
    if (dto.requireLowercase !== undefined) patch.requireLowercase = dto.requireLowercase;
    if (dto.requireNumber !== undefined) patch.requireNumber = dto.requireNumber;
    if (dto.requireSymbol !== undefined) patch.requireSymbol = dto.requireSymbol;
    if (dto.requireTwoFactor !== undefined) patch.requireTwoFactor = dto.requireTwoFactor;
    if (dto.enableEmailNotification !== undefined) patch.enableEmailNotification = dto.enableEmailNotification;
    if (dto.enableLineNotification !== undefined) patch.enableLineNotification = dto.enableLineNotification;
    if (dto.maintenanceMode !== undefined) patch.maintenanceMode = dto.maintenanceMode;

    if (patch.organizationName !== undefined && patch.organizationName.length < 2) {
      throw new BadRequestException('ชื่อระบบ/องค์กรต้องมีอย่างน้อย 2 ตัวอักษร');
    }

    if (patch.socialSecurityMaxBase !== undefined || patch.socialSecurityMinBase !== undefined) {
      const minBase = Number(patch.socialSecurityMinBase ?? DEFAULT_SYSTEM_SETTINGS.socialSecurityMinBase);
      const maxBase = Number(patch.socialSecurityMaxBase ?? DEFAULT_SYSTEM_SETTINGS.socialSecurityMaxBase);

      if (maxBase < minBase) {
        throw new BadRequestException('ฐานสูงสุดประกันสังคมต้องไม่น้อยกว่าฐานขั้นต่ำ');
      }
    }

    return patch;
  }

  private normalizeSettingsValue(value: unknown): SystemSettingsValue {
    const raw = this.parseJsonObject(value);

    const settings: SystemSettingsValue = {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...raw,
      fiscalYearStartMonth: Number(raw.fiscalYearStartMonth ?? DEFAULT_SYSTEM_SETTINGS.fiscalYearStartMonth),
      attendanceWeeklyHolidays: this.normalizeWeeklyHolidays(raw.attendanceWeeklyHolidays),
      attendanceCustomHolidays: DEFAULT_SYSTEM_SETTINGS.attendanceCustomHolidays,
      attendanceHolidayWorkOverrides: DEFAULT_SYSTEM_SETTINGS.attendanceHolidayWorkOverrides,
      attendanceSubstituteHolidayCredits: DEFAULT_SYSTEM_SETTINGS.attendanceSubstituteHolidayCredits,
      payrollCutoffDay: Number(raw.payrollCutoffDay ?? DEFAULT_SYSTEM_SETTINGS.payrollCutoffDay),
      payrollPeriodStartDay: Number(raw.payrollPeriodStartDay ?? DEFAULT_SYSTEM_SETTINGS.payrollPeriodStartDay),
      salaryDivisorDays: Number(raw.salaryDivisorDays ?? DEFAULT_SYSTEM_SETTINGS.salaryDivisorDays),
      workingHoursPerDay: Number(raw.workingHoursPerDay ?? DEFAULT_SYSTEM_SETTINGS.workingHoursPerDay),
      socialSecurityEmployeeRate: Number(raw.socialSecurityEmployeeRate ?? DEFAULT_SYSTEM_SETTINGS.socialSecurityEmployeeRate),
      socialSecurityEmployerRate: Number(raw.socialSecurityEmployerRate ?? DEFAULT_SYSTEM_SETTINGS.socialSecurityEmployerRate),
      socialSecurityMinBase: Number(raw.socialSecurityMinBase ?? DEFAULT_SYSTEM_SETTINGS.socialSecurityMinBase),
      socialSecurityMaxBase: Number(raw.socialSecurityMaxBase ?? DEFAULT_SYSTEM_SETTINGS.socialSecurityMaxBase),
      fileUploadMaxMb: Number(raw.fileUploadMaxMb ?? DEFAULT_SYSTEM_SETTINGS.fileUploadMaxMb),
      sessionTimeoutMinutes: Number(raw.sessionTimeoutMinutes ?? DEFAULT_SYSTEM_SETTINGS.sessionTimeoutMinutes),
      passwordMinLength: Number(raw.passwordMinLength ?? DEFAULT_SYSTEM_SETTINGS.passwordMinLength),
      allowedFileTypes: this.normalizeFileTypes(raw.allowedFileTypes),
      requireUppercase: Boolean(raw.requireUppercase ?? DEFAULT_SYSTEM_SETTINGS.requireUppercase),
      requireLowercase: Boolean(raw.requireLowercase ?? DEFAULT_SYSTEM_SETTINGS.requireLowercase),
      requireNumber: Boolean(raw.requireNumber ?? DEFAULT_SYSTEM_SETTINGS.requireNumber),
      requireSymbol: Boolean(raw.requireSymbol ?? DEFAULT_SYSTEM_SETTINGS.requireSymbol),
      requireTwoFactor: Boolean(raw.requireTwoFactor ?? DEFAULT_SYSTEM_SETTINGS.requireTwoFactor),
      enableEmailNotification: Boolean(raw.enableEmailNotification ?? DEFAULT_SYSTEM_SETTINGS.enableEmailNotification),
      enableLineNotification: Boolean(raw.enableLineNotification ?? DEFAULT_SYSTEM_SETTINGS.enableLineNotification),
      maintenanceMode: Boolean(raw.maintenanceMode ?? DEFAULT_SYSTEM_SETTINGS.maintenanceMode),
    };

    if (settings.fiscalYearStartMonth < 1 || settings.fiscalYearStartMonth > 12) {
      settings.fiscalYearStartMonth = DEFAULT_SYSTEM_SETTINGS.fiscalYearStartMonth;
    }

    if (settings.payrollCutoffDay < 1 || settings.payrollCutoffDay > 31) {
      settings.payrollCutoffDay = DEFAULT_SYSTEM_SETTINGS.payrollCutoffDay;
    }

    if (settings.payrollPeriodStartDay < 1 || settings.payrollPeriodStartDay > 31) {
      settings.payrollPeriodStartDay = DEFAULT_SYSTEM_SETTINGS.payrollPeriodStartDay;
    }

    if (settings.salaryDivisorDays < 1 || settings.salaryDivisorDays > 31) {
      settings.salaryDivisorDays = DEFAULT_SYSTEM_SETTINGS.salaryDivisorDays;
    }

    if (settings.workingHoursPerDay < 1 || settings.workingHoursPerDay > 24) {
      settings.workingHoursPerDay = DEFAULT_SYSTEM_SETTINGS.workingHoursPerDay;
    }

    if (settings.socialSecurityEmployeeRate < 0 || settings.socialSecurityEmployeeRate > 100) {
      settings.socialSecurityEmployeeRate = DEFAULT_SYSTEM_SETTINGS.socialSecurityEmployeeRate;
    }

    if (settings.socialSecurityEmployerRate < 0 || settings.socialSecurityEmployerRate > 100) {
      settings.socialSecurityEmployerRate = DEFAULT_SYSTEM_SETTINGS.socialSecurityEmployerRate;
    }

    if (settings.socialSecurityMinBase < 0) {
      settings.socialSecurityMinBase = DEFAULT_SYSTEM_SETTINGS.socialSecurityMinBase;
    }

    if (settings.socialSecurityMaxBase < 0) {
      settings.socialSecurityMaxBase = DEFAULT_SYSTEM_SETTINGS.socialSecurityMaxBase;
    }

    if (settings.socialSecurityMaxBase < settings.socialSecurityMinBase) {
      settings.socialSecurityMaxBase = settings.socialSecurityMinBase;
    }

    if (settings.fileUploadMaxMb < 1 || settings.fileUploadMaxMb > 200) {
      settings.fileUploadMaxMb = DEFAULT_SYSTEM_SETTINGS.fileUploadMaxMb;
    }

    if (settings.sessionTimeoutMinutes < 15 || settings.sessionTimeoutMinutes > 1440) {
      settings.sessionTimeoutMinutes = DEFAULT_SYSTEM_SETTINGS.sessionTimeoutMinutes;
    }

    if (settings.passwordMinLength < 6 || settings.passwordMinLength > 128) {
      settings.passwordMinLength = DEFAULT_SYSTEM_SETTINGS.passwordMinLength;
    }

    return settings;
  }

  private parseJsonObject(value: unknown): Record<string, any> {
    if (!value) {
      return {};
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    }

    return typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private normalizeWeeklyHolidays(value: unknown): HolidayWeekday[] {
    const rawItems = Array.isArray(value) ? value : DEFAULT_SYSTEM_SETTINGS.attendanceWeeklyHolidays;
    const items = rawItems
      .map((item) => String(item).trim().toUpperCase())
      .filter((item): item is HolidayWeekday =>
        HOLIDAY_WEEKDAY_VALUES.includes(item as HolidayWeekday),
      );

    return Array.from(new Set(items));
  }

  private normalizeCustomHolidays(value: unknown): AttendanceCustomHoliday[] {
    const rawItems = Array.isArray(value) ? value : DEFAULT_SYSTEM_SETTINGS.attendanceCustomHolidays;
    const normalized: AttendanceCustomHoliday[] = [];
    const seen = new Set<string>();

    for (const item of rawItems) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

      const raw = item as Record<string, unknown>;
      const date = String(raw.date ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !this.isValidDateKey(date)) continue;
      if (seen.has(date)) continue;

      const name = String(raw.name ?? '').trim() || 'วันหยุดพิเศษ';
      const holidayTypeRaw = String(raw.holidayType ?? '').trim().toUpperCase();
      const holidayType = HOLIDAY_TYPE_VALUES.includes(holidayTypeRaw as AttendanceCustomHolidayType)
        ? (holidayTypeRaw as AttendanceCustomHolidayType)
        : 'SPECIAL';
      normalized.push({ date, name, holidayType });
      seen.add(date);
    }

    return normalized.sort((a, b) => a.date.localeCompare(b.date));
  }


  private normalizeHolidayWorkOverrides(value: unknown): AttendanceHolidayWorkOverride[] {
    const rawItems = Array.isArray(value) ? value : DEFAULT_SYSTEM_SETTINGS.attendanceHolidayWorkOverrides;
    const normalized: AttendanceHolidayWorkOverride[] = [];
    const seen = new Set<string>();

    for (const item of rawItems) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

      const raw = item as Record<string, unknown>;
      const date = String(raw.date ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !this.isValidDateKey(date)) continue;

      const override: AttendanceHolidayWorkOverride = {
        date,
        name: String(raw.name ?? '').trim() || 'ทำงานในวันหยุด',
        reason: String(raw.reason ?? '').trim() || null,
        appliesToAll: Boolean(raw.appliesToAll ?? false),
        grantSubstituteHoliday: Boolean(raw.grantSubstituteHoliday ?? true),
        companyIds: this.normalizeIdList(raw.companyIds),
        branchIds: this.normalizeIdList(raw.branchIds),
        departmentIds: this.normalizeIdList(raw.departmentIds),
        divisionIds: this.normalizeIdList(raw.divisionIds),
        employeeTypeIds: this.normalizeIdList(raw.employeeTypeIds),
        employeeIds: this.normalizeIdList(raw.employeeIds),
      };

      const hasScope =
        override.appliesToAll ||
        override.companyIds.length > 0 ||
        override.branchIds.length > 0 ||
        override.departmentIds.length > 0 ||
        override.divisionIds.length > 0 ||
        override.employeeTypeIds.length > 0 ||
        override.employeeIds.length > 0;

      if (!hasScope) continue;

      const dedupeKey = [
        override.date,
        override.appliesToAll ? 'ALL' : '',
        override.companyIds.join(','),
        override.branchIds.join(','),
        override.departmentIds.join(','),
        override.divisionIds.join(','),
        override.employeeTypeIds.join(','),
        override.employeeIds.join(','),
      ].join('|');

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      normalized.push(override);
    }

    return normalized.sort((a, b) => a.date.localeCompare(b.date));
  }


  private normalizeSubstituteHolidayCredits(value: unknown): AttendanceSubstituteHolidayCredit[] {
    const rawItems = Array.isArray(value) ? value : DEFAULT_SYSTEM_SETTINGS.attendanceSubstituteHolidayCredits;
    const normalized: AttendanceSubstituteHolidayCredit[] = [];
    const seen = new Set<string>();

    for (const item of rawItems) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

      const raw = item as Record<string, unknown>;
      const employeeId = String(raw.employeeId ?? '').trim();
      const earnedDate = String(raw.earnedDate ?? raw.workDate ?? '').trim().slice(0, 10);

      if (!employeeId) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(earnedDate) || !this.isValidDateKey(earnedDate)) continue;

      const sourceType = 'WORKING_HOLIDAY_ATTENDANCE' as const;
      const statusRaw = String(raw.status ?? '').trim().toUpperCase();
      const status = SUBSTITUTE_HOLIDAY_CREDIT_STATUSES.includes(statusRaw as AttendanceSubstituteHolidayCreditStatus)
        ? (statusRaw as AttendanceSubstituteHolidayCreditStatus)
        : 'AVAILABLE';
      const id = String(raw.id ?? '').trim() || randomUUID();
      const dedupeKey = `${employeeId}|${earnedDate}|${sourceType}`;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      normalized.push({
        id,
        employeeId,
        employeeCode: this.normalizeNullableString(raw.employeeCode),
        employeeName: this.normalizeNullableString(raw.employeeName),
        earnedDate,
        holidayName: this.normalizeNullableString(raw.holidayName),
        workOverrideName: this.normalizeNullableString(raw.workOverrideName),
        reason: this.normalizeNullableString(raw.reason),
        grantedDays: this.normalizePositiveNumber(raw.grantedDays, 1),
        grantedMinutes: this.normalizePositiveNumber(raw.grantedMinutes, 480),
        status,
        sourceType,
        sourceSummaryId: this.normalizeNullableString(raw.sourceSummaryId),
        grantedAt: this.normalizeIsoDateTime(raw.grantedAt) ?? new Date().toISOString(),
        grantedById: this.normalizeNullableString(raw.grantedById),
        usedAt: this.normalizeIsoDateTime(raw.usedAt),
        usedById: this.normalizeNullableString(raw.usedById),
        cancelledAt: this.normalizeIsoDateTime(raw.cancelledAt),
        cancelledById: this.normalizeNullableString(raw.cancelledById),
        cancelledReason: this.normalizeNullableString(raw.cancelledReason),
      });
    }

    return normalized.sort((a, b) => {
      const dateCompare = b.earnedDate.localeCompare(a.earnedDate);
      if (dateCompare !== 0) return dateCompare;
      return (a.employeeCode ?? a.employeeName ?? a.employeeId).localeCompare(
        b.employeeCode ?? b.employeeName ?? b.employeeId,
        'th',
      );
    });
  }

  private normalizeIdList(value: unknown) {
    const rawItems = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : [];

    const items = rawItems
      .map((item) => String(item).trim())
      .filter(Boolean);

    return Array.from(new Set(items));
  }


  private async assertHolidaySwapScopeExists(
    scopeType: AttendanceHolidaySwapScopeType,
    scopeId: string,
  ) {
    if (scopeType === 'COMPANY') {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Company"
        WHERE "id" = ${scopeId} AND "deletedAt" IS NULL AND "status" = 'ACTIVE'
        LIMIT 1
      `;
      if (!rows[0]) throw new NotFoundException('ไม่พบบริษัทที่เลือกสำหรับสลับวันหยุด');
      return;
    }

    if (scopeType === 'BRANCH') {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Branch"
        WHERE "id" = ${scopeId} AND "deletedAt" IS NULL AND "status" = 'ACTIVE'
        LIMIT 1
      `;
      if (!rows[0]) throw new NotFoundException('ไม่พบสาขาที่เลือกสำหรับสลับวันหยุด');
      return;
    }

    if (scopeType === 'DEPARTMENT') {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Department"
        WHERE "id" = ${scopeId} AND "deletedAt" IS NULL AND "status" = 'ACTIVE'
        LIMIT 1
      `;
      if (!rows[0]) throw new NotFoundException('ไม่พบแผนกที่เลือกสำหรับสลับวันหยุด');
      return;
    }

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "employees"
      WHERE "id" = ${scopeId} AND "deletedAt" IS NULL AND "status" = 'ACTIVE'
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('ไม่พบพนักงานที่เลือกสำหรับสลับวันหยุด');
  }

  private findMatchedHolidaySwap(
    dateKey: string,
    swaps: AttendanceHolidaySwap[],
    employee: AttendanceEmployeeHolidayScope,
    side: 'ORIGINAL' | 'REPLACEMENT',
  ) {
    return swaps
      .filter((swap) => {
        if (swap.status !== 'ACTIVE') return false;
        const matchedDate = side === 'ORIGINAL'
          ? swap.originalHolidayDate === dateKey
          : swap.swappedHolidayDate === dateKey;
        return matchedDate && this.isHolidaySwapMatched(swap, employee);
      })
      .sort((a, b) => this.getHolidaySwapScopePriority(b.scopeType) - this.getHolidaySwapScopePriority(a.scopeType))[0] ?? null;
  }

  private isHolidaySwapMatched(
    swap: AttendanceHolidaySwap,
    employee: AttendanceEmployeeHolidayScope,
  ) {
    if (swap.scopeType === 'EMPLOYEE') return employee.id === swap.scopeId;
    if (swap.scopeType === 'DEPARTMENT') return employee.departmentId === swap.scopeId;
    if (swap.scopeType === 'BRANCH') return employee.branchId === swap.scopeId;
    if (swap.scopeType === 'COMPANY') return employee.companyId === swap.scopeId;
    return false;
  }

  private getHolidaySwapScopePriority(scopeType: AttendanceHolidaySwapScopeType) {
    if (scopeType === 'EMPLOYEE') return 4;
    if (scopeType === 'DEPARTMENT') return 3;
    if (scopeType === 'BRANCH') return 2;
    return 1;
  }

  private isHolidayWorkOverrideMatched(
    override: AttendanceHolidayWorkOverride,
    employee: AttendanceEmployeeHolidayScope,
  ) {
    if (override.appliesToAll) return true;
    if (employee.id && override.employeeIds.includes(employee.id)) return true;
    if (employee.companyId && override.companyIds.includes(employee.companyId)) return true;
    if (employee.branchId && override.branchIds.includes(employee.branchId)) return true;
    if (employee.departmentId && override.departmentIds.includes(employee.departmentId)) return true;
    if (employee.divisionId && override.divisionIds.includes(employee.divisionId)) return true;
    if (employee.employeeTypeId && override.employeeTypeIds.includes(employee.employeeTypeId)) return true;
    return false;
  }


  private normalizeNullableString(value: unknown) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  private normalizePositiveNumber(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  private normalizeIsoDateTime(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  private isValidDateKey(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private normalizeDateKeyOrThrow(value: string, message: string) {
    const date = String(value ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !this.isValidDateKey(date)) {
      throw new BadRequestException(message);
    }
    return date;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private toIsoString(value: Date | string) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private normalizeFileTypes(value: unknown) {
    const rawItems = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : DEFAULT_SYSTEM_SETTINGS.allowedFileTypes;

    const items = rawItems
      .map((item) => String(item).trim().replace(/^\./, '').toLowerCase())
      .filter((item) => /^[a-z0-9]+$/.test(item));

    return Array.from(new Set(items.length ? items : DEFAULT_SYSTEM_SETTINGS.allowedFileTypes));
  }
}
