import { BadRequestException } from '@nestjs/common';
import {
  parseOvertimeDateOnly,
  parseOvertimeDateTime,
  parseOvertimeTimeRange,
} from './overtime-date.util';

/**
 * ฟิลด์ชื่อ startTime / endTime เดิมรับเฉพาะ datetime เต็ม
 * ส่ง "18:00" ตามที่ชื่อฟิลด์สื่อจะได้ error ทันที
 */
describe('parseOvertimeDateTime', () => {
  const workDate = parseOvertimeDateOnly('2026-09-08');

  it('รับ datetime เต็มได้เหมือนเดิม', () => {
    const result = parseOvertimeDateTime('2026-09-08T18:00:00+07:00', workDate);
    expect(result.toISOString()).toBe('2026-09-08T11:00:00.000Z');
  });

  it('รับ HH:mm โดยตีเป็นเวลาไทย', () => {
    const result = parseOvertimeDateTime('18:00', workDate);
    // 18:00 ที่ไทย = 11:00 UTC
    expect(result.toISOString()).toBe('2026-09-08T11:00:00.000Z');
  });

  it('HH:mm ให้ผลเท่ากับ datetime เต็มที่มี offset ไทย', () => {
    expect(parseOvertimeDateTime('20:30', workDate).getTime()).toBe(
      parseOvertimeDateTime('2026-09-08T20:30:00+07:00', workDate).getTime(),
    );
  });

  it('ระยะเวลาระหว่างสองเวลาถูกต้อง', () => {
    const start = parseOvertimeDateTime('18:00', workDate);
    const end = parseOvertimeDateTime('20:30', workDate);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(2.5);
  });

  it('ส่ง HH:mm มาโดยไม่มีวันที่ทำงาน = ปฏิเสธ', () => {
    expect(() => parseOvertimeDateTime('18:00')).toThrow(BadRequestException);
  });

  it('รูปแบบที่อ่านไม่ออก = ปฏิเสธ', () => {
    expect(() => parseOvertimeDateTime('ไม่ใช่เวลา', workDate)).toThrow(
      BadRequestException,
    );
  });
});

/**
 * OT ที่ข้ามเที่ยงคืนต้องยื่นได้
 *
 * เคสที่เคยพังจริง: parseOvertimeDateTime ประกอบเวลาแบบ HH:mm เข้ากับ workDate เสมอ
 * OT กะดึก 18:00-06:00 จึงได้เวลาเลิกงานเป็น 06:00 ของวันเดียวกัน ซึ่งอยู่ก่อนเวลาเริ่ม
 * แล้วถูกปฏิเสธว่า "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น" — ยื่นไม่ได้เลย
 *
 * เป็นบั๊กชนิดเดียวกับกะข้ามคืนในโมดูลลงเวลา แต่คนละที่
 */
describe('parseOvertimeTimeRange · OT ข้ามเที่ยงคืน', () => {
  const workDate = new Date(Date.UTC(2026, 7, 10));

  function hours(range: { startTime: Date; endTime: Date }) {
    return (range.endTime.getTime() - range.startTime.getTime()) / 3_600_000;
  }

  it('OT กะดึก 18:00-06:00 ต้องได้ 12 ชั่วโมง ไม่ใช่ติดลบ', () => {
    const range = parseOvertimeTimeRange({
      startTime: '18:00',
      endTime: '06:00',
      workDate,
    });

    expect(range.crossesMidnight).toBe(true);
    expect(hours(range)).toBe(12);
    expect(range.endTime.getTime()).toBeGreaterThan(range.startTime.getTime());
  });

  it('OT ในวันเดียวกัน 09:00-19:00 ต้องไม่ถูกขยับวัน', () => {
    const range = parseOvertimeTimeRange({
      startTime: '09:00',
      endTime: '19:00',
      workDate,
    });

    expect(range.crossesMidnight).toBe(false);
    expect(hours(range)).toBe(10);
  });

  it('OT ที่จบพอดีเที่ยงคืน 20:00-00:00 ถือว่าข้ามคืน', () => {
    const range = parseOvertimeTimeRange({
      startTime: '20:00',
      endTime: '00:00',
      workDate,
    });

    expect(range.crossesMidnight).toBe(true);
    expect(hours(range)).toBe(4);
  });

  it('ส่ง datetime เต็มมาเอง ต้องไม่ถูกขยับวันให้', () => {
    // ผู้เรียกระบุวันมาแล้ว การไปขยับให้จะทำให้ได้เวลาผิดจากที่ตั้งใจ
    const range = parseOvertimeTimeRange({
      startTime: '2026-08-10T18:00:00+07:00',
      endTime: '2026-08-10T20:00:00+07:00',
      workDate,
    });

    expect(range.crossesMidnight).toBe(false);
    expect(hours(range)).toBe(2);
  });

  it('เวลาเริ่มกับเวลาจบเท่ากัน ถือว่าเต็ม 24 ชั่วโมง', () => {
    const range = parseOvertimeTimeRange({
      startTime: '08:00',
      endTime: '08:00',
      workDate,
    });

    expect(range.crossesMidnight).toBe(true);
    expect(hours(range)).toBe(24);
  });
});
