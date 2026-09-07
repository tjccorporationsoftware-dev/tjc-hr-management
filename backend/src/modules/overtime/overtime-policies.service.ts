import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertNotReferenced } from '../../common/database/hard-delete.util';
import { CreateOvertimePolicyDto } from './dto/create-overtime-policy.dto';
import { ListOvertimePoliciesQueryDto } from './dto/list-overtime-policies-query.dto';
import {
  GetOvertimeMatrixQueryDto,
  SaveOvertimeMatrixDto,
  SetOvertimeMatrixStatusDto,
  type OvertimeWorkTypeValue,
} from './dto/overtime-policy-matrix.dto';
import { UpdateOvertimePolicyDto } from './dto/update-overtime-policy.dto';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertCompanyLevelWrite,
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';

@Injectable()
export class OvertimePoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListOvertimePoliciesQueryDto, scope: TenantScope) {
    const where: Prisma.OvertimePolicyWhereInput = {
      deletedAt: null,
    };

    const companyId = effectiveCompanyId(scope, query.companyId);
    if (companyId) {
      where.companyId = companyId;
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.employeeTypeId) {
      where.employeeTypeId = query.employeeTypeId;
    }

    if (query.workType) {
      where.workType = query.workType;
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

    return this.prisma.overtimePolicy.findMany({
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
        {
          company: {
            code: 'asc',
          },
        },
        { branchId: 'asc' },
        {
          workType: 'asc',
        },
        {
          code: 'asc',
        },
      ],
    });
  }

  async findSummary(query: ListOvertimePoliciesQueryDto, scope: TenantScope) {
    const where: Prisma.OvertimePolicyWhereInput = {
      deletedAt: null,
    };

    const companyId = effectiveCompanyId(scope, query.companyId);
    if (companyId) where.companyId = companyId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.employeeTypeId) where.employeeTypeId = query.employeeTypeId;
    if (query.workType) where.workType = query.workType;
    if (query.status) where.status = query.status;

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { nameTh: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [
      total,
      active,
      inactive,
      workday,
      holiday,
      specialHoliday,
      requireApproval,
      average,
    ] = await this.prisma.$transaction([
      this.prisma.overtimePolicy.count({ where }),
      this.prisma.overtimePolicy.count({
        where: { ...where, status: 'ACTIVE' },
      }),
      this.prisma.overtimePolicy.count({
        where: { ...where, status: 'INACTIVE' },
      }),
      this.prisma.overtimePolicy.count({
        where: { ...where, workType: 'WORKDAY' },
      }),
      this.prisma.overtimePolicy.count({
        where: { ...where, workType: 'HOLIDAY' },
      }),
      this.prisma.overtimePolicy.count({
        where: { ...where, workType: 'SPECIAL_HOLIDAY' },
      }),
      this.prisma.overtimePolicy.count({
        where: { ...where, requireApproval: true },
      }),
      this.prisma.overtimePolicy.aggregate({
        where,
        _avg: { rateMultiplier: true },
      }),
    ]);

    return {
      total,
      active,
      inactive,
      workday,
      holiday: holiday + specialHoliday,
      specialHoliday,
      requireApproval,
      averageRate: average._avg.rateMultiplier ?? 0,
    };
  }

  async findOne(id: string) {
    const policy = await this.prisma.overtimePolicy.findFirst({
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
      throw new NotFoundException('ไม่พบนโยบาย OT');
    }

    return policy;
  }

  async create(dto: CreateOvertimePolicyDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);
    assertWithinScope(scope, { companyId, branchId: dto.branchId ?? null });
    assertCompanyLevelWrite(scope, 'นโยบาย OT');

    await this.ensureCompanyIsValid(companyId);

    if (dto.branchId) {
      await this.ensureBranchIsValid(companyId, dto.branchId);
    }

    if (dto.employeeTypeId) {
      await this.ensureEmployeeTypeIsValid(companyId, dto.employeeTypeId);
    }

    const code = dto.code.trim().toUpperCase();

    await this.ensureCodeIsNotDuplicated(companyId, code);
    await this.ensurePolicyIsNotDuplicated({
      companyId,
      branchId: dto.branchId ?? null,
      employeeTypeId: dto.employeeTypeId ?? null,
      workType: dto.workType ?? 'WORKDAY',
    });

    const policy = await this.prisma.overtimePolicy.create({
      data: {
        companyId,
        branchId: dto.branchId || null,
        employeeTypeId: dto.employeeTypeId || null,
        code,
        nameTh: dto.nameTh.trim(),
        nameEn: dto.nameEn?.trim() || null,
        description: dto.description?.trim() || null,
        workType: dto.workType ?? 'WORKDAY',
        rateMultiplier: dto.rateMultiplier,
        minMinutes: dto.minMinutes ?? 30,
        maxHoursPerDay:
          dto.maxHoursPerDay === undefined ? null : dto.maxHoursPerDay,
        calcStartMode: dto.calcStartMode ?? 'IMMEDIATE',
        hourRoundingMode: dto.hourRoundingMode ?? 'NONE',
        amountRoundingMode: dto.amountRoundingMode ?? 'NONE',
        includeInTax: dto.includeInTax ?? true,
        includeInSocialSecurity: dto.includeInSocialSecurity ?? false,
        requireApproval: dto.requireApproval ?? true,
        status: dto.status ?? 'ACTIVE',
      },
    });

    return this.findOne(policy.id);
  }

  async update(id: string, dto: UpdateOvertimePolicyDto, scope: TenantScope) {
    const current = await this.prisma.overtimePolicy.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบนโยบาย OT');
    }

    assertWithinScope(scope, {
      companyId: current.companyId,
      branchId: current.branchId,
    });
    assertCompanyLevelWrite(scope, 'นโยบาย OT');

    const nextCode = dto.code?.trim().toUpperCase();
    const nextBranchId =
      dto.branchId === undefined ? current.branchId : dto.branchId || null;
    const nextEmployeeTypeId =
      dto.employeeTypeId === undefined
        ? current.employeeTypeId
        : dto.employeeTypeId || null;
    const nextWorkType = dto.workType ?? current.workType;

    if (dto.branchId !== undefined) {
      assertCompanyLevelWrite(scope, 'นโยบาย OT');
    }

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

    if (nextCode && nextCode !== current.code) {
      await this.ensureCodeIsNotDuplicated(
        current.companyId,
        nextCode,
        current.id,
      );
    }

    if (
      nextBranchId !== current.branchId ||
      nextEmployeeTypeId !== current.employeeTypeId ||
      nextWorkType !== current.workType
    ) {
      await this.ensurePolicyIsNotDuplicated({
        companyId: current.companyId,
        branchId: nextBranchId,
        employeeTypeId: nextEmployeeTypeId,
        workType: nextWorkType,
        excludeId: current.id,
      });
    }

    await this.prisma.overtimePolicy.update({
      where: {
        id,
      },
      data: {
        branchId: dto.branchId === undefined ? undefined : nextBranchId,
        employeeTypeId:
          dto.employeeTypeId === undefined ? undefined : nextEmployeeTypeId,
        code: nextCode ?? undefined,
        nameTh: dto.nameTh?.trim() || undefined,
        nameEn:
          dto.nameEn === undefined ? undefined : dto.nameEn?.trim() || null,
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        workType: dto.workType,
        rateMultiplier: dto.rateMultiplier,
        minMinutes: dto.minMinutes,
        maxHoursPerDay:
          dto.maxHoursPerDay === undefined ? undefined : dto.maxHoursPerDay,
        calcStartMode: dto.calcStartMode,
        hourRoundingMode: dto.hourRoundingMode,
        amountRoundingMode: dto.amountRoundingMode,
        includeInTax: dto.includeInTax,
        includeInSocialSecurity: dto.includeInSocialSecurity,
        requireApproval: dto.requireApproval,
        status: dto.status,
      },
    });

    return this.findOne(id);
  }

  async remove(id: string, scope: TenantScope) {
    const current = await this.prisma.overtimePolicy.findFirst({
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
      throw new NotFoundException('ไม่พบนโยบาย OT');
    }

    assertWithinScope(scope, {
      companyId: current.companyId,
      branchId: current.branchId,
    });
    assertCompanyLevelWrite(scope, 'นโยบาย OT');

    /* ลบแล้วคือลบจริง — ถ้ายังมีของผูกอยู่ ให้บอกว่าติดอะไร */
    await assertNotReferenced(this.prisma, 'overtime_policies', id, 'นโยบาย OT นี้');

    await this.prisma.overtimePolicy.delete({ where: { id } });

    return {
      id,
      deleted: true,
      mode: 'DELETED',
    };
  }

  /* ------------------------------------------------------------------ */
  /* matrix : ประเภทวัน OT 1 ชนิด + นโยบายทุกประเภทพนักงาน ในครั้งเดียว     */
  /* ------------------------------------------------------------------ */

  /** อัตราตั้งต้นตามกฎหมายแรงงาน ใช้ตอนเปิดใช้ประเภทวันครั้งแรก */
  private static readonly defaultRate: Record<OvertimeWorkTypeValue, number> = {
    WORKDAY: 1.5,
    HOLIDAY: 2,
    SPECIAL_HOLIDAY: 3,
  };

  private static readonly workTypeLabel: Record<OvertimeWorkTypeValue, string> =
    {
      WORKDAY: 'OT วันทำงาน',
      HOLIDAY: 'OT วันหยุด',
      SPECIAL_HOLIDAY: 'OT วันหยุดพิเศษ',
    };

  /**
   * ข้อมูลทั้งหมดที่หน้าตั้งค่าต้องใช้สำหรับ OT ประเภทวัน 1 รายการ
   * รวมแถวที่ตั้งเองในขอบเขตนี้ และแถวที่สืบทอดมาจากบริษัท
   */
  async getMatrix(query: GetOvertimeMatrixQueryDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, query.companyId);
    const branchId = query.branchId?.trim() || null;

    assertWithinScope(scope, { companyId, branchId });

    const [employeeTypes, policies] = await Promise.all([
      this.prisma.employeeType.findMany({
        where: { companyId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, code: true, nameTh: true, nameEn: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.overtimePolicy.findMany({
        where: { companyId, workType: query.workType, deletedAt: null },
        include: {
          branch: {
            select: { id: true, code: true, nameTh: true, nameEn: true },
          },
          employeeType: {
            select: { id: true, code: true, nameTh: true, nameEn: true },
          },
        },
        orderBy: [{ branchId: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const rows = employeeTypes.map((employeeType) => {
      const own = policies.find(
        (policy) =>
          (policy.branchId ?? null) === branchId &&
          policy.employeeTypeId === employeeType.id,
      );
      const companyDefault = policies.find(
        (policy) =>
          policy.branchId === null && policy.employeeTypeId === employeeType.id,
      );
      // แถวเก่าที่ตั้งไว้แบบ "พนักงานทุกประเภท" ยังต้องแสดงเป็นค่าที่มีผลอยู่
      const allEmployeeTypes = policies.find(
        (policy) =>
          (policy.branchId ?? null) === branchId &&
          policy.employeeTypeId === null,
      );
      const companyAllEmployeeTypes = policies.find(
        (policy) => policy.branchId === null && policy.employeeTypeId === null,
      );

      const effective =
        own ??
        companyDefault ??
        allEmployeeTypes ??
        companyAllEmployeeTypes ??
        null;

      return {
        employeeType,
        policy: effective,
        /** true = ตั้งค่าเฉพาะขอบเขตนี้เอง / false = สืบทอดมา */
        isOwnScope: Boolean(own),
        inheritedFrom: own
          ? null
          : companyDefault
            ? 'COMPANY'
            : allEmployeeTypes || companyAllEmployeeTypes
              ? 'ALL_EMPLOYEE_TYPES'
              : null,
      };
    });

    /** สาขาที่ตั้งค่าแยกจากบริษัท */
    const overriddenBranches = Array.from(
      new Map(
        policies
          .filter((policy) => policy.branchId && policy.branch)
          .map((policy) => [policy.branchId as string, policy.branch]),
      ).values(),
    );

    const scoped = policies.filter(
      (policy) => (policy.branchId ?? null) === branchId,
    );

    return {
      workType: query.workType,
      branchId,
      employeeTypes,
      rows,
      overriddenBranches,
      /** สรุปสถานะของประเภทวันนี้ในขอบเขตที่เลือก */
      summary: {
        configured: scoped.length,
        enabled: scoped.filter((policy) => policy.status === 'ACTIVE').length,
        inherited: rows.filter((row) => !row.isOwnScope && row.policy).length,
        missing: rows.filter((row) => !row.policy).length,
      },
    };
  }

  /**
   * บันทึกทุกแถวของประเภทวัน OT ใน transaction เดียว
   * ทุกค่าเป็นของขอบเขต branchId ที่ส่งมา — ไม่กระทบสาขาอื่น
   */
  async saveMatrix(dto: SaveOvertimeMatrixDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);
    const branchId = dto.branchId?.trim() || null;

    assertWithinScope(scope, { companyId, branchId });
    assertCompanyLevelWrite(scope, 'นโยบาย OT');
    await this.ensureCompanyIsValid(companyId);

    if (branchId) {
      await this.ensureBranchIsValid(companyId, branchId);
    }

    const employeeTypes = await this.prisma.employeeType.findMany({
      where: { companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, code: true, nameTh: true },
    });
    const employeeTypeById = new Map(
      employeeTypes.map((item) => [item.id, item]),
    );

    for (const row of dto.rows) {
      if (!employeeTypeById.has(row.employeeTypeId)) {
        throw new BadRequestException('ไม่พบประเภทพนักงานนี้ในบริษัทที่เลือก');
      }
    }

    const sharedName =
      dto.nameTh?.trim() || OvertimePoliciesService.workTypeLabel[dto.workType];

    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.rows) {
        const existing = await tx.overtimePolicy.findFirst({
          where: {
            companyId,
            branchId,
            workType: dto.workType,
            employeeTypeId: row.employeeTypeId,
            deletedAt: null,
          },
          select: { id: true },
        });

        const data = {
          nameTh: sharedName,
          nameEn: dto.nameEn?.trim() || null,
          description: dto.description?.trim() || null,
          rateMultiplier: row.rateMultiplier,
          minMinutes: row.minMinutes ?? 30,
          maxHoursPerDay: row.maxHoursPerDay ?? null,
          calcStartMode: row.calcStartMode ?? 'IMMEDIATE',
          hourRoundingMode: row.hourRoundingMode ?? 'NONE',
          amountRoundingMode: row.amountRoundingMode ?? 'NONE',
          includeInTax: row.includeInTax ?? true,
          includeInSocialSecurity: row.includeInSocialSecurity ?? false,
          requireApproval: row.requireApproval ?? true,
          status:
            row.enabled === false ? ('INACTIVE' as const) : ('ACTIVE' as const),
        };

        if (existing) {
          await tx.overtimePolicy.update({
            where: { id: existing.id },
            data,
          });
          continue;
        }

        // ระดับบริษัท: ไม่มีแถวอยู่แล้วและสั่งปิด = ไม่มีอะไรต้องเก็บ
        // ระดับสาขา: ต้องเขียนแถวปิดทับ ไม่งั้นจะยังสืบทอดค่าเปิดจากบริษัท
        if (row.enabled === false && !branchId) continue;

        await tx.overtimePolicy.create({
          data: {
            companyId,
            branchId,
            employeeTypeId: row.employeeTypeId,
            workType: dto.workType,
            code: await this.buildMatrixCode(tx, {
              companyId,
              workType: dto.workType,
              branchId,
              employeeTypeCode:
                employeeTypeById.get(row.employeeTypeId)?.code ?? 'EMP',
            }),
            ...data,
          },
        });
      }
    });

    return this.getMatrix(
      { companyId, branchId: branchId ?? undefined, workType: dto.workType },
      scope,
    );
  }

  /**
   * เปิด/ปิดประเภทวัน OT ทั้งชุดในขอบเขตที่เลือก
   * เปิดครั้งแรก = สร้างแถวตั้งต้นให้ทุกประเภทพนักงานด้วยอัตราตามกฎหมาย
   */
  async setMatrixStatus(dto: SetOvertimeMatrixStatusDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);
    const branchId = dto.branchId?.trim() || null;

    assertWithinScope(scope, { companyId, branchId });
    assertCompanyLevelWrite(scope, 'นโยบาย OT');
    await this.ensureCompanyIsValid(companyId);

    if (branchId) {
      await this.ensureBranchIsValid(companyId, branchId);
    }

    const [employeeTypes, existing] = await Promise.all([
      this.prisma.employeeType.findMany({
        where: { companyId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, code: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.overtimePolicy.findMany({
        where: {
          companyId,
          branchId,
          workType: dto.workType,
          deletedAt: null,
        },
        select: { id: true, employeeTypeId: true },
      }),
    ]);

    if (!dto.enabled) {
      const configuredHere = new Set(
        existing.map((policy) => policy.employeeTypeId).filter(Boolean),
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.overtimePolicy.updateMany({
          where: {
            companyId,
            branchId,
            workType: dto.workType,
            deletedAt: null,
          },
          data: { status: 'INACTIVE' },
        });

        // สาขาที่ยังไม่เคยตั้งค่าเองจะสืบทอดค่าเปิดจากบริษัทอยู่
        // ต้องเขียนแถวปิดของสาขาทับไว้ ไม่งั้นกดปิดแล้วไม่มีผลอะไรเลย
        if (!branchId) return;

        for (const employeeType of employeeTypes) {
          if (configuredHere.has(employeeType.id)) continue;

          await tx.overtimePolicy.create({
            data: {
              companyId,
              branchId,
              employeeTypeId: employeeType.id,
              workType: dto.workType,
              code: await this.buildMatrixCode(tx, {
                companyId,
                workType: dto.workType,
                branchId,
                employeeTypeCode: employeeType.code,
              }),
              nameTh: OvertimePoliciesService.workTypeLabel[dto.workType],
              rateMultiplier: OvertimePoliciesService.defaultRate[dto.workType],
              minMinutes: 30,
              status: 'INACTIVE',
            },
          });
        }
      });

      return this.getMatrix(
        { companyId, branchId: branchId ?? undefined, workType: dto.workType },
        scope,
      );
    }

    if (employeeTypes.length === 0) {
      throw new BadRequestException(
        'บริษัทนี้ยังไม่มีประเภทพนักงาน — เพิ่มที่ตั้งค่าองค์กรก่อน',
      );
    }

    const configured = new Set(
      existing.map((policy) => policy.employeeTypeId).filter(Boolean),
    );
    const rate = OvertimePoliciesService.defaultRate[dto.workType];

    await this.prisma.$transaction(async (tx) => {
      await tx.overtimePolicy.updateMany({
        where: {
          companyId,
          branchId,
          workType: dto.workType,
          deletedAt: null,
        },
        data: { status: 'ACTIVE' },
      });

      for (const employeeType of employeeTypes) {
        if (configured.has(employeeType.id)) continue;

        await tx.overtimePolicy.create({
          data: {
            companyId,
            branchId,
            employeeTypeId: employeeType.id,
            workType: dto.workType,
            code: await this.buildMatrixCode(tx, {
              companyId,
              workType: dto.workType,
              branchId,
              employeeTypeCode: employeeType.code,
            }),
            nameTh: OvertimePoliciesService.workTypeLabel[dto.workType],
            rateMultiplier: rate,
            minMinutes: 30,
            status: 'ACTIVE',
          },
        });
      }
    });

    return this.getMatrix(
      { companyId, branchId: branchId ?? undefined, workType: dto.workType },
      scope,
    );
  }

  /** รหัสนโยบายต้องไม่ซ้ำในบริษัทเดียวกัน จึงเติมลำดับต่อท้ายเมื่อชน */
  private async buildMatrixCode(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      workType: OvertimeWorkTypeValue;
      branchId: string | null;
      employeeTypeCode: string;
    },
  ) {
    const branchPart = params.branchId
      ? params.branchId.slice(-5).toUpperCase()
      : 'ALL';
    const employeePart = params.employeeTypeCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 10);

    const base =
      `OT_${params.workType}_${branchPart}_${employeePart || 'EMP'}`.slice(
        0,
        46,
      );

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = attempt === 0 ? base : `${base}_${attempt}`;
      const duplicated = await tx.overtimePolicy.findFirst({
        where: { companyId: params.companyId, code },
        select: { id: true },
      });

      if (!duplicated) return code;
    }

    throw new BadRequestException('ไม่สามารถสร้างรหัสนโยบาย OT ที่ไม่ซ้ำได้');
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
      throw new NotFoundException(
        'ไม่พบสาขา หรือสาขาไม่ได้อยู่ในบริษัทที่เลือก',
      );
    }
  }

  private async ensureCodeIsNotDuplicated(
    companyId: string,
    code: string,
    excludeId?: string,
  ) {
    const duplicated = await this.prisma.overtimePolicy.findFirst({
      where: {
        companyId,
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new BadRequestException('รหัสนโยบาย OT นี้ถูกใช้งานแล้ว');
    }
  }

  private async ensurePolicyIsNotDuplicated(params: {
    companyId: string;
    branchId: string | null;
    employeeTypeId: string | null;
    workType: 'WORKDAY' | 'HOLIDAY' | 'SPECIAL_HOLIDAY';
    excludeId?: string;
  }) {
    const duplicated = await this.prisma.overtimePolicy.findFirst({
      where: {
        companyId: params.companyId,
        branchId: params.branchId,
        employeeTypeId: params.employeeTypeId,
        workType: params.workType,
        deletedAt: null,
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new BadRequestException(
        'มีนโยบาย OT สำหรับสาขา ประเภทพนักงาน และประเภทวันนี้อยู่แล้ว',
      );
    }
  }
}
