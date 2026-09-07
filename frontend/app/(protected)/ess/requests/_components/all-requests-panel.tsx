"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  SearchInput,
  Select,
  joinClassName,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getEssDocumentRequests,
  getEssLeaveRequests,
  getEssOvertimeRequests,
  getEssTimeAdjustRequests,
  getMyOffsiteWorkRequests,
} from "@/lib/api";
import { getAttendanceTimeSlotLabel } from "@/lib/attendance-time-slot";
import {
  formatThaiDate,
  formatThaiDateTime,
  formatThaiTime,
} from "@/lib/date-format";
import { ESS_REQUEST_STATUS } from "@/lib/status-labels";
import type { DocumentRequest } from "@/types/document-workflow";
import type {
  EssLeaveRequest,
  EssOvertimeRequest,
  EssTimeAdjustRequest,
} from "@/types/ess";
import type { OffsiteWorkRequest } from "@/types/offsite-work";

/**
 * คำขอทั้งหมดของฉัน
 * -----------------
 * รวมคำขอห้าประเภทมาเรียงตามวันที่ยื่นในตารางเดียว
 * เป็นหน้า "ดูสถานะ" ล้วน ๆ — กดแถวแล้วข้ามไปแท็บของประเภทนั้นเพื่อจัดการต่อ
 */

type RequestType =
  "all" | "leave" | "overtime" | "time-adjust" | "offsite" | "documents";

type RequestRowType = Exclude<RequestType, "all">;

/** แท็บปลายทางของแต่ละประเภท — offsite อยู่รวมกับแก้เวลา */
export type RequestTabKey = "leave" | "overtime" | "time-adjust" | "documents";

type RequestRow = {
  id: string;
  type: RequestRowType;
  typeText: string;
  requestNo: string;
  title: string;
  description: string;
  dateText: string;
  submittedText: string;
  rawDate: string;
  status?: string | null;
  tab: RequestTabKey;
};

type RequestSummary = {
  total: number;
  leave: number;
  overtime: number;
  timeAdjust: number;
  offsite: number;
  documents: number;
};

const EMPTY_SUMMARY: RequestSummary = {
  total: 0,
  leave: 0,
  overtime: 0,
  timeAdjust: 0,
  offsite: 0,
  documents: 0,
};

const TYPE_FILTERS: Array<{ value: RequestType; label: string }> = [
  { value: "all", label: "ทุกประเภท" },
  { value: "leave", label: "ใบลา" },
  { value: "overtime", label: "OT" },
  { value: "time-adjust", label: "แก้เวลา" },
  { value: "offsite", label: "นอกสถานที่" },
  { value: "documents", label: "เอกสาร" },
];

const TYPE_TONE: Record<RequestRowType, "brand" | "neutral"> = {
  leave: "brand",
  overtime: "neutral",
  "time-adjust": "neutral",
  offsite: "neutral",
  documents: "neutral",
};

function date(value?: string | null) {
  return value ? formatThaiDate(value) : "-";
}

function dateTime(value?: string | null) {
  return value ? formatThaiDateTime(value) : "-";
}

function time(value?: string | null) {
  return value ? formatThaiTime(value) : "-";
}

function amount(value?: string | number | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString("th-TH") : "0";
}

function requestRef(id: string, requestNo?: string | null) {
  return requestNo?.trim() || `#${id.slice(0, 8)}`;
}

function reasonText(value?: string | null) {
  const text = value?.trim();
  if (!text) return "";
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

function offsiteLocationText(value?: string | null) {
  const map: Record<string, string> = {
    OFFICE: "สำนักงาน",
    CUSTOMER_SITE: "พบลูกค้า",
    FIELD_WORK: "นอกสถานที่",
    OTHER: "อื่น ๆ",
  };
  if (!value) return "นอกสถานที่";
  return map[value] ?? value;
}

function joinDetail(...parts: Array<string | null | undefined>) {
  return parts.filter((part) => part && part !== "-").join(" · ") || "-";
}

function toRows(
  leaves: EssLeaveRequest[],
  overtime: EssOvertimeRequest[],
  timeAdjust: EssTimeAdjustRequest[],
  offsite: OffsiteWorkRequest[],
  documents: DocumentRequest[],
): RequestRow[] {
  const leaveRows: RequestRow[] = leaves.map((item) => ({
    id: item.id,
    type: "leave",
    typeText: "ใบลา",
    tab: "leave",
    requestNo: requestRef(item.id, item.requestNo),
    title: item.leaveType?.nameTh ?? "ใบลา",
    description: joinDetail(
      `${date(item.startDate)} – ${date(item.endDate)}`,
      `${amount(item.totalDays)} วัน`,
      reasonText(item.reason),
    ),
    dateText: `${date(item.startDate)} – ${date(item.endDate)}`,
    submittedText: dateTime(item.submittedAt ?? item.createdAt),
    rawDate: item.submittedAt ?? item.createdAt ?? "",
    status: item.status,
  }));

  const overtimeRows: RequestRow[] = overtime.map((item) => ({
    id: item.id,
    type: "overtime",
    typeText: "OT",
    tab: "overtime",
    requestNo: requestRef(item.id, item.requestNo),
    title: "ทำงานล่วงเวลา",
    description: joinDetail(
      `${time(item.startTime)}–${time(item.endTime)}`,
      `${amount(item.totalHours)} ชม.`,
      reasonText(item.reason),
    ),
    dateText: date(item.workDate),
    submittedText: dateTime(item.submittedAt ?? item.createdAt),
    rawDate: item.submittedAt ?? item.createdAt ?? "",
    status: item.status,
  }));

  const timeAdjustRows: RequestRow[] = timeAdjust.map((item) => ({
    id: item.id,
    type: "time-adjust",
    typeText: "แก้เวลา",
    tab: "time-adjust",
    requestNo: requestRef(item.id, item.requestNo),
    title: getAttendanceTimeSlotLabel({
      logType: item.targetLogType ?? item.requestedLogType,
      logTime: item.requestedLogTime,
      session:
        typeof item.originalAttendanceLog?.session === "string"
          ? item.originalAttendanceLog.session
          : null,
      fallback: "ขอแก้เวลา",
    }),
    description: joinDetail(
      `แก้เป็น ${dateTime(item.requestedLogTime)}`,
      reasonText(item.reason),
    ),
    dateText: dateTime(item.requestedLogTime),
    submittedText: dateTime(item.submittedAt ?? item.createdAt),
    rawDate: item.submittedAt ?? item.createdAt ?? "",
    status: item.status,
  }));

  const offsiteRows: RequestRow[] = offsite.map((item) => ({
    id: item.id,
    type: "offsite",
    typeText: "นอกสถานที่",
    tab: "time-adjust",
    requestNo: requestRef(item.id, item.requestNo),
    title: item.locationName || "ทำงานนอกสถานที่",
    description: joinDetail(
      `${item.startTime}–${item.endTime}`,
      offsiteLocationText(item.locationType),
      reasonText(item.reason),
    ),
    dateText: date(item.workDate),
    submittedText: dateTime(item.submittedAt ?? item.createdAt),
    rawDate: item.submittedAt ?? item.createdAt ?? "",
    status: item.status,
  }));

  const documentRows: RequestRow[] = documents.map((item) => ({
    id: item.id,
    type: "documents",
    typeText: "เอกสาร",
    tab: "documents",
    requestNo: requestRef(item.id, item.requestNo),
    title: item.documentType?.nameTh ?? item.title ?? "คำขอเอกสาร",
    description: joinDetail(item.purpose || item.title),
    dateText: date(item.submittedAt ?? item.createdAt),
    submittedText: dateTime(item.submittedAt ?? item.createdAt),
    rawDate: item.submittedAt ?? item.createdAt ?? "",
    status: item.status,
  }));

  return [
    ...leaveRows,
    ...overtimeRows,
    ...timeAdjustRows,
    ...offsiteRows,
    ...documentRows,
  ].sort((a, b) => b.rawDate.localeCompare(a.rawDate));
}

export function AllRequestsPanel({
  onOpenTab,
}: {
  /** ข้ามไปแท็บของประเภทนั้นเมื่อกดแถว — ส่งมาจากหน้าแม่ที่ถือ state ของแท็บ */
  onOpenTab?: (tab: RequestTabKey) => void;
}) {
  const [leaveItems, setLeaveItems] = useState<EssLeaveRequest[]>([]);
  const [overtimeItems, setOvertimeItems] = useState<EssOvertimeRequest[]>([]);
  const [timeAdjustItems, setTimeAdjustItems] = useState<
    EssTimeAdjustRequest[]
  >([]);
  const [offsiteItems, setOffsiteItems] = useState<OffsiteWorkRequest[]>([]);
  const [documentItems, setDocumentItems] = useState<DocumentRequest[]>([]);
  const [summary, setSummary] = useState<RequestSummary>(EMPTY_SUMMARY);

  const [activeType, setActiveType] = useState<RequestType>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showToast = false) => {
    try {
      setReloading(true);
      setError(null);

      const [
        leaveResponse,
        overtimeResponse,
        timeAdjustResponse,
        offsiteResponse,
        documentResponse,
      ] = await Promise.all([
        getEssLeaveRequests({ page: 1, pageSize: 20 }),
        getEssOvertimeRequests({ page: 1, pageSize: 20 }),
        getEssTimeAdjustRequests({ page: 1, pageSize: 20 }),
        getMyOffsiteWorkRequests({ page: 1, pageSize: 20 }),
        getEssDocumentRequests({ page: 1, pageSize: 20 }),
      ]);

      setLeaveItems(leaveResponse.items ?? []);
      setOvertimeItems(overtimeResponse.items ?? []);
      setTimeAdjustItems(timeAdjustResponse.items ?? []);
      setOffsiteItems(offsiteResponse.items ?? []);
      setDocumentItems(documentResponse.items ?? []);

      const next = {
        leave: leaveResponse.summary?.total ?? leaveResponse.meta?.total ?? 0,
        overtime:
          overtimeResponse.summary?.total ?? overtimeResponse.meta?.total ?? 0,
        timeAdjust:
          timeAdjustResponse.summary?.total ??
          timeAdjustResponse.meta?.total ??
          0,
        offsite:
          offsiteResponse.summary?.total ?? offsiteResponse.meta?.total ?? 0,
        documents:
          documentResponse.summary?.total ?? documentResponse.meta?.total ?? 0,
      };

      setSummary({
        ...next,
        total:
          next.leave +
          next.overtime +
          next.timeAdjust +
          next.offsite +
          next.documents,
      });

      if (showToast) toast.success("โหลดข้อมูลคำขอล่าสุดแล้ว");
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "ไม่สามารถโหลดคำขอของฉันได้";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const rows = useMemo(
    () =>
      toRows(
        leaveItems,
        overtimeItems,
        timeAdjustItems,
        offsiteItems,
        documentItems,
      ),
    [documentItems, leaveItems, offsiteItems, overtimeItems, timeAdjustItems],
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return rows.filter((item) => {
      const typeMatch = activeType === "all" || item.type === activeType;
      const textMatch =
        !keyword ||
        `${item.typeText} ${item.requestNo} ${item.title} ${item.description} ${item.status ?? ""}`
          .toLowerCase()
          .includes(keyword);

      return typeMatch && textMatch;
    });
  }, [activeType, rows, search]);

  const pendingCount = rows.filter((item) =>
    ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "PENDING"].includes(
      String(item.status ?? "").toUpperCase(),
    ),
  ).length;

  const isUnlinkedAccount = Boolean(
    error?.includes("ยังไม่ได้ผูกกับข้อมูลพนักงาน"),
  );

  return (
    <>
      {/* ตัวเลขของแต่ละประเภท คั่นด้วยเส้น ไม่ใช่กล่องหกใบ */}
      <div className="grid border-b border-slate-200 sm:grid-cols-3 xl:grid-cols-6">
        <TypeFact
          label="คำขอทั้งหมด"
          helper={
            pendingCount > 0
              ? `${pendingCount.toLocaleString("th-TH")} รายการยังรอผล`
              : "ไม่มีรายการค้าง"
          }
          value={summary.total.toLocaleString("th-TH")}
          tone={pendingCount > 0 ? "warning" : "neutral"}
        />
        <TypeFact
          label="ใบลา"
          helper="คำขอลาทั้งหมด"
          value={summary.leave.toLocaleString("th-TH")}
        />
        <TypeFact
          label="OT"
          helper="ทำงานล่วงเวลา"
          value={summary.overtime.toLocaleString("th-TH")}
        />
        <TypeFact
          label="แก้เวลา"
          helper="แก้เวลาเข้า–ออกงาน"
          value={summary.timeAdjust.toLocaleString("th-TH")}
        />
        <TypeFact
          label="นอกสถานที่"
          helper="ทำงานนอกสำนักงาน"
          value={summary.offsite.toLocaleString("th-TH")}
        />
        <TypeFact
          label="เอกสาร"
          helper="หนังสือรับรอง/เอกสาร HR"
          value={summary.documents.toLocaleString("th-TH")}
        />
      </div>

      {/* แถบเครื่องมือพื้นเทาอ่อน ชุดเดียวกับหน้าอื่นทั้งระบบ */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 3xl:px-7">
        <div className="flex flex-wrap items-center gap-2 [&_input]:bg-white [&_select]:bg-white">
          <div className="w-full sm:w-44">
            <Select
              value={activeType}
              onChange={(event) =>
                setActiveType(event.target.value as RequestType)
              }
              aria-label="ประเภทคำขอ"
            >
              {TYPE_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-72">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="เลขคำขอ ประเภท รายละเอียด หรือสถานะ"
              aria-label="ค้นหาคำขอ"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[12.5px] text-slate-500 3xl:text-[13px]">
            แสดง {filteredRows.length.toLocaleString("th-TH")} จาก{" "}
            {rows.length.toLocaleString("th-TH")} รายการ
          </p>

          <Button
            variant="secondary"
            onClick={() => void loadData(true)}
            disabled={reloading}
            icon={
              <RefreshCw
                className={joinClassName(
                  "h-3.5 w-3.5",
                  reloading && "animate-spin",
                )}
              />
            }
          >
            โหลดข้อมูลใหม่
          </Button>
        </div>
      </div>

      {/*
        รายการทีละคำขอ ไม่ใช่ตาราง — ตารางเดิมกว้าง 60rem ต้องเลื่อนแนวนอน
        และซ่อนคอลัมน์ "วันที่ยื่น" ตามความกว้างจอ
      */}
      {loading ? (
        <p className="px-5 py-16 text-center text-[13px] font-semibold text-slate-600">
          กำลังโหลด…
        </p>
      ) : error ? (
        <div className="px-5 py-16 text-center">
          <p className="mx-auto max-w-lg text-[13px] font-semibold text-slate-600">
            {isUnlinkedAccount
              ? "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงยังดูคำขอไม่ได้ — ผูกบัญชีกับพนักงานได้ที่หน้า ผู้ใช้และสิทธิ์"
              : error}
          </p>
          <div className="mt-4 flex justify-center">
            <Button size="sm" onClick={() => void loadData()}>
              ลองใหม่
            </Button>
          </div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-[13px] font-semibold text-slate-600">ไม่พบคำขอ</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
            ลองเปลี่ยนตัวกรอง หรือยื่นคำขอใหม่จากแท็บด้านบน
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredRows.map((row) => (
            <button
              key={`${row.type}-${row.id}`}
              type="button"
              onClick={() => onOpenTab?.(row.tab)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 text-left transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-6 3xl:px-7"
            >
              <div className="w-[8.5rem] shrink-0">
                <Badge tone={TYPE_TONE[row.type]}>{row.typeText}</Badge>
                <p className="mt-0.5 truncate text-[11px] tabular-nums text-slate-400">
                  {row.requestNo}
                </p>
              </div>

              <div className="min-w-[12rem] flex-1">
                <p className="truncate text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                  {row.title}
                </p>
                <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
                  {row.description}
                </p>
              </div>

              <div className="w-[13rem] shrink-0">
                <p className={FIELD_LABEL_CLASS}>วันที่เกี่ยวข้อง</p>
                <p className="truncate text-[12.5px] font-semibold text-slate-800 3xl:text-[13px]">
                  {row.dateText}
                </p>
              </div>

              <div className="hidden w-[11rem] shrink-0 lg:block">
                <p className={FIELD_LABEL_CLASS}>ยื่นเมื่อ</p>
                <p className="truncate text-[12.5px] text-slate-500 3xl:text-[13px]">
                  {row.submittedText}
                </p>
              </div>

              <div className="flex w-[10rem] shrink-0 justify-end">
                <StatusBadge
                  vocabulary={ESS_REQUEST_STATUS}
                  status={row.status}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const FIELD_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]";

/** ตัวเลขของคำขอหนึ่งประเภท — ป้ายกับคำอธิบายซ้าย ตัวเลขขวา */
function TypeFact({
  label,
  helper,
  value,
  tone = "neutral",
}: {
  label: string;
  helper: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 last:border-b-0 sm:border-r sm:px-6 sm:[&:nth-child(3n)]:border-r-0 sm:[&:nth-last-child(-n+3)]:border-b-0 xl:border-b-0 xl:border-r xl:[&:nth-child(3n)]:border-r xl:[&:nth-child(6n)]:border-r-0 3xl:px-7">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-500 3xl:text-[11.5px]">
          {label}
        </p>
        <p className="truncate text-[10.5px] leading-4 text-slate-400">
          {helper}
        </p>
      </div>

      <p
        className={joinClassName(
          "shrink-0 text-[20px] font-bold leading-none tabular-nums 3xl:text-[22px]",
          tone === "warning" ? "text-amber-600" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
