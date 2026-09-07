const THAI_BUDDHIST_YEAR_OFFSET = 543;
const DATE_DISPLAY_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateLike = string | Date | null | undefined;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function isValidDate(date: Date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function toChristianYear(year: number) {
  return year >= 2400 ? year - THAI_BUDDHIST_YEAR_OFFSET : year;
}

function toBuddhistYear(year: number) {
  return year + THAI_BUDDHIST_YEAR_OFFSET;
}

function buildLocalDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function parseDateValue(value: DateLike): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  const text = String(value).trim();
  if (!text) return null;

  const displayMatch = DATE_DISPLAY_PATTERN.exec(text);
  if (displayMatch) {
    const day = Number(displayMatch[1]);
    const month = Number(displayMatch[2]);
    const year = toChristianYear(Number(displayMatch[3]));

    return buildLocalDate(year, month, day);
  }

  const isoDateMatch = ISO_DATE_PATTERN.exec(text);
  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const month = Number(isoDateMatch[2]);
    const day = Number(isoDateMatch[3]);

    return buildLocalDate(year, month, day);
  }

  const date = new Date(text);

  return isValidDate(date) ? date : null;
}

export function formatThaiDate(value?: DateLike): string {
  const date = parseDateValue(value);
  if (!date) return "-";

  return `${pad2(date.getDate())}/${pad2(
    date.getMonth() + 1,
  )}/${toBuddhistYear(date.getFullYear())}`;
}

export function formatThaiTime(value?: DateLike): string {
  const date = parseDateValue(value);
  if (!date) return "-";

  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatThaiDateTime(value?: DateLike): string {
  const date = parseDateValue(value);
  if (!date) return "-";

  return `${formatThaiDate(date)} ${formatThaiTime(date)}`;
}

export function formatDateInputValue(value?: DateLike): string {
  const date = parseDateValue(value);
  if (!date) return "";

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

export function parseDisplayDateToIso(value: string): string | null {
  const text = String(value ?? "").trim();
  const match = DATE_DISPLAY_PATTERN.exec(text);

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = toChristianYear(Number(match[3]));
  const date = buildLocalDate(year, month, day);

  if (!date) return null;

  return formatDateInputValue(date);
}

export function formatIsoDateToDisplay(value?: DateLike): string {
  return formatThaiDate(value);
}

export function isDisplayDate(value: string) {
  return Boolean(parseDisplayDateToIso(value));
}