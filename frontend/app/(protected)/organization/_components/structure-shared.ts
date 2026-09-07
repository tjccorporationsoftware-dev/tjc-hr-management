import { toast } from "sonner";

import { ApiClientError, apiFetch, getPublicFileUrl } from "@/lib/api";
import type {
  BranchItem,
  CompanyItem,
  DepartmentItem,
  DivisionItem,
} from "@/types/organization";

/**
 * ของกลางของผังองค์กร
 * -------------------
 * ใช้ร่วมกันระหว่างแท็บ "ผังองค์กร" (`org-structure-view.tsx` — อ่าน/ดูผัง)
 * กับหน้า "จัดผังองค์กร" (`/organization/structure-editor` — ลากวางแก้จริง)
 *
 * เดิมทั้งสองอย่างอยู่ไฟล์เดียวกันเพราะกระดานจัดผังเป็นโมดัล พอแยกเป็นคนละหน้า
 * แล้วชนิดข้อมูลกับตัวช่วยพวกนี้ต้องใช้ทั้งสองฝั่ง จึงยกออกมาไว้ตรงกลาง
 * ห้ามใส่ JSX หรือ state ไว้ที่นี่ — ให้เป็นชนิดข้อมูลกับฟังก์ชันล้วน ๆ
 */

export type PositionRef = {
  id: string;
  code: string;
  nameTh: string;
  /** ระดับงาน (job grade) 1 = สูงสุด ไล่ลงถึง 9 — ใช้เรียงลำดับเท่านั้น */
  level?: number | null;
  sortOrder?: number | null;
};

export type StructureEmployee = {
  id: string;
  employeeCode?: string | null;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  position?: string | null;
  positionMaster?: PositionRef | null;
  status?: string | null;

  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  divisionId?: string | null;

  /** ลำดับที่จัดมือไว้ในกระดานผังองค์กร (0 = ยังไม่เคยจัด) */
  sortOrder?: number | null;

  supervisorId?: string | null;
  supervisor?: {
    id: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;

  avatarUrl?: string | null;
  photoUrl?: string | null;
  user?: { avatarUrl?: string | null; displayName?: string | null } | null;
};

export type ListResponse<T> = {
  items: T[];
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
};

export type OrgLookup = {
  companies: Map<string, CompanyItem>;
  branches: Map<string, BranchItem>;
  departments: Map<string, DepartmentItem>;
  divisions: Map<string, DivisionItem>;
};

export function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export function buildLookup(
  companies: CompanyItem[],
  branches: BranchItem[],
  departments: DepartmentItem[],
  divisions: DivisionItem[],
): OrgLookup {
  return {
    companies: new Map(companies.map((item) => [item.id, item])),
    branches: new Map(branches.map((item) => [item.id, item])),
    departments: new Map(departments.map((item) => [item.id, item])),
    divisions: new Map(divisions.map((item) => [item.id, item])),
  };
}

/** backend จำกัด pageSize ไว้ที่ 100 จึงต้องวนดึงจนครบ */
export async function fetchAllEmployees(): Promise<StructureEmployee[]> {
  const collected: StructureEmployee[] = [];
  let page = 1;

  for (;;) {
    const result = await apiFetch<ListResponse<StructureEmployee>>(
      `/employees?page=${page}&pageSize=100`,
    );

    collected.push(...(result?.items ?? []));

    const totalPages = result?.meta?.totalPages ?? 1;
    if (page >= totalPages || page >= 30) break;
    page += 1;
  }

  return collected;
}

export function nameOf(employee: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  employeeCode?: string | null;
}) {
  const full = [employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return employee.displayName?.trim() || full || employee.employeeCode || "-";
}

export function positionOf(employee: StructureEmployee) {
  return employee.positionMaster?.nameTh ?? employee.position ?? null;
}

export function initialsOf(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

export function avatarUrlOf(employee: StructureEmployee) {
  const raw =
    employee.avatarUrl ?? employee.photoUrl ?? employee.user?.avatarUrl ?? null;
  return raw ? getPublicFileUrl(raw) : null;
}

export function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function showApiError(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    toast.error(error.message || fallback);
    return;
  }
  toast.error(fallback);
}
