import { AuthenticationType } from 'expo-local-authentication';

import {
  interpretBiometricResult,
  resolveBiometricCapability,
} from '@/features/auth/biometric';

/**
 * ไบโอเมตริกเป็นด่านความปลอดภัย ตรรกะสองก้อนที่ต้องคุมด้วยเทสคือ:
 *
 *   1. **ความพร้อมของเครื่อง** — ปุ่มต้องไม่โผล่บนเครื่องที่ยังไม่ได้ตั้ง
 *      ลายนิ้วมือ เพราะกดแล้วจะเด้ง error ของ OS ซึ่งผู้ใช้แยกไม่ออกจาก
 *      อาการแอปพัง
 *   2. **การแปลผล** — "ผู้ใช้กดยกเลิกเอง" ต้องไม่ถูกรายงานเป็นความล้มเหลว
 *      ไม่งั้นคนที่เลือกจะพิมพ์ PIN เองจะเจอข้อความแดงว่าเซนเซอร์มีปัญหา
 *
 * ทดสอบสองฟังก์ชันนี้แบบตรรกะล้วน ไม่ผ่าน native module — jest-expo โหลด
 * โมดูลจริงของ Expo เข้ามา ทำให้ `jest.mock()` ไม่มีผล การแยกตรรกะออกมา
 * จึงเป็นทั้งวิธีที่ทดสอบได้และโครงที่อ่านง่ายกว่าเดิม
 */
describe('ไบโอเมตริก · ความพร้อมของเครื่อง', () => {
  const types = [AuthenticationType.FINGERPRINT];

  it('ไม่มีฮาร์ดแวร์ = ใช้ไม่ได้', () => {
    expect(
      resolveBiometricCapability({
        hasHardware: false,
        isEnrolled: true,
        types,
      }).available,
    ).toBe(false);
  });

  it('มีฮาร์ดแวร์แต่ยังไม่ได้ลงทะเบียน = ใช้ไม่ได้', () => {
    expect(
      resolveBiometricCapability({
        hasHardware: true,
        isEnrolled: false,
        types,
      }).available,
    ).toBe(false);
  });

  it('ใบหน้ามาก่อนลายนิ้วมือเมื่อเครื่องรองรับทั้งคู่', () => {
    const capability = resolveBiometricCapability({
      hasHardware: true,
      isEnrolled: true,
      types: [
        AuthenticationType.FINGERPRINT,
        AuthenticationType.FACIAL_RECOGNITION,
      ],
    });

    expect(capability.kind).toBe('FACE');
    expect(capability.label).toBe('ใช้ใบหน้า');
  });

  it('ลายนิ้วมือได้ป้ายของตัวเอง', () => {
    const capability = resolveBiometricCapability({
      hasHardware: true,
      isEnrolled: true,
      types,
    });

    expect(capability.available).toBe(true);
    expect(capability.kind).toBe('FINGERPRINT');
    expect(capability.label).toBe('ใช้ลายนิ้วมือ');
  });

  it('ชนิดที่ไม่รู้จักยังใช้ได้ แต่ใช้ป้ายกลาง', () => {
    const capability = resolveBiometricCapability({
      hasHardware: true,
      isEnrolled: true,
      types: [],
    });

    expect(capability.available).toBe(true);
    expect(capability.kind).toBe('UNKNOWN');
  });
});

describe('ไบโอเมตริก · การแปลผลจาก OS', () => {
  it('สำเร็จ', () => {
    expect(interpretBiometricResult({ success: true })).toEqual({
      status: 'ok',
    });
  });

  it('ผู้ใช้กดยกเลิกไม่ใช่ความผิดพลาด', () => {
    expect(
      interpretBiometricResult({ error: 'user_cancel', success: false }),
    ).toEqual({ status: 'cancelled' });
  });

  it('เลือกใส่ PIN แทนก็นับเป็นยกเลิก ไม่ต้องขึ้นข้อความแดง', () => {
    expect(
      interpretBiometricResult({ error: 'user_fallback', success: false }),
    ).toEqual({ status: 'cancelled' });
  });

  it('ระบบขัดจังหวะ (มีสายเข้า) ก็นับเป็นยกเลิก', () => {
    expect(
      interpretBiometricResult({ error: 'system_cancel', success: false }),
    ).toEqual({ status: 'cancelled' });
  });

  it('อ่านไม่ผ่านจริงต้องบอกให้ไปใช้ PIN', () => {
    const result = interpretBiometricResult({
      error: 'authentication_failed',
      success: false,
    });

    expect(result.status).toBe('failed');
    expect(result).toHaveProperty('message');
  });

  it('ล้มเหลวโดยไม่มีรหัส error ก็ยังต้องบอกทางออกให้ผู้ใช้', () => {
    expect(interpretBiometricResult({ success: false }).status).toBe('failed');
  });
});
