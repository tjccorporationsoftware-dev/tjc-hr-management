import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

import { EssSalarySlipService } from './ess-salary-slip.service';
import { EssSalarySlipQueryDto } from './dto/ess-salary-slip-query.dto';
import { toPayslipPaperLayout } from '../payroll/payroll-payslip-pdf.util';

type CurrentUserPayload = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

@Controller('ess/salary-slips')
@Auth()
@RequirePermissions('ESS_ACCESS', 'PAYROLL_SLIP_VIEW')
export class EssSalarySlipController {
  constructor(private readonly salarySlipService: EssSalarySlipService) {}

  @Get()
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSSalarySlip',
    description: 'พนักงานดูรายการสลิปเงินเดือนของตนเองจาก Payroll',
  })
  findMySalarySlips(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: EssSalarySlipQueryDto,
  ) {
    return this.salarySlipService.findMySalarySlips(currentUser, query);
  }

  @Get('tax-certificate')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSWithholdingCertificate',
    description: 'พนักงานดูร่างหนังสือรับรองหักภาษี 50 ทวิ ของตนเอง',
  })
  getMyTaxCertificate(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query('year') year?: string,
  ) {
    return this.salarySlipService.getMyWithholdingCertificate(
      currentUser,
      year ? Number(year) : undefined,
    );
  }

  @Get(':itemId/pdf')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'ess:salary-slip:download',
    limit: 30,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: 'ดาวน์โหลดสลิปเงินเดือนบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSSalarySlip',
    description: 'พนักงานดาวน์โหลด PDF สลิปเงินเดือนของตนเอง',
  })
  async downloadMySalarySlipPdf(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('itemId') itemId: string,
    @Res() res: Response,
    @Query('layout') layout?: string,
  ) {
    const pdf = await this.salarySlipService.generateMySalarySlipPdf(
      currentUser,
      itemId,
      toPayslipPaperLayout(layout),
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdf.fileName}"`,
    );
    res.setHeader('Content-Length', String(pdf.buffer.length));

    return res.end(pdf.buffer);
  }

  @Get(':itemId')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ESSSalarySlip',
    description: 'พนักงานดูรายละเอียดสลิปเงินเดือนของตนเองจาก Payroll',
  })
  getMySalarySlip(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param('itemId') itemId: string,
  ) {
    return this.salarySlipService.getMySalarySlip(currentUser, itemId);
  }
}
