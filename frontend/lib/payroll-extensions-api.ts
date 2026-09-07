import { apiFetch, apiFetchWithMeta } from "@/lib/api";
import type {
  AttendancePayrollRule,
  AttendancePayrollRuleListSummary,
  CreateAttendancePayrollRulePayload,
  CreateEmployeeCompensationItemPayload,
  CreatePayrollAdjustmentPayload,
  EmployeeCompensationItem,
  EmployeeCompensationItemListSummary,
  PaginatedResponse,
  PayrollAdjustment,
  PayrollAdjustmentListSummary,
  PayrollComponent,
  PayrollEmployee,
  PayrollExtensionListParams,
  PayrollPeriod,
  UpdateAttendancePayrollRulePayload,
  UpdateEmployeeCompensationItemPayload,
  UpdatePayrollAdjustmentPayload,
} from "@/types/payroll-extensions";

/**
 * Payroll Extensions API
 * ------------------------------------------------------------
 * แยก API ของส่วนเสริม Payroll ออกจาก lib/api.ts หลัก
 * เพื่อไม่ให้ไฟล์ api.ts เดิมยาวขึ้นเรื่อย ๆ
 */


const defaultMeta = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
};

function normalizePaginatedResponse<T, S = unknown>(payload: { data: T[] | { items?: T[]; data?: T[]; meta?: typeof defaultMeta; summary?: S } | null | undefined; meta?: typeof defaultMeta; summary?: S }): PaginatedResponse<T, S> {
  const data = payload.data;
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
        ? data.data
        : [];

  const meta = payload.meta || (!Array.isArray(data) ? data?.meta : undefined) || {
    ...defaultMeta,
    pageSize: items.length || defaultMeta.pageSize,
    total: items.length,
  };

  const summary = payload.summary ?? (!Array.isArray(data) ? data?.summary : undefined);

  return {
    items,
    meta,
    ...(summary !== undefined ? { summary } : {}),
  };
}

async function fetchPaginated<T, S = unknown>(path: string): Promise<PaginatedResponse<T, S>> {
  const payload = await apiFetchWithMeta<T[] | { items?: T[]; data?: T[]; meta?: typeof defaultMeta; summary?: S }, typeof defaultMeta, S>(path);
  return normalizePaginatedResponse<T, S>(payload);
}

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

/**
 * backend จำกัด pageSize ไว้ที่ 100 ถ้าขอมากกว่านั้นจะตอบ 400
 * หน้าค่าจ้างพนักงานต้องได้รายการประจำของทั้งบริษัทในครั้งเดียว จึงไล่ขอทีละหน้าแล้วต่อกัน
 */
const COMPENSATION_ITEM_PAGE_LIMIT = 100;

export async function getPayrollCompensationItems(
  params: PayrollExtensionListParams = {},
) {
  const wanted = params.pageSize ?? 20;

  if (wanted <= COMPENSATION_ITEM_PAGE_LIMIT) {
    return fetchPaginated<
      EmployeeCompensationItem,
      EmployeeCompensationItemListSummary
    >(`/payroll/compensation-items${toQuery(params)}`);
  }

  const collected: EmployeeCompensationItem[] = [];
  let page = params.page ?? 1;
  let result = await fetchPaginated<
    EmployeeCompensationItem,
    EmployeeCompensationItemListSummary
  >(
    `/payroll/compensation-items${toQuery({
      ...params,
      page,
      pageSize: COMPENSATION_ITEM_PAGE_LIMIT,
    })}`,
  );
  collected.push(...result.items);

  while (
    collected.length < wanted &&
    collected.length < (result.meta?.total ?? collected.length)
  ) {
    page += 1;
    result = await fetchPaginated<
      EmployeeCompensationItem,
      EmployeeCompensationItemListSummary
    >(
      `/payroll/compensation-items${toQuery({
        ...params,
        page,
        pageSize: COMPENSATION_ITEM_PAGE_LIMIT,
      })}`,
    );
    if (result.items.length === 0) break;
    collected.push(...result.items);
  }

  return { ...result, items: collected.slice(0, wanted) };
}

export function createPayrollCompensationItem(payload: CreateEmployeeCompensationItemPayload) {
  return apiFetch<EmployeeCompensationItem>("/payroll/compensation-items", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePayrollCompensationItem(
  id: string,
  payload: UpdateEmployeeCompensationItemPayload,
) {
  return apiFetch<EmployeeCompensationItem>(`/payroll/compensation-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deletePayrollCompensationItem(id: string) {
  return apiFetch<{ id: string; deleted?: boolean }>(`/payroll/compensation-items/${id}`, {
    method: "DELETE",
  });
}

export function getPayrollAdjustments(params: PayrollExtensionListParams = {}) {
  return fetchPaginated<PayrollAdjustment, PayrollAdjustmentListSummary>(`/payroll/adjustments${toQuery(params)}`);
}

export function createPayrollAdjustment(payload: CreatePayrollAdjustmentPayload) {
  return apiFetch<PayrollAdjustment>("/payroll/adjustments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePayrollAdjustment(id: string, payload: UpdatePayrollAdjustmentPayload) {
  return apiFetch<PayrollAdjustment>(`/payroll/adjustments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function approvePayrollAdjustment(id: string, payload: { reason?: string; note?: string } = {}) {
  return apiFetch<PayrollAdjustment>(`/payroll/adjustments/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelPayrollAdjustment(id: string, payload: { reason?: string; note?: string } = {}) {
  return apiFetch<PayrollAdjustment>(`/payroll/adjustments/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePayrollAdjustment(id: string) {
  return apiFetch<{ id: string; deleted?: boolean }>(`/payroll/adjustments/${id}`, {
    method: "DELETE",
  });
}

export function getAttendancePayrollRules(params: PayrollExtensionListParams = {}) {
  return fetchPaginated<AttendancePayrollRule, AttendancePayrollRuleListSummary>(`/payroll/attendance-rules${toQuery(params)}`);
}

export function createAttendancePayrollRule(payload: CreateAttendancePayrollRulePayload) {
  return apiFetch<AttendancePayrollRule>("/payroll/attendance-rules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAttendancePayrollRule(
  id: string,
  payload: UpdateAttendancePayrollRulePayload,
) {
  return apiFetch<AttendancePayrollRule>(`/payroll/attendance-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAttendancePayrollRule(id: string) {
  return apiFetch<{ id: string; deleted?: boolean }>(`/payroll/attendance-rules/${id}`, {
    method: "DELETE",
  });
}

/**
 * Option loaders
 * ------------------------------------------------------------
 * ใช้ดึงตัวเลือกในฟอร์ม เช่น พนักงาน งวดเงินเดือน รายการเงินเดือน
 * ถ้า endpoint ในโปรเจคคุณมีชื่อ function เดิมใน lib/api.ts แล้ว จะเปลี่ยนมา import จาก lib/api.ts ก็ได้
 */
/**
 * ขนาดหน้าสูงสุดที่ GET /employees ยอมรับ (@Max(100) ใน list-employees-query.dto.ts)
 * ขอเกินกว่านี้ backend ตอบ 400 ไม่ใช่ตัดให้เฉยๆ
 */
const EMPLOYEE_PAGE_LIMIT = 100;

/**
 * โหลดรายชื่อพนักงานสำหรับ dropdown
 *
 * เคสที่เคยพัง: หน้าหักผ่อนงวดขอ pageSize=300 ทีเดียวเพื่อให้ได้ครบทุกคน
 * แต่ backend จำกัดไว้ที่ 100 จึงตอบ 400 และหน้าไม่มีรายชื่อให้เลือกเลย
 * จึงต้องไล่ขอทีละหน้าตามขนาดที่ backend รับได้ แล้วต่อกันเอง
 * วิธีนี้ยังได้ครบแม้บริษัทมีพนักงานหลายร้อยคน
 */
export async function getPayrollExtensionEmployees(params: { page?: number; pageSize?: number; q?: string; companyId?: string; branchId?: string; status?: string } = {}) {
  const wanted = params.pageSize ?? 20;

  if (wanted <= EMPLOYEE_PAGE_LIMIT) {
    return fetchPaginated<PayrollEmployee>(`/employees${toQuery(params)}`);
  }

  const collected: PayrollEmployee[] = [];
  let page = params.page ?? 1;
  let result = await fetchPaginated<PayrollEmployee>(
    `/employees${toQuery({ ...params, page, pageSize: EMPLOYEE_PAGE_LIMIT })}`,
  );
  collected.push(...result.items);

  while (
    collected.length < wanted &&
    collected.length < (result.meta?.total ?? collected.length)
  ) {
    page += 1;
    result = await fetchPaginated<PayrollEmployee>(
      `/employees${toQuery({ ...params, page, pageSize: EMPLOYEE_PAGE_LIMIT })}`,
    );
    if (result.items.length === 0) break;
    collected.push(...result.items);
  }

  return { ...result, items: collected.slice(0, wanted) };
}

export function getPayrollExtensionPeriods(params: { page?: number; pageSize?: number; companyId?: string; q?: string } = {}) {
  return fetchPaginated<PayrollPeriod>(`/payroll/periods${toQuery(params)}`);
}

export function getPayrollExtensionComponents(params: { page?: number; pageSize?: number; companyId?: string; q?: string; type?: string; status?: string } = {}) {
  return fetchPaginated<PayrollComponent>(`/payroll/components${toQuery(params)}`);
}
