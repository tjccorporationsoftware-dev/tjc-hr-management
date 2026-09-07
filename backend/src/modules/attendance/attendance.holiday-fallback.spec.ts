import { AttendanceService } from './attendance.service';

/**
 * วันหยุดประจำสัปดาห์ต้องรู้จักทั้งสองเส้นทางการคำนวณ
 *
 * ระบบคำนวณสรุปเวลารายวันได้สองทาง
 *   1. กดคำนวณใหม่ทั้งช่วง  — เตรียมตั้งค่าวันหยุดมาใน context ล่วงหน้า
 *   2. คิวคำนวณทีละวัน      — เรียกมาโดยไม่มี context เลย
 *      (เกิดตอนแก้เวลา อนุมัติใบลา แก้นโยบาย ฯลฯ)
 *
 * เดิมทางที่สองคืน "ไม่ใช่วันหยุด" ตายตัวเมื่อไม่มี context ผลคือวันอาทิตย์
 * กลายเป็นวันทำงานที่ไม่มีใครสแกน = ขาดงาน แล้วหักเงินเต็มวัน
 *
 * เคสจริง: หลังแก้นโยบายเวลาเข้าออกงาน คิวคำนวณซ้ำทั้งงวด
 * วันอาทิตย์ 34 รายการกลายเป็นขาดงานพร้อมยอดหักคนละ 450-566 บาท
 */
type HolidayResolver = {
  resolveAttendanceHolidayInfo(
    employee: { id: string; companyId: string },
    workDate: Date,
    context: Record<string, unknown>,
  ): Promise<{ isHoliday: boolean; name: string | null; source: string | null }>;
};

const SUNDAY = new Date('2026-07-05T00:00:00.000Z');
const MONDAY = new Date('2026-07-06T00:00:00.000Z');
const EMPLOYEE = { id: 'emp-1', companyId: 'company-1' };

function buildService(overrides: {
  getEmployeeAttendanceHolidayInfo?: jest.Mock;
  resolveEmployeeAttendanceHolidayInfo?: jest.Mock;
}) {
  const service = Object.create(AttendanceService.prototype) as HolidayResolver;

  (service as any).systemSettingsService = {
    getEmployeeAttendanceHolidayInfo:
      overrides.getEmployeeAttendanceHolidayInfo ?? jest.fn(),
    resolveEmployeeAttendanceHolidayInfo:
      overrides.resolveEmployeeAttendanceHolidayInfo ?? jest.fn(),
  };

  return service;
}

/** ตั้งค่าจริงของ TJC: หยุดวันอาทิตย์ */
const holidayFromSettings = (workDate: Date) =>
  workDate.getTime() === SUNDAY.getTime()
    ? { isHoliday: true, name: 'วันอาทิตย์', source: 'WEEKLY' }
    : { isHoliday: false, name: null, source: null };

describe('วันหยุดของสรุปเวลารายวัน', () => {
  describe('เส้นทางคิว — ไม่มี context', () => {
    it('ต้องไปอ่านตั้งค่าวันหยุดเอง ไม่ใช่เหมาว่าเป็นวันทำงาน', async () => {
      const fetch = jest.fn(async (workDate: Date) => holidayFromSettings(workDate));
      const service = buildService({ getEmployeeAttendanceHolidayInfo: fetch });

      const result = await service.resolveAttendanceHolidayInfo(
        EMPLOYEE,
        SUNDAY,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(SUNDAY, EMPLOYEE);
      expect(result.isHoliday).toBe(true);
      expect(result.source).toBe('WEEKLY');
    });

    it('วันทำงานปกติต้องยังเป็นวันทำงาน', async () => {
      const fetch = jest.fn(async (workDate: Date) => holidayFromSettings(workDate));
      const service = buildService({ getEmployeeAttendanceHolidayInfo: fetch });

      const result = await service.resolveAttendanceHolidayInfo(
        EMPLOYEE,
        MONDAY,
        {},
      );

      expect(result.isHoliday).toBe(false);
    });
  });

  describe('เส้นทางคำนวณทั้งช่วง — มี context', () => {
    it('ใช้ตั้งค่าที่เตรียมมาใน context ไม่ต้องยิงถามซ้ำทุกวัน', async () => {
      const fetch = jest.fn();
      const resolve = jest.fn(() => ({
        isHoliday: true,
        name: 'วันอาทิตย์',
        source: 'WEEKLY',
      }));
      const service = buildService({
        getEmployeeAttendanceHolidayInfo: fetch,
        resolveEmployeeAttendanceHolidayInfo: resolve,
      });

      const settings = { attendanceWeeklyHolidays: ['SUN'] };
      const result = await service.resolveAttendanceHolidayInfo(EMPLOYEE, SUNDAY, {
        attendanceHolidaySettingsByCompanyId: new Map([
          [EMPLOYEE.companyId, settings],
        ]),
      });

      expect(result.isHoliday).toBe(true);
      expect(resolve).toHaveBeenCalledWith(SUNDAY, settings, EMPLOYEE);
      expect(fetch).not.toHaveBeenCalled();
    });

    /* หลายบริษัทในระบบเดียว ต้องหยิบตั้งค่าของบริษัทพนักงานคนนั้น */
    it('บริษัทของพนักงานไม่มีใน map ต้องถอยไปใช้ตั้งค่ากลางของรอบคำนวณ', async () => {
      const resolve = jest.fn(() => ({
        isHoliday: false,
        name: null,
        source: null,
      }));
      const service = buildService({ resolveEmployeeAttendanceHolidayInfo: resolve });

      const shared = { attendanceWeeklyHolidays: [] };
      await service.resolveAttendanceHolidayInfo(EMPLOYEE, SUNDAY, {
        attendanceHolidaySettingsByCompanyId: new Map([['company-other', {}]]),
        attendanceHolidaySettings: shared,
      });

      expect(resolve).toHaveBeenCalledWith(SUNDAY, shared, EMPLOYEE);
    });
  });

  /* จุดสำคัญของบั๊ก: สองเส้นทางต้องได้คำตอบเดียวกันเสมอ */
  it('ทั้งสองเส้นทางต้องตอบตรงกันสำหรับวันเดียวกัน', async () => {
    const settings = { attendanceWeeklyHolidays: ['SUN'] };
    const fromSettings = { isHoliday: true, name: 'วันอาทิตย์', source: 'WEEKLY' };

    const withContext = await buildService({
      resolveEmployeeAttendanceHolidayInfo: jest.fn(() => fromSettings),
    }).resolveAttendanceHolidayInfo(EMPLOYEE, SUNDAY, {
      attendanceHolidaySettingsByCompanyId: new Map([
        [EMPLOYEE.companyId, settings],
      ]),
    });

    const withoutContext = await buildService({
      getEmployeeAttendanceHolidayInfo: jest.fn(async () => fromSettings),
    }).resolveAttendanceHolidayInfo(EMPLOYEE, SUNDAY, {});

    expect(withoutContext.isHoliday).toBe(withContext.isHoliday);
  });
});
