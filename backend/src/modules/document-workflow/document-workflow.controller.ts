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
import {
  createDocumentFileName,
  DOCUMENT_FILE_MAX_FILE_SIZE,
  documentFileFilter,
  ensureDocumentFileStorageDir,
  validateDocumentFile,
} from './document-file-storage.util';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { diskStorage } from 'multer';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateDocumentRequestDto } from './dto/create-document-request.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { DocumentRequestActionDto } from './dto/document-request-action.dto';
import { ListDocumentRequestsQueryDto } from './dto/list-document-requests-query.dto';
import { ListDocumentTypesQueryDto } from './dto/list-document-types-query.dto';
import { UpdateDocumentRequestDto } from './dto/update-document-request.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { DocumentWorkflowService } from './document-workflow.service';
import { UploadDocumentFileDto } from './dto/upload-document-file.dto';
import { ComplaintActionDto } from './dto/complaint-action.dto';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { ListComplaintsQueryDto } from './dto/list-complaints-query.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { CreateResignDocumentRequestDto } from './dto/create-resign-document-request.dto';
import { CreateSalaryCertificateRequestDto } from './dto/create-salary-certificate-request.dto';
import { CreateVisaCertificateRequestDto } from './dto/create-visa-certificate-request.dto';
import { CreateWorkCertificateRequestDto } from './dto/create-work-certificate-request.dto';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { ListDocumentTemplatesQueryDto } from './dto/list-document-templates-query.dto';
import { RenderDocumentTemplateQueryDto } from './dto/render-document-template-query.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';
import { GenerateDocumentPdfDto } from './dto/generate-document-pdf.dto';

type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
};
type ScopedUser = Pick<
  import('../../common/interfaces/authenticated-user.interface').AuthenticatedUser,
  'scope'
>;
type RequestWithParams = Request & {
  params: {
    id?: string;
  };
};

@Auth()
@Controller('documents')
export class DocumentWorkflowController {
  constructor(
    private readonly documentWorkflowService: DocumentWorkflowService,
  ) {}

  @Get('health')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentWorkflow',
    description: 'ตรวจสอบสถานะระบบเอกสาร',
  })
  health() {
    return this.documentWorkflowService.health();
  }


  @Get('ess/types')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentType',
    description: 'ESS ดูประเภทเอกสารที่ยื่นคำขอได้',
  })
  findEssDocumentTypes(
    @Query() query: ListDocumentTypesQueryDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.findEssDocumentTypes(
      query,
      currentUser,
    );
  }

  @Get('ess/requests')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentRequest',
    description: 'ESS ดูรายการคำขอเอกสารของตนเอง',
  })
  findEssDocumentRequests(
    @Query() query: ListDocumentRequestsQueryDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.findEssDocumentRequests(
      query,
      currentUser,
    );
  }

  @Get('ess/requests/:id')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentRequest',
    description: 'ESS ดูรายละเอียดคำขอเอกสารของตนเอง',
  })
  findEssDocumentRequest(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.findEssDocumentRequest(
      id,
      currentUser,
    );
  }

  @Post('ess/requests')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentRequest',
    description: 'ESS สร้างคำขอเอกสารของตนเอง',
  })
  createEssDocumentRequest(
    @Body() dto: CreateDocumentRequestDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.createEssDocumentRequest(
      dto,
      currentUser,
    );
  }

  @Patch('ess/requests/:id')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentRequest',
    description: 'ESS แก้ไขคำขอเอกสารของตนเอง',
  })
  updateEssDocumentRequest(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentRequestDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.updateEssDocumentRequest(
      id,
      dto,
      currentUser,
    );
  }

  @Post('ess/requests/:id/submit')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentRequest',
    description: 'ESS ส่งคำขอเอกสารของตนเองเพื่อขออนุมัติ',
  })
  submitEssDocumentRequest(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.submitEssDocumentRequest(
      id,
      currentUser,
    );
  }

  @Post('ess/requests/:id/cancel')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentRequest',
    description: 'ESS ยกเลิกคำขอเอกสารของตนเอง',
  })
  cancelEssDocumentRequest(
    @Param('id') id: string,
    @Body() dto: DocumentRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.cancelEssDocumentRequest(
      id,
      dto,
      currentUser,
    );
  }

  @Delete('ess/requests/:id')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'DocumentRequest',
    description: 'ESS ลบคำขอเอกสารของตนเอง',
  })
  removeEssDocumentRequest(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.removeEssDocumentRequest(
      id,
      currentUser,
    );
  }

  @Post('ess/requests/:id/files/upload')
  @RequirePermissions('DOCUMENT_CREATE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          try {
            const request = req as RequestWithParams;
            const dir = ensureDocumentFileStorageDir(request.params.id);
            callback(null, dir);
          } catch (error) {
            callback(error as Error, '');
          }
        },
        filename: (_req, file, callback) => {
          callback(null, createDocumentFileName(file.originalname));
        },
      }),
      fileFilter: documentFileFilter,
      limits: {
        fileSize: DOCUMENT_FILE_MAX_FILE_SIZE,
      },
    }),
  )
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'DocumentFile',
    description: 'ESS แนบเอกสารประกอบคำขอของตนเอง',
  })
  uploadEssDocumentFile(
    @Param('id') id: string,
    @Body() dto: UploadDocumentFileDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    validateDocumentFile(file);

    return this.documentWorkflowService.uploadEssDocumentFile(
      id,
      dto,
      file,
      currentUser,
    );
  }

  @Delete('ess/requests/:id/files/:fileId')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'DocumentFile',
    description: 'ESS ลบไฟล์แนบของคำขอตนเอง',
  })
  removeEssDocumentFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.removeEssDocumentFile(
      id,
      fileId,
      currentUser,
    );
  }

  @Get('ess/requests/:id/files/:fileId/download')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'DocumentFile',
    description: 'ESS เปิดหรือดาวน์โหลดไฟล์เอกสารของตนเอง',
  })
  async downloadEssDocumentFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() currentUser: CurrentUserLike,
    @Res() response: Response,
  ) {
    const file = await this.documentWorkflowService.getEssDocumentFileForDownload(
      id,
      fileId,
      currentUser,
    );

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );

    return response.sendFile(file.filePath);
  }

  /* ---------- ESS: เรื่องร้องเรียนของตนเอง ---------- */

  @Get('ess/complaints')
  @RequirePermissions('COMPLAINT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Complaint',
    description: 'ESS ดูเรื่องร้องเรียนของตนเอง',
  })
  findEssComplaints(
    @Query() query: ListComplaintsQueryDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.findEssComplaints(query, currentUser);
  }

  @Get('ess/complaints/:id')
  @RequirePermissions('COMPLAINT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Complaint',
    description: 'ESS ดูรายละเอียดเรื่องร้องเรียนของตนเอง',
  })
  findEssComplaint(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.findEssComplaint(id, currentUser);
  }

  @Post('ess/complaints')
  @RequirePermissions('COMPLAINT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Complaint',
    description: 'ESS ยื่นเรื่องร้องเรียนของตนเอง',
  })
  createEssComplaint(
    @Body() dto: CreateComplaintDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.createEssComplaint(dto, currentUser);
  }

  @Post('ess/complaints/:id/cancel')
  @RequirePermissions('COMPLAINT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Complaint',
    description: 'ESS ถอนเรื่องร้องเรียนของตนเอง',
  })
  cancelEssComplaint(
    @Param('id') id: string,
    @Body() dto: ComplaintActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.documentWorkflowService.cancelEssComplaint(
      id,
      dto,
      currentUser,
    );
  }

  @Get('types')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentType',
    description: 'ดูรายการประเภทเอกสาร',
  })
  findDocumentTypes(
    @Query() query: ListDocumentTypesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.documentWorkflowService.findDocumentTypes(query, currentUser.scope);
  }

  @Get('types/:id')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentType',
    description: 'ดูรายละเอียดประเภทเอกสาร',
  })
  findDocumentType(@Param('id') id: string) {
    return this.documentWorkflowService.findDocumentType(id);
  }

  @Post('types')
  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentType',
    description: 'สร้างประเภทเอกสาร',
  })
  createDocumentType(
    @Body() dto: CreateDocumentTypeDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.createDocumentType(dto, user.scope);
  }

  @Patch('types/:id')
  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentType',
    description: 'แก้ไขประเภทเอกสาร',
  })
  updateDocumentType(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentTypeDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.updateDocumentType(id, dto, user.scope);
  }

  @Delete('types/:id')
  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'DocumentType',
    description: 'ปิดใช้งานประเภทเอกสาร',
  })
  removeDocumentType(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.documentWorkflowService.removeDocumentType(id, user.scope);
  }

  @Get('requests')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentRequest',
    description: 'ดูรายการคำขอเอกสาร',
  })
  findDocumentRequests(
    @Query() query: ListDocumentRequestsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.documentWorkflowService.findDocumentRequests(query, currentUser.scope);
  }

  @Get('requests/:id')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentRequest',
    description: 'ดูรายละเอียดคำขอเอกสาร',
  })
  findDocumentRequest(
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.findDocumentRequest(id, user.scope);
  }

  @Post('requests')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentRequest',
    description: 'สร้างคำขอเอกสาร',
  })
  createDocumentRequest(
    @Body() dto: CreateDocumentRequestDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.createDocumentRequest(
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Patch('requests/:id')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentRequest',
    description: 'แก้ไขคำขอเอกสาร',
  })
  updateDocumentRequest(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentRequestDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.updateDocumentRequest(
      id,
      dto,
      user.scope,
    );
  }

  @Post('requests/:id/submit')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentRequest',
    description: 'ส่งคำขอเอกสารเพื่อขออนุมัติ',
  })
  submitDocumentRequest(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.submitDocumentRequest(
      id,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('requests/:id/approve')
  @RequirePermissions('DOCUMENT_APPROVE')
  @Audit({
    action: AuditAction.APPROVE,
    entity: 'DocumentRequest',
    description: 'อนุมัติคำขอเอกสาร',
  })
  approveDocumentRequest(
    @Param('id') id: string,
    @Body() dto: DocumentRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.approveDocumentRequest(
      id,
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('requests/:id/reject')
  @RequirePermissions('DOCUMENT_APPROVE')
  @Audit({
    action: AuditAction.REJECT,
    entity: 'DocumentRequest',
    description: 'ไม่อนุมัติคำขอเอกสาร',
  })
  rejectDocumentRequest(
    @Param('id') id: string,
    @Body() dto: DocumentRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.rejectDocumentRequest(
      id,
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('requests/:id/cancel')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentRequest',
    description: 'ยกเลิกคำขอเอกสาร',
  })
  cancelDocumentRequest(
    @Param('id') id: string,
    @Body() dto: DocumentRequestActionDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.cancelDocumentRequest(
      id,
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Delete('requests/:id')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'DocumentRequest',
    description: 'ลบคำขอเอกสาร',
  })
  removeDocumentRequest(
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.removeDocumentRequest(id, user.scope);
  }

  @Post('requests/:id/files/upload')
  @RequirePermissions('DOCUMENT_CREATE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          try {
            const request = req as RequestWithParams;
            const dir = ensureDocumentFileStorageDir(request.params.id);
            callback(null, dir);
          } catch (error) {
            callback(error as Error, '');
          }
        },
        filename: (_req, file, callback) => {
          callback(null, createDocumentFileName(file.originalname));
        },
      }),
      fileFilter: documentFileFilter,
      limits: {
        fileSize: DOCUMENT_FILE_MAX_FILE_SIZE,
      },
    }),
  )
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'DocumentFile',
    description: 'อัปโหลดไฟล์แนบเอกสาร',
  })
  uploadDocumentFile(
    @Param('id') id: string,
    @Body() dto: UploadDocumentFileDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    validateDocumentFile(file);

    return this.documentWorkflowService.uploadDocumentFile(
      id,
      dto,
      file,
      currentUser,
      currentUser.scope,
    );
  }

  // หนังสือฉบับลงนาม = เอกสารทางการที่ส่งมอบจริง จึงใช้สิทธิ์เดียวกับการออกเอกสาร
  @Post('requests/:id/files/signed')
  @RequirePermissions('DOCUMENT_EXPORT')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          try {
            const request = req as RequestWithParams;
            const dir = ensureDocumentFileStorageDir(request.params.id);
            callback(null, dir);
          } catch (error) {
            callback(error as Error, '');
          }
        },
        filename: (_req, file, callback) => {
          callback(null, createDocumentFileName(file.originalname));
        },
      }),
      fileFilter: documentFileFilter,
      limits: {
        fileSize: DOCUMENT_FILE_MAX_FILE_SIZE,
      },
    }),
  )
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'DocumentFile',
    description: 'อัปโหลดหนังสือฉบับลงนามและประทับตรา',
  })
  uploadSignedDocumentFile(
    @Param('id') id: string,
    @Body() dto: UploadDocumentFileDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    validateDocumentFile(file);

    return this.documentWorkflowService.uploadSignedDocumentFile(
      id,
      dto,
      file,
      currentUser,
      currentUser.scope,
    );
  }

  @Get('requests/:id/files/:fileId/download')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.DOWNLOAD,
    entity: 'DocumentFile',
    description: 'เปิดหรือดาวน์โหลดไฟล์เอกสาร',
  })
  async downloadDocumentFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() response: Response,
    @CurrentUser() user: ScopedUser,
  ) {
    const file = await this.documentWorkflowService.getDocumentFileForDownload(
      id,
      fileId,
      user.scope,
    );

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );

    return response.sendFile(file.filePath);
  }

  @Delete('requests/:id/files/:fileId')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'DocumentFile',
    description: 'ลบไฟล์แนบเอกสาร',
  })
  removeDocumentFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.removeDocumentFile(
      id,
      fileId,
      user.scope,
    );
  }

  @Get('complaints')
  @RequirePermissions('COMPLAINT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Complaint',
    description: 'ดูรายการเรื่องร้องเรียน',
  })
  findComplaints(
    @Query() query: ListComplaintsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.documentWorkflowService.findComplaints(query, currentUser.scope);
  }

  @Get('complaints/:id')
  @RequirePermissions('COMPLAINT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Complaint',
    description: 'ดูรายละเอียดเรื่องร้องเรียน',
  })
  findComplaint(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.documentWorkflowService.findComplaint(id, user.scope);
  }

  // HR บันทึกเรื่องแทนพนักงาน (เดินมาแจ้งที่โต๊ะ / โทรแจ้ง)
  // ต้องใช้ COMPLAINT_MANAGE เพราะ endpoint นี้ระบุ employeeId ของคนอื่นได้
  // พนักงานยื่นเรื่องของตัวเองผ่าน POST ess/complaints เท่านั้น
  @Post('complaints')
  @RequirePermissions('COMPLAINT_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Complaint',
    description: 'สร้างเรื่องร้องเรียนหรือข้อเสนอแนะ',
  })
  createComplaint(
    @Body() dto: CreateComplaintDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.createComplaint(
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Patch('complaints/:id')
  @RequirePermissions('COMPLAINT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Complaint',
    description: 'แก้ไขเรื่องร้องเรียน',
  })
  updateComplaint(
    @Param('id') id: string,
    @Body() dto: UpdateComplaintDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.updateComplaint(id, dto, user.scope);
  }

  @Post('complaints/:id/process')
  @RequirePermissions('COMPLAINT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Complaint',
    description: 'รับเรื่องร้องเรียนเข้าสู่กระบวนการดำเนินการ',
  })
  processComplaint(
    @Param('id') id: string,
    @Body() dto: ComplaintActionDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.processComplaint(
      id,
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('complaints/:id/resolve')
  @RequirePermissions('COMPLAINT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Complaint',
    description: 'บันทึกผลการดำเนินการเรื่องร้องเรียน',
  })
  resolveComplaint(
    @Param('id') id: string,
    @Body() dto: ComplaintActionDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.resolveComplaint(
      id,
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('complaints/:id/close')
  @RequirePermissions('COMPLAINT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Complaint',
    description: 'ปิดเรื่องร้องเรียน',
  })
  closeComplaint(
    @Param('id') id: string,
    @Body() dto: ComplaintActionDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.closeComplaint(
      id,
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('complaints/:id/cancel')
  @RequirePermissions('COMPLAINT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Complaint',
    description: 'ยกเลิกเรื่องร้องเรียน',
  })
  cancelComplaint(
    @Param('id') id: string,
    @Body() dto: ComplaintActionDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.cancelComplaint(
      id,
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Delete('complaints/:id')
  @RequirePermissions('COMPLAINT_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'Complaint',
    description: 'ลบเรื่องร้องเรียนแบบ Soft Delete',
  })
  removeComplaint(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.documentWorkflowService.removeComplaint(id, user.scope);
  }
  @Get('presets')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentPreset',
    description: 'ดูรายการ Preset เอกสาร',
  })
  findDocumentPresets() {
    return this.documentWorkflowService.findDocumentPresets();
  }

  @Post('presets/work-certificate')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentRequest',
    description: 'ยื่นคำขอหนังสือรับรองการทำงาน',
  })
  createWorkCertificateRequest(
    @Body() dto: CreateWorkCertificateRequestDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.createWorkCertificateRequest(
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('presets/salary-certificate')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentRequest',
    description: 'ยื่นคำขอหนังสือรับรองเงินเดือน',
  })
  createSalaryCertificateRequest(
    @Body() dto: CreateSalaryCertificateRequestDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.createSalaryCertificateRequest(
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('presets/visa-certificate')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentRequest',
    description: 'ยื่นคำขอหนังสือรับรองเพื่อประกอบการขอวีซ่า',
  })
  createVisaCertificateRequest(
    @Body() dto: CreateVisaCertificateRequestDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.createVisaCertificateRequest(
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Post('presets/resign-document')
  @RequirePermissions('DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentRequest',
    description: 'ยื่นเอกสารลาออก',
  })
  createResignDocumentRequest(
    @Body() dto: CreateResignDocumentRequestDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.createResignDocumentRequest(
      dto,
      currentUser,
      currentUser.scope,
    );
  }
  @Get('templates')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentTemplate',
    description: 'ดูรายการ Template เอกสาร',
  })
  findDocumentTemplates(
    @Query() query: ListDocumentTemplatesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.documentWorkflowService.findDocumentTemplates(query, currentUser.scope);
  }

  @Get('templates/:id')
  @RequirePermissions('DOCUMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DocumentTemplate',
    description: 'ดูรายละเอียด Template เอกสาร',
  })
  findDocumentTemplate(@Param('id') id: string) {
    return this.documentWorkflowService.findDocumentTemplate(id);
  }

  @Post('templates')
  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentTemplate',
    description: 'สร้าง Template เอกสาร',
  })
  createDocumentTemplate(
    @Body() dto: CreateDocumentTemplateDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.createDocumentTemplate(
      dto,
      currentUser,
      currentUser.scope,
    );
  }

  @Patch('templates/:id')
  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentTemplate',
    description: 'แก้ไข Template เอกสาร',
  })
  updateDocumentTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentTemplateDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.updateDocumentTemplate(
      id,
      dto,
      user.scope,
    );
  }

  @Delete('templates/:id')
  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'DocumentTemplate',
    description: 'ปิดใช้งาน Template เอกสาร',
  })
  removeDocumentTemplate(
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.removeDocumentTemplate(id, user.scope);
  }

  @Get('requests/:id/render')
  @RequirePermissions('DOCUMENT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'DocumentTemplate',
    description: 'Render เอกสารจาก Template เป็น HTML',
  })
  renderDocumentRequest(
    @Param('id') id: string,
    @Query() query: RenderDocumentTemplateQueryDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.documentWorkflowService.renderDocumentRequest(
      id,
      query,
      user.scope,
    );
  }
  @Post('requests/:id/generate-pdf')
  @RequirePermissions('DOCUMENT_EXPORT')
  @Audit({
    action: AuditAction.EXPORT,
    entity: 'DocumentFile',
    description: 'สร้าง PDF เอกสารจาก Template',
  })
  generateDocumentPdf(
    @Param('id') id: string,
    @Body() dto: GenerateDocumentPdfDto,
    @CurrentUser() currentUser: CurrentUserLike & ScopedUser,
  ) {
    return this.documentWorkflowService.generateDocumentPdf(
      id,
      dto,
      currentUser,
      currentUser.scope,
    );
  }
}
