"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { AuthProvider } from "@/contexts/auth-context";
import { getQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  // สร้างผ่าน useState ไม่ใช่ระดับ module เพื่อไม่ให้ QueryClient ถูกสร้างใหม่
  // ทุก render และไม่ให้ cache ถูกแชร์ข้ามผู้ใช้ตอน render ฝั่ง server
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        {/*
          * toast ใช้ภาษาเดียวกับ ActionDialog — มุมมน ขอบบาง เงานุ่ม
          * สีพื้นของแต่ละสถานะกำหนดเป็นเฉดอ่อนไว้ที่ globals.css ผ่านตัวแปรของ sonner
          * (ที่นี่ส่ง className ไปทับสีไม่ได้ เพราะ sonner ใส่สีผ่าน CSS variable)
          */}
        <Toaster
          richColors
          closeButton
          position="top-right"
          gap={10}
          toastOptions={{
            classNames: {
              toast:
                "rounded-xl px-4 py-3 text-[13px] shadow-lg shadow-slate-900/10",
              title: "text-[13px] font-semibold",
              description: "text-[12.5px] leading-5 opacity-80",
              icon: "shrink-0",
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
