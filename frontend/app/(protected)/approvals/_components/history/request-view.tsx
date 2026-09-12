"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronRight,
  Download,
  Filter,
  Loader2,
  RefreshCcw,
} from "lucide-react";

import { apiFetchWithMeta, getPublicFileUrl } from "@/lib/api";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  ApprovalAttachments,
  type AttachmentSource,
} from "../approval-attachments";
import { formatThaiDate, formatThaiDateTime } from "@/lib/date-format";

import { scrollPagerToTop } from "@/lib/scroll-to-top";
import {
  Avatar,
  Badge,
  Button,
  CellStack,
  DataTable,
  IconButton,
  Modal,
  Notice,
  SearchInput,
  Select,
  type Column,
  type Tone,
} from "@/components/kit";

/**
 * แท็บ "ประวัติ" — คอมโพเนนต์กลางที่ 4 แท็บย่อย (การลา / OT / ขอแก้เวลา /
 * นอกสถานที่) ใช้ร่วมกัน แต่ละแท็บย่อยส่ง `RequestViewConfig` เข้ามา
 * (คอลัมน์ ตัวชี้วัด สถานะ ฟังก์ชันดึงข้อมูล CSV) — ไฟล์นี้ทำหน้าที่แสดงผล
 * อย่างเดียว ย้ายมาจาก hr/requests/_shared/request-view.tsx เดิมทุกจุดของ
 * ตรรกะทางธุรกิจ (ตัวกรอง, export CSV, cascading บริษัท/แผนก) คงไว้เหมือนเดิม
 * เปลี่ยนแค่การแสดงผลให้ใช้ชุด kit
 */

const PAGE_SIZE = 20;

export type OrgOption = {
  id: string;
  code?: string;
  nameTh?: string;
  nameEn?: string;
  name?: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
};

/** โทนเดิมจากดีไซน์เก่า — แมปเป็น kit Tone ตอนวาด Badge จริง */
export type StatusTone = "sky" | "amber" | "emerald" | "rose" | "slate";

const STATUS_TONE_MAP: Record<StatusTone, Tone> = {
  sky: "brand",
  amber: "warning",
  emerald: "positive",
  rose: "critical",
  slate: "neutral",
};

/** โทนเดิมของตัวชี้วัดสรุป — แมปเป็นสีข้อความตอนวาดจริง */
type MetricTone = "sky" | "amber" | "emerald" | "violet";

/**
 * ตัวเลขสรุปของแท็บประวัติ ส่งขึ้นไปวางข้างหัวเรื่องเหมือนแท็บรออนุมัติ
 * เดิมวาดเป็นแถบเต็มความกว้างในตัวเอง ทำให้สองแท็บในหน้าเดียวกันหน้าตาคนละแบบ
 */
export type HistoryTabProps = {
  renderTabBar?: (trailing: ReactNode) => ReactNode;
  onSummaryChange?: (tiles: HistorySummaryTile[]) => void;
};

export type HistorySummaryTile = {
  label: string;
  helper: string;
  tone: "neutral" | "warning" | "positive";
  value: string;
};

/** โทนเดิมของแท็บประวัติ แมปเข้าชุดโทนของ StatTile */
const METRIC_TILE_TONE: Record<MetricTone, HistorySummaryTile["tone"]> = {
  sky: "neutral",
  amber: "warning",
  emerald: "positive",
  violet: "neutral",
};

export type RequestEmployee = {
  employeeCode?: string | null;
  avatarUrl?: string | null;
  user?: { avatarUrl?: string | null } | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  position?: string | null;
  department?: { nameTh?: string | null } | null;
  branch?: { nameTh?: string | null } | null;
};

/**
 * รูปโปรไฟล์เก็บที่ผู้ใช้ (User.avatarUrl) แต่บางเส้น API ยัดมาที่ตัวพนักงานเลย
 * เช็กทั้งสองที่ ถ้าไม่มีรูป Avatar จะวาดอักษรย่อให้เอง
 */
function employeeAvatarUrl(employee?: RequestEmployee | null) {
  return getPublicFileUrl(employee?.user?.avatarUrl ?? employee?.avatarUrl ?? null);
}

export type MetricSpec<S> = {
  label: string;
  helper: string;
  tone: MetricTone;
  value: (summary: S) => number | string;
};

export type ColumnSpec<T> = {
  header: string;
  /** ให้คอลัมน์นี้ถูกใส่ใน CSV ด้วยหรือไม่ (ค่าเริ่มต้น: ใส่) */
  csv?: boolean;
  render: (item: T) => ReactNode;
  csvValue?: (item: T) => string;
};

export type ExtraFilterSpec = {
  key: string;
  /** ใช้เป็น aria-label เพราะช่องนี้ไม่มีป้ายกำกับให้เห็น */
  label: string;
  /** ข้อความตัวเลือกแรก ต้องบอกได้ในตัวว่ากรองอะไรอยู่ เช่น "ทุกประเภทวันทำงาน" */
  allLabel: string;
  options: Array<{ value: string; label: string }>;
};

export type RequestViewConfig<T, S> = {
  chip: string;
  title: string;
  description: string;
  /** ชื่อไฟล์ CSV (ไม่ต้องใส่นามสกุล) */
  csvName: string;
  emptyText: string;
  statusOptions: Array<{ value: string; label: string }>;
  statusText: Record<string, string>;
  statusTone: (status: string) => StatusTone;
  metrics: Array<MetricSpec<S>>;
  columns: Array<ColumnSpec<T>>;
  extraFilters?: ExtraFilterSpec[];
  /**
   * ซ่อนตัวกรอง สาขา/แผนก — ใช้กับมุมมองที่ขอบเขตข้อมูลแคบอยู่แล้ว
   * เช่นศูนย์คำขอของหัวหน้างานที่เห็นเฉพาะลูกทีมตัวเอง (และไม่มีสิทธิ์ ORG_READ
   * ให้โหลดรายชื่อสาขา/แผนกมาใส่ช่องเลือกด้วย)
   */
  hideOrgFilters?: boolean;
  emptySummary: S;
  fetchList: (params: Record<string, unknown>) => Promise<{
    items?: T[];
    meta?: { page: number; pageSize: number; total: number; totalPages: number };
    summary?: S;
  }>;
  /** ฟิลด์เพิ่มเติมในโมดัลรายละเอียด */
  detailRows: (item: T) => Array<{ label: string; value: ReactNode }>;
  /**
   * ไฟล์แนบของคำขอ — ประกอบเป็นรูปเดียวกับที่ศูนย์อนุมัติใช้ เพื่อให้ป๊อปอัพ
   * เปิดดูรูปได้จริง ไม่ใช่แค่บอกว่า "มีหลักฐาน"
   */
  getAttachmentSource?: (item: T) => AttachmentSource | null;
  getId: (item: T) => string;
  getRequestNo: (item: T) => string;
  getEmployee: (item: T) => RequestEmployee | null;
  getStatus: (item: T) => string;
  getReason: (item: T) => string;
  getSubmittedAt: (item: T) => string | null | undefined;
  /** ชื่อผู้อนุมัติ (คืน null เมื่อยังไม่อนุมัติ) */
  getApprover?: (item: T) => string | null | undefined;
};

type Filters = {
  search: string;
  branchId: string;
  departmentId: string;
  divisionId: string;
  employeeTypeId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  extra: Record<string, string>;
};

const initialFilters: Filters = {
  search: "",
  branchId: "",
  departmentId: "",
  divisionId: "",
  employeeTypeId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  extra: {},
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function orgLabel(option: OrgOption) {
  return option.nameTh || option.nameEn || option.name || option.code || "-";
}

export function personName(employee?: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!employee) return "-";

  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    "-"
  );
}

export function decimalText(value: unknown, digits = 2) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";

  return num.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function timeText(value?: string | null) {
  if (!value) return "-";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export function RequestView<T, S>({
  config,
  renderTabBar,
  onSummaryChange,
}: {
  config: RequestViewConfig<T, S>;
  /**
   * แถบแท็บย่อยที่วางบนสุด — รับ trailing กลับไปวางท้ายแถวเดียวกัน
   * (ช่องค้นหา/รีเฟรช/ส่งออก) ให้เหมือนแท็บรออนุมัติ
   */
  renderTabBar?: (trailing: ReactNode) => ReactNode;
  onSummaryChange?: (tiles: HistorySummaryTile[]) => void;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [summary, setSummary] = useState<S>(config.emptySummary);
  const [meta, setMeta] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [detail, setDetail] = useState<T | null>(null);

  const [branches, setBranches] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);

  /* ---------------- master data ---------------- */

  useEffect(() => {
    if (config.hideOrgFilters) return;

    let cancelled = false;

    void (async () => {
      try {
        const [branch, department] = await Promise.all([
          apiFetchWithMeta<OrgOption[]>("/organization/branches?pageSize=300"),
          apiFetchWithMeta<OrgOption[]>("/organization/departments?pageSize=500"),
        ]);

        if (cancelled) return;

        setBranches(branch.data ?? []);
        setDepartments(department.data ?? []);
      } catch (error) {
        console.error(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config.hideOrgFilters]);

  /* ---------------- list ---------------- */

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    try {
      const data = await config.fetchList({
        page,
        pageSize: PAGE_SIZE,
        search: filters.search.trim() || undefined,
        branchId: filters.branchId || undefined,
        departmentId: filters.departmentId || undefined,
        divisionId: filters.divisionId || undefined,
        employeeTypeId: filters.employeeTypeId || undefined,
        status: filters.status || undefined,
        /*
         * ไม่เอาฉบับร่าง
         * ร่างคือใบที่พนักงานยังเขียนค้างอยู่ ยังไม่ได้กดยื่น เป็นของส่วนตัว
         * ที่เจ้าตัวเห็นคนเดียวในหน้า "คำขอของฉัน" — ศูนย์คำขอมีไว้ดูใบที่
         * เข้าสายอนุมัติแล้วเท่านั้น เอาร่างมาปนทำให้ตัวเลขสรุปเกินจริง
         * และ HR เห็นเรื่องที่พนักงานยังไม่ตั้งใจให้ใครเห็น
         *
         * หลังบ้านรองรับ excludeDraft อยู่แล้วทั้ง 4 ประเภท (ใบลา OT แก้เวลา นอกสถานที่)
         * แค่ไม่เคยมีใครส่งมา
         */
        excludeDraft: "true",
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        ...Object.fromEntries(
          Object.entries(filters.extra).filter(([, value]) => value),
        ),
      });

      setItems(data.items ?? []);
      setSummary(data.summary ?? config.emptySummary);
      setMeta(
        data.meta ?? {
          page,
          pageSize: PAGE_SIZE,
          total: (data.items ?? []).length,
          totalPages: 1,
        },
      );
    } catch (error) {
      console.error(error);
      setErrorText(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 300);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  /* ---------------- derived ---------------- */

  /**
   * เลือกสาขาแล้วเหลือเฉพาะแผนกของสาขานั้น
   * แผนกที่ไม่ผูกสาขา (ใช้ร่วมกันทั้งบริษัท) ต้องเหลืออยู่ด้วย ไม่งั้นเลือกสาขาแล้วแผนกหาย
   */
  const departmentOptions = useMemo(
    () =>
      departments.filter(
        (item) =>
          !filters.branchId ||
          !item.branchId ||
          item.branchId === filters.branchId,
      ),
    [departments, filters.branchId],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        filters.branchId,
        filters.departmentId,
        filters.status,
        filters.dateFrom,
        filters.dateTo,
        filters.search.trim(),
        ...Object.values(filters.extra),
      ].filter(Boolean).length,
    [filters],
  );

  function updateFilter(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }

  function updateExtra(key: string, value: string) {
    setFilters((current) => ({
      ...current,
      extra: { ...current.extra, [key]: value },
    }));
    setPage(1);
  }

  function resetFilters() {
    setFilters(initialFilters);
    setPage(1);
  }

  function exportCsv() {
    const columns = config.columns.filter((column) => column.csv !== false);
    const header = ["เลขที่คำขอ", "พนักงาน", ...columns.map((c) => c.header), "สถานะ"];

    const rows = items.map((item) => {
      const employee = config.getEmployee(item);

      return [
        config.getRequestNo(item),
        `${employee?.employeeCode ?? ""} ${personName(employee)}`.trim(),
        ...columns.map((column) => column.csvValue?.(item) ?? ""),
        config.statusText[config.getStatus(item)] ?? config.getStatus(item),
      ]
        .map((value) => csvEscape(String(value ?? "")))
        .join(",");
    });

    const csv = `﻿${[header.map(csvEscape).join(","), ...rows].join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${config.csvName}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const columns: Array<Column<T>> = [
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => {
        const employee = config.getEmployee(item);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              name={personName(employee)}
              src={employeeAvatarUrl(employee)}
              size="md"
            />
            <CellStack
              primary={personName(employee)}
              secondary={
                [
                  employee?.employeeCode,
                  employee?.department?.nameTh,
                  employee?.branch?.nameTh,
                ]
                  .filter(Boolean)
                  .join(" · ") || "-"
              }
            />
          </div>
        );
      },
    },
    /*
     * คอลัมน์เฉพาะของแต่ละแท็บย่อย (ประเภทการลา, ช่วงวันที่, จำนวน ฯลฯ)
     * ห่อ py-1.5 ให้ที่นี่ที่เดียว แถวของทุกแท็บย่อยจึงสูงเท่ากับตารางคิวอนุมัติ
     * โดยไม่ต้องแก้ทีละไฟล์ (leaves-tab, overtime-tab, time-adjust-tab, offsite-tab)
     */
    ...config.columns.map(
      (column): Column<T> => ({
        key: column.header,
        header: column.header,
        cell: (item) => column.render(item),
      }),
    ),
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => (
        <div className="min-w-0">
          <Badge tone={STATUS_TONE_MAP[config.statusTone(config.getStatus(item))]}>
            {config.statusText[config.getStatus(item)] ?? config.getStatus(item)}
          </Badge>
          {config.getSubmittedAt(item) ? (
            <p className="mt-0.5 text-[11px] text-slate-400">
              ยื่น {formatThaiDate(config.getSubmittedAt(item)!)}
            </p>
          ) : null}
          {config.getApprover?.(item) ? (
            <p className="mt-0.5 text-[11px] font-semibold text-emerald-600">
              โดย {config.getApprover(item)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      /*
       * ทางเข้าเดียวคือลูกศรท้ายแถว ทำงานเหมือนกดที่แถว (onRowClick)
       * เป็นปุ่มจริงเพื่อให้กดด้วยคีย์บอร์ดได้ แต่ให้สีเฉพาะตอนชี้แถว —
       * ปุ่มกรอบเต็มใบทุกแถวทำให้รายการดูเป็นตารางแข็ง ๆ (โทนเดียวกับแท็บรออนุมัติ)
       */
      key: "actions",
      header: "",
      align: "right",
      width: "w-16",
      cell: (item) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label={`ดูรายละเอียดคำขอของ ${personName(config.getEmployee(item))}`}
            onClick={() => setDetail(item)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition group-hover:bg-brand-100 group-hover:text-brand-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  // ส่งตัวเลขสรุปขึ้นไปวางข้างหัวเรื่อง ให้ตำแหน่งเดียวกับแท็บรออนุมัติ
  useEffect(() => {
    onSummaryChange?.(
      config.metrics.map((metric) => {
        const value = metric.value(summary);

        return {
          label: metric.label,
          helper: metric.helper,
          tone: METRIC_TILE_TONE[metric.tone],
          value:
            typeof value === "number" ? value.toLocaleString("th-TH") : value,
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const tabTrailing = (
    <div className="flex items-center gap-2 [&_input]:bg-slate-50/80 [&_input:focus]:bg-white">
      <SearchInput
        value={filters.search}
        onChange={(event) => updateFilter({ search: event.target.value })}
        placeholder="ชื่อ รหัสพนักงาน เลขที่คำขอ เหตุผล"
        className="w-full sm:w-72"
        aria-label="ค้นหาคำขอ"
      />

      <IconButton
        title="โหลดข้อมูลใหม่"
        icon={
          loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )
        }
        onClick={() => void loadData()}
      />

      <Button
        size="sm"
        icon={<Download className="h-3.5 w-3.5" />}
        disabled={items.length === 0}
        onClick={exportCsv}
      >
        ส่งออก CSV
      </Button>
    </div>
  );

  return (
    <>
      {renderTabBar ? renderTabBar(tabTrailing) : null}

      {/*
       * ตัวกรองเรียงต่อกันตามความกว้างที่แต่ละอันต้องใช้จริง ไม่ใช่กริด 3 ช่องเท่ากัน
       * โทนเดียวกับแท็บรออนุมัติ — วันที่สองช่องอยู่ติดกันเพราะเป็นตัวกรองเดียว
       *
       * ความกว้างกำหนดที่ div ที่ครอบ ห้ามส่งคลาสไปทับตัวคอนโทรล เพราะทั้ง Select
       * ของ kit และ ThaiDateInput ต่อคลาสด้วยการ join สตริงเฉย ๆ ไม่ได้ merge
       * คลาสเดิมอย่าง `w-full` จึงชนะคลาสที่ส่งไปทับ
       *
       * ไม่มีแผงกางออก — บริษัท/แผนก/ตัวกรองเฉพาะทาง ใช้บ่อยพอ ๆ กับสถานะ
       * ซ่อนไว้แล้วผู้ใช้ไม่รู้ว่ามี และไม่รู้ว่าที่เห็นอยู่ถูกกรองด้วยอะไรไปแล้วบ้าง
       */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2.5 sm:px-6 3xl:px-7">
        <div className="min-w-[11rem] flex-1 basis-[12rem]">
          <Select
            value={filters.status}
            onChange={(event) => updateFilter({ status: event.target.value })}
            aria-label="สถานะคำขอ"
          >
            <option value="">ทุกสถานะ</option>
            {config.statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-w-[21rem] flex-[2] basis-[24rem] items-center gap-1.5">
          <div className="flex-1">
            <ThaiDateInput
              value={filters.dateFrom}
              onChange={(event) =>
                updateFilter({ dateFrom: event.target.value })
              }
              placeholder="ตั้งแต่วันที่"
              aria-label="ตั้งแต่วันที่"
            />
          </div>
          <span aria-hidden className="text-[13px] text-slate-300">
            –
          </span>
          <div className="flex-1">
            <ThaiDateInput
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(event) => updateFilter({ dateTo: event.target.value })}
              placeholder="ถึงวันที่"
              aria-label="ถึงวันที่"
            />
          </div>
        </div>

        {config.hideOrgFilters ? null : (
          <>
            <div className="min-w-[11rem] flex-1 basis-[12rem]">
              <FilterSelect
                allLabel="ทุกสาขา"
                value={filters.branchId}
                options={branches}
                onChange={(value) =>
                  updateFilter({ branchId: value, departmentId: "" })
                }
              />
            </div>

            <div className="min-w-[11rem] flex-1 basis-[12rem]">
              <FilterSelect
                allLabel="ทุกแผนก"
                value={filters.departmentId}
                options={departmentOptions}
                onChange={(value) => updateFilter({ departmentId: value })}
              />
            </div>
          </>
        )}

        {config.extraFilters?.map((extra) => (
          <div key={extra.key} className="min-w-[11rem] flex-1 basis-[12rem]">
            <Select
              value={filters.extra[extra.key] ?? ""}
              onChange={(event) => updateExtra(extra.key, event.target.value)}
              aria-label={extra.label}
            >
              <option value="">{extra.allLabel}</option>
              {extra.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ))}

        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline 3xl:text-[13px]"
          >
            <Filter className="h-3.5 w-3.5" />
            ล้างตัวกรอง {activeFilterCount}
          </button>
        ) : null}

        <span className="ml-auto hidden shrink-0 truncate whitespace-nowrap text-[12px] text-slate-500 sm:inline 3xl:text-[13px]">
          พบ {meta.total.toLocaleString("th-TH")} รายการ
        </span>
      </div>

      {errorText ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="critical">{errorText}</Notice>
        </div>
      ) : null}

      {/* แถวสลับสีขาว/ฟ้าอ่อน โทนเดียวกับรายการในแท็บรออนุมัติ */}
      <div className="[&_tbody_tr:nth-child(even)]:bg-brand-50/40">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(item) => config.getId(item)}
          onRowClick={setDetail}
          loading={loading && items.length === 0}
          emptyTitle={config.emptyText}
          emptyDescription="ลองเปลี่ยนช่วงวันที่ สถานะ หรือคำค้นหา"
        />
      </div>

      {!loading && items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6 3xl:px-7">
          <span className="text-[13px] text-slate-400">
            แสดง {items.length.toLocaleString("th-TH")} จาก{" "}
            {meta.total.toLocaleString("th-TH")} รายการ · หน้า{" "}
            {meta.page.toLocaleString("th-TH")} จาก{" "}
            {Math.max(1, meta.totalPages).toLocaleString("th-TH")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={page >= meta.totalPages || loading}
              onClick={() => {
                setPage((current) => current + 1);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      {detail ? (
        <DetailModal
          requestNo={config.getRequestNo(detail)}
          employee={config.getEmployee(detail)}
          statusTone={STATUS_TONE_MAP[config.statusTone(config.getStatus(detail))]}
          statusLabel={
            config.statusText[config.getStatus(detail)] ?? config.getStatus(detail)
          }
          submittedAt={config.getSubmittedAt(detail) ?? null}
          approver={config.getApprover?.(detail) ?? null}
          reason={config.getReason(detail)}
          rows={config.detailRows(detail)}
          attachmentSource={config.getAttachmentSource?.(detail) ?? null}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * ตัวกรองสังกัดในแถบเครื่องมือ
 * ไม่มีป้ายกำกับด้านบน — ตัวเลือกแรก ("ทุกบริษัท" ฯลฯ) บอกอยู่แล้วว่ากรองอะไร
 * และความกว้างปล่อยให้กริดของแถบตัวกรองเป็นคนคุม
 */
function FilterSelect({
  allLabel,
  value,
  options,
  onChange,
}: {
  allLabel: string;
  value: string;
  options: OrgOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={allLabel}
      className="w-full bg-slate-50/80"
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {orgLabel(option)}
        </option>
      ))}
    </Select>
  );
}

function DetailModal({
  requestNo,
  employee,
  statusTone,
  statusLabel,
  submittedAt,
  approver,
  reason,
  rows,
  attachmentSource,
  onClose,
}: {
  requestNo: string;
  employee: RequestEmployee | null;
  statusTone: Tone;
  statusLabel: string;
  submittedAt: string | null;
  approver: string | null;
  reason: string;
  rows: Array<{ label: string; value: ReactNode }>;
  attachmentSource: AttachmentSource | null;
  onClose: () => void;
}) {
  const name = personName(employee);
  const org =
    [employee?.department?.nameTh, employee?.branch?.nameTh]
      .filter(Boolean)
      .join(" · ") || "-";

  return (
    <Modal
      open
      title={`เลขที่คำขอ ${requestNo}`}
      description={name}
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
      onClose={onClose}
    >
      {/* หัวใบ: ใครยื่น สถานะไหน ยื่นเมื่อไหร่ — เรียงแบบเดียวกับใบในแท็บรออนุมัติ */}
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <Avatar name={name} src={employeeAvatarUrl(employee)} size="md" />

        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
            {name}
          </p>
          <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
            {[employee?.employeeCode, employee?.position, org]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={statusTone}>{statusLabel}</Badge>
          <span className="whitespace-nowrap text-[11px] text-slate-400 3xl:text-[11.5px]">
            ยื่นเมื่อ {submittedAt ? formatThaiDateTime(submittedAt) : "-"}
          </span>
        </div>
      </div>

      {/*
       * ทุกช่องมีขีดนำหน้าเหมือนใบคำขอในแท็บรออนุมัติ ข้อความจะได้ไม่ลอยบนพื้นว่าง
       * เหตุผลกับผู้อนุมัติเป็นช่องหนึ่งในกริดเดียวกัน ไม่แยกเป็นบล็อกที่ต้องขึ้นแถวใหม่
       */}
      <div className="grid gap-x-4 gap-y-2 border-t border-slate-100 pt-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="min-w-0 border-l-2 border-slate-200 pl-2.5"
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {row.label}
            </p>
            <p className="break-words text-[12.5px] font-semibold leading-[18px] text-slate-800 3xl:text-[13px]">
              {row.value}
            </p>
          </div>
        ))}

        <div className="min-w-0 border-l-2 border-slate-200 pl-2.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            เหตุผล
          </p>
          <p className="whitespace-pre-line text-[12.5px] leading-[18px] text-slate-700 3xl:text-[13px]">
            {reason || "-"}
          </p>
        </div>

        {approver ? (
          <div className="min-w-0 border-l-2 border-emerald-200 pl-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              ผู้อนุมัติ
            </p>
            <p className="break-words text-[12.5px] font-semibold leading-[18px] text-emerald-700 3xl:text-[13px]">
              {approver}
            </p>
          </div>
        ) : null}
      </div>

      {/* ไฟล์แนบอยู่นอกกริด เพราะรูปต้องการความกว้างเต็ม ไม่ใช่หนึ่งในสามคอลัมน์ */}
      {attachmentSource ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <ApprovalAttachments item={attachmentSource} variant="preview" />
        </div>
      ) : null}
    </Modal>
  );
}

export { formatThaiDate, formatThaiDateTime };
