"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";

import {
  PageChip,
  PageHeading,
  PageSurface,
  StatTile,
  Tabs,
  type TabItem,
} from "@/components/kit";

import {
  QueuePanel,
  type QueueSummary,
} from "@/app/(protected)/approvals/_components/queue-panel";
import type { HistorySummaryTile } from "@/app/(protected)/approvals/_components/history/request-view";
import { TeamHistoryPanel } from "./_components/team-history-panel";

/**
 * ศูนย์คำขอของทีม (หัวหน้างาน)
 * ---------------------------
 * แยกจาก /approvals ของ HR โดยตั้งใจ เพราะขอบเขตข้อมูลคนละชุด:
 *   - ของ HR มองทั้งบริษัท มีตัวกรอง สาขา/แผนก/ประเภทพนักงาน และส่งออก CSV
 *   - ของหัวหน้ามองเฉพาะลูกทีมในสายบังคับบัญชาตัวเอง จึงตัดตัวกรองพวกนั้นทิ้ง
 *     และดึงจาก endpoint /manager/* ที่กรองสายบังคับบัญชาให้ตั้งแต่ฝั่งเซิร์ฟเวอร์
 *
 * แท็บ "รออนุมัติ" ใช้คอมโพเนนต์คิวตัวเดียวกับ HR เพราะความหมายเหมือนกันเป๊ะ
 * คือ "คำขอที่รอฉันกดอนุมัติ" (API กรองตามผู้อนุมัติอยู่แล้ว) ถ้าก๊อปมาอีกชุด
 * เวลาสายอนุมัติเปลี่ยนจะต้องไล่แก้สองที่และมักลืมที่หนึ่งเสมอ
 */

type TabKey = "queue" | "history";

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0";

const TABS: Array<TabItem<TabKey>> = [
  { key: "queue", label: "รออนุมัติ" },
  { key: "history", label: "ประวัติของทีม" },
];

function count(value?: number | null) {
  return (value ?? 0).toLocaleString("th-TH");
}

function ManagerRequestsWorkspace() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return TABS.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "queue";
  });

  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  // แท็บประวัติส่งตัวเลขของแท็บย่อยที่เปิดอยู่ขึ้นมาวางที่เดียวกับแท็บรออนุมัติ
  const [historyTiles, setHistoryTiles] = useState<HistorySummaryTile[]>([]);

  const handleHistoryTiles = useCallback(
    (tiles: HistorySummaryTile[]) => setHistoryTiles(tiles),
    [],
  );

  return (
    <PageSurface>
      <PageHeading
        title="คำขอของทีม"
        description="อนุมัติคำขอที่รอคุณ และย้อนดูประวัติคำขอลา OT ขอแก้เวลา และนอกสถานที่ เฉพาะลูกทีมในสายบังคับบัญชาของคุณ"
        chips={
          <PageChip tone="brand" icon={<Users className="h-3 w-3" />}>
            เฉพาะลูกทีมของฉัน
          </PageChip>
        }
        actions={
          tab === "queue" ? (
            <div className={TILE_BOX}>
              <StatTile
                label="รออนุมัติ"
                value={count(queueSummary?.pending)}
                tone={(queueSummary?.pending ?? 0) > 0 ? "warning" : "neutral"}
                helper="รอฉันดำเนินการ"
              />
              <StatTile
                label="เร่งด่วน"
                value={count(queueSummary?.urgent)}
                tone={(queueSummary?.urgent ?? 0) > 0 ? "warning" : "neutral"}
                helper="ค้างเกิน 3 วัน"
              />
              <StatTile
                label="รายการวันนี้"
                value={count(queueSummary?.today)}
                helper="ยื่นเข้ามาวันนี้"
              />
              <StatTile
                label="ในสัปดาห์นี้"
                value={count(queueSummary?.week)}
                helper="ยื่นภายใน 7 วัน"
              />
            </div>
          ) : historyTiles.length ? (
            <div className={TILE_BOX}>
              {historyTiles.map((tile) => (
                <StatTile
                  key={tile.label}
                  label={tile.label}
                  value={tile.value}
                  tone={tile.tone}
                  helper={tile.helper}
                />
              ))}
            </div>
          ) : null
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === "queue" ? <QueuePanel onSummaryChange={setQueueSummary} /> : null}
      {tab === "history" ? (
        <TeamHistoryPanel
          initialTab={searchParams.get("type")}
          onSummaryChange={handleHistoryTiles}
        />
      ) : null}
    </PageSurface>
  );
}

export default function ManagerRequestsPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <ManagerRequestsWorkspace />
    </Suspense>
  );
}
