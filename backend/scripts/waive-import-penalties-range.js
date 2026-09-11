/*
 * ยกเว้นค่าปรับ "ลืมสแกน" ทุกรอบ และ "ค่าปรับช่วงบ่าย" (สายบ่าย + ลืมสแกนบ่าย)
 * เฉพาะช่วงวันที่ที่นำเข้าจากไฟล์ระบบเดิม
 *
 * ผู้ใช้สั่ง 2569-09-08: ข้อมูลที่ยกมาจากไฟล์ยังไม่ต้องคิดสองอย่างนี้
 * ส่วนการลงเวลาปกติของระบบให้หักตามเดิม จึงตั้งธงที่สรุปเวลารายวันเป็นช่วง ๆ ไป
 * ธงนี้รอดจากการคำนวณใหม่ (applyMissingLogPenaltyWaiver / waiveAfternoonPenalty)
 *
 *   node scripts/... <from> <to> [--undo]
 */
require('dotenv').config({quiet:true});
const {PrismaClient}=require('../dist/generated/prisma/client.js');
const p=new PrismaClient();
const REASON='ข้อมูลนำเข้าจากไฟล์ระบบเดิม — ไม่คิดค่าปรับลืมสแกนและค่าปรับช่วงบ่าย';
(async()=>{
  const [from,to]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
  const undo=process.argv.includes('--undo');
  if(!from||!to) throw new Error('ต้องระบุช่วงวันที่');
  const where={workDate:{gte:new Date(`${from}T00:00:00.000Z`),lte:new Date(`${to}T00:00:00.000Z`)}};
  const before=await p.attendanceDailySummary.count({where});
  const r=await p.attendanceDailySummary.updateMany({
    where,
    data: undo
      ? {missingLogPenaltyWaived:false, afternoonPenaltyWaived:false, penaltyWaivedReason:null, afternoonPenaltyWaivedReason:null, penaltyWaivedAt:null}
      : {missingLogPenaltyWaived:true, afternoonPenaltyWaived:true, penaltyWaivedReason:REASON, afternoonPenaltyWaivedReason:REASON, penaltyWaivedAt:new Date()},
  });
  console.log(`แถวในช่วง ${before} · ตั้งธง${undo?'คืน':'ยกเว้น'}แล้ว ${r.count}`);
  console.log('ต้องสั่งคำนวณสรุปเวลารายวันของช่วงนี้ใหม่ ยอดถึงจะเปลี่ยน');
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
