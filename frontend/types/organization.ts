export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type MasterStatus = "ACTIVE" | "INACTIVE";

export type ApprovalMatrixTargetType =
  | "LEAVE_REQUEST"
  | "OVERTIME_REQUEST"
  | "TIME_ADJUST_REQUEST"
  | "OFFSITE_WORK_REQUEST"
  | "DOCUMENT_REQUEST"
  | "PAYROLL_RUN"
  | "EMPLOYEE_CHANGE"
  | "GENERAL";

export type ApprovalStepApproverType =
  "SUPERVISOR" | "POSITION" | "EMPLOYEE" | "ROLE" | "HR_ADMIN" | "EXECUTIVE";

export type ApprovalMatrixStepItem = {
  id: string;
  matrixId: string;
  stepNo: number;
  nameTh: string;
  description: string | null;
  approverType: ApprovalStepApproverType;
  positionId: string | null;
  employeeId: string | null;
  roleCode: string | null;

  /** ผู้อนุมัติแทน เมื่อผู้อนุมัติหลักกลายเป็นคนยื่นเอง */
  fallbackApproverType?: ApprovalStepApproverType | null;
  fallbackPositionId?: string | null;
  fallbackEmployeeId?: string | null;
  fallbackRoleCode?: string | null;

  requireAll: boolean;
  minApproverCount: number;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  position?: {
    id: string;
    code: string;
    nameTh: string;
    level: number | null;
  } | null;
  employee?: {
    id: string;
    employeeCode: string;
    title: string | null;
    firstName: string;
    lastName: string;
    displayName: string | null;
    position: string | null;
  } | null;
  fallbackPosition?: {
    id: string;
    code: string;
    nameTh: string;
    level: number | null;
  } | null;
  fallbackEmployee?: {
    id: string;
    employeeCode: string;
    title: string | null;
    firstName: string;
    lastName: string;
    displayName: string | null;
    position: string | null;
  } | null;
};

export type ApprovalMatrixItem = {
  id: string;
  companyId: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  targetType: ApprovalMatrixTargetType;
  branchId: string | null;
  departmentId: string | null;
  employeeTypeId: string | null;
  priority: number;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: {
    id: string;
    code: string;
    nameTh: string;
  };
  branch?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  /** สาขาเพิ่มเติมที่ใช้สายเดียวกัน (สาขาแรกอยู่ที่ branchId) */
  extraBranches?: Array<{
    id: string;
    approvalMatrixId: string;
    branchId: string;
    branch?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
  }>;
  department?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  employeeType?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  requesters?: Array<{
    id: string;
    approvalMatrixId: string;
    employeeId: string;
    createdAt: string;
    employee?: {
      id: string;
      employeeCode: string;
      title: string | null;
      firstName: string;
      lastName: string;
      displayName: string | null;
      position: string | null;
      companyId?: string | null;
      departmentId?: string | null;
      employeeTypeId?: string | null;
    } | null;
  }>;
  steps: ApprovalMatrixStepItem[];
};

export type CompanyItem = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  /** เลขที่บัญชีนายจ้าง ใช้ในแบบ สปส.1-10 */
  socialSecurityAccountNo?: string | null;
  /** ลำดับที่สาขาของนายจ้าง ปกติ 000 */
  socialSecurityBranchNo?: string | null;
  /** รหัสกิจการของกองทุนเงินทดแทน ใช้ในแบบ กท.20 / กท.20ก */
  workmenCompensationCode?: string | null;
  /** อัตราเงินสมทบกองทุนเงินทดแทน (ร้อยละ) เช่น 0.2 */
  workmenCompensationRate?: number | null;
  /** รหัสบริษัทที่ธนาคารออกให้ ใช้ในไฟล์โอนเงินเดือน */
  bankCompanyCode?: string | null;
  /** เลขที่บัญชีบริษัทที่ใช้ตัดจ่ายเงินเดือน */
  bankDebitAccountNo?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  _count?: {
    branches: number;
    departments: number;
  };
};

export type BranchItem = {
  id: string;
  companyId: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  /** ใช้ข้อมูลสาขาเป็นหัวสลิปแทนบริษัท (ช่องที่เว้นว่างจะถอยไปใช้ของบริษัท) */
  usePayslipHeader?: boolean;
  /** เลขประจำตัวผู้เสียภาษีที่พิมพ์บนเอกสารของสาขา */
  taxId?: string | null;
  /** เลขที่สาขาในระบบภาษี 5 หลัก (00000 = สำนักงานใหญ่) */
  taxBranchNo?: string | null;
  /** ลำดับที่สาขาของนายจ้างในระบบประกันสังคม */
  socialSecurityBranchNo?: string | null;
  /** ข้อความท้ายสลิปเฉพาะสาขา */
  payslipNote?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  company?: {
    id: string;
    code: string;
    nameTh: string;
  };
  _count?: {
    departments: number;
    /** จำนวนพนักงานในสาขา (นับเฉพาะทะเบียนที่ยังไม่ถูกลบ) */
    employees?: number;
  };
};

export type DepartmentItem = {
  id: string;
  companyId: string;
  branchId: string | null;
  code: string;
  nameTh: string;
  nameEn: string | null;
  /** ไม่ null = มาจากรายการมาตรฐานของระบบ (null = บริษัทสร้างเอง) */
  catalogId?: string | null;
  referenceCode?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  company?: {
    id: string;
    code: string;
    nameTh: string;
  };
  branch?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  _count?: {
    divisions?: number;
    /** จำนวนพนักงานในแผนก (นับเฉพาะทะเบียนที่ยังไม่ถูกลบ) */
    employees?: number;
  };
};

export type DivisionItem = {
  id: string;
  departmentId: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  /** ไม่ null = มาจากรายการมาตรฐานของระบบ (null = บริษัทสร้างเอง) */
  catalogId?: string | null;
  referenceCode?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  department?: {
    id: string;
    code: string;
    nameTh: string;
    companyId?: string;
    branchId?: string | null;
    company?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
    branch?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
  };
};

export type PositionItem = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  level: number | null;
  sortOrder: number | null;
  /** ไม่ null = มาจากรายการมาตรฐานของระบบ (null = บริษัทสร้างเอง) */
  catalogId?: string | null;
  referenceCode?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  _count?: {
    employees: number;
  };
};

export type EmployeeTypeItem = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  /** ไม่ null = มาจากรายการมาตรฐานของระบบ (null = บริษัทสร้างเอง) */
  catalogId?: string | null;
  referenceCode?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  _count?: {
    employees: number;
  };
};

/* ------------------------------------------------------------------ */
/* รายการมาตรฐานระดับระบบ (catalog)                                    */
/* ------------------------------------------------------------------ */

/** แถวระดับบริษัทที่ถูกคัดลอกมาจาก catalog — รูปร่างต่างกันตามชนิด */
export type OrganizationCatalogCompanyItem =
  DepartmentItem | DivisionItem | PositionItem | EmployeeTypeItem;

/**
 * แผนก/ฝ่าย/ตำแหน่ง/ประเภทพนักงานมาตรฐานที่ระบบเตรียมไว้ให้ทุกบริษัท
 * บริษัทกด "เปิดใช้" แล้ว backend จะคัดลอกเป็นแถวของบริษัทเอง (companyItem)
 */
export type OrganizationCatalogItem = {
  id: string;
  referenceCode: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  sortOrder: number;
  status: MasterStatus;

  /** เฉพาะตำแหน่ง */
  level?: number | null;

  /**
   * หมวดสำหรับจัดกลุ่มในหน้าเลือก — ความหมายต่างกันตามชนิด
   * ตำแหน่ง = กลุ่มสายงาน · ฝ่าย = แผนกแม่ · แผนก/ประเภทพนักงาน = ไม่มี
   */
  category?: string;
  categoryLabel?: string;

  /** แผนก/ประเภทพนักงาน — true = รายการพื้นฐานที่บริษัทส่วนใหญ่ต้องมี */
  isDefault?: boolean;

  enabled: boolean;
  companyItem: OrganizationCatalogCompanyItem | null;
  employeeCount: number;
};

export type OrganizationCatalogCategory = {
  key: string;
  label: string;
  total: number;
};

export type OrganizationCatalogResponse = {
  companyId: string;
  items: OrganizationCatalogItem[];
  customItems: OrganizationCatalogCompanyItem[];
  categories: OrganizationCatalogCategory[];
  summary: {
    total: number;
    enabled: number;
    custom: number;
  };
};

export type OrganizationCatalogBulkResult = {
  enabled: number;
  total: number;
  failed: Array<{ catalogId: string; message: string }>;
};

export type OrganizationTabKey =
  | "companies"
  | "branches"
  | "departments"
  | "divisions"
  | "positions"
  | "approval-matrices"
  | "employee-types";

export type OrganizationEntitySummary = {
  total: number;
  active: number;
  inactive: number;
};

export type OrganizationApprovalMatrixSummary = OrganizationEntitySummary & {
  multiStep: number;
};

export type OrganizationSummary = {
  scope?: {
    companyId: string | null;
    branchId: string | null;
    departmentId: string | null;
  };
  companies: OrganizationEntitySummary;
  branches: OrganizationEntitySummary;
  departments: OrganizationEntitySummary;
  divisions: OrganizationEntitySummary;
  positions: OrganizationEntitySummary;
  employeeTypes: OrganizationEntitySummary;
  approvalMatrices: OrganizationApprovalMatrixSummary;
};

export type ApprovalMatrixListSummary = {
  total: number;
  active: number;
  inactive: number;
  payroll: number;
  multiStep: number;
};

export type OrganizationStructureStats = {
  companies: number;
  branches: number;
  departments: number;
  divisions: number;
  employees: number;
  supervisors: number;
  roots: number;
};

export type OrganizationStructureDataQuality = {
  noDepartment: number;
  noPosition: number;
  noSupervisor: number;
  inactive: number;
};

export type OrganizationStructureSummary = {
  stats: OrganizationStructureStats;
  dataQuality: OrganizationStructureDataQuality;
};
