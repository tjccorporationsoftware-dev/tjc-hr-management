"use client";

import { Fingerprint, Pencil, Smartphone } from "lucide-react";

/**
 * ไอคอนบอกว่ารอยลงเวลานี้มาจากอุปกรณ์อะไร
 * ------------------------------------------
 * ระบบเก็บ `channel` ไว้ที่ตัวรอยตอกอยู่แล้ว แต่สรุปรายวันเก็บแค่ "เวลา"
 * หลังบ้านจึงส่ง `punchChannels` แนบมากับสรุปรายวันให้หน้าจอใช้
 *
 * แยกสามกลุ่มพอ ไม่ต้องแสดงชื่อ channel ดิบ เพราะคนอ่านสนใจแค่ว่า
 * "มาจากเครื่องสแกนที่บริษัท" หรือ "กดจากแอปตอนอยู่ข้างนอก" หรือ "HR แก้ให้"
 */
export type PunchChannelInfo = {
  channel?: string | null;
  source?: string | null;
} | null;

type Kind = "device" | "app" | "manual";

function resolveKind(channel?: string | null): Kind | null {
  if (!channel) return null;

  /* เครื่องสแกนนิ้วที่ตั้งอยู่หน้างาน */
  if (channel === "KIOSK" || channel === "DEVICE" || channel === "QR") {
    return "device";
  }

  /* กดผ่านแอปหรือหน้าเว็บ — ใช้ตอนออกไปทำงานข้างนอก */
  if (channel === "MOBILE" || channel === "GPS" || channel === "WEB") {
    return "app";
  }

  /* HR เพิ่มเองหรือมาจากการนำเข้าไฟล์ */
  return "manual";
}

const META: Record<Kind, { label: string; className: string }> = {
  device: { label: "เครื่องสแกนนิ้ว", className: "text-slate-400" },
  app: { label: "แอปมือถือ", className: "text-brand-500" },
  manual: { label: "บันทึกย้อนหลัง", className: "text-amber-500" },
};

export function PunchChannelIcon({
  info,
  className,
}: {
  info: PunchChannelInfo;
  className?: string;
}) {
  const kind = resolveKind(info?.channel);
  if (!kind) return null;

  const meta = META[kind];
  const Icon =
    kind === "device" ? Fingerprint : kind === "app" ? Smartphone : Pencil;

  /* ห่อด้วย span เพราะไอคอนของ lucide ไม่รับ prop title */
  return (
    <span
      title={`ลงเวลาด้วย${meta.label}`}
      aria-label={meta.label}
      className="inline-flex shrink-0 items-center"
    >
      <Icon
        aria-hidden
        className={["h-3 w-3", meta.className, className ?? ""].join(" ")}
      />
    </span>
  );
}

/** คำอธิบายไอคอน วางใต้ตารางครั้งเดียว ไม่ต้องซ้ำทุกแถว */
export function PunchChannelLegend({ className }: { className?: string }) {
  return (
    <span
      className={[
        "inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-400",
        className ?? "",
      ].join(" ")}
    >
      <span className="inline-flex items-center gap-1">
        <Fingerprint className="h-3 w-3 text-slate-400" /> เครื่องสแกนนิ้ว
      </span>
      <span className="inline-flex items-center gap-1">
        <Smartphone className="h-3 w-3 text-brand-500" /> แอปมือถือ
      </span>
      <span className="inline-flex items-center gap-1">
        <Pencil className="h-3 w-3 text-amber-500" /> บันทึกย้อนหลัง
      </span>
    </span>
  );
}
