import { ApprovalMatrixTargetType } from '../../../generated/prisma/client';

/**
 * ประเภทรายการที่สายอนุมัติ (ApprovalMatrix) ใช้งานได้จริง
 * -----------------------------------------------------------------------------
 * enum ในสคีมามี 8 ค่า แต่มีเพียง 4 ค่าที่มีโค้ดเรียก resolver จริง
 * อีก 4 ค่าตั้งค่าได้จากหน้าจอแต่ไม่มีผลใด ๆ:
 *
 *   DOCUMENT_REQUEST  มีเอนทิตี แต่ใช้สายอนุมัติของตัวเอง (2 ชั้นตายตัว)
 *                     ผูกกับ documentType.approvalLevels ไม่ผ่าน matrix
 *   PAYROLL_RUN       มีเอนทิตี แต่คุมด้วยสิทธิ์ล้วน ไม่มีขั้นอนุมัติ
 *   EMPLOYEE_CHANGE   ไม่มีเอนทิตีในระบบเลย
 *   GENERAL           ไม่มีเอนทิตีในระบบเลย
 *
 * ปล่อยให้ตั้งได้จะอันตรายกว่าไม่มีให้ตั้ง เพราะผู้ดูแลจะเข้าใจว่าตั้งแล้ว
 * รายการเหล่านั้นถูกคุมด้วยสายอนุมัติ ทั้งที่ไม่มีอะไรบังคับเลย
 *
 * เมื่อไรที่ต่อสายให้ประเภทไหนแล้ว ให้ย้ายค่านั้นมาไว้ในลิสต์นี้
 */
export const SUPPORTED_APPROVAL_TARGET_TYPES = [
  ApprovalMatrixTargetType.LEAVE_REQUEST,
  ApprovalMatrixTargetType.OVERTIME_REQUEST,
  ApprovalMatrixTargetType.TIME_ADJUST_REQUEST,
  ApprovalMatrixTargetType.OFFSITE_WORK_REQUEST,
] as const;

export type SupportedApprovalTargetType =
  (typeof SUPPORTED_APPROVAL_TARGET_TYPES)[number];

export function isSupportedApprovalTargetType(
  value: unknown,
): value is SupportedApprovalTargetType {
  return (SUPPORTED_APPROVAL_TARGET_TYPES as readonly string[]).includes(
    String(value),
  );
}

/** ข้อความอธิบายเมื่อมีคนพยายามตั้งประเภทที่ยังไม่รองรับ */
export const UNSUPPORTED_TARGET_TYPE_MESSAGE =
  'ประเภทรายการนี้ยังไม่รองรับสายอนุมัติ — ระบบรองรับเฉพาะ ใบลา · ทำงานล่วงเวลา · คำขอแก้เวลา · ทำงานนอกสถานที่';
