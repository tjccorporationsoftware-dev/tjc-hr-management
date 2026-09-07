/**
 * เติมรายการสแกนเข้าช่วงบ่ายให้ข้อมูลที่สร้างไว้แล้ว
 * ---------------------------------------------------
 * นโยบายเวลาทำงานตั้ง missingPenaltyMode เป็น PER_SESSION และกำหนด
 * afternoonCheckInDeadline ไว้ ระบบจึงคาดว่าต้องมีสแกนเข้า 2 ช่วงต่อวัน
 *
 * ตอนสร้างข้อมูลรอบแรกมีแค่สแกนเช้ากับสแกนออก ทำให้ทุกวันติดว่าขาดสแกน
 * แล้วสรุปรายวันค้างสถานะต้องตรวจสอบ จนคำนวณเงินเดือนไม่ผ่าน
 *
 * สคริปต์นี้เติมเฉพาะวันที่มีสแกนเช้าแล้วแต่ยังไม่มีของช่วงบ่าย
 * (stage2 แก้ให้สร้างตั้งแต่แรกแล้ว ตัวนี้ไว้ซ่อมข้อมูลชุดที่สร้างไปก่อนหน้า)
 *
 * รันด้วย: npx tsx scripts/demo/stage2b-afternoon-punch.ts
 */
import { atBangkokTime, done, prisma, randInt, step } from './lib';

async function main() {
  console.log('===== เติมสแกนเข้าช่วงบ่าย =====');

  step('หาวันที่มีสแกนเช้าแล้วแต่ยังไม่มีสแกนบ่าย');
  const rows = await prisma.$queryRaw<
    {
      employeeId: string;
      workDate: Date;
      channel: string;
      locationId: string | null;
    }[]
  >`
    SELECT l."employeeId",
           l."workDate",
           MIN(l."channel"::text)   AS channel,
           MIN(l."locationId")      AS "locationId"
    FROM attendance_logs l
    WHERE l."logType" = 'CHECK_IN'
    GROUP BY l."employeeId", l."workDate"
    HAVING count(*) FILTER (WHERE l."session" = 'AFTERNOON') = 0`;
  done('วันที่ต้องเติม', rows.length);

  step('เขียนรายการสแกนบ่าย');
  const data = rows.map((r) => ({
    employeeId: r.employeeId,
    workDate: r.workDate,
    logType: 'CHECK_IN' as const,
    // กลับจากพักเที่ยงช่วง 12:35-12:58 ก่อนกำหนด 13:00
    logTime: atBangkokTime(r.workDate, 12, randInt(35, 58)),
    channel: (r.channel ?? 'WEB') as 'WEB' | 'MOBILE' | 'DEVICE',
    source: r.channel ?? 'WEB',
    locationId: r.locationId,
    session: 'AFTERNOON',
  }));

  const CHUNK = 2000;
  for (let i = 0; i < data.length; i += CHUNK) {
    await prisma.attendanceLog.createMany({ data: data.slice(i, i + CHUNK) });
  }
  done('เพิ่มแล้ว', data.length);

  const total = await prisma.attendanceLog.count();
  done('รายการลงเวลาทั้งหมดตอนนี้', total);
}

main()
  .catch((error) => {
    console.error('\n❌ ล้มเหลว:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
