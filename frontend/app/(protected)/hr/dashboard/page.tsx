"use client";

import { useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  FileSearch,
  Layers,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  User,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DateDisplay, TimeDisplay } from "@/components/common/date-display";
import { PageHeroWave } from "@/components/common/page-hero-wave";
import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  PageSurface,
  Select,
  formatMoney,
  type Tone,
} from "@/components/kit";
import { getEmployeeName } from "@/components/ui/employee-name";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/auth-context";
import { ATTENDANCE_REVIEW_STATUS } from "@/lib/status-labels";
import { formatThaiDate, parseDateValue } from "@/lib/date-format";
import {
  getHrDashboardPayrollSummary,
  getHrDashboardSummary,
} from "@/lib/api";
import type {
  DashboardEmployeeMini,
  DashboardHrReviewItem,
  HrDashboardSummaryResponse,
  HrPayrollSummaryResponse,
} from "@/types/dashboard";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";

/**
 * Dashboard HR — หน้าสรุปอ่านอย่างเดียว ไม่มีฟอร์ม/แก้ไขข้อมูล
 *
 * ลำดับการอ่านของหน้า ไล่จาก "วันนี้เป็นยังไง" → "ต้องทำอะไร/กับใคร" →
 * "โครงสร้างกำลังคน" → "แนวโน้ม" → "รายการล่าสุด"
 * แต่ละคู่หัวข้อที่อ่านคู่กันวางเป็นสองคอลัมน์ (`SplitRow`) เพื่อไม่ให้หน้ายาว
 * เป็นเส้นเดียวจนต้องเลื่อนหาข้อมูลที่เกี่ยวข้องกัน
 */

type KpiTone = "neutral" | "warning" | "positive";

type ActionRow = {
  key: string;
  label: string;
  value: number;
  unit: string;
  helper: string;
  href: string;
  color: string;
};

type ChartRow = {
  label: string;
  status?: string;
  value: number;
  color: string;
};

/** แถวของแผงโดนัท — `pending` ใช้เฉพาะแผงคำขอ, `note` เป็นข้อความเสริมหน้าตัวเลข */
type DonutRow = {
  key: string;
  label: string;
  value: number;
  color: string;
  pending?: number;
  note?: string;
  href?: string;
};

/** แถวของแผงแท่งแนวนอน — `note` คือข้อความเสริมท้ายตัวเลข เช่น จำนวนวันหรือ % */
type BarRow = {
  key: string;
  label: string;
  value: number;
  unit: string;
  note?: string;
  color?: string;
};

type FollowUpItem = {
  id: string;
  employee: DashboardEmployeeMini | null;
  primary: string;
  secondary?: string;
  alert?: boolean;
};

type FollowUpGroup = {
  key: string;
  title: string;
  tone: Tone;
  href: string;
  total: number;
  items: FollowUpItem[];
};

const actionChartColor: Record<string, string> = {
  missing: "#ef4444", // red-500
  late: "#f59e0b", // amber-500
  "hr-review": "#8b5cf6", // violet-500
  documents: "#f97316", // orange-500
  ot: "#0ea5e9", // sky-500
  "time-adjust": "#2563eb", // brand-600
  probation: "#10b981", // emerald-500
};

const employeeStatusColor: Record<string, string> = {
  ACTIVE: "#10b981",
  PROBATION: "#f59e0b",
  SUSPENDED: "#8b5cf6",
  RESIGNED: "#64748b",
  TERMINATED: "#e11d48",
  INACTIVE: "#94a3b8",
};

const REQUEST_COLORS = [
  "#2563eb", // ใบลา
  "#f59e0b", // OT
  "#8b5cf6", // ขอแก้เวลา
  "#10b981", // นอกสถานที่
  "#f97316", // เอกสาร
];

/** สีคงที่ต่อช่องทาง ไม่ผูกกับลำดับ สีของ "เว็บ" จะได้ไม่เปลี่ยนเมื่ออันดับสลับ */
const CHANNEL_COLORS: Record<string, string> = {
  WEB: "#2563eb",
  MOBILE: "#8b5cf6",
  DEVICE: "#0ea5e9",
  MANUAL: "#94a3b8",
};

/** สภาพการลงเวลา: เขียว = ตามเวลา, เหลือง/แดง = ต้องดู */
const CONDITION_COLORS: Record<string, string> = {
  CHECK_IN_NORMAL: "#10b981",
  CHECK_OUT_NORMAL: "#0ea5e9",
  LATE: "#f59e0b",
  EARLY_LEAVE: "#f97316",
  MISSING: "#ef4444",
  EDITED: "#8b5cf6",
};

/** ชื่อชุดข้อมูลของกราฟแนวโน้ม — ใช้ทั้งใน Legend และ Tooltip จะได้เรียกเหมือนกัน */
const TREND_SERIES = {
  newEmployees: "เข้าใหม่",
  resignations: "ลาออก",
  leaveRequests: "ใบลา",
  overtimeHours: "ชั่วโมง OT",
} as const;

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

const followUpDotClass: Record<Tone, string> = {
  neutral: "bg-slate-400",
  brand: "bg-brand-500",
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
};

export default function HrDashboardPage() {
  /*
   * ใช้ react-query แทน useEffect + setState
   *
   * หน้านี้ถูกเปิดบ่อยที่สุดหน้าหนึ่ง (เป็นหน้าแรกของ HR) ของเดิมยิง API ใหม่
   * ทุกครั้งที่กลับมา แม้เพิ่งออกไปแป๊บเดียว react-query จะใช้ผลที่ cache ไว้
   * แล้วค่อยโหลดใหม่เบื้องหลัง ผู้ใช้จึงเห็นข้อมูลทันทีแทนที่จะเห็นหน้าโหลด
   */
  const query = useApiQuery<HrDashboardSummaryResponse>(
    queryKeys.dashboard.hr(),
    () => getHrDashboardSummary(),
  );

  /*
   * ข้อมูลเงินเดือน/ภาษี/ประกันสังคมอยู่คนละ endpoint และบังคับสิทธิ์ PAYROLL_READ
   * คนที่ไม่มีสิทธิ์จะไม่ยิงคำขอเลย (enabled=false) หน้าจึงไม่ค้างรอ 403
   */
  const { user } = useAuth();
  const canReadPayroll = useMemo(
    () =>
      (user?.permissions ?? []).some(
        (permission) => permission.trim().toUpperCase() === "PAYROLL_READ",
      ),
    [user?.permissions],
  );

  const [payrollYear, setPayrollYear] = useState<number | undefined>(undefined);

  const payrollQuery = useApiQuery<HrPayrollSummaryResponse>(
    queryKeys.dashboard.hrPayroll(payrollYear),
    () => getHrDashboardPayrollSummary(payrollYear),
    { enabled: canReadPayroll },
  );

  const dashboardData = query.data ?? null;
  const payroll = payrollQuery.data ?? null;
  const loading = query.isPending;
  const errorText = query.isError
    ? getErrorMessage(query.error, "ไม่สามารถโหลดข้อมูล HR Dashboard ได้")
    : null;

  // ห่อให้คืน void — จุดที่เรียกเป็น callback ของปุ่มซึ่งรับ Promise<void>
  const loadData = async () => {
    await Promise.all([
      query.refetch(),
      canReadPayroll ? payrollQuery.refetch() : Promise.resolve(),
    ]);
  };

  const summary = dashboardData?.summary;
  const charts = dashboardData?.charts;
  const hrReviewItems = dashboardData?.hrReviewItems ?? [];
  const attendanceLogs = dashboardData?.attendanceLogs ?? [];

  const totalEmployees = summary?.totalEmployees ?? 0;
  const activeEmployees = summary?.activeEmployees ?? 0;
  const checkInToday = summary?.checkInToday ?? 0;
  const lateToday = summary?.lateToday ?? 0;
  const missingToday = summary?.missingCheckInToday ?? 0;
  const leaveToday = summary?.leaveToday ?? 0;
  const submittedOvertime = summary?.submittedOvertime ?? 0;
  const submittedTimeAdjust = summary?.submittedTimeAdjust ?? 0;
  const pendingDocuments = summary?.pendingDocuments ?? 0;
  const pendingHrReview = summary?.pendingHrReview ?? 0;
  const probationDueSoon = summary?.probationDueSoon ?? 0;
  const newThisMonth = summary?.newEmployeesThisMonth ?? 0;
  const resignedThisMonth = summary?.resignedThisMonth ?? 0;

  const activeRate = percent(activeEmployees, totalEmployees);
  const attendanceRate = percent(checkInToday, Math.max(activeEmployees, 1));
  const attendanceRisk = missingToday + lateToday;
  const workQueue =
    pendingHrReview + pendingDocuments + submittedOvertime + submittedTimeAdjust;

  /** สี่กลุ่มนี้รวมกันคือพนักงานที่ต้องมีสถานะวันนี้ทุกคน จึงคิดเป็น 100% ได้ */
  const todaySegments = useMemo(() => {
    const onTime = Math.max(0, checkInToday - lateToday);

    return [
      {
        key: "ontime",
        label: "เข้างานปกติ",
        value: onTime,
        color: "#10b981",
        href: "/attendance",
      },
      {
        key: "late",
        label: "มาสาย",
        value: lateToday,
        color: "#f59e0b",
        href: "/attendance",
      },
      {
        key: "leave",
        label: "ลาวันนี้",
        value: leaveToday,
        color: "#2563eb",
        href: "/approvals?tab=history",
      },
      {
        key: "missing",
        label: "ยังไม่พบเวลาเข้า",
        value: missingToday,
        color: "#ef4444",
        href: "/attendance",
      },
    ];
  }, [checkInToday, lateToday, leaveToday, missingToday]);

  const todayBase = todaySegments.reduce((sum, item) => sum + item.value, 0);

  const actionRows = useMemo<ActionRow[]>(
    () => [
      {
        key: "missing",
        label: "ยังไม่พบเวลาเข้า",
        value: missingToday,
        unit: "คน",
        helper: "ตรวจว่าไม่ได้เข้างาน ลืมลงเวลา หรือมีคำขอแก้เวลาค้างอยู่",
        href: "/attendance",
        color: actionChartColor.missing,
      },
      {
        key: "hr-review",
        label: "รอ HR ตรวจสอบ",
        value: pendingHrReview,
        unit: "รายการ",
        helper: "กระทบ Payroll โดยตรง ควรตรวจให้ทันก่อนปิดรอบเงินเดือน",
        href: "/hr-review",
        color: actionChartColor["hr-review"],
      },
      {
        key: "late",
        label: "มาสายวันนี้",
        value: lateToday,
        unit: "คน",
        helper: "ใช้ติดตามแนวโน้มวินัยการเข้างานประจำวัน",
        href: "/attendance",
        color: actionChartColor.late,
      },
      {
        key: "documents",
        label: "เอกสารรอดำเนินการ",
        value: pendingDocuments,
        unit: "รายการ",
        helper: "คำขอเอกสารที่พนักงานยื่นแล้วรอ HR ออกให้",
        href: "/documents",
        color: actionChartColor.documents,
      },
      {
        key: "ot",
        label: "OT รออนุมัติ",
        value: submittedOvertime,
        unit: "รายการ",
        helper: "ค้างอยู่ในคิวอนุมัติ ต้องเคลียร์ก่อนสรุปค่าแรงล่วงเวลา",
        href: "/approvals?tab=queue",
        color: actionChartColor.ot,
      },
      {
        key: "time-adjust",
        label: "ขอแก้เวลา",
        value: submittedTimeAdjust,
        unit: "รายการ",
        helper: "คำขอที่ทำให้เวลาทำงานจริงเปลี่ยน ต้องตรวจก่อนอนุมัติ",
        href: "/approvals?tab=queue",
        color: actionChartColor["time-adjust"],
      },
      {
        key: "probation",
        label: "ทดลองงานใกล้ครบ",
        value: probationDueSoon,
        unit: "คน",
        helper: "ครบกำหนดภายใน 30 วัน ต้องสรุปผลประเมินก่อนถึงกำหนด",
        href: "/employees",
        color: actionChartColor.probation,
      },
    ],
    [
      lateToday,
      missingToday,
      pendingDocuments,
      pendingHrReview,
      probationDueSoon,
      submittedOvertime,
      submittedTimeAdjust,
    ],
  );

  /** แสดงเฉพาะหมวดที่มีงานค้างจริง หมวดที่เป็นศูนย์ไม่ต้องกินที่ */
  const openActionRows = useMemo(
    () => actionRows.filter((item) => item.value > 0),
    [actionRows],
  );

  const maxActionValue = Math.max(
    1,
    ...openActionRows.map((item) => item.value),
  );

  const kpiCards = useMemo(
    () => [
      {
        label: "กำลังคน Active",
        value: numberText(activeEmployees),
        helper: `${activeRate}% จากทั้งหมด ${numberText(totalEmployees)} คน`,
        tone: "neutral" as KpiTone,
        icon: Users,
      },
      {
        label: "ลงเวลาแล้ววันนี้",
        value: `${attendanceRate}%`,
        helper: `${numberText(checkInToday)} คน · ลา ${numberText(leaveToday)} · สาย ${numberText(lateToday)}`,
        tone: (missingToday > 0 ? "warning" : "positive") as KpiTone,
        icon: Clock,
      },
      {
        label: "ต้องติดตามวันนี้",
        value: numberText(attendanceRisk),
        helper: `ไม่พบเวลาเข้า ${numberText(missingToday)} · มาสาย ${numberText(lateToday)}`,
        tone: (attendanceRisk > 0 ? "warning" : "positive") as KpiTone,
        icon: Bell,
      },
      {
        label: "คิวงาน HR",
        value: numberText(workQueue),
        helper: `ตรวจสอบ ${numberText(pendingHrReview)} · คำขอ ${numberText(pendingDocuments + submittedOvertime + submittedTimeAdjust)}`,
        tone: (workQueue > 0 ? "warning" : "positive") as KpiTone,
        icon: ClipboardList,
      },
    ],
    [
      activeEmployees,
      activeRate,
      attendanceRate,
      attendanceRisk,
      checkInToday,
      lateToday,
      leaveToday,
      missingToday,
      pendingDocuments,
      pendingHrReview,
      submittedOvertime,
      submittedTimeAdjust,
      totalEmployees,
      workQueue,
    ],
  );

  const employeeStatusRows = useMemo<ChartRow[]>(() => {
    const rows = (charts?.employeeStatus ?? [])
      .map((item) => ({
        label: item.label || item.status || "ไม่ระบุ",
        status: item.status,
        value: Number(item.count ?? 0),
        color: employeeStatusColor[item.status] ?? "#94a3b8",
      }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0);

    if (rows.length) return rows;

    return [
      {
        label: "ปฏิบัติงาน",
        status: "ACTIVE",
        value: activeEmployees,
        color: employeeStatusColor.ACTIVE,
      },
      {
        label: "อื่น ๆ",
        value: Math.max(0, totalEmployees - activeEmployees),
        color: "#94a3b8",
      },
    ].filter((item) => item.value > 0);
  }, [activeEmployees, charts?.employeeStatus, totalEmployees]);

  const employeeStatusTotal = employeeStatusRows.reduce(
    (sum, item) => sum + item.value,
    0,
  );

  /** กำลังคนรายหน่วยงาน — เอา 8 อันดับแรก ที่เหลือยุบเป็นบรรทัดเดียว */
  const departmentRows = useMemo(() => {
    const rows = (charts?.departmentHeadcount ?? []).map((item) => ({
      id: item.id ?? item.code ?? item.label ?? "",
      label: item.label || item.name || item.code || "ไม่ระบุหน่วยงาน",
      count: Number(item.count ?? 0),
    }));

    const top = rows.slice(0, 8);
    const restCount = rows
      .slice(8)
      .reduce((sum, item) => sum + item.count, 0);

    if (restCount > 0) {
      top.push({
        id: "__rest__",
        label: `หน่วยงานอื่นอีก ${numberText(rows.length - 8)} หน่วย`,
        count: restCount,
      });
    }

    return top;
  }, [charts?.departmentHeadcount]);

  const departmentTotal = departmentRows.reduce(
    (sum, item) => sum + item.count,
    0,
  );

  const monthLabel = charts?.currentMonthLabel ?? "เดือนนี้";

  /** คำขอทุกประเภทของเดือนนี้ — โดนัทดูสัดส่วน ตัวเลขข้าง ๆ ดูที่ค้างอนุมัติ */
  const requestRows = useMemo<DonutRow[]>(
    () =>
      (charts?.requestTypes ?? []).map((item, index) => ({
        key: item.key,
        label: item.label,
        value: Number(item.total ?? 0),
        pending: Number(item.pending ?? 0),
        color: REQUEST_COLORS[index % REQUEST_COLORS.length],
        href: requestHref(item.key),
      })),
    [charts?.requestTypes],
  );

  const pendingRequestTotal = requestRows.reduce(
    (sum, item) => sum + (item.pending ?? 0),
    0,
  );

  const leaveTypeRows = useMemo<BarRow[]>(
    () =>
      (charts?.leaveByType ?? []).map((item) => ({
        key: item.id,
        label: item.label,
        value: Number(item.count ?? 0),
        unit: "ใบ",
        note: `${numberText(round1(Number(item.days ?? 0)))} วัน${item.isPaid === false ? " · ไม่รับค่าจ้าง" : ""}`,
      })),
    [charts?.leaveByType],
  );

  const attendanceChannelRows = useMemo<DonutRow[]>(
    () =>
      (charts?.attendanceChannel ?? []).map((item) => ({
        key: item.key,
        label: item.label,
        value: Number(item.count ?? 0),
        color: CHANNEL_COLORS[item.key] ?? "#94a3b8",
        note: item.gpsCount ? `พิกัด ${numberText(item.gpsCount)}` : undefined,
      })),
    [charts?.attendanceChannel],
  );

  const channelGpsTotal = (charts?.attendanceChannel ?? []).reduce(
    (sum, item) => sum + Number(item.gpsCount ?? 0),
    0,
  );

  const attendanceConditionRows = useMemo<BarRow[]>(() => {
    const rows = charts?.attendanceCondition ?? [];
    const total = rows.reduce((sum, item) => sum + Number(item.count ?? 0), 0);

    return rows.map((item) => ({
      key: item.key,
      label: item.label,
      value: Number(item.count ?? 0),
      unit: "ครั้ง",
      note: `${percent(Number(item.count ?? 0), Math.max(total, 1))}%`,
      color: CONDITION_COLORS[item.key],
    }));
  }, [charts?.attendanceCondition]);

  const payrollMonths = payroll?.months ?? [];
  const payrollTotals = payroll?.totals ?? null;
  const payrollLatest = payroll?.latestMonth ?? null;
  const hasPayrollData = payrollMonths.some((item) => item.netPay > 0);

  /*
   * เดือนที่ยังไม่ได้คำนวณต้องเป็น null ไม่ใช่ 0
   * ถ้าส่ง 0 เส้นยอดสุทธิจะดิ่งลงพื้นในเดือนที่ยังไม่ทำ ดูเหมือนจ่ายเงินเป็นศูนย์
   * ส่ง null แล้ว recharts จะเว้นช่องว่างไว้ตรง ๆ
   */
  const payrollChartData = useMemo(
    () =>
      (payroll?.months ?? []).map((item) => ({
        label: item.label,
        baseSalary: item.netPay > 0 ? item.baseSalary : null,
        otherEarnings: item.netPay > 0 ? item.otherEarnings : null,
        netPay: item.netPay > 0 ? item.netPay : null,
      })),
    [payroll?.months],
  );

  const monthlyTrendData = charts?.monthlyTrend ?? [];

  const trendTotals = useMemo(() => {
    return (charts?.monthlyTrend ?? []).reduce(
      (acc, item) => ({
        newEmployees: acc.newEmployees + Number(item.newEmployees ?? 0),
        resignations: acc.resignations + Number(item.resignations ?? 0),
        leaveRequests: acc.leaveRequests + Number(item.leaveRequests ?? 0),
        overtimeHours: acc.overtimeHours + Number(item.overtimeHours ?? 0),
      }),
      { newEmployees: 0, resignations: 0, leaveRequests: 0, overtimeHours: 0 },
    );
  }, [charts?.monthlyTrend]);

  const followUpGroups = useMemo<FollowUpGroup[]>(() => {
    const missingList = dashboardData?.missingCheckIn ?? [];
    const probationList = dashboardData?.probationRecords ?? [];
    const newList = dashboardData?.newEmployeesThisMonth ?? [];

    const groups: FollowUpGroup[] = [
      {
        key: "missing",
        title: "ยังไม่พบเวลาเข้าวันนี้",
        tone: "critical",
        href: "/attendance",
        total: missingToday,
        // เหตุผลอยู่ที่หัวกลุ่มแล้ว ฝั่งขวาจึงบอก "ต้องตามที่ไหน" แทนการเขียนซ้ำ
        items: missingList.slice(0, 4).map((employee) => ({
          id: `missing-${employee.id}`,
          employee,
          primary: branchText(employee),
        })),
      },
      {
        key: "probation",
        title: "ทดลองงานใกล้ครบกำหนด",
        tone: "warning",
        href: "/employees",
        total: probationDueSoon,
        items: probationList.slice(0, 4).map((record) => {
          const left = daysUntil(record.endDate);

          return {
            id: `probation-${record.id}`,
            employee: record.employee,
            primary:
              left === null
                ? "-"
                : left <= 0
                  ? "ครบกำหนดแล้ว"
                  : `เหลือ ${numberText(left)} วัน`,
            secondary: `ครบ ${formatThaiDate(record.endDate)}`,
            alert: left !== null && left <= 7,
          };
        }),
      },
      {
        key: "new",
        title: "เข้าใหม่เดือนนี้",
        tone: "brand",
        href: "/onboarding",
        total: newThisMonth,
        items: newList.slice(0, 4).map((employee) => {
          const since = daysSince(employee.startDate);

          return {
            id: `new-${employee.id}`,
            employee,
            primary: `เริ่ม ${formatThaiDate(employee.startDate)}`,
            secondary:
              since === null
                ? undefined
                : since <= 0
                  ? "เริ่มงานวันนี้"
                  : `ทำงานมาแล้ว ${numberText(since)} วัน`,
          };
        }),
      },
    ];

    return groups.filter((group) => group.items.length > 0);
  }, [
    dashboardData?.missingCheckIn,
    dashboardData?.newEmployeesThisMonth,
    dashboardData?.probationRecords,
    missingToday,
    newThisMonth,
    probationDueSoon,
  ]);

  const topHrReviewItems = hrReviewItems.slice(0, 5);
  const recentLogs = attendanceLogs.slice(0, 6);

  if (loading) {
    return (
      <PageSurface className="px-5 py-6 sm:px-6">
        <LoadingState
          title="กำลังโหลด HR Dashboard"
          description="ระบบกำลังดึงข้อมูลเพื่อสรุปงานที่ HR ต้องติดตามวันนี้"
        />
      </PageSurface>
    );
  }

  if (errorText) {
    return (
      <PageSurface className="px-5 py-6 sm:px-6">
        <ErrorState
          title="โหลด HR Dashboard ไม่สำเร็จ"
          description={errorText}
          action={
            <Button
              variant="primary"
              icon={<RefreshCcw className="h-3.5 w-3.5" />}
              onClick={() => void loadData()}
            >
              โหลดใหม่
            </Button>
          }
        />
      </PageSurface>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7.5rem)] w-full overflow-hidden rounded-xl bg-white pb-10">
      <div>
      <div className="relative overflow-hidden border-b border-slate-200 px-6 py-6 sm:px-7 3xl:px-8">
        <PageHeroWave />

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={query.isFetching}
          title={query.isFetching ? "กำลังโหลด…" : "โหลดใหม่"}
          className="absolute right-6 top-6 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/85 text-slate-500 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-brand-700 disabled:opacity-60 sm:right-7"
        >
          <RefreshCcw
            className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
          />
        </button>

        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 pr-10">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">
              Overview <span className="text-brand-300">•</span>
            </p>
            <h1 className="mt-2 text-[27px] font-extrabold tracking-tight text-slate-900 3xl:text-[30px]">
              Dashboard <span className="text-brand-600">HR</span>
              <span className="text-brand-600">.</span>
            </h1>
            <p className="mt-2 max-w-md text-[13px] leading-6 text-slate-500 3xl:text-[13.5px]">
              สรุปเรื่องที่ HR ต้องจัดการวันนี้ ทั้งกำลังคน การลงเวลา งานค้าง
              และรายการที่กระทบเงินเดือน ให้เห็นภาพรวมและเริ่มทำงานต่อได้ทันที
            </p>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0">
            {kpiCards.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[10.5px] font-semibold text-slate-500">
                      {item.label}
                    </p>
                    <p className="truncate text-[16px] font-extrabold leading-5 tabular-nums tracking-tight text-slate-900 3xl:text-[17px]">
                      {item.value}
                    </p>
                    <p className="truncate text-[10.5px] leading-4 text-slate-400">
                      {item.helper}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

        {/* วันนี้ทั้งองค์กรอยู่ในสถานะไหนบ้าง — แถบเดียวจบ ไม่ต้องอ่านกราฟ */}
        <div className="p-4 3xl:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
              สถานะการทำงานวันนี้
            </h2>
            <p className="mt-0.5 text-[11.5px] text-slate-500 3xl:text-[12px]">
              {`แบ่งพนักงานที่ต้องมาทำงาน ${numberText(todayBase)} คนออกเป็น 4 กลุ่ม`}
            </p>
          </div>
          <Link
            href="/attendance"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11.5px] font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            ดูตารางลงเวลา <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {todayBase === 0 ? (
          <EmptyLine text="ยังไม่มีข้อมูลการลงเวลาของวันนี้" />
        ) : (
          <>
            <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 3xl:h-2.5">
              {todaySegments
                .filter((item) => item.value > 0)
                .map((item) => (
                  <div
                    key={item.key}
                    title={`${item.label} ${numberText(item.value)} คน`}
                    style={{
                      width: `${(item.value / todayBase) * 100}%`,
                      backgroundColor: item.color,
                    }}
                  />
                ))}
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-4">
              {todaySegments.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group min-w-0 rounded-lg py-0.5 transition hover:bg-slate-50"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate text-[11px] text-slate-500 group-hover:text-slate-700 3xl:text-[11.5px]">
                      {item.label}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-[15px] font-bold leading-6 tabular-nums tracking-tight text-slate-950 3xl:text-[16px]">
                      {numberText(item.value)}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-slate-400 3xl:text-[10.5px]">
                      {percent(item.value, todayBase)}%
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="grid divide-y divide-slate-100 lg:grid-cols-12 lg:divide-x lg:divide-y-0 lg:divide-slate-200">
        <div className="p-4 3xl:p-5 lg:col-span-7">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <ClipboardList className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                งานที่ต้องจัดการ
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                เรียงจากงานที่กระทบการทำงานและเงินเดือนมากที่สุด
              </p>
            </div>
          </div>

          {openActionRows.length === 0 ? (
            <EmptyLine text="ไม่มีงานค้างในทุกหมวด" />
          ) : (
            <div className="mt-3.5 divide-y divide-slate-100">
              {openActionRows.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group block py-2 3xl:py-2.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[12px] font-semibold text-slate-800 group-hover:text-brand-700 3xl:text-[12.5px]">
                      {item.label}
                    </p>
                    <p className="flex shrink-0 items-baseline gap-1">
                      <span className="text-[13.5px] font-bold leading-none tabular-nums text-slate-950 3xl:text-[14px]">
                        {numberText(item.value)}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 3xl:text-[10.5px]">
                        {item.unit}
                      </span>
                    </p>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(item.value / maxActionValue) * 100}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <p className="mt-1 truncate text-[10.5px] text-slate-400 3xl:text-[11px]">
                    {item.helper}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 3xl:p-5 lg:col-span-5">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                คนที่ควรติดตาม
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                ตัวอย่างจากแต่ละกลุ่ม พร้อมเหตุผลที่ต้องตาม
              </p>
            </div>
          </div>

          {followUpGroups.length === 0 ? (
            <EmptyLine text="ไม่มีรายชื่อที่ต้องติดตามในช่วงนี้" />
          ) : (
            <div className="mt-3.5 space-y-3">
              {followUpGroups.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${followUpDotClass[group.tone]}`}
                      />
                      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[10.5px]">
                        {group.title}
                      </span>
                    </span>
                    <Link
                      href={group.href}
                      className="shrink-0 text-[10.5px] font-semibold text-brand-600 hover:text-brand-700 3xl:text-[11px]"
                    >
                      ทั้งหมด {numberText(group.total)} คน
                    </Link>
                  </div>

                  <div className="mt-1 divide-y divide-slate-100">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-1.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar
                            name={getEmployeeName(item.employee)}
                            size="sm"
                            tone="soft"
                          />
                          <div className="min-w-0">
                            <p className="break-words text-[12px] font-semibold text-slate-900 3xl:text-[12.5px]">
                              {getEmployeeName(item.employee)}
                            </p>
                            <p className="break-words text-[10.5px] text-slate-400 3xl:text-[11px]">
                              {employeeMeta(item.employee)}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p
                            className={`text-[11px] font-semibold 3xl:text-[11.5px] ${
                              item.alert ? "text-rose-600" : "text-slate-700"
                            }`}
                          >
                            {item.primary}
                          </p>
                          {item.secondary ? (
                            <p className="text-[10px] text-slate-400 3xl:text-[10.5px]">
                              {item.secondary}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="grid divide-y divide-slate-100 lg:grid-cols-12 lg:divide-x lg:divide-y-0 lg:divide-slate-200">
        <div className="p-4 3xl:p-5 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                {`คำขอทั้งหมด ${monthLabel}`}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                {pendingRequestTotal > 0
                  ? `ยังรออนุมัติรวม ${numberText(pendingRequestTotal)} รายการ`
                  : "อนุมัติครบทุกคำขอของเดือนนี้แล้ว"}
              </p>
            </div>
            <Link
              href="/approvals?tab=queue"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11.5px] font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              ศูนย์คำขอ <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4">
            <DonutBreakdown
              rows={requestRows}
              unit="รายการ"
              emptyText={`ยังไม่มีคำขอเข้ามาใน${monthLabel}`}
            />
          </div>
        </div>

        <div className="p-4 3xl:p-5 lg:col-span-5">
          <div>
            <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
              {`ใบลาแยกตามประเภท ${monthLabel}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
              นับใบลาที่ยื่นแล้วและอนุมัติแล้ว พร้อมจำนวนวันรวม
            </p>
          </div>

          <div className="mt-4">
            {leaveTypeRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                  <ClipboardCheck className="h-5 w-5" />
                </span>
                <p className="text-[11.5px] font-semibold text-slate-500">
                  {`ยังไม่มีใบลาใน${monthLabel}`}
                </p>
              </div>
            ) : (
              <BarBreakdown
                rows={leaveTypeRows}
                emptyText={`ยังไม่มีใบลาใน${monthLabel}`}
                color="#8b5cf6"
              />
            )}
          </div>
        </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="grid divide-y divide-slate-100 lg:grid-cols-12 lg:divide-x lg:divide-y-0 lg:divide-slate-200">
        <div className="p-4 3xl:p-5 lg:col-span-5">
          <div>
            <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
              {`ช่องทางการลงเวลา ${monthLabel}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
              {channelGpsTotal > 0
                ? `ในนั้นแนบพิกัด GPS มาด้วย ${numberText(channelGpsTotal)} ครั้ง`
                : "ดูว่าพนักงานลงเวลาผ่านทางไหนมากที่สุด"}
            </p>
          </div>
          <div className="mt-4">
            <DonutBreakdown
              rows={attendanceChannelRows}
              unit="ครั้ง"
              emptyText={`ยังไม่มีการลงเวลาใน${monthLabel}`}
            />
          </div>
        </div>

        <div className="p-4 3xl:p-5 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                {`สภาพการลงเวลา ${monthLabel}`}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                นับเป็นรายการลงเวลา ไม่ใช่รายคน
              </p>
            </div>
            <Link
              href="/hr-review"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11.5px] font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              ตรวจเวลาทำงาน <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-4">
            <BarBreakdown
              rows={attendanceConditionRows}
              emptyText={`ยังไม่มีการลงเวลาใน${monthLabel}`}
            />
          </div>
        </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="grid divide-y divide-slate-100 lg:grid-cols-12 lg:divide-x lg:divide-y-0 lg:divide-slate-200">
        <div className="p-4 3xl:p-5 lg:col-span-7">
          <div>
            <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
              กำลังคนรายหน่วยงาน
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
              {`นับเฉพาะพนักงาน active รวม ${numberText(departmentTotal)} คน`}
            </p>
          </div>
          <div className="mt-4">
            <BarBreakdown
              rows={departmentRows.map((item) => ({
                key: item.id,
                label: item.label,
                value: item.count,
                unit: "คน",
                note: `${percent(item.count, Math.max(departmentTotal, 1))}%`,
              }))}
              emptyText="ยังไม่มีข้อมูลหน่วยงาน"
            />
          </div>
        </div>

        <div className="p-4 3xl:p-5 lg:col-span-5">
          <div>
            <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
              สถานะพนักงานทั้งหมด
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
              {`รวมทุกสถานะ ${numberText(employeeStatusTotal)} คน`}
            </p>
          </div>

          <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,150px)_1fr] sm:items-center">
            <div className="mx-auto h-36 w-full max-w-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={employeeStatusRows}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={44}
                    outerRadius={68}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {employeeStatusRows.map((item) => (
                      <Cell key={item.label} fill={item.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [
                      `${numberText(Number(value))} คน`,
                      String(name),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-2">
              {employeeStatusRows.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-2 text-[12px] 3xl:text-[12.5px]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate text-slate-600">
                      {item.label}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="font-bold text-slate-900">
                      {numberText(item.value)}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10.5px] font-bold"
                      style={{
                        backgroundColor: `${item.color}1a`,
                        color: item.color,
                      }}
                    >
                      {percent(item.value, Math.max(employeeStatusTotal, 1))}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/*
        แยกเป็นสองกราฟเพราะสเกลต่างกันคนละชั้น — ใบลาหลักร้อยกับคนเข้า-ออกหลักหน่วย
        ถ้าวางแกนเดียวกัน เส้นคนเข้า-ออกจะแบนติดพื้นจนอ่านทิศทางไม่ออก
      */}
      <div className="border-b border-slate-200">
        <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0 lg:divide-slate-200">
        <div className="p-4 3xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                คนเข้า-ออก 6 เดือน
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                ใช้ดูว่ากำลังคนโตขึ้นหรือหดลง
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">
              <Calendar className="h-3 w-3" /> 6 เดือนล่าสุด
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TrendStatBox
              icon={UserPlus}
              label="เข้าใหม่"
              value={`${numberText(trendTotals.newEmployees)} คน`}
            />
            <TrendStatBox
              icon={UserMinus}
              label="ลาออก"
              value={`${numberText(trendTotals.resignations)} คน`}
            />
            <TrendStatBox
              icon={Users}
              label="สุทธิ"
              value={signedText(
                trendTotals.newEmployees - trendTotals.resignations,
              )}
              tone={
                trendTotals.newEmployees - trendTotals.resignations >= 0
                  ? "positive"
                  : "critical"
              }
            />
            <TrendStatBox
              icon={Calendar}
              label="เดือนนี้"
              value={`เข้า ${numberText(newThisMonth)} · ออก ${numberText(resignedThisMonth)}`}
            />
          </div>

          <div className="mt-4 h-48 3xl:h-56">
            {monthlyTrendData.length === 0 ? (
              <ChartEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyTrendData}
                  margin={{ top: 8, right: 6, bottom: 0, left: -26 }}
                  barGap={2}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [
                      `${numberText(Number(value))} คน`,
                      String(name),
                    ]}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />
                  <Bar
                    dataKey="newEmployees"
                    name={TREND_SERIES.newEmployees}
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                  />
                  <Bar
                    dataKey="resignations"
                    name={TREND_SERIES.resignations}
                    fill="#e11d48"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-4 3xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                ภาระงานลาและ OT 6 เดือน
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                ใบลาเทียบกับชั่วโมง OT ที่ยื่นเข้ามาในเดือนเดียวกัน
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">
              <Calendar className="h-3 w-3" /> 6 เดือนล่าสุด
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <TrendStatBox
              icon={FileSearch}
              label="ใบลารวม"
              value={`${numberText(trendTotals.leaveRequests)} ใบ`}
            />
            <TrendStatBox
              icon={Layers}
              label="OT รวม"
              value={`${numberText(round1(trendTotals.overtimeHours))} ชม.`}
            />
            <TrendStatBox
              icon={TrendingUp}
              label="เฉลี่ยต่อเดือน"
              value={`ลา ${numberText(
                Math.round(
                  trendTotals.leaveRequests /
                    Math.max(monthlyTrendData.length, 1),
                ),
              )} ใบ · OT ${numberText(
                round1(
                  trendTotals.overtimeHours /
                    Math.max(monthlyTrendData.length, 1),
                ),
              )} ชม.`}
            />
          </div>

          <div className="mt-4 h-48 3xl:h-56">
            {monthlyTrendData.length === 0 ? (
              <ChartEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyTrendData}
                  margin={{ top: 8, right: 4, bottom: 0, left: -26 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="leave"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="hours"
                    orientation="right"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    width={38}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [
                      name === TREND_SERIES.overtimeHours
                        ? `${numberText(round1(Number(value)))} ชม.`
                        : `${numberText(Number(value))} ใบ`,
                      String(name),
                    ]}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />
                  {/* OT เป็นแท่งสีจางไว้ข้างหลัง ใบลาเป็นเส้นวิ่งทับ */}
                  <Bar
                    yAxisId="hours"
                    dataKey="overtimeHours"
                    name={TREND_SERIES.overtimeHours}
                    fill="#e2e8f0"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  />
                  <Line
                    yAxisId="leave"
                    type="monotone"
                    dataKey="leaveRequests"
                    name={TREND_SERIES.leaveRequests}
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0 lg:divide-slate-200">
        <div className="p-4 3xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                รอ HR ตรวจสอบล่าสุด
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                รายการที่ต้องเคลียร์ก่อนส่งเข้าเงินเดือน
              </p>
            </div>
            <Link
              href="/hr-review"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11.5px] font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              ดูทั้งหมด <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {topHrReviewItems.length === 0 ? (
            <CardEmptyState
              icon={FileSearch}
              title="ยังไม่มีรายการรอ HR ตรวจสอบ"
              description="เมื่อมีรายการใหม่จะแสดงที่นี่"
            />
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {topHrReviewItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Badge tone={sourceTypeTone(item.sourceType)}>
                      {sourceTypeLabel(item.sourceType)}
                    </Badge>
                    <div className="min-w-0">
                      <p className="break-words text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                        {getEmployeeName(item.employee)}
                      </p>
                      <p className="break-words text-[11.5px] text-slate-400 3xl:text-[12.5px]">
                        {item.title || item.requestNo || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5">
                    <DateDisplay
                      value={requestDate(item)}
                      className="hidden text-[11.5px] text-slate-400 sm:inline 3xl:text-[12.5px]"
                    />
                    <StatusBadge
                      vocabulary={ATTENDANCE_REVIEW_STATUS}
                      status={item.reviewStatus}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 3xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                การลงเวลาล่าสุดวันนี้
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                ไล่จากรายการที่บันทึกล่าสุด
              </p>
            </div>
            <Link
              href="/attendance"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11.5px] font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              ดูทั้งหมด <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {recentLogs.length === 0 ? (
            <CardEmptyState
              icon={Clock}
              title="วันนี้ยังไม่มีการบันทึกเวลาเข้ามา"
              description="รายการลงเวลาจะแสดงเมื่อมีการบันทึก"
            />
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TimeDisplay
                      value={log.logTime}
                      className="inline-block w-11 shrink-0 text-[12.5px] font-semibold text-slate-500 3xl:text-[13.5px]"
                    />
                    <div className="min-w-0">
                      <p className="break-words text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                        {getEmployeeName(log.employee)}
                      </p>
                      <p className="break-words text-[11.5px] text-slate-400 3xl:text-[12.5px]">
                        {employeeMeta(log.employee)}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-slate-500 3xl:text-[12.5px]">
                      {logTypeLabel(log.logType)}
                    </span>
                    {log.status && log.status !== "NORMAL" ? (
                      <Badge tone={logStatusTone(log.status)}>
                        {logStatusLabel(log.status)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ส่วนเงิน — เห็นเฉพาะคนที่มีสิทธิ์ PAYROLL_READ (backend บังคับซ้ำอีกชั้น) */}
      {canReadPayroll ? (
        <div className="border-b border-slate-200 p-4 3xl:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                  เงินเดือนรายเดือน
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                  ฐานเงินเดือนกับรายรับอื่น ๆ และยอดโอนสุทธิของแต่ละงวด
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Select กว้างเต็มกล่องเสมอ ต้องครอบด้วยกล่องกว้างคงที่เอง */}
                <span className="block w-24 shrink-0">
                  <Select
                    value={String(payroll?.year ?? "")}
                    onChange={(event) =>
                      setPayrollYear(Number(event.target.value) || undefined)
                    }
                    className="border-slate-300 bg-white text-[11.5px] shadow-none"
                    aria-label="ปีของข้อมูลเงินเดือน"
                  >
                    {(payroll?.availableYears ?? []).map((year) => (
                      <option key={year} value={year}>
                        {year + 543}
                      </option>
                    ))}
                  </Select>
                </span>
                <ButtonLink
                  href="/payroll"
                  size="sm"
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  ไปทำเงินเดือน
                </ButtonLink>
              </div>
            </div>

            {payrollQuery.isPending ? (
              <EmptyLine text="กำลังโหลดข้อมูลเงินเดือน…" />
            ) : payrollQuery.isError ? (
              <EmptyLine
                text={getErrorMessage(
                  payrollQuery.error,
                  "โหลดข้อมูลเงินเดือนไม่สำเร็จ",
                )}
              />
            ) : !hasPayrollData ? (
              <EmptyLine
                text={`ปี ${(payroll?.year ?? 0) + 543} ยังไม่มีงวดที่คำนวณเงินเดือนแล้ว`}
              />
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
                  <PayrollStatItem
                    icon={CreditCard}
                    label="จ่ายสุทธิรวม"
                    value={`${formatMoney(payrollTotals?.netPay ?? 0)} บาท`}
                  />
                  <PayrollStatItem
                    icon={Database}
                    label="ฐานเงินเดือน"
                    value={`${formatMoney(payrollTotals?.baseSalary ?? 0)} บาท`}
                  />
                  <PayrollStatItem
                    icon={TrendingUp}
                    label="รายรับอื่น"
                    value={`${formatMoney(payrollTotals?.otherEarnings ?? 0)} บาท`}
                    tone="positive"
                  />
                  <PayrollStatItem
                    icon={TrendingDown}
                    label="รายการหัก"
                    value={`${formatMoney(payrollTotals?.deductions ?? 0)} บาท`}
                    tone="critical"
                  />
                  <PayrollStatItem
                    icon={CheckCircle2}
                    label="งวดที่คำนวณแล้ว"
                    value={`${numberText(payrollTotals?.runCount ?? 0)}/${numberText(payrollTotals?.periodCount ?? 0)} งวด`}
                  />
                </div>

                <div className="mt-4 h-60 3xl:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={payrollChartData}
                      margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={52}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        tickFormatter={moneyAxisText}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                        contentStyle={tooltipStyle}
                        formatter={(value, name) => [
                          `${formatMoney(Number(value))} บาท`,
                          String(name),
                        ]}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      />
                      {/* ซ้อนสองแท่งเป็นก้อนเดียว = ค่าจ้างรวมของเดือนนั้น */}
                      <Bar
                        dataKey="baseSalary"
                        name="ฐานเงินเดือน"
                        stackId="pay"
                        fill="#93c5fd"
                        maxBarSize={30}
                      />
                      <Bar
                        dataKey="otherEarnings"
                        name="รายรับอื่น"
                        stackId="pay"
                        fill="#2563eb"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={30}
                      />
                      <Line
                        type="monotone"
                        dataKey="netPay"
                        name="ยอดโอนสุทธิ"
                        stroke="#0f172a"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
      ) : null}

      {canReadPayroll ? (
        <div>
        <div className="grid divide-y divide-slate-100 lg:grid-cols-12 lg:divide-x lg:divide-y-0 lg:divide-slate-200">
          <div className="p-4 3xl:p-5 lg:col-span-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                  ภาษีหัก ณ ที่จ่าย
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                  ยอดที่หักจากพนักงานเพื่อนำส่งสรรพากร
                </p>
              </div>
              <Link
                href="/reports/tax-pnd1"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11.5px] font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                แบบ ภ.ง.ด.1 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="relative mt-4 space-y-2">
              <MoneyLine
                label="ภ.ง.ด.1 เดือนล่าสุด"
                helper={
                  payrollLatest
                    ? `งวด ${payrollLatest.label} ${(payroll?.year ?? 0) + 543} · ${numberText(payrollLatest.employees)} คน`
                    : "ยังไม่มีงวดที่คำนวณแล้ว"
                }
                value={payrollLatest?.tax ?? 0}
                emphasis
              />
              <MoneyLine
                label={`ภ.ง.ด.1ก สะสมทั้งปี ${(payroll?.year ?? 0) + 543}`}
                helper={`รวม ${numberText(payrollTotals?.runCount ?? 0)} งวดที่คำนวณแล้ว`}
                value={payrollTotals?.tax ?? 0}
              />
            </div>
          </div>

          <div className="p-4 3xl:p-5 lg:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                  เงินสมทบประกันสังคม
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[11.5px]">
                  ฝั่งลูกจ้างและฝั่งนายจ้างของงวดล่าสุด
                </p>
              </div>
              <Link
                href="/reports/social-security-contribution"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11.5px] font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                แบบนำส่ง สปส. <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              <MoneyLine
                icon={User}
                label="ลูกจ้างจ่ายเดือนล่าสุด"
                helper={
                  payrollLatest
                    ? `งวด ${payrollLatest.label} ${(payroll?.year ?? 0) + 543}`
                    : "ยังไม่มีงวดที่คำนวณแล้ว"
                }
                value={payrollLatest?.socialSecurityEmployee ?? 0}
                emphasis
              />
              <MoneyLine
                icon={Briefcase}
                label="นายจ้างสมทบเดือนล่าสุด"
                value={payrollLatest?.socialSecurityEmployer ?? 0}
              />
              <MoneyLine
                icon={Users}
                label={`นำส่งรวมทั้งปี ${(payroll?.year ?? 0) + 543}`}
                helper="ลูกจ้าง + นายจ้าง"
                value={
                  (payrollTotals?.socialSecurityEmployee ?? 0) +
                  (payrollTotals?.socialSecurityEmployer ?? 0)
                }
              />
            </div>
          </div>
        </div>
        </div>
      ) : null}
    </div>
  );
}

/** กล่องสถิติย่อยหัวการ์ดกราฟแนวโน้ม — ไอคอนวงกลม + ป้าย + ค่า ในกรอบของตัวเอง */
function TrendStatBox({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "critical";
}) {
  const valueClass = {
    neutral: "text-slate-900",
    positive: "text-emerald-600",
    critical: "text-rose-600",
  }[tone];

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold text-slate-500">
          {label}
        </p>
        <p
          className={`truncate text-[12.5px] font-extrabold tabular-nums 3xl:text-[13px] ${valueClass}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/** สภาพว่างของการ์ดที่มีภาพประกอบ — ใช้แทน EmptyLine ธรรมดาในการ์ดที่มีพื้นที่กว้าง */
function CardEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <Icon className="h-7 w-7" />
      </span>
      <div>
        <p className="text-[13px] font-bold text-slate-700">{title}</p>
        {description ? (
          <p className="mt-1 text-[11.5px] text-slate-400">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * แผงโดนัท + รายการข้าง ๆ
 * ใช้กับข้อมูลที่ "รวมกันแล้วเป็น 100%" เช่น คำขอแยกประเภท ช่องทางการลงเวลา
 */
function DonutBreakdown({
  rows,
  unit,
  emptyText,
}: {
  rows: DonutRow[];
  unit: string;
  emptyText: string;
}) {
  const total = rows.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) return <EmptyLine text={emptyText} />;

  const visible = rows.filter((item) => item.value > 0);

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,160px)_1fr] sm:items-center">
      <div className="relative mx-auto h-40 w-full max-w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="label"
              innerRadius={48}
              outerRadius={74}
              paddingAngle={2}
              strokeWidth={0}
            >
              {visible.map((item) => (
                <Cell key={item.key} fill={item.color} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [
                `${numberText(Number(value))} ${unit}`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* ยอดรวมวางกลางวง อ่านค่ารวมได้โดยไม่ต้องบวกเอง */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-extrabold leading-7 tabular-nums text-slate-950 3xl:text-[24px]">
            {numberText(total)}
          </span>
          <span className="text-[10.5px] text-slate-400">{unit}</span>
        </div>
      </div>

      <div className="grid gap-1.5">
        {rows.map((item) => {
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-slate-600">{item.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                {item.pending ? (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
                    รอ {numberText(item.pending)}
                  </span>
                ) : null}
                {item.note ? (
                  <span className="text-[10.5px] text-slate-400">
                    {item.note}
                  </span>
                ) : null}
                <span
                  className={`text-[13px] font-extrabold tabular-nums 3xl:text-[13.5px] ${
                    item.value === 0 ? "text-slate-300" : "text-slate-900"
                  }`}
                >
                  {numberText(item.value)}
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  {percent(item.value, total)}%
                </span>
              </span>
            </>
          );

          const rowClass =
            "flex items-center justify-between gap-2 text-[12.5px] 3xl:text-[13.5px]";

          return item.href ? (
            <Link key={item.key} href={item.href} className={`${rowClass} group`}>
              {content}
            </Link>
          ) : (
            <div key={item.key} className={rowClass}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** รายการแท่งแนวนอน ใช้กับข้อมูลที่อยากเทียบขนาดกันตรง ๆ มากกว่าดูสัดส่วน */
function BarBreakdown({
  rows,
  emptyText,
  color = "#2563eb",
}: {
  rows: BarRow[];
  emptyText: string;
  color?: string;
}) {
  if (rows.length === 0) return <EmptyLine text={emptyText} />;

  const max = Math.max(1, ...rows.map((item) => item.value));

  return (
    <div className="space-y-2.5">
      {rows.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <p className="shrink-0 text-[11px] text-slate-600 3xl:text-[11.5px]">
            {item.label}
          </p>
          <div className="h-2 min-w-[2.5rem] flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color ?? color,
              }}
            />
          </div>
          <p className="shrink-0 whitespace-nowrap text-[11px] tabular-nums 3xl:text-[11.5px]">
            <span className="font-bold text-slate-900">
              {numberText(item.value)}
            </span>
            <span className="ml-1 text-[10.5px] font-semibold text-slate-400">
              {item.unit}
              {item.note ? ` · ${item.note}` : ""}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}

/** ไอเทมสถิติในหัวการ์ดเงินเดือน — ไอคอนวงกลม + ป้าย + ค่า วางลอยเป็นแถว ไม่มีกรอบ */
function PayrollStatItem({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "critical";
}) {
  const valueClass = {
    neutral: "text-slate-900",
    positive: "text-emerald-600",
    critical: "text-rose-600",
  }[tone];

  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10.5px] font-semibold text-slate-500">
          {label}
        </p>
        <p
          className={`truncate text-[14px] font-extrabold tabular-nums 3xl:text-[15px] ${valueClass}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/** คู่ป้าย-ยอดเงินแนวนอน ใช้ในแผงภาษี/ประกันสังคม */
function MoneyLine({
  icon: Icon,
  label,
  helper,
  value,
  emphasis = false,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  helper?: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-slate-800 3xl:text-[13px]">
            {label}
          </p>
          {helper ? (
            <p className="truncate text-[11px] text-slate-400 3xl:text-[11.5px]">
              {helper}
            </p>
          ) : null}
        </div>
      </div>
      <p
        className={`shrink-0 tabular-nums ${
          emphasis
            ? "text-[16px] font-extrabold text-brand-700 3xl:text-[17px]"
            : "text-[14px] font-extrabold text-slate-950 3xl:text-[15px]"
        } ${value === 0 ? "text-slate-300!" : ""}`}
      >
        {formatMoney(value)}
        <span className="ml-1 text-[10.5px] font-semibold text-slate-400">
          บาท
        </span>
      </p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="py-8 text-center text-[13px] text-slate-400 3xl:text-[14px]">
      {text}
    </p>
  );
}

function ChartEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="text-[13px] font-semibold text-slate-600">ยังไม่มีข้อมูลกราฟ</p>
      <p className="mt-1 text-[13px] text-slate-400">
        เมื่อ backend ส่งข้อมูล ระบบจะแสดงตรงนี้
      </p>
    </div>
  );
}

function numberText(value: number) {
  return value.toLocaleString("th-TH");
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function signedText(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${numberText(Math.abs(value))} คน`;
}

/** ย่อจำนวนเงินให้พออ่านบนแกนกราฟ (แกนเงินเดือนเป็นหลักล้าน) */
function moneyAxisText(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `${numberText(round1(value / 1_000_000))} ล.`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${numberText(Math.round(value / 1_000))} พ.`;
  }
  return numberText(value);
}

/** หน้าปลายทางของคำขอแต่ละประเภท — ตอนนี้รวมอยู่ที่ศูนย์คำขอหน้าเดียว */
function requestHref(key: string) {
  return key === "DOCUMENT" ? "/documents" : "/approvals?tab=queue";
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** จำนวนวันจากวันนี้ถึงวันที่กำหนด (ติดลบ = เลยมาแล้ว) */
function daysUntil(value?: string | null) {
  const target = parseDateValue(value);
  if (!target) return null;

  const diff = startOfDay(target).getTime() - startOfDay(new Date()).getTime();
  return Math.round(diff / 86_400_000);
}

function daysSince(value?: string | null) {
  const days = daysUntil(value);
  return days === null ? null : -days;
}

function requestDate(item: DashboardHrReviewItem) {
  return item.submittedAt || item.approvedAt || item.createdAt;
}

/** โค้ดพนักงาน · หน่วยงาน · ตำแหน่ง — เท่าที่มีข้อมูล */
function employeeMeta(employee?: DashboardEmployeeMini | null) {
  if (!employee) return "-";

  const parts = [
    employee.employeeCode,
    employee.department?.nameTh || employee.department?.nameEn,
    employee.positionMaster?.nameTh ||
      employee.positionMaster?.nameEn ||
      employee.position,
  ].filter(Boolean);

  return parts.join(" · ") || "-";
}

function branchText(employee?: DashboardEmployeeMini | null) {
  return (
    employee?.branch?.nameTh ||
    employee?.branch?.nameEn ||
    employee?.company?.nameTh ||
    "-"
  );
}

function sourceTypeLabel(type?: string | null) {
  const map: Record<string, string> = {
    LEAVE: "ใบลา",
    OVERTIME: "OT",
    TIME_ADJUST: "แก้เวลา",
    OFFSITE: "นอกสถานที่",
  };

  return type ? map[type] || type : "-";
}

function sourceTypeTone(type?: string | null): Tone {
  const map: Record<string, Tone> = {
    LEAVE: "brand",
    OVERTIME: "warning",
    TIME_ADJUST: "neutral",
    OFFSITE: "positive",
  };

  return (type && map[type]) || "neutral";
}

function logTypeLabel(type?: string | null) {
  const map: Record<string, string> = {
    CHECK_IN: "เข้างาน",
    CHECK_OUT: "ออกงาน",
    BREAK_START: "เริ่มพัก",
    BREAK_END: "กลับจากพัก",
  };

  return type ? map[type] || type : "-";
}

function logStatusLabel(status?: string | null) {
  const map: Record<string, string> = {
    LATE: "สาย",
    EARLY_LEAVE: "ออกก่อน",
    MISSING_CHECKIN: "ไม่มีเวลาเข้า",
    MISSING_CHECKOUT: "ไม่มีเวลาออก",
    MANUAL_ADDED: "เพิ่มเอง",
    EDITED: "แก้ไขแล้ว",
  };

  return status ? map[status] || status : "-";
}

function logStatusTone(status?: string | null): Tone {
  if (status === "LATE" || status === "MISSING_CHECKIN") return "critical";
  if (status === "EARLY_LEAVE" || status === "MISSING_CHECKOUT")
    return "warning";
  return "neutral";
}
