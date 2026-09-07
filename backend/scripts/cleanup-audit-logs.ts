/* eslint-disable no-console */
/**
 * ลบ AuditLog ที่เกินอายุเก็บ
 * --------------------------
 * ตาราง AuditLog ไม่เคยมีตัวลบเลย ต่างจาก storage ที่มี cleanup:exports /
 * cleanup:temp / cleanup:storage อยู่แล้ว ทั้งที่เป็นตารางที่เขียนบ่อยที่สุด
 * ในระบบ (ทุก request ที่มี @Audit เขียนหนึ่งแถว และ 229 endpoint เป็น VIEW)
 *
 * แยกอายุเป็นสองชั้นเพราะสองกลุ่มนี้มีเหตุผลเก็บต่างกัน:
 *   VIEW                  -> AUDIT_VIEW_KEEP_DAYS     (ค่าเริ่มต้น 30 วัน)
 *   นอกนั้นทั้งหมด          -> AUDIT_MUTATION_KEEP_DAYS (ค่าเริ่มต้น 365 วัน)
 *
 * ลบเป็นชุดละ AUDIT_CLEANUP_BATCH_SIZE แถว เพื่อไม่ให้ล็อกตารางยาว
 * และเขียน manifest ลง CLEANUP_LOG_DIR เหมือน cleanup-storage.ts
 *
 *   npm run cleanup:audit              # dry-run (ค่าเริ่มต้น)
 *   npm run cleanup:audit -- --no-dry-run
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { PrismaPg } from '@prisma/adapter-pg';

import { AuditAction, PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

type Bucket = {
  label: string;
  keepDays: number;
  actions: AuditAction[];
  mode: 'in' | 'notIn';
};

type BucketResult = {
  label: string;
  keepDays: number;
  cutoff: string;
  matched: number;
  deleted: number;
};

function getNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a number >= 0`);
  }

  return parsed;
}

/** dry-run เป็นค่าเริ่มต้น ต้องสั่ง --no-dry-run ถึงจะลบจริง */
function getDryRun() {
  if (process.argv.includes('--no-dry-run')) {
    return false;
  }

  if (process.argv.includes('--dry-run')) {
    return true;
  }

  return (process.env.CLEANUP_DRY_RUN_DEFAULT ?? 'true') !== 'false';
}

function resolveProjectPath(target: string) {
  return path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
}

function cutoffDate(keepDays: number) {
  return new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
}

async function processBucket(
  bucket: Bucket,
  dryRun: boolean,
  batchSize: number,
): Promise<BucketResult> {
  const cutoff = cutoffDate(bucket.keepDays);

  const where = {
    createdAt: { lt: cutoff },
    action:
      bucket.mode === 'in'
        ? { in: bucket.actions }
        : { notIn: bucket.actions },
  };

  const matched = await prisma.auditLog.count({ where });

  console.log(
    `${bucket.label}: เก็บ ${bucket.keepDays} วัน (ก่อน ${cutoff.toISOString()}) — เข้าเงื่อนไข ${matched} แถว`,
  );

  if (dryRun || matched === 0) {
    return {
      label: bucket.label,
      keepDays: bucket.keepDays,
      cutoff: cutoff.toISOString(),
      matched,
      deleted: 0,
    };
  }

  let deleted = 0;

  // ลบทีละชุดโดยเลือก id มาก่อน เพื่อไม่ให้ DELETE ก้อนใหญ่ล็อกตารางนาน
  for (;;) {
    const batch = await prisma.auditLog.findMany({
      where,
      select: { id: true },
      take: batchSize,
    });

    if (batch.length === 0) {
      break;
    }

    const result = await prisma.auditLog.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });

    deleted += result.count;
    console.log(`  ลบแล้ว ${deleted}/${matched}`);

    if (batch.length < batchSize) {
      break;
    }
  }

  return {
    label: bucket.label,
    keepDays: bucket.keepDays,
    cutoff: cutoff.toISOString(),
    matched,
    deleted,
  };
}

async function main() {
  const dryRun = getDryRun();
  const batchSize = getNumberEnv('AUDIT_CLEANUP_BATCH_SIZE', 5000);

  const buckets: Bucket[] = [
    {
      label: 'VIEW',
      keepDays: getNumberEnv('AUDIT_VIEW_KEEP_DAYS', 30),
      actions: [AuditAction.VIEW],
      mode: 'in',
    },
    {
      label: 'การแก้ไข / อนุมัติ / ส่งออก / ล็อกอิน',
      keepDays: getNumberEnv('AUDIT_MUTATION_KEEP_DAYS', 365),
      actions: [AuditAction.VIEW],
      mode: 'notIn',
    },
  ];

  const before = await prisma.auditLog.count();

  console.log('=== cleanup AuditLog ===');
  console.log(`โหมด: ${dryRun ? 'DRY RUN (ไม่ลบจริง)' : 'ลบจริง'}`);
  console.log(`แถวทั้งหมดก่อนเริ่ม: ${before}`);
  console.log('');

  const results: BucketResult[] = [];

  for (const bucket of buckets) {
    results.push(await processBucket(bucket, dryRun, batchSize));
  }

  const after = await prisma.auditLog.count();

  const manifest = {
    version: 1 as const,
    createdAt: new Date().toISOString(),
    dryRun,
    batchSize,
    rowsBefore: before,
    rowsAfter: after,
    totalMatched: results.reduce((sum, item) => sum + item.matched, 0),
    totalDeleted: results.reduce((sum, item) => sum + item.deleted, 0),
    buckets: results,
  };

  const logDir = resolveProjectPath(
    process.env.CLEANUP_LOG_DIR ?? '../cleanup-logs',
  );

  await mkdir(logDir, { recursive: true });

  const fileName = `audit-cleanup-${manifest.createdAt.replace(/[:.]/g, '-')}.json`;

  await writeFile(
    path.join(logDir, fileName),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  console.log('');
  console.log(`เข้าเงื่อนไขรวม: ${manifest.totalMatched}`);
  console.log(`ลบจริงรวม: ${manifest.totalDeleted}`);
  console.log(`แถวคงเหลือ: ${after}`);
  console.log(`manifest: ${path.join(logDir, fileName)}`);

  if (dryRun && manifest.totalMatched > 0) {
    console.log('');
    console.log('สั่งลบจริงด้วย: npm run cleanup:audit -- --no-dry-run');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
