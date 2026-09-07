"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, RefreshCcw } from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate } from "@/lib/date-format";

import {
  apiFetch,
  createJobPosting,
  getJobApplications,
  getJobPostings,
} from "@/lib/api";

import type {
  EmploymentTypeTag,
  JobPosting,
  JobPostingListSummary,
  JobPostingStatus,
} from "@/types/recruitment";

import {
  Badge,
  Button,
  Field,
  FieldGrid,
  Modal,
  ModalActions,
  Notice,
  SearchInput,
  Select,
  TextInput,
  Textarea,
} from "@/components/kit";

import {
  addDays,
  emptyApplicationSummary,
  emptyPostingSummary,
  employmentTypeText,
  money,
  postingStatusText,
  postingStatusTone,
  type BranchOption,
  type CompanyListResponse,
  type CompanyOption,
  type DepartmentListResponse,
  type DepartmentOption,
  type RecruitmentSummary,
} from "./recruitment-shared";

/**
 * แผงสรรหาบุคลากร — ตารางประกาศรับสมัคร
 *
 * ผู้สมัครไม่มีรายการรวมทั้งบริษัทแล้ว เพราะผู้สมัครหนึ่งคนผูกกับประกาศเสมอ
 * การดูรวมกันทำให้ต้องกวาดตาหาเองว่าใครมาจากประกาศไหน และตอนเพิ่มคนก็ต้อง
 * เลือกประกาศจากดรอปดาวน์ซึ่งเลือกผิดใบได้ง่าย
 *
 * ทั้งรายชื่อผู้สมัคร การเพิ่มคน และไปป์ไลน์รายคน ย้ายไปอยู่ที่หน้า
 * `/onboarding/[id]` ของประกาศใบนั้น — แผงนี้จึงเหลือแค่รายการกับการสร้างประกาศ
 */
export function RecruitmentPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: RecruitmentSummary) => void;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  /** สาขา — ใช้ตอนสร้างประกาศ */
  const [branches, setBranches] = useState<BranchOption[]>([]);

  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [postingSummary, setPostingSummary] =
    useState<JobPostingListSummary>(emptyPostingSummary);
  /** ตัวเลขบนการ์ดสรุปด้านหัวหน้า — ไม่มีตารางผู้สมัครแล้ว จึงเก็บแค่ยอดรวม */
  const [applicationSummary, setApplicationSummary] = useState(
    emptyApplicationSummary,
  );

  const [postingSearch, setPostingSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const [postingDraft, setPostingDraft] = useState<PostingDraft>({
    companyId: "",
    branchId: "",
    departmentId: "",
    code: "",
    title: "",
    employmentType: "FULL_TIME" as EmploymentTypeTag,
    openings: "1",
    salaryMin: "",
    salaryMax: "",
    workLocation: "",
    requirement: "",
    description: "",
    status: "OPEN" as JobPostingStatus,
    closingDate: addDays(30),
  });

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

  async function loadBaseData() {
    const [companyData, departmentData, branchData] = await Promise.all([
      apiFetch<CompanyOption[] | CompanyListResponse>("/organization/companies"),
      apiFetch<DepartmentOption[] | DepartmentListResponse>(
        "/organization/departments?page=1&pageSize=100",
      ).catch(() => [] as DepartmentOption[]),
      apiFetch<BranchOption[] | { items?: BranchOption[]; data?: BranchOption[] }>(
        "/organization/branches?page=1&pageSize=200",
      ).catch(() => [] as BranchOption[]),
    ]);

    const toList = <T,>(value: T[] | { items?: T[]; data?: T[] }) =>
      Array.isArray(value) ? value : (value.items ?? value.data ?? []);

    const companyItems = toList(companyData);

    setCompanies(companyItems);
    setDepartments(toList(departmentData));
    setBranches(toList(branchData));

    const defaultCompanyId = companyItems[0]?.id ?? "";

    if (defaultCompanyId) {
      setPostingDraft((prev) => ({
        ...prev,
        companyId: prev.companyId || defaultCompanyId,
      }));
    }
  }

  async function loadPostings() {
    const data = await getJobPostings({
      page: 1,
      pageSize: 100,
      q: postingSearch.trim() || undefined,
    });

    setPostings(data.items ?? []);
    setPostingSummary(data.summary ?? emptyPostingSummary);
  }

  /*
   * ยอดผู้สมัครทั้งบริษัทสำหรับการ์ดสรุป — ขอแค่แถวเดียวพอ
   * `summary` หลังบ้านนับจากเงื่อนไขเดียวกับรายการ ไม่ได้นับจากหน้าที่ขอมา
   */
  async function loadApplicationSummary() {
    const data = await getJobApplications({ page: 1, pageSize: 1 });

    setApplicationSummary(data.summary ?? emptyApplicationSummary);
  }

  async function reloadAll() {
    setLoading(true);
    setErrorMessage("");

    try {
      await Promise.all([
        loadBaseData(),
        loadPostings(),
        loadApplicationSummary(),
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
      postings: postingSummary,
      applications: applicationSummary,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postingSummary, applicationSummary]);

  const searchMountedRef = useRef(false);

  // ค้นหาอัตโนมัติระหว่างพิมพ์ หน่วง 350ms
  useEffect(() => {
    if (!searchMountedRef.current) {
      searchMountedRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);

        try {
          await loadPostings();
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
  }, [postingSearch]);

  async function handleCreatePosting() {
    if (!postingDraft.code.trim() || !postingDraft.title.trim()) {
      showMessage("ข้อมูลไม่ครบ", "กรุณากรอกรหัสและชื่อตำแหน่ง", "orange");
      return false;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const created = await createJobPosting({
        companyId: postingDraft.companyId || undefined,
        branchId: postingDraft.branchId || undefined,
        departmentId: postingDraft.departmentId || undefined,
        code: postingDraft.code.trim(),
        title: postingDraft.title.trim(),
        employmentType: postingDraft.employmentType,
        openings: Number(postingDraft.openings) || 1,
        salaryMin: postingDraft.salaryMin
          ? Number(postingDraft.salaryMin)
          : undefined,
        salaryMax: postingDraft.salaryMax
          ? Number(postingDraft.salaryMax)
          : undefined,
        workLocation: postingDraft.workLocation.trim() || undefined,
        requirement: postingDraft.requirement.trim() || undefined,
        description: postingDraft.description.trim() || undefined,
        status: postingDraft.status,
        closingDate: postingDraft.closingDate || undefined,
      });

      setPostingDraft((prev) => ({
        ...prev,
        code: "",
        title: "",
        requirement: "",
        description: "",
      }));

      /*
       * เข้าหน้าประกาศที่เพิ่งสร้างเลย เพราะขั้นถัดไปคือใส่ผู้สมัครเข้าไป
       * ซึ่งทำได้ที่หน้านั้นที่เดียว ไม่ต้องกลับมาหาในตารางเอง
       */
      router.push(`/onboarding/${created.id}`);

      return true;
    } catch (error) {
      console.error(error);
      showError(error, "สร้างประกาศไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-end sm:px-6">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="ค้นหา" className="sm:col-span-2">
            <SearchInput
              value={postingSearch}
              onChange={(event) => setPostingSearch(event.target.value)}
              placeholder="รหัส / ชื่อตำแหน่ง"
              aria-label="ค้นหาประกาศรับสมัคร"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void reloadAll()}
            disabled={loading}
            icon={
              <RefreshCcw
                className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
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
            สร้างประกาศ
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="critical">{errorMessage}</Notice>
        </div>
      ) : null}

      {/*
       * แสดงเป็นรายการทีละใบ ไม่ใช่ตาราง — ประกาศหนึ่งใบมีข้อมูลหลายชนิดปนกัน
       * (ตำแหน่ง สังกัด ค่าตอบแทน ความคืบหน้าของผู้สมัคร สถานะ) ยัดลงคอลัมน์แล้ว
       * แต่ละช่องเหลือที่นิดเดียวจนต้องตัดคำ
       */}
      <div className="divide-y divide-slate-200">
        {loading && postings.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          </div>
        ) : postings.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ยังไม่มีประกาศรับสมัคร
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              สร้างประกาศก่อน แล้วค่อยเพิ่มผู้สมัครเข้าไปในประกาศนั้น
            </p>
          </div>
        ) : (
          postings.map((item) => (
            <PostingCard
              key={item.id}
              item={item}
              onOpen={() => router.push(`/onboarding/${item.id}`)}
            />
          ))
        )}
      </div>

      {createOpen ? (
        <Modal
          open
          title="สร้างประกาศรับสมัคร"
          onClose={() => setCreateOpen(false)}
        >
          <PostingForm
            draft={postingDraft}
            companies={companies}
            branches={branches}
            departments={departments}
            saving={saving}
            onChange={setPostingDraft}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async () => {
              if (await handleCreatePosting()) setCreateOpen(false);
            }}
          />
        </Modal>
      ) : null}

      <ActionDialog
        state={actionDialog}
        loading={saving}
        onClose={() => setActionDialog(null)}
      />
    </>
  );
}

/**
 * ประกาศรับสมัครหนึ่งใบในรายการ
 * ---------------------------
 * อยู่บรรทัดเดียว อ่านจากซ้ายไปขวา — ตำแหน่งอะไร มีผู้สมัครแล้วเท่าไร ให้เงินเดือนเท่าไร
 * สถานะไหน ทั้งใบกดเข้าไปดูรายละเอียดกับรายชื่อผู้สมัครได้
 */
function PostingCard({
  item,
  onOpen,
}: {
  item: JobPosting;
  onOpen: () => void;
}) {
  const applied = item._count?.applications ?? 0;
  const openings = Math.max(item.openings, 1);
  const percent = Math.min(100, Math.round((applied / openings) * 100));
  const filled = applied >= openings;

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
      className="group flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6 3xl:px-7"
    >
      {/* ตำแหน่งอะไร */}
      <div className="min-w-[15rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
            {item.title}
          </p>
          <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
            {employmentTypeText[item.employmentType]}
          </span>
        </div>
        <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
          {[item.code, item.department?.nameTh, item.workLocation]
            .filter(Boolean)
            .join(" · ") || "-"}
        </p>
      </div>

      {/* มีผู้สมัครแล้วเท่าไรจากที่เปิดรับ */}
      <div className="w-40 shrink-0">
        <div className="h-1 overflow-hidden rounded-full bg-brand-100">
          <div
            className={
              filled
                ? "h-full rounded-full bg-emerald-500"
                : "h-full rounded-full bg-brand-500"
            }
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1 truncate text-[11px] tabular-nums text-slate-500 3xl:text-[11.5px]">
          ผู้สมัคร {applied} · รับ {item.openings}
        </p>
      </div>

      {/* ให้เงินเดือนเท่าไร */}
      <p className="w-36 shrink-0 truncate text-[12px] tabular-nums text-slate-600 3xl:text-[12.5px]">
        {item.salaryMin || item.salaryMax ? (
          `${money(item.salaryMin)} – ${money(item.salaryMax)}`
        ) : (
          <span className="text-slate-300">ไม่ระบุเงินเดือน</span>
        )}
      </p>

      {/* สถานะไหน */}
      <div className="w-32 shrink-0 text-right">
        <Badge tone={postingStatusTone(item.status)}>
          {postingStatusText[item.status]}
        </Badge>
        {item.closingDate ? (
          <p className="mt-0.5 truncate text-[10.5px] text-slate-400 3xl:text-[11px]">
            ปิดรับ {formatThaiDate(item.closingDate)}
          </p>
        ) : null}
      </div>

      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 transition group-hover:bg-brand-100 group-hover:text-brand-700">
        <ChevronRight className="h-4 w-4" />
      </span>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

type PostingDraft = {
  companyId: string;
  branchId: string;
  departmentId: string;
  code: string;
  title: string;
  employmentType: EmploymentTypeTag;
  /*
   * เก็บเป็นข้อความ ไม่ใช่ตัวเลข — ถ้าเก็บเป็นตัวเลขแล้วแปลงทุกครั้งที่พิมพ์
   * ตอนลบตัวเลขจนหมดช่องจะกลายเป็นค่าเริ่มต้นทันที ผู้ใช้จึงลบเพื่อพิมพ์ใหม่ไม่ได้
   * แปลงเป็นตัวเลขตอนกดบันทึกทีเดียว
   */
  openings: string;
  salaryMin: string;
  salaryMax: string;
  workLocation: string;
  requirement: string;
  description: string;
  status: JobPostingStatus;
  closingDate: string;
};

function PostingForm({
  draft,
  companies,
  branches,
  departments,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: PostingDraft;
  companies: CompanyOption[];
  branches: BranchOption[];
  departments: DepartmentOption[];
  saving: boolean;
  onChange: Dispatch<SetStateAction<PostingDraft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    /*
     * ฟอร์มแบ่งเป็นหัวข้อย่อย ไม่ใช่กริดยาว 12 ช่องรวด
     * ของที่เกี่ยวข้องกันอยู่ด้วยกัน และเรียงตามลำดับที่คนกรอกจริง —
     * เริ่มจากตำแหน่งที่จะรับ ต่อด้วยสังกัด ค่าตอบแทน แล้วค่อยเป็นรายละเอียดยาว ๆ
     */
    <div className="space-y-5">
      <FormSection title="ตำแหน่งที่รับ">
        <FieldGrid columns={2}>
          <Field label="ชื่อตำแหน่ง" required className="sm:col-span-2">
            <TextInput
              value={draft.title}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="เช่น เจ้าหน้าที่บัญชี"
            />
          </Field>

          <Field label="รหัสประกาศ" required>
            <TextInput
              value={draft.code}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, code: event.target.value }))
              }
              placeholder="เช่น JOB-2026-001"
            />
          </Field>

          <Field label="ประเภทการจ้าง">
            <Select
              value={draft.employmentType}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  employmentType: event.target.value as EmploymentTypeTag,
                }))
              }
            >
              {Object.entries(employmentTypeText).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="จำนวนที่รับ">
            <TextInput
              type="number"
              min={1}
              value={draft.openings}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, openings: event.target.value }))
              }
            />
          </Field>

          <Field label="สถานที่ทำงาน">
            <TextInput
              value={draft.workLocation}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  workLocation: event.target.value,
                }))
              }
              placeholder="เช่น สำนักงานใหญ่"
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="สังกัด">
        <FieldGrid columns={3}>
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

          <Field label="สาขา">
            <Select
              value={draft.branchId}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  branchId: event.target.value,
                  // เปลี่ยนสาขาแล้วแผนกเดิมอาจไม่ได้อยู่สาขานั้น ล้างทิ้งให้เลือกใหม่
                  departmentId: "",
                }))
              }
            >
              <option value="">ไม่ระบุสาขา</option>
              {branches
                .filter(
                  (branch) =>
                    !draft.companyId || branch.companyId === draft.companyId,
                )
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.nameTh ?? branch.name ?? branch.code}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="แผนก">
            <Select
              value={draft.departmentId}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  departmentId: event.target.value,
                }))
              }
            >
              <option value="">ไม่ระบุแผนก</option>
              {departments
                .filter(
                  (department) =>
                    !draft.branchId ||
                    !department.branchId ||
                    department.branchId === draft.branchId,
                )
                .map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.nameTh ?? department.name ?? department.code}
                  </option>
                ))}
            </Select>
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="ค่าตอบแทนและกำหนดรับสมัคร">
        <FieldGrid columns={2}>
          {/* ขั้นต่ำกับขั้นสูงเป็นช่วงเดียวกัน วางคู่กันในช่องเดียว */}
          <Field label="ช่วงเงินเดือน (บาท)">
            <div className="flex items-center gap-2">
              <TextInput
                type="number"
                min={0}
                value={draft.salaryMin}
                placeholder="ขั้นต่ำ"
                aria-label="เงินเดือนขั้นต่ำ"
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    salaryMin: event.target.value,
                  }))
                }
              />
              <span className="shrink-0 text-slate-300">–</span>
              <TextInput
                type="number"
                min={0}
                value={draft.salaryMax}
                placeholder="ขั้นสูง"
                aria-label="เงินเดือนขั้นสูง"
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    salaryMax: event.target.value,
                  }))
                }
              />
            </div>
          </Field>

          <FieldGrid columns={2}>
            <Field label="ปิดรับสมัครวันที่">
              <ThaiDateInput
                value={draft.closingDate}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    closingDate: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="สถานะ">
              <Select
                value={draft.status}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    status: event.target.value as JobPostingStatus,
                  }))
                }
              >
                <option value="OPEN">เปิดรับสมัคร</option>
                <option value="DRAFT">ร่าง</option>
              </Select>
            </Field>
          </FieldGrid>
        </FieldGrid>
      </FormSection>

      <FormSection title="รายละเอียดงาน">
        <div className="space-y-3">
          <Field label="คุณสมบัติที่ต้องการ">
            <Textarea
              rows={3}
              value={draft.requirement}
              placeholder="เช่น วุฒิ ปวส. ขึ้นไป มีประสบการณ์งานบัญชี 1 ปี"
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  requirement: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="ลักษณะงาน">
            <Textarea
              rows={3}
              value={draft.description}
              placeholder="เช่น บันทึกบัญชีรายวัน ตรวจเอกสารตั้งเบิก ปิดงบรายเดือน"
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-brand-100 pt-4">
        <ModalActions
          onCancel={onCancel}
          onConfirm={onSubmit}
          confirmLabel="สร้างประกาศ"
          loading={saving}
        />
      </div>
    </div>
  );
}

/** หัวข้อย่อยในฟอร์ม — ป้ายกำกับสีฟ้าคั่นด้วยเส้นบาง ชุดเดียวกับป๊อปอัพหน้าอื่น */
function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
        {title}
      </p>
      {children}
    </section>
  );
}
