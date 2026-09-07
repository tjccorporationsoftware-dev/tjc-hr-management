import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";
import { assertWithinScope } from "../../common/tenant/tenant-scope.util";
import { PrismaService } from "../../database/prisma.service";
import {
  AttendanceImportStatus,
  AuditAction,
} from "../../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { AttendanceSummaryQueueService } from "./attendance-summary-queue.service";
import type { CompleteAttendanceImportDto } from "./dto/complete-attendance-import.dto";

@Injectable()
export class AttendanceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceSummaryQueue: AttendanceSummaryQueueService,
    private readonly auditService: AuditService,
  ) {}

  async completeImport(
    importId: string,
    dto: CompleteAttendanceImportDto,
    currentUserId: string,
    tenantScope: TenantScope,
  ) {
    const attendanceImport = await this.prisma.attendanceImport.findUnique({
      where: { id: importId },
    });

    if (!attendanceImport) {
      throw new NotFoundException("ไม่พบรายการนำเข้าข้อมูล Attendance");
    }

    if (attendanceImport.status === AttendanceImportStatus.CANCELLED) {
      throw new BadRequestException("รายการนำเข้านี้ถูกยกเลิกแล้ว");
    }

    const uniqueRows = Array.from(
      new Map(
        dto.rows.map((row) => [
          `${row.employeeId}:${row.workDate.slice(0, 10)}`,
          {
            employeeId: row.employeeId,
            workDate: row.workDate.slice(0, 10),
            attendanceLogId: row.attendanceLogId ?? null,
          },
        ]),
      ).values(),
    );

    const employeeIds = Array.from(
      new Set(uniqueRows.map((row) => row.employeeId)),
    );
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
      },
    });

    if (employees.length !== employeeIds.length) {
      throw new BadRequestException(
        "พบพนักงานในผลนำเข้าที่ไม่มีอยู่หรือถูกปิดใช้งาน",
      );
    }

    for (const employee of employees) {
      assertWithinScope(tenantScope, {
        companyId: employee.companyId,
        branchId: employee.branchId,
      });
    }

    const logIds = uniqueRows
      .map((row) => row.attendanceLogId)
      .filter((value): value is string => Boolean(value));
    if (logIds.length > 0) {
      const logs = await this.prisma.attendanceLog.findMany({
        where: { id: { in: logIds } },
        select: { id: true, employeeId: true, workDate: true },
      });
      const logMap = new Map(logs.map((log) => [log.id, log]));

      for (const row of uniqueRows) {
        if (!row.attendanceLogId) continue;
        const log = logMap.get(row.attendanceLogId);
        if (
          !log ||
          log.employeeId !== row.employeeId ||
          log.workDate.toISOString().slice(0, 10) !== row.workDate
        ) {
          throw new BadRequestException(
            `รายการลงเวลาที่นำเข้าไม่สัมพันธ์กับพนักงานหรือวันที่: ${row.attendanceLogId}`,
          );
        }
      }
    }

    await this.prisma.attendanceImport.update({
      where: { id: importId },
      data: {
        status: AttendanceImportStatus.PROCESSING,
        totalRows: dto.totalRows ?? attendanceImport.totalRows,
        importedRows: dto.importedRows ?? attendanceImport.importedRows,
        errorRows: dto.errorRows ?? attendanceImport.errorRows,
        errorMessage: dto.errorMessage?.trim() || null,
      },
    });

    const queueResults = await Promise.allSettled(
      uniqueRows.map((row) =>
        this.attendanceSummaryQueue.enqueueDailySummaryRecalculation({
          employeeId: row.employeeId,
          workDate: row.workDate,
          requestedById: currentUserId,
          sourceType: "ATTENDANCE_IMPORT",
          sourceId: importId,
          sourceAction: "IMPORT_COMPLETED",
        }),
      ),
    );
    const queued = queueResults.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const queueFailed = queueResults.length - queued;

    const updatedImport = await this.prisma.attendanceImport.update({
      where: { id: importId },
      data: {
        status: AttendanceImportStatus.COMPLETED,
        errorMessage:
          queueFailed > 0
            ? [
                dto.errorMessage?.trim(),
                `ส่งงานคำนวณ Attendance ไม่สำเร็จ ${queueFailed} รายการ`,
              ]
                .filter(Boolean)
                .join(" | ")
            : dto.errorMessage?.trim() || null,
      },
    });

    await this.auditService.createLog({
      action: AuditAction.IMPORT,
      entity: "AttendanceImport",
      entityId: importId,
      userId: currentUserId,
      description:
        "ปิดงานนำเข้าข้อมูล Attendance และส่งวันที่ได้รับผลกระทบเข้าคิวคำนวณใหม่",
      metadata: {
        eventCode: "ATTENDANCE_IMPORT_RECALCULATION_QUEUED",
        affectedDateCount: uniqueRows.length,
        queued,
        queueFailed,
        employeeCount: employeeIds.length,
      },
    });

    return {
      import: updatedImport,
      affectedDateCount: uniqueRows.length,
      employeeCount: employeeIds.length,
      queued,
      queueFailed,
    };
  }
}
