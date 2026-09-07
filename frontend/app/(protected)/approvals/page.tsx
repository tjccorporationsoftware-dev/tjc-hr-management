"use client";

import { Suspense, useMemo, useState, type ComponentType } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, Calendar, CalendarClock, CheckCircle2, ClipboardList } from "lucide-react";

import { PageHeroWave } from "@/components/common/page-hero-wave";
import { PageSurface, type TabItem } from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";

import { QueuePanel, type QueueSummary } from "./_components/queue-panel";
import { HistoryPanel } from "./_components/history-panel";
import type { HistorySummaryTile } from "./_components/history/request-view";

/**
 * ศูนย์คำขอ
 * ---------
 * รวมสองเรื่องที่เคยแยกเป็นคนละหน้าไว้ด้วยกัน: ศูนย์อนุมัติ (/approvals เดิม)
 * และประวัติคำขอทั้งองค์กร (/hr/requests เดิม) เพราะทั้งคู่คืองาน "ดูคำขอลา OT
 * ขอแก้เวลา นอกสถานที่ และเอกสาร" แบบเดียวกัน ต่างกันแค่ว่าดูรายการที่รอ
 * ดำเนินการอยู่ (แท็บ "รออนุมัติ") หรือย้อนดูประวัติทั้งหมด (แท็บ "ประวัติ")
 *
 * แท็บ "รออนุมัติ" ต้องมีสิทธิ์อนุมัติอย่างใดอย่างหนึ่ง ส่วนแท็บ "ประวัติ"
 * ต้องมีสิทธิ์อ่านอย่างใดอย่างหนึ่ง — ผู้ใช้ที่มีสิทธิ์อย่างใดอย่างหนึ่งเข้าหน้านี้ได้
 * และเห็นเฉพาะแท็บที่มีสิทธิ์
 *
 * หัวเรื่องใช้โทนดีไซน์เดียวกับ /hr/dashboard — กล่องสถิติเป็นไอคอนวงกลม
 * แทนตัวหนังสือล้วน และผืนหน้าเป็นขาวต่อเนื่อง ไม่มีการ์ดลอยแยก
 */

type TabKey = "queue" | "history";

type HeaderStatTone = "neutral" | "warning" | "positive";

type HeaderStat = {
  label: string;
  value: string;
  helper: string;
  tone: HeaderStatTone;
  icon: ComponentType<{ className?: string }>;
};

/*
 * ตัวเลขบนแผงหัวหน้าเป็นสีดำเสมอ ไม่เปลี่ยนตามค่า — แผงตัวเลขทุกหน้าใช้ชุดเดียวกัน
 * คือไอคอนวงฟ้ากับตัวเลขดำ ส่วน `tone` ยังใช้เลือกไอคอนของแท็บประวัติอยู่
 */
const HEADER_STAT_VALUE_COLOR = "text-slate-900";

const HISTORY_TONE_ICON: Record<
  HeaderStatTone,
  ComponentType<{ className?: string }>
> = {
  neutral: ClipboardList,
  warning: Bell,
  positive: CheckCircle2,
};

const QUEUE_PERMISSIONS = [
  "APPROVAL_ACCESS",
  "LEAVE_APPROVE",
  "OT_APPROVE",
  "TIME_ADJUST_APPROVE",
  "OFFSITE_REQUEST_APPROVE",
  "DOCUMENT_APPROVE",
];

const HISTORY_PERMISSIONS = [
  "LEAVE_READ",
  "OT_READ",
  "TIME_ADJUST_READ",
  "OFFSITE_REQUEST_READ",
];

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function ApprovalsWorkspace() {
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

  const canSeeQueue = QUEUE_PERMISSIONS.some((permission) =>
    permissionSet.has(permission),
  );
  const canSeeHistory = HISTORY_PERMISSIONS.some((permission) =>
    permissionSet.has(permission),
  );

  const tabs: Array<TabItem<TabKey>> = [
    ...(canSeeQueue ? [{ key: "queue" as const, label: "รออนุมัติ" }] : []),
    ...(canSeeHistory ? [{ key: "history" as const, label: "ประวัติ" }] : []),
  ];

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return tabs.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "queue";
  });

  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  // แท็บประวัติส่งตัวเลขของแท็บย่อยที่เปิดอยู่ขึ้นมาวางที่เดียวกับแท็บรออนุมัติ
  const [historyTiles, setHistoryTiles] = useState<HistorySummaryTile[]>([]);

  const activeTab = tabs.some((item) => item.key === tab)
    ? tab
    : (tabs[0]?.key ?? "queue");

  const queueStats = useMemo<HeaderStat[]>(
    () => [
      {
        label: "รออนุมัติ",
        value: count(queueSummary?.pending ?? 0),
        helper: "รอฉันดำเนินการ",
        tone: (queueSummary?.pending ?? 0) > 0 ? "warning" : "neutral",
        icon: ClipboardList,
      },
      {
        label: "เร่งด่วน",
        value: count(queueSummary?.urgent ?? 0),
        helper: "ค้างเกิน 3 วัน",
        tone: (queueSummary?.urgent ?? 0) > 0 ? "warning" : "neutral",
        icon: Bell,
      },
      {
        label: "รายการวันนี้",
        value: count(queueSummary?.today ?? 0),
        helper: "ยื่นคำขอวันนี้",
        tone: "neutral",
        icon: Calendar,
      },
      {
        label: "สัปดาห์นี้",
        value: count(queueSummary?.week ?? 0),
        helper: "ภายใน 7 วัน",
        tone: "neutral",
        icon: CalendarClock,
      },
    ],
    [queueSummary],
  );

  const historyStats = useMemo<HeaderStat[]>(
    () =>
      historyTiles.map((tile) => ({
        label: tile.label,
        value: tile.value,
        helper: tile.helper,
        tone: tile.tone,
        icon: HISTORY_TONE_ICON[tile.tone],
      })),
    [historyTiles],
  );

  const headerStats = activeTab === "queue" ? queueStats : historyStats;

  return (
    <PageSurface>
      <div className="relative overflow-hidden border-b border-slate-200 bg-white px-6 py-6 sm:px-7 3xl:px-8">
        <PageHeroWave variant="approvals" />

        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">
              Approvals <span className="text-brand-300">•</span>
            </p>
            <h1 className="mt-2 text-[27px] font-extrabold tracking-tight text-slate-900 3xl:text-[30px]">
              ศูนย์<span className="text-brand-600">คำขอ</span>
              <span className="text-brand-600">.</span>
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500 3xl:text-[13.5px]">
              อนุมัติคำขอลา OT ขอแก้เวลา นอกสถานที่ และเอกสารของพนักงาน
              พร้อมย้อนดูประวัติคำขอทั้งองค์กรได้จากที่เดียว
            </p>
          </div>

          {headerStats.length ? (
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0">
              {headerStats.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[10.5px] font-semibold text-slate-500">
                        {item.label}
                      </p>
                      <p
                        className={`truncate text-[15px] font-extrabold leading-5 tabular-nums tracking-tight 3xl:text-[15.5px] ${HEADER_STAT_VALUE_COLOR}`}
                      >
                        {item.value}
                      </p>
                      <p className="truncate text-[10px] text-slate-400">
                        {item.helper}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 px-5 sm:px-7 3xl:px-8">
        {tabs.map((item) => {
          const active = item.key === activeTab;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`relative px-4 py-3.5 text-[14px] font-bold transition sm:px-5 3xl:text-[14.5px] ${
                active
                  ? "text-brand-700"
                  : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {item.label}
              {active ? (
                <span className="absolute inset-x-4 -bottom-px h-[3px] rounded-full bg-brand-600 sm:inset-x-5" />
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === "queue" && canSeeQueue ? (
        <QueuePanel onSummaryChange={setQueueSummary} />
      ) : null}

      {activeTab === "history" && canSeeHistory ? (
        <HistoryPanel
          initialTab={searchParams.get("type")}
          onSummaryChange={setHistoryTiles}
        />
      ) : null}
    </PageSurface>
  );
}

export default function ApprovalsPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <ApprovalsWorkspace />
    </Suspense>
  );
}
