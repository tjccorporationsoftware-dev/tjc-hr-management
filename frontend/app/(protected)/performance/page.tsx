"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  Layers,
  PenLine,
  ShieldAlert,
} from "lucide-react";

import {
  PageHeading,
  PageSurface,
  StatTile,
  Tabs,
  type TabItem,
} from "@/components/kit";

import { FormsPanel, type FormsSummary } from "./_components/forms-panel";
import { ResultsPanel, type ResultsSummary } from "./_components/results-panel";
import {
  WarningsPanel,
  type WarningsSummary,
} from "./_components/warnings-panel";

/**
 * ประเมินผลและวินัยพนักงาน
 * -----------------------
 * สามแท็บ: "แบบประเมิน" (แม่แบบถ่วงน้ำหนัก+ผู้ประเมิน), "ผลประเมิน" (บันทึกผลรายคน
 * ร่าง → ส่ง → ปิดผล) และ "หนังสือเตือนและวินัย" (ออกหนังสือเตือน + ประวัติวินัย)
 * แต่ละแท็บโหลดและจัดการข้อมูลของตัวเอง แล้วรายงานตัวเลขสรุปขึ้นมาให้หัวเรื่อง
 * แสดงเป็น StatTile ตามแท็บที่กำลังดูอยู่
 */

type TabKey = "forms" | "results" | "warnings";

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function percent(value: number) {
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}

function PerformanceWorkspace() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return requested === "results" || requested === "warnings"
      ? requested
      : "forms";
  });

  const [formsSummary, setFormsSummary] = useState<FormsSummary | null>(null);
  const [resultsSummary, setResultsSummary] = useState<ResultsSummary | null>(
    null,
  );
  const [warningsSummary, setWarningsSummary] =
    useState<WarningsSummary | null>(null);

  const tabs: Array<TabItem<TabKey>> = [
    { key: "forms", label: "แบบประเมิน", count: formsSummary?.total ?? 0 },
    { key: "results", label: "ผลประเมิน", count: resultsSummary?.total ?? 0 },
    {
      key: "warnings",
      label: "หนังสือเตือนและวินัย",
      count: warningsSummary?.warnings.total ?? 0,
    },
  ];

  return (
    <PageSurface>
      <PageHeading
        heroMotif="performance"
        eyebrow="Performance"
        title="ประเมินผลและ"
        titleAccent="วินัยพนักงาน"
        description="สร้างแบบประเมินถ่วงน้ำหนัก กำหนดผู้ประเมิน บันทึกผลรายรอบ พร้อมออกหนังสือเตือนและเก็บประวัติวินัยไว้ในที่เดียว"
        actions={
          tab === "forms" ? (
            <div className={TILE_BOX}>
              <StatTile
                icon={<Layers className="h-4 w-4" />}
                label="แบบประเมินทั้งหมด"
                value={count(formsSummary?.total ?? 0)}
                helper="ทุกสถานะ"
              />
              <StatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="ใช้งาน"
                value={count(formsSummary?.active ?? 0)}
                tone="positive"
                helper="พร้อมใช้ประเมินพนักงาน"
              />
              <StatTile
                icon={<PenLine className="h-4 w-4" />}
                label="ร่าง"
                value={count(formsSummary?.draft ?? 0)}
                helper="ยังไม่เปิดใช้"
              />
              <StatTile
                icon={<Archive className="h-4 w-4" />}
                label="เก็บถาวร"
                value={count(formsSummary?.archived ?? 0)}
                helper="เลิกใช้แล้ว"
              />
            </div>
          ) : tab === "results" ? (
            <div className={TILE_BOX}>
              <StatTile
                icon={<ClipboardList className="h-4 w-4" />}
                label="ผลประเมินทั้งหมด"
                value={count(resultsSummary?.total ?? 0)}
                helper="ทุกสถานะ"
              />
              <StatTile
                icon={<ClipboardCheck className="h-4 w-4" />}
                label="รอปิดผล"
                value={count(resultsSummary?.submitted ?? 0)}
                tone={(resultsSummary?.submitted ?? 0) > 0 ? "warning" : "neutral"}
                helper="ส่งแล้ว รอ HR ปิดผล"
              />
              <StatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="ปิดผลแล้ว"
                value={count(resultsSummary?.finalized ?? 0)}
                tone="positive"
                helper="สรุปผลเรียบร้อย"
              />
              <StatTile
                icon={<Gauge className="h-4 w-4" />}
                label="คะแนนเฉลี่ย"
                value={percent(resultsSummary?.avgPercent ?? 0)}
                helper="เฉพาะที่ปิดผลแล้ว"
              />
            </div>
          ) : (
            <div className={TILE_BOX}>
              <StatTile
                icon={<FileText className="h-4 w-4" />}
                label="หนังสือเตือนทั้งหมด"
                value={count(warningsSummary?.warnings.total ?? 0)}
                helper="ทุกสถานะ"
              />
              <StatTile
                icon={<AlertTriangle className="h-4 w-4" />}
                label="รอรับทราบ"
                value={count(warningsSummary?.warnings.issued ?? 0)}
                tone={
                  (warningsSummary?.warnings.issued ?? 0) > 0
                    ? "warning"
                    : "neutral"
                }
                helper="ออกแล้วแต่ยังไม่เซ็นรับทราบ"
              />
              <StatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="รับทราบแล้ว"
                value={count(warningsSummary?.warnings.acknowledged ?? 0)}
                tone="positive"
                helper="พนักงานลงชื่อรับทราบแล้ว"
              />
              <StatTile
                icon={<ShieldAlert className="h-4 w-4" />}
                label="ประวัติวินัยทั้งหมด"
                value={count(warningsSummary?.disciplinary.total ?? 0)}
                helper="รวมหนังสือเตือนที่ออกแล้ว"
              />
            </div>
          )
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === "forms" ? <FormsPanel onSummaryChange={setFormsSummary} /> : null}
      {tab === "results" ? (
        <ResultsPanel onSummaryChange={setResultsSummary} />
      ) : null}
      {tab === "warnings" ? (
        <WarningsPanel onSummaryChange={setWarningsSummary} />
      ) : null}
    </PageSurface>
  );
}

export default function PerformancePage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <PerformanceWorkspace />
    </Suspense>
  );
}
