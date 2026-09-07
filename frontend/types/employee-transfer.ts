import type { PaginationMeta, WorkHistoryType } from "./employee";

/**
 * ใบโยกย้าย/ปรับตำแหน่ง
 * ---------------------
 * SCHEDULED = ตั้งวันที่มีผลไว้แล้ว รอถึงวัน (ระบบอัปเดตทะเบียนพนักงานให้เอง)
 * APPLIED   = มีผลแล้ว ทะเบียนพนักงานถูกอัปเดตและบันทึกลงประวัติการทำงานเรียบร้อย
 * CANCELLED = ยกเลิกก่อนถึงวันมีผล
 */
export type EmployeeTransferStatus = "SCHEDULED" | "APPLIED" | "CANCELLED";

export type TransferMasterRef = {
  id: string;
  code: string;
  nameTh: string;
};

export type TransferPersonRef = {
  id: string;
  employeeCode: string;
  title: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  position: string | null;
};

export type TransferUserRef = {
  id: string;
  displayName: string;
};

export type EmployeeTransferItem = {
  id: string;
  companyId: string;
  employeeId: string;
  status: EmployeeTransferStatus;
  type: WorkHistoryType;
  effectiveDate: string;

  documentNo: string | null;
  reason: string | null;
  note: string | null;

  fromBranchId: string | null;
  toBranchId: string | null;
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  fromDivisionId: string | null;
  toDivisionId: string | null;
  fromPositionId: string | null;
  toPositionId: string | null;
  fromPositionTitle: string | null;
  toPositionTitle: string | null;
  fromEmployeeTypeId: string | null;
  toEmployeeTypeId: string | null;
  fromSupervisorId: string | null;
  toSupervisorId: string | null;

  appliedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;

  employee: TransferPersonRef & {
    status: string;
    branch: TransferMasterRef | null;
    department: TransferMasterRef | null;
  };

  fromBranch: TransferMasterRef | null;
  toBranch: TransferMasterRef | null;
  fromDepartment: TransferMasterRef | null;
  toDepartment: TransferMasterRef | null;
  fromDivision: TransferMasterRef | null;
  toDivision: TransferMasterRef | null;
  fromPosition: TransferMasterRef | null;
  toPosition: TransferMasterRef | null;
  fromEmployeeType: TransferMasterRef | null;
  toEmployeeType: TransferMasterRef | null;
  fromSupervisor: TransferPersonRef | null;
  toSupervisor: TransferPersonRef | null;

  createdBy: TransferUserRef | null;
  cancelledBy: TransferUserRef | null;
};

export type EmployeeTransferSummary = {
  total: number;
  scheduled: number;
  applied: number;
  cancelled: number;
};

export type EmployeeTransferListResponse = {
  items: EmployeeTransferItem[];
  meta: PaginationMeta;
  summary: EmployeeTransferSummary;
};

/**
 * ฟอร์มสร้างใบโยกย้าย
 *
 * ทุกช่องปลายทางเป็นข้อความว่างได้ — ว่างแปลว่า "ไม่เปลี่ยนช่องนี้"
 * ตัวส่งข้อมูลจะตัดช่องที่ว่างออกก่อนยิงไปหลังบ้าน
 */
export type CreateEmployeeTransferForm = {
  employeeId: string;
  effectiveDate: string;
  toBranchId: string;
  toDepartmentId: string;
  toDivisionId: string;
  toPositionId: string;
  toEmployeeTypeId: string;
  toSupervisorId: string;
  documentNo: string;
  reason: string;
  note: string;
};

export type EmployeeTransferListParams = {
  q?: string;
  companyId?: string;
  branchId?: string;
  employeeId?: string;
  status?: EmployeeTransferStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

/** ตัวข้อมูลที่ยิงไปหลังบ้านจริง — ตัดช่องที่ไม่ได้เปลี่ยนออกไปแล้ว */
export type CreateEmployeeTransferPayload = {
  employeeId: string;
  effectiveDate: string;
  toBranchId?: string;
  toDepartmentId?: string;
  toDivisionId?: string;
  toPositionId?: string;
  toEmployeeTypeId?: string;
  toSupervisorId?: string;
  documentNo?: string;
  reason?: string;
  note?: string;
};
