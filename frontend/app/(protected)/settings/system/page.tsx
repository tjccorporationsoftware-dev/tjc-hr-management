"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText, LockKeyhole, SlidersHorizontal } from "lucide-react";

import {
  PageChip,
  PageHeading,
  PageSurface,
  Tabs,
  type TabItem,
} from "@/components/kit";

import { DocumentTemplatesPanel } from "./_components/document-templates-panel";
import { GeneralSettingsPanel } from "./_components/general-panel";
import { SecurityPanel } from "./_components/security-panel";

/**
 * ตั้งค่าระบบ
 * ----------
 * ค่ากลางที่ตั้งครั้งเดียวแล้วใช้ยาว: ค่าทั่วไปของระบบ ความปลอดภัยบัญชี
 * และแม่แบบเอกสาร — เดิมแยกเป็นสามหน้า ตอนนี้เป็นสามแท็บในผืนเดียว
 */

type TabKey = "general" | "security" | "documents";

const TABS: Array<TabItem<TabKey>> = [
  { key: "general", label: "ทั่วไป" },
  { key: "security", label: "ความปลอดภัย" },
  { key: "documents", label: "แม่แบบเอกสาร" },
];

function SystemSettings() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return TABS.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "general";
  });

  return (
    <PageSurface>
      <PageHeading
        title="ตั้งค่าระบบ"
        description="ค่ากลางของระบบ นโยบายบัญชีผู้ใช้ และแม่แบบเอกสารที่ออกให้พนักงาน"
        chips={
          <>
            <PageChip icon={<SlidersHorizontal className="h-3 w-3" />}>
              ค่าทั่วไป
            </PageChip>
            <PageChip icon={<LockKeyhole className="h-3 w-3" />}>
              ความปลอดภัย
            </PageChip>
            <PageChip icon={<FileText className="h-3 w-3" />}>
              แม่แบบเอกสาร
            </PageChip>
          </>
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === "general" ? <GeneralSettingsPanel /> : null}
      {tab === "security" ? <SecurityPanel /> : null}
      {tab === "documents" ? <DocumentTemplatesPanel /> : null}
    </PageSurface>
  );
}

export default function SystemSettingsPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <SystemSettings />
    </Suspense>
  );
}
