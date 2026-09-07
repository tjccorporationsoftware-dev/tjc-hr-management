/*
 * แก้ค่าเช่าห้องที่ถูกนำเข้ามาผิดฝั่ง
 * -----------------------------------------------------------------------------
 * ทะเบียนพนักงานมีคอลัมน์ "ค่าเช่าห้อง" ปนอยู่กับคอลัมน์เบี้ยต่าง ๆ ตอนนำเข้าจึงถูก
 * ลงเป็นรายรับ ทั้งที่เป็นเงินที่พนักงานจ่ายให้บริษัท = ต้องเป็นรายการหัก
 * ผลคือคนที่มีค่าเช่าห้องได้เงินเกินเดือนละ 1,000 บาท และฐานภาษี/ประกันสังคมสูงเกินจริง
 *
 * ทำ 3 อย่าง
 *   1. เปลี่ยนรายการประจำของค่าเช่าห้องจากรายรับ -> รายการหัก ROOM_RENT
 *   2. ลบ adjustment ค่าที่พักของงวดนี้ (รายการประจำคุมแทนแล้ว ไม่งั้นหักซ้ำ)
 *   3. ลบค่าโทรศัพท์ 300 ของ 670030 ที่ไม่มีในทะเบียนและไฟล์งวดนี้ก็ไม่จ่าย
 *
 * รันซ้ำได้ ไม่มีผลข้างเคียง และสำรองของเดิมไว้ที่ room-rent-fix-backup.json ก่อนแก้
 */
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

/* คนที่ทะเบียนพนักงานระบุว่ามีค่าเช่าห้อง */
const RENT_CODES = ['670072', '670077', '670081', '680016', '680059', '690004'];

(async () => {
  const prisma = new PrismaClient();

  try {
    /* โมเดลรายการประจำไม่มีความสัมพันธ์ตรงไปที่พนักงาน จึงหาโดยรหัสก่อน */
    const employees = await prisma.employee.findMany({
      where: { employeeCode: { in: [...RENT_CODES, '670030'] } },
      select: { id: true, employeeCode: true },
    });
    const codeOf = new Map(employees.map((row) => [row.id, row.employeeCode]));
    const rentEmployeeIds = employees
      .filter((row) => RENT_CODES.includes(row.employeeCode))
      .map((row) => row.id);
    const phoneEmployeeId = employees.find(
      (row) => row.employeeCode === '670030',
    )?.id;

    const rentItems = await prisma.employeeCompensationItem.findMany({
      where: {
        deletedAt: null,
        code: { in: ['OTHER_EARNING', 'ROOM_RENT'] },
        employeeId: { in: rentEmployeeIds },
      },
    });

    /*
     * ชื่อกับธงภาษี/ประกันสังคมของบรรทัดในสลิปมาจาก payroll_component ที่ผูกไว้
     * ถ้าไม่ย้ายให้ชี้ตัวค่าที่พัก บรรทัดหักจะขึ้นชื่อว่า "รายได้อื่น ๆ" ในสลิป
     */
    const rentComponent = await prisma.payrollComponent.findFirst({
      where: { deletedAt: null, code: 'ROOM_RENT', type: 'DEDUCTION' },
      select: { id: true },
    });

    const phoneItem = phoneEmployeeId
      ? await prisma.employeeCompensationItem.findFirst({
          where: {
            deletedAt: null,
            code: 'PHONE_ALLOWANCE',
            employeeId: phoneEmployeeId,
          },
        })
      : null;

    const adjustments = await prisma.payrollAdjustment.findMany({
      where: { code: 'ROOM_RENT' },
    });

    fs.writeFileSync(
      'room-rent-fix-backup.json',
      JSON.stringify({ rentItems, phoneItem, adjustments }, null, 2),
    );

    for (const item of rentItems) {
      await prisma.employeeCompensationItem.update({
        where: { id: item.id },
        data: {
          code: 'ROOM_RENT',
          name: 'ค่าเช่าห้อง',
          type: 'DEDUCTION',
          sourceType: 'MANUAL',
          componentId: rentComponent?.id ?? null,
          isTaxable: false,
          isSocialSecurityBase: false,
          /* ค่าเช่าห้องเก็บเต็มจำนวนทุกงวด ไม่หารตามวันทำงาน */
          prorateByEmploymentDays: false,
          note: 'ค่าเช่าห้องจากทะเบียนพนักงาน (แก้จากที่นำเข้าผิดเป็นรายรับ)',
        },
      });
      console.log(
        'เปลี่ยนเป็นรายการหัก',
        codeOf.get(item.employeeId) ?? item.employeeId,
        Number(item.amount),
      );
    }

    for (const adjustment of adjustments) {
      await prisma.payrollAdjustment.delete({ where: { id: adjustment.id } });
      console.log(
        'ลบ adjustment ค่าที่พัก',
        codeOf.get(adjustment.employeeId) ?? adjustment.employeeId,
      );
    }

    if (phoneItem) {
      await prisma.employeeCompensationItem.delete({
        where: { id: phoneItem.id },
      });
      console.log('ลบค่าโทรศัพท์ของ', codeOf.get(phoneItem.employeeId));
    }

    console.log('เสร็จแล้ว');
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
