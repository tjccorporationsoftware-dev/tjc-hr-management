import type { PaginationMeta } from "@/types/employee";
import type { AttendanceLocationType } from "@/types/attendance";

export type OffsiteRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "MANAGER_APPROVED"
  | "HR_APPROVED"
  | "MANAGER_REJECTED"
  | "HR_REJECTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type GpsVerificationStatus = "PASSED" | "WARNING" | "NEED_REVIEW";

export type OffsiteUserRef = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type OffsiteEmployeeRef = {
  id: string;
  employeeCode: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  position?: string | null;
  userId?: string | null;
  user?: OffsiteUserRef | null;
  positionMaster?: { id: string; code: string; nameTh: string; nameEn?: string | null; level?: number | null } | null;
  company?: { id: string; code: string; nameTh: string } | null;
  branch?: { id: string; code: string; nameTh: string } | null;
  department?: { id: string; code: string; nameTh: string } | null;
  division?: { id: string; code: string; nameTh: string } | null;
  employeeType?: { id: string; code: string; nameTh: string } | null;
};

export type OffsiteApprovalStepSnapshot = {
  stepNo: number;
  nameTh: string;
  approverType: string;
  expectedApproverId: string | null;
  expectedEmployeeId: string | null;
  expectedApprover?: OffsiteUserRef | null;
  expectedEmployee?: OffsiteEmployeeRef | null;
  roleCode?: string | null;
  status: "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  actedAt?: string | null;
  actedById?: string | null;
  actedBy?: OffsiteUserRef | null;
  reason?: string | null;
  note?: string | null;
};

export type OffsiteApprovalSnapshot = {
  matrixId: string;
  matrixCode: string;
  matrixNameTh: string;
  submittedAt: string;
  submittedById: string;
  steps: OffsiteApprovalStepSnapshot[];
};

export type OffsiteWorkRequest = {
  id: string;
  requestNo: string | null;
  companyId: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  locationType?: AttendanceLocationType;
  locationName?: string;
  address?: string | null;
  /** ข้อมูลเก่าก่อนยกเลิก GPS/รัศมี อาจยังมีค่าอยู่ */
  latitude?: string | number | null;
  longitude?: string | number | null;
  radiusMeters?: number;
  reason: string;
  attachmentUrl: string | null;
  status: OffsiteRequestStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  submittedById: string | null;
  approvedById: string | null;
  rejectedById: string | null;
  cancelledById: string | null;
  policySnapshot: Record<string, unknown> | null;
  approvalSnapshot: OffsiteApprovalSnapshot | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  employee?: OffsiteEmployeeRef | null;
  submittedBy?: OffsiteUserRef | null;
  approvedBy?: OffsiteUserRef | null;
  rejectedBy?: OffsiteUserRef | null;
  cancelledBy?: OffsiteUserRef | null;
};

export type OffsiteWorkRequestListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  employeeId?: string;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  divisionId?: string;
  employeeTypeId?: string;
  status?: OffsiteRequestStatus;
  excludeDraft?: "true" | "false" | "1" | "0";
  locationType?: AttendanceLocationType;
  dateFrom?: string;
  dateTo?: string;
  attachmentStatus?: "HAS_ATTACHMENT" | "NO_ATTACHMENT";
};

export type OffsiteWorkRequestListSummary = {
  total: number;
  draft: number;
  submitted: number;
  managerApproved: number;
  hrApproved: number;
  pending: number;
  approvedOnly?: number;
  approved: number;
  rejected: number;
  rejectedOnly?: number;
  managerRejected?: number;
  hrRejected?: number;
  cancelled: number;
  withAttachment?: number;
  withoutAttachment?: number;
  today?: number;
};

export type OffsiteWorkRequestListResponse = {
  items: OffsiteWorkRequest[];
  meta: PaginationMeta;
  summary?: OffsiteWorkRequestListSummary;
};

export type CreateOffsiteWorkRequestForm = {
  employeeId?: string;
  workDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  attachmentUrl?: string;
  submit?: boolean;
};

export type UpdateOffsiteWorkRequestForm = Partial<CreateOffsiteWorkRequestForm>;

export type OffsiteWorkActionForm = {
  reason?: string;
  note?: string;
};

export type VerifyOffsiteLocationForm = {
  offsiteRequestId: string;
  punchedAt?: string;
};

export type VerifyOffsiteLocationResponse = {
  status: GpsVerificationStatus;
  locationVerified: boolean;
  distanceMeters: null;
  reasons: string[];
  verificationMode?: "APPROVED_DATE_TIME";
  request: OffsiteWorkRequest;
};
