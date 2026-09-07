import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { NotificationsController } from "./notifications.controller";
import { AttendanceNotificationSchedulerService } from "./attendance-notification-scheduler.service";
import { NotificationNudgeService } from "./notification-nudge.service";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationNudgeService,
    AttendanceNotificationSchedulerService,
  ],
  exports: [NotificationsService, NotificationNudgeService],
})
export class NotificationsModule {}
