import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ComplaintStatus,
  DocumentApprovalAction,
  DocumentFileType,
  DocumentRequestStatus,
  MasterStatus,
  Prisma,
} from '../../generated/prisma/client';
import {
  createDocumentFileName,
  createDocumentFileStorageKey,
  DOCUMENT_FILE_BUCKET,
  DOCUMENT_FILE_STORAGE_PROVIDER,
  ensureDocumentFileStorageDir,
  getDocumentFileAbsolutePath,
} from './document-file-storage.util';
import { writeFile, readFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { COMPANY_LOGO_UPLOAD_DIR } from '../organization/company-logo-storage.util';
import * as puppeteer from 'puppeteer';
import { PrismaService } from '../../database/prisma.service';
import { resolveMonthlyEquivalentWage } from '../../common/utils/salary-rate.util';
import { CreateDocumentRequestDto } from './dto/create-document-request.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { DocumentRequestActionDto } from './dto/document-request-action.dto';
import { ListDocumentRequestsQueryDto } from './dto/list-document-requests-query.dto';
import { ListDocumentTypesQueryDto } from './dto/list-document-types-query.dto';
import { UpdateDocumentRequestDto } from './dto/update-document-request.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { stat, unlink } from 'fs/promises';
import { UploadDocumentFileDto } from './dto/upload-document-file.dto';
import { ComplaintActionDto } from './dto/complaint-action.dto';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { ListComplaintsQueryDto } from './dto/list-complaints-query.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { CreateResignDocumentRequestDto } from './dto/create-resign-document-request.dto';
import { CreateSalaryCertificateRequestDto } from './dto/create-salary-certificate-request.dto';
import { CreateVisaCertificateRequestDto } from './dto/create-visa-certificate-request.dto';
import { CreateWorkCertificateRequestDto } from './dto/create-work-certificate-request.dto';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { ListDocumentTemplatesQueryDto } from './dto/list-document-templates-query.dto';
import { RenderDocumentTemplateQueryDto } from './dto/render-document-template-query.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';
import { GenerateDocumentPdfDto } from './dto/generate-document-pdf.dto';
import { NotificationsService } from '../notifications/notifications.service';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  tenantWhere,
} from '../../common/tenant/tenant-scope.util';

type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
};

@Injectable()
export class DocumentWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  health() {
    return {
      module: 'DocumentWorkflow',
      status: 'ready',
    };
  }

  async findDocumentTypes(query: ListDocumentTypesQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DocumentTypeWhereInput = {
      deletedAt: null,
    };

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) {
      where.companyId = scopedCompanyId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        {
          code: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          nameTh: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          nameEn: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          category: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.documentType.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
        include: {
          company: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
        },
      }),
      this.prisma.documentType.count({ where }),
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


  async findMobileEssDocumentTypes(
    query: ListDocumentTypesQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(undefined, actorId);

    if (!employee?.companyId) {
      throw new BadRequestException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถโหลดประเภทเอกสาร Mobile ได้',
      );
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.DocumentTypeWhereInput = {
      allowEmployeeRequest: true,
      deletedAt: null,
      status: MasterStatus.ACTIVE,
      OR: [{ companyId: employee.companyId }, { companyId: null }],
    };

    if (query.category) where.category = query.category;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.AND = [
        {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { nameTh: { contains: search, mode: 'insensitive' } },
            { nameEn: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.documentType.findMany({
        where,
        orderBy: [{ category: 'asc' }, { nameTh: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.documentType.count({ where }),
    ]);

    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findEssDocumentTypes(
    query: ListDocumentTypesQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(undefined, actorId);

    if (!employee?.companyId) {
      throw new BadRequestException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถโหลดประเภทเอกสาร ESS ได้',
      );
    }

    return this.findDocumentTypes(
      {
        ...query,
        companyId: employee.companyId,
        status: 'ACTIVE',
      },
      { level: 'COMPANY', companyId: employee.companyId, branchId: null },
    );
  }

  async findEssDocumentRequests(
    query: ListDocumentRequestsQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(undefined, actorId);

    if (!employee?.id) {
      throw new BadRequestException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถดูคำขอเอกสาร ESS ได้',
      );
    }

    return this.findDocumentRequests(
      {
        ...query,
        employeeId: employee.id,
        companyId: employee.companyId,
      },
      { level: 'COMPANY', companyId: employee.companyId, branchId: null },
    );
  }

  async findEssDocumentRequest(id: string, currentUser: CurrentUserLike) {
    await this.ensureEssDocumentRequestOwner(id, currentUser);
    return this.findDocumentRequest(id);
  }

  async createMobileEssDocumentRequest(
    dto: CreateDocumentRequestDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureMobileEmployeeRequestableDocumentType(
      dto.documentTypeId,
      currentUser,
    );
    return this.createEssDocumentRequest(dto, currentUser);
  }

  async updateMobileEssDocumentRequest(
    id: string,
    dto: UpdateDocumentRequestDto,
    currentUser: CurrentUserLike,
  ) {
    const current = await this.findEssDocumentRequest(id, currentUser);
    if (current.status !== DocumentRequestStatus.DRAFT) {
      throw new BadRequestException(
        'แก้ไขคำร้องผ่านแอปได้เฉพาะฉบับร่างหรือรายการที่ถูกส่งกลับให้แก้ไขเท่านั้น',
      );
    }

    if (dto.documentTypeId) {
      await this.ensureMobileEmployeeRequestableDocumentType(
        dto.documentTypeId,
        currentUser,
      );
    }
    return this.updateEssDocumentRequest(id, dto, currentUser);
  }

  async removeMobileEssDocumentRequest(
    id: string,
    currentUser: CurrentUserLike,
  ) {
    const current = await this.findEssDocumentRequest(id, currentUser);
    if (current.status !== DocumentRequestStatus.DRAFT) {
      throw new BadRequestException(
        'ลบคำร้องผ่านแอปได้เฉพาะฉบับร่างเท่านั้น',
      );
    }
    return this.removeEssDocumentRequest(id, currentUser);
  }

  async createEssDocumentRequest(
    dto: CreateDocumentRequestDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(undefined, actorId);

    if (!employee?.id) {
      throw new BadRequestException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถยื่นคำขอเอกสาร ESS ได้',
      );
    }

    return this.createDocumentRequest(
      {
        ...dto,
        companyId: employee.companyId,
        employeeId: employee.id,
      },
      currentUser,
      { level: 'COMPANY', companyId: employee.companyId, branchId: null },
    );
  }

  async updateEssDocumentRequest(
    id: string,
    dto: UpdateDocumentRequestDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureEssDocumentRequestOwner(id, currentUser);
    // ยืนยันความเป็นเจ้าของแล้ว จึงไม่ต้อง scope ซ้ำ
    return this.updateDocumentRequest(id, dto, {
      level: 'GLOBAL',
      companyId: null,
      branchId: null,
    });
  }

  async submitEssDocumentRequest(id: string, currentUser: CurrentUserLike) {
    await this.ensureEssDocumentRequestOwner(id, currentUser);
    return this.submitDocumentRequest(id, currentUser);
  }

  async cancelEssDocumentRequest(
    id: string,
    dto: DocumentRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureEssDocumentRequestOwner(id, currentUser);
    return this.cancelDocumentRequest(id, dto, currentUser);
  }

  async removeEssDocumentRequest(
    id: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureEssDocumentRequestOwner(id, currentUser);
    // ยืนยันความเป็นเจ้าของแล้ว จึงไม่ต้อง scope ซ้ำ
    return this.removeDocumentRequest(id, {
      level: 'GLOBAL',
      companyId: null,
      branchId: null,
    });
  }

  async getEssDocumentFileForDownload(
    documentRequestId: string,
    fileId: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureEssDocumentRequestOwner(documentRequestId, currentUser);
    return this.getDocumentFileForDownload(documentRequestId, fileId);
  }

  async findDocumentType(id: string) {
    const item = await this.prisma.documentType.findFirst({
      where: {
        id,
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
      },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบประเภทเอกสาร');
    }

    return item;
  }

  /**
   * บริษัทปลายทางสำหรับ "สร้าง" master เอกสาร
   * - GLOBAL: ใช้ค่าจาก dto ได้ (รวม null = shared ทั้งระบบ)
   * - COMPANY/BRANCH: ล็อกเป็นบริษัทของผู้ใช้เสมอ
   */
  private resolveDocCompanyId(
    scope: TenantScope,
    requested?: string | null,
  ): string | null {
    if (scope.level === 'GLOBAL') {
      return requested ?? null;
    }
    return scope.companyId ?? null;
  }

  /**
   * ตรวจสิทธิ์แก้ไข/ลบ master เอกสารตาม scope
   * - GLOBAL: ผ่านทุกกรณี
   * - COMPANY/BRANCH: จัดการได้เฉพาะของบริษัทตน (บล็อก shared/null และบริษัทอื่น)
   */
  private assertDocManageScope(scope: TenantScope, companyId: string | null) {
    if (scope.level === 'GLOBAL') {
      return;
    }
    if (!companyId || companyId !== scope.companyId) {
      throw new ForbiddenException('ไม่มีสิทธิ์จัดการข้อมูลของบริษัทนี้');
    }
  }

  async createDocumentType(dto: CreateDocumentTypeDto, scope: TenantScope) {
    const companyId = this.resolveDocCompanyId(scope, dto.companyId);
    await this.ensureCompanyExists(companyId);
    await this.ensureDocumentTypeCodeAvailable({
      companyId,
      code: dto.code,
    });

    const item = await this.prisma.documentType.create({
      data: {
        companyId,
        code: dto.code.trim().toUpperCase(),
        nameTh: dto.nameTh.trim(),
        nameEn: this.optionalTrim(dto.nameEn),
        description: this.optionalTrim(dto.description),
        category: this.optionalTrim(dto.category),
        requiresApproval: dto.requiresApproval ?? true,
        approvalLevels: dto.approvalLevels ?? 2,
        allowEmployeeRequest: dto.allowEmployeeRequest ?? true,
        status: MasterStatus.ACTIVE,
      },
    });

    return this.findDocumentType(item.id);
  }

  async updateDocumentType(
    id: string,
    dto: UpdateDocumentTypeDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.documentType.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบประเภทเอกสาร');
    }

    this.assertDocManageScope(scope, current.companyId);

    if (dto.code !== undefined) {
      await this.ensureDocumentTypeCodeAvailable({
        companyId: current.companyId,
        code: dto.code,
        excludeId: id,
      });
    }

    await this.prisma.documentType.update({
      where: { id },
      data: {
        ...(dto.code !== undefined
          ? { code: dto.code.trim().toUpperCase() }
          : {}),
        ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
        ...(dto.nameEn !== undefined
          ? { nameEn: this.optionalTrim(dto.nameEn) }
          : {}),
        ...(dto.description !== undefined
          ? { description: this.optionalTrim(dto.description) }
          : {}),
        ...(dto.category !== undefined
          ? { category: this.optionalTrim(dto.category) }
          : {}),
        ...(dto.requiresApproval !== undefined
          ? { requiresApproval: dto.requiresApproval }
          : {}),
        ...(dto.approvalLevels !== undefined
          ? { approvalLevels: dto.approvalLevels }
          : {}),
        ...(dto.allowEmployeeRequest !== undefined
          ? { allowEmployeeRequest: dto.allowEmployeeRequest }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    return this.findDocumentType(id);
  }

  async removeDocumentType(id: string, scope: TenantScope) {
    const current = await this.prisma.documentType.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            requests: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบประเภทเอกสาร');
    }

    this.assertDocManageScope(scope, current.companyId);

    await this.prisma.documentType.update({
      where: { id },
      data: {
        status: MasterStatus.INACTIVE,
        deletedAt: new Date(),
      },
    });

    return {
      id,
      deleted: true,
      usedByRequests: current._count.requests,
    };
  }

  async findDocumentRequests(
    query: ListDocumentRequestsQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DocumentRequestWhereInput = {
      deletedAt: null,
    };

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) {
      where.companyId = scopedCompanyId;
    }

    // companyId อย่างเดียวไม่พอ — ผู้ใช้ scope ระดับสาขาต้องไม่เห็นคำขอของสาขาอื่น
    // จึงกรองผ่าน relation employee เหมือนโมดูล leave/overtime/time-adjust
    const employeeWhere: Prisma.EmployeeWhereInput = {};

    // ตัวกรองสาขาที่ผู้ใช้เลือกเอง ใส่ก่อน แล้วให้ scope ทับทีหลังเสมอ
    // ผู้ใช้ระดับสาขาส่ง branchId อื่นมาไม่ได้ผล — เห็นได้แค่สาขาตัวเองตามเดิม
    if (scope.level !== 'BRANCH' && query.branchId) {
      employeeWhere.branchId = query.branchId;
    }

    Object.assign(employeeWhere, tenantWhere(scope) as Prisma.EmployeeWhereInput);

    if (Object.keys(employeeWhere).length > 0) {
      where.employee = { is: employeeWhere };
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.documentTypeId) {
      where.documentTypeId = query.documentTypeId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};

      if (query.dateFrom) {
        where.createdAt.gte = this.parseDateTime(
          `${query.dateFrom}T00:00:00.000+07:00`,
        );
      }

      if (query.dateTo) {
        where.createdAt.lte = this.parseDateTime(
          `${query.dateTo}T23:59:59.999+07:00`,
        );
      }
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        {
          requestNo: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          purpose: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          employee: {
            employeeCode: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            firstName: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            lastName: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            nickname: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          documentType: {
            nameTh: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    const [items, total, summary] = await Promise.all([
      this.prisma.documentRequest.findMany({
        where,
        include: this.documentRequestInclude(),
        // หน้านี้คือคิวงาน ไม่ใช่ไทม์ไลน์ — งานที่ยังต้องทำต้องอยู่บนสุด
        // enum เรียง DRAFT < SUBMITTED < APPROVED < REJECTED < CANCELLED
        // จึงได้ ร่าง/รออนุมัติ ก่อน แล้วค่อยเป็นงานที่จบแล้ว
        // ภายในกลุ่มเดียวกันเรียงใหม่สุดขึ้นก่อนเสมอ
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.documentRequest.count({ where }),
      this.buildDocumentRequestSummary(where),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
    };
  }


  private async buildDocumentRequestSummary(where: Prisma.DocumentRequestWhereInput) {
    const prisma = this.prisma as any;
    const [total, draft, submitted, approved, rejected, cancelled] = await Promise.all([
      prisma.documentRequest.count({ where }),
      this.countDocumentRequestStatuses(where, ['DRAFT']),
      this.countDocumentRequestStatuses(where, ['SUBMITTED']),
      this.countDocumentRequestStatuses(where, ['APPROVED']),
      this.countDocumentRequestStatuses(where, ['REJECTED']),
      this.countDocumentRequestStatuses(where, ['CANCELLED']),
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

  private countDocumentRequestStatuses(where: Prisma.DocumentRequestWhereInput, statuses: string[]) {
    const prisma = this.prisma as any;
    return prisma.documentRequest.count({
      where: {
        ...where,
        status: { in: statuses },
      },
    });
  }

  async findDocumentRequest(id: string, scope?: TenantScope) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(id, scope);
    }

    const item = await this.prisma.documentRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.documentRequestInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    return item;
  }

  async createDocumentRequest(
    dto: CreateDocumentRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(
      dto.employeeId,
      actorId,
    );

    // non-GLOBAL: ล็อกบริษัทเป็นของผู้ใช้เสมอ
    const companyId =
      scope.level === 'GLOBAL'
        ? (dto.companyId ?? employee?.companyId)
        : scope.companyId;

    if (!companyId) {
      throw new BadRequestException(
        'กรุณาระบุบริษัท หรือผูกบัญชีผู้ใช้กับข้อมูลพนักงานก่อนยื่นเอกสาร',
      );
    }

    await this.ensureCompanyExists(companyId);

    if (employee) {
      assertWithinScope(scope, {
        companyId: employee.companyId,
        branchId: employee.branchId,
      });
    }

    if (employee && employee.companyId !== companyId) {
      throw new BadRequestException('บริษัทของพนักงานไม่ตรงกับบริษัทที่เลือก');
    }

    const documentType = await this.ensureActiveDocumentType(
      dto.documentTypeId,
      companyId,
    );

    const created = await this.createDocumentRequestWithUniqueNo({
      companyId,
      employeeId: employee?.id ?? null,
      documentTypeId: documentType.id,
      title: dto.title.trim(),
      purpose: this.optionalTrim(dto.purpose),
      requestData:
        dto.requestData === undefined
          ? undefined
          : (dto.requestData as Prisma.InputJsonValue),
      note: this.optionalTrim(dto.note),
    });

    if (dto.submit) {
      return this.submitDocumentRequest(created.id, currentUser);
    }

    return this.findDocumentRequest(created.id);
  }

  async updateDocumentRequest(
    id: string,
    dto: UpdateDocumentRequestDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.documentRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status === DocumentRequestStatus.APPROVED) {
      throw new BadRequestException('ไม่สามารถแก้ไขคำขอที่อนุมัติแล้ว');
    }

    if (current.status === DocumentRequestStatus.CANCELLED) {
      throw new BadRequestException('ไม่สามารถแก้ไขคำขอที่ยกเลิกแล้ว');
    }

    if (dto.documentTypeId !== undefined) {
      await this.ensureActiveDocumentType(
        dto.documentTypeId,
        current.companyId,
      );
    }

    await this.prisma.documentRequest.update({
      where: { id },
      data: {
        ...(dto.documentTypeId !== undefined
          ? { documentTypeId: dto.documentTypeId }
          : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.purpose !== undefined
          ? { purpose: this.optionalTrim(dto.purpose) }
          : {}),
        ...(dto.requestData !== undefined
          ? { requestData: dto.requestData as Prisma.InputJsonValue }
          : {}),
        ...(dto.note !== undefined
          ? { note: this.optionalTrim(dto.note) }
          : {}),
      },
    });

    return this.findDocumentRequest(id);
  }

  async submitDocumentRequest(
    id: string,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(id, scope);
    }

    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentDocumentRequestRaw(id);

    if (current.status === DocumentRequestStatus.APPROVED) {
      throw new BadRequestException('คำขอนี้อนุมัติแล้ว');
    }

    if (current.status === DocumentRequestStatus.SUBMITTED) {
      throw new BadRequestException('คำขอนี้ถูกส่งขออนุมัติแล้ว');
    }

    if (current.status === DocumentRequestStatus.CANCELLED) {
      throw new BadRequestException('คำขอนี้ถูกยกเลิกแล้ว');
    }

    if (current.status === DocumentRequestStatus.REJECTED) {
      throw new BadRequestException('คำขอนี้ถูกไม่อนุมัติแล้ว');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (!current.documentType.requiresApproval) {
        await tx.documentRequest.update({
          where: { id },
          data: {
            status: DocumentRequestStatus.APPROVED,
            currentLevel: 0,
            submittedAt: now,
            submittedById: actorId,
            approvedAt: now,
            approvedById: actorId,
          },
        });

        await tx.documentApproval.create({
          data: {
            documentRequestId: id,
            level: 0,
            action: DocumentApprovalAction.APPROVE,
            oldStatus: current.status,
            newStatus: DocumentRequestStatus.APPROVED,
            reason: 'เอกสารประเภทนี้ไม่ต้องผ่านการอนุมัติ',
            actedById: actorId,
          },
        });

        return;
      }

      await tx.documentRequest.update({
        where: { id },
        data: {
          status: DocumentRequestStatus.SUBMITTED,
          currentLevel: 1,
          submittedAt: now,
          submittedById: actorId,
        },
      });

      await tx.documentApproval.create({
        data: {
          documentRequestId: id,
          level: 1,
          action: DocumentApprovalAction.SUBMIT,
          oldStatus: current.status,
          newStatus: DocumentRequestStatus.SUBMITTED,
          reason: 'ส่งคำขอเอกสารเพื่อขออนุมัติ',
          actedById: actorId,
        },
      });
    });

    await this.notifyDocumentSafely('แจ้งเตือนคำขอเอกสารหลังส่งขออนุมัติ', async () => {
      const latest = await this.prisma.documentRequest.findFirst({
        where: { id, deletedAt: null },
        select: { status: true },
      });

      if (latest?.status === DocumentRequestStatus.SUBMITTED) {
        await this.notificationsService.notifyDocumentPendingApproval(id);
      }

      if (latest?.status === DocumentRequestStatus.APPROVED) {
        await this.notificationsService.notifyDocumentApproved(id);
      }
    });

    return this.findDocumentRequest(id);
  }

  async approveDocumentRequest(
    id: string,
    dto: DocumentRequestActionDto,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(id, scope);
    }

    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentDocumentRequestRaw(id);

    if (current.status !== DocumentRequestStatus.SUBMITTED) {
      throw new BadRequestException(
        'อนุมัติได้เฉพาะคำขอเอกสารที่รออนุมัติเท่านั้น',
      );
    }

    await this.assertNotOwnDocumentRequest(current, actorId);

    const approvalLevels = Math.min(
      Math.max(current.documentType.approvalLevels || 2, 1),
      2,
    );

    const currentLevel = current.currentLevel || 1;
    const isFinalApproval = currentLevel >= approvalLevels;
    const nextLevel = isFinalApproval ? currentLevel : currentLevel + 1;
    const now = new Date();

    const action =
      currentLevel === 1
        ? DocumentApprovalAction.APPROVE_LEVEL_1
        : DocumentApprovalAction.APPROVE_LEVEL_2;

    // ออกเลขที่หนังสือเฉพาะตอนอนุมัติขั้นสุดท้าย
    // ทั้ง approval log และการออกเลขอยู่ใน transaction เดียวกัน
    // ถ้าเลขชนกัน transaction จะ rollback ทั้งก้อนแล้ววนใหม่ ไม่มี log ค้าง
    const maxAttempts = isFinalApproval ? 5 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const documentNo = isFinalApproval
        ? await this.generateDocumentNo(current.companyId, now)
        : null;

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.documentApproval.create({
            data: {
              documentRequestId: id,
              level: currentLevel,
              action,
              oldStatus: current.status,
              newStatus: isFinalApproval
                ? DocumentRequestStatus.APPROVED
                : DocumentRequestStatus.SUBMITTED,
              reason: this.optionalTrim(dto.reason),
              note: this.optionalTrim(dto.note),
              actedById: actorId,
            },
          });

          await tx.documentRequest.update({
            where: { id },
            data: {
              status: isFinalApproval
                ? DocumentRequestStatus.APPROVED
                : DocumentRequestStatus.SUBMITTED,
              currentLevel: nextLevel,
              approvedAt: isFinalApproval ? now : null,
              approvedById: isFinalApproval ? actorId : null,
              ...(isFinalApproval
                ? {
                    documentNo,
                    issuedAt: now,
                  }
                : {}),
            },
          });
        });

        break;
      } catch (error) {
        const isDuplicateDocumentNo =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          String(error.meta?.target ?? '').includes('documentNo');

        if (!isDuplicateDocumentNo) {
          throw error;
        }

        if (attempt === maxAttempts) {
          throw new ConflictException(
            'ไม่สามารถออกเลขที่หนังสือได้ กรุณาลองอนุมัติอีกครั้ง',
          );
        }
      }
    }

    await this.notifyDocumentSafely('อัปเดตแจ้งเตือนหลังอนุมัติคำขอเอกสาร', async () => {
      await this.notificationsService.closeDocumentPendingNotifications(id);

      const latest = await this.prisma.documentRequest.findFirst({
        where: { id, deletedAt: null },
        select: { status: true },
      });

      if (latest?.status === DocumentRequestStatus.SUBMITTED) {
        await this.notificationsService.notifyDocumentPendingApproval(id);
      }

      if (latest?.status === DocumentRequestStatus.APPROVED) {
        await this.notificationsService.notifyDocumentApproved(id);
      }
    });

    return this.findDocumentRequest(id);
  }

  async rejectDocumentRequest(
    id: string,
    dto: DocumentRequestActionDto,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(id, scope);
    }

    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentDocumentRequestRaw(id);

    if (current.status !== DocumentRequestStatus.SUBMITTED) {
      throw new BadRequestException(
        'ไม่อนุมัติได้เฉพาะคำขอเอกสารที่รออนุมัติเท่านั้น',
      );
    }

    await this.assertNotOwnDocumentRequest(current, actorId);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentRequest.update({
        where: { id },
        data: {
          status: DocumentRequestStatus.REJECTED,
          rejectedAt: new Date(),
          rejectedById: actorId,
        },
      });

      await tx.documentApproval.create({
        data: {
          documentRequestId: id,
          level: current.currentLevel || 1,
          action: DocumentApprovalAction.REJECT,
          oldStatus: current.status,
          newStatus: DocumentRequestStatus.REJECTED,
          reason: this.optionalTrim(dto.reason),
          note: this.optionalTrim(dto.note),
          actedById: actorId,
        },
      });
    });

    await this.notifyDocumentSafely('แจ้งเตือนคำขอเอกสารถูกปฏิเสธ', async () => {
      await this.notificationsService.closeDocumentPendingNotifications(id);
      await this.notificationsService.notifyDocumentRejected(id);
    });

    return this.findDocumentRequest(id);
  }

  async returnDocumentRequestForReview(
    id: string,
    dto: DocumentRequestActionDto,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentDocumentRequestRaw(id);

    if (current.status !== DocumentRequestStatus.SUBMITTED) {
      throw new BadRequestException(
        'ส่งกลับให้ตรวจสอบใหม่ได้เฉพาะคำขอเอกสารที่รออนุมัติเท่านั้น',
      );
    }

    await this.assertNotOwnDocumentRequest(current, actorId);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentRequest.update({
        where: { id },
        data: {
          status: DocumentRequestStatus.DRAFT,
          currentLevel: 0,
          submittedAt: null,
          submittedById: null,
          approvedAt: null,
          approvedById: null,
          rejectedAt: null,
          rejectedById: null,
          cancelledAt: null,
          cancelledById: null,
        },
      });

      await tx.documentApproval.create({
        data: {
          documentRequestId: id,
          level: current.currentLevel || 1,
          action: DocumentApprovalAction.CANCEL,
          oldStatus: current.status,
          newStatus: DocumentRequestStatus.DRAFT,
          reason:
            this.optionalTrim(dto.reason) ||
            'ส่งกลับให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่',
          note: this.optionalTrim(dto.note),
          actedById: actorId,
        },
      });
    });

    await this.notifyDocumentSafely('แจ้งเตือนคำขอเอกสารถูกส่งกลับให้ตรวจสอบ', async () => {
      await this.notificationsService.closeDocumentPendingNotifications(id);
      await this.notificationsService.notifyDocumentReturnedForReview(id);
    });

    return this.findDocumentRequest(id);
  }

  async cancelDocumentRequest(
    id: string,
    dto: DocumentRequestActionDto,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(id, scope);
    }

    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentDocumentRequestRaw(id);

    if (current.status === DocumentRequestStatus.APPROVED) {
      throw new BadRequestException('ไม่สามารถยกเลิกคำขอที่อนุมัติแล้ว');
    }

    if (current.status === DocumentRequestStatus.CANCELLED) {
      throw new BadRequestException('คำขอนี้ถูกยกเลิกแล้ว');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentRequest.update({
        where: { id },
        data: {
          status: DocumentRequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: actorId,
        },
      });

      await tx.documentApproval.create({
        data: {
          documentRequestId: id,
          level: current.currentLevel || 0,
          action: DocumentApprovalAction.CANCEL,
          oldStatus: current.status,
          newStatus: DocumentRequestStatus.CANCELLED,
          reason: this.optionalTrim(dto.reason),
          note: this.optionalTrim(dto.note),
          actedById: actorId,
        },
      });
    });

    await this.notifyDocumentSafely('ปิดแจ้งเตือนคำขอเอกสารที่ถูกยกเลิก', () =>
      this.notificationsService.closeDocumentPendingNotifications(id),
    );

    return this.findDocumentRequest(id);
  }

  async removeDocumentRequest(id: string, scope: TenantScope) {
    const current = await this.prisma.documentRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status === DocumentRequestStatus.APPROVED) {
      throw new BadRequestException('ไม่สามารถลบคำขอที่อนุมัติแล้ว');
    }

    await this.prisma.documentRequest.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.notifyDocumentSafely('ปิดแจ้งเตือนคำขอเอกสารที่ถูกลบ', () =>
      this.notificationsService.closeDocumentPendingNotifications(id),
    );

    return {
      id,
      deleted: true,
    };
  }

  findDocumentPresets() {
    return [
      {
        code: 'WORK_CERTIFICATE',
        nameTh: 'หนังสือรับรองการทำงาน',
        category: 'CERTIFICATE',
        endpoint: '/api/documents/presets/work-certificate',
        description: 'ใช้ยื่นคำขอหนังสือรับรองการทำงาน',
      },
      {
        code: 'SALARY_CERTIFICATE',
        nameTh: 'หนังสือรับรองเงินเดือน',
        category: 'CERTIFICATE',
        endpoint: '/api/documents/presets/salary-certificate',
        description: 'ใช้ยื่นคำขอหนังสือรับรองเงินเดือน',
      },
      {
        code: 'VISA_CERTIFICATE',
        nameTh: 'หนังสือรับรองเพื่อประกอบการขอวีซ่า',
        category: 'CERTIFICATE',
        endpoint: '/api/documents/presets/visa-certificate',
        description: 'ใช้ยื่นคำขอเอกสารประกอบการขอวีซ่า',
      },
      {
        code: 'RESIGN_DOCUMENT',
        nameTh: 'เอกสารลาออก',
        category: 'RESIGNATION',
        endpoint: '/api/documents/presets/resign-document',
        description: 'ใช้ยื่นเอกสารลาออกและเข้าสู่กระบวนการอนุมัติ',
      },
    ];
  }

  async createWorkCertificateRequest(
    dto: CreateWorkCertificateRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    return this.createPresetDocumentRequest(
      'WORK_CERTIFICATE',
      {
        companyId: dto.companyId,
        employeeId: dto.employeeId,
        title: 'ขอหนังสือรับรองการทำงาน',
        purpose: dto.purpose || 'ขอหนังสือรับรองการทำงาน',
        requestData: {
          documentKind: 'WORK_CERTIFICATE',
          issueTo: dto.issueTo ?? null,
          language: dto.language ?? 'TH',
          ...(dto.extraData ?? {}),
        },
        note: null,
        submit: dto.submit,
      },
      currentUser,
      scope,
    );
  }

  async createSalaryCertificateRequest(
    dto: CreateSalaryCertificateRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    return this.createPresetDocumentRequest(
      'SALARY_CERTIFICATE',
      {
        companyId: dto.companyId,
        employeeId: dto.employeeId,
        title: 'ขอหนังสือรับรองเงินเดือน',
        purpose: dto.purpose || 'ขอหนังสือรับรองเงินเดือน',
        requestData: {
          documentKind: 'SALARY_CERTIFICATE',
          issueTo: dto.issueTo ?? null,
          language: dto.language ?? 'TH',
          salaryDisplayMode: dto.salaryDisplayMode ?? 'MONTHLY_ONLY',
          ...(dto.extraData ?? {}),
        },
        note: null,
        submit: dto.submit,
      },
      currentUser,
      scope,
    );
  }

  async createVisaCertificateRequest(
    dto: CreateVisaCertificateRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    return this.createPresetDocumentRequest(
      'VISA_CERTIFICATE',
      {
        companyId: dto.companyId,
        employeeId: dto.employeeId,
        title: 'ขอหนังสือรับรองเพื่อประกอบการขอวีซ่า',
        purpose: dto.purpose || 'ใช้ประกอบการขอวีซ่า',
        requestData: {
          documentKind: 'VISA_CERTIFICATE',
          embassyName: dto.embassyName ?? null,
          country: dto.country ?? null,
          travelDateFrom: dto.travelDateFrom ?? null,
          travelDateTo: dto.travelDateTo ?? null,
          language: dto.language ?? 'TH_EN',
          ...(dto.extraData ?? {}),
        },
        note: null,
        submit: dto.submit,
      },
      currentUser,
      scope,
    );
  }

  async createResignDocumentRequest(
    dto: CreateResignDocumentRequestDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const effectiveDate = this.parseDateTime(`${dto.effectiveDate}T00:00:00.000+07:00`);

    return this.createPresetDocumentRequest(
      'RESIGN_DOCUMENT',
      {
        companyId: dto.companyId,
        employeeId: dto.employeeId,
        title: 'ยื่นเอกสารลาออก',
        purpose: 'ยื่นเอกสารลาออก',
        requestData: {
          documentKind: 'RESIGN_DOCUMENT',
          effectiveDate: effectiveDate.toISOString(),
          reason: dto.reason,
          handoverNote: dto.handoverNote ?? null,
          assetReturnNote: dto.assetReturnNote ?? null,
          ...(dto.extraData ?? {}),
        },
        note: dto.reason,
        submit: dto.submit,
      },
      currentUser,
      scope,
    );
  }

  async uploadDocumentFile(
    documentRequestId: string,
    dto: UploadDocumentFileDto,
    file: Express.Multer.File,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      try {
        await this.assertDocumentRequestWithinScope(documentRequestId, scope);
      } catch (error) {
        await this.safelyDeleteUploadedFile(file.path);
        throw error;
      }
    }

    const actorId = this.getActorId(currentUser);

    const title = dto.title?.trim();

    if (!title) {
      await this.safelyDeleteUploadedFile(file.path);
      throw new BadRequestException('กรุณาระบุชื่อไฟล์แนบ');
    }

    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!request) {
      await this.safelyDeleteUploadedFile(file.path);
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    if (
      request.status === DocumentRequestStatus.APPROVED ||
      request.status === DocumentRequestStatus.REJECTED ||
      request.status === DocumentRequestStatus.CANCELLED
    ) {
      await this.safelyDeleteUploadedFile(file.path);
      throw new BadRequestException(
        'แนบไฟล์ได้เฉพาะคำขอเอกสารสถานะร่างหรือรออนุมัติเท่านั้น',
      );
    }

    return this.persistDocumentFile({
      documentRequestId: request.id,
      fileType: DocumentFileType.ATTACHMENT,
      title,
      description: this.optionalTrim(dto.description),
      file,
      actorId,
    });
  }

  /**
   * หนังสือฉบับที่ลงนามและประทับตราแล้ว (สแกนกลับเข้าระบบ)
   * ใช้ได้เฉพาะหลังอนุมัติ เพราะเป็นเอกสารทางการที่ส่งมอบให้พนักงานจริง
   */
  async uploadSignedDocumentFile(
    documentRequestId: string,
    dto: UploadDocumentFileDto,
    file: Express.Multer.File,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      try {
        await this.assertDocumentRequestWithinScope(documentRequestId, scope);
      } catch (error) {
        await this.safelyDeleteUploadedFile(file.path);
        throw error;
      }
    }

    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.documentRequest.findFirst({
      where: { id: documentRequestId, deletedAt: null },
      select: { id: true, status: true, documentNo: true, requestNo: true },
    });

    if (!request) {
      await this.safelyDeleteUploadedFile(file.path);
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    if (request.status !== DocumentRequestStatus.APPROVED) {
      await this.safelyDeleteUploadedFile(file.path);
      throw new BadRequestException(
        'อัปโหลดหนังสือฉบับลงนามได้เฉพาะคำขอที่อนุมัติแล้วเท่านั้น',
      );
    }

    return this.persistDocumentFile({
      documentRequestId: request.id,
      fileType: DocumentFileType.SIGNED_DOCUMENT,
      title:
        dto.title?.trim() ||
        `หนังสือฉบับลงนาม ${request.documentNo ?? request.requestNo}`,
      description: this.optionalTrim(dto.description),
      file,
      actorId,
    });
  }

  /** ESS: พนักงานแนบเอกสารประกอบคำขอของตัวเอง */
  async uploadEssDocumentFile(
    documentRequestId: string,
    dto: UploadDocumentFileDto,
    file: Express.Multer.File,
    currentUser: CurrentUserLike,
  ) {
    try {
      await this.ensureEssDocumentRequestOwner(documentRequestId, currentUser);
    } catch (error) {
      await this.safelyDeleteUploadedFile(file.path);
      throw error;
    }

    return this.uploadDocumentFile(documentRequestId, dto, file, currentUser);
  }

  /** ESS: ลบเฉพาะไฟล์ที่ตัวเองแนบ และเฉพาะตอนยังแก้ไขได้ */
  async removeEssDocumentFile(
    documentRequestId: string,
    fileId: string,
    currentUser: CurrentUserLike,
  ) {
    await this.ensureEssDocumentRequestOwner(documentRequestId, currentUser);
    return this.removeDocumentFile(documentRequestId, fileId);
  }

  private async persistDocumentFile(params: {
    documentRequestId: string;
    fileType: DocumentFileType;
    title: string;
    description?: string | null;
    file: Express.Multer.File;
    actorId: string;
  }) {
    const storageKey = createDocumentFileStorageKey({
      documentRequestId: params.documentRequestId,
      filename: params.file.filename,
    });

    return this.prisma.documentFile.create({
      data: {
        documentRequestId: params.documentRequestId,
        fileType: params.fileType,
        title: params.title,
        description: params.description,
        fileName: params.file.originalname,
        fileSize: params.file.size,
        mimeType: params.file.mimetype,
        storageProvider: DOCUMENT_FILE_STORAGE_PROVIDER,
        storageKey,
        bucketName: DOCUMENT_FILE_BUCKET,
        uploadedById: params.actorId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });
  }

  async getDocumentFileForDownload(
    documentRequestId: string,
    fileId: string,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(documentRequestId, scope);
    }

    await this.ensureDocumentRequestExists(documentRequestId);

    const documentFile = await this.prisma.documentFile.findFirst({
      where: {
        id: fileId,
        documentRequestId,
        deletedAt: null,
      },
    });

    if (!documentFile) {
      throw new NotFoundException('ไม่พบไฟล์เอกสาร');
    }

    if (documentFile.storageProvider !== DOCUMENT_FILE_STORAGE_PROVIDER) {
      throw new BadRequestException('Storage provider นี้ยังไม่รองรับ');
    }

    const filePath = getDocumentFileAbsolutePath(documentFile.storageKey);

    let fileStat: Awaited<ReturnType<typeof stat>>;

    try {
      fileStat = await stat(filePath);
    } catch {
      throw new NotFoundException('ไม่พบไฟล์เอกสารใน storage');
    }

    if (!fileStat.isFile()) {
      throw new NotFoundException('ไม่พบไฟล์เอกสารใน storage');
    }

    return {
      filePath,
      fileName: documentFile.fileName,
      mimeType: documentFile.mimeType || 'application/octet-stream',
      size: fileStat.size,
    };
  }

  async removeDocumentFile(
    documentRequestId: string,
    fileId: string,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(documentRequestId, scope);
    }

    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    if (request.status === DocumentRequestStatus.APPROVED) {
      throw new BadRequestException('ไม่สามารถลบไฟล์ของคำขอที่อนุมัติแล้ว');
    }

    const documentFile = await this.prisma.documentFile.findFirst({
      where: {
        id: fileId,
        documentRequestId,
        deletedAt: null,
      },
    });

    if (!documentFile) {
      throw new NotFoundException('ไม่พบไฟล์เอกสาร');
    }

    if (documentFile.fileType === DocumentFileType.GENERATED_PDF) {
      throw new BadRequestException(
        'ไม่สามารถลบไฟล์ PDF ที่สร้างจากระบบผ่าน endpoint นี้',
      );
    }

    await this.prisma.documentFile.update({
      where: {
        id: documentFile.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (documentFile.storageProvider === DOCUMENT_FILE_STORAGE_PROVIDER) {
      const filePath = getDocumentFileAbsolutePath(documentFile.storageKey);
      await this.safelyDeleteUploadedFile(filePath);
    }

    return {
      id: fileId,
      deleted: true,
    };
  }

  async findComplaints(query: ListComplaintsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ComplaintWhereInput = {
      deletedAt: null,
    };

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) {
      where.companyId = scopedCompanyId;
    }

    // เช่นเดียวกับคำขอเอกสาร — สาขาที่เลือกใส่ก่อน แล้ว scope ทับทีหลัง
    const complaintEmployeeWhere: Prisma.EmployeeWhereInput = {};

    if (scope.level !== 'BRANCH' && query.branchId) {
      complaintEmployeeWhere.branchId = query.branchId;
    }

    Object.assign(
      complaintEmployeeWhere,
      tenantWhere(scope) as Prisma.EmployeeWhereInput,
    );

    if (Object.keys(complaintEmployeeWhere).length > 0) {
      where.employee = { is: complaintEmployeeWhere };
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      where.submittedAt = {};

      if (query.dateFrom) {
        where.submittedAt.gte = this.parseDateTime(
          `${query.dateFrom}T00:00:00.000+07:00`,
        );
      }

      if (query.dateTo) {
        where.submittedAt.lte = this.parseDateTime(
          `${query.dateTo}T23:59:59.999+07:00`,
        );
      }
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        {
          complaintNo: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          category: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          employee: {
            employeeCode: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            firstName: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            lastName: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            nickname: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.complaint.findMany({
        where,
        include: this.complaintInclude(),
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
      }),
      this.prisma.complaint.count({ where }),
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

  async findComplaint(id: string, scope?: TenantScope) {
    if (scope) {
      await this.assertComplaintWithinScope(id, scope);
    }

    const item = await this.prisma.complaint.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.complaintInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบเรื่องร้องเรียน');
    }

    return item;
  }

  async createComplaint(
    dto: CreateComplaintDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(
      dto.employeeId,
      actorId,
    );

    // non-GLOBAL: ล็อกบริษัทเป็นของผู้ใช้เสมอ
    const companyId =
      scope.level === 'GLOBAL'
        ? (dto.companyId ?? employee?.companyId)
        : scope.companyId;

    if (!companyId) {
      throw new BadRequestException(
        'กรุณาระบุบริษัท หรือผูกบัญชีผู้ใช้กับข้อมูลพนักงานก่อนยื่นเรื่อง',
      );
    }

    await this.ensureCompanyExists(companyId);

    if (employee) {
      assertWithinScope(scope, {
        companyId: employee.companyId,
        branchId: employee.branchId,
      });
    }

    if (employee && employee.companyId !== companyId) {
      throw new BadRequestException('บริษัทของพนักงานไม่ตรงกับบริษัทที่เลือก');
    }

    const complaintNo = await this.generateComplaintNo();

    const created = await this.prisma.complaint.create({
      data: {
        complaintNo,
        companyId,
        employeeId: employee?.id ?? null,
        title: dto.title.trim(),
        category: this.optionalTrim(dto.category),
        description: dto.description.trim(),
        expectation: this.optionalTrim(dto.expectation),
        note: this.optionalTrim(dto.note),
        status: ComplaintStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedById: actorId,
      },
    });

    return this.findComplaint(created.id);
  }

  async updateComplaint(
    id: string,
    dto: UpdateComplaintDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.complaint.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบเรื่องร้องเรียน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (
      current.status === ComplaintStatus.CLOSED ||
      current.status === ComplaintStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'ไม่สามารถแก้ไขเรื่องร้องเรียนที่ปิดหรือยกเลิกแล้ว',
      );
    }

    await this.prisma.complaint.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.category !== undefined
          ? { category: this.optionalTrim(dto.category) }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.expectation !== undefined
          ? { expectation: this.optionalTrim(dto.expectation) }
          : {}),
        ...(dto.note !== undefined
          ? { note: this.optionalTrim(dto.note) }
          : {}),
      },
    });

    return this.findComplaint(id);
  }

  async processComplaint(
    id: string,
    dto: ComplaintActionDto,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertComplaintWithinScope(id, scope);
    }

    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentComplaintRaw(id);

    if (current.status !== ComplaintStatus.SUBMITTED) {
      throw new BadRequestException(
        'รับเรื่องได้เฉพาะเรื่องร้องเรียนที่เพิ่งยื่นเท่านั้น',
      );
    }

    await this.prisma.complaint.update({
      where: { id },
      data: {
        status: ComplaintStatus.IN_PROGRESS,
        handledAt: new Date(),
        handledById: actorId,
        note: this.mergeNote(current.note, dto.note),
      },
    });

    return this.findComplaint(id);
  }

  async resolveComplaint(
    id: string,
    dto: ComplaintActionDto,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertComplaintWithinScope(id, scope);
    }

    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentComplaintRaw(id);

    if (
      current.status !== ComplaintStatus.SUBMITTED &&
      current.status !== ComplaintStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'บันทึกผลได้เฉพาะเรื่องที่ยังอยู่ระหว่างดำเนินการ',
      );
    }

    await this.prisma.complaint.update({
      where: { id },
      data: {
        status: ComplaintStatus.RESOLVED,
        handledAt: current.handledAt ?? new Date(),
        handledById: current.handledById ?? actorId,
        note: this.mergeNote(current.note, dto.note),
      },
    });

    return this.findComplaint(id);
  }

  async closeComplaint(
    id: string,
    dto: ComplaintActionDto,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertComplaintWithinScope(id, scope);
    }

    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentComplaintRaw(id);

    if (current.status !== ComplaintStatus.RESOLVED) {
      throw new BadRequestException(
        'ปิดเรื่องได้เฉพาะเรื่องร้องเรียนที่ดำเนินการเสร็จแล้ว',
      );
    }

    await this.prisma.complaint.update({
      where: { id },
      data: {
        status: ComplaintStatus.CLOSED,
        closedAt: new Date(),
        handledById: current.handledById ?? actorId,
        note: this.mergeNote(current.note, dto.note),
      },
    });

    return this.findComplaint(id);
  }

  async cancelComplaint(
    id: string,
    dto: ComplaintActionDto,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertComplaintWithinScope(id, scope);
    }

    const actorId = this.getActorId(currentUser);
    const current = await this.findCurrentComplaintRaw(id);

    if (
      current.status === ComplaintStatus.CLOSED ||
      current.status === ComplaintStatus.CANCELLED
    ) {
      throw new BadRequestException('เรื่องร้องเรียนนี้ถูกปิดหรือยกเลิกแล้ว');
    }

    await this.prisma.complaint.update({
      where: { id },
      data: {
        status: ComplaintStatus.CANCELLED,
        cancelledAt: new Date(),
        handledById: current.handledById ?? actorId,
        note: this.mergeNote(current.note, dto.note),
      },
    });

    return this.findComplaint(id);
  }

  async removeComplaint(id: string, scope: TenantScope) {
    const current = await this.prisma.complaint.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบเรื่องร้องเรียน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== ComplaintStatus.CANCELLED) {
      throw new BadRequestException(
        'ลบได้เฉพาะเรื่องร้องเรียนที่ยกเลิกแล้วเท่านั้น',
      );
    }

    await this.prisma.complaint.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      id,
      deleted: true,
    };
  }

  /* ==================================================================
   * ESS: เรื่องร้องเรียนของตนเอง
   * ผู้ยื่นต้องติดตามสถานะเรื่องของตัวเองได้ แต่ต้องไม่เห็นของคนอื่น
   * ทุก method ผูก employeeId จากบัญชีผู้ใช้เสมอ ไม่รับค่าจาก client
   * ================================================================== */

  async findEssComplaints(
    query: ListComplaintsQueryDto,
    currentUser: CurrentUserLike,
  ) {
    const employee = await this.resolveEssEmployeeOrFail(
      currentUser,
      'ดูเรื่องร้องเรียน',
    );

    return this.findComplaints(
      {
        ...query,
        employeeId: employee.id,
        companyId: employee.companyId,
      },
      { level: 'COMPANY', companyId: employee.companyId, branchId: null },
    );
  }

  async findEssComplaint(id: string, currentUser: CurrentUserLike) {
    await this.ensureEssComplaintOwner(id, currentUser);
    return this.findComplaint(id);
  }

  async createEssComplaint(
    dto: CreateComplaintDto,
    currentUser: CurrentUserLike,
  ) {
    const employee = await this.resolveEssEmployeeOrFail(
      currentUser,
      'ยื่นเรื่องร้องเรียน',
    );

    // ยื่นในนามตัวเองเท่านั้น — ทับ employeeId/companyId ที่ client ส่งมาเสมอ
    return this.createComplaint(
      {
        ...dto,
        companyId: employee.companyId,
        employeeId: employee.id,
      },
      currentUser,
      { level: 'COMPANY', companyId: employee.companyId, branchId: null },
    );
  }

  async cancelEssComplaint(
    id: string,
    dto: ComplaintActionDto,
    currentUser: CurrentUserLike,
  ) {
    const complaint = await this.ensureEssComplaintOwner(id, currentUser);

    if (complaint.status !== ComplaintStatus.SUBMITTED) {
      throw new BadRequestException(
        'ถอนเรื่องได้เฉพาะเรื่องที่ยังไม่ถูกรับเข้ากระบวนการเท่านั้น',
      );
    }

    return this.cancelComplaint(id, dto, currentUser);
  }

  private async resolveEssEmployeeOrFail(
    currentUser: CurrentUserLike,
    action: string,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(undefined, actorId);

    if (!employee?.id) {
      throw new BadRequestException(
        `บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถ${action}ได้`,
      );
    }

    return employee;
  }

  private async ensureEssComplaintOwner(
    complaintId: string,
    currentUser: CurrentUserLike,
  ) {
    const employee = await this.resolveEssEmployeeOrFail(
      currentUser,
      'เข้าถึงเรื่องร้องเรียน',
    );

    const complaint = await this.prisma.complaint.findFirst({
      where: {
        id: complaintId,
        employeeId: employee.id,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!complaint) {
      throw new NotFoundException(
        'ไม่พบเรื่องร้องเรียนของคุณ หรือไม่มีสิทธิ์เข้าถึงรายการนี้',
      );
    }

    return complaint;
  }

  async findDocumentTemplates(
    query: ListDocumentTemplatesQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DocumentTemplateWhereInput = {
      deletedAt: null,
    };

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) {
      where.companyId = scopedCompanyId;
    }

    if (query.documentTypeId) {
      where.documentTypeId = query.documentTypeId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        {
          code: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.documentTemplate.findMany({
        where,
        include: this.documentTemplateInclude(),
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
      }),
      this.prisma.documentTemplate.count({ where }),
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

  async findDocumentTemplate(id: string) {
    const item = await this.prisma.documentTemplate.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.documentTemplateInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบ Template เอกสาร');
    }

    return item;
  }

  async createDocumentTemplate(
    dto: CreateDocumentTemplateDto,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);

    const companyId = this.resolveDocCompanyId(scope, dto.companyId);
    await this.ensureCompanyExists(companyId);

    if (dto.documentTypeId) {
      await this.ensureDocumentTypeExists(dto.documentTypeId);
    }

    await this.ensureDocumentTemplateCodeAvailable({
      companyId,
      code: dto.code,
    });

    const created = await this.prisma.documentTemplate.create({
      data: {
        companyId,
        documentTypeId: dto.documentTypeId || null,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: this.optionalTrim(dto.description),
        htmlContent:
          dto.htmlContent === undefined
            ? this.getDefaultTemplateHtml()
            : this.optionalTrim(dto.htmlContent),
        config:
          dto.config === undefined
            ? undefined
            : (dto.config as Prisma.InputJsonValue),
        version: 1,
        status: dto.status ?? MasterStatus.ACTIVE,
        createdById: actorId,
      },
    });

    return this.findDocumentTemplate(created.id);
  }

  async updateDocumentTemplate(
    id: string,
    dto: UpdateDocumentTemplateDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.documentTemplate.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบ Template เอกสาร');
    }

    this.assertDocManageScope(scope, current.companyId);

    if (dto.documentTypeId !== undefined && dto.documentTypeId) {
      await this.ensureDocumentTypeExists(dto.documentTypeId);
    }

    if (dto.code !== undefined) {
      await this.ensureDocumentTemplateCodeAvailable({
        companyId: current.companyId,
        code: dto.code,
        excludeId: id,
      });
    }

    await this.prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(dto.documentTypeId !== undefined
          ? { documentTypeId: dto.documentTypeId || null }
          : {}),
        ...(dto.code !== undefined
          ? { code: dto.code.trim().toUpperCase() }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: this.optionalTrim(dto.description) }
          : {}),
        ...(dto.htmlContent !== undefined
          ? { htmlContent: this.optionalTrim(dto.htmlContent) }
          : {}),
        ...(dto.config !== undefined
          ? { config: dto.config as Prisma.InputJsonValue }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        version: {
          increment: 1,
        },
      },
    });

    return this.findDocumentTemplate(id);
  }

  async removeDocumentTemplate(id: string, scope: TenantScope) {
    const current = await this.prisma.documentTemplate.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบ Template เอกสาร');
    }

    this.assertDocManageScope(scope, current.companyId);

    await this.prisma.documentTemplate.update({
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

  async renderDocumentRequest(
    documentRequestId: string,
    query: RenderDocumentTemplateQueryDto,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(documentRequestId, scope);
    }

    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        deletedAt: null,
      },
      include: this.documentRequestInclude(),
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    if (request.status !== DocumentRequestStatus.APPROVED) {
      throw new BadRequestException(
        'Render เอกสารได้เฉพาะคำขอที่อนุมัติแล้วเท่านั้น',
      );
    }

    const template = await this.resolveTemplateForRequest(
      request.id,
      query.templateId,
    );

    const { tokens: extraTokens, rawTokens } =
      await this.buildDocumentRenderTokens(request.id, template.config);

    const html = this.renderTemplateContent(
      template.htmlContent,
      request,
      extraTokens,
      rawTokens,
    );

    return {
      requestId: request.id,
      requestNo: request.requestNo,
      templateId: template.id,
      templateCode: template.code,
      templateName: template.name,
      html,
    };
  }

  async generateDocumentPdf(
    documentRequestId: string,
    dto: GenerateDocumentPdfDto,
    currentUser: CurrentUserLike,
    scope?: TenantScope,
  ) {
    if (scope) {
      await this.assertDocumentRequestWithinScope(documentRequestId, scope);
    }

    const actorId = this.getActorId(currentUser);

    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        deletedAt: null,
      },
      include: this.documentRequestInclude(),
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    if (request.status !== DocumentRequestStatus.APPROVED) {
      throw new BadRequestException(
        'สร้าง PDF ได้เฉพาะคำขอเอกสารที่อนุมัติแล้วเท่านั้น',
      );
    }

    const template = await this.resolveTemplateForRequest(
      request.id,
      dto.templateId,
    );

    const { tokens: extraTokens, rawTokens } =
      await this.buildDocumentRenderTokens(request.id, template.config);

    const html = this.renderTemplateContent(
      template.htmlContent,
      request,
      extraTokens,
      rawTokens,
    );

    const pdfBuffer = await this.renderHtmlToPdfBuffer(html);

    const storageDir = ensureDocumentFileStorageDir(request.id);
    const generatedFileName = createDocumentFileName(
      `${request.requestNo || request.id}.pdf`,
    );

    const storageKey = createDocumentFileStorageKey({
      documentRequestId: request.id,
      filename: generatedFileName,
    });

    const filePath = getDocumentFileAbsolutePath(storageKey);

    if (!filePath.startsWith(storageDir)) {
      throw new BadRequestException('Storage path ไม่ถูกต้อง');
    }

    await writeFile(filePath, pdfBuffer);

    const documentFile = await this.prisma.documentFile.create({
      data: {
        documentRequestId: request.id,
        fileType: DocumentFileType.GENERATED_PDF,
        title:
          dto.title?.trim() ||
          `PDF - ${request.title || request.documentType?.nameTh || request.requestNo}`,
        description: `สร้างจาก Template: ${template.name}`,
        fileName: `${request.requestNo}.pdf`,
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
        storageProvider: DOCUMENT_FILE_STORAGE_PROVIDER,
        storageKey,
        bucketName: DOCUMENT_FILE_BUCKET,
        uploadedById: actorId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    return documentFile;
  }

  /**
   * คำขอเอกสารผูกกับ companyId ของตัวเอง และสาขาผ่าน employee
   * endpoint ที่รับ id ตรง ๆ ต้องเช็คซ้ำ ไม่งั้นเดา id แล้วอ่านข้ามสาขา/บริษัทได้
   */
  private async assertDocumentRequestWithinScope(
    documentRequestId: string,
    scope: TenantScope,
  ) {
    if (scope.level === 'GLOBAL') return;

    const request = await this.prisma.documentRequest.findFirst({
      where: { id: documentRequestId, deletedAt: null },
      select: {
        companyId: true,
        employee: { select: { branchId: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    assertWithinScope(scope, {
      companyId: request.companyId,
      branchId: request.employee?.branchId ?? null,
    });
  }

  private async assertComplaintWithinScope(
    complaintId: string,
    scope: TenantScope,
  ) {
    if (scope.level === 'GLOBAL') return;

    const complaint = await this.prisma.complaint.findFirst({
      where: { id: complaintId, deletedAt: null },
      select: {
        companyId: true,
        employee: { select: { branchId: true } },
      },
    });

    if (!complaint) {
      throw new NotFoundException('ไม่พบเรื่องร้องเรียน');
    }

    assertWithinScope(scope, {
      companyId: complaint.companyId,
      branchId: complaint.employee?.branchId ?? null,
    });
  }

  private documentRequestInclude() {
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
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          // ใช้แสดงว่าผู้ขออยู่บริษัท/สาขาไหน เวลา HR ดูข้ามหลายบริษัท
          branch: {
            select: {
              id: true,
              nameTh: true,
            },
          },
        },
      },
      documentType: true,
      submittedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      rejectedBy: {
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
      approvals: {
        orderBy: {
          createdAt: 'asc' as const,
        },
        include: {
          actedBy: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
      },
      files: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
      },
    };
  }

  private async createPresetDocumentRequest(
    documentTypeCode: string,
    dto: Omit<CreateDocumentRequestDto, 'documentTypeId'>,
    currentUser: CurrentUserLike,
    scope: TenantScope,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(dto.employeeId, actorId);

    // non-GLOBAL: ล็อกบริษัทเป็นของผู้ใช้เสมอ
    const companyId =
      scope.level === 'GLOBAL'
        ? (dto.companyId ?? employee?.companyId)
        : scope.companyId;

    if (!companyId) {
      throw new BadRequestException(
        'กรุณาระบุบริษัท หรือผูกบัญชีผู้ใช้กับข้อมูลพนักงานก่อนยื่นเอกสาร',
      );
    }

    await this.ensureCompanyExists(companyId);

    if (employee) {
      assertWithinScope(scope, {
        companyId: employee.companyId,
        branchId: employee.branchId,
      });
    }

    if (employee && employee.companyId !== companyId) {
      throw new BadRequestException('บริษัทของพนักงานไม่ตรงกับบริษัทที่เลือก');
    }

    const documentType = await this.ensureActiveDocumentTypeByCode(
      documentTypeCode,
      companyId,
    );

    return this.createDocumentRequest(
      {
        companyId,
        employeeId: employee?.id ?? null,
        documentTypeId: documentType.id,
        title: dto.title,
        purpose: dto.purpose,
        requestData: dto.requestData,
        note: dto.note,
        submit: dto.submit,
      },
      currentUser,
      scope,
    );
  }

  private async ensureActiveDocumentTypeByCode(code: string, companyId: string) {
    const documentType = await this.prisma.documentType.findFirst({
      where: {
        code,
        deletedAt: null,
        status: MasterStatus.ACTIVE,
        OR: [
          {
            companyId,
          },
          {
            companyId: null,
          },
        ],
      },
      orderBy: {
        companyId: 'desc',
      },
    });

    if (!documentType) {
      throw new NotFoundException(
        `ไม่พบประเภทเอกสาร ${code} กรุณารัน seed document types ก่อน`,
      );
    }

    return documentType;
  }

  private async ensureCompanyExists(companyId?: string | null) {
    if (!companyId) {
      return null;
    }

    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
        status: MasterStatus.ACTIVE,
      },
    });

    if (!company) {
      throw new NotFoundException('ไม่พบบริษัท หรือบริษัทไม่พร้อมใช้งาน');
    }

    return company;
  }

  private async ensureDocumentTypeCodeAvailable(params: {
    companyId?: string | null;
    code: string;
    excludeId?: string;
  }) {
    const code = params.code.trim().toUpperCase();

    const existing = await this.prisma.documentType.findFirst({
      where: {
        companyId: params.companyId ?? null,
        code,
        deletedAt: null,
        ...(params.excludeId
          ? {
              id: {
                not: params.excludeId,
              },
            }
          : {}),
      },
    });

    if (existing) {
      throw new ConflictException('รหัสประเภทเอกสารนี้ถูกใช้งานแล้ว');
    }
  }


  private async ensureEssDocumentRequestOwner(
    documentRequestId: string,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(undefined, actorId);

    if (!employee?.id) {
      throw new BadRequestException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถเข้าถึงคำขอเอกสาร ESS ได้',
      );
    }

    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        employeeId: employee.id,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!request) {
      throw new NotFoundException(
        'ไม่พบคำขอเอกสารของคุณ หรือไม่มีสิทธิ์เข้าถึงรายการนี้',
      );
    }

    return request;
  }

  private async ensureMobileEmployeeRequestableDocumentType(
    id: string,
    currentUser: CurrentUserLike,
  ) {
    const actorId = this.getActorId(currentUser);
    const employee = await this.resolveOptionalEmployee(undefined, actorId);

    if (!employee?.companyId) {
      throw new BadRequestException(
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน จึงไม่สามารถยื่นคำขอเอกสาร Mobile ได้',
      );
    }

    const documentType = await this.prisma.documentType.findFirst({
      where: {
        id,
        allowEmployeeRequest: true,
        deletedAt: null,
        status: MasterStatus.ACTIVE,
        OR: [{ companyId: employee.companyId }, { companyId: null }],
      },
      select: { id: true },
    });

    if (!documentType) {
      throw new NotFoundException(
        'ไม่พบประเภทเอกสารที่พนักงานสามารถยื่นผ่านแอปได้',
      );
    }

    return documentType;
  }

  private async ensureActiveDocumentType(id: string, companyId: string) {
    const documentType = await this.prisma.documentType.findFirst({
      where: {
        id,
        deletedAt: null,
        status: MasterStatus.ACTIVE,
        OR: [
          {
            companyId,
          },
          {
            companyId: null,
          },
        ],
      },
    });

    if (!documentType) {
      throw new NotFoundException(
        'ไม่พบประเภทเอกสาร หรือประเภทเอกสารไม่พร้อมใช้งานกับบริษัทนี้',
      );
    }

    return documentType;
  }

  private async resolveOptionalEmployee(
    employeeId: string | null | undefined,
    actorId: string,
  ) {
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          deletedAt: null,
          status: {
            notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'],
          },
        },
      });

      if (!employee) {
        throw new NotFoundException('ไม่พบพนักงาน หรือพนักงานไม่พร้อมใช้งาน');
      }

      return employee;
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: actorId,
        deletedAt: null,
        status: {
          notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'],
        },
      },
    });

    return employee;
  }

/**
   * กันอนุมัติคำขอเอกสารของตัวเอง
   *
   * เส้นทางนี้ไม่ได้ใช้สายอนุมัติกลาง (ApprovalMatrix) แต่คุมด้วยสิทธิ์
   * `DOCUMENT_APPROVE` อย่างเดียว ซึ่งทั้ง HR และหัวหน้างานมีอยู่แล้ว
   * คนที่ยื่นคำขอเอกสารของตัวเองจึงกดอนุมัติเองได้ทันที
   *
   * เอกสารที่ออกจากระบบนี้คือหนังสือรับรองเงินเดือน หนังสือรับรองการทำงาน
   * ซึ่งใช้อ้างอิงกับธนาคารและหน่วยงานภายนอก การอนุมัติเองจึงเป็นเรื่องใหญ่
   */
  private async assertNotOwnDocumentRequest(
    request: { employeeId: string | null; submittedById: string | null },
    actorId: string,
  ) {
    if (request.submittedById && request.submittedById === actorId) {
      throw new BadRequestException(
        'ไม่สามารถอนุมัติหรือไม่อนุมัติคำขอเอกสารที่ตนเองยื่นได้',
      );
    }

    if (!request.employeeId) return;

    const actorEmployee = await this.prisma.employee.findFirst({
      where: { userId: actorId, deletedAt: null },
      select: { id: true },
    });

    if (actorEmployee && actorEmployee.id === request.employeeId) {
      throw new BadRequestException(
        'ไม่สามารถอนุมัติหรือไม่อนุมัติคำขอเอกสารของตนเองได้',
      );
    }
  }

  private async findCurrentDocumentRequestRaw(id: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        documentType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    return request;
  }

  private async notifyDocumentSafely(
    actionDescription: string,
    callback: () => Promise<unknown>,
  ) {
    try {
      await callback();
    } catch (error) {
      console.error(
        `[DocumentWorkflowNotification] ${actionDescription} ไม่สำเร็จ`,
        error,
      );
    }
  }

  private getActorId(currentUser: CurrentUserLike) {
    const actorId = currentUser.userId ?? currentUser.id;

    if (!actorId) {
      throw new BadRequestException('ไม่พบข้อมูลผู้ใช้งานปัจจุบัน');
    }

    return actorId;
  }

  private parseDateTime(value: string | Date) {
    if (value instanceof Date) {
      return value;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('รูปแบบวันที่ไม่ถูกต้อง');
    }

    return date;
  }

  /**
   * เลขคำขอต้องไม่ชนกัน แม้ HR กดสร้างพร้อมกันหลายคน
   * เดิมใช้ count() ของวันนั้น +1 ซึ่งพังสองทาง:
   *   1) สร้างพร้อมกัน 2 request ได้เลขเดียวกัน → ชน @unique → 500
   *   2) ถ้ามีเรคคอร์ดถูกลบถาวร count จะย้อนกลับไปทับเลขเดิม
   * จึงอ่านเลขล่าสุดของ prefix แล้ว +1 พร้อม retry เมื่อชนจริง
   */
  private async createDocumentRequestWithUniqueNo(data: {
    companyId: string;
    employeeId: string | null;
    documentTypeId: string;
    title: string;
    purpose?: string | null;
    requestData?: Prisma.InputJsonValue;
    note?: string | null;
  }) {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const requestNo = await this.generateDocumentRequestNo();

      try {
        return await this.prisma.documentRequest.create({
          data: {
            ...data,
            requestNo,
            status: DocumentRequestStatus.DRAFT,
            currentLevel: 0,
          },
        });
      } catch (error) {
        const isDuplicateRequestNo =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          String(error.meta?.target ?? '').includes('requestNo');

        if (!isDuplicateRequestNo || attempt === maxAttempts) {
          throw error;
        }
      }
    }

    throw new ConflictException(
      'ไม่สามารถออกเลขคำขอเอกสารได้ กรุณาลองใหม่อีกครั้ง',
    );
  }

  /**
   * เลขที่หนังสือ: {รหัสบริษัท}-{ปี}-{ลำดับ 4 หลัก} เช่น TJC-2026-0001
   * เดินลำดับแยกตามบริษัทและปี ตามแบบทะเบียนหนังสือออก
   * ออกเฉพาะตอนอนุมัติ คำขอที่ถูกปฏิเสธ/ยกเลิกจึงไม่กินเลข
   */
  private async generateDocumentNo(companyId: string, issuedAt: Date) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
      select: { code: true },
    });

    const companyCode = (company?.code ?? 'DOC').toUpperCase();
    const year = issuedAt.getFullYear();
    const prefix = `${companyCode}-${year}`;

    const latest = await this.prisma.documentRequest.findFirst({
      where: {
        companyId,
        documentNo: {
          startsWith: `${prefix}-`,
        },
      },
      orderBy: {
        documentNo: 'desc',
      },
      select: {
        documentNo: true,
      },
    });

    return this.buildNextSerialNo(prefix, latest?.documentNo ?? null);
  }

  /**
   * เดินเลขลำดับถัดไปจากเลขล่าสุดของ prefix นั้น
   * แยกออกมาเป็น pure function เพื่อให้ทดสอบได้โดยไม่ต้องต่อฐานข้อมูล
   */
  private buildNextSerialNo(prefix: string, latestSerialNo: string | null) {
    const suffix = latestSerialNo?.slice(prefix.length + 1) ?? '';
    const lastSequence = /^\d+$/.test(suffix) ? Number(suffix) : 0;

    return `${prefix}-${String(lastSequence + 1).padStart(4, '0')}`;
  }

  private async generateDocumentRequestNo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const prefix = `DOC${year}${month}${day}`;

    // นับจากเลขล่าสุดที่ออกไปแล้ว ไม่ใช่จำนวนเรคคอร์ด
    // (soft delete / hard delete จะไม่ทำให้เลขย้อนกลับไปทับของเดิม)
    const latest = await this.prisma.documentRequest.findFirst({
      where: {
        requestNo: {
          startsWith: `${prefix}-`,
        },
      },
      orderBy: {
        requestNo: 'desc',
      },
      select: {
        requestNo: true,
      },
    });

    return this.buildNextSerialNo(prefix, latest?.requestNo ?? null);
  }

  private async ensureDocumentRequestExists(id: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    return request;
  }

  private async safelyDeleteUploadedFile(filePath?: string | null) {
    if (!filePath) {
      return;
    }

    try {
      await unlink(filePath);
    } catch {
      // ignore cleanup error
    }
  }

  private complaintInclude() {
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
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
        },
      },
      submittedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      handledBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    };
  }

  private async findCurrentComplaintRaw(id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!complaint) {
      throw new NotFoundException('ไม่พบเรื่องร้องเรียน');
    }

    return complaint;
  }

  private async generateComplaintNo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const prefix = `CMP${year}${month}${day}`;

    const start = new Date(year, now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const count = await this.prisma.complaint.count({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');

    return `${prefix}-${sequence}`;
  }

  private mergeNote(currentNote?: string | null, newNote?: string | null) {
    const note = this.optionalTrim(newNote);

    if (!note) {
      return currentNote ?? null;
    }

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${note}`;

    return currentNote ? `${currentNote}\n${line}` : line;
  }

  private optionalTrim(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private documentTemplateInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      documentType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
          category: true,
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

  private async ensureDocumentTypeExists(documentTypeId: string) {
    const documentType = await this.prisma.documentType.findFirst({
      where: {
        id: documentTypeId,
        deletedAt: null,
      },
    });

    if (!documentType) {
      throw new NotFoundException('ไม่พบประเภทเอกสาร');
    }

    return documentType;
  }

  private async ensureDocumentTemplateCodeAvailable(params: {
    companyId?: string | null;
    code: string;
    excludeId?: string;
  }) {
    const code = params.code.trim().toUpperCase();

    const existing = await this.prisma.documentTemplate.findFirst({
      where: {
        companyId: params.companyId ?? null,
        code,
        deletedAt: null,
        ...(params.excludeId
          ? {
              id: {
                not: params.excludeId,
              },
            }
          : {}),
      },
    });

    if (existing) {
      throw new ConflictException('รหัส Template นี้ถูกใช้งานแล้ว');
    }
  }

  private async resolveTemplateForRequest(
    documentRequestId: string,
    templateId?: string,
  ) {
    const request = await this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
        documentTypeId: true,
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    if (templateId) {
      const template = await this.prisma.documentTemplate.findFirst({
        where: {
          id: templateId,
          deletedAt: null,
          status: MasterStatus.ACTIVE,
          OR: [
            {
              companyId: request.companyId,
            },
            {
              companyId: null,
            },
          ],
        },
      });

      if (!template) {
        throw new NotFoundException(
          'ไม่พบ Template หรือ Template ไม่พร้อมใช้งานกับบริษัทนี้',
        );
      }

      return template;
    }

    const companyTemplate = await this.prisma.documentTemplate.findFirst({
      where: {
        companyId: request.companyId,
        documentTypeId: request.documentTypeId,
        deletedAt: null,
        status: MasterStatus.ACTIVE,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (companyTemplate) {
      return companyTemplate;
    }

    const globalTemplate = await this.prisma.documentTemplate.findFirst({
      where: {
        companyId: null,
        documentTypeId: request.documentTypeId,
        deletedAt: null,
        status: MasterStatus.ACTIVE,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (globalTemplate) {
      return globalTemplate;
    }

    throw new NotFoundException(
      'ไม่พบ Template สำหรับประเภทเอกสารนี้ กรุณาสร้าง Template ก่อน',
    );
  }

  private renderTemplateContent(
    htmlContent: string | null,
    request: {
      requestNo: string;
      title: string;
      purpose: string | null;
      status: DocumentRequestStatus;
      createdAt: Date;
      submittedAt: Date | null;
      approvedAt: Date | null;
      requestData: Prisma.JsonValue | null;
      company?: {
        code: string;
        nameTh: string;
        nameEn: string | null;
      };
      employee?: {
        employeeCode: string;
        title: string | null;
        firstName: string;
        lastName: string;
        displayName: string | null;
        position: string | null;
      } | null;
      documentType?: {
        code: string;
        nameTh: string;
        nameEn: string | null;
      };
    },
    extraTokens: Record<string, unknown> = {},
    rawTokens: Record<string, string> = {},
  ) {
    const employeeName =
      request.employee?.displayName ||
      [
        request.employee?.title,
        request.employee?.firstName,
        request.employee?.lastName,
      ]
        .filter(Boolean)
        .join(' ');

    const baseTokens: Record<string, unknown> = {
      requestNo: request.requestNo,
      title: request.title,
      purpose: request.purpose,
      status: request.status,
      createdAt: this.formatDateTimeThai(request.createdAt),
      submittedAt: request.submittedAt
        ? this.formatDateTimeThai(request.submittedAt)
        : '',
      approvedAt: request.approvedAt
        ? this.formatDateTimeThai(request.approvedAt)
        : '',
      issuedDate: this.formatDateThai(new Date()),
      companyCode: request.company?.code ?? '',
      companyName: request.company?.nameTh ?? '',
      companyNameEn: request.company?.nameEn ?? '',
      employeeCode: request.employee?.employeeCode ?? '',
      employeeName,
      position: request.employee?.position ?? '',
      documentTypeCode: request.documentType?.code ?? '',
      documentTypeName: request.documentType?.nameTh ?? '',
      documentTypeNameEn: request.documentType?.nameEn ?? '',
    };

    const requestDataTokens = this.flattenJsonToTokens(
      'requestData',
      request.requestData,
    );

    const tokens = {
      ...baseTokens,
      ...requestDataTokens,
      ...extraTokens,
    };

    const html = htmlContent || this.getDefaultTemplateHtml();

    return html.replace(/{{\s*([^}]+)\s*}}/g, (_match, rawKey: string) => {
      const key = rawKey.trim();

      // rawTokens = markup ที่ระบบสร้างเอง (เช่น <img> โลโก้) จึงไม่ escape
      // ทุก token ที่มาจากผู้ใช้/ฐานข้อมูลยัง escape ตามเดิม
      if (Object.prototype.hasOwnProperty.call(rawTokens, key)) {
        return rawTokens[key];
      }

      const value = tokens[key];

      if (value === undefined || value === null) {
        return '';
      }

      return this.escapeHtml(String(value));
    });
  }

  /* ==================================================================
   * Token engine สำหรับเอกสารรับรอง
   * หนังสือรับรองการทำงาน/เงินเดือน ต้องมีวันเริ่มงาน อายุงาน เงินเดือน
   * หัวจดหมายบริษัท และผู้มีอำนาจลงนาม ไม่งั้นใช้ยื่นจริงไม่ได้
   * ================================================================== */

  private async buildDocumentRenderTokens(
    documentRequestId: string,
    templateConfig?: Prisma.JsonValue | null,
  ): Promise<{
    tokens: Record<string, unknown>;
    rawTokens: Record<string, string>;
  }> {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id: documentRequestId, deletedAt: null },
      select: {
        id: true,
        companyId: true,
        requestNo: true,
        requestData: true,
        documentNo: true,
        issuedAt: true,
        company: {
          select: {
            nameTh: true,
            nameEn: true,
            address: true,
            taxId: true,
            phone: true,
            email: true,
            logoUrl: true,
          },
        },
        documentType: {
          select: { code: true },
        },
        employee: {
          select: {
            id: true,
            startDate: true,
            position: true,
            positionMaster: { select: { nameTh: true, nameEn: true } },
            branch: { select: { nameTh: true } },
            department: { select: { nameTh: true } },
            division: { select: { nameTh: true } },
            employeeType: { select: { nameTh: true } },
            profile: { select: { nationalId: true, birthDate: true } },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('ไม่พบคำขอเอกสาร');
    }

    const config = this.asRecord(templateConfig);
    const requestData = this.asRecord(request.requestData);

    // พิมพ์ซ้ำต้องได้เลขที่และวันที่เดิมเสมอ ไม่ใช่วันที่กดพิมพ์
    const issuedAt = request.issuedAt ?? new Date();

    const tokens: Record<string, unknown> = {};
    const rawTokens: Record<string, string> = {};

    // documentNo = เลขที่หนังสือจริง (มีเมื่ออนุมัติแล้ว)
    // เอกสารเก่าก่อนมีฟีเจอร์นี้ fallback เป็นเลขคำขอเพื่อไม่ให้หัวกระดาษว่าง
    tokens.documentNo = request.documentNo ?? request.requestNo;
    tokens.issuedDate = this.formatDateThai(issuedAt);

    /* ---------- หัวจดหมายบริษัท ---------- */
    tokens.companyAddress = request.company?.address ?? '';
    tokens.companyTaxId = request.company?.taxId ?? '';
    tokens.companyPhone = request.company?.phone ?? '';
    tokens.companyEmail = request.company?.email ?? '';

    const logoDataUri = await this.loadCompanyLogoDataUri(
      request.company?.logoUrl,
    );

    tokens.companyLogoDataUri = logoDataUri ?? '';
    rawTokens.companyLogoHtml = logoDataUri
      ? `<img src="${logoDataUri}" alt="" class="doc-logo" />`
      : '';

    /* ---------- ข้อมูลพนักงาน ---------- */
    const employee = request.employee;

    tokens.employeePosition =
      employee?.positionMaster?.nameTh || employee?.position || '';
    tokens.employeePositionEn = employee?.positionMaster?.nameEn ?? '';
    tokens.employeeBranch = employee?.branch?.nameTh ?? '';
    tokens.employeeDepartment = employee?.department?.nameTh ?? '';
    tokens.employeeDivision = employee?.division?.nameTh ?? '';
    tokens.employeeType = employee?.employeeType?.nameTh ?? '';
    tokens.employeeNationalId = employee?.profile?.nationalId ?? '';

    if (employee?.startDate) {
      const duration = this.calculateServiceDuration(
        employee.startDate,
        issuedAt,
      );

      tokens.startDate = this.formatDateThai(employee.startDate);
      tokens.startDateIso = employee.startDate.toISOString().slice(0, 10);
      tokens.serviceYears = duration.years;
      tokens.serviceMonths = duration.months;
      tokens.serviceDuration = duration.text;
    } else {
      tokens.startDate = '';
      tokens.startDateIso = '';
      tokens.serviceYears = '';
      tokens.serviceMonths = '';
      tokens.serviceDuration = '';
    }

    /* ---------- เงินเดือน ---------- */
    // ใส่ token เงินเดือนเฉพาะเอกสารที่ต้องใช้จริงเท่านั้น
    // template อื่นเรียก {{monthlySalary}} จะได้ค่าว่าง ไม่หลุดข้อมูลข้ามเอกสาร
    const documentKind = String(requestData.documentKind ?? '');
    const includeSalary =
      documentKind === 'SALARY_CERTIFICATE' ||
      /SALARY/i.test(request.documentType?.code ?? '') ||
      config.includeSalary === true;

    if (includeSalary && employee?.id) {
      const compensation = await this.findEffectiveCompensation(
        employee.id,
        issuedAt,
      );

      if (compensation) {
        /*
         * หนังสือรับรองพูดเป็น "เงินเดือน" เสมอ พนักงานรายวัน/รายชั่วโมง
         * จึงต้องแปลงอัตราต่อวันเป็นค่าจ้างเทียบเท่ารายเดือนก่อน
         * ไม่งั้นเอกสารที่ยื่นธนาคารจะเขียนว่าเงินเดือน 500 บาท
         */
        const baseSalary = resolveMonthlyEquivalentWage(
          compensation.baseSalary,
          null,
          (compensation as any).salaryBasis,
        );
        /*
         * เบี้ยประจำย้ายไปอยู่ที่ "รายการประจำ" แล้ว ไม่ได้อยู่ในฐานเงินเดือน
         * ถ้ายังอ่านจากช่องเดิมจะได้ 0 หมด หนังสือรับรองที่ยื่นธนาคารจะระบุ
         * รายได้ต่ำกว่าความจริง ซึ่งกระทบสิทธิ์กู้ของพนักงานโดยตรง
         */
        const recurringEarnings =
          await this.prisma.employeeCompensationItem.findMany({
            where: {
              employeeId: employee.id,
              deletedAt: null,
              status: 'ACTIVE',
              type: 'EARNING',
              effectiveDate: { lte: issuedAt },
              OR: [{ endDate: null }, { endDate: { gte: issuedAt } }],
            },
            select: { code: true, amount: true },
          });

        const allowanceByCode = (code: string) =>
          recurringEarnings
            .filter((item) => item.code === code)
            .reduce((total, item) => total + Number(item.amount), 0);

        const positionAllowance = allowanceByCode('POSITION_ALLOWANCE');
        const transportAllowance = allowanceByCode('TRANSPORT_ALLOWANCE');
        const phoneAllowance = allowanceByCode('PHONE_ALLOWANCE');
        /* ที่เหลือทั้งหมดรวมเป็น "อื่น ๆ" เพื่อให้ยอดรวมไม่ตกหล่น */
        const otherAllowance = recurringEarnings
          .filter(
            (item) =>
              ![
                'POSITION_ALLOWANCE',
                'TRANSPORT_ALLOWANCE',
                'PHONE_ALLOWANCE',
              ].includes(item.code),
          )
          .reduce((total, item) => total + Number(item.amount), 0);

        const allowance =
          positionAllowance +
          transportAllowance +
          phoneAllowance +
          otherAllowance;

        tokens.monthlySalary = this.formatMoney(baseSalary);
        tokens.monthlySalaryText = this.formatBahtText(baseSalary);
        tokens.positionAllowance = this.formatMoney(positionAllowance);
        tokens.transportAllowance = this.formatMoney(transportAllowance);
        tokens.phoneAllowance = this.formatMoney(phoneAllowance);
        tokens.otherAllowance = this.formatMoney(otherAllowance);
        tokens.totalAllowance = this.formatMoney(allowance);
        tokens.totalMonthlyIncome = this.formatMoney(baseSalary + allowance);
        tokens.totalMonthlyIncomeText = this.formatBahtText(
          baseSalary + allowance,
        );
        tokens.salaryEffectiveDate = this.formatDateThai(
          compensation.effectiveDate,
        );
      }
    }

    /* ---------- ผู้มีอำนาจลงนาม ---------- */
    tokens.signerName = this.asTrimmedString(config.signerName);
    tokens.signerPosition = this.asTrimmedString(config.signerPosition);
    tokens.signerNote = this.asTrimmedString(config.signerNote);

    return { tokens, rawTokens };
  }

  /** งวดค่าจ้างที่มีผลบังคับ ณ วันที่ออกเอกสาร */
  private async findEffectiveCompensation(employeeId: string, atDate: Date) {
    return this.prisma.employeeCompensation.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        status: MasterStatus.ACTIVE,
        effectiveDate: { lte: atDate },
        OR: [{ endDate: null }, { endDate: { gte: atDate } }],
      },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  private calculateServiceDuration(startDate: Date, endDate: Date) {
    let totalMonths =
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth());

    if (endDate.getDate() < startDate.getDate()) {
      totalMonths -= 1;
    }

    totalMonths = Math.max(totalMonths, 0);

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} ปี`);
    if (months > 0) parts.push(`${months} เดือน`);
    if (parts.length === 0) parts.push('น้อยกว่า 1 เดือน');

    return { years, months, text: parts.join(' ') };
  }

  private async loadCompanyLogoDataUri(logoUrl?: string | null) {
    const trimmed = logoUrl?.trim();

    if (!trimmed) {
      return null;
    }

    // เก็บเป็น public path (/uploads/company-logos/<file>) — ใช้เฉพาะชื่อไฟล์
    // เพื่อกัน path traversal และ puppeteer โหลด relative URL ไม่ได้อยู่แล้ว
    const fileName = basename(trimmed.split('?')[0]);
    const extension = extname(fileName).toLowerCase();

    const mimeType =
      extension === '.png'
        ? 'image/png'
        : extension === '.webp'
          ? 'image/webp'
          : extension === '.jpg' || extension === '.jpeg'
            ? 'image/jpeg'
            : null;

    if (!mimeType) {
      return null;
    }

    try {
      const buffer = await readFile(join(COMPANY_LOGO_UPLOAD_DIR, fileName));
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch {
      // ไม่มีไฟล์โลโก้ = ออกเอกสารต่อได้ แค่ไม่มีหัวจดหมาย
      return null;
    }
  }

  private asTrimmedString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private formatMoney(amount: number) {
    return amount.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /** จำนวนเงินเป็นตัวอักษรไทย เช่น 25,500.00 → "สองหมื่นห้าพันห้าร้อยบาทถ้วน" */
  private formatBahtText(amount: number) {
    const rounded = Math.round(Math.abs(amount) * 100) / 100;
    const baht = Math.floor(rounded);
    const satang = Math.round((rounded - baht) * 100);

    const bahtText = `${this.thaiNumberToWords(baht)}บาท`;

    if (satang === 0) {
      return `${bahtText}ถ้วน`;
    }

    return `${bahtText}${this.thaiNumberToWords(satang)}สตางค์`;
  }

  private thaiNumberToWords(value: number): string {
    const digitWords = [
      'ศูนย์',
      'หนึ่ง',
      'สอง',
      'สาม',
      'สี่',
      'ห้า',
      'หก',
      'เจ็ด',
      'แปด',
      'เก้า',
    ];
    const positionWords = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

    const target = Math.floor(Math.abs(value));

    if (target === 0) {
      return 'ศูนย์';
    }

    if (target >= 1_000_000) {
      const high = Math.floor(target / 1_000_000);
      const low = target % 1_000_000;
      const highText = `${this.thaiNumberToWords(high)}ล้าน`;

      return low === 0 ? highText : `${highText}${this.thaiNumberToWords(low)}`;
    }

    const text = String(target);
    let result = '';

    for (let index = 0; index < text.length; index += 1) {
      const digit = Number(text[index]);
      const position = text.length - index - 1;

      if (digit === 0) continue;

      if (position === 0 && digit === 1 && text.length > 1) {
        result += 'เอ็ด';
      } else if (position === 1 && digit === 1) {
        result += 'สิบ';
      } else if (position === 1 && digit === 2) {
        result += 'ยี่สิบ';
      } else {
        result += `${digitWords[digit]}${positionWords[position]}`;
      }
    }

    return result;
  }

  private flattenJsonToTokens(prefix: string, value: unknown) {
    const result: Record<string, unknown> = {};

    const walk = (currentPrefix: string, currentValue: unknown) => {
      if (
        currentValue === null ||
        currentValue === undefined ||
        typeof currentValue !== 'object' ||
        currentValue instanceof Date
      ) {
        result[currentPrefix] = currentValue;
        return;
      }

      if (Array.isArray(currentValue)) {
        result[currentPrefix] = currentValue.join(', ');
        return;
      }

      for (const [key, nestedValue] of Object.entries(
        currentValue as Record<string, unknown>,
      )) {
        walk(`${currentPrefix}.${key}`, nestedValue);
      }
    };

    walk(prefix, value);

    return result;
  }

  private getDefaultTemplateHtml() {
    return `
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>{{documentTypeName}}</title>
  <style>
    body {
      font-family: "TH Sarabun New", "Sarabun", Arial, sans-serif;
      font-size: 18px;
      line-height: 1.7;
      color: #0f172a;
      padding: 8px 0;
    }
    .letterhead {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
    }
    .doc-logo {
      max-height: 68px;
      max-width: 160px;
      object-fit: contain;
    }
    .letterhead-body { flex: 1; }
    .company-name { font-size: 22px; font-weight: 700; }
    .company-meta { font-size: 15px; color: #475569; margin-top: 2px; }
    .doc-meta {
      display: flex;
      justify-content: space-between;
      font-size: 16px;
      color: #475569;
      margin-top: 10px;
    }
    .title {
      text-align: center;
      font-size: 26px;
      font-weight: 700;
      margin: 28px 0 20px;
    }
    .body p { margin: 0 0 10px; text-indent: 48px; }
    .facts {
      margin: 4px 0 12px;
      border-collapse: collapse;
      width: 100%;
    }
    .facts td { padding: 3px 0; vertical-align: top; }
    .facts td:first-child { width: 190px; color: #475569; }
    .closing { margin-top: 18px; }
    .signature {
      margin-top: 64px;
      display: flex;
      justify-content: flex-end;
    }
    .signature-box { width: 300px; text-align: center; }
    .signature-line { margin-bottom: 6px; }
    .signature-name { font-weight: 700; }
    .signature-note { font-size: 15px; color: #475569; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="letterhead">
    {{companyLogoHtml}}
    <div class="letterhead-body">
      <div class="company-name">{{companyName}}</div>
      <div class="company-meta">{{companyAddress}}</div>
      <div class="company-meta">โทร. {{companyPhone}} · เลขประจำตัวผู้เสียภาษี {{companyTaxId}}</div>
    </div>
  </div>

  <div class="doc-meta">
    <span>เลขที่ {{documentNo}}</span>
    <span>วันที่ {{issuedDate}}</span>
  </div>

  <div class="title">{{documentTypeName}}</div>

  <div class="body">
    <p>
      บริษัท {{companyName}} ขอรับรองว่าบุคคลผู้มีรายนามด้านล่างนี้
      เป็นพนักงานของบริษัท โดยมีรายละเอียดดังนี้
    </p>

    <table class="facts">
      <tr><td>ชื่อ - นามสกุล</td><td>{{employeeName}}</td></tr>
      <tr><td>รหัสพนักงาน</td><td>{{employeeCode}}</td></tr>
      <tr><td>ตำแหน่ง</td><td>{{employeePosition}}</td></tr>
      <tr><td>แผนก</td><td>{{employeeDepartment}}</td></tr>
      <tr><td>สถานที่ปฏิบัติงาน</td><td>{{employeeBranch}}</td></tr>
      <tr><td>วันที่เริ่มงาน</td><td>{{startDate}}</td></tr>
      <tr><td>อายุงาน</td><td>{{serviceDuration}}</td></tr>
    </table>

    <p>
      เอกสารฉบับนี้จัดทำขึ้นตามคำขอของพนักงาน เพื่อใช้ประกอบ{{purpose}}
      และมีผลนับตั้งแต่วันที่ออกเอกสารเป็นต้นไป
    </p>

    <p class="closing">
      ออกให้ ณ วันที่ {{issuedDate}}
    </p>
  </div>

  <div class="signature">
    <div class="signature-box">
      <div class="signature-line">ลงชื่อ ..............................................</div>
      <div class="signature-name">( {{signerName}} )</div>
      <div>{{signerPosition}}</div>
      <div class="signature-note">{{signerNote}}</div>
    </div>
  </div>
</body>
</html>`.trim();
  }

  private formatDateThai(date: Date) {
    return new Intl.DateTimeFormat('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  private formatDateTimeThai(date: Date) {
    return new Intl.DateTimeFormat('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  private async renderHtmlToPdfBuffer(html: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'load',
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '16mm',
        right: '16mm',
        bottom: '18mm',
        left: '16mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
}
