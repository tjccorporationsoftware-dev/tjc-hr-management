"use client";

import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, GitBranch, Loader2, Plus, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiMutation, useApiQuery } from "@/lib/use-api";

type PlatformCompany = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  status: string;
  _count?: { branches?: number; departments?: number };
};

type PlatformBranch = {
  id: string;
  companyId: string;
  code: string;
  nameTh: string;
  status: string;
};

const emptyCompanyForm = { code: "", nameTh: "", nameEn: "", taxId: "" };

export default function PlatformCompaniesPage() {
  const queryClient = useQueryClient();

  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [branchForms, setBranchForms] = useState<
    Record<string, { code: string; nameTh: string }>
  >({});
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const companiesQuery = useApiQuery(
    queryKeys.organization.companies({ pageSize: 100 }),
    () => apiFetch<PlatformCompany[]>("/organization/companies?pageSize=100"),
  );

  const branchesQuery = useApiQuery(
    queryKeys.organization.branches({ pageSize: 300 }),
    () => apiFetch<PlatformBranch[]>("/organization/branches?pageSize=300"),
  );

  const companies = Array.isArray(companiesQuery.data)
    ? companiesQuery.data
    : [];
  const branches = Array.isArray(branchesQuery.data) ? branchesQuery.data : [];
  const loading = companiesQuery.isPending || branchesQuery.isPending;

  function load() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.organization.all,
    });
  }

  // หน้านี้แจ้งผลด้วยแถบข้อความในหน้า ไม่ใช่ toast จึงปิด toast ของ useApiMutation
  const createCompany = useApiMutation(
    (input: typeof emptyCompanyForm) =>
      apiFetch("/organization/companies", {
        method: "POST",
        body: JSON.stringify({
          code: input.code.trim().toUpperCase(),
          nameTh: input.nameTh.trim(),
          nameEn: input.nameEn.trim() || undefined,
          taxId: input.taxId.trim() || undefined,
        }),
      }),
    {
      invalidates: [queryKeys.organization.all],
      showErrorToast: false,
      onSuccess: (_data, input) => {
        setMessage({
          type: "ok",
          text: `สร้างบริษัท ${input.nameTh} สำเร็จ`,
        });
        setCompanyForm(emptyCompanyForm);
      },
      onError: (error) => {
        setMessage({
          type: "err",
          text: getErrorMessage(error, "สร้างบริษัทไม่สำเร็จ"),
        });
      },
    },
  );

  const createBranch = useApiMutation(
    (input: { companyId: string; code: string; nameTh: string }) =>
      apiFetch("/organization/branches", {
        method: "POST",
        body: JSON.stringify({
          companyId: input.companyId,
          code: input.code.trim().toUpperCase(),
          nameTh: input.nameTh.trim(),
        }),
      }),
    {
      invalidates: [queryKeys.organization.all],
      showErrorToast: false,
      onSuccess: (_data, input) => {
        setMessage({ type: "ok", text: `เพิ่มสาขา ${input.nameTh} สำเร็จ` });
        setBranchForms((prev) => ({
          ...prev,
          [input.companyId]: { code: "", nameTh: "" },
        }));
      },
      onError: (error) => {
        setMessage({
          type: "err",
          text: getErrorMessage(error, "เพิ่มสาขาไม่สำเร็จ"),
        });
      },
    },
  );

  const submittingCompany = createCompany.isPending;
  const branchSubmitting = createBranch.isPending
    ? createBranch.variables?.companyId ?? null
    : null;

  function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    createCompany.mutate(companyForm);
  }

  function handleCreateBranch(companyId: string) {
    const form = branchForms[companyId];
    if (!form?.code?.trim() || !form?.nameTh?.trim()) return;

    setMessage(null);
    createBranch.mutate({ companyId, code: form.code, nameTh: form.nameTh });
  }

  function setBranchField(
    companyId: string,
    field: "code" | "nameTh",
    value: string,
  ) {
    setBranchForms((prev) => ({
      ...prev,
      [companyId]: {
        code: prev[companyId]?.code ?? "",
        nameTh: prev[companyId]?.nameTh ?? "",
        [field]: value,
      },
    }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-600">
            Platform Console
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
            บริษัท &amp; สาขา
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            สร้างบริษัท (tenant) และสาขาของแต่ละบริษัท
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          รีเฟรช
        </button>
      </header>

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-3xl border border-violet-200 bg-violet-50/40 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-slate-950">
          <Plus className="h-4 w-4 text-violet-600" />
          สร้างบริษัทใหม่
        </h2>
        <form
          onSubmit={handleCreateCompany}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field
            label="รหัสบริษัท *"
            value={companyForm.code}
            onChange={(v) => setCompanyForm((f) => ({ ...f, code: v }))}
            placeholder="เช่น GAMMA"
            required
          />
          <Field
            label="ชื่อบริษัท (ไทย) *"
            value={companyForm.nameTh}
            onChange={(v) => setCompanyForm((f) => ({ ...f, nameTh: v }))}
            placeholder="บริษัท ... จำกัด"
            required
          />
          <Field
            label="ชื่อบริษัท (อังกฤษ)"
            value={companyForm.nameEn}
            onChange={(v) => setCompanyForm((f) => ({ ...f, nameEn: v }))}
            placeholder="Gamma Co., Ltd."
          />
          <Field
            label="เลขผู้เสียภาษี"
            value={companyForm.taxId}
            onChange={(v) => setCompanyForm((f) => ({ ...f, taxId: v }))}
            placeholder="0..."
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              disabled={
                submittingCompany || !companyForm.code || !companyForm.nameTh
              }
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {submittingCompany ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              สร้างบริษัท
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-extrabold text-slate-950">
          บริษัททั้งหมด ({companies.length})
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
            กำลังโหลด...
          </div>
        ) : (
          companies.map((company) => {
            const companyBranches = branches.filter(
              (b) => b.companyId === company.id,
            );
            const form = branchForms[company.id] ?? { code: "", nameTh: "" };
            return (
              <div
                key={company.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-950">
                      {company.nameTh}
                    </div>
                    <div className="text-xs text-slate-500">
                      {company.code}
                      {company.nameEn ? ` · ${company.nameEn}` : ""}
                    </div>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {companyBranches.length} สาขา
                  </span>
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  {companyBranches.length === 0 ? (
                    <p className="text-sm text-slate-400">ยังไม่มีสาขา</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {companyBranches.map((b) => (
                        <span
                          key={b.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                        >
                          <GitBranch className="h-3.5 w-3.5 text-violet-500" />
                          <span className="font-semibold">{b.nameTh}</span>
                          <span className="text-xs text-slate-400">
                            {b.code}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-end gap-2 pt-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                        รหัสสาขา
                      </span>
                      <input
                        value={form.code}
                        onChange={(e) =>
                          setBranchField(company.id, "code", e.target.value)
                        }
                        placeholder="เช่น BKK"
                        className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                      />
                    </label>
                    <label className="block flex-1">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                        ชื่อสาขา
                      </span>
                      <input
                        value={form.nameTh}
                        onChange={(e) =>
                          setBranchField(company.id, "nameTh", e.target.value)
                        }
                        placeholder="สาขา..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCreateBranch(company.id)}
                      disabled={
                        branchSubmitting === company.id ||
                        !form.code ||
                        !form.nameTh
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                    >
                      {branchSubmitting === company.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      เพิ่มสาขา
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </label>
  );
}
