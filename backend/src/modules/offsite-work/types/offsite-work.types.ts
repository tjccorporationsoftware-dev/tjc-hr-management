export type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string | null;
};

export type GpsVerificationStatus = 'PASSED' | 'WARNING' | 'NEED_REVIEW';

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
  status: 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
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
