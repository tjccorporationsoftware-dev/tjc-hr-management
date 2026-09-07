import { z } from 'zod';

const shiftSessionSchema = z.object({
  id: z.string(),
  sessionCode: z.string(),
  label: z.string(),
  punchType: z.string(),
  openTime: z.string(),
  expectedTime: z.string(),
  closeTime: z.string(),
  requirePunch: z.boolean(),
});

export const scheduleShiftSchema = z.object({
  id: z.string(),
  code: z.string().nullish(),
  name: z.string().nullish(),
  source: z.enum(['EMPLOYEE', 'SCOPE', 'DEFAULT']),
  morningCheckInDeadline: z.string().nullish(),
  afternoonCheckInDeadline: z.string().nullish(),
  checkoutAllowedFrom: z.string().nullish(),
  sessionRules: z.array(shiftSessionSchema).default([]),
});

const attendanceLogSchema = z.object({
  id: z.string(),
  logTime: z.coerce.date(),
  logType: z.string().nullish(),
  session: z.string().nullish(),
  status: z.string().nullish(),
  locationName: z.string().nullish(),
  deviceName: z.string().nullish(),
});

const leaveRequestSchema = z.object({
  id: z.string(),
  requestNo: z.string().nullish(),
  status: z.string().nullish(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  totalDays: z.coerce.number().default(0),
  leaveTypeName: z.string().nullish(),
  reason: z.string().nullish(),
});

const overtimeRequestSchema = z.object({
  id: z.string(),
  requestNo: z.string().nullish(),
  status: z.string().nullish(),
  workDate: z.coerce.date().nullish(),
  startTime: z.coerce.date().nullish(),
  endTime: z.coerce.date().nullish(),
  requestedHours: z.coerce.number().default(0),
  reason: z.string().nullish(),
});

const timeAdjustRequestSchema = z.object({
  id: z.string(),
  requestNo: z.string().nullish(),
  status: z.string().nullish(),
  requestedLogTime: z.coerce.date().nullish(),
  requestedLogType: z.string().nullish(),
  reason: z.string().nullish(),
});

const offsiteRequestSchema = z.object({
  id: z.string(),
  requestNo: z.string().nullish(),
  status: z.string().nullish(),
  workDate: z.coerce.date().nullish(),
  locationName: z.string().nullish(),
  locationType: z.string().nullish(),
  reason: z.string().nullish(),
});

export const scheduleDaySchema = z.object({
  date: z.string(),
  dayOfMonth: z.number(),
  dayName: z.string(),
  isWeekend: z.boolean(),
  isHoliday: z.boolean(),
  holidayName: z.string().nullish(),
  status: z.string(),
  types: z.array(z.string()).default([]),
  shift: scheduleShiftSchema.nullable(),
  attendanceLogs: z.array(attendanceLogSchema).default([]),
  leaveRequests: z.array(leaveRequestSchema).default([]),
  overtimeRequests: z.array(overtimeRequestSchema).default([]),
  timeAdjustRequests: z.array(timeAdjustRequestSchema).default([]),
  offsiteRequests: z.array(offsiteRequestSchema).default([]),
});

export const scheduleSchema = z.object({
  employee: z
    .object({
      id: z.string(),
      employeeCode: z.string().nullish(),
      displayName: z.string().nullish(),
    })
    .passthrough(),
  year: z.number(),
  month: z.number(),
  period: z
    .object({
      label: z.string(),
      dateFrom: z.coerce.date(),
      dateTo: z.coerce.date(),
    })
    .passthrough(),
  summary: z.object({
    workDays: z.coerce.number().default(0),
    weekendDays: z.coerce.number().default(0),
    attendanceDays: z.coerce.number().default(0),
    leaveDays: z.coerce.number().default(0),
    overtimeDays: z.coerce.number().default(0),
    timeAdjustDays: z.coerce.number().default(0),
    offsiteDays: z.coerce.number().default(0),
  }),
  days: z.array(scheduleDaySchema).default([]),
  warning: z.string().nullish(),
});

export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;
