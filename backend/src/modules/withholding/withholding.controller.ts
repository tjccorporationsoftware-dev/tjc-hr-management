import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateWithholdingPayeeDto,
  CreateWithholdingPaymentDto,
  UpdateWithholdingPayeeDto,
  UpdateWithholdingPaymentDto,
  WithholdingFilingQueryDto,
  WithholdingPaymentQueryDto,
} from './dto/withholding.dto';
import { WithholdingFilingService } from './withholding-filing.service';
import { WithholdingService } from './withholding.service';

/**
 * ภาษีหัก ณ ที่จ่ายของผู้รับเงินที่ไม่ใช่ลูกจ้าง (ภ.ง.ด.3)
 * -----------------------------------------------------------------------------
 * ใช้สิทธิ์ชุดเดียวกับงานเงินเดือน (PAYROLL_READ / PAYROLL_MANAGE) เพราะเป็นงาน
 * ของทีมบัญชี-เงินเดือนทีมเดียวกัน และเลี่ยงการเพิ่มสิทธิ์ใหม่ซึ่งต้องไปไล่ผูก
 * กับทุกบทบาทใหม่หมด
 */
@Controller('withholding')
export class WithholdingController {
  constructor(
    private readonly service: WithholdingService,
    private readonly filing: WithholdingFilingService,
  ) {}

  /** รายการประเภทเงินได้พร้อมอัตราตั้งต้น ให้หน้าจอทำตัวเลือก */
  @Get('income-types')
  @Auth('PAYROLL_READ')
  listIncomeTypes() {
    return { data: this.service.listIncomeTypes() };
  }

  /* ---------------- ผู้รับเงิน ---------------- */

  @Get('payees')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'WithholdingPayee',
    description: 'ดูรายชื่อผู้รับเงินที่ไม่ใช่ลูกจ้าง',
  })
  listPayees(
    @Query('companyId') companyId: string,
    @Query('search') search: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listPayees({ companyId, search }, user.scope);
  }

  @Post('payees')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'WithholdingPayee',
    description: 'เพิ่มผู้รับเงินที่ไม่ใช่ลูกจ้าง',
  })
  createPayee(
    @Body() dto: CreateWithholdingPayeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createPayee(dto, user.scope);
  }

  @Patch('payees/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'WithholdingPayee',
    description: 'แก้ไขผู้รับเงินที่ไม่ใช่ลูกจ้าง',
  })
  updatePayee(
    @Param('id') id: string,
    @Body() dto: UpdateWithholdingPayeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updatePayee(id, dto, user.scope);
  }

  @Delete('payees/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'WithholdingPayee',
    description: 'ลบผู้รับเงินที่ไม่ใช่ลูกจ้าง',
  })
  removePayee(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removePayee(id, user.scope);
  }

  /* ---------------- รายการจ่าย ---------------- */

  @Get('payments')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'WithholdingPayment',
    description: 'ดูรายการจ่ายเงินที่หักภาษี ณ ที่จ่าย',
  })
  listPayments(
    @Query() query: WithholdingPaymentQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listPayments(query, user.scope);
  }

  @Post('payments')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'WithholdingPayment',
    description: 'บันทึกรายการจ่ายเงินที่หักภาษี ณ ที่จ่าย',
  })
  createPayment(
    @Body() dto: CreateWithholdingPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createPayment(dto, user.scope);
  }

  @Patch('payments/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'WithholdingPayment',
    description: 'แก้ไขรายการจ่ายเงินที่หักภาษี ณ ที่จ่าย',
  })
  updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdateWithholdingPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updatePayment(id, dto, user.scope);
  }

  @Delete('payments/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'WithholdingPayment',
    description: 'ลบรายการจ่ายเงินที่หักภาษี ณ ที่จ่าย',
  })
  removePayment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removePayment(id, user.scope);
  }

  /* ---------------- แบบยื่น ภ.ง.ด.3 ---------------- */

  @Get('pnd3')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PND3Report',
    description: 'ดูแบบยื่น ภ.ง.ด.3',
  })
  getPnd3(
    @Query() query: WithholdingFilingQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filing.getReport(query, user.scope);
  }

  @Get('pnd3/form-pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND3Report',
    description: 'ดาวน์โหลดแบบพิมพ์ ภ.ง.ด.3 (PDF)',
  })
  async exportPnd3Pdf(
    @Query() query: WithholdingFilingQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.filing.buildPdf(query, user.scope);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.setHeader('Content-Length', String(file.buffer.length));

    return response.end(file.buffer);
  }

  @Get('pnd3/table-csv')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND3Report',
    description: 'ดาวน์โหลดตาราง ภ.ง.ด.3 (CSV)',
  })
  async exportPnd3Csv(
    @Query() query: WithholdingFilingQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.filing.buildCsv(query, user.scope);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );

    return response.end(file.csv);
  }
}
