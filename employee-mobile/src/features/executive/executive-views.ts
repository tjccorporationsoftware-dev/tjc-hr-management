import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { runIdempotentMutation } from '@/lib/api/idempotency';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * ห้องผู้บริหารส่วนที่ลึกกว่าจอภาพรวม
 *
 * แยกไฟล์จาก executive.ts เพราะจอภาพรวมโหลดทันทีที่ผู้บริหารเปิดแอป ส่วนจอ
 * เจาะลึกเปิดเมื่อจะดูจริง — รวมไฟล์เดียวแปลว่าโหลด schema ที่ไม่ได้ใช้เสมอ
 *
 * ## ตัวกรอง
 *
 * ตัวเลือกของตัวกรอง (บริษัท/สาขา/แผนก) มาจาก backend พร้อมข้อมูล ไม่ใช่
 * hardcode ในแอป เพราะแต่ละคนเห็นขอบเขตไม่เท่ากัน ผู้บริหารระดับสาขาจะเห็น
 * เฉพาะสาขาตัวเอง การให้แอปเดารายการเองแปลว่าจะมีตัวเลือกที่กดแล้วได้ค่าว่าง
 */

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

const retry = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) {
    return false;
  }

  return failureCount < 2;
};

const groupSchema = z.object({
  count: z.coerce.number().default(0),
  id: z.string().nullish(),
  label: z.string(),
});

export type ExecutiveGroup = z.infer<typeof groupSchema>;

/* ---------------------------------------------------- ตัวชี้วัดเชิงบริหาร */

const costSchema = z.object({
  costPerHead: z.coerce.number().default(0),
  costPerHeadPrev: z.coerce.number().default(0),
  earnings: z.coerce.number().default(0),
  netPay: z.coerce.number().default(0),
  otCostShare: z.coerce.number().default(0),
  otHoursPerHead: z.coerce.number().default(0),
  otHoursPerHeadPrev: z.coerce.number().default(0),
  otPay: z.coerce.number().default(0),
});

export const executiveInsightsSchema = z.object({
  /* null เมื่อผู้ใช้ไม่มีสิทธิ์ดูข้อมูลเงินเดือน — แอปต้องซ่อนการ์ด ไม่ใช่โชว์ศูนย์ */
  cost: costSchema.nullish(),
  costVisible: z.boolean().default(false),
  departments: z
    .array(
      z.object({
        absenceRate: z.coerce.number().default(0),
        costPerHead: z.coerce.number().default(0),
        headcount: z.coerce.number().default(0),
        id: z.string().nullish(),
        label: z.string(),
        lateMinutesPerHead: z.coerce.number().default(0),
        otHoursPerHead: z.coerce.number().default(0),
        turnoverRate: z.coerce.number().default(0),
      }),
    )
    .default([]),
  discipline: z.object({
    absenceRate: z.coerce.number().default(0),
    absenceRatePrev: z.coerce.number().default(0),
    lateMinutesPerHead: z.coerce.number().default(0),
    lateMinutesPerHeadPrev: z.coerce.number().default(0),
    leaveDaysPerHead: z.coerce.number().default(0),
    leaveDaysPerHeadPrev: z.coerce.number().default(0),
    penaltyAmount: z.coerce.number().default(0),
    penaltyAmountPrev: z.coerce.number().default(0),
  }),
  generatedAt: z.string().nullish(),
  periodLabel: z.string().nullish(),
  trend: z
    .array(
      z.object({
        absenceRate: z.coerce.number().default(0),
        costPerHead: z.coerce.number().default(0),
        month: z.string(),
        otHoursPerHead: z.coerce.number().default(0),
        turnoverRate: z.coerce.number().default(0),
      }),
    )
    .default([]),
  workforce: z.object({
    avgTenureMonths: z.coerce.number().default(0),
    headcount: z.coerce.number().default(0),
    hired: z.coerce.number().default(0),
    hiredPrev: z.coerce.number().default(0),
    probationPassRate: z.coerce.number().default(0),
    resigned: z.coerce.number().default(0),
    resignedPrev: z.coerce.number().default(0),
    turnoverRate: z.coerce.number().default(0),
    turnoverRatePrev: z.coerce.number().default(0),
  }),
});

export type ExecutiveInsights = z.infer<typeof executiveInsightsSchema>;

export function useExecutiveInsights(enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () =>
      parse(
        executiveInsightsSchema,
        await apiClient.get<unknown>('/mobile/v1/executive/insights'),
      ),
    queryKey: queryKeys.executiveInsights,
    retry,
    /* ตัวชี้วัดรายเดือนไม่ขยับระหว่างวัน */
    staleTime: 300_000,
  });
}

/* -------------------------------------------------------------- กำลังคน */

export const executiveManpowerSchema = z.object({
  breakdown: z.object({
    byAge: z.array(groupSchema).default([]),
    byBranch: z.array(groupSchema).default([]),
    byCompany: z.array(groupSchema).default([]),
    byDepartment: z.array(groupSchema).default([]),
    byEmployeeType: z.array(groupSchema).default([]),
    byGender: z.array(groupSchema).default([]),
    byPosition: z.array(groupSchema).default([]),
    byStatus: z.array(groupSchema).default([]),
  }),
  filterOptions: z.object({
    branches: z.array(groupSchema).default([]),
    companies: z.array(groupSchema).default([]),
    departments: z.array(groupSchema).default([]),
    employeeTypes: z.array(groupSchema).default([]),
  }),
  metrics: z.object({
    activeEmployees: z.coerce.number().default(0),
    activeRate: z.coerce.number().default(0),
    inactiveEmployees: z.coerce.number().default(0),
    probationEmployees: z.coerce.number().default(0),
    resignedEmployees: z.coerce.number().default(0),
    totalEmployees: z.coerce.number().default(0),
  }),
});

export type ExecutiveManpower = z.infer<typeof executiveManpowerSchema>;

export interface ExecutiveFilters {
  branchId?: string;
  companyId?: string;
  departmentId?: string;
  employeeTypeId?: string;
  search?: string;
  status?: string;
}

export function useExecutiveManpower(
  filters: ExecutiveFilters,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const search = new URLSearchParams();

      if (filters.companyId) search.set('companyId', filters.companyId);
      if (filters.branchId) search.set('branchId', filters.branchId);
      if (filters.departmentId) search.set('departmentId', filters.departmentId);
      if (filters.employeeTypeId) {
        search.set('employeeTypeId', filters.employeeTypeId);
      }
      if (filters.status) search.set('status', filters.status);
      if (filters.search?.trim()) search.set('search', filters.search.trim());

      const query = search.toString();

      return parse(
        executiveManpowerSchema,
        await apiClient.get<unknown>(
          `/mobile/v1/executive/manpower${query ? `?${query}` : ''}`,
        ),
      );
    },
    queryKey: queryKeys.executiveManpower(filters),
    retry,
    staleTime: 300_000,
  });
}

/* --------------------------------------------------- เวลาวันนี้รายคน */

/**
 * ใบคำขอหนึ่งใบที่แนบมากับพนักงาน — ใช้แสดงในป๊อปอัพรายละเอียด
 *
 * `amount` เป็นวันเมื่อเป็นใบลา และเป็นชั่วโมงเมื่อเป็นใบโอที (หน่วยอ่านจาก
 * `kind` ไม่ได้แยกเป็นสองฟิลด์ เพราะใบหนึ่งเป็นได้อย่างเดียวอยู่แล้ว)
 */
export const executiveRequestSchema = z.object({
  amount: z.coerce.number().default(0),
  approvedAt: z.string().nullish(),
  /** ช่วงเวลาในวันของใบลาบางส่วน เช่น "13:00–17:00" */
  clock: z.string().nullish(),
  /** เต็มวัน/ครึ่งวัน ของใบลา หรือ วันทำงาน/วันหยุด ของใบโอที */
  detail: z.string().nullish(),
  from: z.string().nullish(),
  id: z.string(),
  kind: z.enum(['LEAVE', 'OT']),
  label: z.string(),
  reason: z.string().nullish(),
  submittedAt: z.string().nullish(),
  to: z.string().nullish(),
});

export type ExecutiveRequest = z.infer<typeof executiveRequestSchema>;

export const executiveAttendanceRowSchema = z.object({
  /** รูปโปรไฟล์ — มาจาก User ที่ผูกกับพนักงาน คนที่ยังไม่มีบัญชีจะเป็น null */
  avatarUrl: z.string().nullish(),
  branch: z.string().nullish(),
  branchId: z.string().nullish(),
  checkOutAt: z.string().nullish(),
  department: z.string().nullish(),
  departmentId: z.string().nullish(),
  employeeCode: z.string().nullish(),
  hasMissingLog: z.boolean().default(false),
  id: z.string(),
  late: z.boolean().default(false),
  lateMinutes: z.coerce.number().default(0),
  leaveType: z.string().nullish(),
  morningInAt: z.string().nullish(),
  name: z.string(),
  /** ชั่วโมงโอทีที่อนุมัติแล้วของวันนั้น (ทศนิยม) */
  otHours: z.coerce.number().default(0),
  position: z.string().nullish(),
  requests: z.array(executiveRequestSchema).default([]),
  status: z.string(),
});

export type ExecutiveAttendanceRow = z.infer<
  typeof executiveAttendanceRowSchema
>;

/** ยอดรวมของหนึ่งหน่วยงาน (แผนกหรือสาขา) — รูปร่างเดียวกันทั้งคู่ */
const attendanceUnitSchema = z.object({
  absent: z.coerce.number().default(0),
  id: z.string().nullish(),
  label: z.string(),
  late: z.coerce.number().default(0),
  leave: z.coerce.number().default(0),
  otHours: z.coerce.number().default(0),
  otPeople: z.coerce.number().default(0),
  present: z.coerce.number().default(0),
  total: z.coerce.number().default(0),
});

export type ExecutiveAttendanceUnit = z.infer<typeof attendanceUnitSchema>;

export const executiveAttendanceSchema = z.object({
  byBranch: z.array(attendanceUnitSchema).default([]),
  byDepartment: z.array(attendanceUnitSchema).default([]),
  filterOptions: z.object({
    branches: z.array(groupSchema).default([]),
    departments: z.array(groupSchema).default([]),
  }),
  generatedAt: z.string().nullish(),
  rows: z.array(executiveAttendanceRowSchema).default([]),
  summary: z.object({
    absent: z.coerce.number().default(0),
    late: z.coerce.number().default(0),
    leave: z.coerce.number().default(0),
    missingLog: z.coerce.number().default(0),
    otHours: z.coerce.number().default(0),
    otPeople: z.coerce.number().default(0),
    present: z.coerce.number().default(0),
    total: z.coerce.number().default(0),
  }),
  workDate: z.string().nullish(),
});

export type ExecutiveAttendance = z.infer<typeof executiveAttendanceSchema>;

export interface ExecutiveAttendanceFilters {
  branchId?: string;
  /** วันที่ต้องการดู (YYYY-MM-DD) — ไม่ใส่คือวันนี้ */
  date?: string;
  departmentId?: string;
  status?: string;
}

export function useExecutiveAttendanceToday(
  filters: ExecutiveAttendanceFilters,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const search = new URLSearchParams();

      if (filters.branchId) search.set('branchId', filters.branchId);
      if (filters.departmentId) search.set('departmentId', filters.departmentId);
      if (filters.status) search.set('status', filters.status);
      if (filters.date) search.set('date', filters.date);

      const query = search.toString();

      return parse(
        executiveAttendanceSchema,
        await apiClient.get<unknown>(
          `/mobile/v1/executive/attendance-today${query ? `?${query}` : ''}`,
        ),
      );
    },
    queryKey: queryKeys.executiveAttendance(filters),
    retry,
    /* สถานะวันนี้เปลี่ยนตลอดเช้า */
    staleTime: 60_000,
  });
}

/* --------------------------------------------- แนวโน้มการเข้างานย้อนหลัง */

export const executiveAttendanceTrendSchema = z.object({
  filterOptions: z.object({
    branches: z.array(groupSchema).default([]),
  }),
  points: z
    .array(
      z.object({
        absent: z.coerce.number().default(0),
        date: z.string(),
        /** จำนวนคนที่ต้องทำงานวันนั้น — 0 คือวันหยุดของทั้งองค์กร */
        expected: z.coerce.number().default(0),
        late: z.coerce.number().default(0),
        leave: z.coerce.number().default(0),
        /** จำนวนคนที่มีโอทีอนุมัติแล้วในวันนั้น */
        ot: z.coerce.number().default(0),
        present: z.coerce.number().default(0),
        rate: z.coerce.number().default(0),
        restDay: z.boolean().default(false),
      }),
    )
    .default([]),
  summary: z.object({
    averageRate: z.coerce.number().default(0),
    latestRate: z.coerce.number().default(0),
    workedDays: z.coerce.number().default(0),
  }),
});

export type ExecutiveAttendanceTrend = z.infer<
  typeof executiveAttendanceTrendSchema
>;

export type ExecutiveAttendanceTrendPoint =
  ExecutiveAttendanceTrend['points'][number];

/**
 * แนวโน้มการเข้างานย้อนหลัง — ทั้งบริษัทหรือเจาะรายบริษัทในเครือ
 *
 * `staleTime` ยาวกว่าจอ "วันนี้" เพราะวันที่ผ่านมาแล้วไม่ขยับอีก มีแต่จุด
 * สุดท้ายที่ยังเปลี่ยนระหว่างวัน
 */
export function useExecutiveAttendanceTrend(
  filters: { branchId?: string; days?: number } = {},
  enabled = true,
) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const search = new URLSearchParams();

      if (filters.branchId) search.set('branchId', filters.branchId);
      if (filters.days) search.set('days', String(filters.days));

      const query = search.toString();

      return parse(
        executiveAttendanceTrendSchema,
        await apiClient.get<unknown>(
          `/mobile/v1/executive/attendance-trend${query ? `?${query}` : ''}`,
        ),
      );
    },
    queryKey: queryKeys.executiveAttendanceTrend(filters),
    retry,
    staleTime: 180_000,
  });
}

/* ------------------------------------------------- ลา/โอทีสะสมทั้งงวด */

const periodUnitSchema = z.object({
  id: z.string().nullish(),
  label: z.string(),
  leaveHours: z.coerce.number().default(0),
  leavePeople: z.coerce.number().default(0),
  otHours: z.coerce.number().default(0),
  otPeople: z.coerce.number().default(0),
});

export type ExecutivePeriodUnit = z.infer<typeof periodUnitSchema>;

export const executivePeriodRowSchema = z.object({
  avatarUrl: z.string().nullish(),
  branch: z.string().nullish(),
  branchId: z.string().nullish(),
  department: z.string().nullish(),
  departmentId: z.string().nullish(),
  employeeCode: z.string().nullish(),
  id: z.string(),
  /** ชั่วโมงลาสะสมทั้งงวด — แปลงจากวันด้วยชั่วโมงทำงานต่อวันของบริษัทแล้ว */
  leaveHours: z.coerce.number().default(0),
  name: z.string(),
  otHours: z.coerce.number().default(0),
  position: z.string().nullish(),
  requests: z.array(executiveRequestSchema).default([]),
});

export type ExecutivePeriodRow = z.infer<typeof executivePeriodRowSchema>;

export const executiveLeaveOtPeriodSchema = z.object({
  byBranch: z.array(periodUnitSchema).default([]),
  byDepartment: z.array(periodUnitSchema).default([]),
  from: z.string().nullish(),
  generatedAt: z.string().nullish(),
  rows: z.array(executivePeriodRowSchema).default([]),
  summary: z.object({
    leaveHours: z.coerce.number().default(0),
    leavePeople: z.coerce.number().default(0),
    otHours: z.coerce.number().default(0),
    otPeople: z.coerce.number().default(0),
  }),
  to: z.string().nullish(),
});

export type ExecutiveLeaveOtPeriod = z.infer<typeof executiveLeaveOtPeriodSchema>;

export function useExecutiveLeaveOtPeriod(
  range: { from: string; to: string },
  enabled = true,
) {
  return useQuery({
    /* ไม่มีขอบเขตงวดก็ยังไม่ต้องยิง — แอปต้องรู้วันตัดงวดก่อนเสมอ */
    enabled: enabled && Boolean(range.from && range.to),
    queryFn: async () => {
      const search = new URLSearchParams({ from: range.from, to: range.to });

      return parse(
        executiveLeaveOtPeriodSchema,
        await apiClient.get<unknown>(
          `/mobile/v1/executive/leave-ot-period?${search.toString()}`,
        ),
      );
    },
    queryKey: queryKeys.executiveLeaveOtPeriod(range),
    retry,
    /* ยอดสะสมทั้งงวดขยับช้ากว่าสถานะรายวันมาก */
    staleTime: 300_000,
  });
}

/* ------------------------------------------------------------ เงินเดือน */

/** ต้นทุนค่าจ้างของหนึ่งหน่วยงานในงวดล่าสุด — ไม่มีข้อมูลรายคน */
export const executivePayrollUnitSchema = z.object({
  earnings: z.coerce.number().default(0),
  id: z.string().nullish(),
  label: z.string(),
  netPay: z.coerce.number().default(0),
  people: z.coerce.number().default(0),
});

export const executivePayrollSchema = z.object({
  availableYears: z.array(z.coerce.number()).default([]),
  composition: z.object({
    deductions: z
      .array(z.object({ amount: z.coerce.number().default(0), label: z.string() }))
      .default([]),
    earnings: z
      .array(z.object({ amount: z.coerce.number().default(0), label: z.string() }))
      .default([]),
  }),
  months: z
    .array(
      z.object({
        baseSalary: z.coerce.number().default(0),
        deductions: z.coerce.number().default(0),
        employees: z.coerce.number().default(0),
        employerCost: z.coerce.number().default(0),
        label: z.string(),
        netPay: z.coerce.number().default(0),
        otherEarnings: z.coerce.number().default(0),
        tax: z.coerce.number().default(0),
      }),
    )
    .default([]),
  totals: z.object({
    baseSalary: z.coerce.number().default(0),
    deductions: z.coerce.number().default(0),
    employerCost: z.coerce.number().default(0),
    netPay: z.coerce.number().default(0),
    otherEarnings: z.coerce.number().default(0),
    runCount: z.coerce.number().default(0),
    tax: z.coerce.number().default(0),
  }),
  /* งวดล่าสุดที่จ่ายจริง — คนละอย่างกับ `totals` ซึ่งเป็นยอดสะสมทั้งปี */
  latest: z
    .object({
      baseSalary: z.coerce.number().default(0),
      deductions: z.coerce.number().default(0),
      employees: z.coerce.number().default(0),
      employerCost: z.coerce.number().default(0),
      label: z.string().default(''),
      netPay: z.coerce.number().default(0),
      otherEarnings: z.coerce.number().default(0),
      tax: z.coerce.number().default(0),
    })
    .nullish(),
  byBranch: z.array(executivePayrollUnitSchema).default([]),
  byDepartment: z.array(executivePayrollUnitSchema).default([]),
  year: z.coerce.number().nullish(),
});

export type ExecutivePayroll = z.infer<typeof executivePayrollSchema>;

export function useExecutivePayroll(year?: number, enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () =>
      parse(
        executivePayrollSchema,
        await apiClient.get<unknown>(
          `/mobile/v1/executive/payroll${year ? `?year=${year}` : ''}`,
        ),
      ),
    queryKey: queryKeys.executivePayroll(year),
    retry,
    staleTime: 300_000,
  });
}

/* ------------------------------------------ ค่าจ้างประมาณการรายวัน */

/** ค่าจ้างของหนึ่งหน่วยงานในวันนั้น */
export const executiveDailyCostUnitSchema = z.object({
  deduction: z.coerce.number().default(0),
  id: z.string().nullish(),
  label: z.string(),
  leave: z.coerce.number().default(0),
  overtime: z.coerce.number().default(0),
  people: z.coerce.number().default(0),
  total: z.coerce.number().default(0),
  worked: z.coerce.number().default(0),
});

export const executiveDailyCostSchema = z.object({
  amounts: z.object({
    absence: z.coerce.number().default(0),
    deduction: z.coerce.number().default(0),
    late: z.coerce.number().default(0),
    leave: z.coerce.number().default(0),
    overtime: z.coerce.number().default(0),
    timePenalty: z.coerce.number().default(0),
    total: z.coerce.number().default(0),
    unpaidLeave: z.coerce.number().default(0),
    worked: z.coerce.number().default(0),
  }),
  byBranch: z.array(executiveDailyCostUnitSchema).default([]),
  byDepartment: z.array(executiveDailyCostUnitSchema).default([]),
  counts: z.object({
    absent: z.coerce.number().default(0),
    late: z.coerce.number().default(0),
    leavePaid: z.coerce.number().default(0),
    leaveUnpaid: z.coerce.number().default(0),
    overtime: z.coerce.number().default(0),
    total: z.coerce.number().default(0),
    worked: z.coerce.number().default(0),
  }),
  date: z.string().nullish(),
  employeesWithoutOtPolicy: z.coerce.number().default(0),
  employeesWithoutWage: z.coerce.number().default(0),
  lateMinutes: z.coerce.number().default(0),
  overtimeHours: z.coerce.number().default(0),
  paidDays: z.coerce.number().default(0),
  paidLeaveHours: z.coerce.number().default(0),
  salaryDivisorDays: z.coerce.number().default(30),
  unpaidLeaveHours: z.coerce.number().default(0),
  workingHoursPerDay: z.coerce.number().default(8),
});

export type ExecutiveDailyCost = z.infer<typeof executiveDailyCostSchema>;

/**
 * ค่าจ้างประมาณการของวันที่เลือก
 *
 * `staleTime` สั้นกว่าจอค่าจ้างรายปี เพราะยอดของวันนี้ขยับได้ทั้งวัน —
 * คนลงเวลาเข้า ใบลาถูกอนุมัติ โอทีถูกปิดยอด
 */
export function useExecutiveDailyCost(date?: string, enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () =>
      parse(
        executiveDailyCostSchema,
        await apiClient.get<unknown>(
          `/mobile/v1/executive/daily-cost${date ? `?date=${date}` : ''}`,
        ),
      ),
    queryKey: queryKeys.executiveDailyCost(date),
    retry,
    staleTime: 60_000,
  });
}

/* -------------------------------------------------------------- รายงาน */

export const reportCatalogItemSchema = z.object({
  code: z.string(),
  description: z.string().nullish(),
  name: z.string(),
  supportedFormats: z.array(z.string()).default([]),
});

export type ReportCatalogItem = z.infer<typeof reportCatalogItemSchema>;

const reportCatalogSchema = z.object({
  items: z.array(reportCatalogItemSchema).default([]),
});

export function useReportCatalog(enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () =>
      parse(
        reportCatalogSchema,
        await apiClient.get<unknown>('/mobile/v1/executive/reports/catalog'),
      ),
    queryKey: queryKeys.executiveReportCatalog,
    retry,
    staleTime: 600_000,
  });
}

export const reportJobSchema = z.object({
  completedAt: z.coerce.date().nullish(),
  createdAt: z.coerce.date().nullish(),
  errorMessage: z.string().nullish(),
  exportFileId: z.string().nullish(),
  id: z.string(),
  name: z.string().nullish(),
  reportCode: z.string(),
  status: z.string(),
});

export type ReportJob = z.infer<typeof reportJobSchema>;

const reportJobsSchema = z.object({
  items: z.array(reportJobSchema).default([]),
});

export function useReportJobs(enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () =>
      parse(
        reportJobsSchema,
        await apiClient.get<unknown>('/mobile/v1/executive/reports/jobs'),
      ),
    queryKey: queryKeys.executiveReportJobs,
    retry,
    /* งานที่เพิ่งสั่งเปลี่ยนสถานะเร็ว ต้องสดพอให้เห็นว่าเสร็จแล้ว */
    staleTime: 15_000,
  });
}

const createdReportSchema = z.object({
  exportFileId: z.string().nullish(),
  fileName: z.string().nullish(),
  jobId: z.string(),
});

export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      format?: string;
      params?: Record<string, unknown>;
      reportCode: string;
    }) =>
      /*
       * รายงานหนึ่งฉบับใช้เวลาสร้างนาน กดซ้ำตอนรอได้ง่ายมาก
       * idempotency key จึงจำเป็น ไม่งั้นจะได้ไฟล์ซ้ำและเสียเวลาเครื่องเปล่า
       */
      parse(
        createdReportSchema,
        await runIdempotentMutation({
          execute: (idempotencyKey) =>
            apiClient.post<unknown>('/mobile/v1/executive/reports', input, {
              idempotencyKey,
            }),
          payload: input,
          scope: `executive:report:${input.reportCode}`,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.executiveReportJobs,
      });
    },
  });
}
