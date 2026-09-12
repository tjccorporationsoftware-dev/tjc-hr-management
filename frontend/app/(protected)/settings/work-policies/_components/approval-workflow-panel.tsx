"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock4,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCcw,
  Timer,
  Trash2,
  UserCheck,
  Users,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { AttendanceGroupHeading } from "@/components/common/attendance-group-heading";
import { DateTimeDisplay } from "@/components/common/date-display";
import {
  Badge,
  Button,
  Modal,
  ModalActions,
  Select,
  Toolbar,
} from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch, apiFetchWithMeta } from "@/lib/api";
import type { OrganizationOption, PaginationMeta } from "@/types/employee";
import type {
  ApprovalMatrixItem,
  ApprovalMatrixTargetType,
  ApprovalStepApproverType,
  MasterStatus,
  PositionItem,
} from "@/types/organization";

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

type EmployeeOption = {
  id: string;
  employeeCode: string;
  title: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  position: string | null;
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
};

type EmployeeListResponse = {
  items: EmployeeOption[];
  meta?: PaginationMeta;
};

type StepFormState = {
  nameTh: string;
  description: string;
  approverType: ApprovalStepApproverType;
  /** ผู้อนุมัติแทน เมื่อผู้อนุมัติหลักกลายเป็นคนยื่นเอง ("" = ยังไม่ตั้ง) */
  fallbackApproverType: ApprovalStepApproverType | "";
  fallbackPositionId: string;
  fallbackEmployeeId: string;
  fallbackRoleCode: string;
  positionId: string;
  employeeId: string;
  roleCode: string;
  requireAll: boolean;
  minApproverCount: string;
};

/**
 * สายหนึ่งเส้นใช้กับใคร — เลือกได้อย่างเดียวเท่านั้น
 *
 * everyone = พนักงานทุกคนในบริษัท (ค่าเริ่มต้นของทุกสาขา)
 * branch   = เฉพาะพนักงานสาขาที่เลือก
 * people   = เฉพาะรายชื่อที่เลือก (ชนะสองแบบบนเสมอ เพราะเจาะจงที่สุด)
 *
 * หลังบ้านเก็บเป็น branchId + รายชื่อผู้ขอ แต่หน้าจอรวบให้เหลือคำถามเดียว
 * ไม่งั้นผู้ใช้ต้องเข้าใจว่าสองช่องนี้ทับกันเองยังไง
 */
type FlowScopeMode = "everyone" | "branch" | "people";

type FlowFormState = {
  scopeMode: FlowScopeMode;
  /** สาขาที่สายนี้ครอบ — สายเดียวติ๊กได้หลายสาขา ตัวแรกจะไปเก็บที่ branchId ของหลังบ้าน */
  branchIds: string[];
  requesterEmployeeIds: string[];
  status: MasterStatus;
  steps: StepFormState[];
  nameTh: string;
  description: string;
  departmentId: string;
  employeeTypeId: string;
  priority: string;
};

type EditorState = {
  targetType: ApprovalMatrixTargetType;
  matrixId: string | null;
};

type TypeGroup = {
  type: (typeof requestTypes)[number];
  items: ApprovalMatrixItem[];
  companyMatrices: ApprovalMatrixItem[];
  branchMatrices: ApprovalMatrixItem[];
  peopleMatrices: ApprovalMatrixItem[];
  scopeMatrices: ApprovalMatrixItem[];
  orphanBranchMatrices: ApprovalMatrixItem[];
  shadowedBranchMatrices: ApprovalMatrixItem[];
  activeCompanyPriority: number;
  hasCompanyFallback: boolean;
  uncoveredBranches: OrganizationOption[];
  isConfigured: boolean;
  isActive: boolean;
  isCovered: boolean;
};

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

const pageSize = 100;
const maxSteps = 3;

/**
 * แสดงเฉพาะประเภทที่ backend เรียก ApprovalMatrixResolverService จริง
 * (leave-requests / overtime / time-adjust / offsite-work)
 *
 * ประเภทที่เหลือใน enum — DOCUMENT_REQUEST, PAYROLL_RUN, EMPLOYEE_CHANGE, GENERAL —
 * ยังไม่มีโค้ดฝั่ง backend เรียกใช้ ตั้งค่าไปก็ไม่มีผล จึงตัดออกจากหน้านี้ก่อน
 * (ขอเอกสารใช้ผู้อนุมัติ hardcode: ชั้น 1 หัวหน้าโดยตรง/ADMIN → ชั้น 2 HR)
 */
const requestTypes: Array<{
  value: ApprovalMatrixTargetType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "LEAVE_REQUEST",
    label: "ใบลา",
    description: "พนักงานยื่นลาป่วย ลากิจ ลาพักร้อน",
    icon: CalendarDays,
  },
  {
    value: "OVERTIME_REQUEST",
    label: "ทำงานล่วงเวลา (OT)",
    description: "พนักงานขอทำ OT",
    icon: Clock4,
  },
  {
    value: "TIME_ADJUST_REQUEST",
    label: "ขอแก้เวลา",
    description: "ลืมสแกนเข้า-ออก แล้วขอแก้เวลาย้อนหลัง",
    icon: Timer,
  },
  {
    value: "OFFSITE_WORK_REQUEST",
    label: "ทำงานนอกสถานที่",
    description: "ออกไปทำงานข้างนอก หรือทำงานที่บ้าน",
    icon: MapPin,
  },
];

const supportedTargetTypes = new Set<string>(
  requestTypes.map((type) => type.value),
);

const targetTypeCodes: Record<ApprovalMatrixTargetType, string> = {
  LEAVE_REQUEST: "LEAVE",
  OVERTIME_REQUEST: "OT",
  TIME_ADJUST_REQUEST: "TIME",
  OFFSITE_WORK_REQUEST: "OFFSITE",
  DOCUMENT_REQUEST: "DOC",
  PAYROLL_RUN: "PAYROLL",
  EMPLOYEE_CHANGE: "EMPCHANGE",
  GENERAL: "GENERAL",
};

const approverTypeOptions: Array<{
  value: ApprovalStepApproverType;
  label: string;
  helper: string;
}> = [
  {
    value: "SUPERVISOR",
    label: "หัวหน้าโดยตรง",
    helper: "ระบบดูจากหัวหน้าของคนที่ยื่นคำขอ",
  },
  { value: "HR_ADMIN", label: "ฝ่ายบุคคล (HR)", helper: "ให้ HR เป็นคนอนุมัติ" },
  { value: "EXECUTIVE", label: "ผู้บริหาร", helper: "ให้ผู้บริหารเป็นคนอนุมัติ" },
  {
    value: "POSITION",
    label: "ตำแหน่งที่ระบุ",
    helper: "ใครก็ได้ที่อยู่ในตำแหน่งนี้",
  },
  { value: "EMPLOYEE", label: "คนที่ระบุ", helper: "เจาะจงตัวบุคคล" },
  {
    value: "ROLE",
    label: "กลุ่มสิทธิ์ที่ระบุ",
    helper: "สำหรับกรณีพิเศษ เช่น กลุ่มสิทธิ์ HR_ADMIN",
  },
];

const defaultStepName: Record<ApprovalStepApproverType, string> = {
  SUPERVISOR: "หัวหน้าโดยตรง",
  HR_ADMIN: "HR ตรวจสอบ",
  EXECUTIVE: "ผู้บริหารอนุมัติ",
  POSITION: "อนุมัติตามตำแหน่ง",
  EMPLOYEE: "ผู้อนุมัติที่กำหนด",
  ROLE: "อนุมัติตาม Role",
};

/** ลำดับผู้อนุมัติที่ใช้บ่อยที่สุด ใช้เป็นค่าตั้งต้นของขั้นถัดไป */
const stepPreset: ApprovalStepApproverType[] = [
  "SUPERVISOR",
  "HR_ADMIN",
  "EXECUTIVE",
];

/*
  คลาสกลางของหน้านี้ — คัดลอกค่ามาจากชุด kit (ปุ่มสูง 36px, rounded-lg, ตัวหนังสือ 13px)
  เพื่อให้ปุ่ม/ช่องกรอกที่เขียนไว้เดิมหน้าตาตรงกับหน้าอื่นทั้งระบบ
*/
const inputClass =
  "h-9 3xl:h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] 3xl:text-[13.5px] text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

const buttonBaseClass =
  "inline-flex h-9 3xl:h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[13px] 3xl:text-[13.5px] font-semibold transition disabled:pointer-events-none disabled:opacity-50";

const buttonGhostClass = `${buttonBaseClass} text-slate-500 hover:bg-slate-100 hover:text-slate-900`;

const buttonSecondaryClass = `${buttonBaseClass} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900`;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getRequestType(value: ApprovalMatrixTargetType) {
  return requestTypes.find((item) => item.value === value) ?? requestTypes[0];
}

function getDisplayName(employee: EmployeeOption) {
  return (
    employee.displayName ||
    `${employee.title ?? ""}${employee.firstName} ${employee.lastName}`.trim() ||
    employee.employeeCode
  );
}

/** สาขาของพนักงาน — ใช้บอกให้เห็นว่าคนที่เลือกอยู่คนละสาขากับคนอื่นในรายการ */
function getEmployeeBranchName(
  employee: EmployeeOption,
  branches: OrganizationOption[],
) {
  if (!employee.branchId) return "";
  const branch = branches.find((item) => item.id === employee.branchId);
  return branch ? getBranchName(branch) : "";
}

/** แผนกของพนักงาน ใช้คู่กับสาขาในรายการเลือกคน */
function getEmployeeDepartmentName(
  employee: EmployeeOption,
  departments: OrganizationOption[],
) {
  if (!employee.departmentId) return "";
  const department = departments.find(
    (item) => item.id === employee.departmentId,
  );
  return department ? department.nameTh || department.code : "";
}

function getBranchName(branch?: OrganizationOption | null) {
  if (!branch) return "ทั้งบริษัท";
  return branch.nameTh || branch.nameEn || branch.code;
}

function getApproverLabel(value: ApprovalStepApproverType) {
  return (
    approverTypeOptions.find((item) => item.value === value)?.label ?? value
  );
}

function getApproverHelper(value: ApprovalStepApproverType) {
  return approverTypeOptions.find((item) => item.value === value)?.helper ?? "";
}

function getActiveSteps(matrix: ApprovalMatrixItem) {
  return [...(matrix.steps ?? [])]
    .filter((step) => !step.deletedAt)
    .sort((a, b) => a.stepNo - b.stepNo);
}

/** ชื่อผู้อนุมัติของแต่ละขั้น ใช้วาดเป็นลูกโซ่ "ผู้ขอ → ... → ..." */
function getMatrixFlowSteps(matrix: ApprovalMatrixItem) {
  return getActiveSteps(matrix).map((step) => {
    if (step.approverType === "POSITION") {
      return step.position?.nameTh || "ตำแหน่ง (ยังไม่เลือก)";
    }
    if (step.approverType === "EMPLOYEE") {
      return (
        step.employee?.displayName ||
        step.employee?.employeeCode ||
        "พนักงาน (ยังไม่เลือก)"
      );
    }
    if (step.approverType === "ROLE") return step.roleCode || "Role (ยังไม่ระบุ)";
    return getApproverLabel(step.approverType);
  });
}

function getStepFormText(
  step: StepFormState,
  employees: EmployeeOption[],
  positions: PositionItem[],
) {
  if (step.approverType === "POSITION") {
    const position = positions.find((item) => item.id === step.positionId);
    return position ? position.nameTh || position.code : "ตำแหน่ง (ยังไม่เลือก)";
  }

  if (step.approverType === "EMPLOYEE") {
    const employee = employees.find((item) => item.id === step.employeeId);
    return employee ? getDisplayName(employee) : "พนักงาน (ยังไม่เลือก)";
  }

  if (step.approverType === "ROLE") {
    return step.roleCode.trim() || "Role (ยังไม่ระบุ)";
  }

  return getApproverLabel(step.approverType);
}

/**
 * สาขาทั้งหมดที่สายนี้ครอบ — ว่าง = ทุกสาขา
 * หลังบ้านเก็บสาขาแรกไว้ที่ branchId แล้วที่เหลืออยู่ใน extraBranches
 */
function getMatrixBranchIds(matrix: ApprovalMatrixItem) {
  return [
    matrix.branchId,
    ...(matrix.extraBranches?.map((item) => item.branchId) ?? []),
  ].filter((branchId): branchId is string => Boolean(branchId));
}

/** สายนี้ใช้กับใคร — อ่านจากข้อมูลจริงของ matrix */
function getMatrixScopeMode(matrix: ApprovalMatrixItem): FlowScopeMode {
  if ((matrix.requesters?.length ?? 0) > 0) return "people";
  return getMatrixBranchIds(matrix).length > 0 ? "branch" : "everyone";
}

function getMatrixScopeLabel(
  matrix: ApprovalMatrixItem,
  branches: OrganizationOption[],
) {
  const mode = getMatrixScopeMode(matrix);

  if (mode === "people") {
    return `เฉพาะ ${matrix.requesters?.length ?? 0} คน`;
  }

  if (mode === "branch") {
    const names = getMatrixBranchNames(matrix, branches);

    if (names.length === 0) return "สาขาที่ถูกปิดใช้งาน";
    if (names.length === 1) return `สาขา ${names[0]}`;

    // ชื่อสาขาครบ ๆ ยาวเกินหัวแถว เอาไปโชว์เป็นบรรทัดรองแทน
    return `${names.length} สาขา`;
  }

  return "พนักงานทุกคน";
}

/** ชื่อสาขาที่สายนี้ครอบ เรียงตามรายการสาขาของบริษัท */
function getMatrixBranchNames(
  matrix: ApprovalMatrixItem,
  branches: OrganizationOption[],
) {
  return getMatrixBranchIds(matrix).map((branchId) => {
    const branch = branches.find((item) => item.id === branchId);
    if (branch) return getBranchName(branch);

    // สาขาที่ถูกปิดใช้งานไปแล้วจะไม่อยู่ในรายการสาขาที่ใช้งานได้ แต่สายยังค้างอยู่
    return matrix.branch?.id === branchId && matrix.branch.nameTh
      ? `${matrix.branch.nameTh} (ปิดใช้งานแล้ว)`
      : "สาขาที่ปิดใช้งานแล้ว";
  });
}

/** ชื่อคนที่ผูกกับสายอนุมัติ ตัดที่ 4 คนแรกพอให้รู้ว่าเป็นกลุ่มไหน */
function getRequesterNames(matrix: ApprovalMatrixItem) {
  const requesters = matrix.requesters ?? [];

  const names = requesters
    .slice(0, 4)
    .map((requester) => {
      const employee = requester.employee;
      if (!employee) return null;

      return (
        employee.displayName ||
        `${employee.firstName} ${employee.lastName}`.trim() ||
        employee.employeeCode
      );
    })
    .filter(Boolean);

  if (names.length === 0) return "ไม่พบชื่อพนักงาน";

  return requesters.length > names.length
    ? `${names.join(", ")} และอีก ${requesters.length - names.length} คน`
    : names.join(", ");
}

/**
 * รายชื่อพนักงานทั้งบริษัท (ใช้เป็นตัวเลือกผู้อนุมัติและผู้ใช้สายอนุมัติ)
 *
 * /employees จำกัด pageSize ไว้ที่ 100 ต่อครั้ง ถ้ายิงหน้าเดียวแล้วบริษัทมีคนเกินนั้น
 * คนที่อยู่หน้าถัดไปจะไม่โผล่ในรายการให้เลือกเลย จึงต้องไล่ดึงจนครบ
 * (กันไว้ที่ 10 หน้า เผื่อ meta เพี้ยนจะได้ไม่วนไม่รู้จบ)
 */
async function fetchAllEmployees(): Promise<EmployeeOption[]> {
  const perPage = 100;
  const maxPages = 10;
  const items: EmployeeOption[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await apiFetch<EmployeeListResponse>(
      `/employees?page=${page}&pageSize=${perPage}`,
    );

    items.push(...(result.items ?? []));

    const totalPages = result.meta?.totalPages ?? 1;
    if (page >= totalPages || (result.items?.length ?? 0) < perPage) break;
  }

  return items;
}

/* ------------------------------------------------------------------ */
/* form state                                                          */
/* ------------------------------------------------------------------ */

function createStep(
  approverType: ApprovalStepApproverType = "SUPERVISOR",
): StepFormState {
  return {
    nameTh: "",
    description: "",
    approverType,
    fallbackApproverType: "",
    fallbackPositionId: "",
    fallbackEmployeeId: "",
    fallbackRoleCode: "",
    positionId: "",
    employeeId: "",
    roleCode: "",
    requireAll: false,
    minApproverCount: "1",
  };
}

function createFlowForm(
  options: {
    scopeMode?: FlowScopeMode;
    branchIds?: string[];
    priority?: number;
  } = {},
): FlowFormState {
  return {
    scopeMode: options.scopeMode ?? "everyone",
    branchIds: options.branchIds ?? [],
    requesterEmployeeIds: [],
    status: "ACTIVE",
    steps: [createStep("SUPERVISOR")],
    nameTh: "",
    description: "",
    departmentId: "",
    employeeTypeId: "",
    priority: String(options.priority ?? 1),
  };
}

function mapMatrixToForm(matrix: ApprovalMatrixItem): FlowFormState {
  const steps = getActiveSteps(matrix);

  return {
    scopeMode: getMatrixScopeMode(matrix),
    branchIds: getMatrixBranchIds(matrix),
    requesterEmployeeIds:
      matrix.requesters
        ?.map((requester) => requester.employeeId)
        .filter(Boolean) ?? [],
    status: matrix.status,
    steps:
      steps.length > 0
        ? steps.map((step) => ({
            nameTh: step.nameTh ?? "",
            description: step.description ?? "",
            approverType: step.approverType ?? "SUPERVISOR",
            fallbackApproverType: step.fallbackApproverType ?? "",
            fallbackPositionId: step.fallbackPositionId ?? "",
            fallbackEmployeeId: step.fallbackEmployeeId ?? "",
            fallbackRoleCode: step.fallbackRoleCode ?? "",
            positionId: step.positionId ?? "",
            employeeId: step.employeeId ?? "",
            roleCode: step.roleCode ?? "",
            requireAll: Boolean(step.requireAll),
            minApproverCount: String(step.minApproverCount ?? 1),
          }))
        : [createStep("SUPERVISOR")],
    nameTh: matrix.nameTh ?? "",
    description: matrix.description ?? "",
    departmentId: matrix.departmentId ?? "",
    employeeTypeId: matrix.employeeTypeId ?? "",
    priority: String(matrix.priority ?? 1),
  };
}

function getAutoName(
  targetType: ApprovalMatrixTargetType,
  scopeName: string,
) {
  return `${getRequestType(targetType).label} · ${scopeName}`;
}

/**
 * ลำดับความสำคัญของสายที่เพิ่มใหม่
 *
 * หลังบ้านเรียง priority น้อยก่อน แล้วค่อยดูว่าสายไหนเจาะจงกว่า สายเฉพาะสาขา/เฉพาะคน
 * จึงต้องมี priority ไม่มากกว่าสายของพนักงานทุกคน ไม่งั้นตั้งไว้ก็ไม่ถูกใช้
 * (ยังไม่มีสายที่เปิดใช้อยู่เลย ค่าจะเป็น Infinity — ถอยไปใช้ 1 ตามค่าเริ่มต้น)
 */
/**
 * ลำดับเส้นทางของประเภทคำขอหนึ่ง — เรียงจากกว้างไปแคบ
 *
 * ตรงกับลำดับที่หลังบ้านใช้จริง คนอ่านไล่จากบนลงล่างแล้วเจอข้อยกเว้นทีหลังเสมอ
 * แยกเป็นฟังก์ชันเพราะทั้งรายการและกล่องแก้ไขต้องนับ "เส้นที่ N" ให้ตรงกัน
 */
function getTypeRows(group: TypeGroup) {
  return [
    ...group.companyMatrices,
    ...group.branchMatrices,
    ...group.peopleMatrices,
  ];
}

function getScopePriority(group: TypeGroup) {
  return Number.isFinite(group.activeCompanyPriority)
    ? group.activeCompanyPriority
    : 1;
}

function validateFlow(form: FlowFormState) {
  if (form.scopeMode === "branch" && form.branchIds.length === 0) {
    return "เลือกสาขาที่จะใช้สายนี้อย่างน้อย 1 สาขา";
  }

  if (form.scopeMode === "people" && form.requesterEmployeeIds.length === 0) {
    return "เลือกพนักงานที่จะใช้สายนี้อย่างน้อย 1 คน";
  }

  if (form.steps.length === 0) return "กรุณากำหนดอย่างน้อย 1 ขั้นอนุมัติ";

  for (let index = 0; index < form.steps.length; index += 1) {
    const step = form.steps[index];
    if (step.approverType === "POSITION" && !step.positionId) {
      return `ขั้นที่ ${index + 1}: เลือกตำแหน่งของผู้อนุมัติก่อน`;
    }
    if (step.approverType === "EMPLOYEE" && !step.employeeId) {
      return `ขั้นที่ ${index + 1}: เลือกคนอนุมัติก่อน`;
    }
    if (step.approverType === "ROLE" && !step.roleCode.trim()) {
      return `ขั้นที่ ${index + 1}: ระบุกลุ่มสิทธิ์ก่อน`;
    }

    if (step.fallbackApproverType === "POSITION" && !step.fallbackPositionId) {
      return `ขั้นที่ ${index + 1}: เลือกตำแหน่งของผู้อนุมัติแทนก่อน`;
    }
    if (step.fallbackApproverType === "EMPLOYEE" && !step.fallbackEmployeeId) {
      return `ขั้นที่ ${index + 1}: เลือกคนอนุมัติแทนก่อน`;
    }
    if (step.fallbackApproverType === "ROLE" && !step.fallbackRoleCode.trim()) {
      return `ขั้นที่ ${index + 1}: ระบุกลุ่มสิทธิ์ของผู้อนุมัติแทนก่อน`;
    }
  }

  return null;
}

function buildFlowPayload(params: {
  form: FlowFormState;
  targetType: ApprovalMatrixTargetType;
  companyId: string;
  scopeName: string;
  mode: "create" | "edit";
}) {
  const { form, targetType, companyId, scopeName, mode } = params;

  /*
   * สามโหมดเป็นทางเลือกเดียว จึงต้องล้างอีกสองช่องเสมอ
   * ไม่งั้นแก้จาก "เฉพาะรายชื่อ" กลับเป็น "ทุกคน" แล้วรายชื่อเดิมยังค้างอยู่ในฐานข้อมูล
   */
  /* หลังบ้านเก็บสาขาแรกที่ branchId ที่เหลือส่งไปเป็น branchIds */
  const selectedBranchIds = form.scopeMode === "branch" ? form.branchIds : [];
  const branchId = selectedBranchIds[0] ?? "";
  const branchIds = selectedBranchIds.slice(1);
  const requesterEmployeeIds =
    form.scopeMode === "people" ? form.requesterEmployeeIds : [];

  return {
    ...(mode === "create"
      ? {
          companyId,
          code: `${targetTypeCodes[targetType]}-${Date.now().toString(36).toUpperCase()}`,
        }
      : {}),
    nameTh: form.nameTh.trim() || getAutoName(targetType, scopeName),
    description: form.description.trim() || undefined,
    targetType,
    ...(mode === "create" ? { branchId: branchId || undefined } : { branchId }),
    branchIds,
    departmentId: form.departmentId || undefined,
    employeeTypeId: form.employeeTypeId || undefined,
    requesterEmployeeIds,
    priority: Number(form.priority || 1),
    status: form.status,
    steps: form.steps.map((step, index) => ({
      stepNo: index + 1,
      nameTh: step.nameTh.trim() || defaultStepName[step.approverType],
      description: step.description.trim() || undefined,
      approverType: step.approverType,
      positionId:
        step.approverType === "POSITION" ? step.positionId || undefined : undefined,
      employeeId:
        step.approverType === "EMPLOYEE" ? step.employeeId || undefined : undefined,
      fallbackApproverType: step.fallbackApproverType || undefined,
      fallbackPositionId:
        step.fallbackApproverType === "POSITION"
          ? step.fallbackPositionId || undefined
          : undefined,
      fallbackEmployeeId:
        step.fallbackApproverType === "EMPLOYEE"
          ? step.fallbackEmployeeId || undefined
          : undefined,
      fallbackRoleCode:
        step.fallbackApproverType === "ROLE"
          ? step.fallbackRoleCode.trim().toUpperCase() || undefined
          : undefined,
      roleCode:
        step.approverType === "ROLE" ? step.roleCode.trim() || undefined : undefined,
      requireAll: step.requireAll,
      minApproverCount: Number(step.minApproverCount || 1),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export function ApprovalWorkflowPanel() {
  const { user } = useAuth();
  const isPlatform = user?.scope?.level === "GLOBAL";
  const isBranchScoped = user?.scope?.level === "BRANCH";
  const lockedBranchId = isBranchScoped ? (user?.scope?.branchId ?? "") : "";

  const [matrices, setMatrices] = useState<ApprovalMatrixItem[]>([]);
  const [companies, setCompanies] = useState<OrganizationOption[]>([]);
  const [branches, setBranches] = useState<OrganizationOption[]>([]);
  const [departments, setDepartments] = useState<OrganizationOption[]>([]);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // COMPANY/BRANCH scope รู้บริษัทตั้งแต่แรกจาก token จึงยิง request เดียวจบ
  const [companyId, setCompanyId] = useState(user?.scope?.companyId ?? "");
  const [selectedType, setSelectedType] =
    useState<ApprovalMatrixTargetType>("LEAVE_REQUEST");

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<FlowFormState>(() => createFlowForm());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyMatrixId, setBusyMatrixId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<ActionDialogState | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial" && !hasLoadedRef.current) setLoading(true);
        if (mode === "refresh") setRefreshing(true);
        setError(null);

        const matrixParams = new URLSearchParams({
          page: "1",
          pageSize: String(pageSize),
        });
        if (companyId) matrixParams.set("companyId", companyId);

        const [
          matrixResult,
          companyResult,
          branchResult,
          departmentResult,
          positionResult,
          employeeResult,
        ] = await Promise.all([
          apiFetchWithMeta<ApprovalMatrixItem[], PaginationMeta>(
            `/organization/approval-matrices?${matrixParams.toString()}`,
          ),
          apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
            "/organization/companies?page=1&pageSize=100&status=ACTIVE",
          ),
          apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
            "/organization/branches?page=1&pageSize=100&status=ACTIVE",
          ),
          apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
            "/organization/departments?page=1&pageSize=100&status=ACTIVE",
          ),
          apiFetchWithMeta<PositionItem[], PaginationMeta>(
            "/organization/positions?page=1&pageSize=100&status=ACTIVE",
          ),
          fetchAllEmployees(),
        ]);

        setMatrices(matrixResult.data || []);
        setCompanies(companyResult.data || []);
        setBranches(branchResult.data || []);
        setDepartments(departmentResult.data || []);
        setPositions(positionResult.data || []);
        setEmployees(employeeResult);
        setLoadedAt(new Date().toISOString());
        hasLoadedRef.current = true;

        if (!companyId && companyResult.data?.[0]?.id) {
          setCompanyId(companyResult.data[0].id);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลสายอนุมัติได้",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const activeCompany = useMemo(
    () =>
      companies.find((company) => company.id === companyId) ??
      companies[0] ??
      null,
    [companies, companyId],
  );

  const companyBranches = useMemo(() => {
    const list = companyId
      ? branches.filter(
          (branch) => !branch.companyId || branch.companyId === companyId,
        )
      : branches;

    return [...list].sort((left, right) =>
      getBranchName(left).localeCompare(getBranchName(right), "th"),
    );
  }, [branches, companyId]);

  const companyDepartments = useMemo(() => {
    const list = companyId
      ? departments.filter(
          (department) =>
            !department.companyId || department.companyId === companyId,
        )
      : departments;

    return [...list].sort((left, right) =>
      (left.nameTh || left.code).localeCompare(
        right.nameTh || right.code,
        "th",
      ),
    );
  }, [companyId, departments]);

  const companyEmployees = useMemo(
    () =>
      companyId
        ? employees.filter(
            (item) => !item.companyId || item.companyId === companyId,
          )
        : employees,
    [companyId, employees],
  );

  /** จัดกลุ่มสายอนุมัติตามประเภทคำขอ + คำนวณความครอบคลุมของสาขา */
  const typeGroups: TypeGroup[] = useMemo(() => {
    return requestTypes.map((type) => {
      const items = matrices.filter(
        (matrix) =>
          matrix.targetType === type.value &&
          (!companyId || matrix.companyId === companyId),
      );

      const peopleMatrices = items.filter(
        (matrix) => getMatrixScopeMode(matrix) === "people",
      );
      const scopeMatrices = items.filter(
        (matrix) => getMatrixScopeMode(matrix) !== "people",
      );
      const companyMatrices = scopeMatrices.filter((matrix) => !matrix.branchId);
      const branchMatrices = scopeMatrices.filter((matrix) =>
        Boolean(matrix.branchId),
      );

      const knownBranchIds = new Set(
        companyBranches.map((branch) => branch.id),
      );
      const orphanBranchMatrices = branchMatrices.filter(
        (matrix) => matrix.branchId && !knownBranchIds.has(matrix.branchId),
      );
      const hasCompanyFallback = companyMatrices.some(
        (matrix) => matrix.status === "ACTIVE",
      );
      // สายหนึ่งครอบได้หลายสาขา ต้องนับทุกสาขาในสาย ไม่ใช่แค่สาขาแรก
      // ไม่งั้นสาขาที่ 2 เป็นต้นไปจะขึ้นเตือนว่า "ยังส่งคำขอไม่ได้" ทั้งที่ครอบอยู่แล้ว
      const activeBranchIds = new Set(
        branchMatrices
          .filter((matrix) => matrix.status === "ACTIVE")
          .flatMap((matrix) => getMatrixBranchIds(matrix)),
      );
      const uncoveredBranches = hasCompanyFallback
        ? []
        : companyBranches.filter((branch) => !activeBranchIds.has(branch.id));

      // backend เรียง priority ก่อนแล้วค่อยดูความเจาะจง สายสาขาที่ priority สูงกว่าจึงถูกสายทั้งบริษัทบดบัง
      const activeCompanyPriority = companyMatrices
        .filter((matrix) => matrix.status === "ACTIVE")
        .reduce(
          (min, matrix) => Math.min(min, matrix.priority),
          Number.POSITIVE_INFINITY,
        );
      const shadowedBranchMatrices = branchMatrices.filter(
        (matrix) =>
          matrix.status === "ACTIVE" && matrix.priority > activeCompanyPriority,
      );

      const isConfigured = items.length > 0;
      const isActive = items.some((matrix) => matrix.status === "ACTIVE");

      return {
        type,
        items,
        companyMatrices,
        branchMatrices,
        peopleMatrices,
        scopeMatrices,
        orphanBranchMatrices,
        shadowedBranchMatrices,
        activeCompanyPriority,
        hasCompanyFallback,
        uncoveredBranches,
        isConfigured,
        isActive,
        isCovered: isActive && uncoveredBranches.length === 0,
      };
    });
  }, [companyBranches, companyId, matrices]);

  const selectedGroup = useMemo(
    () =>
      typeGroups.find((group) => group.type.value === selectedType) ??
      typeGroups[0],
    [selectedType, typeGroups],
  );

  const summary = useMemo(() => {
    const active = typeGroups.filter((group) => group.isActive).length;
    const gaps = typeGroups.filter(
      (group) => group.isActive && !group.isCovered,
    ).length;

    return { active, gaps, total: typeGroups.length };
  }, [typeGroups]);

  /** สายอนุมัติที่ค้างอยู่จากประเภทที่ระบบยังไม่รองรับ (ตั้งไว้ก็ไม่มีผล) */
  const unsupportedMatrices = useMemo(
    () =>
      matrices.filter(
        (matrix) =>
          !supportedTargetTypes.has(matrix.targetType) &&
          (!companyId || matrix.companyId === companyId),
      ),
    [companyId, matrices],
  );

  /**
   * พนักงานที่ถูกเส้นอื่นของประเภทเดียวกันจองไว้แล้ว
   *
   * คนหนึ่งอยู่ได้เส้นเดียว ถ้าใส่ชื่อซ้ำสองเส้น หลังบ้านจะเลือกให้เองตามลำดับที่สร้าง
   * ซึ่งเดาไม่ออกจากหน้าจอ — กันไว้ตั้งแต่ตอนเลือกดีกว่ามาไล่หาทีหลังว่าทำไมใบไม่เข้าเส้นที่ตั้งไว้
   */
  const takenByOtherLine = useMemo(() => {
    const taken = new Map<string, number>();
    if (!editor) return taken;

    const group = typeGroups.find(
      (item) => item.type.value === editor.targetType,
    );
    if (!group) return taken;

    getTypeRows(group).forEach((matrix, index) => {
      if (matrix.id === editor.matrixId) return;

      matrix.requesters?.forEach((requester) => {
        taken.set(requester.employeeId, index + 1);
      });
    });

    return taken;
  }, [editor, typeGroups]);

  const editorScopeName = useMemo(() => {
    if (form.scopeMode === "people") {
      return `เฉพาะ ${form.requesterEmployeeIds.length} คน`;
    }
    if (form.scopeMode === "branch") {
      if (form.branchIds.length === 1) {
        return getBranchName(
          companyBranches.find((branch) => branch.id === form.branchIds[0]),
        );
      }
      return `${form.branchIds.length} สาขา`;
    }
    return "พนักงานทุกคน";
  }, [
    companyBranches,
    form.branchIds,
    form.requesterEmployeeIds.length,
    form.scopeMode,
  ]);

  /* --------------------------- actions --------------------------- */

  function openEditor(
    targetType: ApprovalMatrixTargetType,
    matrix?: ApprovalMatrixItem | null,
    options: {
      scopeMode?: FlowScopeMode;
      branchId?: string;
      priority?: number;
    } = {},
  ) {
    setEditor({ targetType, matrixId: matrix?.id ?? null });
    setForm(
      matrix
        ? mapMatrixToForm(matrix)
        : createFlowForm({
            ...options,
            // ผู้ดูแลระดับสาขาตั้งได้เฉพาะสาขาตัวเองเท่านั้น
            ...(isBranchScoped
              ? {
                  scopeMode: options.scopeMode ?? "branch",
                  branchIds: lockedBranchId ? [lockedBranchId] : [],
                }
              : {}),
          }),
    );
    setFormError(null);
    setActionError(null);
  }

  function closeEditor() {
    setEditor(null);
    setFormError(null);
  }

  async function saveFlow() {
    if (!editor) return;
    if (!companyId) {
      setFormError("ไม่พบบริษัทที่จะบันทึก");
      return;
    }

    const validationError = validateFlow(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setSaving(true);
      setFormError(null);
      const payload = buildFlowPayload({
        form,
        targetType: editor.targetType,
        companyId,
        scopeName: editorScopeName,
        mode: editor.matrixId ? "edit" : "create",
      });

      if (editor.matrixId) {
        await apiFetch(`/organization/approval-matrices/${editor.matrixId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/organization/approval-matrices", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setEditor(null);
      await loadData("refresh");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "บันทึกสายอนุมัติไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function patchMatrixStatus(
    matrix: ApprovalMatrixItem,
    status: MasterStatus,
  ) {
    try {
      setBusyMatrixId(matrix.id);
      setActionError(null);
      await apiFetch(`/organization/approval-matrices/${matrix.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadData("refresh");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "ปรับสถานะไม่สำเร็จ");
    } finally {
      setBusyMatrixId(null);
    }
  }

  /** สร้างสายเริ่มต้น "หัวหน้าโดยตรง 1 ขั้น" ให้ทั้งบริษัท */
  async function createDefaultFlow(targetType: ApprovalMatrixTargetType) {
    await apiFetch("/organization/approval-matrices", {
      method: "POST",
      body: JSON.stringify(
        buildFlowPayload({
          form: createFlowForm(
            isBranchScoped
              ? {
                  scopeMode: "branch",
                  branchIds: lockedBranchId ? [lockedBranchId] : [],
                }
              : {},
          ),
          targetType,
          companyId,
          scopeName: isBranchScoped ? "สาขาของฉัน" : "พนักงานทุกคน",
          mode: "create",
        }),
      ),
    });
  }

  /** เปิด/ปิดทั้งประเภทคำขอ — ถ้ายังไม่เคยตั้งค่า จะสร้างสายเริ่มต้นให้ */
  async function toggleType(group: TypeGroup) {
    if (!companyId) {
      setActionError("ไม่พบบริษัทที่จะตั้งค่า");
      return;
    }

    if (!group.isConfigured) {
      try {
        setBusyMatrixId(group.type.value);
        setActionError(null);
        await createDefaultFlow(group.type.value);
        await loadData("refresh");
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "เปิดใช้งานประเภทคำขอไม่สำเร็จ",
        );
      } finally {
        setBusyMatrixId(null);
      }

      return;
    }

    const nextStatus: MasterStatus = group.isActive ? "INACTIVE" : "ACTIVE";
    const targets = group.items.filter((matrix) => matrix.status !== nextStatus);

    try {
      setBusyMatrixId(group.type.value);
      setActionError(null);
      await Promise.all(
        targets.map((matrix) =>
          apiFetch(`/organization/approval-matrices/${matrix.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: nextStatus }),
          }),
        ),
      );
      await loadData("refresh");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "ปรับสถานะประเภทคำขอไม่สำเร็จ",
      );
    } finally {
      setBusyMatrixId(null);
    }
  }

  /**
   * ตั้งค่าเริ่มต้นให้ทุกประเภทที่ยังว่างในคลิกเดียว
   * บริษัทที่เพิ่งเปิดใช้ระบบจะได้ไม่ต้องนั่งกดทีละประเภทแล้วเดาว่าต้องใส่อะไร
   */
  async function setupAllDefaults() {
    if (!companyId) {
      setActionError("ไม่พบบริษัทที่จะตั้งค่า");
      return;
    }

    const pending = typeGroups.filter((group) => !group.isConfigured);
    if (pending.length === 0) return;

    try {
      setBusyMatrixId("setup-all");
      setActionError(null);
      for (const group of pending) {
        await createDefaultFlow(group.type.value);
      }
      await loadData("refresh");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "ตั้งค่าเริ่มต้นไม่สำเร็จ",
      );
    } finally {
      setBusyMatrixId(null);
    }
  }

  /** ปรับ priority ของสายรายสาขาที่ถูกสายทั้งบริษัทบดบัง ให้เท่ากับสายทั้งบริษัท */
  async function fixShadowedPriorities(group: TypeGroup) {
    if (group.shadowedBranchMatrices.length === 0) return;

    try {
      setBusyMatrixId(`${group.type.value}-priority`);
      setActionError(null);
      await Promise.all(
        group.shadowedBranchMatrices.map((matrix) =>
          apiFetch(`/organization/approval-matrices/${matrix.id}`, {
            method: "PATCH",
            body: JSON.stringify({ priority: group.activeCompanyPriority }),
          }),
        ),
      );
      await loadData("refresh");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "แก้ลำดับความสำคัญไม่สำเร็จ",
      );
    } finally {
      setBusyMatrixId(null);
    }
  }

  function confirmCleanupUnsupported() {
    setDialogState({
      title: "ล้างสายอนุมัติที่ไม่ได้ใช้",
      description: `พบสายอนุมัติ ${unsupportedMatrices.length} รายการของประเภทคำขอที่ระบบยังไม่รองรับ (ขอเอกสาร / รอบเงินเดือน / เปลี่ยนข้อมูลพนักงาน / คำขอทั่วไป) ตั้งค่าไว้ก็ไม่มีผลกับการอนุมัติจริง ต้องการลบทิ้งหรือไม่`,
      confirmLabel: "ลบทั้งหมด",
      cancelLabel: "เก็บไว้ก่อน",
      tone: "orange",
      onConfirm: async () => {
        setDialogLoading(true);
        try {
          await Promise.all(
            unsupportedMatrices.map((matrix) =>
              apiFetch(`/organization/approval-matrices/${matrix.id}`, {
                method: "DELETE",
              }),
            ),
          );
          await loadData("refresh");
        } finally {
          setDialogLoading(false);
        }
      },
    });
  }

  function confirmDeleteMatrix(matrix: ApprovalMatrixItem) {
    const scopeLabel = getMatrixScopeLabel(matrix, companyBranches);

    setDialogState({
      title: "ลบเส้นทางอนุมัตินี้",
      description: `ต้องการลบเส้นทางของ "${scopeLabel}" หรือไม่ หลังลบ คนกลุ่มนี้จะกลับไปเดินเส้นของพนักงานทุกคน`,
      confirmLabel: "ลบเส้นทาง",
      cancelLabel: "ยกเลิก",
      tone: "red",
      onConfirm: async () => {
        setDialogLoading(true);
        try {
          await apiFetch(`/organization/approval-matrices/${matrix.id}`, {
            method: "DELETE",
          });
          await loadData("refresh");
        } finally {
          setDialogLoading(false);
        }
      },
    });
  }

  /* --------------------------- render ---------------------------- */

  const pendingSetupCount = typeGroups.filter(
    (group) => !group.isConfigured,
  ).length;

  return (
    <>
      {/* แถบเครื่องมือ — หัวเรื่องอยู่ที่หน้าหลักแล้ว */}
      <Toolbar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-700 3xl:text-[14px]">
            {activeCompany ? getBranchName(activeCompany) : "ยังไม่มีบริษัท"}
          </span>
          <Badge tone={summary.active > 0 ? "positive" : "neutral"}>
            เปิดใช้ {summary.active}/{summary.total} ประเภท
          </Badge>
          {summary.gaps > 0 ? (
            <Badge tone="warning">มีสาขาที่ยังส่งคำขอไม่ได้</Badge>
          ) : null}
          <span className="text-[13px] text-slate-400">
            {companyBranches.length} สาขา
            {loadedAt ? (
              <>
                {" · อัปเดต "}
                <DateTimeDisplay value={loadedAt} />
              </>
            ) : null}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isPlatform && companies.length > 1 ? (
            <Select
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setEditor(null);
              }}
              aria-label="บริษัท"
              className="w-48"
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nameTh || company.code}
                </option>
              ))}
            </Select>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadData("refresh")}
            disabled={refreshing}
            icon={
              refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" />
              )
            }
          >
            รีเฟรช
          </Button>
        </div>
      </Toolbar>

      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center">
          <div className="flex items-center gap-3 text-[13px] text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            กำลังโหลดข้อมูล...
          </div>
        </div>
      ) : error ? (
        <div className="px-5 py-16 text-center sm:px-6">
          <p className="text-[13px] font-semibold text-slate-600">{error}</p>
          <div className="mt-4 flex justify-center">
            <Button size="sm" onClick={() => void loadData("refresh")}>
              ลองใหม่
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 sm:px-6 3xl:px-7">
          {actionError ? (
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 3xl:text-[12.5px]">
              {actionError}
            </div>
          ) : null}

          {/*
            บริษัทที่ยังไม่เคยตั้งค่าเลย เปิดหน้ามาจะเจอ 4 กล่องว่างแล้วไม่รู้ว่าต้องเริ่มตรงไหน
            แถบนี้ตอบให้ตรง ๆ ว่ากดปุ่มเดียวจบ แล้วค่อยไปปรับรายละเอียดทีหลัง
          */}
          {pendingSetupCount > 0 ? (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600">
                  <Wand2 className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
                    ยังไม่ได้ตั้งค่า {pendingSetupCount} ประเภท
                  </p>
                  <p className="mt-0.5 text-[12px] leading-5 text-slate-600 3xl:text-[12.5px]">
                    เริ่มจากเส้นเดียวก่อนได้ — ทุกคำขอส่งถึง
                    <span className="font-semibold text-slate-800">
                      {" หัวหน้าโดยตรง "}
                    </span>
                    เป็นคนอนุมัติ แล้วค่อยแก้ทีหลังทีละประเภท
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                loading={busyMatrixId === "setup-all"}
                onClick={() => void setupAllDefaults()}
                icon={<Wand2 className="h-3.5 w-3.5" />}
              >
                ตั้งค่าเริ่มต้นให้ครบ
              </Button>
            </div>
          ) : null}

          {unsupportedMatrices.length > 0 ? (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-xs font-semibold leading-5 text-amber-900 3xl:text-[12.5px]">
                มีสายอนุมัติค้างอยู่ {unsupportedMatrices.length} รายการ
                จากประเภทคำขอที่ระบบยังไม่รองรับ — ตั้งไว้ก็ไม่มีผลกับการอนุมัติจริง
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={confirmCleanupUnsupported}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                ล้างทิ้ง
              </Button>
            </div>
          ) : null}

          {/*
            ซ้าย = เลือกประเภทคำขอ / ขวา = เส้นทางของประเภทที่เลือก
            แบ่งด้วยเส้นตามโทนของระบบ ไม่ใช่การ์ดสองใบวางคู่กัน
          */}
          <div className="-mx-5 grid min-w-0 gap-0 border-t border-slate-200 sm:-mx-6 lg:grid-cols-[minmax(260px,320px)_1fr] 3xl:-mx-7">
            <aside className="min-w-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
              <ul className="divide-y divide-slate-100">
                {typeGroups.map((group) => (
                  <TypeNavItem
                    key={group.type.value}
                    group={group}
                    selected={group.type.value === selectedGroup.type.value}
                    busy={busyMatrixId === group.type.value}
                    onSelect={() => setSelectedType(group.type.value)}
                    onToggle={() => void toggleType(group)}
                  />
                ))}
              </ul>
            </aside>

            <section className="min-w-0">
              <TypeSection
                group={selectedGroup}
                branches={companyBranches}
                busyId={busyMatrixId}
                onFixPriority={() => void fixShadowedPriorities(selectedGroup)}
                onEdit={(matrix) =>
                  openEditor(selectedGroup.type.value, matrix)
                }
                /*
                  เส้นที่เพิ่มทีหลังมักเป็นข้อยกเว้นของคนบางกลุ่ม จึงเปิดมาที่
                  "เฉพาะคนที่เลือก" ให้เลย สลับเป็นเฉพาะสาขาได้ในกล่องเดียวกัน
                */
                onCreateLine={() =>
                  openEditor(selectedGroup.type.value, null, {
                    scopeMode: "people",
                    priority: getScopePriority(selectedGroup),
                  })
                }
                onToggleMatrix={(matrix) =>
                  void patchMatrixStatus(
                    matrix,
                    matrix.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                  )
                }
                onDelete={(matrix) => confirmDeleteMatrix(matrix)}
              />
            </section>
          </div>
        </div>
      )}

      {editor ? (
        <FlowEditorModal
          targetType={editor.targetType}
          isNew={!editor.matrixId}
          form={form}
          setForm={setForm}
          branches={companyBranches}
          departments={companyDepartments}
          positions={positions}
          employees={companyEmployees}
          takenByOtherLine={takenByOtherLine}
          isBranchScoped={isBranchScoped}
          saving={saving}
          error={formError}
          onCancel={closeEditor}
          onSave={() => void saveFlow()}
        />
      ) : null}

      <ActionDialog
        state={dialogState}
        loading={dialogLoading}
        onClose={() => setDialogState(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* left nav                                                            */
/* ------------------------------------------------------------------ */

/**
 * เมนูประเภทคำขอทางซ้าย
 *
 * โครงเดียวกับแท็บ OT — สวิตช์เปิด/ปิดแยกจากปุ่มเลือก จะได้ไม่กดผิด
 * บอกสามอย่างในบรรทัดเดียว: ชื่อประเภท / ตั้งกี่เส้นแล้ว / คำอธิบาย
 */
function TypeNavItem({
  group,
  selected,
  busy,
  onSelect,
  onToggle,
}: {
  group: TypeGroup;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const lineCount = getTypeRows(group).length;

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-2.5 transition",
          selected
            ? "bg-brand-50/70 shadow-[inset_2px_0_0_#2563eb]"
            : "hover:bg-slate-50",
        )}
      >
        {/* สวิตช์เปิด/ปิด แยกจากปุ่มเลือก เพื่อไม่ให้กดผิด */}
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          title={group.isActive ? "ปิดรับคำขอประเภทนี้" : "เปิดรับคำขอประเภทนี้"}
          aria-label={group.isActive ? "ปิดรับคำขอ" : "เปิดรับคำขอ"}
          aria-pressed={group.isActive}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
            group.isActive
              ? "border-emerald-500 bg-emerald-500"
              : "border-slate-300 bg-slate-200",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white shadow-sm transition-all",
              group.isActive ? "left-[18px]" : "left-0.5",
            )}
          >
            {busy ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-500" />
            ) : null}
          </span>
        </button>

        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "truncate text-[13px] font-semibold 3xl:text-[14px]",
                  group.isActive ? "text-slate-900" : "text-slate-400",
                )}
              >
                {group.type.label}
              </span>
              {group.isConfigured ? (
                <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-brand-700">
                  {lineCount} เส้น
                </span>
              ) : null}
              {/* เตือนตั้งแต่ในเมนู ว่าประเภทนี้มีสาขาที่ยังส่งคำขอไม่ได้ */}
              {group.isActive && !group.isCovered ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : null}
            </span>
            <span className="block truncate text-[11px] text-slate-400">
              {group.type.description}
            </span>
          </span>

          {selected ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-brand-500" />
          ) : null}
        </button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* one request type                                                    */
/* ------------------------------------------------------------------ */

function TypeSection({
  group,
  branches,
  busyId,
  onFixPriority,
  onEdit,
  onCreateLine,
  onToggleMatrix,
  onDelete,
}: {
  group: TypeGroup;
  branches: OrganizationOption[];
  busyId: string | null;
  onFixPriority: () => void;
  onEdit: (matrix: ApprovalMatrixItem) => void;
  /** เพิ่มเส้นทางใหม่ให้ประเภทคำขอนี้ */
  onCreateLine: () => void;
  onToggleMatrix: (matrix: ApprovalMatrixItem) => void;
  onDelete: (matrix: ApprovalMatrixItem) => void;
}) {
  const rows = getTypeRows(group);

  if (!group.isConfigured) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 px-5 text-center">
        <p className="text-[13.5px] font-bold text-slate-700 3xl:text-[14.5px]">
          ยังไม่มีเส้นทางอนุมัติ — พนักงานส่ง{group.type.label}ไม่ได้
        </p>
        <p className="max-w-sm text-[12.5px] leading-5 text-slate-500">
          กดสวิตช์ของ &ldquo;{group.type.label}&rdquo; ในรายการด้านซ้าย
          เพื่อสร้างเส้นแรก (พนักงานทุกคน → หัวหน้าโดยตรง)
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 p-5 xl:p-6 max-[1536px]:p-4">
      {/* หัวข้อของประเภทที่เลือก + ปุ่มเพิ่มเส้นทาง */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-bold text-slate-900 3xl:text-[16.5px]">
              {group.type.label}
            </h3>
            <Badge tone={group.isActive ? "positive" : "neutral"}>
              {group.isActive ? "เปิดรับคำขอ" : "ปิดรับคำขอ"}
            </Badge>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
              {rows.length} เส้นทาง
            </span>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            คำขอหนึ่งใบเดินเส้นเดียว — ระบบเลือกเส้นที่เจาะจงกับคนยื่นที่สุดให้
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={onCreateLine}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          เพิ่มเส้นทางอนุมัติ
        </Button>
      </div>

      {/* เตือนเฉพาะเรื่องที่ทำให้พนักงานส่งคำขอไม่ได้จริง ๆ */}
      {group.isActive && group.uncoveredBranches.length > 0 ? (
        <WarningBar
          text={`พนักงานสาขา ${group.uncoveredBranches
            .map((branch) => getBranchName(branch))
            .join(", ")} ยังส่งคำขอนี้ไม่ได้ — เพิ่มเส้นของพนักงานทุกคน หรือเส้นเฉพาะสาขานั้น`}
        />
      ) : null}

      {group.shadowedBranchMatrices.length > 0 ? (
        <WarningBar
          text={`เส้นเฉพาะสาขา ${group.shadowedBranchMatrices.length} เส้นถูกเส้นของพนักงานทุกคนบังไว้ ตั้งไว้ก็ไม่ถูกใช้`}
          action={
            <Button
              variant="secondary"
              size="sm"
              loading={busyId === `${group.type.value}-priority`}
              onClick={onFixPriority}
            >
              แก้ให้อัตโนมัติ
            </Button>
          }
        />
      ) : null}

      <div className="rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
            เส้นทางอนุมัติ
          </p>
          <p className="text-[12px] text-slate-400 3xl:text-[12.5px]">
            เรียงจากกว้างไปแคบ เส้นล่างเป็นข้อยกเว้นของเส้นบน
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((matrix, index) => (
            <RuleRow
              key={matrix.id}
              index={index + 1}
              matrix={matrix}
              branches={branches}
              busy={busyId === matrix.id}
              hasOtherLines={rows.length > 1}
              onEdit={() => onEdit(matrix)}
              onToggle={() => onToggleMatrix(matrix)}
              onDelete={rows.length > 1 ? () => onDelete(matrix) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WarningBar({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex min-w-0 items-start gap-2 text-[12px] font-semibold leading-5 text-amber-900 3xl:text-[12.5px]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {text}
      </p>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* one rule                                                            */
/* ------------------------------------------------------------------ */

function RuleRow({
  index,
  matrix,
  branches,
  busy,
  hasOtherLines,
  onEdit,
  onToggle,
  onDelete,
}: {
  index: number;
  matrix: ApprovalMatrixItem;
  branches: OrganizationOption[];
  busy: boolean;
  /** มีเส้นอื่นในประเภทเดียวกันหรือไม่ — ใช้บอกว่าเส้น "ทุกคน" คือส่วนที่เหลือ */
  hasOtherLines: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  const mode = getMatrixScopeMode(matrix);
  const steps = getMatrixFlowSteps(matrix);
  const branchNames = getMatrixBranchNames(matrix, branches);
  const inactive = matrix.status !== "ACTIVE";

  const ScopeIcon =
    mode === "people" ? UserCheck : mode === "branch" ? MapPin : Users;

  return (
    <article
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2.5 px-1 py-3 transition",
        inactive ? "bg-slate-50/60" : "hover:bg-brand-50/40",
      )}
    >
      {/* เลขเส้น — ทำให้เห็นว่าประเภทนี้มีหลายเส้นขนานกัน ไม่ใช่ขั้นต่อกัน */}
      <span
        className={cn(
          "flex h-7 shrink-0 items-center rounded-lg px-2 text-[11px] font-bold 3xl:text-[11.5px]",
          inactive
            ? "bg-slate-100 text-slate-400"
            : "bg-slate-100 text-slate-600",
        )}
      >
        เส้นที่ {index}
      </span>

      {/* ซ้าย = ใครเดินเส้นนี้ */}
      <div className="w-[13.5rem] shrink-0">
        <p
          className={cn(
            "flex items-center gap-1.5 text-[13px] font-bold 3xl:text-[13.5px]",
            inactive ? "text-slate-400" : "text-slate-900",
          )}
        >
          <ScopeIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">
            {getMatrixScopeLabel(matrix, branches)}
          </span>
        </p>

        {mode === "people" ? (
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {getRequesterNames(matrix)}
          </p>
        ) : mode === "branch" ? (
          <p
            className="mt-0.5 truncate text-[11px] text-slate-500"
            title={branchNames.join(", ")}
          >
            {branchNames.join(", ")}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-slate-400">
            {hasOtherLines ? "คนที่ไม่อยู่ในเส้นอื่น" : "ค่าเริ่มต้นของบริษัท"}
          </p>
        )}
      </div>

      {/* กลาง = เดินผ่านใครบ้าง อ่านจากซ้ายไปขวาได้ทันที */}
      <div className="flex min-w-[14rem] flex-1 flex-wrap items-center gap-1.5">
        {steps.length === 0 ? (
          <span className="text-[12.5px] font-semibold text-amber-700">
            ยังไม่ได้กำหนดผู้อนุมัติ
          </span>
        ) : (
          steps.map((step, index) => (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 ? (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              ) : null}
              <span
                className={cn(
                  "inline-flex items-center rounded-lg px-2 py-1 text-[12px] font-semibold 3xl:text-[12.5px]",
                  inactive
                    ? "bg-slate-100 text-slate-400"
                    : "bg-brand-50 text-brand-700",
                )}
              >
                {step}
              </span>
            </span>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {inactive ? <Badge tone="neutral">ปิดอยู่</Badge> : null}

        <button type="button" onClick={onEdit} className={buttonSecondaryClass}>
          <Pencil className="h-3.5 w-3.5" />
          แก้ไข
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className={buttonGhostClass}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {inactive ? "เปิด" : "ปิด"}
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="ลบสายอนุมัติ"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-100 bg-white text-rose-600 transition hover:bg-rose-50 3xl:h-10 3xl:w-10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* editor                                                              */
/* ------------------------------------------------------------------ */

function FlowEditorModal({
  targetType,
  isNew,
  form,
  setForm,
  branches,
  departments,
  positions,
  employees,
  takenByOtherLine,
  isBranchScoped,
  saving,
  error,
  onCancel,
  onSave,
}: {
  targetType: ApprovalMatrixTargetType;
  isNew: boolean;
  form: FlowFormState;
  setForm: Dispatch<SetStateAction<FlowFormState>>;
  branches: OrganizationOption[];
  departments: OrganizationOption[];
  positions: PositionItem[];
  employees: EmployeeOption[];
  /** พนักงาน -> เลขเส้นที่จองคนนี้ไว้แล้ว (เส้นอื่นของประเภทคำขอเดียวกัน) */
  takenByOtherLine: Map<string, number>;
  isBranchScoped: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const type = getRequestType(targetType);

  const requesterLabel =
    form.scopeMode === "people"
      ? `เฉพาะ ${form.requesterEmployeeIds.length} คน`
      : form.scopeMode === "branch"
        ? form.branchIds.length === 1
          ? getBranchName(
              branches.find((branch) => branch.id === form.branchIds[0]),
            )
          : `${form.branchIds.length} สาขา`
        : "พนักงานทุกคน";

  function updateStep(index: number, patch: Partial<StepFormState>) {
    setForm((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    }));
  }

  function changeApproverType(
    index: number,
    approverType: ApprovalStepApproverType,
  ) {
    updateStep(index, {
      approverType,
      nameTh: "",
      positionId:
        approverType === "POSITION" ? form.steps[index].positionId : "",
      employeeId:
        approverType === "EMPLOYEE" ? form.steps[index].employeeId : "",
      roleCode: approverType === "ROLE" ? form.steps[index].roleCode : "",
    });
  }

  return (
    <Modal
      open
      size="lg"
      title={`${isNew ? "เพิ่ม" : "แก้ไข"}เส้นทางอนุมัติ · ${type.label}`}
      description="ตอบสองข้อ: ใครเดินเส้นนี้ แล้วให้ใครเป็นคนอนุมัติ"
      onClose={onCancel}
      footer={
        <ModalActions
          onCancel={onCancel}
          onConfirm={onSave}
          confirmLabel="บันทึกเส้นทาง"
          loading={saving}
        />
      }
    >
      <div className="space-y-4">
        {/* สรุปเส้นทางแบบอ่านได้ทันที เปลี่ยนตามที่กรอกด้านล่าง */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-brand-50/60 px-3.5 py-2.5">
          <span className="inline-flex items-center rounded-lg bg-white px-2 py-1 text-[12px] font-bold text-slate-700 3xl:text-[12.5px]">
            {requesterLabel}
          </span>
          {form.steps.map((step, index) => (
            <span key={index} className="flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brand-300" />
              <span className="inline-flex items-center rounded-lg bg-brand-600 px-2 py-1 text-[12px] font-bold text-white 3xl:text-[12.5px]">
                {getStepFormText(step, employees, positions)}
              </span>
            </span>
          ))}
        </div>

        <FormSection
          step="1"
          title="ใครเดินเส้นนี้"
          hint="เลือกได้แบบเดียว — คนที่ระบุชื่อไว้จะเดินเส้นนี้แทนเส้นอื่นเสมอ"
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <ChoiceCard
              active={form.scopeMode === "everyone"}
              disabled={isBranchScoped}
              icon={Users}
              title="พนักงานทุกคน"
              description="เส้นหลัก คนที่ไม่เข้าเส้นอื่นมาที่นี่"
              onSelect={() =>
                setForm((current) => ({ ...current, scopeMode: "everyone" }))
              }
            />
            <ChoiceCard
              active={form.scopeMode === "branch"}
              icon={Building2}
              title="เฉพาะสาขา"
              description="ติ๊กได้หลายสาขา ใช้เส้นเดียวร่วมกัน"
              onSelect={() =>
                setForm((current) => ({ ...current, scopeMode: "branch" }))
              }
            />
            <ChoiceCard
              active={form.scopeMode === "people"}
              icon={UserCheck}
              title="เฉพาะคนที่เลือก"
              description="เช่น เลขาฯ กับผู้จัดการ ให้ผู้บริหารอนุมัติ"
              onSelect={() =>
                setForm((current) => ({ ...current, scopeMode: "people" }))
              }
            />
          </div>

          {form.scopeMode === "branch" ? (
            <BranchPicker
              className="mt-3"
              branches={branches}
              selectedIds={form.branchIds}
              disabled={isBranchScoped}
              onChange={(next) =>
                setForm((current) => ({ ...current, branchIds: next }))
              }
            />
          ) : null}

          {form.scopeMode === "people" ? (
            <RequesterPicker
              className="mt-3"
              employees={employees}
              branches={branches}
              departments={departments}
              takenByOtherLine={takenByOtherLine}
              selectedIds={form.requesterEmployeeIds}
              onChange={(next) =>
                setForm((current) => ({
                  ...current,
                  requesterEmployeeIds: next,
                }))
              }
            />
          ) : null}
        </FormSection>

        <FormSection
          step="2"
          title="ใครเป็นคนอนุมัติ"
          hint="คนเดียวจบก็ใส่คนเดียวพอ — ใส่หลายลำดับ = คำขอต้องผ่านครบทุกคนตามลำดับ ไม่ใช่ให้เลือกอนุมัติคนใดคนหนึ่ง"
        >
          <div className="grid gap-2">
            {form.steps.map((step, index) => (
              <StepCard
                key={index}
                index={index}
                step={step}
                canRemove={form.steps.length > 1}
                branches={branches}
                positions={positions}
                employees={employees}
                onChange={(patch) => updateStep(index, patch)}
                onChangeApproverType={(approverType) =>
                  changeApproverType(index, approverType)
                }
                onRemove={() =>
                  setForm((current) => ({
                    ...current,
                    steps: current.steps.filter(
                      (_, stepIndex) => stepIndex !== index,
                    ),
                  }))
                }
              />
            ))}
          </div>

          {form.steps.length < maxSteps ? (
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  steps: [
                    ...current.steps,
                    createStep(stepPreset[current.steps.length] ?? "SUPERVISOR"),
                  ],
                }))
              }
              className={cn(
                buttonGhostClass,
                "mt-2 w-full border border-dashed border-slate-300",
              )}
            >
              <Plus className="h-4 w-4" />
              เพิ่มผู้อนุมัติลำดับถัดไป ({form.steps.length}/{maxSteps})
            </button>
          ) : null}
        </FormSection>

        {error ? (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* editor pieces                                                       */
/* ------------------------------------------------------------------ */

function FormSection({
  step,
  title,
  hint,
  children,
}: {
  step: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    /*
      คั่นแต่ละข้อด้วยเส้นบาง ไม่ใช่กล่องซ้อนกล่อง ตามโทนเดียวกับทั้งระบบ
      เลขข้อใช้วงกลม ไม่ใช้คำว่า "ขั้นที่" เพราะชนกับลำดับผู้อนุมัติที่อยู่ข้างใน
      (จอเดียวมี "ขั้นที่" สองความหมายแล้วอ่านไม่ออกว่าอันไหนคืออะไร)
    */
    <section className="border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
          {step}
        </span>
        <h3 className="text-[14px] font-bold text-slate-900 3xl:text-[15px]">
          {title}
        </h3>
      </div>
      {hint ? (
        <p className="mt-1 pl-7 text-[12px] leading-5 text-slate-500">{hint}</p>
      ) : null}
      <div className="mt-2.5 pl-7">{children}</div>
    </section>
  );
}

/**
 * ผู้อนุมัติหนึ่งลำดับ
 *
 * ช่อง "ถ้าคนอนุมัติเป็นคนยื่นเอง" เป็นกรณีขอบ ๆ ที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก
 * แต่เดิมกางอยู่ตลอดจนการ์ดสูงเป็นสองเท่าและกลบช่องหลัก จึงพับเก็บไว้
 * แล้วสรุปค่าปัจจุบันไว้บนปุ่มแทน
 */
function StepCard({
  index,
  step,
  canRemove,
  branches,
  positions,
  employees,
  onChange,
  onChangeApproverType,
  onRemove,
}: {
  index: number;
  step: StepFormState;
  canRemove: boolean;
  branches: OrganizationOption[];
  positions: PositionItem[];
  employees: EmployeeOption[];
  onChange: (patch: Partial<StepFormState>) => void;
  onChangeApproverType: (approverType: ApprovalStepApproverType) => void;
  onRemove: () => void;
}) {
  const [showFallback, setShowFallback] = useState(
    Boolean(step.fallbackApproverType),
  );

  const fallbackSummary = step.fallbackApproverType
    ? getApproverLabel(step.fallbackApproverType)
    : "ระบบหาให้เอง";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-700 3xl:text-[12.5px]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-600">
            {index + 1}
          </span>
          ผู้อนุมัติลำดับที่ {index + 1}
        </p>

        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="ลบลำดับนี้"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-white text-rose-600 transition hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="ให้ใครอนุมัติ" hint={getApproverHelper(step.approverType)}>
          <select
            value={step.approverType}
            onChange={(event) =>
              onChangeApproverType(event.target.value as ApprovalStepApproverType)
            }
            className={inputClass}
          >
            {approverTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        {step.approverType === "POSITION" ? (
          <Field label="ตำแหน่งไหน">
            <select
              value={step.positionId}
              onChange={(event) => onChange({ positionId: event.target.value })}
              className={inputClass}
            >
              <option value="">เลือกตำแหน่ง</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.nameTh || position.code}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {step.approverType === "EMPLOYEE" ? (
          <Field label="คนไหน">
            <select
              value={step.employeeId}
              onChange={(event) => onChange({ employeeId: event.target.value })}
              className={inputClass}
            >
              <option value="">เลือกพนักงาน</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeCode} - {getDisplayName(employee)}
                  {getEmployeeBranchName(employee, branches)
                    ? ` · ${getEmployeeBranchName(employee, branches)}`
                    : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {step.approverType === "ROLE" ? (
          <Field label="กลุ่มสิทธิ์" hint="พิมพ์รหัสกลุ่มสิทธิ์ เช่น HR_ADMIN">
            <input
              value={step.roleCode}
              onChange={(event) => onChange({ roleCode: event.target.value })}
              className={inputClass}
              placeholder="HR_ADMIN"
            />
          </Field>
        ) : null}
      </div>

      {/* กรณีขอบ: คนอนุมัติยื่นใบของตัวเอง — พับไว้ ไม่ให้กลบช่องหลัก */}
      <div className="mt-2.5 border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={() => setShowFallback((current) => !current)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-[12px] text-slate-500 3xl:text-[12.5px]">
            ถ้าคนอนุมัติเป็นคนยื่นเอง ให้
            <span className="font-semibold text-slate-700">
              {" "}
              {fallbackSummary}{" "}
            </span>
            อนุมัติแทน
          </span>
          <span className="shrink-0 text-[12px] font-bold text-brand-700">
            {showFallback ? "ซ่อน" : "เปลี่ยน"}
          </span>
        </button>

        {showFallback ? (
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            <Field label="ผู้อนุมัติแทน">
              <select
                value={step.fallbackApproverType}
                onChange={(event) =>
                  onChange({
                    fallbackApproverType: event.target.value as
                      | ApprovalStepApproverType
                      | "",
                    fallbackPositionId: "",
                    fallbackEmployeeId: "",
                    fallbackRoleCode: "",
                  })
                }
                className={inputClass}
              >
                <option value="">ให้ระบบหาให้เอง (HR แล้วผู้บริหาร)</option>
                {approverTypeOptions
                  .filter((option) => option.value !== "SUPERVISOR")
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </Field>

            {step.fallbackApproverType === "POSITION" ? (
              <Field label="ตำแหน่งของคนที่รับช่วงต่อ">
                <select
                  value={step.fallbackPositionId}
                  onChange={(event) =>
                    onChange({ fallbackPositionId: event.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">เลือกตำแหน่ง</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.nameTh || position.code}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {step.fallbackApproverType === "EMPLOYEE" ? (
              <Field label="คนที่รับช่วงต่อ">
                <select
                  value={step.fallbackEmployeeId}
                  onChange={(event) =>
                    onChange({ fallbackEmployeeId: event.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">เลือกพนักงาน</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employeeCode} - {getDisplayName(employee)}
                      {getEmployeeBranchName(employee, branches)
                        ? ` · ${getEmployeeBranchName(employee, branches)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {step.fallbackApproverType === "ROLE" ? (
              <Field label="กลุ่มสิทธิ์ของคนที่รับช่วงต่อ">
                <input
                  value={step.fallbackRoleCode}
                  onChange={(event) =>
                    onChange({ fallbackRoleCode: event.target.value })
                  }
                  className={inputClass}
                  placeholder="EXECUTIVE"
                />
              </Field>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  disabled,
  icon: Icon,
  title,
  description,
  onSelect,
}: {
  active: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-brand-600 bg-brand-50"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          active ? "text-brand-600" : "text-slate-400",
        )}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
          {description}
        </span>
      </span>
    </button>
  );
}

/**
 * เลือกสาขาแบบติ๊กได้หลายอัน
 * สาขาที่ใช้กติกาเดียวกันจะได้อยู่ในสายเดียว ไม่ต้องสร้างสายซ้ำทีละสาขา
 * แล้วมานั่งไล่แก้ให้ตรงกันทุกใบเวลาเปลี่ยนผู้อนุมัติ
 */
function BranchPicker({
  className,
  branches,
  selectedIds,
  disabled,
  onChange,
}: {
  className?: string;
  branches: OrganizationOption[];
  selectedIds: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const allSelected =
    branches.length > 0 && selectedIds.length === branches.length;

  function toggle(branchId: string) {
    onChange(
      selectedIds.includes(branchId)
        ? selectedIds.filter((id) => id !== branchId)
        : [...selectedIds, branchId],
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-slate-700 3xl:text-[12.5px]">
          เลือกไว้ {selectedIds.length} จาก {branches.length} สาขา
        </p>

        {!disabled && branches.length > 1 ? (
          <button
            type="button"
            onClick={() =>
              onChange(allSelected ? [] : branches.map((branch) => branch.id))
            }
            className="text-[11px] font-bold text-brand-700 hover:underline"
          >
            {allSelected ? "ล้างทั้งหมด" : "เลือกทุกสาขา"}
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {branches.length === 0 ? (
          <p className="py-2 text-xs font-semibold text-slate-400">
            บริษัทนี้ยังไม่มีสาขา
          </p>
        ) : (
          branches.map((branch) => {
            const active = selectedIds.includes(branch.id);

            return (
              <button
                key={branch.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(branch.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 3xl:text-[12.5px]",
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-white",
                )}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {getBranchName(branch)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function RequesterPicker({
  className,
  employees,
  branches,
  departments,
  takenByOtherLine,
  selectedIds,
  onChange,
}: {
  className?: string;
  employees: EmployeeOption[];
  branches: OrganizationOption[];
  departments: OrganizationOption[];
  takenByOtherLine: Map<string, number>;
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [showAllSelected, setShowAllSelected] = useState(false);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  /* เลือกสาขาแล้วเหลือเฉพาะแผนกของสาขานั้น (แผนกระดับบริษัทยังอยู่ครบ) */
  const departmentOptions = useMemo(
    () =>
      branchFilter
        ? departments.filter(
            (department) =>
              !department.branchId || department.branchId === branchFilter,
          )
        : departments,
    [branchFilter, departments],
  );

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();

    return employees.filter((employee) => {
      if (branchFilter && employee.branchId !== branchFilter) return false;
      if (departmentFilter && employee.departmentId !== departmentFilter) {
        return false;
      }

      if (!text) return true;

      return [
        employee.employeeCode,
        getDisplayName(employee),
        employee.position ?? "",
        getEmployeeBranchName(employee, branches),
        getEmployeeDepartmentName(employee, departments),
      ]
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [
    branchFilter,
    branches,
    departmentFilter,
    departments,
    employees,
    keyword,
  ]);

  /*
    จัดกลุ่มสาขา -> แผนก แบบเดียวกับทะเบียนพนักงานและตารางเวลาทำงาน
    รายชื่อยาว ๆ เรียงติดกันเฉย ๆ หาคนไม่เจอว่าใครอยู่สังกัดไหน
    กลุ่มที่ไม่มีสังกัดไปอยู่ท้ายสุดเสมอ จะได้ไม่ไปคั่นกลางกลุ่มที่มีข้อมูลครบ
  */
  const groupedRows = useMemo(() => {
    const branchOrder = new Map(
      branches.map((branch, index) => [branch.id, index] as const),
    );
    const byBranch = new Map<string, Map<string, EmployeeOption[]>>();

    for (const employee of filtered) {
      const branchKey = employee.branchId ?? "";
      const departmentKey = employee.departmentId ?? "";

      const byDepartment = byBranch.get(branchKey) ?? new Map();
      byDepartment.set(departmentKey, [
        ...(byDepartment.get(departmentKey) ?? []),
        employee,
      ]);
      byBranch.set(branchKey, byDepartment);
    }

    const sortKey = (key: string, order: Map<string, number>) =>
      key ? (order.get(key) ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER;

    const departmentOrder = new Map(
      departments.map((department, index) => [department.id, index] as const),
    );

    return [...byBranch.entries()]
      .sort(
        ([left], [right]) =>
          sortKey(left, branchOrder) - sortKey(right, branchOrder),
      )
      .map(([branchKey, byDepartment]) => {
        const branch = branches.find((item) => item.id === branchKey);
        const items = [...byDepartment.values()].flat();

        return {
          key: branchKey || "no-branch",
          title: branch ? getBranchName(branch) : "ไม่ระบุสาขา",
          code: branch?.code,
          count: items.length,
          departments: [...byDepartment.entries()]
            .sort(
              ([left], [right]) =>
                sortKey(left, departmentOrder) - sortKey(right, departmentOrder),
            )
            .map(([departmentKey, employeesInGroup]) => {
              const department = departments.find(
                (item) => item.id === departmentKey,
              );

              return {
                key: `${branchKey}-${departmentKey || "no-department"}`,
                title: department
                  ? department.nameTh || department.code
                  : "ไม่ระบุแผนก",
                code: department?.code,
                employees: employeesInGroup,
              };
            }),
        };
      });
  }, [branches, departments, filtered]);

  function toggle(employeeId: string) {
    if (takenByOtherLine.has(employeeId)) return;

    onChange(
      selectedIds.includes(employeeId)
        ? selectedIds.filter((id) => id !== employeeId)
        : [...selectedIds, employeeId],
    );
  }

  /*
    ติ๊กทั้งสาขา/ทั้งแผนกในคลิกเดียว — คนที่ถูกเส้นอื่นจองไว้ไม่นับ เพราะติ๊กให้ก็ไม่ติด
    ถ้าทุกคนในกลุ่มถูกเลือกอยู่แล้ว การติ๊กซ้ำคือเอาออกทั้งกลุ่ม
    ทำงานกับ "รายชื่อที่กรองแล้ว" — พิมพ์ค้นหาแล้วติ๊กสาขา จะได้เฉพาะคนที่เห็นอยู่ ไม่ใช่ทั้งสาขาจริง
  */
  function selectableIds(group: EmployeeOption[]) {
    return group
      .filter((employee) => !takenByOtherLine.has(employee.id))
      .map((employee) => employee.id);
  }

  function groupState(group: EmployeeOption[]) {
    const ids = selectableIds(group);
    const picked = ids.filter((id) => selected.has(id)).length;
    return {
      ids,
      all: ids.length > 0 && picked === ids.length,
      some: picked > 0 && picked < ids.length,
    };
  }

  function toggleGroup(group: EmployeeOption[]) {
    const { ids, all } = groupState(group);
    if (ids.length === 0) return;

    onChange(
      all
        ? selectedIds.filter((id) => !ids.includes(id))
        : [...selectedIds, ...ids.filter((id) => !selected.has(id))],
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      {/*
        ไม่ครอบกล่องเทาซ้อนในป๊อปอัพอีกชั้น — ใช้เส้นคั่นกับระยะห่างพอ
        กล่องซ้อนกล่องทำให้พื้นที่รายชื่อเหลือนิดเดียวและอ่านยากกว่าเดิม

        คำถามที่เจอทุกครั้ง — "ทำไมขึ้นทุกคน ทั้งที่เส้นแรกเลือกพนักงานทุกคนไปแล้ว"
        เพราะเส้นนี้คือการดึงคนออกมาจากเส้นแรก รายชื่อจึงต้องมีครบทุกคนให้เลือก
      */}
      <p className="text-[12px] leading-5 text-slate-500 3xl:text-[12.5px]">
        ทุกคนอยู่ในเส้น &ldquo;พนักงานทุกคน&rdquo; อยู่แล้ว —
        ติ๊กเฉพาะคนที่จะ
        <span className="font-semibold text-slate-700">ดึงออกมา</span>
        เดินเส้นนี้แทน คนที่ไม่ได้ติ๊กยังเดินเส้นเดิม
      </p>

      {/* ตัวกรองกับช่องค้นหาอยู่แถวเดียวกัน ไม่ต้องซ้อนสามชั้นจนรายชื่อเหลือที่นิดเดียว */}
      <div className="mt-2.5 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <select
          value={branchFilter}
          onChange={(event) => {
            setBranchFilter(event.target.value);
            setDepartmentFilter("");
          }}
          aria-label="กรองตามสาขา"
          className={inputClass}
        >
          <option value="">ทุกสาขา</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {getBranchName(branch)}
            </option>
          ))}
        </select>

        <select
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
          aria-label="กรองตามแผนก"
          className={inputClass}
        >
          <option value="">ทุกแผนก</option>
          {departmentOptions.map((department) => (
            <option key={department.id} value={department.id}>
              {department.nameTh || department.code}
            </option>
          ))}
        </select>

        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className={inputClass}
          placeholder="ค้นหารหัส ชื่อ ตำแหน่ง สาขา หรือแผนก"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-slate-700 3xl:text-[12.5px]">
          เลือกไว้ {selectedIds.length} คน
          <span className="ml-1.5 font-medium text-slate-400">
            · แสดง {filtered.length} จาก {employees.length} คน
          </span>
        </p>

        {selectedIds.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11.5px] font-bold text-rose-600 hover:underline"
          >
            ล้างรายชื่อ
          </button>
        ) : null}
      </div>

      {/* รายชื่อที่เลือกไว้ ยกมาไว้บนสุด จะได้ไม่ต้องเลื่อนหาในรายการยาว ๆ */}
      {/*
        ป้ายใช้รหัสสาขาแทนชื่อเต็ม และพับเมื่อเกิน 12 คน — ตอนติ๊กทั้งสาขาทีเดียว 30 คน
        ป้ายชื่อเต็มจะกินทั้งจอจนรายชื่อด้านล่างตกขอบ ต้องเลื่อนหาอีก
      */}
      {selectedIds.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(showAllSelected ? selectedIds : selectedIds.slice(0, 12)).map(
            (employeeId) => {
              const employee = employees.find((item) => item.id === employeeId);
              const branch = employee
                ? branches.find((item) => item.id === employee.branchId)
                : undefined;

              return (
                <button
                  key={employeeId}
                  type="button"
                  onClick={() => toggle(employeeId)}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-600 py-0.5 pl-2 pr-1.5 text-[11px] font-bold text-white transition hover:bg-brand-700"
                >
                  {employee ? getDisplayName(employee) : employeeId}
                  {branch?.code ? (
                    <span className="font-medium text-brand-100">· {branch.code}</span>
                  ) : null}
                  <X className="h-3 w-3" />
                </button>
              );
            },
          )}
          {selectedIds.length > 12 ? (
            <button
              type="button"
              onClick={() => setShowAllSelected((value) => !value)}
              className="inline-flex items-center rounded-full border border-brand-300 px-2 py-0.5 text-[11px] font-bold text-brand-700 hover:bg-brand-50"
            >
              {showAllSelected
                ? "ย่อรายชื่อ"
                : `และอีก ${selectedIds.length - 12} คน`}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* กล่องสูงตามจอ — เดิม 256px เห็นแค่ 4-5 คน ต้องเลื่อนตลอด */}
      <div className="mt-2 max-h-[62vh] min-h-[22rem] overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs font-semibold text-slate-400">
            ไม่พบพนักงานที่ตรงกับเงื่อนไข
          </p>
        ) : (
          groupedRows.map((branchGroup) => (
            <div key={branchGroup.key}>
              {/* ชั้นนอก = สาขา แถบฟ้าทึบเต็มความกว้าง เหมือนหัวกลุ่มในตารางของระบบ */}
              <label className="flex cursor-pointer items-center gap-2.5 border-y border-brand-200 bg-brand-100/80 px-3 py-2 hover:bg-brand-100">
                <GroupCheckbox
                  title="เลือกทั้งสาขา"
                  state={groupState(
                    branchGroup.departments.flatMap((group) => group.employees),
                  )}
                  onToggle={() =>
                    toggleGroup(
                      branchGroup.departments.flatMap((group) => group.employees),
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <AttendanceGroupHeading
                    level="branch"
                    title={branchGroup.title}
                    code={branchGroup.code}
                    employeeCount={branchGroup.count}
                  />
                </span>
              </label>

              {branchGroup.departments.map((departmentGroup) => (
                <div key={departmentGroup.key}>
                  {/* ชั้นใน = แผนก พื้นขาวเยื้องเข้ามา */}
                  <label className="flex cursor-pointer items-center gap-2.5 border-b border-brand-100 bg-white py-1.5 pl-6 pr-3 hover:bg-brand-50/60">
                    <GroupCheckbox
                      title="เลือกทั้งแผนก"
                      state={groupState(departmentGroup.employees)}
                      onToggle={() => toggleGroup(departmentGroup.employees)}
                    />
                    <span className="min-w-0 flex-1">
                      <AttendanceGroupHeading
                        level="department"
                        title={departmentGroup.title}
                        code={departmentGroup.code}
                        employeeCount={departmentGroup.employees.length}
                      />
                    </span>
                  </label>

                  {departmentGroup.employees.map((employee) => {
                    const takenLine = takenByOtherLine.get(employee.id);

                    return (
                      <label
                        key={employee.id}
                        className={cn(
                          "flex items-center gap-2.5 border-b border-slate-100 py-2 pl-12 pr-3 transition last:border-b-0",
                          takenLine
                            ? "cursor-not-allowed bg-slate-50/80"
                            : "cursor-pointer hover:bg-brand-50/60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(employee.id)}
                          disabled={Boolean(takenLine)}
                          onChange={() => toggle(employee.id)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 disabled:opacity-40"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-[13px] font-semibold",
                              takenLine ? "text-slate-400" : "text-slate-800",
                            )}
                          >
                            {getDisplayName(employee)}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {[employee.employeeCode, employee.position]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>

                        {/* คนหนึ่งเดินได้เส้นเดียว ถ้าถูกเส้นอื่นจองไว้ต้องไปเอาออกจากเส้นนั้นก่อน */}
                        {takenLine ? (
                          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10.5px] font-bold text-slate-500">
                            อยู่เส้นที่ {takenLine} แล้ว
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** ช่องติ๊กของหัวกลุ่ม — ขีดกลางเมื่อเลือกไว้บางคน */
function GroupCheckbox({
  title,
  state,
  onToggle,
}: {
  title: string;
  state: { ids: string[]; all: boolean; some: boolean };
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state.some;
  }, [state.some]);

  return (
    <input
      ref={ref}
      type="checkbox"
      title={title}
      aria-label={title}
      checked={state.all}
      disabled={state.ids.length === 0}
      onChange={onToggle}
      className="h-4 w-4 shrink-0 rounded border-brand-300 text-brand-600 disabled:opacity-40"
    />
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-slate-600 3xl:text-[14px]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs leading-5 text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
