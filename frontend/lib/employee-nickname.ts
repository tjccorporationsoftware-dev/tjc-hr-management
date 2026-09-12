/**
 * ต่อชื่อเล่นท้ายชื่อพนักงานให้ทุกหน้าในคราวเดียว
 * ------------------------------------------------
 * ผู้ใช้เรียกพนักงานด้วยชื่อเล่นกันทั้งบริษัท (ตาล, เบลล์, แทมมี่) ชื่อเต็มอย่างเดียว
 * ดูแล้วนึกไม่ออกว่าใคร ทุกรายชื่อบนหน้าเว็บจึงต้องเป็น "นางสาว สุภาพร สองเมือง (ตาล)"
 *
 * ทำที่ชั้น API client จุดเดียว แทนการไล่แก้ 60+ หน้า: ทุก response ที่ผ่าน apiFetch
 * ถ้าเจอ object ที่มีหน้าตาเป็นพนักงาน (มี employeeCode + displayName + nickname)
 * จะเปลี่ยน displayName เป็นแบบมีชื่อเล่น และเก็บของเดิมไว้ที่ displayNameRaw
 *
 * ทำไมไม่ทำที่ backend: คอลัมน์ displayName ถูกเอกสารทางการใช้ตรง ๆ (สลิป, ภ.ง.ด.,
 * สปส., ไฟล์โอนเงิน) ชื่อเล่นห้ามหลุดไปอยู่ในนั้น backend จึงส่งชื่อดิบมาเสมอ
 *
 * ข้อควรระวัง: ฟอร์มที่แก้ displayName แล้วส่งกลับ ต้องอ่านจาก displayNameRaw
 * (ฝั่ง backend มีตัวตัด " (ชื่อเล่น)" ทิ้งกันไว้อีกชั้น เผื่อหลุด)
 */

const MAX_DEPTH = 12;

type EmployeeLike = {
  employeeCode?: unknown;
  displayName?: unknown;
  nickname?: unknown;
  displayNameRaw?: unknown;
};

/** ชื่อที่โชว์ = ชื่อดิบ + " (ชื่อเล่น)" ถ้ามีชื่อเล่นและยังไม่ได้ต่อไว้ */
export function withNickname(
  displayName: string | null | undefined,
  nickname: string | null | undefined,
) {
  const name = (displayName ?? "").trim();
  const nick = (nickname ?? "").trim();
  if (!name) return name;
  if (!nick) return name;
  return name.endsWith(`(${nick})`) ? name : `${name} (${nick})`;
}

/*
 * มี nickname + displayName คู่กัน = พนักงาน (โมเดล User ไม่มี nickname จึงไม่โดน)
 * ไม่บังคับ employeeCode เพราะบาง select ดึงมาแค่ชื่อ เช่น กล่องแจ้งเตือน/แดชบอร์ด
 */
function looksLikeEmployee(value: EmployeeLike) {
  return (
    typeof value.displayName === "string" &&
    typeof value.nickname === "string" &&
    value.nickname.trim() !== ""
  );
}

/**
 * เดินทั้ง payload แล้วต่อชื่อเล่นให้ในที่ (mutate) — response เป็น JSON ล้วน ไม่มีวงวน
 * จำกัดความลึกกันเหนียว และข้ามค่าที่ไม่ใช่ object ธรรมดา
 */
export function decorateEmployeeNames<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    for (const item of value) decorateEmployeeNames(item, depth + 1);
    return value;
  }

  const record = value as Record<string, unknown>;
  if (looksLikeEmployee(record as EmployeeLike)) {
    const raw = record.displayName as string;
    if (record.displayNameRaw === undefined) record.displayNameRaw = raw;
    record.displayName = withNickname(raw, record.nickname as string);
  }

  for (const key of Object.keys(record)) {
    const child = record[key];
    if (child !== null && typeof child === "object") {
      decorateEmployeeNames(child, depth + 1);
    }
  }

  return value;
}
