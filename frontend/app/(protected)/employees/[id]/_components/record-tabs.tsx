"use client";

import {
  CheckCircle2,
  ExternalLink,
  Plus,
  TriangleAlert,
} from "lucide-react";

import { Button, ButtonLink, Notice } from "@/components/kit";
import { EmptyState } from "@/components/common/feedback-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import type {
  EmployeeProbationRecord,
  EmployeeResignationItem,
  EmployeeWorkHistoryItem,
  ResignationStatus,
} from "@/types/employee";

import {
  PROBATION_VOCABULARY,
  RESIGNATION_STATUS_VOCABULARY,
  dateText,
  textOf,
  workHistoryTypeText,
} from "./employee-format";
import { InfoGrid, InfoItem } from "@/components/common/info-list";

/** วันสิ้นสุดที่ใช้จริง — ขยายเวลาแล้วให้ยึดวันที่ขยายถึง */
function probationDueDate(record: {
  endDate: string;
  extendedUntil?: string | null;
}) {
  return new Date(record.extendedUntil ?? record.endDate);
}

/**
 * ระยะเวลาทดลองงานเป็นจำนวนวัน — นับรวมทั้งวันแรกและวันสุดท้าย
 * ให้ตรงกับที่ทะเบียนต้นทางคิด (01/04–28/07 = 119 วัน ไม่ใช่ 118)
 */
function probationDays(record: {
  startDate: string;
  endDate: string;
  extendedUntil?: string | null;
}) {
  const start = new Date(record.startDate);
  const due = probationDueDate(record);
  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime())) return 0;

  const days = Math.round((due.getTime() - start.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

/** เหลืออีกกี่วันถึงครบกำหนด — 0 = ครบแล้วหรือปิดรอบไปแล้ว */
function daysLeft(record: {
  status: string;
  endDate: string;
  extendedUntil?: string | null;
}) {
  if (record.status !== "IN_PROGRESS") return 0;

  const days = Math.ceil(
    (probationDueDate(record).getTime() - Date.now()) / 86_400_000,
  );
  return days > 0 ? days : 0;
}

/**
 * ครบกำหนดทดลองงานมากี่วันแล้ว โดยที่ยังไม่มีใครบันทึกผล
 *
 * นับเฉพาะรอบที่ยัง IN_PROGRESS — รอบที่สรุปผลแล้ว (ผ่าน/ไม่ผ่าน/ยกเลิก)
 * ไม่ถือว่าค้าง ส่วนรอบที่ขยายเวลาให้นับจากวันที่ขยายถึงแทน
 */
function overdueDays(record: {
  status: string;
  endDate: string;
  extendedUntil?: string | null;
}) {
  if (record.status !== "IN_PROGRESS") return 0;

  const due = new Date(record.extendedUntil ?? record.endDate);
  if (Number.isNaN(due.getTime())) return 0;

  const days = Math.floor((Date.now() - due.getTime()) / 86_400_000);
  return days > 0 ? days : 0;
}

/**
 * แท็บที่เป็น "รายการเหตุการณ์": ทดลองงาน / ประวัติการทำงาน / การลาออก
 * -------------------------------------------------------------------
 * ทั้งสามอันเป็นรายการเรียงตามเวลา ไม่ใช่ตารางที่ต้องเทียบตัวเลขข้ามแถว
 * จึงวางเป็นแถวคั่นเส้นแทน DataTable — อ่านง่ายกว่าตอนที่แต่ละรายการมีข้อความยาว
 */

const ROW_CLASS = "border-b border-slate-200 px-5 py-4 sm:px-6 3xl:px-7";

/* ------------------------------------------------------------------ */
/* ทดลองงาน                                                            */
/* ------------------------------------------------------------------ */

export function ProbationTab({
  records,
  probationPassedAt,
}: {
  records: EmployeeProbationRecord[];
  probationPassedAt: string | null;
}) {
  if (records.length === 0) {
    return (
      <EmptyState
        className="m-5 sm:m-6"
        title="ยังไม่มีบันทึกทดลองงาน"
        description="ใบทดลองงานสร้างจากหน้าเริ่มงานพนักงานใหม่ แล้วผลรีวิวจะมาแสดงที่นี่"
        action={
          <ButtonLink
            href="/onboarding"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
          >
            เปิดหน้าเริ่มงานพนักงานใหม่
          </ButtonLink>
        }
      />
    );
  }

  const overdue = records.filter((record) => overdueDays(record) > 0);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
        <p className="text-[12px] text-slate-500 3xl:text-[13px]">
          บันทึกทดลองงาน {records.length.toLocaleString("th-TH")} รายการ
        </p>
        <ButtonLink
          href="/onboarding"
          size="sm"
          icon={<ExternalLink className="h-3.5 w-3.5" />}
        >
          จัดการที่หน้าเริ่มงานพนักงานใหม่
        </ButtonLink>
      </div>

      {overdue.length > 0 ? (
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6 3xl:px-7">
          <Notice tone="warning" icon={<TriangleAlert className="h-4 w-4" />}>
            รอบทดลองงานครบกำหนดแล้วแต่ยังไม่ได้บันทึกผล — ต้องสรุปว่า
            <b> ผ่าน / ไม่ผ่าน / ขยายเวลา</b> ที่หน้าเริ่มงานพนักงานใหม่
            ระบบจะยังนับว่าอยู่ระหว่างทดลองงานจนกว่าจะบันทึกผล
          </Notice>
        </div>
      ) : null}

      {probationPassedAt ? (
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6 3xl:px-7">
          <Notice tone="positive" icon={<CheckCircle2 className="h-4 w-4" />}>
            บรรจุเป็นพนักงานประจำแล้วเมื่อ{" "}
            <span className="font-semibold">{dateText(probationPassedAt)}</span>
          </Notice>
        </div>
      ) : null}

      {records.map((record) => (
        <section key={record.id} className={ROW_CLASS}>
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusBadge
              vocabulary={PROBATION_VOCABULARY}
              status={record.status}
            />
            <span className="text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
              {dateText(record.startDate)} – {dateText(record.endDate)}
            </span>

            {/* ระยะเวลาทดลองงาน — ตัวเลขที่ HR ใช้เทียบกับนโยบายบริษัท */}
            {probationDays(record) > 0 ? (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
                {probationDays(record).toLocaleString("th-TH")} วัน
              </span>
            ) : null}

            {daysLeft(record) > 0 ? (
              <span className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                เหลืออีก {daysLeft(record).toLocaleString("th-TH")} วัน
              </span>
            ) : null}

            {/*
              * ครบกำหนดแล้วแต่ยังไม่มีใครบันทึกผล — ป้าย "อยู่ระหว่างทดลองงาน"
              * เฉย ๆ ทำให้ดูเหมือนทุกอย่างปกติ ทั้งที่จริงคืองานค้างของ HR
              * และมีผลต่อสิทธิ์ของพนักงาน (บรรจุช้า = สิทธิ์บางอย่างช้าตาม)
              */}
            {overdueDays(record) > 0 ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                ครบกำหนดแล้ว {overdueDays(record).toLocaleString("th-TH")} วัน ·
                รอบันทึกผล
              </span>
            ) : null}
            {record.extendedUntil ? (
              <span className="text-[12px] text-slate-500 3xl:text-[13px]">
                ขยายถึง {dateText(record.extendedUntil)}
              </span>
            ) : null}
          </div>

          <InfoGrid className="mt-3.5">
            <InfoItem
              label="ระยะเวลาทดลองงาน"
              value={
                probationDays(record) > 0
                  ? `${probationDays(record).toLocaleString("th-TH")} วัน`
                  : "-"
              }
            />
            <InfoItem label="นัดรีวิว" value={dateText(record.reviewDate)} />
            <InfoItem label="วันที่รีวิว" value={dateText(record.reviewedAt)} />
            <InfoItem
              label="ผู้รีวิว"
              value={textOf(
                record.reviewedBy?.displayName ?? record.reviewedBy?.email,
              )}
            />
            <InfoItem label="ผลการรีวิว" value={textOf(record.result)} />
            <InfoItem label="สรุปผล" value={textOf(record.summary)} wide />
            <InfoItem
              label="ข้อเสนอแนะ"
              value={textOf(record.recommendation)}
              wide
            />
          </InfoGrid>

          {record.evaluationResults?.length ? (
            <div className="mt-3.5 divide-y divide-slate-100 border-t border-slate-100 pt-1">
              {record.evaluationResults.map((evaluation) => (
                <div
                  key={evaluation.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px] 3xl:text-[14px]"
                >
                  <span className="text-slate-600">
                    {evaluation.form?.name ?? "แบบประเมิน"}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {Number(evaluation.totalScore ?? 0).toLocaleString("th-TH")}{" "}
                    / {Number(evaluation.maxScore ?? 0).toLocaleString("th-TH")}
                    <span className="ml-2 font-normal text-slate-400">
                      {Number(evaluation.percent ?? 0).toFixed(1)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ประวัติการทำงาน                                                      */
/* ------------------------------------------------------------------ */

/** ตำแหน่งเปลี่ยนแสดงเป็นข้อความ ส่วนสถานะเปลี่ยนแสดงเป็นป้ายคู่ด้านล่าง */
function positionChangeOf(history: EmployeeWorkHistoryItem) {
  if (!history.oldPosition && !history.newPosition) return null;

  return `${history.oldPosition || "ไม่ระบุ"} → ${history.newPosition || "ไม่ระบุ"}`;
}

export function HistoryTab({
  histories,
}: {
  histories: EmployeeWorkHistoryItem[];
}) {
  if (histories.length === 0) {
    return (
      <EmptyState
        className="m-5 sm:m-6"
        title="ยังไม่มีประวัติการทำงาน"
        description="เมื่อมีการย้ายตำแหน่ง ย้ายสังกัด หรือเปลี่ยนสถานะ ระบบจะบันทึกไว้ที่นี่"
      />
    );
  }

  return (
    <div className="min-w-0">
      {histories.map((history) => {
        const changeText = positionChangeOf(history);
        const statusChanged = history.oldStatus || history.newStatus;

        return (
          <section key={history.id} className={ROW_CLASS}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-bold text-slate-900 3xl:text-[14px]">
                    {history.title}
                  </p>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 3xl:text-[12px]">
                    {workHistoryTypeText(history.type)}
                  </span>
                </div>

                {changeText ? (
                  <p className="mt-1.5 text-[13px] font-semibold text-slate-700 3xl:text-[14px]">
                    {changeText}
                  </p>
                ) : null}

                {statusChanged ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      vocabulary={EMPLOYEE_STATUS}
                      status={history.oldStatus}
                    />
                    <span className="text-slate-300">→</span>
                    <StatusBadge
                      vocabulary={EMPLOYEE_STATUS}
                      status={history.newStatus}
                    />
                  </p>
                ) : null}

                {history.description ? (
                  <p className="mt-1.5 text-[13px] leading-6 text-slate-500 3xl:text-[14px]">
                    {history.description}
                  </p>
                ) : null}

                {history.createdBy ? (
                  <p className="mt-1.5 text-[11px] text-slate-400 3xl:text-[12px]">
                    บันทึกโดย{" "}
                    {history.createdBy.displayName || history.createdBy.email}
                  </p>
                ) : null}
              </div>

              <p className="shrink-0 text-[13px] tabular-nums text-slate-500 3xl:text-[14px]">
                {dateText(history.effectiveDate)}
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* การลาออก                                                            */
/* ------------------------------------------------------------------ */

export function ResignationTab({
  resignations,
  submitting,
  onAdd,
  onChangeStatus,
}: {
  resignations: EmployeeResignationItem[];
  submitting: boolean;
  onAdd: () => void;
  onChangeStatus: (id: string, status: ResignationStatus) => void;
}) {
  if (resignations.length === 0) {
    return (
      <EmptyState
        className="m-5 sm:m-6"
        title="ยังไม่มีข้อมูลการลาออก"
        description="บันทึกใบลาออกไว้ที่นี่เพื่อให้สถานะพนักงานและงานพ้นสภาพเดินต่อได้"
        action={
          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={onAdd}
          >
            บันทึกการลาออก
          </Button>
        }
      />
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
        <p className="text-[12px] text-slate-500 3xl:text-[13px]">
          ใบลาออก {resignations.length.toLocaleString("th-TH")} รายการ
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={onAdd}
        >
          บันทึกการลาออก
        </Button>
      </div>

      {resignations.map((item) => (
        <section key={item.id} className={ROW_CLASS}>
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge
                  vocabulary={RESIGNATION_STATUS_VOCABULARY}
                  status={item.status}
                />
                <p className="text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                  มีผล {dateText(item.effectiveDate)}
                </p>
                <p className="text-[12px] text-slate-400 3xl:text-[13px]">
                  ยื่นเมื่อ {dateText(item.resignationDate)}
                </p>
              </div>

              <InfoGrid columns={2} className="mt-3.5">
                <InfoItem label="เหตุผล" value={textOf(item.reason)} />
                <InfoItem label="หมายเหตุ" value={textOf(item.note)} />
              </InfoGrid>
            </div>

            {item.status === "SUBMITTED" ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={submitting}
                  onClick={() => onChangeStatus(item.id, "APPROVED")}
                >
                  อนุมัติ
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={submitting}
                  onClick={() => onChangeStatus(item.id, "REJECTED")}
                >
                  ไม่อนุมัติ
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => onChangeStatus(item.id, "CANCELLED")}
                >
                  ยกเลิก
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
