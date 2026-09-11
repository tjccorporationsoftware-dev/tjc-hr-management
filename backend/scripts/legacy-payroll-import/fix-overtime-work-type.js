/*
 * แก้ประเภทโอทีของงวดที่นำเข้าไปแล้ว ให้ตรงกับช่องในไฟล์ (x1.0 / x1.5)
 * หมายเหตุของใบโอทีบันทึกชื่อช่องต้นทางไว้ ใช้ตัดสินได้เลย
 */
require('dotenv').config({quiet:true});
const {PrismaClient}=require('../../dist/generated/prisma/client.js');const p=new PrismaClient();
const apply=process.argv.includes('--apply');
(async()=>{
  const where={workDate:{gte:new Date('2025-12-26T00:00:00.000Z'),lte:new Date('2026-07-25T00:00:00.000Z')}};
  const toHoliday=await p.overtimeRequest.count({where:{...where,workType:'WORKDAY',note:{contains:'x1.5'}}});
  const toWorkday=await p.overtimeRequest.count({where:{...where,workType:'HOLIDAY',NOT:{note:{contains:'x1.5'}}}});
  console.log('จะเปลี่ยนเป็นวันหยุด (x1.5):',toHoliday,'· เปลี่ยนเป็นวันทำงาน (x1.0):',toWorkday);
  if(!apply){console.log('-- พรีวิวเท่านั้น --');await p.$disconnect();return;}
  const a=await p.overtimeRequest.updateMany({where:{...where,workType:'WORKDAY',note:{contains:'x1.5'}},data:{workType:'HOLIDAY'}});
  const b=await p.overtimeRequest.updateMany({where:{...where,workType:'HOLIDAY',NOT:{note:{contains:'x1.5'}}},data:{workType:'WORKDAY'}});
  console.log('แก้แล้ว',a.count,'+',b.count);
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
