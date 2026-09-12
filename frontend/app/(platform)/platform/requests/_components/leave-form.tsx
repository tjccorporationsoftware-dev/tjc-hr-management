"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createLeaveRequest,
  getLeaveBalances,
  getLeaveTypes,
  submitLeaveRequest,
  uploadLeaveAttachment,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiQuery } from "@/lib/use-api";
import type { EmployeeListItem } from "@/types/employee";
import type { CreateLeaveRequestForm, LeaveDayType } from "@/types/leave";

import {
  buildAttachmentFormData,
  cn,
  EvidencePicker,
  Field,
  FormActions,
  INPUT_CLASS,
  minutesFromTime,
  num,
  ON_BEHALF_NOTE,
  PillOption,
  TEXTAREA_CLASS,
  todayISODate,
} from "./shared";

/*
 * ฟอร์มยื่นใบลาแทนพนักงาน
 * ------------------------
 * กติกาเดียวกับที่พนักงานยื่นเองใน ESS (leave-panel) — ประเภทลาไหนลาครึ่งวัน/รายชั่วโมง/
 * ย้อนหลังได้ ตามที่ตั้งไว้ในประเภทลา และหลักฐานที่ต้องแนบ
 * ต่างกันแค่ระบุ employeeId ไปด้วย และใช้ route ฝั่ง HR (/leaves/requests)
 *
 * ลำดับตอนส่ง: สร้างร่าง → แนบรูป (ถ้ามี) → ส่งเข้าคิว
 * เพราะรูปแนบได้ต่อเมื่อมีใบอยู่แล้ว
 */

const FULL_DAY_MINUTES = 8 * 60;

const DAY_TYPE_OPTIONS: Array<{ value: LeaveDayType; label: string }> = [
  { value: "FULL_DAY", label: "เต็มวัน" },
  { value: "HALF_DAY_MORNING", label: "ครึ่งวันเช้า" },
  { value: "HALF_DAY_AFTERNOON", label: "ครึ่งวันบ่าย" },
  { value: "HOURLY", label: "รายชั่วโมง" },
];

type LeaveFormState = {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  dayType: LeaveDayType;
  startTime: string;
  endTime: string;
  reason: string;
  retroactiveReason: string;
  contactInfo: string;
  note: string;
};

function defaultForm(): LeaveFormState {
  const today = todayISODate();
  return {
    leaveTypeId: "",
    startDate: today,
    endDate: today,
    dayType: "FULL_DAY",
    startTime: "09:00",
    endTime: "12:00",
    reason: "",
    retroactiveReason: "",
    contactInfo: "",
    note: ON_BEHALF_NOTE,
  };
}

function dayDiffInclusive(start: string, end: string) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

function isSingleDayType(dayType: LeaveDayType) {
  return dayType !== "FULL_DAY";
}

export function LeaveForm({
  employee,
  onSaved,
}: {
  employee: EmployeeListItem;
  onSaved: () => void;
}) {
  /*
   * ฟอร์มถูก mount ใหม่ด้วย key={employee.id} จากหน้าแม่
   * เปลี่ยนคน = ฟอร์มว่างเสมอ กันเผลอเอาเหตุผลของคนก่อนไปยื่นให้คนถัดไป
   */
  const [form, setForm] = useState<LeaveFormState>(defaultForm);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);

  /* ประเภทลาของบริษัท + สิทธิ์คงเหลือของพนักงานคนนี้ (ปีของวันที่เริ่มลา) */
  const balanceYear = Number(form.startDate.slice(0, 4)) || new Date().getFullYear();

  const leaveTypesQuery = useApiQuery(
    queryKeys.leave.types({ companyId: employee.companyId, status: "ACTIVE" }),
    () => getLeaveTypes({ companyId: employee.companyId, status: "ACTIVE" }),
    { staleTime: 60_000 },
  );
  const balancesQuery = useApiQuery(
    queryKeys.leave.balances({ employeeId: employee.id, year: balanceYear }),
    () => getLeaveBalances({ employeeId: employee.id, year: balanceYear, pageSize: 100 }),
  );

  const leaveTypes = useMemo(
    () => (Array.isArray(leaveTypesQuery.data) ? leaveTypesQuery.data : []),
    [leaveTypesQuery.data],
  );
  const balances = useMemo(
    () => balancesQuery.data?.items ?? [],
    [balancesQuery.data],
  );
  const loadingMeta = leaveTypesQuery.isPending;

  // ยังไม่ได้เลือก (หรือเลือกไว้แล้วรายการนั้นหายไป) → ใช้ประเภทแรกของบริษัท
  const leaveTypeId =
    form.leaveTypeId && leaveTypes.some((item) => item.id === form.leaveTypeId)
      ? form.leaveTypeId
      : (leaveTypes[0]?.id ?? "");

  const selectedType = useMemo(
    () => leaveTypes.find((item) => item.id === leaveTypeId) ?? null,
    [leaveTypes, leaveTypeId],
  );
  const selectedBalance = useMemo(
    () => balances.find((item) => item.leaveTypeId === leaveTypeId) ?? null,
    [balances, leaveTypeId],
  );

  const isRetroactive = Boolean(form.startDate && form.startDate < todayISODate());
  const hourlyAllowed = selectedType?.allowHourly ?? false;
  const halfDayAllowed = selectedType?.allowHalfDay ?? false;
  const backdatedAllowed = selectedType?.allowBackdated ?? false;

  const estimate = useMemo(() => {
    if (form.dayType === "HOURLY") {
      const start = minutesFromTime(form.startTime);
      const end = minutesFromTime(form.endTime);
      const totalMinutes =
        start !== null && end !== null && end > start ? end - start : 0;
      return {
        totalDays: totalMinutes / FULL_DAY_MINUTES,
        label:
          totalMinutes > 0
            ? `${totalMinutes} นาที (≈ ${num(totalMinutes / FULL_DAY_MINUTES)} วัน)`
            : "รอระบุช่วงเวลา",
      };
    }
    if (form.dayType === "HALF_DAY_MORNING" || form.dayType === "HALF_DAY_AFTERNOON") {
      return { totalDays: 0.5, label: "0.5 วัน" };
    }
    const days = dayDiffInclusive(form.startDate, form.endDate);
    return {
      totalDays: days,
      label: days > 0 ? `${days} วัน (นับตามปฏิทิน ระบบจะตัดวันหยุดให้ตามนโยบาย)` : "รอระบุวันที่",
    };
  }, [form.dayType, form.startDate, form.endDate, form.startTime, form.endTime]);

  const attachmentRequiredAfterDays = Number(
    selectedType?.attachmentRequiredAfterDays ?? 0,
  );
  const attachmentRequired = Boolean(
    selectedType?.requiresAttachment ||
      (isRetroactive && selectedType?.backdatedRequiresAttachment) ||
      (attachmentRequiredAfterDays > 0 &&
        estimate.totalDays >= attachmentRequiredAfterDays),
  );

  function update<K extends keyof LeaveFormState>(key: K, value: LeaveFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setDayType(dayType: LeaveDayType) {
    setForm((current) => ({
      ...current,
      dayType,
      endDate: isSingleDayType(dayType) ? current.startDate : current.endDate,
    }));
  }

  function validate(shouldSubmit: boolean) {
    if (!leaveTypeId) return "กรุณาเลือกประเภทการลา";
    if (!form.startDate || !form.endDate) return "กรุณาระบุวันที่เริ่มและสิ้นสุด";
    if (form.endDate < form.startDate) return "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม";
    if (!form.reason.trim()) return "กรุณาระบุเหตุผลการลา";

    if (form.dayType === "HOURLY") {
      if (!hourlyAllowed) return "ประเภทลานี้ไม่อนุญาตให้ลารายชั่วโมง";
      if (form.startDate !== form.endDate) return "ลารายชั่วโมงต้องเป็นวันเดียวกัน";
      const start = minutesFromTime(form.startTime);
      const end = minutesFromTime(form.endTime);
      if (start === null || end === null || end <= start) {
        return "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ถูกต้อง";
      }
    }

    if (
      (form.dayType === "HALF_DAY_MORNING" || form.dayType === "HALF_DAY_AFTERNOON") &&
      !halfDayAllowed
    ) {
      return "ประเภทลานี้ไม่อนุญาตให้ลาครึ่งวัน";
    }

    if (isRetroactive) {
      if (!backdatedAllowed) return "ประเภทลานี้ไม่อนุญาตให้ลาย้อนหลัง";
      if (shouldSubmit && !form.retroactiveReason.trim()) {
        return "กรุณาระบุเหตุผลการลาย้อนหลัง";
      }
    }

    if (shouldSubmit && attachmentRequired && !evidenceFile) {
      return "ประเภทลานี้ต้องแนบรูปหลักฐานก่อนส่งเข้าคิวอนุมัติ";
    }

    return "";
  }

  async function save(shouldSubmit: boolean) {
    const message = validate(shouldSubmit);
    if (message) {
      toast.error(message);
      return;
    }

    setSaving(shouldSubmit ? "submit" : "draft");
    try {
      const payload: CreateLeaveRequestForm = {
        employeeId: employee.id,
        leaveTypeId: leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        dayType: form.dayType,
        reason: form.reason.trim(),
        contactInfo: form.contactInfo.trim() || undefined,
        note: form.note.trim() || undefined,
        submit: false,
      };
      if (form.dayType === "HOURLY") {
        payload.startTime = form.startTime;
        payload.endTime = form.endTime;
      }
      if (isRetroactive) {
        payload.retroactiveReason = form.retroactiveReason.trim() || undefined;
      }

      const created = await createLeaveRequest(payload);

      if (evidenceFile) {
        await uploadLeaveAttachment(
          created.id,
          buildAttachmentFormData(evidenceFile, "หลักฐานประกอบใบลา", form.reason),
        );
      }

      if (shouldSubmit) {
        try {
          await submitLeaveRequest(created.id);
        } catch (submitError) {
          // ใบถูกสร้างเป็นร่างแล้ว บอกให้ชัดว่าค้างอยู่ตรงไหน จะได้ไม่สร้างซ้ำ
          toast.warning(
            `บันทึกร่างใบลา ${created.requestNo ?? ""} แล้ว แต่ส่งเข้าคิวไม่สำเร็จ: ${getErrorMessage(
              submitError,
              "ส่งไม่สำเร็จ",
            )}`,
          );
          onSaved();
          return;
        }
      }

      toast.success(
        shouldSubmit
          ? `ส่งใบลา ${created.requestNo ?? ""} เข้าคิวอนุมัติแล้ว`
          : `บันทึกร่างใบลา ${created.requestNo ?? ""} แล้ว`,
      );
      setForm((current) => ({ ...defaultForm(), leaveTypeId: current.leaveTypeId }));
      setEvidenceFile(null);
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "บันทึกใบลาไม่สำเร็จ"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* ประเภทลา + สิทธิ์คงเหลือ */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <Field label="ประเภทการลา" required>
          <span className="relative">
            {loadingMeta ? (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-500" />
            ) : null}
            <select
              value={leaveTypeId}
              onChange={(event) => update("leaveTypeId", event.target.value)}
              disabled={loadingMeta || leaveTypes.length === 0}
              className={INPUT_CLASS}
            >
              {leaveTypes.length === 0 ? (
                <option value="">
                  {loadingMeta
                    ? "กำลังโหลด..."
                    : leaveTypesQuery.isError
                      ? "โหลดประเภทการลาไม่สำเร็จ"
                      : "บริษัทนี้ยังไม่มีประเภทการลาที่เปิดใช้"}
                </option>
              ) : null}
              {leaveTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.nameTh} ({type.code})
                  {type.isPaid ? "" : " · ไม่ได้รับค่าจ้าง"}
                </option>
              ))}
            </select>
          </span>
        </Field>

        <div className="flex min-w-44 flex-col justify-end">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2.5">
            <div className="text-[11px] font-semibold text-slate-500">
              สิทธิ์คงเหลือ ปี {balanceYear}
            </div>
            {selectedBalance ? (
              <div className="text-sm text-slate-800">
                <span className="text-lg font-extrabold text-violet-700">
                  {num(selectedBalance.remainingDays)}
                </span>{" "}
                / {num(selectedBalance.totalAvailableBeforeUsed)} วัน
                {Number(selectedBalance.pendingDays ?? 0) > 0 ? (
                  <span className="ml-1 text-[11px] text-amber-600">
                    (รออนุมัติ {num(selectedBalance.pendingDays)})
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                {selectedType?.deductQuota === false
                  ? "ประเภทนี้ไม่ตัดโควตา"
                  : "ยังไม่มีข้อมูลโควตา"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* รูปแบบวันลา */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-slate-500">รูปแบบการลา</span>
        <div className="flex flex-wrap gap-2">
          {DAY_TYPE_OPTIONS.map((option) => {
            const disabled =
              (option.value === "HOURLY" && !hourlyAllowed) ||
              ((option.value === "HALF_DAY_MORNING" ||
                option.value === "HALF_DAY_AFTERNOON") &&
                !halfDayAllowed);
            return (
              <PillOption
                key={option.value}
                active={form.dayType === option.value}
                disabled={disabled}
                title={disabled ? "ประเภทลานี้ไม่เปิดรูปแบบนี้" : undefined}
                onClick={() => setDayType(option.value)}
              >
                {option.label}
              </PillOption>
            );
          })}
        </div>
      </div>

      {/* วันที่ / เวลา */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="วันที่เริ่ม" required>
          <span className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => {
                const value = event.target.value;
                setForm((current) => ({
                  ...current,
                  startDate: value,
                  endDate:
                    isSingleDayType(current.dayType) || current.endDate < value
                      ? value
                      : current.endDate,
                }));
              }}
              className={cn(INPUT_CLASS, "pl-9")}
            />
          </span>
        </Field>
        <Field label="วันที่สิ้นสุด" required>
          <span className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={form.endDate}
              min={form.startDate || undefined}
              disabled={isSingleDayType(form.dayType)}
              onChange={(event) => update("endDate", event.target.value)}
              className={cn(INPUT_CLASS, "pl-9")}
            />
          </span>
        </Field>
        {form.dayType === "HOURLY" ? (
          <>
            <Field label="เวลาเริ่ม" required>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => update("startTime", event.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="เวลาสิ้นสุด" required>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => update("endTime", event.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
          </>
        ) : (
          <div className="flex flex-col justify-end sm:col-span-2">
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-2.5 text-sm text-slate-600">
              รวม <span className="font-bold text-slate-900">{estimate.label}</span>
            </div>
          </div>
        )}
      </div>

      {isRetroactive ? (
        <div
          className={cn(
            "space-y-2 rounded-2xl border px-4 py-3",
            backdatedAllowed
              ? "border-amber-200 bg-amber-50/60"
              : "border-rose-200 bg-rose-50/60",
          )}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            {backdatedAllowed
              ? "เป็นการลาย้อนหลัง ต้องระบุเหตุผลเพิ่มเติม"
              : "ประเภทลานี้ไม่อนุญาตให้ลาย้อนหลัง"}
          </div>
          {backdatedAllowed ? (
            <input
              type="text"
              value={form.retroactiveReason}
              placeholder="เหตุผลที่ยื่นย้อนหลัง เช่น ป่วยกะทันหัน แจ้งทางโทรศัพท์แล้ว"
              onChange={(event) => update("retroactiveReason", event.target.value)}
              className={INPUT_CLASS}
            />
          ) : null}
        </div>
      ) : null}

      {/* เหตุผล / ติดต่อ / หมายเหตุ */}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="เหตุผลการลา" required className="md:col-span-2">
          <textarea
            rows={2}
            value={form.reason}
            onChange={(event) => update("reason", event.target.value)}
            placeholder="ระบุเหตุผลที่พนักงานแจ้งมา"
            className={TEXTAREA_CLASS}
          />
        </Field>
        <Field label="ช่องทางติดต่อระหว่างลา">
          <input
            type="text"
            value={form.contactInfo}
            onChange={(event) => update("contactInfo", event.target.value)}
            placeholder="เบอร์โทร / LINE"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="หมายเหตุถึงผู้อนุมัติ">
          <input
            type="text"
            value={form.note}
            onChange={(event) => update("note", event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <EvidencePicker
        file={evidenceFile}
        onChange={setEvidenceFile}
        required={attachmentRequired}
        hint={
          attachmentRequired
            ? "ประเภทลานี้ต้องมีหลักฐาน (เช่น ใบรับรองแพทย์) รองรับ JPG / PNG ไม่เกิน 10 MB"
            : "ไม่บังคับ — รองรับ JPG / PNG ไม่เกิน 10 MB"
        }
      />

      <FormActions
        saving={saving}
        disabled={loadingMeta || !leaveTypeId}
        onSaveDraft={() => void save(false)}
        onSubmit={() => void save(true)}
      />
    </div>
  );
}
