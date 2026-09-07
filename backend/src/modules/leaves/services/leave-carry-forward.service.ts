import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LeaveBalanceLedgerService } from '../leave-balance-ledger.service';
import { LeavePolicyResolverService } from './leave-policy-resolver.service';

/** ยอดวันลาที่ใช้คำนวณการสะสม/หมดอายุ */
export type CarryForwardBalanceInput = {
  entitlementDays: number;
  carriedForwardDays: number;
  adjustedDays: number;
  usedDays: number;
  pendingDays: number;
};

export type CarryForwardPolicyInput = {
  allowCarryForward: boolean;
  /** 0 = ไม่จำกัดจำนวนวันที่สะสมได้ */
  carryForwardLimitDays: number;
  carryForwardExpireMonth?: number | null;
  carryForwardExpireDay?: number | null;
};

export type CarryForwardRunSummary = {
  companyId: string;
  fromYear: number;
  toYear: number;
  dryRun: boolean;
  scanned: number;
  carried: number;
  skippedNoPolicy: number;
  skippedNotAllowed: number;
  skippedNothingLeft: number;
  skippedAlreadyDone: number;
  totalDays: number;
};

export type ExpiryRunSummary = {
  companyId: string;
  year: number;
  asOf: string;
  dryRun: boolean;
  scanned: number;
  expired: number;
  skippedNotDue: number;
  skippedAlreadyDone: number;
  totalDays: number;
};

const CARRY_FORWARD_SOURCE = 'LEAVE_CARRY_FORWARD';
const CARRY_EXPIRE_SOURCE = 'LEAVE_CARRY_FORWARD_EXPIRE';

/**
 * LeaveCarryForwardService
 * -----------------------------------------------------------------------------
 * งานปลายปีของระบบลา 2 อย่าง
 *
 * 1) สะสมวันลาข้ามปี (CARRY_FORWARD)
 *    วันลาคงเหลือที่ยังไม่ได้ใช้ของปีนี้ ยกไปเป็นยอดตั้งต้นของปีหน้า
 *    จำกัดด้วย carryForwardLimitDays ของนโยบาย
 *
 * 2) ตัดวันลาสะสมที่หมดอายุ (EXPIRE)
 *    วันที่ยกมาแล้วไม่ได้ใช้ภายในกำหนด จะถูกตัดทิ้ง
 *    กำหนดจาก quotaAccrualYears + carryForwardExpireMonth/Day
 *
 * ทั้งสองงานรันซ้ำได้โดยไม่ทำให้ยอดบวมหรือติดลบซ้ำ
 * เพราะเช็ค LeaveBalanceLedger ก่อนเขียนทุกครั้ง
 */
@Injectable()
export class LeaveCarryForwardService {
  private readonly logger = new Logger(LeaveCarryForwardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LeaveBalanceLedgerService,
    private readonly policyResolver: LeavePolicyResolverService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* pure math — แยกไว้ให้เทสต์ได้โดยไม่ต้องแตะฐานข้อมูล                  */
  /* ------------------------------------------------------------------ */

  /** วันลาคงเหลือที่ยังใช้ได้จริง (กันยอดติดลบไม่ให้ถูกยกไปปีหน้า) */
  remainingDays(balance: CarryForwardBalanceInput) {
    const remaining =
      Number(balance.entitlementDays) +
      Number(balance.carriedForwardDays) +
      Number(balance.adjustedDays) -
      Number(balance.usedDays) -
      Number(balance.pendingDays);

    return Number.isFinite(remaining) ? remaining : 0;
  }

  /**
   * จำนวนวันที่ยกไปปีหน้าได้
   * - นโยบายปิดการสะสม -> 0
   * - carryForwardLimitDays = 0 -> ไม่จำกัด (ยกไปเท่าที่เหลือ)
   * - ยอดคงเหลือติดลบ -> 0 (ไม่ยกหนี้ข้ามปี)
   */
  resolveCarryForwardDays(
    balance: CarryForwardBalanceInput,
    policy: CarryForwardPolicyInput,
  ) {
    if (!policy.allowCarryForward) return 0;

    const remaining = Math.max(this.remainingDays(balance), 0);
    if (remaining <= 0) return 0;

    const limit = Number(policy.carryForwardLimitDays ?? 0);
    const capped = limit > 0 ? Math.min(remaining, limit) : remaining;

    return this.roundHalf(capped);
  }

  /**
   * วันที่วันลาสะสมของปีนั้นหมดอายุ
   *
   * quotaAccrualYears = จำนวนปีที่วันสะสมยังใช้ได้ (1 = ใช้ได้ถึงสิ้นปีนั้น)
   * ถ้ากำหนดวัน/เดือนหมดอายุไว้ จะใช้วันนั้นแทนสิ้นปี
   */
  resolveCarryForwardExpiryDate(
    balanceYear: number,
    policy: CarryForwardPolicyInput,
    quotaAccrualYears = 1,
  ) {
    const years = Math.max(Math.floor(Number(quotaAccrualYears) || 1), 1);
    const expiryYear = balanceYear + years - 1;

    const month = Number(policy.carryForwardExpireMonth ?? 0);
    const day = Number(policy.carryForwardExpireDay ?? 0);

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(expiryYear, month - 1, day, 23, 59, 59));
    }

    return new Date(Date.UTC(expiryYear, 11, 31, 23, 59, 59));
  }

  /** วันสะสมที่ยังไม่ได้ใช้และต้องถูกตัดทิ้ง */
  resolveExpiringDays(balance: CarryForwardBalanceInput) {
    const carried = Math.max(Number(balance.carriedForwardDays ?? 0), 0);
    if (carried <= 0) return 0;

    // ตัดได้ไม่เกินส่วนที่ยังเหลืออยู่จริง ถ้าใช้ไปแล้วก็ไม่ต้องตัดซ้ำ
    const remaining = Math.max(this.remainingDays(balance), 0);

    return this.roundHalf(Math.min(carried, remaining));
  }

  private roundHalf(value: number) {
    return Math.round(value * 2) / 2;
  }

  /* ------------------------------------------------------------------ */
  /* carry forward                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * ยกวันลาคงเหลือของ fromYear ไปเป็นยอดตั้งต้นของ fromYear + 1
   */
  async runCarryForward(params: {
    companyId: string;
    fromYear: number;
    employeeId?: string | null;
    dryRun?: boolean;
    actorId?: string | null;
  }): Promise<CarryForwardRunSummary> {
    const toYear = params.fromYear + 1;
    const dryRun = params.dryRun === true;

    const summary: CarryForwardRunSummary = {
      companyId: params.companyId,
      fromYear: params.fromYear,
      toYear,
      dryRun,
      scanned: 0,
      carried: 0,
      skippedNoPolicy: 0,
      skippedNotAllowed: 0,
      skippedNothingLeft: 0,
      skippedAlreadyDone: 0,
      totalDays: 0,
    };

    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        year: params.fromYear,
        ...(params.employeeId ? { employeeId: params.employeeId } : {}),
        employee: {
          companyId: params.companyId,
          deletedAt: null,
          status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] },
        },
        leaveType: { deletedAt: null },
      },
      include: {
        employee: {
          select: {
            id: true,
            companyId: true,
            branchId: true,
            employeeTypeId: true,
          },
        },
      },
    });

    for (const balance of balances) {
      summary.scanned += 1;

      const policy = await this.policyResolver.resolvePolicy(this.prisma, {
        companyId: balance.employee.companyId,
        branchId: balance.employee.branchId,
        employeeTypeId: balance.employee.employeeTypeId,
        leaveTypeId: balance.leaveTypeId,
      });

      if (!policy) {
        summary.skippedNoPolicy += 1;
        continue;
      }

      if (!policy.allowCarryForward) {
        summary.skippedNotAllowed += 1;
        continue;
      }

      const carryDays = this.resolveCarryForwardDays(
        this.toBalanceInput(balance),
        {
          allowCarryForward: policy.allowCarryForward,
          carryForwardLimitDays: Number(policy.carryForwardLimitDays ?? 0),
        },
      );

      if (carryDays <= 0) {
        summary.skippedNothingLeft += 1;
        continue;
      }

      const alreadyDone = await this.hasLedgerEntry({
        employeeId: balance.employeeId,
        leaveTypeId: balance.leaveTypeId,
        quotaYear: toYear,
        action: 'CARRY_FORWARD',
        sourceId: this.carryForwardSourceId(params.fromYear),
      });

      if (alreadyDone) {
        summary.skippedAlreadyDone += 1;
        continue;
      }

      summary.carried += 1;
      summary.totalDays += carryDays;

      if (dryRun) continue;

      await this.applyCarryForward({
        companyId: balance.employee.companyId,
        employeeId: balance.employeeId,
        leaveTypeId: balance.leaveTypeId,
        fromYear: params.fromYear,
        toYear,
        carryDays,
        actorId: params.actorId ?? null,
      });
    }

    this.logger.log(
      `carry-forward ${params.fromYear} -> ${toYear} company=${params.companyId} carried=${summary.carried}/${summary.scanned} days=${summary.totalDays}${dryRun ? ' (dry run)' : ''}`,
    );

    return summary;
  }

  private async applyCarryForward(params: {
    companyId: string;
    employeeId: string;
    leaveTypeId: string;
    fromYear: number;
    toYear: number;
    carryDays: number;
    actorId: string | null;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: params.employeeId,
            leaveTypeId: params.leaveTypeId,
            year: params.toYear,
          },
        },
      });

      const before = existing
        ? this.toBalanceInput(existing)
        : {
            entitlementDays: 0,
            carriedForwardDays: 0,
            adjustedDays: 0,
            usedDays: 0,
            pendingDays: 0,
          };

      const target = existing
        ? await tx.leaveBalance.update({
            where: { id: existing.id },
            data: { carriedForwardDays: params.carryDays },
          })
        : await tx.leaveBalance.create({
            data: {
              employeeId: params.employeeId,
              leaveTypeId: params.leaveTypeId,
              year: params.toYear,
              entitlementDays: 0,
              carriedForwardDays: params.carryDays,
              adjustedDays: 0,
              usedDays: 0,
              pendingDays: 0,
              note: `ยกวันลาคงเหลือจากปี ${params.fromYear}`,
            },
          });

      const after = this.toBalanceInput(target);

      await this.ledger.createMovement(tx, {
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveBalanceId: target.id,
        action: 'CARRY_FORWARD',
        sourceType: CARRY_FORWARD_SOURCE,
        sourceId: this.carryForwardSourceId(params.fromYear),
        quotaYear: params.toYear,
        changeDays: params.carryDays,
        before: this.toLedgerSnapshot(before),
        after: this.toLedgerSnapshot(after),
        reason: `สะสมวันลาคงเหลือจากปี ${params.fromYear} จำนวน ${params.carryDays} วัน`,
        createdById: params.actorId,
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* expiry                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * ตัดวันลาสะสมที่หมดอายุแล้วของปีที่ระบุ
   */
  async runExpiry(params: {
    companyId: string;
    year: number;
    asOf?: Date;
    employeeId?: string | null;
    dryRun?: boolean;
    actorId?: string | null;
  }): Promise<ExpiryRunSummary> {
    const asOf = params.asOf ?? new Date();
    const dryRun = params.dryRun === true;

    const summary: ExpiryRunSummary = {
      companyId: params.companyId,
      year: params.year,
      asOf: asOf.toISOString().slice(0, 10),
      dryRun,
      scanned: 0,
      expired: 0,
      skippedNotDue: 0,
      skippedAlreadyDone: 0,
      totalDays: 0,
    };

    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        year: params.year,
        carriedForwardDays: { gt: 0 },
        ...(params.employeeId ? { employeeId: params.employeeId } : {}),
        employee: {
          companyId: params.companyId,
          deletedAt: null,
        },
        leaveType: { deletedAt: null },
      },
      include: {
        employee: {
          select: {
            id: true,
            companyId: true,
            branchId: true,
            employeeTypeId: true,
          },
        },
        leaveType: { select: { quotaAccrualYears: true } },
      },
    });

    for (const balance of balances) {
      summary.scanned += 1;

      const policy = await this.policyResolver.resolvePolicy(this.prisma, {
        companyId: balance.employee.companyId,
        branchId: balance.employee.branchId,
        employeeTypeId: balance.employee.employeeTypeId,
        leaveTypeId: balance.leaveTypeId,
      });

      const expiryDate = this.resolveCarryForwardExpiryDate(
        params.year,
        {
          allowCarryForward: policy?.allowCarryForward ?? false,
          carryForwardLimitDays: Number(policy?.carryForwardLimitDays ?? 0),
          carryForwardExpireMonth: policy?.carryForwardExpireMonth ?? null,
          carryForwardExpireDay: policy?.carryForwardExpireDay ?? null,
        },
        balance.leaveType.quotaAccrualYears,
      );

      if (asOf < expiryDate) {
        summary.skippedNotDue += 1;
        continue;
      }

      const expiringDays = this.resolveExpiringDays(
        this.toBalanceInput(balance),
      );

      if (expiringDays <= 0) {
        summary.skippedNotDue += 1;
        continue;
      }

      const alreadyDone = await this.hasLedgerEntry({
        employeeId: balance.employeeId,
        leaveTypeId: balance.leaveTypeId,
        quotaYear: params.year,
        action: 'EXPIRE',
        sourceId: this.expirySourceId(params.year),
      });

      if (alreadyDone) {
        summary.skippedAlreadyDone += 1;
        continue;
      }

      summary.expired += 1;
      summary.totalDays += expiringDays;

      if (dryRun) continue;

      await this.applyExpiry({
        companyId: balance.employee.companyId,
        balanceId: balance.id,
        employeeId: balance.employeeId,
        leaveTypeId: balance.leaveTypeId,
        year: params.year,
        expiringDays,
        before: this.toBalanceInput(balance),
        actorId: params.actorId ?? null,
      });
    }

    this.logger.log(
      `carry-forward expiry year=${params.year} company=${params.companyId} expired=${summary.expired}/${summary.scanned} days=${summary.totalDays}${dryRun ? ' (dry run)' : ''}`,
    );

    return summary;
  }

  private async applyExpiry(params: {
    companyId: string;
    balanceId: string;
    employeeId: string;
    leaveTypeId: string;
    year: number;
    expiringDays: number;
    before: CarryForwardBalanceInput;
    actorId: string | null;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const nextCarried = Math.max(
        params.before.carriedForwardDays - params.expiringDays,
        0,
      );

      const updated = await tx.leaveBalance.update({
        where: { id: params.balanceId },
        data: { carriedForwardDays: nextCarried },
      });

      await this.ledger.createMovement(tx, {
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveBalanceId: params.balanceId,
        action: 'EXPIRE',
        sourceType: CARRY_EXPIRE_SOURCE,
        sourceId: this.expirySourceId(params.year),
        quotaYear: params.year,
        changeDays: -params.expiringDays,
        before: this.toLedgerSnapshot(params.before),
        after: this.toLedgerSnapshot(this.toBalanceInput(updated)),
        reason: `ตัดวันลาสะสมที่หมดอายุของปี ${params.year} จำนวน ${params.expiringDays} วัน`,
        createdById: params.actorId,
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  /** กันรันซ้ำ — ถ้าเคยบันทึกลง ledger ด้วย source เดียวกันแล้วให้ข้าม */
  private async hasLedgerEntry(params: {
    employeeId: string;
    leaveTypeId: string;
    quotaYear: number;
    action: 'CARRY_FORWARD' | 'EXPIRE';
    sourceId: string;
  }) {
    const found = await this.prisma.leaveBalanceLedger.findFirst({
      where: {
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        quotaYear: params.quotaYear,
        action: params.action,
        sourceId: params.sourceId,
      },
      select: { id: true },
    });

    return Boolean(found);
  }

  private carryForwardSourceId(fromYear: number) {
    return `carry-forward:${fromYear}`;
  }

  private expirySourceId(year: number) {
    return `carry-expire:${year}`;
  }

  private toBalanceInput(balance: {
    entitlementDays: Prisma.Decimal | number;
    carriedForwardDays: Prisma.Decimal | number;
    adjustedDays: Prisma.Decimal | number;
    usedDays: Prisma.Decimal | number;
    pendingDays: Prisma.Decimal | number;
  }): CarryForwardBalanceInput {
    return {
      entitlementDays: Number(balance.entitlementDays),
      carriedForwardDays: Number(balance.carriedForwardDays),
      adjustedDays: Number(balance.adjustedDays),
      usedDays: Number(balance.usedDays),
      pendingDays: Number(balance.pendingDays),
    };
  }

  private toLedgerSnapshot(balance: CarryForwardBalanceInput) {
    return {
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
      availableDays: this.remainingDays(balance),
    };
  }
}
