export const DEFAULT_LATE_REVIEW_THRESHOLD_MINUTES = 60;

export type AttendanceReviewReasonCode =
  | "MISSING_MORNING"
  | "MISSING_AFTERNOON"
  | "MISSING_CHECKOUT"
  | "MISSING_LOG"
  | "ABSENT"
  | "LATE_OVER_THRESHOLD"
  | "EARLY_CHECKOUT"
  | "OUT_OF_SESSION"
  | "OFFSITE_PENDING_APPROVAL"
  | "PENDING_LEAVE"
  | "PENDING_OVERTIME"
  | "PENDING_OFFSITE"
  | "PENDING_TIME_ADJUST"
  | "MISSING_COMPENSATION"
  | "CALCULATION_ERROR"
  | "RECALCULATION_PENDING"
  | "RECALCULATION_FAILED"
  | "STALE_SUMMARY"
  | "LEGACY_REVIEW_STATUS";

export type AttendanceReviewReason = {
  code: AttendanceReviewReasonCode;
  label: string;
  detail?: string | null;
};

export type AttendanceReviewState = {
  hasReviewIssue: boolean;
  requiresReview: boolean;
  reviewReasons: AttendanceReviewReason[];
};

function toNumber(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function addReason(
  reasons: AttendanceReviewReason[],
  code: AttendanceReviewReasonCode,
  label: string,
  detail?: string | null,
) {
  if (reasons.some((reason) => reason.code === code)) return;
  reasons.push({ code, label, detail: detail || null });
}

export function resolveAttendanceReviewState(
  summary: any,
): AttendanceReviewState {
  const reasons: AttendanceReviewReason[] = [];
  const snapshot = record(summary?.policySnapshot);
  const offsiteCoverage = record(snapshot.approvedOffsiteCoverage);
  const unpaidLeaveDeduction = record(snapshot.unpaidLeaveDeduction);
  const absenceDeduction = record(snapshot.absenceDeduction);
  const dailyDeductionCap = record(snapshot.dailyDeductionCap);
  const attendanceRecalculation = record(snapshot.attendanceRecalculation);
  const threshold = Math.max(
    toNumber(snapshot.lateReviewThresholdMinutes) ||
      DEFAULT_LATE_REVIEW_THRESHOLD_MINUTES,
    0,
  );

  const isAbsent =
    Boolean(summary?.isAbsent) || toNumber(summary?.absentDays) > 0;
  if (isAbsent) {
    addReason(
      reasons,
      "ABSENT",
      "ขาดงาน",
      "ไม่พบรายการลงเวลาครบตามรอบที่กำหนด",
    );
  } else {
    if (summary?.isMorningMissing) {
      addReason(reasons, "MISSING_MORNING", "ไม่พบเวลาเข้าเช้า");
    }
    if (summary?.isAfternoonMissing) {
      addReason(reasons, "MISSING_AFTERNOON", "ไม่พบเวลาเข้าบ่าย");
    }
    if (summary?.isCheckoutMissing) {
      addReason(reasons, "MISSING_CHECKOUT", "ไม่พบเวลาออกงาน");
    }
    if (
      summary?.hasMissingLog &&
      !summary?.isMorningMissing &&
      !summary?.isAfternoonMissing &&
      !summary?.isCheckoutMissing
    ) {
      addReason(reasons, "MISSING_LOG", "ลงเวลาไม่ครบ");
    }
  }

  const totalLateMinutes = toNumber(summary?.totalLateMinutes);
  if (totalLateMinutes > threshold) {
    addReason(
      reasons,
      "LATE_OVER_THRESHOLD",
      "มาสายเกินเกณฑ์ตรวจสอบ",
      `มาสายรวม ${totalLateMinutes.toLocaleString("th-TH")} นาที (เกณฑ์ ${threshold.toLocaleString("th-TH")} นาที)`,
    );
  }

  const earlyCheckoutMinutes = toNumber(summary?.earlyCheckoutMinutes);
  if (earlyCheckoutMinutes > 0) {
    addReason(
      reasons,
      "EARLY_CHECKOUT",
      "ออกก่อนเวลา",
      `ออกก่อน ${earlyCheckoutMinutes.toLocaleString("th-TH")} นาที`,
    );
  }

  const pendingLeaveCount = toNumber(summary?.pendingLeaveRequestCount);
  if (pendingLeaveCount > 0) {
    addReason(
      reasons,
      "PENDING_LEAVE",
      "มีใบลารออนุมัติ",
      `${pendingLeaveCount.toLocaleString("th-TH")} รายการ`,
    );
  }

  const pendingOvertimeCount = toNumber(summary?.pendingOvertimeRequestCount);
  if (pendingOvertimeCount > 0) {
    addReason(
      reasons,
      "PENDING_OVERTIME",
      "มีคำขอ OT รออนุมัติ",
      `${pendingOvertimeCount.toLocaleString("th-TH")} รายการ`,
    );
  }

  const pendingTimeAdjustCount = Math.max(
    toNumber(summary?.pendingTimeAdjustRequestCount),
    Array.isArray(summary?.timeAdjustRequests)
      ? summary.timeAdjustRequests.filter(
          (request: any) => request?.status === "SUBMITTED",
        ).length
      : 0,
  );
  if (pendingTimeAdjustCount > 0) {
    addReason(
      reasons,
      "PENDING_TIME_ADJUST",
      "มีคำขอแก้เวลารออนุมัติ",
      `${pendingTimeAdjustCount.toLocaleString("th-TH")} รายการ`,
    );
  }

  const offsiteStatus = String(
    summary?.offsiteStatus ?? offsiteCoverage.status ?? "",
  ).toUpperCase();
  const pendingOffsiteCount = toNumber(summary?.pendingOffsiteRequestCount);
  const offsiteNeedsReview =
    pendingOffsiteCount > 0 ||
    offsiteCoverage.needsReview === true ||
    ["SUBMITTED", "MANAGER_APPROVED"].includes(offsiteStatus);
  if (offsiteNeedsReview) {
    addReason(
      reasons,
      "PENDING_OFFSITE",
      "มีคำขอทำงานนอกสถานที่รออนุมัติ",
      pendingOffsiteCount > 0
        ? `${pendingOffsiteCount.toLocaleString("th-TH")} รายการ`
        : offsiteCoverage.coverageReason || null,
    );
  }

  const unpaidLeaveMissingCompensation =
    unpaidLeaveDeduction.missingCompensation === true &&
    toNumber(
      summary?.unpaidLeaveMinutes ?? unpaidLeaveDeduction.unpaidLeaveMinutes,
    ) > 0;
  const absenceMissingCompensation =
    absenceDeduction.missingCompensation === true && isAbsent;
  const capMissingCompensation =
    dailyDeductionCap.missingCompensation === true &&
    (toNumber(summary?.latePenaltyAmount) > 0 ||
      toNumber(summary?.earlyCheckoutPenaltyAmount) > 0 ||
      totalLateMinutes > 0 ||
      earlyCheckoutMinutes > 0);
  if (
    unpaidLeaveMissingCompensation ||
    absenceMissingCompensation ||
    capMissingCompensation
  ) {
    addReason(reasons, "MISSING_COMPENSATION", "ไม่พบฐานเงินเดือนสำหรับคำนวณ");
  }

  const recalculationStatus = String(
    attendanceRecalculation.status ?? "",
  ).toUpperCase();
  if (["PENDING", "PROCESSING", "RETRYING"].includes(recalculationStatus)) {
    addReason(
      reasons,
      "RECALCULATION_PENDING",
      "กำลังรอคำนวณ Attendance ใหม่",
      "ข้อมูลต้นทางมีการเปลี่ยนแปลง ระบบยังประมวลผลไม่เสร็จ",
    );
  }
  if (recalculationStatus === "FAILED") {
    addReason(
      reasons,
      "RECALCULATION_FAILED",
      "คำนวณ Attendance ไม่สำเร็จ",
      String(attendanceRecalculation.error ?? "").trim() ||
        "ต้องตรวจสอบข้อผิดพลาดและสั่งคำนวณใหม่",
    );
  }
  if (attendanceRecalculation.isStale === true) {
    addReason(
      reasons,
      "STALE_SUMMARY",
      "ข้อมูลสรุป Attendance ไม่เป็นปัจจุบัน",
      "ต้องคำนวณใหม่ก่อนพร้อมล็อก",
    );
  }

  const note = String(summary?.calculationNote ?? "");
  if (note.includes("นอกช่วงที่กำหนด")) {
    addReason(reasons, "OUT_OF_SESSION", "มีรายการลงเวลานอกช่วงที่กำหนด");
  }
  if (
    String(summary?.calculationStatus ?? "").toUpperCase() === "ERROR" ||
    note.includes("ผิดปกติ") ||
    note.includes("ไม่สามารถคำนวณ") ||
    note.includes("คำนวณไม่สำเร็จ")
  ) {
    addReason(reasons, "CALCULATION_ERROR", "ผลการคำนวณผิดปกติ");
  }

  const status = String(
    summary?.reviewStatus ?? summary?.calculationStatus ?? "",
  ).toUpperCase();
  if (status === "NEED_REVIEW" && reasons.length === 0) {
    addReason(
      reasons,
      "LEGACY_REVIEW_STATUS",
      "สถานะเดิมกำหนดให้ตรวจสอบ",
      "ควรคำนวณรายการนี้ใหม่เพื่ออัปเดตเหตุผลล่าสุด",
    );
  }

  const hasReviewIssue = reasons.length > 0;
  const requiresReview = hasReviewIssue && status === "NEED_REVIEW";

  return { hasReviewIssue, requiresReview, reviewReasons: reasons };
}

export function attachAttendanceReviewState<T extends Record<string, any>>(
  item: T,
): T & AttendanceReviewState {
  return Object.assign(item, resolveAttendanceReviewState(item));
}
