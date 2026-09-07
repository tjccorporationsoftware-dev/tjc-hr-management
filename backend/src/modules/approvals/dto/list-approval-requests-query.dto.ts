import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/**
 * ประเภทคำขอที่หน้า Approval Center รองรับ
 * ALL = รวมทุกประเภทในหน้าเดียว
 */
export type ApprovalRequestKind =
  | "ALL"
  | "LEAVE"
  | "OVERTIME"
  | "TIME_ADJUST"
  | "OFFSITE"
  | "DOCUMENT";

/**
 * สถานะสำหรับกรองใน Approval Center
 *
 * หมายเหตุ:
 * - เป็นสถานะในมุมของผู้อนุมัติ ไม่ใช่ request status ดิบเสมอไป
 * - เช่น request อาจ APPROVED แล้ว แต่หน้านี้ต้องรู้ว่า user ปัจจุบันเคยอนุมัติ step ไหน
 */
export type ApprovalRequestStatusFilter =
  | "ALL"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "RETURNED";

/**
 * Query DTO สำหรับ GET /approvals/pending
 * ใช้ validate query string จาก frontend
 */
export class ListApprovalRequestsQueryDto {
  /** หน้าปัจจุบันของ pagination */
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** จำนวนรายการต่อหน้า จำกัดไม่เกิน 100 เพื่อกันโหลดหนักเกินไป */
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  /** กรองประเภทคำขอ เช่น ใบลา / OT / ขอแก้เวลา */
  @IsOptional()
  @IsIn(["ALL", "LEAVE", "OVERTIME", "TIME_ADJUST", "OFFSITE", "DOCUMENT"])
  type?: ApprovalRequestKind = "ALL";

  /**
   * SUBMITTED = รายการที่กำลังรอผู้ใช้งานปัจจุบันอนุมัติ
   * APPROVED  = รายการที่ผู้ใช้งานปัจจุบันเคยอนุมัติแล้ว
   * REJECTED  = รายการที่ผู้ใช้งานปัจจุบันเคยไม่อนุมัติแล้ว
   * RETURNED  = รายการที่ผู้ใช้งานปัจจุบันส่งกลับให้ตรวจสอบใหม่
   * ALL       = รวมทั้งรายการรออนุมัติและประวัติที่เคยดำเนินการแล้ว
   */
  @IsOptional()
  @IsIn(["ALL", "SUBMITTED", "APPROVED", "REJECTED", "RETURNED"])
  status?: ApprovalRequestStatusFilter = "SUBMITTED";

  /** คำค้นหา เช่น เลขที่คำขอ, ชื่อพนักงาน, รหัสพนักงาน, เหตุผล */
  @IsOptional()
  @IsString()
  q?: string;

  /** วันที่เริ่มต้นของช่วงวันที่ยื่นคำขอ รูปแบบ YYYY-MM-DD */
  @IsOptional()
  @IsString()
  dateFrom?: string;

  /** วันที่สิ้นสุดของช่วงวันที่ยื่นคำขอ รูปแบบ YYYY-MM-DD */
  @IsOptional()
  @IsString()
  dateTo?: string;

  /** แสดงเฉพาะรายการเร่งด่วนที่ค้างเกิน 3 วัน */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  urgentOnly?: boolean = false;
}
