import { Injectable } from '@nestjs/common';
import {
  PayrollLineSourceType,
  PayrollLineType,
} from '../../../generated/prisma/client';
import type { PayrollExtraLine } from '../types/payroll-extra-lines.types';

type SocialSecuritySettings = {
  socialSecurityEmployeeRate?: number | null;
  socialSecurityEmployerRate?: number | null;
  socialSecurityMinBase?: number | null;
  socialSecurityMaxBase?: number | null;
};

type SocialSecurityLineInput = Pick<
  PayrollExtraLine,
  'amount' | 'isSocialSecurityBase'
>;

type CollectSocialSecurityLinesParams = {
  enabled: boolean;
  sourceId?: string | null;
  earningLines: Array<SocialSecurityLineInput>;
  /**
   * รายการหักที่ทำให้ค่าจ้างลดลงจริง เช่น ลาไม่รับค่าจ้าง ขาดงาน
   * เฉพาะรายการที่ติดธง isSocialSecurityBase จะถูกลบออกจากฐาน
   * (ค่าปรับมาสายไม่นับ เพราะค่าจ้างเกิดขึ้นครบแล้ว)
   */
  deductionLines?: Array<SocialSecurityLineInput>;
  settings: SocialSecuritySettings;
};

export type PayrollSocialSecuritySummary = {
  deductionLines: PayrollExtraLine[];
  employerContributionLines: PayrollExtraLine[];
  enabled: boolean;
  socialSecurityBase: number;
  cappedBase: number;
  employeeRate: number;
  employerRate: number;
  employeeContribution: number;
  employerContribution: number;
  minBase: number;
  maxBase: number;
  skippedReason: string | null;
};

export const DEFAULT_EMPLOYEE_RATE = 5;
const DEFAULT_EMPLOYER_RATE = 5;
const DEFAULT_MIN_BASE = 1650;
// เพดานฐานประกันสังคม (ม.33) แบบขั้นบันได:
//   ปี 2569-2571 = 17,500 (สมทบสูงสุด 5% = 875 บาท/เดือน)
//   ปี 2572-2574 = 20,000, ปี 2575 เป็นต้นไป = 23,000
// ค่า default ตั้งตามปีปัจจุบัน (2569) = 17,500 หากบริษัทใช้เพดานอื่นตั้งได้ที่ socialSecurityMaxBase
export const DEFAULT_MAX_BASE = 17500;

/**
 * เพดานเงินสมทบประกันสังคมต่อปี ที่ลูกจ้างใช้เป็นค่าลดหย่อนภาษีได้
 *
 * ต้องคำนวณจากเพดานฐานเดียวกับที่ใช้หักเงินสมทบจริง
 * ไม่ให้ตั้งเป็นตัวเลขตายตัวแยกกัน เพราะพอเพดานฐานเปลี่ยน
 * ค่าลดหย่อนจะค้างอยู่ที่ตัวเลขเก่าแล้วลูกจ้างจะถูกหักภาษีเกิน
 *
 *   เพดานฐาน 15,000 -> 5% -> 750/เดือน  -> 9,000/ปี
 *   เพดานฐาน 17,500 -> 5% -> 875/เดือน  -> 10,500/ปี
 */
export function resolveAnnualSocialSecurityCeiling(settings?: {
  socialSecurityEmployeeRate?: number | null;
  socialSecurityMaxBase?: number | null;
}) {
  const rawRate = Number(settings?.socialSecurityEmployeeRate);
  const rate =
    Number.isFinite(rawRate) && rawRate > 0 ? rawRate : DEFAULT_EMPLOYEE_RATE;

  const rawMaxBase = Number(settings?.socialSecurityMaxBase);
  const maxBase =
    Number.isFinite(rawMaxBase) && rawMaxBase > 0
      ? rawMaxBase
      : DEFAULT_MAX_BASE;

  return Math.round(((maxBase * rate) / 100) * 12 * 100) / 100;
}

@Injectable()
export class PayrollSocialSecurityService {
  collectEmployeeSocialSecurityLines(
    params: CollectSocialSecurityLinesParams,
  ): PayrollSocialSecuritySummary {
    const employeeRate = this.normalizeRate(
      params.settings.socialSecurityEmployeeRate,
      DEFAULT_EMPLOYEE_RATE,
    );
    const employerRate = this.normalizeRate(
      params.settings.socialSecurityEmployerRate,
      DEFAULT_EMPLOYER_RATE,
    );
    const minBase = this.normalizeBase(
      params.settings.socialSecurityMinBase,
      DEFAULT_MIN_BASE,
    );
    const rawMaxBase = this.normalizeBase(
      params.settings.socialSecurityMaxBase,
      DEFAULT_MAX_BASE,
    );
    const maxBase = Math.max(rawMaxBase, minBase);
    const baseEarnings = params.earningLines
      .filter((line) => line.isSocialSecurityBase === true)
      .reduce((sum, line) => sum + this.toNumber(line.amount), 0);

    const baseDeductions = (params.deductionLines ?? [])
      .filter((line) => line.isSocialSecurityBase === true)
      .reduce((sum, line) => sum + this.toNumber(line.amount), 0);

    // ค่าจ้างที่ลูกจ้างได้รับจริงหลังหักวันที่ไม่ได้ทำงาน (ไม่ให้ติดลบ)
    const socialSecurityBase = this.roundMoney(
      Math.max(baseEarnings - baseDeductions, 0),
    );

    const emptySummary = (
      skippedReason: string | null,
    ): PayrollSocialSecuritySummary => ({
      deductionLines: [],
      employerContributionLines: [],
      enabled: params.enabled,
      socialSecurityBase,
      cappedBase: 0,
      employeeRate,
      employerRate,
      employeeContribution: 0,
      employerContribution: 0,
      minBase,
      maxBase,
      skippedReason,
    });

    if (!params.enabled) {
      return emptySummary('employee_social_security_disabled');
    }

    if (socialSecurityBase <= 0) {
      return emptySummary('no_social_security_base_earnings');
    }

    if (employeeRate <= 0 && employerRate <= 0) {
      return emptySummary('social_security_rate_is_zero');
    }

    const cappedBase = this.roundMoney(
      Math.min(Math.max(socialSecurityBase, minBase), maxBase),
    );
    const employeeContribution = this.roundMoney(
      (cappedBase * employeeRate) / 100,
    );
    const employerContribution = this.roundMoney(
      (cappedBase * employerRate) / 100,
    );
    const sourceId = params.sourceId ?? null;
    const note = [
      `ฐานจริง ${this.formatMoney(socialSecurityBase)} บาท`,
      `ฐานคำนวณ ${this.formatMoney(cappedBase)} บาท`,
      `ช่วงฐาน ${this.formatMoney(minBase)}-${this.formatMoney(maxBase)} บาท`,
    ].join(' | ');

    const deductionLines: PayrollExtraLine[] =
      employeeContribution > 0
        ? [
            {
              code: 'SOCIAL_SECURITY',
              name: 'ประกันสังคม',
              type: PayrollLineType.DEDUCTION,
              sourceType: PayrollLineSourceType.SOCIAL_SECURITY,
              sourceId,
              componentId: null,
              quantity: cappedBase,
              rate: employeeRate,
              amount: employeeContribution,
              isTaxable: false,
              isSocialSecurityBase: false,
              sortOrder: 900,
              note: `${note} | ลูกจ้าง ${employeeRate}%`,
            },
          ]
        : [];

    const employerContributionLines: PayrollExtraLine[] =
      employerContribution > 0
        ? [
            {
              code: 'SOCIAL_SECURITY_EMPLOYER',
              name: 'เงินสมทบประกันสังคมนายจ้าง',
              type: PayrollLineType.EMPLOYER_CONTRIBUTION,
              sourceType: PayrollLineSourceType.SOCIAL_SECURITY,
              sourceId,
              componentId: null,
              quantity: cappedBase,
              rate: employerRate,
              amount: employerContribution,
              isTaxable: false,
              isSocialSecurityBase: false,
              sortOrder: 905,
              note: `${note} | นายจ้าง ${employerRate}%`,
            },
          ]
        : [];

    return {
      deductionLines,
      employerContributionLines,
      enabled: params.enabled,
      socialSecurityBase,
      cappedBase,
      employeeRate,
      employerRate,
      employeeContribution,
      employerContribution,
      minBase,
      maxBase,
      skippedReason: null,
    };
  }

  private normalizeRate(value: unknown, fallback: number) {
    const number = this.toNumber(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(number, 0), 100);
  }

  private normalizeBase(value: unknown, fallback: number) {
    const number = this.toNumber(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(this.roundMoney(number), 0);
  }

  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private roundMoney(value: number) {
    // กัน floating-point error (เช่น 1.005 → 1.00) ด้วย epsilon ที่สเกลสตางค์
    const epsilon = value >= 0 ? 1e-6 : -1e-6;
    return Math.round(value * 100 + epsilon) / 100;
  }

  private formatMoney(value: number) {
    return this.roundMoney(value).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
