/*
 * นำเข้า "รายการเสริมเฉพาะงวด" จากไฟล์รายงานผลการคำนวณเงินเดือนสุทธิของระบบเดิม
 *
 * ช่องที่ระบบนี้คำนวณเองอยู่แล้ว (เงินเดือน โอที สาย ลา ขาด ประกันสังคม) ไม่นำเข้า
 * ที่เหลือเป็นข้อเท็จจริงเฉพาะงวดที่ระบบหาเองไม่ได้ เช่น เบี้ยเลี้ยง กยศ. ค่าปรับ
 * ลงเป็น payroll_adjustments สถานะ APPROVED ให้ตอนคำนวณ run ดึงไปใช้
 *
 *   node tmp-impadj.js            พรีวิว
 *   node tmp-impadj.js --apply    เขียนจริง
 */
require('dotenv').config({quiet:true});
const fs=require('fs');const path=require('path');
const {randomUUID}=require('crypto');
const map=require('./legacy-payroll-column-map.js');
const {PrismaClient}=require('../../dist/generated/prisma/client.js');
const p=new PrismaClient();
const apply=process.argv.includes('--apply');
const COMPANY='cmstqxdhf004ttm7wqvoaszwq';
const PERIODS={'2026-01':'PAY-2569-01','2026-02':'PAY-2569-02','2026-03':'PAY-2569-03','2026-04':'PAY-2569-04','2026-05':'PAY-2569-05','2026-06':'PAY-2569-06','2026-07':'PAY-2569-07','2026-08':'PAY-2569-08'};
const REASON_PREFIX='นำเข้าจากรายงานผลการคำนวณเงินเดือนสุทธิ ';
(async()=>{
  const file=JSON.parse(fs.readFileSync(path.join(__dirname,'legacy-payroll-file.json'),'utf8'));
  const emps=await p.employee.findMany({where:{deletedAt:null},select:{id:true,employeeCode:true}});
  const byCode=new Map(emps.map(e=>[e.employeeCode,e.id]));
  const comps=await p.payrollComponent.findMany({where:{deletedAt:null,companyId:COMPANY}});
  const byComp=new Map(comps.map(c=>[c.code,c]));
  const periods=await p.payrollPeriod.findMany({where:{companyId:COMPANY,deletedAt:null}});
  const byPeriod=new Map(periods.map(x=>[x.code,x]));
  let total=0; const perPeriod={}; const missing=new Set();
  for(const [tag,periodCode] of Object.entries(PERIODS)){
    const period=byPeriod.get(periodCode);
    if(!period){console.log('ไม่พบงวด',periodCode);continue;}
    const reason=REASON_PREFIX+tag;
    if(apply){
      const del=await p.payrollAdjustment.deleteMany({where:{periodId:period.id,reason}});
      if(del.count) console.log(tag,'ลบของเดิม',del.count);
    }
    const rows=file[tag]||[]; const bucket={}; let n=0;
    for(const r of rows){
      const empId=byCode.get(r.code);
      if(!empId){missing.add(r.code);continue;}
      for(const [label,value] of Object.entries(r)){
        if(typeof value!=='number'||Math.abs(value)<0.005) continue;
        const isEarn=Object.prototype.hasOwnProperty.call(map.EARNING,label);
        const code=isEarn?map.EARNING[label]:map.DEDUCTION[label];
        if(!code) continue;
        const comp=byComp.get(code);
        if(!comp){missing.add('component:'+code);continue;}
        bucket[label]=(bucket[label]||0)+value; n++;
        if(!apply) continue;
        await p.payrollAdjustment.create({data:{
          id:randomUUID(), companyId:COMPANY, employeeId:empId, periodId:period.id,
          componentId:comp.id, code, name:comp.nameTh, type:isEarn?'EARNING':'DEDUCTION',
          sourceType:'ADJUSTMENT', quantity:1, rate:value, amount:value,
          effectiveDate:period.endDate,
          isTaxable:comp.isTaxable, isSocialSecurityBase:comp.isSocialSecurityBase,
          status:'APPROVED', approvedAt:new Date(), reason, sortOrder:500,
        }});
      }
    }
    perPeriod[tag]={n,bucket}; total+=n;
    console.log(tag,'· รายการ',n,'·',Object.entries(bucket).map(([k,v])=>`${k} ${Math.round(v*100)/100}`).join(' | '));
  }
  console.log('\nรวมทั้งหมด',total,'รายการ');
  if(missing.size) console.log('หาไม่เจอ:',[...missing].join(', '));
  if(!apply) console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
  await p.$disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
