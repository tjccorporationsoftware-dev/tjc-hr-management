import { resolveDevApiBaseUrl } from '@/config/dev-host';

/**
 * ถ้าฟังก์ชันนี้ผิด อาการที่ผู้ใช้เห็นคือ "ล็อกอินไม่ได้" เฉย ๆ
 * ไม่มี error บอกว่ายิงไปผิดเครื่อง จึงต้องมีเทสคุมทุกทางแยก
 */
const LAN = '192.168.1.5:8081';

describe('resolveDevApiBaseUrl · เครื่องจริงในวงแลน', () => {
  it('แทน localhost ด้วย IP ที่ Metro รู้ โดยคงพอร์ตและ path ของ backend', () => {
    expect(
      resolveDevApiBaseUrl({
        apiBaseUrl: 'http://localhost:4000/api',
        hostUri: LAN,
        isDevelopment: true,
      }),
    ).toBe('http://192.168.1.5:4000/api');
  });

  it('รองรับ 127.0.0.1 เหมือนกับ localhost', () => {
    expect(
      resolveDevApiBaseUrl({
        apiBaseUrl: 'http://127.0.0.1:4000/api',
        hostUri: LAN,
        isDevelopment: true,
      }),
    ).toBe('http://192.168.1.5:4000/api');
  });

  it('hostUri ที่มี scheme หรือ path ติดมาก็ต้องดึง host ออกได้', () => {
    for (const hostUri of [
      'exp://192.168.1.5:8081',
      'http://192.168.1.5:8081/_expo/loading',
      '192.168.1.5:8081',
    ]) {
      expect(
        resolveDevApiBaseUrl({
          apiBaseUrl: 'http://localhost:4000/api',
          hostUri,
          isDevelopment: true,
        }),
      ).toBe('http://192.168.1.5:4000/api');
    }
  });
});

describe('resolveDevApiBaseUrl · Android emulator', () => {
  /* emulator มองไม่เห็น localhost ของเครื่อง host ต้องผ่าน alias 10.0.2.2 */
  it('ใช้ 10.0.2.2 แทน และต้องมาก่อน IP วงแลน', () => {
    expect(
      resolveDevApiBaseUrl({
        apiBaseUrl: 'http://localhost:4000/api',
        hostUri: LAN,
        isAndroidEmulator: true,
        isDevelopment: true,
      }),
    ).toBe('http://10.0.2.2:4000/api');
  });
});

describe('resolveDevApiBaseUrl · กรณีที่ต้องไม่แตะค่าเดิม', () => {
  /* ข้อสำคัญที่สุด: production ต้องยิงไปที่ที่ตั้งใจ deploy เท่านั้น */
  it('ไม่ใช่ development ต้องคืนค่าเดิมเสมอ แม้จะเป็น localhost', () => {
    expect(
      resolveDevApiBaseUrl({
        apiBaseUrl: 'http://localhost:4000/api',
        hostUri: LAN,
        isDevelopment: false,
      }),
    ).toBe('http://localhost:4000/api');
  });

  it('ตั้ง IP หรือโดเมนจริงมาแล้ว ต้องไม่ถูกเขียนทับ', () => {
    for (const url of [
      'http://192.168.1.99:4000/api',
      'https://hr.example.co.th/api',
    ]) {
      expect(
        resolveDevApiBaseUrl({
          apiBaseUrl: url,
          hostUri: LAN,
          isDevelopment: true,
        }),
      ).toBe(url);
    }
  });

  it('ไม่รู้ IP ของเครื่อง dev ต้องคืนค่าเดิม ไม่ใช่เดาเอา', () => {
    for (const hostUri of [null, '', '   ', 'localhost:8081']) {
      expect(
        resolveDevApiBaseUrl({
          apiBaseUrl: 'http://localhost:4000/api',
          hostUri,
          isDevelopment: true,
        }),
      ).toBe('http://localhost:4000/api');
    }
  });

  it('URL พังต้องคืนค่าเดิมเงียบ ๆ ให้ schema เป็นคนฟ้อง', () => {
    expect(
      resolveDevApiBaseUrl({
        apiBaseUrl: 'ไม่ใช่ url',
        hostUri: LAN,
        isDevelopment: true,
      }),
    ).toBe('ไม่ใช่ url');
  });

  /* ต่อท้ายด้วย / จะทำให้ path กลายเป็น //api ตอนประกอบ URL */
  it('ไม่ทิ้ง slash ท้าย URL ที่แปลงแล้ว', () => {
    expect(
      resolveDevApiBaseUrl({
        apiBaseUrl: 'http://localhost:4000',
        hostUri: LAN,
        isDevelopment: true,
      }),
    ).toBe('http://192.168.1.5:4000');
  });
});
