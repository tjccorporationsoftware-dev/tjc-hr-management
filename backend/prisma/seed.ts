// @ts-nocheck -- legacy seed: ถูกแทนที่ด้วย scripts/seed-fresh-multitenant.ts (ยังไม่อัปเดตเป็น per-company master data)
/* eslint-disable no-console */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { DEFAULT_PAYROLL_COMPONENTS } from "../src/modules/payroll/constants/payroll-default-components";
import { permissions, roles } from "./seed-data/access-control";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

/**
 * =========================
 * TYPES
 * =========================
 * ช่วยแก้ปัญหา array ว่างกลายเป็น never[]
 */

type CompanyRow = Prisma.CompanyGetPayload<{}>;
type BranchRow = Prisma.BranchGetPayload<{}>;
type DepartmentRow = Prisma.DepartmentGetPayload<{}>;
type DivisionRow = Prisma.DivisionGetPayload<{}>;
type EmployeeTypeRow = Prisma.EmployeeTypeGetPayload<{}>;
type PositionRow = Prisma.PositionGetPayload<{}>;
type EmployeeRow = Prisma.EmployeeGetPayload<{}>;
type UserRow = Prisma.UserGetPayload<{}>;
type LeaveTypeRow = Prisma.LeaveTypeGetPayload<{}>;
type DocumentTypeRow = Prisma.DocumentTypeGetPayload<{}>;
type AttendanceLocationRow = Prisma.AttendanceLocationGetPayload<{}>;
type AttendanceDeviceRow = Prisma.AttendanceDeviceGetPayload<{}>;
type EvaluationFormRow = Prisma.EvaluationFormGetPayload<{}>;
type OnboardingChecklistRow = Prisma.OnboardingChecklistGetPayload<{}>;
type OnboardingChecklistItemRow = Prisma.OnboardingChecklistItemGetPayload<{}>;

/**
 * =========================
 * CONFIG
 * =========================
 */

const DEMO_EMPLOYEE_COUNT = 50;

/**
 * รหัสผ่าน seed ต้องมาจาก env เสมอเมื่อรันบน production
 *
 * เดิมใช้ `process.env.X ?? "Admin@123456"` ตรง ๆ ซึ่งแปลว่าถ้าลืมตั้ง env
 * ระบบจริงจะได้บัญชีผู้ดูแลรหัสผ่านที่เดาได้ทันทีโดยไม่มีอะไรเตือน
 * ตัวนี้จึงยอมให้มีค่า fallback เฉพาะตอน dev และโยน error ทิ้งเมื่อเป็น production
 */
function requireSeedPassword(envKey: string, devFallback: string) {
  const value = process.env[envKey];

  if (value) return value;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${envKey} is required when NODE_ENV=production — ห้ามใช้รหัสผ่านตั้งต้นบนระบบจริง`,
    );
  }

  return devFallback;
}

const DEMO_PASSWORD = requireSeedPassword("SEED_DEMO_PASSWORD", "Admin@123456");
const currentYear = new Date().getFullYear();

/**
 * =========================
 * HELPERS
 * =========================
 */

function dateOnly(date: Date) {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(days: number) {
  const x = new Date();
  x.setDate(x.getDate() - days);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(base: Date, days: number) {
  const x = new Date(base);
  x.setDate(x.getDate() + days);
  return x;
}

function at(base: Date, hour: number, minute = 0) {
  const x = new Date(base);
  x.setHours(hour, minute, 0, 0);
  return x;
}

function decimal(value: number) {
  return value.toFixed(2);
}

function pad(num: number, length = 4) {
  return String(num).padStart(length, "0");
}

function pick<T>(items: T[], index: number): T {
  return items[index % items.length];
}

async function assignRole(userId: string, roleCode: string) {
  const role = await prisma.role.findUnique({
    where: { code: roleCode },
  });

  if (!role) return;

  await prisma.userRole.createMany({
    data: [
      {
        userId,
        roleId: role.id,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * =========================
 * PERMISSIONS / ROLES
 * =========================
 *
 * catalog ย้ายไปอยู่ prisma/seed-data/access-control.ts แล้ว เพื่อให้
 * seed.ts, สคริปต์อื่น และเทสต์ใช้ชุดเดียวกัน
 */


async function seedPermissions() {
  console.log("Seeding permissions...");

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
}

async function seedRoles() {
  console.log("Seeding roles...");

  for (const role of roles) {
    const savedRole = await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        isActive: true,
      },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        isActive: true,
      },
    });

    const rolePermissions = await prisma.permission.findMany({
      where: {
        code: {
          in: role.permissionCodes,
        },
      },
    });

    await prisma.rolePermission.createMany({
      data: rolePermissions.map((permission) => ({
        roleId: savedRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
}

/**
 * =========================
 * USERS
 * =========================
 */

async function seedAdminUser() {
  console.log("Seeding admin user...");

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@hr.local";
  const password = requireSeedPassword("SEED_ADMIN_PASSWORD", "Admin@123456");
  const displayName = process.env.SEED_ADMIN_NAME ?? "System Administrator";

  const passwordHash = await bcrypt.hash(password, 12);

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {
      displayName,
      passwordHash,
      status: "ACTIVE",
      deletedAt: null,
    },
    create: {
      email,
      displayName,
      passwordHash,
      status: "ACTIVE",
    },
  });

  await assignRole(adminUser.id, "SYSTEM_ADMIN");

  console.log("Admin user:");
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);

  return adminUser;
}

async function seedDemoUsers() {
  console.log("Seeding demo users...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users = [
    {
      email: "hr.manager@hr.local",
      displayName: "HR Manager Demo",
      phone: "0900000001",
      roleCode: "HR_ADMIN",
    },
    {
      email: "manager@hr.local",
      displayName: "Department Manager Demo",
      phone: "0900000002",
      roleCode: "MANAGER",
    },
    {
      email: "employee@hr.local",
      displayName: "Employee Demo",
      phone: "0900000003",
      roleCode: "EMPLOYEE",
    },
    {
      email: "payroll@hr.local",
      displayName: "Payroll Demo",
      phone: "0900000004",
      roleCode: "PAYROLL_ACCOUNTING",
    },
    {
      email: "executive@hr.local",
      displayName: "Executive Demo",
      phone: "0900000005",
      roleCode: "EXECUTIVE",
    },
  ];

  const result: Record<string, UserRow> = {};

  for (const item of users) {
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: {
        displayName: item.displayName,
        phone: item.phone,
        passwordHash,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        email: item.email,
        displayName: item.displayName,
        phone: item.phone,
        passwordHash,
        status: "ACTIVE",
      },
    });

    await assignRole(user.id, item.roleCode);
    result[item.email] = user;
  }

  console.log("Demo users:");
  console.log(`hr.manager@hr.local / ${DEMO_PASSWORD}`);
  console.log(`manager@hr.local / ${DEMO_PASSWORD}`);
  console.log(`employee@hr.local / ${DEMO_PASSWORD}`);
  console.log(`payroll@hr.local / ${DEMO_PASSWORD}`);
  console.log(`executive@hr.local / ${DEMO_PASSWORD}`);

  return result;
}

/**
 * =========================
 * ORGANIZATION / MASTER DATA
 * =========================
 */

async function seedDefaultCompany() {
  console.log("Seeding default company and organization master...");

  const company = await prisma.company.upsert({
    where: { code: "MAIN" },
    update: {
      nameTh: "บริษัท ตัวอย่าง จำกัด",
      nameEn: "Sample Company Limited",
      taxId: "0345566000001",
      address: "199 หมู่ 9 ตำบลเมืองเดช อำเภอเดชอุดม จังหวัดอุบลราชธานี 34160",
      phone: "045-000-000",
      email: "contact@example.com",
      status: "ACTIVE",
      deletedAt: null,
    },
    create: {
      code: "MAIN",
      nameTh: "บริษัท ตัวอย่าง จำกัด",
      nameEn: "Sample Company Limited",
      taxId: "0345566000001",
      address: "199 หมู่ 9 ตำบลเมืองเดช อำเภอเดชอุดม จังหวัดอุบลราชธานี 34160",
      phone: "045-000-000",
      email: "contact@example.com",
      status: "ACTIVE",
    },
  });

  const branchSeeds = [
    {
      code: "HQ",
      nameTh: "สำนักงานใหญ่",
      nameEn: "Head Office",
      address: "สำนักงานใหญ่ จังหวัดอุบลราชธานี",
    },
  ];

  const branches: BranchRow[] = [];

  for (const item of branchSeeds) {
    const branch = await prisma.branch.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: item.code,
        },
      },
      update: {
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        address: item.address,
        phone: "045-111-222",
        email: `${item.code.toLowerCase()}@example.com`,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        code: item.code,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        address: item.address,
        phone: "045-111-222",
        email: `${item.code.toLowerCase()}@example.com`,
        status: "ACTIVE",
      },
    });

    branches.push(branch);
  }

  await prisma.branch.updateMany({
    where: {
      companyId: company.id,
      code: {
        notIn: branchSeeds.map((item) => item.code),
      },
    },
    data: {
      status: "INACTIVE",
      deletedAt: new Date(),
    },
  });

  const departmentSeeds = [
    { code: "HR", nameTh: "ฝ่ายทรัพยากรบุคคล", nameEn: "Human Resources" },
    { code: "FIN", nameTh: "ฝ่ายบัญชีและการเงิน", nameEn: "Finance" },
    { code: "SALE", nameTh: "ฝ่ายขาย", nameEn: "Sales" },
    { code: "PROC", nameTh: "ฝ่ายจัดซื้อ", nameEn: "Procurement" },
    {
      code: "IT",
      nameTh: "ฝ่ายเทคโนโลยีสารสนเทศ",
      nameEn: "Information Technology",
    },
  ];

  const departments: DepartmentRow[] = [];
  const divisions: DivisionRow[] = [];

  for (let i = 0; i < departmentSeeds.length; i++) {
    const item = departmentSeeds[i];
    const branch = branches[i % branches.length];

    const department = await prisma.department.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: item.code,
        },
      },
      update: {
        branchId: branch.id,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        branchId: branch.id,
        code: item.code,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        status: "ACTIVE",
      },
    });

    departments.push(department);

    const divisionSeeds = [
      {
        code: `${item.code}-GENERAL`,
        nameTh: `งานทั่วไป${item.nameTh}`,
        nameEn: `${item.nameEn} General`,
      },
      {
        code: `${item.code}-SUPPORT`,
        nameTh: `งานสนับสนุน${item.nameTh}`,
        nameEn: `${item.nameEn} Support`,
      },
    ];

    for (const div of divisionSeeds) {
      const division = await prisma.division.upsert({
        where: {
          departmentId_code: {
            departmentId: department.id,
            code: div.code,
          },
        },
        update: {
          nameTh: div.nameTh,
          nameEn: div.nameEn,
          status: "ACTIVE",
          deletedAt: null,
        },
        create: {
          departmentId: department.id,
          code: div.code,
          nameTh: div.nameTh,
          nameEn: div.nameEn,
          status: "ACTIVE",
        },
      });

      divisions.push(division);
    }
  }

  await prisma.department.updateMany({
    where: {
      companyId: company.id,
      code: {
        notIn: departmentSeeds.map((item) => item.code),
      },
    },
    data: {
      status: "INACTIVE",
      deletedAt: new Date(),
    },
  });

  const activeDepartmentIds = departments.map((department) => department.id);

  await prisma.division.updateMany({
    where: {
      departmentId: {
        notIn: activeDepartmentIds,
      },
    },
    data: {
      status: "INACTIVE",
      deletedAt: new Date(),
    },
  });

  const employeeTypeSeeds = [
    {
      code: "MONTHLY",
      nameTh: "พนักงานรายเดือน",
      nameEn: "Monthly Employee",
      description: "พนักงานประจำรับค่าจ้างรายเดือน",
    },
    {
      code: "DAILY",
      nameTh: "พนักงานรายวัน",
      nameEn: "Daily Employee",
      description: "พนักงานรับค่าจ้างรายวัน",
    },
    {
      code: "PROBATION",
      nameTh: "พนักงานทดลองงาน",
      nameEn: "Probation Employee",
      description: "พนักงานอยู่ระหว่างทดลองงาน",
    },
    {
      code: "CONTRACT",
      nameTh: "พนักงานสัญญาจ้าง",
      nameEn: "Contract Employee",
      description: "พนักงานตามสัญญาจ้าง",
    },
    {
      code: "INTERN",
      nameTh: "นักศึกษาฝึกงาน",
      nameEn: "Intern",
      description: "นักศึกษาฝึกงาน",
    },
  ];

  const employeeTypes: EmployeeTypeRow[] = [];

  for (const item of employeeTypeSeeds) {
    const employeeType = await prisma.employeeType.upsert({
      where: { code: item.code },
      update: {
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        description: item.description,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        code: item.code,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        description: item.description,
        status: "ACTIVE",
      },
    });

    employeeTypes.push(employeeType);
  }

  const positionSeeds = [
    {
      code: "PRESIDENT",
      nameTh: "ประธาน",
      nameEn: "President",
      description: "ผู้บริหารสูงสุดของบริษัท",
      level: 1,
      sortOrder: 1,
    },
    {
      code: "EXECUTIVE",
      nameTh: "ผู้บริหาร",
      nameEn: "Executive",
      description: "ผู้บริหารระดับสูง ดูแลภาพรวมธุรกิจ",
      level: 2,
      sortOrder: 2,
    },
    {
      code: "DIRECTOR",
      nameTh: "ผู้อำนวยการ",
      nameEn: "Director",
      description: "กำกับดูแลหลายฝ่ายหรือหลายแผนก",
      level: 3,
      sortOrder: 3,
    },
    {
      code: "HR_MANAGER",
      nameTh: "ผู้จัดการฝ่ายทรัพยากรบุคคล",
      nameEn: "HR Manager",
      description: "ดูแลระบบงานบุคคลและข้อมูลพนักงาน",
      level: 4,
      sortOrder: 4,
    },
    {
      code: "DEPT_MANAGER",
      nameTh: "ผู้จัดการแผนก",
      nameEn: "Department Manager",
      description: "ผู้จัดการประจำแผนก",
      level: 4,
      sortOrder: 5,
    },
    {
      code: "TEAM_LEAD",
      nameTh: "หัวหน้างาน",
      nameEn: "Team Lead",
      description: "หัวหน้าทีมหรือหัวหน้าแผนกย่อย",
      level: 5,
      sortOrder: 6,
    },
    {
      code: "HR_OFFICER",
      nameTh: "เจ้าหน้าที่ทรัพยากรบุคคล",
      nameEn: "HR Officer",
      description: "เจ้าหน้าที่งานบุคคล",
      level: 6,
      sortOrder: 7,
    },
    {
      code: "ACCOUNTING_OFFICER",
      nameTh: "เจ้าหน้าที่บัญชี",
      nameEn: "Accounting Officer",
      description: "เจ้าหน้าที่บัญชีและการเงิน",
      level: 6,
      sortOrder: 8,
    },
    {
      code: "PURCHASING_OFFICER",
      nameTh: "เจ้าหน้าที่จัดซื้อ",
      nameEn: "Purchasing Officer",
      description: "เจ้าหน้าที่จัดซื้อและประสานงานคู่ค้า",
      level: 6,
      sortOrder: 9,
    },
    {
      code: "SALES_OFFICER",
      nameTh: "เจ้าหน้าที่ขาย",
      nameEn: "Sales Officer",
      description: "เจ้าหน้าที่ฝ่ายขาย",
      level: 6,
      sortOrder: 10,
    },
    {
      code: "IT_DEVELOPER",
      nameTh: "นักพัฒนาระบบ",
      nameEn: "IT Developer",
      description: "พัฒนาระบบและดูแลซอฟต์แวร์ภายในองค์กร",
      level: 6,
      sortOrder: 11,
    },
    {
      code: "DATA_ANALYST",
      nameTh: "นักวิเคราะห์ข้อมูล",
      nameEn: "Data Analyst",
      description: "วิเคราะห์ข้อมูลและจัดทำรายงาน",
      level: 6,
      sortOrder: 12,
    },
    {
      code: "PROJECT_COORDINATOR",
      nameTh: "เจ้าหน้าที่ประสานงานโครงการ",
      nameEn: "Project Coordinator",
      description: "ประสานงานโครงการและติดตามความคืบหน้า",
      level: 6,
      sortOrder: 13,
    },
    {
      code: "STAFF",
      nameTh: "พนักงาน",
      nameEn: "Staff",
      description: "พนักงานทั่วไป",
      level: 6,
      sortOrder: 14,
    },
    {
      code: "OTHER",
      nameTh: "อื่น ๆ",
      nameEn: "Other",
      description: "ตำแหน่งอื่น ๆ",
      level: 9,
      sortOrder: 99,
    },
  ];

  const positions: PositionRow[] = [];

  for (const item of positionSeeds) {
    const position = await prisma.position.upsert({
      where: { code: item.code },
      update: {
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        description: item.description,
        level: item.level,
        sortOrder: item.sortOrder,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        code: item.code,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        description: item.description,
        level: item.level,
        sortOrder: item.sortOrder,
        status: "ACTIVE",
      },
    });

    positions.push(position);
  }

  await prisma.paymentAccount.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "MAIN",
      },
    },
    update: {
      bankName: "ธนาคารกรุงไทย",
      accountName: company.nameTh,
      accountNumber: "000-1-23456-7",
      branchName: "เดชอุดม",
      status: "ACTIVE",
      deletedAt: null,
    },
    create: {
      companyId: company.id,
      code: "MAIN",
      bankName: "ธนาคารกรุงไทย",
      accountName: company.nameTh,
      accountNumber: "000-1-23456-7",
      branchName: "เดชอุดม",
      status: "ACTIVE",
    },
  });

  for (const item of [
    { code: "PND1", nameTh: "ภาษีหัก ณ ที่จ่าย ภ.ง.ด.1", nameEn: "PND1" },
    { code: "PND3", nameTh: "ภาษีหัก ณ ที่จ่าย ภ.ง.ด.3", nameEn: "PND3" },
  ]) {
    await prisma.taxMethod.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: item.code,
        },
      },
      update: {
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        code: item.code,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        status: "ACTIVE",
      },
    });
  }

  for (const item of [
    {
      code: "SSO_NORMAL",
      nameTh: "ประกันสังคมมาตรฐาน",
      nameEn: "Standard Social Security",
    },
    {
      code: "SSO_EXEMPT",
      nameTh: "ยกเว้นประกันสังคม",
      nameEn: "Social Security Exempt",
    },
  ]) {
    await prisma.socialInsuranceMethod.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: item.code,
        },
      },
      update: {
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        code: item.code,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        status: "ACTIVE",
      },
    });
  }

  const locations: AttendanceLocationRow[] = [];
  const devices: AttendanceDeviceRow[] = [];

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];

    const location = await prisma.attendanceLocation.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: `${branch.code}_OFFICE`,
        },
      },
      update: {
        branchId: branch.id,
        nameTh: `จุดลงเวลา ${branch.nameTh}`,
        nameEn: `${branch.nameEn} Attendance Location`,
        type: "OFFICE",
        address: branch.address,
        latitude: "14.9050000",
        longitude: "105.0780000",
        radiusMeters: 150,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        branchId: branch.id,
        code: `${branch.code}_OFFICE`,
        nameTh: `จุดลงเวลา ${branch.nameTh}`,
        nameEn: `${branch.nameEn} Attendance Location`,
        type: "OFFICE",
        address: branch.address,
        latitude: "14.9050000",
        longitude: "105.0780000",
        radiusMeters: 150,
        status: "ACTIVE",
      },
    });

    locations.push(location);

    const device = await prisma.attendanceDevice.upsert({
      where: {
        code: `MAIN-${branch.code}-FACE01`,
      },
      update: {
        name: `เครื่องสแกนใบหน้า ${branch.nameTh}`,
        type: "FACE_SCAN",
        serialNo: `FACE-MAIN-${branch.code}-0001`,
        ipAddress: `192.168.${10 + i}.10`,
        branchId: branch.id,
        locationId: location.id,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        code: `MAIN-${branch.code}-FACE01`,
        name: `เครื่องสแกนใบหน้า ${branch.nameTh}`,
        type: "FACE_SCAN",
        serialNo: `FACE-MAIN-${branch.code}-0001`,
        ipAddress: `192.168.${10 + i}.10`,
        branchId: branch.id,
        locationId: location.id,
        status: "ACTIVE",
      },
    });

    devices.push(device);
  }

  return {
    company,
    branches,
    departments,
    divisions,
    employeeTypes,
    positions,
    locations,
    devices,
  };
}

/**
 * =========================
 * LEAVE MASTER
 * =========================
 */

async function upsertLeavePolicy(params: {
  companyId: string;
  leaveTypeId: string;
  employeeTypeId: string | null;
  annualQuotaDays: string;
  maxConsecutiveDays: number | null;
  allowCarryForward: boolean;
  carryForwardLimitDays: string;
}) {
  const existingPolicy = await prisma.leavePolicy.findFirst({
    where: {
      companyId: params.companyId,
      leaveTypeId: params.leaveTypeId,
      employeeTypeId: params.employeeTypeId,
      deletedAt: null,
    },
  });

  if (existingPolicy) {
    return prisma.leavePolicy.update({
      where: { id: existingPolicy.id },
      data: {
        annualQuotaDays: params.annualQuotaDays,
        maxConsecutiveDays: params.maxConsecutiveDays,
        allowCarryForward: params.allowCarryForward,
        carryForwardLimitDays: params.carryForwardLimitDays,
        requireApproval: true,
        status: "ACTIVE",
        deletedAt: null,
      },
    });
  }

  return prisma.leavePolicy.create({
    data: {
      companyId: params.companyId,
      leaveTypeId: params.leaveTypeId,
      employeeTypeId: params.employeeTypeId,
      annualQuotaDays: params.annualQuotaDays,
      maxConsecutiveDays: params.maxConsecutiveDays,
      allowCarryForward: params.allowCarryForward,
      carryForwardLimitDays: params.carryForwardLimitDays,
      requireApproval: true,
      status: "ACTIVE",
    },
  });
}

async function seedDefaultLeaveTypesAndPolicies(company: CompanyRow) {
  console.log("Seeding default leave types and policies...");

  const monthlyEmployeeType = await prisma.employeeType.findUnique({
    where: { code: "MONTHLY" },
  });

  const leaveTypes = [
    {
      code: "SICK",
      nameTh: "ลาป่วย",
      nameEn: "Sick Leave",
      description: "การลาป่วยของพนักงาน",
      isPaid: true,
      requiresAttachment: false,
      annualQuotaDays: "30.00",
      maxConsecutiveDays: null,
      allowCarryForward: false,
      carryForwardLimitDays: "0.00",
    },
    {
      code: "PERSONAL",
      nameTh: "ลากิจ",
      nameEn: "Personal Leave",
      description: "การลากิจส่วนตัวของพนักงาน",
      isPaid: true,
      requiresAttachment: false,
      annualQuotaDays: "6.00",
      maxConsecutiveDays: null,
      allowCarryForward: false,
      carryForwardLimitDays: "0.00",
    },
    {
      code: "ANNUAL",
      nameTh: "ลาพักร้อน",
      nameEn: "Annual Leave",
      description: "การลาพักร้อนประจำปี",
      isPaid: true,
      requiresAttachment: false,
      annualQuotaDays: "10.00",
      maxConsecutiveDays: null,
      allowCarryForward: true,
      carryForwardLimitDays: "5.00",
    },
    {
      code: "MATERNITY",
      nameTh: "ลาคลอด",
      nameEn: "Maternity Leave",
      description: "การลาคลอด",
      isPaid: true,
      requiresAttachment: true,
      annualQuotaDays: "98.00",
      maxConsecutiveDays: 98,
      allowCarryForward: false,
      carryForwardLimitDays: "0.00",
    },
    {
      code: "TRAINING",
      nameTh: "ลาอบรม/สัมมนา",
      nameEn: "Training Leave",
      description: "การลาเพื่ออบรมหรือสัมมนา",
      isPaid: true,
      requiresAttachment: true,
      annualQuotaDays: "10.00",
      maxConsecutiveDays: null,
      allowCarryForward: false,
      carryForwardLimitDays: "0.00",
    },
    {
      code: "OTHER",
      nameTh: "ลาอื่น ๆ",
      nameEn: "Other Leave",
      description: "ประเภทการลาอื่น ๆ ตามที่ HR กำหนด",
      isPaid: false,
      requiresAttachment: false,
      annualQuotaDays: "0.00",
      maxConsecutiveDays: null,
      allowCarryForward: false,
      carryForwardLimitDays: "0.00",
    },
  ];

  const refs: LeaveTypeRow[] = [];

  for (const item of leaveTypes) {
    const leaveType = await prisma.leaveType.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: item.code,
        },
      },
      update: {
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        description: item.description,
        isPaid: item.isPaid,
        requiresAttachment: item.requiresAttachment,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        code: item.code,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        description: item.description,
        isPaid: item.isPaid,
        requiresAttachment: item.requiresAttachment,
        status: "ACTIVE",
      },
    });

    refs.push(leaveType);

    await upsertLeavePolicy({
      companyId: company.id,
      leaveTypeId: leaveType.id,
      employeeTypeId: monthlyEmployeeType?.id ?? null,
      annualQuotaDays: item.annualQuotaDays,
      maxConsecutiveDays: item.maxConsecutiveDays,
      allowCarryForward: item.allowCarryForward,
      carryForwardLimitDays: item.carryForwardLimitDays,
    });
  }

  return refs;
}

/**
 * =========================
 * OVERTIME MASTER
 * =========================
 */

async function seedDefaultOvertimePolicies(company: CompanyRow) {
  console.log("Seeding default overtime policies...");

  const monthlyEmployeeType = await prisma.employeeType.findUnique({
    where: { code: "MONTHLY" },
  });

  const overtimePolicies = [
    {
      code: "OT_WORKDAY",
      nameTh: "OT วันทำงานปกติ",
      nameEn: "Workday Overtime",
      description: "ค่าล่วงเวลาสำหรับวันทำงานปกติ",
      workType: "WORKDAY" as const,
      rateMultiplier: "1.50",
      minMinutes: 30,
      maxHoursPerDay: "4.00",
    },
    {
      code: "OT_HOLIDAY",
      nameTh: "OT วันหยุด",
      nameEn: "Holiday Overtime",
      description: "ค่าล่วงเวลาสำหรับวันหยุด",
      workType: "HOLIDAY" as const,
      rateMultiplier: "2.00",
      minMinutes: 30,
      maxHoursPerDay: "8.00",
    },
    {
      code: "OT_SPECIAL_HOLIDAY",
      nameTh: "OT วันหยุดพิเศษ",
      nameEn: "Special Holiday Overtime",
      description: "ค่าล่วงเวลาสำหรับวันหยุดพิเศษ",
      workType: "SPECIAL_HOLIDAY" as const,
      rateMultiplier: "3.00",
      minMinutes: 30,
      maxHoursPerDay: "8.00",
    },
  ];

  for (const item of overtimePolicies) {
    await prisma.overtimePolicy.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: item.code,
        },
      },
      update: {
        employeeTypeId: monthlyEmployeeType?.id ?? null,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        description: item.description,
        workType: item.workType,
        rateMultiplier: item.rateMultiplier,
        minMinutes: item.minMinutes,
        maxHoursPerDay: item.maxHoursPerDay,
        requireApproval: true,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        employeeTypeId: monthlyEmployeeType?.id ?? null,
        code: item.code,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        description: item.description,
        workType: item.workType,
        rateMultiplier: item.rateMultiplier,
        minMinutes: item.minMinutes,
        maxHoursPerDay: item.maxHoursPerDay,
        requireApproval: true,
        status: "ACTIVE",
      },
    });
  }
}

/**
 * =========================
 * PAYROLL COMPONENT MASTER
 * =========================
 */

async function seedDefaultPayrollComponents(company: CompanyRow) {
  console.log("Seeding default payroll components...");

  for (const component of DEFAULT_PAYROLL_COMPONENTS) {
    await prisma.payrollComponent.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: component.code,
        },
      },
      update: {
        nameTh: component.nameTh,
        nameEn: component.nameEn,
        description: component.description,
        type: component.type,
        sourceType: component.sourceType,
        isTaxable: component.isTaxable,
        isSocialSecurityBase: component.isSocialSecurityBase,
        isRecurring: component.isRecurring,
        sortOrder: component.sortOrder,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        code: component.code,
        nameTh: component.nameTh,
        nameEn: component.nameEn,
        description: component.description,
        type: component.type,
        sourceType: component.sourceType,
        isTaxable: component.isTaxable,
        isSocialSecurityBase: component.isSocialSecurityBase,
        isRecurring: component.isRecurring,
        sortOrder: component.sortOrder,
        status: "ACTIVE",
      },
    });
  }
}

/**
 * =========================
 * DOCUMENT MASTER
 * =========================
 */

async function seedDefaultDocumentTypesAndTemplates(company: CompanyRow) {
  console.log("Seeding default document types and templates...");

  const documentTypes = [
    {
      code: "WORK_CERTIFICATE",
      nameTh: "หนังสือรับรองการทำงาน",
      nameEn: "Work Certificate",
      description: "เอกสารรับรองการทำงาน ตำแหน่ง อายุงาน และสถานะการทำงาน",
      category: "CERTIFICATE",
      requiresApproval: true,
      approvalLevels: 2,
      allowEmployeeRequest: true,
    },
    {
      code: "SALARY_CERTIFICATE",
      nameTh: "หนังสือรับรองเงินเดือน",
      nameEn: "Salary Certificate",
      description: "เอกสารรับรองเงินเดือนสำหรับใช้ประกอบธุรกรรมต่าง ๆ",
      category: "CERTIFICATE",
      requiresApproval: true,
      approvalLevels: 2,
      allowEmployeeRequest: true,
    },
    {
      code: "VISA_CERTIFICATE",
      nameTh: "หนังสือรับรองเพื่อประกอบการขอวีซ่า",
      nameEn: "Visa Certificate",
      description: "เอกสารรับรองการทำงานสำหรับใช้ประกอบการขอวีซ่าหรือธุรกรรมต่างประเทศ",
      category: "CERTIFICATE",
      requiresApproval: true,
      approvalLevels: 2,
      allowEmployeeRequest: true,
    },
    {
      code: "RESIGN_DOCUMENT",
      nameTh: "เอกสารลาออก",
      nameEn: "Resignation Document",
      description: "เอกสารยื่นลาออกและติดตามขั้นตอนอนุมัติการลาออก",
      category: "RESIGNATION",
      requiresApproval: true,
      approvalLevels: 2,
      allowEmployeeRequest: true,
    },
    {
      code: "GENERAL_REQUEST",
      nameTh: "คำขอเอกสารทั่วไป",
      nameEn: "General Document Request",
      description: "คำขอเอกสารทั่วไปภายในระบบ HR",
      category: "GENERAL",
      requiresApproval: true,
      approvalLevels: 2,
      allowEmployeeRequest: true,
    },
  ];

  const refs: DocumentTypeRow[] = [];

  for (const documentType of documentTypes) {
    const existing = await prisma.documentType.findFirst({
      where: {
        companyId: company.id,
        code: documentType.code,
        deletedAt: null,
      },
    });

    const savedDocumentType = existing
      ? await prisma.documentType.update({
          where: { id: existing.id },
          data: {
            nameTh: documentType.nameTh,
            nameEn: documentType.nameEn,
            description: documentType.description,
            category: documentType.category,
            requiresApproval: documentType.requiresApproval,
            approvalLevels: documentType.approvalLevels,
            allowEmployeeRequest: documentType.allowEmployeeRequest,
            status: "ACTIVE",
          },
        })
      : await prisma.documentType.create({
          data: {
            companyId: company.id,
            code: documentType.code,
            nameTh: documentType.nameTh,
            nameEn: documentType.nameEn,
            description: documentType.description,
            category: documentType.category,
            requiresApproval: documentType.requiresApproval,
            approvalLevels: documentType.approvalLevels,
            allowEmployeeRequest: documentType.allowEmployeeRequest,
            status: "ACTIVE",
          },
        });

    refs.push(savedDocumentType);

    const templateCode = `${documentType.code}_DEFAULT`;

    const htmlContent = `
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${documentType.nameTh}</title>
</head>
<body>
  <h1>${documentType.nameTh}</h1>
  <p>เลขที่เอกสาร: {{requestNo}}</p>
  <p>ชื่อพนักงาน: {{employeeName}}</p>
  <p>ตำแหน่ง: {{position}}</p>
  <p>วัตถุประสงค์: {{purpose}}</p>
  <p>วันที่ออกเอกสาร: {{issuedDate}}</p>
</body>
</html>`.trim();

    const existingTemplate = await prisma.documentTemplate.findFirst({
      where: {
        companyId: company.id,
        code: templateCode,
        deletedAt: null,
      },
    });

    if (existingTemplate) {
      await prisma.documentTemplate.update({
        where: { id: existingTemplate.id },
        data: {
          name: `Template เริ่มต้น - ${documentType.nameTh}`,
          description: `Template เริ่มต้นสำหรับ ${documentType.nameTh}`,
          documentTypeId: savedDocumentType.id,
          htmlContent,
          config: {
            paper: "A4",
            margin: "20mm",
            language: "th",
          },
          version: 1,
          status: "ACTIVE",
        },
      });
    } else {
      await prisma.documentTemplate.create({
        data: {
          companyId: company.id,
          documentTypeId: savedDocumentType.id,
          code: templateCode,
          name: `Template เริ่มต้น - ${documentType.nameTh}`,
          description: `Template เริ่มต้นสำหรับ ${documentType.nameTh}`,
          htmlContent,
          config: {
            paper: "A4",
            margin: "20mm",
            language: "th",
          },
          version: 1,
          status: "ACTIVE",
        },
      });
    }
  }

  return refs;
}

/**
 * =========================
 * CLEAR DEMO DATA
 * =========================
 */

async function clearDemoGeneratedData() {
  console.log("Clearing old demo generated data...");

  const demoEmployees = await prisma.employee.findMany({
    where: {
      employeeCode: {
        startsWith: "DEMO",
      },
    },
    select: {
      id: true,
    },
  });

  const employeeIds = demoEmployees.map((x) => x.id);

  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      requestNo: {
        startsWith: "LV-DEMO-",
      },
    },
    select: { id: true },
  });

  const leaveRequestIds = leaveRequests.map((x) => x.id);

  await prisma.leaveApprovalLog.deleteMany({
    where: {
      leaveRequestId: {
        in: leaveRequestIds,
      },
    },
  });

  await prisma.leaveRequest.deleteMany({
    where: {
      id: {
        in: leaveRequestIds,
      },
    },
  });

  const overtimeRequests = await prisma.overtimeRequest.findMany({
    where: {
      requestNo: {
        startsWith: "OT-DEMO-",
      },
    },
    select: { id: true },
  });

  const overtimeRequestIds = overtimeRequests.map((x) => x.id);

  await prisma.overtimeAttachment.deleteMany({
    where: {
      overtimeRequestId: {
        in: overtimeRequestIds,
      },
    },
  });

  await prisma.overtimeApprovalLog.deleteMany({
    where: {
      overtimeRequestId: {
        in: overtimeRequestIds,
      },
    },
  });

  await prisma.overtimeRequest.deleteMany({
    where: {
      id: {
        in: overtimeRequestIds,
      },
    },
  });

  const timeAdjustRequests = await prisma.timeAdjustRequest.findMany({
    where: {
      requestNo: {
        startsWith: "TA-DEMO-",
      },
    },
    select: { id: true },
  });

  const timeAdjustRequestIds = timeAdjustRequests.map((x) => x.id);

  await prisma.timeAdjustAttachment.deleteMany({
    where: {
      timeAdjustRequestId: {
        in: timeAdjustRequestIds,
      },
    },
  });

  await prisma.timeAdjustLog.deleteMany({
    where: {
      timeAdjustRequestId: {
        in: timeAdjustRequestIds,
      },
    },
  });

  await prisma.attendanceEditLog.deleteMany({
    where: {
      timeAdjustRequestId: {
        in: timeAdjustRequestIds,
      },
    },
  });

  await prisma.timeAdjustRequest.deleteMany({
    where: {
      id: {
        in: timeAdjustRequestIds,
      },
    },
  });

  const documentRequests = await prisma.documentRequest.findMany({
    where: {
      requestNo: {
        startsWith: "DOC-DEMO-",
      },
    },
    select: { id: true },
  });

  const documentRequestIds = documentRequests.map((x) => x.id);

  await prisma.documentFile.deleteMany({
    where: {
      documentRequestId: {
        in: documentRequestIds,
      },
    },
  });

  await prisma.documentApproval.deleteMany({
    where: {
      documentRequestId: {
        in: documentRequestIds,
      },
    },
  });

  await prisma.documentRequest.deleteMany({
    where: {
      id: {
        in: documentRequestIds,
      },
    },
  });

  const attendanceLogs = await prisma.attendanceLog.findMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
    select: { id: true },
  });

  const attendanceLogIds = attendanceLogs.map((x) => x.id);

  await prisma.attendanceEditLog.deleteMany({
    where: {
      attendanceLogId: {
        in: attendanceLogIds,
      },
    },
  });

  await prisma.attendanceLog.deleteMany({
    where: {
      id: {
        in: attendanceLogIds,
      },
    },
  });

  await prisma.employeeDocument.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await prisma.employeeWorkHistory.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await prisma.leaveBalance.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await prisma.complaint.deleteMany({
    where: {
      complaintNo: {
        startsWith: "CP-DEMO-",
      },
    },
  });

  const evaluationResults = await prisma.evaluationResult.findMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
    select: { id: true },
  });

  const evaluationResultIds = evaluationResults.map((x) => x.id);

  await prisma.evaluationAttachment.deleteMany({
    where: {
      evaluationResultId: {
        in: evaluationResultIds,
      },
    },
  });

  await prisma.evaluationResult.deleteMany({
    where: {
      id: {
        in: evaluationResultIds,
      },
    },
  });

  await prisma.evaluator.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  const warningLetters = await prisma.warningLetter.findMany({
    where: {
      letterNo: {
        startsWith: "WL-DEMO-",
      },
    },
    select: { id: true },
  });

  const warningLetterIds = warningLetters.map((x) => x.id);

  await prisma.disciplinaryHistory.deleteMany({
    where: {
      warningLetterId: {
        in: warningLetterIds,
      },
    },
  });

  await prisma.warningLetter.deleteMany({
    where: {
      id: {
        in: warningLetterIds,
      },
    },
  });

  await prisma.disciplinaryHistory.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
      title: {
        startsWith: "ประวัติ DEMO",
      },
    },
  });

  await prisma.onboardingDocument.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await prisma.onboardingTask.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await prisma.probationRecord.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  const reportJobs = await prisma.reportJob.findMany({
    where: {
      name: {
        startsWith: "รายงาน DEMO",
      },
    },
    select: { id: true },
  });

  const reportJobIds = reportJobs.map((x) => x.id);

  const exportFiles = await prisma.exportFile.findMany({
    where: {
      reportJobId: {
        in: reportJobIds,
      },
    },
    select: { id: true },
  });

  const exportFileIds = exportFiles.map((x) => x.id);

  await prisma.reportLog.deleteMany({
    where: {
      OR: [
        {
          reportJobId: {
            in: reportJobIds,
          },
        },
        {
          exportFileId: {
            in: exportFileIds,
          },
        },
      ],
    },
  });

  await prisma.exportFile.deleteMany({
    where: {
      id: {
        in: exportFileIds,
      },
    },
  });

  await prisma.reportJob.deleteMany({
    where: {
      id: {
        in: reportJobIds,
      },
    },
  });

  if (employeeIds.length > 0) {
    await prisma.employee.updateMany({
      where: {
        OR: [
          {
            id: {
              in: employeeIds,
            },
          },
          {
            supervisorId: {
              in: employeeIds,
            },
          },
        ],
      },
      data: {
        supervisorId: null,
      },
    });

    await prisma.employee.deleteMany({
      where: {
        id: {
          in: employeeIds,
        },
      },
    });
  }

  await prisma.auditLog.deleteMany({
    where: {
      requestId: {
        startsWith: "seed-demo-",
      },
    },
  });
}

/**
 * =========================
 * EMPLOYEES
 * =========================
 */

async function seedDemoEmployees(params: {
  company: CompanyRow;
  branches: BranchRow[];
  departments: DepartmentRow[];
  divisions: DivisionRow[];
  employeeTypes: EmployeeTypeRow[];
  positions: PositionRow[];
  demoUsers: Record<string, UserRow>;
  createdById: string;
}) {
  console.log(`Seeding ${DEMO_EMPLOYEE_COUNT} demo employees...`);

  const demoUserIds = Object.values(params.demoUsers)
    .map((user) => user?.id)
    .filter((id): id is string => Boolean(id));

  if (demoUserIds.length > 0) {
    await prisma.employee.updateMany({
      where: {
        userId: {
          in: demoUserIds,
        },
      },
      data: {
        userId: null,
      },
    });
  }

  const firstNames = [
    "สมชาย",
    "สมหญิง",
    "วราภรณ์",
    "ศุภิชญา",
    "ณัฐพล",
    "กิตติพงษ์",
    "อรทัย",
    "พิมพ์ชนก",
    "ธนกร",
    "ศิริพร",
    "ภาคิน",
    "ปรียา",
    "สุรศักดิ์",
    "จิราภา",
    "อนุชา",
    "วิภาวี",
    "พีรพล",
    "ชนากานต์",
    "ภัทรพล",
    "กมลชนก",
    "นพดล",
    "สุธิดา",
    "ชยพล",
    "รุ่งนภา",
    "กานต์",
    "ปกรณ์",
    "รัตนา",
    "สิริกาญจน์",
    "อาทิตย์",
    "เนตรนภา",
  ];

  const lastNames = [
    "ใจดี",
    "มั่นคง",
    "รุ่งเรือง",
    "ทองดี",
    "ศรีสุข",
    "แสงทอง",
    "สุวรรณ",
    "คำเมือง",
    "เกิดผล",
    "บุญมาก",
    "พัฒนกิจ",
    "อินทร์แก้ว",
    "อุดมสุข",
    "เจริญชัย",
    "วงศ์สวัสดิ์",
    "ประเสริฐ",
    "พิทักษ์",
    "หอมจันทร์",
    "บุญศรี",
    "ศรีนวล",
  ];

  const positionByCode = new Map(
    params.positions.map((position) => [position.code, position]),
  );

  function getPositionByCode(code: string) {
    const position = positionByCode.get(code) ?? positionByCode.get("STAFF") ?? null;

    if (!position) {
      throw new Error(`Position ${code} is not seeded`);
    }

    return position;
  }

  function resolvePositionCode(index: number, departmentCode: string) {
    if (index === 1) return "PRESIDENT";
    if (index === 2) return "EXECUTIVE";

    // สร้างผู้จัดการให้ครบทุกแผนกในช่วงต้น เพื่อใช้เป็นหัวหน้าของแต่ละสายงาน
    if (index >= 3 && index < 3 + params.departments.length) {
      return departmentCode === "HR" ? "HR_MANAGER" : "DEPT_MANAGER";
    }

    // สร้างหัวหน้างานให้ครบทุกแผนก เพื่อเป็นผู้ดูแลพนักงานระดับปฏิบัติการ
    if (
      index >= 3 + params.departments.length &&
      index < 3 + params.departments.length * 2
    ) {
      return "TEAM_LEAD";
    }

    if (departmentCode === "HR") return "HR_OFFICER";
    if (departmentCode === "FIN") return "ACCOUNTING_OFFICER";
    if (departmentCode === "PROC") return "PURCHASING_OFFICER";
    if (departmentCode === "SALE") return "SALES_OFFICER";
    if (departmentCode === "IT") {
      return index % 2 === 0 ? "IT_DEVELOPER" : "DATA_ANALYST";
    }
    if (departmentCode === "OPS" || departmentCode === "MKT") {
      return "PROJECT_COORDINATOR";
    }

    return "STAFF";
  }

  const employees: EmployeeRow[] = [];

  for (let i = 1; i <= DEMO_EMPLOYEE_COUNT; i++) {
    const employeeCode = `DEMO${pad(i, 4)}`;
    const firstName = firstNames[(i - 1) % firstNames.length];
    const lastName = lastNames[(i + 3) % lastNames.length];
    const branch = pick(params.branches, i);
    const department = pick(params.departments, i);
    const divisionCandidates = params.divisions.filter(
      (division) => division.departmentId === department.id,
    );
    const division = divisionCandidates.length > 0 ? pick(divisionCandidates, i) : null;
    const employeeType = pick(params.employeeTypes, i);

    const selectedPosition = getPositionByCode(
      resolvePositionCode(i, department.code),
    );

    const president = employees.find(
      (employee) => employee.positionId === getPositionByCode("PRESIDENT").id,
    );
    const executive =
      employees.find(
        (employee) => employee.positionId === getPositionByCode("EXECUTIVE").id,
      ) ?? president;

    const departmentManager =
      employees.find(
        (employee) =>
          employee.departmentId === department.id &&
          employee.positionId !== null &&
          [
            getPositionByCode("HR_MANAGER").id,
            getPositionByCode("DEPT_MANAGER").id,
          ].includes(employee.positionId),
      ) ?? executive;

    const teamLead =
      employees.find(
        (employee) =>
          employee.departmentId === department.id &&
          employee.positionId === getPositionByCode("TEAM_LEAD").id,
      ) ?? departmentManager;

    let supervisorId: string | null = null;

    if (i === 1) {
      supervisorId = null;
    } else if (
      ["EXECUTIVE", "DIRECTOR", "HR_MANAGER", "DEPT_MANAGER"].includes(
        selectedPosition.code,
      )
    ) {
      supervisorId = president?.id ?? null;
    } else if (selectedPosition.code === "TEAM_LEAD") {
      supervisorId = departmentManager?.id ?? executive?.id ?? president?.id ?? null;
    } else {
      supervisorId = teamLead?.id ?? departmentManager?.id ?? executive?.id ?? president?.id ?? null;
    }

    const status =
      i % 18 === 0
        ? "SUSPENDED"
        : i % 12 === 0
          ? "PROBATION"
          : i % 20 === 0
            ? "INACTIVE"
            : "ACTIVE";

    const linkedUserId =
      i === 1
        ? params.demoUsers["executive@hr.local"]?.id
        : i === 2
          ? params.demoUsers["hr.manager@hr.local"]?.id
          : i === 3
            ? params.demoUsers["manager@hr.local"]?.id
            : i === 4
              ? params.demoUsers["payroll@hr.local"]?.id
              : i === 19
                ? params.demoUsers["employee@hr.local"]?.id
                : null;

    const startDate = daysAgo(30 + i * 5);
    const probationEndDate = status === "PROBATION" ? addDays(startDate, 119) : null;

    const employee = await prisma.employee.upsert({
      where: { employeeCode },
      update: {
        title: i % 2 === 0 ? "นางสาว" : "นาย",
        firstName,
        lastName,
        nickname: `Demo${i}`,
        displayName: `${firstName} ${lastName}`,
        email: `${employeeCode.toLowerCase()}@example.com`,
        phone: `08${String(10000000 + i).slice(0, 8)}`,
        position: selectedPosition.nameTh,
        positionId: selectedPosition.id,
        supervisorId,
        startDate,
        probationEndDate,
        status: status as any,
        companyId: params.company.id,
        branchId: branch.id,
        departmentId: department.id,
        divisionId: division?.id ?? null,
        employeeTypeId: employeeType.id,
        userId: linkedUserId,
        deletedAt: null,
      },
      create: {
        employeeCode,
        title: i % 2 === 0 ? "นางสาว" : "นาย",
        firstName,
        lastName,
        nickname: `Demo${i}`,
        displayName: `${firstName} ${lastName}`,
        email: `${employeeCode.toLowerCase()}@example.com`,
        phone: `08${String(10000000 + i).slice(0, 8)}`,
        position: selectedPosition.nameTh,
        positionId: selectedPosition.id,
        supervisorId,
        startDate,
        probationEndDate,
        status: status as any,
        companyId: params.company.id,
        branchId: branch.id,
        departmentId: department.id,
        divisionId: division?.id ?? null,
        employeeTypeId: employeeType.id,
        userId: linkedUserId,
      },
    });

    employees.push(employee);

    await prisma.employeeProfile.upsert({
      where: { employeeId: employee.id },
      update: {
        gender: i % 2 === 0 ? "FEMALE" : "MALE",
        birthDate: new Date(1985 + (i % 15), i % 12, (i % 27) + 1),
        nationalId: `1349900${pad(i, 6)}`,
        passportNo: i % 9 === 0 ? `P${pad(i, 7)}` : null,
        maritalStatus: i % 4 === 0 ? "MARRIED" : "SINGLE",
        nationality: "ไทย",
        religion: "พุทธ",
        currentAddress: `บ้านเลขที่ ${100 + i} หมู่ ${i % 12} ตำบลเมืองเดช อำเภอเดชอุดม จังหวัดอุบลราชธานี`,
        registeredAddress: `บ้านเลขที่ ${100 + i} หมู่ ${i % 12} ตำบลเมืองเดช อำเภอเดชอุดม จังหวัดอุบลราชธานี`,
        emergencyContactName: `ผู้ติดต่อฉุกเฉิน ${i}`,
        emergencyContactPhone: `09${String(20000000 + i).slice(0, 8)}`,
        emergencyContactRelation: i % 2 === 0 ? "มารดา" : "บิดา",
        educationLevel: i % 3 === 0 ? "ปริญญาโท" : "ปริญญาตรี",
        educationInstitute: "มหาวิทยาลัยตัวอย่าง",
        educationMajor: i % 3 === 0 ? "บริหารธุรกิจ" : "คอมพิวเตอร์ธุรกิจ",
        bankName: "ธนาคารกรุงไทย",
        bankAccountNo: `981${String(100000000 + i).slice(0, 9)}`,
        bankAccountName: `${firstName} ${lastName}`,
        note: "ข้อมูลตัวอย่างจาก seed",
      },
      create: {
        employeeId: employee.id,
        gender: i % 2 === 0 ? "FEMALE" : "MALE",
        birthDate: new Date(1985 + (i % 15), i % 12, (i % 27) + 1),
        nationalId: `1349900${pad(i, 6)}`,
        passportNo: i % 9 === 0 ? `P${pad(i, 7)}` : null,
        maritalStatus: i % 4 === 0 ? "MARRIED" : "SINGLE",
        nationality: "ไทย",
        religion: "พุทธ",
        currentAddress: `บ้านเลขที่ ${100 + i} หมู่ ${i % 12} ตำบลเมืองเดช อำเภอเดชอุดม จังหวัดอุบลราชธานี`,
        registeredAddress: `บ้านเลขที่ ${100 + i} หมู่ ${i % 12} ตำบลเมืองเดช อำเภอเดชอุดม จังหวัดอุบลราชธานี`,
        emergencyContactName: `ผู้ติดต่อฉุกเฉิน ${i}`,
        emergencyContactPhone: `09${String(20000000 + i).slice(0, 8)}`,
        emergencyContactRelation: i % 2 === 0 ? "มารดา" : "บิดา",
        educationLevel: i % 3 === 0 ? "ปริญญาโท" : "ปริญญาตรี",
        educationInstitute: "มหาวิทยาลัยตัวอย่าง",
        educationMajor: i % 3 === 0 ? "บริหารธุรกิจ" : "คอมพิวเตอร์ธุรกิจ",
        bankName: "ธนาคารกรุงไทย",
        bankAccountNo: `981${String(100000000 + i).slice(0, 9)}`,
        bankAccountName: `${firstName} ${lastName}`,
        note: "ข้อมูลตัวอย่างจาก seed",
      },
    });

    await prisma.employeeWorkHistory.create({
      data: {
        employeeId: employee.id,
        type: "JOINED",
        effectiveDate: startDate,
        title: "เริ่มงานกับบริษัท",
        description: `เริ่มงานตำแหน่ง ${employee.position}`,
        newCompanyId: params.company.id,
        newBranchId: branch.id,
        newDepartmentId: department.id,
        newDivisionId: division?.id ?? null,
        newEmployeeTypeId: employeeType.id,
        newPosition: employee.position,
        newStatus: employee.status,
        createdById: params.createdById,
      },
    });

    const documentSeeds = [
      { type: "ID_CARD", title: "สำเนาบัตรประชาชน" },
      { type: "HOUSE_REGISTRATION", title: "สำเนาทะเบียนบ้าน" },
      { type: "EMPLOYMENT_CONTRACT", title: "สัญญาจ้างงาน" },
      { type: "BANK_BOOK", title: "สำเนาหน้าสมุดบัญชี" },
    ];

    for (const doc of documentSeeds) {
      await prisma.employeeDocument.create({
        data: {
          employeeId: employee.id,
          type: doc.type as any,
          title: doc.title,
          description: "เอกสารตัวอย่าง",
          fileName: `${employeeCode}_${doc.type}.pdf`,
          fileSize: 100000 + i,
          mimeType: "application/pdf",
          storageProvider: "LOCAL",
          storageKey: `/uploads/employees/${employeeCode}/${doc.type}.pdf`,
          issuedDate: daysAgo(365),
          expiredDate: doc.type === "ID_CARD" ? addDays(new Date(), 365 * 5) : null,
          status: "ACTIVE",
          uploadedById: params.createdById,
        },
      });
    }
  }

  return employees;
}

/**
 * =========================
 * ATTENDANCE
 * =========================
 */

async function seedAttendanceData(params: {
  employees: EmployeeRow[];
  locations: AttendanceLocationRow[];
  devices: AttendanceDeviceRow[];
  createdById: string;
}) {
  console.log("Seeding attendance logs...");

  const logs: Prisma.AttendanceLogCreateManyInput[] = [];

  for (const employee of params.employees) {
    const employeeLocation = pick(params.locations, Number(employee.employeeCode.replace("DEMO", "")));
    const device = params.devices.find((x) => x.locationId === employeeLocation.id) ?? params.devices[0];

    for (let day = 1; day <= 30; day++) {
      const workDate = dateOnly(daysAgo(day));
      const dayOfWeek = workDate.getDay();

      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const empNo = Number(employee.employeeCode.replace("DEMO", ""));
      const late = (day + empNo) % 10 === 0;
      const earlyLeave = (day + empNo) % 14 === 0;
      const missingCheckout = (day + empNo) % 23 === 0;

      logs.push({
        employeeId: employee.id,
        workDate,
        logType: "CHECK_IN",
        logTime: at(workDate, late ? 9 : 8, late ? 18 : 25),
        channel: day % 3 === 0 ? "MOBILE" : "DEVICE",
        status: late ? "LATE" : "NORMAL",
        deviceId: device?.id,
        locationId: employeeLocation.id,
        latitude: "14.9051000",
        longitude: "105.0781000",
        gpsAccuracy: "15.00",
        ipAddress: "192.168.1.100",
        userAgent: "Seed Script",
        note: late ? "เข้างานสายจากข้อมูลตัวอย่าง" : null,
        createdById: params.createdById,
      });

      if (!missingCheckout) {
        logs.push({
          employeeId: employee.id,
          workDate,
          logType: "CHECK_OUT",
          logTime: at(workDate, earlyLeave ? 16 : 17, earlyLeave ? 15 : 35),
          channel: day % 3 === 0 ? "MOBILE" : "DEVICE",
          status: earlyLeave ? "EARLY_LEAVE" : "NORMAL",
          deviceId: device?.id,
          locationId: employeeLocation.id,
          latitude: "14.9051000",
          longitude: "105.0781000",
          gpsAccuracy: "15.00",
          ipAddress: "192.168.1.100",
          userAgent: "Seed Script",
          note: earlyLeave ? "ออกก่อนเวลาจากข้อมูลตัวอย่าง" : null,
          createdById: params.createdById,
        });
      }
    }
  }

  const chunkSize = 500;

  for (let i = 0; i < logs.length; i += chunkSize) {
    await prisma.attendanceLog.createMany({
      data: logs.slice(i, i + chunkSize),
    });
  }

  await prisma.attendanceImport.create({
    data: {
      fileName: "demo-attendance-import.xlsx",
      fileSize: 245000,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      storageProvider: "LOCAL",
      storageKey: "/uploads/attendance/demo-attendance-import.xlsx",
      status: "COMPLETED",
      totalRows: logs.length,
      importedRows: logs.length - 10,
      errorRows: 10,
      errorMessage: "ข้อมูลตัวอย่าง: มีบางรายการไม่พบรหัสพนักงาน",
      createdById: params.createdById,
    },
  });
}

/**
 * =========================
 * LEAVE
 * =========================
 */

async function seedLeaveData(params: {
  employees: EmployeeRow[];
  leaveTypes: LeaveTypeRow[];
  submittedById: string;
  approvedById: string;
}) {
  console.log("Seeding leave balances and leave requests...");

  for (const employee of params.employees) {
    for (const leaveType of params.leaveTypes) {
      const entitlement =
        leaveType.code === "ANNUAL"
          ? "10.00"
          : leaveType.code === "SICK"
            ? "30.00"
            : leaveType.code === "PERSONAL"
              ? "6.00"
              : leaveType.code === "MATERNITY"
                ? "98.00"
                : "5.00";

      await prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            year: currentYear,
          },
        },
        update: {
          entitlementDays: entitlement,
          carriedForwardDays: leaveType.code === "ANNUAL" ? "2.00" : "0.00",
          adjustedDays: "0.00",
          usedDays: decimal(Number(employee.employeeCode.replace("DEMO", "")) % 4),
          pendingDays: "0.00",
          note: "ยอดวันลาตัวอย่างจาก seed",
        },
        create: {
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          year: currentYear,
          entitlementDays: entitlement,
          carriedForwardDays: leaveType.code === "ANNUAL" ? "2.00" : "0.00",
          adjustedDays: "0.00",
          usedDays: decimal(Number(employee.employeeCode.replace("DEMO", "")) % 4),
          pendingDays: "0.00",
          note: "ยอดวันลาตัวอย่างจาก seed",
        },
      });
    }
  }

  const count = Math.min(params.employees.length * 2, 100);

  for (let i = 1; i <= count; i++) {
    const employee = pick(params.employees, i);
    const leaveType = pick(params.leaveTypes, i);
    const startDate = addDays(daysAgo(20), i % 45);

    const status =
      i % 5 === 0
        ? "DRAFT"
        : i % 5 === 1
          ? "SUBMITTED"
          : i % 5 === 2
            ? "APPROVED"
            : i % 5 === 3
              ? "REJECTED"
              : "CANCELLED";

    const requestNo = `LV-DEMO-${currentYear}-${pad(i, 5)}`;

    const request = await prisma.leaveRequest.upsert({
      where: { requestNo },
      update: {
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate,
        endDate: startDate,
        dayType: i % 4 === 0 ? "HALF_DAY_MORNING" : "FULL_DAY",
        totalDays: i % 4 === 0 ? "0.50" : "1.00",
        reason: `เหตุผลการลาตัวอย่าง ${i}`,
        contactInfo: employee.phone,
        note: "ข้อมูลตัวอย่างจาก seed",
        status: status as any,
        submittedAt: status !== "DRAFT" ? daysAgo(5) : null,
        approvedAt: status === "APPROVED" ? daysAgo(3) : null,
        rejectedAt: status === "REJECTED" ? daysAgo(3) : null,
        cancelledAt: status === "CANCELLED" ? daysAgo(2) : null,
        submittedById: params.submittedById,
        cancelledById: status === "CANCELLED" ? params.submittedById : null,
        deletedAt: null,
      },
      create: {
        requestNo,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate,
        endDate: startDate,
        dayType: i % 4 === 0 ? "HALF_DAY_MORNING" : "FULL_DAY",
        totalDays: i % 4 === 0 ? "0.50" : "1.00",
        reason: `เหตุผลการลาตัวอย่าง ${i}`,
        contactInfo: employee.phone,
        note: "ข้อมูลตัวอย่างจาก seed",
        status: status as any,
        submittedAt: status !== "DRAFT" ? daysAgo(5) : null,
        approvedAt: status === "APPROVED" ? daysAgo(3) : null,
        rejectedAt: status === "REJECTED" ? daysAgo(3) : null,
        cancelledAt: status === "CANCELLED" ? daysAgo(2) : null,
        submittedById: params.submittedById,
        cancelledById: status === "CANCELLED" ? params.submittedById : null,
      },
    });

    await prisma.leaveApprovalLog.deleteMany({
      where: {
        leaveRequestId: request.id,
      },
    });

    if (status !== "DRAFT") {
      await prisma.leaveApprovalLog.create({
        data: {
          leaveRequestId: request.id,
          action:
            status === "SUBMITTED"
              ? "SUBMIT"
              : status === "APPROVED"
                ? "APPROVE"
                : status === "REJECTED"
                  ? "REJECT"
                  : "CANCEL",
          oldStatus: "DRAFT",
          newStatus: status as any,
          reason: status === "REJECTED" ? "เหตุผลไม่ครบถ้วน" : null,
          note: "approval log ตัวอย่าง",
          approvedById: status === "SUBMITTED" ? params.submittedById : params.approvedById,
        },
      });
    }
  }
}

/**
 * =========================
 * OVERTIME
 * =========================
 */

async function seedOvertimeData(params: {
  employees: EmployeeRow[];
  submittedById: string;
  approvedById: string;
}) {
  console.log("Seeding overtime requests...");

  const count = Math.min(params.employees.length * 2, 100);

  for (let i = 1; i <= count; i++) {
    const employee = pick(params.employees, i);
    const workDate = daysAgo(i % 28);

    const status =
      i % 4 === 0
        ? "DRAFT"
        : i % 4 === 1
          ? "SUBMITTED"
          : i % 4 === 2
            ? "APPROVED"
            : "REJECTED";

    const requestNo = `OT-DEMO-${currentYear}-${pad(i, 5)}`;

    const request = await prisma.overtimeRequest.upsert({
      where: { requestNo },
      update: {
        employeeId: employee.id,
        workDate,
        startTime: at(workDate, 18, 0),
        endTime: at(workDate, 20 + (i % 3), 0),
        breakMinutes: 0,
        totalHours: decimal(2 + (i % 3)),
        workType: i % 6 === 0 ? "HOLIDAY" : "WORKDAY",
        reason: `ทำงานล่วงเวลาเพื่อปิดงานเร่งด่วน ${i}`,
        note: "ข้อมูลตัวอย่างจาก seed",
        status: status as any,
        submittedAt: status !== "DRAFT" ? daysAgo(3) : null,
        approvedAt: status === "APPROVED" ? daysAgo(2) : null,
        rejectedAt: status === "REJECTED" ? daysAgo(2) : null,
        submittedById: params.submittedById,
        deletedAt: null,
      },
      create: {
        requestNo,
        employeeId: employee.id,
        workDate,
        startTime: at(workDate, 18, 0),
        endTime: at(workDate, 20 + (i % 3), 0),
        breakMinutes: 0,
        totalHours: decimal(2 + (i % 3)),
        workType: i % 6 === 0 ? "HOLIDAY" : "WORKDAY",
        reason: `ทำงานล่วงเวลาเพื่อปิดงานเร่งด่วน ${i}`,
        note: "ข้อมูลตัวอย่างจาก seed",
        status: status as any,
        submittedAt: status !== "DRAFT" ? daysAgo(3) : null,
        approvedAt: status === "APPROVED" ? daysAgo(2) : null,
        rejectedAt: status === "REJECTED" ? daysAgo(2) : null,
        submittedById: params.submittedById,
      },
    });

    await prisma.overtimeApprovalLog.deleteMany({
      where: { overtimeRequestId: request.id },
    });

    await prisma.overtimeAttachment.deleteMany({
      where: { overtimeRequestId: request.id },
    });

    if (status !== "DRAFT") {
      await prisma.overtimeApprovalLog.create({
        data: {
          overtimeRequestId: request.id,
          action:
            status === "SUBMITTED"
              ? "SUBMIT"
              : status === "APPROVED"
                ? "APPROVE"
                : "REJECT",
          oldStatus: "DRAFT",
          newStatus: status as any,
          reason: status === "REJECTED" ? "ชั่วโมงเกินนโยบาย" : null,
          note: "approval log ตัวอย่าง",
          approvedById: status === "SUBMITTED" ? params.submittedById : params.approvedById,
        },
      });
    }

    if (i % 5 === 0) {
      await prisma.overtimeAttachment.create({
        data: {
          overtimeRequestId: request.id,
          title: "เอกสารประกอบ OT",
          fileName: `ot-demo-${i}.pdf`,
          fileSize: 90000,
          mimeType: "application/pdf",
          storageProvider: "LOCAL",
          storageKey: `/uploads/overtime/ot-demo-${i}.pdf`,
          description: "ไฟล์แนบตัวอย่าง",
          uploadedById: params.submittedById,
        },
      });
    }
  }
}

/**
 * =========================
 * TIME ADJUST
 * =========================
 */

async function seedTimeAdjustData(params: {
  employees: EmployeeRow[];
  submittedById: string;
  approvedById: string;
}) {
  console.log("Seeding time adjust requests...");

  const attendanceLogs = await prisma.attendanceLog.findMany({
    where: {
      employeeId: {
        in: params.employees.map((x) => x.id),
      },
    },
    take: 80,
    orderBy: {
      logTime: "desc",
    },
  });

  const count = Math.min(attendanceLogs.length, 60);

  for (let i = 1; i <= count; i++) {
    const log = attendanceLogs[i - 1];
    const employee = params.employees.find((x) => x.id === log.employeeId) ?? pick(params.employees, i);

    const status =
      i % 4 === 0
        ? "DRAFT"
        : i % 4 === 1
          ? "SUBMITTED"
          : i % 4 === 2
            ? "APPROVED"
            : "REJECTED";

    const requestNo = `TA-DEMO-${currentYear}-${pad(i, 5)}`;

    const request = await prisma.timeAdjustRequest.upsert({
      where: { requestNo },
      update: {
        employeeId: employee.id,
        originalAttendanceLogId: log.id,
        appliedAttendanceLogId: null,
        adjustType: log.logType === "CHECK_IN" ? "แก้ไขเวลาเข้างาน" : "แก้ไขเวลาออกงาน",
        targetLogType: log.logType,
        originalLogTime: log.logTime,
        requestedLogTime: addDays(log.logTime, 0),
        reason: `ลืมลงเวลา/ลงเวลาผิดพลาด ${i}`,
        note: "ข้อมูลตัวอย่างจาก seed",
        status: status as any,
        submittedAt: status !== "DRAFT" ? daysAgo(2) : null,
        approvedAt: status === "APPROVED" ? daysAgo(1) : null,
        rejectedAt: status === "REJECTED" ? daysAgo(1) : null,
        submittedById: params.submittedById,
        approvedById: status === "APPROVED" ? params.approvedById : null,
        rejectedById: status === "REJECTED" ? params.approvedById : null,
        deletedAt: null,
      },
      create: {
        requestNo,
        employeeId: employee.id,
        originalAttendanceLogId: log.id,
        adjustType: log.logType === "CHECK_IN" ? "แก้ไขเวลาเข้างาน" : "แก้ไขเวลาออกงาน",
        targetLogType: log.logType,
        originalLogTime: log.logTime,
        requestedLogTime: addDays(log.logTime, 0),
        reason: `ลืมลงเวลา/ลงเวลาผิดพลาด ${i}`,
        note: "ข้อมูลตัวอย่างจาก seed",
        status: status as any,
        submittedAt: status !== "DRAFT" ? daysAgo(2) : null,
        approvedAt: status === "APPROVED" ? daysAgo(1) : null,
        rejectedAt: status === "REJECTED" ? daysAgo(1) : null,
        submittedById: params.submittedById,
        approvedById: status === "APPROVED" ? params.approvedById : null,
        rejectedById: status === "REJECTED" ? params.approvedById : null,
      },
    });

    await prisma.timeAdjustLog.deleteMany({
      where: { timeAdjustRequestId: request.id },
    });

    await prisma.timeAdjustAttachment.deleteMany({
      where: { timeAdjustRequestId: request.id },
    });

    if (status !== "DRAFT") {
      await prisma.timeAdjustLog.create({
        data: {
          timeAdjustRequestId: request.id,
          action:
            status === "SUBMITTED"
              ? "SUBMIT"
              : status === "APPROVED"
                ? "APPROVE"
                : "REJECT",
          oldStatus: "DRAFT",
          newStatus: status as any,
          reason: status === "REJECTED" ? "หลักฐานไม่ชัดเจน" : null,
          note: "time adjust log ตัวอย่าง",
          actedById: status === "SUBMITTED" ? params.submittedById : params.approvedById,
        },
      });
    }

    if (i % 6 === 0) {
      await prisma.timeAdjustAttachment.create({
        data: {
          timeAdjustRequestId: request.id,
          title: "หลักฐานประกอบคำขอ",
          fileName: `time-adjust-demo-${i}.jpg`,
          fileSize: 150000,
          mimeType: "image/jpeg",
          storageProvider: "LOCAL",
          storageKey: `/uploads/time-adjust/time-adjust-demo-${i}.jpg`,
          description: "ไฟล์แนบตัวอย่าง",
          uploadedById: params.submittedById,
        },
      });
    }
  }
}

/**
 * =========================
 * DOCUMENT REQUESTS
 * =========================
 */

async function seedDocumentRequests(params: {
  company: CompanyRow;
  employees: EmployeeRow[];
  documentTypes: DocumentTypeRow[];
  submittedById: string;
  approvedById: string;
}) {
  console.log("Seeding document requests...");

  const count = Math.min(params.employees.length * 2, 100);

  for (let i = 1; i <= count; i++) {
    const employee = pick(params.employees, i);
    const documentType = pick(params.documentTypes, i);

    const status =
      i % 5 === 0
        ? "DRAFT"
        : i % 5 === 1
          ? "SUBMITTED"
          : i % 5 === 2
            ? "APPROVED"
            : i % 5 === 3
              ? "REJECTED"
              : "CANCELLED";

    const requestNo = `DOC-DEMO-${currentYear}-${pad(i, 5)}`;

    const request = await prisma.documentRequest.upsert({
      where: { requestNo },
      update: {
        companyId: params.company.id,
        employeeId: employee.id,
        documentTypeId: documentType.id,
        title: `ขอ${documentType.nameTh}`,
        purpose: i % 2 === 0 ? "ใช้ประกอบการทำธุรกรรมกับธนาคาร" : "ใช้ประกอบการยื่นเอกสารราชการ",
        requestData: {
          employeeCode: employee.employeeCode,
          employeeName: employee.displayName,
          position: employee.position,
          language: i % 2 === 0 ? "TH" : "EN",
        },
        note: "ข้อมูลตัวอย่างจาก seed",
        status: status as any,
        currentLevel: status === "APPROVED" ? 2 : status === "SUBMITTED" ? 1 : 0,
        submittedAt: status !== "DRAFT" ? daysAgo(4) : null,
        approvedAt: status === "APPROVED" ? daysAgo(1) : null,
        rejectedAt: status === "REJECTED" ? daysAgo(1) : null,
        cancelledAt: status === "CANCELLED" ? daysAgo(1) : null,
        submittedById: params.submittedById,
        approvedById: status === "APPROVED" ? params.approvedById : null,
        rejectedById: status === "REJECTED" ? params.approvedById : null,
        cancelledById: status === "CANCELLED" ? params.submittedById : null,
        deletedAt: null,
      },
      create: {
        requestNo,
        companyId: params.company.id,
        employeeId: employee.id,
        documentTypeId: documentType.id,
        title: `ขอ${documentType.nameTh}`,
        purpose: i % 2 === 0 ? "ใช้ประกอบการทำธุรกรรมกับธนาคาร" : "ใช้ประกอบการยื่นเอกสารราชการ",
        requestData: {
          employeeCode: employee.employeeCode,
          employeeName: employee.displayName,
          position: employee.position,
          language: i % 2 === 0 ? "TH" : "EN",
        },
        note: "ข้อมูลตัวอย่างจาก seed",
        status: status as any,
        currentLevel: status === "APPROVED" ? 2 : status === "SUBMITTED" ? 1 : 0,
        submittedAt: status !== "DRAFT" ? daysAgo(4) : null,
        approvedAt: status === "APPROVED" ? daysAgo(1) : null,
        rejectedAt: status === "REJECTED" ? daysAgo(1) : null,
        cancelledAt: status === "CANCELLED" ? daysAgo(1) : null,
        submittedById: params.submittedById,
        approvedById: status === "APPROVED" ? params.approvedById : null,
        rejectedById: status === "REJECTED" ? params.approvedById : null,
        cancelledById: status === "CANCELLED" ? params.submittedById : null,
      },
    });

    await prisma.documentApproval.deleteMany({
      where: {
        documentRequestId: request.id,
      },
    });

    await prisma.documentFile.deleteMany({
      where: {
        documentRequestId: request.id,
      },
    });

    if (status !== "DRAFT") {
      await prisma.documentApproval.create({
        data: {
          documentRequestId: request.id,
          level: 1,
          action:
            status === "SUBMITTED"
              ? "SUBMIT"
              : status === "APPROVED"
                ? "APPROVE_LEVEL_1"
                : status === "REJECTED"
                  ? "REJECT"
                  : "CANCEL",
          oldStatus: "DRAFT",
          newStatus: status as any,
          reason: status === "REJECTED" ? "ข้อมูลคำขอไม่ครบถ้วน" : null,
          note: "document approval log ตัวอย่าง",
          actedById: status === "SUBMITTED" ? params.submittedById : params.approvedById,
          actedAt: daysAgo(2),
        },
      });
    }

    if (status === "APPROVED") {
      await prisma.documentFile.create({
        data: {
          documentRequestId: request.id,
          fileType: "GENERATED_PDF",
          title: "ไฟล์เอกสารที่สร้างจากระบบ",
          description: "PDF ตัวอย่าง",
          fileName: `${request.requestNo}.pdf`,
          fileSize: 180000,
          mimeType: "application/pdf",
          storageProvider: "LOCAL",
          storageKey: `/uploads/documents/${request.requestNo}.pdf`,
          uploadedById: params.approvedById,
        },
      });
    }
  }
}

/**
 * =========================
 * COMPLAINT
 * =========================
 */

async function seedComplaints(params: {
  company: CompanyRow;
  employees: EmployeeRow[];
  submittedById: string;
  handledById: string;
}) {
  console.log("Seeding complaints...");

  const count = Math.min(params.employees.length, 60);

  for (let i = 1; i <= count; i++) {
    const employee = pick(params.employees, i);
    const complaintNo = `CP-DEMO-${currentYear}-${pad(i, 5)}`;

    const existing = await prisma.complaint.findUnique({
      where: { complaintNo },
    });

    const data = {
      companyId: params.company.id,
      employeeId: employee.id,
      title: `เรื่องร้องเรียน DEMO ${i}`,
      category: i % 3 === 0 ? "สภาพแวดล้อมการทำงาน" : i % 3 === 1 ? "การสื่อสารภายใน" : "สวัสดิการ",
      description: `รายละเอียดเรื่องร้องเรียนตัวอย่างลำดับที่ ${i}`,
      expectation: "ต้องการให้บริษัทตรวจสอบและปรับปรุง",
      note: "ข้อมูลตัวอย่างจาก seed",
      status:
        i % 4 === 0
          ? "SUBMITTED"
          : i % 4 === 1
            ? "IN_PROGRESS"
            : i % 4 === 2
              ? "RESOLVED"
              : "CLOSED",
      handledAt: i % 4 >= 1 ? daysAgo(2) : null,
      closedAt: i % 4 === 3 ? daysAgo(1) : null,
      submittedById: params.submittedById,
      handledById: i % 4 >= 1 ? params.handledById : null,
      deletedAt: null,
    };

    if (existing) {
      await prisma.complaint.update({
        where: { id: existing.id },
        data: data as any,
      });
    } else {
      await prisma.complaint.create({
        data: {
          complaintNo,
          ...data,
        } as any,
      });
    }
  }
}

/**
 * =========================
 * EVALUATION
 * =========================
 */

async function seedEvaluationData(params: {
  company: CompanyRow;
  employees: EmployeeRow[];
  createdById: string;
  evaluatorUserId: string;
  finalizedById: string;
}) {
  console.log("Seeding evaluation forms and results...");

  const form = await prisma.evaluationForm.upsert({
    where: {
      companyId_code: {
        companyId: params.company.id,
        code: "PROBATION_EVAL",
      },
    },
    update: {
      name: "แบบประเมินทดลองงาน",
      description: "แบบประเมินผลการทดลองงานพนักงาน",
      periodType: "PROBATION",
      totalScore: "100.00",
      passScore: "70.00",
      status: "ACTIVE",
      createdById: params.createdById,
      deletedAt: null,
    },
    create: {
      companyId: params.company.id,
      code: "PROBATION_EVAL",
      name: "แบบประเมินทดลองงาน",
      description: "แบบประเมินผลการทดลองงานพนักงาน",
      periodType: "PROBATION",
      totalScore: "100.00",
      passScore: "70.00",
      status: "ACTIVE",
      createdById: params.createdById,
    },
  });

  await prisma.evaluationQuestion.deleteMany({
    where: {
      formId: form.id,
    },
  });

  const questions = [
    { title: "ความรับผิดชอบต่อหน้าที่", type: "SCORE", maxScore: "5.00", weight: "1.00" },
    { title: "คุณภาพของงาน", type: "SCORE", maxScore: "5.00", weight: "1.00" },
    { title: "การตรงต่อเวลา", type: "SCORE", maxScore: "5.00", weight: "1.00" },
    { title: "การทำงานเป็นทีม", type: "SCORE", maxScore: "5.00", weight: "1.00" },
    { title: "ทักษะการสื่อสาร", type: "SCORE", maxScore: "5.00", weight: "1.00" },
    { title: "ความรู้ความสามารถในงาน", type: "SCORE", maxScore: "5.00", weight: "1.00" },
    { title: "ทัศนคติในการทำงาน", type: "SCORE", maxScore: "5.00", weight: "1.00" },
    { title: "ความเหมาะสมในการผ่านทดลองงาน", type: "YES_NO", maxScore: "1.00", weight: "10.00" },
  ];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];

    await prisma.evaluationQuestion.create({
      data: {
        formId: form.id,
        title: question.title,
        description: "คำถามประเมินตัวอย่าง",
        type: question.type as any,
        maxScore: question.maxScore,
        weight: question.weight,
        sortOrder: i + 1,
        isRequired: true,
      },
    });
  }

  const count = Math.min(params.employees.length, 60);

  for (let i = 1; i <= count; i++) {
    const employee = pick(params.employees, i);

    await prisma.evaluator.create({
      data: {
        formId: form.id,
        employeeId: employee.id,
        evaluatorUserId: params.evaluatorUserId,
        note: "มอบหมายผู้ประเมินตัวอย่าง",
        status: "ACTIVE",
        createdById: params.createdById,
      },
    });

    const total = 60 + (i % 36);
    const status = i % 3 === 0 ? "FINALIZED" : i % 3 === 1 ? "SUBMITTED" : "DRAFT";

    const result = await prisma.evaluationResult.create({
      data: {
        companyId: params.company.id,
        formId: form.id,
        employeeId: employee.id,
        evaluatorUserId: params.evaluatorUserId,
        periodName: `รอบประเมิน ${currentYear}`,
        evaluationDate: daysAgo(i % 30),
        scoreItems: {
          responsibility: 4,
          quality: 4,
          punctuality: i % 5 === 0 ? 3 : 5,
          teamwork: 4,
          communication: 4,
          jobKnowledge: 4,
          attitude: 5,
        },
        totalScore: decimal(total),
        maxScore: "100.00",
        percent: decimal(total),
        summary: total >= 70 ? "ผลการประเมินอยู่ในเกณฑ์ผ่าน" : "ควรติดตามและพัฒนาเพิ่มเติม",
        recommendation: total >= 70 ? "แนะนำให้ผ่านการประเมิน" : "แนะนำให้ขยายเวลาทดลองงาน",
        note: "ผลประเมินตัวอย่างจาก seed",
        status,
        submittedAt: status !== "DRAFT" ? daysAgo(3) : null,
        finalizedAt: status === "FINALIZED" ? daysAgo(1) : null,
        createdById: params.createdById,
        submittedById: status !== "DRAFT" ? params.evaluatorUserId : null,
        finalizedById: status === "FINALIZED" ? params.finalizedById : null,
      },
    });

    if (i % 7 === 0) {
      await prisma.evaluationAttachment.create({
        data: {
          evaluationResultId: result.id,
          title: "เอกสารประกอบการประเมิน",
          fileName: `evaluation-demo-${i}.pdf`,
          fileSize: 110000,
          mimeType: "application/pdf",
          storageProvider: "LOCAL",
          storageKey: `/uploads/evaluation/evaluation-demo-${i}.pdf`,
          uploadedById: params.evaluatorUserId,
        },
      });
    }
  }

  return form as EvaluationFormRow;
}

/**
 * =========================
 * WARNING / DISCIPLINE
 * =========================
 */

async function seedWarningAndDiscipline(params: {
  company: CompanyRow;
  employees: EmployeeRow[];
  createdById: string;
  issuedById: string;
}) {
  console.log("Seeding warning letters and disciplinary histories...");

  const count = Math.min(params.employees.length, 35);

  for (let i = 1; i <= count; i++) {
    const employee = pick(params.employees, i);
    const letterNo = `WL-DEMO-${currentYear}-${pad(i, 5)}`;

    const warning = await prisma.warningLetter.upsert({
      where: {
        companyId_letterNo: {
          companyId: params.company.id,
          letterNo,
        },
      },
      update: {
        employeeId: employee.id,
        subject: `หนังสือเตือน DEMO ${i}`,
        severity:
          i % 4 === 0
            ? "INFO"
            : i % 4 === 1
              ? "MINOR"
              : i % 4 === 2
                ? "MAJOR"
                : "SERIOUS",
        status: i % 3 === 0 ? "ISSUED" : i % 3 === 1 ? "ACKNOWLEDGED" : "DRAFT",
        incidentDate: daysAgo(10 + i),
        issuedDate: i % 3 !== 2 ? daysAgo(5) : null,
        description: "รายละเอียดเหตุการณ์ตัวอย่างสำหรับทดสอบระบบวินัย",
        correctiveAction: "ให้ปรับปรุงพฤติกรรมและปฏิบัติตามระเบียบบริษัท",
        employeeResponse: i % 3 === 1 ? "รับทราบและจะปรับปรุง" : null,
        note: "ข้อมูลตัวอย่างจาก seed",
        issuedAt: i % 3 !== 2 ? daysAgo(5) : null,
        acknowledgedAt: i % 3 === 1 ? daysAgo(3) : null,
        createdById: params.createdById,
        issuedById: i % 3 !== 2 ? params.issuedById : null,
        acknowledgedById: i % 3 === 1 ? params.issuedById : null,
        deletedAt: null,
      },
      create: {
        companyId: params.company.id,
        employeeId: employee.id,
        letterNo,
        subject: `หนังสือเตือน DEMO ${i}`,
        severity:
          i % 4 === 0
            ? "INFO"
            : i % 4 === 1
              ? "MINOR"
              : i % 4 === 2
                ? "MAJOR"
                : "SERIOUS",
        status: i % 3 === 0 ? "ISSUED" : i % 3 === 1 ? "ACKNOWLEDGED" : "DRAFT",
        incidentDate: daysAgo(10 + i),
        issuedDate: i % 3 !== 2 ? daysAgo(5) : null,
        description: "รายละเอียดเหตุการณ์ตัวอย่างสำหรับทดสอบระบบวินัย",
        correctiveAction: "ให้ปรับปรุงพฤติกรรมและปฏิบัติตามระเบียบบริษัท",
        employeeResponse: i % 3 === 1 ? "รับทราบและจะปรับปรุง" : null,
        note: "ข้อมูลตัวอย่างจาก seed",
        issuedAt: i % 3 !== 2 ? daysAgo(5) : null,
        acknowledgedAt: i % 3 === 1 ? daysAgo(3) : null,
        createdById: params.createdById,
        issuedById: i % 3 !== 2 ? params.issuedById : null,
        acknowledgedById: i % 3 === 1 ? params.issuedById : null,
      },
    });

    await prisma.disciplinaryHistory.create({
      data: {
        companyId: params.company.id,
        employeeId: employee.id,
        warningLetterId: warning.id,
        type: "WARNING",
        eventDate: warning.incidentDate ?? daysAgo(10),
        title: `ประวัติ DEMO ${i}`,
        detail: warning.description,
        actionTaken: warning.correctiveAction,
        note: "ประวัติทางวินัยตัวอย่างจาก seed",
        createdById: params.createdById,
      },
    });
  }
}

/**
 * =========================
 * ONBOARDING / PROBATION
 * =========================
 */

async function seedOnboardingAndProbation(params: {
  company: CompanyRow;
  employees: EmployeeRow[];
  createdById: string;
  reviewedById: string;
}) {
  console.log("Seeding onboarding and probation...");

  const checklist = await prisma.onboardingChecklist.upsert({
    where: {
      companyId_code: {
        companyId: params.company.id,
        code: "NEW_EMPLOYEE",
      },
    },
    update: {
      name: "Checklist พนักงานใหม่",
      description: "รายการตรวจสอบสำหรับพนักงานเข้าใหม่",
      status: "ACTIVE",
      createdById: params.createdById,
      deletedAt: null,
    },
    create: {
      companyId: params.company.id,
      code: "NEW_EMPLOYEE",
      name: "Checklist พนักงานใหม่",
      description: "รายการตรวจสอบสำหรับพนักงานเข้าใหม่",
      status: "ACTIVE",
      createdById: params.createdById,
    },
  });

  await prisma.onboardingChecklistItem.deleteMany({
    where: {
      checklistId: checklist.id,
    },
  });

  const checklistItems = [
    { title: "กรอกประวัติส่วนตัว", category: "เอกสาร" },
    { title: "ส่งสำเนาบัตรประชาชน", category: "เอกสาร" },
    { title: "ส่งสำเนาทะเบียนบ้าน", category: "เอกสาร" },
    { title: "อบรมกฎระเบียบบริษัท", category: "อบรม" },
    { title: "รับอุปกรณ์ทำงาน", category: "อุปกรณ์" },
    { title: "ตั้งค่าบัญชีผู้ใช้งาน", category: "IT" },
    { title: "แนะนำทีมและหัวหน้างาน", category: "แนะนำงาน" },
  ];

const createdItems: OnboardingChecklistItemRow[] = [];

  for (let i = 0; i < checklistItems.length; i++) {
    const item = checklistItems[i];

    const created = await prisma.onboardingChecklistItem.create({
      data: {
        checklistId: checklist.id,
        title: item.title,
        description: "รายการ onboarding ตัวอย่าง",
        category: item.category,
        sortOrder: i + 1,
        isRequired: true,
      },
    });

    createdItems.push(created);
  }

  const targetEmployees = params.employees.slice(0, Math.min(25, params.employees.length));

  for (let i = 0; i < targetEmployees.length; i++) {
    const employee = targetEmployees[i];

    for (const item of createdItems) {
      const taskStatus =
        i % 4 === 0
          ? "COMPLETED"
          : i % 4 === 1
            ? "IN_PROGRESS"
            : i % 4 === 2
              ? "PENDING"
              : "OVERDUE";

      const task = await prisma.onboardingTask.create({
        data: {
          companyId: params.company.id,
          employeeId: employee.id,
          checklistId: checklist.id,
          checklistItemId: item.id,
          title: item.title,
          description: item.description,
          category: item.category,
          status: taskStatus,
          dueDate: addDays(employee.startDate, 7 + item.sortOrder),
          completedAt: taskStatus === "COMPLETED" ? addDays(employee.startDate, 5 + item.sortOrder) : null,
          createdById: params.createdById,
          completedById: taskStatus === "COMPLETED" ? params.createdById : null,
        },
      });

      if (item.category === "เอกสาร") {
        await prisma.onboardingDocument.create({
          data: {
            companyId: params.company.id,
            employeeId: employee.id,
            taskId: task.id,
            documentName: item.title,
            description: "เอกสาร onboarding ตัวอย่าง",
            isRequired: true,
            status: i % 3 === 0 ? "VERIFIED" : i % 3 === 1 ? "SUBMITTED" : "PENDING",
            submittedAt: i % 3 !== 2 ? daysAgo(5) : null,
            verifiedAt: i % 3 === 0 ? daysAgo(3) : null,
            fileName: i % 3 !== 2 ? `${employee.employeeCode}-${item.id}.pdf` : null,
            fileSize: i % 3 !== 2 ? 100000 : null,
            mimeType: i % 3 !== 2 ? "application/pdf" : null,
            storageProvider: i % 3 !== 2 ? "LOCAL" : null,
            storageKey: i % 3 !== 2 ? `/uploads/onboarding/${employee.employeeCode}-${item.id}.pdf` : null,
            createdById: params.createdById,
            submittedById: i % 3 !== 2 ? params.createdById : null,
            verifiedById: i % 3 === 0 ? params.createdById : null,
          },
        });
      }
    }

    await prisma.probationRecord.create({
      data: {
        companyId: params.company.id,
        employeeId: employee.id,
        startDate: employee.startDate,
        endDate: employee.probationEndDate ?? addDays(employee.startDate, 119),
        reviewDate: addDays(employee.startDate, 90),
        status: i % 4 === 0 ? "IN_PROGRESS" : i % 4 === 1 ? "PASSED" : i % 4 === 2 ? "EXTENDED" : "FAILED",
        result: i % 4 === 1 ? "ผ่านทดลองงาน" : null,
        summary: "สรุปผลทดลองงานตัวอย่าง",
        recommendation: i % 4 === 2 ? "ขยายระยะเวลาทดลองงาน 30 วัน" : "ติดตามผลตามรอบ",
        note: "ข้อมูลตัวอย่างจาก seed",
        reviewedAt: i % 4 === 0 ? null : daysAgo(2),
        extendedUntil: i % 4 === 2 ? addDays(employee.probationEndDate ?? new Date(), 30) : null,
        createdById: params.createdById,
        reviewedById: i % 4 === 0 ? null : params.reviewedById,
      },
    });
  }

  return checklist as OnboardingChecklistRow;
}

/**
 * =========================
 * REPORT / AUDIT
 * =========================
 */

async function seedReportsAndAudit(params: {
  company: CompanyRow;
  employees: EmployeeRow[];
  createdById: string;
}) {
  console.log("Seeding reports and audit logs...");

  const reportCodes = ["ATTENDANCE", "PAYROLL_BASIC", "SOCIAL_SECURITY", "LEAVE_QUOTA"] as const;

  for (let i = 1; i <= 40; i++) {
    const reportCode = reportCodes[i % reportCodes.length];

    const status =
      i % 5 === 0
        ? "PENDING"
        : i % 5 === 1
          ? "PROCESSING"
          : i % 5 === 2
            ? "COMPLETED"
            : i % 5 === 3
              ? "FAILED"
              : "CANCELLED";

    const job = await prisma.reportJob.create({
      data: {
        companyId: params.company.id,
        reportCode,
        name: `รายงาน DEMO ${reportCode} ครั้งที่ ${i}`,
        description: "งานสร้างรายงานจาก seed",
        status,
        params: {
          year: currentYear,
          month: (i % 12) + 1,
          companyCode: params.company.code,
        },
        startedAt: status !== "PENDING" ? daysAgo(3) : null,
        completedAt: status === "COMPLETED" ? daysAgo(2) : null,
        failedAt: status === "FAILED" ? daysAgo(2) : null,
        cancelledAt: status === "CANCELLED" ? daysAgo(2) : null,
        errorMessage: status === "FAILED" ? "ตัวอย่าง error จาก seed" : null,
        cancelReason: status === "CANCELLED" ? "ยกเลิกโดยผู้ใช้งาน" : null,
        createdById: params.createdById,
        cancelledById: status === "CANCELLED" ? params.createdById : null,
      },
    });

    let exportFileId: string | null = null;

    if (status === "COMPLETED") {
      const file = await prisma.exportFile.create({
        data: {
          companyId: params.company.id,
          reportJobId: job.id,
          reportCode,
          format: i % 3 === 0 ? "PDF" : i % 3 === 1 ? "XLSX" : "CSV",
          title: `ไฟล์ส่งออก DEMO ${reportCode}`,
          description: "ไฟล์รายงานตัวอย่าง",
          fileName: `${reportCode.toLowerCase()}-demo-${i}.xlsx`,
          fileSize: 300000 + i * 1000,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storageProvider: "LOCAL",
          storageKey: `/uploads/reports/${reportCode.toLowerCase()}-demo-${i}.xlsx`,
          downloadedAt: i % 2 === 0 ? daysAgo(1) : null,
          createdById: params.createdById,
          downloadedById: i % 2 === 0 ? params.createdById : null,
        },
      });

      exportFileId = file.id;
    }

    await prisma.reportLog.create({
      data: {
        companyId: params.company.id,
        reportJobId: job.id,
        exportFileId,
        reportCode,
        action: status === "COMPLETED" ? "CREATE_EXPORT" : status === "FAILED" ? "ERROR" : "VIEW",
        message: "report log ตัวอย่างจาก seed",
        metadata: {
          source: "seed",
          index: i,
        },
        createdById: params.createdById,
      },
    });
  }

  const auditActions = ["LOGIN", "VIEW", "CREATE", "UPDATE", "EXPORT"] as const;

  for (let i = 1; i <= 150; i++) {
    const employee = pick(params.employees, i);

    await prisma.auditLog.create({
      data: {
        action: auditActions[i % auditActions.length],
        entity: i % 2 === 0 ? "Employee" : "AttendanceLog",
        entityId: employee.id,
        description: `audit log DEMO ${i}`,
        userId: params.createdById,
        requestId: `seed-demo-${pad(i, 5)}`,
        ipAddress: "127.0.0.1",
        userAgent: "Seed Script",
        method: i % 2 === 0 ? "GET" : "POST",
        path: i % 2 === 0 ? "/api/employees" : "/api/attendance",
        statusCode: i % 17 === 0 ? 500 : 200,
        metadata: {
          seed: true,
          order: i,
        },
      },
    });
  }
}

/**
 * =========================
 * MAIN
 * =========================
 */

async function main() {
  console.log("🌱 Start seeding HR system...");

  await seedPermissions();
  await seedRoles();

  const adminUser = await seedAdminUser();
  const demoUsers = await seedDemoUsers();

  const org = await seedDefaultCompany();
  const leaveTypes = await seedDefaultLeaveTypesAndPolicies(org.company);
  await seedDefaultOvertimePolicies(org.company);
  await seedDefaultPayrollComponents(org.company);
  const documentTypes = await seedDefaultDocumentTypesAndTemplates(org.company);

  await clearDemoGeneratedData();

  const hrUser = demoUsers["hr.manager@hr.local"] ?? adminUser;
  const managerUser = demoUsers["manager@hr.local"] ?? adminUser;
  const employeeUser = demoUsers["employee@hr.local"] ?? adminUser;

  const employees = await seedDemoEmployees({
    company: org.company,
    branches: org.branches,
    departments: org.departments,
    divisions: org.divisions,
    employeeTypes: org.employeeTypes,
    positions: org.positions,
    demoUsers,
    createdById: hrUser.id,
  });

  await seedAttendanceData({
    employees,
    locations: org.locations,
    devices: org.devices,
    createdById: hrUser.id,
  });

  await seedLeaveData({
    employees,
    leaveTypes,
    submittedById: employeeUser.id,
    approvedById: managerUser.id,
  });

  await seedOvertimeData({
    employees,
    submittedById: employeeUser.id,
    approvedById: managerUser.id,
  });

  await seedTimeAdjustData({
    employees,
    submittedById: employeeUser.id,
    approvedById: managerUser.id,
  });

  await seedDocumentRequests({
    company: org.company,
    employees,
    documentTypes,
    submittedById: employeeUser.id,
    approvedById: managerUser.id,
  });

  await seedComplaints({
    company: org.company,
    employees,
    submittedById: employeeUser.id,
    handledById: hrUser.id,
  });

  await seedEvaluationData({
    company: org.company,
    employees,
    createdById: hrUser.id,
    evaluatorUserId: managerUser.id,
    finalizedById: hrUser.id,
  });

  await seedWarningAndDiscipline({
    company: org.company,
    employees,
    createdById: hrUser.id,
    issuedById: managerUser.id,
  });

  await seedOnboardingAndProbation({
    company: org.company,
    employees,
    createdById: hrUser.id,
    reviewedById: managerUser.id,
  });

  await seedReportsAndAudit({
    company: org.company,
    employees,
    createdById: hrUser.id,
  });

  console.log("✅ Seed completed successfully.");
  console.log("");
  console.log("Login accounts:");
  console.log(
    process.env.SEED_ADMIN_PASSWORD
      ? "admin@hr.local / (ตามค่า SEED_ADMIN_PASSWORD ที่ตั้งไว้)"
      : "admin@hr.local / Admin@123456  ← รหัสตั้งต้นสำหรับ dev เท่านั้น",
  );
  console.log(`hr.manager@hr.local / ${DEMO_PASSWORD}`);
  console.log(`manager@hr.local / ${DEMO_PASSWORD}`);
  console.log(`employee@hr.local / ${DEMO_PASSWORD}`);
  console.log(`payroll@hr.local / ${DEMO_PASSWORD}`);
  console.log(`executive@hr.local / ${DEMO_PASSWORD}`);
  console.log("");
  console.log(`Demo employees created/updated: ${DEMO_EMPLOYEE_COUNT}`);
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });