"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, History, Trash2 } from "lucide-react";

import {
  PageChip,
  PageHeading,
  PageSurface,
  Tabs,
  type TabItem,
} from "@/components/kit";

import { AuditPanel } from "./_components/audit-panel";
import { MonitoringPanel } from "./_components/monitoring-panel";
import { TrashPanel } from "./_components/trash-panel";

/**
 * ระบบและบันทึก
 * -------------
 * งานตรวจสอบหลังบ้านที่ผู้ดูแลเปิดดูเป็นครั้งคราว: สถานะระบบ ประวัติการใช้งาน
 * และของที่ถูกลบไว้ — เดิมแยกเป็นสามหน้า ตอนนี้เป็นสามแท็บ
 */

type TabKey = "monitoring" | "audit" | "trash";

const TABS: Array<TabItem<TabKey>> = [
  { key: "monitoring", label: "สถานะระบบ" },
  { key: "audit", label: "ประวัติการใช้งาน" },
  { key: "trash", label: "ถังขยะ" },
];

function OperationsSettings() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return TABS.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "monitoring";
  });

  return (
    <PageSurface>
      <PageHeading
        title="ระบบและบันทึก"
        description="ตรวจสถานะบริการ ดูประวัติการใช้งาน และจัดการรายการที่ถูกลบ"
        chips={
          <>
            <PageChip icon={<Activity className="h-3 w-3" />}>สถานะระบบ</PageChip>
            <PageChip icon={<History className="h-3 w-3" />}>
              ประวัติการใช้งาน
            </PageChip>
            <PageChip icon={<Trash2 className="h-3 w-3" />}>ถังขยะ</PageChip>
          </>
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === "monitoring" ? <MonitoringPanel /> : null}
      {tab === "audit" ? <AuditPanel /> : null}
      {tab === "trash" ? <TrashPanel /> : null}
    </PageSurface>
  );
}

export default function OperationsSettingsPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <OperationsSettings />
    </Suspense>
  );
}
