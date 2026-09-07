import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import {
  MasterStatus,
  WithholdingPayeeType,
} from '../../generated/prisma/client';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import { effectiveCompanyId } from '../../common/tenant/tenant-scope.util';
import {
  WITHHOLDING_INCOME_TYPES,
  findWithholdingIncomeType,
} from './constants/withholding-income-type.constant';
import type {
  CreateWithholdingPayeeDto,
  CreateWithholdingPaymentDto,
  UpdateWithholdingPayeeDto,
  UpdateWithholdingPaymentDto,
  WithholdingPaymentQueryDto,
} from './dto/withholding.dto';

/**
 * ภาษีหัก ณ ที่จ่ายของผู้รับเงินที่ไม่ใช่ลูกจ้าง
 * -----------------------------------------------------------------------------
 * รองรับแบบ ภ.ง.ด.3 (ผู้รับเงินเป็นบุคคลธรรมดา) เป็นหลัก
 * ผู้รับเงินที่เป็นนิติบุคคลบันทึกได้เหมือนกันและจะไปอยู่ในแบบ ภ.ง.ด.53
 * ซึ่งยังไม่ได้ทำเอกสาร — เก็บข้อมูลไว้ก่อนจะได้ไม่ต้องมาไล่กรอกย้อนหลัง
 *
 * ยอดภาษีเก็บเป็นตัวเลขที่หักจริง ไม่ได้คำนวณสดจากอัตราตอนออกแบบยื่น
 * เพราะยอดที่หักจริงอาจปัดเศษต่างจากที่คูณตรง ๆ และแบบยื่นต้องตรงกับที่จ่ายจริง
 */
@Injectable()
export class WithholdingService {
  constructor(private readonly prisma: PrismaService) {}

  /** รายการประเภทเงินได้พร้อมอัตราตั้งต้น ให้หน้าจอเอาไปทำตัวเลือก */
  listIncomeTypes() {
    return WITHHOLDING_INCOME_TYPES;
  }

  /* ---------------- ผู้รับเงิน ---------------- */

  async listPayees(
    query: { companyId?: string; search?: string; status?: MasterStatus },
    scope: TenantScope,
  ) {
    const companyId = effectiveCompanyId(scope, query.companyId);
    const search = query.search?.trim();

    const payees = await this.prisma.withholdingPayee.findMany({
      where: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { taxId: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });

    return { data: payees };
  }

  async createPayee(dto: CreateWithholdingPayeeDto, scope: TenantScope) {
    const companyId = effectiveCompanyId(scope, dto.companyId);
    if (!companyId) throw new BadRequestException('กรุณาระบุบริษัท');

    const data = this.buildPayeeData(dto);

    /* เลขผู้เสียภาษีซ้ำในบริษัทเดียวกันแปลว่ามีผู้รับเงินคนนี้อยู่แล้ว */
    const duplicate = await this.prisma.withholdingPayee.findFirst({
      where: {
        companyId,
        taxId: data.taxId,
        branchNo: data.branchNo,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    if (duplicate) {
      throw new BadRequestException(
        `มีผู้รับเงินเลขประจำตัวนี้อยู่แล้ว (${duplicate.name})`,
      );
    }

    return this.prisma.withholdingPayee.create({
      data: { ...data, companyId },
    });
  }

  async updatePayee(
    id: string,
    dto: UpdateWithholdingPayeeDto,
    scope: TenantScope,
  ) {
    const current = await this.findPayeeOrThrow(id, scope);

    return this.prisma.withholdingPayee.update({
      where: { id: current.id },
      data: this.buildPayeeData({ ...current, ...dto } as never, current.type),
    });
  }

  /** ลบแบบทำเครื่องหมาย — ผู้รับเงินที่เคยจ่ายไปแล้วต้องอ้างอิงย้อนหลังได้ */
  async removePayee(id: string, scope: TenantScope) {
    const current = await this.findPayeeOrThrow(id, scope);

    const used = await this.prisma.withholdingPayment.count({
      where: { payeeId: current.id, deletedAt: null },
    });

    if (used > 0) {
      throw new BadRequestException(
        `ลบไม่ได้ — มีรายการจ่ายอ้างอิงอยู่ ${used} รายการ ปิดใช้งานแทนได้`,
      );
    }

    return this.prisma.withholdingPayee.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });
  }

  /* ---------------- รายการจ่าย ---------------- */

  async listPayments(query: WithholdingPaymentQueryDto, scope: TenantScope) {
    const companyId = effectiveCompanyId(scope, query.companyId);
    const range = monthRange(query.year, query.month);
    const search = query.search?.trim();

    const payments = await this.prisma.withholdingPayment.findMany({
      where: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        ...(query.payeeId ? { payeeId: query.payeeId } : {}),
        ...(range ? { paidOn: range } : {}),
        ...(query.payeeType || search
          ? {
              payee: {
                ...(query.payeeType ? { type: query.payeeType } : {}),
                ...(search
                  ? { name: { contains: search, mode: 'insensitive' as const } }
                  : {}),
              },
            }
          : {}),
      },
      include: { payee: true },
      orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
    });

    const total = payments.reduce(
      (acc, row) => ({
        amount: acc.amount + Number(row.amount),
        taxAmount: acc.taxAmount + Number(row.taxAmount),
      }),
      { amount: 0, taxAmount: 0 },
    );

    return {
      data: payments,
      summary: {
        count: payments.length,
        amount: round2(total.amount),
        taxAmount: round2(total.taxAmount),
      },
    };
  }

  async createPayment(dto: CreateWithholdingPaymentDto, scope: TenantScope) {
    const companyId = effectiveCompanyId(scope, dto.companyId);
    if (!companyId) throw new BadRequestException('กรุณาระบุบริษัท');

    const payee = await this.findPayeeOrThrow(dto.payeeId, scope);
    if (payee.companyId !== companyId) {
      throw new BadRequestException('ผู้รับเงินไม่ได้อยู่ในบริษัทที่เลือก');
    }

    return this.prisma.withholdingPayment.create({
      data: { ...this.buildPaymentData(dto), companyId, payeeId: payee.id },
    });
  }

  async updatePayment(
    id: string,
    dto: UpdateWithholdingPaymentDto,
    scope: TenantScope,
  ) {
    const current = await this.findPaymentOrThrow(id, scope);

    if (dto.payeeId && dto.payeeId !== current.payeeId) {
      const payee = await this.findPayeeOrThrow(dto.payeeId, scope);
      if (payee.companyId !== current.companyId) {
        throw new BadRequestException('ผู้รับเงินไม่ได้อยู่ในบริษัทเดียวกัน');
      }
    }

    const merged = {
      payeeId: dto.payeeId ?? current.payeeId,
      paidOn: dto.paidOn ?? current.paidOn.toISOString().slice(0, 10),
      incomeTypeCode: dto.incomeTypeCode ?? current.incomeTypeCode,
      incomeTypeLabel: dto.incomeTypeLabel ?? current.incomeTypeLabel,
      taxRatePercent: dto.taxRatePercent ?? Number(current.taxRatePercent),
      amount: dto.amount ?? Number(current.amount),
      taxAmount: dto.taxAmount ?? Number(current.taxAmount),
      condition: dto.condition ?? current.condition,
      reference: dto.reference ?? current.reference ?? undefined,
      note: dto.note ?? current.note ?? undefined,
    };

    return this.prisma.withholdingPayment.update({
      where: { id: current.id },
      data: {
        ...this.buildPaymentData(merged as CreateWithholdingPaymentDto),
        payeeId: merged.payeeId,
      },
    });
  }

  async removePayment(id: string, scope: TenantScope) {
    const current = await this.findPaymentOrThrow(id, scope);

    return this.prisma.withholdingPayment.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });
  }

  /* ---------------- ตัวช่วยภายใน ---------------- */

  private async findPayeeOrThrow(id: string, scope: TenantScope) {
    const companyId = effectiveCompanyId(scope, undefined);

    const payee = await this.prisma.withholdingPayee.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!payee) throw new NotFoundException('ไม่พบผู้รับเงิน');

    return payee;
  }

  private async findPaymentOrThrow(id: string, scope: TenantScope) {
    const companyId = effectiveCompanyId(scope, undefined);

    const payment = await this.prisma.withholdingPayment.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!payment) throw new NotFoundException('ไม่พบรายการจ่าย');

    return payment;
  }

  /**
   * ประกอบชื่อที่ใช้แสดงและพิมพ์ลงแบบฟอร์ม
   * บุคคลธรรมดาประกอบจากคำนำหน้า+ชื่อ+สกุล เพราะใบแนบมีช่องแยก
   * นิติบุคคลใช้ชื่อเต็มช่องเดียวตามที่จดทะเบียน
   */
  private buildPayeeData(
    dto: CreateWithholdingPayeeDto,
    fallbackType?: WithholdingPayeeType,
  ) {
    const type = dto.type ?? fallbackType ?? WithholdingPayeeType.INDIVIDUAL;
    const taxId = (dto.taxId ?? '').replace(/\D/g, '');

    const name =
      type === WithholdingPayeeType.INDIVIDUAL
        ? [dto.title, dto.firstName, dto.lastName]
            .filter((part) => part && part.trim())
            .join(' ')
            .trim()
        : (dto.name ?? '').trim();

    if (!name) {
      throw new BadRequestException(
        type === WithholdingPayeeType.INDIVIDUAL
          ? 'กรุณากรอกชื่อและนามสกุลผู้รับเงิน'
          : 'กรุณากรอกชื่อนิติบุคคล',
      );
    }

    return {
      type,
      taxId,
      branchNo: (dto.branchNo ?? '00000').replace(/\D/g, '').padStart(5, '0'),
      title: dto.title ?? null,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      name,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      note: dto.note ?? null,
      ...(dto.status ? { status: dto.status } : {}),
    };
  }

  private buildPaymentData(dto: CreateWithholdingPaymentDto) {
    const incomeType = findWithholdingIncomeType(dto.incomeTypeCode);
    if (!incomeType) {
      throw new BadRequestException('ไม่รู้จักประเภทเงินได้ที่เลือก');
    }

    const rate = dto.taxRatePercent ?? incomeType.defaultRate;
    const amount = round2(dto.amount);

    /*
     * ถ้าไม่ได้ส่งภาษีที่หักมา คำนวณให้จากอัตรา แต่ถ้าส่งมาให้เชื่อค่าที่ส่ง
     * เพราะยอดที่หักจริงอาจปัดเศษต่างจากการคูณตรง ๆ และแบบยื่นต้องตรงกับที่จ่าย
     */
    const taxAmount =
      dto.taxAmount === undefined
        ? round2((amount * rate) / 100)
        : round2(dto.taxAmount);

    if (taxAmount > amount) {
      throw new BadRequestException('ภาษีที่หักมากกว่าจำนวนเงินที่จ่าย');
    }

    return {
      paidOn: new Date(`${dto.paidOn.slice(0, 10)}T00:00:00.000Z`),
      incomeTypeCode: incomeType.code,
      incomeTypeLabel: (dto.incomeTypeLabel ?? incomeType.label).trim(),
      taxRatePercent: rate,
      amount,
      taxAmount,
      ...(dto.condition ? { condition: dto.condition } : {}),
      reference: dto.reference ?? null,
      note: dto.note ?? null,
    };
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** ช่วงวันที่ของเดือนหนึ่ง ใช้กรองรายการจ่ายของแบบยื่นเดือนนั้น */
export function monthRange(year?: number, month?: number) {
  if (!year) return null;

  if (!month) {
    return {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }

  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}
