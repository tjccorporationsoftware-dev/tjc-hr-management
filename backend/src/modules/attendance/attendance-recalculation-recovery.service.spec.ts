import { AttendanceRecalculationRecoveryService } from './attendance-recalculation-recovery.service';

/**
 * เทสการกวาดงานค้างตอนบูต
 * ====================
 * นี่คือกลไกที่ชดเชยข้อเสียใหญ่ที่สุดของคิวในโปรเซส — งานหายเมื่อรีสตาร์ต
 * ถ้าตัวนี้พัง อาการคือยอดเวลาของบางวันค้างไม่อัปเดตแล้วไหลไปถึงเงินเดือน
 * โดยไม่มีอะไรผิดพลาดให้เห็น จึงต้องมีเทสคุมทุกเส้นทาง
 */

const summary = (
  employeeId: string,
  workDate: string,
  status: string,
  requestedById?: string,
) => ({
  id: `${employeeId}-${workDate}`,
  employeeId,
  workDate: new Date(`${workDate}T00:00:00.000Z`),
  policySnapshot: {
    attendanceRecalculation: {
      status,
      ...(requestedById ? { requestedById } : {}),
    },
  },
});

function makeService(rows: ReturnType<typeof summary>[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const enqueue = jest.fn().mockResolvedValue(undefined);

  const service = new AttendanceRecalculationRecoveryService(
    { attendanceDailySummary: { findMany } } as never,
    { enqueueDailySummaryRecalculation: enqueue } as never,
  );

  return { service, findMany, enqueue };
}

describe('AttendanceRecalculationRecoveryService', () => {
  it('กวาดงานที่ค้างกลับเข้าคิวครบทุกรายการ', async () => {
    const { service, enqueue } = makeService([
      summary('พนักงาน-1', '2026-08-17', 'PENDING', 'ผู้ใช้-1'),
      summary('พนักงาน-2', '2026-08-18', 'RETRYING', 'ผู้ใช้-2'),
    ]);

    const result = await service.requeueUnfinished();

    expect(result).toEqual({ requeued: 2, skipped: 0 });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenNthCalledWith(1, {
      employeeId: 'พนักงาน-1',
      workDate: '2026-08-17',
      requestedById: 'ผู้ใช้-1',
      sourceType: 'SYSTEM',
      sourceAction: 'STARTUP_RECOVERY',
    });
  });

  it('กวาดสถานะ PROCESSING ด้วย เพราะแปลว่าโปรเซสดับกลางคัน', async () => {
    /*
     * ข้อนี้สำคัญที่สุด — PROCESSING แปลว่ากำลังทำอยู่ตอนที่โปรเซสดับ
     * ซึ่งแปลว่ามันทำไม่จบแน่นอน ถ้าข้ามไปงานนั้นจะค้างตลอดกาล
     */
    const { service, findMany, enqueue } = makeService([
      summary('พนักงาน-1', '2026-08-17', 'PROCESSING'),
    ]);

    await service.requeueUnfinished();

    const statuses = findMany.mock.calls[0][0].where.OR.map(
      (clause: { policySnapshot: { equals: string } }) =>
        clause.policySnapshot.equals,
    );

    expect(statuses).toEqual(['PENDING', 'PROCESSING', 'RETRYING']);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('ไม่มีงานค้าง = ไม่เรียกคิวเลย', async () => {
    const { service, enqueue } = makeService([]);

    const result = await service.requeueUnfinished();

    expect(result).toEqual({ requeued: 0, skipped: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('ไม่มีผู้สั่งในบันทึก ใช้ system แทน ไม่ใช่ปล่อยว่าง', async () => {
    const { service, enqueue } = makeService([
      summary('พนักงาน-1', '2026-08-17', 'PENDING'),
    ]);

    await service.requeueUnfinished();

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ requestedById: 'system' }),
    );
  });

  it('บันทึกที่โครงข้อมูลเพี้ยน ยังกวาดได้ ไม่ล้มทั้งชุด', async () => {
    const broken = {
      id: 'x',
      employeeId: 'พนักงาน-9',
      workDate: new Date('2026-08-17T00:00:00.000Z'),
      policySnapshot: null,
    };

    const { service, enqueue } = makeService([broken as never]);

    const result = await service.requeueUnfinished();

    expect(result.requeued).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ requestedById: 'system' }),
    );
  });

  it('งานหนึ่งรายการล้ม ไม่ทำให้รายการที่เหลือหยุดตาม', async () => {
    const { service, enqueue } = makeService([
      summary('พนักงาน-1', '2026-08-17', 'PENDING'),
      summary('พนักงาน-2', '2026-08-17', 'PENDING'),
      summary('พนักงาน-3', '2026-08-17', 'PENDING'),
    ]);

    enqueue.mockRejectedValueOnce(new Error('คิวไม่ว่าง'));

    const result = await service.requeueUnfinished();

    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(result.requeued).toBe(2);
  });

  it('ค้างเกินเพดานต่อรอบ = ทำเท่าเพดาน แล้วรายงานส่วนที่เหลือ', async () => {
    const rows = Array.from({ length: 520 }, (_, index) =>
      summary(`พนักงาน-${index}`, '2026-08-17', 'PENDING'),
    );
    const { service, enqueue } = makeService(rows);

    const result = await service.requeueUnfinished();

    expect(result).toEqual({ requeued: 500, skipped: 20 });
    expect(enqueue).toHaveBeenCalledTimes(500);
  });
});

describe('AttendanceRecalculationRecoveryService — ตอนใช้ Redis', () => {
  const original = process.env.QUEUE_DRIVER;

  afterEach(() => {
    if (original === undefined) delete process.env.QUEUE_DRIVER;
    else process.env.QUEUE_DRIVER = original;
  });

  it('ไม่กวาดอะไรเลย เพราะ BullMQ เก็บงานไว้ใน Redis และทำต่อเอง', async () => {
    process.env.QUEUE_DRIVER = 'redis';

    const { service, findMany } = makeService([
      summary('พนักงาน-1', '2026-08-17', 'PENDING'),
    ]);

    await service.onApplicationBootstrap();

    expect(findMany).not.toHaveBeenCalled();
  });
});
