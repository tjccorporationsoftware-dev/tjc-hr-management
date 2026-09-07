/* eslint-disable no-console */
/**
 * ข้อมูลตั้งต้นของศูนย์ออกหนังสือรับรอง: ประเภทเอกสาร + Template ต่อบริษัท
 * ------------------------------------------------------------------------
 * seed-fresh-multitenant.ts สร้างบริษัท/พนักงานให้ แต่ไม่ได้สร้างประเภทเอกสาร
 * ทำให้หน้า /documents สร้างคำขอไม่ได้ และสร้าง PDF ไม่ได้ (ไม่มี Template)
 *
 * สคริปต์นี้ idempotent: รันซ้ำได้ ไม่ทับของที่แก้ไว้แล้ว ไม่ลบอะไร
 *
 *   npm run db:seed:document-master
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

const DOCUMENT_TYPES = [
  {
    code: "WORK_CERTIFICATE",
    nameTh: "หนังสือรับรองการทำงาน",
    nameEn: "Work Certificate",
    description: "เอกสารรับรองการทำงาน ตำแหน่ง อายุงาน และสถานะการทำงาน",
    category: "CERTIFICATE",
    includeSalary: false,
  },
  {
    code: "SALARY_CERTIFICATE",
    nameTh: "หนังสือรับรองเงินเดือน",
    nameEn: "Salary Certificate",
    description: "เอกสารรับรองเงินเดือนสำหรับใช้ประกอบธุรกรรมต่าง ๆ",
    category: "CERTIFICATE",
    includeSalary: true,
  },
  {
    code: "VISA_CERTIFICATE",
    nameTh: "หนังสือรับรองเพื่อประกอบการขอวีซ่า",
    nameEn: "Visa Certificate",
    description: "เอกสารรับรองการทำงานสำหรับใช้ประกอบการขอวีซ่า",
    category: "CERTIFICATE",
    includeSalary: false,
  },
  {
    code: "RESIGN_DOCUMENT",
    nameTh: "เอกสารลาออก",
    nameEn: "Resignation Document",
    description: "เอกสารยื่นลาออกและติดตามขั้นตอนอนุมัติการลาออก",
    category: "RESIGNATION",
    includeSalary: false,
  },
  {
    code: "GENERAL_REQUEST",
    nameTh: "คำขอเอกสารทั่วไป",
    nameEn: "General Document Request",
    description: "คำขอเอกสารทั่วไปภายในระบบ HR",
    category: "GENERAL",
    includeSalary: false,
  },
];

/** แถวข้อเท็จจริงเพิ่มเติมเฉพาะหนังสือรับรองเงินเดือน */
function salaryRows(includeSalary: boolean) {
  if (!includeSalary) return "";

  return `
      <tr><td>เงินเดือน</td><td>{{monthlySalary}} บาท ({{monthlySalaryText}})</td></tr>
      <tr><td>รวมรายได้ประจำ</td><td>{{totalMonthlyIncome}} บาท</td></tr>`;
}

function buildTemplateHtml(includeSalary: boolean) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>{{documentTypeName}}</title>
  <style>
    body { font-family: "TH Sarabun New", "Sarabun", Arial, sans-serif; font-size: 18px; line-height: 1.7; color: #0f172a; }
    .letterhead { display: flex; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; }
    .doc-logo { max-height: 68px; max-width: 160px; object-fit: contain; }
    .company-name { font-size: 22px; font-weight: 700; }
    .company-meta { font-size: 15px; color: #475569; margin-top: 2px; }
    .doc-meta { display: flex; justify-content: space-between; font-size: 16px; color: #475569; margin-top: 10px; }
    .title { text-align: center; font-size: 26px; font-weight: 700; margin: 28px 0 20px; }
    .body p { margin: 0 0 10px; text-indent: 48px; }
    .facts { margin: 4px 0 12px; border-collapse: collapse; width: 100%; }
    .facts td { padding: 3px 0; vertical-align: top; }
    .facts td:first-child { width: 190px; color: #475569; }
    .signature { margin-top: 64px; display: flex; justify-content: flex-end; }
    .signature-box { width: 300px; text-align: center; }
    .signature-note { font-size: 15px; color: #475569; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="letterhead">
    {{companyLogoHtml}}
    <div>
      <div class="company-name">{{companyName}}</div>
      <div class="company-meta">{{companyAddress}}</div>
      <div class="company-meta">โทร. {{companyPhone}} · เลขประจำตัวผู้เสียภาษี {{companyTaxId}}</div>
    </div>
  </div>

  <div class="doc-meta">
    <span>เลขที่ {{documentNo}}</span>
    <span>วันที่ {{issuedDate}}</span>
  </div>

  <div class="title">{{documentTypeName}}</div>

  <div class="body">
    <p>
      บริษัท {{companyName}} ขอรับรองว่าบุคคลผู้มีรายนามด้านล่างนี้
      เป็นพนักงานของบริษัท โดยมีรายละเอียดดังนี้
    </p>

    <table class="facts">
      <tr><td>ชื่อ - นามสกุล</td><td>{{employeeName}}</td></tr>
      <tr><td>รหัสพนักงาน</td><td>{{employeeCode}}</td></tr>
      <tr><td>ตำแหน่ง</td><td>{{employeePosition}}</td></tr>
      <tr><td>แผนก</td><td>{{employeeDepartment}}</td></tr>
      <tr><td>สถานที่ปฏิบัติงาน</td><td>{{employeeBranch}}</td></tr>
      <tr><td>วันที่เริ่มงาน</td><td>{{startDate}}</td></tr>
      <tr><td>อายุงาน</td><td>{{serviceDuration}}</td></tr>${salaryRows(includeSalary)}
    </table>

    <p>
      เอกสารฉบับนี้จัดทำขึ้นตามคำขอของพนักงาน เพื่อใช้ประกอบ{{purpose}}
    </p>

    <p>ออกให้ ณ วันที่ {{issuedDate}}</p>
  </div>

  <div class="signature">
    <div class="signature-box">
      <div>ลงชื่อ ..............................................</div>
      <div><strong>( {{signerName}} )</strong></div>
      <div>{{signerPosition}}</div>
      <div class="signature-note">{{signerNote}}</div>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  console.log("📄 Seeding document types and templates...");

  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, nameTh: true },
  });

  if (companies.length === 0) {
    console.log("  ไม่พบบริษัทในระบบ — ข้าม");
    return;
  }

  for (const company of companies) {
    console.log(`\n  บริษัท ${company.code} · ${company.nameTh}`);

    for (const definition of DOCUMENT_TYPES) {
      const existingType = await prisma.documentType.findFirst({
        where: {
          companyId: company.id,
          code: definition.code,
          deletedAt: null,
        },
        select: { id: true },
      });

      const documentType =
        existingType ??
        (await prisma.documentType.create({
          data: {
            companyId: company.id,
            code: definition.code,
            nameTh: definition.nameTh,
            nameEn: definition.nameEn,
            description: definition.description,
            category: definition.category,
            requiresApproval: true,
            approvalLevels: 2,
            allowEmployeeRequest: true,
          },
          select: { id: true },
        }));

      const templateCode = `${definition.code}_DEFAULT`;

      const existingTemplate = await prisma.documentTemplate.findFirst({
        where: {
          companyId: company.id,
          code: templateCode,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existingTemplate) {
        console.log(`    - ${definition.code}: มีอยู่แล้ว ข้าม`);
        continue;
      }

      await prisma.documentTemplate.create({
        data: {
          companyId: company.id,
          documentTypeId: documentType.id,
          code: templateCode,
          name: `${definition.nameTh} (แบบมาตรฐาน)`,
          description: "Template มาตรฐานที่ระบบสร้างให้ แก้ไขได้ที่ตั้งค่าระบบ",
          htmlContent: buildTemplateHtml(definition.includeSalary),
          config: {
            signerName: "",
            signerPosition: "ผู้จัดการฝ่ายทรัพยากรบุคคล",
            signerNote: "เอกสารฉบับนี้มีผลเมื่อประทับตราบริษัท",
            includeSalary: definition.includeSalary,
          },
          status: "ACTIVE",
        },
      });

      console.log(
        `    + ${definition.code}${definition.includeSalary ? " (แสดงเงินเดือน)" : ""}`,
      );
    }
  }

  console.log(
    "\n⚠️  ต้องไปกรอก 'ชื่อผู้ลงนาม' ที่ ตั้งค่าระบบ › แม่แบบเอกสาร ก่อนออกเอกสารจริง",
  );
  console.log("✅ Document master data seeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
