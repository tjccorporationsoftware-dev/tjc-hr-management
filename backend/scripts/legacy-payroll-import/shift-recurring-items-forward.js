/*
 * เลื่อนวันมีผลของรายการค่าตอบแทนประจำ (ค่าตำแหน่ง/ค่าโทรศัพท์/ค่าเช่าห้อง ฯลฯ)
 * ให้เริ่มที่งวด ส.ค. 2569 เป็นต้นไป
 *
 * เหตุผล: 7 งวดย้อนหลังยกยอดจากไฟล์ระบบเดิมเป็นรายการเฉพาะงวดทั้งหมด
 * ถ้าปล่อยรายการประจำให้มีผลย้อนหลังด้วยจะได้เงินซ้ำสองทาง
 * วันมีผลเดิมเก็บไว้ในหมายเหตุ ย้อนกลับได้
 */
require('dotenv').config({quiet:true});
const {PrismaClient}=require('../../dist/generated/prisma/client.js');const p=new PrismaClient();
const apply=process.argv.includes('--apply');
const NEW_DATE='2026-08-26';
(async()=>{
  const items=await p.employeeCompensationItem.findMany({where:{deletedAt:null,effectiveDate:{lt:new Date(NEW_DATE+'T00:00:00.000Z')}}});
  console.log('รายการประจำที่มีผลก่อน',NEW_DATE,':',items.length);
  const byCode={}; items.forEach(i=>{byCode[i.code]=(byCode[i.code]||0)+Number(i.amount)});
  console.log(JSON.stringify(byCode));
  if(!apply){console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');await p.$disconnect();return;}
  let n=0;
  for(const it of items){
    const old=it.effectiveDate.toISOString().slice(0,10);
    const keep=(it.note||'').includes('วันมีผลเดิม')?it.note:`${it.note?it.note+' · ':''}วันมีผลเดิม ${old} (เลื่อนมาที่ ${NEW_DATE} ตอนยกยอด 7 งวดย้อนหลัง)`;
    await p.employeeCompensationItem.update({where:{id:it.id},data:{effectiveDate:new Date(NEW_DATE+'T00:00:00.000Z'),note:keep}});
    n++;
  }
  console.log('เลื่อนแล้ว',n,'รายการ');
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
