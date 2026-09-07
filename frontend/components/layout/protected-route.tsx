"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated, user } = useAuth();

  const mustChangePassword = Boolean(user?.mustChangePassword);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    /*
     * บัญชีที่ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ ต้องเปลี่ยนรหัสก่อนใช้งาน
     * ฝั่งเซิร์ฟเวอร์บล็อก API ไว้อยู่แล้ว ตรงนี้แค่พาไปหน้าที่ทำได้
     * ไม่งั้นจะเห็นแต่หน้าเปล่าที่โหลดข้อมูลไม่ขึ้นโดยไม่รู้สาเหตุ
     */
    if (mustChangePassword) {
      router.replace("/change-password");
    }
  }, [isAuthenticated, isLoading, mustChangePassword, router]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f6]">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-[13px] font-medium text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          กำลังตรวจสอบสิทธิ์...
        </div>
      </main>
    );
  }

  if (!isAuthenticated || mustChangePassword) {
    return null;
  }

  return <>{children}</>;
}