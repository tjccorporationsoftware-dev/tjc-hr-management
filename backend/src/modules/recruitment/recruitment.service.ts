import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EmployeeStatus,
  InterviewResult,
  JobApplicationStage,
  JobOfferStatus,
  JobPostingStatus,
  Prisma,
  ProbationStatus,
  WorkHistoryType,
} from '../../generated/prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { generateEmployeeCode } from '../employees/utils/employee-code.util';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';

import {
  CreateJobApplicationDto,
  CreateJobInterviewDto,
  CreateJobOfferDto,
  CreateJobPostingDto,
  HireApplicantDto,
  ListJobApplicationsQueryDto,
  ListJobPostingsQueryDto,
  MoveApplicationStageDto,
  RecordInterviewResultDto,
  UpdateJobApplicationDto,
  UpdateJobOfferStatusDto,
  UpdateJobPostingDto,
} from './dto/recruitment.dto';

/** ลำดับ stage ที่เดินหน้าได้ตามปกติ */
const STAGE_ORDER: JobApplicationStage[] = [
  JobApplicationStage.NEW,
  JobApplicationStage.SCREENING,
  JobApplicationStage.INTERVIEW,
  JobApplicationStage.OFFER,
  JobApplicationStage.HIRED,
];


@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService) {}

  /* ======================================================== */
  /* Job posting                                              */
  /* ======================================================== */

  async findPostings(query: ListJobPostingsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);

    const where: Prisma.JobPostingWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { title: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      this.prisma.jobPosting.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: this.postingInclude(),
      }),
      this.prisma.jobPosting.count({ where }),
      this.buildPostingSummary(where),
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

  async findPosting(id: string, scope: TenantScope) {
    const item = await this.prisma.jobPosting.findFirst({
      where: { id, deletedAt: null },
      include: this.postingInclude(),
    });

    if (!item) throw new NotFoundException('ไม่พบประกาศรับสมัคร');
    assertWithinScope(scope, { companyId: item.companyId });

    return item;
  }

  async createPosting(
    dto: CreateJobPostingDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);

    if (
      dto.salaryMin !== undefined &&
      dto.salaryMax !== undefined &&
      dto.salaryMin > dto.salaryMax
    ) {
      throw new BadRequestException('เงินเดือนขั้นต่ำต้องไม่มากกว่าขั้นสูง');
    }

    const duplicate = await this.prisma.jobPosting.findFirst({
      where: { companyId, code: dto.code.trim(), deletedAt: null },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('รหัสประกาศนี้ถูกใช้ไปแล้ว');
    }

    const status = dto.status ?? JobPostingStatus.DRAFT;

    return this.prisma.jobPosting.create({
      data: {
        companyId,
        branchId: dto.branchId || null,
        departmentId: dto.departmentId || null,
        positionId: dto.positionId || null,
        code: dto.code.trim(),
        title: dto.title.trim(),
        employmentType: dto.employmentType ?? 'FULL_TIME',
        openings: dto.openings ?? 1,
        description: this.optionalTrim(dto.description),
        requirement: this.optionalTrim(dto.requirement),
        salaryMin:
          dto.salaryMin !== undefined ? new Prisma.Decimal(dto.salaryMin) : null,
        salaryMax:
          dto.salaryMax !== undefined ? new Prisma.Decimal(dto.salaryMax) : null,
        workLocation: this.optionalTrim(dto.workLocation),
        status,
        openedAt: status === JobPostingStatus.OPEN ? new Date() : null,
        closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
        createdById: currentUserId ?? null,
      },
      include: this.postingInclude(),
    });
  }

  async updatePosting(
    id: string,
    dto: UpdateJobPostingDto,
    scope: TenantScope,
  ) {
    const current = await this.findPosting(id, scope);

    const nextStatus = dto.status ?? current.status;
    const openedAt =
      nextStatus === JobPostingStatus.OPEN && !current.openedAt
        ? new Date()
        : current.openedAt;
    const closedAt =
      nextStatus === JobPostingStatus.CLOSED && !current.closedAt
        ? new Date()
        : nextStatus === JobPostingStatus.OPEN
          ? null
          : current.closedAt;

    return this.prisma.jobPosting.update({
      where: { id },
      data: {
        ...(dto.branchId !== undefined ? { branchId: dto.branchId || null } : {}),
        ...(dto.departmentId !== undefined
          ? { departmentId: dto.departmentId || null }
          : {}),
        ...(dto.positionId !== undefined
          ? { positionId: dto.positionId || null }
          : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.employmentType !== undefined
          ? { employmentType: dto.employmentType }
          : {}),
        ...(dto.openings !== undefined ? { openings: dto.openings } : {}),
        ...(dto.description !== undefined
          ? { description: this.optionalTrim(dto.description) }
          : {}),
        ...(dto.requirement !== undefined
          ? { requirement: this.optionalTrim(dto.requirement) }
          : {}),
        ...(dto.salaryMin !== undefined
          ? { salaryMin: new Prisma.Decimal(dto.salaryMin) }
          : {}),
        ...(dto.salaryMax !== undefined
          ? { salaryMax: new Prisma.Decimal(dto.salaryMax) }
          : {}),
        ...(dto.workLocation !== undefined
          ? { workLocation: this.optionalTrim(dto.workLocation) }
          : {}),
        ...(dto.closingDate !== undefined
          ? { closingDate: dto.closingDate ? new Date(dto.closingDate) : null }
          : {}),
        status: nextStatus,
        openedAt,
        closedAt,
      },
      include: this.postingInclude(),
    });
  }

  async removePosting(id: string, scope: TenantScope) {
    await this.findPosting(id, scope);

    const applications = await this.prisma.jobApplication.count({
      where: { postingId: id, deletedAt: null },
    });

    if (applications > 0) {
      throw new BadRequestException(
        `ประกาศนี้มีผู้สมัครแล้ว ${applications} คน ลบไม่ได้ ให้ปิดประกาศแทน`,
      );
    }

    await this.prisma.jobPosting.update({
      where: { id },
      data: { deletedAt: new Date(), status: JobPostingStatus.CANCELLED },
    });

    return { success: true };
  }

  /* ======================================================== */
  /* Application                                              */
  /* ======================================================== */

  async findApplications(
    query: ListJobApplicationsQueryDto,
    scope: TenantScope,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);

    const where: Prisma.JobApplicationWhereInput = {
      deletedAt: null,
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(query.postingId ? { postingId: query.postingId } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ stagedAt: 'desc' }],
        include: this.applicationInclude(),
      }),
      this.prisma.jobApplication.count({ where }),
      this.buildApplicationSummary(where),
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

  async findApplication(id: string, scope: TenantScope) {
    const item = await this.prisma.jobApplication.findFirst({
      where: { id, deletedAt: null },
      include: this.applicationInclude(true),
    });

    if (!item) throw new NotFoundException('ไม่พบใบสมัคร');
    assertWithinScope(scope, { companyId: item.companyId });

    return item;
  }

  async createApplication(
    dto: CreateJobApplicationDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const posting = await this.findPosting(dto.postingId, scope);

    if (
      posting.status !== JobPostingStatus.OPEN &&
      posting.status !== JobPostingStatus.DRAFT
    ) {
      throw new BadRequestException('ประกาศนี้ปิดรับสมัครแล้ว');
    }

    // กันสมัครซ้ำประกาศเดิมด้วยอีเมลเดียวกัน
    if (dto.email) {
      const duplicate = await this.prisma.jobApplication.findFirst({
        where: {
          postingId: posting.id,
          email: normalizeEmail(dto.email),
          deletedAt: null,
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException(
          'อีเมลนี้สมัครประกาศนี้ไว้แล้ว',
        );
      }
    }

    return this.prisma.jobApplication.create({
      data: {
        companyId: posting.companyId,
        postingId: posting.id,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: this.optionalEmail(dto.email),
        phone: this.optionalTrim(dto.phone),
        currentPosition: this.optionalTrim(dto.currentPosition),
        expectedSalary:
          dto.expectedSalary !== undefined
            ? new Prisma.Decimal(dto.expectedSalary)
            : null,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
        source: this.optionalTrim(dto.source),
        note: this.optionalTrim(dto.note),

        // ข้อมูลส่วนตัว/ประวัติ/การศึกษา — เก็บตั้งแต่ตอนสมัคร จะได้ไม่ต้องถามซ้ำตอนจ้าง
        nationalId: this.optionalTrim(dto.nationalId),
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        address: this.optionalTrim(dto.address),
        currentCompany: this.optionalTrim(dto.currentCompany),
        currentSalary:
          dto.currentSalary !== undefined
            ? new Prisma.Decimal(dto.currentSalary)
            : null,
        yearsOfExperience: dto.yearsOfExperience ?? null,
        educationLevel: this.optionalTrim(dto.educationLevel),
        educationInstitute: this.optionalTrim(dto.educationInstitute),
        educationMajor: this.optionalTrim(dto.educationMajor),
        resumeUrl: this.optionalTrim(dto.resumeUrl),

        createdById: currentUserId ?? null,
      },
      include: this.applicationInclude(),
    });
  }

  async updateApplication(
    id: string,
    dto: UpdateJobApplicationDto,
    scope: TenantScope,
  ) {
    const current = await this.findApplication(id, scope);

    if (current.stage === JobApplicationStage.HIRED) {
      throw new BadRequestException('ผู้สมัครคนนี้ถูกจ้างแล้ว แก้ไขไม่ได้');
    }

    return this.prisma.jobApplication.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.email !== undefined
          ? { email: this.optionalEmail(dto.email) }
          : {}),
        ...(dto.phone !== undefined ? { phone: this.optionalTrim(dto.phone) } : {}),
        ...(dto.currentPosition !== undefined
          ? { currentPosition: this.optionalTrim(dto.currentPosition) }
          : {}),
        ...(dto.expectedSalary !== undefined
          ? { expectedSalary: new Prisma.Decimal(dto.expectedSalary) }
          : {}),
        ...(dto.availableFrom !== undefined
          ? {
              availableFrom: dto.availableFrom
                ? new Date(dto.availableFrom)
                : null,
            }
          : {}),
        ...(dto.screeningScore !== undefined
          ? { screeningScore: dto.screeningScore }
          : {}),
        ...(dto.note !== undefined ? { note: this.optionalTrim(dto.note) } : {}),
      },
      include: this.applicationInclude(),
    });
  }

  /** ย้าย stage ใน pipeline — HIRED ต้องผ่านการจ้างจริงเท่านั้น */
  async moveStage(
    id: string,
    dto: MoveApplicationStageDto,
    scope: TenantScope,
  ) {
    const current = await this.findApplication(id, scope);

    if (dto.stage === JobApplicationStage.HIRED) {
      throw new BadRequestException(
        'ต้องกด "จ้างเป็นพนักงาน" เพื่อเปลี่ยนเป็นสถานะจ้างแล้ว',
      );
    }

    if (current.stage === JobApplicationStage.HIRED) {
      throw new BadRequestException('ผู้สมัครคนนี้ถูกจ้างแล้ว');
    }

    if (
      dto.stage === JobApplicationStage.REJECTED &&
      !this.optionalTrim(dto.rejectReason)
    ) {
      throw new BadRequestException('กรุณาระบุเหตุผลที่ไม่ผ่าน');
    }

    return this.prisma.jobApplication.update({
      where: { id },
      data: {
        stage: dto.stage,
        stagedAt: new Date(),
        rejectReason:
          dto.stage === JobApplicationStage.REJECTED
            ? this.optionalTrim(dto.rejectReason)
            : null,
      },
      include: this.applicationInclude(),
    });
  }

  /* ======================================================== */
  /* Interview                                                */
  /* ======================================================== */

  async createInterview(
    dto: CreateJobInterviewDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const application = await this.findApplication(dto.applicationId, scope);

    const lastRound = await this.prisma.jobInterview.findFirst({
      where: { applicationId: application.id, deletedAt: null },
      orderBy: { round: 'desc' },
      select: { round: true },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const interview = await tx.jobInterview.create({
        data: {
          applicationId: application.id,
          round: dto.round ?? (lastRound?.round ?? 0) + 1,
          scheduledAt: new Date(dto.scheduledAt),
          location: this.optionalTrim(dto.location),
          interviewerId: dto.interviewerId || null,
          interviewerName: this.optionalTrim(dto.interviewerName),
          note: this.optionalTrim(dto.note),
          createdById: currentUserId ?? null,
        },
      });

      // นัดสัมภาษณ์แล้วให้ pipeline เดินหน้าเองเพื่อไม่ให้ HR ต้องกดสองที
      if (
        application.stage === JobApplicationStage.NEW ||
        application.stage === JobApplicationStage.SCREENING
      ) {
        await tx.jobApplication.update({
          where: { id: application.id },
          data: { stage: JobApplicationStage.INTERVIEW, stagedAt: new Date() },
        });
      }

      return interview;
    });

    return created;
  }

  async recordInterviewResult(
    id: string,
    dto: RecordInterviewResultDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.jobInterview.findFirst({
      where: { id, deletedAt: null },
      include: { application: { select: { companyId: true } } },
    });

    if (!current) throw new NotFoundException('ไม่พบนัดสัมภาษณ์');
    assertWithinScope(scope, { companyId: current.application.companyId });

    return this.prisma.jobInterview.update({
      where: { id },
      data: {
        result: dto.result,
        score: dto.score ?? null,
        strength: this.optionalTrim(dto.strength),
        weakness: this.optionalTrim(dto.weakness),
        note: this.optionalTrim(dto.note) ?? current.note,
        completedAt:
          dto.result === InterviewResult.PENDING ? null : new Date(),
      },
    });
  }

  /* ======================================================== */
  /* Offer                                                    */
  /* ======================================================== */

  async createOffer(
    dto: CreateJobOfferDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const application = await this.findApplication(dto.applicationId, scope);

    if (
      application.stage === JobApplicationStage.REJECTED ||
      application.stage === JobApplicationStage.WITHDRAWN ||
      application.stage === JobApplicationStage.HIRED
    ) {
      throw new BadRequestException('ผู้สมัครคนนี้ปิดเรื่องไปแล้ว');
    }

    const openOffer = await this.prisma.jobOffer.findFirst({
      where: {
        applicationId: application.id,
        deletedAt: null,
        status: { in: [JobOfferStatus.DRAFT, JobOfferStatus.SENT] },
      },
      select: { id: true },
    });

    if (openOffer) {
      throw new ConflictException('มีใบเสนอจ้างที่ยังไม่ปิดอยู่แล้ว');
    }

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.jobOffer.create({
        data: {
          applicationId: application.id,
          offeredSalary: new Prisma.Decimal(dto.offeredSalary),
          startDate: new Date(dto.startDate),
          probationDays: dto.probationDays ?? 119,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          benefitNote: this.optionalTrim(dto.benefitNote),
          note: this.optionalTrim(dto.note),
          createdById: currentUserId ?? null,
        },
      });

      await tx.jobApplication.update({
        where: { id: application.id },
        data: { stage: JobApplicationStage.OFFER, stagedAt: new Date() },
      });

      return offer;
    });
  }

  async updateOfferStatus(
    id: string,
    dto: UpdateJobOfferStatusDto,
    scope: TenantScope,
    currentUserId?: string,
  ) {
    const current = await this.prisma.jobOffer.findFirst({
      where: { id, deletedAt: null },
      include: { application: { select: { id: true, companyId: true } } },
    });

    if (!current) throw new NotFoundException('ไม่พบใบเสนอจ้าง');
    assertWithinScope(scope, { companyId: current.application.companyId });

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.jobOffer.update({
        where: { id },
        data: {
          status: dto.status,
          note: this.optionalTrim(dto.note) ?? current.note,
          ...(dto.status === JobOfferStatus.SENT ? { sentAt: now } : {}),
          // คำตอบของผู้สมัครมาจากการที่ HR โทรไปถามแล้วมาคีย์
          // จึงเก็บทั้งเวลาที่บันทึกและคนที่บันทึกไว้ด้วย
          ...(dto.status === JobOfferStatus.ACCEPTED ||
          dto.status === JobOfferStatus.DECLINED
            ? { respondedAt: now, respondedById: currentUserId ?? null }
            : {}),
        },
      });

      // ปฏิเสธข้อเสนอ = ปิดเรื่องผู้สมัคร
      if (dto.status === JobOfferStatus.DECLINED) {
        await tx.jobApplication.update({
          where: { id: current.application.id },
          data: {
            stage: JobApplicationStage.WITHDRAWN,
            stagedAt: now,
            rejectReason: 'ผู้สมัครปฏิเสธข้อเสนอ',
          },
        });
      }

      return offer;
    });
  }

  /* ======================================================== */
  /* Hire — แปลงผู้สมัครเป็นพนักงาน                            */
  /* ======================================================== */

  async hireApplicant(
    id: string,
    dto: HireApplicantDto,
    currentUserId: string | undefined,
    scope: TenantScope,
  ) {
    const application = await this.findApplication(id, scope);

    if (application.stage === JobApplicationStage.HIRED) {
      throw new BadRequestException('ผู้สมัครคนนี้ถูกจ้างไปแล้ว');
    }

    const acceptedOffer = await this.prisma.jobOffer.findFirst({
      where: {
        applicationId: application.id,
        deletedAt: null,
        status: JobOfferStatus.ACCEPTED,
      },
      orderBy: { respondedAt: 'desc' },
    });

    if (!acceptedOffer) {
      throw new BadRequestException(
        'ต้องมีใบเสนอจ้างที่ผู้สมัครตอบรับแล้วก่อนจึงจะจ้างได้',
      );
    }

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : acceptedOffer.startDate;
    const probationDays = dto.probationDays ?? acceptedOffer.probationDays;

    const probationEndDate =
      probationDays > 0 ? this.addDays(startDate, probationDays) : null;

    const posting = await this.prisma.jobPosting.findUnique({
      where: { id: application.postingId },
      select: { branchId: true, departmentId: true, positionId: true, title: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const employeeCode = await this.generateNextEmployeeCode(
        tx,
        application.companyId,
        startDate,
      );

      const employee = await tx.employee.create({
        data: {
          employeeCode,
          firstName: application.firstName,
          lastName: application.lastName,
          displayName: `${application.firstName} ${application.lastName}`,
          email: application.email,
          phone: application.phone,
          position: posting?.title ?? null,
          positionId: dto.positionId ?? posting?.positionId ?? null,
          startDate,
          probationEndDate,
          status: probationEndDate
            ? EmployeeStatus.PROBATION
            : EmployeeStatus.ACTIVE,
          companyId: application.companyId,
          branchId: dto.branchId ?? posting?.branchId ?? null,
          departmentId: dto.departmentId ?? posting?.departmentId ?? null,
          divisionId: dto.divisionId ?? null,
          employeeTypeId: dto.employeeTypeId ?? null,
          supervisorId: dto.supervisorId ?? null,
        },
      });

      /*
       * ข้อมูลที่เก็บไว้ตั้งแต่ตอนสมัคร ต้องไหลไปอยู่ที่ประวัติพนักงานด้วย
       * ไม่งั้นเลขบัตร/วันเกิด/ที่อยู่/วุฒิ ที่กรอกไว้จะค้างอยู่ในใบสมัคร
       * แล้ว HR ต้องมานั่งคีย์ซ้ำที่หน้า /employees อีกรอบ
       */
      const hasProfileData =
        application.nationalId ||
        application.birthDate ||
        application.address ||
        application.educationLevel ||
        application.educationInstitute ||
        application.educationMajor;

      if (hasProfileData) {
        await tx.employeeProfile.create({
          data: {
            employeeId: employee.id,
            companyId: employee.companyId,
            nationalId: application.nationalId,
            birthDate: application.birthDate,
            currentAddress: application.address,
            educationLevel: application.educationLevel,
            educationInstitute: application.educationInstitute,
            educationMajor: application.educationMajor,
          },
        });
      }

      await tx.employeeWorkHistory.create({
        data: {
          employeeId: employee.id,
          type: WorkHistoryType.JOINED,
          effectiveDate: startDate,
          title: 'เริ่มงาน',
          description: 'จ้างจากระบบสรรหา (ATS)',
          newCompanyId: employee.companyId,
          newBranchId: employee.branchId,
          newDepartmentId: employee.departmentId,
          newPosition: employee.position,
          newStatus: employee.status,
          createdById: currentUserId ?? null,
        },
      });

      // เปิดใบทดลองงานให้ต่อเนื่องเข้าสู่ /onboarding ทันที
      if (probationEndDate) {
        await tx.probationRecord.create({
          data: {
            companyId: employee.companyId,
            employeeId: employee.id,
            startDate,
            endDate: probationEndDate,
            reviewDate: this.addDays(probationEndDate, -19),
            status: ProbationStatus.IN_PROGRESS,
            note: 'สร้างอัตโนมัติจากการจ้างผ่านระบบสรรหา',
            createdById: currentUserId ?? null,
          },
        });
      }

      await tx.jobApplication.update({
        where: { id: application.id },
        data: {
          stage: JobApplicationStage.HIRED,
          stagedAt: new Date(),
          hiredEmployeeId: employee.id,
        },
      });

      // ปิดประกาศอัตโนมัติเมื่อจ้างครบจำนวนที่เปิดรับ
      const hiredCount = await tx.jobApplication.count({
        where: {
          postingId: application.postingId,
          stage: JobApplicationStage.HIRED,
          deletedAt: null,
        },
      });

      const parent = await tx.jobPosting.findUnique({
        where: { id: application.postingId },
        select: { openings: true, status: true },
      });

      if (
        parent &&
        parent.status === JobPostingStatus.OPEN &&
        hiredCount >= parent.openings
      ) {
        await tx.jobPosting.update({
          where: { id: application.postingId },
          data: { status: JobPostingStatus.CLOSED, closedAt: new Date() },
        });
      }

      /*
       * เปิดบัญชีเข้าระบบให้พนักงานใหม่ทันที
       * ----------------------------------
       * เดิมจ้างเสร็จได้แค่แฟ้มพนักงาน ต้องไปสร้างบัญชีเองอีกหน้าหนึ่ง
       * ซึ่งมักลืม แล้วพนักงานใหม่ก็เข้าระบบไม่ได้ทั้งที่เริ่มงานแล้ว
       */
      const account = await this.createEmployeeAccount(tx, {
        employeeId: employee.id,
        email: application.email,
        phone: application.phone,
        displayName: `${application.firstName} ${application.lastName}`,
        companyId: application.companyId,
        branchId: employee.branchId,
      });

      return { employee, applicationId: application.id, account };
    });
  }

  /**
   * เปิดบัญชีเข้าระบบให้พนักงานที่เพิ่งจ้าง
   *
   * เรื่องรหัสผ่านเริ่มต้น
   * ---------------------
   * ใช้ "เบอร์โทรของพนักงาน" เป็นรหัสเริ่มต้นตามที่ตกลงไว้ เพื่อให้ HR ไม่ต้อง
   * คัดลอกรหัสไปส่งต่อ — บอกพนักงานได้เลยว่าใช้เบอร์ตัวเอง
   *
   * รหัสแบบนี้เดาง่ายมาก (เบอร์โทรอยู่ในแฟ้มพนักงานที่คนใน HR เห็นได้)
   * จึงกันความเสี่ยงด้วย mustChangePassword — ล็อกอินได้ครั้งเดียวแล้วต้อง
   * เปลี่ยนทันที ระบบบล็อกทุก API จนกว่าจะเปลี่ยน รหัสเบอร์โทรจึงมีอายุสั้นมาก
   *
   * เส้นทางนี้ไม่ผ่าน assertStrongPassword โดยตั้งใจ (กฎห้ามใช้ข้อมูลส่วนตัว
   * และบังคับ 12 ตัวอักษร) — ยกเว้นเฉพาะรหัสเริ่มต้นตรงนี้เท่านั้น
   * ตอนพนักงานเปลี่ยนรหัสเองยังบังคับกฎเต็มเหมือนเดิม
   *
   * ไม่มีเบอร์โทรหรือเบอร์สั้นเกินไป -> ถอยไปสุ่มรหัสให้แทน
   */
  private async createEmployeeAccount(
    tx: Prisma.TransactionClient,
    input: {
      employeeId: string;
      email?: string | null;
      phone?: string | null;
      displayName: string;
      companyId: string;
      branchId?: string | null;
    },
  ) {
    const email = input.email ? normalizeEmail(input.email) : undefined;

    if (!email) {
      return { created: false, reason: 'ผู้สมัครไม่ได้ระบุอีเมล จึงยังเปิดบัญชีให้ไม่ได้' };
    }

    const existing = await tx.user.findFirst({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      // อีเมลนี้มีบัญชีอยู่แล้ว ผูกเข้ากับพนักงานใหม่แทนการสร้างซ้ำ
      await tx.employee.update({
        where: { id: input.employeeId },
        data: { userId: existing.id },
      });

      return { created: false, reason: 'อีเมลนี้มีบัญชีอยู่แล้ว ระบบผูกบัญชีเดิมให้แทน' };
    }

    const role = await tx.role.findFirst({
      where: { code: 'EMPLOYEE', OR: [{ companyId: null }, { companyId: input.companyId }] },
      select: { id: true },
      orderBy: { companyId: 'desc' },
    });

    if (!role) {
      return { created: false, reason: 'ไม่พบบทบาท EMPLOYEE ในระบบ' };
    }

    /*
     * เบอร์โทรตัดเหลือเฉพาะตัวเลข เพื่อให้พนักงานพิมพ์ยังไงก็ตรง
     * (แฟ้มอาจเก็บเป็น 089-123-4567 แต่คนพิมพ์ 0891234567)
     */
    const phoneDigits = (input.phone ?? '').replace(/\D/g, '');

    // ต่ำกว่า 8 ตัวจะติดกฎความยาวขั้นต่ำตอนล็อกอิน ใช้เป็นรหัสไม่ได้
    const usePhone = phoneDigits.length >= 8;
    const temporaryPassword = usePhone
      ? phoneDigits
      : this.generateTemporaryPassword();

    /*
     * ขอบเขตของบัญชีพนักงาน — ตั้งเป็น "สาขา" เป็นหลัก
     * -----------------------------------------------
     * พนักงานทั่วไปควรเห็นแค่สาขาตัวเอง ไม่ใช่ทั้งบริษัท
     *
     * ถ้าแฟ้มพนักงานไม่มีสาขา (ประกาศรับสมัครไม่ได้ระบุไว้) แต่บริษัทมีสาขาเดียว
     * ก็ใช้สาขานั้นได้เลยเพราะไม่กำกวม — เหลือกรณีบริษัทหลายสาขาและไม่ระบุ
     * เท่านั้นที่ต้องถอยไปเป็นทั้งบริษัท และบอก HR ให้ไปตั้งสาขาให้ถูก
     */
    const scope = await this.resolveEmployeeAccountScope(tx, {
      companyId: input.companyId,
      branchId: input.branchId ?? null,
    });

    const user = await tx.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(temporaryPassword, 12),
        displayName: input.displayName,
        status: 'ACTIVE',
        mustChangePassword: true,
        scopeLevel: scope.level,
        scopedCompanyId: input.companyId,
        scopedBranchId: scope.branchId,
        roles: { create: [{ roleId: role.id }] },
      },
      select: { id: true, email: true },
    });

    await tx.employee.update({
      where: { id: input.employeeId },
      data: { userId: user.id },
    });

    return {
      created: true,
      userId: user.id,
      email: user.email,
      scopeLevel: scope.level,
      scopeNote: scope.note,
      temporaryPassword,
      // บอกที่มาของรหัส เพื่อให้หน้าเว็บเลือกข้อความให้ HR ได้ถูก
      passwordSource: usePhone ? ('PHONE' as const) : ('RANDOM' as const),
      note: usePhone
        ? 'รหัสเริ่มต้นคือเบอร์โทรของพนักงาน (เฉพาะตัวเลข) — ระบบบังคับให้เปลี่ยนตอนเข้าครั้งแรก'
        : 'ไม่มีเบอร์โทรที่ใช้เป็นรหัสได้ ระบบจึงสุ่มรหัสให้ — ส่งรหัสนี้ให้พนักงาน',
    };
  }

  /**
   * หาขอบเขตที่ควรให้บัญชีพนักงานใหม่
   * คืนค่า note มาด้วยเมื่อไม่ได้ขอบเขตระดับสาขาตามที่ตั้งใจ HR จะได้รู้ว่าต้องไปแก้อะไร
   */
  private async resolveEmployeeAccountScope(
    tx: Prisma.TransactionClient,
    input: { companyId: string; branchId: string | null },
  ): Promise<{
    level: 'COMPANY' | 'BRANCH';
    branchId: string | null;
    note?: string;
  }> {
    if (input.branchId) {
      return { level: 'BRANCH', branchId: input.branchId };
    }

    const branches = await tx.branch.findMany({
      where: { companyId: input.companyId, deletedAt: null },
      select: { id: true },
      take: 2,
    });

    if (branches.length === 1) {
      return {
        level: 'BRANCH',
        branchId: branches[0].id,
        note: 'แฟ้มพนักงานยังไม่ได้ระบุสาขา ระบบใช้สาขาเดียวที่บริษัทมีให้',
      };
    }

    return {
      level: 'COMPANY',
      branchId: null,
      note:
        branches.length === 0
          ? 'บริษัทยังไม่มีสาขา บัญชีจึงได้ขอบเขตทั้งบริษัทไปก่อน'
          : 'ประกาศรับสมัครไม่ได้ระบุสาขา บัญชีจึงได้ขอบเขตทั้งบริษัท — แก้สาขาในแฟ้มพนักงานแล้วปรับขอบเขตที่หน้าผู้ใช้',
    };
  }

  /** รหัสชั่วคราวที่ผ่านกฎของระบบแน่นอน (ยาว 14 · ครบทุกประเภทอักขระ) */
  private generateTemporaryPassword() {
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '!#$%&*+-=?@';
    const all = lower + upper + digits + symbols;

    const pick = (pool: string) =>
      pool[Math.floor(Math.random() * pool.length)];

    const characters = [
      pick(lower),
      pick(upper),
      pick(digits),
      pick(symbols),
      ...Array.from({ length: 10 }, () => pick(all)),
    ];

    // สลับตำแหน่ง ไม่งั้นตัวแรก ๆ จะเดารูปแบบได้
    for (let index = characters.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [characters[index], characters[swap]] = [characters[swap], characters[index]];
    }

    return characters.join('');
  }

  /* ======================================================== */
  /* Helpers                                                  */
  /* ======================================================== */

  private postingInclude() {
    return {
      company: { select: { id: true, code: true, nameTh: true } },
      department: { select: { id: true, code: true, nameTh: true } },
      branch: { select: { id: true, code: true, nameTh: true } },
      _count: { select: { applications: { where: { deletedAt: null } } } },
    };
  }

  private applicationInclude(full = false) {
    return {
      posting: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          openings: true,
        },
      },
      hiredEmployee: {
        select: { id: true, employeeCode: true, displayName: true },
      },
      ...(full
        ? {
            interviews: {
              where: { deletedAt: null },
              orderBy: { round: 'asc' as const },
            },
            offers: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' as const },
              // ใครเป็นคนบันทึกคำตอบของผู้สมัคร — ต้องเห็นได้จากหน้าจอ
              include: {
                respondedBy: { select: { id: true, displayName: true } },
              },
            },
            attachments: { where: { deletedAt: null } },
          }
        : {
            _count: {
              select: {
                interviews: { where: { deletedAt: null } },
                offers: { where: { deletedAt: null } },
              },
            },
          }),
    };
  }

  private buildPostingSummary(where: Prisma.JobPostingWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const [total, open, draft, closed] = await Promise.all([
        tx.jobPosting.count({ where }),
        tx.jobPosting.count({ where: { ...where, status: JobPostingStatus.OPEN } }),
        tx.jobPosting.count({
          where: { ...where, status: JobPostingStatus.DRAFT },
        }),
        tx.jobPosting.count({
          where: { ...where, status: JobPostingStatus.CLOSED },
        }),
      ]);

      return { total, open, draft, closed };
    });
  }

  private buildApplicationSummary(where: Prisma.JobApplicationWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const counts = await Promise.all(
        [
          ...STAGE_ORDER,
          JobApplicationStage.REJECTED,
          JobApplicationStage.WITHDRAWN,
        ].map((stage) => tx.jobApplication.count({ where: { ...where, stage } })),
      );

      const total = await tx.jobApplication.count({ where });

      return {
        total,
        new: counts[0],
        screening: counts[1],
        interview: counts[2],
        offer: counts[3],
        hired: counts[4],
        rejected: counts[5],
        withdrawn: counts[6],
      };
    });
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  /** ใช้รูปแบบรหัสเดียวกับการเพิ่มพนักงานปกติ */
  /**
   * ออกรหัสพนักงานตอนรับผู้สมัครเข้าทำงาน
   * ใช้ตัวกลางตัวเดียวกับหน้าพนักงาน ไม่งั้นสองทางเข้าจะออกรหัสคนละแบบ
   */
  private async generateNextEmployeeCode(
    tx: Prisma.TransactionClient,
    companyId: string,
    startDate: Date,
  ) {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { code: true },
    });

    return generateEmployeeCode(tx, {
      companyId,
      companyCode: company?.code ?? null,
      startDate,
    });
  }

  /** อีเมลของผู้สมัคร — เก็บรูปแบบเดียวกับตอนล็อกอิน ไม่งั้นพอจ้างแล้วเข้าระบบไม่ได้ */
  private optionalEmail(value?: string | null) {
    if (value === undefined || value === null) return value ?? null;
    const normalized = normalizeEmail(value);
    return normalized.length > 0 ? normalized : null;
  }

  private optionalTrim(value?: string | null) {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
