import { resolvePunchGuidance } from '@/features/attendance/punch-guidance';
import {
  punchSessionSchema,
  type PunchContext,
} from '@/features/attendance/punch.types';

/**
 * กฎที่ห้ามหลุด
 *   1. ปุ่มที่กดไม่ได้ ต้องมีเหตุผลเสมอ
 *   2. พิกัดไม่ใช่เหตุผลปิดปุ่ม — server เป็นผู้ตัดสิน แอปได้แค่เตือน
 */
const CONTEXT: PunchContext = {
  allowed: true,
  currentSession: {
    closeTime: '10:00',
    expectedTime: '08:00',
    label: 'เข้างานเช้า',
    openTime: '06:00',
    punchType: 'CHECK_IN',
    sessionCode: 'MORNING_IN',
  },
  holiday: null,
  locationPolicy: { location: null, required: false },
  photoPolicy: { required: false },
  policy: null,
  reason: null,
  reasonCode: null,
  serverNow: new Date('2026-08-16T01:00:00.000Z'),
  sessionRules: [],
  workDate: new Date('2026-08-16T00:00:00.000Z'),
};

const guidanceOf = (
  overrides: Partial<PunchContext>,
  extra: Partial<Parameters<typeof resolvePunchGuidance>[0]> = {},
) =>
  resolvePunchGuidance({
    context: { ...CONTEXT, ...overrides },
    geofenceStatus: 'UNKNOWN',
    locationPermission: 'GRANTED',
    metersToEdge: 0,
    ...extra,
  });

describe('resolvePunchGuidance · ไม่บังคับพิกัด', () => {
  it('backend อนุญาต ต้องกดได้และไม่มีคำเตือน', () => {
    const guidance = guidanceOf({});

    expect(guidance.canAttempt).toBe(true);
    expect(guidance.level).toBe('READY');
    expect(guidance.message).toBeNull();
  });

  /*
   * ป้ายปุ่มอ่านจาก sessionCode ไม่ใช่ punchType — สองฟิลด์นี้คนละความหมาย
   * punchType มีแค่ CHECK_IN/CHECK_OUT ถ้าอ่านผิดฟิลด์ รอบเข้างานจะตกไป
   * ป้ายกลาง ๆ ว่า "ลงเวลา" ทุกครั้ง ซึ่งเคยเกิดจริงมาแล้ว
   */
  it('ป้ายปุ่มต้องบอกว่าเป็นรอบไหน', () => {
    expect(guidanceOf({}).actionLabel).toBe('ลงเวลาเข้างาน');
    expect(
      guidanceOf({
        currentSession: {
          ...CONTEXT.currentSession!,
          punchType: 'CHECK_IN',
          sessionCode: 'AFTERNOON_IN',
        },
      }).actionLabel,
    ).toBe('ลงเวลาเข้างาน (บ่าย)');
    expect(
      guidanceOf({
        currentSession: {
          ...CONTEXT.currentSession!,
          punchType: 'CHECK_OUT',
          sessionCode: 'CHECK_OUT',
        },
      }).actionLabel,
    ).toBe('ลงเวลาออกงาน');
  });
});

describe('resolvePunchGuidance · backend ห้าม', () => {
  it('ปิดปุ่มพร้อมเหตุผลจาก backend เสมอ', () => {
    const guidance = guidanceOf({
      allowed: false,
      reason: 'ลงเวลารอบนี้ไปแล้ว',
    });

    expect(guidance.canAttempt).toBe(false);
    expect(guidance.message).toBe('ลงเวลารอบนี้ไปแล้ว');
  });

  /* backend ไม่ได้ส่งข้อความมาก็ต้องมีประโยคของเราเอง ห้ามปล่อยว่าง */
  it('ไม่มีข้อความจาก backend ต้องแปลจาก reasonCode', () => {
    const guidance = guidanceOf({
      allowed: false,
      reason: null,
      reasonCode: 'DAY_OFF',
    });

    expect(guidance.message).toContain('วันหยุด');
  });

  it('ไม่รู้จัก reasonCode ก็ยังต้องมีข้อความ ไม่ใช่ปุ่มเทาเงียบ ๆ', () => {
    const guidance = guidanceOf({
      allowed: false,
      reason: null,
      reasonCode: null,
    });

    expect(guidance.canAttempt).toBe(false);
    expect(guidance.message).toBeTruthy();
  });

  it('ยังโหลด context ไม่ได้ ต้องไม่ให้กด', () => {
    const guidance = resolvePunchGuidance({
      context: null,
      geofenceStatus: 'INSIDE',
      locationPermission: 'GRANTED',
      metersToEdge: 0,
    });

    expect(guidance.canAttempt).toBe(false);
    expect(guidance.message).toBeTruthy();
  });
});

describe('resolvePunchGuidance · บังคับพิกัด', () => {
  const geofenced: Partial<PunchContext> = {
    locationPolicy: {
      location: {
        latitude: 13.7563,
        longitude: 100.5018,
        name: 'สำนักงานใหญ่',
        radiusMeters: 100,
      },
      required: true,
    },
  };

  it('อยู่ในรัศมี ต้องกดได้และไม่มีคำเตือน', () => {
    const guidance = guidanceOf(geofenced, { geofenceStatus: 'INSIDE' });

    expect(guidance.level).toBe('READY');
    expect(guidance.message).toBeNull();
  });

  /*
   * ข้อสำคัญที่สุด — GPS ในอาคารเพี้ยนได้หลายสิบเมตร
   * ถ้าแอปปิดปุ่มเอง พนักงานที่ยืนถูกที่จริง ๆ จะลงเวลาไม่ได้และแก้ที่ปลายทางไม่ได้
   */
  it('อยู่นอกรัศมี ต้องยังกดได้แต่เตือนและถามยืนยัน', () => {
    const guidance = guidanceOf(geofenced, {
      geofenceStatus: 'OUTSIDE',
      metersToEdge: 250,
    });

    expect(guidance.canAttempt).toBe(true);
    expect(guidance.level).toBe('WARN');
    expect(guidance.requiresConfirmation).toBe(true);
    expect(guidance.message).toContain('250');
  });

  it('สัญญาณไม่แม่น ต้องกดได้เลยโดยไม่ต้องยืนยันซ้ำ', () => {
    const guidance = guidanceOf(geofenced, { geofenceStatus: 'UNCERTAIN' });

    expect(guidance.canAttempt).toBe(true);
    expect(guidance.requiresConfirmation).toBe(false);
  });

  it('อ่านตำแหน่งไม่ได้เลย ต้องยังกดได้แต่ถามยืนยันก่อน', () => {
    const guidance = guidanceOf(geofenced, { geofenceStatus: 'UNKNOWN' });

    expect(guidance.canAttempt).toBe(true);
    expect(guidance.requiresConfirmation).toBe(true);
  });

  /* สิทธิ์/บริการตำแหน่งเป็นคนละเรื่องกับ GPS เพี้ยน อันนี้ผู้ใช้แก้ได้เองจึงปิดปุ่มได้ */
  it('ผู้ใช้ไม่อนุญาตให้เข้าถึงตำแหน่ง ต้องปิดปุ่มพร้อมบอกวิธีแก้', () => {
    const guidance = guidanceOf(geofenced, { locationPermission: 'DENIED' });

    expect(guidance.canAttempt).toBe(false);
    expect(guidance.message).toContain('อนุญาต');
  });

  it('ปิดบริการตำแหน่งทั้งเครื่อง ต้องปิดปุ่มพร้อมบอกให้เปิด', () => {
    const guidance = guidanceOf(geofenced, { locationPermission: 'DISABLED' });

    expect(guidance.canAttempt).toBe(false);
    expect(guidance.message).toContain('เปิด');
  });

  it('กำลังอ่านตำแหน่งอยู่ ต้องรอก่อน ยังไม่ให้กด', () => {
    const guidance = guidanceOf(geofenced, { locationPermission: 'PENDING' });

    expect(guidance.canAttempt).toBe(false);
    expect(guidance.level).toBe('WARN');
  });

  /* ไม่บังคับพิกัด = ไม่ต้องสนใจสถานะ GPS เลย */
  it('ไม่บังคับพิกัด แม้อ่านตำแหน่งไม่ได้ก็ต้องกดได้ตามปกติ', () => {
    const guidance = guidanceOf({}, {
      geofenceStatus: 'OUTSIDE',
      locationPermission: 'DENIED',
    });

    expect(guidance.canAttempt).toBe(true);
    expect(guidance.level).toBe('READY');
  });
});

describe('punchSessionSchema · แยกรหัสรอบออกจากทิศทาง', () => {
  const RAW = {
    closeTime: '11:59',
    expectedTime: '08:00',
    label: 'ลงเวลาเข้า รอบที่ 1',
    openTime: '06:00',
    punchType: 'CHECK_IN',
    sessionCode: 'MORNING_IN',
  };

  /*
   * backend ส่งสองฟิลด์นี้มาคนละความหมาย และค่าที่ต้องส่งกลับตอนกดลงเวลาคือ
   * sessionCode เท่านั้น เคยอ่านสลับกันแล้วรอบเข้างานยิงไปเป็น 'CUSTOM'
   * ทุกครั้ง แล้ว backend ตอบ 400 "ไม่พบรอบลงเวลานี้ในนโยบาย"
   */
  it('ทิศทางเข้า/ออกต้องไม่ถูกอ่านเป็นรหัสรอบ', () => {
    const parsed = punchSessionSchema.parse(RAW);

    expect(parsed.sessionCode).toBe('MORNING_IN');
    expect(parsed.punchType).toBe('CHECK_IN');
  });

  it('รหัสรอบที่แอปยังไม่รู้จักตกเป็น CUSTOM ไม่ใช่ทั้งจอพัง', () => {
    const parsed = punchSessionSchema.parse({
      ...RAW,
      sessionCode: 'NIGHT_SHIFT_IN',
    });

    expect(parsed.sessionCode).toBe('CUSTOM');
  });

  it('ทิศทางที่ไม่รู้จักตกเป็น CHECK_IN ไม่ใช่ทำให้ parse ล้ม', () => {
    const parsed = punchSessionSchema.parse({ ...RAW, punchType: 'BREAK_IN' });

    expect(parsed.punchType).toBe('CHECK_IN');
  });
});
