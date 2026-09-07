"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ClipboardList, Plus, RefreshCcw, Trash2 } from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate, formatThaiDateTime } from "@/lib/date-format";

import {
  apiFetch,
  cancelOnboardingTask,
  completeOnboardingTask,
  createOnboardingChecklist,
  createOnboardingDocument,
  createOnboardingTask,
  createProbationRecord,
  getEvaluationForms,
  getOnboardingChecklists,
  getOnboardingDocuments,
  getOnboardingTasks,
  getProbationRecords,
  rejectOnboardingDocument,
  reviewProbationRecord,
  startOnboardingTask,
  submitOnboardingDocument,
  verifyOnboardingDocument,
  waiveOnboardingDocument,
} from "@/lib/api";

import type {
  MasterStatus,
  OnboardingChecklist,
  OnboardingChecklistListSummary,
  OnboardingDocument,
  OnboardingDocumentListSummary,
  OnboardingDocumentStatus,
  OnboardingListMeta,
  OnboardingTask,
  OnboardingTaskListSummary,
  OnboardingTaskStatus,
  ProbationRecord,
  ProbationRecordListSummary,
  ProbationStatus,
} from "@/types/onboarding";
import type { EvaluationForm } from "@/types/performance";

import {
  Badge,
  Button,
  CellStack,
  Checkbox,
  DataTable,
  Field,
  FieldGrid,
  Modal,
  ModalActions,
  Notice,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  type Column,
  type Tone,
} from "@/components/kit";

/**
 * แท็บ "เช็กลิสต์" / "งานที่ต้องทำ" / "เอกสารพนักงานใหม่" / "ทดลองงาน" — เดิมเป็น
 * หน้า /onboarding แยก ยุบมาเป็น 4 แท็บสุดท้ายในหน้า "รับพนักงานใหม่" คงตรรกะเดิม
 * ทั้งหมดไว้ในคอมโพเนนต์เดียว เพราะข้อมูลผูกกันข้ามแท็บ: งานอ้างอิงเช็กลิสต์
 * เอกสารอ้างอิงงาน และตัวเลือกพนักงานของใบทดลองงานต้องกรองจากใบที่มีอยู่แล้ว
 *
 * ส่วนที่ต้องระวังที่สุดคือ "ทดลองงาน" — ทดลองงานที่ใกล้ครบกำหนดต้องรีวิวก่อนครบ
 * 120 วัน ไม่งั้นกลายเป็นพนักงานประจำอัตโนมัติ (ดู PROBATION_REVIEW_LEAD_DAYS)
 */

type OnboardingTabKey = "checklists" | "tasks" | "documents" | "probations";

type CompanyOption = {
  id: string;
  code?: string;
  nameTh?: string;
  name?: string;
};

type EmployeeOption = {
  id: string;
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string | null;
  companyId?: string;
  startDate?: string;
  status?: string;
};

type EmployeeListResponse = {
  items?: EmployeeOption[];
  data?: EmployeeOption[];
};

type CompanyListResponse = {
  items?: CompanyOption[];
  data?: CompanyOption[];
};

type ChecklistDraft = {
  companyId: string;
  code: string;
  name: string;
  description: string;
  status: MasterStatus;
  items: Array<{
    title: string;
    description: string;
    category: string;
    sortOrder: number;
    isRequired: boolean;
  }>;
};

type TaskDraft = {
  companyId: string;
  employeeId: string;
  checklistId: string;
  checklistItemId: string;
  title: string;
  description: string;
  category: string;
  dueDate: string;
};

type DocumentDraft = {
  companyId: string;
  employeeId: string;
  taskId: string;
  documentName: string;
  description: string;
  isRequired: boolean;
  note: string;
};

type ProbationDraft = {
  companyId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reviewDate: string;
  summary: string;
  recommendation: string;
  note: string;
};

export type OnboardingSummary = {
  checklists: OnboardingChecklistListSummary;
  tasks: OnboardingTaskListSummary;
  documents: OnboardingDocumentListSummary;
  probations: ProbationRecordListSummary;
};

const taskStatusText: Record<OnboardingTaskStatus, string> = {
  PENDING: "รอเริ่ม",
  IN_PROGRESS: "กำลังทำ",
  COMPLETED: "เสร็จแล้ว",
  OVERDUE: "เกินกำหนด",
  CANCELLED: "ยกเลิก",
};

const documentStatusText: Record<OnboardingDocumentStatus, string> = {
  PENDING: "รอส่ง",
  SUBMITTED: "ส่งแล้ว รอตรวจ",
  VERIFIED: "ตรวจผ่าน",
  REJECTED: "ตีกลับ",
  WAIVED: "ยกเว้น",
};

const probationStatusText: Record<ProbationStatus, string> = {
  IN_PROGRESS: "อยู่ระหว่างทดลองงาน",
  PASSED: "ผ่านทดลองงาน",
  FAILED: "ไม่ผ่านทดลองงาน",
  EXTENDED: "ขยายเวลาทดลองงาน",
  CANCELLED: "ยกเลิก",
};

const masterStatusText: Record<MasterStatus, string> = {
  ACTIVE: "เปิดใช้งาน",
  INACTIVE: "ปิดใช้งาน",
};

const emptyListMeta: OnboardingListMeta = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
};

const emptyChecklistSummary: OnboardingChecklistListSummary = {
  total: 0,
  active: 0,
  inactive: 0,
};

const emptyTaskSummary: OnboardingTaskListSummary = {
  total: 0,
  pending: 0,
  inProgress: 0,
  completed: 0,
  overdue: 0,
  cancelled: 0,
};

const emptyDocumentSummary: OnboardingDocumentListSummary = {
  total: 0,
  pending: 0,
  submitted: 0,
  verified: 0,
  rejected: 0,
  waived: 0,
  required: 0,
};

const emptyProbationSummary: ProbationRecordListSummary = {
  total: 0,
  inProgress: 0,
  passed: 0,
  failed: 0,
  extended: 0,
  cancelled: 0,
  dueSoon: 0,
  overdue: 0,
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** ทดลองงานไทยนิยม 119 วัน เพราะต้องแจ้งผลก่อนครบ 120 วัน */
function probationDaysLeft(endDate?: string | null) {
  if (!endDate) return null;

  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;

  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** นัดรีวิวล่วงหน้ากี่วันก่อนครบกำหนด (119 - 100 = ค่าเดิมของระบบ) */
const PROBATION_REVIEW_LEAD_DAYS = 19;

/** บวกวันจากวันที่ ISO (ยึด UTC เพื่อไม่ให้เพี้ยนข้ามวันตามโซนเวลา) */
function shiftIsoDate(isoDate: string, days: number) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  date.setDate(date.getDate() + days);

  return date.toISOString().slice(0, 10);
}

/** จำนวนวันทดลองงานรวม ใช้เตือนกรณีเกิน 120 วันตามกฎหมายค่าชดเชย */
function totalProbationDays(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/** ค่าเริ่มต้นของการขยายทดลองงาน = ต่อจากวันครบกำหนดเดิมอีก 30 วัน */
function defaultExtendDate(probation: ProbationRecord) {
  const base = new Date(probation.extendedUntil ?? probation.endDate);
  if (Number.isNaN(base.getTime())) return "";

  base.setDate(base.getDate() + 30);

  return base.toISOString().slice(0, 10);
}

/** จำนวนวันที่งานเลยกำหนด (null = ยังไม่เลย / ปิดงานแล้ว / ไม่ได้กำหนดวัน) */
function taskOverdueDays(task: OnboardingTask) {
  if (task.status === "COMPLETED" || task.status === "CANCELLED") return null;

  const left = probationDaysLeft(task.dueDate);

  return left !== null && left < 0 ? Math.abs(left) : null;
}

function checklistStatusTone(status: MasterStatus): Tone {
  return status === "ACTIVE" ? "positive" : "neutral";
}

function taskStatusTone(status: OnboardingTaskStatus): Tone {
  if (status === "COMPLETED") return "positive";
  if (status === "IN_PROGRESS") return "brand";
  if (status === "OVERDUE") return "critical";
  return "neutral";
}

function documentStatusTone(status: OnboardingDocumentStatus): Tone {
  if (status === "VERIFIED") return "positive";
  if (status === "SUBMITTED") return "brand";
  if (status === "REJECTED") return "critical";
  if (status === "WAIVED") return "warning";
  return "neutral";
}

function probationStatusTone(status: ProbationStatus): Tone {
  if (status === "PASSED") return "positive";
  if (status === "IN_PROGRESS") return "brand";
  if (status === "FAILED") return "critical";
  if (status === "EXTENDED") return "warning";
  return "neutral";
}

function daysLeftTone(left: number): Tone {
  if (left <= 7) return "critical";
  if (left <= 30) return "warning";
  return "neutral";
}

function employeeName(
  employee?:
    | EmployeeOption
    | OnboardingTask["employee"]
    | OnboardingDocument["employee"]
    | ProbationRecord["employee"]
    | null,
) {
  if (!employee) return "-";

  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    "-"
  );
}

export function OnboardingPanel({
  activeTab,
  onSummaryChange,
}: {
  activeTab: OnboardingTabKey;
  onSummaryChange?: (summary: OnboardingSummary) => void;
}) {
  const [probationForms, setProbationForms] = useState<EvaluationForm[]>([]);
  const [reviewTarget, setReviewTarget] = useState<{
    record: ProbationRecord;
    status: ProbationStatus;
  } | null>(null);
  const [reviewDraft, setReviewDraft] = useState<{
    formId: string;
    summary: string;
    scores: Record<string, string>;
  }>({ formId: "", summary: "", scores: {} });
  const [extendTarget, setExtendTarget] = useState<ProbationRecord | null>(null);
  const [extendDraft, setExtendDraft] = useState({
    extendedUntil: "",
    summary: "",
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );
  const dialogResolveRef = useRef<((value: string | null) => void) | null>(
    null,
  );

  function closeActionDialog() {
    if (dialogResolveRef.current) {
      dialogResolveRef.current(null);
      dialogResolveRef.current = null;
    }

    setActionDialog(null);
  }

  function showMessage(
    title: string,
    description: string,
    tone: ActionDialogState["tone"] = "blue",
  ) {
    setActionDialog({
      title,
      description,
      confirmLabel: "รับทราบ",
      tone,
      onConfirm: () => {},
    });
  }

  function showError(error: unknown, fallback: string) {
    setErrorMessage(error instanceof Error ? error.message : fallback);
  }

  function requestDialogInput({
    title,
    description,
    reasonLabel,
    reasonPlaceholder,
    defaultReason = "",
    requireReason = false,
    confirmLabel = "ยืนยัน",
    tone = "blue",
  }: {
    title: string;
    description: string;
    reasonLabel: string;
    reasonPlaceholder?: string;
    defaultReason?: string;
    requireReason?: boolean;
    confirmLabel?: string;
    tone?: ActionDialogState["tone"];
  }) {
    return new Promise<string | null>((resolve) => {
      dialogResolveRef.current = resolve;
      setActionDialog({
        title,
        description,
        confirmLabel,
        cancelLabel: "ยกเลิก",
        tone,
        reasonLabel,
        reasonPlaceholder,
        defaultReason,
        requireReason,
        onConfirm: (reason) => {
          dialogResolveRef.current = null;
          resolve(reason ?? "");
        },
      });
    });
  }

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [checklists, setChecklists] = useState<OnboardingChecklist[]>([]);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [documents, setDocuments] = useState<OnboardingDocument[]>([]);
  const [probations, setProbations] = useState<ProbationRecord[]>([]);
  const [handledEmployeeIds, setHandledEmployeeIds] = useState<Set<string>>(
    new Set(),
  );

  const [, setChecklistMeta] = useState<OnboardingListMeta>(emptyListMeta);
  const [checklistSummary, setChecklistSummary] =
    useState<OnboardingChecklistListSummary>(emptyChecklistSummary);
  const [taskSummary, setTaskSummary] =
    useState<OnboardingTaskListSummary>(emptyTaskSummary);
  const [documentSummary, setDocumentSummary] =
    useState<OnboardingDocumentListSummary>(emptyDocumentSummary);
  const [probationSummary, setProbationSummary] =
    useState<ProbationRecordListSummary>(emptyProbationSummary);

  const [checklistSearch, setChecklistSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [probationSearch, setProbationSearch] = useState("");

  const [checklistStatusFilter, setChecklistStatusFilter] = useState<
    MasterStatus | "ALL"
  >("ALL");

  const [createOpen, setCreateOpen] = useState(false);

  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraft>({
    companyId: "",
    code: "",
    name: "",
    description: "",
    status: "ACTIVE",
    items: [
      {
        title: "ตรวจสอบเอกสารส่วนตัว",
        description: "",
        category: "เอกสาร",
        sortOrder: 1,
        isRequired: true,
      },
      {
        title: "แนะนำกฎระเบียบและสวัสดิการ",
        description: "",
        category: "ปฐมนิเทศ",
        sortOrder: 2,
        isRequired: true,
      },
      {
        title: "ยื่นอุปกรณ์ประจำตำแหน่ง",
        description: "",
        category: "อุปกรณ์",
        sortOrder: 3,
        isRequired: true,
      },
    ],
  });

  const [taskDraft, setTaskDraft] = useState<TaskDraft>({
    companyId: "",
    employeeId: "",
    checklistId: "",
    checklistItemId: "",
    title: "",
    description: "",
    category: "",
    dueDate: addDays(7),
  });

  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>({
    companyId: "",
    employeeId: "",
    taskId: "",
    documentName: "",
    description: "",
    isRequired: true,
    note: "",
  });

  const [probationDraft, setProbationDraft] = useState<ProbationDraft>({
    companyId: "",
    employeeId: "",
    startDate: todayDate(),
    endDate: addDays(119),
    reviewDate: addDays(100),
    summary: "",
    recommendation: "",
    note: "",
  });

  const activeChecklist = useMemo(() => {
    return (
      checklists.find((checklist) => checklist.id === taskDraft.checklistId) ??
      null
    );
  }, [checklists, taskDraft.checklistId]);

  function employeesForCompany(companyId: string) {
    if (!companyId) return employees;

    return employees.filter((employee) => {
      if (!employee.companyId) return true;
      return employee.companyId === companyId;
    });
  }

  /**
   * ตัวเลือกพนักงานสำหรับเปิดใบทดลองงาน — เหลือเฉพาะคนที่ยังไม่เคยมีใบทดลองงาน
   * ตัดออก: คนที่มีใบค้างอยู่ · คนที่ผ่าน/ไม่ผ่านไปแล้ว · คนที่ลาออกหรือเลิกจ้าง
   */
  function employeesForProbation(companyId: string) {
    return employeesForCompany(companyId).filter(
      (employee) =>
        !handledEmployeeIds.has(employee.id) &&
        employee.status !== "RESIGNED" &&
        employee.status !== "TERMINATED",
    );
  }

  /** API จำกัด pageSize ไว้ที่ 100 จึงต้องไล่ดึงทีละหน้าจนครบ */
  async function loadAllEmployees() {
    const pageSize = 100;
    const collected: EmployeeOption[] = [];

    for (let page = 1; page <= 20; page += 1) {
      const data = await apiFetch<EmployeeListResponse | EmployeeOption[]>(
        `/employees?page=${page}&pageSize=${pageSize}`,
      );

      const items = Array.isArray(data) ? data : (data.items ?? data.data ?? []);

      collected.push(...items);

      if (items.length < pageSize) break;
    }

    return collected;
  }

  async function loadBaseData() {
    const [companyData, employeeData] = await Promise.all([
      apiFetch<CompanyOption[] | CompanyListResponse>(
        "/organization/companies",
      ),
      loadAllEmployees(),
    ]);

    const companyItems = Array.isArray(companyData)
      ? companyData
      : (companyData.items ?? companyData.data ?? []);

    setCompanies(companyItems);
    setEmployees(employeeData);

    const defaultCompanyId = companyItems[0]?.id ?? "";

    if (defaultCompanyId) {
      setChecklistDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || defaultCompanyId,
      }));

      setTaskDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || defaultCompanyId,
      }));

      setDocumentDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || defaultCompanyId,
      }));

      setProbationDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || defaultCompanyId,
      }));
    }
  }

  async function loadChecklists(
    nextStatus: MasterStatus | "ALL" = checklistStatusFilter,
  ) {
    const data = await getOnboardingChecklists({
      page: 1,
      pageSize: 10,
      q: checklistSearch.trim() || undefined,
      status: nextStatus === "ALL" ? undefined : nextStatus,
    });

    setChecklists(data.items ?? []);
    setChecklistMeta(data.meta ?? emptyListMeta);
    setChecklistSummary(data.summary ?? emptyChecklistSummary);
  }

  async function loadTasks() {
    const data = await getOnboardingTasks({
      page: 1,
      pageSize: 100,
      q: taskSearch.trim() || undefined,
    });

    setTasks(data.items ?? []);
    setTaskSummary(data.summary ?? emptyTaskSummary);
  }

  async function loadDocuments() {
    const data = await getOnboardingDocuments({
      page: 1,
      pageSize: 100,
      q: documentSearch.trim() || undefined,
    });

    setDocuments(data.items ?? []);
    setDocumentSummary(data.summary ?? emptyDocumentSummary);
  }

  async function loadProbations() {
    const data = await getProbationRecords({
      page: 1,
      pageSize: 100,
      q: probationSearch.trim() || undefined,
    });

    setProbations(data.items ?? []);
    setProbationSummary(data.summary ?? emptyProbationSummary);

    await loadHandledEmployeeIds();
  }

  /**
   * รายชื่อคนที่มีใบทดลองงานแล้ว (ไม่ผูกกับคำค้นหา)
   * ใช้กรอง dropdown ตอนเปิดใบใหม่ ถ้าใช้ตัว probations ตรง ๆ
   * คำค้นหาจะทำให้คนที่ผ่านแล้วหลุดกลับเข้ามาเลือกได้
   */
  async function loadHandledEmployeeIds() {
    const data = await getProbationRecords({ page: 1, pageSize: 100 });

    setHandledEmployeeIds(
      new Set(
        (data.items ?? [])
          .filter((item) => item.status !== "CANCELLED")
          .map((item) => item.employeeId),
      ),
    );
  }

  /** แบบประเมินที่ตั้งไว้ว่าใช้กับรอบทดลองงาน */
  async function loadProbationForms() {
    const data = await getEvaluationForms({
      page: 1,
      pageSize: 100,
      status: "ACTIVE",
    });

    setProbationForms(
      (data.items ?? []).filter((form) => form.periodType === "PROBATION"),
    );
  }

  async function reloadAll() {
    setLoading(true);
    setErrorMessage("");

    try {
      await Promise.all([
        loadBaseData(),
        loadProbationForms(),
        loadChecklists(),
        loadTasks(),
        loadDocuments(),
        loadProbations(),
      ]);
    } catch (error) {
      console.error(error);
      showError(error, "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูลครั้งแรกตอน mount
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onSummaryChange?.({
      checklists: checklistSummary,
      tasks: taskSummary,
      documents: documentSummary,
      probations: probationSummary,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistSummary, taskSummary, documentSummary, probationSummary]);

  const activeSearch =
    activeTab === "checklists"
      ? checklistSearch
      : activeTab === "tasks"
        ? taskSearch
        : activeTab === "documents"
          ? documentSearch
          : probationSearch;

  // ค้นหาอัตโนมัติระหว่างพิมพ์ หน่วง 350ms กันยิง API ทุกตัวอักษร
  const searchMountedRef = useRef(false);

  useEffect(() => {
    if (!searchMountedRef.current) {
      searchMountedRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);

        try {
          if (activeTab === "checklists") await loadChecklists();
          else if (activeTab === "tasks") await loadTasks();
          else if (activeTab === "documents") await loadDocuments();
          else await loadProbations();
        } catch (error) {
          console.error(error);
          showError(error, "ค้นหาไม่สำเร็จ");
        } finally {
          setLoading(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSearch, activeTab]);

  useEffect(() => {
    if (!taskDraft.checklistId && checklists[0]?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ตั้งเช็กลิสต์แรกให้อัตโนมัติเมื่อรายการโหลดเสร็จ
      setTaskDraft((prev) => ({
        ...prev,
        checklistId: checklists[0].id,
      }));
    }
  }, [checklists, taskDraft.checklistId]);

  useEffect(() => {
    if (!activeChecklist) return;

    if (!taskDraft.title && activeChecklist.items[0]) {
      const firstItem = activeChecklist.items[0];

      // eslint-disable-next-line react-hooks/set-state-in-effect -- เติมชื่องานจากรายการแรกของเช็กลิสต์ที่เพิ่งเลือก
      setTaskDraft((prev) => ({
        ...prev,
        checklistItemId: firstItem.id,
        title: firstItem.title,
        description: firstItem.description ?? "",
        category: firstItem.category ?? "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChecklist?.id]);

  function addChecklistItem() {
    setChecklistDraft((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          title: "",
          description: "",
          category: "",
          sortOrder: prev.items.length + 1,
          isRequired: true,
        },
      ],
    }));
  }

  function updateChecklistItem(
    index: number,
    key: keyof ChecklistDraft["items"][number],
    value: string | number | boolean,
  ) {
    setChecklistDraft((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    }));
  }

  function removeChecklistItem(index: number) {
    setChecklistDraft((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleCreateChecklist() {
    if (!checklistDraft.code.trim() || !checklistDraft.name.trim()) {
      showMessage("ข้อมูลไม่ครบ", "กรุณากรอกรหัสและชื่อ Checklist", "orange");
      return false;
    }

    if (checklistDraft.items.length === 0) {
      showMessage(
        "ข้อมูลไม่ครบ",
        "ต้องมีรายการ Checklist อย่างน้อย 1 รายการ",
        "orange",
      );
      return false;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createOnboardingChecklist({
        companyId: checklistDraft.companyId || undefined,
        code: checklistDraft.code.trim(),
        name: checklistDraft.name.trim(),
        description: checklistDraft.description.trim() || undefined,
        status: checklistDraft.status,
        items: checklistDraft.items.map((item, index) => ({
          title: item.title.trim(),
          description: item.description.trim() || undefined,
          category: item.category.trim() || undefined,
          sortOrder: index + 1,
          isRequired: item.isRequired,
        })),
      });

      setChecklistDraft((prev) => ({
        ...prev,
        code: "",
        name: "",
        description: "",
      }));

      await loadChecklists();
      showMessage("ดำเนินการสำเร็จ", "สร้าง Checklist สำเร็จ", "emerald");
      return true;
    } catch (error) {
      console.error(error);
      showError(error, "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTask() {
    if (
      !taskDraft.companyId ||
      !taskDraft.employeeId ||
      !taskDraft.title.trim()
    ) {
      showMessage(
        "ข้อมูลไม่ครบ",
        "กรุณาเลือกบริษัท พนักงาน และกรอกชื่องาน",
        "orange",
      );
      return false;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createOnboardingTask({
        companyId: taskDraft.companyId,
        employeeId: taskDraft.employeeId,
        checklistId: taskDraft.checklistId || undefined,
        checklistItemId: taskDraft.checklistItemId || undefined,
        title: taskDraft.title.trim(),
        description: taskDraft.description.trim() || undefined,
        category: taskDraft.category.trim() || undefined,
        dueDate: taskDraft.dueDate || undefined,
      });

      setTaskDraft((prev) => ({
        ...prev,
        title: "",
        description: "",
        category: "",
        checklistItemId: "",
        dueDate: addDays(7),
      }));

      await loadTasks();
      showMessage("ดำเนินการสำเร็จ", "สร้าง Onboarding Task สำเร็จ", "emerald");
      return true;
    } catch (error) {
      console.error(error);
      showError(error, "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleTaskAction(
    action: "start" | "complete" | "cancel",
    id: string,
  ) {
    let cancelReason = "";

    if (action === "cancel") {
      const reason = await requestDialogInput({
        title: "ยกเลิก Onboarding Task",
        description: "กรุณาระบุเหตุผลเพื่อบันทึกประวัติการยกเลิกงานนี้",
        reasonLabel: "เหตุผลการยกเลิก",
        reasonPlaceholder: "เช่น พนักงานเลื่อนวันเริ่มงาน",
        defaultReason: "ยกเลิก Onboarding Task",
        confirmLabel: "ยืนยันการยกเลิก",
        tone: "red",
      });

      if (reason === null) return;
      cancelReason = reason || "ยกเลิก Onboarding Task";
    }

    setSaving(true);
    setErrorMessage("");

    try {
      if (action === "start") {
        await startOnboardingTask(id);
      }

      if (action === "complete") {
        await completeOnboardingTask(id);
      }

      if (action === "cancel") {
        await cancelOnboardingTask(id, {
          cancelReason,
        });
      }

      await loadTasks();
    } catch (error) {
      console.error(error);
      showError(error, "ทำรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateDocument() {
    if (
      !documentDraft.companyId ||
      !documentDraft.employeeId ||
      !documentDraft.documentName.trim()
    ) {
      showMessage(
        "ข้อมูลไม่ครบ",
        "กรุณาเลือกบริษัท พนักงาน และกรอกชื่อเอกสาร",
        "orange",
      );
      return false;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createOnboardingDocument({
        companyId: documentDraft.companyId,
        employeeId: documentDraft.employeeId,
        taskId: documentDraft.taskId || undefined,
        documentName: documentDraft.documentName.trim(),
        description: documentDraft.description.trim() || undefined,
        isRequired: documentDraft.isRequired,
        note: documentDraft.note.trim() || undefined,
      });

      setDocumentDraft((prev) => ({
        ...prev,
        taskId: "",
        documentName: "",
        description: "",
        note: "",
      }));

      await loadDocuments();
      showMessage("ดำเนินการสำเร็จ", "สร้างรายการเอกสารสำเร็จ", "emerald");
      return true;
    } catch (error) {
      console.error(error);
      showError(error, "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDocumentAction(
    action: "submit" | "verify" | "reject" | "waive",
    id: string,
  ) {
    let rejectionReason = "";
    let waiveNote = "";

    if (action === "reject") {
      const reason = await requestDialogInput({
        title: "เอกสารไม่ผ่านการตรวจสอบ",
        description:
          "กรุณาระบุเหตุผลเพื่อให้ HR และพนักงานติดตามแก้ไขได้ถูกต้อง",
        reasonLabel: "เหตุผลที่เอกสารไม่ผ่าน",
        reasonPlaceholder: "เช่น สำเนาไม่ชัดเจน / เอกสารไม่ครบ",
        defaultReason: "เอกสารไม่ผ่านการตรวจสอบ",
        requireReason: true,
        confirmLabel: "ยืนยันไม่ผ่าน",
        tone: "red",
      });

      if (reason === null) return;
      rejectionReason = reason || "เอกสารไม่ผ่านการตรวจสอบ";
    }

    if (action === "waive") {
      const note = await requestDialogInput({
        title: "ยกเว้นเอกสาร",
        description: "กรุณาระบุเหตุผลการยกเว้นเอกสารเพื่อเก็บเป็นประวัติ",
        reasonLabel: "เหตุผลการยกเว้น",
        reasonPlaceholder: "เช่น ไม่จำเป็นสำหรับตำแหน่งนี้",
        defaultReason: "ยกเว้นเอกสาร",
        requireReason: true,
        confirmLabel: "ยืนยันยกเว้น",
        tone: "orange",
      });

      if (note === null) return;
      waiveNote = note || "ยกเว้นเอกสาร";
    }

    setSaving(true);
    setErrorMessage("");

    try {
      if (action === "submit") {
        await submitOnboardingDocument(id);
      }

      if (action === "verify") {
        await verifyOnboardingDocument(id);
      }

      if (action === "reject") {
        await rejectOnboardingDocument(id, {
          rejectionReason,
        });
      }

      if (action === "waive") {
        await waiveOnboardingDocument(id, {
          note: waiveNote,
        });
      }

      await loadDocuments();
    } catch (error) {
      console.error(error);
      showError(error, "ทำรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateProbation() {
    if (
      !probationDraft.companyId ||
      !probationDraft.employeeId ||
      !probationDraft.startDate ||
      !probationDraft.endDate
    ) {
      showMessage(
        "ข้อมูลไม่ครบ",
        "กรุณาเลือกบริษัท พนักงาน วันที่เริ่ม และวันที่สิ้นสุด",
        "orange",
      );
      return false;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createProbationRecord({
        companyId: probationDraft.companyId,
        employeeId: probationDraft.employeeId,
        startDate: probationDraft.startDate,
        endDate: probationDraft.endDate,
        reviewDate: probationDraft.reviewDate || undefined,
        summary: probationDraft.summary.trim() || undefined,
        recommendation: probationDraft.recommendation.trim() || undefined,
        note: probationDraft.note.trim() || undefined,
      });

      setProbationDraft((prev) => ({
        ...prev,
        employeeId: "",
        summary: "",
        recommendation: "",
        note: "",
      }));

      await loadProbations();
      showMessage("ดำเนินการสำเร็จ", "สร้างข้อมูลทดลองงานสำเร็จ", "emerald");
      return true;
    } catch (error) {
      console.error(error);
      showError(error, "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleProbationReview(id: string, status: ProbationStatus) {
    // ขยายทดลองงานต้องเลือกวันที่ จึงใช้โมดัลที่มีปฏิทินแทนกล่องกรอกข้อความ
    if (status === "EXTENDED") {
      const target = probations.find((item) => item.id === id);
      if (!target) return;

      setExtendTarget(target);
      setExtendDraft({
        extendedUntil: defaultExtendDate(target),
        summary: "",
      });

      return;
    }

    // ผ่าน/ไม่ผ่าน ใช้โมดัลที่ให้คะแนนตามแบบประเมินได้
    const target = probations.find((item) => item.id === id);
    if (!target) return;

    setReviewTarget({ record: target, status });
    setReviewDraft({
      formId: probationForms[0]?.id ?? "",
      summary: "",
      scores: {},
    });
  }

  async function handleSubmitReview() {
    if (!reviewTarget) return;

    const { record, status } = reviewTarget;
    const result = probationStatusText[status];
    const name = employeeName(record.employee);
    const form = probationForms.find((item) => item.id === reviewDraft.formId);

    // เลือกแบบประเมินแล้วต้องให้คะแนนครบทุกข้อที่บังคับ
    if (form) {
      const missing = form.questions.filter(
        (question) =>
          question.isRequired &&
          question.type === "SCORE" &&
          !reviewDraft.scores[question.id]?.trim(),
      );

      if (missing.length > 0) {
        showMessage(
          "ให้คะแนนไม่ครบ",
          `ยังไม่ได้ให้คะแนน: ${missing.map((item) => item.title).join(", ")}`,
          "orange",
        );
        return;
      }
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await reviewProbationRecord(record.id, {
        status,
        result,
        summary: reviewDraft.summary || undefined,
        evaluation: form
          ? {
              formId: form.id,
              scoreItems: form.questions.map((question) => ({
                questionId: question.id,
                score:
                  question.type === "SCORE"
                    ? Number(reviewDraft.scores[question.id] ?? 0)
                    : undefined,
                textValue:
                  question.type === "TEXT"
                    ? reviewDraft.scores[question.id] || undefined
                    : undefined,
              })),
            }
          : undefined,
      });

      setReviewTarget(null);
      await loadProbations();

      if (status === "PASSED") {
        showMessage(
          "ผ่านทดลองงานแล้ว",
          `${name} บรรจุเป็นพนักงานประจำเรียบร้อย สถานะในหน้าข้อมูลพนักงานเปลี่ยนเป็น "ใช้งาน" แล้ว`,
          "emerald",
        );
      } else {
        showMessage(
          "บันทึกผลสำเร็จ",
          `${name} — ผลทดลองงาน: ${result}`,
          status === "FAILED" ? "red" : "emerald",
        );
      }
    } catch (error) {
      console.error(error);
      showError(error, "ทำรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitExtend() {
    if (!extendTarget) return;

    if (!extendDraft.extendedUntil) {
      showMessage(
        "ยังไม่ได้เลือกวันที่",
        "กรุณาเลือกวันที่สิ้นสุดการขยายทดลองงาน",
        "orange",
      );
      return;
    }

    if (extendDraft.extendedUntil <= extendTarget.endDate.slice(0, 10)) {
      showMessage(
        "วันที่ไม่ถูกต้อง",
        `ต้องเลือกวันที่หลัง ${formatThaiDate(extendTarget.endDate)} ซึ่งเป็นวันครบกำหนดเดิม`,
        "orange",
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await reviewProbationRecord(extendTarget.id, {
        status: "EXTENDED",
        extendedUntil: extendDraft.extendedUntil,
        result: "ขยายทดลองงาน",
        summary: extendDraft.summary || undefined,
      });

      setExtendTarget(null);
      await loadProbations();
      showMessage(
        "ขยายทดลองงานสำเร็จ",
        `ขยายถึง ${formatThaiDate(extendDraft.extendedUntil)}`,
        "emerald",
      );
    } catch (error) {
      console.error(error);
      showError(error, "ขยายทดลองงานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  // ทดลองงานที่ใกล้ครบกำหนดต้องรีวิวก่อนครบ 120 วัน ไม่งั้นกลายเป็นพนักงานประจำอัตโนมัติ
  // backend ส่ง dueSoon/overdue มาให้แล้ว (ใช้ที่ StatTile บนหัวเรื่อง) ส่วนรายชื่อ
  // ในแถบเตือนนี้คำนวณจากรายการที่โหลดมา
  const dueProbations = probations.filter((item) => {
    if (item.status !== "IN_PROGRESS") return false;
    const left = probationDaysLeft(item.endDate);
    return left !== null && left <= 30;
  });

  const checklistColumns: Array<Column<OnboardingChecklist>> = [
    {
      key: "name",
      header: "รหัส / ชื่อเช็กลิสต์",
      cell: (item) => (
        <CellStack
          primary={item.name}
          secondary={`${item.code}${item.description ? ` · ${item.description}` : ""}`}
        />
      ),
    },
    {
      key: "items",
      header: "รายการในเช็กลิสต์",
      cell: (item) => (
        <div className="flex flex-wrap gap-1">
          {item.items.slice(0, 4).map((entry) => (
            <Badge key={entry.id} tone="neutral">
              {entry.title}
            </Badge>
          ))}
          {item.items.length > 4 ? (
            <Badge tone="neutral">+{item.items.length - 4}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "required",
      header: "บังคับ",
      hideBelow: "lg",
      cell: (item) =>
        `${item.items.filter((entry) => entry.isRequired).length.toLocaleString("th-TH")} / ${item.items.length.toLocaleString("th-TH")}`,
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <Badge tone={checklistStatusTone(item.status)}>
          {masterStatusText[item.status]}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "สร้างเมื่อ",
      hideBelow: "xl",
      cell: (item) => formatThaiDate(item.createdAt),
    },
  ];

  const taskColumns: Array<Column<OnboardingTask>> = [
    {
      key: "title",
      header: "งาน",
      cell: (item) => (
        <CellStack primary={item.title} secondary={item.description ?? undefined} />
      ),
    },
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => employeeName(item.employee),
    },
    {
      key: "category",
      header: "หมวด",
      hideBelow: "lg",
      cell: (item) =>
        item.category || <span className="text-slate-300">-</span>,
    },
    {
      key: "dueDate",
      header: "กำหนดเสร็จ",
      hideBelow: "lg",
      cell: (item) =>
        item.dueDate ? (
          <>
            {formatThaiDate(item.dueDate)}
            {taskOverdueDays(item) !== null ? (
              <p className="mt-0.5 text-[11px] font-bold text-rose-600">
                เลยกำหนด {taskOverdueDays(item)} วัน
              </p>
            ) : null}
          </>
        ) : (
          <span className="text-slate-300">ไม่กำหนด</span>
        ),
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <Badge tone={taskStatusTone(item.status)}>
          {taskStatusText[item.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      cell: (item) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          {item.status === "PENDING" ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void handleTaskAction("start", item.id)}
            >
              เริ่มงาน
            </Button>
          ) : null}

          {item.status === "PENDING" || item.status === "IN_PROGRESS" ? (
            <>
              <Button
                size="sm"
                variant="primary"
                disabled={saving}
                onClick={() => void handleTaskAction("complete", item.id)}
              >
                เสร็จแล้ว
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={saving}
                onClick={() => void handleTaskAction("cancel", item.id)}
              >
                ยกเลิก
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  const documentColumns: Array<Column<OnboardingDocument>> = [
    {
      key: "name",
      header: "เอกสาร",
      cell: (item) => (
        <CellStack
          primary={item.documentName}
          secondary={
            item.rejectionReason
              ? `เหตุผลที่ตีกลับ: ${item.rejectionReason}`
              : (item.description ?? undefined)
          }
        />
      ),
    },
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => employeeName(item.employee),
    },
    {
      key: "required",
      header: "บังคับส่ง",
      hideBelow: "lg",
      cell: (item) =>
        item.isRequired ? (
          <span className="text-rose-700">บังคับ</span>
        ) : (
          <span className="text-slate-300">ไม่บังคับ</span>
        ),
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <Badge tone={documentStatusTone(item.status)}>
          {documentStatusText[item.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      cell: (item) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          {item.status === "PENDING" || item.status === "REJECTED" ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void handleDocumentAction("submit", item.id)}
            >
              บันทึกว่าส่งแล้ว
            </Button>
          ) : null}

          {item.status === "SUBMITTED" ? (
            <>
              <Button
                size="sm"
                variant="primary"
                disabled={saving}
                onClick={() => void handleDocumentAction("verify", item.id)}
              >
                ตรวจผ่าน
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={saving}
                onClick={() => void handleDocumentAction("reject", item.id)}
              >
                ตีกลับ
              </Button>
            </>
          ) : null}

          {item.status !== "VERIFIED" && item.status !== "WAIVED" ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void handleDocumentAction("waive", item.id)}
            >
              ยกเว้น
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const probationColumns: Array<Column<ProbationRecord>> = [
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => (
        <CellStack
          primary={employeeName(item.employee)}
          secondary={item.summary ?? undefined}
        />
      ),
    },
    {
      key: "period",
      header: "ช่วงทดลองงาน",
      cell: (item) => (
        <>
          {formatThaiDate(item.startDate)} – {formatThaiDate(item.endDate)}
          {item.extendedUntil ? (
            <p className="mt-0.5 text-[11px] text-brand-700">
              ขยายถึง {formatThaiDate(item.extendedUntil)}
            </p>
          ) : null}
        </>
      ),
    },
    {
      key: "left",
      header: "เหลืออีก",
      cell: (item) => {
        const left = probationDaysLeft(item.endDate);
        const open = item.status === "IN_PROGRESS";

        if (!open || left === null) return <span className="text-slate-300">-</span>;

        return (
          <Badge tone={daysLeftTone(left)}>
            {left < 0
              ? `เลยกำหนด ${Math.abs(left)} วัน`
              : `${left.toLocaleString("th-TH")} วัน`}
          </Badge>
        );
      },
    },
    {
      key: "reviewDate",
      header: "นัดรีวิว",
      hideBelow: "lg",
      cell: (item) =>
        item.reviewDate ? (
          formatThaiDate(item.reviewDate)
        ) : (
          <span className="text-slate-300">ยังไม่นัด</span>
        ),
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <>
          <Badge tone={probationStatusTone(item.status)}>
            {probationStatusText[item.status]}
          </Badge>
          {item.reviewedAt ? (
            <p className="mt-0.5 text-[11px] text-slate-400">
              รีวิว {formatThaiDateTime(item.reviewedAt)}
            </p>
          ) : null}
          {item.evaluationResults?.[0] ? (
            <p className="mt-0.5 text-[11px] font-bold text-brand-700">
              คะแนน {Number(item.evaluationResults[0].percent ?? 0).toFixed(1)}%
              · {item.evaluationResults[0].form?.name ?? "-"}
            </p>
          ) : null}
        </>
      ),
    },
    {
      key: "actions",
      header: "บันทึกผล",
      align: "right",
      cell: (item) =>
        item.status === "IN_PROGRESS" ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              size="sm"
              variant="primary"
              disabled={saving}
              onClick={() => void handleProbationReview(item.id, "PASSED")}
            >
              ผ่าน
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={saving}
              onClick={() => void handleProbationReview(item.id, "FAILED")}
            >
              ไม่ผ่าน
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void handleProbationReview(item.id, "EXTENDED")}
            >
              ขยายเวลา
            </Button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">รีวิวแล้ว</span>
        ),
    },
  ];

  const tableLoading = loading;

  return (
    <>
      {dueProbations.length > 0 ? (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="critical">
            <span className="font-bold">
              ต้องรีวิวทดลองงานภายใน 30 วัน:
            </span>{" "}
            {dueProbations
              .map((item) => {
                const left = probationDaysLeft(item.endDate);
                return `${employeeName(item.employee)} (เหลือ ${left} วัน)`;
              })
              .join(" · ")}{" "}
            — กฎหมายกำหนดให้แจ้งผลก่อนครบ 120 วัน
          </Notice>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-end sm:px-6">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="ค้นหา" className="xl:col-span-2">
            <SearchInput
              value={activeSearch}
              onChange={(event) => {
                const value = event.target.value;
                if (activeTab === "checklists") setChecklistSearch(value);
                else if (activeTab === "tasks") setTaskSearch(value);
                else if (activeTab === "documents") setDocumentSearch(value);
                else setProbationSearch(value);
              }}
              placeholder="ค้นหา"
              aria-label="ค้นหา"
            />
          </Field>

          {activeTab === "checklists" ? (
            <Field label="สถานะ">
              <Select
                value={checklistStatusFilter}
                onChange={(event) => {
                  const value = event.target.value as MasterStatus | "ALL";
                  setChecklistStatusFilter(value);
                  void loadChecklists(value);
                }}
              >
                <option value="ALL">ทุกสถานะ</option>
                <option value="ACTIVE">เปิดใช้งาน</option>
                <option value="INACTIVE">ปิดใช้งาน</option>
              </Select>
            </Field>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void reloadAll()}
            disabled={loading}
            icon={<RefreshCcw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />}
          >
            รีเฟรช
          </Button>

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreateOpen(true)}
          >
            {activeTab === "checklists"
              ? "สร้างเช็กลิสต์"
              : activeTab === "tasks"
                ? "มอบหมายงาน"
                : activeTab === "documents"
                  ? "เพิ่มรายการเอกสาร"
                  : "เริ่มทดลองงาน"}
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="critical">{errorMessage}</Notice>
        </div>
      ) : null}

      {activeTab === "checklists" ? (
        <DataTable
          columns={checklistColumns}
          rows={checklists}
          rowKey={(item) => item.id}
          loading={tableLoading}
          emptyTitle="ยังไม่มีเช็กลิสต์ต้อนรับ"
        />
      ) : activeTab === "tasks" ? (
        <DataTable
          columns={taskColumns}
          rows={tasks}
          rowKey={(item) => item.id}
          loading={tableLoading}
          emptyTitle="ยังไม่มีงานต้อนรับพนักงานใหม่"
        />
      ) : activeTab === "documents" ? (
        <DataTable
          columns={documentColumns}
          rows={documents}
          rowKey={(item) => item.id}
          loading={tableLoading}
          emptyTitle="ยังไม่มีรายการเอกสารพนักงานใหม่"
        />
      ) : (
        <DataTable
          columns={probationColumns}
          rows={probations}
          rowKey={(item) => item.id}
          loading={tableLoading}
          emptyTitle="ยังไม่มีข้อมูลทดลองงาน"
        />
      )}

      {createOpen ? (
        <Modal
          open
          title={
            activeTab === "checklists"
              ? "สร้างเช็กลิสต์ต้อนรับ"
              : activeTab === "tasks"
                ? "มอบหมายงานให้พนักงานใหม่"
                : activeTab === "documents"
                  ? "เพิ่มรายการเอกสารที่ต้องส่ง"
                  : "เริ่มบันทึกทดลองงาน"
          }
          description={
            activeTab === "probations"
              ? "ค่าเริ่มต้นตั้งไว้ 119 วัน และนัดรีวิวล่วงหน้า เพื่อให้แจ้งผลทันก่อนครบ 120 วัน"
              : undefined
          }
          onClose={() => setCreateOpen(false)}
        >
          {activeTab === "checklists" ? (
            <ChecklistForm
              draft={checklistDraft}
              companies={companies}
              saving={saving}
              onChange={setChecklistDraft}
              onAddItem={addChecklistItem}
              onUpdateItem={updateChecklistItem}
              onRemoveItem={removeChecklistItem}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async () => {
                if (await handleCreateChecklist()) setCreateOpen(false);
              }}
            />
          ) : activeTab === "tasks" ? (
            <TaskForm
              draft={taskDraft}
              companies={companies}
              employees={employeesForCompany(taskDraft.companyId)}
              checklists={checklists}
              activeChecklist={activeChecklist}
              saving={saving}
              onChange={setTaskDraft}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async () => {
                if (await handleCreateTask()) setCreateOpen(false);
              }}
            />
          ) : activeTab === "documents" ? (
            <DocumentForm
              draft={documentDraft}
              companies={companies}
              employees={employeesForCompany(documentDraft.companyId)}
              tasks={tasks}
              saving={saving}
              onChange={setDocumentDraft}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async () => {
                if (await handleCreateDocument()) setCreateOpen(false);
              }}
            />
          ) : (
            <ProbationForm
              draft={probationDraft}
              companies={companies}
              employees={employeesForProbation(probationDraft.companyId)}
              saving={saving}
              onChange={setProbationDraft}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async () => {
                if (await handleCreateProbation()) setCreateOpen(false);
              }}
            />
          )}
        </Modal>
      ) : null}

      {reviewTarget ? (
        <Modal
          open
          title={`บันทึกผลทดลองงาน: ${probationStatusText[reviewTarget.status]}`}
          description={`${employeeName(reviewTarget.record.employee)}${
            reviewTarget.status === "PASSED"
              ? " · บันทึกแล้วจะบรรจุเป็นพนักงานประจำทันที"
              : ""
          }`}
          onClose={() => setReviewTarget(null)}
        >
          <ProbationReviewForm
            draft={reviewDraft}
            forms={probationForms}
            status={reviewTarget.status}
            saving={saving}
            onChange={setReviewDraft}
            onCancel={() => setReviewTarget(null)}
            onSubmit={() => void handleSubmitReview()}
          />
        </Modal>
      ) : null}

      {extendTarget ? (
        <Modal
          open
          title="ขยายทดลองงาน"
          description={`${employeeName(extendTarget.employee)} · ครบกำหนดเดิม ${formatThaiDate(
            extendTarget.extendedUntil ?? extendTarget.endDate,
          )}`}
          onClose={() => setExtendTarget(null)}
        >
          <div className="grid gap-4">
            <Field label="ขยายทดลองงานถึงวันที่">
              <ThaiDateInput
                value={extendDraft.extendedUntil}
                min={extendTarget.endDate.slice(0, 10)}
                onChange={(event) =>
                  setExtendDraft((prev) => ({
                    ...prev,
                    extendedUntil: event.target.value,
                  }))
                }
              />
              {extendDraft.extendedUntil ? (
                <p className="mt-1.5 text-xs text-slate-500">
                  รวมทดลองงานทั้งหมด{" "}
                  <span className="font-bold text-slate-700">
                    {totalProbationDays(
                      extendTarget.startDate,
                      extendDraft.extendedUntil,
                    ).toLocaleString("th-TH")}{" "}
                    วัน
                  </span>
                  {totalProbationDays(
                    extendTarget.startDate,
                    extendDraft.extendedUntil,
                  ) > 120 ? (
                    <span className="ml-1 font-bold text-rose-600">
                      — เกิน 120 วัน ต้องจ่ายค่าชดเชยหากเลิกจ้างภายหลัง
                    </span>
                  ) : null}
                </p>
              ) : null}
            </Field>

            <Field label="เหตุผล / สรุปผล (ไม่บังคับ)">
              <Textarea
                rows={3}
                value={extendDraft.summary}
                placeholder="เช่น ผลงานยังไม่ชัดเจน ขอประเมินเพิ่มอีก 1 เดือน"
                onChange={(event) =>
                  setExtendDraft((prev) => ({
                    ...prev,
                    summary: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <ModalActions
                onCancel={() => setExtendTarget(null)}
                onConfirm={() => void handleSubmitExtend()}
                confirmLabel="บันทึกการขยาย"
                loading={saving}
              />
            </div>
          </div>
        </Modal>
      ) : null}

      <ActionDialog
        state={actionDialog}
        loading={saving}
        onClose={closeActionDialog}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shared small pieces                                                 */
/* ------------------------------------------------------------------ */

function CompanySelect({
  value,
  companies,
  onChange,
}: {
  value: string;
  companies: CompanyOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label="บริษัท">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">เลือกบริษัท</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.nameTh ?? company.name ?? company.code}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function EmployeeSelect({
  value,
  employees,
  onChange,
}: {
  value: string;
  employees: EmployeeOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label="พนักงาน">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">เลือกพนักงาน</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.employeeCode} · {employeeName(employee)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

function ChecklistForm({
  draft,
  companies,
  saving,
  onChange,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onCancel,
  onSubmit,
}: {
  draft: ChecklistDraft;
  companies: CompanyOption[];
  saving: boolean;
  onChange: Dispatch<SetStateAction<ChecklistDraft>>;
  onAddItem: () => void;
  onUpdateItem: (
    index: number,
    key: keyof ChecklistDraft["items"][number],
    value: string | number | boolean,
  ) => void;
  onRemoveItem: (index: number) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGrid columns={2}>
        <CompanySelect
          value={draft.companyId}
          companies={companies}
          onChange={(value) =>
            onChange((prev) => ({ ...prev, companyId: value }))
          }
        />

        <Field label="สถานะ">
          <Select
            value={draft.status}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                status: event.target.value as MasterStatus,
              }))
            }
          >
            <option value="ACTIVE">เปิดใช้งาน</option>
            <option value="INACTIVE">ปิดใช้งาน</option>
          </Select>
        </Field>

        <Field label="รหัสเช็กลิสต์" required>
          <TextInput
            value={draft.code}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, code: event.target.value }))
            }
            placeholder="เช่น ONB_OFFICE"
          />
        </Field>

        <Field label="ชื่อเช็กลิสต์" required>
          <TextInput
            value={draft.name}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="เช่น ต้อนรับพนักงานออฟฟิศ"
          />
        </Field>
      </FieldGrid>

      <Field label="คำอธิบาย">
        <Textarea
          value={draft.description}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, description: event.target.value }))
          }
          rows={2}
        />
      </Field>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
              <ClipboardList className="h-4 w-4 text-slate-400" />
              รายการในเช็กลิสต์
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              เรียงตามลำดับที่ต้องทำ · ติ๊ก &quot;บังคับ&quot;
              ถ้าข้ามไม่ได้
            </p>
          </div>
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={onAddItem}>
            เพิ่มรายการ
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {draft.items.map((item, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_160px_auto]"
            >
              <TextInput
                value={item.title}
                onChange={(event) =>
                  onUpdateItem(index, "title", event.target.value)
                }
                placeholder="ชื่อรายการ"
              />
              <TextInput
                value={item.category}
                onChange={(event) =>
                  onUpdateItem(index, "category", event.target.value)
                }
                placeholder="หมวด"
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  label="บังคับ"
                  checked={item.isRequired}
                  onChange={(event) =>
                    onUpdateItem(index, "isRequired", event.target.checked)
                  }
                />
                <Button
                  size="sm"
                  variant="danger"
                  aria-label="ลบรายการ"
                  onClick={() => onRemoveItem(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <ModalActions
          onCancel={onCancel}
          onConfirm={onSubmit}
          confirmLabel="สร้างเช็กลิสต์"
          loading={saving}
        />
      </div>
    </div>
  );
}

function TaskForm({
  draft,
  companies,
  employees,
  checklists,
  activeChecklist,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: TaskDraft;
  companies: CompanyOption[];
  employees: EmployeeOption[];
  checklists: OnboardingChecklist[];
  activeChecklist: OnboardingChecklist | null;
  saving: boolean;
  onChange: Dispatch<SetStateAction<TaskDraft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGrid columns={2}>
        <CompanySelect
          value={draft.companyId}
          companies={companies}
          onChange={(value) =>
            onChange((prev) => ({ ...prev, companyId: value, employeeId: "" }))
          }
        />

        <EmployeeSelect
          value={draft.employeeId}
          employees={employees}
          onChange={(value) =>
            onChange((prev) => ({ ...prev, employeeId: value }))
          }
        />

        <Field label="ใช้เช็กลิสต์">
          <Select
            value={draft.checklistId}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                checklistId: event.target.value,
                checklistItemId: "",
              }))
            }
          >
            <option value="">ไม่ใช้เช็กลิสต์</option>
            {checklists.map((checklist) => (
              <option key={checklist.id} value={checklist.id}>
                {checklist.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="รายการจากเช็กลิสต์">
          <Select
            value={draft.checklistItemId}
            onChange={(event) => {
              const item = activeChecklist?.items.find(
                (entry) => entry.id === event.target.value,
              );

              onChange((prev) => ({
                ...prev,
                checklistItemId: event.target.value,
                title: item?.title ?? prev.title,
                description: item?.description ?? prev.description,
                category: item?.category ?? prev.category,
              }));
            }}
            disabled={!activeChecklist}
          >
            <option value="">เลือกรายการ (จะเติมชื่องานให้)</option>
            {activeChecklist?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ชื่องาน" required>
          <TextInput
            value={draft.title}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, title: event.target.value }))
            }
          />
        </Field>

        <Field label="หมวด">
          <TextInput
            value={draft.category}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, category: event.target.value }))
            }
          />
        </Field>

        <Field label="กำหนดเสร็จ">
          <ThaiDateInput
            value={draft.dueDate}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, dueDate: event.target.value }))
            }
          />
        </Field>
      </FieldGrid>

      <Field label="รายละเอียด">
        <Textarea
          value={draft.description}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, description: event.target.value }))
          }
          rows={3}
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <ModalActions
          onCancel={onCancel}
          onConfirm={onSubmit}
          confirmLabel="มอบหมายงาน"
          loading={saving}
        />
      </div>
    </div>
  );
}

function DocumentForm({
  draft,
  companies,
  employees,
  tasks,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: DocumentDraft;
  companies: CompanyOption[];
  employees: EmployeeOption[];
  tasks: OnboardingTask[];
  saving: boolean;
  onChange: Dispatch<SetStateAction<DocumentDraft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGrid columns={2}>
        <CompanySelect
          value={draft.companyId}
          companies={companies}
          onChange={(value) =>
            onChange((prev) => ({ ...prev, companyId: value, employeeId: "" }))
          }
        />

        <EmployeeSelect
          value={draft.employeeId}
          employees={employees}
          onChange={(value) =>
            onChange((prev) => ({ ...prev, employeeId: value }))
          }
        />

        <Field label="ชื่อเอกสาร" required>
          <TextInput
            value={draft.documentName}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                documentName: event.target.value,
              }))
            }
            placeholder="เช่น สำเนาบัตรประชาชน"
          />
        </Field>

        <Field label="ผูกกับงาน (ถ้ามี)">
          <Select
            value={draft.taskId}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, taskId: event.target.value }))
            }
          >
            <option value="">ไม่ผูกกับงาน</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </Select>
        </Field>
      </FieldGrid>

      <Field label="คำอธิบาย">
        <Textarea
          value={draft.description}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, description: event.target.value }))
          }
          rows={2}
        />
      </Field>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <Checkbox
          label="เอกสารบังคับ"
          hint="ถ้าไม่บังคับ จะข้ามได้โดยไม่ต้องยกเว้น"
          checked={draft.isRequired}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, isRequired: event.target.checked }))
          }
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <ModalActions
          onCancel={onCancel}
          onConfirm={onSubmit}
          confirmLabel="เพิ่มรายการเอกสาร"
          loading={saving}
        />
      </div>
    </div>
  );
}

function ProbationReviewForm({
  draft,
  forms,
  status,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: { formId: string; summary: string; scores: Record<string, string> };
  forms: EvaluationForm[];
  status: ProbationStatus;
  saving: boolean;
  onChange: Dispatch<SetStateAction<typeof draft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const form = forms.find((item) => item.id === draft.formId);

  // คิดคะแนนสดขณะให้คะแนน ใช้สูตรถ่วงน้ำหนักเดียวกับหลังบ้าน
  const score = useMemo(() => {
    if (!form) return null;

    let total = 0;
    let max = 0;

    form.questions.forEach((question) => {
      const weight = Number(question.weight) || 1;
      const questionMax = Number(question.maxScore) || 0;

      max += questionMax * weight;

      if (question.type === "SCORE") {
        total += (Number(draft.scores[question.id]) || 0) * weight;
      }
    });

    const percent = max > 0 ? (total / max) * 100 : 0;
    const passScore = Number(form.passScore ?? 0);
    const formTotal = Number(form.totalScore ?? 0);

    // เกณฑ์ผ่านเทียบเป็นเปอร์เซ็นต์ของคะแนนเต็มที่ตั้งไว้ในแบบประเมิน
    const passPercent = formTotal > 0 ? (passScore / formTotal) * 100 : 0;

    return {
      total,
      max,
      percent,
      passPercent,
      passed: percent >= passPercent,
    };
  }, [form, draft.scores]);

  return (
    <div className="space-y-4">
      <Field label="แบบประเมิน">
        <Select
          value={draft.formId}
          onChange={(event) =>
            onChange((prev) => ({
              ...prev,
              formId: event.target.value,
              scores: {},
            }))
          }
        >
          <option value="">ไม่ใช้แบบประเมิน (บันทึกสรุปอย่างเดียว)</option>
          {forms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.name}
            </option>
          ))}
        </Select>
        {forms.length === 0 ? (
          <p className="mt-1.5 text-xs text-amber-700">
            ยังไม่มีแบบประเมินที่ตั้งรอบเป็น &quot;ทดลองงาน&quot; —
            สร้างได้ที่หน้าประเมินผล
          </p>
        ) : null}
      </Field>

      {form ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-2.5">
            {form.questions.map((question) => (
              <div
                key={question.id}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="min-w-0 flex-1 text-[13px] font-medium text-slate-800">
                  {question.title}
                  {question.isRequired ? (
                    <span className="text-rose-500"> *</span>
                  ) : null}
                </span>

                {question.type === "SCORE" ? (
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      type="number"
                      min={0}
                      max={Number(question.maxScore)}
                      value={draft.scores[question.id] ?? ""}
                      onChange={(event) =>
                        onChange((prev) => ({
                          ...prev,
                          scores: {
                            ...prev.scores,
                            [question.id]: event.target.value,
                          },
                        }))
                      }
                      className="w-20 text-center"
                    />
                    <span className="text-xs font-semibold text-slate-500">
                      / {Number(question.maxScore).toLocaleString("th-TH")}
                    </span>
                  </div>
                ) : (
                  <TextInput
                    value={draft.scores[question.id] ?? ""}
                    onChange={(event) =>
                      onChange((prev) => ({
                        ...prev,
                        scores: {
                          ...prev.scores,
                          [question.id]: event.target.value,
                        },
                      }))
                    }
                    placeholder="ความคิดเห็น"
                    className="w-56"
                  />
                )}
              </div>
            ))}
          </div>

          {score ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
              <span className="text-[13px] font-bold text-slate-800">
                รวม {score.total.toLocaleString("th-TH")} /{" "}
                {score.max.toLocaleString("th-TH")} ={" "}
                {score.percent.toFixed(1)}%
                <span className="ml-2 text-xs font-medium text-slate-500">
                  เกณฑ์ผ่าน {score.passPercent.toFixed(0)}%
                </span>
              </span>

              <Badge tone={score.passed ? "positive" : "critical"}>
                คะแนนนี้ {score.passed ? "ผ่านเกณฑ์" : "ต่ำกว่าเกณฑ์"}
              </Badge>
            </div>
          ) : null}

          {score && score.passed !== (status === "PASSED") ? (
            <p className="mt-2 text-xs font-bold text-amber-700">
              คะแนนไม่ตรงกับผลที่กำลังจะบันทึก (
              {probationStatusText[status]}) — ยืนยันได้ถ้าตั้งใจ
            </p>
          ) : null}
        </div>
      ) : null}

      <Field label="สรุปผลทดลองงาน">
        <Textarea
          rows={3}
          value={draft.summary}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, summary: event.target.value }))
          }
          placeholder="เช่น ผ่านเกณฑ์ตามที่กำหนด ปรับตัวเข้ากับทีมได้ดี"
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <ModalActions
          onCancel={onCancel}
          onConfirm={onSubmit}
          confirmLabel="บันทึกผล"
          loading={saving}
        />
      </div>
    </div>
  );
}

function ProbationForm({
  draft,
  companies,
  employees,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: ProbationDraft;
  companies: CompanyOption[];
  employees: EmployeeOption[];
  saving: boolean;
  onChange: Dispatch<SetStateAction<ProbationDraft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const derivedDays = totalProbationDays(draft.startDate, draft.endDate);

  // เก็บค่าที่พิมพ์แยกไว้ เพื่อให้ลบตัวเลขจนว่างระหว่างพิมพ์ได้โดยวันที่ไม่กระตุก
  const [daysInput, setDaysInput] = useState(String(derivedDays));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์ช่องจำนวนวันเมื่อวันที่เริ่ม/สิ้นสุดเปลี่ยนจากที่อื่น (เช่นเลือกพนักงานใหม่)
    setDaysInput(String(derivedDays));
  }, [derivedDays]);

  /** พิมพ์จำนวนวัน -> คำนวณวันครบกำหนดและวันนัดรีวิวให้อัตโนมัติ */
  function applyDays(raw: string) {
    setDaysInput(raw);

    const days = Number(raw);
    if (!raw.trim() || !Number.isInteger(days) || days < 1) return;

    onChange((prev) => ({
      ...prev,
      endDate: shiftIsoDate(prev.startDate, days),
      reviewDate: shiftIsoDate(
        prev.startDate,
        Math.max(1, days - PROBATION_REVIEW_LEAD_DAYS),
      ),
    }));
  }

  const selectedEmployee = employees.find(
    (employee) => employee.id === draft.employeeId,
  );

  /** เลือกพนักงาน -> ดึงวันเริ่มงานจริงมาตั้งเป็นวันเริ่มทดลองงาน */
  function selectEmployee(employeeId: string) {
    const employee = employees.find((item) => item.id === employeeId);
    const nextStart = employee?.startDate?.slice(0, 10);

    if (!nextStart) {
      onChange((prev) => ({ ...prev, employeeId }));
      return;
    }

    onChange((prev) => {
      const days = totalProbationDays(prev.startDate, prev.endDate) || 119;

      return {
        ...prev,
        employeeId,
        startDate: nextStart,
        endDate: shiftIsoDate(nextStart, days),
        reviewDate: shiftIsoDate(
          nextStart,
          Math.max(1, days - PROBATION_REVIEW_LEAD_DAYS),
        ),
      };
    });
  }

  /** เปลี่ยนวันเริ่มงาน -> เลื่อนวันครบกำหนด/นัดรีวิวตาม โดยคงจำนวนวันเดิม */
  function applyStartDate(nextStart: string) {
    onChange((prev) => {
      if (!nextStart) return { ...prev, startDate: nextStart };

      const days = totalProbationDays(prev.startDate, prev.endDate) || 119;

      return {
        ...prev,
        startDate: nextStart,
        endDate: shiftIsoDate(nextStart, days),
        reviewDate: shiftIsoDate(
          nextStart,
          Math.max(1, days - PROBATION_REVIEW_LEAD_DAYS),
        ),
      };
    });
  }

  return (
    <div className="space-y-4">
      <FieldGrid columns={2}>
        <CompanySelect
          value={draft.companyId}
          companies={companies}
          onChange={(value) =>
            onChange((prev) => ({ ...prev, companyId: value, employeeId: "" }))
          }
        />

        <EmployeeSelect
          value={draft.employeeId}
          employees={employees}
          onChange={selectEmployee}
        />

        <Field label="เริ่มทดลองงาน" required>
          <ThaiDateInput
            value={draft.startDate}
            onChange={(event) => applyStartDate(event.target.value)}
          />
          {selectedEmployee?.startDate ? (
            <p className="mt-1.5 text-xs text-slate-500">
              วันเริ่มงานตามข้อมูลพนักงาน{" "}
              {formatThaiDate(selectedEmployee.startDate)}
            </p>
          ) : null}
        </Field>

        <Field label="จำนวนวันทดลองงาน" required>
          <div className="relative">
            <TextInput
              type="number"
              min={1}
              max={365}
              value={daysInput}
              onChange={(event) => applyDays(event.target.value)}
              className="pr-12"
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-slate-400">
              วัน
            </span>
          </div>

          {derivedDays > 120 ? (
            <p className="mt-1.5 text-xs font-bold text-rose-600">
              เกิน 120 วัน — หากเลิกจ้างภายหลังต้องจ่ายค่าชดเชยตามกฎหมาย
            </p>
          ) : null}
        </Field>

        <Field label="ครบกำหนด" required>
          <ThaiDateInput
            value={draft.endDate}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, endDate: event.target.value }))
            }
          />
        </Field>

        <Field label="นัดรีวิว">
          <ThaiDateInput
            value={draft.reviewDate}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, reviewDate: event.target.value }))
            }
          />
        </Field>
      </FieldGrid>

      <Field label="สรุปเบื้องต้น">
        <Textarea
          value={draft.summary}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, summary: event.target.value }))
          }
          rows={2}
        />
      </Field>

      <Field label="ข้อเสนอแนะ">
        <Textarea
          value={draft.recommendation}
          onChange={(event) =>
            onChange((prev) => ({
              ...prev,
              recommendation: event.target.value,
            }))
          }
          rows={2}
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <ModalActions
          onCancel={onCancel}
          onConfirm={onSubmit}
          confirmLabel="บันทึกทดลองงาน"
          loading={saving}
        />
      </div>
    </div>
  );
}
