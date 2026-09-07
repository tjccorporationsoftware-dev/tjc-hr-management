"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { SecurityPanel } from "@/app/(protected)/settings/system/_components/security-panel";
import { useAuth } from "@/contexts/auth-context";
import {
  Avatar,
  Button,
  PageChip,
  PageHeading,
  PageSurface,
  StatTile,
  Tabs,
  joinClassName,
  type TabItem,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import { getMyProfile, getPublicFileUrl } from "@/lib/api";
import { formatThaiDate } from "@/lib/date-format";
import { queryKeys } from "@/lib/query-keys";
import { useApiQuery } from "@/lib/use-api";
import type { MyProfileResponse } from "@/types/profile";

import { MyProfilePanel } from "./_components/profile-panel";
import { SalarySlipPanel } from "./_components/salary-slip-panel";

/**
 * ข้อมูลของฉัน (พนักงาน)
 * ----------------------
 * รวมสามเรื่องที่เป็น "ข้อมูลส่วนตัวของพนักงานคนนี้" ไว้ที่เดียว:
 * แฟ้มข้อมูลพนักงาน · สลิปเงินเดือน · ความปลอดภัยบัญชี
 *
 * หัวเรื่องของหน้าคือ "ตัวพนักงานเอง" จึงใช้โครงเดียวกับหน้ารายละเอียดพนักงาน
 * ฝั่ง HR (/employees/[id]) — รูปซ้าย ชื่อเป็นหัวเรื่อง ป้ายบริบท และแผงตัวเลข
 * ข้อมูลแฟ้มพนักงานถูกโหลดที่นี่ทีเดียวแล้วให้แท็บใช้ผ่าน cache ของ react-query
 *
 * ทั้งสามแท็บอ่านข้อมูลของตัวเองเท่านั้น จึงใช้สิทธิ์ ESS_ACCESS ชุดเดียวกัน
 */

type TabKey = "profile" | "payslip" | "security";

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0";

function text(value?: string | null, fallback = "-") {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** อายุงานแบบ "x ปี y เดือน" ใช้ชุดเดียวกับหน้าแฟ้มพนักงานฝั่ง HR */
function tenureText(startDate?: string | null) {
  if (!startDate) return "-";

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return "-";

  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());

  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return "-";

  const years = Math.floor(months / 12);
  const restMonths = months % 12;

  if (years && restMonths) return `${years} ปี ${restMonths} เดือน`;
  if (years) return `${years} ปี`;
  return `${restMonths} เดือน`;
}

function MyInformation() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const query = useApiQuery<MyProfileResponse>(queryKeys.ess.profile(), () =>
    getMyProfile(),
  );

  const profile = query.data ?? null;
  const employee = profile?.employee ?? null;

  const displayName =
    [employee?.title, employee?.firstName, employee?.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ") ||
    employee?.displayName ||
    profile?.user.displayName ||
    "ข้อมูลของฉัน";

  const avatarUrl = getPublicFileUrl(profile?.user.avatarUrl);

  const positionText = text(
    employee?.positionMaster?.nameTh || employee?.position,
    "ยังไม่ระบุตำแหน่ง",
  );
  const departmentText = text(employee?.department?.nameTh, "ยังไม่ระบุแผนก");

  const supervisorName = [
    employee?.supervisor?.firstName,
    employee?.supervisor?.lastName,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  // สลิปเงินเดือนเดิมเป็นหน้าแยกที่ต้องมี PAYROLL_SLIP_VIEW จึงคุมที่ระดับแท็บแทน
  const canViewPayslip = (user?.permissions ?? []).some(
    (permission) => permission.trim().toUpperCase() === "PAYROLL_SLIP_VIEW",
  );

  const TABS: Array<TabItem<TabKey>> = useMemo(
    () => [
      { key: "profile", label: "ข้อมูลพนักงาน" },
      ...(canViewPayslip
        ? [{ key: "payslip" as const, label: "สลิปเงินเดือน" }]
        : []),
      { key: "security", label: "ความปลอดภัยบัญชี" },
    ],
    [canViewPayslip],
  );

  // ลิงก์เก่า /ess/salary-slip กับ /settings/security จะ redirect มาพร้อม ?tab=
  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return TABS.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "profile";
  });

  return (
    <PageSurface>
      <PageHeading
        heroMotif="employees"
        eyebrow="My Profile"
        title={displayName}
        description={`${positionText} · ${departmentText}`}
        leading={<Avatar name={displayName} src={avatarUrl} size="xl" />}
        chips={
          employee ? (
            <>
              <StatusBadge
                vocabulary={EMPLOYEE_STATUS}
                status={employee.status}
              />
              <PageChip tone="brand">{text(employee.company?.nameTh)}</PageChip>
              {employee.branch?.nameTh ? (
                <PageChip>{employee.branch.nameTh}</PageChip>
              ) : null}
              {employee.nickname ? (
                <PageChip>ชื่อเล่น {employee.nickname}</PageChip>
              ) : null}
            </>
          ) : (
            <PageChip>ยังไม่ผูกกับข้อมูลพนักงาน</PageChip>
          )
        }
        actions={
          <>
            {employee ? (
              <div className={TILE_BOX}>
                <StatTile
                  label="รหัสพนักงาน"
                  value={text(employee.employeeCode)}
                  helper="ใช้อ้างอิงทุกระบบ"
                />
                <StatTile
                  label="วันที่เริ่มงาน"
                  value={formatThaiDate(employee.startDate)}
                  helper={
                    employee.probationEndDate
                      ? `ทดลองงานถึง ${formatThaiDate(employee.probationEndDate)}`
                      : "ไม่มีช่วงทดลองงาน"
                  }
                />
                <StatTile
                  label="อายุงาน"
                  value={tenureText(employee.startDate)}
                  helper="นับถึงวันนี้"
                />
                <StatTile
                  label="ประเภทการจ้าง"
                  value={text(employee.employeeType?.nameTh, "ไม่ได้ระบุ")}
                  helper={
                    supervisorName
                      ? `หัวหน้างาน ${supervisorName}`
                      : "ยังไม่ได้ระบุหัวหน้างาน"
                  }
                />
              </div>
            ) : null}

            <div className="flex justify-end">
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
            </div>
          </>
        }
      />

      <Tabs
        className="border-slate-300"
        items={TABS}
        value={tab}
        onChange={setTab}
      />

      {tab === "profile" ? <MyProfilePanel /> : null}
      {tab === "payslip" && canViewPayslip ? <SalarySlipPanel /> : null}
      {tab === "security" ? <SecurityPanel /> : null}
    </PageSurface>
  );
}

export default function EssMyProfilePage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <MyInformation />
    </Suspense>
  );
}
