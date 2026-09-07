/**
 * ทะเบียนชุดข้อมูลที่หน้า "ข้อมูลบริษัท" (platform) เปิดให้ดู/ลบได้
 *
 * ต่างจาก TRASH_MODELS ในโมดูลถังขยะตรงที่ตัวนั้นดูของที่ "ลบไปแล้ว"
 * ส่วนตัวนี้ดูของที่ยังใช้งานอยู่ แล้วส่งลงถังขยะ — สองหน้านี้จึงต่อกันเป็นวงจร
 * ลบจากหน้านี้ → ไปโผล่ในถังขยะ → กู้คืนหรือลบถาวรที่นั่น
 *
 * ที่ไม่รวมเข้าเป็นทะเบียนเดียวกันเพราะต้องการคนละอย่าง: หน้านี้ต้องกรองช่วงวัน
 * ต้องรู้ว่าโมเดลไหน soft delete ได้ และโมเดลไหนห้ามแตะ ซึ่งถังขยะไม่ต้องรู้
 */

export type CompanyDataTenantPath = "direct" | "employee" | "user";

export type CompanyDatasetConfig = {
  /** คีย์ที่ใช้ใน URL */
  key: string;
  label: string;
  group: string;
  /** ชื่อ delegate ของ Prisma */
  delegate: string;
  tenant: CompanyDataTenantPath;
  /** ฟิลด์วันที่ใช้เรียงและกรองช่วงเวลา */
  dateField: string;
  dateLabel: string;
  titleFields: string[];
  subtitleFields?: string[];
  statusField?: string;
  searchFields: string[];
  /** มีคอลัมน์ deletedAt ให้ลบแบบกู้คืนได้ไหม */
  softDelete: boolean;
  /** ลบจากหน้านี้ได้ไหม (บางตารางห้ามแตะ) */
  deletable: boolean;
  /** ดึงชื่อพนักงานมาแสดงด้วย */
  includeEmployee?: boolean;
  /** คำเตือนที่ต้องบอกก่อนลบ หรือเหตุผลที่ลบไม่ได้ */
  note?: string;
};

export const COMPANY_DATA_GROUP_LABELS: Record<string, string> = {
  requests: "คำขอต่าง ๆ",
  attendance: "ข้อมูลลงเวลา",
  payroll: "เงินเดือน/ภาษี",
  admin: "ผู้ใช้งาน",
};

export const COMPANY_DATASETS: CompanyDatasetConfig[] = [
  /* ---------------- คำขอ ---------------- */
  {
    key: "leave-requests",
    label: "คำขอลา",
    group: "requests",
    delegate: "leaveRequest",
    tenant: "employee",
    dateField: "createdAt",
    dateLabel: "วันที่ยื่น",
    titleFields: ["requestNo", "id"],
    subtitleFields: ["reason"],
    statusField: "status",
    searchFields: ["requestNo", "reason", "note"],
    softDelete: true,
    deletable: true,
    includeEmployee: true,
  },
  {
    key: "overtime-requests",
    label: "คำขอ OT",
    group: "requests",
    delegate: "overtimeRequest",
    tenant: "employee",
    dateField: "createdAt",
    dateLabel: "วันที่ยื่น",
    titleFields: ["requestNo", "id"],
    subtitleFields: ["reason"],
    statusField: "status",
    searchFields: ["requestNo", "reason", "note"],
    softDelete: true,
    deletable: true,
    includeEmployee: true,
  },
  {
    key: "time-adjust-requests",
    label: "คำขอแก้เวลา",
    group: "requests",
    delegate: "timeAdjustRequest",
    tenant: "employee",
    dateField: "createdAt",
    dateLabel: "วันที่ยื่น",
    titleFields: ["requestNo", "id"],
    subtitleFields: ["reason"],
    statusField: "status",
    searchFields: ["requestNo", "reason", "note"],
    softDelete: true,
    deletable: true,
    includeEmployee: true,
  },
  {
    key: "offsite-requests",
    label: "คำขอทำงานนอกสถานที่",
    group: "requests",
    delegate: "offsiteWorkRequest",
    tenant: "direct",
    dateField: "createdAt",
    dateLabel: "วันที่ยื่น",
    titleFields: ["requestNo", "locationName", "id"],
    subtitleFields: ["reason"],
    statusField: "status",
    searchFields: ["requestNo", "locationName", "address", "reason"],
    softDelete: true,
    deletable: true,
  },
  {
    key: "document-requests",
    label: "คำขอเอกสาร",
    group: "requests",
    delegate: "documentRequest",
    tenant: "direct",
    dateField: "createdAt",
    dateLabel: "วันที่ยื่น",
    titleFields: ["requestNo", "title", "id"],
    subtitleFields: ["purpose"],
    statusField: "status",
    searchFields: ["requestNo", "title", "purpose", "note"],
    softDelete: true,
    deletable: true,
    includeEmployee: true,
  },
  {
    key: "complaints",
    label: "เรื่องร้องเรียน",
    group: "requests",
    delegate: "complaint",
    tenant: "direct",
    dateField: "createdAt",
    dateLabel: "วันที่แจ้ง",
    titleFields: ["complaintNo", "title", "id"],
    subtitleFields: ["category"],
    statusField: "status",
    searchFields: ["complaintNo", "title", "category", "description"],
    softDelete: true,
    deletable: true,
    includeEmployee: true,
  },

  /* ---------------- ลงเวลา ---------------- */
  {
    key: "attendance-logs",
    label: "รายการเข้า-ออกงาน",
    group: "attendance",
    delegate: "attendanceLog",
    tenant: "employee",
    dateField: "logTime",
    dateLabel: "เวลาที่บันทึก",
    titleFields: ["logType", "id"],
    subtitleFields: ["source", "session"],
    statusField: "status",
    searchFields: ["source", "session", "note"],
    softDelete: true,
    deletable: true,
    includeEmployee: true,
    note: "ลบแล้วต้องสั่งคำนวณสรุปรายวันใหม่ ไม่งั้นสรุปเดิมยังค้างค่าเก่าอยู่",
  },
  {
    key: "attendance-summaries",
    label: "สรุปเวลารายวัน",
    group: "attendance",
    delegate: "attendanceDailySummary",
    tenant: "employee",
    dateField: "workDate",
    dateLabel: "วันทำงาน",
    titleFields: ["workDate", "id"],
    subtitleFields: ["status"],
    statusField: "status",
    searchFields: [],
    softDelete: false,
    deletable: true,
    includeEmployee: true,
    note: "ตารางนี้ไม่มีถังขยะ ลบแล้วหายถาวร — สร้างใหม่ได้ด้วยการสั่งคำนวณสรุปใหม่",
  },
  /* ---------------- เงินเดือน/ภาษี ---------------- */
  {
    key: "payroll-periods",
    label: "งวดเงินเดือน",
    group: "payroll",
    delegate: "payrollPeriod",
    tenant: "direct",
    dateField: "createdAt",
    dateLabel: "วันที่สร้าง",
    titleFields: ["name", "code", "id"],
    subtitleFields: ["year", "month"],
    statusField: "status",
    searchFields: ["code", "name"],
    softDelete: true,
    deletable: false,
    note: "ลบจากที่นี่ไม่ได้ — งวดถูกอ้างถึงโดย AttendanceDailySummary / HrReviewItem / PayrollAdjustment ที่เก็บ periodId ไว้เฉย ๆ ไม่มี FK ลบแล้วเบี้ยเลี้ยงกับวันลาจะหายเงียบ ๆ ให้ลบจากหน้าเงินเดือนแทน",
  },
  {
    key: "payroll-runs",
    label: "รอบคำนวณเงินเดือน",
    group: "payroll",
    delegate: "payrollRun",
    tenant: "direct",
    dateField: "createdAt",
    dateLabel: "วันที่สร้าง",
    titleFields: ["runNo", "name", "id"],
    subtitleFields: ["periodId"],
    statusField: "status",
    searchFields: ["runNo", "name"],
    softDelete: true,
    deletable: false,
    note: "เหตุผลเดียวกับงวดเงินเดือน — PayrollAdjustment สถานะ IMPORTED ผูกกับ payrollRunId",
  },
  {
    key: "payroll-adjustments",
    label: "รายการปรับปรุงเงินเดือน",
    group: "payroll",
    delegate: "payrollAdjustment",
    tenant: "direct",
    dateField: "createdAt",
    dateLabel: "วันที่สร้าง",
    titleFields: ["name", "code", "id"],
    subtitleFields: ["type"],
    statusField: "status",
    searchFields: ["code", "name", "note"],
    softDelete: true,
    deletable: true,
    note: "ลบรายการของงวดที่ปิดไปแล้ว จะทำให้ยอดที่เคยจ่ายกับที่คำนวณใหม่ไม่ตรงกัน",
  },
  {
    key: "employee-tax-profiles",
    label: "ข้อมูลภาษีพนักงาน",
    group: "payroll",
    delegate: "employeeTaxProfile",
    tenant: "direct",
    dateField: "createdAt",
    dateLabel: "วันที่สร้าง",
    titleFields: ["taxId", "id"],
    subtitleFields: ["maritalStatus"],
    searchFields: ["taxId", "note"],
    softDelete: true,
    deletable: true,
    includeEmployee: true,
  },

  /* ---------------- ผู้ใช้ ---------------- */
  {
    key: "users",
    label: "ผู้ใช้งาน",
    group: "admin",
    delegate: "user",
    tenant: "user",
    dateField: "createdAt",
    dateLabel: "วันที่สร้าง",
    titleFields: ["displayName", "email"],
    subtitleFields: ["email", "phone"],
    statusField: "status",
    searchFields: ["displayName", "email", "phone"],
    softDelete: true,
    deletable: true,
    note: "ลบผู้ใช้แล้วเจ้าตัวเข้าระบบไม่ได้ทันที แต่ข้อมูลพนักงานยังอยู่ครบ — ตั้งรหัสผ่านใหม่ทำได้ที่หน้าผู้ใช้งาน",
  },
];

export const COMPANY_DATASET_MAP = new Map(
  COMPANY_DATASETS.map((item) => [item.key, item]),
);
