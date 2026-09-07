import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { stat } from "fs/promises";
import os from "os";
import path from "path";
import Redis from "ioredis";

import { usesRedisQueue } from "../../common/queue/queue.module";
import { PrismaService } from "../../database/prisma.service";
import { HttpMetricsService } from "./http-metrics.service";
import type { AuditAction } from "../../generated/prisma/client";

type CheckStatus = "ok" | "degraded" | "down";

type DependencyCheck = {
  name: string;
  status: CheckStatus;
  latencyMs: number;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
};

function nowIso() {
  return new Date().toISOString();
}

function getLatencyMs(startedAt: bigint) {
  return Number((process.hrtime.bigint() - startedAt) / BigInt(1_000_000));
}

function buildDependencySummary(dependencies: DependencyCheck[]) {
  return dependencies.reduce(
    (summary, dependency) => {
      summary.total += 1;
      if (dependency.status === "ok") summary.ok += 1;
      if (dependency.status === "degraded") summary.degraded += 1;
      if (dependency.status === "down") summary.down += 1;
      return summary;
    },
    { total: 0, ok: 0, degraded: 0, down: 0 },
  );
}

function resolveProjectPath(value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(process.cwd(), value);
}

@Injectable()
export class MonitoringService implements OnModuleDestroy {
  private readonly redis: Redis | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpMetrics: HttpMetricsService,
  ) {
    /*
     * ค่าเริ่มต้นเดินตาม QUEUE_DRIVER — ถ้าระบบไม่ได้ใช้ Redis แล้ว
     * การเช็คสุขภาพ Redis จะรายงานว่าระบบไม่พร้อมทั้งที่ทุกอย่างปกติดี
     */
    const redisEnabled =
      this.configService.get<string>(
        "MONITORING_REDIS_CHECK_ENABLED",
        usesRedisQueue() ? "true" : "false",
      ) === "true";

    if (!redisEnabled) {
      this.redis = null;
      return;
    }

    this.redis = new Redis({
      host: this.configService.get<string>("REDIS_HOST", "127.0.0.1"),
      port: Number(this.configService.get<string>("REDIS_PORT", "6379")),
      db: Number(this.configService.get<string>("REDIS_DB", "0")),
      password: this.configService.get<string>("REDIS_PASSWORD") || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });

    this.redis.on("error", () => {
      // ไม่ throw เพื่อไม่ให้ระบบล่มจาก monitoring check
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  getHealth() {
    return {
      status: "ok" as const,
      service: "hr-workforce-api",
      environment: this.configService.get<string>("NODE_ENV", "development"),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: nowIso(),
    };
  }

  async getReadiness() {
    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
    ]);

    const dependencies = [database, redis, storage];
    const dependencySummary = buildDependencySummary(dependencies);

    const hasDownCritical = database.status === "down" || storage.status === "down";
    const hasAnyDown = dependencies.some((item) => item.status === "down");
    const hasAnyDegraded = dependencies.some((item) => item.status === "degraded");

    const status: CheckStatus = hasDownCritical
      ? "down"
      : hasAnyDown || hasAnyDegraded
        ? "degraded"
        : "ok";

    return {
      status,
      service: "hr-workforce-api",
      environment: this.configService.get<string>("NODE_ENV", "development"),
      timestamp: nowIso(),
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies,
      dependencySummary,
    };
  }

  async getMetrics() {
    const readiness = await this.getReadiness();
    const memory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: nowIso(),
      service: "hr-workforce-api",
      environment: this.configService.get<string>("NODE_ENV", "development"),
      status: readiness.status,
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          rssBytes: memory.rss,
          heapTotalBytes: memory.heapTotal,
          heapUsedBytes: memory.heapUsed,
          externalBytes: memory.external,
          arrayBuffersBytes: memory.arrayBuffers,
        },
        cpu: {
          userMicros: cpuUsage.user,
          systemMicros: cpuUsage.system,
        },
      },
      system: {
        hostname: os.hostname(),
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg(),
        memory: {
          totalBytes: os.totalmem(),
          freeBytes: os.freemem(),
          usedBytes: os.totalmem() - os.freemem(),
        },
      },
      dependencies: readiness.dependencies,
      dependencySummary: readiness.dependencySummary,
    };
  }


  async getOverview() {
    const [health, readiness, metrics, audit] = await Promise.all([
      Promise.resolve(this.getHealth()),
      this.getReadiness(),
      this.getMetrics(),
      this.getAuditHealthSummary(),
    ]);

    return {
      timestamp: nowIso(),
      service: "hr-workforce-api",
      environment: this.configService.get<string>("NODE_ENV", "development"),
      status: readiness.status,
      health,
      readiness,
      metrics,
      audit,
      dependencySummary: readiness.dependencySummary,
    };
  }

  async getPrometheusMetrics() {
    const metrics = await this.getMetrics();

    const statusValue =
      metrics.status === "ok" ? 1 : metrics.status === "degraded" ? 0.5 : 0;

    const lines = [
      "# HELP hr_api_up HR Workforce API status. 1 ok, 0.5 degraded, 0 down",
      "# TYPE hr_api_up gauge",
      `hr_api_up ${statusValue}`,

      "# HELP hr_api_uptime_seconds Process uptime in seconds",
      "# TYPE hr_api_uptime_seconds gauge",
      `hr_api_uptime_seconds ${metrics.process.uptimeSeconds}`,

      "# HELP hr_api_memory_heap_used_bytes Node.js heap used bytes",
      "# TYPE hr_api_memory_heap_used_bytes gauge",
      `hr_api_memory_heap_used_bytes ${metrics.process.memory.heapUsedBytes}`,

      "# HELP hr_api_memory_rss_bytes Node.js RSS memory bytes",
      "# TYPE hr_api_memory_rss_bytes gauge",
      `hr_api_memory_rss_bytes ${metrics.process.memory.rssBytes}`,

      "# HELP hr_system_memory_total_bytes Total system memory bytes",
      "# TYPE hr_system_memory_total_bytes gauge",
      `hr_system_memory_total_bytes ${metrics.system.memory.totalBytes}`,

      "# HELP hr_system_memory_free_bytes Free system memory bytes",
      "# TYPE hr_system_memory_free_bytes gauge",
      `hr_system_memory_free_bytes ${metrics.system.memory.freeBytes}`,
    ];

    for (const dependency of metrics.dependencies) {
      const value =
        dependency.status === "ok"
          ? 1
          : dependency.status === "degraded"
            ? 0.5
            : 0;

      lines.push(
        `hr_dependency_up{name="${dependency.name}"} ${value}`,
        `hr_dependency_latency_ms{name="${dependency.name}"} ${dependency.latencyMs}`,
      );
    }

    /*
     * counter กับ histogram ของคำขอ HTTP
     *
     * gauge ข้างบนบอกได้แค่สถานะ ณ วินาทีที่ยิงมาถาม ตั้งเงื่อนไขแบบ
     * "error เกิน 5% ใน 5 นาที" หรือ "p95 เกิน 2 วินาที" ไม่ได้เลย
     */
    lines.push(...this.httpMetrics.toPrometheusLines());

    return `${lines.join("\n")}\n`;
  }


  private async getAuditHealthSummary() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [apiErrors24h, failedLogins24h, criticalActions24h, recentErrors] =
      await this.prisma.$transaction([
        this.prisma.auditLog.count({
          where: {
            createdAt: {
              gte: since24h,
            },
            OR: [
              { entity: "ApiError" },
              { statusCode: { gte: 500 } },
            ],
          },
        }),
        this.prisma.auditLog.count({
          where: {
            createdAt: {
              gte: since24h,
            },
            action: {
              in: [
                "LOGIN_FAILED" as AuditAction,
                "LOGIN_LOCKED" as AuditAction,
                "TWO_FACTOR_FAILED" as AuditAction,
              ],
            },
          },
        }),
        this.prisma.auditLog.count({
          where: {
            createdAt: {
              gte: since24h,
            },
            OR: [
              { statusCode: { gte: 400 } },
              { entity: { in: ["ApiError", "PayrollRun", "AttendanceDailySummary", "SystemSettings"] } },
            ],
          },
        }),
        this.prisma.auditLog.findMany({
          where: {
            createdAt: {
              gte: since24h,
            },
            OR: [
              { entity: "ApiError" },
              { statusCode: { gte: 500 } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
          select: {
            id: true,
            action: true,
            entity: true,
            description: true,
            requestId: true,
            method: true,
            path: true,
            statusCode: true,
            createdAt: true,
          },
        }),
      ]);

    return {
      windowHours: 24,
      apiErrors24h,
      failedLogins24h,
      criticalActions24h,
      recentErrors,
    };
  }

  /**
   * ตรวจฐานข้อมูลผ่าน probe ที่มีเพดานเวลา
   *
   * ยิง `$queryRaw` ตรง ๆ ไม่ได้ เพราะถ้า connection ค้าง คำสั่งจะไม่มีวันคืนค่า
   * แล้ว /readiness จะค้างไปด้วย — ตัวจัดการทราฟฟิกจึงไม่รู้ว่าต้องถอด instance นี้ออก
   */
  private async checkDatabase(): Promise<DependencyCheck> {
    const result = await this.prisma.probe();
    const state = this.prisma.getConnectionState();

    if (result.ok) {
      return {
        name: "database",
        status: "ok",
        latencyMs: result.latencyMs,
        message: "PostgreSQL connection is healthy",
        checkedAt: nowIso(),
      };
    }

    return {
      name: "database",
      status: "down",
      latencyMs: result.latencyMs,
      message: "PostgreSQL connection failed",
      checkedAt: nowIso(),
      details: {
        error: result.error,
        consecutiveFailures: state.consecutiveFailures,
      },
    };
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const startedAt = process.hrtime.bigint();

    if (!this.redis) {
      return {
        name: "redis",
        status: "degraded",
        latencyMs: getLatencyMs(startedAt),
        message: "Redis check is disabled",
        checkedAt: nowIso(),
      };
    }

    try {
      if (this.redis.status === "wait") {
        await this.redis.connect();
      }

      const pong = await this.redis.ping();

      return {
        name: "redis",
        status: pong === "PONG" ? "ok" : "degraded",
        latencyMs: getLatencyMs(startedAt),
        message: pong === "PONG" ? "Redis connection is healthy" : "Redis responded unexpectedly",
        checkedAt: nowIso(),
        details: {
          response: pong,
        },
      };
    } catch (error) {
      return {
        name: "redis",
        status: "down",
        latencyMs: getLatencyMs(startedAt),
        message: "Redis connection failed",
        checkedAt: nowIso(),
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async checkStorage(): Promise<DependencyCheck> {
    const startedAt = process.hrtime.bigint();
    const storageDir = resolveProjectPath(
      this.configService.get<string>("STORAGE_DIR", "./storage"),
    );

    try {
      const info = await stat(storageDir);

      if (!info.isDirectory()) {
        return {
          name: "storage",
          status: "down",
          latencyMs: getLatencyMs(startedAt),
          message: "Storage path exists but is not a directory",
          checkedAt: nowIso(),
          details: {
            storageDir,
          },
        };
      }

      return {
        name: "storage",
        status: "ok",
        latencyMs: getLatencyMs(startedAt),
        message: "Storage directory is available",
        checkedAt: nowIso(),
        details: {
          storageDir,
        },
      };
    } catch (error) {
      return {
        name: "storage",
        status: "down",
        latencyMs: getLatencyMs(startedAt),
        message: "Storage directory is not available",
        checkedAt: nowIso(),
        details: {
          storageDir,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}