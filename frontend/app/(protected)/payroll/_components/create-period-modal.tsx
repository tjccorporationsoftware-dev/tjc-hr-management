"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import {
  Modal,
  ModalActions,
  TextInput,
  joinClassName,
} from "@/components/kit";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { createPayrollPeriod, getCompanyPayrollSetting } from "@/lib/api";
import { dateText, errorText } from "@/lib/payroll-format";
import {
  DEFAULT_PAYROLL_CUTOFF_POLICY,
  buildPayrollPeriodRangeForMonth,
  type PayrollCutoffPolicy,
} from "@/lib/payroll-period-range";
import type { PayrollPeriod } from "@/types/payroll";
import type { CompanyPayrollSetting } from "@/types/system-settings";

import { THAI_MONTHS } from "./period-format";

/**
 * สร้างงวดเงินเดือน
 * -----------------
 * ผู้ใช้เลือกแค่เดือนกับปี ช่วงวันที่ที่เหลือระบบเติมให้ตามวันตัดรอบที่ตั้งไว้
 * ของบริษัทนั้น (ตั้งค่า > เงินเดือน) เพราะถ้าปล่อยให้กรอกเอง งวดจะเพี้ยนจาก
 * นโยบายที่ใช้ดึงเวลาทำงานและการลา แล้วยอดจะไม่ตรงกับที่ HR ตรวจไว้
 *
 * ยังแก้วันที่เองได้อยู่ เผื่อบางเดือนต้องเลื่อนจ่ายเป็นกรณีพิเศษ
 */

function policyOf(setting?: CompanyPayrollSetting | null): PayrollCutoffPolicy {
  return {
    payrollPeriodStartDay:
      setting?.payrollPeriodStartDay ??
      DEFAULT_PAYROLL_CUTOFF_POLICY.payrollPeriodStartDay,
    payrollCutoffDay:
      setting?.payrollCutoffDay ??
      DEFAULT_PAYROLL_CUTOFF_POLICY.payrollCutoffDay,
  };
}

/** วันที่ของงวดตามนโยบาย — วันจ่ายตั้งต้นเป็นวันสิ้นสุดงวด แก้ทีหลังได้ */
function datesFromPolicy(
  year: number,
  month: number,
  setting?: CompanyPayrollSetting | null,
) {
  const range = buildPayrollPeriodRangeForMonth(year, month, policyOf(setting));

  return {
    startDate: range.dateFrom,
    endDate: range.dateTo,
    paymentDate: range.dateTo,
    dayCount: range.dayCount,
  };
}

/** รหัสตั้งต้นตามรูปแบบที่ระบบใช้อยู่ — PAY-<พ.ศ.>-<เดือน> */
function defaultPeriodCode(year: number, month: number) {
  return `PAY-${year + 543}-${String(month).padStart(2, "0")}`;
}

function countDays(startDate: string, endDate: string) {
  if (!startDate || !endDate || startDate > endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function CreatePeriodModal({
  open,
  companyId,
  onClose,
  onCreated,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  onCreated: (period: PayrollPeriod) => void;
}) {
  const [setting, setSetting] = useState<CompanyPayrollSetting | null>(null);
  const [loadingSetting, setLoadingSetting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [code, setCode] = useState(() => {
    const today = new Date();
    return defaultPeriodCode(today.getFullYear(), today.getMonth() + 1);
  });
  /* พิมพ์รหัสเองแล้วห้ามให้การเปลี่ยนเดือนมาเขียนทับของที่พิมพ์ไว้ */
  const [codeEdited, setCodeEdited] = useState(false);

  const applyDates = useCallback(
    (
      targetYear: number,
      targetMonth: number,
      targetSetting?: CompanyPayrollSetting | null,
    ) => {
      const dates = datesFromPolicy(targetYear, targetMonth, targetSetting);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
      setPaymentDate(dates.paymentDate);
    },
    [],
  );

  /** เปิดกล่องใหม่ทุกครั้งต้องกลับมาเป็นเดือนปัจจุบัน ไม่ใช่ค่าที่ค้างจากรอบก่อน */
  const resetToCurrentMonth = useCallback(
    (targetSetting?: CompanyPayrollSetting | null) => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;

      setYear(currentYear);
      setMonth(currentMonth);
      setCode(defaultPeriodCode(currentYear, currentMonth));
      setCodeEdited(false);
      applyDates(currentYear, currentMonth, targetSetting);
    },
    [applyDates],
  );

  /** เปิดกล่องทีไรก็ดึงค่าตั้งค่าล่าสุดของบริษัทมาใหม่ เผื่อมีคนเพิ่งแก้วันตัดรอบ */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!open || !companyId) return;

      setLoadingSetting(true);
      try {
        const result = await getCompanyPayrollSetting(companyId);
        if (cancelled) return;
        setSetting(result);
        resetToCurrentMonth(result);
      } catch {
        if (cancelled) return;
        setSetting(null);
        resetToCurrentMonth(null);
      } finally {
        if (!cancelled) setLoadingSetting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, companyId, resetToCurrentMonth]);

  function changeMonth(nextMonth: number) {
    setMonth(nextMonth);
    if (!codeEdited) setCode(defaultPeriodCode(year, nextMonth));
    applyDates(year, nextMonth, setting);
  }

  function changeYear(nextYear: number) {
    setYear(nextYear);
    if (!codeEdited) setCode(defaultPeriodCode(nextYear, month));
    applyDates(nextYear, month, setting);
  }

  const policy = policyOf(setting);
  const policyDates = datesFromPolicy(year, month, setting);
  const isPolicyDefault =
    startDate === policyDates.startDate &&
    endDate === policyDates.endDate &&
    paymentDate === policyDates.paymentDate;

  async function submit() {
    if (!companyId) return;
    if (!startDate || !endDate || !paymentDate) {
      toast.error("กรุณาระบุช่วงวันที่ของงวดให้ครบ");
      return;
    }
    if (startDate > endDate) {
      toast.error("วันเริ่มงวดต้องไม่เกินวันสิ้นสุดงวด");
      return;
    }

    const periodCode = code.trim().toUpperCase();

    if (!periodCode) {
      toast.error("กรุณาระบุรหัสงวด");
      return;
    }

    setSaving(true);
    try {
      const monthCode = String(month).padStart(2, "0");

      const created = await createPayrollPeriod({
        companyId,
        code: periodCode,
        name: `งวดเงินเดือน ${monthCode}/${year + 543}`,
        year,
        month,
        startDate,
        endDate,
        paymentDate,
        status: "OPEN",
      });

      toast.success("สร้างงวดแล้ว");
      onCreated(created);
    } catch (error) {
      toast.error(errorText(error, "สร้างงวดไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const dayCount = countDays(startDate, endDate);

  return (
    <Modal
      open={open}
      title="สร้างงวดเงินเดือน"
      description="เลือกเดือนที่จะจ่าย ระบบจะเติมช่วงวันที่ให้ตามวันตัดรอบที่ตั้งไว้ของบริษัท"
      size="md"
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void submit()}
          confirmLabel="สร้างงวด"
          loading={saving}
          disabled={loadingSetting}
        />
      }
    >
      {/*
       * กล่องเดียวแบ่งด้วยเส้น ไม่ซ้อนกล่องในกล่อง
       * แถบหัวกินเต็มความกว้างของป๊อปอัพ จึงต้องถอยขอบในของ Modal ออก
       */}
      <div className="-mx-5 -mt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-100 bg-brand-50/50 px-5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-brand-100">
            <CalendarPlus className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              งวดที่จะสร้าง
            </p>
            <p className="truncate text-[16px] font-bold text-slate-900 3xl:text-[17px]">
              {THAI_MONTHS[month - 1]} {year + 543}
            </p>
          </div>

          {/*
            ค่าที่จะถูกบันทึกจริง — เดิมมีกล่องสรุปซ้ำอีกกล่องที่ก้นฟอร์ม
            ทั้งที่เป็นค่าเดียวกับช่องวันที่ที่กรอกอยู่ข้างบนนั่นเอง
          */}
          <div className="flex shrink-0 items-center divide-x divide-brand-200/70">
            <HeadFact
              label="ช่วงงวด"
              value={`${dateText(startDate)} – ${dateText(endDate)}`}
            />
            <HeadFact label="จำนวนวัน" value={`${dayCount} วัน`} />
            <HeadFact label="วันจ่าย" value={dateText(paymentDate)} />
          </div>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/*
            เลือกเดือนจากตารางแทนรายการดรอปดาวน์ — กดครั้งเดียวได้เดือนที่ต้องการ
            และเห็นทั้งปีพร้อมกันว่าเลือกเดือนไหนอยู่
          */}
          <FormSection
            title="เดือนที่จ่าย"
            action={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeYear(year - 1)}
                  disabled={year <= years[0]}
                  aria-label="ปีก่อนหน้า"
                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-brand-50 hover:text-brand-700 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[3.5rem] text-center text-[14px] font-bold tabular-nums text-slate-900">
                  {year + 543}
                </span>
                <button
                  type="button"
                  onClick={() => changeYear(year + 1)}
                  disabled={year >= years[years.length - 1]}
                  aria-label="ปีถัดไป"
                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-brand-50 hover:text-brand-700 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {THAI_MONTHS.map((label, index) => {
                const value = index + 1;
                const active = value === month;

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => changeMonth(value)}
                    className={joinClassName(
                      "whitespace-nowrap rounded-lg border px-2 py-2 text-[12px] font-semibold transition 3xl:text-[12.5px]",
                      active
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-brand-100 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </FormSection>

          <FormSection
            title="รหัสงวด"
            hint="ใช้อ้างอิงในรายงานและเอกสารของงวดนี้ · ห้ามซ้ำกับงวดที่ยังอยู่ในระบบ"
            action={
              codeEdited ? (
                <button
                  type="button"
                  onClick={() => {
                    setCode(defaultPeriodCode(year, month));
                    setCodeEdited(false);
                  }}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  ใช้รหัสอัตโนมัติ
                </button>
              ) : null
            }
          >
            <TextInput
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setCodeEdited(true);
              }}
              placeholder={defaultPeriodCode(year, month)}
              className="uppercase"
            />
          </FormSection>

          <FormSection
            title="ช่วงวันที่ของงวด"
            hint={
              loadingSetting
                ? "กำลังอ่านการตั้งค่าของบริษัท…"
                : `เติมให้ตามวันตัดรอบที่ตั้งไว้ (วันที่ ${policy.payrollPeriodStartDay} ถึง ${policy.payrollCutoffDay})${
                    setting?.source === "COMPANY"
                      ? ""
                      : " — ค่าเริ่มต้นกลางของระบบ"
                  }`
            }
            action={
              !isPolicyDefault ? (
                <button
                  type="button"
                  onClick={() => applyDates(year, month, setting)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  คืนค่าตามการตั้งค่า
                </button>
              ) : null
            }
          >
            {/* สามวันนี้เป็นลำดับเวลาเดียวกัน วางเป็นรางให้เห็นว่าอันไหนมาก่อนหลัง */}
            <div className="relative grid gap-3 sm:grid-cols-3">
              <span className="pointer-events-none absolute left-[14%] right-[14%] top-[7px] hidden h-px bg-brand-100 sm:block" />

              <DateStep
                label="วันเริ่มงวด"
                value={startDate}
                onChange={setStartDate}
              />
              <DateStep
                label="วันสิ้นสุดงวด"
                value={endDate}
                onChange={setEndDate}
              />
              <DateStep
                label="วันที่จ่ายเงิน"
                value={paymentDate}
                onChange={setPaymentDate}
                emphasis
              />
            </div>
          </FormSection>
        </div>
      </div>
    </Modal>
  );
}

/** ค่าหนึ่งช่องบนแถบหัว */
function HeadFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-500">
        {label}
      </p>
      <p className="whitespace-nowrap text-[12.5px] font-bold tabular-nums text-slate-900 3xl:text-[13px]">
        {value}
      </p>
    </div>
  );
}

/** วันหนึ่งวันบนรางลำดับเวลาของงวด */
function DateStep({
  label,
  value,
  onChange,
  emphasis = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  emphasis?: boolean;
}) {
  return (
    <div className="relative">
      <div className="mb-1.5 flex h-4 items-center gap-1.5">
        <span
          className={joinClassName(
            "h-2 w-2 shrink-0 rounded-full ring-4 ring-white",
            emphasis ? "bg-brand-600" : "bg-brand-300",
          )}
        />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
          {label}
        </span>
      </div>
      <ThaiDateInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
    </div>
  );
}

/** หัวข้อย่อยในฟอร์ม — ป้ายฟ้าคั่นด้วยเส้นบาง แทนการครอบเป็นกล่อง */
function FormSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-brand-100 pb-1.5">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            {title}
          </p>
          {hint ? (
            <p className="mt-0.5 text-[11.5px] text-slate-400">{hint}</p>
          ) : null}
        </div>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}
