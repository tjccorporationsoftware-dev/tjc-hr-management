/*
 * ล้างข้อมูลงวด ส.ค. 2569 ที่นำเข้าด้วยวิธีเก่า ก่อนนำเข้าใหม่จากไฟล์
 *
 * ของเดิมถูกเขียนเป็น source=SCANNER channel=KIOSK ทั้งที่มาจากไฟล์รายงาน
 * (หมายเหตุระบุไว้ชัด ไม่มี deviceId ไม่มี rawScannerRecordId) และใบลาถูกสร้าง
 * โดยไม่มีเลขที่ใบ ทำให้นำเข้าซ้ำไม่ได้ ต้องล้างก่อนแล้วเข้าไปป์ไลน์เดียวกับงวดอื่น
 *
 * ไม่แตะรอยจากเครื่องสแกนจริง (rawScannerRecordId ไม่ว่าง) และไม่แตะใบที่คนกรอกเอง
 *
 *   node tmp-cleanaug.js [--apply]
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const FROM = new Date('2026-07-26T00:00:00.000Z');
const TO = new Date('2026-08-25T00:00:00.000Z');
const NOTE = 'นำเข้าจากรายงานตารางเวลาการทำงาน 2026-08';

(async () => {
  const logWhere = {
    workDate: { gte: FROM, lte: TO },
    source: 'SCANNER',
    rawScannerRecordId: null,
    note: { startsWith: NOTE },
  };
  const leaveWhere = {
    startDate: { gte: FROM, lte: TO },
    reason: { startsWith: NOTE },
  };
  const otWhere = {
    workDate: { gte: FROM, lte: TO },
    reason: { startsWith: NOTE },
  };

  const counts = {
    รอยตอกบัตร: await p.attendanceLog.count({ where: logWhere }),
    ใบลา: await p.leaveRequest.count({ where: leaveWhere }),
    ใบโอที: await p.overtimeRequest.count({ where: otWhere }),
  };
  console.log('จะลบ:', JSON.stringify(counts));

  const otherOt = await p.overtimeRequest.count({
    where: { workDate: { gte: FROM, lte: TO }, NOT: { reason: { startsWith: NOTE } } },
  });
  const otherLeave = await p.leaveRequest.count({
    where: { startDate: { gte: FROM, lte: TO }, NOT: { reason: { startsWith: NOTE } } },
  });
  console.log(`เหลือไว้ (ไม่ได้มาจากการนำเข้าไฟล์นี้): ใบลา ${otherLeave} · ใบโอที ${otherOt}`);

  if (!apply) {
    console.log('-- พรีวิวเท่านั้น ใส่ --apply เพื่อลบจริง --');
    await p.$disconnect();
    return;
  }

  const a = await p.attendanceLog.deleteMany({ where: logWhere });
  const b = await p.leaveRequest.deleteMany({ where: leaveWhere });
  const c = await p.overtimeRequest.deleteMany({ where: otWhere });
  console.log(`ลบแล้ว · รอย ${a.count} · ใบลา ${b.count} · ใบโอที ${c.count}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
