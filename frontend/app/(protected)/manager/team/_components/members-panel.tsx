"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { BarList, countText } from "@/components/common/insight-blocks";
import {
  Avatar,
  Badge,
  Button,
  CellStack,
  DataTable,
  SearchInput,
  Section,
  StatTile,
  Toolbar,
  joinClassName,
  type Column,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import { getEmployeeName } from "@/components/ui/employee-name";
import { getManagerTeamSummary, getPublicFileUrl } from "@/lib/api";
import { formatThaiDate } from "@/lib/date-format";
import { queryKeys } from "@/lib/query-keys";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { ManagerTeamMemberSummary } from "@/types/manager";

import { TILE_BOX, balanceOf } from "./shared";

/**
 * แท็บ "ลูกทีม"
 * ------------
 * ทะเบียนลูกทีมที่ตอบสองเรื่องที่หัวหน้าถามบ่อยที่สุดเวลาเปิดดูรายชื่อ
 *   1. จะติดต่อคนนี้ยังไง สังกัดไหน กะอะไร
 *   2. เขาเหลือวันลาเท่าไร (ตอบตอนมีคนเดินมาขอลากะทันหัน)
 *
 * รวมถึงคนที่ใกล้ครบทดลองงาน ซึ่งหัวหน้าเป็นคนประเมิน ถ้าไม่มีใครเตือน
 * พนักงานจะค้างสถานะทดลองงานไปเรื่อย ๆ
 */

const PROBATION_WARNING_DAYS = 45;

function daysUntil(value?: string | null) {
  if (!value) return null;

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();

  return Math.ceil(
    (new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
    ).getTime() -
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime()) /
      86_400_000,
  );
}

export function TeamMembersPanel() {
  const [search, setSearch] = useState("");

  const query = useApiQuery(
    queryKeys.manager.section("team-summary", {}),
    () => getManagerTeamSummary({}),
  );

  const members = useMemo(
    () => query.data?.members ?? [],
    [query.data?.members],
  );

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return members;

    return members.filter((member) =>
      [
        getEmployeeName(member.employee),
        member.employee.employeeCode,
        member.employee.email,
        member.employee.phone,
        member.employee.department?.nameTh,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(keyword)),
    );
  }, [members, search]);

  const probationDue = useMemo(
    () =>
      members
        .filter((member) => member.employee.status === "PROBATION")
        .map((member) => ({
          member,
          days: daysUntil(member.employee.probationEndDate),
        }))
        .filter((row) => row.days !== null && row.days <= PROBATION_WARNING_DAYS)
        .sort((left, right) => (left.days ?? 0) - (right.days ?? 0)),
    [members],
  );

  const annualLeaveRows = useMemo(
    () =>
      members
        .map((member) => {
          const annual = balanceOf(member, "พักร้อน");

          return {
            key: member.employee.id,
            label: getEmployeeName(member.employee),
            value: annual?.remainingDays ?? 0,
            note: `ใช้ไป ${countText(annual?.usedDays ?? 0)} จาก ${countText(annual?.entitlementDays ?? 0)} วัน`,
            color: (annual?.remainingDays ?? 0) <= 3 ? "#f59e0b" : undefined,
          };
        })
        .sort((left, right) => left.value - right.value),
    [members],
  );

  const columns = useMemo<Column<ManagerTeamMemberSummary>[]>(
    () => [
      {
        key: "employee",
        header: "ลูกทีม",
        cell: (row) => (
          <div className="flex items-center gap-3">
            <Avatar
              name={getEmployeeName(row.employee)}
              src={getPublicFileUrl(row.employee.user?.avatarUrl)}
              size="sm"
            />
            <CellStack
              primary={getEmployeeName(row.employee)}
              secondary={row.employee.employeeCode || "-"}
            />
          </div>
        ),
      },
      {
        key: "position",
        header: "ตำแหน่ง / สังกัด",
        cell: (row) => (
          <CellStack
            primary={
              row.employee.positionMaster?.nameTh || row.employee.position || "-"
            }
            secondary={
              [row.employee.department?.nameTh, row.employee.branch?.nameTh]
                .filter(Boolean)
                .join(" · ") || "-"
            }
          />
        ),
      },
      {
        key: "shift",
        header: "กะการทำงาน",
        hideBelow: "xl",
        cell: (row) =>
          row.shift ? (
            <CellStack
              primary={
                <span className="font-normal text-slate-600">
                  {row.shift.name}
                </span>
              }
              secondary={`เข้า ${row.shift.morningDeadline} · ออก ${row.shift.checkoutFrom}`}
            />
          ) : (
            <span className="text-slate-300">ใช้กะเริ่มต้น</span>
          ),
      },
      {
        key: "status",
        header: "สถานะ",
        cell: (row) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge
              vocabulary={EMPLOYEE_STATUS}
              status={row.employee.status}
            />
            {row.employee.status === "PROBATION" &&
            row.employee.probationEndDate ? (
              <span className="text-[11px] text-slate-400">
                ครบ {formatThaiDate(row.employee.probationEndDate)}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "leave",
        header: "วันลาคงเหลือ",
        align: "right",
        cell: (row) => {
          const annual = balanceOf(row, "พักร้อน");
          const sick = balanceOf(row, "ป่วย");
          const personal = balanceOf(row, "กิจ");

          return (
            <CellStack
              primary={
                <span
                  className={joinClassName(
                    "tabular-nums font-semibold",
                    (annual?.remainingDays ?? 0) <= 3
                      ? "text-amber-700"
                      : "text-slate-900",
                  )}
                >
                  พักร้อน {countText(annual?.remainingDays ?? 0)} วัน
                </span>
              }
              secondary={`ป่วย ${countText(sick?.remainingDays ?? 0)} · กิจ ${countText(personal?.remainingDays ?? 0)}`}
            />
          );
        },
      },
      {
        key: "contact",
        header: "ติดต่อ",
        hideBelow: "lg",
        cell: (row) => (
          <CellStack
            primary={
              <span className="font-normal text-slate-600">
                {row.employee.phone || "-"}
              </span>
            }
            secondary={row.employee.email || undefined}
          />
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

  if (query.isPending) {
    return (
      <div className="px-5 py-6 3xl:px-6">
        <LoadingState title="กำลังโหลดรายชื่อลูกทีม" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-5 py-6 3xl:px-6">
        <ErrorState
          title="โหลดรายชื่อลูกทีมไม่สำเร็จ"
          description={getErrorMessage(query.error)}
          action={<Button onClick={() => void query.refetch()}>ลองใหม่</Button>}
        />
      </div>
    );
  }

  const activeCount = members.filter(
    (member) => member.employee.status === "ACTIVE",
  ).length;
  const probationCount = members.filter(
    (member) => member.employee.status === "PROBATION",
  ).length;
  const lowLeaveCount = annualLeaveRows.filter((row) => row.value <= 3).length;

  return (
    <>
      <section className="border-b border-slate-200 px-5 py-5 sm:px-6 3xl:px-7">
        <div className={TILE_BOX}>
          <StatTile
            label="ลูกทีมทั้งหมด"
            value={countText(members.length)}
            helper="ในสายบังคับบัญชาของคุณ"
          />
          <StatTile
            label="ปฏิบัติงานปกติ"
            value={countText(activeCount)}
            tone="positive"
            helper="ไม่รวมทดลองงาน/พักงาน"
          />
          <StatTile
            label="อยู่ระหว่างทดลองงาน"
            value={countText(probationCount)}
            tone={probationDue.length > 0 ? "warning" : "neutral"}
            helper={`ใกล้ครบกำหนด ${countText(probationDue.length)} คน`}
          />
          <StatTile
            label="วันลาพักร้อนเหลือน้อย"
            value={countText(lowLeaveCount)}
            tone={lowLeaveCount > 0 ? "warning" : "neutral"}
            helper="เหลือไม่เกิน 3 วัน"
          />
        </div>
      </section>

      {probationDue.length > 0 ? (
        <Section
          title="ต้องประเมินทดลองงาน"
          description="หัวหน้างานเป็นคนประเมิน ถ้าเลยกำหนดแล้วยังไม่ประเมิน พนักงานจะค้างสถานะทดลองงาน"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {probationDue.map(({ member, days }) => (
              <div
                key={member.employee.id}
                className={joinClassName(
                  "rounded-lg border border-l-2 border-slate-200 px-3 py-2.5",
                  (days ?? 0) < 0
                    ? "border-l-rose-500"
                    : (days ?? 0) <= 14
                      ? "border-l-amber-500"
                      : "border-l-slate-300",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-[13px] font-semibold text-slate-900">
                      {getEmployeeName(member.employee)}
                    </p>
                    <p className="break-words text-[11.5px] text-slate-400">
                      ครบกำหนด{" "}
                      {member.employee.probationEndDate
                        ? formatThaiDate(member.employee.probationEndDate)
                        : "-"}
                    </p>
                  </div>

                  <Badge
                    tone={
                      (days ?? 0) < 0
                        ? "critical"
                        : (days ?? 0) <= 14
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {(days ?? 0) < 0
                      ? `เลย ${Math.abs(days ?? 0)} วัน`
                      : `อีก ${days} วัน`}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title="ทะเบียนลูกทีม"
        description={`${countText(filtered.length)} คน · กะการทำงาน วันลาคงเหลือ และช่องทางติดต่อ`}
        tight
      >
        <Toolbar>
          <div className="min-w-55 flex-1">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อ รหัสพนักงาน อีเมล เบอร์โทร แผนก"
            />
          </div>
        </Toolbar>

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.employee.id}
          emptyIcon={<Users className="h-5 w-5" />}
          emptyTitle="ไม่พบลูกทีมตามคำค้นหา"
          emptyDescription="ลองพิมพ์คำอื่น หรือล้างช่องค้นหา"
        />
      </Section>

      <Section
        title="วันลาพักร้อนคงเหลือ"
        description="เรียงจากคนที่เหลือน้อยที่สุด — ใช้ตอบทันทีตอนมีคนขอลากะทันหัน"
      >
        <BarList
          rows={annualLeaveRows}
          unit="วัน"
          emptyText="ยังไม่มีข้อมูลสิทธิ์วันลาของทีม"
          showPercent={false}
        />
      </Section>
    </>
  );
}
