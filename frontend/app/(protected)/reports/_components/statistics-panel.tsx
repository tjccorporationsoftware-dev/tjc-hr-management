"use client";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { RefreshCw } from "lucide-react";

import { Button, Notice } from "@/components/kit";
import type { ReportStatistics } from "@/types/reports";

import {
  StatBreakdown,
  StatCell,
  StatDayChart,
  StatRow,
  StatSection,
} from "./stat-blocks";
import {
  employeeStatusText,
  jobStageText,
  leaveStatusText,
  offboardingStatusText,
  overtimeStatusText,
  payrollRunStatusText,
  postingStatusText,
  probationStatusText,
  requestStatusText,
  taskStatusText,
} from "./stat-labels";

/**
 * แท็บ "สถิติระบบ"
 * -----------------------------------------------------------------------------
 * ตอบคำถามว่า "ช่วงที่เลือก องค์กรเกิดอะไรขึ้นบ้าง" ในหน้าเดียว
 * เรียงตามสายงานจริง: กำลังคน → เวลาทำงาน → ลา/OT → เงินเดือน → สรรหา
 * → วงจรพนักงาน → เอกสาร
 *
 * ตัวเลขทั้งหมดมาจาก `GET /reports/statistics` ครั้งเดียว ไม่ได้ยิงแยกรายบล็อก
 * จะได้ไม่มีสภาพที่แต่ละบล็อกอ้างเวลาคนละจุด
 */
export function StatisticsPanel({
  data,
  loading,
  error,
  onRetry,
}: {
  data: ReportStatistics | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (loading && !data) {
    return <LoadingState title="กำลังรวบรวมสถิติ" />;
  }

  if (error && !data) {
    return (
      <ErrorState
        title="โหลดสถิติไม่สำเร็จ"
        description={error}
        action={
          <Button
            onClick={onRetry}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            ลองใหม่
          </Button>
        }
      />
    );
  }

  if (!data) return null;

  const { workforce, attendance, leave, overtime, payroll } = data;
  const { recruitment, lifecycle, documents } = data;

  return (
    <>
      {error ? (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="warning">
            {error} — ตัวเลขที่เห็นเป็นชุดล่าสุดที่โหลดสำเร็จ
          </Notice>
        </div>
      ) : null}

      {/* ---------------- กำลังคน ---------------- */}
      <StatSection
        title="กำลังคน"
        description="ยอดพนักงานเป็นค่า ณ วันนี้ ส่วนเข้า–ออกนับเฉพาะในช่วงที่เลือก"
      >
        <StatRow>
          <StatCell
            label="พนักงานที่ทำงานอยู่"
            value={count(workforce.activeTotal)}
            helper="สถานะทำงานปกติ ณ วันนี้"
          />
          <StatCell
            label="เข้าใหม่"
            value={count(workforce.newHires)}
            tone="positive"
            helper="เริ่มงานในช่วงที่เลือก"
          />
          <StatCell
            label="ออกจากงาน"
            value={count(workforce.separations)}
            tone={workforce.separations > 0 ? "warning" : "neutral"}
            helper="ใบลาออกที่อนุมัติและมีผลในช่วงนี้"
          />
          <StatCell
            label="เปลี่ยนแปลงสุทธิ"
            value={`${workforce.netChange > 0 ? "+" : ""}${count(workforce.netChange)}`}
            tone={
              workforce.netChange > 0
                ? "positive"
                : workforce.netChange < 0
                  ? "critical"
                  : "neutral"
            }
            helper="เข้าใหม่ − ออกจากงาน"
          />
        </StatRow>

        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          <BreakdownBlock title="แยกตามสถานะ">
            <StatBreakdown
              items={workforce.byStatus}
              labelOf={employeeStatusText}
              unit={(item) => `${count(item.count)} คน`}
            />
          </BreakdownBlock>

          <BreakdownBlock title="แยกตามประเภทพนักงาน">
            <StatBreakdown
              items={workforce.byEmploymentType}
              unit={(item) => `${count(item.count)} คน`}
            />
          </BreakdownBlock>

          <BreakdownBlock title="แยกตามแผนก">
            <StatBreakdown
              items={workforce.byDepartment}
              unit={(item) => `${count(item.count)} คน`}
            />
          </BreakdownBlock>
        </div>
      </StatSection>

      {/* ---------------- เวลาทำงาน ---------------- */}
      <StatSection
        title="เวลาทำงาน"
        description="นับจากสรุปการลงเวลารายวันของพนักงานในขอบเขตที่ดูอยู่"
      >
        <StatRow>
          <StatCell
            label="อัตราการมาทำงาน"
            value={
              attendance.attendanceRate === null
                ? "—"
                : `${attendance.attendanceRate}%`
            }
            tone={
              attendance.attendanceRate === null
                ? "neutral"
                : attendance.attendanceRate >= 95
                  ? "positive"
                  : "warning"
            }
            helper={
              attendance.attendanceRate === null
                ? "ยังไม่มีบันทึกในช่วงนี้"
                : `จาก ${count(attendance.recordedDays)} วันที่มีบันทึก`
            }
          />
          <StatCell
            label="วันที่มาสาย"
            value={count(attendance.lateDays)}
            tone={attendance.lateDays > 0 ? "warning" : "neutral"}
            helper={`รวม ${count(attendance.lateMinutes)} นาที`}
          />
          <StatCell
            label="วันขาดงาน"
            value={count(attendance.absentDays)}
            tone={attendance.absentDays > 0 ? "critical" : "neutral"}
            helper={`ลืมลงเวลา ${count(attendance.missingLogDays)} วัน`}
          />
          <StatCell
            label="ชั่วโมง OT ที่อนุมัติ"
            value={count(attendance.approvedOtHours)}
            helper={`จ่ายจริง ${count(attendance.payableOtHours)} ชม.`}
          />
        </StatRow>

        <p className="mt-3 text-[12px] text-slate-500 3xl:text-[13px]">
          ยอดหักจากเวลาทำงานรวม{" "}
          <span className="font-semibold tabular-nums text-rose-700">
            {money(attendance.deductionAmount)}
          </span>{" "}
          บาท
        </p>
      </StatSection>

      {/* ---------------- การลาและ OT ---------------- */}
      <StatSection
        title="การลาและล่วงเวลา"
        description="นับใบลาตามวันที่เริ่มลา และใบ OT ตามวันที่ทำงาน"
      >
        <StatRow>
          <StatCell
            label="ใบลาทั้งหมด"
            value={count(leave.totalRequests)}
            helper="ทุกสถานะในช่วงที่เลือก"
          />
          <StatCell
            label="วันลาที่อนุมัติ"
            value={count(leave.approvedDays)}
            helper="รวมทุกประเภทการลา"
          />
          <StatCell
            label="ใบ OT ทั้งหมด"
            value={count(overtime.totalRequests)}
            helper="ทุกสถานะในช่วงที่เลือก"
          />
          <StatCell
            label="ชั่วโมง OT ที่อนุมัติ"
            value={count(overtime.approvedHours)}
            helper="จากใบที่อนุมัติแล้ว"
          />
        </StatRow>

        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          <BreakdownBlock title="ใบลาแยกตามสถานะ">
            <StatBreakdown
              items={leave.byStatus}
              labelOf={leaveStatusText}
              unit={(item) =>
                `${count(item.count)} ใบ · ${count(item.days ?? 0)} วัน`
              }
            />
          </BreakdownBlock>

          <BreakdownBlock title="วันลาแยกตามประเภท">
            <StatBreakdown
              items={leave.byType}
              unit={(item) => `${count(item.days ?? 0)} วัน`}
            />
          </BreakdownBlock>

          <BreakdownBlock title="ใบ OT แยกตามสถานะ">
            <StatBreakdown
              items={overtime.byStatus}
              labelOf={overtimeStatusText}
              unit={(item) =>
                `${count(item.count)} ใบ · ${count(item.hours ?? 0)} ชม.`
              }
            />
          </BreakdownBlock>
        </div>
      </StatSection>

      {/* ---------------- เงินเดือน ---------------- */}
      <StatSection
        title="เงินเดือน"
        description="นับรอบเงินเดือนที่ถูกสร้างในช่วงที่เลือก"
      >
        <StatRow>
          <StatCell
            label="รอบเงินเดือน"
            value={count(payroll.totalRuns)}
            helper={`พนักงานในรอบรวม ${count(payroll.paidEmployees)} รายการ`}
          />
          <StatCell
            label="ยอดจ่ายรวม"
            value={money(payroll.grossPay)}
            tone="brand"
            helper="ก่อนหักรายการต่าง ๆ"
          />
          <StatCell
            label="ยอดหักรวม"
            value={money(payroll.deductions)}
            tone="critical"
            helper="ภาษี ประกันสังคม และรายการหักอื่น"
          />
          <StatCell
            label="ยอดสุทธิ"
            value={money(payroll.netPay)}
            tone="positive"
            helper="ยอดที่พนักงานได้รับจริง"
          />
        </StatRow>

        <div className="mt-5">
          <BreakdownBlock title="รอบเงินเดือนแยกตามสถานะ">
            <StatBreakdown
              items={payroll.byStatus}
              labelOf={payrollRunStatusText}
              unit={(item) => `${count(item.count)} รอบ`}
            />
          </BreakdownBlock>
        </div>
      </StatSection>

      {/* ---------------- สรรหาและวงจรพนักงาน ---------------- */}
      <StatSection
        title="สรรหาและวงจรพนักงาน"
        description="ประกาศรับสมัครนับยอด ณ ปัจจุบัน ส่วนผู้สมัคร สัมภาษณ์ และใบเสนอจ้าง นับในช่วงที่เลือก"
      >
        <StatRow>
          <StatCell
            label="ประกาศที่เปิดรับ"
            value={count(recruitment.openPostings)}
            helper="ยอด ณ วันนี้"
          />
          <StatCell
            label="ผู้สมัครใหม่"
            value={count(recruitment.newApplications)}
            helper={`นัดสัมภาษณ์ ${count(recruitment.interviews)} ครั้ง`}
          />
          <StatCell
            label="อยู่ระหว่างทดลองงาน"
            value={count(lifecycle.probationInProgress)}
            tone={lifecycle.probationInProgress > 0 ? "warning" : "neutral"}
            helper="ยอด ณ วันนี้"
          />
          <StatCell
            label="อยู่ระหว่างลาออก"
            value={count(lifecycle.offboardingInProgress)}
            tone={lifecycle.offboardingInProgress > 0 ? "warning" : "neutral"}
            helper="ยอด ณ วันนี้"
          />
        </StatRow>

        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          <BreakdownBlock title="ผู้สมัครแยกตามขั้นตอน">
            <StatBreakdown
              items={recruitment.applicationsByStage}
              labelOf={jobStageText}
              unit={(item) => `${count(item.count)} คน`}
            />
          </BreakdownBlock>

          <BreakdownBlock title="ประกาศแยกตามสถานะ">
            <StatBreakdown
              items={recruitment.postingsByStatus}
              labelOf={postingStatusText}
              unit={(item) => `${count(item.count)} ใบ`}
            />
          </BreakdownBlock>

          <BreakdownBlock title="ทดลองงานและลาออก">
            <StatBreakdown
              items={[
                ...lifecycle.probationByStatus.map((item) => ({
                  ...item,
                  key: `ทดลองงาน · ${probationStatusText(item.key)}`,
                })),
                ...lifecycle.offboardingByStatus.map((item) => ({
                  ...item,
                  key: `ลาออก · ${offboardingStatusText(item.key)}`,
                })),
              ]}
              unit={(item) => `${count(item.count)} ราย`}
            />
          </BreakdownBlock>
        </div>

        {lifecycle.onboardingTasksByStatus.length > 0 ? (
          <div className="mt-5">
            <BreakdownBlock title="งานต้อนรับพนักงานใหม่">
              <StatBreakdown
                items={lifecycle.onboardingTasksByStatus}
                labelOf={taskStatusText}
                unit={(item) => `${count(item.count)} งาน`}
              />
            </BreakdownBlock>
          </div>
        ) : null}
      </StatSection>

      {/* ---------------- เอกสาร ---------------- */}
      <StatSection
        title="เอกสารและไฟล์"
        description="คำขอเอกสารและไฟล์ที่ระบบสร้างในช่วงที่เลือก"
      >
        <StatRow>
          <StatCell
            label="คำขอเอกสาร"
            value={count(documents.documentRequests)}
            helper="หนังสือรับรอง สลิป และเอกสารอื่น"
          />
          <StatCell
            label="ไฟล์ที่สร้างแล้ว"
            value={count(documents.exportsGenerated)}
            helper="ไฟล์รายงานที่ระบบออกให้"
          />
          <StatCell
            label="เรื่องร้องเรียน"
            value={count(documents.complaints)}
            tone={documents.complaints > 0 ? "warning" : "neutral"}
            helper="ยื่นเข้ามาในช่วงนี้"
          />
          <StatCell
            label="งานสร้างรายงาน"
            value={count(
              documents.reportJobsByStatus.reduce(
                (sum, item) => sum + item.count,
                0,
              ),
            )}
            helper="คำสั่งสร้างไฟล์ทั้งหมด"
          />
        </StatRow>

        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          <BreakdownBlock title="คำขอเอกสารแยกตามสถานะ">
            <StatBreakdown
              items={documents.requestsByStatus}
              labelOf={requestStatusText}
              unit={(item) => `${count(item.count)} คำขอ`}
            />
          </BreakdownBlock>

          <BreakdownBlock title="ไฟล์แยกตามรูปแบบ">
            <StatBreakdown
              items={documents.exportsByFormat}
              unit={(item) => `${count(item.count)} ไฟล์`}
            />
          </BreakdownBlock>

          <BreakdownBlock title="งานสร้างรายงานแยกตามสถานะ">
            <StatBreakdown
              items={documents.reportJobsByStatus}
              labelOf={taskStatusText}
              unit={(item) => `${count(item.count)} งาน`}
            />
          </BreakdownBlock>
        </div>
      </StatSection>

      {/* ---------------- กิจกรรมรายวัน ---------------- */}
      <StatSection
        title="กิจกรรมในระบบรายวัน"
        description="จำนวนการกระทำที่ถูกบันทึกไว้ในแต่ละวัน — ดูละเอียดได้ที่แท็บการใช้งานระบบ"
      >
        <StatDayChart items={data.system.byDay} />
      </StatSection>
    </>
  );
}

function BreakdownBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[12px]">
        {title}
      </p>
      {children}
    </div>
  );
}

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function money(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
