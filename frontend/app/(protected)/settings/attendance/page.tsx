"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Fingerprint,
  MapPin,
  MapPinOff,
  Navigation,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";

import {
  PageChip,
  PageHeading,
  PageSurface,
  StatTile,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";

import {
  AttendanceDevicesPanel,
  type DevicesSummary,
} from "./_components/devices-panel";
import {
  AttendanceMethodsPanel,
  type MethodsSummary,
} from "./_components/methods-panel";

/**
 * การลงเวลา
 * ---------
 * รวมสามเรื่องที่เคยแยกเป็นคนละหน้าไว้ด้วยกัน เพราะต้องตั้งค่าไล่กันเป็นชุด:
 * มีเครื่องสแกน → ปักหมุดจุด GPS ของสาขา → แล้วค่อยกำหนดว่าใครลงเวลาด้วยวิธีไหน
 *
 * ตัวเลขสรุปของแต่ละแท็บส่งขึ้นมาจาก panel แล้ววางข้างหัวเรื่อง
 * ตำแหน่งเดียวกับหน้า /payroll และ /users
 */

type TabKey = "devices" | "locations" | "methods";

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function AttendanceSettings() {
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

  // แท็บวิธีลงเวลาบันทึกผ่าน PATCH /employees/:id จึงต้องมี EMPLOYEE_UPDATE ด้วย
  const canSeeMethods =
    permissionSet.has("EMPLOYEE_UPDATE") &&
    permissionSet.has("ATTENDANCE_READ");

  const tabs: Array<TabItem<TabKey>> = [
    ...(canSeeMethods
      ? [{ key: "methods" as const, label: "วิธีลงเวลารายพนักงาน" }]
      : []),
    { key: "devices", label: "เครื่องสแกน / อุปกรณ์" },
    { key: "locations", label: "จุดลงเวลา GPS" },
  ];

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    if (tabs.some((item) => item.key === requested)) {
      return requested as TabKey;
    }

    /* ไม่มีสิทธิ์ดูแท็บวิธีลงเวลา ก็ตกไปที่แท็บแรกที่เหลือ */
    return canSeeMethods ? "methods" : "devices";
  });

  const [devicesSummary, setDevicesSummary] = useState<DevicesSummary | null>(
    null,
  );
  const [methodsSummary, setMethodsSummary] = useState<MethodsSummary | null>(
    null,
  );

  return (
    <PageSurface className="xl:overflow-visible">
      <PageHeading
        heroMotif="attendance"
        eyebrow="Attendance Setup"
        title="การ"
        titleAccent="ลงเวลา"
        description="ตั้งค่าเครื่องสแกน จุดลงเวลา GPS และกำหนดว่าพนักงานแต่ละคนลงเวลาด้วยวิธีใด"
        chips={
          <>
            <PageChip tone="brand" icon={<Fingerprint className="h-3 w-3" />}>
              อุปกรณ์ {count(devicesSummary?.devices ?? 0)}
            </PageChip>
            <PageChip icon={<MapPin className="h-3 w-3" />}>
              จุด GPS {count(devicesSummary?.locations ?? 0)}
            </PageChip>
            {canSeeMethods ? (
              <PageChip icon={<UserRound className="h-3 w-3" />}>
                พนักงาน {count(methodsSummary?.total ?? 0)}
              </PageChip>
            ) : null}
          </>
        }
        actions={
          tab === "methods" ? (
            <div className={TILE_BOX}>
              <StatTile
                icon={<Users className="h-4 w-4" />}
                label="พนักงานทั้งหมด"
                value={count(methodsSummary?.total ?? 0)}
                helper="เฉพาะคนที่ยังทำงานอยู่"
              />
              <StatTile
                icon={<Building2 className="h-4 w-4" />}
                label="ประจำออฟฟิศ"
                value={count(methodsSummary?.office ?? 0)}
                helper="ต้องอยู่ในรัศมีจุดลงเวลา"
              />
              <StatTile
                icon={<Navigation className="h-4 w-4" />}
                label="ออกนอกสถานที่"
                value={count(methodsSummary?.field ?? 0)}
                helper="ลงเวลาได้ทุกที่ แต่ยังเก็บพิกัด"
              />
              <StatTile
                icon={<MapPinOff className="h-4 w-4" />}
                label="สาขายังไม่มีจุด GPS"
                value={count(methodsSummary?.gap ?? 0)}
                tone={(methodsSummary?.gap ?? 0) > 0 ? "warning" : "positive"}
                helper="บังคับพื้นที่แต่ตรวจระยะไม่ได้"
              />
            </div>
          ) : (
            <div className={TILE_BOX}>
              <StatTile
                icon={<Fingerprint className="h-4 w-4" />}
                label="เครื่องสแกน"
                value={count(devicesSummary?.scanners ?? 0)}
                helper={`จากอุปกรณ์ ${count(devicesSummary?.devices ?? 0)} เครื่อง`}
              />
              <StatTile
                icon={<UserRound className="h-4 w-4" />}
                label="พนักงานที่ผูกรหัส"
                value={count(devicesSummary?.enrolled ?? 0)}
                helper="รวมทุกเครื่อง"
              />
              <StatTile
                icon={<MapPin className="h-4 w-4" />}
                label="จุดลงเวลา GPS"
                value={count(devicesSummary?.locations ?? 0)}
                helper="ใช้ตรวจพิกัดตอนลงเวลา"
              />
              <StatTile
                icon={<RefreshCw className="h-4 w-4" />}
                label="เครื่องที่เคยซิงก์"
                value={count(devicesSummary?.synced ?? 0)}
                tone={
                  (devicesSummary?.synced ?? 0) > 0 ? "positive" : "neutral"
                }
                helper="เคยส่งข้อมูลเข้าระบบ"
              />
            </div>
          )
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === "methods" ? (
        <AttendanceMethodsPanel onSummaryChange={setMethodsSummary} />
      ) : (
        // สองแท็บแรกใช้ข้อมูลชุดเดียวกัน จึงเป็น panel เดียวที่รับแท็บเข้าไป
        <AttendanceDevicesPanel
          activeTab={tab}
          onSummaryChange={setDevicesSummary}
        />
      )}
    </PageSurface>
  );
}

export default function AttendanceSettingsPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <AttendanceSettings />
    </Suspense>
  );
}
