import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { DocumentWorkflowService } from '../../document-workflow/document-workflow.service';
import {
  MobileCreateDocumentRequestDto,
  MobileDocumentActionDto,
  MobileDocumentListQueryDto,
  MobileDocumentTypeListQueryDto,
  MobileUpdateDocumentRequestDto,
  MobileUploadDocumentFileDto,
} from '../dto/mobile-document.dto';
import {
  toMobileDocumentDetail,
  toMobileDocumentListItem,
  toMobileDocumentType,
} from '../mappers/mobile-document.mapper';

@Injectable()
export class MobileDocumentsOrchestrator {
  constructor(private readonly documents: DocumentWorkflowService) {}

  async catalog(user: AuthenticatedUser, query: MobileDocumentTypeListQueryDto) {
    const result = await this.documents.findMobileEssDocumentTypes(
      { ...query, page: 1, pageSize: 100 },
      user,
    );

    return { items: result.items.map(toMobileDocumentType) };
  }

  async list(user: AuthenticatedUser, query: MobileDocumentListQueryDto) {
    const result = await this.documents.findEssDocumentRequests(query, user);

    return {
      items: result.items.map(toMobileDocumentListItem),
      meta: {
        ...result.meta,
        hasMore: result.meta.page < result.meta.totalPages,
      },
      summary: result.summary,
    };
  }

  async detail(user: AuthenticatedUser, id: string) {
    return toMobileDocumentDetail(
      await this.documents.findEssDocumentRequest(id, user),
    );
  }

  async create(user: AuthenticatedUser, dto: MobileCreateDocumentRequestDto) {
    const created = await this.documents.createMobileEssDocumentRequest(dto, user);
    return toMobileDocumentDetail(created);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: MobileUpdateDocumentRequestDto,
  ) {
    const updated = await this.documents.updateMobileEssDocumentRequest(
      id,
      dto,
      user,
    );
    return toMobileDocumentDetail(updated);
  }

  async submit(user: AuthenticatedUser, id: string) {
    return toMobileDocumentDetail(
      await this.documents.submitEssDocumentRequest(id, user),
    );
  }

  async cancel(user: AuthenticatedUser, id: string, dto: MobileDocumentActionDto) {
    return toMobileDocumentDetail(
      await this.documents.cancelEssDocumentRequest(id, dto, user),
    );
  }

  remove(user: AuthenticatedUser, id: string) {
    return this.documents.removeMobileEssDocumentRequest(id, user);
  }

  upload(
    user: AuthenticatedUser,
    id: string,
    dto: MobileUploadDocumentFileDto,
    file: Express.Multer.File,
  ) {
    return this.documents.uploadEssDocumentFile(id, dto, file, user);
  }

  removeFile(user: AuthenticatedUser, id: string, fileId: string) {
    return this.documents.removeEssDocumentFile(id, fileId, user);
  }

  downloadFile(user: AuthenticatedUser, id: string, fileId: string) {
    return this.documents.getEssDocumentFileForDownload(id, fileId, user);
  }
}
