export type MonitoringStatus = "ok" | "degraded" | "down";

export type MonitoringDependencySummary = {
  total: number;
  ok: number;
  degraded: number;
  down: number;
};

export type MonitoringDependency = {
  name: string;
  status: MonitoringStatus;
  latencyMs: number;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
};

export type MonitoringHealth = {
  status: "ok";
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
};

export type MonitoringReadiness = {
  status: MonitoringStatus;
  service: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  dependencies: MonitoringDependency[];
  dependencySummary?: MonitoringDependencySummary;
};

export type MonitoringMetrics = {
  timestamp: string;
  service: string;
  environment: string;
  status: MonitoringStatus;
  process: {
    pid: number;
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    memory: {
      rssBytes: number;
      heapTotalBytes: number;
      heapUsedBytes: number;
      externalBytes: number;
      arrayBuffersBytes: number;
    };
    cpu: {
      userMicros: number;
      systemMicros: number;
    };
  };
  system: {
    hostname: string;
    type: string;
    release: string;
    arch: string;
    cpuCount: number;
    loadAverage: number[];
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
    };
  };
  dependencies: MonitoringDependency[];
  dependencySummary?: MonitoringDependencySummary;
};
export type MonitoringAuditHealth = {
  windowHours: number;
  apiErrors24h: number;
  failedLogins24h: number;
  criticalActions24h: number;
  recentErrors: Array<{
    id: string;
    action: string;
    entity: string;
    description: string | null;
    requestId: string | null;
    method: string | null;
    path: string | null;
    statusCode: number | null;
    createdAt: string;
  }>;
};

export type MonitoringOverview = {
  timestamp: string;
  service: string;
  environment: string;
  status: MonitoringStatus;
  health: MonitoringHealth;
  readiness: MonitoringReadiness;
  metrics: MonitoringMetrics;
  audit: MonitoringAuditHealth;
  dependencySummary?: MonitoringDependencySummary;
};
