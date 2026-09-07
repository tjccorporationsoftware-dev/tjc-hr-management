"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Fingerprint,
  Laptop,
  PencilLine,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { ThaiDateInput } from "@/components/common/thai-date-input";
import { Button, ButtonLink, Field, joinClassName } from "@/components/kit";
import { getEssAttendance, getMyAttendanceDailySummaries } from "@/lib/api";
import { formatThaiDate, formatThaiTime } from "@/lib/date-format";
import type { AttendanceDailySummary } from "@/types/attendance";
import type { EssAttendanceLog } from "@/types/ess";

/**
 * ประวัติลงเวลาของฉัน
 * -------------------
 * รวม log ดิบของแต่ละวันให้เหลือแถวละหนึ่งวัน แล้วเทียบกับสรุปรายวันที่ระบบคำนวณไว้
 * (สรุปรายวันเชื่อถือได้กว่า note ใน log จึงให้สรุปเป็นตัวตั้งเสมอ)
 */

type AttendanceLogExtra = EssAttendanceLog & {
  session?: string | null;
  source?: string | null;
};

type DailyAttendanceRow = {
  workDate: string;
  logs: EssAttendanceLog[];
  morning: EssAttendanceLog | null;
  afternoon: EssAttendanceLog | null;
  checkout: EssAttendanceLog | null;
  deviceText: string;
  isLate: boolean;
  isEarlyCheckout: boolean;
  isCheckoutLate: boolean;
  lateText: string;
  earlyCheckoutText: string;
  checkoutLateText: string;
};

// ─── ตัวช่วยอ่านค่าจาก log ────────────────────────────────────────────────────

function firstDayOfMonth() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function textValue(value: unknown, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function upperValue(value?: string | null) {
  return textValue(value, "").toUpperCase();
}

function logSession(item: EssAttendanceLog) {
  return upperValue((item as AttendanceLogExtra).session);
}

function logType(item: EssAttendanceLog) {
  return upperValue(item.logType);
}

function logSource(item: EssAttendanceLog) {
  return upperValue((item as AttendanceLogExtra).source ?? item.channel);
}

function getWorkDateKey(item: EssAttendanceLog) {
  return textValue(item.workDate, textValue(item.logTime, "").slice(0, 10));
}

function getLogTimeMs(item: EssAttendanceLog) {
  if (!item.logTime) return 0;
  const time = new Date(item.logTime).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortLogsByTime(logs: EssAttendanceLog[]) {
  return [...logs].sort((a, b) => getLogTimeMs(a) - getLogTimeMs(b));
}

function getLogLocalHour(item: EssAttendanceLog) {
  const rawTime = textValue(item.logTime, "");
  if (!rawTime) return null;

  const timeOnlyMatch = /^(\d{1,2}):(\d{2})/.exec(rawTime);
  if (timeOnlyMatch && !rawTime.includes("T")) {
    const hour = Number(timeOnlyMatch[1]);
    return Number.isFinite(hour) ? hour : null;
  }

  const date = new Date(rawTime);
  if (Number.isNaN(date.getTime())) return null;

  return date.getHours();
}

function hasExplicitMorningSession(item: EssAttendanceLog) {
  const session = logSession(item);
  return session === "MORNING" || session === "MORNING_IN";
}

function hasExplicitAfternoonSession(item: EssAttendanceLog) {
  const session = logSession(item);
  return session === "AFTERNOON" || session === "AFTERNOON_IN";
}

function hasExplicitCheckoutSession(item: EssAttendanceLog) {
  const session = logSession(item);
  return session === "EVENING" || session === "CHECK_OUT";
}

function isMorningLog(item: EssAttendanceLog) {
  if (hasExplicitMorningSession(item)) return true;
  if (hasExplicitAfternoonSession(item) || hasExplicitCheckoutSession(item)) {
    return false;
  }
  if (logType(item) !== "CHECK_IN") return false;

  const hour = getLogLocalHour(item);
  return hour !== null && hour < 12;
}

function isAfternoonLog(item: EssAttendanceLog) {
  if (hasExplicitAfternoonSession(item)) return true;
  if (hasExplicitMorningSession(item) || hasExplicitCheckoutSession(item)) {
    return false;
  }

  const type = logType(item);
  if (type === "BREAK_END") return true;
  if (type !== "CHECK_IN") return false;

  const hour = getLogLocalHour(item);
  return hour !== null && hour >= 12;
}

function isCheckoutLog(item: EssAttendanceLog) {
  return hasExplicitCheckoutSession(item) || logType(item) === "CHECK_OUT";
}

function getChannelLabel(value?: string | null) {
  const key = upperValue(value);
  const map: Record<string, string> = {
    WEB: "เว็บ",
    WEB_ESS: "เว็บ",
    MOBILE_APP: "มือถือ",
    MOBILE: "มือถือ",
    SCANNER: "เครื่องสแกนนิ้ว",
    FINGERPRINT: "เครื่องสแกนนิ้ว",
    FINGERPRINT_SCANNER: "เครื่องสแกนนิ้ว",
    DEVICE: "เครื่องสแกนนิ้ว",
    IMPORT: "นำเข้าไฟล์",
    MANUAL: "บันทึกโดย HR",
    API: "API",
  };
  return map[key] ?? textValue(value);
}

function getDeviceName(item: EssAttendanceLog) {
  return (
    textValue(item.device?.name, "") ||
    textValue(item.device?.code, "") ||
    getChannelLabel((item as AttendanceLogExtra).source ?? item.channel) ||
    "-"
  );
}

function getDeviceText(logs: EssAttendanceLog[]) {
  const values = logs
    .map((item) => getDeviceName(item))
    .filter((value) => value && value !== "-");

  const unique = Array.from(new Set(values));
  return unique.length > 0 ? unique.join(" / ") : "-";
}

/** นาทีสาย/ออกก่อน/ออกช้า ถูกฝากไว้ในโน้ตของ log ตอนคำนวณฝั่งหลังบ้าน */
function extractFirstMinutesFromNote(
  note: string | null | undefined,
  keys: string[],
) {
  if (!note) return 0;

  for (const key of keys) {
    const matched = note.match(new RegExp(`${key}=(\\d+)`));
    const value = matched ? Number(matched[1]) || 0 : 0;
    if (value > 0) return value;
  }

  return 0;
}

function getLateMinutes(item?: EssAttendanceLog | null) {
  return extractFirstMinutesFromNote(item?.note, ["lateMinutes"]);
}

function getLateOutMinutes(item?: EssAttendanceLog | null) {
  return extractFirstMinutesFromNote(item?.note, [
    "lateOutMinutes",
    "lateCheckoutMinutes",
    "extraPresenceMinutes",
    "extraMinutes",
  ]);
}

function getEarlyOutMinutes(item?: EssAttendanceLog | null) {
  return extractFirstMinutesFromNote(item?.note, [
    "earlyLeaveMinutes",
    "earlyCheckoutMinutes",
    "earlyOutMinutes",
  ]);
}

function getNumericMinutes(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function minutesText(value: number, fallback = "-") {
  return value > 0 ? `${value.toLocaleString("th-TH")} นาที` : fallback;
}

function thaiWeekday(workDate: string) {
  /*
   * workDate ที่ได้จาก log เป็น ISO เต็ม ("2026-08-28T00:00:00.000Z")
   * ต่อ "T00:00:00" ท้ายค่าที่มีเวลาอยู่แล้วจะได้ Invalid Date
   * ทุกแถวจึงขึ้นเป็นขีด ไม่เคยเห็นชื่อวันเลย — ตัดให้เหลือเฉพาะส่วนวันที่ก่อน
   */
  const date = new Date(`${workDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(date);
}

function buildDailyRows(
  items: EssAttendanceLog[],
  summaries: AttendanceDailySummary[] = [],
): DailyAttendanceRow[] {
  const grouped = new Map<string, EssAttendanceLog[]>();
  const summaryByDate = new Map(
    summaries
      .filter((summary) => summary.workDate)
      .map((summary) => [summary.workDate, summary] as const),
  );

  items.forEach((item) => {
    const key = getWorkDateKey(item);
    if (!key || key === "-") return;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });

  return Array.from(grouped.entries())
    .map(([workDate, logs]) => {
      const sortedLogs = sortLogsByTime(logs);
      const checkoutLogs = sortedLogs.filter(isCheckoutLog);

      const morning = sortedLogs.filter(isMorningLog)[0] ?? null;
      const afternoon = sortedLogs.filter(isAfternoonLog)[0] ?? null;
      const checkout = checkoutLogs[checkoutLogs.length - 1] ?? null;

      const summary = summaryByDate.get(workDate) ?? null;
      const lateMinutes =
        getNumericMinutes(summary?.totalLateMinutes) ||
        getLateMinutes(morning) + getLateMinutes(afternoon);
      const earlyCheckoutMinutes =
        getNumericMinutes(summary?.earlyCheckoutMinutes) ||
        getEarlyOutMinutes(checkout);
      const checkoutLateMinutes =
        getNumericMinutes(summary?.lateCheckoutMinutes) ||
        getNumericMinutes(summary?.extraPresenceMinutes) ||
        getLateOutMinutes(checkout);

      return {
        workDate,
        logs: sortedLogs,
        morning,
        afternoon,
        checkout,
        deviceText: getDeviceText(sortedLogs),
        isLate:
          lateMinutes > 0 ||
          [morning, afternoon].some((item) => item?.status === "LATE"),
        isEarlyCheckout:
          earlyCheckoutMinutes > 0 || checkout?.status === "EARLY_LEAVE",
        isCheckoutLate: checkoutLateMinutes > 0,
        lateText: minutesText(
          lateMinutes,
          [morning, afternoon].some((item) => item?.status === "LATE")
            ? "สาย"
            : "-",
        ),
        earlyCheckoutText: minutesText(
          earlyCheckoutMinutes,
          checkout?.status === "EARLY_LEAVE" ? "ออกก่อน" : "-",
        ),
        checkoutLateText: minutesText(checkoutLateMinutes),
      };
    })
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
}

// ─── ชิ้นส่วนของรายการ ────────────────────────────────────────────────────────

const FIELD_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]";

/** เวลาของหนึ่งรอบ — ป้ายรอบอยู่บน เวลาอยู่ล่าง ทุกวันจึงเทียบกันตรงแนว */
function PunchTime({
  label,
  item,
}: {
  label: string;
  item?: EssAttendanceLog | null;
}) {
  return (
    <div className="w-[5.5rem] shrink-0 3xl:w-[6rem]">
      <p className={FIELD_LABEL_CLASS}>{label}</p>
      <p
        className={joinClassName(
          "text-[13.5px] font-bold tabular-nums 3xl:text-[14.5px]",
          item?.logTime ? "text-slate-900" : "text-slate-300",
        )}
      >
        {item?.logTime ? formatThaiTime(item.logTime) : "—"}
      </p>
    </div>
  );
}

/** ป้ายผลของวัน — สาย / ออกก่อน / ออกช้า */
function ResultChip({ text, tone }: { text: string; tone: "amber" | "rose" }) {
  return (
    <span
      className={joinClassName(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums",
        tone === "rose"
          ? "bg-rose-50 text-rose-700"
          : "bg-amber-50 text-amber-700",
      )}
    >
      {text}
    </span>
  );
}

/** อุปกรณ์ที่ใช้ลงเวลาในวันนั้น */
function DeviceCell({ row }: { row: DailyAttendanceRow }) {
  const joined = row.logs.map((item) => logSource(item)).join(" ");
  const icon = joined.includes("MOBILE") ? (
    <Smartphone className="h-3.5 w-3.5" />
  ) : joined.includes("SCANNER") ||
    joined.includes("FINGERPRINT") ||
    joined.includes("DEVICE") ? (
    <Fingerprint className="h-3.5 w-3.5" />
  ) : (
    <Laptop className="h-3.5 w-3.5" />
  );

  return (
    <div className="hidden w-[13rem] shrink-0 items-center gap-2 xl:flex 3xl:w-[15rem]">
      <span className="shrink-0 text-slate-300">{icon}</span>
      <div className="min-w-0">
        <p className={FIELD_LABEL_CLASS}>อุปกรณ์ที่ใช้</p>
        <p
          className="truncate text-[12.5px] font-semibold text-slate-800 3xl:text-[13px]"
          title={row.deviceText}
        >
          {row.deviceText}
        </p>
      </div>
    </div>
  );
}

/** ตัวเลขสรุปหนึ่งช่องของช่วงที่เลือก */
function HistoryFact({
  label,
  helper,
  value,
  tone = "neutral",
}: {
  label: string;
  helper: string;
  value: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  const valueClass = {
    neutral: "text-slate-900",
    positive: "text-emerald-600",
    warning: "text-amber-600",
  }[tone];

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 last:border-b-0 sm:px-6 xl:border-b-0 xl:border-r xl:last:border-r-0 3xl:px-7">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-500 3xl:text-[11.5px]">
          {label}
        </p>
        <p className="truncate text-[10.5px] leading-4 text-slate-400">
          {helper}
        </p>
      </div>

      <p
        className={joinClassName(
          "shrink-0 text-[20px] font-bold leading-none tabular-nums 3xl:text-[22px]",
          valueClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ─── แผงหลัก ─────────────────────────────────────────────────────────────────

export function AttendanceHistoryPanel() {
  const [items, setItems] = useState<EssAttendanceLog[]>([]);
  const [summaryItems, setSummaryItems] = useState<AttendanceDailySummary[]>(
    [],
  );
  const [total, setTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(todayDate());
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (showToast = false) => {
      try {
        setError(null);
        setReloading(true);
        const [attendanceResponse, summaryResponse] = await Promise.all([
          getEssAttendance({ page: 1, pageSize: 100, dateFrom, dateTo }),
          getMyAttendanceDailySummaries({
            page: 1,
            pageSize: 100,
            dateFrom,
            dateTo,
          }),
        ]);
        setItems(attendanceResponse.items ?? []);
        setSummaryItems(summaryResponse.items ?? []);
        setTotal(
          attendanceResponse.meta?.total ??
            attendanceResponse.items?.length ??
            0,
        );
        if (showToast) toast.success("โหลดประวัติลงเวลาล่าสุดแล้ว");
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "ไม่สามารถโหลดประวัติลงเวลาได้";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
        setReloading(false);
      }
    },
    [dateFrom, dateTo],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const rows = useMemo(
    () => buildDailyRows(items, summaryItems),
    [items, summaryItems],
  );

  const summary = useMemo(() => {
    return {
      complete: rows.filter(
        (row) => row.morning && row.afternoon && row.checkout,
      ).length,
      late: rows.filter((row) => row.isLate).length,
      earlyReturn: rows.filter((row) => row.isEarlyCheckout).length,
      lateReturn: rows.filter((row) => row.isCheckoutLate).length,
    };
  }, [rows]);

  const isUnlinkedAccount = Boolean(
    error?.includes("ยังไม่ได้ผูกกับข้อมูลพนักงาน"),
  );

  return (
    <>
      {/* แถบเครื่องมือพื้นเทาอ่อน ชุดเดียวกับหน้าอื่นทั้งระบบ */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 3xl:px-7 [&_input]:bg-white">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="จากวันที่" className="w-full sm:w-44">
            <ThaiDateInput
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-0"
            />
          </Field>
          <Field label="ถึงวันที่" className="w-full sm:w-44">
            <ThaiDateInput
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-0"
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => void loadData(true)}
            disabled={reloading}
            icon={
              <RefreshCw
                className={joinClassName(
                  "h-3.5 w-3.5",
                  reloading && "animate-spin",
                )}
              />
            }
          >
            โหลดข้อมูล
          </Button>
        </div>

        <ButtonLink
          href="/ess/requests?tab=time-adjust"
          variant="secondary"
          icon={<PencilLine className="h-3.5 w-3.5" />}
        >
          ขอแก้เวลา
        </ButtonLink>
      </div>

      {/* ตัวเลขสรุปของช่วงที่เลือก คั่นด้วยเส้น ไม่ใช่กล่องห้าใบ */}
      <div className="grid border-b border-slate-200 xl:grid-cols-5">
        <HistoryFact
          label="วันที่มีประวัติ"
          helper={`${total.toLocaleString("th-TH")} รายการลงเวลา`}
          value={rows.length.toLocaleString("th-TH")}
        />
        <HistoryFact
          label="ครบ 3 รอบ"
          helper="เข้าเช้า เข้าบ่าย ออกงาน"
          value={summary.complete.toLocaleString("th-TH")}
          tone={
            rows.length > 0 && summary.complete === rows.length
              ? "positive"
              : "neutral"
          }
        />
        <HistoryFact
          label="มาสาย"
          helper="รวมสายเช้าและสายบ่าย"
          value={summary.late.toLocaleString("th-TH")}
          tone={summary.late > 0 ? "warning" : "neutral"}
        />
        <HistoryFact
          label="ออกก่อนเวลา"
          helper="ออกก่อนเวลามาตรฐาน"
          value={summary.earlyReturn.toLocaleString("th-TH")}
          tone={summary.earlyReturn > 0 ? "warning" : "neutral"}
        />
        <HistoryFact
          label="ออกช้ากว่ากำหนด"
          helper="อยู่เกินเวลามาตรฐาน"
          value={summary.lateReturn.toLocaleString("th-TH")}
        />
      </div>

      {/*
        รายการวันละแถว ไม่ใช่ตาราง — ตารางเดิมกว้าง 64rem ต้องเลื่อนแนวนอน
        และซ่อนคอลัมน์ "ออกช้า" กับ "อุปกรณ์" ตามความกว้างจอ
      */}
      {loading ? (
        <p className="px-5 py-16 text-center text-[13px] font-semibold text-slate-600">
          กำลังโหลด…
        </p>
      ) : error ? (
        <div className="px-5 py-16 text-center">
          <p className="mx-auto max-w-lg text-[13px] font-semibold text-slate-600">
            {isUnlinkedAccount
              ? "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงยังดูประวัติลงเวลาไม่ได้ — ผูกบัญชีกับพนักงานได้ที่หน้า ผู้ใช้และสิทธิ์"
              : error}
          </p>
          <div className="mt-4 flex justify-center">
            <Button size="sm" onClick={() => void loadData()}>
              ลองใหม่
            </Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-[13px] font-semibold text-slate-600">
            ไม่พบประวัติลงเวลา
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
            ลองเปลี่ยนช่วงวันที่ หรือกลับไปที่แท็บลงเวลาวันนี้
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {rows.map((row) => {
            const complete = Boolean(
              row.morning && row.afternoon && row.checkout,
            );

            return (
              <article
                key={row.workDate}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6 3xl:px-7"
              >
                <div className="w-[10.5rem] shrink-0 3xl:w-[11.5rem]">
                  <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
                    {formatThaiDate(row.workDate)}
                  </p>
                  <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
                    {thaiWeekday(row.workDate)} ·{" "}
                    {complete ? (
                      "ครบ 3 รอบ"
                    ) : (
                      <span className="text-amber-600">ข้อมูลไม่ครบ</span>
                    )}
                  </p>
                </div>

                <PunchTime label="เข้าเช้า" item={row.morning} />
                <PunchTime label="เข้าบ่าย" item={row.afternoon} />
                <PunchTime label="ออกงาน" item={row.checkout} />

                {/* ผลของวันรวมไว้ช่องเดียว วันที่ปกติจึงไม่มีช่องว่างเรียงกันสามช่อง */}
                <div className="flex min-w-[9rem] flex-1 flex-wrap items-center gap-1.5">
                  {row.isLate ? (
                    <ResultChip text={`สาย ${row.lateText}`} tone="amber" />
                  ) : null}
                  {row.isEarlyCheckout ? (
                    <ResultChip
                      text={`ออกก่อน ${row.earlyCheckoutText}`}
                      tone="rose"
                    />
                  ) : null}
                  {row.isCheckoutLate ? (
                    <ResultChip
                      text={`ออกช้า ${row.checkoutLateText}`}
                      tone="amber"
                    />
                  ) : null}
                  {!row.isLate &&
                  !row.isEarlyCheckout &&
                  !row.isCheckoutLate ? (
                    <span className="text-[11.5px] text-slate-300">
                      ไม่มีรายการผิดปกติ
                    </span>
                  ) : null}
                </div>

                <DeviceCell row={row} />
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
