import {
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  validatePinFormat,
} from '@/features/auth/pin';

/**
 * ตรรกะ PIN ที่ทดสอบได้โดยไม่ต้องมีเครื่องจริง
 *
 * ส่วนที่แตะ SecureStore (setPin/verifyPin) ไม่ทดสอบที่นี่เพราะต้องมี native
 * module — สิ่งที่ต้องมีเทสคุมคือ "กติกาว่ารหัสแบบไหนใช้ไม่ได้" เพราะเป็น
 * ด่านเดียวที่กันคนตั้ง 123456 แล้วโดนเดาถูกในสามครั้งแรก
 */
describe('validatePinFormat', () => {
  it('รหัสปกติต้องผ่าน', () => {
    expect(validatePinFormat('284916')).toBeNull();
    expect(validatePinFormat('130759')).toBeNull();
  });

  it('ความยาวไม่ครบต้องไม่ผ่าน', () => {
    expect(validatePinFormat('12345')).toBe('LENGTH');
    expect(validatePinFormat('1234567')).toBe('LENGTH');
    expect(validatePinFormat('')).toBe('LENGTH');
  });

  it('ตัวอักษรหรืออักขระอื่นต้องไม่ผ่าน', () => {
    expect(validatePinFormat('12a456')).toBe('DIGITS');
    expect(validatePinFormat('12 456')).toBe('DIGITS');
    /* เลขอารบิกอินดิกไม่ใช่ตัวเลขที่คีย์แพดของเราส่งมา ต้องถูกปฏิเสธด้วย */
    expect(validatePinFormat('١٢٣٤٥٦')).toBe('DIGITS');
  });

  it('เลขซ้ำทั้งหมดต้องไม่ผ่าน', () => {
    expect(validatePinFormat('111111')).toBe('REPEATED');
    expect(validatePinFormat('000000')).toBe('REPEATED');
  });

  it('เลขเรียงขึ้นหรือลงต้องไม่ผ่าน', () => {
    expect(validatePinFormat('123456')).toBe('SEQUENTIAL');
    expect(validatePinFormat('654321')).toBe('SEQUENTIAL');
    expect(validatePinFormat('456789')).toBe('SEQUENTIAL');
  });

  it('เรียงแค่บางช่วงยังใช้ได้ ไม่งั้นจะปฏิเสธรหัสที่ปลอดภัยพอไปด้วย', () => {
    expect(validatePinFormat('123457')).toBeNull();
    expect(validatePinFormat('129456')).toBeNull();
  });

  it('ค่าคงที่ต้องตรงกับที่จอและแป้นใช้ร่วมกัน', () => {
    expect(PIN_LENGTH).toBe(6);
    expect(MAX_PIN_ATTEMPTS).toBe(5);
  });
});
