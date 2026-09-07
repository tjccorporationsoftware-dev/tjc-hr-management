"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { NotificationBell } from "./notification-bell";
import { getMyProfile, getPublicFileUrl } from "@/lib/api";
import { Avatar } from "@/components/kit";
import {
  getBranchLabel,
  getCompanyLabel,
  getPrimaryRoleLabel,
} from "@/lib/user-identity";
import type { MyProfileResponse } from "@/types/profile";

type TopbarProps = {
  onOpenMobileSidebar?: () => void;
};

/**
 * แถบบนสุด
 * --------
 * โทนเดียวกับผืนขาวของหน้า (/payroll): แบน ไม่มีเงา ไม่มีมุมโค้งใหญ่
 * ตัดกับพื้นแอปด้วยเส้น `slate-300` เส้นเดียวเหมือนหัวเรื่องของหน้า
 *
 * ฝั่งซ้ายบอก "บริบทของ session" คือบริษัทที่สังกัดกับโรลที่เข้ามาใช้งาน
 * ไม่ใช่ชื่อหน้าปัจจุบัน เพราะทุกหน้ามี `PageHeading` บอกชื่อหน้าอยู่แล้ว
 *
 * ชื่อโรลดึงจาก `/profile/me` (ชื่อจริงในตารางสิทธิ์) ไม่ใช่คำที่หน้าเว็บแปลเอง
 * ผู้ดูแลเปลี่ยนชื่อโรลหรือสร้างโรลใหม่เมื่อไร แถบนี้ก็เปลี่ยนตามทันที
 */
export function Topbar({ onOpenMobileSidebar }: TopbarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [profileFailed, setProfileFailed] = useState(false);

  const companyName = getCompanyLabel(user);
  const branchName = getBranchLabel(user);
  const displayName = user?.displayName ?? "ผู้ใช้งาน";

  /*
   * ระหว่างรอ /profile/me ยังไม่รู้ชื่อโรลจริง จึงเว้นว่างไว้ก่อน
   * ถ้าเรียกไม่สำเร็จค่อยถอยไปใช้โค้ดโรลจาก token แปลงเป็นคำไทย
   */
  const roleLabel = profile
    ? getPrimaryRoleLabel(profile.user.roles)
    : profileFailed
      ? getPrimaryRoleLabel(user?.roles)
      : null;

  const avatarUrl = useMemo(() => {
    return getPublicFileUrl(profile?.user.avatarUrl || user?.avatarUrl || null);
  }, [profile?.user.avatarUrl, user?.avatarUrl]);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        const result = await getMyProfile();

        if (!mounted) return;

        setProfile(result);
        setProfileFailed(false);
      } catch {
        if (!mounted) return;

        setProfileFailed(true);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [user?.avatarUrl, user?.id]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 h-20 border-b border-slate-300 bg-white">
      {/* ระยะขอบเท่ากับ <main> ใน app-shell ชื่อบริษัทจะได้ตรงกับขอบผืนขาวของหน้า */}
      <div className="flex h-full w-full items-center justify-between gap-4 px-3 sm:px-5 lg:px-6 2xl:px-8 3xl:px-9 4xl:px-12">
        <div className="flex min-w-0 items-center gap-3 3xl:gap-4">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 lg:hidden"
            aria-label="เปิดเมนู"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/*
            โครงเดียวกับหัวเรื่องของทุกหน้า (PageHeading แบบมี eyebrow):
            บรรทัดบนเป็นป้ายฟ้าตัวเล็กบอกบริบท บรรทัดล่างเป็นชื่อจริงปิดท้ายด้วยจุดสีแบรนด์
            ของเดิมเป็นขีดตั้งหน้าชื่อ ซึ่งเป็นโทนของหัวเรื่องแบบเก่าที่เลิกใช้ไปแล้ว
          */}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.16em] text-brand-600">
              Workspace <span className="text-brand-300">•</span>
            </p>

            <h1 className="mt-1 truncate text-[19px] font-bold leading-tight tracking-tight text-slate-950 3xl:text-[21px] 4xl:text-[22px]">
              {companyName}
              <span className="text-brand-600">.</span>
            </h1>
          </div>

          {roleLabel ? (
            <span className="hidden shrink-0 items-center rounded-full bg-brand-50 px-3 py-1.5 text-[12px] font-semibold leading-none text-brand-700 sm:inline-flex 3xl:text-[12.5px] 4xl:text-[13px]">
              {roleLabel}
            </span>
          ) : null}

          {branchName ? (
            <span className="hidden min-w-0 items-center gap-3 lg:flex">
              <span className="h-4 w-px shrink-0 bg-slate-200" />
              <span className="truncate text-[12.5px] text-slate-500 3xl:text-[13px]">
                {branchName}
              </span>
            </span>
          ) : null}
        </div>

        {/*
          ระยะทุกค่าในกลุ่มนี้ใช้ตัวคูณของ 4px — ที่ซูม 125% (ที่ใช้กันบ่อยบนโน้ตบุ๊ก)
          ค่า 2px/14px จะตกลงบนครึ่งพิกเซลจริง แล้วเบราว์เซอร์จะรีแซมเปิลรูปโปรไฟล์
          จนดูเบลอ ทั้งที่ไฟล์ยังเป็นไฟล์เดิม
        */}
        <div className="flex shrink-0 items-center gap-2 3xl:gap-3">
          <NotificationBell />

          {/*
            ชิปโปรไฟล์เป็นแคปซูล ชุดเดียวกับแท็บและป้ายบริบทในหน้าอื่น
            ชื่อผู้ใช้เป็นตัวหนา อีเมลอยู่ใน title ไม่ต้องเขียนซ้ำในแถบ
          */}
          <Link
            href="/ess/my-profile"
            title={user?.email ?? undefined}
            className="hidden h-10 items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-4 transition hover:border-brand-300 hover:bg-brand-50 md:flex"
          >
            <Avatar name={displayName} src={avatarUrl} size="sm" />

            <span className="max-w-50 truncate text-[13.5px] font-semibold text-slate-700 3xl:max-w-60 3xl:text-[14px]">
              {displayName}
            </span>
          </Link>

          <Link
            href="/ess/my-profile"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:border-brand-300 md:hidden"
            aria-label="โปรไฟล์"
          >
            <Avatar name={displayName} src={avatarUrl} size="sm" />
          </Link>

          {/*
            เขียนปุ่มเองเพราะแถบนี้ใช้คอนโทรลสูง 40px ทั้งแถว (สูงกว่าปุ่มมาตรฐาน
            ในหน้าเนื้อหา) ถ้าเอา `Button` ของ kit มาทับความสูงจะได้คลาส h- ซ้อนกัน
          */}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 3xl:text-[13.5px]"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </header>
  );
}
