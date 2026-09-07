"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";

import {
  getNotificationSummary,
  getPublicFileUrl,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  openNotificationStream,
} from "@/lib/api";
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationListStatus,
  NotificationSummaryResponse,
} from "@/types/notification";

const PAGE_SIZE = 20;
const NOTIFICATION_SUMMARY_UPDATED_EVENT = "hr_notification_summary_updated";
const STATUS_TABS: Array<{ value: NotificationListStatus; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "unread", label: "ยังไม่อ่าน" },
  { value: "read", label: "อ่านแล้ว" },
];

const STATUS_DESCRIPTIONS: Record<NotificationListStatus, string> = {
  all: "แสดงแจ้งเตือนทั้งหมด ทั้งที่อ่านแล้วและยังไม่อ่าน",
  unread: "แสดงเฉพาะแจ้งเตือนที่ยังไม่อ่าน เพื่อให้จัดการงานที่ต้องดูต่อได้เร็วขึ้น",
  read: "แสดงประวัติแจ้งเตือนที่อ่านแล้ว สำหรับย้อนกลับมาตรวจสอบภายหลัง",
};

type LoadOptions = {
  silent?: boolean;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function formatNotificationTime(value?: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSeverityIcon(item: NotificationItem) {
  switch (item.severity) {
    case "SUCCESS":
      return <CheckCircle2 className="h-5 w-5" />;
    case "DANGER":
      return <XCircle className="h-5 w-5" />;
    case "WARNING":
      return <AlertTriangle className="h-5 w-5" />;
    default:
      return <Info className="h-5 w-5" />;
  }
}

function getSeverityClass(item: NotificationItem) {
  switch (item.severity) {
    case "SUCCESS":
      return "bg-emerald-50 text-emerald-600 ring-emerald-100";
    case "DANGER":
      return "bg-rose-50 text-rose-600 ring-rose-100";
    case "WARNING":
      return "bg-amber-50 text-amber-600 ring-amber-100";
    default:
      return "bg-sky-50 text-sky-600 ring-sky-100";
  }
}

function getSeverityLabel(item: NotificationItem) {
  switch (item.severity) {
    case "SUCCESS":
      return "สำเร็จ";
    case "DANGER":
      return "สำคัญมาก";
    case "WARNING":
      return "ควรตรวจสอบ";
    default:
      return "ทั่วไป";
  }
}

function getTypeLabel(type?: string) {
  if (!type) return "แจ้งเตือน";

  if (type.includes("TIME_ADJUST")) return "ขอแก้เวลา";
  if (type.includes("LEAVE")) return "การลา";
  if (type.includes("OVERTIME")) return "OT";
  if (type.includes("OFFSITE")) return "Offsite Work";
  if (type.includes("DOCUMENT")) return "เอกสาร";
  if (type.includes("ATTENDANCE")) return "เวลาทำงาน";
  if (type.includes("PAYROLL")) return "เงินเดือน";

  return "แจ้งเตือน";
}

function getEmptyState(status: NotificationListStatus) {
  if (status === "unread") {
    return {
      title: "ไม่มีแจ้งเตือนที่ยังไม่อ่าน",
      description: "ตอนนี้ไม่มีรายการใหม่ที่ต้องเปิดอ่านเพิ่มเติม",
    };
  }

  if (status === "read") {
    return {
      title: "ยังไม่มีประวัติแจ้งเตือนที่อ่านแล้ว",
      description: "เมื่อคุณกดอ่านแจ้งเตือน รายการจะมาแสดงในแท็บนี้",
    };
  }

  return {
    title: "ยังไม่มีแจ้งเตือน",
    description: "เมื่อมีคำขออนุมัติหรือรายการผิดปกติ ระบบจะแสดงที่นี่",
  };
}

function hasDetailLink(item: NotificationItem) {
  return Boolean(item.href && item.href !== "#");
}

function getActorInitials(actor?: NotificationItem["actor"]) {
  if (!actor?.displayName) return "";

  const compactName = actor.displayName.replace(/\s+/g, "").trim();

  if (!compactName) return "";

  return compactName.slice(0, 2).toUpperCase();
}

function getActorSubtitle(actor?: NotificationItem["actor"]) {
  if (!actor) return "";

  return [actor.employeeCode, actor.departmentName, actor.position]
    .filter(Boolean)
    .join(" · ");
}

function NotificationAvatar({ item }: { item: NotificationItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const actorAvatarUrl = item.actor?.avatarUrl
    ? getPublicFileUrl(item.actor.avatarUrl)
    : "";
  const actorInitials = getActorInitials(item.actor);

  if (item.actor && actorAvatarUrl && !imageFailed) {
    return (
      <div className="h-12 w-12 overflow-hidden rounded-3xl bg-slate-100 ring-1 ring-slate-200">
        <img
          src={actorAvatarUrl}
          alt={item.actor.displayName || "ผู้เกี่ยวข้อง"}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  if (item.actor) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-sky-50 text-sm font-black text-sky-700 ring-1 ring-sky-100">
        {actorInitials || "HR"}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-3xl ring-1",
        getSeverityClass(item),
      )}
    >
      {getSeverityIcon(item)}
    </div>
  );
}

export default function NotificationsPage() {
  const pageRef = useRef(1);
  const statusRef = useRef<NotificationListStatus>("all");
  const [status, setStatus] = useState<NotificationListStatus>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [summary, setSummary] = useState<NotificationSummaryResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const totalPages = data?.meta.totalPages ?? 1;
  const total = data?.meta.total ?? 0;
  const items = data?.items ?? [];
  const unreadOnCurrentPage = useMemo(
    () => items.filter((item) => !item.readAt).length,
    [items],
  );
  const unreadTotal = summary?.unreadCount ?? unreadOnCurrentPage;
  const allNotificationTotal = summary?.totalCount ?? total;
  const currentEmptyState = getEmptyState(status);

  function publishSummary(nextSummary: NotificationSummaryResponse) {
    setSummary(nextSummary);
    setLastSyncedAt(nextSummary.generatedAt ?? new Date().toISOString());
    window.dispatchEvent(
      new CustomEvent(NOTIFICATION_SUMMARY_UPDATED_EVENT, {
        detail: nextSummary,
      }),
    );
  }

  async function loadSummary() {
    const nextSummary = await getNotificationSummary();
    publishSummary(nextSummary);
    return nextSummary;
  }

  async function loadNotifications(
    nextPage = pageRef.current,
    nextStatus = statusRef.current,
    options: LoadOptions = {},
  ) {
    try {
      if (!options.silent) {
        setLoading(true);
      }

      const response = await getNotifications({
        status: nextStatus,
        page: nextPage,
        limit: PAGE_SIZE,
      });
      setData(response);
      setError(null);
    } catch {
      setError("โหลดประวัติแจ้งเตือนไม่สำเร็จ");
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  async function refreshNotifications(
    nextPage = pageRef.current,
    nextStatus = statusRef.current,
    options: LoadOptions = {},
  ) {
    await Promise.all([
      loadNotifications(nextPage, nextStatus, options),
      loadSummary().catch(() => undefined),
    ]);
  }

  async function handleTabChange(nextStatus: NotificationListStatus) {
    statusRef.current = nextStatus;
    pageRef.current = 1;
    setStatus(nextStatus);
    setPage(1);
    await refreshNotifications(1, nextStatus);
  }

  async function handlePageChange(nextPage: number) {
    const safePage = Math.min(Math.max(nextPage, 1), totalPages);
    pageRef.current = safePage;
    setPage(safePage);
    await refreshNotifications(safePage, statusRef.current);
  }

  async function handleMarkRead(item: NotificationItem) {
    if (!item.id || item.readAt) return;

    try {
      await markNotificationRead(item.id);
      await refreshNotifications(pageRef.current, statusRef.current, {
        silent: true,
      });
    } catch {
      setError("อัปเดตสถานะแจ้งเตือนไม่สำเร็จ");
    }
  }

  async function handleMarkAllRead() {
    try {
      setMarkingAll(true);
      await markAllNotificationsRead();
      await refreshNotifications(pageRef.current, statusRef.current, {
        silent: true,
      });
    } catch {
      setError("อ่านแจ้งเตือนทั้งหมดไม่สำเร็จ");
    } finally {
      setMarkingAll(false);
    }
  }

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    void refreshNotifications(1, statusRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;

    const stream = openNotificationStream({
      onEvent: (event) => {
        if (!mounted || event.type === "HEARTBEAT") {
          return;
        }

        if (event.summary) {
          publishSummary(event.summary);
        } else {
          void loadSummary().catch(() => undefined);
        }

        void loadNotifications(pageRef.current, statusRef.current, {
          silent: true,
        });
      },
      onError: () => {
        // หน้าแจ้งเตือนยังมีปุ่มรีเฟรชและกระดิ่งยังมี polling fallback อยู่แล้ว
      },
    });

    return () => {
      mounted = false;
      stream.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-sky-50 via-white to-slate-50 px-6 py-6 text-slate-950 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                <Bell className="h-3.5 w-3.5" />
                Notification Center
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight lg:text-3xl">
                แจ้งเตือนทั้งหมด
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                ดูประวัติแจ้งเตือนย้อนหลัง กรองรายการอ่านแล้ว/ยังไม่อ่าน และกดไปหน้าที่เกี่ยวข้องได้จากจุดเดียว
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                อัปเดตล่าสุด {formatNotificationTime(lastSyncedAt ?? undefined)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                <div className="text-xs font-bold text-slate-500">ทั้งหมด</div>
                <div className="mt-1 text-2xl font-black">
                  {formatCount(allNotificationTotal)}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                <div className="text-xs font-bold text-slate-500">ยังไม่อ่าน</div>
                <div className="mt-1 text-2xl font-black">
                  {formatCount(unreadTotal)}
                </div>
              </div>
              <div className="col-span-2 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm sm:col-span-1">
                <div className="text-xs font-bold text-slate-500">กำลังแสดง</div>
                <div className="mt-1 text-2xl font-black">{formatCount(total)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => void handleTabChange(tab.value)}
                    className={cn(
                      "rounded-2xl px-4 py-2 text-sm font-extrabold transition",
                      status === tab.value
                        ? "border border-sky-200 bg-sky-50 text-sky-700 shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-500">
                {STATUS_DESCRIPTIONS[status]}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshNotifications(pageRef.current, statusRef.current)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                รีเฟรช
              </button>

              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll || loading || unreadTotal <= 0}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-sm font-extrabold text-sky-700 shadow-sm ring-1 ring-sky-200 transition hover:bg-sky-100 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {markingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4" />
                )}
                อ่านทั้งหมด
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="divide-y divide-slate-100">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm font-bold text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              กำลังโหลดประวัติแจ้งเตือน
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="mt-4 text-base font-black text-slate-900">
                {currentEmptyState.title}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {currentEmptyState.description}
              </div>
            </div>
          ) : (
            items.map((item) => {
              const isUnread = !item.readAt;
              const canOpenDetail = hasDetailLink(item);

              return (
                <article
                  key={item.id ?? item.key}
                  className={cn(
                    "grid gap-4 px-4 py-4 transition hover:bg-slate-50 lg:grid-cols-[auto_1fr_auto] lg:px-6",
                    isUnread && "bg-sky-50/70",
                  )}
                >
                  <NotificationAvatar item={item} />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {isUnread ? (
                        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700">
                          ยังไม่อ่าน
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">
                          อ่านแล้ว
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">
                        {getTypeLabel(item.type)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">
                        {getSeverityLabel(item)}
                      </span>
                      {item.count > 1 ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">
                          {formatCount(item.count)} รายการ
                        </span>
                      ) : null}
                    </div>

                    <h2 className="mt-2 text-base font-black text-slate-950">
                      {item.title}
                    </h2>
                    {item.actor ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                        <span>เจ้าของรายการ: {item.actor.displayName}</span>
                        {getActorSubtitle(item.actor) ? (
                          <span className="text-slate-400">{getActorSubtitle(item.actor)}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                      {item.message}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatNotificationTime(item.updatedAt ?? item.createdAt)}
                      </span>
                      {item.entityType ? <span>{item.entityType}</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {isUnread ? (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(item)}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                      >
                        ทำเครื่องหมายว่าอ่านแล้ว
                      </button>
                    ) : null}

                    {canOpenDetail ? (
                      <Link
                        href={item.href}
                        onClick={() => void handleMarkRead(item)}
                        className="rounded-2xl bg-sky-50 px-3 py-2 text-xs font-extrabold text-sky-700 shadow-sm ring-1 ring-sky-200 transition hover:bg-sky-100 hover:text-sky-800"
                      >
                        ดูรายละเอียด
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div className="text-sm font-semibold text-slate-500">
            หน้า {data?.meta.page ?? page} จาก {totalPages} · ทั้งหมด {total} รายการ
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handlePageChange(page - 1);
                scrollPagerToTop();
              }}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              ก่อนหน้า
            </button>
            <button
              type="button"
              onClick={() => {
                void handlePageChange(page + 1);
                scrollPagerToTop();
              }}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ถัดไป
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
