"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Field,
  Modal,
  ModalActions,
  Notice,
  Select,
  Textarea,
  joinClassName,
} from "@/components/kit";
import {
  getAttendancePunchContext,
  getMyAttendanceToday,
  punchAttendance,
} from "@/lib/api";
import { formatThaiDate, formatThaiTime } from "@/lib/date-format";
import type {
  AttendanceLog,
  AttendanceMyToday,
  AttendancePunchContext,
  AttendancePunchContextRule,
  AttendancePunchSource,
  AttendancePunchType,
  AttendanceSessionCode,
} from "@/types/attendance";

/**
 * ลงเวลาวันนี้
 * -----------
 * ตอบคำถามเดียวให้ชัดที่สุด: "ตอนนี้กดลงเวลาได้ไหม และกดแล้วจะเป็นอะไร"
 *
 * เรียงจากบนลงล่างตามลำดับที่พนักงานต้องรู้:
 *   สถานะรอบตอนนี้ → เงื่อนไขที่ค้างอยู่ (GPS/พื้นที่/นอกสถานที่) → ปุ่มบันทึก → รอบทั้งวัน
 * ทุกอย่างอยู่ในผืนขาวเดียวกัน คั่นด้วยเส้น ไม่มีการ์ดซ้อนการ์ด
 */

// ─── ชนิดข้อมูลภายในหน้า ──────────────────────────────────────────────────────

type GpsState = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string;
};

type RequestGpsOptions = {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
};

/** ข้อมูลที่เตรียมไว้แล้วรอผู้ใช้ยืนยันในป๊อปอัพ */
type PendingPunch = {
  sessionCode: string;
  label: string;
  punchType: string;
  gps: GpsState;
  lines: string[];
};

// ─── ตัวช่วย ──────────────────────────────────────────────────────────────────

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  const result = formatThaiTime(value);
  return result === "-" ? value.slice(0, 5) : result;
}

function formatDate(value?: string | null) {
  return value ? formatThaiDate(value) : formatThaiDate(new Date());
}

function getStatusLabel(status?: string | null) {
  const map: Record<string, string> = {
    NORMAL: "ปกติ",
    LATE: "สาย",
    EARLY_LEAVE: "ออกก่อน",
    MISSING_CHECKIN: "ไม่มีเวลาเข้า",
    MISSING_CHECKOUT: "ไม่มีเวลาออก",
    MANUAL_ADDED: "เพิ่มโดย HR",
    EDITED: "แก้ไขแล้ว",
    CANCELLED: "ยกเลิก",
  };
  return status ? (map[status] ?? status) : "-";
}

function getPunchTypeLabel(rule?: { punchType?: string | null } | null) {
  if (!rule) return "-";
  return rule.punchType === "CHECK_OUT" ? "ออกงาน" : "เข้างาน";
}

function getSessionKey(sessionCode?: AttendanceSessionCode | string | null) {
  if (sessionCode === "MORNING_IN") return "MORNING";
  if (sessionCode === "AFTERNOON_IN") return "AFTERNOON";
  if (sessionCode === "CHECK_OUT") return "EVENING";
  if (sessionCode === "OFFSITE_IN") return "OFFSITE_IN";
  if (sessionCode === "OFFSITE_OUT") return "OFFSITE_OUT";
  return sessionCode ?? "";
}

function parseTimeToMinutes(value?: string | null) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function getBangkokMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  return hour * 60 + minute;
}

function money(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** ตัวเลขไทยแบบมีคอมมา ใช้กับทั้งนาทีและเมตร */
function num(value: number) {
  return value.toLocaleString("th-TH");
}

/** นาทีสาย/ออกก่อน ถูกฝากไว้ในโน้ตของ log ตอนคำนวณฝั่งหลังบ้าน */
function extractMinutesFromNote(
  note: string | null | undefined,
  key: "lateMinutes" | "earlyLeaveMinutes",
) {
  if (!note) return 0;
  const matched = note.match(new RegExp(`${key}=(\\d+)`));
  return matched ? Number(matched[1]) || 0 : 0;
}

function getEarlyCheckoutPenaltyPerMinute(
  rule?: AttendancePunchContextRule | null,
) {
  const rate = Number(rule?.earlyLeavePenaltyPerMinute ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 5;
}

function getEarlyCheckoutPreview(rule?: AttendancePunchContextRule | null) {
  if (!rule || rule.punchType !== "CHECK_OUT") {
    return { minutes: 0, rate: 0, amount: 0, isAfterClose: false };
  }

  const nowMinutes = getBangkokMinutes();
  const earlyBefore = parseTimeToMinutes(
    rule.earlyBeforeTime ?? rule.expectedTime,
  );
  const close = parseTimeToMinutes(rule.closeTime);
  const rate = getEarlyCheckoutPenaltyPerMinute(rule);
  const earlyMinutes =
    earlyBefore == null ? 0 : Math.max(0, earlyBefore - nowMinutes);

  return {
    minutes: earlyMinutes,
    rate,
    amount: earlyMinutes * rate,
    isAfterClose: close != null && nowMinutes > close,
  };
}

function findLogForRule(
  logs: AttendanceLog[],
  rule: AttendancePunchContextRule,
) {
  const sessionKey = getSessionKey(rule.sessionCode);
  return (
    logs.find(
      (log) =>
        log.status !== "CANCELLED" && String(log.session || "") === sessionKey,
    ) ?? null
  );
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(7));
}

/** ระยะห่างระหว่างพิกัด 2 จุด (เมตร) ด้วยสูตร Haversine — ใช้ตรวจ geofence ฝั่ง client */
function distanceMetersBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── ชิ้นส่วนเล็ก ๆ ───────────────────────────────────────────────────────────

const LABEL_CLASS =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500";

/** ป้ายของช่องข้อมูลย่อย เล็กและจางกว่าหัวข้อหนึ่งขั้น */
const FIELD_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]";

/** ช่องเวลาของรอบปัจจุบัน (เปิดรับ / มาตรฐาน / ปิดรอบ) */
function ClockCell({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value?: string | null;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 py-1.5 pr-4 3xl:pr-5">
      <p className={FIELD_LABEL_CLASS}>{label}</p>
      <p
        className={joinClassName(
          "mt-0.5 text-[17px] font-bold tabular-nums leading-6 tracking-tight 3xl:text-[19px]",
          emphasis ? "text-brand-700" : "text-slate-900",
        )}
      >
        {value || "--:--"}
      </p>
    </div>
  );
}

/**
 * ช่องสถานะหนึ่งช่องในแถบบนสุด
 * ค่าเป็นข้อความ ไม่ใช่ตัวเลข จึงวางเรียงลงมาแทนที่จะดันไปชิดขวา
 * ไม่งั้นคำยาวอย่าง "อยู่นอกพื้นที่ลงเวลา" จะตัดบรรทัดจนความสูงแต่ละช่องไม่เท่ากัน
 */
function StatusFact({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  const valueClass = {
    neutral: "text-slate-900",
    positive: "text-emerald-600",
    warning: "text-amber-600",
  }[tone];

  return (
    <div className="border-b border-slate-100 px-5 py-2.5 last:border-b-0 sm:border-r sm:px-6 sm:[&:nth-child(2n)]:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(4n)]:border-r-0 3xl:px-7">
      <p className={FIELD_LABEL_CLASS}>{label}</p>
      <p
        className={joinClassName(
          "mt-0.5 truncate text-[15px] font-bold 3xl:text-[16px]",
          valueClass,
        )}
        title={value}
      >
        {value}
      </p>
      <p className="truncate text-[11px] text-slate-400" title={helper}>
        {helper}
      </p>
    </div>
  );
}

/** แถวเงื่อนไขก่อนกดลงเวลา — GPS / พื้นที่ลงเวลา */
function ConditionRow({
  icon,
  title,
  detail,
  tone,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  tone: "neutral" | "positive" | "warning" | "critical";
  action?: ReactNode;
}) {
  const toneClass = {
    neutral: "text-slate-400",
    positive: "text-emerald-600",
    warning: "text-amber-600",
    critical: "text-rose-600",
  }[tone];

  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className={joinClassName("mt-0.5 shrink-0", toneClass)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-700 3xl:text-[13.5px]">
          {title}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-5 text-slate-400">
          {detail}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function StatusText({ status }: { status?: string | null }) {
  const tone =
    status === "LATE" || status === "EARLY_LEAVE"
      ? "text-amber-600"
      : status === "CANCELLED"
        ? "text-rose-600"
        : "text-slate-400";

  return (
    <span className={joinClassName("text-[12px]", tone)}>
      {getStatusLabel(status)}
    </span>
  );
}

// ─── แผงหลัก ─────────────────────────────────────────────────────────────────

export function CheckInPanel() {
  const [context, setContext] = useState<AttendancePunchContext | null>(null);
  const [myToday, setMyToday] = useState<AttendanceMyToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [selectedOffsiteRequestId, setSelectedOffsiteRequestId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingPunch, setPendingPunch] = useState<PendingPunch | null>(null);
  const autoGpsRequestedRef = useRef(false);
  const [gps, setGps] = useState<GpsState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    loading: false,
    error: "",
  });

  const currentSession = context?.currentSession ?? null;
  const holiday = context?.holiday ?? myToday?.holiday ?? null;
  const isHoliday = Boolean(holiday?.isHoliday);
  const isWorkingHoliday = Boolean(holiday?.isWorkingHoliday);

  // จุดลงเวลาของสาขา (geofence) — ต้องอยู่ในรัศมีจึงจะลงเวลาที่สำนักงานได้
  const geofence = context?.geofence ?? null;
  const hasGpsFix = Boolean(gps.latitude && gps.longitude);
  const geofenceDistance =
    geofence && hasGpsFix
      ? distanceMetersBetween(
          gps.latitude as number,
          gps.longitude as number,
          geofence.latitude,
          geofence.longitude,
        )
      : null;
  const isWithinGeofence =
    geofenceDistance !== null && geofenceDistance <= geofence!.radiusMeters;
  // บล็อกเมื่อสาขาบังคับ geofence แต่ยังไม่มี GPS หรืออยู่นอกรัศมี (ยกเว้นทำงานนอกสถานที่)
  const geofenceBlocked =
    Boolean(geofence?.required) &&
    !selectedOffsiteRequestId &&
    !isWithinGeofence;

  // โหมดลงเวลาของพนักงาน (มาจากการตั้งค่าวิธีลงเวลารายพนักงาน)
  const geofenceRequired = context?.attendanceMethods?.geofenceRequired ?? null;
  const isFieldMode = geofenceRequired === false; // ออกนอกสถานที่ ลงเวลาได้ทุกที่
  const officeWithoutPoint = geofenceRequired === true && !geofence; // office แต่สาขายังไม่ตั้งจุด GPS

  const canPunch = Boolean(
    !isHoliday &&
    currentSession?.canPunch &&
    !geofenceBlocked &&
    !saving &&
    !reloading &&
    (!gps.loading || Boolean(selectedOffsiteRequestId)),
  );

  const offsiteRequests = isHoliday
    ? []
    : (context?.approvedOffsiteRequests ?? []);
  const selectedOffsiteRequest =
    offsiteRequests.find((item) => item.id === selectedOffsiteRequestId) ??
    null;

  const checkoutRule =
    context?.sessionRules?.find((rule) => rule.sessionCode === "CHECK_OUT") ??
    null;
  const checkoutLog = checkoutRule
    ? findLogForRule(context?.todayLogs ?? [], checkoutRule)
    : null;
  const checkoutPreview = getEarlyCheckoutPreview(checkoutRule);
  const canCheckout = Boolean(
    !isHoliday &&
    checkoutRule &&
    !checkoutLog &&
    !checkoutPreview.isAfterClose &&
    !geofenceBlocked &&
    !saving &&
    !reloading &&
    (!gps.loading || Boolean(selectedOffsiteRequestId)),
  );

  const loadData = useCallback(async (showToast = false) => {
    try {
      setErrorMessage("");
      setReloading(true);
      const [contextResult, todayResult] = await Promise.all([
        getAttendancePunchContext(),
        getMyAttendanceToday().catch(() => null),
      ]);
      setContext(contextResult);
      setMyToday(todayResult);
      const approvedOffsite = contextResult.holiday?.isHoliday
        ? []
        : (contextResult.approvedOffsiteRequests ?? []);
      setSelectedOffsiteRequestId((current) =>
        current && approvedOffsite.some((item) => item.id === current)
          ? current
          : "",
      );
      if (showToast) toast.success("โหลดข้อมูลล่าสุดแล้ว");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "โหลดข้อมูลลงเวลาไม่สำเร็จ";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  const requestGps = useCallback(
    ({
      showSuccessToast = true,
      showErrorToast = true,
    }: RequestGpsOptions = {}) =>
      new Promise<GpsState | null>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          const message = "เบราว์เซอร์นี้ไม่รองรับการขอพิกัด GPS";
          const next: GpsState = {
            latitude: null,
            longitude: null,
            accuracy: null,
            loading: false,
            error: message,
          };
          setGps(next);
          if (showErrorToast) toast.error(message);
          resolve(null);
          return;
        }

        setGps((prev) => ({ ...prev, loading: true, error: "" }));
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const next: GpsState = {
              latitude: roundCoordinate(position.coords.latitude),
              longitude: roundCoordinate(position.coords.longitude),
              accuracy: Math.round(position.coords.accuracy),
              loading: false,
              error: "",
            };
            setGps(next);
            if (showSuccessToast) toast.success("ดึงพิกัด GPS สำเร็จ");
            resolve(next);
          },
          (err) => {
            const messages: Record<number, string> = {
              [err.PERMISSION_DENIED]: "ผู้ใช้ไม่อนุญาตให้เข้าถึงตำแหน่ง GPS",
              [err.POSITION_UNAVAILABLE]: "ไม่พบข้อมูลตำแหน่ง GPS จากอุปกรณ์",
              [err.TIMEOUT]: "การขอพิกัด GPS ใช้เวลานานเกินไป",
            };
            const message = messages[err.code] ?? "ไม่สามารถขอพิกัด GPS ได้";
            const next: GpsState = {
              latitude: null,
              longitude: null,
              accuracy: null,
              loading: false,
              error: message,
            };
            setGps(next);
            if (showErrorToast) toast.error(message);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      }),
    [],
  );

  /**
   * ตรวจเงื่อนไขทั้งหมดแล้วเปิดป๊อปอัพยืนยัน
   * ยังไม่ยิง API — ผู้ใช้ต้องเห็นก่อนว่ากดแล้วจะถูกบันทึกเป็นอะไร
   */
  async function preparePunch(targetRule?: AttendancePunchContextRule) {
    if (isHoliday) {
      toast.error(
        holiday?.name
          ? `${holiday.name} ไม่ต้องลงเวลา`
          : "วันนี้เป็นวันหยุด ไม่ต้องลงเวลา",
      );
      return;
    }

    const targetSession = targetRule ?? currentSession;
    if (!targetSession) {
      toast.error("ตอนนี้อยู่นอกช่วงรอบลงเวลา");
      return;
    }

    const targetExistingLog = targetRule
      ? findLogForRule(context?.todayLogs ?? [], targetRule)
      : null;
    if (targetExistingLog) {
      toast.error("วันนี้มีการบันทึกรอบออกงานแล้ว");
      return;
    }
    if (!targetRule && currentSession && !currentSession.canPunch) {
      toast.error(currentSession.blockReason || "รอบนี้ถูกบันทึกแล้ว");
      return;
    }
    if (
      targetRule?.sessionCode === "CHECK_OUT" &&
      getEarlyCheckoutPreview(targetRule).isAfterClose
    ) {
      toast.error(`พ้นเวลาปิดรอบออกงานแล้ว (${targetRule.closeTime})`);
      return;
    }

    let punchGps = gps;
    if (
      !selectedOffsiteRequestId &&
      (!punchGps.latitude || !punchGps.longitude)
    ) {
      const latest = await requestGps({ showSuccessToast: false });
      if (latest) punchGps = latest;
    }

    // ตรวจ geofence ของสาขาก่อนส่ง (ยกเว้นเลือกทำงานนอกสถานที่)
    if (geofence?.required && !selectedOffsiteRequestId) {
      if (!punchGps.latitude || !punchGps.longitude) {
        toast.error("ต้องเปิด GPS และอนุญาตตำแหน่งก่อนลงเวลาที่สำนักงาน");
        return;
      }
      const distance = distanceMetersBetween(
        punchGps.latitude,
        punchGps.longitude,
        geofence.latitude,
        geofence.longitude,
      );
      if (distance > geofence.radiusMeters) {
        toast.error(
          `อยู่นอกพื้นที่ลงเวลา ห่างจาก ${geofence.name} ประมาณ ${num(Math.round(distance))} ม. (อนุญาตไม่เกิน ${num(geofence.radiusMeters)} ม.)`,
        );
        return;
      }
    }

    const earlyPreview = getEarlyCheckoutPreview(targetRule ?? checkoutRule);
    const lines = [
      `เวลาอ้างอิง ${formatTime(new Date().toISOString())}`,
      selectedOffsiteRequest
        ? `ตรวจสอบจากคำขอนอกสถานที่ที่อนุมัติ (${selectedOffsiteRequest.startTime}–${selectedOffsiteRequest.endTime})`
        : punchGps.latitude && punchGps.longitude
          ? `พิกัด ${punchGps.latitude}, ${punchGps.longitude}${punchGps.accuracy ? ` ±${punchGps.accuracy} ม.` : ""}`
          : "ไม่ได้แนบพิกัด GPS",
      targetSession.punchType === "CHECK_OUT" && earlyPreview.minutes > 0
        ? `ออกก่อนเวลา ${num(earlyPreview.minutes)} นาที · หักประมาณ ${money(earlyPreview.amount)} บาท`
        : "",
      note.trim() ? `หมายเหตุ: ${note.trim()}` : "",
    ].filter(Boolean);

    setPendingPunch({
      sessionCode: targetSession.sessionCode,
      label: targetSession.label,
      punchType: targetSession.punchType,
      gps: punchGps,
      lines,
    });
  }

  async function submitPunch() {
    if (!pendingPunch) return;

    try {
      setSaving(true);
      setErrorMessage("");
      await punchAttendance({
        punchType: pendingPunch.sessionCode as AttendancePunchType,
        source: "WEB" as AttendancePunchSource,
        locationId:
          !selectedOffsiteRequestId && geofence?.locationId
            ? geofence.locationId
            : undefined,
        latitude: selectedOffsiteRequestId
          ? undefined
          : (pendingPunch.gps.latitude ?? undefined),
        longitude: selectedOffsiteRequestId
          ? undefined
          : (pendingPunch.gps.longitude ?? undefined),
        gpsAccuracy: selectedOffsiteRequestId
          ? undefined
          : (pendingPunch.gps.accuracy ?? undefined),
        offsiteRequestId: selectedOffsiteRequestId || undefined,
        note: note.trim() || undefined,
      });
      toast.success(`บันทึก${pendingPunch.label}สำเร็จ`);
      setNote("");
      setPendingPunch(null);
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "บันทึกเวลาไม่สำเร็จ";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (loading || isHoliday || autoGpsRequestedRef.current) return;
    autoGpsRequestedRef.current = true;
    void requestGps({ showSuccessToast: false });
  }, [isHoliday, loading, requestGps]);

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center px-5 py-10">
        <span className="inline-flex items-center gap-2.5 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          กำลังโหลดข้อมูลลงเวลา
        </span>
      </div>
    );
  }

  const isOutOfSession = !isHoliday && !currentSession;
  const rules = [...(context?.sessionRules ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const punchLabel = isHoliday
    ? "วันนี้เป็นวันหยุด"
    : isOutOfSession
      ? "นอกช่วงลงเวลา"
      : saving
        ? "กำลังบันทึก…"
        : geofenceBlocked
          ? hasGpsFix
            ? "อยู่นอกพื้นที่ลงเวลา"
            : "รอ GPS เพื่อตรวจพื้นที่"
          : currentSession?.canPunch
            ? `บันทึก${currentSession.label}`
            : "รอบนี้บันทึกแล้ว";

  const gpsStatusText = gps.loading
    ? "กำลังดึงพิกัด"
    : hasGpsFix
      ? "พร้อมแนบพิกัด"
      : gps.error
        ? "GPS มีปัญหา"
        : "รอ GPS";

  const todayStatusTone = isHoliday
    ? ("positive" as const)
    : currentSession?.canPunch
      ? ("warning" as const)
      : ("neutral" as const);

  return (
    <>
      {/*
        แถบวันนี้ — วันที่ สถานะ และปุ่มโหลดใหม่ อยู่แถบเดียว
        พื้นฟ้าอ่อนบอกว่าเป็นบริบทของทั้งหน้า ไม่ใช่หัวข้อย่อยอันหนึ่ง
      */}
      <section className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-brand-50/40 px-5 py-3.5 sm:px-6 3xl:px-7">
        <div className="min-w-0">
          <p className={LABEL_CLASS}>วันนี้</p>
          <p className="mt-0.5 text-[15px] font-bold text-slate-900 3xl:text-[16px]">
            {formatDate(context?.workDate)}
          </p>
          <p className="text-[11.5px] text-slate-500 3xl:text-[12px]">
            {isHoliday
              ? `${holiday?.name ?? "วันหยุด"} ระบบปิดการลงเวลา`
              : currentSession
                ? "ระบบเลือกประเภทการลงเวลาให้อัตโนมัติตามช่วงเวลาปัจจุบัน"
                : "ยังไม่ถึงรอบที่ HR ตั้งไว้ กดโหลดใหม่เมื่อถึงเวลา"}
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => void loadData(true)}
          disabled={reloading || saving}
          icon={
            <RefreshCw
              className={joinClassName(
                "h-3.5 w-3.5",
                reloading && "animate-spin",
              )}
            />
          }
        >
          โหลดข้อมูลใหม่
        </Button>
      </section>

      {/* สี่เรื่องที่ตัดสินว่ากดได้หรือยัง คั่นด้วยเส้น ไม่ใช่กล่องสี่ใบ */}
      <div className="grid border-b border-slate-200 sm:grid-cols-2 xl:grid-cols-4">
        <StatusFact
          label="รอบปัจจุบัน"
          value={isHoliday ? "วันหยุด" : (currentSession?.label ?? "นอกช่วง")}
          tone={todayStatusTone}
          helper={
            currentSession
              ? getPunchTypeLabel(currentSession)
              : "ไม่มีรอบที่เปิดอยู่"
          }
        />
        <StatusFact
          label="ช่วงเวลาที่รับ"
          value={
            currentSession
              ? `${currentSession.openTime}–${currentSession.closeTime}`
              : "—"
          }
          helper={
            currentSession
              ? `มาตรฐาน ${currentSession.expectedTime}`
              : "รอเปิดรอบ"
          }
        />
        <StatusFact
          label={selectedOffsiteRequestId ? "การตรวจสอบ" : "สถานะ GPS"}
          value={selectedOffsiteRequestId ? "คำขอนอกสถานที่" : gpsStatusText}
          tone={
            selectedOffsiteRequestId || hasGpsFix
              ? "positive"
              : gps.error
                ? "warning"
                : "neutral"
          }
          helper={
            selectedOffsiteRequestId
              ? "ตรวจจากคำขอและช่วงเวลา"
              : hasGpsFix && gps.accuracy
                ? `ความแม่นยำ ±${gps.accuracy} ม.`
                : "ระบบดึงพิกัดให้อัตโนมัติ"
          }
        />
        <StatusFact
          label="สถานะการลงเวลา"
          value={
            currentSession?.canPunch
              ? "พร้อมบันทึก"
              : isHoliday
                ? "ไม่ต้องลงเวลา"
                : "ยังกดไม่ได้"
          }
          tone={currentSession?.canPunch ? "warning" : "neutral"}
          helper={currentSession?.blockReason ?? "รอรอบถัดไป"}
        />
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_22rem] xl:divide-x xl:divide-slate-200 3xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ---------------- ฝั่งซ้าย: กดลงเวลา ---------------- */}
        <section className="border-b border-slate-200 px-5 py-4 sm:px-6 xl:border-b-0 3xl:px-7">
          <div className="border-b border-brand-100 pb-1.5">
            <h2 className={LABEL_CLASS}>บันทึกเวลาประจำวัน</h2>
            <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
              ระบบเลือกรอบให้ตามเวลาปัจจุบัน ตรวจเงื่อนไขให้ครบก่อนกดบันทึก
            </p>
          </div>

          <div className="mt-3 space-y-3">
            {errorMessage ? (
              <Notice
                tone="critical"
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                {errorMessage}
              </Notice>
            ) : null}

            {currentSession ? (
              <div className="grid grid-cols-3 border-b border-slate-100 pb-1">
                <ClockCell label="เปิดรับ" value={currentSession.openTime} />
                <ClockCell
                  label="มาตรฐาน"
                  value={currentSession.expectedTime}
                  emphasis
                />
                <ClockCell label="ปิดรอบ" value={currentSession.closeTime} />
              </div>
            ) : null}

            {isHoliday ? (
              <Notice
                tone="positive"
                icon={<CheckCircle2 className="h-4 w-4" />}
              >
                วันนี้เป็นวันหยุด{holiday?.name ? ` (${holiday.name})` : ""} —
                ไม่ต้องลงเวลา
              </Notice>
            ) : null}

            {isWorkingHoliday && !isHoliday ? (
              <Notice
                tone="warning"
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                ทำงานวันหยุดบริษัท ·{" "}
                {holiday?.workOverride?.name ??
                  holiday?.name ??
                  "กลุ่มของคุณถูกกำหนดให้มาทำงาน"}
              </Notice>
            ) : null}

            {currentSession?.punchType === "CHECK_OUT" &&
            currentSession.earlyLeaveMinutesPreview > 0 ? (
              <Notice
                tone="critical"
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                ออกก่อนเวลา {num(currentSession.earlyLeaveMinutesPreview)} นาที
                · หักประมาณ{" "}
                {money(currentSession.earlyLeavePenaltyPreview ?? 0)} บาท (อัตรา{" "}
                {money(currentSession.earlyLeavePenaltyPerMinute ?? 5)}{" "}
                บาท/นาที)
              </Notice>
            ) : null}

            {currentSession?.blockReason ? (
              <Notice tone="info">{currentSession.blockReason}</Notice>
            ) : null}

            {/* เงื่อนไขตำแหน่ง — รวม GPS กับพื้นที่ลงเวลาไว้กล่องเดียว อ่านทีเดียวจบ */}
            {!isHoliday && !isOutOfSession && !selectedOffsiteRequestId ? (
              <div className="divide-y divide-slate-100 border-y border-slate-100">
                <ConditionRow
                  icon={
                    gps.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : hasGpsFix ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )
                  }
                  tone={
                    gps.error ? "critical" : hasGpsFix ? "positive" : "neutral"
                  }
                  title={
                    gps.loading
                      ? "กำลังดึงพิกัด GPS…"
                      : hasGpsFix
                        ? `${gps.latitude}, ${gps.longitude}`
                        : gps.error
                          ? "ตรวจตำแหน่งไม่สำเร็จ"
                          : "รอตรวจจับตำแหน่ง"
                  }
                  detail={
                    gps.error
                      ? gps.error
                      : hasGpsFix
                        ? `แนบพิกัดกับการลงเวลาอัตโนมัติ${gps.accuracy ? ` · ความแม่นยำ ±${gps.accuracy} ม.` : ""}`
                        : "ระบบจะดึง GPS ให้อัตโนมัติ"
                  }
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void requestGps()}
                      disabled={isHoliday || gps.loading || saving}
                      icon={<LocateFixed className="h-3.5 w-3.5" />}
                    >
                      ดึงใหม่
                    </Button>
                  }
                />

                {geofence ? (
                  <ConditionRow
                    icon={<MapPin className="h-4 w-4" />}
                    tone={
                      isWithinGeofence
                        ? "positive"
                        : hasGpsFix
                          ? "critical"
                          : "neutral"
                    }
                    title={`จุดลงเวลา: ${geofence.name}`}
                    detail={
                      geofenceDistance === null
                        ? `ต้องอยู่ในรัศมี ${num(geofence.radiusMeters)} เมตร · รอพิกัดเพื่อตรวจระยะ`
                        : isWithinGeofence
                          ? `อยู่ในพื้นที่ · ห่างประมาณ ${num(Math.round(geofenceDistance))} เมตร จากรัศมี ${num(geofence.radiusMeters)} เมตร`
                          : `อยู่นอกพื้นที่ · ห่างประมาณ ${num(Math.round(geofenceDistance))} เมตร เกินรัศมี ${num(geofence.radiusMeters)} เมตร`
                    }
                  />
                ) : null}

                {isFieldMode ? (
                  <ConditionRow
                    icon={<MapPin className="h-4 w-4" />}
                    tone="positive"
                    title="โหมดทำงานนอกสถานที่"
                    detail="ระบบตรวจจากคำขอที่อนุมัติ วันที่ และช่วงเวลา โดยไม่ใช้พิกัดหรือรัศมี"
                  />
                ) : null}

                {officeWithoutPoint ? (
                  <ConditionRow
                    icon={<AlertTriangle className="h-4 w-4" />}
                    tone="warning"
                    title="ยังไม่ได้ตั้งจุด GPS ของสาขา"
                    detail="สาขาของคุณถูกตั้งให้ต้องอยู่ในพื้นที่ แต่ HR ยังไม่ได้ปักหมุดจุดลงเวลา ระบบจึงบันทึกพิกัดไว้ก่อนโดยยังไม่ตรวจระยะ"
                  />
                ) : null}
              </div>
            ) : null}

            {offsiteRequests.length > 0 ? (
              <Field
                label="ทำงานนอกสถานที่"
                hint={
                  selectedOffsiteRequest
                    ? `ใช้คำขอที่อนุมัติแล้ว ${selectedOffsiteRequest.startTime}–${selectedOffsiteRequest.endTime} แทนการตรวจพิกัด`
                    : "เลือกเมื่อวันนี้ออกไปทำงานนอกสำนักงานตามคำขอที่อนุมัติแล้ว"
                }
              >
                <Select
                  value={selectedOffsiteRequestId}
                  onChange={(event) =>
                    setSelectedOffsiteRequestId(event.target.value)
                  }
                  disabled={isHoliday}
                >
                  <option value="">ลงเวลาปกติที่สำนักงาน</option>
                  {offsiteRequests.map((item) => (
                    <option key={item.id} value={item.id}>
                      ทำงานนอกสถานที่ · {item.startTime}–{item.endTime}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {!isHoliday ? (
              <Field
                label="หมายเหตุ"
                hint="ไม่บังคับ — เช่น เหตุผลที่มาสายหรือออกก่อน"
              >
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="พิมพ์หมายเหตุแนบกับการลงเวลานี้"
                  disabled={saving}
                />
              </Field>
            ) : null}

            {/*
              ปุ่มหลักของหน้านี้ — ใช้ปุ่มเฉพาะแทน kit Button
              เพราะต้องสูงกว่าปุ่มมาตรฐาน (เป็นเป้ากดหลักบนมือถือ)
              แต่คุมสี/มุม/โฟกัสให้เหมือนกับ Button ทุกประการ
            */}
            <button
              type="button"
              onClick={() => void preparePunch()}
              disabled={!canPunch}
              className={joinClassName(
                "flex h-12 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold transition 3xl:h-13 3xl:text-[15px]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                canPunch
                  ? "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800"
                  : "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400",
              )}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : currentSession?.punchType === "CHECK_OUT" ? (
                <LogOut className="h-4 w-4" />
              ) : (
                <Fingerprint className="h-4 w-4" />
              )}
              {punchLabel}
            </button>

            {/* ออกงานกดได้ตลอดจนถึงเวลาปิดรอบ แม้ตอนนี้จะอยู่รอบอื่น */}
            {checkoutRule &&
            currentSession?.sessionCode !== "CHECK_OUT" &&
            !isHoliday ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 3xl:text-[13.5px]">
                    ออกงาน
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-5 text-slate-400">
                    กดได้ตลอดจนถึง {checkoutRule.closeTime}
                    {checkoutPreview.minutes > 0
                      ? ` · ตอนนี้ออกก่อน ${num(checkoutPreview.minutes)} นาที หักประมาณ ${money(checkoutPreview.amount)} บาท`
                      : " · ตอนนี้ไม่ถือว่าออกก่อนเวลา"}
                  </p>
                </div>
                <Button
                  variant={checkoutPreview.minutes > 0 ? "danger" : "secondary"}
                  onClick={() => void preparePunch(checkoutRule)}
                  disabled={!canCheckout}
                  icon={<LogOut className="h-3.5 w-3.5" />}
                >
                  {checkoutLog
                    ? "ออกงานแล้ว"
                    : checkoutPreview.isAfterClose
                      ? "พ้นรอบออกงาน"
                      : "บันทึกออกงาน"}
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        {/* ---------------- ฝั่งขวา: รอบทั้งวัน ---------------- */}
        <section className="px-5 py-4 sm:px-6 3xl:px-7">
          <div className="border-b border-brand-100 pb-1.5">
            <h2 className={LABEL_CLASS}>รอบลงเวลาวันนี้</h2>
            <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
              ทุกรอบของกะที่สังกัด พร้อมเวลาที่ลงไปแล้ว
            </p>
          </div>

          {rules.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-slate-400">
              ยังไม่มีข้อมูลรอบลงเวลาของกะที่คุณสังกัด
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {rules.map((rule) => {
                const log = findLogForRule(context?.todayLogs ?? [], rule);
                const isCurrent = currentSession?.ruleId === rule.id;
                const lateMinutes = extractMinutesFromNote(
                  log?.note,
                  "lateMinutes",
                );
                const earlyMinutes = extractMinutesFromNote(
                  log?.note,
                  "earlyLeaveMinutes",
                );

                return (
                  <div
                    key={rule.id}
                    className={joinClassName(
                      "-mx-3 flex items-start justify-between gap-3 rounded-md px-3 py-2.5",
                      isCurrent && !log && "bg-brand-50/60",
                    )}
                  >
                    <div className="min-w-0">
                      <p
                        className={joinClassName(
                          "truncate text-[13px] font-semibold 3xl:text-[13.5px]",
                          isCurrent && !log
                            ? "text-brand-700"
                            : "text-slate-800",
                        )}
                      >
                        {rule.label}
                      </p>
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        {rule.openTime}–{rule.closeTime} ·{" "}
                        {getPunchTypeLabel(rule)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={joinClassName(
                          "text-[15px] font-bold tabular-nums leading-5 3xl:text-[16px]",
                          log ? "text-brand-700" : "text-slate-300",
                        )}
                      >
                        {log ? formatTime(log.logTime) : "—"}
                      </p>
                      {log ? (
                        <div className="mt-0.5 space-y-0.5">
                          <StatusText status={log.status} />
                          {lateMinutes > 0 ? (
                            <p className="text-[12px] text-amber-600">
                              สาย {num(lateMinutes)} นาที
                            </p>
                          ) : null}
                          {earlyMinutes > 0 ? (
                            <p className="text-[12px] text-rose-600">
                              ออกก่อน {num(earlyMinutes)} นาที
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-0.5 text-[12px] text-slate-400">
                          {isCurrent ? "ถึงรอบแล้ว" : "รอรอบ"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ---------------- ยืนยันก่อนบันทึก ---------------- */}
      <Modal
        open={Boolean(pendingPunch)}
        title={
          pendingPunch
            ? `ยืนยันบันทึก${getPunchTypeLabel(pendingPunch)}`
            : "ยืนยันการลงเวลา"
        }
        description={pendingPunch?.label}
        size="sm"
        onClose={() => setPendingPunch(null)}
        footer={
          <ModalActions
            onCancel={() => setPendingPunch(null)}
            onConfirm={() => void submitPunch()}
            confirmLabel="บันทึกเวลา"
            loading={saving}
          />
        }
      >
        <ul className="space-y-1.5 text-[13px] leading-6 text-slate-600">
          {(pendingPunch?.lines ?? []).map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
              {line}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
