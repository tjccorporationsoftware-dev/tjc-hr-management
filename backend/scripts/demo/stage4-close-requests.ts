/**
 * ปิดคำขอที่ยังค้างอยู่ในงวดที่จบไปแล้ว
 * ------------------------------------
 * ของจริง HR ต้องเคลียร์ใบลา / OT / คำขอแก้เวลาให้จบก่อนปิดงวด
 * ระบบถึงจะยอมให้คำนวณเงินเดือน — ตัวตรวจความพร้อมบังคับไว้แล้ว
 *
 * คำขอในงวดที่ยังเดินอยู่ (ตั้งแต่ 26 ก.ค. เป็นต้นไป) ปล่อยค้างไว้ตามจริง
 * เพื่อให้เห็นหน้าจอรออนุมัติและหน้าตรวจสอบก่อนเข้าเงินเดือนว่าทำงาน
 *
 * รันด้วย: npx tsx scripts/demo/stage4-close-requests.ts
 */
import { atBangkokTime, dateOnly, done, prisma, step } from './lib';

/** วันแรกของงวดที่ยังเดินอยู่ — อะไรที่ก่อนหน้านี้ถือว่าต้องปิดให้จบ */
const CURRENT_PERIOD_START = dateOnly('2026-07-26');

async function main() {
  console.log('===== ปิดคำขอค้างของงวดที่จบแล้ว =====');

  /* ---------- ใบลา ---------- */
  step('ใบลาที่ยังรออนุมัติในงวดที่ปิดแล้ว');
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      status: 'SUBMITTED',
      startDate: { lt: CURRENT_PERIOD_START },
      deletedAt: null,
    },
    select: {
      id: true,
      employeeId: true,
      leaveTypeId: true,
      totalDays: true,
      startDate: true,
    },
  });

  for (const lv of leaves) {
    const days = Number(lv.totalDays);
    await prisma.leaveRequest.update({
      where: { id: lv.id },
      data: {
        status: 'APPROVED',
        approvedAt: atBangkokTime(lv.startDate, 15, 0),
        note: 'อนุมัติตอนปิดงวด',
      },
    });

    /*
     * ย้ายจำนวนวันจากช่องกันไว้ไปเป็นใช้จริง
     * ถ้าไม่ย้าย ยอดคงเหลือจะถูกหักสองรอบ เพราะตอนสร้างใบลานับเป็น pending ไว้แล้ว
     */
    await prisma.leaveBalance.updateMany({
      where: {
        employeeId: lv.employeeId,
        leaveTypeId: lv.leaveTypeId,
        year: 2026,
      },
      data: {
        pendingDays: { decrement: days },
        usedDays: { increment: days },
      },
    });
  }
  done('อนุมัติแล้ว', leaves.length);

  /* ---------- คำขอ OT ---------- */
  step('คำขอ OT ที่ยังรออนุมัติในงวดที่ปิดแล้ว');
  const ot = await prisma.overtimeRequest.updateMany({
    where: {
      status: 'SUBMITTED',
      workDate: { lt: CURRENT_PERIOD_START },
      deletedAt: null,
    },
    data: { status: 'APPROVED', note: 'อนุมัติตอนปิดงวด' },
  });
  done('อนุมัติแล้ว', ot.count);

  /* ---------- คำขอแก้เวลา ---------- */
  step('คำขอแก้ไขเวลาที่ยังรออนุมัติในงวดที่ปิดแล้ว');
  const ta = await prisma.timeAdjustRequest.updateMany({
    where: {
      status: 'SUBMITTED',
      requestedLogTime: { lt: CURRENT_PERIOD_START },
      deletedAt: null,
    },
    data: { status: 'APPROVED', note: 'อนุมัติตอนปิดงวด' },
  });
  done('อนุมัติแล้ว', ta.count);

  /* ---------- ที่ยังค้างในงวดปัจจุบัน ---------- */
  step('คงเหลือค้างในงวดที่กำลังเดิน (ตั้งใจให้ค้างไว้)');
  const restLeave = await prisma.leaveRequest.count({
    where: { status: 'SUBMITTED', deletedAt: null },
  });
  const restOt = await prisma.overtimeRequest.count({
    where: { status: 'SUBMITTED', deletedAt: null },
  });
  const restTa = await prisma.timeAdjustRequest.count({
    where: { status: 'SUBMITTED', deletedAt: null },
  });
  done('ใบลารออนุมัติ', restLeave);
  done('คำขอ OT รออนุมัติ', restOt);
  done('คำขอแก้เวลารออนุมัติ', restTa);
}

main()
  .catch((error) => {
    console.error('\n❌ ล้มเหลว:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
