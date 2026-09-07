import { Injectable, Module } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';

import { InProcessQueue, type JobLike } from './in-process-queue';
import {
  AppQueueRootModule,
  bindInProcessProcessor,
  getInProcessQueue,
  registerQueue,
  resolveQueueDriver,
  usesRedisQueue,
} from './queue.module';

/**
 * เทสการต่อคิวเข้ากับ Nest
 * =====================
 * เทสของ InProcessQueue พิสูจน์ว่าตัวคิวทำงานถูก แต่ไม่ได้พิสูจน์ว่า
 * `@InjectQueue()` จะได้ตัวคิวนี้จริง และ processor ถูกต่อเข้ากับคิวจริง
 * ซึ่งเป็นจุดที่พังแล้วเงียบที่สุด — งานเข้าคิวได้ แต่ไม่มีใครทำ
 */

const QUEUE_NAME = 'test-wiring';

@Injectable()
class DemoProcessor {
  readonly seen: string[] = [];

  process(job: JobLike<{ value: string }>): Promise<void> {
    this.seen.push(job.data.value);

    return Promise.resolve();
  }
}

@Module({
  imports: [registerQueue(QUEUE_NAME, { autoStart: false })],
  providers: [DemoProcessor],
  exports: [DemoProcessor],
})
class DemoQueueModule {}

describe('resolveQueueDriver', () => {
  it('ค่าเริ่มต้นคือคิวในโปรเซส ไม่ใช่ Redis', () => {
    expect(resolveQueueDriver({})).toBe('memory');
    expect(usesRedisQueue({})).toBe(false);
  });

  it('เลือก Redis ได้เมื่อระบุตรง ๆ เท่านั้น', () => {
    expect(resolveQueueDriver({ QUEUE_DRIVER: 'redis' })).toBe('redis');

    /* ค่าที่สะกดผิดต้องไม่กลายเป็น redis โดยบังเอิญ */
    expect(resolveQueueDriver({ QUEUE_DRIVER: 'Redis ' })).toBe('memory');
    expect(resolveQueueDriver({ QUEUE_DRIVER: '' })).toBe('memory');
  });
});

describe('registerQueue — ต่อเข้ากับ Nest', () => {
  it('@InjectQueue ได้คิวในโปรเซส และ processor ที่ต่อไว้ทำงานจริง', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppQueueRootModule.forRoot(), DemoQueueModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const queue = moduleRef.get<InProcessQueue<{ value: string }>>(
      getQueueToken(QUEUE_NAME),
    );
    const processor = moduleRef.get(DemoProcessor);

    expect(queue).toBeInstanceOf(InProcessQueue);

    /* ยังไม่ต่อ processor — งานต้องค้างอยู่ ไม่ใช่หายไปเฉย ๆ */
    await queue.add('demo', { value: 'ก่อนต่อ' }, { jobId: 'งาน-1' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(processor.seen).toEqual([]);
    expect(queue.countByState().waiting).toBe(1);

    expect(bindInProcessProcessor(QUEUE_NAME, processor)).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));

    expect(processor.seen).toEqual(['ก่อนต่อ']);

    await app.close();
  });

  it('ปิดแอปแล้วคิวหยุดเดิน ไม่ค้าง timer ไว้', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppQueueRootModule.forRoot(), DemoQueueModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    expect(getInProcessQueue(QUEUE_NAME)).toBeDefined();

    await app.close();

    /* ทะเบียนถูกล้าง = ไม่มีคิวตัวไหนเดินค้างอยู่ข้ามการปิดแอป */
    expect(getInProcessQueue(QUEUE_NAME)).toBeUndefined();
  });

  it('ต่อ processor กับชื่อคิวที่ไม่มี = คืน false ไม่ใช่ระเบิด', () => {
    expect(bindInProcessProcessor('ไม่มีคิวนี้', new DemoProcessor())).toBe(
      false,
    );
  });
});
