/*
 * เติมเลขที่ผู้ประกันตนจากเลขบัตรประชาชน
 *
 * คนไทยใช้เลข 13 หลักเดียวกับบัตรประชาชนเป็นเลขผู้ประกันตน ไฟล์ทะเบียนพนักงาน
 * ของระบบเดิมกรอกช่องนี้มาแค่ 7 คน ที่เหลือจึงต้องเติมเอง (ผู้ใช้ตัดสินไว้ 2569-08-17)
 * ตอนนำเข้าพนักงานชุดใหญ่ทีหลังไม่ได้เติมต่อ เลยค้างอยู่
 *
 * ถ้าไม่มีเลขนี้ รายงาน สปส.1-10 จะขึ้นว่าข้อมูลไม่ครบและยื่นไม่ได้
 *
 * ข้ามคนที่เลขบัตรไม่ใช่เลข 13 หลักจริง (ขึ้นต้นด้วย 0 = เลขที่กรอกไว้ชั่วคราว)
 * และไม่แตะคนที่มีเลขอยู่แล้ว
 *
 *   node scripts/fill-social-security-no-from-national-id.js            พรีวิว
 *   node scripts/fill-social-security-no-from-national-id.js --apply    เขียนจริง
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');

/** เลขบัตรประชาชนไทยที่ใช้ได้จริง: 13 หลัก และหลักแรกต้องเป็น 1-8 */
const isRealThaiId = (v) => /^[1-8]\d{12}$/.test(String(v ?? '').trim());

(async () => {
  const rows = await p.$queryRawUnsafe(`
    SELECT e.id, e."employeeCode" code, e."displayName" nm, e.status,
           pr.id AS "profileId", pr."nationalId" nid
    FROM employees e
    JOIN employee_profiles pr ON pr."employeeId" = e.id
    WHERE e."deletedAt" IS NULL
      AND (pr."socialSecurityNo" IS NULL OR pr."socialSecurityNo" = '')
    ORDER BY e."employeeCode"`);

  const fillable = rows.filter((r) => isRealThaiId(r.nid));
  const skipped = rows.filter((r) => !isRealThaiId(r.nid));

  console.log(`ยังไม่มีเลขผู้ประกันตน ${rows.length} คน`);
  console.log(`  เติมได้จากเลขบัตร : ${fillable.length} คน`);
  console.log(`  ข้าม (เลขบัตรไม่ใช่ของจริง) : ${skipped.length} คน`);
  skipped.forEach((r) => console.log(`     ${r.code} ${r.nm || '(ไม่มีชื่อ)'} · ${r.nid}`));

  if (!apply) {
    console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
    await p.$disconnect();
    return;
  }

  let n = 0;
  for (const r of fillable) {
    await p.employeeProfile.update({
      where: { id: r.profileId },
      data: { socialSecurityNo: String(r.nid).trim() },
    });
    n += 1;
  }

  console.log(`\nเติมแล้ว ${n} คน`);

  const after = await p.$queryRawUnsafe(`
    SELECT count(*) FILTER (WHERE pr."socialSecurityNo" IS NOT NULL AND pr."socialSecurityNo" <> '')::int has,
           count(*)::int total
    FROM employees e LEFT JOIN employee_profiles pr ON pr."employeeId" = e.id
    WHERE e."deletedAt" IS NULL`);
  console.log(`ตอนนี้มีเลขผู้ประกันตนแล้ว ${after[0].has} จาก ${after[0].total} คน`);

  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
