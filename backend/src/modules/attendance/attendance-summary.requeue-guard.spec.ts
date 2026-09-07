import { AttendanceSummaryProcessor } from './attendance-summary.processor';

/**
 * งานคำนวณสรุปรายวันต้องคำนวณใหม่ ถ้าข้อมูลลงเวลาเปลี่ยนระหว่างที่กำลังคำนวณ
 *
 * เคสที่เจอจริง: บันทึกเวลาทั้งวันของพนักงาน 8 คนรวดเดียว (เข้า/บ่าย/ออก)
 * แล้วมี 1 คนติดค่าปรับ "ลืมสแกนออก" 50 บาทค้างไว้ ทั้งที่กรอกเวลาออกครบ
 * กดคำนวณใหม่ด้วยมือแล้วหาย แปลว่าผลที่ผิดมาจากการอ่านข้อมูลไม่ครบ
 *
 * ของเดิมตรวจโดยเทียบ `updatedAt ล่าสุด > เวลาที่เริ่มคำนวณ` ซึ่งพลาดสองกรณี:
 *   1. `@updatedAt` ถูก stamp ตอนรันคำสั่ง ไม่ใช่ตอน commit
 *      ธุรกรรมที่ stamp ก่อนงานเริ่ม แต่ commit ทีหลัง ถูกมองว่า "ไม่มีอะไรเปลี่ยน"
 *   2. กรองด้วย `deletedAt: null` การลบรายการจึงไม่ถูกนับว่าเปลี่ยนเลย
 *
 * ตอนนี้เทียบด้วย "ลายนิ้วมือ" (จำนวนแถวทั้งหมด · จำนวนแถวที่ยังไม่ถูกลบ · updatedAt สูงสุด)
 * จึงจับได้ทั้งเพิ่ม แก้ และลบ โดยไม่ต้องพึ่งการเทียบเวลาที่เชื่อไม่ได้
 */
describe('AttendanceSummaryProcessor · คำนวณใหม่เมื่อข้อมูลเปลี่ยนระหว่างคำนวณ', () => {
  const job = {
    id: 'job-1',
    data: {
      employeeId: 'emp-1',
      workDate: '2026-07-30',
      requestedById: 'user-1',
      sourceType: 'ATTENDANCE_LOG' as const,
      sourceId: 'log-1',
      sourceAction: 'MANUAL_LOG_CREATED',
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  };

  type RequeueFn = (
    job: unknown,
    fingerprintBefore: string | null,
  ) => Promise<void>;

  function buildProcessor(fingerprintAfter: string | Error) {
    const getAttendanceLogFingerprint = jest.fn(() =>
      fingerprintAfter instanceof Error
        ? Promise.reject(fingerprintAfter)
        : Promise.resolve(fingerprintAfter),
    );
    const enqueueDailySummaryRecalculation = jest.fn().mockResolvedValue(null);

    const processor = new (AttendanceSummaryProcessor as unknown as new (
      ...args: unknown[]
    ) => AttendanceSummaryProcessor)(
      { getAttendanceLogFingerprint },
      { enqueueDailySummaryRecalculation },
      { createLog: jest.fn().mockResolvedValue(null) },
    );

    return {
      enqueueDailySummaryRecalculation,
      requeue: (
        processor as unknown as { requeueIfDataChangedDuringRun: RequeueFn }
      ).requeueIfDataChangedDuringRun.bind(processor) as RequeueFn,
    };
  }

  /** 3 แถว ทั้งหมดยังไม่ถูกลบ แก้ล่าสุดที่ timestamp นี้ */
  const BEFORE = '3|3|1785340800000';

  it('ข้อมูลไม่เปลี่ยนเลย ไม่ต้องคำนวณซ้ำ', async () => {
    const { enqueueDailySummaryRecalculation, requeue } = buildProcessor(BEFORE);

    await requeue(job, BEFORE);

    expect(enqueueDailySummaryRecalculation).not.toHaveBeenCalled();
  });

  it('มีรายการลงเวลาเพิ่มเข้ามาระหว่างคำนวณ ต้องสั่งคำนวณใหม่', async () => {
    const { enqueueDailySummaryRecalculation, requeue } =
      buildProcessor('4|4|1785340900000');

    await requeue(job, BEFORE);

    expect(enqueueDailySummaryRecalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'emp-1',
        workDate: '2026-07-30',
        sourceAction: 'RECALCULATE_AFTER_CONCURRENT_WRITE',
      }),
    );
  });

  it('มีรายการถูกลบระหว่างคำนวณ ต้องสั่งคำนวณใหม่ — ของเดิมมองไม่เห็นเลย', async () => {
    // จำนวนแถวรวมเท่าเดิม แต่แถวที่ยังใช้งานลดลง = ถูกลบแบบ soft delete
    const { enqueueDailySummaryRecalculation, requeue } =
      buildProcessor('3|2|1785340950000');

    await requeue(job, BEFORE);

    expect(enqueueDailySummaryRecalculation).toHaveBeenCalled();
  });

  it('แถวเดิมถูกแก้เวลา จำนวนเท่าเดิม ต้องสั่งคำนวณใหม่', async () => {
    const { enqueueDailySummaryRecalculation, requeue } =
      buildProcessor('3|3|1785341000000');

    await requeue(job, BEFORE);

    expect(enqueueDailySummaryRecalculation).toHaveBeenCalled();
  });

  it('อ่านลายนิ้วมือตอนเริ่มไม่ได้ ข้ามการตรวจ ไม่เข้าคิวมั่ว', async () => {
    const { enqueueDailySummaryRecalculation, requeue } = buildProcessor(BEFORE);

    await requeue(job, null);

    expect(enqueueDailySummaryRecalculation).not.toHaveBeenCalled();
  });

  it('อ่านลายนิ้วมือรอบหลังไม่สำเร็จ ต้องไม่ทำให้งานที่คำนวณเสร็จแล้วล้ม', async () => {
    const { requeue } = buildProcessor(new Error('อ่านรายการลงเวลาไม่สำเร็จ'));

    await expect(requeue(job, BEFORE)).resolves.toBeUndefined();
  });

  it('เข้าคิวรอบใหม่ไม่สำเร็จ ต้องไม่ทำให้งานที่คำนวณเสร็จแล้วล้ม', async () => {
    const processor = new (AttendanceSummaryProcessor as unknown as new (
      ...args: unknown[]
    ) => AttendanceSummaryProcessor)(
      {
        getAttendanceLogFingerprint: jest
          .fn()
          .mockResolvedValue('9|9|1785349999999'),
      },
      {
        enqueueDailySummaryRecalculation: jest
          .fn()
          .mockRejectedValue(new Error('คิวล่ม')),
      },
      { createLog: jest.fn() },
    );

    const requeue = (
      processor as unknown as { requeueIfDataChangedDuringRun: RequeueFn }
    ).requeueIfDataChangedDuringRun.bind(processor) as RequeueFn;

    await expect(requeue(job, BEFORE)).resolves.toBeUndefined();
  });
});
