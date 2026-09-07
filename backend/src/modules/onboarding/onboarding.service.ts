import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  EmployeeStatus,
  EvaluationResultStatus,
  MasterStatus,
  OnboardingDocumentStatus,
  OnboardingTaskStatus,
  Prisma,
  ProbationStatus,
} from "../../generated/prisma/client";
import { calculateEvaluationScore } from "../performance/evaluation-score.util";
import { PrismaService } from "../../database/prisma.service";

import { CreateOnboardingChecklistDto } from "./dto/create-onboarding-checklist.dto";
import { UpdateOnboardingChecklistDto } from "./dto/update-onboarding-checklist.dto";
import { ListOnboardingChecklistsQueryDto } from "./dto/list-onboarding-checklists-query.dto";
import { CreateOnboardingTaskDto } from "./dto/create-onboarding-task.dto";
import { ApplyOnboardingChecklistDto } from "./dto/apply-onboarding-checklist.dto";
import { UpdateOnboardingTaskDto } from "./dto/update-onboarding-task.dto";
import { ListOnboardingTasksQueryDto } from "./dto/list-onboarding-tasks-query.dto";
import { ListOnboardingProgressQueryDto } from "./dto/list-onboarding-progress-query.dto";
import { OnboardingTaskActionDto } from "./dto/onboarding-task-action.dto";
import { CreateOnboardingDocumentDto } from "./dto/create-onboarding-document.dto";
import { ListOnboardingDocumentsQueryDto } from "./dto/list-onboarding-documents-query.dto";
import { OnboardingDocumentActionDto } from "./dto/onboarding-document-action.dto";
import { CreateProbationRecordDto } from "./dto/create-probation-record.dto";
import { copyFile } from "fs/promises";
import { extname } from "path";
import { randomUUID } from "crypto";

import {
  ONBOARDING_FILE_BUCKET,
  ONBOARDING_FILE_STORAGE_PROVIDER,
  createOnboardingFileStorageKey,
  resolveOnboardingFilePath,
} from "./onboarding-file-storage.util";
import {
  createEmployeeDocumentStorageKey,
  ensureEmployeeDocumentStorageDir,
  getEmployeeDocumentAbsolutePath,
} from "../employees/employee-document-storage.util";
import { EmployeeDocumentType } from "../../generated/prisma/client";
import { ListProbationRecordsQueryDto } from "./dto/list-probation-records-query.dto";
import { ProbationActionDto } from "./dto/probation-action.dto";
import { SaveProbationEvaluationDto } from "./dto/save-probation-evaluation.dto";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from "../../common/tenant/tenant-scope.util";

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * บริษัทปลายทางสำหรับ "สร้าง" master ของ onboarding
   * - GLOBAL: ใช้ค่าจาก dto (รวม null = shared)
   * - COMPANY/BRANCH: ล็อกเป็นบริษัทของผู้ใช้เสมอ
   */
  private resolveOnbCompanyId(
    scope: TenantScope,
    requested?: string | null,
  ): string | null {
    if (scope.level === "GLOBAL") {
      return requested ?? null;
    }
    return scope.companyId ?? null;
  }

  /**
   * ตรวจสิทธิ์จัดการ master onboarding ตาม scope
   * - GLOBAL: ผ่านทุกกรณี
   * - COMPANY/BRANCH: จัดการได้เฉพาะของบริษัทตน (บล็อก shared/null และบริษัทอื่น)
   */
  private assertOnbManageScope(scope: TenantScope, companyId: string | null) {
    if (scope.level === "GLOBAL") {
      return;
    }
    if (!companyId || companyId !== scope.companyId) {
      throw new ForbiddenException("ไม่มีสิทธิ์จัดการข้อมูลของบริษัทนี้");
    }
  }

  async findChecklists(
    query: ListOnboardingChecklistsQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Prisma.OnboardingChecklistWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: "insensitive" } },
              { name: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      this.prisma.onboardingChecklist.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: this.checklistInclude(),
      }),
      this.prisma.onboardingChecklist.count({ where }),
      this.buildChecklistSummary(where),
    ]);

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
    };
  }

  async findChecklist(id: string) {
    const item = await this.prisma.onboardingChecklist.findFirst({
      where: { id, deletedAt: null },
      include: this.checklistInclude(),
    });

    if (!item) {
      throw new NotFoundException("ไม่พบ Checklist");
    }

    return item;
  }

  async createChecklist(
    dto: CreateOnboardingChecklistDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.resolveOnbCompanyId(scope, dto.companyId);
    await this.validateCompany(companyId);
    await this.ensureChecklistCodeAvailable(dto.code, companyId);

    const created = await this.prisma.onboardingChecklist.create({
      data: {
        companyId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        description: this.optionalTrim(dto.description),
        status: dto.status ?? MasterStatus.ACTIVE,
        createdById: currentUserId ?? null,
        items: {
          create: dto.items.map((item, index) => ({
            title: item.title.trim(),
            description: this.optionalTrim(item.description),
            category: this.optionalTrim(item.category),
            sortOrder: item.sortOrder ?? index + 1,
            isRequired: item.isRequired ?? true,
          })),
        },
      },
    });

    return this.findChecklist(created.id);
  }

  async updateChecklist(
    id: string,
    dto: UpdateOnboardingChecklistDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.onboardingChecklist.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        companyId: true,
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบ Checklist");
    }

    this.assertOnbManageScope(scope, current.companyId);

    // non-GLOBAL แก้บริษัทข้ามไม่ได้
    const nextCompanyId =
      scope.level === "GLOBAL"
        ? (dto.companyId ?? current.companyId)
        : current.companyId;

    if (dto.companyId !== undefined && scope.level === "GLOBAL") {
      await this.validateCompany(dto.companyId);
    }

    if (dto.code !== undefined && dto.code.trim() !== current.code) {
      await this.ensureChecklistCodeAvailable(dto.code, nextCompanyId, id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingChecklist.update({
        where: { id },
        data: {
          ...(dto.companyId !== undefined && scope.level === "GLOBAL"
            ? { companyId: dto.companyId || null }
            : {}),
          ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: this.optionalTrim(dto.description) }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(currentUserId ? { createdById: currentUserId } : {}),
        },
      });

      if (dto.items) {
        await tx.onboardingChecklistItem.deleteMany({
          where: { checklistId: id },
        });

        await tx.onboardingChecklistItem.createMany({
          data: dto.items.map((item, index) => ({
            checklistId: id,
            title: item.title.trim(),
            description: this.optionalTrim(item.description),
            category: this.optionalTrim(item.category),
            sortOrder: item.sortOrder ?? index + 1,
            isRequired: item.isRequired ?? true,
          })),
        });
      }
    });

    return this.findChecklist(id);
  }

  async removeChecklist(id: string, scope: TenantScope) {
    const current = await this.prisma.onboardingChecklist.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, companyId: true },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบ Checklist");
    }

    this.assertOnbManageScope(scope, current.companyId);

    await this.prisma.onboardingChecklist.update({
      where: { id },
      data: {
        status: MasterStatus.INACTIVE,
        deletedAt: new Date(),
      },
    });

    return {
      id,
      deleted: true,
    };
  }

  /* =========================================================
   ONBOARDING PROGRESS — ความคืบหน้าพนักงานใหม่รายคน
   ---------------------------------------------------------
   ทุกหน้าจอเดิมมองข้อมูลเป็น "กองงาน" กองเอกสาร กองทดลองงาน แยกกันคนละแท็บ
   HR ที่อยากรู้ว่า "คนนี้ไปถึงไหนแล้ว" ต้องเปิดสามแท็บแล้วจำเอาเอง

   ตัวนี้กลับด้าน — หนึ่งแถวคือพนักงานใหม่หนึ่งคน พร้อมบอกว่าตอนนี้ค้างอยู่ขั้นไหน
   ลำดับขั้นตายตัว: งานต้อนรับ → เอกสาร → ทดลองงาน → จบ
========================================================= */

  /** ขั้นที่พนักงานคนนี้ค้างอยู่ — ขั้นแรกที่ยังไม่ครบคือขั้นปัจจุบัน */
  private resolveOnboardingStage(params: {
    taskTotal: number;
    taskDone: number;
    documentTotal: number;
    documentDone: number;
    probationStatus?: ProbationStatus | null;
  }): { stage: 'TASKS' | 'DOCUMENTS' | 'PROBATION' | 'DONE'; stageNo: number } {
    if (params.taskTotal > 0 && params.taskDone < params.taskTotal) {
      return { stage: 'TASKS', stageNo: 1 };
    }

    if (params.documentTotal > 0 && params.documentDone < params.documentTotal) {
      return { stage: 'DOCUMENTS', stageNo: 2 };
    }

    if (
      params.probationStatus &&
      params.probationStatus !== ProbationStatus.PASSED &&
      params.probationStatus !== ProbationStatus.FAILED
    ) {
      return { stage: 'PROBATION', stageNo: 3 };
    }

    return { stage: 'DONE', stageNo: 4 };
  }

  /**
   * กางเช็กลิสต์ทั้งชุดเป็นงานต้อนรับให้พนักงานคนหนึ่งในครั้งเดียว
   * เดิมต้องสร้างงานทีละรายการ เช็กลิสต์สิบข้อ = กดสิบครั้ง
   *
   * ข้ามข้อที่คนนี้มีอยู่แล้ว เพื่อให้กางซ้ำได้โดยไม่เกิดงานซ้ำ
   */
  async applyChecklist(
    checklistId: string,
    dto: ApplyOnboardingChecklistDto,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    const checklist = await this.prisma.onboardingChecklist.findFirst({
      where: { id: checklistId, deletedAt: null },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!checklist) {
      throw new NotFoundException("ไม่พบ Checklist");
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, deletedAt: null },
      select: { id: true, companyId: true },
    });

    if (!employee) {
      throw new NotFoundException("ไม่พบพนักงาน");
    }

    this.assertOnbManageScope(scope, employee.companyId);

    if (checklist.items.length === 0) {
      throw new BadRequestException("เช็กลิสต์นี้ยังไม่มีรายการย่อย");
    }

    const existing = await this.prisma.onboardingTask.findMany({
      where: { employeeId: employee.id, deletedAt: null },
      select: { checklistItemId: true, title: true },
    });

    const existingItemIds = new Set(
      existing.map((task) => task.checklistItemId).filter(Boolean),
    );
    const existingTitles = new Set(existing.map((task) => task.title));

    const pending = checklist.items.filter(
      (item) =>
        !existingItemIds.has(item.id) && !existingTitles.has(item.title),
    );

    if (pending.length === 0) {
      return { created: 0, skipped: checklist.items.length };
    }

    await this.prisma.onboardingTask.createMany({
      data: pending.map((item) => ({
        companyId: employee.companyId,
        employeeId: employee.id,
        checklistId: checklist.id,
        checklistItemId: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        createdById: currentUserId ?? null,
      })),
    });

    return {
      created: pending.length,
      skipped: checklist.items.length - pending.length,
    };
  }

  async findProgress(
    query: ListOnboardingProgressQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);

    const employeeWhere: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.q
        ? {
            OR: [
              { employeeCode: { contains: query.q, mode: 'insensitive' } },
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { displayName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      // นับเฉพาะคนที่อยู่ในกระบวนการจริง — มีงาน เอกสาร หรือใบทดลองงานอย่างน้อยหนึ่งอย่าง
      OR: [
        { onboardingTasks: { some: { deletedAt: null } } },
        { onboardingDocuments: { some: { deletedAt: null } } },
        { probationRecords: { some: { deletedAt: null } } },
      ],
    };

    const employees = await this.prisma.employee.findMany({
      where: employeeWhere,
      orderBy: [{ startDate: 'desc' }],
      select: {
        id: true,
        employeeCode: true,
        title: true,
        firstName: true,
        lastName: true,
        displayName: true,
        position: true,
        startDate: true,
        status: true,
        company: { select: { id: true, nameTh: true } },
        branch: { select: { id: true, nameTh: true } },
        department: { select: { id: true, nameTh: true } },
        onboardingTasks: {
          where: { deletedAt: null },
          select: { id: true, status: true, dueDate: true },
        },
        onboardingDocuments: {
          where: { deletedAt: null },
          select: { id: true, status: true, isRequired: true },
        },
        probationRecords: {
          where: { deletedAt: null },
          orderBy: { startDate: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            reviewDate: true,
            result: true,
          },
        },
      },
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const rows = employees.map((employee) => {
      const tasks = employee.onboardingTasks;
      const taskTotal = tasks.length;
      const taskDone = tasks.filter(
        (item) => item.status === OnboardingTaskStatus.COMPLETED,
      ).length;
      const taskOverdue = tasks.filter(
        (item) =>
          item.status !== OnboardingTaskStatus.COMPLETED &&
          item.status !== OnboardingTaskStatus.CANCELLED &&
          item.dueDate &&
          item.dueDate.getTime() < now,
      ).length;

      const documents = employee.onboardingDocuments;
      const documentTotal = documents.length;
      // ยกเว้นให้แล้ว (WAIVED) นับว่าจบเหมือนกัน ไม่งั้นจะค้างขั้นนี้ตลอดไป
      const documentDone = documents.filter(
        (item) =>
          item.status === OnboardingDocumentStatus.VERIFIED ||
          item.status === OnboardingDocumentStatus.WAIVED,
      ).length;
      const documentWaiting = documents.filter(
        (item) => item.status === OnboardingDocumentStatus.SUBMITTED,
      ).length;

      const probation = employee.probationRecords[0] ?? null;
      const probationDaysLeft = probation
        ? Math.ceil((probation.endDate.getTime() - now) / dayMs)
        : null;

      const { stage, stageNo } = this.resolveOnboardingStage({
        taskTotal,
        taskDone,
        documentTotal,
        documentDone,
        probationStatus: probation?.status ?? null,
      });

      /**
       * เปอร์เซ็นต์รวมจากงานและเอกสาร — ด้านที่ไม่มีรายการเลยไม่เอามาเฉลี่ยด้วย
       * ถ้านับเป็น 100% จะทำให้คนที่ยังไม่ทำอะไรเลยแต่ไม่ต้องส่งเอกสาร
       * โชว์ 50% ทั้งที่ความจริงคือ 0%
       */
      const ratios: number[] = [];
      if (taskTotal > 0) ratios.push(taskDone / taskTotal);
      if (documentTotal > 0) ratios.push(documentDone / documentTotal);

      const percent = ratios.length
        ? Math.round(
            (ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 100,
          )
        : 100;

      return {
        employee: {
          id: employee.id,
          employeeCode: employee.employeeCode,
          title: employee.title,
          firstName: employee.firstName,
          lastName: employee.lastName,
          displayName: employee.displayName,
          position: employee.position,
          status: employee.status,
          startDate: employee.startDate,
          company: employee.company,
          branch: employee.branch,
          department: employee.department,
        },
        stage,
        stageNo,
        percent,
        tasks: {
          total: taskTotal,
          done: taskDone,
          overdue: taskOverdue,
        },
        documents: {
          total: documentTotal,
          done: documentDone,
          waiting: documentWaiting,
        },
        probation: probation
          ? {
              id: probation.id,
              status: probation.status,
              startDate: probation.startDate,
              endDate: probation.endDate,
              reviewDate: probation.reviewDate,
              result: probation.result,
              daysLeft: probationDaysLeft,
            }
          : null,
      };
    });

    const filtered =
      !query.stage || query.stage === 'ALL'
        ? rows
        : rows.filter((row) => row.stage === query.stage);

    // เรียงคนที่ยังไม่จบขึ้นก่อน แล้วค่อยไล่ตามขั้นที่ค้าง
    filtered.sort((left, right) => {
      if (left.stageNo !== right.stageNo) return left.stageNo - right.stageNo;
      return right.tasks.overdue - left.tasks.overdue;
    });

    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      summary: {
        total: rows.length,
        tasksStage: rows.filter((row) => row.stage === 'TASKS').length,
        documentsStage: rows.filter((row) => row.stage === 'DOCUMENTS').length,
        probationStage: rows.filter((row) => row.stage === 'PROBATION').length,
        done: rows.filter((row) => row.stage === 'DONE').length,
        overdueTasks: rows.reduce((sum, row) => sum + row.tasks.overdue, 0),
      },
    };
  }

  async findTasks(query: ListOnboardingTasksQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Prisma.OnboardingTaskWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.checklistId ? { checklistId: query.checklistId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dueDateFrom || query.dueDateTo
        ? {
            dueDate: {
              ...(query.dueDateFrom
                ? { gte: new Date(query.dueDateFrom) }
                : {}),
              ...(query.dueDateTo
                ? { lte: this.toEndOfDay(query.dueDateTo) }
                : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
              { category: { contains: query.q, mode: "insensitive" } },
              {
                employee: {
                  OR: [
                    {
                      employeeCode: { contains: query.q, mode: "insensitive" },
                    },
                    { firstName: { contains: query.q, mode: "insensitive" } },
                    { lastName: { contains: query.q, mode: "insensitive" } },
                    { displayName: { contains: query.q, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      this.prisma.onboardingTask.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        include: this.taskInclude(),
      }),
      this.prisma.onboardingTask.count({ where }),
      this.buildTaskSummary(where),
    ]);

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
    };
  }

  async findTask(id: string) {
    const item = await this.prisma.onboardingTask.findFirst({
      where: { id, deletedAt: null },
      include: this.taskInclude(),
    });

    if (!item) {
      throw new NotFoundException("ไม่พบ Onboarding Task");
    }

    return item;
  }

  async createTask(
    dto: CreateOnboardingTaskDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.validateCompany(companyId);
    await this.ensureEmployeeBelongsToCompany(dto.employeeId, companyId);

    if (dto.checklistId) {
      await this.ensureChecklistExists(dto.checklistId);
    }

    if (dto.checklistItemId) {
      await this.ensureChecklistItemExists(
        dto.checklistItemId,
        dto.checklistId,
      );
    }

    const created = await this.prisma.onboardingTask.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        checklistId: dto.checklistId ?? null,
        checklistItemId: dto.checklistItemId ?? null,
        title: dto.title.trim(),
        description: this.optionalTrim(dto.description),
        category: this.optionalTrim(dto.category),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: OnboardingTaskStatus.PENDING,
        createdById: currentUserId ?? null,
      },
    });

    return this.findTask(created.id);
  }

  async updateTask(
    id: string,
    dto: UpdateOnboardingTaskDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.onboardingTask.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบ Onboarding Task");
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (
      current.status === OnboardingTaskStatus.COMPLETED ||
      current.status === OnboardingTaskStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "ไม่สามารถแก้ไข Task ที่เสร็จสิ้นหรือยกเลิกแล้ว",
      );
    }

    // non-GLOBAL ย้ายบริษัทไม่ได้
    const nextCompanyId =
      scope.level === "GLOBAL"
        ? (dto.companyId ?? current.companyId)
        : current.companyId;
    const nextEmployeeId = dto.employeeId ?? current.employeeId;

    if (dto.companyId !== undefined && scope.level === "GLOBAL") {
      await this.validateCompany(dto.companyId);
    }

    if (dto.employeeId !== undefined || dto.companyId !== undefined) {
      await this.ensureEmployeeBelongsToCompany(nextEmployeeId, nextCompanyId);
    }

    if (dto.checklistId) {
      await this.ensureChecklistExists(dto.checklistId);
    }

    if (dto.checklistItemId) {
      await this.ensureChecklistItemExists(
        dto.checklistItemId,
        dto.checklistId ?? current.checklistId,
      );
    }

    await this.prisma.onboardingTask.update({
      where: { id },
      data: {
        ...(dto.companyId !== undefined && scope.level === "GLOBAL"
          ? { companyId: dto.companyId }
          : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.checklistId !== undefined
          ? { checklistId: dto.checklistId || null }
          : {}),
        ...(dto.checklistItemId !== undefined
          ? { checklistItemId: dto.checklistItemId || null }
          : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: this.optionalTrim(dto.description) }
          : {}),
        ...(dto.category !== undefined
          ? { category: this.optionalTrim(dto.category) }
          : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
        ...(currentUserId ? { createdById: current.createdById } : {}),
      },
    });

    return this.findTask(id);
  }

  async startTask(id: string, scope: TenantScope) {
    const current = await this.prisma.onboardingTask.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบ Onboarding Task");
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== OnboardingTaskStatus.PENDING) {
      throw new BadRequestException("เริ่มงานได้เฉพาะ Task ที่ยังรอดำเนินการ");
    }

    await this.prisma.onboardingTask.update({
      where: { id },
      data: {
        status: OnboardingTaskStatus.IN_PROGRESS,
      },
    });

    return this.findTask(id);
  }

  async completeTask(
    id: string,
    _dto: OnboardingTaskActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.onboardingTask.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบ Onboarding Task");
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status === OnboardingTaskStatus.COMPLETED) {
      throw new BadRequestException("Task นี้เสร็จสิ้นแล้ว");
    }

    if (current.status === OnboardingTaskStatus.CANCELLED) {
      throw new BadRequestException("ไม่สามารถปิดงาน Task ที่ยกเลิกแล้ว");
    }

    await this.prisma.onboardingTask.update({
      where: { id },
      data: {
        status: OnboardingTaskStatus.COMPLETED,
        completedAt: new Date(),
        completedById: currentUserId ?? null,
      },
    });

    return this.findTask(id);
  }

  async cancelTask(
    id: string,
    dto: OnboardingTaskActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.onboardingTask.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบ Onboarding Task");
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status === OnboardingTaskStatus.COMPLETED) {
      throw new BadRequestException("ไม่สามารถยกเลิก Task ที่เสร็จสิ้นแล้ว");
    }

    await this.prisma.onboardingTask.update({
      where: { id },
      data: {
        status: OnboardingTaskStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: currentUserId ?? null,
        cancelReason:
          this.optionalTrim(dto.cancelReason) ||
          this.optionalTrim(dto.note) ||
          null,
      },
    });

    return this.findTask(id);
  }

  async findDocuments(
    query: ListOnboardingDocumentsQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Prisma.OnboardingDocumentWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.taskId ? { taskId: query.taskId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { documentName: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
              {
                employee: {
                  OR: [
                    {
                      employeeCode: { contains: query.q, mode: "insensitive" },
                    },
                    { firstName: { contains: query.q, mode: "insensitive" } },
                    { lastName: { contains: query.q, mode: "insensitive" } },
                    { displayName: { contains: query.q, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      this.prisma.onboardingDocument.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: this.documentInclude(),
      }),
      this.prisma.onboardingDocument.count({ where }),
      this.buildDocumentSummary(where),
    ]);

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
    };
  }

  async createDocument(
    dto: CreateOnboardingDocumentDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.validateCompany(companyId);
    await this.ensureEmployeeBelongsToCompany(dto.employeeId, companyId);

    if (dto.taskId) {
      await this.ensureTaskExists(dto.taskId);
    }

    const created = await this.prisma.onboardingDocument.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        taskId: dto.taskId ?? null,
        documentName: dto.documentName.trim(),
        description: this.optionalTrim(dto.description),
        isRequired: dto.isRequired ?? true,
        status: OnboardingDocumentStatus.PENDING,
        note: this.optionalTrim(dto.note),
        createdById: currentUserId ?? null,
      },
    });

    return this.prisma.onboardingDocument.findUnique({
      where: { id: created.id },
      include: this.documentInclude(),
    });
  }

  async submitDocument(
    id: string,
    dto: OnboardingDocumentActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.getDocumentOrThrow(id);
    assertWithinScope(scope, { companyId: current.companyId });

    if (
      current.status === OnboardingDocumentStatus.VERIFIED ||
      current.status === OnboardingDocumentStatus.WAIVED
    ) {
      throw new BadRequestException("เอกสารนี้เสร็จสิ้นแล้ว");
    }

    await this.prisma.onboardingDocument.update({
      where: { id },
      data: {
        status: OnboardingDocumentStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedById: currentUserId ?? null,
        note: this.optionalTrim(dto.note) ?? current.note,
      },
    });

    return this.getDocumentOrThrow(id);
  }

  /**
   * เดาชนิดเอกสารพนักงานจากชื่อรายการ
   * ใช้กับตอนคัดลอกเข้าแฟ้มพนักงาน จะได้ไปอยู่หมวดที่ถูก ไม่กองรวมที่ "อื่น ๆ"
   */
  private guessEmployeeDocumentType(name: string): EmployeeDocumentType {
    const text = name.toLowerCase();

    if (text.includes("บัตรประชาชน")) return EmployeeDocumentType.ID_CARD;
    if (text.includes("ทะเบียนบ้าน"))
      return EmployeeDocumentType.HOUSE_REGISTRATION;
    if (text.includes("วุฒิ") || text.includes("การศึกษา"))
      return EmployeeDocumentType.EDUCATION_CERTIFICATE;
    if (text.includes("บัญชี") || text.includes("ธนาคาร"))
      return EmployeeDocumentType.BANK_BOOK;
    if (text.includes("แพทย์")) return EmployeeDocumentType.MEDICAL_CERTIFICATE;
    if (text.includes("สัญญาจ้าง"))
      return EmployeeDocumentType.EMPLOYMENT_CONTRACT;
    if (text.includes("work permit") || text.includes("ใบอนุญาตทำงาน"))
      return EmployeeDocumentType.WORK_PERMIT;

    return EmployeeDocumentType.OTHER;
  }

  /**
   * คัดลอกไฟล์ที่ตรวจผ่านแล้วเข้าแฟ้มเอกสารพนักงาน
   * ---------------------------------------------
   * เอกสารตอนรับเข้ากับเอกสารพนักงานเป็นคนละตาราง และเก็บไฟล์คนละโฟลเดอร์
   * ไฟล์ที่แนบตอน onboarding จึงไม่เคยโผล่ที่แท็บ "เอกสาร" ของหน้าพนักงานเลย
   *
   * พอ HR ตรวจผ่าน = ยอมรับเอกสารนั้นอย่างเป็นทางการ ก็ควรเข้าแฟ้มถาวรได้แล้ว
   * คัดลอกไฟล์จริง (ไม่ใช่อ้าง key เดิม) เพราะสองระบบคนละ storage root
   * ถ้าอ้างข้ามกันวันหลังใครลบฝั่งหนึ่งอีกฝั่งจะพัง
   *
   * ล้มเหลวไม่ทำให้การตรวจผ่านล้มตาม — การตรวจผ่านสำคัญกว่าการสำเนา
   */
  private async copyVerifiedDocumentToEmployeeFile(document: {
    id: string;
    employeeId: string;
    documentName: string;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    storageKey: string | null;
    description: string | null;
  }, currentUserId?: string) {
    if (!document.storageKey || !document.fileName) return;

    try {
      const already = await this.prisma.employeeDocument.findFirst({
        where: {
          employeeId: document.employeeId,
          title: document.documentName,
          deletedAt: null,
        },
        select: { id: true },
      });

      // ตรวจผ่านซ้ำไม่ควรได้สำเนาเพิ่มอีกใบ
      if (already) return;

      const targetDir = ensureEmployeeDocumentStorageDir(document.employeeId);
      const filename = `${randomUUID()}${extname(document.fileName) || ".bin"}`;

      await copyFile(
        resolveOnboardingFilePath(document.storageKey),
        `${targetDir}/${filename}`,
      );

      const storageKey = createEmployeeDocumentStorageKey({
        employeeId: document.employeeId,
        filename,
      });

      // อ่านกลับมาเช็กว่าไฟล์ปลายทางอยู่ในขอบเขตที่อนุญาตจริง
      getEmployeeDocumentAbsolutePath(storageKey);

      await this.prisma.employeeDocument.create({
        data: {
          employeeId: document.employeeId,
          type: this.guessEmployeeDocumentType(document.documentName),
          title: document.documentName,
          description:
            document.description ?? "คัดลอกจากเอกสารตอนรับเข้าทำงาน",
          fileName: document.fileName,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
          storageKey,
          uploadedById: currentUserId ?? null,
        },
      });
    } catch (error) {
      // เก็บไว้ใน log พอ ไม่โยนต่อ เพราะเอกสารตรวจผ่านไปแล้ว
      console.error("คัดลอกเอกสารเข้าแฟ้มพนักงานไม่สำเร็จ", error);
    }
  }

  async verifyDocument(
    id: string,
    dto: OnboardingDocumentActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.getDocumentOrThrow(id);
    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== OnboardingDocumentStatus.SUBMITTED) {
      throw new BadRequestException("ตรวจผ่านได้เฉพาะเอกสารที่ส่งแล้ว");
    }

    await this.prisma.onboardingDocument.update({
      where: { id },
      data: {
        status: OnboardingDocumentStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedById: currentUserId ?? null,
        note: this.optionalTrim(dto.note) ?? current.note,
      },
    });

    await this.copyVerifiedDocumentToEmployeeFile(
      {
        id: current.id,
        employeeId: current.employeeId,
        documentName: current.documentName,
        fileName: current.fileName,
        fileSize: current.fileSize,
        mimeType: current.mimeType,
        storageKey: current.storageKey,
        description: current.description,
      },
      currentUserId,
    );

    return this.getDocumentOrThrow(id);
  }

  async rejectDocument(
    id: string,
    dto: OnboardingDocumentActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.getDocumentOrThrow(id);
    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== OnboardingDocumentStatus.SUBMITTED) {
      throw new BadRequestException("ปฏิเสธได้เฉพาะเอกสารที่ส่งแล้ว");
    }

    await this.prisma.onboardingDocument.update({
      where: { id },
      data: {
        status: OnboardingDocumentStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedById: currentUserId ?? null,
        rejectionReason:
          this.optionalTrim(dto.rejectionReason) ||
          this.optionalTrim(dto.note) ||
          null,
        note: this.optionalTrim(dto.note) ?? current.note,
      },
    });

    return this.getDocumentOrThrow(id);
  }

  async waiveDocument(
    id: string,
    dto: OnboardingDocumentActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.getDocumentOrThrow(id);
    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status === OnboardingDocumentStatus.VERIFIED) {
      throw new BadRequestException("ไม่สามารถยกเว้นเอกสารที่ตรวจผ่านแล้ว");
    }

    await this.prisma.onboardingDocument.update({
      where: { id },
      data: {
        status: OnboardingDocumentStatus.WAIVED,
        verifiedAt: new Date(),
        verifiedById: currentUserId ?? null,
        note:
          this.optionalTrim(dto.note) ||
          this.optionalTrim(dto.rejectionReason) ||
          current.note,
      },
    });

    return this.getDocumentOrThrow(id);
  }

  /**
   * ลบรายการเอกสารที่เพิ่มผิด
   * เดิมไม่มีเส้นนี้ พิมพ์ชื่อผิดแล้วแก้ไม่ได้ ทำได้แค่กด "ยกเว้นให้" ให้พ้นทาง
   * ซึ่งทำให้ประวัติเอกสารมีขยะค้างอยู่ตลอด
   *
   * เอกสารที่ตรวจผ่านแล้วห้ามลบ เพราะเป็นหลักฐานว่าเคยรับไว้จริง
   */
  async removeDocument(id: string, scope: TenantScope) {
    const current = await this.prisma.onboardingDocument.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, companyId: true, status: true },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบรายการเอกสาร");
    }

    this.assertOnbManageScope(scope, current.companyId);

    if (current.status === OnboardingDocumentStatus.VERIFIED) {
      throw new BadRequestException(
        "เอกสารที่ตรวจผ่านแล้วลบไม่ได้ เพราะเป็นหลักฐานว่าเคยรับไว้จริง",
      );
    }

    await this.prisma.onboardingDocument.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { id, deleted: true };
  }

  /**
   * แนบไฟล์ให้รายการเอกสาร แล้วเลื่อนสถานะเป็น "ส่งแล้ว รอตรวจ" ให้เลย
   * เพราะการแนบไฟล์คือการส่งเอกสารในตัว ไม่ต้องให้กดสองครั้ง
   *
   * แนบทับได้ ไฟล์เดิมยังอยู่บนดิสก์แต่ไม่มีใครอ้างถึง — ยอมแลกกับความเสี่ยง
   * ที่จะลบไฟล์ที่ยังใช้อยู่ถ้าเผลอเขียนตรรกะลบผิด
   */
  async attachDocumentFile(
    id: string,
    file: Express.Multer.File,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    const current = await this.prisma.onboardingDocument.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, companyId: true, status: true },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบรายการเอกสาร");
    }

    this.assertOnbManageScope(scope, current.companyId);

    if (
      current.status === OnboardingDocumentStatus.VERIFIED ||
      current.status === OnboardingDocumentStatus.WAIVED
    ) {
      throw new BadRequestException(
        "เอกสารนี้ปิดเรื่องแล้ว แนบไฟล์เพิ่มไม่ได้",
      );
    }

    return this.prisma.onboardingDocument.update({
      where: { id },
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageProvider: ONBOARDING_FILE_STORAGE_PROVIDER,
        storageKey: createOnboardingFileStorageKey({
          documentId: id,
          filename: file.filename,
        }),
        bucketName: ONBOARDING_FILE_BUCKET,
        status: OnboardingDocumentStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedById: currentUserId ?? null,
        rejectionReason: null,
      },
    });
  }

  /** เส้นทางไฟล์จริงบนดิสก์ ใช้ตอนส่งไฟล์กลับให้ผู้ใช้ดาวน์โหลด */
  async resolveDocumentFile(id: string, scope: TenantScope) {
    const current = await this.prisma.onboardingDocument.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        companyId: true,
        fileName: true,
        mimeType: true,
        storageKey: true,
      },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบรายการเอกสาร");
    }

    this.assertOnbManageScope(scope, current.companyId);

    if (!current.storageKey) {
      throw new NotFoundException("รายการนี้ยังไม่มีไฟล์แนบ");
    }

    return {
      path: resolveOnboardingFilePath(current.storageKey),
      fileName: current.fileName ?? "document",
      mimeType: current.mimeType ?? "application/octet-stream",
    };
  }

  async findProbationRecords(
    query: ListProbationRecordsQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Prisma.ProbationRecordWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { summary: { contains: query.q, mode: "insensitive" } },
              { recommendation: { contains: query.q, mode: "insensitive" } },
              { result: { contains: query.q, mode: "insensitive" } },
              {
                employee: {
                  OR: [
                    {
                      employeeCode: { contains: query.q, mode: "insensitive" },
                    },
                    { firstName: { contains: query.q, mode: "insensitive" } },
                    { lastName: { contains: query.q, mode: "insensitive" } },
                    { displayName: { contains: query.q, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      this.prisma.probationRecord.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { endDate: "asc" },
        include: this.probationInclude(),
      }),
      this.prisma.probationRecord.count({ where }),
      this.buildProbationSummary(where),
    ]);

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
    };
  }

  async findProbationRecord(id: string) {
    const item = await this.prisma.probationRecord.findFirst({
      where: { id, deletedAt: null },
      include: this.probationInclude(),
    });

    if (!item) {
      throw new NotFoundException("ไม่พบข้อมูลทดลองงาน");
    }

    return item;
  }

  async createProbationRecord(
    dto: CreateProbationRecordDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.validateCompany(companyId);
    await this.ensureEmployeeBelongsToCompany(dto.employeeId, companyId);

    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException(
        "วันที่สิ้นสุดทดลองงานต้องมากกว่าวันที่เริ่มต้น",
      );
    }

    await this.ensureNoOpenProbation(dto.employeeId);

    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.probationRecord.create({
        data: {
          companyId,
          employeeId: dto.employeeId,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : null,
          status: ProbationStatus.IN_PROGRESS,
          summary: this.optionalTrim(dto.summary),
          recommendation: this.optionalTrim(dto.recommendation),
          note: this.optionalTrim(dto.note),
          createdById: currentUserId ?? null,
        },
      });

      // ใบทดลองงานเป็นแหล่งความจริง จึงเขียนกลับไปที่ตัวพนักงานให้ตรงกันเสมอ
      await tx.employee.update({
        where: { id: dto.employeeId },
        data: {
          probationEndDate: record.endDate,
          probationPassedAt: null,
          status: EmployeeStatus.PROBATION,
        },
      });

      return record;
    });

    return this.findProbationRecord(created.id);
  }

  /** พนักงานหนึ่งคนมีใบทดลองงานที่ยังไม่ปิดได้ครั้งละใบเดียว */
  private async ensureNoOpenProbation(employeeId: string) {
    const open = await this.prisma.probationRecord.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        status: {
          in: [ProbationStatus.IN_PROGRESS, ProbationStatus.EXTENDED],
        },
      },
      select: { id: true },
    });

    if (open) {
      throw new BadRequestException(
        "พนักงานคนนี้มีบันทึกทดลองงานที่ยังไม่ปิดอยู่แล้ว กรุณาบันทึกผลใบเดิมก่อน",
      );
    }
  }

  async reviewProbationRecord(
    id: string,
    dto: ProbationActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.probationRecord.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบข้อมูลทดลองงาน");
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (dto.status === ProbationStatus.EXTENDED && !dto.extendedUntil) {
      throw new BadRequestException("กรุณาระบุวันที่ขยายทดลองงาน");
    }

    const reviewedAt = this.resolveProbationReviewedAt(dto.reviewedAt, current);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.probationRecord.update({
        where: { id },
        data: {
          status: dto.status,
          result: this.optionalTrim(dto.result),
          summary: this.optionalTrim(dto.summary) ?? current.summary,
          recommendation:
            this.optionalTrim(dto.recommendation) ?? current.recommendation,
          note: this.optionalTrim(dto.note) ?? current.note,
          extendedUntil: dto.extendedUntil ? new Date(dto.extendedUntil) : null,
          reviewedAt,
          reviewedById: currentUserId ?? null,
        },
      });

      await tx.employee.update({
        where: { id: current.employeeId },
        data: this.buildEmployeeProbationSync(dto.status, updated),
      });

      if (dto.evaluation) {
        await this.createProbationEvaluationResult(tx, {
          probationRecord: current,
          evaluation: dto.evaluation,
          reviewedAt,
          currentUserId,
        });
      }
    });

    return this.findProbationRecord(id);
  }

  /**
   * บันทึกผลประเมินอย่างเดียว ไม่แตะสถานะทดลองงาน
   * ---------------------------------------------
   * เดิมการให้คะแนนกับการตัดสินผ่าน/ไม่ผ่านผูกอยู่ในปุ่มเดียว กดบันทึกคะแนนแล้ว
   * พนักงานผ่านทดลองงานทันที ทั้งที่สองอย่างนี้เป็นคนละจังหวะ และบางที่
   * คนให้คะแนนกับคนตัดสินก็เป็นคนละคน
   *
   * ผลที่บันทึกไว้จะไปโผล่ให้ตรวจสอบที่แท็บทดลองงานก่อนกดผ่านงานจริง
   */
  async saveProbationEvaluation(
    id: string,
    dto: SaveProbationEvaluationDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.probationRecord.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException("ไม่พบข้อมูลทดลองงาน");
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (
      current.status === ProbationStatus.PASSED ||
      current.status === ProbationStatus.FAILED
    ) {
      throw new BadRequestException(
        "ใบทดลองงานนี้บันทึกผลไปแล้ว ประเมินเพิ่มไม่ได้",
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // ประเมินใหม่ทับของเดิม เก็บใบล่าสุดใบเดียวพอ ไม่งั้นตอนตรวจสอบจะงงว่าดูใบไหน
      await tx.evaluationResult.deleteMany({
        where: { probationRecordId: current.id },
      });

      await this.createProbationEvaluationResult(tx, {
        probationRecord: current,
        evaluation: dto,
        reviewedAt: now,
        currentUserId,
        evaluatorEmployeeId: dto.evaluatorEmployeeId,
        summary: dto.summary,
      });

      if (dto.summary !== undefined) {
        await tx.probationRecord.update({
          where: { id },
          data: { summary: this.optionalTrim(dto.summary) ?? current.summary },
        });
      }
    });

    return this.findProbationRecord(id);
  }

  /**
   * บันทึกผลประเมินที่ใช้ตัดสินทดลองงาน ปิดผลทันที (FINALIZED)
   * เพราะผลนี้ถูกใช้ตัดสินไปแล้ว ไม่ควรมาแก้ย้อนหลัง
   */
  private async createProbationEvaluationResult(
    tx: Prisma.TransactionClient,
    input: {
      probationRecord: { id: string; companyId: string; employeeId: string };
      evaluation: NonNullable<ProbationActionDto["evaluation"]>;
      reviewedAt: Date;
      currentUserId: string | undefined;
      /** ผู้ประเมินที่เลือกไว้ ถ้าไม่ระบุจะไม่ผูกกับพนักงานคนไหน */
      evaluatorEmployeeId?: string;
      /** สรุปผลของการประเมินรอบนี้ */
      summary?: string;
    },
  ) {
    const { probationRecord, evaluation, reviewedAt, currentUserId } = input;

    const form = await tx.evaluationForm.findFirst({
      where: { id: evaluation.formId, deletedAt: null },
      include: { questions: true },
    });

    if (!form) {
      throw new NotFoundException("ไม่พบแบบประเมินที่เลือก");
    }

    const score = calculateEvaluationScore(form.questions, evaluation.scoreItems);

    await tx.evaluationResult.create({
      data: {
        companyId: probationRecord.companyId,
        formId: form.id,
        employeeId: probationRecord.employeeId,
        probationRecordId: probationRecord.id,
        evaluatorUserId: currentUserId ?? null,
        evaluatorEmployeeId: input.evaluatorEmployeeId ?? null,
        periodName: "ประเมินผลทดลองงาน",
        // เก็บสรุปผลไว้กับใบประเมินด้วย ไม่ใช่แค่กับใบทดลองงาน
        // เพราะป๊อปอัพกางรายละเอียดจากใบประเมิน ถ้าไม่เก็บจะไม่มีอะไรให้อ่าน
        summary: this.optionalTrim(input.summary) ?? null,
        evaluationDate: reviewedAt,
        scoreItems: score.items as Prisma.InputJsonValue,
        totalScore: new Prisma.Decimal(score.totalScore),
        maxScore: new Prisma.Decimal(score.maxScore),
        percent: new Prisma.Decimal(score.percent),
        status: EvaluationResultStatus.FINALIZED,
        submittedAt: reviewedAt,
        finalizedAt: reviewedAt,
        createdById: currentUserId ?? null,
        submittedById: currentUserId ?? null,
        finalizedById: currentUserId ?? null,
      },
    });
  }

  /**
   * วันที่บันทึกผลทดลองงาน — ยอมให้ย้อนหลังได้เพราะต้องใช้ตอนย้ายข้อมูลพนักงานเดิม
   * แต่ห้ามล่วงหน้า และห้ามก่อนวันเริ่มทดลองงาน เพราะค่านี้กลายเป็นวันบรรจุ
   * ซึ่งถูกใช้คำนวณอายุงานและโควตาวันลาต่อ
   */
  private resolveProbationReviewedAt(
    requested: string | undefined,
    record: { startDate: Date },
  ): Date {
    if (!requested) return new Date();

    const reviewedAt = new Date(requested);

    if (reviewedAt.getTime() > Date.now()) {
      throw new BadRequestException(
        "วันที่บันทึกผลทดลองงานต้องไม่เป็นวันในอนาคต",
      );
    }

    if (reviewedAt < record.startDate) {
      throw new BadRequestException(
        "วันที่บันทึกผลทดลองงานต้องไม่ก่อนวันเริ่มทดลองงาน",
      );
    }

    return reviewedAt;
  }

  /**
   * ผลรีวิวทดลองงานสะท้อนกลับไปที่ตัวพนักงาน
   * - ผ่าน: บรรจุเป็นพนักงานประจำ + เก็บวันที่ผ่าน
   * - ขยายเวลา: ยังทดลองงานอยู่ เลื่อนวันครบกำหนดตามที่ขยาย
   * - ไม่ผ่าน/ยกเลิก: ไม่แตะสถานะพนักงาน เพราะการเลิกจ้างมีขั้นตอนกฎหมายแยกต่างหาก
   */
  private buildEmployeeProbationSync(
    status: ProbationStatus,
    record: { endDate: Date; extendedUntil: Date | null; reviewedAt: Date | null },
  ): Prisma.EmployeeUpdateInput {
    if (status === ProbationStatus.PASSED) {
      return {
        status: EmployeeStatus.ACTIVE,
        probationPassedAt: record.reviewedAt ?? new Date(),
        probationEndDate: record.endDate,
      };
    }

    if (status === ProbationStatus.EXTENDED) {
      return {
        status: EmployeeStatus.PROBATION,
        probationPassedAt: null,
        probationEndDate: record.extendedUntil ?? record.endDate,
      };
    }

    return { probationPassedAt: null };
  }

  private buildChecklistSummary(where: Prisma.OnboardingChecklistWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const [total, active, inactive] = await Promise.all([
        tx.onboardingChecklist.count({ where }),
        tx.onboardingChecklist.count({
          where: { ...where, status: MasterStatus.ACTIVE },
        }),
        tx.onboardingChecklist.count({
          where: { ...where, status: MasterStatus.INACTIVE },
        }),
      ]);

      return {
        total,
        active,
        inactive,
      };
    });
  }

  /** เที่ยงคืนของวันนี้ ใช้เทียบว่างานเลยกำหนดหรือยัง (นับทั้งวันที่ครบกำหนดว่ายังไม่เลย) */
  private startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return today;
  }

  private buildTaskSummary(where: Prisma.OnboardingTaskWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const [total, pending, inProgress, completed, cancelled, overdue] =
        await Promise.all([
          tx.onboardingTask.count({ where }),
          tx.onboardingTask.count({
            where: { ...where, status: OnboardingTaskStatus.PENDING },
          }),
          tx.onboardingTask.count({
            where: { ...where, status: OnboardingTaskStatus.IN_PROGRESS },
          }),
          tx.onboardingTask.count({
            where: { ...where, status: OnboardingTaskStatus.COMPLETED },
          }),
          tx.onboardingTask.count({
            where: { ...where, status: OnboardingTaskStatus.CANCELLED },
          }),
          // งานเกินกำหนด = ยังไม่ปิดงาน แต่เลยวันครบกำหนดแล้ว
          // (คำนวณสด ไม่พึ่ง status OVERDUE เพราะไม่มีตัวไล่อัปเดตสถานะ)
          tx.onboardingTask.count({
            where: {
              ...where,
              status: {
                in: [
                  OnboardingTaskStatus.PENDING,
                  OnboardingTaskStatus.IN_PROGRESS,
                  OnboardingTaskStatus.OVERDUE,
                ],
              },
              dueDate: { lt: this.startOfToday() },
            },
          }),
        ]);

      return {
        total,
        pending,
        inProgress,
        completed,
        cancelled,
        overdue,
      };
    });
  }

  private buildDocumentSummary(where: Prisma.OnboardingDocumentWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const [total, pending, submitted, verified, rejected, waived, required] =
        await Promise.all([
          tx.onboardingDocument.count({ where }),
          tx.onboardingDocument.count({
            where: { ...where, status: OnboardingDocumentStatus.PENDING },
          }),
          tx.onboardingDocument.count({
            where: { ...where, status: OnboardingDocumentStatus.SUBMITTED },
          }),
          tx.onboardingDocument.count({
            where: { ...where, status: OnboardingDocumentStatus.VERIFIED },
          }),
          tx.onboardingDocument.count({
            where: { ...where, status: OnboardingDocumentStatus.REJECTED },
          }),
          tx.onboardingDocument.count({
            where: { ...where, status: OnboardingDocumentStatus.WAIVED },
          }),
          tx.onboardingDocument.count({
            where: { ...where, isRequired: true },
          }),
        ]);

      return {
        total,
        pending,
        submitted,
        verified,
        rejected,
        waived,
        required,
      };
    });
  }

  private buildProbationSummary(where: Prisma.ProbationRecordWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const dueSoonDate = new Date(now);
      dueSoonDate.setDate(dueSoonDate.getDate() + 30);

      const [
        total,
        inProgress,
        passed,
        failed,
        extended,
        cancelled,
        dueSoon,
        overdue,
      ] = await Promise.all([
        tx.probationRecord.count({ where }),
        tx.probationRecord.count({
          where: { ...where, status: ProbationStatus.IN_PROGRESS },
        }),
        tx.probationRecord.count({
          where: { ...where, status: ProbationStatus.PASSED },
        }),
        tx.probationRecord.count({
          where: { ...where, status: ProbationStatus.FAILED },
        }),
        tx.probationRecord.count({
          where: { ...where, status: ProbationStatus.EXTENDED },
        }),
        tx.probationRecord.count({
          where: { ...where, status: ProbationStatus.CANCELLED },
        }),
        tx.probationRecord.count({
          where: {
            ...where,
            status: ProbationStatus.IN_PROGRESS,
            endDate: {
              gte: now,
              lte: dueSoonDate,
            },
          },
        }),
        tx.probationRecord.count({
          where: {
            ...where,
            status: ProbationStatus.IN_PROGRESS,
            endDate: { lt: now },
          },
        }),
      ]);

      return {
        total,
        inProgress,
        passed,
        failed,
        extended,
        cancelled,
        dueSoon,
        overdue,
      };
    });
  }

  private async validateCompany(companyId?: string | null) {
    if (!companyId) return;

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException("ไม่พบบริษัท");
    }
  }

  private async ensureEmployeeBelongsToCompany(
    employeeId: string,
    companyId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true, companyId: true },
    });

    if (!employee) {
      throw new NotFoundException("ไม่พบพนักงาน");
    }

    if (employee.companyId !== companyId) {
      throw new BadRequestException("พนักงานไม่อยู่ในบริษัทที่เลือก");
    }
  }

  private async ensureChecklistCodeAvailable(
    code: string,
    companyId?: string | null,
    excludeId?: string,
  ) {
    const existing = await this.prisma.onboardingChecklist.findFirst({
      where: {
        code: code.trim(),
        companyId: companyId ?? null,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("รหัส Checklist นี้ถูกใช้งานแล้ว");
    }
  }

  private async ensureChecklistExists(id: string) {
    const item = await this.prisma.onboardingChecklist.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException("ไม่พบ Checklist");
    }
  }

  private async ensureChecklistItemExists(
    id: string,
    checklistId?: string | null,
  ) {
    const item = await this.prisma.onboardingChecklistItem.findFirst({
      where: {
        id,
        ...(checklistId ? { checklistId } : {}),
      },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException("ไม่พบรายการ Checklist");
    }
  }

  private async ensureTaskExists(id: string) {
    const item = await this.prisma.onboardingTask.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException("ไม่พบ Onboarding Task");
    }
  }

  private async getDocumentOrThrow(id: string) {
    const item = await this.prisma.onboardingDocument.findFirst({
      where: { id, deletedAt: null },
      include: this.documentInclude(),
    });

    if (!item) {
      throw new NotFoundException("ไม่พบเอกสาร Onboarding");
    }

    return item;
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

  private checklistInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      items: {
        orderBy: {
          sortOrder: "asc" as const,
        },
      },
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      _count: {
        select: {
          tasks: true,
        },
      },
    };
  }

  private taskInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          department: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
        },
      },
      checklist: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      checklistItem: {
        select: {
          id: true,
          title: true,
          category: true,
          isRequired: true,
        },
      },
      documents: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc" as const,
        },
      },
    };
  }

  private documentInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
        },
      },
      task: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    };
  }

  private probationInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          department: {
            select: {
              id: true,
              code: true,
              nameTh: true,
            },
          },
        },
      },
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      evaluationResults: {
        where: { deletedAt: null },
        orderBy: { evaluationDate: "desc" as const },
        select: {
          id: true,
          totalScore: true,
          maxScore: true,
          percent: true,
          evaluationDate: true,
          // คะแนนรายข้อกับผู้ประเมิน ต้องส่งไปด้วยเพื่อให้กางดูรายละเอียดได้
          scoreItems: true,
          summary: true,
          evaluatorEmployee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
          form: {
            select: {
              id: true,
              code: true,
              name: true,
              passScore: true,
              totalScore: true,
            },
          },
        },
      },
    };
  }
}
