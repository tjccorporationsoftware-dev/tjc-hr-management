/**
 * ระยะที่ 3 — วงจรชีวิตพนักงาน
 * ----------------------------
 * สรรหา · รับเข้าทำงาน · ทดลองงาน · ประเมินผล · หนังสือเตือน · ร้องเรียน · ลาออก
 *
 * รันด้วย: npx tsx scripts/demo/stage3-lifecycle.ts
 */
import {
  addDays,
  atBangkokTime,
  dateOnly,
  done,
  money,
  pickRandom,
  prisma,
  randInt,
  step,
} from './lib';

const APPLICANT_FIRST = [
  'ณัฐวุฒิ',
  'พิมพ์ชนก',
  'ธนภัทร',
  'ชลธิชา',
  'กฤษณะ',
  'วรินทร',
  'ศิวกร',
  'อมรรัตน์',
  'ปรัชญา',
  'ณิชากร',
  'ธีรภัทร',
  'สุพิชญา',
];
const APPLICANT_LAST = [
  'สุขเกษม',
  'จันทร์ฉาย',
  'พงษ์เจริญ',
  'ทรัพย์อนันต์',
  'วงศ์สุวรรณ',
  'ศรีวิไล',
  'เกียรติกุล',
  'บุญประเสริฐ',
  'ธีระวัฒน์',
  'พูนทรัพย์',
];

/**
 * ล้างเฉพาะของที่สคริปต์นี้สร้าง เพื่อให้รันซ้ำได้
 * โดยไม่ต้องล้างพนักงานกับข้อมูลลงเวลาที่ระยะก่อนหน้าสร้างไว้
 */
async function resetOwnData() {
  step('ล้างข้อมูลของระยะนี้ (ให้รันซ้ำได้)');
  await prisma.jobOffer.deleteMany({});
  await prisma.jobInterview.deleteMany({});
  await prisma.jobApplication.deleteMany({});
  await prisma.jobPosting.deleteMany({});
  await prisma.evaluationResult.deleteMany({});
  await prisma.evaluationForm.deleteMany({});
  await prisma.probationRecord.deleteMany({});
  await prisma.disciplinaryHistory.deleteMany({});
  await prisma.warningLetter.deleteMany({});
  await prisma.complaint.deleteMany({});
  await prisma.offboardingTask.deleteMany({});
  await prisma.offboardingCase.deleteMany({});

  /* คืนสถานะพนักงานที่เคยถูกตั้งเป็นลาออกในรอบก่อน */
  await prisma.employee.updateMany({
    where: { status: 'RESIGNED' },
    data: { status: 'ACTIVE', employmentEndDate: null },
  });
  await prisma.user.updateMany({
    where: { status: 'SUSPENDED' },
    data: { status: 'ACTIVE' },
  });
  done('ล้างแล้ว');
}

async function loadContext() {
  const company = await prisma.company.findFirstOrThrow();
  const branches = await prisma.branch.findMany({
    where: { companyId: company.id },
  });
  const departments = await prisma.department.findMany({
    where: { companyId: company.id },
  });
  const positions = await prisma.position.findMany({
    where: { companyId: company.id },
  });
  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true,
      employeeCode: true,
      displayName: true,
      startDate: true,
      status: true,
      probationEndDate: true,
      supervisorId: true,
      userId: true,
      branchId: true,
      departmentId: true,
      positionMaster: { select: { code: true, nameTh: true } },
      compensations: {
        select: { baseSalary: true },
        take: 1,
        orderBy: { effectiveDate: 'desc' },
      },
    },
    orderBy: { employeeCode: 'asc' },
  });
  const hrUser = await prisma.user.findFirstOrThrow({
    where: { email: 'hr@tjc.co.th' },
  });
  return { company, branches, departments, positions, employees, hrUser };
}

type Ctx = Awaited<ReturnType<typeof loadContext>>;

/* ============================== สรรหา ============================== */
async function seedRecruitment(ctx: Ctx) {
  step('สรรหาบุคลากร — ประกาศงาน · ผู้สมัคร · สัมภาษณ์ · ใบเสนอจ้าง');

  const postingDefs = [
    {
      code: 'JOB-2569-001',
      title: 'เจ้าหน้าที่บัญชี',
      dept: 'FIN',
      pos: 'STAFF',
      openings: 2,
      status: 'OPEN',
      salary: [18000, 24000],
    },
    {
      code: 'JOB-2569-002',
      title: 'พนักงานคลังสินค้า',
      dept: 'OPS',
      pos: 'OPR',
      openings: 3,
      status: 'OPEN',
      salary: [12000, 15000],
    },
    {
      code: 'JOB-2569-003',
      title: 'เจ้าหน้าที่ฝ่ายบุคคลอาวุโส',
      dept: 'HR',
      pos: 'SR',
      openings: 1,
      status: 'OPEN',
      salary: [26000, 32000],
    },
    {
      code: 'JOB-2569-004',
      title: 'โปรแกรมเมอร์',
      dept: 'IT',
      pos: 'STAFF',
      openings: 2,
      status: 'ON_HOLD',
      salary: [25000, 35000],
    },
    {
      code: 'JOB-2569-005',
      title: 'พนักงานขายประจำสาขาระยอง',
      dept: 'SALES',
      pos: 'STAFF',
      openings: 1,
      status: 'CLOSED',
      salary: [18000, 25000],
    },
  ] as const;

  const stageCounts: Record<string, number> = {};
  let applicantSeq = 0;
  let interviews = 0;
  let offers = 0;

  for (const def of postingDefs) {
    const dept = ctx.departments.find((d) => d.code === def.dept);
    const pos = ctx.positions.find((p) => p.code === def.pos);
    const branch = def.title.includes('ระยอง')
      ? ctx.branches[1]
      : ctx.branches[0];

    const posting = await prisma.jobPosting.create({
      data: {
        companyId: ctx.company.id,
        branchId: branch.id,
        departmentId: dept?.id ?? null,
        positionId: pos?.id ?? null,
        code: def.code,
        title: def.title,
        description: `รับสมัคร${def.title} ประจำ${branch.nameTh}`,
        requirement:
          'วุฒิปริญญาตรีขึ้นไป มีประสบการณ์อย่างน้อย 1 ปี สื่อสารภาษาอังกฤษได้',
        employmentType: 'FULL_TIME',
        openings: def.openings,
        salaryMin: money(def.salary[0]),
        salaryMax: money(def.salary[1]),
        openedAt: dateOnly('2026-05-04'),
        closedAt: def.status === 'CLOSED' ? dateOnly('2026-07-10') : null,
        status: def.status,
        createdById: ctx.hrUser.id,
      },
    });

    /* ผู้สมัครกระจายทุกขั้นของกรวยการคัดเลือก */
    const pipeline: {
      stage: 'NEW' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'REJECTED';
      count: number;
    }[] = [
      { stage: 'NEW', count: randInt(2, 4) },
      { stage: 'SCREENING', count: randInt(1, 3) },
      { stage: 'INTERVIEW', count: randInt(1, 2) },
      { stage: 'OFFER', count: def.status === 'CLOSED' ? 1 : randInt(0, 1) },
      { stage: 'REJECTED', count: randInt(1, 3) },
    ];

    for (const p of pipeline) {
      for (let i = 0; i < p.count; i++) {
        applicantSeq += 1;
        const first = pickRandom(APPLICANT_FIRST);
        const last = pickRandom(APPLICANT_LAST);
        const appliedAt = atBangkokTime(
          dateOnly('2026-05-06'),
          10,
          applicantSeq % 60,
        );

        const application = await prisma.jobApplication.create({
          data: {
            companyId: ctx.company.id,
            postingId: posting.id,
            firstName: first,
            lastName: last,
            email: `applicant${applicantSeq}@gmail.com`,
            phone: `09${String(10000000 + applicantSeq * 371937).slice(0, 8)}`,
            currentPosition: pickRandom([
              'เจ้าหน้าที่บัญชี',
              'พนักงานทั่วไป',
              'เจ้าหน้าที่ธุรการ',
              '-',
            ]),
            expectedSalary: money(randInt(def.salary[0], def.salary[1])),
            stage: p.stage,
            appliedAt,
            stagedAt: appliedAt,
            rejectReason:
              p.stage === 'REJECTED'
                ? pickRandom([
                    'คุณสมบัติไม่ตรงกับตำแหน่ง',
                    'ประสบการณ์ยังไม่ถึงเกณฑ์',
                    'เงินเดือนที่คาดหวังสูงกว่ากรอบที่ตั้งไว้',
                  ])
                : null,
            createdById: ctx.hrUser.id,
          },
        });
        stageCounts[p.stage] = (stageCounts[p.stage] ?? 0) + 1;

        /* คนที่ถึงขั้นสัมภาษณ์ขึ้นไป ต้องมีนัดสัมภาษณ์จริง */
        if (['INTERVIEW', 'OFFER'].includes(p.stage)) {
          const interviewer = pickRandom(
            ctx.employees.filter((e) =>
              ['MGR', 'DIR', 'SUP'].includes(e.positionMaster?.code ?? ''),
            ),
          );
          await prisma.jobInterview.create({
            data: {
              applicationId: application.id,
              round: 1,
              scheduledAt: atBangkokTime(dateOnly('2026-05-20'), 10, 0),
              location: branch.nameTh,
              interviewerName: `${interviewer.employeeCode} · ${interviewer.displayName}`,
              interviewerId: interviewer.userId,
              result: p.stage === 'OFFER' ? 'PASSED' : 'PENDING',
              score: p.stage === 'OFFER' ? randInt(75, 92) : null,
              strength:
                p.stage === 'OFFER'
                  ? 'สื่อสารดี มีประสบการณ์ตรงกับตำแหน่ง'
                  : null,
              weakness:
                p.stage === 'OFFER'
                  ? 'ยังไม่เคยใช้ระบบ ERP ต้องอบรมเพิ่ม'
                  : null,
              note: p.stage === 'OFFER' ? 'แนะนำให้เสนอจ้าง' : null,
              completedAt:
                p.stage === 'OFFER'
                  ? atBangkokTime(dateOnly('2026-05-20'), 11, 30)
                  : null,
              createdById: ctx.hrUser.id,
            },
          });
          interviews += 1;
        }

        /* คนที่ถึงขั้นเสนอจ้าง ต้องมีใบเสนอจ้าง */
        if (p.stage === 'OFFER') {
          await prisma.jobOffer.create({
            data: {
              applicationId: application.id,
              offeredSalary: money(randInt(def.salary[0], def.salary[1])),
              startDate: dateOnly('2026-09-01'),
              probationDays: 119,
              expiresAt: dateOnly('2026-08-20'),
              status: 'SENT',
              sentAt: atBangkokTime(dateOnly('2026-07-15'), 14, 0),
              createdById: ctx.hrUser.id,
            },
          });
          offers += 1;
        }
      }
    }
  }

  done('ประกาศรับสมัคร', postingDefs.length);
  done('ผู้สมัคร', applicantSeq);
  for (const [stage, count] of Object.entries(stageCounts)) {
    console.log(`         ${stage.padEnd(10)} ${count}`);
  }
  done('นัดสัมภาษณ์', interviews);
  done('ใบเสนอจ้าง', offers);
}

/* ============================== ทดลองงาน ============================== */
async function seedProbation(ctx: Ctx) {
  step('ทดลองงาน');

  const probationers = ctx.employees.filter((e) => e.status === 'PROBATION');
  for (const emp of probationers) {
    await prisma.probationRecord.create({
      data: {
        companyId: ctx.company.id,
        employeeId: emp.id,
        startDate: emp.startDate,
        endDate: emp.probationEndDate ?? addDays(emp.startDate, 119),
        status: 'IN_PROGRESS',
        note: 'อยู่ระหว่างทดลองงาน รอบประเมินแรกผ่านเกณฑ์',
        createdById: ctx.hrUser.id,
      },
    });
  }

  /* คนที่เข้ามาก่อนหน้าและผ่านทดลองงานไปแล้ว — เก็บประวัติไว้ให้ครบ */
  const passed = ctx.employees
    .filter(
      (e) => e.status === 'ACTIVE' && e.startDate >= dateOnly('2025-01-01'),
    )
    .slice(0, 6);
  for (const emp of passed) {
    await prisma.probationRecord.create({
      data: {
        companyId: ctx.company.id,
        employeeId: emp.id,
        startDate: emp.startDate,
        endDate: addDays(emp.startDate, 119),
        status: 'PASSED',
        reviewDate: addDays(emp.startDate, 112),
        reviewedAt: addDays(emp.startDate, 115),
        reviewedById: ctx.hrUser.id,
        result: `ผ่าน — คะแนนประเมิน ${randInt(78, 95)}/100`,
        summary: 'ปฏิบัติงานได้ตามเป้าหมาย เข้ากับทีมได้ดี',
        recommendation: 'บรรจุเป็นพนักงานประจำ',
        createdById: ctx.hrUser.id,
      },
    });
  }

  done('อยู่ระหว่างทดลองงาน', probationers.length);
  done('ผ่านทดลองงานแล้ว', passed.length);
}

/* ============================== ประเมินผล ============================== */
async function seedPerformance(ctx: Ctx) {
  step('ประเมินผลการปฏิบัติงาน');

  const form = await prisma.evaluationForm.create({
    data: {
      companyId: ctx.company.id,
      code: 'EVAL-2569-MID',
      name: 'แบบประเมินผลกลางปี 2569',
      description: 'ประเมินผลการปฏิบัติงานรอบครึ่งปีแรก',
      status: 'ACTIVE',
      createdById: ctx.hrUser.id,
    },
  });

  const criteria = [
    { name: 'คุณภาพของงาน', max: 25 },
    { name: 'ปริมาณงานที่ทำได้', max: 25 },
    { name: 'ความรับผิดชอบและวินัย', max: 20 },
    { name: 'การทำงานเป็นทีม', max: 15 },
    { name: 'การพัฒนาตนเอง', max: 15 },
  ];

  let finalized = 0;
  let submitted = 0;
  let draft = 0;

  /* ประเมินเฉพาะพนักงานประจำ คนที่ยังทดลองงานใช้แบบประเมินทดลองงานแทน */
  for (const emp of ctx.employees.filter((e) => e.status === 'ACTIVE')) {
    const scores = criteria.map((c) => ({
      name: c.name,
      maxScore: c.max,
      score: Math.round(c.max * (0.6 + Math.random() * 0.4)),
    }));
    const total = scores.reduce((n, s) => n + s.score, 0);
    const max = criteria.reduce((n, c) => n + c.max, 0);

    const roll = randInt(1, 100);
    const status =
      roll <= 70 ? 'FINALIZED' : roll <= 90 ? 'SUBMITTED' : 'DRAFT';
    if (status === 'FINALIZED') finalized += 1;
    else if (status === 'SUBMITTED') submitted += 1;
    else draft += 1;

    await prisma.evaluationResult.create({
      data: {
        companyId: ctx.company.id,
        formId: form.id,
        employeeId: emp.id,
        evaluatorEmployeeId: emp.supervisorId,
        evaluationDate: dateOnly('2026-07-01'),
        periodName: 'ครึ่งปีแรก 2569',
        scoreItems: scores,
        totalScore: money(total),
        maxScore: money(max),
        percent: money(Math.round((total / max) * 10000) / 100),
        summary:
          total / max >= 0.85
            ? 'ผลงานดีเยี่ยม เป็นแบบอย่างให้ทีม'
            : total / max >= 0.7
              ? 'ผลงานอยู่ในเกณฑ์ดี ควรพัฒนาเรื่องการวางแผนงาน'
              : 'ผลงานพอใช้ ต้องปรับปรุงความสม่ำเสมอ',
        status,
        ...(status !== 'DRAFT'
          ? { submittedAt: atBangkokTime(dateOnly('2026-07-05'), 16, 0) }
          : {}),
        ...(status === 'FINALIZED'
          ? {
              finalizedAt: atBangkokTime(dateOnly('2026-07-10'), 10, 0),
              finalizedById: ctx.hrUser.id,
            }
          : {}),
        submittedById: emp.supervisorId ? undefined : undefined,
        createdById: ctx.hrUser.id,
      },
    });
  }

  done('แบบประเมิน', 1);
  done('ประเมินเสร็จสิ้น', finalized);
  done('ส่งแล้วรออนุมัติ', submitted);
  done('ร่าง', draft);
}

/* ============================== วินัยและร้องเรียน ============================== */
async function seedDiscipline(ctx: Ctx) {
  step('หนังสือเตือนและเรื่องร้องเรียน');

  /* คนที่มาสายบ่อยที่สุด 3 คนแรก ได้หนังสือเตือน */
  /*
   * ใช้ raw query แทน groupBy เพราะ groupBy ของ Prisma บนตารางนี้
   * ทำให้ TypeScript ไล่ type วนไม่จบ (AND/OR/NOT circular)
   */
  const lateRanking = await prisma.$queryRaw<
    { employeeId: string; lateCount: bigint }[]
  >`
    SELECT "employeeId", count(*) AS "lateCount"
    FROM attendance_daily_summaries
    WHERE "totalLateMinutes" > 0
    GROUP BY "employeeId"
    ORDER BY count(*) DESC
    LIMIT 3`;

  let warnings = 0;
  for (const [i, row] of lateRanking.entries()) {
    await prisma.warningLetter.create({
      data: {
        companyId: ctx.company.id,
        employeeId: row.employeeId,
        letterNo: `WL-2569-${String(i + 1).padStart(3, '0')}`,
        severity: i === 0 ? 'MAJOR' : 'MINOR',
        subject: 'มาปฏิบัติงานสายเกินเกณฑ์ที่บริษัทกำหนด',
        description: `พบว่ามาปฏิบัติงานสาย ${Number(row.lateCount)} ครั้งในรอบ 3 เดือน ซึ่งเกินเกณฑ์ที่บริษัทกำหนด จึงขอตักเตือนเพื่อให้ปรับปรุง`,
        correctiveAction:
          'ให้มาปฏิบัติงานตรงเวลา หากยังฝ่าฝืนจะพิจารณาโทษขั้นต่อไป',
        incidentDate: dateOnly('2026-07-15'),
        issuedDate: dateOnly('2026-07-20'),
        status: 'ISSUED',
        issuedAt: atBangkokTime(dateOnly('2026-07-20'), 11, 0),
        issuedById: ctx.hrUser.id,
        createdById: ctx.hrUser.id,
      },
    });
    warnings += 1;
  }
  done('หนังสือเตือน', warnings);

  const complaintDefs = [
    {
      title: 'เครื่องปรับอากาศในคลังสินค้าเสีย',
      description:
        'เครื่องปรับอากาศโซน B ไม่ทำงานมา 3 วัน อากาศร้อนมาก กระทบการทำงาน',
      status: 'RESOLVED' as const,
    },
    {
      title: 'ขอเพิ่มจุดจอดรถจักรยานยนต์',
      description: 'ที่จอดรถจักรยานยนต์ไม่พอ ต้องจอดริมถนน เสี่ยงถูกขโมย',
      status: 'IN_PROGRESS' as const,
    },
    {
      title: 'น้ำดื่มในห้องพักพนักงานหมดบ่อย',
      description: 'น้ำดื่มมักหมดช่วงบ่าย อยากให้เพิ่มรอบเติม',
      status: 'SUBMITTED' as const,
    },
  ];

  for (const [i, c] of complaintDefs.entries()) {
    const emp = ctx.employees[i * 5 + 3];
    await prisma.complaint.create({
      data: {
        companyId: ctx.company.id,
        employeeId: emp.id,
        complaintNo: `CP-2569-${String(i + 1).padStart(3, '0')}`,
        title: c.title,
        description: c.description,
        expectation: 'ขอให้ฝ่ายอาคารสถานที่ดำเนินการแก้ไข',
        category: 'สภาพแวดล้อมในการทำงาน',
        status: c.status,
        submittedAt: atBangkokTime(dateOnly('2026-06-15'), 13, 0),
        ...(c.status === 'RESOLVED'
          ? {
              handledAt: atBangkokTime(dateOnly('2026-06-20'), 9, 0),
              closedAt: atBangkokTime(dateOnly('2026-06-25'), 15, 0),
              note: 'แจ้งช่างเข้าซ่อมเรียบร้อยแล้ว ใช้งานได้ปกติ',
              handledById: ctx.hrUser.id,
            }
          : {}),
        submittedById: emp.userId,
      },
    });
  }
  done('เรื่องร้องเรียน', complaintDefs.length);
}

/* ============================== ลาออก ============================== */
async function seedOffboarding(ctx: Ctx) {
  step('การลาออกและพ้นสภาพ');

  /* เลือกพนักงานประจำที่ไม่ใช่ผู้บริหาร 2 คน */
  const candidates = ctx.employees.filter(
    (e) =>
      e.status === 'ACTIVE' &&
      !['MD', 'DIR'].includes(e.positionMaster?.code ?? ''),
  );

  const cases = [
    {
      emp: candidates[7],
      reasonType: 'RESIGNATION' as const,
      lastWorking: '2026-06-30',
      effective: '2026-06-30',
      status: 'COMPLETED' as const,
      reason: 'ได้งานใหม่ใกล้บ้าน',
    },
    {
      emp: candidates[15],
      reasonType: 'RESIGNATION' as const,
      lastWorking: '2026-08-25',
      effective: '2026-08-25',
      status: 'IN_PROGRESS' as const,
      reason: 'ย้ายภูมิลำเนากลับต่างจังหวัด',
    },
  ];

  for (const c of cases) {
    if (!c.emp) continue;
    await prisma.offboardingCase.create({
      data: {
        companyId: ctx.company.id,
        employeeId: c.emp.id,
        reasonType: c.reasonType,
        note: c.reason,
        lastWorkingDate: dateOnly(c.lastWorking),
        effectiveDate: dateOnly(c.effective),
        status: c.status,
        ...(c.status === 'COMPLETED'
          ? {
              completedAt: atBangkokTime(dateOnly(c.effective), 17, 0),
              completedById: ctx.hrUser.id,
              accessRevokedAt: atBangkokTime(dateOnly(c.effective), 18, 0),
              payrollStoppedAt: atBangkokTime(dateOnly(c.effective), 17, 30),
              socialSecurityNotifiedAt: atBangkokTime(
                dateOnly(c.effective),
                17,
                45,
              ),
            }
          : {}),
        createdById: ctx.hrUser.id,
      },
    });

    /* เคสที่ปิดแล้วต้องสะท้อนที่แฟ้มพนักงานด้วย ไม่งั้นเงินเดือนงวดถัดไปจะยังดึงคนนี้มาคิด */
    if (c.status === 'COMPLETED') {
      await prisma.employee.update({
        where: { id: c.emp.id },
        data: {
          status: 'RESIGNED',
          employmentEndDate: dateOnly(c.effective),
        },
      });
      if (c.emp.userId) {
        await prisma.user.update({
          where: { id: c.emp.userId },
          data: { status: 'SUSPENDED' },
        });
      }
    }
  }
  done('เคสลาออก', cases.filter((c) => c.emp).length);
}

/* ============================== MAIN ============================== */
async function main() {
  console.log('===== สร้างข้อมูลจำลอง ระยะที่ 3: วงจรชีวิตพนักงาน =====');
  await resetOwnData();
  const ctx = await loadContext();

  await seedRecruitment(ctx);
  await seedProbation(ctx);
  await seedPerformance(ctx);
  await seedDiscipline(ctx);
  await seedOffboarding(ctx);

  console.log('\n===== ระยะที่ 3 เสร็จ =====');
}

main()
  .catch((error) => {
    console.error('\n❌ ล้มเหลว:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
