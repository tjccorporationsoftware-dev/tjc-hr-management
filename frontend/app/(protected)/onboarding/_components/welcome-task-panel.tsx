"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";

import { getOnboardingProgress } from "@/lib/api";
import type { OnboardingProgressItem } from "@/types/onboarding";

import {
  Badge,
  Button,
  DataTable,
  IconButton,
  Notice,
  SearchInput,
  Select,
  type Column,
} from "@/components/kit";
import { formatThaiDate } from "@/lib/date-format";

import { WelcomeTaskDetailModal } from "./welcome-task-detail-modal";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

/**
 * แท็บ "งานต้อนรับ"
 * ----------------
 * มองเป็นรายคน ไม่ใช่กองงานรวมของทั้งบริษัท
 * เดิมเป็นตารางงานทุกคนปนกัน จะรู้ว่าใครเหลืออะไรต้องกวาดตาหาชื่อเอง
 *
 * ที่นี่หนึ่งแถวคือพนักงานหนึ่งคน กดรายละเอียดเพื่อกางเช็กลิสต์
 * แล้วไล่ติ๊กงานของคนนั้น
 */

const PAGE_SIZE = 20;

type TaskFilter = "ALL" | "PENDING" | "DONE";

function personName(employee: OnboardingProgressItem["employee"]) {
  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.employeeCode
  );
}

export function WelcomeTaskPanel() {
  const [items, setItems] = useState<OnboardingProgressItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("ALL");
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
      });

      setItems(response.items);
      setMeta({
        page: response.meta.page,
        totalPages: Math.max(1, response.meta.totalPages),
        total: response.meta.total,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดรายชื่อไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  /*
   * กรองฝั่งหน้าจอ เพราะ /onboarding/progress ไม่มีตัวกรองตามสถานะงาน
   * ข้อมูลชุดนี้เป็นรายคนไม่กี่สิบแถว กรองตรงนี้เร็วกว่ารอเพิ่ม query ฝั่ง backend
   */
  const visibleItems = items.filter((item) => {
    if (filter === "ALL") return true;

    const done = item.tasks.total > 0 && item.tasks.done === item.tasks.total;
    return filter === "DONE" ? done : !done;
  });

  const columns: Array<Column<OnboardingProgressItem>> = [
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap font-semibold text-slate-900 3xl:text-[14px]">
            {personName(item.employee)}
          </p>
          <p className="break-words text-[11px] text-slate-400 3xl:text-[12px]">
            {[
              item.employee.employeeCode,
              item.employee.position,
              item.employee.department?.nameTh,
            ]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>
      ),
    },
    {
      key: "startDate",
      header: "เริ่มงาน",
      hideBelow: "lg",
      cell: (item) => (
        <span className="whitespace-nowrap tabular-nums text-slate-700">
          {item.employee.startDate
            ? formatThaiDate(item.employee.startDate)
            : "-"}
        </span>
      ),
    },
    {
      key: "progress",
      header: "งานต้อนรับ",
      align: "right",
      cell: (item) => {
        if (item.tasks.total === 0) {
          return <span className="text-slate-300">ยังไม่มีงาน</span>;
        }

        const complete = item.tasks.done >= item.tasks.total;

        return (
          <span
            className={[
              "font-semibold tabular-nums",
              complete ? "text-emerald-700" : "text-slate-800",
            ].join(" ")}
          >
            {item.tasks.done}/{item.tasks.total}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (item) => {
        if (item.tasks.total === 0) {
          return <Badge tone="neutral">ยังไม่ได้กางเช็กลิสต์</Badge>;
        }

        if (item.tasks.overdue > 0) {
          return (
            <Badge tone="critical">เลยกำหนด {item.tasks.overdue} งาน</Badge>
          );
        }

        return item.tasks.done >= item.tasks.total ? (
          <Badge tone="positive">ครบแล้ว</Badge>
        ) : (
          <Badge tone="warning">
            เหลือ {item.tasks.total - item.tasks.done} งาน
          </Badge>
        );
      },
    },
    {
      key: "action",
      header: "รายละเอียด",
      align: "right",
      cell: (item) => (
        <Button size="sm" onClick={() => setDetailItem(item)}>
          รายละเอียด
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="ค้นหาชื่อ หรือ รหัสพนักงาน"
          aria-label="ค้นหาพนักงาน"
          className="w-full sm:w-72 3xl:w-80"
        />

        <Select
          value={filter}
          onChange={(event) => setFilter(event.target.value as TaskFilter)}
          className="w-full bg-slate-50/80 sm:w-52"
          aria-label="สถานะงานต้อนรับ"
        >
          <option value="ALL">ทุกสถานะ</option>
          <option value="PENDING">ยังไม่ครบ</option>
          <option value="DONE">ครบแล้ว</option>
        </Select>

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

      <DataTable
        columns={columns}
        rows={visibleItems}
        rowKey={(item) => item.employee.id}
        loading={loading && items.length === 0}
        minWidth="min-w-0"
        emptyTitle="ไม่มีพนักงานตามเงื่อนไขที่เลือก"
        emptyDescription="พนักงานจะขึ้นที่นี่เมื่ออยู่ในกระบวนการรับเข้า"
      />

      {!loading && visibleItems.length > 0 ? (
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
        <WelcomeTaskDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </>
  );
}
