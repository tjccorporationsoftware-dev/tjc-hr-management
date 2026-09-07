import { validateEnv } from './env.validation';

/**
 * ด่านกันค่าตั้งต้นตอนบูต
 *
 * เน้นเฉพาะเรื่อง 2FA ซึ่งเป็นจุดที่ถ้าตั้งผิดแล้วผู้ดูแลระบบจะล็อกอินไม่ได้
 * และกว่าจะรู้ตัวก็ตอนขึ้นระบบจริงแล้ว — ต้องดังตั้งแต่ตอนสตาร์ทเซิร์ฟเวอร์
 */
describe('validateEnv · สวิตช์ 2FA', () => {
  function productionEnv(overrides: Record<string, string> = {}) {
    return {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://hr:secret@db:5432/hr_workforce',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      FRONTEND_URL: 'https://hr.example.co.th',
      MONITORING_METRICS_TOKEN: 'c'.repeat(48),
      ...overrides,
    };
  }

  it('บูตผ่านเมื่อปิด 2FA ไว้', () => {
    expect(() =>
      validateEnv(productionEnv({ TWO_FACTOR_ENABLED: 'false' })),
    ).not.toThrow();
  });

  it('บูตผ่านเมื่อไม่ได้ตั้ง TWO_FACTOR_ENABLED เลย', () => {
    expect(() => validateEnv(productionEnv())).not.toThrow();
  });

  /*
   * หัวใจของด่านนี้ — ยอมให้เซิร์ฟเวอร์ไม่ขึ้นพร้อมข้อความชัด ๆ
   * ดีกว่าปล่อยให้บูตผ่านแล้วไปพังตอนผู้ดูแลระบบล็อกอินวันแรก
   * โดยที่ไม่มีบัญชีสำรองให้เข้าไปแก้
   */
  it('ไม่ยอมบูตเมื่อเปิด 2FA บน production ทั้งที่ยังไม่มีช่องทางส่งรหัส', () => {
    expect(() =>
      validateEnv(productionEnv({ TWO_FACTOR_ENABLED: 'true' })),
    ).toThrow(/TWO_FACTOR_ENABLED/);
  });

  it('ข้อความ error ต้องบอกสาเหตุและทางแก้ ไม่ใช่แค่บอกว่าผิด', () => {
    let message = '';

    try {
      validateEnv(productionEnv({ TWO_FACTOR_ENABLED: 'true' }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('ยังไม่มีช่องทางส่งรหัส');
    expect(message).toContain('OTP delivery');
  });

  it('เครื่องพัฒนายังเปิด 2FA เพื่อทดสอบได้ตามปกติ', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://hr:secret@localhost:5432/hr_workforce',
        JWT_ACCESS_SECRET: 'dev-access-secret',
        JWT_REFRESH_SECRET: 'dev-refresh-secret',
        FRONTEND_URL: 'http://localhost:3000',
        TWO_FACTOR_ENABLED: 'true',
        TWO_FACTOR_DEV_SHOW_CODE: 'true',
      }),
    ).not.toThrow();
  });
});
