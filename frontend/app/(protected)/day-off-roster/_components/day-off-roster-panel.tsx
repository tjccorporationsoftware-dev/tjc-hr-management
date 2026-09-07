"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PermissionDenied,
} from "@/components/common/feedback-state";
import {
  Button,
  Modal,
  ModalActions,
  Notice,
  PageChip,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
} from "@/components/kit";
import { useAuth } from "@/contexts/auth-context";
import {
  apiFetch,
  createHolidaySwap,
  getAttendanceDailySummaries,
  deleteHolidaySwap,
  getCompanyPayrollSetting,
  getHolidayCalendars,
  getHolidaySwaps,
  getSystemSettings,
} from "@/lib/api";
import {
  buildCurrentPayrollPeriodRange,
  shiftPayrollPeriodRange,
  type PayrollCutoffPolicy,
  type PayrollPeriodRange,
} from "@/lib/payroll-period-range";
import type { AttendanceDailySummary } from "@/types/attendance";
import type { EmployeeListItem } from "@/types/employee";
import type {
  AttendanceCustomHoliday,
  AttendanceHolidaySwap,
  AttendanceHolidayWeekday,
} from "@/types/system-settings";

/**
 * เวรหยุดประจำเดือน
 * -----------------
 * แถวคือพนักงาน คอลัมน์คือวันที่ ใช้กับทีมที่หมุนเวรหยุดกันเอง เช่น งานจัดส่ง
 * ที่คนหนึ่งทำงานวันอาทิตย์แล้วไปหยุดวันธรรมดาแทน
 *
 * ทั้งหน้าเขียนทับกลไก `holiday_swaps` ที่มีอยู่แล้ว ไม่ได้เพิ่มโมเดลใหม่ —
 * ตัวคำนวณเวลาอ่านผ่าน `findMatchedHolidaySwap` อยู่แล้ว หน้าจอนี้เป็นแค่
 * วิธีป้อนข้อมูลที่เร็วกว่าฟอร์มทีละรายการในแท็บปฏิทินวันหยุด
 *
 * การสลับผูกกันเป็นคู่เสมอ (วันหยุดเดิม → วันหยุดใหม่) เพราะเป็นการ "ย้ายวันหยุด"
 * ไม่ใช่การแถมวันหยุด จำนวนวันหยุดต่อเดือนของแต่ละคนจึงเท่าเดิมโดยอัตโนมัติ
 */

type CellKind =
  | "work"
  | "weeklyHoliday"
  | "publicHoliday"
  | "swapOff"
  | "swapWork";

type Cell = {
  kind: CellKind;
  /** ใบสลับที่ทำให้ช่องนี้เปลี่ยนสถานะ ใช้ตอนกดถอน */
  swap: AttendanceHolidaySwap | null;
  label: string;
};

type MoveTarget = {
  employee: EmployeeListItem;
  /** วันหยุดที่จะย้ายออก (โหมดย้ายใหม่) หรือวันที่กดเข้ามา (โหมดดูรายละเอียด) */
  dateKey: string;
  cellLabel: string;
  /** มีค่า = กดที่ช่องที่ย้ายไปแล้ว เปิดเป็นโหมดดูรายละเอียด */
  swap: AttendanceHolidaySwap | null;
} | null;

const WEEKDAY_CODES: AttendanceHolidayWeekday[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

const WEEKDAY_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const WEEKDAY_FULL = [
  "อาทิตย์",
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
];

const MONTH_NAMES = [
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

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function dateKeyOfDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function thaiFullDate(key: string) {
  const date = parseDateKey(key);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear() + 543}`;
}

/** มีชื่อวันนำหน้า ใช้ในป๊อปอัพ — เวรหยุดต้องรู้ทันทีว่าเป็นวันอะไรของสัปดาห์ */
function thaiFullDateWithWeekday(key: string) {
  const date = parseDateKey(key);
  return `วัน${WEEKDAY_FULL[date.getDay()]}ที่ ${thaiFullDate(key)}`;
}

/** ป้ายชื่องวด ใช้ถ้อยคำเดียวกับหน้าตรวจสอบก่อนเข้าเงินเดือน */
function periodTitle(range: PayrollPeriodRange) {
  return `${thaiFullDate(range.dateFrom)} – ${thaiFullDate(range.dateTo)}`;
}

function employeeName(employee: EmployeeListItem) {
  const full = [employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || employee.employeeCode || "-";
}

/** เวลาในฐานข้อมูลเป็น UTC ต้องอ่านตามเวลาไทยเสมอ ไม่งั้นเช้าเป็นบ่าย */
function timeOf(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ขอบเขตที่แคบกว่าชนะ ตรงกับ getHolidaySwapScopePriority ฝั่งหลังบ้าน */
function scopePriority(swap: AttendanceHolidaySwap) {
  if (swap.scopeType === "EMPLOYEE") return 4;
  if (swap.scopeType === "DEPARTMENT") return 3;
  if (swap.scopeType === "BRANCH") return 2;
  return 1;
}

function swapCoversEmployee(
  swap: AttendanceHolidaySwap,
  employee: EmployeeListItem,
) {
  if (swap.scopeType === "EMPLOYEE") return swap.scopeId === employee.id;
  if (swap.scopeType === "DEPARTMENT")
    return swap.scopeId === employee.departmentId;
  if (swap.scopeType === "BRANCH") return swap.scopeId === employee.branchId;
  return swap.scopeId === employee.companyId;
}

function pickSwap(
  swaps: AttendanceHolidaySwap[],
  employee: EmployeeListItem,
  dateKey: string,
  side: "original" | "swapped",
) {
  return (
    swaps
      .filter((swap) => {
        const matched =
          side === "original"
            ? swap.originalHolidayDate === dateKey
            : swap.swappedHolidayDate === dateKey;
        return matched && swapCoversEmployee(swap, employee);
      })
      .sort((a, b) => scopePriority(b) - scopePriority(a))[0] ?? null
  );
}

/** backend จำกัด pageSize ไว้ที่ 100 จึงต้องวนดึงจนครบ */
async function fetchActiveEmployees() {
  const collected: EmployeeListItem[] = [];
  let page = 1;

  for (;;) {
    const result = await apiFetch<{
      items: EmployeeListItem[];
      meta?: { totalPages: number };
    }>(`/employees?page=${page}&pageSize=100&status=ACTIVE`);

    collected.push(...(result?.items ?? []));

    const totalPages = result?.meta?.totalPages ?? 1;
    if (page >= totalPages || page >= 30) break;
    page += 1;
  }

  return collected;
}

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(3,minmax(8.5rem,max-content))] sm:divide-y-0";

export function DayOffRosterPanel() {
  const { user } = useAuth();
  /*
   * ทั้งกอง settings/system ฝั่งหลังบ้านบังคับ ORG_MANAGE (@RequirePermissions)
   * หน้านี้จึงคุมด้วยสิทธิ์เดียวกัน ไม่งั้นจะเห็นตารางแล้วกดย้ายไม่ได้เพราะติด 403
   */
  const canManage = useMemo(
    () =>
      (user?.permissions ?? []).some(
        (permission) => permission.trim().toUpperCase() === "ORG_MANAGE",
      ),
    [user?.permissions],
  );

  /*
   * เดินตามงวดเงินเดือน ไม่ใช่เดือนปฏิทิน — เวรหยุดมีผลต่อยอดหักของงวดไหน
   * ต้องดูกรอบเดียวกับงวดนั้น ไม่งั้นวันต้นงวด (26-31 ของเดือนก่อน) จะหลุดจอ
   * ใช้ตัวช่วยชุดเดียวกับหน้าตรวจสอบก่อนเข้าเงินเดือน จะได้ไม่มีกติกาวันตัดรอบสองชุด
   */
  const [policy, setPolicy] = useState<PayrollCutoffPolicy | null>(null);
  const [range, setRange] = useState<PayrollPeriodRange>(() =>
    buildCurrentPayrollPeriodRange(null),
  );

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [weeklyHolidays, setWeeklyHolidays] = useState<
    AttendanceHolidayWeekday[]
  >(["SUN"]);
  const [customHolidays, setCustomHolidays] = useState<
    AttendanceCustomHoliday[]
  >([]);
  const [swaps, setSwaps] = useState<AttendanceHolidaySwap[]>([]);

  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget>(null);
  /** สรุปรายวันของคนที่กำลังเปิดกล่องอยู่ ดึงทีละคนเพราะทั้งบริษัทหลายพันแถว */
  const [moveSummaries, setMoveSummaries] = useState<
    Map<string, AttendanceDailySummary>
  >(new Map());
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveToDate, setMoveToDate] = useState("");
  /* "move" = ย้ายวันหยุดเดิมไปวันใหม่ · "grant" = ให้วันหยุดเพิ่มโดยไม่แลกกับวันไหน */
  const [moveMode, setMoveMode] = useState<"move" | "grant">("move");
  /** กดปุ่มถอนรอบแรกแล้ว รอยืนยันรอบสอง ใช้กล่องเดิมไม่ต้องซ้อนป๊อปอัพ */
  const [confirmRemove, setConfirmRemove] = useState(false);

  const loadData = useCallback(async (mode: "initial" | "refresh") => {
    try {
      if (mode === "initial") setLoading(true);
      setError(null);

      const [settings, holidays, swapList, employeeList] = await Promise.all([
        getSystemSettings(),
        getHolidayCalendars(),
        getHolidaySwaps(),
        fetchActiveEmployees(),
      ]);

      setWeeklyHolidays(
        settings.attendanceWeeklyHolidays?.length
          ? settings.attendanceWeeklyHolidays
          : ["SUN"],
      );
      setCustomHolidays(holidays ?? []);
      setSwaps((swapList ?? []).filter((item) => item.status === "ACTIVE"));
      setEmployees(employeeList);

      /*
       * วันตัดรอบตั้งได้รายบริษัท ค่ากลางคือ 26-25 แต่ห้ามเดา — ต้องอ่านของจริง
       * ไม่งั้นบริษัทที่ตั้ง 1-31 ไว้จะเห็นกรอบวันผิดจากหน้าตรวจสอบก่อนเข้าเงินเดือน
       */
      const companyId = employeeList[0]?.companyId;
      if (companyId) {
        const setting = await getCompanyPayrollSetting(companyId).catch(
          () => null,
        );
        const nextPolicy: PayrollCutoffPolicy = {
          payrollPeriodStartDay: setting?.payrollPeriodStartDay
            ? Number(setting.payrollPeriodStartDay)
            : null,
          payrollCutoffDay: setting?.payrollCutoffDay
            ? Number(setting.payrollCutoffDay)
            : null,
        };
        setPolicy(nextPolicy);
        // ตั้งกรอบเริ่มต้นเฉพาะตอนเปิดหน้า ถ้าผู้ใช้เลื่อนงวดไปแล้วห้ามดึงกลับ
        if (mode === "initial") {
          setRange(buildCurrentPayrollPeriodRange(nextPolicy));
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "ไม่สามารถโหลดเวรหยุดได้",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // หน่วงหนึ่งจังหวะแบบเดียวกับ HolidayPanel เพื่อไม่ให้ setState วิ่งอยู่ในตัว effect
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData("initial");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  /* แผนกที่มีคนอยู่จริง เรียงตามจำนวนคนมากไปน้อย ทีมที่หมุนเวรมักเป็นทีมใหญ่ */
  const departmentOptions = useMemo(() => {
    const counter = new Map<string, { label: string; count: number }>();

    for (const employee of employees) {
      if (!employee.departmentId) continue;
      const current = counter.get(employee.departmentId);
      if (current) {
        current.count += 1;
        continue;
      }
      counter.set(employee.departmentId, {
        label: employee.department?.nameTh ?? "ไม่ระบุแผนก",
        count: 1,
      });
    }

    return [...counter.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th"));
  }, [employees]);

  const visibleEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return employees
      .filter((employee) => {
        if (departmentId && employee.departmentId !== departmentId)
          return false;
        if (!keyword) return true;
        return `${employeeName(employee)} ${employee.employeeCode ?? ""}`
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) =>
        (a.employeeCode ?? "").localeCompare(b.employeeCode ?? "", "th"),
      );
  }, [employees, departmentId, search]);

  const customHolidayByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const holiday of customHolidays) map.set(holiday.date, holiday.name);
    return map;
  }, [customHolidays]);

  const days = useMemo(() => {
    const start = parseDateKey(range.dateFrom);
    const end = parseDateKey(range.dateTo);
    const todayKey = dateKeyOfDate(new Date());
    const out: Array<{
      day: number;
      dateKey: string;
      weekday: number;
      /** วันแรกของเดือนใหม่ ใช้ขีดเส้นคั่นเพราะงวดคร่อมสองเดือน */
      monthStart: boolean;
      /** ทั้งบริษัทหยุด — ย้อมหัวคอลัมน์ให้กวาดสายตาลงแนวตั้งได้ */
      companyOff: boolean;
      isToday: boolean;
    }> = [];

    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const dateKey = dateKeyOfDate(cursor);
      out.push({
        day: cursor.getDate(),
        dateKey,
        weekday: cursor.getDay(),
        monthStart: out.length > 0 && cursor.getDate() === 1,
        companyOff:
          customHolidayByDate.has(dateKey) ||
          weeklyHolidays.includes(WEEKDAY_CODES[cursor.getDay()]),
        isToday: dateKey === todayKey,
      });
    }

    return out;
  }, [range.dateFrom, range.dateTo, customHolidayByDate, weeklyHolidays]);

  const resolveCell = useCallback(
    (employee: EmployeeListItem, dateKey: string, weekday: number): Cell => {
      /*
       * ลำดับต้องตรงกับ resolveEmployeeAttendanceHolidayInfo ฝั่งหลังบ้าน:
       * ใบที่ระบุว่า "วันนี้คือวันหยุดเดิม" ชนะก่อน แล้วค่อยดูใบที่ย้ายมาลง
       * แล้วจึงตกไปที่วันหยุดของบริษัท ถ้าสลับลำดับ ภาพบนจอจะไม่ตรงกับยอดหัก
       */
      const original = pickSwap(swaps, employee, dateKey, "original");
      if (original)
        return {
          kind: "swapWork",
          swap: original,
          label: `มาทำงานแทน — ย้ายวันหยุดไป ${original.swappedHolidayDate}`,
        };

      const replacement = pickSwap(swaps, employee, dateKey, "swapped");
      if (replacement)
        return {
          kind: "swapOff",
          swap: replacement,
          label: `หยุดสลับ — ย้ายมาจาก ${replacement.originalHolidayDate}`,
        };

      const custom = customHolidayByDate.get(dateKey);
      if (custom)
        return { kind: "publicHoliday", swap: null, label: custom };

      if (weeklyHolidays.includes(WEEKDAY_CODES[weekday]))
        return { kind: "weeklyHoliday", swap: null, label: "วันหยุดประจำ" };

      return { kind: "work", swap: null, label: "วันทำงาน" };
    },
    [swaps, customHolidayByDate, weeklyHolidays],
  );

  /* ตารางเดียวใช้ทั้งวาดช่องและนับคนทำงาน คำนวณรอบเดียวพอ */
  const grid = useMemo(
    () =>
      visibleEmployees.map((employee) => ({
        employee,
        cells: days.map((day) =>
          resolveCell(employee, day.dateKey, day.weekday),
        ),
      })),
    [visibleEmployees, days, resolveCell],
  );

  /* จัดกลุ่มตามแผนก — 109 แถวเรียงติดกันหาคนไม่เจอ */
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rows: typeof grid }>();

    for (const row of grid) {
      const key = row.employee.departmentId ?? "-";
      const existing = map.get(key);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
      map.set(key, {
        key,
        label: row.employee.department?.nameTh ?? "ยังไม่ระบุแผนก",
        rows: [row],
      });
    }

    return [...map.values()].sort(
      (a, b) =>
        b.rows.length - a.rows.length || a.label.localeCompare(b.label, "th"),
    );
  }, [grid]);

  const rowCount = grid.length;

  const workingCountByDay = useMemo(
    () =>
      days.map((_, index) =>
        grid.reduce(
          (sum, row) =>
            sum +
            (row.cells[index].kind === "work" ||
            row.cells[index].kind === "swapWork"
              ? 1
              : 0),
          0,
        ),
      ),
    [grid, days],
  );

  function movePeriod(step: number) {
    setRange(shiftPayrollPeriodRange(range.dateFrom, step, policy));
  }

  /** เปิดกล่องย้ายวันหยุด แล้วดึงเวลาลงงานทั้งงวดของคนนั้นมาให้ดู */
  async function openMoveDialog(employee: EmployeeListItem, cell: Cell, dateKey: string) {
    setMoveTarget({ employee, dateKey, cellLabel: cell.label, swap: cell.swap });
    setMoveToDate("");
    setMoveMode(cell.kind === "work" ? "grant" : "move");
    setConfirmRemove(false);
    setMoveSummaries(new Map());
    setMoveLoading(true);

    try {
      const result = await getAttendanceDailySummaries({
        employeeId: employee.id,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        pageSize: 100,
      });
      const map = new Map<string, AttendanceDailySummary>();
      for (const item of result?.items ?? [])
        map.set(String(item.workDate).slice(0, 10), item);
      setMoveSummaries(map);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "โหลดเวลาลงงานไม่สำเร็จ",
      );
    } finally {
      setMoveLoading(false);
    }
  }

  async function commitSwap() {
    if (!moveTarget) return;
    if (moveMode === "move" && !moveToDate) return;

    const { employee, dateKey } = moveTarget;
    const isGrant = moveMode === "grant";
    setSaving(true);
    try {
      const result = await createHolidaySwap({
        /* โหมดให้หยุดเพิ่มไม่ส่งวันหยุดเดิม จะได้ไม่ไปเปลี่ยนวันไหนเป็นวันทำงาน */
        originalHolidayDate: isGrant ? null : dateKey,
        swappedHolidayDate: isGrant ? dateKey : moveToDate,
        scopeType: "EMPLOYEE",
        scopeId: employee.id,
        name: isGrant ? "ให้วันหยุดเพิ่ม" : "ย้ายวันหยุดประจำ",
        reason: `หมุนเวรหยุดของ${employee.department?.nameTh ?? "ทีม"}`,
      });
      setSwaps((result ?? []).filter((item) => item.status === "ACTIVE"));
      setMoveTarget(null);
      toast.success(
        isGrant
          ? `ให้ ${employeeName(employee)} หยุด ${thaiFullDateWithWeekday(dateKey)} แล้ว`
          : `ย้ายวันหยุดของ ${employeeName(employee)} ไปเป็น ${thaiFullDateWithWeekday(moveToDate)} แล้ว`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ย้ายวันหยุดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeSwap() {
    const swap = moveTarget?.swap;
    if (!swap) return;

    setSaving(true);
    try {
      await deleteHolidaySwap(swap.id);
      setSwaps((current) => current.filter((item) => item.id !== swap.id));
      setMoveTarget(null);
      toast.success("ถอนการย้ายวันหยุดแล้ว");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "ถอนการย้ายวันหยุดไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCellClick(
    employee: EmployeeListItem,
    cell: Cell,
    dateKey: string,
  ) {
    if (saving) return;

    /*
     * คลิกวันไหน = อยากเปลี่ยนวันนั้น ไม่ต้องจำลำดับ
     *   ช่องที่จัดไปแล้ว  -> ดูรายละเอียด/ถอน
     *   วันหยุด          -> ย้ายไปหยุดวันอื่น
     *   วันทำงาน         -> ให้หยุดวันนี้เพิ่ม
     */
    void openMoveDialog(employee, cell, dateKey);
  }

  /* ตัวเลือกวันปลายทาง — เฉพาะวันทำงานในงวดนี้ พร้อมบอกว่าวันนั้นเขามาหรือเปล่า */
  const moveOptions = useMemo(() => {
    if (!moveTarget) return [];

    const row = grid.find((item) => item.employee.id === moveTarget.employee.id);
    if (!row) return [];

    return days
      .map((day, index) => ({ day, cell: row.cells[index] }))
      .filter(({ day, cell }) => cell.kind === "work" && day.dateKey !== moveTarget.dateKey)
      .map(({ day }) => {
        const summary = moveSummaries.get(day.dateKey);
        const checkIn = timeOf(summary?.morningInAt);
        const checkOut = timeOf(summary?.checkOutAt);
        return {
          dateKey: day.dateKey,
          worked: Boolean(checkIn || checkOut),
          timeLabel:
            checkIn || checkOut
              ? `${checkIn ?? "—"} – ${checkOut ?? "—"}`
              : "ไม่มีการลงเวลา",
        };
      });
  }, [moveTarget, grid, days, moveSummaries]);

  const moveFromSummary = moveTarget
    ? moveSummaries.get(moveTarget.dateKey)
    : undefined;
  const moveFromCheckIn = timeOf(moveFromSummary?.morningInAt);
  /*
   * ถ้าวันหยุดที่จะแปลงเป็นวันทำงานเขามาสาย พอแปลงแล้วจะเกิดค่าปรับมาสายทันที
   * เคยเจอตอนลงข้อมูลจริง — คนที่มาทำโอทีวันหยุดตอนบ่ายจะกลายเป็นสายหลายชั่วโมง
   */
  const moveFromLateMinutes = Number(moveFromSummary?.totalLateMinutes ?? 0);

  const movedCount = grid.reduce(
    (sum, row) =>
      sum + row.cells.filter((cell) => cell.kind === "swapOff").length,
    0,
  );

  /* วันที่ยังมีคนทำงานอยู่ แต่เหลือไม่ถึงครึ่งทีม — จุดที่เวรหยุดชนกัน */
  const thinDayCount = workingCountByDay.filter(
    (count) => count > 0 && count <= Math.ceil(grid.length / 2),
  ).length;

  const heading = (
    <PageHeading
      heroMotif="attendance"
      eyebrow="Day-off Roster"
      title="เวรหยุด"
      titleAccent="รายคน"
      description="ย้ายวันหยุดของทีมที่หมุนเวรกันเอง เช่น งานจัดส่งที่มาทำงานวันอาทิตย์แล้วไปหยุดวันธรรมดาแทน"
      chips={
        <>
          <PageChip tone="brand">งวด {periodTitle(range)}</PageChip>
          <PageChip>{visibleEmployees.length.toLocaleString("th-TH")} คน</PageChip>
        </>
      }
      actions={
        loading || error ? null : (
          <div className={TILE_BOX}>
            <StatTile
              icon={<Users className="h-4 w-4" />}
              label="พนักงานในตาราง"
              value={visibleEmployees.length.toLocaleString("th-TH")}
            />
            <StatTile
              icon={<CalendarRange className="h-4 w-4" />}
              label="ย้ายวันหยุดแล้ว"
              value={movedCount.toLocaleString("th-TH")}
              helper="ในงวดนี้"
            />
            <StatTile
              icon={<TriangleAlert className="h-4 w-4" />}
              label="วันที่คนไม่ถึงครึ่ง"
              value={thinDayCount.toLocaleString("th-TH")}
              tone={thinDayCount > 0 ? "warning" : undefined}
            />
          </div>
        )
      }
    />
  );

  if (!canManage) {
    return (
      <PageSurface>
        {heading}
        <PermissionDenied
          title="ไม่มีสิทธิ์จัดเวรหยุด"
          description="ต้องมีสิทธิ์จัดการข้อมูลองค์กร (ORG_MANAGE) จึงจะเปิดหน้านี้ได้ — ฝั่งหลังบ้านบังคับสิทธิ์นี้ตั้งแต่ตอนอ่านข้อมูล จึงเปิดโหมดดูอย่างเดียวให้ไม่ได้"
        />
      </PageSurface>
    );
  }

  if (loading) {
    return (
      <PageSurface>
        {heading}
        <div className="px-5 py-8 3xl:px-6 4xl:px-7">
          <LoadingState />
        </div>
      </PageSurface>
    );
  }

  if (error) {
    return (
      <PageSurface>
        {heading}
        <div className="px-5 py-8 3xl:px-6 4xl:px-7">
          <ErrorState
            description={error}
            action={
              <Button onClick={() => void loadData("refresh")}>ลองใหม่</Button>
            }
          />
        </div>
      </PageSurface>
    );
  }

  return (
    <PageSurface>
      {heading}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => movePeriod(-1)}
            aria-label="งวดก่อนหน้า"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[19.5rem] text-center text-[13.5px] font-bold text-slate-900 3xl:text-[15px]">
            งวด {periodTitle(range)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => movePeriod(1)}
            aria-label="งวดถัดไป"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select
          value={departmentId}
          onChange={(event) => {
            setDepartmentId(event.target.value);
          }}
          className="w-56"
        >
          <option value="">ทุกแผนก ({employees.length} คน)</option>
          {departmentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} ({option.count} คน)
            </option>
          ))}
        </Select>

        <div className="w-60">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาชื่อหรือรหัสพนักงาน"
          />
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void loadData("refresh")}
          className="ml-auto"
        >
          <RefreshCw className="h-4 w-4" />
          รีเฟรช
        </Button>
      </div>

      <div className="px-5 py-4 sm:px-6 3xl:px-7">
        {visibleEmployees.length === 0 ? (
          <Notice tone="info">ไม่พบพนักงานตามเงื่อนไขที่เลือก</Notice>
        ) : (
          <div className="max-h-[68vh] overflow-auto rounded-xl border border-slate-300">
            <table className="w-full border-separate border-spacing-0 text-[12px] 3xl:text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 w-[15rem] border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    พนักงาน
                  </th>
                  {days.map((day) => (
                    <th
                      key={day.dateKey}
                      className={[
                        "sticky top-0 z-20 border-b border-slate-200 px-0 pb-1.5 pt-2 text-center align-bottom",
                        /* ย้อมหัวคอลัมน์ของวันที่ทั้งบริษัทหยุด เพื่อให้กวาดสายตาลงแนวตั้งได้ */
                        day.companyOff ? "bg-slate-100" : "bg-white",
                        day.monthStart ? "border-l border-l-slate-300" : "",
                      ].join(" ")}
                    >
                      <span
                        className={`block text-[10px] leading-none ${
                          day.companyOff ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        {WEEKDAY_SHORT[day.weekday]}
                      </span>
                      <span
                        className={[
                          "mx-auto mt-1 block w-6 rounded-full text-[11.5px] font-bold leading-5 tabular-nums",
                          day.isToday
                            ? "bg-brand-600 text-white"
                            : "text-slate-600",
                        ].join(" ")}
                      >
                        {day.day}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              {groups.map((group) => (
                <tbody key={group.key}>
                  {/* หัวแผนก — 109 แถวไล่หาคนไม่ไหวถ้าไม่มีที่คั่น */}
                  <tr>
                    <th
                      colSpan={days.length + 1}
                      className="sticky left-0 z-10 border-b border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[11.5px] font-bold text-slate-600"
                    >
                      {group.label}
                      <span className="ml-2 font-semibold text-slate-400">
                        {group.rows.length} คน
                      </span>
                    </th>
                  </tr>

                  {group.rows.map((row) => (
                    <tr key={row.employee.id} className="group/row">
                      <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-1 group-hover/row:bg-brand-50/60">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate font-semibold text-slate-800">
                            {employeeName(row.employee)}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                            {row.employee.employeeCode}
                          </span>
                        </span>
                      </td>

                      {row.cells.map((cell, index) => {
                        const day = days[index];
                        const isOpen =
                          moveTarget?.employee.id === row.employee.id &&
                          moveTarget.dateKey === day.dateKey;

                        return (
                          <td
                            key={day.dateKey}
                            className={[
                              "border-b border-slate-100 p-0",
                              day.monthStart
                                ? "border-l border-l-slate-300"
                                : "",
                            ].join(" ")}
                          >
                            <button
                              type="button"
                              title={`${thaiFullDateWithWeekday(day.dateKey)} · ${cell.label}`}
                              disabled={saving}
                              onClick={() =>
                                handleCellClick(row.employee, cell, day.dateKey)
                              }
                              className={[
                                /* ระบายเต็มช่อง อ่านเป็นแถบยาวได้ทีเดียวทั้งสัปดาห์ */
                                "block h-7 w-full cursor-pointer border-2 border-white",
                                "text-[11px] font-bold leading-none text-white transition",
                                "hover:opacity-80",
                                CELL_STYLE[cell.kind],
                                isOpen ? "ring-2 ring-inset ring-brand-700" : "",
                              ].join(" ")}
                            >
                              {CELL_MARK[cell.kind]}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}

              <tfoot>
                <tr>
                  <td className="sticky bottom-0 left-0 z-20 border-r border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    คนทำงานของวันนั้น
                  </td>
                  {workingCountByDay.map((count, index) => (
                    <td
                      key={days[index].dateKey}
                      className={[
                        "sticky bottom-0 z-10 border-t border-slate-200 bg-slate-50 px-0 py-1.5 text-center text-[11.5px] font-bold tabular-nums",
                        days[index].monthStart
                          ? "border-l border-l-slate-300"
                          : "",
                        count === 0
                          ? "text-slate-300"
                          : count <= Math.ceil(rowCount / 2)
                            ? "text-amber-600"
                            : "text-slate-500",
                      ].join(" ")}
                    >
                      {count}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-slate-500 3xl:text-[12px]">
          <Legend kind="work" text="วันทำงาน" />
          <Legend kind="weeklyHoliday" text="วันหยุดประจำ" />
          <Legend kind="publicHoliday" text="นักขัตฤกษ์" />
          <Legend kind="swapOff" text="หยุดสลับ" />
          <Legend kind="swapWork" text="มาทำงานแทน" />
          <span className="text-slate-400">
            คลิกวันหยุด → คลิกวันทำงานในแถวเดียวกัน = ย้ายวันหยุด ·
            คลิกช่องที่ย้ายแล้วเพื่อถอนคืน
          </span>
        </div>
      </div>

      <Modal
        open={Boolean(moveTarget)}
        size="md-wide"
        title={
          moveTarget?.swap
            ? "รายละเอียดวันหยุดที่จัดไว้"
            : moveMode === "grant"
              ? "ให้วันหยุดเพิ่ม"
              : "ย้ายวันหยุด"
        }
        description={
          moveTarget
            ? `${employeeName(moveTarget.employee)} · ${moveTarget.employee.employeeCode ?? ""}`
            : ""
        }
        onClose={() => setMoveTarget(null)}
        footer={
          moveTarget?.swap ? (
            <div className="flex items-center justify-end gap-2">
              {confirmRemove ? (
                <>
                  <span className="mr-auto text-[12.5px] font-semibold text-rose-700">
                    ยืนยันถอนการย้ายวันหยุดนี้
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmRemove(false)}
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => void removeSwap()}
                    loading={saving}
                  >
                    ยืนยันถอน
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setMoveTarget(null)}
                  >
                    ปิด
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setConfirmRemove(true)}
                  >
                    ถอนการย้าย
                  </Button>
                </>
              )}
            </div>
          ) : (
            <ModalActions
              onCancel={() => setMoveTarget(null)}
              onConfirm={() => void commitSwap()}
              confirmLabel={
                moveMode === "grant" ? "ให้หยุดวันนี้" : "ย้ายวันหยุด"
              }
              loading={saving}
              disabled={
                moveLoading || (moveMode === "move" && !moveToDate)
              }
            />
          )
        }
      >
        {moveTarget?.swap ? (
          /* โหมดดูรายละเอียดของวันที่ย้ายไปแล้ว — ต้องเห็นเวลาลงงานทั้งสองวัน
             ก่อนตัดสินใจว่าจะถอนหรือไม่ ไม่ใช่เด้งถามลบทันที */
          <div className="space-y-4">
            {/* ไม่มีวันหยุดเดิม = ให้วันหยุดเพิ่ม ไม่ได้แลกกับวันไหน จึงมีการ์ดใบเดียว */}
            {moveTarget.swap.originalHolidayDate ? (
              <SwapDayCard
                caption="วันหยุดเดิม · ตอนนี้นับเป็นวันทำงาน"
                dateKey={moveTarget.swap.originalHolidayDate}
                summary={moveSummaries.get(moveTarget.swap.originalHolidayDate)}
                loading={moveLoading}
                tone="emerald"
              />
            ) : (
              <Notice tone="info">
                วันหยุดที่บริษัทให้เพิ่ม ไม่ได้เอาวันหยุดวันไหนไปแลก
              </Notice>
            )}
            <SwapDayCard
              caption={
                moveTarget.swap.originalHolidayDate
                  ? "วันที่ย้ายไปหยุด · ตอนนี้นับเป็นวันหยุด"
                  : "วันที่ให้หยุดเพิ่ม · ตอนนี้นับเป็นวันหยุด"
              }
              dateKey={moveTarget.swap.swappedHolidayDate}
              summary={moveSummaries.get(moveTarget.swap.swappedHolidayDate)}
              loading={moveLoading}
              tone="brand"
            />

            {moveTarget.swap.reason ? (
              <p className="text-[12.5px] text-slate-500">
                เหตุผล: {moveTarget.swap.reason}
              </p>
            ) : null}

            {confirmRemove ? (
              <Notice tone="critical">
                {moveTarget.swap.originalHolidayDate ? (
                  <>
                    ถอนแล้ว{" "}
                    {thaiFullDateWithWeekday(
                      moveTarget.swap.originalHolidayDate,
                    )}{" "}
                    จะกลับไปเป็นวันหยุด และ{" "}
                  </>
                ) : (
                  "ถอนแล้ว "
                )}
                {thaiFullDateWithWeekday(moveTarget.swap.swappedHolidayDate)}{" "}
                จะกลับไปเป็นวันทำงาน ซึ่งถ้าวันนั้นพนักงานไม่ได้มา
                จะถูกนับเป็นขาดงานทันที
              </Notice>
            ) : null}
          </div>
        ) : moveTarget && moveMode === "grant" ? (
          /* ให้วันหยุดเพิ่ม — ไม่ต้องหาวันมาแลก ใช้กับคนที่บริษัทให้หยุดเฉย ๆ */
          <div className="space-y-4">
            <SwapDayCard
              caption="วันที่จะให้หยุด · ตอนนี้เป็นวันทำงาน"
              dateKey={moveTarget.dateKey}
              summary={moveFromSummary}
              loading={moveLoading}
              tone="brand"
            />

            {!moveLoading && moveFromCheckIn ? (
              <Notice tone="warning">
                วันนี้พนักงานมาทำงานจริง (เข้างาน {moveFromCheckIn}) —
                ถ้าตั้งเป็นวันหยุด เวลาที่ลงไว้จะกลายเป็นการทำงานในวันหยุด
                ไม่ใช่วันทำงานปกติ
              </Notice>
            ) : (
              <Notice tone="info">
                วันนี้ไม่มีการลงเวลา ตั้งเป็นวันหยุดแล้วจะไม่ถูกนับขาดงานอีก
              </Notice>
            )}

            <p className="text-[12.5px] leading-6 text-slate-500">
              ใช้กับกรณีที่บริษัทให้วันหยุดเพิ่ม โดยไม่ได้เอาวันหยุดวันไหนไปแลก
              ถ้าเป็นการสลับเวร ให้กดที่ช่องวันหยุดเดิมแล้วเลือกย้ายแทน
              จำนวนวันหยุดจะได้ไม่เพิ่มเกินจริง
            </p>
          </div>
        ) : moveTarget ? (
          <div className="space-y-4">
            {/* วันหยุดต้นทาง พร้อมเวลาลงงานของวันนั้น */}
            <section className="rounded-xl border border-slate-200">
              <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  วันหยุดที่จะย้ายออก
                </p>
                <p className="text-[13px] font-bold text-slate-900">
                  {thaiFullDateWithWeekday(moveTarget.dateKey)}
                </p>
              </div>

              {moveLoading ? (
                <p className="px-4 py-3 text-[12.5px] text-slate-400">
                  กำลังโหลดเวลาลงงาน…
                </p>
              ) : (
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  <PunchCell label="เข้าเช้า" value={timeOf(moveFromSummary?.morningInAt)} />
                  <PunchCell label="เข้าบ่าย" value={timeOf(moveFromSummary?.afternoonInAt)} />
                  <PunchCell label="ออกงาน" value={timeOf(moveFromSummary?.checkOutAt)} />
                </div>
              )}
            </section>

            {!moveLoading && !moveFromCheckIn ? (
              <Notice tone="warning">
                วันนี้ไม่มีการลงเวลา — ถ้าย้ายวันหยุดออกจากวันนี้ ระบบจะนับเป็น
                ขาดงานแทน ควรย้ายเฉพาะวันหยุดที่พนักงานมาทำงานจริง
              </Notice>
            ) : null}

            {!moveLoading && moveFromLateMinutes > 0 ? (
              <Notice tone="warning">
                วันนี้เข้างาน {moveFromCheckIn} ซึ่งช้ากว่าเวลาเริ่มกะ{" "}
                {moveFromLateMinutes.toLocaleString("th-TH")} นาที — พอกลายเป็น
                วันทำงานจะถูกคิดค่าปรับมาสายตามจำนวนนี้
              </Notice>
            ) : null}

            {/* วันปลายทาง */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                เลือกวันที่จะไปหยุดแทน
              </p>

              {moveOptions.length === 0 ? (
                <Notice tone="info">
                  ไม่มีวันทำงานเหลือให้ย้ายไปหยุดในงวดนี้
                </Notice>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5">
                  {moveOptions.map((option) => (
                    <label
                      key={option.dateKey}
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] transition",
                        moveToDate === option.dateKey
                          ? "bg-brand-50 ring-1 ring-inset ring-brand-300"
                          : "hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="move-to-date"
                        value={option.dateKey}
                        checked={moveToDate === option.dateKey}
                        onChange={() => setMoveToDate(option.dateKey)}
                        className="h-3.5 w-3.5 accent-brand-600"
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                        {thaiFullDateWithWeekday(option.dateKey)}
                      </span>
                      <span
                        className={
                          option.worked
                            ? "shrink-0 tabular-nums text-slate-500"
                            : "shrink-0 font-semibold text-emerald-600"
                        }
                      >
                        {option.timeLabel}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <p className="mt-2 text-[11.5px] text-slate-400">
                วันที่ไม่มีการลงเวลา (สีเขียว) คือวันที่พนักงานหยุดไปแล้วจริง
                เลือกวันเหล่านี้จะไม่เกิดยอดหักใหม่
              </p>
            </section>
          </div>
        ) : null}
      </Modal>

      {saving ? (
        <div className="pointer-events-none fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-[12.5px] font-semibold text-white shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังบันทึก
        </div>
      ) : null}
    </PageSurface>
  );
}

/*
 * ระบายสีเต็มช่อง ไม่ใช้ไอคอนเล็ก ๆ กลางช่องว่าง
 * ตารางกว้าง 31 วัน คูณ 109 แถว ถ้าเป็นจุดเล็ก ๆ จะกวาดสายตาไม่ออกว่าใครหยุดช่วงไหน
 * พอเป็นแถบสีจะเห็นเป็นบล็อกยาวทีเดียวทั้งสัปดาห์
 *
 * วันทำงานปล่อยจางที่สุดโดยตั้งใจ — สิ่งที่ต้องเห็นคือ "วันหยุด" ไม่ใช่วันทำงาน
 * สองสถานะที่ HR สร้างเอง (หยุดสลับ / มาทำงานแทน) ใช้สีเข้มสุดเพราะเป็นของที่ต้องตรวจ
 */
const CELL_STYLE: Record<CellKind, string> = {
  work: "bg-slate-50",
  weeklyHoliday: "bg-slate-300",
  publicHoliday: "bg-amber-200",
  swapOff: "bg-brand-500",
  swapWork: "bg-emerald-500",
};

/** ใส่สัญลักษณ์เฉพาะสองสถานะที่ HR สร้างเอง ที่เหลือดูจากสีพอ ไม่ต้องรกตา */
const CELL_MARK: Record<CellKind, string> = {
  work: "",
  weeklyHoliday: "",
  publicHoliday: "",
  swapOff: "●",
  swapWork: "→",
};

function Legend({ kind, text }: { kind: CellKind; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex h-5 w-7 items-center justify-center rounded-sm text-[10px] font-bold text-white ${CELL_STYLE[kind]}`}
      >
        {CELL_MARK[kind]}
      </span>
      {text}
    </span>
  );
}

function PunchCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p
        className={`mt-0.5 text-[14px] font-bold tabular-nums ${
          value ? "text-slate-900" : "text-slate-300"
        }`}
      >
        {value ?? "ไม่พบ"}
      </p>
    </div>
  );
}

function SwapDayCard({
  caption,
  dateKey,
  summary,
  loading,
  tone,
}: {
  caption: string;
  dateKey: string;
  summary?: AttendanceDailySummary;
  loading: boolean;
  tone: "brand" | "emerald";
}) {
  const toneClass =
    tone === "brand"
      ? "border-brand-200 bg-brand-50/50"
      : "border-emerald-200 bg-emerald-50/50";

  return (
    <section className={`rounded-xl border ${toneClass}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-white/70 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {caption}
        </p>
        <p className="shrink-0 text-[13px] font-bold text-slate-900">
          {thaiFullDateWithWeekday(dateKey)}
        </p>
      </div>

      {loading ? (
        <p className="px-4 py-3 text-[12.5px] text-slate-400">
          กำลังโหลดเวลาลงงาน…
        </p>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-white/70">
          <PunchCell label="เข้าเช้า" value={timeOf(summary?.morningInAt)} />
          <PunchCell label="เข้าบ่าย" value={timeOf(summary?.afternoonInAt)} />
          <PunchCell label="ออกงาน" value={timeOf(summary?.checkOutAt)} />
        </div>
      )}
    </section>
  );
}
