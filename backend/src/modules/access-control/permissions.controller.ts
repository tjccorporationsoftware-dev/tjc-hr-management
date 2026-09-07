import { Controller, Get, Query } from "@nestjs/common";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { AuditAction } from "../../generated/prisma/client";
import { AccessControlService } from "./access-control.service";

@Controller("permissions")
export class PermissionsController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get()
  @Auth("ROLE_MANAGE")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Permission",
    description: "View permission list",
  })
  async findAll(
    @Query("q") q?: string,
    @Query("group") group?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.accessControlService.findPermissions({
      q,
      group,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
  }

  @Get("groups")
  @Auth("ROLE_MANAGE")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Permission",
    description: "View permission groups",
  })
  async findGroups() {
    return this.accessControlService.findPermissionGroups();
  }
}