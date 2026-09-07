import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { diskStorage } from 'multer';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

import { DataImportService } from './data-import.service';
import { CommitDataImportDto } from './dto/commit-data-import.dto';
import { CreateDataImportDto } from './dto/create-data-import.dto';
import { ListDataImportsQueryDto } from './dto/list-data-imports-query.dto';
import { DataImportDuplicateMode } from '../../generated/prisma/client';
import {
  createDataImportFileName,
  dataImportFileFilter,
  ensureDataImportStorageDir,
  validateDataImportFile,
  DATA_IMPORT_MAX_FILE_SIZE,
} from './utils/data-import-storage.util';

/*
 * multer สร้างโฟลเดอร์ปลายทางก่อน handler จะทำงาน และตอนนั้นยังไม่มี id ของงานนำเข้า
 * (id เกิดตอนเขียนลงฐานข้อมูล) จึงสุ่มคีย์ไว้บน request แล้วส่งต่อให้ service ใช้เป็นโฟลเดอร์
 */
type RequestWithImportKey = Request & { dataImportKey?: string };

@Auth()
@Controller('data-import')
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @Get('datasets')
  @RequirePermissions('DATA_IMPORT')
  listDatasets() {
    return this.dataImportService.listDatasets();
  }

  @Get()
  @RequirePermissions('DATA_IMPORT')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DataImport',
    description: 'ดูประวัติการนำเข้าข้อมูล',
  })
  list(
    @Query() query: ListDataImportsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.dataImportService.list(query, currentUser.scope);
  }

  @Post('uploads')
  @RequirePermissions('DATA_IMPORT')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'DataImport',
    description: 'อัปโหลดไฟล์เพื่อนำเข้าข้อมูล',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: RequestWithImportKey, _file, callback) => {
          const importKey = req.dataImportKey ?? randomUUID();
          req.dataImportKey = importKey;

          callback(null, ensureDataImportStorageDir(importKey));
        },
        filename: (_req, file, callback) => {
          callback(null, createDataImportFileName(file.originalname));
        },
      }),
      fileFilter: dataImportFileFilter,
      limits: { fileSize: DATA_IMPORT_MAX_FILE_SIZE },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDataImportDto,
    @Req() request: RequestWithImportKey,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    validateDataImportFile(file);

    return this.dataImportService.analyzeUpload({
      file,
      type: dto.type,
      duplicateMode: dto.duplicateMode ?? DataImportDuplicateMode.UPDATE,
      importKey: request.dataImportKey ?? '',
      actor: currentUser,
    });
  }

  @Get(':id')
  @RequirePermissions('DATA_IMPORT')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DataImport',
    description: 'ดูรายละเอียดงานนำเข้าข้อมูล',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.dataImportService.findOne(id, currentUser.scope);
  }

  @Post(':id/preview')
  @RequirePermissions('DATA_IMPORT')
  preview(
    @Param('id') id: string,
    @Body() dto: CommitDataImportDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.dataImportService.preview(id, dto, currentUser);
  }

  @Post(':id/commit')
  @RequirePermissions('DATA_IMPORT')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DataImport',
    description: 'ยืนยันนำเข้าข้อมูลจากไฟล์',
  })
  commit(
    @Param('id') id: string,
    @Body() dto: CommitDataImportDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.dataImportService.commit(id, dto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions('DATA_IMPORT')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'DataImport',
    description: 'ยกเลิกงานนำเข้าข้อมูล',
  })
  cancel(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.dataImportService.cancel(id, currentUser);
  }
}
