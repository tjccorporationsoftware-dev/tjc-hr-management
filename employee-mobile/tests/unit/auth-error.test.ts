import { toAuthErrorView } from '@/features/auth/auth-error';
import { ApiError } from '@/lib/api/api-error';

/**
 * ทุก error ตอนเข้าสู่ระบบต้องบอกผู้ใช้ได้ว่า "ทำอะไรต่อ" (บทที่ 9.8)
 * ที่สำคัญคือต้องแยกให้ออกระหว่าง "ลองใหม่แล้วหาย" กับ "ลองใหม่ก็เท่านั้น"
 */
describe('toAuthErrorView', () => {
  it('เน็ตไม่ถึงเซิร์ฟเวอร์ ต้องบอกให้เช็คอินเทอร์เน็ตและลองใหม่ได้', () => {
    const view = toAuthErrorView(ApiError.network(new Error('failed')));

    expect(view.canRetry).toBe(true);
    expect(view.title).toBe('ไม่มีการเชื่อมต่อ');
  });

  it('timeout ต้องลองใหม่ได้', () => {
    expect(toAuthErrorView(ApiError.timeout(new Error('t'))).canRetry).toBe(true);
  });

  it('รหัสผ่านผิด ต้องใช้ข้อความจาก backend และไม่ชวนให้กดรัว', () => {
    const view = toAuthErrorView(
      new ApiError('อีเมลหรือรหัสผ่านไม่ถูกต้อง', { status: 401 }),
    );

    expect(view.canRetry).toBe(false);
    expect(view.message).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('บัญชีถูกล็อก ต้องคงข้อความของ backend ไว้ เพราะมีรายละเอียดเวลาปลดล็อก', () => {
    const view = toAuthErrorView(
      new ApiError('บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง', { status: 401 }),
    );

    expect(view.message).toContain('บัญชีถูกล็อก');
  });

  it('เรียกถี่เกินไป ต้องบอกให้รอแล้วลองใหม่', () => {
    const view = toAuthErrorView(
      new ApiError('พยายามเข้าสู่ระบบบ่อยเกินไป', { status: 429 }),
    );

    expect(view.canRetry).toBe(true);
    expect(view.title).toBe('ลองบ่อยเกินไป');
  });

  it('5xx ต้องไม่โชว์ข้อความดิบจากเซิร์ฟเวอร์ แต่ต้องเก็บ requestId ไว้ให้ซัพพอร์ต', () => {
    const view = toAuthErrorView(
      new ApiError('TypeError: cannot read property of undefined', {
        requestId: 'req-1',
        status: 500,
      }),
    );

    expect(view.message).toBe('ระบบขัดข้องชั่วคราว');
    expect(view.hint).toContain('ลองใหม่');
    expect(view.requestId).toBe('req-1');
    /* รหัสอ้างอิงแบบสั้นมีเฉพาะตอนต้นเหตุอยู่ฝั่งเซิร์ฟเวอร์ */
    expect(view.reference).toBe('req-1');
  });

  it('รหัสผ่านผิดต้องไม่โชว์รหัสอ้างอิง เพราะผู้ใช้ไม่ต้องเอาไปแจ้งใคร', () => {
    const view = toAuthErrorView(
      new ApiError('รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง', {
        requestId: '019e4c70-988e-44b6-b5e7-9ae31ca22e99',
        status: 401,
      }),
    );

    expect(view.message).toBe('รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง');
    expect(view.hint).toBeNull();
    expect(view.reference).toBeNull();
  });

  it('รหัสอ้างอิงแบบสั้นใช้ท่อนท้ายของ UUID ที่เป็นค่าสุ่ม ไม่ใช่ท่อนหน้าที่ซ้ำกันได้', () => {
    const view = toAuthErrorView(
      new ApiError('boom', {
        requestId: '019e4c70-988e-44b6-b5e7-9ae31ca22e99',
        status: 503,
      }),
    );

    expect(view.reference).toBe('9ae31ca22e99');
  });

  it('ต้องบังคับอัปเดตแอปแบบลองใหม่ไม่ได้', () => {
    const view = toAuthErrorView(
      new ApiError('กรุณาอัปเดตแอป', {
        code: 'APP_UPDATE_REQUIRED',
        status: 403,
      }),
    );

    expect(view.canRetry).toBe(false);
    expect(view.title).toBe('ต้องอัปเดตแอป');
  });

  it('error ที่ไม่ใช่ ApiError ต้องไม่ทำให้หน้าจอพัง', () => {
    const view = toAuthErrorView(new Error('อะไรก็ไม่รู้'));

    expect(view.canRetry).toBe(true);
    expect(view.hint).toContain('ลองใหม่');
  });
});
