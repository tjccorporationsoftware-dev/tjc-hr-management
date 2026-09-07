"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Inbox,
  Loader2,
  MessageSquareWarning,
  Clock,
} from "lucide-react";

import {
  PageHeading,
  PageSurface,
  StatTile,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";

import {
  ComplaintsPanel,
  type ComplaintsSummary,
} from "./_components/complaints-panel";
import {
  DocumentRequestsPanel,
  type DocumentsSummary,
} from "./_components/document-requests-panel";

/**
 * ศูนย์บริการพนักงาน
 * ------------------
 * รวมสองเรื่องที่เคยแยกเป็นคนละหน้าไว้ด้วยกัน: ศูนย์ออกหนังสือรับรอง (/documents เดิม)
 * และเรื่องร้องเรียน/ข้อเสนอแนะ (/complaints เดิม) เพราะทั้งคู่คืองาน "รับคำขอจาก
 * พนักงานแล้วดำเนินการตามลำดับขั้น" แบบเดียวกัน ต่างกันแค่ประเภทคำขอ
 *
 * แท็บ "หนังสือรับรอง" ต้องมี DOCUMENT_READ ส่วนแท็บ "เรื่องร้องเรียน" ต้องมี
 * COMPLAINT_READ — ผู้ใช้ที่มีสิทธิ์อย่างใดอย่างหนึ่งเข้าหน้านี้ได้ และเห็นเฉพาะแท็บที่มีสิทธิ์
 */

type TabKey = "documents" | "complaints";

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function DocumentsWorkspace() {
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

  const canSeeDocuments = permissionSet.has("DOCUMENT_READ");
  const canSeeComplaints = permissionSet.has("COMPLAINT_READ");

  const tabs: Array<TabItem<TabKey>> = [
    ...(canSeeDocuments
      ? [{ key: "documents" as const, label: "หนังสือรับรอง" }]
      : []),
    ...(canSeeComplaints
      ? [{ key: "complaints" as const, label: "เรื่องร้องเรียน" }]
      : []),
  ];

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return tabs.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "documents";
  });

  const [documentsSummary, setDocumentsSummary] =
    useState<DocumentsSummary | null>(null);
  const [complaintsSummary, setComplaintsSummary] =
    useState<ComplaintsSummary | null>(null);

  const activeTab = tabs.some((item) => item.key === tab)
    ? tab
    : (tabs[0]?.key ?? "documents");

  function renderTabBar(trailing: ReactNode) {
    return (
      <Tabs
        items={tabs}
        value={activeTab}
        onChange={setTab}
        trailing={trailing}
      />
    );
  }

  return (
    <PageSurface>
      <PageHeading
        heroMotif="documents"
        eyebrow="Employee Services"
        title="ศูนย์บริการ"
        titleAccent="พนักงาน"
        description="รับคำขอเอกสาร อนุมัติตามลำดับชั้น ออกไฟล์ PDF และรับ-ติดตามเรื่องร้องเรียนของพนักงานจากที่เดียว"
        actions={
          activeTab === "complaints" ? (
            <div className={TILE_BOX}>
              <StatTile
                icon={<MessageSquareWarning className="h-4 w-4" />}
                label="เรื่องทั้งหมด"
                value={count(complaintsSummary?.total ?? 0)}
                helper="ตามสิทธิ์ที่เห็น"
              />
              <StatTile
                icon={<Inbox className="h-4 w-4" />}
                label="รอรับเรื่อง"
                value={count(complaintsSummary?.open ?? 0)}
                tone={
                  (complaintsSummary?.open ?? 0) > 0 ? "warning" : "neutral"
                }
                helper="ยังไม่มีผู้รับผิดชอบ"
              />
              <StatTile
                icon={<Loader2 className="h-4 w-4" />}
                label="กำลังดำเนินการ"
                value={count(complaintsSummary?.inProgress ?? 0)}
                helper="อยู่ระหว่างสอบข้อเท็จจริง"
              />
              <StatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="ดำเนินการแล้ว"
                value={count(complaintsSummary?.resolved ?? 0)}
                tone="positive"
                helper="บันทึกผลหรือปิดเรื่องแล้ว"
              />
            </div>
          ) : (
            <div className={TILE_BOX}>
              <StatTile
                icon={<ClipboardList className="h-4 w-4" />}
                label="คำขอทั้งหมด"
                value={count(documentsSummary?.total ?? 0)}
                helper="คำขอเอกสารทั้งหมด"
              />
              <StatTile
                icon={<Clock className="h-4 w-4" />}
                label="รออนุมัติ"
                value={count(documentsSummary?.submitted ?? 0)}
                tone={
                  (documentsSummary?.submitted ?? 0) > 0 ? "warning" : "neutral"
                }
                helper="รอ HR อนุมัติ"
              />
              <StatTile
                icon={<FileCheck2 className="h-4 w-4" />}
                label="อนุมัติแล้ว"
                value={count(documentsSummary?.approved ?? 0)}
                tone="positive"
                helper="พร้อมออก PDF"
              />
              <StatTile
                icon={<Ban className="h-4 w-4" />}
                label="ไม่อนุมัติ / ยกเลิก"
                value={count(documentsSummary?.rejectedCancelled ?? 0)}
                helper="ถูกปฏิเสธหรือยกเลิก"
              />
            </div>
          )
        }
      />

      {/*
       * แถบแท็บวาดโดยแผงที่เปิดอยู่ ไม่ใช่หน้านี้ — แผงจะได้ส่งช่องค้นหาและปุ่ม
       * ของตัวเองไปวางท้ายแถวเดียวกับแท็บ เหมือนหน้า /approvals
       * ถ้าไม่มีแผงไหนเปิดได้ (สิทธิ์ไม่ถึง) ก็ยังต้องมีแถบแท็บให้เห็น
       */}
      {activeTab === "documents" && canSeeDocuments ? (
        <DocumentRequestsPanel
          onSummaryChange={setDocumentsSummary}
          renderTabBar={renderTabBar}
        />
      ) : activeTab === "complaints" && canSeeComplaints ? (
        <ComplaintsPanel
          onSummaryChange={setComplaintsSummary}
          renderTabBar={renderTabBar}
        />
      ) : (
        renderTabBar(null)
      )}
    </PageSurface>
  );
}

export default function DocumentsPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <DocumentsWorkspace />
    </Suspense>
  );
}
