"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Edit3,
  KeyRound,
  Loader2,
  Plus,
  X,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

import { DateTimeDisplay } from "@/components/common/date-display";
import {
  Badge,
  Button,
  DataTable,
  Field,
  IconButton,
  Modal as KitModal,
  RowMenu,
  SearchInput,
  Select,
  TextInput,
  Toggle,
  type Column,
} from "@/components/kit";
import { ApiClientError, apiFetch, apiFetchWithMeta } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import type {
  PaginationMeta,
  PermissionItem,
  PermissionListSummary,
  RoleItem,
  RoleListSummary,
} from "@/types/access-control";

type RoleForm = {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  permissionCodes: string[];
};

const defaultRoleForm: RoleForm = {
  code: "",
  name: "",
  description: "",
  isActive: true,
  permissionCodes: [],
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** ตัวเลขสรุปที่หน้าหลักเอาไปวางข้างหัวเรื่อง */
export type RolesSummary = {
  total: number;
  active: number;
  system: number;
  custom: number;
  assignedPermissions: number;
};

export function RolesPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: RolesSummary) => void;
}) {
  const { user } = useAuth();
  // ผู้ดูแลแพลตฟอร์มจัดการได้ทุกโรล; บริษัทจัดการได้เฉพาะโรลของตน (scopeType COMPANY)
  const isPlatform = user?.scope?.level === "GLOBAL";
  const canManageRole = (role: RoleItem) =>
    isPlatform || role.scopeType === "COMPANY";

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [roleSummary, setRoleSummary] = useState<RoleListSummary | null>(null);
  const [, setPermissionSummary] = useState<PermissionListSummary | null>(null);

  const [q, setQ] = useState("");
  const [isActive, setIsActive] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<RoleForm>(defaultRoleForm);

  const [editRole, setEditRole] = useState<RoleItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    isActive: true,
  });

  const [permissionRole, setPermissionRole] = useState<RoleItem | null>(null);
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<
    string[]
  >([]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (isActive) params.set("isActive", isActive);
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
  }, [q, isActive, page]);

  const permissionGroups = useMemo(
    () =>
      Array.from(
        new Set(permissions.map((permission) => permission.group)),
      ).sort(),
    [permissions],
  );

  const totalRoles = roleSummary?.total ?? meta?.total ?? 0;

  async function loadRoles(mode: "initial" | "refresh" = "refresh") {
    try {
      if (mode === "initial") setLoading(true);
      setError("");
      const result = await apiFetchWithMeta<
        RoleItem[],
        PaginationMeta,
        RoleListSummary
      >(`/roles?${queryString}`);
      setRoles(result.data);
      setMeta(result.meta ?? null);
      setRoleSummary(result.summary ?? null);
      onSummaryChange?.({
        total: result.summary?.total ?? result.meta?.total ?? 0,
        active: result.summary?.active ?? 0,
        system: result.summary?.system ?? 0,
        custom: result.summary?.custom ?? 0,
        assignedPermissions: result.summary?.assignedPermissions ?? 0,
      });
    } catch (loadError) {
      const message = getErrorMessage(loadError, "โหลด Role ไม่สำเร็จ");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPermissions() {
    try {
      const result = await apiFetchWithMeta<
        PermissionItem[],
        PaginationMeta,
        PermissionListSummary
      >("/permissions?pageSize=100");
      setPermissions(result.data);
      setPermissionSummary(result.summary ?? null);
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, "โหลด Permission ไม่สำเร็จ"));
    }
  }

  useEffect(() => {
    loadRoles("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    loadPermissions();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, isActive]);

  async function handleCreateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createForm.code.trim() || !createForm.name.trim()) {
      toast.error("กรุณาระบุ Role Code และชื่อ Role");
      return;
    }

    try {
      setSubmitting(true);
      await apiFetch<RoleItem>("/roles", {
        method: "POST",
        body: JSON.stringify({
          code: createForm.code.trim().toUpperCase(),
          name: createForm.name.trim(),
          description: createForm.description.trim() || undefined,
          isActive: createForm.isActive,
          permissionCodes: createForm.permissionCodes,
        }),
      });
      toast.success("สร้าง Role สำเร็จ");
      setCreateOpen(false);
      setCreateForm(defaultRoleForm);
      await loadRoles();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "สร้าง Role ไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRole) return;
    try {
      setSubmitting(true);
      await apiFetch<RoleItem>(`/roles/${editRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim() || undefined,
          isActive: editForm.isActive,
        }),
      });
      toast.success("แก้ไข Role สำเร็จ");
      setEditRole(null);
      await loadRoles();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "แก้ไข Role ไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePermissions() {
    if (!permissionRole) return;
    try {
      setSubmitting(true);
      await apiFetch<RoleItem>(`/roles/${permissionRole.id}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissionCodes: selectedPermissionCodes }),
      });
      toast.success("อัปเดต Permission ของ Role สำเร็จ");
      setPermissionRole(null);
      setSelectedPermissionCodes([]);
      await loadRoles();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "อัปเดต Permission ไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  function openCreateModal() {
    setCreateForm(defaultRoleForm);
    setCreateOpen(true);
  }

  function openEditModal(role: RoleItem) {
    setEditRole(role);
    setEditForm({
      name: role.name,
      description: role.description ?? "",
      isActive: role.isActive,
    });
  }

  function openPermissionModal(role: RoleItem) {
    setPermissionRole(role);
    setSelectedPermissionCodes(
      role.permissions.map((permission) => permission.code),
    );
  }

  function toggleCreatePermission(code: string) {
    setCreateForm((current) => ({
      ...current,
      permissionCodes: toggleValue(current.permissionCodes, code),
    }));
  }

  function toggleAssignPermission(code: string) {
    setSelectedPermissionCodes((current) => toggleValue(current, code));
  }

  const columns: Array<Column<RoleItem>> = [
    {
      key: "role",
      header: "บทบาท",
      width: "w-[34%]",
      cell: (role) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px] 4xl:text-[15px]">
            {role.code}
          </p>
          <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
            {role.description
              ? `${role.name} · ${role.description}`
              : role.name}
          </p>
        </div>
      ),
    },
    {
      key: "permissions",
      header: "สิทธิ์ที่ผูก",
      width: "w-[10rem]",
      cell: (role) =>
        role.permissions.length === 0 ? (
          <span className="text-slate-300">ยังไม่มีสิทธิ์</span>
        ) : (
          // แสดงเป็นจำนวน กดแล้วค่อยเปิดดูรายการเต็ม — ถ้าโชว์ทุกชิปแถวจะสูงจนตารางเสียจังหวะ
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openPermissionModal(role);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 transition hover:bg-brand-50 3xl:text-[14px]"
          >
            {role.permissions.length.toLocaleString("th-TH")} สิทธิ์
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ),
    },
    {
      key: "type",
      header: "ประเภท",
      width: "w-[9rem]",
      cell: (role) => (
        <span className="text-slate-500">
          {role.scopeType === "SYSTEM" ? "แม่แบบระบบ" : "ของบริษัท"}
        </span>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-[8rem]",
      cell: (role) => (
        <Badge tone={role.isActive ? "positive" : "neutral"}>
          {role.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
        </Badge>
      ),
    },
    {
      key: "updated",
      header: "อัปเดตล่าสุด",
      width: "w-[11rem]",
      hideBelow: "xl",
      cell: (role) => (
        <span className="text-slate-500">
          <DateTimeDisplay value={role.updatedAt} />
        </span>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      width: "w-[6rem]",
      cell: (role) => (
        <RowMenu
          items={[
            {
              label: canManageRole(role) ? "กำหนดสิทธิ์" : "ดูสิทธิ์ที่ผูก",
              icon: <KeyRound className="h-4 w-4" />,
              onSelect: () => openPermissionModal(role),
            },
            {
              label: "แก้ไขบทบาท",
              icon: <Edit3 className="h-4 w-4" />,
              disabled: !canManageRole(role),
              onSelect: () => openEditModal(role),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      {/* ตัวกรองอยู่แถวเดียวกับช่องค้นหา เหมือนหน้าค่าจ้างพนักงาน */}
      <div className="flex flex-col gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={isActive}
            onChange={(event) => setIsActive(event.target.value)}
            className="w-full bg-white sm:w-40"
            aria-label="สถานะ"
          >
            <option value="">ทุกสถานะ</option>
            <option value="true">เปิดใช้งาน</option>
            <option value="false">ปิดใช้งาน</option>
          </Select>

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={openCreateModal}
          >
            สร้างบทบาท
          </Button>

          {q || isActive ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setIsActive("");
                setPage(1);
              }}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 xl:shrink-0">
          <p className="hidden whitespace-nowrap text-[12px] text-slate-500 sm:block 3xl:text-[13px]">
            {q || isActive
              ? `เจอ ${roles.length.toLocaleString("th-TH")} จาก ${totalRoles.toLocaleString("th-TH")} บทบาท`
              : `ทั้งหมด ${totalRoles.toLocaleString("th-TH")} บทบาท`}
          </p>

          <div className="[&_input]:bg-white">
            <SearchInput
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="ค้นหารหัส ชื่อ หรือคำอธิบาย"
              className="w-full sm:w-60"
              aria-label="ค้นหาบทบาท"
            />
          </div>

          <IconButton
            title="โหลดข้อมูลใหม่"
            icon={
              loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )
            }
            onClick={() => {
              loadRoles();
              loadPermissions();
            }}
          />
        </div>
      </div>

      {/* หัวคอลัมน์โทนเดียวกับหน้าค่าจ้างพนักงาน — แถวเยอะให้กดหน้าถัดไปเอา ไม่ทำเป็นพื้นที่เลื่อนซ้อน */}
      <div className="[&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:text-slate-600">
        <DataTable
          columns={columns}
          rows={roles}
          rowKey={(role) => role.id}
          loading={loading}
          error={error || null}
          onRetry={() => loadRoles("initial")}
          emptyTitle="ไม่พบบทบาทตามเงื่อนไข"
          emptyDescription="ลองล้างตัวกรองหรือเปลี่ยนคำค้น"
          minWidth="min-w-[64rem]"
        />
      </div>

      {!loading && !error && roles.length > 0 ? (
        <Pagination page={page} meta={meta} onPageChange={setPage} />
      ) : null}

      {createOpen ? (
        <Modal
          title="สร้างบทบาทใหม่"
          subtitle="ตั้งชื่อบทบาท แล้วติ๊กสิทธิ์ที่ต้องการให้คนกลุ่มนี้ทำได้"
          size="wide"
          onClose={() => setCreateOpen(false)}
        >
          <form onSubmit={handleCreateRole} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <Field label="รหัสบทบาท" required>
                <TextInput
                  value={createForm.code}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="HR_VIEWER"
                  className="font-semibold uppercase tracking-wide"
                />
              </Field>

              <Field label="ชื่อบทบาท" required>
                <TextInput
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="HR Viewer"
                />
              </Field>
            </div>

            <Field
              label="คำอธิบาย"
              hint="บอกสั้น ๆ ว่าใครควรได้บทบาทนี้ จะได้ไม่สร้างซ้ำกันภายหลัง"
            >
              <TextInput
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="ดูข้อมูล HR ได้อย่างเดียว"
              />
            </Field>

            <div className="rounded-lg border border-slate-200 px-3.5 py-1">
              <Toggle
                label="เปิดใช้งานบทบาทนี้"
                hint="ถ้าปิด ผู้ใช้ที่ถือบทบาทนี้จะไม่ได้สิทธิ์ตามที่กำหนดไว้"
                checked={createForm.isActive}
                onChange={(checked) =>
                  setCreateForm((current) => ({
                    ...current,
                    isActive: checked,
                  }))
                }
              />
            </div>

            <PermissionSelector
              permissions={permissions}
              groups={permissionGroups}
              selectedCodes={createForm.permissionCodes}
              onToggle={toggleCreatePermission}
              onSetCodes={(codes) =>
                setCreateForm((current) => ({
                  ...current,
                  permissionCodes: codes,
                }))
              }
            />

            <ModalActions
              submitting={submitting}
              submitText="สร้างบทบาท"
              onCancel={() => setCreateOpen(false)}
            />
          </form>
        </Modal>
      ) : null}

      {editRole ? (
        <Modal
          title="แก้ไขบทบาท"
          subtitle={`${editRole.code} · ${editRole.name}`}
          onClose={() => setEditRole(null)}
        >
          <form onSubmit={handleUpdateRole} className="space-y-5">
            <Field label="ชื่อบทบาท" required>
              <TextInput
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="คำอธิบาย">
              <TextInput
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="rounded-lg border border-slate-200 px-3.5 py-1">
              <Toggle
                label="เปิดใช้งานบทบาทนี้"
                hint="ถ้าปิด ผู้ใช้ที่ถือบทบาทนี้จะไม่ได้สิทธิ์ตามที่กำหนดไว้"
                checked={editForm.isActive}
                onChange={(checked) =>
                  setEditForm((current) => ({ ...current, isActive: checked }))
                }
              />
            </div>

            <p className="text-[13px] text-slate-400">
              รหัสบทบาทแก้ไม่ได้ เพราะระบบอื่นอ้างถึงรหัสนี้อยู่ —
              สิทธิ์ที่ผูกให้แก้ที่เมนู &ldquo;กำหนดสิทธิ์&rdquo;
            </p>

            <ModalActions
              submitting={submitting}
              submitText="บันทึก"
              onCancel={() => setEditRole(null)}
            />
          </form>
        </Modal>
      ) : null}

      {permissionRole ? (
        <Modal
          title={`สิทธิ์ของ ${permissionRole.code}`}
          subtitle={`${permissionRole.name} · ผูกไว้ ${selectedPermissionCodes.length} สิทธิ์`}
          size="wide"
          onClose={() => setPermissionRole(null)}
        >
          <div className="space-y-4">
            <PermissionSelector
              permissions={permissions}
              groups={permissionGroups}
              selectedCodes={selectedPermissionCodes}
              onToggle={toggleAssignPermission}
              onSetCodes={setSelectedPermissionCodes}
              readOnly={!canManageRole(permissionRole)}
            />

            {canManageRole(permissionRole) ? (
              <ModalActions
                submitting={submitting}
                submitText="บันทึกสิทธิ์"
                onCancel={() => setPermissionRole(null)}
                onSubmit={handleSavePermissions}
              />
            ) : (
              // แม่แบบระบบแก้ไม่ได้ เปิดดูได้อย่างเดียว
              <div className="flex justify-end border-t border-slate-200 pt-4">
                <Button onClick={() => setPermissionRole(null)}>ปิด</Button>
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

function PermissionSelector({
  permissions,
  groups,
  selectedCodes,
  onToggle,
  onSetCodes,
  readOnly = false,
}: {
  permissions: PermissionItem[];
  groups: string[];
  selectedCodes: string[];
  onToggle: (code: string) => void;
  onSetCodes: (codes: string[]) => void;
  /** แม่แบบระบบเปิดดูได้ แต่ติ๊กแก้ไม่ได้ */
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const query = search.trim().toLowerCase();

  // กรองตามคำค้น (รหัส/ชื่อ/กลุ่ม) และตัวเลือก "เฉพาะที่เลือกไว้"
  const visibleByGroup = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const group of groups) {
      const items = permissions.filter(
        (p) =>
          p.group === group &&
          (!onlySelected || selectedSet.has(p.code)) &&
          (query === "" ||
            p.code.toLowerCase().includes(query) ||
            (p.name ?? "").toLowerCase().includes(query) ||
            group.toLowerCase().includes(query)),
      );
      if (items.length > 0) map.set(group, items);
    }
    return map;
  }, [permissions, groups, query, onlySelected, selectedSet]);

  const allVisibleCodes = useMemo(
    () =>
      Array.from(visibleByGroup.values())
        .flat()
        .map((p) => p.code),
    [visibleByGroup],
  );

  function setGroup(groupCodes: string[], checked: boolean) {
    if (checked) {
      onSetCodes(Array.from(new Set([...selectedCodes, ...groupCodes])));
    } else {
      const remove = new Set(groupCodes);
      onSetCodes(selectedCodes.filter((c) => !remove.has(c)));
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      {/* หัวกล่อง: จำนวนที่เลือก + ค้นหา + ปุ่มลัด อยู่แถวเดียว */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-700">
            สิทธิ์
          </span>
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-brand-700">
            {selectedCodes.length}/{permissions.length}
          </span>
          {selectedCodes.length > 0 ? (
            <button
              type="button"
              onClick={() => setOnlySelected((current) => !current)}
              className={cn(
                "rounded-lg px-2 py-1 text-[12px] font-semibold transition",
                onlySelected
                  ? "bg-brand-600 text-white"
                  : "text-slate-500 hover:bg-slate-200/70",
              )}
            >
              เฉพาะที่เลือก
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-56 [&_input]:h-8 [&_input]:bg-white">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาสิทธิ์หรือหมวด"
              aria-label="ค้นหาสิทธิ์"
            />
          </div>

          {readOnly ? null : (
            <>
              <Button size="sm" onClick={() => setGroup(allVisibleCodes, true)}>
                เลือกที่เห็น
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setGroup(allVisibleCodes, false)}
              >
                ล้าง
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="max-h-[24rem] divide-y divide-slate-100 overflow-y-auto">
        {visibleByGroup.size === 0 ? (
          <p className="py-12 text-center text-[13px] text-slate-400">
            {onlySelected && !query
              ? "ยังไม่ได้เลือกสิทธิ์ไว้เลย"
              : `ไม่พบสิทธิ์ที่ตรงกับ “${search}”`}
          </p>
        ) : null}

        {Array.from(visibleByGroup.entries()).map(
          ([group, groupPermissions]) => {
            const groupCodes = groupPermissions.map((p) => p.code);
            const selectedCount = groupCodes.filter((c) =>
              selectedSet.has(c),
            ).length;
            const allSelected = selectedCount === groupCodes.length;
            const isCollapsed = collapsed[group];

            return (
              <div key={group}>
                {/* หัวหมวดเกาะอยู่บนสุดขณะเลื่อน จะได้รู้ว่ากำลังดูหมวดไหน */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-100 bg-white/95 px-3 py-2 backdrop-blur">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [group]: !c[group] }))
                    }
                    className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-slate-700"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                        !isCollapsed && "rotate-90",
                      )}
                    />
                    <span className="truncate">{group}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                        selectedCount > 0
                          ? "bg-brand-50 text-brand-700"
                          : "bg-slate-100 text-slate-400",
                      )}
                    >
                      {selectedCount}/{groupCodes.length}
                    </span>
                  </button>

                  {readOnly ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setGroup(groupCodes, !allSelected)}
                    >
                      {allSelected ? "เอาออกทั้งหมวด" : "เลือกทั้งหมวด"}
                    </Button>
                  )}
                </div>

                {!isCollapsed ? (
                  <div className="grid px-3 py-1 lg:grid-cols-2 lg:gap-x-6">
                    {groupPermissions.map((permission) => {
                      const checked = selectedSet.has(permission.code);

                      return (
                        <label
                          key={permission.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition",
                            readOnly ? "cursor-default" : "hover:bg-slate-50",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={readOnly}
                            onChange={() => onToggle(permission.code)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600"
                          />
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "block truncate text-[12.5px] font-semibold",
                                checked ? "text-brand-700" : "text-slate-700",
                              )}
                            >
                              {permission.code}
                            </span>
                            <span className="block truncate text-[11px] text-slate-400">
                              {permission.name}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}

function Modal({
  title,
  subtitle,
  size = "default",
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  size?: "default" | "wide";
  children: ReactNode;
  onClose: () => void;
}) {
  // ใช้กล่องกลางของระบบ ปุ่มยืนยันอยู่ในฟอร์มด้านในเหมือนเดิม
  return (
    <KitModal
      open
      title={title}
      description={subtitle}
      size={size === "wide" ? "lg" : "md"}
      onClose={onClose}
    >
      {children}
    </KitModal>
  );
}

function ModalActions({
  submitting,
  submitText,
  onCancel,
  onSubmit,
}: {
  submitting: boolean;
  submitText: string;
  onCancel: () => void;
  onSubmit?: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
      <Button onClick={onCancel}>ยกเลิก</Button>
      <Button
        type={onSubmit ? "button" : "submit"}
        variant="primary"
        onClick={onSubmit}
        loading={submitting}
      >
        {submitText}
      </Button>
    </div>
  );
}

function Pagination({
  page,
  meta,
  onPageChange,
}: {
  page: number;
  meta: PaginationMeta | null;
  onPageChange: (page: number) => void;
}) {
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="text-[13px] text-slate-400">
        หน้า {meta?.page ?? page} จาก {totalPages}
      </span>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          disabled={page <= 1}
          onClick={() => {
            onPageChange(Math.max(page - 1, 1));
            scrollPagerToTop();
          }}
        >
          ก่อนหน้า
        </Button>
        <Button
          size="sm"
          disabled={page >= totalPages}
          onClick={() => {
            onPageChange(page + 1);
            scrollPagerToTop();
          }}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}

function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) return error.message;
  return fallbackMessage;
}
