import { Controller, Get, Param, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditAction } from '../../generated/prisma/client';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@Auth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}


  @Get()
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Notification',
    description: 'ดูประวัติแจ้งเตือนทั้งหมดในระบบ',
  })
  listNotifications(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.listNotificationHistory(currentUser, {
      status,
      page,
      limit,
    });
  }

  @Get('summary')
  getSummary(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notificationsService.getSummary(currentUser);
  }

  @Get('stream')
  stream(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res() response: Response,
  ) {
    return this.notificationsService.stream(currentUser, response);
  }

  @Get('inbox')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Notification',
    description: 'ดูรายการแจ้งเตือนในระบบ',
  })
  getInbox(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notificationsService.getInbox(currentUser);
  }

  @Patch('read-all')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Notification',
    description: 'อ่านแจ้งเตือนทั้งหมดในระบบ',
  })
  markAllRead(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notificationsService.markAllRead(currentUser);
  }

  @Patch(':id/read')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Notification',
    description: 'อ่านรายการแจ้งเตือนในระบบ',
  })
  markRead(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.notificationsService.markRead(currentUser, id);
  }
}
