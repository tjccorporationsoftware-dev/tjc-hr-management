export type PayrollCutoffPolicy = {
  payrollPeriodStartDay?: number | null;
  payrollCutoffDay?: number | null;
};

export type PayrollPeriodRange = {
  dateFrom: string;
  dateTo: string;
  dayCount: number;
  payrollYear: number;
  payrollMonth: number;
  periodStartDay: number;
  cutoffDay: number;
};

export type NormalizedPayrollCutoffPolicy = {
  payrollPeriodStartDay: number;
  payrollCutoffDay: number;
};

export const DEFAULT_PAYROLL_CUTOFF_POLICY: NormalizedPayrollCutoffPolicy = {
  payrollPeriodStartDay: 26,
  payrollCutoffDay: 25,
};

const DAY_MS = 86_400_000;

function normalizeDay(value: number | null | undefined, fallback: number) {
  const day = Number(value);
  if (!Number.isFinite(day)) return fallback;
  return Math.min(Math.max(Math.trunc(day), 1), 31);
}

export function normalizePayrollCutoffPolicy(
  policy?: PayrollCutoffPolicy | null,
): NormalizedPayrollCutoffPolicy {
  return {
    payrollPeriodStartDay: normalizeDay(
      policy?.payrollPeriodStartDay,
      DEFAULT_PAYROLL_CUTOFF_POLICY.payrollPeriodStartDay,
    ),
    payrollCutoffDay: normalizeDay(
      policy?.payrollCutoffDay,
      DEFAULT_PAYROLL_CUTOFF_POLICY.payrollCutoffDay,
    ),
  };
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function createClampedDate(year: number, monthIndex: number, day: number) {
  return new Date(
    year,
    monthIndex,
    Math.min(day, new Date(year, monthIndex + 1, 0).getDate()),
  );
}

function toYearMonth(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function countDateInputDaysInclusive(dateFrom: string, dateTo: string) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return 0;
  const start = parseDateInputValue(dateFrom);
  const end = parseDateInputValue(dateTo);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / DAY_MS) + 1;
}

export function buildPayrollPeriodRangeForMonth(
  year: number,
  month: number,
  policy?: PayrollCutoffPolicy | null,
): PayrollPeriodRange {
  const normalizedPolicy = normalizePayrollCutoffPolicy(policy);
  const { year: payrollYear, month: payrollMonth } = toYearMonth(year, month);
  const crossesMonth =
    normalizedPolicy.payrollPeriodStartDay > normalizedPolicy.payrollCutoffDay;
  const startMonthIndex = payrollMonth - 1 - (crossesMonth ? 1 : 0);
  const endMonthIndex = payrollMonth - 1;
  const startDate = createClampedDate(
    payrollYear,
    startMonthIndex,
    normalizedPolicy.payrollPeriodStartDay,
  );
  const endDate = createClampedDate(
    payrollYear,
    endMonthIndex,
    normalizedPolicy.payrollCutoffDay,
  );
  const dateFrom = formatDateInputValue(startDate);
  const dateTo = formatDateInputValue(endDate);

  return {
    dateFrom,
    dateTo,
    dayCount: countDateInputDaysInclusive(dateFrom, dateTo),
    payrollYear,
    payrollMonth,
    periodStartDay: normalizedPolicy.payrollPeriodStartDay,
    cutoffDay: normalizedPolicy.payrollCutoffDay,
  };
}

export function buildCurrentPayrollPeriodRange(
  policy?: PayrollCutoffPolicy | null,
  baseDate = new Date(),
): PayrollPeriodRange {
  const baseYear = baseDate.getFullYear();
  const baseMonth = baseDate.getMonth() + 1;
  const baseKey = formatDateInputValue(baseDate);
  const candidates = [-1, 0, 1].map((offset) =>
    buildPayrollPeriodRangeForMonth(baseYear, baseMonth + offset, policy),
  );

  return (
    candidates.find(
      (range) => range.dateFrom <= baseKey && baseKey <= range.dateTo,
    ) || candidates[1]
  );
}

export function shiftPayrollPeriodRange(
  dateFrom: string,
  offset: number,
  policy?: PayrollCutoffPolicy | null,
): PayrollPeriodRange {
  const normalizedPolicy = normalizePayrollCutoffPolicy(policy);
  const start = parseDateInputValue(dateFrom);
  const crossesMonth =
    normalizedPolicy.payrollPeriodStartDay > normalizedPolicy.payrollCutoffDay;
  const targetMonth = start.getMonth() + 1 + (crossesMonth ? 1 : 0) + offset;

  return buildPayrollPeriodRangeForMonth(
    start.getFullYear(),
    targetMonth,
    normalizedPolicy,
  );
}

export function toDateInputKey(value?: string | Date | null) {
  if (!value) return "";
  if (value instanceof Date) return formatDateInputValue(value);
  return String(value).slice(0, 10);
}

export function buildPayrollPolicyLabel(policy?: PayrollCutoffPolicy | null) {
  const normalizedPolicy = normalizePayrollCutoffPolicy(policy);
  return `${normalizedPolicy.payrollPeriodStartDay}-${normalizedPolicy.payrollCutoffDay}`;
}
