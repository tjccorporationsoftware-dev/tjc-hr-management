import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  DocumentRequestStatus,
  LeaveRequestStatus,
  OffsiteRequestStatus,
  OvertimeRequestStatus,
  Prisma,
  TimeAdjustRequestStatus,
} from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";

import { LeaveRequestsService } from "../leaves/leave-requests.service";
import { OvertimeRequestsService } from "../overtime/overtime-requests.service";
import { TimeAdjustRequestsService } from "../time-adjust/time-adjust-requests.service";
import { OffsiteWorkService } from "../offsite-work/offsite-work.service";
import { DocumentWorkflowService } from "../document-workflow/document-workflow.service";
import { canApproveOwnRequest } from "../approval-workflow/utils/approval-step-authorization.util";

import { ListApprovalRequestsQueryDto } from "./dto/list-approval-requests-query.dto";
import { ApprovalActionDto } from "./dto/approval-action.dto";
import {
  buildCurrentLeaveApprovalStepWhere,
  buildCurrentOvertimeApprovalStepWhere,
  buildCurrentTimeAdjustApprovalStepWhere,
  buildLeaveApprovalStepScopeWhere,
  buildOvertimeApprovalStepScopeWhere,
  buildTimeAdjustApprovalStepScopeWhere,
} from "./helpers/approval-scope.helper";
import {
  buildLeaveTextSearchWhere,
  buildOvertimeTextSearchWhere,
  buildTimeAdjustTextSearchWhere,
} from "./helpers/approval-search.helper";
import {
  approvalLogUserInclude,
  approvalStepInclude,
  employeeInclude,
  mapLeaveApprovalItem,
  mapOvertimeApprovalItem,
  mapTimeAdjustApprovalItem,
} from "./mappers/approval-item.mapper";
import {
  ApprovalItem,
  ApproverEmployee,
  CurrentUserLike,
} from "./types/approval-center.types";

/**
 * ApprovalsService
 *
 * Service กลางของหน้า Approval Center
 * ทำหน้าที่หลัก 3 อย่าง:
 * 1. รวมรายการอนุมัติจาก Leave / OT / Time Adjust ให้ frontend ใช้ format เดียวกัน
 * 2. ตรวจว่า user ปัจจุบันมีสิทธิ์เห็น/อนุมัติ request นั้นจริงหรือไม่
 * 3. ส่งต่อคำสั่ง approve/reject ไปยัง service เจ้าของ module จริง
 *
 * สิ่งที่ตั้งใจไม่ทำในไฟล์นี้:
 * - ไม่คำนวณวันลาเอง
 * - ไม่คำนวณ OT เอง
 * - ไม่แก้ AttendanceLog เอง
 * เพราะ logic เหล่านั้นควรอยู่ใน module เจ้าของข้อมูล
 */
@Injectable()
export class ApprovalsService {
  private readonly sourceFetchLimit = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly overtimeRequestsService: OvertimeRequestsService,
    private readonly timeAdjustRequestsService: TimeAdjustRequestsService,
    private readonly offsiteWorkService: OffsiteWorkService,
    private readonly documentWorkflowService: DocumentWorkflowService,
  ) {}

  /**
   * โหลดรายการสำหรับหน้า Approval Center
   *
   * Flow การทำงาน:
   * 1. resolve user ปัจจุบันให้กลายเป็น employee ผู้อนุมัติ
   * 2. ดู query ว่าต้องการประเภทใด เช่น ALL / LEAVE / OVERTIME / TIME_ADJUST
   * 3. ดึงข้อมูลจากแต่ละ table ตาม scope ของผู้อนุมัติ
   * 4. map ให้ทุกประเภทอยู่ในรูป ApprovalItem เดียวกัน
   * 5. sort และ paginate ก่อนส่งกลับ frontend
   */
  async findPendingApprovals(
    currentUser: CurrentUserLike,
    query: ListApprovalRequestsQueryDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const type = query.type ?? "ALL";
    const status = query.status ?? "SUBMITTED";
    const q = query.q?.trim();

    /**
     * ดึงทุกประเภทสำหรับทำ summary จาก API ฝั่ง backend เท่านั้น
     * แล้วค่อยเลือก type ที่ต้องแสดงในตารางภายหลัง
     * เพื่อให้ตัวเลขบน tab/card ไม่ต้องนับเองใน frontend และไม่ผิดเมื่อมี pagination
     */
    const [
      leaveItems,
      overtimeItems,
      timeAdjustItems,
      offsiteItems,
      documentItems,
    ] = await Promise.all([
      this.findLeaveItems(scopedApprover, actorId, status, q),
      this.findOvertimeItems(scopedApprover, actorId, status, q),
      this.findTimeAdjustItems(scopedApprover, actorId, status, q),
      this.findOffsiteItems(scopedApprover, actorId, roleCodes, status, q),
      this.findDocumentItems(scopedApprover, actorId, roleCodes, status, q),
    ]);

    const allItems: ApprovalItem[] = [
      ...leaveItems,
      ...overtimeItems,
      ...timeAdjustItems,
      ...offsiteItems,
      ...documentItems,
    ];

    const filteredItems = this.applyApprovalCenterFilters(allItems, query);
    const activeItems =
      type === "ALL"
        ? filteredItems
        : filteredItems.filter((item) => item.type === type);

    const sorted = this.sortApprovalItems(activeItems);
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      items: sorted.slice(start, end),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: this.buildApprovalCenterSummary(filteredItems, sorted, type),
    };
  }

  /**
   * Mobile Approval inbox แบบ bounded pagination
   *
   * ไม่เรียก findPendingApprovals เพราะ Web method ต้องสร้าง summary ครบทุกประเภท
   * และมี sourceFetchLimit=5000 ตาม contract เดิมของเว็บ ส่วน Mobile ต้องการเพียง
   * 4 ประเภทที่รองรับและ top window ของหน้าปัจจุบันเท่านั้น
   */
  async findMobileApprovals(
    currentUser: CurrentUserLike,
    query: ListApprovalRequestsQueryDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const type = query.type ?? "ALL";
    const status = query.status ?? "SUBMITTED";
    const q = query.q?.trim() || undefined;
    const windowSize = page * pageSize + 1;
    const mobileTypes = [
      "LEAVE",
      "OVERTIME",
      "TIME_ADJUST",
      "OFFSITE",
      "DOCUMENT",
    ] as const;
    const requestedTypes =
      type === "ALL"
        ? mobileTypes
        : mobileTypes.filter((candidate) => candidate === type);

    const sources = await Promise.all(
      requestedTypes.map(async (sourceType) => {
        if (sourceType === "LEAVE") {
          return this.findMobileLeaveItems(
            scopedApprover,
            actorId,
            status,
            q,
            query.dateFrom,
            query.dateTo,
            windowSize,
          );
        }
        if (sourceType === "OVERTIME") {
          return this.findMobileOvertimeItems(
            scopedApprover,
            actorId,
            status,
            q,
            query.dateFrom,
            query.dateTo,
            windowSize,
          );
        }
        if (sourceType === "TIME_ADJUST") {
          return this.findMobileTimeAdjustItems(
            scopedApprover,
            actorId,
            status,
            q,
            query.dateFrom,
            query.dateTo,
            windowSize,
          );
        }
        if (sourceType === "OFFSITE") {
          return this.findMobileOffsiteItems(
            scopedApprover,
            actorId,
            roleCodes,
            status,
            q,
            query.dateFrom,
            query.dateTo,
            windowSize,
          );
        }
        return this.findMobileDocumentItems(
          scopedApprover,
          actorId,
          roleCodes,
          status,
          q,
          query.dateFrom,
          query.dateTo,
          windowSize,
        );
      }),
    );

    const sorted = this.sortApprovalItems(sources.flatMap((source) => source.items));
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const items = sorted.slice(start, end);
    const hasMore = sorted.length > end;
    const exactTotal = sources.every((source) => source.totalExact);
    const total = exactTotal
      ? sources.reduce((sum, source) => sum + source.total, 0)
      : hasMore
        ? end + 1
        : start + items.length;

    return {
      items,
      meta: {
        hasMore,
        page,
        pageSize,
        total,
        totalExact: exactTotal,
        totalPages: exactTotal
          ? Math.ceil(total / pageSize)
          : hasMore
            ? page + 1
            : page,
      },
    };
  }

  /**
   * จำนวนงานรออนุมัติจริงสำหรับ badge ของ Mobile bootstrap
   *
   * ใช้ scope/visibility ชุดเดียวกับ Mobile Approval inbox เพื่อไม่ให้ badge
   * บอกจำนวนที่ผู้ใช้กดเข้าไปแล้วมองไม่เห็นรายการนั้น และไม่เรียก Web
   * Approval Center ที่มี sourceFetchLimit ตาม contract เดิมของเว็บ
   */
  async countMobilePendingApprovals(currentUser: CurrentUserLike) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    const [leave, overtime, timeAdjust, offsite] = await Promise.all([
      this.findMobileLeaveItems(
        scopedApprover,
        actorId,
        'SUBMITTED',
        undefined,
        undefined,
        undefined,
        1,
      ),
      this.findMobileOvertimeItems(
        scopedApprover,
        actorId,
        'SUBMITTED',
        undefined,
        undefined,
        undefined,
        1,
      ),
      this.findMobileTimeAdjustItems(
        scopedApprover,
        actorId,
        'SUBMITTED',
        undefined,
        undefined,
        undefined,
        1,
      ),
      this.countMobilePendingOffsiteItems(scopedApprover, actorId, roleCodes),
    ]);

    return leave.total + overtime.total + timeAdjust.total + offsite;
  }

  /**
   * ตรวจว่ารายการอยู่ในคิว/ประวัติที่ผู้อนุมัติคนปัจจุบันมีสิทธิ์เข้าถึง
   *
   * เปิดเป็น public เพื่อให้ adapter เช่น Mobile download ไฟล์แนบได้โดยใช้
   * กฎ scope ชุดเดียวกับปุ่มอนุมัติ ไม่ต้องคัดลอกกฎ supervisor/role อีกชุด
   */
  async ensureApprovalInScope(
    currentUser: CurrentUserLike,
    type: 'LEAVE' | 'OVERTIME' | 'TIME_ADJUST' | 'OFFSITE' | 'DOCUMENT',
    id: string,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    if (type === 'LEAVE') {
      return this.ensureLeaveRequestVisibleInScope(id, scopedApprover, actorId);
    }

    if (type === 'OVERTIME') {
      return this.ensureOvertimeRequestVisibleInScope(id, scopedApprover, actorId);
    }

    if (type === 'TIME_ADJUST') {
      return this.ensureTimeAdjustRequestVisibleInScope(id, scopedApprover, actorId);
    }

    if (type === 'OFFSITE') {
      return this.ensureOffsiteRequestVisibleInScope(
        id,
        scopedApprover,
        actorId,
        roleCodes,
      );
    }

    return this.ensureDocumentRequestInScope(id, scopedApprover, roleCodes);
  }


  /**
   * โหลดรายละเอียดคำขอหนึ่งรายการสำหรับ adapter เช่น Mobile Approval Detail
   *
   * เป็น additive read method เท่านั้น: ใช้ scope ชุดเดียวกับ action ปัจจุบัน
   * และใช้ mapper ของ Approval Center เดิม จึงไม่สร้าง business rule ชุดใหม่
   * หรือเปลี่ยนพฤติกรรม list API ของเว็บ
   */
  async findApprovalDetail(
    currentUser: CurrentUserLike,
    type: 'LEAVE' | 'OVERTIME' | 'TIME_ADJUST' | 'OFFSITE' | 'DOCUMENT',
    id: string,
  ): Promise<ApprovalItem> {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    if (type === 'LEAVE') {
      await this.ensureLeaveRequestVisibleInScope(id, scopedApprover, actorId);

      const item = await this.prisma.leaveRequest.findFirst({
        where: { id, deletedAt: null },
        include: {
          employee: employeeInclude(),
          leaveType: {
            select: { id: true, code: true, nameTh: true },
          },
          approvalSteps: {
            orderBy: { stepNo: 'asc' },
            include: approvalStepInclude(),
          },
          approvalLogs: {
            orderBy: { createdAt: 'asc' },
            include: { approvedBy: approvalLogUserInclude() },
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              createdAt: true,
            },
          },
        },
      });

      if (!item) {
        throw new NotFoundException('ไม่พบใบลาที่รออนุมัติของคุณ');
      }

      return mapLeaveApprovalItem(item, scopedApprover);
    }

    if (type === 'OVERTIME') {
      await this.ensureOvertimeRequestVisibleInScope(id, scopedApprover, actorId);

      const item = await this.prisma.overtimeRequest.findFirst({
        where: { id, deletedAt: null },
        include: {
          employee: employeeInclude(),
          approvalSteps: {
            orderBy: { stepNo: 'asc' },
            include: approvalStepInclude(),
          },
          approvalLogs: {
            orderBy: { createdAt: 'asc' },
            include: { approvedBy: approvalLogUserInclude() },
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!item) {
        throw new NotFoundException('ไม่พบคำขอ OT ที่รออนุมัติของคุณ');
      }

      return mapOvertimeApprovalItem(item, scopedApprover);
    }

    if (type === 'TIME_ADJUST') {
      await this.ensureTimeAdjustRequestVisibleInScope(id, scopedApprover, actorId);

      const item = await this.prisma.timeAdjustRequest.findFirst({
        where: { id, deletedAt: null },
        include: {
          employee: employeeInclude(),
          originalAttendanceLog: true,
          approvalSteps: {
            orderBy: { stepNo: 'asc' },
            include: approvalStepInclude(),
          },
          logs: {
            orderBy: { createdAt: 'asc' },
            include: { actedBy: approvalLogUserInclude() },
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!item) {
        throw new NotFoundException('ไม่พบคำขอแก้เวลาที่รออนุมัติของคุณ');
      }

      return mapTimeAdjustApprovalItem(item, scopedApprover);
    }

    if (type === 'DOCUMENT') {
      /*
       * ตรวจสิทธิ์ก่อนเสมอ แล้วค่อยโหลดใบเต็มสำหรับ mapper
       *
       * ไม่ขยาย include ของ ensureDocumentRequestInScope เพราะเมธอดนั้นถูก
       * เรียกทุกครั้งที่กดอนุมัติ/ปฏิเสธจากฝั่งเว็บด้วย การเพิ่ม join เข้าไป
       * เท่ากับทำให้ทุก action ของเว็บหนักขึ้นเพื่อรองรับจอเดียวของแอป
       */
      await this.ensureDocumentRequestInScope(id, scopedApprover, roleCodes);

      const item = await this.prisma.documentRequest.findFirst({
        where: { id, deletedAt: null },
        include: {
          employee: {
            select: {
              ...(employeeInclude() as any).select,
              supervisorId: true,
            },
          },
          documentType: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              requiresApproval: true,
              approvalLevels: true,
            },
          },
          approvals: {
            orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
            include: {
              actedBy: {
                select: { id: true, email: true, displayName: true },
              },
            },
          },
        },
      });

      if (!item) {
        throw new NotFoundException('ไม่พบคำขอเอกสารที่รออนุมัติของคุณ');
      }

      return this.mapDocumentApprovalItem(item, scopedApprover, roleCodes);
    }

    await this.ensureOffsiteRequestVisibleInScope(
      id,
      scopedApprover,
      actorId,
      roleCodes,
    );

    const prisma = this.prisma as any;
    const item = await prisma.offsiteWorkRequest.findFirst({
      where: { id, deletedAt: null },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบคำขอทำงานนอกสถานที่ที่รออนุมัติของคุณ');
    }

    const employeeMap = await this.loadEmployeeMap(
      item.employeeId ? [item.employeeId] : [],
    );
    const snapshotRefs = await this.loadSnapshotStepRefs([item]);

    return this.mapOffsiteApprovalItem(
      item,
      employeeMap.get(item.employeeId) ?? null,
      scopedApprover,
      snapshotRefs,
    );
  }

  private mobileApprovalDateWhere(dateFrom?: string, dateTo?: string) {
    const start = this.parseDateBoundary(dateFrom, "start");
    const end = this.parseDateBoundary(dateTo, "end");
    if (!start && !end) return null;

    const range: { gte?: Date; lte?: Date } = {};
    if (start) range.gte = start;
    if (end) range.lte = end;

    return {
      OR: [
        { submittedAt: range },
        { submittedAt: null, createdAt: range },
      ],
    };
  }

  private async findMobileLeaveItems(
    approver: ApproverEmployee,
    actorId: string,
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q: string | undefined,
    dateFrom: string | undefined,
    dateTo: string | undefined,
    take: number,
  ) {
    const dateWhere = this.mobileApprovalDateWhere(dateFrom, dateTo);
    const searchWhere = buildLeaveTextSearchWhere(q);
    const where: Prisma.LeaveRequestWhereInput = {
      deletedAt: null,
      employee: { is: { companyId: approver.companyId } },
      ...(status === "RETURNED" ? { status: LeaveRequestStatus.DRAFT } : {}),
      approvalSteps: {
        some: buildLeaveApprovalStepScopeWhere(approver, status),
      },
      AND: [
        this.excludeOwnRequestWhere(approver, actorId),
        ...(q ? [searchWhere] : []),
        ...(dateWhere ? [dateWhere as Prisma.LeaveRequestWhereInput] : []),
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        include: {
          employee: employeeInclude(),
          leaveType: { select: { id: true, code: true, nameTh: true } },
          approvalSteps: {
            orderBy: { stepNo: "asc" },
            include: approvalStepInclude(),
          },
          approvalLogs: {
            orderBy: { createdAt: "asc" },
            include: { approvedBy: approvalLogUserInclude() },
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        take,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      items: rows.map((row) => mapLeaveApprovalItem(row, approver)),
      total,
      totalExact: true,
    };
  }

  private async findMobileOvertimeItems(
    approver: ApproverEmployee,
    actorId: string,
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q: string | undefined,
    dateFrom: string | undefined,
    dateTo: string | undefined,
    take: number,
  ) {
    const dateWhere = this.mobileApprovalDateWhere(dateFrom, dateTo);
    const searchWhere = buildOvertimeTextSearchWhere(q);
    const where: Prisma.OvertimeRequestWhereInput = {
      deletedAt: null,
      employee: { is: { companyId: approver.companyId } },
      ...(status === "RETURNED" ? { status: OvertimeRequestStatus.DRAFT } : {}),
      approvalSteps: {
        some: buildOvertimeApprovalStepScopeWhere(approver, status),
      },
      AND: [
        this.excludeOwnRequestWhere(approver, actorId),
        ...(q ? [searchWhere] : []),
        ...(dateWhere ? [dateWhere as Prisma.OvertimeRequestWhereInput] : []),
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.overtimeRequest.findMany({
        where,
        include: {
          employee: employeeInclude(),
          approvalSteps: {
            orderBy: { stepNo: "asc" },
            include: approvalStepInclude(),
          },
          approvalLogs: {
            orderBy: { createdAt: "asc" },
            include: { approvedBy: approvalLogUserInclude() },
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        take,
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    return {
      items: rows.map((row) => mapOvertimeApprovalItem(row, approver)),
      total,
      totalExact: true,
    };
  }

  private async findMobileTimeAdjustItems(
    approver: ApproverEmployee,
    actorId: string,
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q: string | undefined,
    dateFrom: string | undefined,
    dateTo: string | undefined,
    take: number,
  ) {
    const dateWhere = this.mobileApprovalDateWhere(dateFrom, dateTo);
    const searchWhere = buildTimeAdjustTextSearchWhere(q);
    const where: Prisma.TimeAdjustRequestWhereInput = {
      deletedAt: null,
      employee: { is: { companyId: approver.companyId } },
      ...(status === "RETURNED" ? { status: TimeAdjustRequestStatus.DRAFT } : {}),
      approvalSteps: {
        some: buildTimeAdjustApprovalStepScopeWhere(approver, status),
      },
      AND: [
        this.excludeOwnRequestWhere(approver, actorId),
        ...(q ? [searchWhere] : []),
        ...(dateWhere ? [dateWhere as Prisma.TimeAdjustRequestWhereInput] : []),
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.timeAdjustRequest.findMany({
        where,
        include: {
          employee: employeeInclude(),
          originalAttendanceLog: true,
          approvalSteps: {
            orderBy: { stepNo: "asc" },
            include: approvalStepInclude(),
          },
          logs: {
            orderBy: { createdAt: "asc" },
            include: { actedBy: approvalLogUserInclude() },
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        take,
      }),
      this.prisma.timeAdjustRequest.count({ where }),
    ]);

    return {
      items: rows.map((row) => mapTimeAdjustApprovalItem(row, approver)),
      total,
      totalExact: true,
    };
  }

  private async findMobileOffsiteItems(
    approver: ApproverEmployee,
    actorId: string,
    roleCodes: string[],
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q: string | undefined,
    dateFrom: string | undefined,
    dateTo: string | undefined,
    take: number,
  ) {
    const prisma = this.prisma as any;
    const dateWhere = this.mobileApprovalDateWhere(dateFrom, dateTo);
    const baseWhere = {
      deletedAt: null,
      ...this.excludeOwnRequestWhere(approver, actorId),
      companyId: approver.companyId,
      status: {
        in: [
          OffsiteRequestStatus.DRAFT,
          OffsiteRequestStatus.SUBMITTED,
          OffsiteRequestStatus.MANAGER_APPROVED,
          OffsiteRequestStatus.HR_APPROVED,
          OffsiteRequestStatus.MANAGER_REJECTED,
          OffsiteRequestStatus.HR_REJECTED,
          OffsiteRequestStatus.APPROVED,
          OffsiteRequestStatus.REJECTED,
        ],
      },
      ...(dateWhere ? { AND: [dateWhere] } : {}),
    };

    const chunkSize = 100;
    const visible: ApprovalItem[] = [];
    let skip = 0;
    let exhausted = false;

    while (visible.length < take && !exhausted) {
      const rows = await prisma.offsiteWorkRequest.findMany({
        where: baseWhere,
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: chunkSize,
      });

      if (rows.length < chunkSize) exhausted = true;
      if (rows.length === 0) break;
      skip += rows.length;

      const employeeMap = await this.loadEmployeeMap(
        rows.map((row: any) => row.employeeId).filter(Boolean),
      );
      const snapshotRefs = await this.loadSnapshotStepRefs(rows);

      for (const row of rows) {
        if (
          !this.isOffsiteRequestVisibleForApprover(
            row,
            approver,
            roleCodes,
            status,
          )
        ) {
          continue;
        }

        if (
          !this.matchesTextSearch(q, [
            row.requestNo,
            row.locationName,
            row.address,
            row.reason,
            this.employeeText(employeeMap.get(row.employeeId)),
          ])
        ) {
          continue;
        }

        visible.push(
          this.mapOffsiteApprovalItem(
            row,
            employeeMap.get(row.employeeId) ?? null,
            approver,
            snapshotRefs,
          ),
        );
        if (visible.length >= take) break;
      }
    }

    return {
      items: visible,
      /* snapshot visibility ต้องประเมินใน application layer จึงคืน lower-bound */
      total: visible.length,
      totalExact: exhausted,
    };
  }

  /**
   * คำร้องเอกสารสำหรับกล่องอนุมัติบนมือถือ
   *
   * โครงเดียวกับ findMobileOffsiteItems เพราะทั้งสองประเภทตัดสิน "ใครเห็นใบนี้"
   * จาก approval snapshot ในชั้นแอปพลิเคชัน ไม่ใช่จาก where ของฐานข้อมูล —
   * จึงต้องดึงมาเป็นก้อนแล้วกรองทีละแถวจนได้ครบหน้าที่ขอ
   *
   * ต่างจาก findDocumentItems ของเว็บตรงที่ไม่ดึง 5000 แถวรวดเดียว และรองรับ
   * ช่วงวันที่ ซึ่งเป็นตัวกรองที่มีเฉพาะบนมือถือ
   */
  private async findMobileDocumentItems(
    approver: ApproverEmployee,
    actorId: string,
    roleCodes: string[],
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q: string | undefined,
    dateFrom: string | undefined,
    dateTo: string | undefined,
    take: number,
  ) {
    const dateWhere = this.mobileApprovalDateWhere(dateFrom, dateTo);
    const baseWhere = {
      deletedAt: null,
      ...this.excludeOwnRequestWhere(approver, actorId),
      companyId: approver.companyId,
      status: {
        in: [
          DocumentRequestStatus.DRAFT,
          DocumentRequestStatus.SUBMITTED,
          DocumentRequestStatus.APPROVED,
          DocumentRequestStatus.REJECTED,
        ],
      },
      ...(dateWhere ? { AND: [dateWhere] } : {}),
    };

    const chunkSize = 100;
    const visible: ApprovalItem[] = [];
    let skip = 0;
    let exhausted = false;

    while (visible.length < take && !exhausted) {
      const rows = await this.prisma.documentRequest.findMany({
        where: baseWhere as never,
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: chunkSize,
        include: {
          employee: {
            select: {
              ...(employeeInclude() as any).select,
              supervisorId: true,
            },
          },
          documentType: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              requiresApproval: true,
              approvalLevels: true,
            },
          },
          approvals: {
            orderBy: [{ level: "asc" }, { createdAt: "asc" }],
            include: {
              actedBy: {
                select: { id: true, email: true, displayName: true },
              },
            },
          },
        },
      });

      if (rows.length < chunkSize) exhausted = true;
      if (rows.length === 0) break;
      skip += rows.length;

      for (const row of rows as any[]) {
        if (
          !this.isDocumentRequestVisibleForApprover(
            row,
            approver,
            roleCodes,
            status,
          )
        ) {
          continue;
        }

        if (
          !this.matchesTextSearch(q, [
            row.requestNo,
            row.title,
            row.purpose,
            row.note,
            row.documentType?.code,
            row.documentType?.nameTh,
            this.employeeText(row.employee),
          ])
        ) {
          continue;
        }

        visible.push(this.mapDocumentApprovalItem(row, approver, roleCodes));
        if (visible.length >= take) break;
      }
    }

    return {
      items: visible,
      /* snapshot visibility ต้องประเมินใน application layer จึงคืน lower-bound */
      total: visible.length,
      totalExact: exhausted,
    };
  }

  private async countMobilePendingOffsiteItems(
    approver: ApproverEmployee,
    actorId: string,
    roleCodes: string[],
  ) {
    const prisma = this.prisma as any;
    const where = {
      deletedAt: null,
      ...this.excludeOwnRequestWhere(approver, actorId),
      companyId: approver.companyId,
      status: {
        in: [
          OffsiteRequestStatus.DRAFT,
          OffsiteRequestStatus.SUBMITTED,
          OffsiteRequestStatus.MANAGER_APPROVED,
          OffsiteRequestStatus.HR_APPROVED,
          OffsiteRequestStatus.MANAGER_REJECTED,
          OffsiteRequestStatus.HR_REJECTED,
          OffsiteRequestStatus.APPROVED,
          OffsiteRequestStatus.REJECTED,
        ],
      },
    };

    const chunkSize = 100;
    let skip = 0;
    let count = 0;

    while (true) {
      const rows = await prisma.offsiteWorkRequest.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: chunkSize,
        select: {
          approvalSnapshot: true,
          status: true,
        },
      });

      if (rows.length === 0) break;
      skip += rows.length;

      for (const row of rows) {
        if (
          this.isOffsiteRequestVisibleForApprover(
            row,
            approver,
            roleCodes,
            'SUBMITTED',
          )
        ) {
          count += 1;
        }
      }

      if (rows.length < chunkSize) break;
    }

    return count;
  }

  private sortApprovalItems(items: ApprovalItem[]) {
    return [...items].sort((a, b) => {
      const aTime = this.getApprovalItemDate(a).getTime();
      const bTime = this.getApprovalItemDate(b).getTime();

      return bTime - aTime;
    });
  }

  private applyApprovalCenterFilters(
    items: ApprovalItem[],
    query: ListApprovalRequestsQueryDto,
  ) {
    const dateFrom = this.parseDateBoundary(query.dateFrom, "start");
    const dateTo = this.parseDateBoundary(query.dateTo, "end");

    return items.filter((item) => {
      if (query.urgentOnly && !this.isUrgentApprovalItem(item)) return false;

      const submittedAt = this.getApprovalItemDate(item);
      if (dateFrom && submittedAt < dateFrom) return false;
      if (dateTo && submittedAt > dateTo) return false;

      return true;
    });
  }

  private parseDateBoundary(value: string | undefined, mode: "start" | "end") {
    if (!value) return null;

    const date = new Date(`${value}T${mode === "start" ? "00:00:00" : "23:59:59"}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private getApprovalItemDate(item: ApprovalItem) {
    const raw = item.submittedAt ?? item.createdAt;
    const date = raw instanceof Date ? raw : new Date(raw);

    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }

  private isUrgentApprovalItem(item: ApprovalItem) {
    if (item.status !== "SUBMITTED") return false;

    const diffMs = Date.now() - this.getApprovalItemDate(item).getTime();
    return diffMs >= 3 * 24 * 60 * 60 * 1000;
  }

  private isTodayApprovalItem(item: ApprovalItem) {
    const submittedAt = this.getApprovalItemDate(item);
    const now = new Date();

    return (
      submittedAt.getFullYear() === now.getFullYear() &&
      submittedAt.getMonth() === now.getMonth() &&
      submittedAt.getDate() === now.getDate()
    );
  }

  private isThisWeekApprovalItem(item: ApprovalItem) {
    const submittedAt = this.getApprovalItemDate(item);
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - now.getDay());

    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    return submittedAt >= start && submittedAt < end;
  }

  private buildApprovalCenterSummary(
    allFilteredItems: ApprovalItem[],
    activeItems: ApprovalItem[],
    type: NonNullable<ListApprovalRequestsQueryDto["type"]>,
  ) {
    const countByType = (targetType: ApprovalItem["type"]) =>
      allFilteredItems.filter((item) => item.type === targetType).length;
    const overtimeItems = activeItems.filter((item) => item.type === "OVERTIME");
    const timeAdjustItems = activeItems.filter((item) => item.type === "TIME_ADJUST");

    const overtimeTotalHours = overtimeItems.reduce(
      (sum, item) => sum + this.toNumber(this.toRecord(item.detail).totalHours),
      0,
    );
    const overtimeNoAttachment = overtimeItems.filter(
      (item) => !this.hasApprovalAttachment(item),
    ).length;
    const timeAdjustNoAttachment = timeAdjustItems.filter(
      (item) => !this.hasApprovalAttachment(item),
    ).length;
    const oldestPending = this.sortApprovalItems(
      activeItems.filter((item) => item.status === "SUBMITTED"),
    ).at(-1);

    return {
      total: activeItems.length,
      pending: activeItems.filter((item) => item.status === "SUBMITTED").length,
      approved: activeItems.filter((item) => item.status === "APPROVED").length,
      rejected: activeItems.filter((item) => item.status === "REJECTED").length,
      returned: activeItems.filter((item) => item.status === "RETURNED").length,
      leave: countByType("LEAVE"),
      overtime: countByType("OVERTIME"),
      timeAdjust: countByType("TIME_ADJUST"),
      offsite: countByType("OFFSITE"),
      document: countByType("DOCUMENT"),
      urgent: activeItems.filter((item) => this.isUrgentApprovalItem(item)).length,
      today: activeItems.filter((item) => this.isTodayApprovalItem(item)).length,
      week: activeItems.filter((item) => this.isThisWeekApprovalItem(item)).length,
      overtimeTotalHours: Number(overtimeTotalHours.toFixed(2)),
      overtimeAverageHours:
        overtimeItems.length > 0
          ? Number((overtimeTotalHours / overtimeItems.length).toFixed(2))
          : 0,
      overtimeNoAttachment,
      timeAdjustNoAttachment,
      oldestPending: oldestPending
        ? {
            id: oldestPending.id,
            type: oldestPending.type,
            employeeName: this.approvalEmployeeName(oldestPending),
            submittedAt: oldestPending.submittedAt ?? oldestPending.createdAt,
          }
        : null,
      leaveNextSevenDays: this.buildLeaveNextSevenDays(activeItems),
      monthlyTrend: this.buildApprovalMonthlyTrend(activeItems, type),
      donutData: this.buildApprovalDonutData(activeItems, type),
    };
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private valueText(value: unknown) {
    if (value === undefined || value === null || value === "") return "-";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }

  private approvalEmployeeName(item: ApprovalItem) {
    const employee = item.employee;
    if (!employee) return "ไม่พบข้อมูลพนักงาน";

    return (
      employee.displayName ||
      `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
      employee.employeeCode ||
      "ไม่ระบุชื่อ"
    );
  }

  private hasApprovalAttachment(item: ApprovalItem) {
    const detail = this.toRecord(item.detail);
    return this.toNumber(detail.attachmentCount) > 0;
  }

  private buildLeaveNextSevenDays(items: ApprovalItem[]) {
    const leaveItems = items.filter((item) => item.type === "LEAVE");

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + index);

      const key = date.toISOString().slice(0, 10);
      const count = leaveItems.filter((item) => {
        const detail = this.toRecord(item.detail);
        const startDate = detail.startDate ? new Date(String(detail.startDate)) : null;
        if (!startDate || Number.isNaN(startDate.getTime())) return false;

        return startDate.toISOString().slice(0, 10) === key;
      }).length;

      return {
        key,
        weekday: date.toLocaleDateString("th-TH", { weekday: "short" }),
        date: date.getDate(),
        month: date.toLocaleDateString("th-TH", { month: "short" }),
        today: index === 0,
        count,
      };
    });
  }

  private buildApprovalMonthlyTrend(
    items: ApprovalItem[],
    type: NonNullable<ListApprovalRequestsQueryDto["type"]>,
  ) {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const label = `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear() + 543}`;

      return { key, label, value: 0 };
    });
    const map = new Map(months.map((item) => [item.key, item]));

    items.forEach((item) => {
      const date = this.getApprovalItemDate(item);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const target = map.get(key);
      if (!target) return;

      if (type === "OVERTIME") {
        target.value += this.toNumber(this.toRecord(item.detail).totalHours);
      } else {
        target.value += 1;
      }
    });

    return months.map((item) => ({
      label: item.label,
      value: Number(item.value.toFixed(2)),
    }));
  }

  private buildApprovalDonutData(
    items: ApprovalItem[],
    type: NonNullable<ListApprovalRequestsQueryDto["type"]>,
  ) {
    const colors = ["#2563eb", "#f97316", "#22c55e", "#8b5cf6", "#ef4444"];
    const map = new Map<string, number>();

    items.forEach((item) => {
      const detail = this.toRecord(item.detail);
      let label = this.requestTypeText(item.type);

      if (type === "LEAVE") {
        label = this.valueText(
          detail.leaveTypeName ?? this.toRecord(detail.leaveType).nameTh ?? item.title,
        );
      }

      if (type === "OVERTIME") {
        label = this.workTypeText(detail.workType ?? "OT");
      }

      if (type === "TIME_ADJUST") {
        label = this.adjustTypeText(detail.adjustType);
      }

      if (type === "OFFSITE") {
        label = this.valueText(detail.locationType ?? detail.locationName ?? "Offsite");
      }

      if (type === "DOCUMENT") {
        label = this.valueText(detail.documentTypeName ?? detail.documentTypeCode ?? item.title);
      }

      map.set(label, (map.get(label) ?? 0) + 1);
    });

    return Array.from(map.entries()).map(([label, value], index) => ({
      label,
      value,
      color: colors[index % colors.length],
    }));
  }

  private requestTypeText(type: ApprovalItem["type"]) {
    if (type === "LEAVE") return "ใบลา";
    if (type === "OVERTIME") return "OT";
    if (type === "TIME_ADJUST") return "ขอแก้เวลา";
    if (type === "OFFSITE") return "ทำงานนอกสถานที่";
    return "คำขอเอกสาร";
  }

  private workTypeText(value: unknown) {
    if (value === "WORKDAY") return "วันทำงาน";
    if (value === "HOLIDAY") return "วันหยุด";
    if (value === "SPECIAL_HOLIDAY") return "วันหยุดพิเศษ";
    return this.valueText(value);
  }

  private adjustTypeText(value: unknown) {
    const map: Record<string, string> = {
      MISSING_CHECK_IN: "ลืมลงเวลาเข้า",
      MISSING_CHECK_OUT: "ลืมลงเวลาออก",
      WRONG_TIME: "เวลาผิด",
      DEVICE_ERROR: "อุปกรณ์ขัดข้อง",
      OUTSIDE_WORK: "ทำงานนอกสถานที่",
      OTHER: "อื่น ๆ",
    };

    return typeof value === "string" ? map[value] ?? value : this.valueText(value);
  }

  /**
   * อนุมัติใบลา
   * ก่อนส่งต่อไป LeaveRequestsService ต้องเช็กก่อนว่า request นี้อยู่ใน step ที่ user นี้ต้องอนุมัติจริง
   */
  async approveLeaveRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureLeaveRequestInScope(id, scopedApprover);

    return this.leaveRequestsService.approve(id, dto, currentUser);
  }

  /** ไม่อนุมัติใบลา */
  async rejectLeaveRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureLeaveRequestInScope(id, scopedApprover);

    return this.leaveRequestsService.reject(id, dto, currentUser);
  }

  /** ส่งกลับใบลาให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  async returnLeaveRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureLeaveRequestInScope(id, scopedApprover);

    return this.leaveRequestsService.returnForReview(id, dto, currentUser);
  }

  /** อนุมัติคำขอ OT */
  async approveOvertimeRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureOvertimeRequestInScope(id, scopedApprover);

    return this.overtimeRequestsService.approve(id, dto, currentUser);
  }

  /** ไม่อนุมัติคำขอ OT */
  async rejectOvertimeRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureOvertimeRequestInScope(id, scopedApprover);

    return this.overtimeRequestsService.reject(id, dto, currentUser);
  }

  /** ส่งกลับคำขอ OT ให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  async returnOvertimeRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureOvertimeRequestInScope(id, scopedApprover);

    return this.overtimeRequestsService.returnForReview(id, dto, currentUser);
  }

  /** อนุมัติคำขอแก้เวลา */
  async approveTimeAdjustRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureTimeAdjustRequestInScope(id, scopedApprover);

    return this.timeAdjustRequestsService.approve(id, dto, currentUser);
  }

  /** ไม่อนุมัติคำขอแก้เวลา */
  async rejectTimeAdjustRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureTimeAdjustRequestInScope(id, scopedApprover);

    return this.timeAdjustRequestsService.reject(id, dto, currentUser);
  }

  /** ส่งกลับคำขอแก้เวลาให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  async returnTimeAdjustRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(this.getActorId(currentUser));
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureTimeAdjustRequestInScope(id, scopedApprover);

    return this.timeAdjustRequestsService.returnForReview(id, dto, currentUser);
  }

  /** อนุมัติคำขอทำงานนอกสถานที่ */
  async approveOffsiteRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureOffsiteRequestInScope(id, scopedApprover, roleCodes);

    return this.offsiteWorkService.approve(id, dto, currentUser);
  }

  /** ไม่อนุมัติคำขอทำงานนอกสถานที่ */
  async rejectOffsiteRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureOffsiteRequestInScope(id, scopedApprover, roleCodes);

    return this.offsiteWorkService.reject(id, dto, currentUser);
  }

  /** ส่งกลับคำขอทำงานนอกสถานที่ให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  async returnOffsiteRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureOffsiteRequestInScope(id, scopedApprover, roleCodes);

    return this.offsiteWorkService.returnForReview(id, dto, currentUser);
  }

  /** อนุมัติคำขอเอกสาร */
  async approveDocumentRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureDocumentRequestInScope(id, scopedApprover, roleCodes);

    return this.documentWorkflowService.approveDocumentRequest(
      id,
      dto,
      currentUser,
    );
  }

  /** ไม่อนุมัติคำขอเอกสาร */
  async rejectDocumentRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureDocumentRequestInScope(id, scopedApprover, roleCodes);

    return this.documentWorkflowService.rejectDocumentRequest(
      id,
      dto,
      currentUser,
    );
  }

  /** ส่งกลับคำขอเอกสารให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  async returnDocumentRequest(
    currentUser: CurrentUserLike,
    id: string,
    dto: ApprovalActionDto,
  ) {
    const approver = await this.resolveApproverEmployee(currentUser);
    const actorId = this.getActorId(currentUser);
    const roleCodes = await this.resolveActorRoleCodes(actorId);
    const scopedApprover: ApproverEmployee = { ...approver, roleCodes };

    await this.ensureDocumentRequestInScope(id, scopedApprover, roleCodes);

    return this.documentWorkflowService.returnDocumentRequestForReview(
      id,
      dto,
      currentUser,
    );
  }

  /**
   * ดึงรายการใบลาตาม scope ของผู้อนุมัติ
   *
   * จุดสำคัญ:
   * - ไม่ดึงทุกใบลาในบริษัท
   * - ดึงเฉพาะใบลาที่มี approval step เกี่ยวข้องกับผู้ใช้ปัจจุบัน
   * - status=SUBMITTED จะดู step PENDING
   * - status=APPROVED/REJECTED จะดู step ที่ user นี้เคย action แล้ว
   */
  /**
   * ตัดคำขอของตัวเองออกจากคิว
   * -----------------------------------------------------------------------
   * ตัวกันอนุมัติงานตัวเอง (canActOnApprovalStep) บล็อกตอนกดอยู่แล้ว แต่ถ้ายัง
   * โผล่ในคิว ผู้ใช้จะเห็นปุ่มอนุมัติที่กดแล้วเด้ง error — และที่แย่กว่าคือเข้าใจว่า
   * ใบของตัวเองรอตัวเองอยู่ ทั้งที่จริงต้องรอคนอื่น
   *
   * กันสองทางให้ตรงกับ isOwnRequest: พนักงานเจ้าของคำขอ และคนที่กดยื่น
   * (หัวหน้ายื่นแทนลูกน้องก็อนุมัติเองไม่ได้)
   *
   * ฝ่ายบุคคลเป็นข้อยกเว้น — ตัวกันตอนกดปล่อยให้ HR อนุมัติของตัวเองได้แล้ว
   * ถ้าคิวยังซ่อนอยู่ HR จะไม่มีทางไปถึงปุ่มนั้นเลย ต้องเปิดให้ตรงกันทั้งสองชั้น
   */
  private excludeOwnRequestWhere(
    approver: ApproverEmployee,
    actorId: string,
  ): {
    NOT?: { employeeId: string };
    OR?: Array<{ submittedById: null } | { NOT: { submittedById: string } }>;
  } {
    if (canApproveOwnRequest(approver.roleCodes ?? [])) {
      return {};
    }

    return {
      NOT: { employeeId: approver.id },
      // submittedById เป็น null ได้ จึงต้องเขียนเป็น OR ไม่ใช่ not เฉย ๆ
      OR: [{ submittedById: null }, { NOT: { submittedById: actorId } }],
    };
  }

  private async findLeaveItems(
    approver: ApproverEmployee,
    actorId: string,
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q?: string,
  ): Promise<ApprovalItem[]> {
    const where: Prisma.LeaveRequestWhereInput = {
      deletedAt: null,
      ...this.excludeOwnRequestWhere(approver, actorId),
      // Tenant boundary: ผู้อนุมัติเห็นเฉพาะคำขอของพนักงานในบริษัทตน
      employee: { is: { companyId: approver.companyId } },
      ...(status === "RETURNED" ? { status: LeaveRequestStatus.DRAFT } : {}),
      approvalSteps: {
        some: buildLeaveApprovalStepScopeWhere(approver, status),
      },
      ...buildLeaveTextSearchWhere(q),
    };

    const items = await this.prisma.leaveRequest.findMany({
      where,
      include: {
        employee: employeeInclude(),
        leaveType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        approvalSteps: {
          orderBy: {
            stepNo: "asc",
          },
          include: approvalStepInclude(),
        },
        approvalLogs: {
          orderBy: { createdAt: "asc" },
          include: { approvedBy: approvalLogUserInclude() },
        },
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
      take: this.sourceFetchLimit,
    });

    return items.map((item) => mapLeaveApprovalItem(item, approver));
  }

  /** ดึงรายการ OT ตาม scope ของผู้อนุมัติ */
  private async findOvertimeItems(
    approver: ApproverEmployee,
    actorId: string,
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q?: string,
  ): Promise<ApprovalItem[]> {
    const where: Prisma.OvertimeRequestWhereInput = {
      deletedAt: null,
      ...this.excludeOwnRequestWhere(approver, actorId),
      // Tenant boundary: ผู้อนุมัติเห็นเฉพาะคำขอของพนักงานในบริษัทตน
      employee: { is: { companyId: approver.companyId } },
      ...(status === "RETURNED" ? { status: OvertimeRequestStatus.DRAFT } : {}),
      approvalSteps: {
        some: buildOvertimeApprovalStepScopeWhere(approver, status),
      },
      ...buildOvertimeTextSearchWhere(q),
    };

    const items = await this.prisma.overtimeRequest.findMany({
      where,
      include: {
        employee: employeeInclude(),
        approvalSteps: {
          orderBy: {
            stepNo: "asc",
          },
          include: approvalStepInclude(),
        },
        approvalLogs: {
          orderBy: { createdAt: "asc" },
          include: { approvedBy: approvalLogUserInclude() },
        },
        attachments: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
      take: this.sourceFetchLimit,
    });

    return items.map((item) => mapOvertimeApprovalItem(item, approver));
  }

  /** ดึงรายการคำขอแก้เวลาตาม scope ของผู้อนุมัติ */
  private async findTimeAdjustItems(
    approver: ApproverEmployee,
    actorId: string,
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q?: string,
  ): Promise<ApprovalItem[]> {
    const where: Prisma.TimeAdjustRequestWhereInput = {
      deletedAt: null,
      ...this.excludeOwnRequestWhere(approver, actorId),
      // Tenant boundary: ผู้อนุมัติเห็นเฉพาะคำขอของพนักงานในบริษัทตน
      employee: { is: { companyId: approver.companyId } },
      ...(status === "RETURNED" ? { status: TimeAdjustRequestStatus.DRAFT } : {}),
      approvalSteps: {
        some: buildTimeAdjustApprovalStepScopeWhere(approver, status),
      },
      ...buildTimeAdjustTextSearchWhere(q),
    };

    const items = await this.prisma.timeAdjustRequest.findMany({
      where,
      include: {
        employee: employeeInclude(),
        originalAttendanceLog: true,
        approvalSteps: {
          orderBy: {
            stepNo: "asc",
          },
          include: approvalStepInclude(),
        },
        logs: {
          orderBy: { createdAt: "asc" },
          include: { actedBy: approvalLogUserInclude() },
        },
        attachments: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
      take: this.sourceFetchLimit,
    });

    return items.map((item) => mapTimeAdjustApprovalItem(item, approver));
  }

  /**
   * ตรวจ read-scope สำหรับ Mobile detail/history โดยใช้ approval scope เดิมแบบ ALL
   * (pending + ประวัติที่ผู้ใช้เคย action) แยกจาก action guard ด้านล่างซึ่งยัง
   * บังคับ pending-only เหมือนเดิม
   */
  private async ensureLeaveRequestVisibleInScope(
    id: string,
    approver: ApproverEmployee,
    actorId: string,
  ) {
    const item = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.excludeOwnRequestWhere(approver, actorId),
        employee: { is: { companyId: approver.companyId } },
        approvalSteps: {
          some: buildLeaveApprovalStepScopeWhere(approver, 'ALL'),
        },
      },
      select: { id: true, status: true },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบใบลาในขอบเขตการอนุมัติของคุณ');
    }

    return item;
  }

  private async ensureOvertimeRequestVisibleInScope(
    id: string,
    approver: ApproverEmployee,
    actorId: string,
  ) {
    const item = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.excludeOwnRequestWhere(approver, actorId),
        employee: { is: { companyId: approver.companyId } },
        approvalSteps: {
          some: buildOvertimeApprovalStepScopeWhere(approver, 'ALL'),
        },
      },
      select: { id: true, status: true },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบคำขอ OT ในขอบเขตการอนุมัติของคุณ');
    }

    return item;
  }

  private async ensureTimeAdjustRequestVisibleInScope(
    id: string,
    approver: ApproverEmployee,
    actorId: string,
  ) {
    const item = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.excludeOwnRequestWhere(approver, actorId),
        employee: { is: { companyId: approver.companyId } },
        approvalSteps: {
          some: buildTimeAdjustApprovalStepScopeWhere(approver, 'ALL'),
        },
      },
      select: { id: true, status: true },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบคำขอแก้เวลาในขอบเขตการอนุมัติของคุณ');
    }

    return item;
  }

  private async ensureOffsiteRequestVisibleInScope(
    id: string,
    approver: ApproverEmployee,
    actorId: string,
    roleCodes: string[],
  ) {
    const prisma = this.prisma as any;
    const item = await prisma.offsiteWorkRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.excludeOwnRequestWhere(approver, actorId),
        companyId: approver.companyId,
      },
      select: {
        id: true,
        status: true,
        approvalSnapshot: true,
      },
    });

    if (
      !item ||
      !this.isOffsiteRequestVisibleForApprover(
        item,
        approver,
        roleCodes,
        'ALL',
      )
    ) {
      throw new NotFoundException(
        'ไม่พบคำขอทำงานนอกสถานที่ในขอบเขตการอนุมัติของคุณ',
      );
    }

    return item;
  }

  /**
   * ตรวจว่าใบลานี้กำลังรอ user ปัจจุบันอนุมัติอยู่จริง
   * ใช้ก่อนกด approve/reject เพื่อกัน user ไปยิง API ใส่รายการที่ไม่ใช่ของตัวเอง
   */
  private async ensureLeaveRequestInScope(
    id: string,
    approver: ApproverEmployee,
  ) {
    const item = await this.prisma.leaveRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        approvalSteps: {
          some: buildCurrentLeaveApprovalStepWhere(approver),
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!item) {
      throw new NotFoundException("ไม่พบใบลาที่รออนุมัติของคุณ");
    }

    if (item.status !== "SUBMITTED") {
      throw new BadRequestException(
        "อนุมัติได้เฉพาะรายการที่รออนุมัติเท่านั้น",
      );
    }

    return item;
  }

  /** ตรวจ scope ก่อนอนุมัติ/ไม่อนุมัติ OT */
  private async ensureOvertimeRequestInScope(
    id: string,
    approver: ApproverEmployee,
  ) {
    const item = await this.prisma.overtimeRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        approvalSteps: {
          some: buildCurrentOvertimeApprovalStepWhere(approver),
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!item) {
      throw new NotFoundException("ไม่พบคำขอ OT ที่รออนุมัติของคุณ");
    }

    if (item.status !== "SUBMITTED") {
      throw new BadRequestException(
        "อนุมัติได้เฉพาะรายการที่รออนุมัติเท่านั้น",
      );
    }

    return item;
  }

  /** ตรวจ scope ก่อนอนุมัติ/ไม่อนุมัติคำขอแก้เวลา */
  private async ensureTimeAdjustRequestInScope(
    id: string,
    approver: ApproverEmployee,
  ) {
    const item = await this.prisma.timeAdjustRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        approvalSteps: {
          some: buildCurrentTimeAdjustApprovalStepWhere(approver),
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!item) {
      throw new NotFoundException("ไม่พบคำขอแก้เวลาที่รออนุมัติของคุณ");
    }

    if (item.status !== "SUBMITTED") {
      throw new BadRequestException(
        "อนุมัติได้เฉพาะรายการที่รออนุมัติเท่านั้น",
      );
    }

    return item;
  }

  /** ดึงรายการ Offsite Work ตาม scope ของผู้อนุมัติ */
  private async findOffsiteItems(
    approver: ApproverEmployee,
    actorId: string,
    roleCodes: string[],
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q?: string,
  ): Promise<ApprovalItem[]> {
    const prisma = this.prisma as any;
    const items = await prisma.offsiteWorkRequest.findMany({
      where: {
        deletedAt: null,
        ...this.excludeOwnRequestWhere(approver, actorId),
        // Tenant boundary: OffsiteWorkRequest มี companyId ตรง
        companyId: approver.companyId,
        status: {
          in: [
            OffsiteRequestStatus.DRAFT,
            OffsiteRequestStatus.SUBMITTED,
            OffsiteRequestStatus.MANAGER_APPROVED,
            OffsiteRequestStatus.HR_APPROVED,
            OffsiteRequestStatus.MANAGER_REJECTED,
            OffsiteRequestStatus.HR_REJECTED,
            OffsiteRequestStatus.APPROVED,
            OffsiteRequestStatus.REJECTED,
          ],
        },
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: this.sourceFetchLimit,
    });

    const employeeMap = await this.loadEmployeeMap(
      items.map((item: any) => item.employeeId).filter(Boolean),
    );
    const snapshotRefs = await this.loadSnapshotStepRefs(items);

    return items
      .filter((item: any) =>
        this.isOffsiteRequestVisibleForApprover(
          item,
          approver,
          roleCodes,
          status,
        ),
      )
      .filter((item: any) =>
        this.matchesTextSearch(q, [
          item.requestNo,
          item.locationName,
          item.address,
          item.reason,
          this.employeeText(employeeMap.get(item.employeeId)),
        ]),
      )
      .map((item: any) =>
        this.mapOffsiteApprovalItem(
          item,
          employeeMap.get(item.employeeId) ?? null,
          approver,
          snapshotRefs,
        ),
      );
  }

  /** ดึงรายการคำขอเอกสารตาม scope ของผู้อนุมัติ */
  private async findDocumentItems(
    approver: ApproverEmployee,
    actorId: string,
    roleCodes: string[],
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
    q?: string,
  ): Promise<ApprovalItem[]> {
    const items = await this.prisma.documentRequest.findMany({
      where: {
        deletedAt: null,
        ...this.excludeOwnRequestWhere(approver, actorId),
        // Tenant boundary: DocumentRequest มี companyId ตรง
        companyId: approver.companyId,
        status: {
          in: [
            DocumentRequestStatus.DRAFT,
            DocumentRequestStatus.SUBMITTED,
            DocumentRequestStatus.APPROVED,
            DocumentRequestStatus.REJECTED,
          ],
        },
      },
      include: {
        employee: {
          select: {
            ...(employeeInclude() as any).select,
            supervisorId: true,
          },
        },
        documentType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            requiresApproval: true,
            approvalLevels: true,
          },
        },
        approvals: {
          orderBy: [{ level: "asc" }, { createdAt: "asc" }],
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
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: this.sourceFetchLimit,
    });

    return items
      .filter((item: any) =>
        this.isDocumentRequestVisibleForApprover(
          item,
          approver,
          roleCodes,
          status,
        ),
      )
      .filter((item: any) =>
        this.matchesTextSearch(q, [
          item.requestNo,
          item.title,
          item.purpose,
          item.note,
          item.documentType?.code,
          item.documentType?.nameTh,
          this.employeeText(item.employee),
        ]),
      )
      .map((item: any) =>
        this.mapDocumentApprovalItem(item, approver, roleCodes),
      );
  }

  private async ensureOffsiteRequestInScope(
    id: string,
    approver: ApproverEmployee,
    roleCodes: string[],
  ) {
    const prisma = this.prisma as any;
    const item = await prisma.offsiteWorkRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        approvalSnapshot: true,
      },
    });

    if (!item) {
      throw new NotFoundException("ไม่พบคำขอทำงานนอกสถานที่ที่รออนุมัติของคุณ");
    }

    if (
      !this.isOffsiteRequestVisibleForApprover(
        item,
        approver,
        roleCodes,
        "SUBMITTED",
      )
    ) {
      throw new NotFoundException("ไม่พบคำขอทำงานนอกสถานที่ที่รออนุมัติของคุณ");
    }

    return item;
  }

  private async ensureDocumentRequestInScope(
    id: string,
    approver: ApproverEmployee,
    roleCodes: string[],
  ) {
    const item = await this.prisma.documentRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
            supervisorId: true,
          },
        },
        documentType: {
          select: {
            id: true,
            approvalLevels: true,
          },
        },
        approvals: true,
      },
    });

    if (!item) {
      throw new NotFoundException("ไม่พบคำขอเอกสารที่รออนุมัติของคุณ");
    }

    if (
      !this.isDocumentRequestVisibleForApprover(
        item,
        approver,
        roleCodes,
        "SUBMITTED",
      )
    ) {
      throw new NotFoundException("ไม่พบคำขอเอกสารที่รออนุมัติของคุณ");
    }

    return item;
  }

  private isOffsiteRequestVisibleForApprover(
    item: any,
    approver: ApproverEmployee,
    roleCodes: string[],
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
  ) {
    const steps = this.getOffsiteSnapshotSteps(item.approvalSnapshot);
    if (!steps.length) return false;

    const isCurrent = () => {
      const pending = steps.find((step) => step.status === "PENDING");
      return pending
        ? this.canActOffsiteStep(pending, approver, roleCodes)
        : false;
    };

    const wasApproved = () =>
      steps.some(
        (step) =>
          step.status === "APPROVED" && step.actedById === approver.userId,
      );
    const wasRejected = () =>
      steps.some(
        (step) =>
          step.status === "REJECTED" && step.actedById === approver.userId,
      );
    const wasReturned = () =>
      item.status === OffsiteRequestStatus.DRAFT &&
      steps.some(
        (step) =>
          step.status === "CANCELLED" && step.actedById === approver.userId,
      );

    if (status === "SUBMITTED") return isCurrent();
    if (status === "APPROVED") return wasApproved();
    if (status === "REJECTED") return wasRejected();
    if (status === "RETURNED") return wasReturned();
    return isCurrent() || wasApproved() || wasRejected() || wasReturned();
  }

  private isDocumentRequestVisibleForApprover(
    item: any,
    approver: ApproverEmployee,
    roleCodes: string[],
    status: NonNullable<ListApprovalRequestsQueryDto["status"]>,
  ) {
    const wasApproved = () =>
      (item.approvals ?? []).some(
        (approval: any) =>
          String(approval.action).includes("APPROVE") &&
          approval.actedById === approver.userId,
      );
    const wasRejected = () =>
      (item.approvals ?? []).some(
        (approval: any) =>
          String(approval.action) === "REJECT" &&
          approval.actedById === approver.userId,
      );
    const isCurrent = () =>
      item.status === DocumentRequestStatus.SUBMITTED &&
      this.canActDocumentRequest(item, approver, roleCodes);
    const wasReturned = () =>
      item.status === DocumentRequestStatus.DRAFT &&
      (item.approvals ?? []).some(
        (approval: any) =>
          String(approval.action) === "CANCEL" &&
          approval.oldStatus === DocumentRequestStatus.SUBMITTED &&
          approval.newStatus === DocumentRequestStatus.DRAFT &&
          approval.actedById === approver.userId,
      );

    if (status === "SUBMITTED") return isCurrent();
    if (status === "APPROVED") return wasApproved();
    if (status === "REJECTED") return wasRejected();
    if (status === "RETURNED") return wasReturned();
    return isCurrent() || wasApproved() || wasRejected() || wasReturned();
  }

  private canActDocumentRequest(
    item: any,
    approver: ApproverEmployee,
    roleCodes: string[],
  ) {
    const currentLevel = Number(item.currentLevel || 1);

    if (currentLevel <= 1) {
      return (
        item.employee?.supervisorId === approver.id ||
        this.hasAdminRole(roleCodes)
      );
    }

    return this.hasHrRole(roleCodes);
  }

  private mapOffsiteApprovalItem(
    item: any,
    employee: ApprovalItem["employee"],
    approver: ApproverEmployee,
    snapshotRefs?: { employeeMap: Map<string, any>; userMap: Map<string, any> },
  ): ApprovalItem {
    const steps = this.getOffsiteSnapshotSteps(item.approvalSnapshot);
    const scopedStep = this.pickScopedSnapshotStep(steps, approver);
    const displayStatus = this.getSnapshotDisplayStatus(
      item.status,
      scopedStep,
    );

    return {
      id: item.id,
      type: "OFFSITE" as ApprovalItem["type"],
      requestNo: item.requestNo ?? null,
      title: "คำขอทำงานนอกสถานที่",
      reason: item.reason ?? null,
      status: displayStatus,
      requestStatus: item.status,
      submittedAt: item.submittedAt ?? null,
      createdAt: item.createdAt,
      employee,
      approvalSteps: steps.map((step: any, index: number) => ({
        id: `offsite-${item.id}-${index + 1}`,
        stepNo: Number(step.stepNo || index + 1),
        nameTh: step.nameTh ?? `ขั้นที่ ${index + 1}`,
        description: step.description ?? null,
        approverType: step.approverType ?? "",
        expectedApproverId: step.expectedApproverId ?? null,
        expectedEmployeeId: step.expectedEmployeeId ?? null,
        positionId: step.positionId ?? null,
        roleCode: step.roleCode ?? null,
        status: step.status ?? "WAITING",
        actedAt: step.actedAt ? new Date(step.actedAt) : null,
        approvedAt:
          step.status === "APPROVED" && step.actedAt
            ? new Date(step.actedAt)
            : null,
        rejectedAt:
          step.status === "REJECTED" && step.actedAt
            ? new Date(step.actedAt)
            : null,
        reason: step.reason ?? null,
        note: step.note ?? null,
        expectedApprover: step.expectedApprover ?? (step.expectedApproverId ? snapshotRefs?.userMap.get(step.expectedApproverId) ?? null : null),
        expectedEmployee: step.expectedEmployee ?? (step.expectedEmployeeId ? snapshotRefs?.employeeMap.get(step.expectedEmployeeId) ?? null : null),
        position: null,
        actedBy: step.actedBy ?? (step.actedById ? snapshotRefs?.userMap.get(step.actedById) ?? null : null),
      })),
      detail: {
        workDate: item.workDate,
        startTime: item.startTime,
        endTime: item.endTime,
        locationType: item.locationType,
        locationName: item.locationName,
        address: item.address,
        radiusMeters: item.radiusMeters,
        attachmentUrl: item.attachmentUrl,
        requestStatus: item.status,
        currentApprovalStep: scopedStep ?? null,
      },
    };
  }

  private mapDocumentApprovalItem(
    item: any,
    approver: ApproverEmployee,
    roleCodes: string[],
  ): ApprovalItem {
    const steps = this.buildDocumentSteps(item, approver, roleCodes);
    const scopedStep = this.pickScopedSnapshotStep(steps, approver);
    const displayStatus = this.getSnapshotDisplayStatus(
      item.status,
      scopedStep,
    );

    return {
      id: item.id,
      type: "DOCUMENT" as ApprovalItem["type"],
      requestNo: item.requestNo ?? null,
      title: item.documentType?.nameTh ?? item.title ?? "คำขอเอกสาร",
      reason: item.purpose ?? item.note ?? null,
      status: displayStatus,
      requestStatus: item.status,
      submittedAt: item.submittedAt ?? null,
      createdAt: item.createdAt,
      employee: item.employee ?? null,
      approvalSteps: steps.map((step: any, index: number) => ({
        id: `document-${item.id}-${index + 1}`,
        stepNo: Number(step.stepNo || index + 1),
        nameTh: step.nameTh,
        description: step.description ?? null,
        approverType: step.approverType,
        expectedApproverId: step.expectedApproverId ?? null,
        expectedEmployeeId: step.expectedEmployeeId ?? null,
        positionId: null,
        roleCode: step.roleCode ?? null,
        status: step.status,
        actedAt: step.actedAt ?? null,
        approvedAt: step.status === "APPROVED" ? (step.actedAt ?? null) : null,
        rejectedAt: step.status === "REJECTED" ? (step.actedAt ?? null) : null,
        reason: step.reason ?? null,
        note: step.note ?? null,
        expectedApprover: null,
        expectedEmployee: null,
        position: null,
        actedBy: step.actedBy ?? null,
      })),
      approvalLogs: (item.approvals ?? []).map((approval: any) => ({
        id: approval.id,
        action: String(approval.action ?? ""),
        oldStatus: approval.oldStatus ?? null,
        newStatus: approval.newStatus ?? null,
        reason: approval.reason ?? null,
        note: approval.note ?? null,
        createdAt: approval.createdAt ?? approval.actedAt,
        actedBy: approval.actedBy ?? null,
        approvedBy: approval.actedBy ?? null,
      })),
      detail: {
        documentType: item.documentType,
        documentTypeName: item.documentType?.nameTh,
        title: item.title,
        purpose: item.purpose,
        note: item.note,
        currentLevel: item.currentLevel,
        approvalLevels: item.documentType?.approvalLevels,
        requestStatus: item.status,
        currentApprovalStep: scopedStep ?? null,
      },
    };
  }

  private buildDocumentSteps(
    item: any,
    approver: ApproverEmployee,
    roleCodes: string[],
  ) {
    const approvals = item.approvals ?? [];
    const level1Action = [...approvals]
      .reverse()
      .find(
        (approval: any) => approval.level === 1 && approval.action !== "SUBMIT",
      );
    const level2Action = [...approvals]
      .reverse()
      .find(
        (approval: any) => approval.level === 2 && approval.action !== "SUBMIT",
      );
    const levels = Math.min(
      Math.max(item.documentType?.approvalLevels || 1, 1),
      2,
    );

    const step1Status = level1Action
      ? String(level1Action.action) === "CANCEL"
        ? "CANCELLED"
        : String(level1Action.action).includes("REJECT")
          ? "REJECTED"
          : "APPROVED"
      : item.status === DocumentRequestStatus.SUBMITTED &&
          Number(item.currentLevel || 1) === 1
        ? "PENDING"
        : item.status === DocumentRequestStatus.APPROVED
          ? "APPROVED"
          : "WAITING";

    const steps: any[] = [
      {
        stepNo: 1,
        nameTh: "หัวหน้าโดยตรง",
        approverType: "SUPERVISOR",
        expectedEmployeeId: item.employee?.supervisorId ?? null,
        expectedApproverId: null,
        status: step1Status,
        actedAt: level1Action?.actedAt ?? null,
        actedById: level1Action?.actedById ?? null,
        actedBy: level1Action?.actedBy ?? null,
        reason: level1Action?.reason ?? null,
        note: level1Action?.note ?? null,
      },
    ];

    if (levels >= 2) {
      const step2Status = level2Action
        ? String(level2Action.action) === "CANCEL"
          ? "CANCELLED"
          : String(level2Action.action).includes("REJECT")
            ? "REJECTED"
            : "APPROVED"
        : item.status === DocumentRequestStatus.SUBMITTED &&
            Number(item.currentLevel || 1) >= 2
          ? "PENDING"
          : item.status === DocumentRequestStatus.APPROVED
            ? "APPROVED"
            : "WAITING";

      steps.push({
        stepNo: 2,
        nameTh: "HR ตรวจสอบ",
        approverType: "HR_ADMIN",
        expectedEmployeeId: null,
        expectedApproverId: null,
        roleCode: "HR_ADMIN",
        status: step2Status,
        actedAt: level2Action?.actedAt ?? null,
        actedById: level2Action?.actedById ?? null,
        actedBy: level2Action?.actedBy ?? null,
        reason: level2Action?.reason ?? null,
        note: level2Action?.note ?? null,
      });
    }

    return steps;
  }

  private getOffsiteSnapshotSteps(snapshot: unknown): any[] {
    const value = snapshot as { steps?: any[] } | null;
    return Array.isArray(value?.steps) ? value.steps : [];
  }

  private canActOffsiteStep(
    step: any,
    approver: ApproverEmployee,
    roleCodes: string[],
  ) {
    const normalizedRoles = roleCodes.map((code) => code.toUpperCase());

    if (step.expectedEmployeeId === approver.id) return true;
    if (approver.userId && step.expectedApproverId === approver.userId) return true;
    if (approver.positionId && step.positionId === approver.positionId) return true;
    if (step.roleCode && normalizedRoles.includes(String(step.roleCode).toUpperCase())) return true;
    if (this.isHrStep(step) && this.hasHrRole(normalizedRoles)) return true;
    if (String(step.approverType).toUpperCase() === "EXECUTIVE" && this.hasExecutiveRole(normalizedRoles)) return true;
    if (this.hasAdminRole(normalizedRoles) && ["HR_ADMIN", "EXECUTIVE"].includes(String(step.approverType).toUpperCase())) return true;

    return false;
  }

  private pickScopedSnapshotStep(steps: any[], approver: ApproverEmployee) {
    const roleCodes = approver.roleCodes ?? [];
    const isExpected = (step: any) => this.canActOffsiteStep(step, approver, roleCodes);
    const isActed = (step: any) =>
      !!approver.userId && step.actedById === approver.userId;

    return (
      steps.find((step) => step.status === "PENDING" && isExpected(step)) ??
      steps.find((step) => step.status === "REJECTED" && isActed(step)) ??
      steps.find((step) => step.status === "APPROVED" && isActed(step)) ??
      steps.find((step) => step.status === "CANCELLED" && isActed(step)) ??
      steps.find((step) => step.status === "PENDING") ??
      null
    );
  }

  private getSnapshotDisplayStatus(
    requestStatus: string,
    scopedStep: any | null,
  ) {
    if (scopedStep?.status === "PENDING") return "SUBMITTED" as const;
    if (scopedStep?.status === "APPROVED") return "APPROVED" as const;
    if (scopedStep?.status === "REJECTED") return "REJECTED" as const;
    if (requestStatus === "DRAFT" && scopedStep?.status === "CANCELLED") {
      return "RETURNED" as const;
    }

    if (
      [
        OffsiteRequestStatus.HR_APPROVED,
        OffsiteRequestStatus.APPROVED,
        DocumentRequestStatus.APPROVED,
      ].includes(requestStatus as any)
    ) {
      return "APPROVED" as const;
    }

    if (
      [
        OffsiteRequestStatus.MANAGER_REJECTED,
        OffsiteRequestStatus.HR_REJECTED,
        OffsiteRequestStatus.REJECTED,
        DocumentRequestStatus.REJECTED,
      ].includes(requestStatus as any)
    ) {
      return "REJECTED" as const;
    }

    return "SUBMITTED" as const;
  }

  private isHrStep(step: any) {
    const markers = [step.approverType, step.roleCode, step.nameTh]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase());
    return markers.some((value) => value.includes("HR"));
  }

  private async loadSnapshotStepRefs(items: any[]): Promise<{ employeeMap: Map<string, any>; userMap: Map<string, any> }> {
    const employeeIds = new Set<string>();
    const userIds = new Set<string>();

    for (const item of items) {
      for (const step of this.getOffsiteSnapshotSteps(item.approvalSnapshot)) {
        if (step.expectedEmployeeId) employeeIds.add(step.expectedEmployeeId);
        if (step.expectedApproverId) userIds.add(step.expectedApproverId);
        if (step.actedById) userIds.add(step.actedById);
      }
    }

    const [employees, users] = await Promise.all([
      employeeIds.size
        ? this.prisma.employee.findMany({
            where: { id: { in: Array.from(employeeIds) }, deletedAt: null },
            select: (employeeInclude() as any).select,
          })
        : Promise.resolve([]),
      userIds.size
        ? this.prisma.user.findMany({
            where: { id: { in: Array.from(userIds) }, deletedAt: null },
            select: { id: true, email: true, displayName: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      employeeMap: new Map<string, any>(
        employees.map((employee: any): [string, any] => [employee.id, employee]),
      ),
      userMap: new Map<string, any>(
        users.map((user: any): [string, any] => [user.id, user]),
      ),
    };
  }

  private async loadEmployeeMap(
    employeeIds: string[],
  ): Promise<Map<string, ApprovalItem["employee"]>> {
    const ids = Array.from(new Set(employeeIds));
    if (!ids.length) return new Map<string, ApprovalItem["employee"]>();

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: ids } },
      select: (employeeInclude() as any).select,
    });

    return new Map<string, ApprovalItem["employee"]>(
      employees.map((employee: any) => [
        employee.id,
        employee as ApprovalItem["employee"],
      ]),
    );
  }

  private employeeText(employee?: ApprovalItem["employee"] | null) {
    if (!employee) return "";
    return [
      employee.employeeCode,
      employee.firstName,
      employee.lastName,
      employee.displayName,
      employee.position,
      employee.company?.nameTh,
      employee.branch?.nameTh,
      employee.department?.nameTh,
      employee.division?.nameTh,
      employee.employeeType?.nameTh,
      employee.positionMaster?.nameTh,
    ]
      .filter(Boolean)
      .join(" ");
  }

  private matchesTextSearch(q: string | undefined, values: unknown[]) {
    const search = q?.trim().toLowerCase();
    if (!search) return true;
    return values
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLowerCase().includes(search));
  }

  private async resolveActorRoleCodes(actorId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    return (user?.roles ?? [])
      .map((row) => row.role.code)
      .filter(Boolean)
      .map((code) => code.toUpperCase());
  }

  private hasHrRole(roleCodes: string[]) {
    return roleCodes.some((code) =>
      ["HR_ADMIN", "HR_MANAGER", "HR", "SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(code),
    );
  }

  private hasExecutiveRole(roleCodes: string[]) {
    return roleCodes.some((code) =>
      ["EXECUTIVE", "CEO", "DIRECTOR", "SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(code),
    );
  }

  private hasAdminRole(roleCodes: string[]) {
    return roleCodes.some((code) =>
      ["SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(code),
    );
  }

  /**
   * แปลง current user จากระบบ auth ให้เป็น employee ผู้อนุมัติ
   *
   * เหตุผลที่ต้อง resolve เป็น employee:
   * - approval step อาจระบุ expectedEmployeeId
   * - หรืออาจระบุ expectedApproverId เป็น userId
   * จึงต้องมีทั้ง employee.id และ employee.userId เพื่อเช็ก scope ได้ครบ
   */
  private async resolveApproverEmployee(currentUser: CurrentUserLike) {
    const actorId = this.getActorId(currentUser);

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
        status: {
          notIn: ["RESIGNED", "TERMINATED", "INACTIVE"],
        },
      },
      select: {
        id: true,
        userId: true,
        companyId: true,
        branchId: true,
        departmentId: true,
        divisionId: true,
        positionId: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(
        "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถใช้งาน Approval Center ได้",
      );
    }

    return employee;
  }

  /** ดึง user id จาก currentUser ให้รองรับทั้ง key id และ userId */
  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException("ไม่พบข้อมูลผู้ใช้งานปัจจุบัน");
    }

    return actorId;
  }
}
