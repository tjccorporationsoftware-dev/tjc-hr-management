import { redirect } from "next/navigation";

/**
 * ยุบไปรวมกับศูนย์รายงานแล้ว
 * หน้าเดิมทำสิ่งเดียวกับ /reports ทุกอย่าง แต่รองรับรายงานน้อยกว่า (4 จาก 8 ชนิด)
 * และการสร้าง/ดาวน์โหลดไฟล์ก็อยู่ในตัวดูรายงานของ /reports อยู่แล้ว
 */
export default function RedirectPage() {
  redirect("/reports");
}
