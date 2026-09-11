import { assertWorkDateNotLocked } from '../attendance/utils/attendance-lock.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceLocationType,
  EmployeeStatus,
  OffsiteRequestStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ApprovalMatrixResolverService } from '../approval-workflow/services/approval-matrix-resolver.service';
import { APPROVAL_HR_ROLE_CODES } from '../approval-workflow/utils/approval-step-authorization.util';
import { CreateOffsiteWorkRequestDto } from './dto/create-offsite-work-request.dto';
import { ListOffsiteWorkRequestsQueryDto } from './dto/list-offsite-work-requests-query.dto';
import { OffsiteWorkActionDto } from './dto/offsite-work-action.dto';
import { UpdateOffsiteWorkRequestDto } from './dto/update-offsite-work-request.dto';
import { VerifyOffsiteLocationDto } from './dto/verify-offsite-location.dto';
import { OffsiteLocationVerificationService } from './offsite-location-verification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttendanceRecalculationTriggerService } from '../attendance/attendance-recalculation-trigger.service';
import {
  buildOffsiteWorkRequestWhere,
  hasOffsiteEmployeeScopeFilter,
  resolveOffsiteEmployeeScopeIds,
  resolveOffsiteSearchEmployeeIds,
  resolveTenantBranchEmployeeIds,
} from './helpers/offsite-work-search.helper';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import { assertWithinScope } from '../../common/tenant/tenant-scope.util';
import { toThaiDateKey } from '../../common/utils/thai-date.util';
import type {
  CurrentUserLike,
  OffsiteApprovalSnapshot,
  OffsiteApprovalStepSnapshot,
} from './types/offsite-work.types';

/** re-fetch ภายในหลัง action สำเร็จ / ตรวจ ownership แล้ว — ไม่ต้อง scope ซ้ำ */
const INTERNAL_UNSCOPED: TenantScope = {
  level: 'GLOBAL',
  companyId: null,
  branchId: null,
};

const ACTIVE_EMPLOYEE_STATUS_EXCLUDE: EmployeeStatus[] = [
  EmployeeStatus.RESIGNED,
  EmployeeStatus.TERMINATED,
  EmployeeStatus.INACTIVE,
];

const OFFSITE_CLOSED_STATUSES = [
  OffsiteRequestStatus.HR_APPROVED,
  OffsiteRequestStatus.APPROVED,
  OffsiteRequestStatus.REJECTED,
  OffsiteRequestStatus.MANAGER_REJECTED,
  OffsiteRequestStatus.HR_REJECTED,
  OffsiteRequestStatus.CANCELLED,
];

type EmployeeForApproval = {
  id: string;
  companyId: string;
  branchId: string | null;
  departmentId: string | null;
  employeeTypeId: string | null;
  supervisorId?: string | null;
  userId?: string | null;
};

@Injectable()
export class OffsiteWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalMatrixResolver: ApprovalMatrixResolverService,
    private readonly locationVerification: OffsiteLocationVerificationService,
    private readonly notificationsService: NotificationsService,
    private readonly attendanceRecalculation: AttendanceRecalculationTriggerService,
  ) {}

  async findAll(query: ListOffsiteWorkRequestsQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const skip = (page - 1) * pageSize;
    const prisma = this.prisma as any;

    const [scopedEmployeeIds, searchEmployeeIds, tenantBranchEmployeeIds] =
      await Promise.all([
        resolveOffsiteEmployeeScopeIds(prisma, query),
        resolveOffsiteSearchEmployeeIds(prisma, query.search),
        resolveTenantBranchEmployeeIds(prisma, scope),
      ]);

    const employeeFilters = {
      scopedEmployeeIds,
      searchEmployeeIds,
      hasEmployeeScope: hasOffsiteEmployeeScopeFilter(query),
      tenantBranchEmployeeIds,
    };

    const where = buildOffsiteWorkRequestWhere(query, employeeFilters, scope);
    const summaryWhere = buildOffsiteWorkRequestWhere(
      { ...query, status: undefined },
      employeeFilters,
      scope,
    );

    const [items, total, summary] = await Promise.all([
      prisma.offsiteWorkRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.offsiteWorkRequest.count({ where }),
      this.buildOffsiteRequestSummary(summaryWhere),
    ]);

    return {
      items: await this.enrichWithEmployees(items),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
    };
  }


  private async buildOffsiteRequestSummary(where: any) {
    const prisma = this.prisma as any;
    const [
      total,
      draft,
      submitted,
      managerApproved,
      hrApproved,
      approvedOnly,
      rejectedOnly,
      managerRejected,
      hrRejected,
      cancelled,
      withAttachment,
      today,
    ] = await Promise.all([
      prisma.offsiteWorkRequest.count({ where }),
      this.countOffsiteStatuses(where, ['DRAFT']),
      this.countOffsiteStatuses(where, ['SUBMITTED']),
      this.countOffsiteStatuses(where, ['MANAGER_APPROVED']),
      this.countOffsiteStatuses(where, ['HR_APPROVED']),
      this.countOffsiteStatuses(where, ['APPROVED']),
      this.countOffsiteStatuses(where, ['REJECTED']),
      this.countOffsiteStatuses(where, ['MANAGER_REJECTED']),
      this.countOffsiteStatuses(where, ['HR_REJECTED']),
      this.countOffsiteStatuses(where, ['CANCELLED']),
      prisma.offsiteWorkRequest.count({ where: this.withAttachmentFilter(where) }),
      prisma.offsiteWorkRequest.count({ where: this.withTodayFilter(where) }),
    ]);

    const rejected = rejectedOnly + managerRejected + hrRejected;

    return {
      total,
      draft,
      submitted,
      managerApproved,
      hrApproved,
      approvedOnly,
      approved: approvedOnly + hrApproved,
      rejected,
      rejectedOnly,
      managerRejected,
      hrRejected,
      cancelled,
      pending: submitted + managerApproved,
      withAttachment,
      withoutAttachment: Math.max(0, total - withAttachment),
      today,
    };
  }


  private countOffsiteStatuses(where: any, statuses: string[]) {
    const prisma = this.prisma as any;
    return prisma.offsiteWorkRequest.count({
      where: {
        ...where,
        status: { in: statuses },
      },
    });
  }



  private withAttachmentFilter(where: any) {
    const nextWhere = { ...where };
    const existingAnd = Array.isArray(nextWhere.AND)
      ? nextWhere.AND
      : nextWhere.AND
        ? [nextWhere.AND]
        : [];

    nextWhere.AND = [
      ...existingAnd,
      { attachmentUrl: { not: null } },
      { attachmentUrl: { not: '' } },
    ];

    return nextWhere;
  }

  private withTodayFilter(where: any) {
    return {
      ...where,
      workDate: this.todayBangkokDateOnly(),
    };
  }

  async findMy(query: ListOffsiteWorkRequestsQueryDto, currentUser: CurrentUserLike) {
    const employee = await this.resolveCurrentEmployee(currentUser);
    // employeeId already restricts to self — no extra tenant filter needed.
    return this.findAll({ ...query, employeeId: employee.id }, INTERNAL_UNSCOPED);
  }

  async findMyOne(id: string, currentUser: CurrentUserLike) {
    const employee = await this.resolveCurrentEmployee(currentUser);
    const item = await this.findOne(id, INTERNAL_UNSCOPED);
    if (item.employeeId !== employee.id) {
      throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่ของคุณ');
    }
    return item;
  }

  async findOne(id: string, scope: TenantScope) {
    const prisma = this.prisma as any;
    const item = await prisma.offsiteWorkRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        // OffsiteWorkRequest มี companyId ตรง → คุมข้ามบริษัทได้ทันที
        ...(scope.level !== 'GLOBAL' && scope.companyId
          ? { companyId: scope.companyId }
          : {}),
      },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');
    }

    const [enriched] = await this.enrichWithEmployees([item]);
    return enriched;
  }

  async findMyApprovedForPunch(currentUser: CurrentUserLike, workDate?: string) {
    const employee = await this.resolveCurrentEmployee(currentUser);
    const date = workDate ? this.parseDateOnly(workDate) : this.todayBangkokDateOnly();
    const items = await this.locationVerification.listApprovedForPunch({
      employeeId: employee.id,
      workDate: date,
    });
    return this.enrichWithEmployees(items);
  }

  async findPendingApprovals(
    query: ListOffsiteWorkRequestsQueryDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);
    const actorEmployee = await this.findEmployeeByUserId(actorId);
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const prisma = this.prisma as any;
    const [scopedEmployeeIds, searchEmployeeIds, tenantBranchEmployeeIds] =
      await Promise.all([
        resolveOffsiteEmployeeScopeIds(prisma, query),
        resolveOffsiteSearchEmployeeIds(prisma, query.search),
        resolveTenantBranchEmployeeIds(prisma, scope),
      ]);

    const items = await prisma.offsiteWorkRequest.findMany({
      where: buildOffsiteWorkRequestWhere(
        { ...query, status: OffsiteRequestStatus.SUBMITTED },
        {
          scopedEmployeeIds,
          searchEmployeeIds,
          hasEmployeeScope: hasOffsiteEmployeeScopeFilter(query),
          tenantBranchEmployeeIds,
        },
        scope,
      ),
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });

    // Manager queue must never become an admin-wide inbox.
    // It must show only requests where the current actor is the real pending manager approver.
    const filtered = items.filter((item: any) =>
      item.employeeId !== actorEmployee?.id &&
      this.isActorPendingManagerApprover(item.approvalSnapshot, actorId, actorEmployee?.id ?? null),
    );
    const total = filtered.length;
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: await this.enrichWithEmployees(paged),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        total,
        draft: 0,
        submitted: total,
        managerApproved: 0,
        hrApproved: 0,
        pending: total,
        approved: 0,
        rejected: 0,
        cancelled: 0,
      },
    };
  }

  async create(
    dto: CreateOffsiteWorkRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(dto.employeeId, actorId);
    // พนักงานปลายทางต้องอยู่ในบริษัท/สาขาของผู้สร้าง
    assertWithinScope(scope, {
      companyId: employee.companyId,
      branchId: employee.branchId,
    });
    this.validateTimeRange(dto.startTime, dto.endTime);

    const prisma = this.prisma as any;
    const item = await prisma.offsiteWorkRequest.create({
      data: {
        requestNo: await this.generateRequestNo(employee.companyId),
        companyId: employee.companyId,
        employeeId: employee.id,
        workDate: this.parseDateOnly(dto.workDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        locationType: AttendanceLocationType.OTHER,
        locationName: 'ทำงานนอกสถานที่',
        address: null,
        latitude: null,
        longitude: null,
        radiusMeters: 0,
        reason: dto.reason.trim(),
        attachmentUrl: dto.attachmentUrl?.trim() || null,
      },
    });

    if (dto.submit) {
      return this.submit(item.id, currentUser);
    }

    return this.findOne(item.id, INTERNAL_UNSCOPED);
  }

  async updateMy(
    id: string,
    dto: UpdateOffsiteWorkRequestDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyRequest(id, currentUser);
    // ยืนยันความเป็นเจ้าของแล้ว จึงไม่ต้อง scope ซ้ำ
    return this.update(id, dto, INTERNAL_UNSCOPED);
  }

  async update(
    id: string,
    dto: UpdateOffsiteWorkRequestDto,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const current = await prisma.offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        employee: { select: { branchId: true } },
      },
    });

    if (!current) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');
    assertWithinScope(scope, {
      companyId: current.companyId,
      branchId: current.employee?.branchId ?? null,
    });
    if (this.isApprovalLockedStatus(current.status)) {
      throw new BadRequestException('รายการที่อนุมัติแล้วไม่สามารถแก้ไขได้');
    }

    const startTime = dto.startTime ?? current.startTime;
    const endTime = dto.endTime ?? current.endTime;
    this.validateTimeRange(startTime, endTime);

    /* ใบที่รออนุมัติอยู่ห้ามถอดรูปหลักฐานออกจนเหลือใบเปล่า */
    const nextAttachmentUrl =
      dto.attachmentUrl === undefined
        ? current.attachmentUrl
        : dto.attachmentUrl?.trim() || null;

    if (
      !nextAttachmentUrl &&
      current.status !== OffsiteRequestStatus.DRAFT
    ) {
      throw new BadRequestException(
        'คำขอที่รออนุมัติต้องมีรูปหลักฐาน กรุณาแนบรูปใหม่แทนการลบรูปเดิม',
      );
    }

    await prisma.offsiteWorkRequest.update({
      where: { id },
      data: {
        workDate: dto.workDate ? this.parseDateOnly(dto.workDate) : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        locationType: AttendanceLocationType.OTHER,
        locationName: 'ทำงานนอกสถานที่',
        address: null,
        latitude: null,
        longitude: null,
        radiusMeters: 0,
        reason: dto.reason?.trim(),
        attachmentUrl:
          dto.attachmentUrl === undefined ? undefined : dto.attachmentUrl?.trim() || null,
      },
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async submitMy(id: string, currentUser: CurrentUserLike) {
    await this.ensureMyRequest(id, currentUser);
    return this.submit(id, currentUser);
  }

  async submit(id: string, currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);
    const prisma = this.prisma as any;

    const request = await prisma.offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
    });

    if (!request) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');
    if (request.status !== OffsiteRequestStatus.DRAFT) {
      throw new BadRequestException('ส่งอนุมัติได้เฉพาะคำขอสถานะร่างเท่านั้น');
    }

    /*
     * ต้องมีรูปหลักฐานเสมอก่อนเข้าคิวอนุมัติ
     *
     * งานนอกสถานที่เก็บรูปเป็น data URL ในตัวใบ ไม่ได้แยกตารางไฟล์แนบเหมือน OT
     * และแก้เวลา จึงตรวจจากช่อง attachmentUrl ตรง ๆ
     */
    if (!String(request.attachmentUrl ?? '').trim()) {
      throw new BadRequestException(
        'กรุณาแนบรูปหลักฐานก่อนส่งคำขอทำงานนอกสถานที่',
      );
    }

    const employee = await this.ensureEmployeeById(request.employeeId);

    await this.prisma.$transaction(async (tx) => {
      const matrix = await this.approvalMatrixResolver.findApplicableMatrix(tx, {
        targetType: 'OFFSITE_WORK_REQUEST' as any,
        employee,
      });

      if (!matrix) {
        throw new BadRequestException(
          'ยังไม่ได้ตั้งค่าสายอนุมัติสำหรับ Offsite Work กรุณาตั้งค่า Approval Matrix ก่อน',
        );
      }

      const resolvedSteps = await this.approvalMatrixResolver.resolveSteps(tx, {
        employee,
        matrix,
      });

      const approvalSteps = resolvedSteps.map((resolvedStep, index) => ({
        stepNo: resolvedStep.step.stepNo,
        nameTh: resolvedStep.step.nameTh,
        approverType: String(resolvedStep.step.approverType),
        expectedApproverId: resolvedStep.expectedApproverId,
        expectedEmployeeId: resolvedStep.expectedEmployeeId,
        roleCode: resolvedStep.step.roleCode,
        status: index === 0 ? 'PENDING' : 'WAITING',
        actedAt: null,
        actedById: null,
        reason: null,
        note: null,
      })) as OffsiteApprovalStepSnapshot[];

      const firstStep = approvalSteps[0];
      if (!firstStep) {
        throw new BadRequestException(
          'ไม่พบขั้นอนุมัติสำหรับ Offsite Work กรุณาตรวจสอบ Approval Matrix',
        );
      }

      if (!firstStep.expectedApproverId && !firstStep.expectedEmployeeId) {
        throw new BadRequestException(
          'ไม่พบผู้อนุมัติสำหรับคำขอนี้ กรุณาตรวจสอบ Approval Matrix',
        );
      }

      if (
        (firstStep.expectedEmployeeId && firstStep.expectedEmployeeId === employee.id) ||
        (firstStep.expectedApproverId && employee.userId && firstStep.expectedApproverId === employee.userId)
      ) {
        throw new BadRequestException(
          'ผู้ขอไม่สามารถเป็นผู้อนุมัติคำขอตนเอง กรุณาตรวจสอบ Approval Matrix',
        );
      }

      const approvalSnapshot: OffsiteApprovalSnapshot = {
        matrixId: matrix.id,
        matrixCode: matrix.code,
        matrixNameTh: matrix.nameTh,
        submittedAt: new Date().toISOString(),
        submittedById: actorId,
        steps: approvalSteps,
      };

      await (tx as any).offsiteWorkRequest.update({
        where: { id },
        data: {
          status: OffsiteRequestStatus.SUBMITTED,
          submittedAt: new Date(),
          submittedById: actorId,
          approvalSnapshot: approvalSnapshot as any,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForOffsite(request, actorId, 'SUBMIT');

    await this.notifyOffsiteSafely('แจ้งเตือนคำขอทำงานนอกสถานที่รออนุมัติ', () =>
      this.notificationsService.notifyOffsitePendingApproval(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async approve(id: string, dto: OffsiteWorkActionDto, currentUser: CurrentUserLike) {
    return this.actOnApproval(id, dto, currentUser, 'APPROVED');
  }

  async reject(id: string, dto: OffsiteWorkActionDto, currentUser: CurrentUserLike) {
    return this.actOnApproval(id, dto, currentUser, 'REJECTED');
  }

  async returnForReview(id: string, dto: OffsiteWorkActionDto, currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);
    const actorEmployee = await this.findEmployeeByUserId(actorId);
    const prisma = this.prisma as any;
    const request = await prisma.offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        employeeId: true,
        workDate: true,
        status: true,
        approvalSnapshot: true,
      },
    });

    if (!request) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');
    if (![OffsiteRequestStatus.SUBMITTED, OffsiteRequestStatus.MANAGER_APPROVED].includes(request.status)) {
      throw new BadRequestException('ส่งกลับให้ตรวจสอบใหม่ได้เฉพาะรายการที่อยู่ระหว่างรออนุมัติเท่านั้น');
    }

    const requestEmployee = await this.ensureEmployeeById(request.employeeId);
    await this.ensureActorIsNotRequester(
      { employeeId: request.employeeId, requesterUserId: requestEmployee.userId ?? null },
      actorId,
      actorEmployee?.id ?? null,
    );

    const approvalSnapshot = this.parseApprovalSnapshot(request.approvalSnapshot);
    const pendingIndex = approvalSnapshot.steps.findIndex((step) => step.status === 'PENDING');
    if (pendingIndex < 0) {
      throw new BadRequestException('ไม่พบขั้นอนุมัติปัจจุบัน');
    }

    const currentStep = approvalSnapshot.steps[pendingIndex];
    await this.ensureActorCanActCurrentStep(currentStep, actorId, actorEmployee?.id ?? null);

    currentStep.status = 'CANCELLED';
    currentStep.actedAt = new Date().toISOString();
    currentStep.actedById = actorId;
    currentStep.reason = dto.reason?.trim() || null;
    currentStep.note = dto.note?.trim() || 'ส่งกลับให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่';

    this.cancelWaitingSteps(approvalSnapshot.steps);

    await prisma.offsiteWorkRequest.update({
      where: { id },
      data: {
        status: OffsiteRequestStatus.DRAFT,
        submittedAt: null,
        submittedById: null,
        approvedAt: null,
        approvedById: null,
        rejectedAt: null,
        rejectedById: null,
        cancelledAt: null,
        cancelledById: null,
        approvalSnapshot: approvalSnapshot as any,
      },
    });

    await this.enqueueAttendanceRecalculationForOffsite(request, actorId, 'RETURN_FOR_REVIEW');

    await this.notifyOffsiteSafely('แจ้งเตือนคำขอทำงานนอกสถานที่ถูกส่งกลับให้ตรวจสอบ', async () => {
      await this.notificationsService.closeOffsitePendingNotifications(id);
      await this.notificationsService.notifyOffsiteReturnedForReview(id);
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async cancelMy(id: string, dto: OffsiteWorkActionDto, currentUser: CurrentUserLike) {
    await this.ensureMyRequest(id, currentUser);

    const request = await (this.prisma as any).offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!request) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');

    if (
      request.status === OffsiteRequestStatus.SUBMITTED ||
      request.status === OffsiteRequestStatus.MANAGER_APPROVED
    ) {
      return this.withdrawSubmittedToDraft(id, dto, currentUser);
    }

    return this.cancel(id, dto, currentUser);
  }

  async deleteMy(id: string, currentUser: CurrentUserLike) {
    await this.ensureMyRequest(id, currentUser);
    const prisma = this.prisma as any;
    const request = await prisma.offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!request) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');
    if (this.isApprovalLockedStatus(request.status)) {
      throw new BadRequestException('รายการที่อนุมัติแล้วไม่สามารถลบได้');
    }

    await prisma.offsiteWorkRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { id, deleted: true };
  }

  async withdrawSubmittedToDraft(
    id: string,
    dto: OffsiteWorkActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const prisma = this.prisma as any;
    const request = await prisma.offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
    });

    if (!request) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');
    if (
      request.status !== OffsiteRequestStatus.SUBMITTED &&
      request.status !== OffsiteRequestStatus.MANAGER_APPROVED
    ) {
      throw new BadRequestException('ยกเลิกการส่งได้เฉพาะรายการที่อยู่ระหว่างรออนุมัติเท่านั้น');
    }

    const approvalSnapshot = this.markAllPendingSnapshotCancelled(
      request.approvalSnapshot,
      actorId,
      {
        ...dto,
        reason:
          dto.reason?.trim() ||
          'ยกเลิกการส่งเพื่อแก้ไขและส่งใหม่',
        note:
          dto.note?.trim() ||
          'ผู้ยื่นถอนคำขอออกจากคิวอนุมัติ เพื่อแก้ไขและส่งใหม่',
      },
    );

    await prisma.offsiteWorkRequest.update({
      where: { id },
      data: {
        status: OffsiteRequestStatus.DRAFT,
        submittedAt: null,
        submittedById: null,
        approvedAt: null,
        approvedById: null,
        rejectedAt: null,
        rejectedById: null,
        cancelledAt: null,
        cancelledById: null,
        approvalSnapshot: approvalSnapshot as any,
      },
    });

    await this.enqueueAttendanceRecalculationForOffsite(request, actorId, 'WITHDRAW_TO_DRAFT');

    await this.notifyOffsiteSafely('ปิดแจ้งเตือนคำขอทำงานนอกสถานที่ที่ถูกยกเลิกการส่ง', () =>
      this.notificationsService.closeOffsitePendingNotifications(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async cancel(id: string, dto: OffsiteWorkActionDto, currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);
    const prisma = this.prisma as any;
    const request = await prisma.offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
    });

    if (!request) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');
    if (OFFSITE_CLOSED_STATUSES.includes(request.status)) {
      throw new BadRequestException('รายการนี้ถูกปิดสถานะแล้ว');
    }

    // คำขอที่อนุมัติแล้วและวันงานอยู่ในงวดปิด ยกเลิกไม่ได้ — coverage ถูกใช้คิดเงินไปแล้ว
    if (request.status === OffsiteRequestStatus.APPROVED) {
      await assertWorkDateNotLocked(
        this.prisma as never,
        request.employeeId,
        request.workDate,
      );
    }

    const approvalSnapshot = this.markAllPendingSnapshotCancelled(
      request.approvalSnapshot,
      actorId,
      dto,
    );

    await prisma.offsiteWorkRequest.update({
      where: { id },
      data: {
        status: OffsiteRequestStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: actorId,
        approvalSnapshot: approvalSnapshot as any,
      },
    });

    await this.enqueueAttendanceRecalculationForOffsite(request, actorId, 'CANCEL');

    await this.notifyOffsiteSafely('ปิดแจ้งเตือนคำขอทำงานนอกสถานที่ที่ถูกยกเลิก', () =>
      this.notificationsService.closeOffsitePendingNotifications(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async verifyLocation(dto: VerifyOffsiteLocationDto, currentUser: CurrentUserLike) {
    const employee = await this.resolveCurrentEmployee(currentUser);
    const punchedAt = dto.punchedAt ? new Date(dto.punchedAt) : new Date();
    if (Number.isNaN(punchedAt.getTime())) {
      throw new BadRequestException('เวลาที่ส่งมาไม่ถูกต้อง');
    }

    return this.locationVerification.verifyForPunch({
      employeeId: employee.id,
      workDate: this.getWorkDateFromLogTime(punchedAt),
      punchedAt,
      offsiteRequestId: dto.offsiteRequestId,
    });
  }

  private async actOnApproval(
    id: string,
    dto: OffsiteWorkActionDto,
    currentUser: CurrentUserLike,
    action: 'APPROVED' | 'REJECTED',
  ) {
    const actorId = this.getActorId(currentUser);
    const actorEmployee = await this.findEmployeeByUserId(actorId);
    const prisma = this.prisma as any;
    const request = await prisma.offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        employeeId: true,
        workDate: true,
        status: true,
        approvalSnapshot: true,
      },
    });

    if (!request) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่');
    if (![OffsiteRequestStatus.SUBMITTED, OffsiteRequestStatus.MANAGER_APPROVED].includes(request.status)) {
      throw new BadRequestException('อนุมัติ/ไม่อนุมัติได้เฉพาะรายการที่อยู่ระหว่างรออนุมัติเท่านั้น');
    }

    // ห้ามอนุมัติงานนอกสถานที่ลงวันที่ปิดงวดแล้ว — coverage จะไม่ถูกคำนวณตาม
    if (action === 'APPROVED') {
      await assertWorkDateNotLocked(
        this.prisma as never,
        request.employeeId,
        request.workDate,
      );
    }

    const requestEmployee = await this.ensureEmployeeById(request.employeeId);
    await this.ensureActorIsNotRequester(
      { employeeId: request.employeeId, requesterUserId: requestEmployee.userId ?? null },
      actorId,
      actorEmployee?.id ?? null,
    );

    const approvalSnapshot = this.parseApprovalSnapshot(request.approvalSnapshot);
    const pendingIndex = approvalSnapshot.steps.findIndex((step) => step.status === 'PENDING');
    if (pendingIndex < 0) {
      throw new BadRequestException('ไม่พบขั้นอนุมัติปัจจุบัน');
    }

    const currentStep = approvalSnapshot.steps[pendingIndex];

    await this.ensureActorCanActCurrentStep(currentStep, actorId, actorEmployee?.id ?? null);

    currentStep.status = action;
    currentStep.actedAt = new Date().toISOString();
    currentStep.actedById = actorId;
    currentStep.reason = dto.reason?.trim() || null;
    currentStep.note = dto.note?.trim() || null;

    const updateData: Record<string, any> = {
      approvalSnapshot: approvalSnapshot as any,
    };

    if (action === 'REJECTED') {
      updateData.status = OffsiteRequestStatus.REJECTED;
      updateData.rejectedAt = new Date();
      updateData.rejectedById = actorId;
      this.cancelWaitingSteps(approvalSnapshot.steps);
    } else {
      const nextStep = approvalSnapshot.steps.find((step) => step.status === 'WAITING');
      if (nextStep) {
        nextStep.status = 'PENDING';
        updateData.status = OffsiteRequestStatus.SUBMITTED;
      } else {
        updateData.status = OffsiteRequestStatus.APPROVED;
        updateData.approvedAt = new Date();
        updateData.approvedById = actorId;
      }
    }

    await prisma.offsiteWorkRequest.update({
      where: { id },
      data: updateData,
    });

    await this.enqueueAttendanceRecalculationForOffsite(
      request,
      actorId,
      action === 'APPROVED' ? 'APPROVE' : 'REJECT',
    );

    await this.notifyOffsiteSafely('อัปเดตแจ้งเตือนหลังดำเนินการคำขอทำงานนอกสถานที่', async () => {
      await this.notificationsService.closeOffsitePendingNotifications(id);

      const latest = await prisma.offsiteWorkRequest.findFirst({
        where: { id, deletedAt: null },
        select: { status: true },
      });

      if (latest?.status === OffsiteRequestStatus.SUBMITTED || latest?.status === OffsiteRequestStatus.MANAGER_APPROVED) {
        await this.notificationsService.notifyOffsitePendingApproval(id);
      }

      if (latest?.status === OffsiteRequestStatus.APPROVED || latest?.status === OffsiteRequestStatus.HR_APPROVED) {
        await this.notificationsService.notifyOffsiteApproved(id);
      }

      if (
        latest?.status === OffsiteRequestStatus.REJECTED ||
        latest?.status === OffsiteRequestStatus.MANAGER_REJECTED ||
        latest?.status === OffsiteRequestStatus.HR_REJECTED
      ) {
        await this.notificationsService.notifyOffsiteRejected(id);
      }
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }


  private async enqueueAttendanceRecalculationForOffsite(
    request: { id: string; employeeId: string; workDate: Date },
    actorId: string,
    sourceAction: string,
  ) {
    await this.attendanceRecalculation.enqueueDate({
      employeeId: request.employeeId,
      startDate: request.workDate,
      requestedById: actorId,
      sourceType: 'OFFSITE_REQUEST',
      sourceId: request.id,
      sourceAction,
    });
  }

  private notifyOffsiteSafely(
    actionDescription: string,
    callback: () => Promise<unknown>,
  ) {
    void Promise.resolve()
      .then(callback)
      .catch((error) => {
        console.error(`[OffsiteNotification] ${actionDescription} ไม่สำเร็จ`, error);
      });
  }

  private buildWhere(query: ListOffsiteWorkRequestsQueryDto): Record<string, any> {
    const where: any = { deletedAt: null };

    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    if (query.locationType) where.locationType = query.locationType;
    if (query.dateFrom || query.dateTo) {
      where.workDate = {};
      if (query.dateFrom) where.workDate.gte = this.parseDateOnly(query.dateFrom);
      if (query.dateTo) where.workDate.lte = this.parseDateOnly(query.dateTo);
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { requestNo: { contains: search, mode: 'insensitive' } },
        { locationName: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async enrichWithEmployees(items: any[]) {
    if (!items.length) return [];

    const employeeIds = new Set<string>();
    const userIds = new Set<string>();

    for (const item of items) {
      if (item.employeeId) employeeIds.add(item.employeeId);
      if (item.submittedById) userIds.add(item.submittedById);
      if (item.approvedById) userIds.add(item.approvedById);
      if (item.rejectedById) userIds.add(item.rejectedById);
      if (item.cancelledById) userIds.add(item.cancelledById);

      const approvalSnapshot = this.safeParseApprovalSnapshotForDisplay(
        item.approvalSnapshot,
      );

      for (const step of approvalSnapshot?.steps ?? []) {
        if (step.expectedEmployeeId) employeeIds.add(step.expectedEmployeeId);
        if (step.expectedApproverId) userIds.add(step.expectedApproverId);
        if (step.actedById) userIds.add(step.actedById);
      }
    }

    const [employees, users] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: Array.from(employeeIds) } },
        select: {
          id: true,
          employeeCode: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          userId: true,
          company: { select: { id: true, code: true, nameTh: true } },
          branch: { select: { id: true, code: true, nameTh: true } },
          department: { select: { id: true, code: true, nameTh: true } },
          division: { select: { id: true, code: true, nameTh: true } },
          employeeType: { select: { id: true, code: true, nameTh: true } },
          positionMaster: {
            select: { id: true, code: true, nameTh: true, nameEn: true, level: true },
          },
          user: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { id: { in: Array.from(userIds) }, deletedAt: null },
        select: { id: true, email: true, displayName: true, avatarUrl: true },
      }),
    ]);

    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
    const userMap = new Map(users.map((user) => [user.id, user]));

    return items.map((item) => {
      const approvalSnapshot = this.safeParseApprovalSnapshotForDisplay(
        item.approvalSnapshot,
      );
      const enrichedSnapshot = approvalSnapshot
        ? {
            ...approvalSnapshot,
            steps: approvalSnapshot.steps.map((step) => ({
              ...step,
              expectedApprover: step.expectedApproverId
                ? userMap.get(step.expectedApproverId) ?? null
                : null,
              expectedEmployee: step.expectedEmployeeId
                ? employeeMap.get(step.expectedEmployeeId) ?? null
                : null,
              actedBy: step.actedById ? userMap.get(step.actedById) ?? null : null,
            })),
          }
        : null;

      return {
        ...item,
        employee: employeeMap.get(item.employeeId) ?? null,
        submittedBy: item.submittedById ? userMap.get(item.submittedById) ?? null : null,
        approvedBy: item.approvedById ? userMap.get(item.approvedById) ?? null : null,
        rejectedBy: item.rejectedById ? userMap.get(item.rejectedById) ?? null : null,
        cancelledBy: item.cancelledById ? userMap.get(item.cancelledById) ?? null : null,
        approvalSnapshot: enrichedSnapshot,
      };
    });
  }

  private async ensureMyRequest(id: string, currentUser: CurrentUserLike) {
    const employee = await this.resolveCurrentEmployee(currentUser);
    const prisma = this.prisma as any;
    const item = await prisma.offsiteWorkRequest.findFirst({
      where: { id, employeeId: employee.id, deletedAt: null },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่ของคุณ');
    return item;
  }

  private async resolveCurrentEmployee(currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);
    return this.resolveEmployee(undefined, actorId);
  }

  private async resolveEmployee(employeeId: string | undefined, actorId: string) {
    if (employeeId) {
      return this.ensureEmployeeById(employeeId);
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
        status: { notIn: ACTIVE_EMPLOYEE_STATUS_EXCLUDE },
      },
    });

    if (!employee) {
      throw new NotFoundException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถยื่นคำขอ Offsite ได้',
      );
    }

    return employee;
  }

  private async ensureEmployeeById(employeeId: string): Promise<EmployeeForApproval> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
        status: { notIn: ACTIVE_EMPLOYEE_STATUS_EXCLUDE },
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        departmentId: true,
        employeeTypeId: true,
        supervisorId: true,
        userId: true,
      },
    });

    if (!employee) throw new NotFoundException('ไม่พบพนักงาน หรือพนักงานไม่พร้อมใช้งาน');
    return employee;
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;
    if (!actorId) throw new BadRequestException('ไม่พบข้อมูลผู้ใช้งานปัจจุบัน');
    return actorId;
  }

  private async actorHasAnyRole(actorId: string, roleCodes: string[]) {
    if (!roleCodes.length) return false;
    const normalizedCodes = roleCodes.map((code) => code.toUpperCase());
    const user = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        deletedAt: null,
        roles: {
          some: {
            role: {
              code: { in: normalizedCodes },
              isActive: true,
            },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(user);
  }

  private async actorHasHrRole(actorId: string) {
    return this.actorHasAnyRole(actorId, ['HR_ADMIN', 'SYSTEM_ADMIN', 'SUPER_ADMIN', 'ADMIN']);
  }

  private async ensureActorCanActCurrentStep(
    step: OffsiteApprovalStepSnapshot,
    actorId: string,
    actorEmployeeId: string | null,
  ) {
    if (this.isHrApprovalStep(step)) {
      if (step.expectedApproverId && step.expectedApproverId === actorId) return;
      if (step.expectedEmployeeId && actorEmployeeId && step.expectedEmployeeId === actorEmployeeId) return;
      if (await this.actorHasHrRole(actorId)) return;

      throw new BadRequestException('ผู้ใช้งานปัจจุบันไม่มีสิทธิ์ HR ตรวจสอบคำขอนี้');
    }

    if (step.expectedApproverId && step.expectedApproverId === actorId) return;
    if (step.expectedEmployeeId && actorEmployeeId && step.expectedEmployeeId === actorEmployeeId) return;

    throw new BadRequestException(
      `ผู้ใช้งานปัจจุบันไม่ใช่ผู้อนุมัติที่ถูกกำหนดไว้ในขั้น "${step.nameTh}"`,
    );
  }

  private parseApprovalSnapshot(snapshot: unknown): OffsiteApprovalSnapshot {
    const value = snapshot as OffsiteApprovalSnapshot | null;
    if (!value?.steps?.length) throw new BadRequestException('ไม่พบข้อมูลสายอนุมัติของรายการนี้');
    return {
      ...value,
      steps: value.steps.map((step) => ({ ...step })),
    };
  }

  private safeParseApprovalSnapshotForDisplay(
    snapshot: unknown,
  ): OffsiteApprovalSnapshot | null {
    const value = snapshot as OffsiteApprovalSnapshot | null;

    if (!value || !Array.isArray(value.steps) || value.steps.length === 0) {
      return null;
    }

    return {
      ...value,
      steps: value.steps.map((step) => ({ ...step })),
    };
  }

  private isActorPendingManagerApprover(
    snapshot: unknown,
    actorId: string,
    actorEmployeeId: string | null,
  ) {
    const value = snapshot as OffsiteApprovalSnapshot | null;
    const pendingStep = value?.steps?.find((step) => step.status === 'PENDING');
    if (!pendingStep || this.isHrApprovalStep(pendingStep)) return false;
    return (
      Boolean(pendingStep.expectedApproverId && pendingStep.expectedApproverId === actorId) ||
      Boolean(pendingStep.expectedEmployeeId && actorEmployeeId && pendingStep.expectedEmployeeId === actorEmployeeId)
    );
  }

  private isHrApprovalStep(step?: OffsiteApprovalStepSnapshot | null) {
    if (!step) return false;
    const markers = [step.approverType, step.roleCode, step.nameTh]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase());
    return markers.some((value) => value.includes('HR'));
  }

  private async findEmployeeByUserId(actorId: string) {
    return this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
        status: { notIn: ACTIVE_EMPLOYEE_STATUS_EXCLUDE },
      },
      select: { id: true, userId: true },
    });
  }

  private async ensureActorIsNotRequester(
    request: { employeeId: string; requesterUserId?: string | null },
    actorId: string,
    actorEmployeeId: string | null,
  ) {
    const requesterUserId = request.requesterUserId ?? null;
    const isOwn =
      request.employeeId === actorEmployeeId || requesterUserId === actorId;

    if (!isOwn) return;

    /* ฝ่ายบุคคลอนุมัติของตัวเองได้ — นิยามเดียวกับ canApproveOwnRequest ของสายกลาง */
    if (await this.actorHasAnyRole(actorId, APPROVAL_HR_ROLE_CODES)) return;

    throw new BadRequestException(
      'ไม่สามารถอนุมัติหรือไม่อนุมัติคำขอทำงานนอกสถานที่ของตนเองได้',
    );
  }

  private cancelWaitingSteps(steps: OffsiteApprovalStepSnapshot[]) {
    for (const step of steps) {
      if (step.status === 'WAITING') step.status = 'CANCELLED';
    }
  }

  private markAllPendingSnapshotCancelled(
    snapshot: unknown,
    actorId: string,
    dto: OffsiteWorkActionDto,
  ) {
    const value = snapshot as OffsiteApprovalSnapshot | null;
    if (!value?.steps?.length) return snapshot;
    return {
      ...value,
      steps: value.steps.map((step) =>
        step.status === 'PENDING' || step.status === 'WAITING'
          ? {
              ...step,
              status: 'CANCELLED',
              actedAt: new Date().toISOString(),
              actedById: actorId,
              reason: dto.reason?.trim() || null,
              note: dto.note?.trim() || null,
            }
          : step,
      ),
    };
  }

  private isApprovalLockedStatus(status?: string | null) {
    return String(status ?? '').includes('APPROVED');
  }

  private validateTimeRange(startTime: string, endTime: string) {
    const start = this.parseTimeToMinutes(startTime);
    const end = this.parseTimeToMinutes(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new BadRequestException('ช่วงเวลาทำงานนอกสถานที่ไม่ถูกต้อง');
    }
  }

  private async generateRequestNo(companyId: string) {
    // เลขที่เอกสารต้องอิงวันตามปฏิทินไทย ไม่ใช่ UTC
    // ไม่งั้นคำขอที่ยื่นตอนตีหนึ่งจะได้เลขของเมื่อวาน แล้วชนกับชุดเลขของวันนั้น
    const prefix = `OS-${toThaiDateKey(new Date()).replace(/-/g, '')}`;
    const prisma = this.prisma as any;
    const count = await prisma.offsiteWorkRequest.count({
      where: {
        companyId,
        requestNo: { startsWith: prefix },
      },
    });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  private parseDateOnly(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('วันที่ไม่ถูกต้อง');
    return date;
  }

  private todayBangkokDateOnly() {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return this.parseDateOnly(key);
  }

  private getWorkDateFromLogTime(logTime: Date) {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(logTime);
    return this.parseDateOnly(key);
  }

  private parseTimeToMinutes(time: string) {
    const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return Number.NaN;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return Number.NaN;
    return hour * 60 + minute;
  }
}
