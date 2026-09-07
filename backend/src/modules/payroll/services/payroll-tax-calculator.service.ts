import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { resolveMonthlyEquivalentWage } from "../../../common/utils/salary-rate.util";
import type { TenantScope } from "../../../common/interfaces/authenticated-user.interface";
import {
  assertWithinScope,
  effectiveCompanyId,
} from "../../../common/tenant/tenant-scope.util";
import {
  PayrollRunTaxPreviewDto,
  PayrollTaxPreviewDto,
} from "../dto/payroll-tax.dto";
import { resolveAnnualSocialSecurityCeiling } from "./payroll-social-security.service";
import {
  resolveAllowanceTotal,
  type AllowanceLimitGroupRule,
  type AllowanceLimitInput,
  type AllowancePercentBase,
} from "../utils/payroll-tax-allowance-limit.util";

/** ปีภาษีต้องมาพร้อมขั้นภาษีและกลุ่มเพดานค่าลดหย่อนเสมอ ไม่งั้นคิดเพดานรวมไม่ได้ */
const TAX_YEAR_INCLUDE = {
  brackets: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
  },
  allowanceLimitGroups: {
    where: { deletedAt: null, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
  },
};

function numberValue(value: unknown, fallback = 0) {
  const amount = Number(value ?? fallback);
  return Number.isFinite(amount) ? amount : fallback;
}

function roundMoney(value: number) {
  // กัน floating-point error: บวก epsilon ที่สเกลสตางค์ (Number.EPSILON เล็กเกินไปสำหรับค่าหลักพัน/หมื่น)
  const epsilon = value >= 0 ? 1e-6 : -1e-6;
  return Math.round(value * 100 + epsilon) / 100;
}

function roundBaht(value: number) {
  return Math.round(value);
}

function toPercentBase(value: unknown): AllowancePercentBase {
  return value === "NET_AFTER_ALLOWANCE" ? "NET_AFTER_ALLOWANCE" : "GROSS_INCOME";
}

/** แปลงค่าลดหย่อนที่พนักงานแจ้งไว้ ให้อยู่ในรูปที่ตัวคิดเพดานใช้ได้ */
function toAllowanceLimitInput(allowance: any): AllowanceLimitInput {
  const allowanceType = allowance.allowanceType ?? {};

  return {
    code: String(allowanceType.code ?? allowance.allowanceTypeId ?? ""),
    nameTh: allowanceType.nameTh ?? null,
    amount: numberValue(allowance.declaredAmount),
    maxAmount:
      allowanceType.maxAmount === null || allowanceType.maxAmount === undefined
        ? null
        : numberValue(allowanceType.maxAmount),
    maxPercentOfIncome:
      allowanceType.maxPercentOfIncome === null ||
      allowanceType.maxPercentOfIncome === undefined
        ? null
        : numberValue(allowanceType.maxPercentOfIncome),
    percentBase: toPercentBase(allowanceType.percentBase),
    deductionMultiplier: numberValue(allowanceType.deductionMultiplier, 1),
    limitGroupCode: allowanceType.limitGroupCode ?? null,
  };
}

function toAllowanceLimitGroupRule(group: any): AllowanceLimitGroupRule {
  return {
    code: String(group.code ?? ""),
    nameTh: group.nameTh ?? null,
    maxAmount:
      group.maxAmount === null || group.maxAmount === undefined
        ? null
        : numberValue(group.maxAmount),
    maxPercentOfIncome:
      group.maxPercentOfIncome === null || group.maxPercentOfIncome === undefined
        ? null
        : numberValue(group.maxPercentOfIncome),
    percentBase: toPercentBase(group.percentBase),
  };
}

type TaxWarning = {
  code: string;
  title: string;
  detail: string;
  severity: "INFO" | "WARNING" | "BLOCKING";
};

/**
 * client ที่ใช้อ่านข้อมูล — รับได้ทั้ง PrismaService และ TransactionClient
 *
 * ตอนคำนวณเงินเดือน ตัวคำนวณภาษีถูกเรียกจากในธุรกรรมของ payroll
 * ถ้ายังใช้ this.prisma จะเปิด connection ที่สองซ้อนเข้าไป ทำให้
 *   1. connection pool หมดเมื่อคำนวณพนักงานหลายคนพร้อมกัน
 *   2. มองไม่เห็นการลบ/เขียนของธุรกรรมตัวเองที่ยังไม่ commit
 *      ยอดสะสมทั้งปีจึงนับรายการที่กำลังจะถูกลบทิ้งรวมเข้าไปด้วย
 */
type TaxCalculatorDb = { [model: string]: any };

type TaxPreviewInput = {
  /** ส่ง tx เข้ามาเมื่อถูกเรียกจากในธุรกรรม ไม่ส่ง = ใช้ connection ปกติ */
  db?: TaxCalculatorDb;
  companyId: string;
  employeeId: string;
  taxYearId?: string;
  payrollRunId?: string | null;
  payrollItemId?: string | null;
  payDate?: Date | string | null;
  /**
   * รายได้ประจำในงวดนี้ที่ควรนำไปประมาณการรายปี เช่น เงินเดือน/allowance ประจำ
   */
  monthlyIncome: number;
  /**
   * รายได้พิเศษเฉพาะงวด ไม่ควรคูณเป็นรายเดือนถาวร
   */
  bonusIncome: number;
  otherTaxableIncome: number;
  socialSecurityYtd: number;
  socialSecurityCurrentRun: number;
  taxWithheldYtd: number;
  taxableIncomeYtd: number;
  remainingPeriods: number;
};

/**
 * PayrollTaxCalculatorService
 * ---------------------------
 * Phase 3: Tax Calculation Preview
 * - ใช้ข้อมูลภาษีพนักงานที่บันทึกพร้อมใช้ / Tax Bracket / Allowance มาทดลองคำนวณภาษี
 * - ยังไม่สร้าง PayrollLine TAX และยังไม่เปลี่ยนยอดเงินเดือนจริง
 */
@Injectable()
export class PayrollTaxCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param scope ขอบเขตของผู้เรียก — กรองที่ระดับ query ของพนักงาน
   *
   * ถ้าไม่ล็อกบริษัทตรงนี้ ผู้ใช้ที่รู้ employeeId ของบริษัทอื่นจะทดลองคำนวณ
   * แล้วเห็นฐานเงินเดือน ค่าลดหย่อน และยอดสะสมรายคนของอีกบริษัทได้
   */
  async calculateEmployeePreview(
    dto: PayrollTaxPreviewDto,
    scope: TenantScope,
  ) {
    if (!dto.employeeId) throw new BadRequestException("กรุณาระบุพนักงาน");

    const scopedCompanyId = effectiveCompanyId(scope, dto.companyId);
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        deletedAt: null,
        ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      },
      include: {
        company: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        department: { select: { id: true, code: true, nameTh: true } },
        branch: { select: { id: true, code: true, nameTh: true } },
      },
    });
    if (!employee) throw new NotFoundException("ไม่พบพนักงาน");

    const prisma = this.prisma as any;
    const compensation = await prisma.employeeCompensation.findFirst({
      where: {
        employeeId: employee.id,
        companyId: employee.companyId,
        deletedAt: null,
        status: "ACTIVE",
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    });

    const monthlyIncome = numberValue(
      dto.monthlyIncome,
      compensation
        ? resolveMonthlyEquivalentWage(
              compensation.baseSalary,
              null,
              (compensation as any).salaryBasis,
            )
        : 0,
    );

    /*
     * ไม่ได้ส่งยอดสะสมมา ให้ดึงจากระบบเหมือนตอนคำนวณจริง
     *
     * เดิม preview อ่านยอดสะสมจาก DTO อย่างเดียว ถ้าไม่ส่งมาจะเป็น 0 เสมอ
     * ทั้งที่ตอนคำนวณ Payroll Run จริงจะไปอ่านยอดยกมาจาก employee_tax_year_summaries
     * บวกกับรอบที่รันไปแล้ว ผลคือหน้าทดลองคำนวณให้ตัวเลขคนละอย่างกับของจริง
     */
    const [taxWithheldYtd, taxableIncomeYtd, socialSecurityYtd] =
      await Promise.all([
        dto.taxWithheldYtd !== undefined
          ? Promise.resolve(numberValue(dto.taxWithheldYtd))
          : this.findTaxWithheldYtd(employee.id, dto.taxYearId),
        dto.taxableIncomeYtd !== undefined
          ? Promise.resolve(numberValue(dto.taxableIncomeYtd))
          : this.findTaxableIncomeYtd(employee.id, dto.taxYearId),
        dto.socialSecurityYtd !== undefined
          ? Promise.resolve(numberValue(dto.socialSecurityYtd))
          : this.findSocialSecurityYtd(employee.id, dto.taxYearId),
      ]);

    return this.calculatePreviewFromInput({
      companyId: employee.companyId,
      employeeId: employee.id,
      taxYearId: dto.taxYearId,
      payrollRunId: null,
      payrollItemId: null,
      payDate: null,
      monthlyIncome,
      bonusIncome: numberValue(dto.bonusIncome),
      otherTaxableIncome: numberValue(dto.otherTaxableIncome),
      socialSecurityYtd,
      socialSecurityCurrentRun: 0,
      taxWithheldYtd,
      taxableIncomeYtd,
      remainingPeriods: Math.max(numberValue(dto.remainingPeriods, 1), 1),
    });
  }

  /**
   * @param scope ขอบเขตของผู้เรียก — ดึงก่อนแล้วค่อยตรวจ (fetch-then-assert)
   *
   * ผลลัพธ์คือภาษีรายคนทั้งงวด ถ้าไม่ตรวจ ผู้ใช้ที่รู้ id ของงวดบริษัทอื่น
   * จะเห็นเงินได้และภาษีรายคนของอีกบริษัทได้ทั้งงวด
   */
  async calculateRunPreview(
    runId: string,
    dto: PayrollRunTaxPreviewDto = {},
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, deletedAt: null },
      include: {
        company: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        period: true,
        items: {
          include: {
            employee: {
              include: {
                department: { select: { id: true, code: true, nameTh: true } },
                branch: { select: { id: true, code: true, nameTh: true } },
              },
            },
            compensation: true,
            lines: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!run) throw new NotFoundException("ไม่พบ Payroll Run");
    assertWithinScope(scope, { companyId: run.companyId });

    const defaultRemainingPeriods = this.guessRemainingPeriods(
      run.period?.paymentDate ?? run.period?.endDate,
    );
    const remainingPeriods = Math.max(
      numberValue(dto.remainingPeriods, defaultRemainingPeriods),
      1,
    );

    const rows = [] as any[];
    const warnings = [] as TaxWarning[];
    const payDate = run.period?.paymentDate ?? run.period?.endDate ?? null;
    const previewItems = (run.items ?? []).length
      ? run.items
      : await this.buildRunPreviewItems(run);

    for (const item of previewItems ?? []) {
      const compensation = item.compensation;
      if (compensation && compensation.taxEnabled === false) {
        rows.push({
          employeeId: item.employeeId,
          payrollItemId: item.id ?? null,
          employeeCode: item.employee?.employeeCode ?? "-",
          employeeName: this.getEmployeeName(item.employee),
          taxEnabled: false,
          status: "SKIPPED",
          isEstimated: Boolean(item.isEstimated),
          currentRunTax: "0.00",
          warnings: [
            {
              code: "TAX_DISABLED",
              title: "ไม่คิดภาษี",
              detail: "พนักงานคนนี้ปิดการคิดภาษีในข้อมูลค่าตอบแทน",
              severity: "INFO",
            },
          ],
        });
        continue;
      }

      const taxableIncomeSplit = this.splitTaxableIncomeLines(
        item.lines,
        item.totalEarnings,
      );
      const taxableIncomeCurrentRun = taxableIncomeSplit.totalTaxableIncome;
      const socialSecurityCurrentRun = this.sumEmployeeSocialSecurityLines(
        item.lines,
        item.socialSecurityCurrentRun,
      );

      const initialPreview = await this.calculatePreviewFromInput({
        companyId: run.companyId,
        employeeId: item.employeeId,
        taxYearId: dto.taxYearId,
        payrollRunId: run.id,
        payrollItemId: item.id ?? null,
        payDate,
        monthlyIncome: taxableIncomeSplit.regularTaxableIncome,
        bonusIncome: taxableIncomeSplit.bonusIncome,
        otherTaxableIncome: taxableIncomeSplit.otherOneTimeIncome,
        socialSecurityYtd: 0,
        socialSecurityCurrentRun,
        taxWithheldYtd: 0,
        taxableIncomeYtd: 0,
        remainingPeriods,
      });
      const taxYearId = initialPreview.taxYear.id;
      const taxWithheldYtd = await this.findTaxWithheldYtd(
        item.employeeId,
        taxYearId,
        run.id,
      );
      const taxableIncomeYtd = await this.findTaxableIncomeYtd(
        item.employeeId,
        taxYearId,
        run.id,
      );
      const socialSecurityYtd = await this.findSocialSecurityYtd(
        item.employeeId,
        taxYearId,
        run.id,
      );

      const preview = await this.calculatePreviewFromInput({
        companyId: run.companyId,
        employeeId: item.employeeId,
        taxYearId,
        payrollRunId: run.id,
        payrollItemId: item.id ?? null,
        payDate,
        monthlyIncome: taxableIncomeSplit.regularTaxableIncome,
        bonusIncome: taxableIncomeSplit.bonusIncome,
        otherTaxableIncome: taxableIncomeSplit.otherOneTimeIncome,
        socialSecurityYtd,
        socialSecurityCurrentRun,
        taxWithheldYtd,
        taxableIncomeYtd,
        remainingPeriods,
      });

      const rowWarnings = [...preview.warnings];

      rows.push({
        employeeId: item.employeeId,
        payrollItemId: item.id ?? null,
        employeeCode: item.employee?.employeeCode ?? "-",
        employeeName: this.getEmployeeName(item.employee),
        departmentName:
          item.employee?.department?.nameTh ??
          item.employee?.branch?.nameTh ??
          "-",
        taxEnabled: true,
        status: rowWarnings.some((warning) => warning.severity === "BLOCKING")
          ? "NEED_SETUP"
          : "CALCULATED",
        isEstimated: Boolean(item.isEstimated),
        currentRunTax: preview.currentRunTax,
        annualTax: preview.annualTax,
        projectedAnnualIncome: preview.projectedAnnualIncome,
        netTaxableIncome: preview.netTaxableIncome,
        allowanceTotal: preview.allowanceTotal,
        socialSecurityAllowance: preview.socialSecurityAllowance,
        warnings: rowWarnings,
      });
      warnings.push(
        ...rowWarnings.map((warning) => ({
          ...warning,
          detail: `${item.employee?.employeeCode ?? "-"} ${this.getEmployeeName(item.employee)}: ${warning.detail}`,
        })),
      );
    }

    const calculatedRows = rows.filter((row) => row.status === "CALCULATED");
    const needSetupRows = rows.filter((row) => row.status === "NEED_SETUP");
    const skippedRows = rows.filter((row) => row.status === "SKIPPED");
    const totalTax = calculatedRows.reduce(
      (sum, row) => sum + numberValue(row.currentRunTax),
      0,
    );

    return {
      run: {
        id: run.id,
        runNo: run.runNo,
        name: run.name,
        status: run.status,
        company: run.company,
        period: run.period,
      },
      summary: {
        employeeCount: rows.length,
        calculatedCount: calculatedRows.length,
        needSetupCount: needSetupRows.length,
        skippedCount: skippedRows.length,
        warningCount: warnings.filter(
          (warning) => warning.severity !== "BLOCKING",
        ).length,
        blockingCount: warnings.filter(
          (warning) => warning.severity === "BLOCKING",
        ).length,
        totalCurrentRunTax: roundMoney(totalTax).toFixed(2),
        remainingPeriods,
        isPreviewOnly: true,
        isEstimatedFromCompensation: !(run.items ?? []).length,
        willWritePayrollLine: false,
        checkedAt: new Date().toISOString(),
      },
      rows,
      warnings,
    };
  }

  /**
   * Phase 4: ใช้ Tax Engine เพื่อคำนวณภาษีจริงสำหรับ Payroll Run
   * - คืนผลคำนวณเดียวกับ preview แต่ระบุได้ว่าจะสร้าง PayrollLine TAX หรือไม่
   * - ไม่โยน error กับข้อมูลภาษีที่ยังไม่ครบ เพื่อไม่ให้ Payroll Run พังทันที
   */
  async calculateEmployeePayrollTax(params: {
    companyId: string;
    employeeId: string;
    payrollRunId: string;
    payrollItemId?: string | null;
    taxYearId?: string;
    taxableIncomeCurrentRun: number;
    regularTaxableIncomeCurrentRun?: number;
    bonusIncome?: number;
    otherTaxableIncome?: number;
    socialSecurityCurrentRun?: number;
    remainingPeriods?: number;
    payDate?: Date | string | null;
    /** ส่ง tx เข้ามาเมื่อถูกเรียกจากในธุรกรรมของ payroll */
    db?: TaxCalculatorDb;
  }) {
    const remainingPeriods = Math.max(
      numberValue(
        params.remainingPeriods,
        this.guessRemainingPeriods(params.payDate),
      ),
      1,
    );
    const currentRunTotalTaxableIncome = Math.max(
      numberValue(params.taxableIncomeCurrentRun),
      0,
    );
    const currentRunBonusIncome = Math.max(numberValue(params.bonusIncome), 0);
    const currentRunOtherOneTimeIncome = Math.max(
      numberValue(params.otherTaxableIncome),
      0,
    );
    const currentRunRegularIncome = Math.max(
      params.regularTaxableIncomeCurrentRun === undefined
        ? currentRunTotalTaxableIncome -
            currentRunBonusIncome -
            currentRunOtherOneTimeIncome
        : numberValue(params.regularTaxableIncomeCurrentRun),
      0,
    );

    try {
      const initialPreview = await this.calculatePreviewFromInput({
        db: params.db,
        companyId: params.companyId,
        employeeId: params.employeeId,
        taxYearId: params.taxYearId,
        payrollRunId: params.payrollRunId,
        payrollItemId: params.payrollItemId ?? null,
        payDate: params.payDate ?? null,
        monthlyIncome: currentRunRegularIncome,
        bonusIncome: currentRunBonusIncome,
        otherTaxableIncome: currentRunOtherOneTimeIncome,
        socialSecurityYtd: 0,
        socialSecurityCurrentRun: numberValue(params.socialSecurityCurrentRun),
        taxWithheldYtd: 0,
        taxableIncomeYtd: 0,
        remainingPeriods,
      });

      const taxYearId = initialPreview.taxYear.id;
      const taxWithheldYtd = await this.findTaxWithheldYtd(
        params.employeeId,
        taxYearId,
        params.payrollRunId,
        params.db,
      );
      const taxableIncomeYtd = await this.findTaxableIncomeYtd(
        params.employeeId,
        taxYearId,
        params.payrollRunId,
        params.db,
      );
      const socialSecurityYtd = await this.findSocialSecurityYtd(
        params.employeeId,
        taxYearId,
        params.payrollRunId,
        params.db,
      );

      const preview = await this.calculatePreviewFromInput({
        db: params.db,
        companyId: params.companyId,
        employeeId: params.employeeId,
        taxYearId,
        payrollRunId: params.payrollRunId,
        payrollItemId: params.payrollItemId ?? null,
        payDate: params.payDate ?? null,
        monthlyIncome: currentRunRegularIncome,
        bonusIncome: currentRunBonusIncome,
        otherTaxableIncome: currentRunOtherOneTimeIncome,
        socialSecurityYtd,
        socialSecurityCurrentRun: numberValue(params.socialSecurityCurrentRun),
        taxWithheldYtd,
        taxableIncomeYtd,
        remainingPeriods,
      });

      const blockingWarnings = preview.warnings.filter(
        (warning: TaxWarning) => warning.severity === "BLOCKING",
      );
      const profileTaxEnabled = preview.taxProfile?.taxEnabled !== false;
      const currentRunTaxAmount = profileTaxEnabled
        ? roundMoney(numberValue(preview.currentRunTax))
        : 0;
      // ไม่มีข้อมูลลดหย่อนก็ยังหักภาษีได้ ใช้ค่าลดหย่อนพื้นฐานที่ tax engine คิดให้
      const canCreatePayrollLine =
        profileTaxEnabled &&
        blockingWarnings.length === 0 &&
        currentRunTaxAmount > 0;

      return {
        ...preview,
        currentRunTax: currentRunTaxAmount.toFixed(2),
        currentRunTaxAmount,
        canCreatePayrollLine,
        integrationStatus: canCreatePayrollLine
          ? "READY_TO_WRITE_LINE"
          : !profileTaxEnabled
            ? "TAX_DISABLED_BY_PROFILE"
            : "CALCULATED_ZERO_TAX",
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        return {
          companyId: params.companyId,
          employeeId: params.employeeId,
          taxYear: null,
          taxProfile: null,
          taxableIncomeCurrentRun: roundMoney(
            currentRunTotalTaxableIncome,
          ).toFixed(2),
          regularTaxableIncomeCurrentRun: roundMoney(
            currentRunRegularIncome,
          ).toFixed(2),
          oneTimeTaxableIncomeCurrentRun: roundMoney(
            currentRunBonusIncome + currentRunOtherOneTimeIncome,
          ).toFixed(2),
          projectedAnnualIncome: "0.00",
          expenseDeduction: "0.00",
          allowanceTotal: "0.00",
          socialSecurityYtd: "0.00",
          socialSecurityCurrentRun: roundMoney(
            numberValue(params.socialSecurityCurrentRun),
          ).toFixed(2),
          socialSecurityAllowance: "0.00",
          netTaxableIncome: "0.00",
          annualTax: "0.00",
          taxWithheldYtd: "0.00",
          remainingTax: "0.00",
          currentRunTax: "0.00",
          currentRunTaxAmount: 0,
          roundingAdjustment: "0.00",
          remainingPeriods,
          warnings: [
            {
              code: "TAX_ENGINE_NOT_READY",
              title: "ข้อมูลภาษียังไม่พร้อม",
              detail:
                error instanceof Error
                  ? error.message
                  : "ยังไม่สามารถคำนวณภาษีได้",
              severity: "WARNING" as const,
            },
          ],
          calculationSnapshot: {
            formula: "annualized_remaining_periods_actual",
            isPreviewOnly: false,
            willWritePayrollLine: false,
            payrollRunId: params.payrollRunId,
            payrollItemId: params.payrollItemId ?? null,
            employeeId: params.employeeId,
            error: error instanceof Error ? error.message : String(error),
          },
          canCreatePayrollLine: false,
          integrationStatus: "NOT_READY",
        };
      }

      throw error;
    }
  }

  private async calculatePreviewFromInput(input: TaxPreviewInput) {
    const prisma = (input.db ?? this.prisma) as any;
    const payDate = this.toTaxDate(input.payDate);
    const taxYear = input.taxYearId
      ? await prisma.payrollTaxYear.findFirst({
          where: {
            id: input.taxYearId,
            companyId: input.companyId,
            deletedAt: null,
          },
          include: TAX_YEAR_INCLUDE,
        })
      : await this.findTaxYearForPayDate(input.companyId, payDate, input.db);
    if (!taxYear) throw new NotFoundException("ไม่พบปีภาษีที่ใช้คำนวณ");

    const profile = await prisma.employeeTaxProfile.findFirst({
      where: {
        employeeId: input.employeeId,
        taxYearId: taxYear.id,
        deletedAt: null,
      },
      include: {
        employee: true,
        allowances: {
          where: { deletedAt: null },
          include: { allowanceType: true },
        },
      },
    });

    const warnings: TaxWarning[] = [];
    if (!profile) {
      /*
       * ไม่มีข้อมูลลดหย่อนไม่ใช่เหตุให้หยุดคำนวณ
       *
       * เดิมบล็อกไว้ ผลคือใครที่ HR ยังไม่ได้คีย์จะถูกหักภาษี 0 ทั้งปีแล้วไป
       * โป๊ะตอนยื่นแบบ ซึ่งนายจ้างต้องร่วมรับผิดตาม ม.54 ป.รัษฎากร
       * จึงเปลี่ยนเป็นคำนวณด้วยค่าลดหย่อนพื้นฐาน (ส่วนตัว + ประกันสังคม)
       * เหมือนโปรแกรมเงินเดือนทั่วไป แล้วเตือนว่ายอดอาจสูงกว่าความจริง
       */
      warnings.push({
        code: "USING_DEFAULT_ALLOWANCE",
        title: "คิดภาษีด้วยค่าลดหย่อนพื้นฐาน",
        detail:
          "ยังไม่มีค่าลดหย่อนที่พนักงานแจ้งไว้ ระบบคิดให้เฉพาะลดหย่อนส่วนตัวและประกันสังคม ภาษีที่หักอาจสูงกว่าความเป็นจริง",
        severity: "WARNING",
      });
    }

    const brackets = taxYear.brackets ?? [];
    if (!brackets.length) {
      warnings.push({
        code: "NO_TAX_BRACKETS",
        title: "ยังไม่มีขั้นภาษี",
        detail: "กรุณาตั้งค่าขั้นภาษีของปีภาษีก่อนใช้งานจริง",
        severity: "BLOCKING",
      });
    } else {
      // ตรวจว่าขั้นภาษีต่อเนื่องและเริ่มที่ 0 — ถ้ามีช่องว่าง/ทับซ้อน จะคำนวณภาษีผิดเงียบ ๆ
      const sorted = [...brackets].sort(
        (a: any, b: any) => numberValue(a.minIncome) - numberValue(b.minIncome),
      );
      const issues: string[] = [];
      if (numberValue(sorted[0].minIncome) !== 0) {
        issues.push("ขั้นแรกไม่ได้เริ่มที่ 0");
      }
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const currentMax =
          sorted[i].maxIncome === null ? null : numberValue(sorted[i].maxIncome);
        const nextMin = numberValue(sorted[i + 1].minIncome);
        if (currentMax === null) {
          issues.push("มีขั้นที่ไม่มีเพดาน (max) อยู่ก่อนขั้นสุดท้าย");
          break;
        }
        if (currentMax !== nextMin) {
          issues.push(
            currentMax < nextMin
              ? `มีช่องว่างระหว่าง ${currentMax.toLocaleString("th-TH")} ถึง ${nextMin.toLocaleString("th-TH")}`
              : `มีช่วงทับซ้อนที่ ${nextMin.toLocaleString("th-TH")}`,
          );
        }
      }
      if (numberValue(sorted[sorted.length - 1].maxIncome ?? null) !== 0 &&
          sorted[sorted.length - 1].maxIncome !== null) {
        issues.push("ขั้นสูงสุดควรไม่มีเพดาน (max = ว่าง) เพื่อครอบคลุมรายได้ส่วนที่เกิน");
      }
      if (issues.length) {
        warnings.push({
          code: "TAX_BRACKET_NOT_CONTINUOUS",
          title: "ขั้นภาษีตั้งค่าไม่ต่อเนื่อง",
          detail: `ตรวจพบ: ${issues.join(" / ")} — อาจทำให้คำนวณภาษีผิด กรุณาตรวจขั้นภาษีของปีภาษีนี้`,
          severity: "WARNING",
        });
      }
    }

    const allowanceRows = profile?.allowances ?? [];
    const hasPersonalAllowance = allowanceRows.some(
      (allowance: any) => allowance.allowanceType?.code === "PERSONAL",
    );
    const standardAllowance = hasPersonalAllowance
      ? 0
      : numberValue(taxYear.standardPersonalAllowance, 60000);
    // ประมาณการ "ประกันสังคมทั้งปี" ให้สอดคล้องกับการ project รายได้ทั้งปี
    // = ที่จ่ายสะสมจริง (YTD) + ที่จ่ายงวดนี้ × จำนวนงวดที่เหลือ (รวมงวดปัจจุบัน)
    // ทำให้ลดหย่อน สปส. คงที่ทั้งปี → ภาษีต่อเดือนเท่ากัน ไม่หักเกินช่วงต้นปี
    const socialSecurityTotal = Math.max(
      numberValue(input.socialSecurityYtd) +
        numberValue(input.socialSecurityCurrentRun) *
          Math.max(input.remainingPeriods, 1),
      0,
    );
    const socialSecurityAllowance = await this.resolveSocialSecurityAllowance(
      input.companyId,
      socialSecurityTotal,
      input.db,
    );

    const regularTaxableIncomeCurrentRun = Math.max(
      numberValue(input.monthlyIncome),
      0,
    );
    const bonusIncomeCurrentRun = Math.max(numberValue(input.bonusIncome), 0);
    const otherOneTimeIncomeCurrentRun = Math.max(
      numberValue(input.otherTaxableIncome),
      0,
    );
    const oneTimeTaxableIncomeCurrentRun =
      bonusIncomeCurrentRun + otherOneTimeIncomeCurrentRun;
    const taxableIncomeCurrentRun =
      regularTaxableIncomeCurrentRun + oneTimeTaxableIncomeCurrentRun;

    const projectedAnnualIncomeBeforeCurrentOneTime =
      input.taxableIncomeYtd +
      regularTaxableIncomeCurrentRun * input.remainingPeriods;
    const projectedAnnualIncome =
      projectedAnnualIncomeBeforeCurrentOneTime +
      oneTimeTaxableIncomeCurrentRun;
    const expenseDeduction = Math.min(
      projectedAnnualIncome * numberValue(taxYear.personalExpenseRate, 0.5),
      numberValue(taxYear.personalExpenseMax, 100000),
    );
    const expenseDeductionBeforeCurrentOneTime = Math.min(
      projectedAnnualIncomeBeforeCurrentOneTime *
        numberValue(taxYear.personalExpenseRate, 0.5),
      numberValue(taxYear.personalExpenseMax, 100000),
    );

    // ต้องคิดหลังรู้เงินได้ทั้งปีและค่าใช้จ่าย เพราะเพดานหลายตัวเป็น % ของสองค่านี้
    const resolvedAllowances = resolveAllowanceTotal({
      allowances: allowanceRows.map(toAllowanceLimitInput),
      limitGroups: (taxYear.allowanceLimitGroups ?? []).map(
        toAllowanceLimitGroupRule,
      ),
      grossIncome: projectedAnnualIncome,
      expenseDeduction,
      baseAllowanceTotal: standardAllowance + socialSecurityAllowance,
    });
    const approvedAllowanceTotal = resolvedAllowances.total;
    const allowanceTotal =
      approvedAllowanceTotal + standardAllowance + socialSecurityAllowance;

    const cappedAllowances = resolvedAllowances.lines.filter(
      (line) => line.cappedBy !== "NONE",
    );
    if (cappedAllowances.length) {
      warnings.push({
        code: "ALLOWANCE_CAPPED",
        title: "ค่าลดหย่อนบางรายการถูกตัดตามเพดาน",
        detail: `หักได้ไม่เต็มที่แจ้งไว้: ${cappedAllowances
          .map(
            (line) =>
              `${line.nameTh ?? line.code} ${line.requestedAmount.toLocaleString("th-TH")} → ${line.allowedAmount.toLocaleString("th-TH")}`,
          )
          .join(" · ")}`,
        severity: "INFO",
      });
    }

    const netTaxableIncome = Math.max(
      projectedAnnualIncome - expenseDeduction - allowanceTotal,
      0,
    );
    const netTaxableIncomeBeforeCurrentOneTime = Math.max(
      projectedAnnualIncomeBeforeCurrentOneTime -
        expenseDeductionBeforeCurrentOneTime -
        allowanceTotal,
      0,
    );
    const annualTax = this.calculateAnnualTax(netTaxableIncome, brackets);
    const annualTaxBeforeCurrentOneTimeIncome = this.calculateAnnualTax(
      netTaxableIncomeBeforeCurrentOneTime,
      brackets,
    );
    const remainingTax = Math.max(annualTax - input.taxWithheldYtd, 0);
    const regularRemainingTax = Math.max(
      annualTaxBeforeCurrentOneTimeIncome - input.taxWithheldYtd,
      0,
    );
    const regularCurrentRunTaxRaw =
      input.remainingPeriods > 0
        ? regularRemainingTax / input.remainingPeriods
        : regularRemainingTax;
    const oneTimeIncomeCurrentRunTaxRaw = Math.max(
      annualTax - annualTaxBeforeCurrentOneTimeIncome,
      0,
    );
    const uncappedCurrentRunTaxRaw =
      regularCurrentRunTaxRaw + oneTimeIncomeCurrentRunTaxRaw;
    const currentRunTaxRaw = Math.min(uncappedCurrentRunTaxRaw, remainingTax);
    const currentRunTax =
      taxYear.roundingMethod === "ROUND_TO_BAHT"
        ? roundBaht(currentRunTaxRaw)
        : roundMoney(currentRunTaxRaw);
    const roundingAdjustment = currentRunTax - currentRunTaxRaw;

    const snapshot = {
      formula: "annualized_regular_plus_current_one_time_income",
      isPreviewOnly: true,
      willWritePayrollLine: false,
      taxYearId: taxYear.id,
      taxYear: taxYear.taxYear,
      payrollRunId: input.payrollRunId,
      payrollItemId: input.payrollItemId,
      employeeId: input.employeeId,
      payDate: payDate?.toISOString() ?? null,
      regularTaxableIncomeCurrentRun,
      oneTimeTaxableIncomeCurrentRun,
      taxableIncomeCurrentRun,
      taxableIncomeYtd: input.taxableIncomeYtd,
      bonusIncome: bonusIncomeCurrentRun,
      otherTaxableIncome: otherOneTimeIncomeCurrentRun,
      projectedAnnualIncomeBeforeCurrentOneTime,
      annualTaxBeforeCurrentOneTimeIncome,
      regularCurrentRunTaxRaw,
      oneTimeIncomeCurrentRunTaxRaw,
      uncappedCurrentRunTaxRaw,
      socialSecurityYtd: input.socialSecurityYtd,
      socialSecurityCurrentRun: input.socialSecurityCurrentRun,
      socialSecurityAllowance,
      remainingPeriods: input.remainingPeriods,
      brackets: brackets.map((bracket: any) => ({
        minIncome: String(bracket.minIncome),
        maxIncome:
          bracket.maxIncome === null ? null : String(bracket.maxIncome),
        rate: String(bracket.rate),
      })),
      allowances: resolvedAllowances.lines.map((line) => ({
        code: line.code,
        nameTh: line.nameTh,
        // amount = ยอดที่หักได้จริง เพื่อให้บวกแล้วตรงกับ allowanceTotal
        amount: line.allowedAmount.toFixed(2),
        declaredAmount: line.declaredAmount.toFixed(2),
        requestedAmount: line.requestedAmount.toFixed(2),
        cappedBy: line.cappedBy,
        limitGroupCode: line.limitGroupCode,
      })),
      allowanceLimitGroups: resolvedAllowances.groups.map((group) => ({
        code: group.code,
        nameTh: group.nameTh,
        requestedAmount: group.requestedAmount.toFixed(2),
        allowedAmount: group.allowedAmount.toFixed(2),
        limitAmount:
          group.limitAmount === null ? null : group.limitAmount.toFixed(2),
      })),
      standardAllowance,
    };

    return {
      companyId: input.companyId,
      employeeId: input.employeeId,
      taxYear: {
        id: taxYear.id,
        taxYear: taxYear.taxYear,
        code: taxYear.code,
        name: taxYear.name,
        roundingMethod: taxYear.roundingMethod,
        taxAveragingMethod: taxYear.taxAveragingMethod,
      },
      taxProfile: profile
        ? {
            id: profile.id,
            taxEnabled: profile.taxEnabled,
            taxId: profile.taxId,
            updatedAt: profile.updatedAt,
          }
        : null,
      taxableIncomeCurrentRun: roundMoney(taxableIncomeCurrentRun).toFixed(2),
      regularTaxableIncomeCurrentRun: roundMoney(
        regularTaxableIncomeCurrentRun,
      ).toFixed(2),
      oneTimeTaxableIncomeCurrentRun: roundMoney(
        oneTimeTaxableIncomeCurrentRun,
      ).toFixed(2),
      bonusIncome: roundMoney(bonusIncomeCurrentRun).toFixed(2),
      otherTaxableIncome: roundMoney(otherOneTimeIncomeCurrentRun).toFixed(2),
      projectedAnnualIncome: roundMoney(projectedAnnualIncome).toFixed(2),
      expenseDeduction: roundMoney(expenseDeduction).toFixed(2),
      allowanceTotal: roundMoney(allowanceTotal).toFixed(2),
      socialSecurityYtd: roundMoney(input.socialSecurityYtd).toFixed(2),
      socialSecurityCurrentRun: roundMoney(
        input.socialSecurityCurrentRun,
      ).toFixed(2),
      socialSecurityAllowance: roundMoney(socialSecurityAllowance).toFixed(2),
      netTaxableIncome: roundMoney(netTaxableIncome).toFixed(2),
      annualTax: roundMoney(annualTax).toFixed(2),
      taxWithheldYtd: roundMoney(input.taxWithheldYtd).toFixed(2),
      remainingTax: roundMoney(remainingTax).toFixed(2),
      currentRunTax: roundMoney(currentRunTax).toFixed(2),
      roundingAdjustment: roundMoney(roundingAdjustment).toFixed(2),
      remainingPeriods: input.remainingPeriods,
      warnings,
      calculationSnapshot: snapshot,
    };
  }

  private calculateAnnualTax(netTaxableIncome: number, brackets: any[]) {
    let tax = 0;
    for (const bracket of brackets) {
      const minIncome = numberValue(bracket.minIncome);
      const maxIncome =
        bracket.maxIncome === null
          ? Number.POSITIVE_INFINITY
          : numberValue(bracket.maxIncome);
      const rate = numberValue(bracket.rate);
      if (netTaxableIncome <= minIncome) continue;
      const taxableInBracket = Math.max(
        Math.min(netTaxableIncome, maxIncome) - minIncome,
        0,
      );
      tax += taxableInBracket * rate;
    }
    return roundMoney(tax);
  }

  private async findTaxYearForPayDate(
    companyId: string,
    payDate?: Date | null,
    db?: TaxCalculatorDb,
  ) {
    const prisma = (db ?? this.prisma) as any;
    const include = TAX_YEAR_INCLUDE;

    if (payDate) {
      const taxYearByPayDate = await prisma.payrollTaxYear.findFirst({
        where: {
          companyId,
          deletedAt: null,
          status: "ACTIVE",
          startDate: { lte: payDate },
          endDate: { gte: payDate },
        },
        include,
        orderBy: [
          { isActive: "desc" },
          { startDate: "desc" },
          { taxYear: "desc" },
          { createdAt: "desc" },
        ],
      });

      if (taxYearByPayDate) return taxYearByPayDate;
    }

    return prisma.payrollTaxYear.findFirst({
      where: {
        companyId,
        deletedAt: null,
        status: "ACTIVE",
      },
      include,
      orderBy: [
        { isActive: "desc" },
        { taxYear: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  private toTaxDate(value?: Date | string | null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /**
   * ค่าลดหย่อนเงินสมทบประกันสังคม
   *
   * เพดานคำนวณจากเพดานฐานประกันสังคมของบริษัทโดยตรง (ฐานสูงสุด x อัตรา x 12)
   * ไม่ใช้ตัวเลขที่ตั้งไว้ในตารางค่าลดหย่อน เพราะเคยเกิดกรณีเพดานฐานถูกปรับขึ้น
   * แต่ค่าลดหย่อนค้างที่ตัวเลขเก่า ทำให้ลูกจ้างถูกหักภาษีเกิน
   */
  private async resolveSocialSecurityAllowance(
    companyId: string,
    socialSecurityTotal: number,
    db?: TaxCalculatorDb,
  ) {
    if (socialSecurityTotal <= 0) return 0;

    const settings = await ((db ?? this.prisma) as any).companyPayrollSetting.findFirst({
      where: { companyId },
      select: {
        socialSecurityEmployeeRate: true,
        socialSecurityMaxBase: true,
      },
    });

    const ceiling = resolveAnnualSocialSecurityCeiling({
      socialSecurityEmployeeRate: numberValue(
        settings?.socialSecurityEmployeeRate,
      ),
      socialSecurityMaxBase: numberValue(settings?.socialSecurityMaxBase),
    });

    return Math.min(roundMoney(socialSecurityTotal), ceiling);
  }

  private async buildRunPreviewItems(run: any) {
    const prisma = this.prisma as any;
    const periodEndDate = run.period?.endDate;
    const periodStartDate = run.period?.startDate;
    if (!periodEndDate || !periodStartDate) return [];

    const compensations = await prisma.employeeCompensation.findMany({
      where: {
        companyId: run.companyId,
        status: "ACTIVE",
        deletedAt: null,
        effectiveDate: { lte: periodEndDate },
        OR: [{ endDate: null }, { endDate: { gte: periodEndDate } }],
        employee: {
          deletedAt: null,
          status: { in: ["ACTIVE", "PROBATION"] },
        },
      },
      include: {
        employee: {
          include: {
            department: { select: { id: true, code: true, nameTh: true } },
            branch: { select: { id: true, code: true, nameTh: true } },
          },
        },
      },
      orderBy: [
        { employeeId: "asc" },
        { effectiveDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    const latestCompensations: any[] = [];
    const seenEmployeeIds = new Set<string>();
    for (const compensation of compensations) {
      if (seenEmployeeIds.has(compensation.employeeId)) continue;
      seenEmployeeIds.add(compensation.employeeId);
      latestCompensations.push(compensation);
    }

    const employeeIds = latestCompensations.map(
      (compensation) => compensation.employeeId,
    );
    if (!employeeIds.length) return [];

    const recurringLines = await prisma.employeeCompensationItem.findMany({
      where: {
        companyId: run.companyId,
        employeeId: { in: employeeIds },
        type: "EARNING",
        isTaxable: true,
        status: "ACTIVE",
        deletedAt: null,
        effectiveDate: { lte: periodEndDate },
        OR: [{ endDate: null }, { endDate: { gte: periodStartDate } }],
      },
      select: { employeeId: true, amount: true },
    });
    const approvedAdjustments = await prisma.payrollAdjustment.findMany({
      where: {
        companyId: run.companyId,
        employeeId: { in: employeeIds },
        type: "EARNING",
        isTaxable: true,
        status: "APPROVED",
        deletedAt: null,
        OR: [
          { periodId: run.periodId },
          { effectiveDate: { gte: periodStartDate, lte: periodEndDate } },
        ],
      },
      select: { employeeId: true, amount: true },
    });

    const recurringByEmployeeId = this.sumAmountByEmployeeId(recurringLines);
    const adjustmentByEmployeeId =
      this.sumAmountByEmployeeId(approvedAdjustments);

    return latestCompensations.map((compensation) => {
      /* รายวัน/รายชั่วโมงต้องเทียบเป็นรายเดือนก่อน ไม่งั้นประมาณการภาษีต่ำเกินจริงมาก */
      const taxableIncomeCurrentRun =
        resolveMonthlyEquivalentWage(
          compensation.baseSalary,
          null,
          (compensation as any).salaryBasis,
        ) +
        /* เบี้ยประจำนับผ่าน recurringByEmployeeId แล้ว ไม่มีช่องคงที่ให้บวกอีก */
        (recurringByEmployeeId.get(compensation.employeeId) ?? 0) +
        (adjustmentByEmployeeId.get(compensation.employeeId) ?? 0);

      return {
        id: null,
        employeeId: compensation.employeeId,
        employee: compensation.employee,
        compensation,
        lines: [],
        totalEarnings: roundMoney(taxableIncomeCurrentRun).toFixed(2),
        socialSecurityCurrentRun: 0,
        isEstimated: true,
      };
    });
  }

  private sumAmountByEmployeeId(
    rows: Array<{ employeeId: string; amount: unknown }>,
  ) {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      map.set(
        row.employeeId,
        (map.get(row.employeeId) ?? 0) + numberValue(row.amount),
      );
    }
    return map;
  }

  private readonly ytdPayrollRunStatuses = [
    "CALCULATED",
    "REVIEWED",
    "APPROVED",
    "PAID",
  ];

  private previousTaxCalculationWhere(
    employeeId: string,
    taxYearId: string,
    excludeRunId?: string,
  ) {
    return {
      employeeId,
      taxYearId,
      ...(excludeRunId ? { payrollRunId: { not: excludeRunId } } : {}),
      payrollRun: {
        deletedAt: null,
        status: { in: this.ytdPayrollRunStatuses },
      },
    };
  }

  private async findTaxWithheldYtd(
    employeeId: string,
    taxYearId?: string,
    excludeRunId?: string,
    db?: TaxCalculatorDb,
  ) {
    const prisma = (db ?? this.prisma) as any;
    if (!taxYearId) return 0;
    const summary = await prisma.employeeTaxYearSummary.findFirst({
      where: { employeeId, taxYearId },
    });
    const summaryAmount = numberValue(summary?.totalTaxWithheld);
    const previousCalculations = await prisma.payrollTaxCalculation.findMany({
      where: this.previousTaxCalculationWhere(
        employeeId,
        taxYearId,
        excludeRunId,
      ),
      select: { currentRunTax: true },
    });
    const calculationAmount = previousCalculations.reduce(
      (sum: number, calculation: any) =>
        sum + numberValue(calculation.currentRunTax),
      0,
    );
    // employeeTaxYearSummary = ยอดยกมา (opening) ที่ตั้งภายนอกเมื่อเริ่มใช้ระบบกลางปี
    // YTD ที่ถูกต้อง = ยอดยกมา + ผลรวมรอบที่รันในระบบ (ไม่ใช่ค่ามากสุด)
    return summaryAmount + calculationAmount;
  }

  private async findTaxableIncomeYtd(
    employeeId: string,
    taxYearId?: string,
    excludeRunId?: string,
    db?: TaxCalculatorDb,
  ) {
    const prisma = (db ?? this.prisma) as any;
    if (!taxYearId) return 0;
    const summary = await prisma.employeeTaxYearSummary.findFirst({
      where: { employeeId, taxYearId },
    });
    const summaryAmount = numberValue(summary?.totalTaxableIncome);
    const previousCalculations = await prisma.payrollTaxCalculation.findMany({
      where: this.previousTaxCalculationWhere(
        employeeId,
        taxYearId,
        excludeRunId,
      ),
      select: { taxableIncomeCurrentRun: true },
    });
    const calculationAmount = previousCalculations.reduce(
      (sum: number, calculation: any) =>
        sum + numberValue(calculation.taxableIncomeCurrentRun),
      0,
    );
    // ยอดยกมา (opening) + ผลรวมรอบที่รันในระบบ
    return summaryAmount + calculationAmount;
  }

  private async findSocialSecurityYtd(
    employeeId: string,
    taxYearId?: string,
    excludeRunId?: string,
    db?: TaxCalculatorDb,
  ) {
    const prisma = (db ?? this.prisma) as any;
    if (!taxYearId) return 0;

    const [summary, taxYear] = await Promise.all([
      prisma.employeeTaxYearSummary.findFirst({
        where: { employeeId, taxYearId },
      }),
      prisma.payrollTaxYear.findFirst({
        where: { id: taxYearId, deletedAt: null },
        select: { startDate: true, endDate: true },
      }),
    ]);
    const summaryAmount = numberValue(summary?.totalSocialSecurity);
    if (!taxYear) return summaryAmount;

    const previousLines = await prisma.payrollLine.findMany({
      where: {
        code: "SOCIAL_SECURITY",
        type: "DEDUCTION",
        sourceType: "SOCIAL_SECURITY",
        payrollItem: {
          employeeId,
          ...(excludeRunId ? { runId: { not: excludeRunId } } : {}),
          run: {
            deletedAt: null,
            status: { in: this.ytdPayrollRunStatuses },
            period: {
              paymentDate: {
                gte: taxYear.startDate,
                lte: taxYear.endDate,
              },
            },
          },
        },
      },
      select: { amount: true },
    });
    const lineAmount = previousLines.reduce(
      (sum: number, line: any) => sum + numberValue(line.amount),
      0,
    );
    // ยอดยกมา (opening) + ผลรวมรอบที่รันในระบบ
    return summaryAmount + lineAmount;
  }

  private sumEmployeeSocialSecurityLines(lines: any[], fallback: unknown) {
    const lineAmount = (lines ?? [])
      .filter(
        (line) =>
          line.type === "DEDUCTION" &&
          line.code === "SOCIAL_SECURITY" &&
          line.sourceType === "SOCIAL_SECURITY",
      )
      .reduce((sum, line) => sum + numberValue(line.amount), 0);
    return lineAmount > 0 ? lineAmount : numberValue(fallback);
  }

  private splitTaxableIncomeLines(lines: any[], fallback: unknown) {
    const taxableLines = (lines ?? []).filter(
      (line) => line.type === "EARNING" && line.isTaxable !== false,
    );

    if (!taxableLines.length) {
      const fallbackAmount = Math.max(numberValue(fallback), 0);
      return {
        totalTaxableIncome: fallbackAmount,
        regularTaxableIncome: fallbackAmount,
        bonusIncome: 0,
        otherOneTimeIncome: 0,
      };
    }

    return taxableLines.reduce(
      (acc, line) => {
        const amount = Math.max(numberValue(line.amount), 0);
        if (amount <= 0) return acc;

        acc.totalTaxableIncome += amount;
        if (this.isBonusTaxableLine(line)) {
          acc.bonusIncome += amount;
        } else if (this.isRegularTaxableLine(line)) {
          acc.regularTaxableIncome += amount;
        } else {
          acc.otherOneTimeIncome += amount;
        }

        return acc;
      },
      {
        totalTaxableIncome: 0,
        regularTaxableIncome: 0,
        bonusIncome: 0,
        otherOneTimeIncome: 0,
      },
    );
  }

  private isRegularTaxableLine(line: any) {
    const sourceType = String(line?.sourceType ?? "").toUpperCase();
    return sourceType === "BASE_SALARY" || sourceType === "ALLOWANCE";
  }

  private isBonusTaxableLine(line: any) {
    const sourceType = String(line?.sourceType ?? "").toUpperCase();
    const code = String(line?.code ?? "").toUpperCase();
    return sourceType === "BONUS" || code.includes("BONUS");
  }

  private guessRemainingPeriods(value: Date | string | null | undefined) {
    if (!value) return 1;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 1;
    return Math.max(12 - date.getMonth(), 1);
  }

  private getEmployeeName(employee: any) {
    if (!employee) return "-";
    return (
      employee.displayName ||
      [employee.title, employee.firstName, employee.lastName]
        .filter(Boolean)
        .join(" ") ||
      employee.employeeCode ||
      "-"
    );
  }
}
