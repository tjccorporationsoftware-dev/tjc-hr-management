"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getDefaultDashboardPath } from "@/lib/default-dashboard";

export default function HomePage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.replace(getDefaultDashboardPath(user));
    } else {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router, user]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        กำลังโหลดระบบ...
      </div>
    </main>
  );
}