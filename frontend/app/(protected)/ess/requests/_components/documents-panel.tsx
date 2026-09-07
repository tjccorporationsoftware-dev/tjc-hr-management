"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Download,
  Loader2,
  Paperclip,
  Pencil,
  PlusCircle,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  Badge,
  Button,
  DataTable,
  Field,
  FieldGrid,
  Modal,
  Notice,
  RowMenu,
  SearchInput,
  Section,
  Select,
  StatTile,
  TextInput,
  Textarea,
  joinClassName,
  type Column,
  type RowMenuItem,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cancelEssDocumentRequest,
  createEssDocumentRequest,
  deleteEssDocumentFile,
  deleteEssDocumentRequest,
  downloadEssDocumentFile,
  getEssDocumentRequests,
  getEssDocumentTypes,
  getEssMe,
  submitEssDocumentRequest,
  updateEssDocumentRequest,
  uploadEssDocumentFile,
} from "@/lib/api";
import { formatThaiDateTime } from "@/lib/date-format";
import { ESS_REQUEST_STATUS } from "@/lib/status-labels";
import type {
  DocumentFile,
  DocumentRequest,
  DocumentRequestListSummary,
  DocumentRequestStatus,
  DocumentType,
} from "@/types/document-workflow";
import type { EssMeResponse } from "@/types/ess";

/**
 * ขอเอกสาร (พนักงาน)
 * ------------------
 * ยื่นขอหนังสือรับรองจาก HR ติดตามสถานะ แนบเอกสารประกอบ
 * และดาวน์โหลดไฟล์ที่ HR ออกให้ — แสดงเฉพาะคำขอที่ตัวเองเป็นผู้ยื่น
 */

type FormState = {
  documentTypeId: string;
  title: string;
  purpose: string;
  note: string;
};

type ModalMode = "create" | "edit";

const LABEL_CLASS =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500";

const emptySummary: DocumentRequestListSummary = {
  total: 0,
  draft: 0,
  submitted: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
};

const initialForm: FormState = {
  documentTypeId: "",
  title: "",
  purpose: "",
  note: "",
};

const statusOptions: Array<{
  value: "" | DocumentRequestStatus;
  label: string;
}> = [
  { value: "", label: "ทุกสถานะ" },
  { value: "DRAFT", label: "ร่าง" },
  { value: "SUBMITTED", label: "รออนุมัติ" },
  { value: "APPROVED", label: "อนุมัติแล้ว" },
  { value: "REJECTED", label: "ไม่อนุมัติ" },
  { value: "CANCELLED", label: "ยกเลิก" },
];

/** ไฟล์ที่ผูกกับคำขอมีสามชนิด เรียงตามความสำคัญที่พนักงานอยากได้ */
const FILE_TYPE_ORDER = ["SIGNED_DOCUMENT", "GENERATED_PDF", "ATTACHMENT"];

const FILE_TYPE_LABEL: Record<string, string> = {
  SIGNED_DOCUMENT: "ฉบับลงนาม",
  GENERATED_PDF: "PDF จากระบบ",
  ATTACHMENT: "เอกสารประกอบ",
};

function fileSizeText(value?: number | null) {
  if (!value || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}

function canEditRequest(item: DocumentRequest) {
  return item.status !== "APPROVED" && item.status !== "CANCELLED";
}

function canDeleteRequest(item: DocumentRequest) {
  return item.status !== "APPROVED";
}

function canAttachFile(item: DocumentRequest) {
  return item.status === "DRAFT" || item.status === "SUBMITTED";
}

function canCancelRequest(item: DocumentRequest) {
  return item.status === "DRAFT" || item.status === "SUBMITTED";
}

function sortFiles(files: DocumentFile[]) {
  return [...files].sort(
    (a, b) =>
      FILE_TYPE_ORDER.indexOf(String(a.fileType)) -
      FILE_TYPE_ORDER.indexOf(String(b.fileType)),
  );
}

export function DocumentRequestPanel() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  const [me, setMe] = useState<EssMeResponse | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [summary, setSummary] =
    useState<DocumentRequestListSummary>(emptySummary);

  const [form, setForm] = useState<FormState>(initialForm);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | DocumentRequestStatus>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingItem, setEditingItem] = useState<DocumentRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attachTarget, setAttachTarget] = useState<DocumentRequest | null>(
    null,
  );
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [filesTarget, setFilesTarget] = useState<DocumentRequest | null>(null);

  const employeeId = me?.employee?.id;

  const selectedType = useMemo(
    () => documentTypes.find((item) => item.id === form.documentTypeId) ?? null,
    [documentTypes, form.documentTypeId],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const meResponse = await getEssMe();
      setMe(meResponse);

      const [typesResponse, requestsResponse] = await Promise.all([
        getEssDocumentTypes({ page: 1, pageSize: 100, status: "ACTIVE" }),
        getEssDocumentRequests({
          page: 1,
          pageSize: 50,
          search: search.trim() || undefined,
          status: status || undefined,
        }),
      ]);

      const employeeTypes = typesResponse.items.filter(
        (item) => item.allowEmployeeRequest && item.status === "ACTIVE",
      );

      setDocumentTypes(employeeTypes);
      setRequests(requestsResponse.items ?? []);
      setSummary(requestsResponse.summary ?? emptySummary);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "โหลดคำขอเอกสารไม่สำเร็จ";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  // ค้นหา/กรองแบบหน่วงเวลา ให้พฤติกรรมตรงกับหน้าอื่นในระบบ
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleTypeChange(value: string) {
    const type = documentTypes.find((item) => item.id === value);

    setForm((current) => ({
      ...current,
      documentTypeId: value,
      title: current.title || type?.nameTh || "",
    }));
  }

  function resetForm() {
    setForm(initialForm);
    setEditingItem(null);
    setModalMode("create");
    setAttachFiles([]);
  }

  function openCreateModal() {
    resetForm();
    setCreateOpen(true);
  }

  function openEditModal(item: DocumentRequest) {
    if (!canEditRequest(item)) {
      toast.error("รายการนี้ไม่สามารถแก้ไขได้");
      return;
    }

    setModalMode("edit");
    setEditingItem(item);
    setForm({
      documentTypeId: item.documentTypeId,
      title: item.title ?? "",
      purpose: item.purpose ?? "",
      note: item.note ?? "",
    });
    setAttachFiles([]);
    setCreateOpen(true);
  }

  /** อัปโหลดทีละไฟล์ตามลำดับ เพราะ endpoint รับครั้งละไฟล์ */
  async function uploadPendingAttachments(documentRequestId: string) {
    for (const file of attachFiles) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);

      await uploadEssDocumentFile(documentRequestId, formData);
    }
  }

  async function saveDocumentRequest(shouldSubmit: boolean) {
    if (!employeeId) {
      toast.error("ไม่พบข้อมูลพนักงานของผู้ใช้งานปัจจุบัน");
      return;
    }

    if (!form.documentTypeId) {
      toast.error("กรุณาเลือกประเภทเอกสาร");
      return;
    }

    if (!form.title.trim()) {
      toast.error("กรุณาระบุหัวข้อคำขอ");
      return;
    }

    setSubmitting(true);

    try {
      if (modalMode === "edit" && editingItem) {
        await updateEssDocumentRequest(editingItem.id, {
          documentTypeId: form.documentTypeId,
          title: form.title.trim(),
          purpose: form.purpose.trim() || null,
          note: form.note.trim() || null,
          requestData: {
            ...(editingItem.requestData ?? {}),
            source: "ESS",
            employeeCode: me?.employee.employeeCode,
          },
        });

        await uploadPendingAttachments(editingItem.id);

        if (shouldSubmit && editingItem.status === "DRAFT") {
          await submitEssDocumentRequest(editingItem.id);
        }

        toast.success(
          shouldSubmit
            ? "ส่งคำขอเอกสารเรียบร้อยแล้ว"
            : "บันทึกคำขอเอกสารเรียบร้อยแล้ว",
        );
      } else {
        const created = await createEssDocumentRequest({
          documentTypeId: form.documentTypeId,
          title: form.title.trim(),
          purpose: form.purpose.trim() || null,
          note: form.note.trim() || null,
          requestData: {
            source: "ESS",
            employeeCode: me?.employee.employeeCode,
          },
          submit: shouldSubmit,
        });

        await uploadPendingAttachments(created.id);

        toast.success(
          shouldSubmit
            ? "ส่งคำขอเอกสารเรียบร้อยแล้ว"
            : "บันทึกร่างคำขอเอกสารเรียบร้อยแล้ว",
        );
      }

      resetForm();
      setCreateOpen(false);
      await loadData();
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "บันทึกคำขอเอกสารไม่สำเร็จ",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveDocumentRequest(true);
  }

  function openDeleteDialog(item: DocumentRequest) {
    if (!canDeleteRequest(item)) {
      toast.error("รายการที่อนุมัติแล้วไม่สามารถลบได้");
      return;
    }

    setDialog({
      title: "ลบคำขอเอกสาร",
      description: `ต้องการลบคำขอ ${item.requestNo} หรือไม่`,
      confirmLabel: "ลบรายการ",
      cancelLabel: "กลับไป",
      tone: "red",
      onConfirm: async () => {
        await deleteEssDocumentRequest(item.id);
        toast.success("ลบคำขอเอกสารแล้ว");
        await loadData();
      },
    });
  }

  function openCancelDialog(item: DocumentRequest) {
    if (!canCancelRequest(item)) {
      toast.error("รายการนี้ไม่สามารถยกเลิกได้");
      return;
    }

    setDialog({
      title: "ยกเลิกคำขอเอกสาร",
      description: `ต้องการยกเลิกคำขอ ${item.requestNo} หรือไม่`,
      confirmLabel: "ยืนยันยกเลิก",
      cancelLabel: "กลับไป",
      tone: "red",
      reasonLabel: "เหตุผลการยกเลิก",
      reasonPlaceholder:
        "ระบุเหตุผล เช่น กรอกข้อมูลผิด / ไม่ต้องการใช้เอกสารแล้ว",
      requireReason: true,
      onConfirm: async (reason) => {
        await cancelEssDocumentRequest(item.id, { reason });
        toast.success("ยกเลิกคำขอเอกสารแล้ว");
        await loadData();
      },
    });
  }

  function openAttachModal(item: DocumentRequest) {
    setAttachTarget(item);
    setAttachFiles([]);
  }

  async function handleUploadAttachment() {
    if (!attachTarget) return;

    if (attachFiles.length === 0) {
      toast.error("กรุณาเลือกไฟล์ที่ต้องการแนบ");
      return;
    }

    setSubmitting(true);

    try {
      await uploadPendingAttachments(attachTarget.id);

      toast.success(
        `แนบไฟล์เรียบร้อย ${attachFiles.length.toLocaleString("th-TH")} ไฟล์`,
      );
      setAttachTarget(null);
      setAttachFiles([]);
      await loadData();
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error ? uploadError.message : "แนบไฟล์ไม่สำเร็จ",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function addAttachFiles(list: FileList | null) {
    if (!list || list.length === 0) return;

    const incoming = Array.from(list);

    setAttachFiles((current) => {
      const merged = [...current];

      for (const file of incoming) {
        const duplicated = merged.some(
          (item) => item.name === file.name && item.size === file.size,
        );

        if (!duplicated) merged.push(file);
      }

      return merged;
    });
  }

  function removeAttachFile(index: number) {
    setAttachFiles((current) => current.filter((_, i) => i !== index));
  }

  function openDeleteFileDialog(item: DocumentRequest, file: DocumentFile) {
    setDialog({
      title: "ลบไฟล์แนบ",
      description: `ต้องการลบไฟล์ "${file.title}" ออกจากคำขอ ${item.requestNo} หรือไม่`,
      confirmLabel: "ลบไฟล์",
      cancelLabel: "กลับไป",
      tone: "red",
      onConfirm: async () => {
        await deleteEssDocumentFile(item.id, file.id);
        toast.success("ลบไฟล์แนบแล้ว");
        setFilesTarget(null);
        await loadData();
      },
    });
  }

  async function downloadFile(
    request: DocumentRequest,
    fileId: string,
    fileName: string,
  ) {
    setDownloadingId(fileId);

    try {
      const blob = await downloadEssDocumentFile(request.id, fileId);
      saveBlob(blob, fileName || `${request.requestNo}.pdf`);
      toast.success("ดาวน์โหลดไฟล์เรียบร้อยแล้ว");
    } catch (downloadError) {
      toast.error(
        downloadError instanceof Error
          ? downloadError.message
          : "ดาวน์โหลดไฟล์ไม่สำเร็จ",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  const isUnlinkedAccount = Boolean(
    error?.includes("ยังไม่ได้ผูกกับข้อมูลพนักงาน"),
  );

  const columns: Array<Column<DocumentRequest>> = [
    {
      key: "request",
      header: "เลขที่ / ชื่อเอกสาร",
      width: "w-[18rem]",
      cell: (item) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-800 3xl:text-[13.5px]">
            {item.documentNo ?? item.requestNo}
          </p>
          <p className="truncate text-[12px] text-slate-400">
            {item.title}
            {item.documentNo ? ` · คำขอ ${item.requestNo}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: "ประเภท",
      width: "w-[12rem]",
      cell: (item) => (
        <span className="text-[13px] text-slate-600">
          {item.documentType?.nameTh ?? "-"}
        </span>
      ),
    },
    {
      key: "purpose",
      header: "วัตถุประสงค์",
      cell: (item) => (
        <p className="truncate text-[13px] text-slate-600">
          {item.purpose || item.note || "-"}
        </p>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-[12rem]",
      cell: (item) => (
        <div className="min-w-0">
          <StatusBadge vocabulary={ESS_REQUEST_STATUS} status={item.status} />
          <p className="mt-0.5 truncate text-[11.5px] text-slate-400">
            {formatThaiDateTime(item.submittedAt ?? item.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: "files",
      header: "ไฟล์",
      width: "w-[11rem]",
      hideBelow: "lg",
      cell: (item) => {
        const files = sortFiles(item.files ?? []);
        if (files.length === 0) {
          return (
            <span className="text-[13px] text-slate-300">ยังไม่มีไฟล์</span>
          );
        }

        const [primary] = files;

        return (
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void downloadFile(
                  item,
                  primary.id,
                  primary.fileName || primary.title,
                );
              }}
              disabled={downloadingId === primary.id}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-60"
            >
              {downloadingId === primary.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {FILE_TYPE_LABEL[String(primary.fileType)] ?? "ไฟล์"}
            </button>
            {files.length > 1 ? (
              <Badge tone="neutral">+{files.length - 1}</Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      width: "w-[6rem]",
      cell: (item) => {
        const files = item.files ?? [];

        const menuItems: RowMenuItem[] = [
          {
            label: "ดูไฟล์ทั้งหมด",
            icon: <Download className="h-3.5 w-3.5" />,
            onSelect: () => setFilesTarget(item),
            disabled: files.length === 0,
          },
          {
            label: "แก้ไขคำขอ",
            icon: <Pencil className="h-3.5 w-3.5" />,
            onSelect: () => openEditModal(item),
            disabled: !canEditRequest(item),
            separated: true,
          },
          {
            label: "แนบเอกสารประกอบ",
            icon: <Paperclip className="h-3.5 w-3.5" />,
            onSelect: () => openAttachModal(item),
            disabled: !canAttachFile(item),
          },
          {
            label: "ยกเลิกคำขอ",
            icon: <XCircle className="h-3.5 w-3.5" />,
            onSelect: () => openCancelDialog(item),
            disabled: !canCancelRequest(item),
          },
          {
            label: "ลบคำขอ",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            tone: "danger",
            onSelect: () => openDeleteDialog(item),
            disabled: !canDeleteRequest(item),
          },
        ];

        return <RowMenu items={menuItems} />;
      },
    },
  ];

  return (
    <>
      {/* ---------------- สรุปคำขอเอกสาร ---------------- */}
      <section className="border-b border-slate-200 px-5 py-4 3xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL_CLASS}>คำขอเอกสารของฉัน</p>
            <p className="mt-1 text-[13px] text-slate-500">
              ยื่นขอหนังสือรับรองจาก HR ติดตามสถานะ
              และดาวน์โหลดไฟล์เมื่ออนุมัติแล้ว
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadData()}
              disabled={loading}
              icon={
                <RefreshCw
                  className={joinClassName(
                    "h-3.5 w-3.5",
                    loading && "animate-spin",
                  )}
                />
              }
            >
              โหลดข้อมูลใหม่
            </Button>
            <Button
              variant="primary"
              onClick={openCreateModal}
              disabled={documentTypes.length === 0}
              icon={<PlusCircle className="h-3.5 w-3.5" />}
            >
              ขอเอกสารใหม่
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-4 sm:divide-y-0">
          <StatTile
            label="คำขอทั้งหมด"
            value={summary.total.toLocaleString("th-TH")}
            helper="ที่คุณเคยยื่น"
          />
          <StatTile
            label="ฉบับร่าง"
            value={summary.draft.toLocaleString("th-TH")}
            helper="ยังไม่ได้ส่งให้ HR"
          />
          <StatTile
            label="รออนุมัติ"
            value={summary.submitted.toLocaleString("th-TH")}
            tone={summary.submitted > 0 ? "warning" : "neutral"}
            helper="ส่งแล้ว รอ HR ดำเนินการ"
          />
          <StatTile
            label="อนุมัติแล้ว"
            value={summary.approved.toLocaleString("th-TH")}
            tone="positive"
            helper="ดาวน์โหลดไฟล์ได้แล้ว"
          />
        </div>

        {documentTypes.length === 0 && !loading && !error ? (
          <div className="mt-3">
            <Notice tone="warning">
              ยังไม่มีประเภทเอกสารที่เปิดให้พนักงานยื่นเอง — กรุณาติดต่อ HR
            </Notice>
          </div>
        ) : null}
      </section>

      {/* ---------------- ตัวกรอง ---------------- */}
      <section className="border-b border-slate-200 px-5 py-3 3xl:px-6">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="สถานะ" className="w-full sm:w-44">
            <Select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "" | DocumentRequestStatus)
              }
            >
              {statusOptions.map((option) => (
                <option key={option.value || "ALL"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ค้นหา" className="w-full sm:w-80">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="เลขคำขอ ชื่อเอกสาร หรือวัตถุประสงค์"
            />
          </Field>

          <p className="ml-auto pb-2 text-[12.5px] text-slate-400">
            แสดง {requests.length.toLocaleString("th-TH")} จาก{" "}
            {summary.total.toLocaleString("th-TH")} รายการ
          </p>
        </div>
      </section>

      {/* ---------------- ประวัติคำขอ ---------------- */}
      <DataTable
        columns={columns}
        rows={requests}
        rowKey={(item) => item.id}
        loading={loading}
        error={
          isUnlinkedAccount
            ? "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงยังขอเอกสารไม่ได้ — ผูกบัญชีกับพนักงานได้ที่หน้า ผู้ใช้และสิทธิ์"
            : error
        }
        onRetry={() => void loadData()}
        onRowClick={(item) =>
          (item.files ?? []).length > 0 ? setFilesTarget(item) : undefined
        }
        emptyTitle="ยังไม่มีคำขอเอกสาร"
        emptyDescription="กด “ขอเอกสารใหม่” เพื่อยื่นขอหนังสือรับรองจาก HR"
        emptyAction={
          documentTypes.length > 0 ? (
            <Button
              variant="primary"
              onClick={openCreateModal}
              icon={<PlusCircle className="h-3.5 w-3.5" />}
            >
              ขอเอกสารใหม่
            </Button>
          ) : undefined
        }
        minWidth="min-w-[62rem]"
      />

      {/* ---------------- ฟอร์มคำขอเอกสาร ---------------- */}
      <Modal
        open={createOpen}
        size="md"
        title={modalMode === "edit" ? "แก้ไขคำขอเอกสาร" : "ขอเอกสารใหม่"}
        description="เลือกประเภทเอกสาร ระบุหัวข้อและวัตถุประสงค์ที่จะนำไปใช้"
        onClose={() => {
          setCreateOpen(false);
          resetForm();
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                resetForm();
              }}
              disabled={submitting}
            >
              ยกเลิก
            </Button>
            <Button
              variant="secondary"
              onClick={() => void saveDocumentRequest(false)}
              disabled={submitting}
            >
              บันทึกเป็นร่าง
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="ess-document-form"
              loading={submitting}
              icon={<Send className="h-3.5 w-3.5" />}
            >
              ส่งคำขอ
            </Button>
          </>
        }
      >
        <form
          id="ess-document-form"
          onSubmit={submitForm}
          className="space-y-4"
        >
          <Section title="ข้อมูลคำขอ">
            <FieldGrid columns={1}>
              <Field
                label="ประเภทเอกสาร"
                required
                hint={selectedType?.description || undefined}
              >
                <Select
                  value={form.documentTypeId}
                  onChange={(event) => handleTypeChange(event.target.value)}
                >
                  <option value="">เลือกประเภทเอกสาร</option>
                  {documentTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameTh}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="หัวข้อคำขอ" required>
                <TextInput
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="เช่น หนังสือรับรองเงินเดือนสำหรับยื่นกู้"
                />
              </Field>

              <Field label="วัตถุประสงค์" hint="ระบุว่าจะนำเอกสารไปใช้ทำอะไร">
                <Textarea
                  rows={2}
                  value={form.purpose}
                  onChange={(event) =>
                    updateForm("purpose", event.target.value)
                  }
                  placeholder="เช่น ยื่นขอสินเชื่อกับธนาคาร"
                />
              </Field>

              <Field label="หมายเหตุถึง HR">
                <Textarea
                  rows={2}
                  value={form.note}
                  onChange={(event) => updateForm("note", event.target.value)}
                  placeholder="ข้อมูลเพิ่มเติม ถ้ามี"
                />
              </Field>
            </FieldGrid>
          </Section>

          <Section
            title="เอกสารประกอบ"
            description="แนบไฟล์ที่ HR ต้องใช้ประกอบการออกเอกสาร (ถ้ามี)"
          >
            <AttachmentPicker
              files={attachFiles}
              onAdd={addAttachFiles}
              onRemove={removeAttachFile}
            />
          </Section>
        </form>
      </Modal>

      {/* ---------------- แนบไฟล์เพิ่มภายหลัง ---------------- */}
      <Modal
        open={Boolean(attachTarget)}
        size="sm"
        title="แนบเอกสารประกอบ"
        description={
          attachTarget
            ? `คำขอ ${attachTarget.requestNo} · ${attachTarget.title}`
            : undefined
        }
        onClose={() => {
          setAttachTarget(null);
          setAttachFiles([]);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setAttachTarget(null);
                setAttachFiles([]);
              }}
              disabled={submitting}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleUploadAttachment()}
              loading={submitting}
              icon={<Paperclip className="h-3.5 w-3.5" />}
            >
              แนบไฟล์
            </Button>
          </>
        }
      >
        <AttachmentPicker
          files={attachFiles}
          onAdd={addAttachFiles}
          onRemove={removeAttachFile}
        />
      </Modal>

      {/* ---------------- ไฟล์ของคำขอ ---------------- */}
      <Modal
        open={Boolean(filesTarget)}
        size="md"
        title="ไฟล์ของคำขอ"
        description={
          filesTarget
            ? `${filesTarget.requestNo} · ${filesTarget.title}`
            : undefined
        }
        onClose={() => setFilesTarget(null)}
        footer={
          <Button variant="secondary" onClick={() => setFilesTarget(null)}>
            ปิด
          </Button>
        }
      >
        {filesTarget && (filesTarget.files ?? []).length > 0 ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {sortFiles(filesTarget.files ?? []).map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-700">
                    {file.title || file.fileName}
                  </p>
                  <p className="truncate text-[11.5px] text-slate-400">
                    {FILE_TYPE_LABEL[String(file.fileType)] ?? "ไฟล์"} ·{" "}
                    {fileSizeText(file.fileSize)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void downloadFile(
                        filesTarget,
                        file.id,
                        file.fileName || file.title,
                      )
                    }
                    loading={downloadingId === file.id}
                    icon={<Download className="h-3.5 w-3.5" />}
                  >
                    ดาวน์โหลด
                  </Button>
                  {String(file.fileType) === "ATTACHMENT" &&
                  canAttachFile(filesTarget) ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => openDeleteFileDialog(filesTarget, file)}
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                    >
                      ลบ
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-[13px] text-slate-400">
            คำขอนี้ยังไม่มีไฟล์
          </p>
        )}
      </Modal>

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

/** เลือกไฟล์แนบหลายไฟล์ ใช้ทั้งตอนสร้างคำขอและตอนแนบเพิ่มภายหลัง */
function AttachmentPicker({
  files,
  onAdd,
  onRemove,
}: {
  files: File[];
  onAdd: (list: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-[13px] font-semibold text-brand-700 hover:border-slate-400">
        <Paperclip className="h-4 w-4" />
        เลือกไฟล์แนบ
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            onAdd(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {files.length > 0 ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}`}
              className="flex items-center justify-between gap-3 px-4 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-slate-700">
                  {file.name}
                </p>
                <p className="text-[11.5px] text-slate-400">
                  {fileSizeText(file.size)}
                </p>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => onRemove(index)}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                ลบ
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-slate-400">ยังไม่ได้เลือกไฟล์</p>
      )}
    </div>
  );
}
