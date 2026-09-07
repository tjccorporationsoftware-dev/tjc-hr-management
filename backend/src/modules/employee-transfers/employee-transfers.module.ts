import { InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import {
  bindInProcessProcessor,
  registerQueue,
} from '../../common/queue/queue.module';
import { PrismaModule } from '../../database/prisma.module';
import { EmployeesModule } from '../employees/employees.module';

import {
  EMPLOYEE_TRANSFER_APPLY_PATTERN,
  EMPLOYEE_TRANSFER_JOB_APPLY_DUE,
  EMPLOYEE_TRANSFER_QUEUE,
} from './employee-transfer-queue.constants';
import { EmployeeTransfersController } from './employee-transfers.controller';
import { EmployeeTransfersProcessor } from './employee-transfers.processor';
import { EmployeeTransfersService } from './employee-transfers.service';

@Module({
  imports: [
    PrismaModule,
    // ใช้ตัวตรวจสังกัดชุดเดียวกับฟอร์มแก้ทะเบียน จะได้ไม่มีกติกาสองชุด
    EmployeesModule,
    registerQueue(EMPLOYEE_TRANSFER_QUEUE),
  ],
  controllers: [EmployeeTransfersController],
  providers: [EmployeeTransfersService, EmployeeTransfersProcessor],
  exports: [EmployeeTransfersService],
})
export class EmployeeTransfersModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmployeeTransfersModule.name);

  constructor(
    @InjectQueue(EMPLOYEE_TRANSFER_QUEUE) private readonly queue: Queue,
    private readonly processor: EmployeeTransfersProcessor,
    private readonly service: EmployeeTransfersService,
  ) {}

  async onApplicationBootstrap() {
    bindInProcessProcessor(EMPLOYEE_TRANSFER_QUEUE, this.processor, this.logger);

    try {
      await this.queue.add(
        EMPLOYEE_TRANSFER_JOB_APPLY_DUE,
        {},
        {
          repeat: {
            pattern: EMPLOYEE_TRANSFER_APPLY_PATTERN,
            tz: 'Asia/Bangkok',
          },
          jobId: `repeat:${EMPLOYEE_TRANSFER_JOB_APPLY_DUE}`,
          attempts: 1,
          removeOnComplete: { count: 30 },
          removeOnFail: { count: 30 },
        },
      );
    } catch (error) {
      /*
       * ตั้งตารางไม่ได้ต้องไม่ทำให้เซิร์ฟเวอร์บูตไม่ขึ้น แต่ต้องเห็นใน log
       * เพราะแปลว่าใบที่ตั้งไว้จะไม่มีผลเองจนกว่าจะมีคนกด "ให้มีผลทันที"
       */
      this.logger.error(
        `ตั้งตารางทำใบโยกย้ายให้มีผลไม่สำเร็จ — ใบที่ตั้งไว้จะไม่มีผลเอง: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    /*
     * ไล่ใบที่ค้างทันทีตอนบูตด้วย
     *
     * ตารางวิ่งวันละครั้งตอนตีหนึ่งครึ่ง เซิร์ฟเวอร์ที่ดับข้ามคืนหรือเพิ่ง deploy
     * ตอนเช้าจะพลาดรอบของวันนั้นไปทั้งวัน — คนที่ควรอยู่สาขาใหม่ตั้งแต่เช้า
     * จะยังลงเวลาเข้าสาขาเดิมอยู่
     */
    try {
      await this.service.applyDueTransfers();
    } catch (error) {
      this.logger.error(
        `ไล่ใบโยกย้ายค้างตอนบูตไม่สำเร็จ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
