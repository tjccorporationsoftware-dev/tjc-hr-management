import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import iconv from 'iconv-lite';
import {
  SUPPORTED_BANK_FORMATS,
  type BankTransferFormat,
} from './utils/payroll-bank-format.util';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PayrollFilingReportService } from './services/payroll-filing-report.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

/**
 * เข้ารหัสของไฟล์นำส่งราชการแบบ fixed-width
 * TIS-620 คือมาตรฐานที่ระบบราชการไทยใช้ และเป็นแบบไบต์เดียวจึงนับตำแหน่งตรงกับผัง
 */
const THAI_FILING_ENCODING = 'tis620';

/**
 * รายงานสำหรับนำส่งหน่วยงาน อ้างอิงจากรอบการจ่ายเงินเดือนที่คำนวณแล้ว
 *
 *   สปส.1-10   /payroll/runs/:runId/filings/social-security
 *   ไฟล์โอน     /payroll/runs/:runId/filings/bank-transfer
 *   กยศ.        /payroll/runs/:runId/filings/student-loan
 *
 * ทุกตัวมีทั้งแบบดูบนจอ และเติม /export เพื่อดาวน์โหลด CSV
 * เฉพาะ สปส.1-10 มีเพิ่ม /form-pdf (แบบพิมพ์สำหรับยื่น) /form-xlsx (ไว้ทำงานต่อ)
 * และ /e-filing (ไฟล์อัปโหลดเข้าระบบ e-Service)
 */
@Controller('payroll/runs/:runId/filings')
export class PayrollFilingReportController {
  constructor(private readonly service: PayrollFilingReportService) {}

  /* ---------------- สปส.1-10 ---------------- */

  @Get('social-security')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollFilingReport',
    description: 'ดูรายงานเงินสมทบประกันสังคม (สปส.1-10)',
  })
  socialSecurity(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.getSocialSecurityReport(runId, currentUser.scope);
  }

  @Get('social-security/export')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollFilingReport',
    description: 'ดาวน์โหลดไฟล์เงินสมทบประกันสังคม (สปส.1-10)',
  })
  async exportSocialSecurity(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file = await this.service.buildSocialSecurityCsv(
      runId,
      currentUser.scope,
    );

    return this.sendCsv(response, file);
  }

  @Get('social-security/e-filing')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollFilingReport',
    description: 'ดาวน์โหลดไฟล์นำส่งประกันสังคมสำหรับระบบ e-Service',
  })
  async exportSocialSecurityFiling(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file = await this.service.buildSocialSecurityFilingFile(
      runId,
      currentUser.scope,
    );

    return this.sendThaiFixedWidth(response, file.content, file.fileName);
  }

  @Get('social-security/form-pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollFilingReport',
    description: 'ดาวน์โหลดแบบ สปส.1-10 (PDF)',
  })
  async exportSocialSecurityFormPdf(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file = await this.service.buildSocialSecurityFormPdf(
      runId,
      currentUser.scope,
    );

    return this.sendBinary(response, file);
  }

  @Get('social-security/form-xlsx')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollFilingReport',
    description: 'ดาวน์โหลดแบบ สปส.1-10 (Excel)',
  })
  async exportSocialSecurityFormXlsx(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file = await this.service.buildSocialSecurityFormXlsx(
      runId,
      currentUser.scope,
    );

    return this.sendBinary(response, file);
  }

  /* ---------------- ไฟล์โอนธนาคาร ---------------- */

  @Get('bank-transfer')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollFilingReport',
    description: 'ดูรายการโอนเงินเดือนเข้าบัญชีธนาคาร',
  })
  bankTransfer(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.getBankTransferReport(runId, currentUser.scope);
  }

  @Get('bank-transfer/export')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollFilingReport',
    description: 'ดาวน์โหลดไฟล์โอนเงินเดือนเข้าธนาคาร',
  })
  async exportBankTransfer(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file = await this.service.buildBankTransferCsv(
      runId,
      currentUser.scope,
    );

    return this.sendCsv(response, file);
  }

  /**
   * ไฟล์นำเข้าระบบธนาคาร
   * ?format=KTB_IPAY สำหรับกรุงไทย / ไม่ระบุ = CSV รูปแบบกลาง
   */
  @Get('bank-transfer/file')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollFilingReport',
    description: 'ดาวน์โหลดไฟล์นำเข้าระบบจ่ายเงินเดือนของธนาคาร',
  })
  async exportBankTransferFile(
    @Param('runId') runId: string,
    @Query('format') format: string | undefined,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const normalized = String(format ?? '').toUpperCase();
    const resolvedFormat: BankTransferFormat = (
      SUPPORTED_BANK_FORMATS as readonly string[]
    ).includes(normalized)
      ? (normalized as BankTransferFormat)
      : 'GENERIC_CSV';

    const file = await this.service.buildBankTransferFile(
      runId,
      currentUser.scope,
      resolvedFormat,
    );

    return this.sendText(response, file.content, file.fileName);
  }

  @Get('bank-transfer/pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollFilingReport',
    description: 'ดาวน์โหลดหนังสือแจ้งการโอนเงินเข้าบัญชีเงินเดือน (PDF)',
  })
  async exportBankTransferPdf(
    @Param('runId') runId: string,
    @Query('format') format: string | undefined,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const normalized = String(format ?? '').toUpperCase();
    const resolvedFormat: BankTransferFormat = (
      SUPPORTED_BANK_FORMATS as readonly string[]
    ).includes(normalized)
      ? (normalized as BankTransferFormat)
      : 'GENERIC_CSV';

    const file = await this.service.buildBankTransferPdf(
      runId,
      currentUser.scope,
      resolvedFormat,
    );

    return this.sendBinary(response, file);
  }

  /* ---------------- กยศ. ---------------- */

  @Get('student-loan')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollFilingReport',
    description: 'ดูรายงานนำส่ง กยศ.',
  })
  studentLoan(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.getStudentLoanReport(runId, currentUser.scope);
  }

  @Get('student-loan/export')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollFilingReport',
    description: 'ดาวน์โหลดไฟล์นำส่ง กยศ.',
  })
  async exportStudentLoan(
    @Param('runId') runId: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file = await this.service.buildStudentLoanCsv(
      runId,
      currentUser.scope,
    );

    return this.sendCsv(response, file);
  }

  private sendCsv(response: Response, file: { csv: string; fileName: string }) {
    return this.sendText(response, file.csv, file.fileName, 'text/csv');
  }

  /**
   * ไฟล์นำส่งเป็นข้อความล้วน ส่งเป็น UTF-8 เสมอ
   * ถ้าปลายทางต้องการ TIS-620 ให้แปลงตอนอัปโหลด ไม่ใช่ตอนสร้างไฟล์
   */
  private sendText(
    response: Response,
    content: string,
    fileName: string,
    contentType = 'text/plain',
  ) {
    response.setHeader('Content-Type', `${contentType}; charset=utf-8`);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );

    return response.end(content);
  }

  /**
   * ไฟล์ fixed-width ของราชการไทยต้องเป็น TIS-620 ไม่ใช่ UTF-8
   *
   * เหตุผลเป็นเรื่องการนับตำแหน่ง ไม่ใช่ความชอบ — ผังของ สปส. กำหนดความกว้าง
   * เป็น "ตัวอักษร" (บรรทัดละ 135) ซึ่งจะตรงกับจำนวนไบต์ก็ต่อเมื่อเข้ารหัสแบบ
   * ไบต์เดียว ใน TIS-620 อักขระไทย 1 ตัว = 1 ไบต์ ตรงกับที่โค้ดนับพอดี
   * แต่ UTF-8 ใช้ 3 ไบต์ต่ออักขระ ชื่อไทยหนึ่งชื่อจะดันตำแหน่งช่องหลังเพี้ยนหมด
   *
   * ถ้าภายหลังยืนยันได้ว่า สปส. รับ UTF-8 ให้เปลี่ยนที่ THAI_FILING_ENCODING
   */
  private sendThaiFixedWidth(
    response: Response,
    content: string,
    fileName: string,
  ) {
    const buffer = iconv.encode(content, THAI_FILING_ENCODING);

    response.setHeader(
      'Content-Type',
      `text/plain; charset=${THAI_FILING_ENCODING}`,
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    response.setHeader('Content-Length', String(buffer.length));

    return response.end(buffer);
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
