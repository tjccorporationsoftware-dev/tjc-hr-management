import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import Redis from "ioredis";

import { usesRedisQueue } from "../queue/queue.module";

type ConsumeInput = {
  keyPrefix: string;
  keyParts: Array<string | null | undefined>;
  limit: number;
  windowSeconds: number;
};

type ConsumeResult = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

type MemoryRateLimitRecord = {
  count: number;
  expiresAt: number;
};

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly memoryStore = new Map<string, MemoryRateLimitRecord>();

  constructor(private readonly configService: ConfigService) {
    const enabled = this.configService.get<string>(
      "RATE_LIMIT_ENABLED",
      "true",
    );

    /*
     * ค่าเริ่มต้นเดินตาม QUEUE_DRIVER — ระบบที่ไม่ได้ใช้ Redis เป็นคิว
     * ก็ไม่ควรต่อ Redis เพื่อนับจำนวนครั้งล็อกอินเช่นกัน
     *
     * ตัวนับในหน่วยความจำใช้ได้เท่ากันเมื่อรัน instance เดียว ต่างกันตรงที่
     * ตัวนับหายเมื่อรีสตาร์ต และถ้าวันหนึ่งรันหลาย instance จะนับแยกกัน
     * ซึ่งทำให้ล็อกบัญชีช้ากว่าที่ตั้งไว้เป็นจำนวนเท่าของ instance
     * ถึงตอนนั้นต้องกลับไปตั้ง RATE_LIMIT_REDIS_ENABLED=true พร้อมกับคิว
     */
    const redisEnabled = this.configService.get<string>(
      "RATE_LIMIT_REDIS_ENABLED",
      usesRedisQueue() ? "true" : "false",
    );

    if (enabled !== "true" || redisEnabled !== "true") {
      this.redis = null;
      return;
    }

    this.redis = new Redis({
      host: this.configService.get<string>("REDIS_HOST", "127.0.0.1"),
      port: Number(this.configService.get<string>("REDIS_PORT", "6379")),
      db: Number(this.configService.get<string>("REDIS_DB", "0")),
      password:
        this.configService.get<string>("REDIS_PASSWORD") || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    this.redis.on("error", () => {
      // fallback ไปใช้ memory store เงียบ ๆ เพื่อไม่ให้ API ล่มถ้า Redis มีปัญหา
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  async consume(input: ConsumeInput): Promise<ConsumeResult> {
    const enabled = this.configService.get<string>(
      "RATE_LIMIT_ENABLED",
      "true",
    );

    if (enabled !== "true") {
      return {
        allowed: true,
        count: 0,
        limit: input.limit,
        remaining: input.limit,
        resetAt: new Date(Date.now() + input.windowSeconds * 1000),
        retryAfterSeconds: 0,
      };
    }

    const key = this.buildKey(input.keyPrefix, input.keyParts);

    if (this.redis) {
      try {
        if (this.redis.status === "wait") {
          await this.redis.connect();
        }

        return await this.consumeWithRedis(key, input.limit, input.windowSeconds);
      } catch {
        return this.consumeWithMemory(key, input.limit, input.windowSeconds);
      }
    }

    return this.consumeWithMemory(key, input.limit, input.windowSeconds);
  }

  private async consumeWithRedis(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<ConsumeResult> {
    if (!this.redis) {
      return this.consumeWithMemory(key, limit, windowSeconds);
    }

    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    const ttl = await this.redis.ttl(key);
    const safeTtl = ttl > 0 ? ttl : windowSeconds;
    const resetAt = new Date(Date.now() + safeTtl * 1000);
    const retryAfterSeconds = Math.max(safeTtl, 1);
    const remaining = Math.max(limit - count, 0);

    return {
      allowed: count <= limit,
      count,
      limit,
      remaining,
      resetAt,
      retryAfterSeconds,
    };
  }

  private consumeWithMemory(
    key: string,
    limit: number,
    windowSeconds: number,
  ): ConsumeResult {
    const now = Date.now();
    const current = this.memoryStore.get(key);

    if (!current || current.expiresAt <= now) {
      const expiresAt = now + windowSeconds * 1000;

      this.memoryStore.set(key, {
        count: 1,
        expiresAt,
      });

      return {
        allowed: true,
        count: 1,
        limit,
        remaining: Math.max(limit - 1, 0),
        resetAt: new Date(expiresAt),
        retryAfterSeconds: windowSeconds,
      };
    }

    current.count += 1;
    this.memoryStore.set(key, current);

    const retryAfterSeconds = Math.max(
      Math.ceil((current.expiresAt - now) / 1000),
      1,
    );

    return {
      allowed: current.count <= limit,
      count: current.count,
      limit,
      remaining: Math.max(limit - current.count, 0),
      resetAt: new Date(current.expiresAt),
      retryAfterSeconds,
    };
  }

  private buildKey(keyPrefix: string, keyParts: Array<string | null | undefined>) {
    const prefix = this.configService.get<string>(
      "RATE_LIMIT_KEY_PREFIX",
      "hr:rate-limit",
    );

    const normalizedParts = keyParts
      .filter((part): part is string => Boolean(part))
      .map((part) => this.hashPart(part));

    return [prefix, keyPrefix, ...normalizedParts].join(":");
  }

  private hashPart(value: string) {
    return createHash("sha256").update(value).digest("hex").slice(0, 32);
  }
}