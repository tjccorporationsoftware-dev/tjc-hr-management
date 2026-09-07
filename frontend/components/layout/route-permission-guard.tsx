"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { PermissionDenied } from "@/components/common/feedback-state";
import { useAuth } from "@/contexts/auth-context";
import { getDefaultDashboardPath } from "@/lib/default-dashboard";
import {
  canAccessPermissionRequirement,
  describePermissionRequirement,
  findRoutePermissionRequirement,
} from "@/lib/route-permissions";
import {
  isMenuMatch,
  navigationItems,
  normalizePath,
  type NavigationItem,
} from "@/lib/navigation";

/**
 * RoutePermissionGuard
 * --------------------
 * Guard ฝั่ง Frontend สำหรับกันการพิมพ์ URL ตรงเข้าหน้าที่ไม่มีสิทธิ์
 *
 * หมายเหตุ:
 * - ไม่ทดแทน backend AuthGuard / PermissionGuard
 * - ใช้ routePermissionMap เป็น source หลัก เพื่อให้ตรงกับ Sidebar
 * - ถ้า route ยังไม่มีใน routePermissionMap จะ fallback ไปดู navigation item
 */

type RoutePermissionGuardProps = {
  children: React.ReactNode;
};

function getMatchedNavigationItems(pathname: string) {
  const currentPath = normalizePath(pathname);

  return navigationItems
    .filter((item) => isMenuMatch(currentPath, item.href))
    .sort(
      (a, b) => normalizePath(b.href).length - normalizePath(a.href).length,
    );
}

function getFallbackRequirement(item: NavigationItem | null) {
  if (!item) return null;

  return {
    permissions: item.permissions ?? [],
    mode: item.permissionMode ?? "any",
    roles: item.roles,
    roleMode: item.roleMode ?? "any",
  } as const;
}

export function RoutePermissionGuard({
  children,
}: RoutePermissionGuardProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const defaultDashboardPath = getDefaultDashboardPath(user);

  const userPermissions = useMemo(() => user?.permissions ?? [], [user]);
  const userRoles = useMemo(() => user?.roles ?? [], [user]);

  const matchedItems = useMemo(
    () => getMatchedNavigationItems(pathname),
    [pathname],
  );

  const matchedRouteRequirement = useMemo(
    () => findRoutePermissionRequirement(pathname),
    [pathname],
  );

  const firstMatchedItem = matchedItems[0] ?? null;
  const fallbackRequirement = getFallbackRequirement(firstMatchedItem);
  const effectiveRequirement = matchedRouteRequirement ?? fallbackRequirement;

  const canAccess = useMemo(
    () =>
      canAccessPermissionRequirement(
        userPermissions,
        effectiveRequirement,
        userRoles,
        user?.scope?.level ?? null,
      ),
    [effectiveRequirement, userPermissions, userRoles, user?.scope?.level],
  );

  if (canAccess) {
    return <>{children}</>;
  }

  return (
    <main className="min-h-screen bg-[#eef1f6] px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-[1720px]">
        <PermissionDenied
          title="ไม่มีสิทธิ์เข้าถึงหน้านี้"
          description={describePermissionRequirement(
            effectiveRequirement,
            user?.scope?.level ?? null,
          )}
          action={
            <Link
              href={defaultDashboardPath}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white transition hover:bg-brand-700"
            >
              กลับไปหน้าหลักตามสิทธิ์
            </Link>
          }
        />
      </div>
    </main>
  );
}
