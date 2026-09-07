/**
 * อีเมลต้องเก็บและเทียบด้วยรูปแบบเดียวทั้งระบบ
 *
 * ที่มา: มีบัญชีที่กรอกอีเมลตอนแป้นพิมพ์ยังเป็นภาษาไทย ได้วรรณยุกต์ติดมาหน้าอีเมล
 * (`๋j@gmail.com`) แล้วเจ้าตัวล็อกอินด้วย `j@gmail.com` ไม่ได้ตลอดไป เพราะการค้นหา
 * ตอนล็อกอินเทียบตรงตัวเป๊ะ อักขระที่มองแทบไม่เห็นตัวเดียวก็ทำให้เข้าระบบไม่ได้แล้ว
 *
 * เรื่องพิมพ์เล็กพิมพ์ใหญ่ก็พังแบบเดียวกัน — สมัครด้วย `H@gmail.com`
 * แล้วพิมพ์ `h@gmail.com` ตอนเข้าระบบ ก็ไม่เจอบัญชี
 */

/** ตัดช่องว่างหัวท้ายและแปลงเป็นพิมพ์เล็ก — ใช้ทั้งตอนบันทึกและตอนค้นหา */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** เหมือน normalizeEmail แต่ปล่อยค่าว่าง/undefined ผ่านไปตามเดิม */
export function normalizeOptionalEmail(
  email: string | null | undefined,
): string | null | undefined {
  if (email === null || email === undefined) return email;

  const normalized = normalizeEmail(email);
  return normalized.length > 0 ? normalized : null;
}

/**
 * ชื่ออีเมล (ส่วนหน้า @) ต้องเป็น ASCII เท่านั้น
 *
 * class-validator เปิด allow_utf8_local_part ไว้เป็นค่าเริ่มต้น อักษรไทยจึงผ่านฉลุย
 * ในทางปฏิบัติผู้ให้บริการอีเมลแทบไม่มีใครรองรับ ปล่อยผ่านมีแต่จะได้อีเมลที่ส่งไม่ถึง
 */
export function hasNonAsciiLocalPart(email: string): boolean {
  const localPart = email.split('@')[0] ?? '';
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(localPart);
}
