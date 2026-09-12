import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type {
  AuthenticatedUser,
  TenantScope,
} from "../../common/interfaces/authenticated-user.interface";
import {
  assertCanManageScope,
  normalizeScopeAssignment,
  tenantWhere,
} from "../../common/tenant/tenant-scope.util";
import { PrismaService } from "../../database/prisma.service";
import { Prisma, UserStatus } from "../../generated/prisma/client";
import { AssignRolesDto } from "./dto/assign-roles.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { LinkUserEmployeeDto } from "./dto/link-user-employee.dto";
import { ResetUserPasswordDto } from "./dto/reset-user-password.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateUserEmailDto } from "./dto/update-user-email.dto";
import { normalizeEmail as normalizeEmailValue } from '../../common/utils/email.util';

type UserWithRelations = Prisma.UserGetPayload<{
  include: ReturnType<UsersService["userInclude"]>;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    q?: string;
    status?: UserStatus;
    /** กรองตามบริษัทที่บัญชีดูแล — ใช้ที่ Platform Console ซึ่งเห็นข้ามบริษัท */
    companyId?: string;
    branchId?: string;
    departmentId?: string;
    page?: number;
    pageSize?: number;
    scope?: TenantScope;
  }) {
    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize ?? 20), 1), 100);
    const q = params.q?.trim();
    const branchId = params.branchId?.trim();
    const departmentId = params.departmentId?.trim();

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      // Tenant boundary ตามลำดับชั้น:
      //   COMPANY -> เห็นทุกผู้ใช้ในบริษัทตน (ทุกสาขา + ระดับบริษัท)
      //   BRANCH  -> เห็นเฉพาะผู้ใช้ที่ scope อยู่สาขาตน (ไม่เห็นระดับบริษัท/สาขาอื่น)
      ...(params.scope
        ? tenantWhere(params.scope, {
            companyField: "scopedCompanyId",
            branchField: "scopedBranchId",
          })
        : {}),
      ...(params.status ? { status: params.status } : {}),
      /*
       * กรองบริษัทจากขอบเขตของบัญชีเอง ไม่ใช่จากบริษัทของพนักงาน
       * เพราะบัญชีผู้ดูแลบริษัทไม่มีพนักงานผูกอยู่ ถ้ากรองผ่าน employee
       * คนกลุ่มนี้จะหายไปทั้งหมดพอดี
       */
      ...(params.companyId?.trim()
        ? { scopedCompanyId: params.companyId.trim() }
        : {}),
      // กรองตามสาขา/แผนกของพนักงานที่ผูกกับบัญชี
      // บัญชีที่ยังไม่ผูกพนักงานจะหลุดออกไปเอง เพราะ relation filter บังคับให้ต้องมี employee
      ...(branchId || departmentId
        ? {
            employee: {
              is: {
                ...(branchId ? { branchId } : {}),
                ...(departmentId ? { departmentId } : {}),
              },
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              {
                email: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                displayName: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                phone: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                employee: {
                  is: {
                    OR: [
                      {
                        employeeCode: {
                          contains: q,
                          mode: "insensitive",
                        },
                      },
                      {
                        firstName: {
                          contains: q,
                          mode: "insensitive",
                        },
                      },
                      {
                        lastName: {
                          contains: q,
                          mode: "insensitive",
                        },
                      },
                      {
                        nickname: {
                          contains: q,
                          mode: "insensitive",
                        },
                      },
                      {
                        displayName: {
                          contains: q,
                          mode: "insensitive",
                        },
                      },
                      {
                        phone: {
                          contains: q,
                          mode: "insensitive",
                        },
                      },
                      {
                        position: {
                          contains: q,
                          mode: "insensitive",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [users, total, active, inactive, suspended, linked] =
      await this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          include: this.userInclude(),
          /*
           * เรียงให้ตรงกับที่หน้าเว็บจัดกลุ่ม (สาขา → แผนก ของพนักงานที่ผูกกับบัญชี)
           *
           * เดิมเรียงตามวันที่สร้างบัญชี ซึ่งไม่เกี่ยวกับการจัดกลุ่มเลย พอแบ่งหน้า
           * หัวข้อสาขาเดียวกันจึงโผล่ซ้ำหลายหน้าและตัวเลขต่อกลุ่มอ่านแล้วสับสน
           *
           * ผู้บริหารขึ้นก่อนเหมือนทะเบียนพนักงาน: ชั้นแผนกใช้ sortOrder ของทะเบียน
           * แผนกมาตรฐาน (บริหาร = 10 มาก่อนทุกแผนก) ชั้นคนใช้ระดับตำแหน่ง (1 = สูงสุด)
           *
           * บัญชีที่ยังไม่ผูกพนักงาน (ผู้ดูแลระบบ) ไม่มีสาขา/แผนก จึงไปอยู่ท้ายสุด
           */
          orderBy: [
            { employee: { branch: { nameTh: "asc" } } },
            { employee: { department: { catalog: { sortOrder: "asc" } } } },
            { employee: { department: { nameTh: "asc" } } },
            { employee: { positionMaster: { level: "asc" } } },
            { employee: { employeeCode: "asc" } },
            { createdAt: "desc" },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.user.count({ where }),
        this.prisma.user.count({
          where: {
            ...where,
            status: "ACTIVE",
          },
        }),
        this.prisma.user.count({
          where: {
            ...where,
            status: "INACTIVE",
          },
        }),
        this.prisma.user.count({
          where: {
            ...where,
            status: "SUSPENDED",
          },
        }),
        this.prisma.user.count({
          where: {
            ...where,
            employee: {
              isNot: null,
            },
          },
        }),
      ]);

    return {
      data: users.map((user) => this.mapUser(user)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        total,
        active,
        inactive,
        suspended,
        linked,
        unlinked: Math.max(total - linked, 0),
      },
    };
  }

  async findOne(id: string, scope?: TenantScope) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(scope
          ? tenantWhere(scope, {
              companyField: "scopedCompanyId",
              branchField: "scopedBranchId",
            })
          : {}),
      },
      include: this.userInclude(),
    });

    if (!user) {
      throw new NotFoundException("ไม่พบผู้ใช้งาน");
    }

    return this.mapUser(user);
  }

  async create(dto: CreateUserDto, actorScope: TenantScope) {
    const roleCodes = this.normalizeRoleCodes(dto.roleCodes ?? ["EMPLOYEE"]);
    this.assertCanAssignRoles(actorScope, roleCodes);
    const roles = await this.findRolesByCodes(roleCodes, actorScope);

    const employee = dto.employeeId
      ? await this.getEmployeeForLink(dto.employeeId)
      : null;

    // กำหนด tenant scope ของ user ใหม่ + บังคับลำดับชั้นการสร้าง
    const targetScope = await this.resolveTargetScope(dto, employee, actorScope);

    const email = this.resolveUserEmail(dto.email, employee);
    const displayName = this.resolveUserDisplayName(dto.displayName, employee);
    const phone = employee?.phone?.trim() || dto.phone?.trim() || null;

    await this.ensureEmailAvailable(email);

    // ต้องตรวจก่อน hash — เดิมไม่ตรวจเลย เปิดบัญชีด้วยรหัสอ่อนได้
    this.assertStrongPassword(dto.password, { email, displayName, employee });

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          phone,
          status: "ACTIVE",
          // ผู้ดูแลเป็นคนตั้งรหัสให้ ต้องให้เจ้าตัวเปลี่ยนเองก่อนใช้งาน
          mustChangePassword: true,
          scopeLevel: targetScope.level,
          scopedCompanyId: targetScope.companyId,
          scopedBranchId: targetScope.branchId,
          roles: {
            create: roles.map((role) => ({
              role: {
                connect: {
                  id: role.id,
                },
              },
            })),
          },
        },
      });

      if (employee) {
        await tx.employee.update({
          where: {
            id: employee.id,
          },
          data: {
            userId: user.id,
          },
        });
      }

      return user;
    });

    return this.findOne(created.id);
  }

  async update(id: string, dto: UpdateUserDto, actorScope?: TenantScope) {
    await this.ensureUserExists(id, actorScope);

    // ถ้าส่ง scope มา = ต้องการเปลี่ยน scope → ตรวจลำดับชั้น + ความถูกต้อง
    let scopeData: Prisma.UserUncheckedUpdateInput = {};
    if (dto.scopeLevel !== undefined) {
      const targetScope = normalizeScopeAssignment({
        level: dto.scopeLevel,
        companyId: dto.scopedCompanyId,
        branchId: dto.scopedBranchId,
      });
      if (actorScope) {
        assertCanManageScope(actorScope, targetScope);
      }
      if (targetScope.level === "BRANCH") {
        await this.ensureBranchInCompany(
          targetScope.branchId as string,
          targetScope.companyId as string,
        );
      }
      // เขียน scalar FK ตรง ๆ ให้ scopeLevel/company/branch เปลี่ยนพร้อมกันใน statement เดียว
      // (เหมือน create) หากใช้ relation connect/disconnect Prisma จะแยกเป็นหลาย statement
      // ทำให้เกิด state กลางที่ผิดกติกา เช่น COMPANY แต่ branchId ยังค้าง → ชน
      // check constraint user_scope_consistency_chk
      scopeData = {
        scopeLevel: targetScope.level,
        scopedCompanyId: targetScope.companyId,
        scopedBranchId: targetScope.branchId,
      };
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        // displayName เป็น NOT NULL — ส่งค่าว่างมาถือว่าไม่เปลี่ยน
        ...(dto.displayName?.trim()
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.avatarUrl !== undefined
          ? { avatarUrl: dto.avatarUrl?.trim() || null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...scopeData,
      },
      include: this.userInclude(),
    });

    return this.mapUser(user);
  }


  /**
   * กำหนด tenant scope ของ user ใหม่:
   * 1) ถ้า dto ระบุ scopeLevel มา → ใช้ค่านั้น (ตรวจลำดับชั้น)
   * 2) ถ้าไม่ระบุ แต่ผูก employee → derive จากบริษัท/สาขาของ employee
   * 3) ถ้าไม่ระบุ และผู้สร้างไม่ใช่ GLOBAL → ใช้บริษัทของผู้สร้าง (COMPANY)
   * 4) ถ้าไม่ระบุ และผู้สร้างเป็น GLOBAL → ต้องระบุ scope
   */
  private async resolveTargetScope(
    dto: CreateUserDto,
    employee: { companyId: string; branchId: string | null } | null,
    actorScope: TenantScope,
  ): Promise<TenantScope> {
    let targetScope: TenantScope;

    if (dto.scopeLevel) {
      targetScope = normalizeScopeAssignment({
        level: dto.scopeLevel,
        companyId: dto.scopedCompanyId,
        branchId: dto.scopedBranchId,
      });
    } else if (employee) {
      targetScope = employee.branchId
        ? {
            level: "BRANCH",
            companyId: employee.companyId,
            branchId: employee.branchId,
          }
        : { level: "COMPANY", companyId: employee.companyId, branchId: null };
    } else if (actorScope.level !== "GLOBAL") {
      targetScope = {
        level: "COMPANY",
        companyId: actorScope.companyId,
        branchId: null,
      };
    } else {
      throw new BadRequestException(
        "กรุณาระบุขอบเขต (scope) ของผู้ใช้ หรือผูกกับพนักงานก่อน",
      );
    }

    assertCanManageScope(actorScope, targetScope);

    if (targetScope.level === "BRANCH") {
      await this.ensureBranchInCompany(
        targetScope.branchId as string,
        targetScope.companyId as string,
      );
    }

    return targetScope;
  }


  private async ensureBranchInCompany(branchId: string, companyId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!branch) {
      throw new BadRequestException("สาขาไม่อยู่ในบริษัทที่ระบุ");
    }
  }

  async updateEmail(
    id: string,
    dto: UpdateUserEmailDto,
    actor: AuthenticatedUser,
  ) {
    const user = await this.getUserForSensitiveUpdate(id, actor);
    const email = this.normalizeEmail(dto.email);

    if (email === user.email) {
      return this.mapUser(user);
    }

    await this.ensureEmailAvailable(email, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          email,
          failedLoginAttempts: 0,
          lockedUntil: null,
          twoFactorCodeHash: null,
          twoFactorCodeExpiresAt: null,
          twoFactorRequestedAt: null,
          twoFactorFailedAttempts: 0,
        },
      });

      if (dto.syncEmployeeEmail !== false && user.employee?.id) {
        await tx.employee.update({
          where: { id: user.employee.id },
          data: { email },
        });
      }

      await tx.userSession.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });

    return this.findOne(id);
  }

  async resetPassword(
    id: string,
    dto: ResetUserPasswordDto,
    actor: AuthenticatedUser,
  ) {
    const user = await this.getUserForSensitiveUpdate(id, actor);
    const newPassword = dto.newPassword;

    this.assertStrongPassword(newPassword, user);

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);

    if (isSamePassword) {
      throw new BadRequestException(
        "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          // ผู้ดูแลรีเซ็ตให้ = รู้รหัสนี้ ต้องให้เจ้าตัวเปลี่ยนเองก่อนใช้งานต่อ
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
          twoFactorCodeHash: null,
          twoFactorCodeExpiresAt: null,
          twoFactorRequestedAt: null,
          twoFactorFailedAttempts: 0,
        },
      }),
      this.prisma.userSession.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    return this.findOne(id);
  }

  async linkEmployee(
    id: string,
    dto: LinkUserEmployeeDto,
    actorScope?: TenantScope,
  ) {
    await this.ensureUserExists(id, actorScope);

    const employee = await this.getEmployeeForLink(dto.employeeId);

    // ผู้ดูแลที่ไม่ใช่ GLOBAL ผูกได้เฉพาะพนักงานในบริษัทตน
    if (
      actorScope &&
      actorScope.level !== "GLOBAL" &&
      employee.companyId !== actorScope.companyId
    ) {
      throw new ForbiddenException("ไม่มีสิทธิ์ผูกพนักงานของบริษัทอื่น");
    }

    if (employee.userId && employee.userId !== id) {
      throw new ConflictException("พนักงานคนนี้ถูกผูกกับผู้ใช้งานอื่นแล้ว");
    }

    await this.prisma.$transaction([
      this.prisma.employee.updateMany({
        where: {
          userId: id,
          id: {
            not: employee.id,
          },
        },
        data: {
          userId: null,
        },
      }),
      this.prisma.employee.update({
        where: {
          id: employee.id,
        },
        data: {
          userId: id,
        },
      }),
      this.prisma.user.update({
        where: {
          id,
        },
        data: {
          displayName: this.getEmployeeDisplayName(employee),
          phone: employee.phone?.trim() || null,
          ...(employee.email
            ? {
                email: normalizeEmailValue(employee.email),
              }
            : {}),
        },
      }),
    ]);

    return this.findOne(id);
  }

  async unlinkEmployee(id: string, actorScope?: TenantScope) {
    await this.ensureUserExists(id, actorScope);

    await this.prisma.employee.updateMany({
      where: {
        userId: id,
      },
      data: {
        userId: null,
      },
    });

    return this.findOne(id);
  }

  async assignRoles(id: string, dto: AssignRolesDto, actorScope?: TenantScope) {
    await this.ensureUserExists(id, actorScope);

    const roleCodes = this.normalizeRoleCodes(dto.roleCodes);
    this.assertCanAssignRoles(actorScope, roleCodes);
    const roles = await this.findRolesByCodes(roleCodes, actorScope);

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({
        where: {
          userId: id,
        },
      }),
      this.prisma.userRole.createMany({
        data: roles.map((role) => ({
          userId: id,
          roleId: role.id,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.findOne(id);
  }

  async softDelete(id: string, actorScope?: TenantScope) {
    await this.ensureUserExists(id, actorScope);

    await this.prisma.$transaction([
      this.prisma.employee.updateMany({
        where: {
          userId: id,
        },
        data: {
          userId: null,
        },
      }),
      this.prisma.user.update({
        where: { id },
        data: {
          status: "INACTIVE",
          deletedAt: new Date(),
        },
      }),
    ]);

    return this.findOne(id);
  }

  private userInclude() {
    return {
      roles: {
        include: {
          role: true,
        },
      },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          email: true,
          phone: true,
          position: true,
          status: true,
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
          branch: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
          department: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
          division: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
        },
      },
      scopedCompany: {
        select: { id: true, code: true, nameTh: true, nameEn: true },
      },
      scopedBranch: {
        select: { id: true, code: true, nameTh: true, nameEn: true },
      },
    } satisfies Prisma.UserInclude;
  }

  private async ensureUserExists(id: string, actorScope?: TenantScope) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        // Tenant boundary: ผู้ดูแลที่ไม่ใช่ GLOBAL แก้ไขได้เฉพาะ user ในบริษัทตน
        ...(actorScope && actorScope.level !== "GLOBAL"
          ? { scopedCompanyId: actorScope.companyId ?? "__no_company__" }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException("ไม่พบผู้ใช้งาน");
    }

    return user;
  }

  /** กัน privilege escalation: ผู้ดูแลที่ไม่ใช่ GLOBAL ห้ามกำหนด role ระดับแพลตฟอร์ม */
  private assertCanAssignRoles(
    actorScope: TenantScope | undefined,
    roleCodes: string[],
  ) {
    if (!actorScope || actorScope.level === "GLOBAL") return;

    const platformRoles = new Set(["SYSTEM_ADMIN", "ADMIN", "SUPER_ADMIN"]);
    const attempted = roleCodes.find((code) =>
      platformRoles.has(code.trim().toUpperCase()),
    );
    if (attempted) {
      throw new ForbiddenException(
        "ไม่มีสิทธิ์กำหนด role ระดับแพลตฟอร์มให้ผู้ใช้",
      );
    }
  }

  private async getEmployeeForLink(employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        division: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException("ไม่พบพนักงานที่ต้องการผูกกับผู้ใช้งาน");
    }

    if (employee.userId) {
      throw new ConflictException("พนักงานคนนี้ถูกผูกกับผู้ใช้งานแล้ว");
    }

    return employee;
  }

  private async getUserForSensitiveUpdate(
    id: string,
    actor: AuthenticatedUser,
  ) {
    if (actor.id === id) {
      throw new ForbiddenException(
        "ไม่อนุญาตให้แก้ไขอีเมลหรือรีเซ็ตรหัสผ่านบัญชีตัวเองจากหน้านี้",
      );
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.userInclude(),
    });

    if (!user) {
      throw new NotFoundException("ไม่พบผู้ใช้งาน");
    }

    // Tenant boundary: ผู้ดูแลที่ไม่ใช่ GLOBAL จัดการได้เฉพาะ user ในบริษัทตน
    if (
      actor.scope &&
      actor.scope.level !== "GLOBAL" &&
      user.scopedCompanyId !== actor.scope.companyId
    ) {
      throw new NotFoundException("ไม่พบผู้ใช้งาน");
    }

    const targetRoleCodes = user.roles
      .filter((userRole) => userRole.role.isActive)
      .map((userRole) => userRole.role.code);

    if (
      targetRoleCodes.includes("SYSTEM_ADMIN") &&
      !actor.roles.includes("SYSTEM_ADMIN")
    ) {
      throw new ForbiddenException(
        "เฉพาะ SYSTEM_ADMIN เท่านั้นที่แก้ไขบัญชี SYSTEM_ADMIN ได้",
      );
    }

    return user;
  }

  private normalizeEmail(email: string) {
    const normalized = normalizeEmailValue(email);

    if (!normalized) {
      throw new BadRequestException("กรุณาระบุอีเมล");
    }

    return normalized;
  }

  /**
   * ตรวจความแข็งแรงของรหัสผ่าน
   *
   * รับแค่ข้อมูลที่ใช้กันรหัสผ่านซ้ำกับตัวตนของเจ้าของบัญชี ไม่ผูกกับ user ที่มีอยู่แล้ว
   * เพื่อให้เรียกได้ตั้งแต่ตอน "สร้างบัญชี" ซึ่งยังไม่มีแถวในฐานข้อมูล
   *
   * เดิมรับ UserWithRelations จึงเรียกได้เฉพาะตอนรีเซ็ต ทำให้ตอนสร้างบัญชี
   * เหลือแค่ MinLength(8) — เปิดบัญชีด้วยรหัส "password" ได้ แต่รีเซ็ตเป็นรหัสนั้นไม่ได้
   */
  private assertStrongPassword(
    password: string,
    identity: {
      email?: string | null;
      displayName?: string | null;
      employee?: {
        employeeCode?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      } | null;
    },
  ) {
    if (password !== password.trim()) {
      throw new BadRequestException(
        "รหัสผ่านต้องไม่มีช่องว่างหน้า/ท้ายข้อความ",
      );
    }

    if (/\s/.test(password)) {
      throw new BadRequestException("รหัสผ่านต้องไม่มีช่องว่าง");
    }

    const rules = [
      { valid: password.length >= 10, message: "ต้องมีอย่างน้อย 10 ตัวอักษร" },
      { valid: password.length <= 128, message: "ต้องไม่เกิน 128 ตัวอักษร" },
      { valid: /[a-z]/.test(password), message: "ต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว" },
      { valid: /[A-Z]/.test(password), message: "ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว" },
      { valid: /\d/.test(password), message: "ต้องมีตัวเลขอย่างน้อย 1 ตัว" },
      // ไม่บังคับอักขระพิเศษ — ต้องตรงกับ auth.service.assertStrongPassword
    ];

    const failedRule = rules.find((rule) => !rule.valid);

    if (failedRule) {
      throw new BadRequestException(`รหัสผ่านไม่ปลอดภัย: ${failedRule.message}`);
    }

    const lowerPassword = password.toLowerCase();
    const forbiddenParts = [
      "password",
      "admin",
      "employee",
      "qwerty",
      "123456",
      identity.email?.split("@")[0],
      identity.displayName,
      identity.employee?.employeeCode,
      identity.employee?.firstName,
      identity.employee?.lastName,
    ]
      .map((part) => part?.trim().toLowerCase())
      .filter((part): part is string => Boolean(part && part.length >= 4));

    const matchedForbiddenPart = forbiddenParts.find((part) =>
      lowerPassword.includes(part),
    );

    if (matchedForbiddenPart) {
      throw new BadRequestException(
        "รหัสผ่านต้องไม่มีคำที่เดาง่ายหรือข้อมูลส่วนตัวของผู้ใช้",
      );
    }
  }

  private async ensureEmailAvailable(email: string, excludeUserId?: string) {
    const duplicated = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (duplicated && duplicated.id !== excludeUserId) {
      throw new ConflictException("อีเมลนี้ถูกใช้งานแล้ว");
    }
  }

  /**
   * อีเมลของบัญชี — ตั้งแต่เปลี่ยนมาเข้าระบบด้วยรหัสพนักงาน อีเมลไม่ใช่ทางเข้าหลักแล้ว
   *
   * บัญชีที่ผูกพนักงาน: ไม่กรอกก็ได้ ใช้อีเมลจากทะเบียนพนักงาน หรือถ้าไม่มีก็
   * ตั้งอีเมลภายในให้เป็น <รหัสพนักงาน>@<รหัสบริษัท>.local (รูปแบบเดียวกับ
   * บัญชีที่ seed มาแต่แรก เช่น 670028@tjc.local) เพราะคอลัมน์ email ยัง unique/บังคับ
   *
   * บัญชีที่ไม่ผูกพนักงาน (ผู้ดูแล): ยังต้องมีอีเมลจริง เพราะใช้อีเมลเข้าระบบ
   */
  private resolveUserEmail(
    inputEmail?: string,
    employee?: {
      email: string | null;
      employeeCode?: string | null;
      company?: { code: string } | null;
    } | null,
  ) {
    const email = inputEmail?.trim() || employee?.email?.trim();

    if (email) return email.toLowerCase();

    if (employee?.employeeCode && employee.company?.code) {
      return `${employee.employeeCode}@${employee.company.code}.local`
        .toLowerCase()
        .replace(/\s+/g, '');
    }

    throw new BadRequestException(
      'บัญชีที่ไม่ผูกพนักงานต้องระบุอีเมลเข้าสู่ระบบ',
    );
  }

  private resolveUserDisplayName(
    inputDisplayName?: string,
    employee?: {
      title: string | null;
      firstName: string;
      lastName: string;
      displayName: string | null;
    } | null,
  ) {
    if (employee) {
      return this.getEmployeeDisplayName(employee);
    }

    const displayName = inputDisplayName?.trim();

    if (!displayName) {
      throw new BadRequestException("กรุณาเลือกพนักงานหรือระบุชื่อผู้ใช้งาน");
    }

    return displayName;
  }

  private getEmployeeDisplayName(employee: {
    title: string | null;
    firstName: string;
    lastName: string;
    displayName: string | null;
  }) {
    return (
      employee.displayName?.trim() ||
      [employee.title, employee.firstName, employee.lastName]
        .filter(Boolean)
        .join(" ")
        .trim()
    );
  }

  private normalizeRoleCodes(roleCodes: string[]) {
    const normalized = Array.from(
      new Set(
        roleCodes
          .map((roleCode) => roleCode.trim().toUpperCase())
          .filter(Boolean),
      ),
    );

    if (normalized.length === 0) {
      throw new BadRequestException("ต้องเลือก Role อย่างน้อย 1 รายการ");
    }

    return normalized;
  }

  private async findRolesByCodes(
    roleCodes: string[],
    actorScope?: TenantScope,
  ) {
    // โรลไม่ unique ด้วย code อีกต่อไป (per-company) → จำกัดให้เห็นเฉพาะ
    // โรลระบบ (companyId = null) + โรลของบริษัทผู้ดูแล เพื่อกันการแตะโรลบริษัทอื่น
    const visibilityWhere: Prisma.RoleWhereInput =
      !actorScope || actorScope.level === "GLOBAL"
        ? {}
        : { OR: [{ companyId: null }, { companyId: actorScope.companyId }] };

    const roles = await this.prisma.role.findMany({
      where: {
        ...visibilityWhere,
        code: {
          in: roleCodes,
        },
        isActive: true,
      },
      select: {
        id: true,
        code: true,
      },
    });

    const foundRoleCodes = new Set(roles.map((role) => role.code));
    const missingRoleCodes = roleCodes.filter(
      (roleCode) => !foundRoleCodes.has(roleCode),
    );

    if (missingRoleCodes.length > 0) {
      throw new BadRequestException(
        `ไม่พบ Role: ${missingRoleCodes.join(", ")}`,
      );
    }

    return roles;
  }

  private mapUser(user: UserWithRelations) {
    const employeeDisplayName = user.employee
      ? this.getEmployeeDisplayName(user.employee)
      : null;

    return {
      id: user.id,
      email: user.email,
      displayName: employeeDisplayName ?? user.displayName,
      phone: user.employee?.phone ?? user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      employee: user.employee,
      scope: {
        level: user.scopeLevel,
        companyId: user.scopedCompanyId,
        branchId: user.scopedBranchId,
        company: user.scopedCompany ?? null,
        branch: user.scopedBranch ?? null,
      },
      roles: user.roles
        .filter((userRole) => userRole.role.isActive)
        .map((userRole) => ({
          id: userRole.role.id,
          code: userRole.role.code,
          name: userRole.role.name,
        })),
    };
  }
}