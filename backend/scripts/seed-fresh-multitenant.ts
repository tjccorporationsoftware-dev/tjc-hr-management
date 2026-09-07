/* eslint-disable no-console */
/**
 * seed-fresh-multitenant.ts
 * -----------------------------------------------------------------------------
 * ล้างข้อมูลธุรกิจทั้งหมด (คง Permission/Role/RolePermission ไว้) แล้วสร้างระบบใหม่:
 *  - 2 บริษัท บริษัทละ 2 สาขา
 *  - พนักงานคละกัน ไม่เกินสาขาละ 20 คน
 *  - user + password พร้อมใช้ครบทุก scope (GLOBAL / COMPANY / BRANCH)
 *
 * รหัสผ่านทุกบัญชี: Admin@123456
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const PASSWORD = "Admin@123456";
const KEEP_TABLES = new Set([
  "_prisma_migrations",
  "Permission",
  "Role",
  "RolePermission",
]);

const THAI_FIRST = [
  "สมชาย", "สมหญิง", "ปิยะ", "อนุชา", "กมล", "นภา", "วิภา", "ธนา", "ศิริพร", "ประเสริฐ",
  "จันทร์เพ็ญ", "ธีรพงษ์", "รัตนา", "อารีย์", "พงศกร", "สุดารัตน์", "วีระ", "มานพ", "เกศรา", "ชัยวัฒน์",
  "พรทิพย์", "ณัฐพล", "อรุณี", "สุชาติ", "ดวงใจ", "ภัทร", "กิตติ", "นารี", "วรรณา", "ธนวัฒน์",
];
const THAI_LAST = [
  "ใจดี", "รุ่งเรือง", "ศรีสุข", "ทองคำ", "บุญมี", "แสงทอง", "วัฒนา", "พงษ์ไพบูลย์", "อินทร", "มั่นคง",
  "สุขสันต์", "เจริญพร", "ดำรง", "ไชยวงศ์", "พูนสุข", "ธนากร", "งามเลิศ", "โชคชัย", "วิริยะ", "อภิรักษ์",
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

/* ============================ WIPE ============================ */
async function wipeBusinessData() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => !KEEP_TABLES.has(t));

  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`,
  );
  console.log(`🧹 Wiped ${tables.length} business tables (kept auth catalog).`);
}

/* ============================ PER-COMPANY MASTERS ============================ */
async function seedCompanyMasters(companyId: string) {
  // level 1 = สูงสุด ไล่ลงถึง 9 (ตรงกับตัวเลือกในฟอร์มตำแหน่งและ prisma/seed.ts)
  const positionDefs = [
    { code: "MGR", nameTh: "ผู้จัดการ", level: 4, sortOrder: 1 },
    { code: "SUP", nameTh: "หัวหน้างาน", level: 5, sortOrder: 2 },
    { code: "SR", nameTh: "เจ้าหน้าที่อาวุโส", level: 6, sortOrder: 3 },
    { code: "STAFF", nameTh: "เจ้าหน้าที่", level: 7, sortOrder: 4 },
    { code: "OFFICER", nameTh: "พนักงานปฏิบัติการ", level: 8, sortOrder: 5 },
  ];
  const positions: Record<string, string> = {};
  for (const p of positionDefs) {
    const row = await prisma.position.create({
      data: {
        companyId,
        code: p.code,
        nameTh: p.nameTh,
        level: p.level,
        sortOrder: p.sortOrder,
        status: "ACTIVE",
      },
    });
    positions[p.code] = row.id;
  }

  const typeDefs = [
    { code: "MONTHLY", nameTh: "พนักงานรายเดือน" },
    { code: "DAILY", nameTh: "พนักงานรายวัน" },
  ];
  const employeeTypes: Record<string, string> = {};
  for (const t of typeDefs) {
    const row = await prisma.employeeType.create({
      data: { companyId, code: t.code, nameTh: t.nameTh, status: "ACTIVE" },
    });
    employeeTypes[t.code] = row.id;
  }

  return { positions, employeeTypes };
}

/* ============================ ROLES ============================ */
async function getRoleIdMap() {
  const roles = await prisma.role.findMany({ select: { id: true, code: true } });
  const map: Record<string, string> = {};
  for (const r of roles) map[r.code] = r.id;
  const required = [
    "SYSTEM_ADMIN",
    "HR_ADMIN",
    "PAYROLL_ACCOUNTING",
    "EXECUTIVE",
    "MANAGER",
    "EMPLOYEE",
  ];
  const missing = required.filter((c) => !map[c]);
  if (missing.length) {
    throw new Error(
      `ไม่พบ role: ${missing.join(", ")} — กรุณารัน seed roles ก่อน (npm run db:seed:roles)`,
    );
  }
  return map;
}

/* ============================ USERS ============================ */
type ScopeLevel = "GLOBAL" | "COMPANY" | "BRANCH";
const createdAccounts: {
  email: string;
  role: string;
  scope: string;
}[] = [];

async function createUser(params: {
  email: string;
  displayName: string;
  roleId: string;
  roleCode: string;
  scopeLevel: ScopeLevel;
  scopedCompanyId?: string | null;
  scopedBranchId?: string | null;
  employeeId?: string | null;
  scopeLabel: string;
  passwordHash: string;
}) {
  const user = await prisma.user.create({
    data: {
      email: params.email,
      passwordHash: params.passwordHash,
      displayName: params.displayName,
      status: "ACTIVE",
      scopeLevel: params.scopeLevel,
      scopedCompanyId: params.scopedCompanyId ?? null,
      scopedBranchId: params.scopedBranchId ?? null,
      roles: { create: [{ role: { connect: { id: params.roleId } } }] },
    },
  });

  if (params.employeeId) {
    await prisma.employee.update({
      where: { id: params.employeeId },
      data: { userId: user.id },
    });
  }

  createdAccounts.push({
    email: params.email,
    role: params.roleCode,
    scope: params.scopeLabel,
  });
  return user;
}

/* ============================ COMPANY ============================ */
async function seedCompany(params: {
  code: string;
  nameTh: string;
  nameEn: string;
  branchDefs: { code: string; nameTh: string }[];
  roleMap: Record<string, string>;
  passwordHash: string;
  employeesPerBranch: number;
}) {
  const company = await prisma.company.create({
    data: {
      code: params.code,
      nameTh: params.nameTh,
      nameEn: params.nameEn,
      taxId: `0${Math.floor(1000000000000 + Math.random() * 8999999999999)}`,
      address: `เลขที่ ${Math.floor(Math.random() * 900) + 100} กรุงเทพมหานคร`,
      status: "ACTIVE",
    },
  });

  // master per-company (ตำแหน่ง/ประเภทพนักงาน แยกของแต่ละบริษัท)
  const { positions, employeeTypes } = await seedCompanyMasters(company.id);

  const branches: { id: string; code: string; nameTh: string }[] = [];
  for (const b of params.branchDefs) {
    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        code: b.code,
        nameTh: b.nameTh,
        status: "ACTIVE",
      },
    });
    branches.push({ id: branch.id, code: b.code, nameTh: b.nameTh });
  }

  // departments (company-level)
  const deptDefs = [
    { code: "HR", nameTh: "ฝ่ายทรัพยากรบุคคล" },
    { code: "OPS", nameTh: "ฝ่ายปฏิบัติการ" },
    { code: "SALES", nameTh: "ฝ่ายขายและการตลาด" },
    { code: "FIN", nameTh: "ฝ่ายบัญชีและการเงิน" },
  ];
  const departments: string[] = [];
  for (const d of deptDefs) {
    const dept = await prisma.department.create({
      data: {
        companyId: company.id,
        code: d.code,
        nameTh: d.nameTh,
        status: "ACTIVE",
      },
    });
    departments.push(dept.id);
  }

  // leave types (company-level)
  const leaveDefs = [
    { code: "ANNUAL", nameTh: "ลาพักร้อน", affectPayroll: false },
    { code: "SICK", nameTh: "ลาป่วย", affectPayroll: false },
    { code: "PERSONAL", nameTh: "ลากิจ", affectPayroll: false },
  ];
  for (const lt of leaveDefs) {
    await prisma.leaveType.create({
      data: {
        companyId: company.id,
        code: lt.code,
        nameTh: lt.nameTh,
        isPaid: true,
        requiresAttachment: lt.code === "SICK",
        allowHalfDay: true,
        allowHourly: false,
        deductQuota: true,
        affectAttendance: true,
        affectPayroll: lt.affectPayroll,
        minLeaveUnitMinutes: 60,
        status: "ACTIVE",
      },
    });
  }

  // employees per branch
  const positionCodes = ["MGR", "SUP", "SR", "STAFF", "OFFICER"];
  const empIdByBranch: Record<string, string[]> = {};
  let seq = 0;
  for (const branch of branches) {
    empIdByBranch[branch.id] = [];
    for (let i = 0; i < params.employeesPerBranch; i++) {
      const first = pick(THAI_FIRST, seq);
      const last = pick(THAI_LAST, seq + 3);
      const posCode = pick(positionCodes, i);
      const typeCode = i % 3 === 0 ? "DAILY" : "MONTHLY";
      const emp = await prisma.employee.create({
        data: {
          employeeCode: `${params.code}-${branch.code}-${String(i + 1).padStart(3, "0")}`,
          firstName: first,
          lastName: last,
          displayName: `${first} ${last}`,
          email: `${params.code.toLowerCase()}.${branch.code.toLowerCase()}.${i + 1}@staff.local`,
          phone: `08${Math.floor(10000000 + Math.random() * 89999999)}`,
          startDate: new Date(2021, seq % 12, ((seq * 7) % 27) + 1),
          status: "ACTIVE",
          companyId: company.id,
          branchId: branch.id,
          departmentId: pick(departments, i),
          employeeTypeId: employeeTypes[typeCode],
          positionId: positions[posCode],
          position: null,
        },
      });
      empIdByBranch[branch.id].push(emp.id);
      seq++;
    }
  }

  const lower = params.code.toLowerCase();

  // COMPANY-scoped management users
  await createUser({
    email: `hr.${lower}@tjc.local`,
    displayName: `HR Admin (${params.code})`,
    roleId: params.roleMap.HR_ADMIN,
    roleCode: "HR_ADMIN",
    scopeLevel: "COMPANY",
    scopedCompanyId: company.id,
    scopeLabel: `COMPANY · ${params.nameTh}`,
    passwordHash: params.passwordHash,
  });
  await createUser({
    email: `payroll.${lower}@tjc.local`,
    displayName: `Payroll (${params.code})`,
    roleId: params.roleMap.PAYROLL_ACCOUNTING,
    roleCode: "PAYROLL_ACCOUNTING",
    scopeLevel: "COMPANY",
    scopedCompanyId: company.id,
    scopeLabel: `COMPANY · ${params.nameTh}`,
    passwordHash: params.passwordHash,
  });
  await createUser({
    email: `exec.${lower}@tjc.local`,
    displayName: `Executive (${params.code})`,
    roleId: params.roleMap.EXECUTIVE,
    roleCode: "EXECUTIVE",
    scopeLevel: "COMPANY",
    scopedCompanyId: company.id,
    scopeLabel: `COMPANY · ${params.nameTh}`,
    passwordHash: params.passwordHash,
  });

  // BRANCH-scoped users (manager + one employee per branch, linked to a real employee)
  for (const branch of branches) {
    const branchEmps = empIdByBranch[branch.id];
    await createUser({
      email: `mgr.${lower}.${branch.code.toLowerCase()}@tjc.local`,
      displayName: `Manager (${params.code}/${branch.code})`,
      roleId: params.roleMap.MANAGER,
      roleCode: "MANAGER",
      scopeLevel: "BRANCH",
      scopedCompanyId: company.id,
      scopedBranchId: branch.id,
      employeeId: branchEmps[0],
      scopeLabel: `BRANCH · ${params.nameTh}/${branch.nameTh}`,
      passwordHash: params.passwordHash,
    });
    await createUser({
      email: `emp.${lower}.${branch.code.toLowerCase()}@tjc.local`,
      displayName: `Employee (${params.code}/${branch.code})`,
      roleId: params.roleMap.EMPLOYEE,
      roleCode: "EMPLOYEE",
      scopeLevel: "BRANCH",
      scopedCompanyId: company.id,
      scopedBranchId: branch.id,
      employeeId: branchEmps[1],
      scopeLabel: `BRANCH · ${params.nameTh}/${branch.nameTh}`,
      passwordHash: params.passwordHash,
    });
  }

  const total = Object.values(empIdByBranch).reduce((a, b) => a + b.length, 0);
  console.log(`🏢 ${params.nameTh}: ${branches.length} สาขา, ${total} พนักงาน`);
  return company;
}

/* ============================ MAIN ============================ */
async function main() {
  console.log("=== Fresh multi-tenant seed ===");
  await wipeBusinessData();

  const roleMap = await getRoleIdMap();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // GLOBAL super admin (prefilled on login page)
  await createUser({
    email: "superadmin@tjc.local",
    displayName: "Super Admin (Global)",
    roleId: roleMap.SYSTEM_ADMIN,
    roleCode: "SYSTEM_ADMIN",
    scopeLevel: "GLOBAL",
    scopeLabel: "GLOBAL · ทุกบริษัท",
    passwordHash,
  });

  await seedCompany({
    code: "ALPHA",
    nameTh: "บริษัท อัลฟ่า จำกัด",
    nameEn: "Alpha Co., Ltd.",
    branchDefs: [
      { code: "HQ", nameTh: "สำนักงานใหญ่" },
      { code: "LP", nameTh: "สาขาลาดพร้าว" },
    ],
    roleMap,
    passwordHash,
    employeesPerBranch: 15,
  });

  await seedCompany({
    code: "BETA",
    nameTh: "บริษัท เบต้า จำกัด",
    nameEn: "Beta Co., Ltd.",
    branchDefs: [
      { code: "HQ", nameTh: "สำนักงานใหญ่" },
      { code: "CM", nameTh: "สาขาเชียงใหม่" },
    ],
    roleMap,
    passwordHash,
    employeesPerBranch: 12,
  });

  console.log("\n=== ✅ Seed completed ===");
  console.log(`รหัสผ่านทุกบัญชี: ${PASSWORD}\n`);
  console.log("บัญชีที่พร้อมใช้งาน (แยกตาม scope):");
  console.table(createdAccounts);
  console.log(
    "\n🔑 หน้าล็อกอิน (GLOBAL): superadmin@tjc.local / " + PASSWORD,
  );
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
