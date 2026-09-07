"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Ban,
  Building2,
  CheckCircle2,
  KeyRound,
  Layers,
  Link2,
  ShieldCheck,
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
import { getOrganizationCompanies } from "@/lib/api";

import { RolesPanel, type RolesSummary } from "./_components/roles-panel";
import { UsersPanel, type UsersSummary } from "./_components/users-panel";

/**
 * ผู้ใช้และสิทธิ์
 * --------------
 * รวมหน้า "ผู้ใช้งาน" กับ "โรลและสิทธิ์" ที่เคยแยกกันไว้ในผืนเดียว
 * เพราะสองเรื่องนี้ต้องดูสลับกันตลอด (เพิ่มผู้ใช้ทีก็ต้องรู้ว่ามีโรลอะไรให้เลือก)
 *
 * ตัวเลขสรุปของแต่ละแท็บส่งขึ้นมาจาก panel แล้ววางไว้ข้างหัวเรื่อง
 * ให้ตำแหน่งเดียวกับหน้า /payroll ที่เป็นต้นแบบ
 */

type TabKey = "users" | "roles";

const TABS: Array<TabItem<TabKey>> = [
  { key: "users", label: "ผู้ใช้งาน" },
  { key: "roles", label: "โรลและสิทธิ์" },
];

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function UsersAndRoles() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  // ลิงก์เก่า /roles จะ redirect มาที่ ?tab=roles ให้เปิดแท็บนั้นทันที
  const [tab, setTab] = useState<TabKey>(
    searchParams.get("tab") === "roles" ? "roles" : "users",
  );

  const [usersSummary, setUsersSummary] = useState<UsersSummary | null>(null);
  const [rolesSummary, setRolesSummary] = useState<RolesSummary | null>(null);

  /**
   * ชื่อบริษัทข้างหัวเรื่องเหมือนหน้ารอบจ่ายเงินเดือน
   * บัญชีระดับบริษัท/สาขาใช้ชื่อจาก scope ได้เลย
   * ส่วนผู้ดูแลแพลตฟอร์มไม่มี scope จึงต้องถามรายชื่อบริษัทก่อน
   */
  const [fetchedCompanyLabel, setFetchedCompanyLabel] = useState("");
  const companyLabel = user?.scope?.companyName ?? fetchedCompanyLabel;

  useEffect(() => {
    if (user?.scope?.companyName) return;

    let active = true;
    void getOrganizationCompanies({ pageSize: 100, status: "ACTIVE" })
      .then((result) => {
        if (!active) return;
        const names = result.items.map(
          (company) => company.nameTh || company.nameEn || company.code,
        );
        setFetchedCompanyLabel(
          names.length === 1
            ? names[0]
            : `ทุกบริษัท ${names.length.toLocaleString("th-TH")} แห่ง`,
        );
      })
      .catch(() => {
        // ป้ายบริษัทเป็นข้อมูลประกอบ ถ้าโหลดไม่ได้ก็ไม่ต้องแสดง
      });

    return () => {
      active = false;
    };
  }, [user?.scope?.companyName]);

  return (
    <PageSurface>
      <PageHeading
        heroMotif="access"
        eyebrow="Access Control"
        title="ผู้ใช้และ"
        titleAccent="สิทธิ์"
        description="จัดการบัญชีผู้ใช้ ผูกกับพนักงาน และกำหนดว่าแต่ละบทบาทเข้าถึงอะไรได้บ้าง"
        chips={
          <>
            {companyLabel ? (
              <PageChip tone="brand" icon={<Building2 className="h-3 w-3" />}>
                {companyLabel}
              </PageChip>
            ) : null}
            <PageChip icon={<UserRound className="h-3 w-3" />}>
              บัญชีผู้ใช้ {count(usersSummary?.total ?? 0)}
            </PageChip>
            <PageChip icon={<ShieldCheck className="h-3 w-3" />}>
              บทบาท{" "}
              {count(rolesSummary?.total ?? usersSummary?.totalRoles ?? 0)}
            </PageChip>
          </>
        }
        actions={
          tab === "users" ? (
            <div className={TILE_BOX}>
              <StatTile
                icon={<Users className="h-4 w-4" />}
                label="ผู้ใช้ทั้งหมด"
                value={count(usersSummary?.total ?? 0)}
                helper="บัญชีในระบบ"
              />
              <StatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="กำลังใช้งาน"
                value={count(usersSummary?.active ?? 0)}
                tone="positive"
                helper="เข้าระบบได้ปกติ"
              />
              <StatTile
                icon={<Ban className="h-4 w-4" />}
                label="ถูกระงับ"
                value={count(usersSummary?.suspended ?? 0)}
                tone={
                  (usersSummary?.suspended ?? 0) > 0 ? "warning" : "neutral"
                }
                helper="เข้าระบบไม่ได้"
              />
              <StatTile
                icon={<Link2 className="h-4 w-4" />}
                label="ผูกพนักงานแล้ว"
                value={count(usersSummary?.linked ?? 0)}
                helper={`บทบาทที่เปิดใช้ ${count(usersSummary?.activeRoles ?? 0)}`}
              />
            </div>
          ) : (
            <div className={TILE_BOX}>
              <StatTile
                icon={<ShieldCheck className="h-4 w-4" />}
                label="บทบาททั้งหมด"
                value={count(rolesSummary?.total ?? 0)}
                helper="ในระบบนี้"
              />
              <StatTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="เปิดใช้งาน"
                value={count(rolesSummary?.active ?? 0)}
                tone="positive"
                helper="ใช้งานอยู่จริง"
              />
              <StatTile
                icon={<Layers className="h-4 w-4" />}
                label="แม่แบบระบบ"
                value={count(rolesSummary?.system ?? 0)}
                helper={`ของบริษัท ${count(rolesSummary?.custom ?? 0)}`}
              />
              <StatTile
                icon={<KeyRound className="h-4 w-4" />}
                label="สิทธิ์ที่ผูก"
                value={count(rolesSummary?.assignedPermissions ?? 0)}
                helper="รวมทุกบทบาท"
              />
            </div>
          )
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === "users" ? (
        <UsersPanel onSummaryChange={setUsersSummary} />
      ) : (
        <RolesPanel onSummaryChange={setRolesSummary} />
      )}
    </PageSurface>
  );
}

export default function UsersPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <UsersAndRoles />
    </Suspense>
  );
}
