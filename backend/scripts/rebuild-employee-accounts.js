/**
 * สร้างบัญชีเข้าระบบให้พนักงานที่ยังทำงานอยู่ทุกคน ด้วยกติกาใหม่
 * -----------------------------------------------------------------
 *   ชื่อผู้ใช้ = รหัสพนักงาน · รหัสผ่านเริ่มต้น = ค่าที่ส่งมาทาง PASSWORD
 *   บังคับเปลี่ยนรหัสตอนเข้าครั้งแรก · ตัด session เดิมทิ้งทั้งหมด
 *
 * ไม่ลบแถว users ทิ้ง เพราะประวัติ (audit log, งวดเงินเดือน, ใบลา, ไฟล์นำเข้า)
 * ผูก userId ไว้เป็นสิบตาราง ลบแล้วประวัติจะขาด — ใช้วิธี "รีเซ็ตให้เหมือนสร้างใหม่" แทน
 *
 *   - บัญชีที่ผูกพนักงานที่ยังทำงาน   → รีเซ็ตรหัส/2FA/ล็อก คงบทบาทและอีเมลเดิม
 *   - พนักงานที่ยังไม่มีบัญชี           → สร้างใหม่ อีเมลภายใน <รหัส>@tjc.local บทบาท EMPLOYEE
 *   - บัญชีของคนที่ลาออก/ถูกลบ         → ปิดใช้ (INACTIVE + deletedAt) และตัด session
 *   - superadmin@tjc.local              → ไม่แตะ
 *
 * ใช้:  PASSWORD=... node scripts/rebuild-employee-accounts.js            (ดูอย่างเดียว)
 *       PASSWORD=... APPLY=1 node scripts/rebuild-employee-accounts.js    (ลงมือจริง)
 */
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const KEEP_EMAIL = 'superadmin@tjc.local';
const password = process.env.PASSWORD;
const apply = process.env.APPLY === '1';

if (!password || password.length < 8) {
  console.error('ต้องส่ง PASSWORD (อย่างน้อย 8 ตัว)');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const employeeRole = await prisma.role.findFirst({
    where: { code: 'EMPLOYEE', companyId: null },
    select: { id: true },
  });
  if (!employeeRole) throw new Error('ไม่พบบทบาท EMPLOYEE');

  const employees = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      employeeCode: true,
      displayName: true,
      firstName: true,
      lastName: true,
      title: true,
      status: true,
      companyId: true,
      userId: true,
      company: { select: { code: true } },
    },
    orderBy: { employeeCode: 'asc' },
  });

  const users = await prisma.user.findMany({
    where: { email: { not: KEEP_EMAIL } },
    select: { id: true, email: true, deletedAt: true, status: true, employee: { select: { id: true } } },
  });

  const working = employees.filter((e) => !['RESIGNED', 'TERMINATED', 'INACTIVE'].includes(e.status));
  const workingIds = new Set(working.map((e) => e.id));
  const linkedWorkingUserIds = new Set(working.map((e) => e.userId).filter(Boolean));

  const toReset = working.filter((e) => e.userId);
  const toCreate = working.filter((e) => !e.userId);
  const toDisable = users.filter((u) => !linkedWorkingUserIds.has(u.id) && !u.deletedAt);

  console.log(`พนักงานที่ยังทำงาน ${working.length} คน · มีบัญชีแล้ว ${toReset.length} · ต้องสร้าง ${toCreate.length}`);
  console.log(`บัญชีที่จะปิดใช้ (ไม่ได้ผูกคนที่ยังทำงาน) ${toDisable.length}: ${toDisable.map((u) => u.email).join(', ') || '-'}`);

  // อีเมลภายในของคนที่จะสร้าง ต้องไม่ชนกับบัญชีที่มีอยู่
  const plannedEmails = toCreate.map((e) => `${e.employeeCode}@${e.company.code}.local`.toLowerCase());
  const clash = await prisma.user.findMany({ where: { email: { in: plannedEmails } }, select: { email: true } });
  if (clash.length) {
    console.error('อีเมลภายในชนกับบัญชีที่มีอยู่:', clash.map((c) => c.email));
    process.exit(1);
  }

  if (!apply) {
    console.log('\n(dry run) ส่ง APPLY=1 เพื่อลงมือจริง');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  const resetFields = {
    passwordHash,
    mustChangePassword: true,
    passwordChangedAt: null,
    failedLoginAttempts: 0,
    lastFailedLoginAt: null,
    lockedUntil: null,
    twoFactorEnabled: false,
    twoFactorCodeHash: null,
    twoFactorCodeExpiresAt: null,
    twoFactorRequestedAt: null,
    twoFactorFailedAttempts: 0,
    status: 'ACTIVE',
    deletedAt: null,
  };

  let reset = 0;
  let created = 0;
  let disabled = 0;

  for (const e of toReset) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: e.userId }, data: resetFields }),
      prisma.userSession.updateMany({ where: { userId: e.userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    reset += 1;
  }

  for (const e of toCreate) {
    const email = `${e.employeeCode}@${e.company.code}.local`.toLowerCase();
    const displayName = e.displayName || [e.title, e.firstName, e.lastName].filter(Boolean).join(' ');
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          displayName,
          ...resetFields,
          scopeLevel: 'COMPANY',
          scopedCompanyId: e.companyId,
          scopedBranchId: null,
          roles: { create: [{ roleId: employeeRole.id }] },
        },
        select: { id: true },
      });
      await tx.employee.update({ where: { id: e.id }, data: { userId: user.id } });
    });
    created += 1;
  }

  for (const u of toDisable) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: u.id }, data: { status: 'INACTIVE', deletedAt: now } }),
      prisma.userSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    disabled += 1;
  }

  console.log(`\nเสร็จ: รีเซ็ต ${reset} · สร้างใหม่ ${created} · ปิดใช้ ${disabled}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
