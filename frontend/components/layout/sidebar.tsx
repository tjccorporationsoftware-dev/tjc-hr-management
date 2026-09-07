"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getNotificationSummary } from "@/lib/api";
import type { NotificationSummaryResponse } from "@/types/notification";
import {
  getActiveNavigationItem,
  getVisibleNavigationGroups,
  normalizePath,
  type NavigationItem,
} from "@/lib/navigation";

/**
 * เมนูข้าง
 * -------
 * โทนเดียวกับผืนขาวของหน้า (/payroll): แบน ไม่มีเงา ไม่มีการ์ดซ้อนการ์ด
 * แบ่งกลุ่มด้วยเส้นบาง ๆ และใช้สี brand เป็น accent จุดเดียวคือรายการที่เปิดอยู่
 *
 * หัวเมนูสูง 80px เท่าแถบบนสุด เส้นล่างของทั้งสองจะได้ต่อกันเป็นเส้นเดียว
 */

type SidebarContentProps = {
  onNavigate?: () => void;
};

type SidebarBadgeMap = Record<string, number>;

const BADGE_REFRESH_INTERVAL_MS = 60_000;
const NOTIFICATION_SUMMARY_UPDATED_EVENT = "hr_notification_summary_updated";

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

// Items with children (e.g. the system-settings menu) are flattened so every
// page shows inline in the sidebar just like the other links, without a popup.
function getGroupLinkItems(items: NavigationItem[]): NavigationItem[] {
  return items.flatMap((item) =>
    item.children && item.children.length > 0 ? item.children : [item],
  );
}

function BrandBlock() {
  return (
    <div className="flex h-20 shrink-0 items-center gap-3 border-b border-slate-300 px-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-[17px] font-bold tracking-[-0.04em] text-white">
        HR
      </span>

      <div className="min-w-0">
        <div className="truncate text-[15.5px] font-bold leading-tight tracking-tight text-slate-950 3xl:text-[16.5px]">
          HR Workforce
        </div>
        <div className="mt-1 truncate text-[10.5px] font-semibold uppercase leading-tight tracking-[0.16em] text-slate-400">
          Management System
        </div>
      </div>
    </div>
  );
}

/** หัวข้อกลุ่ม — ป้ายกำกับสั้น ๆ แล้วลากเส้นบางไปจนสุดขอบเมนู */
function GroupLabel({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
        {title}
      </span>
      <span className="h-px flex-1 bg-brand-100" />
    </div>
  );
}

function SidebarLink({
  item,
  active,
  badgeCount,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  badgeCount?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-11 items-center gap-3 overflow-hidden rounded-lg px-3 text-[14px] transition-colors duration-150 3xl:h-12 3xl:text-[14.5px] 4xl:text-[15px]",
        active
          ? "bg-brand-50 font-semibold text-brand-700"
          : "text-slate-600 hover:bg-brand-50/50 hover:text-brand-700",
      )}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600" />
      ) : null}

      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active
            ? "text-brand-600"
            : "text-slate-400 group-hover:text-brand-500",
        )}
      />

      <span className="min-w-0 flex-1 truncate">{item.title}</span>

      {badgeCount && badgeCount > 0 ? (
        <span
          className={cn(
            "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none text-white",
            active ? "bg-brand-600" : "bg-rose-500",
          )}
        >
          {formatBadgeCount(badgeCount)}
        </span>
      ) : null}
    </Link>
  );
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const permissionsKey = (user?.permissions ?? []).join("|");
  const rolesKey = (user?.roles ?? []).join("|");

  const visibleGroups = useMemo(() => {
    return getVisibleNavigationGroups(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsKey, rolesKey, user?.id]);

  const activeHref = useMemo(() => {
    const activeItem = getActiveNavigationItem(pathname, user);
    return activeItem ? normalizePath(activeItem.href) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, permissionsKey, rolesKey, user?.id]);

  const [sidebarBadges, setSidebarBadges] = useState<SidebarBadgeMap>({});

  useEffect(() => {
    let mounted = true;

    async function loadSidebarBadges() {
      try {
        const summary = await getNotificationSummary();

        if (!mounted) return;

        setSidebarBadges(summary.sidebarBadges ?? {});
      } catch {
        if (!mounted) return;

        setSidebarBadges({});
      }
    }

    loadSidebarBadges();

    const intervalId = window.setInterval(
      loadSidebarBadges,
      BADGE_REFRESH_INTERVAL_MS,
    );

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [user?.id, permissionsKey, rolesKey]);

  useEffect(() => {
    function handleSummaryUpdated(event: Event) {
      const detail = (event as CustomEvent<NotificationSummaryResponse>).detail;

      if (!detail) {
        return;
      }

      setSidebarBadges(detail.sidebarBadges ?? {});
    }

    window.addEventListener(
      NOTIFICATION_SUMMARY_UPDATED_EVENT,
      handleSummaryUpdated,
    );

    return () => {
      window.removeEventListener(
        NOTIFICATION_SUMMARY_UPDATED_EVENT,
        handleSummaryUpdated,
      );
    };
  }, []);

  return (
    <>
      <BrandBlock />

      <nav className="flex-1 overflow-y-auto px-3 pb-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="space-y-1 pt-4">
          {visibleGroups.map((group) => (
            <section key={group.title} className="pb-3">
              <GroupLabel title={group.title} />

              <div className="mt-2 space-y-1">
                {getGroupLinkItems(group.items).map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={normalizePath(item.href) === activeHref}
                    badgeCount={sidebarBadges[item.href]}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </nav>

      {/*
        ผู้ดูแลระดับแพลตฟอร์มเข้ามาดูข้อมูลของบริษัทได้ ต้องมีทางกลับ Platform
        Console ไม่งั้นต้องพิมพ์ URL เอง — ที่เหลือของ scope ไม่ต้องบอกซ้ำ
        เพราะแถบบนสุดขึ้นชื่อบริษัทกับโรลให้แล้ว
      */}
      {user?.scope?.level === "GLOBAL" ? (
        <div className="shrink-0 border-t border-slate-200 px-3 py-3">
          <Link
            href="/platform"
            onClick={onNavigate}
            className="flex h-11 items-center gap-2.5 rounded-lg px-3 text-[13px] font-semibold text-slate-500 transition hover:bg-brand-50/50 hover:text-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับ Platform Console
          </Link>
        </div>
      ) : null}
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-[280px] shrink-0 border-r border-slate-300 bg-white lg:sticky lg:top-0 lg:z-40 lg:block 3xl:w-[300px] 4xl:w-[320px]">
      <div className="flex h-full flex-col overflow-hidden bg-white">
        <SidebarContent />
      </div>
    </aside>
  );
}
