/* eslint-disable no-console */
/**
 * เช็กลิสต์คืนของมาตรฐานของโมดูล Offboarding
 * ------------------------------------------
 * สร้างเช็กลิสต์ให้ทุกบริษัท เพื่อให้เปิดเคสแล้วมีงานกางให้ทันที
 *
 * permission OFFBOARDING_READ / OFFBOARDING_MANAGE ไม่ได้อยู่ที่นี่แล้ว
 * ย้ายไป prisma/seed-data/access-control.ts และถูกสร้างโดย `npm run db:seed`
 *
 * สคริปต์นี้ idempotent รันซ้ำได้ ไม่ลบข้อมูลอื่น
 *
 *   npm run db:seed:offboarding
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

/** รายการคืนของมาตรฐาน เรียงตามลำดับที่ควรทำจริง */
const DEFAULT_ITEMS = [
  {
    title: 'ส่งมอบงานให้ผู้รับช่วง',
    category: 'ส่งมอบงาน',
    ownerRole: 'หัวหน้างาน',
  },
  {
    title: 'คืนคอมพิวเตอร์ / โน้ตบุ๊ก',
    category: 'อุปกรณ์',
    ownerRole: 'IT',
  },
  {
    title: 'คืนบัตรพนักงาน / คีย์การ์ด',
    category: 'อุปกรณ์',
    ownerRole: 'ธุรการ',
  },
  {
    title: 'คืนโทรศัพท์ / ซิมบริษัท',
    category: 'อุปกรณ์',
    ownerRole: 'IT',
    isRequired: false,
  },
  {
    title: 'ปิดสิทธิ์อีเมลและระบบภายใน',
    category: 'สิทธิ์ระบบ',
    ownerRole: 'IT',
  },
  {
    title: 'เคลียร์เงินยืมทดรอง / ค่าใช้จ่ายค้าง',
    category: 'การเงิน',
    ownerRole: 'บัญชี',
  },
  {
    title: 'สัมภาษณ์ลาออก (Exit Interview)',
    category: 'HR',
    ownerRole: 'HR',
    isRequired: false,
  },
  {
    title: 'แจ้งออกประกันสังคม (สปส. 6-09)',
    category: 'HR',
    ownerRole: 'HR',
  },
];

async function seedChecklists() {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true },
  });

  for (const company of companies) {
    const existing = await prisma.offboardingChecklist.findFirst({
      where: { companyId: company.id, code: 'OFB_STANDARD', deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      console.log(`  checklist มีอยู่แล้ว: ${company.code}`);
      continue;
    }

    await prisma.offboardingChecklist.create({
      data: {
        companyId: company.id,
        code: 'OFB_STANDARD',
        name: 'เคลียร์ของก่อนออกจากงาน (มาตรฐาน)',
        description: 'รายการที่ต้องเคลียร์ให้ครบก่อนพนักงานพ้นสภาพ',
        items: {
          create: DEFAULT_ITEMS.map((item, index) => ({
            title: item.title,
            category: item.category,
            ownerRole: item.ownerRole,
            sortOrder: index + 1,
            isRequired: item.isRequired ?? true,
          })),
        },
      },
    });

    console.log(`  สร้าง checklist ให้ ${company.code} (${DEFAULT_ITEMS.length} รายการ)`);
  }
}

async function main() {
  console.log('📋 Seeding offboarding checklists...');
  await seedChecklists();

  console.log('✅ เสร็จแล้ว');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
