import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { PayrollExtraLineSummary } from '../types/payroll-extra-lines.types';
import { PayrollSourcePreviewService } from './payroll-source-preview.service';

/**
 * PayrollAdjustmentImportService
 * ------------------------------
 * ดึงรายการ PayrollAdjustment ที่พร้อมเข้า Payroll Run
 * โดย delegate ไปใช้ PayrollSourcePreviewService เพื่อให้ Preview / Dry Run / Calculate
 * ใช้กฎ match เดียวกันทุกจุด
 */
@Injectable()
export class PayrollAdjustmentImportService {
  constructor(
    private readonly payrollSourcePreviewService: PayrollSourcePreviewService,
  ) {}

  async collectEmployeeAdjustmentLines(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      employeeId: string;
      periodId: string;
      payrollRunId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ): Promise<PayrollExtraLineSummary> {
    return this.payrollSourcePreviewService.collectEmployeeAdjustmentLines(tx, params);
  }

  async markAdjustmentsImported(
    tx: Prisma.TransactionClient,
    params: {
      adjustmentIds: string[];
      periodId: string;
      payrollRunId: string;
      userId?: string;
    },
  ) {
    const adjustmentIds = Array.from(new Set(params.adjustmentIds.filter(Boolean)));
    if (adjustmentIds.length === 0) return;

    await (tx as any).payrollAdjustment.updateMany({
      where: {
        id: { in: adjustmentIds },
      },
      data: {
        status: 'IMPORTED',
        periodId: params.periodId,
        payrollRunId: params.payrollRunId,
        importedAt: new Date(),
        importedById: params.userId ?? null,
      },
    });
  }
}
