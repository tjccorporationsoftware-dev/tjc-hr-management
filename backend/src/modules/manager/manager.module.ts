import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';

@Module({
  // ใช้ตัวตัดสิน "วันนี้เป็นวันหยุดไหม" ตัวเดียวกับที่ระบบลงเวลาใช้
  imports: [SettingsModule],
  controllers: [ManagerController],
  providers: [ManagerService],
  // MobileModule ห่อ service ตัวนี้ต่อสำหรับจอทีมของหัวหน้า (ADR-001)
  exports: [ManagerService],
})
export class ManagerModule {}
