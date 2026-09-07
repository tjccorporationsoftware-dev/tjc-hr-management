import { Prisma } from '../../../generated/prisma/client';

/**
 * Employee shape ที่ resolver ต้องใช้ในการหา matrix และผู้อนุมัติ
 *
 * ใช้ type แบบ structural แทนการผูกกับ Employee model เต็ม ๆ เพื่อให้
 * Leave / OT / TimeAdjust ส่ง employee object ของตัวเองเข้ามาได้ง่าย
 */
export type ApprovalRequesterEmployee = {
  id?: string;
  companyId: string;
  branchId: string | null;
  departmentId: string | null;
  employeeTypeId: string | null;
  supervisorId?: string | null;
};

/**
 * Approval Matrix พร้อม steps ที่ active แล้ว
 * ใช้เป็นผลลัพธ์ของ findApplicableMatrix()
 */
export type ApprovalMatrixWithSteps = Prisma.ApprovalMatrixGetPayload<{
  include: {
    steps: true;
  };
}>;

/**
 * ผลลัพธ์หลัง resolver หา approver ของแต่ละ step สำเร็จ
 * แต่ละ module จะเอาข้อมูลนี้ไป create table step ของตัวเอง เช่น
 * LeaveApprovalStep / OvertimeApprovalStep / TimeAdjustApprovalStep
 */
export type ResolvedApprovalStep = {
  step: Prisma.ApprovalMatrixStepGetPayload<{}>;
  expectedApproverId: string;
  expectedEmployeeId: string | null;
};
