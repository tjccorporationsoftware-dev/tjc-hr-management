/*
 * สร้างบัญชีทดสอบสำหรับผู้รีวิวของ Apple (TestFlight / App Review)
 * ================================================================
 *
 *   node scripts/create-app-review-account.js              พรีวิว ไม่เขียนอะไร
 *   node scripts/create-app-review-account.js --apply      เขียนจริง
 *   node scripts/create-app-review-account.js --apply --disable   ปิดบัญชีหลังรีวิวจบ
 *
 * รันจากโฟลเดอร์ backend บนเซิร์ฟเวอร์ที่ build แล้ว (ใช้ Prisma client ใน dist/)
 * สคริปต์ idempotent — รันซ้ำได้ ผลลัพธ์เหมือนเดิม ไม่แตะข้อมูลของพนักงานคนอื่น
 *
 * ## ทำไมต้องมีบัญชีนี้
 *
 * แอปเปิดมาเจอหน้าเข้าสู่ระบบทันที ไม่มีโหมดผู้เยี่ยมชม — Apple จึงเข้าไปดูอะไร
 * ไม่ได้เลยถ้าไม่มีบัญชีให้ และ "ล็อกอินไม่ได้" คือเหตุผลตีกลับที่พบบ่อยที่สุด
 * ช่อง Sign-In Information ใน App Store Connect ต้องกรอกค่าที่สคริปต์นี้พิมพ์ออกมา
 *
 * ## กับดักสี่ข้อที่สคริปต์นี้ปิดไว้ให้ (ห้ามแก้กลับ)
 *
 *   1. attendanceGeofenceRequired = false
 *      ผู้รีวิวนั่งอยู่ต่างประเทศ ถ้าบังคับให้อยู่ในรัศมีสาขา เขาจะกดลงเวลาไม่ผ่าน
 *      แล้วรายงานว่าฟังก์ชันหลักของแอปใช้งานไม่ได้ — พิกัดยังถูกเก็บเหมือนเดิม
 *      แค่ไม่เอามาบล็อก
 *
 *   2. mustChangePassword = false
 *      ถ้าเป็น true ระบบจะบังคับตั้งรหัสใหม่ตั้งแต่จอแรก รหัสที่กรอกไว้ใน
 *      App Store Connect จะใช้ไม่ได้ทันทีที่ผู้รีวิวคนแรกเปลี่ยนรหัส
 *
 *   3. twoFactorEnabled = false
 *      รหัส OTP ส่งเข้าอีเมล/มือถือของเรา ผู้รีวิวไม่มีทางได้รับ
 *
 *   4. failedLoginAttempts = 0 และ lockedUntil = null
 *      ถ้าเคยมีคนพิมพ์รหัสผิดจนบัญชีถูกล็อก ผู้รีวิวจะเจอ "บัญชีถูกระงับ"
 *      ทุกครั้งที่รันสคริปต์จึงปลดล็อกให้ใหม่
 *
 * ## ข้อมูลในบัญชีต้องไม่ใช่ของพนักงานจริง
 *
 * ผู้รีวิวเปิดดูได้ทุกจอ รวมถึงสลิปเงินเดือนและหน้าโปรไฟล์ที่มีเลขบัตรประชาชน
 * บัญชีนี้จึงเป็นพนักงานสมมติที่สร้างขึ้นใหม่ ไม่ผูกกับคนจริงคนใดคนหนึ่ง
 */
require('dotenv').config({ quiet: true });

const bcrypt = require('bcryptjs');

const { PrismaClient } = require('../dist/generated/prisma/client');

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ ตัวเลือก */

const args = process.argv.slice(2);

/** อ่านค่าแบบ --key=value */
function option(name, fallback) {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const APPLY = args.includes('--apply');
const DISABLE = args.includes('--disable');

const EMAIL = option('email', 'appreview@tjc.co.th');
const PASSWORD = option('password', 'TjcReview2026!');
const EMPLOYEE_CODE = option('code', '999999');
const COMPANY_CODE = option('company', '');
const BRANCH_CODE = option('branch', '');
/** โควตาวันลาที่ให้บัญชีนี้ เพื่อให้ผู้รีวิวยื่นใบลาทดสอบได้จริง */
const LEAVE_DAYS = Number(option('leave-days', '6'));

/** ชื่อที่ตั้งใจให้ดูออกทันทีว่าไม่ใช่พนักงานจริง */
const FIRST_NAME = 'App';
const LAST_NAME = 'Reviewer';
const DISPLAY_NAME = 'App Review (Apple)';

/* -------------------------------------------------------------------- ตัวช่วย */

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

const changes = [];

/** บันทึกสิ่งที่จะทำ เพื่อให้โหมดพรีวิวกับโหมดเขียนจริงพิมพ์รายการชุดเดียวกัน */
function plan(line) {
  changes.push(line);
  console.log(`  ${APPLY ? '✔' : '·'} ${line}`);
}

/* ---------------------------------------------------------------------- หลัก */

async function main() {
  console.log('');
  console.log('บัญชีทดสอบสำหรับผู้รีวิวของ Apple');
  console.log('='.repeat(60));
  console.log(APPLY ? 'โหมด: เขียนจริง' : 'โหมด: พรีวิว (ใส่ --apply เพื่อเขียนจริง)');
  console.log('');

  /* --- บริษัท ------------------------------------------------------------ */

  const companies = await prisma.company.findMany({
    select: { id: true, code: true, nameTh: true },
    orderBy: { code: 'asc' },
  });

  if (companies.length === 0) fail('ไม่พบบริษัทในฐานข้อมูล');

  const company = COMPANY_CODE
    ? companies.find((item) => item.code === COMPANY_CODE)
    : companies.length === 1
      ? companies[0]
      : companies.find((item) => item.code === 'TJC');

  if (!company) {
    fail(
      `ระบุบริษัทไม่ได้ — ใส่ --company=<code> ด้วย\n` +
        `บริษัทที่มี: ${companies.map((item) => item.code).join(', ')}`,
    );
  }

  console.log(`บริษัท : ${company.code} — ${company.nameTh}`);

  /* --- สาขา -------------------------------------------------------------- */

  const branches = await prisma.branch.findMany({
    where: { companyId: company.id },
    select: { id: true, code: true, nameTh: true },
    orderBy: { code: 'asc' },
  });

  /*
   * "สาขา" ในระบบนี้คือนิติบุคคลในเครือ ไม่ใช่ที่ตั้งสำนักงาน — เรียงตามรหัสแล้ว
   * หยิบตัวแรกจะได้บริษัทลูกที่ชื่อขึ้นต้นด้วย A ซึ่งไม่ใช่ที่ที่ควรวางบัญชีทดสอบ
   * ค่าเริ่มต้นจึงเลือกสาขาที่รหัสตรงกับบริษัทก่อน แล้วค่อยถอยไปตัวแรก
   */
  const branch = BRANCH_CODE
    ? branches.find((item) => item.code === BRANCH_CODE)
    : (branches.find((item) => item.code === company.code) ?? branches[0]);

  if (BRANCH_CODE && !branch) {
    fail(
      `ไม่พบสาขารหัส ${BRANCH_CODE}\n` +
        `สาขาที่มี: ${branches.map((item) => item.code).join(', ') || '(ไม่มี)'}`,
    );
  }

  console.log(
    `สาขา   : ${branch ? `${branch.code} — ${branch.nameTh}` : '(ไม่ผูกสาขา)'}`,
  );

  /* --- บทบาท ------------------------------------------------------------- */

  const employeeRoles = await prisma.role.findMany({ where: { code: 'EMPLOYEE' } });

  if (employeeRoles.length === 0) {
    fail('ไม่พบบทบาท EMPLOYEE — รัน npm run db:seed:roles ก่อน');
  }

  /* บาง deploy แยกบทบาทรายบริษัท เลือกตัวของบริษัทนี้ก่อนถ้ามี */
  const role =
    employeeRoles.find((item) => item.companyId === company.id) ?? employeeRoles[0];

  console.log(`บทบาท  : ${role.code}`);
  console.log('');

  /* --- โหมดปิดบัญชี ------------------------------------------------------- */

  if (DISABLE) {
    const existing = await prisma.user.findUnique({
      where: { email: EMAIL },
      select: { id: true, employee: { select: { id: true } } },
    });

    if (!existing) fail(`ไม่พบบัญชี ${EMAIL} — ไม่มีอะไรให้ปิด`);

    console.log('สิ่งที่จะทำ:');
    plan(`ปิดการใช้งานบัญชี ${EMAIL} (status = INACTIVE)`);
    if (existing.employee) plan('ปิดสถานะพนักงานที่ผูกกับบัญชีนี้');

    if (APPLY) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { status: 'INACTIVE' },
      });
      if (existing.employee) {
        await prisma.employee.update({
          where: { id: existing.employee.id },
          data: { status: 'INACTIVE' },
        });
      }
    }

    console.log('');
    console.log(
      APPLY
        ? 'ปิดบัญชีเรียบร้อย — เปิดใหม่ได้ด้วยการรันสคริปต์นี้โดยไม่ใส่ --disable'
        : 'พรีวิวเท่านั้น ยังไม่ได้เขียนอะไร',
    );
    return;
  }

  /* --- ผู้ใช้ -------------------------------------------------------------- */

  console.log('สิ่งที่จะทำ:');

  const existingUser = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  /* ค่าที่ต้องบังคับทุกครั้งที่รัน ไม่ว่าจะสร้างใหม่หรือของเดิมมีอยู่แล้ว
   * — ดูเหตุผลของแต่ละข้อในหัวไฟล์ */
  const userSafety = {
    passwordHash,
    displayName: DISPLAY_NAME,
    status: 'ACTIVE',
    mustChangePassword: false,
    twoFactorEnabled: false,
    twoFactorCodeHash: null,
    twoFactorCodeExpiresAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    deletedAt: null,
    scopeLevel: 'BRANCH',
    scopedCompanyId: company.id,
    scopedBranchId: branch ? branch.id : null,
  };

  plan(
    existingUser
      ? `ตั้งรหัสผ่านใหม่และปลดล็อกบัญชีเดิม ${EMAIL}`
      : `สร้างบัญชีผู้ใช้ ${EMAIL}`,
  );
  plan('ปิด 2FA / ไม่บังคับเปลี่ยนรหัสผ่าน / ล้างจำนวนครั้งที่ล็อกอินผิด');

  let userId = existingUser ? existingUser.id : null;

  if (APPLY) {
    const user = existingUser
      ? await prisma.user.update({ where: { id: existingUser.id }, data: userSafety })
      : await prisma.user.create({ data: { email: EMAIL, ...userSafety } });
    userId = user.id;
  }

  /* --- พนักงาน ------------------------------------------------------------ */

  const existingEmployee = await prisma.employee.findFirst({
    where: {
      OR: [
        ...(userId ? [{ userId }] : []),
        { companyId: company.id, employeeCode: EMPLOYEE_CODE },
      ],
    },
    select: { id: true, employeeCode: true },
  });

  /* วันเริ่มงานย้อนหลัง 1 ปี — จอที่คำนวณอายุงานจะได้ไม่ขึ้นเป็นศูนย์
   * และสิทธิลาพักร้อนตามอายุงานจะไม่ถูกตัดทิ้ง */
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  startDate.setHours(0, 0, 0, 0);

  const employeeData = {
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    displayName: DISPLAY_NAME,
    status: 'ACTIVE',
    companyId: company.id,
    branchId: branch ? branch.id : null,
    /* ผู้รีวิวใช้แอปอย่างเดียว แต่เปิดเว็บไว้ด้วยเผื่อต้องยืนยันข้อมูลจากฝั่งเรา */
    allowedAttendanceMethods: ['MOBILE', 'WEB'],
    /* กับดักข้อ 1 ในหัวไฟล์ — ผู้รีวิวอยู่ต่างประเทศ */
    attendanceGeofenceRequired: false,
    attendanceTrackingRequired: true,
  };

  plan(
    existingEmployee
      ? `อัปเดตพนักงานทดสอบรหัส ${existingEmployee.employeeCode}`
      : `สร้างพนักงานทดสอบรหัส ${EMPLOYEE_CODE} (${FIRST_NAME} ${LAST_NAME})`,
  );
  plan('ปิดการบังคับพิกัดตอนลงเวลา เพื่อให้ผู้รีวิวกดลงเวลาจากต่างประเทศได้');

  let employeeId = existingEmployee ? existingEmployee.id : null;

  if (APPLY) {
    const employee = existingEmployee
      ? await prisma.employee.update({
          where: { id: existingEmployee.id },
          data: { ...employeeData, userId },
        })
      : await prisma.employee.create({
          data: {
            ...employeeData,
            employeeCode: EMPLOYEE_CODE,
            startDate,
            userId,
          },
        });
    employeeId = employee.id;
  }

  /* --- ผูกบทบาท ----------------------------------------------------------- */

  plan(`ผูกบทบาท ${role.code} ให้บัญชีนี้`);

  if (APPLY) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
  }

  /* --- กะการทำงาน ---------------------------------------------------------- */

  /*
   * ไม่มีกะ = จอลงเวลาไม่รู้ว่าต้องเข้างานกี่โมง ปุ่มลงเวลาจะไม่ทำงาน
   * ใช้กะที่บริษัทมีอยู่แล้ว ไม่สร้างนโยบายใหม่ เพราะนโยบายเป็นของใช้ร่วมทั้งบริษัท
   */
  const policy = await prisma.attendancePolicy.findFirst({
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(branch ? { OR: [{ branchId: branch.id }, { branchId: null }] } : {}),
    },
    orderBy: [{ branchId: 'desc' }, { priority: 'asc' }],
    select: { id: true, code: true, name: true },
  });

  if (!policy) {
    plan('ข้ามการผูกกะ — ไม่พบนโยบายลงเวลาของบริษัทนี้ (ต้องผูกเองในหน้า HR)');
  } else {
    const existingShift = employeeId
      ? await prisma.employeeWorkShift.findFirst({
          where: { employeeId, deletedAt: null, status: 'ACTIVE' },
          select: { id: true },
        })
      : null;

    if (existingShift) {
      plan(`มีกะผูกอยู่แล้ว ไม่แตะ`);
    } else {
      plan(`ผูกกะ ${policy.code} — ${policy.name}`);
      if (APPLY) {
        await prisma.employeeWorkShift.create({
          data: {
            employeeId,
            policyId: policy.id,
            effectiveFrom: startDate,
            note: 'บัญชีทดสอบสำหรับผู้รีวิวของ Apple',
          },
        });
      }
    }
  }

  /* --- โควตาวันลา ---------------------------------------------------------- */

  /*
   * ถ้าโควตาเป็นศูนย์ ระบบจะปฏิเสธใบลาที่ผู้รีวิวลองยื่น แล้วเขาจะเห็นเป็นข้อผิดพลาด
   * ให้โควตาเล็ก ๆ พอให้กดยื่นผ่านหนึ่งใบก็พอ (ปรับด้วย --leave-days=)
   */
  const leaveTypes = await prisma.leaveType.findMany({
    where: { companyId: company.id, deductQuota: true },
    select: { id: true, code: true },
  });

  if (leaveTypes.length === 0) {
    plan('ข้ามโควตาวันลา — บริษัทนี้ยังไม่มีประเภทการลาที่ตัดโควตา');
  } else {
    plan(
      `ให้โควตาวันลา ${LEAVE_DAYS} วัน ใน ${leaveTypes.length} ประเภท ` +
        `(ปี ${new Date().getFullYear()})`,
    );

    if (APPLY) {
      const year = new Date().getFullYear();
      for (const leaveType of leaveTypes) {
        await prisma.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId,
              leaveTypeId: leaveType.id,
              year,
            },
          },
          update: { entitlementDays: LEAVE_DAYS },
          create: {
            employeeId,
            leaveTypeId: leaveType.id,
            year,
            entitlementDays: LEAVE_DAYS,
          },
        });
      }
    }
  }

  /* --- สรุป --------------------------------------------------------------- */

  console.log('');

  if (!APPLY) {
    console.log('พรีวิวเท่านั้น ยังไม่ได้เขียนอะไรลงฐานข้อมูล');
    console.log('รันซ้ำด้วย --apply เมื่อพร้อม');
    console.log('');
    return;
  }

  console.log('เสร็จแล้ว — เอาค่าข้างล่างไปกรอกใน App Store Connect');
  console.log('');
  console.log('  TestFlight › Test Information › Sign-In Information');
  console.log('  ' + '-'.repeat(52));
  console.log(`  Sign-in required : ติ๊กถูก`);
  console.log(`  User Name        : ${EMAIL}`);
  console.log(`  Password         : ${PASSWORD}`);
  console.log('');
  console.log('  ตรวจก่อนกด Submit');
  console.log('  ' + '-'.repeat(52));
  console.log('  1. ลองล็อกอินด้วยบัญชีนี้จากมือถือจริงหนึ่งครั้ง');
  console.log('  2. เปิด https://hr.tjc.co.th/privacy จากเครื่องนอกออฟฟิศให้ขึ้นได้');
  console.log('  3. อย่าปิดบัญชีนี้จนกว่ารีวิวจะผ่าน และเก็บไว้ใช้กับเวอร์ชันถัดไป');
  console.log('');
  console.log('  ปิดบัญชีเมื่อไม่ใช้แล้ว:');
  console.log('  node scripts/create-app-review-account.js --apply --disable');
  console.log('');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
