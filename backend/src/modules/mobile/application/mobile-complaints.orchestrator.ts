import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { DocumentWorkflowService } from '../../document-workflow/document-workflow.service';
import {
  MobileComplaintActionDto,
  MobileComplaintListQueryDto,
  MobileCreateComplaintDto,
} from '../dto/mobile-complaint.dto';
import {
  toMobileComplaintDetail,
  toMobileComplaintListItem,
} from '../mappers/mobile-complaint.mapper';

@Injectable()
export class MobileComplaintsOrchestrator {
  constructor(private readonly documents: DocumentWorkflowService) {}

  async list(user: AuthenticatedUser, query: MobileComplaintListQueryDto) {
    const result = await this.documents.findEssComplaints(query, user);

    return {
      items: result.items.map(toMobileComplaintListItem),
      meta: {
        ...result.meta,
        hasMore: result.meta.page < result.meta.totalPages,
      },
    };
  }

  async detail(user: AuthenticatedUser, id: string) {
    return toMobileComplaintDetail(
      await this.documents.findEssComplaint(id, user),
    );
  }

  async create(user: AuthenticatedUser, dto: MobileCreateComplaintDto) {
    return toMobileComplaintDetail(
      await this.documents.createEssComplaint(dto, user),
    );
  }

  async cancel(
    user: AuthenticatedUser,
    id: string,
    dto: MobileComplaintActionDto,
  ) {
    return toMobileComplaintDetail(
      await this.documents.cancelEssComplaint(id, dto, user),
    );
  }
}
