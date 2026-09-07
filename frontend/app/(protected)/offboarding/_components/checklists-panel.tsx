"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";

import {
  apiFetch,
  createOffboardingChecklist,
  deleteOffboardingChecklist,
  getOffboardingChecklists,
} from "@/lib/api";

import type {
  OffboardingChecklist,
  OffboardingChecklistListSummary,
} from "@/types/offboarding";

import {
  Badge,
  Button,
  CellStack,
  DataTable,
  Field,
  IconButton,
  Modal,
  RowMenu,
  SearchInput,
  Select,
  TextInput,
  joinClassName,
  type Column,
} from "@/components/kit";

/**
 * แท็บ "เช็กลิสต์เคลียร์ของ"
 * -------------------------
 * แม่แบบรายการที่ต้องเคลียร์ ใช้ซ้ำได้ทุกคน — เปิดเคสใหม่แล้วระบบกางรายการจาก
 * เช็กลิสต์นี้ให้อัตโนมัติ ตรรกะยกมาจากหน้าเดิมทั้งชุด เปลี่ยนเฉพาะเปลือก
 */

type CompanyOption = {
  id: string;
  code?: string;
  nameTh?: string;
  name?: string;
};

type CompanyListResponse = { items?: CompanyOption[]; data?: CompanyOption[] };

const emptySummary: OffboardingChecklistListSummary = {
  total: 0,
  active: 0,
  inactive: 0,
};

export type ChecklistsSummary = OffboardingChecklistListSummary;

export function ChecklistsPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: ChecklistsSummary) => void;
}) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [checklists, setChecklists] = useState<OffboardingChecklist[]>([]);
  const [summary, setSummary] = useState<OffboardingChecklistListSummary>(
    emptySummary,
  );

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState({
    companyId: "",
    code: "",
    name: "",
    description: "",
    items: [
      { title: "", category: "", ownerRole: "", isRequired: true },
    ] as Array<{
      title: string;
      category: string;
      ownerRole: string;
      isRequired: boolean;
    }>,
  });

  useEffect(() => {
    onSummaryChange?.(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  function showError(error: unknown, fallback: string) {
    setActionDialog({
      title: "เกิดข้อผิดพลาด",
      description: error instanceof Error ? error.message : fallback,
      confirmLabel: "รับทราบ",
      tone: "red",
      onConfirm: () => {},
    });
  }

  async function loadCompanies() {
    const companyData = await apiFetch<CompanyOption[] | CompanyListResponse>(
      "/organization/companies",
    );

    const companyItems = Array.isArray(companyData)
      ? companyData
      : (companyData.items ?? companyData.data ?? []);

    setCompanies(companyItems);

    const defaultCompanyId = companyItems[0]?.id ?? "";

    if (defaultCompanyId) {
      setChecklistDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || defaultCompanyId,
      }));
    }
  }

  async function loadChecklists() {
    const data = await getOffboardingChecklists({
      page: 1,
      pageSize: 100,
      q: search.trim() || undefined,
    });

    setChecklists(data.items ?? []);
    setSummary(data.summary ?? emptySummary);
  }

  async function reloadAll() {
    setLoading(true);

    try {
      await Promise.all([loadCompanies(), loadChecklists()]);
    } catch (error) {
      console.error(error);
      showError(error, "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchMountedRef = useRef(false);

  // ค้นหาอัตโนมัติระหว่างพิมพ์ หน่วง 350ms กันยิง API ทุกตัวอักษร
  useEffect(() => {
    if (!searchMountedRef.current) {
      searchMountedRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);

        try {
          await loadChecklists();
        } catch (error) {
          console.error(error);
          showError(error, "ค้นหาไม่สำเร็จ");
        } finally {
          setLoading(false);
        }
      })();
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleCreateChecklist() {
    const items = checklistDraft.items.filter((item) => item.title.trim());

    if (!checklistDraft.code.trim() || !checklistDraft.name.trim()) {
      setActionDialog({
        title: "ข้อมูลไม่ครบ",
        description: "กรุณากรอกรหัสและชื่อเช็กลิสต์",
        confirmLabel: "รับทราบ",
        tone: "orange",
        onConfirm: () => {},
      });
      return false;
    }

    if (items.length === 0) {
      setActionDialog({
        title: "ข้อมูลไม่ครบ",
        description: "ต้องมีรายการอย่างน้อย 1 รายการ",
        confirmLabel: "รับทราบ",
        tone: "orange",
        onConfirm: () => {},
      });
      return false;
    }

    setLoading(true);

    try {
      await createOffboardingChecklist({
        companyId: checklistDraft.companyId || undefined,
        code: checklistDraft.code.trim(),
        name: checklistDraft.name.trim(),
        description: checklistDraft.description.trim() || undefined,
        items: items.map((item, index) => ({
          title: item.title.trim(),
          category: item.category.trim() || undefined,
          ownerRole: item.ownerRole.trim() || undefined,
          sortOrder: index + 1,
          isRequired: item.isRequired,
        })),
      });

      setChecklistDraft((prev) => ({
        ...prev,
        code: "",
        name: "",
        description: "",
        items: [{ title: "", category: "", ownerRole: "", isRequired: true }],
      }));

      await loadChecklists();

      setActionDialog({
        title: "สร้างเช็กลิสต์สำเร็จ",
        description: "พร้อมใช้กับเคสใหม่แล้ว",
        confirmLabel: "รับทราบ",
        tone: "emerald",
        onConfirm: () => {},
      });

      return true;
    } catch (error) {
      console.error(error);
      showError(error, "สร้างเช็กลิสต์ไม่สำเร็จ");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function handleDeleteChecklist(id: string, name: string) {
    setActionDialog({
      title: "ลบเช็กลิสต์",
      description: `ต้องการลบ "${name}" ใช่ไหม เคสที่เปิดไปแล้วจะไม่ได้รับผลกระทบ`,
      confirmLabel: "ลบเช็กลิสต์",
      tone: "red",
      onConfirm: async () => {
        setLoading(true);

        try {
          await deleteOffboardingChecklist(id);
          await loadChecklists();
        } catch (error) {
          console.error(error);
          showError(error, "ลบไม่สำเร็จ");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  const columns: Array<Column<OffboardingChecklist>> = [
    {
      key: "name",
      header: "รหัส / ชื่อ",
      cell: (item) => <CellStack primary={item.name} secondary={item.code} />,
    },
    {
      key: "items",
      header: "รายการ",
      cell: (item) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">
            {item.items.length.toLocaleString("th-TH")} รายการ
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {item.items
              .slice(0, 3)
              .map((row) => row.title)
              .join(" · ")}
            {item.items.length > 3 ? " ..." : ""}
          </p>
        </div>
      ),
    },
    {
      key: "required",
      header: "บังคับ",
      hideBelow: "lg",
      cell: (item) =>
        `${item.items.filter((row) => row.isRequired).length} รายการ`,
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <Badge tone={item.status === "ACTIVE" ? "positive" : "neutral"}>
          {item.status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      cell: (item) => (
        <RowMenu
          items={[
            {
              label: "ลบเช็กลิสต์",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger",
              onSelect: () => handleDeleteChecklist(item.id, item.name),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-end sm:px-6">
        <Field label="ค้นหาเช็กลิสต์" className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหารหัสหรือชื่อเช็กลิสต์"
            aria-label="ค้นหาเช็กลิสต์เคลียร์ของ"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void reloadAll()}
            disabled={loading}
            icon={
              <RefreshCcw
                className={joinClassName("h-3.5 w-3.5", loading && "animate-spin")}
              />
            }
          >
            รีเฟรช
          </Button>

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreateOpen(true)}
          >
            สร้างเช็กลิสต์
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={checklists}
        rowKey={(item) => item.id}
        loading={loading && checklists.length === 0}
        emptyTitle="ยังไม่มีเช็กลิสต์เคลียร์ของ"
      />

      {createOpen ? (
        <Modal
          open
          title="สร้างเช็กลิสต์เคลียร์ของ"
          onClose={() => setCreateOpen(false)}
        >
          <ChecklistForm
            draft={checklistDraft}
            companies={companies}
            loading={loading}
            onChange={setChecklistDraft}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async () => {
              if (await handleCreateChecklist()) setCreateOpen(false);
            }}
          />
        </Modal>
      ) : null}

      <ActionDialog
        state={actionDialog}
        loading={loading}
        onClose={() => setActionDialog(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Create-checklist form                                               */
/* ------------------------------------------------------------------ */

type ChecklistDraft = {
  companyId: string;
  code: string;
  name: string;
  description: string;
  items: Array<{
    title: string;
    category: string;
    ownerRole: string;
    isRequired: boolean;
  }>;
};

function ChecklistForm({
  draft,
  companies,
  loading,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: ChecklistDraft;
  companies: CompanyOption[];
  loading: boolean;
  onChange: Dispatch<SetStateAction<ChecklistDraft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="บริษัท">
          <Select
            value={draft.companyId}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, companyId: event.target.value }))
            }
          >
            <option value="">ใช้ร่วมทุกบริษัท</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nameTh ?? company.name ?? company.code}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="รหัสเช็กลิสต์" required>
          <TextInput
            value={draft.code}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, code: event.target.value }))
            }
            placeholder="เช่น OFB_OFFICE"
          />
        </Field>

        <Field label="ชื่อเช็กลิสต์" required>
          <TextInput
            value={draft.name}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="เช่น เคลียร์ของพนักงานออฟฟิศ"
          />
        </Field>

        <Field label="คำอธิบาย">
          <TextInput
            value={draft.description}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </Field>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-bold text-slate-800">
            รายการที่ต้องเคลียร์
          </p>
          <Button
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() =>
              onChange((prev) => ({
                ...prev,
                items: [
                  ...prev.items,
                  { title: "", category: "", ownerRole: "", isRequired: true },
                ],
              }))
            }
          >
            เพิ่มรายการ
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {draft.items.map((item, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              <TextInput
                value={item.title}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    items: prev.items.map((row, position) =>
                      position === index
                        ? { ...row, title: event.target.value }
                        : row,
                    ),
                  }))
                }
                placeholder="ชื่อรายการ"
                className="min-w-0 flex-1"
              />
              <TextInput
                value={item.category}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    items: prev.items.map((row, position) =>
                      position === index
                        ? { ...row, category: event.target.value }
                        : row,
                    ),
                  }))
                }
                placeholder="หมวด"
                className="w-32"
              />
              <TextInput
                value={item.ownerRole}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    items: prev.items.map((row, position) =>
                      position === index
                        ? { ...row, ownerRole: event.target.value }
                        : row,
                    ),
                  }))
                }
                placeholder="ผู้รับผิดชอบ"
                className="w-32"
              />
              <IconButton
                title="ลบรายการ"
                tone="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    items: prev.items.filter(
                      (_, position) => position !== index,
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button onClick={onCancel} disabled={loading}>
          ยกเลิก
        </Button>
        <Button variant="primary" loading={loading} onClick={onSubmit}>
          สร้างเช็กลิสต์
        </Button>
      </div>
    </div>
  );
}
