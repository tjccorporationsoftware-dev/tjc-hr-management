"use client";

import { useMemo, useState } from "react";
import { Loader2, Search, UserRound, X } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useApiQuery } from "@/lib/use-api";
import type { EmployeeListItem, EmployeeListResponse } from "@/types/employee";

import { cn, employeeName, INPUT_CLASS, LABEL_CLASS } from "./shared";

/*
 * เลือกพนักงานที่จะยื่นคำขอแทน
 * ----------------------------
 * ดึงพนักงานทั้งบริษัทมาไว้ในเครื่องแล้วค้นในหน้าเว็บ (รหัส / ชื่อ / แผนก)
 * เพราะบริษัทหนึ่งมีไม่ถึงพัน การยิง API ทุกครั้งที่พิมพ์ไม่คุ้ม
 *
 * ไม่ส่ง status มา = หลังบ้านตัดคนที่พ้นสภาพออกให้อยู่แล้ว (ลาออก/เลิกจ้าง/ปิดใช้งาน)
 * แต่ยังรวมคนทดลองงานและพักงาน เพราะคนทดลองงานก็ต้องยื่นลาได้
 */

const PAGE_SIZE = 100;

async function fetchAllEmployees(companyId: string) {
  const items: EmployeeListItem[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await apiFetch<EmployeeListResponse>(
      `/employees?page=${page}&pageSize=${PAGE_SIZE}&companyId=${encodeURIComponent(companyId)}`,
    );
    items.push(...(response.items ?? []));
    totalPages = response.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages && page <= 20);

  return items;
}

function matches(employee: EmployeeListItem, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    employee.employeeCode,
    employee.firstName,
    employee.lastName,
    employee.displayName,
    employee.nickname,
    employee.department?.nameTh,
    employee.branch?.nameTh,
    employee.position,
    employee.positionMaster?.nameTh,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keyword
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function EmployeePicker({
  companyId,
  value,
  onChange,
}: {
  companyId: string;
  value: EmployeeListItem | null;
  onChange: (employee: EmployeeListItem | null) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);

  const employeesQuery = useApiQuery(
    queryKeys.employees.list({ companyId, picker: "platform-requests" }),
    () => fetchAllEmployees(companyId),
    { enabled: Boolean(companyId), staleTime: 60_000 },
  );
  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data],
  );
  const loading = Boolean(companyId) && employeesQuery.isPending;
  const error = employeesQuery.isError ? "โหลดรายชื่อพนักงานไม่สำเร็จ" : null;

  const results = useMemo(() => {
    const trimmed = keyword.trim();
    return employees.filter((employee) => matches(employee, trimmed)).slice(0, 40);
  }, [employees, keyword]);

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS}>พนักงาน</span>
        <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="break-words text-sm font-bold text-slate-900">
              {employeeName(value)}
            </div>
            <div className="break-words text-[11px] text-slate-500">
              {value.employeeCode}
              {value.department?.nameTh ? ` · ${value.department.nameTh}` : ""}
              {value.branch?.nameTh ? ` · ${value.branch.nameTh}` : ""}
              {value.status === "PROBATION" ? " · ทดลองงาน" : ""}
              {value.status === "SUSPENDED" ? " · พักงาน" : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setKeyword("");
              setOpen(true);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" />
            เปลี่ยน
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className={LABEL_CLASS}>
        พนักงาน
        {employees.length > 0 ? (
          <span className="ml-1 font-normal text-slate-400">
            ({employees.length.toLocaleString("th-TH")} คน)
          </span>
        ) : null}
      </span>
      <span className="relative">
        {loading ? (
          <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-500" />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        )}
        <input
          type="text"
          value={keyword}
          disabled={!companyId || loading}
          placeholder={
            loading
              ? "กำลังโหลดรายชื่อ..."
              : "พิมพ์รหัส / ชื่อ / แผนก เพื่อค้นหา"
          }
          onChange={(event) => {
            setKeyword(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className={cn(INPUT_CLASS, "pl-9")}
        />
      </span>

      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}

      {open && !loading && companyId ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-400">
              {employees.length === 0
                ? "ไม่พบพนักงานในบริษัทนี้"
                : "ไม่พบพนักงานที่ตรงกับคำค้น"}
            </p>
          ) : (
            results.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(employee);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-violet-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">
                  {employee.employeeCode?.slice(-3) || "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-slate-800">
                    {employeeName(employee)}
                  </span>
                  <span className="block break-words text-[11px] text-slate-500">
                    {employee.employeeCode}
                    {employee.department?.nameTh
                      ? ` · ${employee.department.nameTh}`
                      : ""}
                    {employee.branch?.nameTh ? ` · ${employee.branch.nameTh}` : ""}
                  </span>
                </span>
                {employee.status !== "ACTIVE" ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {employee.status === "PROBATION" ? "ทดลองงาน" : "พักงาน"}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
