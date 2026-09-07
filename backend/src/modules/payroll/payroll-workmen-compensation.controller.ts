import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PayrollWorkmenCompensationService } from './services/payroll-workmen-compensation.service';
import { generateWorkmenFormPdf } from './payroll-workmen-form-pdf.util';
import { generateWorkmenFormXlsx } from './payroll-workmen-form-xlsx.util';
import { generateWorkmenAnnualPdf } from './payroll-workmen-annual-pdf.util';
import { generateWorkmenAnnualXlsx } from './payroll-workmen-annual-xlsx.util';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

/**
 * แบบคำนวณค่าจ้าง กท.20 ของกองทุนเงินทดแทน
 * -----------------------------------------------------------------------------
 * แยกจาก payroll-filing-report.controller เพราะคนละแกนกันโดยสิ้นเชิง
 *
 *   ไฟล์นำส่งอื่น   ผูกกับรอบเงินเดือนหนึ่งรอบ  /payroll/runs/:runId/filings/...
 *   กท.20          ผูกกับบริษัทและปีทั้งปี      /payroll/workmen-compensation/:year
 *
 * ยัดเข้า controller เดิมจะต้องมี runId ที่ไม่มีความหมายกับรายงานนี้
 */
@Controller('payroll/workmen-compensation')
export class PayrollWorkmenCompensationController {
  constructor(private readonly service: PayrollWorkmenCompensationService) {}

  /** ข้อมูลดิบสำหรับแสดงบนหน้าจอและตรวจก่อนออกไฟล์ */
  @Get(':year')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'WorkmenCompensationReport',
    description: 'ดูแบบคำนวณค่าจ้างกองทุนเงินทดแทน (กท.20)',
  })
  getReport(
    @Param('year', ParseIntPipe) year: number,
    @Query('companyId') companyId: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.getReport(companyId, year, currentUser.scope);
  }

  @Get(':year/pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'WorkmenCompensationReport',
    description: 'ดาวน์โหลดแบบคำนวณค่าจ้างกองทุนเงินทดแทน (กท.20) PDF',
  })
  async exportPdf(
    @Param('year', ParseIntPipe) year: number,
    @Query('companyId') companyId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const report = await this.service.getReport(
      companyId,
      year,
      currentUser.scope,
    );

    return this.sendBinary(response, await generateWorkmenFormPdf(report));
  }

  @Get(':year/xlsx')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'WorkmenCompensationReport',
    description: 'ดาวน์โหลดแบบคำนวณค่าจ้างกองทุนเงินทดแทน (กท.20) Excel',
  })
  async exportXlsx(
    @Param('year', ParseIntPipe) year: number,
    @Query('companyId') companyId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const report = await this.service.getReport(
      companyId,
      year,
      currentUser.scope,
    );

    return this.sendBinary(response, await generateWorkmenFormXlsx(report));
  }

  /*
   * แบบ กท.20ก — รายชื่อลูกจ้างรายคนที่แนบไปกับ กท.20
   * ใช้รายงานชุดเดียวกันกับ กท.20 ทั้งหมด ต่างกันแค่มุมที่หยิบไปวาง
   * ยอดรวมของสองใบจึงตรงกันเสมอโดยไม่ต้องคิดเลขซ้ำ
   */
  @Get(':year/annual/pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'WorkmenCompensationReport',
    description: 'ดาวน์โหลดรายงานกองทุนเงินทดแทนประจำปี (กท.20ก) PDF',
  })
  async exportAnnualPdf(
    @Param('year', ParseIntPipe) year: number,
    @Query('companyId') companyId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const report = await this.service.getReport(
      companyId,
      year,
      currentUser.scope,
    );

    return this.sendBinary(response, await generateWorkmenAnnualPdf(report));
  }

  @Get(':year/annual/xlsx')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'WorkmenCompensationReport',
    description: 'ดาวน์โหลดรายงานกองทุนเงินทดแทนประจำปี (กท.20ก) Excel',
  })
  async exportAnnualXlsx(
    @Param('year', ParseIntPipe) year: number,
    @Query('companyId') companyId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const report = await this.service.getReport(
      companyId,
      year,
      currentUser.scope,
    );

    return this.sendBinary(response, await generateWorkmenAnnualXlsx(report));
  }

  /** PDF และ XLSX เป็นไบนารี ต้องส่ง Content-Length ให้เบราว์เซอร์รู้ขนาดจริง */
  private sendBinary(
    response: Response,
    file: { buffer: Buffer; fileName: string; mimeType: string },
  ) {
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.setHeader('Content-Length', String(file.buffer.length));

    return response.end(file.buffer);
  }
}
