/**
 * ตัวจัดรูปแบบที่ทุกหน้าในโซนเงินเดือนใช้ร่วมกัน
 *
 * ปีภาษีเก็บใน DB เป็น ค.ศ. แต่คนไทยอ่าน พ.ศ. จึงแปลงตรงชั้นแสดงผลที่เดียว
 * ห้ามแปลงซ้ำในหน้า ไม่งั้นจะเจอ 2569 กลายเป็น 3112
 */

export function toNumber(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

/** ตัวเลขเงิน 2 ตำแหน่ง ไม่มีคำว่า "บาท" ต่อท้าย — ให้หน้าตัดสินใจเอง */
export function money(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function count(value: number | null | undefined) {
  return toNumber(value).toLocaleString("th-TH");
}

/** สัดส่วนที่เก็บเป็น 0.05 → "5%" ตัดศูนย์ท้ายทิ้ง */
export function percentFromRate(value: string | number | null | undefined) {
  return `${Number((toNumber(value) * 100).toFixed(2))}%`;
}

export function dateText(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function dateTimeText(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** รับได้ทั้ง ค.ศ. และ พ.ศ. คืนเป็น ค.ศ. เสมอ */
export function toIsoYear(value: string | number | null | undefined) {
  const year = Number(value);
  if (!Number.isFinite(year) || year <= 0) return null;
  return year >= 2400 ? year - 543 : year;
}

export function toBuddhistYear(value: string | number | null | undefined) {
  const isoYear = toIsoYear(value);
  return isoYear ? isoYear + 543 : null;
}

export function taxYearLabel(
  year: { taxYear?: number | null; name?: string | null } | null | undefined,
) {
  const buddhist = toBuddhistYear(year?.taxYear);
  return buddhist ? `ปีภาษี ${buddhist}` : year?.name || "-";
}

/**
 * ข้อมูลเก่าบางชุดเผลอบันทึกปีภาษีเป็น พ.ศ. ทำให้มีปีซ้ำสองรายการ
 * ตัวนี้ยุบให้เหลือรายการเดียวต่อปี โดยเลือกอันที่เก็บเป็น ค.ศ. ไว้
 */
export function dedupeTaxYears<T extends { taxYear: number }>(years: T[]) {
  const byBuddhistYear = new Map<number, T>();

  for (const year of years) {
    const buddhist = toBuddhistYear(year.taxYear);
    if (!buddhist) continue;

    const existing = byBuddhistYear.get(buddhist);
    const isCanonical = toIsoYear(year.taxYear) === Number(year.taxYear);
    const existingIsCanonical =
      existing && toIsoYear(existing.taxYear) === Number(existing.taxYear);

    if (!existing || (isCanonical && !existingIsCanonical)) {
      byBuddhistYear.set(buddhist, year);
    }
  }

  return Array.from(byBuddhistYear.entries())
    .sort(([a], [b]) => b - a)
    .map(([, year]) => year);
}

/** เพดานค่าลดหย่อนมีได้ทั้งจำนวนเงินและสัดส่วน — ตั้งทั้งคู่ได้ ระบบใช้อันที่แคบกว่า */
export function allowanceLimitText(item: {
  maxAmount?: string | null;
  maxPercentOfIncome?: string | null;
}) {
  const parts: string[] = [];
  if (item.maxAmount) parts.push(`${money(item.maxAmount)} บาท`);
  if (item.maxPercentOfIncome) {
    parts.push(`${percentFromRate(item.maxPercentOfIncome)} ของเงินได้`);
  }
  return parts.length ? parts.join(" หรือ ") : "ไม่จำกัด";
}

export function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** ดาวน์โหลด blob ที่ API ส่งกลับมา */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
