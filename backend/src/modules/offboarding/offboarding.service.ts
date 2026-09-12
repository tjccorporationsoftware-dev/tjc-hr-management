import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EmployeeStatus,
  MasterStatus,
  OffboardingReasonType,
  OffboardingStatus,
  OffboardingTaskStatus,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';

import {
  CreateOffboardingCaseDto,
  CreateOffboardingChecklistDto,
  CreateOffboardingTaskDto,
  ListOffboardingCasesQueryDto,
  ListOffboardingChecklistsQueryDto,
  ListOffboardingTasksQueryDto,
  OffboardingCaseActionDto,
  OffboardingTaskActionDto,
  SaveExitInterviewDto,
  UpdateOffboardingCaseDto,
  UpdateOffboardingChecklistDto,
} from './dto/offboarding.dto';
import { PayrollSeveranceService } from '../payroll/services/payroll-severance.service';

@Injectable()
export class OffboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly severanceService: PayrollSeveranceService,
  ) {}

  /* ======================================================== */
  /* Checklist                                                */
  /* ======================================================== */

  async findChecklists(
    query: ListOffboardingChecklistsQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);

    const where: Prisma.OffboardingChecklistWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, active] = await Promise.all([
      this.prisma.offboardingChecklist.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          company: { select: { id: true, code: true, nameTh: true } },
        },
      }),
      this.prisma.offboardingChecklist.count({ where }),
      this.prisma.offboardingChecklist.count({
        where: { ...where, status: MasterStatus.ACTIVE },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: { total, active, inactive: total - active },
    };
  }

  async createChecklist(
    dto: CreateOffboardingChecklistDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId =
      scope.level === 'GLOBAL'
        ? (dto.companyId ?? null)
        : (scope.companyId ?? null);

    const duplicate = await this.prisma.offboardingChecklist.findFirst({
      where: { companyId, code: dto.code.trim(), deletedAt: null },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('รหัสเช็กลิสต์นี้ถูกใช้ไปแล้ว');
    }

    const created = await this.prisma.offboardingChecklist.create({
      data: {
        companyId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        description: this.optionalTrim(dto.description),
        status: dto.status ?? MasterStatus.ACTIVE,
        createdById: currentUserId ?? null,
        items: {
          create: dto.items.map((item, index) => ({
            title: item.title.trim(),
            description: this.optionalTrim(item.description),
            category: this.optionalTrim(item.category),
            ownerRole: this.optionalTrim(item.ownerRole),
            sortOrder: item.sortOrder ?? index + 1,
            isRequired: item.isRequired ?? true,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    return created;
  }

  async updateChecklist(
    id: string,
    dto: UpdateOffboardingChecklistDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.offboardingChecklist.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) throw new NotFoundException('ไม่พบเช็กลิสต์');
    assertWithinScope(scope, { companyId: current.companyId });

    await this.prisma.$transaction(async (tx) => {
      await tx.offboardingChecklist.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: this.optionalTrim(dto.description) }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      if (dto.items) {
        await tx.offboardingChecklistItem.deleteMany({
          where: { checklistId: id },
        });

        await tx.offboardingChecklistItem.createMany({
          data: dto.items.map((item, index) => ({
            checklistId: id,
            title: item.title.trim(),
            description: this.optionalTrim(item.description),
            category: this.optionalTrim(item.category),
            ownerRole: this.optionalTrim(item.ownerRole),
            sortOrder: item.sortOrder ?? index + 1,
            isRequired: item.isRequired ?? true,
          })),
        });
      }
    });

    return this.prisma.offboardingChecklist.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async removeChecklist(id: string, scope: TenantScope) {
    const current = await this.prisma.offboardingChecklist.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) throw new NotFoundException('ไม่พบเช็กลิสต์');
    assertWithinScope(scope, { companyId: current.companyId });

    await this.prisma.offboardingChecklist.update({
      where: { id },
      data: { deletedAt: new Date(), status: MasterStatus.INACTIVE },
    });

    return { success: true };
  }

  /* ======================================================== */
  /* Case                                                     */
  /* ======================================================== */

  async findCases(query: ListOffboardingCasesQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);

    // เคสไม่ได้เก็บสาขา/แผนกของตัวเอง ต้องกรองผ่านตัวพนักงานทั้งหมด
    const employeeWhere: Prisma.EmployeeWhereInput = {};

    if (query.q) {
      employeeWhere.OR = [
        { employeeCode: { contains: query.q, mode: 'insensitive' } },
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { displayName: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.branchId) employeeWhere.branchId = query.branchId;
    if (query.departmentId) employeeWhere.departmentId = query.departmentId;

    // สิทธิ์ระดับสาขาต้องทับค่าที่ผู้ใช้ส่งมาเสมอ ไม่งั้นยิง branchId อื่นแล้ว
    // เห็นเคสของสาขาที่ตัวเองไม่มีสิทธิ์ (เดิมไม่ได้กรองสาขาเลย)
    if (scope.level === 'BRANCH' && scope.branchId) {
      employeeWhere.branchId = scope.branchId;
    }

    const where: Prisma.OffboardingCaseWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(Object.keys(employeeWhere).length > 0
        ? { employee: { is: employeeWhere } }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      this.prisma.offboardingCase.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ status: 'asc' }, { effectiveDate: 'asc' }],
        include: this.caseInclude(),
      }),
      this.prisma.offboardingCase.count({ where }),
      this.buildCaseSummary(where),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
    };
  }

  async findCase(id: string, scope: TenantScope) {
    const item = await this.prisma.offboardingCase.findFirst({
      where: { id, deletedAt: null },
      include: this.caseInclude(true),
    });

    if (!item) throw new NotFoundException('ไม่พบเคสการออกจากงาน');
    assertWithinScope(scope, { companyId: item.companyId });

    return {
      ...item,
      leaveBalances: await this.findLeaveBalancesForCase(
        item.employeeId,
        item.effectiveDate,
      ),
      finalPayroll: await this.findFinalPayrollStatus(
        item.employeeId,
        item.companyId,
        item.effectiveDate,
      ),
    };
  }

  /**
   * งวดเงินเดือนที่ครอบวันพ้นสภาพ คำนวณไปหรือยัง
   * -------------------------------------------
   * ตัวคำนวณ payroll ดึงพนักงานจากสถานะ ACTIVE/PROBATION เท่านั้น
   * พอปิดเคสแล้วสถานะกลายเป็นลาออก/เลิกจ้าง คนนั้นจะหลุดจากงวดไปทั้งคน
   * ถ้ายังไม่ได้คำนวณงวดสุดท้ายไว้ก่อน = งวดนั้นได้ 0 บาท และดึงกลับเข้ามาไม่ได้
   *
   * ส่งสถานะให้หน้าเว็บเตือนก่อนกดปิดเคส ระหว่างที่ยังไม่ได้ทำระบบคิดตามวันจริง
   */
  private async findFinalPayrollStatus(
    employeeId: string,
    companyId: string,
    effectiveDate: Date,
  ) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId,
        deletedAt: null,
        startDate: { lte: effectiveDate },
        endDate: { gte: effectiveDate },
      },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { startDate: 'desc' },
    });

    if (!period) {
      return { period: null, calculated: false, runStatus: null };
    }

    const item = await this.prisma.payrollItem.findFirst({
      where: {
        employeeId,
        run: { periodId: period.id, deletedAt: null, status: { not: 'CANCELLED' } },
      },
      select: { id: true, run: { select: { status: true } } },
    });

    return {
      period,
      calculated: Boolean(item),
      runStatus: item?.run.status ?? null,
    };
  }

  /**
   * วันลาคงเหลือ ณ ปีที่พ้นสภาพ
   * --------------------------
   * ระบบมีตัวเลขนี้อยู่แล้วในสมุดวันลา แต่หน้าเคลียร์ของให้ HR พิมพ์เอง
   * ซึ่งเสี่ยงพิมพ์ผิดและไม่มีที่มาให้ตรวจย้อนหลัง ส่งมาให้หน้าเว็บใช้เติมให้เลย
   *
   * ใช้ปีตามวันพ้นสภาพ ไม่ใช่ปีปัจจุบัน เพราะเคสที่บันทึกย้อนหลัง/ล่วงหน้า
   * ต้องอิงสิทธิ์ของปีที่พนักงานออกจริง
   */
  private async findLeaveBalancesForCase(
    employeeId: string,
    effectiveDate: Date,
  ) {
    const rows = await this.prisma.leaveBalance.findMany({
      where: { employeeId, year: effectiveDate.getFullYear() },
      include: {
        leaveType: { select: { id: true, code: true, nameTh: true, isPaid: true } },
      },
      orderBy: { leaveType: { code: 'asc' } },
    });

    // ช่องพวกนี้ไม่เป็น null ตามสคีมา แปลงตรง ๆ ได้เลย
    const days = (value: Prisma.Decimal) => Number(value) || 0;

    return rows.map((row) => {
      const available =
        days(row.entitlementDays) +
        days(row.carriedForwardDays) +
        days(row.adjustedDays);

      return {
        leaveTypeId: row.leaveTypeId,
        code: row.leaveType.code,
        nameTh: row.leaveType.nameTh,
        isPaid: row.leaveType.isPaid,
        year: row.year,
        usedDays: days(row.usedDays),
        pendingDays: days(row.pendingDays),
        // รออนุมัติถือว่ากันสิทธิ์ไว้แล้ว ต้องหักออกด้วย ไม่งั้นจ่ายเกิน
        remainingDays:
          available - days(row.usedDays) - days(row.pendingDays),
      };
    });
  }

  async createCase(
    dto: CreateOffboardingCaseDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, deletedAt: null },
      select: { id: true, companyId: true, branchId: true },
    });

    if (!employee) throw new NotFoundException('ไม่พบพนักงาน');
    assertWithinScope(scope, {
      companyId: employee.companyId,
      branchId: employee.branchId,
    });

    const companyId = requireCompanyId(scope, employee.companyId);

    if (new Date(dto.effectiveDate) < new Date(dto.lastWorkingDate)) {
      throw new BadRequestException(
        'วันพ้นสภาพต้องไม่ก่อนวันทำงานวันสุดท้าย',
      );
    }

    const open = await this.prisma.offboardingCase.findFirst({
      where: {
        employeeId: dto.employeeId,
        status: OffboardingStatus.IN_PROGRESS,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (open) {
      throw new ConflictException(
        'พนักงานคนนี้มีเคสการออกจากงานที่ยังไม่ปิดอยู่แล้ว',
      );
    }

    return this.createCaseInternal(this.prisma, {
      companyId,
      employeeId: dto.employeeId,
      resignationId: dto.resignationId ?? null,
      checklistId: dto.checklistId ?? null,
      reasonType: dto.reasonType ?? OffboardingReasonType.RESIGNATION,
      lastWorkingDate: new Date(dto.lastWorkingDate),
      effectiveDate: new Date(dto.effectiveDate),
      note: this.optionalTrim(dto.note),
      currentUserId,
    });
  }

  /**
   * สร้างเคสพร้อมกางงานจากเช็กลิสต์
   * แยกออกมาเพื่อให้โมดูล employees เรียกใช้ตอนอนุมัติใบลาออกได้ด้วย
   */
  async createCaseInternal(
    client: Prisma.TransactionClient | PrismaService,
    input: {
      companyId: string;
      employeeId: string;
      resignationId?: string | null;
      checklistId?: string | null;
      reasonType: OffboardingReasonType;
      lastWorkingDate: Date;
      effectiveDate: Date;
      note?: string | null;
      currentUserId?: string;
    },
  ) {
    const checklistId =
      input.checklistId ??
      (await this.resolveDefaultChecklistId(client, input.companyId));

    const created = await client.offboardingCase.create({
      data: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        resignationId: input.resignationId ?? null,
        checklistId,
        reasonType: input.reasonType,
        lastWorkingDate: input.lastWorkingDate,
        effectiveDate: input.effectiveDate,
        note: input.note ?? null,
        createdById: input.currentUserId ?? null,
      },
    });

    if (checklistId) {
      const items = await client.offboardingChecklistItem.findMany({
        where: { checklistId },
        orderBy: { sortOrder: 'asc' },
      });

      if (items.length > 0) {
        await client.offboardingTask.createMany({
          data: items.map((item) => ({
            companyId: input.companyId,
            employeeId: input.employeeId,
            caseId: created.id,
            checklistItemId: item.id,
            title: item.title,
            description: item.description,
            category: item.category,
            ownerRole: item.ownerRole,
            isRequired: item.isRequired,
            dueDate: input.lastWorkingDate,
          })),
        });
      }
    }

    return created;
  }

  async updateCase(
    id: string,
    dto: UpdateOffboardingCaseDto,
    scope: TenantScope,
  ) {
    const current = await this.getOpenCaseOrFail(id, scope);

    return this.prisma.offboardingCase.update({
      where: { id },
      data: {
        ...(dto.checklistId !== undefined
          ? { checklistId: dto.checklistId || null }
          : {}),
        ...(dto.reasonType !== undefined ? { reasonType: dto.reasonType } : {}),
        ...(dto.lastWorkingDate !== undefined
          ? { lastWorkingDate: new Date(dto.lastWorkingDate) }
          : {}),
        ...(dto.effectiveDate !== undefined
          ? { effectiveDate: new Date(dto.effectiveDate) }
          : {}),
        ...(dto.unusedLeaveDays !== undefined
          ? { unusedLeaveDays: new Prisma.Decimal(dto.unusedLeaveDays) }
          : {}),
        ...(dto.severancePay !== undefined
          ? { severancePay: new Prisma.Decimal(dto.severancePay) }
          : {}),
        ...(dto.finalPayNote !== undefined
          ? { finalPayNote: this.optionalTrim(dto.finalPayNote) }
          : {}),
        ...(dto.terminatedWithCause !== undefined
          ? { terminatedWithCause: dto.terminatedWithCause }
          : {}),
        ...(dto.noticePayDays !== undefined
          ? { noticePayDays: new Prisma.Decimal(dto.noticePayDays) }
          : {}),
        ...(dto.specialSeveranceDays !== undefined
          ? {
              specialSeveranceDays: new Prisma.Decimal(
                dto.specialSeveranceDays,
              ),
            }
          : {}),
        ...(dto.otherSeparationPay !== undefined
          ? { otherSeparationPay: new Prisma.Decimal(dto.otherSeparationPay) }
          : {}),
        ...(dto.note !== undefined ? { note: this.optionalTrim(dto.note) } : {}),
      },
      include: this.caseInclude(true),
    });

    void current;
  }

  /**
   * คำนวณค่าชดเชยและภาษีของเคสนี้ แล้วบันทึกผลลงใบ
   *
   * เก็บผลเต็มรูปแบบไว้ใน severanceBreakdown ด้วย เพื่อให้ตรวจย้อนหลังได้ว่า
   * ตอนนั้นคิดจากค่าจ้างเท่าไร บันไดขั้นไหน และได้สิทธิยกเว้นภาษีเท่าไร
   * ถ้าภายหลังบริษัทแก้บันไดหรือแก้ค่าจ้าง ตัวเลขที่บันทึกไว้จะไม่เปลี่ยนตาม
   */
  async calculateSeverance(id: string, scope: TenantScope) {
    const current = await this.getOpenCaseOrFail(id, scope);

    const quote = await this.severanceService.quote(current.employeeId, {
      reasonType: current.reasonType,
      lastWorkingDate: current.lastWorkingDate,
      overrides: {
        terminatedWithCause: current.terminatedWithCause,
        noticePayDays: this.decimalToNumber(current.noticePayDays),
        unusedLeaveDays: this.decimalToNumber(current.unusedLeaveDays),
        specialSeveranceDays: this.decimalToNumber(
          current.specialSeveranceDays,
        ),
        otherSeparationPay: this.decimalToNumber(current.otherSeparationPay),
      },
    });

    await this.prisma.offboardingCase.update({
      where: { id },
      data: {
        severancePay: new Prisma.Decimal(quote.severance.totalAmount),
        severanceBreakdown: quote,
        severanceCalculatedAt: new Date(),
      },
    });

    return quote;
  }

  /**
   * ส่งเงินงวดสุดท้ายเข้าระบบเงินเดือน
   * ================================
   * เดิมค่าชดเชย/เงินแทนวันลาที่กรอกในหน้านี้ถูกเก็บอยู่ในตารางของ offboarding
   * เฉย ๆ ไม่มีตัวแปลงเป็นรายการจ่าย HR ต้องไปตั้งรายการเองที่หน้า payroll
   * ซึ่งพิมพ์ตัวเลขผิดได้ และไม่มีที่มาให้ตรวจย้อนหลัง
   *
   * ตัวนี้แปลงผลคำนวณค่าชดเชยเป็น PayrollAdjustment ให้ตรง ๆ
   * แล้วงวดที่ครอบวันพ้นสภาพจะดูดเข้าไปเองตอนคำนวณ
   *
   * ธงภาษี/ประกันสังคมของเงินก้อนตอนออกจากงาน
   * ------------------------------------------
   * - ไม่เป็นฐานประกันสังคม (ไม่ใช่ค่าจ้างจากการทำงาน)
   * - ไม่เอาเข้าประมาณการภาษีรายเดือน เพราะต้องแยกคำนวณตามใบแนบ ภ.ง.ด.1
   *   ถ้าปล่อยให้เข้าสูตรรายเดือน เงินได้ทั้งปีจะพุ่งจนหักภาษีเกินมหาศาล
   *   จึงตั้งภาษีเงินก้อนเป็นรายการหักแยกตามที่ตัวคำนวณได้มาแทน
   */
  async sendFinalPayToPayroll(
    id: string,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.offboardingCase.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) throw new NotFoundException('ไม่พบเคสการออกจากงาน');
    assertWithinScope(scope, { companyId: current.companyId });

    if (!current.severanceCalculatedAt || !current.severanceBreakdown) {
      throw new BadRequestException(
        'ยังไม่ได้คำนวณค่าชดเชย กดคำนวณก่อนแล้วค่อยส่งเข้าระบบเงินเดือน',
      );
    }

    const quote = current.severanceBreakdown as unknown as {
      severance: {
        lines: Array<{
          code: string;
          nameTh: string;
          days: number;
          amount: number;
          isStatutorySeverance: boolean;
        }>;
      };
      tax: { separateTax: number; exemptAmount: number };
    };

    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId: current.companyId,
        deletedAt: null,
        startDate: { lte: current.effectiveDate },
        endDate: { gte: current.effectiveDate },
      },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { startDate: 'desc' },
    });

    if (period && ['LOCKED', 'CLOSED', 'CANCELLED'].includes(period.status)) {
      throw new BadRequestException(
        `งวด ${period.name ?? period.code ?? ''} ถูกปิดแล้ว ส่งรายการเข้าไม่ได้`,
      );
    }

    const codePrefix = `OFFBOARDING_${current.id.slice(-8).toUpperCase()}`;

    // กดซ้ำได้ — ล้างของเดิมที่ยังไม่ถูกดูดเข้างวดแล้วสร้างใหม่จากตัวเลขล่าสุด
    const existing = await this.prisma.payrollAdjustment.findMany({
      where: { employeeId: current.employeeId, code: { startsWith: codePrefix } },
      select: { id: true, importedAt: true, code: true },
    });

    const alreadyImported = existing.filter((row) => row.importedAt);

    if (alreadyImported.length > 0) {
      throw new BadRequestException(
        'รายการเงินงวดสุดท้ายถูกดึงเข้างวดเงินเดือนไปแล้ว แก้ที่หน้างวดเงินเดือนแทน',
      );
    }

    await this.prisma.payrollAdjustment.deleteMany({
      where: { id: { in: existing.map((row) => row.id) } },
    });

    const lines = (quote.severance?.lines ?? []).filter(
      (line) => Number(line.amount) > 0,
    );

    if (lines.length === 0) {
      throw new BadRequestException('ไม่มียอดเงินงวดสุดท้ายที่ต้องจ่าย');
    }

    const separateTax = Number(quote.tax?.separateTax ?? 0);

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await Promise.all(
        lines.map((line, index) =>
          tx.payrollAdjustment.create({
            data: {
              companyId: current.companyId,
              employeeId: current.employeeId,
              periodId: period?.id ?? null,
              code: `${codePrefix}_${line.code}`,
              name: line.nameTh,
              type: 'EARNING',
              sourceType: 'ADJUSTMENT',
              quantity: new Prisma.Decimal(line.days || 1),
              rate: new Prisma.Decimal(
                line.days > 0 ? Number(line.amount) / line.days : line.amount,
              ),
              amount: new Prisma.Decimal(line.amount),
              effectiveDate: current.effectiveDate,
              isTaxable: false,
              isSocialSecurityBase: false,
              sortOrder: 900 + index,
              status: 'APPROVED',
              approvedAt: new Date(),
              approvedById: currentUserId ?? null,
              reason: 'เงินงวดสุดท้ายจากเคสออกจากงาน',
              note: `คำนวณเมื่อ ${current.severanceCalculatedAt?.toISOString()}`,
              createdById: currentUserId ?? null,
            },
          }),
        ),
      );

      if (separateTax > 0) {
        rows.push(
          await tx.payrollAdjustment.create({
            data: {
              companyId: current.companyId,
              employeeId: current.employeeId,
              periodId: period?.id ?? null,
              code: `${codePrefix}_SEPARATION_TAX`,
              name: 'ภาษีเงินได้จากการออกจากงาน (แยกคำนวณ ใบแนบ ภ.ง.ด.1)',
              type: 'DEDUCTION',
              sourceType: 'TAX',
              amount: new Prisma.Decimal(separateTax),
              effectiveDate: current.effectiveDate,
              isTaxable: false,
              isSocialSecurityBase: false,
              sortOrder: 990,
              status: 'APPROVED',
              approvedAt: new Date(),
              approvedById: currentUserId ?? null,
              reason: 'ภาษีเงินก้อนตอนออกจากงาน แยกคำนวณต่างหากจากภาษีรายเดือน',
              createdById: currentUserId ?? null,
            },
          }),
        );
      }

      return rows;
    });

    return {
      period,
      adjustmentCount: created.length,
      totalEarning: lines.reduce((sum, line) => sum + Number(line.amount), 0),
      separateTax,
      adjustments: created,
    };
  }

  private decimalToNumber(value: Prisma.Decimal | null | undefined) {
    if (value === null || value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  /** ปิดสิทธิ์เข้าใช้ระบบของพนักงานที่กำลังจะออก */
  async revokeAccess(id: string, scope: TenantScope) {
    const current = await this.getOpenCaseOrFail(id, scope);

    if (current.accessRevokedAt) {
      throw new BadRequestException('ปิดสิทธิ์เข้าระบบไปแล้ว');
    }

    await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: current.employeeId },
        select: { userId: true },
      });

      if (employee?.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { status: UserStatus.INACTIVE },
        });
      }

      await tx.offboardingCase.update({
        where: { id },
        data: { accessRevokedAt: new Date() },
      });
    });

    return this.findCase(id, scope);
  }

  /** กันไม่ให้ถูกดึงเข้างวดเงินเดือนถัดไป */
  async stopPayroll(id: string, scope: TenantScope) {
    const current = await this.getOpenCaseOrFail(id, scope);

    if (current.payrollStoppedAt) {
      throw new BadRequestException('หยุดจ่ายเงินเดือนไปแล้ว');
    }

    await this.prisma.offboardingCase.update({
      where: { id },
      data: { payrollStoppedAt: new Date() },
    });

    return this.findCase(id, scope);
  }

  /** บันทึกว่าแจ้งออกประกันสังคมแล้ว (สปส. 6-09) */
  async markSocialSecurityNotified(id: string, scope: TenantScope) {
    const current = await this.getOpenCaseOrFail(id, scope);

    if (current.socialSecurityNotifiedAt) {
      throw new BadRequestException('แจ้งออกประกันสังคมไปแล้ว');
    }

    await this.prisma.offboardingCase.update({
      where: { id },
      data: { socialSecurityNotifiedAt: new Date() },
    });

    return this.findCase(id, scope);
  }

  /** ปิดเคส — ต้องเคลียร์งานที่บังคับให้ครบก่อน */
  async completeCase(
    id: string,
    dto: OffboardingCaseActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.getOpenCaseOrFail(id, scope);

    const pendingRequired = await this.prisma.offboardingTask.count({
      where: {
        caseId: id,
        deletedAt: null,
        isRequired: true,
        status: {
          in: [OffboardingTaskStatus.PENDING, OffboardingTaskStatus.IN_PROGRESS],
        },
      },
    });

    if (pendingRequired > 0) {
      throw new BadRequestException(
        `ยังมีรายการบังคับที่ยังไม่เคลียร์อีก ${pendingRequired} รายการ`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.offboardingCase.update({
        where: { id },
        data: {
          status: OffboardingStatus.COMPLETED,
          completedAt: new Date(),
          completedById: currentUserId ?? null,
          ...(dto.note ? { note: dto.note.trim() } : {}),
        },
      });

      // พ้นสภาพแล้ว ปิดสิทธิ์ให้แน่ใจว่าเข้าระบบไม่ได้
      const employee = await tx.employee.findUnique({
        where: { id: current.employeeId },
        select: { userId: true, status: true },
      });

      if (employee?.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { status: UserStatus.INACTIVE },
        });
      }

      if (
        employee &&
        employee.status !== EmployeeStatus.RESIGNED &&
        employee.status !== EmployeeStatus.TERMINATED
      ) {
        await tx.employee.update({
          where: { id: current.employeeId },
          data: {
            status:
              current.reasonType === OffboardingReasonType.TERMINATION ||
              current.reasonType === OffboardingReasonType.LAYOFF
                ? EmployeeStatus.TERMINATED
                : EmployeeStatus.RESIGNED,
            // payroll ใช้ค่านี้คิดเงินงวดสุดท้ายตามวันที่เป็นพนักงานจริง
            // ถ้าไม่เขียน คนที่ออกกลางงวดจะหลุดจากงวดทั้งคนเหมือนเดิม
            employmentEndDate: current.effectiveDate,
          },
        });
      } else if (employee) {
        // เคยเปลี่ยนสถานะไว้แล้วจากทางอื่น แต่ยังไม่มีวันสิ้นสุด
        await tx.employee.update({
          where: { id: current.employeeId },
          data: { employmentEndDate: current.effectiveDate },
        });
      }
    });

    return this.findCase(id, scope);
  }

  async cancelCase(
    id: string,
    dto: OffboardingCaseActionDto,
    scope: TenantScope,
  ) {
    await this.getOpenCaseOrFail(id, scope);

    await this.prisma.offboardingCase.update({
      where: { id },
      data: {
        status: OffboardingStatus.CANCELLED,
        cancelledAt: new Date(),
        ...(dto.note ? { note: dto.note.trim() } : {}),
      },
    });

    return this.findCase(id, scope);
  }

  /* ======================================================== */
  /* Task                                                     */
  /* ======================================================== */

  async findTasks(query: ListOffboardingTasksQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);

    const where: Prisma.OffboardingTaskWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.caseId ? { caseId: query.caseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { title: { contains: query.q, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.offboardingTask.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              nickname: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
        },
      }),
      this.prisma.offboardingTask.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createTask(dto: CreateOffboardingTaskDto, scope: TenantScope) {
    const parent = await this.getOpenCaseOrFail(dto.caseId, scope);

    return this.prisma.offboardingTask.create({
      data: {
        companyId: parent.companyId,
        employeeId: parent.employeeId,
        caseId: parent.id,
        title: dto.title.trim(),
        description: this.optionalTrim(dto.description),
        category: this.optionalTrim(dto.category),
        ownerRole: this.optionalTrim(dto.ownerRole),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : parent.lastWorkingDate,
        isRequired: dto.isRequired ?? true,
      },
    });
  }

  async actOnTask(
    id: string,
    action: 'start' | 'complete' | 'waive' | 'cancel',
    dto: OffboardingTaskActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.offboardingTask.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) throw new NotFoundException('ไม่พบรายการ');
    assertWithinScope(scope, { companyId: current.companyId });

    if (
      current.status === OffboardingTaskStatus.COMPLETED ||
      current.status === OffboardingTaskStatus.CANCELLED
    ) {
      throw new BadRequestException('รายการนี้ปิดไปแล้ว');
    }

    const now = new Date();
    const note = this.optionalTrim(dto.note) ?? current.note;

    const data: Prisma.OffboardingTaskUncheckedUpdateInput =
      action === 'start'
        ? { status: OffboardingTaskStatus.IN_PROGRESS, note }
        : action === 'complete'
          ? {
              status: OffboardingTaskStatus.COMPLETED,
              completedAt: now,
              completedById: currentUserId ?? null,
              note,
            }
          : action === 'waive'
            ? {
                status: OffboardingTaskStatus.WAIVED,
                completedAt: now,
                completedById: currentUserId ?? null,
                note,
              }
            : {
                status: OffboardingTaskStatus.CANCELLED,
                cancelledAt: now,
                note,
              };

    return this.prisma.offboardingTask.update({ where: { id }, data });
  }

  /* ======================================================== */
  /* Exit interview                                           */
  /* ======================================================== */

  async saveExitInterview(
    caseId: string,
    dto: SaveExitInterviewDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.offboardingCase.findFirst({
      where: { id: caseId, deletedAt: null },
    });

    if (!current) throw new NotFoundException('ไม่พบเคสการออกจากงาน');
    assertWithinScope(scope, { companyId: current.companyId });

    const data = {
      interviewDate: dto.interviewDate ? new Date(dto.interviewDate) : new Date(),
      interviewerId: currentUserId ?? null,
      primaryReason: this.optionalTrim(dto.primaryReason),
      recommendScore: dto.recommendScore ?? null,
      wouldRehire: dto.wouldRehire ?? null,
      whatWorkedWell: this.optionalTrim(dto.whatWorkedWell),
      whatToImprove: this.optionalTrim(dto.whatToImprove),
      note: this.optionalTrim(dto.note),
    };

    return this.prisma.exitInterview.upsert({
      where: { caseId },
      create: { caseId, ...data },
      update: data,
    });
  }

  /* ======================================================== */
  /* Helpers                                                  */
  /* ======================================================== */

  private async getOpenCaseOrFail(id: string, scope: TenantScope) {
    const current = await this.prisma.offboardingCase.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) throw new NotFoundException('ไม่พบเคสการออกจากงาน');
    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== OffboardingStatus.IN_PROGRESS) {
      throw new BadRequestException('เคสนี้ปิดไปแล้ว แก้ไขไม่ได้');
    }

    return current;
  }

  /** เช็กลิสต์เริ่มต้นของบริษัท ใช้ตอนเปิดเคสอัตโนมัติ */
  private async resolveDefaultChecklistId(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
  ) {
    const checklist = await client.offboardingChecklist.findFirst({
      where: {
        deletedAt: null,
        status: MasterStatus.ACTIVE,
        OR: [{ companyId }, { companyId: null }],
      },
      orderBy: [{ companyId: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    return checklist?.id ?? null;
  }

  private caseInclude(full = false) {
    return {
      company: { select: { id: true, code: true, nameTh: true } },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          startDate: true,
          status: true,
          department: { select: { id: true, code: true, nameTh: true } },
          branch: { select: { id: true, code: true, nameTh: true } },
        },
      },
      checklist: { select: { id: true, code: true, name: true } },
      resignation: {
        select: {
          id: true,
          reason: true,
          resignationDate: true,
          effectiveDate: true,
          status: true,
        },
      },
      exitInterview: true,
      ...(full
        ? {
            tasks: {
              where: { deletedAt: null },
              orderBy: [{ status: 'asc' as const }, { createdAt: 'asc' as const }],
            },
          }
        : {
            _count: { select: { tasks: { where: { deletedAt: null } } } },
          }),
    };
  }

  private buildCaseSummary(where: Prisma.OffboardingCaseWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const [total, inProgress, completed, cancelled, accessPending] =
        await Promise.all([
          tx.offboardingCase.count({ where }),
          tx.offboardingCase.count({
            where: { ...where, status: OffboardingStatus.IN_PROGRESS },
          }),
          tx.offboardingCase.count({
            where: { ...where, status: OffboardingStatus.COMPLETED },
          }),
          tx.offboardingCase.count({
            where: { ...where, status: OffboardingStatus.CANCELLED },
          }),
          // เลยวันพ้นสภาพแล้วแต่ยังไม่ปิดสิทธิ์ = ความเสี่ยงที่ต้องรีบจัดการ
          tx.offboardingCase.count({
            where: {
              ...where,
              status: OffboardingStatus.IN_PROGRESS,
              accessRevokedAt: null,
              effectiveDate: { lt: new Date() },
            },
          }),
        ]);

      return { total, inProgress, completed, cancelled, accessPending };
    });
  }

  private optionalTrim(value?: string | null) {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
