/*
 * ปิดส่วนต่างที่เหลือของแต่ละคนแต่ละงวด ให้เงินสุทธิตรงกับรายงานระบบเดิมทุกบาท
 *
 * ใช้หลังแก้ความต่างเชิงโครงสร้างครบแล้ว (ประวัติค่าจ้าง · ฐานประกันสังคม ·
 * ประเภทโอที · รายการประจำที่หักซ้ำ · ภาษีตามไฟล์) ที่เหลือคือความต่างที่มา
 * จากกติกาของระบบเดิมที่คำนวณย้อนกลับไม่ได้ เช่น
 *   - พนักงานรายวัน ระบบเดิมกำหนดจำนวนวันจ่ายเอง แล้วหักขาดงานแยกอีกชั้น
 *   - ระบบเดิมนับเศษนาที 1-6 นาทีเป็นขาดงาน คิดเป็นเงินหลักสิบสตางค์
 *   - ใบลาคลอดที่ระบบเดิมหักเต็มเดือน
 *
 * ลงเป็นรายการเดียวต่อคนต่องวด พร้อมหมายเหตุบอกว่าช่องไหนต่างเท่าไร
 * เพื่อให้ตรวจย้อนได้ว่าเงินก้อนนี้มาจากอะไร
 *
 *   node tmp-fixresidual.js [--apply]
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const COMPANY = 'cmstqxdhf004ttm7wqvoaszwq';
const REASON = 'ปรับส่วนต่างให้ตรงกับรายงานระบบเดิม';
const MAP = {
  'PAY-2569-01': '2026-01',
  'PAY-2569-02': '2026-02',
  'PAY-2569-03': '2026-03',
  'PAY-2569-04': '2026-04',
  'PAY-2569-05': '2026-05',
  'PAY-2569-06': '2026-06',
  'PAY-2569-07': '2026-07',
  'PAY-2569-08': '2026-08',
};
const GROUPS = [
  ['เงินเดือน', ['BASE_SALARY']],
  ['โอที', ['OVERTIME_PAY', 'OT_HOLIDAY', 'OT_SPECIAL_HOLIDAY']],
  ['สาย', ['LATE_DEDUCTION']],
  ['กลับก่อน', ['EARLY_LEAVE_DEDUCTION']],
  ['ลางาน', ['UNPAID_LEAVE_DEDUCTION', 'ATTENDANCE_UNPAID_LEAVE_DEDUCTION', 'ATTENDANCE_UNPAID_LEAVE_RECONCILE']],
  ['ขาดงาน', ['ABSENCE_DEDUCTION']],
  ['ประกันสังคม', ['SOCIAL_SECURITY']],
];
const FILE_OF = {
  เงินเดือน: (r) => r['เงินเดือน'] || 0,
  โอที: (r) => (r['โอทีล่วงเวลา(x1.0)'] || 0) + (r['โอทีล่วงเวลาวันหยุด(x1.5)'] || 0),
  สาย: (r) => r['สาย'] || 0,
  กลับก่อน: (r) => r['กลับก่อน'] || 0,
  ลางาน: (r) => r['ลางาน'] || 0,
  ขาดงาน: (r) => r['ขาดงาน'] || 0,
  ประกันสังคม: (r) => r['ประกันสังคม'] || 0,
};
const num = (v) => Math.round((Number(v) || 0) * 100) / 100;

(async () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname,'legacy-payroll-file.json'), 'utf8'));
  const comps = await p.payrollComponent.findMany({
    where: { deletedAt: null, companyId: COMPANY, code: { in: ['RETRO_PAY', 'OTHER_DEDUCTION'] } },
  });
  const byCode = new Map(comps.map((c) => [c.code, c]));

  let total = 0;
  let sum = 0;
  for (const [pcode, tag] of Object.entries(MAP)) {
    const period = await p.payrollPeriod.findFirst({ where: { code: pcode, companyId: COMPANY, deletedAt: null } });
    if (!period) continue;

    /*
     * ต้องอ่านผลคำนวณ "ก่อน" ลบของเดิมเสมอ
     *
     * ถ้าลบก่อนอ่าน ตัวเลขที่อ่านได้ยังเป็นผลที่รวมรายการเดิมไว้แล้ว (ยังไม่ได้คำนวณใหม่)
     * ส่วนต่างจึงกลายเป็น 0 แล้วไม่สร้างอะไรเลย พอสั่งคำนวณใหม่ยอดก็หลุดทั้งงวด
     * เคยพลาดมาแล้วตอนเพิ่มงวด ส.ค. 2569
     */

    const lines = await p.$queryRawUnsafe(
      `SELECT e."employeeCode" code, l.code lc, SUM(l.amount)::float amt
       FROM payroll_lines l JOIN payroll_items i ON i.id=l."payrollItemId"
       JOIN payroll_runs r ON r.id=i."runId" JOIN payroll_periods pp ON pp.id=r."periodId"
       JOIN employees e ON e.id=i."employeeId"
       WHERE pp.code=$1 AND r."deletedAt" IS NULL AND l.type<>'EMPLOYER_CONTRIBUTION' GROUP BY 1,2`,
      pcode,
    );
    const sys = new Map();
    for (const l of lines) {
      if (!sys.has(l.code)) sys.set(l.code, {});
      sys.get(l.code)[l.lc] = num(l.amt);
    }

    const totals = await p.$queryRawUnsafe(
      `SELECT e.id eid, e."employeeCode" code, i."totalNetPay"::float np
       FROM payroll_items i JOIN payroll_runs r ON r.id=i."runId" JOIN payroll_periods pp ON pp.id=r."periodId"
       JOIN employees e ON e.id=i."employeeId" WHERE pp.code=$1 AND r."deletedAt" IS NULL`,
      pcode,
    );

    /*
     * หักผลของ "รายการปรับส่วนต่าง" ที่เคยลงไว้ออกจากยอดสุทธิก่อนเทียบ
     *
     * ไม่งั้นงวดที่เคยปิดส่วนต่างไปแล้วจะอ่านได้ว่าต่าง 0 แล้วไม่สร้างอะไรใหม่
     * พอสคริปต์ลบของเดิมทิ้ง ยอดทั้งงวดก็หลุดกลับไปเพี้ยนเหมือนเดิม
     */
    const prevRows = await p.$queryRawUnsafe(
      `SELECT e."employeeCode" code, a.type, SUM(a.amount)::float s
       FROM payroll_adjustments a JOIN employees e ON e.id=a."employeeId"
       WHERE a."periodId"=$1 AND a.reason=$2 GROUP BY 1,2`,
      period.id, REASON,
    );
    const prevNet = new Map();
    for (const r of prevRows) {
      const sign = r.type === 'EARNING' ? 1 : -1;
      prevNet.set(r.code, num((prevNet.get(r.code) || 0) + sign * r.s));
    }

    if (apply) {
      const del = await p.payrollAdjustment.deleteMany({ where: { periodId: period.id, reason: REASON } });
      if (del.count) console.log(tag, 'ลบของเดิม', del.count);
    }

    for (const t of totals) {
      const fr = (file[tag] || []).find((x) => x.code === t.code);
      if (!fr) continue;
      const baseNet = num(num(t.np) - (prevNet.get(t.code) || 0));
      const diff = num(num(fr['คงเหลือ']) - baseNet);
      if (Math.abs(diff) < 0.01) continue;

      const why = [];
      const s = sys.get(t.code) || {};
      for (const [label, codes] of GROUPS) {
        const f = num(FILE_OF[label](fr));
        const y = num(codes.reduce((a, c) => a + (s[c] || 0), 0));
        if (Math.abs(f - y) >= 0.01) why.push(`${label} ไฟล์ ${f} ระบบ ${y}`);
      }

      const isEarn = diff > 0;
      const comp = byCode.get(isEarn ? 'RETRO_PAY' : 'OTHER_DEDUCTION');
      const amount = Math.abs(diff);
      total += 1;
      sum += amount;
      if (!apply) {
        console.log(tag, t.code, isEarn ? '+' : '-', amount, '·', why.join(' | ') || 'ยอดรวมต่าง');
        continue;
      }
      await p.payrollAdjustment.create({
        data: {
          id: randomUUID(),
          companyId: COMPANY,
          employeeId: t.eid,
          periodId: period.id,
          componentId: comp.id,
          code: comp.code,
          name: isEarn ? 'ปรับส่วนต่างตามรายงานระบบเดิม' : 'ปรับส่วนต่างตามรายงานระบบเดิม (จ่ายเกิน)',
          type: isEarn ? 'EARNING' : 'DEDUCTION',
          sourceType: 'ADJUSTMENT',
          quantity: 1,
          rate: amount,
          amount,
          effectiveDate: period.endDate,
          isTaxable: false,
          isSocialSecurityBase: false,
          status: 'APPROVED',
          approvedAt: new Date(),
          reason: REASON,
          note: why.join(' | ') || 'ยอดรวมต่างจากรายงานระบบเดิม',
          sortOrder: 900,
        },
      });
    }
  }

  console.log('\nรวม', total, 'รายการ · ยอดรวม', Math.round(sum * 100) / 100);
  if (!apply) console.log('-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
  await p.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
