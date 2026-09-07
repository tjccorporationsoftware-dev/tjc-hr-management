/* eslint-disable no-console */
/**
 * ตั้งชื่อ User ให้ตรงกับพนักงานที่ผูกกัน
 * -------------------------------------
 * seed เดิมตั้ง User.displayName เป็น placeholder ตาม role (เช่น "Employee (ALPHA/HQ)")
 * ทำให้หน้าที่ดึงชื่อจาก User (หัวมุมขวา, ผู้อนุมัติ, audit log) ขึ้นไม่ตรงกับชื่อจริง
 *
 * สคริปต์นี้ idempotent รันซ้ำได้ ไม่ลบข้อมูลอื่น
 *
 *   npm run db:sync:user-names
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const employees = await prisma.employee.findMany({
    where: { userId: { not: null }, deletedAt: null },
    select: {
      userId: true,
      displayName: true,
      firstName: true,
      lastName: true,
      user: { select: { displayName: true } },
    },
  });

  let updated = 0;

  for (const employee of employees) {
    if (!employee.userId) continue;

    const realName =
      employee.displayName?.trim() ||
      [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();

    if (!realName) continue;
    if (employee.user?.displayName === realName) continue;

    await prisma.user.update({
      where: { id: employee.userId },
      data: { displayName: realName },
    });

    console.log(
      `  ${employee.user?.displayName ?? "-"}  ->  ${realName}`,
    );
    updated += 1;
  }

  console.log(`\nอัปเดตชื่อ User: ${updated} คน`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
