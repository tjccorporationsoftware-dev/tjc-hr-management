type AttendanceLogLike = {
  distanceFromApprovedLocationMeters?: number | null;
  gpsVerificationStatus?: string | null;
  id: string;
  isOffsite?: boolean | null;
  locationId?: string | null;
  locationVerified?: boolean | null;
  logTime: Date;
  logType: string;
  session?: string | null;
  status: string;
};

type PunchContextLike = {
  attendanceMethods: { allowed: string[]; geofenceRequired: boolean };
  currentSession: {
    canPunch: boolean;
    blockReason: string | null;
    closeTime: string;
    expectedTime: string;
    label: string;
    openTime: string;
    punchType: string;
    sessionCode: string;
  } | null;
  geofence: {
    latitude: number;
    longitude: number;
    name: string;
    radiusMeters: number;
  } | null;
  holiday: unknown;
  policy: { id: string; name: string; timezone: string };
  punchedAt: Date;
  sessionRules: { label: string; sessionCode: string }[];
  workDate: Date;
};

/**
 * แปลงผลจาก AttendanceService ให้เป็น payload ของ Native App
 * ทำแค่เลือก/เปลี่ยนชื่อ field — ห้ามคำนวณสถานะหรือระยะทางใหม่ที่นี่
 */
export function toMobilePunchContext(context: PunchContextLike) {
  const session = context.currentSession;

  return {
    workDate: context.workDate,
    serverNow: context.punchedAt,
    allowed: Boolean(session?.canPunch),
    reasonCode: resolveContextReasonCode(context),
    reason: session?.blockReason ?? null,
    holiday: context.holiday,
    policy: {
      id: context.policy.id,
      name: context.policy.name,
      timezone: context.policy.timezone,
    },
    currentSession: session
      ? {
          sessionCode: session.sessionCode,
          punchType: session.punchType,
          label: session.label,
          openTime: session.openTime,
          expectedTime: session.expectedTime,
          closeTime: session.closeTime,
        }
      : null,
    sessionRules: context.sessionRules.map((rule) => ({
      sessionCode: rule.sessionCode,
      label: rule.label,
    })),
    locationPolicy: {
      required: context.attendanceMethods.geofenceRequired,
      location: context.geofence
        ? {
            name: context.geofence.name,
            latitude: context.geofence.latitude,
            longitude: context.geofence.longitude,
            radiusMeters: context.geofence.radiusMeters,
          }
        : null,
    },
    // ยังไม่มีนโยบายบังคับถ่ายรูปใน backend ปัจจุบัน (ดู MobileFeatureFlagService)
    photoPolicy: { required: false, liveCaptureOnly: true },
    offlinePolicy: { allowed: false },
  };
}

function resolveContextReasonCode(context: PunchContextLike) {
  const holiday = context.holiday as { isHoliday?: boolean } | null;

  /*
   * วันหยุดไม่ใช่เหตุผลที่ห้ามลงเวลาอีกแล้ว — พนักงานถูกเรียกมาทำงานวันหยุดได้
   * เหลือเป็นเหตุผลเฉพาะตอนวันนั้นไม่มีรอบลงเวลาให้ใช้จริง ๆ เท่านั้น
   */
  if (!context.currentSession) {
    return holiday?.isHoliday ? 'DAY_OFF' : 'NO_ACTIVE_SHIFT';
  }

  if (!context.currentSession.canPunch) {
    return 'PUNCH_NOT_ALLOWED_NOW';
  }

  return null;
}

/* ---------------------------------------------------------------- ประวัติ */

type DailySummaryLike = {
  afternoonInAt?: Date | null;
  afternoonLateMinutes?: number | null;
  checkOutAt?: Date | null;
  earlyCheckoutMinutes?: number | null;
  hasMissingLog?: boolean | null;
  isAbsent?: boolean | null;
  leaveIsPaid?: boolean | null;
  leaveRequestId?: string | null;
  leaveType?: { nameTh?: string | null } | null;
  morningInAt?: Date | null;
  /*
   * ความสายแยกรอบ — มีในตารางอยู่แล้ว แต่ไม่เคยส่งขึ้นแอป แอปจึงบอกได้แค่ว่า
   * "สายกี่นาที" ไม่ได้บอกว่าสายรอบเช้าหรือรอบบ่าย ซึ่งเป็นคนละเรื่องกันเวลา
   * พนักงานจะยื่นแก้เวลา
   */
  morningLateMinutes?: number | null;
  offsiteMinutes?: number | null;
  payableOtMinutes?: number | null;
  /*
   * `policySnapshot.holiday.isHoliday` คือที่เดียวที่บอกว่าวันนั้นเป็นวันหยุด —
   * ตาราง AttendanceDailySummary ไม่มีคอลัมน์ธงวันหยุดแยกไว้ ตัวคำนวณเก็บไว้ใน
   * สแนปช็อตนโยบายของวันนั้นแทน
   */
  policySnapshot?: unknown;
  totalDeductionAmount?: unknown;
  totalLateMinutes?: number | null;
  workDate: Date;
};

/**
 * สถานะของวันสำหรับแสดงบนปฏิทิน
 *
 * เรียงลำดับตาม "สิ่งที่พนักงานต้องรีบจัดการ" ไม่ใช่ตามลำดับ field
 * ขาดงานมาก่อนเพราะกระทบเงิน แล้วค่อยเป็นเวลาที่ขาดซึ่งยื่นแก้ได้
 */
export type MobileAttendanceDayState =
  | 'ABSENT'
  | 'MISSING_LOG'
  | 'LEAVE'
  | 'LATE'
  | 'HOLIDAY'
  | 'PRESENT';

/** อ่านข้อมูลวันหยุดจากสแนปช็อตนโยบายของวันนั้น โดยไม่ต้องเชื่อรูปร่างของ JSON */
function readHoliday(summary: DailySummaryLike) {
  const snapshot = summary.policySnapshot as
    | { holiday?: { isHoliday?: unknown; name?: unknown } }
    | null
    | undefined;

  const name = snapshot?.holiday?.name;

  return {
    isHoliday: Boolean(snapshot?.holiday?.isHoliday),
    /*
     * วันหยุดประจำสัปดาห์ไม่มีชื่อ (name เป็น null) ต่างจากวันหยุดนักขัตฤกษ์
     * ที่มีชื่อจริง แอปจึงต้องเผื่อทั้งสองแบบ ไม่ใช่คาดว่ามีชื่อเสมอ
     */
    name: typeof name === 'string' && name.trim() ? name.trim() : null,
  };
}

function isHolidaySummary(summary: DailySummaryLike): boolean {
  return readHoliday(summary).isHoliday;
}

function resolveDayState(summary: DailySummaryLike): MobileAttendanceDayState {
  if (summary.isAbsent) return 'ABSENT';
  if (summary.hasMissingLog) return 'MISSING_LOG';
  if (summary.leaveRequestId) return 'LEAVE';
  if ((summary.totalLateMinutes ?? 0) > 0) return 'LATE';
  /*
   * วันหยุดมาหลัง LATE เพราะวันหยุดที่ถูกเรียกมาทำงานแล้วมาสายยังต้องขึ้นว่า
   * "มาสาย" — ส่วนวันหยุดที่ไม่ได้มาทำงานเดิมตกมาเป็น PRESENT แล้วขึ้นว่า
   * "ปกติ" ซึ่งอ่านเหมือนวันทำงานที่มาตรงเวลา
   */
  if (isHolidaySummary(summary)) return 'HOLIDAY';

  return 'PRESENT';
}

const toAmount = (value: unknown) => {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? amount : 0;
};

/**
 * แปลงสรุปรายวันเป็นรายการสำหรับปฏิทิน/ประวัติในแอป
 *
 * ยอดหักรวมอยู่ด้วยโดยตั้งใจ — เป็นข้อมูลของพนักงานคนนั้นเอง
 * และการซ่อนไว้จนเห็นครั้งแรกตอนได้สลิปคือสาเหตุอันดับต้น ๆ ที่คนไปตัดพ้อกับ HR
 */
export function toMobileAttendanceHistory(
  summaries: DailySummaryLike[],
  month: string,
  /**
   * ช่วงวันที่นับจริง — แอปเอาไปเขียนหัวข้อว่านับจากวันไหนถึงวันไหน
   * ถ้าไม่บอก ผู้ใช้จะเทียบเลขกับสลิปแล้วไม่รู้ว่าทำไมไม่ตรง
   */
  period: { from: string; to: string; type: 'calendar' | 'payroll' },
) {
  const days = summaries.map((summary) => ({
    afternoonInAt: summary.afternoonInAt ?? null,
    afternoonLateMinutes: summary.afternoonLateMinutes ?? 0,
    checkOutAt: summary.checkOutAt ?? null,
    deductionAmount: toAmount(summary.totalDeductionAmount),
    earlyCheckoutMinutes: summary.earlyCheckoutMinutes ?? 0,
    holidayName: readHoliday(summary).name,
    lateMinutes: summary.totalLateMinutes ?? 0,
    leaveIsPaid: summary.leaveIsPaid ?? null,
    leaveTypeName: summary.leaveType?.nameTh ?? null,
    morningInAt: summary.morningInAt ?? null,
    morningLateMinutes: summary.morningLateMinutes ?? 0,
    offsiteMinutes: summary.offsiteMinutes ?? 0,
    otMinutes: summary.payableOtMinutes ?? 0,
    state: resolveDayState(summary),
    workDate: summary.workDate,
  }));

  const countOf = (state: MobileAttendanceDayState) =>
    days.filter((day) => day.state === state).length;

  return {
    days,
    month,
    period,
    summary: {
      absentDays: countOf('ABSENT'),
      lateDays: countOf('LATE'),
      leaveDays: countOf('LEAVE'),
      missingLogDays: countOf('MISSING_LOG'),
      otMinutes: days.reduce((total, day) => total + day.otMinutes, 0),
      presentDays: countOf('PRESENT'),
      totalDeductionAmount: days.reduce(
        (total, day) => total + day.deductionAmount,
        0,
      ),
      totalLateMinutes: days.reduce((total, day) => total + day.lateMinutes, 0),
    },
  };
}

export function toMobilePunchResult(log: AttendanceLogLike) {
  return {
    status: 'RECORDED' as const,
    attendanceLogId: log.id,
    recordedAt: log.logTime,
    logType: log.logType,
    session: log.session ?? null,
    attendanceStatus: log.status,
    isOffsite: Boolean(log.isOffsite),
    locationVerification: {
      status: log.gpsVerificationStatus ?? (log.locationVerified ? 'VERIFIED' : 'NOT_REQUIRED'),
      locationId: log.locationId ?? null,
      distanceMeters: log.distanceFromApprovedLocationMeters ?? null,
    },
  };
}
