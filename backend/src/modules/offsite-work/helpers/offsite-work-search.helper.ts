import { Prisma } from '../../../generated/prisma/client';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { ListOffsiteWorkRequestsQueryDto } from '../dto/list-offsite-work-requests-query.dto';

type PrismaLike = {
  employee: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
};

type EmployeeIdFilterSet = {
  scopedEmployeeIds?: string[];
  searchEmployeeIds?: string[];
  hasEmployeeScope?: boolean;
  /** BRANCH scope: employeeId ที่อยู่ในสาขาของผู้ใช้ (resolve จาก service) */
  tenantBranchEmployeeIds?: string[];
};

const NO_MATCH_ID = '__NO_MATCH_OFFSITE_EMPLOYEE__';

/**
 * Offsite Work search helper
 * -----------------------------------------------------------------------------
 * รวม logic สร้าง where สำหรับค้นหารายการทำงานนอกสถานที่ไว้จุดเดียว
 * โดย model OffsiteWorkRequest เก็บ employeeId ตรง ๆ จึงต้อง resolve employee scope
 * จากตาราง employees ก่อน แล้วค่อยนำ id มาประกอบ where
 */
export function buildOffsiteWorkRequestWhere(
  query: ListOffsiteWorkRequestsQueryDto,
  employeeFilters: EmployeeIdFilterSet = {},
  scope?: TenantScope,
): Prisma.OffsiteWorkRequestWhereInput {
  const where: Prisma.OffsiteWorkRequestWhereInput = {
    deletedAt: null,
  };

  if (query.employeeId) {
    where.employeeId = query.employeeId;
  }

  // Hard tenant boundary — OffsiteWorkRequest มี companyId ตรง จึงคุมข้ามบริษัทได้ทันที
  if (scope && scope.level !== 'GLOBAL' && scope.companyId) {
    addAnd(where, { companyId: scope.companyId });
  }
  // BRANCH: จำกัดต่อด้วย employeeId ที่อยู่ในสาขาของผู้ใช้ (ไม่มี relation employee)
  if (scope && scope.level === 'BRANCH') {
    addAnd(where, {
      employeeId: {
        in: employeeFilters.tenantBranchEmployeeIds?.length
          ? employeeFilters.tenantBranchEmployeeIds
          : [NO_MATCH_ID],
      },
    });
  }

  if (employeeFilters.hasEmployeeScope) {
    addAnd(where, {
      employeeId: {
        in: employeeFilters.scopedEmployeeIds?.length
          ? employeeFilters.scopedEmployeeIds
          : [NO_MATCH_ID],
      },
    });
  }

  if (query.status) {
    where.status = query.status;
  } else if (query.excludeDraft && toBooleanQuery(query.excludeDraft)) {
    where.status = { not: 'DRAFT' };
  }

  if (query.locationType) {
    where.locationType = query.locationType;
  }

  if (query.dateFrom || query.dateTo) {
    where.workDate = {};

    if (query.dateFrom) {
      where.workDate.gte = parseDateOnly(query.dateFrom);
    }

    if (query.dateTo) {
      where.workDate.lte = parseDateOnly(query.dateTo);
    }
  }

  addAttachmentFilter(where, query.attachmentStatus);
  addSearchFilter(where, query.search, employeeFilters.searchEmployeeIds);

  return where;
}

export function hasOffsiteEmployeeScopeFilter(query: ListOffsiteWorkRequestsQueryDto) {
  return Boolean(
    query.companyId ||
      query.branchId ||
      query.departmentId ||
      query.divisionId ||
      query.employeeTypeId,
  );
}

export async function resolveOffsiteEmployeeScopeIds(
  prisma: PrismaLike,
  query: ListOffsiteWorkRequestsQueryDto,
) {
  if (!hasOffsiteEmployeeScopeFilter(query)) return undefined;

  const employeeWhere: Prisma.EmployeeWhereInput = {
    deletedAt: null,
  };

  if (query.companyId) employeeWhere.companyId = query.companyId;
  if (query.branchId) employeeWhere.branchId = query.branchId;
  if (query.departmentId) employeeWhere.departmentId = query.departmentId;
  if (query.divisionId) employeeWhere.divisionId = query.divisionId;
  if (query.employeeTypeId) employeeWhere.employeeTypeId = query.employeeTypeId;

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: { id: true },
  });

  return employees.map((employee) => employee.id);
}

/**
 * BRANCH scope: resolve employeeId ที่อยู่ในบริษัท+สาขาของผู้ใช้
 * (OffsiteWorkRequest ไม่มี relation employee จึงต้องใช้ employeeId list)
 */
export async function resolveTenantBranchEmployeeIds(
  prisma: PrismaLike,
  scope: TenantScope,
) {
  if (scope.level !== 'BRANCH') return undefined;

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      companyId: scope.companyId ?? '__no_company__',
      branchId: scope.branchId ?? '__no_branch__',
    },
    select: { id: true },
  });

  return employees.map((employee) => employee.id);
}

export async function resolveOffsiteSearchEmployeeIds(
  prisma: PrismaLike,
  searchValue?: string,
) {
  const search = searchValue?.trim();
  if (!search) return undefined;

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      OR: [
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { nickname: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
        { company: { nameTh: { contains: search, mode: 'insensitive' } } },
        { branch: { nameTh: { contains: search, mode: 'insensitive' } } },
        { department: { nameTh: { contains: search, mode: 'insensitive' } } },
        { division: { nameTh: { contains: search, mode: 'insensitive' } } },
        { employeeType: { nameTh: { contains: search, mode: 'insensitive' } } },
        { positionMaster: { nameTh: { contains: search, mode: 'insensitive' } } },
      ],
    },
    select: { id: true },
    take: 500,
  });

  return employees.map((employee) => employee.id);
}

function toBooleanQuery(value: 'true' | 'false' | '1' | '0') {
  return value === 'true' || value === '1';
}

function addAnd(
  where: Prisma.OffsiteWorkRequestWhereInput,
  condition: Prisma.OffsiteWorkRequestWhereInput,
) {
  const current = Array.isArray(where.AND)
    ? where.AND
    : where.AND
      ? [where.AND]
      : [];

  where.AND = [...current, condition];
}

function addAttachmentFilter(
  where: Prisma.OffsiteWorkRequestWhereInput,
  attachmentStatus?: ListOffsiteWorkRequestsQueryDto['attachmentStatus'],
) {
  if (!attachmentStatus) return;

  if (attachmentStatus === 'HAS_ATTACHMENT') {
    addAnd(where, {
      AND: [
        { attachmentUrl: { not: null } },
        { attachmentUrl: { not: '' } },
      ],
    });
    return;
  }

  addAnd(where, {
    OR: [
      { attachmentUrl: null },
      { attachmentUrl: '' },
    ],
  });
}


function addSearchFilter(
  where: Prisma.OffsiteWorkRequestWhereInput,
  searchValue?: string,
  searchEmployeeIds?: string[],
) {
  const search = searchValue?.trim();
  if (!search) return;

  const conditions: Prisma.OffsiteWorkRequestWhereInput[] = [
    { requestNo: { contains: search, mode: 'insensitive' } },
    { locationName: { contains: search, mode: 'insensitive' } },
    { address: { contains: search, mode: 'insensitive' } },
    { reason: { contains: search, mode: 'insensitive' } },
  ];

  if (searchEmployeeIds?.length) {
    conditions.push({ employeeId: { in: searchEmployeeIds } });
  }

  addAnd(where, { OR: conditions });
}

function parseDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined as unknown as Date;
  return date;
}
