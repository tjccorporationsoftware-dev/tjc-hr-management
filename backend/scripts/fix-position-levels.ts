/* eslint-disable no-console */
/**
 * แก้ระดับตำแหน่งให้ตรงกับ convention ของระบบ
 * ---------------------------------------------
 * ระบบกำหนดให้ level 1 = ตำแหน่งสูงสุด ไล่ลงถึง 9
 * (ดูตัวเลือกในฟอร์มตำแหน่ง และ prisma/seed.ts)
 *
 * แต่ scripts/seed-fresh-multitenant.ts รุ่นเก่าใส่กลับด้าน
 * (ผู้จัดการ = 4, เจ้าหน้าที่ = 1) ทำให้ "เจ้าหน้าที่" กลายเป็น
 * Level 1 - ผู้บริหารสูงสุด และผังองค์กรเรียงลำดับผิด
 *
 * สคริปต์นี้ idempotent รันซ้ำได้ แก้เฉพาะตำแหน่งที่ค่ายังไม่ตรง
 *
 *   npm run db:fix:position-levels
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

/** code ของตำแหน่ง → level ที่ถูกต้อง (1 = สูงสุด) */
const CORRECT_LEVEL: Record<string, number> = {
  PRESIDENT: 1,
  EXECUTIVE: 2,
  DIRECTOR: 3,
  MGR: 4,
  HR_MANAGER: 4,
  DEPT_MANAGER: 4,
  SUP: 5,
  TEAM_LEAD: 5,
  SR: 6,
  HR_OFFICER: 6,
  ACCOUNTING_OFFICER: 6,
  PURCHASING_OFFICER: 6,
  SALES_OFFICER: 6,
  IT_DEVELOPER: 6,
  DATA_ANALYST: 6,
  PROJECT_COORDINATOR: 6,
  STAFF: 7,
  OFFICER: 8,
};

async function main() {
  const positions = await prisma.position.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, nameTh: true, level: true },
    orderBy: { code: "asc" },
  });

  let updated = 0;
  let skipped = 0;

  for (const position of positions) {
    const correct = CORRECT_LEVEL[position.code.toUpperCase()];

    if (correct === undefined) {
      console.log(`  ข้าม ${position.code} (${position.nameTh}) — ไม่มีในตาราง mapping`);
      skipped += 1;
      continue;
    }

    if (position.level === correct) continue;

    await prisma.position.update({
      where: { id: position.id },
      data: { level: correct },
    });

    console.log(
      `  ${position.code} ${position.nameTh}: level ${position.level ?? "-"} -> ${correct}`,
    );
    updated += 1;
  }

  console.log(
    `\nแก้ระดับตำแหน่ง: ${updated} รายการ | ข้าม: ${skipped} | ทั้งหมด: ${positions.length}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
