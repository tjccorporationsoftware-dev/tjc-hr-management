"use client";

import { useState } from "react";

import { ThaiDateInput } from "@/components/common/thai-date-input";
import { Modal, ModalActions } from "@/components/kit/modal";

/**
 * กล่องถามวันที่ออกเอกสาร
 * -----------------------------------------------------------------------------
 * แบบยื่นราชการหลายใบมีช่อง "ยื่นวันที่ ___ เดือน ___ พ.ศ. ___" ซึ่งไม่ใช่วันที่
 * ของข้อมูล แต่เป็นวันที่ผู้มีอำนาจลงนาม จึงต้องถามก่อนสั่งพิมพ์ทุกครั้ง
 *
 * เลือกได้สามแบบ
 *   ไม่ระบุ         เว้นช่องว่างไว้ให้เขียนด้วยปากกาตอนเซ็น
 *   เลือกวันที่     ใช้ปฏิทิน (ค.ศ.) แล้วระบบแปลงเป็น พ.ศ. ให้เอง
 *   ระบุเอง (พ.ศ.)  พิมพ์ วัน/เดือน/ปี พ.ศ. เอง สำหรับกรณีย้อนวันที่
 *
 * ค่าที่ส่งกลับเป็น 'yyyy-MM-dd' แบบ ค.ศ. เสมอ เพื่อให้ backend มีรูปแบบเดียว
 * null = ไม่ระบุ
 *
 * ตัวเรียกต้อง mount กล่องนี้เฉพาะตอนจะเปิดเท่านั้น ค่าตั้งต้นจึงมาจากตอน mount
 * ไม่ต้องมี effect คอยรีเซ็ต และไม่มีค่าค้างจากรอบก่อน
 */

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

type Mode = "none" | "picker" | "manual";

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** จำนวนวันของเดือนนั้น กัน 31 กุมภาพันธ์ */
function daysInMonth(gregorianYear: number, month: number) {
  return new Date(gregorianYear, month, 0).getDate();
}

export function IssueDateDialog({
  documentName,
  onCancel,
  onConfirm,
}: {
  documentName: string;
  onCancel: () => void;
  onConfirm: (issueDate: string | null) => void;
}) {
  const [mode, setMode] = useState<Mode>("picker");
  const [pickedDate, setPickedDate] = useState(todayIso);
  const [manual, setManual] = useState(() => {
    const iso = todayIso();
    const [year, month, day] = iso.split("-");
    return {
      day: String(Number(day)),
      month: String(Number(month)),
      year: String(Number(year) + 543),
    };
  });

  const manualYear = Number(manual.year) - 543;
  const manualMonth = Number(manual.month);
  const manualDay = Number(manual.day);

  const manualValid =
    Number.isInteger(manualYear) &&
    manualYear > 1900 &&
    manualMonth >= 1 &&
    manualMonth <= 12 &&
    manualDay >= 1 &&
    manualDay <= daysInMonth(manualYear, manualMonth);

  const canConfirm =
    mode === "none" ||
    (mode === "picker" && Boolean(pickedDate)) ||
    (mode === "manual" && manualValid);

  function confirm() {
    if (mode === "none") {
      onConfirm(null);
      return;
    }

    if (mode === "picker") {
      onConfirm(pickedDate);
      return;
    }

    const month = String(manualMonth).padStart(2, "0");
    const day = String(manualDay).padStart(2, "0");
    onConfirm(`${manualYear}-${month}-${day}`);
  }

  return (
    <Modal
      open
      title={`ระบุวันออกเอกสาร ${documentName}`}
      description="วันที่นี้จะพิมพ์ลงช่อง “ยื่นวันที่” ของแบบฟอร์ม ไม่เกี่ยวกับช่วงข้อมูลในเอกสาร"
      size="sm"
      onClose={onCancel}
      footer={
        <ModalActions
          onCancel={onCancel}
          onConfirm={confirm}
          confirmLabel="ตกลง"
          disabled={!canConfirm}
        />
      }
    >
      <div className="space-y-4 text-sm">
        <Choice
          checked={mode === "none"}
          onChange={() => setMode("none")}
          label="ไม่ระบุ"
          hint="เว้นช่องวันที่ไว้ เขียนด้วยปากกาตอนเซ็น"
        />

        <div className="space-y-3">
          <Choice
            checked={mode !== "none"}
            onChange={() => setMode("picker")}
            label="ระบุ"
          />

          <div className="ml-6 space-y-3 border-l border-slate-200 pl-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Choice
                checked={mode === "picker"}
                onChange={() => setMode("picker")}
                label="เลือกวันที่"
              />
              <Choice
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
                label="ระบุเอง (พ.ศ.)"
              />
            </div>

            {mode === "manual" ? (
              <div className="flex flex-wrap items-end gap-2">
                <ManualField
                  label="วัน"
                  value={manual.day}
                  width="w-16"
                  onChange={(day) => setManual((prev) => ({ ...prev, day }))}
                />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">เดือน</span>
                  <select
                    value={manual.month}
                    onChange={(event) =>
                      setManual((prev) => ({
                        ...prev,
                        month: event.target.value,
                      }))
                    }
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
                  >
                    {THAI_MONTHS.map((name, index) => (
                      <option key={name} value={index + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <ManualField
                  label="ปี พ.ศ."
                  value={manual.year}
                  width="w-24"
                  onChange={(year) => setManual((prev) => ({ ...prev, year }))}
                />
              </div>
            ) : (
              <ThaiDateInput
                value={pickedDate}
                disabled={mode !== "picker"}
                onChange={(event) => setPickedDate(event.target.value)}
              />
            )}

            {mode === "manual" && !manualValid ? (
              <p className="text-xs text-rose-600">
                วันที่ไม่ถูกต้อง — ตรวจวันกับเดือนอีกครั้ง
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Choice({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 accent-sky-600"
      />
      <span>
        <span className="text-slate-700">{label}</span>
        {hint ? (
          <span className="block text-xs text-slate-500">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

function ManualField({
  label,
  value,
  width,
  onChange,
}: {
  label: string;
  value: string;
  width: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 4))
        }
        className={`h-9 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm text-slate-700 focus:border-sky-400 focus:outline-none ${width}`}
      />
    </div>
  );
}
