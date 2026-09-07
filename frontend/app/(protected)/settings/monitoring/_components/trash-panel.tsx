"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  Box,
  ChevronLeft,
  ChevronRight,
  Database,
  Eraser,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { DateTimeDisplay } from "@/components/common/date-display";
import { Button } from "@/components/kit";
import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import {
  getTrashItems,
  permanentlyDeleteTrashItem,
  restoreTrashItem,
} from "@/lib/api";
import type {
  TrashItem,
  TrashListMeta,
  TrashSummary,
} from "@/types/trash";

type PendingAction =
  | { kind: "restore"; item: TrashItem }
  | { kind: "permanent"; item: TrashItem; confirmText: string };

const PAGE_SIZE = 20;

const GROUP_TONE: Record<string, string> = {
  admin: "bg-slate-50 text-slate-700 border-slate-200",
  organization: "bg-blue-50 text-blue-700 border-blue-100",
  employee: "bg-brand-50 text-brand-700 border-slate-200",
  attendance: "bg-brand-50 text-brand-700 border-cyan-100",
  leave: "bg-emerald-50 text-emerald-700 border-emerald-100",
  overtime: "bg-amber-50 text-amber-700 border-amber-100",
  "time-adjust": "bg-violet-50 text-violet-700 border-violet-100",
  document: "bg-indigo-50 text-indigo-700 border-indigo-100",
  performance: "bg-rose-50 text-rose-700 border-rose-100",
  onboarding: "bg-lime-50 text-lime-700 border-lime-100",
  report: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
  offsite: "bg-teal-50 text-teal-700 border-teal-100",
  payroll: "bg-orange-50 text-orange-700 border-orange-100",
  "payroll-tax": "bg-red-50 text-red-700 border-red-100",
};

function formatCount(value: number | undefined) {
  return Number(value ?? 0).toLocaleString("th-TH");
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "slate",
}: {
  title: string;
  value: number;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "slate" | "blue" | "emerald" | "red";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-600"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-600"
        : tone === "red"
          ? "bg-red-50 text-red-600"
          : "bg-slate-50 text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {formatCount(value)}
          </p>
        </div>
        <div className={["rounded-lg p-3", toneClass].join(" ")}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function GroupBadge({ group, label }: { group: string; label: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        GROUP_TONE[group] ?? "bg-slate-50 text-slate-700 border-slate-200",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function getMetaLines(item: TrashItem) {
  return Object.entries(item.meta ?? {})
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

export function TrashPanel() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [summary, setSummary] = useState<TrashSummary | null>(null);
  const [meta, setMeta] = useState<TrashListMeta | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [processing, setProcessing] = useState(false);
  const [permanentPhrase, setPermanentPhrase] = useState("");

  const loadItems = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await getTrashItems({
        q,
        type,
        group,
        page,
        pageSize: PAGE_SIZE,
      });

      setItems(response.data ?? []);
      setMeta(response.meta ?? null);
      setSummary(response.summary ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "โหลดข้อมูลถังขยะไม่สำเร็จ";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, group, page]);

  const groupOptions = useMemo(() => {
    const groups = summary?.groups ?? [];
    return groups.filter((item) => item.count > 0);
  }, [summary]);

  const typeOptions = useMemo(() => {
    const types = summary?.types ?? [];
    return types.filter((item) => item.count > 0);
  }, [summary]);

  const selectedTypeLabel = typeOptions.find((item) => item.type === type)?.label;
  const selectedGroupLabel = groupOptions.find((item) => item.group === group)?.label;

  const handleRestore = async (item: TrashItem) => {
    setPendingAction({ kind: "restore", item });
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    setPermanentPhrase("");
    setPendingAction({ kind: "permanent", item, confirmText: "ลบถาวร" });
  };

  const confirmAction = async () => {
    if (!pendingAction) return;

    if (
      pendingAction.kind === "permanent" &&
      permanentPhrase.trim() !== pendingAction.confirmText
    ) {
      toast.error("กรุณาพิมพ์คำว่า ลบถาวร เพื่อยืนยัน");
      return;
    }

    setProcessing(true);

    try {
      if (pendingAction.kind === "restore") {
        await restoreTrashItem(pendingAction.item.type, pendingAction.item.id);
        toast.success("กู้คืนรายการเรียบร้อยแล้ว");
      } else {
        await permanentlyDeleteTrashItem(pendingAction.item.type, pendingAction.item.id);
        toast.success("ลบถาวรเรียบร้อยแล้ว");
      }

      setPendingAction(null);
      setPermanentPhrase("");
      await loadItems(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ";
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const clearFilters = () => {
    setQ("");
    setType("");
    setGroup("");
    setPage(1);
  };

  const total = summary?.total ?? 0;
  const activeFilterLabel = [
    selectedGroupLabel ? `กลุ่ม: ${selectedGroupLabel}` : null,
    selectedTypeLabel ? `ประเภท: ${selectedTypeLabel}` : null,
    q ? `ค้นหา: ${q}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5 px-5 py-5">
      <div className="rounded-xl border border-slate-200 bg-white">
        {/* แถบเครื่องมือ — หัวเรื่องอยู่ที่หน้าหลักแล้ว */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <p className="text-[13px] text-slate-500">
            รายการที่ถูกลบแบบ Soft Delete — กู้คืนหรือลบถาวรได้จากหน้านี้
          </p>

          <Button
            variant="secondary"
            onClick={() => loadItems(true)}
            disabled={refreshing}
            icon={
              refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
          >
            รีเฟรช
          </Button>
        </div>

        <div className="grid gap-4 border-b border-slate-100 p-6 lg:grid-cols-3 lg:p-8">
          <SummaryCard
            title="ทั้งหมดในถังขยะ"
            value={total}
            description="รายการที่ถูกลบและยังสามารถกู้คืนได้"
            icon={Database}
            tone="red"
          />
          <SummaryCard
            title="กลุ่มข้อมูล"
            value={summary?.groups?.filter((item) => item.count > 0).length ?? 0}
            description="กลุ่มโมดูลที่มีข้อมูลถูกลบ"
            icon={Box}
            tone="blue"
          />
          <SummaryCard
            title="ประเภทรายการ"
            value={summary?.types?.filter((item) => item.count > 0).length ?? 0}
            description="ชนิดข้อมูลที่พบในถังขยะ"
            icon={ArchiveRestore}
            tone="emerald"
          />
        </div>

        <div className="border-b border-slate-100 p-6 lg:p-8">
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr_1fr_auto]">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-600">ค้นหา</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(event) => {
                    setQ(event.target.value);
                    setPage(1);
                  }}
                  placeholder="ค้นหาชื่อ รหัส เลขคำขอ หรือหมายเหตุ"
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-600">กลุ่มข้อมูล</span>
              <select
                value={group}
                onChange={(event) => {
                  setGroup(event.target.value);
                  setType("");
                  setPage(1);
                }}
                className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
              >
                <option value="">ทุกกลุ่ม</option>
                {groupOptions.map((item) => (
                  <option key={item.group} value={item.group}>
                    {item.label} ({formatCount(item.count)})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-600">ประเภทรายการ</span>
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                }}
                className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
              >
                <option value="">ทุกประเภท</option>
                {typeOptions
                  .filter((item) => !group || item.group === group)
                  .map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.label} ({formatCount(item.count)})
                    </option>
                  ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 xl:w-auto"
              >
                <Filter className="h-4 w-4" />
                ล้างตัวกรอง
              </button>
            </div>
          </div>

          {activeFilterLabel.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {activeFilterLabel.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <LoadingState title="กำลังโหลดรายการในถังขยะ" description="กรุณารอสักครู่ ระบบกำลังรวบรวมข้อมูลที่ถูกลบ" />
      ) : error ? (
        <ErrorState description={error} action={<button type="button" onClick={() => loadItems()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">ลองใหม่</button>} />
      ) : (
        <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">รายการที่ถูกลบ</h2>
              <p className="mt-1 text-sm text-slate-500">
                แสดง {formatCount(items.length)} รายการ จากทั้งหมด {formatCount(meta?.total ?? 0)} รายการ
              </p>
            </div>

            <div className="text-sm text-slate-500">
              หน้า {formatCount(meta?.page ?? 1)} / {formatCount(meta?.totalPages ?? 1)}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="rounded-xl bg-slate-50 p-4 text-slate-400">
                <Trash2 className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                ไม่พบรายการในถังขยะ
              </h3>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                ไม่มีข้อมูลที่ถูกลบตามตัวกรองที่เลือก หรือรายการถูกกู้คืน/ลบถาวรไปแล้ว
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const groupLabel =
                  summary?.groups?.find((groupItem) => groupItem.group === item.group)?.label ??
                  item.group;
                const metaLines = getMetaLines(item);

                return (
                  <div key={`${item.type}-${item.id}`} className="px-6 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <GroupBadge group={item.group} label={groupLabel} />
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {item.typeLabel}
                          </span>
                          {item.status ? (
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                              {item.status}
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-3 truncate text-base font-semibold text-slate-900">
                          {item.title}
                        </h3>

                        {item.subtitle ? (
                          <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p>
                        ) : null}

                        <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-3">
                          <div>
                            ลบเมื่อ: <DateTimeDisplay value={item.deletedAt} />
                          </div>
                          {item.updatedAt ? (
                            <div>
                              แก้ไขล่าสุด: <DateTimeDisplay value={item.updatedAt} />
                            </div>
                          ) : null}
                          <div className="truncate">ID: {item.id}</div>
                          {metaLines.map((line) => (
                            <div key={line} className="truncate">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestore(item)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          <RotateCcw className="h-4 w-4" />
                          กู้คืน
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePermanentDelete(item)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          <Eraser className="h-4 w-4" />
                          ลบถาวร
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-500">
              หน้า {formatCount(meta?.page ?? 1)} จาก {formatCount(meta?.totalPages ?? 1)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!meta?.hasPreviousPage}
                onClick={() => {
                  setPage((current) => Math.max(current - 1, 1));
                  scrollPagerToTop();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={!meta?.hasNextPage}
                onClick={() => {
                  setPage((current) => current + 1);
                  scrollPagerToTop();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ถัดไป
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={[
                    "rounded-lg p-3",
                    pendingAction.kind === "restore"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-red-50 text-red-600",
                  ].join(" ")}
                >
                  {pendingAction.kind === "restore" ? (
                    <RotateCcw className="h-6 w-6" />
                  ) : (
                    <ShieldAlert className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {pendingAction.kind === "restore"
                      ? "ยืนยันการกู้คืนรายการ"
                      : "ยืนยันการลบถาวร"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {pendingAction.item.typeLabel}: {pendingAction.item.title}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  setPermanentPhrase("");
                }}
                disabled={processing}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {pendingAction.kind === "restore" ? (
              <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                ระบบจะนำรายการนี้กลับมาใช้งานอีกครั้ง หากมีรายการ active ที่ใช้รหัสหรือข้อมูลซ้ำอยู่แล้ว ระบบจะแจ้งเตือนและไม่กู้คืนให้
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      การลบถาวรจะลบข้อมูลออกจากฐานข้อมูลจริงและกู้คืนไม่ได้ หากรายการนี้ยังมีข้อมูลอื่นอ้างอิงอยู่ ระบบจะไม่อนุญาตให้ลบถาวร
                    </p>
                  </div>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    พิมพ์คำว่า “ลบถาวร” เพื่อยืนยัน
                  </span>
                  <input
                    value={permanentPhrase}
                    onChange={(event) => setPermanentPhrase(event.target.value)}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-50"
                    placeholder="ลบถาวร"
                  />
                </label>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  setPermanentPhrase("");
                }}
                disabled={processing}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={processing}
                className={[
                  "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                  pendingAction.kind === "restore"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700",
                ].join(" ")}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pendingAction.kind === "restore" ? "ยืนยันกู้คืน" : "ยืนยันลบถาวร"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
