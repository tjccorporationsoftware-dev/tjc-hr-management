import { Module } from '@nestjs/common';
import { ManpowerController } from './manpower.controller';
import { ManpowerService } from './manpower.service';

@Module({
  controllers: [ManpowerController],
  providers: [ManpowerService],
  // MobileExecutiveOrchestrator ฉีด ManpowerService เข้ามา ถ้าไม่ export
  // การ import ManpowerModule เข้า MobileModule ก็ไม่ทำให้ฉีดได้ แอปจะบูตไม่ขึ้น
  exports: [ManpowerService],
})
export class ManpowerModule {}