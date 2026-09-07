"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers3, Plus, RefreshCcw, ShieldCheck } from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { apiFetch, apiFetchWithMeta } from "@/lib/api";
import type { RoleListItem } from "@/types/user";

import {
  Badge,
  Button,
  CellStack,
  Checkbox,
  DataTable,
  Field,
  Modal,
  Notice,
  PageChip,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  TextInput,
  Textarea,
  type Column,
} from "@/components/kit";

type PlatformRole = RoleListItem & {
  companyId?: string | null;
  company?: { id: string; code?: string | null; nameTh?: string | null } | null;
};

type CompanyOption = { id: string; code?: string | null; nameTh?: string | null };

/**
 * บทบาททั้งระบบ (Platform Console)
 * ================================
 * เดิมหน้านี้ re-export หน้าเดียวกับพื้นที่บริษัท ซึ่งเป็นเครื่องมือแก้บทบาทของ HR
 * ที่นี่เป็นมุมของผู้ดูแลแพลตฟอร์ม: ดูว่าแม่แบบบทบาทในระบบมีอะไร แต่ละตัวถือสิทธิ์
 * อะไรบ้าง เพื่อตัดสินใจว่าจะให้บทบาทไหนกับผู้ดูแลบริษัทที่กำลังจะเปิดให้
 *
 * ที่นี่เป็นที่เดียวที่สร้าง "โรลระบบ" (companyId = null) ซึ่งใช้ร่วมได้ทุกบริษัท
 * พื้นที่บริษัทสร้างได้แต่โรลของบริษัทตัวเองเท่านั้น — backend บังคับไว้ตรง ๆ ที่
 * createRole(): scope ที่ไม่ใช่ GLOBAL จะถูกยัด companyId ของตัวเองเสมอ
 */

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

export default function PlatformRolesPage() {
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [permissions, setPermissions] = useState<
    Array<{ id: string; code: string; name?: string | null; group?: string | null }>
  >([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    code: "",
    name: "",
    description: "",
    /** ว่าง = โรลระบบใช้ร่วมทุกบริษัท */
    companyId: "",
    permissionCodes: [] as string[],
  });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PlatformRole | null>(null);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [roleResult, companyResult, permissionResult] = await Promise.all([
        apiFetchWithMeta<PlatformRole[]>("/roles?pageSize=100"),
        apiFetchWithMeta<CompanyOption[]>("/organization/companies?pageSize=200"),
        apiFetchWithMeta<
          Array<{ id: string; code: string; name?: string | null; group?: string | null }>
        >("/permissions?page=1&pageSize=300"),
      ]);

      setRoles(roleResult.data);
      setCompanies(companyResult.data);
      setPermissions(permissionResult.data);
    } catch (error) {
      setDialog({
        title: "โหลดบทบาทไม่สำเร็จ",
        description: error instanceof Error ? error.message : "ลองใหม่อีกครั้ง",
        confirmLabel: "รับทราบ",
        tone: "red",
        onConfirm: () => {},
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();

    return roles.filter((role) => {
      if (kind === "system" && !role.isSystem) return false;
      if (kind === "custom" && role.isSystem) return false;
      if (!term) return true;

      return (
        role.code.toLowerCase().includes(term) ||
        role.name.toLowerCase().includes(term)
      );
    });
  }, [roles, q, kind]);

  const summary = useMemo(
    () => ({
      total: roles.length,
      active: roles.filter((role) => role.isActive).length,
      system: roles.filter((role) => role.isSystem).length,
      assigned: roles.reduce((sum, role) => sum + role.permissions.length, 0),
    }),
    [roles],
  );

  async function handleCreate() {
    if (!draft.code.trim() || !draft.name.trim()) {
      setDialog({
        title: "ข้อมูลยังไม่ครบ",
        description: "ต้องระบุรหัสและชื่อบทบาท",
        confirmLabel: "รับทราบ",
        tone: "orange",
        onConfirm: () => {},
      });
      return;
    }

    setLoading(true);

    try {
      await apiFetch("/roles", {
        method: "POST",
        body: JSON.stringify({
          code: draft.code.trim().toUpperCase(),
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          // ว่าง = โรลระบบ (companyId = null) ซึ่งสร้างได้เฉพาะที่นี่
          companyId: draft.companyId || undefined,
          permissionCodes: draft.permissionCodes,
          isActive: true,
        }),
      });

      setCreateOpen(false);
      setDraft({
        code: "",
        name: "",
        description: "",
        companyId: "",
        permissionCodes: [],
      });
      await load();
    } catch (error) {
      setDialog({
        title: "สร้างบทบาทไม่สำเร็จ",
        description: error instanceof Error ? error.message : "ลองใหม่อีกครั้ง",
        confirmLabel: "รับทราบ",
        tone: "red",
        onConfirm: () => {},
      });
    } finally {
      setLoading(false);
    }
  }

  const columns: Array<Column<PlatformRole>> = [
    {
      key: "role",
      header: "บทบาท",
      cell: (item) => (
        <CellStack primary={item.code} secondary={item.name} />
      ),
    },
    {
      key: "owner",
      header: "ใช้กับบริษัท",
      cell: (item) =>
        item.companyId ? (
          <CellStack
            primary={item.company?.nameTh ?? item.company?.code ?? "บริษัทเดียว"}
            secondary="เฉพาะบริษัทนี้"
          />
        ) : (
          <Badge tone="brand">ใช้ร่วมทุกบริษัท</Badge>
        ),
    },
    {
      key: "kind",
      header: "ประเภท",
      hideBelow: "lg",
      cell: (item) => (
        <Badge tone={item.isSystem ? "brand" : "neutral"}>
          {item.isSystem ? "แม่แบบระบบ" : "สร้างเพิ่ม"}
        </Badge>
      ),
    },
    {
      key: "permissions",
      header: "สิทธิ์ที่ถือ",
      align: "center",
      cell: (item) => (
        <span className="font-semibold tabular-nums text-slate-800">
          {count(item.permissions.length)}
        </span>
      ),
    },
    {
      key: "description",
      header: "คำอธิบาย",
      hideBelow: "lg",
      cell: (item) => item.description || "-",
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <Badge tone={item.isActive ? "positive" : "neutral"}>
          {item.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      cell: (item) => (
        <Button size="sm" onClick={() => setDetail(item)}>
          ดูสิทธิ์
        </Button>
      ),
    },
  ];

  return (
    <PageSurface>
      <PageHeading
        title="บทบาททั้งระบบ"
        description="แม่แบบบทบาทที่ใช้ได้ทุกบริษัท ดูว่าแต่ละบทบาทถือสิทธิ์อะไรก่อนมอบให้ผู้ดูแลบริษัท"
        chips={
          <>
            <PageChip tone="brand" icon={<Layers3 className="h-3 w-3" />}>
              บทบาท {count(summary.total)}
            </PageChip>
            <PageChip icon={<ShieldCheck className="h-3 w-3" />}>
              สิทธิ์ที่ผูกรวม {count(summary.assigned)}
            </PageChip>
          </>
        }
        actions={
          <div className={TILE_BOX}>
            <StatTile label="บทบาททั้งหมด" value={count(summary.total)} helper="ในระบบนี้" />
            <StatTile
              label="เปิดใช้งาน"
              value={count(summary.active)}
              tone="positive"
              helper="ใช้งานอยู่จริง"
            />
            <StatTile
              label="แม่แบบระบบ"
              value={count(summary.system)}
              helper={`ของบริษัท ${count(summary.total - summary.system)}`}
            />
            <StatTile
              label="สิทธิ์ที่ผูก"
              value={count(summary.assigned)}
              helper="รวมทุกบทบาท"
            />
          </div>
        }
      />

      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-end sm:px-6">
        <div className="grid w-full gap-2 sm:max-w-md sm:grid-cols-2">
          <SearchInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="ค้นหารหัสหรือชื่อบทบาท"
            aria-label="ค้นหาบทบาท"
          />
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-label="ประเภทบทบาท"
          >
            <option value="">ทุกประเภท</option>
            <option value="system">แม่แบบระบบ</option>
            <option value="custom">ของบริษัท</option>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void load()}
            disabled={loading}
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
          >
            รีเฟรช
          </Button>

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreateOpen(true)}
          >
            สร้างบทบาท
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(item) => item.id}
        loading={loading && roles.length === 0}
        onRowClick={(item) => setDetail(item)}
        emptyTitle="ไม่พบบทบาทตามเงื่อนไขนี้"
      />

      {detail ? (
        <Modal
          open
          size="md-wide"
          title={`สิทธิ์ของบทบาท ${detail.code}`}
          description={`${detail.name} · ถือ ${count(detail.permissions.length)} สิทธิ์`}
          onClose={() => setDetail(null)}
          footer={
            <Button variant="secondary" onClick={() => setDetail(null)}>
              ปิด
            </Button>
          }
        >
          <div className="space-y-4">
            {Object.entries(
              detail.permissions.reduce<Record<string, typeof detail.permissions>>(
                (groups, permission) => {
                  const key = permission.group || "อื่น ๆ";
                  groups[key] = [...(groups[key] ?? []), permission];
                  return groups;
                },
                {},
              ),
            ).map(([group, items]) => (
              <section
                key={group}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                <p className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] font-bold text-slate-800">
                  {group}
                  <span className="text-[11px] font-semibold text-slate-400">
                    {count(items.length)} สิทธิ์
                  </span>
                </p>

                <ul className="divide-y divide-slate-100">
                  {items.map((permission) => (
                    <li key={permission.id} className="px-4 py-2">
                      <p className="text-[13px] font-semibold text-slate-900">
                        {permission.code}
                      </p>
                      <p className="text-[11px] text-slate-400 3xl:text-[12px]">
                        {permission.name}
                        {permission.description ? ` · ${permission.description}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Modal>
      ) : null}

      {createOpen ? (
        <Modal
          open
          size="md-wide"
          title="สร้างบทบาท"
          description="เลือกได้ว่าจะเป็นบทบาทที่ใช้ร่วมทุกบริษัท หรือของบริษัทใดบริษัทหนึ่ง"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <Button onClick={() => setCreateOpen(false)} disabled={loading}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                loading={loading}
                onClick={() => void handleCreate()}
              >
                สร้างบทบาท
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="รหัสบทบาท" required hint="ตัวพิมพ์ใหญ่ เช่น COMPANY_ADMIN">
                <TextInput
                  value={draft.code}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, code: event.target.value }))
                  }
                  placeholder="COMPANY_ADMIN"
                />
              </Field>

              <Field label="ชื่อบทบาท" required>
                <TextInput
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="ผู้ดูแลบริษัท"
                />
              </Field>

              <Field
                label="ใช้กับบริษัท"
                hint="ไม่เลือก = ใช้ร่วมได้ทุกบริษัท (สร้างได้เฉพาะที่นี่)"
              >
                <Select
                  value={draft.companyId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      companyId: event.target.value,
                    }))
                  }
                >
                  <option value="">ใช้ร่วมทุกบริษัท</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.nameTh ?? company.code}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="คำอธิบาย">
                <Textarea
                  rows={2}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <p className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] font-bold text-slate-800">
                สิทธิ์ที่ให้บทบาทนี้
                <span className="text-[11px] font-semibold text-slate-400">
                  เลือกแล้ว {count(draft.permissionCodes.length)} จาก{" "}
                  {count(permissions.length)}
                </span>
              </p>

              <div className="max-h-72 overflow-y-auto px-4 py-3">
                {Object.entries(
                  permissions.reduce<Record<string, typeof permissions>>(
                    (groups, permission) => {
                      const key = permission.group || "อื่น ๆ";
                      groups[key] = [...(groups[key] ?? []), permission];
                      return groups;
                    },
                    {},
                  ),
                ).map(([group, items]) => (
                  <div key={group} className="mb-3 last:mb-0">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {group}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((permission) => (
                        <Checkbox
                          key={permission.id}
                          label={permission.code}
                          checked={draft.permissionCodes.includes(permission.code)}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              permissionCodes: event.target.checked
                                ? [...current.permissionCodes, permission.code]
                                : current.permissionCodes.filter(
                                    (code) => code !== permission.code,
                                  ),
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Notice tone="info">
              บทบาทที่สร้างที่นี่จะเป็น &ldquo;สร้างเพิ่ม&rdquo; เสมอ ไม่ใช่แม่แบบระบบ
              — แม่แบบระบบ 6 ตัวมาจากสคริปต์ตั้งค่าสิทธิ์ แก้ได้แต่ลบไม่ได้
            </Notice>
          </div>
        </Modal>
      ) : null}

      <ActionDialog state={dialog} loading={loading} onClose={() => setDialog(null)} />
    </PageSurface>
  );
}
