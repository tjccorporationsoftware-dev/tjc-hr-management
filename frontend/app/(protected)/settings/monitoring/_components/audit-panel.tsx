"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eraser,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { DateTimeDisplay } from "@/components/common/date-display";
import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  Badge,
  Button,
  Checkbox,
  CollapsibleSection,
  Modal,
  Notice,
  SearchInput,
  Select,
  StatTile,
  TextInput,
} from "@/components/kit";
import {
  getAuditCriticalActions,
  getAuditLogs,
  getAuditSummary,
  purgeAuditLogs,
} from "@/lib/api";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import type {
  AuditCriticalActions,
  AuditLogItem,
  AuditLogListParams,
  AuditSummary,
} from "@/types/audit";

/**
 * ประวัติการใช้งาน
 * ----------------
 * คนเปิดหน้านี้คือผู้ดูแลระบบฝั่ง HR ไม่ใช่โปรแกรมเมอร์ ทุกอย่างที่เห็นในแถวจึงต้อง
 * อ่านออกเป็นภาษาคน: ใคร ทำอะไร กับอะไร เมื่อไหร่ ผลเป็นยังไง
 * ของเชิงเทคนิค (request id, path, user agent, metadata) ยังเก็บไว้ครบ แต่ซ่อนอยู่ใน
 * "รายละเอียด" ให้คนที่ต้องตามสาเหตุจริง ๆ เปิดดู
 */

/* ----------------------------------------------------------- แปลเป็นภาษาไทย */

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "เข้าสู่ระบบ",
  LOGIN_FAILED: "เข้าสู่ระบบไม่สำเร็จ",
  LOGIN_LOCKED: "บัญชีถูกล็อก",
  LOGOUT: "ออกจากระบบ",
  TWO_FACTOR_REQUIRED: "ขอรหัสยืนยัน 2 ชั้น",
  TWO_FACTOR_SUCCESS: "ยืนยัน 2 ชั้นสำเร็จ",
  TWO_FACTOR_FAILED: "ยืนยัน 2 ชั้นไม่สำเร็จ",
  VIEW: "ดูข้อมูล",
  CREATE: "สร้าง",
  UPDATE: "แก้ไข",
  DELETE: "ลบ",
  APPROVE: "อนุมัติ",
  REJECT: "ไม่อนุมัติ",
  EXPORT: "ส่งออกไฟล์",
  IMPORT: "นำเข้าไฟล์",
  UPLOAD: "อัปโหลด",
  DOWNLOAD: "ดาวน์โหลด",
};

/** ชื่อโมดูลในระบบ → คำที่ผู้ใช้เรียก ตัวที่ไม่รู้จักโชว์ชื่อเดิม */
const ENTITY_LABELS: Record<string, string> = {
  Auth: "การเข้าสู่ระบบ",
  AuthSession: "เซสชัน",
  User: "ผู้ใช้",
  Role: "บทบาท",
  Permission: "สิทธิ์",
  Employee: "พนักงาน",
  EmployeeProfile: "ข้อมูลพนักงาน",
  EmployeeDocument: "เอกสารพนักงาน",
  EmployeeCompensation: "ค่าจ้าง",
  EmployeeTransfer: "โยกย้าย",
  EmployeeResignation: "ลาออก",
  AttendanceLog: "การลงเวลา",
  AttendanceDailySummary: "สรุปเวลาทำงาน",
  AttendanceDevice: "เครื่องสแกน",
  LeaveRequest: "ใบลา",
  LeaveType: "ประเภทการลา",
  LeaveBalance: "วันลาคงเหลือ",
  OvertimeRequest: "ใบโอที",
  TimeAdjustRequest: "ใบแก้เวลา",
  OffsiteWorkRequest: "ใบทำงานนอกสถานที่",
  DocumentRequest: "คำขอเอกสาร",
  HolidaySwap: "สลับวันหยุด",
  PayrollPeriod: "งวดเงินเดือน",
  PayrollRun: "รอบคำนวณเงินเดือน",
  PayrollItem: "สลิปเงินเดือน",
  PayrollAdjustment: "รายการปรับเงินเดือน",
  PayrollFilingReport: "รายงานนำส่ง",
  Payslip: "สลิปเงินเดือน",
  AuditLog: "ประวัติการใช้งาน",
  DataImport: "นำเข้าข้อมูล",
  Notification: "แจ้งเตือน",
  Company: "บริษัท",
  Branch: "สาขา",
  Department: "แผนก",
  Position: "ตำแหน่ง",
  Complaint: "เรื่องร้องเรียน",
  ApiError: "ข้อผิดพลาดของระบบ",
};

const SECURITY_ACTIONS = new Set([
  "LOGIN",
  "LOGIN_FAILED",
  "LOGIN_LOCKED",
  "LOGOUT",
  "TWO_FACTOR_REQUIRED",
  "TWO_FACTOR_SUCCESS",
  "TWO_FACTOR_FAILED",
]);

/**
 * คำอธิบายที่ backend เขียนมาเป็นอังกฤษ (ตัว interceptor ใช้ "View X list" เป็นแบบเดียวกันหมด)
 * แปลตรงนี้แทนการไล่แก้ทุก controller — คำที่ไม่รู้จักโชว์ตามเดิม ไม่หาย
 */
const DESCRIPTION_LABELS: Record<string, string> = {
  "User login": "เข้าสู่ระบบ",
  "User logout": "ออกจากระบบ",
  "Mobile login": "เข้าสู่ระบบจากแอปมือถือ",
  "Mobile logout": "ออกจากระบบจากแอปมือถือ",
  "Failed password login": "ใส่รหัสผ่านผิด",
  "Account locked": "บัญชีถูกล็อกเพราะใส่รหัสผิดหลายครั้ง",
  "Unhandled or non-audited API error": "ระบบตอบผิดพลาด",
  "View my profile": "ดูข้อมูลส่วนตัวของตัวเอง",
  "View organization summary": "ดูภาพรวมองค์กร",
  "View organization structure summary": "ดูโครงสร้างองค์กร",
  "View payroll run detail": "ดูรายละเอียดรอบคำนวณเงินเดือน",
  "View audit logs": "ดูประวัติการใช้งาน",
  "View audit summary": "ดูสรุปประวัติการใช้งาน",
  "View critical audit actions": "ดูเหตุการณ์สำคัญ",
};

/** คำนามใน "View X list" → ภาษาไทย */
const NOUN_LABELS: Record<string, string> = {
  company: "บริษัท",
  branch: "สาขา",
  department: "แผนก",
  division: "ฝ่าย",
  "employee type": "ประเภทพนักงาน",
  position: "ตำแหน่ง",
  user: "ผู้ใช้",
  role: "บทบาท",
  permission: "สิทธิ์",
  employee: "พนักงาน",
  "payroll period": "งวดเงินเดือน",
  "payroll periods": "งวดเงินเดือน",
  "payroll run": "รอบคำนวณเงินเดือน",
  "payroll runs": "รอบคำนวณเงินเดือน",
  "payroll component": "องค์ประกอบเงินเดือน",
  "payroll components": "องค์ประกอบเงินเดือน",
  "payroll tax years": "ปีภาษี",
  "employee compensations": "ค่าจ้างพนักงาน",
  "employee recurring compensation items": "รายการเงินได้ประจำ",
  "leave request": "ใบลา",
  "leave type": "ประเภทการลา",
  "overtime request": "ใบโอที",
  "holiday": "วันหยุด",
  "work shift": "กะการทำงาน",
  "attendance device": "เครื่องสแกน",
  notification: "แจ้งเตือน",
};

function describe(log: AuditLogItem) {
  const raw = (log.description ?? "").trim();
  if (!raw) return `${actionLabel(log.action)} ${entityLabel(log.entity)}`;
  if (DESCRIPTION_LABELS[raw]) return DESCRIPTION_LABELS[raw];

  const list = raw.match(/^View (.+?) list$/i);
  if (list) return `ดูรายชื่อ${NOUN_LABELS[list[1].toLowerCase()] ?? list[1]}`;

  const view = raw.match(/^View (.+)$/i);
  if (view) return `ดู${NOUN_LABELS[view[1].toLowerCase()] ?? view[1]}`;

  return raw;
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function entityLabel(entity: string) {
  return ENTITY_LABELS[entity] ?? entity;
}

/** ผลของรายการ อ่านจาก HTTP status — คนอ่านไม่ต้องรู้ว่า 401 คืออะไร */
function outcome(statusCode: number | null, action: string) {
  if (action.includes("FAILED") || action.includes("LOCKED")) {
    return { label: "ไม่สำเร็จ", tone: "critical" as const };
  }
  if (!statusCode) return { label: "-", tone: "neutral" as const };
  if (statusCode < 300) return { label: "สำเร็จ", tone: "positive" as const };
  if (statusCode === 401) return { label: "ยังไม่ได้เข้าสู่ระบบ", tone: "warning" as const };
  if (statusCode === 403) return { label: "ไม่มีสิทธิ์", tone: "warning" as const };
  if (statusCode === 404) return { label: "ไม่พบข้อมูล", tone: "warning" as const };
  if (statusCode < 500) return { label: "ข้อมูลไม่ถูกต้อง", tone: "warning" as const };
  return { label: "ระบบขัดข้อง", tone: "critical" as const };
}

function actionTone(action: string): "neutral" | "brand" | "positive" | "warning" | "critical" {
  if (action.includes("FAILED") || action.includes("LOCKED") || action === "DELETE") {
    return "critical";
  }
  if (action === "REJECT") return "warning";
  if (action === "CREATE" || action === "APPROVE" || action === "UPLOAD") {
    return "positive";
  }
  if (SECURITY_ACTIONS.has(action)) return "brand";
  return "neutral";
}

/* ------------------------------------------------------------------ ส่วนย่อย */

function ActionBadge({ action }: { action: string }) {
  return <Badge tone={actionTone(action)}>{actionLabel(action)}</Badge>;
}

function OutcomeBadge({ log }: { log: AuditLogItem }) {
  const result = outcome(log.statusCode, log.action);
  return <Badge tone={result.tone}>{result.label}</Badge>;
}

/**
 * ใครทำ — ตอนล็อกอินยังไม่มี user ผูก ระบบจึงเก็บแค่อีเมล/รหัสที่พิมพ์ไว้ใน metadata
 * ถ้าไม่มีทั้งคู่จริง ๆ ค่อยบอกว่าเป็นระบบทำเอง (งานตั้งเวลา, interceptor)
 */
function whoDidIt(log: AuditLogItem) {
  if (log.user) return log.user.displayName;
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const typed = meta.email ?? meta.username ?? meta.identifier;
  if (typeof typed === "string" && typed) return typed;
  return "ระบบ";
}

/** หนึ่งแถว = หนึ่งเหตุการณ์ อ่านจบในบรรทัดเดียว */
function AuditLogRow({
  log,
  onSelect,
}: {
  log: AuditLogItem;
  onSelect: (log: AuditLogItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(log)}
      className="grid w-full gap-x-4 gap-y-1.5 border-b border-slate-100 px-5 py-3 text-left transition last:border-b-0 hover:bg-brand-50/40 md:grid-cols-[150px_180px_1fr_110px] md:items-center"
    >
      <div className="text-[12.5px] tabular-nums text-slate-500">
        <DateTimeDisplay value={log.createdAt} />
      </div>

      <div className="truncate text-[13px] font-semibold text-slate-800">
        {whoDidIt(log)}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionBadge action={log.action} />
          <span className="text-[12px] text-slate-400">{entityLabel(log.entity)}</span>
        </div>
        <div className="mt-1 truncate text-[13px] text-slate-700">
          {describe(log)}
        </div>
      </div>

      <div className="md:justify-self-end">
        <OutcomeBadge log={log} />
      </div>
    </button>
  );
}

/** รายละเอียดเชิงเทคนิค — เปิดเมื่อต้องตามสาเหตุจริง ๆ */
function AuditDetailModal({
  log,
  onClose,
}: {
  log: AuditLogItem | null;
  onClose: () => void;
}) {
  if (!log) return null;

  const rows: Array<[string, string]> = [
    ["ผู้ทำรายการ", log.user ? `${log.user.displayName} (${log.user.email})` : "ระบบ / ไม่ระบุ"],
    ["สิ่งที่ทำ", `${actionLabel(log.action)} · ${entityLabel(log.entity)}`],
    ["ผลลัพธ์", `${outcome(log.statusCode, log.action).label}${log.statusCode ? ` (HTTP ${log.statusCode})` : ""}`],
    ["เวลา", ""],
    ["IP", log.ipAddress ?? "-"],
    ["รหัสรายการ (Request ID)", log.requestId ?? "-"],
    ["รหัสอ้างอิง (Entity ID)", log.entityId ?? "-"],
    ["เส้นทางที่เรียก", log.method && log.path ? `${log.method} ${log.path}` : (log.path ?? "-")],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={describe(log)}
      description="รายละเอียดของเหตุการณ์นี้ทั้งหมด"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionBadge action={log.action} />
          <OutcomeBadge log={log} />
        </div>

        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[11px] font-semibold text-slate-400">{label}</dt>
              <dd className="mt-0.5 break-words font-medium text-slate-800">
                {label === "เวลา" ? <DateTimeDisplay value={log.createdAt} /> : value}
              </dd>
            </div>
          ))}
        </dl>

        {log.userAgent ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
            <div className="font-semibold text-slate-400">อุปกรณ์ / เบราว์เซอร์</div>
            <div className="mt-0.5 break-words text-slate-600">{log.userAgent}</div>
          </div>
        ) : null}

        <CollapsibleSection title="ข้อมูลดิบ (สำหรับผู้พัฒนา)">
          <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-[11.5px] leading-5 text-slate-100">
            {JSON.stringify(log.metadata ?? {}, null, 2)}
          </pre>
        </CollapsibleSection>
      </div>
    </Modal>
  );
}

/** กล่องยืนยันล้างประวัติ — เลือกช่วงก่อน แล้วค่อยลบ */
function PurgeModal({
  open,
  total,
  onClose,
  onDone,
}: {
  open: boolean;
  total: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [olderThanDays, setOlderThanDays] = useState(90);
  const [busy, setBusy] = useState(false);

  const options = [
    { value: 30, label: "เก่ากว่า 30 วัน", hint: "เก็บเดือนล่าสุดไว้" },
    { value: 90, label: "เก่ากว่า 90 วัน", hint: "เก็บ 3 เดือนล่าสุดไว้ (แนะนำ)" },
    { value: 365, label: "เก่ากว่า 1 ปี", hint: "เก็บทั้งปีไว้" },
    { value: 0, label: "ทั้งหมด", hint: "ลบทุกรายการจนถึงตอนนี้" },
  ];

  async function confirm() {
    try {
      setBusy(true);
      const result = await purgeAuditLogs(olderThanDays);
      toast.success(`ล้างประวัติแล้ว ${result.deleted.toLocaleString("th-TH")} รายการ`);
      onDone();
    } catch {
      toast.error("ล้างประวัติไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      title="ล้างประวัติการใช้งาน"
      description={`ตอนนี้มี ${total.toLocaleString("th-TH")} รายการ เลือกช่วงที่จะลบ`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button
            variant="danger"
            onClick={confirm}
            loading={busy}
            icon={<Eraser className="h-3.5 w-3.5" />}
          >
            {olderThanDays === 0 ? "ลบทั้งหมด" : "ลบตามที่เลือก"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={[
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition",
              olderThanDays === option.value
                ? "border-brand-300 bg-brand-50/60"
                : "border-slate-200 hover:bg-slate-50",
            ].join(" ")}
          >
            <input
              type="radio"
              name="purge-range"
              value={option.value}
              checked={olderThanDays === option.value}
              onChange={() => setOlderThanDays(option.value)}
              className="mt-1 accent-brand-600"
            />
            <span>
              <span className="block text-[13.5px] font-semibold text-slate-800">
                {option.label}
              </span>
              <span className="block text-[12px] text-slate-500">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4">
        <Notice tone={olderThanDays === 0 ? "critical" : "warning"}>
          ลบแล้วกู้คืนไม่ได้ · การล้างครั้งนี้จะถูกบันทึกไว้เป็นประวัติ 1 รายการว่าใครสั่งลบเมื่อไหร่
        </Notice>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- แท็บหลัก */

export function AuditPanel() {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [critical, setCritical] = useState<AuditCriticalActions | null>(null);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [filterVersion, setFilterVersion] = useState(0);

  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  /* ค่าเริ่มต้นแสดงทุกอย่าง — ผู้ใช้อยากเห็นว่าใครทำอะไร ไม่ใช่แค่ล็อกอิน */
  const [securityOnly, setSecurityOnly] = useState(false);
  const [days, setDays] = useState(7);

  const queryParams = useMemo<AuditLogListParams>(
    () => ({
      q,
      action: action || undefined,
      entity: entity || undefined,
      statusCode: statusCode || undefined,
      ipAddress: ipAddress || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      securityOnly,
      page: meta.page,
      pageSize: Math.min(meta.pageSize, 100),
    }),
    [action, dateFrom, dateTo, entity, ipAddress, meta.page, meta.pageSize, q, securityOnly, statusCode],
  );

  async function loadData(showToast = false) {
    try {
      setReloading(true);
      setErrorText("");

      const [summaryResult, criticalResult, logsResult] = await Promise.all([
        getAuditSummary(days),
        getAuditCriticalActions(days, 20),
        getAuditLogs(queryParams),
      ]);

      setSummary(summaryResult);
      setCritical(criticalResult);
      setLogs(logsResult.data);
      setMeta(logsResult.meta);

      if (showToast) toast.success("โหลดประวัติล่าสุดแล้ว");
    } catch {
      setErrorText("โหลดประวัติไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือลองใหม่");
      toast.error("โหลดประวัติไม่สำเร็จ");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  function resetFilter() {
    setQ("");
    setAction("");
    setEntity("");
    setStatusCode("");
    setIpAddress("");
    setDateFrom("");
    setDateTo("");
    setSecurityOnly(false);
    setMeta((current) => ({ ...current, page: 1 }));
    setFilterVersion((current) => current + 1);
  }

  function submitFilter() {
    setMeta((current) => ({ ...current, page: 1 }));
    setFilterVersion((current) => current + 1);
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.page, meta.pageSize, days, filterVersion]);

  if (loading) {
    return (
      <LoadingState
        title="กำลังโหลดประวัติการใช้งาน"
        description="ดึงรายการล่าสุดว่าใครทำอะไรในระบบ"
      />
    );
  }

  if (errorText && logs.length === 0 && !summary) {
    return (
      <ErrorState
        title="โหลดประวัติไม่สำเร็จ"
        description={errorText}
        action={<Button onClick={() => loadData(true)}>ลองโหลดใหม่</Button>}
      />
    );
  }

  const recentCritical = (critical?.recentLogs ?? []).slice(0, 5);
  const hasAdvancedFilter = Boolean(entity || statusCode || ipAddress);

  return (
    <div className="space-y-5 px-5 py-5">
      {/* แถบเครื่องมือ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-slate-500">
          ใครเข้าระบบ ทำอะไร กับข้อมูลไหน — เรียงจากล่าสุด
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="w-40"
            aria-label="ช่วงเวลาของตัวเลขสรุป"
          >
            <option value={1}>สรุป 1 วันล่าสุด</option>
            <option value={7}>สรุป 7 วันล่าสุด</option>
            <option value={30}>สรุป 30 วันล่าสุด</option>
            <option value={90}>สรุป 90 วันล่าสุด</option>
          </Select>

          <Button
            variant="secondary"
            onClick={() => loadData(true)}
            disabled={reloading}
            icon={
              reloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
          >
            โหลดใหม่
          </Button>

          <Button
            variant="danger"
            onClick={() => setPurgeOpen(true)}
            icon={<Eraser className="h-3.5 w-3.5" />}
          >
            ล้างประวัติ
          </Button>
        </div>
      </div>

      {/* ตัวเลขสรุป */}
      <div className="grid divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <StatTile
          icon={<History className="h-4 w-4" />}
          label={`รายการทั้งหมด ${days} วัน`}
          value={(summary?.total ?? 0).toLocaleString("th-TH")}
        />
        <StatTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="เข้าระบบไม่สำเร็จ"
          value={(critical?.failedLogins ?? 0).toLocaleString("th-TH")}
          helper="รหัสผิด / บัญชีถูกล็อก / 2 ชั้นไม่ผ่าน"
        />
        <StatTile
          icon={<XCircle className="h-4 w-4" />}
          label="ระบบขัดข้อง"
          value={(critical?.apiErrors ?? 0).toLocaleString("th-TH")}
          helper="รายการที่ระบบตอบผิดพลาด"
        />
        <StatTile
          icon={<ShieldAlert className="h-4 w-4" />}
          label="เหตุการณ์สำคัญ"
          value={(critical?.totalCritical ?? 0).toLocaleString("th-TH")}
          helper={`เงินเดือน ${(critical?.payrollActions ?? 0).toLocaleString("th-TH")} · ลงเวลา ${(critical?.attendanceActions ?? 0).toLocaleString("th-TH")}`}
        />
      </div>

      {/* เหตุการณ์ที่ควรดู */}
      {recentCritical.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 border-b border-amber-100 px-4 py-2.5">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <span className="text-[13px] font-semibold text-amber-900">
              เหตุการณ์สำคัญล่าสุด
            </span>
            <span className="text-[12px] text-amber-700">
              — เงินเดือน การลงเวลา การเข้าระบบที่ผิดปกติ และการตั้งค่า
            </span>
          </div>
          <div className="divide-y divide-amber-100">
            {recentCritical.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelectedLog(log)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left text-[13px] transition hover:bg-amber-100/60"
              >
                <span className="w-[150px] shrink-0 tabular-nums text-slate-500">
                  <DateTimeDisplay value={log.createdAt} />
                </span>
                <span className="font-semibold text-slate-800">{whoDidIt(log)}</span>
                <ActionBadge action={log.action} />
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {describe(log)}
                </span>
                <OutcomeBadge log={log} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ตัวกรอง */}
      <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
          <SearchInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") submitFilter(); }}
            placeholder="ค้นหาชื่อคน ข้อความ หรือรหัสรายการ"
          />

          <Select value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">ทุกการกระทำ</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>

          <ThaiDateInput
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            placeholder="ตั้งแต่วันที่"
          />

          <ThaiDateInput
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            placeholder="ถึงวันที่"
          />

          <div className="flex gap-2">
            <Button variant="primary" onClick={submitFilter}>ค้นหา</Button>
            <Button onClick={resetFilter}>ล้างตัวกรอง</Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Checkbox
            label="เฉพาะการเข้า-ออกระบบ"
            checked={securityOnly}
            onChange={(event) => {
              setSecurityOnly(event.target.checked);
              setMeta((current) => ({ ...current, page: 1 }));
              setFilterVersion((current) => current + 1);
            }}
          />
        </div>

        <CollapsibleSection
          title="ตัวกรองเพิ่มเติม (สำหรับผู้พัฒนา)"
          defaultOpen={hasAdvancedFilter}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput
              value={entity}
              onChange={(event) => setEntity(event.target.value)}
              placeholder="โมดูล เช่น User, PayrollRun"
            />
            <TextInput
              value={statusCode}
              onChange={(event) => setStatusCode(event.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="HTTP status เช่น 500"
            />
            <TextInput
              value={ipAddress}
              onChange={(event) => setIpAddress(event.target.value)}
              placeholder="IP address"
            />
          </div>
        </CollapsibleSection>
      </section>

      {/* รายการ */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-5 py-3 md:flex-row md:items-center">
          <div className="text-[13px] text-slate-600">
            พบ <span className="font-semibold text-slate-900">{meta.total.toLocaleString("th-TH")}</span> รายการ
            {securityOnly ? " (เฉพาะการเข้า-ออกระบบ)" : ""}
          </div>

          <Select
            value={meta.pageSize}
            onChange={(event) =>
              setMeta((current) => ({
                ...current,
                page: 1,
                pageSize: Math.min(Number(event.target.value), 100),
              }))
            }
            className="w-32"
            aria-label="จำนวนต่อหน้า"
          >
            <option value={20}>20 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </Select>
        </div>

        {/* หัวตาราง — เฉพาะจอกว้าง */}
        <div className="hidden border-b border-slate-100 bg-slate-50/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:grid md:grid-cols-[150px_180px_1fr_110px] md:gap-x-4">
          <div>เวลา</div>
          <div>ใคร</div>
          <div>ทำอะไร</div>
          <div className="justify-self-end">ผล</div>
        </div>

        {logs.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-slate-500">
            ไม่พบรายการตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <div>
            {logs.map((log) => (
              <AuditLogRow key={log.id} log={log} onSelect={setSelectedLog} />
            ))}
          </div>
        )}

        <div className="flex flex-col justify-between gap-2 border-t border-slate-200 px-5 py-3 md:flex-row md:items-center">
          <div className="text-[13px] text-slate-500">
            หน้า {meta.page.toLocaleString("th-TH")} จาก {Math.max(meta.totalPages, 1).toLocaleString("th-TH")}
          </div>

          <div className="flex gap-2">
            <Button
              disabled={meta.page <= 1}
              onClick={() => {
                setMeta((current) => ({ ...current, page: Math.max(current.page - 1, 1) }));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              disabled={meta.page >= meta.totalPages}
              onClick={() => {
                setMeta((current) => ({ ...current, page: current.page + 1 }));
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      </section>

      <AuditDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />

      <PurgeModal
        open={purgeOpen}
        total={meta.total}
        onClose={() => setPurgeOpen(false)}
        onDone={() => {
          setPurgeOpen(false);
          setMeta((current) => ({ ...current, page: 1 }));
          void loadData();
        }}
      />
    </div>
  );
}
