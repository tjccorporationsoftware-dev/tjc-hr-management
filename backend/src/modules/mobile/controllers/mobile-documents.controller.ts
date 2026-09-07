import { unlink } from 'node:fs/promises';
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
import type { Request, Response } from 'express';
import { diskStorage } from 'multer';

import { Audit } from '../../../common/decorators/audit.decorator';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../generated/prisma/client';
import {
  createDocumentFileName,
  DOCUMENT_FILE_MAX_FILE_SIZE,
  documentFileFilter,
  ensureDocumentFileStorageDir,
  validateDocumentFile,
} from '../../document-workflow/document-file-storage.util';
import { MobileDocumentsOrchestrator } from '../application/mobile-documents.orchestrator';
import { MobileIdempotencyService } from '../application/mobile-idempotency.service';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import { IdempotencyKey } from '../decorators/mobile-client.decorator';
import {
  MobileCreateDocumentRequestDto,
  MobileDocumentActionDto,
  MobileDocumentListQueryDto,
  MobileDocumentTypeListQueryDto,
  MobileUpdateDocumentRequestDto,
  MobileUploadDocumentFileDto,
} from '../dto/mobile-document.dto';
import {
  MOBILE_API_PREFIX,
  MOBILE_IDEMPOTENCY_SCOPES,
} from '../mobile.constants';

type RequestWithParams = Request & { params: { id?: string } };

@Controller(`${MOBILE_API_PREFIX}/documents`)
export class MobileDocumentsController {
  constructor(
    private readonly documents: MobileDocumentsOrchestrator,
    private readonly idempotency: MobileIdempotencyService,
  ) {}

  @Get('catalog')
  @Auth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.VIEW, entity: 'DocumentType', description: 'View mobile document request catalog' })
  catalog(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileDocumentTypeListQueryDto,
  ) {
    return this.documents.catalog(user, query);
  }

  @Get()
  @Auth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.VIEW, entity: 'DocumentRequest', description: 'View my mobile document requests' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileDocumentListQueryDto,
  ) {
    return this.documents.list(user, query);
  }

  @Post()
  @MobileAuth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DocumentRequest',
    description: 'Create my document request from mobile',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileCreateDocumentRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'create', dto }, () =>
      this.documents.create(user, dto),
    201);
  }

  @Get(':id')
  @Auth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.VIEW, entity: 'DocumentRequest', description: 'View my mobile document request detail' })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documents.detail(user, id);
  }

  @Patch(':id')
  @MobileAuth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'DocumentRequest',
    description: 'Update my document request from mobile',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MobileUpdateDocumentRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'update', dto, id }, () =>
      this.documents.update(user, id, dto),
    );
  }

  @Post(':id/submit')
  @MobileAuth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.UPDATE, entity: 'DocumentRequest', description: 'Submit my mobile document request' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'submit', id }, () =>
      this.documents.submit(user, id),
    );
  }

  @Post(':id/cancel')
  @MobileAuth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.UPDATE, entity: 'DocumentRequest', description: 'Cancel my mobile document request' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MobileDocumentActionDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'cancel', dto, id }, () =>
      this.documents.cancel(user, id, dto),
    );
  }

  @Delete(':id')
  @MobileAuth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.DELETE, entity: 'DocumentRequest', description: 'Delete my mobile document request draft' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'delete', id }, () =>
      this.documents.remove(user, id),
    );
  }

  @Post(':id/files')
  @MobileAuth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.UPLOAD, entity: 'DocumentFile', description: 'Upload my mobile document attachment' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (request, _file, callback) => {
          try {
            callback(
              null,
              ensureDocumentFileStorageDir(
                (request as RequestWithParams).params.id ?? 'unknown',
              ),
            );
          } catch (error) {
            callback(error as Error, '');
          }
        },
        filename: (_request, file, callback) =>
          callback(null, createDocumentFileName(file.originalname)),
      }),
      fileFilter: documentFileFilter,
      limits: { fileSize: DOCUMENT_FILE_MAX_FILE_SIZE },
    }),
  )
  uploadFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MobileUploadDocumentFileDto,
    @UploadedFile() file: Express.Multer.File,
    @IdempotencyKey() key: string | null,
  ) {
    validateDocumentFile(file);
    return this.idempotency.executeOptional({
      key,
      requestPayload: {
        action: 'upload-file',
        dto,
        id,
        file: {
          mimetype: file.mimetype,
          originalname: file.originalname,
          size: file.size,
        },
      },
      responseStatus: 201,
      scope: MOBILE_IDEMPOTENCY_SCOPES.documentMutation,
      userId: user.id,
      onReusedKey: () => this.cleanupUploadedFile(file),
      handler: () => this.documents.upload(user, id, dto, file),
    });
  }

  @Delete(':id/files/:fileId')
  @MobileAuth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.DELETE, entity: 'DocumentFile', description: 'Delete my mobile document attachment' })
  removeFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'delete-file', fileId, id }, () =>
      this.documents.removeFile(user, id, fileId),
    );
  }

  @Get(':id/files/:fileId/download')
  @Auth('ESS_ACCESS', 'DOCUMENT_CREATE')
  @Audit({ action: AuditAction.DOWNLOAD, entity: 'DocumentFile', description: 'Download my mobile document file' })
  async downloadFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() response: Response,
  ) {
    const file = await this.documents.downloadFile(user, id, fileId);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');

    return response.sendFile(file.filePath);
  }

  private mutate<T>(
    user: AuthenticatedUser,
    key: string | null,
    requestPayload: unknown,
    handler: () => Promise<T>,
    responseStatus = 200,
  ) {
    return this.idempotency.executeOptional({
      handler,
      key,
      requestPayload,
      responseStatus,
      scope: MOBILE_IDEMPOTENCY_SCOPES.documentMutation,
      userId: user.id,
    });
  }

  private async cleanupUploadedFile(file: Express.Multer.File) {
    if (!file?.path) return;
    await unlink(file.path).catch(() => undefined);
  }

}
