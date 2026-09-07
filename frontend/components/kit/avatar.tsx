"use client";

import { useState } from "react";

import { joinClassName } from "@/components/ui/class-name";

/**
 * รูปประจำตัว
 * -----------
 * รายชื่อคนที่ยาว ๆ อ่านยากถ้ามีแต่ตัวอักษร วงกลมนี้ช่วยให้กวาดตาหาคนได้เร็วขึ้น
 *
 * มีรูปจริง (`src`) ก็แสดงรูป ไม่มีก็ย่อชื่อเป็นตัวอักษร
 * สีของวงย่อชื่อสุ่มจากชื่อแบบคงที่ (ชื่อเดิมได้สีเดิมเสมอ) และเลือกเฉพาะเฉดในตระกูล
 * ฟ้า-คราม เพื่อไม่ให้หลุดจากโทนของทั้งโซน
 *
 * รูปที่โหลดไม่ขึ้น (ไฟล์หาย/สิทธิ์ไม่ถึง) จะตกกลับมาเป็นตัวย่อให้เอง
 * ไม่ปล่อยให้เป็นไอคอนรูปแตกในตาราง
 */

const PALETTE = [
  "bg-brand-600 text-white",
  "bg-sky-500 text-white",
  "bg-indigo-500 text-white",
  "bg-cyan-600 text-white",
  "bg-slate-500 text-white",
];

function hash(value: string) {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) % 100000;
  }
  return total;
}

/** ตัวย่อ: ภาษาไทยใช้อักษรแรกของสองคำแรก ภาษาอังกฤษใช้อักษรแรกของชื่อ-นามสกุล */
function initials(name: string) {
  const words = name
    .replace(/^(นาย|นาง|นางสาว|น\.ส\.|ดร\.|Mr\.|Ms\.|Mrs\.)\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0]}${words[1][0]}`;
}

export function Avatar({
  name,
  src,
  size = "md",
  tone = "solid",
}: {
  name: string;
  /** รูปจริงของคนนี้ — ส่งผ่าน `getPublicFileUrl()` มาแล้ว ("" ถือว่าไม่มีรูป) */
  src?: string | null;
  /** `xl` ใช้กับหัวเรื่องของหน้ารายละเอียดคน ให้สมดุลกับชื่อขนาด 2xl */
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * `soft` = เทาอ่อน ใช้เมื่อวงย่อชื่อไม่ใช่จุดนำสายตาของบริเวณนั้น
   * เช่นแถบบนสุดที่มีวงเดียว — วงสีทึบจะกลายเป็นสิ่งที่เด่นที่สุดบนหน้าจอทันที
   */
  tone?: "solid" | "soft";
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const sizeClass = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-9 w-9 text-[12px]",
    lg: "h-11 w-11 text-[13px]",
    // ให้สูงพอ ๆ กับบล็อกชื่อ+คำอธิบาย+ป้าย ที่อยู่ข้าง ๆ กัน
    xl: "h-20 w-20 text-[26px] 3xl:h-24 3xl:w-24 3xl:text-[30px]",
  }[size];

  if (src && !imageFailed) {
    return (
      // next/image ใช้ไม่ได้ รูปมาจากโดเมนของ API ที่เปลี่ยนได้ตามสภาพแวดล้อม
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        onError={() => setImageFailed(true)}
        className={joinClassName(
          "shrink-0 rounded-full object-cover",
          sizeClass,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={joinClassName(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold",
        sizeClass,
        tone === "soft"
          ? "bg-slate-100 text-slate-600"
          : PALETTE[hash(name) % PALETTE.length],
      )}
    >
      {initials(name)}
    </span>
  );
}
