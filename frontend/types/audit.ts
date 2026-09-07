export type AuditUserSummary = {
  id: string;
  email: string;
  displayName: string;
};

export type AuditLogItem = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string | null;
  userId: string | null;
  user: AuditUserSummary | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  metadata: unknown;
  createdAt: string;
};

export type AuditLogListParams = {
  q?: string;
  action?: string;
  entity?: string;
  userId?: string;
  ipAddress?: string;
  statusCode?: number | string;
  dateFrom?: string;
  dateTo?: string;
  securityOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type AuditLogListResponse = {
  data: AuditLogItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type AuditSummaryItem = {
  key: string;
  count: number;
};

export type AuditSummary = {
  days: number;
  dateFrom: string;
  dateTo: string;
  total: number;
  failedOrError: number;
  securityEvents: number;
  successEvents: number;
  byAction: AuditSummaryItem[];
  byEntity: AuditSummaryItem[];
  byStatusCode: AuditSummaryItem[];
  byDay: AuditSummaryItem[];
};
export type AuditCriticalActions = {
  days: number;
  dateFrom: string;
  dateTo: string;
  totalCritical: number;
  apiErrors: number;
  failedLogins: number;
  payrollActions: number;
  attendanceActions: number;
  byAction: AuditSummaryItem[];
  byEntity: AuditSummaryItem[];
  recentLogs: AuditLogItem[];
};
