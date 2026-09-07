import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { spawn } from 'child_process';

import { AuditAction } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  MAINTENANCE_JOB_BACKUP,
  MAINTENANCE_JOB_CLEANUP_AUDIT,
  MAINTENANCE_JOB_CLEANUP_STORAGE,
  MAINTENANCE_QUEUE,
} from './maintenance-queue.constants';

/**
 * รันงานบำรุงรักษาตามตารางเวลา
 *
 * เรียกสคริปต์เดิมใน scripts/ แทนการเขียนตรรกะซ้ำ เพราะสคริปต์เหล่านั้น
 * ยังต้องสั่งด้วยมือได้อยู่ (เช่นกู้ข้อมูลฉุกเฉิน) การมีตรรกะสองชุดจะทำให้
 * สิ่งที่รันอัตโนมัติกับสิ่งที่คนสั่งเองต่างกันโดยไม่มีใครรู้
 *
 * แยกเป็นโปรเซสลูกเพื่อไม่ให้งานหนัก (pg_dump / ลบไฟล์เป็นหมื่น) ไปหน่วง
 * event loop ของเซิร์ฟเวอร์ที่รับคำขอผู้ใช้อยู่
 */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly auditService: AuditService) {
    super();
  }

  /** เพดานเวลาต่อหนึ่งงาน กัน pg_dump ที่ค้างไม่ให้กินคิวไปตลอด */
  private readonly timeoutMs = 30 * 60 * 1000;

  private readonly commands: Record<string, string[]> = {
    [MAINTENANCE_JOB_BACKUP]: ['run', 'backup'],
    [MAINTENANCE_JOB_CLEANUP_STORAGE]: ['run', 'cleanup:storage'],
    // สคริปต์ล้าง audit เป็น dry-run เป็นค่าเริ่มต้น ต้องสั่งให้ลบจริง
    [MAINTENANCE_JOB_CLEANUP_AUDIT]: ['run', 'cleanup:audit', '--', '--no-dry-run'],
  };

  async process(job: Job) {
    const command = this.commands[job.name];

    if (!command) {
      throw new Error(`ไม่รู้จักงานบำรุงรักษา: ${job.name}`);
    }

    const startedAt = Date.now();
    this.logger.log(`เริ่มงานบำรุงรักษา: ${job.name}`);

    try {
      const output = await this.runCommand(command);
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `งานบำรุงรักษาเสร็จ: ${job.name} (${Math.round(durationMs / 1000)} วินาที)`,
      );

      await this.writeAudit(job.name, 'MAINTENANCE_JOB_COMPLETED', {
        durationMs,
        // เก็บท้าย output ไว้พอให้ตรวจย้อนหลังได้ว่าลบ/สำรองอะไรไปบ้าง
        outputTail: output.slice(-2000),
      });

      return { job: job.name, durationMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      /*
       * ต้องเห็นชัดว่างานล้ม ไม่ใช่เงียบหาย
       * งานสำรองข้อมูลที่ล้มเงียบคือกรณีที่แย่ที่สุด — จะรู้ตัวอีกทีตอนต้องกู้
       */
      this.logger.error(`งานบำรุงรักษาล้มเหลว: ${job.name} — ${message}`);

      await this.writeAudit(job.name, 'MAINTENANCE_JOB_FAILED', {
        durationMs: Date.now() - startedAt,
        error: message,
      });

      throw error;
    }
  }

  private runCommand(args: string[]) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn('npm', args, {
        cwd: process.cwd(),
        env: process.env,
        // npm บน Windows เป็นไฟล์ .cmd จึงต้องผ่าน shell
        shell: process.platform === 'win32',
      });

      let output = '';

      child.stdout?.on('data', (chunk) => {
        output += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        output += String(chunk);
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`งานใช้เวลาเกิน ${this.timeoutMs / 60000} นาที จึงถูกยกเลิก`));
      }, this.timeoutMs);

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        if (code === 0) {
          resolve(output);
          return;
        }

        reject(new Error(`คำสั่งจบด้วยรหัส ${code}: ${output.slice(-1000)}`));
      });
    });
  }

  /** best-effort — บันทึกไม่ได้ก็ห้ามทำให้งานที่ทำสำเร็จแล้วกลายเป็นล้มเหลว */
  private async writeAudit(
    jobName: string,
    eventCode: string,
    result: Record<string, unknown>,
  ) {
    try {
      await this.auditService.createLog({
        action: AuditAction.UPDATE,
        entity: 'MaintenanceJob',
        entityId: jobName,
        description: eventCode,
        metadata: result as never,
      });
    } catch (error) {
      this.logger.warn(
        `บันทึก audit ของงานบำรุงรักษาไม่สำเร็จ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
