"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  CheckCheck,
  Info,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  getNotificationInbox,
  getPublicFileUrl,
  getNotificationSummary,
  openNotificationStream,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import type {
  NotificationItem,
  NotificationSummaryResponse,
} from "@/types/notification";

const REFRESH_INTERVAL_MS = 60_000;
const NOTIFICATION_SUMMARY_UPDATED_EVENT = "hr_notification_summary_updated";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function getSeverityIcon(item: NotificationItem) {
  switch (item.severity) {
    case "SUCCESS":
      return <CheckCircle2 className="h-4 w-4" />;
    case "DANGER":
      return <XCircle className="h-4 w-4" />;
    case "WARNING":
      return <AlertTriangle className="h-4 w-4" />;
    default:
      return <Info className="h-4 w-4" />;
  }
}

function getSeverityClass(item: NotificationItem) {
  switch (item.severity) {
    case "SUCCESS":
      return "bg-emerald-50 text-emerald-600";
    case "DANGER":
      return "bg-rose-50 text-rose-600";
    case "WARNING":
      return "bg-amber-50 text-amber-600";
    default:
      return "bg-brand-50 text-brand-600";
  }
}

function formatNotificationTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      <span className="mt-0.5 flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
        <img
          src={actorAvatarUrl}
          alt={item.actor.displayName || "ผู้เกี่ยวข้อง"}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  if (item.actor) {
    return (
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-700">
        {actorInitials || "HR"}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4",
        getSeverityClass(item),
      )}
    >
      {getSeverityIcon(item)}
    </span>
  );
}

export function NotificationBell() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(false);
  const loadSummaryRef = useRef<() => Promise<void>>(async () => undefined);
  const loadInboxRef = useRef<() => Promise<void>>(async () => undefined);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<NotificationSummaryResponse | null>(
    null,
  );
  const [inboxItems, setInboxItems] = useState<NotificationItem[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function publishSummary(nextSummary: NotificationSummaryResponse) {
    setSummary(nextSummary);
    window.dispatchEvent(
      new CustomEvent(NOTIFICATION_SUMMARY_UPDATED_EVENT, {
        detail: nextSummary,
      }),
    );
  }

  async function loadSummary() {
    try {
      setLoadingSummary(true);
      const nextSummary = await getNotificationSummary();
      publishSummary(nextSummary);
      setError(null);
    } catch {
      setError("โหลดแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadInbox() {
    try {
      setLoadingInbox(true);
      const inbox = await getNotificationInbox();
      publishSummary(inbox);
      setInboxItems(inbox.items);
      setError(null);
    } catch {
      setError("โหลดรายการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoadingInbox(false);
    }
  }

  async function handleMarkRead(item: NotificationItem) {
    if (!item.id || item.readAt) return;

    try {
      const result = await markNotificationRead(item.id);
      setInboxItems((items) =>
        items.map((currentItem) =>
          currentItem.id === item.id
            ? { ...currentItem, readAt: result.readAt }
            : currentItem,
        ),
      );
      setSummary((currentSummary) =>
        currentSummary
          ? {
              ...currentSummary,
              unreadCount: Math.max(currentSummary.unreadCount - 1, 0),
              items: currentSummary.items.map((currentItem) =>
                currentItem.id === item.id
                  ? { ...currentItem, readAt: result.readAt }
                  : currentItem,
              ),
            }
          : currentSummary,
      );
      void loadSummaryRef.current();
    } catch {
      setError("อัปเดตสถานะแจ้งเตือนไม่สำเร็จ");
    }
  }

  async function handleMarkAllRead() {
    try {
      setMarkingAll(true);
      const result = await markAllNotificationsRead();
      setInboxItems((items) =>
        items.map((item) => ({ ...item, readAt: item.readAt ?? result.readAt })),
      );
      setSummary((currentSummary) =>
        currentSummary
          ? {
              ...currentSummary,
              unreadCount: 0,
              items: currentSummary.items.map((item) => ({
                ...item,
                readAt: item.readAt ?? result.readAt,
              })),
            }
          : currentSummary,
      );
      void loadSummaryRef.current();
      if (openRef.current) {
        void loadInboxRef.current();
      }
      setError(null);
    } catch {
      setError("อ่านแจ้งเตือนทั้งหมดไม่สำเร็จ");
    } finally {
      setMarkingAll(false);
    }
  }

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    loadSummaryRef.current = loadSummary;
    loadInboxRef.current = loadInbox;
  });

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
          void loadSummaryRef.current();
        }

        if (openRef.current) {
          void loadInboxRef.current();
        }
      },
      onError: () => {
        // Stream เป็นช่องทาง realtime เสริม ถ้าหลุดให้โหลดสรุปล่าสุดหนึ่งครั้ง
        // แล้วให้ polling 60 วินาทีเป็น fallback ต่อไป
        if (mounted) {
          void loadSummaryRef.current();
        }
      },
    });

    return () => {
      mounted = false;
      stream.close();
    };
  }, []);

  useEffect(() => {
    loadSummary();

    const intervalId = window.setInterval(loadSummary, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!open) return;

    loadInbox();
  }, [open]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const unreadCount = summary?.unreadCount ?? 0;
  const displayItems = useMemo(
    () => (open ? inboxItems : summary?.items ?? []),
    [inboxItems, open, summary?.items],
  );

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-lg border border-brand-200 bg-white text-brand-600 transition hover:border-brand-300 hover:bg-brand-50",
          open && "border-brand-600 bg-brand-600 text-white hover:bg-brand-700",
        )}
        aria-label="การแจ้งเตือน"
      >
        {loadingSummary && !summary ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Bell className="h-5 w-5" />
        )}

        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white">
            {formatCount(unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[560px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold tracking-tight text-slate-950">
                  การแจ้งเตือน
                </div>
                <div className="mt-1 text-[12.5px] text-slate-500">
                  รายการล่าสุดจากระบบแจ้งเตือนในเว็บ
                </div>
                {summary?.generatedAt ? (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <Clock3 className="h-3 w-3" />
                    อัปเดต {formatNotificationTime(summary.generatedAt)}
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    unreadCount > 0
                      ? "bg-brand-50 text-brand-700"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  ยังไม่อ่าน {unreadCount} รายการ
                </span>
                {summary?.totalCount ? (
                  <span className="text-[11px] text-slate-400">
                    รวม {formatCount(summary.totalCount)} รายการ
                  </span>
                ) : null}
              </div>
            </div>

            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                อ่านทั้งหมด
              </button>
            ) : null}
          </div>

          <div className="max-h-[560px] overflow-y-auto py-2">
            {loadingInbox ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-[13px] font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลดแจ้งเตือน
              </div>
            ) : error ? (
              <div className="px-4 py-8 text-center text-[13px] font-semibold text-rose-600">
                {error}
              </div>
            ) : displayItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="mt-3 text-[13.5px] font-semibold text-slate-900">
                  ไม่มีรายการแจ้งเตือน
                </div>
                <div className="mt-1 text-[12.5px] text-slate-500">
                  เมื่อมีคำขออนุมัติหรือรายการผิดปกติ ระบบจะแสดงที่นี่
                </div>
              </div>
            ) : (
              displayItems.map((item) => {
                const isUnread = !item.readAt;

                return (
                  <Link
                    key={item.id ?? item.key}
                    href={hasDetailLink(item) ? item.href : "/notifications"}
                    onClick={() => {
                      void handleMarkRead(item);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex gap-3.5 border-b border-slate-100 px-5 py-3.5 transition last:border-b-0 hover:bg-slate-50",
                      isUnread && "bg-brand-50/60",
                    )}
                  >
                    <NotificationAvatar item={item} />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            {isUnread ? (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                            ) : null}
                            <span className="truncate text-[14px] font-semibold text-slate-900">
                              {item.title}
                            </span>
                          </span>

                          {item.actor ? (
                            <span className="mt-1 block truncate text-[12px] font-medium text-slate-500">
                              {item.actor.displayName}
                              {getActorSubtitle(item.actor) ? ` · ${getActorSubtitle(item.actor)}` : ""}
                            </span>
                          ) : null}

                          {item.updatedAt || item.createdAt ? (
                            <span className="mt-1 block text-[11.5px] text-slate-400">
                              {formatNotificationTime(item.updatedAt ?? item.createdAt)}
                            </span>
                          ) : null}
                        </span>

                        {item.count > 1 ? (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {formatCount(item.count)}
                          </span>
                        ) : null}
                      </span>

                      <span className="mt-1.5 block text-[13px] leading-6 text-slate-500">
                        {item.message}
                      </span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-white px-5 py-4">
            <button
              type="button"
              onClick={() => {
                void loadSummary();
                if (openRef.current) {
                  void loadInbox();
                }
              }}
              className="flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              รีเฟรช
            </button>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center justify-center rounded-lg bg-brand-600 text-[13px] font-semibold text-white transition hover:bg-brand-700"
            >
              ดูทั้งหมด
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
