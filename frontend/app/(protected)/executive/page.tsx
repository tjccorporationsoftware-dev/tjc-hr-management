"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  PageHeading,
  PageSurface,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";

import { AttendancePanel } from "./_components/attendance-panel";
import { ManpowerPanel } from "./_components/manpower-panel";
import { OrgChartPanel } from "./_components/org-chart-panel";
import { PayrollPanel } from "./_components/payroll-panel";

/**
 * ห้องผู้บริหาร
 * ------------
 * รวมสี่หน้าเดิมของโซนผู้บริหารไว้ที่เดียว แล้วเรียงเป็นสามแท็บตามเรื่องที่ดู:
 *   เงินเดือน   — จ่ายไปเท่าไร รายได้ประจำ/ไม่ประจำ และหักอะไรบ้าง
 *   การเข้างาน  — วันนี้ใครมา ใครลา ใครสาย (รายคน กรองรายแผนกได้)
 *   กำลังพล     — โครงสร้างกำลังคน การเข้า-ออก และเทียบรายหน่วยงาน
 *   ผังองค์กร   — สายบังคับบัญชาและโครงสร้างหน่วยงาน (อ่านอย่างเดียว)
 *
 * URL เดิม (/executive/dashboard · manpower · payroll-summary · reports)
 * redirect เข้ามาที่แท็บที่ตรงกันแล้ว
 */

type TabKey = "payroll" | "attendance" | "manpower" | "org-chart";

function ExecutiveWorkspace() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const permissionSet = useMemo(
    () =>
      new Set(
        (user?.permissions ?? []).map((permission) =>
          permission.trim().toUpperCase(),
        ),
      ),
    [user?.permissions],
  );

  // แท็บเงินเดือนเป็นข้อมูลเงิน จึงคุมด้วยสิทธิ์แยกจากอีกสองแท็บ
  const canSeePayroll = permissionSet.has("PAYROLL_READ");

  const tabs = useMemo<Array<TabItem<TabKey>>>(
    () => [
      ...(canSeePayroll
        ? [{ key: "payroll" as const, label: "เงินเดือน" }]
        : []),
      { key: "attendance", label: "การเข้างาน" },
      { key: "manpower", label: "กำลังพล" },
      { key: "org-chart", label: "ผังองค์กร" },
    ],
    [canSeePayroll],
  );

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    if (tabs.some((item) => item.key === requested)) return requested as TabKey;

    // รองรับลิงก์เก่าที่ยังชี้ ?tab=cost / ?tab=overview
    if (requested === "cost" && canSeePayroll) return "payroll";
    return tabs[0]?.key ?? "attendance";
  });

  const activeTab = tabs.some((item) => item.key === tab)
    ? tab
    : (tabs[0]?.key ?? "attendance");

  return (
    <PageSurface>
      <PageHeading
        title="ห้องผู้บริหาร"
        description="ดูค่าจ้างที่จ่ายจริง การมาทำงานของพนักงานรายคน และโครงสร้างกำลังคน จากที่เดียว"
      />

      <Tabs
        className="border-slate-300"
        items={tabs}
        value={activeTab}
        onChange={setTab}
      />

      {activeTab === "payroll" && canSeePayroll ? <PayrollPanel /> : null}
      {activeTab === "attendance" ? <AttendancePanel /> : null}
      {activeTab === "manpower" ? <ManpowerPanel /> : null}
      {activeTab === "org-chart" ? <OrgChartPanel /> : null}
    </PageSurface>
  );
}

export default function ExecutivePage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <ExecutiveWorkspace />
    </Suspense>
  );
}
