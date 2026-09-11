/*
 * ปรับสลิปย้อนหลัง 2 ใบให้เงินสมทบประกันสังคมตรงกับ "ยอดที่ยื่นจริง"
 * ตามไฟล์รายงานประกันสังคมของระบบเดิม (docs/ประกันสังคม)
 *
 * เทียบทั้ง 8 เดือนแล้วตรงกัน 6 เดือน เหลือ 2 รายการที่ต่าง ทั้งคู่เกิดตอน
 * ยกยอดเข้ามา แล้วเอาส่วนต่างไปกองไว้ที่ "รายจ่ายอื่นๆ" เพื่อให้ยอดสุทธิตรง
 * ยอดสุทธิของทั้งสองใบจึงไม่เปลี่ยน เปลี่ยนแค่ว่าเงินก้อนนั้นถูกเรียกว่าอะไร
 *
 *   670030 งวด ม.ค. — ระบบคิดค่าจ้าง 23 วัน (11,500) ระบบเดิมจ่าย 22 วัน (11,000)
 *                     ส่วนต่าง 500 ถูกหักคืนเป็นรายจ่ายอื่นๆ 475 + สปส. เกิน 25
 *                     แก้เป็นค่าจ้าง 11,000 / สปส. 550 แล้วลบรายจ่ายอื่นๆ ทิ้ง
 *
 *   680048 งวด พ.ค. — ลาคลอดเกือบทั้งงวด ระบบเดิมนำส่งขั้นต่ำ 83 บาท
 *                     (ฐานค่าจ้างขั้นต่ำ 1,650) ระบบเราคิดจากเงินเดือนเต็ม 700
 *                     แก้เป็น 83 แล้วโยกส่วนต่าง 617 ไปรวมกับรายจ่ายอื่นๆ
 *
 * งวดเหล่านี้สถานะ PAID แล้ว จึงเขียนตรงที่ตาราง ไม่ผ่าน service (ซึ่งจะปฏิเสธ)
 * และไม่แตะข้อมูลลงเวลา เพราะยอดหักขาด/ลาที่คำนวณไว้ยังถูกอยู่
 *
 *   node scripts/legacy-payroll-import/align-sso-with-filed-report.js           พรีวิว
 *   node scripts/legacy-payroll-import/align-sso-with-filed-report.js --apply   เขียนจริง
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const n = (v) => Number(v ?? 0);
const money = (v) => n(v).toFixed(2);

/** สิ่งที่ต้องแก้รายใบ — คิดมาแล้วว่ายอดสุทธิไม่ขยับ */
const PLAN = [
  {
    period: 'PAY-2569-01',
    code: '670030',
    baseSalary: 11000,
    lines: [
      { code: 'BASE_SALARY', amount: 11000 },
      { code: 'SOCIAL_SECURITY', amount: 550, quantity: 11000 },
      { code: 'SOCIAL_SECURITY_EMPLOYER', amount: 550, quantity: 11000 },
      { code: 'OTHER_DEDUCTION', remove: true },
    ],
  },
  {
    period: 'PAY-2569-05',
    code: '680048',
    lines: [
      { code: 'SOCIAL_SECURITY', amount: 83, quantity: 1650 },
      { code: 'SOCIAL_SECURITY_EMPLOYER', amount: 83, quantity: 1650 },
      { code: 'OTHER_DEDUCTION', amount: 2333.35 },
    ],
  },
];

(async () => {
  for (const plan of PLAN) {
    const item = await p.payrollItem.findFirst({
      where: {
        employee: { employeeCode: plan.code },
        run: { period: { code: plan.period } },
        status: { not: 'CANCELLED' },
      },
      include: { lines: true, run: true, employee: { select: { displayName: true } } },
    });
    if (!item) { console.log(`${plan.period} ${plan.code} — ไม่พบสลิป`); continue; }

    console.log(`\n### ${plan.period} · ${plan.code} ${item.employee.displayName} (${item.run.status})`);
    console.log(`   ก่อนแก้: รายรับ ${money(item.totalEarnings)} · รายจ่าย ${money(item.totalDeductions)} · สุทธิ ${money(item.totalNetPay)}`);

    let dEarnings = 0;
    let dDeductions = 0;
    const ops = [];

    for (const change of plan.lines) {
      const line = item.lines.find((l) => l.code === change.code);
      if (!line) { console.log(`   !! ไม่พบบรรทัด ${change.code}`); continue; }
      const before = n(line.amount);
      const after = change.remove ? 0 : n(change.amount);
      const delta = after - before;

      if (line.type === 'EARNING') dEarnings += delta;
      else if (line.type === 'DEDUCTION') dDeductions += delta;

      console.log(
        `   ${change.remove ? 'ลบ  ' : 'แก้ '}${line.code.padEnd(26)} ${money(before)} -> ${change.remove ? '(ไม่มี)' : money(after)}` +
        (change.quantity !== undefined ? ` · ฐาน ${n(line.quantity)} -> ${change.quantity}` : ''),
      );

      ops.push(
        change.remove
          ? p.payrollLine.delete({ where: { id: line.id } })
          : p.payrollLine.update({
              where: { id: line.id },
              data: {
                amount: change.amount,
                ...(change.quantity !== undefined ? { quantity: change.quantity } : {}),
              },
            }),
      );
    }

    const net = dEarnings - dDeductions;
    console.log(`   หลังแก้: รายรับ ${money(n(item.totalEarnings) + dEarnings)} · รายจ่าย ${money(n(item.totalDeductions) + dDeductions)} · สุทธิ ${money(n(item.totalNetPay) + net)}`);
    if (Math.abs(net) > 0.004) { console.log('   !! ยอดสุทธิเปลี่ยน — ไม่ทำต่อ'); continue; }

    if (!apply) continue;

    ops.push(
      p.payrollItem.update({
        where: { id: item.id },
        data: {
          ...(plan.baseSalary !== undefined ? { baseSalary: plan.baseSalary } : {}),
          totalEarnings: n(item.totalEarnings) + dEarnings,
          totalGrossPay: n(item.totalGrossPay) + dEarnings,
          totalDeductions: n(item.totalDeductions) + dDeductions,
        },
      }),
      p.payrollRun.update({
        where: { id: item.runId },
        data: {
          totalEarnings: n(item.run.totalEarnings) + dEarnings,
          totalGrossPay: n(item.run.totalGrossPay) + dEarnings,
          totalDeductions: n(item.run.totalDeductions) + dDeductions,
        },
      }),
    );
    await p.$transaction(ops);
    console.log('   เขียนแล้ว');
  }

  if (!apply) console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
