import {
  buildWeeklyOtCapMessage,
  evaluateWeeklyOtCap,
  resolveWeekRange,
  STATUTORY_WEEKLY_OT_HOURS,
} from './overtime-weekly-cap.util';

/**
 * เพดาน OT 36 ชั่วโมงต่อสัปดาห์ ตาม พ.ร.บ.คุ้มครองแรงงาน ม.26
 *
 * เดิมระบบไม่มีเพดานนี้เลย มีแค่ maxHoursPerDay ระดับนโยบาย
 * พนักงานจึงยื่นและถูกอนุมัติ OT เกินที่กฎหมายอนุญาตได้โดยไม่มีอะไรเตือน
 */
describe('resolveWeekRange', () => {
  it('วันพุธ ได้ช่วงอาทิตย์ถึงเสาร์ของสัปดาห์นั้น', () => {
    // 2026-08-12 เป็นวันพุธ
    const { start, end } = resolveWeekRange(new Date(Date.UTC(2026, 7, 12)));

    expect(start.toISOString().slice(0, 10)).toBe('2026-08-09'); // อาทิตย์
    expect(end.toISOString().slice(0, 10)).toBe('2026-08-15'); // เสาร์
  });

  it('วันอาทิตย์เป็นวันแรกของสัปดาห์ตัวเอง', () => {
    const { start } = resolveWeekRange(new Date(Date.UTC(2026, 7, 9)));

    expect(start.toISOString().slice(0, 10)).toBe('2026-08-09');
  });

  it('วันเสาร์เป็นวันสุดท้าย ไม่ข้ามไปสัปดาห์ถัดไป', () => {
    const { start, end } = resolveWeekRange(new Date(Date.UTC(2026, 7, 15)));

    expect(start.toISOString().slice(0, 10)).toBe('2026-08-09');
    expect(end.toISOString().slice(0, 10)).toBe('2026-08-15');
  });

  it('ช่วงคร่อมสิ้นเดือน คำนวณข้ามเดือนได้', () => {
    // 2026-09-01 เป็นวันอังคาร สัปดาห์เริ่ม 2026-08-30
    const { start } = resolveWeekRange(new Date(Date.UTC(2026, 8, 1)));

    expect(start.toISOString().slice(0, 10)).toBe('2026-08-30');
  });
});

describe('evaluateWeeklyOtCap', () => {
  it('รวมแล้วยังไม่ถึง 36 ชั่วโมง ผ่าน', () => {
    const result = evaluateWeeklyOtCap({
      existingHours: 30,
      requestedHours: 4,
    });

    expect(result.exceeded).toBe(false);
    expect(result.totalHours).toBe(34);
    expect(result.remainingHours).toBe(6);
  });

  it('รวมพอดี 36 ชั่วโมง ยังผ่าน — กฎหมายบอกว่า "ไม่เกิน"', () => {
    const result = evaluateWeeklyOtCap({
      existingHours: 30,
      requestedHours: 6,
    });

    expect(result.exceeded).toBe(false);
  });

  it('เกิน 36 ชั่วโมงแม้เพียงครึ่งชั่วโมง ต้องไม่ผ่าน', () => {
    const result = evaluateWeeklyOtCap({
      existingHours: 30,
      requestedHours: 6.5,
    });

    expect(result.exceeded).toBe(true);
    expect(result.limitHours).toBe(STATUTORY_WEEKLY_OT_HOURS);
  });

  it('บริษัทตั้งเพดานต่ำกว่ากฎหมาย ใช้ของบริษัท', () => {
    const result = evaluateWeeklyOtCap({
      existingHours: 20,
      requestedHours: 5,
      limitHours: 24,
    });

    expect(result.limitHours).toBe(24);
    expect(result.exceeded).toBe(true);
  });

  it('บริษัทตั้งเพดานสูงกว่ากฎหมาย ต้องถูกกดลงมาที่ 36', () => {
    const result = evaluateWeeklyOtCap({
      existingHours: 30,
      requestedHours: 10,
      limitHours: 60,
    });

    expect(result.limitHours).toBe(STATUTORY_WEEKLY_OT_HOURS);
    expect(result.exceeded).toBe(true);
  });

  it('ค่าติดลบหรือไม่ใช่ตัวเลข ถือเป็นศูนย์ ไม่ทำให้เพดานเพี้ยน', () => {
    const result = evaluateWeeklyOtCap({
      existingHours: -5,
      requestedHours: Number.NaN,
    });

    expect(result.totalHours).toBe(0);
    expect(result.exceeded).toBe(false);
    expect(result.remainingHours).toBe(36);
  });

  it('ใช้ชั่วโมงเกินเพดานไปแล้ว ยื่นเพิ่มได้ 0 ไม่ติดลบ', () => {
    const result = evaluateWeeklyOtCap({
      existingHours: 40,
      requestedHours: 1,
    });

    expect(result.remainingHours).toBe(0);
    expect(result.exceeded).toBe(true);
  });
});

describe('buildWeeklyOtCapMessage', () => {
  it('บอกตัวเลขครบพอให้ผู้ใช้แก้เองได้', () => {
    const message = buildWeeklyOtCapMessage(
      evaluateWeeklyOtCap({ existingHours: 34, requestedHours: 4 }),
    );

    expect(message).toContain('36');
    expect(message).toContain('มาตรา 26');
    expect(message).toContain('34');
    expect(message).toContain('38');
    expect(message).toContain('2');
  });
});
