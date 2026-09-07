import { InProcessQueue, type JobLike } from './in-process-queue';

/**
 * เทสของคิวในโปรเซส
 * ================
 * คิวตัวนี้แทนที่ BullMQ ในเส้นทางที่กระทบเงินเดือน (คำนวณเวลาใหม่)
 * ทุกพฤติกรรมที่โค้ดเดิมพึ่งอยู่จึงต้องมีเทสคุม ไม่ใช่เชื่อว่าเขียนถูก
 *
 * ตั้ง `autoStart: false` แล้วสั่ง `tick()` เองทุกที่ เพื่อไม่ให้เทสขึ้นกับนาฬิกาจริง
 * ยกเว้นเทสที่ตั้งใจวัดการหน่วงเวลา ซึ่งใช้ค่าหน่วงสั้น ๆ
 */

/** ปล่อยให้ microtask ที่ค้างอยู่ทำงานจนหมดก่อนตรวจผล */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const waitFor = async (check: () => boolean, timeoutMs = 1000) => {
  const started = Date.now();

  while (!check()) {
    if (Date.now() - started > timeoutMs)
      throw new Error('รอเงื่อนไขไม่สำเร็จ');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

type Payload = { value: string };

function makeQueue(overrides = {}) {
  return new InProcessQueue<Payload>('test', {
    autoStart: false,
    ...overrides,
  });
}

/**
 * คิวที่เดินนาฬิกาเอง — ใช้กับเทสที่ต้องรอ delay หรือ backoff
 * งานที่ถูกหน่วงไว้ต้องมีตัวปลุก ไม่งั้นค้างตลอดกาล ซึ่งเป็นพฤติกรรมที่ถูกแล้ว
 */
function makeTickingQueue() {
  return new InProcessQueue<Payload>('test', { tickMs: 5 });
}

describe('InProcessQueue — ทำงานพื้นฐาน', () => {
  it('งานที่เพิ่มเข้าไปถูกหยิบไปทำ และจบเป็น completed', async () => {
    const queue = makeQueue();
    const seen: string[] = [];

    queue.setProcessor((job) => {
      seen.push(job.data.value);
      return Promise.resolve();
    });

    const job = await queue.add('demo', { value: 'ก' });
    await flush();

    expect(seen).toEqual(['ก']);
    expect(await job.getState()).toBe('completed');
    expect(job.attemptsMade).toBe(1);
    expect(job.finishedOn).not.toBeNull();
  });

  it('ทำเรียงตามลำดับที่เข้ามา', async () => {
    const queue = makeQueue();
    const seen: string[] = [];

    queue.setProcessor((job) => {
      seen.push(job.data.value);
      return Promise.resolve();
    });

    await queue.add('demo', { value: 'หนึ่ง' });
    await queue.add('demo', { value: 'สอง' });
    await queue.add('demo', { value: 'สาม' });
    await waitFor(() => seen.length === 3);

    expect(seen).toEqual(['หนึ่ง', 'สอง', 'สาม']);
  });

  it('ทำทีละงานเท่านั้นเมื่อ concurrency เป็น 1', async () => {
    const queue = makeQueue();
    let active = 0;
    let maxActive = 0;

    queue.setProcessor(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    });

    await queue.add('demo', { value: 'ก' });
    await queue.add('demo', { value: 'ข' });
    await queue.add('demo', { value: 'ค' });
    await waitFor(() => queue.countByState().completed === 3);

    expect(maxActive).toBe(1);
  });
});

describe('InProcessQueue — กันงานซ้ำด้วย jobId', () => {
  /*
   * Attendance พึ่งข้อนี้ทั้งหมด — หนึ่งคนหนึ่งวันต้องมีงานเดียว
   * ถ้าพัง จะได้งานคำนวณซ้อนกันหลายตัวต่อคนต่อวัน
   */
  it('เพิ่มด้วย jobId เดิม = ไม่เกิดงานใหม่ คืนงานเดิม', async () => {
    const queue = makeQueue();
    let processed = 0;

    queue.setProcessor(async () => {
      processed += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const first = await queue.add(
      'demo',
      { value: 'ก' },
      { jobId: 'คนที่1:วันที่1' },
    );
    const second = await queue.add(
      'demo',
      { value: 'ข' },
      { jobId: 'คนที่1:วันที่1' },
    );

    expect(second.id).toBe(first.id);
    expect(second).toBe(first);

    await waitFor(() => queue.countByState().completed === 1);
    expect(processed).toBe(1);
  });

  it('updateData เปลี่ยนข้อมูลของงานที่ยังไม่ถูกหยิบไปทำ', async () => {
    const queue = makeTickingQueue();
    const seen: string[] = [];

    queue.setProcessor((job) => {
      seen.push(job.data.value);
      return Promise.resolve();
    });

    const job = await queue.add(
      'demo',
      { value: 'เก่า' },
      { jobId: 'คงที่', delay: 30 },
    );
    await job.updateData({ value: 'ใหม่' });

    await waitFor(() => seen.length === 1);
    expect(seen).toEqual(['ใหม่']);
  });

  it('remove เอางานออกจากคิวได้จริง', async () => {
    const queue = makeQueue();
    const seen: string[] = [];

    queue.setProcessor((job) => {
      seen.push(job.data.value);
      return Promise.resolve();
    });

    const job = await queue.add(
      'demo',
      { value: 'ก' },
      { jobId: 'ลบทิ้ง', delay: 30 },
    );
    await job.remove();

    expect(await queue.getJob('ลบทิ้ง')).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 60));
    queue.tick();
    await flush();

    expect(seen).toEqual([]);
  });
});

describe('InProcessQueue — หน่วงเวลาและลองใหม่', () => {
  it('งานที่มี delay ยังไม่ถูกทำทันที', async () => {
    const queue = makeTickingQueue();
    let processed = 0;

    queue.setProcessor(() => {
      processed += 1;
      return Promise.resolve();
    });

    const job = await queue.add('demo', { value: 'ก' }, { delay: 40 });
    await flush();

    expect(await job.getState()).toBe('delayed');
    expect(processed).toBe(0);

    await waitFor(() => processed === 1);
  });

  it('งานที่ล้มถูกลองใหม่จนครบ attempts แล้วค่อยเป็น failed', async () => {
    const queue = makeTickingQueue();
    let calls = 0;

    queue.setProcessor(() => {
      calls += 1;
      throw new Error('พังตลอด');
      return Promise.resolve();
    });

    const job = await queue.add(
      'demo',
      { value: 'ก' },
      { attempts: 3, backoff: { type: 'exponential', delay: 5 } },
    );

    await waitFor(() => calls === 3, 2000);
    await waitFor(() => job.attemptsMade === 3);

    expect(await job.getState()).toBe('failed');
    expect(job.failedReason).toBe('พังตลอด');
  });

  it('งานที่ล้มครั้งแรกแล้วสำเร็จรอบสอง จบเป็น completed', async () => {
    const queue = makeTickingQueue();
    let calls = 0;

    queue.setProcessor(() => {
      calls += 1;
      if (calls === 1) throw new Error('พังรอบแรก');
      return Promise.resolve();
    });

    const job = await queue.add(
      'demo',
      { value: 'ก' },
      { attempts: 2, backoff: { type: 'exponential', delay: 5 } },
    );

    await waitFor(() => calls === 2, 2000);

    expect(await job.getState()).toBe('completed');
    expect(job.failedReason).toBeNull();
  });

  /*
   * ข้อนี้คุมบั๊กที่เคยพลาดจริง — ถ้านับจำนวนครั้ง "ก่อน" ทำแทนที่จะเป็น "หลัง"
   * processor ของ Attendance จะคำนวณ finalAttempt ผิดไปหนึ่งรอบ แล้วปักธงว่า
   * คำนวณล้มเหลวถาวรตั้งแต่รอบที่สองจากสาม ทั้งที่ยังมีรอบให้ลองอีก
   * ผลคือสรุปเวลาถูกตีเป็น NEED_REVIEW และ calculationStatus = ERROR โดยไม่จำเป็น
   */
  it('attemptsMade ระหว่างทำงานคือจำนวนครั้งก่อนหน้า ตรงกับ BullMQ', async () => {
    const queue = makeTickingQueue();
    const seenDuringRun: number[] = [];

    queue.setProcessor((job) => {
      seenDuringRun.push(job.attemptsMade);

      return Promise.reject(new Error('พังตลอด'));
    });

    const job = await queue.add(
      'demo',
      { value: 'ก' },
      { attempts: 3, backoff: { type: 'exponential', delay: 1 } },
    );

    await waitFor(() => seenDuringRun.length === 3, 2000);

    /* รอบแรกต้องเห็น 0 ไม่ใช่ 1 */
    expect(seenDuringRun).toEqual([0, 1, 2]);
    expect(job.attemptsMade).toBe(3);
    expect(await job.getState()).toBe('failed');
  });

  it('งานที่สำเร็จรอบแรกมี attemptsMade เป็น 1 หลังจบ', async () => {
    const queue = makeQueue();
    let duringRun = -1;

    queue.setProcessor((job) => {
      duringRun = job.attemptsMade;

      return Promise.resolve();
    });

    const job = await queue.add('demo', { value: 'ก' });
    await waitFor(() => job.attemptsMade === 1);

    expect(duringRun).toBe(0);
    expect(job.attemptsMade).toBe(1);
  });

  it('ไม่ตั้ง attempts = ลองครั้งเดียวแล้วจบ', async () => {
    const queue = makeQueue();
    let calls = 0;

    queue.setProcessor(() => {
      calls += 1;
      throw new Error('พัง');
      return Promise.resolve();
    });

    const job = await queue.add('demo', { value: 'ก' });
    await waitFor(() => job.attemptsMade === 1);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(calls).toBe(1);
    expect(await job.getState()).toBe('failed');
  });
});

describe('InProcessQueue — เก็บกวาดงานที่จบแล้ว', () => {
  it('removeOnComplete: true เอางานออกทันทีที่สำเร็จ', async () => {
    const queue = makeQueue();
    queue.setProcessor(() => Promise.resolve());

    await queue.add(
      'demo',
      { value: 'ก' },
      { jobId: 'หายไป', removeOnComplete: true },
    );
    await waitFor(() => queue.countByState().completed === 0);

    expect(await queue.getJob('หายไป')).toBeUndefined();
  });

  it('removeOnComplete แบบจำกัดจำนวน เก็บไว้เท่าที่กำหนด', async () => {
    const queue = makeQueue();
    queue.setProcessor(() => Promise.resolve());

    for (let index = 0; index < 5; index += 1) {
      await queue.add(
        'demo',
        { value: String(index) },
        { jobId: `งาน-${index}`, removeOnComplete: { count: 2 } },
      );
    }

    await waitFor(() => queue.countByState().completed === 2, 2000);
    expect(queue.countByState().completed).toBe(2);
  });

  it('งานที่ยังไม่จบไม่ถูกเก็บกวาดไปด้วย', async () => {
    const queue = makeQueue();
    queue.setProcessor(() => Promise.resolve());

    await queue.add(
      'demo',
      { value: 'ทำแล้ว' },
      { jobId: 'จบ', removeOnComplete: { count: 1 } },
    );
    await queue.add(
      'demo',
      { value: 'รออยู่' },
      { jobId: 'ยังไม่จบ', delay: 5000 },
    );

    await waitFor(() => queue.countByState().completed === 1);

    expect(await queue.getJob('ยังไม่จบ')).toBeDefined();
  });
});

describe('InProcessQueue — ค้นงานตามสถานะ', () => {
  it('getJobs กรองตามสถานะที่ขอ', async () => {
    const queue = makeQueue();

    /* ยังไม่ตั้ง processor งานจึงค้างอยู่ที่ waiting/delayed */
    await queue.add('demo', { value: 'รอ' }, { jobId: 'ก' });
    await queue.add('demo', { value: 'หน่วง' }, { jobId: 'ข', delay: 5000 });

    const waiting = await queue.getJobs(['waiting']);
    const delayed = await queue.getJobs(['delayed']);
    const both = await queue.getJobs(['waiting', 'delayed']);

    expect(waiting.map((job) => job.id)).toEqual(['ก']);
    expect(delayed.map((job) => job.id)).toEqual(['ข']);
    expect(both).toHaveLength(2);
  });
});

describe('InProcessQueue — ตารางเวลา', () => {
  const at = (text: string) => new Date(text);

  it('ยิงงานเมื่อถึงเวลาตาม pattern', async () => {
    const queue = makeQueue();
    const fired: string[] = [];

    queue.setProcessor((job: JobLike<Payload>) => {
      fired.push(job.name);
      return Promise.resolve();
    });

    await queue.upsertJobScheduler(
      'สำรองข้อมูล',
      { pattern: '0 2 * * *' },
      { name: 'backup' },
    );

    queue.tick(at('2026-08-18T01:59:00'));
    await flush();
    expect(fired).toEqual([]);

    queue.tick(at('2026-08-18T02:00:00'));
    await waitFor(() => fired.length === 1);
    expect(fired).toEqual(['backup']);
  });

  it('tick ซ้ำในนาทีเดียวกันไม่ยิงซ้ำ', async () => {
    const queue = makeQueue();
    const fired: string[] = [];

    queue.setProcessor((job) => {
      fired.push(job.name);
      return Promise.resolve();
    });

    await queue.upsertJobScheduler(
      'ทุกนาที',
      { pattern: '* * * * *' },
      { name: 'ping' },
    );

    queue.tick(at('2026-08-18T02:00:00'));
    queue.tick(at('2026-08-18T02:00:30'));
    queue.tick(at('2026-08-18T02:00:59'));
    await waitFor(() => fired.length === 1);
    await flush();

    expect(fired).toHaveLength(1);
  });

  it('นาทีถัดไปยิงใหม่ได้ ไม่ติดว่าเป็นงานซ้ำ', async () => {
    const queue = makeQueue();
    const fired: string[] = [];

    queue.setProcessor((job) => {
      fired.push(job.name);
      return Promise.resolve();
    });

    await queue.upsertJobScheduler(
      'ทุกนาที',
      { pattern: '* * * * *' },
      { name: 'ping' },
    );

    queue.tick(at('2026-08-18T02:00:00'));
    await waitFor(() => fired.length === 1);

    queue.tick(at('2026-08-18T02:01:00'));
    await waitFor(() => fired.length === 2);

    expect(fired).toEqual(['ping', 'ping']);
  });

  it('ตั้งตารางซ้ำด้วย id เดิมทับของเก่า ไม่สะสมเป็นสองตาราง', async () => {
    const queue = makeQueue();
    const fired: string[] = [];

    queue.setProcessor((job) => {
      fired.push(job.name);
      return Promise.resolve();
    });

    await queue.upsertJobScheduler(
      'ตัวเดียว',
      { pattern: '0 2 * * *' },
      { name: 'เก่า' },
    );
    await queue.upsertJobScheduler(
      'ตัวเดียว',
      { pattern: '0 2 * * *' },
      { name: 'ใหม่' },
    );

    queue.tick(at('2026-08-18T02:00:00'));
    await waitFor(() => fired.length === 1);
    await flush();

    expect(fired).toEqual(['ใหม่']);
  });

  it('pattern ผิดโยน error ให้ผู้เรียกดัก ไม่กลืนเงียบ', async () => {
    const queue = makeQueue();

    await expect(
      queue.upsertJobScheduler(
        'พัง',
        { pattern: 'ไม่ใช่ cron' },
        { name: 'x' },
      ),
    ).rejects.toThrow();
  });

  it('add ที่มี repeat กลายเป็นตารางเวลา ไม่ใช่งานที่รันทันที', async () => {
    const queue = makeQueue();
    const fired: string[] = [];

    queue.setProcessor((job) => {
      fired.push(job.name);
      return Promise.resolve();
    });

    await queue.add(
      'backup',
      { value: '' },
      { repeat: { pattern: '0 2 * * *' }, jobId: 'repeat:backup' },
    );

    await flush();
    expect(fired).toEqual([]);

    queue.tick(at('2026-08-18T02:00:00'));
    await waitFor(() => fired.length === 1);
    expect(fired).toEqual(['backup']);
  });
});

describe('InProcessQueue — ปิดระบบ', () => {
  it('ปิดแล้วไม่หยิบงานใหม่ไปทำต่อ', async () => {
    const queue = makeQueue();
    let processed = 0;

    queue.setProcessor(() => {
      processed += 1;
      return Promise.resolve();
    });

    await queue.close();
    await queue.add('demo', { value: 'ก' });
    await flush();
    queue.tick();
    await flush();

    expect(processed).toBe(0);
  });
});
