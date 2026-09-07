import type { PunchLocationPayload } from './punch.api';
import type { PunchType } from './punch.types';

/**
 * คิวลงเวลาที่ส่งไม่สำเร็จ
 *
 * ## ขอบเขตที่ตั้งใจจำกัดไว้
 *
 * คิวนี้ทำเพื่อ **กันเน็ตสะดุดตอนกดส่ง** ไม่ใช่เพื่อลงเวลาตอนออฟไลน์ยาว ๆ
 *
 * เหตุผล: `MobileAttendanceService` ตั้งใจไม่ส่ง `punchedAt` ขึ้นไป
 * เวลาที่บันทึกจริงจึงเป็น **เวลาที่เซิร์ฟเวอร์รับ** ไม่ใช่เวลาที่กดปุ่ม
 * ถ้าปล่อยให้รายการค้างในคิวข้ามชั่วโมงแล้วค่อยส่ง พนักงานที่กดตอน 08:00
 * จะถูกบันทึกเป็น 12:00 = สายสี่ชั่วโมงทั้งที่มาตรงเวลา ซึ่งแย่กว่าไม่มีคิวเลย
 * เพราะผู้ใช้เชื่อไปแล้วว่าลงเวลาสำเร็จ
 *
 * รายการที่ค้างเกิน {@link MAX_QUEUE_AGE_MS} จึงถูกตัดเป็น "หมดอายุ"
 * แล้วบอกให้ไปยื่นขอแก้เวลาแทน ซึ่งเป็นเส้นทางที่มีสายอนุมัติรองรับอยู่แล้ว
 *
 * ## ทำไมไม่ทำ offline punch เต็มรูปแบบ (ตัดสินใจแล้ว ไม่ต้องรื้อ)
 *
 * การยอมรับเวลาจากเครื่องเปิดช่องให้ปรับนาฬิกาแล้วลงเวลาย้อนหลัง และ
 * **ปิดช่องนี้ด้วยวิธีทางเทคนิคไม่ได้** — ปรับนาฬิกาย้อน เปิด airplane mode
 * กดลงเวลา ปรับนาฬิกากลับ แล้วค่อยซิงก์ ค่า drift ตอนซิงก์จะเป็นศูนย์
 * ดูปกติทุกอย่าง เหลือทางเดียวคือให้คนตรวจ ซึ่งก็คือสายอนุมัติของ
 * "ขอแก้เวลา" ที่มีอยู่แล้ว จึงไม่มีเหตุผลต้องสร้างกลไกใหม่มาซ้ำ
 *
 * flag `offlinePunch` จึงคงเป็น false และคนที่ขาดเน็ตนานกว่านี้
 * ให้ยื่นขอแก้เวลาแทน
 */

import * as Crypto from 'expo-crypto';

import { captureEvent } from '@/lib/monitoring/monitoring';
import { syncJobRepository, type SyncJob } from '@/lib/database/repositories/sync-job.repository';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

import { submitPunch } from './punch.api';

export const PUNCH_JOB_TYPE = 'attendance.punch';

/** เพดานคิวตามแผน — เกินกว่านี้แปลว่ามีอย่างอื่นผิดปกติ ไม่ใช่เน็ตสะดุด */
export const MAX_QUEUE_SIZE = 20;

/**
 * อายุสูงสุดของรายการในคิว
 *
 * 10 นาที — นานพอสำหรับเน็ตสะดุดหรือลิฟต์/ที่จอดรถใต้ดิน
 * แต่สั้นพอที่เวลาที่เซิร์ฟเวอร์บันทึกจะยังใกล้เคียงเวลาที่กดจริง
 */
export const MAX_QUEUE_AGE_MS = 10 * 60_000;

export interface QueuedPunchPayload {
  /** เวลาที่กดปุ่มตามนาฬิกาเครื่อง — ใช้ตัดสินว่าหมดอายุหรือยัง */
  capturedAt: string;
  location?: PunchLocationPayload;
  note?: string;
  punchType?: PunchType;
}

export type QueuedPunch = SyncJob<QueuedPunchPayload>;

export interface FlushResult {
  /** ส่งสำเร็จกี่รายการ */
  sent: number;
  /** ตัดทิ้งเพราะค้างนานเกินไปกี่รายการ */
  expired: number;
  /** ยังส่งไม่ได้ ค้างรอรอบถัดไปกี่รายการ */
  remaining: number;
}

function isExpired(payload: QueuedPunchPayload, now: number): boolean {
  const capturedAt = new Date(payload.capturedAt).getTime();

  /* เวลาที่อ่านไม่ออกถือว่าหมดอายุ ดีกว่าปล่อยค้างตลอดกาล */
  if (!Number.isFinite(capturedAt)) {
    return true;
  }

  return now - capturedAt > MAX_QUEUE_AGE_MS;
}

export const punchQueue = {
  /**
   * เข้าคิวหนึ่งรายการ
   *
   * idempotency key ถูกสร้าง **ตอนเข้าคิว** ไม่ใช่ตอนส่ง — นี่คือสิ่งเดียว
   * ที่ทำให้ยิงซ้ำแล้วไม่ได้เวลาเข้างานสองรายการ
   */
  async enqueue(payload: QueuedPunchPayload): Promise<void> {
    const pending = await punchQueue.list();

    if (pending.length >= MAX_QUEUE_SIZE) {
      throw new Error('คิวลงเวลาเต็ม กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่');
    }

    const id = Crypto.randomUUID();

    await syncJobRepository.enqueue<QueuedPunchPayload>({
      id,
      idempotencyKey: id,
      jobType: PUNCH_JOB_TYPE,
      payload,
    });
  },

  async list(): Promise<QueuedPunch[]> {
    const jobs = await syncJobRepository.list<QueuedPunchPayload>([
      'pending',
      'retry',
    ]);

    return jobs.filter((job) => job.jobType === PUNCH_JOB_TYPE);
  },

  async count(): Promise<number> {
    return (await punchQueue.list()).length;
  },

  /**
   * พยายามส่งทุกรายการในคิว
   *
   * ส่งทีละรายการตามลำดับที่เข้าคิว ไม่ส่งขนานกัน เพราะลำดับเข้า-ออกงาน
   * มีความหมาย และ backend ตัดสินรอบจากเวลาที่รับ
   */
  async flush(now: number = Date.now()): Promise<FlushResult> {
    const jobs = await punchQueue.list();
    const result: FlushResult = { expired: 0, remaining: 0, sent: 0 };

    if (jobs.length === 0) {
      return result;
    }

    const installationId = await getOrCreateInstallationId();

    for (const job of jobs) {
      if (isExpired(job.payload, now)) {
        await syncJobRepository.remove(job.id);
        result.expired += 1;

        captureEvent({
          context: { ageMs: now - new Date(job.payload.capturedAt).getTime() },
          level: 'warning',
          message: 'ตัดรายการลงเวลาที่ค้างในคิวนานเกินไป',
        });

        continue;
      }

      try {
        await submitPunch({
          idempotencyKey: job.idempotencyKey ?? job.id,
          installationId,
          location: job.payload.location,
          note: job.payload.note,
          punchType: job.payload.punchType,
        });

        await syncJobRepository.remove(job.id);
        result.sent += 1;
      } catch {
        /*
         * ส่งไม่ผ่านก็ปล่อยไว้ในคิว รอบหน้าค่อยลองใหม่
         * ไม่นับ attempt เพิ่มจนเกินเพราะตัวตัดสินจริงคืออายุของรายการ
         * ไม่ใช่จำนวนครั้งที่ลอง
         */
        await syncJobRepository.updateState({
          attemptCount: job.attemptCount + 1,
          id: job.id,
          status: 'retry',
        });

        result.remaining += 1;
      }
    }

    return result;
  },

  /** ผู้ใช้กดทิ้งเอง เช่นรู้ว่าลงเวลาซ้ำ */
  async remove(id: string): Promise<void> {
    await syncJobRepository.remove(id);
  },
};
