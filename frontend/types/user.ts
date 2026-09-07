import type { EmployeeStatus } from "./employee";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export type UserRole = {
  id: string;
  code: string;
  name: string;
};

export type UserEmployeeRef = {
  id: string;
  employeeCode: string;
  title: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: EmployeeStatus;
  company: {
    id: string;
    code: string;
    nameTh: string;
    nameEn: string | null;
  } | null;
  branch: {
    id: string;
    code: string;
    nameTh: string;
    nameEn: string | null;
  } | null;
  department: {
    id: string;
    code: string;
    nameTh: string;
    nameEn: string | null;
  } | null;
  division: {
    id: string;
    code: string;
    nameTh: string;
    nameEn: string | null;
  } | null;
};

export type UserScopeRef = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
};

export type UserScopeInfo = {
  level: "GLOBAL" | "COMPANY" | "BRANCH";
  companyId: string | null;
  branchId: string | null;
  company: UserScopeRef | null;
  branch: UserScopeRef | null;
};

export type UserListItem = {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee: UserEmployeeRef | null;
  scope?: UserScopeInfo;
  roles: UserRole[];
};

export type RoleListItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: {
    id: string;
    code: string;
    name: string;
    group: string;
    description: string | null;
  }[];
};

export type UserListSummary = {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
  linked: number;
  unlinked: number;
};
