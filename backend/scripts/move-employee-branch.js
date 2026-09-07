/*
 * ย้ายพนักงานไปสาขาที่ถูกต้อง
 *
 * เรียกผ่าน EmployeesService ตัวเดียวกับหน้าจอ จะได้มีประวัติการแก้ไขและ
 * การตรวจสิทธิ์เหมือนกดจากหน้าเว็บ ไม่ใช่ไปแก้ตารางตรง ๆ
 *
 *   node scripts/move-employee-branch.js <employeeCode> <branchCode>
 */
require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { PrismaService } = require('../dist/database/prisma.service.js');
const {
  EmployeesService,
} = require('../dist/modules/employees/employees.service.js');

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const [employeeCode, branchCode] = process.argv.slice(2);

    if (!employeeCode || !branchCode) {
      throw new Error('ต้องระบุรหัสพนักงานและรหัสสาขา');
    }

    const prisma = app.get(PrismaService);
    const service = app.get(EmployeesService);

    const employee = await prisma.employee.findFirst({
      where: { employeeCode, deletedAt: null },
      select: { id: true, companyId: true, branchId: true, firstName: true, lastName: true },
    });

    if (!employee) {
      throw new Error(`ไม่พบพนักงานรหัส ${employeeCode}`);
    }

    const branch = await prisma.branch.findFirst({
      where: { code: branchCode, deletedAt: null },
      select: { id: true, nameTh: true },
    });

    if (!branch) {
      throw new Error(`ไม่พบสาขารหัส ${branchCode}`);
    }

    if (employee.branchId === branch.id) {
      console.log('อยู่สาขานี้อยู่แล้ว ไม่ต้องย้าย');
      return;
    }

    const actor = await prisma.user.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });

    console.log('พบพนักงาน', employee.id, 'บริษัท', employee.companyId, 'สาขาเดิม', employee.branchId);

    await service.update(
      employee.id,
      { branchId: branch.id },
      {
        id: actor.id,
        scope: {
          level: 'GLOBAL',
          companyId: employee.companyId,
          branchId: null,
        },
        permissions: ['*'],
      },
    );

    console.log(
      `ย้าย ${employeeCode} ${employee.firstName} ${employee.lastName} ไปสาขา ${branch.nameTh} แล้ว`,
    );
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
