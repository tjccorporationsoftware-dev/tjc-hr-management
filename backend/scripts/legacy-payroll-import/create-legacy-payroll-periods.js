require('reflect-metadata');
require('dotenv').config({quiet:true});
const {NestFactory}=require('@nestjs/core');
const {AppModule}=require('../../dist/app.module.js');
const {PayrollService}=require('../../dist/modules/payroll/payroll.service.js');
const {PrismaService}=require('../../dist/database/prisma.service.js');
const COMPANY='cmstqxdhf004ttm7wqvoaszwq';
const PERIODS=[
 ['01','2025-12-26','2026-01-25','2026-01-31',2026,1],
 ['02','2026-01-26','2026-02-25','2026-02-28',2026,2],
 ['03','2026-02-26','2026-03-25','2026-03-31',2026,3],
 ['04','2026-03-26','2026-04-25','2026-04-30',2026,4],
 ['05','2026-04-26','2026-05-25','2026-05-31',2026,5],
 ['06','2026-05-26','2026-06-25','2026-06-30',2026,6],
 ['07','2026-06-26','2026-07-25','2026-07-31',2026,7],
 ['08','2026-07-26','2026-08-25','2026-08-31',2026,8],
];
(async()=>{
  const app=await NestFactory.createApplicationContext(AppModule,{logger:['error']});
  const svc=app.get(PayrollService);
  const prisma=app.get(PrismaService);
  const actor=await prisma.user.findFirst({where:{deletedAt:null},orderBy:{createdAt:'asc'},select:{id:true,email:true}});
  const scope={level:'GLOBAL',companyId:null,branchId:null};
  console.log('ทำในนามของ',actor.email);
  for(const [mm,s,e,pay,year,month] of PERIODS){
    const code=`PAY-2569-${mm}`;
    let period=await prisma.payrollPeriod.findFirst({where:{companyId:COMPANY,code,deletedAt:null}});
    if(!period){
      period=await svc.createPeriod({companyId:COMPANY,code,name:`งวดเงินเดือน ${mm}/2569`,year,month,startDate:s,endDate:e,paymentDate:pay},actor.id,scope);
      console.log('สร้างงวด',code,s,'->',e);
    } else console.log('มีงวดอยู่แล้ว',code);
    let run=await prisma.payrollRun.findFirst({where:{periodId:period.id,deletedAt:null}});
    if(!run){
      run=await svc.createRun({companyId:COMPANY,periodId:period.id,name:`นำเข้าจากระบบเดิม ${code}`},actor.id,scope);
      console.log('  สร้าง run',run.runNo);
    } else console.log('  มี run อยู่แล้ว',run.runNo,run.status);
  }
  await app.close();
  process.exit(0);
})().catch(e=>{console.error(e.message||e);process.exit(1)});
