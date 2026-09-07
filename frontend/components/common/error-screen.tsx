"use client";

import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

/**
 * หน้าจอเมื่อเกิดข้อผิดพลาดที่ทำให้ render ต่อไม่ได้
 * -----------------------------------------------------------------------------
 * เดิมไม่มี error boundary เลยทั้งแอป หน้าที่พังตอน render จึงกลายเป็นจอขาวเปล่า ๆ
 * ผู้ใช้ไม่รู้ว่าเกิดอะไรขึ้น กดอะไรต่อไม่ได้ และแจ้งทีมไม่ได้ว่าพังตรงไหน
 *
 * ใช้ร่วมกันทั้ง error.tsx ของแต่ละโซนและ global-error.tsx
 * เขียนด้วย HTML ธรรมดาไม่พึ่ง component kit เพราะ global-error ต้องทำงานได้
 * แม้ตัว provider หรือ theme จะพังไปแล้ว
 */
export function ErrorScreen({
  title,
  description,
  digest,
  onRetry,
  showHomeLink = true,
}: {
  title: string;
  description: string;
  /** รหัสอ้างอิงที่ Next.js สร้างให้ ใช้ตามหา error ฝั่งเซิร์ฟเวอร์ */
  digest?: string;
  onRetry?: () => void;
  showHomeLink?: boolean;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-xl border border-slate-300 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </span>

          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold text-slate-900 3xl:text-[19px]">
              {title}
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 3xl:text-[15px]">
              {description}
            </p>
          </div>
        </div>

        {/*
          รหัสอ้างอิงสำคัญกว่าที่คิด — เป็นสิ่งเดียวที่ผู้ใช้บอกทีมได้
          เพื่อให้ตามหา error ฝั่งเซิร์ฟเวอร์เจอ โดยไม่ต้องเดาว่าเกิดตอนไหน
        */}
        {digest ? (
          <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-500">
            รหัสอ้างอิง: {digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2.5">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[13px] font-semibold text-white transition hover:bg-brand-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              ลองใหม่
            </button>
          ) : null}

          {showHomeLink ? (
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Home className="h-3.5 w-3.5" />
              กลับหน้าแรก
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
