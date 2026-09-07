import { z } from 'zod';

export const documentStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentTypeSchema = z.object({
  approvalLevels: z.coerce.number().default(0),
  category: z.string().nullish(),
  code: z.string(),
  description: z.string().nullish(),
  id: z.string(),
  nameEn: z.string().nullish(),
  nameTh: z.string(),
  requiresApproval: z.boolean().default(true),
});
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const documentCatalogSchema = z.object({
  items: z.array(documentTypeSchema).default([]),
});
export type DocumentCatalog = z.infer<typeof documentCatalogSchema>;

export const documentListItemSchema = z.object({
  approvedAt: z.coerce.date().nullish(),
  cancelledAt: z.coerce.date().nullish(),
  createdAt: z.coerce.date().nullish(),
  currentLevel: z.coerce.number().default(0),
  documentNo: z.string().nullish(),
  documentType: documentTypeSchema,
  id: z.string(),
  issuedAt: z.coerce.date().nullish(),
  purpose: z.string().nullish(),
  rejectedAt: z.coerce.date().nullish(),
  requestNo: z.string().nullish(),
  returnedForReview: z.boolean().default(false),
  status: documentStatusSchema,
  submittedAt: z.coerce.date().nullish(),
  title: z.string(),
  updatedAt: z.coerce.date().nullish(),
});
export type DocumentListItem = z.infer<typeof documentListItemSchema>;

export const documentFileSchema = z.object({
  createdAt: z.coerce.date().nullish(),
  description: z.string().nullish(),
  fileName: z.string().nullish(),
  fileSize: z.coerce.number().nullish(),
  fileType: z.string(),
  id: z.string(),
  mimeType: z.string().nullish(),
  title: z.string(),
});
export type DocumentFile = z.infer<typeof documentFileSchema>;

export const documentTimelineSchema = z.object({
  actedAt: z.coerce.date().nullish(),
  action: z.string(),
  actorName: z.string().nullish(),
  id: z.string(),
  level: z.coerce.number().default(0),
  note: z.string().nullish(),
  reason: z.string().nullish(),
  status: z.string().nullish(),
  title: z.string(),
});

export const documentDetailSchema = documentListItemSchema.extend({
  capabilities: z.object({
    canCancel: z.boolean().default(false),
    canDelete: z.boolean().default(false),
    canEdit: z.boolean().default(false),
    canSubmit: z.boolean().default(false),
    returnedForReview: z.boolean().default(false),
  }),
  files: z.array(documentFileSchema).default([]),
  note: z.string().nullish(),
  requestData: z.record(z.string(), z.unknown()).default({}),
  timeline: z.array(documentTimelineSchema).default([]),
});
export type DocumentDetail = z.infer<typeof documentDetailSchema>;

export const documentListSchema = z.object({
  items: z.array(documentListItemSchema).default([]),
  meta: z.object({
    hasMore: z.boolean().default(false),
    page: z.coerce.number().default(1),
    pageSize: z.coerce.number().default(20),
    total: z.coerce.number().default(0),
    totalPages: z.coerce.number().default(0),
  }),
  summary: z.record(z.string(), z.coerce.number()).default({}),
});
export type DocumentList = z.infer<typeof documentListSchema>;

export interface DocumentListFilters {
  dateFrom?: string;
  dateTo?: string;
  documentTypeId?: string;
  search?: string;
  status?: DocumentStatus;
}

export interface DocumentSavePayload {
  documentTypeId: string;
  note?: string | null;
  purpose?: string | null;
  requestData?: Record<string, unknown>;
  submit?: boolean;
  title: string;
}

/*
 * ผูก key กับ DocumentStatus ไม่ใช่ string กว้าง ๆ
 *
 * ภายใต้ noUncheckedIndexedAccess การ index ด้วย string จะได้ `string | undefined`
 * ทำให้ทุกจุดที่เอาไปใส่ป้ายสถานะต้องเขียน fallback ที่ไม่มีวันเกิดขึ้นจริง
 * พอผูกกับ union แล้ว TypeScript จะเตือนเองถ้ามีสถานะใหม่แล้วลืมเติมป้าย
 */
export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  APPROVED: 'อนุมัติแล้ว',
  CANCELLED: 'ยกเลิกแล้ว',
  DRAFT: 'ฉบับร่าง',
  REJECTED: 'ไม่อนุมัติ',
  SUBMITTED: 'รออนุมัติ',
};
