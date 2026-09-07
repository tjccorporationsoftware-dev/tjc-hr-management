import type {
  HrReviewDisplayStatus,
  HrReviewItem,
  HrReviewRecordSummary,
  HrReviewSourceSummary,
} from '../types/hr-review.types';

/**
 * Mapper รวม source + review record ให้เป็น item เดียวสำหรับ frontend
 * -------------------------------------------------------------------
 * Source คือ Leave/OT/TimeAdjust ที่อนุมัติครบแล้ว
 * Review record คือสถานะที่ HR ทำต่อ เช่น ตรวจแล้ว/พร้อมเข้า payroll/พักไว้
 */
export function mapHrReviewItem(params: {
  source: HrReviewSourceSummary;
  review: HrReviewRecordSummary | null;
}): HrReviewItem {
  const reviewStatus: HrReviewDisplayStatus = params.review
    ? params.review.status
    : 'WAITING_REVIEW';

  return {
    id: `${params.source.type}:${params.source.id}`,
    sourceType: params.source.type,
    sourceId: params.source.id,
    requestNo: params.source.requestNo,
    title: params.source.title,
    reason: params.source.reason,
    sourceStatus: params.source.status,
    reviewStatus,
    submittedAt: params.source.submittedAt,
    approvedAt: params.source.approvedAt,
    createdAt: params.source.createdAt,
    employee: params.source.employee,
    detail: params.source.detail,
    review: params.review,
  };
}
