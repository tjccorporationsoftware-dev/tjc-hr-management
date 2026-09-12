import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { PrismaService } from '../../database/prisma.service';
import { assertNotReferenced } from '../../common/database/hard-delete.util';
import { PayrollStatutoryDefaultsService } from '../payroll/services/payroll-statutory-defaults.service';
import {
  ApprovalMatrixTargetType,
  ApprovalStepApproverType,
  EmployeeStatus,
  MasterStatus,
} from '../../generated/prisma/client';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';
import {
  CreateApprovalMatrixDto,
  CreateApprovalMatrixStepDto,
  UpdateApprovalMatrixDto,
  UpdateApprovalMatrixStepDto,
} from './dto/approval-matrix.dto';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';
import { CreateDivisionDto, UpdateDivisionDto } from './dto/division.dto';
import {
  CreateEmployeeTypeDto,
  UpdateEmployeeTypeDto,
} from './dto/employee-type.dto';
import {
  createCompanyLogoPublicUrl,
  getCompanyLogoAbsolutePathFromUrl,
} from './company-logo-storage.util';
import {
  createBranchLogoPublicUrl,
  getBranchLogoAbsolutePathFromUrl,
} from './branch-logo-storage.util';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';

type ListParams = {
  q?: string;
  status?: MasterStatus;
  page?: number;
  pageSize?: number;
};

type CompanyScopeParams = {
  companyId?: string;
  branchId?: string;
  departmentId?: string;
};

type StructureSummaryParams = CompanyScopeParams & {
  q?: string;
};

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollStatutoryDefaults: PayrollStatutoryDefaultsService,
  ) {}

  /**
   * =========================
   * Helpers
   * =========================
   */

  private getPagination(params: ListParams) {
    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize ?? 20), 1), 100);

    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      take: pageSize,
    };
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private cleanText(value?: string | null) {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }

  private async safeDeleteFile(filePath?: string | null) {
    if (!filePath) return;

    try {
      await unlink(filePath);
    } catch {
      // best effort cleanup only
    }
  }

  private async safeDeleteCompanyLogoByUrl(logoUrl?: string | null) {
    await this.safeDeleteFile(getCompanyLogoAbsolutePathFromUrl(logoUrl));
  }

  private async safeDeleteBranchLogoByUrl(logoUrl?: string | null) {
    await this.safeDeleteFile(getBranchLogoAbsolutePathFromUrl(logoUrl));
  }

  private hasCompanyScope(params: CompanyScopeParams = {}) {
    return Boolean(params.companyId || params.branchId || params.departmentId);
  }

  private buildScopedEmployeeWhere(params: CompanyScopeParams = {}) {
    return {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    };
  }

  /**
   * เงื่อนไขกรองแผนกด้วยสาขา
   *
   * แผนกผูกกับ "บริษัท" ส่วน branchId เป็น optional — แผนกที่ branchId = null
   * คือแผนกระดับบริษัทที่ใช้ร่วมกันทุกสาขา ถ้ากรองด้วย branchId เท่ากันตรงๆ
   * ผู้ใช้สิทธิ์ระดับสาขาจะไม่เห็นแผนกเลยสักอัน
   */
  private branchScopedDepartmentFilter(branchId?: string) {
    if (!branchId) return {};
    // ห่อด้วย AND เพื่อไม่ให้ชนกับ OR ของคำค้นที่อยู่ระดับเดียวกัน
    return { AND: [{ OR: [{ branchId }, { branchId: null }] }] };
  }

  /**
   * เงื่อนไขกรองข้อมูลหลักที่ผูกกับ "บริษัท" ตรงๆ (ตำแหน่ง, ประเภทพนักงาน)
   *
   * ทั้งสองตารางมีคอลัมน์ companyId และไม่มี branchId เพราะเป็นข้อมูลระดับบริษัท
   * ใช้ร่วมกันทุกสาขา เดิมโค้ดกรองด้วย "มีพนักงานถืออยู่" ทำให้บริษัทที่เพิ่งเปิด
   * และยังไม่มีพนักงานเลย มองไม่เห็นตำแหน่งที่ตัวเองเพิ่งสร้าง กลายเป็นทางตัน
   * เพราะต้องมีตำแหน่งก่อนจึงจะเพิ่มพนักงานได้ จึงกรองที่ companyId แทน
   * ส่วน branchId/departmentId ใช้เพียงเพื่อสืบว่าเป็นบริษัทใด ไม่ได้ตัดรายการทิ้ง
   */
  private buildCompanyLevelMasterWhere(params: CompanyScopeParams = {}) {
    if (params.companyId) {
      return { companyId: params.companyId };
    }

    if (params.branchId) {
      return {
        company: {
          branches: { some: { id: params.branchId, deletedAt: null } },
        },
      };
    }

    if (params.departmentId) {
      return {
        company: {
          departments: { some: { id: params.departmentId, deletedAt: null } },
        },
      };
    }

    return {};
  }

  private buildScopedDepartmentWhere(params: CompanyScopeParams = {}) {
    return {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...this.branchScopedDepartmentFilter(params.branchId),
      ...(params.departmentId ? { id: params.departmentId } : {}),
    };
  }

  private buildMeta(page: number, pageSize: number, total: number) {
    return {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }


  async getSummary(params: CompanyScopeParams = {}) {
    const companyWhere = {
      deletedAt: null,
      ...(params.companyId ? { id: params.companyId } : {}),
      ...(params.branchId
        ? { branches: { some: { id: params.branchId, deletedAt: null } } }
        : {}),
      ...(params.departmentId
        ? { departments: { some: { id: params.departmentId, deletedAt: null } } }
        : {}),
    };

    const activeCompanyWhere = {
      ...companyWhere,
      status: MasterStatus.ACTIVE,
    };

    const inactiveCompanyWhere = {
      ...companyWhere,
      status: MasterStatus.INACTIVE,
    };

    const branchWhere = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.branchId ? { id: params.branchId } : {}),
      ...(params.departmentId
        ? { departments: { some: { id: params.departmentId, deletedAt: null } } }
        : {}),
    };

    const activeBranchWhere = {
      ...branchWhere,
      status: MasterStatus.ACTIVE,
    };

    const inactiveBranchWhere = {
      ...branchWhere,
      status: MasterStatus.INACTIVE,
    };

    const departmentWhere = this.buildScopedDepartmentWhere(params);

    const activeDepartmentWhere = {
      ...departmentWhere,
      status: MasterStatus.ACTIVE,
    };

    const inactiveDepartmentWhere = {
      ...departmentWhere,
      status: MasterStatus.INACTIVE,
    };

    const divisionWhere = {
      deletedAt: null,
      ...(this.hasCompanyScope(params)
        ? {
            department: this.buildScopedDepartmentWhere(params),
          }
        : {}),
    };

    const activeDivisionWhere = {
      ...divisionWhere,
      status: MasterStatus.ACTIVE,
    };

    const inactiveDivisionWhere = {
      ...divisionWhere,
      status: MasterStatus.INACTIVE,
    };

    const positionWhere = {
      deletedAt: null,
      ...this.buildCompanyLevelMasterWhere(params),
    };

    const activePositionWhere = {
      ...positionWhere,
      status: MasterStatus.ACTIVE,
    };

    const inactivePositionWhere = {
      ...positionWhere,
      status: MasterStatus.INACTIVE,
    };

    const employeeTypeWhere = {
      deletedAt: null,
      ...this.buildCompanyLevelMasterWhere(params),
    };

    const activeEmployeeTypeWhere = {
      ...employeeTypeWhere,
      status: MasterStatus.ACTIVE,
    };

    const inactiveEmployeeTypeWhere = {
      ...employeeTypeWhere,
      status: MasterStatus.INACTIVE,
    };

    const approvalMatrixWhere = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    };

    const activeApprovalMatrixWhere = {
      ...approvalMatrixWhere,
      status: MasterStatus.ACTIVE,
    };

    const inactiveApprovalMatrixWhere = {
      ...approvalMatrixWhere,
      status: MasterStatus.INACTIVE,
    };

    const [
      companies,
      activeCompanies,
      inactiveCompanies,
      branches,
      activeBranches,
      inactiveBranches,
      departments,
      activeDepartments,
      inactiveDepartments,
      divisions,
      activeDivisions,
      inactiveDivisions,
      positions,
      activePositions,
      inactivePositions,
      employeeTypes,
      activeEmployeeTypes,
      inactiveEmployeeTypes,
      approvalMatrices,
      activeApprovalMatrices,
      inactiveApprovalMatrices,
      multiStepApprovalMatrices,
    ] = await Promise.all([
      this.prisma.company.count({ where: companyWhere }),
      this.prisma.company.count({ where: activeCompanyWhere }),
      this.prisma.company.count({ where: inactiveCompanyWhere }),
      this.prisma.branch.count({ where: branchWhere }),
      this.prisma.branch.count({ where: activeBranchWhere }),
      this.prisma.branch.count({ where: inactiveBranchWhere }),
      this.prisma.department.count({ where: departmentWhere }),
      this.prisma.department.count({ where: activeDepartmentWhere }),
      this.prisma.department.count({ where: inactiveDepartmentWhere }),
      this.prisma.division.count({ where: divisionWhere }),
      this.prisma.division.count({ where: activeDivisionWhere }),
      this.prisma.division.count({ where: inactiveDivisionWhere }),
      this.prisma.position.count({ where: positionWhere }),
      this.prisma.position.count({ where: activePositionWhere }),
      this.prisma.position.count({ where: inactivePositionWhere }),
      this.prisma.employeeType.count({ where: employeeTypeWhere }),
      this.prisma.employeeType.count({ where: activeEmployeeTypeWhere }),
      this.prisma.employeeType.count({ where: inactiveEmployeeTypeWhere }),
      this.prisma.approvalMatrix.count({ where: approvalMatrixWhere }),
      this.prisma.approvalMatrix.count({ where: activeApprovalMatrixWhere }),
      this.prisma.approvalMatrix.count({ where: inactiveApprovalMatrixWhere }),
      this.prisma.approvalMatrix.count({
        where: {
          ...approvalMatrixWhere,
          steps: {
            some: {
              deletedAt: null,
              stepNo: {
                gte: 2,
              },
            },
          },
        },
      }),
    ]);

    return {
      scope: {
        companyId: params.companyId ?? null,
        branchId: params.branchId ?? null,
        departmentId: params.departmentId ?? null,
      },
      companies: { total: companies, active: activeCompanies, inactive: inactiveCompanies },
      branches: { total: branches, active: activeBranches, inactive: inactiveBranches },
      departments: { total: departments, active: activeDepartments, inactive: inactiveDepartments },
      divisions: { total: divisions, active: activeDivisions, inactive: inactiveDivisions },
      positions: { total: positions, active: activePositions, inactive: inactivePositions },
      employeeTypes: { total: employeeTypes, active: activeEmployeeTypes, inactive: inactiveEmployeeTypes },
      approvalMatrices: {
        total: approvalMatrices,
        active: activeApprovalMatrices,
        inactive: inactiveApprovalMatrices,
        multiStep: multiStepApprovalMatrices,
      },
    };
  }


  /**
   * ผังองค์กรแบบอ่านอย่างเดียว — ใช้กับหน้าที่ต้องการ "รูปผัง" ไม่ใช่ "ทะเบียนพนักงาน"
   *
   * ทำไมต้องมี endpoint แยก
   * -----------------------
   * หน้าจัดผังองค์กรของ HR ประกอบผังจาก `GET /employees` ซึ่งต้องมี EMPLOYEE_READ
   * และคืนฟิลด์ของพนักงานมาทั้งแถว ผู้บริหารที่ต้องการแค่ดูรูปผังจึงเข้าไม่ได้
   * ถ้าจะให้เข้าได้ก็ต้องแจก EMPLOYEE_READ ซึ่งเท่ากับเปิดทะเบียนพนักงานทั้งองค์กรให้
   *
   * ตัวนี้คืนเฉพาะสิ่งที่วาดผังต้องใช้ — ชื่อ ตำแหน่ง หน่วยงาน และสายบังคับบัญชา
   * ไม่มีเลขบัตร เลขบัญชี เงินเดือน เบอร์โทร หรืออีเมล จึงเปิดด้วย ORG_READ ได้
   */
  async getOrgChart(params: CompanyScopeParams = {}) {
    const employeeWhere = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    };

    const [companies, branches, departments, divisions, employees] =
      await Promise.all([
      this.prisma.company.findMany({
        where: {
          deletedAt: null,
          ...(params.companyId ? { id: params.companyId } : {}),
        },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, nameTh: true },
      }),
      this.prisma.branch.findMany({
        where: {
          deletedAt: null,
          ...(params.companyId ? { companyId: params.companyId } : {}),
          ...(params.branchId ? { id: params.branchId } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { nameTh: 'asc' }],
        select: { id: true, code: true, nameTh: true, companyId: true },
      }),
      this.prisma.department.findMany({
        where: {
          deletedAt: null,
          ...(params.companyId ? { companyId: params.companyId } : {}),
          ...this.branchScopedDepartmentFilter(params.branchId),
          ...(params.departmentId ? { id: params.departmentId } : {}),
        },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          nameTh: true,
          branchId: true,
          companyId: true,
        },
      }),
      this.prisma.division.findMany({
        where: {
          deletedAt: null,
          ...(params.departmentId ? { departmentId: params.departmentId } : {}),
          ...(params.companyId || params.branchId
            ? {
                department: {
                  ...(params.companyId ? { companyId: params.companyId } : {}),
                  ...this.branchScopedDepartmentFilter(params.branchId),
                },
              }
            : {}),
        },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, nameTh: true, departmentId: true },
      }),
      this.prisma.employee.findMany({
        where: employeeWhere,
        // ผู้บริหารขึ้นก่อนในผังองค์กร แล้วค่อยไล่ตามรหัสพนักงาน
        orderBy: [
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
          position: true,
          status: true,
          companyId: true,
          branchId: true,
          departmentId: true,
          divisionId: true,
          supervisorId: true,
          positionMaster: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              level: true,
              sortOrder: true,
            },
          },
        },
      }),
    ]);

    return { companies, branches, departments, divisions, employees };
  }

  async getStructureSummary(params: StructureSummaryParams = {}) {
    const keyword = params.q?.trim();
    const employeeWhere = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(keyword
        ? {
            OR: [
              { employeeCode: { contains: keyword, mode: 'insensitive' as const } },
              { firstName: { contains: keyword, mode: 'insensitive' as const } },
              { lastName: { contains: keyword, mode: 'insensitive' as const } },
              { displayName: { contains: keyword, mode: 'insensitive' as const } },
              { position: { contains: keyword, mode: 'insensitive' as const } },
              { email: { contains: keyword, mode: 'insensitive' as const } },
              { company: { code: { contains: keyword, mode: 'insensitive' as const } } },
              { company: { nameTh: { contains: keyword, mode: 'insensitive' as const } } },
              { company: { nameEn: { contains: keyword, mode: 'insensitive' as const } } },
              { branch: { code: { contains: keyword, mode: 'insensitive' as const } } },
              { branch: { nameTh: { contains: keyword, mode: 'insensitive' as const } } },
              { branch: { nameEn: { contains: keyword, mode: 'insensitive' as const } } },
              { department: { code: { contains: keyword, mode: 'insensitive' as const } } },
              { department: { nameTh: { contains: keyword, mode: 'insensitive' as const } } },
              { department: { nameEn: { contains: keyword, mode: 'insensitive' as const } } },
              { division: { code: { contains: keyword, mode: 'insensitive' as const } } },
              { division: { nameTh: { contains: keyword, mode: 'insensitive' as const } } },
              { division: { nameEn: { contains: keyword, mode: 'insensitive' as const } } },
              { supervisor: { employeeCode: { contains: keyword, mode: 'insensitive' as const } } },
              { supervisor: { firstName: { contains: keyword, mode: 'insensitive' as const } } },
              { supervisor: { lastName: { contains: keyword, mode: 'insensitive' as const } } },
              { supervisor: { displayName: { contains: keyword, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const companyWhere = {
      deletedAt: null,
      ...(params.companyId ? { id: params.companyId } : {}),
      ...(params.branchId
        ? { branches: { some: { id: params.branchId, deletedAt: null } } }
        : {}),
      ...(params.departmentId
        ? { departments: { some: { id: params.departmentId, deletedAt: null } } }
        : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: 'insensitive' as const } },
              { nameTh: { contains: keyword, mode: 'insensitive' as const } },
              { nameEn: { contains: keyword, mode: 'insensitive' as const } },
              { employees: { some: employeeWhere } },
            ],
          }
        : {}),
    };

    const branchWhere = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.branchId ? { id: params.branchId } : {}),
      ...(params.departmentId
        ? { departments: { some: { id: params.departmentId, deletedAt: null } } }
        : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: 'insensitive' as const } },
              { nameTh: { contains: keyword, mode: 'insensitive' as const } },
              { nameEn: { contains: keyword, mode: 'insensitive' as const } },
              { employees: { some: employeeWhere } },
            ],
          }
        : {}),
    };

    const departmentWhere = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...this.branchScopedDepartmentFilter(params.branchId),
      ...(params.departmentId ? { id: params.departmentId } : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: 'insensitive' as const } },
              { nameTh: { contains: keyword, mode: 'insensitive' as const } },
              { nameEn: { contains: keyword, mode: 'insensitive' as const } },
              { employees: { some: employeeWhere } },
            ],
          }
        : {}),
    };

    const divisionWhere = {
      deletedAt: null,
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(params.companyId || params.branchId
        ? {
            department: {
              ...(params.companyId ? { companyId: params.companyId } : {}),
              ...this.branchScopedDepartmentFilter(params.branchId),
            },
          }
        : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: 'insensitive' as const } },
              { nameTh: { contains: keyword, mode: 'insensitive' as const } },
              { nameEn: { contains: keyword, mode: 'insensitive' as const } },
              { employees: { some: employeeWhere } },
            ],
          }
        : {}),
    };

    const [
      companies,
      branches,
      departments,
      divisions,
      employees,
      supervisors,
      roots,
      noDepartment,
      noPosition,
      noSupervisor,
      inactive,
    ] = await Promise.all([
      this.prisma.company.count({ where: companyWhere }),
      this.prisma.branch.count({ where: branchWhere }),
      this.prisma.department.count({ where: departmentWhere }),
      this.prisma.division.count({ where: divisionWhere }),
      this.prisma.employee.count({ where: employeeWhere }),
      this.prisma.employee.count({
        where: {
          ...employeeWhere,
          subordinates: { some: { deletedAt: null } },
        },
      }),
      this.prisma.employee.count({ where: { ...employeeWhere, supervisorId: null } }),
      this.prisma.employee.count({ where: { ...employeeWhere, departmentId: null } }),
      this.prisma.employee.count({
        where: {
          ...employeeWhere,
          positionId: null,
          position: null,
        },
      }),
      this.prisma.employee.count({
        where: {
          ...employeeWhere,
          supervisorId: null,
          positionMaster: {
            is: {
              code: { notIn: ['PRESIDENT', 'EXECUTIVE'] },
            },
          },
        },
      }),
      this.prisma.employee.count({
        where: {
          ...employeeWhere,
          status: { not: EmployeeStatus.ACTIVE },
        },
      }),
    ]);

    return {
      stats: {
        companies,
        branches,
        departments,
        divisions,
        employees,
        supervisors,
        roots,
      },
      dataQuality: {
        noDepartment,
        noPosition,
        noSupervisor,
        inactive,
      },
    };
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!company) {
      throw new BadRequestException('ไม่พบบริษัทที่เลือก');
    }

    return company;
  }

  private async ensureBranchBelongsToCompany(
    branchId: string,
    companyId: string,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId,
        deletedAt: null,
      },
      select: { id: true, companyId: true },
    });

    if (!branch) {
      throw new BadRequestException(
        'ไม่พบสาขาที่เลือก หรือสาขาไม่ได้อยู่ในบริษัทนี้',
      );
    }

    return branch;
  }

  private async ensureDepartmentExists(departmentId: string) {
    const department = await this.prisma.department.findFirst({
      where: {
        id: departmentId,
        deletedAt: null,
      },
      select: { id: true, companyId: true, branchId: true },
    });

    if (!department) {
      throw new BadRequestException('ไม่พบแผนกที่เลือก');
    }

    return department;
  }


  private async ensureEmployeeTypeExists(employeeTypeId: string) {
    const employeeType = await this.prisma.employeeType.findFirst({
      where: {
        id: employeeTypeId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!employeeType) {
      throw new BadRequestException('ไม่พบประเภทพนักงานที่เลือก');
    }

    return employeeType;
  }

  private async ensureDepartmentBelongsToCompany(
    departmentId: string,
    companyId: string,
  ) {
    const department = await this.prisma.department.findFirst({
      where: {
        id: departmentId,
        companyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!department) {
      throw new BadRequestException(
        'ไม่พบแผนกที่เลือก หรือแผนกไม่ได้อยู่ในบริษัทนี้',
      );
    }

    return department;
  }

  private async ensurePositionExists(positionId: string) {
    const position = await this.prisma.position.findFirst({
      where: {
        id: positionId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!position) {
      throw new BadRequestException('ไม่พบตำแหน่งผู้อนุมัติที่เลือก');
    }

    return position;
  }

  private async ensureEmployeeBelongsToCompany(
    employeeId: string,
    companyId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        companyId,
        deletedAt: null,
      },
      select: { id: true, companyId: true },
    });

    if (!employee) {
      throw new BadRequestException(
        'ไม่พบพนักงานผู้อนุมัติที่เลือก หรือพนักงานไม่ได้อยู่ในบริษัทนี้',
      );
    }

    return employee;
  }

  private async validateApprovalSteps(
    steps: Array<CreateApprovalMatrixStepDto | UpdateApprovalMatrixStepDto>,
    companyId: string,
  ) {
    const stepNos = new Set<number>();

    for (const step of steps) {
      if (stepNos.has(step.stepNo)) {
        throw new BadRequestException('ลำดับขั้นอนุมัติซ้ำกัน');
      }

      stepNos.add(step.stepNo);

      if (step.approverType === ApprovalStepApproverType.POSITION) {
        if (!step.positionId) {
          throw new BadRequestException(
            'กรุณาเลือกตำแหน่งสำหรับขั้นอนุมัติแบบ POSITION',
          );
        }

        await this.ensurePositionExists(step.positionId);
      }

      if (step.approverType === ApprovalStepApproverType.EMPLOYEE) {
        if (!step.employeeId) {
          throw new BadRequestException(
            'กรุณาเลือกพนักงานสำหรับขั้นอนุมัติแบบ EMPLOYEE',
          );
        }

        await this.ensureEmployeeBelongsToCompany(step.employeeId, companyId);
      }

      if (step.approverType === ApprovalStepApproverType.ROLE) {
        if (!step.roleCode?.trim()) {
          throw new BadRequestException(
            'กรุณาระบุ roleCode สำหรับขั้นอนุมัติแบบ ROLE',
          );
        }
      }
    }
  }

  private normalizeRequesterEmployeeIds(employeeIds?: string[]) {
    return Array.from(
      new Set(
        (employeeIds ?? [])
          .map((employeeId) => employeeId.trim())
          .filter(Boolean),
      ),
    );
  }

  private async validateRequesterEmployeesBelongToCompany(
    employeeIds: string[],
    companyId: string,
  ) {
    const uniqueEmployeeIds = this.normalizeRequesterEmployeeIds(employeeIds);

    if (uniqueEmployeeIds.length === 0) {
      return uniqueEmployeeIds;
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: uniqueEmployeeIds },
        companyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (employees.length !== uniqueEmployeeIds.length) {
      throw new BadRequestException(
        'พบรายชื่อพนักงานผู้ขออนุมัติที่ไม่อยู่ในบริษัทนี้ หรือถูกลบไปแล้ว',
      );
    }

    return uniqueEmployeeIds;
  }

  /**
   * สาขาเพิ่มเติมของสายอนุมัติ — ต้องอยู่ในบริษัทเดียวกันและไม่ซ้ำกับสาขาแรก
   *
   * สาขาแรกเก็บที่ ApprovalMatrix.branchId ตามเดิม ตารางเสริมจึงเก็บเฉพาะ
   * สาขาที่เกินมา ถ้าเก็บซ้ำจะนับสาขาเกินจริงตอนแสดงผล
   */
  private async validateExtraBranchIds(
    branchIds: string[],
    companyId: string,
    primaryBranchId: string | null,
  ) {
    const unique = Array.from(
      new Set(
        branchIds
          .map((branchId) => this.cleanText(branchId))
          .filter((branchId): branchId is string => Boolean(branchId)),
      ),
    ).filter((branchId) => branchId !== primaryBranchId);

    if (unique.length === 0) return unique;

    const branches = await this.prisma.branch.findMany({
      where: {
        id: { in: unique },
        companyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (branches.length !== unique.length) {
      throw new BadRequestException(
        'พบสาขาที่ไม่อยู่ในบริษัทนี้ หรือถูกลบไปแล้วในรายการสาขาของสายอนุมัติ',
      );
    }

    return unique;
  }

  private buildApprovalMatrixBranchRows(
    approvalMatrixId: string,
    branchIds: string[],
  ) {
    return branchIds.map((branchId) => ({
      approvalMatrixId,
      branchId,
    }));
  }

  private buildApprovalMatrixRequesterRows(
    approvalMatrixId: string,
    employeeIds: string[],
  ) {
    return employeeIds.map((employeeId) => ({
      approvalMatrixId,
      employeeId,
    }));
  }

  private buildApprovalStepCreateData(
    steps: Array<CreateApprovalMatrixStepDto | UpdateApprovalMatrixStepDto>,
  ) {
    return [...steps]
      .sort((a, b) => a.stepNo - b.stepNo)
      .map((step) => ({
        stepNo: step.stepNo,
        nameTh: step.nameTh.trim(),
        description: this.cleanText(step.description),
        approverType: step.approverType,
        positionId:
          step.approverType === ApprovalStepApproverType.POSITION
            ? this.cleanText(step.positionId)
            : null,
        employeeId:
          step.approverType === ApprovalStepApproverType.EMPLOYEE
            ? this.cleanText(step.employeeId)
            : null,
        roleCode:
          step.approverType === ApprovalStepApproverType.ROLE
            ? this.cleanText(step.roleCode)?.toUpperCase() ?? null
            : null,

        // ผู้อนุมัติแทน — เก็บเฉพาะช่องที่ตรงกับประเภทที่เลือก เหมือนผู้อนุมัติหลัก
        fallbackApproverType: step.fallbackApproverType ?? null,
        fallbackPositionId:
          step.fallbackApproverType === ApprovalStepApproverType.POSITION
            ? this.cleanText(step.fallbackPositionId)
            : null,
        fallbackEmployeeId:
          step.fallbackApproverType === ApprovalStepApproverType.EMPLOYEE
            ? this.cleanText(step.fallbackEmployeeId)
            : null,
        fallbackRoleCode:
          step.fallbackApproverType === ApprovalStepApproverType.ROLE
            ? this.cleanText(step.fallbackRoleCode)?.toUpperCase() ?? null
            : null,

        requireAll: step.requireAll ?? false,
        minApproverCount: step.minApproverCount ?? 1,
        status: 'ACTIVE' as const,
      }));
  }

  private approvalMatrixInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
        },
      },
      branch: {
        select: {
          id: true,
          code: true,
          nameTh: true,
        },
      },
      department: {
        select: {
          id: true,
          code: true,
          nameTh: true,
        },
      },
      employeeType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
        },
      },
      extraBranches: {
        include: {
          branch: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc' as const,
        },
      },
      requesters: {
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              nickname: true,
              title: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
              companyId: true,
              departmentId: true,
              employeeTypeId: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc' as const,
        },
      },
      steps: {
        where: {
          deletedAt: null,
        },
        include: {
          position: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              level: true,
            },
          },
          employee: {
            select: {
              id: true,
              employeeCode: true,
              nickname: true,
              title: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
            },
          },
          fallbackPosition: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              level: true,
            },
          },
          fallbackEmployee: {
            select: {
              id: true,
              employeeCode: true,
              nickname: true,
              title: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
            },
          },
        },
        orderBy: {
          stepNo: 'asc' as const,
        },
      },
    } as any;
  }

  /**
   * =========================
   * Company
   * =========================
   */

  async findCompanies(params: ListParams & { companyId?: string }) {
    const { page, pageSize, skip, take } = this.getPagination(params);

    const where = {
      deletedAt: null,
      ...(params.companyId ? { id: params.companyId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameTh: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameEn: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [companies, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        include: {
          _count: {
            select: {
              branches: true,
              departments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      data: companies,
      meta: this.buildMeta(page, pageSize, total),
    };
  }

  async findCompanyById(id: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        branches: {
          where: { deletedAt: null },
          orderBy: { code: 'asc' },
        },
        departments: {
          where: { deletedAt: null },
          orderBy: { code: 'asc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('ไม่พบบริษัท');
    }

    return company;
  }

  async createCompany(dto: CreateCompanyDto) {
    const code = this.normalizeCode(dto.code);

    const existing = await this.prisma.company.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('รหัสบริษัทนี้ถูกใช้งานแล้ว');
    }

    const company = await this.prisma.company.create({
      data: {
        code,
        nameTh: dto.nameTh.trim(),
        nameEn: this.cleanText(dto.nameEn),
        taxId: this.cleanText(dto.taxId),
        address: this.cleanText(dto.address),
        phone: this.cleanText(dto.phone),
        email: this.cleanText(dto.email),
        logoUrl: this.cleanText(dto.logoUrl),
        // ข้อมูลนายจ้างที่ใช้ในไฟล์นำส่ง สปส. และไฟล์โอนธนาคาร
        socialSecurityAccountNo: this.cleanText(dto.socialSecurityAccountNo),
        socialSecurityBranchNo: this.cleanText(dto.socialSecurityBranchNo),
        // กองทุนเงินทดแทนใช้รหัสกิจการและอัตราเงินสมทบคนละชุดกับประกันสังคม
        workmenCompensationCode: this.cleanText(dto.workmenCompensationCode),
        workmenCompensationRate: dto.workmenCompensationRate ?? null,
        bankCompanyCode: this.cleanText(dto.bankCompanyCode),
        bankDebitAccountNo: this.cleanText(dto.bankDebitAccountNo),
        status: 'ACTIVE',
      } as any,
    });

    /*
     * เติมโครงสร้างภาษีตามกฎหมายให้ทันที (ปีภาษีปัจจุบัน + ขั้นภาษี + ค่าลดหย่อน)
     * ไม่งั้นบริษัทใหม่จะเปิดหน้าตั้งค่าเงินเดือนมาเจอ "ยังไม่มีปีภาษี"
     * และคำนวณภาษีไม่ได้จนกว่าจะมีคนไปกดสร้างเอง
     *
     * ล้มแล้วไม่ให้การสร้างบริษัทล้มตาม — บริษัทถูกสร้างสำเร็จไปแล้ว
     * และตัวซิงก์ตอนบูตจะเติมให้เองในรอบถัดไป
     */
    try {
      await this.payrollStatutoryDefaults.ensureCompanyDefaults(company.id);
    } catch (error) {
      this.logger.error(
        `เติมโครงสร้างภาษีให้บริษัท ${company.code} ไม่สำเร็จ`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return company;
  }

  async updateCompany(id: string, dto: UpdateCompanyDto) {
    await this.findCompanyById(id);

    return this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: this.cleanText(dto.nameEn) }
          : {}),
        ...(dto.taxId !== undefined
          ? { taxId: this.cleanText(dto.taxId) }
          : {}),
        ...(dto.address !== undefined
          ? { address: this.cleanText(dto.address) }
          : {}),
        ...(dto.phone !== undefined
          ? { phone: this.cleanText(dto.phone) }
          : {}),
        ...(dto.email !== undefined
          ? { email: this.cleanText(dto.email) }
          : {}),
        ...(dto.logoUrl !== undefined
          ? { logoUrl: this.cleanText(dto.logoUrl) }
          : {}),
        ...(dto.socialSecurityAccountNo !== undefined
          ? {
              socialSecurityAccountNo: this.cleanText(
                dto.socialSecurityAccountNo,
              ),
            }
          : {}),
        ...(dto.socialSecurityBranchNo !== undefined
          ? {
              socialSecurityBranchNo: this.cleanText(
                dto.socialSecurityBranchNo,
              ),
            }
          : {}),
        ...(dto.workmenCompensationCode !== undefined
          ? {
              workmenCompensationCode: this.cleanText(
                dto.workmenCompensationCode,
              ),
            }
          : {}),
        ...(dto.workmenCompensationRate !== undefined
          ? { workmenCompensationRate: dto.workmenCompensationRate }
          : {}),
        ...(dto.bankCompanyCode !== undefined
          ? { bankCompanyCode: this.cleanText(dto.bankCompanyCode) }
          : {}),
        ...(dto.bankDebitAccountNo !== undefined
          ? { bankDebitAccountNo: this.cleanText(dto.bankDebitAccountNo) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      } as any,
    });
  }

  async uploadCompanyLogo(id: string, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('กรุณาเลือกไฟล์โลโก้บริษัท');
    }

    const current = (await this.prisma.company.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        logoUrl: true,
      } as any,
    })) as { id: string; logoUrl?: string | null } | null;

    if (!current) {
      await this.safeDeleteFile(file.path);
      throw new NotFoundException('ไม่พบบริษัท');
    }

    const nextLogoUrl = createCompanyLogoPublicUrl(file.filename);

    const company = await this.prisma.company.update({
      where: { id },
      data: {
        logoUrl: nextLogoUrl,
      } as any,
      include: {
        _count: {
          select: {
            branches: true,
            departments: true,
          },
        },
      },
    });

    await this.safeDeleteCompanyLogoByUrl(current.logoUrl);

    return company;
  }

  async deleteCompanyLogo(id: string) {
    const current = (await this.prisma.company.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        logoUrl: true,
      } as any,
    })) as { id: string; logoUrl?: string | null } | null;

    if (!current) {
      throw new NotFoundException('ไม่พบบริษัท');
    }

    const company = await this.prisma.company.update({
      where: { id },
      data: {
        logoUrl: null,
      } as any,
      include: {
        _count: {
          select: {
            branches: true,
            departments: true,
          },
        },
      },
    });

    await this.safeDeleteCompanyLogoByUrl(current.logoUrl);

    return company;
  }

  async deleteCompany(id: string) {
    await this.findCompanyById(id);
    await assertNotReferenced(this.prisma, 'Company', id, 'บริษัทนี้');

    return this.prisma.company.delete({ where: { id } });
  }

  /**
   * =========================
   * Branch
   * =========================
   */

  /**
   * ชุด include ของสาขาที่ทุกจุดคืนค่ากลับหน้าเว็บใช้ร่วมกัน
   * (รายการ / อัปโหลดโลโก้ / ลบโลโก้) หน้าเว็บจะได้ข้อมูลหน้าตาเดียวกันเสมอ
   */
  private branchListInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
        },
      },
      _count: {
        select: {
          departments: true,
          /*
           * จำนวนพนักงานของสาขา — นับเฉพาะทะเบียนที่ยังไม่ถูกลบ
           * หน้าโครงสร้างองค์กรใช้ตัวเลขนี้ตัดสินว่าสาขาไหนมีคนอยู่จริง
           * ก่อนจะปิดใช้งานหรือย้ายโครงสร้าง
           */
          employees: { where: { deletedAt: null } },
        },
      },
    };
  }

  async findBranches(
    params: ListParams & { companyId?: string; branchId?: string },
  ) {
    const { page, pageSize, skip, take } = this.getPagination(params);

    const where = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.branchId ? { id: params.branchId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameTh: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameEn: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [branches, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        include: this.branchListInclude(),
        // เรียงตามลำดับที่ตั้งไว้ (น้อย = ขึ้นก่อน) เท่ากันค่อยถอยไปเรียงตามชื่อ
        orderBy: [{ sortOrder: 'asc' }, { nameTh: 'asc' }],
        skip,
        take,
      }),
      this.prisma.branch.count({ where }),
    ]);

    return {
      data: branches,
      meta: this.buildMeta(page, pageSize, total),
    };
  }

  async findBranchById(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        _count: {
          select: {
            departments: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('ไม่พบสาขา');
    }

    return branch;
  }

  async createBranch(dto: CreateBranchDto) {
    await this.ensureCompanyExists(dto.companyId);

    const code = this.normalizeCode(dto.code);

    const existing = await this.prisma.branch.findUnique({
      where: {
        companyId_code: {
          companyId: dto.companyId,
          code,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('รหัสสาขานี้ถูกใช้งานแล้วในบริษัทนี้');
    }

    return this.prisma.branch.create({
      data: {
        companyId: dto.companyId,
        code,
        nameTh: dto.nameTh.trim(),
        nameEn: this.cleanText(dto.nameEn),
        address: this.cleanText(dto.address),
        phone: this.cleanText(dto.phone),
        email: this.cleanText(dto.email),
        usePayslipHeader: dto.usePayslipHeader ?? false,
        taxId: this.cleanText(dto.taxId),
        taxBranchNo: this.cleanText(dto.taxBranchNo),
        socialSecurityBranchNo: this.cleanText(dto.socialSecurityBranchNo),
        payslipNote: this.cleanText(dto.payslipNote),
        status: 'ACTIVE',
      },
    });
  }

  async updateBranch(id: string, dto: UpdateBranchDto) {
    await this.findBranchById(id);

    return this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: this.cleanText(dto.nameEn) }
          : {}),
        ...(dto.address !== undefined
          ? { address: this.cleanText(dto.address) }
          : {}),
        ...(dto.phone !== undefined
          ? { phone: this.cleanText(dto.phone) }
          : {}),
        ...(dto.email !== undefined
          ? { email: this.cleanText(dto.email) }
          : {}),
        ...(dto.usePayslipHeader !== undefined
          ? { usePayslipHeader: dto.usePayslipHeader }
          : {}),
        ...(dto.taxId !== undefined
          ? { taxId: this.cleanText(dto.taxId) }
          : {}),
        ...(dto.taxBranchNo !== undefined
          ? { taxBranchNo: this.cleanText(dto.taxBranchNo) }
          : {}),
        ...(dto.socialSecurityBranchNo !== undefined
          ? { socialSecurityBranchNo: this.cleanText(dto.socialSecurityBranchNo) }
          : {}),
        ...(dto.payslipNote !== undefined
          ? { payslipNote: this.cleanText(dto.payslipNote) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  /**
   * โลโก้สาขา — ใช้เป็นหัวสลิปของสาขาที่ออกเอกสารในนามตัวเอง
   * อัปโหลดทับได้เรื่อย ๆ ไฟล์เก่าถูกลบหลังอัปเดตฐานข้อมูลสำเร็จแล้วเท่านั้น
   */
  async uploadBranchLogo(id: string, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('กรุณาเลือกไฟล์โลโก้สาขา');
    }

    const current = (await this.prisma.branch.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        logoUrl: true,
      },
    })) as { id: string; logoUrl?: string | null } | null;

    if (!current) {
      await this.safeDeleteFile(file.path);
      throw new NotFoundException('ไม่พบสาขา');
    }

    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        logoUrl: createBranchLogoPublicUrl(file.filename),
      },
      include: this.branchListInclude(),
    });

    await this.safeDeleteBranchLogoByUrl(current.logoUrl);

    return branch;
  }

  async deleteBranchLogo(id: string) {
    const current = (await this.prisma.branch.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        logoUrl: true,
      },
    })) as { id: string; logoUrl?: string | null } | null;

    if (!current) {
      throw new NotFoundException('ไม่พบสาขา');
    }

    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        logoUrl: null,
      },
      include: this.branchListInclude(),
    });

    await this.safeDeleteBranchLogoByUrl(current.logoUrl);

    return branch;
  }

  async deleteBranch(id: string) {
    await this.findBranchById(id);
    await assertNotReferenced(this.prisma, 'Branch', id, 'สาขานี้');

    return this.prisma.branch.delete({ where: { id } });
  }

  /**
   * =========================
   * Department
   * =========================
   */

  async findDepartments(
    params: ListParams & { companyId?: string; branchId?: string },
  ) {
    const { page, pageSize, skip, take } = this.getPagination(params);

    const where = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...this.branchScopedDepartmentFilter(params.branchId),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameTh: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameEn: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [departments, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
          branch: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
          _count: {
            select: {
              divisions: true,
              /* จำนวนพนักงานในแผนก — นับเฉพาะทะเบียนที่ยังไม่ถูกลบ เหมือนฝั่งสาขา */
              employees: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data: departments,
      meta: this.buildMeta(page, pageSize, total),
    };
  }

  async findDepartmentById(id: string) {
    const department = await this.prisma.department.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('ไม่พบแผนก');
    }

    return department;
  }

  async createDepartment(dto: CreateDepartmentDto, companyId: string) {
    await this.ensureCompanyExists(companyId);

    if (dto.branchId) {
      await this.ensureBranchBelongsToCompany(dto.branchId, companyId);
    }

    const code = this.normalizeCode(dto.code);

    const existing = await this.prisma.department.findUnique({
      where: {
        companyId_code: {
          companyId,
          code,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('รหัสแผนกนี้ถูกใช้งานแล้วในบริษัทนี้');
    }

    return this.prisma.department.create({
      data: {
        companyId,
        branchId: this.cleanText(dto.branchId),
        code,
        nameTh: dto.nameTh.trim(),
        nameEn: this.cleanText(dto.nameEn),
        status: 'ACTIVE',
      },
    });
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    const current = await this.findDepartmentById(id);

    if (dto.branchId) {
      await this.ensureBranchBelongsToCompany(dto.branchId, current.companyId);
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.branchId !== undefined
          ? { branchId: this.cleanText(dto.branchId) }
          : {}),
        ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: this.cleanText(dto.nameEn) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async deleteDepartment(id: string) {
    await this.findDepartmentById(id);
    await assertNotReferenced(this.prisma, 'Department', id, 'แผนกนี้');

    return this.prisma.department.delete({ where: { id } });
  }

  /**
   * =========================
   * Division
   * =========================
   */

  async findDivisions(
    params: ListParams & {
      companyId?: string;
      branchId?: string;
      departmentId?: string;
    },
  ) {
    const { page, pageSize, skip, take } = this.getPagination(params);

    const where = {
      deletedAt: null,
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(params.status ? { status: params.status } : {}),

      ...(params.companyId || params.branchId
        ? {
            department: {
              ...(params.companyId ? { companyId: params.companyId } : {}),
              ...this.branchScopedDepartmentFilter(params.branchId),
            },
          }
        : {}),

      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameTh: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameEn: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [divisions, total] = await this.prisma.$transaction([
      this.prisma.division.findMany({
        where,
        include: {
          department: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              companyId: true,
              branchId: true,
              company: {
                select: {
                  id: true,
                  code: true,
                  nameTh: true,
                },
              },
              branch: {
                select: {
                  id: true,
                  code: true,
                  nameTh: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.division.count({ where }),
    ]);

    return {
      data: divisions,
      meta: this.buildMeta(page, pageSize, total),
    };
  }

  async findDivisionById(id: string) {
    const division = await this.prisma.division.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        department: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
      },
    });

    if (!division) {
      throw new NotFoundException('ไม่พบฝ่าย/กลุ่มงาน');
    }

    return division;
  }

  async createDivision(dto: CreateDivisionDto, companyId?: string) {
    await this.ensureDepartmentExists(dto.departmentId);

    // department ที่ผูก division ต้องอยู่ในบริษัทของผู้ใช้
    const dept = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, companyId },
      select: { id: true },
    });
    if (!dept) {
      throw new BadRequestException('แผนกไม่อยู่ในบริษัทของคุณ');
    }

    const code = this.normalizeCode(dto.code);

    const existing = await this.prisma.division.findUnique({
      where: {
        departmentId_code: {
          departmentId: dto.departmentId,
          code,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('รหัสฝ่ายนี้ถูกใช้งานแล้วในแผนกนี้');
    }

    return this.prisma.division.create({
      data: {
        departmentId: dto.departmentId,
        code,
        nameTh: dto.nameTh.trim(),
        nameEn: this.cleanText(dto.nameEn),
        status: 'ACTIVE',
      },
    });
  }

  async updateDivision(id: string, dto: UpdateDivisionDto) {
    await this.findDivisionById(id);

    return this.prisma.division.update({
      where: { id },
      data: {
        ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: this.cleanText(dto.nameEn) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async deleteDivision(id: string) {
    await this.findDivisionById(id);
    await assertNotReferenced(this.prisma, 'Division', id, 'ฝ่าย/ส่วนงานนี้');

    return this.prisma.division.delete({ where: { id } });
  }

  async findPositions(params: ListParams & CompanyScopeParams) {
    const { page, pageSize, skip, take } = this.getPagination(params);
    // ยังใช้กรองยอดพนักงานในแต่ละรายการให้ตรงกับสาขาที่เลือก แต่ไม่ใช้ตัดรายการทิ้ง
    const scopedEmployeeWhere = this.buildScopedEmployeeWhere(params);

    const where = {
      deletedAt: null,
      ...this.buildCompanyLevelMasterWhere(params),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameTh: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameEn: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [positions, total] = await this.prisma.$transaction([
      this.prisma.position.findMany({
        where,
        include: {
          _count: {
            select: {
              employees: this.hasCompanyScope(params)
                ? { where: scopedEmployeeWhere }
                : true,
            },
          },
        },
        /*
         * เรียงตามระดับตำแหน่ง ไม่ใช่ sortOrder
         * sortOrder เป็นเลขที่ต้องมานั่งไล่ตั้งเองทีละตำแหน่ง ในทางปฏิบัติจึงเป็น 0
         * ทั้งบริษัท ทำให้ตารางเรียงตามวันที่สร้างซึ่งไม่มีความหมายกับผู้ใช้
         * ส่วน level ถูกใช้เป็นลำดับชั้นอยู่แล้วทั้งในผังองค์กรและการหาผู้อนุมัติ
         * ตำแหน่งที่ยังไม่ตั้งระดับให้ไปอยู่ท้ายสุด ไม่ใช่ขึ้นก่อนเพราะ null
         */
        orderBy: [
          { level: { sort: 'asc', nulls: 'last' } },
          { nameTh: 'asc' },
        ],
        skip,
        take,
      }),
      this.prisma.position.count({ where }),
    ]);

    return {
      data: positions,
      meta: this.buildMeta(page, pageSize, total),
    };
  }

  async findPositionById(id: string) {
    const position = await this.prisma.position.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!position) {
      throw new NotFoundException('ไม่พบตำแหน่งในบริษัท');
    }

    return position;
  }

  async createPosition(dto: CreatePositionDto, companyId: string) {
    const code = this.normalizeCode(dto.code);

    const existing = await this.prisma.position.findFirst({
      where: { companyId, code },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('รหัสตำแหน่งนี้ถูกใช้งานแล้วในบริษัทนี้');
    }

    return this.prisma.position.create({
      data: {
        companyId,
        code,
        nameTh: dto.nameTh.trim(),
        nameEn: this.cleanText(dto.nameEn),
        description: this.cleanText(dto.description),
        level: dto.level ?? null,
        sortOrder: dto.sortOrder ?? 0,
        status: 'ACTIVE',
      },
    });
  }

  async updatePosition(id: string, dto: UpdatePositionDto) {
    await this.findPositionById(id);

    return this.prisma.position.update({
      where: { id },
      data: {
        ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: this.cleanText(dto.nameEn) }
          : {}),
        ...(dto.description !== undefined
          ? { description: this.cleanText(dto.description) }
          : {}),
        ...(dto.level !== undefined ? { level: dto.level ?? null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async deletePosition(id: string) {
    await this.findPositionById(id);
    await assertNotReferenced(this.prisma, 'Position', id, 'ตำแหน่งนี้');

    return this.prisma.position.delete({ where: { id } });
  }


  /**
   * =========================
   * Approval Matrix
   * =========================
   */

  async findApprovalMatrices(
    params: ListParams & {
      companyId?: string;
      branchId?: string;
      departmentId?: string;
      employeeTypeId?: string;
      targetType?: ApprovalMatrixTargetType;
    },
  ) {
    const { page, pageSize, skip, take } = this.getPagination(params);

    const where = {
      deletedAt: null,
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(params.employeeTypeId
        ? { employeeTypeId: params.employeeTypeId }
        : {}),
      ...(params.targetType ? { targetType: params.targetType } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameTh: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameEn: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [
      approvalMatrices,
      total,
      active,
      inactive,
      payroll,
      multiStep,
    ] = await this.prisma.$transaction([
      this.prisma.approvalMatrix.findMany({
        where,
        include: this.approvalMatrixInclude(),
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.approvalMatrix.count({ where }),
      this.prisma.approvalMatrix.count({
        where: { ...where, status: MasterStatus.ACTIVE },
      }),
      this.prisma.approvalMatrix.count({
        where: { ...where, status: MasterStatus.INACTIVE },
      }),
      this.prisma.approvalMatrix.count({
        where: { ...where, targetType: ApprovalMatrixTargetType.PAYROLL_RUN },
      }),
      this.prisma.approvalMatrix.count({
        where: {
          ...where,
          steps: {
            some: {
              deletedAt: null,
              stepNo: { gte: 2 },
            },
          },
        },
      }),
    ]);

    return {
      data: approvalMatrices,
      meta: this.buildMeta(page, pageSize, total),
      summary: {
        total,
        active,
        inactive,
        payroll,
        multiStep,
      },
    };
  }

  async findApprovalMatrixById(id: string) {
    const approvalMatrix = await this.prisma.approvalMatrix.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.approvalMatrixInclude(),
    });

    if (!approvalMatrix) {
      throw new NotFoundException('ไม่พบสายอนุมัติ');
    }

    return approvalMatrix;
  }

  /**
   * กำหนดสาขาของสายอนุมัติตามสิทธิ์ผู้ทำรายการ:
   * - BRANCH  -> ล็อกเป็นสาขาของผู้ดูแลเสมอ (ไม่เชื่อค่าจาก client)
   * - COMPANY/GLOBAL -> เลือกได้ (ว่าง = ทุกสาขา) แต่สาขาต้องอยู่ในบริษัทนั้น
   */
  private async resolveApprovalMatrixBranchId(
    scope: TenantScope,
    requestedBranchId: string | undefined,
    companyId: string,
  ): Promise<string | null> {
    if (scope.level === 'BRANCH') {
      return scope.branchId ?? null;
    }

    const branchId = this.cleanText(requestedBranchId);
    if (!branchId) {
      return null;
    }

    await this.ensureBranchBelongsToCompany(branchId, companyId);
    return branchId;
  }

  async createApprovalMatrix(dto: CreateApprovalMatrixDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.ensureCompanyExists(companyId);

    // สาขา: ผู้ดูแลระดับสาขาถูกล็อกเป็นสาขาตัวเองเสมอ,
    // ระดับบริษัท/แพลตฟอร์มเลือกได้ (ว่าง = ทุกสาขา) แต่ต้องอยู่ในบริษัทนั้น
    const branchId = await this.resolveApprovalMatrixBranchId(
      scope,
      dto.branchId,
      companyId,
    );

    if (dto.departmentId) {
      await this.ensureDepartmentBelongsToCompany(dto.departmentId, companyId);
    }

    if (dto.employeeTypeId) {
      await this.ensureEmployeeTypeExists(dto.employeeTypeId);
    }

    const code = this.normalizeCode(dto.code);
    const existing = await this.prisma.approvalMatrix.findUnique({
      where: {
        companyId_code: {
          companyId,
          code,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('รหัสสายอนุมัตินี้ถูกใช้งานแล้วในบริษัทนี้');
    }

    const steps =
      dto.steps && dto.steps.length > 0
        ? dto.steps
        : [
            {
              stepNo: 1,
              nameTh: 'หัวหน้าโดยตรง',
              approverType: ApprovalStepApproverType.SUPERVISOR,
              minApproverCount: 1,
              requireAll: false,
            } as CreateApprovalMatrixStepDto,
          ];

    await this.validateApprovalSteps(steps, companyId);
    const requesterEmployeeIds = await this.validateRequesterEmployeesBelongToCompany(
      dto.requesterEmployeeIds ?? [],
      companyId,
    );

    /*
     * ผู้ดูแลระดับสาขาตั้งได้เฉพาะสาขาตัวเอง จึงไม่รับรายการสาขาเพิ่มเติมจาก client
     * (ถ้ารับ จะเป็นทางลัดข้ามการล็อกสิทธิ์ของ resolveApprovalMatrixBranchId)
     */
    const extraBranchIds =
      scope.level === 'BRANCH'
        ? []
        : await this.validateExtraBranchIds(
            dto.branchIds ?? [],
            companyId,
            branchId,
          );

    const matrix = await this.prisma.$transaction(async (tx) => {
      const created = await tx.approvalMatrix.create({
        data: {
          companyId,
          code,
          nameTh: dto.nameTh.trim(),
          nameEn: this.cleanText(dto.nameEn),
          description: this.cleanText(dto.description),
          targetType: dto.targetType,
          branchId,
          departmentId: this.cleanText(dto.departmentId),
          employeeTypeId: this.cleanText(dto.employeeTypeId),
          priority: dto.priority ?? 0,
          status: dto.status ?? 'ACTIVE',
          steps: {
            create: this.buildApprovalStepCreateData(steps),
          },
        },
        select: { id: true },
      });

      if (requesterEmployeeIds.length > 0) {
        await (tx as any).approvalMatrixRequester.createMany({
          data: this.buildApprovalMatrixRequesterRows(
            created.id,
            requesterEmployeeIds,
          ),
          skipDuplicates: true,
        });
      }

      if (extraBranchIds.length > 0) {
        await tx.approvalMatrixBranch.createMany({
          data: this.buildApprovalMatrixBranchRows(created.id, extraBranchIds),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return this.findApprovalMatrixById(matrix.id);
  }

  async updateApprovalMatrix(
    id: string,
    dto: UpdateApprovalMatrixDto,
    scope: TenantScope,
  ) {
    const current = await this.findApprovalMatrixById(id);

    assertWithinScope(scope, { companyId: current.companyId });

    const nextCompanyId = current.companyId;

    // ผู้ดูแลระดับสาขาแก้สาขาไม่ได้ (ล็อกเป็นสาขาตน); ระดับบริษัท/แพลตฟอร์มเปลี่ยนได้
    let branchIdUpdate: { branchId: string | null } | Record<string, never> = {};
    if (scope.level === 'BRANCH') {
      branchIdUpdate = { branchId: scope.branchId ?? null };
    } else if (dto.branchId !== undefined) {
      const nextBranchId = this.cleanText(dto.branchId);
      if (nextBranchId) {
        await this.ensureBranchBelongsToCompany(nextBranchId, nextCompanyId);
      }
      branchIdUpdate = { branchId: nextBranchId };
    }

    if (dto.departmentId) {
      await this.ensureDepartmentBelongsToCompany(dto.departmentId, nextCompanyId);
    }

    if (dto.employeeTypeId) {
      await this.ensureEmployeeTypeExists(dto.employeeTypeId);
    }

    if (dto.steps !== undefined) {
      await this.validateApprovalSteps(dto.steps, nextCompanyId);
    }

    const requesterEmployeeIds =
      dto.requesterEmployeeIds !== undefined
        ? await this.validateRequesterEmployeesBelongToCompany(
            dto.requesterEmployeeIds,
            nextCompanyId,
          )
        : undefined;

    /*
     * สาขาแรกที่จะเป็นหลังบันทึก — ใช้กันไม่ให้สาขาเดียวกันไปโผล่ซ้ำในตารางเสริม
     * (branchIdUpdate ว่าง = ไม่ได้แก้สาขา จึงยังเป็นค่าเดิม)
     */
    const nextPrimaryBranchId =
      'branchId' in branchIdUpdate
        ? (branchIdUpdate.branchId as string | null)
        : current.branchId;

    const extraBranchIds =
      scope.level === 'BRANCH' || dto.branchIds === undefined
        ? undefined
        : await this.validateExtraBranchIds(
            dto.branchIds,
            nextCompanyId,
            nextPrimaryBranchId,
          );

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalMatrix.update({
        where: { id },
        data: {
          ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
          ...(dto.nameEn !== undefined
            ? { nameEn: this.cleanText(dto.nameEn) }
            : {}),
          ...(dto.description !== undefined
            ? { description: this.cleanText(dto.description) }
            : {}),
          ...(dto.targetType !== undefined ? { targetType: dto.targetType } : {}),
          ...branchIdUpdate,
          ...(dto.departmentId !== undefined
            ? { departmentId: this.cleanText(dto.departmentId) }
            : {}),
          ...(dto.employeeTypeId !== undefined
            ? { employeeTypeId: this.cleanText(dto.employeeTypeId) }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      if (dto.steps !== undefined) {
        await tx.approvalMatrixStep.deleteMany({
          where: {
            matrixId: id,
          },
        });

        if (dto.steps.length > 0) {
          await tx.approvalMatrixStep.createMany({
            data: this.buildApprovalStepCreateData(dto.steps).map((step) => ({
              ...step,
              matrixId: id,
            })),
          });
        }
      }

      if (extraBranchIds !== undefined) {
        await tx.approvalMatrixBranch.deleteMany({
          where: {
            approvalMatrixId: id,
          },
        });

        if (extraBranchIds.length > 0) {
          await tx.approvalMatrixBranch.createMany({
            data: this.buildApprovalMatrixBranchRows(id, extraBranchIds),
            skipDuplicates: true,
          });
        }
      }

      if (requesterEmployeeIds !== undefined) {
        await (tx as any).approvalMatrixRequester.deleteMany({
          where: {
            approvalMatrixId: id,
          },
        });

        if (requesterEmployeeIds.length > 0) {
          await (tx as any).approvalMatrixRequester.createMany({
            data: this.buildApprovalMatrixRequesterRows(
              id,
              requesterEmployeeIds,
            ),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.findApprovalMatrixById(id);
  }

  async deleteApprovalMatrix(id: string, scope: TenantScope) {
    const current = await this.findApprovalMatrixById(id);
    assertWithinScope(scope, { companyId: current.companyId });

    await assertNotReferenced(
      this.prisma,
      'approval_matrices',
      id,
      'สายอนุมัตินี้',
    );

    /* ขั้นอนุมัติใต้สายนี้เป็นของสายนี้เอง ฐานข้อมูลลบตามให้อยู่แล้ว (Cascade) */
    return this.prisma.approvalMatrix.delete({ where: { id } });
  }

  /**
   * =========================
   * Employee Type
   * =========================
   */

  async findEmployeeTypes(params: ListParams & CompanyScopeParams) {
    const { page, pageSize, skip, take } = this.getPagination(params);
    // ยังใช้กรองยอดพนักงานในแต่ละรายการให้ตรงกับสาขาที่เลือก แต่ไม่ใช้ตัดรายการทิ้ง
    const scopedEmployeeWhere = this.buildScopedEmployeeWhere(params);

    const where = {
      deletedAt: null,
      ...this.buildCompanyLevelMasterWhere(params),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              {
                code: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameTh: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                nameEn: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [employeeTypes, total] = await this.prisma.$transaction([
      this.prisma.employeeType.findMany({
        where,
        include: {
          _count: {
            select: {
              employees: this.hasCompanyScope(params)
                ? { where: scopedEmployeeWhere }
                : true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.employeeType.count({ where }),
    ]);

    return {
      data: employeeTypes,
      meta: this.buildMeta(page, pageSize, total),
    };
  }

  async findEmployeeTypeById(id: string) {
    const employeeType = await this.prisma.employeeType.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!employeeType) {
      throw new NotFoundException('ไม่พบประเภทพนักงาน');
    }

    return employeeType;
  }

  async createEmployeeType(dto: CreateEmployeeTypeDto, companyId: string) {
    const code = this.normalizeCode(dto.code);

    const existing = await this.prisma.employeeType.findFirst({
      where: { companyId, code },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('รหัสประเภทพนักงานนี้ถูกใช้งานแล้วในบริษัทนี้');
    }

    return this.prisma.employeeType.create({
      data: {
        companyId,
        code,
        nameTh: dto.nameTh.trim(),
        nameEn: this.cleanText(dto.nameEn),
        description: this.cleanText(dto.description),
        status: 'ACTIVE',
      },
    });
  }

  async updateEmployeeType(id: string, dto: UpdateEmployeeTypeDto) {
    await this.findEmployeeTypeById(id);

    return this.prisma.employeeType.update({
      where: { id },
      data: {
        ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: this.cleanText(dto.nameEn) }
          : {}),
        ...(dto.description !== undefined
          ? { description: this.cleanText(dto.description) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async deleteEmployeeType(id: string) {
    await this.findEmployeeTypeById(id);
    await assertNotReferenced(this.prisma, 'EmployeeType', id, 'ประเภทพนักงานนี้');

    return this.prisma.employeeType.delete({ where: { id } });
  }
}
