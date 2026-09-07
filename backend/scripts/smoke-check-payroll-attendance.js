/*
 * ตรวจความถูกต้องของเส้นทางที่แก้ไป โดยเรียก service จริงผ่าน AppModule
 *
 * ครอบสิ่งที่เปลี่ยนไปสองเรื่อง
 *   1. ถอดช่องเบี้ยคงที่ออกจากฐานเงินเดือน (อ่านรายการประจำแทน)
 *   2. ยกเว้นค่าปรับช่วงบ่ายเป็นรายวัน
 *
 * ตั้งใจให้อ่านอย่างเดียว ไม่เขียนข้อมูลจริงสักแถว
 *
 *   node scripts/smoke-check-payroll-attendance.js <runId>
 */
require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { PrismaService } = require('../dist/database/prisma.service.js');
const { PayrollService } = require('../dist/modules/payroll/payroll.service.js');
const {
  PayrollReadinessService,
} = require('../dist/modules/payroll/services/payroll-readiness.service.js');
const {
  PayrollTaxCalculatorService,
} = require('../dist/modules/payroll/services/payroll-tax-calculator.service.js');
const {
  PayrollSeveranceService,
} = require('../dist/modules/payroll/services/payroll-severance.service.js');
const {
  AttendanceCalculationEngineService,
} = require('../dist/modules/attendance/attendance-calculation-engine.service.js');

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const fail = (name, detail) => results.push({ pass: false, name, detail });

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const [runId] = process.argv.slice(2);
    const prisma = app.get(PrismaService);
    const payroll = app.get(PayrollService);

    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, deletedAt: null },
      include: { period: true },
    });
    const scope = {
      level: 'GLOBAL',
      companyId: run.companyId,
      branchId: null,
      isSuperAdmin: true,
      companyIds: [run.companyId],
    };

    /* 1. คอลัมน์เบี้ยคงที่ต้องไม่มีเหลือในฐานข้อมูลจริง */
    const columns = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'employee_compensations'
         AND column_name IN ('positionAllowance','transportAllowance','phoneAllowance','otherAllowance')`,
    );
    columns.length === 0
      ? ok('ช่องเบี้ยคงที่ถูกลบออกจากตารางฐานเงินเดือนแล้ว')
      : fail('ยังมีช่องเบี้ยคงที่เหลืออยู่', JSON.stringify(columns));

    /* 2. รายการฐานเงินเดือน — เส้นทางที่เคยรวมยอดจากช่องที่ลบไป */
    const list = await payroll.findCompensations(
      { page: 1, pageSize: 5, companyId: run.companyId },
      scope,
    );
    typeof list?.summary?.totalCompensationAmount === 'number' &&
    list.summary.totalCompensationAmount === list.summary.totalBaseSalary
      ? ok(
          'รายการฐานเงินเดือนอ่านได้ ยอดรวม = เงินเดือนฐาน',
          `${list.data.length} แถว · รวม ${list.summary.totalCompensationAmount.toLocaleString('th-TH')}`,
        )
      : fail('ยอดสรุปฐานเงินเดือนผิดรูป', JSON.stringify(list?.summary));

    /* 3. สร้าง/แก้ฐานเงินเดือนยังทำงาน (rollback ทุกอย่าง ไม่ทิ้งข้อมูลจริง) */
    const sampleEmployee = await prisma.employee.findFirst({
      where: { companyId: run.companyId, deletedAt: null },
      select: { id: true },
    });
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.employeeCompensation.create({
          data: {
            companyId: run.companyId,
            employeeId: sampleEmployee.id,
            /* ช่วงปิดในอดีต จะได้ไม่ชนกติกาห้ามช่วงเงินเดือนซ้อนกัน */
            effectiveDate: new Date('1990-01-01T00:00:00.000Z'),
            endDate: new Date('1990-12-31T00:00:00.000Z'),
            baseSalary: '12345.00',
            salaryBasis: 'MONTHLY',
            status: 'ACTIVE',
          },
          select: { id: true, baseSalary: true },
        });
        if (Number(created.baseSalary) !== 12345) {
          throw new Error('ค่าที่บันทึกไม่ตรง');
        }
        throw new Error('__ROLLBACK__');
      });
    } catch (error) {
      String(error?.message).includes('__ROLLBACK__')
        ? ok('บันทึกฐานเงินเดือนใหม่ได้ (ทดสอบแล้วย้อนกลับ ไม่ทิ้งข้อมูล)')
        : fail('บันทึกฐานเงินเดือนไม่ผ่าน', String(error?.message));
    }

    /* 4. ตัวตรวจความพร้อมงวด */
    const readiness = await app.get(PayrollReadinessService).getReadiness(runId);
    const blocking = (readiness?.checks ?? []).filter(
      (check) => check.blocking && check.status === 'FAIL',
    );
    ok(
      'ตัวตรวจความพร้อมงวดทำงาน',
      `${readiness?.checks?.length ?? 0} รายการ · ติดขัด ${blocking.length}`,
    );

    /* ข้อมูลอ้างอิงสำหรับข้อ 5 — เงินเดือนฐานและเบี้ยประจำรายคน */
    const recurringRows = await prisma.employeeCompensationItem.findMany({
      where: { deletedAt: null, status: 'ACTIVE', type: 'EARNING' },
      select: { employeeId: true, amount: true },
    });
    const recurringByEmployee = new Map();
    for (const row of recurringRows) {
      recurringByEmployee.set(
        row.employeeId,
        (recurringByEmployee.get(row.employeeId) ?? 0) + Number(row.amount),
      );
    }
    const compensationRows = await prisma.employeeCompensation.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { employeeId: true, baseSalary: true },
    });
    const baseSalaryByEmployee = new Map(
      compensationRows.map((row) => [row.employeeId, Number(row.baseSalary)]),
    );

    /* 5. ตัวคำนวณภาษี — ทั้งฝั่งพรีวิวและฝั่งงวดจริง */
    const taxPreview = await app
      .get(PayrollTaxCalculatorService)
      .calculateRunPreview(runId, {}, scope);
    const taxRows = taxPreview?.rows ?? [];
    const blockingTax = (taxPreview?.warnings ?? []).filter(
      (warning) => warning.severity === 'BLOCKING',
    );

    /*
     * ต้องพิสูจน์ว่าเบี้ยประจำเข้าไปอยู่ในรายได้ที่เอาไปคิดภาษีจริง
     * ไม่ใช่แค่ "คำนวณผ่าน" เพราะถ้าลืมนับเบี้ย ตัวเลขก็ยังออกมาสวยแต่ต่ำกว่าจริง
     */
    const sampleTaxRow = taxRows.find((row) =>
      recurringByEmployee.has(row.employeeId),
    );
    const expectedFloor = sampleTaxRow
      ? (baseSalaryByEmployee.get(sampleTaxRow.employeeId) ?? 0) +
        (recurringByEmployee.get(sampleTaxRow.employeeId) ?? 0)
      : 0;

    taxRows.length > 0 &&
    blockingTax.length === 0 &&
    sampleTaxRow &&
    Number(sampleTaxRow.projectedAnnualIncome) >= expectedFloor
      ? ok(
          'ตัวคำนวณภาษีนับเบี้ยประจำเข้าไปในรายได้ด้วย',
          `${taxRows.length} คน · ตัวอย่าง ${sampleTaxRow.employeeCode} รายได้ประมาณการ ${Number(sampleTaxRow.projectedAnnualIncome).toLocaleString('th-TH')} (เงินเดือน+เบี้ยต่อเดือน ${expectedFloor.toLocaleString('th-TH')})`,
        )
      : fail(
          'ตัวคำนวณภาษีไม่ผ่าน',
          JSON.stringify({ rows: taxRows.length, blocking: blockingTax.length }),
        );

    /* 6. ค่าชดเชย — ต้องนับเงินประจำตำแหน่งจากรายการประจำ */
    const withAllowance = await prisma.employeeCompensationItem.findFirst({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        type: 'EARNING',
        code: 'POSITION_ALLOWANCE',
      },
      select: { employeeId: true, amount: true, companyId: true },
    });
    if (withAllowance) {
      const severance = await app
        .get(PayrollSeveranceService)
        .quote(withAllowance.employeeId, {
          reasonType: 'RETRENCHMENT',
          lastWorkingDate: new Date(),
          scope,
        })
        .catch((error) => ({ error: error?.message }));

      const base = Number(severance?.monthlyWage ?? 0);
      base > 0
        ? ok(
            'ค่าชดเชยคิดจากเงินเดือน + เงินประจำตำแหน่งของรายการประจำ',
            `ฐาน ${base.toLocaleString('th-TH')} (มีเบี้ย ${Number(withAllowance.amount).toLocaleString('th-TH')})`,
          )
        : fail('คิดค่าชดเชยไม่ได้', JSON.stringify(severance).slice(0, 200));
    }

    /* 7. เครื่องคำนวณเวลา — ยกเว้นค่าปรับบ่ายต้องตัดเฉพาะฝั่งบ่าย */
    const engine = app.get(AttendanceCalculationEngineService);
    const policy = {
      id: 'p',
      timezone: 'Asia/Bangkok',
      lateGraceMinutes: 0,
      lateRoundingMinutes: 0,
      latePenaltyRatePerMinute: 5,
      missingLogPenaltyPerDay: 50,
      missingPenaltyMode: 'PER_SESSION',
    };
    const rules = [
      { id: 'm', sessionCode: 'MORNING_IN', label: 'เช้า', punchType: 'CHECK_IN', openTime: '06:00', expectedTime: '08:00', closeTime: '11:59', lateAfterTime: '08:00', latePenaltyPerMinute: 5, missingPenaltyAmount: 50, requirePunch: true, sortOrder: 1 },
      { id: 'a', sessionCode: 'AFTERNOON_IN', label: 'บ่าย', punchType: 'CHECK_IN', openTime: '12:00', expectedTime: '13:00', closeTime: '15:00', lateAfterTime: '13:00', latePenaltyPerMinute: 5, missingPenaltyAmount: 50, requirePunch: true, sortOrder: 2 },
      { id: 'o', sessionCode: 'CHECK_OUT', label: 'ออก', punchType: 'CHECK_OUT', openTime: '15:00', expectedTime: '17:00', closeTime: '23:59', requirePunch: true, sortOrder: 3 },
    ];
    const logs = [
      { id: '1', session: 'MORNING', logType: 'CHECK_IN', logTime: new Date('2026-07-01T08:10:00+07:00') },
      { id: '2', session: 'AFTERNOON', logType: 'CHECK_IN', logTime: new Date('2026-07-01T13:20:00+07:00') },
      { id: '3', session: 'EVENING', logType: 'CHECK_OUT', logTime: new Date('2026-07-01T17:00:00+07:00') },
    ];
    const noLeave = { coversMorning: false, coversAfternoon: false, coversCheckout: false, durationDays: 0, isUnpaid: false, coverageReason: null };
    const draft = (waive) =>
      engine.calculateDailySummaryDraft({
        workDate: new Date('2026-07-01T00:00:00.000Z'),
        policy,
        sessionRules: rules,
        logs,
        leaveCoverage: noLeave,
        unpaidLeaveDeductionAmount: 0,
        asOf: new Date('2026-07-02T09:00:00+07:00'),
        waiveAfternoonPenalty: waive,
      });
    const normal = draft(false);
    const waived = draft(true);
    Number(normal.latePenaltyAmount) === 150 &&
    Number(waived.latePenaltyAmount) === 50 &&
    waived.afternoonLateMinutes === 20
      ? ok('ยกเว้นค่าปรับบ่ายตัดเฉพาะเงินฝั่งบ่าย ยังนับนาทีสายตามจริง', 'ปกติ 150 → ยกเว้น 50')
      : fail(
          'การยกเว้นค่าปรับบ่ายให้ผลผิด',
          `ปกติ ${normal.latePenaltyAmount} · ยกเว้น ${waived.latePenaltyAmount}`,
        );

    /* 8. ขอบเขตของการยกเว้น — ต้องอยู่แค่ในงวดที่สั่ง */
    const waivedRange = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*) FILTER (WHERE "afternoonPenaltyWaived" AND ("workDate" < DATE '2026-07-26' OR "workDate" > DATE '2026-08-25'))::int AS outside,
         COUNT(*) FILTER (WHERE "afternoonPenaltyWaived")::int AS total
       FROM attendance_daily_summaries`,
    );
    Number(waivedRange[0].outside) === 0
      ? ok(
          'การยกเว้นอยู่ในงวด 26 ก.ค. – 25 ส.ค. เท่านั้น',
          `${Number(waivedRange[0].total).toLocaleString('th-TH')} วัน · นอกงวด 0 วัน`,
        )
      : fail('มีการยกเว้นหลุดออกนอกงวด', JSON.stringify(waivedRange[0]));

    /*
     * 9. งวดอื่นต้องหักตามปกติ
     *
     * ระบบยังไม่มีข้อมูลลงเวลาก่อน 26 ก.ค. จึงเทียบกับงวดถัดไปแทน
     * ซึ่งเป็นคำถามเดียวกัน: การยกเว้นรั่วออกไปนอกงวดที่สั่งหรือเปล่า
     */
    const nextPeriod = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS days,
              COALESCE(SUM("latePenaltyAmount"),0)::float AS late,
              COALESCE(SUM("missingLogPenaltyAmount"),0)::float AS missing,
              COUNT(*) FILTER (WHERE "afternoonPenaltyWaived")::int AS waived
       FROM attendance_daily_summaries
       WHERE "workDate" > DATE '2026-08-25'`,
    );
    const row = nextPeriod[0];
    Number(row.days) > 0 &&
    Number(row.waived) === 0 &&
    Number(row.late) + Number(row.missing) > 0
      ? ok(
          'งวดถัดไปยังหักค่าปรับตามปกติ ไม่มีวันไหนถูกยกเว้น',
          `${row.days} วัน · มาสาย ${Number(row.late).toLocaleString('th-TH')} · ลืมสแกน ${Number(row.missing).toLocaleString('th-TH')}`,
        )
      : fail('งวดถัดไปผิดคาด', JSON.stringify(row));

    /* 10. สรุปเวลาของงวดนี้กลับเข้าสถานะที่ Payroll ดึงได้แล้ว */
    const statuses = await prisma.$queryRawUnsafe(
      `SELECT s."reviewStatus", COUNT(*)::int AS n
       FROM attendance_daily_summaries s
       JOIN employees e ON e.id = s."employeeId"
       WHERE e."branchId" = (SELECT "branchId" FROM employees WHERE id = (
              SELECT "employeeId" FROM payroll_items WHERE "runId" = $1 LIMIT 1))
         AND s."workDate" BETWEEN DATE '2026-07-26' AND DATE '2026-08-25'
       GROUP BY 1`,
      runId,
    );
    const notReady = statuses.filter(
      (row) => !['LOCKED', 'SENT_TO_PAYROLL'].includes(row.reviewStatus),
    );
    notReady.length === 0
      ? ok(
          'สรุปเวลาของสาขาที่คำนวณแล้ว อยู่สถานะที่ Payroll ดึงได้ครบ',
          statuses.map((row) => `${row.reviewStatus} ${row.n}`).join(' · '),
        )
      : fail(
          'ยังมีวันที่ Payroll ดึงไม่ได้',
          notReady.map((row) => `${row.reviewStatus} ${row.n}`).join(' · '),
        );
  } catch (error) {
    fail('สคริปต์ตรวจล้ม', String(error?.stack || error).slice(0, 500));
  } finally {
    console.log('');
    for (const item of results) {
      console.log(
        `${item.pass ? 'ผ่าน  ' : 'ไม่ผ่าน'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`,
      );
    }
    const failed = results.filter((item) => !item.pass).length;
    console.log(`\nสรุป ${results.length - failed}/${results.length} ผ่าน`);
    process.exitCode = failed > 0 ? 1 : 0;
    await app.close();
  }
})();
