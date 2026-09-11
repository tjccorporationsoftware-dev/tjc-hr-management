/*
 * สร้างช่วงค่าจ้างย้อนหลังให้ครอบคลุมทั้ง 7 งวด พร้อมธง "หักภาษี" และ "หักประกันสังคม"
 * ตามที่ระบบเดิมทำจริง
 *
 * ทำไมต้องคุมสองธงนี้เป็นช่วง ๆ
 *  - ภาษี: ระบบเดิมหักตามที่บันทึกไว้ในไฟล์ (ช่อง ภาษี / หัก ณ ที่จ่าย) ซึ่งนำเข้าเป็น
 *    รายการเฉพาะงวดแล้ว ถ้าปล่อยให้ระบบคำนวณภาษีเองด้วยจะกลายเป็นหักสองต่อ
 *  - ประกันสังคม: 58 คนในไฟล์ไม่ถูกหักเลย (ผู้บริหาร ครอบครัวเจ้าของ นักศึกษาฝึกงาน)
 *    และหลายคนเริ่มถูกหักกลางทาง ต้องตั้งเป็นช่วงตามไฟล์
 *
 * งวดตั้งแต่ ส.ค. 2569 เป็นต้นไปใช้แถวปัจจุบันเหมือนเดิม ไม่กระทบ
 *
 *   node tmp-comphist2.js [--apply]
 */
require('dotenv').config({quiet:true});
const fs=require('fs');const path=require('path');
const {randomUUID}=require('crypto');
const {PrismaClient}=require('../../dist/generated/prisma/client.js');
const p=new PrismaClient();
const apply=process.argv.includes('--apply');
const NOTE='ยกยอดค่าจ้างจากไฟล์ระบบเดิม (นำเข้าย้อนหลัง)';
const PERIODS=[['2026-01','2025-12-26','2026-01-25'],['2026-02','2026-01-26','2026-02-25'],['2026-03','2026-02-26','2026-03-25'],['2026-04','2026-03-26','2026-04-25'],['2026-05','2026-04-26','2026-05-25'],['2026-06','2026-05-26','2026-06-25'],['2026-07','2026-06-26','2026-07-25'],['2026-08','2026-07-26','2026-08-25']];
const AFTER_LAST='2026-08-26';
const dayBefore=d=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()-1);return x.toISOString().slice(0,10);};
(async()=>{
  const file=JSON.parse(fs.readFileSync(path.join(__dirname,'legacy-payroll-file.json'),'utf8'));
  const emps=await p.employee.findMany({where:{deletedAt:null},select:{id:true,employeeCode:true,displayName:true,startDate:true}});
  const byCode=new Map(emps.map(e=>[e.employeeCode,e]));
  if(apply){ const del=await p.employeeCompensation.deleteMany({where:{note:NOTE}}); console.log('ลบของเดิม',del.count,'แถว'); }
  const comps=await p.employeeCompensation.findMany({where:{deletedAt:null,status:'ACTIVE'}});
  const curByEmp=new Map();
  for(const c of comps){ const k=c.employeeId; if(!curByEmp.has(k)||curByEmp.get(k).effectiveDate<c.effectiveDate) curByEmp.set(k,c); }

  let created=0, moved=0; const skipped=[];
  for(const [code,emp] of byCode){
    const series=[];
    for(const [tag,s,e] of PERIODS){
      const row=(file[tag]||[]).find(r=>r.code===code);
      if(!row) continue;
      const rate=row['อัตราค่าจ้าง'], sal=row['เงินเดือน'], paidDays=row['วันทำงาน'];
      if(!rate) continue;
      const isDaily = paidDays>0 && Math.abs(sal-rate*paidDays)<1 && Math.abs(sal-rate)>=1;
      series.push({s,e,rate,basis:isDaily?'DAILY':'MONTHLY',sso:(row['ประกันสังคม']||0)>0});
    }
    if(!series.length) continue;
    const segs=[];
    for(const x of series){
      const last=segs[segs.length-1];
      if(last && last.rate===x.rate && last.basis===x.basis && last.sso===x.sso){ last.e=x.e; continue; }
      segs.push({s:x.s,e:x.e,rate:x.rate,basis:x.basis,sso:x.sso});
    }
    const cur=curByEmp.get(emp.id);
    if(!cur){ skipped.push(`${code} ${emp.displayName}`); continue; }
    const startKey=emp.startDate?emp.startDate.toISOString().slice(0,10):null;
    const clamp=d=>(startKey&&startKey>d)?startKey:d;
    const curKey=cur.effectiveDate.toISOString().slice(0,10);
    /* ทุกงวดย้อนหลังใช้แถวที่สร้างใหม่ทั้งหมด แถวปัจจุบันเลื่อนไปเริ่มงวด ส.ค. */
    const curTarget=clamp(AFTER_LAST);
    const lines=segs.map((seg,i)=>({...seg, endDate: i+1<segs.length ? dayBefore(segs[i+1].s) : dayBefore(curTarget)}))
                    .filter(l=>l.s<=l.endDate);
    if(!lines.length) continue;
    if(apply){
      if(curKey!==curTarget && curKey<curTarget){ await p.employeeCompensation.update({where:{id:cur.id},data:{effectiveDate:new Date(curTarget+'T00:00:00.000Z')}}); moved++; }
      for(const l of lines){
        await p.employeeCompensation.create({data:{
          id:randomUUID(), companyId:cur.companyId, employeeId:emp.id,
          effectiveDate:new Date(l.s+'T00:00:00.000Z'), endDate:new Date(l.endDate+'T00:00:00.000Z'),
          baseSalary:l.rate, salaryBasis:l.basis,
          paymentMethod:cur.paymentMethod, bankName:cur.bankName, bankAccountNo:cur.bankAccountNo, bankAccountName:cur.bankAccountName,
          socialSecurityEnabled:l.sso, taxEnabled:false,
          status:'ACTIVE', approvalStatus:cur.approvalStatus, approvedAt:cur.approvedAt, approvedById:cur.approvedById,
          note:NOTE,
        }});
        created++;
      }
    } else created+=lines.length;
  }
  console.log(apply?'สร้างแถวค่าจ้างย้อนหลัง':'จะสร้าง', created,'แถว · เลื่อนแถวปัจจุบัน',moved,'แถว');
  if(skipped.length) console.log('ข้าม (ไม่มีค่าจ้างในระบบ):',skipped.join(', '));
  if(!apply) console.log('-- พรีวิวเท่านั้น --');
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
