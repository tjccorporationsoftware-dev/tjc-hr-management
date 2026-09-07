import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';

/**
 * ESS เป็น self-service — ยืนยันความเป็นเจ้าของ record ด้วย resolveMyEmployee แล้ว
 * จึงส่ง scope แบบ GLOBAL เพื่อข้ามการตรวจ scope ซ้ำใน service ปลายทาง
 */
const SELF_SERVICE_SCOPE: TenantScope = {
  level: 'GLOBAL',
  companyId: null,
  branchId: null,
};

import { EssListQueryDto } from './dto/ess-list-query.dto';
import { EssYearQueryDto } from './dto/ess-year-query.dto';

import { CreateLeaveRequestDto } from '../leaves/dto/create-leave-request.dto';
import { LeaveRequestActionDto } from '../leaves/dto/leave-request-action.dto';
import { UpdateLeaveRequestDto } from '../leaves/dto/update-leave-request.dto';
import { UploadLeaveAttachmentDto } from '../leaves/dto/upload-leave-attachment.dto';
import { LeaveRequestsService } from '../leaves/leave-requests.service';
import { LeaveAttachmentService } from '../leaves/services/leave-attachment.service';

import { CreateOvertimeRequestDto } from '../overtime/dto/create-overtime-request.dto';
import { OvertimeRequestActionDto } from '../overtime/dto/overtime-request-action.dto';
import { UpdateOvertimeRequestDto } from '../overtime/dto/update-overtime-request.dto';
import { UploadOvertimeAttachmentDto } from '../overtime/dto/upload-overtime-attachment.dto';
import { OvertimeRequestsService } from '../overtime/overtime-requests.service';

import { CreateTimeAdjustRequestDto } from '../time-adjust/dto/create-time-adjust-request.dto';
import { TimeAdjustRequestActionDto } from '../time-adjust/dto/time-adjust-request-action.dto';
import { UpdateTimeAdjustRequestDto } from '../time-adjust/dto/update-time-adjust-request.dto';
import { UploadTimeAdjustAttachmentDto } from '../time-adjust/dto/upload-time-adjust-attachment.dto';
import { TimeAdjustRequestsService } from '../time-adjust/time-adjust-requests.service';

type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

@Injectable()
export class EssService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly leaveAttachmentService: LeaveAttachmentService,
    private readonly overtimeRequestsService: OvertimeRequestsService,
    private readonly timeAdjustRequestsService: TimeAdjustRequestsService,
  ) {}

  async getMe(currentUser: CurrentUserLike) {
    const employee = await this.resolveMyEmployee(currentUser);

    return {
      user: {
        id: this.getActorId(currentUser),
        email: currentUser.email,
        displayName: currentUser.displayName,
      },
      employee,
    };
  }

  async getDashboard(currentUser: CurrentUserLike) {
    const employee = await this.resolveMyEmployee(currentUser);
    const today = this.toDateOnly(new Date());
    const currentYear = new Date().getFullYear();

    const [
      todayAttendance,
      leaveBalances,
      pendingLeaveCount,
      pendingOvertimeCount,
      pendingTimeAdjustCount,
      recentLeaveRequests,
      recentOvertimeRequests,
      recentTimeAdjustRequests,
    ] = await Promise.all([
      this.prisma.attendanceLog.findMany({
        where: {
          employeeId: employee.id,
          deletedAt: null,
          workDate: today,
        },
        orderBy: {
          logTime: 'asc',
        },
        include: this.attendanceInclude(),
      } as any),

      this.prisma.leaveBalance.findMany({
        where: {
          employeeId: employee.id,
          year: currentYear,
        },
        include: {
          leaveType: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
        },
        orderBy: {
          leaveType: {
            code: 'asc',
          },
        },
      } as any),

      this.prisma.leaveRequest.count({
        where: {
          employeeId: employee.id,
          deletedAt: null,
          status: {
            in: ['DRAFT', 'SUBMITTED'],
          } as any,
        },
      } as any),

      this.prisma.overtimeRequest.count({
        where: {
          employeeId: employee.id,
          deletedAt: null,
          status: {
            in: ['DRAFT', 'SUBMITTED'],
          } as any,
        },
      } as any),

      this.prisma.timeAdjustRequest.count({
        where: {
          employeeId: employee.id,
          deletedAt: null,
          status: {
            in: ['DRAFT', 'SUBMITTED'],
          } as any,
        },
      } as any),

      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: employee.id,
          deletedAt: null,
        },
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        include: this.leaveRequestInclude(),
      } as any),

      this.prisma.overtimeRequest.findMany({
        where: {
          employeeId: employee.id,
          deletedAt: null,
        },
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        include: this.overtimeRequestInclude(),
      } as any),

      this.prisma.timeAdjustRequest.findMany({
        where: {
          employeeId: employee.id,
          deletedAt: null,
        },
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        include: this.timeAdjustRequestInclude(),
      } as any),
    ]);

    const leaveSummary = leaveBalances.map((item: any) => {
      const entitlementDays = this.toNumber(
        item.entitlementDays ?? item.entitledDays ?? item.totalDays,
      );
      const carriedForwardDays = this.toNumber(item.carriedForwardDays);
      const adjustedDays = this.toNumber(item.adjustedDays);
      const usedDays = this.toNumber(item.usedDays);
      const pendingDays = this.toNumber(item.pendingDays);
      const remainingDays =
        entitlementDays +
        carriedForwardDays +
        adjustedDays -
        usedDays -
        pendingDays;

      return {
        id: item.id,
        year: item.year,
        leaveType: item.leaveType,
        entitlementDays,
        carriedForwardDays,
        adjustedDays,
        usedDays,
        pendingDays,
        remainingDays,
      };
    });

    return {
      employee,
      metrics: {
        todayAttendanceCount: todayAttendance.length,
        leaveTypeCount: leaveSummary.length,
        pendingLeaveCount,
        pendingOvertimeCount,
        pendingTimeAdjustCount,
      },
      todayAttendance,
      leaveSummary,
      recentLeaveRequests,
      recentOvertimeRequests,
      recentTimeAdjustRequests,
    };
  }

  async getMyAttendance(currentUser: CurrentUserLike, query: EssListQueryDto) {
    const employee = await this.resolveMyEmployee(currentUser);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AttendanceLogWhereInput = {
      employeeId: employee.id,
      deletedAt: null,
      ...(query.dateFrom || query.dateTo
        ? {
            workDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
            },
          }
        : {}),
    } as any;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ workDate: 'desc' }, { logTime: 'desc' }],
        include: this.attendanceInclude(),
      } as any),
      this.prisma.attendanceLog.count({ where } as any),
    ]);

    return this.withPagination(items, page, pageSize, total);
  }

  async getMyLeaveBalances(
    currentUser: CurrentUserLike,
    query: EssYearQueryDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);
    const year = query.year ?? new Date().getFullYear();

    const items = await this.prisma.leaveBalance.findMany({
      where: {
        employeeId: employee.id,
        year,
      },
      include: {
        leaveType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
      },
      orderBy: {
        leaveType: {
          code: 'asc',
        },
      },
    } as any);

    return items.map((item: any) => {
      const entitlementDays = this.toNumber(
        item.entitlementDays ?? item.entitledDays ?? item.totalDays,
      );
      const carriedForwardDays = this.toNumber(item.carriedForwardDays);
      const adjustedDays = this.toNumber(item.adjustedDays);
      const usedDays = this.toNumber(item.usedDays);
      const pendingDays = this.toNumber(item.pendingDays);
      const remainingDays =
        entitlementDays +
        carriedForwardDays +
        adjustedDays -
        usedDays -
        pendingDays;

      return {
        id: item.id,
        year: item.year,
        leaveType: item.leaveType,
        entitlementDays,
        carriedForwardDays,
        adjustedDays,
        usedDays,
        pendingDays,
        remainingDays,
        note: item.note ?? null,
      };
    });
  }

  async getMyLeaveRequests(
    currentUser: CurrentUserLike,
    query: EssListQueryDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const search = query.search?.trim();
    const startDateFilter = this.buildEssLeaveStartDateFilter(query);

    const where: Prisma.LeaveRequestWhereInput = {
      employeeId: employee.id,
      deletedAt: null,
      ...(startDateFilter ? { startDate: startDateFilter } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
      ...(search
        ? {
            OR: [
              { requestNo: { contains: search, mode: 'insensitive' } },
              { reason: { contains: search, mode: 'insensitive' } },
              { retroactiveReason: { contains: search, mode: 'insensitive' } },
              { contactInfo: { contains: search, mode: 'insensitive' } },
              { note: { contains: search, mode: 'insensitive' } },
              {
                leaveType: {
                  is: {
                    OR: [
                      { code: { contains: search, mode: 'insensitive' } },
                      { nameTh: { contains: search, mode: 'insensitive' } },
                      { nameEn: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    } as any;

    const [items, total, summary] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
        include: this.leaveRequestInclude(),
      } as any),
      this.prisma.leaveRequest.count({ where } as any),
      this.buildEssLeaveRequestSummary(where),
    ]);

    return this.withPagination(items, page, pageSize, total, summary);
  }

  async getMyOvertimeRequests(
    currentUser: CurrentUserLike,
    query: EssListQueryDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const workDateFilter = this.buildEssOvertimeWorkDateFilter(query);

    const where: Prisma.OvertimeRequestWhereInput = {
      employeeId: employee.id,
      deletedAt: null,
      ...(workDateFilter ? { workDate: workDateFilter } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.workType ? { workType: query.workType as any } : {}),
      ...(query.search
        ? {
            OR: [
              { requestNo: { contains: query.search, mode: 'insensitive' as const } },
              { reason: { contains: query.search, mode: 'insensitive' as const } },
              { note: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    } as any;

    const [items, total, summary] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
        include: this.overtimeRequestInclude(),
      } as any),
      this.prisma.overtimeRequest.count({ where } as any),
      this.buildEssOvertimeRequestSummary(where),
    ]);

    return this.withPagination(items, page, pageSize, total, summary);
  }

  async getMyTimeAdjustRequests(
    currentUser: CurrentUserLike,
    query: EssListQueryDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const requestedLogTimeFilter = this.buildEssTimeAdjustRequestedLogTimeFilter(query);
    const searchText = query.search?.trim();

    const where: Prisma.TimeAdjustRequestWhereInput = {
      employeeId: employee.id,
      deletedAt: null,
      ...(requestedLogTimeFilter
        ? {
            requestedLogTime: requestedLogTimeFilter,
          }
        : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.adjustType ? { adjustType: query.adjustType } : {}),
      ...(query.targetLogType ? { targetLogType: query.targetLogType as any } : {}),
      ...(searchText
        ? {
            OR: [
              { requestNo: { contains: searchText, mode: 'insensitive' } },
              { reason: { contains: searchText, mode: 'insensitive' } },
              { note: { contains: searchText, mode: 'insensitive' } },
            ],
          }
        : {}),
    } as any;

    const [items, total, summary] = await Promise.all([
      this.prisma.timeAdjustRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
        include: this.timeAdjustRequestInclude(),
      } as any),
      this.prisma.timeAdjustRequest.count({ where } as any),
      this.buildEssTimeAdjustRequestSummary(where),
    ]);

    return this.withPagination(items, page, pageSize, total, summary);
  }

  async createMyLeaveRequest(
    currentUser: CurrentUserLike,
    dto: CreateLeaveRequestDto,
  ) {
    await this.resolveMyEmployee(currentUser);

    const { employeeId: _employeeId, ...safeDto } = dto;

    return this.leaveRequestsService.create(
      safeDto as CreateLeaveRequestDto,
      currentUser,
      SELF_SERVICE_SCOPE,
    );
  }

  async submitMyLeaveRequest(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureLeaveRequestBelongsToEmployee(id, employee.id);

    return this.leaveRequestsService.submit(id, currentUser);
  }

  async cancelMyLeaveRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: LeaveRequestActionDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);
    const request = await this.ensureLeaveRequestBelongsToEmployee(id, employee.id);

    if (request.status === 'SUBMITTED') {
      return this.leaveRequestsService.withdrawSubmittedToDraft(
        id,
        dto,
        currentUser,
      );
    }

    return this.leaveRequestsService.cancel(id, dto, currentUser);
  }

  async updateMyLeaveRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: UpdateLeaveRequestDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);
    const request = await this.ensureLeaveRequestBelongsToEmployee(id, employee.id);

    this.ensureLeaveRequestCanBeEdited(request.status, 'แก้ไข');

    return this.leaveRequestsService.update(id, dto, SELF_SERVICE_SCOPE);
  }

  async deleteMyLeaveRequest(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);
    const request = await this.ensureLeaveRequestBelongsToEmployee(id, employee.id);

    this.ensureLeaveRequestCanBeEdited(request.status, 'ลบ');

    await this.prisma.leaveRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    } as any);

    return { id, deleted: true };
  }

  async findMyLeaveAttachments(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureLeaveRequestBelongsToEmployee(id, employee.id);

    // ตรวจความเป็นเจ้าของใบลาไปแล้วข้างบน (เข้มกว่าการกรองระดับบริษัท)
    // ส่ง scope ของบริษัทตัวเองต่อไปเพื่อให้ service ชั้นล่างกรองซ้ำอีกชั้น
    return this.leaveAttachmentService.findAttachments(
      id,
      SELF_SERVICE_SCOPE,
    );
  }

  async uploadMyLeaveAttachment(
    currentUser: CurrentUserLike,
    id: string,
    dto: UploadLeaveAttachmentDto,
    file: Express.Multer.File,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureLeaveRequestBelongsToEmployee(id, employee.id);

    return this.leaveAttachmentService.uploadAttachment(
      id,
      dto,
      file,
      SELF_SERVICE_SCOPE,
      this.getActorId(currentUser),
    );
  }

  async getMyLeaveAttachmentFileForDownload(
    currentUser: CurrentUserLike,
    id: string,
    attachmentId: string,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureLeaveRequestBelongsToEmployee(id, employee.id);

    return this.leaveAttachmentService.getAttachmentFileForDownload(
      id,
      attachmentId,
      SELF_SERVICE_SCOPE,
    );
  }

  async removeMyLeaveAttachment(
    currentUser: CurrentUserLike,
    id: string,
    attachmentId: string,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureLeaveRequestBelongsToEmployee(id, employee.id);

    return this.leaveAttachmentService.removeAttachment(
      id,
      attachmentId,
      SELF_SERVICE_SCOPE,
    );
  }

  /** ระบบจับประเภทวันจากปฏิทินวันหยุดให้ ฟอร์ม ESS แค่เอามาแสดง */
  async getMyOvertimeDayType(currentUser: CurrentUserLike, workDate: string) {
    await this.resolveMyEmployee(currentUser);

    return this.overtimeRequestsService.previewDayType(
      { workDate },
      currentUser,
      SELF_SERVICE_SCOPE,
    );
  }

  async createMyOvertimeRequest(
    currentUser: CurrentUserLike,
    dto: CreateOvertimeRequestDto,
  ) {
    await this.resolveMyEmployee(currentUser);

    const { employeeId: _employeeId, ...safeDto } = dto;

    return this.overtimeRequestsService.create(
      safeDto as CreateOvertimeRequestDto,
      currentUser,
      SELF_SERVICE_SCOPE,
    );
  }

  async submitMyOvertimeRequest(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureOvertimeRequestBelongsToEmployee(id, employee.id);

    return this.overtimeRequestsService.submit(id, currentUser);
  }

  async cancelMyOvertimeRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: OvertimeRequestActionDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);
    const request = await this.ensureOvertimeRequestBelongsToEmployee(id, employee.id);

    if (request.status === 'SUBMITTED') {
      return this.overtimeRequestsService.withdrawSubmittedToDraft(
        id,
        dto,
        currentUser,
      );
    }

    return this.overtimeRequestsService.cancel(id, dto, currentUser);
  }

  async updateMyOvertimeRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: UpdateOvertimeRequestDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);
    const request = await this.ensureOvertimeRequestBelongsToEmployee(id, employee.id);

    if (this.isApprovalLockedStatus(request.status)) {
      throw new BadRequestException('รายการที่อนุมัติแล้วไม่สามารถแก้ไขได้');
    }

    return this.overtimeRequestsService.update(id, dto, SELF_SERVICE_SCOPE);
  }

  async deleteMyOvertimeRequest(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);
    const request = await this.ensureOvertimeRequestBelongsToEmployee(id, employee.id);

    if (this.isApprovalLockedStatus(request.status)) {
      throw new BadRequestException('รายการที่อนุมัติแล้วไม่สามารถลบได้');
    }

    await this.prisma.overtimeRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    } as any);

    return { id, deleted: true };
  }

  async createMyTimeAdjustRequest(
    currentUser: CurrentUserLike,
    dto: CreateTimeAdjustRequestDto,
  ) {
    await this.resolveMyEmployee(currentUser);

    const { employeeId: _employeeId, ...safeDto } = dto;

    return this.timeAdjustRequestsService.create(
      safeDto as CreateTimeAdjustRequestDto,
      currentUser,
      SELF_SERVICE_SCOPE,
    );
  }

  async submitMyTimeAdjustRequest(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureTimeAdjustRequestBelongsToEmployee(id, employee.id);

    return this.timeAdjustRequestsService.submit(id, currentUser);
  }

  async cancelMyTimeAdjustRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: TimeAdjustRequestActionDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    const request = await this.ensureTimeAdjustRequestBelongsToEmployee(id, employee.id);

    if (request.status === 'SUBMITTED') {
      return this.timeAdjustRequestsService.withdrawSubmittedToDraft(
        id,
        {
          ...dto,
          reason:
            dto.reason?.trim() || 'ยกเลิกการส่งเพื่อแก้ไขและส่งใหม่',
        },
        currentUser,
      );
    }

    return this.timeAdjustRequestsService.cancel(id, dto, currentUser);
  }

  async updateMyTimeAdjustRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: UpdateTimeAdjustRequestDto,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);
    const request = await this.ensureTimeAdjustRequestBelongsToEmployee(id, employee.id);

    if (this.isApprovalLockedStatus(request.status)) {
      throw new BadRequestException('รายการที่อนุมัติแล้วไม่สามารถแก้ไขได้');
    }

    return this.timeAdjustRequestsService.update(id, dto, SELF_SERVICE_SCOPE);
  }

  async deleteMyTimeAdjustRequest(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);
    const request = await this.ensureTimeAdjustRequestBelongsToEmployee(id, employee.id);

    if (this.isApprovalLockedStatus(request.status)) {
      throw new BadRequestException('รายการที่อนุมัติแล้วไม่สามารถลบได้');
    }

    await this.prisma.timeAdjustRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    } as any);

    return { id, deleted: true };
  }

  async findMyOvertimeAttachments(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureOvertimeRequestBelongsToEmployee(id, employee.id);

    // ตรวจความเป็นเจ้าของคำขอไปแล้วข้างบน (เข้มกว่าการกรองระดับบริษัท)
    return this.overtimeRequestsService.findAttachments(
      id,
      SELF_SERVICE_SCOPE,
    );
  }

  async uploadMyOvertimeAttachment(
    currentUser: CurrentUserLike,
    id: string,
    dto: UploadOvertimeAttachmentDto,
    file: Express.Multer.File,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureOvertimeRequestBelongsToEmployee(id, employee.id);

    return this.overtimeRequestsService.uploadAttachment(
      id,
      dto,
      file,
      SELF_SERVICE_SCOPE,
      this.getActorId(currentUser),
    );
  }

  async getMyOvertimeAttachmentFileForDownload(
    currentUser: CurrentUserLike,
    id: string,
    attachmentId: string,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureOvertimeRequestBelongsToEmployee(id, employee.id);

    return this.overtimeRequestsService.getAttachmentFileForDownload(
      id,
      attachmentId,
      SELF_SERVICE_SCOPE,
    );
  }

  async removeMyOvertimeAttachment(
    currentUser: CurrentUserLike,
    id: string,
    attachmentId: string,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureOvertimeRequestBelongsToEmployee(id, employee.id);

    return this.overtimeRequestsService.removeAttachment(
      id,
      attachmentId,
      SELF_SERVICE_SCOPE,
    );
  }

  async findMyTimeAdjustAttachments(currentUser: CurrentUserLike, id: string) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureTimeAdjustRequestBelongsToEmployee(id, employee.id);

    // ตรวจความเป็นเจ้าของคำขอไปแล้วข้างบน (เข้มกว่าการกรองระดับบริษัท)
    return this.timeAdjustRequestsService.findAttachments(
      id,
      SELF_SERVICE_SCOPE,
    );
  }

  async uploadMyTimeAdjustAttachment(
    currentUser: CurrentUserLike,
    id: string,
    dto: UploadTimeAdjustAttachmentDto,
    file: Express.Multer.File,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureTimeAdjustRequestBelongsToEmployee(id, employee.id);

    return this.timeAdjustRequestsService.uploadAttachment(
      id,
      dto,
      file,
      SELF_SERVICE_SCOPE,
      this.getActorId(currentUser),
    );
  }

  async getMyTimeAdjustAttachmentFileForDownload(
    currentUser: CurrentUserLike,
    id: string,
    attachmentId: string,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureTimeAdjustRequestBelongsToEmployee(id, employee.id);

    return this.timeAdjustRequestsService.getAttachmentFileForDownload(
      id,
      attachmentId,
      SELF_SERVICE_SCOPE,
    );
  }

  async removeMyTimeAdjustAttachment(
    currentUser: CurrentUserLike,
    id: string,
    attachmentId: string,
  ) {
    const employee = await this.resolveMyEmployee(currentUser);

    await this.ensureTimeAdjustRequestBelongsToEmployee(id, employee.id);

    return this.timeAdjustRequestsService.removeAttachment(
      id,
      attachmentId,
      SELF_SERVICE_SCOPE,
    );
  }

  private async resolveMyEmployee(currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        division: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        employeeType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
        profile: true,
      },
    } as any);

    if (!employee) {
      throw new NotFoundException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถใช้งาน ESS ได้',
      );
    }

    return employee;
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException('ไม่พบข้อมูลผู้ใช้งานปัจจุบัน');
    }

    return actorId;
  }

  private attendanceInclude() {
    return {
      location: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
          type: true,
          address: true,
          radiusMeters: true,
        },
      },
      device: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          serialNo: true,
          ipAddress: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      editLogs: {
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 3,
        select: {
          id: true,
          action: true,
          oldLogTime: true,
          newLogTime: true,
          oldStatus: true,
          newStatus: true,
          oldChannel: true,
          newChannel: true,
          reason: true,
          note: true,
          createdAt: true,
          editedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      timeAdjustOriginalRequests: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 3,
        select: {
          id: true,
          requestNo: true,
          adjustType: true,
          targetLogType: true,
          originalLogTime: true,
          requestedLogTime: true,
          reason: true,
          note: true,
          status: true,
          submittedAt: true,
          approvedAt: true,
          rejectedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      timeAdjustAppliedRequests: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 3,
        select: {
          id: true,
          requestNo: true,
          adjustType: true,
          targetLogType: true,
          originalLogTime: true,
          requestedLogTime: true,
          reason: true,
          note: true,
          status: true,
          submittedAt: true,
          approvedAt: true,
          rejectedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    };
  }

  private leaveRequestInclude() {
    return {
      leaveType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
          description: true,
          isPaid: true,
          requiresAttachment: true,
          allowHalfDay: true,
          allowHourly: true,
          deductQuota: true,
          affectAttendance: true,
          affectPayroll: true,
          minLeaveUnitMinutes: true,
          maxLeaveDaysPerRequest: true,
          allowBackdated: true,
          maxBackdatedDays: true,
          backdatedRequiresAttachment: true,
          backdatedRequiresHrApproval: true,
          allowNegativeBalance: true,
          negativeBalanceMode: true,
          includeHoliday: true,
          includeWeekend: true,
          attachmentRequiredAfterDays: true,
        },
      },
      approvalSteps: {
        orderBy: {
          stepNo: 'asc' as const,
        },
        select: {
          id: true,
          stepNo: true,
          nameTh: true,
          description: true,
          approverType: true,
          roleCode: true,
          status: true,
          reason: true,
          note: true,
          actedAt: true,
          createdAt: true,
          updatedAt: true,
          expectedApprover: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          expectedEmployee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
            },
          },
          position: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
          actedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      approvalLogs: {
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 5,
        include: {
          approvedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      attachments: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
    };
  }

  private overtimeRequestInclude() {
    return {
      approvalSteps: {
        orderBy: {
          stepNo: 'asc' as const,
        },
        select: {
          id: true,
          stepNo: true,
          nameTh: true,
          description: true,
          approverType: true,
          roleCode: true,
          status: true,
          reason: true,
          note: true,
          actedAt: true,
          createdAt: true,
          updatedAt: true,
          expectedApprover: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          expectedEmployee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
            },
          },
          position: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
          actedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      approvalLogs: {
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 5,
        include: {
          approvedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      attachments: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
    };
  }

  private timeAdjustRequestInclude() {
    return {
      originalAttendanceLog: true,
      appliedAttendanceLog: true,
      approvalSteps: {
        orderBy: {
          stepNo: 'asc' as const,
        },
        select: {
          id: true,
          stepNo: true,
          nameTh: true,
          description: true,
          approverType: true,
          roleCode: true,
          status: true,
          reason: true,
          note: true,
          actedAt: true,
          createdAt: true,
          updatedAt: true,
          expectedApprover: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          expectedEmployee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
            },
          },
          position: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
          actedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      logs: {
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 5,
        include: {
          actedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      attachments: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
    };
  }

  private buildEssLeaveStartDateFilter(query: EssListQueryDto) {
    if (query.dateFrom || query.dateTo) {
      return {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
      };
    }

    if (query.year) {
      return {
        gte: new Date(`${query.year}-01-01T00:00:00.000Z`),
        lte: new Date(`${query.year}-12-31T23:59:59.999Z`),
      };
    }

    return null;
  }


  private buildEssOvertimeWorkDateFilter(query: EssListQueryDto) {
    if (query.dateFrom || query.dateTo) {
      return {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
      };
    }

    if (query.year) {
      return {
        gte: new Date(`${query.year}-01-01T00:00:00.000Z`),
        lte: new Date(`${query.year}-12-31T23:59:59.999Z`),
      };
    }

    return null;
  }

  private buildEssTimeAdjustRequestedLogTimeFilter(query: EssListQueryDto) {
    if (query.dateFrom || query.dateTo) {
      return {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
      };
    }

    if (query.year) {
      return {
        gte: new Date(`${query.year}-01-01T00:00:00.000Z`),
        lte: new Date(`${query.year}-12-31T23:59:59.999Z`),
      };
    }

    return null;
  }

  private toEndOfDay(date: string) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private toDateOnly(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return 0;

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private withPagination<T, Summary = undefined>(
    items: T[],
    page: number,
    pageSize: number,
    total: number,
    summary?: Summary,
  ) {
    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      ...(summary !== undefined ? { summary } : {}),
    };
  }

  private async buildEssLeaveRequestSummary(where: Prisma.LeaveRequestWhereInput) {
    const prisma = this.prisma as any;
    const [
      total,
      draft,
      submitted,
      approved,
      rejected,
      cancelled,
      totalDaysAggregate,
    ] = await Promise.all([
      prisma.leaveRequest.count({ where }),
      this.countByStatuses(prisma.leaveRequest, where, ['DRAFT']),
      this.countByStatuses(prisma.leaveRequest, where, ['SUBMITTED']),
      this.countByStatuses(prisma.leaveRequest, where, ['APPROVED']),
      this.countByStatuses(prisma.leaveRequest, where, ['REJECTED']),
      this.countByStatuses(prisma.leaveRequest, where, ['CANCELLED']),
      prisma.leaveRequest.aggregate({
        where,
        _sum: {
          totalDays: true,
        },
      }),
    ]);

    return {
      total,
      draft,
      submitted,
      approved,
      rejected,
      cancelled,
      totalDays: this.toNumber(totalDaysAggregate?._sum?.totalDays),
    };
  }

  private async buildEssOvertimeRequestSummary(where: Prisma.OvertimeRequestWhereInput) {
    const prisma = this.prisma as any;
    const [
      total,
      draft,
      submitted,
      approved,
      rejected,
      cancelled,
      totalHoursAggregate,
      approvedHoursAggregate,
    ] = await Promise.all([
      prisma.overtimeRequest.count({ where }),
      this.countByStatuses(prisma.overtimeRequest, where, ['DRAFT']),
      this.countByStatuses(prisma.overtimeRequest, where, ['SUBMITTED']),
      this.countByStatuses(prisma.overtimeRequest, where, ['APPROVED']),
      this.countByStatuses(prisma.overtimeRequest, where, ['REJECTED']),
      this.countByStatuses(prisma.overtimeRequest, where, ['CANCELLED']),
      prisma.overtimeRequest.aggregate({
        where,
        _sum: {
          totalHours: true,
        },
      }),
      prisma.overtimeRequest.aggregate({
        where: {
          ...where,
          status: { in: ['APPROVED'] },
        },
        _sum: {
          totalHours: true,
        },
      }),
    ]);

    return {
      total,
      draft,
      submitted,
      approved,
      rejected,
      cancelled,
      totalHours: this.toNumber(totalHoursAggregate?._sum?.totalHours),
      approvedHours: this.toNumber(approvedHoursAggregate?._sum?.totalHours),
    };
  }

  private async buildEssTimeAdjustRequestSummary(where: Prisma.TimeAdjustRequestWhereInput) {
    const prisma = this.prisma as any;
    const [total, draft, submitted, approved, rejected, cancelled] = await Promise.all([
      prisma.timeAdjustRequest.count({ where }),
      this.countByStatuses(prisma.timeAdjustRequest, where, ['DRAFT']),
      this.countByStatuses(prisma.timeAdjustRequest, where, ['SUBMITTED']),
      this.countByStatuses(prisma.timeAdjustRequest, where, ['APPROVED']),
      this.countByStatuses(prisma.timeAdjustRequest, where, ['REJECTED']),
      this.countByStatuses(prisma.timeAdjustRequest, where, ['CANCELLED']),
    ]);

    return {
      total,
      draft,
      submitted,
      approved,
      rejected,
      cancelled,
    };
  }


  private ensureLeaveRequestCanBeEdited(status: string | null | undefined, actionLabel: string) {
    if (status === 'DRAFT') return;

    if (status === 'SUBMITTED') {
      throw new BadRequestException(
        `ต้องยกเลิกการส่งคำขอก่อนจึงจะ${actionLabel}ใบลาได้`,
      );
    }

    throw new BadRequestException(`รายการสถานะนี้ไม่สามารถ${actionLabel}ใบลาได้`);
  }

  private isApprovalLockedStatus(status?: string | null) {
    return String(status ?? '').includes('APPROVED');
  }

  private countByStatuses(model: { count: (args: any) => Promise<number> }, where: any, statuses: string[]) {
    return model.count({
      where: {
        ...where,
        status: { in: statuses },
      },
    });
  }

  private async ensureLeaveRequestBelongsToEmployee(
    id: string,
    employeeId: string,
  ) {
    const item = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        employeeId,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
      },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบใบลาของคุณ');
    }

    return item;
  }

  private async ensureOvertimeRequestBelongsToEmployee(
    id: string,
    employeeId: string,
  ) {
    const item = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        employeeId,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
      },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบคำขอ OT ของคุณ');
    }

    return item;
  }

  private async ensureTimeAdjustRequestBelongsToEmployee(
    id: string,
    employeeId: string,
  ) {
    const item = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        employeeId,
        deletedAt: null,
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
      },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบคำขอแก้เวลาของคุณ');
    }

    return item;
  }
}