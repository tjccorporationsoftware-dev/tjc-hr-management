import { z } from 'zod';

/**
 * Schema ของ /mobile/v1/attendance/*
 *
 * ผ่อนปรนกับ field ที่แอปยังไม่ใช้เหมือน bootstrap — backend เพิ่ม field ใหม่
 * ได้ตลอดโดยถือว่า backward-compatible ถ้าเขียน strict แอปรุ่นเก่าจะพังทันที
 */

/**
 * รหัสรอบลงเวลา — ตัวที่ต้องส่งกลับไปตอนกดลงเวลา
 *
 * **ระวังชื่อฟิลด์ของ backend**: endpoint `/attendance/punch` ตั้งชื่อฟิลด์ว่า
 * `punchType` แต่ค่าที่มันเอาไปค้นคือ `sessionCode` ของรอบ (ฝั่งเว็บก็ส่ง
 * sessionCode ลงฟิลด์นี้เหมือนกัน) ส่วน `punchType` ที่ backend ส่งกลับมาใน
 * ตัวรอบเป็นคนละเรื่อง — เป็นแค่ทิศทางเข้า/ออก มีสองค่าเท่านั้น
 *
 * เคยส่งผิดเป็นตัวทิศทางแล้ว backend ตอบ 400 "ไม่พบรอบลงเวลานี้ในนโยบาย"
 * ทุกครั้งที่เป็นรอบเข้างาน (รอบออกงานบังเอิญรอด เพราะสองฟิลด์มีค่าตรงกันพอดี)
 */
export const punchTypeSchema = z.enum([
  'MORNING_IN',
  'AFTERNOON_IN',
  'CHECK_OUT',
  'OFFSITE_IN',
  'OFFSITE_OUT',
  'CUSTOM',
]);

export type PunchType = z.infer<typeof punchTypeSchema>;

/** ทิศทางของรอบ เข้าหรือออก — ไม่ใช่ตัวระบุรอบ ห้ามเอาไปส่งตอนลงเวลา */
export const punchDirectionSchema = z
  .enum(['CHECK_IN', 'CHECK_OUT'])
  .catch('CHECK_IN');

/** สาเหตุที่กดลงเวลาไม่ได้ — ค่าที่ไม่รู้จักถูกแปลงเป็น null แล้วใช้ข้อความจาก backend แทน */
export const punchReasonCodeSchema = z.enum([
  'DAY_OFF',
  'NO_ACTIVE_SHIFT',
  'PUNCH_NOT_ALLOWED_NOW',
]);

export type PunchReasonCode = z.infer<typeof punchReasonCodeSchema>;

export const punchSessionSchema = z.object({
  closeTime: z.string(),
  expectedTime: z.string(),
  label: z.string(),
  openTime: z.string(),
  punchType: punchDirectionSchema,
  /*
   * ตกกลับเป็น CUSTOM เมื่อ backend เพิ่มรหัสรอบใหม่ที่แอปรุ่นนี้ยังไม่รู้จัก
   * — ยังลงเวลาได้ ปุ่มแค่ขึ้นป้ายกลาง ๆ ว่า "ลงเวลา"
   */
  sessionCode: punchTypeSchema.catch('CUSTOM'),
});

export const geofenceLocationSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  name: z.string(),
  radiusMeters: z.coerce.number(),
});

export const punchContextSchema = z.object({
  allowed: z.boolean(),
  currentSession: punchSessionSchema.nullish(),
  holiday: z
    .object({
      holidayName: z.string().nullish(),
      isHoliday: z.boolean().default(false),
    })
    .nullish(),
  locationPolicy: z
    .object({
      location: geofenceLocationSchema.nullish(),
      required: z.boolean().default(false),
    })
    .default({ required: false }),
  photoPolicy: z
    .object({ required: z.boolean().default(false) })
    .default({ required: false }),
  policy: z
    .object({
      name: z.string().nullish(),
      timezone: z.string().nullish(),
    })
    .nullish(),
  reason: z.string().nullish(),
  /* ค่าที่แอปยังไม่รู้จักไม่ควรทำให้ทั้งจอพัง ตกลงมาเป็น null แล้วใช้ reason แทน */
  reasonCode: punchReasonCodeSchema.nullish().catch(null),
  serverNow: z.coerce.date(),
  sessionRules: z
    .array(z.object({ label: z.string(), sessionCode: z.string() }))
    .default([]),
  workDate: z.coerce.date(),
});

export type PunchContext = z.infer<typeof punchContextSchema>;
export type PunchSession = z.infer<typeof punchSessionSchema>;
export type GeofenceLocation = z.infer<typeof geofenceLocationSchema>;

export const punchResultSchema = z.object({
  attendanceLogId: z.string(),
  attendanceStatus: z.string(),
  /** ส่วนต่างนาฬิกาเครื่องกับ server เป็นวินาที ใช้เตือนเมื่อเครื่องเวลาเพี้ยน */
  clockDriftSeconds: z.number().nullish(),
  isOffsite: z.boolean().default(false),
  locationVerification: z
    .object({
      distanceMeters: z.coerce.number().nullish(),
      status: z.string().nullish(),
    })
    .nullish(),
  logType: z.string(),
  recordedAt: z.coerce.date(),
  session: z.string().nullish(),
  status: z.string(),
});

export type PunchResult = z.infer<typeof punchResultSchema>;
