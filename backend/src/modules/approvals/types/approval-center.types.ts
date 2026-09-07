import { ApprovalRequestKind } from '../dto/list-approval-requests-query.dto';

/**
 * types/approval-center.types.ts
 *
 * รวม type ภายในของ Approval Center
 * แยกไว้เพื่อให้ approvals.service.ts ไม่ยาว และให้ mapper/helper ใช้ type เดียวกัน
 */

/** รูปแบบ current user ที่มาจาก Auth Guard / CurrentUser decorator */
export type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

/**
 * ข้อมูล employee ของผู้อนุมัติปัจจุบัน
 * ใช้เช็ก scope ว่ารายการไหนควรแสดงให้ user นี้เห็น
 */
export type ApproverEmployee = {
  id: string;
  userId: string | null;
  companyId: string;
  branchId: string | null;
  departmentId: string | null;
  divisionId: string | null;
  positionId: string | null;
  roleCodes?: string[];
};

/** สถานะที่ frontend ใช้แสดงในตาราง Approval Center */
export type ApprovalDisplayStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RETURNED';

/**
 * Summary ของ approval step ที่ส่งกลับไปให้ frontend
 * ใช้แสดง timeline / modal รายละเอียดว่าแต่ละขั้นใครอนุมัติแล้วบ้าง
 */
export type ApprovalStepSummary = {
  id: string;
  stepNo: number;
  nameTh: string;
  description: string | null;
  approverType: string;
  expectedApproverId: string | null;
  expectedEmployeeId: string | null;
  positionId?: string | null;
  roleCode?: string | null;
  status: string;
  actedAt?: Date | null;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  reason?: string | null;
  note?: string | null;
  expectedApprover?: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
  expectedEmployee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
  } | null;
  position?: {
    id: string;
    code: string;
    nameTh: string;
  } | null;
  actedBy?: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
};

/**
 * รูปแบบข้อมูลกลางที่ frontend ใช้แสดงทุกประเภทคำขอในตารางเดียวกัน
 * ไม่ว่าจะเป็น Leave / OT / Time Adjust จะถูก map เป็น ApprovalItem เหมือนกัน
 */
export type ApprovalItem = {
  id: string;
  type: Exclude<ApprovalRequestKind, 'ALL'>;
  requestNo: string | null;
  title: string;
  reason: string | null;

  /** สถานะที่แสดงบนหน้า Approval Center ในมุมของผู้อนุมัติปัจจุบัน */
  status: ApprovalDisplayStatus;

  /** สถานะจริงของ request ใน table ต้นทาง เช่น leaveRequest.status */
  requestStatus: string;

  submittedAt: Date | null;
  createdAt: Date;
  employee: {
    id: string;
    employeeCode: string;
    title?: string | null;
    displayName: string | null;
    firstName: string;
    lastName: string;
    position: string | null;
    company?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
    branch?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
    department?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
    division?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
    employeeType?: {
      id: string;
      code: string;
      nameTh: string;
    } | null;
    positionMaster?: {
      id: string;
      code: string;
      nameTh: string;
      nameEn?: string | null;
      level?: number | null;
    } | null;
    user?: {
      id: string;
      email: string;
      displayName: string | null;
      avatarUrl?: string | null;
    } | null;
  } | null;
  approvalSteps: ApprovalStepSummary[];
  approvalLogs?: ApprovalLogSummary[];

  /** detail เก็บข้อมูลเฉพาะประเภท เช่น วันลา, ชั่วโมง OT, เวลาใหม่ */
  detail: Record<string, unknown>;
};

/**
 * Type ขั้นต่ำของ approval step ที่ใช้ใน helper scope
 * ไม่ผูกกับ Prisma model เฉพาะตัว เพื่อให้ใช้ได้กับ Leave/OT/TimeAdjust
 */
export type ApprovalLogSummary = {
  id: string;
  action: string;
  oldStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt: Date | string;
  actedBy?: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
  approvedBy?: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
};

export type ApprovalStepForScope = {
  status: string;
  expectedEmployeeId: string | null;
  expectedApproverId: string | null;
  positionId?: string | null;
  roleCode?: string | null;
  approverType?: string | null;
  actedById?: string | null;
  stepNo: number;
};
