export type EvaluationFormStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type EvaluationQuestionType = "SCORE" | "TEXT" | "YES_NO";

export type EvaluationResultStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "FINALIZED"
  | "CANCELLED";

export type MasterStatus = "ACTIVE" | "INACTIVE";

export type WarningLetterStatus =
  | "DRAFT"
  | "ISSUED"
  | "ACKNOWLEDGED"
  | "CANCELLED";

export type WarningSeverity = "INFO" | "MINOR" | "MAJOR" | "SERIOUS";

export type DisciplinaryHistoryType =
  | "WARNING"
  | "ACKNOWLEDGEMENT"
  | "INCIDENT"
  | "NOTE";


export type EvaluationQuestion = {
  id: string;
  formId: string;
  title: string;
  description?: string | null;
  type: EvaluationQuestionType;
  maxScore: string | number;
  weight: string | number;
  sortOrder: number;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationPeriodType =
  | "PROBATION"
  | "ANNUAL"
  | "HALF_YEAR"
  | "QUARTER"
  | "CUSTOM";

export type EvaluationForm = {
  id: string;
  companyId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  periodType?: EvaluationPeriodType | null;
  totalScore?: string | number | null;
  passScore?: string | number | null;
  status: EvaluationFormStatus;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  } | null;
  questions: EvaluationQuestion[];
  _count?: {
    results: number;
    evaluators: number;
  };
};

export type EvaluationFormListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  status?: EvaluationFormStatus | "";
};

export type EvaluationFormListSummary = {
  total: number;
  draft: number;
  active: number;
  inactive: number;
  archived: number;
};

export type EvaluationFormListResponse = {
  items: EvaluationForm[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: EvaluationFormListSummary;
};

export type CreateEvaluationQuestionForm = {
  title: string;
  description?: string;
  type?: EvaluationQuestionType;
  maxScore?: number;
  weight?: number;
  sortOrder?: number;
  isRequired?: boolean;
};

export type CreateEvaluationFormForm = {
  companyId?: string;
  code: string;
  name: string;
  description?: string;
  periodType?: EvaluationPeriodType;
  totalScore?: number;
  passScore?: number;
  status?: EvaluationFormStatus;
  questions: CreateEvaluationQuestionForm[];
};

export type UpdateEvaluationFormForm = Partial<CreateEvaluationFormForm>;

export type EvaluationScoreItem = {
  questionId: string;
  title?: string;
  type?: EvaluationQuestionType;
  maxScore?: number;
  weight?: number;
  score?: number;
  textValue?: string | null;
  note?: string | null;
};

export type EvaluationResult = {
  id: string;
  probationRecordId?: string | null;
  companyId: string;
  formId: string;
  employeeId: string;
  evaluatorUserId?: string | null;
  /** ผู้ประเมินที่บันทึกไว้กับใบนี้ */
  evaluatorEmployeeId?: string | null;
  evaluatorEmployee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    position?: string | null;
  } | null;
  periodName?: string | null;
  evaluationDate: string;
  scoreItems?: EvaluationScoreItem[] | null;
  totalScore?: string | number | null;
  maxScore?: string | number | null;
  percent?: string | number | null;
  summary?: string | null;
  recommendation?: string | null;
  note?: string | null;
  status: EvaluationResultStatus;
  submittedAt?: string | null;
  finalizedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
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
  form?: {
    id: string;
    code: string;
    name: string;
    status: EvaluationFormStatus;
  };
  company?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  };
};

export type EvaluationResultListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  formId?: string;
  employeeId?: string;
  status?: EvaluationResultStatus | "";
};

export type EvaluationResultListSummary = {
  total: number;
  draft: number;
  submitted: number;
  finalized: number;
  cancelled: number;
  avgPercent: number;
};

export type EvaluationResultListResponse = {
  items: EvaluationResult[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: EvaluationResultListSummary;
};

export type CreateEvaluationResultForm = {
  companyId: string;
  formId: string;
  employeeId: string;
  /** ผู้ประเมิน (พนักงาน) */
  evaluatorEmployeeId?: string;
  evaluatorUserId?: string;
  periodName?: string;
  evaluationDate: string;
  scoreItems: {
    questionId: string;
    score?: number;
    textValue?: string;
    note?: string;
  }[];
  summary?: string;
  recommendation?: string;
  note?: string;
};

export type UpdateEvaluationResultForm = Partial<CreateEvaluationResultForm>;

export type Evaluator = {
  id: string;
  formId: string;
  employeeId?: string | null;
  evaluatorUserId?: string | null;
  evaluatorEmployeeId?: string | null;
  note?: string | null;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  form?: {
    id: string;
    code: string;
    name: string;
    status: EvaluationFormStatus;
  };
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    position?: string | null;
  } | null;
  evaluatorUser?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    position?: string | null;
  } | null;
};

export type EvaluatorListParams = {
  formId?: string;
  employeeId?: string;
  evaluatorUserId?: string;
  status?: MasterStatus | "";
};

export type CreateEvaluatorForm = {
  formId: string;
  employeeId?: string;
  evaluatorUserId?: string;
  evaluatorEmployeeId?: string;
  note?: string;
  status?: MasterStatus;
};

export type WarningLetter = {
  id: string;
  companyId: string;
  employeeId: string;
  letterNo: string;
  subject: string;
  severity: WarningSeverity;
  status: WarningLetterStatus;
  incidentDate?: string | null;
  issuedDate?: string | null;
  description: string;
  correctiveAction?: string | null;
  employeeResponse?: string | null;
  note?: string | null;
  issuedAt?: string | null;
  acknowledgedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  };
  employee?: {
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
  disciplinaryHistories?: DisciplinaryHistory[];
};

export type WarningLetterListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  employeeId?: string;
  status?: WarningLetterStatus | "";
  severity?: WarningSeverity | "";
  dateFrom?: string;
  dateTo?: string;
};

export type WarningLetterListSummary = {
  total: number;
  draft: number;
  issued: number;
  acknowledged: number;
  cancelled: number;
};

export type WarningLetterListResponse = {
  items: WarningLetter[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: WarningLetterListSummary;
};

export type CreateWarningLetterForm = {
  companyId: string;
  employeeId: string;
  letterNo?: string;
  subject: string;
  severity?: WarningSeverity;
  incidentDate?: string;
  issuedDate?: string;
  description: string;
  correctiveAction?: string;
  employeeResponse?: string;
  note?: string;
};

export type UpdateWarningLetterForm = Partial<CreateWarningLetterForm>;

export type WarningLetterActionForm = {
  note?: string;
  employeeResponse?: string;
  cancelReason?: string;
};

export type DisciplinaryHistory = {
  id: string;
  companyId: string;
  employeeId: string;
  warningLetterId?: string | null;
  type: DisciplinaryHistoryType;
  eventDate: string;
  title: string;
  detail: string;
  actionTaken?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: {
    id: string;
    code: string;
    nameTh: string;
    nameEn?: string | null;
  };
  employee?: {
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
  warningLetter?: {
    id: string;
    letterNo: string;
    subject: string;
    severity: WarningSeverity;
    status: WarningLetterStatus;
  } | null;
};

export type DisciplinaryHistoryListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  employeeId?: string;
  warningLetterId?: string;
  type?: DisciplinaryHistoryType | "";
  dateFrom?: string;
  dateTo?: string;
};

export type DisciplinaryHistoryListSummary = {
  total: number;
  warning: number;
  acknowledgement: number;
  incident: number;
  note: number;
};

export type DisciplinaryHistoryListResponse = {
  items: DisciplinaryHistory[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: DisciplinaryHistoryListSummary;
};

export type CreateDisciplinaryHistoryForm = {
  companyId: string;
  employeeId: string;
  warningLetterId?: string;
  type?: DisciplinaryHistoryType;
  eventDate: string;
  title: string;
  detail: string;
  actionTaken?: string;
  note?: string;
};