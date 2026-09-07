/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

type ScopeLevel = 'GLOBAL' | 'COMPANY' | 'BRANCH';

type UserScopeCandidate = {
  id: string;
  email: string;
  displayName: string;
  employeeCompanyId: string | null;
  employeeBranchId: string | null;
  roleCodes: string[] | null;
};

type BackfillDecision = {
  level: ScopeLevel;
  companyId: string | null;
  branchId: string | null;
  reason: string;
  requiresManualReview: boolean;
};

const GLOBAL_ROLE_CODES = new Set(['SYSTEM_ADMIN', 'SUPER_ADMIN', 'ADMIN']);

function decideScope(user: UserScopeCandidate): BackfillDecision {
  const roles = user.roleCodes ?? [];

  if (roles.some((role) => GLOBAL_ROLE_CODES.has(role))) {
    return {
      level: 'GLOBAL',
      companyId: null,
      branchId: null,
      reason: 'system-admin-role',
      requiresManualReview: false,
    };
  }

  if (user.employeeCompanyId && user.employeeBranchId) {
    return {
      level: 'BRANCH',
      companyId: user.employeeCompanyId,
      branchId: user.employeeBranchId,
      reason: 'employee-company-and-branch',
      requiresManualReview: false,
    };
  }

  if (user.employeeCompanyId) {
    return {
      level: 'COMPANY',
      companyId: user.employeeCompanyId,
      branchId: null,
      reason: 'employee-company-only',
      requiresManualReview: false,
    };
  }

  return {
    level: 'BRANCH',
    companyId: null,
    branchId: null,
    reason: 'missing-employee-scope',
    requiresManualReview: true,
  };
}

async function main() {
  const users = await prisma.$queryRaw<UserScopeCandidate[]>`
    SELECT
      u."id",
      u."email",
      u."displayName",
      e."companyId" AS "employeeCompanyId",
      e."branchId" AS "employeeBranchId",
      COALESCE(
        ARRAY_AGG(DISTINCT r."code") FILTER (WHERE r."code" IS NOT NULL),
        ARRAY[]::TEXT[]
      ) AS "roleCodes"
    FROM "User" u
    LEFT JOIN "employees" e
      ON e."userId" = u."id"
      AND e."deletedAt" IS NULL
    LEFT JOIN "UserRole" ur
      ON ur."userId" = u."id"
    LEFT JOIN "Role" r
      ON r."id" = ur."roleId"
      AND r."isActive" = TRUE
    WHERE u."deletedAt" IS NULL
    GROUP BY u."id", u."email", u."displayName", e."companyId", e."branchId"
    ORDER BY u."email" ASC
  `;

  const summary: Record<ScopeLevel, number> = {
    GLOBAL: 0,
    COMPANY: 0,
    BRANCH: 0,
  };
  const manualReview: Array<UserScopeCandidate & { reason: string }> = [];

  for (const user of users) {
    const decision = decideScope(user);
    summary[decision.level] += 1;

    if (decision.requiresManualReview) {
      manualReview.push({ ...user, reason: decision.reason });
      continue;
    }

    await prisma.$executeRaw`
      UPDATE "User"
      SET
        "scopeLevel" = ${decision.level}::"ScopeLevel",
        "scopedCompanyId" = ${decision.companyId},
        "scopedBranchId" = ${decision.branchId},
        "updatedAt" = NOW()
      WHERE "id" = ${user.id}
    `;
  }

  console.log('Backfill user tenant scope completed.');
  console.table(summary);

  if (manualReview.length) {
    console.warn('Users requiring manual scope assignment:');
    console.table(
      manualReview.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roleCodes: (user.roleCodes ?? []).join(', '),
        reason: user.reason,
      })),
    );
    console.warn(
      'Please assign scopedCompanyId/scopedBranchId manually before enabling query enforcement or validating user_scope_consistency_chk.',
    );
  } else {
    console.log('No manual scope assignment required.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
