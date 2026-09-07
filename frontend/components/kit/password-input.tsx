"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

import { joinClassName } from "@/components/ui/class-name";
import { CONTROL_BASE } from "./tokens";

/**
 * ช่องรหัสผ่าน — มีปุ่มเปิดดูสิ่งที่พิมพ์
 * ====================================
 * แยกไฟล์จาก `form.tsx` เพราะตัวนี้ต้องจำสถานะเปิด/ปิด จึงต้องเป็น client component
 * ส่วน `form.tsx` มีหน้าที่เป็น server component เรียกใช้ได้อยู่หลายหน้า
 *
 * ที่ต้องมีปุ่มดู เพราะช่องรหัสผ่านของระบบนี้ส่วนใหญ่คือ "ตั้งรหัสให้คนอื่น"
 * (เปิดบัญชีใหม่ · รีเซ็ตรหัสให้พนักงาน) ซึ่งคนตั้งต้องอ่านออกเพื่อจดไปบอกเจ้าตัว
 * ไม่ใช่ช่องล็อกอินของตัวเองที่พิมพ์ผิดแล้วลองใหม่ได้
 *
 * ปุ่มเป็น `tabIndex={-1}` — กด Tab จากช่องรหัสผ่านต้องไปช่องถัดไป ไม่ใช่มาติดที่ปุ่ม
 */
export function PasswordInput({
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? "text" : "password"}
        className={joinClassName(CONTROL_BASE, "pr-10", className)}
      />

      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        title={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
