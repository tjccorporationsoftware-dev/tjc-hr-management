"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Eye,
  Loader2,
  Megaphone,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";

import {
  cancelEssComplaint,
  createEssComplaint,
  getEssComplaints,
} from "@/lib/api";

import type { Complaint, ComplaintStatus } from "@/types/document-workflow";

import { formatThaiDateTime as formatUiDateTime } from "@/lib/date-format";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

const PAGE_SIZE = 20;

/* ------------------------------------------------------------------ */
/* Design system tokens                                                */
/* ------------------------------------------------------------------ */

const SURFACE_CLASS =
  "overflow-hidden rounded-[2.25rem] border border-sky-200/90 bg-white shadow-2xl shadow-slate-300/50 ring-1 ring-white max-[1536px]:rounded-[1.75rem]";

const CONTROL_BASE =
  "h-11 w-full rounded-2xl border border-sky-200/90 bg-white text-sm font-medium text-slate-800 shadow-sm shadow-sky-100/70 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 max-[1536px]:h-9 max-[1536px]:rounded-xl max-[1536px]:text-xs";

const INPUT_CLASS = `${CONTROL_BASE} pl-4 pr-4 max-[1536px]:pl-3 max-[1536px]:pr-3`;

const SEARCH_INPUT_CLASS = `${CONTROL_BASE} pl-10 pr-10 max-[1536px]:pl-9 max-[1536px]:pr-9`;

const TEXTAREA_CLASS =
  "w-full resize-none rounded-2xl border border-sky-200/90 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm shadow-sky-100/70 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100";

const PRIMARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-sky-400/40 bg-gradient-to-r from-sky-500 to-cyan-500 px-5 text-sm font-semibold text-white shadow-md shadow-sky-200/80 transition hover:from-sky-600 hover:to-cyan-600 disabled:opacity-60 max-[1536px]:h-9 max-[1536px]:rounded-xl max-[1536px]:px-4 max-[1536px]:text-xs";

const SECONDARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-60 max-[1536px]:h-9 max-[1536px]:rounded-xl max-[1536px]:px-3 max-[1536px]:text-xs";

const GHOST_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 max-[1536px]:h-9 max-[1536px]:rounded-xl max-[1536px]:px-3 max-[1536px]:text-xs";

const TH_CLASS =
  "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 max-[1536px]:px-3 max-[1536px]:py-2.5 max-[1536px]:text-[10px]";

const TD_CLASS =
  "px-4 py-3 align-top text-slate-700 max-[1536px]:px-3 max-[1536px]:py-2.5";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Types + helpers                                                     */
/* ------------------------------------------------------------------ */

type FormState = {
  title: string;
  category: string;
  description: string;
  expectation: string;
};

const initialForm: FormState = {
  title: "",
  category: "",
  description: "",
  expectation: "",
};

const statusOptions: { value: "" | ComplaintStatus; label: string }[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "SUBMITTED", label: "ส่งแล้ว รอรับเรื่อง" },
  { value: "IN_PROGRESS", label: "กำลังดำเนินการ" },
  { value: "RESOLVED", label: "ดำเนินการแล้ว" },
  { value: "CLOSED", label: "ปิดเรื่อง" },
  { value: "CANCELLED", label: "ถอนเรื่อง" },
];

const categoryPresets = [
  "สภาพแวดล้อมการทำงาน",
  "สวัสดิการ",
  "ระบบงาน / IT",
  "เพื่อนร่วมงาน / หัวหน้างาน",
  "ความปลอดภัย",
  "ข้อเสนอแนะทั่วไป",
];

function formatThaiDateTime(value?: string | null) {
  return formatUiDateTime(value);
}

function getStatusLabel(status: ComplaintStatus) {
  return statusOptions.find((item) => item.value === status)?.label ?? status;
}

function getStatusClass(status: ComplaintStatus) {
  if (status === "RESOLVED" || status === "CLOSED") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "IN_PROGRESS") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (status === "CANCELLED") {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

/** ขั้นตอนของเรื่อง เพื่อให้ผู้ยื่นเห็นว่าตอนนี้อยู่ตรงไหน */
function getStageIndex(status: ComplaintStatus) {
  if (status === "SUBMITTED") return 0;
  if (status === "IN_PROGRESS") return 1;
  if (status === "RESOLVED") return 2;
  if (status === "CLOSED") return 3;
  return -1;
}

const stageLabels = ["ส่งเรื่อง", "รับเรื่อง", "ดำเนินการแล้ว", "ปิดเรื่อง"];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function EssComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | ComplaintStatus>("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  const [detailTarget, setDetailTarget] = useState<Complaint | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Complaint | null>(null);
  const [cancelNote, setCancelNote] = useState("");

  const openCount = complaints.filter(
    (item) => item.status === "SUBMITTED" || item.status === "IN_PROGRESS",
  ).length;
  const doneCount = complaints.filter(
    (item) => item.status === "RESOLVED" || item.status === "CLOSED",
  ).length;

  async function loadComplaints(
    nextPage = page,
    nextSearch = search,
    nextStatus = status,
  ) {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await getEssComplaints({
        page: nextPage,
        pageSize: PAGE_SIZE,
        search: nextSearch.trim() || undefined,
        status: nextStatus || undefined,
      });

      setComplaints(response.items);
      setPage(response.meta.page);
      setTotal(response.meta.total);
      setTotalPages(Math.max(response.meta.totalPages, 1));

      setDetailTarget((current) => {
        if (!current) return current;
        return response.items.find((item) => item.id === current.id) ?? current;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดเรื่องของฉันไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      loadComplaints(1, search, status);
    }, 350);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  async function handleCreate() {
    if (!form.title.trim()) {
      setErrorMessage("กรุณาระบุหัวข้อเรื่อง");
      return;
    }

    if (!form.description.trim()) {
      setErrorMessage("กรุณาอธิบายรายละเอียดของเรื่องที่ต้องการแจ้ง");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const created = await createEssComplaint({
        title: form.title.trim(),
        category: form.category.trim() || null,
        description: form.description.trim(),
        expectation: form.expectation.trim() || null,
      });

      setFormOpen(false);
      setForm(initialForm);
      setSuccessMessage(
        `ส่งเรื่องเรียบร้อย เลขที่ ${created.complaintNo} — HR จะรับเรื่องและแจ้งความคืบหน้าให้ทราบ`,
      );
      await loadComplaints(1, search, status);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ส่งเรื่องไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;

    setSaving(true);
    setErrorMessage("");

    try {
      await cancelEssComplaint(cancelTarget.id, {
        note: cancelNote.trim() || undefined,
      });

      setCancelTarget(null);
      setCancelNote("");
      setSuccessMessage("ถอนเรื่องเรียบร้อย");
      await loadComplaints(page, search, status);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ถอนเรื่องไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="w-full max-w-none bg-transparent">
      <section className={SURFACE_CLASS}>
        <div className="relative border-b border-sky-200/80 bg-gradient-to-br from-sky-100 via-sky-50 to-white px-5 py-6 xl:px-6 max-[1536px]:px-4 max-[1536px]:py-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between max-[1536px]:gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/80 bg-white/90 px-3 py-1 text-xs font-bold text-sky-900 shadow-sm shadow-sky-200/70 max-[1536px]:gap-1.5 max-[1536px]:px-2.5 max-[1536px]:text-[11px]">
                <Megaphone className="h-3.5 w-3.5" /> พนักงาน / แจ้งเรื่องถึง HR
              </div>

              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 max-[1536px]:mt-2.5 max-[1536px]:text-xl">
                แจ้งเรื่องและติดตามผล
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 max-[1536px]:mt-1.5 max-[1536px]:text-xs max-[1536px]:leading-5">
                แจ้งเรื่องร้องเรียนหรือข้อเสนอแนะถึง HR
                และติดตามสถานะได้ทุกขั้นตอน เห็นเฉพาะเรื่องที่คุณเป็นผู้ยื่นเท่านั้น
              </p>

              <div className="mt-4 flex flex-wrap gap-2 max-[1536px]:mt-3 max-[1536px]:gap-1.5">
                <span className="inline-flex rounded-full border border-sky-200 bg-white/90 px-3 py-1.5 text-xs font-bold text-sky-800 shadow-sm shadow-sky-100/70 max-[1536px]:px-2.5 max-[1536px]:py-1 max-[1536px]:text-[11px]">
                  เรื่องของฉัน {total.toLocaleString("th-TH")} เรื่อง
                </span>
                <span className="inline-flex rounded-full border border-amber-200 bg-white/90 px-3 py-1.5 text-xs font-bold text-amber-800 shadow-sm shadow-amber-100/70 max-[1536px]:px-2.5 max-[1536px]:py-1 max-[1536px]:text-[11px]">
                  ยังไม่จบ {openCount.toLocaleString("th-TH")} เรื่อง
                </span>
                <span className="inline-flex rounded-full border border-emerald-200 bg-white/90 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm shadow-emerald-100/70 max-[1536px]:px-2.5 max-[1536px]:py-1 max-[1536px]:text-[11px]">
                  ดำเนินการแล้ว {doneCount.toLocaleString("th-TH")} เรื่อง
                </span>
              </div>
            </div>

            <div
              className="relative hidden h-[112px] w-[260px] shrink-0 lg:block max-[1536px]:h-[100px] max-[1536px]:w-[232px]"
              aria-hidden="true"
            >
              <div className="absolute inset-0 rounded-[2.25rem] bg-gradient-to-br from-sky-100/80 via-cyan-100/60 to-indigo-100/70 blur-2xl" />
              <HeroVisual />
            </div>
          </div>
        </div>

        {successMessage ? (
          <div className="flex items-start gap-2 border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 max-[1536px]:px-4 max-[1536px]:py-2.5 max-[1536px]:text-xs">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 max-[1536px]:px-4 max-[1536px]:py-2.5 max-[1536px]:text-xs">
            {errorMessage}
          </div>
        ) : null}

        <section className="space-y-3 border-b border-slate-200 bg-white p-5 xl:p-6 max-[1536px]:space-y-2.5 max-[1536px]:p-4">
          <div className="grid min-w-0 items-end gap-3 xl:grid-cols-[minmax(280px,1fr)_auto] max-[1536px]:gap-2.5">
            <label className="min-w-0">
              <span className="mb-1.5 block text-xs font-semibold text-slate-500 max-[1536px]:mb-1 max-[1536px]:text-[11px]">
                ค้นหาเรื่องของฉัน
              </span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="เลขที่เรื่อง, หัวข้อ, รายละเอียด"
                  className={SEARCH_INPUT_CLASS}
                />
                {loading ? (
                  <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-sky-500" />
                ) : null}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end max-[1536px]:gap-1.5">
              <button
                type="button"
                onClick={() => loadComplaints(page, search, status)}
                className={SECONDARY_BUTTON}
              >
                <RefreshCcw className="h-4 w-4" />
                รีเฟรช
              </button>

              <button
                type="button"
                onClick={() => {
                  setForm(initialForm);
                  setSuccessMessage("");
                  setFormOpen(true);
                }}
                className={cn(PRIMARY_BUTTON, "col-span-2 sm:col-span-1")}
              >
                <Plus className="h-4 w-4" />
                แจ้งเรื่องใหม่
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 max-[1536px]:gap-1.5">
            {statusOptions.map((option) => {
              const active = status === option.value;

              return (
                <button
                  key={option.value || "ALL"}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-bold transition max-[1536px]:h-8 max-[1536px]:px-3 max-[1536px]:text-[11px]",
                    active
                      ? "border-sky-400/40 bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-200/80"
                      : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex flex-col justify-between gap-3 border-b border-sky-200/80 bg-white px-5 py-4 lg:flex-row lg:items-center max-[1536px]:px-4 max-[1536px]:py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-950 max-[1536px]:text-xs">
              เรื่องที่ฉันแจ้ง
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 max-[1536px]:text-[11px]">
              แสดง {complaints.length.toLocaleString("th-TH")} จาก{" "}
              {total.toLocaleString("th-TH")} เรื่อง
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center border-b border-slate-200 bg-white px-5 py-14 text-sm text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-sky-500" />
            กำลังโหลดข้อมูล...
          </div>
        ) : (
          <div className="overflow-x-auto border-b border-slate-200 bg-white">
            <table className="min-w-[820px] w-full divide-y divide-slate-100 text-sm max-[1536px]:min-w-[760px] max-[1536px]:text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className={TH_CLASS}>เลขที่ / หัวข้อ</th>
                  <th className={TH_CLASS}>หมวดหมู่</th>
                  <th className={TH_CLASS}>สถานะ</th>
                  <th className={TH_CLASS}>ความคืบหน้า</th>
                  <th className={TH_CLASS}>วันที่แจ้ง</th>
                  <th className={cn(TH_CLASS, "text-right")}>จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {complaints.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-50 text-sky-500 ring-1 ring-sky-100">
                          <Megaphone className="h-5 w-5" />
                        </span>
                        <span className="text-sm font-semibold text-slate-600">
                          คุณยังไม่เคยแจ้งเรื่องไว้
                        </span>
                        <span className="text-xs text-slate-500">
                          กด &quot;แจ้งเรื่องใหม่&quot;
                          เพื่อส่งเรื่องร้องเรียนหรือข้อเสนอแนะถึง HR
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  complaints.map((item) => (
                    <tr key={item.id} className="transition hover:bg-sky-50/60">
                      <td className={TD_CLASS}>
                        <p className="font-semibold text-slate-900">
                          {item.complaintNo}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.title}
                        </p>
                      </td>
                      <td className={TD_CLASS}>
                        {item.category ? (
                          <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 max-[1536px]:text-[11px]">
                            {item.category}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className={TD_CLASS}>
                        <StatusBadge status={item.status} />
                      </td>
                      <td className={TD_CLASS}>
                        <StageTrack status={item.status} />
                      </td>
                      <td className={TD_CLASS}>
                        {formatThaiDateTime(item.submittedAt)}
                      </td>
                      <td className={cn(TD_CLASS, "text-right")}>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <IconButton
                            title="ดูรายละเอียด"
                            onClick={() => setDetailTarget(item)}
                          >
                            <Eye className="h-4 w-4" />
                          </IconButton>

                          {item.status === "SUBMITTED" ? (
                            <IconButton
                              title="ถอนเรื่อง"
                              tone="rose"
                              onClick={() => {
                                setCancelTarget(item);
                                setCancelNote("");
                              }}
                            >
                              <Undo2 className="h-4 w-4" />
                            </IconButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-4 max-[1536px]:px-4 max-[1536px]:py-3">
          <div className="text-xs font-semibold text-slate-500 max-[1536px]:text-[11px]">
            หน้า {page.toLocaleString("th-TH")} จาก{" "}
            {totalPages.toLocaleString("th-TH")}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                loadComplaints(page - 1, search, status);
                scrollPagerToTop();
              }}
              className={cn(GHOST_BUTTON, "disabled:cursor-not-allowed")}
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => {
                loadComplaints(page + 1, search, status);
                scrollPagerToTop();
              }}
              className={cn(GHOST_BUTTON, "disabled:cursor-not-allowed")}
            >
              ถัดไป
            </button>
          </div>
        </div>
      </section>

      {formOpen ? (
        <Modal
          title="แจ้งเรื่องถึง HR"
          description="เรื่องที่ส่งจะถูกบันทึกในชื่อของคุณ และติดตามสถานะได้จนกว่าจะปิดเรื่อง"
          onClose={() => setFormOpen(false)}
        >
          <div className="space-y-4">
            <Field label="หัวข้อเรื่อง">
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="สรุปเรื่องที่ต้องการแจ้งสั้น ๆ"
                className={INPUT_CLASS}
              />
            </Field>

            <Field label="หมวดหมู่">
              <input
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                placeholder="เลือกจากด้านล่าง หรือพิมพ์เอง"
                className={INPUT_CLASS}
              />
              <span className="mt-2 flex flex-wrap gap-1.5">
                {categoryPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({ ...current, category: preset }))
                    }
                    className={cn(
                      "inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-bold transition",
                      form.category === preset
                        ? "border-sky-300 bg-sky-100 text-sky-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </span>
            </Field>

            <Field label="รายละเอียด">
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={5}
                placeholder="เกิดอะไรขึ้น เมื่อไหร่ ที่ไหน เกี่ยวข้องกับใครบ้าง"
                className={TEXTAREA_CLASS}
              />
            </Field>

            <Field label="สิ่งที่อยากให้เกิดขึ้น (ไม่บังคับ)">
              <textarea
                value={form.expectation}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expectation: event.target.value,
                  }))
                }
                rows={3}
                placeholder="เช่น อยากให้ปรับปรุงเรื่องใด หรือต้องการให้ช่วยเหลืออย่างไร"
                className={TEXTAREA_CLASS}
              />
            </Field>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-sky-900">
              เรื่องนี้จะถูกส่งถึงฝ่ายบุคคลเท่านั้น หัวหน้างานของคุณไม่เห็นเรื่องนี้
              และคุณถอนเรื่องเองได้ตราบใดที่ HR ยังไม่รับเรื่อง
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className={GHOST_BUTTON}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreate}
                className={PRIMARY_BUTTON}
              >
                {saving ? "กำลังส่ง..." : "ส่งเรื่อง"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {detailTarget ? (
        <Modal
          title="รายละเอียดเรื่องที่แจ้ง"
          description={detailTarget.complaintNo}
          onClose={() => setDetailTarget(null)}
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
              <div className="text-xs font-semibold text-slate-500">
                ความคืบหน้า
              </div>
              <div className="mt-3">
                <StageTrack status={detailTarget.status} showLabels />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <DetailRow label="เลขที่เรื่อง" value={detailTarget.complaintNo} />
              <DetailRow label="หัวข้อ" value={detailTarget.title} />
              <DetailRow label="หมวดหมู่" value={detailTarget.category ?? "-"} />
              <DetailRow
                label="สถานะ"
                value={<StatusBadge status={detailTarget.status} />}
              />
              <DetailRow
                label="วันที่แจ้ง"
                value={formatThaiDateTime(detailTarget.submittedAt)}
              />
              <DetailRow
                label="วันที่รับเรื่อง"
                value={
                  detailTarget.handledAt
                    ? formatThaiDateTime(detailTarget.handledAt)
                    : "ยังไม่รับเรื่อง"
                }
              />
              <DetailRow
                label="วันที่ปิดเรื่อง"
                value={
                  detailTarget.closedAt
                    ? formatThaiDateTime(detailTarget.closedAt)
                    : "-"
                }
              />
              <DetailRow label="รายละเอียด" value={detailTarget.description} />
              <DetailRow
                label="สิ่งที่อยากให้เกิดขึ้น"
                value={detailTarget.expectation ?? "-"}
              />
              <DetailRow
                label="บันทึกจาก HR"
                value={detailTarget.note ?? "ยังไม่มีบันทึกเพิ่มเติม"}
                last
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {cancelTarget ? (
        <Modal
          title="ถอนเรื่องที่แจ้ง"
          description={`${cancelTarget.complaintNo} · ${cancelTarget.title}`}
          size="sm"
          onClose={() => setCancelTarget(null)}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              ถอนแล้วเรื่องจะถูกปิดและ HR จะไม่ดำเนินการต่อ
              หากต้องการแจ้งใหม่ต้องยื่นเรื่องใหม่อีกครั้ง
            </div>

            <Field label="เหตุผล (ไม่บังคับ)">
              <textarea
                value={cancelNote}
                onChange={(event) => setCancelNote(event.target.value)}
                rows={3}
                className={TEXTAREA_CLASS}
              />
            </Field>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className={GHOST_BUTTON}
              >
                ไม่ถอน
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCancel}
                className={PRIMARY_BUTTON}
              >
                {saving ? "กำลังบันทึก..." : "ยืนยันถอนเรื่อง"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

function HeroVisual() {
  return (
    <div className="absolute inset-0">
      <div className="absolute bottom-3 right-[104px] h-[72px] w-[86px] rounded-[18px] border border-white/85 bg-white/85 shadow-[0_18px_40px_rgba(14,165,233,0.12)] backdrop-blur">
        <div className="absolute left-3.5 top-4 h-2 w-[52px] rounded-full bg-sky-300" />
        <div className="absolute left-3.5 top-[32px] h-2 w-[38px] rounded-full bg-sky-200" />
        <div className="absolute left-3.5 top-[46px] h-2 w-[58px] rounded-full bg-indigo-200/80" />
      </div>

      <div className="absolute bottom-0 right-0 grid h-[56px] w-[56px] place-items-center rounded-[18px] border border-white/85 bg-white/90 shadow-[0_18px_40px_rgba(14,165,233,0.12)] backdrop-blur">
        <div className="grid h-[30px] w-[30px] place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <Megaphone className="h-4 w-4" />
        </div>
      </div>

      <div className="absolute bottom-0 right-[76px] inline-flex items-center gap-1.5 rounded-xl border border-sky-100 bg-white/92 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 shadow-[0_10px_22px_rgba(14,165,233,0.1)] backdrop-blur">
        <ShieldCheck className="h-3.5 w-3.5" />
        ส่งถึง HR เท่านั้น
      </div>

      <div className="absolute bottom-[74px] right-[56px] grid h-7 w-7 place-items-center rounded-xl border border-white/75 bg-white/78 text-emerald-600 shadow-md backdrop-blur">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ComplaintStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 max-[1536px]:text-[11px]",
        getStatusClass(status),
      )}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function StageTrack({
  status,
  showLabels = false,
}: {
  status: ComplaintStatus;
  showLabels?: boolean;
}) {
  const stageIndex = getStageIndex(status);

  if (stageIndex < 0) {
    return <span className="text-xs text-slate-400">ถอนเรื่องแล้ว</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {stageLabels.map((label, index) => {
        const reached = index <= stageIndex;

        return (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-6 rounded-full transition",
                reached ? "bg-sky-500" : "bg-slate-200",
              )}
              title={label}
            />
            {showLabels ? (
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  reached ? "text-sky-700" : "text-slate-400",
                )}
              >
                {label}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-500 max-[1536px]:mb-1 max-[1536px]:text-[11px]">
        {label}
      </span>
      {children}
    </label>
  );
}

function IconButton({
  title,
  children,
  onClick,
  tone = "slate",
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  tone?: "slate" | "sky" | "rose";
}) {
  const toneClass = {
    slate:
      "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
    sky: "border-sky-200 text-sky-600 hover:border-sky-300 hover:bg-sky-50",
    rose: "border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50",
  }[tone];

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white shadow-sm transition max-[1536px]:h-8 max-[1536px]:w-8",
        toneClass,
      )}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  description,
  children,
  onClose,
  size = "lg",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: "sm" | "lg";
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div
        className={cn(
          "flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-[2.25rem] border border-sky-200/90 bg-white shadow-[0_26px_80px_rgba(15,23,42,0.22)] ring-1 ring-white max-[1536px]:rounded-[1.75rem]",
          size === "sm" ? "max-w-xl" : "max-w-3xl",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-sky-200/80 bg-gradient-to-br from-sky-100 via-sky-50 to-white px-6 py-4 max-[1536px]:px-5 max-[1536px]:py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-950 max-[1536px]:text-sm">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-200 bg-white/90 text-slate-500 transition hover:bg-sky-50 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 max-[1536px]:p-5">{children}</div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-1 bg-white px-4 py-3 md:grid-cols-[180px_1fr] md:gap-4",
        !last && "border-b border-slate-200",
      )}
    >
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="whitespace-pre-line text-sm text-slate-900">{value}</div>
    </div>
  );
}
