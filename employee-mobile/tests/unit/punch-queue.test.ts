import {
  MAX_QUEUE_AGE_MS,
  MAX_QUEUE_SIZE,
  punchQueue,
  type QueuedPunchPayload,
} from '@/features/attendance/punch-queue';

/**
 * คิวนี้อันตรายกว่าที่เห็น
 *
 * `MobileAttendanceService` ตั้งใจไม่ส่ง punchedAt ขึ้นไป เวลาที่บันทึกจริง
 * คือ **เวลาที่เซิร์ฟเวอร์รับ** ถ้าปล่อยรายการค้างข้ามชั่วโมงแล้วค่อยส่ง
 * คนที่กดตอน 08:00 จะถูกบันทึกเป็นเวลาที่ส่งสำเร็จ = สายทั้งที่มาตรงเวลา
 * กฎเรื่องอายุจึงเป็นสิ่งที่กันไม่ให้คิวนี้ทำข้อมูลเงินเดือนเพี้ยน
 */

const mockRepository = {
  enqueue: jest.fn(async (_input: unknown) => undefined),
  list: jest.fn(async (_statuses?: string[]) => [] as unknown[]),
  remove: jest.fn(async (_id: string) => undefined),
  updateState: jest.fn(async (_input: unknown) => undefined),
};

const mockSubmitPunch = jest.fn(async (_input: unknown) => ({}) as never);

jest.mock('@/lib/database/repositories/sync-job.repository', () => ({
  syncJobRepository: {
    enqueue: (input: unknown) => mockRepository.enqueue(input),
    list: (statuses?: string[]) => mockRepository.list(statuses),
    remove: (id: string) => mockRepository.remove(id),
    updateState: (input: unknown) => mockRepository.updateState(input),
  },
}));

jest.mock('@/features/attendance/punch.api', () => ({
  submitPunch: (input: unknown) => mockSubmitPunch(input),
}));

jest.mock('@/lib/storage/secure-storage', () => ({
  getOrCreateInstallationId: async () => 'install-1',
}));

/* jest-expo คืน undefined จาก randomUUID ต้อง mock ให้ได้ค่าจริงเหมือนบนเครื่อง */
let mockUuidCounter = 0;

jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${(mockUuidCounter += 1)}`,
}));

const NOW = new Date('2026-08-16T08:00:00.000Z').getTime();

const job = (id: string, capturedAt: string, extra: Partial<QueuedPunchPayload> = {}) => ({
  attemptCount: 0,
  createdAt: capturedAt,
  id,
  idempotencyKey: id,
  jobType: 'attendance.punch',
  lastErrorCode: null,
  lastErrorMessage: null,
  nextRetryAt: null,
  payload: { capturedAt, ...extra },
  status: 'pending',
  updatedAt: capturedAt,
});

describe('punchQueue.enqueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.list.mockResolvedValue([]);
  });

  it('เก็บรายการพร้อม idempotency key ตั้งแต่ตอนเข้าคิว', async () => {
    await punchQueue.enqueue({ capturedAt: new Date(NOW).toISOString() });

    const input = mockRepository.enqueue.mock.calls[0]?.[0] as {
      id: string;
      idempotencyKey: string;
    };

    /* key ต้องเท่ากับ id และต้องมีตั้งแต่ตอนนี้ ไม่ใช่ไปสร้างตอนส่ง */
    expect(input.idempotencyKey).toBe(input.id);
    expect(input.idempotencyKey).toBeTruthy();
  });

  it('คิวเต็มต้องปฏิเสธ ไม่ใช่เก็บไปเรื่อย ๆ', async () => {
    mockRepository.list.mockResolvedValue(
      Array.from({ length: MAX_QUEUE_SIZE }, (_, index) =>
        job(`j${index}`, new Date(NOW).toISOString()),
      ),
    );

    await expect(
      punchQueue.enqueue({ capturedAt: new Date(NOW).toISOString() }),
    ).rejects.toThrow('คิวลงเวลาเต็ม');
    expect(mockRepository.enqueue).not.toHaveBeenCalled();
  });
});

describe('punchQueue.flush', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('คิวว่างต้องไม่ยิงอะไรเลย', async () => {
    mockRepository.list.mockResolvedValue([]);

    const result = await punchQueue.flush(NOW);

    expect(result).toEqual({ expired: 0, remaining: 0, sent: 0 });
    expect(mockSubmitPunch).not.toHaveBeenCalled();
  });

  it('ส่งสำเร็จต้องเอาออกจากคิว', async () => {
    mockRepository.list.mockResolvedValue([
      job('j1', new Date(NOW - 60_000).toISOString()),
    ]);

    const result = await punchQueue.flush(NOW);

    expect(result.sent).toBe(1);
    expect(mockRepository.remove).toHaveBeenCalledWith('j1');
  });

  it('ต้องส่ง idempotency key เดิมที่เก็บไว้ ไม่ใช่สร้างใหม่', async () => {
    mockRepository.list.mockResolvedValue([
      job('j1', new Date(NOW - 60_000).toISOString()),
    ]);

    await punchQueue.flush(NOW);

    expect(mockSubmitPunch.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: 'j1',
    });
  });

  /*
   * หัวใจของไฟล์นี้ — รายการที่ค้างนานเกินต้องถูกตัดทิ้ง ไม่ใช่ส่งไป
   * ส่งไปแล้วจะได้เวลาที่ผิดซึ่งกระทบเงินเดือนโดยตรง
   */
  it('รายการที่ค้างเกินเพดานอายุต้องถูกตัดทิ้ง ห้ามส่ง', async () => {
    mockRepository.list.mockResolvedValue([
      job('old', new Date(NOW - MAX_QUEUE_AGE_MS - 1000).toISOString()),
    ]);

    const result = await punchQueue.flush(NOW);

    expect(result.expired).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockSubmitPunch).not.toHaveBeenCalled();
    expect(mockRepository.remove).toHaveBeenCalledWith('old');
  });

  it('รายการที่ยังไม่ถึงเพดานอายุต้องส่งตามปกติ', async () => {
    mockRepository.list.mockResolvedValue([
      job('fresh', new Date(NOW - MAX_QUEUE_AGE_MS + 5000).toISOString()),
    ]);

    const result = await punchQueue.flush(NOW);

    expect(result.sent).toBe(1);
  });

  it('เวลาที่อ่านไม่ออกต้องถือว่าหมดอายุ ไม่ใช่ค้างในคิวตลอดกาล', async () => {
    mockRepository.list.mockResolvedValue([job('bad', 'ไม่ใช่เวลา')]);

    const result = await punchQueue.flush(NOW);

    expect(result.expired).toBe(1);
    expect(mockSubmitPunch).not.toHaveBeenCalled();
  });

  it('ส่งไม่ผ่านต้องคาไว้ในคิวและนับจำนวนครั้งที่ลอง', async () => {
    mockRepository.list.mockResolvedValue([
      job('j1', new Date(NOW - 30_000).toISOString()),
    ]);
    mockSubmitPunch.mockRejectedValueOnce(new Error('network down'));

    const result = await punchQueue.flush(NOW);

    expect(result.remaining).toBe(1);
    expect(mockRepository.remove).not.toHaveBeenCalled();
    expect(mockRepository.updateState).toHaveBeenCalledWith(
      expect.objectContaining({ attemptCount: 1, id: 'j1', status: 'retry' }),
    );
  });

  /* หนึ่งรายการพังต้องไม่ทำให้รายการที่เหลือไม่ได้ส่ง */
  it('รายการแรกล้มเหลว รายการถัดไปต้องยังถูกส่ง', async () => {
    mockRepository.list.mockResolvedValue([
      job('j1', new Date(NOW - 30_000).toISOString()),
      job('j2', new Date(NOW - 20_000).toISOString()),
    ]);
    mockSubmitPunch.mockRejectedValueOnce(new Error('network down'));

    const result = await punchQueue.flush(NOW);

    expect(result).toMatchObject({ remaining: 1, sent: 1 });
  });
});
