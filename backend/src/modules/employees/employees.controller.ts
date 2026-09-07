import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { diskStorage } from 'multer';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreateEmployeeResignationDto } from './dto/create-employee-resignation.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeResignationDto } from './dto/update-employee-resignation.dto';
import { UploadEmployeeDocumentDto } from './dto/upload-employee-document.dto';

import { EmployeesService } from './employees.service';
import {
  createEmployeeDocumentFileName,
  employeeDocumentFileFilter,
  EMPLOYEE_DOCUMENT_MAX_FILE_SIZE,
  ensureEmployeeDocumentStorageDir,
  validateEmployeeDocumentFile,
} from './employee-document-storage.util';

/*
 * ต้องมี permissions ด้วย — service ใช้ตัดสินสองอย่าง
 * 1) ปิดหลักเลขบัตร/เลขบัญชี ถ้าไม่มี EMPLOYEE_SENSITIVE_READ
 * 2) จำกัดทะเบียนเหลือตัวเอง+ลูกทีม ถ้าไม่มี HR_WORKSPACE / PAYROLL_WORKSPACE
 * เดิมชนิดนี้ไม่ประกาศ permissions ไว้ ทั้งที่ runtime ส่งมาครบ
 */
type CurrentUserPayload = Pick<
  AuthenticatedUser,
  'id' | 'scope' | 'permissions'
>;

type RequestWithParams = Request & {
  params: {
    id?: string;
  };
};

@Controller('employees')
@Auth()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('EMPLOYEE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Employee',
    description: 'ดูรายการพนักงาน',
  })
  async findAll(
    @Query() query: ListEmployeesQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.findAll(query, currentUser);
  }

  @Get(':id')
  @RequirePermissions('EMPLOYEE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Employee',
    description: 'ดูข้อมูลพนักงานรายบุคคล',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.findOne(id, currentUser);
  }

  @Post()
  @RequirePermissions('EMPLOYEE_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Employee',
    description: 'เพิ่มข้อมูลพนักงาน',
  })
  async create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.create(dto, currentUser);
  }

  @Patch(':id')
  @RequirePermissions('EMPLOYEE_UPDATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Employee',
    description: 'แก้ไขข้อมูลพนักงาน',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions('EMPLOYEE_DELETE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'Employee',
    description: 'ปิดใช้งานข้อมูลพนักงาน',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.remove(id, currentUser);
  }

  @Get(':id/documents')
  @RequirePermissions('EMPLOYEE_DOCUMENT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeDocument',
    description: 'ดูเอกสารพนักงาน',
  })
  async findDocuments(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.findDocuments(id, currentUser);
  }

  // Metadata เดิม ยังเก็บไว้ก่อนเพื่อไม่ให้ flow เก่าพัง
  @Post(':id/documents')
  @RequirePermissions('EMPLOYEE_DOCUMENT_UPLOAD')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'EmployeeDocument',
    description: 'เพิ่มข้อมูลเอกสารพนักงาน',
  })
  async createDocument(
    @Param('id') id: string,
    @Body() dto: CreateEmployeeDocumentDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.createDocument(id, dto, currentUser);
  }

  @Post(':id/documents/upload')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'employees:documents:upload',
    limit: 30,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: 'อัปโหลดเอกสารบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @RequirePermissions('EMPLOYEE_DOCUMENT_UPLOAD')
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'EmployeeDocument',
    description: 'อัปโหลดไฟล์เอกสารพนักงาน',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: RequestWithParams, _file, callback) => {
          const dir = ensureEmployeeDocumentStorageDir(req.params.id);
          callback(null, dir);
        },
        filename: (_req, file, callback) => {
          callback(null, createEmployeeDocumentFileName(file.originalname));
        },
      }),
      fileFilter: employeeDocumentFileFilter,
      limits: {
        fileSize: EMPLOYEE_DOCUMENT_MAX_FILE_SIZE,
      },
    }),
  )
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEmployeeDocumentDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    validateEmployeeDocumentFile(file);

    return this.employeesService.uploadDocument(id, dto, file, currentUser);
  }

  @Get(':id/documents/:documentId/download')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'employees:documents:download',
    limit: 80,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: 'ดาวน์โหลดเอกสารบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  })
  @RequirePermissions('EMPLOYEE_DOCUMENT_VIEW')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeDocument',
    description: 'เปิดหรือดาวน์โหลดไฟล์เอกสารพนักงาน',
  })
  async downloadDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Res() response: Response,
  ) {
    const file = await this.employeesService.getDocumentFileForDownload(
      id,
      documentId,
      currentUser,
    );

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');

    return response.sendFile(file.filePath);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('EMPLOYEE_DOCUMENT_UPLOAD')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'EmployeeDocument',
    description: 'ลบเอกสารพนักงานแบบ soft delete',
  })
  async removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.removeDocument(id, documentId, currentUser);
  }

  @Get(':id/work-histories')
  @RequirePermissions('EMPLOYEE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeWorkHistory',
    description: 'ดูประวัติการทำงานของพนักงาน',
  })
  async findWorkHistories(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.findWorkHistories(id, currentUser);
  }

  @Get(':id/resignations')
  @RequirePermissions('EMPLOYEE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeResignation',
    description: 'ดูประวัติการลาออกของพนักงาน',
  })
  async findResignations(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.findResignations(id, currentUser);
  }

  @Post(':id/resignations')
  @RequirePermissions('EMPLOYEE_UPDATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EmployeeResignation',
    description: 'บันทึกข้อมูลการลาออกของพนักงาน',
  })
  async createResignation(
    @Param('id') id: string,
    @Body() dto: CreateEmployeeResignationDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.createResignation(id, dto, currentUser);
  }

  @Patch(':id/resignations/:resignationId')
  @RequirePermissions('EMPLOYEE_UPDATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeResignation',
    description: 'แก้ไขสถานะการลาออกของพนักงาน',
  })
  async updateResignation(
    @Param('id') id: string,
    @Param('resignationId') resignationId: string,
    @Body() dto: UpdateEmployeeResignationDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.employeesService.updateResignation(
      id,
      resignationId,
      dto,
      currentUser,
    );
  }
}
