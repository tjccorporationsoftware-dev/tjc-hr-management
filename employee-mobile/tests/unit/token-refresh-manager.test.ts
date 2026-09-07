import { tokenRefreshManager } from '@/lib/api/token-refresh-manager';

/**
 * Refresh mutex (บทที่ 10.8)
 *
 * เคสที่พังจริงถ้าไม่มีตัวนี้: เปิดแอปแล้วหลาย query ยิงพร้อมกัน ทุกตัวได้ 401
 * ถ้าต่างคนต่าง refresh พร้อมกัน token จะหมุนซ้อนกัน (rotation)
 * ตัวที่มาทีหลังจะถือ refresh token ที่ถูกใช้ไปแล้ว → หลุดออกจากระบบทั้งที่ล็อกอินอยู่
 */
describe('tokenRefreshManager', () => {
  it('หลาย request ที่ 401 พร้อมกัน ต้อง refresh ครั้งเดียว', async () => {
    let calls = 0;
    let release: (value: string) => void = () => undefined;

    const refresh = () => {
      calls += 1;
      return new Promise<string | null>((resolve) => {
        release = resolve;
      });
    };

    const first = tokenRefreshManager.run(refresh);
    const second = tokenRefreshManager.run(refresh);
    const third = tokenRefreshManager.run(refresh);

    release('token-ใหม่');

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      'token-ใหม่',
      'token-ใหม่',
      'token-ใหม่',
    ]);
    expect(calls).toBe(1);
  });

  it('รอบก่อนหน้าจบแล้ว รอบใหม่ต้อง refresh ได้อีก', async () => {
    let calls = 0;
    const refresh = async () => {
      calls += 1;
      return 'token';
    };

    await tokenRefreshManager.run(refresh);
    await tokenRefreshManager.run(refresh);

    expect(calls).toBe(2);
  });

  it('refresh ล้มเหลว ต้องไม่ค้าง lock ไว้จนรอบถัดไป refresh ไม่ได้', async () => {
    const failing = async () => {
      throw new Error('refresh token ใช้ไม่ได้');
    };

    await expect(tokenRefreshManager.run(failing)).rejects.toThrow(
      'refresh token ใช้ไม่ได้',
    );

    await expect(tokenRefreshManager.run(async () => 'token-ใหม่')).resolves.toBe(
      'token-ใหม่',
    );
  });
});
