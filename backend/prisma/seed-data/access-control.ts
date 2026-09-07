/**
 * Access-control catalog — แหล่งความจริงเดียวของ permission และ role ทั้งระบบ
 * ------------------------------------------------------------------------
 * ก่อนหน้านี้ permission ถูกสร้างจาก 10 ที่ (prisma/seed.ts, scripts/seed-*.ts
 * และ prisma/dev-seed/*.sql) ทำให้ตั้งระบบใหม่ด้วย "npm run db:seed" อย่างเดียว
 * แล้วโมดูล Recruitment กับ Offboarding เข้าไม่ได้เลย เพราะ permission ไม่ถูกสร้าง
 *
 * ถ้าจะเพิ่ม permission ใหม่ ให้เพิ่มที่ไฟล์นี้ที่เดียว แล้ว:
 *   1) ผูกให้ role ที่ควรได้ในตัวแปร "roles" ด้านล่าง
 *   2) รัน "npm run db:seed"
 *
 * มีเทสต์ access-control-catalog.spec.ts คอยกันไม่ให้ controller อ้าง permission
 * ที่ไม่มีในไฟล์นี้ — ถ้าลืมเพิ่ม เทสต์จะแดงทันที
 */

export type PermissionSeed = {
  code: string;
  name: string;
  group: string;
};

export type RoleSeed = {
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissionCodes: string[];
};

export const permissions: PermissionSeed[] = [
  { code: "ORG_READ", name: "ดูข้อมูลองค์กร", group: "Organization" },
  { code: "ORG_MANAGE", name: "จัดการข้อมูลองค์กร", group: "Organization" },
  /*
   * แยกออกจาก ORG_MANAGE เพราะความเสี่ยงคนละระดับ
   * ------------------------------------------------
   * "สร้างสาขา/แผนก" เป็นงานประจำของผู้ดูแลบริษัท
   * แต่ "สร้าง/แก้โรล" คือการแก้ระบบสิทธิ์เอง ซึ่งเปิดทางให้เลื่อนขั้นตัวเองได้
   * เดิมใช้สิทธิ์ตัวเดียวกัน ให้ ORG_MANAGE ทีก็ได้อำนาจแก้โรลติดไปด้วย
   */
  {
    code: "ROLE_MANAGE",
    name: "สร้างและแก้ไขบทบาท/สิทธิ์",
    group: "Organization",
  },
  /*
   * แยกออกจาก ORG_MANAGE ด้วยเหตุผลเดียวกับ ROLE_MANAGE แต่คนละทาง
   * ------------------------------------------------------------
   * "ใครอนุมัติใบลา/OT" คืองานประจำของ HR ไม่ใช่งานผู้ดูแลระบบ
   * เดิมผูกกับ ORG_MANAGE ทำให้ HR เปิดแท็บ "สายอนุมัติ" ใน
   * ผู้ดูแลระบบ › นโยบายการทำงาน ได้ (หน้าเปิดด้วยสิทธิ์ตั้งนโยบายเวลา/ลา/OT)
   * แต่กดบันทึกแล้วเจอ 403 — ถ้าจะให้ HR แก้ได้โดยไม่ต้องยก ORG_MANAGE
   * ซึ่งพ่วงการแก้โครงสร้างองค์กรและตั้งค่าระบบไปด้วย ต้องเป็นสิทธิ์ของตัวเอง
   */
  {
    code: "APPROVAL_MATRIX_MANAGE",
    name: "จัดการสายอนุมัติของคำขอ",
    group: "Organization",
  },
  { code: "USER_MANAGE", name: "จัดการผู้ใช้งาน (ในขอบเขตของตน)", group: "Organization" },

  { code: "EMPLOYEE_READ", name: "ดูข้อมูลพนักงาน", group: "Employee" },
  {
    /*
     * PDPA ม.22 — เก็บ/ใช้เท่าที่จำเป็น
     * ไม่มีสิทธิ์นี้จะเห็นเลขบัตร/พาสปอร์ต/เลขภาษี/เลขประกันสังคม/เลขบัญชี
     * แบบปิดหลักไว้ (เช่น x-xxxx-xxxxx-x2-3) แต่ยังดูข้อมูลพนักงานอย่างอื่นได้ปกติ
     * ให้เฉพาะบทบาทที่ต้องใช้เลขจริงในการทำงาน คือ HR และฝ่ายเงินเดือน/บัญชี
     * เจ้าตัวเห็นข้อมูลของตัวเองเต็มเสมอโดยไม่ต้องมีสิทธิ์นี้
     */
    code: "EMPLOYEE_SENSITIVE_READ",
    name: "ดูเลขบัตร/เลขบัญชีของพนักงานแบบเต็ม",
    group: "Employee",
  },
  { code: "EMPLOYEE_CREATE", name: "เพิ่มพนักงาน", group: "Employee" },
  { code: "EMPLOYEE_UPDATE", name: "แก้ไขข้อมูลพนักงาน", group: "Employee" },
  { code: "EMPLOYEE_DELETE", name: "ลบ/ปิดสถานะพนักงาน", group: "Employee" },
  {
    code: "EMPLOYEE_DOCUMENT_VIEW",
    name: "ดูเอกสารพนักงาน",
    group: "Employee",
  },
  {
    code: "EMPLOYEE_DOCUMENT_UPLOAD",
    name: "อัปโหลดเอกสารพนักงาน",
    group: "Employee",
  },

  { code: "ATTENDANCE_READ", name: "ดูข้อมูลลงเวลา", group: "Attendance" },
  {
    code: "ATTENDANCE_CHECKIN",
    name: "ลงเวลาเข้า-ออกงาน",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_IMPORT",
    name: "นำเข้าข้อมูลลงเวลา",
    group: "Attendance",
  },
  { code: "ATTENDANCE_ADD", name: "เพิ่มเวลาทำงาน", group: "Attendance" },
  { code: "ATTENDANCE_EDIT", name: "แก้ไขเวลาทำงาน", group: "Attendance" },
  {
    code: "ATTENDANCE_POLICY_READ",
    name: "ดูนโยบายเวลาเข้าออกงาน",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_POLICY_MANAGE",
    name: "จัดการนโยบายเวลาเข้าออกงาน",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_SESSION_RULE_MANAGE",
    name: "จัดการรอบลงเวลา",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_PUNCH_SELF",
    name: "บันทึกเวลาเข้าออกของตนเอง",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_READ_OWN",
    name: "ดูข้อมูลลงเวลาของตนเอง",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_READ_TEAM",
    name: "ดูข้อมูลลงเวลาของทีม",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_READ_ALL",
    name: "ดูข้อมูลลงเวลาทั้งองค์กร",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_IMPORT_SCANNER",
    name: "นำเข้าข้อมูลจากเครื่องสแกน",
    group: "Attendance",
  },
  {
    code: "ATTENDANCE_RECALCULATE",
    name: "คำนวณสรุปเวลาและค่าปรับใหม่",
    group: "Attendance",
  },

  { code: "LEAVE_READ", name: "ดูข้อมูลการลา", group: "Leave" },
  { code: "LEAVE_CREATE", name: "ยื่นใบลา", group: "Leave" },
  { code: "LEAVE_UPDATE", name: "แก้ไขใบลา", group: "Leave" },
  { code: "LEAVE_DELETE", name: "ยกเลิก/ลบใบลา", group: "Leave" },
  { code: "LEAVE_APPROVE", name: "อนุมัติใบลา", group: "Leave" },
  { code: "LEAVE_QUOTA_MANAGE", name: "จัดการโควตาวันลา", group: "Leave" },

  { code: "OFFSITE_REQUEST_CREATE", name: "ยื่นคำขอทำงานนอกสถานที่", group: "Offsite Work" },
  { code: "OFFSITE_REQUEST_READ", name: "ดูคำขอทำงานนอกสถานที่", group: "Offsite Work" },
  { code: "OFFSITE_REQUEST_APPROVE", name: "อนุมัติคำขอทำงานนอกสถานที่", group: "Offsite Work" },
  { code: "OFFSITE_REQUEST_MANAGE", name: "จัดการคำขอทำงานนอกสถานที่", group: "Offsite Work" },

  { code: "OT_READ", name: "ดูข้อมูล OT", group: "Overtime" },
  { code: "OT_CREATE", name: "ยื่นคำขอ OT", group: "Overtime" },
  { code: "OT_UPDATE", name: "แก้ไขคำขอ OT", group: "Overtime" },
  { code: "OT_DELETE", name: "ยกเลิก/ลบ OT", group: "Overtime" },
  { code: "OT_APPROVE", name: "อนุมัติ OT", group: "Overtime" },
  { code: "OT_SETTING_MANAGE", name: "ตั้งค่า OT", group: "Overtime" },

  {
    code: "TIME_ADJUST_READ",
    name: "ดูข้อมูลขอแก้เวลา",
    group: "Time Adjust",
  },
  {
    code: "TIME_ADJUST_CREATE",
    name: "ยื่นคำขอแก้เวลา",
    group: "Time Adjust",
  },
  {
    code: "TIME_ADJUST_APPROVE",
    name: "อนุมัติคำขอแก้เวลา",
    group: "Time Adjust",
  },

  { code: "DOCUMENT_READ", name: "ดูเอกสาร", group: "Document" },
  { code: "DOCUMENT_CREATE", name: "สร้าง/ยื่นเอกสาร", group: "Document" },
  { code: "DOCUMENT_APPROVE", name: "อนุมัติเอกสาร", group: "Document" },
  { code: "DOCUMENT_EXPORT", name: "Export เอกสาร", group: "Document" },
  {
    code: "DOCUMENT_TEMPLATE_MANAGE",
    name: "จัดการ Template เอกสาร",
    group: "Document",
  },

  {
    code: "COMPLAINT_CREATE",
    name: "ยื่นเรื่องร้องเรียน",
    group: "Complaint",
  },
  {
    code: "COMPLAINT_READ",
    name: "ดูเรื่องร้องเรียน",
    group: "Complaint",
  },
  {
    code: "COMPLAINT_MANAGE",
    name: "ดำเนินการเรื่องร้องเรียน",
    group: "Complaint",
  },

  {
    code: "PERFORMANCE_READ",
    name: "ดูข้อมูลประเมินพนักงาน",
    group: "Performance",
  },
  {
    code: "PERFORMANCE_MANAGE",
    name: "จัดการการประเมินพนักงาน",
    group: "Performance",
  },
  {
    code: "WARNING_LETTER_MANAGE",
    name: "จัดการหนังสือเตือน",
    group: "Performance",
  },

  { code: "MANPOWER_READ", name: "ดูผังกำลังพล", group: "Manpower" },

  { code: "ONBOARDING_READ", name: "ดูข้อมูล Onboarding", group: "Onboarding" },
  {
    code: "ONBOARDING_MANAGE",
    name: "จัดการ Onboarding",
    group: "Onboarding",
  },

  { code: "REPORT_VIEW", name: "ดูรายงาน", group: "Reports" },
  { code: "REPORT_EXPORT", name: "Export รายงาน", group: "Reports" },

  /*
   * สิทธิ์ "พื้นที่ทำงาน" — แยกจากสิทธิ์ "ทำอะไรได้"
   * ================================================
   * ปัญหาเดิม: เมนูแต่ละกลุ่มเกาะอยู่กับสิทธิ์อ่าน/อนุมัติที่หลายบทบาทถือร่วมกัน
   * เพราะจำเป็นต่องานของตัวเอง เช่น หัวหน้างานต้องมี LEAVE_READ ไว้ดูใบลาลูกทีม
   * แต่ LEAVE_READ ก็เป็นตัวเปิดหน้า HR ระดับองค์กรด้วย หัวหน้าจึงเห็นเมนูของ HR
   * และ HR ที่มี APPROVAL_ACCESS ก็เห็นเมนูของหัวหน้างานกลับกัน
   *
   * ชุดนี้แก้ด้วยการแยก "ประตูเข้าพื้นที่" ออกมาเป็นสิทธิ์ของตัวเอง
   * หนึ่งพื้นที่ = หนึ่งสิทธิ์ ให้ใครก็ได้พื้นที่นั้น ไม่พ่วงความสามารถอื่นติดไป
   *
   *   ESS_ACCESS        พื้นที่พนักงาน      ทุกบทบาท (ทุกคนเป็นลูกจ้าง)
   *   TEAM_VIEW         พื้นที่หัวหน้างาน   MANAGER
   *   HR_WORKSPACE      พื้นที่งาน HR       HR_ADMIN
   *   PAYROLL_WORKSPACE พื้นที่เงินเดือน    HR_ADMIN · PAYROLL_ACCOUNTING
   *   EXECUTIVE_VIEW    ห้องผู้บริหาร       EXECUTIVE
   *   ORG_MANAGE        พื้นที่ผู้ดูแลระบบ  (มีอยู่เดิม)
   *
   * หน้าใน "ข้อมูลกลาง" (ทะเบียนพนักงาน · โครงสร้างองค์กร) ไม่อยู่ในพื้นที่ไหน
   * เพราะเป็นข้อมูลอ้างอิงที่หลายฝ่ายต้องใช้จริง คุมด้วยสิทธิ์อ่านของตัวเองตามเดิม
   */
  {
    code: "TEAM_VIEW",
    name: "เข้าพื้นที่หัวหน้างาน (ทีมของฉัน)",
    group: "Workspace",
  },
  {
    code: "HR_WORKSPACE",
    name: "เข้าพื้นที่งาน HR",
    group: "Workspace",
  },
  {
    code: "PAYROLL_WORKSPACE",
    name: "เข้าพื้นที่งานเงินเดือน",
    group: "Workspace",
  },
  {
    code: "EXECUTIVE_VIEW",
    name: "เข้าห้องผู้บริหาร",
    group: "Workspace",
  },

  { code: "ESS_ACCESS", name: "เข้าใช้งาน ESS", group: "ESS" },
  {
    code: "APPROVAL_ACCESS",
    name: "เข้าใช้งานระบบอนุมัติ",
    group: "Approval",
  },

   { code: "PAYROLL_READ", name: "ดูข้อมูลเงินเดือน", group: "Payroll" },
  { code: "PAYROLL_MANAGE", name: "จัดการระบบเงินเดือน", group: "Payroll" },
  {
    code: "PAYROLL_PERIOD_MANAGE",
    name: "จัดการงวดเงินเดือน",
    group: "Payroll",
  },
  {
    code: "PAYROLL_COMPENSATION_READ",
    name: "ดูข้อมูลค่าตอบแทนพนักงาน",
    group: "Payroll",
  },
  {
    code: "PAYROLL_COMPENSATION_MANAGE",
    name: "จัดการค่าตอบแทนพนักงาน",
    group: "Payroll",
  },
  {
    code: "PAYROLL_CALCULATE",
    name: "สร้างและคำนวณ Payroll Run",
    group: "Payroll",
  },
  {
    code: "PAYROLL_APPROVE",
    name: "ตรวจสอบและอนุมัติ Payroll Run",
    group: "Payroll",
  },
  {
    code: "PAYROLL_PAYMENT_MANAGE",
    name: "บันทึกการจ่ายเงินเดือน",
    group: "Payroll",
  },
  {
    code: "PAYROLL_ATTENDANCE_DEDUCTION_READ",
    name: "ดูยอดหักจากเวลาเข้าออกงาน",
    group: "Payroll",
  },
  {
    code: "PAYROLL_ATTENDANCE_DEDUCTION_IMPORT",
    name: "นำเข้ายอดหักจากเวลาเข้าออกงานเข้าเงินเดือน",
    group: "Payroll",
  },
  {
    code: "PAYROLL_SLIP_VIEW",
    name: "ดูและดาวน์โหลดสลิปเงินเดือน",
    group: "Payroll",
  },

  // ---- Recruitment (ATS) ----
  // ย้ายมาจาก scripts/seed-recruitment.ts ที่เคยต้องรันแยก
  // RECRUITMENT_HIRE แยกจาก MANAGE โดยตั้งใจ เพราะการกดจ้างคือการสร้าง
  // พนักงานจริงในระบบ ควรจำกัดคนที่ทำได้
  { code: "RECRUITMENT_READ", name: "ดูข้อมูลสรรหา", group: "Recruitment" },
  {
    code: "RECRUITMENT_MANAGE",
    name: "จัดการประกาศงานและผู้สมัคร",
    group: "Recruitment",
  },
  {
    code: "RECRUITMENT_HIRE",
    name: "จ้างผู้สมัครเป็นพนักงาน",
    group: "Recruitment",
  },

  // ---- Offboarding ----
  // ย้ายมาจาก scripts/seed-offboarding.ts ที่เคยต้องรันแยก
  {
    code: "OFFBOARDING_READ",
    name: "ดูข้อมูลการออกจากงาน",
    group: "Offboarding",
  },
  {
    code: "OFFBOARDING_MANAGE",
    name: "จัดการการออกจากงาน",
    group: "Offboarding",
  },

  /*
   * สิทธิ์เดียวคุมทุกชุดข้อมูลของหน้า "นำเข้าข้อมูล"
   *
   * การนำเข้าไฟล์เดียวเขียนทะเบียนพนักงานทั้งบริษัทได้ในคลิกเดียว จึงไม่พ่วงไปกับ
   * EMPLOYEE_CREATE ที่ให้กันตามปกติ — ต้องเป็นสิทธิ์ที่ตั้งใจมอบเท่านั้น
   */
  {
    code: "DATA_IMPORT",
    name: "นำเข้าข้อมูลจากไฟล์ Excel",
    group: "System",
  },
];

export const roles: RoleSeed[] = [
  {
    code: "SYSTEM_ADMIN",
    name: "System Admin",
    description: "ผู้ดูแลระบบหลัก จัดการผู้ใช้ สิทธิ์ และตั้งค่าระบบ",
    isSystem: true,
    permissionCodes: permissions.map((permission) => permission.code),
  },
  {
    code: "HR_ADMIN",
    name: "HR Admin",
    description: "เจ้าหน้าที่ HR จัดการข้อมูลพนักงาน เวลา ลา OT และเอกสาร",
    isSystem: true,
    permissionCodes: [
      "ORG_READ",
      // สายอนุมัติของใบลา/OT/ขอแก้เวลา/ทำงานนอกสถานที่ เป็นงานที่ HR ตั้งเอง
      "APPROVAL_MATRIX_MANAGE",
      // USER_MANAGE + DOCUMENT_TEMPLATE_MANAGE เคยมีเฉพาะใน
      // scripts/seed-roles-only.ts ทำให้ HR_ADMIN ได้สิทธิ์ไม่เท่ากัน
      // ขึ้นกับว่ารันสคริปต์ไหน — รวมเป็นชุดเดียวที่นี่แล้ว
      "USER_MANAGE",
      "DOCUMENT_TEMPLATE_MANAGE",
      "DATA_IMPORT",
      "EMPLOYEE_READ",
      // HR ต้องใช้เลขบัตร/เลขบัญชีจริงในการยื่นภาษี ทำสัญญา และตั้งบัญชีโอนเงิน
      "EMPLOYEE_SENSITIVE_READ",
      "EMPLOYEE_CREATE",
      "EMPLOYEE_UPDATE",
      "EMPLOYEE_DOCUMENT_VIEW",
      "EMPLOYEE_DOCUMENT_UPLOAD",
      "ATTENDANCE_READ",
      "ATTENDANCE_IMPORT",
      "ATTENDANCE_ADD",
      "ATTENDANCE_EDIT",
      "ATTENDANCE_POLICY_READ",
      "ATTENDANCE_POLICY_MANAGE",
      "ATTENDANCE_SESSION_RULE_MANAGE",
      "ATTENDANCE_READ_ALL",
      "ATTENDANCE_IMPORT_SCANNER",
      "ATTENDANCE_RECALCULATE",
      "LEAVE_READ",
      "LEAVE_CREATE",
      "LEAVE_UPDATE",
      "LEAVE_DELETE",
      "LEAVE_APPROVE",
      "LEAVE_QUOTA_MANAGE",
      "OFFSITE_REQUEST_CREATE",
      "OFFSITE_REQUEST_READ",
      "OFFSITE_REQUEST_APPROVE",
      "OFFSITE_REQUEST_MANAGE",
      "OT_READ",
      "OT_CREATE",
      "OT_UPDATE",
      "OT_DELETE",
      "OT_APPROVE",
      "OT_SETTING_MANAGE",
      "TIME_ADJUST_READ",
      "TIME_ADJUST_CREATE",
      "TIME_ADJUST_APPROVE",
      "DOCUMENT_READ",
      "DOCUMENT_CREATE",
      "DOCUMENT_APPROVE",
      "DOCUMENT_EXPORT",
      "COMPLAINT_CREATE",
      "COMPLAINT_READ",
      "COMPLAINT_MANAGE",
      "PERFORMANCE_READ",
      "PERFORMANCE_MANAGE",
      "WARNING_LETTER_MANAGE",
      "MANPOWER_READ",
      "ONBOARDING_READ",
      "ONBOARDING_MANAGE",
      "REPORT_VIEW",
      "REPORT_EXPORT",
      "ESS_ACCESS",
      "APPROVAL_ACCESS",
      // พื้นที่ทำงานของ HR — งาน HR ทั้งกลุ่ม และงานเงินเดือน (บริษัทนี้ HR เป็นคนทำเอง)
      "HR_WORKSPACE",
      "PAYROLL_WORKSPACE",
      "PAYROLL_READ",
      "PAYROLL_COMPENSATION_READ",
      "PAYROLL_COMPENSATION_MANAGE",
      "PAYROLL_SLIP_VIEW",
      "RECRUITMENT_READ",
      "RECRUITMENT_MANAGE",
      "RECRUITMENT_HIRE",
      // ข้อมูลค่าชดเชย/เหตุผลลาออกเป็นข้อมูลอ่อนไหว ให้เฉพาะ HR
      "OFFBOARDING_READ",
      "OFFBOARDING_MANAGE",

      /*
       * สิทธิ์ ESS ของตัวเอง — ผู้ถือบทบาทนี้ก็เป็นลูกจ้างเหมือนกัน
       * ต้องลงเวลา ยื่นใบลา ยื่น OT และเปิดสลิปของตัวเองได้
       * MANAGER / PAYROLL_ACCOUNTING / EXECUTIVE ได้ชุดนี้ไปแล้ว แต่ HR_ADMIN ตกหล่น
       * เจ้าหน้าที่ HR จึงเปิดหน้า "ลงเวลา" ได้แต่กดปุ่มลงเวลาไม่ได้
       * (ที่เหลือของชุดนี้ — LEAVE_CREATE / OT_CREATE / DOCUMENT_CREATE ฯลฯ — มีอยู่แล้วด้านบน)
       */
      "ATTENDANCE_CHECKIN",
      "ATTENDANCE_PUNCH_SELF",
      "ATTENDANCE_READ_OWN",
    ],
  },
  {
    code: "MANAGER",
    name: "Manager",
    description: "หัวหน้างาน ดูข้อมูลลูกทีมและอนุมัติรายการตามสิทธิ์",
    isSystem: true,
    permissionCodes: [
      "EMPLOYEE_READ",
      "ATTENDANCE_READ",
      "ATTENDANCE_READ_TEAM",
      "ATTENDANCE_POLICY_READ",
      "LEAVE_READ",
      "LEAVE_APPROVE",
      "OFFSITE_REQUEST_READ",
      "OFFSITE_REQUEST_APPROVE",
      "OT_READ",
      "OT_APPROVE",
      "TIME_ADJUST_READ",
      "TIME_ADJUST_APPROVE",
      /*
       * DOCUMENT_APPROVE พอสำหรับอนุมัติคำขอเอกสารของลูกทีม
       * เดิมมี DOCUMENT_READ ด้วย ซึ่งเป็นตัวเปิด "ศูนย์บริการพนักงาน" ฝั่ง HR
       * (คำขอเอกสาร + เรื่องร้องเรียนของทั้งสาขา) ไม่ใช่ของหัวหน้างาน
       */
      "DOCUMENT_APPROVE",
      /*
       * ไม่ให้ REPORT_VIEW และ MANPOWER_READ
       * ทั้งสองตัวเป็นข้อมูลระดับองค์กร (ศูนย์รายงาน · ผังกำลังพลทั้งบริษัท)
       * ไม่ใช่ของหัวหน้างานที่ดูแลเฉพาะสายตัวเอง
       * ตัวเลขของทีมอยู่ในหน้า "ทีมของฉัน" ครบแล้ว
       */
      "ESS_ACCESS",
      "APPROVAL_ACCESS",
      // เปิดพื้นที่ "ทีมของฉัน / คำขอของทีม" — ให้เฉพาะบทบาทที่มีลูกทีมจริง
      "TEAM_VIEW",

      /*
       * สิทธิ์ ESS ของตัวเอง — ผู้ถือบทบาทนี้ก็เป็นลูกจ้างเหมือนกัน
       * ต้องลงเวลา ยื่นใบลา ยื่น OT และเปิดสลิปของตัวเองได้
       * เดิมไม่มีชุดนี้ ต้องไปซ้อนบทบาท EMPLOYEE ให้เองทุกคนถึงจะใช้งานได้
       */
      "ATTENDANCE_CHECKIN",
      "ATTENDANCE_PUNCH_SELF",
      "ATTENDANCE_READ_OWN",
      "LEAVE_CREATE",
      "OFFSITE_REQUEST_CREATE",
      "OT_CREATE",
      "TIME_ADJUST_CREATE",
      "DOCUMENT_CREATE",
      "COMPLAINT_CREATE",
      "PAYROLL_SLIP_VIEW",
    ],
  },
  {
    code: "PAYROLL_ACCOUNTING",
    name: "Payroll / Accounting",
    description: "ฝ่ายบัญชีหรือเงินเดือน ดูรายงานและข้อมูลที่เกี่ยวข้องกับ Payroll",
    isSystem: true,
    permissionCodes: [
      "ORG_READ",

      "EMPLOYEE_READ",
      // ฝ่ายเงินเดือนต้องใช้เลขบัญชีจริงทำไฟล์โอนเงิน และเลขบัตรยื่น ภ.ง.ด./สปส.
      "EMPLOYEE_SENSITIVE_READ",

      "ATTENDANCE_READ",
      "ATTENDANCE_POLICY_READ",
      "LEAVE_READ",
      "OT_READ",

      "PAYROLL_WORKSPACE",
      "PAYROLL_READ",
      "PAYROLL_MANAGE",
      "PAYROLL_PERIOD_MANAGE",
      "PAYROLL_COMPENSATION_READ",
      "PAYROLL_COMPENSATION_MANAGE",
      "PAYROLL_CALCULATE",
      "PAYROLL_APPROVE",
      "PAYROLL_PAYMENT_MANAGE",
      "PAYROLL_ATTENDANCE_DEDUCTION_READ",
      "PAYROLL_ATTENDANCE_DEDUCTION_IMPORT",

      "REPORT_VIEW",
      "REPORT_EXPORT",

      "ESS_ACCESS",

      /*
       * สิทธิ์ ESS ของตัวเอง — ผู้ถือบทบาทนี้ก็เป็นลูกจ้างเหมือนกัน
       * ต้องลงเวลา ยื่นใบลา ยื่น OT และเปิดสลิปของตัวเองได้
       * เดิมไม่มีชุดนี้ ต้องไปซ้อนบทบาท EMPLOYEE ให้เองทุกคนถึงจะใช้งานได้
       */
      "ATTENDANCE_CHECKIN",
      "ATTENDANCE_PUNCH_SELF",
      "ATTENDANCE_READ_OWN",
      "LEAVE_CREATE",
      "OFFSITE_REQUEST_CREATE",
      "OT_CREATE",
      "TIME_ADJUST_CREATE",
      "DOCUMENT_CREATE",
      "COMPLAINT_CREATE",
      "PAYROLL_SLIP_VIEW",
    ],
  },
  {
    code: "EMPLOYEE",
    name: "Employee",
    description: "พนักงานทั่วไป ใช้งาน ESS และยื่นคำขอของตนเอง",
    isSystem: true,
    permissionCodes: [
      "ATTENDANCE_CHECKIN",
      "ATTENDANCE_PUNCH_SELF",
      "ATTENDANCE_READ_OWN",
      "LEAVE_CREATE",
      "OFFSITE_REQUEST_CREATE",
      "OT_CREATE",
      "TIME_ADJUST_CREATE",
      "DOCUMENT_CREATE",
      "COMPLAINT_CREATE",
      "ESS_ACCESS",
      "PAYROLL_SLIP_VIEW",
    ],
  },
  {
    code: "EXECUTIVE",
    name: "Executive",
    description: "ผู้บริหาร ดู Dashboard และรายงานสรุป",
    isSystem: true,
    /*
     * ไม่ให้ REPORT_VIEW / REPORT_EXPORT
     * ศูนย์รายงานเป็นเครื่องมือทำงานของ HR กับฝ่ายบัญชี (สร้างไฟล์ ยื่นราชการ)
     * ผู้บริหารดูภาพรวมจากห้องผู้บริหารซึ่งมีทั้งเงินเดือน การเข้างาน กำลังพล
     * และผังองค์กรอยู่แล้ว
     *
     * ORG_READ ยังต้องมี เพราะแท็บผังองค์กรใช้ GET /organization/org-chart
     */
    permissionCodes: [
      "ORG_READ",
      "MANPOWER_READ",
      "PAYROLL_READ",
      "ESS_ACCESS",
      "APPROVAL_ACCESS",
      // เปิดห้องผู้บริหาร — ให้เฉพาะบทบาทนี้ ไม่ผูกกับ REPORT_VIEW ที่ HR/บัญชีก็ถืออยู่
      "EXECUTIVE_VIEW",

      /*
       * สิทธิ์ ESS ของตัวเอง — ผู้ถือบทบาทนี้ก็เป็นลูกจ้างเหมือนกัน
       * ต้องลงเวลา ยื่นใบลา ยื่น OT และเปิดสลิปของตัวเองได้
       * เดิมไม่มีชุดนี้ ต้องไปซ้อนบทบาท EMPLOYEE ให้เองทุกคนถึงจะใช้งานได้
       */
      "ATTENDANCE_CHECKIN",
      "ATTENDANCE_PUNCH_SELF",
      "ATTENDANCE_READ_OWN",
      "LEAVE_CREATE",
      "OFFSITE_REQUEST_CREATE",
      "OT_CREATE",
      "TIME_ADJUST_CREATE",
      "DOCUMENT_CREATE",
      "COMPLAINT_CREATE",
      "PAYROLL_SLIP_VIEW",
    ],
  },
];
