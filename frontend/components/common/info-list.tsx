import type { ReactNode } from "react";

import { joinClassName } from "@/components/kit";

/**
 * คู่ป้าย–ค่า ของหน้าที่เป็นข้อมูลอ่านอย่างเดียว
 * ---------------------------------------------
 * ใช้ทั้งแฟ้มพนักงานฝั่ง HR (/employees/[id]) และแฟ้มของตัวเองฝั่งพนักงาน
 * (/ess/my-profile) — สองหน้านี้แสดงข้อมูลชุดเดียวกัน จึงต้องหน้าตาเหมือนกัน
 *
 * ใช้แทนตาราง 2 คอลัมน์แบบเดิม เพราะหน้าพวกนี้เป็น "ข้อมูลอ่านอย่างเดียว" ล้วน ๆ
 * ป้ายตัวเล็กสีจาง ค่าตัวหนา วางเป็นกริดได้หลายคอลัมน์ตามความกว้างจอ
 *
 * ต่างจาก `DetailItem` ของ kit ตรงที่ค่าตัดขึ้นบรรทัดใหม่ได้ —
 * ที่อยู่และหมายเหตุในหน้านี้ยาวเกินกว่าจะ truncate ทิ้ง
 */

export function InfoGrid({
  columns = 3,
  className,
  children,
}: {
  columns?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const columnClass = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 xl:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
  }[columns];

  return (
    <div
      className={joinClassName(
        /*
         * ระยะแนวตั้งแคบลงและมีเส้นใต้ทุกช่อง (ดูที่ InfoItem)
         * ของเดิมเป็นคู่ป้าย–ค่าลอยอยู่บนพื้นขาวโล่ง ๆ ตาไล่บรรทัดไม่ติด
         */
        "grid gap-x-8 gap-y-0",
        columnClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function InfoItem({
  label,
  value,
  wide = false,
  full = false,
}: {
  label: string;
  value: ReactNode;
  /** กินสองช่องในกริด ใช้กับที่อยู่หรือหมายเหตุที่ยาว */
  wide?: boolean;
  /** กินเต็มแถว — ช่องถัดไปจะได้ขึ้นบรรทัดใหม่เสมอ ไม่ไปห้อยอยู่ข้างที่อยู่ */
  full?: boolean;
}) {
  /* ช่องที่ยังไม่มีข้อมูลให้จางลง จะได้ไม่แย่งสายตาไปจากค่าที่มีจริง */
  const isEmpty = value === "-" || value === "" || value == null;

  return (
    <div
      className={joinClassName(
        "min-w-0 border-b border-slate-100 py-2",
        full ? "sm:col-span-2 xl:col-span-3" : wide && "sm:col-span-2",
      )}
    >
      {/* ป้ายไม่ถ่างตัวอักษรแล้ว — ภาษาไทยที่ถ่างมาก ๆ อ่านช้ากว่าเดิม */}
      <p className="text-[11px] font-medium text-slate-400 3xl:text-[11.5px]">
        {label}
      </p>
      <div
        className={joinClassName(
          "mt-0.5 break-words text-[13px] font-semibold leading-6 3xl:text-[13.5px]",
          isEmpty ? "text-slate-300" : "text-slate-800",
        )}
      >
        {isEmpty ? "—" : value}
      </div>
    </div>
  );
}

/** แถวหัวข้อของกลุ่มข้อมูลในแท็บ — เส้นบางคั่น ไม่ใช่การ์ด */
export function InfoSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 px-5 py-4 last:border-b-0 sm:px-6 3xl:px-7">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-brand-100 pb-1.5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {title}
        </h2>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
