"use client";

import { useEffect } from "react";

import { ErrorScreen } from "@/components/common/error-screen";

/**
 * ตัวรับข้อผิดพลาดระดับแอป
 *
 * ครอบทุกหน้าที่อยู่ใต้ root layout — หน้าไหนพังตอน render จะมาโผล่ที่นี่
 * แทนที่จะกลายเป็นจอขาวเปล่าอย่างที่เป็นอยู่เดิม
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ต้องเห็นใน console ของเบราว์เซอร์ด้วย ไม่งั้นตอนผู้ใช้แจ้งปัญหาจะไม่มีอะไรให้ดู
    console.error("เกิดข้อผิดพลาดที่ทำให้แสดงหน้านี้ไม่ได้:", error);
  }, [error]);

  return (
    <ErrorScreen
      title="เกิดข้อผิดพลาดจนแสดงหน้านี้ไม่ได้"
      description="ระบบยังทำงานอยู่ แต่หน้านี้แสดงผลต่อไม่ได้ ลองใหม่อีกครั้ง ถ้ายังไม่หายให้แจ้งทีมพร้อมรหัสอ้างอิงด้านล่าง"
      digest={error.digest}
      onRetry={reset}
    />
  );
}
