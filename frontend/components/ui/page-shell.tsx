import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { joinClassName } from "./class-name";

/**
 * โครงหน้าที่ใช้ร่วมกันทุกโซน
 * ---------------------------
 * เดิม HR / Manager / Payroll มีชุด PageShell + PageHeader + MetricCard +
 * QuickLink ของตัวเองคนละไฟล์ ทั้งที่โครงเหมือนกันเกือบทั้งหมด ต่างกันแค่
 * ข้อความ breadcrumb, ป้ายมุมขวาของการ์ดตัวเลข และไอคอนเริ่มต้น
 * ตอนนี้รวมเป็นชุดเดียวแล้วส่งส่วนที่ต่างเข้ามาเป็น prop
 *
 * สีในไฟล์นี้ยกมาจากของเดิมทั้งหมดโดยตั้งใจ ยังไม่เปลี่ยนเป็น sky/cyan
 * การไล่สีทำเป็นรอบแยกทีละหน้า — แต่หลังจากรวมแล้วจะแก้ที่นี่จุดเดียว
 */

export type MetricTone =
  | "blue"
  | "emerald"
  | "amber"
  | "violet"
  | "rose"
  | "slate";

const metricToneClassName: Record<MetricTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
  rose: "bg-rose-50 text-rose-700",
  slate: "bg-slate-50 text-slate-700",
};

export function PageShell({
  children,
  padded = true,
}: {
  children: ReactNode;
  /** Payroll ใช้ false เพราะจัด padding เองในหน้า */
  padded?: boolean;
}) {
  return (
    <main
      className={joinClassName(
        "min-h-screen bg-slate-50",
        padded && "px-6 py-8 lg:px-8",
      )}
    >
      <div className="mx-auto flex max-w-[1720px] flex-col gap-6">
        {children}
      </div>
    </main>
  );
}

export function PageHeader({
  breadcrumb,
  title,
  description,
  action,
}: {
  breadcrumb: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{breadcrumb}</span>
            <span>/</span>
            <span>{title}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
        {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  description,
  tone = "blue",
  badge,
  suffix,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  tone?: MetricTone;
  /** ป้ายมุมขวาบน เช่น "HR" / "Team" / "Payroll" */
  badge: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <div className="mt-2 flex items-end gap-2">
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {value}
            </p>
            {suffix ? (
              <span className="pb-1 text-sm font-medium text-slate-500">
                {suffix}
              </span>
            ) : null}
          </div>
        </div>
        <div
          className={joinClassName(
            "rounded-2xl px-3 py-2 text-xs font-semibold",
            metricToneClassName[tone],
          )}
        >
          {badge}
        </div>
      </div>
      {description ? (
        <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function QuickLink({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:text-blue-600" />
    </Link>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
