/*
 * คำนวณรอบเงินเดือนใหม่จากบรรทัดคำสั่ง
 *
 * ใช้ตอนแก้ข้อมูลตั้งต้น (รายการประจำ/adjustment) แล้วอยากเห็นผลทันที
 * โดยไม่ต้องเข้าหน้าเว็บ — เรียก service ตัวเดียวกับที่ปุ่ม "คำนวณ" เรียก
 *
 *   node scripts/recalc-payroll-run.js <runId> <companyId>
 */
require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { PayrollService } = require('../dist/modules/payroll/payroll.service.js');

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const [runId, companyId] = process.argv.slice(2);
    const service = app.get(PayrollService);
    const scope = {
      companyId,
      branchId: null,
      isSuperAdmin: true,
      companyIds: [companyId],
    };

    const result = await service.calculateRun(runId, scope, {}, undefined, {
      responseMode: 'summary',
    });

    console.log('รวมรายรับ', String(result?.totalEarnings ?? '-'));
    console.log('รวมรายหัก', String(result?.totalDeductions ?? '-'));
    console.log('ยอดสุทธิ', String(result?.totalNetPay ?? '-'));
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
