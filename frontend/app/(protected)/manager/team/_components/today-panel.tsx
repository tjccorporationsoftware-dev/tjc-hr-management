"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock3, RefreshCw } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { SegmentMeter, countText } from "@/components/common/insight-blocks";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  Avatar,
  Badge,
  Button,
  CellStack,
  DataTable,
  Notice,
  Section,
  StatTile,
  joinClassName,
  type Column,
} from "@/components/kit";
import { getEmployeeName } from "@/components/ui/employee-name";
import {
  getManagerAttendance,
  getManagerTeamSummary,
  getPublicFileUrl,
} from "@/lib/api";
import { formatThaiTime } from "@/lib/date-format";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { AttendanceLog } from "@/types/attendance";
import type {
  ManagerTeamMemberSummary,
  ManagerTodayStatus,
} from "@/types/manager";

import { STATUS_META, TILE_BOX, balanceOf } from "./shared";

/**
 * แท็บ "วันนี้"
 * ------------
 * ใช้ตอบคำถามของเช้าวันนั้น: ทีมมากันครบไหม ใครต้องโทรตาม ใครสาย ใครลา
 *
 * จุดที่ต่างจากของเดิม — ผูกกับ "กะของแต่ละคน" แล้ว ไม่เหมาว่าคนที่ยังไม่ลงเวลา
 * คือคนผิด: ถ้ายังไม่ถึงเวลาเข้างานตามกะจะขึ้นว่า "ยังไม่ถึงเวลา" (เทา)
 * เลยเวลาแล้วถึงจะขึ้น "เลยเวลาเข้างาน" (เหลือง) พร้อมบอกเวลาที่ต้องเข้า
 *
 * ด้านล่างเป็นรายการลงเวลาดิบของวันเดียวกัน ไว้ตรวจตอนมีข้อโต้แย้งเรื่องเวลา
 */

const SEGMENT_ORDER: ManagerTodayStatus[] = [
  "PRESENT",
  "LATE",
  "LEAVE",
  "OFFSITE",
  "NOT_CHECKED_IN",
  "ABSENT",
];

const LOG_TYPE_LABEL: Record<string, string> = {
  CHECK_IN: "เข้างาน",
  CHECK_OUT: "ออกงาน",
  BREAK_START: "เริ่มพัก",
  BREAK_END: "กลับจากพัก",
};

const CHANNEL_LABEL: Record<string, string> = {
  WEB: "เว็บไซต์",
  MOBILE: "แอปมือถือ",
  SCANNER: "เครื่องสแกน",
  IMPORT: "นำเข้าไฟล์",
  MANUAL: "เจ้าหน้าที่บันทึก",
};

function todayInputValue() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

function TimeCell({
  label,
  value,
  expected,
}: {
  label: string;
  value: string | null;
  expected?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10.5px] text-slate-400">
        {label}
        {expected ? ` · ${expected}` : ""}
      </p>
      <p
        className={joinClassName(
          "truncate tabular-nums",
          value ? "font-semibold text-slate-900" : "text-slate-300",
        )}
      >
        {value ? formatThaiTime(value) : "—"}
      </p>
    </div>
  );
}

/** ข้อความสถานะรายคน — แยก "ยังไม่ถึงเวลา" ออกจาก "เลยเวลาแล้ว" */
function todayLabel(member: ManagerTeamMemberSummary) {
  if (member.today.status !== "NOT_CHECKED_IN") {
    return STATUS_META[member.today.status].label;
  }

  return member.today.isOverdue ? "เลยเวลาเข้างาน" : "ยังไม่ถึงเวลา";
}

export function TodayPanel() {
  const [date, setDate] = useState(todayInputValue);
  const [statusFilter, setStatusFilter] = useState<ManagerTodayStatus | "ALL">(
    "ALL",
  );

  const summaryParams = useMemo(() => ({ date }), [date]);

  const summaryQuery = useApiQuery(
    queryKeys.manager.section("team-summary", summaryParams),
    () => getManagerTeamSummary(summaryParams),
  );

  const logParams = useMemo(
    () => ({ page: 1, pageSize: 200, dateFrom: date, dateTo: date }),
    [date],
  );

  const logQuery = useApiQuery(
    queryKeys.manager.section("attendance-log", logParams),
    () => getManagerAttendance(logParams),
  );

  const data = summaryQuery.data ?? null;
  const today = data?.today ?? null;
  const teamTotal = today?.teamTotal ?? 0;

  const members = useMemo(() => {
    const rows = [...(data?.members ?? [])];

    return rows.sort((left, right) => {
      const gap =
        STATUS_META[left.today.status].order -
        STATUS_META[right.today.status].order;

      if (gap !== 0) return gap;

      return getEmployeeName(left.employee).localeCompare(
        getEmployeeName(right.employee),
        "th",
      );
    });
  }, [data?.members]);

  const visibleMembers = useMemo(
    () =>
      statusFilter === "ALL"
        ? members
        : members.filter((member) => member.today.status === statusFilter),
    [members, statusFilter],
  );

  const segments = SEGMENT_ORDER.map((status) => ({
    key: status,
    label: STATUS_META[status].label,
    value: today?.[status] ?? 0,
    color: STATUS_META[status].color,
  })).filter((segment) => segment.value > 0);

  const presentTotal = (today?.PRESENT ?? 0) + (today?.LATE ?? 0);
  const attendanceRate =
    teamTotal > 0 ? Math.round((presentTotal / teamTotal) * 100) : 0;
  const overdueTotal = members.filter((member) => member.today.isOverdue).length;
  const pendingTotal = members.reduce(
    (sum, member) => sum + member.pendingRequests,
    0,
  );

  const logColumns = useMemo<Column<AttendanceLog>[]>(
    () => [
      {
        key: "employee",
        header: "ลูกทีม",
        cell: (row) => (
          <CellStack
            primary={getEmployeeName(row.employee)}
            secondary={row.employee?.employeeCode || "-"}
          />
        ),
      },
      {
        key: "time",
        header: "เวลา",
        cell: (row) => (
          <span className="font-semibold tabular-nums text-slate-900">
            {formatThaiTime(row.logTime)}
          </span>
        ),
      },
      {
        key: "type",
        header: "รายการ",
        cell: (row) => (
          <span className="text-slate-600">
            {LOG_TYPE_LABEL[row.logType] ?? row.logType}
          </span>
        ),
      },
      {
        key: "channel",
        header: "ช่องทาง",
        hideBelow: "lg",
        cell: (row) => (
          <span className="text-slate-600">
            {CHANNEL_LABEL[row.channel] ?? row.channel}
          </span>
        ),
      },
      {
        key: "note",
        header: "หมายเหตุ",
        hideBelow: "xl",
        cell: (row) => (
          <span className="text-slate-500">{row.note || "-"}</span>
        ),
      },
    ],
    [],
  );

  if (summaryQuery.isPending) {
    return (
      <div className="px-5 py-6 3xl:px-6">
        <LoadingState title="กำลังโหลดสถานะของทีม" />
      </div>
    );
  }

  if (summaryQuery.isError) {
    return (
      <div className="px-5 py-6 3xl:px-6">
        <ErrorState
          title="โหลดสถานะของทีมไม่สำเร็จ"
          description={getErrorMessage(summaryQuery.error)}
          action={
            <Button
              onClick={() => void summaryQuery.refetch()}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              ลองใหม่
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <section className="border-b border-slate-200 px-5 py-5 sm:px-6 3xl:px-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              การเข้างานของทีม
            </p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-slate-950 3xl:text-[18px]">
              ลูกทีม {countText(teamTotal)} คน
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="block w-44 shrink-0">
              <ThaiDateInput
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-label="วันที่"
              />
            </span>
            <Button
              onClick={() => {
                void summaryQuery.refetch();
                void logQuery.refetch();
              }}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              รีเฟรช
            </Button>
          </div>
        </div>

        {data?.holiday ? (
          <div className="mt-3">
            <Notice tone="info" icon={<CalendarDays className="h-4 w-4" />}>
              วันนี้เป็นวันหยุด: {data.holiday.name} — ทีมไม่ต้องลงเวลา
            </Notice>
          </div>
        ) : null}

        <div className={joinClassName("mt-3", TILE_BOX)}>
          <StatTile
            label="มาทำงานแล้ว"
            value={`${countText(presentTotal)} / ${countText(teamTotal)}`}
            tone={attendanceRate >= 90 ? "positive" : "neutral"}
            helper={`คิดเป็น ${countText(attendanceRate)}% ของทีม`}
          />
          <StatTile
            label="มาสายวันนี้"
            value={countText(today?.LATE ?? 0)}
            tone={(today?.LATE ?? 0) > 0 ? "warning" : "neutral"}
            helper="เข้างานช้ากว่ากะที่กำหนด"
          />
          <StatTile
            label="ต้องโทรตาม"
            value={countText(overdueTotal)}
            tone={overdueTotal > 0 ? "warning" : "neutral"}
            helper="เลยเวลาเข้างานแล้วยังไม่ลงเวลา"
          />
          <StatTile
            label="ลา / นอกสถานที่"
            value={`${countText(today?.LEAVE ?? 0)} / ${countText(today?.OFFSITE ?? 0)}`}
            helper="อนุมัติแล้วและมีผลวันนี้"
          />
        </div>

        <div className="mt-4">
          <SegmentMeter
            segments={segments}
            unit="คน"
            emptyText="ยังไม่มีข้อมูลการลงเวลาของวันที่เลือก"
          />
        </div>
      </section>

      {pendingTotal > 0 ? (
        <div className="border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
          <Notice tone="warning" icon={<Clock3 className="h-4 w-4" />}>
            มีคำขอของลูกทีมรอคุณอนุมัติ {countText(pendingTotal)} รายการ{" "}
            <Link
              href="/manager/requests?tab=queue"
              className="font-semibold underline underline-offset-2"
            >
              ไปกดอนุมัติ
            </Link>
          </Notice>
        </div>
      ) : null}

      <Section
        title="ลูกทีมรายคน"
        description={`แสดง ${countText(visibleMembers.length)} คน · เรียงคนที่ต้องตามก่อน`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {(["ALL", ...SEGMENT_ORDER] as Array<ManagerTodayStatus | "ALL">)
              .filter((key) => key === "ALL" || (today?.[key] ?? 0) > 0)
              .map((key) => {
                const active = statusFilter === key;
                const label = key === "ALL" ? "ทั้งหมด" : STATUS_META[key].label;
                const value = key === "ALL" ? teamTotal : (today?.[key] ?? 0);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(active ? "ALL" : key)}
                    className={joinClassName(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition",
                      active
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                    )}
                  >
                    {key !== "ALL" ? (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: STATUS_META[key].color }}
                      />
                    ) : null}
                    {label}
                    <span
                      className={joinClassName(
                        "tabular-nums",
                        active ? "text-white/80" : "text-slate-400",
                      )}
                    >
                      {countText(value)}
                    </span>
                  </button>
                );
              })}
          </div>
        }
      >
        {visibleMembers.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-400">
            {teamTotal === 0
              ? "ยังไม่มีลูกทีมในสายบังคับบัญชาของคุณ — ให้ HR กำหนดหัวหน้างานให้พนักงานก่อน"
              : "ไม่มีคนในกลุ่มที่เลือก ลองกดปุ่ม ทั้งหมด"}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
            {visibleMembers.map((member) => {
              const meta = STATUS_META[member.today.status];
              const overdue = member.today.isOverdue;
              const annual = balanceOf(member, "พักร้อน");

              return (
                <div
                  key={member.employee.id}
                  className={joinClassName(
                    "min-w-0 rounded-lg border border-l-2 border-slate-200 px-4 py-3",
                    overdue ? "border-l-amber-500" : meta.edge,
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar
                        name={getEmployeeName(member.employee)}
                        src={getPublicFileUrl(member.employee.user?.avatarUrl)}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="break-words text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                          {getEmployeeName(member.employee)}
                        </p>
                        <p className="break-words text-[11.5px] text-slate-400 3xl:text-[12.5px]">
                          {member.shift?.name ||
                            member.employee.positionMaster?.nameTh ||
                            member.employee.employeeCode}
                        </p>
                      </div>
                    </div>

                    <Badge tone={overdue ? "warning" : meta.tone}>
                      {todayLabel(member)}
                    </Badge>
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2 text-[12px] 3xl:text-[13px]">
                    <TimeCell
                      label="เข้าเช้า"
                      value={member.today.morningInAt}
                      expected={member.shift?.morningDeadline}
                    />
                    <TimeCell
                      label="เข้าบ่าย"
                      value={member.today.afternoonInAt}
                      expected={member.shift?.afternoonDeadline}
                    />
                    <TimeCell
                      label="ออกงาน"
                      value={member.today.checkOutAt}
                      expected={member.shift?.checkoutFrom}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {member.today.lateMinutes > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        สาย {countText(member.today.lateMinutes)} นาที
                      </span>
                    ) : null}
                    {member.today.hasMissingLog &&
                    member.today.status !== "NOT_CHECKED_IN" &&
                    member.today.status !== "HOLIDAY" ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                        ลงเวลาไม่ครบ
                      </span>
                    ) : null}
                    {member.pendingRequests > 0 ? (
                      <Link
                        href="/manager/requests?tab=queue"
                        className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        คำขอค้าง {countText(member.pendingRequests)}
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11.5px] text-slate-500 3xl:text-[12.5px]">
                    <span>
                      เดือนนี้ สาย{" "}
                      <span
                        className={joinClassName(
                          "font-semibold tabular-nums",
                          member.month.lateDays > 0
                            ? "text-amber-700"
                            : "text-slate-400",
                        )}
                      >
                        {countText(member.month.lateDays)}
                      </span>{" "}
                      วัน
                    </span>

                    <Link
                      href={`/employees/${member.employee.id}`}
                      className="shrink-0 font-semibold text-brand-700 hover:text-brand-800"
                    >
                      พักร้อนเหลือ {countText(annual?.remainingDays ?? 0)} วัน →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="รายการลงเวลาของวันที่เลือก"
        description="รายการดิบจากเครื่องสแกน/แอป ไว้ตรวจย้อนหลังเวลามีข้อโต้แย้งเรื่องเวลา"
        tight
      >
        <DataTable
          columns={logColumns}
          rows={logQuery.data?.items ?? []}
          rowKey={(row) => row.id}
          loading={logQuery.isPending}
          error={
            logQuery.isError
              ? getErrorMessage(logQuery.error, "โหลดรายการลงเวลาไม่สำเร็จ")
              : null
          }
          onRetry={() => void logQuery.refetch()}
          emptyTitle="ยังไม่มีการลงเวลาในวันนี้"
          emptyDescription="เมื่อลูกทีมลงเวลาเข้า-ออก รายการจะขึ้นที่นี่"
        />
      </Section>
    </>
  );
}
