import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AttendanceSummaryQueueService } from './attendance-summary-queue.service';

export type AttendancePolicyImpact = {
  id: string;
  companyId: string;
  branchId?: string | null;
  employeeTypeId?: string | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
};

export type AttendanceHolidayImpactScopeType =
  | 'ALL'
  | 'COMPANY'
  | 'BRANCH'
  | 'DEPARTMENT'
  | 'DIVISION'
  | 'EMPLOYEE_TYPE'
  | 'EMPLOYEE';

@Injectable()
export class AttendanceRecalculationScopeService {
  private readonly logger = new Logger(
    AttendanceRecalculationScopeService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceSummaryQueue: AttendanceSummaryQueueService,
  ) {}

  async enqueuePolicyImpact(params: {
    policies: AttendancePolicyImpact[];
    requestedById: string;
    sourceId: string;
    sourceAction: string;
  }) {
    const uniqueSummaries = new Map<
      string,
      { employeeId: string; workDate: Date }
    >();
    const prisma = this.prisma as any;

    for (const policy of params.policies) {
      const rows = await prisma.attendanceDailySummary.findMany({
        where: {
          workDate: {
            gte: this.toDateOnly(policy.effectiveFrom),
            ...(policy.effectiveTo
              ? { lte: this.toDateOnly(policy.effectiveTo) }
              : {}),
          },
          lockedAt: null,
          sentToPayrollAt: null,
          payrollRunId: null,
          reviewStatus: { notIn: ['LOCKED', 'SENT_TO_PAYROLL'] },
          employee: {
            companyId: policy.companyId,
            deletedAt: null,
            ...(policy.branchId ? { branchId: policy.branchId } : {}),
            ...(policy.employeeTypeId
              ? { employeeTypeId: policy.employeeTypeId }
              : {}),
          },
        },
        select: { employeeId: true, workDate: true },
      });

      for (const row of rows) {
        uniqueSummaries.set(
          `${row.employeeId}:${this.toDateKey(row.workDate)}`,
          row,
        );
      }
    }

    return this.enqueueRows({
      rows: [...uniqueSummaries.values()],
      requestedById: params.requestedById,
      sourceType: 'ATTENDANCE_POLICY',
      sourceId: params.sourceId,
      sourceAction: params.sourceAction,
    });
  }

  async enqueuePolicyById(params: {
    policyId: string;
    requestedById: string;
    sourceId?: string | null;
    sourceAction: string;
  }) {
    const prisma = this.prisma as any;
    const policy = await prisma.attendancePolicy.findFirst({
      where: { id: params.policyId },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        employeeTypeId: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });

    if (!policy) return { queued: 0, failed: 0 };

    return this.enqueuePolicyImpact({
      policies: [policy],
      requestedById: params.requestedById,
      sourceId: params.sourceId ?? params.policyId,
      sourceAction: params.sourceAction,
    });
  }

  async enqueueCompanyAttendanceSummaries(params: {
    companyId: string;
    requestedById: string;
    sourceId: string;
    sourceAction: string;
  }) {
    const prisma = this.prisma as any;

    /*
     * อ่านทีละหน้า ไม่โหลดสรุปรายวันทั้งบริษัทขึ้นมาพร้อมกัน
     *
     * ตารางสรุปรายวันโตวันละ 1 แถวต่อพนักงานหนึ่งคนและไม่มีเพดาน
     * บริษัท 200 คนที่ใช้ระบบมา 2 ปีมีเกินแสนแถว การดึงทั้งหมดมาไว้
     * ในหน่วยความจำก่อนค่อยทยอยเข้าคิว ทำให้ทั้งกระบวนการล้มได้ตั้งแต่ยังไม่เริ่ม
     */
    const pageSize = 500;

    let queued = 0;
    let failed = 0;
    let cursor: { employeeId: string; workDate: Date } | null = null;

    for (;;) {
      const rows: Array<{ employeeId: string; workDate: Date }> =
        await prisma.attendanceDailySummary.findMany({
          where: {
            lockedAt: null,
            sentToPayrollAt: null,
            payrollRunId: null,
            reviewStatus: { notIn: ['LOCKED', 'SENT_TO_PAYROLL'] },
            employee: {
              companyId: params.companyId,
              deletedAt: null,
            },
          },
          select: { employeeId: true, workDate: true },
          take: pageSize,
          // เรียงด้วยคู่คีย์เดียวกับ unique ของตาราง เพื่อให้ cursor เดินหน้าได้แน่นอน
          orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
          ...(cursor
            ? {
                cursor: {
                  employeeId_workDate: {
                    employeeId: cursor.employeeId,
                    workDate: cursor.workDate,
                  },
                },
                skip: 1,
              }
            : {}),
        });

      if (rows.length === 0) break;

      cursor = rows[rows.length - 1] ?? null;

      const result = await this.enqueueRows({
        rows,
        requestedById: params.requestedById,
        sourceType: 'HOLIDAY',
        sourceId: params.sourceId,
        sourceAction: params.sourceAction,
      });

      queued += result.queued;
      failed += result.failed;

      if (rows.length < pageSize) break;
    }

    return { queued, failed };
  }

  async enqueueHolidayDateImpact(params: {
    companyId: string;
    workDate: Date | string;
    requestedById: string;
    sourceId: string;
    sourceAction: string;
    scopeType?: AttendanceHolidayImpactScopeType;
    scopeIds?: string[];
  }) {
    const prisma = this.prisma as any;
    const scopeType = params.scopeType ?? 'ALL';
    const scopeIds = Array.from(
      new Set((params.scopeIds ?? []).map((value) => String(value).trim()).filter(Boolean)),
    );
    const employeeWhere: Record<string, unknown> = {
      companyId: params.companyId,
      deletedAt: null,
      status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] },
    };

    if (scopeType === 'BRANCH' && scopeIds.length) {
      employeeWhere.branchId = { in: scopeIds };
    } else if (scopeType === 'DEPARTMENT' && scopeIds.length) {
      employeeWhere.departmentId = { in: scopeIds };
    } else if (scopeType === 'DIVISION' && scopeIds.length) {
      employeeWhere.divisionId = { in: scopeIds };
    } else if (scopeType === 'EMPLOYEE_TYPE' && scopeIds.length) {
      employeeWhere.employeeTypeId = { in: scopeIds };
    } else if (scopeType === 'EMPLOYEE' && scopeIds.length) {
      employeeWhere.id = { in: scopeIds };
    }

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true },
    });
    const workDate = this.toDateOnly(params.workDate);

    return this.enqueueRows({
      rows: employees.map((employee: { id: string }) => ({
        employeeId: employee.id,
        workDate,
      })),
      requestedById: params.requestedById,
      sourceType: 'HOLIDAY',
      sourceId: params.sourceId,
      sourceAction: params.sourceAction,
    });
  }

  private async enqueueRows(params: {
    rows: Array<{ employeeId: string; workDate: Date }>;
    requestedById: string;
    sourceType: 'ATTENDANCE_POLICY' | 'HOLIDAY';
    sourceId: string;
    sourceAction: string;
  }) {
    let queued = 0;
    let failed = 0;
    const batchSize = 25;

    for (let index = 0; index < params.rows.length; index += batchSize) {
      const batch = params.rows.slice(index, index + batchSize);
      const results = await Promise.allSettled(
        batch.map((row) =>
          this.attendanceSummaryQueue.enqueueDailySummaryRecalculation({
            employeeId: row.employeeId,
            workDate: this.toDateKey(row.workDate),
            requestedById: params.requestedById,
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            sourceAction: params.sourceAction,
          }),
        ),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') queued += 1;
        else failed += 1;
      }
    }

    if (failed > 0) {
      this.logger.warn(
        `ส่งงานคำนวณ Attendance จาก ${params.sourceType} ไม่สำเร็จ ${failed} รายการ`,
      );
    }

    return { queued, failed };
  }

  private toDateOnly(value: Date | string) {
    const key = value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
    return new Date(`${key}T00:00:00.000Z`);
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
