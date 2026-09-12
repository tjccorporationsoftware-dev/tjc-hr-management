import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EvaluationFormStatus,
  EvaluationQuestionType,
  EvaluationResultStatus,
  MasterStatus,
  Prisma,
  DisciplinaryHistoryType,
  WarningLetterStatus,
  WarningSeverity,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

import { CreateEvaluationFormDto } from './dto/create-evaluation-form.dto';
import { UpdateEvaluationFormDto } from './dto/update-evaluation-form.dto';
import { ListEvaluationFormsQueryDto } from './dto/list-evaluation-forms-query.dto';
import { CreateEvaluatorDto } from './dto/create-evaluator.dto';
import { ListEvaluatorsQueryDto } from './dto/list-evaluators-query.dto';
import { CreateEvaluationResultDto } from './dto/create-evaluation-result.dto';
import { UpdateEvaluationResultDto } from './dto/update-evaluation-result.dto';
import { ListEvaluationResultsQueryDto } from './dto/list-evaluation-results-query.dto';
import { CreateWarningLetterDto } from './dto/create-warning-letter.dto';
import { UpdateWarningLetterDto } from './dto/update-warning-letter.dto';
import { ListWarningLettersQueryDto } from './dto/list-warning-letters-query.dto';
import { WarningLetterActionDto } from './dto/warning-letter-action.dto';
import { CreateDisciplinaryHistoryDto } from './dto/create-disciplinary-history.dto';
import { ListDisciplinaryHistoriesQueryDto } from './dto/list-disciplinary-histories-query.dto';
import {
  calculateEvaluationScore,
  type EvaluationScoreItemInput,
} from './evaluation-score.util';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * บริษัทปลายทางสำหรับ "สร้าง" master ของ performance
   * - GLOBAL: ใช้ค่าจาก dto (รวม null = shared)
   * - COMPANY/BRANCH: ล็อกเป็นบริษัทของผู้ใช้เสมอ
   */
  private resolvePerfCompanyId(
    scope: TenantScope,
    requested?: string | null,
  ): string | null {
    if (scope.level === 'GLOBAL') {
      return requested ?? null;
    }
    return scope.companyId ?? null;
  }

  /**
   * ตรวจสิทธิ์จัดการ master performance ตาม scope
   * - GLOBAL: ผ่านทุกกรณี
   * - COMPANY/BRANCH: จัดการได้เฉพาะของบริษัทตน (บล็อก shared/null และบริษัทอื่น)
   */
  private assertPerfManageScope(scope: TenantScope, companyId: string | null) {
    if (scope.level === 'GLOBAL') {
      return;
    }
    if (!companyId || companyId !== scope.companyId) {
      throw new ForbiddenException('ไม่มีสิทธิ์จัดการข้อมูลของบริษัทนี้');
    }
  }

  async findForms(query: ListEvaluationFormsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Prisma.EvaluationFormWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, draft, active, inactive, archived] =
      await this.prisma.$transaction([
        this.prisma.evaluationForm.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: this.formInclude(),
        }),
        this.prisma.evaluationForm.count({ where }),
        this.prisma.evaluationForm.count({
          where: { ...where, status: EvaluationFormStatus.DRAFT },
        }),
        this.prisma.evaluationForm.count({
          where: { ...where, status: EvaluationFormStatus.ACTIVE },
        }),
        this.prisma.evaluationForm.count({
          where: { ...where, status: EvaluationFormStatus.INACTIVE },
        }),
        this.prisma.evaluationForm.count({
          where: { ...where, status: EvaluationFormStatus.ARCHIVED },
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
      summary: {
        total,
        draft,
        active,
        inactive,
        archived,
      },
    };
  }

  async findForm(id: string) {
    const item = await this.prisma.evaluationForm.findFirst({
      where: { id, deletedAt: null },
      include: this.formInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบแบบประเมิน');
    }

    return item;
  }

  async createForm(
    dto: CreateEvaluationFormDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.resolvePerfCompanyId(scope, dto.companyId);
    await this.validateCompany(companyId);
    await this.ensureFormCodeAvailable(dto.code, companyId);

    const created = await this.prisma.evaluationForm.create({
      data: {
        companyId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        description: this.optionalTrim(dto.description),
        periodType: dto.periodType ?? null,
        totalScore:
          dto.totalScore !== undefined
            ? new Prisma.Decimal(dto.totalScore)
            : null,
        passScore:
          dto.passScore !== undefined ? new Prisma.Decimal(dto.passScore) : null,
        status: dto.status ?? EvaluationFormStatus.DRAFT,
        createdById: currentUserId ?? null,
        questions: {
          create: dto.questions.map((question, index) => ({
            title: question.title.trim(),
            description: this.optionalTrim(question.description),
            type: question.type ?? EvaluationQuestionType.SCORE,
            maxScore: new Prisma.Decimal(question.maxScore ?? 5),
            weight: new Prisma.Decimal(question.weight ?? 1),
            sortOrder: question.sortOrder ?? index + 1,
            isRequired: question.isRequired ?? true,
          })),
        },
      },
    });

    return this.findForm(created.id);
  }

  async updateForm(
    id: string,
    dto: UpdateEvaluationFormDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.evaluationForm.findFirst({
      where: { id, deletedAt: null },
      include: { questions: true },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบแบบประเมิน');
    }

    this.assertPerfManageScope(scope, current.companyId);

    if (dto.companyId !== undefined && scope.level === 'GLOBAL') {
      await this.validateCompany(dto.companyId);
    }

    const nextCompanyId =
      scope.level === 'GLOBAL'
        ? (dto.companyId ?? current.companyId)
        : current.companyId;

    if (
      dto.code !== undefined &&
      (dto.code !== current.code || nextCompanyId !== current.companyId)
    ) {
      await this.ensureFormCodeAvailable(
        dto.code,
        nextCompanyId ?? undefined,
        id,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const formData: Prisma.EvaluationFormUncheckedUpdateInput = {
          ...(dto.companyId !== undefined && scope.level === 'GLOBAL'
            ? { companyId: dto.companyId || null }
            : {}),
          ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: this.optionalTrim(dto.description) }
            : {}),
          ...(dto.periodType !== undefined
            ? { periodType: dto.periodType ?? null }
            : {}),
          ...(dto.totalScore !== undefined
            ? {
                totalScore:
                  dto.totalScore === null
                    ? null
                    : new Prisma.Decimal(dto.totalScore),
              }
            : {}),
          ...(dto.passScore !== undefined
            ? {
                passScore:
                  dto.passScore === null
                    ? null
                    : new Prisma.Decimal(dto.passScore),
              }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(currentUserId ? { createdById: current.createdById } : {}),
      };

      await tx.evaluationForm.update({ where: { id }, data: formData });

      if (dto.questions) {
        await tx.evaluationQuestion.deleteMany({
          where: { formId: id },
        });

        await tx.evaluationQuestion.createMany({
          data: dto.questions.map((question, index) => ({
            formId: id,
            title: question.title.trim(),
            description: this.optionalTrim(question.description),
            type: question.type ?? EvaluationQuestionType.SCORE,
            maxScore: new Prisma.Decimal(question.maxScore ?? 5),
            weight: new Prisma.Decimal(question.weight ?? 1),
            sortOrder: question.sortOrder ?? index + 1,
            isRequired: question.isRequired ?? true,
          })),
        });
      }
    });

    return this.findForm(id);
  }

  async removeForm(id: string, scope: TenantScope) {
    const current = await this.prisma.evaluationForm.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบแบบประเมิน');
    }

    this.assertPerfManageScope(scope, current.companyId);

    await this.prisma.evaluationForm.update({
      where: { id },
      data: {
        status: EvaluationFormStatus.ARCHIVED,
        deletedAt: new Date(),
      },
    });

    return {
      id,
      deleted: true,
    };
  }

  async findEvaluators(query: ListEvaluatorsQueryDto) {
    return this.prisma.evaluator.findMany({
      where: {
        deletedAt: null,
        ...(query.formId ? { formId: query.formId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.evaluatorUserId
          ? { evaluatorUserId: query.evaluatorUserId }
          : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: this.evaluatorInclude(),
    });
  }

  async createEvaluator(
    dto: CreateEvaluatorDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    // ผู้ประเมินผูกกับแบบประเมิน (form) — scope ผ่านบริษัทของ form
    const form = await this.ensureFormExists(dto.formId);
    this.assertPerfManageScope(scope, form.companyId);

    if (dto.employeeId) {
      await this.ensureEmployeeExists(dto.employeeId);
    }

    if (dto.evaluatorEmployeeId) {
      await this.ensureEmployeeExists(dto.evaluatorEmployeeId);
    }

    if (dto.evaluatorUserId) {
      await this.ensureUserExists(dto.evaluatorUserId);
    }

    const created = await this.prisma.evaluator.create({
      data: {
        formId: dto.formId,
        employeeId: dto.employeeId ?? null,
        evaluatorUserId: dto.evaluatorUserId ?? null,
        evaluatorEmployeeId: dto.evaluatorEmployeeId ?? null,
        note: this.optionalTrim(dto.note),
        status: dto.status ?? MasterStatus.ACTIVE,
        createdById: currentUserId ?? null,
      },
    });

    return this.prisma.evaluator.findUnique({
      where: { id: created.id },
      include: this.evaluatorInclude(),
    });
  }

  async removeEvaluator(id: string, scope: TenantScope) {
    const current = await this.prisma.evaluator.findFirst({
      where: { id, deletedAt: null },
      include: { form: { select: { companyId: true } } },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบผู้ประเมิน');
    }

    this.assertPerfManageScope(scope, current.form?.companyId ?? null);

    await this.prisma.evaluator.update({
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

  async findResults(query: ListEvaluationResultsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Prisma.EvaluationResultWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.formId ? { formId: query.formId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { periodName: { contains: query.q, mode: 'insensitive' } },
              { summary: { contains: query.q, mode: 'insensitive' } },
              {
                employee: {
                  OR: [
                    {
                      employeeCode: {
                        contains: query.q,
                        mode: 'insensitive',
                      },
                    },
                    { firstName: { contains: query.q, mode: 'insensitive' } },
                    { lastName: { contains: query.q, mode: 'insensitive' } },
                    { displayName: { contains: query.q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [
      items,
      total,
      draft,
      submitted,
      finalized,
      cancelled,
      aggregate,
    ] = await this.prisma.$transaction([
      this.prisma.evaluationResult.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: this.resultInclude(),
      }),
      this.prisma.evaluationResult.count({ where }),
      this.prisma.evaluationResult.count({
        where: { ...where, status: EvaluationResultStatus.DRAFT },
      }),
      this.prisma.evaluationResult.count({
        where: { ...where, status: EvaluationResultStatus.SUBMITTED },
      }),
      this.prisma.evaluationResult.count({
        where: { ...where, status: EvaluationResultStatus.FINALIZED },
      }),
      this.prisma.evaluationResult.count({
        where: { ...where, status: EvaluationResultStatus.CANCELLED },
      }),
      this.prisma.evaluationResult.aggregate({
        where,
        _avg: { percent: true },
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
      summary: {
        total,
        draft,
        submitted,
        finalized,
        cancelled,
        avgPercent: this.decimalToNumber(aggregate._avg.percent),
      },
    };
  }

  async findResult(id: string) {
    const item = await this.prisma.evaluationResult.findFirst({
      where: { id, deletedAt: null },
      include: this.resultInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบผลการประเมิน');
    }

    return item;
  }

  async createResult(
    dto: CreateEvaluationResultDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.validateCompany(companyId);
    await this.ensureFormExists(dto.formId);
    await this.ensureEmployeeExists(dto.employeeId);

    if (dto.evaluatorUserId) {
      await this.ensureUserExists(dto.evaluatorUserId);
    }

    const scoreSummary = await this.calculateScore(dto.formId, dto.scoreItems);

    const created = await this.prisma.evaluationResult.create({
      data: {
        companyId,
        formId: dto.formId,
        employeeId: dto.employeeId,
        evaluatorUserId: dto.evaluatorUserId ?? currentUserId ?? null,
        evaluatorEmployeeId: dto.evaluatorEmployeeId ?? null,
        periodName: this.optionalTrim(dto.periodName),
        evaluationDate: new Date(dto.evaluationDate),
        scoreItems: scoreSummary.items as Prisma.InputJsonValue,
        totalScore: new Prisma.Decimal(scoreSummary.totalScore),
        maxScore: new Prisma.Decimal(scoreSummary.maxScore),
        percent: new Prisma.Decimal(scoreSummary.percent),
        summary: this.optionalTrim(dto.summary),
        recommendation: this.optionalTrim(dto.recommendation),
        note: this.optionalTrim(dto.note),
        status: EvaluationResultStatus.DRAFT,
        createdById: currentUserId ?? null,
      },
    });

    return this.findResult(created.id);
  }

  async updateResult(
    id: string,
    dto: UpdateEvaluationResultDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.evaluationResult.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบผลการประเมิน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== EvaluationResultStatus.DRAFT) {
      throw new BadRequestException(
        'แก้ไขได้เฉพาะผลการประเมินที่ยังเป็นร่างเท่านั้น',
      );
    }

    const formId = dto.formId ?? current.formId;

    if (dto.companyId !== undefined && scope.level === 'GLOBAL') {
      await this.validateCompany(dto.companyId);
    }

    if (dto.formId !== undefined) {
      await this.ensureFormExists(dto.formId);
    }

    if (dto.employeeId !== undefined) {
      await this.ensureEmployeeExists(dto.employeeId);
    }

    if (dto.evaluatorUserId !== undefined && dto.evaluatorUserId) {
      await this.ensureUserExists(dto.evaluatorUserId);
    }

    const scoreSummary = dto.scoreItems
      ? await this.calculateScore(formId, dto.scoreItems)
      : null;

    await this.prisma.evaluationResult.update({
      where: { id },
      data: {
        ...(dto.companyId !== undefined && scope.level === 'GLOBAL'
          ? { companyId: dto.companyId }
          : {}),
        ...(dto.formId !== undefined ? { formId: dto.formId } : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.evaluatorUserId !== undefined
          ? { evaluatorUserId: dto.evaluatorUserId || null }
          : {}),
        ...(dto.periodName !== undefined
          ? { periodName: this.optionalTrim(dto.periodName) }
          : {}),
        ...(dto.evaluationDate !== undefined
          ? { evaluationDate: new Date(dto.evaluationDate) }
          : {}),
        ...(scoreSummary
          ? {
              scoreItems: scoreSummary.items as Prisma.InputJsonValue,
              totalScore: new Prisma.Decimal(scoreSummary.totalScore),
              maxScore: new Prisma.Decimal(scoreSummary.maxScore),
              percent: new Prisma.Decimal(scoreSummary.percent),
            }
          : {}),
        ...(dto.summary !== undefined
          ? { summary: this.optionalTrim(dto.summary) }
          : {}),
        ...(dto.recommendation !== undefined
          ? { recommendation: this.optionalTrim(dto.recommendation) }
          : {}),
        ...(dto.note !== undefined ? { note: this.optionalTrim(dto.note) } : {}),
        ...(currentUserId ? { createdById: current.createdById } : {}),
      },
    });

    return this.findResult(id);
  }

  async submitResult(
    id: string,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.evaluationResult.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบผลการประเมิน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== EvaluationResultStatus.DRAFT) {
      throw new BadRequestException('ส่งได้เฉพาะผลการประเมินที่เป็นร่าง');
    }

    await this.prisma.evaluationResult.update({
      where: { id },
      data: {
        status: EvaluationResultStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedById: currentUserId ?? null,
      },
    });

    return this.findResult(id);
  }

  async finalizeResult(
    id: string,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.evaluationResult.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบผลการประเมิน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== EvaluationResultStatus.SUBMITTED) {
      throw new BadRequestException(
        'สรุปผลได้เฉพาะรายการที่ส่งประเมินแล้วเท่านั้น',
      );
    }

    await this.prisma.evaluationResult.update({
      where: { id },
      data: {
        status: EvaluationResultStatus.FINALIZED,
        finalizedAt: new Date(),
        finalizedById: currentUserId ?? null,
      },
    });

    return this.findResult(id);
  }

  async cancelResult(
    id: string,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.evaluationResult.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบผลการประเมิน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status === EvaluationResultStatus.FINALIZED) {
      throw new BadRequestException('ไม่สามารถยกเลิกผลประเมินที่สรุปผลแล้ว');
    }

    await this.prisma.evaluationResult.update({
      where: { id },
      data: {
        status: EvaluationResultStatus.CANCELLED,
        cancelledAt: new Date(),
        deletedAt: new Date(),
      },
    });

    return this.findResult(id).catch(() => ({
      id,
      cancelled: true,
      cancelledById: currentUserId ?? null,
    }));
  }

  async findWarningLetters(query: ListWarningLettersQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Prisma.WarningLetterWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            issuedDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { letterNo: { contains: query.q, mode: 'insensitive' } },
              { subject: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              {
                employee: {
                  OR: [
                    {
                      employeeCode: {
                        contains: query.q,
                        mode: 'insensitive',
                      },
                    },
                    { firstName: { contains: query.q, mode: 'insensitive' } },
                    { lastName: { contains: query.q, mode: 'insensitive' } },
                    { displayName: { contains: query.q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, draft, issued, acknowledged, cancelled] =
      await this.prisma.$transaction([
        this.prisma.warningLetter.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: this.warningLetterInclude(),
        }),
        this.prisma.warningLetter.count({ where }),
        this.prisma.warningLetter.count({
          where: { ...where, status: WarningLetterStatus.DRAFT },
        }),
        this.prisma.warningLetter.count({
          where: { ...where, status: WarningLetterStatus.ISSUED },
        }),
        this.prisma.warningLetter.count({
          where: { ...where, status: WarningLetterStatus.ACKNOWLEDGED },
        }),
        this.prisma.warningLetter.count({
          where: { ...where, status: WarningLetterStatus.CANCELLED },
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
      summary: {
        total,
        draft,
        issued,
        acknowledged,
        cancelled,
      },
    };
  }

  async findWarningLetter(id: string) {
    const item = await this.prisma.warningLetter.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.warningLetterInclude(),
    });

    if (!item) {
      throw new NotFoundException('ไม่พบหนังสือเตือน');
    }

    return item;
  }

  async createWarningLetter(
    dto: CreateWarningLetterDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.validateCompany(companyId);
    await this.ensureEmployeeBelongsToCompany(dto.employeeId, companyId);

    const letterNo =
      dto.letterNo?.trim() || (await this.generateWarningLetterNo(companyId));

    await this.ensureWarningLetterNoAvailable(letterNo, companyId);

    const created = await this.prisma.warningLetter.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        letterNo,
        subject: dto.subject.trim(),
        severity: dto.severity ?? WarningSeverity.MINOR,
        status: WarningLetterStatus.DRAFT,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : null,
        issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : null,
        description: dto.description.trim(),
        correctiveAction: this.optionalTrim(dto.correctiveAction),
        employeeResponse: this.optionalTrim(dto.employeeResponse),
        note: this.optionalTrim(dto.note),
        createdById: currentUserId ?? null,
      },
    });

    return this.findWarningLetter(created.id);
  }

  async updateWarningLetter(
    id: string,
    dto: UpdateWarningLetterDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.warningLetter.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบหนังสือเตือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== WarningLetterStatus.DRAFT) {
      throw new BadRequestException(
        'แก้ไขได้เฉพาะหนังสือเตือนสถานะร่างเท่านั้น',
      );
    }

    // non-GLOBAL ย้ายบริษัทไม่ได้
    const nextCompanyId =
      scope.level === 'GLOBAL'
        ? (dto.companyId ?? current.companyId)
        : current.companyId;
    const nextEmployeeId = dto.employeeId ?? current.employeeId;

    if (dto.companyId !== undefined && scope.level === 'GLOBAL') {
      await this.validateCompany(dto.companyId);
    }

    if (dto.employeeId !== undefined || dto.companyId !== undefined) {
      await this.ensureEmployeeBelongsToCompany(nextEmployeeId, nextCompanyId);
    }

    if (dto.letterNo !== undefined && dto.letterNo.trim() !== current.letterNo) {
      await this.ensureWarningLetterNoAvailable(
        dto.letterNo.trim(),
        nextCompanyId,
        id,
      );
    }

    await this.prisma.warningLetter.update({
      where: { id },
      data: {
        ...(dto.companyId !== undefined && scope.level === 'GLOBAL'
          ? { companyId: dto.companyId }
          : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.letterNo !== undefined ? { letterNo: dto.letterNo.trim() } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.incidentDate !== undefined
          ? {
              incidentDate: dto.incidentDate
                ? new Date(dto.incidentDate)
                : null,
            }
          : {}),
        ...(dto.issuedDate !== undefined
          ? {
              issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : null,
            }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.correctiveAction !== undefined
          ? { correctiveAction: this.optionalTrim(dto.correctiveAction) }
          : {}),
        ...(dto.employeeResponse !== undefined
          ? { employeeResponse: this.optionalTrim(dto.employeeResponse) }
          : {}),
        ...(dto.note !== undefined ? { note: this.optionalTrim(dto.note) } : {}),
        ...(currentUserId ? { createdById: current.createdById } : {}),
      },
    });

    return this.findWarningLetter(id);
  }

  async issueWarningLetter(
    id: string,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.warningLetter.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบหนังสือเตือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== WarningLetterStatus.DRAFT) {
      throw new BadRequestException(
        'ออกหนังสือเตือนได้เฉพาะรายการสถานะร่างเท่านั้น',
      );
    }

    const issuedDate = current.issuedDate ?? new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.warningLetter.update({
        where: { id },
        data: {
          status: WarningLetterStatus.ISSUED,
          issuedDate,
          issuedAt: new Date(),
          issuedById: currentUserId ?? null,
        },
      });

      await tx.disciplinaryHistory.create({
        data: {
          companyId: current.companyId,
          employeeId: current.employeeId,
          warningLetterId: current.id,
          type: DisciplinaryHistoryType.WARNING,
          eventDate: current.incidentDate ?? issuedDate,
          title: current.subject,
          detail: current.description,
          actionTaken: current.correctiveAction,
          note: current.note,
          createdById: currentUserId ?? null,
        },
      });
    });

    return this.findWarningLetter(id);
  }

  async acknowledgeWarningLetter(
    id: string,
    dto: WarningLetterActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.warningLetter.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบหนังสือเตือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== WarningLetterStatus.ISSUED) {
      throw new BadRequestException(
        'รับทราบได้เฉพาะหนังสือเตือนที่ออกแล้วเท่านั้น',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.warningLetter.update({
        where: { id },
        data: {
          status: WarningLetterStatus.ACKNOWLEDGED,
          employeeResponse:
            this.optionalTrim(dto.employeeResponse) ?? current.employeeResponse,
          note: this.optionalTrim(dto.note) ?? current.note,
          acknowledgedAt: new Date(),
          acknowledgedById: currentUserId ?? null,
        },
      });

      await tx.disciplinaryHistory.create({
        data: {
          companyId: current.companyId,
          employeeId: current.employeeId,
          warningLetterId: current.id,
          type: DisciplinaryHistoryType.ACKNOWLEDGEMENT,
          eventDate: new Date(),
          title: `รับทราบหนังสือเตือน ${current.letterNo}`,
          detail:
            this.optionalTrim(dto.employeeResponse) ||
            'พนักงานรับทราบหนังสือเตือนแล้ว',
          actionTaken: current.correctiveAction,
          note: this.optionalTrim(dto.note),
          createdById: currentUserId ?? null,
        },
      });
    });

    return this.findWarningLetter(id);
  }

  async cancelWarningLetter(
    id: string,
    dto: WarningLetterActionDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const current = await this.prisma.warningLetter.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบหนังสือเตือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status === WarningLetterStatus.ACKNOWLEDGED) {
      throw new BadRequestException(
        'ไม่สามารถยกเลิกหนังสือเตือนที่พนักงานรับทราบแล้ว',
      );
    }

    if (current.status === WarningLetterStatus.CANCELLED) {
      throw new BadRequestException('หนังสือเตือนนี้ถูกยกเลิกแล้ว');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.warningLetter.update({
        where: { id },
        data: {
          status: WarningLetterStatus.CANCELLED,
          cancelReason:
            this.optionalTrim(dto.cancelReason) ||
            this.optionalTrim(dto.note) ||
            null,
          cancelledAt: new Date(),
          cancelledById: currentUserId ?? null,
        },
      });

      await tx.disciplinaryHistory.create({
        data: {
          companyId: current.companyId,
          employeeId: current.employeeId,
          warningLetterId: current.id,
          type: DisciplinaryHistoryType.NOTE,
          eventDate: new Date(),
          title: `ยกเลิกหนังสือเตือน ${current.letterNo}`,
          detail:
            this.optionalTrim(dto.cancelReason) ||
            this.optionalTrim(dto.note) ||
            'ยกเลิกหนังสือเตือน',
          createdById: currentUserId ?? null,
        },
      });
    });

    return this.findWarningLetter(id);
  }

  async removeWarningLetter(id: string, scope: TenantScope) {
    const current = await this.prisma.warningLetter.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบหนังสือเตือน');
    }

    assertWithinScope(scope, { companyId: current.companyId });

    if (current.status !== WarningLetterStatus.DRAFT) {
      throw new BadRequestException(
        'ลบได้เฉพาะหนังสือเตือนสถานะร่างเท่านั้น',
      );
    }

    await this.prisma.warningLetter.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: WarningLetterStatus.CANCELLED,
      },
    });

    return {
      id,
      deleted: true,
    };
  }

  async findDisciplinaryHistories(
    query: ListDisciplinaryHistoriesQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    const where: Prisma.DisciplinaryHistoryWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.warningLetterId
        ? { warningLetterId: query.warningLetterId }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            eventDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: this.toEndOfDay(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { detail: { contains: query.q, mode: 'insensitive' } },
              { actionTaken: { contains: query.q, mode: 'insensitive' } },
              {
                employee: {
                  OR: [
                    {
                      employeeCode: {
                        contains: query.q,
                        mode: 'insensitive',
                      },
                    },
                    { firstName: { contains: query.q, mode: 'insensitive' } },
                    { lastName: { contains: query.q, mode: 'insensitive' } },
                    { displayName: { contains: query.q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, warning, acknowledgement, incident, note] =
      await this.prisma.$transaction([
        this.prisma.disciplinaryHistory.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: {
            eventDate: 'desc',
          },
          include: this.disciplinaryHistoryInclude(),
        }),
        this.prisma.disciplinaryHistory.count({
          where,
        }),
        this.prisma.disciplinaryHistory.count({
          where: { ...where, type: DisciplinaryHistoryType.WARNING },
        }),
        this.prisma.disciplinaryHistory.count({
          where: { ...where, type: DisciplinaryHistoryType.ACKNOWLEDGEMENT },
        }),
        this.prisma.disciplinaryHistory.count({
          where: { ...where, type: DisciplinaryHistoryType.INCIDENT },
        }),
        this.prisma.disciplinaryHistory.count({
          where: { ...where, type: DisciplinaryHistoryType.NOTE },
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
      summary: {
        total,
        warning,
        acknowledgement,
        incident,
        note,
      },
    };
  }

  async createDisciplinaryHistory(
    dto: CreateDisciplinaryHistoryDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.validateCompany(companyId);
    await this.ensureEmployeeBelongsToCompany(dto.employeeId, companyId);

    if (dto.warningLetterId) {
      await this.ensureWarningLetterExists(dto.warningLetterId);
    }

    const created = await this.prisma.disciplinaryHistory.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        warningLetterId: dto.warningLetterId ?? null,
        type: dto.type ?? DisciplinaryHistoryType.NOTE,
        eventDate: new Date(dto.eventDate),
        title: dto.title.trim(),
        detail: dto.detail.trim(),
        actionTaken: this.optionalTrim(dto.actionTaken),
        note: this.optionalTrim(dto.note),
        createdById: currentUserId ?? null,
      },
    });

    return this.prisma.disciplinaryHistory.findUnique({
      where: { id: created.id },
      include: this.disciplinaryHistoryInclude(),
    });
  }

  private async calculateScore(
    formId: string,
    scoreItems: EvaluationScoreItemInput[],
  ) {
    const questions = await this.prisma.evaluationQuestion.findMany({
      where: { formId },
    });

    return calculateEvaluationScore(questions, scoreItems);
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

  private async ensureFormCodeAvailable(
    code: string,
    companyId?: string | null,
    excludeId?: string,
  ) {
    const existing = await this.prisma.evaluationForm.findFirst({
      where: {
        code: code.trim(),
        companyId: companyId ?? null,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('รหัสแบบประเมินนี้ถูกใช้งานแล้ว');
    }
  }

  private async ensureFormExists(id: string) {
    const item = await this.prisma.evaluationForm.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, companyId: true },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบแบบประเมิน');
    }

    return item;
  }

  private async ensureEmployeeExists(id: string) {
    const item = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }
  }

  private async ensureUserExists(id: string) {
    const item = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบผู้ใช้งาน');
    }
  }

  private formInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      questions: {
        orderBy: {
          sortOrder: 'asc' as const,
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
          results: true,
          evaluators: true,
        },
      },
    };
  }

  private evaluatorInclude() {
    return {
      form: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
        },
      },
      evaluatorUser: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
        },
      },
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
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

  private resultInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      form: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
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
      // ผู้ประเมินที่บันทึกไว้ ต้องส่งชื่อกลับไปให้หน้าจอแสดงได้
      evaluatorEmployee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      submittedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      finalizedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      attachments: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
      },
    };
  }

   private async generateWarningLetterNo(companyId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `WL-${year}${month}`;

    const count = await this.prisma.warningLetter.count({
      where: {
        companyId,
        letterNo: {
          startsWith: prefix,
        },
      },
    });

    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  private async ensureWarningLetterNoAvailable(
    letterNo: string,
    companyId: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.warningLetter.findFirst({
      where: {
        companyId,
        letterNo,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException('เลขที่หนังสือเตือนนี้ถูกใช้งานแล้ว');
    }
  }

  private async ensureEmployeeBelongsToCompany(
    employeeId: string,
    companyId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    if (employee.companyId !== companyId) {
      throw new BadRequestException(
        'พนักงานไม่อยู่ในบริษัทที่เลือก กรุณาตรวจสอบข้อมูล',
      );
    }
  }

  private async ensureWarningLetterExists(id: string) {
    const item = await this.prisma.warningLetter.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบหนังสือเตือน');
    }
  }

  private toEndOfDay(date: string) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private warningLetterInclude() {
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
      issuedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      acknowledgedBy: {
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
      disciplinaryHistories: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          eventDate: 'desc' as const,
        },
      },
    };
  }

  private disciplinaryHistoryInclude() {
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
      warningLetter: {
        select: {
          id: true,
          letterNo: true,
          subject: true,
          severity: true,
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
    };
  }

  private decimalToNumber(value?: Prisma.Decimal | number | string | null) {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private optionalTrim(value?: string | null) {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}