/**
 * Route Permission Map
 * --------------------
 * Central source of truth for frontend route visibility and route guarding.
 *
 * Why this file exists:
 * - Sidebar and RoutePermissionGuard must use the same rules.
 * - Rules here should mirror backend Auth / PermissionGuard requirements as closely as possible.
 * - For sensitive pages, prefer stricter access to avoid showing a page that immediately returns 403.
 *
 * ตัดสินด้วย permission เท่านั้น
 * ---------------------------
 * field `roles` ที่เห็นในหลายรายการด้านล่าง **ไม่ถูกใช้กันสิทธิ์** (ดู @deprecated ที่ type)
 * เหลือไว้แค่ประกอบข้อความอธิบายตอนเข้าไม่ได้ อย่าอ่านมันแล้วเข้าใจว่าหน้านั้นถูกจำกัดโรลอยู่
 * ถ้าอยากให้เฉพาะบางบทบาทเข้าได้ ต้องสร้าง permission ของตัวเอง
 * (ตัวอย่างที่ทำแล้ว: TEAM_VIEW ของพื้นที่หัวหน้างาน · EXECUTIVE_VIEW ของห้องผู้บริหาร)
 *
 * Notes:
 * - mode="any" means the user needs at least one listed permission.
 * - mode="all" means the user needs every listed permission.
 * - Empty permissions means authenticated users can access the route.
 */
export type PermissionMode = "any" | "all";
export type RoleMode = "any" | "all";

type RoleLike = string | { code?: string | null; name?: string | null };

export type RoutePermissionRequirement = {
  permissions: string[];
  mode?: PermissionMode;
  /**
   * @deprecated ระบบ gate ใช้ "permission อย่างเดียว" ให้ตรงกับ backend แล้ว
   * field roles/roleMode ไม่ถูกใช้ตัดสินสิทธิ์อีกต่อไป (คงไว้กันโค้ดเก่าพัง)
   * ถ้าต้องการจำกัดเฉพาะผู้ดูแลแพลตฟอร์ม ให้ใช้ platformOnly แทน
   */
  roles?: string[];
  roleMode?: RoleMode;
  /** true = เฉพาะผู้ดูแลแพลตฟอร์ม (scope.level === "GLOBAL") เท่านั้น */
  platformOnly?: boolean;
  description?: string;
};

const ROLE_GROUPS = {
  employee: ["EMPLOYEE"],
  manager: ["MANAGER", "DEPT_MANAGER", "DEPARTMENT_MANAGER"],
  hr: ["HR_ADMIN", "HR_MANAGER"],
  payroll: ["PAYROLL_ACCOUNTING"],
  executive: ["EXECUTIVE"],
  admin: ["SYSTEM_ADMIN", "ADMIN", "SUPER_ADMIN"],
} as const;

export const routePermissionMap: Record<string, RoutePermissionRequirement> = {
  "/dashboard": {
    permissions: [],
    description: "Dashboard กลางสำหรับ redirect ไปหน้าหลักตาม role",
  },
  "/profile": {
    permissions: [],
    description: "ข้อมูลส่วนตัวของผู้ใช้ที่เข้าสู่ระบบแล้ว",
  },

  /* Employee Self-Service */
  "/ess": { roles: [...ROLE_GROUPS.employee], permissions: ["ESS_ACCESS"] },
  "/ess/my-profile": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS"],
  },
  // รวม "ลงเวลาวันนี้" กับ "ประวัติลงเวลา" ไว้หน้าเดียว
  // ประวัติต้องการแค่ ESS_ACCESS ส่วนปุ่มลงเวลาคุมด้วย ATTENDANCE_CHECKIN ที่ระดับแท็บ
  "/ess/check-in": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS"],
  },
  "/ess/my-attendance": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS"],
  },
  "/ess/schedule": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS"],
  },
  "/ess/requests": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS"],
  },
  "/ess/requests/leave": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS", "LEAVE_CREATE"],
    mode: "all",
  },
  "/ess/requests/overtime": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS", "OT_CREATE"],
    mode: "all",
  },
  "/ess/requests/time-adjust": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS", "TIME_ADJUST_CREATE"],
    mode: "all",
  },
  "/ess/requests/offsite": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS", "OFFSITE_REQUEST_CREATE"],
    mode: "all",
  },
  "/ess/requests/documents": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS", "DOCUMENT_CREATE"],
    mode: "all",
  },
  "/ess/requests/complaints": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS", "COMPLAINT_CREATE"],
    mode: "all",
    description: "พนักงานแจ้งเรื่องร้องเรียนและติดตามสถานะเรื่องของตนเอง",
  },
  "/ess/salary-slip": {
    roles: [...ROLE_GROUPS.employee],
    permissions: ["ESS_ACCESS", "PAYROLL_SLIP_VIEW"],
    mode: "all",
  },
  "/settings/security": {
    platformOnly: true,
    permissions: ["ORG_MANAGE"],
    description: "นโยบายบัญชีและ session ระดับแพลตฟอร์ม (เฉพาะผู้ดูแลแพลตฟอร์ม)",
  },

  /*
   * Manager
   * -------
   * ใช้ TEAM_VIEW ตัวเดียวเป็นด่านของทั้งกลุ่ม ตรงกับ @Auth('TEAM_VIEW') ที่ ManagerController
   *
   * เดิมใช้ APPROVAL_ACCESS + สิทธิ์อนุมัติรายประเภท ซึ่ง HR ถือครบทุกตัว
   * HR จึงเห็นเมนูนี้และกดเข้าไปเจอทีมว่างเปล่า เพราะหน้านี้อ่านจาก supervisorId
   * ไม่ใช่จากสิทธิ์อนุมัติ — คนละความหมายกัน
   */
  "/manager/team": {
    permissions: ["TEAM_VIEW"],
  },
  /* ศูนย์คำขอของหัวหน้า — แยกจาก /approvals ของ HR เพราะดูเฉพาะลูกทีมตัวเอง */
  "/manager/requests": {
    permissions: ["TEAM_VIEW"],
    description: "คำขอของลูกทีม (อนุมัติ + ประวัติเฉพาะสายบังคับบัญชา)",
  },
  /*
   * /manager/attendance · /manager/leaves · /manager/overtime · /manager/offsite
   * · /manager/time-adjust ยุบไปเป็นแท็บของ "ทีมของฉัน" กับ "ศูนย์คำขอ" แล้ว
   * เหลือไว้เป็นหน้า redirect เฉย ๆ จึงไม่ต้องมีเงื่อนไขสิทธิ์ของตัวเอง
   * (ปลายทางที่ redirect ไปเช็คสิทธิ์เองอยู่แล้ว)
   */
  /*
   * ศูนย์คำขอฝั่ง HR — เดิมเปิดด้วยสิทธิ์อนุมัติหรือสิทธิ์อ่านตัวใดตัวหนึ่ง
   * ฝ่ายเงินเดือนที่มีแค่ LEAVE_READ/OT_READ จึงเห็นเมนูนี้ทั้งที่คิวว่างเสมอ
   * (หน้านี้แสดงเฉพาะรายการที่รอ "คนที่ล็อกอิน" อนุมัติ)
   * ส่วนหัวหน้างานใช้ /manager/requests ที่ให้ผลเหมือนกันแต่จำกัดสายบังคับบัญชา
   */
  "/approvals": {
    permissions: ["HR_WORKSPACE", "APPROVAL_ACCESS"],
    mode: "all",
    description:
      "ศูนย์คำขอ (อนุมัติคำขอที่รอดำเนินการ + ประวัติคำขอทั้งองค์กร)",
  },

  /* HR */
  /*
   * กลุ่ม "งาน HR" ทุกหน้าต้องมี HR_WORKSPACE ควบกับสิทธิ์ของหน้านั้น
   * สิทธิ์อ่านอย่าง EMPLOYEE_READ / LEAVE_READ / DOCUMENT_READ เป็นของที่หัวหน้างาน
   * และฝ่ายเงินเดือนถือติดตัวเพื่อทำงานกับลูกทีม/รอบจ่ายของตัวเอง
   * ใช้มันเป็นด่านของหน้าระดับองค์กรจึงเปิดกว้างเกินจริงมาตลอด
   */
  "/hr/dashboard": {
    permissions: [
      "HR_WORKSPACE",
      "EMPLOYEE_READ",
      "ATTENDANCE_READ",
      "LEAVE_READ",
      "APPROVAL_ACCESS",
    ],
    mode: "all",
  },
  /*
   * หน้ารายชื่อ = ทะเบียนเต็ม เปิดให้เฉพาะพื้นที่ HR/เงินเดือน
   * หน้ารายคนยังใช้ EMPLOYEE_READ เพราะหัวหน้างานต้องกดจาก "ทีมของฉัน" เข้ามาดูลูกทีม
   * ฝั่ง service จำกัดผลลัพธ์ให้เหลือตัวเอง+ลูกทีมตรงอยู่แล้วถ้าไม่มีสิทธิ์พื้นที่ทั้งสอง
   */
  "/employees": {
    permissions: ["HR_WORKSPACE", "PAYROLL_WORKSPACE"],
    mode: "any",
  },
  "/employees/[id]": {
    permissions: ["EMPLOYEE_READ"],
  },
  "/organization": {
    permissions: ["HR_WORKSPACE"],
    description: "ตั้งค่าโครงสร้างองค์กร (ผู้บริหารดูผังได้ที่ห้องผู้บริหาร)",
  },
  "/manpower": { roles: [...ROLE_GROUPS.hr], permissions: ["MANPOWER_READ"] },
  "/attendance": {
    permissions: ["HR_WORKSPACE", "ATTENDANCE_READ_ALL"],
    mode: "all",
    description: "ตรวจ Attendance ทั้งองค์กรตาม tenant scope ของผู้ใช้",
  },
  /*
   * ORG_MANAGE ไม่ใช่เพราะเป็นงานผู้ดูแลระบบ แต่เพราะ API วันหยุด (settings/system)
   * ทั้งกองบังคับสิทธิ์นี้ตั้งแต่ตอนอ่าน เปิดโหมดดูอย่างเดียวให้ไม่ได้
   */
  "/day-off-roster": {
    permissions: ["HR_WORKSPACE", "ORG_MANAGE"],
    mode: "all",
    description: "ย้ายวันหยุดรายคนของทีมที่หมุนเวร เบื้องหลังคือ holiday_swaps",
  },
  "/hr/requests": {
    permissions: ["HR_WORKSPACE", "LEAVE_READ"],
    mode: "all",
    description: "คำขอลา OT ขอแก้เวลา และนอกสถานที่ทั้งองค์กร",
  },
  "/hr-review": {
    permissions: ["HR_WORKSPACE", "ATTENDANCE_READ_ALL"],
    mode: "all",
    description: "ตรวจสอบ Attendance Monthly Review ก่อนส่งเข้า Payroll",
  },
  "/leave-quota": {
    /*
     * LEAVE_QUOTA_MANAGE คือสิทธิ์เดียวกับที่หลังบ้านใช้คุม PATCH/generate
     * ให้หน้าเปิดได้เฉพาะคนที่กดแก้ได้จริง จะได้ไม่มีใครเปิดเข้ามาเจอปุ่มที่กดแล้ว 403
     */
    permissions: ["HR_WORKSPACE", "LEAVE_QUOTA_MANAGE"],
    mode: "all",
    description: "สิทธิ์วันลาพนักงาน — ดูโควตาคงเหลือรายคนและปรับเพิ่ม/ลด",
  },
  "/documents": {
    permissions: ["HR_WORKSPACE", "DOCUMENT_READ"],
    mode: "all",
    description: "ศูนย์บริการพนักงาน (หนังสือรับรอง + เรื่องร้องเรียน, ฝั่ง HR)",
  },
  "/settings/system/document-templates": {
    roles: [...ROLE_GROUPS.admin],
    permissions: ["DOCUMENT_TEMPLATE_MANAGE"],
    mode: "all",
    description: "ตั้งค่าประเภทเอกสารและ Template (ตั้งครั้งเดียวใช้ยาว)",
  },
  "/complaints": {
    roles: [...ROLE_GROUPS.hr],
    permissions: ["COMPLAINT_READ"],
    mode: "all",
    description: "เรื่องร้องเรียนและข้อเสนอแนะ (ข้อมูลอ่อนไหว เฉพาะ HR)",
  },
  "/recruitment": {
    roles: [...ROLE_GROUPS.hr],
    permissions: ["RECRUITMENT_READ", "RECRUITMENT_MANAGE"],
    mode: "any",
    description: "ประกาศงาน ผู้สมัคร สัมภาษณ์ และการจ้าง",
  },
  "/onboarding": {
    permissions: ["HR_WORKSPACE", "ONBOARDING_READ"],
    mode: "all",
    description:
      "รับพนักงานใหม่ (สรรหาบุคลากร + เช็กลิสต์ต้อนรับ + ทดลองงาน, ฝั่ง HR)",
  },
  /*
   * หน้าประกาศรับสมัครรายใบ — แคบกว่า /onboarding ที่เป็นหน้ารวม
   *
   * หน้ารวมเปิดให้คนที่มีสิทธิ์ onboarding อย่างเดียวเข้าได้ (เห็นเฉพาะแท็บของตัวเอง)
   * แต่หน้านี้เป็นเรื่องสรรหาล้วน ถ้าใช้สิทธิ์ชุดเดียวกับหน้ารวม คนที่ไม่มีสิทธิ์สรรหา
   * จะเปิดหน้าเข้ามาได้แล้วเจอ 403 จากทุก API แทนที่จะถูกกันตั้งแต่ต้น
   */
  "/onboarding/[id]": {
    roles: [...ROLE_GROUPS.hr],
    permissions: ["RECRUITMENT_READ", "RECRUITMENT_MANAGE"],
    mode: "any",
    description: "ประกาศรับสมัครรายใบ + ผู้สมัครของประกาศนั้น",
  },
  "/offboarding": {
    permissions: ["HR_WORKSPACE", "OFFBOARDING_READ"],
    mode: "all",
    description: "การออกจากงาน เคลียร์ของ และเงินงวดสุดท้าย",
  },
  /*
   * ใช้ EMPLOYEE_UPDATE ตรงกับ backend เพราะผลของใบโยกย้ายคือการแก้ทะเบียนพนักงาน
   * ถ้ากันด้วยสิทธิ์ที่หลวมกว่า คนที่แก้ทะเบียนตรง ๆ ไม่ได้จะเลี่ยงมาทางนี้แทน
   */
  "/hr/transfers": {
    permissions: ["HR_WORKSPACE", "EMPLOYEE_UPDATE"],
    mode: "all",
    description: "โยกย้ายสาขา/แผนก และปรับตำแหน่ง พร้อมตั้งวันที่มีผลล่วงหน้า",
  },
  "/performance": {
    permissions: ["HR_WORKSPACE", "PERFORMANCE_READ"],
    mode: "all",
  },
  "/reports": {
    roles: [...ROLE_GROUPS.hr, ...ROLE_GROUPS.payroll],
    permissions: ["REPORT_VIEW"],
  },

  /* Payroll */
  /*
   * กลุ่มเงินเดือนทั้งกลุ่มต้องมี PAYROLL_WORKSPACE
   * ผู้บริหารถือ PAYROLL_READ ไว้ดูสรุปในห้องผู้บริหาร ไม่ได้มาเดินรอบจ่ายเงินเดือน
   */
  "/payroll": {
    permissions: ["PAYROLL_WORKSPACE", "PAYROLL_READ"],
    mode: "all",
  },
  "/payroll/employees": {
    permissions: ["PAYROLL_WORKSPACE", "PAYROLL_COMPENSATION_READ"],
    mode: "all",
  },
  /*
   * ตรงกับด่านเขียนจริงที่ PUT /payroll/severance/tiers ซึ่งใช้ PAYROLL_MANAGE
   * เดิมยอมให้ PAYROLL_READ เข้าได้ ผู้บริหารกับ HR จึงเห็นเมนูแล้วกดบันทึกไม่ผ่าน
   */
  "/payroll/settings": {
    permissions: ["PAYROLL_WORKSPACE", "PAYROLL_MANAGE"],
    mode: "all",
  },
  /* หน้าดูได้ด้วย PAYROLL_READ ส่วนปุ่มบันทึกด่านจริงอยู่ที่ PAYROLL_MANAGE ฝั่ง API */
  "/payroll/withholding": {
    permissions: ["PAYROLL_WORKSPACE", "PAYROLL_READ"],
    mode: "all",
  },

  /*
   * Executive
   * ---------
   * สี่หน้าเดิมยุบเป็นแท็บในหน้า /executive แล้ว เหลือ URL เก่าไว้เป็น redirect
   * สิทธิ์ของหน้ารวมใช้เกณฑ์เดียวกับ Executive Dashboard เดิม (มีอย่างใดอย่างหนึ่ง)
   * ส่วนแท็บ "ต้นทุนพนักงาน" คุมด้วย PAYROLL_READ ที่ตัวหน้าอีกชั้น
   */
  /*
   * ห้องผู้บริหาร — ด่านเดียวคือ EXECUTIVE_VIEW ตรงกับ backend
   *
   * เดิมใช้ REPORT_VIEW/MANPOWER_READ แบบ "any" ซึ่ง HR และฝ่ายบัญชีก็ถืออยู่
   * ทั้งคู่ (ต้องดูรายงานเป็นงานประจำ) เมนูจึงโผล่ให้คนที่ไม่ใช่ผู้บริหาร
   * ซ้ำร้ายฝั่ง backend ใช้ "และ" ไม่ใช่ "หรือ" เมนูกับสิทธิ์จริงจึงไม่ตรงกันด้วย
   */
  "/executive": {
    permissions: ["EXECUTIVE_VIEW"],
  },
  "/executive/dashboard": {
    permissions: ["EXECUTIVE_VIEW"],
  },
  "/executive/manpower": {
    permissions: ["EXECUTIVE_VIEW", "MANPOWER_READ"],
    mode: "all",
  },
  "/executive/reports": {
    permissions: ["EXECUTIVE_VIEW", "REPORT_VIEW"],
    mode: "all",
  },
  "/executive/payroll-summary": {
    permissions: ["EXECUTIVE_VIEW", "PAYROLL_READ"],
    mode: "all",
  },

  /* Admin / Settings */
  "/users": {
    roles: [...ROLE_GROUPS.hr, ...ROLE_GROUPS.admin],
    permissions: ["USER_MANAGE"],
    description: "จัดการผู้ใช้งานในขอบเขตของตน (บริษัท/แพลตฟอร์ม)",
  },
  // จัดการโรล: company admin จัดการ custom role ของบริษัทตนได้ (backend scope ให้)
  // โรลระบบเป็น template อ่านอย่างเดียวสำหรับบริษัท
  "/roles": { permissions: ["ORG_MANAGE"] },
  // permission catalog แก้ได้เฉพาะผู้ดูแลแพลตฟอร์ม
  "/permissions": {
    platformOnly: true,
    permissions: ["ORG_MANAGE"],
  },
  /*
   * เกณฑ์เป็นสิทธิ์ "แก้ไข" ไม่ใช่ "อ่าน"
   * เดิมใช้ ATTENDANCE_POLICY_READ / LEAVE_READ / OT_READ ซึ่งหัวหน้างานและฝ่ายบัญชี
   * ถือติดตัวอยู่แล้วเพราะต้องอ่านนโยบายตอนอนุมัติ/คิดเงิน ทั้งสองจึงเห็นเมนู
   * "ผู้ดูแลระบบ › นโยบายการทำงาน" ทั้งที่แก้อะไรไม่ได้สักอย่าง
   */
  "/settings/work-policies": {
    permissions: [
      "ATTENDANCE_POLICY_MANAGE",
      "LEAVE_QUOTA_MANAGE",
      "OT_SETTING_MANAGE",
      "APPROVAL_MATRIX_MANAGE",
    ],
    mode: "any",
    description: "ตั้งค่านโยบายเวลาเข้าออกงาน การลา หรือ OT ตามสิทธิ์ของแต่ละแท็บ",
  },
  "/settings/approval-workflow": {
    roles: [...ROLE_GROUPS.hr, ...ROLE_GROUPS.admin],
    // สายอนุมัติเป็นงาน HR ไม่ใช่งานผู้ดูแลระบบ จึงไม่ผูกกับ ORG_MANAGE อีกต่อไป
    permissions: ["APPROVAL_MATRIX_MANAGE"],
    description: "จัดการสายอนุมัติของคำขอในระบบ",
  },
  "/settings/system": {
    // ตั้งค่าระบบเป็น per-company แล้ว → ผู้ดูแลบริษัท (HR_ADMIN) จัดการของบริษัทตนได้
    // HR_MANAGER ที่ไม่มี ORG_MANAGE จะยังถูกกรองด้วย permission gate
    roles: [...ROLE_GROUPS.hr, ...ROLE_GROUPS.admin],
    permissions: ["ORG_MANAGE"],
  },
  "/settings/system/holiday-calendar": {
    // วันหยุดเป็น per-company แล้ว → ผู้ดูแลบริษัทจัดการวันหยุดของบริษัทตนได้
    roles: [...ROLE_GROUPS.hr, ...ROLE_GROUPS.admin],
    permissions: ["ORG_MANAGE"],
  },
  // หน้ารวม: เครื่องสแกน + จุด GPS + วิธีลงเวลารายพนักงาน
  // แท็บ "วิธีลงเวลารายพนักงาน" ต้องมี EMPLOYEE_UPDATE เพิ่ม จึงเช็คในหน้าอีกชั้น
  // ATTENDANCE_READ เปิดกว้างเกินไป (หัวหน้างาน/ฝ่ายบัญชีก็มี) หน้านี้เป็นการตั้งค่าอุปกรณ์
  "/settings/attendance": {
    permissions: ["ATTENDANCE_EDIT"],
    description: "ตั้งค่าเครื่องสแกน จุดลงเวลา GPS และวิธีลงเวลาของพนักงาน",
  },
  "/settings/system/attendance-devices": {
    roles: [...ROLE_GROUPS.hr, ...ROLE_GROUPS.admin],
    permissions: ["ATTENDANCE_READ", "ATTENDANCE_EDIT"],
    mode: "any",
    description: "redirect ไปหน้าการลงเวลา",
  },
  "/settings/system/attendance-locations": {
    roles: [...ROLE_GROUPS.hr, ...ROLE_GROUPS.admin],
    permissions: ["ATTENDANCE_READ", "ATTENDANCE_EDIT"],
    mode: "any",
    description: "redirect ไปหน้าอุปกรณ์และวิธีลงเวลา",
  },
  "/settings/system/attendance-methods": {
    roles: [...ROLE_GROUPS.hr, ...ROLE_GROUPS.admin],
    // ต้องได้ทั้งสองตัว ไม่ใช่ any: หน้านี้บันทึกผ่าน PATCH /employees/:id
    // (EMPLOYEE_UPDATE) และอ่าน /attendance/devices + /locations
    // (ATTENDANCE_READ) เพื่อตัดสินว่าเปิดวิธี "เครื่องสแกน" ได้ไหม
    // และเตือนสาขาที่บังคับพื้นที่แต่ยังไม่มีจุด GPS
    permissions: ["EMPLOYEE_UPDATE", "ATTENDANCE_READ"],
    mode: "all",
    description: "กำหนดวิธีลงเวลาและการบังคับพื้นที่ของพนักงานแต่ละคน",
  },
  "/settings/monitoring": {
    platformOnly: true,
    permissions: ["ORG_MANAGE"],
  },
  "/settings/trash": {
    platformOnly: true,
    permissions: ["ORG_MANAGE"],
  },
  "/settings/audit": {
    platformOnly: true,
    permissions: ["ORG_MANAGE"],
  },
};

export function normalizeRoutePath(path: string) {
  if (!path) return "/";

  const pathOnly = path.split("?")[0]?.split("#")[0] || "/";

  if (pathOnly !== "/" && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }

  return pathOnly;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePatternToRegExp(pattern: string) {
  const escaped = escapeRegExp(normalizeRoutePath(pattern)).replace(
    /\\\[[^/]+\\\]/g,
    "[^/]+",
  );

  return new RegExp(`^${escaped}$`);
}

export function normalizeRoleCode(role: RoleLike) {
  if (typeof role === "string") {
    return role.trim().toUpperCase();
  }

  return (role.code || role.name || "").trim().toUpperCase();
}

export function getNormalizedRoleCodes(userRoles: RoleLike[] = []) {
  return userRoles.map((role) => normalizeRoleCode(role)).filter(Boolean);
}

function canAccessPermissions(
  userPermissions: string[] = [],
  requirement?: RoutePermissionRequirement | null,
) {
  if (!requirement || requirement.permissions.length === 0) {
    return true;
  }

  const permissionSet = new Set(userPermissions);
  const mode = requirement.mode ?? "any";

  if (mode === "all") {
    return requirement.permissions.every((permission) =>
      permissionSet.has(permission),
    );
  }

  return requirement.permissions.some((permission) =>
    permissionSet.has(permission),
  );
}

export function isRoutePermissionMatch(pathname: string, routePattern: string) {
  const currentPath = normalizeRoutePath(pathname);
  const pattern = normalizeRoutePath(routePattern);

  if (pattern.includes("[")) {
    return routePatternToRegExp(pattern).test(currentPath);
  }

  return currentPath === pattern || currentPath.startsWith(`${pattern}/`);
}

export function findRoutePermissionRequirement(pathname: string) {
  const currentPath = normalizeRoutePath(pathname);

  return (
    Object.entries(routePermissionMap)
      .filter(([routePattern]) =>
        isRoutePermissionMatch(currentPath, routePattern),
      )
      .sort(
        ([a], [b]) =>
          normalizeRoutePath(b).length - normalizeRoutePath(a).length,
      )[0]?.[1] ?? null
  );
}

export function canAccessPermissionRequirement(
  userPermissions: string[] = [],
  requirement?: RoutePermissionRequirement | null,
  userRoles: RoleLike[] = [],
  scopeLevel?: "GLOBAL" | "COMPANY" | "BRANCH" | null,
) {
  if (!requirement) {
    return true;
  }

  // หน้าเฉพาะแพลตฟอร์ม: ต้องเป็น scope GLOBAL เท่านั้น
  // (แยก platform admin ออกจาก company admin ที่ถือ permission เดียวกัน เช่น ORG_MANAGE)
  if (requirement.platformOnly && scopeLevel !== "GLOBAL") {
    return false;
  }

  // ตัดสินด้วย permission อย่างเดียว ให้ตรงกับ backend (roles ไม่ถูกใช้ block อีกต่อไป)
  return canAccessPermissions(userPermissions, requirement);
}

/**
 * อธิบายว่าทำไมเข้าหน้านี้ไม่ได้
 *
 * ต้องรู้ scope ของผู้ใช้ด้วย ไม่ใช่ดูแค่รายการสิทธิ์ที่หน้านั้นต้องการ
 * เพราะหน้าที่ตั้ง platformOnly ไว้ ผู้ดูแล "ระดับบริษัท" ที่ถือ ORG_MANAGE อยู่แล้ว
 * ก็ยังเข้าไม่ได้ — ของเดิมจะบอกว่า "ต้องมีสิทธิ์ ORG_MANAGE" ซึ่งเขามีอยู่แล้ว
 * เขาจึงไปขอสิทธิ์ที่มีอยู่แล้วซ้ำ แล้วก็ยังเข้าไม่ได้เหมือนเดิม
 *
 * @param scopeLevel ขอบเขตของผู้ใช้ ไม่ส่งมาจะอธิบายได้แค่เรื่องสิทธิ์เหมือนเดิม
 */
export function describePermissionRequirement(
  requirement?: RoutePermissionRequirement | null,
  scopeLevel?: "GLOBAL" | "COMPANY" | "BRANCH" | null,
) {
  if (!requirement) {
    return "บัญชีของคุณยังไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อผู้ดูแลระบบ";
  }

  // ติดที่ขอบเขต ไม่ใช่ที่สิทธิ์ — บอกสิทธิ์ไปก็แก้ปัญหาไม่ได้
  if (requirement.platformOnly && scopeLevel && scopeLevel !== "GLOBAL") {
    return "หน้านี้เปิดให้เฉพาะผู้ดูแลระดับแพลตฟอร์มเท่านั้น ไม่เกี่ยวกับสิทธิ์ที่บัญชีของคุณมี — ถ้าจำเป็นต้องใช้งานให้ติดต่อผู้ดูแลระดับแพลตฟอร์ม";
  }

  const messages: string[] = [];

  if (requirement.roles && requirement.roles.length > 0) {
    const roleMode = requirement.roleMode ?? "any";
    const roleText =
      roleMode === "all"
        ? "ต้องมี role ครบ"
        : "ต้องเป็น role ใด role หนึ่ง เช่น";
    messages.push(`${roleText} ${requirement.roles.join(", ")}`);
  }

  if (requirement.permissions.length > 0) {
    const mode = requirement.mode ?? "any";
    const permissionText =
      mode === "all"
        ? "ต้องมีสิทธิ์ครบทุกสิทธิ์ต่อไปนี้"
        : "ต้องมีสิทธิ์อย่างน้อยหนึ่งรายการ เช่น";
    messages.push(`${permissionText} ${requirement.permissions.join(", ")}`);
  }

  if (messages.length === 0) {
    return "บัญชีของคุณยังไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อผู้ดูแลระบบ";
  }

  return `บัญชีของคุณยังไม่มีสิทธิ์เข้าถึงหน้านี้ ${messages.join(" และ ")}`;
}
