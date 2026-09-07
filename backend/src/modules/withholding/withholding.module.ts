import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { WithholdingController } from './withholding.controller';
import { WithholdingFilingService } from './withholding-filing.service';
import { WithholdingService } from './withholding.service';

/**
 * ภาษีหัก ณ ที่จ่ายของผู้รับเงินที่ไม่ใช่ลูกจ้าง — แบบ ภ.ง.ด.3
 *
 * แยกโมดูลออกจาก payroll เพราะเป็นคนละกลุ่มผู้รับเงินและคนละมาตราภาษี
 * ถึงจะใช้ตัวปั๊มแบบพิมพ์ร่วมกับ payroll ก็ตาม
 */
@Module({
  imports: [AuthModule],
  controllers: [WithholdingController],
  providers: [WithholdingService, WithholdingFilingService],
  exports: [WithholdingService],
})
export class WithholdingModule {}
