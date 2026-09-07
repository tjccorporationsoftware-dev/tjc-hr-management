import { EssScheduleService } from './ess-schedule.service';

describe('EssScheduleService mobile shift projection', () => {
  const currentUser = { id: 'user-1' };

  function build(params?: {
    assignments?: any[];
    policies?: any[];
  }) {
    const prisma = {
      employee: {
        findFirst: jest.fn(async () => ({
          id: 'emp-1',
          userId: 'user-1',
          companyId: 'company-1',
          branchId: 'branch-1',
          employeeTypeId: 'type-1',
        })),
      },
      employeeWorkShift: {
        findMany: jest.fn(async () => params?.assignments ?? []),
      },
      attendancePolicy: {
        findMany: jest.fn(async () => params?.policies ?? []),
      },
    };

    return {
      prisma,
      service: new EssScheduleService(prisma as never, {} as never),
    };
  }

  it('กะรายคนต้องชนะกะตาม scope ในวันที่ assignment มีผล', async () => {
    const employeePolicy = {
      id: 'employee-policy',
      code: 'EMP',
      name: 'กะเฉพาะคน',
      morningCheckInDeadline: '09:00',
      sessionRules: [],
    };
    const scopePolicy = {
      id: 'scope-policy',
      code: 'SCOPE',
      name: 'กะสาขา',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      sessionRules: [],
    };
    const { service } = build({
      assignments: [
        {
          effectiveFrom: new Date('2026-08-10T00:00:00.000Z'),
          effectiveTo: new Date('2026-08-20T00:00:00.000Z'),
          policy: employeePolicy,
        },
      ],
      policies: [scopePolicy],
    });

    const result = await service.getMyEffectiveShiftCalendar(currentUser, {
      year: 2026,
      month: 8,
    });

    expect(result.days[8]?.shift).toMatchObject({ id: 'scope-policy', source: 'SCOPE' });
    expect(result.days[9]?.shift).toMatchObject({ id: 'employee-policy', source: 'EMPLOYEE' });
    expect(result.days[19]?.shift).toMatchObject({ id: 'employee-policy', source: 'EMPLOYEE' });
    expect(result.days[20]?.shift).toMatchObject({ id: 'scope-policy', source: 'SCOPE' });
  });

  it('ถ้าไม่มี policy ที่ตั้งค่าไว้ ต้องคืนกะมาตรฐานเดียวกับ Attendance default', async () => {
    const { service } = build();

    const result = await service.getMyEffectiveShiftCalendar(currentUser, {
      year: 2026,
      month: 8,
    });

    expect(result.days[0]?.shift).toMatchObject({
      code: 'DEFAULT_ATTENDANCE_POLICY',
      source: 'DEFAULT',
      morningCheckInDeadline: '08:00',
      afternoonCheckInDeadline: '13:00',
      checkoutAllowedFrom: '17:00',
    });
  });
});
