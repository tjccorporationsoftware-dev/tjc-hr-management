import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { toDateOnly } from '../utils/payroll-date.util';
import { toPageMeta } from '../helpers/payroll-page-meta.helper';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  requireCompanyId,
} from '../../../common/tenant/tenant-scope.util';
import {
  CreatePayrollAdjustmentDto,
  PayrollAdjustmentActionDto,
  PayrollAdjustmentQueryDto,
  UpdatePayrollAdjustmentDto,
} from '../dto/payroll-adjustment.dto';

/**
 * PayrollAdjustmentsService
 * -------------------------
 * จัดการรายการเพิ่ม/หักเฉพาะงวด เช่น โบนัส ค่าคอมมิชชั่น หักเงินยืม หักค่าเสียหาย
 */
@Injectable()
export class PayrollAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PayrollAdjustmentQueryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const where: Record<string, unknown> = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;

    const employeeIds = await this.resolveEmployeeIdsForQuery(query);
    if (employeeIds) where.employeeId = { in: employeeIds.length ? employeeIds : ['__NO_MATCH__'] };

    if (query.periodId) where.periodId = query.periodId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
        { note: { contains: q, mode: 'insensitive' } },
      ];
    }

    const prisma = this.prisma as any;
    const whereForStatus = (status: string) =>
      query.status && query.status !== status ? { ...where, id: '__NO_MATCH__' } : { ...where, status };
    const whereForType = (type: string) =>
      query.type && query.type !== type ? { ...where, id: '__NO_MATCH__' } : { ...where, type };

    const [
      data,
      total,
      draft,
      approved,
      cancelled,
      imported,
      earningAggregate,
      deductionAggregate,
    ] = await this.prisma.$transaction([
      prisma.payrollAdjustment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.payrollAdjustment.count({ where }),
      prisma.payrollAdjustment.count({ where: whereForStatus('DRAFT') }),
      prisma.payrollAdjustment.count({ where: whereForStatus('APPROVED') }),
      prisma.payrollAdjustment.count({ where: whereForStatus('CANCELLED') }),
      prisma.payrollAdjustment.count({ where: whereForStatus('IMPORTED') }),
      prisma.payrollAdjustment.aggregate({
        where: whereForType('EARNING'),
        _sum: { amount: true },
      }),
      prisma.payrollAdjustment.aggregate({
        where: whereForType('DEDUCTION'),
        _sum: { amount: true },
      }),
    ]);

    const earningAmount = Number(earningAggregate?._sum?.amount ?? 0);
    const deductionAmount = Math.abs(Number(deductionAggregate?._sum?.amount ?? 0));

    const hydratedData = await this.hydrateAdjustments(data);

    return {
      data: hydratedData,
      meta: toPageMeta(page, pageSize, total),
      summary: {
        total,
        draft,
        approved,
        cancelled,
        imported,
        earningAmount,
        deductionAmount,
        netAmount: earningAmount - deductionAmount,
      },
    };
  }

  private async resolveEmployeeIdsForQuery(query: PayrollAdjustmentQueryDto) {
    const employeeStatus =
      query.employeeStatus === 'ALL'
        ? undefined
        : ((query.employeeStatus ?? EmployeeStatus.ACTIVE) as EmployeeStatus);

    const where: Record<string, unknown> = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.employeeId) where.id = query.employeeId;
    if (employeeStatus) where.status = employeeStatus;

    const mustResolve =
      Boolean(query.employeeId) ||
      Boolean(query.branchId) ||
      Boolean(query.companyId) ||
      Boolean(employeeStatus);

    if (!mustResolve) return null;

    const prisma = this.prisma as any;
    const employees = await prisma.employee.findMany({
      where,
      select: { id: true },
    });

    return employees.map((employee: { id: string }) => employee.id);
  }

  private async hydrateAdjustments<T extends Record<string, any>>(items: T[]) {
    if (!items.length) return items;

    const prisma = this.prisma as any;
    const companyIds = Array.from(
      new Set(items.map((item) => item.companyId).filter(Boolean)),
    );
    const employeeIds = Array.from(
      new Set(items.map((item) => item.employeeId).filter(Boolean)),
    );
    const periodIds = Array.from(
      new Set(items.map((item) => item.periodId).filter(Boolean)),
    );
    const componentIds = Array.from(
      new Set(items.map((item) => item.componentId).filter(Boolean)),
    );
    const payrollRunIds = Array.from(
      new Set(items.map((item) => item.payrollRunId).filter(Boolean)),
    );

    const [companies, employees, periods, components, payrollRuns] = await Promise.all([
      companyIds.length
        ? prisma.company.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, code: true, nameTh: true, nameEn: true },
          })
        : [],
      employeeIds.length
        ? prisma.employee.findMany({
            where: { id: { in: employeeIds } },
            select: {
              id: true,
              employeeCode: true,
              nickname: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
              status: true,
              companyId: true,
              branchId: true,
              company: {
                select: { id: true, code: true, nameTh: true, nameEn: true },
              },
              branch: {
                select: { id: true, code: true, nameTh: true, nameEn: true },
              },
              department: {
                select: { id: true, code: true, nameTh: true },
              },
            },
          })
        : [],
      periodIds.length
        ? prisma.payrollPeriod.findMany({
            where: { id: { in: periodIds } },
            select: {
              id: true,
              companyId: true,
              code: true,
              name: true,
              year: true,
              month: true,
              startDate: true,
              endDate: true,
              paymentDate: true,
              status: true,
            },
          })
        : [],
      componentIds.length
        ? prisma.payrollComponent.findMany({
            where: { id: { in: componentIds } },
            select: {
              id: true,
              companyId: true,
              code: true,
              nameTh: true,
              nameEn: true,
              type: true,
              sourceType: true,
              isTaxable: true,
              isSocialSecurityBase: true,
              isRecurring: true,
              status: true,
            },
          })
        : [],
      payrollRunIds.length
        ? prisma.payrollRun.findMany({
            where: { id: { in: payrollRunIds }, deletedAt: null },
            select: {
              id: true,
              periodId: true,
              runNo: true,
              name: true,
              status: true,
              calculatedAt: true,
              approvedAt: true,
              paidAt: true,
              period: {
                select: {
                  id: true,
                  companyId: true,
                  code: true,
                  name: true,
                  year: true,
                  month: true,
                  startDate: true,
                  endDate: true,
                  paymentDate: true,
                  status: true,
                },
              },
            },
          })
        : [],
    ]);

    const companyById = new Map(companies.map((company: any) => [company.id, company]));
    const employeeById = new Map(employees.map((employee: any) => [employee.id, employee]));
    const periodById = new Map(periods.map((period: any) => [period.id, period]));
    const componentById = new Map(
      components.map((component: any) => [component.id, component]),
    );
    const payrollRunById = new Map(
      payrollRuns.map((payrollRun: any) => [payrollRun.id, payrollRun]),
    );

    return items.map((item) => {
      const payrollRun = item.payrollRunId
        ? ((payrollRunById.get(item.payrollRunId) ?? null) as any | null)
        : null;

      return {
        ...item,
        company: companyById.get(item.companyId) ?? null,
        employee: employeeById.get(item.employeeId) ?? null,
        period: item.periodId
          ? periodById.get(item.periodId) ?? null
          : payrollRun?.period ?? null,
        component: item.componentId
          ? componentById.get(item.componentId) ?? null
          : null,
        payrollRun,
      };
    });
  }

  private async hydrateAdjustment<T extends Record<string, any>>(item: T) {
    const [hydrated] = await this.hydrateAdjustments([item]);
    return hydrated;
  }

  async create(
    dto: CreatePayrollAdjustmentDto,
    userId?: string,
    scope?: TenantScope,
  ) {
    const companyId = scope
      ? requireCompanyId(scope, dto.companyId)
      : dto.companyId;
    await this.assertCompany(companyId);
    await this.assertEmployee(dto.employeeId, companyId);

    if (dto.componentId) await this.assertPayrollComponent(dto.componentId, companyId);

    const payrollPeriod = dto.periodId
      ? await this.assertPayrollPeriod(dto.periodId, companyId)
      : null;

    const quantity = Number(dto.quantity ?? 1);
    const rate = Number(dto.rate ?? dto.amount ?? 0);
    const amount = Number(dto.amount ?? quantity * rate);

    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('จำนวนเงินต้องไม่น้อยกว่า 0');
    }

    const prisma = this.prisma as any;
    const created = await prisma.payrollAdjustment.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        periodId: dto.periodId || null,
        componentId: dto.componentId || null,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        type: dto.type,
        sourceType: dto.sourceType ?? 'ADJUSTMENT',
        quantity,
        rate,
        amount,
        effectiveDate: dto.effectiveDate
          ? toDateOnly(dto.effectiveDate)
          : payrollPeriod?.startDate ?? null,
        isTaxable: dto.isTaxable ?? dto.type === 'EARNING',
        isSocialSecurityBase: dto.isSocialSecurityBase ?? false,
        sortOrder: dto.sortOrder ?? 500,
        status: 'DRAFT',
        reason: dto.reason?.trim() || null,
        note: dto.note?.trim() || null,
        createdById: userId ?? null,
      },
    });

    return this.hydrateAdjustment(created);
  }

  async update(
    id: string,
    dto: UpdatePayrollAdjustmentDto,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const current = await prisma.payrollAdjustment.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('ไม่พบรายการปรับเงินเดือน');
    assertWithinScope(scope, { companyId: current.companyId });
    if (current.status === 'IMPORTED') throw new BadRequestException('รายการนี้ถูกนำเข้า Payroll แล้ว ไม่สามารถแก้ไขได้');

    const nextPeriodId =
      dto.periodId === undefined ? current.periodId : dto.periodId || null;
    const payrollPeriod = nextPeriodId
      ? await this.assertPayrollPeriod(nextPeriodId, current.companyId)
      : null;

    const updated = await prisma.payrollAdjustment.update({
      where: { id },
      data: {
        periodId: dto.periodId === undefined ? undefined : dto.periodId || null,
        componentId: dto.componentId === undefined ? undefined : dto.componentId || null,
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        type: dto.type,
        quantity: dto.quantity,
        rate: dto.rate,
        amount: dto.amount,
        effectiveDate:
          dto.effectiveDate === undefined
            ? dto.periodId !== undefined && payrollPeriod && !current.effectiveDate
              ? payrollPeriod.startDate
              : undefined
            : dto.effectiveDate
              ? toDateOnly(dto.effectiveDate)
              : payrollPeriod?.startDate ?? null,
        isTaxable: dto.isTaxable,
        isSocialSecurityBase: dto.isSocialSecurityBase,
        sortOrder: dto.sortOrder,
        reason: dto.reason === undefined ? undefined : dto.reason?.trim() || null,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });

    return this.hydrateAdjustment(updated);
  }

  async approve(
    id: string,
    dto: PayrollAdjustmentActionDto,
    userId?: string,
    scope?: TenantScope,
  ) {
    const current = await this.findRaw(id);
    if (scope) assertWithinScope(scope, { companyId: current.companyId });
    if (current.status !== 'DRAFT') throw new BadRequestException('อนุมัติได้เฉพาะรายการสถานะร่าง');

    const updated = await (this.prisma as any).payrollAdjustment.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: userId ?? null,
        note: dto.note?.trim() || current.note,
      },
    });

    return this.hydrateAdjustment(updated);
  }

  async cancel(
    id: string,
    dto: PayrollAdjustmentActionDto,
    userId?: string,
    scope?: TenantScope,
  ) {
    const current = await this.findRaw(id);
    if (scope) assertWithinScope(scope, { companyId: current.companyId });
    if (current.status === 'IMPORTED') throw new BadRequestException('รายการนี้เข้า Payroll แล้ว ไม่สามารถยกเลิกได้');

    const updated = await (this.prisma as any).payrollAdjustment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: userId ?? null,
        reason: dto.reason?.trim() || current.reason,
        note: dto.note?.trim() || current.note,
      },
    });

    return this.hydrateAdjustment(updated);
  }

  async remove(id: string, scope: TenantScope) {
    const current = await this.findRaw(id);
    assertWithinScope(scope, { companyId: current.companyId });
    if (current.status === 'IMPORTED') throw new BadRequestException('รายการนี้เข้า Payroll แล้ว ไม่สามารถลบได้');

    await (this.prisma as any).payrollAdjustment.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });

    return { id, deleted: true };
  }

  private async findRaw(id: string) {
    const item = await (this.prisma as any).payrollAdjustment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!item) throw new NotFoundException('ไม่พบรายการปรับเงินเดือน');
    return item;
  }

  private async assertCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({ where: { id: companyId, deletedAt: null }, select: { id: true } });
    if (!company) throw new NotFoundException('ไม่พบบริษัท');
  }

  private async assertEmployee(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId, deletedAt: null }, select: { id: true } });
    if (!employee) throw new NotFoundException('ไม่พบพนักงานในบริษัทที่เลือก');
  }

  private async assertPayrollPeriod(periodId: string, companyId: string) {
    const period = await (this.prisma as any).payrollPeriod.findFirst({
      where: { id: periodId, companyId, deletedAt: null },
      select: { id: true, companyId: true, startDate: true, endDate: true },
    });

    if (!period) {
      throw new BadRequestException('งวดเงินเดือนไม่ตรงกับบริษัทของรายการปรับเงินเดือน');
    }

    return period as { id: string; companyId: string; startDate: Date; endDate: Date };
  }

  private async assertPayrollComponent(componentId: string, companyId: string) {
    const component = await this.prisma.payrollComponent.findFirst({ where: { id: componentId, companyId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
    if (!component) throw new NotFoundException('ไม่พบ Payroll Component หรือไม่พร้อมใช้งาน');
  }
}
