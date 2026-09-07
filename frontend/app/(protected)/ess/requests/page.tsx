"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";

import {
  PageChip,
  PageHeading,
  PageSurface,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";

import { AllRequestsPanel } from "./_components/all-requests-panel";
import { DocumentRequestPanel } from "./_components/documents-panel";
import { LeaveRequestPanel } from "./_components/leave-panel";
import { OvertimeRequestPanel } from "./_components/overtime-panel";
import { TimeAdjustRequestPanel } from "./_components/time-adjust-panel";

/**
 * คำขอของฉัน (พนักงาน)
 * --------------------
 * เดิมแยกเป็น 5 เมนู: ศูนย์คำขอ + ยื่นใบลา + ขอ OT + ขอแก้เวลา + ขอเอกสาร
 * ทั้งสี่หน้าหลังทำงานเหมือนกันคือ "ปุ่มเปิดฟอร์ม + ประวัติของประเภทตัวเอง"
 * ซึ่งประวัติก็ซ้ำกับศูนย์คำขออยู่แล้ว จึงยุบมาเป็นแท็บในหน้าเดียว
 *
 * แท็บจะโผล่เฉพาะประเภทที่บัญชีนั้นมีสิทธิ์สร้างจริง
 */

type TabKey = "all" | "leave" | "overtime" | "time-adjust" | "documents";

function EssRequests() {
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

  const tabs: Array<TabItem<TabKey>> = [
    { key: "all", label: "ทั้งหมด" },
    ...(permissionSet.has("LEAVE_CREATE")
      ? [{ key: "leave" as const, label: "ใบลา" }]
      : []),
    ...(permissionSet.has("OT_CREATE")
      ? [{ key: "overtime" as const, label: "OT" }]
      : []),
    ...(permissionSet.has("TIME_ADJUST_CREATE")
      ? [{ key: "time-adjust" as const, label: "แก้เวลา / นอกสถานที่" }]
      : []),
    ...(permissionSet.has("DOCUMENT_CREATE")
      ? [{ key: "documents" as const, label: "เอกสาร" }]
      : []),
  ];

  // ลิงก์เก่า /ess/requests/leave ฯลฯ จะ redirect มาพร้อม ?tab=
  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return tabs.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "all";
  });

  return (
    <PageSurface>
      <PageHeading
        heroMotif="approvals"
        eyebrow="My Requests"
        title="คำขอ"
        titleAccent="ของฉัน"
        description="ยื่นใบลา ขอ OT ขอแก้เวลา และขอเอกสาร พร้อมติดตามสถานะทุกคำขอในที่เดียว"
        chips={
          <PageChip tone="brand" icon={<FileText className="h-3 w-3" />}>
            คำขอทั้งหมดของฉัน
          </PageChip>
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === "all" ? (
        <AllRequestsPanel
          onOpenTab={(next) =>
            setTab(tabs.some((item) => item.key === next) ? next : "all")
          }
        />
      ) : null}
      {tab === "leave" ? <LeaveRequestPanel /> : null}
      {tab === "overtime" ? <OvertimeRequestPanel /> : null}
      {tab === "time-adjust" ? <TimeAdjustRequestPanel /> : null}
      {tab === "documents" ? <DocumentRequestPanel /> : null}
    </PageSurface>
  );
}

export default function EssRequestsPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <EssRequests />
    </Suspense>
  );
}
