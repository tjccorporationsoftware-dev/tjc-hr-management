import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../../database/prisma.service';
import {
  MOBILE_MAINTENANCE_JOB_PURGE_IDEMPOTENCY,
  MOBILE_MAINTENANCE_QUEUE,
  MOBILE_MAINTENANCE_SCHEDULER_ID,
} from '../mobile.constants';

/**
 * บทที่ 13.4 — งานดูแล mobile_idempotency_records
 *
 * ตารางนี้มีแถวเพิ่มทุกครั้งที่ลงเวลา และไม่มีอะไรลบให้เลย ปล่อยไว้จะโตไม่หยุด
 * แถวที่ `expiresAt` ผ่านไปแล้วไม่มีประโยชน์อีก เพราะ `begin()` จะเริ่มรอบใหม่
 * ทับให้อยู่แล้ว
 *
 * ใช้ repeatable job ของ BullMQ ที่มีอยู่แล้วในระบบ ไม่เพิ่ม scheduler ตัวใหม่
 * และ upsert ด้วย id คงที่ เพื่อให้รันหลาย instance แล้วยังมีตารางเดียว
 */
@Injectable()
export class MobileMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger('MobileMaintenance');

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue(MOBILE_MAINTENANCE_QUEUE)
    private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.log('ปิดงานล้าง idempotency records ไว้ตาม config');
      return;
    }

    try {
      await this.queue.upsertJobScheduler(
        MOBILE_MAINTENANCE_SCHEDULER_ID,
        { pattern: this.getCronPattern() },
        { name: MOBILE_MAINTENANCE_JOB_PURGE_IDEMPOTENCY },
      );
    } catch (error) {
      // Redis ล่มไม่ควรทำให้ backend เปิดไม่ขึ้น งานนี้เป็นงานบ้าน ไม่ใช่เส้นทางผู้ใช้
      this.logger.error(
        `ตั้งเวลางานล้าง idempotency records ไม่สำเร็จ: ${String(error)}`,
      );
    }
  }

  /** ลบเฉพาะแถวที่หมดอายุแล้วจริง ๆ — แถวที่ยังไม่หมดอายุคือเกราะกันส่งซ้ำที่ยังทำงานอยู่ */
  async purgeExpiredIdempotencyRecords(now = new Date()) {
    const result = await this.prisma.mobileIdempotencyRecord.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    if (result.count > 0) {
      this.logger.log(`ลบ idempotency records ที่หมดอายุ ${result.count} แถว`);
    }

    return { deleted: result.count };
  }

  private isEnabled() {
    return (
      this.configService.get<string>(
        'MOBILE_IDEMPOTENCY_CLEANUP_ENABLED',
        'true',
      ) !== 'false'
    );
  }

  private getCronPattern() {
    return this.configService.get<string>(
      'MOBILE_IDEMPOTENCY_CLEANUP_CRON',
      // ตี 3 ทุกวัน — นอกช่วงลงเวลาเข้า/ออกงานของทุกกะ
      '0 3 * * *',
    );
  }
}
