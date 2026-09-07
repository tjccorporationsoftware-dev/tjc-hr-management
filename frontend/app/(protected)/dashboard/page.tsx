"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { getDefaultDashboardPath } from "@/lib/default-dashboard";

export default function DashboardRedirectPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    router.replace(getDefaultDashboardPath(user));
  }, [router, user]);

  return (
    <div className="flex min-h-[calc(100dvh-72px)] items-center justify-center">
      <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        กำลังพาไปหน้าหลักตามสิทธิ์ของคุณ...
      </div>
    </div>
  );
}
