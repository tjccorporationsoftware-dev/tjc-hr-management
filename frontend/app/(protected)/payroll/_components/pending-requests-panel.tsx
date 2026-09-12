"use client";

import { useMemo } from "react";
import { CheckCircle2, FileClock, UserRound } from "lucide-react";

import { Badge, Notice, joinClassName } from "@/components/kit";
import type {
  PayrollReadinessCheck,
  PayrollReadinessResponse,
} from "@/types/payroll";

/**
 * ใบคำขอค้างของงวดนี้
 * -----------------------------------------------------------------------------
 * ใบลา OT แก้เวลา และงานนอกสถานที่ ที่ยังไม่จบในช่วงงวด — จัดกลุ่มรายคน
 *
 * ทำไมต้องแยกเป็นแท็บของตัวเอง ทั้งที่ผลตรวจก็มีอยู่แล้ว
 * ------------------------------------------------------
 * แท็บผลตรวจเรียงตาม "เรื่อง" (ใบลาค้างกี่ใบ · OT ค้างกี่ใบ) ซึ่งตอบคำถามว่า
 * งวดนี้ติดอะไรบ้าง แต่คำถามที่คนทำเงินเดือนถามจริงคือ "ต้องไปตามใคร"
 * ถ้าคนหนึ่งมีทั้งใบลาและ OT ค้าง ในแท็บผลตรวจจะอยู่คนละเรื่องกัน
 * ต้องกวาดตาหาเองว่าเป็นคนเดียวกัน ที่นี่จึงรวมมาไว้เป็นบรรทัดเดียวต่อคน
 */

/** เช็คที่นับว่าเป็น "ใบคำขอค้าง" — ตรงกับรหัสที่หลังบ้านส่งมา */
const PENDING_REQUEST_CODES: Record<string, { label: string; short: string }> = {
  LEAVE_PENDING_APPROVAL: { label: "ใบลา", short: "ลา" },
  OVERTIME_PENDING_APPROVAL: { label: "คำขอ OT", short: "OT" },
  TIME_ADJUST_PENDING_APPROVAL: { label: "คำขอแก้เวลา", short: "แก้เวลา" },
  OFFSITE_PENDING_REVIEW: { label: "งานนอกสถานที่", short: "นอกสถานที่" },
};

type PendingRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  departmentName: string | null;
  /** รายการค้างของคนนี้ แยกตามประเภทใบ */
  entries: Array<{ code: string; label: string; detail: string }>;
};

function isPendingCheck(check: PayrollReadinessCheck) {
  return Boolean(PENDING_REQUEST_CODES[check.code]) && check.status !== "PASS";
}

export function PendingRequestsPanel({
  readiness,
  loading,
  onFocusEmployee,
}: {
  readiness: PayrollReadinessResponse | null;
  loading: boolean;
  /** กดชื่อคนแล้วกระโดดไปหาแถวของคนนั้นในแท็บยอดรายคน */
  onFocusEmployee?: (employeeId: string) => void;
}) {
  const { rows, byType } = useMemo(() => {
    const checks = (readiness?.checks ?? []).filter(isPendingCheck);
    const map = new Map<string, PendingRow>();
    const typeCounts = new Map<string, number>();

    for (const check of checks) {
      const meta = PENDING_REQUEST_CODES[check.code];
      typeCounts.set(check.code, check.items.length);

      for (const item of check.items) {
        /* ไม่มีรหัสพนักงานก็ยังต้องเห็น — จัดเข้ากลุ่ม "ไม่ระบุคน" แทนการทิ้ง */
        const key = item.employeeId ?? `unknown:${item.employeeName ?? ""}`;
        const current = map.get(key) ?? {
          employeeId: item.employeeId ?? "",
          employeeName: item.employeeName ?? "ไม่ระบุชื่อ",
          employeeCode: item.employeeCode ?? null,
          departmentName: item.departmentName ?? null,
          entries: [],
        };

        current.entries.push({
          code: check.code,
          label: meta.short,
          detail: item.detail,
        });

        map.set(key, current);
      }
    }

    const sorted = [...map.values()].sort(
      (a, b) =>
        b.entries.length - a.entries.length ||
        (a.employeeCode ?? "").localeCompare(b.employeeCode ?? ""),
    );

    return { rows: sorted, byType: typeCounts };
  }, [readiness]);

  if (loading) {
    return (
      <div className="px-5 py-16 text-center text-[13px] text-slate-400 3xl:px-6 3xl:text-[14px] 4xl:px-7">
        กำลังตรวจใบคำขอของงวดนี้…
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className="px-5 py-5 3xl:px-6 4xl:px-7">
        <Notice tone="info">
          ยังไม่ได้ตรวจ — กดคำนวณเงินเดือนก่อน แล้วใบคำขอที่ค้างจะขึ้นที่นี่
        </Notice>
      </div>
    );
  }

  const totalRequests = [...byType.values()].reduce(
    (sum, value) => sum + value,
    0,
  );

  return (
    <div>
      <div className="border-b border-slate-200 px-5 py-3 3xl:px-6 4xl:px-7">
        {rows.length === 0 ? (
          <Notice tone="positive" icon={<CheckCircle2 className="h-4 w-4" />}>
            ไม่มีใบคำขอค้างในช่วงงวดนี้ — ยอดที่คำนวณจะไม่เปลี่ยนจากใบที่ยังไม่จบ
          </Notice>
        ) : (
          <Notice tone="warning" icon={<FileClock className="h-4 w-4" />}>
            มีใบคำขอค้าง {totalRequests.toLocaleString("th-TH")} ใบ จากพนักงาน{" "}
            {rows.length.toLocaleString("th-TH")} คน — อนุมัติหรือปฏิเสธให้จบ
            แล้วคำนวณใหม่ ไม่งั้นยอดลา/OT/ยอดหักอาจไม่ตรง
          </Notice>
        )}

        {byType.size > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {[...byType.entries()].map(([code, total]) => (
              <Badge key={code} tone="warning">
                {PENDING_REQUEST_CODES[code].label} {total.toLocaleString("th-TH")} ใบ
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {rows.length ? (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li
              key={row.employeeId || row.employeeName}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-amber-50/40 3xl:px-6 4xl:px-7"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <UserRound className="h-4 w-4" />
              </span>

              <div className="min-w-[13rem] flex-1">
                {row.employeeId && onFocusEmployee ? (
                  <button
                    type="button"
                    onClick={() => onFocusEmployee(row.employeeId)}
                    className="text-left text-[13.5px] font-bold text-slate-900 underline-offset-2 hover:text-brand-700 hover:underline 3xl:text-[14px]"
                  >
                    {row.employeeName}
                  </button>
                ) : (
                  <p className="text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
                    {row.employeeName}
                  </p>
                )}
                <p className="break-words text-[11.5px] text-slate-500 3xl:text-[12px]">
                  {row.employeeCode ?? "-"}
                  {row.departmentName ? ` · ${row.departmentName}` : ""}
                </p>
              </div>

              <ul className="min-w-[18rem] flex-[2] space-y-1">
                {row.entries.map((entry, index) => (
                  <li
                    key={`${entry.code}-${index}`}
                    className="flex items-start gap-2 text-[12.5px] text-slate-600 3xl:text-[13px]"
                  >
                    <span
                      className={joinClassName(
                        "mt-[3px] shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold",
                        "bg-amber-100 text-amber-800",
                      )}
                    >
                      {entry.label}
                    </span>
                    <span className="min-w-0 flex-1">{entry.detail}</span>
                  </li>
                ))}
              </ul>

              <span className="shrink-0 text-[12px] font-semibold text-amber-700">
                ค้าง {row.entries.length.toLocaleString("th-TH")} ใบ
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** รหัสพนักงานที่มีใบค้าง ใช้ทำเครื่องหมายบนตารางยอดรายคน */
export function pendingEmployeeIds(
  readiness: PayrollReadinessResponse | null,
): Set<string> {
  const ids = new Set<string>();

  for (const check of readiness?.checks ?? []) {
    if (!isPendingCheck(check)) continue;

    for (const item of check.items) {
      if (item.employeeId) ids.add(item.employeeId);
    }
  }

  return ids;
}
