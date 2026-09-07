import { Injectable } from '@nestjs/common';

import type { MobileFeatureFlags } from '../types/mobile-context.types';

type EmployeeLike = {
  allowedAttendanceMethods?: string[] | null;
};

/**
 * BE-MOB-006 — Feature configuration
 *
 * resolve จากสิทธิ์และการตั้งค่าพนักงานที่มีอยู่เดิมเท่านั้น
 * ตาม ADR-001 จึง "ไม่มี" ตาราง MobileFeatureFlag — ถ้าค่าไหนยังไม่มีต้นทางจริง
 * ให้ตอบ false ไปตรง ๆ ดีกว่าตอบ true แล้วให้แอปไปเจอ 403 ทีหลัง
 */
@Injectable()
export class MobileFeatureFlagService {
  resolve(params: {
    employee: EmployeeLike | null;
    permissions: string[];
  }): MobileFeatureFlags {
    const permissions = new Set(params.permissions);
    const essAccess = permissions.has('ESS_ACCESS');
    const attendanceMethods = params.employee?.allowedAttendanceMethods ?? [];
    const mobilePunchAllowed = attendanceMethods.includes('MOBILE');

    return {
      // ยังไม่มีโมดูลประกาศข่าวใน backend (BE-MOB-007 เป็น OPTIONAL/P1)
      announcements: false,
      /*
       * แท็บ "อนุมัติ" ของหัวหน้า — ผูกกับสิทธิ์เดียวกับฝั่งเว็บ
       * ไม่เช็คว่ามีลูกทีมจริงไหมตรงนี้ เพราะรายชื่อทีมเปลี่ยนได้ระหว่างวัน
       * ถ้าไม่มีใบรออนุมัติ หน้าจะขึ้น empty state เอง
       */
      approvals: essAccess && permissions.has('APPROVAL_ACCESS'),
      /*
       * "แท็บลงเวลา" ไม่ใช่ "ปุ่มลงเวลา" — flag นี้คุมแค่การเข้าถึงจอเวลาของตัวเอง
       * (ประวัติเข้าออก/สรุปรอบเงินเดือน) ซึ่ง /mobile/v1/attendance/history
       * บังคับแค่ ESS_ACCESS พนักงานทุกคนจึงต้องดูเวลาตัวเองได้เสมอ แม้ HR
       * จะไม่ได้เปิดให้ลงเวลาผ่านแอป — สิทธิ์กดลงเวลาอยู่ที่ attendancePunch
       */
      attendance: essAccess,
      // ยังไม่มีนโยบายบังคับถ่ายรูปใน AttendancePolicy ปัจจุบัน
      attendancePhotoRequired: false,
      /*
       * ปุ่มลงเวลาจริง — ต้องใช้ด่านเดียวกับ POST /mobile/v1/attendance/punch
       * (ESS_ACCESS + ATTENDANCE_CHECKIN) บวกกับ allowedAttendanceMethods ที่ HR
       * ตั้งไว้รายคน ไม่งั้นผู้ใช้กดแล้วเจอ 403
       */
      attendancePunch:
        essAccess &&
        mobilePunchAllowed &&
        permissions.has('ATTENDANCE_CHECKIN'),
      complaints: essAccess && permissions.has('COMPLAINT_CREATE'),
      documents: essAccess && permissions.has('DOCUMENT_CREATE'),
      /*
       * สี่ flag ด้านล่างต้องใช้สิทธิ์ตัวเดียวกับที่ route จริงบังคับ
       * (LEAVE_CREATE / OT_CREATE / TIME_ADJUST_CREATE / OFFSITE_REQUEST_CREATE)
       * ถ้าเช็คแค่ ESS_ACCESS แอปจะโชว์ฟอร์มให้กรอกจนจบแล้วค่อยเด้ง 403 ตอนกดยื่น
       * ซึ่งเป็นอาการที่ผู้ใช้แยกไม่ออกจาก "ระบบล่ม"
       */
      leave: essAccess && permissions.has('LEAVE_CREATE'),
      /*
       * ห้องผู้บริหารต้องใช้ด่านเดียวกับ route ของเว็บและ Mobile endpoint จริง
       * สิทธิ์ REPORT_VIEW/MANPOWER_READ อาจอยู่กับ HR หรือฝ่ายบัญชีได้ จึงใช้แทน
       * ความหมายว่าเป็นผู้บริหารไม่ได้ ไม่งั้นแท็บอาจโผล่ให้ผู้ใช้ที่เปิด endpoint ไม่ได้
       */
      executive: essAccess && permissions.has('EXECUTIVE_VIEW'),
      // Offline punch เปิดใน Phase 6 เท่านั้น และต้องผ่าน security review ก่อน
      offlinePunch: false,
      offsite: essAccess && permissions.has('OFFSITE_REQUEST_CREATE'),
      overtime: essAccess && permissions.has('OT_CREATE'),
      payslip: essAccess && permissions.has('PAYROLL_SLIP_VIEW'),
      // Schedule เป็น ESS read-only จึงใช้ด่านเดียวกับ /ess/schedule
      schedule: essAccess,
      team: essAccess && permissions.has('TEAM_VIEW'),
      timeAdjust: essAccess && permissions.has('TIME_ADJUST_CREATE'),
    };
  }
}
