import { MobileAttendanceService } from './mobile-attendance.service';
import type { MobileClientContext } from '../types/mobile-context.types';

/**
 * Attendance ฝั่ง Mobile ต้องเป็น passthrough จริง ๆ
 *
 * ข้อที่พลาดง่ายที่สุดคือปล่อยให้เวลาจากเครื่องกลายเป็นเวลาที่บันทึก
 * ถ้าทำแบบนั้น พนักงานปรับนาฬิกาเครื่องแล้วลงเวลาย้อนหลังได้เลย
 */
describe('MobileAttendanceService', () => {
  const client: MobileClientContext = {
    appBuild: 100,
    appVersion: '1.0.0',
    installationId: 'install-1',
    ipAddress: '10.0.0.1',
    osVersion: '16',
    platform: 'android',
    userAgent: 'EmployeeApp/1.0.0',
  };

  const punchDto = {
    punchType: 'MORNING_IN' as const,
    client: {
      capturedAt: new Date().toISOString(),
      installationId: 'install-1',
    },
    location: {
      latitude: 15.1,
      longitude: 104.1,
      accuracyMeters: 12.4,
    },
  };

  const attendanceLog = {
    id: 'log-1',
    logTime: new Date('2026-08-03T01:01:22.000Z'),
    logType: 'CHECK_IN',
    session: 'MORNING_IN',
    status: 'NORMAL',
    locationId: 'loc-1',
    locationVerified: true,
    gpsVerificationStatus: 'VERIFIED',
    distanceFromApprovedLocationMeters: 24.3,
    isOffsite: false,
  };

  function buildService(options?: {
    beginResult?: unknown;
    punchError?: Error;
    summaries?: unknown[];
  }) {
    const attendanceService = {
      punch: jest.fn(async (_dto: Record<string, unknown>) => {
        if (options?.punchError) {
          throw options.punchError;
        }

        return attendanceLog;
      }),
      getPunchContext: jest.fn(),
      findMyDailySummaries: jest.fn(
        async (_userId: string, _query: Record<string, unknown>) => ({
          items: options?.summaries ?? [],
        }),
      ),
    };

    const idempotencyService = {
      begin: jest.fn(
        async () =>
          options?.beginResult ?? { status: 'STARTED', recordId: 'record-1' },
      ),
      complete: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
    };

    /* สองตัวนี้ใช้เฉพาะตอนขอประวัติแบบรอบเงินเดือน เทสชุดนี้ทดสอบการลงเวลา */
    const payrollSettingsService = {
      resolvePayrollCalculationSettings: jest.fn(async () => ({
        payrollCutoffDay: 25,
        payrollPeriodStartDay: 26,
      })),
    };
    const prisma = {
      employee: { findFirst: jest.fn(async () => ({ companyId: 'company-1' })) },
    };

    const service = new MobileAttendanceService(
      attendanceService as never,
      idempotencyService as never,
      payrollSettingsService as never,
      prisma as never,
    );

    return {
      attendanceService,
      idempotencyService,
      payrollSettingsService,
      prisma,
      service,
    };
  }

  it('ต้องไม่ส่งเวลาจากเครื่องไปเป็นเวลาที่บันทึก และต้องระบุ source เป็น MOBILE_APP', async () => {
    const { service, attendanceService } = buildService();

    await service.punch({
      client,
      dto: punchDto,
      idempotencyKey: 'key-1',
      userId: 'user-1',
    });

    const dto = attendanceService.punch.mock.calls[0]?.[0];

    if (!dto) {
      throw new Error('ต้องเรียก AttendanceService.punch');
    }

    expect(dto.punchedAt).toBeUndefined();
    expect(dto.source).toBe('MOBILE_APP');
    expect(dto).toMatchObject({
      latitude: 15.1,
      longitude: 104.1,
      gpsAccuracy: 12.4,
    });
  });

  it('ยิงซ้ำด้วย key เดิม ต้องคืนผลเดิมโดยไม่เรียก AttendanceService อีก', async () => {
    const { service, attendanceService } = buildService({
      beginResult: {
        status: 'REPLAY',
        responseBody: { attendanceLogId: 'log-1', status: 'RECORDED' },
      },
    });

    const result = await service.punch({
      client,
      dto: punchDto,
      idempotencyKey: 'key-1',
      userId: 'user-1',
    });

    expect(result).toEqual({ attendanceLogId: 'log-1', status: 'RECORDED' });
    expect(attendanceService.punch).not.toHaveBeenCalled();
  });

  it('บันทึกสำเร็จ ต้องปิดซอง idempotency ไว้ให้ replay ได้', async () => {
    const { service, idempotencyService } = buildService();

    const result = await service.punch({
      client,
      dto: punchDto,
      idempotencyKey: 'key-1',
      userId: 'user-1',
    });

    expect(result).toMatchObject({
      status: 'RECORDED',
      attendanceLogId: 'log-1',
      locationVerification: {
        status: 'VERIFIED',
        distanceMeters: 24.3,
      },
    });
    expect(idempotencyService.complete).toHaveBeenCalledWith(
      'record-1',
      201,
      expect.objectContaining({ attendanceLogId: 'log-1' }),
    );
  });

  describe('getHistory', () => {
    /* กุมภาพันธ์ปีอธิกสุรทินคือเดือนที่คำนวณวันสุดท้ายพลาดบ่อยที่สุด */
    it('ต้องขอช่วงวันครอบคลุมทั้งเดือน รวมวันสุดท้ายของเดือนที่มี 29-31 วัน', async () => {
      const { service, attendanceService } = buildService();

      for (const [month, expectedLastDay] of [
        ['2026-02', '2026-02-28'],
        ['2028-02', '2028-02-29'],
        ['2026-04', '2026-04-30'],
        ['2026-12', '2026-12-31'],
      ] as const) {
        await service.getHistory('user-1', { month });

        expect(attendanceService.findMyDailySummaries).toHaveBeenLastCalledWith(
          'user-1',
          expect.objectContaining({
            dateFrom: `${month}-01`,
            dateTo: expectedLastDay,
          }),
        );
      }
    });

    /* สิทธิ์ผูกกับ userId เสมอ ห้ามมีทางส่ง employeeId มาดูของคนอื่น */
    it('ต้องไม่ส่ง employeeId ต่อไปให้ service ชั้นล่าง', async () => {
      const { service, attendanceService } = buildService();

      await service.getHistory('user-1', {
        month: '2026-08',
        employeeId: 'someone-else',
      } as never);

      const query = attendanceService.findMyDailySummaries.mock.calls[0]?.[1];

      expect(query?.employeeId).toBeUndefined();
    });

    it('ต้องจัดสถานะของแต่ละวันและรวมยอดของทั้งเดือนให้ถูก', async () => {
      const { service } = buildService({
        summaries: [
          {
            workDate: new Date('2026-08-03T00:00:00.000Z'),
            totalLateMinutes: 12,
            totalDeductionAmount: '50.00',
            payableOtMinutes: 60,
          },
          {
            workDate: new Date('2026-08-04T00:00:00.000Z'),
            isAbsent: true,
            totalDeductionAmount: '500.00',
          },
          {
            workDate: new Date('2026-08-05T00:00:00.000Z'),
            hasMissingLog: true,
          },
          {
            workDate: new Date('2026-08-06T00:00:00.000Z'),
            leaveRequestId: 'leave-1',
            leaveIsPaid: true,
            leaveType: { nameTh: 'ลาป่วย' },
          },
          { workDate: new Date('2026-08-07T00:00:00.000Z') },
        ],
      });

      const result = await service.getHistory('user-1', { month: '2026-08' });

      expect(result.days.map((day) => day.state)).toEqual([
        'LATE',
        'ABSENT',
        'MISSING_LOG',
        'LEAVE',
        'PRESENT',
      ]);
      expect(result.summary).toMatchObject({
        absentDays: 1,
        lateDays: 1,
        leaveDays: 1,
        missingLogDays: 1,
        otMinutes: 60,
        presentDays: 1,
        totalDeductionAmount: 550,
        totalLateMinutes: 12,
      });
      expect(result.days[3]?.leaveTypeName).toBe('ลาป่วย');
    });

    /*
     * ขาดงานต้องมาก่อนสาย เพราะเป็นเรื่องที่กระทบเงินและต้องรีบจัดการ
     * ถ้าจัดเป็น LATE ผู้ใช้จะเลื่อนผ่านไปโดยไม่รู้ว่าโดนหักทั้งวัน
     */
    it('วันที่ทั้งขาดงานและมาสาย ต้องขึ้นเป็นขาดงาน', async () => {
      const { service } = buildService({
        summaries: [
          {
            workDate: new Date('2026-08-04T00:00:00.000Z'),
            isAbsent: true,
            totalLateMinutes: 30,
            hasMissingLog: true,
          },
        ],
      });

      const result = await service.getHistory('user-1', { month: '2026-08' });

      expect(result.days[0]?.state).toBe('ABSENT');
    });

    it('เดือนที่ยังไม่มีข้อมูล ต้องคืนรายการว่างพร้อมยอดรวมเป็นศูนย์ ไม่ใช่ error', async () => {
      const { service } = buildService({ summaries: [] });

      const result = await service.getHistory('user-1', { month: '2026-09' });

      expect(result.days).toEqual([]);
      expect(result.summary.totalDeductionAmount).toBe(0);
      expect(result.month).toBe('2026-09');
    });
  });

  it('AttendanceService ปฏิเสธ ต้องปล่อย key คืนเพื่อให้กดใหม่ได้ทันที', async () => {
    const { service, idempotencyService } = buildService({
      punchError: new Error('อยู่นอกรัศมีที่อนุญาต'),
    });

    await expect(
      service.punch({
        client,
        dto: punchDto,
        idempotencyKey: 'key-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('อยู่นอกรัศมีที่อนุญาต');

    expect(idempotencyService.release).toHaveBeenCalledWith('record-1');
    expect(idempotencyService.complete).not.toHaveBeenCalled();
  });
});
