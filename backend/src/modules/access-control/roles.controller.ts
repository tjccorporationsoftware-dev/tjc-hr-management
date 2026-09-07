import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { AuditAction } from "../../generated/prisma/client";
import { AccessControlService } from "./access-control.service";
import { AssignRolePermissionsDto } from "./dto/assign-role-permissions.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";

@Controller("roles")
export class RolesController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get()
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Role",
    description: "View role list",
  })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("isActive") isActive?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.accessControlService.findRoles({
      q,
      isActive:
        isActive === undefined
          ? undefined
          : isActive === "true" || isActive === "1",
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      scope: user.scope,
    });
  }

  @Get(":id")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Role",
    description: "View role detail",
  })
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessControlService.findRoleById(id, user.scope);
  }

  @Post()
  @Auth("ROLE_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "Role",
    description: "Create role",
  })
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessControlService.createRole(dto, user.scope, user.permissions);
  }

  @Patch(":id")
  @Auth("ROLE_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Role",
    description: "Update role",
  })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessControlService.updateRole(id, dto, user.scope);
  }

  @Patch(":id/permissions")
  @Auth("ROLE_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Role",
    description: "Assign role permissions",
  })
  async assignPermissions(
    @Param("id") id: string,
    @Body() dto: AssignRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessControlService.assignPermissions(
      id,
      dto,
      user.scope,
      user.permissions,
    );
  }
}