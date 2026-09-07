import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { toPageMeta } from '../helpers/payroll-page-meta.helper';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  requireCompanyId,
} from '../../../common/tenant/tenant-scope.util';
import {
  AttendancePayrollRuleQueryDto,
  CreateAttendancePayrollRuleDto,
  UpdateAttendancePayrollRuleDto,
} from '../dto/attendance-payroll-rule.dto';

/**
 * AttendancePayrollRulesService
 * -----------------------------
 * จัดการกติกาหักเงินจากระบบเวลา เช่น มาสาย ออกก่อน ลืมลงเวลา ขาดงาน
 */
@Injectable()
export class AttendancePayrollRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AttendancePayrollRuleQueryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const where: Record<string, unknown> = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.kind) where.kind = query.kind;
    if (query.status) where.status = query.status;

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const prisma = this.prisma as any;
    const whereForStatus = (status: string) =>
      query.status && query.status !== status ? { ...where, id: '__NO_MATCH__' } : { ...where, status };
    const whereForKind = (kind: string) =>
      query.kind && query.kind !== kind ? { ...where, id: '__NO_MATCH__' } : { ...where, kind };

    const [
      data,
      total,
      active,
      inactive,
      late,
      earlyLeave,
      missingCheckIn,
      missingCheckOut,
      absence,
    ] = await this.prisma.$transaction([
      prisma.attendancePayrollRule.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.attendancePayrollRule.count({ where }),
      prisma.attendancePayrollRule.count({ where: whereForStatus('ACTIVE') }),
      prisma.attendancePayrollRule.count({ where: whereForStatus('INACTIVE') }),
      prisma.attendancePayrollRule.count({ where: whereForKind('LATE') }),
      prisma.attendancePayrollRule.count({ where: whereForKind('EARLY_LEAVE') }),
      prisma.attendancePayrollRule.count({ where: whereForKind('MISSING_CHECK_IN') }),
      prisma.attendancePayrollRule.count({ where: whereForKind('MISSING_CHECK_OUT') }),
      prisma.attendancePayrollRule.count({ where: whereForKind('ABSENCE') }),
    ]);

    return {
      data,
      meta: toPageMeta(page, pageSize, total),
      summary: {
        total,
        active,
        inactive,
        late,
        earlyLeave,
        missingCheckIn,
        missingCheckOut,
        absence,
      },
    };
  }

  async create(dto: CreateAttendancePayrollRuleDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.assertCompany(companyId);

    if (!dto.useSalaryRate && (dto.rateAmount === undefined || dto.rateAmount === null)) {
      throw new BadRequestException('ถ้าไม่ใช้ฐานเงินเดือน ต้องระบุ rateAmount');
    }

    const prisma = this.prisma as any;
    const duplicated = await prisma.attendancePayrollRule.findFirst({
      where: { companyId, code: dto.code.trim().toUpperCase() },
      select: { id: true },
    });

    if (duplicated) throw new BadRequestException('รหัสกติกานี้ถูกใช้งานแล้ว');

    return prisma.attendancePayrollRule.create({
      data: this.buildData({ ...dto, companyId }),
    });
  }

  async update(
    id: string,
    dto: UpdateAttendancePayrollRuleDto,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const current = await prisma.attendancePayrollRule.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('ไม่พบกติกาหักเงินจากเวลา');

    assertWithinScope(scope, { companyId: current.companyId });

    return prisma.attendancePayrollRule.update({
      where: { id },
      data: this.buildData(dto, true),
    });
  }

  async remove(id: string, scope: TenantScope) {
    const prisma = this.prisma as any;
    const current = await prisma.attendancePayrollRule.findFirst({ where: { id, deletedAt: null }, select: { id: true, companyId: true } });
    if (!current) throw new NotFoundException('ไม่พบกติกาหักเงินจากเวลา');

    assertWithinScope(scope, { companyId: current.companyId });

    await prisma.attendancePayrollRule.update({
      where: { id },
      data: { status: 'INACTIVE', deletedAt: new Date() },
    });

    return { id, deleted: true };
  }

  private buildData(dto: Partial<CreateAttendancePayrollRuleDto>, partial = false) {
    return {
      companyId: partial ? undefined : dto.companyId,
      code: dto.code?.trim().toUpperCase(),
      name: dto.name?.trim(),
      description: dto.description === undefined ? undefined : dto.description?.trim() || null,
      kind: dto.kind,
      unit: dto.unit ?? (partial ? undefined : 'PER_OCCURRENCE'),
      componentId: dto.componentId === undefined ? undefined : dto.componentId || null,
      componentCode: dto.componentCode === undefined ? undefined : dto.componentCode?.trim().toUpperCase() || null,
      useSalaryRate: dto.useSalaryRate,
      rateAmount: dto.rateAmount === undefined ? undefined : dto.rateAmount,
      graceMinutes: dto.graceMinutes,
      salaryDivisorDays: dto.salaryDivisorDays,
      salaryDivisorHours: dto.salaryDivisorHours,
      maxDeductionAmount: dto.maxDeductionAmount === undefined ? undefined : dto.maxDeductionAmount,
      isTaxable: dto.isTaxable,
      isSocialSecurityBase: dto.isSocialSecurityBase,
      sortOrder: dto.sortOrder,
      status: dto.status,
      note: dto.note === undefined ? undefined : dto.note?.trim() || null,
    };
  }

  private async assertCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({ where: { id: companyId, deletedAt: null }, select: { id: true } });
    if (!company) throw new NotFoundException('ไม่พบบริษัท');
  }
}
