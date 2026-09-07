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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';

import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

import { OnboardingService } from './onboarding.service';
import { CreateOnboardingChecklistDto } from './dto/create-onboarding-checklist.dto';
import { UpdateOnboardingChecklistDto } from './dto/update-onboarding-checklist.dto';
import { ListOnboardingChecklistsQueryDto } from './dto/list-onboarding-checklists-query.dto';
import { CreateOnboardingTaskDto } from './dto/create-onboarding-task.dto';
import { ApplyOnboardingChecklistDto } from './dto/apply-onboarding-checklist.dto';
import { UpdateOnboardingTaskDto } from './dto/update-onboarding-task.dto';
import { ListOnboardingTasksQueryDto } from './dto/list-onboarding-tasks-query.dto';
import { ListOnboardingProgressQueryDto } from './dto/list-onboarding-progress-query.dto';
import { OnboardingTaskActionDto } from './dto/onboarding-task-action.dto';
import { CreateOnboardingDocumentDto } from './dto/create-onboarding-document.dto';
import { ListOnboardingDocumentsQueryDto } from './dto/list-onboarding-documents-query.dto';
import { OnboardingDocumentActionDto } from './dto/onboarding-document-action.dto';
import { CreateProbationRecordDto } from './dto/create-probation-record.dto';
import { ListProbationRecordsQueryDto } from './dto/list-probation-records-query.dto';
import { ProbationActionDto } from './dto/probation-action.dto';
import { SaveProbationEvaluationDto } from './dto/save-probation-evaluation.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  ONBOARDING_FILE_MAX_FILE_SIZE,
  createOnboardingFileName,
  ensureOnboardingFileStorageDir,
  onboardingFileFilter,
  validateOnboardingFile,
} from './onboarding-file-storage.util';

type RequestWithParams = { params: { id: string } };

type CurrentUserPayload = {
  id: string;
  email?: string;
  displayName?: string;
};

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

@Controller('onboarding')
@Auth()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('checklists')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OnboardingChecklist',
    description: 'ดูรายการ Onboarding Checklist',
  })
  async findChecklists(
    @Query() query: ListOnboardingChecklistsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.onboardingService.findChecklists(query, currentUser.scope);
  }

  @Get('checklists/:id')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OnboardingChecklist',
    description: 'ดูรายละเอียด Onboarding Checklist',
  })
  async findChecklist(@Param('id') id: string) {
    return this.onboardingService.findChecklist(id);
  }

  @Post('checklists')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OnboardingChecklist',
    description: 'สร้าง Onboarding Checklist',
  })
  async createChecklist(
    @Body() dto: CreateOnboardingChecklistDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.createChecklist(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('checklists/:id')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OnboardingChecklist',
    description: 'แก้ไข Onboarding Checklist',
  })
  async updateChecklist(
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingChecklistDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.updateChecklist(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Delete('checklists/:id')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'OnboardingChecklist',
    description: 'ลบ Onboarding Checklist',
  })
  async removeChecklist(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.onboardingService.removeChecklist(id, currentUser.scope);
  }

  @Post('checklists/:id/apply')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OnboardingTask',
    description: 'กางเช็กลิสต์เป็นงานต้อนรับ',
  })
  async applyChecklist(
    @Param('id') id: string,
    @Body() dto: ApplyOnboardingChecklistDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.applyChecklist(
      id,
      dto,
      currentUser.scope,
      currentUser.id,
    );
  }

  @Get('progress')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OnboardingProgress',
    description: 'ดูความคืบหน้าพนักงานใหม่รายคน',
  })
  async findProgress(
    @Query() query: ListOnboardingProgressQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.onboardingService.findProgress(query, currentUser.scope);
  }

  @Get('tasks')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OnboardingTask',
    description: 'ดูรายการ Onboarding Task',
  })
  async findTasks(
    @Query() query: ListOnboardingTasksQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.onboardingService.findTasks(query, currentUser.scope);
  }

  @Get('tasks/:id')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OnboardingTask',
    description: 'ดูรายละเอียด Onboarding Task',
  })
  async findTask(@Param('id') id: string) {
    return this.onboardingService.findTask(id);
  }

  @Post('tasks')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OnboardingTask',
    description: 'สร้าง Onboarding Task',
  })
  async createTask(
    @Body() dto: CreateOnboardingTaskDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.createTask(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('tasks/:id')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OnboardingTask',
    description: 'แก้ไข Onboarding Task',
  })
  async updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingTaskDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.updateTask(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('tasks/:id/start')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OnboardingTask',
    description: 'เริ่มดำเนินการ Onboarding Task',
  })
  async startTask(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.onboardingService.startTask(id, currentUser.scope);
  }

  @Post('tasks/:id/complete')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OnboardingTask',
    description: 'ปิดงาน Onboarding Task',
  })
  async completeTask(
    @Param('id') id: string,
    @Body() dto: OnboardingTaskActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.completeTask(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('tasks/:id/cancel')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'OnboardingTask',
    description: 'ยกเลิก Onboarding Task',
  })
  async cancelTask(
    @Param('id') id: string,
    @Body() dto: OnboardingTaskActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.cancelTask(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('documents')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'OnboardingDocument',
    description: 'ดูรายการเอกสาร Onboarding',
  })
  async findDocuments(
    @Query() query: ListOnboardingDocumentsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.onboardingService.findDocuments(query, currentUser.scope);
  }

  @Post('documents')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'OnboardingDocument',
    description: 'สร้างรายการเอกสาร Onboarding',
  })
  async createDocument(
    @Body() dto: CreateOnboardingDocumentDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.createDocument(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Delete('documents/:id')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'OnboardingDocument',
    description: 'ลบรายการเอกสารพนักงานใหม่',
  })
  async removeDocument(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.onboardingService.removeDocument(id, currentUser.scope);
  }

  /**
   * แนบไฟล์ให้รายการเอกสาร — แนบแล้วนับว่าส่งเลย ไม่ต้องกด "บันทึกว่าส่งแล้ว" ซ้ำ
   * ใช้ ONBOARDING_MANAGE เพราะเป็น HR ที่คีย์แทนพนักงาน
   */
  @Post('documents/:id/upload')
  @RequirePermissions('ONBOARDING_MANAGE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          try {
            const request = req as unknown as RequestWithParams;
            callback(null, ensureOnboardingFileStorageDir(request.params.id));
          } catch (error) {
            callback(error as Error, '');
          }
        },
        filename: (_req, file, callback) => {
          callback(null, createOnboardingFileName(file.originalname));
        },
      }),
      fileFilter: onboardingFileFilter,
      limits: { fileSize: ONBOARDING_FILE_MAX_FILE_SIZE },
    }),
  )
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'OnboardingDocument',
    description: 'แนบไฟล์เอกสารพนักงานใหม่',
  })
  async uploadDocumentFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    validateOnboardingFile(file);

    return this.onboardingService.attachDocumentFile(
      id,
      file,
      currentUser.scope,
      currentUser.id,
    );
  }

  @Get('documents/:id/file')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'OnboardingDocument',
    description: 'ดาวน์โหลดไฟล์เอกสารพนักงานใหม่',
  })
  async downloadDocumentFile(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
    @Res() response: Response,
  ) {
    const file = await this.onboardingService.resolveDocumentFile(
      id,
      currentUser.scope,
    );

    response.setHeader('Content-Type', file.mimeType);
    // inline เพื่อให้เปิดดูรูป/PDF ในเบราว์เซอร์ได้เลย ไม่ต้องโหลดลงเครื่องก่อน
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.fileName)}"`,
    );

    response.sendFile(file.path);
  }

  @Post('documents/:id/submit')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OnboardingDocument',
    description: 'ส่งเอกสาร Onboarding',
  })
  async submitDocument(
    @Param('id') id: string,
    @Body() dto: OnboardingDocumentActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.submitDocument(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('documents/:id/verify')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.APPROVE,
    entity: 'OnboardingDocument',
    description: 'ตรวจผ่านเอกสาร Onboarding',
  })
  async verifyDocument(
    @Param('id') id: string,
    @Body() dto: OnboardingDocumentActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.verifyDocument(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('documents/:id/reject')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.REJECT,
    entity: 'OnboardingDocument',
    description: 'ปฏิเสธเอกสาร Onboarding',
  })
  async rejectDocument(
    @Param('id') id: string,
    @Body() dto: OnboardingDocumentActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.rejectDocument(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('documents/:id/waive')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'OnboardingDocument',
    description: 'ยกเว้นเอกสาร Onboarding',
  })
  async waiveDocument(
    @Param('id') id: string,
    @Body() dto: OnboardingDocumentActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.waiveDocument(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('probations')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ProbationRecord',
    description: 'ดูรายการทดลองงาน',
  })
  async findProbationRecords(
    @Query() query: ListProbationRecordsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.onboardingService.findProbationRecords(query, currentUser.scope);
  }

  @Get('probations/:id')
  @RequirePermissions('ONBOARDING_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'ProbationRecord',
    description: 'ดูรายละเอียดทดลองงาน',
  })
  async findProbationRecord(@Param('id') id: string) {
    return this.onboardingService.findProbationRecord(id);
  }

  @Post('probations')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'ProbationRecord',
    description: 'สร้างข้อมูลทดลองงาน',
  })
  async createProbationRecord(
    @Body() dto: CreateProbationRecordDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.createProbationRecord(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('probations/:id/evaluation')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EvaluationResult',
    description: 'บันทึกผลประเมินทดลองงาน',
  })
  async saveProbationEvaluation(
    @Param('id') id: string,
    @Body() dto: SaveProbationEvaluationDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.saveProbationEvaluation(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('probations/:id/review')
  @RequirePermissions('ONBOARDING_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'ProbationRecord',
    description: 'บันทึกผลทดลองงาน',
  })
  async reviewProbationRecord(
    @Param('id') id: string,
    @Body() dto: ProbationActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.onboardingService.reviewProbationRecord(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }
}