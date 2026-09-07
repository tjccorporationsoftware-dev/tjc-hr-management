"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";

import { Tabs, type TabItem } from "@/components/kit";
import {
  getManagerLeaves,
  getManagerOffsite,
  getManagerOvertime,
  getManagerTimeAdjust,
} from "@/lib/api";

import { LeavesTab } from "@/app/(protected)/approvals/_components/history/leaves-tab";
import { OffsiteTab } from "@/app/(protected)/approvals/_components/history/offsite-tab";
import { OvertimeTab } from "@/app/(protected)/approvals/_components/history/overtime-tab";
import { TimeAdjustTab } from "@/app/(protected)/approvals/_components/history/time-adjust-tab";
import type {
  HistorySummaryTile,
  HistoryTabProps,
} from "@/app/(protected)/approvals/_components/history/request-view";

/**
 * แท็บ "ประวัติของทีม"
 * -------------------
 * หน้าตาเหมือนแท็บประวัติของ HR ทุกอย่าง (แท็บย่อยพร้อมจำนวน · ค้นหา · รีเฟรช ·
 * ส่งออก CSV · ตัวกรอง · ตารางพร้อมปุ่มดูรายละเอียด) เพราะใช้คอมโพเนนต์
 * `RequestView` ตัวเดียวกัน — ต่างกันสองอย่างที่เป็นแก่นของหน้านี้:
 *
 *   1. ยิง endpoint ฝั่ง `/manager/*` ซึ่งกรองเฉพาะลูกทีมในสายบังคับบัญชาให้
 *      ตั้งแต่ฝั่งเซิร์ฟเวอร์ หัวหน้าจึงไม่เห็นคำขอของแผนกอื่น
 *   2. ซ่อนตัวกรองสาขา/แผนก เพราะขอบเขตแคบอยู่แล้ว และโรลหัวหน้างานไม่มีสิทธิ์
 *      ORG_READ ที่จะโหลดรายชื่อสาขา/แผนกมาใส่ช่องเลือกได้
 *
 * ทำแบบนี้เพื่อไม่ต้องดูแลตาราง/ตัวกรอง/CSV สองชุดที่ต้องไล่แก้ตามกันตลอด
 */

type HistoryKey = "leaves" | "overtime" | "time-adjust" | "offsite";

/** ตัดพารามิเตอร์ที่ endpoint ฝั่ง /manager/* ไม่รับ (สาขา/แผนก/ฝ่าย) ออกก่อนยิง */
const ORG_ONLY_PARAMS = [
  "branchId",
  "departmentId",
  "divisionId",
  "employeeTypeId",
];

function teamParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => !ORG_ONLY_PARAMS.includes(key)),
  ) as never;
}

const TABS: Array<{
  key: HistoryKey;
  label: string;
  Component: ComponentType<HistoryTabProps & { override?: unknown }>;
  loadCount: () => Promise<number>;
}> = [
  {
    key: "leaves",
    label: "การลา",
    Component: LeavesTab as never,
    loadCount: async () =>
      (await getManagerLeaves({ page: 1, pageSize: 1 })).summary?.total ?? 0,
  },
  {
    key: "overtime",
    label: "OT",
    Component: OvertimeTab as never,
    loadCount: async () =>
      (await getManagerOvertime({ page: 1, pageSize: 1 })).summary?.total ?? 0,
  },
  {
    key: "time-adjust",
    label: "ขอแก้เวลา",
    Component: TimeAdjustTab as never,
    loadCount: async () =>
      (await getManagerTimeAdjust({ page: 1, pageSize: 1 })).summary?.total ??
      0,
  },
  {
    key: "offsite",
    label: "นอกสถานที่",
    Component: OffsiteTab as never,
    loadCount: async () =>
      (await getManagerOffsite({ page: 1, pageSize: 1 })).summary?.total ?? 0,
  },
];

/** override ต่อประเภท — เปลี่ยนเฉพาะ "ดึงจากไหน" กับ "ซ่อนตัวกรององค์กร" */
const OVERRIDES: Record<HistoryKey, Record<string, unknown>> = {
  leaves: {
    hideOrgFilters: true,
    csvName: "team-leave-requests",
    emptyText: "ไม่พบใบลาของลูกทีม",
    fetchList: (params: Record<string, unknown>) =>
      getManagerLeaves(teamParams(params)),
  },
  overtime: {
    hideOrgFilters: true,
    csvName: "team-overtime-requests",
    emptyText: "ไม่พบคำขอ OT ของลูกทีม",
    fetchList: (params: Record<string, unknown>) =>
      getManagerOvertime(teamParams(params)),
  },
  "time-adjust": {
    hideOrgFilters: true,
    csvName: "team-time-adjust-requests",
    emptyText: "ไม่พบคำขอแก้เวลาของลูกทีม",
    fetchList: (params: Record<string, unknown>) =>
      getManagerTimeAdjust(teamParams(params)),
  },
  offsite: {
    hideOrgFilters: true,
    csvName: "team-offsite-requests",
    emptyText: "ไม่พบคำขอทำงานนอกสถานที่ของลูกทีม",
    fetchList: (params: Record<string, unknown>) =>
      getManagerOffsite(teamParams(params)),
  },
};

export function TeamHistoryPanel({
  initialTab,
  onSummaryChange,
}: {
  /** ลิงก์เก่า /manager/leaves ฯลฯ ส่ง ?type= มาเพื่อเปิดแท็บย่อยให้ตรง */
  initialTab?: string | null;
  onSummaryChange?: (tiles: HistorySummaryTile[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<HistoryKey>(() =>
    TABS.some((tab) => tab.key === initialTab)
      ? (initialTab as HistoryKey)
      : "leaves",
  );
  const [counts, setCounts] = useState<Partial<Record<HistoryKey, number>>>({});

  // ยอดรวมของแต่ละประเภทเอามาโชว์เป็นเลขบนแท็บย่อย (เบา ๆ pageSize=1)
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

  const tabItems: Array<TabItem<HistoryKey>> = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: counts[tab.key],
  }));

  return (
    <ActiveComponent
      override={OVERRIDES[active.key]}
      onSummaryChange={onSummaryChange}
      renderTabBar={(trailing) => (
        <Tabs
          items={tabItems}
          value={activeTab}
          onChange={setActiveTab}
          trailing={trailing}
        />
      )}
    />
  );
}
