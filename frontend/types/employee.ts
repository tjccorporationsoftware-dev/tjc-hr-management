export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type EmployeeStatus =
  "ACTIVE" | "PROBATION" | "SUSPENDED" | "RESIGNED" | "TERMINATED" | "INACTIVE";

export type Gender = "MALE" | "FEMALE" | "OTHER" | "NOT_SPECIFIED";

// วิธีลงเวลาที่อนุญาตให้พนักงานใช้ (เว็บ / แอปมือถือ / เครื่องสแกน)
export type AttendanceMethod = "WEB" | "MOBILE" | "DEVICE";

export type MaritalStatus =
  "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED" | "NOT_SPECIFIED";

export type EmployeeDocumentType =
  | "ID_CARD"
  | "HOUSE_REGISTRATION"
  | "EMPLOYMENT_CONTRACT"
  | "EDUCATION_CERTIFICATE"
  | "BANK_BOOK"
  | "MEDICAL_CERTIFICATE"
  | "WORK_PERMIT"
  | "OTHER";

export type EmployeeDocumentStatus =
  "ACTIVE" | "EXPIRED" | "REPLACED" | "DELETED";

export type WorkHistoryType =
  | "JOINED"
  | "POSITION_CHANGE"
  | "DEPARTMENT_TRANSFER"
  | "BRANCH_TRANSFER"
  | "DIVISION_TRANSFER"
  | "EMPLOYEE_TYPE_CHANGE"
  | "SALARY_ADJUSTMENT"
  | "STATUS_CHANGE"
  | "OTHER";

export type ResignationStatus =
  "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

export type EmployeeMasterRef = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
};

export type OrganizationOption = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  status?: string;
  companyId?: string;
  branchId?: string | null;
  departmentId?: string;
  description?: string | null;
  level?: number | null;
  sortOrder?: number | null;
};

export type EmployeeUserRef = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
};

export type EmployeeSupervisorRef = {
  id: string;
  employeeCode: string;
  title: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  position: string | null;
  positionId: string | null;
  status: EmployeeStatus;
  positionMaster: EmployeeMasterRef | null;
};

export type EmployeeListItem = {
  id: string;
  employeeCode: string;
  title: string | null;
  firstName: string;
  lastName: string;
  nickname: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  positionId: string | null;
  supervisorId: string | null;
  startDate: string;
  probationEndDate: string | null;
  /** วันที่ผ่านทดลองงาน ระบบบันทึกให้ตอน HR รีวิวผ่านที่หน้า /onboarding */
  probationPassedAt: string | null;
  status: EmployeeStatus;

  companyId: string;
  branchId: string | null;
  departmentId: string | null;
  divisionId: string | null;
  employeeTypeId: string | null;
  userId: string | null;

  allowedAttendanceMethods: AttendanceMethod[];
  attendanceGeofenceRequired: boolean;
  /** จุดลงเวลา GPS ที่ผูกรายคน — null = ใช้จุดของสาขา */
  attendanceLocationId?: string | null;
  attendanceLocation?: {
    id: string;
    code: string;
    nameTh: string;
    branchId: string | null;
    radiusMeters: number;
    status: "ACTIVE" | "INACTIVE";
  } | null;
  /** false = ไม่ต้องลงเวลาเลย (ผู้บริหาร / เหมาจ่าย) */
  attendanceTrackingRequired?: boolean;
  /** รอบลงเวลาที่ยกเว้นเป็นรายคน เช่น พนักงานจัดส่งไม่ต้องกดเข้างานบ่าย */
  attendanceExemptSessions?: Array<"MORNING_IN" | "AFTERNOON_IN" | "CHECK_OUT">;

  createdAt: string;
  updatedAt: string;

  company: EmployeeMasterRef | null;
  branch: EmployeeMasterRef | null;
  department: EmployeeMasterRef | null;
  division: EmployeeMasterRef | null;
  employeeType: EmployeeMasterRef | null;
  positionMaster: EmployeeMasterRef | null;
  supervisor: EmployeeSupervisorRef | null;
  _count?: {
    subordinates: number;
  };
  user: EmployeeUserRef | null;
};

export type EmployeeListSummary = {
  total: number;
  active: number;
  probation: number;
  suspended: number;
  resigned: number;
  terminated: number;
  inactive: number;
  linkedUser: number;
  withoutDepartment: number;
  withoutPosition: number;
  withoutSupervisor: number;
  branchCount: number;
  departmentCount: number;
  branchDepartmentTotal: number;
  /**
   * จำนวนคนต่อสาขา/ต่อแผนก นับจากผลลัพธ์ทั้งชุด ไม่ใช่เฉพาะหน้าที่เปิดอยู่
   * หัวข้อกลุ่มต้องใช้ค่านี้ ไม่งั้นสาขาที่ถูกตัดข้ามหน้าจะขึ้นตัวเลขคนละค่าในสองหน้า
   */
  branchTotals?: Array<{ branchId: string | null; total: number }>;
  departmentTotals?: Array<{
    branchId: string | null;
    departmentId: string | null;
    total: number;
  }>;
};

export type EmployeeListResponse = {
  items: EmployeeListItem[];
  meta: PaginationMeta;
  summary?: EmployeeListSummary;
};

export type EmployeeProfile = {
  id: string;
  employeeId: string;

  gender: Gender;
  birthDate: string | null;
  nationalId: string | null;
  passportNo: string | null;
  maritalStatus: MaritalStatus;
  nationality: string | null;
  religion: string | null;

  currentAddress: string | null;
  registeredAddress: string | null;

  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;

  /** ผู้ติดต่อฉุกเฉินคนที่สอง — คนแรกติดต่อไม่ได้ก็ยังมีอีกทาง */
  emergencyContactName2: string | null;
  emergencyContactPhone2: string | null;
  emergencyContactRelation2: string | null;

  educationLevel: string | null;
  educationInstitute: string | null;
  educationMajor: string | null;

  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;

  firstNameEn: string | null;
  lastNameEn: string | null;

  personalEmail: string | null;
  workPhoneExt: string | null;
  lineId: string | null;
  bloodType: string | null;

  taxId: string | null;
  socialSecurityNo: string | null;
  socialSecurityHospital: string | null;
  providentFundNo: string | null;
  payrollPaymentMethod: string | null;

  contractNo: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  workLocation: string | null;

  workPermitNo: string | null;
  workPermitExpiredDate: string | null;
  visaNo: string | null;
  visaExpiredDate: string | null;

  emergencyContactAddress: string | null;
  emergencyContactAddress2: string | null;

  note: string | null;

  createdAt: string;
  updatedAt: string;
};

export type EmployeeDocumentItem = {
  id: string;
  employeeId: string;
  type: EmployeeDocumentType;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  storageProvider: string;
  storageKey: string;
  bucketName: string | null;
  issuedDate: string | null;
  expiredDate: string | null;
  status: EmployeeDocumentStatus;
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type EmployeeWorkHistoryItem = {
  id: string;
  employeeId: string;
  type: WorkHistoryType;
  effectiveDate: string;
  title: string;
  description: string | null;

  oldPosition: string | null;
  newPosition: string | null;
  oldStatus: EmployeeStatus | null;
  newStatus: EmployeeStatus | null;

  createdById: string | null;
  createdAt: string;

  createdBy?: {
    id: string;
    displayName: string;
    email: string;
  } | null;
};

export type EmployeeResignationItem = {
  id: string;
  employeeId: string;
  resignationDate: string;
  effectiveDate: string;
  reason: string;
  note: string | null;
  status: ResignationStatus;
  documentId: string | null;

  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;

  createdAt: string;
  updatedAt: string;
};

export type EmployeeDetail = EmployeeListItem & {
  profile: EmployeeProfile | null;
  familyMembers: EmployeeFamilyMember[];
  educations: EmployeeEducation[];
  subordinates: EmployeeSupervisorRef[];
  documents: EmployeeDocumentItem[];
  workHistories: EmployeeWorkHistoryItem[];
  resignations: EmployeeResignationItem[];
  probationRecords: EmployeeProbationRecord[];
};

export type EmployeeProbationRecord = {
  id: string;
  startDate: string;
  endDate: string;
  reviewDate: string | null;
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "EXTENDED" | "CANCELLED";
  result: string | null;
  summary: string | null;
  recommendation: string | null;
  note: string | null;
  reviewedAt: string | null;
  extendedUntil: string | null;
  createdAt: string;
  reviewedBy: {
    id: string;
    displayName: string | null;
    email: string | null;
  } | null;
  evaluationResults?: Array<{
    id: string;
    totalScore?: string | number | null;
    maxScore?: string | number | null;
    percent?: string | number | null;
    evaluationDate: string;
    form?: { id: string; code: string; name: string } | null;
  }>;
};

export type CreateEmployeeForm = {
  employeeCode: string;
  title: string;
  firstName: string;
  lastName: string;
  nickname: string;
  displayName: string;
  email: string;
  phone: string;
  position: string;
  positionId: string;
  supervisorId: string;
  startDate: string;
  probationEndDate: string;
  status: EmployeeStatus;

  companyId: string;
  branchId: string;
  departmentId: string;
  divisionId: string;
  employeeTypeId: string;

  profile: {
    gender: Gender;
    birthDate: string;
    nationalId: string;
    passportNo: string;
    maritalStatus: MaritalStatus;
    nationality: string;
    religion: string;

    currentAddress: string;
    registeredAddress: string;

    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRelation: string;

    emergencyContactName2: string;
    emergencyContactPhone2: string;
    emergencyContactRelation2: string;

    educationLevel: string;
    educationInstitute: string;
    educationMajor: string;

    bankName: string;
    bankAccountNo: string;
    bankAccountName: string;

    firstNameEn: string;
    lastNameEn: string;

    personalEmail: string;
    workPhoneExt: string;
    lineId: string;
    bloodType: string;

    taxId: string;
    socialSecurityNo: string;
    socialSecurityHospital: string;
    providentFundNo: string;
    payrollPaymentMethod: string;

    contractNo: string;
    contractStartDate: string;
    contractEndDate: string;
    workLocation: string;

    workPermitNo: string;
    workPermitExpiredDate: string;
    visaNo: string;
    visaExpiredDate: string;

    emergencyContactAddress: string;
    emergencyContactAddress2: string;

    note: string;
  };
};

export type CreateEmployeeDocumentForm = {
  type: EmployeeDocumentType;
  title: string;
  description: string;
  fileName: string;
  fileSize: string;
  mimeType: string;
  storageProvider: string;
  storageKey: string;
  bucketName: string;
  issuedDate: string;
  expiredDate: string;
  status: EmployeeDocumentStatus;
};

export type CreateEmployeeResignationForm = {
  resignationDate: string;
  effectiveDate: string;
  reason: string;
  note: string;
};

export type UploadEmployeeDocumentForm = {
  type: EmployeeDocumentType;
  title: string;
  description: string;
  issuedDate: string;
  expiredDate: string;
  status: EmployeeDocumentStatus;
};

/** สมาชิกครอบครัวของพนักงาน — บิดา มารดา คู่สมรส พี่น้อง ผู้ติดต่อฉุกเฉิน */
export type EmployeeFamilyMember = {
  id: string;
  name: string;
  relation?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
};

/** ประวัติการศึกษาของพนักงาน — หนึ่งคนมีได้หลายวุฒิ */
export type EmployeeEducation = {
  id: string;
  level: string;
  institute?: string | null;
  major?: string | null;
  gradYear?: number | null;
  gpa?: string | number | null;
  note?: string | null;
};
