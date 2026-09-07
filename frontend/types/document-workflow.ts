export type MasterStatus = "ACTIVE" | "INACTIVE";

export type DocumentRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type DocumentApprovalAction =
  | "SUBMIT"
  | "APPROVE_LEVEL_1"
  | "APPROVE_LEVEL_2"
  | "APPROVE"
  | "REJECT"
  | "CANCEL";

export type DocumentFileType =
  | "ATTACHMENT"
  | "GENERATED_PDF"
  /** หนังสือฉบับที่ลงนามและประทับตราแล้ว */
  | "SIGNED_DOCUMENT";

export type ComplaintStatus =
  | "SUBMITTED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

export type DocumentCompany = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
};

export type DocumentEmployee = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  branch?: { id: string; nameTh: string } | null;
};

export type DocumentUser = {
  id: string;
  email: string;
  displayName: string;
};

export type DocumentType = {
  id: string;
  companyId?: string | null;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  description?: string | null;
  category?: string | null;
  requiresApproval: boolean;
  approvalLevels: number;
  allowEmployeeRequest: boolean;
  status: MasterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: DocumentCompany | null;
};

export type DocumentApproval = {
  id: string;
  documentRequestId: string;
  level: number;
  action: DocumentApprovalAction;
  oldStatus?: DocumentRequestStatus | null;
  newStatus?: DocumentRequestStatus | null;
  reason?: string | null;
  note?: string | null;
  actedById?: string | null;
  actedAt: string;
  createdAt: string;
  actedBy?: DocumentUser | null;
};

export type DocumentFile = {
  id: string;
  documentRequestId: string;
  fileType: DocumentFileType;
  title: string;
  description?: string | null;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  storageProvider: string;
  storageKey: string;
  bucketName?: string | null;
  uploadedById?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  uploadedBy?: DocumentUser | null;
};

export type DocumentTemplate = {
  id: string;
  companyId?: string | null;
  documentTypeId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  htmlContent?: string | null;
  config?: Record<string, unknown> | null;
  version: number;
  status: MasterStatus;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: DocumentCompany | null;
  documentType?: Pick<
    DocumentType,
    "id" | "code" | "nameTh" | "nameEn" | "category"
  > | null;
  createdBy?: DocumentUser | null;
};

export type DocumentRequest = {
  id: string;
  requestNo: string;
  /** เลขที่หนังสือจริง — ออกตอนอนุมัติขั้นสุดท้ายเท่านั้น */
  documentNo?: string | null;
  issuedAt?: string | null;
  companyId: string;
  employeeId?: string | null;
  documentTypeId: string;
  title: string;
  purpose?: string | null;
  requestData?: Record<string, unknown> | null;
  note?: string | null;
  status: DocumentRequestStatus;
  currentLevel: number;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  submittedById?: string | null;
  approvedById?: string | null;
  rejectedById?: string | null;
  cancelledById?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  company?: DocumentCompany;
  employee?: DocumentEmployee | null;
  documentType?: DocumentType;
  submittedBy?: DocumentUser | null;
  approvedBy?: DocumentUser | null;
  rejectedBy?: DocumentUser | null;
  cancelledBy?: DocumentUser | null;
  approvals?: DocumentApproval[];
  files?: DocumentFile[];
};

export type Complaint = {
  id: string;
  complaintNo: string;
  companyId: string;
  employeeId?: string | null;
  title: string;
  category?: string | null;
  description: string;
  expectation?: string | null;
  note?: string | null;
  status: ComplaintStatus;
  submittedAt: string;
  handledAt?: string | null;
  closedAt?: string | null;
  cancelledAt?: string | null;
  submittedById?: string | null;
  handledById?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  company?: DocumentCompany;
  employee?: DocumentEmployee | null;
  submittedBy?: DocumentUser | null;
  handledBy?: DocumentUser | null;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DocumentTypeListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  companyId?: string;
  category?: string;
  status?: MasterStatus;
};

export type DocumentRequestListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  companyId?: string;
  branchId?: string;
  employeeId?: string;
  documentTypeId?: string;
  status?: DocumentRequestStatus;
  dateFrom?: string;
  dateTo?: string;
};

export type DocumentTemplateListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  companyId?: string;
  documentTypeId?: string;
  status?: MasterStatus;
};

export type ComplaintListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  companyId?: string;
  branchId?: string;
  employeeId?: string;
  category?: string;
  status?: ComplaintStatus;
  dateFrom?: string;
  dateTo?: string;
};

export type DocumentTypeListResponse = {
  items: DocumentType[];
  meta: PaginationMeta;
};

export type DocumentRequestListSummary = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
};

export type DocumentRequestListResponse = {
  items: DocumentRequest[];
  meta: PaginationMeta;
  summary?: DocumentRequestListSummary;
};

export type DocumentTemplateListResponse = {
  items: DocumentTemplate[];
  meta: PaginationMeta;
};

export type ComplaintListResponse = {
  items: Complaint[];
  meta: PaginationMeta;
};

export type CreateDocumentTypeForm = {
  companyId?: string | null;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  description?: string | null;
  category?: string | null;
  requiresApproval?: boolean;
  approvalLevels?: number;
  allowEmployeeRequest?: boolean;
};

export type UpdateDocumentTypeForm = Partial<CreateDocumentTypeForm> & {
  status?: MasterStatus;
};

export type CreateDocumentTemplateForm = {
  companyId?: string | null;
  documentTypeId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  htmlContent?: string | null;
  config?: Record<string, unknown>;
  status?: MasterStatus;
};

export type UpdateDocumentTemplateForm = Partial<CreateDocumentTemplateForm>;

export type CreateDocumentRequestForm = {
  companyId?: string;
  employeeId?: string | null;
  documentTypeId: string;
  title: string;
  purpose?: string | null;
  requestData?: Record<string, unknown>;
  note?: string | null;
  submit?: boolean;
};

export type UpdateDocumentRequestForm = {
  documentTypeId?: string;
  title?: string;
  purpose?: string | null;
  requestData?: Record<string, unknown>;
  note?: string | null;
};

export type DocumentRequestActionForm = {
  reason?: string;
  note?: string;
};

export type GenerateDocumentPdfForm = {
  templateId?: string;
  title?: string;
};

export type RenderDocumentResponse = {
  requestId: string;
  requestNo: string;
  templateId: string;
  templateCode: string;
  templateName: string;
  html: string;
};

export type DocumentPreset = {
  code: string;
  nameTh: string;
  category: string;
  endpoint: string;
  description: string;
};

export type CreateWorkCertificateRequestForm = {
  companyId?: string;
  employeeId?: string | null;
  purpose?: string | null;
  issueTo?: string | null;
  language?: "TH" | "EN" | "TH_EN";
  extraData?: Record<string, unknown>;
  submit?: boolean;
};

export type CreateSalaryCertificateRequestForm =
  CreateWorkCertificateRequestForm & {
    salaryDisplayMode?: "MONTHLY_ONLY" | "MONTHLY_AND_ALLOWANCE" | "CUSTOM";
  };

export type CreateVisaCertificateRequestForm = {
  companyId?: string;
  employeeId?: string | null;
  purpose?: string | null;
  embassyName?: string | null;
  country?: string | null;
  travelDateFrom?: string | null;
  travelDateTo?: string | null;
  language?: "TH" | "EN" | "TH_EN";
  extraData?: Record<string, unknown>;
  submit?: boolean;
};

export type CreateResignDocumentRequestForm = {
  companyId?: string;
  employeeId?: string | null;
  effectiveDate: string;
  reason: string;
  handoverNote?: string | null;
  assetReturnNote?: string | null;
  extraData?: Record<string, unknown>;
  submit?: boolean;
};

export type CreateComplaintForm = {
  companyId?: string;
  employeeId?: string | null;
  title: string;
  category?: string | null;
  description: string;
  expectation?: string | null;
  note?: string | null;
};

export type UpdateComplaintForm = Partial<CreateComplaintForm>;

export type ComplaintActionForm = {
  note?: string;
};