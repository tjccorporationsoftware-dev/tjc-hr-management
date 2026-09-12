import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  requireCompanyId,
} from '../../../common/tenant/tenant-scope.util';
import { toPageMeta } from '../helpers/payroll-page-meta.helper';
import { toDateOnly } from '../utils/payroll-date.util';
import {
  CopyEmployeeTaxProfilesDto,
  CreateEmployeeTaxProfileDto,
  CreatePayrollTaxAllowanceTypeDto,
  CreatePayrollTaxBracketDto,
  CreatePayrollTaxYearDto,
  PayrollTaxListQueryDto,
  UpdateEmployeeTaxAllowanceDto,
  UpdateEmployeeTaxProfileDto,
  UpdatePayrollTaxAllowanceTypeDto,
  UpdatePayrollTaxBracketDto,
  UpdatePayrollTaxYearDto,
  UpsertEmployeeTaxAllowanceDto,
  UpsertEmployeeTaxOpeningBalanceDto,
} from '../dto/payroll-tax.dto';
import { STATUTORY_TAX_YEAR_DEFAULTS } from '../constants/statutory-payroll-defaults.constant';
import { PayrollStatutoryDefaultsService } from './payroll-statutory-defaults.service';

@Injectable()
export class PayrollTaxService {
  constructor(
    private readonly prisma: PrismaService,
    /*
     * ปีภาษีที่ผู้ใช้กดสร้างเอง ต้องได้ชุดขั้นภาษี/ค่าลดหย่อนเดียวกับที่ระบบ
     * เติมให้ตอนตั้งบริษัท ไม่งั้นสองทางเข้าจะได้ค่าคนละชุดโดยไม่มีใครรู้
     */
    private readonly statutoryDefaults: PayrollStatutoryDefaultsService,
  ) {}

  /**
   * @param scope ขอบเขตของผู้เรียก — ต้องส่งเสมอจาก controller
   *
   * companyId ที่รับมาเป็นแค่ "ตัวกรองที่ผู้ใช้ขอ" ไม่ใช่คำสั่ง ถ้าไม่กรองด้วย
   * effectiveCompanyId บัญชีระดับบริษัทจะเปลี่ยน query string ไปนับข้อมูลภาษี
   * ของบริษัทอื่นได้ทันที
   */
  async getOverview(companyId: string | undefined, scope: TenantScope) {
    const prisma = this.prisma as any;
    const scopedCompanyId = effectiveCompanyId(scope, companyId);
    const where = scopedCompanyId
      ? { companyId: scopedCompanyId, deletedAt: null }
      : { deletedAt: null };
    const [taxYears, profiles, allowanceTypes] = await this.prisma.$transaction([
      prisma.payrollTaxYear.count({ where }),
      prisma.employeeTaxProfile.count({ where }),
      prisma.payrollTaxAllowanceType.count({ where: scopedCompanyId ? { taxYear: { companyId: scopedCompanyId }, deletedAt: null } : { deletedAt: null } }),
    ]);

    return {
      taxYears,
      profiles,
      allowanceTypes,
      phase: 'FULL_TAX_ENGINE',
      note: 'ระบบรองรับข้อมูลภาษีพนักงาน ค่าลดหย่อน การทดลองคำนวณ การสร้างยอดภาษีใน Payroll Run และรายงานภาษีแล้ว',
    };
  }



  /**
   * ภาพรวมข้อมูลภาษีต่อพนักงานที่มีฐานเงินเดือน
   * ----------------------------------------------------------------------
   * ใช้สำหรับหน้า /payroll/tax และ /payroll/compensation เพื่อให้ HR เห็นทันทีว่า
   * พนักงานที่เปิดคิดภาษีกรอกค่าลดหย่อนไว้หรือยัง
   *
   * ไม่ได้กรอกไม่ใช่ปัญหาที่บล็อกอะไร — tax engine คิดให้ด้วยค่าลดหย่อนพื้นฐาน
   * (ส่วนตัว + ประกันสังคม) อยู่แล้ว รายการนี้จึงเป็นแค่ตัวช่วยให้ HR รู้ว่า
   * ยังมีใครที่ค่าลดหย่อนอาจไม่ครบและจะถูกหักภาษีเกินจริงระหว่างปี
   */
  async getProfileCoverage(query: PayrollTaxListQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 200);
    const prisma = this.prisma as any;
    // ล็อกบริษัทตาม scope ก่อนใช้ทุกเงื่อนไข ไม่งั้นทั้งปีภาษีที่เลือกให้อัตโนมัติ
    // และรายชื่อพนักงานจะหลุดข้ามบริษัทพร้อมกัน
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);

    let selectedTaxYear = null as any;
    if (query.taxYearId) {
      selectedTaxYear = await prisma.payrollTaxYear.findFirst({
        where: {
          id: query.taxYearId,
          deletedAt: null,
          ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
        },
      });
    }

    if (!selectedTaxYear) {
      selectedTaxYear = await prisma.payrollTaxYear.findFirst({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
        },
        orderBy: [{ isActive: 'desc' }, { taxYear: 'desc' }, { createdAt: 'desc' }],
      });
    }

    const compensationWhere: Record<string, unknown> = {
      deletedAt: null,
      status: 'ACTIVE',
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
    };

    if (query.employeeId) compensationWhere.employeeId = query.employeeId;
    if (query.branchId) compensationWhere.employee = { branchId: query.branchId };
    if (query.q?.trim()) {
      const q = query.q.trim();
      compensationWhere.OR = [
        { employee: { employeeCode: { contains: q, mode: 'insensitive' } } },
        { employee: { firstName: { contains: q, mode: 'insensitive' } } },
        { employee: { lastName: { contains: q, mode: 'insensitive' } } },
        { employee: { nickname: { contains: q, mode: 'insensitive' } } },
        { employee: { displayName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const compensations = await prisma.employeeCompensation.findMany({
      where: compensationWhere,
      include: {
        company: { select: { id: true, code: true, nameTh: true, nameEn: true } },
        employee: {
          include: {
            department: { select: { id: true, code: true, nameTh: true } },
            branch: { select: { id: true, code: true, nameTh: true } },
            profile: true,
          },
        },
      },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });

    const latestByEmployee = new Map<string, any>();
    for (const item of compensations) {
      if (!latestByEmployee.has(item.employeeId)) latestByEmployee.set(item.employeeId, item);
    }

    const employeeIds = Array.from(latestByEmployee.keys());
    const profiles = selectedTaxYear
      ? await prisma.employeeTaxProfile.findMany({
          where: { employeeId: { in: employeeIds }, taxYearId: selectedTaxYear.id, deletedAt: null },
          include: {
            taxYear: true,
            allowances: { where: { deletedAt: null }, include: { allowanceType: true } },
          },
        })
      : [];
    const profileByEmployee = new Map<string, any>(profiles.map((profile: any) => [profile.employeeId, profile]));

    const rows = employeeIds.map((employeeId) => {
      const compensation = latestByEmployee.get(employeeId);
      const profile = profileByEmployee.get(employeeId) ?? null;
      const taxEnabled = Boolean(compensation?.taxEnabled);
      const allowanceCount = profile?.allowances?.length ?? 0;
      const taxStatus = !taxEnabled
        ? 'TAX_DISABLED'
        : !selectedTaxYear
          ? 'NO_TAX_YEAR'
          : allowanceCount > 0
            ? 'HAS_ALLOWANCE'
            : 'DEFAULT_ONLY';

      return {
        employeeId,
        companyId: compensation.companyId,
        compensationId: compensation.id,
        taxYearId: selectedTaxYear?.id ?? null,
        taxEnabled,
        taxStatus,
        profileId: profile?.id ?? null,
        taxId: profile?.taxId ?? compensation.employee?.profile?.taxId ?? null,
        allowanceCount,
        updatedAt: profile?.updatedAt ?? null,
        employee: compensation.employee,
        company: compensation.company,
        taxYear: selectedTaxYear,
        profile,
      };
    });

    const statusFilter = query.status && query.status !== 'ALL' ? query.status : null;
    const filteredRows = statusFilter
      ? rows.filter((row) => row.taxStatus === statusFilter)
      : rows;

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalEmployees += 1;
        if (row.taxEnabled) acc.taxEnabledEmployees += 1;
        else acc.taxDisabledEmployees += 1;

        if (row.taxStatus === 'NO_TAX_YEAR') acc.noTaxYearEmployees += 1;
        if (row.taxStatus === 'HAS_ALLOWANCE') acc.employeesWithAllowance += 1;
        if (row.taxStatus === 'DEFAULT_ONLY') acc.employeesUsingDefaultOnly += 1;
        return acc;
      },
      {
        totalEmployees: 0,
        taxEnabledEmployees: 0,
        taxDisabledEmployees: 0,
        employeesWithAllowance: 0,
        employeesUsingDefaultOnly: 0,
        noTaxYearEmployees: 0,
        taxYearId: selectedTaxYear?.id ?? null,
        taxYearName: selectedTaxYear?.name ?? null,
        taxYear: selectedTaxYear?.taxYear ?? null,
      },
    );

    return {
      data: filteredRows.slice((page - 1) * pageSize, page * pageSize),
      meta: toPageMeta(page, pageSize, filteredRows.length),
      summary,
      taxYear: selectedTaxYear,
    };
  }

  async findTaxYears(query: PayrollTaxListQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const where: Record<string, unknown> = { deletedAt: null };
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) where.companyId = scopedCompanyId;
    if (query.status && query.status !== 'ALL') where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const prisma = this.prisma as any;
    const [data, total] = await this.prisma.$transaction([
      prisma.payrollTaxYear.findMany({
        where,
        include: {
          company: true,
          // กลุ่มเพดานมีไม่กี่แถวต่อปีภาษี แต่หน้าตั้งค่าต้องใช้แสดงคู่กับประเภทค่าลดหย่อน
          allowanceLimitGroups: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { brackets: true, allowanceTypes: true, profiles: true } },
        },
        orderBy: [{ taxYear: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.payrollTaxYear.count({ where }),
    ]);

    return { data, meta: toPageMeta(page, pageSize, total) };
  }

  async createTaxYear(
    dto: CreatePayrollTaxYearDto,
    userId: string | undefined,
    scope: TenantScope,
  ) {
    // GLOBAL เลือกบริษัทปลายทางเองได้ นอกนั้นล็อกเป็นบริษัทของตัวเองเสมอ
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.assertCompany(companyId);
    const taxYear = Number(dto.taxYear);
    const prisma = this.prisma as any;
    const created = await prisma.payrollTaxYear.create({
      data: {
        companyId,
        taxYear,
        code: (dto.code || `TAX-${taxYear}`).trim().toUpperCase(),
        name: dto.name?.trim() || `ปีภาษี ${taxYear}`,
        startDate: toDateOnly(dto.startDate),
        endDate: toDateOnly(dto.endDate),
        // ไม่กรอกมา = ใช้ค่าตามกฎหมาย (แหล่งเดียวกับที่ระบบเติมให้ตอนตั้งบริษัท)
        personalExpenseRate: this.money(
          dto.personalExpenseRate,
          STATUTORY_TAX_YEAR_DEFAULTS.personalExpenseRate,
        ),
        personalExpenseMax: this.money(
          dto.personalExpenseMax,
          STATUTORY_TAX_YEAR_DEFAULTS.personalExpenseMax,
        ),
        standardPersonalAllowance: this.money(
          dto.standardPersonalAllowance,
          STATUTORY_TAX_YEAR_DEFAULTS.standardPersonalAllowance,
        ),
        roundingMethod:
          dto.roundingMethod || STATUTORY_TAX_YEAR_DEFAULTS.roundingMethod,
        taxAveragingMethod:
          dto.taxAveragingMethod ||
          STATUTORY_TAX_YEAR_DEFAULTS.taxAveragingMethod,
        isActive: dto.isActive ?? true,
        status: dto.status ?? 'ACTIVE',
        note: dto.note?.trim() || null,
        createdById: userId ?? null,
      },
    });

    await this.statutoryDefaults.seedTaxYearContent(created.id);
    return this.findTaxYearById(created.id, scope);
  }

  async updateTaxYear(
    id: string,
    dto: UpdatePayrollTaxYearDto,
    scope: TenantScope,
  ) {
    await this.assertTaxYearWithinScope(id, scope);
    const prisma = this.prisma as any;
    await prisma.payrollTaxYear.update({
      where: { id },
      data: {
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        startDate: dto.startDate ? toDateOnly(dto.startDate) : undefined,
        endDate: dto.endDate ? toDateOnly(dto.endDate) : undefined,
        personalExpenseRate:
          dto.personalExpenseRate === undefined
            ? undefined
            : this.money(
                dto.personalExpenseRate,
                STATUTORY_TAX_YEAR_DEFAULTS.personalExpenseRate,
              ),
        personalExpenseMax:
          dto.personalExpenseMax === undefined
            ? undefined
            : this.money(
                dto.personalExpenseMax,
                STATUTORY_TAX_YEAR_DEFAULTS.personalExpenseMax,
              ),
        standardPersonalAllowance:
          dto.standardPersonalAllowance === undefined
            ? undefined
            : this.money(
                dto.standardPersonalAllowance,
                STATUTORY_TAX_YEAR_DEFAULTS.standardPersonalAllowance,
              ),
        roundingMethod: dto.roundingMethod,
        taxAveragingMethod: dto.taxAveragingMethod,
        isActive: dto.isActive,
        status: dto.status,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });
    return this.findTaxYearById(id, scope);
  }

  async deleteTaxYear(id: string, scope: TenantScope) {
    await this.assertTaxYearWithinScope(id, scope);
    const prisma = this.prisma as any;
    return prisma.payrollTaxYear.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, status: 'INACTIVE' } });
  }

  /**
   * @param scope ขอบเขตของผู้เรียก — ดึงก่อนแล้วค่อยตรวจ (fetch-then-assert)
   *
   * ปีภาษีพ่วงขั้นภาษี ประเภทค่าลดหย่อน และจำนวนโปรไฟล์พนักงานมาด้วย
   * ถ้าไม่ตรวจ ผู้ใช้ที่รู้ id ของปีภาษีบริษัทอื่นจะอ่านการตั้งค่าภาษีทั้งชุดได้
   */
  async findTaxYearById(id: string, scope: TenantScope) {
    const prisma = this.prisma as any;
    const taxYear = await prisma.payrollTaxYear.findFirst({
      where: { id, deletedAt: null },
      include: {
        company: true,
        brackets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        allowanceTypes: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        allowanceLimitGroups: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { profiles: true, yearSummaries: true, calculations: true } },
      },
    });
    if (!taxYear) throw new NotFoundException('ไม่พบปีภาษี');
    assertWithinScope(scope, { companyId: taxYear.companyId });
    return taxYear;
  }

  /*
   * ขั้นภาษีไม่มี companyId ของตัวเอง ต้องกรองผ่านปีภาษีที่มันสังกัด
   * (PayrollTaxBracket.taxYearId -> PayrollTaxYear.companyId)
   */
  async findBrackets(query: PayrollTaxListQueryDto, scope: TenantScope) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.taxYearId) where.taxYearId = query.taxYearId;
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) where.taxYear = { companyId: scopedCompanyId };
    const prisma = this.prisma as any;
    return prisma.payrollTaxBracket.findMany({ where, include: { taxYear: true }, orderBy: [{ sortOrder: 'asc' }] });
  }

  async createBracket(dto: CreatePayrollTaxBracketDto, scope: TenantScope) {
    await this.assertTaxYearWithinScope(dto.taxYearId, scope);
    const prisma = this.prisma as any;
    return prisma.payrollTaxBracket.create({
      data: {
        taxYearId: dto.taxYearId,
        minIncome: this.money(dto.minIncome, 0),
        maxIncome: dto.maxIncome ? this.money(dto.maxIncome, 0) : null,
        rate: this.money(dto.rate, 0),
        quickDeduction: this.money(dto.quickDeduction, 0),
        sortOrder: dto.sortOrder ?? 0,
        note: dto.note?.trim() || null,
      },
    });
  }

  async updateBracket(
    id: string,
    dto: UpdatePayrollTaxBracketDto,
    scope: TenantScope,
  ) {
    const bracket = await this.assertBracket(id);
    assertWithinScope(scope, { companyId: bracket.taxYear?.companyId });
    const prisma = this.prisma as any;
    return prisma.payrollTaxBracket.update({
      where: { id },
      data: {
        minIncome: dto.minIncome === undefined ? undefined : this.money(dto.minIncome, 0),
        maxIncome: dto.maxIncome === undefined ? undefined : dto.maxIncome ? this.money(dto.maxIncome, 0) : null,
        rate: dto.rate === undefined ? undefined : this.money(dto.rate, 0),
        quickDeduction: dto.quickDeduction === undefined ? undefined : this.money(dto.quickDeduction, 0),
        sortOrder: dto.sortOrder,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });
  }

  async deleteBracket(id: string, scope: TenantScope) {
    const bracket = await this.assertBracket(id);
    assertWithinScope(scope, { companyId: bracket.taxYear?.companyId });
    const prisma = this.prisma as any;
    return prisma.payrollTaxBracket.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /*
   * ประเภทค่าลดหย่อนไม่ใช่ master data กลางของทั้งระบบ — ผูกกับปีภาษีของแต่ละบริษัท
   * (PayrollTaxAllowanceType.taxYearId -> PayrollTaxYear.companyId) จึงต้องกรองผ่านปีภาษี
   */
  async findAllowanceTypes(query: PayrollTaxListQueryDto, scope: TenantScope) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.taxYearId) where.taxYearId = query.taxYearId;
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) where.taxYear = { companyId: scopedCompanyId };
    if (query.status && query.status !== 'ALL') where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { nameTh: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }
    const prisma = this.prisma as any;
    return prisma.payrollTaxAllowanceType.findMany({
      where,
      include: { taxYear: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async createAllowanceType(
    dto: CreatePayrollTaxAllowanceTypeDto,
    scope: TenantScope,
  ) {
    await this.assertTaxYearWithinScope(dto.taxYearId, scope);
    const prisma = this.prisma as any;
    return prisma.payrollTaxAllowanceType.create({
      data: {
        taxYearId: dto.taxYearId,
        code: dto.code.trim().toUpperCase(),
        nameTh: dto.nameTh.trim(),
        nameEn: dto.nameEn?.trim() || null,
        description: dto.description?.trim() || null,
        category: dto.category?.trim().toUpperCase() || 'GENERAL',
        defaultAmount: this.money(dto.defaultAmount, 0),
        maxAmount: dto.maxAmount ? this.money(dto.maxAmount, 0) : null,
        maxPercentOfIncome: dto.maxPercentOfIncome
          ? this.money(dto.maxPercentOfIncome, 0)
          : null,
        percentBase: dto.percentBase ?? 'GROSS_INCOME',
        deductionMultiplier: this.money(dto.deductionMultiplier, 1),
        limitGroupCode: dto.limitGroupCode?.trim().toUpperCase() || null,
        isSystem: dto.isSystem ?? false,
        requiresAttachment: dto.requiresAttachment ?? false,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? 'ACTIVE',
        note: dto.note?.trim() || null,
      },
    });
  }

  async updateAllowanceType(
    id: string,
    dto: UpdatePayrollTaxAllowanceTypeDto,
    scope: TenantScope,
  ) {
    const allowanceType = await this.assertAllowanceType(id);
    assertWithinScope(scope, { companyId: allowanceType.taxYear?.companyId });
    const prisma = this.prisma as any;
    return prisma.payrollTaxAllowanceType.update({
      where: { id },
      data: {
        code: dto.code?.trim().toUpperCase(),
        nameTh: dto.nameTh?.trim(),
        nameEn: dto.nameEn === undefined ? undefined : dto.nameEn?.trim() || null,
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        category: dto.category?.trim().toUpperCase(),
        defaultAmount: dto.defaultAmount === undefined ? undefined : this.money(dto.defaultAmount, 0),
        maxAmount: dto.maxAmount === undefined ? undefined : dto.maxAmount ? this.money(dto.maxAmount, 0) : null,
        maxPercentOfIncome:
          dto.maxPercentOfIncome === undefined
            ? undefined
            : dto.maxPercentOfIncome
              ? this.money(dto.maxPercentOfIncome, 0)
              : null,
        percentBase: dto.percentBase,
        deductionMultiplier:
          dto.deductionMultiplier === undefined
            ? undefined
            : this.money(dto.deductionMultiplier, 1),
        limitGroupCode:
          dto.limitGroupCode === undefined
            ? undefined
            : dto.limitGroupCode?.trim().toUpperCase() || null,
        isSystem: dto.isSystem,
        requiresAttachment: dto.requiresAttachment,
        sortOrder: dto.sortOrder,
        status: dto.status,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });
  }

  async deleteAllowanceType(id: string, scope: TenantScope) {
    const allowanceType = await this.assertAllowanceType(id);
    assertWithinScope(scope, { companyId: allowanceType.taxYear?.companyId });
    const prisma = this.prisma as any;
    return prisma.payrollTaxAllowanceType.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
  }

  async findProfiles(query: PayrollTaxListQueryDto, scope: TenantScope) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const where: Record<string, unknown> = { deletedAt: null };
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);
    if (scopedCompanyId) where.companyId = scopedCompanyId;
    if (query.taxYearId) where.taxYearId = query.taxYearId;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { taxId: { contains: q, mode: 'insensitive' } },
        { employee: { employeeCode: { contains: q, mode: 'insensitive' } } },
        { employee: { firstName: { contains: q, mode: 'insensitive' } } },
        { employee: { lastName: { contains: q, mode: 'insensitive' } } },
        { employee: { nickname: { contains: q, mode: 'insensitive' } } },
        { employee: { displayName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const prisma = this.prisma as any;
    const [data, total] = await this.prisma.$transaction([
      prisma.employeeTaxProfile.findMany({
        where,
        include: {
          company: true,
          taxYear: true,
          employee: { include: { department: true, branch: true, profile: true } },
          allowances: { where: { deletedAt: null }, include: { allowanceType: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.employeeTaxProfile.count({ where }),
    ]);

    return {
      data,
      meta: toPageMeta(page, pageSize, total),
      summary: { total },
    };
  }

  /**
   * @param scope ขอบเขตของผู้เรียก — ดึงก่อนแล้วค่อยตรวจ (fetch-then-assert)
   *
   * โปรไฟล์นี้พ่วงเลขผู้เสียภาษี ที่อยู่ และค่าลดหย่อนรายคนมาด้วย
   * ถ้าไม่ตรวจ ผู้ใช้ที่รู้ id จะอ่านข้อมูลภาษีรายบุคคลของบริษัทอื่นได้
   */
  async findProfileById(id: string, scope: TenantScope) {
    const prisma = this.prisma as any;
    const profile = await prisma.employeeTaxProfile.findFirst({
      where: { id, deletedAt: null },
      include: {
        company: true,
        taxYear: { include: { brackets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } } },
        employee: { include: { department: true, branch: true, profile: true } },
        allowances: { where: { deletedAt: null }, include: { allowanceType: true }, orderBy: { createdAt: 'asc' } },
        yearSummaries: true,
      },
    });
    if (!profile) throw new NotFoundException('ไม่พบโปรไฟล์ภาษีพนักงาน');
    assertWithinScope(scope, { companyId: profile.companyId });
    return profile;
  }

  /**
   * สร้างข้อมูลภาษีของพนักงานสำหรับปีภาษีหนึ่ง
   *
   * ทำตัวเป็น upsert เพราะหน้าจอฝั่ง HR แค่คลิกพนักงานในรายชื่อแล้วกรอกค่าลดหย่อน
   * ไม่ควรต้องมานั่งแยกว่าคนนี้ "สร้างแล้วหรือยัง" และถ้าเคยลบไปก็ปลุกกลับมาแทน
   * การชนกับ unique key (employeeId, taxYearId)
   */
  async createProfile(
    dto: CreateEmployeeTaxProfileDto,
    userId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.assertCompany(companyId);
    await this.assertEmployee(dto.employeeId, companyId);
    const taxYear = await this.assertTaxYear(dto.taxYearId, companyId);

    const prisma = this.prisma as any;
    const existing = await prisma.employeeTaxProfile.findFirst({
      where: { employeeId: dto.employeeId, taxYearId: taxYear.id },
    });

    if (existing) {
      await prisma.employeeTaxProfile.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          taxEnabled: dto.taxEnabled ?? existing.taxEnabled,
          taxId: dto.taxId === undefined ? undefined : dto.taxId?.trim() || null,
          maritalStatus:
            dto.maritalStatus === undefined ? undefined : dto.maritalStatus?.trim() || null,
          spouseHasIncome: dto.spouseHasIncome ?? existing.spouseHasIncome,
          note: dto.note === undefined ? undefined : dto.note?.trim() || null,
        },
      });
      return this.findProfileById(existing.id, scope);
    }

    const created = await prisma.employeeTaxProfile.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        taxYearId: taxYear.id,
        taxEnabled: dto.taxEnabled ?? true,
        taxId: dto.taxId?.trim() || null,
        maritalStatus: dto.maritalStatus?.trim() || null,
        spouseHasIncome: dto.spouseHasIncome ?? false,
        note: dto.note?.trim() || null,
        createdById: userId ?? null,
      },
    });
    return this.findProfileById(created.id, scope);
  }

  async updateProfile(
    id: string,
    dto: UpdateEmployeeTaxProfileDto,
    scope: TenantScope,
  ) {
    const profile = await this.assertProfile(id);
    assertWithinScope(scope, { companyId: profile.companyId });
    const prisma = this.prisma as any;

    await prisma.employeeTaxProfile.update({
      where: { id },
      data: {
        taxEnabled: dto.taxEnabled,
        taxId: dto.taxId === undefined ? undefined : dto.taxId?.trim() || null,
        maritalStatus: dto.maritalStatus === undefined ? undefined : dto.maritalStatus?.trim() || null,
        spouseHasIncome: dto.spouseHasIncome,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
      },
    });

    return this.findProfileById(id, scope);
  }

  /**
   * ยกค่าลดหย่อนของทั้งบริษัทจากปีภาษีก่อนหน้ามาตั้งต้นปีใหม่
   *
   * ค่าลดหย่อนส่วนใหญ่ (ประกันชีวิต กองทุน ดอกเบี้ยบ้าน) ซ้ำเดิมทุกปี
   * ถ้าไม่มีปุ่มนี้ HR ต้องคีย์ใหม่ทั้งบริษัททุกต้นปี
   *
   * จับคู่ประเภทค่าลดหย่อนด้วย code เพราะ id เป็นคนละตัวในแต่ละปีภาษี
   */
  async copyProfilesToTaxYear(
    dto: CopyEmployeeTaxProfilesDto,
    scope: TenantScope,
  ) {
    // ทั้งปีต้นทางและปลายทางถูกล็อกให้อยู่ในบริษัทเดียวกันนี้ทั้งคู่
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.assertCompany(companyId);
    const toTaxYear = await this.assertTaxYear(dto.toTaxYearId, companyId);
    const prisma = this.prisma as any;

    const fromTaxYear = dto.fromTaxYearId
      ? await this.assertTaxYear(dto.fromTaxYearId, companyId)
      : await prisma.payrollTaxYear.findFirst({
          where: {
            companyId,
            deletedAt: null,
            taxYear: { lt: toTaxYear.taxYear },
          },
          orderBy: { taxYear: 'desc' },
        });

    if (!fromTaxYear) {
      throw new BadRequestException('ไม่พบปีภาษีต้นทางที่จะยกยอดมา');
    }
    if (fromTaxYear.id === toTaxYear.id) {
      throw new BadRequestException('ปีภาษีต้นทางและปลายทางต้องไม่ใช่ปีเดียวกัน');
    }

    const [sourceProfiles, targetAllowanceTypes, existingTargets] = await Promise.all([
      prisma.employeeTaxProfile.findMany({
        where: { taxYearId: fromTaxYear.id, companyId, deletedAt: null },
        include: {
          allowances: { where: { deletedAt: null }, include: { allowanceType: true } },
        },
      }),
      prisma.payrollTaxAllowanceType.findMany({
        where: { taxYearId: toTaxYear.id, deletedAt: null, status: 'ACTIVE' },
      }),
      prisma.employeeTaxProfile.findMany({
        where: { taxYearId: toTaxYear.id, companyId, deletedAt: null },
        select: { id: true, employeeId: true },
      }),
    ]);

    const targetTypeByCode = new Map<string, any>(
      targetAllowanceTypes.map((type: any) => [type.code, type]),
    );
    const targetByEmployee = new Map<string, any>(
      existingTargets.map((profile: any) => [profile.employeeId, profile]),
    );

    let createdProfiles = 0;
    let updatedProfiles = 0;
    let copiedAllowances = 0;
    let skippedProfiles = 0;
    const skippedAllowanceCodes = new Set<string>();

    for (const source of sourceProfiles) {
      const existing = targetByEmployee.get(source.employeeId);
      if (existing && !dto.overwrite) {
        skippedProfiles += 1;
        continue;
      }

      let targetId: string;
      if (existing) {
        await prisma.employeeTaxProfile.update({
          where: { id: existing.id },
          data: {
            taxEnabled: source.taxEnabled,
            taxId: source.taxId,
            maritalStatus: source.maritalStatus,
            spouseHasIncome: source.spouseHasIncome,
          },
        });
        await prisma.employeeTaxAllowance.deleteMany({ where: { taxProfileId: existing.id } });
        targetId = existing.id;
        updatedProfiles += 1;
      } else {
        const created = await prisma.employeeTaxProfile.create({
          data: {
            companyId,
            employeeId: source.employeeId,
            taxYearId: toTaxYear.id,
            taxEnabled: source.taxEnabled,
            taxId: source.taxId,
            maritalStatus: source.maritalStatus,
            spouseHasIncome: source.spouseHasIncome,
            note: `ยกยอดจากปีภาษี ${fromTaxYear.taxYear}`,
          },
        });
        targetId = created.id;
        createdProfiles += 1;
      }

      for (const allowance of source.allowances) {
        const code = allowance.allowanceType?.code;
        const targetType = code ? targetTypeByCode.get(code) : null;
        if (!targetType) {
          if (code) skippedAllowanceCodes.add(code);
          continue;
        }
        // เพดานของแต่ละปีไม่เท่ากัน ยอดที่เกินเพดานปีใหม่ต้องถูกตัดลงมา
        const maxAmount = Number(targetType.maxAmount ?? 0);
        const declaredAmount =
          Number.isFinite(maxAmount) && maxAmount > 0
            ? Math.min(Number(allowance.declaredAmount ?? 0), maxAmount)
            : Number(allowance.declaredAmount ?? 0);

        await prisma.employeeTaxAllowance.create({
          data: {
            taxProfileId: targetId,
            allowanceTypeId: targetType.id,
            declaredAmount,
            note: allowance.note,
            attachmentUrl: allowance.attachmentUrl,
          },
        });
        copiedAllowances += 1;
      }
    }

    return {
      fromTaxYear: { id: fromTaxYear.id, taxYear: fromTaxYear.taxYear },
      toTaxYear: { id: toTaxYear.id, taxYear: toTaxYear.taxYear },
      createdProfiles,
      updatedProfiles,
      skippedProfiles,
      copiedAllowances,
      skippedAllowanceCodes: Array.from(skippedAllowanceCodes),
    };
  }

  async deleteProfile(id: string, scope: TenantScope) {
    const profile = await this.assertProfile(id);
    assertWithinScope(scope, { companyId: profile.companyId });
    const prisma = this.prisma as any;
    return prisma.employeeTaxProfile.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async upsertAllowance(
    profileId: string,
    dto: UpsertEmployeeTaxAllowanceDto,
    scope: TenantScope,
  ) {
    const profile = await this.assertProfile(profileId);
    assertWithinScope(scope, { companyId: profile.companyId });
    // ผูก allowance type กับปีภาษีของโปรไฟล์อยู่แล้ว จึงข้ามบริษัทไม่ได้โดยปริยาย
    const allowanceType = await this.assertAllowanceType(dto.allowanceTypeId, profile.taxYearId);
    const declaredAmount = this.money(dto.declaredAmount, 0);
    const attachmentUrl = dto.attachmentUrl?.trim() || null;
    this.validateAllowanceAmount(allowanceType, declaredAmount, attachmentUrl);

    const prisma = this.prisma as any;
    const allowanceData = {
      declaredAmount,
      note: dto.note?.trim() || null,
      attachmentUrl,
    };

    await prisma.employeeTaxAllowance.upsert({
      where: { taxProfileId_allowanceTypeId: { taxProfileId: profileId, allowanceTypeId: dto.allowanceTypeId } },
      create: {
        taxProfileId: profileId,
        allowanceTypeId: dto.allowanceTypeId,
        ...allowanceData,
      },
      update: {
        deletedAt: null,
        ...allowanceData,
      },
    });

    return this.findProfileById(profileId, scope);
  }

  async updateAllowance(
    id: string,
    dto: UpdateEmployeeTaxAllowanceDto,
    scope: TenantScope,
  ) {
    const allowance = await this.assertAllowance(id);
    assertWithinScope(scope, { companyId: allowance.taxProfile?.companyId });
    const allowanceType = await this.assertAllowanceType(allowance.allowanceTypeId);
    const declaredAmount = dto.declaredAmount === undefined ? Number(allowance.declaredAmount ?? 0) : this.money(dto.declaredAmount, 0);
    const attachmentUrl = dto.attachmentUrl === undefined ? allowance.attachmentUrl : dto.attachmentUrl?.trim() || null;
    this.validateAllowanceAmount(allowanceType, declaredAmount, attachmentUrl);

    const prisma = this.prisma as any;
    await prisma.employeeTaxAllowance.update({
      where: { id },
      data: {
        declaredAmount: dto.declaredAmount === undefined ? undefined : declaredAmount,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
        attachmentUrl: dto.attachmentUrl === undefined ? undefined : attachmentUrl,
      },
    });

    return this.findProfileById(allowance.taxProfileId, scope);
  }

  async deleteAllowance(id: string, scope: TenantScope) {
    const allowance = await this.assertAllowance(id);
    assertWithinScope(scope, { companyId: allowance.taxProfile?.companyId });
    const prisma = this.prisma as any;
    await prisma.employeeTaxAllowance.update({ where: { id }, data: { deletedAt: new Date() } });
    return this.findProfileById(allowance.taxProfileId, scope);
  }

  /* ------------------------------------------------------------------ */
  /* ยอดสะสมยกมาของปีภาษี (opening balance)                              */
  /* ------------------------------------------------------------------ */

  /**
   * ยอดสะสมที่ยกมาจากระบบเดิม ใช้ตอนเริ่มใช้ระบบกลางปี
   *
   * tax engine อ่านค่านี้เป็น "ยอดตั้งต้น" แล้วบวกกับรอบที่รันในระบบนี้
   * (ดู findTaxWithheldYtd / findTaxableIncomeYtd ใน payroll-tax-calculator)
   * เดิมมีแต่ตารางกับฝั่งอ่าน ไม่มีช่องทางบันทึกเข้ามาเลย
   */
  async listOpeningBalances(
    query: {
      companyId?: string;
      taxYearId?: string;
      employeeId?: string;
    },
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    // EmployeeTaxYearSummary มี companyId ตรง ๆ กรองที่ระดับ query ได้เลย
    const scopedCompanyId = effectiveCompanyId(scope, query.companyId);

    return prisma.employeeTaxYearSummary.findMany({
      where: {
        ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
        ...(query.taxYearId ? { taxYearId: query.taxYearId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            nickname: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
        taxYear: { select: { id: true, taxYear: true, name: true } },
      },
      orderBy: [{ employeeId: 'asc' }],
    });
  }

  async upsertOpeningBalance(
    dto: UpsertEmployeeTaxOpeningBalanceDto,
    userId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, dto.companyId);
    await this.assertCompany(companyId);
    await this.assertEmployee(dto.employeeId, companyId);
    const taxYear = await this.assertTaxYear(dto.taxYearId, companyId);

    const totalTaxableIncome = this.money(dto.totalTaxableIncome, 0);
    const totalTaxWithheld = this.money(dto.totalTaxWithheld, 0);
    const totalSocialSecurity = this.money(dto.totalSocialSecurity, 0);

    if (totalTaxWithheld > totalTaxableIncome) {
      throw new BadRequestException(
        'ภาษีหัก ณ ที่จ่ายสะสมต้องไม่มากกว่าเงินได้สะสม',
      );
    }

    const prisma = this.prisma as any;
    const profile = await prisma.employeeTaxProfile.findFirst({
      where: {
        employeeId: dto.employeeId,
        taxYearId: taxYear.id,
        deletedAt: null,
      },
      select: { id: true },
    });

    const data = {
      totalTaxableIncome,
      totalTaxWithheld,
      totalSocialSecurity,
      taxProfileId: profile?.id ?? null,
      note: dto.note?.trim() || null,
      lastCalculatedAt: new Date(),
      snapshot: {
        source: 'OPENING_BALANCE_IMPORT',
        recordedById: userId ?? null,
        recordedAt: new Date().toISOString(),
      },
    };

    await prisma.employeeTaxYearSummary.upsert({
      where: {
        employeeId_taxYearId: {
          employeeId: dto.employeeId,
          taxYearId: taxYear.id,
        },
      },
      create: {
        companyId,
        employeeId: dto.employeeId,
        taxYearId: taxYear.id,
        ...data,
      },
      update: data,
    });

    const [saved] = await this.listOpeningBalances(
      {
        employeeId: dto.employeeId,
        taxYearId: taxYear.id,
      },
      scope,
    );

    return saved;
  }

  private async assertCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
    if (!company) throw new NotFoundException('ไม่พบบริษัท');
    return company;
  }

  private async assertEmployee(employeeId: string, companyId?: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null, ...(companyId ? { companyId } : {}) } });
    if (!employee) throw new NotFoundException('ไม่พบพนักงาน');
    return employee;
  }

  private async assertTaxYear(id: string, companyId?: string) {
    const prisma = this.prisma as any;
    const taxYear = await prisma.payrollTaxYear.findFirst({ where: { id, deletedAt: null, ...(companyId ? { companyId } : {}) } });
    if (!taxYear) throw new NotFoundException('ไม่พบปีภาษี');
    return taxYear;
  }

  /**
   * ปีภาษีคือจุดยึด scope ของทั้งสาขาข้อมูลภาษี (ขั้นภาษี/ประเภทค่าลดหย่อน)
   * ตารางลูกไม่มี companyId ของตัวเอง จึงต้องตรวจผ่านปีภาษีเสมอ
   */
  private async assertTaxYearWithinScope(id: string, scope: TenantScope) {
    const taxYear = await this.assertTaxYear(id);
    assertWithinScope(scope, { companyId: taxYear.companyId });
    return taxYear;
  }

  private async assertBracket(id: string) {
    const prisma = this.prisma as any;
    const bracket = await prisma.payrollTaxBracket.findFirst({
      where: { id, deletedAt: null },
      include: { taxYear: { select: { companyId: true } } },
    });
    if (!bracket) throw new NotFoundException('ไม่พบขั้นภาษี');
    return bracket;
  }

  private async assertAllowanceType(id: string, taxYearId?: string) {
    const prisma = this.prisma as any;
    const allowanceType = await prisma.payrollTaxAllowanceType.findFirst({
      where: { id, deletedAt: null, ...(taxYearId ? { taxYearId } : {}) },
      include: { taxYear: { select: { companyId: true } } },
    });
    if (!allowanceType) throw new NotFoundException('ไม่พบประเภทค่าลดหย่อน');
    return allowanceType;
  }

  private async assertProfile(id: string) {
    const prisma = this.prisma as any;
    const profile = await prisma.employeeTaxProfile.findFirst({ where: { id, deletedAt: null } });
    if (!profile) throw new NotFoundException('ไม่พบโปรไฟล์ภาษีพนักงาน');
    return profile;
  }

  private async assertAllowance(id: string) {
    const prisma = this.prisma as any;
    const allowance = await prisma.employeeTaxAllowance.findFirst({
      where: { id, deletedAt: null },
      include: { taxProfile: { select: { companyId: true } } },
    });
    if (!allowance) throw new NotFoundException('ไม่พบรายการค่าลดหย่อน');
    return allowance;
  }

  private money(value: string | number | null | undefined, fallback: number) {
    const amount = Number(value ?? fallback);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('จำนวนเงินต้องไม่น้อยกว่า 0');
    }
    return amount;
  }

  private validateAllowanceAmount(
    allowanceType: { nameTh?: string | null; maxAmount?: unknown; requiresAttachment?: boolean },
    declaredAmount: number,
    attachmentUrl?: string | null,
  ) {
    const maxAmount = Number(allowanceType.maxAmount ?? 0);
    if (Number.isFinite(maxAmount) && maxAmount > 0 && declaredAmount > maxAmount) {
      const allowanceName = allowanceType.nameTh || 'ค่าลดหย่อนนี้';
      throw new BadRequestException(
        `${allowanceName} ต้องไม่เกินเพดาน ${maxAmount.toLocaleString('th-TH', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} บาท`,
      );
    }

    if (allowanceType.requiresAttachment && declaredAmount > 0 && !attachmentUrl?.trim()) {
      throw new BadRequestException('กรุณาแนบหลักฐานสำหรับค่าลดหย่อนประเภทนี้');
    }
  }
}
