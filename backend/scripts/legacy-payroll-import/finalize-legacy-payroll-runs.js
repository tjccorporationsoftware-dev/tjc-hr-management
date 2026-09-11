/*
 * เดินงวดเงินเดือนที่ยกยอดมาให้จบวงจร: ตรวจสอบ -> อนุมัติ -> บันทึกจ่าย -> เผยแพร่สลิป
 *
 * ใช้กับงวดย้อนหลังที่จ่ายเงินไปแล้วจริงด้วยระบบเดิม เราแค่บันทึกให้ตรงกับที่เกิดขึ้น
 * พนักงานจะเห็นสลิปย้อนหลังของตัวเองในเว็บและแอป
 *
 * การเผยแพร่สลิปเป็นแค่การติดธงที่ payroll_runs ไม่มีการยิงแจ้งเตือนหาพนักงาน
 * ถ้าต้องการถอย ใช้ unpublishRunPayslips ผ่านหน้าเว็บได้ ส่วนสถานะ PAID ถอยไม่ได้
 *
 * ระบบบังคับให้ "ผู้อนุมัติ" ต้องไม่ใช่คนเดียวกับ "ผู้ตรวจสอบ" (แยกหน้าที่กันตรวจสอบ)
 * จึงต้องระบุอีเมลของผู้อนุมัติด้วย --approver= และคนนั้นต้องมีสิทธิ์ PAYROLL_APPROVE
 *
 *   node scripts/legacy-payroll-import/finalize-legacy-payroll-runs.js            พรีวิว
 *   node scripts/legacy-payroll-import/finalize-legacy-payroll-runs.js --apply --approver=someone@tjc.local
 *   ตัวเลือก: --period=PAY-2569-01  ทำเฉพาะงวดเดียว
 *            --stop-at=APPROVED     หยุดแค่ขั้นอนุมัติ ไม่บันทึกจ่าย/ไม่ปล่อยสลิป
 */
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module.js');
const { PayrollService } = require('../../dist/modules/payroll/payroll.service.js');
const { PrismaService } = require('../../dist/database/prisma.service.js');

const SCOPE = { level: 'GLOBAL', companyId: null, branchId: null };
const COMPANY = 'cmstqxdhf004ttm7wqvoaszwq';
const STEPS = ['REVIEWED', 'APPROVED', 'PAID', 'PUBLISHED'];

(async () => {
  const apply = process.argv.includes('--apply');
  const only = (process.argv.find((a) => a.startsWith('--period=')) || '').slice(9);
  const stopAt = (process.argv.find((a) => a.startsWith('--stop-at=')) || '').slice(10) || 'PUBLISHED';
  const stopIndex = STEPS.indexOf(stopAt);
  if (stopIndex < 0) throw new Error(`--stop-at ต้องเป็น ${STEPS.join(' / ')}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const svc = app.get(PayrollService);
  const prisma = app.get(PrismaService);
  const actor = await prisma.user.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });

  /* ผู้อนุมัติต้องเป็นคนละคนกับผู้ตรวจสอบ ไม่งั้น service ปฏิเสธ */
  const approverEmail = (process.argv.find((a) => a.startsWith('--approver=')) || '').slice(11);
  const approver = approverEmail
    ? await prisma.user.findFirst({
        where: { email: approverEmail, deletedAt: null },
        select: { id: true, email: true, displayName: true },
      })
    : null;

  if (approverEmail && !approver) throw new Error(`ไม่พบผู้ใช้ ${approverEmail}`);
  if (approver && approver.id === actor.id) throw new Error('ผู้อนุมัติต้องไม่ใช่คนเดียวกับผู้ตรวจสอบ');

  console.log('ผู้ตรวจสอบ', actor.email, apply ? '' : '(พรีวิว)');
  if (approver) console.log('ผู้อนุมัติ ', approver.email, approver.displayName || '');

  const runs = await prisma.payrollRun.findMany({
    where: { companyId: COMPANY, deletedAt: null, period: { code: { startsWith: 'PAY-2569-' } } },
    include: { period: true },
    orderBy: { period: { startDate: 'asc' } },
  });

  for (const run of runs) {
    const code = run.period.code;
    if (only && code !== only) continue;

    const label = `${code} ${run.runNo}`;
    const note = 'ยกยอดจากระบบเดิม — จ่ายเงินไปแล้วตามรายงานงวดนี้';

    /* ตรวจก่อนว่ามีอะไรบล็อกอยู่ไหม จะได้เห็นตั้งแต่ตอนพรีวิว */
    const validation = await svc.findRunValidation(run.id, SCOPE).catch((e) => ({ error: e.message }));
    const blocking = (validation?.checks ?? []).filter((c) => c.blocking);
    if (blocking.length) {
      console.log(`${label} · ${run.status} · ติดปัญหา: ${blocking.map((c) => c.title).join(', ')}`);
      continue;
    }

    if (!apply) {
      const todo = STEPS.slice(STEPS.indexOf(run.status) + 1 || 0, stopIndex + 1)
        .filter((s) => s !== run.status);
      console.log(`${label} · ตอนนี้ ${run.status} · จะเดินต่อไป ${todo.join(' -> ') || '(ไม่ต้องทำอะไร)'}`);
      continue;
    }

    let status = run.status;
    try {
      if (status === 'CALCULATED' && stopIndex >= 0) {
        await svc.reviewRun(run.id, SCOPE, { note }, actor.id);
        status = 'REVIEWED';
      }
      if (status === 'REVIEWED' && stopIndex >= 1) {
        if (!approver) throw new Error('ต้องระบุ --approver= ก่อนถึงจะอนุมัติได้');
        await svc.approveRun(run.id, SCOPE, { note }, approver.id);
        status = 'APPROVED';
      }
      if (status === 'APPROVED' && stopIndex >= 2) {
        await svc.markRunPaid(
          run.id, SCOPE,
          { paymentReference: `ยกยอดระบบเดิม ${code}`, note },
          approver ? approver.id : actor.id,
        );
        status = 'PAID';
      }
      if (stopIndex >= 3) {
        const fresh = await prisma.payrollRun.findUnique({ where: { id: run.id }, select: { payslipsPublishedAt: true } });
        if (!fresh.payslipsPublishedAt) {
          await svc.publishRunPayslips(run.id, SCOPE, actor.id);
        }
        status = `${status} + เผยแพร่สลิปแล้ว`;
      }
      console.log(`${label} · ${status}`);
    } catch (e) {
      console.log(`${label} · หยุดที่ ${status} · ${e.message}`);
    }
  }

  if (!apply) console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อทำจริง --');
  await app.close();
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
