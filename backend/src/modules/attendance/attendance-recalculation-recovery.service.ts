import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { usesRedisQueue } from '../../common/queue/queue.module';
import { AttendanceSummaryQueueService } from './attendance-summary-queue.service';

/**
 * กวาดงานคำนวณเวลาที่ค้างอยู่ กลับเข้าคิวตอนบูต
 * ==========================================
 * คิวในโปรเซสเก็บงานไว้ในหน่วยความจำ งานที่ยังไม่ได้ทำจึงหายไปเมื่อรีสตาร์ต
 * ซึ่งจะเป็นปัญหาใหญ่ถ้าปล่อยไว้ — ยอดเวลาของวันนั้นค้างไม่อัปเดต
 * แล้วไหลไปถึงเงินเดือนโดยไม่มีใครรู้
 *
 * ทำได้เพราะสถานะจริงไม่ได้อยู่ในคิว แต่อยู่ใน PostgreSQL มาตลอด —
 * ทุกครั้งที่งานขยับ ระบบเขียนสถานะลง
 * `AttendanceDailySummary.policySnapshot.attendanceRecalculation.status`
 * แถวที่ค้างอยู่ที่ PENDING / PROCESSING / RETRYING คือของที่ยังทำไม่จบ
 *
 * PROCESSING ต้องกวาดด้วย ไม่ใช่ข้าม — สถานะนั้นแปลว่ากำลังทำอยู่ตอนที่โปรเซสดับ
 * ซึ่งแปลว่ามันทำไม่จบแน่นอน
 *
 * ตอนใช้ Redis ไม่ต้องทำอะไร เพราะ BullMQ เก็บงานไว้ในนั้นและหยิบมาทำต่อเอง
 */

/** สถานะที่ถือว่างานยังทำไม่จบ ตรงกับที่ AttendanceSummaryQueueService ใช้ */
const UNFINISHED_STATUSES = ['PENDING', 'PROCESSING', 'RETRYING'] as const;

/**
 * เพดานจำนวนงานที่กวาดกลับเข้าคิวในรอบเดียว
 * กันกรณีที่ค้างสะสมมานานจนบูตแล้วเครื่องจมอยู่กับงานเก่า
 * ที่เหลือจะถูกกวาดในการบูตครั้งถัดไป และยังเห็นใน log ว่าเหลืออีกเท่าไร
 */
const MAX_REQUEUE_PER_BOOT = 500;

@Injectable()
export class AttendanceRecalculationRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(
    AttendanceRecalculationRecoveryService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: AttendanceSummaryQueueService,
  ) {}

  async onApplicationBootstrap() {
    if (usesRedisQueue()) return;

    try {
      await this.requeueUnfinished();
    } catch (error) {
      /*
       * กวาดไม่สำเร็จต้องไม่ทำให้เซิร์ฟเวอร์บูตไม่ขึ้น ระบบยังให้บริการได้
       * แต่ต้องเห็นใน log ว่ามีงานค้างที่ยังไม่ถูกหยิบกลับมา
       */
      this.logger.error(
        `กวาดงานคำนวณเวลาที่ค้างกลับเข้าคิวไม่สำเร็จ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** แยกออกมาเพื่อให้เทสเรียกตรงได้ โดยไม่ต้องบูต Nest ทั้งตัว */
  async requeueUnfinished() {
    const pending = await this.findUnfinishedSummaries();

    if (!pending.length) {
      this.logger.log('ไม่มีงานคำนวณเวลาค้างจากรอบก่อน');
      return { requeued: 0, skipped: 0 };
    }

    const batch = pending.slice(0, MAX_REQUEUE_PER_BOOT);
    const skipped = pending.length - batch.length;
    let requeued = 0;

    for (const summary of batch) {
      const marker = this.readMarker(summary.policySnapshot);

      try {
        await this.queueService.enqueueDailySummaryRecalculation({
          employeeId: summary.employeeId,
          workDate: summary.workDate.toISOString().slice(0, 10),
          requestedById: marker.requestedById ?? 'system',
          sourceType: 'SYSTEM',
          sourceAction: 'STARTUP_RECOVERY',
        });
        requeued += 1;
      } catch (error) {
        this.logger.error(
          `กวาดงานของพนักงาน ${summary.employeeId} วันที่ ${summary.workDate
            .toISOString()
            .slice(0, 10)} ไม่สำเร็จ: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.warn(
      `กวาดงานคำนวณเวลาที่ค้างจากรอบก่อนกลับเข้าคิว ${requeued} รายการ` +
        (skipped > 0 ? ` (เหลืออีก ${skipped} รายการ รอบูตรอบถัดไป)` : ''),
    );

    return { requeued, skipped };
  }

  private async findUnfinishedSummaries() {
    /*
     * กรองด้วย JSON path ของ Postgres โดยตรง เร็วกว่าดึงทั้งตารางมากรองในแอป
     * ใช้ OR ทีละสถานะเพราะตัวกรอง JSON ของ Prisma ไม่รับ `in`
     */
    return this.prisma.attendanceDailySummary.findMany({
      where: {
        OR: UNFINISHED_STATUSES.map((status) => ({
          policySnapshot: {
            path: ['attendanceRecalculation', 'status'],
            equals: status,
          },
        })),
      },
      select: {
        id: true,
        employeeId: true,
        workDate: true,
        policySnapshot: true,
      },
      orderBy: { workDate: 'asc' },
    });
  }

  private readMarker(snapshot: unknown): { requestedById?: string } {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return {};
    }

    const marker = (snapshot as Record<string, unknown>)
      .attendanceRecalculation;

    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
      return {};
    }

    const requestedById = (marker as Record<string, unknown>).requestedById;

    return {
      requestedById:
        typeof requestedById === 'string' ? requestedById : undefined,
    };
  }
}
