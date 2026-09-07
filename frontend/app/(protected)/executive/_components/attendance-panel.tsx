"use client";

import { useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";

import { TimeDisplay } from "@/components/common/date-display";
import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Section,
  Select,
  StatTile,
  formatMoney,
  joinClassName,
  type Tone,
} from "@/components/kit";
import {
  getExecutiveAttendanceToday,
  getExecutiveInsights,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type {
  ExecutiveAttendanceRow,
  ExecutiveAttendanceTodayResponse,
  ExecutiveInsightsResponse,
} from "@/types/dashboard";

import { BarList, SegmentMeter, countText } from "@/components/common/insight-blocks";

/**
 * แท็บการเข้างานพนักงาน
 * ---------------------
 * เปิดมาต้องเห็นทันทีว่า "วันนี้ใครมา ใครลา ใครสาย ใครยังไม่มา" เป็นรายคน
 * ไม่ใช่แค่ยอดรวม แล้วกรองดูเฉพาะแผนก/สาขา/สถานะที่สนใจได้
 *
 * ด้านล่างเป็นตัวชี้วัดของทั้งเดือน (ขาดงาน สาย เงินที่ถูกหัก) เทียบเดือนก่อน
 * เพื่อบอกว่าภาพรวมกำลังดีขึ้นหรือแย่ลง ไม่ได้ดูแค่วันนี้วันเดียว
 */

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0";

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[11.5px]";

const STATUS_META: Record<
  ExecutiveAttendanceRow["status"],
  { label: string; tone: Tone; color: string; edge: string }
> = {
  PRESENT: {
    label: "มาทำงาน",
    tone: "positive",
    color: "#10b981",
    edge: "border-l-emerald-500",
  },
  LEAVE: {
    label: "ลา",
    tone: "brand",
    color: "#2563eb",
    edge: "border-l-brand-500",
  },
  ABSENT: {
    label: "ยังไม่มา",
    tone: "critical",
    color: "#ef4444",
    edge: "border-l-rose-500",
  },
};

const STATUS_FILTERS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "ABSENT", label: "ยังไม่มา" },
  { value: "LATE", label: "มาสาย" },
  { value: "MISSING", label: "ลงเวลาไม่ครบ" },
  { value: "LEAVE", label: "ลา" },
  { value: "PRESENT", label: "มาทำงาน" },
];

function percentText(value: number) {
  return `${Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  })}%`;
}

function deltaHelper(current: number, previous: number, unit: string, digits = 1) {
  const diff = Number((current - previous).toFixed(digits));

  if (!previous && !current) return "ยังไม่มีข้อมูลเทียบ";
  if (diff === 0) return "เท่าเดือนก่อน";

  const arrow = diff > 0 ? "เพิ่มขึ้น" : "ลดลง";
  const amount = Math.abs(diff).toLocaleString("th-TH", {
    maximumFractionDigits: digits,
  });

  return `${arrow} ${amount} ${unit} จากเดือนก่อน`;
}

function deltaTone(current: number, previous: number) {
  if (current === previous) return "neutral" as const;
  return current > previous ? ("warning" as const) : ("positive" as const);
}

export function AttendancePanel() {
  const [departmentId, setDepartmentId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("");

  const params = {
    departmentId: departmentId || undefined,
    branchId: branchId || undefined,
    status: status || undefined,
  };

  const query = useApiQuery<ExecutiveAttendanceTodayResponse>(
    queryKeys.executive.attendanceToday(params),
    () => getExecutiveAttendanceToday(params),
  );

  const insightQuery = useApiQuery<ExecutiveInsightsResponse>(
    queryKeys.executive.overview(),
    () => getExecutiveInsights(),
  );

  const data = query.data ?? null;
  const summary = data?.summary;
  const discipline = insightQuery.data?.discipline ?? null;

  /*
   * แถบนี้ต้องรวมกันได้ครบทุกคนพอดี คนที่มาสายจึงอยู่ในถัง "มาทำงาน"
   * แล้วแยกบอกจำนวนสายไว้ที่ตัวเลขด้านบนแทน
   */
  const onTime = Math.max(0, (summary?.present ?? 0) - (summary?.late ?? 0));

  const segments = [
    {
      key: "ontime",
      label: "มาตรงเวลา",
      value: onTime,
      color: STATUS_META.PRESENT.color,
    },
    {
      key: "late",
      label: "มาสาย",
      value: summary?.late ?? 0,
      color: "#f59e0b",
    },
    {
      key: "leave",
      label: "ลา",
      value: summary?.leave ?? 0,
      color: STATUS_META.LEAVE.color,
    },
    {
      key: "absent",
      label: "ยังไม่มา",
      value: summary?.absent ?? 0,
      color: STATUS_META.ABSENT.color,
    },
  ];

  if (query.isPending) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <LoadingState
          title="กำลังโหลดการเข้างานวันนี้"
          description="ระบบกำลังรวมเวลาเข้า-ออกและใบลาของพนักงานทุกคน"
        />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <ErrorState
          title="โหลดการเข้างานไม่สำเร็จ"
          description={getErrorMessage(query.error, "ลองใหม่อีกครั้ง")}
          action={
            <Button variant="primary" onClick={() => void query.refetch()}>
              ลองใหม่
            </Button>
          }
        />
      </div>
    );
  }

  const attendanceRate = summary?.total
    ? (summary.present / summary.total) * 100
    : 0;

  return (
    <>
      <section className="border-b border-slate-200 px-5 py-4 3xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL_CLASS}>การเข้างานวันนี้</p>
            <p className="mt-1 text-[13px] text-slate-500 3xl:text-[14px]">
              {data?.workDate
                ? new Date(data.workDate).toLocaleDateString("th-TH", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "-"}{" "}
              · พนักงานที่ต้องมาทำงาน {countText(summary?.total ?? 0)} คน
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              icon={
                <RefreshCw
                  className={joinClassName(
                    "h-3.5 w-3.5",
                    query.isFetching && "animate-spin",
                  )}
                />
              }
            >
              โหลดข้อมูลใหม่
            </Button>
            <ButtonLink
              href="/attendance"
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              ตรวจเวลาทำงาน
            </ButtonLink>
          </div>
        </div>

        <div className={joinClassName("mt-3", TILE_BOX)}>
          <StatTile
            label="อัตราการมาทำงานวันนี้"
            value={percentText(attendanceRate)}
            tone={attendanceRate >= 90 ? "positive" : "warning"}
            helper={`มาแล้ว ${countText(summary?.present ?? 0)} จาก ${countText(summary?.total ?? 0)} คน`}
          />
          <StatTile
            label="มาทำงานแล้ว"
            value={countText(summary?.present ?? 0)}
            tone={(summary?.late ?? 0) > 0 ? "warning" : "positive"}
            helper={`ในนั้นมาสาย ${countText(summary?.late ?? 0)} · ลงเวลาไม่ครบ ${countText(summary?.missing ?? 0)}`}
          />
          <StatTile
            label="ลาวันนี้"
            value={countText(summary?.leave ?? 0)}
            helper="ใบลาที่อนุมัติแล้วและคร่อมวันนี้"
          />
          <StatTile
            label="ยังไม่มา"
            value={countText(summary?.absent ?? 0)}
            tone={(summary?.absent ?? 0) > 0 ? "warning" : "positive"}
            helper="ไม่มีทั้งเวลาเข้าและใบลา"
          />
        </div>

        <div className="mt-4">
          <SegmentMeter
            segments={segments}
            unit="คน"
            emptyText="ยังไม่มีข้อมูลการลงเวลาของวันนี้"
          />
        </div>
      </section>

      <Section
        title="รายชื่อพนักงานวันนี้"
        description={`แสดง ${countText((data?.rows ?? []).length)} คน · เรียงคนที่ต้องตามก่อน — ยังไม่มา · มาสาย · ลา · มาทำงาน`}
        actions={
          <>
            <span className="block w-44 shrink-0">
              <Select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                className="border-slate-300 bg-white shadow-none"
                aria-label="แผนก"
              >
                <option value="">ทุกแผนก</option>
                {(data?.filterOptions.departments ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </span>

            <span className="block w-40 shrink-0">
              <Select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="border-slate-300 bg-white shadow-none"
                aria-label="สาขา"
              >
                <option value="">ทุกสาขา</option>
                {(data?.filterOptions.branches ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </span>

            <span className="block w-36 shrink-0">
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="border-slate-300 bg-white shadow-none"
                aria-label="สถานะ"
              >
                {STATUS_FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </span>
          </>
        }
      >
        {(data?.rows ?? []).length === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-400">
            ไม่มีพนักงานตามเงื่อนไขที่เลือก — ลองเปลี่ยนแผนก สาขา หรือสถานะ
          </p>
        ) : (
          <div className="max-h-[34rem] overflow-y-auto pr-1 3xl:max-h-[40rem]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
              {(data?.rows ?? []).map((row) => {
                const meta = STATUS_META[row.status];

                return (
                  <div
                    key={row.id}
                    className={joinClassName(
                      "min-w-0 rounded-lg border border-l-2 border-slate-200 px-4 py-3",
                      row.late ? "border-l-amber-500" : meta.edge,
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={row.name} size="sm" tone="soft" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                            {row.name}
                          </p>
                          <p className="truncate text-[11.5px] text-slate-400 3xl:text-[12.5px]">
                            {row.employeeCode}
                          </p>
                        </div>
                      </div>

                      <Badge tone={meta.tone}>
                        {row.status === "LEAVE" && row.leaveType
                          ? row.leaveType
                          : meta.label}
                      </Badge>
                    </div>

                    <p className="mt-2.5 truncate text-[12px] text-slate-500 3xl:text-[13px]">
                      {row.department ?? "ไม่ระบุแผนก"} ·{" "}
                      {row.branch ?? "ไม่ระบุสาขา"}
                    </p>

                    {/* เวลาตามกะที่ตั้งไว้: เข้าเช้า / เข้าบ่าย / ออกงาน */}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[12px] 3xl:text-[13px]">
                      <TimeCell label="เข้าเช้า" value={row.morningInAt} />
                      <TimeCell label="เข้าบ่าย" value={row.afternoonInAt} />
                      <TimeCell label="ออกงาน" value={row.checkOutAt} />
                    </div>

                    {row.late || row.hasMissingLog ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {row.late ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            {row.lateMinutes
                              ? `สาย ${countText(row.lateMinutes)} นาที`
                              : "มาสาย"}
                          </span>
                        ) : null}
                        {row.hasMissingLog ? (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                            ลงเวลาไม่ครบ
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      <div className="grid border-b border-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
        <Section
          title="แยกตามแผนกวันนี้"
          description="แผนกที่มีคนยังไม่มาหรือมาสายมากที่สุดขึ้นก่อน"
          className="lg:border-b-0"
        >
          <BarList
            rows={(data?.byDepartment ?? []).map((item) => ({
              key: item.id ?? item.label,
              label: item.label,
              value: item.absent + item.late,
              note: `ยังไม่มา ${countText(item.absent)} · สาย ${countText(item.late)} · จาก ${countText(item.total)} คน`,
              color: item.absent + item.late > 0 ? "#ef4444" : "#10b981",
            }))}
            unit="คนต้องตาม"
            emptyText="ยังไม่มีข้อมูลรายแผนก"
            showPercent={false}
          />
        </Section>

        <Section
          title="วินัยการมาทำงานเดือนนี้"
          description="ตัวเลขทั้งเดือนเทียบกับเดือนก่อน ใช้ดูว่าดีขึ้นหรือแย่ลง"
        >
          <div className="divide-y divide-slate-100">
            <MetricLine
              label="อัตราขาดงาน"
              value={percentText(discipline?.absenceRate ?? 0)}
              helper={deltaHelper(
                discipline?.absenceRate ?? 0,
                discipline?.absenceRatePrev ?? 0,
                "จุด",
                2,
              )}
              tone={deltaTone(
                discipline?.absenceRate ?? 0,
                discipline?.absenceRatePrev ?? 0,
              )}
            />
            <MetricLine
              label="นาทีสายเฉลี่ยต่อคน"
              value={`${discipline?.lateMinutesPerHead ?? 0} นาที`}
              helper={deltaHelper(
                discipline?.lateMinutesPerHead ?? 0,
                discipline?.lateMinutesPerHeadPrev ?? 0,
                "นาที",
              )}
              tone={deltaTone(
                discipline?.lateMinutesPerHead ?? 0,
                discipline?.lateMinutesPerHeadPrev ?? 0,
              )}
            />
            <MetricLine
              label="วันลาเฉลี่ยต่อคน"
              value={`${discipline?.leaveDaysPerHead ?? 0} วัน`}
              helper={deltaHelper(
                discipline?.leaveDaysPerHead ?? 0,
                discipline?.leaveDaysPerHeadPrev ?? 0,
                "วัน",
              )}
              tone="neutral"
            />
            <MetricLine
              label="เงินที่หักจากมาสาย/ขาดงาน"
              value={`${formatMoney(discipline?.penaltyAmount ?? 0)} บาท`}
              helper={`เดือนก่อน ${formatMoney(discipline?.penaltyAmountPrev ?? 0)} บาท`}
              tone={deltaTone(
                discipline?.penaltyAmount ?? 0,
                discipline?.penaltyAmountPrev ?? 0,
              )}
            />
          </div>
        </Section>
      </div>
    </>
  );
}

/** ช่องเวลาหนึ่งช่วง — ว่างให้จางไว้ จะได้เห็นว่าช่วงไหนยังไม่ลง */
function TimeCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10.5px] text-slate-400">{label}</p>
      {value ? (
        <TimeDisplay
          value={value}
          className="text-[12.5px] font-semibold text-slate-800 3xl:text-[13.5px]"
        />
      ) : (
        <p className="text-[12.5px] font-semibold text-slate-300 3xl:text-[13.5px]">
          -
        </p>
      )}
    </div>
  );
}

function MetricLine({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "neutral" | "warning" | "positive";
}) {
  const valueClass = {
    neutral: "text-slate-950",
    warning: "text-amber-600",
    positive: "text-emerald-600",
  }[tone];

  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
          {label}
        </p>
        <p className="truncate text-[11.5px] text-slate-400 3xl:text-[12.5px]">
          {helper}
        </p>
      </div>
      <p
        className={`shrink-0 text-[15px] font-bold tabular-nums 3xl:text-[16px] ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}
