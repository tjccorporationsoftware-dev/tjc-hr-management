"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ClipboardPen,
  Clock,
  Database,
  KeyRound,
  Layers3,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  SquareArrowOutUpRight,
  Upload,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import type { ComponentType } from "react";

type PlatformNavItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
};

const PLATFORM_NAV: PlatformNavItem[] = [
  {
    title: "ภาพรวมแพลตฟอร์ม",
    href: "/platform",
    icon: LayoutDashboard,
    description: "สรุปทุกบริษัท",
  },
  {
    title: "บริษัท & สาขา",
    href: "/platform/companies",
    icon: Building2,
    description: "สร้างบริษัทและสาขา",
  },
  {
    title: "ผู้ใช้งานทั้งระบบ",
    href: "/platform/users",
    icon: Users,
    description: "provision ผู้ดูแลบริษัท",
  },
  {
    title: "สิทธิ์การเข้าถึง",
    href: "/platform/access",
    icon: ShieldCheck,
    description: "กำหนด Scope + Role รายบัญชี",
  },
  {
    title: "กรอกเวลาเข้า-ออก",
    href: "/platform/attendance-entry",
    icon: Clock,
    description: "กรอกเวลาลงเวลาให้พนักงานเอง",
  },
  {
    title: "ยื่นคำขอแทนพนักงาน",
    href: "/platform/requests",
    icon: ClipboardPen,
    description: "ใบลา / OT / แก้เวลา / นอกสถานที่",
  },
  {
    title: "นำเข้าข้อมูล",
    href: "/platform/data-import",
    icon: Upload,
    description: "อัปโหลดไฟล์ Excel เขียนเข้าระบบ",
  },
  {
    title: "ข้อมูลของบริษัท",
    href: "/platform/company-data",
    icon: Database,
    description: "ดู/ลบข้อมูลที่ขึ้นระบบไปแล้วรายบริษัท",
  },
  { title: "Roles", href: "/platform/roles", icon: Layers3 },
  { title: "Permissions", href: "/platform/permissions", icon: KeyRound },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function isActive(pathname: string, href: string) {
  if (href === "/platform") return pathname === "/platform";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-[280px] shrink-0 flex-col border-r border-violet-900/40 bg-gradient-to-b from-violet-950 via-slate-950 to-slate-950 lg:flex">
          <div className="border-b border-violet-900/40 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/20 text-[20px] ring-1 ring-violet-400/40">
                🌐
              </div>
              <div>
                <div className="text-[15px] font-extrabold tracking-tight text-white">
                  Platform Console
                </div>
                <div className="text-[11px] font-medium text-violet-300">
                  ผู้ดูแลแพลตฟอร์ม · ทุกบริษัท
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
            {PLATFORM_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex min-h-[48px] items-center gap-3 rounded-2xl px-3.5 text-[15px] transition",
                    active
                      ? "bg-violet-500/20 text-white ring-1 ring-violet-400/40"
                      : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      active
                        ? "bg-violet-500/30 text-violet-100"
                        : "bg-white/5 text-slate-400 group-hover:text-violet-200",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {item.title}
                    </span>
                    {item.description ? (
                      <span className="block truncate text-[11px] font-medium text-slate-400">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-violet-900/40 p-3">
            <Link
              href="/hr/dashboard"
              className="mb-2 flex items-center gap-2 rounded-2xl bg-white/5 px-3.5 py-2.5 text-[13px] font-semibold text-slate-200 transition hover:bg-white/10"
            >
              <SquareArrowOutUpRight className="h-4 w-4 text-violet-300" />
              เข้าสู่พื้นที่บริษัท
            </Link>
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-white">
                  {user?.displayName ?? "ผู้ดูแลระบบ"}
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {user?.email}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                aria-label="ออกจากระบบ"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 bg-slate-100 text-slate-900">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 lg:hidden">
            <ShieldCheck className="h-5 w-5 text-violet-600" />
            <span className="font-extrabold">Platform Console</span>
            <Link
              href="/hr/dashboard"
              className="ml-auto text-sm font-semibold text-violet-600"
            >
              พื้นที่บริษัท →
            </Link>
          </header>
          <main className="w-full px-4 py-5 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
