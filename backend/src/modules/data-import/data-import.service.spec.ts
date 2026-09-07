import { BadRequestException } from '@nestjs/common';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

import { DataImportService } from './data-import.service';
import { EmployeeImportDataset } from './datasets/employee-import.dataset';
import { ensureDataImportStorageDir } from './utils/data-import-storage.util';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';

/*
 * เทสต์ชั้นบริการกับไฟล์จริง
 *
 * ครอบตั้งแต่อ่านไฟล์ → เดาหัวตาราง → จับคู่คอลัมน์ → พรีวิว → ยืนยัน โดยแทนที่
 * ฐานข้อมูลด้วยของปลอม เพราะจุดที่พังง่ายที่สุดคือลำดับงานตรงนี้ ไม่ใช่ SQL
 */
const SAMPLE_FILE = join(process.cwd(), '..', 'docs', 'ข้อมูลพนักงาน.xlsx');

const IMPORT_KEY = 'spec-data-import';

const SCOPE: TenantScope = {
  level: 'COMPANY',
  companyId: 'company-1',
  branchId: null,
};

const ACTOR = { userId: 'user-1', scope: SCOPE };

type StoredImport = Record<string, unknown> & { id: string };

function createPrismaStub() {
  const records = new Map<string, StoredImport>();
  let sequence = 0;

  return {
    records,
    company: { findMany: async () => [{ id: 'company-1' }] },
    employee: { findMany: async () => [] },
    branch: { findMany: async () => [] },
    department: { findMany: async () => [] },
    division: { findMany: async () => [] },
    position: { findMany: async () => [] },
    employeeType: { findMany: async () => [] },
    dataImport: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        sequence += 1;
        const record = {
          ...data,
          id: `import-${sequence}`,
          createdAt: new Date('2026-08-25T00:00:00.000Z'),
          committedAt: null,
        } as StoredImport;

        records.set(record.id, record);
        return record;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = records.get(where.id) ?? { id: where.id };
        const next = { ...current, ...data } as StoredImport;

        records.set(where.id, next);
        return next;
      },
      findFirst: async ({ where }: { where: { id: string } }) =>
        records.get(where.id) ?? null,
    },
  };
}

function createService() {
  const prisma = createPrismaStub();
  const dataset = new EmployeeImportDataset(prisma as never);
  // ชุดเวลาเข้า-ออกงานไม่ได้ถูกทดสอบในไฟล์นี้ ส่ง stub เข้าไปให้ constructor ครบพอ
  const service = new DataImportService(prisma as never, dataset, {} as never);

  return { dataset, prisma, service };
}

/** ไฟล์อัปโหลดจำลอง — service อ่านจาก path เดียวกับที่ multer เขียนไว้ */
function createUploadedFile() {
  const dir = ensureDataImportStorageDir(IMPORT_KEY);
  const filename = 'employees.xlsx';
  const path = join(dir, filename);

  copyFileSync(SAMPLE_FILE, path);

  return {
    filename,
    originalname: 'ข้อมูลพนักงาน.xlsx',
    path,
    size: 12345,
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  } as Express.Multer.File;
}

const describeWithSample = existsSync(SAMPLE_FILE) ? describe : describe.skip;

describeWithSample('DataImportService', () => {
  afterAll(() => {
    const dir = join(process.cwd(), 'storage', 'imports', IMPORT_KEY);

    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  beforeAll(() => {
    const root = join(process.cwd(), 'storage', 'imports');

    if (!existsSync(root)) mkdirSync(root, { recursive: true });
  });

  it('อ่านไฟล์จริงแล้วเก็บงานนำเข้าไว้รอยืนยัน', async () => {
    const { service } = createService();

    const result = await service.analyzeUpload({
      file: createUploadedFile(),
      type: 'EMPLOYEE',
      duplicateMode: 'UPDATE',
      importKey: IMPORT_KEY,
      actor: ACTOR,
    });

    expect(result.import.status).toBe('ANALYZED');
    expect(result.import.headerRowNo).toBe(2);
    expect(result.missingFields).toEqual([]);
    expect(result.summary.total).toBeGreaterThan(0);
    expect(result.summary.create).toBe(result.summary.total);
    expect(result.rows[0]?.action).toBe('CREATE');
    /* ห้ามส่งข้อมูลภายในของ dataset ออกไปหน้าเว็บ */
    expect(result.rows[0]).not.toHaveProperty('payload');
  });

  it('ยังพรีวิวได้เมื่อจับคู่คอลัมน์ที่จำเป็นไม่ครบ แต่ไม่ให้ยืนยัน', async () => {
    const { service } = createService();

    const analyzed = await service.analyzeUpload({
      file: createUploadedFile(),
      type: 'EMPLOYEE',
      duplicateMode: 'UPDATE',
      importKey: IMPORT_KEY,
      actor: ACTOR,
    });

    const brokenMapping = { ...analyzed.mapping, startDate: null };

    const preview = await service.preview(
      analyzed.import.id,
      { mapping: brokenMapping },
      ACTOR,
    );

    expect(preview.missingFields).toContain('วันที่เริ่มงาน');
    expect(preview.rows).toEqual([]);

    await expect(
      service.commit(analyzed.import.id, { mapping: brokenMapping }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('นับผลรายแถวตอนยืนยัน และเก็บแถวที่พังไว้ในประวัติ', async () => {
    const { dataset, prisma, service } = createService();

    const analyzed = await service.analyzeUpload({
      file: createUploadedFile(),
      type: 'EMPLOYEE',
      duplicateMode: 'UPDATE',
      importKey: IMPORT_KEY,
      actor: ACTOR,
    });

    const commitRow = jest
      .spyOn(dataset, 'commitRow')
      .mockResolvedValue(undefined);
    commitRow.mockRejectedValueOnce(new Error('เขียนแถวแรกไม่สำเร็จ'));

    const result = await service.commit(analyzed.import.id, {}, ACTOR);

    expect(commitRow).toHaveBeenCalledTimes(analyzed.summary.total);
    expect(result.result.created).toBe(analyzed.summary.total - 1);
    expect(result.result.failed).toBe(1);
    expect(result.result.errors[0].message).toBe('เขียนแถวแรกไม่สำเร็จ');
    expect(result.import.status).toBe('COMMITTED');

    const stored = prisma.records.get(analyzed.import.id);
    expect(stored?.errorRows).toBe(1);
    expect(Array.isArray(stored?.rowErrors)).toBe(true);
  });

  it('ยืนยันซ้ำรอบสองไม่ได้', async () => {
    const { dataset, service } = createService();

    const analyzed = await service.analyzeUpload({
      file: createUploadedFile(),
      type: 'EMPLOYEE',
      duplicateMode: 'UPDATE',
      importKey: IMPORT_KEY,
      actor: ACTOR,
    });

    jest.spyOn(dataset, 'commitRow').mockResolvedValue(undefined);

    await service.commit(analyzed.import.id, {}, ACTOR);

    await expect(
      service.commit(analyzed.import.id, {}, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ปฏิเสธผู้ใช้ระดับสาขา เพราะไฟล์นำเข้าครอบทั้งบริษัท', async () => {
    const { service } = createService();

    await expect(
      service.analyzeUpload({
        file: createUploadedFile(),
        type: 'EMPLOYEE',
        duplicateMode: 'UPDATE',
        importKey: IMPORT_KEY,
        actor: {
          userId: 'user-2',
          scope: {
            level: 'BRANCH',
            companyId: 'company-1',
            branchId: 'branch-1',
          },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ไม่รับชนิดข้อมูลที่ยังไม่ได้ทำ dataset ไว้', async () => {
    const { service } = createService();

    await expect(
      service.analyzeUpload({
        file: createUploadedFile(),
        type: 'ATTENDANCE',
        duplicateMode: 'UPDATE',
        importKey: IMPORT_KEY,
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
