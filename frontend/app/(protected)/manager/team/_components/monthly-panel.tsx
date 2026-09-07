"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { BarList, countText } from "@/components/common/insight-blocks";
import {
  Button,
  CellStack,
  DataTable,
  Section,
  StatTile,
  joinClassName,
  type Column,
} from "@/components/kit";
import { getEmployeeName } from "@/components/ui/employee-name";
import { getManagerTeamSummary } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { ManagerTeamMemberSummary } from "@/types/manager";

import { LABEL_CLASS, TILE_BOX, diffText } from "./shared";

/**
 * แท็บ "สรุปรายเดือน"
 * -------------------
 * ตัวเลขสะสมของเดือน เทียบกับเดือนก่อนหน้าเสมอ — ตัวเลขนิ่ง ๆ บอกไม่ได้ว่า
 * ทีมกำลังดีขึ้นหรือแย่ลง หัวหน้าต้องใช้ทั้งสองอย่างตอนคุยกับลูกทีมและตอนรีวิว
 *
 * ค่าหักเงิน (สาย/ขาด/ลงเวลาไม่ครบ) เอามาแสดงด้วย เพราะเป็นภาษาที่คุยกับ
 * ลูกทีมได้ตรงที่สุด และเป็นตัวเลขเดียวกับที่ payroll จะใช้ตอนปิดรอบ
 */

function monthKeyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, step: number) {
  const [year, month] = monthKey.split("-").map(Number);

  return monthKeyOf(new Date(year, (month ?? 1) - 1 + step, 1));
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return new Date(year, (month ?? 1) - 1, 1).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });
}

function moneyText(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** ตัวเลข + ลูกศรเทียบเดือนก่อน (น้อยลง = ดีขึ้น = เขียว) */
function TrendValue({
  value,
  previous,
  unit,
}: {
  value: number;
  previous: number;
  unit: string;
}) {
  const diff = diffText(value, previous);

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={joinClassName(
          "tabular-nums",
          value > 0 ? "font-semibold text-slate-900" : "text-slate-300",
        )}
      >
        {countText(value)}
        {unit ? ` ${unit}` : ""}
      </span>

      {diff ? (
        <span
          className={joinClassName(
            "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
            diff.improved ? "text-emerald-600" : "text-rose-600",
          )}
          title={`เดือนก่อน ${countText(previous)}`}
        >
          {diff.improved ? (
            <TrendingDown className="h-3 w-3" />
          ) : (
            <TrendingUp className="h-3 w-3" />
          )}
          {diff.text}
        </span>
      ) : null}
    </span>
  );
}

export function MonthlyPanel() {
  const [month, setMonth] = useState(() => monthKeyOf(new Date()));

  const params = useMemo(() => ({ month }), [month]);

  const query = useApiQuery(
    queryKeys.manager.section("team-summary-month", params),
    () => getManagerTeamSummary(params),
  );

  const data = query.data ?? null;
  const monthTotals = data?.monthTotals ?? null;
  const members = useMemo(() => data?.members ?? [], [data?.members]);

  const previousTotals = useMemo(
    () =>
      members.reduce(
        (acc, member) => ({
          lateDays: acc.lateDays + member.previousMonth.lateDays,
          lateMinutes: acc.lateMinutes + member.previousMonth.lateMinutes,
          absentDays: acc.absentDays + member.previousMonth.absentDays,
          missingDays: acc.missingDays + member.previousMonth.missingDays,
          otHours:
            Math.round((acc.otHours + member.previousMonth.otHours) * 10) / 10,
        }),
        {
          lateDays: 0,
          lateMinutes: 0,
          absentDays: 0,
          missingDays: 0,
          otHours: 0,
        },
      ),
    [members],
  );

  const deductionTotal = members.reduce(
    (sum, member) => sum + member.month.deductionAmount,
    0,
  );

  const columns = useMemo<Column<ManagerTeamMemberSummary>[]>(
    () => [
      {
        key: "employee",
        header: "ลูกทีม",
        cell: (row) => (
          <CellStack
            primary={getEmployeeName(row.employee)}
            secondary={
              row.employee.positionMaster?.nameTh ||
              row.employee.position ||
              row.employee.employeeCode
            }
          />
        ),
      },
      {
        key: "worked",
        header: "วันที่มีข้อมูล",
        align: "right",
        hideBelow: "lg",
        cell: (row) => (
          <CellStack
            primary={
              <span className="font-normal tabular-nums text-slate-600">
                {countText(row.month.recordedDays)} วัน
              </span>
            }
            secondary={`มาแล้ว ${countText(row.month.presentDays)} วัน`}
          />
        ),
      },
      {
        key: "late",
        header: "มาสาย",
        align: "right",
        cell: (row) => (
          <CellStack
            primary={
              <TrendValue
                value={row.month.lateDays}
                previous={row.previousMonth.lateDays}
                unit="วัน"
              />
            }
            secondary={
              row.month.lateMinutes > 0
                ? `รวม ${countText(row.month.lateMinutes)} นาที`
                : undefined
            }
          />
        ),
      },
      {
        key: "absent",
        header: "ขาดงาน",
        align: "right",
        cell: (row) => (
          <TrendValue
            value={row.month.absentDays}
            previous={row.previousMonth.absentDays}
            unit="วัน"
          />
        ),
      },
      {
        key: "missing",
        header: "ลงเวลาไม่ครบ",
        align: "right",
        hideBelow: "lg",
        cell: (row) => (
          <TrendValue
            value={row.month.missingDays}
            previous={row.previousMonth.missingDays}
            unit="วัน"
          />
        ),
      },
      {
        key: "leave",
        header: "ลา",
        align: "right",
        hideBelow: "xl",
        cell: (row) => (
          <span
            className={joinClassName(
              "tabular-nums",
              row.month.leaveDays > 0 ? "text-slate-700" : "text-slate-300",
            )}
          >
            {countText(row.month.leaveDays)} วัน
          </span>
        ),
      },
      {
        key: "ot",
        header: "OT",
        align: "right",
        cell: (row) => (
          <TrendValue
            value={row.month.otHours}
            previous={row.previousMonth.otHours}
            unit="ชม."
          />
        ),
      },
      {
        key: "deduction",
        header: "ค่าหัก",
        align: "right",
        cell: (row) => (
          <span
            className={joinClassName(
              "tabular-nums",
              row.month.deductionAmount > 0
                ? "font-semibold text-rose-600"
                : "text-slate-300",
            )}
          >
            {row.month.deductionAmount > 0
              ? `${moneyText(row.month.deductionAmount)} ฿`
              : "0"}
          </span>
        ),
      },
      {
        key: "action",
        header: "",
        align: "right",
        cell: (row) => (
          <Link
            href={`/employees/${row.employee.id}`}
            className="text-[13px] font-semibold text-brand-700 hover:text-brand-800"
          >
            ดูข้อมูล
          </Link>
        ),
      },
    ],
    [],
  );

  const lateRanking = useMemo(
    () =>
      members
        .filter((member) => member.month.lateMinutes > 0)
        .sort((left, right) => right.month.lateMinutes - left.month.lateMinutes)
        .slice(0, 8)
        .map((member) => ({
          key: member.employee.id,
          label: getEmployeeName(member.employee),
          value: member.month.lateMinutes,
          note: `${countText(member.month.lateDays)} วัน`,
        })),
    [members],
  );

  const otRanking = useMemo(
    () =>
      members
        .filter((member) => member.month.otHours > 0)
        .sort((left, right) => right.month.otHours - left.month.otHours)
        .slice(0, 8)
        .map((member) => ({
          key: member.employee.id,
          label: getEmployeeName(member.employee),
          value: member.month.otHours,
        })),
    [members],
  );

  if (query.isPending) {
    return (
      <div className="px-5 py-6 3xl:px-6">
        <LoadingState title="กำลังโหลดสรุปรายเดือน" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-5 py-6 3xl:px-6">
        <ErrorState
          title="โหลดสรุปรายเดือนไม่สำเร็จ"
          description={getErrorMessage(query.error)}
          action={<Button onClick={() => void query.refetch()}>ลองใหม่</Button>}
        />
      </div>
    );
  }

  return (
    <>
      <section className="border-b border-slate-200 px-5 py-5 sm:px-6 3xl:px-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={LABEL_CLASS}>สรุปเวลาทำงานของทีม</p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-slate-950 3xl:text-[18px]">
              {monthLabel(month)}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              onClick={() => setMonth(shiftMonth(month, -1))}
              icon={<ChevronLeft className="h-4 w-4" />}
            >
              เดือนก่อน
            </Button>
            <Button onClick={() => setMonth(monthKeyOf(new Date()))}>
              เดือนนี้
            </Button>
            <Button
              onClick={() => setMonth(shiftMonth(month, 1))}
              icon={<ChevronRight className="h-4 w-4" />}
            >
              เดือนหน้า
            </Button>
          </div>
        </div>

        <div className={joinClassName("mt-3", TILE_BOX)}>
          <StatTile
            label="อัตราเข้างานของทีม"
            value={`${countText(monthTotals?.attendanceRate ?? 0)}%`}
            tone={
              (monthTotals?.attendanceRate ?? 0) >= 90 ? "positive" : "neutral"
            }
            helper={`มาแล้ว ${countText(monthTotals?.presentDays ?? 0)} จาก ${countText(monthTotals?.recordedDays ?? 0)} วัน-คน`}
          />
          <StatTile
            label="มาสายรวม"
            value={`${countText(monthTotals?.lateDays ?? 0)} วัน`}
            tone={(monthTotals?.lateDays ?? 0) > 0 ? "warning" : "neutral"}
            helper={`เดือนก่อน ${countText(previousTotals.lateDays)} วัน · รวม ${countText(monthTotals?.lateMinutes ?? 0)} นาที`}
          />
          <StatTile
            label="ขาดงาน / ลงเวลาไม่ครบ"
            value={`${countText(monthTotals?.absentDays ?? 0)} / ${countText(monthTotals?.missingDays ?? 0)}`}
            tone={(monthTotals?.absentDays ?? 0) > 0 ? "warning" : "neutral"}
            helper={`เดือนก่อน ${countText(previousTotals.absentDays)} / ${countText(previousTotals.missingDays)}`}
          />
          <StatTile
            label="OT ที่อนุมัติ"
            value={`${countText(monthTotals?.otHours ?? 0)} ชม.`}
            helper={`เดือนก่อน ${countText(previousTotals.otHours)} ชม.`}
          />
        </div>

        {deductionTotal > 0 ? (
          <p className="mt-3 text-[12.5px] text-slate-500">
            ค่าหักจากเวลาทำงานของทีมเดือนนี้รวม{" "}
            <span className="font-semibold tabular-nums text-rose-600">
              {moneyText(deductionTotal)} บาท
            </span>{" "}
            — เป็นตัวเลขชุดเดียวกับที่ระบบเงินเดือนจะใช้ตอนปิดรอบ
          </p>
        ) : null}
      </section>

      <Section
        title="ตารางรายคน"
        description="ทุกคอลัมน์เทียบกับเดือนก่อนหน้า — ลูกศรลงสีเขียวคือดีขึ้น"
        tight
      >
        <DataTable
          columns={columns}
          rows={members}
          rowKey={(row) => row.employee.id}
          emptyTitle="ยังไม่มีข้อมูลของเดือนนี้"
          emptyDescription="เมื่อมีการลงเวลาในเดือนที่เลือก ตัวเลขจะขึ้นที่นี่"
        />
      </Section>

      <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
        <Section
          title="สายมากที่สุด"
          description="เรียงตามจำนวนนาทีที่สายสะสมทั้งเดือน"
          className="lg:border-b-0"
        >
          <BarList
            rows={lateRanking}
            unit="นาที"
            color="#f59e0b"
            emptyText="เดือนนี้ไม่มีลูกทีมมาสาย"
            showPercent={false}
          />
        </Section>

        <Section
          title="OT มากที่สุด"
          description="เฉพาะ OT ที่อนุมัติแล้ว ใช้คุมภาระงานและค่าใช้จ่าย"
          className="lg:border-b-0"
        >
          <BarList
            rows={otRanking}
            unit="ชม."
            emptyText="เดือนนี้ยังไม่มี OT ที่อนุมัติ"
            showPercent={false}
          />
        </Section>
      </div>
    </>
  );
}
