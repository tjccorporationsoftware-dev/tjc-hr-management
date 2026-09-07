export type TenantScope = {
  level: "GLOBAL" | "COMPANY" | "BRANCH";
  companyId: string | null;
  branchId: string | null;
  companyName?: string | null;
  branchName?: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  roles: string[];
  permissions: string[];
  scope?: TenantScope;
  /** ผู้ดูแลเป็นคนตั้งรหัสให้ ต้องเปลี่ยนเองก่อนใช้งานระบบ */
  mustChangePassword?: boolean;
};

export type LoginSuccessResponse = {
  requiresTwoFactor?: false;
  accessToken: string;
  tokenType: "Bearer";
  user: AuthUser;
};

export type LoginTwoFactorRequiredResponse = {
  requiresTwoFactor: true;
  twoFactorToken: string;
  expiresAt: string;
  debugTwoFactorCode?: string;
};

export type LoginResponse =
  | LoginSuccessResponse
  | LoginTwoFactorRequiredResponse;

export type VerifyTwoFactorResponse = LoginSuccessResponse;

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  meta?: unknown;
  summary?: unknown;
  requestId?: string;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type AuthSession = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
};

export type AuthSessionListSummary = {
  total: number;
  active: number;
  inactive: number;
  revoked: number;
  expired: number;
};

export type AuthSessionListResponse = {
  data: AuthSession[];
  summary: AuthSessionListSummary;
};

export type RevokeSessionResponse = {
  revoked: boolean;
  sessionId?: string;
  revokedCount?: number;
  currentSessionId?: string;
};