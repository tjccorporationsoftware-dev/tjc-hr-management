"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { countText } from "@/components/common/insight-blocks";
import { Button, Notice, Section, joinClassName } from "@/components/kit";
import { getManagerTeamCalendar } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { ManagerCalendarDay } from "@/types/manager";

/**
 * แท็บ "ปฏิทินทีม"
 * ---------------
 * ก่อนกดอนุมัติใบลา หัวหน้าต้องรู้ว่า "วันนั้นมีคนลาอยู่แล้วกี่คน" ไม่งั้นจะอนุมัติ
 * ทีละใบจนวันเดียวกันเหลือคนไม่พอทำงาน หน้านี้จึงวางเป็นปฏิทินทั้งเดือน
 * แต่ละช่องบอกจำนวนคนที่ไม่อยู่ + รายชื่อ และไฮไลต์วันที่คนหายเกินครึ่งทีม
 *
 * นับทั้งใบที่อนุมัติแล้วและที่ยังรออนุมัติ (ใบที่รออยู่ขึ้นเส้นประ) เพราะคำขอที่
 * ค้างอยู่ก็มีสิทธิ์กลายเป็นวันหยุดจริงถ้าหัวหน้ากดอนุมัติ
 */

const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function monthKeyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, step: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, (month ?? 1) - 1 + step, 1);

  return monthKeyOf(next);
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return new Date(year, (month ?? 1) - 1, 1).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });
}

function dayNumber(date: string) {
  return Number(date.slice(8, 10));
}

export function TeamCalendarPanel() {
  const [month, setMonth] = useState(() => monthKeyOf(new Date()));
  const [selected, setSelected] = useState<string | null>(null);

  const params = useMemo(() => ({ month }), [month]);

  const query = useApiQuery(
    queryKeys.manager.section("team-calendar", params),
    () => getManagerTeamCalendar(params),
  );

  const data = query.data ?? null;
  const teamTotal = data?.teamTotal ?? 0;
  // memo ไว้ ไม่งั้น array ใหม่ทุกเรนเดอร์จะทำให้ useMemo ข้างล่างคำนวณใหม่ตลอด
  const days = useMemo(() => data?.days ?? [], [data?.days]);

  const selectedDay = useMemo(
    () => days.find((day) => day.date === selected) ?? null,
    [days, selected],
  );

  /** เติมช่องว่างหน้าวันที่ 1 ให้ตรงคอลัมน์วันในสัปดาห์ */
  const leadingBlanks = days.length > 0 ? days[0].weekday : 0;

  const busiestDay = useMemo(
    () =>
      days.reduce<ManagerCalendarDay | null>(
        (top, day) => (day.awayTotal > (top?.awayTotal ?? 0) ? day : top),
        null,
      ),
    [days],
  );

  const totalLeaveDays = days.reduce((sum, day) => sum + day.leaves.length, 0);
  const totalOffsiteDays = days.reduce(
    (sum, day) => sum + day.offsites.length,
    0,
  );

  if (query.isPending) {
    return (
      <div className="px-5 py-6 3xl:px-6">
        <LoadingState title="กำลังโหลดปฏิทินทีม" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-5 py-6 3xl:px-6">
        <ErrorState
          title="โหลดปฏิทินทีมไม่สำเร็จ"
          description={getErrorMessage(query.error)}
          action={
            <Button onClick={() => void query.refetch()}>ลองใหม่</Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <Section
        title={`ปฏิทินทีม · ${monthLabel(month)}`}
        description={`ลูกทีม ${countText(teamTotal)} คน · เดือนนี้มีวันลารวม ${countText(totalLeaveDays)} วัน-คน และทำงานนอกสถานที่ ${countText(totalOffsiteDays)} วัน-คน`}
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              onClick={() => {
                setSelected(null);
                setMonth(shiftMonth(month, -1));
              }}
              icon={<ChevronLeft className="h-4 w-4" />}
            >
              เดือนก่อน
            </Button>
            <Button
              onClick={() => {
                setSelected(null);
                setMonth(monthKeyOf(new Date()));
              }}
            >
              เดือนนี้
            </Button>
            <Button
              onClick={() => {
                setSelected(null);
                setMonth(shiftMonth(month, 1));
              }}
              icon={<ChevronRight className="h-4 w-4" />}
            >
              เดือนหน้า
            </Button>
          </div>
        }
      >
        {busiestDay && busiestDay.awayTotal >= Math.ceil(teamTotal / 2) ? (
          <div className="mb-3">
            <Notice tone="warning">
              วันที่ {dayNumber(busiestDay.date)} มีคนไม่อยู่{" "}
              {countText(busiestDay.awayTotal)} จาก {countText(teamTotal)} คน —
              ควรเช็คก่อนอนุมัติใบลาเพิ่มในวันนั้น
            </Notice>
          </div>
        ) : null}

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
            >
              {label}
            </div>
          ))}

          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`blank-${index}`} />
          ))}

          {days.map((day) => {
            const isWeekend = day.weekday === 0 || day.weekday === 6;
            const heavy = teamTotal > 0 && day.awayTotal >= teamTotal / 2;
            const active = selected === day.date;

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelected(active ? null : day.date)}
                className={joinClassName(
                  "min-h-[76px] rounded-lg border px-2 py-1.5 text-left transition 3xl:min-h-[88px]",
                  active
                    ? "border-brand-600 bg-brand-50/60"
                    : day.isHoliday
                      ? "border-slate-200 bg-slate-50"
                      : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={joinClassName(
                      "text-[13px] font-semibold tabular-nums",
                      day.isHoliday || isWeekend
                        ? "text-slate-400"
                        : "text-slate-900",
                    )}
                  >
                    {dayNumber(day.date)}
                  </span>

                  {day.awayTotal > 0 ? (
                    <span
                      className={joinClassName(
                        "rounded-full px-1.5 text-[10.5px] font-bold tabular-nums",
                        heavy
                          ? "bg-amber-100 text-amber-800"
                          : "bg-brand-50 text-brand-700",
                      )}
                    >
                      {countText(day.awayTotal)}
                    </span>
                  ) : null}
                </div>

                {day.isHoliday ? (
                  <p className="mt-1 line-clamp-2 text-[10.5px] text-slate-400">
                    {day.holidayName}
                  </p>
                ) : null}

                <div className="mt-1 space-y-0.5">
                  {day.leaves.slice(0, 2).map((leave) => (
                    <p
                      key={`${day.date}-${leave.employeeId}`}
                      className={joinClassName(
                        "truncate text-[10.5px]",
                        leave.status === "APPROVED"
                          ? "text-brand-700"
                          : "text-slate-400 italic",
                      )}
                    >
                      {leave.name}
                    </p>
                  ))}
                  {day.awayTotal > 2 ? (
                    <p className="text-[10.5px] text-slate-400">
                      +{countText(day.awayTotal - 2)} คน
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            อนุมัติแล้ว
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            รออนุมัติ (ตัวเอียง)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            คนไม่อยู่ตั้งแต่ครึ่งทีมขึ้นไป
          </span>
        </div>
      </Section>

      {selectedDay ? (
        <Section
          title={`วันที่ ${dayNumber(selectedDay.date)} ${monthLabel(month)}`}
          description={
            selectedDay.isHoliday
              ? `วันหยุด: ${selectedDay.holidayName}`
              : `คนไม่อยู่ ${countText(selectedDay.awayTotal)} จาก ${countText(teamTotal)} คน`
          }
        >
          {selectedDay.awayTotal === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">
              วันนี้ลูกทีมอยู่ครบทุกคน
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {selectedDay.leaves.map((leave) => (
                <div
                  key={`leave-${leave.employeeId}`}
                  className="rounded-lg border border-slate-200 border-l-2 border-l-brand-300 px-3 py-2"
                >
                  <p className="break-words text-[13px] font-semibold text-slate-900">
                    {leave.name}
                  </p>
                  <p className="truncate text-[11.5px] text-slate-500">
                    {leave.leaveType ?? "ลา"} ·{" "}
                    {leave.status === "APPROVED" ? "อนุมัติแล้ว" : "รออนุมัติ"}
                  </p>
                </div>
              ))}

              {selectedDay.offsites.map((offsite) => (
                <div
                  key={`offsite-${offsite.employeeId}`}
                  className="rounded-lg border border-slate-200 border-l-2 border-l-slate-400 px-3 py-2"
                >
                  <p className="break-words text-[13px] font-semibold text-slate-900">
                    {offsite.name}
                  </p>
                  <p className="truncate text-[11.5px] text-slate-500">
                    นอกสถานที่ · {offsite.locationName ?? "ไม่ระบุสถานที่"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>
      ) : null}
    </>
  );
}
