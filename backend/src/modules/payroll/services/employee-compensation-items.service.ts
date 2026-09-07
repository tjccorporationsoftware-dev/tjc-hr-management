import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  requireCompanyId,
} from '../../../common/tenant/tenant-scope.util';
import { toDateOnly } from '../utils/payroll-date.util';
import { toPageMeta } from '../helpers/payroll-page-meta.helper';
import {
  CreateEmployeeCompensationItemDto,
  EmployeeCompensationItemQueryDto,
  UpdateEmployeeCompensationItemDto,
} from '../dto/employee-compensation-item.dto';

/**
 * EmployeeCompensationItemsService
 * --------------------------------
 * จัดการรายการค่าตอบแทนประจำของพนักงานที่มากกว่า field พื้นฐานใน EmployeeCompensation
 * เช่น ค่าเดินทาง ค่าโทรศัพท์ ค่าอาหาร ค่าตำแหน่งเพิ่มเติม หรือรายการหักประจำ
 */
@Injectable()
export class EmployeeCompensationItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: EmployeeCompensationItemQueryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);

    const where: Record<string, unknown> = { deletedAt: null };

    if (query.companyId) where.companyId = query.companyId;

    const employeeIds = await this.resolveEmployeeIdsForQuery(query);
    if (employeeIds) where.employeeId = { in: employeeIds.length ? employeeIds : ['__NO_MATCH__'] };

    if (query.componentId) where.componentId = query.componentId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
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
      active,
      inactive,
      earningAggregate,
      deductionAggregate,
    ] = await this.prisma.$transaction([
      prisma.employeeCompensationItem.findMany({
        where,
        orderBy: [{ employeeId: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.employeeCompensationItem.count({ where }),
      prisma.employeeCompensationItem.count({ where: whereForStatus('ACTIVE') }),
      prisma.employeeCompensationItem.count({ where: whereForStatus('INACTIVE') }),
      prisma.employeeCompensationItem.aggregate({
        where: whereForType('EARNING'),
        _sum: { amount: true },
      }),
      prisma.employeeCompensationItem.aggregate({
        where: whereForType('DEDUCTION'),
        _sum: { amount: true },
      }),
    ]);

    const earningAmount = Number(earningAggregate?._sum?.amount ?? 0);
    const deductionAmount = Math.abs(Number(deductionAggregate?._sum?.amount ?? 0));

    return {
      data,
      meta: toPageMeta(page, pageSize, total),
      summary: {
        total,
        active,
        inactive,
        earningAmount,
        deductionAmount,
        netAmount: earningAmount - deductionAmount,
      },
    };
  }

  private async resolveEmployeeIdsForQuery(query: EmployeeCompensationItemQueryDto) {
    /*
     * ค่าเริ่มต้นกรองเฉพาะพนักงาน ACTIVE ไว้สำหรับหน้ารวมที่ไล่ดูทั้งบริษัท
     *
     * แต่ถ้าระบุ employeeId มาเจาะจงคนเดียว ต้องไม่เอาสถานะมากรองซ้ำ
     * ไม่งั้นรายการประจำของคนที่อยู่ระหว่างทดลองงานจะหายไปจากหน้าจอทั้งที่บันทึกแล้ว
     * HR จะนึกว่าไม่ได้บันทึกแล้วเพิ่มซ้ำ กลายเป็นจ่ายซ้ำทุกเดือน
     * และคนที่เพิ่งเข้ากลางงวดคือกลุ่มที่ต้องตั้งค่าหารตามวันมากที่สุดพอดี
     */
    const resolveEmployeeStatus = () => {
      if (query.employeeStatus === 'ALL') return undefined;
      if (query.employeeStatus) return query.employeeStatus;
      if (query.employeeId) return undefined;
      return EmployeeStatus.ACTIVE;
    };

    const employeeStatus = resolveEmployeeStatus();

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

  async create(dto: CreateEmployeeCompensationItemDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.assertCompany(companyId);
    await this.assertEmployee(dto.employeeId, companyId);

    const component = dto.componentId
      ? await this.assertPayrollComponent(dto.componentId, companyId)
      : null;

    const quantity = Number(dto.quantity ?? 1);
    const rate = Number(dto.rate ?? dto.amount ?? 0);
    const amount = Number(dto.amount ?? quantity * rate);

    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('จำนวนเงินต้องไม่น้อยกว่า 0');
    }

    const prisma = this.prisma as any;
    return prisma.employeeCompensationItem.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        compensationId: dto.compensationId || null,
        componentId: dto.componentId || null,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        type: dto.type,
        sourceType: dto.sourceType ?? 'ALLOWANCE',
        quantity,
        rate,
        amount,
        effectiveDate: toDateOnly(dto.effectiveDate),
        endDate: dto.endDate ? toDateOnly(dto.endDate) : null,
        // ไม่ระบุมา = เอาตามแม่แบบของรายการนั้น ไม่มีแม่แบบค่อยใช้ค่ากลาง
        isTaxable: dto.isTaxable ?? component?.isTaxable ?? true,
        isSocialSecurityBase:
          dto.isSocialSecurityBase ?? component?.isSocialSecurityBase ?? false,
        prorateByEmploymentDays: dto.prorateByEmploymentDays ?? true,
        sortOrder: dto.sortOrder ?? 100,
        status: dto.status ?? 'ACTIVE',
        note: dto.note?.trim() || null,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateEmployeeCompensationItemDto,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const current = await prisma.employeeCompensationItem.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) throw new NotFoundException('ไม่พบรายการค่าตอบแทนประจำ');

    assertWithinScope(scope, { companyId: current.companyId });

    if (dto.componentId) {
      await this.assertPayrollComponent(dto.componentId, current.companyId);
    }

    return prisma.employeeCompensationItem.update({
      where: { id },
      data: {
        componentId: dto.componentId === undefined ? undefined : dto.componentId || null,
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        type: dto.type,
        quantity: dto.quantity,
        rate: dto.rate,
        amount: dto.amount,
        effectiveDate: dto.effectiveDate ? toDateOnly(dto.effectiveDate) : undefined,
        endDate: dto.endDate === undefined ? undefined : dto.endDate ? toDateOnly(dto.endDate) : null,
        isTaxable: dto.isTaxable,
        isSocialSecurityBase: dto.isSocialSecurityBase,
        prorateByEmploymentDays: dto.prorateByEmploymentDays,
        sortOrder: dto.sortOrder,
        status: dto.status,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });
  }

  async remove(id: string, scope: TenantScope) {
    const prisma = this.prisma as any;
    const current = await prisma.employeeCompensationItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, companyId: true },
    });

    if (!current) throw new NotFoundException('ไม่พบรายการค่าตอบแทนประจำ');

    assertWithinScope(scope, { companyId: current.companyId });

    await prisma.employeeCompensationItem.update({
      where: { id },
      data: { status: 'INACTIVE', deletedAt: new Date() },
    });

    return { id, deleted: true };
  }

  private async assertCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('ไม่พบบริษัท');
  }

  private async assertEmployee(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('ไม่พบพนักงานในบริษัทที่เลือก');
  }

  /**
   * ตรวจว่าแม่แบบรายการมีจริง แล้วคืนธงภาษี/ฐานประกันสังคมของแม่แบบกลับไปด้วย
   *
   * ธงพวกนี้ถูกเก็บซ้ำไว้ที่รายการรายคน เพราะแต่ละคนอาจตกลงเงื่อนไขต่างกันได้
   * แต่ "ค่าตั้งต้น" ต้องมาจากแม่แบบ ไม่ใช่ hardcode — ไม่งั้นพอบริษัทแก้ที่แม่แบบ
   * ว่ารายการนี้เข้าฐานประกันสังคม รายการที่สร้างใหม่ก็ยังไม่เข้าอยู่ดี
   */
  private async assertPayrollComponent(componentId: string, companyId: string) {
    const component = await this.prisma.payrollComponent.findFirst({
      where: { id: componentId, companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, isTaxable: true, isSocialSecurityBase: true },
    });
    if (!component) throw new NotFoundException('ไม่พบ Payroll Component หรือไม่พร้อมใช้งาน');
    return component;
  }
}
