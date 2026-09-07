import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ExportFileFormat,
  Prisma,
  ReportCode,
  ReportJobStatus,
  ReportLogAction,
} from '../../generated/prisma/client';

import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';

/*
 * ใช้ธีมเอกสารชุดเดียวกับสลิปเงินเดือนและแบบ สปส. เพื่อให้กระดาษทุกใบที่ออกจาก
 * ระบบหน้าตาเป็นชุดเดียวกัน — ไฟล์นี้เป็น util ล้วน ไม่มี DI จึงข้ามโมดูลมาใช้ได้
 */
import {
  DOCUMENT_BASE_CSS,
  formatDateTime,
  renderLetterhead,
  type DocumentCompany,
} from '../payroll/payroll-document.util';

import { createReadStream } from 'fs';
import { mkdir, stat, writeFile } from 'fs/promises';
import { basename, join } from 'path';

import { PrismaService } from '../../database/prisma.service';

import { CreateReportJobDto } from './dto/create-report-job.dto';
import { ListReportJobsQueryDto } from './dto/list-report-jobs-query.dto';
import { ReportJobActionDto } from './dto/report-job-action.dto';
import { ListExportFilesQueryDto } from './dto/list-export-files-query.dto';
import { ListReportLogsQueryDto } from './dto/list-report-logs-query.dto';
import { ReportDataQueryDto } from './dto/report-data-query.dto';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  effectiveBranchId,
  effectiveCompanyId,
} from '../../common/tenant/tenant-scope.util';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /* =========================================================
   REPORT CATALOG
   ---------------------------------------------------------
   รายการรายงานที่ระบบรองรับ และ format ที่ export ได้
========================================================= */

  getCatalog() {
    return [
      {
        code: ReportCode.ATTENDANCE,
        name: 'รายงานเวลาทำงาน',
        description:
          'รายงานเวลาเข้า-ออกงาน มาสาย ขาดงาน ลืมลงเวลา และความผิดปกติของเวลา',
        supportedFormats: [
          ExportFileFormat.CSV,
          ExportFileFormat.JSON,
          ExportFileFormat.XLSX,
          ExportFileFormat.PDF,
        ],
      },
      {
        code: ReportCode.WORK_STATUS,
        name: 'รายงานสถานะการมาทำงาน',
        description:
          'ปฏิทินทั้งเดือน เห็นทุกคนว่าวันไหนมา ลา ขาด หรือหยุด ในหน้าเดียว',
        supportedFormats: [
          ExportFileFormat.CSV,
          ExportFileFormat.JSON,
          ExportFileFormat.XLSX,
          ExportFileFormat.PDF,
        ],
      },
      {
        code: ReportCode.ATTENDANCE_LOG,
        name: 'รายงานการลงเวลา',
        description:
          'บันทึกดิบทุกครั้งที่พนักงานแตะลงเวลา พร้อมช่องทาง สถานที่ และเครื่องที่ใช้',
        supportedFormats: [
          ExportFileFormat.CSV,
          ExportFileFormat.JSON,
          ExportFileFormat.XLSX,
          ExportFileFormat.PDF,
        ],
      },
      {
        code: ReportCode.LEAVE_REQUEST,
        name: 'รายงานรายการใบลา',
        description: 'ใครลาวันไหน ประเภทอะไร กี่วัน และสถานะของใบลา',
        supportedFormats: [
          ExportFileFormat.CSV,
          ExportFileFormat.JSON,
          ExportFileFormat.XLSX,
          ExportFileFormat.PDF,
        ],
      },
      {
        code: ReportCode.EMPLOYEE_REGISTER,
        name: 'รายงานทะเบียนพนักงาน',
        description: 'รายชื่อพนักงานพร้อมสังกัด วันเริ่มงาน อายุงาน และสถานะ',
        supportedFormats: [
          ExportFileFormat.CSV,
          ExportFileFormat.JSON,
          ExportFileFormat.XLSX,
          ExportFileFormat.PDF,
        ],
      },
      {
        code: ReportCode.PAYROLL_BASIC,
        name: 'รายงาน Payroll เบื้องต้น',
        description:
          'รายงานข้อมูลสำหรับเงินเดือนในระดับเบื้องต้น ยังไม่ใช่ Payroll เต็มระบบ',
        supportedFormats: [
          ExportFileFormat.CSV,
          ExportFileFormat.JSON,
          ExportFileFormat.XLSX,
          ExportFileFormat.PDF,
        ],
      },
      {
        code: ReportCode.SOCIAL_SECURITY,
        name: 'รายงานประกันสังคม',
        description: 'รายงานข้อมูลประกันสังคมและเงินสมทบของพนักงาน',
        supportedFormats: [
          ExportFileFormat.CSV,
          ExportFileFormat.JSON,
          ExportFileFormat.XLSX,
          ExportFileFormat.PDF,
        ],
      },
      {
        code: ReportCode.LEAVE_QUOTA,
        name: 'รายงานโควตาวันลา',
        description: 'รายงานสิทธิวันลาที่ได้รับ ใช้แล้ว และคงเหลือในแต่ละปี',
        supportedFormats: [
          ExportFileFormat.CSV,
          ExportFileFormat.JSON,
          ExportFileFormat.XLSX,
          ExportFileFormat.PDF,
        ],
      },
    ];
  }

  /**
   * ล็อกตัวกรองบริษัท/สาขาของรายงานให้อยู่ในขอบเขตของผู้เรียกเสมอ
   * ==========================================================
   * ทุกรายงานรับ companyId/branchId มาจาก query string ของผู้เรียก
   * ถ้าล็อกแค่ companyId (อย่างที่ทำมาก่อนหน้า) บัญชีระดับสาขาจะส่ง branchId
   * ของสาขาอื่นเข้ามาแล้วดึงบันทึกเวลาและข้อมูลค่าตอบแทนข้ามสาขาได้
   *
   * ต้องเรียกตัวนี้เป็นบรรทัดแรกของทุกเมธอดที่คืนข้อมูลรายงาน ก่อนแตะ query
   * ที่ไหนก็ตาม เพื่อให้ค่าที่ไหลต่อไปข้างล่างถูกจำกัดแล้วเสมอ
   */
  private scopedReportQuery<
    TQuery extends { companyId?: string; branchId?: string },
  >(query: TQuery, scope?: TenantScope): TQuery {
    if (!scope) {
      return query;
    }

    return {
      ...query,
      companyId: effectiveCompanyId(scope, query.companyId),
      branchId: effectiveBranchId(scope, query.branchId),
    };
  }

  /* =========================================================
   REPORT JOB
   ---------------------------------------------------------
   จัดการงานสร้างรายงาน: ค้นหา สร้าง เปลี่ยนสถานะ และยกเลิก job
========================================================= */

  async findJobs(query: ListReportJobsQueryDto, scope: TenantScope) {
    query = { ...query, companyId: effectiveCompanyId(scope, query.companyId) };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ReportJobWhereInput = {
      deletedAt: null,
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.reportCode ? { reportCode: query.reportCode } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { errorMessage: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, statusGroups] = await Promise.all([
      this.prisma.reportJob.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: this.reportJobInclude(),
      }),
      this.prisma.reportJob.count({ where }),
      this.prisma.reportJob.groupBy({
        by: ['status'],
        where,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: this.buildReportJobListSummary(total, statusGroups),
    };
  }

  /**
   * งานรายงานที่ผู้ใช้คนนี้สั่งเอง — สำหรับแอปมือถือ
   *
   * แยกจาก findJobs ของเว็บ (ซึ่งไม่มีเงื่อนไข createdById) เพราะจอบนมือถือ
   * ตอบคำถามเดียวคือ "ไฟล์ที่ฉันเพิ่งขอเสร็จหรือยัง" ไม่ใช่หน้าจัดการคิว
   * รายงานขององค์กร การกรองฝั่งแอปหลังได้ผลลัพธ์มาแล้วจะทำให้เลขหน้าเพี้ยน
   * (ขอ 20 รายการ ได้กลับมา 3 เพราะที่เหลือเป็นของคนอื่น) จึงต้องกรองที่ where
   *
   * ไม่แตะ findJobs เดิม เพราะหน้าเว็บพึ่งพฤติกรรม "เห็นงานทั้งบริษัท" อยู่
   */
  async findMobileMyJobs(
    userId: string,
    scope: TenantScope,
    query: ListReportJobsQueryDto = {},
  ) {
    const companyId = effectiveCompanyId(scope, query.companyId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ReportJobWhereInput = {
      createdById: userId,
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.reportJob.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: this.reportJobInclude(),
      }),
      this.prisma.reportJob.count({ where }),
    ]);

    return {
      items,
      meta: {
        hasMore: page * pageSize < total,
        page,
        pageSize,
        total,
      },
    };
  }

  async findJob(id: string) {
    const item = await this.prisma.reportJob.findFirst({
      where: { id, deletedAt: null },
      include: this.reportJobInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบ Report Job');
    }

    return item;
  }

  async createJob(dto: CreateReportJobDto, currentUserId?: string) {
    await this.validateCompany(dto.companyId);

    const catalogItem = this.getCatalog().find(
      (item) => item.code === dto.reportCode,
    );

    if (!catalogItem) {
      throw new BadRequestException('ไม่พบประเภทรายงาน');
    }

    const name = dto.name?.trim() || catalogItem.name;
    const description =
      this.optionalTrim(dto.description) ?? catalogItem.description;

    const exportFormat = dto.format ?? ExportFileFormat.CSV;

    const jobParams = {
      ...(dto.params ?? {}),
      format: exportFormat,
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const job = await tx.reportJob.create({
        data: {
          companyId: dto.companyId ?? null,
          reportCode: dto.reportCode,
          name,
          description,
          status: ReportJobStatus.PENDING,
          params: jobParams as Prisma.InputJsonValue,
          createdById: currentUserId ?? null,
        },
      });

      await tx.reportLog.create({
        data: {
          companyId: dto.companyId ?? null,
          reportJobId: job.id,
          reportCode: dto.reportCode,
          action: ReportLogAction.CREATE_EXPORT,
          message: `สร้าง Report Job: ${name}`,
          metadata: {
            format: exportFormat,
            params: jobParams,
          } as Prisma.InputJsonValue,
          createdById: currentUserId ?? null,
        },
      });

      return job;
    });

    return this.findJob(created.id);
  }

  async markProcessing(id: string, currentUserId?: string) {
    const current = await this.getJobOrThrow(id);

    if (current.status !== ReportJobStatus.PENDING) {
      throw new BadRequestException('เริ่มประมวลผลได้เฉพาะ Job ที่รอดำเนินการ');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reportJob.update({
        where: { id },
        data: {
          status: ReportJobStatus.PROCESSING,
          startedAt: new Date(),
        },
      });

      await tx.reportLog.create({
        data: {
          companyId: current.companyId,
          reportJobId: current.id,
          reportCode: current.reportCode,
          action: ReportLogAction.VIEW,
          message: 'เริ่มประมวลผลรายงาน',
          createdById: currentUserId ?? null,
        },
      });
    });

    return this.findJob(id);
  }

  async markCompleted(id: string, currentUserId?: string) {
    const current = await this.getJobOrThrow(id);

    if (
      current.status !== ReportJobStatus.PENDING &&
      current.status !== ReportJobStatus.PROCESSING
    ) {
      throw new BadRequestException(
        'ปิดงานได้เฉพาะ Job ที่รอดำเนินการหรือกำลังประมวลผล',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reportJob.update({
        where: { id },
        data: {
          status: ReportJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await tx.reportLog.create({
        data: {
          companyId: current.companyId,
          reportJobId: current.id,
          reportCode: current.reportCode,
          action: ReportLogAction.VIEW,
          message: 'ประมวลผลรายงานสำเร็จ',
          createdById: currentUserId ?? null,
        },
      });
    });

    return this.findJob(id);
  }

  async markFailed(
    id: string,
    dto: ReportJobActionDto,
    currentUserId?: string,
  ) {
    const current = await this.getJobOrThrow(id);

    if (
      current.status === ReportJobStatus.COMPLETED ||
      current.status === ReportJobStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'ไม่สามารถตั้งค่า Failed ให้ Job ที่จบแล้ว',
      );
    }

    const reason =
      this.optionalTrim(dto.reason) ||
      this.optionalTrim(dto.note) ||
      'ประมวลผลรายงานไม่สำเร็จ';

    await this.prisma.$transaction(async (tx) => {
      await tx.reportJob.update({
        where: { id },
        data: {
          status: ReportJobStatus.FAILED,
          failedAt: new Date(),
          errorMessage: reason,
        },
      });

      await tx.reportLog.create({
        data: {
          companyId: current.companyId,
          reportJobId: current.id,
          reportCode: current.reportCode,
          action: ReportLogAction.ERROR,
          message: reason,
          createdById: currentUserId ?? null,
        },
      });
    });

    return this.findJob(id);
  }

  async cancelJob(id: string, dto: ReportJobActionDto, currentUserId?: string) {
    const current = await this.getJobOrThrow(id);

    if (
      current.status === ReportJobStatus.COMPLETED ||
      current.status === ReportJobStatus.CANCELLED
    ) {
      throw new BadRequestException('ไม่สามารถยกเลิก Job ที่จบแล้ว');
    }

    const reason =
      this.optionalTrim(dto.reason) ||
      this.optionalTrim(dto.note) ||
      'ยกเลิก Report Job';

    await this.prisma.$transaction(async (tx) => {
      await tx.reportJob.update({
        where: { id },
        data: {
          status: ReportJobStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: reason,
          cancelledById: currentUserId ?? null,
        },
      });

      await tx.reportLog.create({
        data: {
          companyId: current.companyId,
          reportJobId: current.id,
          reportCode: current.reportCode,
          action: ReportLogAction.CANCEL,
          message: reason,
          createdById: currentUserId ?? null,
        },
      });
    });

    return this.findJob(id);
  }

  /* =========================================================
   EXPORT FILE
   ---------------------------------------------------------
   รายการไฟล์ export ที่สร้างแล้ว และการดาวน์โหลดไฟล์
========================================================= */

  /**
   * จำกัดไฟล์ export ที่บัญชีระดับสาขามองเห็น
   * ==========================================
   * ตาราง ExportFile มีแค่ companyId ไม่มี branchId การกรองด้วยบริษัทอย่างเดียว
   * จึงยังปล่อยให้บัญชีระดับสาขาโหลดไฟล์ที่คนระดับบริษัทสร้างไว้ได้
   * ซึ่งข้างในเป็นข้อมูลของทุกสาขา — รวมสาขาที่ตัวเองไม่มีสิทธิ์เห็น
   *
   * เพิ่ม branchId ลงตารางจะตรงประเด็นกว่า แต่ต้อง migration พร้อม backfill
   * จึงกรองผ่าน scope ของ "คนที่สร้างไฟล์" แทน ซึ่งได้ผลลัพธ์เดียวกันโดยไม่ต้อง
   * แตะ schema: ไฟล์ที่คนระดับบริษัท/แพลตฟอร์มสร้าง (scopedBranchId เป็น null)
   * จะหลุดออกไปเอง ส่วนเพื่อนร่วมสาขาเดียวกันยังแชร์ไฟล์กันได้เหมือนเดิม
   *
   * ระดับ GLOBAL/COMPANY ไม่ถูกจำกัดเพิ่ม เพราะ companyId คุมอยู่แล้ว
   */
  private exportFileScopeWhere(
    scope: TenantScope,
  ): Prisma.ExportFileWhereInput {
    if (scope.level !== 'BRANCH') {
      return {};
    }

    return {
      createdBy: { is: { scopedBranchId: effectiveBranchId(scope) } },
    };
  }

  async findExportFiles(query: ListExportFilesQueryDto, scope: TenantScope) {
    query = { ...query, companyId: effectiveCompanyId(scope, query.companyId) };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ExportFileWhereInput = {
      deletedAt: null,
      ...this.exportFileScopeWhere(scope),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.reportJobId ? { reportJobId: query.reportJobId } : {}),
      ...(query.reportCode ? { reportCode: query.reportCode } : {}),
      ...(query.format ? { format: query.format } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { fileName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, formatGroups] = await Promise.all([
      this.prisma.exportFile.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: this.exportFileInclude(),
      }),
      this.prisma.exportFile.count({ where }),
      this.prisma.exportFile.groupBy({
        by: ['format'],
        where,
        orderBy: { format: 'asc' },
        _count: { _all: true },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: this.buildExportFileListSummary(total, formatGroups),
    };
  }

  /* =========================================================
   REPORT LOG
   ---------------------------------------------------------
   ประวัติการสร้าง ดู ดาวน์โหลด ยกเลิก หรือ error ของรายงาน
========================================================= */

  async findLogs(query: ListReportLogsQueryDto, scope: TenantScope) {
    query = { ...query, companyId: effectiveCompanyId(scope, query.companyId) };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ReportLogWhereInput = {
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.reportJobId ? { reportJobId: query.reportJobId } : {}),
      ...(query.exportFileId ? { exportFileId: query.exportFileId } : {}),
      ...(query.reportCode ? { reportCode: query.reportCode } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total, actionGroups] = await Promise.all([
      this.prisma.reportLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: this.reportLogInclude(),
      }),
      this.prisma.reportLog.count({ where }),
      this.prisma.reportLog.groupBy({
        by: ['action'],
        where,
        orderBy: { action: 'asc' },
        _count: { _all: true },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: this.buildReportLogListSummary(total, actionGroups),
    };
  }

  private getGroupCount(
    groups: Array<{ _count?: { _all?: number } | true; [key: string]: unknown }>,
    key: string,
    value: string,
  ) {
    const group = groups.find((item) => item[key] === value);
    const count = group?._count;

    if (!count || count === true) return 0;
    return count._all ?? 0;
  }

  private buildReportJobListSummary(
    total: number,
    groups: Array<{ status: ReportJobStatus; _count?: { _all?: number } | true }>,
  ) {
    return {
      total,
      pending: this.getGroupCount(groups, 'status', ReportJobStatus.PENDING),
      processing: this.getGroupCount(groups, 'status', ReportJobStatus.PROCESSING),
      completed: this.getGroupCount(groups, 'status', ReportJobStatus.COMPLETED),
      failed: this.getGroupCount(groups, 'status', ReportJobStatus.FAILED),
      cancelled: this.getGroupCount(groups, 'status', ReportJobStatus.CANCELLED),
    };
  }

  private buildExportFileListSummary(
    total: number,
    groups: Array<{ format: ExportFileFormat; _count?: { _all?: number } | true }>,
  ) {
    return {
      total,
      csv: this.getGroupCount(groups, 'format', ExportFileFormat.CSV),
      xlsx: this.getGroupCount(groups, 'format', ExportFileFormat.XLSX),
      pdf: this.getGroupCount(groups, 'format', ExportFileFormat.PDF),
      json: this.getGroupCount(groups, 'format', ExportFileFormat.JSON),
    };
  }

  private buildReportLogListSummary(
    total: number,
    groups: Array<{ action: ReportLogAction; _count?: { _all?: number } | true }>,
  ) {
    return {
      total,
      view: this.getGroupCount(groups, 'action', ReportLogAction.VIEW),
      download: this.getGroupCount(groups, 'action', ReportLogAction.DOWNLOAD),
      createExport: this.getGroupCount(groups, 'action', ReportLogAction.CREATE_EXPORT),
      cancel: this.getGroupCount(groups, 'action', ReportLogAction.CANCEL),
      error: this.getGroupCount(groups, 'action', ReportLogAction.ERROR),
    };
  }

  /* =========================================================
   ATTENDANCE REPORT
   ---------------------------------------------------------
   บันทึกเวลาเข้า-ออกรายวัน — หนึ่งแถวคือพนักงานหนึ่งคนในหนึ่งวัน

   ใช้ตอบคำถามว่า "คนนี้ทั้งปีเข้างานออกงานกี่โมงบ้าง" จึงต้องเรียงตามวัน
   และมีครบทุกวันที่มีข้อมูล ไม่ใช่เฉพาะวันที่มีเรื่อง

   ไม่มีคอลัมน์เงิน — ยอดหักเป็นเรื่องของ payroll ไม่ใช่ของบันทึกเวลา
========================================================= */

  private readonly ATTENDANCE_SESSION_MISSING = 'ไม่ได้ลงเวลา';

  async getAttendanceReport(
    query: ReportDataQueryDto,
    currentUserId?: string,
    scope?: TenantScope,
  ) {
    query = this.scopedReportQuery(query, scope);

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? this.toEndOfDay(query.dateTo) : undefined;

    const where: Prisma.AttendanceDailySummaryWhereInput = {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(dateFrom || dateTo
        ? {
            workDate: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      employee: {
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.q
          ? {
              OR: [
                { employeeCode: { contains: query.q, mode: 'insensitive' } },
                { firstName: { contains: query.q, mode: 'insensitive' } },
                { lastName: { contains: query.q, mode: 'insensitive' } },
                { displayName: { contains: query.q, mode: 'insensitive' } },
                { position: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where,
      // เรียงตามคนก่อนแล้วค่อยตามวัน — ดูของรายคนทั้งปีจะได้ไล่ลงมาต่อเนื่อง
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            position: true,
            positionMaster: { select: { nameTh: true } },
            company: { select: { nameTh: true } },
            branch: { select: { nameTh: true } },
            department: { select: { nameTh: true } },
          },
        },
        leaveType: { select: { nameTh: true } },
      },
    });

    const clock = (value?: Date | null) => {
      if (!value) return '';
      return value.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      });
    };

    const rows = summaries.map((item) => {
      /**
       * วันที่ไม่มีเวลาเลยและระบบไม่ได้ตีว่าลืมลงเวลา แปลว่าวันนั้นไม่มีกะให้เข้า
       * (เสาร์-อาทิตย์ / วันหยุด) — เขียนว่า "ปกติ" จะทำให้เข้าใจผิดว่ามาทำงาน
       */
      const noSchedule =
        !item.morningInAt &&
        !item.afternoonInAt &&
        !item.checkOutAt &&
        !item.hasMissingLog &&
        !item.isAbsent;

      const dayStatus = item.isAbsent
        ? 'ขาดงาน'
        : item.leaveType?.nameTh
          ? `ลา: ${item.leaveType.nameTh}`
          : item.hasMissingLog
            ? 'ลืมลงเวลา'
            : item.totalLateMinutes > 0
              ? 'มาสาย'
              : noSchedule
                ? 'วันหยุด / ไม่มีกะ'
                : 'ปกติ';

      return {
        id: item.id,
        workDate: item.workDate,
        employeeCode: item.employee?.employeeCode ?? '-',
        employeeName: this.employeeName(item.employee),
        position: this.positionName(item.employee),
        companyName: item.employee?.company?.nameTh ?? null,
        branchName: item.employee?.branch?.nameTh ?? null,
        departmentName: item.employee?.department?.nameTh ?? null,

        morningInAt: item.isMorningMissing
          ? this.ATTENDANCE_SESSION_MISSING
          : clock(item.morningInAt),
        afternoonInAt: item.isAfternoonMissing
          ? this.ATTENDANCE_SESSION_MISSING
          : clock(item.afternoonInAt),
        checkOutAt: item.isCheckoutMissing
          ? this.ATTENDANCE_SESSION_MISSING
          : clock(item.checkOutAt),

        lateMinutes: item.totalLateMinutes,
        earlyCheckoutMinutes: item.earlyCheckoutMinutes,
        otMinutes: item.approvedOtMinutes,
        dayStatus,
      };
    });

    const employeeCodes = new Set(rows.map((row) => row.employeeCode));

    const pageResult = this.buildReportPage(rows, query);

    await this.createReportViewLog({
      companyId: query.companyId,
      reportCode: ReportCode.ATTENDANCE,
      message: 'ดูบันทึกเวลาเข้า-ออกรายวัน',
      metadata: query,
      currentUserId,
    });

    return {
      reportCode: ReportCode.ATTENDANCE,
      title: 'บันทึกเวลาเข้า-ออกรายวัน',
      filters: query,
      metrics: {
        totalRows: rows.length,
        employeeCount: employeeCodes.size,
        normalDays: rows.filter((row) => row.dayStatus === 'ปกติ').length,
        holidayDays: rows.filter((row) => row.dayStatus === 'วันหยุด / ไม่มีกะ')
          .length,
        lateDays: rows.filter((row) => row.dayStatus === 'มาสาย').length,
        leaveDays: rows.filter((row) => row.dayStatus.startsWith('ลา:')).length,
        absentDays: rows.filter((row) => row.dayStatus === 'ขาดงาน').length,
        missingLogDays: rows.filter((row) => row.dayStatus === 'ลืมลงเวลา')
          .length,
        otHours:
          Math.round(
            (rows.reduce((sum, row) => sum + row.otMinutes, 0) / 60) * 100,
          ) / 100,
      },
      rows: pageResult.rows,
      meta: pageResult.meta,
    };
  }

  /** ตัวกรองพนักงานที่ทุกรายงานใช้ร่วมกัน */
  private buildReportEmployeeWhere(query: ReportDataQueryDto) {
    return {
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.q
        ? {
            OR: [
              { employeeCode: { contains: query.q, mode: 'insensitive' as const } },
              { firstName: { contains: query.q, mode: 'insensitive' as const } },
              { lastName: { contains: query.q, mode: 'insensitive' as const } },
              { displayName: { contains: query.q, mode: 'insensitive' as const } },
              { position: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  private readonly REPORT_EMPLOYEE_SELECT = {
    id: true,
    employeeCode: true,
    firstName: true,
    lastName: true,
    displayName: true,
    position: true,
    positionMaster: { select: { nameTh: true } },
    company: { select: { nameTh: true } },
    branch: { select: { nameTh: true } },
    department: { select: { nameTh: true } },
  };

  /** รอบการลงเวลา — schema เก็บเป็น enum อังกฤษ แต่รายงานต้องอ่านเป็นไทย */
  private readonly ACTIVITY_SESSION_TEXT: Record<string, string> = {
    MORNING: 'รอบเช้า',
    AFTERNOON: 'รอบบ่าย',
    EVENING: 'รอบเย็น',
  };

  /* =========================================================
   WORK STATUS REPORT — รายงานสถานะการมาทำงาน
   ---------------------------------------------------------
   ปฏิทินทั้งเดือน แถวคือพนักงาน คอลัมน์คือวันที่ 1-31 ในช่องเป็นรหัสตัวอักษร

   ตารางแนวยาววันละแถวตอบคำถาม "คนนี้ทั้งเดือนมาไม่มาวันไหนบ้าง" ไม่ได้
   เพราะต้องกวาดสายตา 30 แถวต่อคน — แบบปฏิทินเห็นทั้งเดือนในบรรทัดเดียว
========================================================= */

  /** ความหมายของรหัสในช่องปฏิทิน — ต้องตรงกับที่ frontend วาดคำอธิบายไว้ */
  static readonly WORK_STATUS_LEGEND: Record<string, string> = {
    P: 'มาทำงาน',
    L: 'มาสาย',
    O: 'ลา',
    A: 'ขาดงาน',
    M: 'ลืมลงเวลา',
    H: 'วันหยุด / ไม่มีกะ',
  };

  async getWorkStatusReport(
    query: ReportDataQueryDto,
    currentUserId?: string,
    scope?: TenantScope,
  ) {
    query = this.scopedReportQuery(query, scope);

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? this.toEndOfDay(query.dateTo) : undefined;

    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where: {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(dateFrom || dateTo
          ? {
              workDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
        employee: this.buildReportEmployeeWhere(query),
      },
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
      include: {
        employee: { select: this.REPORT_EMPLOYEE_SELECT },
        leaveType: { select: { nameTh: true } },
      },
    });

    /** วันที่ในเดือนตามเขตเวลาไทย — ไม่งั้นวันที่ 1 จะกลายเป็นวันสิ้นเดือนก่อนหน้า */
    const dayOfMonth = (value: Date) =>
      Number(
        value.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(8),
      );

    const byEmployee = new Map<string, Record<string, unknown>>();

    summaries.forEach((item) => {
      const key = item.employeeId;

      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          id: key,
          employeeCode: item.employee?.employeeCode ?? '-',
          employeeName: this.employeeName(item.employee),
          position: this.positionName(item.employee),
          companyName: item.employee?.company?.nameTh ?? null,
          branchName: item.employee?.branch?.nameTh ?? null,
          departmentName: item.employee?.department?.nameTh ?? null,
          presentDays: 0,
          lateDays: 0,
          leaveDays: 0,
          absentDays: 0,
          missingDays: 0,
          holidayDays: 0,
        });
      }

      const row = byEmployee.get(key)!;

      const noSchedule =
        !item.morningInAt &&
        !item.afternoonInAt &&
        !item.checkOutAt &&
        !item.hasMissingLog &&
        !item.isAbsent;

      let code = 'P';
      if (item.isAbsent) code = 'A';
      else if (item.leaveType?.nameTh) code = 'O';
      else if (item.hasMissingLog) code = 'M';
      else if (noSchedule) code = 'H';
      else if (item.totalLateMinutes > 0) code = 'L';

      row[`d${dayOfMonth(item.workDate)}`] = code;

      if (code === 'P') (row.presentDays as number) += 1;
      if (code === 'L') (row.lateDays as number) += 1;
      if (code === 'O') (row.leaveDays as number) += 1;
      if (code === 'A') (row.absentDays as number) += 1;
      if (code === 'M') (row.missingDays as number) += 1;
      if (code === 'H') (row.holidayDays as number) += 1;
    });

    const rows = Array.from(byEmployee.values()).sort((left, right) =>
      String(left.employeeCode).localeCompare(String(right.employeeCode)),
    );

    const pageResult = this.buildReportPage(rows, query);

    await this.createReportViewLog({
      companyId: query.companyId,
      reportCode: ReportCode.WORK_STATUS,
      message: 'ดูรายงานสถานะการมาทำงาน',
      metadata: query,
      currentUserId,
    });

    return {
      reportCode: ReportCode.WORK_STATUS,
      title: 'รายงานสถานะการมาทำงาน',
      filters: query,
      metrics: {
        employeeCount: rows.length,
        presentDays: rows.reduce((sum, r) => sum + (r.presentDays as number), 0),
        lateDays: rows.reduce((sum, r) => sum + (r.lateDays as number), 0),
        leaveDays: rows.reduce((sum, r) => sum + (r.leaveDays as number), 0),
        absentDays: rows.reduce((sum, r) => sum + (r.absentDays as number), 0),
        missingDays: rows.reduce((sum, r) => sum + (r.missingDays as number), 0),
      },
      rows: pageResult.rows,
      meta: pageResult.meta,
    };
  }

  /* =========================================================
   ATTENDANCE LOG REPORT — รายงานการลงเวลา
   ---------------------------------------------------------
   บันทึกดิบทุกครั้งที่พนักงานแตะลงเวลา ใช้ตรวจย้อนหลังว่าลงจากที่ไหน
   ด้วยช่องทางไหน และมีการแก้ไขภายหลังหรือไม่
========================================================= */

  async getAttendanceLogReport(
    query: ReportDataQueryDto,
    currentUserId?: string,
    scope?: TenantScope,
  ) {
    query = this.scopedReportQuery(query, scope);

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? this.toEndOfDay(query.dateTo) : undefined;

    const logs = await this.prisma.attendanceLog.findMany({
      where: {
        deletedAt: null,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(dateFrom || dateTo
          ? {
              workDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
        employee: this.buildReportEmployeeWhere(query),
      },
      orderBy: [{ workDate: 'desc' }, { logTime: 'desc' }],
      include: {
        employee: { select: this.REPORT_EMPLOYEE_SELECT },
        location: { select: { nameTh: true } },
        device: { select: { name: true, code: true } },
      },
    });

    const rows = logs.map((item) => ({
      id: item.id,
      workDate: item.workDate,
      logClock: this.formatCsvTime(item.logTime),
      employeeCode: item.employee?.employeeCode ?? '-',
      employeeName: this.employeeName(item.employee),
      companyName: item.employee?.company?.nameTh ?? null,
      branchName: item.employee?.branch?.nameTh ?? null,
      departmentName: item.employee?.department?.nameTh ?? null,
      logTypeText: item.logType === 'CHECK_IN' ? 'เข้างาน' : 'ออกงาน',
      sessionText: item.session
        ? (this.ACTIVITY_SESSION_TEXT[item.session] ?? item.session)
        : '',
      channel: item.channel,
      locationName: item.location?.nameTh ?? '',
      deviceName: item.device?.name ?? item.device?.code ?? '',
      isOffsite: item.isOffsite ? 'นอกสถานที่' : '',
      logStatus: item.status,
    }));

    const pageResult = this.buildReportPage(rows, query);

    await this.createReportViewLog({
      companyId: query.companyId,
      reportCode: ReportCode.ATTENDANCE_LOG,
      message: 'ดูรายงานการลงเวลา',
      metadata: query,
      currentUserId,
    });

    return {
      reportCode: ReportCode.ATTENDANCE_LOG,
      title: 'รายงานการลงเวลา',
      filters: query,
      metrics: {
        totalRows: rows.length,
        checkInCount: rows.filter((r) => r.logTypeText === 'เข้างาน').length,
        checkOutCount: rows.filter((r) => r.logTypeText === 'ออกงาน').length,
        offsiteCount: rows.filter((r) => r.isOffsite).length,
        editedCount: rows.filter((r) => r.logStatus === 'EDITED').length,
      },
      rows: pageResult.rows,
      meta: pageResult.meta,
    };
  }

  /* =========================================================
   LEAVE REQUEST REPORT — รายงานรายการใบลา
   ---------------------------------------------------------
   ใครลาวันไหน ประเภทอะไร กี่วัน สถานะถึงไหน — ต่างจากรายงานโควตา
   ที่บอกแค่ยอดรวมทั้งปี ตัวนี้บอกเป็นใบ ๆ ว่าไปลงวันไหนบ้าง
========================================================= */

  async getLeaveRequestReport(
    query: ReportDataQueryDto,
    currentUserId?: string,
    scope?: TenantScope,
  ) {
    query = this.scopedReportQuery(query, scope);

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? this.toEndOfDay(query.dateTo) : undefined;

    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        deletedAt: null,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        // ใบที่คร่อมช่วง ก็ต้องติดมาด้วย ไม่ใช่เฉพาะใบที่เริ่มในช่วง
        ...(dateFrom || dateTo
          ? {
              ...(dateTo ? { startDate: { lte: dateTo } } : {}),
              ...(dateFrom ? { endDate: { gte: dateFrom } } : {}),
            }
          : {}),
        employee: this.buildReportEmployeeWhere(query),
      },
      orderBy: [{ startDate: 'desc' }],
      include: {
        employee: { select: this.REPORT_EMPLOYEE_SELECT },
        leaveType: { select: { nameTh: true, isPaid: true } },
      },
    });

    const dayTypeText: Record<string, string> = {
      FULL_DAY: 'เต็มวัน',
      HALF_DAY_MORNING: 'ครึ่งวันเช้า',
      HALF_DAY_AFTERNOON: 'ครึ่งวันบ่าย',
      HOURLY: 'รายชั่วโมง',
    };

    const rows = requests.map((item) => ({
      id: item.id,
      requestNo: item.requestNo ?? '',
      employeeCode: item.employee?.employeeCode ?? '-',
      employeeName: this.employeeName(item.employee),
      companyName: item.employee?.company?.nameTh ?? null,
      branchName: item.employee?.branch?.nameTh ?? null,
      departmentName: item.employee?.department?.nameTh ?? null,
      leaveTypeName: item.leaveType?.nameTh ?? '-',
      leavePaid: item.leaveType?.isPaid ? 'ได้รับค่าจ้าง' : 'ไม่ได้รับค่าจ้าง',
      startDate: item.startDate,
      endDate: item.endDate,
      dayTypeText: dayTypeText[item.dayType] ?? item.dayType,
      totalDays: this.toNumber(item.totalDays),
      reason: item.reason ?? '',
      leaveStatus: item.status,
      submittedAt: item.submittedAt,
    }));

    const pageResult = this.buildReportPage(rows, query);

    await this.createReportViewLog({
      companyId: query.companyId,
      reportCode: ReportCode.LEAVE_REQUEST,
      message: 'ดูรายงานรายการใบลา',
      metadata: query,
      currentUserId,
    });

    return {
      reportCode: ReportCode.LEAVE_REQUEST,
      title: 'รายงานรายการใบลา',
      filters: query,
      metrics: {
        totalRows: rows.length,
        employeeCount: new Set(rows.map((r) => r.employeeCode)).size,
        totalLeaveDays:
          Math.round(rows.reduce((sum, r) => sum + r.totalDays, 0) * 100) / 100,
        approvedCount: rows.filter((r) => r.leaveStatus === 'APPROVED').length,
        pendingCount: rows.filter((r) => r.leaveStatus === 'SUBMITTED').length,
      },
      rows: pageResult.rows,
      meta: pageResult.meta,
    };
  }

  /* =========================================================
   EMPLOYEE REGISTER REPORT — รายงานทะเบียนพนักงาน
   ---------------------------------------------------------
   รายชื่อพนักงานพร้อมข้อมูลหลัก สังกัด วันเริ่มงาน และอายุงาน
   ใช้เป็นทะเบียนกลางสำหรับตรวจสอบและส่งให้หน่วยงานภายนอก
========================================================= */

  async getEmployeeRegisterReport(
    query: ReportDataQueryDto,
    currentUserId?: string,
    scope?: TenantScope,
  ) {
    query = this.scopedReportQuery(query, scope);

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        ...(query.employeeId ? { id: query.employeeId } : {}),
        ...this.buildReportEmployeeWhere(query),
      },
      orderBy: [{ employeeCode: 'asc' }],
      select: {
        ...this.REPORT_EMPLOYEE_SELECT,
        email: true,
        phone: true,
        startDate: true,
        probationEndDate: true,
        status: true,
        employeeType: { select: { nameTh: true } },
        supervisor: { select: { displayName: true, firstName: true, lastName: true } },
      },
    });

    const now = Date.now();

    const rows = employees.map((item) => {
      const months = item.startDate
        ? Math.max(
            0,
            Math.floor(
              (now - new Date(item.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30.4375),
            ),
          )
        : 0;

      return {
        id: item.id,
        employeeCode: item.employeeCode ?? '-',
        employeeName: this.employeeName(item),
        position: this.positionName(item) ?? '',
        companyName: item.company?.nameTh ?? null,
        branchName: item.branch?.nameTh ?? null,
        departmentName: item.department?.nameTh ?? null,
        employeeTypeName: item.employeeType?.nameTh ?? '',
        supervisorName: item.supervisor
          ? (item.supervisor.displayName ??
            [item.supervisor.firstName, item.supervisor.lastName]
              .filter(Boolean)
              .join(' '))
          : '',
        startDate: item.startDate,
        // อายุงานเขียนเป็น "x ปี y เดือน" เลย คนอ่านจะได้ไม่ต้องหารเอง
        serviceLength: `${Math.floor(months / 12)} ปี ${months % 12} เดือน`,
        probationEndDate: item.probationEndDate,
        employeeStatus: item.status,
        email: item.email ?? '',
        phone: item.phone ?? '',
      };
    });

    const pageResult = this.buildReportPage(rows, query);

    await this.createReportViewLog({
      companyId: query.companyId,
      reportCode: ReportCode.EMPLOYEE_REGISTER,
      message: 'ดูรายงานทะเบียนพนักงาน',
      metadata: query,
      currentUserId,
    });

    return {
      reportCode: ReportCode.EMPLOYEE_REGISTER,
      title: 'รายงานทะเบียนพนักงาน',
      filters: query,
      metrics: {
        totalRows: rows.length,
        activeCount: rows.filter((r) => r.employeeStatus === 'ACTIVE').length,
        probationCount: rows.filter((r) => r.employeeStatus === 'PROBATION')
          .length,
        resignedCount: rows.filter((r) => r.employeeStatus === 'RESIGNED')
          .length,
      },
      rows: pageResult.rows,
      meta: pageResult.meta,
    };
  }

  /* =========================================================
   LEAVE QUOTA REPORT
   ---------------------------------------------------------
   รายงานสิทธิวันลา ใช้แล้ว รออนุมัติ และคงเหลือแยกตามพนักงาน
========================================================= */

  async getLeaveQuotaReport(
    query: ReportDataQueryDto,
    currentUserId?: string,
    scope?: TenantScope,
  ) {
    query = this.scopedReportQuery(query, scope);
    const year = query.year ?? new Date().getFullYear();

    const where: Prisma.LeaveBalanceWhereInput = {
      year,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      employee: {
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.q
          ? {
              OR: [
                { employeeCode: { contains: query.q, mode: 'insensitive' } },
                { firstName: { contains: query.q, mode: 'insensitive' } },
                { lastName: { contains: query.q, mode: 'insensitive' } },
                { displayName: { contains: query.q, mode: 'insensitive' } },
                { position: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const balances = await this.prisma.leaveBalance.findMany({
      where,
      orderBy: [{ employee: { employeeCode: 'asc' } }],
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            position: true,
            positionMaster: { select: { nameTh: true } },
            company: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
            branch: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
            department: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
          },
        },
        leaveType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
      },
    } as any);

    const rows = balances.map((item: any) => {
      const entitledDays = this.toNumber(
        item.entitledDays ?? item.totalDays ?? item.quotaDays,
      );
      const usedDays = this.toNumber(item.usedDays);
      const pendingDays = this.toNumber(item.pendingDays);
      const remainingDays = this.toNumber(
        item.remainingDays ?? entitledDays - usedDays - pendingDays,
      );

      return {
        id: item.id,
        year: item.year,
        employee: item.employee,
        company: item.employee?.company ?? null,
        branch: item.employee?.branch ?? null,
        department: item.employee?.department ?? null,
        leaveType: item.leaveType,
        entitledDays,
        usedDays,
        pendingDays,
        remainingDays,
      };
    });

    const pageResult = this.buildReportPage(rows, query);

    await this.createReportViewLog({
      companyId: query.companyId,
      reportCode: ReportCode.LEAVE_QUOTA,
      message: 'ดูรายงานโควตาวันลา',
      metadata: query,
      currentUserId,
    });

    return {
      reportCode: ReportCode.LEAVE_QUOTA,
      title: 'รายงานโควตาวันลา',
      filters: {
        ...query,
        year,
      },
      metrics: {
        totalRows: rows.length,
        employeeCount: new Set(rows.map((item: any) => item.employee?.id)).size,
        totalEntitledDays: rows.reduce(
          (sum: number, item: any) => sum + item.entitledDays,
          0,
        ),
        totalUsedDays: rows.reduce(
          (sum: number, item: any) => sum + item.usedDays,
          0,
        ),
        totalPendingDays: rows.reduce(
          (sum: number, item: any) => sum + item.pendingDays,
          0,
        ),
        totalRemainingDays: rows.reduce(
          (sum: number, item: any) => sum + item.remainingDays,
          0,
        ),
      },
      rows: pageResult.rows,
      meta: pageResult.meta,
    };
  }

  /* =========================================================
   PAYROLL BASIC REPORT
   ---------------------------------------------------------
   รายงาน Payroll เบื้องต้น ใช้ประกอบการตรวจสอบก่อนระบบคำนวณเต็มรูปแบบ
========================================================= */

  async getPayrollBasicReport(
    query: ReportDataQueryDto,
    currentUserId?: string,
    scope?: TenantScope,
  ) {
    query = this.scopedReportQuery(query, scope);
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? this.toEndOfDay(query.dateTo) : undefined;

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.employeeId ? { id: query.employeeId } : {}),
        ...(query.q
          ? {
              OR: [
                { employeeCode: { contains: query.q, mode: 'insensitive' } },
                { firstName: { contains: query.q, mode: 'insensitive' } },
                { lastName: { contains: query.q, mode: 'insensitive' } },
                { displayName: { contains: query.q, mode: 'insensitive' } },
                { position: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { employeeCode: 'asc' },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        profile: true,
      },
    } as any);

    const overtimeRequests = await this.prisma.overtimeRequest.findMany({
      where: {
        deletedAt: null,
        status: 'APPROVED',
        ...(dateFrom || dateTo
          ? {
              workDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
        employeeId: {
          in: employees.map((employee: any) => employee.id),
        },
      },
    } as any);

    const overtimeMap = new Map<
      string,
      {
        approvedOtCount: number;
        approvedOtHours: number;
        estimatedOtAmount: number;
      }
    >();

    overtimeRequests.forEach((item: any) => {
      const current = overtimeMap.get(item.employeeId) ?? {
        approvedOtCount: 0,
        approvedOtHours: 0,
        estimatedOtAmount: 0,
      };

      const hours = this.toNumber(
        item.totalHours ?? item.hours ?? item.approvedHours,
      );

      const amount = this.toNumber(
        item.totalAmount ?? item.estimatedAmount ?? item.amount,
      );

      current.approvedOtCount += 1;
      current.approvedOtHours += hours;
      current.estimatedOtAmount += amount;

      overtimeMap.set(item.employeeId, current);
    });

    const rows = employees.map((employee: any) => {
      const profile = employee.profile ?? {};
      const baseSalary = this.toNumber(
        employee.baseSalary ??
          employee.salary ??
          profile.baseSalary ??
          profile.salary ??
          profile.monthlySalary,
      );

      const ot = overtimeMap.get(employee.id) ?? {
        approvedOtCount: 0,
        approvedOtHours: 0,
        estimatedOtAmount: 0,
      };

      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: this.employeeName(employee),
        position: employee.position ?? null,
        company: employee.company ?? null,
        branch: employee.branch ?? null,
        department: employee.department ?? null,
        baseSalary,
        approvedOtCount: ot.approvedOtCount,
        approvedOtHours: ot.approvedOtHours,
        estimatedOtAmount: ot.estimatedOtAmount,
        estimatedGrossAmount: baseSalary + ot.estimatedOtAmount,
      };
    });

    const pageResult = this.buildReportPage(rows, query);

    await this.createReportViewLog({
      companyId: query.companyId,
      reportCode: ReportCode.PAYROLL_BASIC,
      message: 'ดูรายงาน Payroll เบื้องต้น',
      metadata: query,
      currentUserId,
    });

    return {
      reportCode: ReportCode.PAYROLL_BASIC,
      title: 'รายงาน Payroll เบื้องต้น',
      warning:
        'รายงานนี้เป็นข้อมูลประกอบ Payroll เบื้องต้น ยังไม่ใช่ Payroll Calculation เต็มระบบ',
      filters: query,
      metrics: {
        employeeCount: rows.length,
        totalBaseSalary: rows.reduce(
          (sum: number, item: any) => sum + item.baseSalary,
          0,
        ),
        totalApprovedOtHours: rows.reduce(
          (sum: number, item: any) => sum + item.approvedOtHours,
          0,
        ),
        totalEstimatedOtAmount: rows.reduce(
          (sum: number, item: any) => sum + item.estimatedOtAmount,
          0,
        ),
        totalEstimatedGrossAmount: rows.reduce(
          (sum: number, item: any) => sum + item.estimatedGrossAmount,
          0,
        ),
      },
      rows: pageResult.rows,
      meta: pageResult.meta,
    };
  }

  /* =========================================================
   SOCIAL SECURITY REPORT
   ---------------------------------------------------------
   รายงานประกันสังคมจาก PayrollLine ที่คำนวณแล้ว
========================================================= */

  async getSocialSecurityReport(
    query: ReportDataQueryDto,
    currentUserId?: string,
    scope?: TenantScope,
  ) {
    query = this.scopedReportQuery(query, scope);
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? this.toEndOfDay(query.dateTo) : undefined;

    const payrollItems = await this.prisma.payrollItem.findMany({
      where: {
        run: {
          deletedAt: null,
          status: {
            in: ['CALCULATED', 'REVIEWED', 'APPROVED', 'PAID'],
          },
          ...(query.companyId ? { companyId: query.companyId } : {}),
          period: {
            deletedAt: null,
            ...(query.year ? { year: query.year } : {}),
            ...(dateFrom || dateTo
              ? {
                  endDate: {
                    ...(dateFrom ? { gte: dateFrom } : {}),
                    ...(dateTo ? { lte: dateTo } : {}),
                  },
                }
              : {}),
          },
        },
        employee: {
          deletedAt: null,
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.employeeId ? { id: query.employeeId } : {}),
          ...(query.q
            ? {
                OR: [
                  { employeeCode: { contains: query.q, mode: 'insensitive' } },
                  { firstName: { contains: query.q, mode: 'insensitive' } },
                  { lastName: { contains: query.q, mode: 'insensitive' } },
                  { displayName: { contains: query.q, mode: 'insensitive' } },
                  { position: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        lines: {
          some: {
            sourceType: 'SOCIAL_SECURITY',
          },
        },
      },
      include: {
        run: {
          include: {
            period: true,
            company: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
          },
        },
        employee: {
          include: {
            company: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
            branch: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
            department: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
          },
        },
        lines: {
          where: {
            sourceType: 'SOCIAL_SECURITY',
          },
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    } as any);

    const rows = payrollItems.map((item: any) => {
      const employeeLine = (item.lines ?? []).find(
        (line: any) => line.code === 'SOCIAL_SECURITY' && line.type === 'DEDUCTION',
      );
      const employerLine = (item.lines ?? []).find(
        (line: any) => line.code === 'SOCIAL_SECURITY_EMPLOYER' && line.type === 'EMPLOYER_CONTRIBUTION',
      );
      const snapshot = this.asRecord(item.snapshot);
      const socialSnapshot = this.asRecord(snapshot.socialSecurity);
      const socialSecurityBase = this.toNumber(
        employeeLine?.quantity ?? employerLine?.quantity ?? socialSnapshot.cappedBase,
      );
      const employeeContribution = this.toNumber(employeeLine?.amount);
      const employerContribution = this.toNumber(employerLine?.amount);
      const period = item.run?.period;

      return {
        payrollRunId: item.runId,
        payrollRunNo: item.run?.runNo ?? '-',
        periodCode: period?.code ?? null,
        periodName: period?.name ?? null,
        periodEndDate: period?.endDate ?? null,
        employeeId: item.employeeId,
        employeeCode: item.employee?.employeeCode ?? '-',
        employeeName: this.employeeName(item.employee),
        position: this.positionName(item.employee),
        company: item.employee?.company ?? item.run?.company ?? null,
        branch: item.employee?.branch ?? null,
        department: item.employee?.department ?? null,
        socialSecurityBase,
        employeeContribution,
        employerContribution,
        note: `จาก Payroll Run ${item.run?.runNo ?? '-'} / ${period?.code ?? period?.name ?? '-'}${socialSnapshot.employeeRate ? ` / ลูกจ้าง ${socialSnapshot.employeeRate}%` : ''}${socialSnapshot.employerRate ? ` / นายจ้าง ${socialSnapshot.employerRate}%` : ''}`,
      };
    });

    const pageResult = this.buildReportPage(rows, query);

    await this.createReportViewLog({
      companyId: query.companyId,
      reportCode: ReportCode.SOCIAL_SECURITY,
      message: 'ดูรายงานประกันสังคมจาก Payroll Lines',
      metadata: query,
      currentUserId,
    });

    return {
      reportCode: ReportCode.SOCIAL_SECURITY,
      title: 'รายงานประกันสังคม',
      warning: rows.length > 0
        ? undefined
        : 'ยังไม่พบ Payroll Run ที่คำนวณรายการประกันสังคมในช่วงที่เลือก',
      filters: query,
      metrics: {
        employeeCount: rows.length,
        totalSocialSecurityBase: rows.reduce(
          (sum: number, item: any) => sum + item.socialSecurityBase,
          0,
        ),
        totalEmployeeContribution: rows.reduce(
          (sum: number, item: any) => sum + item.employeeContribution,
          0,
        ),
        totalEmployerContribution: rows.reduce(
          (sum: number, item: any) => sum + item.employerContribution,
          0,
        ),
      },
      rows: pageResult.rows,
      meta: pageResult.meta,
    };
  }

  /* =========================================================
   REPORT PROCESSING ENGINE
   ---------------------------------------------------------
   ประมวลผล report job, สร้างข้อมูลรายงาน, เขียนไฟล์ และบันทึก log
========================================================= */

  async processJob(id: string, currentUserId?: string) {
    const current = await this.getJobOrThrow(id);

    if (current.status === ReportJobStatus.COMPLETED) {
      throw new BadRequestException('Report Job นี้สำเร็จแล้ว');
    }

    if (current.status === ReportJobStatus.CANCELLED) {
      throw new BadRequestException('ไม่สามารถประมวลผล Job ที่ถูกยกเลิกแล้ว');
    }

    const params = this.normalizeJobParams(current.params);
    const format = this.normalizeExportFormat(params.format);

    const supportedFormats = new Set<ExportFileFormat>([
      ExportFileFormat.CSV,
      ExportFileFormat.JSON,
      ExportFileFormat.XLSX,
      ExportFileFormat.PDF,
    ]);

    if (!supportedFormats.has(format)) {
      throw new BadRequestException(
        'รองรับการสร้างไฟล์จริงเฉพาะ CSV, JSON, XLSX และ PDF',
      );
    }

    await this.prisma.reportJob.update({
      where: { id },
      data: {
        status: ReportJobStatus.PROCESSING,
        startedAt: current.startedAt ?? new Date(),
      },
    });

    try {
      const reportData = await this.buildReportData(
        current.reportCode,
        params,
        currentUserId,
      );

      const letterhead = await this.getReportLetterhead(
        current.companyId ??
          (typeof params.companyId === 'string' ? params.companyId : null),
      );

      const writtenFile = await this.writeReportFile({
        reportCode: current.reportCode,
        title: current.name,
        format,
        // คัดคอลัมน์ตามหน้าที่ผู้ใช้กดโหลด ไม่ใช่ยัดทุกคอลัมน์ลงไฟล์เดียว
        rows: this.dropLetterheadColumns(
          this.applyReportView(current.reportCode, params, reportData.rows),
          letterhead,
        ),
        metrics: reportData.metrics,
        company: letterhead,
      });

      const completed = await this.prisma.$transaction(async (tx) => {
        const exportFile = await tx.exportFile.create({
          data: {
            companyId: current.companyId,
            reportJobId: current.id,
            reportCode: current.reportCode,
            format,
            title: current.name,
            description: current.description,
            fileName: writtenFile.fileName,
            fileSize: writtenFile.fileSize,
            mimeType: writtenFile.mimeType,
            storageProvider: 'LOCAL',
            storageKey: writtenFile.storageKey,
            createdById: currentUserId ?? null,
          },
        });

        await tx.reportJob.update({
          where: { id },
          data: {
            status: ReportJobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        await tx.reportLog.create({
          data: {
            companyId: current.companyId,
            reportJobId: current.id,
            exportFileId: exportFile.id,
            reportCode: current.reportCode,
            action: ReportLogAction.CREATE_EXPORT,
            message: `สร้างไฟล์ Export สำเร็จ: ${writtenFile.fileName}`,
            metadata: {
              format,
              fileName: writtenFile.fileName,
              fileSize: writtenFile.fileSize,
              rowCount: reportData.rows.length,
            } as Prisma.InputJsonValue,
            createdById: currentUserId ?? null,
          },
        });

        return exportFile;
      });

      return {
        job: await this.findJob(id),
        exportFile: completed,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'ประมวลผล Report Job ไม่สำเร็จ';

      await this.prisma.$transaction(async (tx) => {
        await tx.reportJob.update({
          where: { id },
          data: {
            status: ReportJobStatus.FAILED,
            failedAt: new Date(),
            errorMessage: message,
          },
        });

        await tx.reportLog.create({
          data: {
            companyId: current.companyId,
            reportJobId: current.id,
            reportCode: current.reportCode,
            action: ReportLogAction.ERROR,
            message,
            createdById: currentUserId ?? null,
          },
        });
      });

      throw error;
    }
  }

  /**
   * @param scope ขอบเขตของผู้เรียก — กรองด้วย companyId ตรงเหมือน findExportFiles
   *
   * ไฟล์ Export มักเป็นข้อมูลเงินเดือน/ภาษีทั้งบริษัท ถ้าไม่กรองตรงนี้
   * ผู้ใช้ที่รู้ id ไฟล์ของบริษัทอื่นจะดาวน์โหลดข้ามบริษัทได้
   * ตอบ 404 เหมือนไม่มีไฟล์ เพื่อไม่ยืนยันการมีอยู่ของไฟล์ที่ไม่มีสิทธิ์เห็น
   */
  async downloadExportFile(
    id: string,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    const companyId = effectiveCompanyId(scope);

    const file = await this.prisma.exportFile.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        // ต้องกรองแบบเดียวกับตอนแสดงรายการ ไม่งั้นไฟล์ที่ถูกซ่อนจากรายการ
        // ยังโหลดได้อยู่ถ้ารู้ id
        ...this.exportFileScopeWhere(scope),
      },
    });

    if (!file) {
      throw new NotFoundException('ไม่พบไฟล์ Export');
    }

    if (file.storageProvider !== 'LOCAL') {
      throw new BadRequestException(
        'รองรับการดาวน์โหลดเฉพาะไฟล์ LOCAL เท่านั้น',
      );
    }

    const safeFileName = basename(file.storageKey);
    const fullPath = join(this.getReportExportDir(), safeFileName);

    try {
      await stat(fullPath);
    } catch {
      throw new NotFoundException('ไม่พบไฟล์ในเครื่อง Server');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.exportFile.update({
        where: { id },
        data: {
          downloadedAt: new Date(),
          downloadedById: currentUserId ?? null,
        },
      });

      await tx.reportLog.create({
        data: {
          companyId: file.companyId,
          reportJobId: file.reportJobId,
          exportFileId: file.id,
          reportCode: file.reportCode,
          action: ReportLogAction.DOWNLOAD,
          message: `ดาวน์โหลดไฟล์ Export: ${file.fileName}`,
          createdById: currentUserId ?? null,
        },
      });
    });

    return {
      stream: createReadStream(fullPath),
      fileName: file.fileName,
      mimeType: file.mimeType || 'application/octet-stream',
    };
  }

  /* =========================================================
   COMMON VALIDATION / UTILITY
   ---------------------------------------------------------
   helper กลางสำหรับ validate, แปลงวันที่, แปลงตัวเลข และบันทึก log
========================================================= */

  private async getJobOrThrow(id: string) {
    const item = await this.prisma.reportJob.findFirst({
      where: { id, deletedAt: null },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบ Report Job');
    }

    return item;
  }

  private async validateCompany(companyId?: string | null) {
    if (!companyId) return;

    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('ไม่พบบริษัท');
    }
  }

  private toEndOfDay(date: string) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private optionalTrim(value?: string | null) {
    if (value === undefined || value === null) return null;

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * ชื่อตำแหน่งของพนักงาน
   *
   * ตำแหน่งเก็บได้สองที่ — ช่องข้อความอิสระ `position` กับการผูกกับทะเบียน
   * ตำแหน่ง `positionId` ระบบจริงผูกกับทะเบียนเป็นหลัก (40 จาก 41 คน)
   * และแทบไม่มีใครกรอกช่องข้อความเลย ถ้าอ่านแค่ช่องข้อความ คอลัมน์ตำแหน่ง
   * ในรายงานจะว่างทั้งใบทั้งที่ข้อมูลมีอยู่
   *
   * เอาช่องข้อความก่อนเพราะเป็นค่าที่คนตั้งใจพิมพ์ทับไว้เอง
   */
  private positionName(
    employee?: {
      position?: string | null;
      positionMaster?: { nameTh?: string | null } | null;
    } | null,
  ) {
    if (!employee) return null;

    return employee.position?.trim() || employee.positionMaster?.nameTh || null;
  }

  private employeeName(
    employee?: {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    } | null,
  ) {
    if (!employee) return '-';

    return (
      employee.displayName ||
      [employee.firstName, employee.lastName].filter(Boolean).join(' ') ||
      '-'
    );
  }

  private asRecord(value: unknown): Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return 0;

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : 0;
  }


  private buildReportPage(rows: any[], query: ReportDataQueryDto) {
    const sortedRows = this.sortReportRows(rows, query.sortBy);
    const total = sortedRows.length;
    const hasPagination = Boolean(query.page || query.pageSize);
    const page = hasPagination ? Math.max(1, Number(query.page ?? 1)) : 1;
    const pageSize = hasPagination
      ? Math.min(100, Math.max(1, Number(query.pageSize ?? 20)))
      : Math.max(total, 1);
    const skip = (page - 1) * pageSize;

    return {
      rows: hasPagination ? sortedRows.slice(skip, skip + pageSize) : sortedRows,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  private sortReportRows(rows: any[], sortBy?: string) {
    const sortedRows = [...rows];

    if (sortBy === 'employee') {
      return sortedRows.sort((a, b) =>
        this.reportRowEmployeeName(a).localeCompare(
          this.reportRowEmployeeName(b),
          'th',
        ),
      );
    }

    if (sortBy === 'dateDesc') {
      return sortedRows.sort((a, b) =>
        this.reportRowDateValue(b).localeCompare(this.reportRowDateValue(a)),
      );
    }

    if (sortBy === 'dateAsc') {
      return sortedRows.sort((a, b) =>
        this.reportRowDateValue(a).localeCompare(this.reportRowDateValue(b)),
      );
    }

    return sortedRows;
  }

  private reportRowEmployeeName(row: any) {
    return (
      row.employeeName ||
      this.employeeName(row.employee) ||
      row.employeeCode ||
      row.employee?.employeeCode ||
      ''
    );
  }

  private reportRowDateValue(row: any) {
    return String(row.workDate ?? row.createdAt ?? row.logTime ?? '');
  }

  private async createReportViewLog(params: {
    companyId?: string | null;
    reportCode: ReportCode;
    message: string;
    metadata?: unknown;
    currentUserId?: string;
  }) {
    await this.prisma.reportLog.create({
      data: {
        companyId: params.companyId ?? null,
        reportCode: params.reportCode,
        action: ReportLogAction.VIEW,
        message: params.message,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        createdById: params.currentUserId ?? null,
      },
    });
  }

  private normalizeJobParams(params: Prisma.JsonValue | null | undefined) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return {};
    }

    return params as Record<string, unknown>;
  }

  private normalizeExportFormat(value: unknown): ExportFileFormat {
    if (value === ExportFileFormat.JSON) return ExportFileFormat.JSON;
    if (value === ExportFileFormat.XLSX) return ExportFileFormat.XLSX;
    if (value === ExportFileFormat.PDF) return ExportFileFormat.PDF;

    return ExportFileFormat.CSV;
  }

  private async buildReportData(
    reportCode: ReportCode,
    params: Record<string, unknown>,
    currentUserId?: string,
  ) {
    const query = {
      companyId:
        typeof params.companyId === 'string' ? params.companyId : undefined,
      branchId:
        typeof params.branchId === 'string' ? params.branchId : undefined,
      departmentId:
        typeof params.departmentId === 'string'
          ? params.departmentId
          : undefined,
      employeeId:
        typeof params.employeeId === 'string' ? params.employeeId : undefined,
      q: typeof params.q === 'string' ? params.q : undefined,
      dateFrom:
        typeof params.dateFrom === 'string' ? params.dateFrom : undefined,
      dateTo: typeof params.dateTo === 'string' ? params.dateTo : undefined,
      year:
        typeof params.year === 'number'
          ? params.year
          : typeof params.year === 'string'
            ? Number(params.year)
            : undefined,
    };

    if (reportCode === ReportCode.ATTENDANCE) {
      return this.getAttendanceReport(query, currentUserId);
    }

    if (reportCode === ReportCode.WORK_STATUS) {
      return this.getWorkStatusReport(query, currentUserId);
    }

    if (reportCode === ReportCode.ATTENDANCE_LOG) {
      return this.getAttendanceLogReport(query, currentUserId);
    }

    if (reportCode === ReportCode.LEAVE_REQUEST) {
      return this.getLeaveRequestReport(query, currentUserId);
    }

    if (reportCode === ReportCode.EMPLOYEE_REGISTER) {
      return this.getEmployeeRegisterReport(query, currentUserId);
    }

    if (reportCode === ReportCode.LEAVE_QUOTA) {
      return this.getLeaveQuotaReport(query, currentUserId);
    }

    if (reportCode === ReportCode.PAYROLL_BASIC) {
      return this.getPayrollBasicReport(query, currentUserId);
    }

    if (reportCode === ReportCode.SOCIAL_SECURITY) {
      return this.getSocialSecurityReport(query, currentUserId);
    }

    throw new BadRequestException('ไม่รองรับประเภทรายงานนี้');
  }

  /**
   * ข้อมูลบริษัทสำหรับทำหัวจดหมายบนไฟล์ PDF
   *
   * งานที่ไม่ได้ระบุบริษัท (ดูข้ามบริษัททั้งระบบ) จะไม่มีหัวจดหมาย ซึ่งถูกแล้ว
   * เพราะเอกสารใบเดียวพูดแทนหลายบริษัทไม่ได้
   */
  private static readonly LETTERHEAD_SELECT = {
    code: true,
    nameTh: true,
    nameEn: true,
    logoUrl: true,
    taxId: true,
    address: true,
    phone: true,
    email: true,
  } as const;

  private async getReportLetterhead(
    companyId: string | null,
  ): Promise<DocumentCompany | null> {
    if (companyId) {
      return this.prisma.company.findUnique({
        where: { id: companyId },
        select: ReportsService.LETTERHEAD_SELECT,
      });
    }

    /*
     * ไม่ได้เลือกบริษัทไม่ได้แปลว่าเอกสารพูดแทนหลายบริษัทเสมอไป
     *
     * ระบบที่มีบริษัทเดียว ตัวเลือก "ทุกบริษัท" ก็คือบริษัทนั้นอยู่ดี ถ้าตกไปใช้
     * หัวเรียบจะได้เอกสารที่ไม่มีโลโก้และไม่มีที่อยู่ ทั้งที่ข้อมูลมีอยู่ครบ
     * ดึงมาสองตัวเพื่อแยกให้ออกว่ามีจริงตัวเดียวหรือมีมากกว่านั้น
     */
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: ReportsService.LETTERHEAD_SELECT,
      take: 2,
    });

    return companies.length === 1 ? companies[0] : null;
  }

  /**
   * ตัดคอลัมน์ที่ซ้ำกับหัวจดหมายออกจากตาราง
   *
   * ถ้าทุกแถวเป็นบริษัทเดียวกันและหัวจดหมายบอกชื่อบริษัทนั้นไปแล้ว การพิมพ์ซ้ำ
   * ลงไปทุกแถวไม่ได้เพิ่มข้อมูลอะไร แต่กินความกว้างจนคอลัมน์ที่มีค่าจริงถูกบีบ
   * ตัดเฉพาะตอนที่ค่าซ้ำกันทั้งหมดจริง ๆ — ถ้ามีหลายบริษัทปนกันจะคงไว้เหมือนเดิม
   */
  private dropLetterheadColumns(
    rows: Record<string, unknown>[],
    company: DocumentCompany | null,
  ) {
    const companyName = company?.nameTh?.trim();

    if (!companyName || rows.length === 0) return rows;

    const allSame = rows.every(
      (row) => String(row.companyName ?? '').trim() === companyName,
    );

    if (!allSame) return rows;

    return rows.map(({ companyName: _dropped, ...rest }) => rest);
  }

  /* =========================================================
   REPORT VIEW — เลือกคอลัมน์ตามมุมมองที่ผู้ใช้เปิดอยู่
   ---------------------------------------------------------
   รายงานสถานะการมาทำงานคำนวณทีเดียวได้ทั้งยอดสรุปและปฏิทิน 31 ช่อง รวม 43 คอลัมน์
   แต่บนหน้าจอถูกแยกเป็นสองรายงานที่ตอบคนละคำถาม ไฟล์ที่โหลดจึงต้องแยกตามด้วย
   ไม่งั้นกดโหลดจากหน้าไหนก็ได้ไฟล์หน้าตาเดียวกันทั้ง 43 คอลัมน์
========================================================= */

  /** คอลัมน์นับจำนวนวันของรายงานสถานะการมาทำงาน */
  private static readonly WORK_STATUS_SUMMARY_KEYS = new Set([
    'presentDays',
    'lateDays',
    'leaveDays',
    'absentDays',
    'missingDays',
    'holidayDays',
  ]);

  private isDayColumn(key: string) {
    return /^d\d{1,2}$/.test(key);
  }

  /**
   * คลาสสีของรหัสรายวัน — ต้องตรงกับ WORK_STATUS_LEGEND และกับสีบนหน้าจอ
   * รหัสที่ไม่รู้จักคืนสตริงว่าง ตัวอักษรจะแสดงเป็นสีปกติ ไม่ใช่หายไป
   */
  private dayCodeClass(code: string) {
    const key = code.trim().toUpperCase();

    return ReportsService.WORK_STATUS_LEGEND[key] ? `code-${key.toLowerCase()}` : '';
  }

  /**
   * คัดคอลัมน์ของแต่ละแถวให้เหลือเฉพาะที่มุมมองนั้นต้องใช้
   *
   * `view` มาจากหน้าจอที่กดโหลด — 'summary' คือหน้าสรุปยอด, 'calendar' คือหน้าปฏิทิน
   * ถ้าไม่ได้ส่งมาก็คืนทุกคอลัมน์เหมือนเดิม เพื่อไม่ให้ของเก่าที่เรียกอยู่พัง
   */
  private applyReportView(
    reportCode: ReportCode,
    params: Record<string, unknown> | null | undefined,
    rows: Record<string, unknown>[],
  ) {
    if (reportCode !== ReportCode.WORK_STATUS) return rows;

    const view = typeof params?.view === 'string' ? params.view : null;
    if (view !== 'summary' && view !== 'calendar') return rows;

    const drop = (key: string) =>
      view === 'summary'
        ? this.isDayColumn(key)
        : ReportsService.WORK_STATUS_SUMMARY_KEYS.has(key);

    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !drop(key)),
      ),
    );
  }

  /* =========================================================
   FILE GENERATOR
   ---------------------------------------------------------
   สร้างไฟล์ export จริงในรูปแบบ CSV, XLSX และ PDF
========================================================= */

  private async writeReportFile(params: {
    reportCode: ReportCode;
    title: string;
    format: ExportFileFormat;
    rows: Record<string, unknown>[];
    metrics: Record<string, number>;
    company?: DocumentCompany | null;
  }) {
    const exportDir = this.getReportExportDir();

    await mkdir(exportDir, {
      recursive: true,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `${params.reportCode}_${timestamp}`;

    if (params.format === ExportFileFormat.PDF) {
      const fileName = `${baseName}.pdf`;
      const storageKey = fileName;
      const fullPath = join(exportDir, fileName);

      await this.writePdfFile({
        fullPath,
        reportCode: params.reportCode,
        title: params.title,
        rows: params.rows,
        metrics: params.metrics,
        company: params.company ?? null,
      });

      const fileStat = await stat(fullPath);

      return {
        fileName,
        storageKey,
        fileSize: fileStat.size,
        mimeType: 'application/pdf',
      };
    }

    if (params.format === ExportFileFormat.XLSX) {
      const fileName = `${baseName}.xlsx`;
      const storageKey = fileName;
      const fullPath = join(exportDir, fileName);

      await this.writeXlsxFile({
        fullPath,
        reportCode: params.reportCode,
        title: params.title,
        rows: params.rows,
        metrics: params.metrics,
      });

      const fileStat = await stat(fullPath);

      return {
        fileName,
        storageKey,
        fileSize: fileStat.size,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    const fileName = `${baseName}.csv`;
    const storageKey = fileName;
    const fullPath = join(exportDir, fileName);

    const csv = this.toCsv(params.rows);

    await writeFile(fullPath, csv, 'utf8');

    const fileStat = await stat(fullPath);

    return {
      fileName,
      storageKey,
      fileSize: fileStat.size,
      mimeType: 'text/csv; charset=utf-8',
    };
  }

  private getReportExportDir() {
    return join(process.cwd(), 'storage', 'exports', 'reports');
  }

  private async writeXlsxFile(params: {
    fullPath: string;
    reportCode: ReportCode;
    title: string;
    rows: Record<string, unknown>[];
    metrics: Record<string, number>;
  }) {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'HR Workforce Management System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Report', {
      views: [{ state: 'frozen', ySplit: 5 }],
    });

    const flatRows = params.rows.map((row) => this.flattenRowForCsv(row));
    const headers = this.collectCsvHeaders(flatRows);

    worksheet.mergeCells(1, 1, 1, Math.max(headers.length, 1));
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = params.title;
    titleCell.font = {
      bold: true,
      size: 16,
    };
    titleCell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
    };

    worksheet.mergeCells(2, 1, 2, Math.max(headers.length, 1));
    const subTitleCell = worksheet.getCell(2, 1);
    subTitleCell.value = `Report Code: ${params.reportCode} | Generated At: ${new Date().toISOString()}`;
    subTitleCell.font = {
      size: 10,
      color: { argb: 'FF64748B' },
    };

    const metricEntries = Object.entries(params.metrics ?? {});
    const metricText =
      metricEntries.length > 0
        ? metricEntries.map(([key, value]) => `${key}: ${value}`).join(' | ')
        : 'No metrics';

    worksheet.mergeCells(3, 1, 3, Math.max(headers.length, 1));
    const metricCell = worksheet.getCell(3, 1);
    metricCell.value = metricText;
    metricCell.font = {
      size: 10,
      color: { argb: 'FF334155' },
    };

    const headerRowNumber = 5;
    const headerRow = worksheet.getRow(headerRowNumber);

    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = this.excelHeaderText(header);
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    flatRows.forEach((row, rowIndex) => {
      const excelRow = worksheet.getRow(headerRowNumber + rowIndex + 1);

      headers.forEach((header, columnIndex) => {
        const value = row[header];
        const cell = excelRow.getCell(columnIndex + 1);

        cell.value = this.normalizeExcelCellValue(value);
        cell.alignment = {
          vertical: 'top',
          horizontal: this.isNumericLike(value) ? 'right' : 'left',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    worksheet.autoFilter = {
      from: {
        row: headerRowNumber,
        column: 1,
      },
      to: {
        row: headerRowNumber,
        column: Math.max(headers.length, 1),
      },
    };

    headers.forEach((header, index) => {
      const values = [
        this.excelHeaderText(header),
        ...flatRows.map((row) => String(row[header] ?? '')),
      ];

      const maxLength = values.reduce((max, value) => {
        return Math.max(max, value.length);
      }, 10);

      worksheet.getColumn(index + 1).width = Math.min(
        Math.max(maxLength + 2, 12),
        42,
      );
    });

    await workbook.xlsx.writeFile(params.fullPath);
  }

  private async writePdfFile(params: {
    fullPath: string;
    reportCode: ReportCode;
    title: string;
    rows: Record<string, unknown>[];
    metrics: Record<string, number>;
    company?: DocumentCompany | null;
  }) {
    const flatRows = params.rows.map((row) => this.flattenRowForCsv(row));
    const headers = this.collectCsvHeaders(flatRows);

    const html = this.buildReportPdfHtml({
      reportCode: params.reportCode,
      title: params.title,
      rows: flatRows,
      headers,
      metrics: params.metrics,
      company: params.company ?? null,
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: ['load', 'domcontentloaded'],
      });

      /*
       * รายงานยาวหลายหน้าได้ตามจำนวนพนักงาน จึงต้องมีเลขหน้า ซึ่งทำได้ทาง
       * footerTemplate เท่านั้น เหมือนเอกสาร payroll ตัวอื่น
       */
      await page.pdf({
        path: params.fullPath,
        format: 'A4',
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `
          <div style="width:100%;padding:0 10mm;font-size:8px;color:#6b7280;
                      font-family:'TH Sarabun New','Sarabun','Garuda',Tahoma,sans-serif;
                      display:flex;justify-content:space-between;">
            <span>${this.escapeHtml(params.title)}</span>
            <span>หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span>
          </div>`,
        margin: {
          top: '12mm',
          right: '10mm',
          bottom: '14mm',
          left: '10mm',
        },
      });
    } finally {
      await browser.close();
    }
  }

  private buildReportPdfHtml(params: {
    reportCode: ReportCode;
    title: string;
    rows: Record<string, unknown>[];
    headers: string[];
    metrics: Record<string, number>;
    company?: DocumentCompany | null;
  }) {
    const generatedAt = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
    });

    const metricItems = Object.entries(params.metrics ?? {});
    const metricHtml =
      metricItems.length > 0
        ? metricItems
            .map(
              ([key, value]) => `
              <div class="metric-card">
                <div class="metric-label">${this.escapeHtml(
                  this.excelHeaderText(key),
                )}</div>
                <div class="metric-value">${this.escapeHtml(
                  this.formatPdfValue(value),
                )}</div>
              </div>
            `,
            )
            .join('')
        : `<div class="muted">ไม่มีข้อมูลสรุป</div>`;

    const headerHtml = params.headers
      .map(
        (header) =>
          `<th class="${this.isDayColumn(header) ? 'day' : ''}">${this.escapeHtml(
            this.excelHeaderText(header),
          )}</th>`,
      )
      .join('');

    const bodyHtml =
      params.rows.length > 0
        ? params.rows
            .map((row) => {
              const cells = params.headers
                .map((header) => {
                  const text = this.formatPdfValue(row[header]);

                  /*
                   * ช่องปฏิทินเป็นอักษรตัวเดียว 31 ช่องเรียงกัน อ่านทีละช่องจนครบเดือน
                   * กว่าจะเห็นว่าใครขาดบ่อย ใส่สีพื้นแล้วรูปแบบการขาด/สายเด้งขึ้นมาเอง
                   */
                  if (this.isDayColumn(header)) {
                    return `<td class="day">${
                      text
                        ? `<span class="code ${this.dayCodeClass(text)}">${this.escapeHtml(text)}</span>`
                        : ''
                    }</td>`;
                  }

                  return `<td>${this.escapeHtml(text)}</td>`;
                })
                .join('');

              return `<tr>${cells}</tr>`;
            })
            .join('')
        : `<tr><td colspan="${Math.max(
            params.headers.length,
            1,
          )}" class="empty">ไม่มีข้อมูลรายงาน</td></tr>`;

    /*
     * งานที่ดูข้ามบริษัททั้งระบบจะไม่มีข้อมูลบริษัท ถ้าฝืนวาดหัวจดหมายจะได้กล่อง
     * โลโก้เปล่ากับชื่อบริษัทเป็นขีด ซึ่งดูเหมือนเอกสารเสีย จึงเปลี่ยนเป็นหัวเรียบ
     * ที่มีแต่ชื่อรายงานแทน
     */
    const headHtml = params.company
      ? renderLetterhead(
          params.company,
          `
        <div class="doc-title">
          <h1>${this.escapeHtml(params.title)}</h1>
          <div class="meta">ออกจากระบบเมื่อ ${this.escapeHtml(generatedAt)}</div>
        </div>
      `,
        )
      : `
        <div class="head-plain">
          <h1 style="margin:0;font-size:18px;font-weight:800">${this.escapeHtml(
            params.title,
          )}</h1>
          <div style="margin-top:3px;color:var(--ink-faint);font-size:9.6px">
            ทุกบริษัทในระบบ · ออกจากระบบเมื่อ ${this.escapeHtml(generatedAt)}
          </div>
        </div>`;

    const legendHtml = params.headers.some((header) =>
      this.isDayColumn(header),
    )
      ? `
        <div class="legend">
          <span class="legend-title">ความหมายของตัวอักษร</span>
          ${Object.entries(ReportsService.WORK_STATUS_LEGEND)
            .map(
              ([code, label]) =>
                `<span class="legend-item"><span class="code ${this.dayCodeClass(
                  code,
                )}">${this.escapeHtml(code)}</span>${this.escapeHtml(label)}</span>`,
            )
            .join('')}
          <span class="legend-note">หัวคอลัมน์ตัวเลขคือวันที่ของเดือน</span>
        </div>`
      : '';

    return `
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(params.title)}</title>
  <style>
    @page { size: A4 landscape; }

    ${DOCUMENT_BASE_CSS}

    body { font-size: 11px; }

    /* กรอบเต็มใบเหมือนเอกสาร payroll ตัวอื่น จะได้ดูเป็นกระดาษชุดเดียวกัน */
    .sheet { padding: 0; }

    .head-plain {
      padding: 0 14px 10px;
      text-align: center;
      border-bottom: 2px solid var(--ink);
    }

    /* หัวจดหมายบนกระดาษแนวนอน — ชื่อเอกสารเกาะขวา ไม่ปล่อยที่ว่างครึ่งหน้า */
    .letterhead { padding: 10px 14px; border-bottom: 2px solid var(--ink); }
    .logo { width: 56px; height: 56px; }
    .company-name { font-size: 17px; }

    .doc-title {
      flex: 0 0 auto;
      max-width: 46%;
      padding-left: 18px;
      text-align: right;
      border-left: 1px solid var(--rule-soft);
    }

    .doc-title h1 { margin: 0; font-size: 18px; font-weight: 800; line-height: 1.2; }
    .doc-title .subtitle { margin-top: 4px; font-size: 11.5px; font-weight: 700; }
    .doc-title .meta { margin-top: 3px; color: var(--ink-faint); font-size: 9.6px; }

    /* ---------- แถบตัวเลขสรุป ---------- */

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
      border-bottom: 1px solid var(--rule);
    }

    .table-wrap { padding: 0; }

    .metric-card {
      padding: 8px 12px 9px;
      border-right: 1px solid var(--rule-soft);
    }

    .metric-card:last-child { border-right: 0; }

    .metric-label {
      color: var(--ink-faint);
      font-size: 9.4px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .metric-value {
      margin-top: 2px;
      font-size: 16px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    /* ---------- ตารางข้อมูล ---------- */

    table { table-layout: fixed; }

    th {
      padding: 6px 7px;
      background: #f1f5f9;
      border-bottom: 1px solid var(--rule);
      border-right: 1px solid var(--rule-soft);
      color: var(--ink-soft);
      font-size: 9.6px;
      font-weight: 800;
      text-align: left;
      word-break: break-word;
    }

    td {
      padding: 4px 7px;
      border-bottom: 1px solid #f1f5f9;
      border-right: 1px solid var(--rule-soft);
      font-size: 10.4px;
      line-height: 1.35;
      vertical-align: middle;
      word-break: break-word;
    }

    tbody tr:nth-child(even) td { background: #fafcfe; }

    th:last-child, td:last-child { border-right: 0; }

    /* ---------- ช่องปฏิทินรายวัน ---------- */

    th.day, td.day {
      width: 19px;
      padding: 3px 1px;
      text-align: center;
    }

    .code {
      display: inline-block;
      min-width: 14px;
      padding: 1px 0;
      border-radius: 3px;
      font-weight: 800;
      font-size: 9px;
    }

    /*
     * โทนสีตั้งให้ "ปกติ" จางที่สุดและ "ขาดงาน" เข้มสุด เพราะสิ่งที่ต้องสะดุดตา
     * คือความผิดปกติ ไม่ใช่วันที่มาทำงานตามปกติซึ่งเป็นส่วนใหญ่ของตาราง
     */
    .code-p { background: #f1f5f9; color: #64748b; }
    .code-l { background: #fef3c7; color: #92400e; }
    .code-o { background: #e0f2fe; color: #075985; }
    .code-a { background: #fecdd3; color: #9f1239; }
    .code-m { background: #ede9fe; color: #5b21b6; }
    .code-h { background: #ffffff; color: #cbd5e1; }

    .legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 14px;
      padding: 7px 14px;
      border-top: 1px solid var(--rule-soft);
      font-size: 9.4px;
      color: var(--ink-soft);
    }

    .legend-title {
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--ink-faint);
    }

    .legend-item { display: inline-flex; align-items: center; gap: 4px; }
    .legend-note { color: var(--ink-faint); }

    .empty {
      padding: 24px;
      text-align: center;
      color: var(--ink-faint);
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${headHtml}

    <div class="metrics">${metricHtml}</div>

    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>

    ${legendHtml}

    <div class="footer">
      <div class="confidential">เอกสารลับ — ใช้ภายในองค์กรเท่านั้น</div>
      <div>ออกจากระบบเมื่อ ${this.escapeHtml(generatedAt)}</div>
    </div>
  </div>
</body>
</html>
`;
  }

  /* =========================================================
   CSV / PDF / XLSX HELPER
   ---------------------------------------------------------
   helper สำหรับ format ค่า, flatten row, สร้าง header และ escape ข้อมูล
========================================================= */

  private escapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private formatPdfValue(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    if (typeof value === 'number') {
      return value.toLocaleString('th-TH', {
        maximumFractionDigits: 2,
      });
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return String(value);
  }

  private excelHeaderText(header: string) {
    const map: Record<string, string> = {
      employeeCode: 'รหัสพนักงาน',
      employeeName: 'ชื่อพนักงาน',
      position: 'ตำแหน่ง',
      company: 'บริษัท',
      branch: 'สาขา',
      department: 'แผนก',
      payrollRunNo: 'เลขที่ Payroll Run',
      periodCode: 'รหัสงวด',
      periodName: 'ชื่องวด',
      periodEndDate: 'วันสิ้นสุดงวด',

      requestNo: 'เลขที่คำขอ',
      startDate: 'ตั้งแต่วันที่',
      endDate: 'ถึงวันที่',
      dayTypeText: 'ลักษณะการลา',
      totalDays: 'จำนวนวัน',
      leaveTypeName: 'ประเภทการลา',
      leavePaid: 'ลาแบบ',
      leaveStatus: 'สถานะใบลา',
      reason: 'เหตุผล',

      employeeTypeName: 'ประเภทพนักงาน',
      supervisorName: 'หัวหน้างาน',
      startDateOnly: 'วันเริ่มงาน',
      serviceLength: 'อายุงาน',
      probationEndDate: 'ครบทดลองงาน',
      employeeStatus: 'สถานะพนักงาน',
      email: 'อีเมล',
      phone: 'เบอร์โทร',

      /* ตัวเลขสรุปหัวรายงาน — ไม่ใส่แล้วจะขึ้นชื่อคีย์ดิบเป็นภาษาอังกฤษบนไฟล์ */
      employeeCount: 'จำนวนพนักงาน',
      totalRecords: 'จำนวนรายการ',

      presentDays: 'มาทำงาน (วัน)',
      lateDays: 'มาสาย (วัน)',
      leaveDaysCount: 'ลา (วัน)',
      absentDaysCount: 'ขาด (วัน)',
      /* รายงานสถานะการมาทำงานส่งคีย์สั้นมา ไม่ใช่แบบ ...Count ที่อยู่สองบรรทัดบน */
      leaveDays: 'ลา (วัน)',
      absentDays: 'ขาดงาน (วัน)',
      missingDays: 'ลืมลงเวลา (วัน)',
      holidayDays: 'วันหยุด (วัน)',

      logClock: 'เวลา',
      logTypeText: 'ประเภท',
      sessionText: 'รอบ',
      locationName: 'สถานที่',
      deviceName: 'เครื่อง',
      isOffsite: 'นอกสถานที่',
      logStatus: 'สถานะรายการ',

      workDate: 'วันที่',
      morningInAt: 'เข้าเช้า',
      afternoonInAt: 'เข้าบ่าย',
      checkOutAt: 'ออกงาน',
      lateMinutes: 'สาย (นาที)',
      earlyCheckoutMinutes: 'ออกก่อน (นาที)',
      otMinutes: 'OT (นาที)',
      dayStatus: 'สถานะวัน',

      logTime: 'เวลาลงเวลา',
      logType: 'ประเภทลงเวลา',
      channel: 'ช่องทาง',
      status: 'สถานะ',

      year: 'ปี',
      leaveType: 'ประเภทลา',
      entitledDays: 'สิทธิ',
      usedDays: 'ใช้แล้ว',
      pendingDays: 'รออนุมัติ',
      remainingDays: 'คงเหลือ',

      baseSalary: 'ฐานเงินเดือน',
      approvedOtCount: 'จำนวน OT',
      approvedOtHours: 'ชั่วโมง OT',
      estimatedOtAmount: 'ยอด OT ประมาณการ',
      estimatedGrossAmount: 'รายได้รวมประมาณการ',

      socialSecurityBase: 'ฐานประกันสังคม',
      employeeContribution: 'เงินสมทบลูกจ้าง',
      employerContribution: 'เงินสมทบนายจ้าง',

      latitude: 'ละติจูด',
      longitude: 'ลองจิจูด',
      accuracy: 'ความแม่นยำ',
      location: 'สถานที่',
      device: 'อุปกรณ์',

      note: 'หมายเหตุ',
    };

    /*
     * ช่องปฏิทินรายวัน (d1–d31) ใช้เลขวันที่ล้วนเป็นหัวคอลัมน์
     * ใส่คำนำหน้าจะดันความกว้างจนตารางล้นหน้ากระดาษ ส่วนความหมายของรหัสในช่อง
     * มีคำอธิบายกำกับไว้ท้ายไฟล์อยู่แล้ว
     */
    const dayMatch = /^d(\d{1,2})$/.exec(header);
    if (dayMatch) return dayMatch[1];

    return map[header] ?? header;
  }

  private normalizeExcelCellValue(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return String(value);
  }

  private isNumericLike(value: unknown) {
    if (typeof value === 'number') {
      return true;
    }

    if (typeof value !== 'string') {
      return false;
    }

    if (value.trim() === '') {
      return false;
    }

    return Number.isFinite(Number(value));
  }

  private toCsv(rows: Record<string, unknown>[]) {
    const flatRows = rows.map((row) => this.flattenRowForCsv(row));

    if (flatRows.length === 0) {
      return '\uFEFF';
    }

    const headers = this.collectCsvHeaders(flatRows);

    const lines = [
      headers.map((header) => this.escapeCsvValue(header)).join(','),
      ...flatRows.map((row) =>
        headers
          .map((header) => this.escapeCsvValue(row[header] ?? ''))
          .join(','),
      ),
    ];

    return `\uFEFF${lines.join('\n')}`;
  }

  private flattenRowForCsv(row: Record<string, unknown>) {
    const employee = row.employee as
      | {
          id?: string;
          employeeCode?: string;
          firstName?: string | null;
          lastName?: string | null;
          displayName?: string | null;
          position?: string | null;
        }
      | null
      | undefined;

    const company = row.company as
      | {
          id?: string;
          code?: string;
          nameTh?: string;
          nameEn?: string | null;
        }
      | null
      | undefined;

    const branch = row.branch as
      | {
          id?: string;
          code?: string;
          nameTh?: string;
          nameEn?: string | null;
        }
      | null
      | undefined;

    const department = row.department as
      | {
          id?: string;
          code?: string;
          nameTh?: string;
          nameEn?: string | null;
        }
      | null
      | undefined;

    const leaveType = row.leaveType as
      | {
          id?: string;
          code?: string;
          nameTh?: string;
          nameEn?: string | null;
        }
      | null
      | undefined;

    const location = row.location as
      | {
          id?: string;
          code?: string;
          nameTh?: string;
          nameEn?: string | null;
        }
      | null
      | undefined;

    const device = row.device as
      | {
          id?: string;
          code?: string;
          name?: string;
        }
      | null
      | undefined;

    const directEmployeeName =
      typeof row.employeeName === 'string' ? row.employeeName : '';

    const directEmployeeCode =
      typeof row.employeeCode === 'string' ? row.employeeCode : '';

    const directPosition = typeof row.position === 'string' ? row.position : '';

    const employeeName =
      directEmployeeName ||
      employee?.displayName ||
      [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') ||
      '-';

    return {
      employeeCode: directEmployeeCode || employee?.employeeCode || '-',
      employeeName,
      position: directPosition || employee?.position || '-',

      /*
       * ใส่ช่องบริษัท/สาขาเฉพาะตอนมีค่าจริง
       *
       * ของเดิมใส่ '-' เสมอ ทำให้คอลัมน์โผล่ในไฟล์ทั้งที่ไม่มีข้อมูลอะไรเลย และ
       * ทำให้ตัดคอลัมน์ที่ซ้ำกับหัวจดหมายออกไม่ได้ — ลบจากแถวไปแล้วตรงนี้ก็เติม
       * '-' กลับมาให้ใหม่ กลายเป็นคอลัมน์ขีดกลางเปล่า ๆ กินความกว้างไปเฉย ๆ
       */
      ...(company?.nameTh || row.companyName
        ? { company: company?.nameTh ?? (row.companyName as string) }
        : {}),
      ...(branch?.nameTh || row.branchName
        ? { branch: branch?.nameTh ?? (row.branchName as string) }
        : {}),
      department: department?.nameTh || (row.departmentName as string) || '-',
      payrollRunNo: row.payrollRunNo ?? '',
      periodCode: row.periodCode ?? '',
      periodName: row.periodName ?? '',
      periodEndDate: this.formatCsvDate(row.periodEndDate),

      workDate: this.formatCsvDate(row.workDate),
      logTime: this.formatCsvDate(row.logTime),
      logType: row.logType ?? '',
      channel: row.channel ?? '',
      status: row.status ?? '',

      // รายงานสถานะการมาทำงาน (ปฏิทิน) — d1..d31 ใส่ทีหลังแบบวนลูป
      presentDays: row.presentDays ?? '',
      lateDays: row.lateDays ?? '',
      leaveDaysCount: row.leaveDays ?? '',
      absentDaysCount: row.absentDays ?? '',
      missingDays: row.missingDays ?? '',
      holidayDays: row.holidayDays ?? '',

      // รายงานการลงเวลา
      logClock: row.logClock ?? '',
      logTypeText: row.logTypeText ?? '',
      sessionText: row.sessionText ?? '',
      locationName: row.locationName ?? '',
      deviceName: row.deviceName ?? '',
      isOffsite: row.isOffsite ?? '',
      logStatus: row.logStatus ?? '',

      // รายงานรายการใบลา
      requestNo: row.requestNo ?? '',
      leaveTypeName: row.leaveTypeName ?? '',
      leavePaid: row.leavePaid ?? '',
      startDate: this.formatCsvDateOnly(row.startDate),
      endDate: this.formatCsvDateOnly(row.endDate),
      dayTypeText: row.dayTypeText ?? '',
      totalDays: row.totalDays ?? '',
      reason: row.reason ?? '',
      leaveStatus: row.leaveStatus ?? '',

      // รายงานทะเบียนพนักงาน
      employeeTypeName: row.employeeTypeName ?? '',
      supervisorName: row.supervisorName ?? '',
      startDateOnly: this.formatCsvDateOnly(row.startDate),
      serviceLength: row.serviceLength ?? '',
      probationEndDate: this.formatCsvDateOnly(row.probationEndDate),
      employeeStatus: row.employeeStatus ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',

      // บันทึกเวลารายวัน — เวลาเป็น HH:mm อยู่แล้วจาก service ไม่ต้องแปลงซ้ำ
      morningInAt: row.morningInAt ?? '',
      afternoonInAt: row.afternoonInAt ?? '',
      checkOutAt: row.checkOutAt ?? '',
      lateMinutes: row.lateMinutes ?? '',
      earlyCheckoutMinutes: row.earlyCheckoutMinutes ?? '',
      otMinutes: row.otMinutes ?? '',
      dayStatus: row.dayStatus ?? '',

      year: row.year ?? '',
      leaveType: leaveType?.nameTh || '',
      entitledDays: row.entitledDays ?? '',
      usedDays: row.usedDays ?? '',
      pendingDays: row.pendingDays ?? '',
      remainingDays: row.remainingDays ?? '',

      baseSalary: row.baseSalary ?? '',
      approvedOtCount: row.approvedOtCount ?? '',
      approvedOtHours: row.approvedOtHours ?? '',
      estimatedOtAmount: row.estimatedOtAmount ?? '',
      estimatedGrossAmount: row.estimatedGrossAmount ?? '',

      socialSecurityBase: row.socialSecurityBase ?? '',
      employeeContribution: row.employeeContribution ?? '',
      employerContribution: row.employerContribution ?? '',

      latitude: row.latitude ?? '',
      longitude: row.longitude ?? '',
      accuracy: row.accuracy ?? '',
      location: location?.nameTh || '',
      device: device?.name || device?.code || '',

      note: row.note ?? '',

      // ช่องปฏิทินรายวันของรายงานสถานะการมาทำงาน
      ...Object.fromEntries(
        Array.from({ length: 31 }, (_, index) => [
          `d${index + 1}`,
          row[`d${index + 1}`] ?? '',
        ]),
      ),
    };
  }

  private collectCsvHeaders(rows: Record<string, unknown>[]) {
    const preferred = [
      'employeeCode',
      'employeeName',
      'position',
      'company',
      'branch',
      'department',
      'payrollRunNo',
      'periodCode',
      'periodName',
      'periodEndDate',

      'requestNo',
      'startDate',
      'endDate',
      'dayTypeText',
      'totalDays',
      'leaveTypeName',
      'leavePaid',
      'leaveStatus',
      'reason',

      'employeeTypeName',
      'supervisorName',
      'startDateOnly',
      'serviceLength',
      'probationEndDate',
      'employeeStatus',
      'email',
      'phone',

      ...Array.from({ length: 31 }, (_, index) => `d${index + 1}`),
      'presentDays',
      'lateDays',
      'leaveDaysCount',
      'absentDaysCount',
      'missingDays',
      'holidayDays',

      'workDate',
      'logClock',
      'logTypeText',
      'sessionText',
      'locationName',
      'deviceName',
      'isOffsite',
      'logStatus',

      'morningInAt',
      'afternoonInAt',
      'checkOutAt',
      'lateMinutes',
      'earlyCheckoutMinutes',
      'otMinutes',
      'dayStatus',

      'logTime',
      'logType',
      'channel',
      'status',

      'year',
      'leaveType',
      'entitledDays',
      'usedDays',
      'pendingDays',
      'remainingDays',

      'baseSalary',
      'approvedOtCount',
      'approvedOtHours',
      'estimatedOtAmount',
      'estimatedGrossAmount',

      'socialSecurityBase',
      'employeeContribution',
      'employerContribution',

      'latitude',
      'longitude',
      'accuracy',
      'location',
      'device',

      'note',
    ];

    const existingHeaders = new Set<string>();

    rows.forEach((row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          existingHeaders.add(key);
        }
      });
    });

    return preferred.filter((header) => existingHeaders.has(header));
  }

  /** วันที่ในไฟล์ export — YYYY-MM-DD ตามเขตเวลาไทย ให้ Excel เรียงได้ */
  private formatCsvDateOnly(value: unknown) {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  }

  /** เวลาในไฟล์ export — เอาแค่ HH:mm ตามเขตเวลาไทย */
  private formatCsvTime(value: unknown) {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok',
    });
  }

  private formatCsvDate(value: unknown) {
    if (!value) return '';

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string') {
      return value;
    }

    return String(value);
  }

  private escapeCsvValue(value: unknown) {
    const text = String(value ?? '');

    if (text.includes('"') || text.includes(',') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  /* =========================================================
   INCLUDE BUILDER
   ---------------------------------------------------------
   รวม Prisma include/select ที่ใช้ซ้ำใน query หลัก
========================================================= */

  private reportJobInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      cancelledBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      exportFiles: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
      },
      logs: {
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 10,
      },
    };
  }

  private exportFileInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      reportJob: {
        select: {
          id: true,
          reportCode: true,
          name: true,
          status: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      downloadedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    };
  }

  private reportLogInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      reportJob: {
        select: {
          id: true,
          reportCode: true,
          name: true,
          status: true,
        },
      },
      exportFile: {
        select: {
          id: true,
          title: true,
          fileName: true,
          format: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    };
  }
}
