import type { FeatureFlags } from '@/features/bootstrap/bootstrap.types';
import type {
  ApprovalType,
  RequestType,
} from '@/features/requests/requests.types';

export type NotificationDestination =
  | { pathname: '/attendance' }
  | { pathname: '/document/[id]'; params: { id: string } }
  | {
      pathname: '/request/[type]/[id]';
      params: { id: string; type: RequestType };
    }
  | {
      pathname: '/approvals';
      params: { openId: string; status: 'SUBMITTED'; type: ApprovalType };
    };

export type NotificationNavigationInput = {
  entityId?: string | null;
  entityType?: string | null;
  notificationType?: string | null;
  /** legacy Expo payload kept for one release */
  requestType?: string | null;
};

const REQUEST_TYPE_BY_ENTITY: Record<string, RequestType> = {
  LeaveRequest: 'LEAVE',
  OffsiteWorkRequest: 'OFFSITE',
  OvertimeRequest: 'OVERTIME',
  TimeAdjustRequest: 'TIME_ADJUST',
};

const REQUEST_FLAG: Record<RequestType, keyof FeatureFlags> = {
  LEAVE: 'leave',
  OFFSITE: 'offsite',
  OVERTIME: 'overtime',
  TIME_ADJUST: 'timeAdjust',
};

function toRequestType(input: NotificationNavigationInput) {
  const fromEntity = input.entityType
    ? REQUEST_TYPE_BY_ENTITY[input.entityType]
    : undefined;
  if (fromEntity) return fromEntity;

  return input.requestType === 'LEAVE' ||
    input.requestType === 'OVERTIME' ||
    input.requestType === 'TIME_ADJUST' ||
    input.requestType === 'OFFSITE'
    ? input.requestType
    : undefined;
}

export function resolveNotificationDestination(
  input: NotificationNavigationInput,
  featureFlags?: FeatureFlags,
): NotificationDestination | null {
  const entityId = input.entityId?.trim();
  if (!entityId) return null;

  const notificationType = input.notificationType ?? '';
  const requestType = toRequestType(input);

  if (requestType) {
    if (notificationType.endsWith('_PENDING_APPROVAL')) {
      if (featureFlags && !featureFlags.approvals) return null;

      return {
        params: { openId: entityId, status: 'SUBMITTED', type: requestType },
        pathname: '/approvals',
      } as NotificationDestination;
    }

    if (featureFlags && !featureFlags[REQUEST_FLAG[requestType]]) return null;

    /* legacy payload ไม่มี notificationType — รักษาพฤติกรรมเดิมของ build ก่อนหน้า */
    return {
      params: { id: entityId, type: requestType },
      pathname: '/request/[type]/[id]',
    };
  }

  if (input.entityType === 'DocumentRequest') {
    /*
     * แจ้งเตือน "มีเอกสารรออนุมัติ" ต้องพาไปกล่องอนุมัติ ไม่ใช่จอคำร้องของ
     * ตัวเอง — ผู้อนุมัติไม่ใช่เจ้าของใบ เปิดจอ ESS แล้วจะเจอ 404
     */
    if (notificationType === 'DOCUMENT_PENDING_APPROVAL') {
      if (featureFlags && !featureFlags.approvals) return null;

      return {
        params: { openId: entityId, status: 'SUBMITTED', type: 'DOCUMENT' },
        pathname: '/approvals',
      } as NotificationDestination;
    }

    if (featureFlags && !featureFlags.documents) return null;

    return { params: { id: entityId }, pathname: '/document/[id]' };
  }

  if (input.entityType === 'AttendanceDailySummary') {
    if (featureFlags && !featureFlags.attendance) return null;
    return { pathname: '/attendance' };
  }

  /* HrReviewItem และ entity ที่ยังไม่มี Mobile screen ต้องไม่เดา route */
  return null;
}
