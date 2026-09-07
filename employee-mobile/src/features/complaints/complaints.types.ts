import { z } from 'zod';

export const complaintStatusSchema = z.enum([
  'SUBMITTED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
]);
export type ComplaintStatus = z.infer<typeof complaintStatusSchema>;

export const complaintListItemSchema = z.object({
  cancelledAt: z.coerce.date().nullish(),
  category: z.string().nullish(),
  closedAt: z.coerce.date().nullish(),
  complaintNo: z.string(),
  createdAt: z.coerce.date().nullish(),
  handledAt: z.coerce.date().nullish(),
  id: z.string(),
  status: complaintStatusSchema,
  submittedAt: z.coerce.date().nullish(),
  title: z.string(),
  updatedAt: z.coerce.date().nullish(),
});
export type ComplaintListItem = z.infer<typeof complaintListItemSchema>;

export const complaintDetailSchema = complaintListItemSchema.extend({
  capabilities: z.object({
    canCancel: z.boolean().default(false),
  }),
  description: z.string(),
  expectation: z.string().nullish(),
  handler: z
    .object({
      displayName: z.string().nullish(),
    })
    .nullish(),
  note: z.string().nullish(),
});
export type ComplaintDetail = z.infer<typeof complaintDetailSchema>;

export const complaintListSchema = z.object({
  items: z.array(complaintListItemSchema).default([]),
  meta: z.object({
    hasMore: z.boolean().default(false),
    page: z.coerce.number().default(1),
    pageSize: z.coerce.number().default(20),
    total: z.coerce.number().default(0),
    totalPages: z.coerce.number().default(0),
  }),
});
export type ComplaintList = z.infer<typeof complaintListSchema>;

export interface ComplaintListFilters {
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  status?: ComplaintStatus;
}

export interface ComplaintCreatePayload {
  category?: string | null;
  description: string;
  expectation?: string | null;
  note?: string | null;
  title: string;
}

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  SUBMITTED: 'ส่งเรื่องแล้ว',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RESOLVED: 'ดำเนินการแล้ว',
  CLOSED: 'ปิดเรื่องแล้ว',
  CANCELLED: 'ถอนเรื่องแล้ว',
};
