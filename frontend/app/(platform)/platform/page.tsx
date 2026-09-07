"use client";

import Link from "next/link";
import {
  Building2,
  GitBranch,
  Layers,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useApiQuery } from "@/lib/use-api";

type PlatformCompany = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  status: string;
  _count?: { branches?: number; departments?: number };
};


export default function PlatformDashboardPage() {
  // key เดียวกับหน้า /platform/companies ทำให้สลับไปมาแล้วใช้ cache ร่วมกัน
  const companiesQuery = useApiQuery(
    queryKeys.organization.companies({ pageSize: 100 }),
    () => apiFetch<PlatformCompany[]>("/organization/companies?pageSize=100"),
  );

  const companies = Array.isArray(companiesQuery.data)
    ? companiesQuery.data
    : [];
  const loading = companiesQuery.isPending;
  const error = companiesQuery.isError ? "โหลดข้อมูลบริษัทไม่สำเร็จ" : null;

  const totalBranches = companies.reduce(
    (sum, c) => sum + (c._count?.branches ?? 0),
    0,
  );
  const totalDepartments = companies.reduce(
    (sum, c) => sum + (c._count?.departments ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-600">
          Platform Console
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
          ภาพรวมแพลตฟอร์ม
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          ควบคุมทุกบริษัทในระบบจากที่เดียว — สร้างบริษัทใหม่ ผูกผู้ดูแลบริษัท
          และดูโครงสร้างองค์กรทั้งหมด
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Building2 className="h-5 w-5" />}
          label="บริษัททั้งหมด"
          value={companies.length}
          tone="violet"
        />
        <StatCard
          icon={<GitBranch className="h-5 w-5" />}
          label="สาขารวม"
          value={totalBranches}
          tone="blue"
        />
        <StatCard
          icon={<Layers className="h-5 w-5" />}
          label="แผนกรวม"
          value={totalDepartments}
          tone="cyan"
        />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-950">บริษัทในระบบ</h2>
          <Link
            href="/platform/companies"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            จัดการบริษัท
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
            กำลังโหลด...
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-rose-600">{error}</div>
        ) : companies.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            ยังไม่มีบริษัทในระบบ — เริ่มสร้างบริษัทแรกได้ที่ &quot;จัดการบริษัท&quot;
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-slate-950">
                    {company.nameTh}
                  </div>
                  <div className="text-xs text-slate-500">{company.code}</div>
                  <div className="mt-2 flex gap-3 text-xs text-slate-600">
                    <span>🏬 {company._count?.branches ?? 0} สาขา</span>
                    <span>🗂️ {company._count?.departments ?? 0} แผนก</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "violet" | "blue" | "cyan";
}) {
  const toneClass =
    tone === "violet"
      ? "bg-violet-100 text-violet-700"
      : tone === "blue"
        ? "bg-blue-100 text-blue-700"
        : "bg-cyan-100 text-cyan-700";
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${toneClass}`}
      >
        {icon}
      </div>
      <div className="text-3xl font-extrabold tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-500">{label}</div>
    </div>
  );
}
