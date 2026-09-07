export type EmployeeStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "PROBATION"
  | "RESIGNED"
  | "SUSPENDED"
  | "TERMINATED";

export type ManpowerQueryParams = {
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  divisionId?: string;
  employeeTypeId?: string;
  position?: string;
  status?: EmployeeStatus | "";
  q?: string;
};

export type ManpowerFilterOption = {
  id: string;
  code: string;
  name: string;
  companyId?: string;
  branchId?: string | null;
  departmentId?: string;
};

export type ManpowerOrgGroup = {
  id: string | null;
  code: string;
  name: string;
  count: number;
  activeCount: number;
  probationCount: number;
  inactiveCount: number;
  resignedCount: number;
  suspendedCount: number;
  terminatedCount: number;
};

export type ManpowerPositionGroup = {
  position: string;
  count: number;
  activeCount: number;
  probationCount: number;
  inactiveCount: number;
  resignedCount: number;
  suspendedCount: number;
  terminatedCount: number;
};

export type ManpowerStatusGroup = {
  status: EmployeeStatus;
  label: string;
  count: number;
};

export type Gender = "MALE" | "FEMALE" | "OTHER" | "NOT_SPECIFIED";

export type ManpowerGenderGroup = {
  gender: Gender;
  label: string;
  count: number;
  activeCount: number;
  probationCount: number;
  inactiveCount: number;
  resignedCount: number;
  suspendedCount: number;
  terminatedCount: number;
};

export type ManpowerAgeGroup = {
  code: string;
  name: string;
  count: number;
  activeCount: number;
  probationCount: number;
  inactiveCount: number;
  resignedCount: number;
  suspendedCount: number;
  terminatedCount: number;
};

export type ManpowerEmployee = {
  id: string;
  employeeCode: string;
  title?: string | null;
  displayName?: string | null;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  position?: string | null;
  startDate?: string | null;
  probationEndDate?: string | null;
  status: EmployeeStatus;
  createdAt?: string | null;

  company?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;

  branch?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;

  department?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;

  division?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;

  employeeType?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;

  user?: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string | null;
  } | null;

  profile?: {
    birthDate?: string | null;
    gender?: Gender | null;
  } | null;
};


export type ManpowerOverviewLists = {
  latestEmployees: ManpowerEmployee[];
  latestEmployeesPreview: ManpowerEmployee[];
  topDepartments: ManpowerOrgGroup[];
  topBranches: ManpowerOrgGroup[];
  topPositions: ManpowerPositionGroup[];
  topAgeGroups: ManpowerAgeGroup[];
};

export type ManpowerOverview = {
  metrics: {
    totalEmployees: number;
    activeEmployees: number;
    probationEmployees: number;
    inactiveEmployees: number;
    resignedEmployees: number;
    suspendedEmployees: number;
    terminatedEmployees: number;

    companyCount: number;
    branchCount: number;
    departmentCount: number;
    divisionCount: number;
    employeeTypeCount: number;
    positionCount: number;

    activeRate: number;

    currentMonthNewEmployees: number;
    previousMonthNewEmployees: number;
    newEmployeeDelta: number;

    pendingRequests: number;
    pendingLeaveRequests: number;
    pendingOvertimeRequests: number;
    pendingTimeAdjustRequests: number;

    currentMonthApprovedOtHours: number;
    previousMonthApprovedOtHours: number;
    otHourDelta: number;
  };

  filters?: {
    companies: ManpowerFilterOption[];
    branches: ManpowerFilterOption[];
    departments: ManpowerFilterOption[];
    divisions: ManpowerFilterOption[];
    employeeTypes: ManpowerFilterOption[];
  };

  charts: {
    byCompany: ManpowerOrgGroup[];
    byBranch: ManpowerOrgGroup[];
    byDepartment: ManpowerOrgGroup[];
    byDivision: ManpowerOrgGroup[];
    byEmployeeType: ManpowerOrgGroup[];
    byPosition: ManpowerPositionGroup[];
    byStatus: ManpowerStatusGroup[];
    byAge: ManpowerAgeGroup[];
    byGender: ManpowerGenderGroup[];
  };

  lists?: ManpowerOverviewLists;

  employees: ManpowerEmployee[];
};