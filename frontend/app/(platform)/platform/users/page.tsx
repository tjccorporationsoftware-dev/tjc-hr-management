"use client";

import { useState } from "react";
import { Building2, UserRound } from "lucide-react";

import { PageChip, PageHeading, PageSurface, StatTile } from "@/components/kit";

import {
  PlatformUsersPanel,
  type PlatformUsersSummary,
} from "./_components/platform-users-panel";

/**
 * ผู้ใช้งานทั้งระบบ (Platform Console)
 * ===================================
 * เดิมหน้านี้ re-export หน้าเดียวกับพื้นที่บริษัท ทำให้ผู้ดูแลแพลตฟอร์มได้เครื่องมือ
 * ของ HR มาใช้ ซึ่งเห็นบริษัทเดียวและบังคับผูกพนักงานก่อนสร้างบัญชี — บริษัทที่เพิ่ง
 * เปิดยังไม่มีพนักงานสักคน จึงสร้างบัญชีผู้ดูแลคนแรกไม่ได้เลย
 *
 * แยกออกมาเป็นของตัวเองแล้ว: ดูข้ามบริษัท กรองรายบริษัท และเปิดบัญชีผู้ดูแล
 * ให้บริษัทใหม่ได้โดยไม่ต้องมีพนักงาน
 */

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

export default function PlatformUsersPage() {
  const [summary, setSummary] = useState<PlatformUsersSummary | null>(null);

  return (
    <PageSurface>
      <PageHeading
        title="ผู้ใช้งานทั้งระบบ"
        description="ดูบัญชีผู้ใช้ข้ามทุกบริษัท และเปิดบัญชีผู้ดูแลให้บริษัทที่ตั้งใหม่"
        chips={
          <>
            <PageChip tone="brand" icon={<Building2 className="h-3 w-3" />}>
              ทุกบริษัท
            </PageChip>
            <PageChip icon={<UserRound className="h-3 w-3" />}>
              บัญชีผู้ใช้ {count(summary?.total ?? 0)}
            </PageChip>
          </>
        }
        actions={
          <div className={TILE_BOX}>
            <StatTile
              label="บัญชีทั้งหมด"
              value={count(summary?.total ?? 0)}
              helper="ทุกบริษัทรวมกัน"
            />
            <StatTile
              label="กำลังใช้งาน"
              value={count(summary?.active ?? 0)}
              tone="positive"
              helper="เข้าระบบได้ปกติ"
            />
            <StatTile
              label="ถูกระงับ"
              value={count(summary?.suspended ?? 0)}
              tone={(summary?.suspended ?? 0) > 0 ? "warning" : "neutral"}
              helper="เข้าระบบไม่ได้"
            />
            <StatTile
              label="ผู้ดูแลบริษัท"
              value={count(summary?.companyAdmins ?? 0)}
              helper="บัญชีที่ไม่ผูกพนักงาน"
            />
          </div>
        }
      />

      <PlatformUsersPanel onSummaryChange={setSummary} />
    </PageSurface>
  );
}
