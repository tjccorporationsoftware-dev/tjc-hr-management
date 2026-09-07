"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Download,
  Eye,
  EyeOff,
  FileClock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  ButtonLink,
  CellStack,
  DataTable,
  IconButton,
  Money,
  Notice,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  joinClassName,
  type Column,
} from "@/components/kit";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { LoadingState } from "@/components/common/feedback-state";
import {
  approvePayrollRun,
  calculatePayrollRun,
  cancelPayrollRun,
  createPayrollRun,
  downloadPayrollPayslipPdf,
  getPayrollPeriodById,
  getPayrollRunById,
  getPayrollRunPayslipPublicationStatus,
  getPayrollRunProgress,
  getPayrollRunReadiness,
  getPayrollRuns,
  getOrganizationBranches,
  getPayrollTaxYears,
  hidePayrollRunPayslipDetails,
  markPayrollRunPaid,
  publishPayrollRunPayslips,
  reviewPayrollRun,
  showPayrollRunPayslipDetails,
  unpublishPayrollRunPayslips,
  type PayslipPaperLayout,
} from "@/lib/api";
import {
  count,
  dateText,
  dateTimeText,
  dedupeTaxYears,
  downloadBlob,
  errorText,
  money,
} from "@/lib/payroll-format";
import {
  buildAttendanceDepartmentGroupRank,
  getAttendanceSessionGroupRank,
} from "@/lib/attendance-session-group";
import { compareEmployeeSeniority } from "@/lib/employee-seniority";
import type {
  PayrollItem,
  PayrollPayslipPublicationStatusResponse,
  PayrollPeriod,
  PayrollReadinessResponse,
  PayrollRun,
  PayrollRunProgressResponse,
  PayrollRunDetail,
  PayrollRunEasyEmployeeSummary,
} from "@/types/payroll";

import { CalculatingOverlay } from "../_components/calculating-overlay";
import { DocumentsPanel } from "../_components/documents-panel";
import { ItemDetailModal } from "../_components/item-detail-modal";
import { periodLabel } from "../_components/period-format";
import {
  PendingRequestsPanel,
  pendingEmployeeIds,
} from "../_components/pending-requests-panel";
import { ReadinessPanel } from "../_components/readiness-panel";
import { RunSummaryPanel } from "../_components/run-summary-panel";
import { RunStepRail } from "../_components/run-step-rail";

/**
 * ทำเงินเดือนของงวดเดียว
 * ----------------------
 * งานทั้งงวดจบในหน้านี้: คำนวณ → ตรวจ → อนุมัติ → จ่าย แล้วออกสลิปกับไฟล์นำส่ง
 *
 * แยกเป็น route ของตัวเองเพื่อให้ลิงก์ถึงงวดได้ตรง ๆ และปุ่มย้อนกลับของเบราว์เซอร์
 * พากลับไปหน้ารายการงวดได้เอง
 *
 * ปุ่มหลักมีปุ่มเดียวเสมอและเปลี่ยนไปตามสถานะของงวด เพื่อให้รู้ว่า
 * "ตอนนี้ต้องกดอะไรต่อ" โดยไม่ต้องอ่านคู่มือ
 */

type TabKey = "amounts" | "pending" | "checks" | "files";

function employeeName(item: PayrollItem) {
  const employee = item.employee;
  return (
    employee.displayName ||
    `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
    employee.employeeCode ||
    "-"
  );
}

/** รายละเอียดหนึ่งช่องของงวด — ป้ายเล็กด้านบน ค่าตัวหนาด้านล่าง */
function PeriodFact({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-[8.5rem] flex-auto px-4 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]">
        {label}
      </p>
      <p
        className={joinClassName(
          "mt-0.5 text-[13px] font-semibold tabular-nums 3xl:text-[13.5px]",
          muted ? "text-slate-400" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** ยอดย่อยในตาราง — ศูนย์ให้จางลง จะได้กวาดตาเห็นเฉพาะคนที่มีรายการจริง */
function SoftMoney({
  value,
  tone = "neutral",
}: {
  value?: number | null;
  tone?: "neutral" | "deduction";
}) {
  const amount = Number(value ?? 0);

  return (
    <span
      className={
        amount
          ? tone === "deduction"
            ? "text-rose-600/90"
            : "text-slate-600"
          : "text-slate-300"
      }
    >
      <Money value={amount} />
    </span>
  );
}

/** คีย์ของกลุ่มในตาราง — แผนกซ้อนอยู่ใต้สาขา ชื่อแผนกซ้ำข้ามสาขาได้จึงต้องรวมสาขาไว้ในคีย์ */
const branchKeyOf = (item: PayrollItem) => `b:${item.branchId ?? "none"}`;
// หมายเหตุ: คีย์ตรงนี้อิง branchId/departmentId ของรายการค่าจ้าง ไม่ใช่สังกัดปัจจุบันของพนักงาน
// เพราะงวดที่ปิดไปแล้วต้องคงสังกัด ณ ตอนคำนวณไว้ จึงไม่ใช้ตัวสร้างคีย์กลางของหน้าเวลาทำงาน
const departmentKeyOf = (item: PayrollItem) =>
  `${branchKeyOf(item)}|d:${item.departmentId ?? "none"}`;

type GroupTotals = {
  employees: number;
  earnings: number;
  deductions: number;
  net: number;
};

/**
 * หัวคั่นกลุ่มในตาราง — ชื่อสังกัดอยู่ซ้าย ยอดรวมของกลุ่มอยู่ขวา
 *
 * ยอดตรงนี้ตั้งใจให้เป็นสีเทาล้วน ไม่ใช้แดง/น้ำเงินเหมือนในแถวข้อมูล
 * เพราะถ้าใส่สีทุกชั้นซ้ำกันทั้งหน้า ตาจะแยกไม่ออกว่าบรรทัดไหนคือข้อมูลจริง
 * ลำดับชั้นอ่านจากพื้นหลังกับระยะเยื้องแทน
 */
function GroupHeading({
  level,
  title,
  code,
  totals,
}: {
  level: 0 | 1;
  title: string;
  code?: string | null;
  totals?: GroupTotals;
}) {
  return (
    <div
      className={joinClassName(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-1",
        level === 0
          ? "text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] font-bold text-brand-900"
          : "text-[12.5px] 3xl:text-[13.5px] 4xl:text-[14px] font-semibold text-brand-700",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {/* สาขากับแผนกใช้สีเดียวกันคนละเฉด ให้อ่านออกว่าอันไหนเป็นชั้นย่อย */}
        <span
          className={joinClassName(
            "shrink-0 rounded-full",
            level === 0 ? "h-4 w-1.5 bg-brand-600" : "h-3.5 w-1 bg-brand-300",
          )}
        />
        <span className="truncate">{title}</span>
        {code ? (
          <span
            className={joinClassName(
              "font-semibold",
              level === 0 ? "text-brand-500" : "text-brand-300",
            )}
          >
            {code}
          </span>
        ) : null}
        {totals ? (
          <span
            className={joinClassName(
              "font-semibold",
              level === 0 ? "text-brand-500" : "text-brand-400",
            )}
          >
            {totals.employees} คน
          </span>
        ) : null}
      </span>

      {totals ? (
        /**
         * ตัวเลขเข้มเต็มที่ แต่ให้สีแค่ตัวเดียวคือยอดสุทธิ
         * ป้ายกำกับตัวเล็กสีจางเป็นตัวสร้างความต่าง แทนที่จะใช้สีแยกทีละก้อน
         */
        <span className="flex flex-wrap items-center gap-x-6 gap-y-1 tabular-nums">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-medium uppercase tracking-wide text-slate-400">
              รายได้
            </span>
            <span className="font-bold text-slate-900">
              {money(totals.earnings)}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-medium uppercase tracking-wide text-slate-400">
              หัก
            </span>
            <span className="font-bold text-slate-900">
              {money(totals.deductions)}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10px] 3xl:text-[10.5px] 4xl:text-[11.5px] font-medium uppercase tracking-wide text-slate-400">
              สุทธิ
            </span>
            <span className="font-bold text-brand-700">
              {money(totals.net)}
            </span>
          </span>
        </span>
      ) : null}
    </div>
  );
}

export default function PayrollPeriodPage() {
  const params = useParams<{ periodId: string }>();
  const periodId = params?.periodId ?? "";

  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [loadingPeriod, setLoadingPeriod] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [readiness, setReadiness] = useState<PayrollReadinessResponse | null>(
    null,
  );
  const [publication, setPublication] =
    useState<PayrollPayslipPublicationStatusResponse | null>(null);

  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  /*
   * สาขาที่รอบใหม่จะครอบคลุม — ค่าว่างคือ "ทุกสาขา" ซึ่งเป็นพฤติกรรมเดิม
   * เลือกได้เฉพาะตอนยังไม่มีรอบ เพราะขอบเขตถูกตรึงตั้งแต่ตอนสร้าง
   * (ถ้าให้เปลี่ยนทีหลังได้ ยอดที่คำนวณไปแล้วจะไม่ตรงกับขอบเขตใหม่)
   */
  const [branchOptions, setBranchOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [runBranchId, setRunBranchId] = useState("");

  /**
   * ชื่อสาขาที่รอบปัจจุบันจำกัดไว้ — null เมื่อครอบคลุมทั้งบริษัท
   * เลือกหลายสาขาได้ฝั่ง API แต่หน้านี้ให้เลือกทีละสาขา จึงต่อชื่อด้วย ·
   */
  const runBranchLabel = useMemo(() => {
    const ids = run?.branchIds ?? [];

    if (ids.length === 0) return null;

    const names = ids.map(
      (id) => branchOptions.find((branch) => branch.id === id)?.label ?? id,
    );

    return names.join(" · ");
  }, [branchOptions, run]);

  const [taxYearId, setTaxYearId] = useState("");
  const [tab, setTab] = useState<TabKey>("amounts");
  /* รหัสพนักงานที่กำลังคำนวณใหม่รายคนอยู่ ใช้ปิดปุ่มเฉพาะแถวนั้น */
  const [recalculatingEmployeeId, setRecalculatingEmployeeId] = useState<
    string | null
  >(null);
  /* แถวที่ถูกกดมาจากแท็บใบคำขอค้าง ไฮไลต์ไว้ให้หาเจอ */
  const [focusEmployeeId, setFocusEmployeeId] = useState<string | null>(null);
  /* กรองเหลือเฉพาะคนที่มีใบคำขอค้าง — ไว้ไล่ตามให้จบก่อนอนุมัติ */
  const [onlyPending, setOnlyPending] = useState(false);
  const [search, setSearch] = useState("");
  const [downloadingItemId, setDownloadingItemId] = useState<string | null>(
    null,
  );
  /* ใช้กับปุ่มดาวน์โหลดสลิปทุกแถว — ครึ่งหน้าไว้พิมพ์ 2 ใบต่อแผ่นแล้วตัดแบ่ง */
  const [paperLayout, setPaperLayout] = useState<PayslipPaperLayout>("FULL");
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  const [progress, setProgress] = useState<PayrollRunProgressResponse | null>(
    null,
  );

  const companyId = period?.companyId ?? "";

  /** งวดต้องโหลดก่อน เพราะเป็นตัวบอกว่าอยู่บริษัทไหน ปีภาษีกับเอกสารถึงจะดึงถูกชุด */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!periodId) return;

      try {
        const result = await getPayrollPeriodById(periodId);
        if (cancelled) return;

        setPeriod(result);
        const years = await getPayrollTaxYears({
          companyId: result.companyId,
          page: 1,
          pageSize: 50,
        });
        if (!cancelled) {
          setTaxYearId(dedupeTaxYears(years.data)[0]?.id ?? "");
        }
      } catch (error) {
        if (cancelled) return;
        setNotFound(true);
        toast.error(errorText(error, "ไม่พบงวดเงินเดือนนี้"));
      } finally {
        if (!cancelled) setLoadingPeriod(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [periodId]);

  /**
   * หนึ่งงวดควรมีรอบที่ใช้งานอยู่รอบเดียว ระบบจึงหยิบรอบที่ยังไม่ยกเลิกมาแสดง
   * ถ้ายังไม่มีก็แสดงปุ่มให้เริ่มรอบคำนวณ
   */
  const loadRun = useCallback(async (targetPeriodId: string) => {
    if (!targetPeriodId) return;

    setLoadingRun(true);
    try {
      const runResult = await getPayrollRuns({
        periodId: targetPeriodId,
        page: 1,
        pageSize: 20,
      });
      setRuns(runResult.data);

      const active =
        runResult.data.find((item) => item.status !== "CANCELLED") ?? null;

      if (!active) {
        setRun(null);
        setReadiness(null);
        return;
      }

      setRun(await getPayrollRunById(active.id));
      setReadiness(null);
    } catch (error) {
      toast.error(errorText(error, "โหลดรอบคำนวณไม่สำเร็จ"));
    } finally {
      setLoadingRun(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRun(periodId), 0);
    return () => window.clearTimeout(timer);
  }, [periodId, loadRun]);

  /*
   * รายชื่อสาขาไว้ให้เลือกขอบเขตของรอบ
   * โหลดพลาดก็ไม่เป็นไร ตัวเลือกจะเหลือแค่ "ทุกสาขา" ซึ่งคือพฤติกรรมเดิม
   */
  useEffect(() => {
    if (!companyId) return;

    let cancelled = false;

    void (async () => {
      try {
        const result = await getOrganizationBranches({
          companyId,
          pageSize: 200,
          status: "ACTIVE",
        });

        if (cancelled) return;

        setBranchOptions(
          result.items.map((branch) => ({
            id: branch.id,
            label: branch.nameTh || branch.nameEn || branch.code,
          })),
        );
      } catch {
        // ตัวเลือกสาขาเป็นของเสริม ไม่ควรกันไม่ให้ทำเงินเดือน
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const loadReadiness = useCallback(async (runId: string) => {
    setLoadingReadiness(true);
    try {
      setReadiness(await getPayrollRunReadiness(runId));
    } catch (error) {
      toast.error(errorText(error, "ตรวจข้อมูลงวดไม่สำเร็จ"));
    } finally {
      setLoadingReadiness(false);
    }
  }, []);

  // ผลตรวจโหลดตอนเปิดแท็บเท่านั้น เพราะเป็น query ที่หนักที่สุดของหน้า
  const runId = run?.id;
  const readinessRunId = readiness?.run.id;

  useEffect(() => {
    if (
      (tab !== "checks" && tab !== "pending") ||
      !runId ||
      readinessRunId === runId
    ) {
      return;
    }

    const timer = window.setTimeout(() => void loadReadiness(runId), 0);
    return () => window.clearTimeout(timer);
  }, [tab, runId, readinessRunId, loadReadiness]);

  /** สถานะสลิปโหลดพร้อมรอบ เพราะต้องขึ้นบนแถบหัวตั้งแต่เปิดหน้า */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!runId) {
        if (!cancelled) setPublication(null);
        return;
      }

      try {
        const status = await getPayrollRunPayslipPublicationStatus(runId);
        if (!cancelled) setPublication(status);
      } catch {
        if (!cancelled) setPublication(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  /**
   * เรียงตามสาขา แล้วเรียงแผนกตามกลุ่มการลงเวลา
   * (บริหาร → ลงครบ 3 รอบ → ยกเว้นเข้างานบ่าย → ยกเว้นรอบอื่น)
   * ชุดเดียวกับหน้าตรวจเวลาและทะเบียนพนักงาน คนที่ยังไม่ผูกสังกัดไปอยู่ท้ายสุด
   */
  /* คนที่มีใบคำขอค้าง ใช้ติดป้ายเตือนบนแถวและใช้เป็นตัวกรอง */
  const pendingIds = useMemo(() => pendingEmployeeIds(readiness), [readiness]);

  const filteredItems = useMemo(() => {
    const items = run?.items ?? [];
    const keyword = search.trim().toLowerCase();

    const searched = keyword
      ? items.filter((item) =>
          `${item.employee.employeeCode ?? ""} ${employeeName(item)} ${item.departmentName ?? ""} ${item.branchName ?? ""}`
            .toLowerCase()
            .includes(keyword),
        )
      : items;

    const matched = onlyPending
      ? searched.filter((item) => pendingIds.has(item.employeeId))
      : searched;

    const departmentRank = buildAttendanceDepartmentGroupRank(
      matched,
      (item) => item.employee,
      departmentKeyOf,
    );

    return [...matched].sort((a, b) => {
      if (Boolean(a.branchId) !== Boolean(b.branchId))
        return a.branchId ? -1 : 1;
      const byBranch = (a.branchName ?? "").localeCompare(
        b.branchName ?? "",
        "th",
      );
      if (byBranch !== 0) return byBranch;

      if (Boolean(a.departmentId) !== Boolean(b.departmentId)) {
        return a.departmentId ? -1 : 1;
      }

      const byDepartmentRank =
        (departmentRank.get(departmentKeyOf(a)) ?? 99) -
        (departmentRank.get(departmentKeyOf(b)) ?? 99);
      if (byDepartmentRank !== 0) return byDepartmentRank;

      const byDepartment = (a.departmentName ?? "").localeCompare(
        b.departmentName ?? "",
        "th",
      );
      if (byDepartment !== 0) return byDepartment;

      const bySessionGroup =
        getAttendanceSessionGroupRank(a.employee) -
        getAttendanceSessionGroupRank(b.employee);
      if (bySessionGroup !== 0) return bySessionGroup;

      /* ผู้บริหารขึ้นก่อนภายในแผนกเดียวกัน ให้ตรงกับหน้ารายชื่ออื่น ๆ */
      const bySeniority = compareEmployeeSeniority(a.employee, b.employee);
      if (bySeniority !== 0) return bySeniority;

      return (a.employee.employeeCode ?? "").localeCompare(
        b.employee.employeeCode ?? "",
      );
    });
  }, [run, search, onlyPending, pendingIds]);

  /** ยอดรวมของแต่ละสาขาและแต่ละแผนก ใช้แสดงบนหัวกลุ่มในตาราง */
  const groupTotals = useMemo(() => {
    const totals = new Map<string, GroupTotals>();

    for (const item of filteredItems) {
      for (const key of [branchKeyOf(item), departmentKeyOf(item)]) {
        const current = totals.get(key) ?? {
          employees: 0,
          earnings: 0,
          deductions: 0,
          net: 0,
        };

        current.employees += 1;
        current.earnings += Number(item.totalEarnings ?? 0);
        current.deductions += Number(item.totalDeductions ?? 0);
        current.net += Number(item.totalNetPay ?? 0);
        totals.set(key, current);
      }
    }

    return totals;
  }, [filteredItems]);

  const cancelledRunCount = useMemo(
    () => runs.filter((item) => item.status === "CANCELLED").length,
    [runs],
  );

  /** ยอดแยกรายคนที่ backend คิดมาแล้ว จับคู่กับแถวในตารางด้วย itemId */
  const easyRowByItemId = useMemo(() => {
    const map = new Map<string, PayrollRunEasyEmployeeSummary>();
    for (const row of run?.summary?.easy.rows ?? []) map.set(row.itemId, row);
    return map;
  }, [run]);

  const detailItem = useMemo(
    () => run?.items.find((item) => item.id === detailItemId) ?? null,
    [run, detailItemId],
  );

  /**
   * ใครทำอะไรกับรอบนี้ไปแล้วบ้าง — เอาเฉพาะขั้นที่เกิดขึ้นจริง
   * เงินเดือนเป็นงานที่ต้องตรวจย้อนหลังได้ ผู้ตรวจกับผู้อนุมัติจึงต้องเห็นชัดว่าเป็นคนละคน
   */
  const runTrail = useMemo(() => {
    if (!run) return [];

    const steps = [
      {
        key: "created",
        label: "สร้างรอบ",
        user: run.createdBy,
        at: run.createdAt,
      },
      {
        key: "calculated",
        label: "คำนวณ",
        user: run.calculatedBy,
        at: run.calculatedAt,
      },
      {
        key: "reviewed",
        label: "ตรวจ",
        user: run.reviewedBy,
        at: run.reviewedAt,
      },
      {
        key: "approved",
        label: "อนุมัติ",
        user: run.approvedBy,
        at: run.approvedAt,
      },
      { key: "paid", label: "จ่าย", user: run.paidBy, at: run.paidAt },
      {
        key: "cancelled",
        label: "ยกเลิก",
        user: run.cancelledBy,
        at: run.cancelledAt,
      },
    ];

    return steps
      .filter((step) => Boolean(step.at))
      .map((step) => ({
        key: step.key,
        label: step.label,
        name: step.user?.displayName || step.user?.email || "ระบบ",
        at: dateTimeText(step.at),
      }));
  }, [run]);

  async function refreshRun() {
    if (!run) return;
    setRun(await getPayrollRunById(run.id));
    setReadiness(null);
  }

  async function startRun() {
    if (!periodId || !companyId) return;
    setActing("start");
    try {
      const created = await createPayrollRun({
        /* ไม่เลือก = ไม่ส่งฟิลด์นี้เลย backend จะได้ทำงานเหมือนเดิมทุกประการ */
        ...(runBranchId ? { branchIds: [runBranchId] } : {}),
        companyId,
        periodId,
      });
      setRun(await getPayrollRunById(created.id));
      setRuns((current) => [created, ...current]);
      toast.success("สร้างรอบคำนวณแล้ว กดคำนวณเงินเดือนต่อได้เลย");
    } catch (error) {
      toast.error(errorText(error, "สร้างรอบคำนวณไม่สำเร็จ"));
    } finally {
      setActing(null);
    }
  }

  /**
   * ระหว่างคำนวณจะเปิดป๊อปอัพค้างไว้ และดึงความคืบหน้าจาก backend ทุกวินาที
   * เพราะคำขอ calculate เป็น request เดียวยาว ๆ ถ้าไม่มีอะไรขึ้นผู้ใช้จะกดซ้ำ
   */
  async function calculate() {
    if (!run) return;

    setActing("calculate");
    setProgress(null);

    const runId = run.id;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          setProgress(await getPayrollRunProgress(runId));
        } catch {
          // ระหว่างคำนวณอาจดึงความคืบหน้าไม่ได้บางจังหวะ ไม่ต้องรบกวนผู้ใช้
        }
      })();
    }, 1000);

    try {
      await calculatePayrollRun(runId, {});
      await refreshRun();
      toast.success("คำนวณเสร็จแล้ว — ดูแท็บผลตรวจก่อนอนุมัติ");
      setTab("checks");
    } catch (error) {
      toast.error(errorText(error, "คำนวณเงินเดือนไม่สำเร็จ"));
    } finally {
      window.clearInterval(timer);
      setProgress(null);
      setActing(null);
    }
  }

  function confirmReview() {
    if (!run) return;
    setDialog({
      title: "ยืนยันว่าตรวจข้อมูลแล้ว?",
      description:
        "ยืนยันแล้วจะส่งต่อให้ผู้มีสิทธิ์อนุมัติ ยังแก้ไขและคำนวณใหม่ได้อยู่",
      confirmLabel: "ตรวจแล้ว",
      tone: "blue",
      onConfirm: async () => {
        await reviewPayrollRun(run.id, undefined, { response: "summary" });
        await refreshRun();
      },
    });
  }

  function confirmApprove() {
    if (!run) return;
    setDialog({
      title: "อนุมัติงวดนี้?",
      description: "อนุมัติแล้วยอดจะถูกล็อก ใช้ออกสลิปและไฟล์นำส่งหน่วยงานได้",
      confirmLabel: "อนุมัติ",
      tone: "blue",
      onConfirm: async () => {
        await approvePayrollRun(run.id, undefined, { response: "summary" });
        await refreshRun();
      },
    });
  }

  function confirmPaid() {
    if (!run) return;
    setDialog({
      title: "บันทึกว่าจ่ายเงินแล้ว?",
      description:
        "ใช้หลังโอนเงินเข้าบัญชีพนักงานเรียบร้อยแล้ว งวดจะถูกปิดและแก้ไขไม่ได้อีก",
      confirmLabel: "จ่ายแล้ว",
      tone: "blue",
      onConfirm: async () => {
        await markPayrollRunPaid(run.id, undefined, { response: "summary" });
        await refreshRun();
      },
    });
  }

  function confirmCancel() {
    if (!run) return;
    setDialog({
      title: "ยกเลิกรอบคำนวณนี้?",
      description: "ยอดที่คำนวณไว้จะถูกทิ้ง ต้องเริ่มรอบใหม่ถ้าจะทำงวดนี้อีก",
      confirmLabel: "ยกเลิกรอบ",
      tone: "red",
      onConfirm: async () => {
        await cancelPayrollRun(run.id, undefined, { response: "summary" });
        await loadRun(periodId);
      },
    });
  }

  /**
   * เปิด/ปิดสลิปใน ESS — ต้องทำสองขั้นเสมอ (เผยแพร่ + เปิดรายละเอียด)
   * เพราะสองค่านี้แยกกันใน backend ถ้าทำครึ่งเดียวพนักงานจะเห็นสลิปเปล่า
   */
  async function togglePayslipPublication() {
    if (!run) return;

    setActing("publish");
    try {
      if (payslipVisibleInEss) {
        await hidePayrollRunPayslipDetails(run.id);
        setPublication(await unpublishPayrollRunPayslips(run.id));
        toast.success("ปิดไม่ให้พนักงานเห็นสลิปแล้ว");
      } else {
        await publishPayrollRunPayslips(run.id);
        setPublication(await showPayrollRunPayslipDetails(run.id));
        toast.success("เผยแพร่สลิปให้พนักงานดูใน ESS แล้ว");
      }
    } catch (error) {
      toast.error(errorText(error, "เปลี่ยนการแสดงสลิปไม่สำเร็จ"));
    } finally {
      setActing(null);
    }
  }

  async function downloadPayslip(item: PayrollItem) {
    setDownloadingItemId(item.id);
    try {
      const blob = await downloadPayrollPayslipPdf(item.id, paperLayout);
      downloadBlob(
        blob,
        `payslip-${item.employee.employeeCode ?? item.id}${paperLayout === "HALF" ? "-a5" : ""}.pdf`,
      );
    } catch (error) {
      toast.error(errorText(error, "ดาวน์โหลดสลิปไม่สำเร็จ"));
    } finally {
      setDownloadingItemId(null);
    }
  }

  /**
   * "คำนวณใหม่" ขึ้นเฉพาะรอบที่คำนวณไปแล้วเท่านั้น
   * - DRAFT ยังไม่เคยคำนวณ ปุ่มหลักคือ "คำนวณเงินเดือน" อยู่แล้ว จะซ้ำกันเปล่า ๆ
   * - REVIEWED ขึ้นไป backend ล็อกไม่ให้คำนวณซ้ำ (isLockedForCalculation) กดไปก็ error
   * FAILED ให้กดซ้ำได้ผ่านปุ่มหลักซึ่งเปลี่ยนเป็น "คำนวณเงินเดือน" ให้แล้ว
   */
  const canRecalculate = run?.status === "CALCULATED";

  /** ยกเลิกรอบได้จนกว่าจะอนุมัติ — หลังอนุมัติ/จ่ายแล้ว backend ไม่ให้ยกเลิก */
  const canCancelRun = Boolean(
    run && !["APPROVED", "PAID", "CANCELLED"].includes(run.status),
  );

  /** สลิปจะขึ้นใน ESS ก็ต่อเมื่อเผยแพร่แล้วและเปิดให้เห็นรายละเอียด */
  const payslipVisibleInEss = Boolean(
    publication?.isPublished && publication?.payslipDetailsVisible,
  );
  const canIssueFilings = run?.status === "APPROVED" || run?.status === "PAID";

  /*
   * คำนวณรายคนได้เฉพาะตอนที่ยอดยังแก้ได้อยู่
   * อนุมัติหรือจ่ายไปแล้วห้ามขยับ ไม่งั้นยอดบนสลิปที่ส่งให้พนักงานไปแล้วจะไม่ตรง
   */
  const canRecalculateEmployee =
    run?.status === "CALCULATED" ||
    run?.status === "REVIEWED" ||
    run?.status === "FAILED";

  const columns: Array<Column<PayrollItem>> = [
    {
      key: "employee",
      header: "พนักงาน",
      cell: (item) => (
        <div
          className={joinClassName(
            "min-w-0",
            focusEmployeeId === item.employeeId &&
              "-mx-2 rounded-lg bg-amber-50 px-2 py-1 ring-1 ring-amber-200",
          )}
        >
          <CellStack
            primary={
              <span className="flex items-center gap-1.5">
                <span className="truncate">{employeeName(item)}</span>
                {pendingIds.has(item.employeeId) ? (
                  <span
                    title="มีใบคำขอค้างในงวดนี้ ยอดอาจยังไม่นิ่ง"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800"
                  >
                    <FileClock className="h-3 w-3" />
                    มีใบค้าง
                  </span>
                ) : null}
              </span>
            }
            secondary={`${item.employee.employeeCode ?? "-"}${item.departmentName ? ` · ${item.departmentName}` : ""}`}
          />
        </div>
      ),
    },
    {
      key: "base",
      header: "เงินเดือนฐาน",
      align: "right",
      width: "w-32",
      hideBelow: "xl",
      cell: (item) => (
        <span className="text-slate-600">
          <Money value={item.baseSalary} />
        </span>
      ),
    },
    {
      key: "overtime",
      header: "ล่วงเวลา",
      align: "right",
      width: "w-28",
      hideBelow: "xl",
      cell: (item) => (
        <SoftMoney value={easyRowByItemId.get(item.id)?.overtimeEarnings} />
      ),
    },
    {
      key: "otherEarnings",
      header: "เงินเพิ่มอื่น",
      align: "right",
      width: "w-28",
      hideBelow: "xl",
      cell: (item) => (
        <SoftMoney value={easyRowByItemId.get(item.id)?.otherEarnings} />
      ),
    },
    {
      key: "earnings",
      header: "รายได้รวม",
      align: "right",
      width: "w-32",
      cell: (item) => (
        <span className="font-semibold text-slate-900">
          <Money value={item.totalEarnings} />
        </span>
      ),
    },
    {
      key: "sso",
      header: "ประกันสังคม",
      align: "right",
      width: "w-28",
      hideBelow: "xl",
      cell: (item) => (
        <SoftMoney
          tone="deduction"
          value={easyRowByItemId.get(item.id)?.employeeSocialSecurity}
        />
      ),
    },
    {
      key: "tax",
      header: "ภาษี",
      align: "right",
      width: "w-28",
      hideBelow: "lg",
      cell: (item) => (
        <SoftMoney
          tone="deduction"
          value={easyRowByItemId.get(item.id)?.taxAmount}
        />
      ),
    },
    {
      key: "deductions",
      header: "หักรวม",
      align: "right",
      width: "w-32",
      hideBelow: "lg",
      cell: (item) => (
        <span className="font-semibold text-rose-700">
          <Money value={item.totalDeductions} />
        </span>
      ),
    },
    {
      key: "net",
      header: "เงินสุทธิ",
      align: "right",
      width: "w-36",
      cell: (item) => (
        <span className="text-[15px] 3xl:text-[16px] 4xl:text-[17px] font-bold tabular-nums text-brand-700">
          <Money value={item.totalNetPay} />
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "w-28",
      cell: (item) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" onClick={() => setDetailItemId(item.id)}>
            รายละเอียด
          </Button>
          {/* คำนวณใหม่เฉพาะคนนี้ — ปิดไว้เมื่องวดเดินเลยขั้นตรวจไปแล้ว */}
          {canRecalculateEmployee ? (
            <IconButton
              title={`คำนวณใหม่เฉพาะ ${employeeName(item)}`}
              icon={
                <RefreshCw
                  className={joinClassName(
                    "h-4 w-4",
                    recalculatingEmployeeId === item.employeeId &&
                      "animate-spin",
                  )}
                />
              }
              disabled={Boolean(recalculatingEmployeeId)}
              onClick={() => void recalculateEmployee(item)}
            />
          ) : null}
          <IconButton
            title="ดาวน์โหลดสลิป"
            icon={<Download className="h-4 w-4" />}
            disabled={downloadingItemId === item.id}
            onClick={() => void downloadPayslip(item)}
          />
        </div>
      ),
    },
  ];

  /**
   * คำนวณใหม่เฉพาะคนเดียว
   *
   * ใช้ตอนแก้ของคนใดคนหนึ่งกลางงวด (อนุมัติ OT ที่ค้าง แก้เวลาเข้าออก ปรับฐานเงินเดือน)
   * แล้วอยากให้ยอดของคนนั้นตรงโดยไม่ต้องคำนวณใหม่ทั้งบริษัท ซึ่งกินเวลาเป็นนาที
   * และทำให้ยอดของคนที่ตรวจผ่านไปแล้วขยับตามไปด้วยโดยไม่จำเป็น
   */
  async function recalculateEmployee(item: PayrollItem) {
    if (!run) return;

    setRecalculatingEmployeeId(item.employeeId);

    try {
      await calculatePayrollRun(run.id, { employeeIds: [item.employeeId] });
      await refreshRun();

      /* ผลตรวจเก่าอ้างถึงยอดก่อนคำนวณ ต้องดึงใหม่ ไม่งั้นแท็บตรวจสอบจะค้างของเดิม */
      if (readiness) await loadReadiness(run.id);

      toast.success(`คำนวณใหม่ให้ ${employeeName(item)} เรียบร้อย`);
    } catch (error) {
      toast.error(errorText(error, "คำนวณรายคนไม่สำเร็จ"));
    } finally {
      setRecalculatingEmployeeId(null);
    }
  }

  /** ปุ่มหลักปุ่มเดียวที่เปลี่ยนตามสถานะ — คือสิ่งที่ต้องกดต่อ */
  function primaryAction() {
    if (!period) return null;

    if (!run) {
      return (
        <div className="flex items-center gap-2">
          {/*
            เลือกขอบเขตก่อนเริ่ม — เลือกได้เฉพาะตอนนี้เท่านั้น
            เพราะขอบเขตถูกตรึงไว้กับรอบ ถ้าเปลี่ยนทีหลังยอดที่คำนวณไปแล้วจะไม่ตรง
          */}
          {branchOptions.length > 1 ? (
            <Select
              aria-label="ขอบเขตสาขาของรอบนี้"
              value={runBranchId}
              onChange={(event) => setRunBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  เฉพาะ {branch.label}
                </option>
              ))}
            </Select>
          ) : null}

          <Button
            variant="primary"
            loading={acting === "start"}
            onClick={() => void startRun()}
          >
            เริ่มทำเงินเดือนงวดนี้
          </Button>
        </div>
      );
    }

    if (run.status === "DRAFT" || run.status === "FAILED") {
      return (
        <Button
          variant="primary"
          loading={acting === "calculate"}
          onClick={() => void calculate()}
        >
          คำนวณเงินเดือน
        </Button>
      );
    }

    if (run.status === "CALCULATED") {
      return (
        <Button variant="primary" onClick={confirmReview}>
          ตรวจแล้ว
        </Button>
      );
    }

    if (run.status === "REVIEWED") {
      return (
        <Button variant="primary" onClick={confirmApprove}>
          อนุมัติ
        </Button>
      );
    }

    if (run.status === "APPROVED") {
      return (
        <Button variant="primary" onClick={confirmPaid}>
          จ่ายเงินแล้ว
        </Button>
      );
    }

    return null;
  }

  if (loadingPeriod) {
    return (
      <main className="min-h-[calc(100vh-7.5rem)] rounded-xl bg-white px-5 3xl:px-6 4xl:px-7 py-6 sm:px-6">
        <LoadingState title="กำลังเปิดงวดเงินเดือน" />
      </main>
    );
  }

  if (notFound || !period) {
    return (
      <main className="min-h-[calc(100vh-7.5rem)] rounded-xl bg-white px-5 3xl:px-6 4xl:px-7 py-16 text-center sm:px-6">
        <h1 className="text-base font-semibold text-slate-900">
          ไม่พบงวดเงินเดือนนี้
        </h1>
        <p className="mt-1.5 text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] text-slate-500">
          งวดอาจถูกลบไปแล้ว หรือไม่ได้อยู่ในบริษัทที่คุณมีสิทธิ์เข้าถึง
        </p>
        <div className="mt-5">
          <ButtonLink
            href="/payroll"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            กลับไปรายการงวด
          </ButtonLink>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-7.5rem)] w-full rounded-xl bg-white pb-10">
      <section className="bg-white">
        {/* หัวงวด ขั้นตอนถัดไป และรายละเอียดงวด อยู่ในแถบเดียว ไม่มีเส้นคั่นย่อย */}
        <div className="border-b border-slate-300 px-5 3xl:px-6 4xl:px-7 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {/* ปุ่มย้อนกลับอยู่ติดชื่องวด ไม่ต้องมีแถบเบรดครัมบ์ที่เขียนชื่องวดซ้ำอีกแถบ */}
              <Link
                href="/payroll"
                aria-label="กลับไปรายการงวด"
                title="กลับไปรายการงวด"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>

              <div className="min-w-0">
                <p className="mb-1.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  งวดที่ทำอยู่
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-slate-950">
                    {periodLabel(period)}
                  </h2>
                  {run ? <StatusBadge status={run.status} /> : null}
                  {/*
                    รอบที่จำกัดสาขาต้องบอกให้ชัด ไม่งั้นดูเหมือนรอบทั้งบริษัท
                    แล้วจะเข้าใจว่าคนที่ไม่อยู่ในรอบคือคนที่ตกหล่น
                  */}
                  {runBranchLabel ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      <Building2 className="h-3 w-3" />
                      เฉพาะ {runBranchLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* เว้นขอบในตัวเลื่อนไว้ ไม่งั้นวงแหวนของขั้นปัจจุบันจะโดนตัด */}
            {run ? (
              <div className="min-w-0 overflow-x-auto px-1.5 py-1">
                <RunStepRail status={run.status} />
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 border-l-2 border-brand-500 pl-4">
              {/* ขั้นที่ต้องทำต่อ */}
              <div className="flex items-center gap-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[12px]">
                    ขั้นตอนถัดไป
                  </p>
                  <p className="truncate text-[15px] font-bold text-slate-900 3xl:text-[16px]">
                    {run
                      ? run.status === "DRAFT" || run.status === "FAILED"
                        ? "คำนวณเงินเดือน"
                        : run.status === "CALCULATED"
                          ? "ตรวจสอบและยืนยัน"
                          : run.status === "REVIEWED"
                            ? "อนุมัติงวดเงินเดือน"
                            : run.status === "APPROVED"
                              ? "บันทึกการจ่ายเงิน"
                              : run.status === "PAID"
                                ? "ดำเนินการเสร็จแล้ว"
                                : "ตรวจสอบสถานะงวด"
                      : "เริ่มรอบเงินเดือน"}
                  </p>
                </div>
              </div>

              {/*
                รายละเอียดงวดเป็นช่องป้ายบน–ค่าล่าง คั่นด้วยเส้นตั้ง
                เดิมเป็นประโยคยาวปนกันในบรรทัดเดียว กวาดตาหาตัวเลขที่ต้องการไม่เจอ
              */}
              <div className="mt-3 flex flex-wrap items-stretch divide-x divide-brand-100 border-t border-slate-100 pt-3">
                <PeriodFact
                  label="ช่วงงวด"
                  value={`${dateText(period.startDate)} – ${dateText(period.endDate)}`}
                />
                <PeriodFact
                  label="วันที่จ่าย"
                  value={dateText(period.paymentDate)}
                />
                {run ? (
                  <PeriodFact label="เลขที่รอบ" value={run.runNo} />
                ) : null}
                {run ? (
                  <PeriodFact
                    label="พนักงานในรอบ"
                    value={`${count(run.totalEmployees)} คน`}
                  />
                ) : null}
                {cancelledRunCount > 0 ? (
                  <PeriodFact
                    label="รอบที่ยกเลิก"
                    value={`${cancelledRunCount} รอบ`}
                    muted
                  />
                ) : null}
              </div>

              {/* สลิปกับไฟล์นำส่งเป็นงานที่ค้างต่อจากการจ่ายเงิน จึงบอกสถานะไว้ตั้งแต่แถบหัว */}
              {run ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px]">
                  <span className="text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    สลิปและไฟล์นำส่ง
                  </span>

                  <span
                    className={joinClassName(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold",
                      payslipVisibleInEss
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-500",
                    )}
                  >
                    {payslipVisibleInEss
                      ? `พนักงานเห็นสลิปแล้ว ${count(publication?.run.itemCount ?? run.totalEmployees)} คน`
                      : "ยังไม่เปิดให้พนักงานเห็นสลิป"}
                  </span>

                  <span
                    className={joinClassName(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold",
                      canIssueFilings
                        ? "border-brand-200 bg-brand-50 text-brand-700"
                        : "border-amber-200 bg-amber-50 text-amber-700",
                    )}
                  >
                    {canIssueFilings
                      ? "ไฟล์นำส่งพร้อมออก: โอนเงิน · สปส. · ภ.ง.ด.1"
                      : "ยังไม่อนุมัติ — ออกไฟล์นำส่งจริงไม่ได้"}
                  </span>

                  <Button
                    variant={payslipVisibleInEss ? "danger" : "primary"}
                    icon={
                      payslipVisibleInEss ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )
                    }
                    loading={acting === "publish"}
                    onClick={() => void togglePayslipPublication()}
                  >
                    {payslipVisibleInEss ? "ปิดสลิป" : "เผยแพร่สลิป"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              {/* ประวัติของรอบ อยู่ตรงนี้เพื่อไม่ให้ฝั่งขวาว่างตอนงวดจบแล้ว */}
              {runTrail.length ? (
                <div className="lg:text-right">
                  <p className="text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    การดำเนินการของรอบ
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-500">
                    {runTrail.map((entry) => (
                      <li key={entry.key}>
                        <span className="text-slate-400">{entry.label}</span>{" "}
                        <span className="font-semibold text-slate-800">
                          {entry.name}
                        </span>{" "}
                        <span className="text-slate-400">· {entry.at}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {canRecalculate ? (
                  <Button
                    variant="ghost"
                    loading={acting === "calculate"}
                    onClick={() => void calculate()}
                  >
                    คำนวณใหม่
                  </Button>
                ) : null}
                {canCancelRun ? (
                  <Button variant="ghost" onClick={confirmCancel}>
                    ยกเลิกรอบคำนวณ
                  </Button>
                ) : null}
                {primaryAction()}
              </div>
            </div>
          </div>

          {run?.errorMessage ? (
            <div className="mt-4">
              <Notice tone="critical" icon={<XCircle className="h-4 w-4" />}>
                {run.errorMessage}
              </Notice>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 bg-white">
          {run ? (
            <>
              <p className="border-b border-slate-200 px-5 3xl:px-6 4xl:px-7 py-3 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:px-6">
                สรุปยอดของงวด · ทั้งบริษัท
              </p>

              <RunSummaryPanel run={run} />

              {/* แท็บใช้ padding ในตัวเอง (px-5 3xl:px-6 4xl:px-7) ให้ตรงกับคอลัมน์ของตารางพอดี */}
              <Tabs
                className="border-slate-300 pt-2.5"
                value={tab}
                onChange={setTab}
                items={[
                  {
                    key: "amounts",
                    label: "ยอดรายคน",
                    count: run.items.length,
                  },
                  {
                    key: "pending",
                    label: "ใบคำขอค้าง",
                    count: pendingIds.size || undefined,
                  },
                  { key: "checks", label: "ตรวจสอบ" },
                  { key: "files", label: "เอกสาร" },
                ]}
                trailing={
                  tab === "amounts" ? (
                    <div className="flex items-center gap-3 [&_input]:bg-slate-50/80 [&_input:focus]:bg-white">
                      {search ? (
                        <span className="hidden whitespace-nowrap text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-400 sm:inline">
                          เจอ {count(filteredItems.length)} จาก{" "}
                          {count(run.items.length)} คน
                        </span>
                      ) : null}
                      {pendingIds.size > 0 ? (
                        <button
                          type="button"
                          onClick={() => setOnlyPending((prev) => !prev)}
                          className={joinClassName(
                            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition 3xl:text-[12.5px]",
                            onlyPending
                              ? "border-amber-300 bg-amber-100 text-amber-900"
                              : "border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-800",
                          )}
                        >
                          <FileClock className="h-3.5 w-3.5" />
                          เฉพาะคนที่มีใบค้าง {count(pendingIds.size)}
                        </button>
                      ) : null}

                      <SearchInput
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="ค้นหาชื่อ รหัส แผนก หรือสาขา"
                        className="w-full sm:w-60"
                      />
                      <span className="block w-36 shrink-0">
                        <Select
                          value={paperLayout}
                          onChange={(event) =>
                            setPaperLayout(
                              event.target.value as PayslipPaperLayout,
                            )
                          }
                          className="border-slate-300 bg-white shadow-none"
                          aria-label="รูปแบบกระดาษของสลิป"
                        >
                          <option value="FULL">สลิปเต็มหน้า A4</option>
                          <option value="HALF">สลิปครึ่งหน้า A5</option>
                        </Select>
                      </span>
                    </div>
                  ) : null
                }
              />

              <div className="min-h-[420px] [&_tbody_td]:py-3.5 [&_tbody_th]:py-3.5 3xl:[&_tbody_td]:py-4 3xl:[&_tbody_th]:py-4 [&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:tracking-normal [&_thead_th]:text-slate-700 [&_thead_th]:py-3.5 [&_thead_th]:text-[12.5px] 3xl:[&_thead_th]:py-4 3xl:[&_thead_th]:text-[13px] 4xl:[&_thead_th]:py-[1.125rem] 4xl:[&_thead_th]:text-[13.5px] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-blue-50/30">
                {tab === "amounts" ? (
                  <DataTable
                    loading={loadingRun}
                    columns={columns}
                    rows={filteredItems}
                    rowKey={(item) => item.id}
                    groupBy={(item) => {
                      const branchKey = branchKeyOf(item);
                      const departmentKey = departmentKeyOf(item);

                      return [
                        {
                          key: branchKey,
                          label: (
                            <GroupHeading
                              level={0}
                              title={item.branchName ?? "ไม่ระบุสาขา"}
                              code={item.branchCode}
                              totals={groupTotals.get(branchKey)}
                            />
                          ),
                        },
                        {
                          key: departmentKey,
                          label: (
                            <GroupHeading
                              level={1}
                              title={item.departmentName ?? "ไม่ระบุแผนก"}
                              code={item.departmentCode}
                              totals={groupTotals.get(departmentKey)}
                            />
                          ),
                        },
                      ];
                    }}
                    /*
                     * ไม่จำกัดความสูง — ให้ตารางยาวไปตามจำนวนคนในรอบ แล้วเลื่อนทั้งหน้าเอา
                     * (ปิด stickyHeader ด้วย เพราะหัวตารางลอยได้ต้องมีกล่องเลื่อนของตัวเอง)
                     */
                    quietScrollbars
                    minWidth="min-w-[62rem]"
                    emptyTitle="ยังไม่มีรายการในงวดนี้"
                    emptyDescription="กดคำนวณเงินเดือนเพื่อดึงพนักงานเข้ามาในรอบ"
                    /* 5rem = ความสูงแถบบนสุด — หัวตารางกับแถบชื่อสาขาจะไปค้างต่อจากแถบนั้น */
                    pageStickyTop="5rem"
                  />
                ) : null}

                {tab === "pending" ? (
                  <PendingRequestsPanel
                    readiness={readiness}
                    loading={loadingReadiness}
                    onFocusEmployee={(employeeId) => {
                      /* กดชื่อจากใบค้าง แล้วพากลับไปหาแถวของคนนั้นพร้อมไฮไลต์ */
                      setFocusEmployeeId(employeeId);
                      /* ล้างของที่อาจบังแถวนั้นอยู่ ไม่งั้นกดแล้วเหมือนไม่มีอะไรเกิดขึ้น */
                      setSearch("");
                      setOnlyPending(false);
                      setTab("amounts");
                    }}
                  />
                ) : null}

                {tab === "checks" ? (
                  <ReadinessPanel
                    readiness={readiness}
                    loading={loadingReadiness}
                  />
                ) : null}

                {tab === "files" ? (
                  <DocumentsPanel
                    runId={run.id}
                    runNo={run.runNo}
                    runStatus={run.status}
                    taxYearId={taxYearId}
                    companyId={companyId}
                    paymentMonth={period.month}
                    paymentYear={period.year}
                    onPublicationChange={setPublication}
                  />
                ) : null}
              </div>
            </>
          ) : !loadingRun ? (
            <div className="flex min-h-[560px] items-center justify-center px-6 py-16">
              <div className="max-w-md text-center">
                <div className="mx-auto h-1 w-10 rounded-full bg-blue-600" />
                <h3 className="mt-5 text-base font-semibold text-slate-900">
                  งวดนี้ยังไม่ได้เริ่มทำเงินเดือน
                </h3>
                <p className="mt-2 text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] leading-6 text-slate-500">
                  กดปุ่ม &quot;เริ่มทำเงินเดือนงวดนี้&quot; ด้านบน
                  ระบบจะดึงรายชื่อพนักงานและข้อมูลที่เกี่ยวข้องเข้ามาให้
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[560px] items-center justify-center">
              <LoadingState title="กำลังโหลดรอบเงินเดือน" />
            </div>
          )}
        </div>
      </section>

      <CalculatingOverlay
        open={acting === "calculate"}
        progress={progress}
        employeeCount={run?.totalEmployees ?? 0}
      />

      <ItemDetailModal
        item={detailItem}
        row={detailItem ? easyRowByItemId.get(detailItem.id) : undefined}
        employeeName={detailItem ? employeeName(detailItem) : ""}
        downloading={downloadingItemId === detailItem?.id}
        onClose={() => setDetailItemId(null)}
        onDownloadPayslip={(item) => void downloadPayslip(item)}
      />

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </main>
  );
}
