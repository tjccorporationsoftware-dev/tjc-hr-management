import type { MobilePlatform } from '../mobile.constants';

/**
 * บริบทของเครื่องที่อ่านจาก Header — ห้ามเชื่อ identity (userId/employeeId) จาก Client
 * ค่าที่ได้จากตรงนี้ใช้ได้แค่เป็น metadata สำหรับ audit/compatibility/device registry
 */
export type MobileClientContext = {
  appBuild: number | null;
  appVersion: string | null;
  installationId: string | null;
  ipAddress: string | null;
  osVersion: string | null;
  platform: MobilePlatform | null;
  userAgent: string | null;
};

export type MobileCompatibility = {
  latestBuild: number;
  minimumBuild: number;
  storeUrl: string | null;
  updateRecommended: boolean;
  updateRequired: boolean;
};

/**
 * Feature flag ที่ตอบไปให้แอป — resolve จาก permission + การตั้งค่าเดิมของระบบ
 * ไม่มีตาราง flag แยกตาม ADR-001 (ดู BE-MOB-006)
 */
export type MobileFeatureFlags = {
  announcements: boolean;
  /** กล่องรออนุมัติของหัวหน้า */
  approvals: boolean;
  /** เข้าจอเวลาของตัวเอง (ประวัติ/สรุปรอบ) — ไม่ใช่สิทธิ์กดลงเวลา */
  attendance: boolean;
  attendancePhotoRequired: boolean;
  /** กดลงเวลาผ่านแอปได้จริง (ATTENDANCE_CHECKIN + allowedAttendanceMethods) */
  attendancePunch: boolean;
  /** เรื่องร้องเรียน ESS */
  complaints?: boolean;
  /** คำร้องเอกสาร ESS */
  documents?: boolean;
  /** ภาพรวมบริษัทของผู้บริหาร */
  executive: boolean;
  leave: boolean;
  offlinePunch: boolean;
  offsite: boolean;
  overtime: boolean;
  payslip: boolean;
  /** ตารางงาน/ปฏิทิน ESS ของพนักงาน */
  schedule?: boolean;
  /** ข้อมูลลูกทีมของหัวหน้างาน */
  team: boolean;
  timeAdjust: boolean;
};

export type MobileHeroState =
  | 'DAY_OFF'
  | 'NO_SHIFT'
  | 'NOT_CHECKED_IN'
  | 'MORNING_CHECKED_IN'
  | 'AFTERNOON_REQUIRED'
  | 'AFTERNOON_CHECKED_IN'
  | 'CHECK_OUT_AVAILABLE'
  | 'COMPLETED'
  | 'MISSING_LOG'
  | 'OFFSITE_ACTIVE'
  | 'PENDING_SYNC';
