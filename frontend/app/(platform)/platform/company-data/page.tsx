"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCcw, Trash2 } from "lucide-react";

import {
  deleteCompanyDataItems,
  getCompanyDataDatasets,
  getCompanyDataItems,
  getCompanyDataSummary,
  getOrganizationCompanies,
  purgeCompanyData,
} from "@/lib/api";
import type {
  CompanyDataItem,
  CompanyDatasetMeta,
} from "@/types/company-data";
import type { CompanyItem } from "@/types/organization";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

/*
 * หน้าดูแลข้อมูลรายบริษัทของผู้ดูแลระดับทั้งระบบ
 *
 * ใช้สองงาน: ล้างข้อมูลทดสอบก่อนส่งมอบ และไล่ดู/ลบข้อมูลที่หลุดเข้ามาผิด
 * ทุกการลบวิ่งผ่าน endpoint ที่กรองด้วยรหัสบริษัทซ้ำอีกชั้นเสมอ
 * และของที่มีถังขยะจะไปโผล่ที่ ตั้งค่า › ถังขยะ ให้กู้คืนได้
 *
 * สีสันยึดตามหน้าอื่นใน Platform Console — พื้นขาว ตัวอักษรเข้ม เน้นด้วยสีม่วง
 * (แถบเมนูซ้ายเป็นสีเข้มของ shell ไม่ใช่ของหน้านี้)
 */

const PAGE_SIZE = 50;

const INPUT_CLASS =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-violet-400";

const LABEL_CLASS = "text-[11px] font-semibold text-slate-500";

export default function PlatformCompanyDataPage() {
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");

  const [datasets, setDatasets] = useState<CompanyDatasetMeta[]>([]);
  const [groups, setGroups] = useState<Array<{ key: string; label: string }>>(
    [],
  );
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countErrors, setCountErrors] = useState<Record<string, string>>({});

  const [selectedKey, setSelectedKey] = useState("");
  const [items, setItems] = useState<CompanyDataItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState("");

  const selected = useMemo(
    () => datasets.find((item) => item.key === selectedKey) ?? null,
    [datasets, selectedKey],
  );

  /* ---------------- โหลดค่าเริ่มต้น ---------------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [companyResult, datasetResult] = await Promise.all([
          getOrganizationCompanies({ page: 1, pageSize: 200, status: "ACTIVE" }),
          getCompanyDataDatasets(),
        ]);

        if (cancelled) return;

        setCompanies(companyResult.items);
        setDatasets(datasetResult.datasets);
        setGroups(datasetResult.groups);

        if (companyResult.items.length > 0) {
          setCompanyId(companyResult.items[0].id);
          setCompanyName(companyResult.items[0].nameTh);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "โหลดข้อมูลตั้งต้นไม่สำเร็จ",
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadSummary = useCallback(async () => {
    if (!companyId) return;

    try {
      setLoadingSummary(true);
      const result = await getCompanyDataSummary(companyId);

      setCompanyName(result.company.nameTh);
      setCounts(
        Object.fromEntries(result.items.map((item) => [item.key, item.total])),
      );
      setCountErrors(
        Object.fromEntries(
          result.items
            .filter((item) => item.error)
            .map((item) => [item.key, item.error as string]),
        ),
      );
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "โหลดสรุปข้อมูลไม่สำเร็จ",
      });
    } finally {
      setLoadingSummary(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const loadItems = useCallback(async () => {
    if (!companyId || !selectedKey) return;

    try {
      setLoadingItems(true);
      const result = await getCompanyDataItems({
        companyId,
        dataset: selectedKey,
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      });

      setItems(result.items);
      setTotal(result.meta.total);
      setChecked(new Set());
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "โหลดรายการไม่สำเร็จ",
      });
    } finally {
      setLoadingItems(false);
    }
  }, [companyId, selectedKey, page, search, from, to]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  /* ---------------- การกระทำ ---------------- */

  function toggle(id: string) {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked((previous) =>
      previous.size === items.length
        ? new Set()
        : new Set(items.map((item) => item.id)),
    );
  }

  async function handleDelete() {
    if (!selected || checked.size === 0) return;

    const label = selected.softDelete
      ? "ลงถังขยะ (กู้คืนได้)"
      : "ลบถาวร (กู้คืนไม่ได้)";

    if (
      !window.confirm(
        `${label}\n\n${selected.label} ${checked.size.toLocaleString("th-TH")} รายการ ของบริษัท ${companyName}`,
      )
    ) {
      return;
    }

    try {
      setWorking(true);
      const result = await deleteCompanyDataItems({
        companyId,
        dataset: selected.key,
        ids: [...checked],
      });

      setMessage({
        tone: "ok",
        text: `ลบแล้ว ${result.deleted.toLocaleString("th-TH")} รายการ${
          result.skipped > 0
            ? ` (ข้าม ${result.skipped} รายการที่ไม่ได้อยู่ในบริษัทนี้หรือถูกลบไปแล้ว)`
            : ""
        }${result.softDeleted ? " — กู้คืนได้ที่ถังขยะ" : " — ลบถาวร"}`,
      });

      await Promise.all([loadItems(), loadSummary()]);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "ลบไม่สำเร็จ",
      });
    } finally {
      setWorking(false);
    }
  }

  async function handlePurge() {
    if (!selected) return;

    try {
      setWorking(true);
      const result = await purgeCompanyData({
        companyId,
        dataset: selected.key,
        confirmName: purgeConfirm,
        from: from || undefined,
        to: to || undefined,
      });

      setMessage({
        tone: "ok",
        text: `ลบทั้งชุดแล้ว ${result.deleted.toLocaleString("th-TH")} รายการ${
          result.softDeleted ? " — กู้คืนได้ที่ถังขยะ" : " — ลบถาวร"
        }`,
      });

      setPurgeOpen(false);
      setPurgeConfirm("");
      await Promise.all([loadItems(), loadSummary()]);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "ลบทั้งชุดไม่สำเร็จ",
      });
    } finally {
      setWorking(false);
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-600">
          Platform Console
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
          ข้อมูลของบริษัท
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          ดูและลบข้อมูลที่ขึ้นระบบไปแล้วของแต่ละบริษัท — ของที่มีถังขยะจะกู้คืนได้ที่
          ตั้งค่า › ถังขยะ
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className={LABEL_CLASS}>บริษัท</span>
          <select
            value={companyId}
            onChange={(event) => {
              setCompanyId(event.target.value);
              setSelectedKey("");
              setItems([]);
              setPage(1);
            }}
            className={INPUT_CLASS}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nameTh} ({company.code})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void loadSummary()}
          disabled={loadingSummary}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingSummary ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          นับใหม่
        </button>
      </div>

      {message ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
        {/* ---------------- รายการชุดข้อมูล ---------------- */}
        <nav className="h-fit space-y-4 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          {groups.map((group) => {
            const groupDatasets = datasets.filter(
              (item) => item.group === group.key,
            );

            if (groupDatasets.length === 0) return null;

            return (
              <div key={group.key} className="space-y-1">
                <p className="px-2 text-[11px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
                  {group.label}
                </p>

                {groupDatasets.map((dataset) => {
                  const active = dataset.key === selectedKey;
                  const count = counts[dataset.key] ?? 0;

                  return (
                    <button
                      key={dataset.key}
                      type="button"
                      onClick={() => {
                        setSelectedKey(dataset.key);
                        setPage(1);
                        setSearch("");
                        setChecked(new Set());
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] transition ${
                        active
                          ? "bg-violet-50 font-bold text-violet-700"
                          : "font-medium text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate">{dataset.label}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          count > 0
                            ? active
                              ? "bg-violet-100 text-violet-700"
                              : "bg-slate-100 text-slate-600"
                            : "text-slate-300"
                        }`}
                      >
                        {count.toLocaleString("th-TH")}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* ---------------- ตารางข้อมูล ---------------- */}
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selected ? (
            <p className="py-16 text-center text-sm text-slate-400">
              เลือกชุดข้อมูลทางซ้ายเพื่อดูรายการ
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-slate-950">
                    {selected.label}
                  </h2>
                  <p className="text-xs text-slate-500">
                    ทั้งหมด {total.toLocaleString("th-TH")} รายการ ·{" "}
                    {selected.softDelete
                      ? "ลบแล้วกู้คืนได้จากถังขยะ"
                      : "ตารางนี้ไม่มีถังขยะ ลบแล้วหายถาวร"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={
                      working || checked.size === 0 || !selected.deletable
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    ลบที่เลือก ({checked.size})
                  </button>

                  <button
                    type="button"
                    onClick={() => setPurgeOpen(true)}
                    disabled={working || !selected.deletable}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
                  >
                    ลบทั้งชุดตามตัวกรอง
                  </button>
                </div>
              </div>

              {selected.note ? (
                <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {selected.note}
                </p>
              ) : null}

              {countErrors[selected.key] ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  นับจำนวนไม่สำเร็จ: {countErrors[selected.key]}
                </p>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-52 flex-1 flex-col gap-1">
                  <span className={LABEL_CLASS}>ค้นหา</span>
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="เลขที่เอกสาร / เหตุผล / ชื่อ"
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={LABEL_CLASS}>
                    {selected.dateLabel} ตั้งแต่
                  </span>
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => {
                      setFrom(event.target.value);
                      setPage(1);
                    }}
                    className={`${INPUT_CLASS} w-40`}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={LABEL_CLASS}>ถึง</span>
                  <input
                    type="date"
                    value={to}
                    onChange={(event) => {
                      setTo(event.target.value);
                      setPage(1);
                    }}
                    className={`${INPUT_CLASS} w-40`}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void loadItems()}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  โหลดใหม่
                </button>
              </div>

              {loadingItems ? (
                <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                  กำลังโหลด…
                </p>
              ) : items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
                  ไม่มีข้อมูลตามเงื่อนไขที่เลือก
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <th className="w-10 px-3 py-2.5 text-left">
                          <input
                            type="checkbox"
                            checked={
                              items.length > 0 && checked.size === items.length
                            }
                            onChange={toggleAll}
                            className="h-4 w-4 accent-violet-600"
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left">รายการ</th>
                        <th className="px-3 py-2.5 text-left">พนักงาน</th>
                        <th className="px-3 py-2.5 text-left">สถานะ</th>
                        <th className="px-3 py-2.5 text-left">
                          {selected.dateLabel}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          className={
                            checked.has(item.id)
                              ? "bg-violet-50/60"
                              : "hover:bg-slate-50"
                          }
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={checked.has(item.id)}
                              onChange={() => toggle(item.id)}
                              className="h-4 w-4 accent-violet-600"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[13px] font-semibold text-slate-900">
                              {item.title}
                            </span>
                            {item.subtitle ? (
                              <span className="block max-w-72 truncate text-[11px] text-slate-500">
                                {item.subtitle}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-[13px] text-slate-700">
                            {item.employeeName ?? "—"}
                            {item.employeeCode ? (
                              <span className="ml-1.5 text-[11px] text-slate-400">
                                {item.employeeCode}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5">
                            {item.status ? (
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                {item.status}
                              </span>
                            ) : (
                              <span className="text-[13px] text-slate-400">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-slate-600">
                            {formatDate(item.date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {totalPages > 1 ? (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    หน้า {page} / {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPage((value) => Math.max(value - 1, 1));
                        scrollPagerToTop();
                      }}
                      disabled={page <= 1}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      ก่อนหน้า
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPage((value) => Math.min(value + 1, totalPages));
                        scrollPagerToTop();
                      }}
                      disabled={page >= totalPages}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {/* ---------------- ยืนยันลบทั้งชุด ---------------- */}
      {purgeOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              ลบ {selected.label} ทั้งชุด
            </h3>

            <p className="text-xs text-slate-600">
              จะลบทุกรายการของบริษัท{" "}
              <strong className="text-slate-900">{companyName}</strong>{" "}
              ที่ตรงกับตัวกรองช่วงวันที่ตอนนี้
              {from || to ? (
                <span className="mt-1 block text-slate-500">
                  {from || "ไม่จำกัด"} ถึง {to || "ไม่จำกัด"}
                </span>
              ) : (
                <span className="mt-1 block font-bold text-rose-700">
                  ไม่ได้ตั้งช่วงวันที่ = ลบทั้งหมดของบริษัทนี้
                </span>
              )}
            </p>

            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {selected.softDelete
                ? "ของจะไปอยู่ในถังขยะ กู้คืนได้"
                : "ตารางนี้ไม่มีถังขยะ ลบแล้วหายถาวร"}
            </p>

            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASS}>
                พิมพ์ชื่อบริษัทให้ตรงเพื่อยืนยัน — {companyName}
              </span>
              <input
                value={purgeConfirm}
                onChange={(event) => setPurgeConfirm(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPurgeOpen(false);
                  setPurgeConfirm("");
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handlePurge}
                disabled={working || purgeConfirm.trim() !== companyName.trim()}
                className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
              >
                {working ? "กำลังลบ…" : "ลบทั้งชุด"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
