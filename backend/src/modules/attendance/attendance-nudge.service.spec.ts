import { AttendanceNudgeService } from './attendance-nudge.service';

/**
 * เตือนลงเวลา — เงื่อนไข "เตือนเมื่อไร" สำคัญกว่าข้อความ
 *
 * เตือนเร็วไปคนยังเดินเข้าออฟฟิศอยู่ เตือนช้าไปก็แก้ไม่ทัน และห้ามเตือนคนที่
 * วันนั้นไม่ต้องมา (วันหยุด/ลาที่อนุมัติแล้ว) ไม่งั้นคนจะปิดแจ้งเตือนทิ้งทั้งหมด
 */

function buildService(options: {
  employees?: unknown[];
  isHoliday?: boolean;
  leave?: unknown;
  rules?: unknown[];
}) {
  const notifyNudge = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    employee: {
      findMany: jest.fn().mockResolvedValue(options.employees ?? []),
    },
    leaveRequest: {
      findFirst: jest.fn().mockResolvedValue(options.leave ?? null),
    },
  };

  const attendance = {
    getEffectivePunchSessions: jest.fn().mockResolvedValue({
      policy: { id: 'policy-1' },
      rules: options.rules ?? [
        {
          expectedTime: '08:00',
          punchType: 'CHECK_IN',
          sessionCode: 'MORNING_IN',
        },
      ],
    }),
  };

  const systemSettings = {
    getEmployeeAttendanceHolidayInfo: jest.fn().mockResolvedValue({
      isHoliday: options.isHoliday ?? false,
      name: options.isHoliday ? 'วันอาทิตย์' : null,
    }),
  };

  const service = new AttendanceNudgeService(
    prisma as never,
    attendance as never,
    { notifyNudge } as never,
    systemSettings as never,
  );

  return { attendance, notifyNudge, prisma, service, systemSettings };
}

const EMPLOYEE = {
  branchId: 'branch-1',
  companyId: 'company-1',
  employeeTypeId: null,
  id: 'emp-1',
  userId: 'user-1',
};

describe('AttendanceNudgeService', () => {
  it('เตือนตอนเลยเวลาเข้างานพอดี 15 นาที', async () => {
    const { notifyNudge, service } = buildService({ employees: [EMPLOYEE] });

    const result = await service.syncMissingCheckInNudges(
      new Date('2026-09-07T08:15:00'),
    );

    expect(result.notifiedCount).toBe(1);
    expect(notifyNudge).toHaveBeenCalledWith(
      ['user-1'],
      expect.objectContaining({
        sourceKey: 'attendance-nudge:check-in:emp-1:2026-09-07',
        type: 'ATTENDANCE_MISSING_CHECK_IN_NUDGE',
      }),
    );
  });

  it('ไม่เตือนซ้ำในนาทีอื่นของวันเดียวกัน', async () => {
    const { notifyNudge, service } = buildService({ employees: [EMPLOYEE] });

    await service.syncMissingCheckInNudges(new Date('2026-09-07T09:40:00'));

    expect(notifyNudge).not.toHaveBeenCalled();
  });

  it('ไม่เตือนในวันหยุด', async () => {
    const { notifyNudge, service } = buildService({
      employees: [EMPLOYEE],
      isHoliday: true,
    });

    await service.syncMissingCheckInNudges(new Date('2026-09-07T08:15:00'));

    expect(notifyNudge).not.toHaveBeenCalled();
  });

  it('ไม่เตือนคนที่ลาอนุมัติแล้ว', async () => {
    const { notifyNudge, service } = buildService({
      employees: [EMPLOYEE],
      leave: { id: 'leave-1' },
    });

    await service.syncMissingCheckInNudges(new Date('2026-09-07T08:15:00'));

    expect(notifyNudge).not.toHaveBeenCalled();
  });

  it('เตือนคนที่มีเวลาเข้าแต่ยังไม่มีเวลาออก', async () => {
    const { notifyNudge, service } = buildService({
      employees: [{ id: 'emp-9', userId: 'user-9' }],
    });

    const result = await service.syncMissingCheckoutNudges(
      new Date('2026-09-07T20:00:00'),
    );

    expect(result.notifiedCount).toBe(1);
    expect(notifyNudge).toHaveBeenCalledWith(
      ['user-9'],
      expect.objectContaining({
        sourceKey: 'attendance-nudge:check-out:emp-9:2026-09-07',
        type: 'ATTENDANCE_MISSING_CHECK_OUT_NUDGE',
      }),
    );
  });
});
