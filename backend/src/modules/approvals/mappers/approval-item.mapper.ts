import {
  getApprovalDisplayStatus,
  pickScopedStep,
} from '../helpers/approval-scope.helper';
import {
  ApprovalItem,
  ApprovalLogSummary,
  ApprovalStepSummary,
  ApproverEmployee,
} from '../types/approval-center.types';

/**
 * approval-item.mapper.ts
 *
 * แปลงข้อมูลจาก module เจ้าของงานให้เป็นรูปกลาง ApprovalItem
 * เพื่อให้หน้า Approval Center แสดง Leave / OT / Time Adjust / Offsite / Document ได้มาตรฐานเดียวกัน
 */

export function employeeInclude() {
  return {
    select: {
      id: true,
      employeeCode: true,
      title: true,
      firstName: true,
      lastName: true,
      displayName: true,
      position: true,
      userId: true,
      company: { select: { id: true, code: true, nameTh: true } },
      branch: { select: { id: true, code: true, nameTh: true } },
      department: { select: { id: true, code: true, nameTh: true } },
      division: { select: { id: true, code: true, nameTh: true } },
      employeeType: { select: { id: true, code: true, nameTh: true } },
      positionMaster: { select: { id: true, code: true, nameTh: true, nameEn: true, level: true } },
      user: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
    },
  };
}

export function approvalStepInclude() {
  return {
    expectedApprover: { select: { id: true, email: true, displayName: true } },
    expectedEmployee: {
      select: {
        id: true,
        employeeCode: true,
        title: true,
        firstName: true,
        lastName: true,
        displayName: true,
        position: true,
        userId: true,
        user: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
      },
    },
    position: { select: { id: true, code: true, nameTh: true } },
    actedBy: { select: { id: true, email: true, displayName: true } },
  };
}

export function approvalLogUserInclude() {
  return {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  };
}

function mapAttachments(attachments: any[] = []) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    title: attachment.title ?? null,
    fileName: attachment.fileName ?? null,
    fileSize: attachment.fileSize ?? null,
    mimeType: attachment.mimeType ?? null,
    createdAt: attachment.createdAt ?? null,
  }));
}

export function mapLeaveApprovalItem(item: any, approver: ApproverEmployee): ApprovalItem {
  const scopedStep = pickScopedStep(item.approvalSteps ?? [], approver);
  const displayStatus = getApprovalDisplayStatus(item.status, scopedStep);

  return {
    id: item.id,
    type: 'LEAVE',
    requestNo: item.requestNo ?? null,
    title: item.leaveType?.nameTh ?? 'ใบลา',
    reason: item.reason ?? null,
    status: displayStatus,
    requestStatus: item.status,
    submittedAt: item.submittedAt ?? null,
    createdAt: item.createdAt,
    employee: item.employee ?? null,
    approvalSteps: mapApprovalSteps(item.approvalSteps ?? []),
    approvalLogs: mapApprovalLogs(item.approvalLogs ?? []),
    detail: {
      startDate: item.startDate,
      endDate: item.endDate,
      totalDays: item.totalDays,
      startTime: item.startTime,
      endTime: item.endTime,
      totalMinutes: item.totalMinutes,
      dayType: item.dayType,
      contactInfo: item.contactInfo,
      note: item.note,
      attachmentCount: item.attachments?.length ?? 0,
      attachments: mapAttachments(item.attachments ?? []),
      leaveType: item.leaveType,
      leaveTypeName: item.leaveType?.nameTh ?? 'ใบลา',
      requestStatus: item.status,
      currentApprovalStep: scopedStep ? mapApprovalStep(scopedStep) : null,
    },
  };
}

export function mapOvertimeApprovalItem(item: any, approver: ApproverEmployee): ApprovalItem {
  const scopedStep = pickScopedStep(item.approvalSteps ?? [], approver);
  const displayStatus = getApprovalDisplayStatus(item.status, scopedStep);

  return {
    id: item.id,
    type: 'OVERTIME',
    requestNo: item.requestNo ?? null,
    title: 'คำขอ OT',
    reason: item.reason ?? null,
    status: displayStatus,
    requestStatus: item.status,
    submittedAt: item.submittedAt ?? null,
    createdAt: item.createdAt,
    employee: item.employee ?? null,
    approvalSteps: mapApprovalSteps(item.approvalSteps ?? []),
    approvalLogs: mapApprovalLogs(item.approvalLogs ?? []),
    detail: {
      workDate: item.workDate,
      startTime: item.startTime,
      endTime: item.endTime,
      breakMinutes: item.breakMinutes,
      totalHours: item.totalHours,
      workType: item.workType,
      note: item.note,
      attachmentCount: item.attachments?.length ?? 0,
      attachments: mapAttachments(item.attachments ?? []),
      requestStatus: item.status,
      currentApprovalStep: scopedStep ? mapApprovalStep(scopedStep) : null,
    },
  };
}

export function mapTimeAdjustApprovalItem(item: any, approver: ApproverEmployee): ApprovalItem {
  const scopedStep = pickScopedStep(item.approvalSteps ?? [], approver);
  const displayStatus = getApprovalDisplayStatus(item.status, scopedStep);

  return {
    id: item.id,
    type: 'TIME_ADJUST',
    requestNo: item.requestNo ?? null,
    title: 'คำขอแก้เวลา',
    reason: item.reason ?? null,
    status: displayStatus,
    requestStatus: item.status,
    submittedAt: item.submittedAt ?? null,
    createdAt: item.createdAt,
    employee: item.employee ?? null,
    approvalSteps: mapApprovalSteps(item.approvalSteps ?? []),
    approvalLogs: mapApprovalLogs(item.logs ?? []),
    detail: {
      adjustType: item.adjustType,
      targetLogType: item.targetLogType,
      originalLogTime: item.originalLogTime,
      requestedLogTime: item.requestedLogTime,
      note: item.note,
      originalAttendanceLog: item.originalAttendanceLog,
      attachmentCount: item.attachments?.length ?? 0,
      attachments: mapAttachments(item.attachments ?? []),
      requestStatus: item.status,
      currentApprovalStep: scopedStep ? mapApprovalStep(scopedStep) : null,
    },
  };
}

export function mapApprovalSteps(steps: unknown[]): ApprovalStepSummary[] {
  return steps.map((step) => mapApprovalStep(step));
}

export function mapApprovalStep(step: any): ApprovalStepSummary {
  return {
    id: step.id,
    stepNo: step.stepNo,
    nameTh: step.nameTh,
    description: step.description ?? null,
    approverType: step.approverType,
    expectedApproverId: step.expectedApproverId ?? null,
    expectedEmployeeId: step.expectedEmployeeId ?? null,
    positionId: step.positionId ?? null,
    roleCode: step.roleCode ?? null,
    status: step.status,
    actedAt: step.actedAt ?? null,
    approvedAt: step.status === 'APPROVED' ? step.actedAt ?? null : null,
    rejectedAt: step.status === 'REJECTED' ? step.actedAt ?? null : null,
    reason: step.reason ?? null,
    note: step.note ?? null,
    expectedApprover: step.expectedApprover ?? null,
    expectedEmployee: step.expectedEmployee ?? null,
    position: step.position ?? null,
    actedBy: step.actedBy ?? null,
  };
}

export function mapApprovalLogs(logs: any[]): ApprovalLogSummary[] {
  return logs.map((log) => ({
    id: log.id,
    action: String(log.action ?? ''),
    oldStatus: log.oldStatus ?? null,
    newStatus: log.newStatus ?? null,
    reason: log.reason ?? null,
    note: log.note ?? null,
    createdAt: log.createdAt,
    approvedBy: log.approvedBy ?? null,
    actedBy: log.actedBy ?? log.approvedBy ?? null,
  }));
}
