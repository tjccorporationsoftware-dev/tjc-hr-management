import { z } from 'zod';

/**
 * Schema ของ /mobile/v1/bootstrap
 *
 * ตั้งใจ "ผ่อนปรน" กับ field ที่แอปยังไม่ใช้ (passthrough) แต่ "เข้ม" กับ
 * field ที่ตัดสินใจเรื่องสำคัญ เช่น compatibility และ featureFlags
 * เพราะ backend เพิ่ม field ใหม่ได้ตลอดโดยถือว่า backward-compatible (บทที่ 12.12)
 * ถ้าเขียน schema แบบ strict ทั้งก้อน แอปรุ่นเก่าจะพังทันทีที่ backend เพิ่ม field
 */

export const compatibilitySchema = z.object({
  latestBuild: z.number(),
  minimumBuild: z.number(),
  storeUrl: z.string().nullish(),
  updateRecommended: z.boolean(),
  updateRequired: z.boolean(),
});

export const featureFlagsSchema = z.object({
  announcements: z.boolean(),
  /* แอปรุ่นเก่าคุยกับ backend ใหม่ได้ และรุ่นใหม่คุยกับ backend เก่าได้
     จึงให้ default แทนการบังคับ — ไม่งั้นอัปเดตข้างใดข้างหนึ่งแล้วพังทันที */
  approvals: z.boolean().default(false),
  /** เข้าจอเวลาของตัวเองได้ (ประวัติ/สรุปรอบ) — ไม่ใช่สิทธิ์กดลงเวลา */
  attendance: z.boolean(),
  attendancePhotoRequired: z.boolean(),
  /* สิทธิ์กดลงเวลาจริง — optional เพราะ backend เก่ายังไม่ส่ง field นี้
     แอปจึง fallback ไปใช้ attendance ซึ่งเป็นความหมายเดิมของ flag นั้น */
  attendancePunch: z.boolean().optional(),
  complaints: z.boolean().default(false),
  documents: z.boolean().default(false),
  executive: z.boolean().default(false),
  leave: z.boolean(),
  offlinePunch: z.boolean(),
  offsite: z.boolean(),
  overtime: z.boolean(),
  payslip: z.boolean(),
  schedule: z.boolean().default(false),
  team: z.boolean().default(false),
  timeAdjust: z.boolean(),
});

export const heroStateSchema = z.enum([
  'DAY_OFF',
  'NO_SHIFT',
  'NOT_CHECKED_IN',
  'MORNING_CHECKED_IN',
  'AFTERNOON_REQUIRED',
  'AFTERNOON_CHECKED_IN',
  'CHECK_OUT_AVAILABLE',
  'COMPLETED',
  'MISSING_LOG',
  'OFFSITE_ACTIVE',
  'PENDING_SYNC',
]);

export const quickActionSchema = z.object({
  code: z.string(),
  enabled: z.boolean(),
  label: z.string(),
});

export const todaySchema = z.object({
  canCheckIn: z.boolean(),
  canCheckOut: z.boolean(),
  heroState: heroStateSchema,
  quickActions: z.array(quickActionSchema).default([]),
  timeline: z
    .array(
      z.object({
        id: z.string(),
        isOffsite: z.boolean().default(false),
        logTime: z.coerce.date(),
        logType: z.string(),
        session: z.string().nullish(),
        status: z.string(),
      }),
    )
    .default([]),
  workDate: z.coerce.date(),
});

const organizationNodeSchema = z
  .object({
    code: z.string().nullish(),
    id: z.string().nullish(),
    nameTh: z.string().nullish(),
  })
  .nullish();

export const bootstrapSchema = z.object({
  compatibility: compatibilitySchema,
  employee: z.object({
    displayName: z.string().nullish(),
    employeeCode: z.string().nullish(),
    firstName: z.string().nullish(),
    id: z.string(),
    lastName: z.string().nullish(),
    nickname: z.string().nullish(),
    positionName: z.string().nullish(),
    startDate: z.coerce.date().nullish(),
    title: z.string().nullish(),
  }),
  featureFlags: featureFlagsSchema,
  organization: z.object({
    branch: organizationNodeSchema,
    company: organizationNodeSchema,
    department: organizationNodeSchema,
    division: organizationNodeSchema,
    employeeType: organizationNodeSchema,
  }),
  permissions: z.array(z.string()).default([]),
  server: z.object({
    now: z.coerce.date(),
    timezone: z.string(),
  }),
  summary: z.object({
    leaveAvailable: z.number().default(0),
    pendingActions: z.number().default(0),
    /* additive field: optional เพื่อให้ build ใหม่คุยกับ backend เก่าได้ */
    pendingApprovals: z.number().optional(),
    pendingRequests: z.number().default(0),
    unreadNotifications: z.number().default(0),
  }),
  /** ส่วนที่ไม่ critical — backend ตอบ null ได้ถ้าดึงไม่ทัน */
  today: todaySchema.nullable(),
});

export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type BootstrapToday = z.infer<typeof todaySchema>;
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;
export type HeroState = z.infer<typeof heroStateSchema>;
