import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { effectiveCompanyId } from '../../../common/tenant/tenant-scope.util';
import {
  ReportStatisticsQueryDto,
  ReportUserActivityQueryDto,
} from '../dto/report-statistics-query.dto';

/**
 * สถิติการใช้งานทั้งระบบ สำหรับหน้า "ศูนย์เอกสารและสถิติ"
 * -----------------------------------------------------------------------------
 * รวมตัวเลขที่กระจายอยู่ตามโมดูลต่าง ๆ มาไว้ที่เดียว เพื่อตอบคำถามแบบที่
 * หน้า dashboard รายโมดูลตอบไม่ได้ เช่น "เดือนนี้ทั้งบริษัทเกิดอะไรขึ้นบ้าง"
 *
 * หลักที่ยึด
 *  - **ทุกตัวเลขต้องผ่าน scope** — บัญชีระดับบริษัท/สาขาเห็นได้เฉพาะของตัวเอง
 *    ข้อมูลบางตารางไม่มี companyId ของตัวเอง (เช่น ใบลา) ต้องกรองผ่าน employee
 *  - **นับจากฐานข้อมูลตรง ๆ ไม่เก็บ cache** — หน้านี้เปิดไม่บ่อยและต้องตรงเสมอ
 *  - **ช่วงเวลาเดียวใช้ทั้งหน้า** — ตัวเลขทุกบล็อกอ้างช่วงเดียวกัน จะได้เอามาเทียบกันได้
 *    ยกเว้นยอดคงเหลือ ณ ปัจจุบัน (เช่น จำนวนพนักงาน) ที่ระบุไว้ชัดว่าเป็นยอด ณ วันนี้
 */
@Injectable()
export class ReportStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(query: ReportStatisticsQueryDto, scope: TenantScope) {
    const companyId = effectiveCompanyId(scope, query.companyId);
    const branchId = this.resolveBranchId(query.branchId, scope);
    const range = this.resolveRange(query);

    const [
      workforce,
      attendance,
      leave,
      overtime,
      payroll,
      recruitment,
      lifecycle,
      documents,
      system,
    ] = await Promise.all([
      this.buildWorkforce(companyId, branchId, range),
      this.buildAttendance(companyId, branchId, range),
      this.buildLeave(companyId, branchId, range),
      this.buildOvertime(companyId, branchId, range),
      this.buildPayroll(companyId, range),
      this.buildRecruitment(companyId, range),
      this.buildLifecycle(companyId, range),
      this.buildDocuments(companyId, range),
      this.buildSystemActivity(companyId, range),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      range: {
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
        days: range.days,
      },
      scope: { companyId: companyId ?? null, branchId: branchId ?? null },
      workforce,
      attendance,
      leave,
      overtime,
      payroll,
      recruitment,
      lifecycle,
      documents,
      system,
    };
  }

  /**
   * กิจกรรมของผู้ใช้รายคน — ใช้ตอนกดชื่อจากตาราง "ผู้ใช้ที่ใช้งานมากที่สุด"
   * ตอบคำถามว่า "คนนี้เข้าไปทำอะไรในระบบบ้าง"
   */
  async getUserActivity(
    userId: string,
    query: ReportUserActivityQueryDto,
    scope: TenantScope,
  ) {
    const companyId = effectiveCompanyId(scope, undefined);
    const range = this.resolveRange(query);

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        // User ผูกบริษัทผ่าน scopedCompanyId — บัญชีระดับบริษัทต้องเจาะดูได้เฉพาะคนของตัวเอง
        ...(companyId ? { scopedCompanyId: companyId } : {}),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        lastLoginAt: true,
        status: true,
      },
    });

    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');

    const where = {
      userId,
      createdAt: { gte: range.from, lte: range.to },
      ...(companyId ? { companyId } : {}),
    };

    const [total, failed, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count({
        where: { ...where, statusCode: { gte: 400 } },
      }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 3000,
        select: {
          action: true,
          entity: true,
          description: true,
          path: true,
          statusCode: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);

    const byAction = new Map<string, number>();
    const byEntity = new Map<string, number>();
    const byDay = new Map<string, number>();

    for (const log of logs) {
      byAction.set(log.action, (byAction.get(log.action) ?? 0) + 1);
      byEntity.set(log.entity, (byEntity.get(log.entity) ?? 0) + 1);
      const day = log.createdAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }

    return {
      user,
      range: {
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
        days: range.days,
      },
      total,
      failed,
      byAction: this.toRanked(byAction),
      byEntity: this.toRanked(byEntity),
      byDay: this.fillDays(byDay, range),
      /* รายการล่าสุดพอให้เห็นว่าทำอะไรไป ไม่ใช่หน้าตรวจสอบเต็มรูปแบบ
         ถ้าต้องไล่ทีละรายการจริง ๆ ให้ไปหน้า ตั้งค่า > บันทึกการใช้งาน */
      recent: logs.slice(0, 50),
    };
  }

  /* ------------------------------------------------------------------ */
  /* บล็อกตัวเลขแต่ละด้าน                                                */
  /* ------------------------------------------------------------------ */

  private async buildWorkforce(
    companyId: string | undefined,
    branchId: string | undefined,
    range: DateRange,
  ) {
    const base = {
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
      ...(branchId ? { branchId } : {}),
    };

    const [
      total,
      byStatus,
      byEmploymentType,
      byDepartment,
      newHires,
      separations,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { ...base, status: 'ACTIVE' } }),
      this.prisma.employee.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.employee.groupBy({
        by: ['employeeTypeId'],
        where: { ...base, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.prisma.employee.groupBy({
        by: ['departmentId'],
        where: { ...base, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.prisma.employee.count({
        where: { ...base, startDate: { gte: range.from, lte: range.to } },
      }),
      /* นับจากวันที่มีผลจริง ไม่ใช่วันที่ยื่น — คนยื่นเดือนนี้แต่ออกเดือนหน้า
         ยังไม่ถือว่าออกในช่วงนี้ และนับเฉพาะใบที่อนุมัติแล้ว */
      this.prisma.employeeResignation.count({
        where: {
          status: 'APPROVED',
          effectiveDate: { gte: range.from, lte: range.to },
          employee: { is: base },
        },
      }),
    ]);

    const [departments, employeeTypes] = await Promise.all([
      this.prisma.department.findMany({
        where: { deletedAt: null, ...(companyId ? { companyId } : {}) },
        select: { id: true, nameTh: true },
      }),
      this.prisma.employeeType.findMany({
        where: { deletedAt: null, ...(companyId ? { companyId } : {}) },
        select: { id: true, nameTh: true },
      }),
    ]);

    const departmentName = new Map(departments.map((d) => [d.id, d.nameTh]));
    const employeeTypeName = new Map(employeeTypes.map((t) => [t.id, t.nameTh]));

    return {
      activeTotal: total,
      newHires,
      separations,
      /* ยอดเข้า−ออกในช่วง บอกทิศทางกำลังคนได้ตรงกว่าดูยอดรวมอย่างเดียว */
      netChange: newHires - separations,
      byStatus: byStatus
        .map((row) => ({ key: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      byEmploymentType: byEmploymentType
        .map((row) => ({
          key: row.employeeTypeId
            ? (employeeTypeName.get(row.employeeTypeId) ?? 'ไม่ระบุ')
            : 'ไม่ระบุ',
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      byDepartment: byDepartment
        .map((row) => ({
          key: row.departmentId
            ? (departmentName.get(row.departmentId) ?? 'ไม่ระบุ')
            : 'ไม่ระบุ',
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private async buildAttendance(
    companyId: string | undefined,
    branchId: string | undefined,
    range: DateRange,
  ) {
    const where = {
      workDate: { gte: range.from, lte: range.to },
      employee: {
        is: {
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
          ...(branchId ? { branchId } : {}),
        },
      },
    };

    const [recordedDays, lateDays, absentSummary, missingLogDays, totals] =
      await Promise.all([
        this.prisma.attendanceDailySummary.count({ where }),
        this.prisma.attendanceDailySummary.count({
          where: { ...where, totalLateMinutes: { gt: 0 } },
        }),
        this.prisma.attendanceDailySummary.aggregate({
          where: { ...where, isAbsent: true },
          _count: { _all: true },
          _sum: { absentDays: true },
        }),
        this.prisma.attendanceDailySummary.count({
          where: { ...where, hasMissingLog: true },
        }),
        this.prisma.attendanceDailySummary.aggregate({
          where,
          _sum: {
            totalLateMinutes: true,
            approvedOtMinutes: true,
            payableOtMinutes: true,
            totalDeductionAmount: true,
          },
        }),
      ]);

    const absentDays = this.decimal(absentSummary._sum.absentDays);

    return {
      recordedDays,
      lateDays,
      lateMinutes: totals._sum.totalLateMinutes ?? 0,
      absentDays,
      missingLogDays,
      approvedOtHours: this.hours(totals._sum.approvedOtMinutes ?? 0),
      payableOtHours: this.hours(totals._sum.payableOtMinutes ?? 0),
      deductionAmount: this.decimal(totals._sum.totalDeductionAmount),
      /* อัตราการมาทำงาน = วันที่ไม่ขาดงาน ÷ วันที่มีบันทึกทั้งหมด
         ไม่มีบันทึกเลย = ไม่มีตัวหาร ให้เป็น null เพื่อไม่ให้หน้าจอโชว์ 0% ทั้งที่ยังไม่มีข้อมูล */
      attendanceRate:
        recordedDays > 0
          ? this.round(
              ((recordedDays - (absentSummary._count._all ?? 0)) /
                recordedDays) *
                100,
              1,
            )
          : null,
    };
  }

  private async buildLeave(
    companyId: string | undefined,
    branchId: string | undefined,
    range: DateRange,
  ) {
    const employeeScope = {
      is: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        ...(branchId ? { branchId } : {}),
      },
    };

    const where = {
      deletedAt: null,
      startDate: { gte: range.from, lte: range.to },
      employee: employeeScope,
    };

    const [byStatus, byType, approvedDays, leaveTypes] = await Promise.all([
      this.prisma.leaveRequest.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { totalDays: true },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['leaveTypeId'],
        where: { ...where, status: 'APPROVED' },
        _count: { _all: true },
        _sum: { totalDays: true },
      }),
      this.prisma.leaveRequest.aggregate({
        where: { ...where, status: 'APPROVED' },
        _sum: { totalDays: true },
      }),
      this.prisma.leaveType.findMany({
        where: { deletedAt: null, ...(companyId ? { companyId } : {}) },
        select: { id: true, nameTh: true },
      }),
    ]);

    const typeName = new Map(leaveTypes.map((t) => [t.id, t.nameTh]));

    return {
      totalRequests: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      approvedDays: this.decimal(approvedDays._sum.totalDays),
      byStatus: byStatus
        .map((row) => ({
          key: row.status,
          count: row._count._all,
          days: this.decimal(row._sum.totalDays),
        }))
        .sort((a, b) => b.count - a.count),
      byType: byType
        .map((row) => ({
          key: typeName.get(row.leaveTypeId) ?? 'ไม่ระบุ',
          count: row._count._all,
          days: this.decimal(row._sum.totalDays),
        }))
        .sort((a, b) => b.days - a.days),
    };
  }

  private async buildOvertime(
    companyId: string | undefined,
    branchId: string | undefined,
    range: DateRange,
  ) {
    const where = {
      deletedAt: null,
      workDate: { gte: range.from, lte: range.to },
      employee: {
        is: {
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
          ...(branchId ? { branchId } : {}),
        },
      },
    };

    const [byStatus, approved] = await Promise.all([
      this.prisma.overtimeRequest.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { totalHours: true },
      }),
      this.prisma.overtimeRequest.aggregate({
        where: { ...where, status: 'APPROVED' },
        _sum: { totalHours: true },
      }),
    ]);

    return {
      totalRequests: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      approvedHours: this.decimal(approved._sum.totalHours),
      byStatus: byStatus
        .map((row) => ({
          key: row.status,
          count: row._count._all,
          hours: this.decimal(row._sum.totalHours),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private async buildPayroll(companyId: string | undefined, range: DateRange) {
    const where = {
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
      createdAt: { gte: range.from, lte: range.to },
    };

    const [byStatus, totals] = await Promise.all([
      this.prisma.payrollRun.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.payrollRun.aggregate({
        where,
        _sum: {
          totalEmployees: true,
          totalGrossPay: true,
          totalNetPay: true,
          totalDeductions: true,
        },
      }),
    ]);

    return {
      totalRuns: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      paidEmployees: totals._sum.totalEmployees ?? 0,
      grossPay: this.decimal(totals._sum.totalGrossPay),
      netPay: this.decimal(totals._sum.totalNetPay),
      deductions: this.decimal(totals._sum.totalDeductions),
      byStatus: byStatus
        .map((row) => ({ key: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private async buildRecruitment(
    companyId: string | undefined,
    range: DateRange,
  ) {
    const scoped = { deletedAt: null, ...(companyId ? { companyId } : {}) };

    const [postingsByStatus, applicationsByStage, interviews, offers] =
      await Promise.all([
        this.prisma.jobPosting.groupBy({
          by: ['status'],
          where: scoped,
          _count: { _all: true },
        }),
        this.prisma.jobApplication.groupBy({
          by: ['stage'],
          where: { ...scoped, createdAt: { gte: range.from, lte: range.to } },
          _count: { _all: true },
        }),
        this.prisma.jobInterview.count({
          where: {
            deletedAt: null,
            scheduledAt: { gte: range.from, lte: range.to },
            application: { is: scoped },
          },
        }),
        this.prisma.jobOffer.count({
          where: {
            deletedAt: null,
            createdAt: { gte: range.from, lte: range.to },
            application: { is: scoped },
          },
        }),
      ]);

    return {
      openPostings:
        postingsByStatus.find((row) => row.status === 'OPEN')?._count._all ?? 0,
      newApplications: applicationsByStage.reduce(
        (sum, row) => sum + row._count._all,
        0,
      ),
      interviews,
      offers,
      hired:
        applicationsByStage.find((row) => row.stage === 'HIRED')?._count._all ??
        0,
      postingsByStatus: postingsByStatus
        .map((row) => ({ key: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      applicationsByStage: applicationsByStage
        .map((row) => ({ key: row.stage, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private async buildLifecycle(
    companyId: string | undefined,
    range: DateRange,
  ) {
    const scoped = { deletedAt: null, ...(companyId ? { companyId } : {}) };

    const [probationByStatus, offboardingByStatus, onboardingTasks] =
      await Promise.all([
        this.prisma.probationRecord.groupBy({
          by: ['status'],
          where: scoped,
          _count: { _all: true },
        }),
        this.prisma.offboardingCase.groupBy({
          by: ['status'],
          where: scoped,
          _count: { _all: true },
        }),
        this.prisma.onboardingTask.groupBy({
          by: ['status'],
          where: {
            deletedAt: null,
            ...(companyId ? { employee: { is: { companyId } } } : {}),
          },
          _count: { _all: true },
        }),
      ]);

    return {
      probationInProgress:
        probationByStatus.find((row) => row.status === 'IN_PROGRESS')?._count
          ._all ?? 0,
      offboardingInProgress:
        offboardingByStatus.find((row) => row.status === 'IN_PROGRESS')?._count
          ._all ?? 0,
      probationByStatus: probationByStatus
        .map((row) => ({ key: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      offboardingByStatus: offboardingByStatus
        .map((row) => ({ key: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      onboardingTasksByStatus: onboardingTasks
        .map((row) => ({ key: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      range: { dateFrom: range.from.toISOString() },
    };
  }

  private async buildDocuments(
    companyId: string | undefined,
    range: DateRange,
  ) {
    const inRange = { gte: range.from, lte: range.to };

    const [requestsByStatus, exportsByFormat, jobsByStatus, complaints] =
      await Promise.all([
        this.prisma.documentRequest.groupBy({
          by: ['status'],
          where: {
            deletedAt: null,
            ...(companyId ? { companyId } : {}),
            createdAt: inRange,
          },
          _count: { _all: true },
        }),
        this.prisma.exportFile.groupBy({
          by: ['format'],
          where: {
            deletedAt: null,
            ...(companyId ? { companyId } : {}),
            createdAt: inRange,
          },
          _count: { _all: true },
        }),
        this.prisma.reportJob.groupBy({
          by: ['status'],
          where: {
            deletedAt: null,
            ...(companyId ? { companyId } : {}),
            createdAt: inRange,
          },
          _count: { _all: true },
        }),
        this.prisma.complaint.count({
          where: {
            deletedAt: null,
            ...(companyId ? { companyId } : {}),
            createdAt: inRange,
          },
        }),
      ]);

    return {
      documentRequests: requestsByStatus.reduce(
        (sum, row) => sum + row._count._all,
        0,
      ),
      exportsGenerated: exportsByFormat.reduce(
        (sum, row) => sum + row._count._all,
        0,
      ),
      complaints,
      requestsByStatus: requestsByStatus
        .map((row) => ({ key: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      exportsByFormat: exportsByFormat
        .map((row) => ({ key: row.format, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      reportJobsByStatus: jobsByStatus
        .map((row) => ({ key: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * การใช้งานระบบจริง — อ่านจาก AuditLog ซึ่งบันทึกทุก request ที่ผ่าน @Audit
   *
   * ดึงแถวมานับในหน่วยความจำแทนการ groupBy หลายรอบ เพราะต้องแยกทั้ง
   * action / entity / วัน / ผู้ใช้ จากชุดเดียวกัน การยิง groupBy แยกกัน 4 ครั้ง
   * ได้ผลเท่ากันแต่ช้ากว่า และมีโอกาสไม่ตรงกันถ้ามีข้อมูลเข้ามาระหว่างนั้น
   */
  private async buildSystemActivity(
    companyId: string | undefined,
    range: DateRange,
  ) {
    const where = {
      createdAt: { gte: range.from, lte: range.to },
      ...(companyId ? { companyId } : {}),
    };

    const [total, failed, logins, failedLogins, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count({
        where: { ...where, statusCode: { gte: 400 } },
      }),
      this.prisma.auditLog.count({
        where: { ...where, action: 'LOGIN' as never },
      }),
      this.prisma.auditLog.count({
        where: { ...where, action: 'LOGIN_FAILED' as never },
      }),
      /* จำกัดจำนวนแถวไว้กันหน่วยความจำบานเมื่อช่วงเวลากว้างมาก
         ตัวเลข total/failed ด้านบนนับจากฐานข้อมูลเต็มจำนวนอยู่แล้ว
         ที่จำกัดคือเฉพาะการแจกแจง (ต่อวัน/ต่อการกระทำ/ต่อผู้ใช้) */
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20000,
        select: {
          action: true,
          entity: true,
          statusCode: true,
          createdAt: true,
          userId: true,
        },
      }),
    ]);

    const byAction = new Map<string, number>();
    const byEntity = new Map<string, number>();
    const byDay = new Map<string, number>();
    const byUser = new Map<string, { count: number; failed: number }>();

    for (const log of logs) {
      byAction.set(log.action, (byAction.get(log.action) ?? 0) + 1);
      byEntity.set(log.entity, (byEntity.get(log.entity) ?? 0) + 1);
      byDay.set(
        log.createdAt.toISOString().slice(0, 10),
        (byDay.get(log.createdAt.toISOString().slice(0, 10)) ?? 0) + 1,
      );

      if (log.userId) {
        const current = byUser.get(log.userId) ?? { count: 0, failed: 0 };
        current.count += 1;
        if ((log.statusCode ?? 0) >= 400) current.failed += 1;
        byUser.set(log.userId, current);
      }
    }

    const topUserIds = [...byUser.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 15);

    const users = topUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: topUserIds.map(([id]) => id) } },
          select: {
            id: true,
            email: true,
            displayName: true,
            lastLoginAt: true,
          },
        })
      : [];

    const userById = new Map(users.map((user) => [user.id, user]));

    return {
      totalEvents: total,
      failedEvents: failed,
      logins,
      failedLogins,
      /* เกิน take ด้านบน = การแจกแจงคิดจากรายการล่าสุดเท่านั้น ต้องบอกให้หน้าจอรู้
         ไม่งั้นผู้ใช้จะเข้าใจว่ากราฟครอบคลุมทั้งช่วง */
      breakdownTruncated: logs.length >= 20000,
      byAction: this.toRanked(byAction),
      byEntity: this.toRanked(byEntity),
      byDay: this.fillDays(byDay, range),
      topUsers: topUserIds.map(([id, stat]) => ({
        userId: id,
        email: userById.get(id)?.email ?? null,
        displayName: userById.get(id)?.displayName ?? null,
        lastLoginAt: userById.get(id)?.lastLoginAt ?? null,
        count: stat.count,
        failed: stat.failed,
      })),
    };
  }

  /* ------------------------------------------------------------------ */
  /* ตัวช่วย                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * สาขาที่ผู้ใช้ขอ ต้องไม่หลุดออกนอกสาขาของตัวเองสำหรับบัญชีระดับสาขา
   *
   * เดิมคืน undefined เมื่อบัญชีระดับสาขายังไม่ได้ผูกสาขา ซึ่งผู้เรียกตีความว่า
   * 'ไม่ต้องกรองสาขา' — บัญชีที่ตั้งค่าไม่ครบจึงเห็นสถิติของทั้งบริษัท
   * ค่าที่หายไปต้องแปลว่าไม่ให้ผ่าน ไม่ใช่ให้ผ่านทั้งหมด
   */
  private resolveBranchId(
    requested: string | undefined,
    scope: TenantScope,
  ): string | undefined {
    if (scope.level === 'BRANCH') {
      if (!scope.branchId) {
        throw new ForbiddenException(
          'บัญชีของคุณยังไม่ได้ผูกกับสาขาใด กรุณาให้ผู้ดูแลระบบกำหนดขอบเขตก่อนใช้งาน',
        );
      }

      return scope.branchId;
    }

    return requested?.trim() || undefined;
  }

  private resolveRange(query: {
    dateFrom?: string;
    dateTo?: string;
    days?: number;
  }): DateRange {
    const to = query.dateTo ? this.endOfDay(query.dateTo) : this.endOfDay();
    const from = query.dateFrom
      ? this.startOfDay(query.dateFrom)
      : new Date(
          this.startOfDay(to.toISOString().slice(0, 10)).getTime() -
            ((query.days ?? 30) - 1) * DAY_MS,
        );

    const days = Math.max(
      Math.round((to.getTime() - from.getTime()) / DAY_MS),
      1,
    );

    return { from, to, days };
  }

  private startOfDay(value?: string) {
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value?: string) {
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }

  /** เติมวันที่ไม่มีกิจกรรมเป็น 0 ไม่งั้นกราฟจะกระโดดข้ามวัน */
  private fillDays(counts: Map<string, number>, range: DateRange) {
    const result: Array<{ key: string; count: number }> = [];
    const cursor = new Date(range.from);

    while (cursor <= range.to && result.length <= 366) {
      const key = cursor.toISOString().slice(0, 10);
      result.push({ key, count: counts.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  private toRanked(counts: Map<string, number>) {
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  private decimal(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? this.round(parsed, 2) : 0;
  }

  private hours(minutes: number) {
    return this.round(minutes / 60, 2);
  }

  private round(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

type DateRange = { from: Date; to: Date; days: number };
