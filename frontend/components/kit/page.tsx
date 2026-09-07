import type { ReactNode } from "react";

import { joinClassName } from "@/components/ui/class-name";
import {
  PageHeroWave,
  type HeroMotif,
} from "@/components/common/page-hero-wave";

/**
 * โครงหน้ามาตรฐาน
 * ---------------
 * ต้นแบบคือ /payroll และ /payroll/[periodId] — หนึ่งหน้ามีผืนขาวผืนเดียว
 * กางเต็มพื้นที่ที่ app-shell ให้มา ไม่มีการ์ดลอยซ้อนกัน ส่วนต่าง ๆ แบ่งด้วยเส้น
 *
 * หน้าใหม่ให้ใช้ `PageSurface` + `PageHeading` เสมอ อย่าประกอบโครงเอง
 * ไม่งั้นแต่ละหน้าจะหลุดโทนกันทีละนิดจนกลับมาไม่เหมือนกันอีก
 */

/** ผืนขาวของหน้า — ครอบทุกอย่างตั้งแต่หัวเรื่องจนถึงตาราง */
export function PageSurface({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      className={joinClassName(
        // 7.5rem = แถบบนสุด 80px + ระยะบน-ล่างของ <main> ใน app-shell
        "min-h-[calc(100vh-7.5rem)] w-full overflow-hidden rounded-xl bg-white pb-10",
        className,
      )}
    >
      {children}
    </main>
  );
}

/**
 * หัวเรื่องของหน้า
 * `chips` = ป้ายบริบทใต้คำอธิบาย (บริษัท จำนวนคน ฯลฯ)
 * `actions` = ฝั่งขวา ใช้วาง select, แผง `StatTile` และปุ่มหลัก
 * `leading` = รูปซ้ายสุดของบล็อกชื่อ ใช้กับหน้ารายละเอียดที่หัวเรื่องเป็น "คน"
 *   (อย่าเอาไปยัดใน `chips` — จะโดนบีบให้เท่าความสูงป้ายจนเล็กเกินอ่าน)
 */
export function PageHeading({
  title,
  description,
  chips,
  actions,
  leading,
  heroMotif,
  eyebrow,
  titleAccent,
}: {
  title: string;
  description?: string;
  chips?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  /**
   * ใส่พื้นหลังคลื่นซัดหาดให้หัวเรื่อง (ซ้ายขาว ขวาเป็นผืนน้ำ)
   * เลือกลวดลายบนผืนน้ำให้ตรงกับเรื่องของหน้านั้น ดู `PageHeroWave`
   * ไม่ใส่ = หัวเรื่องพื้นขาวล้วนแบบเดิม
   */
  heroMotif?: HeroMotif;
  /**
   * ป้ายบรรทัดบนสุดเหนือชื่อหน้า เช่น `Overview` `Approvals`
   * ใส่แล้วหัวเรื่องจะใช้ชุดตัวอักษรใหม่ (หนาขึ้น + จุดสีแบรนด์ท้ายชื่อ)
   * ไม่ใส่ = แบบเดิมคือแถบสีสั้น ๆ เหนือชื่อ — หน้าที่ยังไม่ได้ปรับโทนจะได้ไม่เปลี่ยนเอง
   */
  eyebrow?: string;
  /**
   * ท่อนท้ายของชื่อหน้าที่ให้เป็นสีแบรนด์ เช่น title="ศูนย์" titleAccent="คำขอ"
   * ใช้ได้เมื่อมี `eyebrow` เท่านั้น เพราะเป็นชุดตัวอักษรเดียวกัน
   */
  titleAccent?: string;
}) {
  return (
    <header className="relative overflow-hidden border-b border-slate-300 px-6 py-6 sm:px-7 3xl:px-8">
      {heroMotif ? <PageHeroWave variant={heroMotif} /> : null}

      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-4 3xl:gap-5">
          {leading ? <div className="shrink-0 pt-1">{leading}</div> : null}

          <div className="min-w-0">
            {eyebrow ? (
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">
                {eyebrow} <span className="text-brand-300">•</span>
              </p>
            ) : (
              <div className="mb-3 h-1 w-10 rounded-full bg-brand-600" />
            )}

            {eyebrow ? (
              <h1 className="mt-2 text-[27px] font-extrabold tracking-tight text-slate-900 3xl:text-[30px]">
                {title}
                {titleAccent ? (
                  <span className="text-brand-600">{titleAccent}</span>
                ) : null}
                <span className="text-brand-600">.</span>
              </h1>
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 3xl:text-[28px] 4xl:text-[30px]">
                {title}
              </h1>
            )}
            {description ? (
              // text-balance กันคำโดดบรรทัดสุดท้ายเวลาข้อความยาว
              <p className="mt-2 max-w-2xl text-balance text-[13px] leading-6 text-slate-500 3xl:text-[13.5px]">
                {description}
              </p>
            ) : null}

            {chips ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {chips}
              </div>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex w-full flex-col items-stretch gap-3 xl:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** ป้ายบริบทเล็ก ๆ ใต้คำอธิบายของหัวเรื่อง */
export function PageChip({
  icon,
  tone = "neutral",
  children,
}: {
  icon?: ReactNode;
  tone?: "neutral" | "brand";
  children: ReactNode;
}) {
  const toneClass =
    tone === "brand"
      ? "bg-brand-50 text-brand-700"
      : "bg-slate-100 text-slate-600";

  return (
    <span
      className={joinClassName(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold 3xl:px-3 3xl:text-[12px] 4xl:text-[12.5px]",
        toneClass,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
