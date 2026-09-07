/**
 * ระยะที่ 2 — การใช้งานประจำวัน 3 เดือน
 * -------------------------------------
 * ใบลา · คำขอ OT · ขอแก้เวลา · ลงเวลาเข้าออกรายวัน
 *
 * ลำดับสำคัญ: สร้างใบลาก่อน แล้วค่อยลงเวลา
 * เพราะวันที่ลาต้องไม่มีการลงเวลา ไม่งั้นสรุปรายวันจะขัดกันเอง
 *
 * รันด้วย: npx tsx scripts/demo/stage2-operations.ts
 */
import { ATTENDANCE_FROM, ATTENDANCE_TO } from './config';
import {
  atBangkokTime,
  chance,
  dateKey,
  dateOnly,
  done,
  eachDay,
  isWeekend,
  pickRandom,
  prisma,
  randInt,
  step,
} from './lib';

type EmployeeRow = {
  id: string;
  employeeCode: string;
  displayName: string | null;
  startDate: Date;
  branchId: string | null;
  supervisorId: string | null;
  userId: string | null;
  positionCode: string;
};

/* ============================== เตรียมข้อมูล ============================== */
async function loadContext() {
  const company = await prisma.company.findFirstOrThrow();

  const rows = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      employeeCode: true,
      displayName: true,
      startDate: true,
      branchId: true,
      supervisorId: true,
      userId: true,
      positionMaster: { select: { code: true } },
    },
    orderBy: { employeeCode: 'asc' },
  });

  const employees: EmployeeRow[] = rows.map((r) => ({
    id: r.id,
    employeeCode: r.employeeCode,
    displayName: r.displayName,
    startDate: r.startDate,
    branchId: r.branchId,
    supervisorId: r.supervisorId,
    userId: r.userId,
    positionCode: r.positionMaster?.code ?? 'STAFF',
  }));

  const leaveTypes = await prisma.leaveType.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, code: true, nameTh: true },
  });

  const holidays = await prisma.holidayCalendar.findMany({
    where: { companyId: company.id },
    select: { date: true },
  });
  const holidaySet = new Set(holidays.map((h) => dateKey(h.date)));

  return { company, employees, leaveTypes, holidaySet };
}

/** วันทำงานจริง = ไม่ใช่เสาร์อาทิตย์ และไม่ใช่วันหยุดบริษัท */
function isWorkingDay(day: Date, holidaySet: Set<string>) {
  return !isWeekend(day) && !holidaySet.has(dateKey(day));
}

/* ============================== ใบลา ============================== */
async function seedLeaveRequests(ctx: Awaited<ReturnType<typeof loadContext>>) {
  step('ใบลา — อนุมัติ · ไม่อนุมัติ · รออนุมัติ');

  const from = dateOnly(ATTENDANCE_FROM);
  const to = dateOnly(ATTENDANCE_TO);
  const workingDays = eachDay(from, to).filter((d) =>
    isWorkingDay(d, ctx.holidaySet),
  );

  /** วันที่พนักงานคนนั้นลา — ใช้กันไม่ให้ลงเวลาทับวันลา */
  const leaveDaysByEmployee = new Map<string, Set<string>>();
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  let seq = 0;

  /*
   * โควตาคงเหลือของแต่ละคน — ต้องเช็คก่อนสร้างใบลา
   * ไม่งั้นจะสร้างใบลาเกินสิทธิ์ แล้วยอดคงเหลือติดลบ ซึ่งระบบจริงไม่ยอมให้เกิด
   */
  const balances = await prisma.leaveBalance.findMany({
    where: { year: 2026 },
    select: {
      employeeId: true,
      leaveTypeId: true,
      entitlementDays: true,
      carriedForwardDays: true,
    },
  });
  const quotaLeft = new Map<string, number>();
  for (const b of balances) {
    quotaLeft.set(
      `${b.employeeId}:${b.leaveTypeId}`,
      Number(b.entitlementDays) + Number(b.carriedForwardDays),
    );
  }

  for (const emp of ctx.employees) {
    /* คนทั่วไปลา 2-5 ครั้งใน 3 เดือนครึ่ง */
    const requestCount = randInt(2, 5);
    const taken = new Set<string>();

    for (let i = 0; i < requestCount; i++) {
      const leaveType = pickRandom(
        ctx.leaveTypes.filter(
          (lt) =>
            // ลาคลอด/อุปสมบทเป็นกรณีพิเศษ ไม่สุ่มให้ทุกคน
            !['MATERNITY', 'ORDINATION'].includes(lt.code),
        ),
      );

      /* ลาป่วยมัก 1 วัน ลาพักร้อนมัก 2-3 วันติด */
      const span = leaveType.code === 'ANNUAL' ? randInt(1, 3) : 1;

      const candidates = workingDays.filter(
        (d) => d >= emp.startDate && !taken.has(dateKey(d)),
      );
      if (!candidates.length) break;

      const startDay = pickRandom(candidates);
      const days: Date[] = [];
      for (const d of workingDays) {
        if (d >= startDay && days.length < span && !taken.has(dateKey(d))) {
          days.push(d);
        }
      }
      if (!days.length) continue;

      /* ขอเกินโควตาที่เหลือไม่ได้ ข้ามไปทำใบถัดไป */
      const quotaKey = `${emp.id}:${leaveType.id}`;
      const left = quotaLeft.get(quotaKey);
      if (left !== undefined && left < days.length) continue;

      /*
       * สถานะกระจายให้เหมือนของจริง
       * ส่วนใหญ่อนุมัติแล้ว มีไม่อนุมัติบ้าง และมีที่ยังค้างรออนุมัติอยู่
       */
      const roll = randInt(1, 100);
      const status =
        roll <= 78
          ? ('APPROVED' as const)
          : roll <= 90
            ? ('REJECTED' as const)
            : ('SUBMITTED' as const);

      seq += 1;
      const submittedAt = atBangkokTime(days[0], 9, 15);
      const request = await prisma.leaveRequest.create({
        data: {
          requestNo: `LV-2569-${String(seq).padStart(5, '0')}`,
          employeeId: emp.id,
          leaveTypeId: leaveType.id,
          startDate: days[0],
          endDate: days[days.length - 1],
          dayType: 'FULL_DAY',
          totalDays: days.length.toFixed(2),
          totalMinutes: days.length * 8 * 60,
          reason:
            leaveType.code === 'SICK'
              ? pickRandom([
                  'ไม่สบาย มีไข้',
                  'ปวดท้อง ไปพบแพทย์',
                  'เป็นหวัด พักผ่อน',
                ])
              : leaveType.code === 'ANNUAL'
                ? pickRandom([
                    'พักผ่อนประจำปี',
                    'เดินทางต่างจังหวัดกับครอบครัว',
                    'ลาพักผ่อน',
                  ])
                : pickRandom(['ธุระส่วนตัว', 'ไปติดต่อราชการ', 'ธุระครอบครัว']),
          status,
          submittedAt,
          submittedById: emp.userId,
          ...(status === 'APPROVED'
            ? { approvedAt: atBangkokTime(days[0], 14, 30) }
            : {}),
          ...(status === 'REJECTED'
            ? {
                rejectedAt: atBangkokTime(days[0], 14, 30),
                note: 'ช่วงนี้งานเร่ง ขอให้เลื่อนไปสัปดาห์หน้า',
              }
            : {}),
        },
      });

      if (status !== 'REJECTED' && left !== undefined) {
        quotaLeft.set(quotaKey, left - days.length);
      }

      if (status === 'APPROVED') {
        approved += 1;
        const set = leaveDaysByEmployee.get(emp.id) ?? new Set<string>();
        for (const d of days) {
          set.add(dateKey(d));
          taken.add(dateKey(d));
        }
        leaveDaysByEmployee.set(emp.id, set);

        /* ตัดโควตาที่ใช้ไป ให้ยอดคงเหลือตรงกับใบลาที่อนุมัติจริง */
        await prisma.leaveBalance.updateMany({
          where: { employeeId: emp.id, leaveTypeId: leaveType.id, year: 2026 },
          data: { usedDays: { increment: days.length } },
        });
      } else if (status === 'REJECTED') {
        rejected += 1;
      } else {
        pending += 1;
        for (const d of days) taken.add(dateKey(d));
        /* ใบที่ยังรออนุมัติต้องกันโควตาไว้ก่อน ไม่งั้นยอดคงเหลือจะดูเกินจริง */
        await prisma.leaveBalance.updateMany({
          where: { employeeId: emp.id, leaveTypeId: leaveType.id, year: 2026 },
          data: { pendingDays: { increment: days.length } },
        });
      }

      void request;
    }
  }

  done('อนุมัติแล้ว', approved);
  done('ไม่อนุมัติ', rejected);
  done('รออนุมัติ', pending);
  return leaveDaysByEmployee;
}

/* ============================== คำขอ OT ============================== */
async function seedOvertime(
  ctx: Awaited<ReturnType<typeof loadContext>>,
  leaveDays: Map<string, Set<string>>,
) {
  step('คำขอทำงานล่วงเวลา');

  const workingDays = eachDay(
    dateOnly(ATTENDANCE_FROM),
    dateOnly(ATTENDANCE_TO),
  );
  let created = 0;
  let seq = 0;

  for (const emp of ctx.employees) {
    /* ผู้บริหารไม่ขอ OT พนักงานปฏิบัติการขอบ่อยสุด */
    if (['MD', 'DIR'].includes(emp.positionCode)) continue;
    const times = emp.positionCode === 'OPR' ? randInt(4, 9) : randInt(1, 4);

    for (let i = 0; i < times; i++) {
      const day = pickRandom(workingDays.filter((d) => d >= emp.startDate));
      const key = dateKey(day);
      if (leaveDays.get(emp.id)?.has(key)) continue;

      const isHolidayWork = isWeekend(day) || ctx.holidaySet.has(key);
      const hours = isHolidayWork ? randInt(4, 8) : randInt(1, 4);
      const startHour = isHolidayWork ? 9 : 18;

      seq += 1;
      const roll = randInt(1, 100);
      const status =
        roll <= 85
          ? ('APPROVED' as const)
          : roll <= 93
            ? ('REJECTED' as const)
            : ('SUBMITTED' as const);

      await prisma.overtimeRequest.create({
        data: {
          requestNo: `OT-2569-${String(seq).padStart(5, '0')}`,
          employeeId: emp.id,
          workDate: day,
          startTime: atBangkokTime(day, startHour, 0),
          endTime: atBangkokTime(day, startHour + hours, 0),
          breakMinutes: hours >= 5 ? 60 : 0,
          totalHours: hours.toFixed(2),
          workType: isHolidayWork ? 'HOLIDAY' : 'WORKDAY',
          reason: isHolidayWork
            ? pickRandom([
                'ปิดยอดสิ้นเดือน',
                'ตรวจนับสต๊อกประจำไตรมาส',
                'งานเร่งส่งลูกค้า',
              ])
            : pickRandom([
                'งานค้างส่งพรุ่งนี้',
                'เตรียมเอกสารประชุม',
                'จัดส่งสินค้ารอบพิเศษ',
              ]),
          status,
          submittedAt: atBangkokTime(day, 16, 0),
          submittedById: emp.userId,
          ...(status === 'APPROVED'
            ? { approvedAt: atBangkokTime(day, 17, 0) }
            : {}),
          ...(status === 'REJECTED'
            ? {
                rejectedAt: atBangkokTime(day, 17, 0),
                note: 'งานนี้ทำในเวลาได้ ไม่อนุมัติ OT',
              }
            : {}),
        },
      });
      created += 1;
    }
  }
  done('คำขอ OT', created);
}

/* ============================== ลงเวลา ============================== */
async function seedAttendance(
  ctx: Awaited<ReturnType<typeof loadContext>>,
  leaveDays: Map<string, Set<string>>,
) {
  step('ลงเวลาเข้า-ออกรายวัน');

  const location = await prisma.attendanceLocation.findFirstOrThrow();
  const days = eachDay(
    dateOnly(ATTENDANCE_FROM),
    dateOnly(ATTENDANCE_TO),
  ).filter((d) => isWorkingDay(d, ctx.holidaySet));

  const logs: {
    employeeId: string;
    workDate: Date;
    logType: 'CHECK_IN' | 'CHECK_OUT';
    logTime: Date;
    channel: 'WEB' | 'MOBILE' | 'DEVICE';
    source: string;
    locationId: string;
    session: string;
  }[] = [];

  let absent = 0;
  let late = 0;
  let missingOut = 0;

  for (const emp of ctx.employees) {
    const empLeave = leaveDays.get(emp.id) ?? new Set<string>();

    for (const day of days) {
      if (day < emp.startDate) continue; // ยังไม่เป็นพนักงาน
      if (empLeave.has(dateKey(day))) continue; // วันลา ไม่ต้องลงเวลา

      /* ขาดงานโดยไม่ลา — เกิดน้อยมาก ประมาณ 1% ของวันทำงาน */
      if (chance(1)) {
        absent += 1;
        continue;
      }

      /*
       * เวลาเข้างานกระจายแบบคนจริง
       * ส่วนใหญ่มาก่อนเวลา มีมาสายประปราย และมีสายหนักนาน ๆ ครั้ง
       */
      const roll = randInt(1, 100);
      let hour = 8;
      let minute: number;
      if (roll <= 70) {
        minute = randInt(0, 25); // มาก่อนเวลา 08:00-08:25
      } else if (roll <= 88) {
        minute = randInt(26, 35); // ฉิวเฉียด ยังอยู่ในช่วงผ่อนผัน
      } else if (roll <= 97) {
        minute = randInt(36, 59); // มาสาย
        late += 1;
      } else {
        hour = 9;
        minute = randInt(0, 45); // สายหนัก
        late += 1;
      }

      const channel =
        emp.positionCode === 'OPR'
          ? ('DEVICE' as const)
          : chance(35)
            ? ('MOBILE' as const)
            : ('WEB' as const);

      logs.push({
        employeeId: emp.id,
        workDate: day,
        logType: 'CHECK_IN',
        logTime: atBangkokTime(day, hour, minute),
        channel,
        source: channel,
        locationId: location.id,
        session: 'MORNING',
      });

      /*
       * สแกนเข้าช่วงบ่ายหลังพักเที่ยง
       * นโยบายของบริษัทตั้ง missingPenaltyMode เป็น PER_SESSION และมีกำหนด
       * afternoonCheckInDeadline ไว้ ถ้าไม่มีรายการนี้ ระบบจะมองว่าขาดสแกนทุกวัน
       * แล้วสรุปรายวันทุกใบจะติดสถานะต้องตรวจสอบ จนคำนวณเงินเดือนไม่ได้
       */
      logs.push({
        employeeId: emp.id,
        workDate: day,
        logType: 'CHECK_IN',
        logTime: atBangkokTime(day, 12, randInt(35, 58)),
        channel,
        source: channel,
        locationId: location.id,
        session: 'AFTERNOON',
      });

      /* ลืมสแกนออก — เกิดจริงราว 2% ของวัน */
      if (chance(2)) {
        missingOut += 1;
        continue;
      }

      logs.push({
        employeeId: emp.id,
        workDate: day,
        logType: 'CHECK_OUT',
        logTime: atBangkokTime(day, 17, randInt(30, 59)),
        channel,
        source: channel,
        locationId: location.id,
        session: 'AFTERNOON',
      });
    }
  }

  /* เขียนเป็นก้อน ไม่งั้น 40 คน × 70 วัน จะยิงทีละแถวช้ามาก */
  const CHUNK = 2000;
  for (let i = 0; i < logs.length; i += CHUNK) {
    await prisma.attendanceLog.createMany({ data: logs.slice(i, i + CHUNK) });
  }

  done('รายการลงเวลา', logs.length);
  done('วันที่มาสาย', late);
  done('วันที่ขาดงานโดยไม่ลา', absent);
  done('วันที่ลืมสแกนออก', missingOut);
}

/* ============================== ขอแก้เวลา ============================== */
async function seedTimeAdjust(ctx: Awaited<ReturnType<typeof loadContext>>) {
  step('คำขอแก้ไขเวลา (จากวันที่ลืมสแกนออก)');

  /* หาวันที่มีแต่สแกนเข้าไม่มีสแกนออก แล้วให้พนักงานยื่นขอแก้ */
  const incomplete = await prisma.$queryRaw<
    { employeeId: string; workDate: Date }[]
  >`
    SELECT "employeeId", "workDate"
    FROM attendance_logs
    GROUP BY "employeeId", "workDate"
    HAVING count(*) FILTER (WHERE "logType" = 'CHECK_OUT') = 0
    LIMIT 30`;

  const userByEmployee = new Map(
    ctx.employees.map((e) => [
      e.id,
      { userId: e.userId, supervisorId: e.supervisorId },
    ]),
  );

  let created = 0;
  for (const [i, row] of incomplete.entries()) {
    const info = userByEmployee.get(row.employeeId);
    const roll = randInt(1, 100);
    const status =
      roll <= 70
        ? ('APPROVED' as const)
        : roll <= 88
          ? ('SUBMITTED' as const)
          : ('REJECTED' as const);

    await prisma.timeAdjustRequest.create({
      data: {
        requestNo: `TA-2569-${String(i + 1).padStart(5, '0')}`,
        employeeId: row.employeeId,
        // ไม่มีคอลัมน์ workDate — วันที่ของคำขออยู่ใน requestedLogTime
        adjustType: 'MISSING_LOG',
        targetLogType: 'CHECK_OUT',
        requestedLogTime: atBangkokTime(row.workDate, 17, 35),
        reason: pickRandom([
          'ลืมสแกนออก เครื่องสแกนค้าง',
          'ออกไปส่งเอกสารลูกค้าแล้วกลับบ้านเลย',
          'ลืมสแกนออกจริง ๆ ขออนุญาตแก้ไข',
        ]),
        status,
        submittedAt: atBangkokTime(row.workDate, 9, 0),
        submittedById: info?.userId ?? null,
        ...(status === 'APPROVED'
          ? { approvedAt: atBangkokTime(row.workDate, 11, 0) }
          : {}),
        ...(status === 'REJECTED'
          ? { rejectedAt: atBangkokTime(row.workDate, 11, 0) }
          : {}),
      },
    });
    created += 1;
  }
  done('คำขอแก้ไขเวลา', created);
}

/* ============================== MAIN ============================== */
async function main() {
  console.log('===== สร้างข้อมูลจำลอง ระยะที่ 2: การใช้งาน 3 เดือน =====');
  const ctx = await loadContext();
  console.log(
    `     พนักงาน ${ctx.employees.length} คน · ช่วง ${ATTENDANCE_FROM} ถึง ${ATTENDANCE_TO}`,
  );

  const leaveDays = await seedLeaveRequests(ctx);
  await seedOvertime(ctx, leaveDays);
  await seedAttendance(ctx, leaveDays);
  await seedTimeAdjust(ctx);

  console.log('\n===== ระยะที่ 2 เสร็จ =====');
}

main()
  .catch((error) => {
    console.error('\n❌ ล้มเหลว:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
