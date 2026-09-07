import { leaveSlicesConflict } from './leave-overlap.util';

/**
 * กติกาใบลาซ้อนวันเดียวกัน
 *
 * เคสจริง: ใบลาเต็มวัน 2 ใบวันเดียวกันเคยอนุมัติผ่านทั้งคู่
 * โควตาหักซ้ำ และลาไม่รับค่าจ้างหักเงินซ้ำ — ด่านนี้ต้องกันให้อยู่
 * โดยไม่ไปฆ่าเคสถูกกติกา (ครึ่งเช้า+ครึ่งบ่าย / รายชั่วโมงคนละช่วง)
 */
const full = { dayType: 'FULL_DAY' };
const morning = { dayType: 'HALF_DAY_MORNING' };
const afternoon = { dayType: 'HALF_DAY_AFTERNOON' };
const hourly = (startTime: string, endTime: string) => ({
  dayType: 'HOURLY',
  startTime,
  endTime,
});

describe('leaveSlicesConflict — ต้องชน', () => {
  it('เต็มวัน ชนกับทุกอย่าง', () => {
    expect(leaveSlicesConflict(full, full)).toBe(true);
    expect(leaveSlicesConflict(full, morning)).toBe(true);
    expect(leaveSlicesConflict(full, afternoon)).toBe(true);
    expect(leaveSlicesConflict(full, hourly('15:00', '16:00'))).toBe(true);
  });

  it('ครึ่งเดียวกัน ชนกัน', () => {
    expect(leaveSlicesConflict(morning, morning)).toBe(true);
    expect(leaveSlicesConflict(afternoon, afternoon)).toBe(true);
  });

  it('รายชั่วโมงช่วงทับกัน ชน', () => {
    expect(leaveSlicesConflict(hourly('08:00', '10:00'), hourly('09:00', '11:00'))).toBe(true);
  });

  it('รายชั่วโมงช่วงเช้า ชนกับครึ่งเช้า', () => {
    expect(leaveSlicesConflict(hourly('08:00', '09:00'), morning)).toBe(true);
  });

  it('รายชั่วโมงช่วงบ่าย ชนกับครึ่งบ่าย', () => {
    expect(leaveSlicesConflict(hourly('15:00', '16:00'), afternoon)).toBe(true);
  });

  /* รายชั่วโมงไม่มีเวลา = ไม่รู้กินช่วงไหน ตีเป็นทั้งวันไว้ก่อน ปลอดภัยกว่า */
  it('รายชั่วโมงไม่มีช่วงเวลา ถือว่ากินทั้งวัน', () => {
    expect(leaveSlicesConflict(hourly('', ''), morning)).toBe(true);
    expect(
      leaveSlicesConflict({ dayType: 'HOURLY', startTime: null, endTime: null }, afternoon),
    ).toBe(true);
  });

  it('ช่วงเวลากลับด้าน (จบก่อนเริ่ม) ถือว่ากินทั้งวัน', () => {
    expect(leaveSlicesConflict(hourly('16:00', '15:00'), morning)).toBe(true);
  });

  it('ค่า dayType แปลก ๆ ตีเป็นเต็มวัน', () => {
    expect(leaveSlicesConflict({ dayType: 'WHATEVER' }, morning)).toBe(true);
    expect(leaveSlicesConflict({ dayType: null }, afternoon)).toBe(true);
  });
});

describe('leaveSlicesConflict — ต้องไม่ชน (เคสถูกกติกา)', () => {
  it('ครึ่งเช้า + ครึ่งบ่าย วันเดียวกัน', () => {
    expect(leaveSlicesConflict(morning, afternoon)).toBe(false);
    expect(leaveSlicesConflict(afternoon, morning)).toBe(false);
  });

  it('รายชั่วโมงคนละช่วง', () => {
    expect(leaveSlicesConflict(hourly('08:00', '09:00'), hourly('15:00', '16:00'))).toBe(false);
  });

  it('รายชั่วโมงช่วงบ่าย ไม่ชนครึ่งเช้า', () => {
    expect(leaveSlicesConflict(hourly('14:00', '16:00'), morning)).toBe(false);
  });

  it('รายชั่วโมงช่วงเช้า ไม่ชนครึ่งบ่าย', () => {
    expect(leaveSlicesConflict(hourly('08:00', '10:00'), afternoon)).toBe(false);
  });

  it('รายชั่วโมงต่อเนื่องพอดี (จบ 10:00 เริ่ม 10:00) ไม่ชน', () => {
    expect(leaveSlicesConflict(hourly('08:00', '10:00'), hourly('10:00', '12:00'))).toBe(false);
  });
});

/*
 * คาบ 12:00-13:00 เป็นเขตกำกวมระหว่างเช้า/บ่าย — เลือกเข้มไว้ก่อน
 * ทั้งครึ่งเช้าและครึ่งบ่ายถือว่าครอบคาบนี้ เงินหักซ้ำอันตรายกว่าเตือนเกิน
 */
describe('leaveSlicesConflict — เขตเที่ยง', () => {
  it('รายชั่วโมง 12:00-13:00 ชนทั้งครึ่งเช้าและครึ่งบ่าย', () => {
    expect(leaveSlicesConflict(hourly('12:00', '13:00'), morning)).toBe(true);
    expect(leaveSlicesConflict(hourly('12:00', '13:00'), afternoon)).toBe(true);
  });
});
