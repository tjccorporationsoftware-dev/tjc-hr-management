/**
 * ภาพรวมบริษัทสำหรับผู้บริหาร (จอ 23–24)
 *
 * Dashboard ผู้บริหารฝั่งเว็บคืนข้อมูลหลายพันบรรทัด — รายการ payroll run ทุกงวด
 * ผังแผนก รายการรอตรวจของ HR ฯลฯ บนมือถือใช้ไม่ได้เลยและกิน bandwidth
 * ที่นี่ย่อเหลือสิ่งที่ผู้บริหารดูจริงบนมือถือ: วันนี้เป็นยังไง กับค่าจ้างทั้งสิบสองเดือนของปี
 *
 * **ห้ามคำนวณยอดเงินใหม่ที่นี่** ทุกตัวเลขมาจาก DashboardService ตรง ๆ
 * ถ้าเลขในแอปไม่ตรงกับที่ผู้บริหารเห็นบนเว็บ จะกลายเป็นเรื่องทันที
 */

type ExecutiveSummaryLike = {
  manpower?: {
    metrics?: {
      activeEmployees?: unknown;
      currentMonthNewEmployees?: unknown;
      pendingRequests?: unknown;
      probationEmployees?: unknown;
      totalEmployees?: unknown;
    } | null;
  } | null;
  summary?: {
    approvedOtHours?: unknown;
    checkInToday?: unknown;
    lateToday?: unknown;
    leaveToday?: unknown;
    missingCheckInToday?: unknown;
  } | null;
};

type PayrollMonthLike = {
  employees?: unknown;
  hasRun?: boolean;
  label?: string | null;
  month?: unknown;
  netPay?: unknown;
  otherEarnings?: unknown;
};

type PayrollSummaryLike = {
  months?: PayrollMonthLike[] | null;
  year?: unknown;
};

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * จำนวนเดือนที่แสดงในกราฟแนวโน้ม
 *
 * เดิมเป็นหกเดือนและตัดเดือนที่ยังไม่ทำเงินเดือนทิ้ง — ปีที่เพิ่งเริ่มใช้ระบบจึง
 * เหลือแท่งเดียวและอ่านไม่ออกว่าเป็นแนวโน้มอะไร ผู้บริหารขอให้กางทั้งปีไว้เลย
 * เดือนที่ยังไม่ถึงรอบจ่ายส่งมาเป็นยอดศูนย์พร้อม `hasRun: false` ให้แอปวาดเป็น
 * ช่องว่างรอไว้ ไม่ใช่ยอดที่ร่วงลง
 */
const TREND_MONTHS = 12;

export function toMobileExecutiveSummary(params: {
  executive: ExecutiveSummaryLike;
  /** null เมื่อผู้ใช้ไม่มีสิทธิ์ดูข้อมูลเงินเดือน */
  payroll: PayrollSummaryLike | null;
}) {
  const metrics = params.executive.manpower?.metrics ?? {};
  const summary = params.executive.summary ?? {};

  const totalEmployees = num(metrics.totalEmployees);
  const checkedIn = num(summary.checkInToday);
  const onLeave = num(summary.leaveToday);

  /*
   * "ยังไม่เข้า" คำนวณจากพนักงานที่ทำงานอยู่ ลบคนที่ลงเวลาแล้วและคนที่ลา
   * ตัดที่ศูนย์เสมอ — ถ้าติดลบแปลว่ามีคนลงเวลาแต่ไม่นับเป็นพนักงานที่ active
   * (เช่นเพิ่งลาออกกลางเดือน) ซึ่งไม่ควรโชว์เป็นเลขติดลบให้ผู้บริหารงง
   */
  const activeEmployees = num(metrics.activeEmployees);
  const notCheckedIn = Math.max(activeEmployees - checkedIn - onLeave, 0);

  /* ทั้งปีตามที่ DashboardService ส่งมา (สิบสองเดือนพอดี) ไม่ตัดเดือนที่ยังว่าง */
  const trend = (params.payroll?.months ?? [])
    .slice(-TREND_MONTHS)
    .map((month) => ({
      employees: num(month.employees),
      hasRun: Boolean(month.hasRun),
      label: month.label ?? String(month.month ?? ''),
      /** เลขเดือน 1–12 ให้แอปวางแท่งลงช่องที่ถูกต้องแม้ backend ส่งไม่ครบปี */
      month: num(month.month),
      netPay: num(month.netPay),
      otherEarnings: num(month.otherEarnings),
    }));

  return {
    manpower: {
      activeEmployees,
      newThisMonth: num(metrics.currentMonthNewEmployees),
      pendingRequests: num(metrics.pendingRequests),
      probationEmployees: num(metrics.probationEmployees),
      totalEmployees,
    },
    /** true = ผู้ใช้มีสิทธิ์ดูข้อมูลเงินเดือน ถ้า false แอปจะซ่อนส่วนนั้นแทนที่จะโชว์ศูนย์ */
    payrollVisible: params.payroll !== null,
    today: {
      approvedOtHours: num(summary.approvedOtHours),
      checkedIn,
      late: num(summary.lateToday),
      missingCheckIn: num(summary.missingCheckInToday),
      notCheckedIn,
      onLeave,
    },
    trend,
    /** ปีของกราฟค่าจ้าง ใช้เป็นคำกำกับหัวข้อ null เมื่อไม่มีสิทธิ์ดูเงินเดือน */
    trendYear: params.payroll ? num(params.payroll.year) || null : null,
  };
}

/* ------------------------------------------- ห้องผู้บริหารส่วนที่เพิ่มภายหลัง
 *
 * สี่จอด้านล่าง (ตัวชี้วัด / กำลังคน / เวลาวันนี้รายคน / เงินเดือน) เพิ่มตอน
 * ปิดช่องว่าง Phase 6 ทุกตัวเลขยังมาจาก DashboardService และ ManpowerService
 * เหมือนเดิม ที่นี่ทำแค่ตัดของที่จอมือถือไม่ได้ใช้ทิ้ง
 *
 * เหตุผลที่ต้องตัด: executive insights ฝั่งเว็บคืนแผนกทุกแผนกพร้อมตัวชี้วัด
 * เจ็ดตัว บวก trend หกเดือน บวกรายชื่อพนักงานล่าสุด รวมแล้วหลักร้อย KB
 * ซึ่งบนเน็ตมือถือคือการรอสามถึงห้าวินาทีก่อนเห็นอะไรสักอย่าง
 */

const str = (value: unknown) =>
  value === null || value === undefined ? null : String(value);

/**
 * ใบคำขอที่แนบไปกับพนักงานหนึ่งคน (ใช้เปิดป๊อปอัพรายละเอียดในแอป)
 *
 * ตัดให้เหลือเท่าที่จอมือถือแสดงจริง — ไม่ส่งสายอนุมัติหรือไฟล์แนบมาด้วย
 * เพราะจอนี้เป็นจอ "ดูว่าใครลา/ทำโอที" ไม่ใช่จออนุมัติ
 */
const toRequests = (value: unknown) =>
  (Array.isArray(value) ? (value as Record<string, unknown>[]) : []).map((row) => ({
    amount: num(row.amount),
    approvedAt: str(row.approvedAt),
    clock: str(row.clock),
    detail: str(row.detail),
    from: str(row.from),
    id: str(row.id) ?? '',
    kind: str(row.kind) === 'OT' ? ('OT' as const) : ('LEAVE' as const),
    label: str(row.label) ?? '',
    reason: str(row.reason),
    submittedAt: str(row.submittedAt),
    to: str(row.to),
  }));

/** จำนวนหน่วยงานที่ส่งให้จอมือถือ — เกินกว่านี้ต้องเข้าจอ breakdown เต็ม */
const TOP_DEPARTMENTS = 8;

type InsightsLike = {
  cost?: Record<string, unknown> | null;
  departments?: Record<string, unknown>[] | null;
  discipline?: Record<string, unknown> | null;
  generatedAt?: string | null;
  periodLabel?: string | null;
  trend?: Record<string, unknown>[] | null;
  workforce?: Record<string, unknown> | null;
};

/**
 * ตัวชี้วัดระดับผู้บริหาร — อัตราส่วน ต่อหัว และเทียบเดือนก่อน
 *
 * ทุกตัวจับคู่กับค่าของเดือนก่อนหน้าไว้ด้วยกัน เพราะตัวเลขเดี่ยว ๆ อย่าง
 * "อัตราขาดงาน 2.1%" ไม่บอกอะไรเลยถ้าไม่รู้ว่าเดือนก่อนเท่าไร — จอมือถือ
 * ต้องตัดสินใจได้จากการมองครั้งเดียว ไม่ใช่ให้ผู้ใช้ไปเปิดเดือนก่อนมาเทียบเอง
 */
export function toMobileExecutiveInsights(insights: InsightsLike) {
  const workforce = insights.workforce ?? {};
  const discipline = insights.discipline ?? {};
  const cost = insights.cost ?? {};

  return {
    cost: {
      costPerHead: num(cost.costPerHead),
      costPerHeadPrev: num(cost.costPerHeadPrev),
      earnings: num(cost.earnings),
      netPay: num(cost.netPay),
      otCostShare: num(cost.otCostShare),
      otHoursPerHead: num(cost.otHoursPerHead),
      otHoursPerHeadPrev: num(cost.otHoursPerHeadPrev),
      otPay: num(cost.otPay),
    },
    departments: (insights.departments ?? [])
      .slice(0, TOP_DEPARTMENTS)
      .map((row) => ({
        absenceRate: num(row.absenceRate),
        costPerHead: num(row.costPerHead),
        headcount: num(row.headcount),
        id: str(row.id),
        label: str(row.label) ?? 'ไม่ระบุแผนก',
        lateMinutesPerHead: num(row.lateMinutesPerHead),
        otHoursPerHead: num(row.otHoursPerHead),
        turnoverRate: num(row.turnoverRate),
      })),
    discipline: {
      absenceRate: num(discipline.absenceRate),
      absenceRatePrev: num(discipline.absenceRatePrev),
      lateMinutesPerHead: num(discipline.lateMinutesPerHead),
      lateMinutesPerHeadPrev: num(discipline.lateMinutesPerHeadPrev),
      leaveDaysPerHead: num(discipline.leaveDaysPerHead),
      leaveDaysPerHeadPrev: num(discipline.leaveDaysPerHeadPrev),
      penaltyAmount: num(discipline.penaltyAmount),
      penaltyAmountPrev: num(discipline.penaltyAmountPrev),
    },
    generatedAt: insights.generatedAt ?? null,
    periodLabel: insights.periodLabel ?? null,
    trend: (insights.trend ?? []).map((row) => ({
      absenceRate: num(row.absenceRate),
      costPerHead: num(row.costPerHead),
      month: str(row.month) ?? '',
      otHoursPerHead: num(row.otHoursPerHead),
      turnoverRate: num(row.turnoverRate),
    })),
    workforce: {
      avgTenureMonths: num(workforce.avgTenureMonths),
      headcount: num(workforce.headcount),
      hired: num(workforce.hired),
      hiredPrev: num(workforce.hiredPrev),
      probationPassRate: num(workforce.probationPassRate),
      resigned: num(workforce.resigned),
      resignedPrev: num(workforce.resignedPrev),
      turnoverRate: num(workforce.turnoverRate),
      turnoverRatePrev: num(workforce.turnoverRatePrev),
    },
  };
}

type ChartGroupLike = {
  /** รหัสกลุ่มของมิติที่ไม่มี id จริงในฐานข้อมูล (ช่วงอายุ เพศ สถานะ) */
  code?: unknown;
  count?: unknown;
  id?: unknown;
  label?: unknown;
  name?: unknown;
  nameTh?: unknown;
  /** กราฟ "ตามตำแหน่ง" เก็บชื่อไว้ในคีย์นี้ ไม่ใช่ `label`/`name` */
  position?: unknown;
  total?: unknown;
  value?: unknown;
};

/**
 * กลุ่มของกราฟกำลังคน
 *
 * ManpowerService ตั้งชื่อฟิลด์ไม่เหมือนกันในแต่ละกราฟ (บางชุดใช้ `label`
 * บางชุดใช้ `nameTh`, บางชุดใช้ `count` บางชุดใช้ `total`) เพราะแต่ละกราฟ
 * ฝั่งเว็บอ่านฟิลด์ของตัวเองอยู่แล้ว ที่นี่ยุบให้เหลือรูปเดียว เพื่อให้แอปมี
 * คอมโพเนนต์กราฟตัวเดียวใช้ได้ทุกมิติ
 */
const toGroup = (row: ChartGroupLike) => ({
  count: num(row.count ?? row.total ?? row.value),
  /* มิติที่ไม่มี id จริง (ช่วงอายุ เพศ สถานะ) ใช้ `code` เป็นคีย์แทน จะได้ไม่
     ตกไปเป็น null แล้วให้แอปต้องสร้างคีย์จากชื่อกลุ่มเอง */
  id: str(row.id ?? row.code),
  /*
   * `position` ต้องอยู่ในลิสต์ด้วย — กราฟ "ตามตำแหน่ง" ของ ManpowerService
   * คืน `{ position, count }` ไม่ใช่ `{ label }` เหมือนกราฟอื่น ตกไปจึงกลาย
   * เป็น "ไม่ระบุ" ทั้งห้าสิบกว่ากลุ่มบนแอป ทั้งที่ข้อมูลมีชื่อครบ
   */
  label: str(row.label ?? row.nameTh ?? row.name ?? row.position) ?? 'ไม่ระบุ',
});

type ManpowerLike = {
  charts?: Record<string, ChartGroupLike[] | undefined> | null;
  filters?: Record<string, ChartGroupLike[] | undefined> | null;
  lists?: { latestEmployees?: Record<string, unknown>[] | null } | null;
  metrics?: Record<string, unknown> | null;
};

/**
 * กำลังคน — ตัวเลขรวม การแบ่งตามมิติ และตัวเลือกของตัวกรอง
 *
 * `filters` ส่งกลับไปด้วยเสมอ เพราะแอปต้องรู้ว่ามีบริษัท/สาขา/แผนกอะไรบ้าง
 * **ในขอบเขตของผู้ใช้คนนี้** จะได้ไม่แสดงตัวเลือกที่กดแล้วได้ผลลัพธ์ว่าง
 * และไม่ต้องยิง endpoint แยกอีกหนึ่งครั้งเพื่อเติมตัวเลือก
 */
export function toMobileExecutiveManpower(manpower: ManpowerLike) {
  const metrics = manpower.metrics ?? {};
  const charts = manpower.charts ?? {};
  const filters = manpower.filters ?? {};

  const groups = (rows: ChartGroupLike[] | undefined) =>
    (rows ?? []).map(toGroup);

  return {
    breakdown: {
      byAge: groups(charts.byAge),
      byBranch: groups(charts.byBranch),
      byCompany: groups(charts.byCompany),
      byDepartment: groups(charts.byDepartment),
      byEmployeeType: groups(charts.byEmployeeType),
      byGender: groups(charts.byGender),
      byPosition: groups(charts.byPosition),
      byStatus: groups(charts.byStatus),
    },
    filterOptions: {
      branches: groups(filters.branches),
      companies: groups(filters.companies),
      departments: groups(filters.departments),
      employeeTypes: groups(filters.employeeTypes),
    },
    metrics: {
      activeEmployees: num(metrics.activeEmployees),
      activeRate: num(metrics.activeRate),
      inactiveEmployees: num(metrics.inactiveEmployees),
      probationEmployees: num(metrics.probationEmployees),
      resignedEmployees: num(metrics.resignedEmployees),
      totalEmployees: num(metrics.totalEmployees),
    },
  };
}

type AttendanceTodayLike = {
  byBranch?: Record<string, unknown>[] | null;
  byDepartment?: Record<string, unknown>[] | null;
  filterOptions?: {
    branches?: ChartGroupLike[] | null;
    departments?: ChartGroupLike[] | null;
  } | null;
  generatedAt?: string | null;
  rows?: Record<string, unknown>[] | null;
  summary?: Record<string, unknown> | null;
  workDate?: string | null;
};

/**
 * เวลาทำงานวันนี้รายคน — ปลายทางของการ drill-down
 *
 * ส่งรายคนมาทั้งชุดตามที่ service กรองให้แล้ว ไม่แบ่งหน้า เพราะจอนี้เปิดหลัง
 * ผู้ใช้เลือกแผนกหรือสถานะแล้วเสมอ (เช่น "ขาดงานวันนี้ในแผนกผลิต") ซึ่งเหลือ
 * หลักสิบคน — การแบ่งหน้าจะทำให้ต้องเลื่อนโหลดเพื่อดูรายชื่อที่สั้นอยู่แล้ว
 */
export function toMobileExecutiveAttendanceToday(payload: AttendanceTodayLike) {
  const summary = payload.summary ?? {};

  /* แผนกกับสาขาใช้รูปร่างเดียวกัน ต่างแค่ป้ายตอนไม่ระบุหน่วย */
  const unit = (rows: Record<string, unknown>[] | null | undefined, fallback: string) =>
    (rows ?? []).map((row) => ({
      absent: num(row.absent),
      id: str(row.id),
      label: str(row.label ?? row.name) ?? fallback,
      late: num(row.late),
      leave: num(row.leave),
      otHours: num(row.otHours),
      otPeople: num(row.otPeople),
      present: num(row.present),
      total: num(row.total),
    }));

  return {
    byBranch: unit(payload.byBranch, 'ไม่ระบุสาขา'),
    byDepartment: unit(payload.byDepartment, 'ไม่ระบุแผนก'),
    filterOptions: {
      branches: (payload.filterOptions?.branches ?? []).map(toGroup),
      departments: (payload.filterOptions?.departments ?? []).map(toGroup),
    },
    generatedAt: payload.generatedAt ?? null,
    rows: (payload.rows ?? []).map((row) => ({
      avatarUrl: str(row.avatarUrl),
      branch: str(row.branch),
      branchId: str(row.branchId),
      checkOutAt: str(row.checkOutAt),
      department: str(row.department),
      departmentId: str(row.departmentId),
      employeeCode: str(row.employeeCode),
      hasMissingLog: Boolean(row.hasMissingLog),
      id: str(row.id) ?? '',
      late: Boolean(row.late),
      lateMinutes: num(row.lateMinutes),
      leaveType: str(row.leaveType),
      morningInAt: str(row.morningInAt ?? row.afternoonInAt),
      name: str(row.name) ?? 'ไม่ระบุชื่อ',
      otHours: num(row.otHours),
      position: str(row.position),
      requests: toRequests(row.requests),
      status: str(row.status) ?? 'UNKNOWN',
    })),
    summary: {
      absent: num(summary.absent),
      late: num(summary.late),
      leave: num(summary.leave),
      missingLog: num(summary.missingLog),
      otHours: num(summary.otHours),
      otPeople: num(summary.otPeople),
      present: num(summary.present),
      total: num(summary.total),
    },
    workDate: payload.workDate ?? null,
  };
}

type LeaveOtPeriodLike = {
  byBranch?: Record<string, unknown>[] | null;
  byDepartment?: Record<string, unknown>[] | null;
  from?: string | null;
  generatedAt?: string | null;
  rows?: Record<string, unknown>[] | null;
  summary?: Record<string, unknown> | null;
  to?: string | null;
};

/**
 * ลา/โอทีสะสมทั้งงวด
 *
 * ต่างจากจอรายวันตรงที่ทุกตัวเลขเป็น "ผลรวมของช่วง" ไม่ใช่สถานะ — วันลาจึงเป็น
 * ทศนิยมได้ (ลาครึ่งวัน) และไม่มีสถานะ PRESENT/ABSENT ให้ส่ง
 */
export function toMobileExecutiveLeaveOtPeriod(payload: LeaveOtPeriodLike) {
  const summary = payload.summary ?? {};

  const unit = (rows: Record<string, unknown>[] | null | undefined, fallback: string) =>
    (rows ?? []).map((row) => ({
      id: str(row.id),
      label: str(row.label ?? row.name) ?? fallback,
      leaveHours: num(row.leaveHours),
      leavePeople: num(row.leavePeople),
      otHours: num(row.otHours),
      otPeople: num(row.otPeople),
    }));

  return {
    byBranch: unit(payload.byBranch, 'ไม่ระบุสาขา'),
    byDepartment: unit(payload.byDepartment, 'ไม่ระบุแผนก'),
    from: payload.from ?? null,
    generatedAt: payload.generatedAt ?? null,
    rows: (payload.rows ?? []).map((row) => ({
      avatarUrl: str(row.avatarUrl),
      branch: str(row.branch),
      branchId: str(row.branchId),
      department: str(row.department),
      departmentId: str(row.departmentId),
      employeeCode: str(row.employeeCode),
      id: str(row.id) ?? '',
      leaveHours: num(row.leaveHours),
      name: str(row.name) ?? 'ไม่ระบุชื่อ',
      otHours: num(row.otHours),
      position: str(row.position),
      requests: toRequests(row.requests),
    })),
    summary: {
      leaveHours: num(summary.leaveHours),
      leavePeople: num(summary.leavePeople),
      otHours: num(summary.otHours),
      otPeople: num(summary.otPeople),
    },
    to: payload.to ?? null,
  };
}

type DailyCostUnitLike = {
  deduction?: unknown;
  id?: unknown;
  label?: unknown;
  leave?: unknown;
  overtime?: unknown;
  people?: unknown;
  total?: unknown;
  worked?: unknown;
};

type DailyCostLike = {
  amounts?: Record<string, unknown> | null;
  byBranch?: DailyCostUnitLike[] | null;
  byDepartment?: DailyCostUnitLike[] | null;
  counts?: Record<string, unknown> | null;
  date?: unknown;
  employeesWithoutOtPolicy?: unknown;
  employeesWithoutWage?: unknown;
  lateMinutes?: unknown;
  overtimeHours?: unknown;
  paidDays?: unknown;
  paidLeaveHours?: unknown;
  salaryDivisorDays?: unknown;
  unpaidLeaveHours?: unknown;
  workingHoursPerDay?: unknown;
};

/**
 * ค่าจ้างของวันเดียว คิดจากคนที่มาทำงานจริง
 *
 * ส่งตัวตั้ง (`salaryDivisorDays` / `workingHoursPerDay`) กับชั่วโมงลา/นาทีสาย
 * ติดไปด้วย เพราะจอต้องอธิบายได้ว่าแต่ละบรรทัดมาจากไหน — ยอดที่ไม่บอกวิธีคิด
 * จะถูกเอาไปเถียงกับสลิปแล้วไม่มีใครอธิบายส่วนต่างได้
 *
 * `employeesWithoutWage` คือคนที่มีค่าแรงในวันนั้นแต่ยังไม่มีบันทึกอัตรา
 * ค่าจ้าง ยอดรวมจะต่ำกว่าจริงเท่ากับคนกลุ่มนี้ จอต้องเตือน ไม่ใช่เงียบ
 *
 * `employeesWithoutOtPolicy` เป็นเรื่องเดียวกันแต่คนละช่อง — มีชั่วโมง OT
 * ที่จ่ายได้ แต่ยังไม่ได้ตั้งนโยบายอัตราให้คนกลุ่มนั้น ยอดค่าล่วงเวลาจึงขาด
 */
export function toMobileExecutiveDailyCost(cost: DailyCostLike) {
  const amounts = cost.amounts ?? {};
  const counts = cost.counts ?? {};

  const unit = (rows?: DailyCostUnitLike[] | null) =>
    (rows ?? []).map((row) => ({
      deduction: num(row.deduction),
      id: str(row.id),
      label: str(row.label) ?? 'ไม่ระบุ',
      leave: num(row.leave),
      overtime: num(row.overtime),
      people: num(row.people),
      total: num(row.total),
      worked: num(row.worked),
    }));

  return {
    amounts: {
      absence: num(amounts.absence),
      deduction: num(amounts.deduction),
      late: num(amounts.late),
      leave: num(amounts.leave),
      overtime: num(amounts.overtime),
      timePenalty: num(amounts.timePenalty),
      total: num(amounts.total),
      unpaidLeave: num(amounts.unpaidLeave),
      worked: num(amounts.worked),
    },
    byBranch: unit(cost.byBranch),
    byDepartment: unit(cost.byDepartment),
    counts: {
      absent: num(counts.absent),
      late: num(counts.late),
      leavePaid: num(counts.leavePaid),
      leaveUnpaid: num(counts.leaveUnpaid),
      overtime: num(counts.overtime),
      total: num(counts.total),
      worked: num(counts.worked),
    },
    date: str(cost.date),
    employeesWithoutOtPolicy: num(cost.employeesWithoutOtPolicy),
    employeesWithoutWage: num(cost.employeesWithoutWage),
    lateMinutes: num(cost.lateMinutes),
    overtimeHours: num(cost.overtimeHours),
    paidDays: num(cost.paidDays),
    paidLeaveHours: num(cost.paidLeaveHours),
    salaryDivisorDays: num(cost.salaryDivisorDays),
    unpaidLeaveHours: num(cost.unpaidLeaveHours),
    workingHoursPerDay: num(cost.workingHoursPerDay),
  };
}

type PayrollUnitLike = {
  earnings?: unknown;
  id?: unknown;
  label?: unknown;
  netPay?: unknown;
  people?: unknown;
};

type PayrollDetailLike = {
  availableYears?: unknown[] | null;
  latestMonth?: Record<string, unknown> | null;
  units?: {
    byBranch?: PayrollUnitLike[] | null;
    byDepartment?: PayrollUnitLike[] | null;
  } | null;
  composition?: {
    deductions?: Record<string, unknown>[] | null;
    earnings?: Record<string, unknown>[] | null;
  } | null;
  months?: (PayrollMonthLike & {
    baseSalary?: unknown;
    deductions?: unknown;
    socialSecurityEmployer?: unknown;
    tax?: unknown;
  })[] | null;
  totals?: Record<string, unknown> | null;
  year?: unknown;
};

/**
 * เงินเดือนระดับองค์กร — องค์ประกอบค่าแรงและแนวโน้มรายเดือน
 *
 * ไม่มีข้อมูลรายบุคคลในนี้เลยแม้แต่ช่องเดียว จอนี้เปิดด้วย PAYROLL_READ ซึ่ง
 * เป็นสิทธิ์ "ดูภาพรวมค่าจ้าง" ไม่ใช่ "ดูเงินเดือนของใครคนหนึ่ง" — การเผลอ
 * ใส่รายชื่อลงไปเท่ากับเปิดข้อมูลเงินเดือนรายคนให้ทุกคนที่ถือสิทธิ์นี้
 *
 * เดือนที่ยังไม่ได้ทำเงินเดือนถูกตัดออก ไม่ส่งมาเป็นศูนย์ — กราฟที่มีศูนย์
 * ต่อท้ายจะอ่านเหมือนค่าแรงร่วงเป็นหน้าผา ทั้งที่แค่ยังไม่ถึงรอบจ่าย
 *
 * `employerCost` คือเงินสมทบประกันสังคมฝั่งนายจ้าง ซึ่งเป็นต้นทุนที่ไม่ได้
 * อยู่ในยอดจ่ายพนักงาน ผู้บริหารที่ดูแค่ยอดสุทธิจะประเมินต้นทุนแรงงานต่ำไป
 */
export function toMobileExecutivePayroll(payroll: PayrollDetailLike) {
  const totals = payroll.totals ?? {};
  const latest = payroll.latestMonth ?? null;

  return {
    availableYears: (payroll.availableYears ?? [])
      .map((year) => num(year))
      .filter((year) => year > 0),
    /*
     * องค์ประกอบค่าแรงของงวดล่าสุด แยกฝั่งรายได้กับรายการหัก
     *
     * ต้องแยกสองฝั่งไว้ ไม่ยุบเป็นลิสต์เดียว เพราะรวมกันแล้วกราฟจะอ่านว่า
     * "ค่าล่วงเวลา 8 แสน กับ ภาษี 3 แสน" อยู่ระดับเดียวกัน ทั้งที่ตัวหนึ่ง
     * เป็นเงินจ่ายออกและอีกตัวเป็นเงินที่หักกลับ
     */
    composition: {
      deductions: (payroll.composition?.deductions ?? []).map((row) => ({
        amount: num(row.amount),
        label: str(row.label ?? row.key) ?? 'รายการหักอื่น',
      })),
      earnings: (payroll.composition?.earnings ?? []).map((row) => ({
        amount: num(row.amount),
        label: str(row.label ?? row.key) ?? 'รายได้อื่น',
      })),
    },
    months: (payroll.months ?? [])
      .filter((month) => month.hasRun)
      .map((month) => ({
        baseSalary: num(month.baseSalary),
        deductions: num(month.deductions),
        employees: num(month.employees),
        employerCost: num(month.socialSecurityEmployer),
        label: month.label ?? String(month.month ?? ''),
        netPay: num(month.netPay),
        otherEarnings: num(month.otherEarnings),
        tax: num(month.tax),
      })),
    totals: {
      baseSalary: num(totals.baseSalary),
      deductions: num(totals.deductions),
      employerCost: num(totals.socialSecurityEmployer),
      netPay: num(totals.netPay),
      otherEarnings: num(totals.otherEarnings),
      runCount: num(totals.runCount),
      tax: num(totals.tax),
    },
    /*
     * งวดล่าสุดที่จ่ายจริง — ตัวเลขที่ผู้บริหารถามถึงก่อนเสมอคือ "งวดที่แล้ว
     * จ่ายไปเท่าไร" ไม่ใช่ยอดสะสมทั้งปี จึงส่งแยกออกมาให้จอไม่ต้องไปไล่หา
     * เดือนล่าสุดที่มีเงินเอง (ตรรกะนั้นอยู่ที่ service แล้ว)
     */
    latest: latest
      ? {
          baseSalary: num(latest.baseSalary),
          deductions: num(latest.deductions),
          employees: num(latest.employees),
          employerCost: num(latest.socialSecurityEmployer),
          label: str(latest.label) ?? '',
          netPay: num(latest.netPay),
          otherEarnings: num(latest.otherEarnings),
          tax: num(latest.tax),
        }
      : null,
    /* ยอดของงวดล่าสุดแยกตามหน่วยงาน — ไม่ใช่ยอดสะสมทั้งปี ให้ตรงกับ `latest` */
    byBranch: unitCost(payroll.units?.byBranch),
    byDepartment: unitCost(payroll.units?.byDepartment),
    year: num(payroll.year) || null,
  };
}

/** แถวต้นทุนของหนึ่งหน่วยงาน — ตัดหน่วยที่ยอดเป็นศูนย์ทิ้ง ไม่ให้รกกราฟ */
function unitCost(rows?: PayrollUnitLike[] | null) {
  return (rows ?? [])
    .map((row) => ({
      earnings: num(row.earnings),
      id: str(row.id),
      label: str(row.label) ?? 'ไม่ระบุ',
      netPay: num(row.netPay),
      people: num(row.people),
    }))
    .filter((row) => row.netPay > 0);
}
