"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { apiFetch, apiFetchWithMeta } from "@/lib/api";

import {
  Badge,
  Button,
  CellStack,
  Checkbox,
  DataTable,
  Field,
  Modal,
  Notice,
  RowMenu,
  SearchInput,
  Select,
  TextInput,
  type Column,
} from "@/components/kit";

/**
 * บัญชีผู้ใช้ระดับแพลตฟอร์ม
 * ========================
 * คนละงานกับหน้า "ผู้ใช้และสิทธิ์" ในพื้นที่บริษัท:
 *
 *   พื้นที่บริษัท  — HR ผูกบัญชีให้พนักงานในบริษัทตัวเอง เห็นแค่บริษัทเดียว
 *   ที่นี่          — ผู้ดูแลแพลตฟอร์มดูบัญชีข้ามทุกบริษัท และ "เปิดบริษัทใหม่"
 *                    ด้วยการสร้างบัญชีผู้ดูแลคนแรกที่ยังไม่มีพนักงานให้ผูก
 *
 * จึงมีคอลัมน์บริษัท ตัวกรองบริษัท และฟอร์มสร้างที่กำหนดขอบเขตได้เอง
 * ซึ่งไม่ควรมีในพื้นที่บริษัท
 */

type OrgRef = {
  id: string;
  code?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
};

/*
 * โครงที่ /users ส่งกลับมาจริง (ตรวจจาก response ตรง ๆ)
 *   roles  เป็น array ของ role ตรง ๆ ไม่ได้ห่อด้วย { role: ... }
 *   ขอบเขต อยู่ใน scope: { level, company, branch } ไม่ใช่ scopeLevel ที่ระดับบนสุด
 */
type PlatformUser = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  lastLoginAt?: string | null;
  scope?: {
    level?: "GLOBAL" | "COMPANY" | "BRANCH" | null;
    companyId?: string | null;
    branchId?: string | null;
    company?: OrgRef | null;
    branch?: OrgRef | null;
  } | null;
  employee?: {
    id: string;
    employeeCode?: string | null;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    company?: OrgRef | null;
  } | null;
  roles?: Array<{ id?: string; code?: string; name?: string | null }>;
};

type RoleOption = { id: string; code: string; name?: string | null };

const STATUS_TEXT = {
  ACTIVE: "เปิดใช้งาน",
  INACTIVE: "ปิดใช้งาน",
  SUSPENDED: "ถูกระงับ",
} as const;

const SCOPE_TEXT = {
  GLOBAL: "ทุกบริษัท",
  COMPANY: "ทั้งบริษัท",
  BRANCH: "เฉพาะสาขา",
} as const;

function orgLabel(org?: OrgRef | null) {
  if (!org) return null;
  return org.nameTh || org.nameEn || org.code || null;
}

/** บริษัทของบัญชี — บัญชีที่ไม่ผูกพนักงานต้องดูจากขอบเขตที่ตั้งไว้ */
function companyOf(user: PlatformUser) {
  return orgLabel(user.scope?.company) ?? orgLabel(user.employee?.company);
}

function userName(user: PlatformUser) {
  return (
    user.displayName ||
    user.employee?.displayName ||
    [user.employee?.firstName, user.employee?.lastName]
      .filter(Boolean)
      .join(" ") ||
    user.email ||
    "-"
  );
}

export type PlatformUsersSummary = {
  total: number;
  active: number;
  suspended: number;
  companyAdmins: number;
};

export function PlatformUsersPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: PlatformUsersSummary) => void;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [companies, setCompanies] = useState<OrgRef[]>([]);
  const [branches, setBranches] = useState<Array<OrgRef & { companyId?: string }>>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);

  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  /** บัญชีที่กำลังตั้งรหัสผ่านใหม่ */
  const [resetting, setResetting] = useState<PlatformUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  /** บัญชีที่กำลังแก้ไข พร้อมค่าที่แก้อยู่ */
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [editDraft, setEditDraft] = useState({
    displayName: "",
    roleCodes: [] as string[],
    scopeLevel: "COMPANY" as "GLOBAL" | "COMPANY" | "BRANCH",
    scopedCompanyId: "",
    scopedBranchId: "",
  });

  const [draft, setDraft] = useState({
    email: "",
    displayName: "",
    password: "Company@123456",
    roleCodes: ["HR_ADMIN"] as string[],
    scopeLevel: "COMPANY" as "COMPANY" | "BRANCH",
    scopedCompanyId: "",
    scopedBranchId: "",
  });

  function notify(title: string, description: string, tone: ActionDialogState["tone"] = "blue") {
    setDialog({ title, description, confirmLabel: "รับทราบ", tone, onConfirm: () => {} });
  }

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", pageSize: "100" });
    if (q.trim()) params.set("q", q.trim());
    if (companyId) params.set("companyId", companyId);
    if (status) params.set("status", status);

    const result = await apiFetchWithMeta<PlatformUser[]>(
      `/users?${params.toString()}`,
    );

    setUsers(result.data);
  }, [q, companyId, status]);

  const loadOptions = useCallback(async () => {
    const [companyResult, branchResult, roleResult] = await Promise.all([
      apiFetchWithMeta<OrgRef[]>("/organization/companies?pageSize=200"),
      apiFetchWithMeta<Array<OrgRef & { companyId?: string }>>(
        "/organization/branches?pageSize=300",
      ),
      apiFetchWithMeta<RoleOption[]>("/roles?pageSize=100"),
    ]);

    setCompanies(companyResult.data);
    setBranches(branchResult.data);
    setRoles(roleResult.data);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);

    try {
      await Promise.all([loadUsers(), loadOptions()]);
    } catch (error) {
      notify(
        "โหลดข้อมูลไม่สำเร็จ",
        error instanceof Error ? error.message : "ลองใหม่อีกครั้ง",
        "red",
      );
    } finally {
      setLoading(false);
    }
  }, [loadUsers, loadOptions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ค้นหา/กรอง หน่วง 350ms กันยิงทุกตัวอักษร
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers().catch(() => undefined);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const summary = useMemo<PlatformUsersSummary>(
    () => ({
      total: users.length,
      active: users.filter((user) => user.status === "ACTIVE").length,
      suspended: users.filter((user) => user.status === "SUSPENDED").length,
      // บัญชีผู้ดูแลบริษัทคือบัญชีที่ไม่ได้ผูกพนักงาน แต่มีขอบเขตบริษัทชัดเจน
      companyAdmins: users.filter(
        (user) => !user.employee && user.scope?.level !== "GLOBAL",
      ).length,
    }),
    [users],
  );

  useEffect(() => {
    onSummaryChange?.(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const branchOptions = useMemo(
    () =>
      branches.filter(
        (branch) =>
          !draft.scopedCompanyId || branch.companyId === draft.scopedCompanyId,
      ),
    [branches, draft.scopedCompanyId],
  );

  async function handleCreate() {
    if (!draft.email.trim()) {
      notify("ยังไม่ได้กรอกอีเมล", "บัญชีผู้ดูแลบริษัทต้องมีอีเมลไว้เข้าสู่ระบบ", "orange");
      return;
    }
    if (!draft.scopedCompanyId) {
      notify("ยังไม่ได้เลือกบริษัท", "ต้องระบุว่าบัญชีนี้ดูแลบริษัทไหน", "orange");
      return;
    }
    if (draft.scopeLevel === "BRANCH" && !draft.scopedBranchId) {
      notify("ยังไม่ได้เลือกสาขา", "เลือกขอบเขตระดับสาขาแล้วต้องระบุสาขาด้วย", "orange");
      return;
    }
    if (draft.password.length < 8) {
      notify("รหัสผ่านสั้นเกินไป", "ต้องมีอย่างน้อย 8 ตัวอักษร", "orange");
      return;
    }
    if (draft.roleCodes.length === 0) {
      notify("ยังไม่ได้เลือกบทบาท", "ต้องเลือกอย่างน้อย 1 บทบาท", "orange");
      return;
    }

    setLoading(true);

    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          email: draft.email.trim(),
          displayName: draft.displayName.trim() || undefined,
          password: draft.password,
          roleCodes: draft.roleCodes,
          scopeLevel: draft.scopeLevel,
          scopedCompanyId: draft.scopedCompanyId,
          ...(draft.scopeLevel === "BRANCH"
            ? { scopedBranchId: draft.scopedBranchId }
            : {}),
        }),
      });

      setCreateOpen(false);
      setDraft((current) => ({ ...current, email: "", displayName: "" }));
      await loadUsers();
      notify(
        "สร้างบัญชีผู้ดูแลบริษัทแล้ว",
        "ส่งอีเมลกับรหัสผ่านเริ่มต้นให้เจ้าตัวเข้าไปตั้งค่าบริษัทต่อได้เลย",
        "emerald",
      );
    } catch (error) {
      notify(
        "สร้างบัญชีไม่สำเร็จ",
        error instanceof Error ? error.message : "ลองใหม่อีกครั้ง",
        "red",
      );
    } finally {
      setLoading(false);
    }
  }

  function openEdit(user: PlatformUser) {
    setEditing(user);
    setEditDraft({
      displayName: user.displayName ?? "",
      roleCodes: (user.roles ?? [])
        .map((role) => role.code)
        .filter((code): code is string => Boolean(code)),
      scopeLevel: user.scope?.level ?? "COMPANY",
      scopedCompanyId: user.scope?.companyId ?? "",
      scopedBranchId: user.scope?.branchId ?? "",
    });
  }

  /** รันงานที่แก้ข้อมูลจริง แล้วโหลดตารางใหม่ — ข้อความผิดพลาดโยนต่อให้กล่องยืนยันจับ */
  async function run(task: () => Promise<unknown>) {
    setLoading(true);

    try {
      await task();
      await loadUsers();
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    if (editDraft.roleCodes.length === 0) {
      notify("ยังไม่ได้เลือกบทบาท", "ต้องมีอย่างน้อย 1 บทบาท", "orange");
      return;
    }
    if (editDraft.scopeLevel !== "GLOBAL" && !editDraft.scopedCompanyId) {
      notify("ยังไม่ได้เลือกบริษัท", "ขอบเขตระดับบริษัท/สาขาต้องระบุบริษัท", "orange");
      return;
    }

    const target = editing;

    try {
      await run(async () => {
        // แยกเป็นสองคำขอเพราะ backend แยก endpoint ระหว่างข้อมูลบัญชีกับบทบาท
        await apiFetch(`/users/${target.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: editDraft.displayName.trim() || undefined,
            scopeLevel: editDraft.scopeLevel,
            ...(editDraft.scopeLevel === "GLOBAL"
              ? {}
              : { scopedCompanyId: editDraft.scopedCompanyId }),
            ...(editDraft.scopeLevel === "BRANCH"
              ? { scopedBranchId: editDraft.scopedBranchId }
              : {}),
          }),
        });

        await apiFetch(`/users/${target.id}/roles`, {
          method: "PATCH",
          body: JSON.stringify({ roleCodes: editDraft.roleCodes }),
        });
      });

      setEditing(null);
      notify("บันทึกแล้ว", `อัปเดตบัญชี ${userName(target)} เรียบร้อย`, "emerald");
    } catch (error) {
      notify(
        "บันทึกไม่สำเร็จ",
        error instanceof Error ? error.message : "ลองใหม่อีกครั้ง",
        "red",
      );
    }
  }

  /*
   * ไม่ฝังรหัสผ่านตายตัว
   * -------------------
   * backend มีกฎห้ามรหัสผ่านมีคำเดาง่าย (password/admin/employee/123456)
   * หรือมีชื่อ/อีเมลของเจ้าตัวอยู่ในนั้น รหัสสำเร็จรูปจึงถูกปฏิเสธได้
   * และการใช้รหัสเดียวกับทุกคนก็เป็นความเสี่ยงอยู่แล้ว
   */
  async function handleResetPassword() {
    if (!resetting) return;

    if (newPassword.length < 8) {
      notify("รหัสผ่านสั้นเกินไป", "ต้องมีอย่างน้อย 8 ตัวอักษร", "orange");
      return;
    }

    const target = resetting;

    try {
      await run(() =>
        apiFetch(`/users/${target.id}/password`, {
          method: "PATCH",
          body: JSON.stringify({ newPassword }),
        }),
      );

      setResetting(null);
      setNewPassword("");
      notify(
        "ตั้งรหัสผ่านใหม่แล้ว",
        `ส่งรหัสนี้ให้ ${userName(target)} เพื่อเข้าสู่ระบบครั้งถัดไป`,
        "emerald",
      );
    } catch (error) {
      notify(
        "ตั้งรหัสผ่านไม่สำเร็จ",
        error instanceof Error ? error.message : "ลองใหม่อีกครั้ง",
        "red",
      );
    }
  }

  function confirmToggleStatus(user: PlatformUser) {
    const suspend = user.status === "ACTIVE";

    setDialog({
      title: suspend ? "ระงับบัญชี" : "เปิดใช้งานบัญชี",
      description: suspend
        ? `${userName(user)} จะเข้าสู่ระบบไม่ได้ทันที`
        : `${userName(user)} จะกลับมาเข้าสู่ระบบได้ตามปกติ`,
      confirmLabel: suspend ? "ระงับ" : "เปิดใช้งาน",
      cancelLabel: "ยังไม่ทำ",
      tone: suspend ? "red" : "emerald",
      onConfirm: () =>
        run(() =>
          apiFetch(`/users/${user.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: suspend ? "SUSPENDED" : "ACTIVE" }),
          }),
        ),
    });
  }

  function confirmDelete(user: PlatformUser) {
    setDialog({
      title: "ลบบัญชีผู้ใช้",
      description: `ลบ ${userName(user)} ออกจากระบบ — ประวัติที่บัญชีนี้เคยทำไว้จะยังอยู่ แต่เข้าระบบไม่ได้อีกและกู้บัญชีคืนไม่ได้`,
      confirmLabel: "ลบบัญชี",
      cancelLabel: "ยังไม่ทำ",
      tone: "red",
      onConfirm: () => run(() => apiFetch(`/users/${user.id}`, { method: "DELETE" })),
    });
  }

  const columns: Array<Column<PlatformUser>> = [
    {
      key: "user",
      header: "บัญชีผู้ใช้",
      cell: (item) => (
        <CellStack primary={userName(item)} secondary={item.email ?? undefined} />
      ),
    },
    {
      key: "company",
      header: "บริษัทที่ดูแล",
      cell: (item) => {
        const label = companyOf(item);

        if (item.scope?.level === "GLOBAL") {
          return <Badge tone="brand">ทุกบริษัท</Badge>;
        }

        return label ? (
          <CellStack
            primary={label}
            secondary={orgLabel(item.scope?.branch) ?? undefined}
          />
        ) : (
          <span className="text-slate-300">ยังไม่ระบุ</span>
        );
      },
    },
    {
      key: "scope",
      header: "ขอบเขต",
      hideBelow: "lg",
      cell: (item) =>
        item.scope?.level ? SCOPE_TEXT[item.scope.level] : "-",
    },
    {
      key: "link",
      header: "ผูกพนักงาน",
      hideBelow: "xl",
      cell: (item) =>
        item.employee ? (
          <CellStack
            primary={item.employee.employeeCode ?? "-"}
            secondary={item.employee.displayName ?? undefined}
          />
        ) : (
          <span className="text-slate-400">บัญชีผู้ดูแล</span>
        ),
    },
    {
      key: "roles",
      header: "บทบาท",
      cell: (item) => (
        <div className="flex flex-wrap gap-1">
          {(item.roles ?? []).length === 0 ? (
            <span className="text-slate-300">ยังไม่มีบทบาท</span>
          ) : (
            (item.roles ?? []).map((role, index) => (
              <Badge key={role.id ?? role.code ?? `role-${index}`} tone="neutral">
                {role.code}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <Badge tone={item.status === "ACTIVE" ? "positive" : "critical"}>
          {STATUS_TEXT[item.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      cell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" onClick={() => openEdit(item)}>
            แก้ไข
          </Button>

          <RowMenu
            items={[
              {
                label: "แก้ไขบัญชี",
                icon: <Pencil className="h-4 w-4" />,
                onSelect: () => openEdit(item),
              },
              {
                label: "รีเซ็ตรหัสผ่าน",
                icon: <KeyRound className="h-4 w-4" />,
                onSelect: () => {
                  setResetting(item);
                  setNewPassword("");
                },
              },
              {
                label:
                  item.status === "ACTIVE" ? "ระงับบัญชี" : "เปิดใช้งานบัญชี",
                icon:
                  item.status === "ACTIVE" ? (
                    <Ban className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  ),
                onSelect: () => confirmToggleStatus(item),
              },
              {
                label: "ลบบัญชี",
                icon: <Trash2 className="h-4 w-4" />,
                tone: "danger",
                onSelect: () => confirmDelete(item),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      {companies.length === 0 ? (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="warning">
            ยังไม่มีบริษัทในระบบ — สร้างบริษัทที่หน้า{" "}
            <span className="font-semibold">บริษัท &amp; สาขา</span> ก่อน
            แล้วค่อยกลับมาสร้างบัญชีผู้ดูแลให้บริษัทนั้น
          </Notice>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-end sm:px-6">
        <div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-3">
          <SearchInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="ค้นหาชื่อ อีเมล"
            aria-label="ค้นหาบัญชีผู้ใช้"
          />

          <Select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            aria-label="บริษัท"
          >
            <option value="">ทุกบริษัท</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {orgLabel(company)}
              </option>
            ))}
          </Select>

          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="สถานะ"
          >
            <option value="">ทุกสถานะ</option>
            <option value="ACTIVE">เปิดใช้งาน</option>
            <option value="INACTIVE">ปิดใช้งาน</option>
            <option value="SUSPENDED">ถูกระงับ</option>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void reload()}
            disabled={loading}
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
          >
            รีเฟรช
          </Button>

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            disabled={companies.length === 0}
            onClick={() => setCreateOpen(true)}
          >
            สร้างบัญชีผู้ดูแลบริษัท
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={users}
        rowKey={(item) => item.id}
        loading={loading && users.length === 0}
        emptyTitle="ยังไม่มีบัญชีผู้ใช้ตามเงื่อนไขนี้"
      />

      {createOpen ? (
        <Modal
          open
          size="md-wide"
          title="สร้างบัญชีผู้ดูแลบริษัท"
          description="บัญชีนี้ไม่ผูกกับพนักงาน ใช้ให้ผู้ดูแลของบริษัทเข้ามาตั้งค่าและสร้างพนักงานคนแรก"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <Button onClick={() => setCreateOpen(false)} disabled={loading}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                loading={loading}
                icon={<KeyRound className="h-3.5 w-3.5" />}
                onClick={() => void handleCreate()}
              >
                สร้างบัญชี
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="อีเมลเข้าสู่ระบบ" required>
                <TextInput
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="admin@company.com"
                />
              </Field>

              <Field label="ชื่อที่แสดง">
                <TextInput
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="เช่น ผู้ดูแลบริษัท ก"
                />
              </Field>

              <Field label="บริษัทที่ดูแล" required>
                <Select
                  value={draft.scopedCompanyId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scopedCompanyId: event.target.value,
                      scopedBranchId: "",
                    }))
                  }
                >
                  <option value="">เลือกบริษัท</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {orgLabel(company)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="ขอบเขตการมองเห็น"
                hint="เลือกสาขาเดียวเมื่อต้องการจำกัดให้เห็นแค่สาขานั้น"
              >
                <Select
                  value={draft.scopeLevel}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scopeLevel:
                        event.target.value === "BRANCH" ? "BRANCH" : "COMPANY",
                      scopedBranchId: "",
                    }))
                  }
                >
                  <option value="COMPANY">ทั้งบริษัท</option>
                  <option value="BRANCH">เฉพาะสาขาเดียว</option>
                </Select>
              </Field>

              {draft.scopeLevel === "BRANCH" ? (
                <Field label="สาขา" required>
                  <Select
                    value={draft.scopedBranchId}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        scopedBranchId: event.target.value,
                      }))
                    }
                  >
                    <option value="">เลือกสาขา</option>
                    {branchOptions.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {orgLabel(branch)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <Field label="รหัสผ่านเริ่มต้น" required hint="อย่างน้อย 8 ตัวอักษร">
                <TextInput
                  type="text"
                  value={draft.password}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                บทบาท
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                ผู้ดูแลบริษัทมักใช้ HR_ADMIN — ให้ SYSTEM_ADMIN เฉพาะเมื่อต้องคุมข้ามบริษัทจริง ๆ
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {roles.map((role) => (
                  <Checkbox
                    key={role.id}
                    label={`${role.code}${role.name ? ` · ${role.name}` : ""}`}
                    checked={draft.roleCodes.includes(role.code)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        roleCodes: event.target.checked
                          ? [...current.roleCodes, role.code]
                          : current.roleCodes.filter((code) => code !== role.code),
                      }))
                    }
                  />
                ))}
              </div>
            </div>

            <Notice tone="info">
              <span className="font-semibold">ลำดับการเปิดบริษัทใหม่:</span> สร้างบริษัท
              &amp; สาขา <Building2 className="inline h-3 w-3" /> → สร้างบัญชีนี้ →
              ส่งอีเมล/รหัสผ่านให้ผู้ดูแลบริษัท → เขาเข้ามาสร้างแผนกและพนักงานเอง
            </Notice>
          </div>
        </Modal>
      ) : null}

      {editing ? (
        <Modal
          open
          size="md-wide"
          title={`แก้ไขบัญชี ${userName(editing)}`}
          description={editing.email ?? undefined}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={loading}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                loading={loading}
                onClick={() => void handleSaveEdit()}
              >
                บันทึก
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ชื่อที่แสดง">
                <TextInput
                  value={editDraft.displayName}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field
                label="ขอบเขตการมองเห็น"
                hint="ทุกบริษัท = ผู้ดูแลแพลตฟอร์ม ใช้เท่าที่จำเป็น"
              >
                <Select
                  value={editDraft.scopeLevel}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      scopeLevel: event.target.value as typeof current.scopeLevel,
                      scopedBranchId: "",
                    }))
                  }
                >
                  <option value="COMPANY">ทั้งบริษัท</option>
                  <option value="BRANCH">เฉพาะสาขาเดียว</option>
                  <option value="GLOBAL">ทุกบริษัท</option>
                </Select>
              </Field>

              {editDraft.scopeLevel !== "GLOBAL" ? (
                <Field label="บริษัทที่ดูแล" required>
                  <Select
                    value={editDraft.scopedCompanyId}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        scopedCompanyId: event.target.value,
                        scopedBranchId: "",
                      }))
                    }
                  >
                    <option value="">เลือกบริษัท</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {orgLabel(company)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {editDraft.scopeLevel === "BRANCH" ? (
                <Field label="สาขา" required>
                  <Select
                    value={editDraft.scopedBranchId}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        scopedBranchId: event.target.value,
                      }))
                    }
                  >
                    <option value="">เลือกสาขา</option>
                    {branches
                      .filter(
                        (branch) =>
                          !editDraft.scopedCompanyId ||
                          branch.companyId === editDraft.scopedCompanyId,
                      )
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {orgLabel(branch)}
                        </option>
                      ))}
                  </Select>
                </Field>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                บทบาท
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {roles.map((role) => (
                  <Checkbox
                    key={role.id}
                    label={`${role.code}${role.name ? ` · ${role.name}` : ""}`}
                    checked={editDraft.roleCodes.includes(role.code)}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        roleCodes: event.target.checked
                          ? [...current.roleCodes, role.code]
                          : current.roleCodes.filter((code) => code !== role.code),
                      }))
                    }
                  />
                ))}
              </div>
            </div>

            {editing.employee ? (
              <Notice tone="info">
                บัญชีนี้ผูกกับพนักงาน{" "}
                <span className="font-semibold">
                  {editing.employee.employeeCode} {editing.employee.displayName}
                </span>{" "}
                — แก้ข้อมูลพนักงานให้ทำที่แฟ้มพนักงานในพื้นที่บริษัท
              </Notice>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {resetting ? (
        <Modal
          open
          title={`ตั้งรหัสผ่านใหม่ให้ ${userName(resetting)}`}
          description={resetting.email ?? undefined}
          onClose={() => setResetting(null)}
          footer={
            <>
              <Button onClick={() => setResetting(null)} disabled={loading}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                loading={loading}
                icon={<KeyRound className="h-3.5 w-3.5" />}
                onClick={() => void handleResetPassword()}
              >
                ตั้งรหัสผ่าน
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="รหัสผ่านใหม่" required>
              <TextInput
                type="text"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="อย่างน้อย 8 ตัวอักษร"
              />
            </Field>

            <Notice tone="warning">
              ห้ามมีคำเดาง่าย (password · admin · employee · qwerty · 123456)
              และห้ามมีชื่อหรืออีเมลของเจ้าตัวอยู่ในรหัสผ่าน — ระบบจะปฏิเสธ
            </Notice>
          </div>
        </Modal>
      ) : null}

      <ActionDialog state={dialog} loading={loading} onClose={() => setDialog(null)} />
    </>
  );
}
