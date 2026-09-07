export type JobPostingStatus =
  | "DRAFT"
  | "OPEN"
  | "ON_HOLD"
  | "CLOSED"
  | "CANCELLED";

export type EmploymentTypeTag =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERN"
  | "TEMPORARY";

export type JobApplicationStage =
  | "NEW"
  | "SCREENING"
  | "INTERVIEW"
  | "OFFER"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN";

export type InterviewResult = "PENDING" | "PASSED" | "FAILED" | "NO_SHOW";

export type JobOfferStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED";

export type RecruitmentListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type OrgRef = { id: string; code: string; nameTh?: string | null };

/* ---------------- Posting ---------------- */

export type JobPosting = {
  id: string;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  code: string;
  title: string;
  employmentType: EmploymentTypeTag;
  openings: number;
  description?: string | null;
  requirement?: string | null;
  salaryMin?: string | number | null;
  salaryMax?: string | number | null;
  workLocation?: string | null;
  status: JobPostingStatus;
  openedAt?: string | null;
  closedAt?: string | null;
  closingDate?: string | null;
  createdAt: string;
  company?: OrgRef | null;
  department?: OrgRef | null;
  branch?: OrgRef | null;
  _count?: { applications: number };
};

export type JobPostingListSummary = {
  total: number;
  open: number;
  draft: number;
  closed: number;
};

export type JobPostingListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  status?: JobPostingStatus | "";
  departmentId?: string;
};

export type CreateJobPostingForm = {
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  positionId?: string;
  code: string;
  title: string;
  employmentType?: EmploymentTypeTag;
  openings?: number;
  description?: string;
  requirement?: string;
  salaryMin?: number;
  salaryMax?: number;
  workLocation?: string;
  status?: JobPostingStatus;
  closingDate?: string;
};

/* ---------------- Interview / Offer ---------------- */

export type JobInterview = {
  id: string;
  applicationId: string;
  round: number;
  scheduledAt: string;
  location?: string | null;
  interviewerName?: string | null;
  result: InterviewResult;
  score?: number | null;
  strength?: string | null;
  weakness?: string | null;
  note?: string | null;
  completedAt?: string | null;
};

export type JobOffer = {
  id: string;
  applicationId: string;
  offeredSalary: string | number;
  startDate: string;
  probationDays: number;
  expiresAt?: string | null;
  benefitNote?: string | null;
  note?: string | null;
  status: JobOfferStatus;
  sentAt?: string | null;
  respondedAt?: string | null;
  /** ผู้ใช้ที่บันทึกคำตอบแทนผู้สมัคร — ผู้สมัครไม่ได้เข้าระบบเอง */
  respondedById?: string | null;
  respondedBy?: { id: string; displayName?: string | null } | null;
};

/* ---------------- Application ---------------- */

export type JobApplication = {
  id: string;
  companyId: string;
  postingId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  currentPosition?: string | null;

  /** ข้อมูลส่วนตัว/ประวัติ/การศึกษา — เก็บตั้งแต่ตอนสมัคร ไม่ต้องถามซ้ำตอนจ้าง */
  nationalId?: string | null;
  birthDate?: string | null;
  address?: string | null;
  currentCompany?: string | null;
  currentSalary?: string | number | null;
  yearsOfExperience?: number | null;
  educationLevel?: string | null;
  educationInstitute?: string | null;
  educationMajor?: string | null;
  resumeUrl?: string | null;

  expectedSalary?: string | number | null;
  availableFrom?: string | null;
  source?: string | null;
  note?: string | null;
  stage: JobApplicationStage;
  rejectReason?: string | null;
  screeningScore?: number | null;
  appliedAt: string;
  stagedAt: string;
  hiredEmployeeId?: string | null;
  posting?: {
    id: string;
    code: string;
    title: string;
    status: JobPostingStatus;
    openings: number;
  };
  hiredEmployee?: {
    id: string;
    employeeCode: string;
    displayName?: string | null;
  } | null;
  interviews?: JobInterview[];
  offers?: JobOffer[];
  _count?: { interviews: number; offers: number };
};

export type JobApplicationListSummary = {
  total: number;
  new: number;
  screening: number;
  interview: number;
  offer: number;
  hired: number;
  rejected: number;
  withdrawn: number;
};

export type JobApplicationListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  postingId?: string;
  stage?: JobApplicationStage | "";
};

export type CreateJobApplicationForm = {
  postingId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  currentPosition?: string;
  expectedSalary?: number;
  availableFrom?: string;
  source?: string;
  note?: string;

  /** ข้อมูลส่วนตัว/ประวัติ/การศึกษา ที่เก็บตั้งแต่ตอนสมัคร */
  nationalId?: string;
  birthDate?: string;
  address?: string;
  currentCompany?: string;
  currentSalary?: number;
  yearsOfExperience?: number;
  educationLevel?: string;
  educationInstitute?: string;
  educationMajor?: string;
  resumeUrl?: string;
};

export type CreateJobInterviewForm = {
  applicationId: string;
  round?: number;
  scheduledAt: string;
  location?: string;
  interviewerName?: string;
  /** บัญชีผู้ใช้ของผู้สัมภาษณ์ — มีเฉพาะพนักงานที่ผูกบัญชีไว้แล้ว */
  interviewerId?: string;
  note?: string;
};

export type RecordInterviewResultForm = {
  result: InterviewResult;
  score?: number;
  strength?: string;
  weakness?: string;
  note?: string;
};

export type CreateJobOfferForm = {
  applicationId: string;
  offeredSalary: number;
  startDate: string;
  probationDays?: number;
  expiresAt?: string;
  benefitNote?: string;
  note?: string;
};

export type HireApplicantForm = {
  branchId?: string;
  departmentId?: string;
  positionId?: string;
  supervisorId?: string;
  startDate?: string;
  probationDays?: number;
};

export type HireApplicantResult = {
  employee: {
    id: string;
    employeeCode: string;
    displayName?: string | null;
    startDate: string;
    probationEndDate?: string | null;
    status: string;
  };
  applicationId: string;
  /** บัญชีเข้าระบบที่เปิดให้อัตโนมัติตอนจ้าง */
  account?: {
    created: boolean;
    userId?: string;
    email?: string;
    /** รหัสเริ่มต้น ส่งกลับมาครั้งเดียวเพื่อให้ HR ส่งต่อ */
    temporaryPassword?: string;
    /** PHONE = ใช้เบอร์โทรพนักงาน · RANDOM = ระบบสุ่มให้ */
    passwordSource?: "PHONE" | "RANDOM";
    /** ขอบเขตที่บัญชีได้ — ตั้งใจให้เป็น BRANCH เสมอ */
    scopeLevel?: "COMPANY" | "BRANCH";
    /** บอกเหตุผลเมื่อไม่ได้ขอบเขตระดับสาขาตามที่ตั้งใจ */
    scopeNote?: string;
    note?: string;
    reason?: string;
  } | null;
};
