export type MasterStatus = "ACTIVE" | "INACTIVE";

export type OnboardingTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "OVERDUE";

export type OnboardingDocumentStatus =
  | "PENDING"
  | "SUBMITTED"
  | "VERIFIED"
  | "REJECTED"
  | "WAIVED";

export type ProbationStatus =
  | "IN_PROGRESS"
  | "PASSED"
  | "FAILED"
  | "EXTENDED"
  | "CANCELLED";

export type OnboardingListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OnboardingChecklistListSummary = {
  total: number;
  active: number;
  inactive: number;
};

export type OnboardingTaskListSummary = {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  overdue: number;
};

export type OnboardingDocumentListSummary = {
  total: number;
  pending: number;
  submitted: number;
  verified: number;
  rejected: number;
  waived: number;
  required: number;
};

export type ProbationRecordListSummary = {
  total: number;
  inProgress: number;
  passed: number;
  failed: number;
  extended: number;
  cancelled: number;
  dueSoon: number;
  overdue: number;
};

export type OnboardingCompany = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type OnboardingEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  department?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
};

export type OnboardingChecklistItem = {
  id: string;
  checklistId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  sortOrder: number;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingChecklist = {
  id: string;
  companyId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: OnboardingCompany | null;
  items: OnboardingChecklistItem[];
  _count?: {
    tasks: number;
  };
};

export type OnboardingChecklistListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  status?: MasterStatus | "";
};

export type OnboardingChecklistListResponse = {
  items: OnboardingChecklist[];
  meta: OnboardingListMeta;
  summary?: OnboardingChecklistListSummary;
};

export type CreateOnboardingChecklistItemForm = {
  title: string;
  description?: string;
  category?: string;
  sortOrder?: number;
  isRequired?: boolean;
};

export type CreateOnboardingChecklistForm = {
  companyId?: string;
  code: string;
  name: string;
  description?: string;
  status?: MasterStatus;
  items: CreateOnboardingChecklistItemForm[];
};

export type UpdateOnboardingChecklistForm =
  Partial<CreateOnboardingChecklistForm>;

export type OnboardingTask = {
  id: string;
  companyId: string;
  employeeId: string;
  checklistId?: string | null;
  checklistItemId?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  status: OnboardingTaskStatus;
  dueDate?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: OnboardingCompany;
  employee?: OnboardingEmployee;
  checklist?: {
    id: string;
    code: string;
    name: string;
  } | null;
  checklistItem?: {
    id: string;
    title: string;
    category?: string | null;
    isRequired: boolean;
  } | null;
  documents?: OnboardingDocument[];
};

export type OnboardingTaskListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  employeeId?: string;
  checklistId?: string;
  status?: OnboardingTaskStatus | "";
  dueDateFrom?: string;
  dueDateTo?: string;
};

export type OnboardingTaskListResponse = {
  items: OnboardingTask[];
  meta: OnboardingListMeta;
  summary?: OnboardingTaskListSummary;
};

export type CreateOnboardingTaskForm = {
  companyId: string;
  employeeId: string;
  checklistId?: string;
  checklistItemId?: string;
  title: string;
  description?: string;
  category?: string;
  dueDate?: string;
};

export type UpdateOnboardingTaskForm = Partial<CreateOnboardingTaskForm>;

export type OnboardingTaskActionForm = {
  note?: string;
  cancelReason?: string;
};

export type OnboardingDocument = {
  id: string;
  companyId: string;
  employeeId: string;
  taskId?: string | null;
  documentName: string;
  description?: string | null;
  isRequired: boolean;
  status: OnboardingDocumentStatus;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  note?: string | null;

  /** ไฟล์แนบ — มีค่าเมื่ออัปโหลดไฟล์เข้ามาแล้ว */
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  storageProvider?: string | null;
  storageKey?: string | null;
  bucketName?: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: OnboardingCompany;
  employee?: OnboardingEmployee;
  task?: {
    id: string;
    title: string;
    status: OnboardingTaskStatus;
  } | null;
};

export type OnboardingDocumentListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  employeeId?: string;
  taskId?: string;
  status?: OnboardingDocumentStatus | "";
};

export type OnboardingDocumentListResponse = {
  items: OnboardingDocument[];
  meta: OnboardingListMeta;
  summary?: OnboardingDocumentListSummary;
};

export type CreateOnboardingDocumentForm = {
  companyId: string;
  employeeId: string;
  taskId?: string;
  documentName: string;
  description?: string;
  isRequired?: boolean;
  note?: string;
};

export type OnboardingDocumentActionForm = {
  note?: string;
  rejectionReason?: string;
};

export type ProbationRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reviewDate?: string | null;
  status: ProbationStatus;
  result?: string | null;
  summary?: string | null;
  recommendation?: string | null;
  note?: string | null;
  reviewedAt?: string | null;
  extendedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: OnboardingCompany;
  employee?: OnboardingEmployee;
  evaluationResults?: ProbationEvaluationResult[];
};

export type ProbationRecordListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  employeeId?: string;
  status?: ProbationStatus | "";
};

export type ProbationRecordListResponse = {
  items: ProbationRecord[];
  meta: OnboardingListMeta;
  summary?: ProbationRecordListSummary;
};

export type CreateProbationRecordForm = {
  companyId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reviewDate?: string;
  summary?: string;
  recommendation?: string;
  note?: string;
};

export type ProbationActionForm = {
  status: ProbationStatus;
  extendedUntil?: string;
  result?: string;
  summary?: string;
  recommendation?: string;
  note?: string;
  /** แบบประเมินที่ใช้ตัดสินผลทดลองงาน (ไม่บังคับ) */
  evaluation?: {
    formId: string;
    scoreItems: Array<{
      questionId: string;
      score?: number;
      textValue?: string;
      note?: string;
    }>;
  };
};

/** ผลประเมินที่ผูกกับใบทดลองงาน ส่งมาพร้อม ProbationRecord */
export type ProbationEvaluationResult = {
  id: string;
  totalScore?: string | number | null;
  maxScore?: string | number | null;
  percent?: string | number | null;
  evaluationDate: string;
  summary?: string | null;
  /** คะแนนรายข้อ ใช้กางดูรายละเอียดในป๊อปอัพ */
  scoreItems?: Array<{
    questionId: string;
    title?: string;
    type?: string;
    maxScore?: number;
    weight?: number;
    score?: number;
    textValue?: string | null;
    note?: string | null;
  }> | null;
  evaluatorEmployee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName?: string | null;
  } | null;
  form?: {
    id: string;
    code: string;
    name: string;
    passScore?: string | number | null;
    totalScore?: string | number | null;
  } | null;
};


/* ------------------------------------------------------------------ */
/* ความคืบหน้าพนักงานใหม่ (รายคน)                                       */
/* ------------------------------------------------------------------ */

/** ขั้นที่พนักงานคนนั้นค้างอยู่ — เรียงตามลำดับกระบวนการจริง */
export type OnboardingStage = "TASKS" | "DOCUMENTS" | "PROBATION" | "DONE";

export type OnboardingProgressItem = {
  employee: {
    id: string;
    employeeCode: string;
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    position?: string | null;
    status?: string | null;
    startDate?: string | null;
    company?: { id: string; nameTh: string } | null;
    branch?: { id: string; nameTh: string } | null;
    department?: { id: string; nameTh: string } | null;
  };
  stage: OnboardingStage;
  stageNo: number;
  percent: number;
  tasks: { total: number; done: number; overdue: number };
  documents: { total: number; done: number; waiting: number };
  probation: {
    id: string;
    status: ProbationStatus;
    startDate: string;
    endDate: string;
    reviewDate?: string | null;
    result?: string | null;
    daysLeft: number | null;
  } | null;
};

export type OnboardingProgressSummary = {
  total: number;
  tasksStage: number;
  documentsStage: number;
  probationStage: number;
  done: number;
  overdueTasks: number;
};

export type OnboardingProgressListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  branchId?: string;
  stage?: OnboardingStage | "ALL";
};

export type OnboardingProgressResponse = {
  items: OnboardingProgressItem[];
  meta: OnboardingListMeta;
  summary: OnboardingProgressSummary;
};
