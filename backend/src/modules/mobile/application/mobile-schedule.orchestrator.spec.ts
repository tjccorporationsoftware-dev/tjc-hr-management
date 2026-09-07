import { MobileScheduleOrchestrator } from './mobile-schedule.orchestrator';

describe('MobileScheduleOrchestrator', () => {
  const user = { id: 'user-1' } as never;

  it('รวม ESS schedule + shift + offsite โดยไม่เปลี่ยนข้อมูล domain เดิม', async () => {
    const essSchedule = {
      getMySchedule: jest.fn(async () => ({
        employee: { id: 'emp-1' },
        year: 2026,
        month: 8,
        period: { label: '08/2026' },
        summary: {
          workDays: 1,
          weekendDays: 0,
          attendanceDays: 1,
          leaveDays: 0,
          overtimeDays: 0,
          timeAdjustDays: 0,
        },
        days: [
          {
            date: '2026-08-20',
            dayOfMonth: 20,
            dayName: 'วันพฤหัสบดี',
            isWeekend: false,
            isHoliday: false,
            holidayName: null,
            types: ['WORKDAY', 'ATTENDANCE'],
            status: 'HAS_ATTENDANCE',
            attendanceLogs: [
              {
                id: 'log-1',
                logTime: new Date('2026-08-20T01:00:00.000Z'),
                logType: 'CHECK_IN',
                status: 'VALID',
                location: { nameTh: 'สำนักงานใหญ่' },
              },
            ],
            leaveRequests: [],
            overtimeRequests: [],
            timeAdjustRequests: [],
          },
        ],
        warning: 'read only',
      })),
      getMyEffectiveShiftCalendar: jest.fn(async () => ({
        year: 2026,
        month: 8,
        days: [
          {
            date: '2026-08-20',
            shift: { id: 'policy-1', name: 'กะสำนักงานใหญ่', source: 'SCOPE' },
          },
        ],
      })),
    };

    const offsiteWork = {
      findMy: jest.fn(async (query: { status?: string }) => ({
        items:
          query.status === 'APPROVED'
            ? [
                {
                  id: 'off-1',
                  requestNo: 'OFF-001',
                  status: 'APPROVED',
                  workDate: new Date('2026-08-20T00:00:00.000Z'),
                  locationName: 'ลูกค้า A',
                },
              ]
            : [],
        meta: { page: 1, totalPages: 1 },
      })),
    };

    const service = new MobileScheduleOrchestrator(
      essSchedule as never,
      offsiteWork as never,
    );

    const result = await service.getMySchedule(user, { year: 2026, month: 8 });

    expect(result.days[0]).toMatchObject({
      date: '2026-08-20',
      types: ['WORKDAY', 'ATTENDANCE', 'OFFSITE'],
      shift: { id: 'policy-1', source: 'SCOPE' },
      offsiteRequests: [{ id: 'off-1', status: 'APPROVED' }],
    });
    expect(result.summary.offsiteDays).toBe(1);
    expect(offsiteWork.findMy).toHaveBeenCalledTimes(4);
  });

  it('อ่าน offsite ต่อทุกหน้าภายในเดือนเพื่อไม่ทำรายการหาย', async () => {
    const essSchedule = {
      getMySchedule: jest.fn(async () => ({
        employee: { id: 'emp-1' },
        year: 2026,
        month: 8,
        period: {},
        summary: {},
        days: [],
        warning: null,
      })),
      getMyEffectiveShiftCalendar: jest.fn(async () => ({ days: [] })),
    };
    const offsiteWork = {
      findMy: jest.fn(async (query: { page?: number; status?: string }) => ({
        items: [],
        meta: {
          page: query.page ?? 1,
          totalPages: query.status === 'SUBMITTED' ? 2 : 1,
        },
      })),
    };
    const service = new MobileScheduleOrchestrator(
      essSchedule as never,
      offsiteWork as never,
    );

    await service.getMySchedule(user, { year: 2026, month: 8 });

    expect(offsiteWork.findMy).toHaveBeenCalledTimes(5);
    expect(offsiteWork.findMy).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, status: 'SUBMITTED' }),
      user,
    );
  });
});
