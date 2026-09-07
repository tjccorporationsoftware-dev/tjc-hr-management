import type { AppTheme } from '@/theme/theme.types';

/**
 * สีสำหรับกราฟ — ผ่านตัวตรวจแล้ว ห้ามแก้ค่าโดยไม่รันซ้ำ
 *
 * ## ทำไมไม่ใช้สีจาก theme ตรง ๆ
 *
 * สี UI ถูกเลือกมาให้เป็นพื้นหลัง ขอบ และตัวอักษร ไม่ได้เลือกมาให้ **แยกออกจากกัน
 * เมื่อวางติดกันเป็นแท่งสี** ซึ่งเป็นคนละโจทย์ ปาเลตต์ชุดนี้ถูกวัดด้วยเครื่องมือ
 * (OKLab ΔE จำลองตาบอดสี + WCAG contrast กับพื้นจริงของแอป) ไม่ได้เลือกด้วยสายตา
 *
 * ผลการตรวจ (สล็อต 1–5 กับพื้น #ffffff / #131c2e):
 *   - แถบความสว่าง ผ่านทั้งสองโหมด
 *   - ความอิ่มสีขั้นต่ำ ผ่าน
 *   - แยกกันได้เมื่อตาบอดสี ΔE 9.1 (light) / 8.4 (dark) — เกณฑ์ ≥ 8
 *   - แยกกันได้ด้วยตาปกติ ΔE 19.6 / 19.3 — เกณฑ์ ≥ 15
 *   - contrast: โหมดสว่างมีสามสล็อตต่ำกว่า 3:1
 *     → **กฎชดเชย: ต้องมีตัวเลข/ป้ายกำกับที่อ่านได้เสมอ ห้ามใช้สีสื่อความหมายลำพัง**
 *
 * สล็อต 1 ใช้สีแบรนด์ของแอปเอง (brand-600 / brand-500) เพื่อให้กราฟเป็น
 * ผลิตภัณฑ์เดียวกับส่วนอื่น — brand-400 ที่ UI ใช้ในโหมดมืดสว่างเกินแถบที่กำหนด
 * จึงต้องลดขั้นลงมาเฉพาะในกราฟ
 */

/** ลำดับสล็อตคงที่ ห้ามสลับและห้ามวนใช้ซ้ำเมื่อ series เกิน */
const CATEGORICAL_LIGHT = [
  '#2563eb',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
] as const;

const CATEGORICAL_DARK = [
  '#3b82f6',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
] as const;

export const MAX_SERIES = CATEGORICAL_LIGHT.length;

/**
 * สีของ series ตามลำดับสล็อต
 *
 * สีผูกกับ "ตัวตนของข้อมูล" ไม่ใช่อันดับ — ถ้ากรองรายการออกแล้วสีที่เหลือ
 * เปลี่ยนตาม คนที่จำได้ว่า "ค่าล่วงเวลาเป็นสีส้ม" จะอ่านผิดทันที
 * ผู้เรียกจึงต้องส่ง index ที่คงที่ต่อรายการ ไม่ใช่ index ของแถวปัจจุบัน
 */
export function seriesColor(theme: AppTheme, slot: number): string {
  const scale = theme.dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;

  return scale[slot % scale.length]!;
}

/**
 * ไล่เฉดสีเดียวสำหรับ "มากคือเข้ม" — ใช้กับขนาด ไม่ใช่กับตัวตน
 * ยกจากสเกลแบรนด์ของแอปทั้งชุด
 */
const SEQUENTIAL_LIGHT = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb'];
const SEQUENTIAL_DARK = ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'];

export function sequentialColor(
  theme: AppTheme,
  value: number,
  max: number,
): string {
  const scale = theme.dark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT;

  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return scale[0]!;
  }

  const ratio = Math.min(Math.max(value / max, 0), 1);

  return scale[Math.min(Math.round(ratio * (scale.length - 1)), scale.length - 1)]!;
}

/**
 * สีสถานะ — ใช้ตอนสีสื่อ "ดี/เตือน/แย่" ไม่ใช่ตอนสีสื่อ "อันไหนเป็นอันไหน"
 *
 * ยืมจาก theme ของแอปโดยตั้งใจ เพื่อให้กราฟกับ Badge/InlineNotice บนจอเดียวกัน
 * พูดภาษาสีเดียวกัน — **สีสถานะต้องมาคู่กับไอคอนหรือข้อความเสมอ ห้ามใช้สีลำพัง**
 */
export function statusColor(
  theme: AppTheme,
  status: 'good' | 'warning' | 'critical' | 'neutral',
): string {
  return {
    critical: theme.colors.danger,
    good: theme.colors.success,
    neutral: theme.colors.textSubtle,
    warning: theme.colors.warning,
  }[status];
}

/** เส้นตารางและแกน — จางกว่าพื้นหนึ่งขั้น เส้นทึบเสมอ ห้ามเส้นประ */
export function gridColor(theme: AppTheme): string {
  return theme.colors.border;
}
