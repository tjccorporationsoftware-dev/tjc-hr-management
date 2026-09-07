import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditAction } from '../../generated/prisma/client';
import {
  CopyEmployeeTaxProfilesDto,
  CreateEmployeeTaxProfileDto,
  CreatePayrollTaxAllowanceTypeDto,
  CreatePayrollTaxBracketDto,
  CreatePayrollTaxYearDto,
  PayrollTaxListQueryDto,
  PayrollTaxPreviewDto,
  PayrollRunTaxPreviewDto,
  PayrollTaxReportQueryDto,
  PayrollTaxPnd1ReportQueryDto,
  PayrollTaxPnd1AReportQueryDto,
  PayrollTaxWithholdingCertificateQueryDto,
  UpdateEmployeeTaxAllowanceDto,
  UpdateEmployeeTaxProfileDto,
  UpdatePayrollTaxAllowanceTypeDto,
  UpdatePayrollTaxBracketDto,
  UpdatePayrollTaxYearDto,
  UpsertEmployeeTaxAllowanceDto,
  UpsertEmployeeTaxOpeningBalanceDto,
} from './dto/payroll-tax.dto';
import { PayrollTaxService } from './services/payroll-tax.service';
import { PayrollTaxCalculatorService } from './services/payroll-tax-calculator.service';
import { PayrollTaxReportService } from './services/payroll-tax-report.service';

/**
 * PayrollTaxController
 * --------------------
 * ระบบภาษีหัก ณ ที่จ่ายแบบเต็มรูปแบบ
 * - ตั้งค่าปีภาษี / ขั้นภาษี / ประเภทค่าลดหย่อน
 * - จัดการข้อมูลภาษีพนักงานและค่าลดหย่อน (บันทึกแล้วใช้คำนวณทันที ไม่มีสายอนุมัติ)
 * - ทดลองคำนวณ สร้างยอดภาษีใน Payroll Run และออกรายงานภาษี
 *
 * ทุก route ต้องส่ง user.scope ลงไปที่ service เสมอ
 * ข้อมูลภาษีเป็นข้อมูลรายบุคคลที่อ่อนไหวที่สุดชุดหนึ่ง (เลขผู้เสียภาษี ที่อยู่
 * เงินได้สะสม) และ companyId ที่รับจาก query เป็นแค่ "ตัวกรองที่ผู้ใช้ขอ"
 * ไม่ใช่สิทธิ์ — ถ้าไม่คุมด้วย scope บัญชีระดับบริษัทจะเปลี่ยน query string
 * ไปดึงแบบ ภ.ง.ด.1 / 1ก และ 50 ทวิ ของบริษัทอื่นได้ทั้งชุด
 */
@Controller('payroll/tax')
export class PayrollTaxController {
  constructor(
    private readonly payrollTaxService: PayrollTaxService,
    private readonly payrollTaxCalculatorService: PayrollTaxCalculatorService,
    private readonly payrollTaxReportService: PayrollTaxReportService,
  ) {}

  @Get('overview')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTax',
    description: 'View payroll tax overview',
  })
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.payrollTaxService.getOverview(companyId, user.scope);
  }

  @Get('profile-coverage')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeTaxProfile',
    description: 'View employee tax profile coverage',
  })
  getProfileCoverage(
    @Query() query: PayrollTaxListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.getProfileCoverage(query, user.scope);
  }

  @Post('calculate-preview')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxCalculation',
    description: 'Preview employee payroll tax calculation',
  })
  calculatePreview(
    @Body() dto: PayrollTaxPreviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxCalculatorService.calculateEmployeePreview(
      dto,
      user.scope,
    );
  }

  @Post('runs/:id/tax-preview')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxCalculation',
    description: 'Preview payroll run tax calculation',
  })
  calculateRunPreview(
    @Param('id') id: string,
    @Body() dto: PayrollRunTaxPreviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxCalculatorService.calculateRunPreview(
      id,
      dto,
      user.scope,
    );
  }

  @Get('reports/monthly')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxReport',
    description: 'View monthly payroll tax report',
  })
  getMonthlyTaxReport(
    @Query() query: PayrollTaxReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxReportService.getMonthlyReport(query, user.scope);
  }

  @Get('reports/annual')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxReport',
    description: 'View annual payroll tax report',
  })
  getAnnualTaxReport(
    @Query() query: PayrollTaxReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxReportService.getAnnualReport(query, user.scope);
  }

  @Get('reports/pnd1')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PND1Report',
    description: 'View PND1 monthly withholding tax report',
  })
  getPnd1Report(
    @Query() query: PayrollTaxPnd1ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxReportService.getPnd1Report(query, user.scope);
  }

  @Get('reports/pnd1a')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PND1AReport',
    description: 'View PND1A annual withholding tax report',
  })
  getPnd1AReport(
    @Query() query: PayrollTaxPnd1AReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxReportService.getPnd1AReport(query, user.scope);
  }

  @Get('reports/pnd1a/detail/:employeeId')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PND1AReport',
    description: 'View PND1A employee annual withholding tax detail',
  })
  getPnd1ADetail(
    @Param('employeeId') employeeId: string,
    @Query() query: PayrollTaxPnd1AReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxReportService.getPnd1ADetail(
      employeeId,
      query,
      user.scope,
    );
  }

  @Get('reports/employees/:employeeId/annual')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxReport',
    description: 'View employee annual payroll tax report',
  })
  getEmployeeAnnualTaxReport(
    @Param('employeeId') employeeId: string,
    @Query() query: PayrollTaxReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxReportService.getEmployeeAnnualReport(
      employeeId,
      query,
      user.scope,
    );
  }

  @Get('reports/withholding-certificate/:employeeId')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'WithholdingCertificate',
    description: 'View withholding tax certificate draft',
  })
  getWithholdingCertificateDraft(
    @Param('employeeId') employeeId: string,
    @Query() query: PayrollTaxWithholdingCertificateQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxReportService.getWithholdingCertificate(
      employeeId,
      query,
      user.scope,
    );
  }

  @Get('reports/monthly/export')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollTaxReport',
    description: 'Export monthly payroll tax report',
  })
  async exportMonthlyTaxReport(
    @Query() query: PayrollTaxReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildMonthlyCsv(
      query,
      user.scope,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return response.end(file.csv);
  }

  @Get('reports/annual/export')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PayrollTaxReport',
    description: 'Export annual payroll tax report',
  })
  async exportAnnualTaxReport(
    @Query() query: PayrollTaxReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildAnnualCsv(
      query,
      user.scope,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return response.end(file.csv);
  }

  @Get('reports/pnd1/export')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1Report',
    description: 'Export PND1 monthly withholding tax report',
  })
  async exportPnd1Report(
    @Query() query: PayrollTaxPnd1ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1Csv(
      query,
      user.scope,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return response.end(file.csv);
  }

  /* ---------------- ภ.ง.ด.1 รูปแบบสำหรับยื่นจริง ---------------- */

  /**
   * แบบพิมพ์ ภ.ง.ด.1 — หน้าปกและใบแนบ พิมพ์ยื่นที่สรรพากรพื้นที่ได้เลย
   * ต่างจาก /export ที่เป็น CSV ตารางดิบสำหรับเอาไปทำงานต่อ
   */
  @Get('reports/pnd1/form-pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1Report',
    description: 'ดาวน์โหลดแบบพิมพ์ ภ.ง.ด.1 (PDF)',
  })
  async exportPnd1FormPdf(
    @Query() query: PayrollTaxPnd1ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1FormPdf(
      query,
      user.scope,
    );

    return this.sendBinary(response, file);
  }

  @Get('reports/pnd1/form-xlsx')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1Report',
    description: 'ดาวน์โหลดตาราง ภ.ง.ด.1 (Excel)',
  })
  async exportPnd1FormXlsx(
    @Query() query: PayrollTaxPnd1ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1FormXlsx(
      query,
      user.scope,
    );

    return this.sendBinary(response, file);
  }

  /**
   * ไฟล์นำส่งระบบ e-Filing ของกรมสรรพากร
   *
   * เข้ารหัส UTF-8 ไม่ใช่ TIS-620 แบบไฟล์ประกันสังคม — ไฟล์ตัวอย่างของลูกค้า
   * เป็น UTF-8 ถ้าส่ง TIS-620 ชื่อภาษาไทยจะเพี้ยนทั้งไฟล์
   */
  @Get('reports/pnd1/e-filing')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1Report',
    description: 'ดาวน์โหลดไฟล์นำส่ง ภ.ง.ด.1 สำหรับระบบ e-Filing',
  })
  async exportPnd1Filing(
    @Query() query: PayrollTaxPnd1ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1FilingFile(
      query,
      user.scope,
    );

    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );

    return response.end(Buffer.from(file.content, 'utf8'));
  }

  @Get('reports/pnd1a/export')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1AReport',
    description: 'Export PND1A annual withholding tax report',
  })
  async exportPnd1AReport(
    @Query() query: PayrollTaxPnd1AReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1ACsv(
      query,
      user.scope,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return response.end(file.csv);
  }

  /**
   * ตาราง CSV ของแบบ ภ.ง.ด.1 / ภ.ง.ด.1ก
   *
   * ต่างจาก /export เดิมที่เป็นรายงานภายใน — ตัวนี้คอลัมน์เรียงตามช่องบนแบบพิมพ์
   * และสร้างจากข้อมูลชุดเดียวกับ PDF จึงเอาไปไล่เทียบทีละช่องก่อนยื่นได้
   */
  @Get('reports/pnd1/table-csv')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1Report',
    description: 'ดาวน์โหลดตาราง ภ.ง.ด.1 (CSV)',
  })
  async exportPnd1TableCsv(
    @Query() query: PayrollTaxPnd1ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1TableCsv(
      query,
      user.scope,
    );

    return this.sendCsvFile(response, file);
  }

  @Get('reports/pnd1a/table-csv')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1AReport',
    description: 'ดาวน์โหลดตาราง ภ.ง.ด.1ก (CSV)',
  })
  async exportPnd1aTableCsv(
    @Query() query: PayrollTaxPnd1AReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1aTableCsv(
      query,
      user.scope,
    );

    return this.sendCsvFile(response, file);
  }

  /* ---------------- ภ.ง.ด.1ก แบบพิมพ์สำหรับยื่นจริง ---------------- */

  /**
   * เอกสารสามใบของแบบยื่นประจำปี ใช้ข้อมูลชุดเดียวกันทั้งหมด
   *
   *   summary      ใบสรุป ภ.ง.ด.1ก (หน้าปก)
   *   attachment   ใบแนบ รายชื่อผู้มีเงินได้แผ่นละ 21 คน
   *   certificate  50 ทวิ หนึ่งหน้าต่อพนักงานหนึ่งคน
   *
   * issueDate = วันที่ออกเอกสารจากกล่อง "ระบุวันออกเอกสาร" ไม่ส่งมาก็เว้นช่องไว้
   */
  @Get('reports/pnd1a/summary-pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1AReport',
    description: 'ดาวน์โหลดใบสรุป ภ.ง.ด.1ก (PDF)',
  })
  async exportPnd1aSummaryPdf(
    @Query() query: PayrollTaxPnd1AReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1aSummaryPdf(
      query,
      user.scope,
      query.issueDate,
    );

    return this.sendBinary(response, file);
  }

  @Get('reports/pnd1a/attachment-pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'PND1AReport',
    description: 'ดาวน์โหลดใบแนบ ภ.ง.ด.1ก (PDF)',
  })
  async exportPnd1aAttachmentPdf(
    @Query() query: PayrollTaxPnd1AReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1aAttachmentPdf(
      query,
      user.scope,
      query.issueDate,
    );

    return this.sendBinary(response, file);
  }

  @Get('reports/pnd1a/certificate-pdf')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'WithholdingCertificate',
    description:
      'ดาวน์โหลดหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ทั้งบริษัท',
  })
  async exportPnd1aCertificatePdf(
    @Query() query: PayrollTaxPnd1AReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.payrollTaxReportService.buildPnd1aCertificatePdf(
      query,
      user.scope,
      query.issueDate,
    );

    return this.sendBinary(response, file);
  }

  @Get('reports/withholding-certificate/:employeeId/export')
  @Auth('REPORT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'WithholdingCertificate',
    description: 'Export withholding tax certificate draft',
  })
  async exportWithholdingCertificate(
    @Param('employeeId') employeeId: string,
    @Query() query: PayrollTaxWithholdingCertificateQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file =
      await this.payrollTaxReportService.buildWithholdingCertificateCsv(
        employeeId,
        query,
        user.scope,
      );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return response.end(file.csv);
  }

  @Get('years')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxYear',
    description: 'View payroll tax years',
  })
  findTaxYears(
    @Query() query: PayrollTaxListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.findTaxYears(query, user.scope);
  }

  @Get('years/:id')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxYear',
    description: 'View payroll tax year detail',
  })
  findTaxYearById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.findTaxYearById(id, user.scope);
  }

  @Post('years')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'PayrollTaxYear',
    description: 'Create payroll tax year',
  })
  createTaxYear(
    @Body() dto: CreatePayrollTaxYearDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.createTaxYear(dto, user.id, user.scope);
  }

  @Patch('years/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'PayrollTaxYear',
    description: 'Update payroll tax year',
  })
  updateTaxYear(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollTaxYearDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.updateTaxYear(id, dto, user.scope);
  }

  @Delete('years/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'PayrollTaxYear',
    description: 'Delete payroll tax year',
  })
  deleteTaxYear(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.deleteTaxYear(id, user.scope);
  }

  @Get('brackets')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxBracket',
    description: 'View payroll tax brackets',
  })
  findBrackets(
    @Query() query: PayrollTaxListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.findBrackets(query, user.scope);
  }

  @Post('brackets')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'PayrollTaxBracket',
    description: 'Create payroll tax bracket',
  })
  createBracket(
    @Body() dto: CreatePayrollTaxBracketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.createBracket(dto, user.scope);
  }

  @Patch('brackets/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'PayrollTaxBracket',
    description: 'Update payroll tax bracket',
  })
  updateBracket(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollTaxBracketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.updateBracket(id, dto, user.scope);
  }

  @Delete('brackets/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'PayrollTaxBracket',
    description: 'Delete payroll tax bracket',
  })
  deleteBracket(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.deleteBracket(id, user.scope);
  }

  @Get('allowance-types')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollTaxAllowanceType',
    description: 'View payroll tax allowance types',
  })
  findAllowanceTypes(
    @Query() query: PayrollTaxListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.findAllowanceTypes(query, user.scope);
  }

  @Post('allowance-types')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'PayrollTaxAllowanceType',
    description: 'Create payroll tax allowance type',
  })
  createAllowanceType(
    @Body() dto: CreatePayrollTaxAllowanceTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.createAllowanceType(dto, user.scope);
  }

  @Patch('allowance-types/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'PayrollTaxAllowanceType',
    description: 'Update payroll tax allowance type',
  })
  updateAllowanceType(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollTaxAllowanceTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.updateAllowanceType(id, dto, user.scope);
  }

  @Delete('allowance-types/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'PayrollTaxAllowanceType',
    description: 'Delete payroll tax allowance type',
  })
  deleteAllowanceType(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.deleteAllowanceType(id, user.scope);
  }

  /*
   * ยอดสะสมยกมาของปีภาษี — ใช้ตอนเริ่มใช้ระบบกลางปี
   *
   * ถ้าไม่บันทึกไว้ tax engine จะประมาณรายได้ทั้งปีจากศูนย์ ทำให้ภาษี
   * หัก ณ ที่จ่ายต่ำกว่าความจริงและไปโผล่เป็นยอดค้างตอนยื่นภาษีปลายปี
   */
  @Get('opening-balances')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeTaxYearSummary',
    description: 'View employee tax opening balances',
  })
  listOpeningBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
    @Query('taxYearId') taxYearId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.payrollTaxService.listOpeningBalances(
      {
        companyId,
        taxYearId,
        employeeId,
      },
      user.scope,
    );
  }

  @Put('opening-balances')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeTaxYearSummary',
    description: 'Set employee tax opening balance',
  })
  upsertOpeningBalance(
    @Body() dto: UpsertEmployeeTaxOpeningBalanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.upsertOpeningBalance(
      dto,
      user.id,
      user.scope,
    );
  }

  @Get('profiles')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeTaxProfile',
    description: 'View employee tax profiles',
  })
  findProfiles(
    @Query() query: PayrollTaxListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.findProfiles(query, user.scope);
  }

  @Get('profiles/:id')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeTaxProfile',
    description: 'View employee tax profile detail',
  })
  findProfileById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.findProfileById(id, user.scope);
  }

  @Post('profiles')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EmployeeTaxProfile',
    description: 'Create employee tax profile',
  })
  createProfile(
    @Body() dto: CreateEmployeeTaxProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.createProfile(dto, user.id, user.scope);
  }

  @Patch('profiles/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeTaxProfile',
    description: 'Update employee tax profile',
  })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeTaxProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.updateProfile(id, dto, user.scope);
  }

  @Post('profiles/copy')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EmployeeTaxProfile',
    description: 'Copy employee tax profiles to another tax year',
  })
  copyProfiles(
    @Body() dto: CopyEmployeeTaxProfilesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.copyProfilesToTaxYear(dto, user.scope);
  }

  @Delete('profiles/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'EmployeeTaxProfile',
    description: 'Delete employee tax profile',
  })
  deleteProfile(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.deleteProfile(id, user.scope);
  }

  @Post('profiles/:id/allowances')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeTaxAllowance',
    description: 'Upsert employee tax allowance',
  })
  upsertAllowance(
    @Param('id') id: string,
    @Body() dto: UpsertEmployeeTaxAllowanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.upsertAllowance(id, dto, user.scope);
  }

  @Patch('allowances/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeTaxAllowance',
    description: 'Update employee tax allowance',
  })
  updateAllowance(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeTaxAllowanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.updateAllowance(id, dto, user.scope);
  }

  @Delete('allowances/:id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'EmployeeTaxAllowance',
    description: 'Delete employee tax allowance',
  })
  deleteAllowance(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxService.deleteAllowance(id, user.scope);
  }

  /** CSV ไทยต้องประกาศ charset ให้ชัด ไม่งั้นเบราว์เซอร์เดาผิดแล้วอ่านไม่ออก */
  private sendCsvFile(
    response: Response,
    file: { csv: string; fileName: string },
  ) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );

    return response.end(file.csv);
  }

  /** PDF และ XLSX เป็นไบนารี ต้องบอกขนาดจริงให้เบราว์เซอร์ */
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
