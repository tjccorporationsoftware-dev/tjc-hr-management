"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  ChevronRight,
  Hourglass,
  Loader2,
  Network,
  Plus,
  RefreshCcw,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  Button,
  DataTable,
  Field,
  FieldGrid,
  IconButton,
  Modal,
  ModalActions,
  PageChip,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  TextInput,
  Textarea,
  joinClassName,
  type Column,
} from "@/components/kit";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { AttendanceGroupHeading } from "@/components/common/attendance-group-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  attendanceBranchGroupKey,
  attendanceDepartmentGroupKey,
} from "@/lib/attendance-session-group";
import {
  ApiClientError,
  apiFetch,
  apiFetchWithMeta,
  getPublicFileUrl,
} from "@/lib/api";
import { formatThaiDate } from "@/lib/date-format";
import {
  departmentFitsBranch,
  filterDepartmentsByScope,
} from "@/lib/department-options";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import {
  buildSupervisorOptionLabel,
  sortSupervisorsByDepartment,
} from "@/lib/supervisor-options";
import type {
  CreateEmployeeForm,
  EmployeeListItem,
  EmployeeListResponse,
  EmployeeListSummary,
  EmployeeStatus,
  OrganizationOption,
  PaginationMeta,
} from "@/types/employee";

/**
 * ทะเบียนพนักงาน
 * --------------
 * หน้านี้ตอบคำถามเดียว: "ใครอยู่ที่ไหน สถานะอะไร" แล้วกดเข้าไปดูรายตัวที่ /employees/:id
 * ใช้ชุด kit ทั้งหน้า โทนเดียวกับ /payroll ที่เป็นต้นแบบของระบบ
 */

const PAGE_SIZE = 50;

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0";

/** ช่องวันที่ให้สูงและมนเท่า CONTROL_BASE ของ kit */

/**
 * ตัวกรองสถานะ — ค่าเริ่มต้นคือ "ยังทำงานอยู่"
 *
 * ทะเบียนพนักงานถูกเปิดเพื่อดูคนที่ทำงานอยู่เป็นหลัก คนที่ลาออก/เลิกจ้างไปแล้ว
 * ปนอยู่ในรายการทำให้กวาดตาหาคนยาก จึงต้องกดเลือกเองถึงจะเห็น
 */
type StatusFilterValue = EmployeeStatus | "" | "ALL";

const STATUS_FILTER_OPTIONS: Array<{
  value: StatusFilterValue;
  label: string;
}> = [
  { value: "", label: "ยังทำงานอยู่" },
  { value: "ALL", label: "ทุกสถานะ" },
  ...(Object.keys(EMPLOYEE_STATUS) as EmployeeStatus[]).map((value) => ({
    value,
    label: EMPLOYEE_STATUS[value].label,
  })),
];

/** สถานะที่ตั้งได้ตอนสร้าง — ลาออก/เลิกจ้างต้องทำผ่านขั้นตอนพ้นสภาพ ไม่ใช่ตั้งเองที่นี่ */
const CREATE_STATUS_OPTIONS: EmployeeStatus[] = [
  "ACTIVE",
  "PROBATION",
  "SUSPENDED",
  "INACTIVE",
];

const TITLE_OPTIONS = ["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms."];

const BLOOD_TYPE_OPTIONS = [
  "A",
  "B",
  "AB",
  "O",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];

const defaultCreateForm: CreateEmployeeForm = {
  employeeCode: "",
  title: "นาย",
  firstName: "",
  lastName: "",
  nickname: "",
  displayName: "",
  email: "",
  phone: "",
  position: "",
  positionId: "",
  supervisorId: "",
  startDate: new Date().toISOString().slice(0, 10),
  probationEndDate: "",
  status: "ACTIVE",

  companyId: "",
  branchId: "",
  departmentId: "",
  divisionId: "",
  employeeTypeId: "",

  profile: {
    gender: "NOT_SPECIFIED",
    birthDate: "",
    nationalId: "",
    passportNo: "",
    maritalStatus: "NOT_SPECIFIED",
    nationality: "ไทย",
    religion: "",

    currentAddress: "",
    registeredAddress: "",

    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    emergencyContactName2: "",
    emergencyContactPhone2: "",
    emergencyContactRelation2: "",

    educationLevel: "",
    educationInstitute: "",
    educationMajor: "",

    bankName: "",
    bankAccountNo: "",
    bankAccountName: "",

    firstNameEn: "",
    lastNameEn: "",

    personalEmail: "",
    workPhoneExt: "",
    lineId: "",
    bloodType: "",

    taxId: "",
    socialSecurityNo: "",
    socialSecurityHospital: "",
    providentFundNo: "",
    payrollPaymentMethod: "",

    contractNo: "",
    contractStartDate: "",
    contractEndDate: "",
    workLocation: "",

    workPermitNo: "",
    workPermitExpiredDate: "",
    visaNo: "",
    visaExpiredDate: "",

    emergencyContactAddress: "",
    emergencyContactAddress2: "",

    note: "",
  },
};

function count(value: number) {
  return value.toLocaleString("th-TH");
}

export default function EmployeesPage() {
  const router = useRouter();

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [summary, setSummary] = useState<EmployeeListSummary | null>(null);

  const [companies, setCompanies] = useState<OrganizationOption[]>([]);
  const [branches, setBranches] = useState<OrganizationOption[]>([]);
  const [departments, setDepartments] = useState<OrganizationOption[]>([]);
  const [divisions, setDivisions] = useState<OrganizationOption[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<OrganizationOption[]>([]);
  const [positions, setPositions] = useState<OrganizationOption[]>([]);
  const [supervisors, setSupervisors] = useState<EmployeeListItem[]>([]);

  /*
   * ตัวกรองมีแค่ที่ใช้จริง: คำค้น + สถานะ + แผนก + สาขา (และบริษัทถ้ามีหลายบริษัท)
   * ฝ่าย/หัวหน้างาน/ตำแหน่ง/ประเภทการจ้าง เอาออกแล้ว — คำค้นครอบคลุมพอ
   * และแผงตัวกรองยาว ๆ ทำให้ตารางถูกดันตกหน้าจอโดยไม่ได้ช่วยหาอะไรเร็วขึ้น
   */
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilterValue>("");
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterDepartmentId, setFilterDepartmentId] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateEmployeeForm>(defaultCreateForm);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (q.trim()) params.set("q", q.trim());
    /*
     * "" = ยังทำงานอยู่ (ไม่ส่งอะไรไป หลังบ้านตัดคนที่พ้นสภาพออกให้เอง)
     * "ALL" = ทุกสถานะ ต้องบอกหลังบ้านให้เอาคนที่พ้นสภาพมาด้วย
     */
    if (status === "ALL") {
      params.set("includeFormerEmployees", "true");
    } else if (status) {
      params.set("status", status);
    }
    if (filterCompanyId) params.set("companyId", filterCompanyId);
    if (filterBranchId) params.set("branchId", filterBranchId);
    if (filterDepartmentId) params.set("departmentId", filterDepartmentId);

    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    return params.toString();
  }, [filterBranchId, filterCompanyId, filterDepartmentId, page, q, status]);

  const activeFilterCount = [
    q.trim(),
    status,
    filterCompanyId,
    filterBranchId,
    filterDepartmentId,
  ].filter(Boolean).length;

  const filterBranchOptions = useMemo(() => {
    return branches.filter((branch) => {
      if (!filterCompanyId) return true;
      return branch.companyId === filterCompanyId;
    });
  }, [branches, filterCompanyId]);

  const filterDepartmentOptions = useMemo(() => {
    return filterDepartmentsByScope(departments, {
      companyId: filterCompanyId,
      branchId: filterBranchId,
    });
  }, [departments, filterBranchId, filterCompanyId]);

  const formBranchOptions = useMemo(() => {
    return branches.filter((branch) => {
      if (!createForm.companyId) return true;
      return branch.companyId === createForm.companyId;
    });
  }, [branches, createForm.companyId]);

  const formDepartmentOptions = useMemo(() => {
    return filterDepartmentsByScope(departments, {
      companyId: createForm.companyId,
      branchId: createForm.branchId,
    });
  }, [departments, createForm.branchId, createForm.companyId]);

  const formDivisionOptions = useMemo(() => {
    return divisions.filter((division) => {
      if (!createForm.departmentId) return true;
      return division.departmentId === createForm.departmentId;
    });
  }, [divisions, createForm.departmentId]);

  /*
   * เงื่อนไขต้องตรงกับที่ backend บังคับจริง (ensureValidSupervisor)
   * คือบริษัทและสาขาเดียวกัน ไม่ได้บังคับว่าต้องแผนกเดียวกัน
   * ถ้ากรองแผนกด้วย หัวหน้าแผนกจะผูกกับกรรมการผู้จัดการที่อยู่คนละแผนกไม่ได้
   * จึงเปลี่ยนมาใช้แผนกเป็นแค่ลำดับการแสดงผล — คนแผนกเดียวกันขึ้นก่อน
   */
  const formSupervisorOptions = useMemo(() => {
    const eligible = supervisors.filter((supervisor) => {
      if (
        createForm.companyId &&
        supervisor.companyId !== createForm.companyId
      ) {
        return false;
      }

      if (createForm.branchId && supervisor.branchId !== createForm.branchId) {
        return false;
      }

      return (
        supervisor.status === "ACTIVE" || supervisor.status === "PROBATION"
      );
    });

    return sortSupervisorsByDepartment(eligible, createForm.departmentId);
  }, [
    createForm.branchId,
    createForm.companyId,
    createForm.departmentId,
    supervisors,
  ]);

  /** ป้ายบริษัทข้างหัวเรื่อง เหมือนหน้ารอบจ่ายเงินเดือน */
  const companyLabel = useMemo(() => {
    if (companies.length === 0) return "";
    if (companies.length === 1) {
      return companies[0].nameTh || companies[0].nameEn || companies[0].code;
    }
    return `ทุกบริษัท ${count(companies.length)} แห่ง`;
  }, [companies]);

  const totalEmployees = summary?.total ?? meta?.total ?? 0;

  async function loadEmployees() {
    try {
      setLoading(true);
      setError("");

      const result = await apiFetch<EmployeeListResponse>(
        `/employees?${queryString}`,
      );

      setEmployees(result.items);
      setMeta(result.meta);
      setSummary(result.summary ?? null);
    } catch (loadError) {
      const message = errorText(loadError, "โหลดรายการพนักงานไม่สำเร็จ");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMasterData() {
    try {
      const [
        companyResult,
        branchResult,
        departmentResult,
        divisionResult,
        typeResult,
        positionResult,
        supervisorResult,
      ] = await Promise.all([
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/companies?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/branches?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/departments?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/divisions?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/employee-types?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/positions?pageSize=100",
        ),
        apiFetch<EmployeeListResponse>(
          "/employees?page=1&pageSize=100&status=ACTIVE",
        ),
      ]);

      setCompanies(companyResult.data);
      setBranches(branchResult.data);
      setDepartments(departmentResult.data);
      setDivisions(divisionResult.data);
      setEmployeeTypes(typeResult.data);
      setPositions(positionResult.data);
      setSupervisors(supervisorResult.items ?? []);
    } catch (loadError) {
      toast.error(errorText(loadError, "โหลดข้อมูลตั้งต้นไม่สำเร็จ"));
    }
  }

  /*
   * ยิงโหลดนอกจังหวะ render (เหมือนหน้า /payroll)
   * ถ้าเรียกตรง ๆ ในเอฟเฟกต์ setLoading จะทำให้เกิด render ซ้อนทันทีตั้งแต่รอบแรก
   */
  useEffect(() => {
    const timer = window.setTimeout(() => void loadEmployees(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMasterData(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function clearFilters() {
    setQ("");
    setStatus("");
    setFilterCompanyId("");
    setFilterBranchId("");
    setFilterDepartmentId("");
    setPage(1);
  }

  /* เปลี่ยนตัวกรองแล้วต้องกลับหน้าแรกเสมอ ไม่งั้นค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว */
  function changeCompanyFilter(value: string) {
    setPage(1);
    setFilterCompanyId(value);
    setFilterBranchId("");
    setFilterDepartmentId("");
  }

  function changeBranchFilter(value: string) {
    setPage(1);
    setFilterBranchId(value);

    /* แผนกระดับบริษัทใช้ได้ทุกสาขา ล้างเฉพาะตอนที่แผนกเดิมผูกกับสาขาอื่น */
    if (!departmentFitsBranch(departments, filterDepartmentId, value)) {
      setFilterDepartmentId("");
    }
  }

  function openCreateModal() {
    setCreateForm(defaultCreateForm);
    setCreateOpen(true);
  }

  function setFormField<K extends keyof CreateEmployeeForm>(
    key: K,
    value: CreateEmployeeForm[K],
  ) {
    setCreateForm((current) => ({ ...current, [key]: value }));
  }

  function setProfileField<K extends keyof CreateEmployeeForm["profile"]>(
    key: K,
    value: CreateEmployeeForm["profile"][K],
  ) {
    setCreateForm((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value },
    }));
  }

  async function handleCreateEmployee(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!createForm.companyId) {
      toast.error("กรุณาเลือกบริษัท");
      return;
    }

    if (!createForm.firstName.trim() || !createForm.lastName.trim()) {
      toast.error("กรุณากรอกชื่อและนามสกุล");
      return;
    }

    if (!createForm.startDate) {
      toast.error("กรุณาเลือกวันที่เริ่มงาน");
      return;
    }

    try {
      setSubmitting(true);

      await apiFetch<EmployeeListItem>("/employees", {
        method: "POST",
        body: JSON.stringify(buildCreateEmployeePayload(createForm)),
      });

      toast.success("เพิ่มพนักงานสำเร็จ");
      setCreateOpen(false);
      setCreateForm(defaultCreateForm);
      // โหลดข้อมูลอ้างอิงใหม่ด้วย ไม่งั้นคนที่เพิ่งเพิ่มจะยังเลือกเป็นหัวหน้างานไม่ได้
      await Promise.all([loadEmployees(), loadMasterData()]);
    } catch (saveError) {
      toast.error(errorText(saveError, "เพิ่มพนักงานไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  function openEmployee(employee: EmployeeListItem) {
    if (!employee.id) {
      toast.error("ไม่พบรหัสอ้างอิงพนักงาน");
      return;
    }

    router.push(`/employees/${employee.id}`);
  }

  /*
   * ไม่เรียงซ้ำที่ฝั่งหน้าเว็บ — ใช้ลำดับที่ backend ส่งมาตรง ๆ
   *
   * backend เรียงตามสาขา → แผนก → ระดับตำแหน่ง → รหัสพนักงาน ซึ่งเป็นลำดับเดียว
   * กับที่หน้านี้ใช้จัดกลุ่ม การเรียงใหม่ที่นี่จะทำให้ลำดับที่แสดงไม่ตรงกับลำดับที่
   * ใช้แบ่งหน้า แล้วหัวข้อกลุ่มจะแตกเป็นท่อน ๆ ข้ามหน้าอีกแบบเดิม
   *
   * อีกเหตุผลคือการเรียงชื่อไทยของ Postgres กับของเบราว์เซอร์ไม่ได้ให้ผลตรงกันเสมอ
   * ถ้าสองฝั่งเรียงเอง ลำดับจะเพี้ยนกันได้โดยไม่มีอะไรเตือน
   */

  /*
   * ตัวเลข "กี่คน" ที่หัวกลุ่ม ใช้ยอดรวมทั้งชุดที่ backend นับมาให้
   * ถ้านับจากแถวในหน้า สาขาที่ถูกตัดข้ามหน้าจะขึ้นตัวเลขคนละค่าในสองหน้า
   */
  const groupEmployeeCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const row of summary?.branchTotals ?? []) {
      counts.set(`b:${row.branchId ?? "none"}`, row.total);
    }

    for (const row of summary?.departmentTotals ?? []) {
      counts.set(
        `b:${row.branchId ?? "none"}|d:${row.departmentId ?? "none"}`,
        row.total,
      );
    }

    return counts;
  }, [summary]);

  const columns: Array<Column<EmployeeListItem>> = [
    {
      key: "employee",
      header: "พนักงาน",
      width: "w-[26%]",
      cell: (employee) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={employeeName(employee)}
            src={getPublicFileUrl(employee.user?.avatarUrl ?? null)}
            size="lg"
          />
          <div className="min-w-0">
            <p className="break-words text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px] 4xl:text-[15px]">
              {employeeName(employee)}
            </p>
            <p className="break-words text-[11px] text-slate-400 3xl:text-[12px] 4xl:text-[12.5px]">
              <span className="tabular-nums">{employee.employeeCode}</span>
              {employee.email || employee.phone ? (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {employee.email || employee.phone}
                </>
              ) : null}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "position",
      header: "ตำแหน่ง",
      hideBelow: "lg",
      cell: (employee) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-700">
            {employee.positionMaster?.nameTh || employee.position || "-"}
          </p>
          <p className="truncate text-[11px] text-slate-400 3xl:text-[12px] 4xl:text-[12.5px]">
            {employee.employeeType?.nameTh || "ไม่ระบุประเภทการจ้าง"}
          </p>
        </div>
      ),
    },
    {
      key: "org",
      /* ค่าหลักของช่องนี้คือชื่อแผนก บรรทัดล่างเป็นสาขาไว้ประกอบ */
      header: "แผนก",
      hideBelow: "lg",
      cell: (employee) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-700">
            {employee.department?.nameTh || employee.company?.nameTh || "-"}
          </p>
          <p className="truncate text-[11px] text-slate-400 3xl:text-[12px] 4xl:text-[12.5px]">
            {[employee.branch?.nameTh, employee.division?.nameTh]
              .filter(Boolean)
              .join(" · ") ||
              employee.company?.nameTh ||
              "-"}
          </p>
        </div>
      ),
    },
    {
      key: "supervisor",
      header: "หัวหน้างาน",
      width: "w-[13%]",
      hideBelow: "xl",
      cell: (employee) =>
        employee.supervisor ? (
          <span className="break-words">
            {supervisorName(employee.supervisor)}
          </span>
        ) : (
          <span className="text-slate-300">ยังไม่ผูก</span>
        ),
    },
    {
      key: "startDate",
      header: "เริ่มงาน",
      width: "w-24",
      hideBelow: "xl",
      cell: (employee) => (
        <span className="tabular-nums text-slate-600">
          {formatThaiDate(employee.startDate)}
        </span>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      /* กว้างพอให้ "ปฏิบัติงาน" อยู่บรรทัดเดียวโดยไม่ต้องพึ่งการหักคำ */
      width: "w-32",
      cell: (employee) => (
        <StatusBadge vocabulary={EMPLOYEE_STATUS} status={employee.status} />
      ),
    },
    {
      key: "open",
      header: "",
      align: "right",
      width: "w-28",
      cell: (employee) => (
        <Button
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            openEmployee(employee);
          }}
        >
          รายละเอียด
        </Button>
      ),
    },
  ];

  /*
   * overflow-visible ต้องเริ่มที่จุดเดียวกับ pageStickyFrom ของตาราง
   * ถ้าผืนหน้ายัง overflow-hidden อยู่ หัวตารางกับแถบชื่อสาขาจะไม่ค้างตามการเลื่อน
   */
  return (
    <PageSurface className="xl:overflow-visible">
      <PageHeading
        heroMotif="employees"
        eyebrow="People"
        title="ข้อมูล"
        titleAccent="พนักงาน"
        description="ค้นหา ตรวจสอบ และดูแลทะเบียนพนักงาน โครงสร้างสังกัด และสถานะการจ้างงานจากที่เดียว"
        chips={
          <>
            {companyLabel ? (
              <PageChip tone="brand" icon={<Building2 className="h-3 w-3" />}>
                {companyLabel}
              </PageChip>
            ) : null}
            <PageChip icon={<UserRound className="h-3 w-3" />}>
              แสดงเฉพาะข้อมูลที่อยู่ในสิทธิ์ของคุณ
            </PageChip>
          </>
        }
        actions={
          <>
            <div className={TILE_BOX}>
              <StatTile
                icon={<Users className="h-4 w-4" />}
                label="พนักงานทั้งหมด"
                value={count(totalEmployees)}
                helper="ทะเบียนในระบบ"
              />
              <StatTile
                icon={<BadgeCheck className="h-4 w-4" />}
                label="ปฏิบัติงาน"
                value={count(summary?.active ?? 0)}
                tone="positive"
                helper="สถานะปกติ"
              />
              <StatTile
                icon={<Hourglass className="h-4 w-4" />}
                label="ทดลองงาน"
                value={count(summary?.probation ?? 0)}
                helper={
                  (summary?.suspended ?? 0) > 0
                    ? `พักงาน ${count(summary?.suspended ?? 0)} คน`
                    : "อยู่ระหว่างทดลองงาน"
                }
              />
              <StatTile
                icon={<Network className="h-4 w-4" />}
                label="แผนก / สาขา"
                value={count(summary?.branchDepartmentTotal ?? 0)}
                helper={
                  (summary?.withoutDepartment ?? 0) > 0
                    ? `ยังไม่ระบุแผนก ${count(summary?.withoutDepartment ?? 0)} คน`
                    : "ระบุแผนกครบทุกคน"
                }
              />
            </div>
          </>
        }
      />

      {/* ตัวกรองทั้งหมดอยู่แถวเดียวกับช่องค้นหา ไม่มีแผงซ้อนมาดันตารางตกจอ */}
      <div className="flex flex-col gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between 3xl:px-7">
        <div className="flex flex-wrap items-center gap-2">
          {companies.length > 1 ? (
            <Select
              value={filterCompanyId}
              onChange={(event) => changeCompanyFilter(event.target.value)}
              className="w-full bg-white sm:w-48"
              aria-label="บริษัท"
            >
              <option value="">ทุกบริษัท</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nameTh || company.nameEn || company.code}
                </option>
              ))}
            </Select>
          ) : null}

          <Select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as StatusFilterValue);
            }}
            className="w-full bg-white sm:w-40"
            aria-label="สถานะการทำงาน"
          >
            {/*
              key ใส่ prefix ไว้เพราะตัวเลือกแรกมีค่าเป็นสตริงว่าง
              ถ้าใช้ `option.value || "ALL"` แบบหน้าอื่น จะไปชนกับตัวเลือก
              "ทุกสถานะ" ที่ค่าเป็น "ALL" จริง ๆ
            */}
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={`status-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            value={filterBranchId}
            onChange={(event) => changeBranchFilter(event.target.value)}
            className="w-full bg-white sm:w-44"
            aria-label="สาขา"
          >
            <option value="">ทุกสาขา</option>
            {filterBranchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nameTh || branch.nameEn || branch.code}
              </option>
            ))}
          </Select>

          <Select
            value={filterDepartmentId}
            onChange={(event) => {
              setPage(1);
              setFilterDepartmentId(event.target.value);
            }}
            className="w-full bg-white sm:w-52"
            aria-label="แผนก"
          >
            <option value="">ทุกแผนก</option>
            {filterDepartmentOptions.map((department) => (
              <option key={department.id} value={department.id}>
                {department.nameTh || department.nameEn || department.code}
              </option>
            ))}
          </Select>

          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              ล้างตัวกรอง {count(activeFilterCount)}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 xl:shrink-0">
          <p className="hidden whitespace-nowrap text-[12px] text-slate-500 sm:block 3xl:text-[13px]">
            {activeFilterCount > 0
              ? `เจอ ${count(meta?.total ?? 0)} จาก ${count(totalEmployees)} คน`
              : `ทั้งหมด ${count(totalEmployees)} คน`}
          </p>

          <div className="[&_input]:bg-white">
            <SearchInput
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
              placeholder="ชื่อ รหัสพนักงาน อีเมล เบอร์โทร"
              className="w-full sm:w-64"
              aria-label="ค้นหาพนักงาน"
            />
          </div>

          <IconButton
            title="โหลดข้อมูลใหม่"
            icon={
              loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )
            }
            onClick={loadEmployees}
          />

          {/* ปุ่มหลักอยู่ท้ายแถบ ไม่ต้องมีแถวของตัวเองใต้แผงตัวเลข */}
          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={openCreateModal}
          >
            เพิ่มพนักงาน
          </Button>
        </div>
      </div>

      {/* หัวคอลัมน์โทนเดียวกับหน้าผู้ใช้และหน้าค่าจ้างพนักงาน */}
      <div className="[&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:tracking-normal [&_thead_th]:text-slate-700 [&_thead_th]:py-3.5 [&_thead_th]:text-[12.5px] 3xl:[&_thead_th]:py-4 3xl:[&_thead_th]:text-[13px] 4xl:[&_thead_th]:py-[1.125rem] 4xl:[&_thead_th]:text-[13.5px]">
        <DataTable
          columns={columns}
          rows={employees}
          rowKey={(employee) => employee.id}
          loading={loading}
          error={error || null}
          onRetry={loadEmployees}
          onRowClick={openEmployee}
          groupBy={(employee) => {
            const branchKey = attendanceBranchGroupKey(employee);
            const departmentKey = attendanceDepartmentGroupKey(employee);

            return [
              {
                key: branchKey,
                label: (
                  <AttendanceGroupHeading
                    level="branch"
                    title={
                      employee.branch?.nameTh ||
                      employee.company?.nameTh ||
                      "ไม่ระบุสาขา"
                    }
                    code={employee.branch?.code}
                    employeeCount={groupEmployeeCounts.get(branchKey)}
                  />
                ),
              },
              {
                key: departmentKey,
                label: (
                  <AttendanceGroupHeading
                    level="department"
                    title={employee.department?.nameTh || "ไม่ระบุแผนก"}
                    code={employee.department?.code}
                    employeeCount={groupEmployeeCounts.get(departmentKey)}
                  />
                ),
              },
            ];
          }}
          emptyTitle="ไม่พบพนักงานตามเงื่อนไข"
          emptyDescription="ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา"
          /*
           * ตารางนี้ต้องพอดีจอ ไม่มีแถบเลื่อนแนวนอน
           *
           * fixedLayout บังคับให้คอลัมน์กว้างตามที่ประกาศไว้ ข้อความยาว ๆ
           * (อีเมล ชื่อบริษัทเต็ม) จะถูกตัดด้วย truncate แทนที่จะดันตารางให้กว้างขึ้น
           * minWidth ต่ำไว้เพื่อให้ยังบีบลงได้บนจอเล็กโดยไม่ล้น
           */
          fixedLayout
          minWidth="min-w-[52rem]"
          /* 5rem = ความสูงแถบบนสุด — หัวตารางกับแถบชื่อสาขาจะไปค้างต่อจากแถบนั้น */
          pageStickyTop="5rem"
          pageStickyFrom="xl"
        />
      </div>

      {!loading && !error && employees.length > 0 ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <span className="text-[13px] text-slate-400">
            หน้า {count(meta?.page ?? page)} จาก {count(meta?.totalPages ?? 1)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage(Math.max(page - 1, 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={meta ? page >= meta.totalPages : true}
              onClick={() => {
                setPage(page + 1);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        title="เพิ่มพนักงาน"
        description="กรอกเฉพาะข้อมูลที่จำเป็นก่อนได้ ส่วนที่เหลือค่อยเติมในหน้ารายละเอียดพนักงาน"
        size="lg"
        onClose={() => setCreateOpen(false)}
        footer={
          <ModalActions
            onCancel={() => setCreateOpen(false)}
            onConfirm={() => void handleCreateEmployee()}
            confirmLabel="บันทึกพนักงาน"
            loading={submitting}
          />
        }
      >
        <div className="space-y-5">
          <FormSection title="ข้อมูลระบุตัวตน">
            <FieldGrid columns={3}>
              <Field
                label="รหัสพนักงาน"
                hint="ระบบออกให้เมื่อบันทึก เป็นตัวเลข ปี พ.ศ. 2 หลัก + ลำดับ 4 หลัก เช่น 690055"
              >
                <TextInput value="" placeholder="ออกอัตโนมัติ" disabled />
              </Field>

              <Field label="สถานะ">
                <Select
                  value={createForm.status}
                  onChange={(event) =>
                    setFormField("status", event.target.value as EmployeeStatus)
                  }
                >
                  {CREATE_STATUS_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {EMPLOYEE_STATUS[value].label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="คำนำหน้า">
                <Select
                  value={createForm.title}
                  onChange={(event) =>
                    setFormField("title", event.target.value)
                  }
                >
                  {TITLE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="ชื่อ" required>
                <TextInput
                  value={createForm.firstName}
                  onChange={(event) =>
                    setFormField("firstName", event.target.value)
                  }
                  placeholder="ชื่อ"
                />
              </Field>

              <Field label="นามสกุล" required>
                <TextInput
                  value={createForm.lastName}
                  onChange={(event) =>
                    setFormField("lastName", event.target.value)
                  }
                  placeholder="นามสกุล"
                />
              </Field>

              <Field label="ชื่อเล่น">
                <TextInput
                  value={createForm.nickname}
                  onChange={(event) =>
                    setFormField("nickname", event.target.value)
                  }
                  placeholder="ชื่อเล่น"
                />
              </Field>

              <Field label="First name (EN)">
                <TextInput
                  value={createForm.profile.firstNameEn}
                  onChange={(event) =>
                    setProfileField("firstNameEn", event.target.value)
                  }
                  placeholder="English first name"
                />
              </Field>

              <Field label="Last name (EN)">
                <TextInput
                  value={createForm.profile.lastNameEn}
                  onChange={(event) =>
                    setProfileField("lastNameEn", event.target.value)
                  }
                  placeholder="English last name"
                />
              </Field>

              <Field label="ชื่อที่แสดง" hint="เว้นว่างได้ ระบบจะรวมชื่อให้เอง">
                <TextInput
                  value={createForm.displayName}
                  onChange={(event) =>
                    setFormField("displayName", event.target.value)
                  }
                  placeholder="ชื่อที่แสดงในระบบ"
                />
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection title="ข้อมูลติดต่อ">
            <FieldGrid columns={3}>
              <Field label="อีเมล">
                <TextInput
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setFormField("email", event.target.value)
                  }
                  placeholder="employee@company.com"
                />
              </Field>

              <Field label="อีเมลส่วนตัว">
                <TextInput
                  type="email"
                  value={createForm.profile.personalEmail}
                  onChange={(event) =>
                    setProfileField("personalEmail", event.target.value)
                  }
                  placeholder="personal@email.com"
                />
              </Field>

              <Field label="เบอร์โทรหลัก">
                <TextInput
                  value={createForm.phone}
                  onChange={(event) =>
                    setFormField("phone", event.target.value)
                  }
                  placeholder="0800000000"
                />
              </Field>

              <Field label="เบอร์ต่อภายใน">
                <TextInput
                  value={createForm.profile.workPhoneExt}
                  onChange={(event) =>
                    setProfileField("workPhoneExt", event.target.value)
                  }
                  placeholder="เช่น 102"
                />
              </Field>

              <Field label="Line ID / Chat ID">
                <TextInput
                  value={createForm.profile.lineId}
                  onChange={(event) =>
                    setProfileField("lineId", event.target.value)
                  }
                  placeholder="line id"
                />
              </Field>

              <Field label="กรุ๊ปเลือด">
                <Select
                  value={createForm.profile.bloodType}
                  onChange={(event) =>
                    setProfileField("bloodType", event.target.value)
                  }
                >
                  <option value="">ไม่ระบุ</option>
                  {BLOOD_TYPE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection title="สังกัดและการจ้างงาน">
            <FieldGrid columns={3}>
              <Field label="บริษัท" required>
                <Select
                  value={createForm.companyId}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      companyId: event.target.value,
                      branchId: "",
                      departmentId: "",
                      divisionId: "",
                      supervisorId: "",
                    }))
                  }
                >
                  <option value="">เลือกบริษัท</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.nameTh || company.nameEn || company.code}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="สาขา">
                <Select
                  value={createForm.branchId}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      branchId: event.target.value,
                      supervisorId: "",
                      // แผนกที่ผูกกับสาขาอื่นใช้ต่อไม่ได้ ส่วนแผนกระดับบริษัทเก็บไว้ได้
                      ...(departmentFitsBranch(
                        departments,
                        current.departmentId,
                        event.target.value,
                      )
                        ? {}
                        : { departmentId: "", divisionId: "" }),
                    }))
                  }
                >
                  <option value="">ไม่ระบุสาขา</option>
                  {formBranchOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.nameTh || branch.nameEn || branch.code}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="แผนก">
                <Select
                  value={createForm.departmentId}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      departmentId: event.target.value,
                      divisionId: "",
                    }))
                  }
                >
                  <option value="">ไม่ระบุแผนก</option>
                  {formDepartmentOptions.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.nameTh ||
                        department.nameEn ||
                        department.code}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="ฝ่าย / กลุ่มงาน">
                <Select
                  value={createForm.divisionId}
                  onChange={(event) =>
                    setFormField("divisionId", event.target.value)
                  }
                >
                  <option value="">ไม่ระบุฝ่าย/กลุ่มงาน</option>
                  {formDivisionOptions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.nameTh || division.nameEn || division.code}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="ตำแหน่ง">
                <Select
                  value={createForm.positionId}
                  onChange={(event) => {
                    const selected = positions.find(
                      (item) => item.id === event.target.value,
                    );

                    setCreateForm((current) => ({
                      ...current,
                      positionId: event.target.value,
                      position: selected?.nameTh ?? "",
                    }));
                  }}
                >
                  <option value="">เลือกตำแหน่งในบริษัท</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.nameTh || position.nameEn || position.code}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="ประเภทการจ้างงาน">
                <Select
                  value={createForm.employeeTypeId}
                  onChange={(event) =>
                    setFormField("employeeTypeId", event.target.value)
                  }
                >
                  <option value="">ไม่ระบุประเภทพนักงาน</option>
                  {employeeTypes.map((employeeType) => (
                    <option key={employeeType.id} value={employeeType.id}>
                      {employeeType.nameTh ||
                        employeeType.nameEn ||
                        employeeType.code}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="หัวหน้างานโดยตรง"
                hint="เลือกได้เฉพาะคนในบริษัทและสาขาเดียวกัน"
              >
                <Select
                  value={createForm.supervisorId}
                  onChange={(event) =>
                    setFormField("supervisorId", event.target.value)
                  }
                >
                  <option value="">ไม่ระบุหัวหน้างาน</option>
                  {formSupervisorOptions.map((supervisor) => (
                    <option key={supervisor.id} value={supervisor.id}>
                      {buildSupervisorOptionLabel(
                        employeeName(supervisor),
                        supervisor,
                      )}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="วันที่เริ่มงาน" required>
                <ThaiDateInput
                  value={createForm.startDate}
                  onChange={(event) =>
                    setFormField("startDate", event.target.value)
                  }
                  aria-label="วันที่เริ่มงาน"
                />
              </Field>

              <Field label="วันสิ้นสุดทดลองงาน">
                <ThaiDateInput
                  value={createForm.probationEndDate}
                  onChange={(event) =>
                    setFormField("probationEndDate", event.target.value)
                  }
                  aria-label="วันสิ้นสุดทดลองงาน"
                />
              </Field>

              <Field label="เลขที่สัญญา">
                <TextInput
                  value={createForm.profile.contractNo}
                  onChange={(event) =>
                    setProfileField("contractNo", event.target.value)
                  }
                  placeholder="Contract No."
                />
              </Field>

              <Field label="วันที่เริ่มสัญญา">
                <ThaiDateInput
                  value={createForm.profile.contractStartDate}
                  onChange={(event) =>
                    setProfileField("contractStartDate", event.target.value)
                  }
                  aria-label="วันที่เริ่มสัญญา"
                />
              </Field>

              <Field label="วันที่สิ้นสุดสัญญา">
                <ThaiDateInput
                  value={createForm.profile.contractEndDate}
                  onChange={(event) =>
                    setProfileField("contractEndDate", event.target.value)
                  }
                  aria-label="วันที่สิ้นสุดสัญญา"
                />
              </Field>

              <Field label="สถานที่ทำงานหลัก">
                <TextInput
                  value={createForm.profile.workLocation}
                  onChange={(event) =>
                    setProfileField("workLocation", event.target.value)
                  }
                  placeholder="สำนักงานใหญ่ / สาขา / Remote"
                />
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection
            title="ข้อมูลส่วนตัวและเอกสารราชการ"
            hint="เว้นไว้ก่อนได้ เติมทีหลังในหน้ารายละเอียดพนักงาน"
            collapsible
            defaultOpen={false}
          >
            <FieldGrid columns={3}>
              <Field label="เพศ">
                <Select
                  value={createForm.profile.gender}
                  onChange={(event) =>
                    setProfileField(
                      "gender",
                      event.target
                        .value as CreateEmployeeForm["profile"]["gender"],
                    )
                  }
                >
                  <option value="NOT_SPECIFIED">ไม่ระบุ</option>
                  <option value="MALE">ชาย</option>
                  <option value="FEMALE">หญิง</option>
                  <option value="OTHER">อื่น ๆ</option>
                </Select>
              </Field>

              <Field label="วันเกิด">
                <ThaiDateInput
                  value={createForm.profile.birthDate}
                  onChange={(event) =>
                    setProfileField("birthDate", event.target.value)
                  }
                  aria-label="วันเกิด"
                />
              </Field>

              <Field label="สถานภาพ">
                <Select
                  value={createForm.profile.maritalStatus}
                  onChange={(event) =>
                    setProfileField(
                      "maritalStatus",
                      event.target
                        .value as CreateEmployeeForm["profile"]["maritalStatus"],
                    )
                  }
                >
                  <option value="NOT_SPECIFIED">ไม่ระบุ</option>
                  <option value="SINGLE">โสด</option>
                  <option value="MARRIED">สมรส</option>
                  <option value="DIVORCED">หย่า</option>
                  <option value="WIDOWED">หม้าย</option>
                </Select>
              </Field>

              <Field label="เลขบัตรประชาชน">
                <TextInput
                  value={createForm.profile.nationalId}
                  onChange={(event) =>
                    setProfileField("nationalId", event.target.value)
                  }
                  placeholder="1234567890123"
                />
              </Field>

              <Field label="เลขผู้เสียภาษี">
                <TextInput
                  value={createForm.profile.taxId}
                  onChange={(event) =>
                    setProfileField("taxId", event.target.value)
                  }
                  placeholder="Tax ID"
                />
              </Field>

              <Field label="เลขประกันสังคม">
                <TextInput
                  value={createForm.profile.socialSecurityNo}
                  onChange={(event) =>
                    setProfileField("socialSecurityNo", event.target.value)
                  }
                  placeholder="Social security no."
                />
              </Field>

              <Field label="โรงพยาบาลประกันสังคม">
                <TextInput
                  value={createForm.profile.socialSecurityHospital}
                  onChange={(event) =>
                    setProfileField(
                      "socialSecurityHospital",
                      event.target.value,
                    )
                  }
                  placeholder="ชื่อโรงพยาบาล"
                />
              </Field>

              <Field label="เลขกองทุนสำรองเลี้ยงชีพ">
                <TextInput
                  value={createForm.profile.providentFundNo}
                  onChange={(event) =>
                    setProfileField("providentFundNo", event.target.value)
                  }
                  placeholder="Provident fund no."
                />
              </Field>

              <Field label="วิธีรับเงินเดือน">
                <Select
                  value={createForm.profile.payrollPaymentMethod}
                  onChange={(event) =>
                    setProfileField("payrollPaymentMethod", event.target.value)
                  }
                >
                  <option value="">ไม่ระบุ</option>
                  <option value="BANK_TRANSFER">โอนเข้าบัญชี</option>
                  <option value="CASH">เงินสด</option>
                  <option value="CHEQUE">เช็ค</option>
                  <option value="OTHER">อื่น ๆ</option>
                </Select>
              </Field>

              <Field label="หนังสือเดินทาง">
                <TextInput
                  value={createForm.profile.passportNo}
                  onChange={(event) =>
                    setProfileField("passportNo", event.target.value)
                  }
                  placeholder="Passport no."
                />
              </Field>

              <Field label="Work permit no.">
                <TextInput
                  value={createForm.profile.workPermitNo}
                  onChange={(event) =>
                    setProfileField("workPermitNo", event.target.value)
                  }
                />
              </Field>

              <Field label="วันหมดอายุ Work permit">
                <ThaiDateInput
                  value={createForm.profile.workPermitExpiredDate}
                  onChange={(event) =>
                    setProfileField("workPermitExpiredDate", event.target.value)
                  }
                  aria-label="วันหมดอายุ Work permit"
                />
              </Field>

              <Field label="Visa no.">
                <TextInput
                  value={createForm.profile.visaNo}
                  onChange={(event) =>
                    setProfileField("visaNo", event.target.value)
                  }
                />
              </Field>

              <Field label="วันหมดอายุ Visa">
                <ThaiDateInput
                  value={createForm.profile.visaExpiredDate}
                  onChange={(event) =>
                    setProfileField("visaExpiredDate", event.target.value)
                  }
                  aria-label="วันหมดอายุ Visa"
                />
              </Field>

              <Field label="สัญชาติ">
                <TextInput
                  value={createForm.profile.nationality}
                  onChange={(event) =>
                    setProfileField("nationality", event.target.value)
                  }
                  placeholder="ไทย"
                />
              </Field>

              <Field label="ศาสนา">
                <TextInput
                  value={createForm.profile.religion}
                  onChange={(event) =>
                    setProfileField("religion", event.target.value)
                  }
                  placeholder="ไม่ระบุก็ได้"
                />
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection
            title="บัญชีธนาคารและการศึกษา"
            hint="ใช้ตอนทำเงินเดือน เติมทีหลังได้"
            collapsible
            defaultOpen={false}
          >
            <FieldGrid columns={3}>
              <Field label="ธนาคาร">
                <TextInput
                  value={createForm.profile.bankName}
                  onChange={(event) =>
                    setProfileField("bankName", event.target.value)
                  }
                  placeholder="ชื่อธนาคาร"
                />
              </Field>

              <Field label="เลขบัญชี">
                <TextInput
                  value={createForm.profile.bankAccountNo}
                  onChange={(event) =>
                    setProfileField("bankAccountNo", event.target.value)
                  }
                  placeholder="เลขบัญชีรับเงินเดือน"
                />
              </Field>

              <Field label="ชื่อบัญชี">
                <TextInput
                  value={createForm.profile.bankAccountName}
                  onChange={(event) =>
                    setProfileField("bankAccountName", event.target.value)
                  }
                  placeholder="ชื่อตามบัญชีธนาคาร"
                />
              </Field>

              <Field label="ระดับการศึกษา">
                <TextInput
                  value={createForm.profile.educationLevel}
                  onChange={(event) =>
                    setProfileField("educationLevel", event.target.value)
                  }
                  placeholder="ปริญญาตรี / ปวส. / ม.6"
                />
              </Field>

              <Field label="สถาบัน">
                <TextInput
                  value={createForm.profile.educationInstitute}
                  onChange={(event) =>
                    setProfileField("educationInstitute", event.target.value)
                  }
                  placeholder="ชื่อสถาบัน"
                />
              </Field>

              <Field label="สาขาวิชา">
                <TextInput
                  value={createForm.profile.educationMajor}
                  onChange={(event) =>
                    setProfileField("educationMajor", event.target.value)
                  }
                  placeholder="สาขาวิชา"
                />
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection
            title="ที่อยู่และผู้ติดต่อฉุกเฉิน"
            hint="ใช้ตอนออกเอกสารและกรณีฉุกเฉิน เติมทีหลังได้"
            collapsible
            defaultOpen={false}
          >
            <FieldGrid columns={2}>
              <Field label="ที่อยู่ปัจจุบัน">
                <Textarea
                  value={createForm.profile.currentAddress}
                  onChange={(event) =>
                    setProfileField("currentAddress", event.target.value)
                  }
                  placeholder="ที่อยู่ปัจจุบัน"
                />
              </Field>

              <Field label="ที่อยู่ตามทะเบียนบ้าน">
                <Textarea
                  value={createForm.profile.registeredAddress}
                  onChange={(event) =>
                    setProfileField("registeredAddress", event.target.value)
                  }
                  placeholder="ที่อยู่ตามทะเบียนบ้าน"
                />
              </Field>
            </FieldGrid>

            <FieldGrid columns={3} className="mt-4">
              <Field label="ชื่อผู้ติดต่อฉุกเฉิน">
                <TextInput
                  value={createForm.profile.emergencyContactName}
                  onChange={(event) =>
                    setProfileField("emergencyContactName", event.target.value)
                  }
                  placeholder="ชื่อ-นามสกุล"
                />
              </Field>

              <Field label="เบอร์โทรฉุกเฉิน">
                <TextInput
                  value={createForm.profile.emergencyContactPhone}
                  onChange={(event) =>
                    setProfileField("emergencyContactPhone", event.target.value)
                  }
                  placeholder="เบอร์โทร"
                />
              </Field>

              <Field label="ความสัมพันธ์">
                <TextInput
                  value={createForm.profile.emergencyContactRelation}
                  onChange={(event) =>
                    setProfileField(
                      "emergencyContactRelation",
                      event.target.value,
                    )
                  }
                  placeholder="บิดา / มารดา / คู่สมรส"
                />
              </Field>
            </FieldGrid>

            <FieldGrid columns={1} className="mt-4">
              <Field label="ที่อยู่ผู้ติดต่อฉุกเฉิน">
                <TextInput
                  value={createForm.profile.emergencyContactAddress}
                  onChange={(event) =>
                    setProfileField(
                      "emergencyContactAddress",
                      event.target.value,
                    )
                  }
                  placeholder="ระบุถ้ามี"
                />
              </Field>
            </FieldGrid>

            {/*
              ผู้ติดต่อฉุกเฉินคนที่สอง — คนแรกติดต่อไม่ได้ (ปิดเครื่อง/อยู่ต่างจังหวัด)
              ยังมีอีกทางให้ติดต่อ เว้นว่างไว้ก็ได้
            */}
            <p className="mt-5 border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              ผู้ติดต่อฉุกเฉินคนที่ 2 (ถ้ามี)
            </p>

            <FieldGrid columns={3} className="mt-3">
              <Field label="ชื่อผู้ติดต่อฉุกเฉิน 2">
                <TextInput
                  value={createForm.profile.emergencyContactName2}
                  onChange={(event) =>
                    setProfileField("emergencyContactName2", event.target.value)
                  }
                  placeholder="ชื่อ-นามสกุล"
                />
              </Field>

              <Field label="เบอร์โทรฉุกเฉิน 2">
                <TextInput
                  value={createForm.profile.emergencyContactPhone2}
                  onChange={(event) =>
                    setProfileField(
                      "emergencyContactPhone2",
                      event.target.value,
                    )
                  }
                  placeholder="เบอร์โทร"
                />
              </Field>

              <Field label="ความสัมพันธ์ 2">
                <TextInput
                  value={createForm.profile.emergencyContactRelation2}
                  onChange={(event) =>
                    setProfileField(
                      "emergencyContactRelation2",
                      event.target.value,
                    )
                  }
                  placeholder="บิดา / มารดา / คู่สมรส"
                />
              </Field>
            </FieldGrid>

            <FieldGrid columns={1} className="mt-4">
              <Field label="ที่อยู่ผู้ติดต่อฉุกเฉิน 2">
                <TextInput
                  value={createForm.profile.emergencyContactAddress2}
                  onChange={(event) =>
                    setProfileField(
                      "emergencyContactAddress2",
                      event.target.value,
                    )
                  }
                  placeholder="ระบุถ้ามี"
                />
              </Field>

              <Field label="หมายเหตุ">
                <Textarea
                  value={createForm.profile.note}
                  onChange={(event) =>
                    setProfileField("note", event.target.value)
                  }
                  placeholder="ข้อมูลเพิ่มเติม เช่น เงื่อนไขการจ้างงาน ข้อจำกัด หรือหมายเหตุจาก HR"
                />
              </Field>
            </FieldGrid>
          </FormSection>
        </div>
      </Modal>
    </PageSurface>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

/**
 * หัวข้อย่อยในฟอร์ม — เส้นคั่นบาง ๆ ไม่ใช่การ์ดซ้อนการ์ด
 * ตัวแรกไม่ต้องมีเส้นบน เพราะติดกับหัวกล่องอยู่แล้ว
 */
function FormSection({
  title,
  hint,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  /** ส่วนที่ไม่จำเป็นตอนสร้าง ให้พับไว้ก่อน ฟอร์มจะได้ไม่ยาวจนต้องเลื่อนหาปุ่มบันทึก */
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = collapsible ? open : true;

  return (
    <section>
      {/* ป้ายฟ้าคั่นด้วยเส้นบาง ชุดเดียวกับฟอร์มอื่นทั้งระบบ */}
      <div className="mb-3 flex items-end justify-between gap-3 border-b border-brand-100 pb-1.5">
        <button
          type="button"
          onClick={collapsible ? () => setOpen((value) => !value) : undefined}
          className={joinClassName(
            "flex min-w-0 items-center gap-1.5 text-left",
            collapsible ? "cursor-pointer" : "cursor-default",
          )}
        >
          {collapsible ? (
            <ChevronRight
              className={joinClassName(
                "h-3.5 w-3.5 shrink-0 text-brand-400 transition-transform",
                expanded && "rotate-90",
              )}
            />
          ) : null}
          <span className="min-w-0">
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              {title}
            </span>
            {hint ? (
              <span className="mt-0.5 block text-[11.5px] text-slate-400">
                {hint}
              </span>
            ) : null}
          </span>
        </button>
      </div>

      {expanded ? children : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function employeeName(employee: EmployeeListItem) {
  return (
    employee.displayName ||
    [employee.title, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    employee.employeeCode ||
    "-"
  );
}

function supervisorName(supervisor: {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  employeeCode?: string | null;
}) {
  return (
    supervisor.displayName ||
    [supervisor.title, supervisor.firstName, supervisor.lastName]
      .filter(Boolean)
      .join(" ") ||
    supervisor.employeeCode ||
    "-"
  );
}

function buildCreateEmployeePayload(form: CreateEmployeeForm) {
  return {
    title: emptyToUndefined(form.title),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    nickname: emptyToUndefined(form.nickname),
    displayName: emptyToUndefined(form.displayName),
    email: emptyToUndefined(form.email),
    phone: emptyToUndefined(form.phone),
    positionId: emptyToUndefined(form.positionId),
    position: emptyToUndefined(form.position),
    supervisorId: emptyToUndefined(form.supervisorId),
    startDate: form.startDate,
    probationEndDate: emptyToUndefined(form.probationEndDate),
    status: form.status,
    companyId: form.companyId,
    branchId: emptyToUndefined(form.branchId),
    departmentId: emptyToUndefined(form.departmentId),
    divisionId: emptyToUndefined(form.divisionId),
    employeeTypeId: emptyToUndefined(form.employeeTypeId),
    profile: {
      gender: form.profile.gender,
      birthDate: emptyToUndefined(form.profile.birthDate),
      nationalId: emptyToUndefined(form.profile.nationalId),
      passportNo: emptyToUndefined(form.profile.passportNo),
      maritalStatus: form.profile.maritalStatus,
      nationality: emptyToUndefined(form.profile.nationality),
      religion: emptyToUndefined(form.profile.religion),
      currentAddress: emptyToUndefined(form.profile.currentAddress),
      registeredAddress: emptyToUndefined(form.profile.registeredAddress),
      emergencyContactName: emptyToUndefined(form.profile.emergencyContactName),
      emergencyContactPhone: emptyToUndefined(
        form.profile.emergencyContactPhone,
      ),
      emergencyContactRelation: emptyToUndefined(
        form.profile.emergencyContactRelation,
      ),
      emergencyContactName2: emptyToUndefined(
        form.profile.emergencyContactName2,
      ),
      emergencyContactPhone2: emptyToUndefined(
        form.profile.emergencyContactPhone2,
      ),
      emergencyContactRelation2: emptyToUndefined(
        form.profile.emergencyContactRelation2,
      ),
      educationLevel: emptyToUndefined(form.profile.educationLevel),
      educationInstitute: emptyToUndefined(form.profile.educationInstitute),
      educationMajor: emptyToUndefined(form.profile.educationMajor),
      bankName: emptyToUndefined(form.profile.bankName),
      bankAccountNo: emptyToUndefined(form.profile.bankAccountNo),
      bankAccountName: emptyToUndefined(form.profile.bankAccountName),
      firstNameEn: emptyToUndefined(form.profile.firstNameEn),
      lastNameEn: emptyToUndefined(form.profile.lastNameEn),
      personalEmail: emptyToUndefined(form.profile.personalEmail),
      workPhoneExt: emptyToUndefined(form.profile.workPhoneExt),
      lineId: emptyToUndefined(form.profile.lineId),
      bloodType: emptyToUndefined(form.profile.bloodType),
      taxId: emptyToUndefined(form.profile.taxId),
      socialSecurityNo: emptyToUndefined(form.profile.socialSecurityNo),
      socialSecurityHospital: emptyToUndefined(
        form.profile.socialSecurityHospital,
      ),
      providentFundNo: emptyToUndefined(form.profile.providentFundNo),
      payrollPaymentMethod: emptyToUndefined(form.profile.payrollPaymentMethod),
      contractNo: emptyToUndefined(form.profile.contractNo),
      contractStartDate: emptyToUndefined(form.profile.contractStartDate),
      contractEndDate: emptyToUndefined(form.profile.contractEndDate),
      workLocation: emptyToUndefined(form.profile.workLocation),
      workPermitNo: emptyToUndefined(form.profile.workPermitNo),
      workPermitExpiredDate: emptyToUndefined(
        form.profile.workPermitExpiredDate,
      ),
      visaNo: emptyToUndefined(form.profile.visaNo),
      visaExpiredDate: emptyToUndefined(form.profile.visaExpiredDate),
      emergencyContactAddress: emptyToUndefined(
        form.profile.emergencyContactAddress,
      ),
      emergencyContactAddress2: emptyToUndefined(
        form.profile.emergencyContactAddress2,
      ),
      note: emptyToUndefined(form.profile.note),
    },
  };
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function errorText(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) return error.message;
  return fallbackMessage;
}
