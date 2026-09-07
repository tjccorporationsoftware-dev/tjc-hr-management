"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";

import {
  getLeaveRequests,
  getOffsiteWorkRequests,
  getOvertimeRequests,
  getTimeAdjustRequests,
} from "@/lib/api";

import type { TabItem } from "@/components/kit";
import type {
  HistorySummaryTile,
  HistoryTabProps,
} from "./history/request-view";

import { LeavesTab } from "./history/leaves-tab";
import { OvertimeTab } from "./history/overtime-tab";
import { TimeAdjustTab } from "./history/time-adjust-tab";
import { OffsiteTab } from "./history/offsite-tab";

/**
 * แท็บ "ประวัติ" — เดิมเป็นหน้า /hr/requests แยก ยุบมาเป็นแท็บที่สองในหน้า
 * "ศูนย์คำขอ" คงแท็บย่อยเดิม 4 ประเภท (การลา / OT / ขอแก้เวลา / นอกสถานที่)
 * ไว้ตามเดิม เพราะแต่ละแท็บย่อยคือคนละ fetch จริง ๆ ไม่ใช่ตัวกรองของ list เดียวกัน
 */

type TabKey = "leaves" | "overtime" | "time-adjust" | "offsite";

const TABS: Array<{
  key: TabKey;
  label: string;
  Component: ComponentType<HistoryTabProps>;
  loadCount: () => Promise<number>;
}> = [
  {
    key: "leaves",
    label: "การลา",
    Component: LeavesTab,
    loadCount: async () =>
      (await getLeaveRequests({ page: 1, pageSize: 1 })).summary?.total ?? 0,
  },
  {
    key: "overtime",
    label: "OT",
    Component: OvertimeTab,
    loadCount: async () =>
      (await getOvertimeRequests({ page: 1, pageSize: 1 })).summary?.total ?? 0,
  },
  {
    key: "time-adjust",
    label: "ขอแก้เวลา",
    Component: TimeAdjustTab,
    loadCount: async () =>
      (await getTimeAdjustRequests({ page: 1, pageSize: 1 })).summary?.total ??
      0,
  },
  {
    key: "offsite",
    label: "นอกสถานที่",
    Component: OffsiteTab,
    loadCount: async () =>
      (await getOffsiteWorkRequests({ page: 1, pageSize: 1 })).summary?.total ??
      0,
  },
];

export function HistoryPanel({
  initialTab,
  onSummaryChange,
}: {
  /** ลิงก์เก่าของหัวหน้างาน (/manager/leaves ฯลฯ) ส่ง ?type= มาเพื่อเปิดแท็บย่อยให้ตรง */
  initialTab?: string | null;
  onSummaryChange?: (tiles: HistorySummaryTile[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    TABS.some((tab) => tab.key === initialTab)
      ? (initialTab as TabKey)
      : "leaves",
  );
  const [counts, setCounts] = useState<Partial<Record<TabKey, number>>>({});

  // ดึงยอดรวมของทุกประเภทมาโชว์เป็นเลขบนแท็บย่อย (เบา ๆ pageSize=1)
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        TABS.map(async (tab) => {
          try {
            return [tab.key, await tab.loadCount()] as const;
          } catch {
            return [tab.key, 0] as const;
          }
        }),
      );

      if (!cancelled) setCounts(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const active = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];
  const ActiveComponent = active.Component;

  const tabItems: Array<TabItem<TabKey>> = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: counts[tab.key],
  }));

  return (
    <ActiveComponent
      onSummaryChange={onSummaryChange}
      renderTabBar={(trailing) => (
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7 3xl:px-8">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-slate-100 p-1">
            {tabItems.map((item) => {
              const active = item.key === activeTab;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                    active
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {item.label}
                  {typeof item.count === "number" && item.count > 0 ? (
                    <span
                      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold tabular-nums ${
                        active
                          ? "bg-white/25 text-white"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {trailing}
        </div>
      )}
    />
  );
}
