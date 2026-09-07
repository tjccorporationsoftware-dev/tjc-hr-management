/* eslint-disable no-console */
/**
 * ล้างเครื่องหมาย "กำลังประมวลผล" ที่ตกค้าง
 * ----------------------------------------
 * ตอนคำนวณสรุปเวลา ระบบจะปั๊ก marker `attendanceRecalculation.status` ไว้บนแต่ละใบ
 * เป็น PROCESSING แล้วเปลี่ยนเป็น COMPLETED เมื่อคำนวณเสร็จ
 *
 * ถ้ากระบวนการถูกฆ่ากลางคัน (เช่น dev server restart ระหว่างคำนวณ)
 * marker จะค้างที่ PROCESSING ตลอดไป แล้วขั้นตอน "พร้อมเข้าเงินเดือน" จะตีกลับทั้งชุด
 * ด้วยข้อความ "ข้อมูล Attendance มีการเปลี่ยนแปลงและยังคำนวณใหม่ไม่เสร็จ"
 *
 * ตัวตรวจยกเลิกทั้งพนักงานเมื่อเจอใบเดียวที่ค้าง ใบค้าง 91 ใบจึงบล็อกได้ถึง 1,034 ใบ
 *
 * สคริปต์นี้ล้างเฉพาะใบที่คำนวณเสร็จจริงแล้ว (มี calculatedAt) แต่ marker ค้าง
 * ไม่แตะใบที่กำลังคำนวณอยู่จริง
 *
 * รันด้วย: npx tsx scripts/demo/stage5-clear-stale-markers.ts
 */
import { done, prisma, step } from './lib';

async function main() {
  console.log('===== ล้าง marker คำนวณที่ตกค้าง =====');

  step('นับใบที่ค้าง');
  const before = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
    SELECT "policySnapshot"->'attendanceRecalculation'->>'status' AS status,
           count(*) AS count
    FROM attendance_daily_summaries
    WHERE "policySnapshot"->'attendanceRecalculation'->>'status'
          IN ('PENDING', 'PROCESSING', 'RETRYING')
    GROUP BY 1`;
  for (const row of before) {
    console.log(`     ${row.status}: ${Number(row.count)}`);
  }
  if (before.length === 0) {
    done('ไม่มีใบค้าง');
    return;
  }

  step('เปลี่ยนเป็น COMPLETED เฉพาะใบที่คำนวณเสร็จแล้วจริง');
  const updated = await prisma.$executeRaw`
    UPDATE attendance_daily_summaries
    SET "policySnapshot" = jsonb_set(
          "policySnapshot"::jsonb,
          '{attendanceRecalculation,status}',
          '"COMPLETED"'::jsonb,
          true
        )
    WHERE "calculatedAt" IS NOT NULL
      AND "policySnapshot"->'attendanceRecalculation'->>'status'
          IN ('PENDING', 'PROCESSING', 'RETRYING')`;
  done('แก้แล้ว', updated);

  step('ตรวจซ้ำ');
  const after = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM attendance_daily_summaries
    WHERE "policySnapshot"->'attendanceRecalculation'->>'status'
          IN ('PENDING', 'PROCESSING', 'RETRYING')`;
  done('ยังค้างอยู่', Number(after[0]?.count ?? 0));
}

main()
  .catch((error) => {
    console.error('\n❌ ล้มเหลว:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
