"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Button, Modal, Notice, Toggle } from "@/components/kit";

/**
 * Modal กลางของหน้านโยบายการทำงาน
 * ทุกฟอร์ม (เพิ่ม/แก้ไข) ของ 3 panel ใช้ตัวนี้ทั้งหมด เพื่อให้หน้าตาและพฤติกรรมเหมือนกัน
 *
 * ตัวกล่องยืมมาจาก `Modal` ของชุด kit — ปิดด้วย Esc/คลิกฉากหลัง ล็อกการเลื่อนพื้นหลัง
 * และหน้าตาตรงกับป๊อปอัพอื่นทั้งระบบ ที่นี่เหลือแค่ห่อฟอร์มกับปุ่มบันทึก
 */

export function PolicyModal({
  open,
  title,
  description,
  chips,
  saving,
  submitLabel = "บันทึก",
  submitDisabled,
  error,
  size = "md",
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** ไม่ได้ใช้แล้ว — คงไว้ให้ panel เดิมเรียกได้โดยไม่ต้องแก้ */
  icon?: LucideIcon;
  chips?: ReactNode;
  saving?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
  error?: string | null;
  size?: "md" | "lg";
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      size={size}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            loading={saving}
            disabled={submitDisabled}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="space-y-5"
      >
        {/* ชิปบอกขอบเขตที่กำลังตั้งค่า — เป็นบริบท ไม่ใช่เนื้อหา จึงอยู่บนสุดตัวเล็ก */}
        {chips ? (
          <div className="-mx-5 -mt-4 flex flex-wrap items-center gap-1.5 border-b border-brand-100 bg-brand-50/50 px-5 py-2.5">
            {chips}
          </div>
        ) : null}

        {children}

        {error ? <Notice tone="critical">{error}</Notice> : null}

        {/* ปุ่มจริงอยู่ท้ายกล่อง ตัวนี้ไว้ให้กด Enter ในฟอร์มแล้วบันทึกได้ */}
        <button
          type="submit"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </form>
    </Modal>
  );
}

/**
 * ช่องกรอกในฟอร์มนโยบาย — ใช้ค่าเดียวกับ control ของชุด kit
 *
 * แยกตัวที่ไม่มี `w-full` ไว้ด้วย เพราะช่องแคบ ๆ ในตาราง (เช่น 14/16 หน่วย)
 * ถ้าใช้ตัวที่มี `w-full` แล้วค่อยใส่ `w-14` ทับ จะไม่ชนะ (คลาสความกว้างชั้นเดียวกัน)
 * แล้วช่องจะยืดเต็มคอลัมน์จนตกบรรทัด
 */
const CONTROL_BASE =
  "h-9 3xl:h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] 3xl:text-[13.5px] text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export const modalInputClass = `${CONTROL_BASE} w-full`;

/** ใช้กับช่องแคบในตาราง — กำหนดความกว้างเองได้ */
export const modalInputCompactClass = CONTROL_BASE;

export function ModalField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12.5px] font-medium text-slate-600 3xl:text-[13px]">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11.5px] leading-5 text-slate-400 3xl:text-[12px]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function ModalToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="border-b border-brand-50 last:border-b-0">
      <Toggle
        label={label}
        hint={description}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

export function ModalSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      {/* ป้ายฟ้าคั่นด้วยเส้นบาง ไม่ครอบเป็นกล่อง — ป๊อปอัพเป็นผืนเดียวเหมือนหน้าอื่น */}
      <div className="mb-2 border-b border-brand-100 pb-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {title}
        </p>
        {hint ? (
          <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
            {hint}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
