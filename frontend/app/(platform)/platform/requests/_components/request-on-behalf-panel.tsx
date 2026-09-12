"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Info } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { getOrganizationCompanies } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useApiQuery } from "@/lib/use-api";
import type { CompanyItem } from "@/types/organization";
import type { EmployeeListItem } from "@/types/employee";

import { EmployeePicker } from "./employee-picker";
import { LeaveForm } from "./leave-form";
import { OffsiteForm } from "./offsite-form";
import { OvertimeForm } from "./overtime-form";
import { RecentRequests } from "./recent-requests";
import {
  REQUEST_KINDS,
  requestDomainQueryKey,
  type RequestKind,
} from "./request-kinds";
import { CARD_CLASS, cn, INPUT_CLASS, LABEL_CLASS } from "./shared";
import { TimeAdjustForm } from "./time-adjust-form";

/*
 * ยื่นคำขอแทนพนักงาน (Platform Console)
 * ------------------------------------
 * ลำดับใช้งาน: เลือกบริษัท → เลือกพนักงาน → เลือกประเภทคำขอ → กรอก → บันทึกร่าง/ส่ง
 *
 * ทุกใบวิ่งเข้าสายอนุมัติปกติของพนักงานคนนั้น เหมือนเขายื่นเองจาก ESS
 * ต่างแค่ผู้บันทึกเป็นผู้ดูแล (audit log จะเห็นบัญชีผู้ดูแลเป็นคนสร้าง)
 * หน้านี้ไม่มีปุ่มอนุมัติ — อนุมัติต้องไปทำที่ศูนย์คำขอตามสายงานเช่นเดิม
 */

export function RequestOnBehalfPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const permissions = useMemo(
    () => new Set((user?.permissions ?? []).map((item) => String(item).toUpperCase())),
    [user?.permissions],
  );

  const availableKinds = useMemo(
    () => REQUEST_KINDS.filter((meta) => permissions.has(meta.permission)),
    [permissions],
  );

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [employee, setEmployee] = useState<EmployeeListItem | null>(null);
  const [selectedKind, setSelectedKind] = useState<RequestKind>("leave");

  // params ต่างจากหน้าภาพรวม (ที่ไม่กรอง status) key จึงคนละตัว ไม่ชนรูปแบบผลลัพธ์กัน
  const companiesQuery = useApiQuery(
    queryKeys.organization.companies({ pageSize: 100, status: "ACTIVE" }),
    () => getOrganizationCompanies({ pageSize: 100, status: "ACTIVE" }),
  );
  const companies: CompanyItem[] = useMemo(
    () => companiesQuery.data?.items ?? [],
    [companiesQuery.data],
  );

  // ยังไม่ได้เลือก → บริษัทแรก; แท็บที่เลือกไม่มีสิทธิ์ → แท็บแรกที่ใช้ได้
  const companyId =
    selectedCompanyId && companies.some((item) => item.id === selectedCompanyId)
      ? selectedCompanyId
      : (companies[0]?.id ?? "");
  const kind: RequestKind | null = availableKinds.some((meta) => meta.kind === selectedKind)
    ? selectedKind
    : (availableKinds[0]?.kind ?? null);

  const activeMeta = availableKinds.find((meta) => meta.kind === kind) ?? null;
  const company = companies.find((item) => item.id === companyId) ?? null;

  /* ล้างทั้งโดเมน → รายการล่าสุดโหลดใหม่ และยอดลาคงเหลือ/รออนุมัติของคนนั้นก็อัปเดตตาม */
  function handleSaved() {
    if (!kind) return;
    void queryClient.invalidateQueries({ queryKey: requestDomainQueryKey(kind) });
  }

  return (
    <div className="space-y-5">
      {/* ---------------- เลือกบริษัท + พนักงาน ---------------- */}
      <section className={cn(CARD_CLASS, "space-y-4")}>
        <div className="grid gap-4 md:grid-cols-[minmax(220px,300px)_1fr]">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_CLASS}>บริษัท</span>
            <span className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={companyId}
                disabled={companiesQuery.isPending}
                onChange={(event) => {
                  setSelectedCompanyId(event.target.value);
                  setEmployee(null);
                }}
                className={cn(INPUT_CLASS, "pl-9")}
              >
                {companiesQuery.isPending ? (
                  <option value="">กำลังโหลด...</option>
                ) : companies.length === 0 ? (
                  <option value="">ไม่พบบริษัทที่เปิดใช้งาน</option>
                ) : null}
                {companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nameTh} ({item.code})
                  </option>
                ))}
              </select>
            </span>
          </label>

          <EmployeePicker companyId={companyId} value={employee} onChange={setEmployee} />
        </div>

        {companiesQuery.isError ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            โหลดรายชื่อบริษัทไม่สำเร็จ
          </p>
        ) : null}
      </section>

      {availableKinds.length === 0 || !kind ? (
        <section className={cn(CARD_CLASS, "flex items-start gap-3 text-sm text-slate-600")}>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
          บัญชีนี้ไม่มีสิทธิ์สร้างคำขอประเภทใดเลย (LEAVE_CREATE / OT_CREATE /
          TIME_ADJUST_CREATE / OFFSITE_REQUEST_CREATE) ให้เพิ่มสิทธิ์ที่เมนู
          &quot;สิทธิ์การเข้าถึง&quot; ก่อน
        </section>
      ) : !employee ? (
        <section className={cn(CARD_CLASS, "py-14 text-center")}>
          <p className="text-sm font-semibold text-slate-600">
            เลือกพนักงานก่อน แล้วฟอร์มคำขอจะปรากฏที่นี่
          </p>
          <p className="mt-1 text-xs text-slate-400">
            คำขอจะเข้าสายอนุมัติของพนักงานคนนั้นตามปกติ เหมือนเขายื่นเองจาก ESS
          </p>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          {/* ---------------- ฟอร์ม ---------------- */}
          <section className={cn(CARD_CLASS, "space-y-5")}>
            <div className="flex flex-wrap gap-2">
              {availableKinds.map((meta) => {
                const active = meta.kind === kind;
                const Icon = meta.icon;
                return (
                  <button
                    key={meta.kind}
                    type="button"
                    onClick={() => setSelectedKind(meta.kind)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-semibold transition",
                      active
                        ? "border-violet-500 bg-violet-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/40",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {activeMeta ? (
              <div>
                <h2 className="text-base font-extrabold text-slate-950">
                  ยื่น{activeMeta.label}แทน{" "}
                  <span className="text-violet-700">
                    {employee.displayName?.trim() ||
                      `${employee.firstName} ${employee.lastName}`.trim()}
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  {activeMeta.description}
                  {company ? ` · ${company.nameTh}` : ""}
                </p>
              </div>
            ) : null}

            {/* key = คน → เปลี่ยนคนแล้วฟอร์มถูกสร้างใหม่ทั้งชุด ไม่ลากค่าของคนก่อนมา */}
            {kind === "leave" ? (
              <LeaveForm key={employee.id} employee={employee} onSaved={handleSaved} />
            ) : kind === "overtime" ? (
              <OvertimeForm key={employee.id} employee={employee} onSaved={handleSaved} />
            ) : kind === "time-adjust" ? (
              <TimeAdjustForm key={employee.id} employee={employee} onSaved={handleSaved} />
            ) : (
              <OffsiteForm key={employee.id} employee={employee} onSaved={handleSaved} />
            )}
          </section>

          {/* ---------------- รายการล่าสุด ---------------- */}
          <section className={cn(CARD_CLASS, "h-fit")}>
            <RecentRequests kind={kind} employee={employee} permissions={permissions} />
          </section>
        </div>
      )}
    </div>
  );
}
