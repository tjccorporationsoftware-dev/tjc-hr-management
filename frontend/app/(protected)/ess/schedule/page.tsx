"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileClock,
  FileText,
  Loader2,
  RefreshCw,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

import { getEssSchedule } from "@/lib/api";

import type { EssScheduleDay, EssScheduleResponse } from "@/types/ess";

import { formatThaiDate as formatDateFixDate, formatThaiDateTime as formatDateFixDateTime } from "@/lib/date-format";
const CARD_CLASS =
  "rounded-[26px] border border-slate-200/80 bg-white shadow-[0_14px_35px_rgba(15,23,42,0.045)]";

const INPUT_CLASS =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

function dateText(value?: string | null) {
  return formatDateFixDate(value);
}

function dateTimeText(value?: string | null) {
  return formatDateFixDateTime(value);
}

function formatDateTime(value: Date | string) {
  return formatDateFixDateTime(value);
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "number") {
    return value.toLocaleString("th-TH", {
      maximumFractionDigits: 2,
    });
  }

  return String(value);
}

function monthName(month: number) {
  return `เดือน ${String(month).padStart(2, "0")}`;
}

function employeeName(data: EssScheduleResponse | null) {
  const employee = data?.employee;

  if (!employee) return "-";

  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.employeeCode ||
    "-"
  );
}

function statusText(status: EssScheduleDay["status"]) {
  const map: Record<EssScheduleDay["status"], string> = {
    NORMAL: "ปกติ",
    HAS_ATTENDANCE: "มีลงเวลา",
    ON_LEAVE: "ลา",
    HAS_OT: "มี OT",
    HAS_TIME_ADJUST: "มีแก้เวลา",
    MIXED: "มีหลายรายการ",
  };

  return map[status] ?? status;
}

function statusClass(status: EssScheduleDay["status"]) {
  const map: Record<EssScheduleDay["status"], string> = {
    NORMAL: "bg-slate-100 text-slate-600 ring-slate-200",
    HAS_ATTENDANCE: "bg-blue-50 text-blue-700 ring-blue-200",
    ON_LEAVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    HAS_OT: "bg-violet-50 text-violet-700 ring-violet-200",
    HAS_TIME_ADJUST: "bg-amber-50 text-amber-700 ring-amber-200",
    MIXED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  };

  return map[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function todayKey() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export default function EssSchedulePage() {
  const now = new Date();

  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<EssScheduleResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState<EssScheduleDay | null>(null);

  const weeks = useMemo(() => {
    const days = data?.days ?? [];
    const result: (EssScheduleDay | null)[][] = [];

    if (days.length === 0) return result;

    const firstDate = new Date(days[0].date);
    const firstDayOfWeek = firstDate.getDay();

    let currentWeek: (EssScheduleDay | null)[] = [];

    for (let i = 0; i < firstDayOfWeek; i += 1) {
      currentWeek.push(null);
    }

    days.forEach((day) => {
      currentWeek.push(day);

      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }

      result.push(currentWeek);
    }

    return result;
  }, [data]);

  async function loadData(nextYear = year, nextMonth = month) {
    setLoading(true);

    try {
      const response = await getEssSchedule({
        year: nextYear,
        month: nextMonth,
      });

      setData(response);
      setSelectedDay(
        response.days.find((item) => item.date === todayKey()) ??
          response.days[0] ??
          null,
      );
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, "โหลดตารางงานไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  function updateYear(value: string) {
    const nextYear = Number(value);

    setYear(nextYear);

    if (Number.isInteger(nextYear) && nextYear >= 2000 && nextYear <= 2200) {
      void loadData(nextYear, month);
    }
  }

  function updateMonth(value: string) {
    const nextMonth = Number(value);

    setMonth(nextMonth);

    if (Number.isInteger(nextMonth) && nextMonth >= 1 && nextMonth <= 12) {
      void loadData(year, nextMonth);
    }
  }

  useEffect(() => {
    void loadData(now.getFullYear(), now.getMonth() + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 lg:px-5">
      <div className="mx-auto max-w-[1540px] space-y-5">
        <section className="relative min-h-[176px] overflow-hidden rounded-[28px] border border-blue-100 bg-white px-6 py-6 shadow-sm">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[43%] overflow-hidden rounded-r-[28px] bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100/80 lg:block">
            <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-white/75" />
            <div className="absolute right-0 top-0 h-full w-full bg-[radial-gradient(circle_at_70%_30%,rgba(186,230,253,0.55),transparent_35%)]" />

            <div className="absolute bottom-8 right-[270px] flex items-end gap-3">
              <div className="h-10 w-4 rounded-t-full bg-blue-200/90" />
              <div className="h-16 w-4 rounded-t-full bg-cyan-300/90" />
              <div className="h-[88px] w-4 rounded-t-full bg-blue-400/85" />
              <div className="h-14 w-4 rounded-t-full bg-indigo-300/90" />
            </div>

            <div className="absolute bottom-8 right-24 h-[94px] w-[128px] rounded-[26px] border border-white/80 bg-white/65 shadow-[0_20px_45px_rgba(59,130,246,0.14)] backdrop-blur">
              <div className="mx-auto mt-5 flex h-8 w-8 items-center justify-center rounded-full bg-blue-200/75 text-blue-700">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="mx-auto mt-4 h-2 w-[70px] rounded-full bg-blue-200/80" />
              <div className="mx-auto mt-3 h-2 w-[54px] rounded-full bg-blue-100/90" />
            </div>
          </div>

          <div className="relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100 text-blue-600 shadow-sm shadow-blue-100/70">
                  <CalendarDays className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-blue-600">ESS</span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span className="font-medium text-slate-500">
                      ตารางงานพนักงาน
                    </span>
                  </div>

                  <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-[-0.035em] text-slate-950">
                    ตารางงานของฉัน
                  </h1>

                  <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">
                    ดูตารางงานรายเดือน รายการลงเวลา การลา OT และคำขอแก้เวลา
                    จากข้อมูลจริงในระบบ ESS
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 text-xs font-medium text-slate-500 shadow-sm backdrop-blur">
                      อัปเดตล่าสุด {formatDateTime(new Date())}
                    </span>

                    <span className="inline-flex h-8 items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/80 px-3 text-xs font-medium text-blue-700 shadow-sm backdrop-blur">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]" />
                      {monthName(month)} {year}
                    </span>

                    <span className="inline-flex h-8 items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 text-xs font-medium text-slate-500 shadow-sm backdrop-blur">
                      {employeeName(data)} · {data?.employee.employeeCode ?? "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2.5">
              <Link
                href="/ess"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                กลับ ESS
              </Link>

              <Link
                href="/ess/requests"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 px-4 text-sm font-medium text-blue-700 shadow-sm transition hover:bg-blue-100"
              >
                คำขอของฉัน
              </Link>

              <input
                type="number"
                value={year}
                onChange={(event) => updateYear(event.target.value)}
                className={`${INPUT_CLASS} w-28`}
                placeholder="ปี"
              />

              <select
                value={month}
                onChange={(event) => updateMonth(event.target.value)}
                className={`${INPUT_CLASS} w-36`}
              >
                {Array.from({ length: 12 }).map((_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {monthName(index + 1)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => loadData()}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-medium text-white shadow-[0_12px_26px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                โหลดข้อมูล
              </button>
            </div>
          </div>
        </section>

        {data?.warning ? (
          <section className="flex items-start gap-3 rounded-[24px] border border-amber-100 bg-amber-50/90 px-4 py-3 text-sm text-amber-800 shadow-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{data.warning}</span>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            title="วันทำงาน"
            value={data?.summary.workDays ?? 0}
            icon={<CalendarDays className="h-5 w-5" />}
            tone="blue"
          />
          <MetricCard
            title="วันหยุด"
            value={data?.summary.weekendDays ?? 0}
            icon={<CalendarDays className="h-5 w-5" />}
            tone="slate"
          />
          <MetricCard
            title="วันที่ลงเวลา"
            value={data?.summary.attendanceDays ?? 0}
            icon={<Clock3 className="h-5 w-5" />}
            tone="emerald"
          />
          <MetricCard
            title="วันที่ลา"
            value={data?.summary.leaveDays ?? 0}
            icon={<FileText className="h-5 w-5" />}
            tone="violet"
          />
          <MetricCard
            title="วันที่มี OT"
            value={data?.summary.overtimeDays ?? 0}
            icon={<Timer className="h-5 w-5" />}
            tone="amber"
          />
          <MetricCard
            title="วันที่แก้เวลา"
            value={data?.summary.timeAdjustDays ?? 0}
            icon={<FileClock className="h-5 w-5" />}
            tone="blue"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className={`${CARD_CLASS} overflow-hidden p-5`}>
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-center">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <CalendarDays className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    {monthName(month)} {year}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {employeeName(data)} · {data?.employee.employeeCode ?? "-"}
                  </p>
                </div>
              </div>

              <div className="inline-flex h-8 items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 shadow-sm">
                รอบวันที่ {dateText(data?.period.dateFrom)} -{" "}
                {dateText(data?.period.dateTo)}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-medium text-slate-500">
              <div>อา.</div>
              <div>จ.</div>
              <div>อ.</div>
              <div>พ.</div>
              <div>พฤ.</div>
              <div>ศ.</div>
              <div>ส.</div>
            </div>

            <div className="mt-2 space-y-2">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-2">
                  {week.map((day, dayIndex) => {
                    if (!day) {
                      return (
                        <div
                          key={`empty-${weekIndex}-${dayIndex}`}
                          className="min-h-[112px] rounded-[22px] border border-dashed border-slate-100 bg-slate-50/70"
                        />
                      );
                    }

                    const isSelected = selectedDay?.date === day.date;
                    const isToday = day.date === todayKey();

                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className={[
                          "min-h-[112px] rounded-[22px] border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.06)]",
                          isSelected
                            ? "border-blue-200 bg-blue-50/90 shadow-sm shadow-blue-100"
                            : day.isHoliday
                              ? "border-amber-100 bg-amber-50/70"
                              : day.isWeekend
                                ? "border-slate-100 bg-slate-50/80"
                                : "border-slate-100 bg-white",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-slate-950">
                                {day.dayOfMonth}
                              </span>
                              {isToday ? (
                                <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-medium text-white">
                                  วันนี้
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-1 text-[11px] text-slate-500">
                              {day.dayName}
                            </div>
                          </div>

                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                              statusClass(day.status),
                            ].join(" ")}
                          >
                            {statusText(day.status)}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1">
                          {day.isHoliday ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                              {day.holidayName ?? "วันหยุดบริษัท"}
                            </span>
                          ) : null}
                          {day.attendanceLogs.length > 0 ? (
                            <SmallPill text={`ลงเวลา ${day.attendanceLogs.length}`} />
                          ) : null}
                          {day.leaveRequests.length > 0 ? (
                            <SmallPill text="ลา" />
                          ) : null}
                          {day.overtimeRequests.length > 0 ? (
                            <SmallPill text="OT" />
                          ) : null}
                          {day.timeAdjustRequests.length > 0 ? (
                            <SmallPill text="แก้เวลา" />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className={`${CARD_CLASS} p-5`}>
            {selectedDay ? (
              <DayDetail day={selectedDay} />
            ) : (
              <EmptyCard text="เลือกวันที่เพื่อดูรายละเอียด" />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function DayDetail({ day }: { day: EssScheduleDay }) {
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[24px] border border-blue-100 bg-gradient-to-br from-blue-50/90 via-white to-sky-50 p-4">
        <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-blue-200/35 blur-3xl" />

        <div className="relative">
          <div className="text-sm font-medium text-slate-500">
            รายละเอียดวันที่
          </div>

          <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">
            {dateText(day.date)}
          </h2>

          <div className="mt-2">
            <span
              className={[
                "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                statusClass(day.status),
              ].join(" ")}
            >
              {statusText(day.status)}
            </span>
          </div>
        </div>
      </div>

      <DetailSection title="รายการลงเวลา" icon={<Clock3 className="h-4 w-4" />}>
        {day.attendanceLogs.map((item) => (
          <DetailItem
            key={item.id}
            title={`${item.logType ?? "-"} · ${dateTimeText(item.logTime)}`}
            description={`${item.channel ?? "-"} · ${
              item.location?.nameTh ?? "-"
            }`}
          />
        ))}

        {day.attendanceLogs.length === 0 ? (
          <EmptyMini text="ไม่มีรายการลงเวลา" />
        ) : null}
      </DetailSection>

      <DetailSection title="รายการลา" icon={<FileText className="h-4 w-4" />}>
        {day.leaveRequests.map((item) => (
          <DetailItem
            key={item.id}
            title={item.leaveType?.nameTh ?? "ลา"}
            description={`${dateText(item.startDate)} - ${dateText(
              item.endDate,
            )} · ${item.status ?? "-"}`}
          />
        ))}

        {day.leaveRequests.length === 0 ? (
          <EmptyMini text="ไม่มีรายการลา" />
        ) : null}
      </DetailSection>

      <DetailSection title="รายการ OT" icon={<Timer className="h-4 w-4" />}>
        {day.overtimeRequests.map((item) => (
          <DetailItem
            key={item.id}
            title={`${dateTimeText(item.startTime)} - ${dateTimeText(
              item.endTime,
            )}`}
            description={`${valueText(item.totalHours)} ชม. · ${
              item.status ?? "-"
            }`}
          />
        ))}

        {day.overtimeRequests.length === 0 ? (
          <EmptyMini text="ไม่มีรายการ OT" />
        ) : null}
      </DetailSection>

      <DetailSection title="รายการขอแก้เวลา" icon={<FileClock className="h-4 w-4" />}>
        {day.timeAdjustRequests.map((item) => (
          <DetailItem
            key={item.id}
            title={dateTimeText(item.requestedLogTime)}
            description={`${item.adjustType ?? item.requestedLogType ?? "-"} · ${
              item.status ?? "-"
            }`}
          />
        ))}

        {day.timeAdjustRequests.length === 0 ? (
          <EmptyMini text="ไม่มีรายการขอแก้เวลา" />
        ) : null}
      </DetailSection>
    </div>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </span>
        {title}
      </div>

      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-3.5 py-3 shadow-sm">
      <div className="text-sm font-medium text-slate-950">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  tone: "blue" | "emerald" | "violet" | "amber" | "slate";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "violet"
        ? "bg-violet-50 text-violet-600"
        : tone === "amber"
          ? "bg-amber-50 text-amber-600"
          : tone === "slate"
            ? "bg-slate-100 text-slate-600"
            : "bg-blue-50 text-blue-600";

  return (
    <div className="group relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-blue-50/80 to-transparent" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-600">{title}</div>
          <div className="mt-3 text-[24px] font-semibold leading-none tracking-[-0.045em] text-slate-950">
            {value}
          </div>
        </div>

        <div
          className={[
            "flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[20px] shadow-sm",
            toneClass,
          ].join(" ")}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function SmallPill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-blue-100 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">
      {text}
    </span>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-3 text-center text-xs text-slate-400">
      {text}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <CalendarDays className="h-6 w-6" />
      </div>
      {text}
    </div>
  );
}