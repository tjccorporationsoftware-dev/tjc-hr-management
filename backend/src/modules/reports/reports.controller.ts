import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

import { ReportsService } from './reports.service';
import { CreateReportJobDto } from './dto/create-report-job.dto';
import { ListReportJobsQueryDto } from './dto/list-report-jobs-query.dto';
import { ReportJobActionDto } from './dto/report-job-action.dto';
import { ListExportFilesQueryDto } from './dto/list-export-files-query.dto';
import { ListReportLogsQueryDto } from './dto/list-report-logs-query.dto';
import { ReportDataQueryDto } from './dto/report-data-query.dto';
import { ReportsQueueService } from './reports-queue.service';
import { ReportStatisticsService } from './services/report-statistics.service';
import {
  ReportStatisticsQueryDto,
  ReportUserActivityQueryDto,
} from './dto/report-statistics-query.dto';
import type {
  AuthenticatedUser,
  TenantScope,
} from '../../common/interfaces/authenticated-user.interface';

type CurrentUserPayload = Pick<AuthenticatedUser, 'scope'> & {
  id: string;
  email?: string;
  displayName?: string;
};

@Controller('reports')
@Auth()
export class ReportsController {
 constructor(
  private readonly reportsService: ReportsService,
  private readonly reportsQueueService: ReportsQueueService,
  private readonly reportStatisticsService: ReportStatisticsService,
) {}

  @Get('catalog')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ReportCatalog',
    description: 'ดูรายการประเภทรายงาน',
  })
  async getCatalog() {
    return this.reportsService.getCatalog();
  }

  @Get('jobs')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ReportJob',
    description: 'ดูรายการ Report Job',
  })
  async findJobs(
    @Query() query: ListReportJobsQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.findJobs(query, currentUser.scope);
  }

  @Get('jobs/:id')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ReportJob',
    description: 'ดูรายละเอียด Report Job',
  })
  async findJob(@Param('id') id: string) {
    return this.reportsService.findJob(id);
  }

  @Post('jobs')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'reports:jobs:create',
    limit: 20,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: 'สร้างรายงานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @RequirePermissions('REPORT_EXPORT')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'ReportJob',
    description: 'สร้าง Report Job สำหรับ Export',
  })
  async createJob(
    @Body() dto: CreateReportJobDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.createJob(dto, currentUser.id);
  }

  @Post('jobs/:id/process')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'reports:jobs:process',
    limit: 15,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: 'ประมวลผลรายงานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @RequirePermissions('REPORT_EXPORT')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ReportJob',
    description: 'ประมวลผล Report Job และสร้างไฟล์ Export',
  })
  async processJob(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.processJob(id, currentUser.id);
  }

  @Post('jobs/:id/processing')
  @RequirePermissions('REPORT_EXPORT')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ReportJob',
    description: 'ตั้งสถานะ Report Job เป็นกำลังประมวลผล',
  })
  async markProcessing(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.markProcessing(id, currentUser.id);
  }

  @Post('jobs/:id/complete')
  @RequirePermissions('REPORT_EXPORT')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ReportJob',
    description: 'ตั้งสถานะ Report Job เป็นสำเร็จ',
  })
  async markCompleted(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.markCompleted(id, currentUser.id);
  }

  @Post('jobs/:id/fail')
  @RequirePermissions('REPORT_EXPORT')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ReportJob',
    description: 'ตั้งสถานะ Report Job เป็นล้มเหลว',
  })
  async markFailed(
    @Param('id') id: string,
    @Body() dto: ReportJobActionDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.markFailed(id, dto, currentUser.id);
  }

  @Post('jobs/:id/cancel')
  @RequirePermissions('REPORT_EXPORT')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'ReportJob',
    description: 'ยกเลิก Report Job',
  })
  async cancelJob(
    @Param('id') id: string,
    @Body() dto: ReportJobActionDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.cancelJob(id, dto, currentUser.id);
  }

  @Get('exports')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ExportFile',
    description: 'ดูรายการไฟล์ Export',
  })
  async findExportFiles(
    @Query() query: ListExportFilesQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.findExportFiles(query, currentUser.scope);
  }

  @Get('exports/:id/download')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'reports:exports:download',
    limit: 60,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: 'ดาวน์โหลดรายงานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @RequirePermissions('REPORT_EXPORT')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ExportFile',
    description: 'ดาวน์โหลดไฟล์ Export',
  })
  async downloadExportFile(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Res() response: Response,
  ) {
    const file = await this.reportsService.downloadExportFile(
      id,
      currentUser.scope,
      currentUser.id,
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

    file.stream.on('error', () => {
      if (!response.headersSent) {
        response.status(500).json({
          success: false,
          message: 'ไม่สามารถอ่านไฟล์ Export ได้',
        });
        return;
      }

      response.end();
    });

    file.stream.pipe(response);
  }

  /**
   * สถิติการใช้งานทั้งระบบ — ตัวเลขรวมของหน้า "ศูนย์เอกสารและสถิติ"
   *
   * ใช้ REPORT_VIEW ชุดเดียวกับรายงานอื่น เพราะเป็นตัวเลขสรุประดับองค์กร
   * ไม่ใช่ข้อมูลรายบุคคล และถูกจำกัดด้วย scope ของผู้เรียกอยู่แล้ว
   */
  @Get('statistics')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ReportStatistics',
    description: 'ดูสถิติการใช้งานระบบ',
  })
  async getStatistics(
    @Query() query: ReportStatisticsQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportStatisticsService.getStatistics(query, currentUser.scope);
  }

  /**
   * กิจกรรมของผู้ใช้รายคน — เจาะจากตาราง "ผู้ใช้ที่ใช้งานมากที่สุด"
   *
   * เป็นข้อมูลว่า "ใครทำอะไร" ซึ่งแรงกว่าตัวเลขสรุป จึงขอสิทธิ์ชุดเดียวกับ
   * หน้าบันทึกการใช้งาน (`/audit/logs` ใช้ ORG_MANAGE) ไม่ใช่แค่ REPORT_VIEW
   */
  @Get('statistics/users/:userId')
  @RequirePermissions('REPORT_VIEW', 'ORG_MANAGE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ReportStatistics',
    description: 'ดูกิจกรรมของผู้ใช้รายคน',
  })
  async getUserActivity(
    @Param('userId') userId: string,
    @Query() query: ReportUserActivityQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportStatisticsService.getUserActivity(
      userId,
      query,
      currentUser.scope,
    );
  }

  @Get('logs')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ReportLog',
    description: 'ดูประวัติการใช้งาน Reports',
  })
  async findLogs(
    @Query() query: ListReportLogsQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.findLogs(query, currentUser.scope);
  }

  @Get('data/attendance')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'AttendanceReport',
    description: 'ดูรายงานเวลาทำงาน',
  })
  async getAttendanceReport(
    @Query() query: ReportDataQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.getAttendanceReport(
      query,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('data/work-status')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'WorkStatusReport',
    description: 'ดูรายงานสถานะการมาทำงาน',
  })
  async getWorkStatusReport(
    @Query() query: ReportDataQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.getWorkStatusReport(
      query,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('data/attendance-log')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'AttendanceLogReport',
    description: 'ดูรายงานการลงเวลา',
  })
  async getAttendanceLogReport(
    @Query() query: ReportDataQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.getAttendanceLogReport(
      query,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('data/leave-request')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveRequestReport',
    description: 'ดูรายงานรายการใบลา',
  })
  async getLeaveRequestReport(
    @Query() query: ReportDataQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.getLeaveRequestReport(
      query,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('data/employee-register')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeRegisterReport',
    description: 'ดูรายงานทะเบียนพนักงาน',
  })
  async getEmployeeRegisterReport(
    @Query() query: ReportDataQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.getEmployeeRegisterReport(
      query,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('data/leave-quota')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveQuotaReport',
    description: 'ดูรายงานโควตาวันลา',
  })
  async getLeaveQuotaReport(
    @Query() query: ReportDataQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.getLeaveQuotaReport(
      query,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('data/payroll-basic')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollBasicReport',
    description: 'ดูรายงาน Payroll เบื้องต้น',
  })
  async getPayrollBasicReport(
    @Query() query: ReportDataQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.getPayrollBasicReport(
      query,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('data/social-security')
  @RequirePermissions('REPORT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'SocialSecurityReport',
    description: 'ดูรายงานประกันสังคม',
  })
  async getSocialSecurityReport(
    @Query() query: ReportDataQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.reportsService.getSocialSecurityReport(
      query,
      currentUser.id,
      currentUser.scope,
    );
  }
  @Post('jobs/:id/process-async')
@RequirePermissions('REPORT_EXPORT')
@Audit({
  action: AuditAction.UPDATE,
  entity: 'ReportJob',
  description: 'ส่ง Report Job เข้าคิวประมวลผลด้วย BullMQ',
})
async processJobAsync(
  @CurrentUser() currentUser: CurrentUserPayload,
  @Param('id') id: string,
) {
  const queueJob = await this.reportsQueueService.enqueueProcessReportJob({
    reportJobId: id,
    currentUserId: currentUser.id ?? null,
  });

  return {
    queued: true,
    reportJobId: id,
    queueJob,
    message: 'ส่ง Report Job เข้าคิวประมวลผลแล้ว',
  };
}
@Get('queue/jobs/:queueJobId')
@RequirePermissions('REPORT_VIEW')
@Audit({
  action: AuditAction.VIEW,
  entity: 'ReportQueueJob',
  description: 'ตรวจสอบสถานะ Queue Job ของรายงาน',
})
async getQueueJob(@Param('queueJobId') queueJobId: string) {
  const queueJob = await this.reportsQueueService.getQueueJob(queueJobId);

  return {
    queueJob,
  };
}

}