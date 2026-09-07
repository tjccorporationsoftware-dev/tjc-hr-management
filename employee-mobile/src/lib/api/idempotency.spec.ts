import { ApiError } from './api-error';
import {
  __resetIdempotencyForTests,
  runIdempotentMutation,
} from './idempotency';

describe('runIdempotentMutation', () => {
  beforeEach(() => __resetIdempotencyForTests());

  it('double tap intent เดียวกันใช้ key เดียวกัน', async () => {
    let resolveFirst!: (value: string) => void;
    const keys: string[] = [];
    const first = runIdempotentMutation({
      scope: 'request:create',
      payload: { reason: 'same' },
      execute: async (key) => {
        keys.push(key);
        return new Promise<string>((resolve) => {
          resolveFirst = resolve;
        });
      },
    });
    const second = runIdempotentMutation({
      scope: 'request:create',
      payload: { reason: 'same' },
      execute: async (key) => {
        keys.push(key);
        return 'replay';
      },
    });

    await second;
    resolveFirst('ok');
    await first;

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('network error แล้ว retry ต้องใช้ key เดิม', async () => {
    const keys: string[] = [];
    const execute = async (key: string) => {
      keys.push(key);
      if (keys.length === 1) throw ApiError.network(new Error('offline'));
      return 'ok';
    };

    await expect(
      runIdempotentMutation({ scope: 'complaint:create', payload: { a: 1 }, execute }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await runIdempotentMutation({
      scope: 'complaint:create',
      payload: { a: 1 },
      execute,
    });

    expect(keys[0]).toBe(keys[1]);
  });

  it('validation error ถือว่าผลแน่นอนและ intent ครั้งใหม่ต้องได้ key ใหม่', async () => {
    const keys: string[] = [];

    await expect(
      runIdempotentMutation({
        scope: 'document:create',
        payload: { purpose: '' },
        execute: async (key) => {
          keys.push(key);
          throw new ApiError('invalid', { code: 'VALIDATION', status: 400 });
        },
      }),
    ).rejects.toMatchObject({ status: 400 });

    await runIdempotentMutation({
      scope: 'document:create',
      payload: { purpose: '' },
      execute: async (key) => {
        keys.push(key);
        return 'ok';
      },
    });

    expect(keys[0]).not.toBe(keys[1]);
  });
});
