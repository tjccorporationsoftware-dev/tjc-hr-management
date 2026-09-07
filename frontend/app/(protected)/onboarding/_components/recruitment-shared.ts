import type { Tone } from "@/components/kit";
import type {
  EmploymentTypeTag,
  InterviewResult,
  JobApplicationListSummary,
  JobApplicationStage,
  JobOfferStatus,
  JobPostingListSummary,
  JobPostingStatus,
} from "@/types/recruitment";

/**
 * คำเรียก สี และตัวช่วยของโมดูลสรรหาบุคลากร
 * -----------------------------------------
 * ใช้ร่วมกันระหว่างตารางประกาศ (`recruitment-panel.tsx`) กับหน้ารายละเอียด
 * ประกาศรายใบ (`onboarding/[id]/page.tsx`) — เดิมอยู่ในไฟล์แผงไฟล์เดียว
 * พอแยกหน้ารายละเอียดออกมาแล้วสองที่ต้องใช้ชุดเดียวกัน จึงย้ายมาไว้ที่นี่
 * ไม่งั้นคำเรียกสถานะจะเริ่มต่างกันทีละนิดจนผู้ใช้เห็นคนละคำในสองหน้า
 */

export type CompanyOption = {
  id: string;
  code?: string;
  nameTh?: string;
  name?: string;
};
export type CompanyListResponse = {
  items?: CompanyOption[];
  data?: CompanyOption[];
};

export type DepartmentOption = {
  id: string;
  code?: string;
  nameTh?: string;
  name?: string;
  /** ใช้กรองแผนกให้เหลือเฉพาะของสาขาที่เลือก */
  branchId?: string | null;
};
export type DepartmentListResponse = {
  items?: DepartmentOption[];
  data?: DepartmentOption[];
};

export type BranchOption = {
  id: string;
  code?: string;
  nameTh?: string;
  name?: string;
  companyId?: string;
};

export type InterviewerOption = {
  id: string;
  employeeCode?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  userId?: string | null;
};

export type RecruitmentSummary = {
  postings: JobPostingListSummary;
  applications: JobApplicationListSummary;
};

export const emptyPostingSummary: JobPostingListSummary = {
  total: 0,
  open: 0,
  draft: 0,
  closed: 0,
};

export const emptyApplicationSummary: JobApplicationListSummary = {
  total: 0,
  new: 0,
  screening: 0,
  interview: 0,
  offer: 0,
  hired: 0,
  rejected: 0,
  withdrawn: 0,
};

export const postingStatusText: Record<JobPostingStatus, string> = {
  DRAFT: "ร่าง",
  OPEN: "เปิดรับสมัคร",
  ON_HOLD: "พักรับสมัคร",
  CLOSED: "ปิดรับแล้ว",
  CANCELLED: "ยกเลิก",
};

export const employmentTypeText: Record<EmploymentTypeTag, string> = {
  FULL_TIME: "ประจำ",
  PART_TIME: "พาร์ทไทม์",
  CONTRACT: "สัญญาจ้าง",
  INTERN: "ฝึกงาน",
  TEMPORARY: "ชั่วคราว",
};

export const stageText: Record<JobApplicationStage, string> = {
  NEW: "ผู้สมัครใหม่",
  SCREENING: "คัดกรอง",
  INTERVIEW: "สัมภาษณ์",
  OFFER: "เสนอจ้าง",
  HIRED: "จ้างแล้ว",
  REJECTED: "ไม่ผ่าน",
  WITHDRAWN: "ถอนตัว",
};

export const interviewResultText: Record<InterviewResult, string> = {
  PENDING: "รอสัมภาษณ์",
  PASSED: "ผ่าน",
  FAILED: "ไม่ผ่าน",
  NO_SHOW: "ไม่มาสัมภาษณ์",
};

export const offerStatusText: Record<JobOfferStatus, string> = {
  DRAFT: "ร่าง",
  SENT: "ส่งแล้ว รอตอบ",
  ACCEPTED: "ตอบรับแล้ว",
  DECLINED: "ปฏิเสธ",
  EXPIRED: "หมดอายุ",
  CANCELLED: "ยกเลิก",
};

/** ประกาศที่ยังรับผู้สมัครเพิ่มได้ — ปิดรับ/ยกเลิกแล้วไม่ควรรับคนเข้าอีก */
export function postingAcceptsApplicants(status: JobPostingStatus) {
  return status === "OPEN" || status === "DRAFT";
}

export function postingStatusTone(status: JobPostingStatus): Tone {
  if (status === "OPEN") return "positive";
  if (status === "DRAFT" || status === "ON_HOLD") return "warning";
  if (status === "CANCELLED") return "critical";
  return "neutral";
}

export function stageTone(stage: JobApplicationStage): Tone {
  if (stage === "HIRED") return "positive";
  if (stage === "REJECTED") return "critical";
  if (stage === "OFFER") return "brand";
  if (stage === "INTERVIEW") return "warning";
  return "neutral";
}

export function interviewResultTone(result: InterviewResult): Tone {
  if (result === "PASSED") return "positive";
  if (result === "FAILED") return "critical";
  if (result === "NO_SHOW") return "neutral";
  return "warning";
}

export function offerStatusTone(status: JobOfferStatus): Tone {
  if (status === "ACCEPTED") return "positive";
  if (status === "DECLINED") return "critical";
  if (status === "SENT") return "brand";
  return "neutral";
}

export function todayDate() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

/**
 * รวมวันที่ (YYYY-MM-DD) กับเวลา (HH:mm) เป็น ISO ตามเวลาเครื่องผู้ใช้
 * ส่งวันที่เปล่า ๆ ไปตรง ๆ ไม่ได้ เพราะ new Date("2569-08-14") ฝั่งเซิร์ฟเวอร์
 * อ่านเป็นเที่ยงคืน UTC แล้วเวลานัดจะเพี้ยนไป 7 ชั่วโมงเมื่อแสดงผลไทย
 */
export function toLocalIsoDateTime(date: string, time: string) {
  if (!date) return "";

  const [hour, minute] = (time || "00:00").split(":");
  const local = new Date(`${date}T00:00:00`);
  local.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0);

  return Number.isNaN(local.getTime()) ? "" : local.toISOString();
}

export function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function applicantName(item: { firstName: string; lastName: string }) {
  return `${item.firstName} ${item.lastName}`.trim();
}

export function money(value?: string | number | null) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString("th-TH") : "-";
}

/** ชื่อผู้สัมภาษณ์ที่แสดงในดรอปดาวน์ — มีรหัสกำกับกันคนชื่อซ้ำ */
export function interviewerLabel(person: InterviewerOption) {
  const name =
    person.displayName ||
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    "-";

  return person.employeeCode ? `${person.employeeCode} · ${name}` : name;
}
