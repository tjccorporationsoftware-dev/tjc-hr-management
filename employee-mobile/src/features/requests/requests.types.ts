import { z } from 'zod';

export const requestTypeSchema = z.enum([
  'LEAVE',
  'OVERTIME',
  'TIME_ADJUST',
  'OFFSITE',
]);

export type RequestType = z.infer<typeof requestTypeSchema>;

export const requestFilterStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export type RequestFilterStatus = z.infer<typeof requestFilterStatusSchema>;

export interface RequestListFilters {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  status?: RequestFilterStatus;
  type?: RequestType;
}

/** slug ที่ใช้ใน URL ของ backend */
export const REQUEST_SLUG: Record<RequestType, string> = {
  LEAVE: 'leave',
  OFFSITE: 'offsite',
  OVERTIME: 'overtime',
  TIME_ADJUST: 'time-adjust',
};

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  LEAVE: 'ลา',
  OFFSITE: 'ทำงานนอกสถานที่',
  OVERTIME: 'ทำ OT',
  TIME_ADJUST: 'แก้เวลาเข้าออก',
};

/**
 * ประเภทที่กล่องอนุมัติรองรับ = สี่ประเภทที่พนักงานยื่นเอง + คำร้องเอกสาร
 *
 * แยกจาก `RequestType` โดยตั้งใจ — `RequestType` ใช้กับฟอร์มยื่นคำขอด้วย
 * ซึ่งไม่มีเอกสารอยู่ในนั้น (เอกสารมี flow และ endpoint ของตัวเองที่
 * `/mobile/v1/documents`) การรวมเป็นตัวเดียวจะทำให้ฟอร์มยื่นคำขอต้องคอย
 * เช็คว่า "ไม่ใช่เอกสารนะ" กระจายไปทุกที่
 *
 * วางไว้ที่นี่ไม่ใช่ใน features/approvals เพราะตัวจัดการไฟล์แนบ (attachment.ts)
 * ต้องใช้ด้วย และไม่ควรให้โมดูลคำขอไปพึ่งโมดูลอนุมัติเพียงเพื่อค่าคงที่
 */
export const APPROVAL_TYPES = [
  'LEAVE',
  'OVERTIME',
  'TIME_ADJUST',
  'OFFSITE',
  'DOCUMENT',
] as const;

export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_SLUG: Record<ApprovalType, string> = {
  ...REQUEST_SLUG,
  DOCUMENT: 'document',
};

export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  ...REQUEST_TYPE_LABEL,
  DOCUMENT: 'ขอเอกสาร',
};

export const requestItemSchema = z.object({
  amountLabel: z.string().nullish(),
  approverName: z.string().nullish(),
  canCancel: z.boolean().default(false),
  createdAt: z.coerce.date().nullish(),
  id: z.string(),
  occurredOn: z.string().nullish(),
  rangeLabel: z.string().nullish(),
  reason: z.string().nullish(),
  requestNo: z.string().nullish(),
  status: z.string(),
  submittedAt: z.coerce.date().nullish(),
  title: z.string(),
  type: requestTypeSchema,
});

export type RequestItem = z.infer<typeof requestItemSchema>;

export const requestAttachmentSchema = z.object({
  createdAt: z.coerce.date().nullish(),
  downloadSupported: z.boolean().default(false),
  fileName: z.string().nullish(),
  fileSize: z.coerce.number().nullish(),
  id: z.string(),
  mimeType: z.string().nullish(),
  title: z.string().nullish(),
});

export type RequestAttachment = z.infer<typeof requestAttachmentSchema>;

export const requestTimelineItemSchema = z.object({
  actedAt: z.coerce.date().nullish(),
  actorName: z.string().nullish(),
  id: z.string(),
  note: z.string().nullish(),
  reason: z.string().nullish(),
  status: z.string(),
  stepNo: z.coerce.number(),
  title: z.string(),
});

export type RequestTimelineItem = z.infer<typeof requestTimelineItemSchema>;


export const requestEditableSchema = z.object({
  adjustType: z.string().nullish(),
  dayType: z.string().nullish(),
  endDate: z.string().nullish(),
  endTime: z.string().nullish(),
  leaveTypeId: z.string().nullish(),
  reason: z.string().nullish(),
  requestedLogTime: z.string().nullish(),
  startDate: z.string().nullish(),
  startTime: z.string().nullish(),
  targetLogType: z.string().nullish(),
  workDate: z.string().nullish(),
  workType: z.string().nullish(),
});

export type RequestEditable = z.infer<typeof requestEditableSchema>;

export const requestDetailFieldSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const requestListSchema = z.object({
  items: z.array(requestItemSchema).default([]),
  meta: z
    .object({
      hasMore: z.boolean().default(false),
      page: z.coerce.number().default(1),
      pageSize: z.coerce.number().default(20),
      total: z.coerce.number().default(0),
      totalPages: z.coerce.number().optional(),
    })
    .default({ hasMore: false, page: 1, pageSize: 20, total: 0 }),
});

export type RequestList = z.infer<typeof requestListSchema>;

/** รายละเอียดคืนก้อนดิบมาด้วย เพราะแต่ละประเภทมี field ไม่เหมือนกัน */
export const requestDetailSchema = requestItemSchema.extend({
  attachments: z.array(requestAttachmentSchema).default([]),
  canDelete: z.boolean().default(false),
  canDeleteAttachments: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canSubmit: z.boolean().default(false),
  details: z.array(requestDetailFieldSchema).default([]),
  editable: requestEditableSchema.default({}),
  /* เก็บ raw ไว้เพื่อคุยกับ backend build เก่าได้ แต่ UI ใหม่ไม่พึ่ง field นี้ */
  raw: z.record(z.string(), z.unknown()).default({}),
  timeline: z.array(requestTimelineItemSchema).default([]),
});

export type RequestDetail = z.infer<typeof requestDetailSchema>;

export const leaveTypeOptionSchema = z.object({
  allowsHourly: z.boolean().default(true),
  entitlementDays: z.coerce.number().default(0),
  isPaid: z.boolean().default(true),
  leaveTypeId: z.string(),
  name: z.string(),
  pendingDays: z.coerce.number().default(0),
  remainingDays: z.coerce.number().default(0),
  requiresAttachment: z.boolean().default(false),
  usedDays: z.coerce.number().default(0),
});

export type LeaveTypeOption = z.infer<typeof leaveTypeOptionSchema>;

export const leaveCatalogSchema = z.object({
  leaveTypes: z.array(leaveTypeOptionSchema).default([]),
});

export type LeaveCatalog = z.infer<typeof leaveCatalogSchema>;

/**
 * ประเภทวันของใบ OT ที่ระบบจับให้จากปฏิทินวันหยุด
 * ฟอร์มไม่มีให้เลือกแล้ว — แสดงอย่างเดียวว่าวันที่เลือกจะถูกคิดเป็นอะไร
 */
export const overtimeDayTypeSchema = z.object({
  holidayName: z.string().nullish(),
  label: z.string().default('วันทำงาน'),
  reason: z.string().default(''),
  workDate: z.string(),
  workType: z
    .enum(['WORKDAY', 'HOLIDAY', 'SPECIAL_HOLIDAY'])
    .default('WORKDAY'),
});

export type OvertimeDayType = z.infer<typeof overtimeDayTypeSchema>;

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  APPROVED: 'อนุมัติแล้ว',
  CANCELLED: 'ยกเลิกแล้ว',
  DRAFT: 'ฉบับร่าง',
  HR_APPROVED: 'ฝ่ายบุคคลอนุมัติแล้ว',
  HR_REJECTED: 'ฝ่ายบุคคลไม่อนุมัติ',
  /* สี่ตัวล่างนี้เป็นสถานะของ "ขั้น" ในสายอนุมัติ ไม่ใช่ของทั้งใบ — ไม่มีที่นี่
     แล้วหน้ารายละเอียดจะโชว์คำอังกฤษดิบ ๆ อย่าง PENDING ให้ผู้ใช้เห็น */
  IN_PROGRESS: 'กำลังตรวจ',
  MANAGER_APPROVED: 'หัวหน้าอนุมัติแล้ว',
  MANAGER_REJECTED: 'หัวหน้าไม่อนุมัติ',
  PENDING: 'รอตรวจ',
  REJECTED: 'ไม่อนุมัติ',
  RETURNED: 'ส่งกลับแก้ไข',
  SUBMITTED: 'รออนุมัติ',
  WAITING: 'รอคิว',
};
