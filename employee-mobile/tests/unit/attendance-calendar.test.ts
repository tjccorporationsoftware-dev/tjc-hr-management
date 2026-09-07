import {
  buildCalendar,
  collectStampsBySlot,
  daysBetween,
  formatShortDate,
  daysInMonth,
  formatMinutes,
  monthOf,
  resolveStampSlot,
  resolveTodayStamps,
  shiftMonth,
  todayKey,
  weekOf,
} from '@/features/attendance/calendar';
import type { AttendanceDay } from '@/features/attendance/history.types';

/**
 * ปฏิทินทั้งไฟล์ทำงานบนสตริง YYYY-MM-DD ไม่แตะ Date object
 * เทสชุดนี้จึงคุมสองอย่าง: เลขวันถูก และวันไม่เลื่อนตามโซนเวลาเครื่อง
 */

const day = (workDate: string, overrides: Partial<AttendanceDay> = {}) =>
  ({
    afternoonInAt: null,
    checkOutAt: null,
    deductionAmount: 0,
    earlyCheckoutMinutes: 0,
    lateMinutes: 0,
    leaveIsPaid: null,
    leaveTypeName: null,
    morningInAt: null,
    otMinutes: 0,
    state: 'PRESENT',
    workDate,
    ...overrides,
  }) as AttendanceDay;

describe('daysInMonth', () => {
  it('นับวันได้ถูกทุกความยาวเดือน รวมปีอธิกสุรทิน', () => {
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-04')).toBe(30);
  });

  it('รูปแบบผิดต้องได้ศูนย์ ไม่ใช่ NaN ที่ทำให้ลูปวนไม่รู้จบ', () => {
    expect(daysInMonth('2026-13')).toBe(0);
    expect(daysInMonth('สิงหาคม')).toBe(0);
  });
});

describe('shiftMonth', () => {
  it('เลื่อนข้ามปีได้ทั้งสองทาง', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('เลื่อนหลายเดือนพร้อมกันได้', () => {
    expect(shiftMonth('2026-08', -8)).toBe('2025-12');
  });

  it('รูปแบบผิดต้องคืนค่าเดิม ไม่ใช่ NaN-NaN', () => {
    expect(shiftMonth('พัง', 1)).toBe('พัง');
  });
});

describe('monthOf / todayKey', () => {
  it('ตัดเดือนออกจากวันที่ได้', () => {
    expect(monthOf('2026-08-16')).toBe('2026-08');
  });

  /* ต้องใช้เวลาท้องถิ่น ไม่ใช่ UTC ไม่งั้นหลังหนึ่งทุ่มของไทยจะข้ามไปวันพรุ่งนี้ */
  it('วันนี้ต้องอ้างอิงเวลาท้องถิ่นของเครื่อง', () => {
    expect(todayKey(new Date(2026, 7, 16, 23, 30))).toBe('2026-08-16');
    expect(todayKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('buildCalendar', () => {
  /* 1 สิงหาคม 2026 ตรงกับวันเสาร์ จึงต้องมีช่องว่างหกช่องนำหน้า */
  it('เติมช่องว่างต้นเดือนให้ตรงกับวันในสัปดาห์', () => {
    const weeks = buildCalendar('2026-08', [], '2026-08-16');

    expect(weeks[0]?.slice(0, 6).every((cell) => cell.dateKey === null)).toBe(
      true,
    );
    expect(weeks[0]?.[6]?.dayOfMonth).toBe(1);
  });

  it('ทุกแถวต้องมีเจ็ดช่องเสมอ และแถวสุดท้ายต้องเติมให้เต็ม', () => {
    for (const month of ['2026-02', '2026-08', '2028-02']) {
      const weeks = buildCalendar(month, [], '2026-08-16');

      expect(weeks.every((week) => week.length === 7)).toBe(true);
    }
  });

  it('จำนวนช่องที่เป็นวันจริงต้องเท่ากับจำนวนวันของเดือน', () => {
    const weeks = buildCalendar('2026-02', [], '2026-08-16');
    const realDays = weeks.flat().filter((cell) => cell.dateKey !== null);

    expect(realDays).toHaveLength(28);
  });

  it('จับคู่ข้อมูลเข้ากับวันที่ถูกช่อง', () => {
    const weeks = buildCalendar(
      '2026-08',
      [day('2026-08-04', { lateMinutes: 15, state: 'LATE' })],
      '2026-08-16',
    );
    const cell = weeks.flat().find((item) => item.dateKey === '2026-08-04');

    expect(cell?.day?.state).toBe('LATE');
    expect(cell?.day?.lateMinutes).toBe(15);
  });

  it('วันที่ไม่มีข้อมูลต้องเป็น null ไม่ใช่ค่าของวันอื่น', () => {
    const weeks = buildCalendar('2026-08', [day('2026-08-04')], '2026-08-16');
    const cell = weeks.flat().find((item) => item.dateKey === '2026-08-05');

    expect(cell?.day).toBeNull();
  });

  it('ทำเครื่องหมายวันนี้ได้ช่องเดียวเท่านั้น', () => {
    const weeks = buildCalendar('2026-08', [], '2026-08-16');
    const marked = weeks.flat().filter((cell) => cell.isToday);

    expect(marked).toHaveLength(1);
    expect(marked[0]?.dayOfMonth).toBe(16);
  });

  it('ดูเดือนอื่นต้องไม่มีช่องไหนถูกทำเครื่องหมายว่าวันนี้', () => {
    const weeks = buildCalendar('2026-07', [], '2026-08-16');

    expect(weeks.flat().some((cell) => cell.isToday)).toBe(false);
  });

  it('เดือนที่รูปแบบผิดต้องคืนตารางว่าง ไม่ใช่พัง', () => {
    expect(buildCalendar('2026-99', [], '2026-08-16')).toEqual([]);
  });
});

describe('formatMinutes', () => {
  it('แปลงนาทีเป็นชั่วโมงแบบอ่านง่าย', () => {
    expect(formatMinutes(45)).toBe('45 น.');
    expect(formatMinutes(60)).toBe('1 ชม.');
    expect(formatMinutes(90)).toBe('1 ชม. 30 น.');
  });

  it('ศูนย์หรือค่าที่ใช้ไม่ได้ต้องไม่แสดงเลขศูนย์ให้สับสน', () => {
    expect(formatMinutes(0)).toBe('—');
    expect(formatMinutes(-10)).toBe('—');
    expect(formatMinutes(Number.NaN)).toBe('—');
  });
});

describe('weekOf', () => {
  it('คืนเจ็ดวันเรียงจากอาทิตย์ถึงเสาร์', () => {
    /* 2026-08-18 เป็นวันอังคาร สัปดาห์จึงเริ่มที่อาทิตย์ที่ 16 */
    expect(weekOf('2026-08-18')).toEqual([
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
    ]);
  });

  it('วันอาทิตย์ต้องเป็นวันแรกของสัปดาห์ตัวเอง ไม่ใช่วันสุดท้ายของสัปดาห์ก่อน', () => {
    expect(weekOf('2026-08-16')[0]).toBe('2026-08-16');
  });

  it('สัปดาห์ที่คร่อมเดือนต้องทดเดือนและปีให้ถูก', () => {
    /* 2027-01-01 เป็นวันศุกร์ สัปดาห์จึงเริ่มที่ 2026-12-27 */
    const week = weekOf('2027-01-01');

    expect(week[0]).toBe('2026-12-27');
    expect(week[6]).toBe('2027-01-02');
  });

  it('รูปแบบวันที่ผิดต้องคืนอาร์เรย์ว่าง ไม่ใช่พัง', () => {
    expect(weekOf('2026-8-18')).toEqual([]);
    expect(weekOf('')).toEqual([]);
  });
});

describe('formatShortDate', () => {
  it('แปลงเป็นวันที่สั้นภาษาไทย', () => {
    expect(formatShortDate('2026-08-20')).toBe('20 ส.ค.');
    expect(formatShortDate('2026-01-05')).toBe('5 ม.ค.');
  });

  it('วันแรกและวันสุดท้ายของเดือนต้องไม่เลื่อนข้ามเดือน', () => {
    /* กับดักโซนเวลา: ถ้าแปลงด้วยเวลาเครื่อง วันที่ 1 จะกลายเป็นสิ้นเดือนก่อน */
    expect(formatShortDate('2026-03-01')).toBe('1 มี.ค.');
    expect(formatShortDate('2026-03-31')).toBe('31 มี.ค.');
  });

  it('ค่าที่ใช้ไม่ได้ต้องคืน null ให้ผู้เรียกซ่อนบรรทัดนั้นไป', () => {
    expect(formatShortDate(null)).toBeNull();
    expect(formatShortDate(undefined)).toBeNull();
    expect(formatShortDate('2026-8-20')).toBeNull();
    expect(formatShortDate('เมื่อวาน')).toBeNull();
  });
});

describe('daysBetween', () => {
  it('นับวันข้างหน้าเป็นบวก ข้างหลังเป็นลบ', () => {
    expect(daysBetween('2026-08-19', '2026-08-25')).toBe(6);
    expect(daysBetween('2026-08-25', '2026-08-19')).toBe(-6);
    expect(daysBetween('2026-08-19', '2026-08-19')).toBe(0);
  });

  it('ข้ามเดือนและข้ามปีต้องนับต่อเนื่อง', () => {
    expect(daysBetween('2026-08-26', '2026-09-25')).toBe(30);
    expect(daysBetween('2026-12-26', '2027-01-25')).toBe(30);
  });

  it('ปีอธิกสุรทินต้องนับ 29 ก.พ. ด้วย', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('รูปแบบไม่ถูกคืน null', () => {
    expect(daysBetween('2026-8-19', '2026-08-25')).toBeNull();
    expect(daysBetween('2026-08-19', 'พรุ่งนี้')).toBeNull();
  });
});

describe('resolveStampSlot / collectStampsBySlot', () => {
  /*
   * เคสที่พังจริงบนเครื่องผู้ใช้ (2569-08-19)
   *
   * หน้าแรกไปหา session ด้วยชื่อรหัสกฎ MORNING_IN แต่ backend เก็บเป็น MORNING
   * ทางถอยที่ใช้ตอนสรุปรายวันยังไม่ทันคำนวณจึงไม่เคยทำงาน เวลาบนจอตกไปใช้
   * "แตะครั้งแรกตามลำดับเวลา" ซึ่งหยิบรายการที่ HR กรอกมือมาแทนการแตะจริง
   */
  it('รับชื่อที่ backend เก็บจริง', () => {
    expect(resolveStampSlot('MORNING')).toBe('MORNING');
    expect(resolveStampSlot('AFTERNOON')).toBe('AFTERNOON');
    expect(resolveStampSlot('EVENING')).toBe('EVENING');
  });

  it('รับรหัสกฎแบบเก่าด้วย', () => {
    expect(resolveStampSlot('MORNING_IN')).toBe('MORNING');
    expect(resolveStampSlot('AFTERNOON_IN')).toBe('AFTERNOON');
    expect(resolveStampSlot('CHECK_OUT')).toBe('EVENING');
  });

  it('ค่าที่ไม่รู้จักหรือว่าง ต้องไม่เดา', () => {
    expect(resolveStampSlot(null)).toBeNull();
    expect(resolveStampSlot('')).toBeNull();
    expect(resolveStampSlot('OFFSITE_IN')).toBeNull();
  });

  it('แตะซ้ำรอบเดิม ต้องยึดครั้งแรก ให้ตรงกับฝั่งสรุปรายวัน', () => {
    const stamps = collectStampsBySlot([
      { logTime: new Date('2026-08-20T01:00:00.000Z'), session: 'MORNING' },
      { logTime: new Date('2026-08-20T01:20:00.000Z'), session: 'MORNING' },
      { logTime: new Date('2026-08-20T05:00:00.000Z'), session: 'AFTERNOON' },
    ]);

    expect(stamps.get('MORNING')?.toISOString()).toBe('2026-08-20T01:00:00.000Z');
    expect(stamps.get('AFTERNOON')?.toISOString()).toBe('2026-08-20T05:00:00.000Z');
    expect(stamps.get('EVENING')).toBeUndefined();
  });

  it('log ที่ไม่มี session ต้องไม่ถูกจับเข้ารอบไหน', () => {
    const stamps = collectStampsBySlot([
      { logTime: new Date('2026-08-20T00:50:00.000Z'), session: null },
      { logTime: new Date('2026-08-20T02:38:00.000Z'), session: 'MORNING' },
    ]);

    expect(stamps.get('MORNING')?.toISOString()).toBe('2026-08-20T02:38:00.000Z');
  });
});

/**
 * เวลาลงงานของวันนี้มาจากสามแหล่งที่เชื่อถือได้ไม่เท่ากัน เทสชุดนี้คุมข้อเดียว
 * ที่พังจริงบนเครื่องผู้ใช้: การลงเวลาครั้งเดียวต้องไม่โผล่สองช่อง
 */
describe('resolveTodayStamps', () => {
  const at = (iso: string) => new Date(iso);

  it('มาทำงานเฉพาะรอบบ่าย ต้องขึ้นช่องบ่ายช่องเดียว', () => {
    const stamps = resolveTodayStamps({
      logs: [
        {
          logTime: at('2026-08-24T07:34:00.000Z'),
          logType: 'CHECK_IN',
          session: null,
        },
      ],
      record: {
        afternoonInAt: at('2026-08-24T07:34:00.000Z'),
        checkOutAt: null,
        morningInAt: null,
      },
    });

    expect(stamps.morningInAt).toBeNull();
    expect(stamps.afternoonInAt?.toISOString()).toBe(
      '2026-08-24T07:34:00.000Z',
    );
  });

  it('สรุปรายวันมาก่อน session และลำดับ log', () => {
    const stamps = resolveTodayStamps({
      logs: [
        {
          logTime: at('2026-08-24T02:00:00.000Z'),
          logType: 'CHECK_IN',
          session: 'AFTERNOON',
        },
      ],
      record: { morningInAt: at('2026-08-24T01:00:00.000Z') },
    });

    expect(stamps.morningInAt?.toISOString()).toBe('2026-08-24T01:00:00.000Z');
    expect(stamps.afternoonInAt?.toISOString()).toBe(
      '2026-08-24T02:00:00.000Z',
    );
  });

  it('ไม่มีสรุปและไม่มี session ยังต้องเดาจากลำดับ log ให้', () => {
    const stamps = resolveTodayStamps({
      logs: [
        {
          logTime: at('2026-08-24T06:00:00.000Z'),
          logType: 'CHECK_OUT',
          session: null,
        },
        {
          logTime: at('2026-08-24T02:38:00.000Z'),
          logType: 'CHECK_IN',
          session: null,
        },
      ],
      record: null,
    });

    expect(stamps.morningInAt?.toISOString()).toBe('2026-08-24T02:38:00.000Z');
    expect(stamps.afternoonInAt).toBeNull();
    expect(stamps.checkOutAt?.toISOString()).toBe('2026-08-24T06:00:00.000Z');
  });

  it('ตอกครบสองรอบ ต้องแยกช่องถูก', () => {
    const stamps = resolveTodayStamps({
      logs: [
        {
          logTime: at('2026-08-24T01:00:00.000Z'),
          logType: 'CHECK_IN',
          session: null,
        },
        {
          logTime: at('2026-08-24T06:00:00.000Z'),
          logType: 'CHECK_IN',
          session: null,
        },
      ],
      record: null,
    });

    expect(stamps.morningInAt?.toISOString()).toBe('2026-08-24T01:00:00.000Z');
    expect(stamps.afternoonInAt?.toISOString()).toBe(
      '2026-08-24T06:00:00.000Z',
    );
  });
});
