import {
  parseCronPattern,
  matchesCron,
  type CronFields,
} from './cron-pattern.util';

/**
 * คิวงานในโปรเซสเดียวกัน — ตัวแทน BullMQ สำหรับระบบที่ไม่มี Redis
 * ==========================================================
 * ระบบนี้รัน backend ตัวเดียว ซึ่งเป็นเงื่อนไขเดียวที่ทำให้คิวข้ามโปรเซส
 * อย่าง Redis จำเป็น พอมีตัวเดียว คิวในโปรเซสก็ทำงานได้เหมือนกันทุกประการ
 * และตัดชิ้นส่วนภายนอกออกจากระบบไปได้ทั้งก้อน
 *
 * ตั้งใจเลียนแบบ API ของ BullMQ เฉพาะส่วนที่โค้ดเดิมเรียกใช้จริง เพื่อให้
 * จุดที่เรียกใช้คิวทั้ง 14 จุดใน 9 ไฟล์ไม่ต้องแก้สักบรรทัด — ยิ่งแก้น้อย
 * ยิ่งพังยาก และตรรกะรวมงานซ้ำของ Attendance ที่ซับซ้อนก็ยังใช้ของเดิมได้
 *
 * ## สิ่งที่ต่างจาก BullMQ และต้องรู้
 *
 * - **งานที่ค้างอยู่หายเมื่อรีสตาร์ต** ตัวคิวไม่ได้เขียนงานลงดิสก์
 *   ระบบชดเชยด้วยการกวาดงานค้างจาก PostgreSQL ตอนบูต ซึ่งทำได้เพราะสถานะจริง
 *   ถูกบันทึกไว้ในฐานข้อมูลอยู่แล้ว (AttendanceDailySummary / ReportJob)
 *   ไม่ได้อยู่ใน Redis
 * - **ขยายเป็นหลาย instance ไม่ได้** ถ้าวันหนึ่งต้องรัน backend หลายตัว
 *   ต้องกลับไปใช้คิวข้ามโปรเซส
 * - ไม่มีสถานะ `prioritized` และ `waiting-children` เพราะระบบไม่ได้ใช้
 *   ลำดับความสำคัญและไม่ได้ใช้ flow แบบพ่อ-ลูก `getState()` จึงไม่คืนสองค่านี้
 */

export type JobState =
  | 'waiting'
  | 'delayed'
  | 'active'
  | 'completed'
  | 'failed';

export type BackoffOptions = {
  type?: 'exponential' | 'fixed';
  delay?: number;
};

export type KeepOptions = boolean | { age?: number; count?: number };

export type JobOptions = {
  /** ตั้งเองเพื่อกันงานซ้ำ — ถ้ามี id นี้อยู่แล้วจะไม่เพิ่มงานใหม่ */
  jobId?: string;
  /** หน่วงกี่มิลลิวินาทีก่อนเริ่มทำ */
  delay?: number;
  /** ลองทั้งหมดกี่ครั้ง (นับรวมครั้งแรก) */
  attempts?: number;
  backoff?: BackoffOptions;
  removeOnComplete?: KeepOptions;
  removeOnFail?: KeepOptions;
  repeat?: { pattern: string; tz?: string };
};

export interface JobLike<T = unknown> {
  id: string;
  name: string;
  data: T;
  opts: JobOptions;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string | null;
  progress: number;
  getState(): Promise<JobState>;
  updateData(data: T): Promise<void>;
  updateProgress(value: number): Promise<void>;
  remove(): Promise<void>;
}

type Processor<T> = (job: JobLike<T>) => Promise<unknown>;

class InProcessJob<T> implements JobLike<T> {
  state: JobState = 'waiting';
  attemptsMade = 0;
  timestamp = Date.now();
  processedOn: number | null = null;
  finishedOn: number | null = null;
  failedReason: string | null = null;
  progress = 0;

  /** เวลาที่พร้อมให้หยิบไปทำ ใช้ทั้งกับ delay ตอนสร้างและ backoff ตอนลองใหม่ */
  runAt: number;

  constructor(
    readonly id: string,
    readonly name: string,
    public data: T,
    readonly opts: JobOptions,
    private readonly queue: InProcessQueue<T>,
  ) {
    const delay = opts.delay ?? 0;
    this.runAt = Date.now() + delay;
    this.state = delay > 0 ? 'delayed' : 'waiting';
  }

  getState(): Promise<JobState> {
    return Promise.resolve(this.state);
  }

  updateData(data: T): Promise<void> {
    /*
     * BullMQ ยอมให้แก้ข้อมูลของงานที่ยังไม่ถูกหยิบไปทำ ซึ่งเป็นกลไกที่
     * Attendance ใช้รวมงานซ้ำ — แก้ payload ของงานเดิมแทนการเพิ่มงานใหม่
     */
    this.data = data;
    return Promise.resolve();
  }

  updateProgress(value: number): Promise<void> {
    this.progress = value;
    return Promise.resolve();
  }

  remove(): Promise<void> {
    this.queue.removeJob(this.id);
    return Promise.resolve();
  }
}

type Scheduler = {
  id: string;
  fields: CronFields;
  pattern: string;
  jobName: string;
  data: unknown;
  opts: JobOptions;
  /** นาทีที่ยิงไปแล้ว กันยิงซ้ำเมื่อ tick มากกว่าหนึ่งครั้งในนาทีเดียวกัน */
  lastFiredMinute: number | null;
};

export type InProcessQueueOptions<T> = {
  /** ทำพร้อมกันได้กี่งาน ค่าเริ่มต้น 1 ให้ตรงกับ worker ของ BullMQ ที่ระบบใช้อยู่ */
  concurrency?: number;
  /** ความถี่ในการตรวจงานที่ถึงเวลาและตารางเวลา */
  tickMs?: number;
  /** false = ไม่เดินนาฬิกาเอง ให้เทสสั่ง tick() เองได้ */
  autoStart?: boolean;
  onError?: (error: unknown, job: JobLike<T>) => void;
};

export class InProcessQueue<T = unknown> {
  private readonly jobs = new Map<string, InProcessJob<T>>();
  private readonly schedulers = new Map<string, Scheduler>();
  private processor: Processor<T> | null = null;
  private running = 0;
  private sequence = 0;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    readonly name: string,
    private readonly options: InProcessQueueOptions<T> = {},
  ) {
    if (this.options.autoStart !== false) this.start();
  }

  /* ------------------------------------------------------------------ */
  /* ฝั่งผู้สั่งงาน — ชื่อและพฤติกรรมตรงกับ BullMQ                          */
  /* ------------------------------------------------------------------ */

  async add(
    jobName: string,
    data: T,
    opts: JobOptions = {},
  ): Promise<JobLike<T>> {
    if (opts.repeat) {
      /*
       * BullMQ รับ repeat ผ่าน add() ได้ และระบบเดิมใช้ทางนี้ตั้งงานบำรุงรักษา
       * แปลงเป็นตารางเวลาแทนการสร้างงานทันที ไม่งั้นงานสำรองข้อมูลจะรันตอนบูต
       */
      const schedulerId = opts.jobId ?? `repeat:${jobName}`;

      await this.upsertJobScheduler(
        schedulerId,
        { pattern: opts.repeat.pattern },
        { name: jobName, data, opts },
      );

      return this.createSchedulerPlaceholder(jobName, data, schedulerId, opts);
    }

    const id = opts.jobId ?? `${this.name}:${++this.sequence}`;
    const existing = this.jobs.get(id);

    /*
     * id ซ้ำ = ไม่เพิ่มงานใหม่ คืนงานเดิมไป ตรงกับพฤติกรรมของ BullMQ
     * เป็นกลไกกันงานซ้ำที่ Attendance พึ่งอยู่ (หนึ่งคน-หนึ่งวัน = หนึ่งงาน)
     */
    if (existing) return Promise.resolve(existing);

    const job = new InProcessJob<T>(id, jobName, data, opts, this);
    this.jobs.set(id, job);
    queueMicrotask(() => this.drain());

    return Promise.resolve(job);
  }

  getJob(id: string): Promise<JobLike<T> | undefined> {
    return Promise.resolve(this.jobs.get(id));
  }

  /**
   * เลียนแบบลายเซ็นของ BullMQ — `getJobs(states, start, end, asc)`
   * ระบบใช้แค่กรองตามสถานะ ส่วน start/end/asc รับไว้ให้เรียกได้เหมือนเดิม
   */
  getJobs(
    states: JobState[] = [
      'waiting',
      'delayed',
      'active',
      'completed',
      'failed',
    ],
    start = 0,
    end = -1,
    asc = true,
  ): Promise<Array<JobLike<T>>> {
    const wanted = new Set(states);
    const found = [...this.jobs.values()]
      .filter((job) => wanted.has(job.state))
      .sort((a, b) =>
        asc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp,
      );

    const sliced =
      end === -1 ? found.slice(start) : found.slice(start, end + 1);

    return Promise.resolve(sliced);
  }

  /**
   * ตั้งตารางเวลาคงที่ เรียกซ้ำด้วย id เดิมจะทับของเก่า ไม่สะสมเป็นหลายตาราง
   * โยน error ถ้า pattern ผิด เพื่อให้ผู้เรียกดักแล้วเขียน log ได้เหมือนตอนใช้ Redis
   */
  async upsertJobScheduler(
    schedulerId: string,
    repeat: { pattern: string; tz?: string },
    template: { name: string; data?: T; opts?: JobOptions } = {
      name: schedulerId,
    },
  ): Promise<void> {
    const fields = parseCronPattern(repeat.pattern);

    this.schedulers.set(schedulerId, {
      id: schedulerId,
      fields,
      pattern: repeat.pattern,
      jobName: template.name,
      data: template.data ?? {},
      opts: template.opts ?? {},
      lastFiredMinute: null,
    });

    return Promise.resolve();
  }

  /* ------------------------------------------------------------------ */
  /* ฝั่งผู้ทำงาน                                                          */
  /* ------------------------------------------------------------------ */

  setProcessor(processor: Processor<T>) {
    this.processor = processor;
    this.drain();
  }

  /* ------------------------------------------------------------------ */
  /* วงจรทำงาน                                                            */
  /* ------------------------------------------------------------------ */

  start() {
    if (this.timer || this.closed) return;

    this.timer = setInterval(() => this.tick(), this.options.tickMs ?? 1000);
    /* ไม่ให้ timer นี้ยืดอายุโปรเซสตอนสั่งปิดระบบ */
    this.timer.unref?.();
  }

  /** ให้เทสเรียกเองแทนการรอนาฬิกาจริง */
  tick(now = new Date()) {
    this.runSchedulers(now);
    this.promoteDelayed(now.getTime());
    this.drain();
  }

  close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    return Promise.resolve();
  }

  removeJob(id: string) {
    this.jobs.delete(id);
  }

  /** ให้ผู้เรียกภายนอกดูสถานะได้ ใช้ตอนเขียนเทสและหน้าเฝ้าระวัง */
  countByState(): Record<JobState, number> {
    const counts: Record<JobState, number> = {
      waiting: 0,
      delayed: 0,
      active: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of this.jobs.values()) counts[job.state] += 1;

    return counts;
  }

  /**
   * งานตัวแทนของตารางเวลา — คืนให้ผู้เรียกถือไว้เฉย ๆ ไม่ถูกหยิบไปทำ
   * มีไว้เพราะ `add()` ต้องคืน job เสมอตามสัญญาเดิมของ BullMQ
   */
  private createSchedulerPlaceholder(
    jobName: string,
    data: T,
    schedulerId: string,
    opts: JobOptions,
  ) {
    const job = new InProcessJob<T>(schedulerId, jobName, data, opts, this);
    job.state = 'completed';
    job.finishedOn = Date.now();

    return job;
  }

  private runSchedulers(now: Date) {
    const minuteKey =
      now.getFullYear() * 100000000 +
      (now.getMonth() + 1) * 1000000 +
      now.getDate() * 10000 +
      now.getHours() * 100 +
      now.getMinutes();

    for (const scheduler of this.schedulers.values()) {
      if (scheduler.lastFiredMinute === minuteKey) continue;
      if (!matchesCron(scheduler.fields, now)) continue;

      scheduler.lastFiredMinute = minuteKey;

      /*
       * id ผูกกับนาทีที่ยิง ไม่ใช่ id คงที่ — ไม่งั้นรอบถัดไปจะชนกับงานรอบก่อน
       * ที่ยังค้างอยู่ใน Map แล้วถูกมองว่าเป็นงานซ้ำจนไม่ได้ทำ
       */
      const opts: JobOptions = { ...scheduler.opts };
      delete opts.repeat;
      delete opts.jobId;

      void this.add(scheduler.jobName, scheduler.data as T, {
        ...opts,
        jobId: `${scheduler.id}:${minuteKey}`,
        delay: 0,
      });
    }
  }

  private promoteDelayed(nowMs: number) {
    for (const job of this.jobs.values()) {
      if (job.state === 'delayed' && job.runAt <= nowMs) {
        job.state = 'waiting';
      }
    }
  }

  private drain() {
    if (!this.processor || this.closed) return;

    const concurrency = this.options.concurrency ?? 1;

    while (this.running < concurrency) {
      const job = this.nextReadyJob();
      if (!job) return;

      this.running += 1;
      void this.run(job);
    }
  }

  private nextReadyJob(): InProcessJob<T> | null {
    const now = Date.now();
    let candidate: InProcessJob<T> | null = null;

    for (const job of this.jobs.values()) {
      if (job.state === 'delayed' && job.runAt <= now) job.state = 'waiting';
      if (job.state !== 'waiting') continue;
      /* เข้าก่อนได้ทำก่อน */
      if (!candidate || job.timestamp < candidate.timestamp) candidate = job;
    }

    return candidate;
  }

  private async run(job: InProcessJob<T>) {
    job.state = 'active';
    job.processedOn = Date.now();

    try {
      await this.processor!(job);

      /*
       * นับจำนวนครั้ง **หลัง** ทำเสร็จ ไม่ใช่ก่อน — ต้องตรงกับ BullMQ เป๊ะ
       *
       * BullMQ เพิ่มค่านี้ตอนงานจบ (moveToCompleted / moveToFailed) ระหว่างที่
       * processor กำลังทำงานอยู่ ค่านี้จึงเป็น "จำนวนครั้งที่ทำไปแล้วก่อนหน้านี้"
       * และเป็น 0 ในรอบแรก
       *
       * ถ้านับก่อนทำ processor ของ Attendance จะคำนวณ
       * `finalAttempt = job.attemptsMade + 1 >= attempts` ผิดไปหนึ่งรอบ
       * แล้วปักธงว่าคำนวณล้มเหลวถาวรตั้งแต่รอบที่สองจากสาม — สรุปเวลาจะถูกตี
       * เป็น NEED_REVIEW และ calculationStatus = ERROR ทั้งที่ยังมีรอบให้ลองอีก
       */
      job.attemptsMade += 1;
      job.state = 'completed';
      job.finishedOn = Date.now();
      job.failedReason = null;
      this.applyRetention(job, job.opts.removeOnComplete, 'completed');
    } catch (error) {
      job.attemptsMade += 1;
      job.failedReason = error instanceof Error ? error.message : String(error);
      this.options.onError?.(error, job);

      const attempts = job.opts.attempts ?? 1;

      if (job.attemptsMade < attempts) {
        /*
         * สูตรถอยเวลาเดียวกับ BullMQ — `2^(n-1) * delay` โดย n คือรอบถัดไป
         * (bullmq/classes/backoffs.js) เพื่อให้จังหวะลองใหม่เท่ากันทั้งสองทาง
         */
        const base = job.opts.backoff?.delay ?? 0;
        const wait =
          job.opts.backoff?.type === 'exponential'
            ? Math.round(Math.pow(2, job.attemptsMade) * base)
            : base;

        job.state = 'delayed';
        job.runAt = Date.now() + wait;
      } else {
        job.state = 'failed';
        job.finishedOn = Date.now();
        this.applyRetention(job, job.opts.removeOnFail, 'failed');
      }
    } finally {
      this.running -= 1;
      queueMicrotask(() => this.drain());
    }
  }

  /**
   * เก็บกวาดงานที่จบแล้ว ตามกติกาเดียวกับ removeOnComplete / removeOnFail
   * ไม่ทำแล้ว Map จะโตไม่หยุดจนกินหน่วยความจำ เป็นข้อที่คิวเขียนเองพลาดกันบ่อย
   */
  private applyRetention(
    job: InProcessJob<T>,
    keep: KeepOptions | undefined,
    state: 'completed' | 'failed',
  ) {
    if (keep === true) {
      this.jobs.delete(job.id);
      return;
    }

    const rule = typeof keep === 'object' ? keep : undefined;
    const maxAge = rule?.age;
    const maxCount = rule?.count ?? 500;
    const now = Date.now();

    const finished = [...this.jobs.values()]
      .filter((item) => item.state === state)
      .sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));

    finished.forEach((item, index) => {
      const tooOld =
        maxAge !== undefined && now - (item.finishedOn ?? now) > maxAge * 1000;

      if (index >= maxCount || tooOld) this.jobs.delete(item.id);
    });
  }
}
