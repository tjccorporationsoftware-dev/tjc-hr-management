import { redactContext } from '@/lib/monitoring/monitoring';

/**
 * ตาข่ายกันความลับหลุดออกจากเครื่อง (บทที่ 21.1)
 *
 * เคสที่กลัวจริง: เผลอ log ทั้ง request ตอนไล่บั๊ก แล้ว refresh token
 * ไปโผล่ในระบบ monitoring ซึ่งคนนอกทีมก็เข้าดูได้
 */
describe('redactContext', () => {
  it('ต้องปิดค่าที่เป็นความลับตามชื่อคีย์', () => {
    const result = redactContext({
      accessToken: 'ควรถูกปิด',
      password: 'ควรถูกปิด',
      otp: '123456',
      refreshToken: 'ควรถูกปิด',
      email: 'employee@example.com',
    });

    expect(result).toEqual({
      accessToken: '[redacted]',
      password: '[redacted]',
      otp: '[redacted]',
      refreshToken: '[redacted]',
      email: 'employee@example.com',
    });
  });

  it('ต้องปิดค่าที่ซ้อนอยู่ในอ็อบเจ็กต์ชั้นในด้วย', () => {
    const result = redactContext({
      request: { body: { authorization: 'Bearer x', note: 'ok' } },
    });

    expect(result).toEqual({
      request: { body: { authorization: '[redacted]', note: 'ok' } },
    });
  });

  it('ต้องปิดยอดเงินและเลขบัญชี', () => {
    const result = redactContext({
      netPay: 25000,
      bankAccountNo: '1234567890',
      workingDays: 21,
    });

    expect(result).toEqual({
      netPay: '[redacted]',
      bankAccountNo: '[redacted]',
      workingDays: 21,
    });
  });

  it('Error ต้องเหลือแค่ชื่อกับข้อความ ไม่ลาก stack ไปด้วย', () => {
    const result = redactContext({ error: new Error('พัง') });

    expect(result).toEqual({ error: { message: 'พัง', name: 'Error' } });
  });

  it('ต้องไม่วนไม่จบเมื่อเจอโครงสร้างลึกผิดปกติ', () => {
    let deep: Record<string, unknown> = { value: 'ล่างสุด' };

    for (let index = 0; index < 10; index += 1) {
      deep = { nested: deep };
    }

    expect(() => redactContext(deep)).not.toThrow();
    expect(JSON.stringify(redactContext(deep))).toContain('[truncated]');
  });
});
