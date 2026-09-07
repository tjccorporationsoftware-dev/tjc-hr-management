"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { PlatformShell } from "@/components/layout/platform-shell";
import { useAuth } from "@/contexts/auth-context";

const PLATFORM_ROLES = ["SYSTEM_ADMIN", "ADMIN", "SUPER_ADMIN"];

/*
 * Platform Console คุมข้ามบริษัท จึงต้องเป็นผู้ใช้ระดับ GLOBAL เท่านั้น
 * ผู้ดูแลระบบที่ผูกกับบริษัทเดียวเข้ามาแล้วจะเห็นแต่เลข 0 เพราะมองไม่เห็นบริษัทใด
 * งานที่เขาต้องใช้ (Roles / Permissions / ผู้ใช้) มีอยู่แล้วในพื้นที่บริษัท
 */
function isPlatformAdmin(
  roles: string[] | undefined,
  scopeLevel: string | undefined,
) {
  if (scopeLevel !== "GLOBAL") return false;
  return (roles ?? []).some((role) =>
    PLATFORM_ROLES.includes(String(role).trim().toUpperCase()),
  );
}

function PlatformGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const allowed = isPlatformAdmin(user?.roles, user?.scope?.level);

  useEffect(() => {
    if (!isLoading && user && !allowed) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, allowed, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex items-center gap-3 rounded-3xl border border-violet-900/40 bg-slate-900 px-5 py-4 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          กำลังตรวจสอบสิทธิ์แพลตฟอร์ม...
        </div>
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <PlatformGuard>
        <PlatformShell>{children}</PlatformShell>
      </PlatformGuard>
    </ProtectedRoute>
  );
}
