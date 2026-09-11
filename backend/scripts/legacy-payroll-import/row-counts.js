/*
 * นับจำนวนแถวของตารางหลัก ไว้เทียบก่อน/หลังย้ายข้อมูลขึ้นเครื่องจริง
 *
 *   node scripts/legacy-payroll-import/row-counts.js [> ไฟล์.txt]
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const TABLES = [
  'employees',
  'employee_compensations',
  'employee_compensation_items',
  'employee_deduction_plans',
  'attendance_logs',
  'attendance_daily_summaries',
  'leave_requests',
  'overtime_requests',
  'holiday_swaps',
  'holiday_calendars',
  'payroll_periods',
  'payroll_runs',
  'payroll_items',
  'payroll_lines',
  'payroll_adjustments',
  'leave_balances',
  "User",
  '_prisma_migrations',
];

(async () => {
  for (const t of TABLES) {
    const r = await p.$queryRawUnsafe(`SELECT count(*)::int c FROM "${t}"`).catch(() => [{ c: 'ไม่มีตาราง' }]);
    console.log(`${t}=${r[0].c}`);
  }
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
