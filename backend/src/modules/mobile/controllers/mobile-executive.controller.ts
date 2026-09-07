import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ReportsService } from '../../reports/reports.service';
import { MobileExecutiveOrchestrator } from '../application/mobile-executive.orchestrator';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import {
  MobileCreateExecutiveReportDto,
  MobileExecutiveAttendanceQueryDto,
  MobileExecutiveAttendanceTrendQueryDto,
  MobileExecutivePeriodQueryDto,
  MobileExecutiveFilterDto,
  MobileExecutivePayrollQueryDto,
} from '../dto/mobile-executive.dto';
import { MOBILE_API_PREFIX } from '../mobile.constants';

/**
 * ห้องผู้บริหาร (จอ 23–24 และจอเจาะลึกที่เพิ่มใน Phase 6)
 *
 * ประเภท endpoint: PASSTHROUGH + รวมหลายแหล่ง
 * DashboardService / ManpowerService / ReportsService เป็นเจ้าของตัวเลขทั้งหมด
 *
 * ด่านเข้าห้องคือ `EXECUTIVE_VIEW` ตรงกับ route ฝั่งเว็บ ส่วนสิทธิ์ย่อย
 * (PAYROLL_READ / ORG_READ / REPORT_*) ตรวจใน orchestrator เพราะบางจอ
 * ประกอบจากหลายแหล่ง — บังคับที่ระดับ route จะทำให้ทั้งจอเปิดไม่ได้เพราะ
 * ส่วนเดียวที่ผู้ใช้ไม่มีสิทธิ์
 */
@Controller(`${MOBILE_API_PREFIX}/executive`)
export class MobileExecutiveController {
  constructor(
    private readonly executive: MobileExecutiveOrchestrator,
    private readonly reports: ReportsService,
  ) {}

  /** ตัวเลขวันนี้ + กำลังคน + แนวโน้มค่าแรงสิบสองเดือนของปี (จอแรกที่เปิด) */
  @Get('summary')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.executive.summary(user);
  }

  /** ตัวชี้วัดเชิงบริหาร — อัตราส่วน ต่อหัว เทียบเดือนก่อน และแยกรายแผนก */
  @Get('insights')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  insights(@CurrentUser() user: AuthenticatedUser) {
    return this.executive.insights(user);
  }

  /** กำลังคนพร้อมตัวกรองและตัวเลือกของตัวกรองในขอบเขตของผู้ใช้ */
  @Get('manpower')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  manpower(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileExecutiveFilterDto,
  ) {
    return this.executive.manpowerOverview(user, query);
  }

  /** เวลาทำงานวันนี้รายคน — ปลายทางของการ drill-down */
  @Get('attendance-today')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  attendanceToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileExecutiveAttendanceQueryDto,
  ) {
    return this.executive.attendanceToday(user, query);
  }

  /**
   * แนวโน้มการเข้างานย้อนหลัง — เส้นกราฟบนหน้าแรกของห้องผู้บริหาร
   *
   * สิทธิ์ชุดเดียวกับ attendance-today เพราะเป็นข้อมูลชนิดเดียวกัน ต่างแค่
   * มองเป็นช่วงแทนที่จะเป็นวันเดียว และไม่มีข้อมูลรายบุคคลเลยแม้แต่ช่องเดียว
   */
  @Get('attendance-trend')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  attendanceTrend(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileExecutiveAttendanceTrendQueryDto,
  ) {
    return this.executive.attendanceTrend(user, query);
  }

  /**
   * ลา/โอทีสะสมทั้งงวด — คนละคำถามกับ attendance-today ที่เป็นสถานะวันเดียว
   * ใช้สิทธิ์ชุดเดียวกัน เพราะเป็นข้อมูลชนิดเดียวกันแค่คนละช่วงเวลา
   */
  @Get('leave-ot-period')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  leaveOtPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileExecutivePeriodQueryDto,
  ) {
    return this.executive.leaveOtPeriod(user, query);
  }

  /**
   * ค่าจ้างประมาณการของวันเดียว — ต้องมี PAYROLL_READ เพิ่ม (ตรวจใน orchestrator)
   *
   * แยกจาก `payroll` ที่เป็นยอดรายเดือน/รายปีจากเครื่องคิดเงินเดือน อันนี้เป็น
   * การประมาณจากอัตราค่าจ้างกับเวลาทำงานของวันนั้น สำหรับดูต้นทุนก่อนปิดงวด
   */
  @Get('daily-cost')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  dailyCost(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileExecutiveAttendanceQueryDto,
  ) {
    return this.executive.dailyCost(user, query);
  }

  /** ต้องมี PAYROLL_READ เพิ่ม — ตรวจใน orchestrator */
  @Get('payroll')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  payroll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileExecutivePayrollQueryDto,
  ) {
    return this.executive.payroll(user, query);
  }

  /** ต้องมี ORG_READ เพิ่ม */
  @Get('organization')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  organization(@CurrentUser() user: AuthenticatedUser) {
    return this.executive.organizationChart(user);
  }

  /** ต้องมี REPORT_VIEW เพิ่ม */
  @Get('reports/catalog')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  reportCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.executive.reportCatalog(user);
  }

  /** ต้องมี REPORT_VIEW เพิ่ม — เห็นเฉพาะงานที่ตัวเองสั่ง */
  @Get('reports/jobs')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  reportJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.executive.reportJobs(user);
  }

  /**
   * ขอรายงานหนึ่งฉบับ — ต้องมี REPORT_EXPORT เพิ่ม
   *
   * ใช้ MobileAuth เพราะเป็น mutation ที่ต้องผ่าน idempotency guard เหมือน
   * mutation อื่นของแอป กดซ้ำตอนสัญญาณไม่ดีต้องไม่ได้ไฟล์สองใบ
   */
  @Post('reports')
  @MobileAuth('ESS_ACCESS', 'EXECUTIVE_VIEW')
  createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileCreateExecutiveReportDto,
  ) {
    return this.executive.createReport(user, dto);
  }

  /**
   * ดาวน์โหลดไฟล์รายงานที่สร้างเสร็จแล้ว
   *
   * ส่งต่อ stream จาก ReportsService ตรง ๆ และให้ service เป็นคนตรวจ scope
   * กับบันทึก audit — ที่นี่ไม่เปิดไฟล์เองเพื่อไม่ให้มีเส้นทางอ่านไฟล์อีกทาง
   * ที่ข้ามการตรวจสิทธิ์ของเว็บไป
   */
  @Get('reports/exports/:exportFileId/download')
  @Auth('ESS_ACCESS', 'EXECUTIVE_VIEW', 'REPORT_EXPORT')
  async downloadReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exportFileId') exportFileId: string,
    @Res() response: Response,
  ) {
    const file = await this.reports.downloadExportFile(
      exportFileId,
      user.scope,
      user.id,
    );

    const encodedFileName = encodeURIComponent(file.fileName);

    response.setHeader(
      'Content-Type',
      file.mimeType || 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"; filename*=UTF-8''${encodedFileName}`,
    );
    /* ไฟล์รายงานมีข้อมูลพนักงาน ห้ามให้ตัวกลางเก็บไว้ */
    response.setHeader('Cache-Control', 'private, no-store');

    file.stream.on('error', () => {
      if (!response.headersSent) {
        response
          .status(500)
          .json({ message: 'ไม่สามารถอ่านไฟล์รายงานได้', success: false });
        return;
      }

      response.end();
    });

    file.stream.pipe(response);
  }
}
