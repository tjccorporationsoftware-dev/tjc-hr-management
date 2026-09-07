"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import {
  createOnboardingDocument,
  deleteOnboardingDocument,
  getEvaluationForms,
  getOnboardingDocumentFileUrl,
  getDocumentEmployees,
  getOnboardingDocuments,
  getProbationRecord,
  rejectOnboardingDocument,
  reviewProbationRecord,
  saveProbationEvaluation,
  submitOnboardingDocument,
  uploadOnboardingDocumentFile,
  verifyOnboardingDocument,
  waiveOnboardingDocument,
} from "@/lib/api";
import type {
  OnboardingDocument,
  OnboardingProgressItem,
  ProbationRecord,
  ProbationStatus,
} from "@/types/onboarding";
import type { EvaluationForm } from "@/types/performance";

import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Field,
  IconButton,
  Modal,
  Notice,
  Select,
  Tabs,
  TextInput,
  Textarea,
  type TabItem,
  type Tone,
} from "@/components/kit";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate } from "@/lib/date-format";

/**
 * รายละเอียดพนักงานใหม่หนึ่งคน — 3 แท็บ
 * ------------------------------------
 * 1) เอกสาร      เลือกจากรายการเอกสารมาตรฐาน กด + เพื่อเพิ่มเป็นรายการที่ต้องส่ง
 * 2) ประเมินผ่านงาน  ดึงแบบประเมินที่สร้างไว้ในหน้า /performance มาให้คะแนน
 * 3) ทดลองงาน    ตรวจความพร้อมว่าข้อมูลจำเป็นครบถูกต้อง แล้วกดผ่านงาน
 */

type DetailTabKey = "documents" | "evaluation" | "probation";

/**
 * เอกสารมาตรฐานที่พนักงานใหม่ต้องส่ง
 * ให้เลือกจากรายการแทนพิมพ์เอง จะได้ไม่มีชื่อเรียกต่างกันคนละแบบในแต่ละคน
 * (สำเนาบัตรประชาชน / สำเนาบัตรประชาชน / บัตรประชาชน) จนนับยอดไม่ได้
 */
const STANDARD_DOCUMENTS: Array<{ name: string; required: boolean }> = [
  { name: "สำเนาบัตรประชาชน", required: true },
  { name: "สำเนาทะเบียนบ้าน", required: true },
  { name: "สำเนาวุฒิการศึกษา", required: true },
  { name: "สำเนาหน้าสมุดบัญชีธนาคาร", required: true },
  { name: "รูปถ่ายขนาด 1 นิ้ว", required: true },
  { name: "ใบรับรองแพทย์", required: true },
  { name: "สำเนาใบผ่านงาน / หนังสือรับรองการทำงาน", required: false },
  { name: "สำเนาทะเบียนสมรส", required: false },
  { name: "สำเนาใบเปลี่ยนชื่อ-สกุล", required: false },
  { name: "สำเนาใบผ่านการเกณฑ์ทหาร (สด.8 / สด.43)", required: false },
  { name: "สำเนาบัตรประกันสังคม", required: false },
  { name: "หนังสือยินยอมให้ตรวจสอบประวัติ", required: false },
];

const DOCUMENT_STATUS_TEXT: Record<string, string> = {
  PENDING: "รอส่ง",
  SUBMITTED: "ส่งแล้ว รอตรวจ",
  VERIFIED: "ตรวจผ่าน",
  REJECTED: "ตีกลับ",
  WAIVED: "ยกเว้นให้",
};

const PROBATION_STATUS_TEXT: Record<string, string> = {
  IN_PROGRESS: "อยู่ระหว่างทดลองงาน",
  PASSED: "ผ่านทดลองงาน",
  FAILED: "ไม่ผ่านทดลองงาน",
  EXTENDED: "ขยายเวลาทดลองงาน",
  CANCELLED: "ยกเลิก",
};

function documentTone(status: string): Tone {
  if (status === "VERIFIED" || status === "WAIVED") return "positive";
  if (status === "REJECTED") return "critical";
  if (status === "SUBMITTED") return "warning";
  return "neutral";
}

function probationTone(status: string): Tone {
  if (status === "PASSED") return "positive";
  if (status === "FAILED") return "critical";
  if (status === "EXTENDED") return "warning";
  if (status === "CANCELLED") return "neutral";
  return "brand";
}

function personName(employee: OnboardingProgressItem["employee"]) {
  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.employeeCode
  );
}

/** หนึ่งข้อของรายการตรวจก่อนผ่านงาน — ผ่านเป็นเขียว ยังไม่ผ่านเป็นส้ม */
function CheckRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span
        className={[
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
          ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
        ].join(" ")}
      >
        {ok ? "✓" : "!"}
      </span>

      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
          {label}
        </p>
        <p className="mt-0.5 text-[12px] text-slate-500 3xl:text-[13px]">
          {detail}
        </p>
      </div>
    </li>
  );
}

export function ProgressDetailModal({
  item,
  onClose,
  onChanged,
}: {
  item: OnboardingProgressItem;
  onClose: () => void;
  /** ให้ตารางข้างหลังโหลดใหม่ ตัวเลขความคืบหน้าจะได้ขยับตาม */
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<DetailTabKey>("documents");

  const [documents, setDocuments] = useState<OnboardingDocument[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  /** ใบทดลองงานฉบับเต็ม — ต้องดึงแยกเพราะรายการความคืบหน้าไม่ได้แนบผลประเมินมาด้วย */
  const [probationRecord, setProbationRecord] = useState<ProbationRecord | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // เลือกเอกสารมาตรฐานมาเพิ่ม
  const [pickedDocument, setPickedDocument] = useState("");
  const [pickedRequired, setPickedRequired] = useState(true);

  // อนุมัติผ่านงาน
  const [reviewSummary, setReviewSummary] = useState("");
  const [extendUntil, setExtendUntil] = useState("");

  // ประเมินผ่านงาน
  const [formId, setFormId] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [evaluatorId, setEvaluatorId] = useState("");
  const [evaluatorOptions, setEvaluatorOptions] = useState<
    Array<{ id: string; employeeCode: string; name: string }>
  >([]);

  const employeeId = item.employee.id;
  const companyId = item.employee.company?.id ?? "";
  const probation = item.probation;

  async function load() {
    setLoading(true);
    setErrorMessage("");

    try {
      const [documentResponse, formResponse, probationResponse, employeeResponse] =
        await Promise.all([
          getOnboardingDocuments({ employeeId, pageSize: 100 }),
          getEvaluationForms({ page: 1, pageSize: 100, status: "ACTIVE" }).catch(
            () => null,
          ),
          probation
            ? getProbationRecord(probation.id).catch(() => null)
            : Promise.resolve(null),
          // รายชื่อสำหรับเลือกผู้ประเมิน
          getDocumentEmployees({ pageSize: 100 }).catch(() => null),
        ]);

      setEvaluatorOptions(
        (employeeResponse?.items ?? []).map((entry) => ({
          id: entry.id,
          employeeCode: entry.employeeCode ?? "-",
          name:
            entry.displayName ||
            [entry.firstName, entry.lastName].filter(Boolean).join(" ") ||
            "-",
        })),
      );

      setDocuments(documentResponse.items);
      setProbationRecord(probationResponse);
      setForms(
        (formResponse?.items ?? []).filter(
          (form) => form.periodType === "PROBATION",
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดรายละเอียดไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  /** ทุกปุ่มทำงานเหมือนกันหมด: ยิง action → โหลดกล่องนี้ใหม่ → บอกตารางข้างหลัง */
  async function run(id: string, action: () => Promise<unknown>, label: string) {
    setBusyId(id);

    try {
      await action();
      toast.success(label);
      await load();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  const selectedForm = forms.find((form) => form.id === formId);

  /** คิดคะแนนสดขณะให้คะแนน ใช้สูตรถ่วงน้ำหนักเดียวกับหลังบ้าน */
  const score = useMemo(() => {
    if (!selectedForm) return null;

    let total = 0;
    let max = 0;

    selectedForm.questions.forEach((question) => {
      const weight = Number(question.weight) || 1;
      const questionMax = Number(question.maxScore) || 0;

      max += questionMax * weight;

      if (question.type === "SCORE") {
        total += (Number(scores[question.id]) || 0) * weight;
      }
    });

    const percent = max > 0 ? (total / max) * 100 : 0;
    const passScore = Number(selectedForm.passScore ?? 0);
    const formTotal = Number(selectedForm.totalScore ?? 0);
    const passPercent = formTotal > 0 ? (passScore / formTotal) * 100 : 0;

    return { total, max, percent, passPercent, passed: percent >= passPercent };
  }, [selectedForm, scores]);

  /** บันทึกคะแนนอย่างเดียว ไม่แตะสถานะทดลองงาน */
  async function submitEvaluation() {
    if (!probation || !selectedForm) return;

    const missing = selectedForm.questions.filter(
      (question) =>
        question.isRequired &&
        question.type === "SCORE" &&
        !scores[question.id]?.trim(),
    );

    if (missing.length > 0) {
      toast.error(
        `ยังไม่ได้ให้คะแนน: ${missing.map((entry) => entry.title).join(", ")}`,
      );
      return;
    }

    await run(
      "evaluation",
      () =>
        saveProbationEvaluation(probation.id, {
          formId: selectedForm.id,
          summary: reviewSummary || undefined,
          evaluatorEmployeeId: evaluatorId || undefined,
          scoreItems: selectedForm.questions.map((question) => ({
            questionId: question.id,
            score:
              question.type === "SCORE"
                ? Number(scores[question.id] ?? 0)
                : undefined,
            textValue:
              question.type === "TEXT"
                ? scores[question.id] || undefined
                : undefined,
          })),
        }),
      "บันทึกผลประเมินแล้ว — ไปตัดสินผ่านงานที่แท็บทดลองงาน",
    );
  }

  /** บันทึกผลทดลองงาน — แนบผลประเมินไปด้วยเมื่อมาจากแท็บประเมิน */
  async function submitReview(status: ProbationStatus, withForm: boolean) {
    if (!probation) return;

    if (withForm && selectedForm) {
      const missing = selectedForm.questions.filter(
        (question) =>
          question.isRequired &&
          question.type === "SCORE" &&
          !scores[question.id]?.trim(),
      );

      if (missing.length > 0) {
        toast.error(
          `ยังไม่ได้ให้คะแนน: ${missing.map((entry) => entry.title).join(", ")}`,
        );
        return;
      }
    }

    await run(
      "probation",
      () =>
        reviewProbationRecord(probation.id, {
          status,
          result: PROBATION_STATUS_TEXT[status] ?? status,
          summary: reviewSummary || undefined,
          extendedUntil: status === "EXTENDED" ? extendUntil : undefined,
          evaluation:
            withForm && selectedForm
              ? {
                  formId: selectedForm.id,
                  scoreItems: selectedForm.questions.map((question) => ({
                    questionId: question.id,
                    score:
                      question.type === "SCORE"
                        ? Number(scores[question.id] ?? 0)
                        : undefined,
                    textValue:
                      question.type === "TEXT"
                        ? scores[question.id] || undefined
                        : undefined,
                  })),
                }
              : undefined,
        }),
      `บันทึกผล: ${PROBATION_STATUS_TEXT[status] ?? status}`,
    );
  }

  const probationClosed =
    probation?.status === "PASSED" || probation?.status === "FAILED";

  /* ---------- รายการตรวจก่อนกดผ่านงาน ---------- */

  const requiredDocuments = documents.filter((document) => document.isRequired);
  const requiredDone = requiredDocuments.filter(
    (document) =>
      document.status === "VERIFIED" || document.status === "WAIVED",
  );
  const documentsReady =
    requiredDocuments.length > 0 &&
    requiredDone.length === requiredDocuments.length;

  const dueReached = probation ? (probation.daysLeft ?? 0) <= 0 : false;

  /** ผลประเมินใบล่าสุด — ใช้โชว์ให้ตรวจก่อนกดผ่านงาน */
  const latestEvaluation = probationRecord?.evaluationResults?.[0] ?? null;
  const evaluationPercent = Number(latestEvaluation?.percent ?? 0);

  // ชื่อเอกสารที่มีอยู่แล้ว ใช้กันเพิ่มซ้ำ
  const existingNames = new Set(
    documents.map((document) => document.documentName),
  );

  const tabs: Array<TabItem<DetailTabKey>> = [
    { key: "documents", label: "เอกสาร", count: documents.length },
    { key: "evaluation", label: "ประเมินผ่านงาน" },
    { key: "probation", label: "ทดลองงาน" },
  ];

  const stageText =
    item.stage === "TASKS"
      ? "ค้างขั้นงานต้อนรับ"
      : item.stage === "DOCUMENTS"
        ? "ค้างขั้นเอกสาร"
        : item.stage === "PROBATION"
          ? "รอผลทดลองงาน"
          : "จบกระบวนการแล้ว";

  return (
    <Modal
      open
      title="พนักงานใหม่"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
      onClose={onClose}
    >
      {/* แถวตัวตนอยู่บนพื้นฟ้าอ่อน ทำหน้าที่เป็นหัวเรื่องจริงของกล่อง */}
      <div className="-mx-5 -mt-4 flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50/50 px-5 py-3">
        <Avatar name={personName(item.employee)} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-slate-900 3xl:text-[15px]">
            {personName(item.employee)}
          </p>
          <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
            {[
              item.employee.employeeCode,
              item.employee.position,
              item.employee.department?.nameTh,
            ]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-brand-700">
          {stageText}
        </span>
      </div>

      {/*
        ลิงก์ไปแฟ้มพนักงาน — ข้อมูลที่กรอกตอนสมัคร (เลขบัตร วันเกิด ที่อยู่ วุฒิ)
        ถูกคัดลอกไปที่ประวัติพนักงานตอนกดจ้างแล้ว ตรงนี้เป็นทางเดินไปดู/แก้ต่อ
      */}
      <div className="-mx-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5">
        <Tabs
          items={tabs}
          value={tab}
          onChange={setTab}
          className="min-w-0 flex-1 border-b-0 px-0 3xl:px-0 4xl:px-0"
        />

        <Link
          href={`/employees/${item.employee.id}`}
          className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline 3xl:text-[13px]"
        >
          เปิดแฟ้มพนักงาน →
        </Link>
      </div>

      {errorMessage ? (
        <div className="pt-4">
          <Notice tone="critical">{errorMessage}</Notice>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังโหลด…
        </div>
      ) : (
        <div className="pt-4">
          {/* ---------- 1) เอกสาร ---------- */}
          {tab === "documents" ? (
            <div>
              {/*
                เลือกจากรายการมาตรฐานแล้วกด + ไม่ต้องพิมพ์ชื่อเอง
                ชื่อที่พิมพ์เองทำให้เอกสารเรื่องเดียวกันมีหลายชื่อจนนับยอดไม่ได้
              */}
              <div className="-mx-5 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-2.5">
                <Select
                  value={pickedDocument}
                  onChange={(event) => {
                    const name = event.target.value;
                    setPickedDocument(name);

                    const preset = STANDARD_DOCUMENTS.find(
                      (entry) => entry.name === name,
                    );
                    if (preset) setPickedRequired(preset.required);
                  }}
                  className="min-w-0 flex-1 bg-white"
                  aria-label="เลือกเอกสารที่ต้องส่ง"
                >
                  <option value="">เลือกเอกสารที่ต้องส่ง</option>
                  {STANDARD_DOCUMENTS.map((entry) => (
                    <option
                      key={entry.name}
                      value={entry.name}
                      disabled={existingNames.has(entry.name)}
                    >
                      {entry.name}
                      {entry.required ? " (จำเป็น)" : ""}
                      {existingNames.has(entry.name) ? " — เพิ่มแล้ว" : ""}
                    </option>
                  ))}
                </Select>

                <Checkbox
                  checked={pickedRequired}
                  onChange={(event) => setPickedRequired(event.target.checked)}
                  label="จำเป็นต้องส่ง"
                />

                <Button
                  variant="primary"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  disabled={busyId === "new-document" || !pickedDocument}
                  onClick={() =>
                    void run(
                      "new-document",
                      async () => {
                        await createOnboardingDocument({
                          companyId,
                          employeeId,
                          documentName: pickedDocument,
                          isRequired: pickedRequired,
                        });
                        setPickedDocument("");
                      },
                      "เพิ่มรายการเอกสารแล้ว",
                    )
                  }
                >
                  เพิ่ม
                </Button>
              </div>

              {documents.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[13px] font-semibold text-slate-600">
                    ยังไม่มีรายการเอกสาร
                  </p>
                  <p className="mt-1 text-[12.5px] text-slate-400">
                    เลือกจากรายการด้านบนแล้วกดเพิ่ม
                  </p>
                </div>
              ) : (
                <ul className="-mx-5 divide-y divide-slate-100">
                  {documents.map((document) => {
                    const busy = busyId === document.id;
                    const settled =
                      document.status === "VERIFIED" ||
                      document.status === "WAIVED";

                    return (
                      <li
                        key={document.id}
                        className="flex items-center gap-3 px-5 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-slate-900">
                            {document.documentName}
                            {document.isRequired ? (
                              <span className="ml-1.5 text-[11px] font-semibold text-rose-500">
                                จำเป็น
                              </span>
                            ) : null}
                          </p>

                          {/* มีไฟล์แนบให้กดเปิดดูได้เลย ไม่มีก็บอกว่ายังไม่ได้ส่ง */}
                          {document.fileName ? (
                            <a
                              href={getOnboardingDocumentFileUrl(document.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-semibold text-brand-700 underline-offset-2 hover:underline 3xl:text-[12px]"
                            >
                              <Paperclip className="h-3 w-3 shrink-0" />
                              {document.fileName}
                            </a>
                          ) : (
                            <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
                              {document.description ?? "ยังไม่มีไฟล์แนบ"}
                            </p>
                          )}
                        </div>

                        {!settled ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {/*
                              แนบไฟล์แล้วนับว่าส่งเลย ไม่ต้องกด "บันทึกว่าส่งแล้ว" ซ้ำ
                              ใช้ label คลุม input ที่ซ่อนไว้ เพราะ input file
                              จัดสไตล์ให้เข้ากับปุ่มอื่นไม่ได้
                            */}
                            <label
                              className={[
                                "inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 3xl:h-9",
                                busy ? "pointer-events-none opacity-50" : "",
                              ].join(" ")}
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              {document.fileName ? "แนบใหม่" : "แนบไฟล์"}
                              <input
                                type="file"
                                accept=".pdf,image/jpeg,image/png,image/webp,image/heic"
                                className="hidden"
                                onChange={(event) => {
                                  const picked = event.target.files?.[0];
                                  event.target.value = "";
                                  if (!picked) return;

                                  void run(
                                    document.id,
                                    () =>
                                      uploadOnboardingDocumentFile(
                                        document.id,
                                        picked,
                                      ),
                                    "แนบไฟล์แล้ว",
                                  );
                                }}
                              />
                            </label>

                            {document.status === "PENDING" ||
                            document.status === "REJECTED" ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    document.id,
                                    () => submitOnboardingDocument(document.id),
                                    "บันทึกว่าส่งแล้ว",
                                  )
                                }
                              >
                                บันทึกว่าส่งแล้ว
                              </Button>
                            ) : null}

                            {document.status === "SUBMITTED" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(
                                      document.id,
                                      () =>
                                        verifyOnboardingDocument(document.id),
                                      "ตรวจผ่านแล้ว",
                                    )
                                  }
                                >
                                  ตรวจผ่าน
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(
                                      document.id,
                                      () =>
                                        rejectOnboardingDocument(document.id),
                                      "ตีกลับแล้ว",
                                    )
                                  }
                                >
                                  ตีกลับ
                                </Button>
                              </>
                            ) : null}

                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  document.id,
                                  () => waiveOnboardingDocument(document.id),
                                  "ยกเว้นให้แล้ว",
                                )
                              }
                            >
                              ยกเว้นให้
                            </Button>
                          </div>
                        ) : null}

                        {/*
                          ป้ายสถานะกับปุ่มลบใช้ความกว้างตายตัว ไม่ปล่อยให้ไหลตาม
                          จำนวนปุ่มของแต่ละแถว ไม่งั้นแถวที่ปุ่มไม่เท่ากัน
                          ป้ายจะเยื้องกันคนละที่จนอ่านเป็นคอลัมน์ไม่ได้
                        */}
                        <div className="flex w-28 shrink-0 justify-end 3xl:w-32">
                          <Badge tone={documentTone(document.status)}>
                            {DOCUMENT_STATUS_TEXT[document.status] ??
                              document.status}
                          </Badge>
                        </div>

                        <div className="flex w-8 shrink-0 justify-end 3xl:w-9">
                          {/* ที่ตรวจผ่านแล้วลบไม่ได้ เป็นหลักฐานว่าเคยรับไว้จริง */}
                          {document.status !== "VERIFIED" ? (
                            <IconButton
                              title="ลบรายการนี้"
                              tone="danger"
                              icon={<Trash2 className="h-4 w-4" />}
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  document.id,
                                  () => deleteOnboardingDocument(document.id),
                                  "ลบรายการเอกสารแล้ว",
                                )
                              }
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {/* ---------- 2) ประเมินผ่านงาน ---------- */}
          {tab === "evaluation" ? (
            !probation ? (
              <p className="py-12 text-center text-[13px] text-slate-400">
                ยังไม่มีใบทดลองงานของคนนี้ จึงยังประเมินไม่ได้
              </p>
            ) : probationClosed ? (
              <Notice tone="positive">
                บันทึกผลทดลองงานไปแล้ว —{" "}
                {PROBATION_STATUS_TEXT[probation.status]}
              </Notice>
            ) : (
              <div className="space-y-4">
                <Field
                  label="แบบประเมิน"
                  hint="ดึงจากแบบประเมินที่ตั้งรอบเป็น “ทดลองงาน” ในหน้าประเมินผล"
                >
                  <Select
                    value={formId}
                    onChange={(event) => {
                      setFormId(event.target.value);
                      setScores({});
                    }}
                  >
                    <option value="">เลือกแบบประเมิน</option>
                    {forms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.code} · {form.name}
                      </option>
                    ))}
                  </Select>
                  {forms.length === 0 ? (
                    <p className="mt-1.5 text-[12px] text-amber-700">
                      ยังไม่มีแบบประเมินที่ตั้งรอบเป็น &quot;ทดลองงาน&quot; —
                      สร้างได้ที่หน้าประเมินผล
                    </p>
                  ) : null}
                </Field>

                <Field
                  label="ผู้ประเมิน"
                  hint="ไม่เลือก = บันทึกเป็นผู้ที่กำลังใช้งานระบบ"
                >
                  <Select
                    value={evaluatorId}
                    onChange={(event) => setEvaluatorId(event.target.value)}
                  >
                    <option value="">เลือกผู้ประเมิน</option>
                    {evaluatorOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.employeeCode} · {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                {/* ผลที่บันทึกไว้ล่าสุด — กางให้เห็นว่าให้คะแนนข้อไหนเท่าไร ใครประเมิน */}
                {latestEvaluation ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                      <p className="text-[13px] font-bold text-slate-800">
                        ผลประเมินที่บันทึกไว้
                      </p>
                      <span className="text-[12px] text-slate-500 3xl:text-[13px]">
                        {evaluationPercent.toFixed(1)}% ·{" "}
                        {latestEvaluation.evaluatorEmployee
                          ? `โดย ${latestEvaluation.evaluatorEmployee.displayName ?? latestEvaluation.evaluatorEmployee.employeeCode}`
                          : "ไม่ระบุผู้ประเมิน"}{" "}
                        · {formatThaiDate(latestEvaluation.evaluationDate)}
                      </span>
                    </div>

                    {(latestEvaluation.scoreItems ?? []).length === 0 ? (
                      <p className="px-4 py-6 text-center text-[13px] text-slate-400">
                        ไม่มีรายละเอียดคะแนนรายข้อ
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {(latestEvaluation.scoreItems ?? []).map(
                          (entry, index) => (
                            <li
                              key={`${entry.questionId}-${index}`}
                              className="flex items-center gap-3 px-4 py-2"
                            >
                              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">
                                {entry.title ?? entry.questionId}
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                                {Number(entry.score ?? 0)} /{" "}
                                {Number(entry.maxScore ?? 0)}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    )}

                    {latestEvaluation.summary ? (
                      <p className="border-t border-slate-100 px-4 py-2.5 text-[12px] leading-6 text-slate-600 3xl:text-[13px]">
                        {latestEvaluation.summary}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {selectedForm ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="space-y-2.5">
                      {selectedForm.questions.map((question) => (
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
                                value={scores[question.id] ?? ""}
                                onChange={(event) =>
                                  setScores((prev) => ({
                                    ...prev,
                                    [question.id]: event.target.value,
                                  }))
                                }
                                className="w-20 text-center"
                              />
                              <span className="text-xs font-semibold text-slate-500">
                                /{" "}
                                {Number(question.maxScore).toLocaleString(
                                  "th-TH",
                                )}
                              </span>
                            </div>
                          ) : (
                            <TextInput
                              value={scores[question.id] ?? ""}
                              onChange={(event) =>
                                setScores((prev) => ({
                                  ...prev,
                                  [question.id]: event.target.value,
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
                  </div>
                ) : null}

                <Field label="สรุปผลการประเมิน">
                  <Textarea
                    rows={3}
                    value={reviewSummary}
                    onChange={(event) => setReviewSummary(event.target.value)}
                    placeholder="เช่น ผ่านเกณฑ์ตามที่กำหนด ปรับตัวเข้ากับทีมได้ดี"
                  />
                </Field>

                {/*
                  บันทึกคะแนนอย่างเดียว ไม่ตัดสินผ่าน/ไม่ผ่านตรงนี้
                  การให้คะแนนกับการตัดสินเป็นคนละจังหวะ และบางที่คนให้คะแนน
                  กับคนตัดสินก็เป็นคนละคน — ผลที่บันทึกจะไปโผล่ที่แท็บทดลองงาน
                  ให้ตรวจก่อนกดผ่านงานจริง
                */}
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
                  <Button
                    variant="primary"
                    disabled={busyId === "evaluation" || !selectedForm}
                    title={selectedForm ? undefined : "เลือกแบบประเมินก่อน"}
                    onClick={() => void submitEvaluation()}
                  >
                    บันทึกผลประเมิน
                  </Button>

                  <span className="text-[12px] text-slate-400 3xl:text-[13px]">
                    บันทึกคะแนนเท่านั้น — ตัดสินผ่านงานที่แท็บ
                    &quot;ทดลองงาน&quot;
                  </span>
                </div>
              </div>
            )
          ) : null}

          {/* ---------- 3) ทดลองงาน: ตรวจก่อนผ่านงาน ---------- */}
          {tab === "probation" ? (
            !probation ? (
              <p className="py-12 text-center text-[13px] text-slate-400">
                ยังไม่มีใบทดลองงานของคนนี้
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <Badge tone={probationTone(probation.status)}>
                    {PROBATION_STATUS_TEXT[probation.status] ??
                      probation.status}
                  </Badge>

                  <span className="text-[13px] text-slate-700 3xl:text-[14px]">
                    {formatThaiDate(probation.startDate)} –{" "}
                    {formatThaiDate(probation.endDate)}
                  </span>

                  {probation.daysLeft !== null && !probationClosed ? (
                    <span
                      className={[
                        "text-[12px] font-semibold 3xl:text-[13px]",
                        probation.daysLeft < 0
                          ? "text-rose-600"
                          : probation.daysLeft <= 30
                            ? "text-amber-600"
                            : "text-slate-500",
                      ].join(" ")}
                    >
                      {probation.daysLeft < 0
                        ? `เลยกำหนดมา ${Math.abs(probation.daysLeft)} วัน`
                        : `เหลือ ${probation.daysLeft} วัน`}
                    </span>
                  ) : null}
                </div>

                {probationClosed ? (
                  <Notice tone="positive">
                    บันทึกผลทดลองงานไปแล้ว —{" "}
                    {PROBATION_STATUS_TEXT[probation.status]}
                    {probation.result ? ` · ${probation.result}` : ""}
                  </Notice>
                ) : (
                  <>
                    {/* ตรวจว่าข้อมูลจำเป็นครบถูกต้องก่อนตัดสิน */}
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <p className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] font-bold text-slate-800">
                        ตรวจก่อนผ่านงาน
                      </p>

                      <ul className="divide-y divide-slate-100">
                        <CheckRow
                          ok={Boolean(latestEvaluation)}
                          label="ผลประเมินทดลองงาน"
                          detail={
                            latestEvaluation
                              ? `${evaluationPercent.toFixed(1)}% (${latestEvaluation.totalScore ?? 0}/${latestEvaluation.maxScore ?? 0}) · ประเมินเมื่อ ${formatThaiDate(latestEvaluation.evaluationDate)}`
                              : "ยังไม่ได้ประเมิน — ทำได้ที่แท็บประเมินผ่านงาน"
                          }
                        />
                        <CheckRow
                          ok={documentsReady}
                          label="เอกสารจำเป็นครบทุกฉบับ"
                          detail={
                            requiredDocuments.length === 0
                              ? "ยังไม่ได้กำหนดเอกสารจำเป็นให้คนนี้"
                              : `ตรวจผ่านหรือยกเว้นแล้ว ${requiredDone.length} จาก ${requiredDocuments.length} ฉบับ`
                          }
                        />
                        <CheckRow
                          ok={dueReached}
                          label="ครบกำหนดทดลองงาน"
                          detail={
                            probation.daysLeft !== null && probation.daysLeft > 0
                              ? `ยังเหลืออีก ${probation.daysLeft} วัน — ตัดสินก่อนได้ถ้าจำเป็น`
                              : "ถึงกำหนดแล้ว"
                          }
                        />
                        <CheckRow
                          ok={Boolean(item.employee.startDate)}
                          label="ข้อมูลพนักงานครบ"
                          detail={
                            [
                              item.employee.employeeCode,
                              item.employee.position,
                              item.employee.department?.nameTh,
                              item.employee.startDate
                                ? `เริ่มงาน ${formatThaiDate(item.employee.startDate)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "ข้อมูลไม่ครบ"
                          }
                        />
                      </ul>
                    </div>

                    <Notice tone="warning">
                      กฎหมายกำหนดให้แจ้งผลก่อนครบ 120 วัน ถ้าเลยกำหนดแล้วยังไม่แจ้ง
                      พนักงานจะกลายเป็นพนักงานประจำโดยอัตโนมัติ
                    </Notice>

                    <Field label="สรุปผลทดลองงาน">
                      <Textarea
                        rows={3}
                        value={reviewSummary}
                        onChange={(event) =>
                          setReviewSummary(event.target.value)
                        }
                        placeholder="เช่น ผ่านเกณฑ์ตามที่กำหนด ปรับตัวเข้ากับทีมได้ดี"
                      />
                    </Field>

                    <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4">
                      <Button
                        variant="primary"
                        disabled={busyId === "probation"}
                        onClick={() => void submitReview("PASSED", false)}
                      >
                        ผ่านทดลองงาน
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busyId === "probation"}
                        onClick={() => void submitReview("FAILED", false)}
                      >
                        ไม่ผ่าน
                      </Button>

                      <div className="ml-auto flex items-end gap-2">
                        <div className="w-44">
                          <ThaiDateInput
                            value={extendUntil}
                            onChange={(event) =>
                              setExtendUntil(event.target.value)
                            }
                            placeholder="ขยายถึงวันที่"
                            aria-label="ขยายทดลองงานถึงวันที่"
                          />
                        </div>
                        <Button
                          disabled={busyId === "probation" || !extendUntil}
                          title={
                            extendUntil
                              ? undefined
                              : "เลือกวันที่ที่ต้องการขยายก่อน"
                          }
                          onClick={() => void submitReview("EXTENDED", false)}
                        >
                          ขยายเวลา
                        </Button>
                      </div>
                    </div>

                    {!documentsReady && requiredDocuments.length > 0 ? (
                      <p className="text-[12px] text-amber-700 3xl:text-[13px]">
                        เอกสารจำเป็นยังไม่ครบ — กดผ่านได้แต่ควรเคลียร์ให้จบก่อน
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            )
          ) : null}
        </div>
      )}
    </Modal>
  );
}
