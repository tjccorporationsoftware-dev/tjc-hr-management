import { Prisma } from '../../../generated/prisma/client';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { tenantWhere } from '../../../common/tenant/tenant-scope.util';
import { ListLeaveRequestsQueryDto } from '../dto/list-leave-requests-query.dto';
import { parseLeaveDateOnly } from '../utils/leave-date.util';

/**
 * Leave search helper
 * -----------------------------------------------------------------------------
 * รวม logic สร้าง where สำหรับค้นหาใบลาไว้จุดเดียว
 * ทำให้ service หลัก / HR page / Approval Center ใช้ filter มาตรฐานเดียวกัน
 *
 * scope: บังคับ tenant isolation ผ่าน relation employee (Pattern B)
 * เป็น AND ที่ client widen ไม่ได้ — GLOBAL เห็นทุกบริษัท, COMPANY/BRANCH ถูกล็อก
 */
export function buildLeaveRequestWhere(
  query: ListLeaveRequestsQueryDto,
  scope: TenantScope,
): Prisma.LeaveRequestWhereInput {
  const where: Prisma.LeaveRequestWhereInput = {
    deletedAt: null,
  };

  if (query.employeeId) {
    where.employeeId = query.employeeId;
  }

  if (query.leaveTypeId) {
    where.leaveTypeId = query.leaveTypeId;
  }

  if (query.status) {
    where.status = query.status;
  } else if (query.excludeDraft && toBooleanQuery(query.excludeDraft)) {
    where.status = { not: 'DRAFT' };
  }

  const employeeFilter = buildEmployeeScopeFilter(query, scope);

  if (Object.keys(employeeFilter).length > 0) {
    where.employee = employeeFilter;
  }

  // Hard tenant boundary — cannot be widened by any client filter.
  const scopeWhere = tenantWhere(scope) as Prisma.EmployeeWhereInput;
  if (Object.keys(scopeWhere).length > 0) {
    addAnd(where, { employee: { is: scopeWhere } });
  }

  if (query.dateFrom || query.dateTo) {
    where.startDate = {};

    if (query.dateFrom) {
      where.startDate.gte = parseLeaveDateOnly(query.dateFrom);
    }

    if (query.dateTo) {
      where.startDate.lte = parseLeaveDateOnly(query.dateTo);
    }
  }

  if (query.isRetroactive) {
    where.isRetroactive = toBooleanQuery(query.isRetroactive);
  }

  if (query.requiresPayrollCorrection) {
    where.requiresPayrollCorrection = toBooleanQuery(
      query.requiresPayrollCorrection,
    );
  }

  addAttachmentFilter(where, query.attachmentStatus);
  addPayrollImpactFilter(where, query.payrollImpact);
  addAttendanceImpactFilter(where, query.attendanceImpact);
  addSearchFilter(where, query.search);

  return where;
}

function buildEmployeeScopeFilter(
  query: ListLeaveRequestsQueryDto,
  scope: TenantScope,
) {
  const employeeFilter: Prisma.EmployeeWhereInput = {};

  // Only GLOBAL may narrow by company; non-BRANCH may narrow by branch.
  if (scope.level === 'GLOBAL' && query.companyId) {
    employeeFilter.companyId = query.companyId;
  }
  if (scope.level !== 'BRANCH' && query.branchId) {
    employeeFilter.branchId = query.branchId;
  }
  if (query.departmentId) employeeFilter.departmentId = query.departmentId;
  if (query.divisionId) employeeFilter.divisionId = query.divisionId;
  if (query.employeeTypeId) employeeFilter.employeeTypeId = query.employeeTypeId;

  return employeeFilter;
}

function toBooleanQuery(value: 'true' | 'false' | '1' | '0') {
  return value === 'true' || value === '1';
}

function addAnd(
  where: Prisma.LeaveRequestWhereInput,
  condition: Prisma.LeaveRequestWhereInput,
) {
  const current = Array.isArray(where.AND)
    ? where.AND
    : where.AND
      ? [where.AND]
      : [];

  where.AND = [...current, condition];
}

function addAttachmentFilter(
  where: Prisma.LeaveRequestWhereInput,
  attachmentStatus?: ListLeaveRequestsQueryDto['attachmentStatus'],
) {
  if (!attachmentStatus) return;

  if (attachmentStatus === 'HAS_ATTACHMENT') {
    addAnd(where, {
      attachments: {
        some: {
          deletedAt: null,
        },
      },
    });
    return;
  }

  if (attachmentStatus === 'NO_ATTACHMENT') {
    addAnd(where, {
      attachments: {
        none: {
          deletedAt: null,
        },
      },
    });
    return;
  }

  if (attachmentStatus === 'MISSING_REQUIRED') {
    addAnd(where, {
      AND: [
        {
          OR: [
            {
              leaveType: {
                requiresAttachment: true,
              },
            },
            {
              AND: [
                { isRetroactive: true },
                {
                  leaveType: {
                    backdatedRequiresAttachment: true,
                  },
                },
              ],
            },
          ],
        },
        {
          attachments: {
            none: {
              deletedAt: null,
            },
          },
        },
      ],
    });
  }
}

function addPayrollImpactFilter(
  where: Prisma.LeaveRequestWhereInput,
  payrollImpact?: ListLeaveRequestsQueryDto['payrollImpact'],
) {
  if (payrollImpact !== 'AFFECTS_PAYROLL') return;

  addAnd(where, {
    OR: [
      { requiresPayrollCorrection: true },
      {
        leaveType: {
          affectPayroll: true,
        },
      },
    ],
  });
}

function addAttendanceImpactFilter(
  where: Prisma.LeaveRequestWhereInput,
  attendanceImpact?: ListLeaveRequestsQueryDto['attendanceImpact'],
) {
  if (attendanceImpact !== 'AFFECTS_ATTENDANCE') return;

  addAnd(where, {
    leaveType: {
      affectAttendance: true,
    },
  });
}

function addSearchFilter(
  where: Prisma.LeaveRequestWhereInput,
  searchValue?: string,
) {
  if (!searchValue?.trim()) return;

  const search = searchValue.trim();

  addAnd(where, {
    OR: [
      {
        requestNo: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        reason: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        contactInfo: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        note: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        employee: {
          employeeCode: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        employee: {
          firstName: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        employee: {
          lastName: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        employee: {
          displayName: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        employee: {
          company: {
            nameTh: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        employee: {
          branch: {
            nameTh: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        employee: {
          department: {
            nameTh: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        employee: {
          division: {
            nameTh: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        employee: {
          employeeType: {
            nameTh: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        employee: {
          positionMaster: {
            nameTh: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        leaveType: {
          code: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        leaveType: {
          nameTh: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        leaveType: {
          nameEn: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
    ],
  });
}
