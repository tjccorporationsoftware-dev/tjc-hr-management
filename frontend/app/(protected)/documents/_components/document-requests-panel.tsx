"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Download,
  Eye,
  FileText,
  Paperclip,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { useAuth } from "@/contexts/auth-context";

import {
  approveDocumentRequest,
  cancelDocumentRequest,
  createDocumentRequest,
  createResignDocumentRequest,
  createSalaryCertificateRequest,
  createVisaCertificateRequest,
  createWorkCertificateRequest,
  deleteDocumentFile,
  downloadDocumentFile,
  generateDocumentPdf,
  getDocumentEmployees,
  getDocumentRequest,
  getDocumentRequests,
  getDocumentTypes,
  getOrganizationBranches,
  rejectDocumentRequest,
  renderDocumentRequest,
  submitDocumentRequest,
  uploadDocumentFile,
  uploadSignedDocumentFile,
} from "@/lib/api";

import type {
  DocumentFile,
  DocumentRequest,
  DocumentRequestActionForm,
  DocumentRequestStatus,
  DocumentRequestListSummary,
  DocumentType,
} from "@/types/document-workflow";
import type { EmployeeListItem } from "@/types/employee";
import type { BranchItem } from "@/types/organization";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDateTime } from "@/lib/date-format";

import { scrollPagerToTop } from "@/lib/scroll-to-top";
import {
  Badge,
  Button,
  Field,
  FieldGrid,
  IconButton,
  Modal,
  ModalActions,
  Notice,
  RowMenu,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  type Tone,
} from "@/components/kit";

const PAGE_SIZE = 20;

/**
 * แท็บ "หนังสือรับรอง" — เดิมเป็นหน้า /documents แยก ยุบมาเป็นแท็บในหน้า
 * "ศูนย์บริการพนักงาน" ตรรกะทางธุรกิจทั้งหมด (สิทธิ์, endpoint เฉพาะเอกสาร Preset,
 * ไฟล์แนบ 3 ประเภท, ประวัติอนุมัติ) คงไว้เหมือนเดิมทุกจุด เปลี่ยนแค่การแสดงผล
 */

const emptyDocumentRequestSummary: DocumentRequestListSummary = {
  total: 0,
  draft: 0,
  submitted: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
};

export type DocumentsSummary = {
  total: number;
  submitted: number;
  approved: number;
  rejectedCancelled: number;
};

type RequestFilters = {
  search: string;
  status: "" | DocumentRequestStatus;
  branchId: string;
  documentTypeId: string;
  dateFrom: string;
  dateTo: string;
};

type RequestFormState = {
  documentTypeId: string;
  title: string;
  purpose: string;
  note: string;

  // ฟิลด์เฉพาะของเอกสารบางประเภท จะแสดงเมื่อเลือกประเภทที่ต้องใช้เท่านั้น
  issueTo: string;
  language: "TH" | "EN" | "TH_EN";
  embassyName: string;
  country: string;
  travelDateFrom: string;
  travelDateTo: string;
  effectiveDate: string;
  reason: string;
  handoverNote: string;
  assetReturnNote: string;
};

/** ประเภทเอกสารที่ backend มี endpoint เฉพาะ (เก็บข้อมูลแบบมีโครงสร้างให้ template ใช้) */
const PRESET_CODES = [
  "WORK_CERTIFICATE",
  "SALARY_CERTIFICATE",
  "VISA_CERTIFICATE",
  "RESIGN_DOCUMENT",
] as const;

type PresetCode = (typeof PRESET_CODES)[number];

function isPresetCode(code?: string | null): code is PresetCode {
  return PRESET_CODES.includes((code ?? "") as PresetCode);
}

const PRESET_AUTO_TITLE: Record<PresetCode, string> = {
  WORK_CERTIFICATE: "ขอหนังสือรับรองการทำงาน",
  SALARY_CERTIFICATE: "ขอหนังสือรับรองเงินเดือน",
  VISA_CERTIFICATE: "ขอหนังสือรับรองเพื่อประกอบการขอวีซ่า",
  RESIGN_DOCUMENT: "ยื่นเอกสารลาออก",
};

type RequestActionType = "approve" | "reject" | "cancel";

type RequestActionTarget = {
  action: RequestActionType;
  item: DocumentRequest;
} | null;

const requestStatusOptions: {
  value: "" | DocumentRequestStatus;
  label: string;
}[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "DRAFT", label: "ร่าง" },
  { value: "SUBMITTED", label: "รออนุมัติ" },
  { value: "APPROVED", label: "อนุมัติแล้ว" },
  { value: "REJECTED", label: "ไม่อนุมัติ" },
  { value: "CANCELLED", label: "ยกเลิก" },
];

const emptyRequestFilters: RequestFilters = {
  search: "",
  status: "",
  branchId: "",
  documentTypeId: "",
  dateFrom: "",
  dateTo: "",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function todayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatFileSize(value?: number | null) {
  const size = Number(value ?? 0);

  if (size <= 0) return "-";

  if (size < 1024 * 1024) {
    return `${(size / 1024).toLocaleString("th-TH", {
      maximumFractionDigits: 1,
    })} KB`;
  }

  return `${(size / 1024 / 1024).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  })} MB`;
}

function getEmployeeName(employee?: DocumentRequest["employee"] | null) {
  if (!employee) return "-";

  return (
    employee.displayName ||
    `${employee.title ?? ""}${employee.firstName} ${employee.lastName}`.trim()
  );
}

/** บริษัท · สาขา ของผู้ขอ — HR ที่ดูข้ามบริษัทต้องแยกออกว่าใครอยู่ที่ไหน */
function formatOrgUnit(item: DocumentRequest) {
  const parts = [item.company?.nameTh, item.employee?.branch?.nameTh].filter(
    (value): value is string => Boolean(value),
  );

  return parts.length > 0 ? parts.join(" · ") : "-";
}

function getRequestStatusLabel(status: DocumentRequestStatus) {
  return (
    requestStatusOptions.find((item) => item.value === status)?.label ?? status
  );
}

function getStatusTone(status: DocumentRequestStatus): Tone {
  if (status === "APPROVED") return "positive";
  if (status === "SUBMITTED") return "warning";
  if (status === "REJECTED" || status === "CANCELLED") return "critical";
  return "neutral";
}

function getApprovalActionLabel(action: string) {
  if (action === "SUBMIT") return "ส่งขออนุมัติ";
  if (action === "APPROVE_LEVEL_1") return "อนุมัติชั้นที่ 1";
  if (action === "APPROVE_LEVEL_2") return "อนุมัติชั้นที่ 2";
  if (action === "APPROVE") return "อนุมัติ";
  if (action === "REJECT") return "ไม่อนุมัติ";
  if (action === "CANCEL") return "ยกเลิก";
  return action;
}

function getRequestActionTitle(action: RequestActionType) {
  if (action === "approve") return "อนุมัติคำขอเอกสาร";
  if (action === "reject") return "ไม่อนุมัติคำขอเอกสาร";
  return "ยกเลิกคำขอเอกสาร";
}

function daysSince(value?: string | null) {
  if (!value) return null;

  const from = new Date(value);
  if (Number.isNaN(from.getTime())) return null;

  return Math.max(
    Math.floor((Date.now() - from.getTime()) / (1000 * 60 * 60 * 24)),
    0,
  );
}

function openBlobInNewTab(blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 60_000);
}

function hasPermission(userPermissions: string[], permission: string) {
  return userPermissions.includes(permission);
}

const FILE_INPUT_CLASS =
  "block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:border-slate-300 focus:border-brand-500 3xl:text-[13.5px]";

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function DocumentRequestsPanel({
  onSummaryChange,
  renderTabBar,
}: {
  onSummaryChange?: (summary: DocumentsSummary) => void;
  /** วาดแถบแท็บของหน้าให้ พร้อมรับช่องค้นหา/ปุ่มของแผงนี้ไปวางท้ายแถวเดียวกัน */
  renderTabBar?: (trailing: ReactNode) => ReactNode;
}) {
  const { user } = useAuth();
  const userPermissions = user?.permissions ?? [];

  const canCreateDocument = hasPermission(userPermissions, "DOCUMENT_CREATE");
  const canApproveDocument = hasPermission(userPermissions, "DOCUMENT_APPROVE");
  const canExportDocument = hasPermission(userPermissions, "DOCUMENT_EXPORT");

  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  // ว่าง = ออกให้ตัวเอง (พฤติกรรมเดิม) · มีค่า = HR ออกให้พนักงานคนนั้น
  const [targetEmployeeId, setTargetEmployeeId] = useState("");

  const [requestPage, setRequestPage] = useState(1);
  const [requestTotal, setRequestTotal] = useState(0);
  const [requestTotalPages, setRequestTotalPages] = useState(1);
  const [requestSummary, setRequestSummary] =
    useState<DocumentRequestListSummary>(emptyDocumentRequestSummary);

  const [requestFilters, setRequestFilters] =
    useState<RequestFilters>(emptyRequestFilters);

  const [loadingRequests, setLoadingRequests] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DocumentRequest | null>(
    null,
  );
  const [requestActionTarget, setRequestActionTarget] =
    useState<RequestActionTarget>(null);

  const [actionReason, setActionReason] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ActionDialogState | null>(
    null,
  );

  const emptyRequestForm: RequestFormState = {
    documentTypeId: "",
    title: "",
    purpose: "",
    note: "",
    issueTo: "",
    language: "TH",
    embassyName: "",
    country: "",
    travelDateFrom: "",
    travelDateTo: "",
    effectiveDate: todayDateInput(),
    reason: "",
    handoverNote: "",
    assetReturnNote: "",
  };

  const [requestForm, setRequestForm] =
    useState<RequestFormState>(emptyRequestForm);

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentDescription, setAttachmentDescription] = useState("");

  async function loadRequests(
    nextPage = requestPage,
    overrideFilters = requestFilters,
  ) {
    setLoadingRequests(true);
    setErrorMessage("");

    try {
      const response = await getDocumentRequests({
        page: nextPage,
        pageSize: PAGE_SIZE,
        search: overrideFilters.search.trim() || undefined,
        status: overrideFilters.status || undefined,
        branchId: overrideFilters.branchId || undefined,
        documentTypeId: overrideFilters.documentTypeId || undefined,
        dateFrom: overrideFilters.dateFrom || undefined,
        dateTo: overrideFilters.dateTo || undefined,
      });

      setRequests(response.items);
      setRequestPage(response.meta.page);
      setRequestTotal(response.meta.total);
      setRequestTotalPages(Math.max(response.meta.totalPages, 1));
      setRequestSummary(response.summary ?? emptyDocumentRequestSummary);

      setDetailTarget((current) => {
        if (!current) return current;
        return response.items.find((item) => item.id === current.id) ?? current;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดคำขอเอกสารไม่สำเร็จ",
      );
    } finally {
      setLoadingRequests(false);
    }
  }

  async function loadMasterData() {
    try {
      const [typesResponse, employeesResponse, branchesResponse] =
        await Promise.all([
          getDocumentTypes({ page: 1, pageSize: 100, status: "ACTIVE" }),
          getDocumentEmployees().catch(() => null),
          // ผู้ใช้ scope ระดับสาขาจะได้กลับมาสาขาเดียว ตัวกรองจึงไม่หลอกว่าเลือกได้มากกว่านั้น
          getOrganizationBranches({ pageSize: 300, status: "ACTIVE" }).catch(
            () => null,
          ),
        ]);

      setDocumentTypes(typesResponse.items);
      setEmployees(employeesResponse?.items ?? []);
      setBranches(branchesResponse?.items ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดข้อมูลเอกสารไม่สำเร็จ",
      );
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูลอ้างอิงครั้งแรกตอน mount
    void loadMasterData();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRequestPage(1);
      loadRequests(1, requestFilters);
    }, 350);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestFilters]);

  useEffect(() => {
    onSummaryChange?.({
      total: requestSummary.total,
      submitted: requestSummary.submitted,
      approved: requestSummary.approved,
      rejectedCancelled: requestSummary.rejected + requestSummary.cancelled,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSummary]);

  function focusRequestStatus(status: "" | DocumentRequestStatus) {
    setRequestFilters((current) => ({ ...current, status }));
  }

  function resetAttachmentForm() {
    setAttachmentFile(null);
    setAttachmentTitle("");
    setAttachmentDescription("");
  }

  function openRequestModal(presetCode?: PresetCode) {
    const preferredType = presetCode
      ? documentTypes.find((item) => item.code === presetCode)
      : undefined;

    setRequestForm({
      ...emptyRequestForm,
      documentTypeId: (preferredType ?? documentTypes[0])?.id ?? "",
    });
    resetAttachmentForm();
    setTargetEmployeeId("");
    setRequestFormOpen(true);
  }

  /** ประเภทเอกสารที่เลือกอยู่ ใช้ตัดสินว่าต้องแสดงฟิลด์เฉพาะและยิง endpoint ไหน */
  const selectedDocumentType = documentTypes.find(
    (item) => item.id === requestForm.documentTypeId,
  );
  const selectedPresetCode = isPresetCode(selectedDocumentType?.code)
    ? selectedDocumentType.code
    : null;

  async function uploadSelectedFile(requestId: string) {
    if (!attachmentFile) return null;

    const formData = new FormData();
    formData.append("file", attachmentFile);
    formData.append("title", attachmentTitle.trim() || attachmentFile.name);

    if (attachmentDescription.trim()) {
      formData.append("description", attachmentDescription.trim());
    }

    return uploadDocumentFile(requestId, formData);
  }

  async function handleCreateRequest(submit: boolean) {
    if (!requestForm.documentTypeId) {
      setErrorMessage("กรุณาเลือกประเภทเอกสาร");
      return;
    }

    if (!selectedPresetCode && !requestForm.title.trim()) {
      setErrorMessage("กรุณาระบุชื่อคำขอเอกสาร");
      return;
    }

    if (selectedPresetCode === "RESIGN_DOCUMENT") {
      if (!requestForm.effectiveDate || !requestForm.reason.trim()) {
        setErrorMessage("กรุณาระบุวันที่มีผลและเหตุผลการลาออก");
        return;
      }
    }

    setSaving(true);
    setErrorMessage("");

    const employeeId = targetEmployeeId || undefined;

    try {
      // เอกสารที่มี endpoint เฉพาะ จะเก็บข้อมูลแบบมีโครงสร้างลง requestData
      // ให้ template ดึงไปพิมพ์ได้ (เช่น {{requestData.embassyName}})
      const created = await (async () => {
        switch (selectedPresetCode) {
          case "WORK_CERTIFICATE":
            return createWorkCertificateRequest({
              employeeId,
              purpose: requestForm.purpose.trim() || "ขอหนังสือรับรองการทำงาน",
              issueTo: requestForm.issueTo.trim() || null,
              language: requestForm.language,
              submit,
            });

          case "SALARY_CERTIFICATE":
            return createSalaryCertificateRequest({
              employeeId,
              purpose: requestForm.purpose.trim() || "ขอหนังสือรับรองเงินเดือน",
              issueTo: requestForm.issueTo.trim() || null,
              language: requestForm.language,
              salaryDisplayMode: "MONTHLY_ONLY",
              submit,
            });

          case "VISA_CERTIFICATE":
            return createVisaCertificateRequest({
              employeeId,
              purpose: requestForm.purpose.trim() || "ใช้ประกอบการขอวีซ่า",
              embassyName: requestForm.embassyName.trim() || null,
              country: requestForm.country.trim() || null,
              travelDateFrom: requestForm.travelDateFrom || null,
              travelDateTo: requestForm.travelDateTo || null,
              language: requestForm.language,
              submit,
            });

          case "RESIGN_DOCUMENT":
            return createResignDocumentRequest({
              employeeId,
              effectiveDate: requestForm.effectiveDate,
              reason: requestForm.reason.trim(),
              handoverNote: requestForm.handoverNote.trim() || null,
              assetReturnNote: requestForm.assetReturnNote.trim() || null,
              submit,
            });

          default:
            return createDocumentRequest({
              employeeId,
              documentTypeId: requestForm.documentTypeId,
              title: requestForm.title.trim(),
              purpose: requestForm.purpose.trim() || null,
              note: requestForm.note.trim() || null,
              submit,
            });
        }
      })();

      if (attachmentFile) {
        await uploadSelectedFile(created.id);
      }

      setRequestFormOpen(false);
      resetAttachmentForm();
      await loadRequests(1, requestFilters);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "สร้างคำขอเอกสารไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitRequest(item: DocumentRequest) {
    setActionSaving(true);
    setErrorMessage("");

    try {
      await submitDocumentRequest(item.id);
      await loadRequests(requestPage, requestFilters);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ส่งคำขอเอกสารไม่สำเร็จ",
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function handleRequestAction() {
    if (!requestActionTarget) return;

    const payload: DocumentRequestActionForm = {
      reason: actionReason.trim() || undefined,
      note: actionNote.trim() || undefined,
    };

    setActionSaving(true);
    setErrorMessage("");

    try {
      if (requestActionTarget.action === "approve") {
        await approveDocumentRequest(requestActionTarget.item.id, payload);
      }

      if (requestActionTarget.action === "reject") {
        await rejectDocumentRequest(requestActionTarget.item.id, payload);
      }

      if (requestActionTarget.action === "cancel") {
        await cancelDocumentRequest(requestActionTarget.item.id, payload);
      }

      setRequestActionTarget(null);
      setActionReason("");
      setActionNote("");
      await loadRequests(requestPage, requestFilters);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ดำเนินการคำขอเอกสารไม่สำเร็จ",
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function handleGeneratePdf(item: DocumentRequest) {
    setActionSaving(true);
    setErrorMessage("");

    try {
      await generateDocumentPdf(item.id, {
        title: `PDF - ${item.title}`,
      });

      await loadRequests(requestPage, requestFilters);

      if (detailTarget?.id === item.id) {
        await refreshRequestDetail(item.id);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "สร้าง PDF ไม่สำเร็จ",
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function handleRenderHtml(item: DocumentRequest) {
    setActionSaving(true);
    setErrorMessage("");

    try {
      const response = await renderDocumentRequest(item.id);
      const blob = new Blob([response.html], {
        type: "text/html;charset=utf-8",
      });
      openBlobInNewTab(blob);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Render HTML ไม่สำเร็จ",
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function handleOpenFile(item: DocumentRequest, fileId: string) {
    setActionSaving(true);
    setErrorMessage("");

    try {
      const blob = await downloadDocumentFile(item.id, fileId);
      openBlobInNewTab(blob);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "เปิดไฟล์ไม่สำเร็จ",
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function refreshRequestDetail(requestId: string) {
    try {
      const latest = await getDocumentRequest(requestId);

      setDetailTarget(latest);

      setRequests((current) =>
        current.map((item) => (item.id === latest.id ? latest : item)),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "โหลดรายละเอียดคำขอเอกสารล่าสุดไม่สำเร็จ",
      );
    }
  }

  async function handleUploadFileToDetail() {
    if (!detailTarget) return;

    if (!attachmentFile) {
      setErrorMessage("กรุณาเลือกไฟล์แนบ");
      return;
    }

    setActionSaving(true);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", attachmentFile);
      formData.append("title", attachmentTitle.trim() || attachmentFile.name);

      if (attachmentDescription.trim()) {
        formData.append("description", attachmentDescription.trim());
      }

      await uploadDocumentFile(detailTarget.id, formData);

      resetAttachmentForm();
      await refreshRequestDetail(detailTarget.id);
      await loadRequests(requestPage, requestFilters);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "อัปโหลดไฟล์แนบไม่สำเร็จ",
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function handleUploadSignedToDetail() {
    if (!detailTarget) return;

    if (!attachmentFile) {
      setErrorMessage("กรุณาเลือกไฟล์หนังสือฉบับลงนาม");
      return;
    }

    setActionSaving(true);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", attachmentFile);
      formData.append(
        "title",
        attachmentTitle.trim() ||
          `หนังสือฉบับลงนาม ${detailTarget.documentNo ?? detailTarget.requestNo}`,
      );

      if (attachmentDescription.trim()) {
        formData.append("description", attachmentDescription.trim());
      }

      await uploadSignedDocumentFile(detailTarget.id, formData);

      resetAttachmentForm();
      await refreshRequestDetail(detailTarget.id);
      await loadRequests(requestPage, requestFilters);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "อัปโหลดหนังสือฉบับลงนามไม่สำเร็จ",
      );
    } finally {
      setActionSaving(false);
    }
  }

  function handleDeleteFileFromDetail(fileId: string) {
    if (!detailTarget) return;

    const currentRequest = detailTarget;

    setConfirmAction({
      title: "ลบไฟล์แนบ",
      description:
        "ยืนยันลบไฟล์แนบนี้หรือไม่ การดำเนินการนี้ไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบไฟล์แนบ",
      tone: "red",
      onConfirm: async () => {
        setActionSaving(true);
        setErrorMessage("");

        try {
          await deleteDocumentFile(currentRequest.id, fileId);

          await refreshRequestDetail(currentRequest.id);
          await loadRequests(requestPage, requestFilters);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "ลบไฟล์แนบไม่สำเร็จ";
          setErrorMessage(message);
          throw new Error(message);
        } finally {
          setActionSaving(false);
        }
      },
    });
  }

  /* เมนูจัดการของคำขอหนึ่งใบ — เงื่อนไขสิทธิ์และสถานะยกมาจากตารางเดิมทั้งชุด */
  function buildRequestMenu(item: DocumentRequest) {
    return [
      {
        label: "ดูรายละเอียด",
        icon: <Eye className="h-4 w-4" />,
        onSelect: () => setDetailTarget(item),
      },
      ...(canCreateDocument && item.status === "DRAFT"
        ? [
            {
              label: "ส่งอนุมัติ",
              icon: <Send className="h-4 w-4" />,
              onSelect: () => void handleSubmitRequest(item),
            },
          ]
        : []),
      ...(canApproveDocument && item.status === "SUBMITTED"
        ? [
            {
              label: "อนุมัติ",
              icon: <ShieldCheck className="h-4 w-4" />,
              onSelect: () => {
                setRequestActionTarget({ action: "approve", item });
                setActionReason("");
                setActionNote("");
              },
            },
            {
              label: "ไม่อนุมัติ",
              icon: <X className="h-4 w-4" />,
              tone: "danger" as const,
              onSelect: () => {
                setRequestActionTarget({ action: "reject", item });
                setActionReason("");
                setActionNote("");
              },
            },
          ]
        : []),
      ...(canExportDocument && item.status === "APPROVED"
        ? [
            {
              label: "ดูตัวอย่าง HTML",
              icon: <FileText className="h-4 w-4" />,
              onSelect: () => void handleRenderHtml(item),
            },
            {
              label: "สร้าง PDF",
              icon: <Download className="h-4 w-4" />,
              onSelect: () => void handleGeneratePdf(item),
            },
          ]
        : []),
      ...(canCreateDocument &&
      item.status !== "APPROVED" &&
      item.status !== "CANCELLED"
        ? [
            {
              label: "ยกเลิกคำขอ",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger" as const,
              separated: true,
              onSelect: () => {
                setRequestActionTarget({ action: "cancel", item });
                setActionReason("");
                setActionNote("");
              },
            },
          ]
        : []),
    ];
  }

  /* ท้ายแถวแท็บ — ค้นหา รีเฟรช และปุ่มหลักของหน้า */
  const tabTrailing = (
    <div className="flex items-center gap-2 pb-2 sm:pb-0">
      <SearchInput
        value={requestFilters.search}
        onChange={(event) =>
          setRequestFilters((current) => ({
            ...current,
            search: event.target.value,
          }))
        }
        placeholder="เลขที่คำขอ ชื่อเอกสาร ชื่อพนักงาน"
        aria-label="ค้นหาคำขอเอกสาร"
        className="w-full sm:w-72 3xl:w-80"
      />

      <IconButton
        title="โหลดข้อมูลใหม่"
        icon={<RefreshCcw className="h-4 w-4" />}
        onClick={() => void loadRequests(requestPage, requestFilters)}
      />

      {canCreateDocument ? (
        <Button
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => openRequestModal()}
        >
          สร้างคำขอ
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      {renderTabBar ? renderTabBar(tabTrailing) : null}

      {/*
       * ตัวกรองแถวเดียว 4 คอลัมน์เท่ากัน ไม่มีป้ายกำกับลอยเหนือช่อง
       * เดิมเป็นสามชั้น (ช่องกรองมีป้าย + ปุ่มขวา + แถวปุ่มสถานะ) กินความสูงเกือบ
       * เท่าตารางเอง ทั้งที่ตัวกรองจริงมีแค่สี่ตัว
       */}
      <div className="grid gap-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:grid-cols-2 sm:px-7 xl:grid-cols-3 3xl:px-8">
        <Select
          value={requestFilters.status}
          onChange={(event) =>
            focusRequestStatus(event.target.value as RequestFilters["status"])
          }
          className="w-full bg-white"
          aria-label="สถานะคำขอ"
        >
          {requestStatusOptions.map((option) => (
            <option key={option.value || "ALL"} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          value={requestFilters.documentTypeId}
          onChange={(event) =>
            setRequestFilters((current) => ({
              ...current,
              documentTypeId: event.target.value,
            }))
          }
          className="w-full bg-white"
          aria-label="ประเภทเอกสาร"
        >
          <option value="">ทุกประเภทเอกสาร</option>
          {documentTypes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nameTh}
            </option>
          ))}
        </Select>

        <Select
          value={requestFilters.branchId}
          onChange={(event) =>
            setRequestFilters((current) => ({
              ...current,
              branchId: event.target.value,
            }))
          }
          className="w-full bg-white"
          aria-label="สาขา"
        >
          <option value="">ทุกสาขา</option>
          {branches.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nameTh}
            </option>
          ))}
        </Select>

        <ThaiDateInput
          value={requestFilters.dateFrom}
          onChange={(event) =>
            setRequestFilters((current) => ({
              ...current,
              dateFrom: event.target.value,
            }))
          }
          placeholder="ยื่นตั้งแต่วันที่"
          className="bg-white"
          aria-label="ยื่นตั้งแต่วันที่"
        />

        <ThaiDateInput
          value={requestFilters.dateTo}
          min={requestFilters.dateFrom || undefined}
          onChange={(event) =>
            setRequestFilters((current) => ({
              ...current,
              dateTo: event.target.value,
            }))
          }
          placeholder="ถึงวันที่"
          className="bg-white"
          aria-label="ถึงวันที่"
        />
      </div>

      {errorMessage ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="critical">{errorMessage}</Notice>
        </div>
      ) : null}

      {/*
       * รายการทีละใบ ไม่ใช่ตาราง — คำขอหนึ่งใบมีทั้งเลขที่ ชื่อเรื่อง ผู้ขอ
       * อายุคำขอ จำนวนครั้งที่ออก PDF และสถานะ ยัดลงคอลัมน์แล้วต้องซ่อนครึ่งหนึ่ง
       * ตามความกว้างจอ (hideBelow) จนคนใช้ไม่รู้ว่ามีข้อมูลนั้นอยู่
       */}
      <div className="divide-y divide-slate-200">
        {loadingRequests && requests.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          </div>
        ) : requests.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ไม่พบคำขอเอกสารตามเงื่อนไขที่เลือก
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              ลองเปลี่ยนสถานะ ประเภทเอกสาร หรือช่วงวันที่ด้านบน
            </p>
          </div>
        ) : (
          requests.map((item) => (
            <RequestRow
              key={item.id}
              item={item}
              onOpen={() => setDetailTarget(item)}
              menu={buildRequestMenu(item)}
            />
          ))
        )}
      </div>

      {!loadingRequests && requests.length > 0 ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6 3xl:px-7">
          <span className="text-[13px] text-slate-400">
            หน้า {requestPage.toLocaleString("th-TH")} จาก{" "}
            {requestTotalPages.toLocaleString("th-TH")} · ทั้งหมด{" "}
            {requestTotal.toLocaleString("th-TH")} รายการ
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={requestPage <= 1}
              onClick={() => {
                loadRequests(requestPage - 1, requestFilters);
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={requestPage >= requestTotalPages}
              onClick={() => {
                loadRequests(requestPage + 1, requestFilters);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      {requestFormOpen ? (
        <Modal
          open
          title="สร้างคำขอเอกสาร"
          description="เลือกประเภทเอกสาร ระบุวัตถุประสงค์ และแนบไฟล์ประกอบได้"
          size="lg"
          onClose={() => setRequestFormOpen(false)}
        >
          <div className="space-y-4">
            <Field label="ออกเอกสารให้">
              <Select
                value={targetEmployeeId}
                onChange={(event) => setTargetEmployeeId(event.target.value)}
              >
                {/* ตัวเลือกแรกใส่ชื่อผู้ใช้ที่ล็อกอินไว้ด้วย ให้อ่านคู่กับรายชื่อพนักงานข้างล่างได้ */}
                <option value="">
                  {user?.displayName ? `ตนเอง · ${user.displayName}` : "ตนเอง"}
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeCode} ·{" "}
                    {employee.displayName ||
                      `${employee.title ?? ""}${employee.firstName} ${employee.lastName}`.trim()}
                  </option>
                ))}
              </Select>
              <span className="mt-1.5 block text-[11px] leading-4 text-slate-400">
                เลือกพนักงานเมื่อคีย์แทน — พนักงานที่ยื่นเองใช้เมนู
                &quot;ขอเอกสาร&quot; ฝั่ง ESS
              </span>
            </Field>

            <Field label="ประเภทเอกสาร">
              <Select
                value={requestForm.documentTypeId}
                onChange={(event) =>
                  setRequestForm((current) => ({
                    ...current,
                    documentTypeId: event.target.value,
                  }))
                }
              >
                <option value="">เลือกประเภทเอกสาร</option>
                {documentTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.nameTh}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedDocumentType ? (
              <Notice tone="info">
                <span className="font-semibold">
                  {selectedDocumentType.nameTh}
                </span>
                {selectedDocumentType.description
                  ? ` · ${selectedDocumentType.description}`
                  : ""}
                {selectedDocumentType.requiresApproval
                  ? ` · ต้องผ่านการอนุมัติ ${selectedDocumentType.approvalLevels} ชั้น`
                  : " · ออกได้ทันทีไม่ต้องอนุมัติ"}
                {selectedPresetCode ? (
                  <span className="mt-1 block">
                    ระบบตั้งชื่อคำขอให้อัตโนมัติว่า &quot;
                    {PRESET_AUTO_TITLE[selectedPresetCode]}&quot;
                  </span>
                ) : null}
              </Notice>
            ) : null}

            {!selectedPresetCode ? (
              <Field label="ชื่อคำขอ">
                <TextInput
                  value={requestForm.title}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="เช่น ขอหนังสือรับรองการทำงาน"
                />
              </Field>
            ) : null}

            <Field label="วัตถุประสงค์">
              <Textarea
                value={requestForm.purpose}
                onChange={(event) =>
                  setRequestForm((current) => ({
                    ...current,
                    purpose: event.target.value,
                  }))
                }
                placeholder="ระบุวัตถุประสงค์ในการขอเอกสาร"
              />
            </Field>

            {selectedPresetCode === "WORK_CERTIFICATE" ||
            selectedPresetCode === "SALARY_CERTIFICATE" ||
            selectedPresetCode === "VISA_CERTIFICATE" ? (
              <FieldGrid columns={2}>
                <Field label="ออกให้ / หน่วยงานปลายทาง">
                  <TextInput
                    value={requestForm.issueTo}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        issueTo: event.target.value,
                      }))
                    }
                    placeholder="เช่น ธนาคารกสิกรไทย / สถานทูตญี่ปุ่น"
                  />
                </Field>

                <Field label="ภาษาของเอกสาร">
                  <Select
                    value={requestForm.language}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        language: event.target.value as "TH" | "EN" | "TH_EN",
                      }))
                    }
                  >
                    <option value="TH">ไทย</option>
                    <option value="EN">อังกฤษ</option>
                    <option value="TH_EN">ไทย / อังกฤษ</option>
                  </Select>
                </Field>
              </FieldGrid>
            ) : null}

            {selectedPresetCode === "VISA_CERTIFICATE" ? (
              <FieldGrid columns={2}>
                <Field label="สถานทูต">
                  <TextInput
                    value={requestForm.embassyName}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        embassyName: event.target.value,
                      }))
                    }
                    placeholder="เช่น สถานเอกอัครราชทูตญี่ปุ่น"
                  />
                </Field>

                <Field label="ประเทศปลายทาง">
                  <TextInput
                    value={requestForm.country}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        country: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="เดินทางตั้งแต่">
                  <ThaiDateInput
                    value={requestForm.travelDateFrom}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        travelDateFrom: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="เดินทางถึง">
                  <ThaiDateInput
                    value={requestForm.travelDateTo}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        travelDateTo: event.target.value,
                      }))
                    }
                  />
                </Field>
              </FieldGrid>
            ) : null}

            {selectedPresetCode === "RESIGN_DOCUMENT" ? (
              <>
                <Field label="วันที่มีผลลาออก">
                  <ThaiDateInput
                    value={requestForm.effectiveDate}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        effectiveDate: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="เหตุผลการลาออก">
                  <Textarea
                    value={requestForm.reason}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        reason: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="หมายเหตุการส่งมอบงาน">
                  <Textarea
                    value={requestForm.handoverNote}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        handoverNote: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="หมายเหตุการคืนทรัพย์สิน">
                  <Textarea
                    value={requestForm.assetReturnNote}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        assetReturnNote: event.target.value,
                      }))
                    }
                  />
                </Field>
              </>
            ) : null}

            {!selectedPresetCode ? (
              <Field label="หมายเหตุ">
                <Textarea
                  value={requestForm.note}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="หมายเหตุเพิ่มเติม"
                />
              </Field>
            ) : null}

            <AttachmentPicker
              title="ไฟล์แนบประกอบคำขอ"
              file={attachmentFile}
              fileTitle={attachmentTitle}
              description={attachmentDescription}
              onFileChange={setAttachmentFile}
              onTitleChange={setAttachmentTitle}
              onDescriptionChange={setAttachmentDescription}
            />

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <Button
                onClick={() => setRequestFormOpen(false)}
                disabled={saving}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={() => handleCreateRequest(false)}
                disabled={saving}
              >
                บันทึกร่าง
              </Button>
              <Button
                variant="primary"
                loading={saving}
                onClick={() => handleCreateRequest(true)}
              >
                บันทึกและส่งอนุมัติ
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {detailTarget ? (
        <Modal
          open
          title="รายละเอียดคำขอเอกสาร"
          description={detailTarget.documentNo ?? detailTarget.requestNo}
          size="lg"
          onClose={() => setDetailTarget(null)}
        >
          <div className="space-y-5">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <DetailRow
                label="เลขที่หนังสือ"
                value={
                  detailTarget.documentNo ?? (
                    <span className="text-slate-400">
                      ออกเมื่ออนุมัติขั้นสุดท้าย
                    </span>
                  )
                }
              />
              <DetailRow
                label="วันที่ออกหนังสือ"
                value={
                  detailTarget.issuedAt
                    ? formatThaiDateTime(detailTarget.issuedAt)
                    : "-"
                }
              />
              <DetailRow label="เลขที่คำขอ" value={detailTarget.requestNo} />
              <DetailRow label="ชื่อคำขอ" value={detailTarget.title} />
              <DetailRow
                label="ประเภทเอกสาร"
                value={detailTarget.documentType?.nameTh ?? "-"}
              />
              <DetailRow
                label="พนักงาน"
                value={getEmployeeName(detailTarget.employee)}
              />
              <DetailRow
                label="บริษัท"
                value={detailTarget.company?.nameTh ?? "-"}
              />
              <DetailRow
                label="สาขา"
                value={detailTarget.employee?.branch?.nameTh ?? "-"}
              />
              <DetailRow
                label="สถานะ"
                value={
                  <Badge tone={getStatusTone(detailTarget.status)}>
                    {getRequestStatusLabel(detailTarget.status)}
                  </Badge>
                }
              />
              <DetailRow
                label="ชั้นอนุมัติปัจจุบัน"
                value={
                  detailTarget.status === "SUBMITTED"
                    ? `ชั้นที่ ${detailTarget.currentLevel || 1}`
                    : "-"
                }
              />
              <DetailRow
                label="วันที่สร้าง"
                value={formatThaiDateTime(detailTarget.createdAt)}
                last
              />
            </div>

            <div className="space-y-4">
              <FileGroup
                title="เอกสารประกอบคำขอ"
                helper="ไฟล์ที่ผู้ขอแนบมาให้ HR ใช้ประกอบการออกหนังสือ"
                files={(detailTarget.files ?? []).filter(
                  (file) => file.fileType === "ATTACHMENT",
                )}
                emptyText="ไม่มีเอกสารประกอบ"
                onOpen={(fileId) => handleOpenFile(detailTarget, fileId)}
                onDelete={
                  canCreateDocument && detailTarget.status !== "APPROVED"
                    ? handleDeleteFileFromDetail
                    : undefined
                }
              />

              <FileGroup
                title="PDF จากระบบ"
                helper="สร้างจาก Template ยังไม่มีลายเซ็นจริง ใช้สำหรับพิมพ์ไปลงนาม"
                tone="brand"
                files={(detailTarget.files ?? []).filter(
                  (file) => file.fileType === "GENERATED_PDF",
                )}
                emptyText="ยังไม่ได้สร้าง PDF"
                onOpen={(fileId) => handleOpenFile(detailTarget, fileId)}
              />

              <FileGroup
                title="หนังสือฉบับลงนาม"
                helper="ฉบับที่ผู้มีอำนาจลงนามและประทับตราแล้ว คือฉบับที่ส่งมอบให้พนักงาน"
                tone="positive"
                files={(detailTarget.files ?? []).filter(
                  (file) => file.fileType === "SIGNED_DOCUMENT",
                )}
                emptyText="ยังไม่ได้อัปโหลดฉบับลงนาม"
                onOpen={(fileId) => handleOpenFile(detailTarget, fileId)}
              />

              {/* ก่อนอนุมัติ = แนบเอกสารประกอบ · หลังอนุมัติ = อัปโหลดฉบับลงนาม */}
              {canCreateDocument &&
              detailTarget.status !== "APPROVED" &&
              detailTarget.status !== "REJECTED" &&
              detailTarget.status !== "CANCELLED" ? (
                <UploadBox
                  title="แนบเอกสารประกอบคำขอ"
                  helper="เช่น แบบฟอร์มเฉพาะของธนาคาร/สถานทูต หรือเอกสารที่ต้องยื่นคู่กัน"
                  file={attachmentFile}
                  fileTitle={attachmentTitle}
                  description={attachmentDescription}
                  saving={actionSaving}
                  onFileChange={setAttachmentFile}
                  onTitleChange={setAttachmentTitle}
                  onDescriptionChange={setAttachmentDescription}
                  onSubmit={handleUploadFileToDetail}
                />
              ) : null}

              {canExportDocument && detailTarget.status === "APPROVED" ? (
                <UploadBox
                  title="อัปโหลดหนังสือฉบับลงนาม"
                  helper="พิมพ์ PDF จากระบบ ให้ผู้มีอำนาจลงนามและประทับตรา แล้วสแกนกลับเข้ามาที่นี่"
                  tone="positive"
                  file={attachmentFile}
                  fileTitle={attachmentTitle}
                  description={attachmentDescription}
                  saving={actionSaving}
                  onFileChange={setAttachmentFile}
                  onTitleChange={setAttachmentTitle}
                  onDescriptionChange={setAttachmentDescription}
                  onSubmit={handleUploadSignedToDetail}
                />
              ) : null}
            </div>

            <div>
              <div className="mb-2 text-[13px] font-bold uppercase tracking-wide text-slate-500">
                ประวัติอนุมัติ
              </div>
              <div className="space-y-2">
                {(detailTarget.approvals ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    ยังไม่มีประวัติอนุมัติ
                  </div>
                ) : (
                  detailTarget.approvals?.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-slate-200 px-4 py-3"
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {getApprovalActionLabel(log.action)} · Level {log.level}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatThaiDateTime(log.createdAt)} โดย{" "}
                        {log.actedBy?.displayName ?? "-"}
                      </div>
                      {log.reason ? (
                        <div className="mt-2 text-sm text-slate-600">
                          เหตุผล: {log.reason}
                        </div>
                      ) : null}
                      {log.note ? (
                        <div className="mt-2 text-sm text-slate-600">
                          หมายเหตุ: {log.note}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {requestActionTarget ? (
        <Modal
          open
          title={getRequestActionTitle(requestActionTarget.action)}
          description={`${requestActionTarget.item.requestNo} · ${requestActionTarget.item.title}`}
          size="sm"
          onClose={() => setRequestActionTarget(null)}
        >
          <div className="space-y-4">
            <Field label="เหตุผล">
              <Textarea
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
              />
            </Field>
            <Field label="หมายเหตุ">
              <Textarea
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <ModalActions
                onCancel={() => setRequestActionTarget(null)}
                onConfirm={handleRequestAction}
                confirmLabel="ยืนยัน"
                loading={actionSaving}
              />
            </div>
          </div>
        </Modal>
      ) : null}

      <ActionDialog
        state={confirmAction}
        loading={actionSaving}
        onClose={() => setConfirmAction(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

/**
 * คำขอเอกสารหนึ่งใบในรายการ — บรรทัดเดียว
 * ซ้ายบอกว่าเป็นเอกสารอะไรของใคร ขวาเป็นตัวเลขของใบนั้นเรียงติดกันคั่นด้วยเส้น
 */
function RequestRow({
  item,
  onOpen,
  menu,
}: {
  item: DocumentRequest;
  onOpen: () => void;
  menu: Parameters<typeof RowMenu>[0]["items"];
}) {
  const generated = (item.files ?? []).filter(
    (file) => file.fileType === "GENERATED_PDF",
  );
  const agingDays =
    item.status === "SUBMITTED"
      ? daysSince(item.submittedAt ?? item.createdAt)
      : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <FileText className="h-4 w-4" />
      </span>

      <div className="min-w-[13rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[13.5px] font-bold tabular-nums text-slate-900 3xl:text-[14.5px]">
            {item.documentNo ?? item.requestNo}
          </p>
          {item.documentType?.nameTh ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
              {item.documentType.nameTh}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
          {item.documentNo
            ? `${item.title} · คำขอ ${item.requestNo}`
            : item.title}
        </p>
      </div>

      {/* ใครเป็นคนขอ */}
      <div className="w-44 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          ผู้ขอ
        </p>
        <p className="truncate text-[12.5px] font-semibold text-slate-800 3xl:text-[13px]">
          {getEmployeeName(item.employee)}
        </p>
        <p className="truncate text-[11px] text-slate-400 3xl:text-[11.5px]">
          {formatOrgUnit(item)}
        </p>
      </div>

      {/* ตัวเลขของใบนี้ เรียงติดกันคั่นด้วยเส้น */}
      <div className="flex shrink-0 items-center divide-x divide-brand-100">
        <RequestFact
          label="ค้างมา"
          value={
            agingDays === null
              ? "-"
              : `${agingDays.toLocaleString("th-TH")} วัน · ชั้น ${item.currentLevel || 1}`
          }
          muted={agingDays === null}
          tone={
            agingDays === null
              ? undefined
              : agingDays >= 5
                ? "critical"
                : agingDays >= 2
                  ? "warning"
                  : undefined
          }
        />
        <RequestFact
          label="ออก PDF"
          value={
            generated.length === 0
              ? "ยังไม่ออก"
              : `${generated.length.toLocaleString("th-TH")} ครั้ง`
          }
          muted={generated.length === 0}
        />
        <RequestFact
          label="วันที่สร้าง"
          value={formatThaiDateTime(item.createdAt)}
        />
      </div>

      <div className="w-24 shrink-0">
        <Badge tone={getStatusTone(item.status)}>
          {getRequestStatusLabel(item.status)}
        </Badge>
      </div>

      {/* กดเมนูแล้วไม่ต้องเปิดรายละเอียดตามไปด้วย */}
      <div
        className="flex w-8 shrink-0 justify-end"
        onClick={(event) => event.stopPropagation()}
      >
        <RowMenu items={menu} />
      </div>
    </article>
  );
}

/** ตัวเลขหนึ่งช่องในแถวคำขอ */
function RequestFact({
  label,
  value,
  tone,
  muted = false,
}: {
  label: string;
  value: string;
  tone?: "warning" | "critical";
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={`whitespace-nowrap text-[12.5px] font-semibold tabular-nums 3xl:text-[13px] ${
          muted
            ? "text-slate-300"
            : tone === "critical"
              ? "text-rose-600"
              : tone === "warning"
                ? "text-amber-600"
                : "text-slate-900"
        }`}
      >
        {value}
      </p>
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
      className={`grid gap-1 bg-white px-4 py-3 md:grid-cols-[180px_1fr] md:gap-4 ${
        last ? "" : "border-b border-slate-200"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="text-[13px] leading-6 text-slate-800 3xl:text-[14px]">
        {value}
      </div>
    </div>
  );
}

function AttachmentPicker({
  title,
  file,
  fileTitle,
  description,
  onFileChange,
  onTitleChange,
  onDescriptionChange,
}: {
  title: string;
  file: File | null;
  fileTitle: string;
  description: string;
  onFileChange: (file: File | null) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <Paperclip className="h-4 w-4" />
        {title}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          className={FILE_INPUT_CLASS}
        />

        <TextInput
          value={fileTitle}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={file?.name || "ชื่อไฟล์แนบ"}
        />

        <div className="md:col-span-2">
          <Textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="คำอธิบายไฟล์แนบ"
          />
        </div>
      </div>
    </div>
  );
}

function FileGroup({
  title,
  helper,
  files,
  emptyText,
  tone = "neutral",
  onOpen,
  onDelete,
}: {
  title: string;
  helper: string;
  files: DocumentFile[];
  emptyText: string;
  tone?: Tone;
  onOpen: (fileId: string) => void;
  onDelete?: (fileId: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <Badge tone={tone}>{title}</Badge>
        <span className="text-[11px] leading-4 text-slate-400">{helper}</span>
      </div>

      <div className="mt-2 space-y-2">
        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            {emptyText}
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {file.title}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {file.fileName} · {formatFileSize(file.fileSize)}
                  {file.uploadedBy?.displayName
                    ? ` · โดย ${file.uploadedBy.displayName}`
                    : ""}
                </div>
                {file.description ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {file.description}
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  icon={<Download className="h-3.5 w-3.5" />}
                  onClick={() => onOpen(file.id)}
                >
                  เปิดไฟล์
                </Button>

                {onDelete ? (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => onDelete(file.id)}
                  >
                    ลบ
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UploadBox({
  title,
  helper,
  tone = "brand",
  file,
  fileTitle,
  description,
  saving,
  onFileChange,
  onTitleChange,
  onDescriptionChange,
  onSubmit,
}: {
  title: string;
  helper: string;
  tone?: "brand" | "positive";
  file: File | null;
  fileTitle: string;
  description: string;
  saving: boolean;
  onFileChange: (file: File | null) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const boxClass =
    tone === "positive"
      ? "border-emerald-300 bg-emerald-50/50"
      : "border-brand-300 bg-brand-50/50";
  const headingClass =
    tone === "positive" ? "text-emerald-800" : "text-brand-800";

  return (
    <div className={`rounded-lg border border-dashed p-4 ${boxClass}`}>
      <div
        className={`flex items-center gap-2 text-sm font-bold ${headingClass}`}
      >
        <Paperclip className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{helper}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          className={FILE_INPUT_CLASS}
        />

        <TextInput
          value={fileTitle}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={file?.name || "ชื่อไฟล์"}
        />

        <div className="md:col-span-2">
          <Textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          loading={saving}
          icon={<Upload className="h-4 w-4" />}
          onClick={onSubmit}
        >
          อัปโหลดไฟล์
        </Button>
      </div>
    </div>
  );
}
