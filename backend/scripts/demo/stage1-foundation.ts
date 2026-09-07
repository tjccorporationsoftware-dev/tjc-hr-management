/**
 * ระยะที่ 1 — รากฐาน
 * ------------------
 * ล้างข้อมูลธุรกิจทั้งหมด (เก็บ Permission / Role / RolePermission ไว้)
 * แล้วสร้าง: บริษัท · สาขา · โครงสร้างองค์กร · ตั้งค่าพื้นฐาน · ตั้งค่าเงินเดือน
 *           · พนักงาน 40 คน · บัญชีผู้ใช้ · ฐานเงินเดือน · รายการค่าตอบแทนประจำ
 *
 * รันด้วย: npx tsx scripts/demo/stage1-foundation.ts
 */
import * as bcrypt from 'bcryptjs';
import {
  permissions as PERMISSION_CATALOG,
  roles as ROLE_CATALOG,
} from '../../prisma/seed-data/access-control';
import {
  BRANCHES,
  COMPANY,
  DEMO_PASSWORD,
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
} from './config';
import {
  addDays,
  chance,
  dateOnly,
  done,
  money,
  pick,
  prisma,
  randInt,
  step,
} from './lib';

const KEEP_TABLES = new Set([
  '_prisma_migrations',
  'Permission',
  'Role',
  'RolePermission',
]);

/* ============================== ชื่อคนไทย ============================== */
const FIRST_NAMES = [
  'สมชาย',
  'สมหญิง',
  'ปิยะ',
  'อนุชา',
  'กมล',
  'นภาพร',
  'วิภา',
  'ธนากร',
  'ศิริพร',
  'ประเสริฐ',
  'จันทร์เพ็ญ',
  'ธีรพงษ์',
  'รัตนา',
  'อารีย์',
  'พงศกร',
  'สุดารัตน์',
  'วีระชัย',
  'มานพ',
  'เกศรา',
  'ชัยวัฒน์',
  'พรทิพย์',
  'ณัฐพล',
  'อรุณี',
  'สุชาติ',
  'ดวงใจ',
  'ภัทรพล',
  'กิตติศักดิ์',
  'นารีรัตน์',
  'วรรณา',
  'ธนวัฒน์',
  'ศุภชัย',
  'มณีรัตน์',
  'อดิศักดิ์',
  'ปราณี',
  'จิรายุ',
  'เบญจวรรณ',
  'ทวีศักดิ์',
  'สุพรรณี',
  'ยุทธนา',
  'ขวัญใจ',
];
const LAST_NAMES = [
  'ใจดี',
  'รุ่งเรือง',
  'ศรีสุข',
  'ทองคำ',
  'บุญมี',
  'แสงทอง',
  'วัฒนา',
  'พงษ์ไพบูลย์',
  'อินทรสุวรรณ',
  'มั่นคง',
  'สุขสันต์',
  'เจริญพร',
  'ดำรงชัย',
  'ไชยวงศ์',
  'พูนสุข',
  'ธนากิจ',
  'งามเลิศ',
  'โชคชัย',
  'วิริยะ',
  'อภิรักษ์',
  'แก้วมณี',
  'สายทอง',
  'ปัญญาดี',
  'ชูเกียรติ',
  'เพชรรัตน์',
  'บุญเรือง',
  'สมบูรณ์',
  'ก้าวหน้า',
  'ภักดี',
  'ตั้งใจ',
];
const NICKNAMES = [
  'เอ',
  'บี',
  'ซี',
  'ดี',
  'อี',
  'ก้อย',
  'แนน',
  'ปุ๊ก',
  'ตั้ม',
  'โอ๋',
  'นก',
  'หมู',
  'ต่าย',
  'เจี๊ยบ',
  'ฝ้าย',
];

const BANKS = [
  'ธนาคารกสิกรไทย',
  'ธนาคารไทยพาณิชย์',
  'ธนาคารกรุงเทพ',
  'ธนาคารกรุงไทย',
];

/* ============================== ล้างข้อมูล ============================== */
async function wipe() {
  step('ล้างข้อมูลธุรกิจทั้งหมด (เก็บสิทธิ์และบทบาทไว้)');
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => !KEEP_TABLES.has(t));
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
  done(`ล้าง ${tables.length} ตาราง`);
}

/* ============================== สิทธิ์และบทบาท ============================== */
/**
 * ต้องสร้างใหม่ทุกครั้งหลังล้าง
 *
 * ตาราง Role มีคอลัมน์ companyId ที่อ้างถึงตารางบริษัท พอ TRUNCATE บริษัทแบบ CASCADE
 * Postgres จะล้างตาราง Role ทั้งตารางตามไปด้วย แม้แต่บทบาทระดับระบบที่ companyId เป็น null
 * เก็บไว้ใน KEEP_TABLES เฉย ๆ จึงไม่พอ
 */
async function seedAccessControl() {
  step('สิทธิ์การใช้งานและบทบาท');

  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, group: p.group },
      create: { code: p.code, name: p.name, group: p.group },
    });
  }
  done('สิทธิ์การใช้งาน', PERMISSION_CATALOG.length);

  const allPermissions = await prisma.permission.findMany({
    select: { id: true, code: true },
  });
  const permissionIdByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

  /*
   * COMPANY_ADMIN ไม่มีใน catalog กลาง แต่ระบบใช้จริง — คือผู้ดูแลของบริษัทตัวเอง
   * ให้สิทธิ์ครบเหมือน SYSTEM_ADMIN ได้ เพราะขอบเขต COMPANY จำกัดให้เห็นแค่บริษัทตัวเองอยู่แล้ว
   */
  const roleDefs = [
    ...ROLE_CATALOG,
    {
      code: 'COMPANY_ADMIN',
      name: 'Company Admin',
      description: 'ผู้ดูแลของบริษัทตัวเอง จัดการได้ทุกอย่างภายในขอบเขตบริษัท',
      isSystem: true,
      permissionCodes: allPermissions.map((p) => p.code),
    },
  ];

  for (const r of roleDefs) {
    const role = await prisma.role.create({
      data: {
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
      },
    });
    const codes = [...new Set(r.permissionCodes)].filter((c) =>
      permissionIdByCode.has(c),
    );
    await prisma.rolePermission.createMany({
      data: codes.map((code) => ({
        roleId: role.id,
        permissionId: permissionIdByCode.get(code)!,
      })),
    });
  }
  done('บทบาท', roleDefs.length);
}

/* ============================== องค์กร ============================== */
async function seedOrganization() {
  step('โครงสร้างองค์กร');

  const company = await prisma.company.create({
    data: {
      code: COMPANY.code,
      nameTh: COMPANY.nameTh,
      nameEn: COMPANY.nameEn,
      taxId: COMPANY.taxId,
      address: COMPANY.address,
      phone: '02-123-4567',
      email: 'hr@tjc.co.th',
      status: 'ACTIVE',
    },
  });
  done(`บริษัท ${company.nameTh}`);

  const branches: {
    id: string;
    code: string;
    nameTh: string;
    employeeCount: number;
  }[] = [];
  for (const b of BRANCHES) {
    const row = await prisma.branch.create({
      data: {
        companyId: company.id,
        code: b.code,
        nameTh: b.nameTh,
        address: b.address,
        phone: b.code === 'HQ' ? '02-123-4567' : '038-123-456',
        status: 'ACTIVE',
      },
    });
    branches.push({
      id: row.id,
      code: row.code,
      nameTh: row.nameTh,
      employeeCount: b.employeeCount,
    });
  }
  done('สาขา', branches.length);

  /* แผนก — ระดับบริษัท ใช้ร่วมกันทุกสาขา */
  const deptDefs = [
    { code: 'MGT', nameTh: 'ฝ่ายบริหาร', divisions: ['สำนักกรรมการผู้จัดการ'] },
    {
      code: 'HR',
      nameTh: 'ฝ่ายทรัพยากรบุคคล',
      divisions: ['สรรหาและพัฒนา', 'ค่าตอบแทนและสวัสดิการ'],
    },
    {
      code: 'FIN',
      nameTh: 'ฝ่ายบัญชีและการเงิน',
      divisions: ['บัญชี', 'การเงิน'],
    },
    {
      code: 'SALES',
      nameTh: 'ฝ่ายขายและการตลาด',
      divisions: ['ขายในประเทศ', 'การตลาด'],
    },
    {
      code: 'OPS',
      nameTh: 'ฝ่ายปฏิบัติการ',
      divisions: ['คลังสินค้า', 'จัดส่ง'],
    },
    {
      code: 'IT',
      nameTh: 'ฝ่ายเทคโนโลยีสารสนเทศ',
      divisions: ['พัฒนาระบบ', 'ซัพพอร์ต'],
    },
  ];

  const departments: {
    id: string;
    code: string;
    nameTh: string;
    divisionIds: string[];
  }[] = [];
  for (const d of deptDefs) {
    const dept = await prisma.department.create({
      data: {
        companyId: company.id,
        code: d.code,
        nameTh: d.nameTh,
        status: 'ACTIVE',
      },
    });
    const divisionIds: string[] = [];
    for (const [i, name] of d.divisions.entries()) {
      const div = await prisma.division.create({
        data: {
          departmentId: dept.id,
          code: `${d.code}-${i + 1}`,
          nameTh: name,
          status: 'ACTIVE',
        },
      });
      divisionIds.push(div.id);
    }
    departments.push({
      id: dept.id,
      code: d.code,
      nameTh: d.nameTh,
      divisionIds,
    });
  }
  done('แผนก', departments.length);
  done(
    'กลุ่มงาน',
    departments.reduce((n, d) => n + d.divisionIds.length, 0),
  );

  /* ตำแหน่ง — level 1 สูงสุด ไล่ลงถึง 9 */
  const positionDefs = [
    {
      code: 'MD',
      nameTh: 'กรรมการผู้จัดการ',
      level: 1,
      salary: [120000, 150000],
    },
    {
      code: 'DIR',
      nameTh: 'ผู้อำนวยการฝ่าย',
      level: 2,
      salary: [80000, 110000],
    },
    { code: 'MGR', nameTh: 'ผู้จัดการ', level: 4, salary: [45000, 65000] },
    { code: 'SUP', nameTh: 'หัวหน้างาน', level: 5, salary: [30000, 42000] },
    {
      code: 'SR',
      nameTh: 'เจ้าหน้าที่อาวุโส',
      level: 6,
      salary: [25000, 33000],
    },
    { code: 'STAFF', nameTh: 'เจ้าหน้าที่', level: 7, salary: [18000, 26000] },
    {
      code: 'OPR',
      nameTh: 'พนักงานปฏิบัติการ',
      level: 8,
      salary: [12000, 17000],
    },
  ];
  const positions: Record<
    string,
    { id: string; salary: number[]; nameTh: string }
  > = {};
  for (const [i, p] of positionDefs.entries()) {
    const row = await prisma.position.create({
      data: {
        companyId: company.id,
        code: p.code,
        nameTh: p.nameTh,
        level: p.level,
        sortOrder: i + 1,
        status: 'ACTIVE',
      },
    });
    positions[p.code] = { id: row.id, salary: p.salary, nameTh: p.nameTh };
  }
  done('ตำแหน่ง', positionDefs.length);

  const typeDefs = [
    { code: 'MONTHLY', nameTh: 'พนักงานรายเดือน' },
    { code: 'DAILY', nameTh: 'พนักงานรายวัน' },
    { code: 'CONTRACT', nameTh: 'พนักงานสัญญาจ้าง' },
  ];
  const employeeTypes: Record<string, string | undefined> = {};
  for (const t of typeDefs) {
    const row = await prisma.employeeType.create({
      data: {
        companyId: company.id,
        code: t.code,
        nameTh: t.nameTh,
        status: 'ACTIVE',
      },
    });
    employeeTypes[t.code] = row.id;
  }
  done('ประเภทพนักงาน', typeDefs.length);

  return { company, branches, departments, positions, employeeTypes };
}

/* ============================== ตั้งค่าพื้นฐาน ============================== */
async function seedBaseSettings(
  companyId: string,
  branches: { id: string; code: string; nameTh: string }[],
) {
  step(
    'ตั้งค่าพื้นฐาน — สถานที่ลงเวลา · นโยบายเวลาทำงาน · วันหยุด · ประเภทการลา',
  );

  /* จุดลงเวลาของแต่ละสาขา */
  for (const b of branches) {
    await prisma.attendanceLocation.create({
      data: {
        companyId,
        branchId: b.id,
        code: `LOC-${b.code}`,
        nameTh: `จุดลงเวลา${b.nameTh}`,
        type: 'OFFICE',
        latitude: b.code === 'HQ' ? 13.7563 : 12.6807,
        longitude: b.code === 'HQ' ? 100.5018 : 101.2537,
        radiusMeters: 150,
        status: 'ACTIVE',
      },
    });
  }
  done('จุดลงเวลา', branches.length);

  /*
   * วันหยุดประจำสัปดาห์ — ต้องตั้งที่ระดับบริษัท ไม่ใช่ระดับระบบ
   *
   * ค่าเริ่มต้นของระบบคือหยุดแค่วันอาทิตย์ ถ้าไม่แก้ ตัวคำนวณเวลาจะถือว่า
   * วันเสาร์เป็นวันทำงาน แล้วบันทึกว่าพนักงานขาดงานทุกวันเสาร์
   * (เคยเจอมาแล้ว: ขาดงาน 583 จาก 592 วันเสาร์) จนคำนวณเงินเดือนไม่ผ่าน
   *
   * การตั้งค่าเก็บเป็น jsonb คีย์ `system::<companyId>` แยกจากคีย์ `system` ของทั้งระบบ
   */
  const settingId = `system::${companyId}`;
  const existing = await prisma.systemSetting.findUnique({
    where: { id: settingId },
    select: { value: true },
  });
  const currentValue =
    existing?.value && typeof existing.value === 'object'
      ? (existing.value as Record<string, unknown>)
      : {};
  await prisma.systemSetting.upsert({
    where: { id: settingId },
    update: {
      value: { ...currentValue, attendanceWeeklyHolidays: ['SAT', 'SUN'] },
    },
    create: {
      id: settingId,
      value: { attendanceWeeklyHolidays: ['SAT', 'SUN'] },
    },
  });
  done('วันหยุดประจำสัปดาห์ เสาร์-อาทิตย์');

  /* นโยบายเวลาทำงาน = "กะ" ที่พนักงานถูกผูกไว้ */
  const policyDefs = [
    {
      code: 'OFFICE',
      name: 'พนักงานสำนักงาน 08:30-17:30',
      morningCheckInDeadline: '08:30',
      checkoutAllowedFrom: '17:30',
      lateGraceMinutes: 10,
    },
    {
      code: 'SHIFT',
      name: 'พนักงานปฏิบัติการ 08:00-17:00',
      morningCheckInDeadline: '08:00',
      checkoutAllowedFrom: '17:00',
      lateGraceMinutes: 5,
    },
  ];
  const policies: Record<string, string> = {};
  for (const [i, p] of policyDefs.entries()) {
    const row = await prisma.attendancePolicy.create({
      data: {
        companyId,
        code: p.code,
        name: p.name,
        morningCheckInDeadline: p.morningCheckInDeadline,
        afternoonCheckInDeadline: '13:00',
        checkoutAllowedFrom: p.checkoutAllowedFrom,
        lateGraceMinutes: p.lateGraceMinutes,
        latePenaltyRatePerMinute: 2,
        missingLogPenaltyPerDay: 100,
        priority: 100 - i,
        effectiveFrom: dateOnly('2026-01-01'),
        status: 'ACTIVE',
      },
    });
    policies[p.code] = row.id;
  }
  done('นโยบายเวลาทำงาน', policyDefs.length);

  /* วันหยุดประจำปีตามประกาศธนาคารแห่งประเทศไทย */
  const holidays = [
    ['2026-01-01', 'วันขึ้นปีใหม่'],
    ['2026-03-03', 'วันมาฆบูชา'],
    ['2026-04-06', 'วันจักรี'],
    ['2026-04-13', 'วันสงกรานต์'],
    ['2026-04-14', 'วันสงกรานต์'],
    ['2026-04-15', 'วันสงกรานต์'],
    ['2026-05-01', 'วันแรงงานแห่งชาติ'],
    ['2026-05-04', 'วันฉัตรมงคล'],
    ['2026-06-01', 'วันวิสาขบูชา'],
    ['2026-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'],
    ['2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'],
    ['2026-07-29', 'วันอาสาฬหบูชา'],
    ['2026-07-30', 'วันเข้าพรรษา'],
    ['2026-08-12', 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง'],
    ['2026-10-13', 'วันนวมินทรมหาราช'],
    ['2026-10-23', 'วันปิยมหาราช'],
    ['2026-12-05', 'วันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9'],
    ['2026-12-10', 'วันรัฐธรรมนูญ'],
    ['2026-12-31', 'วันสิ้นปี'],
  ] as const;
  for (const [date, name] of holidays) {
    await prisma.holidayCalendar.create({
      data: {
        companyId,
        date: dateOnly(date),
        name,
        holidayType: 'PUBLIC',
        status: 'ACTIVE',
      },
    });
  }
  done('วันหยุดประจำปี 2569', holidays.length);

  /* ประเภทการลา */
  const leaveDefs = [
    {
      code: 'ANNUAL',
      nameTh: 'ลาพักร้อน',
      isPaid: true,
      quota: 6,
      attach: false,
    },
    { code: 'SICK', nameTh: 'ลาป่วย', isPaid: true, quota: 30, attach: true },
    {
      code: 'PERSONAL',
      nameTh: 'ลากิจ',
      isPaid: true,
      quota: 3,
      attach: false,
    },
    {
      code: 'MATERNITY',
      nameTh: 'ลาคลอดบุตร',
      isPaid: true,
      quota: 98,
      attach: true,
    },
    {
      code: 'ORDINATION',
      nameTh: 'ลาอุปสมบท',
      isPaid: true,
      quota: 15,
      attach: true,
    },
    {
      code: 'UNPAID',
      nameTh: 'ลาไม่รับค่าจ้าง',
      isPaid: false,
      quota: 0,
      attach: false,
    },
  ];
  const leaveTypes: Record<
    string,
    { id: string; quota: number; nameTh: string }
  > = {};
  for (const lt of leaveDefs) {
    const row = await prisma.leaveType.create({
      data: {
        companyId,
        code: lt.code,
        nameTh: lt.nameTh,
        isPaid: lt.isPaid,
        requiresAttachment: lt.attach,
        allowHalfDay: true,
        allowHourly: lt.code === 'PERSONAL',
        deductQuota: lt.code !== 'UNPAID',
        affectAttendance: true,
        // ลาไม่รับค่าจ้างต้องไปตัดเงินเดือน ประเภทอื่นไม่ตัด
        affectPayroll: lt.code === 'UNPAID',
        minLeaveUnitMinutes: 60,
        status: 'ACTIVE',
      },
    });
    leaveTypes[lt.code] = { id: row.id, quota: lt.quota, nameTh: lt.nameTh };
  }
  done('ประเภทการลา', leaveDefs.length);

  return { policies, leaveTypes };
}

/* ============================== ตั้งค่าเงินเดือน ============================== */
async function seedPayrollSettings(companyId: string) {
  step('ตั้งค่าเงินเดือน — ส่วนประกอบ · ปีภาษี · ขั้นบันไดภาษี');

  const componentDefs = [
    {
      code: 'BASE_SALARY',
      nameTh: 'เงินเดือน',
      type: 'EARNING',
      sourceType: 'BASE_SALARY',
      taxable: true,
      sso: true,
      recurring: true,
    },
    {
      code: 'POSITION_ALLOWANCE',
      nameTh: 'เงินประจำตำแหน่ง',
      type: 'EARNING',
      sourceType: 'ALLOWANCE',
      taxable: true,
      sso: true,
      recurring: true,
    },
    {
      code: 'TRANSPORT_ALLOWANCE',
      nameTh: 'ค่าเดินทาง',
      type: 'EARNING',
      sourceType: 'ALLOWANCE',
      taxable: true,
      sso: false,
      recurring: true,
    },
    {
      code: 'PHONE_ALLOWANCE',
      nameTh: 'ค่าโทรศัพท์',
      type: 'EARNING',
      sourceType: 'ALLOWANCE',
      taxable: true,
      sso: false,
      recurring: true,
    },
    {
      code: 'OTHER_ALLOWANCE',
      nameTh: 'เงินเพิ่มอื่นๆ',
      type: 'EARNING',
      sourceType: 'ALLOWANCE',
      taxable: true,
      sso: false,
      recurring: true,
    },
    {
      code: 'OVERTIME',
      nameTh: 'ค่าล่วงเวลา',
      type: 'EARNING',
      sourceType: 'OVERTIME',
      taxable: true,
      sso: true,
      recurring: false,
    },
    {
      code: 'BONUS',
      nameTh: 'โบนัส',
      type: 'EARNING',
      sourceType: 'BONUS',
      taxable: true,
      sso: false,
      recurring: false,
    },
    {
      code: 'SOCIAL_SECURITY',
      nameTh: 'ประกันสังคม',
      type: 'DEDUCTION',
      sourceType: 'SOCIAL_SECURITY',
      taxable: false,
      sso: false,
      recurring: true,
    },
    {
      code: 'WITHHOLDING_TAX',
      nameTh: 'ภาษีหัก ณ ที่จ่าย',
      type: 'DEDUCTION',
      sourceType: 'TAX',
      taxable: false,
      sso: false,
      recurring: true,
    },
    {
      code: 'LATE_DEDUCTION',
      nameTh: 'หักมาสาย',
      type: 'DEDUCTION',
      sourceType: 'ATTENDANCE',
      taxable: false,
      sso: false,
      recurring: false,
    },
    {
      code: 'ABSENT_DEDUCTION',
      nameTh: 'หักขาดงาน',
      type: 'DEDUCTION',
      sourceType: 'ATTENDANCE',
      taxable: false,
      sso: false,
      recurring: false,
    },
    {
      code: 'UNPAID_LEAVE',
      nameTh: 'หักลาไม่รับค่าจ้าง',
      type: 'DEDUCTION',
      sourceType: 'LEAVE',
      taxable: false,
      sso: false,
      recurring: false,
    },
  ] as const;

  for (const [i, c] of componentDefs.entries()) {
    await prisma.payrollComponent.create({
      data: {
        companyId,
        code: c.code,
        nameTh: c.nameTh,
        type: c.type,
        sourceType: c.sourceType,
        isTaxable: c.taxable,
        isSocialSecurityBase: c.sso,
        isRecurring: c.recurring,
        sortOrder: (i + 1) * 10,
        status: 'ACTIVE',
      },
    });
  }
  done('ส่วนประกอบเงินเดือน', componentDefs.length);

  /*
   * ปีภาษี 2569 พร้อมขั้นบันไดภาษีเงินได้บุคคลธรรมดา
   * ก่อนหน้านี้ระบบไม่มีขั้นภาษีเลย ภาษีจึงคิดออกมาเป็น 0 ทั้งระบบ
   */
  const taxYear = await prisma.payrollTaxYear.create({
    data: {
      companyId,
      taxYear: 2026,
      code: 'TY-2569',
      name: 'ปีภาษี 2569',
      startDate: dateOnly('2026-01-01'),
      endDate: dateOnly('2026-12-31'),
      personalExpenseRate: 0.5,
      personalExpenseMax: 100000,
      standardPersonalAllowance: 60000,
      isActive: true,
      status: 'ACTIVE',
    },
  });

  const brackets = [
    { min: 0, max: 150000, rate: 0, quick: 0 },
    { min: 150000, max: 300000, rate: 0.05, quick: 7500 },
    { min: 300000, max: 500000, rate: 0.1, quick: 22500 },
    { min: 500000, max: 750000, rate: 0.15, quick: 47500 },
    { min: 750000, max: 1000000, rate: 0.2, quick: 85000 },
    { min: 1000000, max: 2000000, rate: 0.25, quick: 135000 },
    { min: 2000000, max: 5000000, rate: 0.3, quick: 235000 },
    { min: 5000000, max: null, rate: 0.35, quick: 485000 },
  ];
  for (const [i, b] of brackets.entries()) {
    await prisma.payrollTaxBracket.create({
      data: {
        taxYearId: taxYear.id,
        minIncome: b.min,
        maxIncome: b.max,
        rate: b.rate,
        quickDeduction: b.quick,
        sortOrder: i + 1,
      },
    });
  }
  done(`ปีภาษี ${taxYear.name} + ขั้นบันไดภาษี`, brackets.length);

  return { taxYear };
}

/* ============================== พนักงาน ============================== */
type OrgData = Awaited<ReturnType<typeof seedOrganization>>;

async function seedEmployees(
  org: OrgData,
  policies: Record<string, string>,
  leaveTypes: Record<string, { id: string; quota: number; nameTh: string }>,
) {
  step('พนักงาน · ฐานเงินเดือน · รายการค่าตอบแทนประจำ · สิทธิ์วันลา');

  /* สัดส่วนตำแหน่งในแต่ละสาขา — พีระมิดแบบบริษัทจริง */
  const hqMix = [
    'MD',
    'DIR',
    'DIR',
    'MGR',
    'MGR',
    'MGR',
    'SUP',
    'SUP',
    'SUP',
    'SR',
    'SR',
    'SR',
    'SR',
    'STAFF',
    'STAFF',
    'STAFF',
    'STAFF',
    'STAFF',
    'STAFF',
    'OPR',
    'OPR',
    'OPR',
    'OPR',
    'OPR',
  ];
  const ryMix = [
    'MGR',
    'SUP',
    'SUP',
    'SR',
    'SR',
    'STAFF',
    'STAFF',
    'STAFF',
    'STAFF',
    'OPR',
    'OPR',
    'OPR',
    'OPR',
    'OPR',
    'OPR',
    'OPR',
  ];

  const employees: {
    id: string;
    code: string;
    name: string;
    branchId: string;
    branchCode: string;
    departmentId: string;
    positionCode: string;
    startDate: Date;
    baseSalary: number;
    policyId: string;
  }[] = [];

  let seq = 0;
  for (const branch of org.branches) {
    const mix = branch.code === 'HQ' ? hqMix : ryMix;

    for (let i = 0; i < mix.length; i++) {
      const first = pick(FIRST_NAMES, seq * 3 + 1);
      const last = pick(LAST_NAMES, seq * 5 + 2);
      const posCode = mix[i];
      const position = org.positions[posCode];
      const dept = pick(org.departments, posCode === 'MD' ? 0 : seq + 1);

      /*
       * วันเริ่มงานกระจายย้อนหลัง 1-6 ปี
       * ยกเว้น 3 คนท้ายที่จงใจให้เข้ากลางงวดในช่วง 3 เดือนที่จำลอง
       * เพื่อให้เห็นการคิดเงินเดือนตามสัดส่วนวันจริง
       */
      const isRecentHire = branch.code === 'HQ' && i >= mix.length - 2;
      const startDate = isRecentHire
        ? dateOnly(i === mix.length - 1 ? '2026-06-08' : '2026-05-11')
        : dateOnly(
            `${2020 + (seq % 6)}-${String((seq % 12) + 1).padStart(2, '0')}-${String((seq % 27) + 1).padStart(2, '0')}`,
          );

      const baseSalary = randInt(position.salary[0], position.salary[1]);
      const typeCode = posCode === 'OPR' ? 'DAILY' : 'MONTHLY';
      const policyId = posCode === 'OPR' ? policies.SHIFT : policies.OFFICE;

      const employee = await prisma.employee.create({
        data: {
          employeeCode: `TJC-69-${String(seq + 1).padStart(4, '0')}`,
          firstName: first,
          lastName: last,
          displayName: `${first} ${last}`,
          nickname: pick(NICKNAMES, seq),
          title: seq % 3 === 0 ? 'นาย' : seq % 3 === 1 ? 'นาง' : 'นางสาว',
          email: `staff${seq + 1}@tjc.co.th`,
          phone: `08${String(10000000 + seq * 137891).slice(0, 8)}`,
          position: null,
          positionId: position.id,
          startDate,
          probationEndDate: isRecentHire ? addDays(startDate, 119) : null,
          status: isRecentHire ? 'PROBATION' : 'ACTIVE',
          companyId: org.company.id,
          branchId: branch.id,
          departmentId: dept.id,
          divisionId: pick(dept.divisionIds, seq),
          employeeTypeId: org.employeeTypes[typeCode] ?? null,
        },
      });

      /* ข้อมูลส่วนตัว — ใช้ในสลิป ประกันสังคม และรายงานภาษี */
      await prisma.employeeProfile.create({
        data: {
          employeeId: employee.id,
          companyId: org.company.id,
          gender: seq % 3 === 0 ? 'MALE' : 'FEMALE',
          birthDate: dateOnly(
            `${1980 + (seq % 22)}-${String((seq % 12) + 1).padStart(2, '0')}-${String((seq % 27) + 1).padStart(2, '0')}`,
          ),
          nationalId: `1${String(100000000000 + seq * 7654321).slice(0, 12)}`,
          nationality: 'ไทย',
          maritalStatus: seq % 3 === 0 ? 'MARRIED' : 'SINGLE',
          currentAddress: `${randInt(1, 999)}/${randInt(1, 99)} ${branch.code === 'HQ' ? 'กรุงเทพมหานคร' : 'จังหวัดระยอง'}`,
          emergencyContactName: `${pick(FIRST_NAMES, seq + 7)} ${last}`,
          emergencyContactPhone: `08${String(20000000 + seq * 91237).slice(0, 8)}`,
          emergencyContactRelation: seq % 2 === 0 ? 'คู่สมรส' : 'บิดา/มารดา',
          bankName: pick(BANKS, seq),
          bankAccountNo: String(1000000000 + seq * 3571113).slice(0, 10),
          bankAccountName: `${first} ${last}`,
          taxId: `1${String(100000000000 + seq * 7654321).slice(0, 12)}`,
          socialSecurityNo: `1${String(100000000000 + seq * 7654321).slice(0, 12)}`,
          educationLevel: ['ปวส.', 'ปริญญาตรี', 'ปริญญาโท'][seq % 3],
        },
      });

      /* ผูกกะการทำงาน */
      await prisma.employeeWorkShift.create({
        data: {
          employeeId: employee.id,
          policyId,
          effectiveFrom: startDate,
          status: 'ACTIVE',
        },
      });

      /* ฐานเงินเดือน */
      const positionAllowance = ['MD', 'DIR', 'MGR'].includes(posCode)
        ? randInt(3000, 10000)
        : 0;
      await prisma.employeeCompensation.create({
        data: {
          companyId: org.company.id,
          employeeId: employee.id,
          effectiveDate: startDate,
          baseSalary: money(baseSalary),
          paymentMethod: 'BANK_TRANSFER',
          bankName: pick(BANKS, seq),
          bankAccountNo: String(1000000000 + seq * 3571113).slice(0, 10),
          bankAccountName: `${first} ${last}`,
          socialSecurityEnabled: true,
          taxEnabled: true,
          approvalStatus: 'APPROVED',
          status: 'ACTIVE',
        },
      });

      /* เงินประจำตำแหน่ง — อยู่ที่รายการประจำเหมือนเบี้ยก้อนอื่นทั้งหมด */
      if (positionAllowance > 0) {
        await prisma.employeeCompensationItem.create({
          data: {
            companyId: org.company.id,
            employeeId: employee.id,
            code: 'POSITION_ALLOWANCE',
            name: 'เงินประจำตำแหน่ง',
            type: 'EARNING',
            sourceType: 'ALLOWANCE',
            amount: money(positionAllowance),
            rate: money(positionAllowance),
            effectiveDate: startDate,
            isTaxable: true,
            isSocialSecurityBase: true,
            prorateByEmploymentDays: true,
            sortOrder: 100,
            status: 'ACTIVE',
          },
        });
      }

      /*
       * รายการค่าตอบแทนประจำ — ใช้ตัวเลือก "หารตามวัน" ทั้งสองแบบ
       * ค่าอาหารหารตามวัน ส่วนประกันกลุ่มจ่ายเต็มเสมอ
       */
      await prisma.employeeCompensationItem.create({
        data: {
          companyId: org.company.id,
          employeeId: employee.id,
          code: 'FOOD',
          name: 'ค่าอาหารประจำ',
          type: 'EARNING',
          sourceType: 'ALLOWANCE',
          amount: money(posCode === 'OPR' ? 1500 : 2000),
          rate: money(posCode === 'OPR' ? 1500 : 2000),
          effectiveDate: startDate,
          isTaxable: true,
          isSocialSecurityBase: false,
          prorateByEmploymentDays: true,
          sortOrder: 110,
          status: 'ACTIVE',
        },
      });

      if (['MD', 'DIR', 'MGR', 'SUP'].includes(posCode)) {
        await prisma.employeeCompensationItem.create({
          data: {
            companyId: org.company.id,
            employeeId: employee.id,
            code: 'GROUP_INSURANCE',
            name: 'ประกันกลุ่มรายเดือน',
            type: 'EARNING',
            sourceType: 'ALLOWANCE',
            amount: '800.00',
            rate: '800.00',
            effectiveDate: startDate,
            isTaxable: true,
            isSocialSecurityBase: false,
            // จ่ายเต็มเสมอ เบี้ยประกันคิดเป็นรายเดือนไม่ได้หารตามวัน
            prorateByEmploymentDays: false,
            sortOrder: 120,
            status: 'ACTIVE',
          },
        });
      }

      /* บางคนมีหักผ่อนชำระประจำ — ต้องหักเต็มงวดเสมอ */
      if (chance(20)) {
        await prisma.employeeCompensationItem.create({
          data: {
            companyId: org.company.id,
            employeeId: employee.id,
            code: 'LOAN',
            name: 'หักผ่อนชำระสวัสดิการ',
            type: 'DEDUCTION',
            sourceType: 'MANUAL',
            amount: '2000.00',
            rate: '2000.00',
            effectiveDate: startDate,
            isTaxable: false,
            isSocialSecurityBase: false,
            prorateByEmploymentDays: false,
            sortOrder: 210,
            status: 'ACTIVE',
          },
        });
      }

      /* สิทธิ์วันลาของปี */
      const serviceYears = Math.max(0, 2026 - startDate.getUTCFullYear());
      for (const [code, lt] of Object.entries(leaveTypes)) {
        if (code === 'UNPAID') continue;
        const entitlement =
          code === 'ANNUAL' ? Math.min(6 + serviceYears, 15) : lt.quota;
        await prisma.leaveBalance.create({
          data: {
            employeeId: employee.id,
            leaveTypeId: lt.id,
            year: 2026,
            entitlementDays: money(entitlement),
            carriedForwardDays:
              code === 'ANNUAL' && serviceYears > 0
                ? money(randInt(0, 3))
                : '0.00',
          },
        });
      }

      employees.push({
        id: employee.id,
        code: employee.employeeCode,
        name: employee.displayName ?? '',
        branchId: branch.id,
        branchCode: branch.code,
        departmentId: dept.id,
        positionCode: posCode,
        startDate,
        baseSalary,
        policyId,
      });
      seq++;
    }
  }
  done('พนักงาน', employees.length);

  /* สายบังคับบัญชา — ผู้จัดการของแต่ละสาขาคุมคนในสาขาเดียวกัน */
  for (const branch of org.branches) {
    const inBranch = employees.filter((e) => e.branchId === branch.id);
    const head = inBranch.find((e) =>
      ['MD', 'DIR', 'MGR'].includes(e.positionCode),
    );
    const supervisors = inBranch.filter((e) => e.positionCode === 'SUP');
    if (!head) continue;

    for (const emp of inBranch) {
      if (emp.id === head.id) continue;
      const boss = ['DIR', 'MGR', 'SUP'].includes(emp.positionCode)
        ? head
        : supervisors.length
          ? pick(supervisors, employees.indexOf(emp))
          : head;
      await prisma.employee.update({
        where: { id: emp.id },
        data: { supervisorId: boss.id === emp.id ? head.id : boss.id },
      });
    }
  }
  done('ผูกสายบังคับบัญชาแล้ว');

  return employees;
}

/* ============================== บัญชีผู้ใช้ ============================== */
async function seedUsers(
  org: OrgData,
  employees: Awaited<ReturnType<typeof seedEmployees>>,
) {
  step('บัญชีผู้ใช้และสิทธิ์');

  const roles = await prisma.role.findMany({
    select: { id: true, code: true },
  });
  const roleMap: Record<string, string> = {};
  for (const r of roles) roleMap[r.code] = r.id;

  const required = [
    'SYSTEM_ADMIN',
    'COMPANY_ADMIN',
    'HR_ADMIN',
    'PAYROLL_ACCOUNTING',
    'MANAGER',
    'EMPLOYEE',
  ];
  const missing = required.filter((c) => !roleMap[c]);
  if (missing.length) {
    throw new Error(
      `ไม่พบบทบาท: ${missing.join(', ')} — รัน npm run db:seed:roles ก่อน`,
    );
  }

  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const adminHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);
  const accounts: { email: string; role: string; scope: string }[] = [];

  /* superadmin ระดับระบบ */
  await prisma.user.create({
    data: {
      email: SUPERADMIN_EMAIL,
      passwordHash: adminHash,
      displayName: 'ผู้ดูแลระบบสูงสุด',
      status: 'ACTIVE',
      scopeLevel: 'GLOBAL',
      roles: { create: [{ roleId: roleMap.SYSTEM_ADMIN }] },
    },
  });
  accounts.push({
    email: SUPERADMIN_EMAIL,
    role: 'SYSTEM_ADMIN',
    scope: 'ทั้งระบบ',
  });

  /* ผู้ใช้ระดับบริษัท */
  const companyUsers = [
    { email: 'admin@tjc.co.th', name: 'ผู้ดูแลบริษัท', role: 'COMPANY_ADMIN' },
    { email: 'hr@tjc.co.th', name: 'ฝ่ายบุคคล', role: 'HR_ADMIN' },
    {
      email: 'payroll@tjc.co.th',
      name: 'ฝ่ายบัญชีเงินเดือน',
      role: 'PAYROLL_ACCOUNTING',
    },
  ];
  for (const u of companyUsers) {
    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash: demoHash,
        displayName: u.name,
        status: 'ACTIVE',
        scopeLevel: 'COMPANY',
        scopedCompanyId: org.company.id,
        roles: { create: [{ roleId: roleMap[u.role] }] },
      },
    });
    accounts.push({ email: u.email, role: u.role, scope: 'ทั้งบริษัท' });
  }

  /*
   * บัญชีของพนักงาน — ผู้จัดการและหัวหน้างานได้บทบาท MANAGER
   * ที่เหลือได้ EMPLOYEE และผูกขอบเขตไว้ที่สาขาตัวเอง
   */
  let linked = 0;
  for (const emp of employees) {
    const isManager = ['MD', 'DIR', 'MGR', 'SUP'].includes(emp.positionCode);
    // พนักงานปฏิบัติการบางส่วนยังไม่เปิดบัญชี เหมือนบริษัทจริงที่ทยอยเปิด
    if (!isManager && emp.positionCode === 'OPR' && chance(40)) continue;

    const user = await prisma.user.create({
      data: {
        email: `${emp.code.toLowerCase()}@tjc.co.th`,
        passwordHash: demoHash,
        displayName: emp.name,
        status: 'ACTIVE',
        scopeLevel: 'BRANCH',
        scopedCompanyId: org.company.id,
        scopedBranchId: emp.branchId,
        roles: {
          create: [{ roleId: isManager ? roleMap.MANAGER : roleMap.EMPLOYEE }],
        },
      },
    });
    await prisma.employee.update({
      where: { id: emp.id },
      data: { userId: user.id },
    });
    linked++;
  }
  done('บัญชีผู้ใช้ทั้งหมด', accounts.length + linked);
  done('บัญชีที่ผูกกับพนักงาน', linked);

  return accounts;
}

/* ============================== MAIN ============================== */
async function main() {
  console.log('===== สร้างข้อมูลจำลอง ระยะที่ 1: รากฐาน =====');

  await wipe();
  await seedAccessControl();
  const org = await seedOrganization();
  const { policies, leaveTypes } = await seedBaseSettings(
    org.company.id,
    org.branches,
  );
  await seedPayrollSettings(org.company.id);
  const employees = await seedEmployees(org, policies, leaveTypes);
  await seedUsers(org, employees);

  console.log('\n===== ระยะที่ 1 เสร็จ =====');
  console.log(
    `บัญชีผู้ดูแลระบบ : ${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD}`,
  );
  console.log(`บัญชีอื่นทั้งหมด : รหัสผ่าน ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('\n❌ ล้มเหลว:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
