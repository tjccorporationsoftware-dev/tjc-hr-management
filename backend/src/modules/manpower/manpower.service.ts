import { Injectable } from '@nestjs/common';
import {
  EmployeeStatus,
  Gender,
  LeaveRequestStatus,
  MasterStatus,
  OvertimeRequestStatus,
  Prisma,
  TimeAdjustRequestStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import { tenantWhere } from '../../common/tenant/tenant-scope.util';
import { ManpowerQueryDto } from './dto/manpower-query.dto';

type OrgLite = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
} | null;

type ManpowerEmployee = {
  id: string;
  employeeCode: string;
  title: string | null;
  firstName: string;
  lastName: string;
  nickname: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  startDate: Date;
  probationEndDate: Date | null;
  status: EmployeeStatus;
  createdAt: Date;
  company: OrgLite;
  branch: OrgLite;
  department: OrgLite;
  division: OrgLite;
  employeeType: OrgLite;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  } | null;
  profile: {
    birthDate: Date | null;
    gender: Gender | null;
  } | null;
};

type ManpowerFilterOption = {
  id: string;
  code: string;
  name: string;
  companyId?: string;
  branchId?: string | null;
  departmentId?: string;
};

type StatusCounter = {
  count: number;
  activeCount: number;
  probationCount: number;
  inactiveCount: number;
  resignedCount: number;
  suspendedCount: number;
  terminatedCount: number;
};

@Injectable()
export class ManpowerService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: ManpowerQueryDto, scope: TenantScope) {
    const employees = await this.getEmployees(query, scope);

    const byCompany = this.groupByOrg(employees, 'company', 'ไม่ระบุบริษัท');
    const byBranch = this.groupByOrg(employees, 'branch', 'ไม่ระบุสาขา');
    const byDepartment = this.groupByOrg(
      employees,
      'department',
      'ไม่ระบุแผนก',
    );
    const byDivision = this.groupByOrg(
      employees,
      'division',
      'ไม่ระบุกลุ่มงาน',
    );
    const byEmployeeType = this.groupByOrg(
      employees,
      'employeeType',
      'ไม่ระบุประเภทพนักงาน',
    );
    const byPosition = this.groupByPosition(employees);
    const byStatus = this.groupByStatus(employees);
    const byAge = this.groupByAge(employees);
    const byGender = this.groupByGender(employees);
    const filters = await this.getFilterOptions(scope);

    const totalEmployees = employees.length;
    const activeEmployees = this.countStatus(employees, EmployeeStatus.ACTIVE);
    const probationEmployees = this.countStatus(
      employees,
      EmployeeStatus.PROBATION,
    );
    const inactiveEmployees = this.countStatus(
      employees,
      EmployeeStatus.INACTIVE,
    );
    const resignedEmployees = this.countStatus(
      employees,
      EmployeeStatus.RESIGNED,
    );
    const suspendedEmployees = this.countStatus(
      employees,
      EmployeeStatus.SUSPENDED,
    );
    const terminatedEmployees = this.countStatus(
      employees,
      EmployeeStatus.TERMINATED,
    );

    const requestMetrics = await this.getRequestMetrics(query, scope);

    const latestEmployees = this.getLatestEmployees(employees, 8);
    const latestEmployeesPreview = this.getLatestEmployees(employees, 6);

    return {
      metrics: {
        totalEmployees,
        activeEmployees,
        probationEmployees,
        inactiveEmployees,
        resignedEmployees,
        suspendedEmployees,
        terminatedEmployees,

        companyCount: byCompany.filter((item) => item.id).length,
        branchCount: byBranch.filter((item) => item.id).length,
        departmentCount: byDepartment.filter((item) => item.id).length,
        divisionCount: byDivision.filter((item) => item.id).length,
        employeeTypeCount: byEmployeeType.filter((item) => item.id).length,
        positionCount: byPosition.length,

        activeRate:
          totalEmployees > 0
            ? Number(((activeEmployees / totalEmployees) * 100).toFixed(1))
            : 0,

        ...requestMetrics,
      },
      filters,
      charts: {
        byCompany,
        byBranch,
        byDepartment,
        byDivision,
        byEmployeeType,
        byPosition,
        byStatus,
        byAge,
        byGender,
      },
      lists: {
        latestEmployees,
        latestEmployeesPreview,
        topDepartments: byDepartment.slice(0, 6),
        topBranches: byBranch.slice(0, 6),
        topPositions: byPosition.slice(0, 6),
        topAgeGroups: [...byAge].sort((a, b) => b.count - a.count),
      },
      employees,
    };
  }

  async getByDepartment(query: ManpowerQueryDto, scope: TenantScope) {
    const employees = await this.getEmployees(query, scope);
    return this.groupByOrg(employees, 'department', 'ไม่ระบุแผนก');
  }

  async getByBranch(query: ManpowerQueryDto, scope: TenantScope) {
    const employees = await this.getEmployees(query, scope);
    return this.groupByOrg(employees, 'branch', 'ไม่ระบุสาขา');
  }

  async getByPosition(query: ManpowerQueryDto, scope: TenantScope) {
    const employees = await this.getEmployees(query, scope);
    return this.groupByPosition(employees);
  }

  async getByStatus(query: ManpowerQueryDto, scope: TenantScope) {
    const employees = await this.getEmployees(query, scope);
    return this.groupByStatus(employees);
  }


  private async getFilterOptions(scope: TenantScope) {
    const activeMasterWhere = {
      deletedAt: null,
      status: MasterStatus.ACTIVE,
    } as const;

    // Company uses its own PK (id); branch/department/employeeType use companyId;
    // division has no companyId so it is scoped through its department relation.
    const noCompany = '__no_company__';
    const companyIdWhere: Prisma.CompanyWhereInput =
      scope.level === 'GLOBAL' ? {} : { id: scope.companyId ?? noCompany };
    const branchWhere: Prisma.BranchWhereInput =
      scope.level === 'GLOBAL'
        ? {}
        : scope.level === 'BRANCH'
          ? { companyId: scope.companyId ?? noCompany, id: scope.branchId ?? noCompany }
          : { companyId: scope.companyId ?? noCompany };
    const companyScopedWhere =
      scope.level === 'GLOBAL' ? {} : { companyId: scope.companyId ?? noCompany };
    const divisionScopeWhere: Prisma.DivisionWhereInput =
      scope.level === 'GLOBAL'
        ? {}
        : { department: { is: { companyId: scope.companyId ?? noCompany } } };

    const [companies, branches, departments, divisions, employeeTypes] =
      await this.prisma.$transaction([
        this.prisma.company.findMany({
          where: { ...activeMasterWhere, ...companyIdWhere },
          orderBy: [{ code: 'asc' }, { nameTh: 'asc' }],
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        }),
        this.prisma.branch.findMany({
          where: { ...activeMasterWhere, ...branchWhere },
          orderBy: [{ company: { code: 'asc' } }, { code: 'asc' }, { nameTh: 'asc' }],
          select: {
            id: true,
            companyId: true,
            code: true,
            nameTh: true,
          },
        }),
        this.prisma.department.findMany({
          where: { ...activeMasterWhere, ...companyScopedWhere },
          orderBy: [{ company: { code: 'asc' } }, { code: 'asc' }, { nameTh: 'asc' }],
          select: {
            id: true,
            companyId: true,
            branchId: true,
            code: true,
            nameTh: true,
          },
        }),
        this.prisma.division.findMany({
          where: { ...activeMasterWhere, ...divisionScopeWhere },
          orderBy: [{ department: { code: 'asc' } }, { code: 'asc' }, { nameTh: 'asc' }],
          select: {
            id: true,
            departmentId: true,
            code: true,
            nameTh: true,
          },
        }),
        this.prisma.employeeType.findMany({
          where: { ...activeMasterWhere, ...companyScopedWhere },
          orderBy: [{ code: 'asc' }, { nameTh: 'asc' }],
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        }),
      ]);

    return {
      companies: companies.map((item): ManpowerFilterOption => ({
        id: item.id,
        code: item.code,
        name: item.nameTh,
      })),
      branches: branches.map((item): ManpowerFilterOption => ({
        id: item.id,
        companyId: item.companyId,
        code: item.code,
        name: item.nameTh,
      })),
      departments: departments.map((item): ManpowerFilterOption => ({
        id: item.id,
        companyId: item.companyId,
        branchId: item.branchId,
        code: item.code,
        name: item.nameTh,
      })),
      divisions: divisions.map((item): ManpowerFilterOption => ({
        id: item.id,
        departmentId: item.departmentId,
        code: item.code,
        name: item.nameTh,
      })),
      employeeTypes: employeeTypes.map((item): ManpowerFilterOption => ({
        id: item.id,
        code: item.code,
        name: item.nameTh,
      })),
    };
  }

  private async getEmployees(query: ManpowerQueryDto, scope: TenantScope) {
    return this.prisma.employee.findMany({
      where: this.buildEmployeeWhere(query, scope),
      orderBy: [
        { company: { code: 'asc' } },
        { branch: { code: 'asc' } },
        { department: { code: 'asc' } },
        // ผู้บริหารขึ้นก่อนภายในแผนกเดียวกัน แล้วค่อยไล่ตามรหัสพนักงาน
        { positionMaster: { level: 'asc' } },
        { employeeCode: 'asc' },
      ],
      select: {
        id: true,
        employeeCode: true,
        title: true,
        firstName: true,
        lastName: true,
        nickname: true,
        displayName: true,
        email: true,
        phone: true,
        position: true,
        startDate: true,
        probationEndDate: true,
        status: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        division: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        employeeType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
        profile: {
          select: {
            birthDate: true,
            gender: true,
          },
        },
      },
    });
  }

  private buildEmployeeWhere(
    query: ManpowerQueryDto,
    scope: TenantScope,
  ): Prisma.EmployeeWhereInput {
    const q = query.q?.trim();

    return {
      deletedAt: null,
      // Tenant scope is enforced first and cannot be widened by client filters.
      ...(tenantWhere(scope) as Prisma.EmployeeWhereInput),
      // GLOBAL may narrow by company; COMPANY/BRANCH are already locked to their scope.
      ...(scope.level === 'GLOBAL' && query.companyId
        ? { companyId: query.companyId }
        : {}),
      // Only non-BRANCH scopes may narrow by branch (BRANCH is already locked).
      ...(scope.level !== 'BRANCH' && query.branchId
        ? { branchId: query.branchId }
        : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.divisionId ? { divisionId: query.divisionId } : {}),
      ...(query.employeeTypeId ? { employeeTypeId: query.employeeTypeId } : {}),
      ...(query.position ? { position: query.position } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { employeeCode: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { position: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async getRequestMetrics(query: ManpowerQueryDto, scope: TenantScope) {
    const employeeWhere = this.buildEmployeeWhere(query, scope);
    const { monthStart, nextMonthStart, previousMonthStart } =
      this.getMonthRanges();

    const [
      currentMonthNewEmployees,
      previousMonthNewEmployees,
      pendingLeaveRequests,
      pendingOvertimeRequests,
      pendingTimeAdjustRequests,
      currentMonthOt,
      previousMonthOt,
    ] = await this.prisma.$transaction([
      this.prisma.employee.count({
        where: {
          ...employeeWhere,
          startDate: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
      }),
      this.prisma.employee.count({
        where: {
          ...employeeWhere,
          startDate: {
            gte: previousMonthStart,
            lt: monthStart,
          },
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          deletedAt: null,
          status: LeaveRequestStatus.SUBMITTED,
          employee: {
            is: employeeWhere,
          },
        },
      }),
      this.prisma.overtimeRequest.count({
        where: {
          deletedAt: null,
          status: OvertimeRequestStatus.SUBMITTED,
          employee: {
            is: employeeWhere,
          },
        },
      }),
      this.prisma.timeAdjustRequest.count({
        where: {
          deletedAt: null,
          status: TimeAdjustRequestStatus.SUBMITTED,
          employee: {
            is: employeeWhere,
          },
        },
      }),
      this.prisma.overtimeRequest.aggregate({
        where: {
          deletedAt: null,
          status: OvertimeRequestStatus.APPROVED,
          workDate: {
            gte: monthStart,
            lt: nextMonthStart,
          },
          employee: {
            is: employeeWhere,
          },
        },
        _sum: {
          totalHours: true,
        },
      }),
      this.prisma.overtimeRequest.aggregate({
        where: {
          deletedAt: null,
          status: OvertimeRequestStatus.APPROVED,
          workDate: {
            gte: previousMonthStart,
            lt: monthStart,
          },
          employee: {
            is: employeeWhere,
          },
        },
        _sum: {
          totalHours: true,
        },
      }),
    ]);

    const currentMonthApprovedOtHours = this.toNumber(
      currentMonthOt._sum.totalHours,
    );
    const previousMonthApprovedOtHours = this.toNumber(
      previousMonthOt._sum.totalHours,
    );

    const pendingRequests =
      pendingLeaveRequests + pendingOvertimeRequests + pendingTimeAdjustRequests;

    return {
      currentMonthNewEmployees,
      previousMonthNewEmployees,
      newEmployeeDelta: currentMonthNewEmployees - previousMonthNewEmployees,

      pendingRequests,
      pendingLeaveRequests,
      pendingOvertimeRequests,
      pendingTimeAdjustRequests,

      currentMonthApprovedOtHours,
      previousMonthApprovedOtHours,
      otHourDelta: Number(
        (currentMonthApprovedOtHours - previousMonthApprovedOtHours).toFixed(2),
      ),
    };
  }

  private groupByOrg(
    employees: ManpowerEmployee[],
    key: 'company' | 'branch' | 'department' | 'division' | 'employeeType',
    fallbackName: string,
  ) {
    const map = new Map<
      string,
      {
        id: string | null;
        code: string;
        name: string;
      } & StatusCounter
    >();

    employees.forEach((employee) => {
      const org = employee[key];
      const mapKey = org?.id ?? 'UNASSIGNED';

      if (!map.has(mapKey)) {
        map.set(mapKey, {
          id: org?.id ?? null,
          code: org?.code ?? '-',
          name: org?.nameTh ?? fallbackName,
          ...this.emptyStatusCounter(),
        });
      }

      const item = map.get(mapKey);
      if (!item) return;

      this.addStatusCounter(item, employee.status);
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  private groupByPosition(employees: ManpowerEmployee[]) {
    const map = new Map<
      string,
      {
        position: string;
      } & StatusCounter
    >();

    employees.forEach((employee) => {
      const position = employee.position?.trim() || 'ไม่ระบุตำแหน่ง';

      if (!map.has(position)) {
        map.set(position, {
          position,
          ...this.emptyStatusCounter(),
        });
      }

      const item = map.get(position);
      if (!item) return;

      this.addStatusCounter(item, employee.status);
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  private groupByStatus(employees: ManpowerEmployee[]) {
    const statusText: Record<EmployeeStatus, string> = {
      ACTIVE: 'ปฏิบัติงาน',
      INACTIVE: 'ไม่ปฏิบัติงาน',
      PROBATION: 'ทดลองงาน',
      RESIGNED: 'ลาออก',
      SUSPENDED: 'พักงาน',
      TERMINATED: 'เลิกจ้าง',
    };

    const map = new Map<
      EmployeeStatus,
      {
        status: EmployeeStatus;
        label: string;
        count: number;
      }
    >();

    Object.values(EmployeeStatus).forEach((status) => {
      map.set(status, {
        status,
        label: statusText[status] ?? status,
        count: 0,
      });
    });

    employees.forEach((employee) => {
      const item = map.get(employee.status);
      if (!item) return;
      item.count += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * แยกตามเพศ — คนที่ยังไม่กรอกโปรไฟล์นับรวมเป็น "ไม่ระบุ"
   * ต้องคืนครบทุกกลุ่มแม้จะเป็นศูนย์ ฝั่งหน้าเว็บจะได้ไม่ต้องเดาว่ากลุ่มไหนหายไป
   */
  private groupByGender(employees: ManpowerEmployee[]) {
    const genderText: Record<Gender, string> = {
      MALE: 'ชาย',
      FEMALE: 'หญิง',
      OTHER: 'อื่น ๆ',
      NOT_SPECIFIED: 'ไม่ระบุ',
    };

    const map = new Map<
      Gender,
      {
        gender: Gender;
        label: string;
      } & StatusCounter
    >();

    Object.values(Gender).forEach((gender) => {
      map.set(gender, {
        gender,
        label: genderText[gender] ?? gender,
        ...this.emptyStatusCounter(),
      });
    });

    employees.forEach((employee) => {
      const gender = employee.profile?.gender ?? Gender.NOT_SPECIFIED;
      const item = map.get(gender);
      if (!item) return;

      this.addStatusCounter(item, employee.status);
    });

    return Array.from(map.values());
  }

  private groupByAge(employees: ManpowerEmployee[]) {
    const groups = [
      { code: 'UNDER_25', name: 'ต่ำกว่า 25 ปี', min: 0, max: 24 },
      { code: 'AGE_25_30', name: '25 – 30 ปี', min: 25, max: 30 },
      { code: 'AGE_31_35', name: '31 – 35 ปี', min: 31, max: 35 },
      { code: 'AGE_36_40', name: '36 – 40 ปี', min: 36, max: 40 },
      { code: 'AGE_41_45', name: '41 – 45 ปี', min: 41, max: 45 },
      { code: 'OVER_45', name: 'มากกว่า 45 ปี', min: 46, max: 200 },
      { code: 'UNKNOWN', name: 'ไม่ระบุอายุ', min: null, max: null },
    ] as const;

    const map = new Map<
      string,
      {
        code: string;
        name: string;
      } & StatusCounter
    >();

    groups.forEach((group) => {
      map.set(group.code, {
        code: group.code,
        name: group.name,
        ...this.emptyStatusCounter(),
      });
    });

    employees.forEach((employee) => {
      const birthDate = employee.profile?.birthDate;

      if (!birthDate) {
        const unknown = map.get('UNKNOWN');
        if (unknown) this.addStatusCounter(unknown, employee.status);
        return;
      }

      const age = this.getAge(birthDate);
      const target =
        groups.find((group) => {
          if (group.min === null || group.max === null) return false;
          return age >= group.min && age <= group.max;
        }) ?? groups[groups.length - 1];

      const item = map.get(target.code);
      if (!item) return;

      this.addStatusCounter(item, employee.status);
    });

    return Array.from(map.values());
  }

  private emptyStatusCounter(): StatusCounter {
    return {
      count: 0,
      activeCount: 0,
      probationCount: 0,
      inactiveCount: 0,
      resignedCount: 0,
      suspendedCount: 0,
      terminatedCount: 0,
    };
  }

  private addStatusCounter(item: StatusCounter, status: EmployeeStatus) {
    item.count += 1;

    if (status === EmployeeStatus.ACTIVE) item.activeCount += 1;
    if (status === EmployeeStatus.PROBATION) item.probationCount += 1;
    if (status === EmployeeStatus.INACTIVE) item.inactiveCount += 1;
    if (status === EmployeeStatus.RESIGNED) item.resignedCount += 1;
    if (status === EmployeeStatus.SUSPENDED) item.suspendedCount += 1;
    if (status === EmployeeStatus.TERMINATED) item.terminatedCount += 1;
  }

  private countStatus(employees: ManpowerEmployee[], status: EmployeeStatus) {
    return employees.filter((employee) => employee.status === status).length;
  }

  private getLatestEmployees(employees: ManpowerEmployee[], limit: number) {
    return [...employees]
      .sort((a, b) => {
        const first = a.startDate?.getTime() ?? 0;
        const second = b.startDate?.getTime() ?? 0;
        return second - first;
      })
      .slice(0, limit);
  }

  private getMonthRanges() {
    const now = new Date();

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    return {
      monthStart,
      nextMonthStart,
      previousMonthStart,
    };
  }

  private getAge(date: Date) {
    const today = new Date();

    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < date.getDate())
    ) {
      age -= 1;
    }

    return age;
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) return 0;

    const maybeDecimal = value as {
      toNumber?: () => number;
      toString?: () => string;
    };

    if (typeof maybeDecimal.toNumber === 'function') {
      return Number(maybeDecimal.toNumber().toFixed(2));
    }

    const parsed = Number(maybeDecimal.toString?.() ?? value);

    if (Number.isNaN(parsed)) return 0;

    return Number(parsed.toFixed(2));
  }
}