export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PermissionItem = {
  id: string;
  code: string;
  name: string;
  group: string;
  description: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type RoleItem = {
  id: string;
  companyId: string | null;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** SYSTEM = template ส่วนกลาง (อ่านอย่างเดียวสำหรับบริษัท) · COMPANY = โรลของบริษัท */
  scopeType: "SYSTEM" | "COMPANY";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: PermissionItem[];
};

export type RoleListSummary = {
  total: number;
  active: number;
  inactive: number;
  system: number;
  custom: number;
  assignedPermissions: number;
};

export type PermissionGroupCount = {
  group: string;
  count: number;
};

export type PermissionListSummary = {
  total: number;
  active: number;
  inactive: number;
  groupTotal: number;
  groupCounts: PermissionGroupCount[];
};
