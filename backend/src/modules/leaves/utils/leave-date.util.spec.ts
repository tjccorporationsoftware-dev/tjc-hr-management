import {
  DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY,
  applyLeaveRounding,
  calculateHourlyLeaveMinutes,
  calculateLeaveTotalDays,
  eachLeaveDate,
  toLeaveDateKey,
} from './leave-date.util';

/**
 * เทสต์กติกาการนับเวลาลา — เป็นตัวเลขต้นทางของยอดหักเงิน
 * ถ้าไฟล์นี้แดง แปลว่ายอดหักในสลิปกำลังจะเปลี่ยน
 */
describe('leave-date.util', () => {
  const day = DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY; // 480

  describe('applyLeaveRounding', () => {
    it('NONE คิดตามนาทีจริง (พฤติกรรมเดิมของระบบ)', () => {
      expect(applyLeaveRounding(50, 'NONE')).toBe(50);
      expect(applyLeaveRounding(1, 'NONE')).toBe(1);
      expect(applyLeaveRounding(240, 'NONE')).toBe(240);
    });

    it('HALF_HOUR_UP ปัดขึ้นทีละ 30 นาที', () => {
      expect(applyLeaveRounding(1, 'HALF_HOUR_UP')).toBe(30);
      expect(applyLeaveRounding(20, 'HALF_HOUR_UP')).toBe(30);
      expect(applyLeaveRounding(30, 'HALF_HOUR_UP')).toBe(30);
      expect(applyLeaveRounding(31, 'HALF_HOUR_UP')).toBe(60);
      expect(applyLeaveRounding(50, 'HALF_HOUR_UP')).toBe(60);
      expect(applyLeaveRounding(90, 'HALF_HOUR_UP')).toBe(90);
    });

    it('HALF_DAY_UP ปัดขึ้นทีละครึ่งวัน', () => {
      expect(applyLeaveRounding(1, 'HALF_DAY_UP')).toBe(240);
      expect(applyLeaveRounding(120, 'HALF_DAY_UP')).toBe(240);
      expect(applyLeaveRounding(240, 'HALF_DAY_UP')).toBe(240);
      expect(applyLeaveRounding(241, 'HALF_DAY_UP')).toBe(480);
    });

    it('ปัดแล้วต้องไม่เกินหนึ่งวันทำงาน', () => {
      expect(applyLeaveRounding(470, 'HALF_DAY_UP')).toBe(day);
      expect(applyLeaveRounding(475, 'HALF_HOUR_UP')).toBe(day);
    });

    it('เวลาลาเป็นศูนย์หรือค่าเพี้ยน คืน 0 ไม่ใช่ปัดขึ้น', () => {
      expect(applyLeaveRounding(0, 'HALF_HOUR_UP')).toBe(0);
      expect(applyLeaveRounding(-5, 'HALF_HOUR_UP')).toBe(0);
      expect(applyLeaveRounding(Number.NaN, 'HALF_HOUR_UP')).toBe(0);
    });

    it('รองรับบริษัทที่ตั้งชั่วโมงทำงานต่อวันไม่เท่ากับ 8', () => {
      // 9 ชม./วัน -> ครึ่งวัน = 270 นาที
      expect(applyLeaveRounding(10, 'HALF_DAY_UP', 540)).toBe(270);
      expect(applyLeaveRounding(300, 'HALF_DAY_UP', 540)).toBe(540);
    });
  });

  describe('calculateHourlyLeaveMinutes', () => {
    it('นับเฉพาะช่วงที่ทับเวลาทำงาน', () => {
      // 08:30-09:20 อยู่ในเวลางานทั้งช่วง = 50 นาที
      expect(calculateHourlyLeaveMinutes('08:30', '09:20')).toBe(50);
      // 11:30-13:30 คร่อมพักเที่ยง นับแค่ 30 + 30
      expect(calculateHourlyLeaveMinutes('11:30', '13:30')).toBe(60);
    });

    it('ปัดเศษตามโหมดของประเภทลา', () => {
      expect(calculateHourlyLeaveMinutes('08:30', '09:20', 'NONE')).toBe(50);
      expect(
        calculateHourlyLeaveMinutes('08:30', '09:20', 'HALF_HOUR_UP'),
      ).toBe(60);
      expect(calculateHourlyLeaveMinutes('08:30', '09:20', 'HALF_DAY_UP')).toBe(
        240,
      );
    });

    it('เวลาสิ้นสุดไม่มากกว่าเวลาเริ่ม ต้อง error', () => {
      expect(() => calculateHourlyLeaveMinutes('10:00', '10:00')).toThrow();
      expect(() => calculateHourlyLeaveMinutes('11:00', '09:00')).toThrow();
    });

    it('ช่วงเวลานอกเวลาทำงานทั้งหมด ต้อง error', () => {
      expect(() => calculateHourlyLeaveMinutes('18:00', '19:00')).toThrow();
    });
  });

  describe('calculateLeaveTotalDays', () => {
    const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

    it('ลาเต็มวันนับตามปฏิทินแบบรวมวันเริ่มและวันจบ', () => {
      expect(
        calculateLeaveTotalDays(
          date('2026-07-01'),
          date('2026-07-01'),
          'FULL_DAY',
        ),
      ).toBe(1);
      expect(
        calculateLeaveTotalDays(
          date('2026-07-01'),
          date('2026-07-03'),
          'FULL_DAY',
        ),
      ).toBe(3);
    });

    it('ลาครึ่งวันได้ 0.5 เสมอ', () => {
      expect(
        calculateLeaveTotalDays(
          date('2026-07-01'),
          date('2026-07-01'),
          'HALF_DAY_MORNING',
        ),
      ).toBe(0.5);
    });

    it('ลารายชั่วโมงคิดเป็นสัดส่วนของวันทำงาน', () => {
      expect(
        calculateLeaveTotalDays(
          date('2026-07-01'),
          date('2026-07-01'),
          'HOURLY',
          240,
        ),
      ).toBe(0.5);
      expect(
        calculateLeaveTotalDays(
          date('2026-07-01'),
          date('2026-07-01'),
          'HOURLY',
          120,
        ),
      ).toBe(0.25);
    });

    it('ใช้ชั่วโมงทำงานต่อวันของบริษัทเป็นตัวหาร', () => {
      // 9 ชม./วัน : ลา 270 นาที = ครึ่งวัน
      expect(
        calculateLeaveTotalDays(
          date('2026-07-01'),
          date('2026-07-01'),
          'HOURLY',
          270,
          540,
        ),
      ).toBe(0.5);
    });
  });

  /**
   * เงื่อนไข "นับวันหยุดนักขัตฤกษ์ / นับวันหยุดประจำสัปดาห์"
   * ไม่ส่ง excludedDateKeys = นับตามปฏิทินทั้งหมด (พฤติกรรมเดิมของระบบ)
   */
  describe('calculateLeaveTotalDays · ตัดวันหยุดออกจากวันลา', () => {
    const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

    // ศุกร์ 3 ก.ค. 2026 ถึง จันทร์ 6 ก.ค. 2026
    const friday = date('2026-07-03');
    const monday = date('2026-07-06');

    it('ไม่ส่งวันที่ยกเว้นมา นับตามปฏิทินเหมือนเดิม', () => {
      expect(calculateLeaveTotalDays(friday, monday, 'FULL_DAY')).toBe(4);
      expect(
        calculateLeaveTotalDays(friday, monday, 'FULL_DAY', 0, 480, null),
      ).toBe(4);
      expect(
        calculateLeaveTotalDays(friday, monday, 'FULL_DAY', 0, 480, new Set()),
      ).toBe(4);
    });

    it('ตัดเสาร์อาทิตย์ออก เหลือ 2 วัน', () => {
      const excluded = new Set(['2026-07-04', '2026-07-05']);

      expect(
        calculateLeaveTotalDays(friday, monday, 'FULL_DAY', 0, 480, excluded),
      ).toBe(2);
    });

    it('ตัดวันหยุดนักขัตฤกษ์กลางช่วงลาออกได้', () => {
      const excluded = new Set(['2026-07-04']);

      expect(
        calculateLeaveTotalDays(friday, monday, 'FULL_DAY', 0, 480, excluded),
      ).toBe(3);
    });

    it('ทั้งช่วงเป็นวันหยุด ได้ 0 วัน (service จะกันไม่ให้ยื่น)', () => {
      const excluded = new Set([
        '2026-07-03',
        '2026-07-04',
        '2026-07-05',
        '2026-07-06',
      ]);

      expect(
        calculateLeaveTotalDays(friday, monday, 'FULL_DAY', 0, 480, excluded),
      ).toBe(0);
    });

    it('วันยกเว้นที่อยู่นอกช่วงลา ไม่มีผล', () => {
      const excluded = new Set(['2026-08-01', '2026-06-30']);

      expect(
        calculateLeaveTotalDays(friday, monday, 'FULL_DAY', 0, 480, excluded),
      ).toBe(4);
    });

    it('ลาครึ่งวัน/รายชั่วโมง ไม่ถูกกระทบจากการตัดวันหยุด', () => {
      const excluded = new Set(['2026-07-03']);

      expect(
        calculateLeaveTotalDays(
          friday,
          friday,
          'HALF_DAY_MORNING',
          0,
          480,
          excluded,
        ),
      ).toBe(0.5);
      expect(
        calculateLeaveTotalDays(friday, friday, 'HOURLY', 120, 480, excluded),
      ).toBe(0.25);
    });
  });

  describe('eachLeaveDate / toLeaveDateKey', () => {
    const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

    it('ไล่วันครบทั้งช่วง รวมวันเริ่มและวันจบ', () => {
      const dates = eachLeaveDate(date('2026-07-03'), date('2026-07-06'));

      expect(dates.map(toLeaveDateKey)).toEqual([
        '2026-07-03',
        '2026-07-04',
        '2026-07-05',
        '2026-07-06',
      ]);
    });

    it('วันเดียว คืน 1 วัน', () => {
      expect(
        eachLeaveDate(date('2026-07-03'), date('2026-07-03')),
      ).toHaveLength(1);
    });

    it('วันจบก่อนวันเริ่ม คืนว่าง', () => {
      expect(eachLeaveDate(date('2026-07-06'), date('2026-07-03'))).toEqual([]);
    });
  });
});
