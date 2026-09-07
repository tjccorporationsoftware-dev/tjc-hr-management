import {
  getAttendanceLogReportData,
  getAttendanceReportData,
  getEmployeeRegisterReportData,
  getLeaveQuotaReportData,
  getLeaveRequestReportData,
  getPayrollBasicReportData,
  getSocialSecurityReportData,
  getWorkStatusReportData,
} from "@/lib/api";
import type {
  ReportCode,
  ReportDataQueryParams,
  ReportDataResponse,
} from "@/types/reports";
import { reportColumnZone } from "./report-column-labels";

/**
 * รายงาน HR และ Payroll — ข้อมูลของแต่ละตัวที่หน้ารายงานใช้ร่วมกัน
 * -----------------------------------------------------------------------------
 * รายงานกลุ่มนี้ต่างจากเอกสารอื่นในคลัง ตรงที่ไม่มีไฟล์รออยู่ก่อน — ต้องเลือก
 * ตัวกรองก่อนแล้วระบบถึงจะสร้างไฟล์ให้ จึงมีหน้าของตัวเองที่ `/reports/[code]`
 * แทนที่จะกดโหลดจากรายการตรง ๆ เหมือนไฟล์นำส่งราชการ
 *
 * `periodBasis` บอกว่ารายงานนั้นคิดจากอะไร ซึ่งกำหนดว่าหน้ารายงานจะโชว์
 * ตัวกรองแบบช่วงวันที่ หรือแบบเลือกปี
 */

export type ReportPeriodBasis = "dateRange" | "year";

export type ReportDefinition = {
  code: ReportCode;
  /** ใช้เป็นส่วนหนึ่งของ URL — อ่านออกกว่าใช้รหัสตัวใหญ่ */
  slug: string;
  name: string;
  description: string;
  /** อธิบายว่าเอาไปใช้ตอบคำถามอะไร — ช่วยให้เลือกรายงานถูกตัวตั้งแต่แรก */
  useCase: string;
  periodBasis: ReportPeriodBasis;
  load: (params: ReportDataQueryParams) => Promise<ReportDataResponse>;
  /**
   * เลือกว่าจะแสดงคอลัมน์ไหนบ้างจากข้อมูลที่ API ส่งมา
   *
   * ใช้เมื่อรายงานสองตัวดึงข้อมูลชุดเดียวกันแต่ตอบคนละคำถาม — เช่นสถานะการมาทำงาน
   * ที่ API ส่งมาทั้งยอดสรุปและปฏิทิน 31 ช่องในก้อนเดียว แต่คนดูไม่ได้อยากเห็นพร้อมกัน
   * ไม่ใส่ = แสดงทุกคอลัมน์ตามเดิม
   */
  columns?: (key: string) => boolean;
  /**
   * มุมมองที่จะส่งไปให้ตัวสร้างไฟล์ เพื่อให้ไฟล์ที่โหลดมีคอลัมน์ตรงกับที่เห็นบนจอ
   * ไม่ใส่ = ไฟล์มีทุกคอลัมน์ตามเดิม
   */
  exportView?: "summary" | "calendar";
};

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  /*
   * สถานะการมาทำงานถูกแยกเป็นสองรายงานที่ใช้ข้อมูลชุดเดียวกัน
   *
   * เดิมยัดทั้งยอดสรุปและปฏิทิน 31 ช่องไว้ในตารางเดียว รวมแล้ว 43 คอลัมน์
   * ซึ่งตอบสองคำถามที่คนละเวลากัน — "เดือนนี้ใครขาดเยอะ" กับ "คนนี้ขาดวันไหนบ้าง"
   * แยกหน้าแล้วแต่ละหน้าเหลือคอลัมน์เท่าที่จำเป็น อ่านจบโดยไม่ต้องเลื่อนแนวนอน
   */
  {
    code: "WORK_STATUS",
    slug: "work-status",
    name: "สรุปสถานะการมาทำงาน",
    description: "นับยอดมา สาย ลา ขาด และลืมลงเวลาของแต่ละคนในหนึ่งเดือน",
    useCase:
      "ดูว่าเดือนนี้ใครขาดงานหรือมาสายเยอะ — เลือกช่วงวันที่ให้ครอบเดือนที่ต้องการ ถ้าอยากรู้ว่าเป็นวันไหนบ้างให้ดูที่รายงานปฏิทินการมาทำงาน",
    periodBasis: "dateRange",
    load: getWorkStatusReportData,
    // ตัดช่องปฏิทินออก เหลือตัวตนพนักงานกับยอดสรุป
    columns: (key) => reportColumnZone(key) !== "calendar",
    exportView: "summary",
  },
  {
    code: "WORK_STATUS",
    slug: "work-calendar",
    name: "ปฏิทินการมาทำงาน",
    description: "ปฏิทินทั้งเดือน วันไหนมา ลา ขาด หรือหยุด",
    useCase:
      "ไล่ดูว่าพนักงานคนไหนขาดหรือสายตรงวันไหนของเดือน — เลือกช่วงวันที่ให้ครอบเดือนที่ต้องการ ถ้าอยากได้แค่ยอดรวมให้ดูที่รายงานสรุปสถานะการมาทำงาน",
    periodBasis: "dateRange",
    load: getWorkStatusReportData,
    // ตัดคอลัมน์ยอดสรุปออก เหลือตัวตนพนักงานกับปฏิทิน
    columns: (key) => reportColumnZone(key) !== "summary",
    exportView: "calendar",
  },
  {
    code: "ATTENDANCE",
    slug: "attendance",
    name: "ตารางเวลาการทำงาน",
    description: "รายคนรายวัน เข้ากี่โมง ออกกี่โมง สาย และ OT",
    useCase:
      "ดูการลงเวลาของพนักงานคนเดียวยาว ๆ เช่นทั้งปี — เลือกพนักงานแล้วตั้งช่วงวันที่ให้ครอบทั้งปี",
    periodBasis: "dateRange",
    load: getAttendanceReportData,
  },
  {
    code: "ATTENDANCE_LOG",
    slug: "attendance-log",
    name: "การลงเวลา",
    description: "บันทึกดิบทุกครั้งที่แตะลงเวลา",
    useCase:
      "ตรวจย้อนว่าการลงเวลาครั้งไหนมาจากเครื่องไหน ช่องทางใด หรือนอกสถานที่",
    periodBasis: "dateRange",
    load: getAttendanceLogReportData,
  },
  {
    code: "LEAVE_QUOTA",
    slug: "leave-quota",
    name: "โควตาวันลา",
    description: "สิทธิ์ ใช้ไป และคงเหลือรายคน",
    useCase:
      "ดูวันลาสะสมทั้งปีของพนักงานแต่ละคน แยกตามประเภทการลา — รายงานนี้ยึดตามปี ไม่ใช่ช่วงวันที่",
    periodBasis: "year",
    load: getLeaveQuotaReportData,
  },
  {
    code: "LEAVE_REQUEST",
    slug: "leave-request",
    name: "รายการใบลา",
    description: "ใครลาวันไหน ประเภทอะไร กี่วัน",
    useCase: "ไล่ดูใบลาทีละใบพร้อมเหตุผลและสถานะอนุมัติ",
    periodBasis: "dateRange",
    load: getLeaveRequestReportData,
  },
  {
    code: "EMPLOYEE_REGISTER",
    slug: "employee-register",
    name: "ทะเบียนพนักงาน",
    description: "รายชื่อพร้อมสังกัด วันเริ่มงาน และอายุงาน",
    useCase:
      "ทำทะเบียนรายชื่อพนักงานส่งหน่วยงานภายนอก หรือใช้ตรวจสอบข้อมูลสังกัด",
    periodBasis: "dateRange",
    load: getEmployeeRegisterReportData,
  },
  {
    code: "PAYROLL_BASIC",
    slug: "payroll-basic",
    name: "สรุปเงินเดือนเบื้องต้น",
    description: "ยอดรับ-หักรายคนตามช่วงวันที่",
    useCase: "ประมาณการค่าจ้างและ OT ก่อนปิดรอบเงินเดือนจริง",
    periodBasis: "dateRange",
    load: getPayrollBasicReportData,
  },
  {
    code: "SOCIAL_SECURITY",
    slug: "social-security",
    name: "รายงานประกันสังคม",
    description: "ฐานค่าจ้างและเงินสมทบตามช่วงวันที่",
    useCase: "ตรวจฐานค่าจ้างและเงินสมทบรายคนก่อนนำส่งประกันสังคม",
    periodBasis: "dateRange",
    load: getSocialSecurityReportData,
  },
];

export function findReportBySlug(slug: string) {
  return REPORT_DEFINITIONS.find((item) => item.slug === slug) ?? null;
}
