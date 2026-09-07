import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertNotReferenced } from '../../common/database/hard-delete.util';
import { CreateLeavePolicyDto } from './dto/create-leave-policy.dto';
import { ListLeavePoliciesQueryDto } from './dto/list-leave-policies-query.dto';
import { UpdateLeavePolicyDto } from './dto/update-leave-policy.dto';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';

@Injectable()
export class LeavePoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListLeavePoliciesQueryDto, scope: TenantScope) {
    const where: Prisma.LeavePolicyWhereInput = {
      deletedAt: null,
    };

    const companyId = effectiveCompanyId(scope, query.companyId);
    if (companyId) {
      where.companyId = companyId;
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.leaveTypeId) {
      where.leaveTypeId = query.leaveTypeId;
    }

    if (query.employeeTypeId) {
      where.employeeTypeId = query.employeeTypeId;
    }

    if (query.status) {
      where.status = query.status;
    }

    return this.prisma.leavePolicy.findMany({
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
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            companyId: true,
          },
        },
        leaveType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            isPaid: true,
            requiresAttachment: true,
            status: true,
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
      orderBy: [
        { company: { code: 'asc' } },
        { branchId: 'asc' },
        { leaveType: { code: 'asc' } },
        { createdAt: 'asc' },
      ],
    });
  }


  async findSummary(query: ListLeavePoliciesQueryDto, scope: TenantScope) {
    const where: Prisma.LeavePolicyWhereInput = {
      deletedAt: null,
    };

    const companyId = effectiveCompanyId(scope, query.companyId);
    if (companyId) where.companyId = companyId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.leaveTypeId) where.leaveTypeId = query.leaveTypeId;
    if (query.employeeTypeId) where.employeeTypeId = query.employeeTypeId;
    if (query.status) where.status = query.status;

    const [total, active, inactive, requireApproval, carryForward] = await this.prisma.$transaction([
      this.prisma.leavePolicy.count({ where }),
      this.prisma.leavePolicy.count({ where: { ...where, status: 'ACTIVE' } }),
      this.prisma.leavePolicy.count({ where: { ...where, status: 'INACTIVE' } }),
      this.prisma.leavePolicy.count({ where: { ...where, requireApproval: true } }),
      this.prisma.leavePolicy.count({ where: { ...where, allowCarryForward: true } }),
    ]);

    return { total, active, inactive, requireApproval, carryForward };
  }

  async findOne(id: string) {
    const policy = await this.prisma.leavePolicy.findFirst({
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
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            companyId: true,
          },
        },
        leaveType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            isPaid: true,
            requiresAttachment: true,
            status: true,
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
    });

    if (!policy) {
      throw new NotFoundException('ไม่พบนโยบายวันลา');
    }

    return policy;
  }

  async create(dto: CreateLeavePolicyDto, scope: TenantScope) {
    // บังคับบริษัทจาก scope; branch ต้องอยู่ในขอบเขตของผู้ใช้ด้วย
    const companyId = requireCompanyId(scope, dto.companyId);
    assertWithinScope(scope, { companyId, branchId: dto.branchId ?? null });

    await this.ensureCompanyIsValid(companyId);

    await this.ensureLeaveTypeIsValid(companyId, dto.leaveTypeId);

    if (dto.branchId) {
      await this.ensureBranchIsValid(companyId, dto.branchId);
    }

    if (dto.employeeTypeId) {
      await this.ensureEmployeeTypeIsValid(companyId, dto.employeeTypeId);
    }

    await this.ensurePolicyIsNotDuplicated({
      companyId,
      branchId: dto.branchId ?? null,
      leaveTypeId: dto.leaveTypeId,
      employeeTypeId: dto.employeeTypeId ?? null,
    });

    const policy = await this.prisma.leavePolicy.create({
      data: {
        companyId,
        branchId: dto.branchId || null,
        leaveTypeId: dto.leaveTypeId,
        employeeTypeId: dto.employeeTypeId || null,
        annualQuotaDays: dto.annualQuotaDays,
        maxConsecutiveDays: dto.maxConsecutiveDays ?? null,
        allowCarryForward: dto.allowCarryForward ?? false,
        carryForwardLimitDays: dto.carryForwardLimitDays ?? 0,
        requireApproval: dto.requireApproval ?? true,
        status: dto.status ?? 'ACTIVE',
        // ขั้นบันไดตั้งต้น 1 ขั้น เพราะ resolver ใช้ขั้นบันไดก่อน annualQuotaDays เสมอ
        quotaTiers: {
          create: {
            minServiceMonths: 0,
            quotaDays: dto.annualQuotaDays,
            sortOrder: 0,
          },
        },
      },
    });

    return this.findOne(policy.id);
  }

  async update(id: string, dto: UpdateLeavePolicyDto, scope: TenantScope) {
    const current = await this.prisma.leavePolicy.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        leaveTypeId: true,
        employeeTypeId: true,
        quotaTiers: {
          select: { id: true, minServiceMonths: true },
          orderBy: { minServiceMonths: 'asc' },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบนโยบายวันลา');
    }

    assertWithinScope(scope, {
      companyId: current.companyId,
      branchId: current.branchId,
    });

    const nextBranchId =
      dto.branchId === undefined ? current.branchId : dto.branchId || null;
    const nextEmployeeTypeId =
      dto.employeeTypeId === undefined
        ? current.employeeTypeId
        : dto.employeeTypeId || null;

    if (nextBranchId) {
      assertWithinScope(scope, {
        companyId: current.companyId,
        branchId: nextBranchId,
      });
      await this.ensureBranchIsValid(current.companyId, nextBranchId);
    }

    if (nextEmployeeTypeId) {
      await this.ensureEmployeeTypeIsValid(
        current.companyId,
        nextEmployeeTypeId,
      );
    }

    if (
      (dto.branchId !== undefined && nextBranchId !== current.branchId) ||
      (dto.employeeTypeId !== undefined && nextEmployeeTypeId !== current.employeeTypeId)
    ) {
      await this.ensurePolicyIsNotDuplicated({
        companyId: current.companyId,
        branchId: nextBranchId,
        leaveTypeId: current.leaveTypeId,
        employeeTypeId: nextEmployeeTypeId,
        excludeId: current.id,
      });
    }

    await this.prisma.leavePolicy.update({
      where: {
        id,
      },
      data: {
        branchId: dto.branchId === undefined ? undefined : nextBranchId,
        employeeTypeId: dto.employeeTypeId === undefined ? undefined : nextEmployeeTypeId,
        annualQuotaDays: dto.annualQuotaDays,
        maxConsecutiveDays:
          dto.maxConsecutiveDays === undefined
            ? undefined
            : dto.maxConsecutiveDays,
        allowCarryForward: dto.allowCarryForward,
        carryForwardLimitDays: dto.carryForwardLimitDays,
        requireApproval: dto.requireApproval,
        quotaPeriod: dto.quotaPeriod,
        monthlyAccrualDays: dto.monthlyAccrualDays,
        probationEligibleAfterDays:
          dto.probationEligibleAfterDays === undefined
            ? undefined
            : dto.probationEligibleAfterDays,
        carryForwardExpireMonth:
          dto.carryForwardExpireMonth === undefined
            ? undefined
            : dto.carryForwardExpireMonth,
        carryForwardExpireDay:
          dto.carryForwardExpireDay === undefined
            ? undefined
            : dto.carryForwardExpireDay,
        maxBackdatedDaysOverride:
          dto.maxBackdatedDaysOverride === undefined
            ? undefined
            : dto.maxBackdatedDaysOverride,
        requireAttachmentAfterDays:
          dto.requireAttachmentAfterDays === undefined
            ? undefined
            : dto.requireAttachmentAfterDays,
        effectiveFrom:
          dto.effectiveFrom === undefined
            ? undefined
            : dto.effectiveFrom
              ? new Date(dto.effectiveFrom)
              : null,
        effectiveTo:
          dto.effectiveTo === undefined
            ? undefined
            : dto.effectiveTo
              ? new Date(dto.effectiveTo)
              : null,
        status: dto.status,
      },
    });

    /*
     * โควตาที่ถูกใช้จริงคือขั้นบันได ไม่ใช่ annualQuotaDays
     *
     * ถ้าแก้ annualQuotaDays แล้วปล่อยขั้นบันไดค้างไว้ ค่าที่ HR เพิ่งกรอกจะไม่มีผลเลย
     * โดยไม่มีอะไรเตือน จึงซิงก์ให้เฉพาะกรณีที่ยังเป็นขั้นบันไดตั้งต้นขั้นเดียว (0 เดือน)
     * ถ้าตั้งขั้นบันไดตามอายุงานไว้เองแล้ว ถือเป็นค่าที่ตั้งใจ ไม่ไปแตะ
     */
    if (dto.annualQuotaDays !== undefined) {
      const [baseline] = current.quotaTiers;

      if (current.quotaTiers.length === 0) {
        await this.prisma.leaveQuotaTier.create({
          data: {
            policyId: id,
            minServiceMonths: 0,
            quotaDays: dto.annualQuotaDays,
            sortOrder: 0,
          },
        });
      } else if (
        current.quotaTiers.length === 1 &&
        baseline.minServiceMonths === 0
      ) {
        await this.prisma.leaveQuotaTier.update({
          where: { id: baseline.id },
          data: { quotaDays: dto.annualQuotaDays },
        });
      }
    }

    return this.findOne(id);
  }

  async remove(id: string, scope: TenantScope) {
    const current = await this.prisma.leavePolicy.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบนโยบายวันลา');
    }

    assertWithinScope(scope, {
      companyId: current.companyId,
      branchId: current.branchId,
    });

    /* ลบแล้วคือลบจริง — ถ้ายังมีของผูกอยู่ ให้บอกว่าติดอะไร */
    await assertNotReferenced(this.prisma, 'leave_policies', id, 'นโยบายวันลานี้');

    await this.prisma.leavePolicy.delete({ where: { id } });

    return {
      id,
      deleted: true,
      mode: 'DELETED',
    };
  }

  private async ensureCompanyIsValid(companyId: string) {
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
  }

  private async ensureLeaveTypeIsValid(companyId: string, leaveTypeId: string) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: leaveTypeId,
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

    if (!leaveType) {
      throw new NotFoundException(
        'ไม่พบประเภทการลา หรือประเภทการลาไม่พร้อมใช้งาน',
      );
    }
  }

  private async ensureBranchIsValid(companyId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException('ไม่พบสาขา หรือสาขาไม่ได้อยู่ในบริษัทที่เลือก');
    }
  }

  private async ensureEmployeeTypeIsValid(
    companyId: string,
    employeeTypeId: string,
  ) {
    const employeeType = await this.prisma.employeeType.findFirst({
      where: {
        id: employeeTypeId,
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

    if (!employeeType) {
      throw new NotFoundException(
        'ไม่พบประเภทพนักงาน หรือประเภทพนักงานไม่ได้อยู่ในบริษัทที่เลือก',
      );
    }
  }

  private async ensurePolicyIsNotDuplicated(params: {
    companyId: string;
    branchId: string | null;
    leaveTypeId: string;
    employeeTypeId: string | null;
    excludeId?: string;
  }) {
    const duplicated = await this.prisma.leavePolicy.findFirst({
      where: {
        companyId: params.companyId,
        branchId: params.branchId,
        leaveTypeId: params.leaveTypeId,
        employeeTypeId: params.employeeTypeId,
        deletedAt: null,
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicated) {
      throw new BadRequestException(
        'มีนโยบายวันลาสำหรับสาขา ประเภทการลา และประเภทพนักงานนี้อยู่แล้ว',
      );
    }
  }
}