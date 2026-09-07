import { matchesCron, parseCronPattern } from './cron-pattern.util';

/** เวลาท้องถิ่น — กระบวนการตั้ง TZ=Asia/Bangkok ไว้ เทสจึงเทียบเวลาไทยเหมือนของจริง */
const at = (text: string) => new Date(text);

describe('parseCronPattern', () => {
  it('ปฏิเสธ pattern ที่ช่องไม่ครบ ไม่ใช่เดาให้', () => {
    expect(() => parseCronPattern('0 2 * *')).toThrow(/5 ช่อง/);
    expect(() => parseCronPattern('0 2 * * * *')).toThrow(/5 ช่อง/);
  });

  it('ปฏิเสธค่าที่อยู่นอกช่วงของช่องนั้น', () => {
    expect(() => parseCronPattern('60 2 * * *')).toThrow(/นอกช่วง/);
    expect(() => parseCronPattern('0 24 * * *')).toThrow(/นอกช่วง/);
    expect(() => parseCronPattern('0 2 0 * *')).toThrow(/นอกช่วง/);
    expect(() => parseCronPattern('0 2 * * 7')).toThrow(/นอกช่วง/);
  });

  it('ปฏิเสธช่วงที่กลับหัวกลับหาง', () => {
    expect(() => parseCronPattern('0 5-2 * * *')).toThrow(/นอกช่วง/);
  });

  it('ปฏิเสธก้าวที่ไม่ใช่จำนวนเต็มบวก', () => {
    expect(() => parseCronPattern('*/0 2 * * *')).toThrow(/ก้าว/);
  });

  it('อ่านรายการ ช่วง และก้าวได้', () => {
    const [minutes] = parseCronPattern('0,30 * * * *');
    expect([...minutes].sort((a, b) => a - b)).toEqual([0, 30]);

    const [everyQuarter] = parseCronPattern('*/15 * * * *');
    expect([...everyQuarter].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);

    const [, workHours] = parseCronPattern('0 9-17 * * *');
    expect(workHours.size).toBe(9);
  });
});

describe('matchesCron — ตารางที่ระบบใช้จริง', () => {
  it('สำรองข้อมูลตีสองทุกวัน', () => {
    const fields = parseCronPattern('0 2 * * *');

    expect(matchesCron(fields, at('2026-08-18T02:00:00'))).toBe(true);
    expect(matchesCron(fields, at('2026-08-19T02:00:00'))).toBe(true);
    expect(matchesCron(fields, at('2026-08-18T02:01:00'))).toBe(false);
    expect(matchesCron(fields, at('2026-08-18T03:00:00'))).toBe(false);
  });

  it('ล้าง audit log ตีสี่เฉพาะวันอาทิตย์', () => {
    const fields = parseCronPattern('0 4 * * 0');

    // 2026-08-16 เป็นวันอาทิตย์
    expect(at('2026-08-16T04:00:00').getDay()).toBe(0);
    expect(matchesCron(fields, at('2026-08-16T04:00:00'))).toBe(true);
    expect(matchesCron(fields, at('2026-08-17T04:00:00'))).toBe(false);
  });

  it('วินาทีไม่มีผล — เทียบแค่ระดับนาที', () => {
    const fields = parseCronPattern('0 2 * * *');

    expect(matchesCron(fields, at('2026-08-18T02:00:59'))).toBe(true);
  });
});

describe('matchesCron — วันที่กับวันในสัปดาห์', () => {
  /*
   * กติกา cron มาตรฐาน: ระบุมาทั้งคู่ = เข้าเงื่อนไขเมื่อช่องใดช่องหนึ่งตรง
   * ไม่ใช่ต้องตรงทั้งคู่ ข้อนี้คนเขียน cron เองพลาดกันบ่อยที่สุด
   */
  it('ระบุทั้งวันที่และวันในสัปดาห์ = ตรงช่องใดช่องหนึ่งก็พอ', () => {
    const fields = parseCronPattern('0 0 1 * 0');

    // วันที่ 1 แต่ไม่ใช่อาทิตย์ (2026-09-01 เป็นวันอังคาร)
    expect(at('2026-09-01T00:00:00').getDay()).toBe(2);
    expect(matchesCron(fields, at('2026-09-01T00:00:00'))).toBe(true);

    // อาทิตย์แต่ไม่ใช่วันที่ 1
    expect(matchesCron(fields, at('2026-08-16T00:00:00'))).toBe(true);

    // ไม่ใช่ทั้งคู่
    expect(matchesCron(fields, at('2026-08-18T00:00:00'))).toBe(false);
  });

  it('ระบุเฉพาะวันที่ = วันในสัปดาห์ไม่มีผล', () => {
    const fields = parseCronPattern('0 0 15 * *');

    expect(matchesCron(fields, at('2026-08-15T00:00:00'))).toBe(true);
    expect(matchesCron(fields, at('2026-08-16T00:00:00'))).toBe(false);
  });
});
