import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { AuditAction, UserStatus } from "../../generated/prisma/client";
import { AssignRolesDto } from "./dto/assign-roles.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { LinkUserEmployeeDto } from "./dto/link-user-employee.dto";
import { ResetUserPasswordDto } from "./dto/reset-user-password.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateUserEmailDto } from "./dto/update-user-email.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Auth("USER_MANAGE")
  @Audit({
    action: AuditAction.VIEW,
    entity: "User",
    description: "View user list",
  })
  async findAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("status") status?: UserStatus,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.usersService.findAll({
      q,
      status,
      companyId,
      branchId,
      departmentId,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      scope: actor.scope,
    });
  }

  @Get(":id")
  @Auth("USER_MANAGE")
  @Audit({
    action: AuditAction.VIEW,
    entity: "User",
    description: "View user detail",
  })
  async findOne(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.findOne(id, actor.scope);
  }

  @Post()
  @Auth("USER_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "User",
    description: "Create user",
  })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.create(dto, actor.scope);
  }

  @Patch(":id")
  @Auth("USER_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "User",
    description: "Update user",
  })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, actor.scope);
  }

  @Patch(":id/email")
  @Auth("USER_MANAGE")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: "users:update-email",
    limit: 20,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: "เปลี่ยนอีเมลผู้ใช้บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  })
  @Audit({
    action: AuditAction.UPDATE,
    entity: "User",
    description: "Update user login email",
  })
  async updateEmail(
    @Param("id") id: string,
    @Body() dto: UpdateUserEmailDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updateEmail(id, dto, actor);
  }

  @Patch(":id/password")
  @Auth("USER_MANAGE")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: "users:reset-password",
    limit: 10,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: "รีเซ็ตรหัสผ่านผู้ใช้บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  })
  @Audit({
    action: AuditAction.UPDATE,
    entity: "User",
    description: "Reset user password",
  })
  async resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.resetPassword(id, dto, actor);
  }

  @Patch(":id/link-employee")
  @Auth("USER_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "User",
    description: "Link user with employee",
  })
  async linkEmployee(
    @Param("id") id: string,
    @Body() dto: LinkUserEmployeeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.linkEmployee(id, dto, actor.scope);
  }

  @Patch(":id/unlink-employee")
  @Auth("USER_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "User",
    description: "Unlink user from employee",
  })
  async unlinkEmployee(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.unlinkEmployee(id, actor.scope);
  }

  @Patch(":id/roles")
  @Auth("USER_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "User",
    description: "Assign user roles",
  })
  async assignRoles(
    @Param("id") id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.assignRoles(id, dto, actor.scope);
  }

  @Delete(":id")
  @Auth("USER_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "User",
    description: "Soft delete user",
  })
  async softDelete(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.softDelete(id, actor.scope);
  }
}