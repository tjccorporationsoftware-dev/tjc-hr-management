"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";

import {
  PageChip,
  PageHeading,
  PageSurface,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { getManagerTeamSummary } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useApiQuery } from "@/lib/use-api";

import { TeamCalendarPanel } from "./_components/calendar-panel";
import { TeamMembersPanel } from "./_components/members-panel";
import { MonthlyPanel } from "./_components/monthly-panel";
import { TodayPanel } from "./_components/today-panel";

/**
 * ทีมของฉัน — หน้าเดียวที่หัวหน้างานใช้ดูแลลูกทีม
 * ------------------------------------------------
 * แบ่งแท็บตามช่วงเวลาที่ต้องตัดสินใจ ไม่ได้แบ่งตามชนิดข้อมูล
 *
 *   วันนี้        ใครมา ใครสาย ใครต้องโทรตาม (เทียบกับกะของแต่ละคน)
 *   ปฏิทินทีม     ใครลาวันไหน ซ้อนกันกี่คน — ดูก่อนกดอนุมัติใบลา
 *   สรุปรายเดือน  สาย/ขาด/OT/ค่าหัก รายคน เทียบกับเดือนก่อน
 *   ลูกทีม        ทะเบียน กะ วันลาคงเหลือ ช่องทางติดต่อ และคนใกล้ครบทดลองงาน
 *
 * การกดอนุมัติจริงอยู่ที่ "คำขอของทีม" (/manager/requests) หน้านี้เป็นที่ "ดู
 * เพื่อให้ตัดสินใจได้" ไม่ใช่ที่ทำงานซ้ำกับศูนย์คำขอ
 */

type TabKey = "today" | "calendar" | "monthly" | "members";

const TABS: Array<TabItem<TabKey>> = [
  { key: "today", label: "วันนี้" },
  { key: "calendar", label: "ปฏิทินทีม" },
  { key: "monthly", label: "สรุปรายเดือน" },
  { key: "members", label: "ลูกทีม" },
];

function ManagerTeamWorkspace() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");

    if (TABS.some((item) => item.key === requested)) return requested as TabKey;

    // ลิงก์เก่า /manager/team?tab=attendance | roster | insights
    if (requested === "attendance") return "today";
    if (requested === "roster") return "members";
    if (requested === "insights") return "monthly";

    return "today";
  });

  /*
   * ดึงสรุปของวันนี้มาโชว์จำนวนลูกทีมบนหัวเรื่อง — ใช้ query key เดียวกับแท็บ
   * "วันนี้" จึงไม่ได้ยิง API เพิ่ม react-query แชร์แคชให้อยู่แล้ว
   */
  const headerQuery = useApiQuery(
    queryKeys.manager.section("team-summary", { date: undefined }),
    () => getManagerTeamSummary({}),
  );

  const teamTotal = headerQuery.data?.today?.teamTotal ?? 0;

  return (
    <PageSurface>
      <PageHeading
        title="ทีมของฉัน"
        description="ดูแลลูกทีมในสายบังคับบัญชาของคุณ — สถานะรายวัน ปฏิทินการลา สรุปเวลาทำงานรายเดือน และข้อมูลรายคน"
        chips={
          <PageChip tone="brand" icon={<Users className="h-3 w-3" />}>
            ลูกทีม {teamTotal.toLocaleString("th-TH")} คน
          </PageChip>
        }
      />

      <Tabs
        className="border-slate-300"
        items={TABS}
        value={tab}
        onChange={setTab}
      />

      {tab === "today" ? <TodayPanel /> : null}
      {tab === "calendar" ? <TeamCalendarPanel /> : null}
      {tab === "monthly" ? <MonthlyPanel /> : null}
      {tab === "members" ? <TeamMembersPanel /> : null}
    </PageSurface>
  );
}

export default function ManagerTeamPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <ManagerTeamWorkspace />
    </Suspense>
  );
}
