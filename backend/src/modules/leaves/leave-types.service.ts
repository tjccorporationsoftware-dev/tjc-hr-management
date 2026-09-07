import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertNotReferenced } from '../../common/database/hard-delete.util';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { ListLeaveTypesQueryDto } from './dto/list-leave-types-query.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';

@Injectable()
export class LeaveTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListLeaveTypesQueryDto, scope: TenantScope) {
    const where: Prisma.LeaveTypeWhereInput = {
      deletedAt: null,
    };

    const companyId = effectiveCompanyId(scope, query.companyId);
    if (companyId) {
      where.companyId = companyId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        {
          code: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          nameTh: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          nameEn: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const items = await this.prisma.leaveType.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        policies: {
          where: {
            deletedAt: null,
          },
          include: {
            quotaTiers: {
              orderBy: {
                minServiceMonths: 'asc',
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
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: [
        {
          company: {
            code: 'asc',
          },
        },
        {
          code: 'asc',
        },
      ],
    });

    return items;
  }


  async findSummary(query: ListLeaveTypesQueryDto, scope: TenantScope) {
    const where: Prisma.LeaveTypeWhereInput = {
      deletedAt: null,
    };

    const companyId = effectiveCompanyId(scope, query.companyId);
    if (companyId) where.companyId = companyId;
    if (query.status) where.status = query.status;

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { nameTh: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, active, inactive, paid, requiresAttachment] = await this.prisma.$transaction([
      this.prisma.leaveType.count({ where }),
      this.prisma.leaveType.count({ where: { ...where, status: 'ACTIVE' } }),
      this.prisma.leaveType.count({ where: { ...where, status: 'INACTIVE' } }),
      this.prisma.leaveType.count({ where: { ...where, isPaid: true } }),
      this.prisma.leaveType.count({ where: { ...where, requiresAttachment: true } }),
    ]);

    return { total, active, inactive, paid, requiresAttachment };
  }

  async findOne(id: string) {
    const leaveType = await this.prisma.leaveType.findFirst({
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
            nameEn: true,
          },
        },
        policies: {
          where: {
            deletedAt: null,
          },
          include: {
            quotaTiers: {
              orderBy: {
                minServiceMonths: 'asc',
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
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!leaveType) {
      throw new NotFoundException('ไม่พบประเภทการลา');
    }

    return leaveType;
  }

  async create(dto: CreateLeaveTypeDto, scope: TenantScope) {
    // companyId มาจาก scope เสมอ (ไม่เชื่อค่าจาก client สำหรับ non-GLOBAL)
    const companyId = requireCompanyId(scope, dto.companyId);

    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      throw new NotFoundException('ไม่พบบริษัท หรือบริษัทไม่พร้อมใช้งาน');
    }

    const code = dto.code.trim().toUpperCase();

    const duplicated = await this.prisma.leaveType.findFirst({
      where: {
        companyId,
        code,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (duplicated) {
      throw new BadRequestException('รหัสประเภทการลานี้ถูกใช้งานแล้ว');
    }

    const leaveType = await this.prisma.leaveType.create({
      data: {
        companyId,
        code,
        nameTh: dto.nameTh.trim(),
        nameEn: dto.nameEn?.trim() || null,
        description: dto.description?.trim() || null,
        isPaid: dto.isPaid ?? true,
        requiresAttachment: dto.requiresAttachment ?? false,
        allowHalfDay: dto.allowHalfDay ?? true,
        allowHourly: dto.allowHourly ?? false,
        deductQuota: dto.deductQuota ?? true,
        affectAttendance: dto.affectAttendance ?? true,
        affectPayroll: dto.affectPayroll ?? true,
        minLeaveUnitMinutes: dto.minLeaveUnitMinutes ?? 240,
        maxLeaveDaysPerRequest: dto.maxLeaveDaysPerRequest ?? null,
        advanceNoticeDays: dto.advanceNoticeDays ?? 0,
        allowBackdated: dto.allowBackdated ?? false,
        maxBackdatedDays: dto.maxBackdatedDays ?? 0,
        backdatedRequiresAttachment: dto.backdatedRequiresAttachment ?? false,
        backdatedRequiresHrApproval: dto.backdatedRequiresHrApproval ?? true,
        allowNegativeBalance: dto.allowNegativeBalance ?? false,
        negativeBalanceMode: dto.negativeBalanceMode ?? null,
        includeHoliday: dto.includeHoliday ?? false,
        includeWeekend: dto.includeWeekend ?? false,
        attachmentRequiredAfterDays: dto.attachmentRequiredAfterDays ?? null,
        enforceQuotaLimit: dto.enforceQuotaLimit ?? true,
        quotaAccrualYears: dto.quotaAccrualYears ?? 1,
        genderEligibility: dto.genderEligibility ?? 'ALL',
        serviceStartBasis: dto.serviceStartBasis ?? 'HIRE_DATE',
        requireProbationPassed: dto.requireProbationPassed ?? false,
        prorateFirstYear: dto.prorateFirstYear ?? false,
        roundingMode: dto.roundingMode ?? 'NONE',
        quotaDisplayUnit: dto.quotaDisplayUnit ?? 'DAY',
        status: dto.status ?? 'ACTIVE',
      },
    });

    return this.findOne(leaveType.id);
  }

  async update(id: string, dto: UpdateLeaveTypeDto, scope: TenantScope) {
    const current = await this.prisma.leaveType.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบประเภทการลา');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    const nextCode = dto.code?.trim().toUpperCase();

    if (nextCode && nextCode !== current.code) {
      const duplicated = await this.prisma.leaveType.findFirst({
        where: {
          companyId: current.companyId,
          code: nextCode,
          deletedAt: null,
          id: {
            not: id,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicated) {
        throw new BadRequestException('รหัสประเภทการลานี้ถูกใช้งานแล้ว');
      }
    }

    await this.prisma.leaveType.update({
      where: {
        id,
      },
      data: {
        code: nextCode ?? undefined,
        nameTh: dto.nameTh?.trim() || undefined,
        nameEn:
          dto.nameEn === undefined ? undefined : dto.nameEn?.trim() || null,
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        isPaid: dto.isPaid,
        requiresAttachment: dto.requiresAttachment,
        allowHalfDay: dto.allowHalfDay,
        allowHourly: dto.allowHourly,
        deductQuota: dto.deductQuota,
        affectAttendance: dto.affectAttendance,
        affectPayroll: dto.affectPayroll,
        minLeaveUnitMinutes: dto.minLeaveUnitMinutes,
        maxLeaveDaysPerRequest: dto.maxLeaveDaysPerRequest,
        advanceNoticeDays: dto.advanceNoticeDays,
        allowBackdated: dto.allowBackdated,
        maxBackdatedDays: dto.maxBackdatedDays,
        backdatedRequiresAttachment: dto.backdatedRequiresAttachment,
        backdatedRequiresHrApproval: dto.backdatedRequiresHrApproval,
        allowNegativeBalance: dto.allowNegativeBalance,
        negativeBalanceMode: dto.negativeBalanceMode,
        includeHoliday: dto.includeHoliday,
        includeWeekend: dto.includeWeekend,
        attachmentRequiredAfterDays: dto.attachmentRequiredAfterDays,
        enforceQuotaLimit: dto.enforceQuotaLimit,
        quotaAccrualYears: dto.quotaAccrualYears,
        genderEligibility: dto.genderEligibility,
        serviceStartBasis: dto.serviceStartBasis,
        requireProbationPassed: dto.requireProbationPassed,
        prorateFirstYear: dto.prorateFirstYear,
        roundingMode: dto.roundingMode,
        quotaDisplayUnit: dto.quotaDisplayUnit,
        status: dto.status,
      },
    });

    return this.findOne(id);
  }

  async remove(id: string, scope: TenantScope) {
    const current = await this.prisma.leaveType.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบประเภทการลา');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    /* ลบแล้วคือลบจริง — ถ้ายังมีใบลา/นโยบาย/ยอดวันลาผูกอยู่ ให้บอกว่าติดอะไร */
    await assertNotReferenced(
      this.prisma,
      'leave_types',
      id,
      'ประเภทการลานี้',
    );

    await this.prisma.leaveType.delete({ where: { id } });

    return { id, deleted: true, mode: 'DELETED' };
  }
}

