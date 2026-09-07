import type { RequestWithId } from './request-with-id.interface';

export type TenantScope = {
  level: 'GLOBAL' | 'COMPANY' | 'BRANCH';
  companyId: string | null;
  branchId: string | null;
  /** ชื่อบริษัท/สาขาไว้แสดงผลฝั่ง UI (GET /auth/me ต้องมีให้ครบเหมือน login/refresh) */
  companyName?: string | null;
  branchName?: string | null;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  roles: string[];
  permissions: string[];
  sessionId?: string;
  scope: TenantScope;
  /** ผู้ดูแลเป็นคนตั้งรหัสให้ ต้องเปลี่ยนเองก่อนใช้งานระบบ */
  mustChangePassword?: boolean;
};

export interface AuthenticatedRequest extends RequestWithId {
  user?: AuthenticatedUser;
}
