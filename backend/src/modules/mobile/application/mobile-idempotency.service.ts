import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import {
  MOBILE_ERROR_CODES,
  MOBILE_IDEMPOTENCY_TTL_HOURS_DEFAULT,
} from '../mobile.constants';

type BeginParams = {
  key: string;
  requestPayload: unknown;
  scope: string;
  userId: string;
};

type BeginResult =
  | { status: 'REPLAY'; responseBody: unknown }
  | { status: 'STARTED'; recordId: string };

type ExecuteOptionalParams<T> = {
  key: string | null | undefined;
  requestPayload: unknown;
  scope: string;
  userId: string;
  handler: () => Promise<T>;
  responseStatus?: number;
  /**
   * ใช้กับ multipart: multer เขียนไฟล์ก่อนเข้า controller แล้ว ถ้า key นี้เป็น retry
   * ต้องลบไฟล์ก้อนใหม่ที่เพิ่งเขียนก่อนคืน replay/409 เพื่อไม่ให้มี orphan file
   */
  onReusedKey?: () => Promise<void> | void;
};

/** Postgres unique violation — เกิดเมื่อสอง request เข้ามาพร้อมกันด้วย key เดียวกัน */
const UNIQUE_VIOLATION = 'P2002';

/**
 * BE-MOB-005 — ซองกัน mutation ซ้ำ
 *
 * ใช้ห่อรอบนอกของ Domain Service เท่านั้น ไม่แตะตรรกะข้างใน
 * กติกา (บทที่ 13.4):
 *   key เดิม + hash เดิม + ทำเสร็จแล้ว = คืนผลเดิม
 *   key เดิม + hash เดิม + ยังไม่เสร็จ  = 409 ให้ client รอแล้วค่อย query สถานะ
 *   key เดิม + hash ต่าง               = 409 IDEMPOTENCY_CONFLICT
 */
@Injectable()
export class MobileIdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async begin(params: BeginParams): Promise<BeginResult> {
    const requestHash = this.hashRequest(params.requestPayload);
    const now = new Date();

    const existing = await this.prisma.mobileIdempotencyRecord.findUnique({
      where: {
        userId_scope_key: {
          userId: params.userId,
          scope: params.scope,
          key: params.key,
        },
      },
    });

    if (existing && existing.expiresAt.getTime() > now.getTime()) {
      return this.resolveExisting(existing, requestHash);
    }

    if (existing) {
      // หมดอายุแล้ว — เริ่มรอบใหม่บนแถวเดิมเพื่อไม่ให้ชน unique constraint
      const refreshed = await this.prisma.mobileIdempotencyRecord.update({
        where: { id: existing.id },
        data: {
          requestHash,
          responseStatus: null,
          responseBody: Prisma.DbNull,
          completedAt: null,
          expiresAt: this.getExpiresAt(now),
        },
      });

      return { status: 'STARTED', recordId: refreshed.id };
    }

    try {
      const created = await this.prisma.mobileIdempotencyRecord.create({
        data: {
          userId: params.userId,
          scope: params.scope,
          key: params.key,
          requestHash,
          expiresAt: this.getExpiresAt(now),
        },
      });

      return { status: 'STARTED', recordId: created.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        // แข่งกันสร้าง — อีก request หนึ่งชนะไปแล้ว อ่านของจริงมาตัดสินอีกที
        const winner = await this.prisma.mobileIdempotencyRecord.findUnique({
          where: {
            userId_scope_key: {
              userId: params.userId,
              scope: params.scope,
              key: params.key,
            },
          },
        });

        if (winner) {
          return this.resolveExisting(winner, requestHash);
        }
      }

      throw error;
    }
  }

  /**
   * ห่อ mutation แบบ backward-compatible
   *
   * - ไม่มี key: ทำงานเหมือน build เก่า
   * - มี key: ใช้ begin/complete/release ชุดเดียวกับ Attendance
   * - replay/conflict/in-progress: เรียก onReusedKey เพื่อ cleanup multipart file ที่เพิ่งถูก multer เขียน
   */
  async executeOptional<T>(params: ExecuteOptionalParams<T>): Promise<T> {
    const normalizedKey = params.key?.trim();

    if (!normalizedKey) {
      return params.handler();
    }

    let begin: BeginResult;

    try {
      begin = await this.begin({
        key: normalizedKey,
        requestPayload: params.requestPayload,
        scope: params.scope,
        userId: params.userId,
      });
    } catch (error) {
      await params.onReusedKey?.();
      throw error;
    }

    if (begin.status === 'REPLAY') {
      await params.onReusedKey?.();
      return begin.responseBody as T;
    }

    let response: T;
    try {
      response = await params.handler();
    } catch (error) {
      // Domain ล้มก่อนยืนยันผล — ปล่อย key ให้ผู้ใช้ลอง intent เดิมใหม่ได้
      await this.release(begin.recordId);
      throw error;
    }

    /*
     * ถ้า complete เองล้ม ห้าม release record: Domain mutation อาจ commit ไปแล้ว
     * การลบ key ตรงนี้จะเปิดทางให้ retry ด้วย key เดิมทำ mutation ซ้ำ
     * ปล่อย record เป็น IN_PROGRESS ปลอดภัยกว่า และให้ client re-fetch สถานะจริง
     */
    await this.complete(
      begin.recordId,
      params.responseStatus ?? 200,
      response,
    );
    return response;
  }

  async complete(recordId: string, responseStatus: number, responseBody: unknown) {
    await this.prisma.mobileIdempotencyRecord.update({
      where: { id: recordId },
      data: {
        responseStatus,
        responseBody: this.toJsonValue(responseBody),
        completedAt: new Date(),
      },
    });
  }

  /**
   * ปล่อย key คืนเมื่อ Domain Service โยน error
   * ถ้าไม่ปล่อย ผู้ใช้จะติด 409 ค้างจนกว่า key จะหมดอายุ ทั้งที่ยังไม่มีรายการถูกบันทึก
   */
  async release(recordId: string) {
    await this.prisma.mobileIdempotencyRecord
      .delete({ where: { id: recordId } })
      .catch(() => undefined);
  }

  private resolveExisting(
    existing: {
      completedAt: Date | null;
      requestHash: string;
      responseBody: Prisma.JsonValue | null;
    },
    requestHash: string,
  ): BeginResult {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: MOBILE_ERROR_CODES.idempotencyConflict,
        message: 'Idempotency-Key นี้ถูกใช้กับข้อมูลชุดอื่นไปแล้ว',
      });
    }

    if (existing.completedAt) {
      return { status: 'REPLAY', responseBody: existing.responseBody };
    }

    throw new ConflictException({
      code: MOBILE_ERROR_CODES.idempotencyInProgress,
      message: 'คำขอก่อนหน้ากำลังดำเนินการอยู่ กรุณาตรวจสอบสถานะอีกครั้ง',
    });
  }

  private hashRequest(payload: unknown) {
    return createHash('sha256')
      .update(JSON.stringify(this.sortValue(payload) ?? null))
      .digest('hex');
  }

  /**
   * เรียงคีย์ให้คงที่ก่อน hash — ลำดับ key ใน JSON ของ client ไม่ควรทำให้กลายเป็นคนละคำขอ
   */
  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }

    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((accumulator, key) => {
          accumulator[key] = this.sortValue(
            (value as Record<string, unknown>)[key],
          );
          return accumulator;
        }, {});
    }

    return value;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private getExpiresAt(now: Date) {
    const hours = Number.parseInt(
      this.configService.get<string>(
        'MOBILE_IDEMPOTENCY_TTL_HOURS',
        String(MOBILE_IDEMPOTENCY_TTL_HOURS_DEFAULT),
      ),
      10,
    );

    const ttlHours =
      Number.isFinite(hours) && hours > 0
        ? hours
        : MOBILE_IDEMPOTENCY_TTL_HOURS_DEFAULT;

    return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  }
}
