"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  GitBranch,
  Globe2,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchWithMeta } from "@/lib/api";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import type {
  PaginationMeta,
  RoleListItem,
  UserListItem,
} from "@/types/user";

type ScopeLevel = "GLOBAL" | "COMPANY" | "BRANCH";

type CompanyOption = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

type BranchOption = {
  id: string;
  companyId: string;
  code: string;
  nameTh: string;
};

type AccessDraft = {
  scopeLevel: ScopeLevel;
  scopedCompanyId: string;
  scopedBranchId: string;
  roleCodes: string[];
};

const SCOPE_OPTIONS: Array<{
  value: ScopeLevel;
  label: string;
  description: string;
  icon: typeof Globe2;
}> = [
  {
    value: "GLOBAL",
    label: "ทั้งระบบ",
    description: "เห็นและจัดการทุกบริษัท",
    icon: Globe2,
  },
  {
    value: "COMPANY",
    label: "ระดับบริษัท",
    description: "จำกัดเฉพาะบริษัทเดียว",
    icon: Building2,
  },
  {
    value: "BRANCH",
    label: "ระดับสาขา",
    description: "จำกัดเฉพาะสาขาเดียว",
    icon: GitBranch,
  },
];

function buildDraftFromUser(user: UserListItem): AccessDraft {
  return {
    scopeLevel: user.scope?.level ?? "BRANCH",
    scopedCompanyId: user.scope?.companyId ?? "",
    scopedBranchId: user.scope?.branchId ?? "",
    roleCodes: [...user.roles.map((role) => role.code)].sort(),
  };
}

function sameStringSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((item) => setB.has(item));
}

export default function PlatformAccessPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccessDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
  }, [page, q]);

  async function loadUsers(mode: "initial" | "refresh" = "refresh") {
    try {
      if (mode === "initial") setLoading(true);
      setError("");
      const result = await apiFetchWithMeta<UserListItem[], PaginationMeta>(
        `/users?${queryString}`,
      );
      setUsers(result.data);
      setMeta(result.meta ?? null);
    } catch {
      setError("โหลดรายการผู้ใช้ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function loadReferenceData() {
    try {
      const [roleRes, companyRes, branchRes] = await Promise.all([
        apiFetch<RoleListItem[]>("/roles?pageSize=100"),
        apiFetch<CompanyOption[]>("/organization/companies?pageSize=100"),
        apiFetch<BranchOption[]>("/organization/branches?pageSize=300"),
      ]);
      setRoles(Array.isArray(roleRes) ? roleRes : []);
      setCompanies(Array.isArray(companyRes) ? companyRes : []);
      setBranches(Array.isArray(branchRes) ? branchRes : []);
    } catch {
      toast.error("โหลดข้อมูล Role / บริษัท ไม่สำเร็จ");
    }
  }

  useEffect(() => {
    loadReferenceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadUsers("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const activeRoles = useMemo(
    () => roles.filter((role) => role.isActive),
    [roles],
  );

  const roleByCode = useMemo(() => {
    const map = new Map<string, RoleListItem>();
    roles.forEach((role) => map.set(role.code, role));
    return map;
  }, [roles]);

  // สิทธิ์ที่ได้จริง = union ของ permission จากทุก role ที่เลือก (ตาม data model)
  const effectivePermissionGroups = useMemo(() => {
    if (!draft) return [];
    const byCode = new Map<
      string,
      { code: string; name: string; group: string }
    >();
    draft.roleCodes.forEach((code) => {
      const role = roleByCode.get(code);
      role?.permissions.forEach((permission) => {
        if (!byCode.has(permission.code)) {
          byCode.set(permission.code, {
            code: permission.code,
            name: permission.name,
            group: permission.group,
          });
        }
      });
    });

    const groups = new Map<string, Array<{ code: string; name: string }>>();
    Array.from(byCode.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach((permission) => {
        const list = groups.get(permission.group) ?? [];
        list.push({ code: permission.code, name: permission.name });
        groups.set(permission.group, list);
      });

    return Array.from(groups.entries())
      .map(([group, items]) => ({ group, items }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [draft, roleByCode]);

  const effectivePermissionCount = useMemo(
    () =>
      effectivePermissionGroups.reduce(
        (sum, group) => sum + group.items.length,
        0,
      ),
    [effectivePermissionGroups],
  );

  function selectUser(user: UserListItem) {
    setSelectedUserId(user.id);
    setDraft(buildDraftFromUser(user));
  }

  function patchDraft(patch: Partial<AccessDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function changeScopeLevel(level: ScopeLevel) {
    if (!draft) return;
    if (level === "GLOBAL") {
      patchDraft({ scopeLevel: level, scopedCompanyId: "", scopedBranchId: "" });
    } else if (level === "COMPANY") {
      patchDraft({ scopeLevel: level, scopedBranchId: "" });
    } else {
      patchDraft({ scopeLevel: level });
    }
  }

  function changeCompany(companyId: string) {
    // เปลี่ยนบริษัทแล้ว สาขาเดิมอาจไม่อยู่ในบริษัทใหม่ → ล้างสาขา
    patchDraft({ scopedCompanyId: companyId, scopedBranchId: "" });
  }

  function toggleRole(code: string) {
    if (!draft) return;
    const has = draft.roleCodes.includes(code);
    const next = has
      ? draft.roleCodes.filter((item) => item !== code)
      : [...draft.roleCodes, code];
    patchDraft({ roleCodes: next.sort() });
  }

  const branchesForCompany = useMemo(
    () =>
      draft?.scopedCompanyId
        ? branches.filter((branch) => branch.companyId === draft.scopedCompanyId)
        : [],
    [branches, draft?.scopedCompanyId],
  );

  const scopeValid = useMemo(() => {
    if (!draft) return false;
    if (draft.scopeLevel === "COMPANY") return Boolean(draft.scopedCompanyId);
    if (draft.scopeLevel === "BRANCH")
      return Boolean(draft.scopedCompanyId && draft.scopedBranchId);
    return true;
  }, [draft]);

  const rolesValid = (draft?.roleCodes.length ?? 0) >= 1;

  const isDirty = useMemo(() => {
    if (!draft || !selectedUser) return false;
    const original = buildDraftFromUser(selectedUser);
    return (
      original.scopeLevel !== draft.scopeLevel ||
      (original.scopedCompanyId || "") !== (draft.scopedCompanyId || "") ||
      (original.scopedBranchId || "") !== (draft.scopedBranchId || "") ||
      !sameStringSet(original.roleCodes, draft.roleCodes)
    );
  }, [draft, selectedUser]);

  const scopeChanged = useMemo(() => {
    if (!draft || !selectedUser) return false;
    const original = buildDraftFromUser(selectedUser);
    return (
      original.scopeLevel !== draft.scopeLevel ||
      (original.scopedCompanyId || "") !== (draft.scopedCompanyId || "") ||
      (original.scopedBranchId || "") !== (draft.scopedBranchId || "")
    );
  }, [draft, selectedUser]);

  const rolesChanged = useMemo(() => {
    if (!draft || !selectedUser) return false;
    const original = buildDraftFromUser(selectedUser);
    return !sameStringSet(original.roleCodes, draft.roleCodes);
  }, [draft, selectedUser]);

  async function handleSave() {
    if (!draft || !selectedUser) return;
    if (!scopeValid) {
      toast.error("กรุณาเลือกบริษัท/สาขาให้ครบตามระดับ Scope");
      return;
    }
    if (!rolesValid) {
      toast.error("ต้องเลือก Role อย่างน้อย 1 รายการ");
      return;
    }

    setSaving(true);
    try {
      if (scopeChanged) {
        const scopePayload: Record<string, string> = {
          scopeLevel: draft.scopeLevel,
        };
        if (draft.scopeLevel !== "GLOBAL") {
          scopePayload.scopedCompanyId = draft.scopedCompanyId;
        }
        if (draft.scopeLevel === "BRANCH") {
          scopePayload.scopedBranchId = draft.scopedBranchId;
        }
        await apiFetch<UserListItem>(`/users/${selectedUser.id}`, {
          method: "PATCH",
          body: JSON.stringify(scopePayload),
        });
      }

      if (rolesChanged) {
        await apiFetch<UserListItem>(`/users/${selectedUser.id}/roles`, {
          method: "PATCH",
          body: JSON.stringify({ roleCodes: draft.roleCodes }),
        });
      }

      toast.success(`บันทึกสิทธิ์ของ ${selectedUser.displayName} สำเร็จ`);
      await loadUsers("refresh");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "บันทึกไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-600">
          Platform Console
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
          สิทธิ์การเข้าถึง
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          กำหนดขอบเขต (Scope) และ Role ให้แต่ละบัญชี — สิทธิ์การใช้งานจะตามมาจาก
          Role ที่เลือกโดยอัตโนมัติ
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* ---------- USER LIST ---------- */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
              placeholder="ค้นหาชื่อ / อีเมล / รหัสพนักงาน"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
              กำลังโหลด...
            </div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-rose-600">
              {error}
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              ไม่พบผู้ใช้งาน
            </div>
          ) : (
            <ul className="space-y-1.5">
              {users.map((user) => {
                const active = user.id === selectedUserId;
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => selectUser(user)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                        active
                          ? "border-violet-300 bg-violet-50"
                          : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-nowrap text-sm font-semibold text-slate-900">
                          {user.displayName}
                        </span>
                        <span className="block break-words text-xs text-slate-500">
                          {user.email}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {user.scope?.level ?? "—"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {meta && meta.totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  scrollPagerToTop();
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <span>
                หน้า {meta.page} / {meta.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => {
                  setPage((p) => p + 1);
                  scrollPagerToTop();
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          ) : null}
        </section>

        {/* ---------- EDITOR ---------- */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {!draft || !selectedUser ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center text-slate-400">
              <ShieldCheck className="h-10 w-10" />
              <p className="text-sm font-medium">
                เลือกผู้ใช้จากรายการทางซ้ายเพื่อกำหนดสิทธิ์
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="min-w-0">
                  <div className="text-lg font-extrabold text-slate-950">
                    {selectedUser.displayName}
                  </div>
                  <div className="text-sm text-slate-500">
                    {selectedUser.email}
                  </div>
                  {selectedUser.employee ? (
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      <Building2 className="h-3.5 w-3.5" />
                      {selectedUser.employee.employeeCode}
                      {selectedUser.employee.company
                        ? ` · ${selectedUser.employee.company.nameTh}`
                        : ""}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* SCOPE */}
              <div>
                <h3 className="mb-2 text-sm font-extrabold text-slate-900">
                  ขอบเขตข้อมูล (Scope)
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SCOPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = draft.scopeLevel === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => changeScopeLevel(option.value)}
                        className={`rounded-2xl border p-3 text-left transition ${
                          active
                            ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <Icon className="h-4 w-4 text-violet-600" />
                          {option.label}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {draft.scopeLevel !== "GLOBAL" ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">
                        บริษัท *
                      </span>
                      <select
                        value={draft.scopedCompanyId}
                        onChange={(event) => changeCompany(event.target.value)}
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                      >
                        <option value="">— เลือกบริษัท —</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.nameTh} ({company.code})
                          </option>
                        ))}
                      </select>
                    </label>

                    {draft.scopeLevel === "BRANCH" ? (
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">
                          สาขา *
                        </span>
                        <select
                          value={draft.scopedBranchId}
                          onChange={(event) =>
                            patchDraft({ scopedBranchId: event.target.value })
                          }
                          disabled={!draft.scopedCompanyId}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
                        >
                          <option value="">— เลือกสาขา —</option>
                          {branchesForCompany.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.nameTh} ({branch.code})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* ROLES */}
              <div>
                <h3 className="mb-2 text-sm font-extrabold text-slate-900">
                  บทบาท (Role){" "}
                  <span className="font-medium text-slate-400">
                    เลือกได้หลายรายการ
                  </span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {activeRoles.map((role) => {
                    const active = draft.roleCodes.includes(role.code);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleRole(role.code)}
                        title={role.description ?? role.name}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
                          active
                            ? "border-violet-400 bg-violet-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {active ? <Check className="h-3.5 w-3.5" /> : null}
                        {role.name}
                      </button>
                    );
                  })}
                </div>
                {!rolesValid ? (
                  <p className="mt-2 text-xs font-medium text-rose-600">
                    ต้องเลือกอย่างน้อย 1 Role
                  </p>
                ) : null}
              </div>

              {/* EFFECTIVE PERMISSIONS */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    สิทธิ์ที่ได้จริง
                  </h3>
                  <span className="rounded-lg bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700">
                    {effectivePermissionCount} สิทธิ์
                  </span>
                </div>
                <p className="mb-3 text-xs text-slate-500">
                  รวมจากทุก Role ที่เลือก (อ่านอย่างเดียว) — แก้ไขได้โดยปรับ Role
                  ด้านบน
                </p>
                {effectivePermissionCount === 0 ? (
                  <p className="text-sm text-slate-400">
                    ยังไม่มีสิทธิ์ — เลือก Role เพื่อกำหนด
                  </p>
                ) : (
                  <div className="space-y-3">
                    {effectivePermissionGroups.map((group) => (
                      <div key={group.group}>
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          {group.group}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.items.map((permission) => (
                            <span
                              key={permission.code}
                              title={permission.name}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
                            >
                              {permission.code}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SAVE BAR */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                {isDirty ? (
                  <span className="text-xs font-medium text-amber-600">
                    มีการเปลี่ยนแปลงที่ยังไม่บันทึก
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !isDirty || !scopeValid || !rolesValid}
                  className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  บันทึกสิทธิ์
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
