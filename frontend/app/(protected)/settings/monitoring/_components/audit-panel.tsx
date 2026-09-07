"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { DateTimeDisplay } from "@/components/common/date-display";
import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { Button, Select } from "@/components/kit";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { getAuditCriticalActions, getAuditLogs, getAuditSummary } from "@/lib/api";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import type {
  AuditCriticalActions,
  AuditLogItem,
  AuditLogListParams,
  AuditSummary,
} from "@/types/audit";

const ACTION_OPTIONS = [
  "",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGIN_LOCKED",
  "LOGOUT",
  "TWO_FACTOR_REQUIRED",
  "TWO_FACTOR_SUCCESS",
  "TWO_FACTOR_FAILED",
  "VIEW",
  "CREATE",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "REJECT",
  "EXPORT",
  "IMPORT",
  "UPLOAD",
  "DOWNLOAD",
];

function getStatusBadge(statusCode: number | null) {
  if (!statusCode) {
    return {
      label: "N/A",
      className: "bg-slate-100 text-slate-500",
      icon: Clock3,
    };
  }

  if (statusCode >= 200 && statusCode < 300) {
    return {
      label: String(statusCode),
      className: "bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return {
      label: String(statusCode),
      className: "bg-amber-50 text-amber-700",
      icon: AlertTriangle,
    };
  }

  if (statusCode >= 500) {
    return {
      label: String(statusCode),
      className: "bg-red-50 text-red-700",
      icon: XCircle,
    };
  }

  return {
    label: String(statusCode),
    className: "bg-slate-100 text-slate-500",
    icon: Clock3,
  };
}

function getActionClass(action: string) {
  if (
    action.includes("FAILED") ||
    action.includes("LOCKED") ||
    action === "DELETE" ||
    action === "REJECT"
  ) {
    return "bg-red-50 text-red-700 border-red-100";
  }

  if (
    action.includes("LOGIN") ||
    action.includes("TWO_FACTOR") ||
    action === "LOGOUT"
  ) {
    return "bg-blue-50 text-blue-700 border-blue-100";
  }

  if (action === "CREATE" || action === "APPROVE" || action === "UPLOAD") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }

  if (action === "UPDATE" || action === "EXPORT" || action === "IMPORT") {
    return "bg-violet-50 text-violet-700 border-violet-100";
  }

  return "bg-slate-50 text-slate-600 border-slate-200";
}

function StatusBadge({ statusCode }: { statusCode: number | null }) {
  const badge = getStatusBadge(statusCode);
  const Icon = badge.icon;

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        badge.className,
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" />
      {badge.label}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        getActionClass(action),
      ].join(" ")}
    >
      {action}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone = "slate",
}: {
  title: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  tone?: "slate" | "blue" | "emerald" | "red";
}) {
  const toneClass =
    tone === "blue"
      ? "text-blue-600 bg-blue-50"
      : tone === "emerald"
        ? "text-emerald-600 bg-emerald-50"
        : tone === "red"
          ? "text-red-600 bg-red-50"
          : "text-slate-600 bg-slate-50";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{title}</div>
        <div className={["rounded-lg p-2", toneClass].join(" ")}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-900">
        {value.toLocaleString("th-TH")}
      </div>
    </div>
  );
}

function AuditLogRow({
  log,
  onSelect,
}: {
  log: AuditLogItem;
  onSelect: (log: AuditLogItem) => void;
}) {
  return (
    <div className="border-b border-slate-100 px-6 py-5 last:border-b-0">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ActionBadge action={log.action} />
            <StatusBadge statusCode={log.statusCode} />

            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {log.entity}
            </span>

            {log.method ? (
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                {log.method}
              </span>
            ) : null}
          </div>

          <div className="mt-3 text-sm font-semibold text-slate-900">
            {log.description || `${log.action} ${log.entity}`}
          </div>

          <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-3">
            <div>
              เวลา: <DateTimeDisplay value={log.createdAt} />
            </div>
            <div>IP: {log.ipAddress ?? "-"}</div>
            <div>Request ID: {log.requestId ?? "-"}</div>
            <div>Entity ID: {log.entityId ?? "-"}</div>
            <div>User ID: {log.userId ?? "-"}</div>
            <div>Path: {log.path ?? "-"}</div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {log.user
                ? `${log.user.displayName} (${log.user.email})`
                : "System / Anonymous"}
            </span>
          </div>

          {log.userAgent ? (
            <div className="mt-2 truncate text-xs text-slate-400">
              {log.userAgent}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onSelect(log)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <Eye className="h-4 w-4" />
          รายละเอียด
        </button>
      </div>
    </div>
  );
}

function AuditDetailDrawer({
  log,
  onClose,
}: {
  log: AuditLogItem | null;
  onClose: () => void;
}) {
  if (!log) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 p-3 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge action={log.action} />
              <StatusBadge statusCode={log.statusCode} />
            </div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              {log.description || `${log.action} ${log.entity}`}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              <DateTimeDisplay value={log.createdAt} />
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="ปิดรายละเอียด"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Entity", log.entity],
              ["Entity ID", log.entityId ?? "-"],
              ["User", log.user ? `${log.user.displayName} (${log.user.email})` : "System / Anonymous"],
              ["User ID", log.userId ?? "-"],
              ["Method", log.method ?? "-"],
              ["Path", log.path ?? "-"],
              ["IP Address", log.ipAddress ?? "-"],
              ["Request ID", log.requestId ?? "-"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </div>
                <div className="mt-1 break-words text-sm font-semibold text-slate-800">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              User Agent
            </div>
            <div className="mt-1 break-words text-sm text-slate-700">
              {log.userAgent ?? "-"}
            </div>
          </div>

          <div className="rounded-lg bg-slate-950 p-4 text-slate-100">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Metadata
            </div>
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
              {JSON.stringify(log.metadata ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuditPanel() {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [criticalActions, setCriticalActions] = useState<AuditCriticalActions | null>(null);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [meta, setMeta] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [filterVersion, setFilterVersion] = useState(0);

  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [securityOnly, setSecurityOnly] = useState(true);
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
    [
      action,
      dateFrom,
      dateTo,
      entity,
      ipAddress,
      meta.page,
      meta.pageSize,
      q,
      securityOnly,
      statusCode,
    ],
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
      setCriticalActions(criticalResult);
      setLogs(logsResult.data);
      setMeta(logsResult.meta);

      if (showToast) {
        toast.success("โหลด Audit Log ล่าสุดแล้ว");
      }
    } catch {
      setErrorText("โหลด Audit Log ไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือเงื่อนไขการค้นหา");
      toast.error("โหลด Audit Log ไม่สำเร็จ");
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
    setSecurityOnly(true);
    setMeta((current) => ({
      ...current,
      page: 1,
    }));
    setFilterVersion((current) => current + 1);
  }

  function submitFilter() {
    setMeta((current) => ({
      ...current,
      page: 1,
    }));
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
        title="กำลังโหลด Audit Log"
        description="ระบบกำลังดึงประวัติการใช้งานและเหตุการณ์ความปลอดภัยล่าสุด"
      />
    );
  }

  if (errorText && logs.length === 0 && !summary) {
    return (
      <ErrorState
        title="โหลด Audit Log ไม่สำเร็จ"
        description={errorText}
        action={
          <Button onClick={() => loadData(true)}>ลองโหลดใหม่</Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5 px-5 py-5">
      {/* แถบเครื่องมือ — หัวเรื่องอยู่ที่หน้าหลักแล้ว */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-slate-500">
          ประวัติการใช้งาน การเข้าสู่ระบบ และการเปลี่ยนแปลงข้อมูล
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="w-40"
            aria-label="ช่วงเวลา"
          >
            <option value={1}>ย้อนหลัง 1 วัน</option>
            <option value={7}>ย้อนหลัง 7 วัน</option>
            <option value={30}>ย้อนหลัง 30 วัน</option>
            <option value={90}>ย้อนหลัง 90 วัน</option>
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
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Audit Logs"
          value={summary?.total ?? 0}
          icon={History}
          tone="blue"
        />
        <SummaryCard
          title="Critical Actions"
          value={criticalActions?.totalCritical ?? 0}
          icon={ShieldAlert}
          tone="red"
        />
        <SummaryCard
          title="API Errors"
          value={criticalActions?.apiErrors ?? 0}
          icon={XCircle}
          tone="red"
        />
        <SummaryCard
          title="Failed Login / 2FA"
          value={criticalActions?.failedLogins ?? 0}
          icon={AlertTriangle}
          tone="slate"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Critical Action Watchlist
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              เหตุการณ์สำคัญที่ควรตรวจเร็ว เช่น API error, login failed, payroll, attendance และการตั้งค่าระบบ
            </p>
          </div>

          <div className="grid gap-2 text-sm md:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">Payroll Actions</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {(criticalActions?.payrollActions ?? 0).toLocaleString("th-TH")}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">Attendance Actions</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {(criticalActions?.attendanceActions ?? 0).toLocaleString("th-TH")}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">ช่วงเวลาที่ตรวจ</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {criticalActions?.days ?? days} วัน
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Top Critical Entities</div>
            <div className="mt-3 space-y-2">
              {(criticalActions?.byEntity ?? []).slice(0, 6).map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{item.key}</span>
                  <span className="font-semibold text-slate-900">{item.count.toLocaleString("th-TH")}</span>
                </div>
              ))}
              {(criticalActions?.byEntity ?? []).length === 0 ? (
                <div className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">
                  ยังไม่มี critical entity ในช่วงเวลานี้
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Recent Critical Logs</div>
            <div className="mt-3 space-y-2">
              {(criticalActions?.recentLogs ?? []).slice(0, 5).map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className="w-full rounded-lg bg-white px-3 py-3 text-left transition hover:bg-blue-50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionBadge action={log.action} />
                    <StatusBadge statusCode={log.statusCode} />
                    <span className="text-xs font-semibold text-slate-500">{log.entity}</span>
                  </div>
                  <div className="mt-2 truncate text-sm font-medium text-slate-800">
                    {log.description || log.path || log.requestId || "Critical action"}
                  </div>
                </button>
              ))}
              {(criticalActions?.recentLogs ?? []).length === 0 ? (
                <div className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">
                  ยังไม่มี critical log ในช่วงเวลานี้
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Filter className="h-4 w-4 text-blue-600" />
          ตัวกรอง
        </div>

        <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-[1.4fr_1fr_1fr_0.8fr]">
          <div className="relative lg:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="ค้นหา description, path, requestId, IP..."
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          >
            {ACTION_OPTIONS.map((item) => (
              <option key={item || "all"} value={item}>
                {item || "ทุก Action"}
              </option>
            ))}
          </select>

          <input
            value={entity}
            onChange={(event) => setEntity(event.target.value)}
            placeholder="Entity/Module เช่น User, Auth"
            className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />

          <input
            value={statusCode}
            onChange={(event) =>
              setStatusCode(event.target.value.replace(/\D/g, "").slice(0, 3))
            }
            placeholder="Status"
            className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            value={ipAddress}
            onChange={(event) => setIpAddress(event.target.value)}
            placeholder="IP Address"
            className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />

          <ThaiDateInput
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            placeholder="วันที่เริ่มต้น"
          />

          <ThaiDateInput
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            placeholder="วันที่สิ้นสุด"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitFilter}
              className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              ค้นหา
            </button>

            <button
              type="button"
              onClick={resetFilter}
              className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ล้าง
            </button>
          </div>
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={securityOnly}
            onChange={(event) => {
              setSecurityOnly(event.target.checked);
              setMeta((current) => ({
                ...current,
                page: 1,
              }));
            }}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          แสดงเฉพาะ Security Events
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-6 py-5 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              รายการ Audit Log
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              ทั้งหมด {meta.total.toLocaleString("th-TH")} รายการ
            </p>
          </div>

          <select
            value={meta.pageSize}
            onChange={(event) =>
              setMeta((current) => ({
                ...current,
                page: 1,
                pageSize: Math.min(Number(event.target.value), 100),
              }))
            }
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          >
            <option value={10}>10 / หน้า</option>
            <option value={20}>20 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </select>
        </div>

        {logs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            ไม่พบ Audit Log ตามเงื่อนไข
          </div>
        ) : (
          <div>
            {logs.map((log) => (
              <AuditLogRow key={log.id} log={log} onSelect={setSelectedLog} />
            ))}
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-6 py-4 md:flex-row md:items-center">
          <div className="text-sm text-slate-500">
            หน้า {meta.page.toLocaleString("th-TH")} / {" "}
            {Math.max(meta.totalPages, 1).toLocaleString("th-TH")}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => {
                setMeta((current) => ({ ...current, page: Math.max(current.page - 1, 1), }));
                scrollPagerToTop();
              }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ก่อนหน้า
            </button>

            <button
              type="button"
              disabled={meta.page >= meta.totalPages}
              onClick={() => {
                setMeta((current) => ({ ...current, page: current.page + 1, }));
                scrollPagerToTop();
              }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
        </div>
      </section>

      <AuditDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
