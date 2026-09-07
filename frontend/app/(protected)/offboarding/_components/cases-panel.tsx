"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  KeyRound,
  MessageSquareQuote,
  Plus,
  RefreshCcw,
  ShieldOff,
  Calculator,
  Send,
  Wallet,
} from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  EmployeePicker,
  pickerEmployeeName,
  type PickerEmployee,
} from "@/components/common/employee-picker";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate, formatThaiDateTime } from "@/lib/date-format";

import {
  actOnOffboardingTask,
  apiFetch,
  calculateOffboardingSeverance,
  cancelOffboardingCase,
  completeOffboardingCase,
  createOffboardingCase,
  createOffboardingTask,
  getOffboardingCase,
  getOffboardingCases,
  getOffboardingChecklists,
  notifyOffboardingSocialSecurity,
  revokeOffboardingAccess,
  saveExitInterview,
  sendOffboardingFinalPayToPayroll,
  stopOffboardingPayroll,
  updateOffboardingCase,
} from "@/lib/api";

import type {
  OffboardingCase,
  OffboardingCaseListSummary,
  OffboardingChecklist,
  OffboardingReasonType,
  OffboardingTask,
  OffboardingTaskStatus,
} from "@/types/offboarding";

import {
  Badge,
  Button,
  CellStack,
  Checkbox,
  DataTable,
  Field,
  Modal,
  MoneyInput,
  Notice,
  RowMenu,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  joinClassName,
  type Column,
  type Tone,
} from "@/components/kit";

/**
 * แท็บ "พนักงานที่กำลังออก"
 * ------------------------
 * เปิดเคสแล้วระบบกางรายการเคลียร์ของจากเช็กลิสต์มาตรฐานให้อัตโนมัติ
 * ตรรกะทั้งหมด (การตรวจวันที่ การหาพนักงานที่เลือกได้ ขั้นตอนปิดสิทธิ์/หยุดจ่าย/
 * แจ้ง สปส. เงินงวดสุดท้าย สัมภาษณ์ลาออก) ยกมาจากหน้าเดิมทั้งชุด เปลี่ยนเฉพาะเปลือก
 */

type CompanyOption = {
  id: string;
  code?: string;
  nameTh?: string;
  name?: string;
};

type CompanyListResponse = { items?: CompanyOption[]; data?: CompanyOption[] };

type OrgOption = {
  id: string;
  code?: string;
  nameTh?: string;
  name?: string;
  branchId?: string | null;
};

const emptySummary: OffboardingCaseListSummary = {
  total: 0,
  inProgress: 0,
  completed: 0,
  cancelled: 0,
  accessPending: 0,
};

const reasonText: Record<OffboardingReasonType, string> = {
  RESIGNATION: "ลาออก",
  TERMINATION: "เลิกจ้าง",
  END_OF_CONTRACT: "สิ้นสุดสัญญา",
  RETIREMENT: "เกษียณ",
  LAYOFF: "เลิกจ้างตามนโยบาย",
  OTHER: "อื่น ๆ",
};

const caseStatusText = {
  IN_PROGRESS: "กำลังดำเนินการ",
  COMPLETED: "ปิดเคสแล้ว",
  CANCELLED: "ยกเลิก",
} as const;

const taskStatusText: Record<OffboardingTaskStatus, string> = {
  PENDING: "รอดำเนินการ",
  IN_PROGRESS: "กำลังทำ",
  COMPLETED: "เรียบร้อย",
  WAIVED: "ยกเว้น",
  CANCELLED: "ยกเลิก",
};

function todayDate() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function employeeName(employee?: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  if (!employee) return "-";

  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    "-"
  );
}

/** วันที่เหลือก่อนพ้นสภาพ ติดลบ = เลยกำหนดแล้ว */
function daysUntil(date?: string | null) {
  if (!date) return null;

  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * วันลาที่ต้องจ่ายคืนตอนออก
 * ------------------------
 * ตาม พ.ร.บ.คุ้มครองแรงงาน ม.67 วันหยุดพักผ่อนประจำปีที่ยังไม่ได้ใช้
 * นายจ้างต้องจ่ายเป็นเงิน ส่วนลาป่วย/ลากิจไม่ต้องจ่ายคืน
 * จึงหยิบเฉพาะ ANNUAL ไม่ใช่รวมทุกประเภท
 */
function annualLeaveBalance(item: OffboardingCase) {
  return (
    (item.leaveBalances ?? []).find((row) => row.code === "ANNUAL") ?? null
  );
}

/**
 * เตือนก่อนปิดเคสถ้ายังไม่ได้คำนวณเงินเดือนงวดสุดท้าย
 * ------------------------------------------------
 * payroll ดึงพนักงานจากสถานะ ACTIVE/PROBATION เท่านั้น ปิดเคสแล้วสถานะเปลี่ยน
 * คนนั้นจะหลุดจากงวดไปทั้งคน ได้ 0 บาท และไม่มีทางดึงกลับเข้ามาในงวดนั้นอีก
 */
function finalPayrollWarning(item: OffboardingCase) {
  const info = item.finalPayroll;
  if (!info || info.calculated) return null;

  if (!info.period) {
    return "ยังไม่มีงวดเงินเดือนที่ครอบวันพ้นสภาพ ต้องสร้างงวดและคำนวณให้เสร็จก่อน ไม่งั้นจะจ่ายเงินงวดสุดท้ายผ่านระบบไม่ได้";
  }

  return `งวด ${info.period.name ?? info.period.code ?? ""} ที่ครอบวันพ้นสภาพยังไม่ได้คำนวณ ปิดเคสตอนนี้จะทำให้หลุดจากงวดและได้ 0 บาท ควรไปคำนวณงวดนั้นให้เสร็จก่อน`;
}

function taskProgress(item: OffboardingCase) {
  const tasks = item.tasks ?? [];
  const total = tasks.length || item._count?.tasks || 0;
  const done = tasks.filter(
    (task) => task.status === "COMPLETED" || task.status === "WAIVED",
  ).length;

  return { done, total };
}

function caseStatusTone(item: OffboardingCase, accessRisk: boolean): Tone {
  if (item.status === "COMPLETED") return "positive";
  if (item.status === "CANCELLED") return "neutral";
  return accessRisk ? "critical" : "warning";
}

function taskStatusTone(status: OffboardingTaskStatus): Tone {
  if (status === "COMPLETED") return "positive";
  if (status === "WAIVED") return "neutral";
  if (status === "CANCELLED") return "critical";
  if (status === "IN_PROGRESS") return "brand";
  return "warning";
}

export type CasesSummary = OffboardingCaseListSummary;

export function CasesPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: CasesSummary) => void;
}) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  const [cases, setCases] = useState<OffboardingCase[]>([]);
  const [summary, setSummary] = useState<OffboardingCaseListSummary>(emptySummary);

  const [search, setSearch] = useState("");
  /** ตัวกรองสาขา/แผนก — คนออกจากงานต้องดูออกว่าหายไปจากแผนกไหน */
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [branches, setBranches] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(false);

  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<OffboardingCase | null>(null);

  const [caseDraft, setCaseDraft] = useState({
    companyId: "",
    employeeId: "",
    checklistId: "",
    reasonType: "RESIGNATION" as OffboardingReasonType,
    lastWorkingDate: todayDate(),
    effectiveDate: todayDate(),
    note: "",
  });

  /** พนักงานที่เลือกในฟอร์มเปิดเคส เก็บทั้งก้อนไว้โชว์สังกัด/อายุงานให้ตรวจซ้ำ */
  const [draftEmployee, setDraftEmployee] = useState<PickerEmployee | null>(
    null,
  );
  const [checklists, setChecklists] = useState<OffboardingChecklist[]>([]);

  useEffect(() => {
    onSummaryChange?.(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

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
    showMessage(
      "เกิดข้อผิดพลาด",
      error instanceof Error ? error.message : fallback,
      "red",
    );
  }

  async function loadBaseData() {
    const [companyData, branchData, departmentData] = await Promise.all([
      apiFetch<CompanyOption[] | CompanyListResponse>("/organization/companies"),
      apiFetch<OrgOption[] | { items?: OrgOption[]; data?: OrgOption[] }>(
        "/organization/branches?pageSize=300",
      ),
      apiFetch<OrgOption[] | { items?: OrgOption[]; data?: OrgOption[] }>(
        "/organization/departments?pageSize=500",
      ),
    ]);

    const toOrgOptions = (
      value: OrgOption[] | { items?: OrgOption[]; data?: OrgOption[] },
    ) => (Array.isArray(value) ? value : (value.items ?? value.data ?? []));

    setBranches(toOrgOptions(branchData));
    setDepartments(toOrgOptions(departmentData));

    // เช็กลิสต์ที่เปิดใช้งาน — ให้เลือกเองได้ ไม่ต้องเดาว่าระบบจะหยิบชุดไหน
    const checklistData = await getOffboardingChecklists({
      page: 1,
      pageSize: 100,
      status: "ACTIVE",
    }).catch(() => null);

    setChecklists(checklistData?.items ?? []);

    const companyItems = Array.isArray(companyData)
      ? companyData
      : (companyData.items ?? companyData.data ?? []);

    setCompanies(companyItems);

    const defaultCompanyId = companyItems[0]?.id ?? "";

    if (defaultCompanyId) {
      setCaseDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || defaultCompanyId,
      }));
    }
  }

  async function loadCases() {
    const data = await getOffboardingCases({
      page: 1,
      pageSize: 100,
      q: search.trim() || undefined,
      branchId: branchId || undefined,
      departmentId: departmentId || undefined,
    });

    setCases(data.items ?? []);
    setSummary(data.summary ?? emptySummary);
  }

  async function reloadAll() {
    setLoading(true);

    try {
      await Promise.all([loadBaseData(), loadCases()]);
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
          await loadCases();
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
  }, [search, branchId, departmentId]);

  /** เลือกสาขาแล้วเหลือเฉพาะแผนกในสาขานั้น กันเลือกคู่ที่ไม่มีอยู่จริง */
  const departmentOptions = useMemo(
    () =>
      departments.filter(
        (item) => !branchId || !item.branchId || item.branchId === branchId,
      ),
    [departments, branchId],
  );

  /**
   * พนักงานที่มีเคสค้างอยู่แล้ว ห้ามเปิดซ้ำ (backend ก็บล็อกไว้อีกชั้น)
   * ส่วนการกรองบริษัท/สถานะ ปล่อยให้ EmployeePicker ยิงถามเซิร์ฟเวอร์เอง
   * จะได้ไม่ต้องโหลดพนักงานทั้งบริษัทมากองไว้ในหน้า
   */
  const openCaseEmployeeIds = useMemo(
    () =>
      cases
        .filter((item) => item.status === "IN_PROGRESS")
        .map((item) => item.employeeId),
    [cases],
  );

  async function refreshDetail(id: string) {
    const fresh = await getOffboardingCase(id);
    setDetail(fresh);
  }

  async function handleCreateCase() {
    if (!caseDraft.employeeId) {
      showMessage("ยังไม่ได้เลือกพนักงาน", "กรุณาเลือกพนักงาน", "orange");
      return false;
    }

    if (caseDraft.effectiveDate < caseDraft.lastWorkingDate) {
      showMessage(
        "วันที่ไม่ถูกต้อง",
        "วันพ้นสภาพต้องไม่ก่อนวันทำงานวันสุดท้าย",
        "orange",
      );
      return false;
    }

    setLoading(true);

    try {
      const created = await createOffboardingCase({
        companyId: caseDraft.companyId || undefined,
        employeeId: caseDraft.employeeId,
        checklistId: caseDraft.checklistId || undefined,
        reasonType: caseDraft.reasonType,
        lastWorkingDate: caseDraft.lastWorkingDate,
        effectiveDate: caseDraft.effectiveDate,
        note: caseDraft.note.trim() || undefined,
      });

      setCaseDraft((prev) => ({ ...prev, employeeId: "", note: "" }));
      setDraftEmployee(null);
      await loadCases();
      await refreshDetail(created.id);

      showMessage(
        "เปิดเคสสำเร็จ",
        "ระบบกางรายการเคลียร์ของจากเช็กลิสต์มาตรฐานให้แล้ว",
        "emerald",
      );

      return true;
    } catch (error) {
      console.error(error);
      showError(error, "เปิดเคสไม่สำเร็จ");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function runCaseAction(
    id: string,
    action: () => Promise<unknown>,
    successTitle: string,
    successText: string,
  ) {
    setLoading(true);

    try {
      await action();
      await Promise.all([loadCases(), refreshDetail(id)]);
      showMessage(successTitle, successText, "emerald");
    } catch (error) {
      console.error(error);
      showError(error, "ทำรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  /**
   * ถามยืนยันก่อนลงมือ
   * ------------------
   * ปิดสิทธิ์ / หยุดจ่ายเงินเดือน / แจ้ง สปส. / ปิดเคส / ยกเลิกเคส
   * เดิมกดปุ่มเดียวแล้วทำจริงทันที ทั้งที่ทุกตัวย้อนกลับจากหน้านี้ไม่ได้
   * (backend บล็อกไว้ด้วยว่า "ทำไปแล้ว" กดซ้ำหรือแก้กลับไม่ได้)
   *
   * ไม่ต้อง try/catch เอง — ถ้า run() พัง ActionDialog จะคาไว้แล้วโชว์
   * ข้อความผิดพลาดในกล่องเดิม ผู้ใช้กดยืนยันซ้ำได้โดยไม่ต้องเริ่มใหม่
   */
  function confirmCaseAction(config: {
    caseId: string;
    title: string;
    description: string;
    confirmLabel: string;
    tone?: ActionDialogState["tone"];
    run: () => Promise<unknown>;
  }) {
    setActionDialog({
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      cancelLabel: "ยังไม่ทำ",
      tone: config.tone ?? "orange",
      onConfirm: async () => {
        setLoading(true);

        try {
          await config.run();
          await Promise.all([loadCases(), refreshDetail(config.caseId)]);
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function handleTaskAction(
    caseId: string,
    taskId: string,
    action: "start" | "complete" | "waive" | "cancel",
  ) {
    setLoading(true);

    try {
      await actOnOffboardingTask(taskId, action);
      await Promise.all([loadCases(), refreshDetail(caseId)]);
    } catch (error) {
      console.error(error);
      showError(error, "ทำรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTask(title: string, category: string) {
    if (!detail) return;

    setLoading(true);

    try {
      await createOffboardingTask({
        caseId: detail.id,
        title,
        category: category || undefined,
      });
      await Promise.all([loadCases(), refreshDetail(detail.id)]);
    } catch (error) {
      console.error(error);
      showError(error, "เพิ่มรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const columns: Array<Column<OffboardingCase>> = [
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => (
        <CellStack
          primary={employeeName(item.employee)}
          secondary={
            item.employee?.employeeCode
              ? `${item.employee.employeeCode}${
                  item.employee.position ? ` · ${item.employee.position}` : ""
                }`
              : undefined
          }
        />
      ),
    },
    {
      key: "org",
      header: "สาขา / แผนก",
      cell: (item) => (
        <CellStack
          primary={item.employee?.branch?.nameTh ?? "-"}
          secondary={item.employee?.department?.nameTh ?? undefined}
        />
      ),
    },
    {
      key: "reason",
      header: "เหตุผล",
      hideBelow: "lg",
      cell: (item) => reasonText[item.reasonType],
    },
    {
      key: "dates",
      header: "ทำงานวันสุดท้าย / พ้นสภาพ",
      cell: (item) => {
        const left = daysUntil(item.effectiveDate);
        const open = item.status === "IN_PROGRESS";

        return (
          <div className="min-w-0">
            <p>{formatThaiDate(item.lastWorkingDate)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              พ้นสภาพ {formatThaiDate(item.effectiveDate)}
            </p>
            {open && left !== null ? (
              <p
                className={joinClassName(
                  "mt-0.5 text-[11px] font-bold",
                  left < 0
                    ? "text-rose-600"
                    : left <= 7
                      ? "text-amber-600"
                      : "text-slate-400",
                )}
              >
                {left < 0 ? `เลยกำหนด ${Math.abs(left)} วัน` : `อีก ${left} วัน`}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "progress",
      header: "เคลียร์ของ",
      align: "center",
      cell: (item) => {
        const progress = taskProgress(item);
        return (
          <span className="font-semibold tabular-nums text-slate-800">
            {progress.done} / {progress.total}
          </span>
        );
      },
    },
    {
      key: "steps",
      header: "ขั้นตอนสำคัญ",
      hideBelow: "xl",
      cell: (item) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={item.accessRevokedAt ? "positive" : "neutral"}>
            สิทธิ์
          </Badge>
          <Badge tone={item.payrollStoppedAt ? "positive" : "neutral"}>
            เงินเดือน
          </Badge>
          <Badge tone={item.socialSecurityNotifiedAt ? "positive" : "neutral"}>
            สปส.
          </Badge>
        </div>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => {
        const left = daysUntil(item.effectiveDate);
        const open = item.status === "IN_PROGRESS";
        const accessRisk = open && !item.accessRevokedAt && (left ?? 1) < 0;

        return (
          <div className="min-w-0">
            <Badge tone={caseStatusTone(item, accessRisk)}>
              {caseStatusText[item.status]}
            </Badge>
            {accessRisk ? (
              <p className="mt-1 text-[11px] font-bold text-rose-600">
                ยังเข้าระบบได้
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      cell: (item) => (
        <RowMenu
          items={[
            {
              label: "ดูรายละเอียด",
              icon: <Eye className="h-4 w-4" />,
              onSelect: () => void refreshDetail(item.id),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      {summary.accessPending > 0 ? (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="critical">
            <span className="font-semibold">ต้องรีบจัดการ:</span> มีพนักงาน{" "}
            {summary.accessPending.toLocaleString("th-TH")} คน
            ที่พ้นสภาพแล้วแต่ยังเข้าใช้ระบบได้อยู่
          </Notice>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-end sm:px-6">
        <div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-3">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาพนักงาน"
            aria-label="ค้นหาเคสออกจากงาน"
          />

          <Select
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value);
              setDepartmentId("");
            }}
            aria-label="สาขา"
          >
            <option value="">ทุกสาขา</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nameTh ?? item.name ?? item.code}
              </option>
            ))}
          </Select>

          <Select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            aria-label="แผนก"
          >
            <option value="">ทุกแผนก</option>
            {departmentOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nameTh ?? item.name ?? item.code}
              </option>
            ))}
          </Select>
        </div>

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
            เปิดเคสออกจากงาน
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={cases}
        rowKey={(item) => item.id}
        loading={loading && cases.length === 0}
        onRowClick={(item) => void refreshDetail(item.id)}
        emptyTitle="ยังไม่มีพนักงานที่กำลังออกจากงาน"
      />

      {createOpen ? (
        <Modal
          open
          size="md-wide"
          title="เปิดเคสออกจากงาน"
          description="ระบบจะกางรายการเคลียร์ของจากเช็กลิสต์มาตรฐานของบริษัทให้อัตโนมัติ"
          onClose={() => setCreateOpen(false)}
        >
          <CaseForm
            draft={caseDraft}
            companies={companies}
            checklists={checklists}
            openCaseEmployeeIds={openCaseEmployeeIds}
            selectedEmployee={draftEmployee}
            loading={loading}
            onChange={setCaseDraft}
            onSelectEmployee={setDraftEmployee}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async () => {
              if (await handleCreateCase()) setCreateOpen(false);
            }}
          />
        </Modal>
      ) : null}

      {detail ? (
        <Modal
          open
          size="lg"
          title={`เคลียร์ของ: ${employeeName(detail.employee)}`}
          description={[
            [detail.employee?.branch?.nameTh, detail.employee?.department?.nameTh]
              .filter(Boolean)
              .join(" · "),
            reasonText[detail.reasonType],
            `ทำงานวันสุดท้าย ${formatThaiDate(detail.lastWorkingDate)}`,
            `พ้นสภาพ ${formatThaiDate(detail.effectiveDate)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          onClose={() => setDetail(null)}
        >
          <CaseDetail
            item={detail}
            loading={loading}
            onTaskAction={(taskId, action) =>
              void handleTaskAction(detail.id, taskId, action)
            }
            onAddTask={(title, category) => void handleAddTask(title, category)}
            onRevokeAccess={() =>
              confirmCaseAction({
                caseId: detail.id,
                title: "ปิดสิทธิ์เข้าระบบ",
                description: `${employeeName(detail.employee)} จะเข้าใช้งานระบบไม่ได้อีกทันทีที่ยืนยัน และเปิดสิทธิ์คืนจากหน้านี้ไม่ได้`,
                confirmLabel: "ปิดสิทธิ์",
                tone: "red",
                run: () => revokeOffboardingAccess(detail.id),
              })
            }
            onStopPayroll={() =>
              confirmCaseAction({
                caseId: detail.id,
                title: "หยุดจ่ายเงินเดือน",
                description: `${employeeName(detail.employee)} จะไม่ถูกดึงเข้างวดเงินเดือนถัดไป ยกเลิกจากหน้านี้ไม่ได้`,
                confirmLabel: "หยุดจ่าย",
                run: () => stopOffboardingPayroll(detail.id),
              })
            }
            onNotifySso={() =>
              confirmCaseAction({
                caseId: detail.id,
                title: "แจ้งออกประกันสังคม",
                description:
                  "ยืนยันว่าส่ง สปส. 6-09 ให้สำนักงานประกันสังคมเรียบร้อยแล้ว — ระบบบันทึกไว้เป็นหลักฐานเท่านั้น ไม่ได้ส่งให้อัตโนมัติ และแก้กลับจากหน้านี้ไม่ได้",
                confirmLabel: "บันทึกว่าแจ้งแล้ว",
                tone: "blue",
                run: () => notifyOffboardingSocialSecurity(detail.id),
              })
            }
            onCalculateSeverance={() =>
              runCaseAction(
                detail.id,
                () => calculateOffboardingSeverance(detail.id),
                "คำนวณค่าชดเชยแล้ว",
                "ระบบคิดจากบันไดอายุงานและกฎภาษีเงินก้อนให้แล้ว ตรวจตัวเลขก่อนส่งเข้าเงินเดือน",
              )
            }
            onSendFinalPay={() =>
              confirmCaseAction({
                caseId: detail.id,
                title: "ส่งเงินงวดสุดท้ายเข้าระบบเงินเดือน",
                description:
                  "จะสร้างรายการจ่ายในงวดที่ครอบวันพ้นสภาพ พร้อมรายการหักภาษีเงินก้อนแยกต่างหาก · ถ้างวดดึงรายการไปแล้วจะแก้จากหน้านี้ไม่ได้อีก",
                confirmLabel: "ส่งเข้าเงินเดือน",
                tone: "blue",
                run: () => sendOffboardingFinalPayToPayroll(detail.id),
              })
            }
            onSaveFinalPay={(payload) =>
              void runCaseAction(
                detail.id,
                () => updateOffboardingCase(detail.id, payload),
                "บันทึกเงินงวดสุดท้ายแล้ว",
                "ข้อมูลค่าชดเชยและวันลาคงเหลือถูกบันทึกแล้ว",
              )
            }
            onSaveInterview={(payload) =>
              void runCaseAction(
                detail.id,
                () => saveExitInterview(detail.id, payload),
                "บันทึกผลสัมภาษณ์แล้ว",
                "ข้อมูลถูกเก็บไว้สำหรับวิเคราะห์สาเหตุการลาออก",
              )
            }
            onComplete={() =>
              confirmCaseAction({
                caseId: detail.id,
                title: "ปิดเคสและให้พ้นสภาพ",
                description: [
                  `${employeeName(detail.employee)} จะถูกเปลี่ยนสถานะเป็น "${
                    detail.reasonType === "TERMINATION" ||
                    detail.reasonType === "LAYOFF"
                      ? "เลิกจ้าง"
                      : "ลาออก"
                  }" ปิดสิทธิ์เข้าระบบ และเคสนี้จะแก้ไขต่อไม่ได้อีก`,
                  finalPayrollWarning(detail),
                ]
                  .filter(Boolean)
                  .join(" — "),
                confirmLabel: "ปิดเคส",
                tone: "red",
                run: () => completeOffboardingCase(detail.id),
              })
            }
            onCancel={() =>
              confirmCaseAction({
                caseId: detail.id,
                title: "ยกเลิกเคส",
                description: `ยกเลิกเคสของ ${employeeName(detail.employee)} — รายการเคลียร์ของและข้อมูลที่กรอกไว้จะแก้ไขต่อไม่ได้ ถ้าจะทำใหม่ต้องเปิดเคสใหม่`,
                confirmLabel: "ยกเลิกเคสนี้",
                tone: "red",
                run: () => cancelOffboardingCase(detail.id),
              })
            }
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
/* Create-case form                                                    */
/* ------------------------------------------------------------------ */

type CaseDraft = {
  companyId: string;
  employeeId: string;
  checklistId: string;
  reasonType: OffboardingReasonType;
  lastWorkingDate: string;
  effectiveDate: string;
  note: string;
};

function CaseForm({
  draft,
  companies,
  checklists,
  openCaseEmployeeIds,
  selectedEmployee,
  loading,
  onChange,
  onSelectEmployee,
  onCancel,
  onSubmit,
}: {
  draft: CaseDraft;
  companies: CompanyOption[];
  checklists: OffboardingChecklist[];
  openCaseEmployeeIds: string[];
  selectedEmployee: PickerEmployee | null;
  loading: boolean;
  onChange: Dispatch<SetStateAction<CaseDraft>>;
  onSelectEmployee: (employee: PickerEmployee | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const noticeDays = daysUntil(draft.lastWorkingDate);

  /** เช็กลิสต์ที่ระบบจะหยิบให้ถ้าไม่เลือกเอง — ตรรกะเดียวกับฝั่ง backend */
  const autoChecklist =
    checklists.find((item) => item.companyId === draft.companyId) ??
    checklists.find((item) => !item.companyId) ??
    null;

  const chosenChecklist = draft.checklistId
    ? (checklists.find((item) => item.id === draft.checklistId) ?? null)
    : autoChecklist;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="บริษัท">
          <Select
            value={draft.companyId}
            onChange={(event) => {
              onChange((prev) => ({
                ...prev,
                companyId: event.target.value,
                employeeId: "",
                checklistId: "",
              }));
              onSelectEmployee(null);
            }}
          >
            <option value="">เลือกบริษัท</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nameTh ?? company.name ?? company.code}
              </option>
            ))}
          </Select>
        </Field>

        {/*
          ช่องพนักงานเป็นตัวค้นหา ไม่ใช่ <select> ยาว ๆ — พนักงานหลักร้อยคน
          เลื่อนหาไม่ไหว และชื่อซ้ำกันบ่อย ต้องเห็นรหัส/สังกัดประกอบด้วย
        */}
        <Field label="พนักงาน" required>
          <EmployeePicker
            value={draft.employeeId}
            companyId={draft.companyId || undefined}
            excludeIds={openCaseEmployeeIds}
            emptyText="ไม่พบพนักงาน (คนที่มีเคสค้างอยู่แล้วจะไม่ขึ้นให้เลือก)"
            onChange={(employeeId, employee) => {
              onChange((prev) => ({ ...prev, employeeId }));
              onSelectEmployee(employee);
            }}
          />
        </Field>
      </div>

      {/* ยืนยันว่าเลือกถูกคน และเห็นอายุงานซึ่งเป็นตัวกำหนดค่าชดเชยตามกฎหมาย */}
      {selectedEmployee ? (
        <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "รหัสพนักงาน", value: selectedEmployee.employeeCode },
            { label: "ตำแหน่ง", value: selectedEmployee.position },
            { label: "สาขา", value: selectedEmployee.branch?.nameTh },
            { label: "แผนก", value: selectedEmployee.department?.nameTh },
            {
              label: "วันเริ่มงาน",
              value: selectedEmployee.startDate
                ? formatThaiDate(selectedEmployee.startDate)
                : null,
            },
            {
              label: "อายุงาน",
              value: serviceLengthText(selectedEmployee.startDate),
            },
          ]
            .filter((row) => row.value)
            .map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {row.label}
                </dt>
                <dd className="mt-0.5 truncate text-[13px] text-slate-800 3xl:text-[14px]">
                  {row.value}
                </dd>
              </div>
            ))}
        </dl>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="เหตุผลที่พ้นสภาพ">
          <Select
            value={draft.reasonType}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                reasonType: event.target.value as OffboardingReasonType,
              }))
            }
          >
            {Object.entries(reasonText).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {/*
          เดิมไม่มีให้เลือก ระบบหยิบเช็กลิสต์เองเงียบ ๆ พอมีหลายชุดก็เดาไม่ถูก
          ว่าจะได้ชุดไหน ทั้งที่ backend รับ checklistId มาตั้งแต่แรก
        */}
        <Field
          label="เช็กลิสต์เคลียร์ของ"
          hint={
            chosenChecklist
              ? `จะกาง ${chosenChecklist.items?.length ?? 0} รายการให้อัตโนมัติ`
              : "ยังไม่มีเช็กลิสต์ที่เปิดใช้งาน เปิดเคสได้แต่จะไม่มีรายการให้เคลียร์"
          }
        >
          <Select
            value={draft.checklistId}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, checklistId: event.target.value }))
            }
          >
            <option value="">
              {autoChecklist
                ? `ใช้ชุดมาตรฐาน (${autoChecklist.name})`
                : "ใช้ชุดมาตรฐาน"}
            </option>
            {checklists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="ทำงานวันสุดท้าย"
          required
          hint={
            noticeDays === null
              ? undefined
              : noticeDays < 0
                ? `ย้อนหลัง ${Math.abs(noticeDays)} วัน`
                : `อีก ${noticeDays} วัน`
          }
        >
          <ThaiDateInput
            value={draft.lastWorkingDate}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                lastWorkingDate: event.target.value,
                effectiveDate:
                  prev.effectiveDate < event.target.value
                    ? event.target.value
                    : prev.effectiveDate,
              }))
            }
          />
        </Field>

        <Field label="วันพ้นสภาพ" required hint="วันที่ปิดสิทธิ์เข้าระบบ">
          <ThaiDateInput
            value={draft.effectiveDate}
            min={draft.lastWorkingDate}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                effectiveDate: event.target.value,
              }))
            }
          />
        </Field>
      </div>

      <Field label="หมายเหตุ">
        <Textarea
          rows={2}
          value={draft.note}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, note: event.target.value }))
          }
          placeholder="เช่น ย้ายไปทำงานที่อื่น / ครบสัญญาจ้าง"
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-[12px] text-slate-400 3xl:text-[13px]">
          {selectedEmployee
            ? `จะเปิดเคสให้ ${pickerEmployeeName(selectedEmployee)}`
            : "ยังไม่ได้เลือกพนักงาน"}
        </p>

        <div className="flex gap-2">
          <Button onClick={onCancel} disabled={loading}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!draft.employeeId}
            onClick={onSubmit}
          >
            เปิดเคส
          </Button>
        </div>
      </div>
    </div>
  );
}

/** อายุงานแบบ "x ปี y เดือน" — ตัวตั้งของบันไดค่าชดเชยตามมาตรา 118 */
function serviceLengthText(startDate?: string | null) {
  if (!startDate) return null;

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;

  const months = Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)),
  );

  const years = Math.floor(months / 12);
  const rest = months % 12;

  if (years === 0) return `${rest} เดือน`;
  if (rest === 0) return `${years} ปี`;

  return `${years} ปี ${rest} เดือน`;
}

/* ------------------------------------------------------------------ */
/* Case detail                                                         */
/* ------------------------------------------------------------------ */

function CaseDetail({
  item,
  loading,
  onTaskAction,
  onAddTask,
  onRevokeAccess,
  onStopPayroll,
  onNotifySso,
  onSaveFinalPay,
  onCalculateSeverance,
  onSendFinalPay,
  onSaveInterview,
  onComplete,
  onCancel,
}: {
  item: OffboardingCase;
  loading: boolean;
  onTaskAction: (
    taskId: string,
    action: "start" | "complete" | "waive" | "cancel",
  ) => void;
  onAddTask: (title: string, category: string) => void;
  onRevokeAccess: () => void;
  onStopPayroll: () => void;
  onNotifySso: () => void;
  onSaveFinalPay: (payload: {
    unusedLeaveDays?: number;
    severancePay?: number;
    finalPayNote?: string;
  }) => void;
  onCalculateSeverance: () => void;
  onSendFinalPay: () => void;
  onSaveInterview: (payload: {
    primaryReason?: string;
    recommendScore?: number;
    wouldRehire?: boolean;
    whatWorkedWell?: string;
    whatToImprove?: string;
  }) => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const open = item.status === "IN_PROGRESS";
  const tasks = item.tasks ?? [];
  const progress = taskProgress(item);
  const pendingRequired = tasks.filter(
    (task) =>
      task.isRequired &&
      (task.status === "PENDING" || task.status === "IN_PROGRESS"),
  ).length;

  const annualLeave = annualLeaveBalance(item);
  const severance = item.severanceBreakdown ?? null;

  const [newTask, setNewTask] = useState({ title: "", category: "" });
  const [finalPay, setFinalPay] = useState({
    // ยังไม่เคยบันทึก = เติมจากสมุดวันลาให้เลย ถ้าบันทึกไว้แล้วใช้ค่าที่บันทึก
    unusedLeaveDays: String(
      item.unusedLeaveDays ?? annualLeave?.remainingDays ?? "",
    ),
    severancePay: String(item.severancePay ?? ""),
    finalPayNote: item.finalPayNote ?? "",
  });
  const [interview, setInterview] = useState({
    primaryReason: item.exitInterview?.primaryReason ?? "",
    recommendScore: String(item.exitInterview?.recommendScore ?? ""),
    wouldRehire: item.exitInterview?.wouldRehire ?? true,
    whatWorkedWell: item.exitInterview?.whatWorkedWell ?? "",
    whatToImprove: item.exitInterview?.whatToImprove ?? "",
  });

  const payrollWarning = open ? finalPayrollWarning(item) : null;

  return (
    <div className="-m-5">
      {payrollWarning ? (
        <div className="border-b border-slate-200 px-5 py-3">
          <Notice tone="warning">
            <span className="font-semibold">เงินเดือนงวดสุดท้าย:</span>{" "}
            {payrollWarning}
          </Notice>
        </div>
      ) : null}

      {/* ---------------- ขั้นตอนสำคัญ ---------------- */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 border-b border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <StepAction
          icon={<ShieldOff className="h-4 w-4" />}
          label="ปิดสิทธิ์เข้าระบบ"
          doneAt={item.accessRevokedAt}
          disabled={!open || loading}
          onClick={onRevokeAccess}
        />
        <StepAction
          icon={<Wallet className="h-4 w-4" />}
          label="หยุดจ่ายเงินเดือน"
          doneAt={item.payrollStoppedAt}
          disabled={!open || loading}
          onClick={onStopPayroll}
        />
        <StepAction
          icon={<KeyRound className="h-4 w-4" />}
          label="แจ้งออกประกันสังคม"
          doneAt={item.socialSecurityNotifiedAt}
          disabled={!open || loading}
          onClick={onNotifySso}
        />
      </div>

      {/* ---------------- รายการเคลียร์ของ ---------------- */}
      <div className="border-b border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
          <p className="text-[12px] font-bold text-slate-700">รายการเคลียร์ของ</p>
          <p className="text-[11px] font-medium text-slate-400">
            เสร็จแล้ว {progress.done} จาก {progress.total} รายการ
            {pendingRequired > 0
              ? ` · ยังมีรายการบังคับค้าง ${pendingRequired}`
              : ""}
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {tasks.length === 0 ? (
            <p className="px-5 py-6 text-center text-[13px] text-slate-400">
              ยังไม่มีรายการ
            </p>
          ) : (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                disabled={!open || loading}
                onAction={(action) => onTaskAction(task.id, action)}
              />
            ))
          )}
        </div>

        {open ? (
          <div className="flex flex-wrap gap-2 px-5 py-3">
            <TextInput
              value={newTask.title}
              onChange={(event) =>
                setNewTask((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="เพิ่มรายการเคลียร์ของ"
              className="min-w-0 flex-1"
            />
            <TextInput
              value={newTask.category}
              onChange={(event) =>
                setNewTask((prev) => ({ ...prev, category: event.target.value }))
              }
              placeholder="หมวด"
              className="w-32"
            />
            <Button
              disabled={!newTask.title.trim() || loading}
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                onAddTask(newTask.title.trim(), newTask.category.trim());
                setNewTask({ title: "", category: "" });
              }}
            >
              เพิ่ม
            </Button>
          </div>
        ) : null}
      </div>

      {/* ---------------- เงินงวดสุดท้าย / สัมภาษณ์ลาออก ---------------- */}
      <div className="grid border-b border-slate-200 sm:grid-cols-2">
        <section className="border-b border-slate-200 px-5 py-4 sm:border-b-0 sm:border-r">
          <p className="text-[13px] font-bold text-slate-800">เงินงวดสุดท้าย</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {/*
              ตัวเลขนี้ระบบมีอยู่แล้วในสมุดวันลา เดิมให้พิมพ์เองล้วน ๆ
              ตอนนี้เติมให้จากของจริง แต่ยังแก้ทับได้เพราะบางกรณีตกลงกันไว้ต่างจากระบบ
            */}
            <Field
              label="วันลาคงเหลือ (วัน)"
              hint={
                annualLeave
                  ? `${annualLeave.nameTh} ปี ${annualLeave.year} คงเหลือ ${annualLeave.remainingDays.toLocaleString("th-TH")} วัน (ใช้ไป ${annualLeave.usedDays.toLocaleString("th-TH")} · รออนุมัติ ${annualLeave.pendingDays.toLocaleString("th-TH")})`
                  : "ยังไม่มีข้อมูลวันลาพักร้อนของปีที่พ้นสภาพในระบบ ต้องกรอกเอง"
              }
            >
              <div className="flex items-center gap-2">
                <TextInput
                  type="number"
                  min={0}
                  step="0.5"
                  value={finalPay.unusedLeaveDays}
                  onChange={(event) =>
                    setFinalPay((prev) => ({
                      ...prev,
                      unusedLeaveDays: event.target.value,
                    }))
                  }
                  disabled={!open}
                  className="min-w-0 flex-1"
                />

                {open &&
                annualLeave &&
                Number(finalPay.unusedLeaveDays) !==
                  annualLeave.remainingDays ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      setFinalPay((prev) => ({
                        ...prev,
                        unusedLeaveDays: String(annualLeave.remainingDays),
                      }))
                    }
                  >
                    ใช้ค่าจากระบบ
                  </Button>
                ) : null}
              </div>
            </Field>

            <Field label="ค่าชดเชย (บาท)">
              <MoneyInput
                min={0}
                value={finalPay.severancePay}
                onChange={(event) =>
                  setFinalPay((prev) => ({
                    ...prev,
                    severancePay: event.target.value,
                  }))
                }
                disabled={!open}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="หมายเหตุ">
              <Textarea
                rows={2}
                value={finalPay.finalPayNote}
                onChange={(event) =>
                  setFinalPay((prev) => ({
                    ...prev,
                    finalPayNote: event.target.value,
                  }))
                }
                disabled={!open}
              />
            </Field>
          </div>

          {/*
            ตัวคำนวณค่าชดเชยตามกฎหมายมีอยู่ใน backend มาตลอด (บันไดอายุงาน ม.118
            + ภาษีเงินก้อนแยกคำนวณตามใบแนบ) แต่หน้าเว็บไม่เคยเรียก
            HR เลยต้องคิดเองแล้วพิมพ์ตัวเลขดิบลงไป
          */}
          <div className="mt-4 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <p className="text-[13px] font-bold text-slate-800">
                ค่าชดเชยตามกฎหมาย
              </p>
              {open ? (
                <Button
                  size="sm"
                  disabled={loading}
                  icon={<Calculator className="h-3.5 w-3.5" />}
                  onClick={onCalculateSeverance}
                >
                  {severance ? "คำนวณใหม่" : "คำนวณให้"}
                </Button>
              ) : null}
            </div>

            {!severance ? (
              <p className="px-4 py-5 text-center text-[12.5px] leading-6 text-slate-400">
                ยังไม่ได้คำนวณ · ระบบคิดให้จากอายุงานตามบันได ม.118
                พร้อมภาษีเงินก้อนแยกคำนวณ
              </p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {severance.severance.lines
                    .filter((line) => Number(line.amount) > 0)
                    .map((line) => (
                      <li
                        key={line.code}
                        className="flex items-center gap-3 px-4 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">
                          {line.nameTh}
                          {line.days > 0 ? (
                            <span className="text-slate-400">
                              {" "}
                              · {line.days} วัน
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                          {Number(line.amount).toLocaleString("th-TH", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </li>
                    ))}
                </ul>

                <dl className="grid gap-x-6 gap-y-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-2">
                  {[
                    {
                      label: "อายุงาน",
                      value: `${severance.serviceYears} ปี (${severance.serviceMonths} เดือน)`,
                    },
                    {
                      label: "ค่าจ้างต่อวัน",
                      value: Number(
                        severance.severance.dailyWage,
                      ).toLocaleString("th-TH", { minimumFractionDigits: 2 }),
                    },
                    {
                      label: "ส่วนที่ยกเว้นภาษี",
                      value: Number(severance.tax.exemptAmount).toLocaleString(
                        "th-TH",
                        { minimumFractionDigits: 2 },
                      ),
                    },
                    {
                      label: "ภาษีเงินก้อน (แยกคำนวณ)",
                      value: Number(severance.tax.separateTax).toLocaleString(
                        "th-TH",
                        { minimumFractionDigits: 2 },
                      ),
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-3"
                    >
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {row.label}
                      </dt>
                      <dd className="tabular-nums text-[13px] text-slate-800">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      พนักงานได้รับสุทธิ
                    </p>
                    <p className="text-[17px] font-bold tabular-nums text-brand-700 3xl:text-[19px]">
                      {Number(severance.netPayout).toLocaleString("th-TH", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  {open ? (
                    <Button
                      variant="primary"
                      disabled={loading}
                      icon={<Send className="h-3.5 w-3.5" />}
                      onClick={onSendFinalPay}
                    >
                      ส่งเข้างวดเงินเดือน
                    </Button>
                  ) : null}
                </div>

                {severance.warnings.length > 0 ? (
                  <ul className="space-y-1 border-t border-slate-100 px-4 py-2.5">
                    {severance.warnings.map((warning) => (
                      <li
                        key={warning}
                        className="text-[12px] font-semibold text-amber-700 3xl:text-[13px]"
                      >
                        {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          {open ? (
            <Button
              className="mt-3"
              disabled={loading}
              onClick={() =>
                onSaveFinalPay({
                  unusedLeaveDays: finalPay.unusedLeaveDays
                    ? Number(finalPay.unusedLeaveDays)
                    : undefined,
                  severancePay: finalPay.severancePay
                    ? Number(finalPay.severancePay)
                    : undefined,
                  finalPayNote: finalPay.finalPayNote.trim() || undefined,
                })
              }
            >
              บันทึกเงินงวดสุดท้าย
            </Button>
          ) : null}
        </section>

        <section className="px-5 py-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
            <MessageSquareQuote className="h-4 w-4 text-slate-400" />
            สัมภาษณ์ลาออก
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="เหตุผลหลัก">
              <TextInput
                value={interview.primaryReason}
                onChange={(event) =>
                  setInterview((prev) => ({
                    ...prev,
                    primaryReason: event.target.value,
                  }))
                }
                placeholder="เช่น ค่าตอบแทน / ความก้าวหน้า"
                disabled={!open}
              />
            </Field>

            <Field label="แนะนำองค์กร (0-10)">
              <TextInput
                type="number"
                min={0}
                max={10}
                value={interview.recommendScore}
                onChange={(event) =>
                  setInterview((prev) => ({
                    ...prev,
                    recommendScore: event.target.value,
                  }))
                }
                disabled={!open}
              />
            </Field>
          </div>

          <div className="mt-3 grid gap-3">
            <Field label="สิ่งที่องค์กรทำได้ดี">
              <Textarea
                rows={2}
                value={interview.whatWorkedWell}
                onChange={(event) =>
                  setInterview((prev) => ({
                    ...prev,
                    whatWorkedWell: event.target.value,
                  }))
                }
                disabled={!open}
              />
            </Field>

            <Field label="สิ่งที่ควรปรับปรุง">
              <Textarea
                rows={2}
                value={interview.whatToImprove}
                onChange={(event) =>
                  setInterview((prev) => ({
                    ...prev,
                    whatToImprove: event.target.value,
                  }))
                }
                disabled={!open}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Checkbox
              label="พร้อมรับกลับเข้าทำงานอีก"
              checked={interview.wouldRehire}
              onChange={(event) =>
                setInterview((prev) => ({
                  ...prev,
                  wouldRehire: event.target.checked,
                }))
              }
              disabled={!open}
            />
          </div>

          {open ? (
            <Button
              className="mt-3"
              disabled={loading}
              onClick={() =>
                onSaveInterview({
                  primaryReason: interview.primaryReason.trim() || undefined,
                  recommendScore: interview.recommendScore
                    ? Number(interview.recommendScore)
                    : undefined,
                  wouldRehire: interview.wouldRehire,
                  whatWorkedWell: interview.whatWorkedWell.trim() || undefined,
                  whatToImprove: interview.whatToImprove.trim() || undefined,
                })
              }
            >
              บันทึกผลสัมภาษณ์
            </Button>
          ) : null}
        </section>
      </div>

      {/* ---------------- ปิด / ยกเลิกเคส ---------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        {open ? (
          <>
            {pendingRequired > 0 ? (
              <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                ต้องเคลียร์รายการบังคับให้ครบก่อนปิดเคส (เหลือ {pendingRequired})
              </p>
            ) : (
              <p className="text-[12.5px] font-bold text-emerald-700">
                เคลียร์ครบแล้ว พร้อมปิดเคส
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                disabled={loading}
                icon={<Ban className="h-3.5 w-3.5" />}
                onClick={onCancel}
              >
                ยกเลิกเคส
              </Button>

              <Button
                variant="primary"
                disabled={loading || pendingRequired > 0}
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                onClick={onComplete}
              >
                ปิดเคส
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[13px] font-semibold text-slate-600">
            เคสนี้{caseStatusText[item.status]}
            {item.completedAt ? ` เมื่อ ${formatThaiDateTime(item.completedAt)}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function StepAction({
  icon,
  label,
  doneAt,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  doneAt?: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (doneAt) {
    return (
      <div className="bg-emerald-50/60 px-5 py-4">
        <p className="flex items-center gap-2 text-[13px] font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          {label}
        </p>
        <p className="mt-0.5 text-[11px] text-emerald-700">
          {formatThaiDateTime(doneAt)}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="px-5 py-4 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <p className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        ยังไม่ได้ทำ · กดแล้วจะถามยืนยันก่อน
      </p>
    </button>
  );
}

function TaskRow({
  task,
  disabled,
  onAction,
}: {
  task: OffboardingTask;
  disabled?: boolean;
  onAction: (action: "start" | "complete" | "waive" | "cancel") => void;
}) {
  const closed =
    task.status === "COMPLETED" ||
    task.status === "WAIVED" ||
    task.status === "CANCELLED";

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900">
          {task.title}
          {task.isRequired ? <span className="text-rose-500"> *</span> : null}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {[task.category, task.ownerRole].filter(Boolean).join(" · ") || "-"}
        </p>
      </div>

      <Badge tone={taskStatusTone(task.status)}>
        {taskStatusText[task.status]}
      </Badge>

      {!closed ? (
        <div className="flex flex-wrap gap-1.5">
          {task.status === "PENDING" ? (
            <Button
              size="sm"
              disabled={disabled}
              onClick={() => onAction("start")}
            >
              เริ่ม
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            disabled={disabled}
            onClick={() => onAction("complete")}
          >
            รับคืนแล้ว
          </Button>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => onAction("waive")}
          >
            ยกเว้น
          </Button>
        </div>
      ) : null}
    </div>
  );
}
