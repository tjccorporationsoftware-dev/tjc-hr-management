/*
 * ดูรายละเอียดพรีวิวภาษีของรอบหนึ่ง ใช้ตรวจว่ารายได้ที่เอาไปคิดภาษี
 * นับรายการประจำครบหรือไม่ หลังถอดช่องเบี้ยคงที่ออกจากฐานเงินเดือน
 *
 *   node scripts/check-tax-preview.js <runId>
 */
require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { PrismaService } = require('../dist/database/prisma.service.js');
const {
  PayrollTaxCalculatorService,
} = require('../dist/modules/payroll/services/payroll-tax-calculator.service.js');

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const [runId] = process.argv.slice(2);
    const prisma = app.get(PrismaService);
    const run = await prisma.payrollRun.findFirst({
      where: { id: runId },
      select: { companyId: true },
    });

    const preview = await app.get(PayrollTaxCalculatorService).calculateRunPreview(
      runId,
      {},
      {
        level: 'GLOBAL',
        companyId: run.companyId,
        branchId: null,
        isSuperAdmin: true,
        companyIds: [run.companyId],
      },
    );

    console.log('สรุป', JSON.stringify(preview.summary));
    const items = preview.rows ?? [];
    console.log('จำนวนรายการ', items.length);
    console.log('คีย์ของรายการแรก', Object.keys(items[0] ?? {}).join(', '));

    for (const item of items.slice(0, 3)) {
      console.log('-', JSON.stringify(item).slice(0, 700));
    }
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
