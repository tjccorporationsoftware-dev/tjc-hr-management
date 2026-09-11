require('reflect-metadata');
require('dotenv').config({quiet:true});
const fs=require('fs');const path=require('path');
const {NestFactory}=require('@nestjs/core');
const {AppModule}=require('../../dist/app.module.js');
const {PayrollService}=require('../../dist/modules/payroll/payroll.service.js');
const {PrismaService}=require('../../dist/database/prisma.service.js');
const COMPANY='cmstqxdhf004ttm7wqvoaszwq';
const MAP={'PAY-2569-01':'2026-01','PAY-2569-02':'2026-02','PAY-2569-03':'2026-03','PAY-2569-04':'2026-04','PAY-2569-05':'2026-05','PAY-2569-06':'2026-06','PAY-2569-07':'2026-07','PAY-2569-08':'2026-08'};
(async()=>{
  const only=process.argv[2];
  const file=JSON.parse(fs.readFileSync(path.join(__dirname,'legacy-payroll-file.json'),'utf8'));
  const app=await NestFactory.createApplicationContext(AppModule,{logger:['error']});
  const svc=app.get(PayrollService);
  const prisma=app.get(PrismaService);
  const actor=await prisma.user.findFirst({where:{deletedAt:null},orderBy:{createdAt:'asc'},select:{id:true}});
  const scope={level:'GLOBAL',companyId:null,branchId:null};
  const emps=await prisma.employee.findMany({where:{deletedAt:null},select:{id:true,employeeCode:true}});
  const byCode=new Map(emps.map(e=>[e.employeeCode,e.id]));
  const periods=await prisma.payrollPeriod.findMany({where:{companyId:COMPANY,deletedAt:null,code:{in:Object.keys(MAP)}},orderBy:{startDate:'asc'}});
  for(const period of periods){
    if(only && !period.code.endsWith(only)) continue;
    const run=await prisma.payrollRun.findFirst({where:{periodId:period.id,deletedAt:null}});
    if(!run){console.log(period.code,'ไม่มี run');continue;}
    /* จำกัดคนในรอบให้ตรงกับรายชื่อในไฟล์ ระบบจะได้ไม่หยิบคนที่ระบบเดิมไม่ได้จ่ายงวดนั้น */
    const codes=(file[MAP[period.code]]||[]).map(r=>r.code);
    const employeeIds=codes.map(c=>byCode.get(c)).filter(Boolean);
    const t0=Date.now();
    try{
      const r=await svc.calculateRun(run.id,scope,{employeeIds},actor.id,{responseMode:'summary'});
      const g=(k)=>Number(r[k]??r.run?.[k]??0);
      console.log(period.code,'| คนในไฟล์',codes.length,'| คำนวณ',g('totalEmployees'),'| รายรับ',g('totalEarnings').toLocaleString(),'| รายจ่าย',g('totalDeductions').toLocaleString(),'| สุทธิ',g('totalNetPay').toLocaleString(),'|',((Date.now()-t0)/1000).toFixed(0)+'s');
    }catch(e){ console.log(period.code,'FAIL',e.message); }
  }
  await app.close();
  process.exit(0);
})().catch(e=>{console.error(e.message||e);process.exit(1)});
