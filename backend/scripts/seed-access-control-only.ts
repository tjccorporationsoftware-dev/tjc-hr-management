/* eslint-disable no-console */
/**
 * Seed เฉพาะ Permission / Role / RolePermission แล้วผูก SYSTEM_ADMIN
 * ให้ผู้ใช้ระดับ GLOBAL ทุกคน
 *
 * ใช้คู่กับ danger-reset-to-empty.js — สคริปต์นั้นล้าง access control ทิ้งด้วย
 * ถ้าไม่รันตัวนี้ต่อ superadmin จะล็อกอินได้แต่ไม่มีสิทธิ์เข้าอะไรเลย
 *
 * ต่างจาก "npm run db:seed" ตรงที่ตัวนั้นสร้างบริษัท/พนักงาน/ผู้ใช้ตัวอย่างด้วย
 * ซึ่งเป็นสิ่งที่เราเพิ่งล้างไป
 *
 *   npx tsx scripts/seed-access-control-only.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { permissions, roles } from "../prisma/seed-data/access-control";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seedPermissions() {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        name: permission.name,
        group: permission.group,
        isActive: true,
      },
      create: {
        code: permission.code,
        name: permission.name,
        group: permission.group,
        isActive: true,
      },
    });
  }
  console.log(`Permission: ${permissions.length} รายการ`);
}

async function seedRoles() {
  for (const role of roles) {
    // โรลระบบ = companyId null และ compound unique (companyId, code) มี null
    // → prisma upsert ตรงๆ ไม่ได้ ต้อง find แล้วค่อย create/update
    const existing = await prisma.role.findFirst({
      where: { companyId: null, code: role.code },
      select: { id: true },
    });

    const savedRole = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            isActive: true,
          },
        })
      : await prisma.role.create({
          data: {
            companyId: null,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            isActive: true,
          },
        });

    const rolePermissions = await prisma.permission.findMany({
      where: { code: { in: role.permissionCodes } },
    });

    await prisma.rolePermission.createMany({
      data: rolePermissions.map((permission) => ({
        roleId: savedRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    /*
     * ตัดสิทธิ์ที่ไม่มีใน catalog แล้วออกด้วย
     * -------------------------------------
     * เดิมสคริปต์นี้เพิ่มอย่างเดียว ถอด permission ออกจากโรลในไฟล์ catalog
     * แล้วรันสคริปต์ ฐานข้อมูลก็ยังให้สิทธิ์นั้นอยู่เหมือนเดิม โดยไม่มีอะไรเตือน
     * ทำให้ไฟล์ catalog ไม่ใช่ "แหล่งความจริงเดียว" จริงอย่างที่เขียนไว้
     *
     * ตัดเฉพาะโรลระบบ (companyId null) โรลที่บริษัทสร้างเองไม่ถูกแตะ
     */
    const removed = await prisma.rolePermission.deleteMany({
      where: {
        roleId: savedRole.id,
        permissionId: { notIn: rolePermissions.map((p) => p.id) },
      },
    });

    console.log(
      `Role ${role.code}: ${rolePermissions.length}/${role.permissionCodes.length} permission` +
        (removed.count > 0 ? ` (ตัดออก ${removed.count})` : ""),
    );
  }
}

async function attachSystemAdminToGlobalUsers() {
  const role = await prisma.role.findFirst({
    where: { companyId: null, code: "SYSTEM_ADMIN" },
  });
  if (!role) throw new Error("ไม่พบ role SYSTEM_ADMIN หลัง seed");

  const globalUsers = await prisma.user.findMany({
    where: { scopeLevel: "GLOBAL", deletedAt: null },
    select: { id: true, email: true },
  });

  if (globalUsers.length === 0) {
    throw new Error("ไม่พบผู้ใช้ระดับ GLOBAL — จะไม่มีใครเข้าระบบได้");
  }

  await prisma.userRole.createMany({
    data: globalUsers.map((user) => ({ userId: user.id, roleId: role.id })),
    skipDuplicates: true,
  });

  console.log(
    `ผูก SYSTEM_ADMIN ให้: ${globalUsers.map((u) => u.email).join(", ")}`,
  );
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await attachSystemAdminToGlobalUsers();
  console.log("เสร็จแล้ว");
}

main()
  .catch((error) => {
    console.error("ล้มเหลว:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
