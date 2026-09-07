import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateLeaveRequestDto } from '../../leaves/dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from '../../leaves/dto/update-leave-request.dto';
import { CreateOffsiteWorkRequestDto } from '../../offsite-work/dto/create-offsite-work-request.dto';
import { UpdateOffsiteWorkRequestDto } from '../../offsite-work/dto/update-offsite-work-request.dto';
import { CreateOvertimeRequestDto } from '../../overtime/dto/create-overtime-request.dto';
import { OvertimeDayTypeQueryDto } from '../../overtime/dto/overtime-day-type-query.dto';
import { UpdateOvertimeRequestDto } from '../../overtime/dto/update-overtime-request.dto';
import { CreateTimeAdjustRequestDto } from '../../time-adjust/dto/create-time-adjust-request.dto';
import { UpdateTimeAdjustRequestDto } from '../../time-adjust/dto/update-time-adjust-request.dto';
import { MobileIdempotencyService } from '../application/mobile-idempotency.service';
import { MobileRequestsOrchestrator } from '../application/mobile-requests.orchestrator';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import { IdempotencyKey } from '../decorators/mobile-client.decorator';
import {
  MobileCancelRequestDto,
  MobileRequestListQueryDto,
} from '../dto/mobile-request.dto';
import {
  MOBILE_REQUEST_TYPES,
  type MobileRequestType,
} from '../mappers/mobile-request.mapper';
import {
  MOBILE_API_PREFIX,
  MOBILE_IDEMPOTENCY_SCOPES,
} from '../mobile.constants';

/** slug ใน URL อ่านง่ายกว่า enum ตัวใหญ่ และไม่ผูกชื่อ URL กับชื่อ enum ภายใน */
const TYPE_BY_SLUG: Record<string, MobileRequestType> = {
  leave: 'LEAVE',
  offsite: 'OFFSITE',
  overtime: 'OVERTIME',
  'time-adjust': 'TIME_ADJUST',
};

function resolveType(slug: string): MobileRequestType {
  const type = TYPE_BY_SLUG[slug];

  if (!type) {
    throw new BadRequestException(
      `ประเภทคำขอไม่ถูกต้อง รองรับเฉพาะ ${Object.keys(TYPE_BY_SLUG).join(', ')}`,
    );
  }

  return type;
}

/**
 * ใบคำขอสำหรับแอป
 *
 * แต่ละประเภทมี route mutation ของตัวเองโดยตั้งใจ เพื่อให้ Nest ตรวจ payload
 * ด้วย DTO ตัวจริงของ module นั้น และ permission ตรงกับ Web self-service
 * ส่วน read ใช้ route รวมเพราะไม่มีผลต่อ business workflow
 */
@Controller(`${MOBILE_API_PREFIX}/requests`)
export class MobileRequestsController {
  constructor(
    private readonly requests: MobileRequestsOrchestrator,
    private readonly idempotency: MobileIdempotencyService,
  ) {}

  @Get()
  @Auth('ESS_ACCESS')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileRequestListQueryDto,
  ) {
    return this.requests.list(user, query);
  }

  /* ต้องมาก่อน :type/:id ไม่งั้น "leave" จะถูกอ่านเป็น type แล้ว "catalog" เป็น id */
  @Get('leave/catalog')
  @Auth('ESS_ACCESS', 'LEAVE_CREATE')
  async leaveCatalog(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year') year?: string,
  ) {
    const parsed = year ? Number(year) : undefined;

    return this.requests.getLeaveCatalog(
      user,
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  /* ต้องมาก่อน :type/:id เช่นเดียวกับ leave/catalog */
  @Get('overtime/day-type')
  @Auth('ESS_ACCESS', 'OT_CREATE')
  async overtimeDayType(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OvertimeDayTypeQueryDto,
  ) {
    return this.requests.getOvertimeDayType(user, query.workDate);
  }

  /* ------------------------------------------------------------- สร้าง */

  @Post('leave')
  @MobileAuth('ESS_ACCESS', 'LEAVE_CREATE')
  async createLeave(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeaveRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'create', type: 'LEAVE', dto }, () =>
      this.requests.create('LEAVE', { ...dto }, user),
    201);
  }

  @Post('overtime')
  @MobileAuth('ESS_ACCESS', 'OT_CREATE')
  async createOvertime(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOvertimeRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'create', type: 'OVERTIME', dto },
      () => this.requests.create('OVERTIME', { ...dto }, user),
      201,
    );
  }

  @Post('time-adjust')
  @MobileAuth('ESS_ACCESS', 'TIME_ADJUST_CREATE')
  async createTimeAdjust(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTimeAdjustRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'create', type: 'TIME_ADJUST', dto },
      () => this.requests.create('TIME_ADJUST', { ...dto }, user),
      201,
    );
  }

  @Post('offsite')
  @MobileAuth('ESS_ACCESS', 'OFFSITE_REQUEST_CREATE')
  async createOffsite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOffsiteWorkRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'create', type: 'OFFSITE', dto },
      () => this.requests.create('OFFSITE', { ...dto }, user),
      201,
    );
  }

  /* ------------------------------------------------------------ แก้ร่าง */

  @Patch('leave/:id')
  @MobileAuth('ESS_ACCESS', 'LEAVE_CREATE')
  async updateLeave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'update', type: 'LEAVE', id, dto }, () =>
      this.requests.update('LEAVE', id, { ...dto }, user),
    );
  }

  @Patch('overtime/:id')
  @MobileAuth('ESS_ACCESS', 'OT_CREATE')
  async updateOvertime(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOvertimeRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'update', type: 'OVERTIME', id, dto },
      () => this.requests.update('OVERTIME', id, { ...dto }, user),
    );
  }

  @Patch('time-adjust/:id')
  @MobileAuth('ESS_ACCESS', 'TIME_ADJUST_CREATE')
  async updateTimeAdjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTimeAdjustRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'update', type: 'TIME_ADJUST', id, dto },
      () => this.requests.update('TIME_ADJUST', id, { ...dto }, user),
    );
  }

  @Patch('offsite/:id')
  @MobileAuth('ESS_ACCESS', 'OFFSITE_REQUEST_CREATE')
  async updateOffsite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOffsiteWorkRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'update', type: 'OFFSITE', id, dto },
      () => this.requests.update('OFFSITE', id, { ...dto }, user),
    );
  }

  /* --------------------------------------------------------- ส่งอนุมัติ */

  @Post('leave/:id/submit')
  @MobileAuth('ESS_ACCESS', 'LEAVE_CREATE')
  async submitLeave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'submit', type: 'LEAVE', id }, () =>
      this.requests.submit('LEAVE', id, user),
    );
  }

  @Post('overtime/:id/submit')
  @MobileAuth('ESS_ACCESS', 'OT_CREATE')
  async submitOvertime(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'submit', type: 'OVERTIME', id },
      () => this.requests.submit('OVERTIME', id, user),
    );
  }

  @Post('time-adjust/:id/submit')
  @MobileAuth('ESS_ACCESS', 'TIME_ADJUST_CREATE')
  async submitTimeAdjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'submit', type: 'TIME_ADJUST', id },
      () => this.requests.submit('TIME_ADJUST', id, user),
    );
  }

  @Post('offsite/:id/submit')
  @MobileAuth('ESS_ACCESS', 'OFFSITE_REQUEST_CREATE')
  async submitOffsite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(
      user,
      key,
      { action: 'submit', type: 'OFFSITE', id },
      () => this.requests.submit('OFFSITE', id, user),
    );
  }

  /** Web self-service มี delete ของตัวเองเฉพาะ Offsite จึงไม่เปิด delete ให้ประเภทอื่น */
  @Delete('offsite/:id')
  @MobileAuth('ESS_ACCESS', 'OFFSITE_REQUEST_CREATE')
  async deleteOffsite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @IdempotencyKey() key: string | null,
  ) {
    return this.mutate(user, key, { action: 'delete', type: 'OFFSITE', id }, () =>
      this.requests.deleteDraft('OFFSITE', id, user),
    );
  }

  @Post(':type/:id/cancel')
  @MobileAuth('ESS_ACCESS')
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: MobileCancelRequestDto,
    @IdempotencyKey() key: string | null,
  ) {
    const requestType = resolveType(type);
    return this.mutate(
      user,
      key,
      { action: 'cancel', type: requestType, id, dto },
      () => this.requests.cancel(requestType, id, dto, user),
    );
  }

  @Get(':type/:id')
  @Auth('ESS_ACCESS')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.requests.detail(resolveType(type), id, user);
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
      scope: MOBILE_IDEMPOTENCY_SCOPES.requestMutation,
      userId: user.id,
    });
  }
}

export { MOBILE_REQUEST_TYPES };
