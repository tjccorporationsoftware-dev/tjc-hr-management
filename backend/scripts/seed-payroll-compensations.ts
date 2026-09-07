import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const pool = new Pool({
  connectionString,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

const salarySteps = [
  18000, 22000, 25000, 28000, 30000,
  32000, 35000, 38000, 42000, 45000,
  50000, 55000, 60000, 65000, 70000,
];

function getPositionAllowance(position?: string | null) {
  const text = position ?? "";

  if (
    text.includes("Manager") ||
    text.includes("ผู้จัดการ") ||
    text.includes("หัวหน้า") ||
    text.includes("Lead")
  ) {
    return 5000;
  }

  if (
    text.includes("Senior") ||
    text.includes("ชำนาญการ")
  ) {
    return 3000;
  }

  return 0;
}

async function main() {
  console.log("Seeding payroll compensations...");

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: {
        in: ["ACTIVE", "PROBATION"],
      },
    },
    orderBy: {
      employeeCode: "asc",
    },
    include: {
      profile: true,
      company: true,
    },
  });

  if (employees.length === 0) {
    console.log("No employees found.");
    console.log("กรุณา seed หรือสร้างข้อมูลพนักงานก่อน แล้วค่อยรัน script นี้อีกครั้ง");
    return;
  }

  const effectiveDate = new Date(new Date().getFullYear(), 0, 1);

  let createdOrUpdated = 0;

  for (const [index, employee] of employees.entries()) {
    const baseSalary = salarySteps[index % salarySteps.length];
    const positionAllowance = getPositionAllowance(employee.position);

    await prisma.employeeCompensation.upsert({
      where: {
        employeeId_effectiveDate: {
          employeeId: employee.id,
          effectiveDate,
        },
      },
      update: {
        companyId: employee.companyId,
        baseSalary,
        paymentMethod: "BANK_TRANSFER",
        bankName: employee.profile?.bankName ?? "ธนาคารกสิกรไทย",
        bankAccountNo:
          employee.profile?.bankAccountNo ??
          `099${String(index + 1).padStart(7, "0")}`,
        bankAccountName:
          employee.profile?.bankAccountName ??
          `${employee.firstName} ${employee.lastName}`,
        socialSecurityEnabled: true,
        taxEnabled: true,
        status: "ACTIVE",
        note: "Auto seeded compensation profile for payroll testing",
        deletedAt: null,
      },
      create: {
        companyId: employee.companyId,
        employeeId: employee.id,
        effectiveDate,
        baseSalary,
        paymentMethod: "BANK_TRANSFER",
        bankName: employee.profile?.bankName ?? "ธนาคารกสิกรไทย",
        bankAccountNo:
          employee.profile?.bankAccountNo ??
          `099${String(index + 1).padStart(7, "0")}`,
        bankAccountName:
          employee.profile?.bankAccountName ??
          `${employee.firstName} ${employee.lastName}`,
        socialSecurityEnabled: true,
        taxEnabled: true,
        status: "ACTIVE",
        note: "Auto seeded compensation profile for payroll testing",
      },
    });

    /*
     * เบี้ยประจำอยู่ที่ "รายการประจำ" ไม่ใช่ช่องคงที่ในใบเงินเดือนแล้ว
     * ตัวคำนวณอ่านจากที่นี่ที่เดียว ถ้าเขียนไว้ที่อื่นจะไม่ถูกจ่าย
     */
    const recurring: Array<{ code: string; name: string; amount: number }> = [
      { code: "POSITION_ALLOWANCE", name: "เงินประจำตำแหน่ง", amount: positionAllowance },
      { code: "TRANSPORT_ALLOWANCE", name: "ค่าเดินทาง", amount: 1500 },
      { code: "PHONE_ALLOWANCE", name: "ค่าโทรศัพท์", amount: 500 },
    ];

    for (const item of recurring) {
      if (item.amount <= 0) continue;

      const existing = await prisma.employeeCompensationItem.findFirst({
        where: {
          employeeId: employee.id,
          code: item.code,
          effectiveDate,
          deletedAt: null,
        },
        select: { id: true },
      });

      const data = {
        companyId: employee.companyId,
        employeeId: employee.id,
        code: item.code,
        name: item.name,
        type: "EARNING" as const,
        sourceType: "ALLOWANCE" as const,
        amount: item.amount,
        rate: item.amount,
        effectiveDate,
        isTaxable: true,
        isSocialSecurityBase: true,
        prorateByEmploymentDays: true,
        status: "ACTIVE" as const,
        note: "Auto seeded recurring allowance for payroll testing",
      };

      if (existing) {
        await prisma.employeeCompensationItem.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.employeeCompensationItem.create({ data });
      }
    }

    createdOrUpdated += 1;
  }

  console.log(`Payroll compensations seeded: ${createdOrUpdated}`);
}

main()
  .catch((error) => {
    console.error("Seed payroll compensations failed:");
    console.error(error);
    process.exitCode = 1;
  })
.finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});