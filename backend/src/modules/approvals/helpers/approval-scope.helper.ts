import { Prisma } from '../../../generated/prisma/client';
import { ApprovalRequestStatusFilter } from '../dto/list-approval-requests-query.dto';
import {
  ApprovalDisplayStatus,
  ApproverEmployee,
  ApprovalStepForScope,
} from '../types/approval-center.types';

/**
 * approval-scope.helper.ts
 *
 * รวม logic สำหรับกำหนดว่า “ผู้อนุมัติปัจจุบันควรเห็นรายการใด”
 *
 * แนวคิดหลัก:
 * - SUBMITTED: เห็นรายการที่ step ปัจจุบันเป็น PENDING และรอ user/employee/role/position คนนี้อนุมัติ
 * - APPROVED: เห็นรายการที่ user คนนี้เคยอนุมัติแล้ว
 * - REJECTED: เห็นรายการที่ user คนนี้เคยไม่อนุมัติแล้ว
 * - ALL: รวมทั้ง 3 กลุ่มด้านบน
 */

export function buildLeaveApprovalStepScopeWhere(
  approver: ApproverEmployee,
  status: ApprovalRequestStatusFilter,
): Prisma.LeaveApprovalStepWhereInput {
  if (status === 'SUBMITTED') return buildCurrentLeaveApprovalStepWhere(approver);
  if (status === 'APPROVED') return buildActedLeaveApprovalStepWhere(approver, 'APPROVED');
  if (status === 'REJECTED') return buildActedLeaveApprovalStepWhere(approver, 'REJECTED');
  if (status === 'RETURNED') return buildReturnedLeaveApprovalStepWhere(approver);

  return {
    OR: [
      buildCurrentLeaveApprovalStepWhere(approver),
      buildActedLeaveApprovalStepWhere(approver, 'APPROVED'),
      buildActedLeaveApprovalStepWhere(approver, 'REJECTED'),
      buildReturnedLeaveApprovalStepWhere(approver),
    ],
  };
}

export function buildOvertimeApprovalStepScopeWhere(
  approver: ApproverEmployee,
  status: ApprovalRequestStatusFilter,
): Prisma.OvertimeApprovalStepWhereInput {
  if (status === 'SUBMITTED') return buildCurrentOvertimeApprovalStepWhere(approver);
  if (status === 'APPROVED') return buildActedOvertimeApprovalStepWhere(approver, 'APPROVED');
  if (status === 'REJECTED') return buildActedOvertimeApprovalStepWhere(approver, 'REJECTED');
  if (status === 'RETURNED') return buildReturnedOvertimeApprovalStepWhere(approver);

  return {
    OR: [
      buildCurrentOvertimeApprovalStepWhere(approver),
      buildActedOvertimeApprovalStepWhere(approver, 'APPROVED'),
      buildActedOvertimeApprovalStepWhere(approver, 'REJECTED'),
      buildReturnedOvertimeApprovalStepWhere(approver),
    ],
  };
}

export function buildTimeAdjustApprovalStepScopeWhere(
  approver: ApproverEmployee,
  status: ApprovalRequestStatusFilter,
): Prisma.TimeAdjustApprovalStepWhereInput {
  if (status === 'SUBMITTED') return buildCurrentTimeAdjustApprovalStepWhere(approver);
  if (status === 'APPROVED') return buildActedTimeAdjustApprovalStepWhere(approver, 'APPROVED');
  if (status === 'REJECTED') return buildActedTimeAdjustApprovalStepWhere(approver, 'REJECTED');
  if (status === 'RETURNED') return buildReturnedTimeAdjustApprovalStepWhere(approver);

  return {
    OR: [
      buildCurrentTimeAdjustApprovalStepWhere(approver),
      buildActedTimeAdjustApprovalStepWhere(approver, 'APPROVED'),
      buildActedTimeAdjustApprovalStepWhere(approver, 'REJECTED'),
      buildReturnedTimeAdjustApprovalStepWhere(approver),
    ],
  };
}

function buildCurrentApprovalStepConditions(
  approver: ApproverEmployee,
): Array<Record<string, unknown>> {
  const conditions: Array<Record<string, unknown>> = [
    { expectedEmployeeId: approver.id },
  ];

  if (approver.userId) {
    conditions.push({ expectedApproverId: approver.userId });
  }

  if (approver.positionId) {
    conditions.push({ positionId: approver.positionId });
  }

  const roleCodes = normalizeRoleCodes(approver.roleCodes);
  if (roleCodes.length > 0) {
    conditions.push({ roleCode: { in: roleCodes } });
  }

  if (hasHrRole(roleCodes)) {
    conditions.push({ approverType: { in: ['HR_ADMIN'] } });
  }

  if (hasExecutiveRole(roleCodes)) {
    conditions.push({ approverType: { in: ['EXECUTIVE'] } });
  }

  if (hasAdminRole(roleCodes)) {
    conditions.push({ approverType: { in: ['HR_ADMIN', 'EXECUTIVE'] } });
  }

  return conditions;
}

export function buildCurrentLeaveApprovalStepWhere(
  approver: ApproverEmployee,
): Prisma.LeaveApprovalStepWhereInput {
  return {
    status: 'PENDING',
    OR: buildCurrentApprovalStepConditions(approver) as Prisma.LeaveApprovalStepWhereInput[],
  };
}

export function buildCurrentOvertimeApprovalStepWhere(
  approver: ApproverEmployee,
): Prisma.OvertimeApprovalStepWhereInput {
  return {
    status: 'PENDING',
    OR: buildCurrentApprovalStepConditions(approver) as Prisma.OvertimeApprovalStepWhereInput[],
  };
}

export function buildCurrentTimeAdjustApprovalStepWhere(
  approver: ApproverEmployee,
): Prisma.TimeAdjustApprovalStepWhereInput {
  return {
    status: 'PENDING',
    OR: buildCurrentApprovalStepConditions(approver) as Prisma.TimeAdjustApprovalStepWhereInput[],
  };
}


function buildReturnedLeaveApprovalStepWhere(
  approver: ApproverEmployee,
): Prisma.LeaveApprovalStepWhereInput {
  if (!approver.userId) return { id: '__NO_MATCH__' };
  return { status: 'CANCELLED', actedById: approver.userId };
}

function buildReturnedOvertimeApprovalStepWhere(
  approver: ApproverEmployee,
): Prisma.OvertimeApprovalStepWhereInput {
  if (!approver.userId) return { id: '__NO_MATCH__' };
  return { status: 'CANCELLED', actedById: approver.userId };
}

function buildReturnedTimeAdjustApprovalStepWhere(
  approver: ApproverEmployee,
): Prisma.TimeAdjustApprovalStepWhereInput {
  if (!approver.userId) return { id: '__NO_MATCH__' };
  return { status: 'CANCELLED', actedById: approver.userId };
}

function buildActedLeaveApprovalStepWhere(
  approver: ApproverEmployee,
  status: 'APPROVED' | 'REJECTED',
): Prisma.LeaveApprovalStepWhereInput {
  if (!approver.userId) return { id: '__NO_MATCH__' };
  return { status, actedById: approver.userId };
}

function buildActedOvertimeApprovalStepWhere(
  approver: ApproverEmployee,
  status: 'APPROVED' | 'REJECTED',
): Prisma.OvertimeApprovalStepWhereInput {
  if (!approver.userId) return { id: '__NO_MATCH__' };
  return { status, actedById: approver.userId };
}

function buildActedTimeAdjustApprovalStepWhere(
  approver: ApproverEmployee,
  status: 'APPROVED' | 'REJECTED',
): Prisma.TimeAdjustApprovalStepWhereInput {
  if (!approver.userId) return { id: '__NO_MATCH__' };
  return { status, actedById: approver.userId };
}

export function pickScopedStep<TStep extends ApprovalStepForScope>(
  steps: TStep[],
  approver: ApproverEmployee,
): TStep | null {
  return (
    steps.find((step) => step.status === 'PENDING' && isStepExpectedForApprover(step, approver)) ??
    steps.find((step) => step.status === 'REJECTED' && isStepActedByApprover(step, approver)) ??
    steps.find((step) => step.status === 'APPROVED' && isStepActedByApprover(step, approver)) ??
    steps.find((step) => step.status === 'CANCELLED' && isStepActedByApprover(step, approver)) ??
    null
  );
}

export function isStepExpectedForApprover(
  step: ApprovalStepForScope,
  approver: ApproverEmployee,
) {
  const roleCodes = normalizeRoleCodes(approver.roleCodes);

  if (step.expectedEmployeeId === approver.id) return true;
  if (approver.userId && step.expectedApproverId === approver.userId) return true;
  if (approver.positionId && step.positionId === approver.positionId) return true;
  if (step.roleCode && roleCodes.includes(String(step.roleCode).toUpperCase())) return true;
  if (step.approverType === 'HR_ADMIN' && hasHrRole(roleCodes)) return true;
  if (step.approverType === 'EXECUTIVE' && hasExecutiveRole(roleCodes)) return true;
  if (hasAdminRole(roleCodes) && ['HR_ADMIN', 'EXECUTIVE'].includes(String(step.approverType))) return true;

  return false;
}

function isStepActedByApprover(
  step: ApprovalStepForScope,
  approver: ApproverEmployee,
) {
  return !!approver.userId && step.actedById === approver.userId;
}

export function getApprovalDisplayStatus(
  requestStatus: string,
  scopedStep: { status: string } | null,
): ApprovalDisplayStatus {
  if (scopedStep?.status === 'PENDING') return 'SUBMITTED';
  if (scopedStep?.status === 'APPROVED') return 'APPROVED';
  if (scopedStep?.status === 'REJECTED') return 'REJECTED';
  if (requestStatus === 'DRAFT' && scopedStep?.status === 'CANCELLED') return 'RETURNED';

  if (['APPROVED', 'HR_APPROVED'].includes(requestStatus)) return 'APPROVED';
  if (['REJECTED', 'MANAGER_REJECTED', 'HR_REJECTED'].includes(requestStatus)) return 'REJECTED';

  return 'SUBMITTED';
}

function normalizeRoleCodes(roleCodes?: string[] | null) {
  return Array.from(new Set((roleCodes ?? []).map((code) => String(code).toUpperCase()).filter(Boolean)));
}

function hasHrRole(roleCodes: string[]) {
  return roleCodes.some((code) => ['HR_ADMIN', 'HR_MANAGER', 'HR', 'SYSTEM_ADMIN', 'SUPER_ADMIN', 'ADMIN'].includes(code));
}

function hasExecutiveRole(roleCodes: string[]) {
  return roleCodes.some((code) => ['EXECUTIVE', 'CEO', 'DIRECTOR', 'SYSTEM_ADMIN', 'SUPER_ADMIN', 'ADMIN'].includes(code));
}

function hasAdminRole(roleCodes: string[]) {
  return roleCodes.some((code) => ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'ADMIN'].includes(code));
}
