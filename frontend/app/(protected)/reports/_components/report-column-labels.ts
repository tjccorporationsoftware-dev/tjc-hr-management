/**
 * ชื่อคอลัมน์ภาษาไทยของข้อมูลรายงาน
 * -----------------------------------------------------------------------------
 * endpoint ข้อมูลรายงานคืนแถวเป็น object ที่คีย์เป็นชื่อฟิลด์อังกฤษตรง ๆ
 * (`morningInAt`, `lateMinutes`, ...) ซึ่งเอามาขึ้นหัวตารางไม่ได้ — HR อ่านไม่รู้เรื่อง
 *
 * ที่นี่แปลงเป็นคำไทย และตัดคอลัมน์ที่ไม่ใช่ข้อมูลสำหรับคนอ่าน (id ต่าง ๆ) ทิ้ง
 * คีย์ที่ยังไม่มีคำแปลจะคืนค่าเดิม ไม่ใช่ "ไม่ทราบ" — วันที่ backend เพิ่มฟิลด์ใหม่
 * จะได้ยังเห็นว่าเป็นฟิลด์อะไร แล้วค่อยตามมาเติมคำแปล
 */

/** คอลัมน์ที่ไม่ต้องแสดง — เป็นรหัสอ้างอิงภายใน ไม่ได้มีความหมายกับคนอ่าน */
const HIDDEN_KEYS = new Set([
  "id",
  "employeeId",
  "payrollRunId",
  "companyId",
  "branchId",
  "departmentId",
  "leaveTypeId",
]);

const LABELS: Record<string, string> = {
  /* ---- ตัวตนพนักงานและสังกัด ---- */
  employeeCode: "รหัสพนักงาน",
  employeeName: "ชื่อ-นามสกุล",
  employee: "พนักงาน",
  position: "ตำแหน่ง",
  companyName: "บริษัท",
  company: "บริษัท",
  branchName: "สาขา",
  branch: "สาขา",
  departmentName: "แผนก",
  department: "แผนก",
  employeeTypeName: "ประเภทพนักงาน",
  supervisorName: "หัวหน้างาน",
  employeeStatus: "สถานะพนักงาน",
  email: "อีเมล",
  phone: "เบอร์โทร",
  startDate: "วันเริ่มงาน",
  serviceLength: "อายุงาน",
  probationEndDate: "ครบทดลองงาน",

  /* ---- การลงเวลา ---- */
  workDate: "วันที่ทำงาน",
  logClock: "เวลาที่บันทึก",
  morningInAt: "เข้างานเช้า",
  afternoonInAt: "เข้างานบ่าย",
  checkOutAt: "เวลาออกงาน",
  lateMinutes: "สาย (นาที)",
  earlyCheckoutMinutes: "ออกก่อน (นาที)",
  otMinutes: "OT (นาที)",
  dayStatus: "สถานะของวัน",
  logTypeText: "ประเภทการบันทึก",
  sessionText: "ช่วงเวลา",
  channel: "ช่องทาง",
  locationName: "สถานที่",
  deviceName: "อุปกรณ์",
  isOffsite: "ทำงานนอกสถานที่",
  logStatus: "สถานะบันทึก",

  /* ---- สรุปการมาทำงานรายเดือน ---- */
  presentDays: "มาทำงาน (วัน)",
  lateDays: "มาสาย (วัน)",
  leaveDays: "ลา (วัน)",
  absentDays: "ขาดงาน (วัน)",
  missingDays: "ลืมลงเวลา (วัน)",
  holidayDays: "วันหยุด (วัน)",

  /* ---- การลา ---- */
  requestNo: "เลขที่ใบลา",
  leaveTypeName: "ประเภทการลา",
  leaveType: "ประเภทการลา",
  leavePaid: "ได้รับค่าจ้าง",
  endDate: "ถึงวันที่",
  dayTypeText: "ลักษณะการลา",
  totalDays: "จำนวนวัน",
  reason: "เหตุผล",
  leaveStatus: "สถานะใบลา",
  submittedAt: "วันที่ยื่น",
  year: "ปี",
  entitledDays: "สิทธิ์ (วัน)",
  usedDays: "ใช้ไป (วัน)",
  pendingDays: "รออนุมัติ (วัน)",
  remainingDays: "คงเหลือ (วัน)",

  /* ---- เงินเดือนและประกันสังคม ---- */
  baseSalary: "เงินเดือนฐาน",
  approvedOtCount: "ใบ OT ที่อนุมัติ",
  approvedOtHours: "ชั่วโมง OT",
  estimatedOtAmount: "ค่า OT โดยประมาณ",
  estimatedGrossAmount: "ยอดรวมโดยประมาณ",
  payrollRunNo: "เลขที่รอบ",
  periodCode: "รหัสงวด",
  periodName: "ชื่องวด",
  periodEndDate: "วันสิ้นงวด",
  socialSecurityBase: "ฐานคำนวณประกันสังคม",
  employeeContribution: "เงินสมทบลูกจ้าง",
  employerContribution: "เงินสมทบนายจ้าง",
  note: "หมายเหตุ",
};

/** ควรแสดงคอลัมน์นี้ไหม */
export function isVisibleReportColumn(key: string) {
  return !HIDDEN_KEYS.has(key);
}

/**
 * ชื่อคอลัมน์ภาษาไทย
 *
 * `d1`–`d31` คือช่องรายวันของรายงานสถานะการมาทำงาน — หัวคอลัมน์เป็นเลขวันที่
 * ล้วน ๆ เพราะมี 31 ช่องเรียงกัน ใส่คำนำหน้าจะดันตารางกว้างจนอ่านช่องอื่นไม่ได้
 * (เดิมใช้ "ว.15" ซึ่งไม่มีใครเดาออกว่าย่อมาจากอะไร)
 */
export function reportColumnLabel(key: string) {
  const dayMatch = /^d(\d{1,2})$/.exec(key);
  if (dayMatch) return dayMatch[1];

  return LABELS[key] ?? key;
}

/** คอลัมน์นี้เป็นช่องรายวันของรายงานสถานะการมาทำงานหรือไม่ */
export function isDayColumn(key: string) {
  return /^d\d{1,2}$/.test(key);
}

/**
 * ความหมายของตัวอักษรในช่องรายวัน
 * -----------------------------------------------------------------------------
 * รายงานสถานะการมาทำงานใส่มาเป็นอักษรตัวเดียวเพื่อให้ปฏิทินทั้งเดือนพอดีหน้ากระดาษ
 * ซึ่งอ่านเองไม่ได้ถ้าไม่มีคำอธิบาย — หน้ารายงานจึงต้องโชว์ตารางแปลไว้ข้าง ๆ ด้วย
 * (ดูรหัสจริงที่ `reports.service.ts` ตรงที่ประกอบ `row[d..]`)
 */
export const DAY_CODE_LEGEND: Array<{ code: string; label: string }> = [
  { code: "P", label: "มาทำงานปกติ" },
  { code: "L", label: "มาสาย" },
  { code: "O", label: "ลา" },
  { code: "A", label: "ขาดงาน" },
  { code: "M", label: "ลืมลงเวลา" },
  { code: "H", label: "วันหยุด / ไม่มีกะ" },
];

const DAY_CODE_TEXT = new Map(
  DAY_CODE_LEGEND.map((item) => [item.code, item.label]),
);

/** คำเต็มของรหัสรายวัน — ใช้เป็น title ให้เอาเมาส์ชี้แล้วรู้ความหมาย */
export function dayCodeLabel(code: string) {
  return DAY_CODE_TEXT.get(code.trim().toUpperCase()) ?? null;
}

/* ---------------------------------------------------------------
   การแบ่งโซนของรายงานสถานะการมาทำงาน
   ---------------------------------------------------------------
   รายงานนี้ปล่อยคอลัมน์ออกมา 43 ช่อง (ตัวตน 6 + สรุป 6 + ปฏิทิน 31)
   ถ้าเรียงต่อกันรวดเดียว พอเลื่อนไปดูปฏิทินชื่อคนจะหลุดออกนอกจอ
   จึงจัดเป็นสามโซนให้อ่านออกว่ากำลังดูอะไรอยู่
   --------------------------------------------------------------- */

export type ReportColumnZone = "identity" | "calendar" | "summary";

/** คอลัมน์สรุปจำนวนวันของรายงานสถานะการมาทำงาน */
const SUMMARY_KEYS = new Set([
  "presentDays",
  "lateDays",
  "leaveDays",
  "absentDays",
  "missingDays",
  "holidayDays",
]);

export function reportColumnZone(key: string): ReportColumnZone {
  if (isDayColumn(key)) return "calendar";
  if (SUMMARY_KEYS.has(key)) return "summary";
  return "identity";
}

export const REPORT_ZONE_LABEL: Record<ReportColumnZone, string> = {
  identity: "พนักงาน",
  calendar: "ปฏิทินรายวัน",
  summary: "สรุปจำนวนวัน",
};

/**
 * จัดคอลัมน์เข้าโซนโดยคงลำดับเดิมไว้
 * คืนเฉพาะโซนที่มีคอลัมน์จริง เพื่อไม่ให้รายงานอื่นที่ไม่มีปฏิทินขึ้นหัวโซนเปล่า
 */
export function groupReportColumns(keys: string[]) {
  const order: ReportColumnZone[] = ["identity", "calendar", "summary"];

  return order
    .map((zone) => ({
      zone,
      label: REPORT_ZONE_LABEL[zone],
      keys: keys.filter((key) => reportColumnZone(key) === zone),
    }))
    .filter((group) => group.keys.length > 0);
}

/**
 * คอลัมน์ที่ตรึงไว้ซ้ายมือของรายงานแบบปฏิทิน
 *
 * ตรึงแค่รหัสพนักงานไม่พอ เพราะเลข 6 หลักบอกไม่ได้ว่าเป็นใคร ต้องมีชื่อติดไปด้วย
 * ความกว้างต้องกำหนดตายตัว เพราะคอลัมน์ที่สองต้องรู้ว่าจะเริ่มตรงไหน (left offset)
 */
export const STICKY_COLUMNS: Array<{
  key: string;
  width: string;
  left: string;
}> = [
  { key: "employeeCode", width: "w-[92px] min-w-[92px]", left: "left-0" },
  {
    key: "employeeName",
    width: "w-[150px] min-w-[150px]",
    left: "left-[92px]",
  },
];

export function stickyColumn(key: string) {
  return STICKY_COLUMNS.find((column) => column.key === key) ?? null;
}

/** คอลัมน์สุดท้ายที่ตรึง — ใช้ตีเส้นแบ่งกับส่วนที่เลื่อนได้ */
export const LAST_STICKY_KEY = STICKY_COLUMNS[STICKY_COLUMNS.length - 1].key;

/**
 * คอลัมน์ข้อความยาวที่ต้องคุมความกว้าง
 *
 * ชื่อบริษัทและสาขาซ้ำค่าเดิมทุกแถวแต่กินความกว้างเกือบครึ่งจอ ดันปฏิทินตกขอบ
 * จึงตัดด้วย ellipsis แล้วเก็บข้อความเต็มไว้ใน title ให้เอาเมาส์ชี้อ่านได้
 */
const WIDE_TEXT_KEYS = new Set([
  "position",
  "companyName",
  "company",
  "branchName",
  "branch",
  "departmentName",
  "department",
]);

export function isWideTextColumn(key: string) {
  return WIDE_TEXT_KEYS.has(key);
}

/**
 * สีประจำรหัสรายวัน
 *
 * ปฏิทิน 31 ช่องที่เป็นตัวอักษรล้วนต้องอ่านทีละช่อง กว่าจะเห็นว่าใครขาดงานบ่อย
 * ก็ไล่สายตาจนครบเดือน ใส่สีพื้นแล้วรูปแบบการขาด/สายจะเด้งขึ้นมาเองตั้งแต่มองแวบแรก
 * เลือกโทนให้ "ปกติ" จางที่สุดและ "ขาดงาน" เข้มสุด เพราะสิ่งที่ต้องสะดุดตาคือความผิดปกติ
 */
export const DAY_CODE_STYLE: Record<string, string> = {
  P: "bg-slate-50 text-slate-500",
  L: "bg-amber-100 text-amber-800",
  O: "bg-sky-100 text-sky-800",
  A: "bg-rose-200 text-rose-900",
  M: "bg-violet-100 text-violet-800",
  H: "bg-white text-slate-300",
};

export function dayCodeStyle(code: string) {
  return DAY_CODE_STYLE[code.trim().toUpperCase()] ?? "text-slate-700";
}

/**
 * ค่าที่เอาไปแสดงในเซลล์
 * บางคอลัมน์ (เช่น `employee`, `company` ของรายงานโควตาวันลา) เป็น object
 * ทั้งก้อน ถ้าปล่อยเป็น JSON ดิบจะอ่านไม่ออก จึงดึงชื่อที่คนใช้เรียกออกมาแทน
 */
export function reportCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";

  if (typeof value === "string") {
    const thaiDate = toThaiDateText(value);
    return thaiDate ?? value;
  }

  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  const name =
    record.displayName ??
    record.nameTh ??
    record.name ??
    [record.firstName, record.lastName].filter(Boolean).join(" ").trim();

  if (typeof name === "string" && name) {
    // มีรหัสกำกับด้วยจะได้แยกคนชื่อซ้ำออกจากกัน
    const code = record.employeeCode ?? record.code;
    return typeof code === "string" && code ? `${code} · ${name}` : name;
  }

  return JSON.stringify(value);
}

/**
 * แปลงค่าที่เป็นวันที่แบบ ISO ให้เป็นวันที่ไทย
 * -----------------------------------------------------------------------------
 * ตรวจจากรูปแบบของค่า ไม่ใช่จากชื่อคอลัมน์ เพราะรายงานแต่ละตัวตั้งชื่อฟิลด์วันที่
 * ไม่เหมือนกัน (workDate / startDate / submittedAt / periodEndDate / logClock)
 * และรายงานใหม่ที่เพิ่มมาทีหลังจะได้ถูกแปลงให้เองโดยไม่ต้องมาไล่เติมรายชื่อ
 *
 * คืน null เมื่อไม่ใช่วันที่ ผู้เรียกจะได้ใช้ค่าเดิมต่อ
 */
function toThaiDateText(value: string): string | null {
  const isPlainDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const isDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);

  if (!isPlainDate && !isDateTime) return null;

  /*
   * ฟิลด์ "วันที่ล้วน" อย่าง workDate / startDate ถูกเก็บเป็นเที่ยงคืน UTC
   * ถ้าอ่านด้วยเวลาเครื่อง (ไทย +7) จะกลายเป็น 07:00 ของวันเดิม แล้วโชว์เวลา
   * ติดมาด้วยทั้งที่ไม่มีความหมาย — จึงเช็คจากตัวสตริงว่าเป็นเที่ยงคืน UTC ไหม
   * แล้วอ่านส่วนวัน/เดือน/ปีจากฝั่ง UTC ตรง ๆ วันที่จะได้ไม่เลื่อน
   */
  const isUtcMidnight = /T00:00:00(\.000)?Z$/.test(value);

  if (isPlainDate || isUtcMidnight) {
    const date = new Date(isPlainDate ? `${value}T00:00:00Z` : value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleDateString("th-TH", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
