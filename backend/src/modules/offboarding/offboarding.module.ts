import { Module } from '@nestjs/common';

import { OffboardingController } from './offboarding.controller';
import { OffboardingService } from './offboarding.service';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
  // ใช้ตัวคำนวณค่าชดเชยและภาษีเงินก้อนจากฝั่ง payroll ไม่คิดสูตรซ้ำที่นี่
  imports: [PayrollModule],
  controllers: [OffboardingController],
  providers: [OffboardingService],
  // employees module เรียกใช้ตอนอนุมัติใบลาออกเพื่อเปิดเคสอัตโนมัติ
  exports: [OffboardingService],
})
export class OffboardingModule {}
