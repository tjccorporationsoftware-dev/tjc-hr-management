import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { PayrollExtraLineSummary } from '../types/payroll-extra-lines.types';
import { PayrollSourcePreviewService } from './payroll-source-preview.service';

/**
 * PayrollRecurringLinesService
 * ----------------------------
 * ดึงรายการค่าตอบแทนประจำของพนักงานจาก EmployeeCompensationItem
 * โดย delegate ไปใช้ PayrollSourcePreviewService เพื่อให้ Preview / Dry Run / Calculate
 * ใช้กฎ match เดียวกันทุกจุด
 */
@Injectable()
export class PayrollRecurringLinesService {
  constructor(
    private readonly payrollSourcePreviewService: PayrollSourcePreviewService,
  ) {}

  async collectEmployeeRecurringLines(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      employeeId: string;
      periodStartDate: Date;
      periodEndDate: Date;
    },
  ): Promise<PayrollExtraLineSummary> {
    return this.payrollSourcePreviewService.collectEmployeeRecurringLines(tx, params);
  }
}
