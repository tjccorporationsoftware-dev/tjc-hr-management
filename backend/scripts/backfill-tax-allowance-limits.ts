/**
 * เติมกลุ่มเพดานและประเภทค่าลดหย่อนที่ยังขาด ให้ปีภาษีที่สร้างไว้ก่อนหน้านี้
 * -----------------------------------------------------------------------------
 * ปีภาษีที่สร้างก่อนระบบเพดานใหม่ จะมีประเภทค่าลดหย่อนแค่ชุดเดิม
 * และไม่มีกลุ่มเพดานรวมเลย ทำให้กฎ "รวมกันไม่เกิน 500,000" ยังไม่ทำงาน
 *
 *   npm run tax:backfill-allowance-limits                  ดูอย่างเดียว ไม่เขียน
 *   npm run tax:backfill-allowance-limits -- --apply       เขียนจริง
 *   npm run tax:backfill-allowance-limits -- --apply --company=<companyId>
 *   npm run tax:backfill-allowance-limits -- --apply --update-limits
 *
 * ค่าตั้งต้นคือ dry-run เสมอ ต้องใส่ --apply ถึงจะเขียน
 *
 * สิ่งที่ทำ (ทั้งหมด idempotent รันซ้ำได้):
 *   1. เพิ่มกลุ่มเพดานที่ยังไม่มี — ไม่แตะกลุ่มที่มีอยู่แล้ว
 *   2. เพิ่มประเภทค่าลดหย่อนที่ยังไม่มี (ยอดตั้งต้น 0 จึงไม่กระทบภาษีใคร)
 *   3. เฉพาะเมื่อใส่ --update-limits : ตั้งเพดาน %/กลุ่ม/ตัวคูณ ให้ประเภทของระบบ
 *      ที่ยังไม่เคยตั้ง — ขั้นนี้ทำให้ภาษีของบางคนเปลี่ยนได้ จึงแยกธงไว้ต่างหาก
 *      และจะพิมพ์รายชื่อพนักงานที่ได้รับผลกระทบให้ดูก่อนเสมอ
 */
import 'dotenv/config';
import { PrismaService } from '../src/database/prisma.service';
import {
  DEFAULT_ALLOWANCE_LIMIT_GROUPS,
  DEFAULT_ALLOWANCE_TYPES,
} from '../src/modules/payroll/constants/payroll-tax-allowance-defaults';
import {
  resolveAllowanceTotal,
  type AllowanceLimitGroupRule,
  type AllowanceLimitInput,
} from '../src/modules/payroll/utils/payroll-tax-allowance-limit.util';

function readFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readOption(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBaht(value: number) {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

/*
 * Prisma client ในโปรเจคนี้ถูก cast เป็น any ทั่วโมดูล payroll
 * สคริปต์จึงประกาศรูปร่างข้อมูลที่ใช้จริงไว้เอง จะได้ยังมีตัวช่วยตรวจชนิด
 */
type AllowanceTypeRow = {
  id: string;
  code: string;
  isSystem: boolean;
  maxAmount: unknown;
  maxPercentOfIncome: unknown;
  deductionMultiplier: unknown;
  limitGroupCode: string | null;
  nameTh: string;
};

type LimitGroupRow = { code: string };

type TaxYearRow = {
  id: string;
  companyId: string;
  taxYear: number;
  standardPersonalAllowance: unknown;
  company: { nameTh: string } | null;
  allowanceTypes: AllowanceTypeRow[];
  allowanceLimitGroups: LimitGroupRow[];
};

type AllowanceRow = {
  declaredAmount: unknown;
  allowanceType: { code: string; nameTh: string; maxAmount: unknown } | null;
};

type ProfileRow = {
  estimatedAnnualIncome: unknown;
  employee: {
    employeeCode: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  allowances: AllowanceRow[];
};

/** Prisma delegate เท่าที่สคริปต์นี้เรียกใช้ */
type PrismaLike = {
  payrollTaxYear: { findMany: (args: unknown) => Promise<TaxYearRow[]> };
  payrollTaxAllowanceLimitGroup: {
    createMany: (args: unknown) => Promise<unknown>;
  };
  payrollTaxAllowanceType: {
    createMany: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  employeeTaxProfile: { findMany: (args: unknown) => Promise<ProfileRow[]> };
};

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const db = prisma as unknown as PrismaLike;
  const apply = readFlag('apply');
  const updateLimits = readFlag('update-limits');
  const companyOption = readOption('company');

  const taxYears = await db.payrollTaxYear.findMany({
    where: {
      deletedAt: null,
      ...(companyOption ? { companyId: companyOption } : {}),
    },
    include: {
      company: { select: { nameTh: true } },
      allowanceTypes: { where: { deletedAt: null } },
      allowanceLimitGroups: { where: { deletedAt: null } },
    },
    orderBy: [{ companyId: 'asc' }, { taxYear: 'asc' }],
  });

  if (!taxYears.length) {
    console.log('ไม่พบปีภาษีที่ตรงเงื่อนไข');
    await prisma.$disconnect();
    return;
  }

  console.log(
    `${apply ? 'เขียนจริง' : 'ดูอย่างเดียว (ใส่ --apply เพื่อเขียน)'} · พบปีภาษี ${taxYears.length} รายการ\n`,
  );

  let addedGroups = 0;
  let addedTypes = 0;
  let updatedTypes = 0;
  let affectedEmployees = 0;

  for (const taxYear of taxYears) {
    const label = `${taxYear.company?.nameTh ?? taxYear.companyId} · ปีภาษี ${taxYear.taxYear}`;
    const existingGroupCodes = new Set<string>(
      taxYear.allowanceLimitGroups.map((row) => row.code),
    );
    const existingTypes = new Map<string, AllowanceTypeRow>(
      taxYear.allowanceTypes.map((row) => [row.code, row]),
    );

    const missingGroups = DEFAULT_ALLOWANCE_LIMIT_GROUPS.filter(
      (group) => !existingGroupCodes.has(group.code),
    );
    const missingTypes = DEFAULT_ALLOWANCE_TYPES.filter(
      (type) => !existingTypes.has(type.code),
    );

    // ประเภทของระบบที่ยังไม่เคยตั้งเพดานใหม่เลย — ถือว่ายังเป็นค่าที่ระบบตั้งให้
    const typesToUpdate = updateLimits
      ? DEFAULT_ALLOWANCE_TYPES.filter((type) => {
          const current = existingTypes.get(type.code);
          if (!current || !current.isSystem) return false;

          const hasLimitRule =
            current.limitGroupCode !== null ||
            current.maxPercentOfIncome !== null ||
            money(current.deductionMultiplier) !== 1;
          if (hasLimitRule) return false;

          const wantsLimitRule =
            'limitGroupCode' in type ||
            'maxPercentOfIncome' in type ||
            'deductionMultiplier' in type;
          return wantsLimitRule;
        })
      : [];

    if (
      !missingGroups.length &&
      !missingTypes.length &&
      !typesToUpdate.length
    ) {
      console.log(`- ${label} : ครบแล้ว`);
      continue;
    }

    console.log(`- ${label}`);
    if (missingGroups.length) {
      console.log(
        `    เพิ่มกลุ่มเพดาน ${missingGroups.length} กลุ่ม: ${missingGroups.map((g) => g.code).join(', ')}`,
      );
    }
    if (missingTypes.length) {
      console.log(
        `    เพิ่มประเภทค่าลดหย่อน ${missingTypes.length} รายการ: ${missingTypes.map((t) => t.code).join(', ')}`,
      );
    }
    if (typesToUpdate.length) {
      console.log(
        `    ตั้งเพดานใหม่ให้ ${typesToUpdate.length} รายการ: ${typesToUpdate.map((t) => t.code).join(', ')}`,
      );
    }

    // เตือนล่วงหน้าว่าใครจะถูกตัดยอดลง ถ้าตั้งเพดานใหม่
    if (typesToUpdate.length) {
      const impacted = await reportImpactedEmployees(db, taxYear);
      affectedEmployees += impacted;
    }

    if (!apply) continue;

    if (missingGroups.length) {
      await db.payrollTaxAllowanceLimitGroup.createMany({
        data: missingGroups.map((group) => ({
          taxYearId: taxYear.id,
          ...group,
          status: 'ACTIVE',
        })),
        skipDuplicates: true,
      });
      addedGroups += missingGroups.length;
    }

    if (missingTypes.length) {
      await db.payrollTaxAllowanceType.createMany({
        data: missingTypes.map((type) => ({
          taxYearId: taxYear.id,
          status: 'ACTIVE',
          ...type,
        })),
        skipDuplicates: true,
      });
      addedTypes += missingTypes.length;
    }

    for (const type of typesToUpdate) {
      const current = existingTypes.get(type.code);
      if (!current) continue;

      await db.payrollTaxAllowanceType.update({
        where: { id: current.id },
        data: {
          maxPercentOfIncome:
            'maxPercentOfIncome' in type ? type.maxPercentOfIncome : null,
          percentBase:
            'percentBase' in type ? type.percentBase : 'GROSS_INCOME',
          deductionMultiplier:
            'deductionMultiplier' in type ? type.deductionMultiplier : 1,
          limitGroupCode: 'limitGroupCode' in type ? type.limitGroupCode : null,
        },
      });
      updatedTypes += 1;
    }
  }

  console.log('\nสรุป');
  console.log(`  กลุ่มเพดานที่เพิ่ม     : ${addedGroups}`);
  console.log(`  ประเภทที่เพิ่ม         : ${addedTypes}`);
  console.log(`  ประเภทที่ตั้งเพดานใหม่ : ${updatedTypes}`);
  if (affectedEmployees) {
    console.log(`  พนักงานที่ยอดลดหย่อนจะลดลง : ${affectedEmployees}`);
  }
  if (!apply) {
    console.log('\nยังไม่ได้เขียนอะไรลงฐานข้อมูล — ใส่ --apply เมื่อพร้อม');
  }
  if (!updateLimits) {
    console.log(
      'ยังไม่ได้ตั้งเพดาน %/กลุ่ม ให้ประเภทเดิม — ใส่ --update-limits เมื่อต้องการ',
    );
  }

  await prisma.$disconnect();
}

/**
 * ลองคิดเพดานใหม่กับยอดที่พนักงานแจ้งไว้จริง แล้วบอกว่าใครจะถูกตัด
 * ใช้เงินเดือนปัจจุบัน × 12 เป็นตัวประมาณเงินได้ทั้งปี พอสำหรับเตือนล่วงหน้า
 */
async function reportImpactedEmployees(db: PrismaLike, taxYear: TaxYearRow) {
  const profiles = await db.employeeTaxProfile.findMany({
    where: {
      taxYearId: taxYear.id,
      deletedAt: null,
    },
    include: {
      employee: {
        select: { employeeCode: true, firstName: true, lastName: true },
      },
      allowances: {
        where: { deletedAt: null },
        include: { allowanceType: true },
      },
    },
  });

  type AllowancePreset = {
    maxPercentOfIncome?: number | null;
    percentBase?: string;
    deductionMultiplier?: number;
    limitGroupCode?: string;
  };

  const typeByCode = new Map<string, AllowancePreset>(
    DEFAULT_ALLOWANCE_TYPES.map((type) => [type.code, type as AllowancePreset]),
  );
  const limitGroups: AllowanceLimitGroupRule[] =
    DEFAULT_ALLOWANCE_LIMIT_GROUPS.map((group) => ({
      code: group.code,
      nameTh: group.nameTh,
      maxAmount: group.maxAmount,
      maxPercentOfIncome: group.maxPercentOfIncome,
      percentBase:
        group.percentBase === 'NET_AFTER_ALLOWANCE'
          ? 'NET_AFTER_ALLOWANCE'
          : 'GROSS_INCOME',
    }));

  let impacted = 0;

  for (const profile of profiles) {
    const rows: AllowanceLimitInput[] = profile.allowances.map((allowance) => {
      const code = allowance.allowanceType?.code ?? '';
      const preset = typeByCode.get(code) ?? {};

      return {
        code,
        nameTh: allowance.allowanceType?.nameTh ?? code,
        amount: money(allowance.declaredAmount),
        maxAmount:
          allowance.allowanceType?.maxAmount === null
            ? null
            : money(allowance.allowanceType?.maxAmount),
        maxPercentOfIncome: preset.maxPercentOfIncome ?? null,
        percentBase:
          preset.percentBase === 'NET_AFTER_ALLOWANCE'
            ? 'NET_AFTER_ALLOWANCE'
            : 'GROSS_INCOME',
        deductionMultiplier: preset.deductionMultiplier ?? 1,
        limitGroupCode: preset.limitGroupCode ?? null,
      };
    });

    const declaredTotal = rows.reduce((sum, row) => sum + row.amount, 0);
    if (declaredTotal <= 0) continue;

    const annualIncome =
      money(profile.estimatedAnnualIncome) || declaredTotal * 4;
    const resolved = resolveAllowanceTotal({
      allowances: rows,
      limitGroups,
      grossIncome: annualIncome,
      expenseDeduction: Math.min(annualIncome * 0.5, 100000),
      baseAllowanceTotal: money(taxYear.standardPersonalAllowance),
    });

    if (resolved.total >= declaredTotal - 0.005) continue;

    impacted += 1;
    const employee = profile.employee;
    console.log(
      `      ! ${employee?.employeeCode ?? '-'} ${employee?.firstName ?? ''} ${employee?.lastName ?? ''} : ` +
        `${formatBaht(declaredTotal)} → ${formatBaht(resolved.total)} บาท`,
    );
  }

  return impacted;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
