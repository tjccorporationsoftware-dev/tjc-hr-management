import {
  isWithinRuleWindow,
  resolveShiftWindow,
  resolveWorkDateOffset,
  toPunchShiftMinutes,
  timeStringToShiftMinutes,
  type ShiftRuleLike,
} from './shift-window.util';

/**
 * เทสต์เส้นเวลาของกะ — รองรับกะทุกรูปแบบที่แต่ละบริษัทตั้งไม่เหมือนกัน
 *
 * ประเด็นที่กันไว้: เดิมเทียบเป็น "นาทีในวัน" ล้วน กะกลางคืน 22:00-02:00
 * จึงถูกคิดเป็นกลับก่อนเวลาราว 20 ชั่วโมงแล้วหักเงิน และการตอกบัตรตอนตีสอง
 * ถูกนับเป็นวันทำงานถัดไป
 */

/** กะปกติ เข้า 08:00 พักเที่ยง ออก 17:00 */
const DAY_SHIFT: ShiftRuleLike[] = [
  { sessionCode: 'MORNING_IN', openTime: '06:00', expectedTime: '08:00', closeTime: '11:59', sortOrder: 1 },
  { sessionCode: 'AFTERNOON_IN', openTime: '12:00', expectedTime: '13:00', closeTime: '16:59', sortOrder: 2 },
  { sessionCode: 'CHECK_OUT', openTime: '16:00', expectedTime: '17:00', closeTime: '23:59', sortOrder: 3 },
];

/** กะกลางคืน เข้า 22:00 ออก 02:00 ของวันถัดไป */
const NIGHT_SHIFT: ShiftRuleLike[] = [
  { sessionCode: 'MORNING_IN', openTime: '21:00', expectedTime: '22:00', closeTime: '23:59', sortOrder: 1 },
  { sessionCode: 'CHECK_OUT', openTime: '01:00', expectedTime: '02:00', closeTime: '04:00', sortOrder: 2 },
];

/** กะ 24 ชั่วโมง เช่น รปภ. เข้า 08:00 ออก 08:00 ของวันถัดไป */
const FULL_DAY_SHIFT: ShiftRuleLike[] = [
  { sessionCode: 'MORNING_IN', openTime: '07:00', expectedTime: '08:00', closeTime: '10:00', sortOrder: 1 },
  { sessionCode: 'CHECK_OUT', openTime: '07:00', expectedTime: '08:00', closeTime: '10:00', sortOrder: 2 },
];

/** กะกลางคืนแบบแบ่งช่วง เข้า 20:00 กลับเข้ารอบสอง 01:00 ออก 05:00 */
const SPLIT_NIGHT_SHIFT: ShiftRuleLike[] = [
  { sessionCode: 'MORNING_IN', openTime: '19:00', expectedTime: '20:00', closeTime: '23:00', sortOrder: 1 },
  { sessionCode: 'AFTERNOON_IN', openTime: '00:30', expectedTime: '01:00', closeTime: '02:00', sortOrder: 2 },
  { sessionCode: 'CHECK_OUT', openTime: '04:00', expectedTime: '05:00', closeTime: '07:00', sortOrder: 3 },
];

describe('resolveShiftWindow', () => {
  it('กะปกติ ไม่ข้ามคืน', () => {
    const window = resolveShiftWindow(DAY_SHIFT);

    expect(window.anchorMinutes).toBe(6 * 60);
    expect(window.crossesMidnight).toBe(false);
  });

  it('กะกลางคืน ตรวจพบว่าข้ามคืน และเวลาเลิกงานอยู่หลังเที่ยงคืน', () => {
    const window = resolveShiftWindow(NIGHT_SHIFT);

    expect(window.anchorMinutes).toBe(21 * 60);
    expect(window.crossesMidnight).toBe(true);
    // ปิดรอบออกงาน 04:00 ของวันถัดไป = 28:00
    expect(window.endMinutes).toBe(28 * 60);
  });

  it('กะ 24 ชั่วโมง เวลาออกตรงกับเวลาเข้า ต้องเป็นวันถัดไป ไม่ใช่ 0 นาที', () => {
    const window = resolveShiftWindow(FULL_DAY_SHIFT);

    expect(window.crossesMidnight).toBe(true);
    // ปิดรอบออกงาน 10:00 ของวันถัดไป = 34:00
    expect(window.endMinutes).toBe(34 * 60);
  });

  it('กะกลางคืนแบบแบ่งช่วง เรียงลำดับเวลาได้ถูกทั้งสามรอบ', () => {
    const window = resolveShiftWindow(SPLIT_NIGHT_SHIFT);

    expect(window.anchorMinutes).toBe(19 * 60);
    expect(window.crossesMidnight).toBe(true);
    expect(window.endMinutes).toBe(31 * 60); // 07:00 ของวันถัดไป
  });

  it('ตั้งค่าเวลาไม่ครบ คืน NaN ให้ผู้เรียกถอยไปใช้วิธีเดิม แทนที่จะคำนวณผิด', () => {
    expect(resolveShiftWindow([]).anchorMinutes).toBeNaN();
    expect(resolveShiftWindow([{ sessionCode: 'MORNING_IN' }]).anchorMinutes).toBeNaN();
  });

  it('ไม่มี sortOrder ก็ยังเรียงจาก sessionCode ได้', () => {
    const window = resolveShiftWindow([
      { sessionCode: 'CHECK_OUT', openTime: '01:00', expectedTime: '02:00', closeTime: '04:00' },
      { sessionCode: 'MORNING_IN', openTime: '21:00', expectedTime: '22:00', closeTime: '23:59' },
    ]);

    expect(window.anchorMinutes).toBe(21 * 60);
    expect(window.crossesMidnight).toBe(true);
  });
});

describe('timeStringToShiftMinutes', () => {
  it('กะกลางคืน เวลาเลิกงาน 02:00 ต้องอยู่หลังเวลาเข้างาน 22:00 ไม่ใช่ก่อน', () => {
    const anchor = 21 * 60;
    const checkIn = timeStringToShiftMinutes('22:00', anchor);
    const checkOut = timeStringToShiftMinutes('02:00', anchor);

    expect(checkIn).toBe(22 * 60);
    expect(checkOut).toBe(26 * 60);
    expect(checkOut).toBeGreaterThan(checkIn);
  });

  it('กะปกติ ค่าไม่เปลี่ยนจากเดิม', () => {
    const anchor = 6 * 60;

    expect(timeStringToShiftMinutes('08:00', anchor)).toBe(8 * 60);
    expect(timeStringToShiftMinutes('17:00', anchor)).toBe(17 * 60);
  });
});

describe('toPunchShiftMinutes', () => {
  const nightAnchor = 21 * 60;

  it('ตอกออกงานตีสอง เป็นเวลาหลังเข้างาน ไม่ใช่ก่อนหน้า 20 ชั่วโมง', () => {
    expect(toPunchShiftMinutes(2 * 60 + 5, nightAnchor)).toBe(26 * 60 + 5);
  });

  it('ตอกเข้างานสาย 22:10 คิดเป็นสาย 10 นาที ไม่ใช่ทั้งวัน', () => {
    const expected = timeStringToShiftMinutes('22:00', nightAnchor);

    expect(toPunchShiftMinutes(22 * 60 + 10, nightAnchor) - expected).toBe(10);
  });

  it('มาก่อนเวลาเปิดรอบ ยังเป็นมาก่อน ไม่กลายเป็นสายเกือบ 24 ชั่วโมง', () => {
    // กะปกติเปิดรอบ 08:00 แต่มาถึง 07:30
    const anchor = 8 * 60;

    expect(toPunchShiftMinutes(7 * 60 + 30, anchor)).toBe(7 * 60 + 30);
  });

  it('กะปกติ เวลาระหว่างวันไม่เปลี่ยนค่า', () => {
    const anchor = 6 * 60;

    expect(toPunchShiftMinutes(8 * 60, anchor)).toBe(8 * 60);
    expect(toPunchShiftMinutes(17 * 60, anchor)).toBe(17 * 60);
  });
});

describe('resolveWorkDateOffset', () => {
  const nightWindow = resolveShiftWindow(NIGHT_SHIFT);
  const dayWindow = resolveShiftWindow(DAY_SHIFT);

  it('กะกลางคืน ตอก 22:05 เป็นวันทำงานวันเดียวกับปฏิทิน', () => {
    expect(resolveWorkDateOffset(22 * 60 + 5, nightWindow)).toBe(0);
  });

  it('กะกลางคืน ตอกออกงาน 02:05 เป็นวันทำงานของเมื่อวาน', () => {
    expect(resolveWorkDateOffset(2 * 60 + 5, nightWindow)).toBe(-1);
  });

  it('กะปกติ ไม่ย้ายวันไม่ว่าตอกกี่โมง', () => {
    expect(resolveWorkDateOffset(8 * 60, dayWindow)).toBe(0);
    expect(resolveWorkDateOffset(23 * 60, dayWindow)).toBe(0);
    expect(resolveWorkDateOffset(1 * 60, dayWindow)).toBe(0);
  });

  it('กะกลางคืนแบบแบ่งช่วง รอบที่ตอกตอนตีหนึ่งก็เป็นของเมื่อวาน', () => {
    const window = resolveShiftWindow(SPLIT_NIGHT_SHIFT);

    expect(resolveWorkDateOffset(20 * 60, window)).toBe(0);
    expect(resolveWorkDateOffset(1 * 60, window)).toBe(-1);
    expect(resolveWorkDateOffset(5 * 60, window)).toBe(-1);
  });
});

describe('isWithinRuleWindow', () => {
  it('ช่วงปกติภายในวันเดียว', () => {
    expect(isWithinRuleWindow(8 * 60, '06:00', '11:59')).toBe(true);
    expect(isWithinRuleWindow(13 * 60, '06:00', '11:59')).toBe(false);
  });

  it('ช่วงคร่อมเที่ยงคืน 22:00-02:00 ต้องครอบทั้งก่อนและหลังเที่ยงคืน', () => {
    expect(isWithinRuleWindow(23 * 60, '22:00', '02:00')).toBe(true);
    expect(isWithinRuleWindow(1 * 60, '22:00', '02:00')).toBe(true);
    expect(isWithinRuleWindow(12 * 60, '22:00', '02:00')).toBe(false);
  });

  it('ตรงขอบพอดี ยังอยู่ในช่วง', () => {
    expect(isWithinRuleWindow(22 * 60, '22:00', '02:00')).toBe(true);
    expect(isWithinRuleWindow(2 * 60, '22:00', '02:00')).toBe(true);
  });

  it('เวลาไม่ถูกรูปแบบ ไม่ถือว่าอยู่ในช่วง', () => {
    expect(isWithinRuleWindow(8 * 60, null, '11:59')).toBe(false);
    expect(isWithinRuleWindow(8 * 60, '25:00', '11:59')).toBe(false);
  });
});
