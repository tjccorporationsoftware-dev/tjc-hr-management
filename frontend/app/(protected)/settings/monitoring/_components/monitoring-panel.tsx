"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { DateTimeDisplay } from "@/components/common/date-display";
import { Button } from "@/components/kit";
import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import {
  getMonitoringOverview,
} from "@/lib/api";
import type {
  MonitoringDependency,
  MonitoringHealth,
  MonitoringMetrics,
  MonitoringOverview,
  MonitoringReadiness,
  MonitoringStatus,
} from "@/types/monitoring";

function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days} วัน ${hours} ชม.`;
  if (hours > 0) return `${hours} ชม. ${minutes} นาที`;
  return `${minutes} นาที`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "-";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function getStatusStyle(status: MonitoringStatus) {
  if (status === "ok") {
    return {
      label: "ปกติ",
      className: "bg-emerald-50 text-emerald-700 border-emerald-100",
      icon: CheckCircle2,
    };
  }

  if (status === "degraded") {
    return {
      label: "เสื่อมประสิทธิภาพ",
      className: "bg-amber-50 text-amber-700 border-amber-100",
      icon: AlertTriangle,
    };
  }

  return {
    label: "ล่ม",
    className: "bg-red-50 text-red-700 border-red-100",
    icon: XCircle,
  };
}

function getDependencyIcon(name: string) {
  const normalizedName = name.toLowerCase();

  if (normalizedName.includes("database")) return Database;
  if (normalizedName.includes("redis")) return Wifi;
  if (normalizedName.includes("storage") || normalizedName.includes("minio")) {
    return HardDrive;
  }

  return Server;
}

function StatusBadge({ status }: { status: MonitoringStatus }) {
  const style = getStatusStyle(status);
  const Icon = style.icon;

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        style.className,
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" />
      {style.label}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "slate",
}: {
  title: string;
  value: ReactNode;
  description?: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: "slate" | "blue" | "emerald" | "amber" | "red" | "violet";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-600"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-600"
        : tone === "amber"
          ? "bg-amber-50 text-amber-600"
          : tone === "red"
            ? "bg-red-50 text-red-600"
            : tone === "violet"
              ? "bg-violet-50 text-violet-600"
              : "bg-slate-50 text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-500">{title}</div>
        <div className={["rounded-lg p-2", toneClass].join(" ")}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">
        {value}
      </div>
      {description ? (
        <div className="mt-1 text-xs text-slate-500">{description}</div>
      ) : null}
    </div>
  );
}

function DependencyRow({ dependency }: { dependency: MonitoringDependency }) {
  const Icon = getDependencyIcon(dependency.name);

  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 last:border-b-0 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold capitalize text-slate-900">
              {dependency.name}
            </div>
            <StatusBadge status={dependency.status} />
          </div>

          <div className="mt-1 text-sm text-slate-500">
            {dependency.message}
          </div>

          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>Latency: {dependency.latencyMs} ms</span>
            <span>
              Checked: <DateTimeDisplay value={dependency.checkedAt} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonitoringPanel() {
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [health, setHealth] = useState<MonitoringHealth | null>(null);
  const [readiness, setReadiness] = useState<MonitoringReadiness | null>(null);
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const dependencies = readiness?.dependencies ?? metrics?.dependencies ?? [];
  const dependencySummary = overview?.dependencySummary ?? readiness?.dependencySummary ?? metrics?.dependencySummary ?? { total: 0, ok: 0, degraded: 0, down: 0 };

  const heapUsedPercent = useMemo(() => {
    if (!metrics) return 0;

    return Math.round(
      (metrics.process.memory.heapUsedBytes /
        Math.max(metrics.process.memory.heapTotalBytes, 1)) *
        100,
    );
  }, [metrics]);

  const systemMemoryUsedPercent = useMemo(() => {
    if (!metrics) return 0;

    return Math.round(
      (metrics.system.memory.usedBytes /
        Math.max(metrics.system.memory.totalBytes, 1)) *
        100,
    );
  }, [metrics]);

  async function loadData(showToast = false) {
    try {
      setReloading(true);
      setErrorText("");

      const overviewResult = await getMonitoringOverview();

      setOverview(overviewResult);
      setHealth(overviewResult.health);
      setReadiness(overviewResult.readiness);
      setMetrics(overviewResult.metrics);

      if (showToast) {
        toast.success("โหลดสถานะระบบล่าสุดแล้ว");
      }
    } catch {
      setErrorText("โหลด Monitoring ไม่สำเร็จ กรุณาตรวจสอบ API หรือสิทธิ์ผู้ใช้งาน");
      toast.error("โหลด Monitoring ไม่สำเร็จ");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  useEffect(() => {
    void loadData();

    const intervalId = window.setInterval(() => {
      void loadData();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  if (loading) {
    return (
      <LoadingState
        title="กำลังโหลด Monitoring"
        description="ระบบกำลังตรวจสอบ Health, Readiness, Metrics และ Dependency หลัก"
      />
    );
  }

  if (errorText && !readiness && !metrics) {
    return (
      <ErrorState
        title="โหลด Monitoring ไม่สำเร็จ"
        description={errorText}
        action={
          <button
            type="button"
            onClick={() => loadData(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            ลองโหลดใหม่
          </button>
        }
      />
    );
  }

  const overallStatus = metrics?.status ?? readiness?.status ?? health?.status ?? "down";

  return (
    <div className="space-y-5 px-5 py-5">
      {/* แถบเครื่องมือ — หัวเรื่องอยู่ที่หน้าหลักแล้ว */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-slate-500">สถานะรวมของระบบ</span>
          <StatusBadge status={overallStatus} />
        </div>

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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Environment"
          value={metrics?.environment ?? readiness?.environment ?? health?.environment ?? "-"}
          description={`Service: ${metrics?.service ?? readiness?.service ?? health?.service ?? "-"}`}
          icon={Server}
          tone="blue"
        />
        <SummaryCard
          title="Uptime"
          value={formatDuration(
            metrics?.process.uptimeSeconds ?? readiness?.uptimeSeconds ?? health?.uptimeSeconds ?? 0,
          )}
          description="เวลาที่ backend ทำงานต่อเนื่อง"
          icon={Clock3}
          tone="emerald"
        />
        <SummaryCard
          title="Dependency OK"
          value={`${dependencySummary.ok}/${Math.max(dependencySummary.total, 1)}`}
          description={
            dependencySummary.down > 0
              ? `${dependencySummary.down} service ล่ม`
              : dependencySummary.degraded > 0
                ? `${dependencySummary.degraded} service เสื่อมประสิทธิภาพ`
                : "ทุก dependency พร้อมใช้งาน"
          }
          icon={Database}
          tone={dependencySummary.down > 0 ? "red" : dependencySummary.degraded > 0 ? "amber" : "emerald"}
        />
        <SummaryCard
          title="Last Updated"
          value={<DateTimeDisplay value={metrics?.timestamp ?? readiness?.timestamp ?? health?.timestamp} />}
          description="รีเฟรชอัตโนมัติทุก 30 วินาที"
          icon={RefreshCw}
          tone="violet"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="API Errors 24h"
          value={(overview?.audit.apiErrors24h ?? 0).toLocaleString("th-TH")}
          description="นับจาก ApiError หรือ HTTP 500 ใน audit log"
          icon={XCircle}
          tone={(overview?.audit.apiErrors24h ?? 0) > 0 ? "red" : "emerald"}
        />
        <SummaryCard
          title="Failed Login 24h"
          value={(overview?.audit.failedLogins24h ?? 0).toLocaleString("th-TH")}
          description="LOGIN_FAILED / LOGIN_LOCKED / 2FA failed"
          icon={AlertTriangle}
          tone={(overview?.audit.failedLogins24h ?? 0) > 0 ? "amber" : "emerald"}
        />
        <SummaryCard
          title="Critical Actions 24h"
          value={(overview?.audit.criticalActions24h ?? 0).toLocaleString("th-TH")}
          description="เหตุการณ์สำคัญที่ควรตรวจย้อนหลัง"
          icon={ShieldCheck}
          tone={(overview?.audit.criticalActions24h ?? 0) > 0 ? "violet" : "slate"}
        />
        <SummaryCard
          title="Monitoring Source"
          value="Overview API"
          description="ลดการเรียก API monitoring หลายตัวในหน้าเดียว"
          icon={Activity}
          tone="blue"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Node Heap Used"
          value={`${heapUsedPercent}%`}
          description={`${formatBytes(metrics?.process.memory.heapUsedBytes ?? 0)} / ${formatBytes(metrics?.process.memory.heapTotalBytes ?? 0)}`}
          icon={MemoryStick}
          tone={heapUsedPercent >= 85 ? "red" : heapUsedPercent >= 70 ? "amber" : "violet"}
        />
        <SummaryCard
          title="System Memory"
          value={`${systemMemoryUsedPercent}%`}
          description={`${formatBytes(metrics?.system.memory.usedBytes ?? 0)} / ${formatBytes(metrics?.system.memory.totalBytes ?? 0)}`}
          icon={Cpu}
          tone={systemMemoryUsedPercent >= 85 ? "red" : systemMemoryUsedPercent >= 70 ? "amber" : "blue"}
        />
        <SummaryCard
          title="CPU Count"
          value={metrics?.system.cpuCount ?? "-"}
          description={metrics?.system.hostname ? `Host: ${metrics.system.hostname}` : "-"}
          icon={Gauge}
          tone="slate"
        />
        <SummaryCard
          title="Platform"
          value={metrics?.process.platform ?? "-"}
          description={metrics?.process.nodeVersion ? `Node ${metrics.process.nodeVersion}` : "-"}
          icon={Server}
          tone="slate"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent API Errors
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            แสดง error ล่าสุด 24 ชั่วโมงจาก audit log เพื่อใช้ trace ด้วย Request ID
          </p>
        </div>

        {(overview?.audit.recentErrors ?? []).length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            ยังไม่มี API error ใน 24 ชั่วโมงล่าสุด
          </div>
        ) : (
          <div>
            {(overview?.audit.recentErrors ?? []).map((error) => (
              <div key={error.id} className="border-b border-slate-100 px-6 py-4 last:border-b-0">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                        {error.statusCode ?? "N/A"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {error.method ?? "-"}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        Request ID: {error.requestId ?? "-"}
                      </span>
                    </div>
                    <div className="mt-2 break-words text-sm font-semibold text-slate-900">
                      {error.description || error.path || "API error"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {error.path ?? "-"} · <DateTimeDisplay value={error.createdAt} />
                    </div>
                  </div>

                  <Link
                    href="/settings/monitoring?tab=audit"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    เปิดใน Audit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Dependency Status
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            สถานะการเชื่อมต่อระบบหลักที่ Backend ต้องพึ่งพา เช่น Database, Redis และ Storage
          </p>
        </div>

        {dependencies.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            ไม่พบข้อมูล dependency จาก Monitoring API
          </div>
        ) : (
          <div>
            {dependencies.map((dependency) => (
              <DependencyRow key={dependency.name} dependency={dependency} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Process Details
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-xs text-slate-500">PID</div>
              <div className="mt-1 font-semibold text-slate-900">
                {metrics?.process.pid ?? "-"}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Node Version</div>
              <div className="mt-1 font-semibold text-slate-900">
                {metrics?.process.nodeVersion ?? "-"}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Platform</div>
              <div className="mt-1 font-semibold text-slate-900">
                {metrics?.process.platform ?? "-"}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Hostname</div>
              <div className="mt-1 font-semibold text-slate-900">
                {metrics?.system.hostname ?? "-"}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-xs text-slate-500">System</div>
              <div className="mt-1 font-semibold text-slate-900">
                {[metrics?.system.type, metrics?.system.release, metrics?.system.arch]
                  .filter(Boolean)
                  .join(" / ") || "-"}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Last Updated</div>
              <div className="mt-1 font-semibold text-slate-900">
                <DateTimeDisplay value={metrics?.timestamp} />
              </div>
            </div>
          </div>
        </div>

      </section>
    </div>
  );
}
