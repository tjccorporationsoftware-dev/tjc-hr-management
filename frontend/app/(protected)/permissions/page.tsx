"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { Eye, KeyRound, Loader2, RefreshCcw, Search, ShieldCheck, X } from "lucide-react";

import { DateTimeDisplay } from "@/components/common/date-display";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/feedback-state";
import { apiFetch, apiFetchWithMeta } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { PaginationMeta, PermissionItem, PermissionListSummary } from "@/types/access-control";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

const cardClass = "rounded-3xl border border-slate-200 bg-white shadow-sm";
const inputClass =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function PermissionsPage() {
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPermission, setSelectedPermission] = useState<PermissionItem | null>(null);

  const filters = useMemo(
    () => ({ q: q.trim(), group, page, pageSize: 30 }),
    [q, group, page],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.group) params.set("group", filters.group);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
    return params.toString();
  }, [filters]);

  const permissionsQuery = useApiQuery(
    queryKeys.accessControl.permissions(filters),
    () =>
      apiFetchWithMeta<PermissionItem[], PaginationMeta, PermissionListSummary>(
        `/permissions?${queryString}`,
      ),
    // คงตารางเดิมไว้ระหว่างเปลี่ยนหน้า/ตัวกรอง แทนที่จะกระพริบเป็นหน้าโหลด
    { placeholderData: keepPreviousData },
  );

  const groupsQuery = useApiQuery(
    queryKeys.accessControl.permissionGroups(),
    () => apiFetch<string[]>("/permissions/groups"),
    // รายการกลุ่มแทบไม่เปลี่ยน ไม่ต้องยิงซ้ำบ่อย
    { staleTime: 5 * 60_000 },
  );

  const permissions = permissionsQuery.data?.data ?? [];
  const meta = permissionsQuery.data?.meta ?? null;
  const permissionSummary = permissionsQuery.data?.summary ?? null;
  const groups = groupsQuery.data ?? [];

  // แสดงหน้าโหลดเฉพาะครั้งแรกจริง ๆ ไม่ใช่ทุกครั้งที่เปลี่ยนตัวกรอง
  const loading = permissionsQuery.isPending;
  const error = permissionsQuery.isError
    ? getErrorMessage(permissionsQuery.error, "โหลด Permission ไม่สำเร็จ")
    : "";

  const groupedCounts = useMemo(() => {
    return (permissionSummary?.groupCounts ?? [])
      .map((item) => [item.group, item.count] as const)
      .sort((a, b) => b[1] - a[1]);
  }, [permissionSummary]);

  function refreshAll() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.accessControl.all,
    });
  }

  useEffect(() => {
    setPage(1);
  }, [q, group]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-[1720px] space-y-6">
        <section className={cn(cardClass, "p-6")}>
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <div className="text-sm font-semibold text-blue-600">ผู้ดูแลระบบ / Permission Center</div>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Permissions</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                รายการสิทธิ์ทั้งหมดที่ใช้ควบคุมเมนูและ API ภายในระบบ หน้านี้เป็น read-only เพื่อป้องกันการแก้ไข system permission โดยไม่ตั้งใจ
              </p>
            </div>
            <button type="button" onClick={refreshAll} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              {permissionsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              รีเฟรช
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Permission ทั้งหมด" value={permissionSummary?.total ?? meta?.total ?? 0} subtitle="Total permissions from API" icon={<KeyRound className="h-5 w-5" />} />
            <SummaryCard title="ใช้งานอยู่" value={permissionSummary?.active ?? 0} subtitle="Active permissions from API" icon={<ShieldCheck className="h-5 w-5" />} tone="emerald" />
            <SummaryCard title="Inactive" value={permissionSummary?.inactive ?? 0} subtitle="Inactive permissions from API" icon={<KeyRound className="h-5 w-5" />} tone="orange" />
            <SummaryCard title="กลุ่มสิทธิ์" value={permissionSummary?.groupTotal ?? groups.length} subtitle="Permission groups from API" icon={<ShieldCheck className="h-5 w-5" />} tone="violet" />
          </div>

          {groupedCounts.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {groupedCounts.slice(0, 12).map(([groupName, count]) => (
                <span key={groupName} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {groupName}: {count.toLocaleString("th-TH")}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_240px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="ค้นหา Permission code, ชื่อ หรือกลุ่ม" className={cn(inputClass, "pl-11")} />
            </div>
            <select value={group} onChange={(event) => setGroup(event.target.value)} className={inputClass}>
              <option value="">ทุกกลุ่ม</option>
              {groups.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button type="button" onClick={() => { setQ(""); setGroup(""); setPage(1); }} className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              ล้างตัวกรอง
            </button>
          </div>
        </section>

        {loading ? (
          <LoadingState title="กำลังโหลด Permission" />
        ) : error ? (
          <ErrorState title="โหลด Permission ไม่สำเร็จ" description={error} action={<button type="button" onClick={() => void permissionsQuery.refetch()} className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">ลองโหลดใหม่</button>} />
        ) : permissions.length === 0 ? (
          <EmptyState title="ไม่พบ Permission" description="ลองปรับตัวกรองหรือค้นหาด้วยคำอื่น" />
        ) : (
          <section className={cn(cardClass, "overflow-hidden")}>
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-950">รายการ Permission</h2>
              <p className="mt-1 text-xs text-slate-500">ทั้งหมด {meta?.total?.toLocaleString("th-TH") ?? "-"} รายการ</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Permission</th>
                    <th className="px-6 py-3 font-semibold">Group</th>
                    <th className="px-6 py-3 font-semibold">สถานะ</th>
                    <th className="px-6 py-3 font-semibold">สร้างเมื่อ</th>
                    <th className="px-6 py-3 font-semibold">แก้ไขล่าสุด</th>
                    <th className="px-6 py-3 font-semibold">Description</th>
                    <th className="px-6 py-3 text-right font-semibold">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {permissions.map((permission) => (
                    <tr key={permission.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-4 align-top">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><KeyRound className="h-4 w-4" /></div>
                          <div>
                            <div className="font-semibold text-slate-950">{permission.code}</div>
                            <div className="mt-0.5 text-xs text-slate-500">{permission.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top"><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{permission.group}</span></td>
                      <td className="px-6 py-4 align-top"><PermissionStatusBadge active={permission.isActive !== false} /></td>
                      <td className="px-6 py-4 align-top text-xs text-slate-500"><DateTimeDisplay value={permission.createdAt} /></td>
                      <td className="px-6 py-4 align-top text-xs text-slate-500"><DateTimeDisplay value={permission.updatedAt} /></td>
                      <td className="px-6 py-4 align-top text-sm text-slate-500">{permission.description ?? "-"}</td>
                      <td className="px-6 py-4 align-top text-right">
                        <button type="button" onClick={() => setSelectedPermission(permission)} className="inline-flex h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" />ดู</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} meta={meta} onPageChange={setPage} />
          </section>
        )}
      </div>

      {selectedPermission ? (
        <PermissionDrawer permission={selectedPermission} onClose={() => setSelectedPermission(null)} />
      ) : null}
    </main>
  );
}

function SummaryCard({ title, value, subtitle, icon, tone = "blue" }: { title: string; value: number | string; subtitle: string; icon: ReactNode; tone?: "blue" | "emerald" | "violet" | "orange" }) {
  const toneClass = tone === "emerald" ? "bg-emerald-50 text-emerald-600" : tone === "violet" ? "bg-violet-50 text-violet-600" : tone === "orange" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600";
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{typeof value === "number" ? value.toLocaleString("th-TH") : value}</div>
          <div className="mt-1 text-xs text-slate-400">{subtitle}</div>
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", toneClass)}>{icon}</div>
      </div>
    </div>
  );
}

function PermissionStatusBadge({ active }: { active: boolean }) {
  return <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", active ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600")}>{active ? "Active" : "Inactive"}</span>;
}

function PermissionDrawer({ permission, onClose }: { permission: PermissionItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Permission Detail</div>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">{permission.code}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6">
          <DetailRow label="ชื่อสิทธิ์" value={permission.name} />
          <DetailRow label="กลุ่ม" value={permission.group} />
          <DetailRow label="สถานะ" value={permission.isActive === false ? "Inactive" : "Active"} />
          <DetailRow label="รายละเอียด" value={permission.description ?? "-"} />
          <DetailRow label="วันที่สร้าง" value={<DateTimeDisplay value={permission.createdAt} />} />
          <DetailRow label="แก้ไขล่าสุด" value={<DateTimeDisplay value={permission.updatedAt} />} />
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
            สิทธิ์เป็นข้อมูลระบบแบบ read-only ให้แก้การใช้งานผ่านหน้า Roles โดยเลือก Permission ให้แต่ละ Role แทน
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Pagination({ page, meta, onPageChange }: { page: number; meta: PaginationMeta | null; onPageChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
      <div className="text-xs text-slate-500">หน้า {meta?.page ?? page} / {meta?.totalPages ?? 1}</div>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => {
          onPageChange(Math.max(page - 1, 1));
          scrollPagerToTop();
        }} className="h-9 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 disabled:opacity-40">ก่อนหน้า</button>
        <button type="button" disabled={meta ? page >= meta.totalPages : true} onClick={() => {
          onPageChange(page + 1);
          scrollPagerToTop();
        }} className="h-9 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 disabled:opacity-40">ถัดไป</button>
      </div>
    </div>
  );
}
