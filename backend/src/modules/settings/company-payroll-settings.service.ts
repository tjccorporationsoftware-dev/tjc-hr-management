import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../../database/prisma.service';
import { UpdateCompanyPayrollSettingsDto } from './dto/company-payroll-settings.dto';
import { SystemSettingsService } from './system-settings.service';

export type PayrollCalculationSettingsValue = {
  payrollCutoffDay: number;
  payrollPeriodStartDay: number;
  salaryDivisorDays: number;
  workingHoursPerDay: number;
  socialSecurityEmployeeRate: number;
  socialSecurityEmployerRate: number;
  socialSecurityMinBase: number;
  socialSecurityMaxBase: number;
};

type CompanyPayrollSettingRow = {
  id: string;
  companyId: string;
  companyCode: string | null;
  companyNameTh: string | null;
  companyNameEn: string | null;
  payrollCutoffDay: number;
  payrollPeriodStartDay: number;
  salaryDivisorDays: number;
  workingHoursPerDay: number;
  socialSecurityEmployeeRate: unknown;
  socialSecurityEmployerRate: unknown;
  socialSecurityMinBase: unknown;
  socialSecurityMaxBase: unknown;
  status: 'ACTIVE' | 'INACTIVE';
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CompanyPayrollSettingAuditRow = {
  id: string;
  settingId: string;
  companyId: string;
  previousValue: unknown;
  newValue: unknown;
  changedById: string | null;
  createdAt: Date;
  changedByEmail: string | null;
  changedByDisplayName: string | null;
};

type CompanyPayrollSettingsSource = 'COMPANY' | 'SYSTEM_DEFAULT';

@Injectable()
export class CompanyPayrollSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async getCompanyPayrollSetting(companyId: string) {
    const company = await this.ensureCompanyExists(companyId);

    const row = await this.findSettingRow(companyId);
    if (row) {
      return this.mapSettingRow(row, 'COMPANY');
    }

    return this.mapFallbackSetting(company, await this.getGlobalPayrollDefaults());
  }

  async resolvePayrollCalculationSettings(companyId: string): Promise<PayrollCalculationSettingsValue> {
    const setting = await this.getCompanyPayrollSetting(companyId);
    return this.toPayrollCalculationSettingsValue(setting);
  }

  async updateCompanyPayrollSetting(
    companyId: string,
    dto: UpdateCompanyPayrollSettingsDto,
    userId?: string | null,
  ) {
    await this.ensureCompanyExists(companyId);

    const current = await this.getCompanyPayrollSetting(companyId);
    const currentValue = this.pickPayrollCalculationSettings(current);
    const candidateValue = {
      ...currentValue,
      ...this.normalizePatch(dto),
    };

    if (Number(candidateValue.socialSecurityMaxBase) < Number(candidateValue.socialSecurityMinBase)) {
      throw new BadRequestException('ฐานสูงสุดประกันสังคมต้องไม่น้อยกว่าฐานขั้นต่ำ');
    }

    const nextValue = this.normalizePayrollSettings(candidateValue);

    const changed = JSON.stringify(currentValue) !== JSON.stringify(nextValue);
    if (!changed && current.source === 'COMPANY') {
      return current;
    }

    const previousJson = JSON.stringify(currentValue);
    const nextJson = JSON.stringify(nextValue);
    const nextId = current.source === 'COMPANY' ? current.id : randomUUID();

    const rows = await this.prisma.$queryRaw<CompanyPayrollSettingRow[]>`
      INSERT INTO "company_payroll_settings" (
        "id",
        "companyId",
        "payrollCutoffDay",
        "payrollPeriodStartDay",
        "salaryDivisorDays",
        "workingHoursPerDay",
        "socialSecurityEmployeeRate",
        "socialSecurityEmployerRate",
        "socialSecurityMinBase",
        "socialSecurityMaxBase",
        "status",
        "createdById",
        "updatedById",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${nextId},
        ${companyId},
        ${nextValue.payrollCutoffDay},
        ${nextValue.payrollPeriodStartDay},
        ${nextValue.salaryDivisorDays},
        ${nextValue.workingHoursPerDay},
        ${nextValue.socialSecurityEmployeeRate},
        ${nextValue.socialSecurityEmployerRate},
        ${nextValue.socialSecurityMinBase},
        ${nextValue.socialSecurityMaxBase},
        'ACTIVE'::"MasterStatus",
        ${userId ?? null},
        ${userId ?? null},
        NOW(),
        NOW()
      )
      ON CONFLICT ("companyId") DO UPDATE SET
        "payrollCutoffDay" = EXCLUDED."payrollCutoffDay",
        "payrollPeriodStartDay" = EXCLUDED."payrollPeriodStartDay",
        "salaryDivisorDays" = EXCLUDED."salaryDivisorDays",
        "workingHoursPerDay" = EXCLUDED."workingHoursPerDay",
        "socialSecurityEmployeeRate" = EXCLUDED."socialSecurityEmployeeRate",
        "socialSecurityEmployerRate" = EXCLUDED."socialSecurityEmployerRate",
        "socialSecurityMinBase" = EXCLUDED."socialSecurityMinBase",
        "socialSecurityMaxBase" = EXCLUDED."socialSecurityMaxBase",
        "status" = 'ACTIVE'::"MasterStatus",
        "updatedById" = ${userId ?? null},
        "updatedAt" = NOW()
      RETURNING
        "id",
        "companyId",
        NULL::text AS "companyCode",
        NULL::text AS "companyNameTh",
        NULL::text AS "companyNameEn",
        "payrollCutoffDay",
        "payrollPeriodStartDay",
        "salaryDivisorDays",
        "workingHoursPerDay",
        "socialSecurityEmployeeRate",
        "socialSecurityEmployerRate",
        "socialSecurityMinBase",
        "socialSecurityMaxBase",
        "status",
        "createdById",
        "updatedById",
        "createdAt",
        "updatedAt"
    `;

    const row = rows[0];
    if (!row) {
      throw new BadRequestException('ไม่สามารถบันทึกตั้งค่ารอบเงินเดือนของบริษัทได้');
    }

    if (changed || current.source !== 'COMPANY') {
      await this.prisma.$executeRaw`
        INSERT INTO "company_payroll_settings_audit" (
          "id",
          "settingId",
          "companyId",
          "previousValue",
          "newValue",
          "changedById",
          "createdAt"
        )
        VALUES (
          ${randomUUID()},
          ${row.id},
          ${companyId},
          ${previousJson}::jsonb,
          ${nextJson}::jsonb,
          ${userId ?? null},
          NOW()
        )
      `;
    }

    return this.getCompanyPayrollSetting(companyId);
  }

  async resetCompanyPayrollSetting(companyId: string, userId?: string | null) {
    const defaults = await this.getGlobalPayrollDefaults();
    return this.updateCompanyPayrollSetting(companyId, defaults, userId);
  }

  async getCompanyPayrollSettingAudit(
    companyId: string,
    params?: { page?: number; pageSize?: number },
  ) {
    await this.ensureCompanyExists(companyId);

    const page = Math.max(Number(params?.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(params?.pageSize ?? 20), 1), 100);
    const offset = (page - 1) * pageSize;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<CompanyPayrollSettingAuditRow[]>`
        SELECT
          a."id",
          a."settingId",
          a."companyId",
          a."previousValue",
          a."newValue",
          a."changedById",
          a."createdAt",
          u."email" AS "changedByEmail",
          u."displayName" AS "changedByDisplayName"
        FROM "company_payroll_settings_audit" a
        LEFT JOIN "User" u ON u."id" = a."changedById"
        WHERE a."companyId" = ${companyId}
        ORDER BY a."createdAt" DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "company_payroll_settings_audit"
        WHERE "companyId" = ${companyId}
      `,
    ]);

    const total = Number(totals[0]?.count ?? 0);

    return {
      data: rows.map((row) => ({
        id: row.id,
        settingId: row.settingId,
        companyId: row.companyId,
        previousValue: this.normalizePayrollSettings(this.parseJsonObject(row.previousValue)),
        newValue: this.normalizePayrollSettings(this.parseJsonObject(row.newValue)),
        changedById: row.changedById,
        changedBy: row.changedById
          ? {
              id: row.changedById,
              email: row.changedByEmail,
              displayName: row.changedByDisplayName,
            }
          : null,
        createdAt: row.createdAt,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private async ensureCompanyExists(companyId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      code: string | null;
      nameTh: string | null;
      nameEn: string | null;
    }>>`
      SELECT "id", "code", "nameTh", "nameEn"
      FROM "Company"
      WHERE "id" = ${companyId} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    const company = rows[0];
    if (!company) {
      throw new NotFoundException('ไม่พบบริษัทที่ต้องการตั้งค่ารอบเงินเดือน');
    }

    return company;
  }

  private async findSettingRow(companyId: string) {
    const rows = await this.prisma.$queryRaw<CompanyPayrollSettingRow[]>`
      SELECT
        s."id",
        s."companyId",
        c."code" AS "companyCode",
        c."nameTh" AS "companyNameTh",
        c."nameEn" AS "companyNameEn",
        s."payrollCutoffDay",
        s."payrollPeriodStartDay",
        s."salaryDivisorDays",
        s."workingHoursPerDay",
        s."socialSecurityEmployeeRate",
        s."socialSecurityEmployerRate",
        s."socialSecurityMinBase",
        s."socialSecurityMaxBase",
        s."status",
        s."createdById",
        s."updatedById",
        s."createdAt",
        s."updatedAt"
      FROM "company_payroll_settings" s
      INNER JOIN "Company" c ON c."id" = s."companyId"
      WHERE s."companyId" = ${companyId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private async getGlobalPayrollDefaults(): Promise<PayrollCalculationSettingsValue> {
    const settings = await this.systemSettingsService.getPayrollCalculationSettings();
    return this.normalizePayrollSettings(settings);
  }

  private mapSettingRow(row: CompanyPayrollSettingRow, source: CompanyPayrollSettingsSource) {
    const values = this.normalizePayrollSettings({
      payrollCutoffDay: row.payrollCutoffDay,
      payrollPeriodStartDay: row.payrollPeriodStartDay,
      salaryDivisorDays: row.salaryDivisorDays,
      workingHoursPerDay: row.workingHoursPerDay,
      socialSecurityEmployeeRate: row.socialSecurityEmployeeRate,
      socialSecurityEmployerRate: row.socialSecurityEmployerRate,
      socialSecurityMinBase: row.socialSecurityMinBase,
      socialSecurityMaxBase: row.socialSecurityMaxBase,
    });

    return {
      id: row.id,
      companyId: row.companyId,
      company: {
        id: row.companyId,
        code: row.companyCode,
        nameTh: row.companyNameTh,
        nameEn: row.companyNameEn,
      },
      ...values,
      status: row.status,
      source,
      createdById: row.createdById,
      updatedById: row.updatedById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapFallbackSetting(
    company: { id: string; code: string | null; nameTh: string | null; nameEn: string | null },
    defaults: PayrollCalculationSettingsValue,
  ) {
    return {
      id: null,
      companyId: company.id,
      company,
      ...defaults,
      status: 'ACTIVE' as const,
      source: 'SYSTEM_DEFAULT' as const,
      createdById: null,
      updatedById: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  private pickPayrollCalculationSettings(value: PayrollCalculationSettingsValue): PayrollCalculationSettingsValue {
    return this.normalizePayrollSettings(value);
  }

  private toPayrollCalculationSettingsValue(value: PayrollCalculationSettingsValue): PayrollCalculationSettingsValue {
    return this.normalizePayrollSettings(value);
  }

  private normalizePatch(dto: UpdateCompanyPayrollSettingsDto): Partial<PayrollCalculationSettingsValue> {
    const patch: Partial<PayrollCalculationSettingsValue> = {};

    if (dto.payrollCutoffDay !== undefined) patch.payrollCutoffDay = dto.payrollCutoffDay;
    if (dto.payrollPeriodStartDay !== undefined) patch.payrollPeriodStartDay = dto.payrollPeriodStartDay;
    if (dto.salaryDivisorDays !== undefined) patch.salaryDivisorDays = dto.salaryDivisorDays;
    if (dto.workingHoursPerDay !== undefined) patch.workingHoursPerDay = dto.workingHoursPerDay;
    if (dto.socialSecurityEmployeeRate !== undefined) patch.socialSecurityEmployeeRate = dto.socialSecurityEmployeeRate;
    if (dto.socialSecurityEmployerRate !== undefined) patch.socialSecurityEmployerRate = dto.socialSecurityEmployerRate;
    if (dto.socialSecurityMinBase !== undefined) patch.socialSecurityMinBase = dto.socialSecurityMinBase;
    if (dto.socialSecurityMaxBase !== undefined) patch.socialSecurityMaxBase = dto.socialSecurityMaxBase;

    return patch;
  }

  private normalizePayrollSettings(value: Partial<Record<keyof PayrollCalculationSettingsValue, unknown>>): PayrollCalculationSettingsValue {
    const settings: PayrollCalculationSettingsValue = {
      payrollCutoffDay: this.toNumber(value.payrollCutoffDay, 25),
      payrollPeriodStartDay: this.toNumber(value.payrollPeriodStartDay, 26),
      salaryDivisorDays: this.toNumber(value.salaryDivisorDays, 30),
      workingHoursPerDay: this.toNumber(value.workingHoursPerDay, 8),
      socialSecurityEmployeeRate: this.toNumber(value.socialSecurityEmployeeRate, 5),
      socialSecurityEmployerRate: this.toNumber(value.socialSecurityEmployerRate, 5),
      socialSecurityMinBase: this.toNumber(value.socialSecurityMinBase, 1650),
      socialSecurityMaxBase: this.toNumber(value.socialSecurityMaxBase, 17500),
    };

    settings.payrollCutoffDay = this.clampInt(settings.payrollCutoffDay, 1, 31, 25);
    settings.payrollPeriodStartDay = this.clampInt(settings.payrollPeriodStartDay, 1, 31, 26);
    settings.salaryDivisorDays = this.clampInt(settings.salaryDivisorDays, 1, 31, 30);
    settings.workingHoursPerDay = this.clampInt(settings.workingHoursPerDay, 1, 24, 8);
    settings.socialSecurityEmployeeRate = this.clampNumber(settings.socialSecurityEmployeeRate, 0, 100, 5);
    settings.socialSecurityEmployerRate = this.clampNumber(settings.socialSecurityEmployerRate, 0, 100, 5);
    settings.socialSecurityMinBase = Math.max(Number(settings.socialSecurityMinBase), 0);
    settings.socialSecurityMaxBase = Math.max(Number(settings.socialSecurityMaxBase), settings.socialSecurityMinBase);

    if (settings.socialSecurityMaxBase < settings.socialSecurityMinBase) {
      throw new BadRequestException('ฐานสูงสุดประกันสังคมต้องไม่น้อยกว่าฐานขั้นต่ำ');
    }

    return settings;
  }

  private parseJsonObject(value: unknown): Partial<Record<keyof PayrollCalculationSettingsValue, unknown>> {
    if (!value) return {};

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    }

    return typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<Record<keyof PayrollCalculationSettingsValue, unknown>>)
      : {};
  }

  private toNumber(value: unknown, fallback: number) {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private clampInt(value: number, min: number, max: number, fallback: number) {
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return fallback;
    }
    return parsed;
  }

  private clampNumber(value: number, min: number, max: number, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return fallback;
    }
    return parsed;
  }
}
