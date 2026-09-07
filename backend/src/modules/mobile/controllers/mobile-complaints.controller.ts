import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { Audit } from '../../../common/decorators/audit.decorator';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../generated/prisma/client';
import { MobileComplaintsOrchestrator } from '../application/mobile-complaints.orchestrator';
import { MobileIdempotencyService } from '../application/mobile-idempotency.service';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import { IdempotencyKey } from '../decorators/mobile-client.decorator';
import {
  MobileComplaintActionDto,
  MobileComplaintListQueryDto,
  MobileCreateComplaintDto,
} from '../dto/mobile-complaint.dto';
import {
  MOBILE_API_PREFIX,
  MOBILE_IDEMPOTENCY_SCOPES,
} from '../mobile.constants';

@Controller(`${MOBILE_API_PREFIX}/complaints`)
export class MobileComplaintsController {
  constructor(
    private readonly complaints: MobileComplaintsOrchestrator,
    private readonly idempotency: MobileIdempotencyService,
  ) {}

  @Get()
  @Auth('ESS_ACCESS', 'COMPLAINT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Complaint',
    description: 'View my mobile complaints',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileComplaintListQueryDto,
  ) {
    return this.complaints.list(user, query);
  }

  @Post()
  @MobileAuth('ESS_ACCESS', 'COMPLAINT_CREATE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Complaint',
    description: 'Create my complaint from mobile',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileCreateComplaintDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'create', dto }, () =>
      this.complaints.create(user, dto),
    201);
  }

  @Get(':id')
  @Auth('ESS_ACCESS', 'COMPLAINT_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Complaint',
    description: 'View my mobile complaint detail',
  })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.complaints.detail(user, id);
  }

  @Post(':id/cancel')
  @MobileAuth('ESS_ACCESS', 'COMPLAINT_CREATE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Complaint',
    description: 'Cancel my complaint from mobile',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MobileComplaintActionDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'cancel', dto, id }, () =>
      this.complaints.cancel(user, id, dto),
    );
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
      scope: MOBILE_IDEMPOTENCY_SCOPES.complaintMutation,
      userId: user.id,
    });
  }

}
