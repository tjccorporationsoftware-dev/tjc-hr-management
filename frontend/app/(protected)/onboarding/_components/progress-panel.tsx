"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  RefreshCcw,
} from "lucide-react";

import { getOnboardingProgress } from "@/lib/api";
import type {
  OnboardingProgressItem,
  OnboardingProgressSummary,
  OnboardingStage,
} from "@/types/onboarding";

import {
  Avatar,
  Badge,
  Button,
  IconButton,
  Notice,
  SearchInput,
  Select,
  type Tone,
} from "@/components/kit";
import { formatThaiDate } from "@/lib/date-format";

import { ProgressDetailModal } from "./progress-detail-modal";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

/**
 * แท็บ "พนักงานใหม่"
 * ------------------
 * หน้าเดิมมองข้อมูลเป็นกอง — กองงาน กองเอกสาร กองทดลองงาน อยู่คนละแท็บ
 * HR ที่อยากรู้ว่า "คนนี้ไปถึงไหนแล้ว" ต้องเปิดสามแท็บแล้วจำเอาเอง
 * กระบวนการจึงไม่รู้สึกว่าเป็นลำดับขั้น ทั้งที่จริง ๆ มันเป็น
 *
 * ตัวนี้กลับด้าน หนึ่งแถวคือพนักงานใหม่หนึ่งคน มีแถบขั้นตอนบอกว่าถึงขั้นไหนแล้ว
 * และค้างอยู่ที่อะไร
 */

const PAGE_SIZE = 20;

/** ลำดับขั้นตายตัวของกระบวนการ ใช้ทั้งวาดแถบและอธิบายว่าค้างตรงไหน */
const STAGES: Array<{
  key: OnboardingStage;
  no: number;
  label: string;
  waitingText: string;
}> = [
  {
    key: "TASKS",
    no: 1,
    label: "งานต้อนรับ",
    waitingText: "ยังทำงานต้อนรับไม่ครบ",
  },
  {
    key: "DOCUMENTS",
    no: 2,
    label: "เอกสาร",
    waitingText: "ยังส่งหรือตรวจเอกสารไม่ครบ",
  },
  {
    key: "PROBATION",
    no: 3,
    label: "ทดลองงาน",
    waitingText: "รอครบกำหนดและแจ้งผลทดลองงาน",
  },
  { key: "DONE", no: 4, label: "จบกระบวนการ", waitingText: "เสร็จครบทุกขั้น" },
];

const STAGE_TONE: Record<OnboardingStage, Tone> = {
  TASKS: "warning",
  DOCUMENTS: "warning",
  PROBATION: "brand",
  DONE: "positive",
};

function personName(employee: OnboardingProgressItem["employee"]) {
  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.employeeCode
  );
}

/**
 * แถบขั้นตอน 4 ช่อง — เดินมาถึงขั้นไหนแล้วเป็นฟ้าเข้ม ที่ยังไม่ถึงเป็นเทา
 * อ่านได้ในพริบตาว่าคนนี้ไปถึงไหน โดยไม่ต้องอ่านตัวเลข
 *
 * เดิมแยกขั้นปัจจุบันเป็นฟ้าอ่อน แต่พอวางเรียงกันหลายแถวแล้วอ่านเป็น
 * "ยังไม่เสร็จ" ทั้งที่ขั้นนั้นถึงแล้ว — ใช้สีเดียวชัดกว่า
 */
function StageBar({ stageNo }: { stageNo: number }) {
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((stage) => (
        <span
          key={stage.key}
          title={`${stage.no}. ${stage.label}`}
          className={[
            "h-1.5 w-8 rounded-full transition 3xl:w-10",
            stage.no <= stageNo ? "bg-brand-600" : "bg-slate-200",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

/** เศษส่วนแบบ 2/5 — ครบแล้วเป็นเขียว ยังไม่ครบเป็นเทาเข้ม ไม่มีรายการเลยจาง */
/**
 * พนักงานใหม่หนึ่งคนในรายการ — บรรทัดเดียว
 * ใครเริ่มงานวันไหน · ค้างขั้นไหน · งานต้อนรับกับเอกสารไปถึงไหน · ทดลองงานครบเมื่อไร
 */
function ProgressRow({
  item,
  onOpen,
}: {
  item: OnboardingProgressItem;
  onOpen: () => void;
}) {
  const current = STAGES.find((entry) => entry.key === item.stage);
  const probation = item.probation;
  const probationDone =
    probation?.status === "PASSED" || probation?.status === "FAILED";
  const left = probation?.daysLeft ?? null;

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
      className="group flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-2 px-6 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8"
    >
      <div className="flex min-w-[15rem] flex-1 items-center gap-3">
        <Avatar name={personName(item.employee)} size="md" />
        <div className="min-w-0">
          <p className="break-words text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
            {personName(item.employee)}
          </p>
          <p className="break-words text-[11.5px] text-slate-500 3xl:text-[12px]">
            {[
              item.employee.employeeCode,
              item.employee.position,
              item.employee.department?.nameTh,
            ]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>
      </div>

      {/* ค้างอยู่ขั้นไหนของกระบวนการ */}
      <div className="w-40 shrink-0">
        <StageBar stageNo={item.stageNo} />
        <p className="mt-1 truncate text-[11px] text-slate-500 3xl:text-[11.5px]">
          ขั้น {item.stageNo}/4 · {current?.label}
        </p>
      </div>

      {/* งานต้อนรับกับเอกสารไปถึงไหน */}
      <div className="w-32 shrink-0 text-right">
        <p className="text-[11px] text-slate-400">งานต้อนรับ</p>
        <CountCell
          done={item.tasks.done}
          total={item.tasks.total}
          alert={item.tasks.overdue}
        />
      </div>

      <div className="w-28 shrink-0 text-right">
        <p className="text-[11px] text-slate-400">เอกสาร</p>
        <CountCell
          done={item.documents.done}
          total={item.documents.total}
          alert={item.documents.waiting}
        />
      </div>

      {/* ทดลองงานครบเมื่อไร */}
      <div className="w-36 shrink-0">
        {probation ? (
          <>
            <p className="truncate text-[12px] tabular-nums text-slate-700 3xl:text-[12.5px]">
              ครบ {formatThaiDate(probation.endDate)}
            </p>
            {!probationDone && left !== null ? (
              <p
                className={[
                  "truncate text-[11px] font-semibold tabular-nums 3xl:text-[11.5px]",
                  left < 0
                    ? "text-rose-600"
                    : left <= 30
                      ? "text-amber-600"
                      : "text-slate-400",
                ].join(" ")}
              >
                {left < 0 ? `เลยมา ${Math.abs(left)} วัน` : `เหลือ ${left} วัน`}
              </p>
            ) : null}
          </>
        ) : (
          <span className="text-[12px] text-slate-300">ยังไม่เปิดทดลองงาน</span>
        )}
      </div>

      {/* สถานะตอนนี้ */}
      <div className="w-36 shrink-0">
        <Badge tone={STAGE_TONE[item.stage]}>{current?.label}</Badge>
        <p className="mt-0.5 truncate text-[11px] text-slate-400 3xl:text-[11.5px]">
          {current?.waitingText}
        </p>
      </div>

      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 transition group-hover:bg-brand-100 group-hover:text-brand-700">
        <ChevronRight className="h-4 w-4" />
      </span>
    </article>
  );
}

function CountCell({
  done,
  total,
  alert,
}: {
  done: number;
  total: number;
  alert?: number;
}) {
  if (total === 0) return <span className="text-slate-300">—</span>;

  const complete = done >= total;

  return (
    <div className="whitespace-nowrap">
      <span
        className={[
          "font-semibold tabular-nums",
          complete ? "text-emerald-700" : "text-slate-800",
        ].join(" ")}
      >
        {done}/{total}
      </span>
      {alert ? (
        <span className="ml-1.5 text-[11px] font-semibold text-rose-600 3xl:text-[12px]">
          เกิน {alert}
        </span>
      ) : null}
    </div>
  );
}

export function ProgressPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: OnboardingProgressSummary) => void;
}) {
  const [items, setItems] = useState<OnboardingProgressItem[]>([]);
  const [summary, setSummary] = useState<OnboardingProgressSummary | null>(null);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });

  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<OnboardingStage | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [detailItem, setDetailItem] = useState<OnboardingProgressItem | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await getOnboardingProgress({
        page,
        pageSize: PAGE_SIZE,
        q: search.trim() || undefined,
        stage: stage === "ALL" ? undefined : stage,
      });

      setItems(response.items);
      setSummary(response.summary);
      setMeta({
        page: response.meta.page,
        totalPages: Math.max(1, response.meta.totalPages),
        total: response.meta.total,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "โหลดความคืบหน้าพนักงานใหม่ไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, stage]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!summary) return;
    onSummaryChange?.(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const stageCounts = useMemo(
    () => ({
      TASKS: summary?.tasksStage ?? 0,
      DOCUMENTS: summary?.documentsStage ?? 0,
      PROBATION: summary?.probationStage ?? 0,
      DONE: summary?.done ?? 0,
    }),
    [summary],
  );

  return (
    <>
      {/*
       * แถบขั้นตอนของทั้งกระบวนการ — บอกว่าตอนนี้มีคนค้างอยู่ขั้นไหนกี่คน
       * กดที่ขั้นเพื่อกรองเฉพาะคนที่ค้างขั้นนั้น
       */}
      <div className="grid grid-cols-2 divide-x divide-y divide-brand-100 border-b border-slate-300 sm:grid-cols-4 sm:divide-y-0">
        {STAGES.map((entry) => {
          const active = stage === entry.key;

          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => {
                setStage(active ? "ALL" : entry.key);
                setPage(1);
              }}
              className={[
                "relative px-6 py-2.5 text-left transition sm:px-7 3xl:px-8",
                active ? "bg-brand-50/70" : "hover:bg-slate-50",
              ].join(" ")}
            >
              {/* ขั้นที่กรองอยู่มีขีดสีใต้กล่อง อ่านออกว่ากำลังกรองด้วยอะไร */}
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-[3px] bg-brand-600"
                />
              ) : null}
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                ขั้น {entry.no} · {entry.label}
              </p>
              <p className="text-[17px] font-bold leading-6 tabular-nums text-slate-900 3xl:text-[18px]">
                {stageCounts[entry.key].toLocaleString("th-TH")}
                <span className="ml-1 text-[11.5px] font-medium text-slate-400">
                  คน
                </span>
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="ค้นหาชื่อ หรือ รหัสพนักงาน"
          aria-label="ค้นหาพนักงานใหม่"
          className="w-full sm:w-72 3xl:w-80 [&_input]:bg-white"
        />

        <Select
          value={stage}
          onChange={(event) => {
            setStage(event.target.value as OnboardingStage | "ALL");
            setPage(1);
          }}
          className="w-full sm:w-56"
          aria-label="ขั้นที่ค้างอยู่"
        >
          <option value="ALL">ทุกขั้นตอน</option>
          {STAGES.map((entry) => (
            <option key={entry.key} value={entry.key}>
              ขั้น {entry.no} · {entry.label}
            </option>
          ))}
        </Select>

        {summary && summary.overdueTasks > 0 ? (
          <span className="text-[12px] font-semibold text-rose-600 3xl:text-[13px]">
            มีงานเกินกำหนดรวม {summary.overdueTasks} รายการ
          </span>
        ) : null}

        <IconButton
          title="โหลดข้อมูลใหม่"
          icon={<RefreshCcw className="h-4 w-4" />}
          onClick={() => void load()}
          className="ml-auto"
        />
      </div>

      {errorMessage ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="critical">{errorMessage}</Notice>
        </div>
      ) : null}

      {/*
       * รายการทีละคน ไม่ใช่ตาราง — ข้อมูลของพนักงานหนึ่งคนมีหลายชนิดปนกัน
       * (ขั้นที่ค้าง งานต้อนรับ เอกสาร ทดลองงาน) ยัดลงคอลัมน์แล้วแต่ละช่องเหลือที่นิดเดียว
       */}
      <div className="divide-y divide-slate-200">
        {loading && items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ยังไม่มีพนักงานที่อยู่ในกระบวนการรับเข้า
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              พนักงานจะขึ้นที่นี่เมื่อมีงานต้อนรับ เอกสาร
              หรือใบทดลองงานอย่างน้อยหนึ่งอย่าง
            </p>
          </div>
        ) : (
          items.map((item) => (
            <ProgressRow
              key={item.employee.id}
              item={item}
              onOpen={() => setDetailItem(item)}
            />
          ))
        )}
      </div>

      {!loading && items.length > 0 ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6 3xl:px-7">
          <span className="text-[13px] text-slate-400">
            หน้า {meta.page.toLocaleString("th-TH")} จาก{" "}
            {meta.totalPages.toLocaleString("th-TH")} · ทั้งหมด{" "}
            {meta.total.toLocaleString("th-TH")} คน
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => {
                setPage((current) => Math.min(meta.totalPages, current + 1));
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      {detailItem ? (
        <ProgressDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </>
  );
}
