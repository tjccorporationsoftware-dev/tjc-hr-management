import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ListHrReviewItemsQueryDto } from './dto/list-hr-review-items-query.dto';
import { HrReviewActionDto } from './dto/hr-review-action.dto';
import { mapHrReviewItem } from './mappers/hr-review-item.mapper';
import { parseHrReviewSourceType } from './helpers/hr-review-source.helper';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import { assertWithinScope } from '../../common/tenant/tenant-scope.util';
import type {
  CurrentUserLike,
  HrReviewDisplayStatus,
  HrReviewItem,
  HrReviewRecordSummary,
  HrReviewSourceSummary,
  HrReviewSourceType,
} from './types/hr-review.types';

/**
 * HR Review Service
 * -----------------
 * Service นี้เป็นด่านกลางหลังจากคำขออนุมัติครบแล้ว
 *
 * Flow ที่ต้องการ:
 * 1) พนักงานยื่นคำขอ Leave / OT / Time Adjust
 * 2) หัวหน้า/ผู้อนุมัติอนุมัติครบผ่าน Approval Matrix
 * 3) คำขอเปลี่ยนเป็น APPROVED
 * 4) HR Review Center ดึงรายการ APPROVED มาให้ HR ตรวจ
 * 5) HR ทำเครื่องหมาย ตรวจแล้ว / พร้อมเข้าเงินเดือน / พักไว้ก่อน / ส่งเข้า Payroll
 *
 * หมายเหตุ:
 * - Phase นี้ยังไม่สร้าง PayrollLine จริงทันที เพื่อไม่กระทบ payroll เดิม
 * - การส่งเข้า Payroll จริงควรทำต่อใน Phase ถัดไป โดยอ่านจาก HrReviewItem.status = PAYROLL_READY
 */
/** re-fetch ภายในหลัง action (actor ผ่าน APPROVAL_ACCESS แล้ว) — ไม่ต้อง scope ซ้ำ */
const INTERNAL_UNSCOPED: TenantScope = {
  level: 'GLOBAL',
  companyId: null,
  branchId: null,
};

@Injectable()
export class HrReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /* =========================================================
   HR REVIEW LIST
   ---------------------------------------------------------
   ดึงรายการ Leave / OT / Time Adjust ที่ APPROVED แล้ว
   และรวมสถานะจาก hr_review_items
========================================================= */

  async findAll(query: ListHrReviewItemsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const periodScope = query.periodId
      ? await this.resolvePayrollPeriodScope(query.periodId)
      : null;

    // Tenant boundary: non-GLOBAL ถูกล็อกที่บริษัทของตน (เมิน query.companyId)
    const companyId =
      scope.level === 'GLOBAL'
        ? (query.companyId ?? periodScope?.companyId)
        : (scope.companyId ?? undefined);
    const dateFrom = query.dateFrom
      ? this.parseDateOnly(query.dateFrom)
      : periodScope?.startDate;
    const dateTo = query.dateTo
      ? this.parseDateOnly(query.dateTo)
      : periodScope?.endDate;

    const sources: HrReviewSourceSummary[] = [];
    const type = query.type ?? 'ALL';

    if (type === 'ALL' || type === 'LEAVE') {
      sources.push(
        ...(await this.findApprovedLeaveSources({
          companyId,
          employeeId: query.employeeId,
          dateFrom,
          dateTo,
          q: query.q,
        })),
      );
    }

    if (type === 'ALL' || type === 'OVERTIME') {
      sources.push(
        ...(await this.findApprovedOvertimeSources({
          companyId,
          employeeId: query.employeeId,
          dateFrom,
          dateTo,
          q: query.q,
        })),
      );
    }

    if (type === 'ALL' || type === 'TIME_ADJUST') {
      sources.push(
        ...(await this.findApprovedTimeAdjustSources({
          companyId,
          employeeId: query.employeeId,
          dateFrom,
          dateTo,
          q: query.q,
        })),
      );
    }

    const reviewMap = await this.getReviewRecordMap(sources);

    const status = query.status ?? 'ALL';

    const allItems = sources
      .map((source) =>
        mapHrReviewItem({
          source,
          review:
            reviewMap.get(this.getSourceKey(source.type, source.id)) ?? null,
        }),
      )
      .filter((item) => this.matchesReviewStatus(item, status))
      .sort((a, b) => {
        const aTime = (a.approvedAt ?? a.submittedAt ?? a.createdAt).getTime();
        const bTime = (b.approvedAt ?? b.submittedAt ?? b.createdAt).getTime();
        return bTime - aTime;
      });

    const total = allItems.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      items: allItems.slice(start, end),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /** ดูรายละเอียดรายการเดียว ใช้กับหน้า modal/detail */
  async findOne(sourceTypeParam: string, sourceId: string, scope: TenantScope) {
    const sourceType = parseHrReviewSourceType(sourceTypeParam);
    const source = await this.getApprovedSourceOrThrow(sourceType, sourceId);

    // Tenant boundary: non-GLOBAL เข้าถึงได้เฉพาะรายการในบริษัทของตน
    if (
      scope.level !== 'GLOBAL' &&
      source.employee?.companyId &&
      source.employee.companyId !== scope.companyId
    ) {
      throw new NotFoundException('ไม่พบรายการ HR Review');
    }

    const review = await this.findReviewRecord(sourceType, sourceId);

    return mapHrReviewItem({ source, review });
  }

  /* =========================================================
   HR REVIEW ACTION
   ---------------------------------------------------------
   Action ที่ HR ทำกับรายการ
   REVIEWED
   PAYROLL_READY
   ON_HOLD
   SENT_TO_PAYROLL
   CANCELLED
========================================================= */

  /** HR กดตรวจสอบแล้ว แต่ยังไม่ส่งเข้าเงินเดือน */
  async markReviewed(
    currentUser: CurrentUserLike,
    sourceTypeParam: string,
    sourceId: string,
    dto: HrReviewActionDto,
    scope: TenantScope,
  ) {
    return this.upsertReviewRecord({
      currentUser,
      sourceTypeParam,
      sourceId,
      dto,
      nextStatus: 'REVIEWED',
      scope,
    });
  }

  /** HR กดว่ารายการนี้พร้อมเข้าเงินเดือน */
  async markPayrollReady(
    currentUser: CurrentUserLike,
    sourceTypeParam: string,
    sourceId: string,
    dto: HrReviewActionDto,
    scope: TenantScope,
  ) {
    return this.upsertReviewRecord({
      currentUser,
      sourceTypeParam,
      sourceId,
      dto,
      nextStatus: 'PAYROLL_READY',
      scope,
    });
  }

  /** HR พักรายการไว้ก่อน เช่น เอกสารยังไม่ครบ หรือรอตรวจสอบเพิ่ม */
  async hold(
    currentUser: CurrentUserLike,
    sourceTypeParam: string,
    sourceId: string,
    dto: HrReviewActionDto,
    scope: TenantScope,
  ) {
    return this.upsertReviewRecord({
      currentUser,
      sourceTypeParam,
      sourceId,
      dto,
      nextStatus: 'ON_HOLD',
      scope,
    });
  }

  /** ทำเครื่องหมายว่าส่งเข้า Payroll แล้ว ใน Phase นี้ยังไม่สร้าง PayrollLine จริง */
  async markSentToPayroll(
    currentUser: CurrentUserLike,
    sourceTypeParam: string,
    sourceId: string,
    dto: HrReviewActionDto,
    scope: TenantScope,
  ) {
    return this.upsertReviewRecord({
      currentUser,
      sourceTypeParam,
      sourceId,
      dto,
      nextStatus: 'SENT_TO_PAYROLL',
      scope,
    });
  }

  /** ยกเลิกเฉพาะ record ฝั่ง HR Review ไม่ได้ยกเลิกคำขอต้นทาง */
  async cancelReview(
    currentUser: CurrentUserLike,
    sourceTypeParam: string,
    sourceId: string,
    dto: HrReviewActionDto,
    scope: TenantScope,
  ) {
    return this.upsertReviewRecord({
      currentUser,
      sourceTypeParam,
      sourceId,
      dto,
      nextStatus: 'CANCELLED',
      scope,
    });
  }

  /* =========================================================
   UPSERT HR REVIEW RECORD
   ---------------------------------------------------------
   สร้างหรืออัปเดต hr_review_items
   เป็นศูนย์กลางของการเปลี่ยนสถานะทั้งหมด
  ========================================================= */

  private async upsertReviewRecord(params: {
    currentUser: CurrentUserLike;
    sourceTypeParam: string;
    sourceId: string;
    dto: HrReviewActionDto;
    nextStatus:
      | 'REVIEWED'
      | 'PAYROLL_READY'
      | 'ON_HOLD'
      | 'SENT_TO_PAYROLL'
      | 'CANCELLED';
    scope: TenantScope;
  }) {
    const actorId = this.getActorId(params.currentUser);
    const sourceType = parseHrReviewSourceType(params.sourceTypeParam);
    const source = await this.getApprovedSourceOrThrow(
      sourceType,
      params.sourceId,
    );

    if (!source.employee) {
      throw new BadRequestException('ไม่พบข้อมูลพนักงานของรายการนี้');
    }

    // Tenant boundary: จัดการได้เฉพาะรายการในบริษัท/สาขาของผู้ใช้
    assertWithinScope(params.scope, {
      companyId: source.employee.companyId,
      branchId: (source.employee as { branchId?: string | null }).branchId,
    });

    const prisma = this.prisma as any;
    const existing = await prisma.hrReviewItem.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId: params.sourceId,
        },
      },
    });

    if (
      existing?.status === 'SENT_TO_PAYROLL' &&
      params.nextStatus !== 'SENT_TO_PAYROLL'
    ) {
      throw new BadRequestException(
        'รายการนี้ส่งเข้า Payroll แล้ว ไม่สามารถย้อนสถานะผ่าน HR Review ได้',
      );
    }

    const periodId = params.dto.periodId ?? existing?.periodId ?? null;
    const payrollRunId =
      params.dto.payrollRunId ?? existing?.payrollRunId ?? null;

    if (periodId) {
      await this.ensurePayrollPeriodMatchesCompany(
        periodId,
        source.employee.companyId,
      );
    }

    if (payrollRunId) {
      await this.ensurePayrollRunMatchesCompany(
        payrollRunId,
        source.employee.companyId,
      );
    }

    const now = new Date();

    const statusStamp = this.buildStatusStamp({
      status: params.nextStatus,
      actorId,
      now,
    });

    await prisma.hrReviewItem.upsert({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId: params.sourceId,
        },
      },
      create: {
        sourceType,
        sourceId: params.sourceId,
        companyId: source.employee.companyId,
        employeeId: source.employee.id,
        periodId,
        payrollRunId,
        status: params.nextStatus,
        reason: params.dto.reason?.trim() || null,
        note: params.dto.note?.trim() || null,
        ...statusStamp,
      },
      update: {
        companyId: source.employee.companyId,
        employeeId: source.employee.id,
        periodId,
        payrollRunId,
        status: params.nextStatus,
        reason:
          params.dto.reason === undefined
            ? undefined
            : params.dto.reason?.trim() || null,
        note:
          params.dto.note === undefined
            ? undefined
            : params.dto.note?.trim() || null,
        ...statusStamp,
      },
    });

    return this.findOne(sourceType, params.sourceId, INTERNAL_UNSCOPED);
  }

  /** สร้าง timestamp field ให้ตรงกับสถานะที่ HR กด */
  private buildStatusStamp(params: {
    status:
      | 'REVIEWED'
      | 'PAYROLL_READY'
      | 'ON_HOLD'
      | 'SENT_TO_PAYROLL'
      | 'CANCELLED';
    actorId: string;
    now: Date;
  }) {
    if (params.status === 'REVIEWED') {
      return {
        reviewedAt: params.now,
        reviewedById: params.actorId,
      };
    }

    if (params.status === 'PAYROLL_READY') {
      return {
        payrollReadyAt: params.now,
        payrollReadyById: params.actorId,
      };
    }

    if (params.status === 'ON_HOLD') {
      return {
        heldAt: params.now,
        heldById: params.actorId,
      };
    }

    if (params.status === 'SENT_TO_PAYROLL') {
      return {
        sentToPayrollAt: params.now,
        sentToPayrollById: params.actorId,
      };
    }

    return {
      cancelledAt: params.now,
      cancelledById: params.actorId,
    };
  }

  /* =========================================================
   APPROVED SOURCE LOADER
   ---------------------------------------------------------
   โหลดรายการต้นทางที่ APPROVED แล้ว
   Leave
   Overtime
   Time Adjust
  ========================================================= */

  private async findApprovedLeaveSources(params: {
    companyId?: string;
    employeeId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    q?: string;
  }): Promise<HrReviewSourceSummary[]> {
    const prisma = this.prisma as any;

    const where: any = {
      deletedAt: null,
      status: 'APPROVED',
    };

    if (params.employeeId) where.employeeId = params.employeeId;

    if (params.companyId || params.q?.trim()) {
      where.employee = this.buildEmployeeWhere(params.companyId, params.q);
    }

    if (params.dateFrom || params.dateTo) {
      where.AND = [];

      // Leave ใช้ logic overlap: ช่วงลาแตะกับช่วง payroll/วันที่ค้นหา
      if (params.dateTo) {
        where.AND.push({ startDate: { lte: params.dateTo } });
      }

      if (params.dateFrom) {
        where.AND.push({ endDate: { gte: params.dateFrom } });
      }
    }

    const items = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: this.employeeInclude(),
        leaveType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
          },
        },
      },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return items.map((item: any) => ({
      id: item.id,
      type: 'LEAVE',
      requestNo: item.requestNo ?? null,
      title: item.leaveType?.nameTh ?? 'ใบลา',
      reason: item.reason ?? null,
      status: item.status,
      submittedAt: item.submittedAt ?? null,
      approvedAt: item.approvedAt ?? null,
      createdAt: item.createdAt,
      employee: item.employee ?? null,
      detail: {
        leaveType: item.leaveType,
        startDate: item.startDate,
        endDate: item.endDate,
        totalDays: item.totalDays,
        dayType: item.dayType,
        contactInfo: item.contactInfo,
        note: item.note,
      },
    }));
  }

  private async findApprovedOvertimeSources(params: {
    companyId?: string;
    employeeId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    q?: string;
  }): Promise<HrReviewSourceSummary[]> {
    const prisma = this.prisma as any;

    const where: any = {
      deletedAt: null,
      status: 'APPROVED',
    };

    if (params.employeeId) where.employeeId = params.employeeId;
    if (params.companyId || params.q?.trim()) {
      where.employee = this.buildEmployeeWhere(params.companyId, params.q);
    }

    if (params.dateFrom || params.dateTo) {
      where.workDate = {};
      if (params.dateFrom) where.workDate.gte = params.dateFrom;
      if (params.dateTo) where.workDate.lte = params.dateTo;
    }

    const items = await prisma.overtimeRequest.findMany({
      where,
      include: {
        employee: this.employeeInclude(),
        attachments: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return items.map((item: any) => ({
      id: item.id,
      type: 'OVERTIME',
      requestNo: item.requestNo ?? null,
      title: 'คำขอ OT',
      reason: item.reason ?? null,
      status: item.status,
      submittedAt: item.submittedAt ?? null,
      approvedAt: item.approvedAt ?? null,
      createdAt: item.createdAt,
      employee: item.employee ?? null,
      detail: {
        workDate: item.workDate,
        startTime: item.startTime,
        endTime: item.endTime,
        breakMinutes: item.breakMinutes,
        totalHours: item.totalHours,
        workType: item.workType,
        note: item.note,
        attachmentCount: item.attachments?.length ?? 0,
      },
    }));
  }

  private async findApprovedTimeAdjustSources(params: {
    companyId?: string;
    employeeId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    q?: string;
  }): Promise<HrReviewSourceSummary[]> {
    const prisma = this.prisma as any;

    const where: any = {
      deletedAt: null,
      status: 'APPROVED',
    };

    if (params.employeeId) where.employeeId = params.employeeId;
    if (params.companyId || params.q?.trim()) {
      where.employee = this.buildEmployeeWhere(params.companyId, params.q);
    }

    if (params.dateFrom || params.dateTo) {
      where.requestedLogTime = {};
      if (params.dateFrom) where.requestedLogTime.gte = params.dateFrom;
      if (params.dateTo)
        where.requestedLogTime.lte = this.endOfDay(params.dateTo);
    }

    const items = await prisma.timeAdjustRequest.findMany({
      where,
      include: {
        employee: this.employeeInclude(),
        originalAttendanceLog: true,
        appliedAttendanceLog: true,
        attachments: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return items.map((item: any) => ({
      id: item.id,
      type: 'TIME_ADJUST',
      requestNo: item.requestNo ?? null,
      title: 'คำขอแก้เวลา',
      reason: item.reason ?? null,
      status: item.status,
      submittedAt: item.submittedAt ?? null,
      approvedAt: item.approvedAt ?? null,
      createdAt: item.createdAt,
      employee: item.employee ?? null,
      detail: {
        adjustType: item.adjustType,
        targetLogType: item.targetLogType,
        originalLogTime: item.originalLogTime,
        requestedLogTime: item.requestedLogTime,
        note: item.note,
        originalAttendanceLog: item.originalAttendanceLog,
        appliedAttendanceLog: item.appliedAttendanceLog,
        attachmentCount: item.attachments?.length ?? 0,
      },
    }));
  }

  /* =========================================================
   SOURCE DETAIL RESOLVER
   ---------------------------------------------------------
   โหลดรายละเอียดต้นทางแบบเจาะจง
   และตรวจว่ารายการอยู่ในสถานะ APPROVED จริง
  ========================================================= */

  private async getApprovedSourceOrThrow(
    sourceType: HrReviewSourceType,
    sourceId: string,
  ) {
    const prisma = this.prisma as any;

    if (sourceType === 'LEAVE') {
      const item = await prisma.leaveRequest.findFirst({
        where: { id: sourceId, deletedAt: null, status: 'APPROVED' },
        include: {
          employee: this.employeeInclude(),
          leaveType: {
            select: { id: true, code: true, nameTh: true, nameEn: true },
          },
        },
      });

      if (!item) {
        throw new NotFoundException(
          'ไม่พบใบลาที่อนุมัติแล้ว หรือรายการนี้ยังไม่พร้อมให้ HR ตรวจ',
        );
      }

      return {
        id: item.id,
        type: 'LEAVE',
        requestNo: item.requestNo ?? null,
        title: item.leaveType?.nameTh ?? 'ใบลา',
        reason: item.reason ?? null,
        status: item.status,
        submittedAt: item.submittedAt ?? null,
        approvedAt: item.approvedAt ?? null,
        createdAt: item.createdAt,
        employee: item.employee ?? null,
        detail: {
          leaveType: item.leaveType,
          startDate: item.startDate,
          endDate: item.endDate,
          totalDays: item.totalDays,
          dayType: item.dayType,
          contactInfo: item.contactInfo,
          note: item.note,
        },
      } satisfies HrReviewSourceSummary;
    }

    if (sourceType === 'OVERTIME') {
      const item = await prisma.overtimeRequest.findFirst({
        where: { id: sourceId, deletedAt: null, status: 'APPROVED' },
        include: {
          employee: this.employeeInclude(),
          attachments: { where: { deletedAt: null }, select: { id: true } },
        },
      });

      if (!item) {
        throw new NotFoundException(
          'ไม่พบคำขอ OT ที่อนุมัติแล้ว หรือรายการนี้ยังไม่พร้อมให้ HR ตรวจ',
        );
      }

      return {
        id: item.id,
        type: 'OVERTIME',
        requestNo: item.requestNo ?? null,
        title: 'คำขอ OT',
        reason: item.reason ?? null,
        status: item.status,
        submittedAt: item.submittedAt ?? null,
        approvedAt: item.approvedAt ?? null,
        createdAt: item.createdAt,
        employee: item.employee ?? null,
        detail: {
          workDate: item.workDate,
          startTime: item.startTime,
          endTime: item.endTime,
          breakMinutes: item.breakMinutes,
          totalHours: item.totalHours,
          workType: item.workType,
          note: item.note,
          attachmentCount: item.attachments?.length ?? 0,
        },
      } satisfies HrReviewSourceSummary;
    }

    const item = await prisma.timeAdjustRequest.findFirst({
      where: { id: sourceId, deletedAt: null, status: 'APPROVED' },
      include: {
        employee: this.employeeInclude(),
        originalAttendanceLog: true,
        appliedAttendanceLog: true,
        attachments: { where: { deletedAt: null }, select: { id: true } },
      },
    });

    if (!item) {
      throw new NotFoundException(
        'ไม่พบคำขอแก้เวลาที่อนุมัติแล้ว หรือรายการนี้ยังไม่พร้อมให้ HR ตรวจ',
      );
    }

    return {
      id: item.id,
      type: 'TIME_ADJUST',
      requestNo: item.requestNo ?? null,
      title: 'คำขอแก้เวลา',
      reason: item.reason ?? null,
      status: item.status,
      submittedAt: item.submittedAt ?? null,
      approvedAt: item.approvedAt ?? null,
      createdAt: item.createdAt,
      employee: item.employee ?? null,
      detail: {
        adjustType: item.adjustType,
        targetLogType: item.targetLogType,
        originalLogTime: item.originalLogTime,
        requestedLogTime: item.requestedLogTime,
        note: item.note,
        originalAttendanceLog: item.originalAttendanceLog,
        appliedAttendanceLog: item.appliedAttendanceLog,
        attachmentCount: item.attachments?.length ?? 0,
      },
    } satisfies HrReviewSourceSummary;
  }

  /* =========================================================
   REVIEW RECORD LOOKUP
  ========================================================= */

  private async getReviewRecordMap(sources: HrReviewSourceSummary[]) {
    const map = new Map<string, HrReviewRecordSummary>();

    if (sources.length === 0) return map;

    const prisma = this.prisma as any;

    const records = await prisma.hrReviewItem.findMany({
      where: {
        OR: sources.map((source) => ({
          sourceType: source.type,
          sourceId: source.id,
        })),
      },
    });

    records.forEach((record: any) => {
      map.set(this.getSourceKey(record.sourceType, record.sourceId), record);
    });

    return map;
  }

  private async findReviewRecord(
    sourceType: HrReviewSourceType,
    sourceId: string,
  ) {
    const prisma = this.prisma as any;
    const record = await prisma.hrReviewItem.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId,
        },
      },
    });

    return (record ?? null) as HrReviewRecordSummary | null;
  }

  private matchesReviewStatus(
    item: HrReviewItem,
    status: HrReviewDisplayStatus,
  ) {
    if (status === 'ALL') return true;
    return item.reviewStatus === status;
  }

  /* =========================================================
   QUERY BUILDER
========================================================= */

  private buildEmployeeWhere(companyId?: string, q?: string) {
    const search = q?.trim();

    return {
      ...(companyId ? { companyId } : {}),
      ...(search
        ? {
            OR: [
              { employeeCode: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private employeeInclude() {
    return {
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
        firstName: true,
        lastName: true,
        displayName: true,
        position: true,
        // ระดับตำแหน่งใช้เรียงให้ผู้บริหารขึ้นก่อน ให้ตรงกับหน้าตรวจเวลารายวัน
        positionMaster: { select: { level: true } },
        companyId: true,
        company: { select: { id: true, code: true, nameTh: true } },
        branch: { select: { id: true, code: true, nameTh: true } },
        department: { select: { id: true, code: true, nameTh: true } },
      },
    };
  }

  /* =========================================================
   PAYROLL VALIDATION
========================================================= */

  private async resolvePayrollPeriodScope(periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id: periodId,
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!period) {
      throw new NotFoundException('ไม่พบงวดเงินเดือนที่เลือก');
    }

    return period;
  }

  private async ensurePayrollPeriodMatchesCompany(
    periodId: string,
    companyId: string,
  ) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id: periodId,
        companyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!period) {
      throw new BadRequestException('งวดเงินเดือนไม่ตรงกับบริษัทของพนักงาน');
    }
  }

  private async ensurePayrollRunMatchesCompany(
    payrollRunId: string,
    companyId: string,
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id: payrollRunId,
        companyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!run) {
      throw new BadRequestException('Payroll Run ไม่ตรงกับบริษัทของพนักงาน');
    }
  }

  /* =========================================================
   COMMON HELPER
========================================================= */

  private getSourceKey(sourceType: HrReviewSourceType, sourceId: string) {
    return `${sourceType}:${sourceId}`;
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException('ไม่พบข้อมูลผู้ใช้งานปัจจุบัน');
    }

    return actorId;
  }

  private parseDateOnly(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('รูปแบบวันที่ไม่ถูกต้อง');
    }

    return date;
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setUTCHours(23, 59, 59, 999);
    return next;
  }
}
