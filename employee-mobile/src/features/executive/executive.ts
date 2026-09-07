import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * ภาพรวมบริษัทของผู้บริหาร
 *
 * `payrollVisible` มาจาก backend ไม่ใช่จากการเดาสิทธิ์ในแอป — ผู้บริหารบางคน
 * มีสิทธิ์ดูกำลังคนแต่ไม่มีสิทธิ์ดูเงินเดือน ต้องซ่อนส่วนนั้นแทนที่จะโชว์ศูนย์
 * ซึ่งจะทำให้เข้าใจผิดว่าบริษัทไม่ได้จ่ายเงินเดือน
 */

export const executiveTrendSchema = z.object({
  employees: z.coerce.number().default(0),
  /** false = ยังไม่ได้ทำเงินเดือนเดือนนั้น ยอดศูนย์เพราะยังไม่ถึงรอบ ไม่ใช่เพราะไม่จ่าย */
  hasRun: z.boolean().default(false),
  label: z.string(),
  /** เลขเดือน 1–12 (0 = backend รุ่นเก่าที่ยังไม่ส่งมา) */
  month: z.coerce.number().default(0),
  netPay: z.coerce.number().default(0),
  otherEarnings: z.coerce.number().default(0),
});

export type ExecutiveTrendPoint = z.infer<typeof executiveTrendSchema>;

export const executiveSummarySchema = z.object({
  manpower: z.object({
    activeEmployees: z.coerce.number().default(0),
    newThisMonth: z.coerce.number().default(0),
    pendingRequests: z.coerce.number().default(0),
    probationEmployees: z.coerce.number().default(0),
    totalEmployees: z.coerce.number().default(0),
  }),
  payrollVisible: z.boolean().default(false),
  today: z.object({
    approvedOtHours: z.coerce.number().default(0),
    checkedIn: z.coerce.number().default(0),
    late: z.coerce.number().default(0),
    missingCheckIn: z.coerce.number().default(0),
    notCheckedIn: z.coerce.number().default(0),
    onLeave: z.coerce.number().default(0),
  }),
  trend: z.array(executiveTrendSchema).default([]),
  trendYear: z.coerce.number().nullable().default(null),
});

export type ExecutiveSummary = z.infer<typeof executiveSummarySchema>;

async function fetchExecutiveSummary(): Promise<ExecutiveSummary> {
  const payload = await apiClient.get<unknown>('/mobile/v1/executive/summary');
  const result = executiveSummarySchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

export function useExecutiveSummary(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: fetchExecutiveSummary,
    queryKey: queryKeys.executiveSummary,
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    /* จออ่านอย่างเดียว ตัวเลขระดับบริษัทไม่ต้องสดวินาทีต่อวินาที */
    staleTime: 60_000,
  });
}
