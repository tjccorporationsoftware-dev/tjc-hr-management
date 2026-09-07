import {
  Global,
  Logger,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';

import {
  InProcessQueue,
  type InProcessQueueOptions,
  type JobLike,
} from './in-process-queue';

/**
 * เลือกว่าจะใช้คิวตัวไหน — Redis หรือคิวในโปรเซส
 * ==========================================
 * ตั้งที่ `QUEUE_DRIVER`
 *   memory  (ค่าเริ่มต้น) คิวในโปรเซส ไม่ต้องมี Redis
 *   redis                 BullMQ + Redis แบบเดิม
 *
 * มีสวิตช์เพราะการย้ายคิวแตะเส้นทางที่กระทบเงินเดือน ถ้าเจอปัญหาบนเครื่องจริง
 * ต้องกลับไปทางเดิมได้ทันทีด้วยการแก้ค่าเดียวแล้วรีสตาร์ต ไม่ต้องแก้โค้ดหรือ deploy ใหม่
 *
 * ตัวคิวในโปรเซสถูกลงทะเบียนด้วย token เดียวกับที่ `@InjectQueue()` ของ
 * @nestjs/bullmq ใช้ ทุกจุดที่เรียกใช้คิวจึงไม่ต้องรู้เลยว่ากำลังคุยกับตัวไหน
 */

export type QueueDriver = 'memory' | 'redis';

export function resolveQueueDriver(
  env: NodeJS.ProcessEnv = process.env,
): QueueDriver {
  return env.QUEUE_DRIVER === 'redis' ? 'redis' : 'memory';
}

export const usesRedisQueue = (env?: NodeJS.ProcessEnv) =>
  resolveQueueDriver(env) === 'redis';

/**
 * ค่าตั้งต้นของ BullMQ ตอนใช้ Redis
 * ยกมาจาก app.module.ts เดิมทั้งชุด ไม่เปลี่ยนพฤติกรรมของทางเดิม
 */
export function buildBullRootOptions() {
  return {
    connection: {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      db: Number(process.env.REDIS_DB ?? 0),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: {
        age: 60 * 60 * 24,
        count: 500,
      },
      removeOnFail: {
        age: 60 * 60 * 24 * 7,
        count: 500,
      },
    },
  };
}

/** เก็บคิวในโปรเซสทุกตัวไว้ที่เดียว เพื่อปิดให้ครบตอนสั่งปิดระบบ */
const registry = new Map<string, InProcessQueue<unknown>>();

export function getInProcessQueue(name: string) {
  return registry.get(name);
}

@Global()
@Module({})
export class AppQueueRootModule implements OnApplicationShutdown {
  private static readonly logger = new Logger('AppQueue');

  static forRoot(): DynamicModule {
    if (usesRedisQueue()) {
      AppQueueRootModule.logger.log('ใช้คิวผ่าน Redis (QUEUE_DRIVER=redis)');

      return {
        module: AppQueueRootModule,
        imports: [BullModule.forRoot(buildBullRootOptions() as never)],
        exports: [BullModule],
      };
    }

    AppQueueRootModule.logger.log(
      'ใช้คิวในโปรเซส ไม่ต่อ Redis (QUEUE_DRIVER=memory)',
    );

    return { module: AppQueueRootModule };
  }

  async onApplicationShutdown() {
    /*
     * ต้องหยุดนาฬิกาของทุกคิว ไม่งั้นเทสที่บูต Nest แล้วปิด จะค้างเพราะ timer
     * ยังเดินอยู่ และบนเครื่องจริงโปรเซสจะไม่ยอมจบตอนสั่ง restart
     */
    await Promise.all([...registry.values()].map((queue) => queue.close()));
    registry.clear();
  }
}

/**
 * ลงทะเบียนคิวหนึ่งตัว ใช้แทน `BullModule.registerQueue({ name })` ในแต่ละโมดูล
 * คืน DynamicModule ที่ export token เดียวกันทั้งสองทาง
 */
export function registerQueue(
  name: string,
  options: InProcessQueueOptions<unknown> = {},
): DynamicModule {
  if (usesRedisQueue()) {
    return BullModule.registerQueue({ name });
  }

  const token = getQueueToken(name);

  /*
   * สร้างคลาสโมดูลใหม่ต่อคิวหนึ่งตัว ไม่ใช้คลาสเดียวซ้ำทุกคิว
   * เพราะ Nest แยก DynamicModule ด้วยคลาสที่ประกาศไว้ ใช้คลาสเดียวกันหมด
   * จะเห็นเป็นโมดูลเดียวที่ถูกโหลดซ้ำ ๆ ใน log และเสี่ยงชนกันเองเมื่อเพิ่มคิวใหม่
   */
  class InProcessQueueModule {}
  Object.defineProperty(InProcessQueueModule, 'name', {
    value: `InProcessQueueModule_${name}`,
  });

  return {
    module: InProcessQueueModule,
    providers: [
      {
        provide: token,
        useFactory: () => {
          const queue = new InProcessQueue(name, options);
          registry.set(name, queue);

          return queue;
        },
      },
    ],
    exports: [token],
  };
}

/**
 * ต่อคลาส processor เข้ากับคิวในโปรเซส
 *
 * ตอนใช้ Redis, @nestjs/bullmq จะสร้าง Worker ให้เองจาก `@Processor()`
 * ตอนใช้คิวในโปรเซสไม่มีใครทำให้ จึงต้องต่อเองตอนบูต
 *
 * `host` คือคลาสที่สืบทอด WorkerHost ซึ่งมีเมธอด `process(job)` — เซ็นเนอร์
 * ของมันประกาศรับ `Job` ของ BullMQ ทำให้ต้องแปลงชนิดตรงนี้จุดเดียว
 * ตัวงานที่ส่งเข้าไปมีคุณสมบัติครบตามที่ processor ใช้จริงทุกตัว
 */
export function bindInProcessProcessor(
  name: string,
  host: { process(job: never): Promise<unknown> },
  logger?: Logger,
) {
  const queue = registry.get(name);

  if (!queue) return false;

  queue.setProcessor((job: JobLike<unknown>) =>
    host.process(job as unknown as never),
  );

  logger?.log(`ต่อ processor ของคิว "${name}" กับคิวในโปรเซสแล้ว`);

  return true;
}
