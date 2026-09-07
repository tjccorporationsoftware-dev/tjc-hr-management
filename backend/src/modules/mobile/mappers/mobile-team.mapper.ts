/**
 * จอทีมของหัวหน้าบนมือถือ (จอ 21–22)
 *
 * ManagerService.getTeamSummary คืนข้อมูลครบมาก — สถานะวันนี้รายคน ยอดสะสม
 * ทั้งเดือน เดือนก่อนหน้า ตารางกะ และวันลาคงเหลือรายประเภท
 * บนจอคอมใช้หมด แต่บนมือถือหัวหน้าต้องการตอบสองคำถามเท่านั้น:
 * "วันนี้ใครยังไม่มา" กับ "เดือนนี้ใครมีปัญหาซ้ำ ๆ"
 *
 * โควตาวันลารายประเภทตัดออกโดยตั้งใจ — เป็นข้อมูลส่วนบุคคลที่หัวหน้า
 * ไม่จำเป็นต้องเห็นตอนดูภาพรวมทีม และทำให้ payload บวมโดยไม่ได้ใช้
 */

type MemberLike = {
  employee?: {
    displayName?: string | null;
    employeeCode?: string | null;
    firstName?: string | null;
    id?: string | null;
    lastName?: string | null;
    position?: string | null;
  } | null;
  month?: {
    absentDays?: unknown;
    lateDays?: unknown;
    lateMinutes?: unknown;
    missingDays?: unknown;
    otHours?: unknown;
  } | null;
  pendingRequests?: unknown;
  today?: {
    afternoonInAt?: Date | null;
    checkOutAt?: Date | null;
    hasMissingLog?: boolean | null;
    lateMinutes?: unknown;
    morningInAt?: Date | null;
    /** โอทีที่อนุมัติแล้วของ "วันนั้น" — คนละตัวกับ month.otHours ที่เป็นยอดสะสม */
    otMinutes?: unknown;
    status?: string | null;
  } | null;
};

type TeamSummaryLike = {
  date?: string | null;
  holiday?: { name?: string | null } | null;
  members?: MemberLike[] | null;
  month?: string | null;
  monthTotals?: Record<string, unknown> | null;
  today?: Record<string, unknown> | null;
};

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * ลำดับที่หัวหน้าต้องเห็นก่อน
 *
 * เรียงตาม "ต้องทำอะไรกับคนนี้ไหม" ไม่ใช่เรียงตามตัวอักษร
 * คนที่ยังไม่เข้างานต้องอยู่บนสุดเพราะเป็นสิ่งเดียวที่หัวหน้าทำอะไรได้ทันที
 * ส่วนคนที่ลาหรือทำงานนอกสถานที่เป็นเรื่องที่รู้อยู่แล้ว ไม่ต้องรีบ
 */
const STATUS_ORDER: Record<string, number> = {
  ABSENT: 0,
  NOT_CHECKED_IN: 1,
  LATE: 2,
  OFFSITE: 3,
  LEAVE: 4,
  PRESENT: 5,
  HOLIDAY: 6,
};

export function toMobileTeamSummary(summary: TeamSummaryLike) {
  const members = (summary.members ?? []).map((member) => {
    const employee = member.employee ?? null;
    const today = member.today ?? null;
    const month = member.month ?? null;

    const name =
      employee?.displayName ||
      [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') ||
      null;

    return {
      afternoonInAt: today?.afternoonInAt ?? null,
      checkOutAt: today?.checkOutAt ?? null,
      employeeCode: employee?.employeeCode ?? null,
      employeeId: employee?.id ?? null,
      hasMissingLog: Boolean(today?.hasMissingLog),
      lateMinutes: num(today?.lateMinutes),
      monthAbsentDays: num(month?.absentDays),
      monthLateDays: num(month?.lateDays),
      monthLateMinutes: num(month?.lateMinutes),
      monthMissingDays: num(month?.missingDays),
      monthOtHours: num(month?.otHours),
      morningInAt: today?.morningInAt ?? null,
      /* โอทีของวันที่กำลังดู — จอทีมใช้บอกว่าวันนี้มีคนทำโอทีกี่คน */
      otMinutes: num(today?.otMinutes),
      name,
      pendingRequests: num(member.pendingRequests),
      position: employee?.position ?? null,
      status: today?.status ?? 'NOT_CHECKED_IN',
    };
  });

  members.sort((left, right) => {
    const order =
      (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9);

    if (order !== 0) return order;

    /* ภายในกลุ่มเดียวกัน คนสายมากอยู่บน แล้วค่อยเรียงตามรหัสให้ตำแหน่งคงที่ */
    if (left.lateMinutes !== right.lateMinutes) {
      return right.lateMinutes - left.lateMinutes;
    }

    return (left.employeeCode ?? '').localeCompare(right.employeeCode ?? '');
  });

  const todayCounts = summary.today ?? {};
  const monthTotals = summary.monthTotals ?? {};

  return {
    date: summary.date ?? null,
    holidayName: summary.holiday?.name ?? null,
    members,
    month: summary.month ?? null,
    monthTotals: {
      absentDays: num(monthTotals.absentDays),
      attendanceRate: num(monthTotals.attendanceRate),
      lateDays: num(monthTotals.lateDays),
      lateMinutes: num(monthTotals.lateMinutes),
      leaveDays: num(monthTotals.leaveDays),
      missingDays: num(monthTotals.missingDays),
      otHours: num(monthTotals.otHours),
    },
    todayCounts: {
      ABSENT: num(todayCounts.ABSENT),
      HOLIDAY: num(todayCounts.HOLIDAY),
      LATE: num(todayCounts.LATE),
      LEAVE: num(todayCounts.LEAVE),
      NOT_CHECKED_IN: num(todayCounts.NOT_CHECKED_IN),
      OFFSITE: num(todayCounts.OFFSITE),
      PRESENT: num(todayCounts.PRESENT),
      teamTotal: num(todayCounts.teamTotal),
    },
  };
}

/* --------------------------------------------------- จอทีมส่วนที่เพิ่มภายหลัง
 *
 * สามจอด้านล่าง (รายชื่อ / ปฏิทิน / ประวัติ) เพิ่มเข้ามาตอนปิดช่องว่าง Phase 5
 * ยึดหลักเดียวกับ toMobileTeamSummary คือ **เลือกและจัดรูปเท่านั้น**
 * ตัวเลขทุกตัวมาจาก ManagerService ห้ามคำนวณใหม่ที่นี่
 */

type EmployeeLike = {
  branch?: { nameTh?: string | null } | null;
  department?: { nameTh?: string | null } | null;
  displayName?: string | null;
  email?: string | null;
  employeeCode?: string | null;
  employeeType?: { nameTh?: string | null } | null;
  firstName?: string | null;
  id?: string | null;
  lastName?: string | null;
  phone?: string | null;
  position?: string | null;
  positionMaster?: { nameTh?: string | null } | null;
  startDate?: Date | null;
  status?: string | null;
  supervisor?: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

const fullName = (employee: EmployeeLike | null | undefined) =>
  employee?.displayName ||
  [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') ||
  null;

/** ตำแหน่งจากตารางกลางมาก่อนข้อความอิสระ เพราะข้อความอิสระมักตกยุคกว่า */
const positionName = (employee: EmployeeLike | null | undefined) =>
  employee?.positionMaster?.nameTh || employee?.position || null;

const dateKey = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10) : null;

export function toMobileTeamMemberListItem(employee: EmployeeLike) {
  return {
    branch: employee.branch?.nameTh ?? null,
    department: employee.department?.nameTh ?? null,
    employeeCode: employee.employeeCode ?? null,
    id: employee.id ? String(employee.id) : '',
    name: fullName(employee),
    position: positionName(employee),
    status: employee.status ? String(employee.status) : null,
  };
}

type MemberDetailLike = {
  employee?: EmployeeLike | null;
  leaveBalances?: unknown[] | null;
  month?: Record<string, unknown> | null;
  pendingRequests?: unknown;
  previousMonth?: Record<string, unknown> | null;
  shift?: {
    afternoonDeadline?: string | null;
    checkoutFrom?: string | null;
    morningDeadline?: string | null;
    name?: string | null;
  } | null;
  today?: Record<string, unknown> | null;
};

/**
 * รายละเอียดลูกทีมรายคน
 *
 * ส่งอีเมลกับเบอร์มาด้วย เพราะสิ่งแรกที่หัวหน้าทำเมื่อเห็นว่าลูกทีมยังไม่มา
 * คือติดต่อคนนั้น จอนี้จึงต้องกดโทรได้เลยโดยไม่ต้องไปเปิดสมุดโทรศัพท์
 *
 * วันลาคงเหลือส่งเฉพาะประเภทที่มีโควตาหรือเคยใช้ไปแล้ว — ประเภทที่เป็นศูนย์
 * ทั้งแถวไม่มีความหมายกับใคร มีแต่ทำให้ต้องเลื่อนผ่านยาว ๆ
 */
export function toMobileTeamMemberDetail(payload: {
  date?: string | null;
  holiday?: { name?: string | null } | null;
  member: MemberDetailLike;
  month?: string | null;
}) {
  const member = payload.member;
  const employee = member.employee ?? null;
  const today = member.today ?? {};
  const month = member.month ?? {};
  const previous = member.previousMonth ?? {};

  const balances = (member.leaveBalances ?? []) as {
    code?: string | null;
    entitlementDays?: unknown;
    leaveTypeId?: string;
    nameTh?: string | null;
    remainingDays?: unknown;
    usedDays?: unknown;
  }[];

  return {
    date: payload.date ?? null,
    holidayName: payload.holiday?.name ?? null,
    leaveBalances: balances
      .filter(
        (balance) =>
          num(balance.entitlementDays) > 0 || num(balance.usedDays) > 0,
      )
      .map((balance) => ({
        code: balance.code ?? null,
        entitlementDays: num(balance.entitlementDays),
        leaveTypeId: balance.leaveTypeId ?? null,
        name: balance.nameTh ?? null,
        remainingDays: num(balance.remainingDays),
        usedDays: num(balance.usedDays),
      })),
    month: payload.month ?? null,
    monthTotals: {
      absentDays: num(month.absentDays),
      attendanceRate: num(month.attendanceRate),
      lateDays: num(month.lateDays),
      lateMinutes: num(month.lateMinutes),
      leaveDays: num(month.leaveDays),
      missingDays: num(month.missingDays),
      otHours: num(month.otHours),
    },
    pendingRequests: num(member.pendingRequests),
    previousMonthTotals: {
      absentDays: num(previous.absentDays),
      lateDays: num(previous.lateDays),
      lateMinutes: num(previous.lateMinutes),
      missingDays: num(previous.missingDays),
      otHours: num(previous.otHours),
    },
    profile: {
      branch: employee?.branch?.nameTh ?? null,
      department: employee?.department?.nameTh ?? null,
      email: employee?.email ?? null,
      employeeCode: employee?.employeeCode ?? null,
      employeeType: employee?.employeeType?.nameTh ?? null,
      id: employee?.id ? String(employee.id) : '',
      name: fullName(employee),
      phone: employee?.phone ?? null,
      position: positionName(employee),
      startDate: employee?.startDate ?? null,
      status: employee?.status ? String(employee.status) : null,
      supervisor: fullName(employee?.supervisor),
    },
    shift: member.shift
      ? {
          afternoonDeadline: member.shift.afternoonDeadline ?? null,
          checkoutFrom: member.shift.checkoutFrom ?? null,
          morningDeadline: member.shift.morningDeadline ?? null,
          name: member.shift.name ?? null,
        }
      : null,
    today: {
      afternoonInAt: (today.afternoonInAt as Date | null) ?? null,
      checkOutAt: (today.checkOutAt as Date | null) ?? null,
      hasMissingLog: Boolean(today.hasMissingLog),
      isOverdue: Boolean(today.isOverdue),
      lateMinutes: num(today.lateMinutes),
      morningInAt: (today.morningInAt as Date | null) ?? null,
      otMinutes: num(today.otMinutes),
      status: today.status ? String(today.status) : 'NOT_CHECKED_IN',
    },
  };
}

type CalendarDayLike = {
  awayTotal?: unknown;
  date?: string;
  holidayName?: string | null;
  isHoliday?: boolean;
  leaves?: {
    employeeId?: string;
    leaveType?: string | null;
    name?: string | null;
    status?: string;
  }[];
  offsites?: {
    employeeId?: string;
    locationName?: string | null;
    name?: string | null;
  }[];
  weekday?: unknown;
};

/**
 * ปฏิทินทีมรายเดือน
 *
 * ManagerService คืนรูปที่ใช้ได้เกือบตรงอยู่แล้ว ที่ทำตรงนี้คือบังคับชนิดข้อมูล
 * ให้แน่นอน เพราะฝั่งแอปอ่านด้วย zod ที่เข้มกว่าเว็บ ค่า null ที่เว็บปล่อยผ่าน
 * จะทำให้ทั้งจอขึ้น error แทนที่จะแสดงช่องว่าง
 */
export function toMobileTeamCalendar(calendar: {
  days?: CalendarDayLike[] | null;
  month?: string | null;
  teamTotal?: unknown;
}) {
  return {
    days: (calendar.days ?? []).map((day) => ({
      awayTotal: num(day.awayTotal),
      date: day.date ?? null,
      holidayName: day.holidayName ?? null,
      isHoliday: Boolean(day.isHoliday),
      leaves: (day.leaves ?? []).map((leave) => ({
        employeeId: leave.employeeId ?? null,
        leaveType: leave.leaveType ?? null,
        name: leave.name ?? null,
        status: leave.status ?? null,
      })),
      offsites: (day.offsites ?? []).map((offsite) => ({
        employeeId: offsite.employeeId ?? null,
        locationName: offsite.locationName ?? null,
        name: offsite.name ?? null,
      })),
      weekday: num(day.weekday),
    })),
    month: calendar.month ?? null,
    teamTotal: num(calendar.teamTotal),
  };
}

type AttendanceLogLike = {
  channel?: string | null;
  employee?: EmployeeLike | null;
  id?: string;
  isOffsite?: boolean | null;
  location?: { nameTh?: string | null } | null;
  logTime?: Date | null;
  logType?: string | null;
  note?: string | null;
  session?: string | null;
  status?: string | null;
  workDate?: Date | null;
};

export function toMobileTeamAttendanceLog(log: AttendanceLogLike) {
  return {
    channel: log.channel ? String(log.channel) : null,
    employeeCode: log.employee?.employeeCode ?? null,
    employeeId: log.employee?.id ? String(log.employee.id) : null,
    employeeName: fullName(log.employee),
    id: log.id ? String(log.id) : '',
    isOffsite: Boolean(log.isOffsite),
    locationName: log.location?.nameTh ?? null,
    logTime: log.logTime ?? null,
    logType: log.logType ? String(log.logType) : null,
    note: log.note ?? null,
    session: log.session ?? null,
    status: log.status ? String(log.status) : null,
    workDate: dateKey(log.workDate),
  };
}

/**
 * คำขอของทีมในรายการรวม
 *
 * ตัวใบใช้ mapper ชุดเดียวกับคำขอของพนักงานเอง (toMobileRequest) เพื่อให้ป้าย
 * สถานะ ชื่อประเภท และรูปแบบช่วงวันที่บนจอทีมตรงกับที่เจ้าตัวเห็นเป๊ะ ๆ
 * ที่เติมเข้ามาคือ "ใครยื่น" ซึ่งเป็นสิ่งเดียวที่จอทีมต้องการเพิ่ม
 */
export function toMobileTeamRequestItem(
  base: Record<string, unknown>,
  employee: EmployeeLike | null | undefined,
) {
  return {
    ...base,
    employeeCode: employee?.employeeCode ?? null,
    employeeId: employee?.id ? String(employee.id) : null,
    employeeName: fullName(employee),
  };
}
