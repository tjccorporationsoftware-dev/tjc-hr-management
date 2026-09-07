import { InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import {
  bindInProcessProcessor,
  registerQueue,
} from '../../common/queue/queue.module';

import { AuditModule } from '../audit/audit.module';
import {
  MAINTENANCE_QUEUE,
  MAINTENANCE_SCHEDULES,
} from './maintenance-queue.constants';
import { MaintenanceProcessor } from './maintenance.processor';

/**
 * ตั้งตารางงานบำรุงรักษาตอนบูต
 *
 * ตอนใช้คิวในโปรเซส ตารางเก็บอยู่ในหน่วยความจำของ instance เดียวที่รันอยู่
 * ตอนใช้ Redis ตารางเก็บใน Redis และกันงานซ้ำให้เอง การลงทะเบียนซ้ำจากทุก
 * instance จึงปลอดภัยทั้งสองทาง
 */
@Module({
  imports: [AuditModule, registerQueue(MAINTENANCE_QUEUE)],
  providers: [MaintenanceProcessor],
})
export class MaintenanceModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceModule.name);

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly processor: MaintenanceProcessor,
  ) {}

  async onApplicationBootstrap() {
    bindInProcessProcessor(MAINTENANCE_QUEUE, this.processor, this.logger);

    for (const schedule of MAINTENANCE_SCHEDULES) {
      try {
        await this.queue.add(
          schedule.name,
          {},
          {
            repeat: {
              pattern: schedule.pattern,
              // ตารางอ่านตามเวลาไทย ไม่ใช่เวลาเซิร์ฟเวอร์
              tz: 'Asia/Bangkok',
            },
            // ชื่อคงที่ = ลงทะเบียนซ้ำแล้วทับตัวเดิม ไม่สะสมเป็นหลายตาราง
            jobId: `repeat:${schedule.name}`,
            // งานบำรุงรักษาที่ล้มควรรอรอบหน้า ดีกว่ารีทรายซ้ำทันทีตอนดิสก์เต็ม
            attempts: 1,
            removeOnComplete: { count: 30 },
            removeOnFail: { count: 30 },
          },
        );

        this.logger.log(
          `ตั้งตารางงาน "${schedule.description}" ที่ ${schedule.pattern} (เวลาไทย)`,
        );
      } catch (error) {
        /*
         * ตั้งตารางไม่ได้ต้องไม่ทำให้เซิร์ฟเวอร์บูตไม่ขึ้น
         * เช่น Redis ยังไม่พร้อมตอนบูต — ระบบยังให้บริการผู้ใช้ได้ตามปกติ
         * แต่ต้องเห็นใน log ว่างานบำรุงรักษาจะไม่รันเอง
         */
        this.logger.error(
          `ตั้งตารางงาน "${schedule.description}" ไม่สำเร็จ — งานนี้จะไม่รันเอง: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
