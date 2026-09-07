"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock3, Fingerprint } from "lucide-react";

import {
  PageChip,
  PageHeading,
  PageSurface,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";

import { CheckInPanel } from "./_components/check-in-panel";
import { AttendanceHistoryPanel } from "./_components/history-panel";

/**
 * ลงเวลา (พนักงาน)
 * ----------------
 * รวม "ลงเวลาวันนี้" กับ "ประวัติลงเวลาของฉัน" ไว้หน้าเดียว
 * เพราะเป็นเรื่องเดียวกัน — กดลงเวลาเสร็จก็มักอยากเช็คย้อนหลังต่อทันที
 */

type TabKey = "today" | "history";

function EssAttendance() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  // ปุ่มลงเวลาต้องมีสิทธิ์ ATTENDANCE_CHECKIN ส่วนประวัติดูได้ด้วย ESS_ACCESS
  const canCheckIn = (user?.permissions ?? []).some(
    (permission) => permission.trim().toUpperCase() === "ATTENDANCE_CHECKIN",
  );

  const tabs: Array<TabItem<TabKey>> = useMemo(
    () => [
      ...(canCheckIn ? [{ key: "today" as const, label: "ลงเวลาวันนี้" }] : []),
      { key: "history" as const, label: "ประวัติของฉัน" },
    ],
    [canCheckIn],
  );

  // ลิงก์เก่า /ess/my-attendance จะ redirect มาที่ ?tab=history
  const [tab, setTab] = useState<TabKey>(() =>
    searchParams.get("tab") === "history" || !canCheckIn ? "history" : "today",
  );

  return (
    <PageSurface>
      <PageHeading
        heroMotif="attendance"
        eyebrow="Attendance"
        title="ลงเวลา"
        titleAccent="ของฉัน"
        description="กดลงเวลาเข้า–ออกงานประจำวัน และย้อนดูประวัติการลงเวลาของตัวเอง"
        chips={
          <>
            <PageChip tone="brand" icon={<Fingerprint className="h-3 w-3" />}>
              ลงเวลาวันนี้
            </PageChip>
            <PageChip icon={<Clock3 className="h-3 w-3" />}>
              ประวัติย้อนหลัง
            </PageChip>
          </>
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === "today" && canCheckIn ? (
        <CheckInPanel />
      ) : (
        <AttendanceHistoryPanel />
      )}
    </PageSurface>
  );
}

export default function EssCheckInPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <EssAttendance />
    </Suspense>
  );
}
