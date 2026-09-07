import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { requestTypeSchema } from '@/features/requests/requests.types';
import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * จอทีมส่วนที่ลึกกว่าหน้าสรุป — รายชื่อ ปฏิทิน ประวัติเวลา และคำขอของทีม
 *
 * แยกไฟล์จาก team.ts (หน้าสรุป) เพราะจอสรุปโหลดทุกครั้งที่หัวหน้าเปิดแอป
 * ส่วนพวกนี้เปิดเมื่อจะเจาะดูจริง ๆ การรวมไฟล์เดียวแปลว่า schema ที่ไม่ได้ใช้
 * ถูกโหลดตั้งแต่แรกเสมอ
 *
 * ทุกตัวอ่านอย่างเดียวและ backend กรองขอบเขตทีมให้แล้ว — แอปไม่ต้อง (และ
 * ต้องไม่) กรองซ้ำ เพราะการกรองฝั่ง client คือการยอมรับว่าข้อมูลถูกส่งมาแล้ว
 */

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

/** ไม่ retry เมื่อ backend ตอบ 4xx — สิทธิ์ไม่พอหรือ id ผิด ลองใหม่ก็ได้ผลเดิม */
const retry = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) {
    return false;
  }

  return failureCount < 2;
};

const pageMeta = z.object({
  hasMore: z.boolean().default(false),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  total: z.coerce.number().optional(),
  totalPages: z.coerce.number().optional(),
});

/* ------------------------------------------------------------- รายชื่อทีม */

export const teamMemberListItemSchema = z.object({
  branch: z.string().nullish(),
  department: z.string().nullish(),
  employeeCode: z.string().nullish(),
  id: z.string(),
  name: z.string().nullish(),
  position: z.string().nullish(),
  status: z.string().nullish(),
});

export type TeamMemberListItem = z.infer<typeof teamMemberListItemSchema>;

const teamMembersSchema = z.object({
  items: z.array(teamMemberListItemSchema).default([]),
  meta: pageMeta,
});

export interface TeamMemberFilters {
  search?: string;
  status?: string;
}

async function fetchTeamMembers(filters: TeamMemberFilters, page: number) {
  const search = new URLSearchParams({ page: String(page), pageSize: '20' });

  if (filters.search?.trim()) search.set('search', filters.search.trim());
  if (filters.status) search.set('status', filters.status);

  return parse(
    teamMembersSchema,
    await apiClient.get<unknown>(`/mobile/v1/team/members?${search.toString()}`),
  );
}

export function useTeamMembers(filters: TeamMemberFilters, enabled = true) {
  return useInfiniteQuery({
    enabled,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchTeamMembers(filters, pageParam),
    queryKey: queryKeys.teamMembers(filters),
    retry,
    staleTime: 60_000,
  });
}

/* --------------------------------------------------- รายละเอียดสมาชิกรายคน */

const leaveBalanceSchema = z.object({
  code: z.string().nullish(),
  entitlementDays: z.coerce.number().default(0),
  leaveTypeId: z.string().nullish(),
  name: z.string().nullish(),
  remainingDays: z.coerce.number().default(0),
  usedDays: z.coerce.number().default(0),
});

const monthTotalsSchema = z.object({
  absentDays: z.coerce.number().default(0),
  attendanceRate: z.coerce.number().default(0),
  lateDays: z.coerce.number().default(0),
  lateMinutes: z.coerce.number().default(0),
  leaveDays: z.coerce.number().default(0),
  missingDays: z.coerce.number().default(0),
  otHours: z.coerce.number().default(0),
});

export const teamMemberDetailSchema = z.object({
  date: z.string().nullish(),
  holidayName: z.string().nullish(),
  leaveBalances: z.array(leaveBalanceSchema).default([]),
  month: z.string().nullish(),
  monthTotals: monthTotalsSchema,
  pendingRequests: z.coerce.number().default(0),
  previousMonthTotals: z.object({
    absentDays: z.coerce.number().default(0),
    lateDays: z.coerce.number().default(0),
    lateMinutes: z.coerce.number().default(0),
    missingDays: z.coerce.number().default(0),
    otHours: z.coerce.number().default(0),
  }),
  profile: z.object({
    branch: z.string().nullish(),
    department: z.string().nullish(),
    email: z.string().nullish(),
    employeeCode: z.string().nullish(),
    employeeType: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
    phone: z.string().nullish(),
    position: z.string().nullish(),
    startDate: z.coerce.date().nullish(),
    status: z.string().nullish(),
    supervisor: z.string().nullish(),
  }),
  shift: z
    .object({
      afternoonDeadline: z.string().nullish(),
      checkoutFrom: z.string().nullish(),
      morningDeadline: z.string().nullish(),
      name: z.string().nullish(),
    })
    .nullish(),
  today: z.object({
    afternoonInAt: z.coerce.date().nullish(),
    checkOutAt: z.coerce.date().nullish(),
    hasMissingLog: z.boolean().default(false),
    isOverdue: z.boolean().default(false),
    lateMinutes: z.coerce.number().default(0),
    morningInAt: z.coerce.date().nullish(),
    otMinutes: z.coerce.number().default(0),
    status: z.string().default('NOT_CHECKED_IN'),
  }),
});

export type TeamMemberDetail = z.infer<typeof teamMemberDetailSchema>;

export function useTeamMember(employeeId: string | null, month?: string) {
  return useQuery({
    enabled: Boolean(employeeId),
    queryFn: async () =>
      parse(
        teamMemberDetailSchema,
        await apiClient.get<unknown>(
          `/mobile/v1/team/members/${encodeURIComponent(employeeId ?? '')}${
            month ? `?month=${month}` : ''
          }`,
        ),
      ),
    queryKey: queryKeys.teamMember(employeeId ?? '', month),
    retry,
    staleTime: 30_000,
  });
}

/* ---------------------------------------------------------- ปฏิทินของทีม */

export const teamCalendarDaySchema = z.object({
  awayTotal: z.coerce.number().default(0),
  date: z.string().nullish(),
  holidayName: z.string().nullish(),
  isHoliday: z.boolean().default(false),
  leaves: z
    .array(
      z.object({
        employeeId: z.string().nullish(),
        leaveType: z.string().nullish(),
        name: z.string().nullish(),
        status: z.string().nullish(),
      }),
    )
    .default([]),
  offsites: z
    .array(
      z.object({
        employeeId: z.string().nullish(),
        locationName: z.string().nullish(),
        name: z.string().nullish(),
      }),
    )
    .default([]),
  weekday: z.coerce.number().default(0),
});

export type TeamCalendarDay = z.infer<typeof teamCalendarDaySchema>;

const teamCalendarSchema = z.object({
  days: z.array(teamCalendarDaySchema).default([]),
  month: z.string().nullish(),
  teamTotal: z.coerce.number().default(0),
});

export type TeamCalendar = z.infer<typeof teamCalendarSchema>;

export function useTeamCalendar(month?: string, enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () =>
      parse(
        teamCalendarSchema,
        await apiClient.get<unknown>(
          `/mobile/v1/team/calendar${month ? `?month=${month}` : ''}`,
        ),
      ),
    queryKey: queryKeys.teamCalendar(month),
    retry,
    /* ปฏิทินเปลี่ยนเมื่อมีการอนุมัติใบลา ไม่ใช่ทุกนาที */
    staleTime: 120_000,
  });
}

/* ------------------------------------------------------ ประวัติเวลาของทีม */

export const teamAttendanceLogSchema = z.object({
  channel: z.string().nullish(),
  employeeCode: z.string().nullish(),
  employeeId: z.string().nullish(),
  employeeName: z.string().nullish(),
  id: z.string(),
  isOffsite: z.boolean().default(false),
  locationName: z.string().nullish(),
  logTime: z.coerce.date().nullish(),
  logType: z.string().nullish(),
  note: z.string().nullish(),
  session: z.string().nullish(),
  status: z.string().nullish(),
  workDate: z.string().nullish(),
});

export type TeamAttendanceLog = z.infer<typeof teamAttendanceLogSchema>;

const teamAttendanceSchema = z.object({
  items: z.array(teamAttendanceLogSchema).default([]),
  meta: pageMeta,
});

export interface TeamAttendanceFilters {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  search?: string;
  status?: string;
}

async function fetchTeamAttendance(
  filters: TeamAttendanceFilters,
  page: number,
) {
  const search = new URLSearchParams({ page: String(page), pageSize: '20' });

  if (filters.employeeId) search.set('employeeId', filters.employeeId);
  if (filters.status) search.set('status', filters.status);
  if (filters.search?.trim()) search.set('search', filters.search.trim());
  if (filters.dateFrom) search.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) search.set('dateTo', filters.dateTo);

  return parse(
    teamAttendanceSchema,
    await apiClient.get<unknown>(
      `/mobile/v1/team/attendance?${search.toString()}`,
    ),
  );
}

export function useTeamAttendance(
  filters: TeamAttendanceFilters,
  enabled = true,
) {
  return useInfiniteQuery({
    enabled,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchTeamAttendance(filters, pageParam),
    queryKey: queryKeys.teamAttendance(filters),
    retry,
    staleTime: 30_000,
  });
}

/* -------------------------------------------------------- คำขอของทั้งทีม */

export const teamRequestItemSchema = z.object({
  amountLabel: z.string().nullish(),
  employeeCode: z.string().nullish(),
  employeeId: z.string().nullish(),
  employeeName: z.string().nullish(),
  id: z.string(),
  occurredOn: z.string().nullish(),
  rangeLabel: z.string().nullish(),
  reason: z.string().nullish(),
  requestNo: z.string().nullish(),
  status: z.string(),
  submittedAt: z.coerce.date().nullish(),
  title: z.string(),
  type: requestTypeSchema,
});

export type TeamRequestItem = z.infer<typeof teamRequestItemSchema>;

const teamRequestsSchema = z.object({
  items: z.array(teamRequestItemSchema).default([]),
  meta: pageMeta,
});

export interface TeamRequestFilters {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  search?: string;
  status?: string;
  type?: string;
}

async function fetchTeamRequests(filters: TeamRequestFilters, page: number) {
  const search = new URLSearchParams({ page: String(page), pageSize: '20' });

  if (filters.type) search.set('type', filters.type);
  if (filters.employeeId) search.set('employeeId', filters.employeeId);
  if (filters.status) search.set('status', filters.status);
  if (filters.search?.trim()) search.set('search', filters.search.trim());
  if (filters.dateFrom) search.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) search.set('dateTo', filters.dateTo);

  return parse(
    teamRequestsSchema,
    await apiClient.get<unknown>(
      `/mobile/v1/team/requests?${search.toString()}`,
    ),
  );
}

export function useTeamRequests(filters: TeamRequestFilters, enabled = true) {
  return useInfiniteQuery({
    enabled,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchTeamRequests(filters, pageParam),
    queryKey: queryKeys.teamRequests(filters),
    retry,
    staleTime: 30_000,
  });
}
