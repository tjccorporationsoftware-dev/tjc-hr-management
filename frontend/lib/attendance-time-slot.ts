export type AttendanceTimeSlotLogType =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "BREAK_START"
  | "BREAK_END"
  | (string & {});

export type AttendanceTimeSlotSession = string | null | undefined;

function toBangkokClockKey(value?: string | Date | null) {
  if (!value) return "";

  const text = String(value).trim();
  const timeOnlyMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);

  if (timeOnlyMatch) {
    return `${timeOnlyMatch[1].padStart(2, "0")}:${timeOnlyMatch[2]}`;
  }

  const date = value instanceof Date ? value : new Date(text);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });
}

export function inferAttendanceTimeSlotSession(
  logType?: AttendanceTimeSlotLogType | null,
  value?: string | Date | null,
): "MORNING" | "AFTERNOON" | "EVENING" | "" {
  if (logType === "CHECK_OUT") return "EVENING";
  if (logType !== "CHECK_IN") return "";

  const clock = toBangkokClockKey(value);
  if (!clock) return "MORNING";

  const [hourText = "0"] = clock.split(":");
  return Number(hourText) >= 12 ? "AFTERNOON" : "MORNING";
}

export function normalizeAttendanceTimeSlotSession(
  session?: AttendanceTimeSlotSession,
  logType?: AttendanceTimeSlotLogType | null,
  value?: string | Date | null,
) {
  const raw = String(session ?? "").toUpperCase();

  if (raw === "MORNING" || raw === "MORNING_IN") return "MORNING";
  if (raw === "AFTERNOON" || raw === "AFTERNOON_IN") return "AFTERNOON";
  if (raw === "EVENING" || raw === "CHECK_OUT") return "EVENING";

  return inferAttendanceTimeSlotSession(logType, value);
}

export function getAttendanceTimeSlotLabel(params: {
  logType?: AttendanceTimeSlotLogType | null;
  logTime?: string | Date | null;
  session?: AttendanceTimeSlotSession;
  fallback?: string;
}) {
  const logType = String(params.logType ?? "");
  const session = normalizeAttendanceTimeSlotSession(
    params.session,
    logType,
    params.logTime,
  );

  if (logType === "CHECK_IN") {
    return session === "AFTERNOON" ? "เข้างานบ่าย" : "เข้างานเช้า";
  }

  if (logType === "CHECK_OUT") return "ออกงาน";
  if (logType === "BREAK_START") return "เริ่มพัก";
  if (logType === "BREAK_END") return "กลับจากพัก";

  return params.fallback ?? logType ?? "-";
}

export function isSameAttendanceTimeSlot(params: {
  logType?: AttendanceTimeSlotLogType | null;
  logTime?: string | Date | null;
  logSession?: AttendanceTimeSlotSession;
  targetLogType?: AttendanceTimeSlotLogType | null;
  targetTime?: string | Date | null;
  targetSession?: AttendanceTimeSlotSession;
}) {
  const logType = String(params.logType ?? "");
  const targetLogType = String(params.targetLogType ?? "");

  if (!logType || !targetLogType || logType !== targetLogType) return false;

  if (logType !== "CHECK_IN" && logType !== "CHECK_OUT") return true;

  const logSession = normalizeAttendanceTimeSlotSession(
    params.logSession,
    logType,
    params.logTime,
  );
  const targetSession = normalizeAttendanceTimeSlotSession(
    params.targetSession,
    targetLogType,
    params.targetTime,
  );

  return logSession === targetSession;
}
