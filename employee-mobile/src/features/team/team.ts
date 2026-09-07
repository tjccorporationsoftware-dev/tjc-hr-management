import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * ทีมของหัวหน้า — สถานะวันนี้รายคน + ยอดสะสมทั้งเดือน
 *
 * backend resolve ทีมจาก token เอง ไม่รับ managerId จาก client
 * จึงไม่มีทางส่ง id ไปดูทีมของคนอื่น
 */

export const teamStatusSchema = z
  .enum([
    'PRESENT',
    'LATE',
    'LEAVE',
    'OFFSITE',
    'ABSENT',
    'NOT_CHECKED_IN',
    'HOLIDAY',
  ])
  .catch('NOT_CHECKED_IN');

export type TeamStatus = z.infer<typeof teamStatusSchema>;

export const teamMemberSchema = z.object({
  afternoonInAt: z.coerce.date().nullish(),
  checkOutAt: z.coerce.date().nullish(),
  employeeCode: z.string().nullish(),
  employeeId: z.string().nullish(),
  hasMissingLog: z.boolean().default(false),
  lateMinutes: z.coerce.number().default(0),
  monthAbsentDays: z.coerce.number().default(0),
  monthLateDays: z.coerce.number().default(0),
  monthLateMinutes: z.coerce.number().default(0),
  monthMissingDays: z.coerce.number().default(0),
  monthOtHours: z.coerce.number().default(0),
  morningInAt: z.coerce.date().nullish(),
  name: z.string().nullish(),
  /** โอทีที่อนุมัติแล้วของวันที่กำลังดู (นาที) — คนละตัวกับ `monthOtHours` */
  otMinutes: z.coerce.number().default(0),
  pendingRequests: z.coerce.number().default(0),
  position: z.string().nullish(),
  status: teamStatusSchema,
});

export type TeamMember = z.infer<typeof teamMemberSchema>;

const counts = z.object({
  ABSENT: z.coerce.number().default(0),
  HOLIDAY: z.coerce.number().default(0),
  LATE: z.coerce.number().default(0),
  LEAVE: z.coerce.number().default(0),
  NOT_CHECKED_IN: z.coerce.number().default(0),
  OFFSITE: z.coerce.number().default(0),
  PRESENT: z.coerce.number().default(0),
  teamTotal: z.coerce.number().default(0),
});

export const teamSummarySchema = z.object({
  date: z.string().nullish(),
  holidayName: z.string().nullish(),
  members: z.array(teamMemberSchema).default([]),
  month: z.string().nullish(),
  monthTotals: z.object({
    absentDays: z.coerce.number().default(0),
    attendanceRate: z.coerce.number().default(0),
    lateDays: z.coerce.number().default(0),
    lateMinutes: z.coerce.number().default(0),
    leaveDays: z.coerce.number().default(0),
    missingDays: z.coerce.number().default(0),
    otHours: z.coerce.number().default(0),
  }),
  todayCounts: counts,
});

export type TeamSummary = z.infer<typeof teamSummarySchema>;

export const TEAM_STATUS_LABEL: Record<TeamStatus, string> = {
  ABSENT: 'ขาดงาน',
  HOLIDAY: 'วันหยุด',
  LATE: 'มาสาย',
  LEAVE: 'ลา',
  NOT_CHECKED_IN: 'ยังไม่เข้า',
  OFFSITE: 'นอกสถานที่',
  PRESENT: 'มาปกติ',
};

export interface TeamSummaryParams {
  /** วันของสถานะรายคน — ไม่ส่งคือวันนี้ */
  date?: string;
  /** เดือนของยอดสะสม — ไม่ส่งคือเดือนของวันที่เลือก */
  month?: string;
}

async function fetchTeamSummary(
  params: TeamSummaryParams,
): Promise<TeamSummary> {
  const search = new URLSearchParams();

  if (params.date) search.set('date', params.date);
  if (params.month) search.set('month', params.month);

  const query = search.toString();
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/team/summary${query ? `?${query}` : ''}`,
  );
  const result = teamSummarySchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export function useTeamSummary(params: TeamSummaryParams = {}) {
  return useQuery({
    queryFn: () => fetchTeamSummary(params),
    queryKey: queryKeys.teamSummary(params),
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    /* สถานะวันนี้เปลี่ยนตลอดเช้า ต้องสดพอที่หัวหน้าจะเชื่อได้ */
    staleTime: 30_000,
  });
}
