import { bootstrapSchema } from '@/features/bootstrap/bootstrap.types';

/**
 * สัญญาระหว่างแอปกับ backend (บทที่ 12.12)
 *
 * ข้อที่ต้องกันให้ได้: backend เพิ่ม field ใหม่แล้วแอปรุ่นเก่าต้องไม่พัง
 * ส่วน field ที่ใช้ตัดสินใจสำคัญ ถ้าหายไปต้องรู้ตัวทันที ไม่ใช่ไปพังตอน render
 */
describe('bootstrapSchema', () => {
  const validPayload = {
    server: { now: '2026-08-03T11:15:00+07:00', timezone: 'Asia/Bangkok' },
    compatibility: {
      minimumBuild: 100,
      latestBuild: 120,
      updateRequired: false,
      updateRecommended: true,
      storeUrl: null,
    },
    user: { id: 'u1', email: 'a@b.c', displayName: 'พนักงาน', avatarUrl: null },
    employee: {
      id: 'e1',
      employeeCode: 'EMP-0001',
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      positionName: 'พนักงาน',
      startDate: '2024-01-01T00:00:00.000Z',
    },
    organization: {
      company: { id: 'c1', code: 'C1', nameTh: 'บริษัท' },
      branch: null,
      department: null,
      division: null,
      employeeType: null,
    },
    permissions: ['ESS_ACCESS'],
    featureFlags: {
      announcements: false,
      attendance: true,
      attendancePhotoRequired: false,
      attendancePunch: true,
      leave: true,
      offlinePunch: false,
      offsite: true,
      overtime: true,
      payslip: true,
      timeAdjust: true,
    },
    today: {
      workDate: '2026-08-03T00:00:00.000Z',
      heroState: 'NOT_CHECKED_IN',
      canCheckIn: true,
      canCheckOut: false,
      timeline: [],
      quickActions: [],
    },
    summary: {
      leaveAvailable: 8.5,
      pendingRequests: 1,
      unreadNotifications: 3,
      pendingActions: 0,
    },
  };

  it('payload ที่ถูกต้องต้องผ่าน และแปลงวันที่เป็น Date', () => {
    const result = bootstrapSchema.safeParse(validPayload);

    expect(result.success).toBe(true);
    expect(result.data?.server.now).toBeInstanceOf(Date);
    expect(result.data?.today?.workDate).toBeInstanceOf(Date);
    expect(result.data?.featureFlags.team).toBe(false);
  });

  it('backend เพิ่ม field ใหม่ แอปรุ่นเก่าต้องยังใช้ได้', () => {
    const result = bootstrapSchema.safeParse({
      ...validPayload,
      announcements: [{ id: 'a1', title: 'ของใหม่ในอนาคต' }],
      summary: { ...validPayload.summary, overtimeHoursThisMonth: 3.5 },
    });

    expect(result.success).toBe(true);
  });

  it('today เป็น null ได้ เพราะ backend ตัดส่วนที่ไม่ critical ออกเมื่อดึงไม่ทัน', () => {
    const result = bootstrapSchema.safeParse({ ...validPayload, today: null });

    expect(result.success).toBe(true);
    expect(result.data?.today).toBeNull();
  });

  it('ขาด compatibility ต้องไม่ผ่าน เพราะเป็นตัวตัดสินว่าบังคับอัปเดตหรือไม่', () => {
    const { compatibility, ...withoutCompatibility } = validPayload;

    expect(compatibility).toBeDefined();
    expect(bootstrapSchema.safeParse(withoutCompatibility).success).toBe(false);
  });

  it('heroState ที่ไม่รู้จักต้องไม่ผ่าน จะได้ไม่ไปพังตอน map เป็นข้อความ', () => {
    const result = bootstrapSchema.safeParse({
      ...validPayload,
      today: { ...validPayload.today, heroState: 'สถานะที่ยังไม่มีในแอป' },
    });

    expect(result.success).toBe(false);
  });
});
