import { assertWorkDateNotLocked } from '../attendance/utils/attendance-lock.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";

import { CreateOvertimeRequestDto } from "./dto/create-overtime-request.dto";
import { ListOvertimeRequestsQueryDto } from "./dto/list-overtime-requests-query.dto";
import { OvertimeRequestActionDto } from "./dto/overtime-request-action.dto";
import { buildOvertimeRequestWhere } from "./helpers/overtime-search.helper";
import { UpdateOvertimeRequestDto } from "./dto/update-overtime-request.dto";
import { UploadOvertimeAttachmentDto } from "./dto/upload-overtime-attachment.dto";

import { OvertimeApprovalService } from "./services/overtime-approval.service";
import { OvertimeDayTypeService } from "./services/overtime-day-type.service";
import { OvertimeAttachmentService } from "./services/overtime-attachment.service";
import { OvertimePolicyResolverService } from "./services/overtime-policy-resolver.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AttendanceRecalculationTriggerService } from "../attendance/attendance-recalculation-trigger.service";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";
import {
  assertWithinScope,
  tenantWhere,
} from "../../common/tenant/tenant-scope.util";
import type { CurrentUserLike } from "./types/overtime.types";
import {
  formatOvertimeTimeLabel,
  parseOvertimeDateOnly,
  parseOvertimeDateTime,
  parseOvertimeTimeRange,
} from "./utils/overtime-date.util";
import {
  buildWeeklyOtCapMessage,
  evaluateWeeklyOtCap,
  resolveWeekRange,
} from "./utils/overtime-weekly-cap.util";

/** re-fetch ภายในหลัง action สำเร็จ / ตรวจ ownership แล้ว — ไม่ต้อง scope ซ้ำ */
const INTERNAL_UNSCOPED: TenantScope = {
  level: "GLOBAL",
  companyId: null,
  branchId: null,
};

/*
 * OvertimeRequestsService
 * ---------------------------------------------------------
 * This service is now a facade/orchestrator for the OT request lifecycle.
 *
 * It keeps the original public API used by controllers and Approval Center,
 * but delegates specialized work to smaller services:
 * - OvertimePolicyResolverService: validates OT hours and policies.
 * - OvertimeApprovalService: handles Approval Matrix and approval steps.
 * - OvertimeAttachmentService: handles attachment metadata/download/remove.
 *
 * Refactor rule:
 * Do not change public method names unless the controller and frontend routes
 * are updated together. This preserves existing API behavior.
 */
@Injectable()
export class OvertimeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overtimeApprovalService: OvertimeApprovalService,
    private readonly overtimeAttachmentService: OvertimeAttachmentService,
    private readonly overtimePolicyResolverService: OvertimePolicyResolverService,
    private readonly notificationsService: NotificationsService,
    private readonly attendanceRecalculation: AttendanceRecalculationTriggerService,
    private readonly overtimeDayTypeService: OvertimeDayTypeService,
  ) {}

  async findAll(query: ListOvertimeRequestsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // where สำหรับรายการจริง ใช้ทุก filter รวมถึง status/workType
    const where = buildOvertimeRequestWhere(query, scope);
    // where สำหรับ status tabs ตัด status ออก เพื่อให้ HR เห็นจำนวนทุกสถานะภายใต้ filter ชุดเดียวกัน
    const summaryWhere = buildOvertimeRequestWhere(
      {
        ...query,
        status: undefined,
      },
      scope,
    );
    // where สำหรับ work type tabs ตัด workType ออก เพื่อให้จำนวนประเภทวันไม่ยึดติดกับแท็บที่เลือกอยู่
    const workTypeSummaryWhere = buildOvertimeRequestWhere(
      {
        ...query,
        status: undefined,
        workType: undefined,
      },
      scope,
    );

    const [items, total, summaryTotal, statusGroups, workTypeGroups] =
      await this.prisma.$transaction([
        this.prisma.overtimeRequest.findMany({
          where,
          include: this.overtimeRequestInclude(),
          orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
          skip,
          take: pageSize,
        }),
        this.prisma.overtimeRequest.count({ where }),
        this.prisma.overtimeRequest.count({ where: summaryWhere }),
        this.prisma.overtimeRequest.groupBy({
          by: ["status"],
          where: summaryWhere,
          orderBy: { status: "asc" },
          _count: { _all: true },
          _sum: { totalHours: true },
        }),
        this.prisma.overtimeRequest.groupBy({
          by: ["workType"],
          where: workTypeSummaryWhere,
          orderBy: { workType: "asc" },
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
      summary: this.buildRequestSummary(
        summaryTotal,
        statusGroups,
        workTypeGroups,
      ),
    };
  }

  private buildRequestSummary(
    total: number,
    statusGroups: Array<{
      status: string;
      _count?: true | { _all?: number } | null;
      _sum?: true | { totalHours?: unknown } | null;
    }>,
    workTypeGroups: Array<{
      workType: string;
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
      totalHours: 0,
      approvedHours: 0,
      workday: 0,
      holiday: 0,
      specialHoliday: 0,
    };

    for (const group of statusGroups) {
      const count = this.getGroupCount(group._count);
      const hours = this.getGroupTotalHours(group._sum);

      summary.totalHours += hours;

      if (group.status === "DRAFT") summary.draft = count;
      if (group.status === "SUBMITTED") summary.submitted = count;
      if (group.status === "APPROVED") {
        summary.approved = count;
        summary.approvedHours = hours;
      }
      if (group.status === "REJECTED") summary.rejected = count;
      if (group.status === "CANCELLED") summary.cancelled = count;
    }

    for (const group of workTypeGroups) {
      const count = this.getGroupCount(group._count);

      if (group.workType === "WORKDAY") summary.workday = count;
      if (group.workType === "HOLIDAY") summary.holiday = count;
      if (group.workType === "SPECIAL_HOLIDAY") summary.specialHoliday = count;
    }

    summary.totalHours = this.roundHours(summary.totalHours);
    summary.approvedHours = this.roundHours(summary.approvedHours);

    return summary;
  }

  private toNumber(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private getGroupCount(value: true | { _all?: number } | null | undefined) {
    if (!value || value === true) return 0;
    return Number(value._all ?? 0);
  }

  private getGroupTotalHours(
    value: true | { totalHours?: unknown } | null | undefined,
  ) {
    if (!value || value === true) return 0;
    return this.toNumber(value.totalHours);
  }

  private roundHours(value: number) {
    return Math.round(value * 100) / 100;
  }

  async findMy(
    query: ListOvertimeRequestsQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const employee = await this.resolveCurrentEmployee(currentUser);

    // employeeId already restricts to self — no extra tenant filter needed.
    return this.findAll(
      {
        ...query,
        employeeId: employee.id,
      },
      INTERNAL_UNSCOPED,
    );
  }

  /** Mobile read-model ที่เรียงตาม workDate = occurredOn ของ OT */
  async findMyForMobileTimeline(
    query: ListOvertimeRequestsQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const employee = await this.resolveCurrentEmployee(currentUser);
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.max(Number(query.pageSize ?? 20), 1);
    const skip = (page - 1) * pageSize;
    const where = buildOvertimeRequestWhere(
      { ...query, employeeId: employee.id },
      INTERNAL_UNSCOPED,
    );

    const [items, total] = await this.prisma.$transaction([
      this.prisma.overtimeRequest.findMany({
        where,
        select: {
          id: true,
          requestNo: true,
          status: true,
          reason: true,
          workDate: true,
          startTime: true,
          endTime: true,
          totalHours: true,
          workType: true,
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
        },
        orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.overtimeRequest.count({ where }),
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

  async findMyOne(id: string, currentUser: CurrentUserLike) {
    await this.ensureMyOvertimeRequest(id, currentUser);

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async updateMy(
    id: string,
    dto: UpdateOvertimeRequestDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyOvertimeRequest(id, currentUser);

    // ยืนยันความเป็นเจ้าของแล้ว จึงไม่ต้อง scope ซ้ำ
    return this.update(id, dto, INTERNAL_UNSCOPED);
  }

  async submitMy(id: string, currentUser: CurrentUserLike) {
    await this.ensureMyOvertimeRequest(id, currentUser);

    return this.submit(id, currentUser);
  }

  async cancelMy(
    id: string,
    dto: OvertimeRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyOvertimeRequest(id, currentUser);

    const request = await this.findOne(id, INTERNAL_UNSCOPED);

    if (request.status === "SUBMITTED") {
      return this.withdrawSubmittedToDraft(id, dto, currentUser);
    }

    return this.cancel(id, dto, currentUser);
  }

  async findMyAttachments(
    overtimeRequestId: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyOvertimeRequest(overtimeRequestId, currentUser);

    return this.findAttachments(overtimeRequestId, INTERNAL_UNSCOPED);
  }

  async uploadMyAttachment(
    overtimeRequestId: string,
    dto: UploadOvertimeAttachmentDto,
    file: Express.Multer.File,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyOvertimeRequest(overtimeRequestId, currentUser);

    return this.uploadAttachment(
      overtimeRequestId,
      dto,
      file,
      INTERNAL_UNSCOPED,
      this.getActorId(currentUser),
    );
  }

  async getMyAttachmentFileForDownload(
    overtimeRequestId: string,
    attachmentId: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyOvertimeRequest(overtimeRequestId, currentUser);

    return this.getAttachmentFileForDownload(
      overtimeRequestId,
      attachmentId,
      INTERNAL_UNSCOPED,
    );
  }

  async removeMyAttachment(
    overtimeRequestId: string,
    attachmentId: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMyOvertimeRequest(overtimeRequestId, currentUser);

    return this.removeAttachment(
      overtimeRequestId,
      attachmentId,
      INTERNAL_UNSCOPED,
    );
  }

  async findOne(id: string, scope: TenantScope) {
    const scopeWhere = tenantWhere(scope) as Prisma.EmployeeWhereInput;

    const item = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(Object.keys(scopeWhere).length > 0
          ? { employee: { is: scopeWhere } }
          : {}),
      },
      include: this.overtimeRequestInclude(),
    });

    if (!item) {
      throw new NotFoundException("ไม่พบคำขอ OT");
    }

    return item;
  }

  /**
   * กันยื่นคำขอ OT ทับช่วงเวลาเดิมของวันเดียวกัน
   *
   * ตอนคำนวณเงินเดือน ระบบดึงคำขอที่ APPROVED ทุกใบในงวดมาสร้างรายการ OT
   * ใบละหนึ่งบรรทัด ถ้ามีใบซ้ำวันเดิมช่วงเวลาเดิมสองใบ พนักงานจะได้เงิน OT
   * สองเท่าโดยไม่มีอะไรเตือน (เจอจริงจากการทดสอบ: 28 ก.ค. มีใบซ้ำสองใบ อนุมัติทั้งคู่)
   *
   * ไม่บล็อกทั้งวัน เพราะทำ OT ช่วงเช้าและช่วงค่ำของวันเดียวกันเป็นเรื่องปกติ
   * บล็อกเฉพาะกรณีช่วงเวลาคาบเกี่ยวกันจริง
   */
  /**
   * เพดาน 36 ชั่วโมงต่อสัปดาห์ ตาม พ.ร.บ.คุ้มครองแรงงาน ม.26
   *
   * นับใบที่ยังมีผลอยู่ทั้งหมด (ร่าง / รออนุมัติ / อนุมัติแล้ว) เพราะใบที่รออนุมัติ
   * ก็กำลังจะกลายเป็นชั่วโมงจริง ถ้านับเฉพาะใบที่อนุมัติแล้วจะยื่นทีเดียวหลายใบ
   * ให้เกินเพดานพร้อมกันได้ แล้วอนุมัติทีหลังทีละใบโดยแต่ละใบดูไม่เกิน
   */
  private async ensureWithinWeeklyOtCap(params: {
    employeeId: string;
    workDate: Date;
    requestedHours: number;
    excludeId?: string;
  }) {
    const { start, end } = resolveWeekRange(params.workDate);

    const existing = await this.prisma.overtimeRequest.aggregate({
      where: {
        employeeId: params.employeeId,
        deletedAt: null,
        status: { notIn: ["REJECTED", "CANCELLED"] },
        workDate: { gte: start, lte: end },
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      _sum: { totalHours: true },
    });

    const result = evaluateWeeklyOtCap({
      existingHours: Number(existing._sum.totalHours ?? 0),
      requestedHours: params.requestedHours,
    });

    if (result.exceeded) {
      throw new BadRequestException(buildWeeklyOtCapMessage(result));
    }
  }

  private async ensureNoOverlappingRequest(params: {
    employeeId: string;
    workDate: Date;
    startTime: Date;
    endTime: Date;
    excludeId?: string;
  }) {
    const conflict = await this.prisma.overtimeRequest.findFirst({
      where: {
        employeeId: params.employeeId,
        workDate: params.workDate,
        deletedAt: null,
        status: { notIn: ["REJECTED", "CANCELLED"] },
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
        // คาบเกี่ยวเมื่อเริ่มก่อนใบเดิมจบ และจบหลังใบเดิมเริ่ม
        startTime: { lt: params.endTime },
        endTime: { gt: params.startTime },
      },
      select: { requestNo: true, startTime: true, endTime: true },
    });

    if (!conflict) return;

    const range = `${formatOvertimeTimeLabel(conflict.startTime)}-${formatOvertimeTimeLabel(conflict.endTime)}`;
    throw new BadRequestException(
      `มีคำขอ OT ของวันนี้ช่วงเวลา ${range} อยู่แล้ว (เลขที่ ${conflict.requestNo}) กรุณาแก้ใบเดิมแทนการยื่นซ้ำ`,
    );
  }

  /**
   * บังคับให้มีรูปหลักฐานอย่างน้อยหนึ่งไฟล์ก่อนเข้าคิวอนุมัติ
   *
   * ตรวจที่ตอนส่งไม่ใช่ตอนแนบ เพราะหลักฐานอัปโหลดได้หลังมีใบแล้วเท่านั้น
   * และผู้ใช้ลบไฟล์ทิ้งหลังแนบได้ การตรวจที่จุดส่งจึงเป็นด่านเดียวที่กันได้จริง
   * ทุกช่องทาง ทั้งเว็บ แอป และ API ของฝ่ายบุคคล
   */
  private async ensureEvidenceAttached(overtimeRequestId: string) {
    const attachments = await this.prisma.overtimeAttachment.count({
      where: {
        overtimeRequestId,
        deletedAt: null,
      },
    });

    if (attachments === 0) {
      throw new BadRequestException(
        "กรุณาแนบรูปหลักฐานการทำ OT อย่างน้อย 1 รูปก่อนส่งคำขอ",
      );
    }
  }

  /**
   * บอกล่วงหน้าว่าวันที่เลือกเป็นวันประเภทไหนตามปฏิทินวันหยุด
   *
   * ฟอร์มขอ OT ไม่มีช่องให้เลือกประเภทวันแล้ว หน้าเว็บ/แอปจึงเรียกตัวนี้
   * มาแสดงให้ผู้ยื่นเห็นว่าระบบจะคิดเป็นวันอะไร ก่อนกดบันทึก
   */
  async previewDayType(
    params: { workDate: string; employeeId?: string },
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(params.employeeId, actorId);

    assertWithinScope(scope, {
      companyId: employee.companyId,
      branchId: employee.branchId,
    });

    const workDate = parseOvertimeDateOnly(params.workDate);
    const dayType = await this.overtimeDayTypeService.resolve(
      workDate,
      employee,
    );

    return {
      workDate: workDate.toISOString().slice(0, 10),
      ...dayType,
    };
  }

  async create(
    dto: CreateOvertimeRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    /*
     * สร้างพร้อมส่งไม่ได้อีกแล้ว
     *
     * คำขอ OT ต้องมีรูปหลักฐานติดมาด้วยเสมอ และรูปจะอัปโหลดได้ต่อเมื่อมีใบอยู่แล้ว
     * ทางเดียวที่หลักฐานจะครบตอนเข้าคิวอนุมัติคือ สร้างร่าง → แนบรูป → ส่ง
     */
    if (dto.submit) {
      throw new BadRequestException(
        "คำขอ OT ต้องแนบรูปหลักฐานก่อนส่ง กรุณาบันทึกร่าง แนบรูป แล้วจึงกดส่งคำขอ",
      );
    }

    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveEmployee(dto.employeeId, actorId);
    // พนักงานปลายทางต้องอยู่ในบริษัท/สาขาของผู้สร้าง
    assertWithinScope(scope, {
      companyId: employee.companyId,
      branchId: employee.branchId,
    });

    const workDate = parseOvertimeDateOnly(dto.workDate);
    /*
     * ประเภทวันมาจากปฏิทินวันหยุดเสมอ ไม่รับค่าที่ส่งมากับใบ
     * ผู้ยื่นเลือกเองไม่ได้อีกแล้ว เพราะอัตราค่า OT วิ่งตามประเภทวันโดยตรง
     */
    const dayType = await this.overtimeDayTypeService.resolve(
      workDate,
      employee,
    );
    const workType = dayType.workType;
    // รับได้ทั้ง datetime เต็มและ HH:mm โดยอิงวันที่ทำงานของใบนี้
    // มองเวลาเริ่ม-จบเป็นคู่ เพื่อให้ OT กะดึก (18:00-06:00) ยื่นได้
    const { startTime, endTime } = parseOvertimeTimeRange({
      startTime: dto.startTime,
      endTime: dto.endTime,
      workDate,
    });
    const breakMinutes = dto.breakMinutes ?? 0;

    const totalHours =
      await this.overtimePolicyResolverService.calculateAndValidateTotalHours({
        companyId: employee.companyId,
        branchId: employee.branchId,
        employeeTypeId: employee.employeeTypeId,
        workType,
        startTime,
        endTime,
        breakMinutes,
      });

    await this.ensureNoOverlappingRequest({
      employeeId: employee.id,
      workDate,
      startTime,
      endTime,
    });

    await this.ensureWithinWeeklyOtCap({
      employeeId: employee.id,
      workDate,
      requestedHours: Number(totalHours),
    });

    const requestNo = await this.generateRequestNo();

    const overtimeRequest = await this.prisma.overtimeRequest.create({
      data: {
        requestNo,
        employeeId: employee.id,
        workDate,
        startTime,
        endTime,
        breakMinutes,
        totalHours,
        workType,
        reason: dto.reason.trim(),
        note: dto.note?.trim() || null,
        status: "DRAFT",
      },
    });

    return this.findOne(overtimeRequest.id, INTERNAL_UNSCOPED);
  }

  async update(
    id: string,
    dto: UpdateOvertimeRequestDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            companyId: true,
            branchId: true,
            // ปฏิทินวันหยุดกำหนดขอบเขตได้ถึงระดับฝ่าย/แผนก จึงต้องดึงมาด้วย
            departmentId: true,
            divisionId: true,
            employeeTypeId: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบคำขอ OT");
    }

    assertWithinScope(scope, {
      companyId: current.employee.companyId,
      branchId: current.employee.branchId,
    });

    if (current.status === "APPROVED") {
      throw new BadRequestException("ไม่สามารถแก้ไขคำขอ OT ที่อนุมัติแล้ว");
    }

    const workDate = dto.workDate
      ? parseOvertimeDateOnly(dto.workDate)
      : current.workDate;

    // แก้วันที่แล้วประเภทวันต้องขยับตามปฏิทินด้วย ไม่ใช่ค้างค่าเดิมของใบ
    const dayType = await this.overtimeDayTypeService.resolve(
      workDate,
      current.employee,
    );
    const workType = dayType.workType;

    /*
     * ตอนแก้ไขอาจส่งมาแค่ค่าเดียว จึงเติมอีกค่าจากใบเดิมก่อนแปลงเป็นคู่
     * ไม่งั้นถ้าแก้เฉพาะเวลาเลิกงานเป็น 06:00 จะกลายเป็นย้อนกลับอีก
     */
    const { startTime, endTime } = parseOvertimeTimeRange({
      startTime: dto.startTime ?? current.startTime,
      endTime: dto.endTime ?? current.endTime,
      workDate,
    });

    const breakMinutes =
      dto.breakMinutes === undefined ? current.breakMinutes : dto.breakMinutes;

    const totalHours =
      await this.overtimePolicyResolverService.calculateAndValidateTotalHours({
        companyId: current.employee.companyId,
        branchId: current.employee.branchId,
        employeeTypeId: current.employee.employeeTypeId,
        workType,
        startTime,
        endTime,
        breakMinutes,
      });

    // แก้ใบเดิมให้ไปทับใบอื่นของวันเดียวกันก็ทำให้จ่ายซ้ำได้เหมือนกัน
    await this.ensureNoOverlappingRequest({
      employeeId: current.employeeId,
      workDate,
      startTime,
      endTime,
      excludeId: id,
    });

    await this.ensureWithinWeeklyOtCap({
      employeeId: current.employeeId,
      workDate,
      requestedHours: Number(totalHours),
      excludeId: id,
    });

    await this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        workDate,
        startTime,
        endTime,
        breakMinutes,
        totalHours,
        workType,
        reason: dto.reason?.trim() || undefined,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async submit(id: string, currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
      },
    });

    if (!request) {
      throw new NotFoundException("ไม่พบคำขอ OT");
    }

    if (request.status !== "DRAFT") {
      throw new BadRequestException("ส่งคำขอได้เฉพาะสถานะร่างเท่านั้น");
    }

    await this.ensureEvidenceAttached(id);

    /*
     * ตรวจซ้ำตอนส่ง ไม่ใช่แค่ตอนสร้าง
     *
     * ใบร่างอาจถูกสร้างไว้นานแล้ว ระหว่างนั้นมีใบอื่นของสัปดาห์เดียวกันถูกยื่นเพิ่ม
     * หรือมีใบที่ทับช่วงเวลากันถูกสร้างขึ้น การตรวจแค่ตอนสร้างจึงกันไม่ได้จริง
     */
    await this.ensureNoOverlappingRequest({
      employeeId: request.employeeId,
      workDate: request.workDate,
      startTime: request.startTime,
      endTime: request.endTime,
      excludeId: id,
    });

    await this.ensureWithinWeeklyOtCap({
      employeeId: request.employeeId,
      workDate: request.workDate,
      requestedHours: Number(request.totalHours),
      excludeId: id,
    });

    await this.prisma.$transaction(async (tx) => {
      const approvalMatrix =
        await this.overtimeApprovalService.findApplicableApprovalMatrix(
          tx,
          request.employee,
        );

      if (!approvalMatrix) {
        throw new BadRequestException(
          "ยังไม่ได้ตั้งค่าสายอนุมัติสำหรับ OT นี้ กรุณาตั้งค่า Approval Matrix ก่อน",
        );
      }

      await tx.overtimeRequest.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          submittedById: actorId,
        },
      });

      await tx.overtimeApprovalStep.deleteMany({
        where: {
          overtimeRequestId: id,
        },
      });

      await this.overtimeApprovalService.createOvertimeApprovalSteps(tx, {
        overtimeRequestId: id,
        employee: request.employee,
        matrix: approvalMatrix,
      });

      await tx.overtimeApprovalLog.create({
        data: {
          overtimeRequestId: id,
          action: "SUBMIT",
          oldStatus: "DRAFT",
          newStatus: "SUBMITTED",
          reason: `ส่งคำขอ OT เพื่อขออนุมัติผ่านสายอนุมัติ ${approvalMatrix.nameTh}`,
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForOvertime(request, actorId, 'SUBMIT');

    await this.notifyOvertimeSafely('แจ้งเตือนคำขอ OT รออนุมัติ', () =>
      this.notificationsService.notifyOvertimePendingApproval(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async approve(
    id: string,
    dto: OvertimeRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: true,
      },
    });

    if (!request) {
      throw new NotFoundException("ไม่พบคำขอ OT");
    }

    if (request.status !== "SUBMITTED") {
      throw new BadRequestException(
        "อนุมัติได้เฉพาะคำขอ OT ที่รออนุมัติเท่านั้น",
      );
    }

    // ห้ามอนุมัติ OT ลงวันที่ปิดงวด/ส่งเข้าเงินเดือนแล้ว — จะไม่มีวันถูกจ่าย
    // และไปขัดกับสรุปเวลาที่ล็อกไว้เงียบ ๆ
    await assertWorkDateNotLocked(
      this.prisma as never,
      request.employeeId,
      request.workDate,
    );

    /*
     * ตรวจเพดานสัปดาห์อีกครั้งตอนอนุมัติ — เป็นจุดสุดท้ายก่อนกลายเป็นเงินจริง
     * ถ้ามีหลายใบยื่นไว้ก่อนแล้วทยอยอนุมัติ ยอดรวมอาจเกินโดยที่แต่ละใบดูไม่เกิน
     */
    await this.ensureWithinWeeklyOtCap({
      employeeId: request.employeeId,
      workDate: request.workDate,
      requestedHours: Number(request.totalHours),
      excludeId: id,
    });

    await this.prisma.$transaction(async (tx) => {
      const currentStep =
        await this.overtimeApprovalService.getCurrentOvertimeApprovalStep(
          tx,
          id,
        );

      if (!currentStep) {
        throw new BadRequestException(
          "ไม่พบขั้นตอนอนุมัติ OT ที่กำลังรอดำเนินการ",
        );
      }

      await this.overtimeApprovalService.ensureActorCanActCurrentStep(
        tx,
        currentStep,
        actorId,
        {
          requesterUserId: request.submittedById,
          subjectEmployeeId: request.employeeId,
        },
      );

      const nextStep = await tx.overtimeApprovalStep.findFirst({
        where: {
          overtimeRequestId: id,
          status: "WAITING",
          stepNo: {
            gt: currentStep.stepNo,
          },
        },
        orderBy: {
          stepNo: "asc",
        },
      });

      await tx.overtimeApprovalStep.update({
        where: {
          id: currentStep.id,
        },
        data: {
          status: "APPROVED",
          approvedCount: {
            increment: 1,
          },
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      if (nextStep) {
        await tx.overtimeApprovalStep.update({
          where: {
            id: nextStep.id,
          },
          data: {
            status: "PENDING",
          },
        });

        await tx.overtimeApprovalLog.create({
          data: {
            overtimeRequestId: id,
            action: "APPROVE",
            oldStatus: "SUBMITTED",
            newStatus: "SUBMITTED",
            reason:
              dto.reason?.trim() ||
              `อนุมัติขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
            note:
              dto.note?.trim() ||
              `ส่งต่อไปยังขั้นตอนที่ ${nextStep.stepNo}: ${nextStep.nameTh}`,
            approvedById: actorId,
          },
        });

        return;
      }

      await tx.overtimeRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
        },
      });

      await tx.overtimeApprovalLog.create({
        data: {
          overtimeRequestId: id,
          action: "APPROVE",
          oldStatus: "SUBMITTED",
          newStatus: "APPROVED",
          reason:
            dto.reason?.trim() ||
            `อนุมัติครบทุกขั้นตอน สิ้นสุดที่ขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
          note: dto.note?.trim() || null,
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForOvertime(request, actorId, 'APPROVE');

    await this.notifyOvertimeSafely('อัปเดตแจ้งเตือนหลังอนุมัติคำขอ OT', async () => {
      await this.notificationsService.closeOvertimePendingNotifications(id);

      const latest = await this.prisma.overtimeRequest.findFirst({
        where: { id, deletedAt: null },
        select: { status: true },
      });

      if (latest?.status === "SUBMITTED") {
        await this.notificationsService.notifyOvertimePendingApproval(id);
      }

      if (latest?.status === "APPROVED") {
        await this.notificationsService.notifyOvertimeApproved(id);
      }
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async reject(
    id: string,
    dto: OvertimeRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!request) {
      throw new NotFoundException("ไม่พบคำขอ OT");
    }

    if (request.status !== "SUBMITTED") {
      throw new BadRequestException(
        "ไม่อนุมัติได้เฉพาะคำขอ OT ที่รออนุมัติเท่านั้น",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const currentStep =
        await this.overtimeApprovalService.getCurrentOvertimeApprovalStep(
          tx,
          id,
        );

      if (!currentStep) {
        throw new BadRequestException(
          "ไม่พบขั้นตอนอนุมัติ OT ที่กำลังรอดำเนินการ",
        );
      }

      await this.overtimeApprovalService.ensureActorCanActCurrentStep(
        tx,
        currentStep,
        actorId,
        {
          requesterUserId: request.submittedById,
          subjectEmployeeId: request.employeeId,
        },
      );

      await tx.overtimeApprovalStep.update({
        where: {
          id: currentStep.id,
        },
        data: {
          status: "REJECTED",
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      await tx.overtimeApprovalStep.updateMany({
        where: {
          overtimeRequestId: id,
          status: {
            in: ["WAITING", "PENDING"],
          },
          id: {
            not: currentStep.id,
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.overtimeRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
        },
      });

      await tx.overtimeApprovalLog.create({
        data: {
          overtimeRequestId: id,
          action: "REJECT",
          oldStatus: "SUBMITTED",
          newStatus: "REJECTED",
          reason:
            dto.reason?.trim() ||
            `ไม่อนุมัติในขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
          note: dto.note?.trim() || null,
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForOvertime(request, actorId, 'REJECT');

    await this.notifyOvertimeSafely('แจ้งเตือนคำขอ OT ถูกปฏิเสธ', async () => {
      await this.notificationsService.closeOvertimePendingNotifications(id);
      await this.notificationsService.notifyOvertimeRejected(id);
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async returnForReview(
    id: string,
    dto: OvertimeRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!request) {
      throw new NotFoundException("ไม่พบคำขอ OT");
    }

    if (request.status !== "SUBMITTED") {
      throw new BadRequestException(
        "ส่งกลับให้ตรวจสอบใหม่ได้เฉพาะคำขอ OT ที่รออนุมัติเท่านั้น",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const currentStep =
        await this.overtimeApprovalService.getCurrentOvertimeApprovalStep(
          tx,
          id,
        );

      if (!currentStep) {
        throw new BadRequestException(
          "ไม่พบขั้นตอนอนุมัติ OT ที่กำลังรอดำเนินการ",
        );
      }

      await this.overtimeApprovalService.ensureActorCanActCurrentStep(
        tx,
        currentStep,
        actorId,
        {
          requesterUserId: request.submittedById,
          subjectEmployeeId: request.employeeId,
        },
      );

      await tx.overtimeApprovalStep.update({
        where: { id: currentStep.id },
        data: {
          status: "CANCELLED",
          actedById: actorId,
          actedAt: new Date(),
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      await tx.overtimeApprovalStep.updateMany({
        where: {
          overtimeRequestId: id,
          status: {
            in: ["WAITING", "PENDING"],
          },
          id: {
            not: currentStep.id,
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.overtimeRequest.update({
        where: { id },
        data: {
          status: "DRAFT",
          submittedAt: null,
          submittedById: null,
          approvedAt: null,
          rejectedAt: null,
          cancelledAt: null,
          cancelledById: null,
        },
      });

      await tx.overtimeApprovalLog.create({
        data: {
          overtimeRequestId: id,
          action: "CANCEL",
          oldStatus: "SUBMITTED",
          newStatus: "DRAFT",
          reason:
            dto.reason?.trim() ||
            `ส่งกลับให้ตรวจสอบใหม่ในขั้นตอนที่ ${currentStep.stepNo}: ${currentStep.nameTh}`,
          note: dto.note?.trim() || "ผู้ยื่นสามารถแก้ไขข้อมูลแล้วส่งขออนุมัติใหม่ได้",
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForOvertime(request, actorId, 'RETURN_FOR_REVIEW');

    await this.notifyOvertimeSafely('แจ้งเตือนคำขอ OT ถูกส่งกลับให้ตรวจสอบ', async () => {
      await this.notificationsService.closeOvertimePendingNotifications(id);
      await this.notificationsService.notifyOvertimeReturnedForReview(id);
    });

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  /**
   * ถอนคำขอ OT ที่ส่งแล้วกลับเป็นร่าง สำหรับ ESS
   * - ใช้เมื่อผู้ยื่นต้องการแก้ไขหรือลบคำขอ OT ที่ส่งไปแล้ว
   * - ปิดขั้นตอนอนุมัติเดิมและปิดแจ้งเตือนที่ค้างอยู่
   */
  async withdrawSubmittedToDraft(
    id: string,
    dto: OvertimeRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!request) {
      throw new NotFoundException("ไม่พบคำขอ OT");
    }

    if (request.status !== "SUBMITTED") {
      throw new BadRequestException(
        "ยกเลิกการส่งได้เฉพาะคำขอ OT ที่รออนุมัติเท่านั้น",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.overtimeApprovalStep.updateMany({
        where: {
          overtimeRequestId: id,
          status: {
            in: ["WAITING", "PENDING"],
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.overtimeRequest.update({
        where: { id },
        data: {
          status: "DRAFT",
          submittedAt: null,
          submittedById: null,
          approvedAt: null,
          rejectedAt: null,
          cancelledAt: null,
          cancelledById: null,
        },
      });

      await tx.overtimeApprovalLog.create({
        data: {
          overtimeRequestId: id,
          action: "CANCEL",
          oldStatus: "SUBMITTED",
          newStatus: "DRAFT",
          reason:
            dto.reason?.trim() ||
            "ผู้ยื่นยกเลิกการส่งคำขอเพื่อกลับไปแก้ไขหรือลบคำขอ OT",
          note:
            dto.note?.trim() ||
            "คำขอ OT ถูกถอนออกจากคิวอนุมัติและกลับเป็นร่าง",
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForOvertime(request, actorId, 'WITHDRAW_TO_DRAFT');

    await this.notifyOvertimeSafely('ปิดแจ้งเตือนคำขอ OT ที่ถูกถอนกลับเป็นร่าง', () =>
      this.notificationsService.closeOvertimePendingNotifications(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async cancel(
    id: string,
    dto: OvertimeRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!request) {
      throw new NotFoundException("ไม่พบคำขอ OT");
    }

    if (request.status === "CANCELLED") {
      throw new BadRequestException("คำขอ OT นี้ถูกยกเลิกแล้ว");
    }

    if (request.status === "REJECTED") {
      throw new BadRequestException(
        "คำขอ OT ที่ไม่อนุมัติแล้วไม่จำเป็นต้องยกเลิก",
      );
    }

    // OT ที่อนุมัติและถูกจ่ายในงวดที่ปิดแล้ว ยกเลิกไม่ได้ — เงินจ่ายไปแล้ว
    if (request.status === "APPROVED") {
      await assertWorkDateNotLocked(
        this.prisma as never,
        request.employeeId,
        request.workDate,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.overtimeRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: actorId,
        },
      });

      await tx.overtimeApprovalStep.updateMany({
        where: {
          overtimeRequestId: id,
          status: {
            in: ["WAITING", "PENDING"],
          },
        },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.overtimeApprovalLog.create({
        data: {
          overtimeRequestId: id,
          action: "CANCEL",
          oldStatus: request.status,
          newStatus: "CANCELLED",
          reason: dto.reason?.trim() || null,
          note: dto.note?.trim() || null,
          approvedById: actorId,
        },
      });
    });

    await this.enqueueAttendanceRecalculationForOvertime(request, actorId, 'CANCEL');

    await this.notifyOvertimeSafely('ปิดแจ้งเตือนคำขอ OT ที่ถูกยกเลิก', () =>
      this.notificationsService.closeOvertimePendingNotifications(id),
    );

    return this.findOne(id, INTERNAL_UNSCOPED);
  }

  async remove(id: string, currentUser: CurrentUserLike) {
    return this.cancel(
      id,
      {
        reason: "ยกเลิกคำขอ OT จากระบบ",
      },
      currentUser,
    );
  }

  async findAttachments(overtimeRequestId: string, scope: TenantScope) {
    // Delegates attachment listing to the dedicated attachment service.
    // Keep this public method so existing controller calls remain unchanged.
    return this.overtimeAttachmentService.findAttachments(
      overtimeRequestId,
      scope,
    );
  }

  async uploadAttachment(
    overtimeRequestId: string,
    dto: UploadOvertimeAttachmentDto,
    file: Express.Multer.File,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    // Delegates upload metadata handling to the attachment service.
    return this.overtimeAttachmentService.uploadAttachment(
      overtimeRequestId,
      dto,
      file,
      scope,
      currentUserId,
    );
  }

  async getAttachmentFileForDownload(
    overtimeRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    // Delegates storage path validation and file metadata lookup.
    return this.overtimeAttachmentService.getAttachmentFileForDownload(
      overtimeRequestId,
      attachmentId,
      scope,
    );
  }

  async removeAttachment(
    overtimeRequestId: string,
    attachmentId: string,
    scope: TenantScope,
  ) {
    // Delegates soft-delete validation to the attachment service.
    return this.overtimeAttachmentService.removeAttachment(
      overtimeRequestId,
      attachmentId,
      scope,
    );
  }


  private async enqueueAttendanceRecalculationForOvertime(
    request: { id: string; employeeId: string; workDate: Date },
    actorId: string,
    sourceAction: string,
  ) {
    await this.attendanceRecalculation.enqueueDate({
      employeeId: request.employeeId,
      startDate: request.workDate,
      requestedById: actorId,
      sourceType: "OVERTIME_REQUEST",
      sourceId: request.id,
      sourceAction,
    });
  }

  private notifyOvertimeSafely(
    actionDescription: string,
    callback: () => Promise<unknown>,
  ) {
    void Promise.resolve()
      .then(callback)
      .catch((error) => {
        console.error(`[OvertimeNotification] ${actionDescription} ไม่สำเร็จ`, error);
      });
  }

  private overtimeRequestInclude() {
    return {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
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
      submittedBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      cancelledBy: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      approvalLogs: {
        include: {
          approvedBy: {
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
              nickname: true,
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
    } satisfies Prisma.OvertimeRequestInclude;
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException("ไม่พบข้อมูลผู้ใช้งานปัจจุบัน");
    }

    return actorId;
  }

  private async resolveCurrentEmployee(currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);

    return this.resolveEmployee(undefined, actorId);
  }

  private async ensureMyOvertimeRequest(
    overtimeRequestId: string,
    currentUser: CurrentUserLike,
  ) {
    const employee = await this.resolveCurrentEmployee(currentUser);

    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id: overtimeRequestId,
        employeeId: employee.id,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!request) {
      throw new NotFoundException(
        "ไม่พบคำขอ OT ของคุณ หรือไม่มีสิทธิ์เข้าถึงรายการนี้",
      );
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
        "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถยื่น OT เองได้",
      );
    }

    return employee;
  }

  private async generateRequestNo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const prefix = `OT-${year}${month}${day}`;

    const count = await this.prisma.overtimeRequest.count({
      where: {
        requestNo: {
          startsWith: prefix,
        },
      },
    });

    return `${prefix}-${String(count + 1).padStart(4, "0")}`;
  }
}
