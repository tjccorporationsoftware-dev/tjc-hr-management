"use client";

import { useEffect } from "react";

/**
 * ตัวรับข้อผิดพลาดที่เกิดใน root layout เอง
 *
 * ตัวนี้ต้องมี <html> และ <body> ของตัวเอง เพราะมันแทนที่ root layout ทั้งก้อน
 * (layout พังไปแล้ว จึงพึ่งอะไรจากมันไม่ได้)
 *
 * ด้วยเหตุนี้จึงเขียนสไตล์แบบ inline ไม่พึ่ง Tailwind หรือ component kit
 * เพราะถ้า CSS โหลดไม่ขึ้น หน้านี้ต้องยังอ่านออก
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("เกิดข้อผิดพลาดระดับราก:", error);
  }, [error]);

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            maxWidth: "32rem",
            padding: "2rem",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "0.75rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
            ระบบขัดข้อง
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              lineHeight: 1.7,
              color: "#475569",
            }}
          >
            เกิดข้อผิดพลาดร้ายแรงจนเปิดหน้าเว็บไม่ได้ กรุณาลองใหม่
            ถ้ายังไม่หายให้แจ้งทีมพร้อมรหัสอ้างอิงด้านล่าง
          </p>

          {error.digest ? (
            <p
              style={{
                marginTop: "1.25rem",
                padding: "0.5rem 0.75rem",
                background: "#f1f5f9",
                borderRadius: "0.5rem",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#64748b",
              }}
            >
              รหัสอ้างอิง: {error.digest}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "2.25rem",
              padding: "0 0.875rem",
              background: "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  );
}
