import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';

import { PrismaService } from '../../database/prisma.service';
import {
  DataImportDuplicateMode,
  DataImportStatus,
  DataImportType,
  Prisma,
} from '../../generated/prisma/client';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';

import { AttendanceImportDataset } from './datasets/attendance-import.dataset';
import { EmployeeImportDataset } from './datasets/employee-import.dataset';
import type {
  DataImportDataset,
  DataImportMapping,
  DataImportPreparedRow,
} from './datasets/data-import-dataset.types';

import type { CommitDataImportDto } from './dto/commit-data-import.dto';
import type { ListDataImportsQueryDto } from './dto/list-data-imports-query.dto';
import {
  assertRequiredFieldsMapped,
  buildAutoMapping,
  detectHeaderRowIndex,
  normalizeMapping,
} from './utils/data-import-mapping.util';
import {
  createDataImportStorageKey,
  getDataImportAbsolutePath,
  DATA_IMPORT_STORAGE_PROVIDER,
} from './utils/data-import-storage.util';
import { readSheetGrid } from './utils/excel-sheet.util';

/** จำนวนแถวสูงสุดที่ส่งกลับไปแสดงในหน้าพรีวิว — สรุปยอดยังนับจากทุกแถว */
const PREVIEW_ROW_LIMIT = 300;

/** เก็บรายละเอียดแถวที่พังไว้เท่านี้ พอให้ไล่แก้ไฟล์ได้โดยไม่บวมจนเปิดหน้าไม่ไหว */
const STORED_ERROR_LIMIT = 200;

export type DataImportActor = {
  id?: string;
  userId?: string;
  scope: TenantScope;
};

@Injectable()
export class DataImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeImportDataset: EmployeeImportDataset,
    private readonly attendanceImportDataset: AttendanceImportDataset,
  ) {}

  /*
   * ทะเบียนชุดข้อมูล
   *
   * ชุดใหม่ (เวลาเข้างาน / รายรับรายจ่าย) เพิ่มที่นี่ที่เดียว โครงอัปโหลด-จับคู่คอลัมน์
   * -พรีวิว-ยืนยัน-ประวัติ ใช้ร่วมกันทั้งหมด
   */
  private get datasets(): DataImportDataset[] {
    return [this.employeeImportDataset, this.attendanceImportDataset];
  }

  private getDataset(type: DataImportType): DataImportDataset {
    const dataset = this.datasets.find((item) => item.type === type);

    if (!dataset) {
      throw new BadRequestException(
        'ยังไม่รองรับการนำเข้าข้อมูลชนิดนี้ กรุณาเลือกชนิดข้อมูลอื่น',
      );
    }

    return dataset;
  }

  listDatasets() {
    return this.datasets.map((dataset) => ({
      type: dataset.type,
      label: dataset.label,
      description: dataset.description,
      fields: dataset.fields,
    }));
  }

  private getActorId(actor: DataImportActor) {
    return actor.userId ?? actor.id ?? null;
  }

  /**
   * บริษัทที่จะเขียนข้อมูลลง
   *
   * ผู้ใช้ระดับบริษัท/สาขามีบริษัทติดมากับ token อยู่แล้ว ส่วนผู้ดูแลระดับระบบไม่มี
   * ถ้ามีบริษัทเดียวในระบบก็ชัดเจนพอ แต่ถ้ามีหลายบริษัทต้องให้เข้าด้วยผู้ใช้ที่ระบุบริษัท
   * เพราะเดาผิดแปลว่าทะเบียนพนักงานทั้งไฟล์ไปลงผิดบริษัท
   */
  private async resolveCompanyId(scope: TenantScope) {
    /*
     * ไฟล์นำเข้าเขียนข้อมูลระดับบริษัท ไม่ได้จำกัดอยู่แค่สาขาของผู้เรียก
     * ผู้ใช้ระดับสาขาจึงนำเข้าไม่ได้ ต้องเป็นผู้ดูแลระดับบริษัทขึ้นไป
     */
    if (scope.level === 'BRANCH') {
      throw new BadRequestException(
        'บัญชีระดับสาขานำเข้าข้อมูลไม่ได้ เพราะไฟล์นำเข้าครอบคลุมทั้งบริษัท',
      );
    }

    if (scope.companyId) return scope.companyId;

    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
      take: 2,
    });

    if (companies.length === 1) return companies[0].id;

    throw new BadRequestException(
      'บัญชีนี้ไม่ได้ผูกกับบริษัทใดบริษัทหนึ่ง กรุณาเข้าสู่ระบบด้วยผู้ใช้ที่มีบริษัทกำกับก่อนนำเข้าข้อมูล',
    );
  }

  private scopeWhere(scope: TenantScope): Prisma.DataImportWhereInput {
    return scope.level !== 'GLOBAL' && scope.companyId
      ? { companyId: scope.companyId }
      : {};
  }

  private async findImportRecord(id: string, scope: TenantScope) {
    const record = await this.prisma.dataImport.findFirst({
      where: { id, ...this.scopeWhere(scope) },
    });

    if (!record) {
      throw new NotFoundException('ไม่พบงานนำเข้าข้อมูลนี้');
    }

    return record;
  }

  private toSummary(rows: DataImportPreparedRow[]) {
    return {
      total: rows.length,
      create: rows.filter((row) => row.action === 'CREATE').length,
      update: rows.filter((row) => row.action === 'UPDATE').length,
      skip: rows.filter((row) => row.action === 'SKIP').length,
      error: rows.filter((row) => row.action === 'ERROR').length,
      warning: rows.filter((row) => row.warnings.length > 0).length,
    };
  }

  /** ตัด payload ภายในออกก่อนส่งให้หน้าเว็บ — หน้าเว็บใช้แค่ค่าที่อ่านได้ */
  private toPreviewRows(rows: DataImportPreparedRow[]) {
    return rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => ({
      rowNo: row.rowNo,
      key: row.key,
      title: row.title,
      action: row.action,
      values: row.values,
      errors: row.errors,
      warnings: row.warnings,
    }));
  }

  private buildColumns(headerRow: string[]) {
    return headerRow.map((label, index) => ({
      index: index + 1,
      label: label || `คอลัมน์ที่ ${index + 1}`,
    }));
  }

  private missingRequiredFields(
    mapping: DataImportMapping,
    dataset: DataImportDataset,
  ) {
    return dataset.fields
      .filter((field) => field.required && !mapping[field.key])
      .map((field) => field.label);
  }

  private async analyzeFile(params: {
    filePath: string;
    sheetName?: string | null;
    type: DataImportType;
    mapping?: DataImportMapping | null;
    duplicateMode: DataImportDuplicateMode;
    companyId: string;
    /** true เฉพาะตอนกดยืนยัน — ตอนพรีวิวปล่อยให้ยังจับคู่ไม่ครบได้ */
    enforceMapping?: boolean;
  }) {
    const dataset = this.getDataset(params.type);
    const grid = await readSheetGrid(params.filePath, params.sheetName);

    if (grid.rows.length === 0) {
      throw new BadRequestException('ไฟล์นี้ไม่มีข้อมูลในชีต');
    }

    const headerRowIndex = detectHeaderRowIndex(grid.rows, dataset.fields);
    const headerRow = grid.rows[headerRowIndex] ?? [];

    const mapping = params.mapping
      ? normalizeMapping(params.mapping, dataset.fields, headerRow.length)
      : buildAutoMapping(headerRow, dataset.fields);

    if (params.enforceMapping) {
      assertRequiredFieldsMapped(mapping, dataset.fields);
    }

    const missingFields = this.missingRequiredFields(mapping, dataset);

    /*
     * จับคู่คอลัมน์ที่จำเป็นไม่ครบ = ยังอ่านแถวไม่ได้ แต่ต้องไม่ปฏิเสธไฟล์ทิ้ง
     *
     * ตอนแรกโยน error ตั้งแต่อัปโหลด ซึ่งแปลว่าไฟล์ที่หัวคอลัมน์ตั้งชื่อไม่เหมือนใคร
     * จะเข้าระบบไม่ได้เลย ทั้งที่หน้าเว็บมีช่องให้แก้การจับคู่เองอยู่แล้ว
     */
    const rows =
      missingFields.length > 0
        ? []
        : await dataset.prepare({
            rows: grid.rows,
            headerRowIndex,
            mapping,
            duplicateMode: params.duplicateMode,
            companyId: params.companyId,
          });

    return {
      dataset,
      sheetName: grid.sheetName,
      headerRowNo: headerRowIndex + 1,
      columns: this.buildColumns(headerRow),
      mapping,
      missingFields,
      rows,
    };
  }

  private toImportSummaryPayload(record: {
    id: string;
    type: DataImportType;
    status: DataImportStatus;
    fileName: string;
    sheetName: string | null;
    headerRowNo: number | null;
    duplicateMode: DataImportDuplicateMode;
    totalRows: number;
    createdRows: number;
    updatedRows: number;
    skippedRows: number;
    errorRows: number;
    committedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: record.id,
      type: record.type,
      status: record.status,
      fileName: record.fileName,
      sheetName: record.sheetName,
      headerRowNo: record.headerRowNo,
      duplicateMode: record.duplicateMode,
      totalRows: record.totalRows,
      createdRows: record.createdRows,
      updatedRows: record.updatedRows,
      skippedRows: record.skippedRows,
      errorRows: record.errorRows,
      committedAt: record.committedAt,
      createdAt: record.createdAt,
    };
  }

  /** อัปโหลดไฟล์ + อ่านโครงไฟล์ + พรีวิวรอบแรกด้วยการจับคู่คอลัมน์อัตโนมัติ */
  async analyzeUpload(params: {
    file: Express.Multer.File;
    type: DataImportType;
    duplicateMode: DataImportDuplicateMode;
    importKey: string;
    actor: DataImportActor;
  }) {
    const companyId = await this.resolveCompanyId(params.actor.scope);

    const storageKey = createDataImportStorageKey({
      importKey: params.importKey,
      filename: params.file.filename,
    });

    let analysis: Awaited<ReturnType<typeof this.analyzeFile>>;

    try {
      analysis = await this.analyzeFile({
        filePath: params.file.path,
        type: params.type,
        duplicateMode: params.duplicateMode,
        companyId,
      });
    } catch (error) {
      /* ไฟล์ที่อ่านไม่ออกไม่ต้องเก็บไว้ให้รกดิสก์ */
      await this.safelyDeleteFile(params.file.path);
      throw error;
    }

    const summary = this.toSummary(analysis.rows);

    const record = await this.prisma.dataImport.create({
      data: {
        companyId,
        type: params.type,
        status: DataImportStatus.ANALYZED,
        fileName: params.file.originalname,
        fileSize: params.file.size,
        mimeType: params.file.mimetype,
        storageProvider: DATA_IMPORT_STORAGE_PROVIDER,
        storageKey,
        sheetName: analysis.sheetName,
        headerRowNo: analysis.headerRowNo,
        mapping: analysis.mapping as Prisma.InputJsonValue,
        duplicateMode: params.duplicateMode,
        totalRows: summary.total,
        errorRows: summary.error,
        createdById: this.getActorId(params.actor),
      },
    });

    return {
      import: this.toImportSummaryPayload(record),
      fields: analysis.dataset.fields,
      columns: analysis.columns,
      mapping: analysis.mapping,
      missingFields: analysis.missingFields,
      summary,
      rows: this.toPreviewRows(analysis.rows),
      rowsTruncated: analysis.rows.length > PREVIEW_ROW_LIMIT,
    };
  }

  /** พรีวิวซ้ำหลังผู้ใช้แก้การจับคู่คอลัมน์หรือเปลี่ยนวิธีจัดการข้อมูลซ้ำ */
  async preview(id: string, dto: CommitDataImportDto, actor: DataImportActor) {
    const record = await this.findImportRecord(id, actor.scope);

    if (record.status === DataImportStatus.COMMITTED) {
      throw new BadRequestException('งานนำเข้านี้ยืนยันไปแล้ว');
    }

    const duplicateMode = dto.duplicateMode ?? record.duplicateMode;

    const analysis = await this.analyzeFile({
      filePath: getDataImportAbsolutePath(record.storageKey),
      sheetName: record.sheetName,
      type: record.type,
      mapping: (dto.mapping ??
        (record.mapping as DataImportMapping | null)) as DataImportMapping,
      duplicateMode,
      companyId: record.companyId,
    });

    const summary = this.toSummary(analysis.rows);

    const updated = await this.prisma.dataImport.update({
      where: { id: record.id },
      data: {
        mapping: analysis.mapping as Prisma.InputJsonValue,
        duplicateMode,
        totalRows: summary.total,
        errorRows: summary.error,
      },
    });

    return {
      import: this.toImportSummaryPayload(updated),
      fields: analysis.dataset.fields,
      columns: analysis.columns,
      mapping: analysis.mapping,
      missingFields: analysis.missingFields,
      summary,
      rows: this.toPreviewRows(analysis.rows),
      rowsTruncated: analysis.rows.length > PREVIEW_ROW_LIMIT,
    };
  }

  /** เขียนข้อมูลจริง — อ่านไฟล์เดิมซ้ำ ไม่เชื่อแถวที่หน้าเว็บส่งกลับมา */
  async commit(id: string, dto: CommitDataImportDto, actor: DataImportActor) {
    const record = await this.findImportRecord(id, actor.scope);

    if (record.status === DataImportStatus.COMMITTED) {
      throw new BadRequestException('งานนำเข้านี้ยืนยันไปแล้ว');
    }

    if (record.status === DataImportStatus.CANCELLED) {
      throw new BadRequestException('งานนำเข้านี้ถูกยกเลิกไปแล้ว');
    }

    const duplicateMode = dto.duplicateMode ?? record.duplicateMode;

    const analysis = await this.analyzeFile({
      filePath: getDataImportAbsolutePath(record.storageKey),
      sheetName: record.sheetName,
      type: record.type,
      mapping: (dto.mapping ??
        (record.mapping as DataImportMapping | null)) as DataImportMapping,
      duplicateMode,
      companyId: record.companyId,
      enforceMapping: true,
    });

    const actorId = this.getActorId(actor);
    const failures: { rowNo: number; key: string; message: string }[] = [];

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of analysis.rows) {
      if (row.action === 'ERROR') {
        failures.push({
          rowNo: row.rowNo,
          key: row.key,
          message: row.errors.join(' · '),
        });
        continue;
      }

      if (row.action === 'SKIP') {
        skipped += 1;
        continue;
      }

      try {
        /*
         * เขียนทีละแถว ไม่ห่อทั้งไฟล์ไว้ใน transaction เดียว
         *
         * ไฟล์จริงมีหลักร้อยแถวและมักมีข้อมูลเพี้ยนปนอยู่สองสามแถวเสมอ
         * ถ้าล้มทั้งไฟล์เพราะแถวเดียว ผู้ใช้ต้องไล่แก้แล้วนำเข้าใหม่ทั้งก้อนทุกครั้ง
         */
        await analysis.dataset.commitRow({
          row,
          companyId: record.companyId,
          actorId,
        });

        if (row.action === 'CREATE') created += 1;
        else updated += 1;
      } catch (error) {
        failures.push({
          rowNo: row.rowNo,
          key: row.key,
          message: this.toRowErrorMessage(error),
        });
      }
    }

    const finalRecord = await this.prisma.dataImport.update({
      where: { id: record.id },
      data: {
        status:
          failures.length > 0 && created + updated === 0
            ? DataImportStatus.FAILED
            : DataImportStatus.COMMITTED,
        mapping: analysis.mapping as Prisma.InputJsonValue,
        duplicateMode,
        totalRows: analysis.rows.length,
        createdRows: created,
        updatedRows: updated,
        skippedRows: skipped,
        errorRows: failures.length,
        rowErrors: failures.slice(
          0,
          STORED_ERROR_LIMIT,
        ) as unknown as Prisma.InputJsonValue,
        committedAt: new Date(),
      },
    });

    return {
      import: this.toImportSummaryPayload(finalRecord),
      result: {
        created,
        updated,
        skipped,
        failed: failures.length,
        errors: failures.slice(0, STORED_ERROR_LIMIT),
      },
    };
  }

  /**
   * แปลง error ตอนเขียนแถวให้อ่านรู้เรื่อง
   *
   * ข้อความดิบของ Prisma เป็นภาษาอังกฤษยาวหลายบรรทัดพร้อมชื่อคอลัมน์ในฐานข้อมูล
   * ซึ่งวางในตารางผลนำเข้าแล้วผู้ใช้ตีความไม่ได้ว่าต้องไปแก้อะไรในไฟล์
   */
  private toRowErrorMessage(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return 'ข้อมูลซ้ำกับที่มีอยู่ในระบบแล้ว (รหัสพนักงานหรือค่าที่ต้องไม่ซ้ำ)';
      }

      if (error.code === 'P2003') {
        return 'อ้างถึงข้อมูลอ้างอิงที่ไม่มีอยู่ในระบบ';
      }

      return `บันทึกไม่สำเร็จ (${error.code})`;
    }

    return error instanceof Error && error.message
      ? error.message
      : 'บันทึกแถวนี้ไม่สำเร็จ';
  }

  async list(query: ListDataImportsQueryDto, scope: TenantScope) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.DataImportWhereInput = {
      ...this.scopeWhere(scope),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dataImport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          createdBy: {
            select: { id: true, email: true, displayName: true },
          },
        },
      }),
      this.prisma.dataImport.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async findOne(id: string, scope: TenantScope) {
    const record = await this.prisma.dataImport.findFirst({
      where: { id, ...this.scopeWhere(scope) },
      include: {
        createdBy: { select: { id: true, email: true, displayName: true } },
      },
    });

    if (!record) {
      throw new NotFoundException('ไม่พบงานนำเข้าข้อมูลนี้');
    }

    return record;
  }

  /** ทิ้งงานที่ยังไม่ได้ยืนยัน พร้อมลบไฟล์ต้นฉบับออกจากดิสก์ */
  async cancel(id: string, actor: DataImportActor) {
    const record = await this.findImportRecord(id, actor.scope);

    if (record.status === DataImportStatus.COMMITTED) {
      throw new BadRequestException(
        'งานที่ยืนยันแล้วยกเลิกไม่ได้ เพราะข้อมูลถูกเขียนลงระบบไปแล้ว',
      );
    }

    await this.safelyDeleteFile(getDataImportAbsolutePath(record.storageKey));

    return this.prisma.dataImport.update({
      where: { id: record.id },
      data: { status: DataImportStatus.CANCELLED },
    });
  }

  private async safelyDeleteFile(filePath?: string) {
    if (!filePath) return;

    try {
      await unlink(filePath);
    } catch {
      /* ไฟล์หายไปแล้วก็ถือว่าเรียบร้อย */
    }
  }
}
