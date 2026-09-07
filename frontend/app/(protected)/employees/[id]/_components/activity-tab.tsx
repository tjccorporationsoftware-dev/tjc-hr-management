"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronRight, Timer } from "lucide-react";

import { Button, Modal, Notice, joinClassName } from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApprovalAttachments } from "@/app/(protected)/approvals/_components/approval-attachments";
import {
  buildPayrollPeriodRangeForMonth,
  type PayrollCutoffPolicy,
} from "@/lib/payroll-period-range";
import { ATTENDANCE_REVIEW_STATUS, REQUEST_STATUS } from "@/lib/status-labels";
import type {
  AttendanceDailySummary,
  AttendanceDailySummaryListSummary,
} from "@/types/attendance";
import type { LeaveRequest, LeaveRequestListSummary } from "@/types/leave";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import type {
  OvertimeRequest,
  OvertimeRequestListSummary,
} from "@/types/overtime";

import {
  countStatus,
  countText,
  dateText,
  decimalText,
  leaveDayTypeText,
  moneyText,
  overtimeWorkTypeText,
  sumOf,
  timeText,
} from "./employee-format";

/**
 * แท็บกิจกรรม: ลงเวลา / ลา / OT
 * -----------------------------
 * สามแท็บนี้โครงเหมือนกันหมด — แถบตัวเลขสรุป + ตาราง + ลิงก์ไปหน้าโมดูลจริง
 * จึงใช้คอมโพเนนต์เดียวแล้วสลับคอลัมน์ตาม `mode` ไม่ต้องเขียนตารางซ้ำสามชุด
 *
 * ข้อมูลโหลดมาก้อนเดียว (50 รายการล่าสุด) แล้วแบ่งหน้าฝั่งหน้าเว็บ
 * ถ้าต้องดูมากกว่านี้ให้กดไปหน้าโมดูลที่กรองและค้นหาได้เต็มรูปแบบ
 */

const PAGE_SIZE = 10;

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

type AttendancePeriodRow = {
  key: string;
  label: string;
  rangeText: string;
  days: number;
  lateMinutes: number;
  absentDays: number;
  missingLogDays: number;
  needReviewDays: number;
  /** รายวันของงวดนี้ ใช้ตอนกางดู */
  items: AttendanceDailySummary[];
};

/** งวดเงินเดือนที่วันนี้ตกอยู่ — ลองเดือนก่อน/เดือนนี้/เดือนหน้า แล้วเลือกงวดที่ครอบวันนั้น */
function periodOfDate(workDate: string, policy?: PayrollCutoffPolicy | null) {
  const key = workDate.slice(0, 10);
  const date = new Date(key);
  if (Number.isNaN(date.getTime())) return null;

  const candidates = [-1, 0, 1].map((offset) =>
    buildPayrollPeriodRangeForMonth(
      date.getFullYear(),
      date.getMonth() + 1 + offset,
      policy,
    ),
  );

  return (
    candidates.find((range) => range.dateFrom <= key && key <= range.dateTo) ??
    candidates[1]
  );
}

/**
 * ยุบรายวันเป็นรายงวดเงินเดือน
 * แฟ้มพนักงานไม่ได้ใช้ไล่ดูทีละวัน (หน้าตรวจเวลาทำงานทำหน้าที่นั้นอยู่แล้ว)
 * ที่ต้องรู้จากตรงนี้คือ "งวดไหนมีปัญหาบ้าง" จึงสรุปให้เห็นทั้งงวดในบรรทัดเดียว
 */
function buildAttendancePeriods(
  items: AttendanceDailySummary[],
  policy?: PayrollCutoffPolicy | null,
): AttendancePeriodRow[] {
  const rows = new Map<string, AttendancePeriodRow & { sortKey: string }>();

  for (const item of items) {
    const range = periodOfDate(String(item.workDate ?? ""), policy);
    if (!range) continue;

    const current = rows.get(range.dateFrom) ?? {
      sortKey: range.dateFrom,
      key: range.dateFrom,
      label: `${THAI_MONTHS[range.payrollMonth - 1]} ${range.payrollYear + 543}`,
      rangeText: `${dateText(range.dateFrom)} – ${dateText(range.dateTo)}`,
      days: 0,
      lateMinutes: 0,
      absentDays: 0,
      missingLogDays: 0,
      needReviewDays: 0,
      items: [],
    };

    current.days += 1;
    current.lateMinutes += Number(item.totalLateMinutes ?? 0);
    if (item.isAbsent) current.absentDays += 1;
    if (item.hasMissingLog) current.missingLogDays += 1;
    if (item.requiresReview || item.reviewStatus === "NEED_REVIEW") {
      current.needReviewDays += 1;
    }
    current.items.push(item);

    rows.set(range.dateFrom, current);
  }

  /* วันใหม่อยู่บนสุดทั้งในงวดและในรายวันของงวด */
  for (const row of rows.values()) {
    row.items.sort((left, right) =>
      String(right.workDate ?? "").localeCompare(String(left.workDate ?? "")),
    );
  }

  return [...rows.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/** สถานะที่ควรโชว์ในรายวัน — ขาด/ลืมลงเวลา สำคัญกว่าสถานะการตรวจ */
function attendanceStatusOf(item: AttendanceDailySummary) {
  if (item.isAbsent) return "ABSENT";
  if (item.hasMissingLog) return "MISSING_LOG";
  return item.reviewStatus || "NORMAL";
}

const ATTENDANCE_VOCABULARY = {
  ...ATTENDANCE_REVIEW_STATUS,
  ABSENT: { label: "ขาดงาน", tone: "red" as const },
  MISSING_LOG: { label: "ลืมลงเวลา", tone: "orange" as const },
};

type ActivityProps =
  | {
      mode: "attendance";
      items: AttendanceDailySummary[];
      summary: AttendanceDailySummaryListSummary | null;
      /** วันตัดรอบของบริษัท ใช้ยุบรายวันเป็นรายงวด */
      payrollPolicy?: PayrollCutoffPolicy | null;
      loading: boolean;
      accessDenied: boolean;
      error: string | null;
      employeeId: string;
      onReload: () => void;
    }
  | {
      mode: "leave";
      items: LeaveRequest[];
      summary: LeaveRequestListSummary | null;
      loading: boolean;
      accessDenied: boolean;
      error: string | null;
      employeeId: string;
      onReload: () => void;
    }
  | {
      mode: "overtime";
      items: OvertimeRequest[];
      summary: OvertimeRequestListSummary | null;
      loading: boolean;
      accessDenied: boolean;
      error: string | null;
      employeeId: string;
      onReload: () => void;
    };

/**
 * งวดหนึ่งงวดในแท็บลงเวลา — กดกางดูรายวันของงวดนั้นได้
 * หัวงวดบอกภาพรวม (กี่วัน สายกี่นาที ขาดกี่วัน ยอดหักเท่าไร)
 * ส่วนรายวันซ่อนไว้จนกว่าจะกด เพราะแฟ้มพนักงานไม่ได้ใช้ไล่ดูทุกวันเป็นปกติ
 */
function AttendancePeriodRowView({
  row,
  open,
  onToggle,
}: {
  row: AttendancePeriodRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 text-left transition-colors hover:bg-brand-50/60 sm:px-6 3xl:px-7"
      >
        <ChevronRight
          className={joinClassName(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-90 text-brand-600",
          )}
        />

        <span className="min-w-[10rem] flex-1">
          <span className="block truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
            {row.label}
          </span>
          <span className="block truncate text-[11.5px] tabular-nums text-slate-400">
            {row.rangeText}
          </span>
        </span>

        <PeriodFact
          label="วันที่มีข้อมูล"
          value={`${countText(row.days)} วัน`}
        />
        <PeriodFact
          label="มาสาย"
          value={
            row.lateMinutes > 0 ? `${countText(row.lateMinutes)} นาที` : "-"
          }
          tone={row.lateMinutes > 0 ? "warning" : undefined}
        />
        <PeriodFact
          label="ขาด / ลืมลงเวลา"
          value={
            row.absentDays > 0 || row.missingLogDays > 0
              ? `${countText(row.absentDays)} / ${countText(row.missingLogDays)} วัน`
              : "-"
          }
          tone={
            row.absentDays > 0 || row.missingLogDays > 0 ? "danger" : undefined
          }
          width="w-32"
        />
        <PeriodFact
          label="ต้องตรวจ"
          value={
            row.needReviewDays > 0
              ? `${countText(row.needReviewDays)} วัน`
              : "-"
          }
          tone={row.needReviewDays > 0 ? "warning" : undefined}
        />
      </button>

      {open ? (
        <div className="border-t border-brand-100 bg-brand-50/30 px-5 pb-2 sm:px-6 3xl:px-7">
          {row.items.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-slate-400">
              ไม่มีรายวันในงวดนี้
            </p>
          ) : (
            <>
              {/* หัวคอลัมน์ของรายวัน อ่านออกว่าเลขแต่ละหลักคืออะไร */}
              <div className="flex flex-wrap items-center gap-x-4 border-b border-brand-200 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-500">
                <span className="w-28 shrink-0">วันที่</span>
                <span className="min-w-[12rem] flex-1">เวลาเข้า–ออก</span>
                <span className="w-24 shrink-0 text-right">มาสาย</span>
                <span className="w-28 shrink-0">สถานะ</span>
                <span className="w-24 shrink-0 text-right">ยอดหัก</span>
              </div>

              <div>
                {row.items.map((item) => (
                  <AttendanceDayRow key={item.id} item={item} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** ตัวเลขหนึ่งช่องบนหัวงวด */
function PeriodFact({
  label,
  value,
  tone,
  width = "w-28",
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
  width?: string;
}) {
  return (
    <span className={joinClassName("shrink-0 text-right", width)}>
      <span className="block whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </span>
      <span
        className={joinClassName(
          "block whitespace-nowrap text-[12.5px] font-semibold tabular-nums 3xl:text-[13px]",
          value === "-" || value === "0.00"
            ? "text-slate-300"
            : tone === "danger"
              ? "text-rose-600"
              : tone === "warning"
                ? "text-amber-600"
                : "text-slate-800",
        )}
      >
        {value}
      </span>
    </span>
  );
}

/** ชื่อวันในสัปดาห์แบบสั้น — วันเสาร์/อาทิตย์ที่ไม่มีข้อมูลจะได้ไม่ดูเหมือนขาดงาน */
const WEEKDAY_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function weekdayOf(value?: string | null) {
  if (!value) return "";
  const date = new Date(String(value).slice(0, 10));
  return Number.isNaN(date.getTime()) ? "" : WEEKDAY_SHORT[date.getDay()];
}

/** เวลาหนึ่งช่วงในแถวรายวัน — ยังไม่มีเวลาให้เป็นขีดจาง ไม่ใช่ "เข้า -" */
function DayTime({ label, value }: { label: string; value?: string | null }) {
  const text = timeText(value);
  const empty = !text || text === "-";

  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10.5px] text-slate-400">{label}</span>
      <span
        className={joinClassName(
          "text-[12.5px] font-semibold tabular-nums",
          empty ? "text-slate-300" : "text-slate-800",
        )}
      >
        {empty ? "—" : text}
      </span>
    </span>
  );
}

/** หนึ่งวันในงวดที่กางออกมา */
function AttendanceDayRow({ item }: { item: AttendanceDailySummary }) {
  const lateMinutes = Number(item.totalLateMinutes ?? 0);
  const amount = Number(
    item.payrollImpactAmountPreview ?? item.totalDeductionAmount ?? 0,
  );
  const weekday = weekdayOf(item.workDate);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2 transition-colors even:bg-white/70 hover:bg-white">
      <span className="w-28 shrink-0">
        <span className="block text-[12.5px] font-semibold tabular-nums text-slate-900">
          {dateText(item.workDate)}
        </span>
        {weekday ? (
          <span className="block text-[10.5px] text-slate-400">
            วัน{weekday}
          </span>
        ) : null}
      </span>

      <span className="flex min-w-[12rem] flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
        <DayTime label="เข้า" value={item.morningInAt} />
        <DayTime label="เข้าบ่าย" value={item.afternoonInAt} />
        <DayTime label="ออก" value={item.checkOutAt} />
      </span>

      <span className="w-24 shrink-0 text-right text-[12px] tabular-nums">
        {lateMinutes > 0 ? (
          <span className="font-semibold text-amber-600">
            สาย {countText(lateMinutes)} นาที
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </span>

      <span className="w-28 shrink-0">
        <StatusBadge
          vocabulary={ATTENDANCE_VOCABULARY}
          status={attendanceStatusOf(item)}
        />
      </span>

      <span className="w-24 shrink-0 text-right text-[12.5px] font-semibold tabular-nums">
        {amount > 0 ? (
          <span className="text-rose-600">{moneyText(amount)}</span>
        ) : (
          <span className="text-slate-300">0.00</span>
        )}
      </span>
    </div>
  );
}

/**
 * ใบลาหนึ่งใบ — บรรทัดเดียว
 * ซ้ายบอกว่าลาอะไรและเพราะอะไร ขวาเป็นช่วงวันกับจำนวนวัน ปิดท้ายด้วยสถานะ
 * เดิมเป็นตารางที่ซ่อนคอลัมน์ช่วงวันที่ในจอเล็ก ทั้งที่เป็นข้อมูลหลักของใบลา
 */
function LeaveRow({
  item,
  onOpen,
}: {
  item: LeaveRequest;
  onOpen: () => void;
}) {
  const singleDay = dateText(item.startDate) === dateText(item.endDate);

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
      className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6 3xl:px-7"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <CalendarDays className="h-4 w-4" />
      </span>

      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
            {item.leaveType?.nameTh || "-"}
          </p>
          <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
            {leaveDayTypeText(item.dayType)}
          </span>
          {item.leaveType?.isPaid === false ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">
              ไม่ได้รับค่าจ้าง
            </span>
          ) : null}
        </div>
        {/* เหตุผลคือสิ่งที่คนเปิดแฟ้มอยากรู้ต่อจากประเภทลา เดิมไม่ได้แสดงเลย */}
        <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
          {[item.requestNo, item.reason].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <div className="w-52 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          ช่วงวันที่
        </p>
        <p className="truncate text-[12.5px] font-semibold tabular-nums text-slate-800 3xl:text-[13px]">
          {singleDay
            ? dateText(item.startDate)
            : `${dateText(item.startDate)} – ${dateText(item.endDate)}`}
        </p>
      </div>

      <div className="w-24 shrink-0 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          จำนวนวัน
        </p>
        <p className="text-[13.5px] font-bold tabular-nums text-slate-900 3xl:text-[14px]">
          {decimalText(item.totalDays)} วัน
        </p>
      </div>

      <div className="w-28 shrink-0">
        <StatusBadge vocabulary={REQUEST_STATUS} status={item.status} />
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </article>
  );
}

/** ใบ OT หนึ่งใบ — โครงเดียวกับใบลา */
function OvertimeRow({
  item,
  onOpen,
}: {
  item: OvertimeRequest;
  onOpen: () => void;
}) {
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
      className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6 3xl:px-7"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Timer className="h-4 w-4" />
      </span>

      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
            {dateText(item.workDate)}
          </p>
          <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
            {overtimeWorkTypeText(item.workType)}
          </span>
        </div>
        <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
          {[item.requestNo, item.reason].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <div className="w-52 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          ช่วงเวลา
        </p>
        <p className="truncate text-[12.5px] font-semibold tabular-nums text-slate-800 3xl:text-[13px]">
          {item.startTime} – {item.endTime}
        </p>
      </div>

      <div className="w-24 shrink-0 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          จำนวนชั่วโมง
        </p>
        <p className="text-[13.5px] font-bold tabular-nums text-slate-900 3xl:text-[14px]">
          {decimalText(item.totalHours)} ชม.
        </p>
      </div>

      <div className="w-28 shrink-0">
        <StatusBadge vocabulary={REQUEST_STATUS} status={item.status} />
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </article>
  );
}

/** ป้ายฟ้าคั่นเส้นบาง — หัวข้อย่อยในป๊อปอัพรายละเอียด */
function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
        {title}
      </p>
      {children}
    </section>
  );
}

/**
 * ช่องข้อมูลในป๊อปอัพรายละเอียด — วางเรียงแนวนอนคั่นด้วยเส้นตั้ง
 * ชุดเดียวกับใบรายการหน้าอื่นของระบบ อ่านทั้งแถวรวดเดียวได้
 */
function DetailRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-stretch divide-x divide-brand-100">
      {children}
    </div>
  );
}

function DetailField({
  label,
  value,
  width = "min-w-[8rem] flex-1",
}: {
  label: string;
  value: ReactNode;
  /** ช่องที่ข้อความยาว (เหตุผล/หมายเหตุ) ใช้ความกว้างมากกว่าเพื่อน */
  width?: string;
}) {
  const empty = value === "-" || value === "" || value == null;

  return (
    <div className={joinClassName("px-4 first:pl-0 last:pr-0", width)}>
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <div
        className={joinClassName(
          "mt-0.5 break-words text-[13px] font-semibold leading-6",
          empty ? "text-slate-300" : "text-slate-800",
        )}
      >
        {empty ? "—" : value}
      </div>
    </div>
  );
}

export function ActivityTab(props: ActivityProps) {
  const [page, setPage] = useState(1);

  /* งวดที่กางอยู่ — กางได้ทีละงวด จะได้ไม่ยาวจนหาไม่เจอว่าอ่านถึงไหน */
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);

  /* ใบที่กดเปิดดูรายละเอียด (ลา / OT) */
  const [leaveDetail, setLeaveDetail] = useState<LeaveRequest | null>(null);
  const [overtimeDetail, setOvertimeDetail] = useState<OvertimeRequest | null>(
    null,
  );

  /* ลงเวลา: ยุบรายวันเป็นรายงวดเงินเดือน */
  const attendancePeriods = useMemo(
    () =>
      props.mode === "attendance"
        ? buildAttendancePeriods(props.items, props.payrollPolicy)
        : [],
    [props],
  );

  const meta = useMemo(() => {
    if (props.mode === "attendance") {
      const items = props.items;
      const summary = props.summary;

      return {
        href: `/attendance?employeeId=${encodeURIComponent(props.employeeId)}`,
        actionLabel: "เปิดหน้าการลงเวลา",
        emptyTitle: "ยังไม่มีข้อมูลการลงเวลา",
        emptyDescription: "เมื่อพนักงานเริ่มลงเวลา รายการจะขึ้นที่นี่",
        minWidth: "min-w-[52rem]",
        tiles: [
          {
            label: "วันที่มีข้อมูล",
            value: `${countText(summary?.total ?? items.length)} วัน`,
            helper: "ในช่วงที่โหลดมา",
          },
          {
            label: "ต้องตรวจสอบ",
            value: `${countText(
              summary?.needReview ??
                items.filter(
                  (item) =>
                    item.requiresReview || item.reviewStatus === "NEED_REVIEW",
                ).length,
            )} วัน`,
            tone:
              (summary?.needReview ?? 0) > 0
                ? ("warning" as const)
                : ("positive" as const),
            helper: "รอ HR ตรวจ",
          },
          {
            label: "ยอดหักรวม",
            value: moneyText(
              summary?.totalDeductionAmount ??
                sumOf(items.map((item) => item.totalDeductionAmount)),
            ),
            helper: "จากมาสาย ขาด และลืมลงเวลา",
          },
        ],
      };
    }

    if (props.mode === "leave") {
      const items = props.items;
      const summary = props.summary;
      const pending = summary?.submitted ?? countStatus(items, "SUBMITTED");

      return {
        href: `/hr/leaves?employeeId=${encodeURIComponent(props.employeeId)}`,
        actionLabel: "เปิดหน้าจัดการการลา",
        emptyTitle: "ยังไม่มีรายการลา",
        emptyDescription: "เมื่อพนักงานยื่นใบลา รายการจะขึ้นที่นี่",
        minWidth: "min-w-[44rem]",
        tiles: [
          {
            label: "รออนุมัติ",
            value: `${countText(pending)} รายการ`,
            tone: pending > 0 ? ("warning" as const) : ("positive" as const),
            helper: "ค้างในสายอนุมัติ",
          },
          {
            label: "อนุมัติแล้ว",
            value: `${countText(
              summary?.approved ?? countStatus(items, "APPROVED"),
            )} รายการ`,
            helper: "นับทุกประเภทลา",
          },
          {
            label: "วันลารวม",
            value: `${decimalText(
              summary?.totalDays ?? sumOf(items.map((item) => item.totalDays)),
            )} วัน`,
            helper: "รวมทุกสถานะ",
          },
        ],
      };
    }

    const items = props.items;
    const summary = props.summary;
    const pending = summary?.submitted ?? countStatus(items, "SUBMITTED");

    return {
      href: `/hr/overtime?employeeId=${encodeURIComponent(props.employeeId)}`,
      actionLabel: "เปิดหน้าจัดการ OT",
      emptyTitle: "ยังไม่มีรายการ OT",
      emptyDescription: "เมื่อพนักงานขอทำ OT รายการจะขึ้นที่นี่",
      minWidth: "min-w-[44rem]",
      tiles: [
        {
          label: "รออนุมัติ",
          value: `${countText(pending)} รายการ`,
          tone: pending > 0 ? ("warning" as const) : ("positive" as const),
          helper: "ค้างในสายอนุมัติ",
        },
        {
          label: "อนุมัติแล้ว",
          value: `${countText(
            summary?.approved ?? countStatus(items, "APPROVED"),
          )} รายการ`,
          helper: "นับทุกประเภทวัน",
        },
        {
          label: "ชั่วโมงที่อนุมัติ",
          value: `${decimalText(
            summary?.approvedHours ??
              sumOf(
                items
                  .filter((item) => item.status === "APPROVED")
                  .map((item) => item.totalHours),
              ),
          )} ชม.`,
          helper: "รวมทั้งช่วงที่โหลดมา",
        },
      ],
    };
  }, [props]);

  if (props.accessDenied) {
    return (
      <div className="px-5 py-5 sm:px-6 3xl:px-7">
        <Notice tone="warning">
          บัญชีของคุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้
          กรุณาติดต่อผู้ดูแลระบบหากจำเป็นต้องใช้งาน
        </Notice>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(props.items.length / PAGE_SIZE));
  // ข้อมูลโหลดใหม่แล้วสั้นลงได้ จึงหนีบหน้าปัจจุบันตอนคำนวณ ไม่ต้องรีเซ็ตด้วยเอฟเฟกต์
  const safePage = Math.min(page, totalPages);
  const visibleItems = props.items.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div className="min-w-0">
      <div className="[&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:text-slate-600">
        {props.mode === "attendance" ? (
          props.loading ? (
            <p className="px-5 py-16 text-center text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          ) : attendancePeriods.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-[13px] font-semibold text-slate-600">
                {meta.emptyTitle}
              </p>
              <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
                {meta.emptyDescription}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {attendancePeriods.map((row) => (
                <AttendancePeriodRowView
                  key={row.key}
                  row={row}
                  open={openPeriod === row.key}
                  onToggle={() =>
                    setOpenPeriod((current) =>
                      current === row.key ? null : row.key,
                    )
                  }
                />
              ))}
            </div>
          )
        ) : props.loading ? (
          <p className="px-5 py-16 text-center text-[13px] font-semibold text-slate-600">
            กำลังโหลด…
          </p>
        ) : props.error ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              {props.error}
            </p>
            <div className="mt-4 flex justify-center">
              <Button size="sm" onClick={props.onReload}>
                ลองใหม่
              </Button>
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              {meta.emptyTitle}
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              {meta.emptyDescription}
            </p>
          </div>
        ) : (
          /* ใบลากับใบ OT เป็นรายการทีละใบ ไม่ใช่ตารางที่ซ่อนคอลัมน์ตามความกว้างจอ */
          <div className="divide-y divide-slate-200">
            {props.mode === "leave"
              ? (visibleItems as LeaveRequest[]).map((item) => (
                  <LeaveRow
                    key={item.id}
                    item={item}
                    onOpen={() => setLeaveDetail(item)}
                  />
                ))
              : (visibleItems as OvertimeRequest[]).map((item) => (
                  <OvertimeRow
                    key={item.id}
                    item={item}
                    onOpen={() => setOvertimeDetail(item)}
                  />
                ))}
          </div>
        )}
      </div>

      {props.mode !== "attendance" &&
      !props.loading &&
      !props.error &&
      props.items.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6 3xl:px-7">
          <span className="text-[13px] text-slate-400">
            หน้า {countText(safePage)} จาก {countText(totalPages)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={safePage <= 1}
              onClick={() => {
                setPage(Math.max(safePage - 1, 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => {
                setPage(Math.min(safePage + 1, totalPages));
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}
      {/* รายละเอียดใบลา */}
      {leaveDetail ? (
        <Modal
          open
          size="lg"
          title="รายละเอียดใบลา"
          onClose={() => setLeaveDetail(null)}
          footer={<Button onClick={() => setLeaveDetail(null)}>ปิด</Button>}
        >
          <div className="-mx-5 -mt-4">
            {/* แถบตัวตนของใบ — ประเภทลากับสถานะอ่านได้ก่อนเพื่อน */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-100 bg-brand-50/50 px-5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-brand-100">
                <CalendarDays className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] font-bold text-slate-900">
                    {leaveDetail.leaveType?.nameTh || "-"}
                  </p>
                  <StatusBadge
                    vocabulary={REQUEST_STATUS}
                    status={leaveDetail.status}
                  />
                </div>
                <p className="truncate text-[11.5px] text-slate-500">
                  {[
                    leaveDetail.requestNo,
                    leaveDayTypeText(leaveDetail.dayType),
                    leaveDetail.leaveType?.isPaid === false
                      ? "ไม่ได้รับค่าจ้าง"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  จำนวนวัน
                </p>
                <p className="text-[20px] font-bold leading-tight tabular-nums text-slate-900">
                  {decimalText(leaveDetail.totalDays)}
                </p>
              </div>
            </div>

            <div className="space-y-5 px-5 py-4">
              <DetailSection title="ช่วงที่ลา">
                <DetailRow>
                  <DetailField
                    label="ตั้งแต่"
                    value={dateText(leaveDetail.startDate)}
                  />
                  <DetailField
                    label="ถึง"
                    value={dateText(leaveDetail.endDate)}
                  />
                  {leaveDetail.startTime || leaveDetail.endTime ? (
                    <DetailField
                      label="เวลา"
                      value={`${leaveDetail.startTime ?? "-"} – ${
                        leaveDetail.endTime ?? "-"
                      }`}
                    />
                  ) : null}
                  <DetailField
                    label="ลาย้อนหลัง"
                    value={leaveDetail.isRetroactive ? "ใช่" : "ไม่ใช่"}
                  />
                </DetailRow>
              </DetailSection>

              <DetailSection title="เหตุผลและหมายเหตุ">
                <DetailRow>
                  <DetailField
                    label="เหตุผลการลา"
                    value={leaveDetail.reason || "-"}
                    width="min-w-[14rem] flex-[2]"
                  />
                  <DetailField
                    label="ติดต่อระหว่างลา"
                    value={leaveDetail.contactInfo || "-"}
                  />
                  <DetailField
                    label="หมายเหตุ"
                    value={leaveDetail.note || "-"}
                  />
                </DetailRow>
              </DetailSection>

              {/* หลักฐานที่แนบมากับใบลา — ดูรูปได้เลย ไม่ต้องไปเปิดหน้าอนุมัติ */}
              <DetailSection title="รูปหลักฐาน">
                <ApprovalAttachments
                  variant="preview"
                  item={{
                    id: leaveDetail.id,
                    type: "LEAVE",
                    detail: { attachments: leaveDetail.attachments ?? [] },
                  }}
                />
              </DetailSection>

              <DetailSection title="การดำเนินการ">
                <DetailRow>
                  <DetailField
                    label="ยื่นเมื่อ"
                    value={dateText(leaveDetail.submittedAt)}
                  />
                  <DetailField
                    label="ผู้อนุมัติ"
                    value={leaveDetail.approvedBy?.displayName ?? "-"}
                  />
                  <DetailField
                    label="อนุมัติเมื่อ"
                    value={dateText(leaveDetail.approvedAt)}
                  />
                  <DetailField
                    label="ยกเลิกเมื่อ"
                    value={dateText(leaveDetail.cancelledAt)}
                  />
                </DetailRow>
              </DetailSection>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* รายละเอียดใบ OT */}
      {overtimeDetail ? (
        <Modal
          open
          size="lg"
          title="รายละเอียดใบ OT"
          onClose={() => setOvertimeDetail(null)}
          footer={<Button onClick={() => setOvertimeDetail(null)}>ปิด</Button>}
        >
          <div className="-mx-5 -mt-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-100 bg-brand-50/50 px-5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-brand-100">
                <Timer className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] font-bold text-slate-900">
                    {dateText(overtimeDetail.workDate)}
                  </p>
                  <StatusBadge
                    vocabulary={REQUEST_STATUS}
                    status={overtimeDetail.status}
                  />
                </div>
                <p className="truncate text-[11.5px] text-slate-500">
                  {[
                    overtimeDetail.requestNo,
                    overtimeWorkTypeText(overtimeDetail.workType),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  จำนวนชั่วโมง
                </p>
                <p className="text-[20px] font-bold leading-tight tabular-nums text-slate-900">
                  {decimalText(overtimeDetail.totalHours)}
                </p>
              </div>
            </div>

            <div className="space-y-5 px-5 py-4">
              <DetailSection title="ช่วงเวลาที่ทำ">
                <DetailRow>
                  <DetailField label="เริ่ม" value={overtimeDetail.startTime} />
                  <DetailField label="ถึง" value={overtimeDetail.endTime} />
                  <DetailField
                    label="หักพัก"
                    value={`${countText(overtimeDetail.breakMinutes ?? 0)} นาที`}
                  />
                  <DetailField
                    label="ประเภท"
                    value={overtimeWorkTypeText(overtimeDetail.workType)}
                  />
                </DetailRow>
              </DetailSection>

              <DetailSection title="เหตุผลและหมายเหตุ">
                <DetailRow>
                  <DetailField
                    label="เหตุผล"
                    value={overtimeDetail.reason || "-"}
                    width="min-w-[14rem] flex-[2]"
                  />
                  <DetailField
                    label="หมายเหตุ"
                    value={overtimeDetail.note || "-"}
                  />
                </DetailRow>
              </DetailSection>

              {/* หลักฐานที่แนบมากับใบ OT */}
              <DetailSection title="รูปหลักฐาน">
                <ApprovalAttachments
                  variant="preview"
                  item={{
                    id: overtimeDetail.id,
                    type: "OVERTIME",
                    detail: { attachments: overtimeDetail.attachments ?? [] },
                  }}
                />
              </DetailSection>

              <DetailSection title="การดำเนินการ">
                <DetailRow>
                  <DetailField
                    label="ยื่นเมื่อ"
                    value={dateText(overtimeDetail.submittedAt)}
                  />
                  <DetailField
                    label="ผู้อนุมัติ"
                    value={overtimeDetail.approvedBy?.displayName ?? "-"}
                  />
                  <DetailField
                    label="อนุมัติเมื่อ"
                    value={dateText(overtimeDetail.approvedAt)}
                  />
                  <DetailField
                    label="ยกเลิกเมื่อ"
                    value={dateText(overtimeDetail.cancelledAt)}
                  />
                </DetailRow>
              </DetailSection>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
