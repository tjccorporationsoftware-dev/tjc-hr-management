"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Fingerprint,
  ReceiptText,
  RefreshCw,
  Timer,
} from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/auth-context";
import {
  Button,
  ButtonLink,
  PageChip,
  PageHeading,
  PageSurface,
  StatTile,
  joinClassName,
} from "@/components/kit";
import {
  getAttendancePunchContext,
  getEssDashboard,
  getEssSalarySlips,
  getMyAttendanceDailySummaries,
} from "@/lib/api";
import { normalizeAttendanceTimeSlotSession } from "@/lib/attendance-time-slot";
import { formatThaiDate, formatThaiTime } from "@/lib/date-format";
import { REQUEST_STATUS } from "@/lib/status-labels";
import type {
  AttendanceDailySummary,
  AttendancePunchContext,
} from "@/types/attendance";
import type { EssDashboardResponse } from "@/types/ess";
import type { PayrollPayslipListSummary } from "@/types/payroll";

/**
 * หน้าหลักพนักงาน
 * ---------------
 * ตอบสามคำถามที่พนักงานเปิดระบบมาถามจริง ๆ ตามลำดับ:
 *   1) ตอนนี้ต้องลงเวลาไหม ลงไปแล้วหรือยัง
 *   2) สิทธิ์ลาเหลือเท่าไร คำขอที่ยื่นไปถึงไหนแล้ว
 *   3) เดือนนี้มีสาย/ขาด/โดนหักเท่าไร เงินเดือนงวดล่าสุดได้เท่าไร
 *
 * ทุกตัวเลขมาจาก API ที่มีอยู่แล้ว ไม่มีข้อมูลสมมติ
 */

type MonthStats = {
  days: number;
  late: number;
  missing: number;
  absent: number;
};

const EMPTY_MONTH: MonthStats = {
  days: 0,
  late: 0,
  missing: 0,
  absent: 0,
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function days(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 1 });
}

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * หา log ของรอบที่ต้องการ
 *
 * ห้ามอ่านตามลำดับในอาเรย์ — ข้อมูลจริงส่วนใหญ่ session เป็น null
 * คนที่เข้างานบ่ายอย่างเดียวจะถูกนับเป็นรอบเช้า ซึ่งผิด
 * จึงใช้ normalizeAttendanceTimeSlotSession ตัวเดียวกับหน้าอื่น
 * (รู้จัก MORNING_IN/AFTERNOON_IN/CHECK_OUT และเดาจากเวลาไทยเมื่อ session ว่าง)
 */
type TodayLog = {
  logTime?: string | null;
  logType?: string | null;
  session?: string | null;
  status?: string | null;
};

function findTodayLog(
  logs: TodayLog[],
  session: "MORNING" | "AFTERNOON" | "EVENING",
) {
  return (
    logs.find(
      (log) =>
        String(log.status ?? "").toUpperCase() !== "CANCELLED" &&
        normalizeAttendanceTimeSlotSession(
          log.session,
          log.logType,
          log.logTime,
        ) === session,
    ) ?? null
  );
}

/** ทักทายตามเวลาจริงของเครื่อง — เปิดตอนเช้ากับตอนเย็นควรทักไม่เหมือนกัน */
function greeting(hour: number) {
  if (hour < 12) return "สวัสดีตอนเช้า";
  if (hour < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

export default function EssHomePage() {
  const { user } = useAuth();

  /*
    /ess/salary-slips ต้องมี PAYROLL_SLIP_VIEW ด้วย ไม่ใช่แค่ ESS_ACCESS
    บัญชีที่ไม่มีสิทธิ์จะโดน 403 จึงไม่ควรโชว์ช่องเงินเดือนกับทางลัดสลิปตั้งแต่แรก
  */
  const canViewPayslip = (user?.permissions ?? []).some(
    (permission) => permission.trim().toUpperCase() === "PAYROLL_SLIP_VIEW",
  );

  const [dashboard, setDashboard] = useState<EssDashboardResponse | null>(null);
  const [punchContext, setPunchContext] =
    useState<AttendancePunchContext | null>(null);
  const [monthSummaries, setMonthSummaries] = useState<
    AttendanceDailySummary[]
  >([]);
  const [payslipSummary, setPayslipSummary] =
    useState<PayrollPayslipListSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        if (mode === "refresh") setReloading(true);
        setError(null);

        const today = new Date();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        /*
        ยิงพร้อมกันทั้งสี่ก้อนแล้วรับผลแบบ allSettled
        ถ้าก้อนใดล้ม (เช่นยังไม่มีสิทธิ์ดูสลิป) หน้าหลักต้องยังขึ้นได้
      */
        const [dashboardResult, punchResult, summaryResult, payslipResult] =
          await Promise.allSettled([
            getEssDashboard(),
            getAttendancePunchContext(),
            getMyAttendanceDailySummaries({
              dateFrom: isoDate(monthStart),
              dateTo: isoDate(today),
              pageSize: 40,
            }),
            canViewPayslip
              ? getEssSalarySlips({ page: 1, pageSize: 1 })
              : Promise.resolve(null),
          ]);

        if (dashboardResult.status === "fulfilled") {
          setDashboard(dashboardResult.value);
        } else {
          throw dashboardResult.reason instanceof Error
            ? dashboardResult.reason
            : new Error("โหลดข้อมูลหน้าหลักไม่สำเร็จ");
        }

        setPunchContext(
          punchResult.status === "fulfilled" ? punchResult.value : null,
        );
        setMonthSummaries(
          summaryResult.status === "fulfilled" ? summaryResult.value.items : [],
        );
        setPayslipSummary(
          payslipResult.status === "fulfilled"
            ? (payslipResult.value?.summary ?? null)
            : null,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "โหลดข้อมูลหน้าหลักไม่สำเร็จ",
        );
      } finally {
        setLoading(false);
        setReloading(false);
      }
    },
    [canViewPayslip],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const employee = dashboard?.employee;
  const displayName =
    employee?.displayName ||
    [employee?.firstName, employee?.lastName].filter(Boolean).join(" ") ||
    "พนักงาน";

  const currentSession = punchContext?.currentSession ?? null;
  const holiday = punchContext?.holiday;
  const todayLogs: TodayLog[] =
    punchContext?.todayLogs ?? dashboard?.todayAttendance ?? [];

  /** สรุปเดือนนี้จากข้อมูลสรุปรายวันจริง */
  const monthStats = useMemo<MonthStats>(() => {
    if (monthSummaries.length === 0) return EMPTY_MONTH;

    return monthSummaries.reduce<MonthStats>(
      (acc, row) => ({
        days: acc.days + 1,
        late: acc.late + (toNumber(row.totalLateMinutes) > 0 ? 1 : 0),
        missing: acc.missing + (row.hasMissingLog ? 1 : 0),
        absent: acc.absent + (row.isAbsent ? 1 : 0),
      }),
      EMPTY_MONTH,
    );
  }, [monthSummaries]);

  /** สิทธิ์ลาที่ยังเหลือ เรียงจากเหลือน้อยไปมาก เพื่อให้เห็นตัวที่ใกล้หมดก่อน */
  const leaveBalances = useMemo(() => {
    return [...(dashboard?.leaveSummary ?? [])]
      .filter((item) => toNumber(item.entitlementDays) > 0)
      .sort((a, b) => toNumber(a.remainingDays) - toNumber(b.remainingDays));
  }, [dashboard?.leaveSummary]);

  const totalRemainingLeave = leaveBalances.reduce(
    (sum, item) => sum + toNumber(item.remainingDays),
    0,
  );

  const pendingCount =
    (dashboard?.metrics.pendingLeaveCount ?? 0) +
    (dashboard?.metrics.pendingOvertimeCount ?? 0) +
    (dashboard?.metrics.pendingTimeAdjustCount ?? 0);

  /** คำขอล่าสุดของทุกประเภท รวมเป็นรายการเดียวเรียงตามวันที่ยื่น */
  const recentRequests = useMemo(() => {
    if (!dashboard) return [];

    const rows = [
      ...dashboard.recentLeaveRequests.map((item) => ({
        id: `leave-${item.id}`,
        type: "ใบลา",
        title: item.leaveType?.nameTh || item.leaveType?.code || "ใบลา",
        detail:
          item.startDate && item.endDate
            ? `${formatThaiDate(item.startDate)} – ${formatThaiDate(item.endDate)}`
            : "-",
        status: item.status,
        submittedAt: item.submittedAt ?? null,
        sortAt: item.submittedAt ?? item.createdAt ?? null,
      })),
      ...dashboard.recentOvertimeRequests.map((item) => ({
        id: `ot-${item.id}`,
        type: "OT",
        title: "ทำงานล่วงเวลา",
        detail: item.workDate
          ? `${formatThaiDate(item.workDate)} · ${item.startTime ?? "-"}–${item.endTime ?? "-"}`
          : "-",
        status: item.status,
        submittedAt: item.submittedAt ?? null,
        sortAt: item.submittedAt ?? item.createdAt ?? null,
      })),
      ...dashboard.recentTimeAdjustRequests.map((item) => ({
        id: `adjust-${item.id}`,
        type: "แก้เวลา",
        title: "ขอแก้เวลาเข้า–ออกงาน",
        detail: item.requestedLogTime
          ? formatThaiDateTimeSafe(item.requestedLogTime)
          : "-",
        status: item.status,
        submittedAt: item.submittedAt ?? null,
        sortAt: item.submittedAt ?? item.createdAt ?? null,
      })),
    ];

    // ฉบับร่างยังไม่มี submittedAt ให้ใช้วันที่สร้างแทน ไม่งั้นตกไปท้ายรายการเสมอ
    return rows
      .sort(
        (a, b) =>
          new Date(b.sortAt ?? 0).getTime() - new Date(a.sortAt ?? 0).getTime(),
      )
      .slice(0, 6);
  }, [dashboard]);

  if (loading) return <LoadingState title="กำลังโหลดหน้าหลัก" />;

  /*
    ทุก endpoint ของ ESS ผูกกับ "พนักงาน" ไม่ใช่ "ผู้ใช้"
    บัญชีผู้ดูแลที่ยังไม่ถูกผูกกับพนักงานจะโหลดไม่ได้ทั้งหน้า
    จึงต้องบอกสาเหตุให้ชัด ไม่ใช่โยน error ดิบ ๆ ให้ผู้ใช้อ่านเอง
  */
  if (error) {
    const isUnlinkedAccount = error.includes("ยังไม่ได้ผูกกับข้อมูลพนักงาน");

    return (
      <PageSurface>
        <PageHeading
          heroMotif="self-service"
          eyebrow="Self Service"
          title="หน้าหลัก"
          titleAccent="พนักงาน"
          description="พื้นที่สำหรับพนักงานดูข้อมูลของตัวเอง"
        />
        <div className="px-5 py-10 3xl:px-6">
          <ErrorState
            title={
              isUnlinkedAccount
                ? "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน"
                : "โหลดข้อมูลไม่สำเร็จ"
            }
            description={
              isUnlinkedAccount
                ? "เมนูพนักงานใช้ข้อมูลของพนักงานคนนั้น ๆ บัญชีผู้ดูแลที่ไม่ได้ผูกกับพนักงานจึงยังใช้ส่วนนี้ไม่ได้ — ผูกบัญชีกับพนักงานได้ที่หน้า ผู้ใช้และสิทธิ์"
                : error
            }
            action={
              <Button onClick={() => void loadData("refresh")}>ลองใหม่</Button>
            }
          />
        </div>
      </PageSurface>
    );
  }

  const todayStatus = holiday
    ? { label: holiday.name || "วันหยุด", tone: "positive" as const }
    : currentSession?.canPunch
      ? { label: "ถึงเวลาลงเวลาแล้ว", tone: "warning" as const }
      : todayLogs.length > 0
        ? { label: "ลงเวลาแล้ววันนี้", tone: "positive" as const }
        : { label: "ยังไม่ถึงรอบลงเวลา", tone: "neutral" as const };

  return (
    <PageSurface>
      <PageHeading
        heroMotif="self-service"
        eyebrow="Self Service"
        title={`${greeting(new Date().getHours())} `}
        titleAccent={displayName}
        description={`วันนี้ ${formatThaiDate(punchContext?.workDate ?? new Date())} · สรุปงานของคุณอยู่ด้านล่างนี้`}
        chips={
          <>
            {employee?.position ? (
              <PageChip tone="brand">{employee.position}</PageChip>
            ) : null}
            {employee?.department?.nameTh ? (
              <PageChip>{employee.department.nameTh}</PageChip>
            ) : null}
            {employee?.branch?.nameTh ? (
              <PageChip>{employee.branch.nameTh}</PageChip>
            ) : null}
            {employee?.employeeCode ? (
              <PageChip>{employee.employeeCode}</PageChip>
            ) : null}
          </>
        }
        actions={
          <>
            <div
              className={joinClassName(
                "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:divide-y-0",
                canViewPayslip
                  ? "sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))]"
                  : "sm:grid-cols-[repeat(3,minmax(10.5rem,max-content))]",
              )}
            >
              <StatTile
                label="สถานะวันนี้"
                value={todayStatus.label}
                tone={todayStatus.tone}
                helper={
                  currentSession
                    ? `${currentSession.label} ${currentSession.openTime}–${currentSession.closeTime}`
                    : "ไม่มีรอบที่ต้องลงตอนนี้"
                }
              />
              <StatTile
                label="วันลาคงเหลือ"
                value={`${days(totalRemainingLeave)} วัน`}
                helper={`${leaveBalances.length} ประเภทที่ใช้ได้`}
              />
              <StatTile
                label="คำขอรออนุมัติ"
                value={`${pendingCount} รายการ`}
                tone={pendingCount > 0 ? "warning" : "positive"}
                helper={pendingCount > 0 ? "ยังรอผลอนุมัติ" : "ไม่มีค้างอยู่"}
              />
              {canViewPayslip ? (
                <StatTile
                  label="เงินเดือนงวดล่าสุด"
                  value={
                    payslipSummary?.latestNetPay
                      ? money(payslipSummary.latestNetPay)
                      : "-"
                  }
                  helper={payslipSummary?.latestPeriodName ?? "ยังไม่มีสลิป"}
                />
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => void loadData("refresh")}
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
          </>
        }
      />

      {/*
        1. แถบวันนี้ — คำถามแรกที่พนักงานเปิดระบบมาถามคือ "ต้องลงเวลาไหม ลงไปแล้วยัง"
        รวมสถานะ เวลาที่ลงไปแล้วทั้งสามรอบ และปุ่มไปลงเวลา ไว้ในแถบเดียว
        เดิมแยกเป็นหัวข้อหนึ่งแถวแล้วเว้นเวลาสามรอบไว้อีกแถว กินความสูงโดยไม่ได้ข้อมูลเพิ่ม
      */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-slate-200 bg-brand-50/40 px-5 py-3.5 sm:px-6 3xl:px-7">
        <div className="min-w-[13rem] flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            ลงเวลาวันนี้
          </p>
          <p className="mt-0.5 text-[15px] font-bold text-slate-900 3xl:text-[16px]">
            {todayStatus.label}
          </p>
          <p className="text-[11.5px] text-slate-500 3xl:text-[12px]">
            {holiday
              ? `${holiday.name || "วันหยุด"} — ไม่ต้องลงเวลา`
              : currentSession
                ? `รอบ ${currentSession.label} · เวลามาตรฐาน ${currentSession.expectedTime}`
                : "ตอนนี้อยู่นอกช่วงรอบลงเวลา"}
          </p>
        </div>

        {/* สามรอบเรียงชิดกันเป็นชุดเดียว อ่านจบในตาเดียวว่ายังขาดรอบไหน */}
        <div className="grid w-full grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:w-auto">
          {(
            [
              ["เช้า", "MORNING"],
              ["บ่าย", "AFTERNOON"],
              ["ออกงาน", "EVENING"],
            ] as const
          ).map(([label, session]) => {
            const log = findTodayLog(todayLogs, session);

            return (
              <div key={label} className="px-4 py-1.5 sm:min-w-[6.5rem]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]">
                  {label}
                </p>
                <p
                  className={joinClassName(
                    "text-[16px] font-bold tabular-nums 3xl:text-[17.5px]",
                    log ? "text-brand-700" : "text-slate-300",
                  )}
                >
                  {log ? formatThaiTime(log.logTime) : "—"}
                </p>
              </div>
            );
          })}
        </div>

        <ButtonLink
          href="/ess/check-in"
          variant={currentSession?.canPunch ? "primary" : "secondary"}
          icon={<Fingerprint className="h-3.5 w-3.5" />}
        >
          {currentSession?.canPunch ? "ไปลงเวลา" : "เปิดหน้าลงเวลา"}
        </ButtonLink>
      </section>

      {/*
        2. ทางลัด — ป้ายหัวข้ออยู่ในบรรทัดเดียวกับปุ่ม ไม่กินอีกหนึ่งแถว
        ปุ่มเตี้ยลงเหลือบรรทัดครึ่ง เพราะเป็นทางผ่าน ไม่ใช่เนื้อหาที่ต้องอ่าน
      */}
      <section className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
        <p className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          ทำรายการด่วน
        </p>

        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink
            href="/ess/requests?tab=leave"
            icon={<CalendarDays className="h-4 w-4" />}
            title="ยื่นใบลา"
            hint={`คงเหลือ ${days(totalRemainingLeave)} วัน`}
          />
          <QuickLink
            href="/ess/requests?tab=overtime"
            icon={<Timer className="h-4 w-4" />}
            title="ขอ OT"
            hint="ทำงานล่วงเวลา"
          />
          <QuickLink
            href="/ess/requests?tab=time-adjust"
            icon={<Clock3 className="h-4 w-4" />}
            title="ขอแก้เวลา"
            hint="ลืมลงเวลา / นอกสถานที่"
          />
          {canViewPayslip ? (
            <QuickLink
              href="/ess/my-profile?tab=payslip"
              icon={<ReceiptText className="h-4 w-4" />}
              title="สลิปเงินเดือน"
              hint={payslipSummary?.latestPeriodName ?? "ดูย้อนหลัง"}
            />
          ) : (
            <QuickLink
              href="/ess/my-profile"
              icon={<ReceiptText className="h-4 w-4" />}
              title="ข้อมูลของฉัน"
              hint="แฟ้มข้อมูลพนักงาน"
            />
          )}
        </div>
      </section>

      {/*
        3. สรุปเดือนนี้ — ยกขึ้นมาเต็มความกว้าง
        เดิมอยู่ครึ่งขวาคู่กับสิทธิ์การลา มีแค่สี่ตัวเลขจึงเหลือที่ว่างครึ่งจอ
      */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-2.5 sm:px-6 3xl:px-7">
        <div>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            สรุปการลงเวลาเดือนนี้
          </h2>
          <p className="mt-0.5 text-[11.5px] text-slate-400">
            นับจากประวัติที่ระบบบันทึกไว้จริง ตั้งแต่ต้นเดือนถึงวันนี้
          </p>
        </div>

        <ButtonLink
          href="/ess/check-in?tab=history"
          variant="secondary"
          size="sm"
          icon={<ArrowRight className="h-3.5 w-3.5" />}
        >
          ดูประวัติ
        </ButtonLink>
      </div>

      <div className="grid border-b border-slate-200 sm:grid-cols-2 xl:grid-cols-4">
        <MonthFact
          label="วันที่มีประวัติ"
          helper="วันที่ระบบมีข้อมูลลงเวลา"
          value={`${monthStats.days}`}
        />
        <MonthFact
          label="มาสาย"
          helper="เข้างานช้ากว่าเวลามาตรฐาน"
          value={`${monthStats.late}`}
          tone={monthStats.late > 0 ? "warning" : "neutral"}
        />
        <MonthFact
          label="ลงเวลาไม่ครบ"
          helper="ขาดการลงเวลาบางรอบ"
          value={`${monthStats.missing}`}
          tone={monthStats.missing > 0 ? "warning" : "neutral"}
        />
        <MonthFact
          label="ขาดงาน"
          helper="ไม่มาและไม่ได้ยื่นใบลา"
          value={`${monthStats.absent}`}
          tone={monthStats.absent > 0 ? "critical" : "neutral"}
        />
      </div>

      {/* 4. สองรายการยาวที่เหลือ วางคู่กันซ้าย-ขวา ความสูงจึงใกล้เคียงกัน */}
      <div className="grid xl:grid-cols-2 xl:divide-x xl:divide-slate-200">
        {/* ---------------- สิทธิ์การลา ---------------- */}
        <section className="min-w-0 border-b border-slate-200 px-5 py-3.5 sm:px-6 xl:border-b-0 3xl:px-7">
          <SectionHead
            title="สิทธิ์การลาปีนี้"
            hint="เรียงจากที่เหลือน้อยที่สุด · แถบคือส่วนที่ใช้ไปแล้ว"
          />

          {leaveBalances.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-slate-400">
              ยังไม่มีข้อมูลสิทธิ์การลาในปีนี้
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {leaveBalances.slice(0, 6).map((item) => {
                const entitlement =
                  toNumber(item.entitlementDays) +
                  toNumber(item.carriedForwardDays) +
                  toNumber(item.adjustedDays);
                const remaining = toNumber(item.remainingDays);
                const used = Math.max(entitlement - remaining, 0);
                const pending = toNumber(item.pendingDays);
                const ratio =
                  entitlement > 0
                    ? Math.min((used / entitlement) * 100, 100)
                    : 0;

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 py-2 3xl:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
                        {item.leaveType?.nameTh ||
                          item.leaveType?.code ||
                          "ประเภทลา"}
                      </p>

                      {/*
                        แถบบางอยู่ใต้ชื่อ ไม่ใช่เต็มความกว้างของช่อง
                        ประเภทที่ยังไม่ได้ใช้เลยจะได้ไม่เป็นเส้นเทายาวพาดทั้งแถว
                      */}
                      <div className="mt-1 h-1 w-full max-w-[13rem] overflow-hidden rounded-full bg-brand-50">
                        <div
                          className={joinClassName(
                            "h-full rounded-full",
                            remaining <= 0 ? "bg-rose-400" : "bg-brand-500",
                          )}
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </div>

                    {pending > 0 ? (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                        รออนุมัติ {days(pending)} วัน
                      </span>
                    ) : null}

                    {/* ตัวเลขตรึงความกว้าง ทุกแถวจึงตรงแนวกัน */}
                    <p className="w-24 shrink-0 text-right text-[12px] tabular-nums text-slate-400 3xl:w-28 3xl:text-[12.5px]">
                      <span className="text-[15px] font-bold text-brand-700 3xl:text-[16px]">
                        {days(remaining)}
                      </span>
                      {" / "}
                      {days(entitlement)} วัน
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------------- คำขอล่าสุด ---------------- */}
        <section className="min-w-0 px-5 py-3.5 sm:px-6 3xl:px-7">
          <SectionHead
            title="คำขอล่าสุดของฉัน"
            hint="รวมใบลา OT และขอแก้เวลา เรียงจากที่ยื่นล่าสุด"
            action={
              <ButtonLink
                href="/ess/requests"
                variant="secondary"
                size="sm"
                icon={<ArrowRight className="h-3.5 w-3.5" />}
              >
                ดูทั้งหมด
              </ButtonLink>
            }
          />

          {recentRequests.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] font-semibold text-slate-600">
                ยังไม่มีคำขอ
              </p>
              <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
                ยื่นใบลา ขอ OT หรือขอแก้เวลาได้จากปุ่มทำรายการด่วนด้านบน
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentRequests.map((item) => (
                <article
                  key={item.id}
                  className="flex items-center gap-3 py-2 3xl:gap-4"
                >
                  <span className="w-14 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-center text-[10.5px] font-semibold text-slate-500">
                    {item.type}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                      {item.title}
                    </p>
                    <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
                      {item.detail}
                      {item.submittedAt
                        ? ` · ยื่น ${formatThaiDate(item.submittedAt)}`
                        : ""}
                    </p>
                  </div>

                  <div className="shrink-0">
                    <StatusBadge
                      vocabulary={REQUEST_STATUS}
                      status={item.status}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageSurface>
  );
}

/** เวลาที่ขอแก้ไข อาจมาเป็น ISO หรือ "HH:mm" ก็ได้ */
function formatThaiDateTimeSafe(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${formatThaiDate(parsed)} ${formatThaiTime(parsed)}`;
}

/** หัวข้อย่อยชุดเดียวกับทั้งระบบ — ป้ายฟ้าคั่นเส้นบาง คำอธิบายซ้าย ปุ่มขวา */
function SectionHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5 border-b border-brand-100 pb-1.5">
      <div className="min-w-0">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {title}
        </h2>
        {hint ? (
          <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
            {hint}
          </p>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <ButtonLink
      href={href}
      variant="secondary"
      className="h-auto justify-start gap-2.5 px-3 py-1.5 text-left"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold text-slate-900 3xl:text-[13.5px]">
          {title}
        </span>
        <span className="block truncate text-[10.5px] font-normal text-slate-400">
          {hint}
        </span>
      </span>
    </ButtonLink>
  );
}

/** ตัวเลขสรุปหนึ่งช่อง — ป้ายกับคำอธิบายซ้าย ตัวเลขขวา ไม่ใช่กล่องมีขอบ */
function MonthFact({
  label,
  helper,
  value,
  tone = "neutral",
}: {
  label: string;
  helper: string;
  value: string;
  tone?: "neutral" | "warning" | "critical";
}) {
  const valueClass = {
    neutral: "text-slate-900",
    warning: "text-amber-600",
    critical: "text-rose-600",
  }[tone];

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 last:border-b-0 sm:border-r sm:px-6 sm:[&:nth-child(2n)]:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(4n)]:border-r-0 3xl:px-7">
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
          valueClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}
