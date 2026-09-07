import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  AttendanceChannel,
  AttendanceEditAction,
  AttendanceLogStatus,
  AttendanceLogType,
  Prisma,
} from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CreateTimeAdjustRequestDto } from "./dto/create-time-adjust-request.dto";
import { ListTimeAdjustRequestsQueryDto } from "./dto/list-time-adjust-requests-query.dto";
import { TimeAdjustRequestActionDto } from "./dto/time-adjust-request-action.dto";
import { UpdateTimeAdjustRequestDto } from "./dto/update-time-adjust-request.dto";
import { UploadTimeAdjustAttachmentDto } from "./dto/upload-time-adjust-attachment.dto";
import { buildTimeAdjustRequestWhere } from "./helpers/time-adjust-search.helper";
import { TimeAdjustApprovalService } from "./services/time-adjust-approval.service";
import { TimeAdjustAttachmentService } from "./services/time-adjust-attachment.service";
import { AttendanceSummaryQueueService } from "../attendance/attendance-summary-queue.service";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";
import {
  assertWithinScope,
  tenantWhere,
} from "../../common/tenant/tenant-scope.util";
import type { CurrentUserLike } from "./types/time-adjust.types";
import {
  parseTimeAdjustDateTime,
  toTimeAdjustDateOnlyFromDate,
} from "./utils/time-adjust-date.util";

/** re-fetch ภายในหลัง action สำเร็จ / ตรวจ ownership แล้ว — ไม่ต้อง scope ซ้ำ */
const INTERNAL_UNSCOPED: TenantScope = {
  level: "GLOBAL",
  companyId: null,
  branchId: null,
};

/*
 * TimeAdjustRequestsService
 * ---------------------------------------------------------
 * Service หลักของคำขอแก้เวลา ทำหน้าที่เป็น facade/orchestrator
 * เพื่อให้ controller และ frontend เรียก method เดิมได้เหมือนเดิม
 *
 * งานที่ยังอยู่ในไฟล์นี้:
 * - find/list/detail
 * - create/update คำขอแก้เวลา
 * - self-service helpers เช่น findMy / updateMy / submitMy
 * - resolve employee/current user
 *
 * งานที่แยกออกไปแล้ว:
 * - TimeAdjustApprovalService: submit/approve/reject/cancel + Approval Matrix
 * - TimeAdjustAttachmentService: ไฟล์แนบ upload/download/remove
 *
 * กติกา refactor:
 * ห้ามเปลี่ยนชื่อ method public ถ้า controller/frontend ยังเรียกอยู่
 */
@Injectable()
export class TimeAdjustRequestsService {
  private readonly logger = new Logger(TimeAdjustRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeAdjustApprovalService: TimeAdjustApprovalService,
    private readonly timeAdjustAttachmentService: TimeAdjustAttachmentService,
    private readonly attendanceSummaryQueue: AttendanceSummaryQueueService,
  ) {}

  async findAll(query: ListTimeAdjustRequestsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // where สำหรับรายการจริง ใช้ทุก filter รวมถึง status/adjustType/targetLogType
    const where = buildTimeAdjustRequestWhere(query, scope);
    // where สำหรับ status tabs ตัด status ออก เพื่อให้ HR เห็นจำนวนทุกสถานะภายใต้ filter ชุดเดียวกัน
    const summaryWhere = buildTimeAdjustRequestWhere(
      {
        ...query,
        status: undefined,
      },
      scope,
    );
    // where สำหรับประเภทคำขอ ตัด status/adjustType ออก เพื่อให้จำนวนประเภทไม่ยึดติดกับแท็บที่เลือกอยู่
    const adjustTypeSummaryWhere = buildTimeAdjustRequestWhere(
      {
        ...query,
        status: undefined,
        adjustType: undefined,
      },
      scope,
    );
    // where สำหรับรายการเวลา ตัด status/targetLogType ออก เพื่อให้จำนวนรายการเวลาไม่ยึดติดกับแท็บที่เลือกอยู่
    const logTypeSummaryWhere = buildTimeAdjustRequestWhere(
      {
        ...query,
        status: undefined,
        targetLogType: undefined,
      },
      scope,
    );

    const [
      items,
      total,
      summaryTotal,
      statusGroups,
      adjustTypeGroups,
      logTypeGroups,
    ] = await this.prisma.$transaction([
      this.prisma.timeAdjustRequest.findMany({
        where,
        include: this.timeAdjustRequestInclude(),
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      this.prisma.timeAdjustRequest.count({ where }),
      this.prisma.timeAdjustRequest.count({ where: summaryWhere }),
      this.prisma.timeAdjustRequest.groupBy({
        by: ["status"],
        where: summaryWhere,
        orderBy: { status: "asc" },
        _count: { _all: true },
      }),
      this.prisma.timeAdjustRequest.groupBy({
        by: ["adjustType"],
        where: adjustTypeSummaryWhere,
        orderBy: { adjustType: "asc" },
        _count: { _all: true },
      }),
      this.prisma.timeAdjustRequest.groupBy({
        by: ["targetLogType"],
        where: logTypeSummaryWhere,
        orderBy: { targetLogType: "asc" },
        _count: { _all: true },
      }),
    ]);

    const repairedItems =
      await this.repairApprovedWrongTimeRequestsIfNeeded(items);
    const enrichedItems = await this.enrichWrongTimeOriginalLogs(repairedItems);

    return {
      items: enrichedItems,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: this.buildRequestSummary(
        summaryTotal,
        statusGroups,
        adjustTypeGroups,
        logTypeGroups,
      ),
    };
  }

  private buildRequestSummary(
    total: number,
    statusGroups: Array<{
      status: string;
      _count?: true | { _all?: number } | null;
    }>,
    adjustTypeGroups: Array<{
      adjustType: string;
      _count?: true | { _all?: number } | null;
    }>,
    logTypeGroups: Array<{
      targetLogType: string;
      _count?: true | { _all?: number } | null;
    }>,
  ) {
    const summary = {
      total,
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      missingCheckIn: 0,
      missingCheckOut: 0,
      missingPunch: 0,
      wrongTime: 0,
      deviceError: 0,
      outsideWork: 0,
      other: 0,
      checkIn: 0,
      checkOut: 0,
      breakStart: 0,
      breakEnd: 0,
    };

    for (const group of statusGroups) {
      const count = this.getGroupCount(group._count);

      if (group.status === "DRAFT") summary.draft = count;
      if (group.status === "SUBMITTED") summary.submitted = count;
      if (group.status === "APPROVED") summary.approved = count;
      if (group.status === "REJECTED") summary.rejected = count;
      if (group.status === "CANCELLED") summary.cancelled = count;
    }

    for (const group of adjustTypeGroups) {
      const count = this.getGroupCount(group._count);

      if (group.adjustType === "MISSING_CHECK_IN")
        summary.missingCheckIn = count;
      if (group.adjustType === "MISSING_CHECK_OUT")
        summary.missingCheckOut = count;
      if (group.adjustType === "WRONG_TIME") summary.wrongTime = count;
      if (group.adjustType === "DEVICE_ERROR") summary.deviceError = count;
      if (group.adjustType === "OUTSIDE_WORK") summary.outsideWork = count;
      if (group.adjustType === "OTHER") summary.other = count;
    }

    for (const group of logTypeGroups) {
      const count = this.getGroupCount(group._count);

      if (group.targetLogType === "CHECK_IN") summary.checkIn = count;
      if (group.targetLogType === "CHECK_OUT") summary.checkOut = count;
      if (group.targetLogType === "BREAK_START") summary.breakStart = count;
      if (group.targetLogType === "BREAK_END") summary.breakEnd = count;
    }

    summary.missingPunch = summary.missingCheckIn + summary.missingCheckOut;

    return summary;
  }

  private getGroupCount(value: true | { _all?: number } | null | undefined) {
    if (!value || value === true) return 0;
    return Number(value._all ?? 0);
  }

  async findOne(id: string, scope: TenantScope) {
    const scopeWhere = tenantWhere(scope) as Prisma.EmployeeWhereInput;

    const item = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(Object.keys(scopeWhere).length > 0
          ? { employee: { is: scopeWhere } }
          : {}),
      },
      include: this.timeAdjustRequestInclude(),
    });

    if (!item) {
      throw new NotFoundException("ไม่พบคำขอแก้เวลา");
    }

    const [repairedItem] = await this.repairApprovedWrongTimeRequestsIfNeeded([
      item,
    ]);
    const [enrichedItem] = await this.enrichWrongTimeOriginalLogs([
      repairedItem,
    ]);
    return enrichedItem;
  }

  async findMy(
    query: ListTimeAdjustRequestsQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(undefined, actorId);

    // employeeId already restricts to self — no extra tenant filter needed.
    return this.findAll(
      {
        ...query,
        employeeId: employee.id,
      },
      INTERNAL_UNSCOPED,
    );
  }

  /**
   * Mobile read-model สำหรับ timeline รวม
   *
   * Mobile mapper เรียงตาม "วันที่" ของ requestedLogTime แล้วใช้ createdAt เป็น
   * tie-breaker ดังนั้นห้ามใช้ timestamp เต็มเป็นลำดับสุดท้าย เพราะรายการหลายใบ
   * ในวันเดียวกันอาจข้ามหน้าไม่ตรงกับ sortMobileRequests
   */
  async findMyForMobileTimeline(
    query: ListTimeAdjustRequestsQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(undefined, actorId);
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.max(Number(query.pageSize ?? 20), 1);
    const start = (page - 1) * pageSize;
    const windowEnd = page * pageSize;
    const where = buildTimeAdjustRequestWhere(
      { ...query, employeeId: employee.id },
      INTERNAL_UNSCOPED,
    );
    const select = {
      id: true,
      requestNo: true,
      status: true,
      reason: true,
      adjustType: true,
      requestedLogTime: true,
      submittedAt: true,
      createdAt: true,
      approvalSteps: {
        select: {
          status: true,
          stepNo: true,
          actedBy: { select: { displayName: true } },
          expectedApprover: { select: { displayName: true } },
          expectedEmployee: {
            select: { displayName: true, firstName: true, lastName: true },
          },
          position: { select: { nameTh: true } },
        },
        orderBy: { stepNo: 'asc' },
      },
    } as const;

    const [windowRows, total] = await this.prisma.$transaction([
      this.prisma.timeAdjustRequest.findMany({
        where,
        select,
        orderBy: [{ requestedLogTime: 'desc' }, { createdAt: 'desc' }],
        take: windowEnd,
      }),
      this.prisma.timeAdjustRequest.count({ where }),
    ]);

    if (windowRows.length === 0) {
      return {
        items: [],
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }

    /*
     * ดึงเพิ่มเฉพาะวัน boundary เพื่อให้มีทุก candidate ที่อาจแซงกันด้วย
     * createdAt — ขอบเขตยังจำกัดอยู่แค่หนึ่งวัน ไม่ย้อนอ่านประวัติทั้งหมด
     */
    const boundary = windowRows[windowRows.length - 1].requestedLogTime;
    const boundaryKey = boundary.toISOString().slice(0, 10);
    const boundaryStart = new Date(`${boundaryKey}T00:00:00.000Z`);
    const boundaryEnd = new Date(boundaryStart);
    boundaryEnd.setUTCDate(boundaryEnd.getUTCDate() + 1);

    const boundaryRows = await this.prisma.timeAdjustRequest.findMany({
      where: {
        AND: [
          where,
          {
            requestedLogTime: {
              gte: boundaryStart,
              lt: boundaryEnd,
            },
          },
        ],
      },
      select,
      orderBy: { createdAt: 'desc' },
    });

    const byId = new Map(
      [...windowRows, ...boundaryRows].map((row) => [row.id, row]),
    );
    const sorted = [...byId.values()].sort((left, right) => {
      const leftDate = left.requestedLogTime.toISOString().slice(0, 10);
      const rightDate = right.requestedLogTime.toISOString().slice(0, 10);

      if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
      return right.createdAt.getTime() - left.createdAt.getTime();
    });

    return {
      items: sorted.slice(start, start + pageSize),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findMyOne(id: string, currentUser: CurrentUserLike) {
    await this.ensureMyTimeAdjustRequest(id, currentUser);

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async createMy(
    dto: CreateTimeAdjustRequestDto,
    currentUser: CurrentUserLike,
  ) {
    return this.create(
      {
        ...dto,
        employeeId: undefined,
      },
      currentUser,
      INTERNAL_UNSCOPED,
    );
  }

  async updateMy(
    id: string,
    dto: UpdateTimeAdjustRequestDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyTimeAdjustRequest(id, currentUser);

    // ยืนยันความเป็นเจ้าของแล้ว จึงไม่ต้อง scope ซ้ำ
    return this.update(id, dto, INTERNAL_UNSCOPED);
  }

  async submitMy(id: string, currentUser: CurrentUserLike) {
    await this.ensureMyTimeAdjustRequest(id, currentUser);

    return this.submit(id, currentUser);
  }

  async cancelMy(
    id: string,
    dto: TimeAdjustRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyTimeAdjustRequest(id, currentUser);

    const request = await this.findOne(id, INTERNAL_UNSCOPED);

    if (request.status === "SUBMITTED") {
      return this.withdrawSubmittedToDraft(id, dto, currentUser);
    }

    return this.cancel(id, dto, currentUser);
  }

  async findMyAttachments(
    timeAdjustRequestId: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyTimeAdjustRequest(timeAdjustRequestId, currentUser);

    return this.findAttachments(timeAdjustRequestId, INTERNAL_UNSCOPED);
  }

  async uploadMyAttachment(
    timeAdjustRequestId: string,
    dto: UploadTimeAdjustAttachmentDto,
    file: Express.Multer.File,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyTimeAdjustRequest(timeAdjustRequestId, currentUser);

    return this.uploadAttachment(
      timeAdjustRequestId,
      dto,
      file,
      INTERNAL_UNSCOPED,
      this.getActorId(currentUser),
    );
  }

  async getMyAttachmentFileForDownload(
    timeAdjustRequestId: string,
    attachmentId: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyTimeAdjustRequest(timeAdjustRequestId, currentUser);

    return this.getAttachmentFileForDownload(
      timeAdjustRequestId,
      attachmentId,
      INTERNAL_UNSCOPED,
    );
  }

  async removeMyAttachment(
    timeAdjustRequestId: string,
    attachmentId: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyTimeAdjustRequest(timeAdjustRequestId, currentUser);

    return this.removeAttachment(
      timeAdjustRequestId,
      attachmentId,
      INTERNAL_UNSCOPED,
    );
  }

  async findMyAttendanceLogs(
    query: ListTimeAdjustRequestsQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(undefined, actorId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AttendanceLogWhereInput = {
      employeeId: employee.id,
      deletedAt: null,
    };

    if (query.targetLogType) where.logType = query.targetLogType;

    if (query.dateFrom || query.dateTo) {
      where.logTime = {};

      if (query.dateFrom) {
        where.logTime.gte = parseTimeAdjustDateTime(
          `${query.dateFrom}T00:00:00.000+07:00`,
        );
      }

      if (query.dateTo) {
        where.logTime.lte = parseTimeAdjustDateTime(
          `${query.dateTo}T23:59:59.999+07:00`,
        );
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceLog.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              title: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
              companyId: true,
              branchId: true,
              departmentId: true,
              divisionId: true,
              employeeTypeId: true,
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
              division: {
                select: {
                  id: true,
                  code: true,
                  nameTh: true,
                },
              },
            },
          },
        },
        orderBy: {
          logTime: "desc",
        },
        skip,
        take: pageSize,
      }),
      this.prisma.attendanceLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * บังคับให้มีรูปหลักฐานอย่างน้อยหนึ่งไฟล์ก่อนเข้าคิวอนุมัติ
   *
   * ตรวจที่ตอนส่ง ไม่ใช่ตอนแนบ เพราะไฟล์อัปโหลดได้ต่อเมื่อมีใบแล้วเท่านั้น
   * และผู้ใช้ลบไฟล์ทิ้งหลังแนบได้ จุดส่งจึงเป็นด่านเดียวที่กันได้จริงทุกช่องทาง
   */
  private async ensureEvidenceAttached(timeAdjustRequestId: string) {
    const attachments = await this.prisma.timeAdjustAttachment.count({
      where: {
        timeAdjustRequestId,
        deletedAt: null,
      },
    });

    if (attachments === 0) {
      throw new BadRequestException(
        "กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูปก่อนส่งคำขอแก้เวลา",
      );
    }
  }

  async create(
    dto: CreateTimeAdjustRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    /*
     * สร้างพร้อมส่งไม่ได้อีกแล้ว
     *
     * คำขอแก้เวลาต้องมีรูปหลักฐานติดมาด้วยเสมอ และรูปจะอัปโหลดได้ต่อเมื่อมีใบอยู่แล้ว
     * ทางเดียวที่หลักฐานจะครบตอนเข้าคิวอนุมัติคือ สร้างร่าง → แนบรูป → ส่ง
     */
    if (dto.submit) {
      throw new BadRequestException(
        "คำขอแก้เวลาต้องแนบรูปหลักฐานก่อนส่ง กรุณาบันทึกร่าง แนบรูป แล้วจึงกดส่งคำขอ",
      );
    }

    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(dto.employeeId, actorId);
    // พนักงานปลายทางต้องอยู่ในบริษัท/สาขาของผู้สร้าง
    assertWithinScope(scope, {
      companyId: employee.companyId,
      branchId: employee.branchId,
    });

    const requestedLogTime = parseTimeAdjustDateTime(dto.requestedLogTime);
    const originalLog = dto.originalAttendanceLogId
      ? await this.findOriginalAttendanceLog(
          dto.originalAttendanceLogId,
          employee.id,
          {
            targetLogType: dto.targetLogType,
            requestedLogTime,
          },
        )
      : await this.findFallbackOriginalAttendanceLogForWrongTime({
          adjustType: dto.adjustType,
          employeeId: employee.id,
          targetLogType: dto.targetLogType,
          requestedLogTime,
        });

    this.ensureWrongTimeHasOriginal(
      dto.adjustType,
      originalLog,
      requestedLogTime,
      dto.targetLogType,
    );

    const requestNo = await this.generateRequestNo();

    const created = await this.prisma.timeAdjustRequest.create({
      data: {
        requestNo,
        employeeId: employee.id,
        originalAttendanceLogId: originalLog?.id ?? null,
        adjustType: dto.adjustType,
        targetLogType: dto.targetLogType,
        originalLogTime: originalLog?.logTime ?? null,
        requestedLogTime,
        reason: dto.reason.trim(),
        note: dto.note?.trim() || null,
        status: "DRAFT",
      },
    });

    return this.findOne(created.id, INTERNAL_UNSCOPED);
  }

  async update(
    id: string,
    dto: UpdateTimeAdjustRequestDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            companyId: true,
            branchId: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบคำขอแก้เวลา");
    }

    assertWithinScope(scope, {
      companyId: current.employee.companyId,
      branchId: current.employee.branchId,
    });

    if (current.status === "APPROVED") {
      throw new BadRequestException("ไม่สามารถแก้ไขคำขอที่อนุมัติแล้ว");
    }

    const requestedLogTime = dto.requestedLogTime
      ? parseTimeAdjustDateTime(dto.requestedLogTime)
      : current.requestedLogTime;
    const nextAdjustType = dto.adjustType ?? current.adjustType;
    const nextTargetLogType = dto.targetLogType ?? current.targetLogType;

    const originalLog =
      dto.originalAttendanceLogId === undefined
        ? current.originalAttendanceLogId || current.originalLogTime
          ? undefined
          : await this.findFallbackOriginalAttendanceLogForWrongTime({
              adjustType: nextAdjustType,
              employeeId: current.employeeId,
              targetLogType: nextTargetLogType,
              requestedLogTime,
            })
        : dto.originalAttendanceLogId
          ? await this.findOriginalAttendanceLog(
              dto.originalAttendanceLogId,
              current.employeeId,
              {
                targetLogType: nextTargetLogType,
                requestedLogTime,
              },
            )
          : await this.findFallbackOriginalAttendanceLogForWrongTime({
              adjustType: nextAdjustType,
              employeeId: current.employeeId,
              targetLogType: nextTargetLogType,
              requestedLogTime,
            });

    if (nextAdjustType === "WRONG_TIME") {
      const hasUsableCurrentOriginal = Boolean(
        current.originalAttendanceLogId &&
        (!current.originalLogTime ||
          !this.isSameBangkokClockMinute(
            current.originalLogTime,
            requestedLogTime,
          )),
      );
      if (originalLog !== undefined) {
        this.ensureWrongTimeHasOriginal(
          nextAdjustType,
          originalLog,
          requestedLogTime,
          nextTargetLogType,
        );
      } else if (!hasUsableCurrentOriginal) {
        this.ensureWrongTimeHasOriginal(
          nextAdjustType,
          null,
          requestedLogTime,
          nextTargetLogType,
        );
      }
    }

    await this.prisma.timeAdjustRequest.update({
      where: { id },
      data: {
        originalAttendanceLogId:
          originalLog === undefined ? undefined : (originalLog?.id ?? null),
        originalLogTime:
          originalLog === undefined
            ? undefined
            : (originalLog?.logTime ?? null),
        adjustType: dto.adjustType,
        targetLogType: dto.targetLogType,
        requestedLogTime: dto.requestedLogTime ? requestedLogTime : undefined,
        reason: dto.reason?.trim() || undefined,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async submit(id: string, currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);
    await this.ensureEvidenceAttached(id);
    await this.ensureWrongTimeOriginalSnapshot(id);
    await this.timeAdjustApprovalService.submit(id, actorId);
    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async approve(
    id: string,
    dto: TimeAdjustRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    await this.ensureWrongTimeOriginalSnapshot(id);
    await this.timeAdjustApprovalService.approve(id, dto, actorId);
    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async reject(
    id: string,
    dto: TimeAdjustRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    await this.timeAdjustApprovalService.reject(id, dto, actorId);
    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async returnForReview(
    id: string,
    dto: TimeAdjustRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    await this.timeAdjustApprovalService.returnForReview(id, dto, actorId);
    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async cancel(
    id: string,
    dto: TimeAdjustRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    await this.timeAdjustApprovalService.cancel(id, dto, actorId);
    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async withdrawSubmittedToDraft(
    id: string,
    dto: TimeAdjustRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    await this.timeAdjustApprovalService.withdrawSubmittedToDraft(
      id,
      dto,
      actorId,
    );
    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async findAttachments(timeAdjustRequestId: string, scope: TenantScope) {
    return this.timeAdjustAttachmentService.findAttachments(
      timeAdjustRequestId,
      scope,
    );
  }

  async uploadAttachment(
    timeAdjustRequestId: string,
    dto: UploadTimeAdjustAttachmentDto,
    file: Express.Multer.File,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    return this.timeAdjustAttachmentService.uploadAttachment(
      timeAdjustRequestId,
      dto,
      file,
      scope,
      currentUserId,
    );
  }

  async getAttachmentFileForDownload(
    timeAdjustRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    return this.timeAdjustAttachmentService.getAttachmentFileForDownload(
      timeAdjustRequestId,
      attachmentId,
      scope,
    );
  }

  async removeAttachment(
    timeAdjustRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    return this.timeAdjustAttachmentService.removeAttachment(
      timeAdjustRequestId,
      attachmentId,
      scope,
    );
  }

  private timeAdjustRequestInclude() {
    return {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          positionId: true,
          userId: true,
          companyId: true,
          branchId: true,
          departmentId: true,
          divisionId: true,
          employeeTypeId: true,
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
          division: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
          employeeType: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
          positionMaster: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
              level: true,
              sortOrder: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
      originalAttendanceLog: true,
      appliedAttendanceLog: true,
      submittedBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      rejectedBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      cancelledBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      logs: {
        include: {
          actedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      approvalSteps: {
        orderBy: {
          stepNo: "asc",
        },
        include: {
          expectedApprover: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          expectedEmployee: {
            select: {
              id: true,
              employeeCode: true,
              title: true,
              firstName: true,
              lastName: true,
              displayName: true,
              position: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
              positionMaster: {
                select: {
                  id: true,
                  code: true,
                  nameTh: true,
                },
              },
            },
          },
          position: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
              level: true,
            },
          },
          actedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
      attachments: {
        where: {
          deletedAt: null,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    } satisfies Prisma.TimeAdjustRequestInclude;
  }

  private async ensureMyTimeAdjustRequest(
    id: string,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(undefined, actorId);

    const request = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        employeeId: employee.id,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!request) {
      throw new NotFoundException("ไม่พบคำขอแก้เวลาของคุณ");
    }

    return request;
  }

  private async resolveEmployee(
    employeeId: string | undefined,
    actorId: string,
  ) {
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          deletedAt: null,
          status: {
            notIn: ["RESIGNED", "TERMINATED", "INACTIVE"],
          },
        },
      });

      if (!employee) {
        throw new NotFoundException("ไม่พบพนักงาน หรือพนักงานไม่พร้อมใช้งาน");
      }

      return employee;
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
        status: {
          notIn: ["RESIGNED", "TERMINATED", "INACTIVE"],
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(
        "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถยื่นคำขอแก้เวลาเองได้",
      );
    }

    return employee;
  }

  private ensureWrongTimeHasOriginal(
    adjustType: string | null | undefined,
    originalLog: { id: string; logTime: Date } | null | undefined,
    requestedLogTime?: Date,
    targetLogType?: AttendanceLogType | null,
  ) {
    if (adjustType !== "WRONG_TIME") return;

    if (
      originalLog &&
      (!requestedLogTime ||
        !this.isSameBangkokClockMinute(originalLog.logTime, requestedLogTime))
    ) {
      return;
    }

    throw new BadRequestException(
      targetLogType && requestedLogTime
        ? this.getWrongTimeOriginalSlotErrorMessage(targetLogType, requestedLogTime)
        : "คำขอประเภทเวลาผิดต้องมีรายการลงเวลาเดิมที่ต่างจากเวลาที่ขอแก้ กรุณาตรวจสอบประวัติลงเวลาหรือเลือกประเภทคำขอให้ถูกต้อง",
    );
  }

  private async repairApprovedWrongTimeRequestsIfNeeded<
    T extends {
      id: string;
      requestNo?: string | null;
      adjustType: string;
      status: string;
      employeeId: string;
      targetLogType: Prisma.AttendanceLogWhereInput["logType"];
      requestedLogTime: Date;
      originalLogTime?: Date | null;
      originalAttendanceLogId?: string | null;
      appliedAttendanceLogId?: string | null;
      approvedById?: string | null;
      submittedById?: string | null;
      employee?: { userId?: string | null } | null;
    },
  >(items: T[]) {
    const repairedItems: T[] = [];

    for (const item of items) {
      repairedItems.push(
        await this.repairApprovedWrongTimeRequestIfNeeded(item),
      );
    }

    return repairedItems;
  }

  private async repairApprovedWrongTimeRequestIfNeeded<
    T extends {
      id: string;
      requestNo?: string | null;
      adjustType: string;
      status: string;
      employeeId: string;
      targetLogType: Prisma.AttendanceLogWhereInput["logType"];
      requestedLogTime: Date;
      originalLogTime?: Date | null;
      originalAttendanceLogId?: string | null;
      appliedAttendanceLogId?: string | null;
      approvedById?: string | null;
      submittedById?: string | null;
      employee?: { userId?: string | null } | null;
    },
  >(item: T): Promise<T> {
    if (item.adjustType !== "WRONG_TIME" || item.status !== "APPROVED") {
      return item;
    }

    if (
      item.originalLogTime &&
      !this.isSameBangkokClockMinute(
        item.originalLogTime,
        item.requestedLogTime,
      )
    ) {
      return item;
    }

    const snapshot = await this.findOriginalLogTimeFromEditLog(item.id);

    if (
      snapshot?.oldLogTime &&
      !this.isSameBangkokClockMinute(snapshot.oldLogTime, item.requestedLogTime)
    ) {
      await this.prisma.timeAdjustRequest.update({
        where: { id: item.id },
        data: {
          originalAttendanceLogId:
            item.originalAttendanceLogId ?? snapshot.attendanceLogId,
          originalLogTime: snapshot.oldLogTime,
        },
      });

      return {
        ...item,
        originalAttendanceLogId:
          item.originalAttendanceLogId ?? snapshot.attendanceLogId,
        originalLogTime: snapshot.oldLogTime,
      };
    }

    const fallbackLog =
      await this.findFallbackOriginalAttendanceLogForWrongTime({
        adjustType: item.adjustType,
        employeeId: item.employeeId,
        targetLogType: item.targetLogType,
        requestedLogTime: item.requestedLogTime,
        excludeLogIds: [item.appliedAttendanceLogId].filter(
          Boolean,
        ) as string[],
      });

    if (
      !fallbackLog ||
      this.isSameBangkokClockMinute(fallbackLog.logTime, item.requestedLogTime)
    ) {
      return item;
    }

    const actorId =
      item.approvedById ?? item.submittedById ?? item.employee?.userId ?? null;
    const repaired = await this.repairApprovedWrongTimeRequestWithOriginalLog({
      requestId: item.id,
      requestNo: item.requestNo,
      fallbackLogId: fallbackLog.id,
      appliedAttendanceLogId: item.appliedAttendanceLogId ?? null,
      requestedLogTime: item.requestedLogTime,
      targetLogType: item.targetLogType,
      actorId,
    });

    return {
      ...item,
      originalAttendanceLogId: repaired.originalAttendanceLogId,
      originalLogTime: repaired.originalLogTime,
      appliedAttendanceLogId: repaired.appliedAttendanceLogId,
    };
  }

  private async repairApprovedWrongTimeRequestWithOriginalLog(params: {
    requestId: string;
    requestNo?: string | null;
    fallbackLogId: string;
    appliedAttendanceLogId: string | null;
    requestedLogTime: Date;
    targetLogType: Prisma.AttendanceLogWhereInput["logType"];
    actorId: string | null;
  }) {
    const repaired = await this.prisma.$transaction(async (tx) => {
      const current = await tx.timeAdjustRequest.findFirst({
        where: {
          id: params.requestId,
          deletedAt: null,
        },
        include: {
          originalAttendanceLog: true,
          appliedAttendanceLog: true,
        },
      });

      if (!current || current.adjustType !== "WRONG_TIME") {
        return {
          originalAttendanceLogId: null,
          originalLogTime: null,
          appliedAttendanceLogId: params.appliedAttendanceLogId,
          employeeId: "",
          requestedLogTime: params.requestedLogTime,
          approvedById: null,
          submittedById: null,
        };
      }

      if (
        current.originalLogTime &&
        !this.isSameBangkokClockMinute(
          current.originalLogTime,
          current.requestedLogTime,
        )
      ) {
        return {
          originalAttendanceLogId: current.originalAttendanceLogId,
          originalLogTime: current.originalLogTime,
          appliedAttendanceLogId: current.appliedAttendanceLogId,
          employeeId: current.employeeId,
          requestedLogTime: current.requestedLogTime,
          approvedById: current.approvedById,
          submittedById: current.submittedById,
        };
      }

      const originalLog = await tx.attendanceLog.findFirst({
        where: {
          id: params.fallbackLogId,
          employeeId: current.employeeId,
          deletedAt: null,
          status: { not: AttendanceLogStatus.CANCELLED },
        },
      });

      if (!originalLog) {
        return {
          originalAttendanceLogId: current.originalAttendanceLogId,
          originalLogTime: current.originalLogTime,
          appliedAttendanceLogId: current.appliedAttendanceLogId,
          employeeId: current.employeeId,
          requestedLogTime: current.requestedLogTime,
          approvedById: current.approvedById,
          submittedById: current.submittedById,
        };
      }

      const oldOriginalLogTime = originalLog.logTime;
      const appliedLog =
        current.appliedAttendanceLogId &&
        current.appliedAttendanceLogId !== originalLog.id
          ? (current.appliedAttendanceLog ??
            (await tx.attendanceLog.findFirst({
              where: {
                id: current.appliedAttendanceLogId,
                employeeId: current.employeeId,
                deletedAt: null,
              },
            })))
          : null;

      if (appliedLog && appliedLog.status !== AttendanceLogStatus.CANCELLED) {
        await tx.attendanceLog.update({
          where: { id: appliedLog.id },
          data: {
            status: AttendanceLogStatus.CANCELLED,
            note: `ยกเลิกรายการซ้ำจากคำขอแก้เวลา ${current.requestNo ?? current.id} หลังผูกกลับรายการเวลาเดิม`,
          },
        });

        await tx.attendanceEditLog.create({
          data: {
            attendanceLogId: appliedLog.id,
            action: AttendanceEditAction.CANCEL,
            oldLogTime: appliedLog.logTime,
            newLogTime: null,
            oldStatus: appliedLog.status,
            newStatus: AttendanceLogStatus.CANCELLED,
            oldChannel: appliedLog.channel,
            newChannel: appliedLog.channel,
            reason: current.reason,
            note: `ยกเลิกรายการลงเวลาที่ถูกสร้างซ้ำจากคำขอแก้เวลา ${current.requestNo ?? current.id}`,
            editedById: params.actorId,
            timeAdjustRequestId: current.id,
          },
        });
      }

      const updatedOriginalLog = await tx.attendanceLog.update({
        where: { id: originalLog.id },
        data: {
          workDate: toTimeAdjustDateOnlyFromDate(current.requestedLogTime),
          logType: current.targetLogType,
          logTime: current.requestedLogTime,
          channel: AttendanceChannel.MANUAL,
          source: originalLog.source || "TIME_ADJUST",
          session: this.resolveAttendanceSession(
            current.targetLogType,
            current.requestedLogTime,
          ),
          status: AttendanceLogStatus.EDITED,
          note:
            current.note ||
            `ปรับเวลาจากคำขอแก้เวลา ${current.requestNo ?? current.id}`,
        },
      });

      const existingUpdateLog = await tx.attendanceEditLog.findFirst({
        where: {
          timeAdjustRequestId: current.id,
          attendanceLogId: updatedOriginalLog.id,
          action: AttendanceEditAction.UPDATE_TIME,
          oldLogTime: { not: null },
        },
        select: { id: true },
      });

      if (!existingUpdateLog) {
        await tx.attendanceEditLog.create({
          data: {
            attendanceLogId: updatedOriginalLog.id,
            action: AttendanceEditAction.UPDATE_TIME,
            oldLogTime: oldOriginalLogTime,
            newLogTime: updatedOriginalLog.logTime,
            oldStatus: originalLog.status,
            newStatus: updatedOriginalLog.status,
            oldChannel: originalLog.channel,
            newChannel: updatedOriginalLog.channel,
            reason: current.reason,
            note: `ซ่อมข้อมูลเวลาเดิมจากคำขอแก้เวลา ${current.requestNo ?? current.id}`,
            editedById: params.actorId,
            timeAdjustRequestId: current.id,
          },
        });
      }

      const updatedRequest = await tx.timeAdjustRequest.update({
        where: { id: current.id },
        data: {
          originalAttendanceLogId: updatedOriginalLog.id,
          originalLogTime: oldOriginalLogTime,
          appliedAttendanceLogId: updatedOriginalLog.id,
        },
        select: {
          originalAttendanceLogId: true,
          originalLogTime: true,
          appliedAttendanceLogId: true,
          employeeId: true,
          requestedLogTime: true,
          approvedById: true,
          submittedById: true,
        },
      });

      return updatedRequest;
    });

    const requestedById =
      params.actorId ?? repaired.approvedById ?? repaired.submittedById ?? null;

    if (requestedById && repaired.employeeId && repaired.requestedLogTime) {
      await this.enqueueAttendanceSummaryRecalculation({
        employeeId: repaired.employeeId,
        workDate: toTimeAdjustDateOnlyFromDate(repaired.requestedLogTime),
        requestedById,
      });
    }

    return repaired;
  }

  private async enqueueAttendanceSummaryRecalculation(params: {
    employeeId: string;
    workDate: Date;
    requestedById: string;
  }) {
    try {
      await this.attendanceSummaryQueue.enqueueDailySummaryRecalculation({
        employeeId: params.employeeId,
        workDate: params.workDate.toISOString().slice(0, 10),
        requestedById: params.requestedById,
      });
    } catch (error) {
      this.logger.warn(
        `ไม่สามารถส่งงานคำนวณสรุปเวลาใหม่หลังซ่อมคำขอแก้เวลาได้ employeeId=${params.employeeId} workDate=${params.workDate
          .toISOString()
          .slice(
            0,
            10,
          )}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async enrichWrongTimeOriginalLogs<
    T extends {
      id: string;
      adjustType: string;
      employeeId: string;
      targetLogType: Prisma.AttendanceLogWhereInput["logType"];
      requestedLogTime: Date;
      originalLogTime?: Date | null;
      originalAttendanceLogId?: string | null;
      appliedAttendanceLogId?: string | null;
      originalAttendanceLog?: unknown | null;
    },
  >(items: T[]) {
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        if (item.adjustType !== "WRONG_TIME" || item.originalLogTime) {
          return item;
        }

        const editLogSnapshot = await this.findOriginalLogTimeFromEditLog(
          item.id,
        );

        if (editLogSnapshot?.oldLogTime) {
          return {
            ...item,
            originalAttendanceLogId:
              item.originalAttendanceLogId ?? editLogSnapshot.attendanceLogId,
            originalLogTime: editLogSnapshot.oldLogTime,
          };
        }

        const fallbackLog =
          await this.findFallbackOriginalAttendanceLogForWrongTime({
            adjustType: item.adjustType,
            employeeId: item.employeeId,
            targetLogType: item.targetLogType,
            requestedLogTime: item.requestedLogTime,
            excludeLogIds: [item.appliedAttendanceLogId].filter(
              Boolean,
            ) as string[],
          });

        if (!fallbackLog) {
          return item;
        }

        return {
          ...item,
          originalAttendanceLogId:
            item.originalAttendanceLogId ?? fallbackLog.id,
          originalLogTime: fallbackLog.logTime,
          originalAttendanceLog: item.originalAttendanceLog ?? fallbackLog,
        };
      }),
    );

    return enrichedItems;
  }

  private async ensureWrongTimeOriginalSnapshot(id: string) {
    const current = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        adjustType: true,
        employeeId: true,
        targetLogType: true,
        requestedLogTime: true,
        originalAttendanceLogId: true,
        originalLogTime: true,
        appliedAttendanceLogId: true,
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบคำขอแก้เวลา");
    }

    if (
      current.adjustType !== "WRONG_TIME" ||
      current.originalAttendanceLogId ||
      current.originalLogTime
    ) {
      return current;
    }

    const fallbackLog =
      await this.findFallbackOriginalAttendanceLogForWrongTime({
        adjustType: current.adjustType,
        employeeId: current.employeeId,
        targetLogType: current.targetLogType,
        requestedLogTime: current.requestedLogTime,
        excludeLogIds: [current.appliedAttendanceLogId].filter(
          Boolean,
        ) as string[],
      });

    if (
      !fallbackLog ||
      this.isSameBangkokClockMinute(
        fallbackLog.logTime,
        current.requestedLogTime,
      )
    ) {
      throw new BadRequestException(
        this.getWrongTimeOriginalSlotErrorMessage(
          current.targetLogType,
          current.requestedLogTime,
        ),
      );
    }

    return this.prisma.timeAdjustRequest.update({
      where: { id },
      data: {
        originalAttendanceLogId: fallbackLog.id,
        originalLogTime: fallbackLog.logTime,
      },
    });
  }

  private async findOriginalLogTimeFromEditLog(timeAdjustRequestId: string) {
    return this.prisma.attendanceEditLog.findFirst({
      where: {
        timeAdjustRequestId,
        oldLogTime: {
          not: null,
        },
      },
      select: {
        attendanceLogId: true,
        oldLogTime: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  private async findFallbackOriginalAttendanceLogForWrongTime(params: {
    adjustType?: string | null;
    employeeId: string;
    targetLogType?: Prisma.AttendanceLogWhereInput["logType"];
    requestedLogTime: Date;
    excludeLogIds?: string[];
  }) {
    if (params.adjustType !== "WRONG_TIME" || !params.targetLogType) {
      return null;
    }

    const dayRange = this.getBangkokDayRange(params.requestedLogTime);
    const logs = await this.prisma.attendanceLog.findMany({
      where: {
        employeeId: params.employeeId,
        logType: params.targetLogType,
        deletedAt: null,
        id: params.excludeLogIds?.length
          ? {
              notIn: params.excludeLogIds,
            }
          : undefined,
        status: {
          not: AttendanceLogStatus.CANCELLED,
        },
        logTime: {
          gte: dayRange.start,
          lte: dayRange.end,
        },
      },
      orderBy: {
        logTime: "asc",
      },
      take: 20,
    });

    if (logs.length === 0) {
      return null;
    }

    const targetLogType = params.targetLogType as AttendanceLogType;
    const preferredSession = this.resolveAttendanceSession(
      targetLogType,
      params.requestedLogTime,
    );
    const sameSlotLogs = logs.filter((log) =>
      this.isAttendanceLogInRequestedSlot(
        log,
        targetLogType,
        params.requestedLogTime,
        preferredSession,
      ),
    );

    if (sameSlotLogs.length === 0) {
      return null;
    }

    return sameSlotLogs.reduce((bestLog, log) => {
      const bestScore = this.scoreFallbackOriginalLog(
        bestLog,
        params.requestedLogTime,
        preferredSession,
      );
      const currentScore = this.scoreFallbackOriginalLog(
        log,
        params.requestedLogTime,
        preferredSession,
      );

      return currentScore < bestScore ? log : bestLog;
    }, sameSlotLogs[0]);
  }

  private isAttendanceLogInRequestedSlot(
    log: { logType?: AttendanceLogType | string | null; logTime: Date; session?: string | null },
    targetLogType: AttendanceLogType,
    requestedLogTime: Date,
    preferredSession: string | null,
  ) {
    if (log.logType && log.logType !== targetLogType) return false;

    if (targetLogType !== AttendanceLogType.CHECK_IN && targetLogType !== AttendanceLogType.CHECK_OUT) {
      return true;
    }

    const logSession = this.normalizeAttendanceSession(
      log.session,
      targetLogType,
      log.logTime,
    );

    return logSession === preferredSession;
  }

  private normalizeAttendanceSession(
    session: string | null | undefined,
    logType: AttendanceLogType,
    logTime: Date,
  ) {
    const raw = String(session ?? "").toUpperCase();

    if (raw === "MORNING" || raw === "MORNING_IN") return "MORNING";
    if (raw === "AFTERNOON" || raw === "AFTERNOON_IN") return "AFTERNOON";
    if (raw === "EVENING" || raw === "CHECK_OUT") return "EVENING";

    return this.resolveAttendanceSession(logType, logTime);
  }

  private getWrongTimeOriginalSlotErrorMessage(
    targetLogType: AttendanceLogType | null | undefined,
    requestedLogTime: Date,
  ) {
    if (targetLogType === AttendanceLogType.CHECK_IN) {
      const session = this.resolveAttendanceSession(targetLogType, requestedLogTime);
      return session === "AFTERNOON"
        ? "ไม่พบรายการเข้างานบ่ายเดิม กรุณาตรวจสอบประวัติลงเวลาหรือเลือกประเภทคำขอให้ถูกต้อง"
        : "ไม่พบรายการเข้างานเช้าเดิม กรุณาตรวจสอบประวัติลงเวลาหรือเลือกประเภทคำขอให้ถูกต้อง";
    }

    if (targetLogType === AttendanceLogType.CHECK_OUT) {
      return "ไม่พบรายการออกงานเดิม กรุณาตรวจสอบประวัติลงเวลาหรือเลือกประเภทคำขอให้ถูกต้อง";
    }

    return "ไม่พบรายการลงเวลาเดิมในรอบที่ต้องการแก้ กรุณาตรวจสอบประวัติลงเวลาหรือเลือกประเภทคำขอให้ถูกต้อง";
  }

  private scoreFallbackOriginalLog(
    log: { logTime: Date; session?: string | null; status?: string | null },
    requestedLogTime: Date,
    preferredSession: string | null,
  ) {
    let score = Math.abs(log.logTime.getTime() - requestedLogTime.getTime());

    if (preferredSession && log.session === preferredSession) {
      score -= 60 * 60 * 1000;
    }

    if (this.isSameBangkokClockMinute(log.logTime, requestedLogTime)) {
      score += 24 * 60 * 60 * 1000;
    }

    if (log.status === AttendanceLogStatus.MANUAL_ADDED) {
      score += 30 * 60 * 1000;
    }

    return score;
  }

  private resolveAttendanceSession(
    logType: AttendanceLogType | null | undefined,
    logTime: Date,
  ) {
    if (logType === AttendanceLogType.CHECK_OUT) return "EVENING";
    if (logType !== AttendanceLogType.CHECK_IN) return null;

    const minutes = this.getBangkokMinutes(logTime);
    return minutes < 12 * 60 ? "MORNING" : "AFTERNOON";
  }

  private isSameBangkokClockMinute(left?: Date | null, right?: Date | null) {
    if (!left || !right) return false;
    return this.getBangkokClockKey(left) === this.getBangkokClockKey(right);
  }

  private getBangkokClockKey(value: Date) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return formatter.format(value);
  }

  private getBangkokMinutes(value: Date) {
    const [hour = "0", minute = "0"] =
      this.getBangkokClockKey(value).split(":");
    return Number(hour) * 60 + Number(minute);
  }

  private getBangkokDayRange(value: Date) {
    const { year, month, day } = this.getBangkokDateParts(value);
    const dateText = `${year}-${String(month).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;

    return {
      start: new Date(`${dateText}T00:00:00.000+07:00`),
      end: new Date(`${dateText}T23:59:59.999+07:00`),
    };
  }

  private getBangkokDateParts(value: Date) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(value);

    return {
      year: Number(parts.find((part) => part.type === "year")?.value),
      month: Number(parts.find((part) => part.type === "month")?.value),
      day: Number(parts.find((part) => part.type === "day")?.value),
    };
  }

  private async findOriginalAttendanceLog(
    id: string,
    employeeId: string,
    expected?: {
      targetLogType?: AttendanceLogType | null;
      requestedLogTime?: Date | null;
    },
  ) {
    const log = await this.prisma.attendanceLog.findFirst({
      where: {
        id,
        employeeId,
        deletedAt: null,
      },
    });

    if (!log) {
      throw new NotFoundException(
        "ไม่พบรายการลงเวลาเดิม หรือรายการนี้ไม่ใช่ของพนักงานที่เลือก",
      );
    }

    if (log.status === AttendanceLogStatus.CANCELLED) {
      throw new BadRequestException("รายการลงเวลาเดิมถูกยกเลิกแล้ว");
    }

    if (expected?.targetLogType && expected.requestedLogTime) {
      const preferredSession = this.resolveAttendanceSession(
        expected.targetLogType,
        expected.requestedLogTime,
      );

      if (
        !this.isAttendanceLogInRequestedSlot(
          log,
          expected.targetLogType,
          expected.requestedLogTime,
          preferredSession,
        )
      ) {
        throw new BadRequestException(
          this.getWrongTimeOriginalSlotErrorMessage(
            expected.targetLogType,
            expected.requestedLogTime,
          ),
        );
      }
    }

    return log;
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException("ไม่พบข้อมูลผู้ใช้งานปัจจุบัน");
    }

    return actorId;
  }

  private async generateRequestNo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const prefix = `TA-${year}${month}${day}`;

    const count = await this.prisma.timeAdjustRequest.count({
      where: {
        requestNo: {
          startsWith: prefix,
        },
      },
    });

    return `${prefix}-${String(count + 1).padStart(4, "0")}`;
  }
}
