"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  FileText,
  ListChecks,
  Megaphone,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

import {
  PageHeading,
  PageSurface,
  StatTile,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";

import { RecruitmentPanel } from "./_components/recruitment-panel";
import type { RecruitmentSummary } from "./_components/recruitment-shared";
import {
  OnboardingPanel,
  type OnboardingSummary,
} from "./_components/onboarding-panel";
import { ProgressPanel } from "./_components/progress-panel";
import { WelcomeTaskPanel } from "./_components/welcome-task-panel";
import type { OnboardingProgressSummary } from "@/types/onboarding";

/**
 * รับพนักงานใหม่
 * ---------------
 * รวมสองเรื่องที่เคยแยกเป็นคนละหน้าไว้ด้วยกัน: สรรหาบุคลากร (/recruitment เดิม)
 * และเริ่มงานพนักงานใหม่ (/onboarding เดิม) เพราะกระบวนการต่อเนื่องกันโดยตรง —
 * สรรหาจนถึงขั้น "จ้าง" แล้วเปิดใบทดลองงานให้ทันที ต่อด้วยเช็กลิสต์/งาน/เอกสาร
 * ต้อนรับ และติดตามผลทดลองงานจนจบกระบวนการ
 *
 * แท็บเรียงตามลำดับกระบวนการจริงและใส่เลขขั้นกำกับ — เดิมเรียงตาม "ชนิดข้อมูล"
 * (ผู้สมัคร ก่อน ประกาศรับสมัคร ทั้งที่ต้องมีประกาศก่อนถึงจะมีผู้สมัคร) และเอา
 * "เช็กลิสต์" ซึ่งเป็นข้อมูลตั้งต้นมาแทรกกลางกระบวนการ จึงไม่รู้สึกว่าเป็นลำดับขั้น
 *
 * "เช็กลิสต์" ย้ายไปท้ายสุดและไม่ใส่เลขขั้น เพราะเป็นการตั้งค่า ไม่ใช่ขั้นตอนที่ต้องเดินผ่าน
 *
 * แท็บ "ประกาศรับสมัคร" ต้องมี RECRUITMENT_READ หรือ RECRUITMENT_MANAGE
 * แท็บ "เช็กลิสต์"/"งานที่ต้องทำ"/"เอกสารพนักงานใหม่"/"ทดลองงาน" ต้องมี
 * ONBOARDING_READ หรือ ONBOARDING_MANAGE — ผู้ใช้ที่มีสิทธิ์อย่างใดอย่างหนึ่งเข้า
 * หน้านี้ได้ และเห็นเฉพาะกลุ่มแท็บที่มีสิทธิ์
 *
 * ทดลองงานที่ใกล้ครบกำหนดต้องรีวิวก่อนครบ 120 วัน ไม่งั้นกลายเป็นพนักงานประจำ
 * อัตโนมัติ (ดูค่าคงที่ PROBATION_REVIEW_LEAD_DAYS ใน onboarding-panel.tsx)
 */

type TabKey =
  | "postings"
  | "progress"
  | "tasks"
  | "documents"
  | "probations"
  | "checklists";

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function OnboardingWorkspace() {
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

  const canSeeRecruitment =
    permissionSet.has("RECRUITMENT_READ") ||
    permissionSet.has("RECRUITMENT_MANAGE");
  const canSeeOnboarding =
    permissionSet.has("ONBOARDING_READ") ||
    permissionSet.has("ONBOARDING_MANAGE");

  const [recruitmentSummary, setRecruitmentSummary] =
    useState<RecruitmentSummary | null>(null);
  const [onboardingSummary, setOnboardingSummary] =
    useState<OnboardingSummary | null>(null);
  const [progressSummary, setProgressSummary] =
    useState<OnboardingProgressSummary | null>(null);

  /*
   * ลำดับแท็บ = ลำดับกระบวนการจริง
   * ประกาศรับสมัคร → พนักงานใหม่ (ภาพรวมรายคน) → งานต้อนรับ
   * แล้วปิดท้ายด้วยการตั้งค่าเช็กลิสต์
   *
   * "ผู้สมัคร" ไม่มีแท็บของตัวเองแล้ว — ผู้สมัครเป็นของประกาศใบใดใบหนึ่งเสมอ
   * จึงย้ายเข้าไปอยู่ในกล่องรายละเอียดของประกาศนั้น ทั้งการดูรายชื่อและการเพิ่มคน
   * เดิมต้องสลับมาแท็บนี้แล้วเลือกประกาศจากดรอปดาวน์เอง ซึ่งเลือกผิดใบได้ง่าย
   *
   * "เอกสาร" กับ "ทดลองงาน" ไม่มีแท็บของตัวเองแล้วเช่นกัน — ย้ายเข้าไปอยู่ในป๊อปอัพ
   * ของแท็บพนักงานใหม่ เพราะเป็นเรื่องรายคน ดูรวมทั้งบริษัทแล้วก็ต้องมาไล่หาชื่ออยู่ดี
   *
   * ไม่ใส่เลขขั้นในชื่อแท็บ — ลำดับซ้าย-ขวาบอกอยู่แล้ว ใส่เลขซ้ำอีกทำให้แถบแท็บรก
   * ส่วนเลขขั้นรายคน (ขั้น 1/4) ไปอยู่ในแท็บ "พนักงานใหม่" ซึ่งเป็นที่ที่ต้องใช้จริง
   */
  const tabs: Array<TabItem<TabKey>> = [
    ...(canSeeRecruitment
      ? [{ key: "postings" as const, label: "ประกาศรับสมัคร" }]
      : []),
    ...(canSeeOnboarding
      ? [
          {
            key: "progress" as const,
            label: "พนักงานใหม่",
            count: progressSummary?.total,
          },
          { key: "tasks" as const, label: "งานต้อนรับ" },
          { key: "checklists" as const, label: "ตั้งค่าเช็กลิสต์" },
        ]
      : []),
  ];

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    // เปิดมาที่ภาพรวมรายคน ไม่ใช่ข้อมูลตั้งต้นอย่างเช็กลิสต์
    return tabs.some((item) => item.key === requested)
      ? (requested as TabKey)
      : "progress";
  });

  const activeTab = tabs.some((item) => item.key === tab)
    ? tab
    : (tabs[0]?.key ?? "progress");


  const isRecruitmentTab = activeTab === "postings";
  const isProgressTab = activeTab === "progress";
  const isTaskTab = activeTab === "tasks";

  const probationAlertCount =
    (onboardingSummary?.probations.dueSoon ?? 0) +
    (onboardingSummary?.probations.overdue ?? 0);

  return (
    <PageSurface>
      <PageHeading
        heroMotif="onboarding"
        eyebrow="Onboarding"
        title="รับพนักงาน"
        titleAccent="ใหม่"
        description="ประกาศรับสมัคร คัดกรองผู้สมัคร สัมภาษณ์ เสนอจ้าง และแปลงเป็นพนักงาน ต่อด้วยเช็กลิสต์ต้อนรับ งานที่ต้องทำ เอกสารพนักงานใหม่ และติดตามผลทดลองงาน ครบในที่เดียว"
        actions={
          isProgressTab ? (
            <div className={TILE_BOX}>
              <StatTile
                icon={<Users className="h-4 w-4" />}
                label="อยู่ในกระบวนการ"
                value={count(progressSummary?.total ?? 0)}
                helper="พนักงานใหม่ทั้งหมดที่ติดตามอยู่"
              />
              <StatTile
                icon={<ListChecks className="h-4 w-4" />}
                label="ค้างขั้นงานต้อนรับ"
                value={count(progressSummary?.tasksStage ?? 0)}
                tone={(progressSummary?.tasksStage ?? 0) > 0 ? "warning" : "neutral"}
                helper="ยังทำงานต้อนรับไม่ครบ"
              />
              <StatTile
                icon={<FileText className="h-4 w-4" />}
                label="ค้างขั้นเอกสาร"
                value={count(progressSummary?.documentsStage ?? 0)}
                tone={
                  (progressSummary?.documentsStage ?? 0) > 0 ? "warning" : "neutral"
                }
                helper="ยังส่งหรือตรวจเอกสารไม่ครบ"
              />
              <StatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="จบกระบวนการ"
                value={count(progressSummary?.done ?? 0)}
                tone="positive"
                helper="ครบทุกขั้นแล้ว"
              />
            </div>
          ) : isRecruitmentTab ? (
            <div className={TILE_BOX}>
              <StatTile
                icon={<Megaphone className="h-4 w-4" />}
                label="เปิดรับ"
                value={count(recruitmentSummary?.postings.open ?? 0)}
                helper="ตำแหน่งที่เปิดรับสมัคร"
              />
              <StatTile
                icon={<UserPlus className="h-4 w-4" />}
                label="ผู้สมัครใหม่"
                value={count(recruitmentSummary?.applications.new ?? 0)}
                helper="ยังไม่ได้คัดกรอง"
              />
              <StatTile
                icon={<CalendarClock className="h-4 w-4" />}
                label="รอสัมภาษณ์"
                value={count(recruitmentSummary?.applications.interview ?? 0)}
                tone={
                  (recruitmentSummary?.applications.interview ?? 0) > 0
                    ? "warning"
                    : "neutral"
                }
                helper="นัดแล้วหรือกำลังสัมภาษณ์"
              />
              <StatTile
                icon={<UserCheck className="h-4 w-4" />}
                label="จ้างแล้ว"
                value={count(recruitmentSummary?.applications.hired ?? 0)}
                tone="positive"
                helper="เข้าเป็นพนักงานเรียบร้อย"
              />
            </div>
          ) : (
            <div className={TILE_BOX}>
              <StatTile
                icon={<ClipboardList className="h-4 w-4" />}
                label="เช็กลิสต์"
                value={count(onboardingSummary?.checklists.total ?? 0)}
                helper={`เปิดใช้งาน ${count(onboardingSummary?.checklists.active ?? 0)}`}
              />
              <StatTile
                icon={<AlertTriangle className="h-4 w-4" />}
                label="งานเกินกำหนด"
                value={count(onboardingSummary?.tasks.overdue ?? 0)}
                tone={
                  (onboardingSummary?.tasks.overdue ?? 0) > 0
                    ? "warning"
                    : "neutral"
                }
                helper="งานต้อนรับที่เลยกำหนดยังไม่เสร็จ"
              />
              <StatTile
                icon={<FileSearch className="h-4 w-4" />}
                label="เอกสารรอตรวจ"
                value={count(onboardingSummary?.documents.submitted ?? 0)}
                tone={
                  (onboardingSummary?.documents.submitted ?? 0) > 0
                    ? "warning"
                    : "neutral"
                }
                helper="พนักงานส่งแล้ว รอ HR ตรวจ"
              />
              <StatTile
                icon={<CalendarCheck className="h-4 w-4" />}
                label="ทดลองงานต้องรีวิว"
                value={count(probationAlertCount)}
                tone={probationAlertCount > 0 ? "warning" : "neutral"}
                helper={`อยู่ระหว่างทดลองงาน ${count(onboardingSummary?.probations.inProgress ?? 0)} คน`}
              />
            </div>
          )
        }
      />

      <Tabs items={tabs} value={activeTab} onChange={setTab} />

      {isRecruitmentTab && canSeeRecruitment ? (
        <RecruitmentPanel onSummaryChange={setRecruitmentSummary} />
      ) : null}

      {isProgressTab && canSeeOnboarding ? (
        <ProgressPanel onSummaryChange={setProgressSummary} />
      ) : null}

      {isTaskTab && canSeeOnboarding ? <WelcomeTaskPanel /> : null}

      {!isRecruitmentTab && !isProgressTab && !isTaskTab && canSeeOnboarding ? (
        <OnboardingPanel
          activeTab={
            activeTab as "checklists" | "tasks" | "documents" | "probations"
          }
          onSummaryChange={setOnboardingSummary}
        />
      ) : null}
    </PageSurface>
  );
}

export default function OnboardingPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <OnboardingWorkspace />
    </Suspense>
  );
}
