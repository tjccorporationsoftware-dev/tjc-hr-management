import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { GenerateLeaveBalancesBulkDto } from './dto/generate-leave-balances-bulk.dto';
import { GenerateLeaveBalancesDto } from './dto/generate-leave-balances.dto';
import { ListLeaveBalancesQueryDto } from './dto/list-leave-balances-query.dto';
import { UpdateLeaveBalanceDto } from './dto/update-leave-balance.dto';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  tenantWhere,
} from '../../common/tenant/tenant-scope.util';
import { LeavePolicyResolverService } from './services/leave-policy-resolver.service';

type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
};

@Injectable()
export class LeaveBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leavePolicyResolver: LeavePolicyResolverService,
  ) {}

  async findAll(query: ListLeaveBalancesQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.LeaveBalanceWhereInput = {};

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.leaveTypeId) {
      where.leaveTypeId = query.leaveTypeId;
    }

    if (query.year) {
      where.year = query.year;
    }

    // GLOBAL narrow ด้วย companyId ได้; COMPANY/BRANCH ถูกล็อกด้วย scope AND ด้านล่าง
    if (scope.level === 'GLOBAL' && query.companyId) {
      where.employee = {
        companyId: query.companyId,
      };
    }

    // Hard tenant boundary — scope ผ่าน relation employee (Pattern B)
    const scopeWhere = tenantWhere(scope) as Prisma.EmployeeWhereInput;
    if (Object.keys(scopeWhere).length > 0) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { employee: { is: scopeWhere } },
      ];
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
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
            nickname: {
              contains: search,
              mode: 'insensitive',
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
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveBalance.findMany({
        where,
        include: this.leaveBalanceInclude(),
        orderBy: [
          {
            year: 'desc',
          },
          {
            employee: {
              employeeCode: 'asc',
            },
          },
          {
            leaveType: {
              code: 'asc',
            },
          },
        ],
        skip,
        take: pageSize,
      }),
      this.prisma.leaveBalance.count({ where }),
    ]);

    return {
      items: items.map((item) => this.formatBalance(item)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const item = await this.prisma.leaveBalance.findUnique({
      where: { id },
      include: this.leaveBalanceInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบข้อมูลวันลาคงเหลือ');
    }

    return this.formatBalance(item);
  }

  async findMy(query: { year?: number }, currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployeeByUserId(actorId);
    const year = query.year ?? new Date().getFullYear();

    await this.generateForEmployee(
      {
        employeeId: employee.id,
        year,
        overwriteEntitlement: false,
      },
      false,
    );

    const items = await this.prisma.leaveBalance.findMany({
      where: {
        employeeId: employee.id,
        year,
        // ประเภทลาที่บริษัทปิดใช้แล้ว ยอดเดิมยังอยู่แต่ต้องไม่โผล่ให้พนักงานเลือกยื่น
        // (ฟอร์มในแอปมือถือและการ์ดสิทธิ์คงเหลือบนเว็บดึงจากรายการนี้)
        leaveType: { status: 'ACTIVE', deletedAt: null },
      },
      include: this.leaveBalanceInclude(),
      orderBy: {
        leaveType: {
          code: 'asc',
        },
      },
    });

    const formattedItems = items.map((item) => this.formatBalance(item));

    return {
      items: formattedItems,
      summary: this.buildBalanceSummary(formattedItems),
    };
  }

  private buildBalanceSummary(
    items: Array<{
      entitlementDays?: unknown;
      usedDays?: unknown;
      pendingDays?: unknown;
      remainingDays?: unknown;
    }>,
  ) {
    const summary = {
      entitlementDays: 0,
      usedDays: 0,
      pendingDays: 0,
      remainingDays: 0,
    };

    for (const item of items) {
      summary.entitlementDays += this.toNumber(item.entitlementDays);
      summary.usedDays += this.toNumber(item.usedDays);
      summary.pendingDays += this.toNumber(item.pendingDays);
      summary.remainingDays += this.toNumber(item.remainingDays);
    }

    return {
      entitlementDays: this.roundDays(summary.entitlementDays),
      usedDays: this.roundDays(summary.usedDays),
      pendingDays: this.roundDays(summary.pendingDays),
      remainingDays: this.roundDays(summary.remainingDays),
    };
  }

  private toNumber(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private roundDays(value: number) {
    return Math.round(value * 100) / 100;
  }

  async generateForEmployee(
    dto: GenerateLeaveBalancesDto,
    returnFormatted = true,
    scope?: TenantScope,
  ) {
    const year = dto.year ?? new Date().getFullYear();

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        deletedAt: null,
        status: {
          notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'],
        },
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        employeeTypeId: true,
        startDate: true,
        probationPassedAt: true,
        // ใช้คัดประเภทลาที่จำกัดเพศออก — ดูเหตุผลที่ลูปสร้างยอดด้านล่าง
        profile: { select: { gender: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบพนักงาน หรือพนักงานไม่พร้อมใช้งาน');
    }

    if (scope) {
      assertWithinScope(scope, {
        companyId: employee.companyId,
        branchId: employee.branchId,
      });
    }

    const policies = await this.getApplicablePolicies({
      companyId: employee.companyId,
      branchId: employee.branchId,
      employeeTypeId: employee.employeeTypeId,
    });

    if (policies.length === 0) {
      throw new BadRequestException('ยังไม่พบนโยบายวันลาสำหรับพนักงานคนนี้');
    }

    const createdOrUpdatedIds: string[] = [];
    // อ้างอิงอายุงาน ณ สิ้นปีสิทธิ์ เพื่อให้ได้ขั้นโควตาของทั้งปีนั้น
    const asOf = new Date(year, 11, 31);

    for (const policy of policies) {
      /*
       * ประเภทลาที่จำกัดเพศ ต้องไม่สร้างยอดให้คนที่ยื่นไม่ได้อยู่แล้ว
       *
       * เดิมตรวจเพศแค่ตอน "ยื่นใบลา" (assertEligible) ไม่ได้ตรวจตอน "สร้างยอด"
       * ผลคือพนักงานชายมีโควตาลาคลอด 60 วันขึ้นมาในระบบ และพนักงานหญิงมีโควตา
       * ลาอุปสมบท ทำให้ยอดรวมทั้งบริษัทเพี้ยนและ HR อ่านตัวเลขที่ใช้จริงไม่ได้
       *
       * กรณีที่ยังไม่ได้บันทึกเพศก็ข้ามเหมือนกัน เพราะ assertEligible ก็ปฏิเสธ
       * เช่นกัน การมียอดที่ยื่นไม่ได้จริงเป็นแค่ตัวเลขหลอกตา
       */
      if (policy.leaveType.genderEligibility !== 'ALL') {
        if (employee.profile?.gender !== policy.leaveType.genderEligibility) {
          continue;
        }
      }

      // "ระยะเวลาทำงาน / โควตา" — โควตาขึ้นกับอายุงานของพนักงานคนนี้
      const { quotaDays } = this.leavePolicyResolver.resolveQuotaDays(
        policy,
        policy.leaveType,
        employee,
        asOf,
      );

      const existing = await this.prisma.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: employee.id,
            leaveTypeId: policy.leaveTypeId,
            year,
          },
        },
      });

      if (existing) {
        if (dto.overwriteEntitlement) {
          const updated = await this.prisma.leaveBalance.update({
            where: {
              id: existing.id,
            },
            data: {
              entitlementDays: quotaDays,
            },
          });

          createdOrUpdatedIds.push(updated.id);
        } else {
          createdOrUpdatedIds.push(existing.id);
        }

        continue;
      }

      /*
       * ต้องดึงวันที่ใช้ไปแล้วจากใบลาจริงมาใส่ ไม่ใช่เริ่มที่ศูนย์
       *
       * ปกติแถวยอดถูกสร้างตอนพนักงานยื่นใบลาใบแรก ประวัติจึงสะสมต่อกันไป
       * แต่ถ้าใบลาถูกนำเข้ามาจากระบบเดิมโดยไม่ผ่านหน้าจอ (เช่นตอนย้ายข้อมูล)
       * จะยังไม่มีแถวยอด พอ HR มากด "สร้างยอดจากนโยบาย" ทีหลังแล้วเริ่มที่ศูนย์
       * วันลาที่ใช้ไปแล้วทั้งปีจะหายไปเงียบ ๆ พนักงานได้สิทธิ์คืนเต็มจำนวน
       */
      const consumed = await this.sumRequestedDays({
        employeeId: employee.id,
        leaveTypeId: policy.leaveTypeId,
        year,
      });

      const created = await this.prisma.leaveBalance.create({
        data: {
          employeeId: employee.id,
          leaveTypeId: policy.leaveTypeId,
          year,
          entitlementDays: quotaDays,
          carriedForwardDays: 0,
          adjustedDays: 0,
          usedDays: consumed.usedDays,
          pendingDays: consumed.pendingDays,
          note: 'สร้างจากนโยบายวันลาอัตโนมัติ',
        },
      });

      createdOrUpdatedIds.push(created.id);
    }

    const items = await this.prisma.leaveBalance.findMany({
      where: {
        id: {
          in: createdOrUpdatedIds,
        },
      },
      include: this.leaveBalanceInclude(),
      orderBy: {
        leaveType: {
          code: 'asc',
        },
      },
    });

    if (!returnFormatted) {
      return items;
    }

    return items.map((item) => this.formatBalance(item));
  }

  /**
   * รวมวันลาที่ใช้ไปแล้วและที่รออนุมัติ จากใบลาจริงของปีนั้น
   *
   * ใช้ตอนสร้างแถวยอดใหม่ให้พนักงานที่มีประวัติการลาอยู่ก่อนแล้ว
   * ยึดปีตามวันเริ่มลา ให้ตรงกับที่ ensureBalanceForRequest ใช้
   * ประเภทที่ตั้งว่าไม่ตัดโควตา (deductQuota = false) ไม่ถูกนับ
   */
  private async sumRequestedDays(params: {
    employeeId: string;
    leaveTypeId: string;
    year: number;
  }) {
    const leaveType = await this.prisma.leaveType.findUnique({
      select: { deductQuota: true },
      where: { id: params.leaveTypeId },
    });

    if (leaveType?.deductQuota === false) {
      return { pendingDays: 0, usedDays: 0 };
    }

    const grouped = await this.prisma.leaveRequest.groupBy({
      by: ['status'],
      _sum: { totalDays: true },
      where: {
        deletedAt: null,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        status: { in: ['APPROVED', 'SUBMITTED'] },
        startDate: {
          gte: new Date(params.year, 0, 1),
          lt: new Date(params.year + 1, 0, 1),
        },
      },
    });

    const pick = (status: string) =>
      Number(
        grouped.find((row) => row.status === status)?._sum.totalDays ?? 0,
      );

    return { pendingDays: pick('SUBMITTED'), usedDays: pick('APPROVED') };
  }

  /**
   * สร้างยอดวันลาให้พนักงานหลายคนในครั้งเดียว
   *
   * ของเดิมสร้างทีละคน และตัวที่เรียกจริงมีแค่ตอนพนักงานเปิดดูสิทธิ์ตัวเอง
   * (`findMy`) คนที่ยังไม่เคยล็อกอินจึงไม่มียอดในระบบเลย HR มองไม่เห็นว่าใครมีเท่าไร
   *
   * คนที่ล้มไม่ทำให้ทั้งงานล้ม — เก็บเหตุผลรายคนกลับไปแทน
   * เพราะสาเหตุที่พบบ่อยคือ "ยังไม่มีนโยบายวันลาสำหรับประเภทพนักงานนี้"
   * ซึ่งเป็นเรื่องของคนคนเดียว ไม่ควรทำให้อีก 19 คนไม่ได้ยอด
   */
  async generateForMany(dto: GenerateLeaveBalancesBulkDto, scope: TenantScope) {
    const year = dto.year ?? new Date().getFullYear();

    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      // ตรงกับเงื่อนไขใน generateForEmployee — คนที่ออกแล้วไม่ต้องมียอดใหม่
      status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] },
      ...(tenantWhere(scope) as Prisma.EmployeeWhereInput),
      ...(dto.employeeIds?.length ? { id: { in: dto.employeeIds } } : {}),
      ...(dto.branchId ? { branchId: dto.branchId } : {}),
      ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
    };

    const employees = await this.prisma.employee.findMany({
      orderBy: { employeeCode: 'asc' },
      select: { id: true, displayName: true, employeeCode: true, nickname: true },
      where,
    });

    const failed: Array<{
      employeeId: string;
      employeeCode: string;
      displayName: string | null;
      reason: string;
    }> = [];
    let balanceCount = 0;
    let succeeded = 0;

    for (const employee of employees) {
      try {
        const items = (await this.generateForEmployee(
          { employeeId: employee.id, overwriteEntitlement: dto.overwriteEntitlement, year },
          false,
          scope,
        )) as unknown[];

        balanceCount += items.length;
        succeeded += 1;
      } catch (error) {
        failed.push({
          displayName: employee.displayName,
          employeeCode: employee.employeeCode,
          employeeId: employee.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      year,
      employeeCount: employees.length,
      succeeded,
      balanceCount,
      overwritten: dto.overwriteEntitlement === true,
      failed,
    };
  }

  async update(id: string, dto: UpdateLeaveBalanceDto, scope: TenantScope) {
    const current = await this.prisma.leaveBalance.findUnique({
      where: { id },
      select: {
        id: true,
        employee: {
          select: {
            companyId: true,
            branchId: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบข้อมูลวันลาคงเหลือ');
    }

    assertWithinScope(scope, {
      companyId: current.employee.companyId,
      branchId: current.employee.branchId,
    });

    await this.prisma.leaveBalance.update({
      where: {
        id,
      },
      data: {
        entitlementDays: dto.entitlementDays,
        carriedForwardDays: dto.carriedForwardDays,
        adjustedDays: dto.adjustedDays,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });

    return this.findOne(id);
  }

  private async getApplicablePolicies(params: {
    companyId: string;
    branchId: string | null;
    employeeTypeId: string | null;
  }) {
    const policies = await this.prisma.leavePolicy.findMany({
      where: {
        companyId: params.companyId,
        deletedAt: null,
        status: 'ACTIVE',
        leaveType: {
          deletedAt: null,
          status: 'ACTIVE',
        },
        AND: [
          {
            OR: params.branchId
              ? [{ branchId: params.branchId }, { branchId: null }]
              : [{ branchId: null }],
          },
          {
            OR: params.employeeTypeId
              ? [
                  { employeeTypeId: params.employeeTypeId },
                  { employeeTypeId: null },
                ]
              : [{ employeeTypeId: null }],
          },
        ],
      },
      include: {
        leaveType: true,
        quotaTiers: {
          orderBy: { minServiceMonths: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const selectedByLeaveType = new Map<
      string,
      { policy: (typeof policies)[number]; score: number }
    >();

    for (const policy of policies) {
      const score =
        (params.branchId && policy.branchId === params.branchId ? 2 : 0) +
        (params.employeeTypeId &&
        policy.employeeTypeId === params.employeeTypeId
          ? 1
          : 0);
      const current = selectedByLeaveType.get(policy.leaveTypeId);

      if (!current || score > current.score) {
        selectedByLeaveType.set(policy.leaveTypeId, { policy, score });
      }
    }

    return Array.from(selectedByLeaveType.values()).map(({ policy }) => policy);
  }

  private async resolveEmployeeByUserId(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: {
          notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'],
        },
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถดูวันลาคงเหลือของตนเองได้',
      );
    }

    return employee;
  }

  private leaveBalanceInclude() {
    return {
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
          branchId: true,
          departmentId: true,
          divisionId: true,
          employeeTypeId: true,
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
        },
      },
    } satisfies Prisma.LeaveBalanceInclude;
  }

  private formatBalance(item: Prisma.LeaveBalanceGetPayload<{
    include: ReturnType<LeaveBalancesService['leaveBalanceInclude']>;
  }>) {
    const entitlementDays = Number(item.entitlementDays);
    const carriedForwardDays = Number(item.carriedForwardDays);
    const adjustedDays = Number(item.adjustedDays);
    const usedDays = Number(item.usedDays);
    const pendingDays = Number(item.pendingDays);

    const totalAvailableBeforeUsed =
      entitlementDays + carriedForwardDays + adjustedDays;

    const remainingDays = totalAvailableBeforeUsed - usedDays - pendingDays;

    return {
      ...item,
      entitlementDays,
      carriedForwardDays,
      adjustedDays,
      usedDays,
      pendingDays,
      totalAvailableBeforeUsed,
      remainingDays,
    };
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException('ไม่พบข้อมูลผู้ใช้งานปัจจุบัน');
    }

    return actorId;
  }
}