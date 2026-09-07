import { formatThaiDate } from "@/lib/date-format";
import type { Tone } from "@/components/kit";

/**
 * ตัวช่วยแสดงผลของหน้าศูนย์เอกสารและสถิติ
 * -----------------------------------------------------------------------------
 * เหลือเฉพาะที่ยังใช้จริงหลังรื้อหน้าใหม่ — ตัวช่วยของตารางข้อมูลรายงาน
 * (ดึงชื่อพนักงาน จัดคอลัมน์ แปลงค่าเซลล์) ถูกลบไปพร้อมแท็บนั้น
 */

export function dateText(value?: string | null) {
  return formatThaiDate(value);
}

/** โทนสีของรูปแบบไฟล์ — JSON ไม่มีสีเฉพาะใน kit จึงใช้ neutral */
export function formatTone(format: string): Tone {
  if (format === "XLSX") return "positive";
  if (format === "CSV") return "brand";
  if (format === "JSON") return "neutral";
  return "critical";
}

/**
 * ข้อความผิดพลาดที่เอาไปโชว์ได้จริง
 * Error จาก API มีข้อความไทยติดมาแล้ว ส่วนกรณีอื่นใช้ข้อความสำรองที่ผู้เรียกกำหนด
 */
export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
