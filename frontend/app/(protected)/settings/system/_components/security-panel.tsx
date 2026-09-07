"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Laptop,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMyAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
} from "@/lib/api";
import { Button, StatTile } from "@/components/kit";
import type { AuthSession, AuthSessionListSummary } from "@/types/auth";

type ConfirmDialogState = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "blue" | "red" | "emerald" | "amber";
  onConfirm: () => Promise<void> | void;
};

const CARD_CLASS =
  "rounded-[26px] border border-slate-200/80 bg-white shadow-[0_14px_35px_rgba(15,23,42,0.045)]";

const emptySessionSummary: AuthSessionListSummary = {
  total: 0,
  active: 0,
  inactive: 0,
  revoked: 0,
  expired: 0,
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBrowserLabel(userAgent: string | null) {
  if (!userAgent) return "Unknown Browser";

  if (userAgent.includes("Edg")) return "Microsoft Edge";
  if (userAgent.includes("Chrome")) return "Google Chrome";
  if (userAgent.includes("Firefox")) return "Mozilla Firefox";
  if (userAgent.includes("Safari")) return "Safari";

  return "Browser";
}

function getDeviceLabel(userAgent: string | null) {
  if (!userAgent) return "Unknown Device";

  if (userAgent.includes("Windows")) return "Windows";
  if (userAgent.includes("Macintosh")) return "macOS";
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  if (userAgent.includes("Android")) return "Android";

  return "Device";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function SecurityPanel() {
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionSummary, setSessionSummary] = useState<AuthSessionListSummary>(emptySessionSummary);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  );

  const activeSessionCount = sessionSummary.active;
  const inactiveSessionCount = sessionSummary.inactive;
  const actionLoading = revokingAll || revokingId !== null;

  async function loadSessions(showToast = false) {
    try {
      setReloading(true);

      const result = await getMyAuthSessions();
      setSessions(result.data);
      setSessionSummary(result.summary);

      if (showToast) {
        toast.success("โหลด Session ล่าสุดแล้ว");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "โหลดรายการ Session ไม่สำเร็จ"));
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  function openRevokeSessionDialog(session: AuthSession) {
    setConfirmDialog({
      title: "ยกเลิก Session นี้?",
      description:
        "หากเป็นอุปกรณ์ที่กำลังใช้งาน ผู้ใช้อาจต้องเข้าสู่ระบบใหม่ กรุณาตรวจสอบข้อมูลก่อนยืนยัน",
      confirmLabel: "ยืนยันยกเลิก",
      tone: "red",
      onConfirm: async () => {
        try {
          setRevokingId(session.id);

          await revokeAuthSession(session.id);
          toast.success("ยกเลิก Session สำเร็จ");
          await loadSessions();
          setConfirmDialog(null);
        } catch (error) {
          toast.error(getErrorMessage(error, "ยกเลิก Session ไม่สำเร็จ"));
        } finally {
          setRevokingId(null);
        }
      },
    });
  }

  function openRevokeOthersDialog() {
    setConfirmDialog({
      title: "ออกจากระบบอุปกรณ์อื่นทั้งหมด?",
      description:
        "Session ปัจจุบันจะยังใช้งานได้ แต่อุปกรณ์อื่นทั้งหมดจะถูกยกเลิกและต้องเข้าสู่ระบบใหม่",
      confirmLabel: "ออกจากระบบอุปกรณ์อื่น",
      tone: "red",
      onConfirm: async () => {
        try {
          setRevokingAll(true);

          const result = await revokeOtherAuthSessions();
          toast.success(
            `ยกเลิก Session อื่นแล้ว ${result.revokedCount ?? 0} รายการ`,
          );
          await loadSessions();
          setConfirmDialog(null);
        } catch (error) {
          toast.error(getErrorMessage(error, "ยกเลิก Session อื่นไม่สำเร็จ"));
        } finally {
          setRevokingAll(false);
        }
      },
    });
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  return (
    <>
      {/* ตัวเลขสรุป + ปุ่มจัดการ — หัวเรื่องอยู่ที่หน้าหลักแล้ว */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="grid grid-cols-[repeat(3,minmax(11rem,max-content))] divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <StatTile
            label="Session ทั้งหมด"
            value={sessionSummary.total.toLocaleString("th-TH")}
            helper="รวมที่หมดอายุแล้ว"
          />
          <StatTile
            label="กำลังใช้งาน"
            value={activeSessionCount.toLocaleString("th-TH")}
            tone="positive"
            helper="อุปกรณ์ที่ยังเข้าระบบอยู่"
          />
          <StatTile
            label="ยกเลิก / หมดอายุ"
            value={inactiveSessionCount.toLocaleString("th-TH")}
            helper="เข้าใช้งานต่อไม่ได้แล้ว"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => loadSessions(true)}
            disabled={reloading}
            icon={
              reloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
          >
            โหลดข้อมูล
          </Button>

          <Button
            onClick={openRevokeOthersDialog}
            disabled={revokingAll || activeSessionCount <= 1}
            icon={
              revokingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )
            }
          >
            ออกจากระบบอุปกรณ์อื่น
          </Button>
        </div>
      </div>

        <section className={`${CARD_CLASS} overflow-hidden`}>
          <div className="border-b border-slate-100 bg-white px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Laptop className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  รายการ Session
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Session ที่ยังไม่หมดอายุจะแสดงอยู่ในรายการนี้
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 px-6 py-14 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              กำลังโหลดข้อมูล...
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3 p-4">
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  revoking={revokingId === session.id}
                  onRevoke={() => openRevokeSessionDialog(session)}
                />
              ))}
            </div>
          )}
        </section>
      <ConfirmDialog
        state={confirmDialog}
        loading={actionLoading}
        onClose={() => {
          if (!actionLoading) setConfirmDialog(null);
        }}
        onConfirm={() => {
          void confirmDialog?.onConfirm();
        }}
      />
    </>
  );
}

function SessionItem({
  session,
  revoking,
  onRevoke,
}: {
  session: AuthSession;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const active = session.isActive;

  return (
    <div
      className={[
        "rounded-[24px] border bg-white px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.06)]",
        active ? "border-blue-100" : "border-slate-100 bg-slate-50/70",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div
            className={[
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
              active
                ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100"
                : "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
            ].join(" ")}
          >
            <Laptop className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-slate-900">
                {getBrowserLabel(session.userAgent)} ·{" "}
                {getDeviceLabel(session.userAgent)}
              </div>

              {active ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Inactive
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Globe2 className="h-3.5 w-3.5 text-blue-600" />
                IP: {session.ipAddress ?? "-"}
              </span>

              <span>เข้าสู่ระบบ: {formatDateTime(session.createdAt)}</span>
              <span>หมดอายุ: {formatDateTime(session.expiresAt)}</span>

              {session.revokedAt ? (
                <span>ยกเลิกเมื่อ: {formatDateTime(session.revokedAt)}</span>
              ) : null}
            </div>

            <div className="mt-2 max-w-4xl truncate text-xs text-slate-400">
              {session.userAgent ?? "-"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRevoke}
          disabled={!active || revoking}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-rose-100 bg-white px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {revoking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-blue-50 text-blue-600">
        <Laptop className="h-7 w-7" />
      </div>

      <div className="mt-4 text-sm font-medium text-slate-700">
        ไม่พบ Session
      </div>

      <div className="mt-1 text-xs text-slate-500">
        เมื่อมีการเข้าสู่ระบบ รายการ Session จะแสดงที่นี่
      </div>
    </div>
  );
}

function ConfirmDialog({
  state,
  loading,
  onClose,
  onConfirm,
}: {
  state: ConfirmDialogState | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!state) return null;

  const tone = state.tone ?? "blue";

  const iconClass =
    tone === "red"
      ? "bg-rose-50 text-rose-600 ring-rose-100"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
        : tone === "amber"
          ? "bg-amber-50 text-amber-600 ring-amber-100"
          : "bg-blue-50 text-blue-600 ring-blue-100";

  const confirmClass =
    tone === "red"
      ? "bg-rose-600 text-white shadow-[0_12px_26px_rgba(225,29,72,0.22)] hover:bg-rose-700"
      : tone === "emerald"
        ? "bg-emerald-600 text-white shadow-[0_12px_26px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
        : tone === "amber"
          ? "bg-amber-500 text-white shadow-[0_12px_26px_rgba(245,158,11,0.22)] hover:bg-amber-600"
          : "bg-blue-600 text-white shadow-[0_12px_26px_rgba(37,99,235,0.24)] hover:bg-blue-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 px-5 py-5">
          <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-blue-200/35 blur-3xl" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={[
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] ring-1",
                  iconClass,
                ].join(" ")}
              >
                {tone === "red" ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <ShieldCheck className="h-6 w-6" />
                )}
              </div>

              <div>
                <h2 className="text-[18px] font-semibold leading-7 tracking-[-0.025em] text-slate-900">
                  {state.title}
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {state.description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={[
              "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
              confirmClass,
            ].join(" ")}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}