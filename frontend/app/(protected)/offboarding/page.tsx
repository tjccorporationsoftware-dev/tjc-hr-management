"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Layers,
  ShieldOff,
  UserMinus,
  XCircle,
} from "lucide-react";

import { PageHeading, PageSurface, StatTile, Tabs, type TabItem } from "@/components/kit";

import { CasesPanel, type CasesSummary } from "./_components/cases-panel";
import {
  ChecklistsPanel,
  type ChecklistsSummary,
} from "./_components/checklists-panel";

/**
 * พนักงานออกจากงาน
 * -----------------
 * สองแท็บ: "พนักงานที่กำลังออก" (เคสรายคน) และ "เช็กลิสต์เคลียร์ของ" (แม่แบบ)
 * แต่ละแท็บโหลดและจัดการข้อมูลของตัวเอง แล้วรายงานตัวเลขสรุปขึ้นมาให้หัวเรื่อง
 * แสดงเป็น StatTile ตามแท็บที่กำลังดูอยู่
 */

type TabKey = "cases" | "checklists";

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

export default function OffboardingPage() {
  const [tab, setTab] = useState<TabKey>("cases");
  const [casesSummary, setCasesSummary] = useState<CasesSummary | null>(null);
  const [checklistsSummary, setChecklistsSummary] =
    useState<ChecklistsSummary | null>(null);

  const tabs: Array<TabItem<TabKey>> = [
    { key: "cases", label: "พนักงานที่กำลังออก", count: casesSummary?.inProgress ?? 0 },
    { key: "checklists", label: "เช็กลิสต์เคลียร์ของ", count: checklistsSummary?.total ?? 0 },
  ];

  return (
    <PageSurface>
      <PageHeading
        heroMotif="offboarding"
        eyebrow="Offboarding"
        title="พนักงาน"
        titleAccent="ออกจากงาน"
        description="คุมการคืนของ ปิดสิทธิ์ระบบ ส่งมอบงาน สัมภาษณ์ลาออก และเงินงวดสุดท้าย ให้ครบก่อนพนักงานพ้นสภาพ"
        actions={
          tab === "checklists" ? (
            <div className={TILE_BOX}>
              <StatTile
                icon={<Layers className="h-4 w-4" />}
                label="เช็กลิสต์ทั้งหมด"
                value={count(checklistsSummary?.total ?? 0)}
                helper="ทุกสถานะ"
              />
              <StatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="เปิดใช้งาน"
                value={count(checklistsSummary?.active ?? 0)}
                tone="positive"
                helper="พร้อมใช้กับเคสใหม่"
              />
              <StatTile
                icon={<XCircle className="h-4 w-4" />}
                label="ปิดใช้งาน"
                value={count(checklistsSummary?.inactive ?? 0)}
                helper="ไม่ถูกเลือกใช้แล้ว"
              />
            </div>
          ) : (
            <div className={TILE_BOX}>
              <StatTile
                icon={<UserMinus className="h-4 w-4" />}
                label="กำลังดำเนินการ"
                value={count(casesSummary?.inProgress ?? 0)}
                helper="ยังเคลียร์ไม่ครบ"
              />
              <StatTile
                icon={<ShieldOff className="h-4 w-4" />}
                label="ยังไม่ปิดสิทธิ์"
                value={count(casesSummary?.accessPending ?? 0)}
                tone={(casesSummary?.accessPending ?? 0) > 0 ? "warning" : "neutral"}
                helper="เลยวันพ้นสภาพแล้วแต่ยัง login ได้"
              />
              <StatTile
                icon={<ClipboardList className="h-4 w-4" />}
                label="ปิดเคสแล้ว"
                value={count(casesSummary?.completed ?? 0)}
                tone="positive"
                helper="เคลียร์ครบเรียบร้อย"
              />
              <StatTile
                icon={<XCircle className="h-4 w-4" />}
                label="ยกเลิก"
                value={count(casesSummary?.cancelled ?? 0)}
                helper="เคสที่ถูกยกเลิก"
              />
            </div>
          )
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === "cases" ? <CasesPanel onSummaryChange={setCasesSummary} /> : null}
      {tab === "checklists" ? (
        <ChecklistsPanel onSummaryChange={setChecklistsSummary} />
      ) : null}
    </PageSurface>
  );
}
