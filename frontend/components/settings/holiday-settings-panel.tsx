"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  cancelHolidaySwap,
  createHolidayCalendar,
  createHolidaySwap,
  deleteHolidayCalendar,
  deleteHolidaySwap,
  getHolidayCalendars,
  getHolidaySettingEmployees,
  getHolidaySwaps,
} from "@/lib/api";
import type { EmployeeListItem, EmployeeMasterRef } from "@/types/employee";
import type {
  AttendanceCustomHoliday,
  AttendanceCustomHolidayType,
  AttendanceHolidaySwap,
  AttendanceHolidaySwapScopeType,
  AttendanceHolidayWeekday,
} from "@/types/system-settings";

type ManagementMode = "holidays" | "weekly" | "swap";
type ModalMode = ManagementMode | "import";
type CalendarEventKind = "WEEKLY" | "CUSTOM" | "SWAP_WORKDAY" | "SWAP_HOLIDAY";

type SelectOption = {
  id: string;
  label: string;
  subLabel?: string;
};

type CalendarCell = {
  date: Date;
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

type CalendarEvent = {
  key: string;
  kind: CalendarEventKind;
  label: string;
  helper?: string;
  tone: "sky" | "emerald" | "violet" | "amber" | "rose";
};

type PublicHolidayApiItem = {
  date?: string;
  name?: string;
  localName?: string;
  countryCode?: string;
  nationalHoliday?: boolean;
  global?: boolean;
  holidayTypes?: string[];
  types?: string[];
};

type ThailandFormatsHolidayApiItem = {
  title?: string;
  start_date?: string;
  end_date?: string;
  type?: string;
  alcohol_ban?: boolean;
  details?: string;
  slug?: string;
};

type PublicHolidayImportItem = {
  key: string;
  date: string;
  name: string;
  sourceName: string;
  selected: boolean;
};

type Props = {
  weeklyHolidays: AttendanceHolidayWeekday[];
  onWeeklyHolidaysChange: (value: AttendanceHolidayWeekday[]) => void;
  onSaveWeeklyHolidays?: () => void;
  savingWeeklyHolidays?: boolean;
  /** สรุปสั้น ๆ ของแท็บ วางไว้ซ้ายแถบเครื่องมือเดียวกับปุ่ม */
  summary?: ReactNode;
};

const weekdayOptions: Array<{
  value: AttendanceHolidayWeekday;
  label: string;
  shortLabel: string;
}> = [
  { value: "MON", label: "จันทร์", shortLabel: "จ." },
  { value: "TUE", label: "อังคาร", shortLabel: "อ." },
  { value: "WED", label: "พุธ", shortLabel: "พ." },
  { value: "THU", label: "พฤหัสบดี", shortLabel: "พฤ." },
  { value: "FRI", label: "ศุกร์", shortLabel: "ศ." },
  { value: "SAT", label: "เสาร์", shortLabel: "ส." },
  { value: "SUN", label: "อาทิตย์", shortLabel: "อา." },
];

const holidayTypeOptions: Array<{
  value: AttendanceCustomHolidayType;
  label: string;
  tone: "emerald" | "violet" | "sky";
}> = [
  { value: "COMPANY", label: "วันหยุดบริษัท", tone: "sky" },
  { value: "SPECIAL", label: "วันหยุดพิเศษ", tone: "sky" },
  { value: "PUBLIC", label: "วันหยุดนักขัตฤกษ์", tone: "sky" },
];

const managementModes: Array<{
  value: ManagementMode;
  label: string;
  helper: string;
}> = [
  {
    value: "holidays",
    label: "เพิ่มวันหยุด",
    helper: "บริษัท / พิเศษ / นักขัตฤกษ์",
  },
  {
    value: "weekly",
    label: "วันหยุดประจำสัปดาห์",
    helper: "เลือกวันหยุดประจำ",
  },
  {
    value: "swap",
    label: "สลับวันหยุด",
    helper: "เปลี่ยนวันหยุดเดิมเป็นวันทำงาน และกำหนดวันหยุดใหม่",
  },
];

const inputClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 3xl:text-[13.5px] shadow-none/40 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 max-[1536px]:h-10 max-[1536px]:rounded-lg max-[1536px]:px-2.5 max-[1536px]:text-xs";
const dateFieldClass =
  "border-slate-200 font-semibold text-slate-800 focus-within:border-brand-500 focus-within:ring-brand-100 max-[1536px]:h-10 max-[1536px]:rounded-lg max-[1536px]:text-xs";
const textareaClass =
  "min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 3xl:text-[13.5px] shadow-none/40 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 max-[1536px]:rounded-lg max-[1536px]:px-2.5 max-[1536px]:text-xs";
/*
  ปุ่มในหน้านี้ยกค่ามาจากชุด kit — ปุ่มสีทึบมีได้ปุ่มเดียวต่อหน้า (เพิ่มวันหยุด)
  ที่เหลือเป็นปุ่มขาวตัวหนังสือเทา เพื่อไม่ให้แถบเครื่องมือเป็นสีฟ้าทั้งแถว
*/
const buttonPrimaryClass =
  "inline-flex h-9 3xl:h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3.5 text-[13px] 3xl:text-[13.5px] font-semibold text-white transition hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-50";
const buttonSecondaryClass =
  "inline-flex h-9 3xl:h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] 3xl:text-[13.5px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50";
const buttonDangerClass =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-100 bg-rose-50 px-2.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 max-[1536px]:h-7 max-[1536px]:px-2 max-[1536px]:text-[10px]";

function joinClassName(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function isoDateKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function todayKey() {
  return isoDateKey(new Date());
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function yearTitle(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function monthShortTitle(year: number, month: number) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    timeZone: "Asia/Bangkok",
  }).format(new Date(year, month, 1));
}

function formatThaiDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function weekdayFromDate(date: Date): AttendanceHolidayWeekday {
  const index = (date.getDay() + 6) % 7;
  return weekdayOptions[index]?.value ?? "MON";
}

function formatEmployeeName(employee: EmployeeListItem) {
  return (
    employee.displayName ||
    `${employee.firstName} ${employee.lastName}`.trim() ||
    employee.employeeCode
  );
}

function formatMaster(master?: EmployeeMasterRef | null) {
  if (!master) return "ไม่ระบุ";
  return master.nameTh || master.nameEn || master.code || master.id;
}

function buildUniqueOptions(
  employees: EmployeeListItem[],
  key: "company" | "department" | "branch" | "employeeType",
) {
  const map = new Map<string, SelectOption>();
  for (const employee of employees) {
    const ref = employee[key];
    if (!ref?.id || map.has(ref.id)) continue;
    map.set(ref.id, {
      id: ref.id,
      label: formatMaster(ref),
      subLabel: ref.code,
    });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "th"),
  );
}

function toggleWeekday(
  values: AttendanceHolidayWeekday[],
  weekday: AttendanceHolidayWeekday,
) {
  return values.includes(weekday)
    ? values.filter((item) => item !== weekday)
    : [...values, weekday];
}

function getHolidayTypeLabel(value?: AttendanceCustomHolidayType) {
  return (
    holidayTypeOptions.find((item) => item.value === value)?.label ??
    "วันหยุดพิเศษ"
  );
}

function holidayTypeTone(value?: AttendanceCustomHolidayType) {
  return (
    holidayTypeOptions.find((item) => item.value === value)?.tone ?? "violet"
  );
}

function hasValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeHolidayText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasThaiText(value?: string | null) {
  return Boolean(value && /[\u0E00-\u0E7F]/.test(value));
}

function getThaiPublicHolidayName(
  name?: string | null,
  localName?: string | null,
) {
  const original = localName || name || "วันหยุดนักขัตฤกษ์";
  if (hasThaiText(original)) return original;

  const value = normalizeHolidayText(`${localName ?? ""} ${name ?? ""}`);
  const mappings: Array<[string[], string]> = [
    [["new year"], "วันขึ้นปีใหม่"],
    [["makha", "maka"], "วันมาฆบูชา"],
    [["chakri"], "วันจักรี"],
    [["special public holiday"], "วันหยุดพิเศษ"],
    [["songkran"], "วันสงกรานต์"],
    [["labour", "labor"], "วันแรงงานแห่งชาติ"],
    [["coronation"], "วันฉัตรมงคล"],
    [["visakha", "vesak", "visaka"], "วันวิสาขบูชา"],
    [
      ["queen suthida", "queen's birthday", "queen birthday"],
      "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี",
    ],
    [["asanha", "asarnha", "asalha", "asahna"], "วันอาสาฬหบูชา"],
    [["buddhist lent"], "วันเข้าพรรษา"],
    [
      ["vajiralongkorn", "king's birthday", "king birthday"],
      "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว",
    ],
    [["queen mother", "mother's day", "mother day"], "วันแม่แห่งชาติ"],
    [
      ["bhumibol", "father's day", "father day"],
      "วันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9",
    ],
    [["chulalongkorn"], "วันปิยมหาราช"],
    [["constitution"], "วันรัฐธรรมนูญ"],
    [["new year's eve", "new year eve"], "วันสิ้นปี"],
  ];

  const matched = mappings.find(([keywords]) =>
    keywords.some((keyword) => value.includes(keyword)),
  );
  const thaiName = matched?.[1] ?? original;
  return value.includes("substitution") ||
    value.includes("substitute") ||
    value.includes("observed")
    ? `วันหยุดชดเชย${thaiName.replace(/^วัน/, "")}`
    : thaiName;
}

function uniqueImportItems(items: PublicHolidayImportItem[]) {
  const map = new Map<string, PublicHolidayImportItem>();
  for (const item of items) {
    const key = `${item.date}-${normalizeHolidayText(item.name)}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function parseNagerHolidayApiResponse(value: unknown) {
  if (Array.isArray(value)) return value as PublicHolidayApiItem[];
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { holidays?: unknown }).holidays)
  ) {
    return (value as { holidays: PublicHolidayApiItem[] }).holidays;
  }
  throw new Error("รูปแบบข้อมูลวันหยุดไม่ถูกต้อง");
}

function parseThailandFormatsHolidayApiResponse(value: unknown) {
  if (Array.isArray(value)) return value as ThailandFormatsHolidayApiItem[];
  if (value && typeof value === "object") {
    const record = value as {
      holidays?: unknown;
      data?: unknown;
      items?: unknown;
    };
    if (Array.isArray(record.holidays)) {
      return record.holidays as ThailandFormatsHolidayApiItem[];
    }
    if (Array.isArray(record.data)) {
      return record.data as ThailandFormatsHolidayApiItem[];
    }
    if (Array.isArray(record.items)) {
      return record.items as ThailandFormatsHolidayApiItem[];
    }
  }
  throw new Error("รูปแบบข้อมูลวันหยุดไทยไม่ถูกต้อง");
}

async function readFreeHolidayApiJson(response: Response) {
  const rawText = await response.text();
  const text = rawText.trim();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (!text) {
    throw new Error("EMPTY_RESPONSE");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("อ่านข้อมูลวันหยุดจากแหล่งข้อมูลไม่ได้");
  }
}

function expandDateRange(startDate: string, endDate?: string | null) {
  if (!hasValidDate(startDate)) return [];
  const safeEndDate = endDate && hasValidDate(endDate) ? endDate : startDate;
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = safeEndDate.split("-").map(Number);
  const current = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime())) return [];

  const dates: string[] = [];
  while (current <= end) {
    dates.push(isoDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function buildThailandFormatsImportItems(
  data: ThailandFormatsHolidayApiItem[],
) {
  return uniqueImportItems(
    data.flatMap((item) => {
      if (!item.start_date || !hasValidDate(item.start_date)) return [];
      const sourceTitle = item.title || "Thai public holiday";
      const holidayName = getThaiPublicHolidayName(sourceTitle, sourceTitle);
      return expandDateRange(item.start_date, item.end_date).map((date) => ({
        key: `${date}-${normalizeHolidayText(sourceTitle)}`,
        date,
        name: holidayName,
        sourceName: `ThailandFormats · ${sourceTitle}`,
        selected: true,
      }));
    }),
  );
}

function buildNagerImportItems(data: PublicHolidayApiItem[]) {
  return uniqueImportItems(
    data
      .filter((item) => item.date && hasValidDate(item.date))
      .map((item) => {
        const sourceName = item.localName || item.name || "Public holiday";
        return {
          key: `${item.date}-${normalizeHolidayText(sourceName)}`,
          date: item.date as string,
          name: getThaiPublicHolidayName(item.name, item.localName),
          sourceName: `Nager.Date · ${sourceName}`,
          selected: true,
        };
      }),
  );
}

async function fetchThailandFormatsPublicHolidays(year: number) {
  const response = await fetch(
    `https://thailandformats.com/api/v1/holidays/${year}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
    },
  );
  const data = parseThailandFormatsHolidayApiResponse(
    await readFreeHolidayApiJson(response),
  );
  return buildThailandFormatsImportItems(data);
}

async function fetchNagerPublicHolidays(year: number) {
  const endpoints = [
    `https://date.nager.at/api/v3/PublicHolidays/${year}/TH`,
    `https://date.nager.at/api/v3/publicholidays/${year}/TH`,
    `https://date.nager.at/api/v4/Holidays/TH/${year}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = parseNagerHolidayApiResponse(
        await readFreeHolidayApiJson(response),
      );
      const items = buildNagerImportItems(data);
      if (items.length > 0) return items;
    } catch {
      // Keep trying the next free fallback endpoint.
    }
  }

  return [];
}

async function fetchThailandPublicHolidays(year: number) {
  try {
    const thailandFormatsItems = await fetchThailandFormatsPublicHolidays(year);
    if (thailandFormatsItems.length > 0) return thailandFormatsItems;
  } catch {
    // ThailandFormats is the primary free source. If it is temporarily
    // unavailable, fall back to another free public-holiday source.
  }

  const nagerItems = await fetchNagerPublicHolidays(year);
  if (nagerItems.length > 0) return nagerItems;

  throw new Error(
    "ดึงข้อมูลวันหยุดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือกรอกวันหยุดด้วยตนเอง",
  );
}

function buildMonthCells(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startOffset);
  const today = todayKey();

  return Array.from({ length: 42 }, (_, index): CalendarCell => {
    const date = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + index,
    );
    return {
      date,
      dateKey: isoDateKey(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
      isToday: isoDateKey(date) === today,
    };
  });
}

/**
 * สีของป้ายในปฏิทิน
 * ใช้แค่สองระดับพอ: วันหยุดทั่วไปเป็นเทา ส่วนที่ต้องสังเกต (วันที่ถูกสลับเป็นวันทำงาน)
 * เป็นเหลืองอำพัน — ก่อนหน้านี้ใช้ห้าสีทำให้ปฏิทินลายตาจนหาวันจริงไม่เจอ
 */
function eventToneClass(tone: CalendarEvent["tone"]) {
  if (tone === "amber" || tone === "rose")
    return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-100 bg-white/70 text-rose-700";
}

function getHolidaySwapScopeLabel(
  scopeType?: AttendanceHolidaySwapScopeType | null,
) {
  if (scopeType === "COMPANY") return "บริษัท";
  if (scopeType === "BRANCH") return "สาขา";
  if (scopeType === "DEPARTMENT") return "แผนก";
  if (scopeType === "EMPLOYEE") return "พนักงาน";
  return "ไม่ระบุ";
}

function formatHolidaySwapSummary(swap: AttendanceHolidaySwap) {
  /* ไม่มีวันหยุดเดิม = ให้วันหยุดเพิ่ม ไม่ใช่การสลับ จึงไม่มีลูกศรจากวันไหน */
  if (!swap.originalHolidayDate) {
    return `ให้หยุดเพิ่ม ${formatThaiDate(swap.swappedHolidayDate)}`;
  }
  return `${formatThaiDate(swap.originalHolidayDate)} → ${formatThaiDate(swap.swappedHolidayDate)}`;
}

export function HolidaySettingsPanel({
  weeklyHolidays,
  onWeeklyHolidaysChange,
  onSaveWeeklyHolidays,
  savingWeeklyHolidays = false,
  summary,
}: Props) {
  const [activeMode, setActiveMode] = useState<ManagementMode>("holidays");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [calendarView, setCalendarView] = useState<"month" | "year">("month");
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => todayKey());
  const [customHolidays, setCustomHolidays] = useState<
    AttendanceCustomHoliday[]
  >([]);
  const [holidaySwaps, setHolidaySwaps] = useState<AttendanceHolidaySwap[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importYear, setImportYear] = useState(() => new Date().getFullYear());
  const [importItems, setImportItems] = useState<PublicHolidayImportItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [holidayDate, setHolidayDate] = useState(selectedDate);
  const [holidayName, setHolidayName] = useState("วันหยุดบริษัท");
  const [holidayType, setHolidayType] =
    useState<AttendanceCustomHolidayType>("COMPANY");

  const [swapOriginalDate, setSwapOriginalDate] = useState(selectedDate);
  const [swapReplacementDate, setSwapReplacementDate] = useState(selectedDate);
  const [swapScopeType, setSwapScopeType] =
    useState<AttendanceHolidaySwapScopeType>("COMPANY");
  const [swapScopeId, setSwapScopeId] = useState("");
  const [swapName, setSwapName] = useState("สลับวันหยุด");
  const [swapReason, setSwapReason] = useState("");

  const loadHolidayData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [holidays, swaps, employeeResult] = await Promise.all([
        getHolidayCalendars(),
        getHolidaySwaps(),
        getHolidaySettingEmployees({ page: 1, pageSize: 300 }),
      ]);
      setCustomHolidays(holidays);
      setHolidaySwaps(swaps);
      setEmployees(employeeResult.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลวันหยุดไม่ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHolidayData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadHolidayData]);

  const calendarCells = useMemo(() => buildMonthCells(viewDate), [viewDate]);

  /** เลื่อนปฏิทินทีละเดือน (หรือทีละปีเมื่ออยู่มุมมองรายปี) */
  function shiftView(step: number) {
    setViewDate((current) =>
      calendarView === "year"
        ? new Date(current.getFullYear() + step, current.getMonth(), 1)
        : new Date(current.getFullYear(), current.getMonth() + step, 1),
    );
  }
  const currentMonthKey = monthKey(viewDate);
  const viewYear = viewDate.getFullYear();

  const monthlySummaries = useMemo(() => {
    return Array.from({ length: 12 }, (_, month) => {
      const key = `${viewYear}-${padNumber(month + 1)}`;
      const holidays = customHolidays.filter((item) =>
        item.date?.startsWith(key),
      ).length;
      const swaps = holidaySwaps.filter(
        (item) =>
          item.originalHolidayDate?.startsWith(key) ||
          item.swappedHolidayDate?.startsWith(key),
      ).length;
      return { month, key, holidays, swaps };
    });
  }, [customHolidays, holidaySwaps, viewYear]);

  const employeeOptions = useMemo<SelectOption[]>(() => {
    return employees
      .map((employee) => ({
        id: employee.id,
        label: `${employee.employeeCode} - ${formatEmployeeName(employee)}`,
        subLabel: [
          employee.position,
          formatMaster(employee.department),
          formatMaster(employee.branch),
        ]
          .filter(Boolean)
          .join(" / "),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [employees]);

  const departmentOptions = useMemo(
    () => buildUniqueOptions(employees, "department"),
    [employees],
  );
  const branchOptions = useMemo(
    () => buildUniqueOptions(employees, "branch"),
    [employees],
  );
  const companyOptions = useMemo(
    () => buildUniqueOptions(employees, "company"),
    [employees],
  );

  const swapTargetOptions = useMemo(() => {
    if (swapScopeType === "COMPANY") return companyOptions;
    if (swapScopeType === "BRANCH") return branchOptions;
    if (swapScopeType === "DEPARTMENT") return departmentOptions;
    return employeeOptions;
  }, [
    branchOptions,
    companyOptions,
    departmentOptions,
    employeeOptions,
    swapScopeType,
  ]);

  const monthCustomHolidays = useMemo(
    () =>
      customHolidays.filter((holiday) =>
        holiday.date?.startsWith(currentMonthKey),
      ),
    [customHolidays, currentMonthKey],
  );

  const monthHolidaySwaps = useMemo(
    () =>
      holidaySwaps.filter(
        (item) =>
          item.originalHolidayDate?.startsWith(currentMonthKey) ||
          item.swappedHolidayDate?.startsWith(currentMonthKey),
      ),
    [currentMonthKey, holidaySwaps],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const add = (date: string, event: CalendarEvent) => {
      const list = map.get(date) ?? [];
      list.push(event);
      map.set(date, list);
    };

    for (const cell of calendarCells) {
      if (weeklyHolidays.includes(weekdayFromDate(cell.date))) {
        add(cell.dateKey, {
          key: `weekly-${cell.dateKey}`,
          kind: "WEEKLY",
          label: "หยุดประจำสัปดาห์",
          tone: "sky",
        });
      }
    }

    for (const holiday of customHolidays) {
      if (!holiday.date) continue;
      add(holiday.date, {
        key: `holiday-${holiday.id ?? holiday.date}`,
        kind: "CUSTOM",
        label: holiday.name || getHolidayTypeLabel(holiday.holidayType),
        helper: getHolidayTypeLabel(holiday.holidayType),
        tone: holidayTypeTone(holiday.holidayType),
      });
    }

    for (const swap of holidaySwaps) {
      if (swap.status !== "ACTIVE") continue;
      /* ไม่มีวันหยุดเดิม = ให้วันหยุดเพิ่ม ไม่มีวันไหนกลายเป็นวันทำงาน */
      if (swap.originalHolidayDate) {
        add(swap.originalHolidayDate, {
          key: `swap-workday-${swap.id}`,
          kind: "SWAP_WORKDAY",
          label: "สลับเป็นวันทำงาน",
          helper: `${getHolidaySwapScopeLabel(swap.scopeType)} · ${swap.scopeName ?? swap.scopeId}`,
          tone: "amber",
        });
      }
      add(swap.swappedHolidayDate, {
        key: `swap-holiday-${swap.id}`,
        kind: "SWAP_HOLIDAY",
        label: swap.originalHolidayDate
          ? "วันหยุดที่สลับมา"
          : "วันหยุดที่ให้เพิ่ม",
        helper: swap.originalHolidayDate
          ? `${formatThaiDate(swap.originalHolidayDate)} → ${formatThaiDate(swap.swappedHolidayDate)}`
          : `${getHolidaySwapScopeLabel(swap.scopeType)} · ${swap.scopeName ?? swap.scopeId}`,
        tone: "sky",
      });
    }

    return map;
  }, [calendarCells, customHolidays, holidaySwaps, weeklyHolidays]);

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const selectedCustomHolidays = customHolidays.filter(
    (holiday) => holiday.date === selectedDate,
  );
  const selectedHolidaySwaps = holidaySwaps.filter(
    (item) =>
      item.originalHolidayDate === selectedDate ||
      item.swappedHolidayDate === selectedDate,
  );
  const importYearOptions = useMemo(() => {
    const baseYear = viewDate.getFullYear();
    return Array.from(
      new Set([baseYear - 1, baseYear, baseYear + 1, new Date().getFullYear()]),
    ).sort((a, b) => a - b);
  }, [viewDate]);
  const selectedImportCount = importItems.filter(
    (item) => item.selected && !isExistingImportedHoliday(item.date, item.name),
  ).length;
  const availableImportCount = importItems.filter(
    (item) => !isExistingImportedHoliday(item.date, item.name),
  ).length;

  function isExistingImportedHoliday(date: string, name: string) {
    const normalizedName = normalizeHolidayText(name);
    return customHolidays.some((holiday) => {
      if (holiday.date !== date) return false;
      return (
        holiday.holidayType === "PUBLIC" ||
        normalizeHolidayText(holiday.name || "") === normalizedName
      );
    });
  }

  async function addHoliday() {
    setError(null);
    setNotice(null);
    const date = holidayDate.trim();
    const name = holidayName.trim() || getHolidayTypeLabel(holidayType);
    if (!hasValidDate(date)) {
      setError("กรุณาเลือกวันที่วันหยุดให้ถูกต้อง");
      return;
    }
    setSaving(true);
    try {
      const result = await createHolidayCalendar({ date, name, holidayType });
      setCustomHolidays(result);
      setSelectedDate(date);
      setHolidayDate(date);
      setHolidayName("วันหยุดบริษัท");
      setHolidayType("COMPANY");
      setNotice("บันทึกวันหยุดลงตารางจริงแล้ว");
      setModalMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกวันหยุดไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  async function fetchPublicHolidayPreview() {
    setImporting(true);
    setImportError(null);
    setNotice(null);
    setError(null);
    try {
      const items = await fetchThailandPublicHolidays(importYear);
      if (items.length === 0) {
        setImportItems([]);
        setImportError("ไม่พบข้อมูลวันหยุดนักขัตฤกษ์ของปีที่เลือก");
        return;
      }
      setImportItems(
        items.map((item) => ({
          ...item,
          selected: !isExistingImportedHoliday(item.date, item.name),
        })),
      );
      setNotice(
        `ได้วันหยุดนักขัตฤกษ์ปี ${importYear + 543} มา ${items.length.toLocaleString("th-TH")} รายการ`,
      );
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "ดึงข้อมูลวันหยุดนักขัตฤกษ์ไม่ได้",
      );
    } finally {
      setImporting(false);
    }
  }

  function toggleImportItem(key: string) {
    setImportItems((current) =>
      current.map((item) =>
        item.key === key && !isExistingImportedHoliday(item.date, item.name)
          ? { ...item, selected: !item.selected }
          : item,
      ),
    );
  }

  function selectAllImportItems() {
    setImportItems((current) =>
      current.map((item) => ({
        ...item,
        selected: !isExistingImportedHoliday(item.date, item.name),
      })),
    );
  }

  function clearImportSelection() {
    setImportItems((current) =>
      current.map((item) => ({ ...item, selected: false })),
    );
  }

  async function saveImportedPublicHolidays() {
    const selectedItems = importItems.filter(
      (item) =>
        item.selected && !isExistingImportedHoliday(item.date, item.name),
    );
    if (selectedItems.length === 0) {
      setImportError("กรุณาเลือกวันหยุดใหม่อย่างน้อย 1 รายการก่อนบันทึก");
      return;
    }

    setSavingImport(true);
    setImportError(null);
    setNotice(null);
    setError(null);
    try {
      let latest = customHolidays;
      for (const item of selectedItems) {
        latest = await createHolidayCalendar({
          date: item.date,
          name: item.name,
          holidayType: "PUBLIC",
        });
      }
      setCustomHolidays(latest);
      setImportItems((current) =>
        current.map((item) => ({
          ...item,
          selected: false,
        })),
      );
      setNotice(
        `นำเข้าวันหยุดนักขัตฤกษ์ ${selectedItems.length.toLocaleString("th-TH")} รายการเรียบร้อยแล้ว`,
      );
      await loadHolidayData();
      setModalMode(null);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "บันทึกวันหยุดนักขัตฤกษ์ไม่ได้",
      );
    } finally {
      setSavingImport(false);
    }
  }

  async function removeHoliday(holiday: AttendanceCustomHoliday) {
    if (!holiday.id) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteHolidayCalendar(holiday.id);
      await loadHolidayData();
      setNotice("ลบวันหยุดเรียบร้อยแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบวันหยุดไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  async function addHolidaySwap() {
    setError(null);
    setNotice(null);
    if (!swapOriginalDate || !swapReplacementDate) {
      setError("กรุณาเลือกวันที่หยุดเดิมและวันที่หยุดใหม่");
      return;
    }
    if (swapOriginalDate === swapReplacementDate) {
      setError("วันที่หยุดเดิมและวันที่หยุดใหม่ต้องไม่ซ้ำกัน");
      return;
    }
    if (!swapScopeId) {
      setError("กรุณาเลือกขอบเขตที่มีผล");
      return;
    }

    setSaving(true);
    try {
      const result = await createHolidaySwap({
        originalHolidayDate: swapOriginalDate,
        swappedHolidayDate: swapReplacementDate,
        scopeType: swapScopeType,
        scopeId: swapScopeId,
        name: swapName.trim() || "สลับวันหยุด",
        reason: swapReason.trim() || null,
      });
      setHolidaySwaps(result);
      setSwapOriginalDate(selectedDate);
      setSwapReplacementDate(selectedDate);
      setSwapScopeType("COMPANY");
      setSwapScopeId("");
      setSwapName("สลับวันหยุด");
      setSwapReason("");
      setNotice("บันทึกรายการสลับวันหยุดแล้ว");
      setModalMode(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "บันทึกรายการสลับวันหยุดไม่ได้",
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelSwap(id: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await cancelHolidaySwap(id, {
        cancelReason: "ยกเลิกจากหน้าปฏิทินวันหยุด",
      });
      setHolidaySwaps(await getHolidaySwaps());
      setNotice("ยกเลิกรายการสลับวันหยุดแล้ว");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "ยกเลิกรายการสลับวันหยุดไม่ได้",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeSwap(id: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteHolidaySwap(id);
      setHolidaySwaps((current) => current.filter((item) => item.id !== id));
      setNotice("ลบรายการสลับวันหยุดแล้ว");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "ลบรายการสลับวันหยุดไม่ได้",
      );
    } finally {
      setSaving(false);
    }
  }

  function selectCalendarDate(dateKey: string) {
    setSelectedDate(dateKey);
    setHolidayDate(dateKey);
    setSwapOriginalDate(dateKey);
  }

  function selectMonthFromYear(month: number) {
    setViewDate(new Date(viewYear, month, 1));
    setCalendarView("month");
  }

  function renderPublicHolidayImportCard() {
    return (
      <div className="w-full">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-none">
          <div className="grid gap-4 border-b border-slate-200/80 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:justify-between">
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-slate-900 3xl:text-[16.5px]">
                นำเข้าวันหยุดนักขัตฤกษ์ไทย
              </h3>
              <p className="mt-1 max-w-3xl text-[13px] leading-6 text-slate-500">
                เลือกปีแล้วกดนำเข้า
                ระบบจะแสดงรายการให้ตรวจก่อนบันทึกลงปฏิทินบริษัท
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(0,170px)_auto] md:w-auto">
              <select
                value={importYear}
                onChange={(event) => {
                  setImportYear(Number(event.target.value));
                  setImportItems([]);
                  setImportError(null);
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                {importYearOptions.map((year) => (
                  <option key={year} value={year}>
                    พ.ศ. {year + 543}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void fetchPublicHolidayPreview()}
                disabled={importing || savingImport}
                className={`${buttonPrimaryClass} w-full whitespace-nowrap`}
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                นำเข้าวันหยุด
              </button>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5">
            {importError ? (
              <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
                {importError}
              </div>
            ) : null}

            {importItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white/80 px-4 py-5 text-center text-[12px] text-slate-400">
                เลือกปีแล้วกด “นำเข้าวันหยุด” เพื่อดูรายการก่อนบันทึก
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                      Preview วันหยุด พ.ศ. {importYear + 543}
                    </p>
                    <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-500 max-[1536px]:text-[11px]">
                      เลือกแล้ว {selectedImportCount.toLocaleString("th-TH")}{" "}
                      จาก {availableImportCount.toLocaleString("th-TH")}{" "}
                      รายการใหม่
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllImportItems}
                      disabled={savingImport}
                      className={buttonSecondaryClass}
                    >
                      เลือกทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={clearImportSelection}
                      disabled={savingImport}
                      className={buttonSecondaryClass}
                    >
                      ล้างเลือก
                    </button>
                  </div>
                </div>

                <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 lg:grid-cols-2">
                  {importItems.map((item) => {
                    const existing = isExistingImportedHoliday(
                      item.date,
                      item.name,
                    );
                    return (
                      <label
                        key={item.key}
                        className={joinClassName(
                          "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-[13px] 3xl:text-[13.5px] transition",
                          existing
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                            : item.selected
                              ? "border-slate-200 bg-brand-50 text-brand-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-200",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={item.selected && !existing}
                          disabled={existing || savingImport}
                          onChange={() => toggleImportItem(item.key)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{item.name}</span>
                            {existing ? (
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-slate-500">
                                มีอยู่แล้ว
                              </span>
                            ) : (
                              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-emerald-700">
                                รายการใหม่
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-500">
                            {formatThaiDate(item.date)} · แหล่งข้อมูล:{" "}
                            {item.sourceName}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => void saveImportedPublicHolidays()}
                  disabled={savingImport || selectedImportCount === 0}
                  className={`${buttonPrimaryClass} w-full sm:w-auto`}
                >
                  {savingImport ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  บันทึกเข้าปฏิทินบริษัท
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderManagementPanel() {
    if (activeMode === "weekly") {
      return (
        <div className="space-y-4">
          <SectionHeading
            title="วันหยุดประจำสัปดาห์"
            description="เลือกวันหยุดประจำที่ต้องการให้แสดงบนปฏิทิน ระบบจะบันทึกลง System Settings เดิม"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {weekdayOptions.map((option) => {
              const checked = weeklyHolidays.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={joinClassName(
                    "flex h-12 cursor-pointer items-center justify-between rounded-lg border px-3 text-[13px] 3xl:text-[13.5px] font-bold transition",
                    checked
                      ? "border-slate-200 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-200",
                  )}
                >
                  <span>{option.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onWeeklyHolidaysChange(
                        toggleWeekday(weeklyHolidays, option.value),
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                </label>
              );
            })}
          </div>
          {onSaveWeeklyHolidays ? (
            <button
              type="button"
              onClick={onSaveWeeklyHolidays}
              disabled={savingWeeklyHolidays}
              className={buttonPrimaryClass}
            >
              {savingWeeklyHolidays ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              บันทึกวันหยุดประจำสัปดาห์
            </button>
          ) : null}
        </div>
      );
    }

    if (activeMode === "swap") {
      return (
        <div className="space-y-4">
          <SectionHeading
            title="สลับวันหยุด"
            description="กำหนดวันหยุดเดิมให้เป็นวันทำงาน และเลือกวันหยุดใหม่แทน โดยระบุขอบเขตบริษัท สาขา แผนก หรือพนักงาน"
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold text-slate-500">
                วันที่หยุดเดิม
              </label>
              <ThaiDateInput
                value={swapOriginalDate}
                onChange={(event) => setSwapOriginalDate(event.target.value)}
                className={dateFieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold text-slate-500">
                วันที่หยุดใหม่
              </label>
              <ThaiDateInput
                value={swapReplacementDate}
                onChange={(event) => setSwapReplacementDate(event.target.value)}
                className={dateFieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold text-slate-500">
                ขอบเขตที่มีผล
              </label>
              <select
                value={swapScopeType}
                onChange={(event) => {
                  setSwapScopeType(
                    event.target.value as AttendanceHolidaySwapScopeType,
                  );
                  setSwapScopeId("");
                }}
                className={inputClass}
              >
                <option value="COMPANY">บริษัท</option>
                <option value="BRANCH">สาขา</option>
                <option value="DEPARTMENT">แผนก</option>
                <option value="EMPLOYEE">พนักงาน</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold text-slate-500">
                เลือกรายการตามขอบเขต
              </label>
              <select
                value={swapScopeId}
                onChange={(event) => setSwapScopeId(event.target.value)}
                className={inputClass}
              >
                <option value="">
                  เลือก{getHolidaySwapScopeLabel(swapScopeType)}
                </option>
                {swapTargetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {option.subLabel ? ` · ${option.subLabel}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold text-slate-500">
                ชื่อรายการ
              </label>
              <input
                value={swapName}
                onChange={(event) => setSwapName(event.target.value)}
                className={inputClass}
                placeholder="เช่น สลับวันหยุดช่วงสงกรานต์"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold text-slate-500">
                เหตุผล
              </label>
              <textarea
                value={swapReason}
                onChange={(event) => setSwapReason(event.target.value)}
                className={textareaClass}
                placeholder="ระบุเหตุผลการสลับวันหยุด"
              />
            </div>
            <button
              type="button"
              onClick={() => void addHolidaySwap()}
              disabled={saving}
              className={`${buttonPrimaryClass} lg:col-span-2`}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-4 w-4" />
              )}
              บันทึกการสลับวันหยุด
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                  รายการสลับวันหยุดทั้งหมด
                </p>
                <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-500">
                  แสดงรายการ ACTIVE/CANCELLED จากตารางจริง
                </p>
              </div>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {holidaySwaps.length === 0 ? (
                <EmptyInline title="ยังไม่มีรายการสลับวันหยุด" />
              ) : (
                holidaySwaps.map((swap) => (
                  <div
                    key={swap.id}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                          {swap.name || "สลับวันหยุด"}
                        </p>
                        <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-500 max-[1536px]:text-[11px]">
                          {formatHolidaySwapSummary(swap)} ·{" "}
                          {getHolidaySwapScopeLabel(swap.scopeType)} ·{" "}
                          {swap.scopeName ?? swap.scopeId}
                        </p>
                        {swap.reason ? (
                          <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-400">
                            {swap.reason}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={joinClassName(
                          "inline-flex w-fit rounded-full border px-2.5 py-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold",
                          swap.status === "ACTIVE"
                            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-500",
                        )}
                      >
                        {swap.status === "ACTIVE" ? "ใช้งาน" : "ยกเลิก"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {swap.status === "ACTIVE" ? (
                        <button
                          type="button"
                          onClick={() => void cancelSwap(swap.id)}
                          disabled={saving}
                          className={buttonDangerClass}
                        >
                          ยกเลิก
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void removeSwap(swap.id)}
                        disabled={saving}
                        className={buttonDangerClass}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        ลบ
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <SectionHeading
          title="เพิ่มวันหยุดบริษัท / วันหยุดพิเศษ"
          description="เลือกวันที่จากปฏิทินหรือกรอกวันที่เอง แล้วเพิ่มลงตารางวันหยุดจริง"
        />
        <div className="grid gap-3">
          <ThaiDateInput
            value={holidayDate}
            onChange={(event) => setHolidayDate(event.target.value)}
            className={dateFieldClass}
          />
          <input
            value={holidayName}
            onChange={(event) => setHolidayName(event.target.value)}
            placeholder="ชื่อวันหยุด"
            className={inputClass}
          />
          <select
            value={holidayType}
            onChange={(event) =>
              setHolidayType(event.target.value as AttendanceCustomHolidayType)
            }
            className={inputClass}
          >
            {holidayTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void addHoliday()}
            disabled={saving || savingImport}
            className={buttonPrimaryClass}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            เพิ่มวันหยุด
          </button>
        </div>
      </div>
    );
  }

  const sortedMonthCustomHolidays = [...monthCustomHolidays].sort((a, b) =>
    (a.date || "").localeCompare(b.date || ""),
  );
  const sortedMonthHolidaySwaps = [...monthHolidaySwaps].sort((a, b) =>
    (a.originalHolidayDate || "").localeCompare(b.originalHolidayDate || ""),
  );
  const sortedSelectedEvents = [...selectedEvents].sort((a, b) =>
    a.kind.localeCompare(b.kind),
  );
  const currentModal =
    modalMode === "import"
      ? null
      : managementModes.find((mode) => mode.value === modalMode);

  return (
    <div className="bg-white">
      <div className="overflow-x-auto bg-white">
        {error ? (
          <div className="border-b border-rose-100 bg-rose-50/70 px-5 py-2.5 text-[12.5px] font-semibold text-rose-700 sm:px-6 3xl:px-7 3xl:text-[13px]">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="border-b border-emerald-100 bg-emerald-50/70 px-5 py-2.5 text-[12.5px] font-semibold text-emerald-700 sm:px-6 3xl:px-7 3xl:text-[13px]">
            {notice}
          </div>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 border-b border-brand-100 bg-brand-50/60 px-5 py-2.5 text-[12.5px] font-semibold text-brand-700 sm:px-6 3xl:px-7 3xl:text-[13px]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            กำลังโหลดข้อมูลวันหยุดจากตารางจริง
          </div>
        ) : null}

        {/*
          แถบเครื่องมือพื้นเทาอ่อน ชุดเดียวกับหน้าอื่นทั้งระบบ
          หัวเรื่องกับคำอธิบายอยู่ที่หัวหน้าแล้ว ไม่ต้องเขียนซ้ำในแท็บ
        */}
        <section className="border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 3xl:px-7">
          <div className="flex flex-wrap items-center gap-2">
            {summary ? (
              <p className="mr-auto min-w-0 text-[12.5px] text-slate-500 3xl:text-[13px]">
                {summary}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setActiveMode("holidays");
                setHolidayDate(selectedDate);
                setModalMode("holidays");
              }}
              className={buttonPrimaryClass}
            >
              <Plus className="h-4 w-4" />
              เพิ่มวันหยุด
            </button>
            <button
              type="button"
              onClick={() => setModalMode("import")}
              className={buttonSecondaryClass}
            >
              <Download className="h-4 w-4" />
              นำเข้าวันหยุด
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("weekly");
                setModalMode("weekly");
              }}
              className={buttonSecondaryClass}
            >
              <CalendarDays className="h-4 w-4" />
              วันหยุดประจำสัปดาห์
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("swap");
                setSwapOriginalDate(selectedDate);
                setSwapReplacementDate(selectedDate);
                setModalMode("swap");
              }}
              className={buttonSecondaryClass}
            >
              <ArrowLeftRight className="h-4 w-4" />
              สลับวันหยุด
            </button>
            <button
              type="button"
              onClick={() => void loadHolidayData()}
              disabled={loading}
              className={buttonSecondaryClass}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              รีเฟรช
            </button>
          </div>
        </section>

        <div className="grid min-w-[900px] grid-cols-[minmax(0,1fr)_clamp(300px,24vw,390px)] divide-x divide-slate-200 border-b border-slate-200 bg-white max-[1536px]:min-w-[780px] max-[1536px]:grid-cols-[minmax(0,1fr)_300px] max-[1536px]:gap-3 max-[1536px]:px-3 max-[1536px]:py-3 max-[1280px]:min-w-[720px] max-[1280px]:grid-cols-[minmax(0,1fr)_270px] max-[1280px]:gap-2.5">
          <section className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3 sm:px-5 max-[1536px]:gap-2 max-[1536px]:px-3 max-[1536px]:py-2">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  Holiday Calendar
                </p>
                <h2 className="mt-0.5 truncate text-[15px] font-bold text-slate-900 3xl:text-[16.5px]">
                  {calendarView === "year"
                    ? yearTitle(viewDate)
                    : monthTitle(viewDate)}
                </h2>
                <p className="mt-1 text-[12px] text-slate-400">
                  {calendarView === "year"
                    ? "คลิกเดือนเพื่อเปิดปฏิทินรายวันของเดือนนั้น"
                    : "คลิกวันที่เพื่อดูรายละเอียดด้านขวา หรือกดเพิ่มวันหยุดจากปุ่มด้านบน"}
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                {/* เลื่อนดูทีละเดือน (มุมมองรายปีเลื่อนทีละปี) */}
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => shiftView(-1)}
                    aria-label={
                      calendarView === "year" ? "ปีก่อนหน้า" : "เดือนก่อนหน้า"
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-l-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewDate(new Date())}
                    title="กลับไปเดือนปัจจุบัน"
                    className="h-8 whitespace-nowrap border-x border-slate-200 px-3 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    {calendarView === "year"
                      ? yearTitle(viewDate)
                      : monthTitle(viewDate)}
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftView(1)}
                    aria-label={
                      calendarView === "year" ? "ปีถัดไป" : "เดือนถัดไป"
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-r-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="inline-flex w-[170px] rounded-lg border border-slate-200 bg-slate-50 p-1 max-[1536px]:w-[150px] max-[1280px]:w-[140px]">
                  <button
                    type="button"
                    onClick={() => setCalendarView("month")}
                    className={joinClassName(
                      "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg px-2.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold transition max-[1536px]:h-7 max-[1536px]:gap-1 max-[1536px]:px-1.5 max-[1536px]:text-[10px] max-[1280px]:text-[9px]",
                      calendarView === "month"
                        ? "bg-white text-slate-900"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    <CalendarDays className="h-4 w-4 max-[1536px]:h-3.5 max-[1536px]:w-3.5 max-[1280px]:h-3 max-[1280px]:w-3" />
                    เดือน
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarView("year")}
                    className={joinClassName(
                      "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg px-2.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold transition max-[1536px]:h-7 max-[1536px]:gap-1 max-[1536px]:px-1.5 max-[1536px]:text-[10px] max-[1280px]:text-[9px]",
                      calendarView === "year"
                        ? "bg-white text-slate-900"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    <LayoutGrid className="h-4 w-4 max-[1536px]:h-3.5 max-[1536px]:w-3.5 max-[1280px]:h-3 max-[1280px]:w-3" />
                    ทั้งปี
                  </button>
                </div>
              </div>
            </div>

            {calendarView === "year" ? (
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3">
                {monthlySummaries.map((summary) => {
                  const isCurrentMonth = summary.key === monthKey(new Date());
                  const hasEvents = summary.holidays + summary.swaps > 0;
                  return (
                    <button
                      type="button"
                      key={summary.key}
                      onClick={() => selectMonthFromYear(summary.month)}
                      className={joinClassName(
                        "group flex min-h-[128px] flex-col border-b border-r border-slate-200 p-4 text-left transition hover:bg-brand-50/50 max-[1536px]:min-h-[104px] max-[1536px]:p-3",
                        isCurrentMonth
                          ? "border-brand-300 bg-brand-50/60 ring-2 ring-inset ring-brand-200"
                          : "bg-white",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {monthShortTitle(viewYear, summary.month)}
                        </span>
                        {isCurrentMonth ? (
                          <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-bold text-white">
                            เดือนนี้
                          </span>
                        ) : null}
                      </div>
                      {hasEvents ? (
                        <div className="mt-3 flex flex-1 flex-col gap-1.5">
                          {summary.holidays > 0 ? (
                            <MonthStatRow
                              tone="sky"
                              label="วันหยุด"
                              value={summary.holidays}
                            />
                          ) : null}
                          {summary.swaps > 0 ? (
                            <MonthStatRow
                              tone="emerald"
                              label="สลับวันหยุด"
                              value={summary.swaps}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-1 items-center">
                          <span className="text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-400">
                            ไม่มีรายการ
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <div className="w-full min-w-[560px] max-[1536px]:min-w-[500px] max-[1280px]:min-w-[460px]">
                  <div className="grid grid-cols-7 bg-slate-50 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 max-[1536px]:text-[11px] max-[1536px]:tracking-[0.08em]">
                    {weekdayOptions.map((weekday) => (
                      <div
                        key={weekday.value}
                        className="border-r border-slate-200/80 px-3 py-3 last:border-r-0 max-[1536px]:px-2 max-[1536px]:py-2.5 max-[1280px]:px-1 max-[1280px]:py-2"
                      >
                        {weekday.label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 border-b border-slate-200/80 bg-white">
                    {calendarCells.map((cell) => {
                      const events = eventsByDate.get(cell.dateKey) ?? [];
                      const isSwapWorkday = events.some(
                        (event) => event.kind === "SWAP_WORKDAY",
                      );
                      const isHoliday = !isSwapWorkday && events.length > 0;
                      const selected = selectedDate === cell.dateKey;
                      return (
                        <button
                          type="button"
                          key={cell.dateKey}
                          onClick={() => selectCalendarDate(cell.dateKey)}
                          className={joinClassName(
                            "min-h-[88px] border-r border-t border-slate-200/80 px-2 py-1.5 text-left align-top transition last:border-r-0 hover:bg-slate-50 max-[1536px]:min-h-[62px] max-[1536px]:px-1.5 max-[1536px]:py-1 max-[1280px]:min-h-[56px]",
                            // วันหยุดพื้นชมพูจาง กวาดตาเจอทันทีว่าเดือนนี้หยุดวันไหน
                            isHoliday && cell.inCurrentMonth && "bg-rose-50/70",
                            isSwapWorkday &&
                              cell.inCurrentMonth &&
                              "bg-amber-50/70",
                            // วันของเดือนอื่นจางที่สุด ไม่ต้องแย่งสายตา
                            !cell.inCurrentMonth &&
                              "bg-slate-50/60 text-slate-300 [&_*]:!text-slate-300 [&_span]:!border-slate-100 [&_span]:!bg-transparent",
                            selected && "ring-1 ring-inset ring-brand-400",
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span
                              className={joinClassName(
                                "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[13px] 3xl:text-[13.5px] font-bold max-[1536px]:h-6 max-[1536px]:min-w-6 max-[1536px]:text-xs",
                                cell.isToday
                                  ? "bg-brand-600 text-white"
                                  : isHoliday
                                    ? "text-rose-600"
                                    : isSwapWorkday
                                      ? "text-amber-700"
                                      : "text-slate-800",
                                !cell.inCurrentMonth && "text-slate-400",
                              )}
                            >
                              {cell.day}
                            </span>
                            {events.length > 0 ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-slate-500 max-[1536px]:px-1.5 max-[1536px]:text-[10px]">
                                {events.length}
                              </span>
                            ) : null}
                          </div>
                          <div className="space-y-1">
                            {events.slice(0, 2).map((event) => (
                              <span
                                key={event.key}
                                className={`block truncate rounded border px-1.5 py-0.5 text-[11px] font-medium max-[1536px]:text-[10px] ${eventToneClass(event.tone)}`}
                              >
                                {event.label}
                              </span>
                            ))}
                            {events.length > 2 ? (
                              <span className="block text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-slate-400">
                                +{events.length - 2} รายการ
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="min-w-0">
            <section className="border-b border-slate-200/80 p-4 max-[1536px]:p-2.5 max-[1280px]:p-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                    Selected Date
                  </p>
                  <h3 className="mt-0.5 text-[15px] font-bold text-slate-900 3xl:text-[16.5px]">
                    {formatThaiDate(selectedDate)}
                  </h3>
                  <p className="mt-1 text-[12px] text-slate-400">
                    {selectedEvents.length > 0
                      ? `${selectedEvents.length.toLocaleString("th-TH")} รายการในวันนี้`
                      : "ยังไม่มีรายการในวันนี้"}
                  </p>
                </div>
              </div>

              <div className="mt-3 divide-y divide-slate-100 border-t border-slate-200 max-[1536px]:mt-2">
                {sortedSelectedEvents.length === 0 ? (
                  <EmptyInline title="ไม่มีวันหยุดหรือรายการทำงานวันหยุดในวันที่เลือก" />
                ) : (
                  sortedSelectedEvents.map((event) => (
                    <div
                      key={event.key}
                      className={`px-1 py-3 text-slate-800 ${eventToneClass(event.tone)}`}
                    >
                      <p className="text-[13px] 3xl:text-[13.5px] font-bold">
                        {event.label}
                      </p>
                      {event.helper ? (
                        <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold opacity-80">
                          {event.helper}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 grid gap-0 border-t border-slate-200 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-600 max-[1536px]:mt-2 max-[1536px]:text-[11px]">
                <InfoLine
                  label="วันหยุดบริษัท/พิเศษ"
                  value={`${selectedCustomHolidays.length.toLocaleString("th-TH")} รายการ`}
                />
                <InfoLine
                  label="สลับวันหยุด"
                  value={`${selectedHolidaySwaps.length.toLocaleString("th-TH")} รายการ`}
                />
              </div>
            </section>

            <section className="p-4 max-[1536px]:p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                    Holiday List
                  </p>
                  <h3 className="mt-0.5 text-[15px] font-bold text-slate-900 3xl:text-[16.5px]">
                    รายการวันหยุดเดือนนี้
                  </h3>
                  <p className="mt-1 text-[12px] text-slate-400">
                    {monthTitle(viewDate)} ·{" "}
                    {sortedMonthCustomHolidays.length.toLocaleString("th-TH")}{" "}
                    รายการ
                  </p>
                </div>
              </div>

              <div className="mt-3 max-h-[300px] min-h-[150px] overflow-y-auto border-t border-slate-200 max-[1536px]:mt-2 max-[1536px]:max-h-[240px] max-[1536px]:min-h-[120px]">
                {sortedMonthCustomHolidays.length === 0 ? (
                  <EmptyInline title="ยังไม่มีวันหยุดในเดือนนี้" />
                ) : (
                  sortedMonthCustomHolidays.map((holiday) => (
                    <div
                      key={holiday.id ?? holiday.date}
                      className="border-b border-slate-200 px-1 py-3 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-slate-900 3xl:text-[14px] max-[1536px]:text-xs">
                            {holiday.name}
                          </p>
                          <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-500 max-[1536px]:text-[11px]">
                            {formatThaiDate(holiday.date)} ·{" "}
                            {getHolidayTypeLabel(holiday.holidayType)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeHoliday(holiday)}
                          disabled={saving || !holiday.id}
                          className={buttonDangerClass}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 border-t border-slate-200 pt-3 max-[1536px]:mt-3 max-[1536px]:pt-2.5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                      Holiday Swap
                    </p>
                    <h4 className="mt-1 text-base font-bold text-slate-900 max-[1536px]:text-sm">
                      รายการสลับวันหยุดเดือนนี้
                    </h4>
                    <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-500 max-[1536px]:text-[11px]">
                      {sortedMonthHolidaySwaps.length.toLocaleString("th-TH")}{" "}
                      รายการ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode("swap");
                      setSwapOriginalDate(selectedDate);
                      setSwapReplacementDate(selectedDate);
                      setModalMode("swap");
                    }}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-brand-50 px-3 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold text-brand-700 transition hover:bg-brand-100 max-[1536px]:h-8 max-[1536px]:px-2.5 max-[1536px]:text-[11px]"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    สลับ
                  </button>
                </div>

                <div className="divide-y divide-slate-100 border-t border-slate-200">
                  {sortedMonthHolidaySwaps.length === 0 ? (
                    <EmptyInline title="ยังไม่มีรายการสลับวันหยุดในเดือนนี้" />
                  ) : (
                    sortedMonthHolidaySwaps.map((swap) => (
                      <div key={swap.id} className="px-1 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900 3xl:text-[14px] max-[1536px]:text-xs">
                              {swap.name || "สลับวันหยุด"}
                            </p>
                            <p className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-500 max-[1536px]:text-[11px]">
                              {formatHolidaySwapSummary(swap)} ·{" "}
                              {getHolidaySwapScopeLabel(swap.scopeType)} ·{" "}
                              {swap.scopeName ?? swap.scopeId}
                            </p>
                          </div>
                          <span
                            className={joinClassName(
                              "shrink-0 rounded-full border px-2 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold",
                              swap.status === "ACTIVE"
                                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-500",
                            )}
                          >
                            {swap.status === "ACTIVE" ? "ใช้งาน" : "ยกเลิก"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {modalMode === "import" ? (
        <ModalShell
          title="นำเข้าวันหยุดนักขัตฤกษ์ไทย"
          description="ตรวจรายการก่อนบันทึกเข้าปฏิทินบริษัท"
          onClose={() => setModalMode(null)}
          wide
        >
          {renderPublicHolidayImportCard()}
        </ModalShell>
      ) : null}

      {modalMode && modalMode !== "import" ? (
        <ModalShell
          title={currentModal?.label ?? "จัดการปฏิทินวันหยุด"}
          description={currentModal?.helper ?? "แก้ไขข้อมูลวันหยุดในระบบ"}
          onClose={() => setModalMode(null)}
          wide={modalMode === "swap"}
        >
          {renderManagementPanel()}
        </ModalShell>
      ) : null}
    </div>
  );
}

function MonthStatRow({
  tone,
  label,
  value,
}: {
  tone: CalendarEvent["tone"];
  label: string;
  value: number;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-bold ${eventToneClass(tone)}`}
    >
      <span className="truncate">{label}</span>
      <span>{value.toLocaleString("th-TH")}</span>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-[13px] font-bold text-slate-900 3xl:text-[14px]">
        {title}
      </h3>
      <p className="mt-0.5 text-[12px] leading-5 text-slate-400">
        {description}
      </p>
    </div>
  );
}

function EmptyInline({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-[12px] text-slate-400">
      {title}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-1 py-2 last:border-b-0">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="text-[12px] font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function ModalShell({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:px-5"
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        className={joinClassName(
          "max-h-[92vh] w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 max-[1536px]:rounded-[1.5rem]",
          wide ? "max-w-5xl" : "max-w-2xl",
        )}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 3xl:px-6 4xl:px-7 py-4 max-[1536px]:px-4 max-[1536px]:py-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              Popup Form
            </p>
            <h3 className="mt-1 text-xl font-bold tracking-[-0.03em] text-slate-900">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-[13px] 3xl:text-[13.5px] font-semibold leading-6 text-slate-500 max-[1536px]:text-xs max-[1536px]:leading-5">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-200 hover:bg-brand-50 hover:text-brand-700"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[calc(92vh-118px)] overflow-y-auto p-5 max-[1536px]:p-4">
          {children}
        </div>
      </section>
    </div>
  );
}
