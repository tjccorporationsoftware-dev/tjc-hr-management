import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { NotificationsService } from '../../notifications/notifications.service';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import {
  MobileNotificationListQueryDto,
  type MobileNotificationCategory,
} from '../dto/mobile-notification.dto';
import { MobilePushPreferenceService } from '../application/mobile-push-preference.service';
import { MobileUpdatePushPreferenceDto } from '../dto/mobile-push-preference.dto';
import { toMobileNotificationItem } from '../mappers/mobile-notification.mapper';
import { MOBILE_API_PREFIX } from '../mobile.constants';

const REQUEST_ENTITY_TYPES = [
  'LeaveRequest',
  'OvertimeRequest',
  'TimeAdjustRequest',
  'OffsiteWorkRequest',
] as const;
const DOCUMENT_ENTITY_TYPES = ['DocumentRequest'] as const;
const ATTENDANCE_ENTITY_TYPES = ['AttendanceDailySummary'] as const;
const HR_ENTITY_TYPES = ['HrReviewItem'] as const;
const KNOWN_ENTITY_TYPES = [
  ...REQUEST_ENTITY_TYPES,
  ...DOCUMENT_ENTITY_TYPES,
  ...ATTENDANCE_ENTITY_TYPES,
  ...HR_ENTITY_TYPES,
];

function categoryFilter(category?: MobileNotificationCategory) {
  switch (category) {
    case 'REQUEST':
      return { entityTypes: [...REQUEST_ENTITY_TYPES] };
    case 'DOCUMENT':
      return { entityTypes: [...DOCUMENT_ENTITY_TYPES] };
    case 'ATTENDANCE':
      return { entityTypes: [...ATTENDANCE_ENTITY_TYPES] };
    case 'HR':
      return { entityTypes: [...HR_ENTITY_TYPES] };
    case 'OTHER':
      return { excludeEntityTypes: [...KNOWN_ENTITY_TYPES] };
    default:
      return {};
  }
}

/**
 * ศูนย์แจ้งเตือนในแอป — ใช้ Notification table เดียวกับเว็บ
 *
 * Mobile layer มีหน้าที่แค่ pagination/filter/mapper และไม่ใช้ `href` ของเว็บ
 * เพราะเส้นทางในแอปถูกตัดสินจาก entityType + notification type ฝั่ง Mobile
 */
@Controller(`${MOBILE_API_PREFIX}/notifications`)
export class MobileNotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly pushPreferences: MobilePushPreferenceService,
  ) {}

  /*
   * ต้องประกาศก่อน route ที่มีพารามิเตอร์ ไม่งั้น "preferences" จะถูกอ่าน
   * เป็น id ของแจ้งเตือน (กับดักเดียวกับ tax-certificate ในคอนโทรลเลอร์เงินเดือน)
   */
  @Get('preferences')
  @Auth('ESS_ACCESS')
  async pushPreferenceList(@CurrentUser() user: AuthenticatedUser) {
    return this.pushPreferences.list(user.id);
  }

  @Patch('preferences')
  @MobileAuth('ESS_ACCESS')
  async updatePushPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileUpdatePushPreferenceDto,
  ) {
    return this.pushPreferences.update(user.id, dto.category, dto.enabled);
  }

  @Get()
  @Auth('ESS_ACCESS')
  async inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileNotificationListQueryDto,
  ) {
    const pageSize = query.pageSize ?? 20;
    const history = await this.notifications.listNotificationHistory(user, {
      page: query.page ?? 1,
      limit: pageSize,
      status: (query.status ?? 'ALL').toLowerCase(),
      ...categoryFilter(query.category),
    });
    const unreadCount = await this.notifications.getUnreadCount(user);

    return {
      generatedAt: history.generatedAt,
      items: history.items.map(toMobileNotificationItem),
      meta: {
        hasMore: history.meta.page < history.meta.totalPages,
        page: history.meta.page,
        pageSize: history.meta.limit,
        total: history.meta.total,
        totalPages: history.meta.totalPages,
      },
      unreadCount,
    };
  }

  @Post('read-all')
  @MobileAuth('ESS_ACCESS')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @MobileAuth('ESS_ACCESS')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() _body: unknown,
  ) {
    return this.notifications.markRead(user, id);
  }
}
