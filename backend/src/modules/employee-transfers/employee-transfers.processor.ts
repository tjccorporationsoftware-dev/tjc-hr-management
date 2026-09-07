import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { EMPLOYEE_TRANSFER_QUEUE } from './employee-transfer-queue.constants';
import { EmployeeTransfersService } from './employee-transfers.service';

/**
 * ทำให้ใบโยกย้ายที่ถึงวันแล้วมีผล
 *
 * งานนี้ต้องทนต่อการรันซ้ำ — ตัว service เช็คสถานะภายในทรานแซกชันอยู่แล้ว
 * ใบที่ถูกทำไปแล้วจะถูกข้ามเงียบ ๆ ไม่สร้างประวัติซ้ำ
 */
@Processor(EMPLOYEE_TRANSFER_QUEUE)
export class EmployeeTransfersProcessor extends WorkerHost {
  private readonly logger = new Logger(EmployeeTransfersProcessor.name);

  constructor(private readonly service: EmployeeTransfersService) {
    super();
  }

  async process(job: Job) {
    const result = await this.service.applyDueTransfers();

    if (result.failed.length) {
      /*
       * ต้องโยนออกไปให้คิวเห็นว่างานรอบนี้ไม่สมบูรณ์
       * ใบที่ล้มยังอยู่ในสถานะรอมีผล จึงถูกหยิบมาทำใหม่ในรอบถัดไปเอง
       */
      throw new Error(
        `ทำใบโยกย้ายไม่สำเร็จ ${result.failed.length} ใบ (${job.name})`,
      );
    }

    return result;
  }
}
