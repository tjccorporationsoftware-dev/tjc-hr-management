/* eslint-disable no-console */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { roles as CATALOG_ROLES } from "../prisma/seed-data/access-control";

/** ดึงชุดสิทธิ์ของ role จาก catalog กลาง — ห้ามเขียนรายการซ้ำในไฟล์นี้ */
function permissionCodesOf(roleCode: string): string[] {
  const role = CATALOG_ROLES.find((item) => item.code === roleCode);

  if (!role) {
    throw new Error(
      `ไม่พบ role ${roleCode} ใน prisma/seed-data/access-control.ts`,
    );
  }

  return role.permissionCodes;
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

type RoleSeed = {
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissionCodes?: string[];
  clonePermissionsFrom?: string;
  useAllActivePermissions?: boolean;
};

/**
 * ทุกชุดด้านล่างดึงจาก catalog กลาง ไม่เขียนรายการซ้ำในไฟล์นี้อีก
 *
 * เดิมไฟล์นี้เก็บรายการของตัวเองแล้ว drift กับ prisma/seed.ts:
 *   - HR_ADMIN  ที่นี่ให้ USER_MANAGE + DOCUMENT_TEMPLATE_MANAGE แต่ seed.ts ไม่ให้
 *   - EXECUTIVE ที่นี่ให้ REPORT_EXPORT + PAYROLL_READ แต่ seed.ts ไม่ให้
 * ผลคือสิทธิ์ที่ role ได้จริงขึ้นกับว่ารันสคริปต์ไหน — ตอนนี้รวมเป็นชุดเดียวแล้ว
 */
const HR_PERMISSION_CODES = permissionCodesOf('HR_ADMIN');

const MANAGER_PERMISSION_CODES = permissionCodesOf('MANAGER');

const PAYROLL_PERMISSION_CODES = permissionCodesOf('PAYROLL_ACCOUNTING');

const EMPLOYEE_PERMISSION_CODES = permissionCodesOf('EMPLOYEE');

const EXECUTIVE_PERMISSION_CODES = permissionCodesOf('EXECUTIVE');

/**
 * Role list for the /roles administration page only.
 * This script does not create or update login users.
 *
 * Only the 6 roles that the system actually needs are kept active.
 * Alias roles that used to duplicate these are retired in RETIRED_ROLES below.
 */
const ROLE_SEEDS: RoleSeed[] = [
  {
    code: "SYSTEM_ADMIN",
    name: "System Admin",
    description: "ผู้ดูแลระบบหลัก จัดการผู้ใช้ สิทธิ์ และตั้งค่าระบบ",
    isSystem: true,
    useAllActivePermissions: true,
  },
  {
    code: "HR_ADMIN",
    name: "HR Admin",
    description: "เจ้าหน้าที่ HR จัดการข้อมูลพนักงาน เวลา ลา OT และเอกสาร",
    isSystem: true,
    permissionCodes: HR_PERMISSION_CODES,
  },
  {
    code: "MANAGER",
    name: "Manager",
    description: "หัวหน้างาน ดูข้อมูลลูกทีมและอนุมัติรายการตามสิทธิ์",
    isSystem: true,
    permissionCodes: MANAGER_PERMISSION_CODES,
  },
  {
    code: "PAYROLL_ACCOUNTING",
    name: "Payroll / Accounting",
    description: "ฝ่ายบัญชีหรือเงินเดือน ดูรายงานและข้อมูลที่เกี่ยวข้องกับ Payroll",
    isSystem: true,
    permissionCodes: PAYROLL_PERMISSION_CODES,
  },
  {
    code: "EMPLOYEE",
    name: "Employee",
    description: "พนักงานทั่วไป ใช้งาน ESS และยื่นคำขอของตนเอง",
    isSystem: true,
    permissionCodes: EMPLOYEE_PERMISSION_CODES,
  },
  {
    code: "EXECUTIVE",
    name: "Executive",
    description: "ผู้บริหาร ดู Dashboard และรายงานสรุป",
    isSystem: true,
    permissionCodes: EXECUTIVE_PERMISSION_CODES,
  },
];

/**
 * Alias roles that used to duplicate a canonical role.
 * They are retired (deactivated) instead of deleted so that any approval
 * matrix / step that still references the alias code by string does not break.
 * Each alias's users are re-assigned to the canonical role first, so nobody
 * loses effective access.
 */
const RETIRED_ROLES: Record<string, string> = {
  ADMIN: "SYSTEM_ADMIN",
  SUPER_ADMIN: "SYSTEM_ADMIN",
  HR_MANAGER: "HR_ADMIN",
  DEPT_MANAGER: "MANAGER",
  DEPARTMENT_MANAGER: "MANAGER",
};

async function getPermissionIdsByCodes(roleCode: string, permissionCodes: string[]) {
  const uniqueCodes = Array.from(new Set(permissionCodes));

  if (uniqueCodes.length === 0) return [];

  const permissions = await prisma.permission.findMany({
    where: {
      code: { in: uniqueCodes },
      isActive: true,
    },
    select: {
      id: true,
      code: true,
    },
  });

  const foundCodes = new Set(permissions.map((permission) => permission.code));
  const missingCodes = uniqueCodes.filter((code) => !foundCodes.has(code));

  if (missingCodes.length > 0) {
    console.warn(
      `⚠️ ${roleCode}: skipped missing permissions: ${missingCodes.join(", ")}`,
    );
  }

  return permissions.map((permission) => permission.id);
}

async function getAllActivePermissionIds() {
  const permissions = await prisma.permission.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  return permissions.map((permission) => permission.id);
}

async function getRolePermissionIds(roleCode: string) {
  const role = await prisma.role.findFirst({
    where: { companyId: null, code: roleCode },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  if (!role) {
    console.warn(`⚠️ Source role ${roleCode} was not found. Permissions will be empty.`);
    return [];
  }

  return role.permissions
    .filter((item) => item.permission.isActive)
    .map((item) => item.permissionId);
}

async function resolvePermissionIds(role: RoleSeed) {
  if (role.useAllActivePermissions) {
    return getAllActivePermissionIds();
  }

  if (role.permissionCodes) {
    return getPermissionIdsByCodes(role.code, role.permissionCodes);
  }

  if (role.clonePermissionsFrom) {
    return getRolePermissionIds(role.clonePermissionsFrom);
  }

  return [];
}

async function syncRolePermissions(roleId: string, permissionIds: string[]) {
  const uniquePermissionIds = Array.from(new Set(permissionIds));

  await prisma.rolePermission.deleteMany({
    where: {
      roleId,
      permissionId: {
        notIn: uniquePermissionIds.length > 0 ? uniquePermissionIds : ["__NO_PERMISSION__"],
      },
    },
  });

  if (uniquePermissionIds.length === 0) return;

  await prisma.rolePermission.createMany({
    data: uniquePermissionIds.map((permissionId) => ({
      roleId,
      permissionId,
    })),
    skipDuplicates: true,
  });
}

/**
 * Move every user assigned to `fromCode` onto `toCode`, skipping rows that
 * already exist, then deactivate the alias role (kept in DB, hidden from the
 * active /roles list).
 */
async function retireRole(fromCode: string, toCode: string) {
  const aliasRole = await prisma.role.findFirst({
    where: { companyId: null, code: fromCode },
  });

  if (!aliasRole) return;

  const canonicalRole = await prisma.role.findFirst({
    where: { companyId: null, code: toCode },
  });

  if (!canonicalRole) {
    console.warn(
      `⚠️ Cannot retire ${fromCode}: canonical role ${toCode} not found. Skipped.`,
    );
    return;
  }

  const assignments = await prisma.userRole.findMany({
    where: { roleId: aliasRole.id },
    select: { userId: true },
  });

  let movedCount = 0;

  for (const assignment of assignments) {
    const result = await prisma.userRole.createMany({
      data: [{ userId: assignment.userId, roleId: canonicalRole.id }],
      skipDuplicates: true,
    });
    movedCount += result.count;
  }

  // Remove the alias assignments now that users hold the canonical role.
  await prisma.userRole.deleteMany({ where: { roleId: aliasRole.id } });

  await prisma.role.update({
    where: { id: aliasRole.id },
    data: { isActive: false },
  });

  console.log(
    `🗂️ Retired ${fromCode} → ${toCode} (moved ${movedCount}/${assignments.length} user assignment(s), role deactivated)`,
  );
}

async function seedRolesOnly() {
  console.log("Seeding roles for /roles page only...");
  console.log("No users or passwords will be created by this script.");

  for (const roleSeed of ROLE_SEEDS) {
    // โรลระบบ = companyId null (compound unique มี null → upsert ตรงๆ ไม่ได้ ใช้ find+create/update)
    const existing = await prisma.role.findFirst({
      where: { companyId: null, code: roleSeed.code },
      select: { id: true },
    });

    const savedRole = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: roleSeed.name,
            description: roleSeed.description,
            isSystem: roleSeed.isSystem,
            isActive: true,
          },
        })
      : await prisma.role.create({
          data: {
            companyId: null,
            code: roleSeed.code,
            name: roleSeed.name,
            description: roleSeed.description,
            isSystem: roleSeed.isSystem,
            isActive: true,
          },
        });

    const permissionIds = await resolvePermissionIds(roleSeed);
    await syncRolePermissions(savedRole.id, permissionIds);

    console.log(`✅ ${roleSeed.code} (${permissionIds.length} permissions)`);
  }

  for (const [fromCode, toCode] of Object.entries(RETIRED_ROLES)) {
    await retireRole(fromCode, toCode);
  }

  const activeRoles = await prisma.role.count({ where: { isActive: true } });
  const totalRoles = await prisma.role.count();
  console.log(
    `Done. Active roles in /roles page: ${activeRoles} (total rows including retired: ${totalRoles})`,
  );
}

seedRolesOnly()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
