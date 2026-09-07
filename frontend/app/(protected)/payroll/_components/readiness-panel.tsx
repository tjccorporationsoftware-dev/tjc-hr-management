"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import { Notice, joinClassName } from "@/components/kit";
import type { PayrollReadinessResponse } from "@/types/payroll";

/**
 * ผลตรวจก่อนอนุมัติ
 * ----------------
 * แผงวินิจฉัยอันเดียวที่เหลืออยู่ — รวมทุกอย่างที่ต้องแก้ก่อนกดอนุมัติไว้ที่นี่
 *
 * วาดเป็นรายการในผืนเดียวกับหน้า ไม่ห่อการ์ดซ้อน เรื่องที่บล็อกขึ้นก่อนเสมอ
 */

export function ReadinessPanel({
  readiness,
  loading,
}: {
  readiness: PayrollReadinessResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="px-5 3xl:px-6 4xl:px-7 py-16 text-center text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] text-slate-400">
        กำลังตรวจข้อมูลของงวดนี้…
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className="px-5 3xl:px-6 4xl:px-7 py-5">
        <Notice tone="info">
          ยังไม่ได้ตรวจ — กดคำนวณเงินเดือนก่อน แล้วผลตรวจจะขึ้นที่นี่
        </Notice>
      </div>
    );
  }

  const { summary, checks } = readiness;

  // เรียงให้เรื่องที่บล็อกอยู่บนสุด แล้วค่อยเตือน แล้วค่อยผ่าน
  const weight = (check: (typeof checks)[number]) =>
    check.blocking ? 0 : check.status === "PASS" ? 2 : 1;
  const sorted = [...checks].sort((a, b) => weight(a) - weight(b));

  const problems = sorted.filter((check) => check.status !== "PASS");
  const passed = sorted.filter((check) => check.status === "PASS");

  return (
    <div>
      <div className="border-b border-slate-200 px-5 3xl:px-6 4xl:px-7 py-3">
        {summary.isReady ? (
          <Notice tone="positive" icon={<CheckCircle2 className="h-4 w-4" />}>
            ตรวจผ่านทั้งหมด งวดนี้พร้อมอนุมัติและจ่ายได้
          </Notice>
        ) : summary.blockingCount > 0 ? (
          <Notice tone="critical" icon={<XCircle className="h-4 w-4" />}>
            มี {summary.blockingCount} เรื่องที่ต้องแก้ก่อนถึงจะอนุมัติได้
          </Notice>
        ) : (
          <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
            อนุมัติต่อได้ แต่มี {summary.warningCount}{" "}
            เรื่องที่ควรดูก่อนจ่ายเงินจริง
          </Notice>
        )}
      </div>

      {problems.length ? (
        <ul className="divide-y divide-slate-100">
          {problems.map((check) => (
            <CheckRow key={check.code} check={check} />
          ))}
        </ul>
      ) : null}

      {passed.length ? (
        <div className="border-t border-slate-200 px-5 3xl:px-6 4xl:px-7 py-4">
          <p className="text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold uppercase tracking-wider text-slate-400">
            ผ่านแล้ว {passed.length} รายการ
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {passed.map((check) => (
              <li
                key={check.code}
                className="flex items-start gap-2 text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] text-slate-500"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="min-w-0 truncate">{check.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CheckRow({
  check,
}: {
  check: PayrollReadinessResponse["checks"][number];
}) {
  const tone = check.blocking
    ? {
        icon: <XCircle className="h-4 w-4 text-rose-500" />,
        label: "ต้องแก้ก่อน",
        chip: "bg-rose-100 text-rose-700",
      }
    : check.status === "WARN" || check.status === "FAIL"
      ? {
          icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
          label: "ควรดู",
          chip: "bg-amber-100 text-amber-800",
        }
      : {
          icon: <Info className="h-4 w-4 text-slate-400" />,
          label: "ข้อมูล",
          chip: "bg-slate-100 text-slate-600",
        };

  return (
    <li className="flex items-start gap-3 px-5 3xl:px-6 4xl:px-7 py-3.5">
      <span className="mt-0.5 shrink-0">{tone.icon}</span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] font-bold text-slate-900">{check.title}</p>
          <span
            className={joinClassName(
              "inline-flex rounded px-1.5 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold",
              tone.chip,
            )}
          >
            {tone.label}
          </span>
          {check.count > 0 ? (
            <span className="text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold text-slate-400">
              {check.count.toLocaleString("th-TH")} รายการ
            </span>
          ) : null}
        </div>

        <p className="mt-0.5 text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] leading-6 text-slate-500">
          {check.description}
        </p>

        {check.recommendation ? (
          <p className="mt-1 text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] leading-6 text-slate-600">
            <span className="font-semibold">วิธีแก้: </span>
            {check.recommendation}
          </p>
        ) : null}

        {check.items.length ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {check.items.slice(0, 8).map((item, index) => (
              <li
                // คนเดียวมีได้หลายรายการในเช็กเดียวกัน (เช่น offsite หลายวัน)
                // จึงต้องมี index ติดไปด้วย ใช้ employeeId อย่างเดียวจะซ้ำ
                key={`${check.code}-${index}-${item.employeeId ?? "no-employee"}`}
                className="text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-500"
              >
                <span className="font-semibold text-slate-700">
                  {item.employeeName || item.employeeCode || "—"}
                </span>
                {item.detail ? ` · ${item.detail}` : ""}
              </li>
            ))}
            {check.items.length > 8 ? (
              <li className="text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-400">
                และอีก {check.items.length - 8} รายการ
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
