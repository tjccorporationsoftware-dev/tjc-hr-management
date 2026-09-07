import { Prisma } from '../../../generated/prisma/client';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { tenantWhere } from '../../../common/tenant/tenant-scope.util';
import { ListTimeAdjustRequestsQueryDto } from '../dto/list-time-adjust-requests-query.dto';
import { parseTimeAdjustDateTime } from '../utils/time-adjust-date.util';

/**
 * Time Adjust search helper
 * -----------------------------------------------------------------------------
 * รวม logic สร้าง where สำหรับค้นหารายการขอแก้เวลาไว้จุดเดียว
 * เพื่อให้หน้า HR / ESS / Approval Center ใช้ filter มาตรฐานเดียวกัน
 *
 * scope: บังคับ tenant isolation ผ่าน relation employee (Pattern B)
 */
export function buildTimeAdjustRequestWhere(
  query: ListTimeAdjustRequestsQueryDto,
  scope: TenantScope,
): Prisma.TimeAdjustRequestWhereInput {
  const where: Prisma.TimeAdjustRequestWhereInput = {
    deletedAt: null,
  };

  if (query.employeeId) {
    where.employeeId = query.employeeId;
  }

  if (query.status) {
    where.status = query.status;
  } else if (query.excludeDraft && toBooleanQuery(query.excludeDraft)) {
    where.status = { not: 'DRAFT' };
  }

  if (query.adjustType) {
    where.adjustType = query.adjustType;
  }

  if (query.targetLogType) {
    where.targetLogType = query.targetLogType;
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
    where.requestedLogTime = {};

    if (query.dateFrom) {
      where.requestedLogTime.gte = parseTimeAdjustDateTime(
        `${query.dateFrom}T00:00:00.000+07:00`,
      );
    }

    if (query.dateTo) {
      where.requestedLogTime.lte = parseTimeAdjustDateTime(
        `${query.dateTo}T23:59:59.999+07:00`,
      );
    }
  }

  addAttachmentFilter(where, query.attachmentStatus);
  addSearchFilter(where, query.search);

  return where;
}

function buildEmployeeScopeFilter(
  query: ListTimeAdjustRequestsQueryDto,
  scope: TenantScope,
) {
  const employeeFilter: Prisma.EmployeeWhereInput = {};

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
  where: Prisma.TimeAdjustRequestWhereInput,
  condition: Prisma.TimeAdjustRequestWhereInput,
) {
  const current = Array.isArray(where.AND)
    ? where.AND
    : where.AND
      ? [where.AND]
      : [];

  where.AND = [...current, condition];
}

function addAttachmentFilter(
  where: Prisma.TimeAdjustRequestWhereInput,
  attachmentStatus?: ListTimeAdjustRequestsQueryDto['attachmentStatus'],
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
  }
}

function addSearchFilter(
  where: Prisma.TimeAdjustRequestWhereInput,
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
        note: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        adjustType: {
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
    ],
  });
}
