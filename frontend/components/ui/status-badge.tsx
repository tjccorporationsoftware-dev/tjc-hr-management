import {
  statusLabel,
  statusToneClass,
  type StatusMeta,
} from "@/lib/status-labels";

import { joinClassName } from "./class-name";

/**
 * badge สถานะตัวเดียวของทั้งระบบ
 * เดิมมี EssStatusBadge / HrStatusBadge / EmployeeStatusBadge /
 * PayrollStatusBadge ที่โครงเหมือนกันหมด ต่างแค่คลังคำที่ใช้แปล
 */
export function StatusBadge({
  vocabulary,
  status,
}: {
  vocabulary: Record<string, StatusMeta>;
  status?: string | null;
}) {
  return (
    <span
      className={joinClassName(
        /*
         * whitespace-nowrap สำคัญ — คำสถานะเป็นคำเดียวที่อ่านรวดเดียว
         * ถ้าปล่อยให้ตัดบรรทัดจะกลายเป็น "ปฏิบัติ / งาน" ซึ่งอ่านสะดุด
         * และทำให้ความสูงแถวในตารางไม่เท่ากันจนตารางดูรก
         * คอลัมน์แคบไปให้ขยายคอลัมน์ ไม่ใช่ปล่อยให้ป้ายหักคำ
         *
         * ขนาดตัวอักษรไล่ตามจอกว้างให้ตรงกับ Badge ใน kit
         * (display.tsx ระบุว่าสองตัวนี้ต้องรูปทรงเท่ากันเป๊ะ)
         */
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold 3xl:text-[12.5px] 4xl:text-[13px]",
        statusToneClass(vocabulary, status),
      )}
    >
      {statusLabel(vocabulary, status)}
    </span>
  );
}
