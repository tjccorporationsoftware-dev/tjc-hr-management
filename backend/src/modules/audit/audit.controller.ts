import { Controller, Delete, Get, Query } from "@nestjs/common";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { AuditAction } from "../../generated/prisma/client";
import { AuditCriticalActionsQueryDto } from "./dto/audit-critical-actions-query.dto";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import { AuditPurgeQueryDto } from "./dto/audit-purge-query.dto";
import { AuditSummaryQueryDto } from "./dto/audit-summary-query.dto";
import { AuditService } from "./audit.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";

@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("logs")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AuditLog",
    description: "View audit logs",
  })
  async findLogs(
    @Query() query: AuditLogQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auditService.findLogs(query, user.scope);
  }

  @Get("summary")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AuditLog",
    description: "View audit summary",
  })
  async getSummary(
    @Query() query: AuditSummaryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auditService.getSummary(query, user.scope);
  }

  @Get("critical-actions")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AuditLog",
    description: "View critical audit actions",
  })
  async getCriticalActions(
    @Query() query: AuditCriticalActionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auditService.getCriticalActions(query, user.scope);
  }

  @Delete("logs")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "AuditLog",
    description: "ล้างประวัติการใช้งาน",
  })
  async purgeLogs(
    @Query() query: AuditPurgeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auditService.purgeLogs(query, user.scope);
  }
}
