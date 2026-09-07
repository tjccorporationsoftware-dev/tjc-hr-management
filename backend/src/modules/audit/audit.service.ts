import { Injectable } from "@nestjs/common";
import type { AuditAction, Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditCriticalActionsQueryDto } from "./dto/audit-critical-actions-query.dto";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import { AuditSummaryQueryDto } from "./dto/audit-summary-query.dto";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";

type CreateAuditLogInput = {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  description?: string | null;
  userId?: string | null;
  /** บริษัทที่การกระทำเกิดขึ้น — ว่างได้สำหรับงานระดับแพลตฟอร์ม */
  companyId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  metadata?: Prisma.InputJsonValue;
};


const CRITICAL_ENTITIES = [
  "Auth",
  "ApiError",
  "Payroll",
  "PayrollRun",
  "PayrollItem",
  "PayrollPayslip",
  "AttendancePolicy",
  "AttendanceDailySummary",
  "AttendanceLog",
  "SystemSettings",
  "Role",
  "Permission",
  "User",
  "EmployeeDocument",
];

const PAYROLL_ENTITIES = [
  "Payroll",
  "PayrollRun",
  "PayrollItem",
  "PayrollPayslip",
  "PayrollAdjustment",
  "PayrollTax",
  "PayrollTaxYear",
  "PayrollTaxBracket",
  "PayrollTaxAllowanceType",
  "EmployeeTaxProfile",
  "EmployeeTaxAllowance",
];

const ATTENDANCE_ENTITIES = [
  "AttendancePolicy",
  "AttendanceDailySummary",
  "AttendanceLog",
];

const SECURITY_ACTIONS: AuditAction[] = [
  "LOGIN" as AuditAction,
  "LOGIN_FAILED" as AuditAction,
  "LOGIN_LOCKED" as AuditAction,
  "LOGOUT" as AuditAction,
  "TWO_FACTOR_REQUIRED" as AuditAction,
  "TWO_FACTOR_SUCCESS" as AuditAction,
  "TWO_FACTOR_FAILED" as AuditAction,
];

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async createLog(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        description: input.description ?? null,
        userId: input.userId ?? null,
        companyId: input.companyId ?? null,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        method: input.method ?? null,
        path: input.path ?? null,
        statusCode: input.statusCode ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async findLogs(query: AuditLogQueryDto, scope?: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const where = this.applyScopeToAuditWhere(
      this.buildAuditWhere(query),
      scope,
    );

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const userIds = Array.from(
      new Set(
        logs
          .map((log) => log.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
          },
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        })
      : [];

    const userMap = new Map(users.map((user) => [user.id, user]));

    return {
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        description: log.description,
        userId: log.userId,
        user: log.userId ? userMap.get(log.userId) ?? null : null,
        requestId: log.requestId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        method: log.method,
        path: log.path,
        statusCode: log.statusCode,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getSummary(query: AuditSummaryQueryDto, scope?: TenantScope) {
    const days = Math.min(Math.max(Number(query.days ?? 7), 1), 90);
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: Prisma.AuditLogWhereInput = this.applyScopeToAuditWhere(
      {
        createdAt: {
          gte: dateFrom,
        },
      },
      scope,
    );

    const [total, failedOrError, securityEvents, recentLogs] =
      await this.prisma.$transaction([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.count({
          where: {
            ...where,
            OR: [
              {
                statusCode: {
                  gte: 400,
                },
              },
              {
                action: {
                  in: [
                    "LOGIN_FAILED" as AuditAction,
                    "LOGIN_LOCKED" as AuditAction,
                    "TWO_FACTOR_FAILED" as AuditAction,
                  ],
                },
              },
            ],
          },
        }),
        this.prisma.auditLog.count({
          where: {
            ...where,
            action: {
              in: SECURITY_ACTIONS,
            },
          },
        }),
        this.prisma.auditLog.findMany({
          where,
          orderBy: {
            createdAt: "desc",
          },
          take: 5000,
          select: {
            action: true,
            entity: true,
            statusCode: true,
            createdAt: true,
          },
        }),
      ]);

    const actionCounts = new Map<string, number>();
    const entityCounts = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    const dailyCounts = new Map<string, number>();

    for (const log of recentLogs) {
      actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1);
      entityCounts.set(log.entity, (entityCounts.get(log.entity) ?? 0) + 1);

      const statusKey = log.statusCode
        ? String(log.statusCode)
        : "NO_STATUS";

      statusCounts.set(statusKey, (statusCounts.get(statusKey) ?? 0) + 1);

      const dayKey = log.createdAt.toISOString().slice(0, 10);
      dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);
    }

    return {
      days,
      dateFrom,
      dateTo: new Date(),
      total,
      failedOrError,
      securityEvents,
      successEvents: Math.max(total - failedOrError, 0),
      byAction: this.mapToSortedItems(actionCounts),
      byEntity: this.mapToSortedItems(entityCounts),
      byStatusCode: this.mapToSortedItems(statusCounts),
      byDay: Array.from(dailyCounts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => ({
          key,
          count,
        })),
    };
  }


  async getCriticalActions(
    query: AuditCriticalActionsQueryDto,
    scope?: TenantScope,
  ) {
    const days = Math.min(Math.max(Number(query.days ?? 7), 1), 90);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const baseWhere: Prisma.AuditLogWhereInput = this.applyScopeToAuditWhere(
      {
        createdAt: {
          gte: dateFrom,
        },
      },
      scope,
    );

    const criticalWhere: Prisma.AuditLogWhereInput = {
      ...baseWhere,
      OR: [
        {
          statusCode: {
            gte: 400,
          },
        },
        {
          action: {
            in: SECURITY_ACTIONS,
          },
        },
        {
          entity: {
            in: CRITICAL_ENTITIES,
          },
        },
      ],
    };

    const [
      totalCritical,
      apiErrors,
      failedLogins,
      payrollActions,
      attendanceActions,
      recentLogs,
    ] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where: criticalWhere }),
      this.prisma.auditLog.count({
        where: {
          ...baseWhere,
          OR: [
            { entity: "ApiError" },
            { statusCode: { gte: 500 } },
          ],
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...baseWhere,
          action: {
            in: [
              "LOGIN_FAILED" as AuditAction,
              "LOGIN_LOCKED" as AuditAction,
              "TWO_FACTOR_FAILED" as AuditAction,
            ],
          },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...baseWhere,
          entity: {
            in: PAYROLL_ENTITIES,
          },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...baseWhere,
          entity: {
            in: ATTENDANCE_ENTITIES,
          },
        },
      }),
      this.prisma.auditLog.findMany({
        where: criticalWhere,
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      }),
    ]);

    const byAction = new Map<string, number>();
    const byEntity = new Map<string, number>();

    for (const log of recentLogs) {
      byAction.set(log.action, (byAction.get(log.action) ?? 0) + 1);
      byEntity.set(log.entity, (byEntity.get(log.entity) ?? 0) + 1);
    }

    const userIds = Array.from(
      new Set(
        recentLogs
          .map((log) => log.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
          },
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        })
      : [];

    const userMap = new Map(users.map((user) => [user.id, user]));

    return {
      days,
      dateFrom,
      dateTo: new Date(),
      totalCritical,
      apiErrors,
      failedLogins,
      payrollActions,
      attendanceActions,
      byAction: this.mapToSortedItems(byAction),
      byEntity: this.mapToSortedItems(byEntity),
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        description: log.description,
        userId: log.userId,
        user: log.userId ? userMap.get(log.userId) ?? null : null,
        requestId: log.requestId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        method: log.method,
        path: log.path,
        statusCode: log.statusCode,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
    };
  }

/**
   * จำกัดบันทึกให้เห็นเฉพาะบริษัทของผู้เรียก
   *
   * เดิม endpoint ของ audit ไม่มี tenant scope เลย มีแค่สิทธิ์ ORG_MANAGE
   * ผู้ดูแลของบริษัทหนึ่งจึงอ่านบันทึกของทุกบริษัทได้ รวมถึงเส้นทาง path
   * และ metadata ที่บอกว่าอีกบริษัททำอะไรอยู่
   *
   * แถวเก่าที่ยังไม่มี companyId จะเห็นได้เฉพาะระดับแพลตฟอร์ม (GLOBAL)
   * เพราะเดาไม่ได้ว่าเป็นของบริษัทไหน การเดาแล้วโชว์ผิดบริษัทแย่กว่าไม่โชว์
   */
  private applyScopeToAuditWhere(
    where: Prisma.AuditLogWhereInput,
    scope?: TenantScope,
  ): Prisma.AuditLogWhereInput {
    if (!scope || scope.level === "GLOBAL") return where;

    return { ...where, companyId: scope.companyId ?? undefined };
  }

  private buildAuditWhere(query: AuditLogQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.action) {
      where.action = query.action;
    }

    if (query.entity) {
      where.entity = {
        contains: query.entity.trim(),
        mode: "insensitive",
      };
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.ipAddress) {
      where.ipAddress = {
        contains: query.ipAddress.trim(),
        mode: "insensitive",
      };
    }

    if (query.statusCode) {
      where.statusCode = query.statusCode;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    if (query.securityOnly) {
      where.action = {
        in: SECURITY_ACTIONS,
      };
    }

    if (query.q?.trim()) {
      const q = query.q.trim();

      where.OR = [
        {
          entity: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          entityId: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          requestId: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          ipAddress: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          userAgent: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          method: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          path: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          userId: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    return where;
  }

  private mapToSortedItems(map: Map<string, number>) {
    return Array.from(map.entries())
      .map(([key, count]) => ({
        key,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }
}