import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { resolveMonthlyEquivalentWage } from '../../../common/utils/salary-rate.util';
import { assertWithinScope } from '../../../common/tenant/tenant-scope.util';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyPayrollSettingsService } from '../../settings/company-payroll-settings.service';
import {
  calculateSeverance,
  isEligibleForStatutorySeverance,
  serviceMonthsBetween,
  STATUTORY_SEVERANCE_TIERS,
  type SeparationReason,
  type SeveranceInput,
  type SeverancePayTier,
  type SeveranceResult,
} from '../utils/payroll-severance.util';
import { assertTiersMeetStatutoryMinimum } from '../utils/payroll-severance-tier.util';
import {
  calculateSeparationTax,
  calculateTaxFromBrackets,
  separationServiceYears,
  type SeparationTaxBracket,
  type SeparationTaxResult,
} from '../utils/payroll-separation-tax.util';
import { calculateGrossUp } from '../utils/payroll-gross-up.util';

/** เหตุออกจากงานบนใบ offboarding แปลงเป็นเหตุที่กฎหมายแรงงานใช้ */
const REASON_MAP: Record<string, SeparationReason> = {
  RESIGNATION: 'RESIGNATION',
  TERMINATION: 'TERMINATION',
  LAYOFF: 'TERMINATION',
  END_OF_CONTRACT: 'CONTRACT_END',
  RETIREMENT: 'RETIREMENT',
  // OTHER ไม่ระบุชัด จึงไม่ให้สิทธิค่าชดเชยอัตโนมัติ ต้องเลือกเหตุให้ชัดก่อน
  OTHER: 'RESIGNATION',
};

export type SeveranceQuoteOverrides = {
  monthlyWage?: number;
  noticePayDays?: number;
  unusedLeaveDays?: number;
  specialSeveranceDays?: number;
  otherSeparationPay?: number;
  terminatedWithCause?: boolean;
  /** บริษัทออกภาษีให้ — คำนวณยอดตั้งจ่ายย้อนกลับจากยอดสุทธิ */
  grossUpTax?: boolean;
};

export type SeveranceQuote = {
  employee: { id: string; employeeCode: string; fullName: string };
  reason: SeparationReason;
  serviceMonths: number;
  serviceYears: number;
  monthlyWage: number;
  severance: SeveranceResult;
  tax: SeparationTaxResult;
  /** ยอดที่พนักงานได้รับจริงหลังหักภาษี */
  netPayout: number;
  /** มีค่าเมื่อเลือกให้บริษัทออกภาษีให้ */
  grossUp: {
    grossAmount: number;
    taxAmount: number;
    employerExtraCost: number;
  } | null;
  warnings: string[];
};

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

@Injectable()
export class PayrollSeveranceService {
  constructor(
    private readonly prisma: PrismaService,
    /*
     * ใช้ตอนบริษัทยังไม่มีแถวตั้งค่าเงินเดือน แล้วผู้ใช้กดบันทึกบันไดค่าชดเชย
     * ต้องสร้างแถวให้ด้วยค่าที่บริษัทนั้นใช้อยู่จริง ไม่ใช่ค่าที่คิดขึ้นเอง
     */
    private readonly companyPayrollSettings: CompanyPayrollSettingsService,
  ) {}

  /**
   * คำนวณเงินและภาษีตอนออกจากงาน โดยไม่เขียนอะไรลงฐานข้อมูล
   * ใช้ได้ทั้งตอนดูตัวเลขก่อนตัดสินใจ และตอนบันทึกลงใบ offboarding
   */
  async quote(
    employeeId: string,
    params: {
      reasonType: string;
      lastWorkingDate: Date;
      overrides?: SeveranceQuoteOverrides;
      /** ขอบเขตของผู้เรียก — ต้องส่งมาเสมอ เว้นแต่เรียกจากงานภายใน */
      scope?: TenantScope;
    },
  ): Promise<SeveranceQuote> {
    const overrides = params.overrides ?? {};
    const warnings: string[] = [];

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
        firstName: true,
        lastName: true,
        companyId: true,
        startDate: true,
      },
    });
    if (!employee) throw new NotFoundException('ไม่พบพนักงาน');

    /*
     * Tenant boundary: endpoint นี้รับ employeeId ตรง ๆ ถ้าไม่ตรวจขอบเขต
     * ผู้ใช้ระดับบริษัทที่รู้ id จะดึงเงินเดือน อายุงาน และค่าชดเชย
     * ของพนักงานบริษัทอื่นได้ทั้งหมด
     */
    if (params.scope) {
      assertWithinScope(params.scope, { companyId: employee.companyId });
    }

    const setting = await this.prisma.companyPayrollSetting.findFirst({
      where: { companyId: employee.companyId },
      include: {
        severanceTiers: {
          where: { deletedAt: null, status: 'ACTIVE' },
          orderBy: { minServiceMonths: 'asc' },
        },
      },
    });

    const configuredTiers: SeverancePayTier[] = (
      setting?.severanceTiers ?? []
    ).map((tier) => ({
      minServiceMonths: numberValue(tier.minServiceMonths),
      payDays: numberValue(tier.payDays),
    }));

    /*
     * ถ้าบริษัทยังไม่ได้ตั้งบันไดเอง ให้ใช้บันไดตามมาตรา 118 เป็นค่าตั้งต้น
     *
     * ของเดิมคิดเป็น 0 แล้วเตือนเป็นข้อความเฉย ๆ ซึ่งแปลว่าพนักงานอายุงาน 10 ปี
     * ได้ค่าชดเชย 0 บาททั้งที่กฎหมายกำหนดขั้นต่ำ 300 วัน และไม่มีอะไรบล็อกไว้
     * มาตรา 118 เป็น "ขั้นต่ำ" บริษัทตั้งให้มากกว่าได้ แต่น้อยกว่าไม่ได้
     */
    const usingStatutoryDefault = configuredTiers.length === 0;
    const tiers = usingStatutoryDefault
      ? STATUTORY_SEVERANCE_TIERS
      : configuredTiers;

    if (usingStatutoryDefault) {
      warnings.push(
        'บริษัทนี้ยังไม่ได้ตั้งบันไดค่าชดเชย ระบบจึงคิดตามขั้นต่ำของมาตรา 118 ให้ก่อน — ตรวจสอบที่ ตั้งค่าเงินเดือน หากบริษัทจ่ายมากกว่าที่กฎหมายกำหนด',
      );
    }

    const monthlyWage =
      overrides.monthlyWage !== undefined
        ? numberValue(overrides.monthlyWage)
        : await this.resolveMonthlyWage(employee.id, employee.companyId);
    if (monthlyWage <= 0) {
      warnings.push(
        'ไม่พบค่าจ้างที่ใช้งานอยู่ของพนักงานคนนี้ ระบบคิดค่าชดเชยจากค่าจ้าง 0',
      );
    }

    const mappedReason = REASON_MAP[params.reasonType] ?? 'RESIGNATION';
    const reason: SeparationReason = overrides.terminatedWithCause
      ? 'TERMINATION_WITH_CAUSE'
      : mappedReason;

    const serviceMonths = serviceMonthsBetween(
      new Date(employee.startDate),
      params.lastWorkingDate,
    );
    const serviceYears = separationServiceYears(serviceMonths);

    const severanceInput: SeveranceInput = {
      reason,
      monthlyWage,
      serviceMonths,
      tiers,
      salaryDivisorDays: numberValue(setting?.salaryDivisorDays, 30),
      noticePayDays: numberValue(overrides.noticePayDays),
      unusedLeaveDays: numberValue(overrides.unusedLeaveDays),
      specialSeveranceDays: numberValue(overrides.specialSeveranceDays),
      otherSeparationPay: numberValue(overrides.otherSeparationPay),
    };
    const severance = calculateSeverance(severanceInput);

    const brackets = await this.resolveTaxBrackets(
      employee.companyId,
      params.lastWorkingDate,
    );
    if (!brackets.length) {
      warnings.push(
        'ยังไม่มีขั้นภาษีของปีภาษีนี้ ระบบจึงยังคิดภาษีของเงินก้อนไม่ได้',
      );
    }

    const otherSeparationAmount = severance.lines
      .filter((line) => !line.isStatutorySeverance)
      .reduce((sum, line) => sum + line.amount, 0);

    // ค่าตั้งค่าเก็บเป็น Decimal ต้องแปลงก่อน ไม่งั้นตัวคิดภาษีอ่านเป็นเลขไม่ได้
    // ค่า 0 หรือไม่มีค่าตั้งค่าเลย ตัวคิดภาษีจะตกไปใช้ค่าตามกฎหมายให้เอง
    const taxSettings = {
      exemptMaxDays: numberValue(setting?.severanceTaxExemptMaxDays),
      exemptMaxAmount: numberValue(setting?.severanceTaxExemptMaxAmount),
      expensePerServiceYear: numberValue(setting?.separationExpensePerYear),
      minServiceYearsForSeparateTax: numberValue(
        setting?.separationMinServiceYears,
      ),
    };

    const tax = calculateSeparationTax({
      statutorySeveranceAmount: severance.statutorySeveranceAmount,
      otherSeparationAmount,
      dailyWage: severance.dailyWage,
      serviceYears,
      eligibleForExemption: isEligibleForStatutorySeverance(reason),
      brackets,
      settings: taxSettings,
    });

    if (!tax.canCalculateSeparately && tax.taxableSeparationIncome > 0) {
      warnings.push(
        `อายุงาน ${serviceYears} ปี ยังไม่ถึงเกณฑ์แยกคำนวณภาษี เงินก้อนนี้ต้องนำไปรวมกับเงินได้ทั้งปี`,
      );
    }

    const netPayout =
      Math.round((severance.totalAmount - tax.separateTax) * 100) / 100;

    let grossUp: SeveranceQuote['grossUp'] = null;
    if (overrides.grossUpTax && tax.canCalculateSeparately) {
      // บริษัทออกภาษีให้ → ภาษีที่ออกให้กลายเป็นเงินได้อีกชั้น ต้องแก้ย้อนกลับ
      const solved = calculateGrossUp({
        targetNet: severance.totalAmount,
        taxOf: (gross) =>
          calculateSeparationTax({
            statutorySeveranceAmount: severance.statutorySeveranceAmount,
            otherSeparationAmount: Math.max(
              gross - severance.statutorySeveranceAmount,
              0,
            ),
            dailyWage: severance.dailyWage,
            serviceYears,
            eligibleForExemption: isEligibleForStatutorySeverance(reason),
            brackets,
            settings: taxSettings,
          }).separateTax,
      });

      grossUp = {
        grossAmount: solved.grossAmount,
        taxAmount: solved.taxAmount,
        employerExtraCost: solved.employerExtraCost,
      };

      if (!solved.converged) {
        warnings.push(
          'คำนวณยอด gross-up ไม่ลงตัวพอดี ตัวเลขที่ได้เป็นค่าประมาณ กรุณาตรวจก่อนใช้',
        );
      }
    }

    return {
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      },
      reason,
      serviceMonths,
      serviceYears,
      monthlyWage,
      severance,
      tax,
      netPayout,
      grossUp,
      warnings,
    };
  }

  /** ค่าจ้างที่ใช้คำนวณ = ค่าจ้างอัตราสุดท้ายที่ยังใช้งานอยู่ */
  private async resolveMonthlyWage(employeeId: string, companyId: string) {
    const compensation = await this.prisma.employeeCompensation.findFirst({
      where: { employeeId, companyId, deletedAt: null, status: 'ACTIVE' },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });

    if (!compensation) return 0;

    /*
     * ค่าชดเชยคิดจาก "ค่าจ้าง" ซึ่งรวมเงินที่จ่ายประจำแน่นอนเป็นการตอบแทนการทำงาน
     *
     * พนักงานรายวัน/รายชั่วโมงเก็บ baseSalary เป็นอัตราต่อวัน/ต่อชั่วโมง
     * ต้องแปลงเป็นค่าจ้างเทียบเท่ารายเดือนก่อน ไม่งั้นค่าแรงวันละ 500
     * จะกลายเป็นฐานค่าชดเชย 500 บาท คือเหลือ 1/30 ของที่ลูกจ้างต้องได้รับ
     */
    /*
     * เงินประจำตำแหน่งย้ายไปอยู่ที่ "รายการประจำ" แล้ว ไม่ได้อยู่ในฐานเงินเดือน
     * ถ้าอ่านจากช่องเดิมอย่างเดียวจะได้ 0 เสมอ ฐานค่าชดเชยจะขาดไปทั้งก้อน
     * ซึ่งเป็นเงินที่กฎหมายบังคับให้จ่าย — ต้องอ่านจากที่อยู่ใหม่แทน
     */
    const positionAllowanceItems = await this.prisma.employeeCompensationItem.findMany({
      where: {
        employeeId,
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        type: 'EARNING',
        code: 'POSITION_ALLOWANCE',
      },
      select: { amount: true },
    });

    const positionAllowance = positionAllowanceItems.reduce(
      (total, item) => total + numberValue(item.amount),
      0,
    );

    return (
      resolveMonthlyEquivalentWage(
        compensation.baseSalary,
        null,
        (compensation as any).salaryBasis,
      ) + positionAllowance
    );
  }

  private async resolveTaxBrackets(
    companyId: string,
    payDate: Date,
  ): Promise<SeparationTaxBracket[]> {
    const taxYear = await this.prisma.payrollTaxYear.findFirst({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        startDate: { lte: payDate },
        endDate: { gte: payDate },
      },
      include: {
        brackets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
    });

    return (taxYear?.brackets ?? []).map((bracket) => ({
      minIncome: numberValue(bracket.minIncome),
      maxIncome:
        bracket.maxIncome === null || bracket.maxIncome === undefined
          ? null
          : numberValue(bracket.maxIncome),
      rate: numberValue(bracket.rate),
    }));
  }


  /* ------------------------------------------------------------------ */
  /* บันไดค่าชดเชยของบริษัท                                              */
  /* ------------------------------------------------------------------ */

  /**
   * อ่านบันไดค่าชดเชยที่บริษัทตั้งไว้ พร้อมบันไดขั้นต่ำตามกฎหมายไว้เทียบ
   *
   * ยังไม่ตั้งเอง = คืนรายการว่าง แล้วให้หน้าจอโชว์ว่ากำลังใช้ขั้นต่ำตามกฎหมายอยู่
   */
  async listTiers(companyId: string) {
    const setting = await this.prisma.companyPayrollSetting.findFirst({
      where: { companyId },
      include: {
        severanceTiers: {
          where: { deletedAt: null, status: 'ACTIVE' },
          orderBy: { minServiceMonths: 'asc' },
        },
      },
    });

    const tiers = (setting?.severanceTiers ?? []).map((tier) => ({
      id: tier.id,
      minServiceMonths: numberValue(tier.minServiceMonths),
      payDays: numberValue(tier.payDays),
      note: tier.note,
    }));

    return {
      companyId,
      usingStatutoryDefault: tiers.length === 0,
      tiers,
      statutoryTiers: STATUTORY_SEVERANCE_TIERS,
    };
  }

  /**
   * บันทึกบันไดทั้งชุด (แทนที่ของเดิมทั้งหมด)
   *
   * ใช้วิธีแทนที่ทั้งชุดแทนการแก้ทีละแถว เพราะบันไดต้องสอดคล้องกันทั้งชุด
   * การแก้ทีละขั้นทำให้เกิดสภาพกลางคันที่จ่ายน้อยกว่ากฎหมายได้
   */
  async replaceTiers(
    companyId: string,
    tiers: Array<{ minServiceMonths: number; payDays: number; note?: string }>,
  ) {
    const normalized = this.normalizeTiers(tiers);

    assertTiersMeetStatutoryMinimum(normalized);

    return this.prisma.$transaction(async (tx) => {
      const setting = await tx.companyPayrollSetting.findFirst({
        where: { companyId },
        select: { id: true },
      });

      /*
       * บริษัทที่ยังไม่เคยแตะหน้าตั้งค่าเงินเดือนจะยังไม่มีแถวนี้
       *
       * เดิมโยน error ให้ไปตั้งค่าเงินเดือนก่อน ซึ่งไม่เกี่ยวกับสิ่งที่ผู้ใช้กำลังทำ
       * (เขาแค่จะแก้บันไดค่าชดเชย) และไม่มีอะไรบอกว่าต้องไปตั้งอะไรบ้าง
       * บันไดค่าชดเชยต้องมีที่เกาะ จึงสร้างแถวให้ตรงนี้เลย
       *
       * ค่าที่ใส่คือค่ากลางของระบบชุดเดียวกับที่บริษัทนี้ใช้อยู่แล้ว (ดู
       * CompanyPayrollSettingsService.getCompanyPayrollSetting ที่ fallback
       * ไปค่ากลางเมื่อไม่มีแถว) ตัวเลขจึงไม่เปลี่ยน แต่นับจากนี้บริษัทจะถือ
       * ค่าของตัวเองแทนการอิงค่ากลาง ซึ่งเป็นผลจากการที่เขาเลือกตั้งค่าเอง
       */
      const settingId =
        setting?.id ?? (await this.createSettingFromGlobalDefaults(tx, companyId));

      // ลบจริงได้ เพราะเป็นค่าตั้งค่า ไม่ใช่ข้อมูลธุรกรรม และมี AuditLog เก็บผู้แก้ไว้แล้ว
      await tx.severancePayTier.deleteMany({
        where: { settingId },
      });

      if (normalized.length > 0) {
        await tx.severancePayTier.createMany({
          data: normalized.map((tier, index) => ({
            settingId,
            minServiceMonths: tier.minServiceMonths,
            payDays: tier.payDays,
            note: tier.note ?? null,
            sortOrder: index,
          })),
        });
      }

      return { companyId, savedCount: normalized.length };
    });
  }

  /**
   * สร้างแถวตั้งค่าเงินเดือนของบริษัทด้วยค่าที่บริษัทนั้นใช้อยู่จริง
   *
   * ค่าที่ใช้มาจาก `resolvePayrollCalculationSettings` ซึ่งคืนค่ากลางของระบบ
   * เมื่อบริษัทยังไม่มีแถวของตัวเอง ตัวเลขจึงเท่าเดิมทุกประการ
   */
  private async createSettingFromGlobalDefaults(
    tx: Prisma.TransactionClient,
    companyId: string,
  ) {
    const defaults =
      await this.companyPayrollSettings.resolvePayrollCalculationSettings(
        companyId,
      );

    const created = await tx.companyPayrollSetting.create({
      data: {
        companyId,
        payrollCutoffDay: defaults.payrollCutoffDay,
        payrollPeriodStartDay: defaults.payrollPeriodStartDay,
        salaryDivisorDays: defaults.salaryDivisorDays,
        workingHoursPerDay: defaults.workingHoursPerDay,
        socialSecurityEmployeeRate: defaults.socialSecurityEmployeeRate,
        socialSecurityEmployerRate: defaults.socialSecurityEmployerRate,
        socialSecurityMinBase: defaults.socialSecurityMinBase,
        socialSecurityMaxBase: defaults.socialSecurityMaxBase,
      },
      select: { id: true },
    });

    return created.id;
  }

  /** เรียงจากน้อยไปมาก และรวมขั้นที่อายุงานซ้ำกันโดยเอาค่าที่ดีกว่า */
  private normalizeTiers(
    tiers: Array<{ minServiceMonths: number; payDays: number; note?: string }>,
  ) {
    const byMonths = new Map<
      number,
      { minServiceMonths: number; payDays: number; note?: string }
    >();

    for (const tier of tiers ?? []) {
      const minServiceMonths = Math.max(Math.trunc(numberValue(tier.minServiceMonths)), 0);
      const payDays = Math.max(Math.trunc(numberValue(tier.payDays)), 0);
      const current = byMonths.get(minServiceMonths);

      // อายุงานซ้ำกันเก็บได้ขั้นเดียว (@@unique) เลือกขั้นที่จ่ายมากกว่าให้ลูกจ้าง
      if (!current || payDays > current.payDays) {
        byMonths.set(minServiceMonths, {
          minServiceMonths,
          payDays,
          note: tier.note?.trim() || undefined,
        });
      }
    }

    return [...byMonths.values()].sort(
      (a, b) => a.minServiceMonths - b.minServiceMonths,
    );
  }

  /** เปิดให้ที่อื่นคิดภาษีจากขั้นบันไดชุดเดียวกันได้ โดยไม่ต้อง import util ตรง */
  taxFromBrackets(netIncome: number, brackets: SeparationTaxBracket[]) {
    return calculateTaxFromBrackets(netIncome, brackets);
  }
}
