import { Injectable } from '@nestjs/common';
import { LeaveBalanceLedgerAction, Prisma } from '../../generated/prisma/client';

type LeaveBalanceSnapshot = {
  usedDays: number;
  pendingDays: number;
  availableDays: number;
};

@Injectable()
export class LeaveBalanceLedgerService {
  async createMovement(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      employeeId: string;
      leaveTypeId: string;
      leaveBalanceId: string;
      action: LeaveBalanceLedgerAction;
      sourceType: string;
      sourceId: string;
      quotaYear: number;
      changeDays: number;
      before: LeaveBalanceSnapshot;
      after: LeaveBalanceSnapshot;
      reason: string;
      createdById?: string | null;
    },
  ) {
    return tx.leaveBalanceLedger.create({
      data: {
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveBalanceId: params.leaveBalanceId,
        action: params.action,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        quotaYear: params.quotaYear,
        changeDays: params.changeDays,
        balanceBefore: params.before.availableDays,
        balanceAfter: params.after.availableDays,
        pendingBefore: params.before.pendingDays,
        pendingAfter: params.after.pendingDays,
        usedBefore: params.before.usedDays,
        usedAfter: params.after.usedDays,
        reason: params.reason,
        createdById: params.createdById ?? null,
      },
    });
  }
}
