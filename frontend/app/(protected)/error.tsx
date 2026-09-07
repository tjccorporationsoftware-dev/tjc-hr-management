"use client";

import { useEffect } from "react";

import { ErrorScreen } from "@/components/common/error-screen";

/**
 * ตัวรับข้อผิดพลาดของโซนที่ต้องล็อกอิน
 *
 * แยกจาก error.tsx ระดับแอปเพราะตัวนี้อยู่ "ใต้" layout ของโซน
 * เมนูข้างและแถบบนจึงยังอยู่ ผู้ใช้กดไปหน้าอื่นต่อได้เลย
 * ไม่ต้องกลับหน้าแรกแล้วเริ่มใหม่ทั้งหมด
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("เกิดข้อผิดพลาดในหน้าที่ต้องล็อกอิน:", error);
  }, [error]);

  return (
    <ErrorScreen
      title="เปิดหน้านี้ไม่สำเร็จ"
      description="ข้อมูลบางส่วนอาจไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง หรือเลือกเมนูอื่นทางซ้ายเพื่อทำงานต่อ"
      digest={error.digest}
      onRetry={reset}
      showHomeLink={false}
    />
  );
}
