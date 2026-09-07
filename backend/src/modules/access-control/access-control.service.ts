import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { Prisma } from "../../generated/prisma/client";
import { AssignRolePermissionsDto } from "./dto/assign-role-permissions.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * เงื่อนไข "มองเห็น" โรลตาม scope
   * - GLOBAL: เห็นทุกโรล
   * - COMPANY/BRANCH: เห็นโรลระบบ (companyId = null) + โรลของบริษัทตน
   */
  /**
   * แจกสิทธิ์ได้ไม่เกินที่ตัวเองถือ
   * =============================
   * เดิมการตรวจมีแต่ที่ "ชื่อโรล" (assertCanAssignRoles กัน SYSTEM_ADMIN/ADMIN/
   * SUPER_ADMIN) แต่ไม่มีตรงไหนดูสิทธิ์ที่อยู่ข้างในโรลเลย
   *
   * ช่องโหว่คือ: คนที่มีสิทธิ์แก้โรล สร้างโรลใหม่ยัดสิทธิ์อะไรก็ได้เข้าไป
   * (แม้แต่สิทธิ์ที่ตัวเองไม่มี) แล้วแปะโรลนั้นให้ตัวเอง = เลื่อนขั้นตัวเอง
   * ได้เต็มบริษัทด้วยสิทธิ์เดียว
   *
   * GLOBAL ยกเว้น เพราะถือสิทธิ์ครบอยู่แล้วและเป็นคนตั้งแม่แบบให้ทั้งระบบ
   */
  private assertCanGrantPermissions(
    scope: TenantScope | undefined,
    actorPermissions: string[] | undefined,
    requestedCodes: string[],
  ) {
    if (!scope || scope.level === "GLOBAL") return;
    if (requestedCodes.length === 0) return;

    const owned = new Set(
      (actorPermissions ?? []).map((code) => code.trim().toUpperCase()),
    );
    const missing = requestedCodes.filter((code) => !owned.has(code));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `ให้สิทธิ์ที่ตัวเองไม่มีไม่ได้: ${missing.slice(0, 5).join(", ")}` +
          (missing.length > 5 ? ` และอีก ${missing.length - 5} รายการ` : ""),
      );
    }
  }

  private roleVisibilityWhere(scope?: TenantScope): Prisma.RoleWhereInput {
    if (!scope || scope.level === "GLOBAL") {
      return {};
    }
    return {
      OR: [{ companyId: null }, { companyId: scope.companyId }],
    };
  }

  /**
   * ตรวจสิทธิ์ "จัดการ" โรล (สร้าง/แก้/ลบ/ตั้ง permission)
   * - GLOBAL: จัดการได้ทุกโรล
   * - COMPANY/BRANCH: จัดการได้เฉพาะ custom role ของบริษัทตน
   *   (โรลระบบ companyId = null เป็น template อ่านอย่างเดียว)
   */
  private assertRoleManageable(
    role: { companyId: string | null },
    scope?: TenantScope,
  ) {
    if (!scope || scope.level === "GLOBAL") {
      return;
    }
    if (role.companyId === null) {
      throw new ForbiddenException(
        "โรลระบบเป็น template ส่วนกลาง แก้ไขได้เฉพาะผู้ดูแลแพลตฟอร์ม",
      );
    }
    if (role.companyId !== scope.companyId) {
      throw new ForbiddenException("ไม่มีสิทธิ์จัดการโรลของบริษัทอื่น");
    }
  }

  async findPermissions(params: {
    q?: string;
    group?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize ?? 50), 1), 200);

    const where: Prisma.PermissionWhereInput = {
      isActive: true,
      ...(params.group ? { group: params.group } : {}),
      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: "insensitive" as const,
                },
              },
              {
                name: {
                  contains: params.q,
                  mode: "insensitive" as const,
                },
              },
              {
                group: {
                  contains: params.q,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [permissions, total, active, inactive, groupRows] =
      await this.prisma.$transaction([
        this.prisma.permission.findMany({
          where,
          orderBy: [{ group: "asc" }, { code: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.permission.count({ where }),
        this.prisma.permission.count({
          where: {
            ...where,
            isActive: true,
          },
        }),
        this.prisma.permission.count({
          where: {
            ...where,
            isActive: false,
          },
        }),
        this.prisma.permission.groupBy({
          by: ["group"],
          where,
          _count: { _all: true },
          orderBy: { group: "asc" },
        }),
      ]);

    return {
      data: permissions,
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
        groupTotal: groupRows.length,
        groupCounts: groupRows.map((row) => ({
          group: row.group,
          count:
            typeof row._count === "object" && row._count?._all
              ? row._count._all
              : 0,
        })),
      },
    };
  }

  async findPermissionGroups() {
    const permissions = await this.prisma.permission.findMany({
      where: {
        isActive: true,
      },
      select: {
        group: true,
      },
      distinct: ["group"],
      orderBy: {
        group: "asc",
      },
    });

    return permissions.map((permission) => permission.group);
  }

  async findRoles(params: {
    q?: string;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
    scope?: TenantScope;
  }) {
    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize ?? 20), 1), 100);

    const where: Prisma.RoleWhereInput = {
      ...this.roleVisibilityWhere(params.scope),
      ...(typeof params.isActive === "boolean"
        ? { isActive: params.isActive }
        : {}),
      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: "insensitive" as const,
                },
              },
              {
                name: {
                  contains: params.q,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [roles, total, active, inactive, system, custom, assignedPermissions] =
      await this.prisma.$transaction([
        this.prisma.role.findMany({
          where,
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
            // Platform Console เห็นโรลข้ามบริษัท ต้องบอกได้ว่าโรลไหนของใคร
            company: { select: { id: true, code: true, nameTh: true } },
          },
          orderBy: {
            code: "asc",
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.role.count({ where }),
        this.prisma.role.count({
          where: {
            ...where,
            isActive: true,
          },
        }),
        this.prisma.role.count({
          where: {
            ...where,
            isActive: false,
          },
        }),
        this.prisma.role.count({
          where: {
            ...where,
            isSystem: true,
          },
        }),
        this.prisma.role.count({
          where: {
            ...where,
            isSystem: false,
          },
        }),
        this.prisma.rolePermission.count({
          where: {
            role: {
              is: where,
            },
          },
        }),
      ]);

    return {
      data: roles.map((role) => this.mapRole(role)),
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
        system,
        custom,
        assignedPermissions,
      },
    };
  }

  async findRoleById(id: string, scope?: TenantScope) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException("ไม่พบ Role");
    }

    // non-GLOBAL เห็นได้เฉพาะโรลระบบ + โรลของบริษัทตน
    if (
      scope &&
      scope.level !== "GLOBAL" &&
      role.companyId !== null &&
      role.companyId !== scope.companyId
    ) {
      throw new NotFoundException("ไม่พบ Role");
    }

    return this.mapRole(role);
  }

  async createRole(
    dto: CreateRoleDto,
    scope?: TenantScope,
    actorPermissions?: string[],
  ) {
    const code = dto.code.trim().toUpperCase();

    // บริษัทสร้าง custom role ผูกบริษัทตนเสมอ; platform สร้างได้ทั้งโรลระบบ (null) หรือระบุบริษัท
    const companyId =
      !scope || scope.level === "GLOBAL"
        ? (dto.companyId ?? null)
        : scope.companyId;

    const existingRole = await this.prisma.role.findFirst({
      where: { companyId, code },
      select: { id: true },
    });

    if (existingRole) {
      throw new BadRequestException("รหัส Role นี้ถูกใช้งานแล้ว");
    }

    const permissionCodes = this.normalizeCodes(dto.permissionCodes ?? []);
    this.assertCanGrantPermissions(scope, actorPermissions, permissionCodes);
    const permissions = await this.findPermissionsByCodes(permissionCodes);

    const role = await this.prisma.role.create({
      data: {
        companyId,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        // โรลที่บริษัทสร้าง = custom เสมอ; โรลระบบสร้างได้เฉพาะ platform
        isSystem: false,
        isActive: dto.isActive ?? true,
        permissions: {
          create: permissions.map((permission) => ({
            permission: {
              connect: {
                id: permission.id,
              },
            },
          })),
        },
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return this.mapRole(role);
  }

  async updateRole(id: string, dto: UpdateRoleDto, scope?: TenantScope) {
    const current = await this.ensureRoleExists(id);
    this.assertRoleManageable(current, scope);

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return this.mapRole(role);
  }

  async assignPermissions(
    id: string,
    dto: AssignRolePermissionsDto,
    scope?: TenantScope,
    actorPermissions?: string[],
  ) {
    const current = await this.ensureRoleExists(id);
    this.assertRoleManageable(current, scope);

    const permissionCodes = this.normalizeCodes(dto.permissionCodes);
    this.assertCanGrantPermissions(scope, actorPermissions, permissionCodes);
    const permissions = await this.findPermissionsByCodes(permissionCodes);

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: {
          roleId: id,
        },
      }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.findRoleById(id);
  }

  private async ensureRoleExists(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });

    if (!role) {
      throw new NotFoundException("ไม่พบ Role");
    }

    return role;
  }

  private normalizeCodes(codes: string[]) {
    return Array.from(
      new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean)),
    );
  }

  private async findPermissionsByCodes(permissionCodes: string[]) {
    if (permissionCodes.length === 0) {
      return [];
    }

    const permissions = await this.prisma.permission.findMany({
      where: {
        code: {
          in: permissionCodes,
        },
        isActive: true,
      },
      select: {
        id: true,
        code: true,
      },
    });

    const foundCodes = new Set(permissions.map((permission) => permission.code));
    const missingCodes = permissionCodes.filter((code) => !foundCodes.has(code));

    if (missingCodes.length > 0) {
      throw new BadRequestException(
        `ไม่พบ Permission: ${missingCodes.join(", ")}`,
      );
    }

    return permissions;
  }

  private mapRole(role: {
    id: string;
    companyId: string | null;
    code: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    permissions: {
      permission: {
        id: string;
        code: string;
        name: string;
        group: string;
        description: string | null;
        isActive: boolean;
      };
    }[];
  }) {
    return {
      id: role.id,
      companyId: role.companyId,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      // โรลของบริษัท (มี companyId) จัดการเองได้; โรลระบบเป็น template
      scopeType: role.companyId ? ("COMPANY" as const) : ("SYSTEM" as const),
      isActive: role.isActive,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions
        .filter((rolePermission) => rolePermission.permission.isActive)
        .map((rolePermission) => ({
          id: rolePermission.permission.id,
          code: rolePermission.permission.code,
          name: rolePermission.permission.name,
          group: rolePermission.permission.group,
          description: rolePermission.permission.description,
        })),
    };
  }
}