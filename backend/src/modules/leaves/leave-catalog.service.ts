import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertCompanyLevelWrite,
  assertWithinScope,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';
import {
  CopyLeavePolicyDto,
  ListLeaveCatalogQueryDto,
  SaveLeaveTypeMatrixDto,
} from './dto/leave-catalog.dto';

/**
 * LeaveCatalogService
 * -----------------------------------------------------------------------------
 * ประเภทการลาเป็น master ระดับระบบ (leave_type_catalog) ใช้ร่วมกันทุกบริษัท
 * บริษัทไหนต้องการใช้จึง "เปิดใช้" ระบบจะสร้าง LeaveType ของบริษัทนั้น
 * พร้อมนโยบายตั้งต้นครบทุกประเภทพนักงาน
 *
 * ระดับของข้อมูล
 *   catalog      -> ระบบ    : ชื่อ/รหัสอ้างอิง/ค่าตั้งต้น
 *   LeaveType    -> บริษัท  : เงื่อนไขที่ใช้ร่วมกันทุกสาขา
 *   LeavePolicy  -> สาขา x ประเภทพนักงาน : โควตา ค่าปรับ ฐานคำนวณ
 *   LeaveQuotaTier -> ขั้นบันไดอายุงานของแต่ละ policy
 */
@Injectable()
export class LeaveCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly policyInclude = {
    employeeType: {
      select: { id: true, code: true, nameTh: true, nameEn: true },
    },
    branch: {
      select: { id: true, code: true, nameTh: true, nameEn: true },
    },
    quotaTiers: {
      orderBy: [{ minServiceMonths: 'asc' as const }],
    },
  };

  /* ------------------------------------------------------------------ */
  /* catalog                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * รายการประเภทลามาตรฐานทั้งหมด พร้อมสถานะว่าบริษัทนี้เปิดใช้แล้วหรือยัง
   */
  async listCatalog(query: ListLeaveCatalogQueryDto, scope: TenantScope) {
    const companyId = requireCompanyId(scope, query.companyId);
    assertWithinScope(scope, { companyId });

    const where: Prisma.LeaveTypeCatalogWhereInput = { deletedAt: null };

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { referenceCode: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { nameTh: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [catalogItems, companyTypes] = await Promise.all([
      this.prisma.leaveTypeCatalog.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { referenceCode: 'asc' }],
      }),
      this.prisma.leaveType.findMany({
        where: { companyId, deletedAt: null },
        include: {
          policies: {
            where: { deletedAt: null },
            include: this.policyInclude,
            orderBy: [{ branchId: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
    ]);

    const byCatalogId = new Map(
      companyTypes
        .filter((type) => type.catalogId)
        .map((type) => [type.catalogId as string, type]),
    );

    const items = catalogItems.map((item) => {
      const companyType = byCatalogId.get(item.id) ?? null;

      return {
        ...item,
        enabled: Boolean(companyType && companyType.status === 'ACTIVE'),
        companyLeaveType: companyType,
      };
    });

    // ประเภทลาที่บริษัทสร้างเอง (ไม่ได้มาจาก catalog) แสดงต่อท้าย
    const customTypes = companyTypes.filter((type) => !type.catalogId);

    const filtered =
      query.enabledOnly === 'true'
        ? items.filter((item) => item.enabled)
        : items;

    return {
      companyId,
      items: filtered,
      customTypes,
      summary: {
        total: catalogItems.length,
        enabled: items.filter((item) => item.enabled).length,
        custom: customTypes.length,
      },
    };
  }

  /**
   * เปิดใช้ประเภทลาให้บริษัท — สร้าง LeaveType + นโยบายตั้งต้นทุกประเภทพนักงาน
   * เรียกซ้ำได้ (ถ้าเคยเปิดแล้วจะกลับมาเป็น ACTIVE โดยไม่ทับค่าที่แก้ไว้)
   */
  async enableForCompany(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, requestedCompanyId);
    assertWithinScope(scope, { companyId });
    // เปิด/ปิดประเภทลา มีผลทั้งบริษัท บัญชีระดับสาขาจึงสั่งไม่ได้
    assertCompanyLevelWrite(scope, 'ประเภทการลา');

    const catalog = await this.prisma.leaveTypeCatalog.findFirst({
      where: { id: catalogId, deletedAt: null },
    });

    if (!catalog) {
      throw new NotFoundException('ไม่พบประเภทการลาในรายการมาตรฐาน');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('ไม่พบบริษัท หรือบริษัทไม่พร้อมใช้งาน');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.leaveType.findFirst({
        where: { companyId, catalogId: catalog.id, deletedAt: null },
        select: { id: true },
      });

      let leaveTypeId = existing?.id ?? null;

      if (leaveTypeId) {
        await tx.leaveType.update({
          where: { id: leaveTypeId },
          data: { status: 'ACTIVE', deletedAt: null },
        });
      } else {
        // code ต้องไม่ชนกับประเภทลาเดิมของบริษัท
        const code = await this.resolveAvailableCode(
          tx,
          companyId,
          catalog.code,
        );

        const created = await tx.leaveType.create({
          data: {
            companyId,
            catalogId: catalog.id,
            referenceCode: catalog.referenceCode,
            code,
            nameTh: catalog.nameTh,
            nameEn: catalog.nameEn,
            description: catalog.description,

            isPaid: catalog.isPaid,
            requiresAttachment: catalog.requiresAttachment,
            allowHalfDay: catalog.allowHalfDay,
            allowHourly: catalog.allowHourly,

            deductQuota: catalog.deductQuota,
            affectAttendance: catalog.affectAttendance,
            affectPayroll: catalog.affectPayroll,

            minLeaveUnitMinutes: catalog.minLeaveUnitMinutes,
            maxLeaveDaysPerRequest: catalog.maxLeaveDaysPerRequest,

            advanceNoticeDays: catalog.advanceNoticeDays,
            allowBackdated: catalog.allowBackdated,
            maxBackdatedDays: catalog.maxBackdatedDays,
            backdatedRequiresAttachment: catalog.backdatedRequiresAttachment,
            backdatedRequiresHrApproval: catalog.backdatedRequiresHrApproval,

            allowNegativeBalance: catalog.allowNegativeBalance,
            negativeBalanceMode: catalog.negativeBalanceMode,
            enforceQuotaLimit: catalog.enforceQuotaLimit,

            includeHoliday: catalog.includeHoliday,
            includeWeekend: catalog.includeWeekend,
            attachmentRequiredAfterDays: catalog.attachmentRequiredAfterDays,

            quotaAccrualYears: catalog.quotaAccrualYears,
            genderEligibility: catalog.genderEligibility,
            serviceStartBasis: catalog.serviceStartBasis,
            requireProbationPassed: catalog.requireProbationPassed,
            prorateFirstYear: catalog.prorateFirstYear,
            roundingMode: catalog.roundingMode,
            quotaDisplayUnit: catalog.quotaDisplayUnit,

            status: 'ACTIVE',
          },
          select: { id: true },
        });

        leaveTypeId = created.id;
      }

      /*
       * นโยบายตั้งต้น "ระดับบริษัท" = branchId null + employeeTypeId null ใบเดียว
       *
       * เดิมสร้างใบแยกให้ทุกประเภทพนักงาน ซึ่ง resolver ถือว่าเจาะจงกว่าเสมอ
       * ผลคือค่าที่ HR ตั้งไว้ที่นโยบายระดับบริษัทไม่เคยถูกใช้เลย และแก้โควตา
       * ทีเดียวไม่ได้ ต้องไล่แก้ทีละประเภทโดยไม่มีอะไรบอก
       *
       * ถ้าบริษัทต้องการโควตาต่างกันรายประเภทพนักงาน ให้เพิ่มใบเจาะจงเองทีหลัง
       * ซึ่งจะชนะใบระดับบริษัทตามลำดับความเจาะจงเหมือนเดิม
       */
      const existingPolicy = await tx.leavePolicy.findFirst({
        where: {
          companyId,
          branchId: null,
          leaveTypeId,
          employeeTypeId: null,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existingPolicy) {
        await tx.leavePolicy.update({
          where: { id: existingPolicy.id },
          data: { status: 'ACTIVE', deletedAt: null },
        });
      } else {
        const policy = await tx.leavePolicy.create({
          data: {
            companyId,
            branchId: null,
            leaveTypeId,
            employeeTypeId: null,
            annualQuotaDays: catalog.defaultAnnualQuotaDays,
            maxConsecutiveDays: catalog.defaultMaxConsecutiveDays,
            allowCarryForward: catalog.defaultAllowCarryForward,
            carryForwardLimitDays: 0,
            requireApproval: true,
            unpaidDeductionMultiplier: catalog.defaultUnpaidDeductionMultiplier,
            includeInTax: catalog.defaultIncludeInTax,
            includeInSocialSecurity: catalog.defaultIncludeInSocialSecurity,
            status: 'ACTIVE',
          },
          select: { id: true },
        });

        await tx.leaveQuotaTier.create({
          data: {
            policyId: policy.id,
            minServiceMonths: 0,
            quotaDays: catalog.defaultAnnualQuotaDays,
            sortOrder: 0,
          },
        });
      }

      return this.findTypeWithPolicies(tx, leaveTypeId);
    });
  }

  /**
   * ปิดใช้ประเภทลาของบริษัท — เก็บข้อมูลไว้ทั้งหมด แค่หยุดให้ยื่นคำขอใหม่
   */
  async disableForCompany(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, requestedCompanyId);
    assertWithinScope(scope, { companyId });
    // ปิดประเภทลา มีผลทั้งบริษัท บัญชีระดับสาขาจึงสั่งไม่ได้
    assertCompanyLevelWrite(scope, 'ประเภทการลา');

    const leaveType = await this.prisma.leaveType.findFirst({
      where: { companyId, catalogId, deletedAt: null },
      select: { id: true },
    });

    if (!leaveType) {
      throw new NotFoundException('บริษัทนี้ยังไม่ได้เปิดใช้ประเภทการลานี้');
    }

    const pending = await this.prisma.leaveRequest.count({
      where: {
        leaveTypeId: leaveType.id,
        deletedAt: null,
        status: { in: ['DRAFT', 'SUBMITTED'] },
      },
    });

    if (pending > 0) {
      throw new BadRequestException(
        `ยังมีคำขอลาประเภทนี้ค้างอยู่ ${pending.toLocaleString('th-TH')} รายการ กรุณาปิดงานให้เรียบร้อยก่อน`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.leaveType.update({
        where: { id: leaveType.id },
        data: { status: 'INACTIVE' },
      }),
      this.prisma.leavePolicy.updateMany({
        where: { leaveTypeId: leaveType.id, deletedAt: null },
        data: { status: 'INACTIVE' },
      }),
    ]);

    return { id: leaveType.id, catalogId, companyId, enabled: false };
  }

  /* ------------------------------------------------------------------ */
  /* matrix : ประเภทลา + นโยบายทุกประเภทพนักงาน ในครั้งเดียว              */
  /* ------------------------------------------------------------------ */

  /**
   * ข้อมูลทั้งหมดที่หน้าตั้งค่าต้องใช้สำหรับประเภทลา 1 รายการ
   * รวมนโยบายของขอบเขตที่เลือก และค่าที่สืบทอดมาจากบริษัท
   */
  async getMatrix(
    leaveTypeId: string,
    branchId: string | null,
    scope: TenantScope,
  ) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: leaveTypeId, deletedAt: null },
      include: {
        catalog: true,
        policies: {
          where: { deletedAt: null },
          include: this.policyInclude,
        },
      },
    });

    if (!leaveType) {
      throw new NotFoundException('ไม่พบประเภทการลา');
    }

    assertWithinScope(scope, { companyId: leaveType.companyId });

    const employeeTypes = await this.prisma.employeeType.findMany({
      where: {
        companyId: leaveType.companyId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true, code: true, nameTh: true, nameEn: true },
      orderBy: { code: 'asc' },
    });

    const rows = employeeTypes.map((employeeType) => {
      const own = leaveType.policies.find(
        (policy) =>
          (policy.branchId ?? null) === branchId &&
          policy.employeeTypeId === employeeType.id,
      );
      const companyDefault = leaveType.policies.find(
        (policy) =>
          policy.branchId === null && policy.employeeTypeId === employeeType.id,
      );
      const fallback = leaveType.policies.find(
        (policy) =>
          (policy.branchId ?? null) === branchId &&
          policy.employeeTypeId === null,
      );

      const effective = own ?? companyDefault ?? fallback ?? null;

      return {
        employeeType,
        policy: effective,
        /** true = ตั้งค่าเฉพาะขอบเขตนี้เอง / false = สืบทอดมา */
        isOwnScope: Boolean(own),
        inheritedFrom: own
          ? null
          : companyDefault
            ? 'COMPANY'
            : fallback
              ? 'ALL_EMPLOYEE_TYPES'
              : null,
      };
    });

    /** สาขาที่ตั้งค่าแยกจากบริษัท */
    const overriddenBranches = Array.from(
      new Map(
        leaveType.policies
          .filter((policy) => policy.branchId && policy.branch)
          .map((policy) => [policy.branchId as string, policy.branch]),
      ).values(),
    );

    return {
      leaveType,
      branchId,
      employeeTypes,
      rows,
      overriddenBranches,
    };
  }

  /**
   * บันทึกประเภทลา + นโยบายทุกแถวใน transaction เดียว
   * เงื่อนไขระดับประเภทลา -> มีผลทุกสาขา
   * โควตา/ค่าปรับ/ฐานคำนวณ -> มีผลเฉพาะขอบเขต branchId ที่ส่งมา
   */
  async saveMatrix(
    leaveTypeId: string,
    dto: SaveLeaveTypeMatrixDto,
    scope: TenantScope,
  ) {
    const current = await this.prisma.leaveType.findFirst({
      where: { id: leaveTypeId, deletedAt: null },
      select: { id: true, companyId: true },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบประเภทการลา');
    }

    const branchId = dto.branchId ?? null;
    assertWithinScope(scope, { companyId: current.companyId, branchId });
    assertCompanyLevelWrite(scope, 'นโยบายการลา');

    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, companyId: current.companyId, deletedAt: null },
        select: { id: true },
      });

      if (!branch) {
        throw new BadRequestException('ไม่พบสาขานี้ในบริษัทที่เลือก');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.leaveType.update({
        where: { id: leaveTypeId },
        data: {
          nameTh: dto.nameTh?.trim() || undefined,
          nameEn:
            dto.nameEn === undefined ? undefined : dto.nameEn?.trim() || null,
          description:
            dto.description === undefined
              ? undefined
              : dto.description?.trim() || null,

          isPaid: dto.isPaid,
          requiresAttachment: dto.requiresAttachment,
          attachmentRequiredAfterDays: dto.attachmentRequiredAfterDays,
          allowHalfDay: dto.allowHalfDay,
          allowHourly: dto.allowHourly,
          minLeaveUnitMinutes: dto.minLeaveUnitMinutes,
          maxLeaveDaysPerRequest: dto.maxLeaveDaysPerRequest,

          deductQuota: dto.deductQuota,
          affectAttendance: dto.affectAttendance,
          affectPayroll: dto.affectPayroll,

          advanceNoticeDays: dto.advanceNoticeDays,
          allowBackdated: dto.allowBackdated,
          maxBackdatedDays: dto.maxBackdatedDays,
          backdatedRequiresAttachment: dto.backdatedRequiresAttachment,
          backdatedRequiresHrApproval: dto.backdatedRequiresHrApproval,

          // สวิตช์เดียวคุมทั้ง 3 ฟิลด์ ไม่ให้ค้างขัดกันจนสวิตช์ไม่มีผล
          enforceQuotaLimit: dto.enforceQuotaLimit,
          allowNegativeBalance:
            dto.enforceQuotaLimit === undefined
              ? undefined
              : !dto.enforceQuotaLimit,
          negativeBalanceMode:
            dto.enforceQuotaLimit === undefined
              ? undefined
              : dto.enforceQuotaLimit
                ? 'BLOCK'
                : 'ALLOW_WITH_WARNING',

          includeHoliday: dto.includeHoliday,
          includeWeekend: dto.includeWeekend,

          quotaAccrualYears: dto.quotaAccrualYears,
          genderEligibility: dto.genderEligibility,
          serviceStartBasis: dto.serviceStartBasis,
          requireProbationPassed: dto.requireProbationPassed,
          prorateFirstYear: dto.prorateFirstYear,
          roundingMode: dto.roundingMode,
          quotaDisplayUnit: dto.quotaDisplayUnit,

          status: dto.status,
        },
      });

      for (const row of dto.policies ?? []) {
        const employeeTypeId = row.employeeTypeId ?? null;

        if (employeeTypeId) {
          const employeeType = await tx.employeeType.findFirst({
            where: {
              id: employeeTypeId,
              companyId: current.companyId,
              deletedAt: null,
            },
            select: { id: true },
          });

          if (!employeeType) {
            throw new BadRequestException(
              'ไม่พบประเภทพนักงานนี้ในบริษัทที่เลือก',
            );
          }
        }

        const existing = await tx.leavePolicy.findFirst({
          where: {
            companyId: current.companyId,
            branchId,
            leaveTypeId,
            employeeTypeId,
            deletedAt: null,
          },
          select: { id: true },
        });

        const data = {
          annualQuotaDays: row.annualQuotaDays,
          maxConsecutiveDays: row.maxConsecutiveDays ?? null,
          allowCarryForward: row.allowCarryForward ?? false,
          carryForwardLimitDays: row.carryForwardLimitDays ?? 0,
          requireApproval: row.requireApproval ?? true,
          unpaidDeductionMultiplier: row.unpaidDeductionMultiplier ?? 0,
          includeInTax: row.includeInTax ?? true,
          includeInSocialSecurity: row.includeInSocialSecurity ?? false,
          status: row.status ?? ('ACTIVE' as const),
        };

        const policyId = existing
          ? (
              await tx.leavePolicy.update({
                where: { id: existing.id },
                data: { ...data, deletedAt: null },
                select: { id: true },
              })
            ).id
          : (
              await tx.leavePolicy.create({
                data: {
                  companyId: current.companyId,
                  branchId,
                  leaveTypeId,
                  employeeTypeId,
                  ...data,
                },
                select: { id: true },
              })
            ).id;

        if (row.quotaTiers) {
          await this.replaceQuotaTiers(tx, policyId, row.quotaTiers);
        }
      }

      return this.findTypeWithPolicies(tx, leaveTypeId);
    });
  }

  /* ------------------------------------------------------------------ */
  /* copy                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * คัดลอกนโยบายการลาจากบริษัท/สาขาหนึ่งไปอีกที่หนึ่ง
   * ใช้ตอนตั้งบริษัทแรกเสร็จแล้วอยากให้บริษัทอื่นเริ่มจากค่าเดียวกัน
   */
  async copyPolicies(dto: CopyLeavePolicyDto, scope: TenantScope) {
    assertWithinScope(scope, { companyId: dto.fromCompanyId });
    assertWithinScope(scope, { companyId: dto.toCompanyId });
    // ปลายทางที่จะเขียนทับต้องอยู่ในสิทธิ์ของผู้สั่ง
    assertCompanyLevelWrite(scope, 'นโยบายการลา');

    if (
      dto.fromCompanyId === dto.toCompanyId &&
      (dto.fromBranchId ?? null) === (dto.toBranchId ?? null)
    ) {
      throw new BadRequestException('ต้นทางและปลายทางเป็นขอบเขตเดียวกัน');
    }

    const sourceTypes = await this.prisma.leaveType.findMany({
      where: {
        companyId: dto.fromCompanyId,
        deletedAt: null,
        status: 'ACTIVE',
        catalogId: dto.catalogIds?.length
          ? { in: dto.catalogIds }
          : { not: null },
      },
      include: {
        policies: {
          where: { deletedAt: null, branchId: dto.fromBranchId ?? null },
          include: {
            quotaTiers: true,
            employeeType: { select: { code: true } },
          },
        },
      },
    });

    if (sourceTypes.length === 0) {
      throw new BadRequestException('ต้นทางยังไม่มีประเภทการลาที่เปิดใช้');
    }

    // จับคู่ประเภทพนักงานข้ามบริษัทด้วย code (รายเดือน/รายวัน/เหมาจ่าย)
    const targetEmployeeTypes = await this.prisma.employeeType.findMany({
      where: { companyId: dto.toCompanyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, code: true },
    });
    const targetEmployeeTypeByCode = new Map(
      targetEmployeeTypes.map((item) => [item.code, item.id]),
    );

    const copiedCatalogIds: string[] = [];
    let copiedPolicies = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const source of sourceTypes) {
        if (!source.catalogId) continue;

        const target = await this.ensureCompanyLeaveType(
          tx,
          dto.toCompanyId,
          source,
        );

        copiedCatalogIds.push(source.catalogId);

        for (const policy of source.policies) {
          const employeeTypeId = policy.employeeType?.code
            ? (targetEmployeeTypeByCode.get(policy.employeeType.code) ?? null)
            : null;

          // ต้นทางมีประเภทพนักงานที่ปลายทางไม่มี -> ข้ามแถวนั้น
          if (policy.employeeTypeId && !employeeTypeId) continue;

          const existing = await tx.leavePolicy.findFirst({
            where: {
              companyId: dto.toCompanyId,
              branchId: dto.toBranchId ?? null,
              leaveTypeId: target.id,
              employeeTypeId,
              deletedAt: null,
            },
            select: { id: true },
          });

          const data = {
            annualQuotaDays: policy.annualQuotaDays,
            maxConsecutiveDays: policy.maxConsecutiveDays,
            allowCarryForward: policy.allowCarryForward,
            carryForwardLimitDays: policy.carryForwardLimitDays,
            requireApproval: policy.requireApproval,
            unpaidDeductionMultiplier: policy.unpaidDeductionMultiplier,
            includeInTax: policy.includeInTax,
            includeInSocialSecurity: policy.includeInSocialSecurity,
            quotaPeriod: policy.quotaPeriod,
            monthlyAccrualDays: policy.monthlyAccrualDays,
            probationEligibleAfterDays: policy.probationEligibleAfterDays,
            status: 'ACTIVE' as const,
          };

          const policyId = existing
            ? (
                await tx.leavePolicy.update({
                  where: { id: existing.id },
                  data: { ...data, deletedAt: null },
                  select: { id: true },
                })
              ).id
            : (
                await tx.leavePolicy.create({
                  data: {
                    companyId: dto.toCompanyId,
                    branchId: dto.toBranchId ?? null,
                    leaveTypeId: target.id,
                    employeeTypeId,
                    ...data,
                  },
                  select: { id: true },
                })
              ).id;

          await this.replaceQuotaTiers(
            tx,
            policyId,
            policy.quotaTiers.map((tier) => ({
              minServiceMonths: tier.minServiceMonths,
              quotaDays: Number(tier.quotaDays),
            })),
          );

          copiedPolicies += 1;
        }
      }

      if (dto.mode === 'REPLACE') {
        await tx.leaveType.updateMany({
          where: {
            companyId: dto.toCompanyId,
            deletedAt: null,
            status: 'ACTIVE',
            catalogId: { notIn: copiedCatalogIds },
          },
          data: { status: 'INACTIVE' },
        });
      }
    });

    return {
      copiedLeaveTypes: copiedCatalogIds.length,
      copiedPolicies,
      mode: dto.mode ?? 'MERGE',
    };
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  private async replaceQuotaTiers(
    tx: Prisma.TransactionClient,
    policyId: string,
    tiers: Array<{ minServiceMonths: number; quotaDays: number }>,
  ) {
    await tx.leaveQuotaTier.deleteMany({ where: { policyId } });

    // กันแถวซ้ำ (unique policyId+minServiceMonths) และเรียงตามอายุงาน
    const unique = new Map<number, number>();
    for (const tier of tiers) {
      unique.set(tier.minServiceMonths, tier.quotaDays);
    }

    const sorted = Array.from(unique.entries()).sort((a, b) => a[0] - b[0]);

    if (sorted.length === 0) return;

    await tx.leaveQuotaTier.createMany({
      data: sorted.map(([minServiceMonths, quotaDays], index) => ({
        policyId,
        minServiceMonths,
        quotaDays,
        sortOrder: index,
      })),
    });
  }

  /**
   * หา LeaveType ปลายทางของ catalog เดียวกัน ถ้ายังไม่มีก็สร้างจากค่าของต้นทาง
   */
  private async ensureCompanyLeaveType(
    tx: Prisma.TransactionClient,
    companyId: string,
    source: {
      catalogId: string | null;
      code: string;
      nameTh: string;
      nameEn: string | null;
      description: string | null;
      referenceCode: string | null;
      isPaid: boolean;
      requiresAttachment: boolean;
      allowHalfDay: boolean;
      allowHourly: boolean;
      deductQuota: boolean;
      affectAttendance: boolean;
      affectPayroll: boolean;
      minLeaveUnitMinutes: number;
      maxLeaveDaysPerRequest: Prisma.Decimal | null;
      advanceNoticeDays: number;
      allowBackdated: boolean;
      maxBackdatedDays: number;
      backdatedRequiresAttachment: boolean;
      backdatedRequiresHrApproval: boolean;
      allowNegativeBalance: boolean;
      negativeBalanceMode: string | null;
      enforceQuotaLimit: boolean;
      includeHoliday: boolean;
      includeWeekend: boolean;
      attachmentRequiredAfterDays: Prisma.Decimal | null;
      quotaAccrualYears: number;
      genderEligibility: 'ALL' | 'MALE' | 'FEMALE';
      serviceStartBasis: 'HIRE_DATE' | 'PROBATION_PASS_DATE';
      requireProbationPassed: boolean;
      prorateFirstYear: boolean;
      roundingMode: 'NONE' | 'HALF_HOUR_UP' | 'HALF_DAY_UP';
      quotaDisplayUnit: 'DAY' | 'HOUR';
    },
  ) {
    const existing = await tx.leaveType.findFirst({
      where: { companyId, catalogId: source.catalogId, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      await tx.leaveType.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE' },
      });
      return existing;
    }

    const code = await this.resolveAvailableCode(tx, companyId, source.code);

    return tx.leaveType.create({
      data: {
        companyId,
        catalogId: source.catalogId,
        referenceCode: source.referenceCode,
        code,
        nameTh: source.nameTh,
        nameEn: source.nameEn,
        description: source.description,
        isPaid: source.isPaid,
        requiresAttachment: source.requiresAttachment,
        allowHalfDay: source.allowHalfDay,
        allowHourly: source.allowHourly,
        deductQuota: source.deductQuota,
        affectAttendance: source.affectAttendance,
        affectPayroll: source.affectPayroll,
        minLeaveUnitMinutes: source.minLeaveUnitMinutes,
        maxLeaveDaysPerRequest: source.maxLeaveDaysPerRequest,
        advanceNoticeDays: source.advanceNoticeDays,
        allowBackdated: source.allowBackdated,
        maxBackdatedDays: source.maxBackdatedDays,
        backdatedRequiresAttachment: source.backdatedRequiresAttachment,
        backdatedRequiresHrApproval: source.backdatedRequiresHrApproval,
        allowNegativeBalance: source.allowNegativeBalance,
        negativeBalanceMode: source.negativeBalanceMode,
        enforceQuotaLimit: source.enforceQuotaLimit,
        includeHoliday: source.includeHoliday,
        includeWeekend: source.includeWeekend,
        attachmentRequiredAfterDays: source.attachmentRequiredAfterDays,
        quotaAccrualYears: source.quotaAccrualYears,
        genderEligibility: source.genderEligibility,
        serviceStartBasis: source.serviceStartBasis,
        requireProbationPassed: source.requireProbationPassed,
        prorateFirstYear: source.prorateFirstYear,
        roundingMode: source.roundingMode,
        quotaDisplayUnit: source.quotaDisplayUnit,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  }

  /**
   * บริษัทอาจเคยสร้างประเภทลา code เดียวกันไว้เอง (unique companyId+code)
   * ถ้าชนให้ต่อท้ายด้วยเลขลำดับ
   */
  private async resolveAvailableCode(
    tx: Prisma.TransactionClient,
    companyId: string,
    preferred: string,
  ) {
    let code = preferred;

    for (let attempt = 2; attempt <= 50; attempt += 1) {
      const taken = await tx.leaveType.findFirst({
        where: { companyId, code },
        select: { id: true },
      });

      if (!taken) return code;

      code = `${preferred}_${attempt}`;
    }

    throw new BadRequestException('ไม่สามารถกำหนดรหัสประเภทการลาที่ไม่ซ้ำได้');
  }

  private findTypeWithPolicies(tx: Prisma.TransactionClient, id: string) {
    return tx.leaveType.findUnique({
      where: { id },
      include: {
        catalog: true,
        policies: {
          where: { deletedAt: null },
          include: this.policyInclude,
          orderBy: [{ branchId: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }
}
