"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import { ClipboardList, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";

import {
  apiFetch,
  createEvaluationForm,
  createEvaluator,
  deleteEvaluationForm,
  deleteEvaluator,
  getEvaluationForms,
  getEvaluators,
  updateEvaluationForm,
} from "@/lib/api";

import type {
  EvaluationForm,
  EvaluationFormListSummary,
  EvaluationFormStatus,
  EvaluationPeriodType,
  EvaluationQuestionType,
  Evaluator,
} from "@/types/performance";

import {
  Badge,
  Button,
  Field,
  Modal,
  RowMenu,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  joinClassName,
  type Tone,
} from "@/components/kit";

/**
 * แท็บ "แบบประเมิน"
 * -----------------
 * สร้าง/แก้ไขแบบประเมินถ่วงน้ำหนัก พร้อมกำหนดผู้ประเมินได้ในฟอร์มเดียว
 * ตรรกะทั้งหมด (การผูก/ปลดผู้ประเมินแบบเทียบรายชื่อเดิม การตรวจข้อมูลก่อนบันทึก)
 * ยกมาจากหน้าเดิมทั้งชุด เปลี่ยนเฉพาะเปลือก
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

const emptySummary: EvaluationFormListSummary = {
  total: 0,
  draft: 0,
  active: 0,
  inactive: 0,
  archived: 0,
};

const periodTypeText: Record<EvaluationPeriodType, string> = {
  PROBATION: "ทดลองงาน",
  ANNUAL: "ประจำปี",
  HALF_YEAR: "ครึ่งปี",
  QUARTER: "รายไตรมาส",
  CUSTOM: "กำหนดเอง",
};

const formStatusText: Record<EvaluationFormStatus, string> = {
  DRAFT: "ร่าง",
  ACTIVE: "ใช้งาน",
  INACTIVE: "ปิดใช้งาน",
  ARCHIVED: "เก็บถาวร",
};

/**
 * แบบประเมินหนึ่งใบในรายการ — บรรทัดเดียว
 * ซ้ายบอกว่าเป็นแบบไหน ขวาเป็นตัวเลขของแบบนั้นเรียงติดกันคั่นด้วยเส้น
 * ไม่กระจายเป็นคอลัมน์กว้าง ๆ ที่มีตัวหนังสือสั้น ๆ อยู่กลางช่องว่าง
 */
function FormRow({
  item,
  evaluatorCount,
  onEdit,
  onDelete,
}: {
  item: EvaluationForm;
  evaluatorCount: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // โชว์คะแนนเต็มรวมแทนน้ำหนัก เพราะน้ำหนักไม่ใช่สิ่งที่ตั้งเองได้อีกแล้ว
  const maxScore = item.questions.reduce(
    (sum, question) =>
      sum + toNumber(question.maxScore) * (toNumber(question.weight) || 1),
    0,
  );
  const total = toNumber(item.totalScore);
  const pass = toNumber(item.passScore);
  const passPercent = total > 0 ? Math.round((pass / total) * 100) : 0;

  return (
    <article className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <ClipboardList className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-[13rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[15px] font-bold text-slate-900 3xl:text-[16px]">
            {item.name}
          </p>
          {item.periodType ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-semibold text-brand-700">
              {periodTypeText[item.periodType]}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[12.5px] text-slate-500 3xl:text-[13px]">
          {[item.code, item.description].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* ตัวเลขของแบบนี้ เรียงติดกันคั่นด้วยเส้น */}
      <div className="flex shrink-0 items-center divide-x divide-brand-100">
        <FormFact
          label="หัวข้อ"
          value={`${item.questions.length.toLocaleString("th-TH")} ข้อ`}
        />
        <FormFact
          label="คะแนนเต็ม"
          value={`${(maxScore || total).toLocaleString("th-TH")}`}
        />
        <FormFact label="เกณฑ์ผ่าน" value={`${passPercent}%`} tone="positive" />
        <FormFact
          label="ผู้ประเมิน"
          value={
            evaluatorCount
              ? `${evaluatorCount.toLocaleString("th-TH")} คน`
              : "ยังไม่กำหนด"
          }
          muted={!evaluatorCount}
        />
      </div>

      <div className="w-24 shrink-0 text-right">
        <Badge tone={formStatusTone(item.status)}>
          {formStatusText[item.status]}
        </Badge>
      </div>

      <div className="flex w-8 shrink-0 justify-end">
        <RowMenu
          items={[
            {
              label: "แก้ไขแบบประเมิน",
              icon: <Pencil className="h-4 w-4" />,
              onSelect: onEdit,
            },
            {
              label: "ลบแบบประเมิน",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger",
              separated: true,
              onSelect: onDelete,
            },
          ]}
        />
      </div>
    </article>
  );
}

/** ตัวเลขหนึ่งช่องในแถวแบบประเมิน */
function FormFact({
  label,
  value,
  tone,
  muted = false,
}: {
  label: string;
  value: string;
  tone?: "positive";
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={joinClassName(
          "mt-0.5 whitespace-nowrap text-[14px] font-bold tabular-nums 3xl:text-[15px]",
          muted
            ? "text-slate-300"
            : tone === "positive"
              ? "text-emerald-600"
              : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** หัวข้อย่อยในฟอร์ม — ป้ายฟ้าคั่นด้วยเส้นบาง มีที่วางปุ่มทางขวาได้ */
function FormSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-brand-100 pb-1.5">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            {title}
          </p>
          {hint ? (
            <p className="mt-0.5 text-[11.5px] text-slate-400">{hint}</p>
          ) : null}
        </div>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

function formStatusTone(status: EvaluationFormStatus): Tone {
  if (status === "ACTIVE") return "positive";
  if (status === "ARCHIVED") return "critical";
  if (status === "INACTIVE") return "warning";
  return "neutral";
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function employeeName(
  employee?: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null,
) {
  if (!employee) return "-";

  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    "-"
  );
}

export type FormsSummary = EvaluationFormListSummary;

export function FormsPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: FormsSummary) => void;
}) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [summary, setSummary] =
    useState<EvaluationFormListSummary>(emptySummary);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);

  const [formDraft, setFormDraft] = useState<FormDraft>({
    companyId: "",
    code: "",
    name: "",
    description: "",
    periodType: "ANNUAL",
    passPercent: 60,
    status: "ACTIVE",
    questions: [
      {
        title: "คุณภาพของงาน",
        description: "",
        type: "SCORE",
        maxScore: 5,
        weight: 1,
        sortOrder: 1,
        isRequired: true,
      },
      {
        title: "ความรับผิดชอบ",
        description: "",
        type: "SCORE",
        maxScore: 5,
        weight: 1,
        sortOrder: 2,
        isRequired: true,
      },
      {
        title: "การทำงานร่วมกับผู้อื่น",
        description: "",
        type: "SCORE",
        maxScore: 5,
        weight: 1,
        sortOrder: 3,
        isRequired: true,
      },
    ],
    evaluatorIds: [],
  });

  useEffect(() => {
    onSummaryChange?.(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  async function loadBaseData() {
    const [companyData, employeeData] = await Promise.all([
      apiFetch<CompanyOption[]>("/organization/companies"),
      apiFetch<EmployeeListResponse>("/employees?page=1&pageSize=100"),
    ]);

    setCompanies(Array.isArray(companyData) ? companyData : []);
    setEmployees(employeeData.items ?? []);

    if (!formDraft.companyId && companyData?.[0]?.id) {
      setFormDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || companyData[0].id,
      }));
    }
  }

  async function loadForms() {
    const data = await getEvaluationForms({
      page: 1,
      pageSize: 100,
      q: search.trim() || undefined,
    });

    setForms(data.items ?? []);
    setSummary(data.summary ?? emptySummary);
  }

  /** โหลดผู้ประเมินทุกฟอร์ม เพื่อให้ตารางแบบประเมินนับจำนวนผู้ประเมินได้ */
  async function loadEvaluators() {
    const data = await getEvaluators({});
    setEvaluators(data ?? []);
  }

  async function reloadAll() {
    setLoading(true);

    try {
      await Promise.all([loadBaseData(), loadForms(), loadEvaluators()]);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ผู้ประเมินที่ยังใช้งานอยู่ของแต่ละฟอร์ม ใช้ทั้งนับในตารางและตั้งค่าตอนแก้ไข */
  const activeEvaluatorsByForm = useMemo(() => {
    const map = new Map<string, Evaluator[]>();

    evaluators
      .filter((evaluator) => evaluator.status === "ACTIVE")
      .forEach((evaluator) => {
        const list = map.get(evaluator.formId) ?? [];
        list.push(evaluator);
        map.set(evaluator.formId, list);
      });

    return map;
  }, [evaluators]);

  const evaluatorCountByForm = useMemo(() => {
    const counts: Record<string, number> = {};

    activeEvaluatorsByForm.forEach((list, formId) => {
      counts[formId] = list.length;
    });

    return counts;
  }, [activeEvaluatorsByForm]);

  /** เปิดโมดัลแก้ไข พร้อมเติมข้อมูลเดิมของฟอร์มและผู้ประเมินลงใน draft */
  function openFormEditor(formId: string) {
    const form = forms.find((item) => item.id === formId);
    if (!form) return;

    setFormDraft({
      companyId: form.companyId ?? "",
      code: form.code,
      name: form.name,
      description: form.description ?? "",
      periodType: form.periodType ?? "CUSTOM",
      // แปลงคะแนนผ่านที่เก็บไว้กลับเป็นเปอร์เซ็นต์ เพื่อเอามาแสดงในฟอร์ม
      passPercent: (() => {
        const total = toNumber(form.totalScore);
        const pass = toNumber(form.passScore);
        return total > 0 ? Math.round((pass / total) * 100) : 60;
      })(),
      status: form.status,
      questions: form.questions.map((question, index) => ({
        title: question.title,
        description: question.description ?? "",
        type: question.type,
        maxScore: toNumber(question.maxScore),
        weight: toNumber(question.weight),
        sortOrder: index + 1,
        isRequired: question.isRequired,
      })),
      evaluatorIds: (activeEvaluatorsByForm.get(formId) ?? [])
        .map((evaluator) => evaluator.evaluatorEmployeeId ?? "")
        .filter(Boolean),
    });

    setEditingFormId(formId);
    setCreateOpen(true);
  }

  /**
   * ผูกผู้ประเมินตามรายชื่อที่เลือก โดยเทียบกับของเดิม
   * เพิ่มเฉพาะคนใหม่ ปิดใช้งานเฉพาะคนที่ถูกเอาออก
   */
  async function syncFormEvaluators(formId: string, nextIds: string[]) {
    const wanted = new Set(nextIds.filter(Boolean));
    const current = activeEvaluatorsByForm.get(formId) ?? [];

    const currentIds = new Set(
      current.map((evaluator) => evaluator.evaluatorEmployeeId ?? ""),
    );

    let failed = 0;

    for (const evaluatorEmployeeId of wanted) {
      if (currentIds.has(evaluatorEmployeeId)) continue;

      try {
        await createEvaluator({ formId, evaluatorEmployeeId });
      } catch (error) {
        console.error(error);
        failed += 1;
      }
    }

    for (const evaluator of current) {
      if (wanted.has(evaluator.evaluatorEmployeeId ?? "")) continue;

      try {
        await deleteEvaluator(evaluator.id);
      } catch (error) {
        console.error(error);
        failed += 1;
      }
    }

    return failed;
  }

  async function handleUpdateForm() {
    if (!editingFormId) return false;

    if (!formDraft.code.trim() || !formDraft.name.trim()) {
      toast.warning("กรุณากรอกรหัสและชื่อแบบประเมิน");
      return false;
    }

    if (formDraft.questions.length === 0) {
      toast.warning("ต้องมีหัวข้อประเมินอย่างน้อย 1 ข้อ");
      return false;
    }

    setLoading(true);

    try {
      await updateEvaluationForm(editingFormId, {
        code: formDraft.code.trim(),
        name: formDraft.name.trim(),
        description: formDraft.description.trim() || undefined,
        periodType: formDraft.periodType,
        ...buildScoreFields(formDraft),
        status: formDraft.status,
        questions: formDraft.questions.map((question, index) => ({
          title: question.title.trim(),
          description: question.description?.trim() || undefined,
          type: question.type,
          maxScore: Number(question.maxScore || 5),
          weight: Number(question.weight || 1),
          sortOrder: index + 1,
          isRequired: question.isRequired,
        })),
      });

      const failed = await syncFormEvaluators(
        editingFormId,
        formDraft.evaluatorIds,
      );

      await Promise.all([loadForms(), loadEvaluators()]);

      if (failed > 0) {
        toast.warning(
          `บันทึกแบบประเมินแล้ว แต่ปรับผู้ประเมินไม่สำเร็จ ${failed} รายการ`,
        );
      } else {
        toast.success("บันทึกแบบประเมินสำเร็จ");
      }

      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function handleDeleteForm(formId: string) {
    const form = forms.find((item) => item.id === formId);
    if (!form) return;

    setActionDialog({
      title: "ลบแบบประเมิน",
      description: `ต้องการลบ "${form.name}" ใช่ไหม หากเคยใช้ประเมินไปแล้วระบบจะไม่ให้ลบ ให้เปลี่ยนสถานะเป็นเก็บถาวรแทน`,
      confirmLabel: "ลบแบบประเมิน",
      tone: "red",
      onConfirm: async () => {
        setLoading(true);

        try {
          await deleteEvaluationForm(formId);
          await Promise.all([loadForms(), loadEvaluators()]);
          toast.success("ลบแบบประเมินสำเร็จ");
        } catch (error) {
          console.error(error);
          toast.error(
            error instanceof Error
              ? error.message
              : "ลบไม่สำเร็จ — อาจมีผลประเมินที่ใช้แบบนี้อยู่",
          );
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function handleCreateForm() {
    if (!formDraft.code.trim() || !formDraft.name.trim()) {
      toast.warning("กรุณากรอกรหัสและชื่อแบบประเมิน");
      return false;
    }

    if (formDraft.questions.length === 0) {
      toast.warning("ต้องมีหัวข้อประเมินอย่างน้อย 1 ข้อ");
      return false;
    }

    setLoading(true);

    try {
      const created = await createEvaluationForm({
        companyId: formDraft.companyId || undefined,
        code: formDraft.code.trim(),
        name: formDraft.name.trim(),
        description: formDraft.description.trim() || undefined,
        periodType: formDraft.periodType,
        ...buildScoreFields(formDraft),
        status: formDraft.status,
        questions: formDraft.questions.map((question, index) => ({
          title: question.title.trim(),
          description: question.description?.trim() || undefined,
          type: question.type,
          maxScore: Number(question.maxScore || 5),
          weight: Number(question.weight || 1),
          sortOrder: index + 1,
          isRequired: question.isRequired,
        })),
      });

      // ผูกผู้ประเมินที่เลือกไว้ในฟอร์มเดียวกัน จะได้ไม่ต้องไปทำต่อที่แท็บผู้ประเมิน
      // ตัดแถวที่ยังไม่ได้เลือกและที่เลือกซ้ำออกก่อน
      const evaluatorIds = Array.from(
        new Set(formDraft.evaluatorIds.filter(Boolean)),
      );

      let evaluatorFailed = 0;

      if (created?.id && evaluatorIds.length > 0) {
        for (const evaluatorEmployeeId of evaluatorIds) {
          try {
            await createEvaluator({
              formId: created.id,
              evaluatorEmployeeId,
            });
          } catch (error) {
            console.error(error);
            evaluatorFailed += 1;
          }
        }
      }

      setFormDraft((prev) => ({
        ...prev,
        code: "",
        name: "",
        description: "",
        evaluatorIds: [],
      }));

      await Promise.all([loadForms(), loadEvaluators()]);

      if (evaluatorFailed > 0) {
        toast.warning(
          `สร้างแบบประเมินสำเร็จ แต่เพิ่มผู้ประเมินไม่สำเร็จ ${evaluatorFailed} คน`,
        );
      } else if (evaluatorIds.length > 0) {
        toast.success(
          `สร้างแบบประเมินสำเร็จ พร้อมผู้ประเมิน ${evaluatorIds.length} คน`,
        );
      } else {
        toast.success("สร้างแบบประเมินสำเร็จ");
      }

      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function addQuestion() {
    setFormDraft((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          title: "",
          description: "",
          type: "SCORE",
          maxScore: 5,
          weight: 1,
          sortOrder: prev.questions.length + 1,
          isRequired: true,
        },
      ],
    }));
  }

  function updateQuestion(
    index: number,
    key: keyof FormDraft["questions"][number],
    value: string | number | boolean,
  ) {
    setFormDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [key]: value } : question,
      ),
    }));
  }

  function removeQuestion(index: number) {
    setFormDraft((prev) => ({
      ...prev,
      questions: prev.questions.filter(
        (_, questionIndex) => questionIndex !== index,
      ),
    }));
  }

  function closeCreate() {
    setCreateOpen(false);
    setEditingFormId(null);
  }

  return (
    <>
      {/* แถบเครื่องมือพื้นเทาอ่อน คั่นตัวเองออกจากแท็บด้านบนและรายการด้านล่าง */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="min-w-[16rem] flex-1 [&_input]:bg-white">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหารหัสหรือชื่อแบบประเมิน"
            aria-label="ค้นหาแบบประเมิน"
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            onClick={() => void reloadAll()}
            disabled={loading}
            icon={
              <RefreshCcw
                className={joinClassName(
                  "h-3.5 w-3.5",
                  loading && "animate-spin",
                )}
              />
            }
          >
            รีเฟรช
          </Button>

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => {
              setEditingFormId(null);
              setCreateOpen(true);
            }}
          >
            สร้างแบบประเมิน
          </Button>
        </div>
      </div>

      {/*
       * รายการทีละใบ ไม่ใช่ตาราง — แบบประเมินหนึ่งใบมีข้อมูลหลายชนิดปนกัน
       * (รอบ จำนวนหัวข้อ คะแนนเต็ม เกณฑ์ผ่าน ผู้ประเมิน) ยัดลงคอลัมน์แล้วแต่ละช่อง
       * เหลือที่นิดเดียวจนต้องตัดคำ
       */}
      <div className="divide-y divide-slate-200">
        {loading && forms.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          </div>
        ) : forms.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ยังไม่มีแบบประเมิน
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              กด &ldquo;สร้างแบบประเมิน&rdquo;
              เพื่อตั้งหัวข้อและเกณฑ์ผ่านของรอบนี้
            </p>
          </div>
        ) : (
          forms.map((item) => (
            <FormRow
              key={item.id}
              item={item}
              evaluatorCount={evaluatorCountByForm[item.id] ?? 0}
              onEdit={() => openFormEditor(item.id)}
              onDelete={() => handleDeleteForm(item.id)}
            />
          ))
        )}
      </div>

      {createOpen ? (
        <Modal
          open
          size="lg"
          title={editingFormId ? "แก้ไขแบบประเมิน" : "สร้างแบบประเมิน"}
          onClose={closeCreate}
        >
          <FormBuilder
            draft={formDraft}
            companies={companies}
            employees={employees}
            loading={loading}
            isEditing={Boolean(editingFormId)}
            onChange={setFormDraft}
            onAddQuestion={addQuestion}
            onUpdateQuestion={updateQuestion}
            onRemoveQuestion={removeQuestion}
            onCancel={closeCreate}
            onSubmit={async () => {
              const ok = editingFormId
                ? await handleUpdateForm()
                : await handleCreateForm();

              if (ok) closeCreate();
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
/* Create/edit form                                                    */
/* ------------------------------------------------------------------ */

/**
 * คะแนนเต็มของแบบประเมิน = ผลรวมของ (คะแนนเต็มรายข้อ × น้ำหนัก)
 * ต้องตรงกับสูตรใน backend (evaluation-score.util.ts) เป๊ะ ไม่งั้นเกณฑ์ผ่านที่ตั้งไว้
 * จะไม่ตรงกับเปอร์เซ็นต์ที่ระบบคำนวณตอนให้คะแนนจริง
 */
function computeTotalScore(
  questions: Array<{ maxScore: number; weight: number }>,
) {
  return questions.reduce(
    (sum, question) =>
      sum + (Number(question.maxScore) || 0) * (Number(question.weight) || 1),
    0,
  );
}

/**
 * แปลงเกณฑ์ผ่านเป็นคู่ totalScore/passScore ที่ backend เก็บอยู่
 * เก็บเป็นคะแนนดิบเหมือนเดิมเพื่อไม่ต้องแก้สคีมาและของเดิมที่อ่านค่านี้อยู่
 */
function buildScoreFields(draft: FormDraft) {
  const totalScore = computeTotalScore(draft.questions);
  const percent = Math.min(100, Math.max(0, Number(draft.passPercent) || 0));

  return {
    totalScore,
    passScore: Math.round((totalScore * percent) / 100),
  };
}

type FormDraft = {
  companyId: string;
  code: string;
  name: string;
  description: string;
  periodType: EvaluationPeriodType;
  /** เกณฑ์ผ่านเป็นเปอร์เซ็นต์ของคะแนนเต็ม — คะแนนเต็มคำนวณจากหัวข้อ ไม่ต้องกรอก */
  passPercent: number;
  status: EvaluationFormStatus;
  questions: Array<{
    title: string;
    description: string;
    type: EvaluationQuestionType;
    maxScore: number;
    weight: number;
    sortOrder: number;
    isRequired: boolean;
  }>;
  /** ผู้ประเมินที่กำหนดพร้อมกันตอนสร้างฟอร์ม (ว่างได้ ไปเพิ่มทีหลังก็ได้) */
  evaluatorIds: string[];
};

function FormBuilder({
  draft,
  companies,
  employees,
  loading,
  isEditing,
  onChange,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
  onCancel,
  onSubmit,
}: {
  draft: FormDraft;
  companies: CompanyOption[];
  employees: EmployeeOption[];
  loading: boolean;
  isEditing: boolean;
  onChange: Dispatch<SetStateAction<FormDraft>>;
  onAddQuestion: () => void;
  onUpdateQuestion: (
    index: number,
    key: keyof FormDraft["questions"][number],
    value: string | number | boolean,
  ) => void;
  onRemoveQuestion: (index: number) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const draftTotalScore = computeTotalScore(draft.questions);
  const passRawScore = Math.round(
    (draftTotalScore *
      Math.min(100, Math.max(0, Number(draft.passPercent) || 0))) /
      100,
  );

  /* ฟอร์มเก่าที่เคยตั้งน้ำหนักไว้ ยังคำนวณด้วยน้ำหนักเดิม ต้องบอกให้รู้ว่ามีอยู่ */
  const hasLegacyWeight = draft.questions.some(
    (question) => Number(question.weight) !== 1,
  );

  const companyLabel =
    companies.find((company) => company.id === draft.companyId)?.nameTh ??
    companies.find((company) => company.id === draft.companyId)?.name ??
    "ทุกบริษัท";

  return (
    /*
     * ฟอร์มแบ่งเป็นหัวข้อย่อยคั่นด้วยเส้นบาง ไม่ใช้กล่องเทาครอบเป็นก้อน ๆ
     * ป๊อปอัพเป็นผืนเดียว แบ่งส่วนด้วยเส้นเหมือนหน้าอื่นในระบบ
     */
    <div className="space-y-5">
      <FormSection title="ข้อมูลแบบประเมิน">
        <div className="grid gap-3 sm:grid-cols-2">
          {isEditing ? (
            <Field label="บริษัท">
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-600 3xl:h-10">
                {companyLabel}
              </div>
            </Field>
          ) : (
            <Field label="บริษัท">
              <Select
                value={draft.companyId}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    companyId: event.target.value,
                  }))
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
          )}

          <Field label="สถานะ">
            <Select
              value={draft.status}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  status: event.target.value as EvaluationFormStatus,
                }))
              }
            >
              <option value="DRAFT">ร่าง</option>
              <option value="ACTIVE">ใช้งาน</option>
              <option value="ARCHIVED">เก็บถาวร</option>
            </Select>
          </Field>

          <Field label="รหัสแบบประเมิน" required>
            <TextInput
              value={draft.code}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, code: event.target.value }))
              }
              placeholder="เช่น EVAL_ANNUAL"
            />
          </Field>

          <Field label="ชื่อแบบประเมิน" required>
            <TextInput
              value={draft.name}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="เช่น ประเมินประจำปี"
            />
          </Field>

          <Field
            label="ใช้กับรอบ"
            hint={
              draft.periodType === "PROBATION"
                ? "แบบนี้จะเลือกใช้ได้ตอนรีวิวทดลองงานที่หน้าเริ่มงานพนักงานใหม่"
                : undefined
            }
          >
            <Select
              value={draft.periodType}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  periodType: event.target.value as EvaluationPeriodType,
                }))
              }
            >
              {Object.entries(periodTypeText).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          {/*
          ไม่ต้องกรอกคะแนนเต็มแล้ว — คิดจากหัวข้อประเมินให้เอง
          เดิมกรอกเองได้ทำให้ตั้ง 100 แต่หัวข้อรวมกันได้ 15 เกณฑ์ผ่านจึงเพี้ยน
        */}
          <Field
            label="เกณฑ์ผ่าน (%)"
            hint={`คะแนนเต็มจากหัวข้อ ${draftTotalScore.toLocaleString("th-TH")} คะแนน · ผ่านที่ ${passRawScore.toLocaleString("th-TH")} คะแนนขึ้นไป`}
          >
            <TextInput
              type="number"
              min={0}
              max={100}
              value={draft.passPercent}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  passPercent: Number(event.target.value),
                }))
              }
            />
          </Field>
        </div>

        <Field label="คำอธิบาย" className="mt-3">
          <Textarea
            rows={2}
            value={draft.description}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </Field>
      </FormSection>

      <FormSection
        title="หัวข้อประเมิน"
        hint={`คะแนนเต็มรวม ${draftTotalScore.toLocaleString("th-TH")} คะแนน · ข้อที่สำคัญกว่าให้ตั้งคะแนนเต็มสูงกว่า`}
        action={
          <Button
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={onAddQuestion}
          >
            เพิ่มหัวข้อ
          </Button>
        }
      >
        {hasLegacyWeight ? (
          <p className="mb-2 text-[11.5px] font-semibold text-amber-700">
            แบบนี้มีหัวข้อที่ตั้งน้ำหนักไว้ไม่เท่ากับ 1 จากระบบเดิม —
            คะแนนเต็มรวมด้านบนคิดน้ำหนักนั้นไว้แล้ว
          </p>
        ) : null}

        {/*
          หัวคอลัมน์ — เดิมเป็นช่องตัวเลขเปล่า ๆ ต้องเอาเมาส์ไปชี้ค้างถึงจะรู้ว่าคืออะไร
        */}
        {draft.questions.length > 0 ? (
          <div className="hidden gap-2 pb-1 md:grid md:grid-cols-[1fr_130px_110px_auto]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
              หัวข้อ
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
              ประเภท
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
              คะแนนเต็ม
            </span>
            <span className="w-9" />
          </div>
        ) : null}

        <div className="divide-y divide-brand-100 border-y border-brand-100">
          {draft.questions.map((question, index) => (
            <div
              key={index}
              className="grid gap-2 py-2 md:grid-cols-[1fr_130px_110px_auto]"
            >
              <TextInput
                value={question.title}
                onChange={(event) =>
                  onUpdateQuestion(index, "title", event.target.value)
                }
                placeholder="หัวข้อประเมิน"
              />

              <Select
                value={question.type}
                onChange={(event) =>
                  onUpdateQuestion(index, "type", event.target.value)
                }
              >
                <option value="SCORE">ให้คะแนน</option>
                <option value="TEXT">ข้อความ</option>
                <option value="YES_NO">ใช่ / ไม่ใช่</option>
              </Select>

              {/*
                ช่อง "น้ำหนัก" ถูกเอาออก — มันทำเรื่องเดียวกับคะแนนเต็มทุกประการ
                (สูตรคูณน้ำหนักทั้งตัวตั้งและตัวหาร ผลลัพธ์เป็นเปอร์เซ็นต์เท่ากัน)
                เหลือกลไกเดียว: ข้อไหนสำคัญกว่าก็ให้คะแนนเต็มสูงกว่า
              */}
              <TextInput
                type="number"
                min={0}
                value={question.maxScore}
                onChange={(event) =>
                  onUpdateQuestion(
                    index,
                    "maxScore",
                    Number(event.target.value),
                  )
                }
                aria-label="คะแนนเต็มของข้อนี้"
                title="คะแนนเต็มของข้อนี้ — ข้อที่สำคัญกว่าให้ตั้งสูงกว่า"
              />

              <button
                type="button"
                onClick={() => onRemoveQuestion(index)}
                aria-label="ลบหัวข้อ"
                className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 3xl:h-10 3xl:w-10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="ผู้ประเมิน"
        hint="เลือกได้หลายคน เว้นว่างไว้ก็ได้ แล้วไปเพิ่มทีหลังก็ได้"
      >
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <Badge tone="brand">
            เลือกแล้ว {draft.evaluatorIds.length.toLocaleString("th-TH")} คน
          </Badge>
        </div>

        <div className="mt-3 space-y-2">
          {draft.evaluatorIds.map((evaluatorId, index) => (
            <div key={`${evaluatorId}-${index}`} className="flex gap-2">
              <Select
                value={evaluatorId}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange((prev) => ({
                    ...prev,
                    evaluatorIds: prev.evaluatorIds.map((item, position) =>
                      position === index ? value : item,
                    ),
                  }));
                }}
              >
                <option value="">เลือกผู้ประเมิน</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeCode} · {employeeName(employee)}
                  </option>
                ))}
              </Select>

              <button
                type="button"
                aria-label="ลบผู้ประเมิน"
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    evaluatorIds: prev.evaluatorIds.filter(
                      (_, position) => position !== index,
                    ),
                  }))
                }
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 3xl:h-10 3xl:w-10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <Button
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() =>
              onChange((prev) => ({
                ...prev,
                evaluatorIds: [...prev.evaluatorIds, ""],
              }))
            }
          >
            เพิ่มผู้ประเมิน
          </Button>
        </div>
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-brand-100 pt-4">
        <Button onClick={onCancel} disabled={loading}>
          ยกเลิก
        </Button>
        <Button variant="primary" loading={loading} onClick={onSubmit}>
          {isEditing ? "บันทึกการแก้ไข" : "สร้างแบบประเมิน"}
        </Button>
      </div>
    </div>
  );
}
