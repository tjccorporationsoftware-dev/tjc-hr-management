import { CalendarOff, Clock3, MapPinned, Timer } from "lucide-react";
import type { ComponentType } from "react";

import { queryKeys } from "@/lib/query-keys";

/*
 * ประเภทคำขอที่ยื่นแทนพนักงานได้จากหน้านี้
 * ---------------------------------------
 * permission คือสิทธิ์ "สร้าง" ของ route ฝั่ง HR แต่ละประเภท (ตรงกับ @RequirePermissions)
 * ไม่มีสิทธิ์ = ไม่โชว์แท็บ ไม่ใช่โชว์แล้วให้กดแล้วโดน 403
 */

export type RequestKind = "leave" | "overtime" | "time-adjust" | "offsite";

export type RequestKindMeta = {
  kind: RequestKind;
  label: string;
  description: string;
  permission: string;
  icon: ComponentType<{ className?: string }>;
};

export const REQUEST_KINDS: RequestKindMeta[] = [
  {
    kind: "leave",
    label: "ใบลา",
    description: "ลาป่วย ลากิจ พักร้อน ฯลฯ",
    permission: "LEAVE_CREATE",
    icon: CalendarOff,
  },
  {
    kind: "overtime",
    label: "ทำงานล่วงเวลา (OT)",
    description: "ต้องแนบรูปหลักฐานก่อนส่ง",
    permission: "OT_CREATE",
    icon: Timer,
  },
  {
    kind: "time-adjust",
    label: "แก้ไขเวลา",
    description: "ลืมสแกน / เวลาผิด / เครื่องเสีย",
    permission: "TIME_ADJUST_CREATE",
    icon: Clock3,
  },
  {
    kind: "offsite",
    label: "ทำงานนอกสถานที่",
    description: "ออกพบลูกค้า / WFH",
    permission: "OFFSITE_REQUEST_CREATE",
    icon: MapPinned,
  },
];

/** โดเมน react-query ของแต่ละประเภท — ล้างหลังบันทึก/ส่ง/ยกเลิก ให้ทุกหน้าที่เปิดค้างโหลดใหม่ */
export function requestDomainQueryKey(kind: RequestKind) {
  if (kind === "leave") return queryKeys.leave.all;
  if (kind === "overtime") return queryKeys.overtime.all;
  if (kind === "time-adjust") return queryKeys.timeAdjust.all;
  return queryKeys.offsite.all;
}
