"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Edit3,
  FileStack,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";

import { useAuth } from "@/contexts/auth-context";

import {
  createDocumentTemplate,
  createDocumentType,
  deleteDocumentTemplate,
  deleteDocumentType,
  getDocumentTemplates,
  getDocumentTypes,
  updateDocumentTemplate,
  updateDocumentType,
} from "@/lib/api";

import type {
  CreateDocumentTemplateForm,
  CreateDocumentTypeForm,
  DocumentTemplate,
  DocumentType,
  MasterStatus,
  UpdateDocumentTemplateForm,
  UpdateDocumentTypeForm,
} from "@/types/document-workflow";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { Button, StatTile, Tabs } from "@/components/kit";

/* ------------------------------------------------------------------ */
/* Design system tokens                                                */
/* ------------------------------------------------------------------ */

const CONTROL_BASE =
  "h-11 w-full rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 shadow-none outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 max-[1536px]:h-9 max-[1536px]:rounded-lg max-[1536px]:text-xs";

const INPUT_CLASS = `${CONTROL_BASE} pl-4 pr-4 max-[1536px]:pl-3 max-[1536px]:pr-3`;

const SELECT_CLASS = `${CONTROL_BASE} pl-4 pr-9 max-[1536px]:pl-3 max-[1536px]:pr-8`;

const TEXTAREA_CLASS =
  "w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-none outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

const PRIMARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-brand-600 bg-brand-600 px-5 text-sm font-semibold text-white shadow-none transition hover:bg-brand-700 disabled:opacity-60 max-[1536px]:h-9 max-[1536px]:rounded-lg max-[1536px]:px-4 max-[1536px]:text-xs";

const GHOST_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 max-[1536px]:h-9 max-[1536px]:rounded-lg max-[1536px]:px-3 max-[1536px]:text-xs";

const TH_CLASS =
  "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 max-[1536px]:px-3 max-[1536px]:py-2.5 max-[1536px]:text-[10px]";

const TD_CLASS =
  "px-4 py-3 align-top text-slate-700 max-[1536px]:px-3 max-[1536px]:py-2.5";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type SettingsTab = "types" | "templates";

type DocumentTypeFormState = {
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
  category: string;
  requiresApproval: boolean;
  approvalLevels: string;
  allowEmployeeRequest: boolean;
  status: MasterStatus;
};

type DocumentTemplateFormState = {
  documentTypeId: string;
  code: string;
  name: string;
  description: string;
  htmlContent: string;
  status: MasterStatus;
  signerName: string;
  signerPosition: string;
  signerNote: string;
  includeSalary: boolean;
};

const emptyDocumentTypeForm: DocumentTypeFormState = {
  code: "",
  nameTh: "",
  nameEn: "",
  description: "",
  category: "GENERAL",
  requiresApproval: true,
  approvalLevels: "2",
  allowEmployeeRequest: true,
  status: "ACTIVE",
};

function readConfigText(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

function buildTemplateConfig(form: DocumentTemplateFormState) {
  return {
    signerName: form.signerName.trim(),
    signerPosition: form.signerPosition.trim(),
    signerNote: form.signerNote.trim(),
    includeSalary: form.includeSalary,
  };
}

function createDefaultTemplateHtml() {
  return `<h1>{{documentTypeName}}</h1>
<p>เลขที่เอกสาร: {{requestNo}}</p>
<p>บริษัท: {{companyName}}</p>
<p>ชื่อพนักงาน: {{employeeName}}</p>
<p>รหัสพนักงาน: {{employeeCode}}</p>
<p>ตำแหน่ง: {{employeePosition}}</p>
<p>วันที่เริ่มงาน: {{startDate}}</p>
<p>อายุงาน: {{serviceDuration}}</p>
<p>วัตถุประสงค์: {{purpose}}</p>
<p>วันที่ออกเอกสาร: {{issuedDate}}</p>
<p>ลงชื่อ ( {{signerName}} ) {{signerPosition}}</p>`;
}

function hasPermission(userPermissions: string[], permission: string) {
  return userPermissions.includes(permission);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function DocumentTemplatesPanel() {
  const { user } = useAuth();
  const canManage = hasPermission(
    user?.permissions ?? [],
    "DOCUMENT_TEMPLATE_MANAGE",
  );

  const [activeTab, setActiveTab] = useState<SettingsTab>("types");

  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<ActionDialogState | null>(
    null,
  );

  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [typeForm, setTypeForm] = useState<DocumentTypeFormState>(
    emptyDocumentTypeForm,
  );

  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<DocumentTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<DocumentTemplateFormState>({
    documentTypeId: "",
    code: "",
    name: "",
    description: "",
    htmlContent: createDefaultTemplateHtml(),
    status: "ACTIVE",
    signerName: "",
    signerPosition: "",
    signerNote: "",
    includeSalary: false,
  });

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    try {
      const [typesResponse, templatesResponse] = await Promise.all([
        getDocumentTypes({ page: 1, pageSize: 100 }),
        getDocumentTemplates({ page: 1, pageSize: 100 }),
      ]);

      setDocumentTypes(typesResponse.items);
      setTemplates(templatesResponse.items);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดข้อมูลเอกสารไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  /* ---------- ประเภทเอกสาร ---------- */

  function openCreateTypeModal() {
    setEditingType(null);
    setTypeForm(emptyDocumentTypeForm);
    setTypeFormOpen(true);
  }

  function openEditTypeModal(item: DocumentType) {
    setEditingType(item);
    setTypeForm({
      code: item.code,
      nameTh: item.nameTh,
      nameEn: item.nameEn ?? "",
      description: item.description ?? "",
      category: item.category ?? "GENERAL",
      requiresApproval: item.requiresApproval,
      approvalLevels: String(item.approvalLevels ?? 2),
      allowEmployeeRequest: item.allowEmployeeRequest,
      status: item.status,
    });
    setTypeFormOpen(true);
  }

  async function handleSaveType() {
    if (!typeForm.code.trim()) {
      setErrorMessage("กรุณาระบุรหัสประเภทเอกสาร");
      return;
    }

    if (!typeForm.nameTh.trim()) {
      setErrorMessage("กรุณาระบุชื่อประเภทเอกสาร");
      return;
    }

    const approvalLevels = Number(typeForm.approvalLevels || 2);

    if (approvalLevels < 1 || approvalLevels > 2) {
      setErrorMessage("จำนวนชั้นอนุมัติต้องเป็น 1 หรือ 2 เท่านั้น");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      if (editingType) {
        const payload: UpdateDocumentTypeForm = {
          code: typeForm.code.trim(),
          nameTh: typeForm.nameTh.trim(),
          nameEn: typeForm.nameEn.trim() || null,
          description: typeForm.description.trim() || null,
          category: typeForm.category.trim() || null,
          requiresApproval: typeForm.requiresApproval,
          approvalLevels,
          allowEmployeeRequest: typeForm.allowEmployeeRequest,
          status: typeForm.status,
        };

        await updateDocumentType(editingType.id, payload);
      } else {
        const payload: CreateDocumentTypeForm = {
          code: typeForm.code.trim(),
          nameTh: typeForm.nameTh.trim(),
          nameEn: typeForm.nameEn.trim() || null,
          description: typeForm.description.trim() || null,
          category: typeForm.category.trim() || null,
          requiresApproval: typeForm.requiresApproval,
          approvalLevels,
          allowEmployeeRequest: typeForm.allowEmployeeRequest,
        };

        await createDocumentType(payload);
      }

      setTypeFormOpen(false);
      setEditingType(null);
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "บันทึกประเภทเอกสารไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteType(item: DocumentType) {
    const usedByTemplates = templates.filter(
      (template) => template.documentTypeId === item.id,
    ).length;

    setConfirmAction({
      title: "ปิดใช้งานประเภทเอกสาร",
      description:
        usedByTemplates > 0
          ? `ประเภทนี้ถูกใช้โดย ${usedByTemplates} Template — ปิดใช้งานแล้วจะยื่นคำขอประเภทนี้ใหม่ไม่ได้ ยืนยันหรือไม่`
          : `ยืนยันปิดใช้งานประเภทเอกสาร "${item.nameTh}" หรือไม่`,
      confirmLabel: "ปิดใช้งาน",
      tone: "red",
      onConfirm: async () => {
        setSaving(true);
        setErrorMessage("");

        try {
          await deleteDocumentType(item.id);
          await loadData();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "ปิดใช้งานประเภทเอกสารไม่สำเร็จ";
          setErrorMessage(message);
          throw new Error(message);
        } finally {
          setSaving(false);
        }
      },
    });
  }

  /* ---------- Template ---------- */

  function openCreateTemplateModal() {
    setEditingTemplate(null);
    setTemplateForm({
      documentTypeId: documentTypes[0]?.id ?? "",
      code: "",
      name: "",
      description: "",
      htmlContent: createDefaultTemplateHtml(),
      status: "ACTIVE",
      signerName: "",
      signerPosition: "",
      signerNote: "",
      includeSalary: false,
    });
    setTemplateFormOpen(true);
  }

  function openEditTemplateModal(item: DocumentTemplate) {
    const config = item.config ?? {};

    setEditingTemplate(item);
    setTemplateForm({
      documentTypeId: item.documentTypeId ?? "",
      code: item.code,
      name: item.name,
      description: item.description ?? "",
      htmlContent: item.htmlContent || createDefaultTemplateHtml(),
      status: item.status,
      signerName: readConfigText(config, "signerName"),
      signerPosition: readConfigText(config, "signerPosition"),
      signerNote: readConfigText(config, "signerNote"),
      includeSalary: config.includeSalary === true,
    });
    setTemplateFormOpen(true);
  }

  async function handleSaveTemplate() {
    if (!templateForm.code.trim()) {
      setErrorMessage("กรุณาระบุรหัส Template");
      return;
    }

    if (!templateForm.name.trim()) {
      setErrorMessage("กรุณาระบุชื่อ Template");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const basePayload = {
        documentTypeId: templateForm.documentTypeId || null,
        code: templateForm.code.trim(),
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || null,
        htmlContent: templateForm.htmlContent.trim() || null,
        status: templateForm.status,
        config: buildTemplateConfig(templateForm),
      };

      if (editingTemplate) {
        await updateDocumentTemplate(
          editingTemplate.id,
          basePayload as UpdateDocumentTemplateForm,
        );
      } else {
        await createDocumentTemplate(basePayload as CreateDocumentTemplateForm);
      }

      setTemplateFormOpen(false);
      setEditingTemplate(null);
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "บันทึก Template เอกสารไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteTemplate(item: DocumentTemplate) {
    setConfirmAction({
      title: "ปิดใช้งาน Template เอกสาร",
      description: `ยืนยันปิดใช้งาน Template "${item.name}" หรือไม่`,
      confirmLabel: "ปิดใช้งาน",
      tone: "red",
      onConfirm: async () => {
        setSaving(true);
        setErrorMessage("");

        try {
          await deleteDocumentTemplate(item.id);
          await loadData();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "ปิดใช้งาน Template ไม่สำเร็จ";
          setErrorMessage(message);
          throw new Error(message);
        } finally {
          setSaving(false);
        }
      },
    });
  }

  const typesWithoutTemplate = documentTypes.filter(
    (type) =>
      type.status === "ACTIVE" &&
      !templates.some(
        (template) =>
          template.documentTypeId === type.id && template.status === "ACTIVE",
      ),
  );

  return (
    <>
      {/* ตัวเลขสรุป + แท็บย่อย — หัวเรื่องอยู่ที่หน้าหลักแล้ว */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="grid grid-cols-[repeat(3,minmax(11rem,max-content))] divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <StatTile
            label="ประเภทเอกสาร"
            value={documentTypes.length.toLocaleString("th-TH")}
            helper="เอกสารที่บริษัทออกได้"
          />
          <StatTile
            label="Template"
            value={templates.length.toLocaleString("th-TH")}
            helper="หน้าตาเอกสารที่พิมพ์ออก"
          />
          <StatTile
            label="ยังไม่มี Template"
            value={typesWithoutTemplate.length.toLocaleString("th-TH")}
            tone={typesWithoutTemplate.length > 0 ? "warning" : "positive"}
            helper="ประเภทที่ยังสร้าง PDF ไม่ได้"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => void loadData()}
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
          >
            รีเฟรช
          </Button>

          {canManage ? (
            <Button
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={
                activeTab === "types"
                  ? openCreateTypeModal
                  : openCreateTemplateModal
              }
            >
              {activeTab === "types" ? "เพิ่มประเภทเอกสาร" : "เพิ่ม Template"}
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs
        items={[
          {
            key: "types" as const,
            label: "ประเภทเอกสาร",
            count: documentTypes.length,
          },
          {
            key: "templates" as const,
            label: "Template",
            count: templates.length,
          },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

        {typesWithoutTemplate.length > 0 ? (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900 max-[1536px]:px-4">
            <span className="font-bold">
              ประเภทเอกสารที่ยังไม่มี Template ใช้งาน:
            </span>{" "}
            {typesWithoutTemplate.map((type) => type.nameTh).join(", ")} —
            คำขอประเภทนี้จะสร้าง PDF ไม่ได้จนกว่าจะสร้าง Template
          </div>
        ) : null}

        {errorMessage ? (
          <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 max-[1536px]:px-4 max-[1536px]:py-2.5 max-[1536px]:text-xs">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center bg-white px-5 py-14 text-sm text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-brand-500" />
            กำลังโหลดข้อมูล...
          </div>
        ) : activeTab === "types" ? (
          <TypesTable
            documentTypes={documentTypes}
            templates={templates}
            canManage={canManage}
            onEdit={openEditTypeModal}
            onDelete={handleDeleteType}
          />
        ) : (
          <TemplatesTable
            templates={templates}
            canManage={canManage}
            onEdit={openEditTemplateModal}
            onDelete={handleDeleteTemplate}
          />
        )}

      {typeFormOpen ? (
        <Modal
          title={editingType ? "แก้ไขประเภทเอกสาร" : "สร้างประเภทเอกสาร"}
          description="กำหนดรหัส ชื่อ และเงื่อนไขการอนุมัติของเอกสารประเภทนี้"
          onClose={() => setTypeFormOpen(false)}
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="รหัสประเภทเอกสาร">
                <input
                  value={typeForm.code}
                  onChange={(event) =>
                    setTypeForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  placeholder="เช่น WORK_CERTIFICATE"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="หมวดหมู่">
                <input
                  value={typeForm.category}
                  onChange={(event) =>
                    setTypeForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="CERTIFICATE / GENERAL"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="ชื่อภาษาไทย">
                <input
                  value={typeForm.nameTh}
                  onChange={(event) =>
                    setTypeForm((current) => ({
                      ...current,
                      nameTh: event.target.value,
                    }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="ชื่อภาษาอังกฤษ">
                <input
                  value={typeForm.nameEn}
                  onChange={(event) =>
                    setTypeForm((current) => ({
                      ...current,
                      nameEn: event.target.value,
                    }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="จำนวนชั้นอนุมัติ">
                <select
                  value={typeForm.approvalLevels}
                  onChange={(event) =>
                    setTypeForm((current) => ({
                      ...current,
                      approvalLevels: event.target.value,
                    }))
                  }
                  className={SELECT_CLASS}
                >
                  <option value="1">1 ชั้น</option>
                  <option value="2">2 ชั้น</option>
                </select>
              </Field>

              <Field label="สถานะ">
                <select
                  value={typeForm.status}
                  onChange={(event) =>
                    setTypeForm((current) => ({
                      ...current,
                      status: event.target.value as MasterStatus,
                    }))
                  }
                  className={SELECT_CLASS}
                >
                  <option value="ACTIVE">เปิดใช้งาน</option>
                  <option value="INACTIVE">ปิดใช้งาน</option>
                </select>
              </Field>
            </div>

            <Field label="คำอธิบาย">
              <textarea
                value={typeForm.description}
                onChange={(event) =>
                  setTypeForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={4}
                className={TEXTAREA_CLASS}
              />
            </Field>

            <div className="grid gap-3 md:grid-cols-2">
              <CheckboxCard
                checked={typeForm.requiresApproval}
                onChange={(checked) =>
                  setTypeForm((current) => ({
                    ...current,
                    requiresApproval: checked,
                  }))
                }
                label="ต้องผ่านการอนุมัติ"
                helper="ถ้าปิด ระบบจะออกเอกสารทันทีที่ยื่น"
              />

              <CheckboxCard
                checked={typeForm.allowEmployeeRequest}
                onChange={(checked) =>
                  setTypeForm((current) => ({
                    ...current,
                    allowEmployeeRequest: checked,
                  }))
                }
                label="ให้พนักงานยื่นเองได้"
                helper="แสดงในเมนู ESS ของพนักงาน"
              />
            </div>

            <ModalActions>
              <button
                type="button"
                onClick={() => setTypeFormOpen(false)}
                className={GHOST_BUTTON}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveType}
                className={PRIMARY_BUTTON}
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      {templateFormOpen ? (
        <Modal
          title={
            editingTemplate ? "แก้ไข Template เอกสาร" : "สร้าง Template เอกสาร"
          }
          description="HTML Template ที่ใช้ Render และแปลงเป็น PDF"
          onClose={() => setTemplateFormOpen(false)}
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="ประเภทเอกสาร">
                <select
                  value={templateForm.documentTypeId}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      documentTypeId: event.target.value,
                    }))
                  }
                  className={SELECT_CLASS}
                >
                  <option value="">ไม่ระบุประเภทเอกสาร</option>
                  {documentTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.nameTh}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="รหัส Template">
                <input
                  value={templateForm.code}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  placeholder="เช่น WORK_CERTIFICATE_DEFAULT"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="ชื่อ Template">
                <input
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="สถานะ">
                <select
                  value={templateForm.status}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      status: event.target.value as MasterStatus,
                    }))
                  }
                  className={SELECT_CLASS}
                >
                  <option value="ACTIVE">เปิดใช้งาน</option>
                  <option value="INACTIVE">ปิดใช้งาน</option>
                </select>
              </Field>
            </div>

            <Field label="คำอธิบาย">
              <textarea
                value={templateForm.description}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                className={TEXTAREA_CLASS}
              />
            </Field>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm font-bold text-slate-900">
                ผู้มีอำนาจลงนาม
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                ใช้เติม {"{{signerName}}"} / {"{{signerPosition}}"} ในเอกสาร
                เอกสารรับรองที่ไม่มีชื่อผู้ลงนามมักถูกปฏิเสธจากธนาคารและสถานทูต
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="ชื่อผู้ลงนาม">
                  <input
                    value={templateForm.signerName}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        signerName: event.target.value,
                      }))
                    }
                    placeholder="เช่น นายสมชาย ใจดี"
                    className={INPUT_CLASS}
                  />
                </Field>

                <Field label="ตำแหน่งผู้ลงนาม">
                  <input
                    value={templateForm.signerPosition}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        signerPosition: event.target.value,
                      }))
                    }
                    placeholder="เช่น ผู้จัดการฝ่ายทรัพยากรบุคคล"
                    className={INPUT_CLASS}
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="หมายเหตุใต้ลายเซ็น">
                    <input
                      value={templateForm.signerNote}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          signerNote: event.target.value,
                        }))
                      }
                      placeholder="เช่น เอกสารฉบับนี้มีผลเมื่อประทับตราบริษัท"
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-3">
                <CheckboxCard
                  checked={templateForm.includeSalary}
                  onChange={(checked) =>
                    setTemplateForm((current) => ({
                      ...current,
                      includeSalary: checked,
                    }))
                  }
                  label="อนุญาตให้ Template นี้แสดงเงินเดือน"
                  helper="เปิดเฉพาะหนังสือรับรองเงินเดือน — ปิดไว้ token เงินเดือนจะเป็นค่าว่าง"
                />
              </div>
            </div>

            <Field label="HTML Template">
              <textarea
                value={templateForm.htmlContent}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    htmlContent: event.target.value,
                  }))
                }
                rows={14}
                className="w-full rounded-lg border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-50 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </Field>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-900">
              <div className="font-bold">Token ที่ใช้ได้</div>

              <TokenGroup
                title="เอกสาร"
                tokens={[
                  "requestNo",
                  "issuedDate",
                  "purpose",
                  "documentTypeName",
                  "requestData.language",
                ]}
              />
              <TokenGroup
                title="บริษัท"
                tokens={[
                  "companyName",
                  "companyNameEn",
                  "companyAddress",
                  "companyTaxId",
                  "companyPhone",
                  "companyLogoHtml",
                ]}
              />
              <TokenGroup
                title="พนักงาน"
                tokens={[
                  "employeeName",
                  "employeeCode",
                  "employeePosition",
                  "employeeDepartment",
                  "employeeBranch",
                  "startDate",
                  "serviceDuration",
                  "serviceYears",
                  "employeeNationalId",
                ]}
              />
              <TokenGroup
                title="เงินเดือน (ต้องเปิดสวิตช์ด้านบน)"
                tokens={[
                  "monthlySalary",
                  "monthlySalaryText",
                  "totalAllowance",
                  "totalMonthlyIncome",
                  "totalMonthlyIncomeText",
                  "salaryEffectiveDate",
                ]}
              />
              <TokenGroup
                title="ผู้ลงนาม"
                tokens={["signerName", "signerPosition", "signerNote"]}
              />
            </div>

            <ModalActions>
              <button
                type="button"
                onClick={() => setTemplateFormOpen(false)}
                className={GHOST_BUTTON}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveTemplate}
                className={PRIMARY_BUTTON}
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </ModalActions>
          </div>
        </Modal>
      ) : null}

      <ActionDialog
        state={confirmAction}
        loading={saving}
        onClose={() => setConfirmAction(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

function TypesTable({
  documentTypes,
  templates,
  canManage,
  onEdit,
  onDelete,
}: {
  documentTypes: DocumentType[];
  templates: DocumentTemplate[];
  canManage: boolean;
  onEdit: (item: DocumentType) => void;
  onDelete: (item: DocumentType) => void;
}) {
  return (
    <div className="overflow-x-auto bg-white">
      <table className="min-w-[900px] w-full divide-y divide-slate-100 text-sm max-[1536px]:min-w-[820px] max-[1536px]:text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH_CLASS}>รหัส / ชื่อประเภท</th>
            <th className={TH_CLASS}>หมวดหมู่</th>
            <th className={TH_CLASS}>การอนุมัติ</th>
            <th className={TH_CLASS}>พนักงานยื่นเอง</th>
            <th className={TH_CLASS}>Template</th>
            <th className={TH_CLASS}>สถานะ</th>
            <th className={cn(TH_CLASS, "text-right")}>จัดการ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {documentTypes.length === 0 ? (
            <EmptyRow colSpan={7} message="ยังไม่มีประเภทเอกสารในระบบ" />
          ) : (
            documentTypes.map((item) => {
              const templateCount = templates.filter(
                (template) =>
                  template.documentTypeId === item.id &&
                  template.status === "ACTIVE",
              ).length;

              return (
                <tr key={item.id} className="transition hover:bg-brand-50/60">
                  <td className={TD_CLASS}>
                    <p className="font-semibold text-slate-900">{item.nameTh}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.code}
                      {item.description ? ` · ${item.description}` : ""}
                    </p>
                  </td>
                  <td className={TD_CLASS}>
                    <Pill>{item.category || "GENERAL"}</Pill>
                  </td>
                  <td className={TD_CLASS}>
                    {item.requiresApproval
                      ? `ต้องอนุมัติ ${item.approvalLevels} ชั้น`
                      : "ไม่ต้องอนุมัติ"}
                  </td>
                  <td className={TD_CLASS}>
                    {item.allowEmployeeRequest ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        ยื่นเองได้
                      </span>
                    ) : (
                      <span className="text-slate-400">HR เท่านั้น</span>
                    )}
                  </td>
                  <td className={TD_CLASS}>
                    {templateCount > 0 ? (
                      <Pill>{templateCount} ฉบับ</Pill>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200 max-[1536px]:text-[11px]">
                        ยังไม่มี
                      </span>
                    )}
                  </td>
                  <td className={TD_CLASS}>
                    <MasterStatusBadge status={item.status} />
                  </td>
                  <td className={cn(TD_CLASS, "text-right")}>
                    {canManage ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <IconButton title="แก้ไข" onClick={() => onEdit(item)}>
                          <Edit3 className="h-4 w-4" />
                        </IconButton>

                        {item.status === "ACTIVE" ? (
                          <IconButton
                            title="ปิดใช้งาน"
                            tone="rose"
                            onClick={() => onDelete(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">ดูอย่างเดียว</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function TemplatesTable({
  templates,
  canManage,
  onEdit,
  onDelete,
}: {
  templates: DocumentTemplate[];
  canManage: boolean;
  onEdit: (item: DocumentTemplate) => void;
  onDelete: (item: DocumentTemplate) => void;
}) {
  return (
    <div className="overflow-x-auto bg-white">
      <table className="min-w-[900px] w-full divide-y divide-slate-100 text-sm max-[1536px]:min-w-[820px] max-[1536px]:text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH_CLASS}>รหัส / ชื่อ Template</th>
            <th className={TH_CLASS}>ประเภทเอกสาร</th>
            <th className={TH_CLASS}>ผู้ลงนาม</th>
            <th className={TH_CLASS}>เงินเดือน</th>
            <th className={TH_CLASS}>เวอร์ชัน</th>
            <th className={TH_CLASS}>สถานะ</th>
            <th className={cn(TH_CLASS, "text-right")}>จัดการ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {templates.length === 0 ? (
            <EmptyRow colSpan={7} message="ยังไม่มี Template เอกสารในระบบ" />
          ) : (
            templates.map((item) => {
              const config = item.config ?? {};
              const signerName = readConfigText(config, "signerName");

              return (
                <tr key={item.id} className="transition hover:bg-brand-50/60">
                  <td className={TD_CLASS}>
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.code}
                      {item.description ? ` · ${item.description}` : ""}
                    </p>
                  </td>
                  <td className={TD_CLASS}>
                    {item.documentType?.nameTh || (
                      <span className="text-slate-400">ไม่ระบุประเภท</span>
                    )}
                  </td>
                  <td className={TD_CLASS}>
                    {signerName ? (
                      <span className="text-slate-700">{signerName}</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200 max-[1536px]:text-[11px]">
                        ยังไม่ระบุ
                      </span>
                    )}
                  </td>
                  <td className={TD_CLASS}>
                    {config.includeSalary === true ? (
                      <Pill>แสดงได้</Pill>
                    ) : (
                      <span className="text-slate-400">ไม่แสดง</span>
                    )}
                  </td>
                  <td className={TD_CLASS}>
                    <Pill>v{item.version}</Pill>
                  </td>
                  <td className={TD_CLASS}>
                    <MasterStatusBadge status={item.status} />
                  </td>
                  <td className={cn(TD_CLASS, "text-right")}>
                    {canManage ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <IconButton title="แก้ไข" onClick={() => onEdit(item)}>
                          <Edit3 className="h-4 w-4" />
                        </IconButton>

                        {item.status === "ACTIVE" ? (
                          <IconButton
                            title="ปิดใช้งาน"
                            tone="rose"
                            onClick={() => onDelete(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">ดูอย่างเดียว</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-brand-50 text-brand-500 ring-1 ring-brand-100">
            <FileStack className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-slate-600">{message}</span>
        </div>
      </td>
    </tr>
  );
}

function MasterStatusBadge({ status }: { status: MasterStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 max-[1536px]:text-[11px]",
        status === "ACTIVE"
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-slate-100 text-slate-500 ring-slate-200",
      )}
    >
      {status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
    </span>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 max-[1536px]:text-[11px]">
      {children}
    </span>
  );
}

function TokenGroup({ title, tokens }: { title: string; tokens: string[] }) {
  return (
    <div className="mt-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-brand-700/80">
        {title}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {tokens.map((token) => (
          <code
            key={token}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-brand-700"
          >
            {`{{${token}}}`}
          </code>
        ))}
      </div>
    </div>
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
  tone?: "slate" | "rose";
}) {
  const toneClass = {
    slate:
      "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
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
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_26px_80px_rgba(15,23,42,0.22)] ring-1 ring-white max-[1536px]:rounded-[1.75rem]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 max-[1536px]:px-5 max-[1536px]:py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 max-[1536px]:text-sm">
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
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white/90 text-slate-500 transition hover:bg-brand-50 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 max-[1536px]:p-5">{children}</div>
      </div>
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

function CheckboxCard({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  helper: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition",
        checked
          ? "border-slate-300 bg-slate-50"
          : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-sky-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">
          {label}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
          {helper}
        </span>
      </span>
    </label>
  );
}

function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
      {children}
    </div>
  );
}
