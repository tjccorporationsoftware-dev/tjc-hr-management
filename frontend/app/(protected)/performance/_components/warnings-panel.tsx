"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Ban, CheckCircle2, History, Plus, RefreshCcw, Send } from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate } from "@/lib/date-format";

import {
  acknowledgeWarningLetter,
  apiFetch,
  cancelWarningLetter,
  createDisciplinaryHistory,
  createWarningLetter,
  getDisciplinaryHistories,
  getWarningLetters,
  issueWarningLetter,
} from "@/lib/api";

import type {
  DisciplinaryHistory,
  DisciplinaryHistoryListSummary,
  DisciplinaryHistoryType,
  WarningLetter,
  WarningLetterListSummary,
  WarningLetterStatus,
  WarningSeverity,
} from "@/types/performance";

import {
  Badge,
  Button,
  CellStack,
  DataTable,
  Field,
  Modal,
  Notice,
  RowMenu,
  SearchInput,
  Section,
  Select,
  TextInput,
  Textarea,
  joinClassName,
  type Column,
  type Tone,
} from "@/components/kit";

/**
 * แท็บ "หนังสือเตือนและวินัย"
 * --------------------------
 * ออกหนังสือเตือน ติดตามการรับทราบ และเก็บประวัติวินัยทั้งหมด (รวมหนังสือเตือน
 * ที่ออกไปแล้ว) ไว้ในที่เดียว ตรรกะทั้งหมดยกมาจากหน้าเดิม เปลี่ยนเฉพาะเปลือก
 */

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
};

type EmployeeListResponse = {
  items?: EmployeeOption[];
  data?: EmployeeOption[];
};

const emptyWarningSummary: WarningLetterListSummary = {
  total: 0,
  draft: 0,
  issued: 0,
  acknowledged: 0,
  cancelled: 0,
};

const emptyDisciplinarySummary: DisciplinaryHistoryListSummary = {
  total: 0,
  warning: 0,
  acknowledgement: 0,
  incident: 0,
  note: 0,
};

const warningStatusText: Record<WarningLetterStatus, string> = {
  DRAFT: "ร่าง",
  ISSUED: "ออกหนังสือแล้ว",
  ACKNOWLEDGED: "พนักงานรับทราบ",
  CANCELLED: "ยกเลิก",
};

const warningSeverityText: Record<WarningSeverity, string> = {
  INFO: "แจ้งเตือน",
  MINOR: "เตือนเบา",
  MAJOR: "เตือนหนัก",
  SERIOUS: "ร้ายแรง",
};

const disciplinaryTypeText: Record<DisciplinaryHistoryType, string> = {
  WARNING: "หนังสือเตือน",
  ACKNOWLEDGEMENT: "การรับทราบ",
  INCIDENT: "เหตุการณ์",
  NOTE: "บันทึกเหตุการณ์",
};

function warningStatusTone(status: WarningLetterStatus): Tone {
  if (status === "ACKNOWLEDGED") return "positive";
  if (status === "ISSUED") return "brand";
  if (status === "CANCELLED") return "critical";
  return "neutral";
}

function severityTone(severity: WarningSeverity): Tone {
  if (severity === "SERIOUS") return "critical";
  if (severity === "MAJOR") return "warning";
  if (severity === "MINOR") return "brand";
  return "neutral";
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function employeeName(employee?: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!employee) return "-";

  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    "-"
  );
}

export type WarningsSummary = {
  warnings: WarningLetterListSummary;
  disciplinary: DisciplinaryHistoryListSummary;
};

export function WarningsPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: WarningsSummary) => void;
}) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [warnings, setWarnings] = useState<WarningLetter[]>([]);
  const [warningSummary, setWarningSummary] = useState<WarningLetterListSummary>(
    emptyWarningSummary,
  );

  const [disciplinaryHistories, setDisciplinaryHistories] = useState<
    DisciplinaryHistory[]
  >([]);
  const [disciplinarySummary, setDisciplinarySummary] =
    useState<DisciplinaryHistoryListSummary>(emptyDisciplinarySummary);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [disciplinaryOpen, setDisciplinaryOpen] = useState(false);

  const [warningDraft, setWarningDraft] = useState({
    companyId: "",
    employeeId: "",
    letterNo: "",
    subject: "",
    severity: "MINOR" as WarningSeverity,
    incidentDate: todayDate(),
    issuedDate: todayDate(),
    description: "",
    correctiveAction: "",
    employeeResponse: "",
    note: "",
  });

  const [disciplinaryDraft, setDisciplinaryDraft] = useState({
    companyId: "",
    employeeId: "",
    warningLetterId: "",
    type: "NOTE" as DisciplinaryHistoryType,
    eventDate: todayDate(),
    title: "",
    detail: "",
    actionTaken: "",
    note: "",
  });

  useEffect(() => {
    onSummaryChange?.({ warnings: warningSummary, disciplinary: disciplinarySummary });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warningSummary, disciplinarySummary]);

  async function loadBaseData() {
    const [companyData, employeeData] = await Promise.all([
      apiFetch<CompanyOption[]>("/organization/companies"),
      apiFetch<EmployeeListResponse>("/employees?page=1&pageSize=100"),
    ]);

    setCompanies(Array.isArray(companyData) ? companyData : []);
    setEmployees(employeeData.items ?? []);

    if (companyData?.[0]?.id) {
      setWarningDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || companyData[0].id,
      }));
      setDisciplinaryDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || companyData[0].id,
      }));
    }
  }

  async function loadWarnings() {
    const data = await getWarningLetters({
      page: 1,
      pageSize: 100,
      q: search.trim() || undefined,
    });

    setWarnings(data.items ?? []);
    setWarningSummary(data.summary ?? emptyWarningSummary);
  }

  async function loadDisciplinaryHistories() {
    const data = await getDisciplinaryHistories({
      page: 1,
      pageSize: 100,
      q: search.trim() || undefined,
    });

    setDisciplinaryHistories(data.items ?? []);
    setDisciplinarySummary(data.summary ?? emptyDisciplinarySummary);
  }

  async function reloadAll() {
    setLoading(true);

    try {
      await Promise.all([
        loadBaseData(),
        loadWarnings(),
        loadDisciplinaryHistories(),
      ]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateWarningLetter() {
    if (
      !warningDraft.companyId ||
      !warningDraft.employeeId ||
      !warningDraft.subject.trim() ||
      !warningDraft.description.trim()
    ) {
      toast.warning("กรุณาเลือกบริษัท พนักงาน กรอกเรื่อง และรายละเอียด");
      return false;
    }

    setLoading(true);

    try {
      await createWarningLetter({
        companyId: warningDraft.companyId,
        employeeId: warningDraft.employeeId,
        letterNo: warningDraft.letterNo.trim() || undefined,
        subject: warningDraft.subject.trim(),
        severity: warningDraft.severity,
        incidentDate: warningDraft.incidentDate || undefined,
        issuedDate: warningDraft.issuedDate || undefined,
        description: warningDraft.description.trim(),
        correctiveAction: warningDraft.correctiveAction.trim() || undefined,
        employeeResponse: warningDraft.employeeResponse.trim() || undefined,
        note: warningDraft.note.trim() || undefined,
      });

      setWarningDraft((prev) => ({
        ...prev,
        letterNo: "",
        subject: "",
        description: "",
        correctiveAction: "",
        employeeResponse: "",
        note: "",
      }));

      await loadWarnings();
      toast.success("สร้างหนังสือเตือนสำเร็จ");
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleWarningAction(
    action: "issue" | "acknowledge" | "cancel",
    id: string,
  ) {
    if (action === "acknowledge") {
      setActionDialog({
        title: "บันทึกการรับทราบ",
        description: "บันทึกข้อความรับทราบของพนักงานก่อนดำเนินการ",
        confirmLabel: "บันทึกรับทราบ",
        tone: "emerald",
        reasonLabel: "ข้อความรับทราบของพนักงาน",
        reasonPlaceholder: "เช่น พนักงานรับทราบและจะปรับปรุงการปฏิบัติงาน",
        onConfirm: async (reason) => {
          setLoading(true);

          try {
            await acknowledgeWarningLetter(id, {
              employeeResponse: reason || undefined,
            });
            await Promise.all([loadWarnings(), loadDisciplinaryHistories()]);
            toast.success("บันทึกการรับทราบสำเร็จ");
          } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
          } finally {
            setLoading(false);
          }
        },
      });
      return;
    }

    if (action === "cancel") {
      setActionDialog({
        title: "ยกเลิกหนังสือเตือน",
        description: "ระบุเหตุผลก่อนยกเลิกหนังสือเตือนรายการนี้",
        confirmLabel: "ยกเลิกหนังสือเตือน",
        tone: "red",
        requireReason: true,
        reasonLabel: "เหตุผลการยกเลิก",
        reasonPlaceholder: "ระบุเหตุผลการยกเลิก",
        onConfirm: async (reason) => {
          setLoading(true);

          try {
            await cancelWarningLetter(id, {
              cancelReason: reason || "ยกเลิกหนังสือเตือน",
            });
            await Promise.all([loadWarnings(), loadDisciplinaryHistories()]);
            toast.success("ยกเลิกหนังสือเตือนสำเร็จ");
          } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
          } finally {
            setLoading(false);
          }
        },
      });
      return;
    }

    setLoading(true);

    try {
      await issueWarningLetter(id);
      await Promise.all([loadWarnings(), loadDisciplinaryHistories()]);
      toast.success("ออกหนังสือเตือนสำเร็จ");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDisciplinaryHistory() {
    if (
      !disciplinaryDraft.companyId ||
      !disciplinaryDraft.employeeId ||
      !disciplinaryDraft.eventDate ||
      !disciplinaryDraft.title.trim() ||
      !disciplinaryDraft.detail.trim()
    ) {
      toast.warning("กรุณาเลือกบริษัท พนักงาน วันที่ หัวข้อ และรายละเอียด");
      return false;
    }

    setLoading(true);

    try {
      await createDisciplinaryHistory({
        companyId: disciplinaryDraft.companyId,
        employeeId: disciplinaryDraft.employeeId,
        warningLetterId: disciplinaryDraft.warningLetterId || undefined,
        type: disciplinaryDraft.type,
        eventDate: disciplinaryDraft.eventDate,
        title: disciplinaryDraft.title.trim(),
        detail: disciplinaryDraft.detail.trim(),
        actionTaken: disciplinaryDraft.actionTaken.trim() || undefined,
        note: disciplinaryDraft.note.trim() || undefined,
      });

      setDisciplinaryDraft((prev) => ({
        ...prev,
        warningLetterId: "",
        title: "",
        detail: "",
        actionTaken: "",
        note: "",
      }));

      await loadDisciplinaryHistories();
      toast.success("บันทึกประวัติวินัยสำเร็จ");
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setLoading(false);
    }
  }

  const warningColumns: Array<Column<WarningLetter>> = [
    {
      key: "letter",
      header: "เลขที่ / เรื่อง",
      cell: (item) => (
        <CellStack primary={item.letterNo} secondary={item.subject} />
      ),
    },
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => employeeName(item.employee),
    },
    {
      key: "severity",
      header: "ระดับ",
      cell: (item) => (
        <Badge tone={severityTone(item.severity)}>
          {warningSeverityText[item.severity]}
        </Badge>
      ),
    },
    {
      key: "incidentDate",
      header: "วันที่เกิดเหตุ",
      hideBelow: "lg",
      cell: (item) =>
        item.incidentDate ? (
          formatThaiDate(item.incidentDate)
        ) : (
          <span className="text-slate-400">-</span>
        ),
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <Badge tone={warningStatusTone(item.status)}>
          {warningStatusText[item.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      cell: (item) => {
        const items = [
          ...(item.status === "DRAFT"
            ? [
                {
                  label: "ออกหนังสือ",
                  icon: <Send className="h-4 w-4" />,
                  onSelect: () => void handleWarningAction("issue", item.id),
                },
              ]
            : []),
          ...(item.status === "ISSUED"
            ? [
                {
                  label: "บันทึกรับทราบ",
                  icon: <CheckCircle2 className="h-4 w-4" />,
                  onSelect: () =>
                    void handleWarningAction("acknowledge", item.id),
                },
              ]
            : []),
          ...(item.status !== "CANCELLED"
            ? [
                {
                  label: "ยกเลิกหนังสือเตือน",
                  icon: <Ban className="h-4 w-4" />,
                  tone: "danger" as const,
                  separated: true,
                  onSelect: () => void handleWarningAction("cancel", item.id),
                },
              ]
            : []),
        ];

        if (items.length === 0) {
          return <span className="text-slate-300">-</span>;
        }

        return <RowMenu items={items} />;
      },
    },
  ];

  const disciplinaryColumns: Array<Column<DisciplinaryHistory>> = [
    {
      key: "event",
      header: "เหตุการณ์",
      cell: (item) => <CellStack primary={item.title} secondary={item.detail} />,
    },
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => employeeName(item.employee),
    },
    {
      key: "type",
      header: "ประเภท",
      cell: (item) => (
        <Badge tone="neutral">{disciplinaryTypeText[item.type]}</Badge>
      ),
    },
    {
      key: "date",
      header: "วันที่",
      hideBelow: "lg",
      cell: (item) => formatThaiDate(item.eventDate),
    },
    {
      key: "action",
      header: "การดำเนินการ",
      cell: (item) =>
        item.actionTaken || <span className="text-slate-400">-</span>,
    },
  ];

  return (
    <>
      <div className="px-5 pt-4 sm:px-6">
        <Notice tone="warning">
          ข้อมูลวินัยเป็นข้อมูลอ่อนไหว — เปิดให้เฉพาะผู้มีสิทธิ์
          และทุกการกระทำถูกบันทึกใน Audit Log
        </Notice>
      </div>

      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-end sm:px-6">
        <Field label="ค้นหาหนังสือเตือน" className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาพนักงานหรือเลขที่หนังสือ"
            aria-label="ค้นหาหนังสือเตือนและประวัติวินัย"
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
            icon={<History className="h-3.5 w-3.5" />}
            onClick={() => setDisciplinaryOpen(true)}
          >
            บันทึกประวัติวินัย
          </Button>

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreateOpen(true)}
          >
            ออกหนังสือเตือน
          </Button>
        </div>
      </div>

      <DataTable
        columns={warningColumns}
        rows={warnings}
        rowKey={(item) => item.id}
        loading={loading && warnings.length === 0}
        emptyTitle="ยังไม่มีหนังสือเตือน"
      />

      <Section
        title="ประวัติวินัยทั้งหมด"
        description="บันทึกเหตุการณ์ด้านวินัยของพนักงาน รวมหนังสือเตือนที่ออกไปแล้ว"
        tight
      >
        <DataTable
          columns={disciplinaryColumns}
          rows={disciplinaryHistories}
          rowKey={(item) => item.id}
          loading={loading && disciplinaryHistories.length === 0}
          emptyTitle="ยังไม่มีประวัติวินัย"
        />
      </Section>

      {createOpen ? (
        <Modal
          open
          title="ออกหนังสือเตือน"
          onClose={() => setCreateOpen(false)}
        >
          <WarningForm
            draft={warningDraft}
            companies={companies}
            employees={employees}
            loading={loading}
            onChange={setWarningDraft}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async () => {
              if (await handleCreateWarningLetter()) setCreateOpen(false);
            }}
          />
        </Modal>
      ) : null}

      {disciplinaryOpen ? (
        <Modal
          open
          title="บันทึกประวัติวินัย"
          onClose={() => setDisciplinaryOpen(false)}
        >
          <DisciplinaryForm
            draft={disciplinaryDraft}
            companies={companies}
            employees={employees}
            warnings={warnings}
            loading={loading}
            onChange={setDisciplinaryDraft}
            onCancel={() => setDisciplinaryOpen(false)}
            onSubmit={async () => {
              if (await handleCreateDisciplinaryHistory()) setDisciplinaryOpen(false);
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
/* Create-warning form                                                 */
/* ------------------------------------------------------------------ */

type WarningDraft = {
  companyId: string;
  employeeId: string;
  letterNo: string;
  subject: string;
  severity: WarningSeverity;
  incidentDate: string;
  issuedDate: string;
  description: string;
  correctiveAction: string;
  employeeResponse: string;
  note: string;
};

function WarningForm({
  draft,
  companies,
  employees,
  loading,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: WarningDraft;
  companies: CompanyOption[];
  employees: EmployeeOption[];
  loading: boolean;
  onChange: Dispatch<SetStateAction<WarningDraft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <Notice tone="warning">
        หนังสือเตือนเป็นเอกสารทางวินัยที่ใช้อ้างอิงทางกฎหมายได้ —
        ระบุพฤติกรรมและแนวทางแก้ไขให้ชัดเจน
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="บริษัท">
          <Select
            value={draft.companyId}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, companyId: event.target.value }))
            }
          >
            <option value="">เลือกบริษัท</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nameTh ?? company.name ?? company.code}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="พนักงาน">
          <Select
            value={draft.employeeId}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, employeeId: event.target.value }))
            }
          >
            <option value="">เลือกพนักงาน</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeCode} · {employeeName(employee)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="เลขที่หนังสือ" required>
          <TextInput
            value={draft.letterNo}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, letterNo: event.target.value }))
            }
            placeholder="เช่น WRN-2569-001"
          />
        </Field>

        <Field label="ระดับความรุนแรง">
          <Select
            value={draft.severity}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                severity: event.target.value as WarningSeverity,
              }))
            }
          >
            <option value="INFO">แจ้งเตือน</option>
            <option value="MINOR">เตือนเบา</option>
            <option value="MAJOR">เตือนหนัก</option>
            <option value="SERIOUS">ร้ายแรง</option>
          </Select>
        </Field>

        <Field label="วันที่เกิดเหตุ">
          <ThaiDateInput
            value={draft.incidentDate}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                incidentDate: event.target.value,
              }))
            }
          />
        </Field>

        <Field label="วันที่ออกหนังสือ">
          <ThaiDateInput
            value={draft.issuedDate}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, issuedDate: event.target.value }))
            }
          />
        </Field>
      </div>

      <Field label="เรื่อง" required>
        <TextInput
          value={draft.subject}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, subject: event.target.value }))
          }
          placeholder="เช่น มาสายเกินกำหนดติดต่อกัน"
        />
      </Field>

      <Field label="รายละเอียดพฤติกรรม" required>
        <Textarea
          rows={3}
          value={draft.description}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, description: event.target.value }))
          }
        />
      </Field>

      <Field label="แนวทางแก้ไขที่ต้องการ">
        <Textarea
          rows={2}
          value={draft.correctiveAction}
          onChange={(event) =>
            onChange((prev) => ({
              ...prev,
              correctiveAction: event.target.value,
            }))
          }
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button onClick={onCancel} disabled={loading}>
          ยกเลิก
        </Button>
        <Button variant="primary" loading={loading} onClick={onSubmit}>
          บันทึกหนังสือเตือน
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create-disciplinary-history form                                    */
/* ------------------------------------------------------------------ */

type DisciplinaryDraft = {
  companyId: string;
  employeeId: string;
  warningLetterId: string;
  type: DisciplinaryHistoryType;
  eventDate: string;
  title: string;
  detail: string;
  actionTaken: string;
  note: string;
};

function DisciplinaryForm({
  draft,
  companies,
  employees,
  warnings,
  loading,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: DisciplinaryDraft;
  companies: CompanyOption[];
  employees: EmployeeOption[];
  warnings: WarningLetter[];
  loading: boolean;
  onChange: Dispatch<SetStateAction<DisciplinaryDraft>>;
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
            <option value="">เลือกบริษัท</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nameTh ?? company.name ?? company.code}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="พนักงาน">
          <Select
            value={draft.employeeId}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, employeeId: event.target.value }))
            }
          >
            <option value="">เลือกพนักงาน</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeCode} · {employeeName(employee)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ประเภท">
          <Select
            value={draft.type}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                type: event.target.value as DisciplinaryHistoryType,
              }))
            }
          >
            <option value="NOTE">บันทึกเหตุการณ์</option>
            <option value="WARNING">หนังสือเตือน</option>
            <option value="ACKNOWLEDGEMENT">การรับทราบ</option>
            <option value="INCIDENT">เหตุการณ์</option>
          </Select>
        </Field>

        <Field label="วันที่เกิดเหตุ">
          <ThaiDateInput
            value={draft.eventDate}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, eventDate: event.target.value }))
            }
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="อ้างอิงหนังสือเตือน (ถ้ามี)">
            <Select
              value={draft.warningLetterId}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  warningLetterId: event.target.value,
                }))
              }
            >
              <option value="">ไม่อ้างอิง</option>
              {warnings.map((warning) => (
                <option key={warning.id} value={warning.id}>
                  {warning.letterNo} · {warning.subject}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <Field label="หัวข้อ" required>
        <TextInput
          value={draft.title}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, title: event.target.value }))
          }
        />
      </Field>

      <Field label="รายละเอียด" required>
        <Textarea
          rows={3}
          value={draft.detail}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, detail: event.target.value }))
          }
        />
      </Field>

      <Field label="การดำเนินการ">
        <Textarea
          rows={2}
          value={draft.actionTaken}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, actionTaken: event.target.value }))
          }
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button onClick={onCancel} disabled={loading}>
          ยกเลิก
        </Button>
        <Button variant="primary" loading={loading} onClick={onSubmit}>
          บันทึกประวัติวินัย
        </Button>
      </div>
    </div>
  );
}
