import { BadRequestException } from '@nestjs/common';
import { toThaiDateOnly } from '../../../common/utils/thai-date.util';

/*
 * Date helpers for the overtime module.
 *
 * These helpers are intentionally small and pure. They are separated from the
 * main service because date parsing is used in multiple request flows such as
 * list filters, create, and update.
 */

export function parseOvertimeDateOnly(value: string | Date) {
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

const TIME_ONLY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** ระบบนี้ทำงานบนเวลาไทยทั้งหมด (ดู attendance policy timezone ที่ตั้งต้นเป็น Asia/Bangkok) */
const BANGKOK_UTC_OFFSET = '+07:00';

/**
 * แปลงเวลาเริ่ม/สิ้นสุด OT
 *
 * ฟิลด์ชื่อ startTime / endTime แต่เดิมรับเฉพาะ datetime เต็มเท่านั้น
 * ส่ง "18:00" ตามที่ชื่อฟิลด์สื่อจะได้ error "รูปแบบวันที่และเวลาไม่ถูกต้อง"
 * ตอนนี้รับ HH:mm ได้ด้วย โดยประกอบกับวันที่ทำงานของใบนั้น
 *
 * @param workDate วันที่ทำงาน ใช้เมื่อค่าที่ส่งมาเป็นเวลาอย่างเดียว
 */
export function parseOvertimeDateTime(value: string | Date, workDate?: Date) {
  if (value instanceof Date) {
    return value;
  }

  const timeOnly = TIME_ONLY.exec(value.trim());

  if (timeOnly) {
    if (!workDate) {
      throw new BadRequestException(
        'ระบุเวลาแบบ HH:mm ได้เมื่อมีวันที่ทำงานเท่านั้น',
      );
    }

    /*
     * เวลาที่ส่งมาแบบ HH:mm คือเวลาไทย ไม่ใช่ UTC
     *
     * ถ้าตีเป็น UTC ตรง ๆ เวลาที่เก็บจะเพี้ยนไป 7 ชั่วโมงเมื่อเทียบกับใบที่ส่ง
     * datetime เต็มพร้อม offset มา ระยะเวลารวมจะเท่ากันก็จริงแต่เวลาเริ่ม/สิ้นสุด
     * ที่แสดงบนใบจะไม่ตรงกัน
     */
    const datePart = workDate.toISOString().slice(0, 10);

    return new Date(
      `${datePart}T${timeOnly[1]}:${timeOnly[2]}:00${BANGKOK_UTC_OFFSET}`,
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('รูปแบบวันที่และเวลาไม่ถูกต้อง');
  }

  return date;
}

/** หนึ่งวันเป็นมิลลิวินาที ใช้ขยับเวลาเลิกงานของ OT ที่ข้ามเที่ยงคืน */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * แปลงเวลาเริ่ม-จบของ OT เป็นคู่ โดยรองรับ OT ที่ข้ามเที่ยงคืน
 * -----------------------------------------------------------------------------
 * ต้องมองสองค่านี้พร้อมกัน ไม่ใช่แปลงทีละตัว
 *
 * `parseOvertimeDateTime` ประกอบเวลาแบบ HH:mm เข้ากับ workDate เสมอ
 * OT กะดึก 18:00-06:00 จึงได้เวลาเลิกงานเป็น 06:00 ของ "วันเดียวกัน"
 * ซึ่งอยู่ก่อนเวลาเริ่ม แล้วถูกปฏิเสธว่า "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น"
 * ผลคือ OT ข้ามคืนยื่นไม่ได้เลย ทั้งที่เป็นรูปแบบที่ใช้กันปกติ
 *
 * ตัวนี้จึงขยับเวลาเลิกงานไปวันถัดไปเมื่อพบว่าย้อนกลับ — หลักการเดียวกับ
 * เส้นเวลาของกะใน attendance/utils/shift-window.util.ts
 *
 * ใช้เฉพาะเมื่อค่าที่ส่งมาเป็นเวลาอย่างเดียว (HH:mm) ถ้าผู้เรียกส่ง datetime
 * เต็มมาเองแปลว่าเขาระบุวันมาแล้ว จึงไม่ควรไปขยับให้
 */
export function parseOvertimeTimeRange(params: {
  startTime: string | Date;
  endTime: string | Date;
  workDate: Date;
}) {
  const start = parseOvertimeDateTime(params.startTime, params.workDate);
  const end = parseOvertimeDateTime(params.endTime, params.workDate);

  const endIsTimeOnly =
    typeof params.endTime === 'string' && TIME_ONLY.test(params.endTime.trim());

  if (endIsTimeOnly && end <= start) {
    return {
      startTime: start,
      endTime: new Date(end.getTime() + MS_PER_DAY),
      crossesMidnight: true,
    };
  }

  return { startTime: start, endTime: end, crossesMidnight: false };
}

/** แสดงเวลาไทยแบบ HH:mm สำหรับใส่ในข้อความแจ้งผู้ใช้ */
export function formatOvertimeTimeLabel(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}
