import type { AttendanceHolidayInfo } from '../../settings/system-settings.service';
import { resolveOvertimeWorkTypeFromHolidayInfo } from './overtime-work-type.util';

/**
 * ประเภทวันของใบ OT ต้องมาจากปฏิทินวันหยุด
 *
 * เดิมพนักงานเลือกเองในฟอร์ม เลือกผิดทีอัตราค่า OT ผิดทั้งใบ
 * เทสชุดนี้ล็อกการจับคู่ระหว่างผลจากปฏิทินกับประเภทวันที่จะบันทึกลงใบ
 */
describe('resolveOvertimeWorkTypeFromHolidayInfo', () => {
  const base: AttendanceHolidayInfo = {
    isHoliday: false,
    date: '2026-09-02',
    name: null,
    source: null,
  };

  it('วันทำงานปกติ ได้ WORKDAY', () => {
    expect(resolveOvertimeWorkTypeFromHolidayInfo(base).workType).toBe(
      'WORKDAY',
    );
  });

  it('วันหยุดประจำสัปดาห์ ได้ HOLIDAY', () => {
    const result = resolveOvertimeWorkTypeFromHolidayInfo({
      ...base,
      isHoliday: true,
      name: 'วันหยุดประจำสัปดาห์ (SUN)',
      source: 'WEEKLY',
    });

    expect(result.workType).toBe('HOLIDAY');
    expect(result.label).toBe('วันหยุด');
  });

  it('วันหยุดบริษัทในปฏิทิน ได้ HOLIDAY', () => {
    expect(
      resolveOvertimeWorkTypeFromHolidayInfo({
        ...base,
        isHoliday: true,
        name: 'วันหยุดประจำปีของบริษัท',
        source: 'CUSTOM',
        holidayType: 'COMPANY',
      }).workType,
    ).toBe('HOLIDAY');
  });

  it('วันหยุดนักขัตฤกษ์และวันหยุดพิเศษ ได้ SPECIAL_HOLIDAY', () => {
    expect(
      resolveOvertimeWorkTypeFromHolidayInfo({
        ...base,
        isHoliday: true,
        name: 'วันสงกรานต์',
        source: 'CUSTOM',
        holidayType: 'PUBLIC',
      }).workType,
    ).toBe('SPECIAL_HOLIDAY');

    expect(
      resolveOvertimeWorkTypeFromHolidayInfo({
        ...base,
        isHoliday: true,
        name: 'หยุดพิเศษตามประกาศบริษัท',
        source: 'CUSTOM',
        holidayType: 'SPECIAL',
      }).workType,
    ).toBe('SPECIAL_HOLIDAY');
  });

  it('วันหยุดที่ประกาศให้มาทำงาน คิดเป็น WORKDAY เพราะมีหยุดชดเชยแทน', () => {
    const result = resolveOvertimeWorkTypeFromHolidayInfo({
      ...base,
      isHoliday: false,
      isWorkingHoliday: true,
      name: 'ทำงานในวันหยุด',
      source: 'WORK_OVERRIDE',
      baseHoliday: {
        isHoliday: true,
        date: '2026-09-02',
        name: 'วันหยุดประจำสัปดาห์ (SUN)',
        source: 'WEEKLY',
      },
    });

    expect(result.workType).toBe('WORKDAY');
    expect(result.holidayName).toBe('วันหยุดประจำสัปดาห์ (SUN)');
  });

  it('วันหยุดที่สลับไปเป็นวันทำงาน ได้ WORKDAY ส่วนวันที่สลับมาได้ HOLIDAY', () => {
    expect(
      resolveOvertimeWorkTypeFromHolidayInfo({
        ...base,
        isHoliday: false,
        name: 'สลับเป็นวันทำงาน',
        source: 'HOLIDAY_SWAP',
      }).workType,
    ).toBe('WORKDAY');

    expect(
      resolveOvertimeWorkTypeFromHolidayInfo({
        ...base,
        isHoliday: true,
        name: 'วันหยุดที่สลับมา',
        source: 'HOLIDAY_SWAP',
      }).workType,
    ).toBe('HOLIDAY');
  });
});
