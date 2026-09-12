"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, Plus, RefreshCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate } from "@/lib/date-format";

import {
  apiFetch,
  cancelEvaluationResult,
  createEvaluationResult,
  finalizeEvaluationResult,
  getEvaluationForms,
  getEvaluationResults,
  submitEvaluationResult,
} from "@/lib/api";

import type {
  EvaluationForm,
  EvaluationQuestionType,
  EvaluationResult,
  EvaluationResultListSummary,
  EvaluationResultStatus,
} from "@/types/performance";

import {
  Avatar,
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
 * แท็บ "ผลประเมิน"
 * -----------------
 * บันทึกผลรายคนตามแบบประเมินที่มีอยู่แล้ว ร่าง → ส่งผล → ปิดผล
 * ตรรกะทั้งหมด (การตรวจข้อมูลก่อนบันทึก การสร้าง scoreItems ตามประเภทคำถาม)
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

const emptySummary: EvaluationResultListSummary = {
  total: 0,
  draft: 0,
  submitted: 0,
  finalized: 0,
  cancelled: 0,
  avgPercent: 0,
};

const resultStatusText: Record<EvaluationResultStatus, string> = {
  DRAFT: "ร่าง",
  SUBMITTED: "ส่งแล้ว",
  FINALIZED: "ปิดผลแล้ว",
  CANCELLED: "ยกเลิก",
};

const questionTypeText: Record<EvaluationQuestionType, string> = {
  SCORE: "ให้คะแนน",
  TEXT: "ข้อความ",
  YES_NO: "ใช่ / ไม่ใช่",
};

/**
 * ผลประเมินหนึ่งใบในรายการ — บรรทัดเดียว
 * ใครถูกประเมิน · ใช้แบบไหนรอบไหน · ใครเป็นคนประเมิน · ได้กี่คะแนน · สถานะอะไร
 */
function ResultRow({
  item,
  onOpen,
  onAction,
}: {
  item: EvaluationResult;
  onOpen: () => void;
  onAction: (action: "submit" | "finalize" | "cancel") => void;
}) {
  const percent = toNumber(item.percent);
  const menu = [
    ...(item.status === "DRAFT"
      ? [
          {
            label: "ส่งผล",
            icon: <Send className="h-4 w-4" />,
            onSelect: () => onAction("submit"),
          },
        ]
      : []),
    ...(item.status === "SUBMITTED"
      ? [
          {
            label: "ปิดผล",
            icon: <CheckCircle2 className="h-4 w-4" />,
            onSelect: () => onAction("finalize"),
          },
        ]
      : []),
    ...(item.status !== "FINALIZED" && item.status !== "CANCELLED"
      ? [
          {
            label: "ยกเลิกผลประเมิน",
            icon: <Ban className="h-4 w-4" />,
            tone: "danger" as const,
            separated: true,
            onSelect: () => onAction("cancel"),
          },
        ]
      : []),
  ];

  return (
    <article className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8">
      <div className="flex min-w-[15rem] flex-1 items-center gap-3">
        <Avatar name={employeeName(item.employee)} size="md" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="whitespace-nowrap text-[14px] font-bold text-slate-900 3xl:text-[15px]">
              {employeeName(item.employee)}
            </p>
            {item.probationRecordId ? (
              <Link
                href="/onboarding"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-bold text-violet-700 transition hover:bg-violet-100"
              >
                จากการรีวิวทดลองงาน
              </Link>
            ) : null}
          </div>
          <p className="truncate text-[12px] text-slate-500 3xl:text-[12.5px]">
            {[item.form?.name, item.periodName, item.summary]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>
      </div>

      {/* ใครเป็นคนประเมิน */}
      <div className="w-44 shrink-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          ผู้ประเมิน
        </p>
        {item.evaluatorEmployee ? (
          <p className="whitespace-nowrap text-[12.5px] font-semibold text-slate-800 3xl:text-[13px]">
            {employeeName(item.evaluatorEmployee)}
          </p>
        ) : (
          <p className="text-[12.5px] text-slate-300">ไม่ระบุ</p>
        )}
      </div>

      {/* ได้กี่คะแนน */}
      <div className="w-32 shrink-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          คะแนน
        </p>
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[14px] font-bold tabular-nums text-slate-900 3xl:text-[15px]">
            {toNumber(item.totalScore).toLocaleString("th-TH")}
          </span>
          <span className="text-[11.5px] tabular-nums text-slate-400">
            / {toNumber(item.maxScore).toLocaleString("th-TH")}
          </span>
          {percent > 0 ? (
            <span className="text-[12px] font-bold tabular-nums text-emerald-600">
              {percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%
            </span>
          ) : null}
        </p>
      </div>

      {/* ประเมินเมื่อไร */}
      <div className="w-28 shrink-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          วันที่ประเมิน
        </p>
        <p className="truncate text-[12.5px] tabular-nums text-slate-700 3xl:text-[13px]">
          {formatThaiDate(item.evaluationDate)}
        </p>
      </div>

      <div className="w-20 shrink-0">
        <Badge tone={resultStatusTone(item.status)}>
          {resultStatusText[item.status]}
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" onClick={onOpen}>
          รายละเอียด
        </Button>
        {menu.length > 0 ? <RowMenu items={menu} /> : null}
      </div>
    </article>
  );
}

/** หัวข้อย่อยในฟอร์ม — ป้ายฟ้าคั่นด้วยเส้นบาง แทนการครอบเป็นกล่องเทา */
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

function resultStatusTone(status: EvaluationResultStatus): Tone {
  if (status === "FINALIZED") return "positive";
  if (status === "SUBMITTED") return "brand";
  if (status === "CANCELLED") return "critical";
  return "neutral";
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
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

export type ResultsSummary = EvaluationResultListSummary;

export function ResultsPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: ResultsSummary) => void;
}) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);

  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [summary, setSummary] =
    useState<EvaluationResultListSummary>(emptySummary);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [resultDraft, setResultDraft] = useState<ResultDraft>({
    companyId: "",
    formId: "",
    employeeId: "",
    evaluatorEmployeeId: "",
    periodName: "",
    evaluationDate: todayDate(),
    summary: "",
    recommendation: "",
    note: "",
  });

  const [scoreMap, setScoreMap] = useState<Record<string, string>>({});
  /** ใบประเมินที่กำลังเปิดดูรายละเอียด */
  const [detailResult, setDetailResult] = useState<EvaluationResult | null>(
    null,
  );

  useEffect(() => {
    onSummaryChange?.(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const activeForm = useMemo(() => {
    return forms.find((item) => item.id === resultDraft.formId) ?? null;
  }, [forms, resultDraft.formId]);

  async function loadBaseData() {
    const [companyData, employeeData, formData] = await Promise.all([
      apiFetch<CompanyOption[]>("/organization/companies"),
      apiFetch<EmployeeListResponse>("/employees?page=1&pageSize=100"),
      getEvaluationForms({ page: 1, pageSize: 100 }),
    ]);

    setCompanies(Array.isArray(companyData) ? companyData : []);
    setEmployees(employeeData.items ?? []);
    setForms(formData.items ?? []);

    if (!resultDraft.companyId && companyData?.[0]?.id) {
      setResultDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || companyData[0].id,
      }));
    }

    const firstFormId = formData.items?.[0]?.id;
    if (!resultDraft.formId && firstFormId) {
      setResultDraft((prev) => ({
        ...prev,
        formId: prev.formId || firstFormId,
      }));
    }
  }

  async function loadResults() {
    const data = await getEvaluationResults({
      page: 1,
      pageSize: 100,
      q: search.trim() || undefined,
    });

    setResults(data.items ?? []);
    setSummary(data.summary ?? emptySummary);
  }

  async function reloadAll() {
    setLoading(true);

    try {
      await Promise.all([loadBaseData(), loadResults()]);
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

  useEffect(() => {
    if (!activeForm) return;

    const nextScores: Record<string, string> = {};

    activeForm.questions.forEach((question) => {
      nextScores[question.id] = scoreMap[question.id] ?? "";
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScoreMap(nextScores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeForm?.id]);

  async function handleCreateResult() {
    if (
      !resultDraft.companyId ||
      !resultDraft.formId ||
      !resultDraft.employeeId ||
      !resultDraft.evaluationDate
    ) {
      toast.warning("กรุณาเลือกบริษัท แบบประเมิน พนักงาน และวันที่ประเมิน");
      return false;
    }

    if (!activeForm || activeForm.questions.length === 0) {
      toast.warning("แบบประเมินนี้ยังไม่มีหัวข้อประเมิน");
      return false;
    }

    setLoading(true);

    try {
      await createEvaluationResult({
        companyId: resultDraft.companyId,
        formId: resultDraft.formId,
        employeeId: resultDraft.employeeId,
        evaluatorEmployeeId: resultDraft.evaluatorEmployeeId || undefined,
        periodName: resultDraft.periodName.trim() || undefined,
        evaluationDate: resultDraft.evaluationDate,
        scoreItems: activeForm.questions.map((question) => ({
          questionId: question.id,
          score:
            question.type === "SCORE"
              ? Number(scoreMap[question.id] || 0)
              : undefined,
          textValue:
            question.type !== "SCORE" ? scoreMap[question.id] || "" : undefined,
        })),
        summary: resultDraft.summary.trim() || undefined,
        recommendation: resultDraft.recommendation.trim() || undefined,
        note: resultDraft.note.trim() || undefined,
      });

      setScoreMap({});
      setResultDraft((prev) => ({
        ...prev,
        employeeId: "",
        periodName: "",
        summary: "",
        recommendation: "",
        note: "",
      }));

      await loadResults();
      toast.success("บันทึกผลประเมินสำเร็จ");
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleResultAction(
    action: "submit" | "finalize" | "cancel",
    id: string,
  ) {
    setLoading(true);

    try {
      if (action === "submit") await submitEvaluationResult(id);
      if (action === "finalize") await finalizeEvaluationResult(id);
      if (action === "cancel") await cancelEvaluationResult(id);

      await loadResults();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* แถบเครื่องมือพื้นเทาอ่อน คั่นตัวเองออกจากแท็บด้านบนและรายการด้านล่าง */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="min-w-[16rem] flex-1 [&_input]:bg-white">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาพนักงานหรือรอบประเมิน"
            aria-label="ค้นหาผลประเมิน"
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
            onClick={() => setCreateOpen(true)}
          >
            บันทึกผลประเมิน
          </Button>
        </div>
      </div>

      {/*
       * รายการทีละใบ ไม่ใช่ตาราง — ใบผลประเมินมีทั้งคนถูกประเมิน คนประเมิน
       * แบบที่ใช้ คะแนน และสถานะ ยัดลงคอลัมน์แล้วแต่ละช่องเหลือที่นิดเดียว
       */}
      <div className="divide-y divide-slate-200">
        {loading && results.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ยังไม่มีผลประเมิน
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              กด &ldquo;บันทึกผลประเมิน&rdquo; เพื่อบันทึกคะแนนของรอบนี้
            </p>
          </div>
        ) : (
          results.map((item) => (
            <ResultRow
              key={item.id}
              item={item}
              onOpen={() => setDetailResult(item)}
              onAction={(action) => void handleResultAction(action, item.id)}
            />
          ))
        )}
      </div>

      {detailResult ? (
        <Modal
          open
          title="รายละเอียดผลประเมิน"
          size="lg"
          footer={
            <Button variant="secondary" onClick={() => setDetailResult(null)}>
              ปิด
            </Button>
          }
          onClose={() => setDetailResult(null)}
        >
          <ResultDetail result={detailResult} />
        </Modal>
      ) : null}

      {createOpen ? (
        <Modal
          open
          size="lg"
          title="บันทึกผลประเมิน"
          onClose={() => setCreateOpen(false)}
        >
          <ResultForm
            draft={resultDraft}
            companies={companies}
            employees={employees}
            forms={forms}
            activeForm={activeForm}
            scoreMap={scoreMap}
            loading={loading}
            onChange={setResultDraft}
            onScoreChange={(questionId, value) =>
              setScoreMap((prev) => ({ ...prev, [questionId]: value }))
            }
            onCancel={() => setCreateOpen(false)}
            onSubmit={async () => {
              if (await handleCreateResult()) setCreateOpen(false);
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Create-result form                                                  */
/* ------------------------------------------------------------------ */

/**
 * รายละเอียดผลประเมินหนึ่งใบ
 * เดิมเห็นได้แค่คะแนนรวมในตาราง ไม่รู้ว่าแต่ละข้อได้เท่าไร ใครเป็นคนประเมิน
 * และเขียนสรุปว่าอะไร ทั้งที่ข้อมูลถูกเก็บไว้ครบแล้ว
 */
function ResultDetail({ result }: { result: EvaluationResult }) {
  const percent = toNumber(result.percent);
  const items = result.scoreItems ?? [];

  // ข้อมูลของใบนี้ที่ไม่ได้อยู่ในแถบตัวตนด้านบน
  const facts: Array<{ label: string; value: string; muted?: boolean }> = [
    {
      label: "ผู้ประเมิน",
      value: result.evaluatorEmployee
        ? employeeName(result.evaluatorEmployee)
        : "ไม่ระบุ",
      muted: !result.evaluatorEmployee,
    },
    {
      label: "รอบประเมิน",
      value: result.periodName || "ไม่ระบุ",
      muted: !result.periodName,
    },
    { label: "วันที่ประเมิน", value: formatThaiDate(result.evaluationDate) },
  ];

  const notes = [
    { label: "สรุปผล", value: result.summary },
    { label: "ข้อเสนอแนะ", value: result.recommendation },
    { label: "หมายเหตุ", value: result.note },
  ].filter((row) => row.value);

  return (
    /*
     * กล่องเดียวแบ่งด้วยเส้น ไม่ซ้อนกล่องในกล่อง
     * แถบตัวตนกินเต็มความกว้างของป๊อปอัพ จึงต้องถอยขอบในของ Modal ออก
     */
    <div className="-mx-5 -mt-4">
      <div className="border-b border-brand-100 bg-brand-50/50 px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Avatar name={employeeName(result.employee)} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="whitespace-nowrap text-[14px] font-bold text-slate-900 3xl:text-[15px]">
                {employeeName(result.employee)}
              </p>
              <Badge tone={resultStatusTone(result.status)}>
                {resultStatusText[result.status]}
              </Badge>
            </div>
            <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
              {[
                result.employee?.employeeCode,
                result.employee?.position,
                result.employee?.department?.nameTh,
                result.form?.name,
              ]
                .filter(Boolean)
                .join(" · ") || "-"}
            </p>
          </div>

          {/* คะแนนรวม — ตัวเลขดำตัวเดียวที่เป็นพระเอกของใบนี้ */}
          <div className="shrink-0 text-right">
            <p className="flex items-baseline justify-end gap-1">
              <span className="text-[22px] font-bold leading-none tabular-nums text-slate-900 3xl:text-[24px]">
                {toNumber(result.totalScore).toLocaleString("th-TH")}
              </span>
              <span className="text-[13px] tabular-nums text-slate-400">
                / {toNumber(result.maxScore).toLocaleString("th-TH")}
              </span>
            </p>
            <p className="mt-0.5 text-[11.5px] tabular-nums text-slate-500">
              คิดเป็น{" "}
              {percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%
            </p>
          </div>
        </div>

        {/* แถบยาวอ่านง่ายกว่าเลขเปอร์เซ็นต์ ว่าได้มาประมาณไหนของเต็ม */}
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      </div>

      {/* ข้อมูลใบนี้ เรียงติดกันคั่นด้วยเส้น */}
      <dl className="grid grid-cols-2 divide-x divide-brand-100 border-b border-brand-100 px-5 py-2.5 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0 px-3 first:pl-0 last:pr-0">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              {fact.label}
            </dt>
            <dd
              className={joinClassName(
                "mt-0.5 truncate text-[13px] 3xl:text-[13.5px]",
                fact.muted ? "text-slate-300" : "text-slate-800",
              )}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-5 px-5 py-4">
        {/* คะแนนรายข้อ — ของจริงที่ใช้ตัดสิน ควรกางให้เห็นทั้งหมด */}
        <section>
          <p className="border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            คะแนนรายข้อ
          </p>

          {items.length === 0 ? (
            <p className="py-3 text-[13px] text-slate-400">
              ไม่มีรายละเอียดคะแนนรายข้อ
            </p>
          ) : (
            <ul className="divide-y divide-brand-100">
              {items.map((item, index) => (
                <li
                  key={`${item.questionId}-${index}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
                >
                  <div className="min-w-[10rem] flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="truncate text-[11px] text-slate-400 3xl:text-[11.5px]">
                      {item.type
                        ? (questionTypeText[item.type] ?? item.type)
                        : "-"}
                      {toNumber(item.weight) !== 1
                        ? ` · น้ำหนัก ${toNumber(item.weight)}`
                        : ""}
                      {item.note ? ` · ${item.note}` : ""}
                    </p>
                  </div>

                  {item.type === "SCORE" ? (
                    <p className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
                      <span className="text-[14px] font-bold tabular-nums text-slate-900 3xl:text-[15px]">
                        {toNumber(item.score).toLocaleString("th-TH")}
                      </span>
                      <span className="text-[11.5px] tabular-nums text-slate-400">
                        / {toNumber(item.maxScore).toLocaleString("th-TH")}
                      </span>
                    </p>
                  ) : (
                    <p className="max-w-[50%] truncate text-[13px] text-slate-700">
                      {item.textValue || "-"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {notes.length > 0 ? (
          <section className="space-y-3">
            {notes.map((row) => (
              <div key={row.label}>
                <p className="border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  {row.label}
                </p>
                <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6 text-slate-700 3xl:text-[13.5px]">
                  {row.value}
                </p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

type ResultDraft = {
  companyId: string;
  formId: string;
  employeeId: string;
  evaluatorEmployeeId: string;
  periodName: string;
  evaluationDate: string;
  summary: string;
  recommendation: string;
  note: string;
};

function ResultForm({
  draft,
  companies,
  employees,
  forms,
  activeForm,
  scoreMap,
  loading,
  onChange,
  onScoreChange,
  onCancel,
  onSubmit,
}: {
  draft: ResultDraft;
  companies: CompanyOption[];
  employees: EmployeeOption[];
  forms: EvaluationForm[];
  activeForm: EvaluationForm | null;
  scoreMap: Record<string, string>;
  loading: boolean;
  onChange: Dispatch<SetStateAction<ResultDraft>>;
  onScoreChange: (questionId: string, value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  /*
   * คะแนนรวมที่กรอกไปแล้ว — เดิมต้องกดบันทึกก่อนถึงจะรู้ว่าได้เท่าไร
   * ทั้งที่ตอนให้คะแนนคือตอนที่อยากรู้ที่สุดว่ารวมแล้วผ่านเกณฑ์หรือยัง
   */
  const scoredTotal = (activeForm?.questions ?? []).reduce((sum, question) => {
    if (question.type !== "SCORE") return sum;
    const value = Number(scoreMap[question.id]);
    if (!Number.isFinite(value)) return sum;
    return sum + value * (toNumber(question.weight) || 1);
  }, 0);
  const scoredMax = (activeForm?.questions ?? []).reduce((sum, question) => {
    if (question.type !== "SCORE") return sum;
    return sum + toNumber(question.maxScore) * (toNumber(question.weight) || 1);
  }, 0);

  return (
    /*
     * ฟอร์มแบ่งเป็นหัวข้อย่อยคั่นด้วยเส้นบาง ไม่ใช้กล่องเทาครอบเป็นก้อน ๆ
     * ให้เป็นผืนเดียวเหมือนฟอร์มอื่นในระบบ
     */
    <div className="space-y-5">
      <FormSection title="ข้อมูลผลประเมิน">
        <div className="grid gap-3 sm:grid-cols-2">
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

          <Field label="พนักงานที่ถูกประเมิน">
            <Select
              value={draft.employeeId}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  employeeId: event.target.value,
                }))
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

          {/*
          ผู้ประเมิน — เดิมไม่มีให้เลือกเลย ระบบจึงบันทึกเป็นคนที่ล็อกอินอยู่เสมอ
          ทั้งที่บ่อยครั้ง HR เป็นคนคีย์แทนหัวหน้าที่เป็นคนประเมินจริง
        */}
          <Field
            label="ผู้ประเมิน"
            hint="ไม่เลือก = บันทึกเป็นผู้ที่กำลังใช้งานระบบ"
          >
            <Select
              value={draft.evaluatorEmployeeId}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  evaluatorEmployeeId: event.target.value,
                }))
              }
            >
              <option value="">เลือกผู้ประเมิน</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeCode} · {employeeName(employee)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="แบบประเมิน" required>
            <Select
              value={draft.formId}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, formId: event.target.value }))
              }
            >
              <option value="">เลือกแบบประเมิน</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.code} · {form.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="รอบประเมิน">
            <TextInput
              value={draft.periodName}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  periodName: event.target.value,
                }))
              }
              placeholder="เช่น ปี 2569"
            />
          </Field>

          <Field label="วันที่ประเมิน" required>
            <ThaiDateInput
              value={draft.evaluationDate}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  evaluationDate: event.target.value,
                }))
              }
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="ให้คะแนน"
        hint={
          activeForm
            ? `${activeForm.name} · ${activeForm.questions.length} ข้อ`
            : "เลือกแบบประเมินก่อน จึงจะกรอกคะแนนได้"
        }
        action={
          activeForm && scoredMax > 0 ? (
            <p className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[11px] text-slate-400">รวม</span>
              <span className="text-[16px] font-bold tabular-nums text-slate-900">
                {scoredTotal.toLocaleString("th-TH", {
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-[12px] tabular-nums text-slate-400">
                / {scoredMax.toLocaleString("th-TH")}
              </span>
            </p>
          ) : null
        }
      >
        {activeForm ? (
          <div className="divide-y divide-brand-100 border-y border-brand-100">
            {activeForm.questions.map((question) => (
              <div
                key={question.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="text-[13px] font-semibold text-slate-800">
                    {question.title}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {questionTypeText[question.type]}
                    {question.type === "SCORE"
                      ? ` · เต็ม ${toNumber(question.maxScore)}${
                          toNumber(question.weight) !== 1
                            ? ` · น้ำหนัก ${toNumber(question.weight)}`
                            : ""
                        }`
                      : ""}
                  </p>
                </div>

                {/*
                  ช่องคะแนนแคบพอดีตัวเลข ไม่ต้องกว้างเท่าชื่อหัวข้อ
                  (คลาสที่ส่งให้ TextInput ทับความกว้างเดิมไม่ได้ ต้องครอบด้วย div)
                */}
                {question.type === "SCORE" ? (
                  <div className="w-24 shrink-0">
                    <TextInput
                      type="number"
                      min={0}
                      max={toNumber(question.maxScore)}
                      value={scoreMap[question.id] ?? ""}
                      onChange={(event) =>
                        onScoreChange(question.id, event.target.value)
                      }
                      placeholder={`0-${toNumber(question.maxScore)}`}
                    />
                  </div>
                ) : (
                  <div className="w-full sm:w-64">
                    <TextInput
                      value={scoreMap[question.id] ?? ""}
                      onChange={(event) =>
                        onScoreChange(question.id, event.target.value)
                      }
                      placeholder="คำตอบ"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-3 text-[13px] text-slate-400">
            ยังไม่ได้เลือกแบบประเมิน
          </p>
        )}
      </FormSection>

      <FormSection title="สรุปผล" hint="เว้นว่างไว้ก็ได้">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="สรุปผล">
            <Textarea
              rows={2}
              value={draft.summary}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, summary: event.target.value }))
              }
            />
          </Field>

          <Field label="ข้อเสนอแนะ">
            <Textarea
              rows={2}
              value={draft.recommendation}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  recommendation: event.target.value,
                }))
              }
            />
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-brand-100 pt-4">
        <Button onClick={onCancel} disabled={loading}>
          ยกเลิก
        </Button>
        <Button variant="primary" loading={loading} onClick={onSubmit}>
          บันทึกผลประเมิน
        </Button>
      </div>
    </div>
  );
}
