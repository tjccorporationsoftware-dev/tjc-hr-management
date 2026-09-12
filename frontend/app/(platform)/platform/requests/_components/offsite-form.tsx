"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";

import { createOffsiteWorkRequest } from "@/lib/api";
import { getErrorMessage } from "@/lib/use-api";
import type { EmployeeListItem } from "@/types/employee";

import {
  cn,
  EvidencePicker,
  Field,
  FormActions,
  INPUT_CLASS,
  minutesFromTime,
  TEXTAREA_CLASS,
  todayISODate,
} from "./shared";

/*
 * ฟอร์มยื่นคำขอทำงานนอกสถานที่แทนพนักงาน
 * --------------------------------------
 * ใบนี้เรียบที่สุด: วัน + ช่วงเวลา + เหตุผล และรูปประกอบ (ไม่บังคับ)
 * รูปของใบนี้ไม่ได้เก็บเป็นไฟล์แยก แต่ฝังเป็น data URL ใน attachmentUrl
 * ตามที่ ESS ทำอยู่ — หลังบ้านรับได้ถึง 5 MB จึงกันไฟล์ใหญ่ตั้งแต่ฝั่งนี้
 * และสร้างพร้อมส่งได้เลยในคำขอเดียว (submit: true)
 */

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // base64 พองราว 33% → ยังต่ำกว่าเพดาน 5 MB

type OffsiteFormState = {
  workDate: string;
  startTime: string;
  endTime: string;
  reason: string;
};

function defaultForm(): OffsiteFormState {
  return {
    workDate: todayISODate(),
    startTime: "08:00",
    endTime: "17:00",
    reason: "",
  };
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

export function OffsiteForm({
  employee,
  onSaved,
}: {
  employee: EmployeeListItem;
  onSaved: () => void;
}) {
  // mount ใหม่ด้วย key={employee.id} จากหน้าแม่ → เปลี่ยนคนแล้วฟอร์มว่างเสมอ
  const [form, setForm] = useState<OffsiteFormState>(defaultForm);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);

  function update<K extends keyof OffsiteFormState>(key: K, value: OffsiteFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    if (!form.workDate) return "กรุณาเลือกวันที่";
    const start = minutesFromTime(form.startTime);
    const end = minutesFromTime(form.endTime);
    if (start === null || end === null) return "กรุณาระบุช่วงเวลา";
    if (end <= start) return "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม";
    if (!form.reason.trim()) return "กรุณาระบุเหตุผล / สถานที่ที่ไปทำงาน";
    if (evidenceFile && evidenceFile.size > MAX_IMAGE_BYTES) {
      return "รูปประกอบต้องไม่เกิน 3 MB";
    }
    return "";
  }

  async function save(shouldSubmit: boolean) {
    const message = validate();
    if (message) {
      toast.error(message);
      return;
    }

    setSaving(shouldSubmit ? "submit" : "draft");
    try {
      const attachmentUrl = evidenceFile ? await readAsDataUrl(evidenceFile) : undefined;

      const created = await createOffsiteWorkRequest({
        employeeId: employee.id,
        workDate: form.workDate,
        startTime: form.startTime,
        endTime: form.endTime,
        reason: form.reason.trim(),
        attachmentUrl,
        submit: shouldSubmit,
      });

      toast.success(
        shouldSubmit
          ? `ส่งคำขอนอกสถานที่ ${created.requestNo ?? ""} เข้าคิวอนุมัติแล้ว`
          : `บันทึกร่างคำขอนอกสถานที่ ${created.requestNo ?? ""} แล้ว`,
      );
      setForm((current) => ({ ...defaultForm(), workDate: current.workDate }));
      setEvidenceFile(null);
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "บันทึกคำขอทำงานนอกสถานที่ไม่สำเร็จ"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="วันที่" required>
          <span className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={form.workDate}
              onChange={(event) => update("workDate", event.target.value)}
              className={cn(INPUT_CLASS, "pl-9")}
            />
          </span>
        </Field>
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
      </div>

      <Field label="เหตุผล / สถานที่ที่ไปทำงาน" required>
        <textarea
          rows={2}
          value={form.reason}
          onChange={(event) => update("reason", event.target.value)}
          placeholder="เช่น ออกพบลูกค้าที่โรงงาน จ.ชลบุรี"
          className={TEXTAREA_CLASS}
        />
      </Field>

      <EvidencePicker
        file={evidenceFile}
        onChange={setEvidenceFile}
        hint="ไม่บังคับ — รูปประกอบ JPG / PNG ไม่เกิน 3 MB"
      />

      <FormActions
        saving={saving}
        onSaveDraft={() => void save(false)}
        onSubmit={() => void save(true)}
      />
    </div>
  );
}
