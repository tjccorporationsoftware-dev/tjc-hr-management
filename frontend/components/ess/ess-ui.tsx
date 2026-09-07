"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";

import {
  getEmployeeName as getSharedEmployeeName,
  type EmployeeNameLike,
} from "@/components/ui/employee-name";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatThaiDate,
  formatThaiDateTime,
  formatThaiTime,
} from "@/lib/date-format";
import {
  ESS_REQUEST_STATUS,
  statusLabel,
  statusToneClass,
} from "@/lib/status-labels";

export const essCardClass = "rounded-xl border border-slate-200 bg-white";

export const essInputClass =
  "h-9 3xl:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] 3xl:text-[13.5px] text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export const essTextareaClass =
  "min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] 3xl:text-[13.5px] leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export function essDate(value?: string | null) {
  return formatThaiDate(value);
}

export function essDateTime(value?: string | Date | null) {
  return formatThaiDateTime(value);
}

export function essTime(value?: string | null) {
  if (!value) return "-";

  const text = String(value).trim();
  const timeOnlyMatch = /^(\d{1,2}):(\d{2})/.exec(text);

  if (timeOnlyMatch && !text.includes("T")) {
    return `${timeOnlyMatch[1].padStart(2, "0")}:${timeOnlyMatch[2]}`;
  }

  return formatThaiTime(value);
}

export function essNumber(value: unknown, digits = 2) {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) return "0";

  return numberValue.toLocaleString("th-TH", {
    maximumFractionDigits: digits,
  });
}

export function essStatusText(status?: string | null) {
  return statusLabel(ESS_REQUEST_STATUS, status);
}

export function essStatusBadgeClass(status?: string | null) {
  return statusToneClass(ESS_REQUEST_STATUS, status);
}

export function EssStatusBadge({ status }: { status?: string | null }) {
  return <StatusBadge vocabulary={ESS_REQUEST_STATUS} status={status} />;
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** ฝั่ง ESS ไม่แสดงคำนำหน้าชื่อ ต่างจากฝั่ง HR/หัวหน้า */
export function getEmployeeName(employee?: EmployeeNameLike | null) {
  return getSharedEmployeeName(employee, { includeTitle: false });
}

export function PageLoading({ label = "กำลังโหลดข้อมูล" }: { label?: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center px-5 py-10">
      <span className="inline-flex items-center gap-2.5 text-[13px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
        {label}
      </span>
    </div>
  );
}

/**
 * ข้อความผิดพลาดของหน้า ESS
 *
 * เคสที่เจอบ่อยสุดคือบัญชีผู้ดูแลที่ยังไม่ได้ผูกกับพนักงาน — ทุก endpoint ของ ESS
 * อ้างอิง "พนักงาน" ไม่ใช่ "ผู้ใช้" จึงตอบ 404 ทั้งหมด ต้องอธิบายให้ตรงสาเหตุ
 * ไม่ใช่ขึ้นแค่ "โหลดข้อมูลไม่สำเร็จ" แล้วให้ผู้ใช้เดาเอง
 */
export function PageError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const isUnlinkedAccount = message.includes("ยังไม่ได้ผูกกับข้อมูลพนักงาน");

  return (
    <div className="px-5 py-12 text-center">
      <p className="text-[13px] font-semibold text-slate-700">
        {isUnlinkedAccount
          ? "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน"
          : "โหลดข้อมูลไม่สำเร็จ"}
      </p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
        {isUnlinkedAccount
          ? "เมนูพนักงานใช้ข้อมูลของพนักงานคนนั้น ๆ บัญชีผู้ดูแลที่ไม่ได้ผูกกับพนักงานจึงยังใช้ส่วนนี้ไม่ได้ — ผูกบัญชีกับพนักงานได้ที่หน้า ผู้ใช้และสิทธิ์"
          : message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-brand-600 px-3.5 text-[13px] font-semibold text-white transition hover:bg-brand-700"
      >
        โหลดใหม่
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function QuickLinkCard({
  href,
  icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={`${essCardClass} group block p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_42px_rgba(37,99,235,0.10)]`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-950">{title}</p>
              {badge ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          </div>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-blue-600" />
      </div>
    </Link>
  );
}

export function formatDateTimeForApi(date: string, time: string) {
  if (!date || !time) return "";
  return `${date}T${time}:00+07:00`;
}
