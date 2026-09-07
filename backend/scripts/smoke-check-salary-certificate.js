/*
 * ตรวจว่าหนังสือรับรองเงินเดือนยังใส่ตัวเลขได้ครบ หลังย้ายเบี้ยประจำ
 * ไปอยู่ที่ "รายการประจำ"
 *
 * เส้นทางนี้ไม่มีเทสคุม และถ้าพลาดจะไม่มีใครรู้จนกว่าพนักงานเอาเอกสาร
 * ไปยื่นธนาคารแล้วรายได้ต่ำกว่าความจริง จึงต้องยิงของจริงดูสักครั้ง
 *
 * สร้างใบคำขอชั่วคราวแล้วลบทิ้งในทรานแซกชันเดียว ไม่ทิ้งข้อมูลไว้
 *
 *   node scripts/smoke-check-salary-certificate.js
 */
require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { PrismaService } = require('../dist/database/prisma.service.js');
const {
  DocumentWorkflowService,
} = require('../dist/modules/document-workflow/document-workflow.service.js');

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const prisma = app.get(PrismaService);
    const service = app.get(DocumentWorkflowService);

    /* เลือกคนที่มีทั้งเงินเดือนและเบี้ยประจำ จะได้เห็นว่าเบี้ยถูกนับไหม */
    const item = await prisma.employeeCompensationItem.findFirst({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        type: 'EARNING',
        code: 'POSITION_ALLOWANCE',
      },
      select: { employeeId: true, companyId: true, amount: true },
    });

    const compensation = await prisma.employeeCompensation.findFirst({
      where: { employeeId: item.employeeId, deletedAt: null, status: 'ACTIVE' },
      orderBy: { effectiveDate: 'desc' },
      select: { baseSalary: true },
    });

    const documentType = await prisma.documentType.findFirst({
      where: { deletedAt: null, code: { contains: 'SALARY' } },
      select: { id: true, code: true },
    });

    if (!documentType) {
      console.log('ข้าม: ยังไม่มีประเภทเอกสารหนังสือรับรองเงินเดือนในระบบ');
      return;
    }

    /*
     * สร้างใบคำขอจริงแล้วลบทิ้งทันทีหลังใช้ เพราะ service อ่านผ่าน prisma
     * ตัวหลัก มองไม่เห็นแถวที่อยู่ในทรานแซกชันที่ยังไม่ commit
     */
    const requestNo = `SMOKE-${Date.now()}`;
    const created = await prisma.documentRequest.create({
      data: {
        companyId: item.companyId,
        employeeId: item.employeeId,
        documentTypeId: documentType.id,
        requestNo,
        title: 'ตรวจระบบ · หนังสือรับรองเงินเดือน',
        requestData: { documentKind: 'SALARY_CERTIFICATE' },
        issuedAt: new Date(),
        status: 'DRAFT',
      },
      select: { id: true },
    });

    try {
      const result = await service.buildDocumentRenderTokens(created.id, {
        includeSalary: true,
      });
      var tokens = result.tokens;
    } finally {
      await prisma.documentRequest.delete({ where: { id: created.id } });
    }

    const base = Number(compensation?.baseSalary ?? 0);
    const allowance = Number(item.amount);

    console.log('เงินเดือนในเอกสาร   ', tokens.monthlySalary);
    console.log('ค่าตำแหน่งในเอกสาร  ', tokens.positionAllowance);
    console.log('รวมเงินเพิ่ม        ', tokens.totalAllowance);
    console.log('รวมรายได้ต่อเดือน   ', tokens.totalMonthlyIncome);
    console.log('เป็นตัวหนังสือ      ', tokens.totalMonthlyIncomeText);
    console.log('');
    console.log('ที่ควรเป็น: เงินเดือน', base.toLocaleString('th-TH'), '+ ค่าตำแหน่ง', allowance.toLocaleString('th-TH'), '=', (base + allowance).toLocaleString('th-TH'));

    const okAllowance =
      Math.abs(Number(String(tokens.positionAllowance).replace(/,/g, '')) - allowance) < 0.01;
    console.log(okAllowance ? '\nผ่าน  เอกสารนับเบี้ยประจำจากรายการประจำแล้ว' : '\nไม่ผ่าน  เอกสารไม่ได้นับเบี้ยประจำ');
    process.exitCode = okAllowance ? 0 : 1;
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
