"use client";

import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  Building2,
  Check,
  Clock4,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Power,
  RefreshCcw,
  Search,
  Settings2,
  Timer,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  compareEmployeeSeniority,
  UNRANKED_POSITION_LEVEL,
} from "@/lib/employee-seniority";
import {
  attendanceBranchGroupKey,
  attendanceBranchSortText,
  attendanceDepartmentGroupKey,
  attendanceDepartmentSortText,
  buildAttendanceDepartmentGroupRank,
} from "@/lib/attendance-session-group";

import {
  apiFetch,
  assignEmployeesToShift,
  updateAttendanceExemptions,
  createAttendancePolicy,
  createAttendanceSessionRule,
  deleteAttendancePolicy,
  deleteAttendanceSessionRule,
  getAttendancePolicies,
  getAttendanceSessionRules,
  getEmployeeShiftAssignments,
  removeEmployeesFromShift,
  updateAttendancePolicy,
  updateAttendanceSessionRule,
} from "@/lib/api";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  Badge,
  Button,
  Modal as KitModal,
  Notice,
  Select,
  Toolbar,
} from "@/components/kit";
import {
  ModalField,
  ModalSection,
  ModalToggle,
  PolicyModal,
  modalInputClass,
} from "@/components/settings/work-policies/policy-modal";
import type { WorkPolicyScope } from "@/components/settings/work-policies/work-policy-types";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import type {
  AttendancePolicy,
  AttendancePolicyForm,
  AttendancePolicyUpdateForm,
  AttendanceSessionCode,
  AttendanceSessionRule,
  AttendanceSessionRuleForm,
  AttendanceSessionType,
  EmployeeShiftRow,
  MasterStatus,
  MissingPenaltyMode,
} from "@/types/attendance";

/* ------------------------------------------------------------------ */
/* types & constants                                                   */
/* ------------------------------------------------------------------ */

type CompanyOption = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  status?: string | null;
};

type CompanyListResponse = {
  items?: CompanyOption[];
  data?: CompanyOption[];
};

/** เวลาเข้า–ออกของกะแบบย่อ ใช้โชว์ใต้ชื่อกะในรายการ */
/** ช่วงเวลาเข้า–ออกของกะ (ส่วนที่อยากให้เด่น) */
function shiftTimeRange(policy: AttendancePolicy) {
  const summary = shiftTimeSummary(policy);
  const [range] = summary.split(" · ");
  return range;
}

/** ส่วนที่เหลือของคำอธิบายกะ เช่น จำนวนรอบ */
function shiftTimeDetail(policy: AttendancePolicy) {
  const summary = shiftTimeSummary(policy);
  const rest = summary.split(" · ").slice(1);
  return rest.length ? ` · ${rest.join(" · ")}` : "";
}

function shiftTimeSummary(policy: AttendancePolicy) {
  const rules = (policy.sessionRules ?? []).filter(
    (rule) => rule.status === "ACTIVE" && rule.deletedAt == null,
  );

  if (rules.length === 0) return "ยังไม่ได้ตั้งรอบลงเวลา";

  const first = [...rules].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const last = rules.find((rule) => rule.punchType === "CHECK_OUT");
  const optional = rules.filter((rule) => !rule.requirePunch).length;

  const time =
    last && last.id !== first.id
      ? `${first.expectedTime}–${last.expectedTime}`
      : first.expectedTime;

  // บอกตั้งแต่หน้ารายการว่ากะนี้ไม่ได้บังคับกดครบทุกรอบ จะได้ไม่ต้องเปิดเข้าไปดู
  return optional === rules.length
    ? `${time} · ${rules.length} รอบ · ไม่ต้องลงเวลา`
    : optional > 0
      ? `${time} · ${rules.length} รอบ · ไม่บังคับ ${optional} รอบ`
      : `${time} · ${rules.length} รอบ`;
}

/** รหัสกะต้องไม่ซ้ำในบริษัทเดียวกัน — อยู่นอกคอมโพเนนต์เพราะเรียก Date.now() */
function buildScopeCode(
  branchId: string | null,
  employeeTypeId: string | null,
) {
  const branchPart = branchId ? branchId.slice(-6).toUpperCase() : "ALL";
  const employeePart = employeeTypeId
    ? employeeTypeId.slice(-6).toUpperCase()
    : "ALL";
  return `ATT_${branchPart}_${employeePart}_${Date.now().toString().slice(-5)}`;
}

/* เวลาในระบบเก็บเป็น "HH:mm" 24 ชม. เสมอ
   ไม่ใช้ <input type="time"> เพราะ Chrome บังคับรูปแบบตาม locale ของเครื่อง
   (ตั้ง lang ก็ไม่มีผล) คนไทยจึงเห็นเป็น AM/PM ทั้งที่ค่าที่เก็บเป็น 24 ชม. */

/** ใส่ ":" ให้อัตโนมัติระหว่างพิมพ์ และกันไม่ให้ชั่วโมงเกิน 23 ตั้งแต่ตอนพิมพ์ */
function maskTime(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;

  const hour = Math.min(Number(digits.slice(0, 2)), 23);
  return `${String(hour).padStart(2, "0")}:${digits.slice(2)}`;
}

/**
 * จัดให้เป็น HH:mm ตอนออกจากช่อง
 * อ่านตาม ":" ที่เห็นบนจอ ค่าที่ได้จึงตรงกับที่ผู้ใช้พิมพ์ ไม่กระโดด
 * เช่น "8" -> 08:00, "17:3" -> 17:03, "0830" -> 08:30
 */
function normalizeTime(input: string) {
  const [rawHour, rawMinute = ""] = input.trim().split(":");
  const hourDigits = rawHour.replace(/\D/g, "");
  if (!hourDigits) return "";

  const hour = Math.min(Number(hourDigits), 23);
  const minute = Math.min(Number(rawMinute.replace(/\D/g, "") || "0"), 59);

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export type BranchOption = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

type PolicyFormState = {
  id?: string;
  companyId: string;
  branchId: string;
  employeeTypeId: string;
  code: string;
  name: string;
  description: string;
  morningCheckInDeadline: string;
  afternoonCheckInDeadline: string;
  checkoutAllowedFrom: string;
  latePenaltyRatePerMinute: string;
  missingLogPenaltyPerDay: string;
  priority: string;
  lateGraceMinutes: string;
  lateRoundingMinutes: string;
  maxLatePenaltyPerDay: string;
  maxMissingPenaltyPerDay: string;
  missingPenaltyMode: MissingPenaltyMode;
  offsiteEnabled: boolean;
  requireOffsiteApproval: boolean;
  timezone: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: MasterStatus;
};

type RuleFormState = {
  id?: string;
  sessionCode: AttendanceSessionCode;
  label: string;
  punchType: AttendanceSessionType;
  openTime: string;
  expectedTime: string;
  closeTime: string;
  lateAfterTime: string;
  lateUntilTime: string;
  earlyBeforeTime: string;
  lateOutAfterTime: string;
  requirePunch: boolean;
  allowEarlyPunch: boolean;
  earlyPunchGraceMinutes: string;
  lateGraceMinutes: string;
  latePenaltyPerMinute: string;
  missingPenaltyAmount: string;
  earlyLeavePenaltyPerMinute: string;
  collectLateOutMinutes: boolean;
  autoCreateOt: boolean;
  sortOrder: string;
  status: MasterStatus;
};

const TODAY = new Date().toISOString().slice(0, 10);

const defaultPolicyForm: PolicyFormState = {
  companyId: "",
  branchId: "",
  employeeTypeId: "",
  code: "STD_ATTENDANCE_POLICY",
  name: "นโยบายเวลาเข้าออกงานมาตรฐาน",
  description: "",
  morningCheckInDeadline: "08:00",
  afternoonCheckInDeadline: "13:00",
  checkoutAllowedFrom: "17:00",
  latePenaltyRatePerMinute: "5",
  missingLogPenaltyPerDay: "50",
  priority: "100",
  lateGraceMinutes: "0",
  lateRoundingMinutes: "0",
  maxLatePenaltyPerDay: "",
  maxMissingPenaltyPerDay: "",
  missingPenaltyMode: "PER_SESSION",
  offsiteEnabled: false,
  requireOffsiteApproval: true,
  timezone: "Asia/Bangkok",
  effectiveFrom: TODAY,
  effectiveTo: "",
  status: "ACTIVE",
};

const defaultRuleForm: RuleFormState = {
  sessionCode: "MORNING_IN",
  label: "ลงเวลาเข้า รอบที่ 1",
  punchType: "CHECK_IN",
  openTime: "06:00",
  expectedTime: "08:00",
  closeTime: "11:59",
  lateAfterTime: "08:00",
  lateUntilTime: "11:59",
  earlyBeforeTime: "",
  lateOutAfterTime: "",
  requirePunch: true,
  allowEarlyPunch: false,
  earlyPunchGraceMinutes: "0",
  lateGraceMinutes: "0",
  latePenaltyPerMinute: "5",
  missingPenaltyAmount: "50",
  earlyLeavePenaltyPerMinute: "0",
  collectLateOutMinutes: false,
  autoCreateOt: false,
  sortOrder: "1",
  status: "ACTIVE",
};

/**
 * รอบลงเวลามาตรฐานของกะหนึ่ง
 *
 * ต้องสร้างจากค่าที่ผู้ใช้กรอกในฟอร์มกะ ไม่ใช่ค่าตายตัว
 * เคสที่เคยพัง: ตั้งกะสำนักงานเข้า 08:30 ออก 17:30 แต่รอบที่ระบบสร้างให้
 * ยังเป็น 08:00/17:00 พนักงานจึงถูกตัดว่ามาสายตั้งแต่ 08:00 และหักเงินผิด
 * ตั้งแต่วันแรกโดยไม่มีใครรู้ เพราะหน้าจอแสดงเวลาของกะถูกต้อง
 */
function buildDefaultRuleTemplates(policy: PolicyFormState): RuleFormState[] {
  const morning = normalizeTime(policy.morningCheckInDeadline) || "08:00";
  const afternoon = normalizeTime(policy.afternoonCheckInDeadline) || "13:00";
  const checkout = normalizeTime(policy.checkoutAllowedFrom) || "17:00";
  const grace = policy.lateGraceMinutes || "0";
  const latePenalty = policy.latePenaltyRatePerMinute || "0";
  const missingPenalty = policy.missingLogPenaltyPerDay || "0";

  return [
    {
      ...defaultRuleForm,
      sessionCode: "MORNING_IN",
      label: "ลงเวลาเข้า รอบที่ 1",
      punchType: "CHECK_IN",
      openTime: "06:00",
      expectedTime: morning,
      closeTime: "11:59",
      lateAfterTime: morning,
      lateUntilTime: "11:59",
      lateGraceMinutes: grace,
      latePenaltyPerMinute: latePenalty,
      missingPenaltyAmount: missingPenalty,
      sortOrder: "1",
    },
    {
      ...defaultRuleForm,
      sessionCode: "AFTERNOON_IN",
      label: "ลงเวลาเข้า รอบที่ 2",
      punchType: "CHECK_IN",
      openTime: "12:00",
      expectedTime: afternoon,
      closeTime: "16:59",
      lateAfterTime: afternoon,
      lateUntilTime: "16:59",
      lateGraceMinutes: grace,
      latePenaltyPerMinute: latePenalty,
      missingPenaltyAmount: missingPenalty,
      sortOrder: "2",
    },
    {
      ...defaultRuleForm,
      sessionCode: "CHECK_OUT",
      label: "ออกงาน",
      punchType: "CHECK_OUT",
      openTime: "00:00",
      expectedTime: checkout,
      closeTime: "23:59",
      lateAfterTime: "",
      lateUntilTime: "",
      earlyBeforeTime: checkout,
      lateOutAfterTime: checkout,
      allowEarlyPunch: true,
      // ออกงานไม่มีแนวคิด "มาสาย" ค่าปรับจึงคิดจากการออกก่อนเวลาเท่านั้น
      lateGraceMinutes: "0",
      latePenaltyPerMinute: "0",
      earlyLeavePenaltyPerMinute: latePenalty,
      missingPenaltyAmount: missingPenalty,
      collectLateOutMinutes: true,
      autoCreateOt: false,
      sortOrder: "3",
    },
  ];
}

/** ลำดับรอบที่กะหนึ่งต้องมีครบ ใช้ตรวจว่ามีรอบไหนขาดไป */
const DEFAULT_RULE_CODES: AttendanceSessionCode[] = [
  "MORNING_IN",
  "AFTERNOON_IN",
  "CHECK_OUT",
];

const sessionLabels: Record<AttendanceSessionCode, string> = {
  MORNING_IN: "เข้างาน รอบ 1",
  AFTERNOON_IN: "เข้างาน รอบ 2",
  CHECK_OUT: "ออกงาน",
  OFFSITE_IN: "Offsite เข้า",
  OFFSITE_OUT: "Offsite ออก",
  CUSTOM: "กำหนดเอง",
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeCompanies(payload: CompanyOption[] | CompanyListResponse) {
  if (Array.isArray(payload)) return payload;
  return payload.items ?? payload.data ?? [];
}

function formatMoney(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "ไม่กำหนด";
  return new Date(value).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableString(value: string) {
  return value.trim() ? value.trim() : null;
}

function branchLabel(branches: BranchOption[], id: string | null | undefined) {
  if (!id) return "ทั้งบริษัท (ทุกสาขา)";
  const branch = branches.find((item) => item.id === id);
  return branch?.nameTh || branch?.nameEn || branch?.code || "สาขาที่เลือก";
}

function toPolicyForm(policy: AttendancePolicy): PolicyFormState {
  return {
    id: policy.id,
    companyId: policy.companyId,
    branchId: policy.branchId ?? "",
    employeeTypeId: policy.employeeTypeId ?? "",
    code: policy.code,
    name: policy.name,
    description: policy.description ?? "",
    morningCheckInDeadline: policy.morningCheckInDeadline ?? "08:00",
    afternoonCheckInDeadline: policy.afternoonCheckInDeadline ?? "13:00",
    checkoutAllowedFrom: policy.checkoutAllowedFrom ?? "17:00",
    latePenaltyRatePerMinute: String(policy.latePenaltyRatePerMinute ?? 0),
    missingLogPenaltyPerDay: String(policy.missingLogPenaltyPerDay ?? 0),
    priority: String(policy.priority ?? 100),
    lateGraceMinutes: String(policy.lateGraceMinutes ?? 0),
    lateRoundingMinutes: String(policy.lateRoundingMinutes ?? 0),
    maxLatePenaltyPerDay:
      policy.maxLatePenaltyPerDay == null
        ? ""
        : String(policy.maxLatePenaltyPerDay),
    maxMissingPenaltyPerDay:
      policy.maxMissingPenaltyPerDay == null
        ? ""
        : String(policy.maxMissingPenaltyPerDay),
    missingPenaltyMode: policy.missingPenaltyMode ?? "PER_SESSION",
    offsiteEnabled: Boolean(policy.offsiteEnabled),
    requireOffsiteApproval: policy.requireOffsiteApproval ?? true,
    timezone: policy.timezone ?? "Asia/Bangkok",
    effectiveFrom: policy.effectiveFrom?.slice(0, 10) ?? TODAY,
    effectiveTo: policy.effectiveTo?.slice(0, 10) ?? "",
    status: policy.status,
  };
}

function toRuleForm(rule: AttendanceSessionRule): RuleFormState {
  return {
    id: rule.id,
    sessionCode: rule.sessionCode,
    label: rule.label,
    punchType: rule.punchType,
    openTime: rule.openTime,
    expectedTime: rule.expectedTime,
    closeTime: rule.closeTime,
    lateAfterTime: rule.lateAfterTime ?? "",
    lateUntilTime: rule.lateUntilTime ?? "",
    earlyBeforeTime: rule.earlyBeforeTime ?? "",
    lateOutAfterTime: rule.lateOutAfterTime ?? "",
    requirePunch: rule.requirePunch,
    allowEarlyPunch: rule.allowEarlyPunch,
    earlyPunchGraceMinutes: String(rule.earlyPunchGraceMinutes ?? 0),
    lateGraceMinutes: String(rule.lateGraceMinutes ?? 0),
    latePenaltyPerMinute: String(rule.latePenaltyPerMinute ?? 0),
    missingPenaltyAmount: String(rule.missingPenaltyAmount ?? 0),
    earlyLeavePenaltyPerMinute: String(rule.earlyLeavePenaltyPerMinute ?? 0),
    collectLateOutMinutes: rule.collectLateOutMinutes,
    autoCreateOt: rule.autoCreateOt,
    sortOrder: String(rule.sortOrder ?? 0),
    status: rule.status,
  };
}

function buildPolicyPayload(form: PolicyFormState): AttendancePolicyForm {
  return {
    companyId: form.companyId,
    branchId: nullableString(form.branchId),
    employeeTypeId: nullableString(form.employeeTypeId),
    code: form.code.trim(),
    name: form.name.trim(),
    description: nullableString(form.description),
    morningCheckInDeadline: normalizeTime(form.morningCheckInDeadline),
    afternoonCheckInDeadline: normalizeTime(form.afternoonCheckInDeadline),
    checkoutAllowedFrom: normalizeTime(form.checkoutAllowedFrom),
    latePenaltyRatePerMinute: parseNumber(form.latePenaltyRatePerMinute),
    missingLogPenaltyPerDay: parseNumber(form.missingLogPenaltyPerDay),
    priority: parseNumber(form.priority, 100),
    lateGraceMinutes: parseNumber(form.lateGraceMinutes),
    lateRoundingMinutes: parseNumber(form.lateRoundingMinutes),
    maxLatePenaltyPerDay: nullableString(form.maxLatePenaltyPerDay)
      ? parseNumber(form.maxLatePenaltyPerDay)
      : null,
    maxMissingPenaltyPerDay: nullableString(form.maxMissingPenaltyPerDay)
      ? parseNumber(form.maxMissingPenaltyPerDay)
      : null,
    missingPenaltyMode: form.missingPenaltyMode,
    offsiteEnabled: form.offsiteEnabled,
    requireOffsiteApproval: form.requireOffsiteApproval,
    timezone: form.timezone,
    effectiveFrom: form.effectiveFrom,
    effectiveTo: nullableString(form.effectiveTo),
    status: form.status,
  };
}

function buildRulePayload(form: RuleFormState): AttendanceSessionRuleForm {
  return {
    sessionCode: form.sessionCode,
    label: form.label.trim(),
    punchType: form.punchType,
    openTime: normalizeTime(form.openTime),
    expectedTime: normalizeTime(form.expectedTime),
    closeTime: normalizeTime(form.closeTime),
    lateAfterTime: nullableString(normalizeTime(form.lateAfterTime)),
    lateUntilTime: nullableString(form.lateUntilTime),
    earlyBeforeTime: nullableString(normalizeTime(form.earlyBeforeTime)),
    lateOutAfterTime: nullableString(form.lateOutAfterTime),
    requirePunch: form.requirePunch,
    allowEarlyPunch: form.allowEarlyPunch,
    earlyPunchGraceMinutes: parseNumber(form.earlyPunchGraceMinutes),
    lateGraceMinutes: parseNumber(form.lateGraceMinutes),
    latePenaltyPerMinute: parseNumber(form.latePenaltyPerMinute),
    missingPenaltyAmount: parseNumber(form.missingPenaltyAmount),
    earlyLeavePenaltyPerMinute: parseNumber(form.earlyLeavePenaltyPerMinute),
    collectLateOutMinutes: form.collectLateOutMinutes,
    autoCreateOt: form.autoCreateOt,
    sortOrder: parseNumber(form.sortOrder),
    status: form.status,
  };
}

/* ------------------------------------------------------------------ */
/* panel                                                               */
/* ------------------------------------------------------------------ */

/** จำนวนรายชื่อต่อหน้าในป๊อปอัพผูกกะ */
const ASSIGN_PAGE_SIZE = 20;

export function AttendancePolicyPanel({
  scope,
  branches,
  canManagePolicy,
  canManageRules,
  scopeLevel = "GLOBAL",
  ownBranchId = null,
}: {
  scope: WorkPolicyScope;
  branches: BranchOption[];
  canManagePolicy: boolean;
  canManageRules: boolean;
  /** ระดับสิทธิ์ของผู้ใช้ — ระดับสาขาแก้ได้เฉพาะกะของสาขาตัวเอง */
  scopeLevel?: "GLOBAL" | "COMPANY" | "BRANCH";
  ownBranchId?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleLoading, setRuleLoading] = useState(false);
  /** ทุกนโยบายของบริษัท ใช้สร้างภาพรวมความครอบคลุมรายสาขา */
  const [allPolicies, setAllPolicies] = useState<AttendancePolicy[]>([]);
  /** พนักงานทั้งบริษัท พร้อมกะที่ถูกผูกไว้ (ถ้ามี) */
  const [employeeRows, setEmployeeRows] = useState<EmployeeShiftRow[]>([]);
  const [assignSummary, setAssignSummary] = useState({
    total: 0,
    assigned: 0,
    unassigned: 0,
  });
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  /*
   * เก็บหน้าคู่กับเงื่อนไขที่ใช้อยู่ พอเปลี่ยนคำค้นหรือกะ หน้าก็กลับไปหน้าแรกเอง
   * โดยไม่ต้องมี effect คอยรีเซ็ต
   */
  const [assignPage, setAssignPage] = useState({ key: "", page: 1 });
  const [pickedEmployeeIds, setPickedEmployeeIds] = useState<string[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  /** null = อ่านจากข้อมูลจริง / ตั้งค่าเมื่อผู้ใช้กดปุ่มเลือกโหมดเอง */
  const [modeOverride, setModeOverride] = useState<"COMPANY" | "BRANCH" | null>(
    null,
  );
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedPolicyIdRaw, setSelectedPolicyId] = useState("");
  const [rules, setRules] = useState<AttendanceSessionRule[]>([]);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [policyForm, setPolicyForm] =
    useState<PolicyFormState>(defaultPolicyForm);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(defaultRuleForm);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);

  /** กะทั้งหมดของบริษัท พร้อมจำนวนคนที่ผูกไว้ */
  const shifts = useMemo(() => {
    const activeShifts = allPolicies.filter(
      (policy) => policy.status === "ACTIVE",
    );
    const countByPolicyId = new Map<string, number>();

    for (const row of employeeRows) {
      if (!row.assignment) continue;
      countByPolicyId.set(
        row.assignment.policyId,
        (countByPolicyId.get(row.assignment.policyId) ?? 0) + 1,
      );
    }

    /**
     * 1 ขอบเขตมีกะเริ่มต้นได้ใบเดียว — ต้องเรียงแบบเดียวกับ findEffectivePolicyForScope
     * ฝั่ง backend (priority มาก่อน แล้วค่อยวันที่เริ่มใช้ล่าสุด)
     */
    const defaultIdByScope = new Map<string, string>();
    for (const policy of [...activeShifts].sort((a, b) => {
      const priority = Number(b.priority ?? 100) - Number(a.priority ?? 100);
      if (priority !== 0) return priority;
      return (
        new Date(b.effectiveFrom).getTime() -
        new Date(a.effectiveFrom).getTime()
      );
    })) {
      const key = policy.branchId ?? "COMPANY";
      if (!defaultIdByScope.has(key)) defaultIdByScope.set(key, policy.id);
    }

    return activeShifts.map((policy) => {
      const scopeKey = policy.branchId ?? "COMPANY";
      const isScopeDefault = defaultIdByScope.get(scopeKey) === policy.id;

      return {
        policy,
        assignedCount: countByPolicyId.get(policy.id) ?? 0,
        scopeName: policy.branchId
          ? branchLabel(branches, policy.branchId)
          : "ทั้งบริษัท",
        /** true = คนในขอบเขตนี้ที่ไม่ถูกผูกกะ จะตกมาใช้ใบนี้ */
        isScopeDefault,
        /** true = คนในกลุ่มนี้ที่ยังไม่ถูกเลือกใส่กะ จะใช้ใบนี้ */
        isGroupDefault: isScopeDefault,
      };
    });
  }, [allPolicies, branches, employeeRows]);

  /** true = บัญชีระดับสาขา แก้ได้เฉพาะกะของสาขาตัวเอง */
  const isBranchScoped = scopeLevel === "BRANCH";

  /** กะของสาขาที่ถูกพักไว้ตอนสลับไปโหมด "ใช้ทั้งบริษัท" — เก็บไว้ ไม่ได้ลบ */
  const pausedBranchShifts = useMemo(
    () =>
      allPolicies.filter(
        (policy) =>
          policy.branchId && policy.status !== "ACTIVE" && !policy.deletedAt,
      ),
    [allPolicies],
  );

  /**
   * โหมดอ่านจากสถานะจริงของข้อมูล ไม่ได้เก็บ flag แยก
   * มีกะสาขาที่เปิดใช้อยู่ = ระบบกำลังแยกตามสาขา
   */
  const branchShiftCount = shifts.filter((item) => item.policy.branchId).length;
  // ผู้ใช้ระดับสาขาไม่มีสิทธิ์เลือกโหมด เพราะโหมดมีผลข้ามสาขา จึงล็อกเป็นแยกสาขาเสมอ
  const mode: "COMPANY" | "BRANCH" = isBranchScoped
    ? "BRANCH"
    : (modeOverride ?? (branchShiftCount > 0 ? "BRANCH" : "COMPANY"));

  /**
   * สลับโหมดจริง ไม่ใช่แค่ซ่อน
   * ใช้ทั้งบริษัท = พักกะของสาขาทั้งหมด (ปิดใช้งาน ไม่ลบ)
   * แยกตามสาขา  = เปิดกะของสาขากลับมา
   */
  function applyMode(next: "COMPANY" | "BRANCH") {
    if (next === mode && next === "BRANCH") return;

    if (next === "COMPANY") {
      const active = shifts.filter((item) => item.policy.branchId);
      if (active.length === 0) {
        setModeOverride("COMPANY");
        return;
      }

      setDialog({
        title: "ให้ทุกสาขาใช้กะของบริษัท",
        description: `กะเฉพาะสาขา ${active.length} ใบจะถูกพักไว้ (ไม่ถูกลบ) ทุกสาขาจะกลับไปใช้กะของบริษัท กดสลับกลับได้ทุกเมื่อ`,
        confirmLabel: "ใช้กะของบริษัททั้งหมด",
        tone: "orange",
        onConfirm: async () => {
          await Promise.all(
            active.map((item) =>
              updateAttendancePolicy(item.policy.id, { status: "INACTIVE" }),
            ),
          );
          setModeOverride("COMPANY");
          await loadData();
          toast.success("ทุกสาขาใช้กะของบริษัทแล้ว");
        },
      });
      return;
    }

    setModeOverride("BRANCH");

    if (pausedBranchShifts.length === 0) return;

    setSaving(true);
    void Promise.all(
      pausedBranchShifts.map((policy) =>
        updateAttendancePolicy(policy.id, { status: "ACTIVE" }),
      ),
    )
      .then(async () => {
        await loadData();
        toast.success(
          `เปิดกะของสาขากลับมา ${pausedBranchShifts.length} ใบแล้ว`,
        );
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "สลับโหมดไม่สำเร็จ",
        );
      })
      .finally(() => setSaving(false));
  }

  /**
   * จัดกลุ่มตามเจ้าของกะ: กะของบริษัท แล้วตามด้วยกะของแต่ละสาขา
   * โหมด "ใช้ทั้งบริษัท" จะเหลือแค่กลุ่มบริษัท เพราะสาขาไม่มีสิทธิ์ตั้งเอง
   */
  const shiftGroups = useMemo(() => {
    const companyShifts = shifts.filter((item) => !item.policy.branchId);

    return [
      // โหมดแยกสาขา แสดงเฉพาะกลุ่มสาขา ไม่ต้องมีกลุ่มบริษัทมาปน
      // ผู้ใช้ระดับสาขาก็ไม่ต้องเห็นกลุ่มบริษัท เพราะแก้ไม่ได้อยู่แล้ว
      ...(mode === "BRANCH" || isBranchScoped
        ? []
        : [
            {
              key: "COMPANY",
              branchId: null as string | null,
              isCompany: true,
              title: `กะของบริษัท ${scope.companyName}`,
              hint:
                companyShifts.length === 0
                  ? "ยังไม่มีกะ — กด เพิ่มกะ เพื่อสร้างกะแรก"
                  : `${companyShifts.length} กะ · ทุกสาขาใช้ชุดนี้`,
              shifts: companyShifts,
            },
          ]),
      // โหมดใช้ทั้งบริษัท ไม่ต้องโชว์กลุ่มสาขา เพราะสาขาตั้งเองไม่ได้
      ...(mode === "COMPANY"
        ? []
        : branches
            // ผู้ใช้ระดับสาขาเห็นเฉพาะสาขาตัวเอง
            .filter((branch) => !isBranchScoped || branch.id === ownBranchId)
            .map((branch) => {
              const own = shifts.filter(
                (item) => item.policy.branchId === branch.id,
              );

              return {
                key: branch.id,
                branchId: branch.id as string | null,
                isCompany: false,
                title: branch.nameTh || branch.nameEn || branch.code,
                hint:
                  own.length === 0
                    ? "ใช้กะของบริษัท"
                    : `${own.length} กะของสาขานี้ · ไม่ใช้ของบริษัทแล้ว`,
                shifts: own,
              };
            })),
    ];
  }, [branches, isBranchScoped, mode, ownBranchId, scope.companyName, shifts]);

  // กะที่เลือกอาจถูกลบไปแล้ว ให้ตกกลับไปตัวแรก
  const selectedPolicyId = shifts.some(
    (item) => item.policy.id === selectedPolicyIdRaw,
  )
    ? selectedPolicyIdRaw
    : (shifts[0]?.policy.id ?? "");

  const selectedShiftAssignedCount =
    shifts.find((item) => item.policy.id === selectedPolicyId)?.assignedCount ??
    0;

  const selectedShift =
    shifts.find((item) => item.policy.id === selectedPolicyId) ?? null;

  /**
   * กลุ่มที่มีหลายกะ ต้องมีใบเดียวที่เป็นค่าเริ่มต้นสำหรับคนที่ยังไม่ถูกเลือกใส่กะ
   * ทำโดยดัน priority ให้สูงกว่าใบอื่นในกลุ่มเดียวกัน ผู้ใช้ไม่ต้องรู้จักตัวเลขนี้
   */
  async function makeGroupDefault(policy: AttendancePolicy) {
    const sameGroup = shifts.filter(
      (item) => (item.policy.branchId ?? null) === (policy.branchId ?? null),
    );
    const top = Math.max(
      ...sameGroup.map((item) => Number(item.policy.priority ?? 100)),
    );

    setSaving(true);
    try {
      await updateAttendancePolicy(policy.id, { priority: top + 1 });
      await loadData();
      toast.success("ตั้งเป็นค่าเริ่มต้นของกลุ่มนี้แล้ว");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ตั้งค่าเริ่มต้นไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * รายชื่อในฟอร์มผูกพนักงาน
   * กะที่ผูกกับสาขา ต้องเห็นเฉพาะพนักงานสาขานั้น — เอาคนสาขาอื่นมาใส่ไม่ได้อยู่แล้ว
   * กะระดับบริษัทถึงจะเห็นทุกคนในบริษัท
   * คนที่อยู่ในกะนี้ลอยขึ้นบนสุด จะได้ไม่ต้องเลื่อนหา
   */
  const visibleEmployees = useMemo(() => {
    const keyword = assignSearch.trim().toLowerCase();
    const shiftBranchId =
      allPolicies.find((policy) => policy.id === selectedPolicyId)?.branchId ??
      null;

    const matched = employeeRows.filter((row) => {
      if (shiftBranchId && row.branchId !== shiftBranchId) return false;
      if (!keyword) return true;
      return (
        row.employeeCode.toLowerCase().includes(keyword) ||
        `${row.firstName} ${row.lastName}`.toLowerCase().includes(keyword) ||
        (row.nickname ?? "").toLowerCase().includes(keyword)
      );
    });

    /*
     * เรียงเป็นสาขา → แผนก → อาวุโส เหมือนรายชื่อพนักงานหน้าอื่นทั้งระบบ
     * (เดิมเรียงตามสถานะการผูกกะ ทำให้คนสาขาเดียวกันกระจายอยู่คนละที่)
     */
    const groupEmployee = (row: EmployeeShiftRow) => ({
      branch: row.branch,
      department: row.department,
      attendanceTrackingRequired: row.attendanceTrackingRequired,
      attendanceExemptSessions: (row.attendanceExemptSessions ?? []) as Array<
        "MORNING_IN" | "AFTERNOON_IN" | "CHECK_OUT"
      >,
    });

    const departmentRank = buildAttendanceDepartmentGroupRank(
      matched,
      groupEmployee,
    );

    return [...matched].sort((a, b) => {
      const branchDiff = attendanceBranchSortText(
        groupEmployee(a),
      ).localeCompare(attendanceBranchSortText(groupEmployee(b)), "th");
      if (branchDiff !== 0) return branchDiff;

      const departmentRankDiff =
        (departmentRank.get(attendanceDepartmentGroupKey(groupEmployee(a))) ??
          99) -
        (departmentRank.get(attendanceDepartmentGroupKey(groupEmployee(b))) ??
          99);
      if (departmentRankDiff !== 0) return departmentRankDiff;

      const departmentDiff = attendanceDepartmentSortText(
        groupEmployee(a),
      ).localeCompare(attendanceDepartmentSortText(groupEmployee(b)), "th");
      if (departmentDiff !== 0) return departmentDiff;

      return (
        compareEmployeeSeniority(a, b) ||
        a.employeeCode.localeCompare(b.employeeCode)
      );
    });
  }, [allPolicies, assignSearch, employeeRows, selectedPolicyId]);

  /*
   * รายชื่อยาวเป็นร้อยคน แบ่งหน้าแทนการเลื่อนในกล่อง
   * กล่องเลื่อนซ้อนในป๊อปอัพทำให้ต้องเลื่อนสองชั้นและหัวกลุ่มสาขาหลุดจากสายตา
   */
  const assignPageKey = `${selectedPolicyId ?? ""}|${assignSearch.trim()}`;
  const assignTotalPages = Math.max(
    1,
    Math.ceil(visibleEmployees.length / ASSIGN_PAGE_SIZE),
  );
  const assignCurrentPage = Math.min(
    assignPage.key === assignPageKey ? assignPage.page : 1,
    assignTotalPages,
  );
  const pagedEmployees = visibleEmployees.slice(
    (assignCurrentPage - 1) * ASSIGN_PAGE_SIZE,
    assignCurrentPage * ASSIGN_PAGE_SIZE,
  );

  function goToAssignPage(next: number) {
    setAssignPage({ key: assignPageKey, page: next });
  }

  /** คนที่ติ๊กได้จริงในรายการที่เห็นอยู่ — คนที่อยู่ในกะนี้แล้วไม่นับ */
  const selectableEmployees = visibleEmployees.filter(
    (employee) => employee.assignment?.policyId !== selectedPolicyId,
  );
  const allSelectablePicked =
    selectableEmployees.length > 0 &&
    selectableEmployees.every((employee) =>
      pickedEmployeeIds.includes(employee.id),
    );

  /**
   * ตำแหน่งที่มีอยู่ในรายชื่อที่เลือกได้ ใช้ทำปุ่มเลือกทั้งกลุ่ม
   *
   * การยกเว้นเก็บรายคนเสมอ ปุ่มนี้เป็นแค่ทางลัดในการเลือก ไม่ได้ผูกกฎไว้กับ
   * ตำแหน่ง เพราะของจริงมีคนนอกกลุ่มที่ต้องยกเว้นด้วย (พนักงานการตลาดที่ออก
   * ไปทำงานข้างนอกเหมือนพนักงานจัดส่ง) ถ้าผูกกับตำแหน่งจะตั้งให้คนนั้นไม่ได้
   */
  const selectablePositions = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; nameTh: string; level: number; count: number }
    >();

    for (const employee of selectableEmployees) {
      const position = employee.positionMaster;
      if (!position) continue;

      const current = grouped.get(position.id);
      if (current) current.count += 1;
      else
        grouped.set(position.id, {
          id: position.id,
          nameTh: position.nameTh,
          level: position.level ?? UNRANKED_POSITION_LEVEL,
          count: 1,
        });
    }

    /* เรียงตามระดับตำแหน่ง ผู้บริหารอยู่บนสุด เหมือนรายชื่อด้านล่าง */
    return [...grouped.values()].sort(
      (a, b) => a.level - b.level || b.count - a.count,
    );
  }, [selectableEmployees]);

  const selectedPolicy = useMemo(
    () => allPolicies.find((policy) => policy.id === selectedPolicyId) ?? null,
    [allPolicies, selectedPolicyId],
  );

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.sortOrder - b.sortOrder),
    [rules],
  );

  const activeRules = useMemo(
    () => sortedRules.filter((rule) => rule.status === "ACTIVE"),
    [sortedRules],
  );

  /** รอบมาตรฐานของกะที่เลือกอยู่ ใช้เวลาจริงของกะนั้น ไม่ใช่ค่าตายตัว */
  const selectedPolicyRuleTemplates = useMemo(
    () =>
      selectedPolicy
        ? buildDefaultRuleTemplates(toPolicyForm(selectedPolicy))
        : buildDefaultRuleTemplates(defaultPolicyForm),
    [selectedPolicy],
  );

  const missingDefaultRules = useMemo(() => {
    const activeCodes = new Set(activeRules.map((rule) => rule.sessionCode));
    return selectedPolicyRuleTemplates.filter(
      (template) => !activeCodes.has(template.sessionCode),
    );
  }, [activeRules, selectedPolicyRuleTemplates]);

  const loadData = useCallback(
    async (showToast = false) => {
      setLoading(true);
      try {
        const [policyPayload, companyPayload] = await Promise.all([
          getAttendancePolicies({
            page: 1,
            pageSize: 100,
            companyId: scope.companyId,
          }),
          apiFetch<CompanyOption[] | CompanyListResponse>(
            "/organization/companies?page=1&pageSize=100",
          ),
        ]);

        // เก็บกะทั้งบริษัทไว้ทั้งหมด ไม่กรองตามสาขา เพราะกะ 1 ตัวผูกข้ามสาขาได้
        setAllPolicies(policyPayload.items ?? []);
        setCompanies(normalizeCompanies(companyPayload));

        if (showToast) toast.success("โหลดข้อมูลล่าสุดแล้ว");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
        );
      } finally {
        setLoading(false);
      }
    },
    [scope.companyId],
  );

  const loadAssignments = useCallback(async () => {
    setAssignLoading(true);
    try {
      const payload = await getEmployeeShiftAssignments({
        companyId: scope.companyId,
      });
      setEmployeeRows(payload.items ?? []);
      setAssignSummary(
        payload.summary ?? { total: 0, assigned: 0, unassigned: 0 },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดรายชื่อพนักงานไม่สำเร็จ",
      );
    } finally {
      setAssignLoading(false);
    }
  }, [scope.companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAssignments();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAssignments]);

  const loadRules = useCallback(async (policyId: string, showToast = false) => {
    setRuleLoading(true);
    try {
      const payload = await getAttendanceSessionRules(policyId);
      setRules(payload);
      if (showToast) toast.success("โหลดรอบลงเวลาแล้ว");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดรอบลงเวลาไม่สำเร็จ",
      );
    } finally {
      setRuleLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedPolicyId("");
      setPolicyModalOpen(false);
      setRuleModalOpen(false);
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedPolicyId) {
        setRules([]);
        return;
      }

      void loadRules(selectedPolicyId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRules, selectedPolicyId]);

  /** ผูกพนักงานที่ติ๊กไว้เข้ากะที่กำลังดู */
  async function assignPicked() {
    if (!selectedPolicyId || pickedEmployeeIds.length === 0) return;

    setSaving(true);
    try {
      await assignEmployeesToShift(selectedPolicyId, {
        employeeIds: pickedEmployeeIds,
      });
      const count = pickedEmployeeIds.length;
      setPickedEmployeeIds([]);
      await loadAssignments();
      toast.success(`ผูกพนักงาน ${count} คนเข้ากะนี้แล้ว`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ผูกพนักงานเข้ากะไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * ตั้งการยกเว้นการลงเวลาให้พนักงานหลายคนพร้อมกัน
   *
   * ส่งเฉพาะเรื่องที่กด ไม่ส่งอีกเรื่อง เพื่อไม่ให้ทับค่าที่ตั้งไว้แล้ว
   * เช่น กด "ไม่ต้องเข้าบ่าย" ต้องไม่ไปล้างสถานะ "ไม่ต้องลงเวลา" ของคนนั้น
   */
  async function applyExemption(
    employeeIds: string[],
    change: { trackingRequired?: boolean; exemptSessions?: string[] },
    successMessage: string,
  ) {
    if (employeeIds.length === 0) return;

    setSaving(true);
    try {
      await updateAttendanceExemptions({ employeeIds, ...change });
      await loadAssignments();
      toast.success(successMessage);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ตั้งค่าการยกเว้นไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  /** สลับสถานะ "ไม่ต้องลงเวลาเข้าออก" ของคนเดียว */
  function toggleTracking(employee: EmployeeShiftRow) {
    const next = employee.attendanceTrackingRequired === false;
    void applyExemption(
      [employee.id],
      { trackingRequired: next },
      next
        ? `${employee.firstName} กลับมาต้องลงเวลาตามปกติ`
        : `${employee.firstName} ไม่ต้องลงเวลาเข้าออกแล้ว`,
    );
  }

  /** สลับสถานะ "ไม่ต้องกดเข้างานบ่าย" ของคนเดียว */
  function toggleAfternoon(employee: EmployeeShiftRow) {
    const exempt = (employee.attendanceExemptSessions ?? []).includes(
      "AFTERNOON_IN",
    );
    const nextSessions = exempt
      ? (employee.attendanceExemptSessions ?? []).filter(
          (code) => code !== "AFTERNOON_IN",
        )
      : [...(employee.attendanceExemptSessions ?? []), "AFTERNOON_IN"];

    void applyExemption(
      [employee.id],
      { exemptSessions: nextSessions },
      exempt
        ? `${employee.firstName} กลับมาต้องกดเข้างานบ่าย`
        : `${employee.firstName} ไม่ต้องกดเข้างานบ่ายแล้ว`,
    );
  }

  /** เอาพนักงานออกจากกะนี้ กลับไปใช้กะเริ่มต้นของสาขา */
  async function removeFromShift(employeeId: string) {
    if (!selectedPolicyId) return;

    setSaving(true);
    try {
      await removeEmployeesFromShift(selectedPolicyId, {
        employeeIds: [employeeId],
      });
      await loadAssignments();
      toast.success("เอาออกจากกะแล้ว — กลับไปใช้กะเริ่มต้นของสาขา");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "เอาออกจากกะไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * กะใหม่เริ่มที่ "เฉพาะคนที่เลือก" เสมอ (priority 0)
   * จะได้ไม่ไปแย่งสิทธิ์ของกะที่ใช้งานอยู่โดยที่ผู้ใช้ไม่ตั้งใจ
   * แล้วค่อยเลือกช่อง "ใช้กับ" ในรายการทีหลัง
   */
  function startCreatePolicy(
    source?: AttendancePolicy,
    branchId?: string | null,
  ) {
    const sourceForm = source ? toPolicyForm(source) : defaultPolicyForm;
    const targetBranchId = branchId ?? null;
    const ownerName = targetBranchId
      ? branchLabel(branches, targetBranchId)
      : scope.companyName;
    // กลุ่มที่ยังว่าง กะใบแรกต้องเป็นค่าเริ่มต้นให้เลย ไม่งั้นจะไม่มีใครใช้มัน
    const groupIsEmpty = !shifts.some(
      (item) => (item.policy.branchId ?? null) === targetBranchId,
    );

    setPolicyForm({
      ...sourceForm,
      id: undefined,
      companyId: scope.companyId,
      branchId: targetBranchId ?? "",
      employeeTypeId: scope.employeeTypeId ?? "",
      code: buildScopeCode(targetBranchId, scope.employeeTypeId ?? null),
      priority: groupIsEmpty ? "100" : "0",
      name: `กะใหม่ ${ownerName}`,
      effectiveFrom: TODAY,
      effectiveTo: "",
      status: "ACTIVE",
    });
    setPolicyModalOpen(true);
  }

  function startEditPolicy(policy: AttendancePolicy) {
    setPolicyForm(toPolicyForm(policy));
    setPolicyModalOpen(true);
  }

  function startCreateRule(template?: RuleFormState) {
    const nextSortOrder = String((sortedRules.at(-1)?.sortOrder ?? 0) + 1);
    setRuleForm({
      ...(template ?? defaultRuleForm),
      sortOrder: template?.sortOrder ?? nextSortOrder,
    });
    setRuleModalOpen(true);
  }

  function startEditRule(rule: AttendanceSessionRule) {
    setRuleForm(toRuleForm(rule));
    setRuleModalOpen(true);
  }

  async function submitPolicy() {
    if (!policyForm.companyId) {
      toast.error("กรุณาเลือกบริษัทก่อนบันทึกนโยบาย");
      return;
    }

    // รหัสระบบสร้างให้เอง ผู้ใช้เห็นแค่ช่องชื่อ ข้อความจึงต้องชี้ไปที่ชื่อ
    if (!policyForm.name.trim()) {
      toast.error("กรุณาตั้งชื่อกะ");
      return;
    }

    if (!policyForm.code.trim()) {
      toast.error("รหัสกะหายไป กรุณาปิดฟอร์มแล้วลองใหม่");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPolicyPayload(policyForm);
      let nextSelectedId = selectedPolicyId;

      if (policyForm.id) {
        const updatePayload: AttendancePolicyUpdateForm = { ...payload };
        delete (updatePayload as Partial<AttendancePolicyForm>).companyId;
        await updateAttendancePolicy(policyForm.id, updatePayload);
        nextSelectedId = policyForm.id;
        toast.success("บันทึกนโยบายแล้ว");
      } else {
        const created = await createAttendancePolicy(payload);
        nextSelectedId = created.id;
        if (canManageRules) {
          /*
           * ต้องสร้างรอบจากค่าที่กรอกให้กะใหม่เท่านั้น
           *
           * เคสที่เคยพัง: โค้ดเดิมเช็ค rules.length ก่อน แต่ rules คือรอบของ
           * "กะที่เลือกอยู่" ไม่ใช่ร่างของกะใหม่ พอสร้างกะที่สองระบบจึงคัดลอก
           * รอบของกะแรกมาทั้งดุ้น กะคลังสินค้าที่ตั้งเข้า 08:00 เลยได้รอบ 08:30
           * ของกะสำนักงาน และหักเงินมาสายผิดทั้งสาขาโดยไม่มีสัญญาณเตือน
           */
          const templates =
            buildDefaultRuleTemplates(policyForm).map(buildRulePayload);
          await Promise.all(
            templates.map((template) =>
              createAttendanceSessionRule(created.id, template),
            ),
          );
        }
        toast.success("สร้างนโยบายและรอบลงเวลามาตรฐานแล้ว");
      }

      await loadData();
      setSelectedPolicyId(nextSelectedId);
      setPolicyModalOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "บันทึกนโยบายไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitRule() {
    if (!selectedPolicyId) {
      toast.error("กรุณาเลือกนโยบายก่อนเพิ่มรอบลงเวลา");
      return;
    }

    if (!ruleForm.label.trim()) {
      toast.error("กรุณาระบุชื่อรอบลงเวลา");
      return;
    }

    setSaving(true);
    try {
      const payload = buildRulePayload(ruleForm);
      if (ruleForm.id) {
        await updateAttendanceSessionRule(ruleForm.id, payload);
        toast.success("บันทึกรอบลงเวลาแล้ว");
      } else {
        await createAttendanceSessionRule(selectedPolicyId, payload);
        toast.success("เพิ่มรอบลงเวลาแล้ว");
      }

      await loadRules(selectedPolicyId);
      setRuleModalOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "บันทึกรอบลงเวลาไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createDefaultRules() {
    if (!selectedPolicyId) return;
    if (!missingDefaultRules.length) {
      toast.info("นโยบายนี้มีรอบมาตรฐานครบแล้ว");
      return;
    }

    setSaving(true);
    try {
      for (const template of missingDefaultRules) {
        await createAttendanceSessionRule(
          selectedPolicyId,
          buildRulePayload(template),
        );
      }
      await loadRules(selectedPolicyId);
      toast.success("สร้างรอบมาตรฐานแล้ว");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "สร้างรอบมาตรฐานไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmDeletePolicy(policy: AttendancePolicy) {
    setDialog({
      title: "ปิดใช้งานนโยบายนี้?",
      description: `ระบบจะปิดใช้งาน ${policy.name} แต่ไม่ลบประวัติออกจากระบบ`,
      confirmLabel: "ปิดใช้งาน",
      tone: "red",
      onConfirm: async () => {
        await deleteAttendancePolicy(policy.id);
        toast.success("ปิดใช้งานนโยบายแล้ว");
        await loadData();
        setPolicyModalOpen(false);
      },
    });
  }

  function confirmDeleteRule(rule: AttendanceSessionRule) {
    setDialog({
      title: "ปิดใช้งานรอบลงเวลานี้?",
      description: `ระบบจะปิดใช้งาน ${rule.label} แต่ไม่ลบประวัติออกจากระบบ`,
      confirmLabel: "ปิดใช้งาน",
      tone: "red",
      onConfirm: async () => {
        await deleteAttendanceSessionRule(rule.id);
        toast.success("ปิดใช้งานรอบลงเวลาแล้ว");
        if (selectedPolicyId) await loadRules(selectedPolicyId);
      },
    });
  }

  /* ------------------------------ render ----------------------------- */

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          กำลังโหลดนโยบายเวลาเข้า–ออกงาน
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 text-slate-900">
      {/* แถบหัวข้อ: บอกสรุปสั้น ๆ + ปุ่มรีเฟรช/เพิ่มกะ */}
      <Toolbar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-700 3xl:text-[14px]">
            กะการทำงาน
          </span>
          <Badge tone={shifts.length > 0 ? "brand" : "warning"}>
            {shifts.length} กะ
          </Badge>
          <span className="text-[13px] text-slate-400">
            พนักงาน {assignSummary.total} คน · ผูกกะแล้ว{" "}
            {assignSummary.assigned} · ยังไม่ผูก {assignSummary.unassigned}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void loadData(true);
              void loadAssignments();
            }}
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
          >
            รีเฟรช
          </Button>

          {canManagePolicy ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => startCreatePolicy()}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              เพิ่มกะ
            </Button>
          ) : null}
        </div>
      </Toolbar>

      {companies.length === 0 ? (
        <div className="px-5 pt-4 3xl:px-6">
          <Notice tone="warning">
            ยังไม่มีข้อมูลบริษัท — ต้องมีบริษัทก่อนจึงจะสร้างนโยบายเวลาได้
          </Notice>
        </div>
      ) : null}

      {shifts.length === 0 ? (
        <div className="px-5 py-16 text-center 3xl:px-6">
          <p className="text-[13px] font-semibold text-slate-600">
            ยังไม่มีกะการทำงาน
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
            {canManagePolicy
              ? "สร้างกะแรก ระบบจะสร้างรอบลงเวลามาตรฐาน (เข้ารอบ 1 / เข้ารอบ 2 / ออกงาน) ให้อัตโนมัติ แล้วค่อยผูกพนักงานเข้ากะทีหลังได้"
              : "บัญชีนี้มีสิทธิ์ดูข้อมูล แต่ไม่มีสิทธิ์เพิ่มหรือแก้ไขกะการทำงาน"}
          </p>
          {canManagePolicy ? (
            <div className="mt-4">
              <Button
                variant="primary"
                onClick={() => startCreatePolicy()}
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                สร้างกะแรก
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {/* เลือกโหมด: ใช้กะเดียวทั้งบริษัท หรือแยกตามสาขา */}
          {isBranchScoped ? (
            <div className="px-5 py-3 3xl:px-6">
              <Notice>
                บัญชีของคุณดูแลเฉพาะสาขา {branchLabel(branches, ownBranchId)} —
                ตั้งกะได้เฉพาะสาขานี้
                ส่วนกะระดับบริษัทต้องให้ผู้ดูแลระดับบริษัทเป็นคนตั้ง
              </Notice>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 3xl:px-6">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                รูปแบบการตั้งกะ
              </span>

              {/* แคปซูลเดียวสองช่อง ชุดเดียวกับแถบแท็บของระบบ */}
              <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                <ModeButton
                  active={mode === "COMPANY"}
                  icon={Building2}
                  title="ใช้กะเดียวกันทั้งบริษัท"
                  description="ทุกสาขาลงเวลาตามกะของบริษัท"
                  disabled={!canManagePolicy || saving}
                  onSelect={() => applyMode("COMPANY")}
                />
                <ModeButton
                  active={mode === "BRANCH"}
                  icon={MapPin}
                  title="แยกกะตามสาขา"
                  description="แต่ละสาขาตั้งกะของตัวเองได้"
                  disabled={!canManagePolicy || saving || branches.length === 0}
                  onSelect={() => applyMode("BRANCH")}
                />
              </div>

              <span className="text-[11.5px] text-slate-400 3xl:text-[12px]">
                {mode === "COMPANY"
                  ? "ทุกสาขาลงเวลาตามกะของบริษัท"
                  : "แต่ละสาขาตั้งกะของตัวเองได้"}
              </span>

              {mode === "COMPANY" && pausedBranchShifts.length > 0 ? (
                <span className="text-[11.5px] font-semibold text-amber-700 3xl:text-[12px]">
                  มีกะของสาขาถูกพักไว้ {pausedBranchShifts.length} ใบ
                  (ยังไม่ถูกลบ)
                </span>
              ) : null}
            </div>
          )}

          {/* หนึ่งกลุ่ม = หนึ่งเจ้าของกะ (บริษัท หรือสาขา) */}
          {shiftGroups.map((group) => (
            <section key={group.key}>
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 border-y px-5 py-2 3xl:px-6",
                  /*
                   * สองชั้นใช้สีเดียวกันคนละเฉด แบบเดียวกับหัวกลุ่มสาขา/แผนกในหน้าอื่น
                   * กะของบริษัทเป็นค่าตั้งต้นของทุกสาขา จึงเป็นแถบทึบกว่า
                   */
                  group.isCompany
                    ? "border-brand-200 bg-brand-100/70"
                    : "border-brand-100 bg-white",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "h-4 w-1.5 shrink-0 rounded-full",
                      group.isCompany ? "bg-brand-600" : "bg-brand-300",
                    )}
                  />
                  {group.isCompany ? (
                    <Building2 className="h-4 w-4 shrink-0 text-brand-600" />
                  ) : (
                    <MapPin className="h-4 w-4 shrink-0 text-brand-400" />
                  )}
                  <span
                    className={cn(
                      "truncate text-[13px] font-bold 3xl:text-[13.5px]",
                      group.isCompany ? "text-brand-900" : "text-brand-700",
                    )}
                  >
                    {group.title}
                  </span>
                  <span
                    className={cn(
                      "truncate text-[11.5px] font-semibold",
                      group.isCompany ? "text-brand-500" : "text-brand-400",
                    )}
                  >
                    {group.hint}
                  </span>
                </div>

                {canManagePolicy ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startCreatePolicy(undefined, group.branchId)}
                    icon={<Plus className="h-3.5 w-3.5" />}
                  >
                    เพิ่มกะ
                  </Button>
                ) : null}
              </div>

              {group.shifts.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {group.shifts.map((item) => (
                    <div
                      key={item.policy.id}
                      className="flex flex-wrap items-center gap-2 px-5 py-2.5 transition hover:bg-brand-50/40 3xl:px-6"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPolicyId(item.policy.id);
                          setDetailOpen(true);
                        }}
                        title="เปิดดูเวลาเข้า–ออกและค่าปรับ"
                        className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-100 group-hover:text-brand-700">
                          <Clock4 className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-slate-900 group-hover:text-brand-700 3xl:text-[14px]">
                              {item.policy.name}
                            </span>
                            {group.shifts.length > 1 && item.isGroupDefault ? (
                              <Badge tone="positive">ค่าเริ่มต้น</Badge>
                            ) : null}
                          </span>
                          <span className="block truncate text-[11px] text-slate-500">
                            <span className="font-semibold tabular-nums text-brand-700">
                              {shiftTimeRange(item.policy)}
                            </span>
                            {shiftTimeDetail(item.policy)}
                          </span>
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {canManagePolicy &&
                        group.shifts.length > 1 &&
                        !item.isGroupDefault ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void makeGroupDefault(item.policy)}
                            disabled={saving}
                            title="คนในกลุ่มนี้ที่ยังไม่ถูกเลือกใส่กะ จะใช้ใบนี้"
                          >
                            ตั้งเป็นค่าเริ่มต้น
                          </Button>
                        ) : null}

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedPolicyId(item.policy.id);
                            setDetailOpen(true);
                          }}
                          icon={<Settings2 className="h-3.5 w-3.5" />}
                        >
                          ตั้งเวลา/ค่าปรับ
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedPolicyId(item.policy.id);
                            setPickedEmployeeIds([]);
                            setAssignSearch("");
                            setAssignModalOpen(true);
                          }}
                          disabled={!canManagePolicy}
                          icon={<Users className="h-3.5 w-3.5" />}
                        >
                          {item.assignedCount > 0
                            ? `${item.assignedCount} คน`
                            : "เลือกคน"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-3 text-[13px] text-slate-400 3xl:px-6">
                  ยังไม่มีกะของตัวเอง — พนักงานสาขานี้ใช้กะของบริษัท
                </p>
              )}
            </section>
          ))}
        </div>
      )}

      {/* รายละเอียดกะ — เปิดเป็นป๊อปอัพ ไม่ต้องยืดหน้าหลัก */}
      <DetailModal
        open={detailOpen && Boolean(selectedPolicy)}
        title={selectedPolicy?.name ?? ""}
        onClose={() => setDetailOpen(false)}
        chips={
          selectedPolicy ? (
            <>
              <ScopeChip>{selectedShift?.scopeName ?? "ทั้งบริษัท"}</ScopeChip>
              <ScopeChip>
                {selectedShift?.isScopeDefault
                  ? "กะเริ่มต้น"
                  : "ต้องเลือกคนเอง"}
              </ScopeChip>
              <ScopeChip>ผูกไว้ {selectedShiftAssignedCount} คน</ScopeChip>
            </>
          ) : null
        }
      >
        {selectedPolicy ? (
          <div className="space-y-4">
            {/* ค่าประจำกะ เรียงเป็นช่องคั่นเส้น แทนข้อความเทาลอยเป็นบรรทัด */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-stretch divide-x divide-brand-100">
                <ShiftFact
                  label="วิธีหักค่าปรับ"
                  value={
                    selectedPolicy.missingPenaltyMode === "PER_DAY"
                      ? "รายวัน"
                      : "รายรอบ"
                  }
                />
                <ShiftFact
                  label="เริ่มใช้"
                  value={formatDate(selectedPolicy.effectiveFrom)}
                />
                <ShiftFact
                  label="รอบลงเวลา"
                  value={`${sortedRules.length} รอบ`}
                  tone={missingDefaultRules.length ? "warning" : undefined}
                  hint={
                    missingDefaultRules.length
                      ? `ขาดรอบมาตรฐาน ${missingDefaultRules.length}`
                      : undefined
                  }
                />
              </div>

              {canManagePolicy ? (
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => startEditPolicy(selectedPolicy)}
                    icon={<Pencil className="h-3.5 w-3.5" />}
                  >
                    แก้ชื่อและเวลา
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => confirmDeletePolicy(selectedPolicy)}
                    icon={<Power className="h-3.5 w-3.5" />}
                  >
                    ปิดใช้งาน
                  </Button>
                </div>
              ) : null}
            </div>

            {/* ไม่ครอบเป็นกล่องอีกชั้น — ป้ายฟ้าคั่นเส้นบางเหมือนป๊อปอัพอื่น */}
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-brand-100 pb-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  รอบลงเวลา ({sortedRules.length})
                </span>

                {canManageRules ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {missingDefaultRules.length ? (
                      <Button
                        size="sm"
                        onClick={() => void createDefaultRules()}
                        loading={saving}
                        icon={<Plus className="h-3.5 w-3.5" />}
                      >
                        สร้างรอบมาตรฐานที่ขาด ({missingDefaultRules.length})
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      onClick={() => startCreateRule()}
                      icon={<Plus className="h-3.5 w-3.5" />}
                    >
                      เพิ่มรอบ
                    </Button>
                  </div>
                ) : null}
              </div>

              {ruleLoading ? (
                <div className="flex min-h-[160px] items-center justify-center text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-brand-600" />
                  กำลังโหลดรอบลงเวลา
                </div>
              ) : sortedRules.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-bold text-slate-700">
                    ยังไม่มีรอบลงเวลา
                  </p>
                  <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] text-slate-500">
                    กด “เพิ่มรอบ” หรือให้ระบบสร้างรอบมาตรฐานให้
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-brand-50">
                  {sortedRules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      canManage={canManageRules}
                      onEdit={() => startEditRule(rule)}
                      onDelete={() => confirmDeleteRule(rule)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DetailModal>

      <PolicyFormModal
        open={policyModalOpen}
        form={policyForm}
        scope={scope}
        branches={branches}
        saving={saving}
        onChange={setPolicyForm}
        onClose={() => setPolicyModalOpen(false)}
        onSubmit={() => void submitPolicy()}
      />

      <RuleFormModal
        open={ruleModalOpen}
        form={ruleForm}
        saving={saving}
        templates={selectedPolicyRuleTemplates}
        onChange={setRuleForm}
        onClose={() => setRuleModalOpen(false)}
        onSubmit={() => void submitRule()}
      />

      <PolicyModal
        open={assignModalOpen && Boolean(selectedPolicy)}
        size="lg"
        title="ผูกพนักงานเข้ากะ"
        description={selectedPolicy?.name ?? ""}
        icon={Users}
        saving={saving}
        submitLabel={`ผูกเข้ากะนี้ (${pickedEmployeeIds.length})`}
        submitDisabled={pickedEmployeeIds.length === 0}
        onClose={() => setAssignModalOpen(false)}
        onSubmit={() => void assignPicked()}
        chips={
          <>
            <ScopeChip>
              {selectedPolicy?.branchId
                ? branchLabel(branches, selectedPolicy.branchId)
                : "ทั้งบริษัท"}
            </ScopeChip>
            <ScopeChip>อยู่ในกะนี้ {selectedShiftAssignedCount} คน</ScopeChip>
          </>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={assignSearch}
              onChange={(event) => setAssignSearch(event.target.value)}
              placeholder="ค้นหารหัสหรือชื่อพนักงาน"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold leading-5 text-slate-500">
              {selectedPolicy?.branchId
                ? `แสดงเฉพาะพนักงานสาขา ${branchLabel(branches, selectedPolicy.branchId)} — กะของสาขารับได้เฉพาะคนในสาขานั้น`
                : "กะระดับบริษัท เลือกได้ทุกคนในบริษัท"}
              {" · "}1 คนอยู่ได้กะเดียว ผูกใหม่จะแทนที่กะเดิมให้อัตโนมัติ
            </p>

            {selectableEmployees.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setPickedEmployeeIds(
                    allSelectablePicked
                      ? []
                      : selectableEmployees.map((employee) => employee.id),
                  )
                }
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-brand-700 transition hover:bg-brand-50"
              >
                <Check className="h-3.5 w-3.5" />
                {allSelectablePicked
                  ? "ล้างที่เลือก"
                  : `เลือกทุกคน (${selectableEmployees.length})`}
              </button>
            ) : null}
          </div>

          {/*
            แถบยกเว้นการลงเวลา — แยกจากการผูกกะชัดเจนด้วยเส้นและพื้นหลัง
            เพราะเป็นคนละเรื่องกัน กะคือ "ทำงานเวลาไหน" ส่วนตรงนี้คือ
            "ต้องกดบัตรไหม" ผู้ใช้ต้องไม่สับสนว่ากดปุ่มนี้แล้วกะจะเปลี่ยน
          */}
          {pickedEmployeeIds.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold leading-5 text-amber-800">
                ตั้งการยกเว้นให้ {pickedEmployeeIds.length} คนที่เลือก
                <span className="font-medium text-amber-700">
                  {" "}
                  — ไม่เกี่ยวกับการผูกกะ ใช้กับคนที่ไม่ต้องกดบัตร
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void applyExemption(
                      pickedEmployeeIds,
                      { trackingRequired: false },
                      `ตั้งไม่ต้องลงเวลาให้ ${pickedEmployeeIds.length} คนแล้ว`,
                    )
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  ไม่ต้องลงเวลาเข้าออก
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void applyExemption(
                      pickedEmployeeIds,
                      { exemptSessions: ["AFTERNOON_IN"] },
                      `ตั้งไม่ต้องกดเข้างานบ่ายให้ ${pickedEmployeeIds.length} คนแล้ว`,
                    )
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  ไม่ต้องกดเข้างานบ่าย
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void applyExemption(
                      pickedEmployeeIds,
                      { trackingRequired: true, exemptSessions: [] },
                      `คืนค่าให้ ${pickedEmployeeIds.length} คนแล้ว`,
                    )
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  คืนค่าเริ่มต้น
                </button>
              </div>
            </div>
          ) : null}

          {/*
            เลือกทั้งตำแหน่ง — เดิมกางเป็นชิปทุกตำแหน่ง สิบกว่าอันกินพื้นที่
            สามบรรทัดจนดันรายชื่อจริงตกจอ เปลี่ยนเป็นช่องเลือกช่องเดียว
            ตัวเลือกเรียงผู้บริหารขึ้นก่อนเหมือนรายชื่อด้านล่าง
          */}
          {selectablePositions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] font-semibold text-slate-500 3xl:text-[12px]">
                เลือกทั้งตำแหน่ง
              </span>
              <div className="w-full sm:w-64">
                <Select
                  value=""
                  aria-label="เลือกพนักงานทั้งตำแหน่ง"
                  onChange={(event) => {
                    const positionId = event.target.value;
                    if (!positionId) return;

                    setPickedEmployeeIds((current) => {
                      const ids = selectableEmployees
                        .filter((e) => e.positionMaster?.id === positionId)
                        .map((e) => e.id);
                      return [...new Set([...current, ...ids])];
                    });
                  }}
                >
                  <option value="">เลือกตำแหน่ง…</option>
                  {selectablePositions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.nameTh} ({position.count} คน)
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}

          {assignLoading ? (
            <div className="flex min-h-[160px] items-center justify-center text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              กำลังโหลดรายชื่อพนักงาน…
            </div>
          ) : visibleEmployees.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-slate-400">
              ไม่พบพนักงานที่ตรงกับคำค้นหา
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {pagedEmployees.map((employee, index) => {
                const inThisShift =
                  employee.assignment?.policyId === selectedPolicyId;
                const otherShift =
                  employee.assignment && !inThisShift
                    ? employee.assignment.policy.name
                    : null;

                /* หัวกลุ่มขึ้นเมื่อสาขา/แผนกเปลี่ยน ชุดเดียวกับหน้าตรวจเวลาทำงาน */
                const previous = pagedEmployees[index - 1];
                const orgOf = (row?: EmployeeShiftRow) =>
                  row
                    ? { branch: row.branch, department: row.department }
                    : null;
                const newBranch =
                  index === 0 ||
                  attendanceBranchGroupKey(orgOf(previous)) !==
                    attendanceBranchGroupKey(orgOf(employee));
                const newDepartment =
                  newBranch ||
                  attendanceDepartmentGroupKey(orgOf(previous)) !==
                    attendanceDepartmentGroupKey(orgOf(employee));

                return (
                  <Fragment key={`group-${employee.id}`}>
                    {newBranch ? (
                      <li className="sticky top-0 z-10 border-y border-brand-200 bg-brand-100/90 px-3 py-1.5 backdrop-blur">
                        <span className="flex items-center gap-2 text-[12.5px] font-bold text-brand-900">
                          <span className="h-3.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                          {employee.branch?.nameTh ?? "ไม่ระบุสาขา"}
                          {employee.branch?.code ? (
                            <span className="font-semibold text-brand-500">
                              {employee.branch.code}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ) : null}

                    {newDepartment ? (
                      <li className="border-b border-brand-100 bg-white px-3 py-1.5 pl-8">
                        <span className="flex items-center gap-2 text-[12px] font-semibold text-brand-700">
                          <span className="h-3 w-1 shrink-0 rounded-full bg-brand-300" />
                          {employee.department?.nameTh ?? "ไม่ระบุแผนก"}
                          {employee.department?.code ? (
                            <span className="font-semibold text-brand-300">
                              {employee.department.code}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ) : null}

                    <li
                      key={employee.id}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5",
                        inThisShift && "bg-brand-50/60",
                      )}
                    >
                      {inThisShift ? (
                        <span className="h-4 w-4 shrink-0" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={pickedEmployeeIds.includes(employee.id)}
                          onChange={(event) =>
                            setPickedEmployeeIds((current) =>
                              event.target.checked
                                ? [...current, employee.id]
                                : current.filter((id) => id !== employee.id),
                            )
                          }
                          className="h-4 w-4 shrink-0 accent-brand-600"
                        />
                      )}

                      <span className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-bold text-slate-500">
                        {employee.employeeCode}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] font-bold text-slate-800">
                          {employee.firstName} {employee.lastName}
                        </span>
                        <span className="block truncate text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-medium text-slate-400">
                          {employee.branch?.nameTh ?? "ไม่ระบุสาขา"}
                          {employee.employeeType?.nameTh
                            ? ` · ${employee.employeeType.nameTh}`
                            : ""}
                          {employee.positionMaster?.nameTh
                            ? ` · ${employee.positionMaster.nameTh}`
                            : ""}
                        </span>
                      </span>

                      {/*
                      ปุ่มยกเว้นการลงเวลา — สถานะปัจจุบันอ่านออกจากสีทันที
                      ติดสี = ยกเว้นอยู่ · จาง = ต้องลงเวลาตามปกติ
                    */}
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => toggleTracking(employee)}
                          title={
                            employee.attendanceTrackingRequired === false
                              ? "ตอนนี้ไม่ต้องลงเวลา — กดเพื่อให้กลับมาลงเวลาตามปกติ"
                              : "กดเพื่อยกเว้นการลงเวลาทั้งหมด (ผู้บริหาร / เหมาจ่าย)"
                          }
                          className={cn(
                            "inline-flex h-7 items-center rounded-full border px-2 text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-bold transition disabled:opacity-50",
                            employee.attendanceTrackingRequired === false
                              ? "border-amber-300 bg-amber-100 text-amber-800"
                              : "border-slate-200 bg-white text-slate-400 hover:border-amber-300 hover:text-amber-700",
                          )}
                        >
                          ไม่ลงเวลา
                        </button>

                        <button
                          type="button"
                          disabled={
                            saving ||
                            employee.attendanceTrackingRequired === false
                          }
                          onClick={() => toggleAfternoon(employee)}
                          title={
                            employee.attendanceTrackingRequired === false
                              ? "คนนี้ไม่ต้องลงเวลาอยู่แล้ว ไม่ต้องตั้งรายรอบ"
                              : (
                                    employee.attendanceExemptSessions ?? []
                                  ).includes("AFTERNOON_IN")
                                ? "ตอนนี้ไม่ต้องกดเข้างานบ่าย — กดเพื่อให้กลับมากดตามปกติ"
                                : "กดเพื่อยกเว้นการกดเข้างานบ่าย (ออกไปทำงานข้างนอก)"
                          }
                          className={cn(
                            "inline-flex h-7 items-center rounded-full border px-2 text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-bold transition disabled:opacity-40",
                            (employee.attendanceExemptSessions ?? []).includes(
                              "AFTERNOON_IN",
                            )
                              ? "border-sky-300 bg-sky-100 text-sky-800"
                              : "border-slate-200 bg-white text-slate-400 hover:border-sky-300 hover:text-sky-700",
                          )}
                        >
                          ไม่เข้าบ่าย
                        </button>
                      </span>

                      {inThisShift ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-bold text-emerald-700">
                          <Check className="h-3 w-3" />
                          อยู่ในกะนี้
                        </span>
                      ) : otherShift ? (
                        <span className="max-w-[140px] shrink-0 truncate rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-bold text-violet-700">
                          {otherShift}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-bold text-slate-400">
                          ใช้กะเริ่มต้น
                        </span>
                      )}

                      {inThisShift ? (
                        <button
                          type="button"
                          onClick={() => void removeFromShift(employee.id)}
                          disabled={saving}
                          aria-label="เอาออกจากกะนี้"
                          title="เอาออกจากกะนี้"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}

          {/* แบ่งหน้าแทนการเลื่อนในกล่อง */}
          {!assignLoading && visibleEmployees.length > ASSIGN_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11.5px] tabular-nums text-slate-500 3xl:text-[12px]">
                หน้า {assignCurrentPage} จาก {assignTotalPages} · แสดง{" "}
                {(assignCurrentPage - 1) * ASSIGN_PAGE_SIZE + 1}–
                {Math.min(
                  assignCurrentPage * ASSIGN_PAGE_SIZE,
                  visibleEmployees.length,
                )}{" "}
                จาก {visibleEmployees.length} คน
              </span>

              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  disabled={assignCurrentPage <= 1}
                  onClick={() => {
                    goToAssignPage(assignCurrentPage - 1);
                    scrollPagerToTop();
                  }}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  size="sm"
                  disabled={assignCurrentPage >= assignTotalPages}
                  onClick={() => {
                    goToAssignPage(assignCurrentPage + 1);
                    scrollPagerToTop();
                  }}
                >
                  ถัดไป
                </Button>
              </span>
            </div>
          ) : null}
        </div>
      </PolicyModal>

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/**
 * ป๊อปอัพแบบดู/จัดการ (ไม่ใช่ฟอร์ม) — ใช้เปลือกเดียวกับ PolicyModal
 * แต่ไม่มีปุ่มบันทึก เพราะข้างในเป็นรายการที่มีปุ่มของตัวเองอยู่แล้ว
 */
function DetailModal({
  open,
  title,
  chips,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  chips?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  // ใช้กล่องกลางของระบบ หน้าตาจึงตรงกับป๊อปอัพอื่นทุกหน้า
  return (
    <KitModal
      open={open}
      title={title}
      description="เวลาเข้า–ออก และค่าปรับของกะนี้"
      size="lg"
      onClose={onClose}
      footer={<Button onClick={onClose}>ปิด</Button>}
    >
      <div className="space-y-4">
        {chips ? <div className="flex flex-wrap gap-1.5">{chips}</div> : null}

        {children}
      </div>
    </KitModal>
  );
}

/** ปุ่มเลือกโหมด — สลับจริง ไม่ใช่แค่ซ่อน กะของสาขาถูกพักไว้ ไม่ถูกลบ */
function ModeButton({
  active,
  icon: Icon,
  title,
  description,
  disabled,
  onSelect,
}: {
  active: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={description}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 3xl:text-[13px]",
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-slate-500 hover:text-slate-800",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {title}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* rule row                                                            */
/* ------------------------------------------------------------------ */

/** ค่าประจำกะหนึ่งช่องในป๊อปอัพรายละเอียด */
function ShiftFact({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={cn(
          "whitespace-nowrap text-[13px] font-semibold tabular-nums 3xl:text-[13.5px]",
          tone === "warning" ? "text-amber-700" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="whitespace-nowrap text-[10.5px] font-semibold text-amber-700">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** ค่าหนึ่งช่องในแถวรอบลงเวลา */
function RuleFact({
  label,
  value,
  hint,
  tone,
  width = "w-32",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "brand";
  width?: string;
}) {
  return (
    <div className={cn("min-w-0 shrink-0 px-3 first:pl-0", width)}>
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={cn(
          "whitespace-nowrap text-[12.5px] font-semibold tabular-nums 3xl:text-[13px]",
          tone === "brand" ? "text-brand-700" : "text-slate-800",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="whitespace-nowrap text-[10.5px] tabular-nums text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function RuleRow({
  rule,
  canManage,
  onEdit,
  onDelete,
}: {
  rule: AttendanceSessionRule;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCheckout = rule.punchType === "CHECK_OUT";
  const conditionTime = isCheckout
    ? (rule.earlyBeforeTime ?? rule.expectedTime)
    : (rule.lateAfterTime ?? rule.expectedTime);
  const penaltyPerMinute = isCheckout
    ? rule.earlyLeavePenaltyPerMinute
    : rule.latePenaltyPerMinute;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg px-2 py-2.5 transition hover:bg-brand-50/60 lg:flex-row lg:items-center lg:gap-4",
        rule.status !== "ACTIVE" && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5 lg:w-56 lg:shrink-0">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
              {rule.label}
            </span>
            {!rule.requirePunch ? (
              <span
                title="ไม่กดรอบนี้ก็ไม่โดนค่าปรับ ใช้กับกะที่ลงเวลาไม่ครบรอบ เช่น นักศึกษาฝึกงาน"
                className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
              >
                ไม่บังคับกด
              </span>
            ) : null}
          </span>
          <span className="block truncate text-[11px] text-slate-400">
            {sessionLabels[rule.sessionCode]}
            {rule.status !== "ACTIVE" ? " · ปิดใช้งาน" : ""}
          </span>
        </span>
      </div>

      {/*
        ค่าที่ต้องอ่านบ่อย วางเป็นช่องป้ายบน–ค่าล่าง ตรึงความกว้างไว้
        ทุกแถวจึงขึ้นต้นตรงแนวเดียวกัน ไม่ใช่ข้อความยาวที่เลื่อนไปตามความยาวชื่อรอบ
      */}
      <div className="flex min-w-0 flex-1 flex-wrap items-stretch">
        <RuleFact label="กดได้" value={`${rule.openTime}–${rule.closeTime}`} />
        <RuleFact label="เวลามาตรฐาน" value={rule.expectedTime} tone="brand" />
        <RuleFact
          label={isCheckout ? "ถือว่าออกก่อน" : "ถือว่าสาย"}
          value={conditionTime ?? "-"}
        />
        <RuleFact
          label="ค่าปรับ"
          value={`${formatMoney(penaltyPerMinute)} บาท/นาที`}
          hint={`ลืมกด ${formatMoney(rule.missingPenaltyAmount)} บาท`}
          width="w-40"
        />
      </div>

      {canManage ? (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-brand-50 hover:text-brand-700"
            aria-label="แก้รอบลงเวลา"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            aria-label="ปิดใช้งานรอบลงเวลา"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* modals                                                              */
/* ------------------------------------------------------------------ */

function PolicyFormModal({
  open,
  form,
  scope,
  branches,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: PolicyFormState;
  scope: WorkPolicyScope;
  branches: BranchOption[];
  saving: boolean;
  onChange: (form: PolicyFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <PolicyModal
      open={open}
      icon={Clock4}
      title={form.id ? "แก้ไขนโยบายเวลา" : "เพิ่มนโยบายเวลา"}
      description={
        form.id
          ? "แก้เวลาหลักและค่าปรับของนโยบายนี้"
          : "กรอกเวลาหลักและค่าปรับ ระบบจะสร้างรอบลงเวลามาตรฐานให้อัตโนมัติ"
      }
      saving={saving}
      submitLabel={form.id ? "บันทึกการแก้ไข" : "บันทึกและสร้างรอบมาตรฐาน"}
      onClose={onClose}
      onSubmit={onSubmit}
      chips={
        <>
          <ScopeChip>{scope.companyName}</ScopeChip>
          <ScopeChip>{branchLabel(branches, form.branchId || null)}</ScopeChip>
          <ScopeChip>{scope.employeeTypeName ?? "พนักงานทุกประเภท"}</ScopeChip>
        </>
      }
    >
      <div className="space-y-4">
        <ModalField label="ชื่อกะ" required hint="เช่น กะเช้า, กะดึก, กะออฟฟิศ">
          <input
            value={form.name}
            onChange={(event) =>
              onChange({ ...form, name: event.target.value })
            }
            placeholder="ตั้งชื่อให้รู้ว่าเป็นกะอะไร"
            className={modalInputClass}
          />
        </ModalField>

        <ModalField
          label="ใช้กับสาขา"
          hint={
            form.branchId
              ? "นโยบายนี้จะใช้เฉพาะพนักงานสาขานี้ ก่อนนโยบายระดับบริษัท"
              : "ทั้งบริษัท = ใช้กับทุกสาขาที่ไม่ได้ตั้งค่าแยกไว้"
          }
        >
          <select
            value={form.branchId}
            onChange={(event) =>
              onChange({ ...form, branchId: event.target.value })
            }
            className={modalInputClass}
            disabled={branches.length === 0}
          >
            <option value="">ทั้งบริษัท (ทุกสาขา)</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nameTh || branch.nameEn || branch.code}
              </option>
            ))}
          </select>
        </ModalField>

        <ModalSection title="เวลาทำงานหลัก">
          <div className="grid gap-3 sm:grid-cols-3">
            <ModalField label="เวลาเข้างาน รอบ 1" required>
              <input
                type="text"
                inputMode="numeric"
                placeholder="00:00"
                maxLength={5}
                value={form.morningCheckInDeadline}
                onChange={(event) =>
                  onChange({
                    ...form,
                    morningCheckInDeadline: maskTime(event.target.value),
                  })
                }
                onBlur={(event) =>
                  onChange({
                    ...form,
                    morningCheckInDeadline: normalizeTime(event.target.value),
                  })
                }
                className={modalInputClass}
              />
            </ModalField>
            <ModalField label="เวลาเข้างาน รอบ 2" required>
              <input
                type="text"
                inputMode="numeric"
                placeholder="00:00"
                maxLength={5}
                value={form.afternoonCheckInDeadline}
                onChange={(event) =>
                  onChange({
                    ...form,
                    afternoonCheckInDeadline: maskTime(event.target.value),
                  })
                }
                onBlur={(event) =>
                  onChange({
                    ...form,
                    afternoonCheckInDeadline: normalizeTime(event.target.value),
                  })
                }
                className={modalInputClass}
              />
            </ModalField>
            <ModalField label="เวลาออกงาน" required>
              <input
                type="text"
                inputMode="numeric"
                placeholder="00:00"
                maxLength={5}
                value={form.checkoutAllowedFrom}
                onChange={(event) =>
                  onChange({
                    ...form,
                    checkoutAllowedFrom: maskTime(event.target.value),
                  })
                }
                onBlur={(event) =>
                  onChange({
                    ...form,
                    checkoutAllowedFrom: normalizeTime(event.target.value),
                  })
                }
                className={modalInputClass}
              />
            </ModalField>
          </div>
        </ModalSection>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ModalField label="ผ่อนผันการมาสาย (นาที)">
            <input
              type="number"
              min="0"
              value={form.lateGraceMinutes}
              onChange={(event) =>
                onChange({ ...form, lateGraceMinutes: event.target.value })
              }
              className={modalInputClass}
            />
          </ModalField>
          <ModalField label="ค่าปรับมาสาย/นาที">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.latePenaltyRatePerMinute}
              onChange={(event) =>
                onChange({
                  ...form,
                  latePenaltyRatePerMinute: event.target.value,
                })
              }
              className={modalInputClass}
            />
          </ModalField>
          <ModalField label="ค่าปรับลืมลงเวลา/รอบ">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.missingLogPenaltyPerDay}
              onChange={(event) =>
                onChange({
                  ...form,
                  missingLogPenaltyPerDay: event.target.value,
                })
              }
              className={modalInputClass}
            />
          </ModalField>
          <ModalField label="วันที่เริ่มใช้">
            <input
              type="date"
              lang="en-GB"
              value={form.effectiveFrom}
              onChange={(event) =>
                onChange({ ...form, effectiveFrom: event.target.value })
              }
              className={modalInputClass}
            />
          </ModalField>
        </div>
      </div>
    </PolicyModal>
  );
}

function RuleFormModal({
  open,
  form,
  saving,
  templates,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: RuleFormState;
  saving: boolean;
  /** ค่าตั้งต้นของแต่ละรอบ อิงเวลาจริงของกะที่เลือกอยู่ */
  templates: RuleFormState[];
  onChange: (form: RuleFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isCheckout =
    form.punchType === "CHECK_OUT" || form.sessionCode === "CHECK_OUT";

  function applySessionCode(code: AttendanceSessionCode) {
    const template = templates.find((item) => item.sessionCode === code);
    if (template) {
      onChange({
        ...form,
        ...template,
        id: form.id,
        sortOrder: form.sortOrder,
      });
      return;
    }
    onChange({ ...form, sessionCode: code, label: sessionLabels[code] });
  }

  return (
    <PolicyModal
      open={open}
      icon={Timer}
      title={form.id ? "แก้ไขรอบลงเวลา" : "เพิ่มรอบลงเวลา"}
      description="ตั้งช่วงเปิดให้กด เวลามาตรฐาน และค่าปรับของรอบนี้"
      saving={saving}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <ModalField label="ประเภทรอบ">
            <select
              value={form.sessionCode}
              onChange={(event) =>
                applySessionCode(event.target.value as AttendanceSessionCode)
              }
              className={modalInputClass}
              disabled={Boolean(form.id)}
            >
              {Object.entries(sessionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </ModalField>
          <ModalField label="ชื่อที่แสดง" required>
            <input
              value={form.label}
              onChange={(event) =>
                onChange({ ...form, label: event.target.value })
              }
              className={modalInputClass}
            />
          </ModalField>
          <ModalField label="ชนิดการกด">
            <select
              value={form.punchType}
              onChange={(event) =>
                onChange({
                  ...form,
                  punchType: event.target.value as AttendanceSessionType,
                })
              }
              className={modalInputClass}
            >
              <option value="CHECK_IN">เข้างาน</option>
              <option value="CHECK_OUT">ออกงาน</option>
            </select>
          </ModalField>
        </div>

        <ModalSection title="เวลาของรอบนี้">
          <div className="grid gap-3 sm:grid-cols-3">
            <ModalField label={isCheckout ? "กดออกงานได้ตั้งแต่" : "เปิดให้กด"}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="00:00"
                maxLength={5}
                value={form.openTime}
                onChange={(event) =>
                  onChange({ ...form, openTime: maskTime(event.target.value) })
                }
                onBlur={(event) =>
                  onChange({
                    ...form,
                    openTime: normalizeTime(event.target.value),
                  })
                }
                className={modalInputClass}
              />
            </ModalField>
            <ModalField
              label={isCheckout ? "เวลาออกงานมาตรฐาน" : "เวลามาตรฐาน"}
            >
              <input
                type="text"
                inputMode="numeric"
                placeholder="00:00"
                maxLength={5}
                value={form.expectedTime}
                onChange={(event) =>
                  onChange({
                    ...form,
                    expectedTime: maskTime(event.target.value),
                  })
                }
                onBlur={(event) =>
                  onChange({
                    ...form,
                    expectedTime: normalizeTime(event.target.value),
                  })
                }
                className={modalInputClass}
              />
            </ModalField>
            <ModalField label="ปิดรอบ">
              <input
                type="text"
                inputMode="numeric"
                placeholder="00:00"
                maxLength={5}
                value={form.closeTime}
                onChange={(event) =>
                  onChange({ ...form, closeTime: maskTime(event.target.value) })
                }
                onBlur={(event) =>
                  onChange({
                    ...form,
                    closeTime: normalizeTime(event.target.value),
                  })
                }
                className={modalInputClass}
              />
            </ModalField>
          </div>
        </ModalSection>

        <div className="grid gap-3 sm:grid-cols-3">
          <ModalField label={isCheckout ? "ออกก่อนเวลา ก่อน" : "ถือว่าสายหลัง"}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="00:00"
              maxLength={5}
              value={isCheckout ? form.earlyBeforeTime : form.lateAfterTime}
              onChange={(event) =>
                onChange(
                  isCheckout
                    ? { ...form, earlyBeforeTime: maskTime(event.target.value) }
                    : { ...form, lateAfterTime: maskTime(event.target.value) },
                )
              }
              onBlur={(event) =>
                onChange(
                  isCheckout
                    ? {
                        ...form,
                        earlyBeforeTime: normalizeTime(event.target.value),
                      }
                    : {
                        ...form,
                        lateAfterTime: normalizeTime(event.target.value),
                      },
                )
              }
              className={modalInputClass}
            />
          </ModalField>
          <ModalField label={isCheckout ? "ออกก่อนหัก/นาที" : "สายหัก/นาที"}>
            <input
              type="number"
              min="0"
              value={
                isCheckout
                  ? form.earlyLeavePenaltyPerMinute
                  : form.latePenaltyPerMinute
              }
              onChange={(event) =>
                onChange(
                  isCheckout
                    ? {
                        ...form,
                        earlyLeavePenaltyPerMinute: event.target.value,
                      }
                    : { ...form, latePenaltyPerMinute: event.target.value },
                )
              }
              className={modalInputClass}
            />
          </ModalField>
          <ModalField label="ลืมกดหัก/รอบ">
            <input
              type="number"
              min="0"
              value={form.missingPenaltyAmount}
              onChange={(event) =>
                onChange({ ...form, missingPenaltyAmount: event.target.value })
              }
              className={modalInputClass}
            />
          </ModalField>
        </div>

        {isCheckout ? (
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold leading-5 text-slate-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span>
              ปุ่มออกงานกดได้ตั้งแต่เวลาเปิดรอบ หากกดก่อนเวลามาตรฐาน
              ระบบจะบันทึกเป็น “ออกก่อนเวลา” และคำนวณค่าปรับตามนาทีจริง
            </span>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <ModalToggle
            label="ต้องกดรอบนี้"
            checked={form.requirePunch}
            onChange={(checked) => onChange({ ...form, requirePunch: checked })}
          />
          <ModalToggle
            label="เก็บเวลากลับช้า"
            checked={form.collectLateOutMinutes}
            onChange={(checked) =>
              onChange({ ...form, collectLateOutMinutes: checked })
            }
          />
          <ModalToggle
            label="สร้าง OT อัตโนมัติ"
            checked={form.autoCreateOt}
            onChange={(checked) => onChange({ ...form, autoCreateOt: checked })}
          />
        </div>

        {form.autoCreateOt ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold leading-5 text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              ไม่แนะนำให้เปิด — กลับช้าไม่เท่ากับ OT การจ่าย OT
              ควรมาจากคำขอและการอนุมัติเท่านั้น
            </span>
          </div>
        ) : null}
      </div>
    </PolicyModal>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

function ScopeChip({ children }: { children: ReactNode }) {
  return <Badge>{children}</Badge>;
}
