import { BadRequestException } from '@nestjs/common';
import type { LeaveDayType } from '../types/leave.types';
import { toThaiDateOnly } from '../../../common/utils/thai-date.util';

/**
 * Leave date utilities
 * -----------------------------------------------------------------------------
 * รวม helper เกี่ยวกับวันที่ของระบบลาไว้จุดเดียว
 * เพื่อไม่ให้ logic แปลงวันที่/คำนวณจำนวนวันกระจายหลาย service
 */

/**
 * แปลง string YYYY-MM-DD หรือ Date ให้เป็น Date แบบ date-only ใน UTC
 * เหตุผลที่ใช้ UTC: ลดปัญหา timezone ทำให้วันที่เลื่อนไป/กลับ 1 วัน
 */
export function parseLeaveDateOnly(value: string | Date) {
  if (value instanceof Date) {
    // ตัดวันตามเวลาไทย ไม่ใช่เวลาเซิร์ฟเวอร์ — บน UTC จะคลาดไป 1 วันช่วง 00:00-07:00
    return toThaiDateOnly(value);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('รูปแบบวันที่ไม่ถูกต้อง');
  }

  return date;
}

export function parseLeaveTimeToMinutes(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new BadRequestException('รูปแบบเวลาไม่ถูกต้อง');
  }

  return hour * 60 + minute;
}

/**
 * โหมดปัดเศษเวลาลา — คอลัมน์ "เงื่อนไข" ในเอกสารมาตรฐานการลา
 * NONE         = คิดตามนาทีจริง (พฤติกรรมเดิมของระบบ)
 * HALF_HOUR_UP = ปัดขึ้นให้เต็มครึ่งชั่วโมง (30 นาที)
 * HALF_DAY_UP  = ปัดขึ้นให้เต็มครึ่งวัน
 */
export type LeaveRoundingMode = 'NONE' | 'HALF_HOUR_UP' | 'HALF_DAY_UP';

export const DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY = 480;

/**
 * ปัดนาทีลาขึ้นตามโหมดที่ประเภทลากำหนด
 *
 * ต้องเรียกก่อนแปลงเป็นจำนวนวันและก่อนคูณอัตราค่าจ้างเสมอ
 * ลำดับที่ถูกคือ ปัดนาที -> คูณอัตราต่อชั่วโมง -> คูณค่าปรับ
 */
export function applyLeaveRounding(
  minutes: number,
  mode: LeaveRoundingMode = 'NONE',
  workingMinutesPerDay = DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY,
) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (mode === 'NONE') return Math.round(minutes);

  const step =
    mode === 'HALF_HOUR_UP'
      ? 30
      : Math.max(Math.round(workingMinutesPerDay / 2), 1);
  const rounded = Math.ceil(minutes / step) * step;

  // ไม่ให้เกินหนึ่งวันทำงาน เช่น ลา 5 ชม. แล้วปัดครึ่งวันต้องได้เต็มวัน ไม่ใช่เกินวัน
  return Math.min(rounded, Math.round(workingMinutesPerDay));
}

export function calculateHourlyLeaveMinutes(
  startTime: string,
  endTime: string,
  roundingMode: LeaveRoundingMode = 'NONE',
  workingMinutesPerDay = DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY,
) {
  const start = parseLeaveTimeToMinutes(startTime);
  const end = parseLeaveTimeToMinutes(endTime);

  if (end <= start) {
    throw new BadRequestException('เวลาสิ้นสุดลาต้องมากกว่าเวลาเริ่มลา');
  }

  const workingMinutes = calculateWorkingLeaveMinutes(start, end);

  if (workingMinutes <= 0) {
    throw new BadRequestException(
      'ช่วงเวลาที่เลือกไม่ทับกับเวลาทำงาน จึงไม่สามารถยื่นลารายชั่วโมงได้',
    );
  }

  return applyLeaveRounding(workingMinutes, roundingMode, workingMinutesPerDay);
}

export function calculateWorkingLeaveMinutes(
  startMinutes: number,
  endMinutes: number,
  workSegments: Array<{ start: number; end: number }> = [
    { start: 8 * 60, end: 12 * 60 },
    { start: 13 * 60, end: 17 * 60 },
  ],
) {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  if (endMinutes <= startMinutes) return 0;

  return workSegments.reduce((total, segment) => {
    const segmentStart = Math.max(startMinutes, segment.start);
    const segmentEnd = Math.min(endMinutes, segment.end);

    return total + Math.max(segmentEnd - segmentStart, 0);
  }, 0);
}

/**
 * ตรวจช่วงวันลาให้ถูกต้อง
 * - วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น
 * - ถ้าลาครึ่งวัน/รายชั่วโมง ต้องเป็นวันเดียวกันเท่านั้น
 */
export function validateLeaveDateRange(
  startDate: Date,
  endDate: Date,
  dayType: LeaveDayType,
) {
  if (endDate < startDate) {
    throw new BadRequestException('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น');
  }

  if (dayType !== 'FULL_DAY' && startDate.getTime() !== endDate.getTime()) {
    throw new BadRequestException(
      'การลาครึ่งวันหรือรายชั่วโมงต้องเลือกวันเดียวกันเท่านั้น',
    );
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toLeaveDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * ไล่ทุกวันในช่วงลา (รวมวันเริ่มและวันจบ)
 */
export function eachLeaveDate(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];

  if (endDate.getTime() < startDate.getTime()) return dates;

  for (
    let time = startDate.getTime();
    time <= endDate.getTime();
    time += MS_PER_DAY
  ) {
    dates.push(new Date(time));
  }

  return dates;
}

/**
 * คำนวณจำนวนวันลา
 *
 * `excludedDateKeys` คือวันที่ไม่ถูกนับเป็นวันลา (YYYY-MM-DD)
 * มาจากเงื่อนไข "นับวันหยุดนักขัตฤกษ์ / นับวันหยุดประจำสัปดาห์" ของประเภทลา
 * ไม่ส่งมา = นับตามปฏิทินทั้งหมด ซึ่งเป็นพฤติกรรมเดิมของระบบ
 */
export function calculateLeaveTotalDays(
  startDate: Date,
  endDate: Date,
  dayType: LeaveDayType,
  totalMinutes = 0,
  workingMinutesPerDay = DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY,
  excludedDateKeys?: ReadonlySet<string> | null,
) {
  if (dayType === 'HOURLY') {
    const divisor =
      Number.isFinite(workingMinutesPerDay) && workingMinutesPerDay > 0
        ? workingMinutesPerDay
        : DEFAULT_LEAVE_WORKING_MINUTES_PER_DAY;

    return Math.round((totalMinutes / divisor) * 100) / 100;
  }

  if (dayType === 'HALF_DAY_MORNING' || dayType === 'HALF_DAY_AFTERNOON') {
    return 0.5;
  }

  const diffDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;

  if (!excludedDateKeys || excludedDateKeys.size === 0) {
    return diffDays;
  }

  const countedDays = eachLeaveDate(startDate, endDate).filter(
    (date) => !excludedDateKeys.has(toLeaveDateKey(date)),
  ).length;

  return countedDays;
}
