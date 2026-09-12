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
  title?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  displayName?: unknown;
  nickname?: unknown;
  displayNameRaw?: unknown;
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

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
  if (str(value.nickname) === "") return false;
  /* displayName อาจว่างได้ (มี 2 คนที่หลุดมาว่าง) — ถ้ามีชื่อ/สกุลให้ประกอบเองแทน */
  return (
    typeof value.displayName === "string" ||
    str(value.firstName) !== "" ||
    str(value.lastName) !== ""
  );
}

/** ชื่อดิบ: displayName ถ้ามี ไม่งั้นประกอบ คำนำหน้า ชื่อ สกุล */
function rawName(value: EmployeeLike) {
  const display = str(value.displayName);
  if (display) return display;
  return [str(value.title), str(value.firstName), str(value.lastName)]
    .filter(Boolean)
    .join(" ");
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
    const raw = rawName(record as EmployeeLike);
    /* เก็บค่าเดิมของคอลัมน์ไว้เสมอ (อาจเป็น null) ฟอร์มแก้ไขต้องได้ค่านี้ ไม่ใช่ตัวที่ต่อแล้ว */
    if (record.displayNameRaw === undefined) {
      record.displayNameRaw = (record.displayName as string | null | undefined) ?? null;
    }
    if (raw) record.displayName = withNickname(raw, record.nickname as string);
  }

  for (const key of Object.keys(record)) {
    const child = record[key];
    if (child !== null && typeof child === "object") {
      decorateEmployeeNames(child, depth + 1);
    }
  }

  return value;
}
