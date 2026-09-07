import { MobileTodayOrchestrator } from './mobile-today.orchestrator';
import type { MobileFeatureFlags } from '../types/mobile-context.types';

/**
 * heroState คือสิ่งที่หน้าแรกใช้ตัดสินว่าจะโชว์ปุ่มอะไร
 *
 * ทุกสถานะต้องมาจากข้อมูลที่ AttendanceService ตอบมาเท่านั้น
 * ห้ามเดาจากเวลาปัจจุบันของเครื่อง (บทที่ 8.3 Acceptance Criteria)
 */
describe('MobileTodayOrchestrator · heroState', () => {
  const featureFlags: MobileFeatureFlags = {
    announcements: false,
    approvals: false,
    attendance: true,
    attendancePhotoRequired: false,
    attendancePunch: true,
    executive: false,
    leave: true,
    offlinePunch: false,
    offsite: true,
    overtime: true,
    payslip: true,
    team: false,
    timeAdjust: true,
  };

  function buildOrchestrator(today: unknown) {
    const attendanceService = {
      findMyToday: jest.fn(async () => today),
    };

    return new MobileTodayOrchestrator(attendanceService as never);
  }

  function buildToday(overrides: Record<string, unknown>) {
    return {
      workDate: new Date('2026-08-03T00:00:00.000Z'),
      holiday: { isHoliday: false },
      logs: [],
      latestLog: null,
      canCheckIn: false,
      canCheckOut: false,
      ...overrides,
    };
  }

  const log = (overrides: Record<string, unknown> = {}) => ({
    id: 'log-1',
    logTime: new Date('2026-08-03T01:00:00.000Z'),
    logType: 'CHECK_IN',
    session: 'MORNING_IN',
    status: 'NORMAL',
    isOffsite: false,
    ...overrides,
  });

  it('วันหยุด ต้องเป็น DAY_OFF ไม่ว่าจะมีปุ่มอะไรก็ตาม', async () => {
    const orchestrator = buildOrchestrator(
      buildToday({ holiday: { isHoliday: true }, canCheckIn: true }),
    );

    const result = await orchestrator.getToday('user-1', featureFlags);

    expect(result.heroState).toBe('DAY_OFF');
  });

  it('ยังไม่ลงเวลาแต่ลงได้ ต้องเป็น NOT_CHECKED_IN', async () => {
    const orchestrator = buildOrchestrator(buildToday({ canCheckIn: true }));

    expect((await orchestrator.getToday('user-1', featureFlags)).heroState).toBe(
      'NOT_CHECKED_IN',
    );
  });

  it('ไม่มี log และลงเวลาไม่ได้ ต้องเป็น NO_SHIFT', async () => {
    const orchestrator = buildOrchestrator(buildToday({}));

    expect((await orchestrator.getToday('user-1', featureFlags)).heroState).toBe(
      'NO_SHIFT',
    );
  });

  it('เข้างานรอบเช้าแล้ว รอออก ต้องเป็น MORNING_CHECKED_IN', async () => {
    const orchestrator = buildOrchestrator(
      buildToday({ logs: [log()], canCheckOut: true }),
    );

    expect((await orchestrator.getToday('user-1', featureFlags)).heroState).toBe(
      'MORNING_CHECKED_IN',
    );
  });

  it('เข้างานรอบบ่ายแล้ว ต้องเป็น AFTERNOON_CHECKED_IN', async () => {
    const orchestrator = buildOrchestrator(
      buildToday({
        logs: [log(), log({ id: 'log-2', session: 'AFTERNOON_IN' })],
        canCheckOut: true,
      }),
    );

    expect((await orchestrator.getToday('user-1', featureFlags)).heroState).toBe(
      'AFTERNOON_CHECKED_IN',
    );
  });

  it('มี log ที่ขาดเข้า/ขาดออก ต้องขึ้น MISSING_LOG เพื่อชวนไปขอแก้เวลา', async () => {
    const orchestrator = buildOrchestrator(
      buildToday({ logs: [log({ status: 'MISSING_CHECKOUT' })] }),
    );

    expect((await orchestrator.getToday('user-1', featureFlags)).heroState).toBe(
      'MISSING_LOG',
    );
  });

  it('กำลังทำงานนอกสถานที่ ต้องเป็น OFFSITE_ACTIVE', async () => {
    const orchestrator = buildOrchestrator(
      buildToday({
        logs: [log({ isOffsite: true, session: 'OFFSITE_IN' })],
        canCheckOut: true,
      }),
    );

    expect((await orchestrator.getToday('user-1', featureFlags)).heroState).toBe(
      'OFFSITE_ACTIVE',
    );
  });

  it('ลงครบแล้วและทำอะไรต่อไม่ได้ ต้องเป็น COMPLETED', async () => {
    const orchestrator = buildOrchestrator(
      buildToday({
        logs: [log(), log({ id: 'log-2', logType: 'CHECK_OUT' })],
      }),
    );

    expect((await orchestrator.getToday('user-1', featureFlags)).heroState).toBe(
      'COMPLETED',
    );
  });

  it('log ที่ถูกยกเลิก ต้องไม่นับใน timeline และไม่มีผลต่อสถานะ', async () => {
    const orchestrator = buildOrchestrator(
      buildToday({
        logs: [log({ status: 'CANCELLED' })],
        canCheckIn: true,
      }),
    );

    const result = await orchestrator.getToday('user-1', featureFlags);

    expect(result.timeline).toHaveLength(0);
    expect(result.heroState).toBe('NOT_CHECKED_IN');
  });

  it('quick action ต้องปิดตาม feature flag ที่ปิดอยู่', async () => {
    const orchestrator = buildOrchestrator(
      buildToday({ canCheckIn: true, logs: [] }),
    );

    const result = await orchestrator.getToday('user-1', {
      ...featureFlags,
      /* ปิดเฉพาะสิทธิ์กดลงเวลา — จอเวลายังเข้าได้ ปุ่มลงเวลาต้องหายไปอย่างเดียว */
      attendancePunch: false,
      leave: false,
    });

    const actions = new Map(
      result.quickActions.map((action) => [action.code, action.enabled]),
    );

    expect(actions.get('PUNCH_IN')).toBe(false);
    expect(actions.get('LEAVE_CREATE')).toBe(false);
    expect(actions.get('OVERTIME_CREATE')).toBe(true);
  });
});
