"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Plus,
  RefreshCcw,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/feedback-state";
import { formatThaiDate } from "@/lib/date-format";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Modal,
  Notice,
  PageSurface,
} from "@/components/kit";

import {
  apiFetch,
  createJobApplication,
  createJobInterview,
  createJobOffer,
  deleteJobPosting,
  getJobApplication,
  getJobApplications,
  getJobPosting,
  hireJobApplicant,
  moveJobApplicationStage,
  recordJobInterviewResult,
  updateJobOfferStatus,
  updateJobPosting,
} from "@/lib/api";

import type {
  JobApplication,
  JobPosting,
  JobPostingStatus,
} from "@/types/recruitment";

import {
  ApplicantForm,
  type ApplicantDraft,
} from "../_components/applicant-form";
import { ApplicationDetail } from "../_components/application-detail";
import {
  applicantName,
  employmentTypeText,
  money,
  postingAcceptsApplicants,
  postingStatusText,
  postingStatusTone,
  stageText,
  stageTone,
  type BranchOption,
  type InterviewerOption,
} from "../_components/recruitment-shared";

/**
 * ประกาศรับสมัคร — หน้ารายละเอียดรายใบ
 * ------------------------------------
 * เดิมเป็นป๊อปอัพซ้อนบนตารางประกาศ ซึ่งกลายเป็นคอขวดเมื่อของในนั้นเยอะขึ้น:
 * รายละเอียดประกาศ รายชื่อผู้สมัคร ฟอร์มเพิ่มผู้สมัคร และไปป์ไลน์รายคน
 * (สัมภาษณ์/เสนอจ้าง/จ้าง) ต้องเบียดกันในกล่องเดียว และเปิดกล่องซ้อนกล่อง
 *
 * แยกเป็นหน้าจริงแล้วได้ URL ของตัวเอง — ส่งลิงก์ให้กันได้ กดย้อนกลับได้
 * และเหลือป๊อปอัพแค่ชั้นเดียวคือไปป์ไลน์รายคน
 *
 * ผู้สมัครทุกคนอยู่ใต้ประกาศเสมอ การเพิ่มคนจึงล็อกประกาศเป็นใบนี้ให้อัตโนมัติ
 * เลือกผิดใบไม่ได้อีก
 */

function emptyApplicantDraft(postingId: string): ApplicantDraft {
  return {
    postingId,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    nationalId: "",
    birthDate: "",
    address: "",
    currentPosition: "",
    currentCompany: "",
    currentSalary: "",
    yearsOfExperience: "",
    educationLevel: "",
    educationInstitute: "",
    educationMajor: "",
    resumeUrl: "",
    expectedSalary: "",
    availableFrom: "",
    source: "",
    note: "",
  };
}

function count(value: number) {
  return value.toLocaleString("th-TH");
}

/**
 * หนึ่งช่องในแถวรายละเอียดประกาศ
 * ช่องแรกของแต่ละแถวไม่ต้องเยื้องซ้าย ขอบซ้ายจึงตรงกับเนื้อหาอื่นในหน้า
 */
function PostingFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 first:pl-0 sm:[&:nth-child(3n+1)]:pl-0 lg:[&:nth-child(3n+1)]:pl-4 lg:first:pl-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p className="truncate text-[13px] font-bold leading-5 text-slate-900 3xl:text-[13.5px]">
        {value}
      </p>
    </div>
  );
}

/**
 * ผู้สมัครหนึ่งคนในรายการ — บรรทัดเดียว อ่านจากซ้ายไปขวา
 * ใครสมัคร · ติดต่อยังไง · ขอเงินเดือนเท่าไร · อยู่ขั้นไหน
 */
function ApplicantCard({
  item,
  onOpen,
}: {
  item: JobApplication;
  onOpen: () => void;
}) {
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
      className="group flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-2 px-6 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8"
    >
      <div className="flex min-w-[14rem] flex-1 items-center gap-3">
        <Avatar name={applicantName(item)} size="md" />
        <div className="min-w-0">
          <p className="break-words text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
            {applicantName(item)}
          </p>
          <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
            {item.currentPosition || "ไม่ระบุตำแหน่งปัจจุบัน"}
          </p>
        </div>
      </div>

      <div className="w-52 shrink-0">
        <p className="truncate text-[12px] text-slate-600 3xl:text-[12.5px]">
          {item.email || <span className="text-slate-300">ไม่ระบุอีเมล</span>}
        </p>
        {item.phone ? (
          <p className="truncate text-[11px] tabular-nums text-slate-400 3xl:text-[11.5px]">
            {item.phone}
          </p>
        ) : null}
      </div>

      <p className="w-32 shrink-0 truncate text-right text-[12px] tabular-nums text-slate-600 3xl:text-[12.5px]">
        {item.expectedSalary ? (
          money(item.expectedSalary)
        ) : (
          <span className="text-slate-300">ไม่ระบุ</span>
        )}
      </p>

      <div className="w-32 shrink-0 text-right">
        <Badge tone={stageTone(item.stage)}>{stageText[item.stage]}</Badge>
        {item.hiredEmployee ? (
          <p className="mt-0.5 truncate text-[10.5px] font-bold text-emerald-600 3xl:text-[11px]">
            {item.hiredEmployee.employeeCode}
          </p>
        ) : null}
      </div>

      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 transition group-hover:bg-brand-100 group-hover:text-brand-700">
        <ChevronRight className="h-4 w-4" />
      </span>
    </article>
  );
}

export default function JobPostingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const postingId = params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const [posting, setPosting] = useState<JobPosting | null>(null);
  const [applicants, setApplicants] = useState<JobApplication[]>([]);

  /** ใช้เป็นสถานที่สัมภาษณ์ และรายชื่อผู้สัมภาษณ์ในไปป์ไลน์รายคน */
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<ApplicantDraft>(() =>
    emptyApplicantDraft(postingId),
  );
  const [detail, setDetail] = useState<JobApplication | null>(null);

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

  const loadApplicants = useCallback(async () => {
    if (!postingId) return;

    const response = await getJobApplications({
      page: 1,
      pageSize: 100,
      postingId,
    });

    setApplicants(response.items ?? []);
  }, [postingId]);

  const loadPosting = useCallback(async () => {
    if (!postingId) return;

    setPosting(await getJobPosting(postingId));
  }, [postingId]);

  /*
   * สาขา/ผู้สัมภาษณ์เป็นข้อมูลตัวเลือกที่แทบไม่เปลี่ยน และพลาดได้โดยไม่ทำให้หน้าพัง
   * (แค่ดรอปดาวน์ว่าง) จึงกลืน error ไว้ ไม่ให้ทั้งหน้าแดงเพราะรายการตัวเลือก
   */
  const loadOptions = useCallback(async () => {
    const toList = <T,>(value: T[] | { items?: T[]; data?: T[] }) =>
      Array.isArray(value) ? value : (value.items ?? value.data ?? []);

    const [branchData, employeeData] = await Promise.all([
      apiFetch<BranchOption[] | { items?: BranchOption[]; data?: BranchOption[] }>(
        "/organization/branches?page=1&pageSize=200",
      ).catch(() => [] as BranchOption[]),
      // pageSize ของ /employees จำกัดที่ 100 ถ้าขอเกินจะได้ 400 แล้วรายชื่อว่างเงียบ ๆ
      apiFetch<
        InterviewerOption[] | { items?: InterviewerOption[]; data?: InterviewerOption[] }
      >("/employees?page=1&pageSize=100&status=ACTIVE").catch((error) => {
        console.error("โหลดรายชื่อผู้สัมภาษณ์ไม่สำเร็จ", error);
        return [] as InterviewerOption[];
      }),
    ]);

    setBranches(toList(branchData));
    setInterviewers(toList(employeeData));
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      await Promise.all([loadPosting(), loadApplicants(), loadOptions()]);
    } catch (error) {
      console.error(error);
      setLoadError(
        error instanceof Error ? error.message : "เปิดประกาศรับสมัครไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }, [loadPosting, loadApplicants, loadOptions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูลครั้งแรกตอนเข้าหน้า
    void reloadAll();
  }, [reloadAll]);

  async function refreshDetail(id: string) {
    setDetail(await getJobApplication(id));
  }

  /** รีเฟรชทุกอย่างที่ตัวเลขเปลี่ยนตามการกระทำกับผู้สมัคร */
  async function refreshAfterApplicantChange() {
    await Promise.all([loadPosting(), loadApplicants()]);
  }

  async function handleCreateApplicant() {
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      showMessage("ข้อมูลไม่ครบ", "กรุณากรอกชื่อและนามสกุล", "orange");
      return false;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createJobApplication({
        postingId,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        currentPosition: draft.currentPosition.trim() || undefined,
        expectedSalary: draft.expectedSalary
          ? Number(draft.expectedSalary)
          : undefined,
        availableFrom: draft.availableFrom || undefined,
        source: draft.source.trim() || undefined,
        note: draft.note.trim() || undefined,

        nationalId: draft.nationalId.trim() || undefined,
        birthDate: draft.birthDate || undefined,
        address: draft.address.trim() || undefined,
        currentCompany: draft.currentCompany.trim() || undefined,
        currentSalary: draft.currentSalary
          ? Number(draft.currentSalary)
          : undefined,
        yearsOfExperience: draft.yearsOfExperience
          ? Number(draft.yearsOfExperience)
          : undefined,
        educationLevel: draft.educationLevel.trim() || undefined,
        educationInstitute: draft.educationInstitute.trim() || undefined,
        educationMajor: draft.educationMajor.trim() || undefined,
        resumeUrl: draft.resumeUrl.trim() || undefined,
      });

      // ล้างฟอร์มทั้งใบ เพราะกรอกคนถัดไปของประกาศเดียวกันต่อได้ทันที
      setDraft(emptyApplicantDraft(postingId));
      await refreshAfterApplicantChange();

      return true;
    } catch (error) {
      console.error(error);
      showError(error, "บันทึกผู้สมัครไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runAppAction(
    id: string,
    action: () => Promise<unknown>,
    successTitle?: string,
    successText?: string,
  ) {
    setSaving(true);
    setErrorMessage("");

    try {
      await action();
      await Promise.all([refreshAfterApplicantChange(), refreshDetail(id)]);

      if (successTitle) {
        showMessage(successTitle, successText ?? "", "emerald");
      }
    } catch (error) {
      console.error(error);
      showError(error, "ทำรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function handleReject(id: string) {
    setActionDialog({
      title: "ไม่ผ่านการคัดเลือก",
      description: "ระบุเหตุผลเพื่อเก็บไว้เป็นประวัติ",
      reasonLabel: "เหตุผล",
      reasonPlaceholder: "เช่น คุณสมบัติไม่ตรงตามที่ต้องการ",
      requireReason: true,
      confirmLabel: "บันทึก",
      tone: "red",
      onConfirm: async (reason) => {
        await runAppAction(id, () =>
          moveJobApplicationStage(id, "REJECTED", reason),
        );
      },
    });
  }

  function handleHire(item: JobApplication) {
    setActionDialog({
      title: "จ้างเป็นพนักงาน",
      description: `ระบบจะสร้างข้อมูลพนักงานให้ ${applicantName(item)} เปิดใบทดลองงานตามใบเสนอจ้าง และเปิดบัญชีเข้าระบบให้ด้วยอีเมลของผู้สมัคร โดยใช้เบอร์โทรเป็นรหัสผ่านเริ่มต้น`,
      confirmLabel: "ยืนยันการจ้าง",
      tone: "emerald",
      onConfirm: async () => {
        setSaving(true);
        setErrorMessage("");

        try {
          const result = await hireJobApplicant(item.id, {});
          await Promise.all([
            refreshAfterApplicantChange(),
            refreshDetail(item.id),
          ]);

          /*
           * รหัสชั่วคราวส่งกลับมาครั้งเดียวเท่านั้น (เก็บเป็น hash ในฐานข้อมูล)
           * ถ้าไม่โชว์ตรงนี้ HR จะไม่มีอะไรส่งให้พนักงานใหม่เลย
           */
          const account = result.account;
          const byPhone = account?.passwordSource === "PHONE";

          const accountLine = account?.created
            ? `\n\nเปิดบัญชีเข้าระบบให้แล้ว\nรหัสพนักงาน (ใช้เข้าสู่ระบบ): ${account.loginId ?? result.employee.employeeCode}\nรหัสผ่านเริ่มต้น: ${account.temporaryPassword}` +
              (byPhone
                ? "\n(คือชื่อบริษัทตามด้วยเบอร์โทรของพนักงาน เฉพาะตัวเลข — ระบบบังคับให้เปลี่ยนตอนเข้าครั้งแรก)"
                : "\n(ไม่มีเบอร์โทรที่ใช้ได้ ระบบจึงสุ่มให้ — คัดลอกส่งให้พนักงาน รหัสนี้จะไม่แสดงอีก)") +
              /* ขอบเขตควรเป็นระดับสาขา ถ้าหลุดเป็นทั้งบริษัทต้องเห็นตรงนี้ ไม่ใช่ไปเจอทีหลัง */
              `\nขอบเขต: ${account.scopeLevel === "BRANCH" ? "เฉพาะสาขาของตัวเอง" : "ทั้งบริษัท"}` +
              (account.scopeNote ? `\n(${account.scopeNote})` : "")
            : account?.reason
              ? `\n\nยังไม่ได้เปิดบัญชีเข้าระบบ: ${account.reason}`
              : "";

          showMessage(
            "จ้างเรียบร้อย",
            `สร้างพนักงาน ${result.employee.employeeCode} · ${applicantName(item)} แล้ว ` +
              (result.employee.probationEndDate
                ? `เปิดใบทดลองงานถึง ${formatThaiDate(result.employee.probationEndDate)} ดูรายละเอียดต่อได้ที่แท็บ "พนักงานใหม่" ในหน้ารับพนักงานใหม่`
                : "ไม่มีช่วงทดลองงาน") +
              accountLine,
            "emerald",
          );
        } catch (error) {
          console.error(error);
          showError(error, "จ้างไม่สำเร็จ");
        } finally {
          setSaving(false);
        }
      },
    });
  }

  async function handleToggleStatus(status: JobPostingStatus) {
    setSaving(true);
    setErrorMessage("");

    try {
      await updateJobPosting(postingId, { status });
      await loadPosting();
    } catch (error) {
      console.error(error);
      showError(error, "ทำรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function handleDeletePosting() {
    if (!posting) return;

    setActionDialog({
      title: "ลบประกาศรับสมัคร",
      description: `ต้องการลบ "${posting.title}" ใช่ไหม ถ้ามีผู้สมัครแล้วจะลบไม่ได้ ให้ปิดประกาศแทน`,
      confirmLabel: "ลบประกาศ",
      tone: "red",
      onConfirm: async () => {
        setSaving(true);

        try {
          await deleteJobPosting(postingId);
          // ลบสำเร็จแล้วอยู่หน้านี้ต่อไม่ได้ ประกาศไม่มีอยู่แล้ว
          router.push("/onboarding?tab=postings");
        } catch (error) {
          console.error(error);
          showError(error, "ลบไม่สำเร็จ");
          setSaving(false);
        }
      },
    });
  }

  if (loading) {
    return (
      <PageSurface>
        <LoadingState title="กำลังเปิดประกาศรับสมัคร" />
      </PageSurface>
    );
  }

  if (loadError || !posting) {
    return (
      <PageSurface>
        <ErrorState
          title="ไม่พบประกาศรับสมัครนี้"
          description={
            loadError ||
            "ประกาศอาจถูกลบไปแล้ว หรือไม่ได้อยู่ในบริษัทที่คุณมีสิทธิ์เข้าถึง"
          }
          action={
            <ButtonLink
              href="/onboarding?tab=postings"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
            >
              กลับไปรายการประกาศ
            </ButtonLink>
          }
        />
      </PageSurface>
    );
  }

  const canAddApplicant = postingAcceptsApplicants(posting.status);

  return (
    <PageSurface>
      {/*
       * ไม่มีแถบหัวเรื่องใหญ่ — หน้านี้เปิดต่อจากรายการประกาศ ผู้ใช้รู้อยู่แล้วว่ามาจากไหน
       * ชื่อประกาศกับป้ายบริบทย้ายมาอยู่ในแถบเครื่องมือแถวเดียวกับปุ่มกลับ
       */}
      {/* แถบเครื่องมือ — ซ้ายบอกว่ากำลังดูประกาศไหน ขวาคือปุ่มที่ทำกับประกาศใบนี้ */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ButtonLink
            href="/onboarding?tab=postings"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            ทุกประกาศ
          </ButtonLink>

          <span aria-hidden className="h-6 w-px shrink-0 bg-slate-200" />

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-[15px] font-bold tracking-tight text-slate-900 3xl:text-[16px]">
                {posting.title}
              </h1>
              <Badge tone={postingStatusTone(posting.status)}>
                {postingStatusText[posting.status]}
              </Badge>
            </div>
            <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
              {[
                posting.code,
                employmentTypeText[posting.employmentType],
                posting.department?.nameTh,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void reloadAll()}
            disabled={saving}
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
          >
            รีเฟรช
          </Button>

          {posting.status === "OPEN" ? (
            <Button
              disabled={saving}
              icon={<XCircle className="h-3.5 w-3.5" />}
              onClick={() => void handleToggleStatus("CLOSED")}
            >
              ปิดรับสมัคร
            </Button>
          ) : posting.status !== "CANCELLED" ? (
            <Button
              disabled={saving}
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              onClick={() => void handleToggleStatus("OPEN")}
            >
              เปิดรับสมัคร
            </Button>
          ) : null}

          <Button
            variant="danger"
            disabled={saving}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={handleDeletePosting}
          >
            ลบประกาศ
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="critical">{errorMessage}</Notice>
        </div>
      ) : null}

      {/*
       * รายละเอียดประกาศเรียงเป็นแถวเดียวคั่นด้วยเส้นตั้งบาง ๆ ไม่มีกรอบครอบ
       * ทั้งหน้าต้องเป็นผืนขาวผืนเดียว แบ่งส่วนด้วยเส้น ไม่ใช่กล่องซ้อนกล่อง
       */}
      <section className="border-b border-slate-200 px-6 py-3.5 sm:px-7 3xl:px-8">
        <div className="grid grid-cols-2 gap-y-3 divide-x divide-brand-100 sm:grid-cols-3 lg:grid-cols-6">
          <PostingFact label="แผนก" value={posting.department?.nameTh ?? "-"} />
          <PostingFact label="สาขา" value={posting.branch?.nameTh ?? "-"} />
          <PostingFact
            label="สถานที่ทำงาน"
            value={posting.workLocation || "ไม่ระบุ"}
          />
          <PostingFact
            label="ช่วงเงินเดือน"
            value={
              posting.salaryMin || posting.salaryMax
                ? `${money(posting.salaryMin)} – ${money(posting.salaryMax)}`
                : "ไม่ระบุ"
            }
          />
          <PostingFact
            label="เปิดรับ"
            value={posting.openedAt ? formatThaiDate(posting.openedAt) : "-"}
          />
          <PostingFact
            label="ปิดรับ"
            value={
              posting.closingDate ? formatThaiDate(posting.closingDate) : "-"
            }
          />
        </div>

        {posting.requirement ? (
          <div className="mt-3 border-t border-brand-100 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
              คุณสมบัติผู้สมัคร
            </p>
            <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-5 text-slate-600 3xl:text-[13px]">
              {posting.requirement}
            </p>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="flex items-baseline gap-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            ผู้สมัครจากประกาศนี้
          </p>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-brand-700">
            {count(applicants.length)} คน
          </span>
        </div>

        {canAddApplicant ? (
          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setFormOpen(true)}
          >
            เพิ่มผู้สมัคร
          </Button>
        ) : (
          <span className="text-[12px] text-slate-400">
            ประกาศปิดรับแล้ว เปิดรับก่อนจึงเพิ่มผู้สมัครได้
          </span>
        )}
      </div>

      {applicants.length === 0 ? (
        <EmptyState
          title="ยังไม่มีผู้สมัครจากประกาศนี้"
          description={
            canAddApplicant
              ? 'กด "เพิ่มผู้สมัคร" เพื่อบันทึกคนแรกเข้าประกาศใบนี้'
              : "เปิดรับสมัครก่อนจึงจะเพิ่มผู้สมัครได้"
          }
        />
      ) : (
        <div className="divide-y divide-slate-200">
          {applicants.map((item) => (
            <ApplicantCard
              key={item.id}
              item={item}
              onOpen={() => void refreshDetail(item.id)}
            />
          ))}
        </div>
      )}

      {formOpen ? (
        <Modal
          open
          title="เพิ่มผู้สมัคร"
          description={`${posting.code} · ${posting.title}`}
          onClose={() => setFormOpen(false)}
        >
          <ApplicantForm
            draft={draft}
            saving={saving}
            onChange={setDraft}
            onCancel={() => setFormOpen(false)}
            onSubmit={async () => {
              if (await handleCreateApplicant()) setFormOpen(false);
            }}
          />
        </Modal>
      ) : null}

      {detail ? (
        <Modal
          open
          size="lg"
          title={applicantName(detail)}
          description={`${posting.code} · ${posting.title}`}
          onClose={() => setDetail(null)}
        >
          <ApplicationDetail
            item={detail}
            saving={saving}
            branches={branches}
            interviewers={interviewers}
            onMoveStage={(stage) =>
              void runAppAction(detail.id, () =>
                moveJobApplicationStage(detail.id, stage),
              )
            }
            onReject={() => handleReject(detail.id)}
            onScheduleInterview={(payload) =>
              void runAppAction(
                detail.id,
                () =>
                  createJobInterview({
                    applicationId: detail.id,
                    ...payload,
                  }),
                "นัดสัมภาษณ์แล้ว",
                "ผู้สมัครถูกย้ายไปขั้นตอนสัมภาษณ์ให้อัตโนมัติ",
              )
            }
            onRecordResult={(interviewId, payload) =>
              void runAppAction(detail.id, () =>
                recordJobInterviewResult(interviewId, payload),
              )
            }
            onCreateOffer={(payload) =>
              void runAppAction(
                detail.id,
                () => createJobOffer({ applicationId: detail.id, ...payload }),
                "ออกใบเสนอจ้างแล้ว",
                "ผู้สมัครถูกย้ายไปขั้นตอนเสนอจ้าง",
              )
            }
            onOfferStatus={(offerId, status) =>
              void runAppAction(detail.id, () =>
                updateJobOfferStatus(offerId, status),
              )
            }
            onHire={() => handleHire(detail)}
          />
        </Modal>
      ) : null}

      <ActionDialog
        state={actionDialog}
        loading={saving}
        onClose={() => setActionDialog(null)}
      />
    </PageSurface>
  );
}
