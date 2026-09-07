import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module';
import { PayrollStatutoryDefaultsService } from './services/payroll-statutory-defaults.service';

/**
 * PayrollStatutoryDefaultsModule
 * -----------------------------------------------------------------------------
 * แยกออกมาเป็นโมดูลเล็ก ๆ เพราะโมดูลอื่นต้องใช้ตัวนี้ด้วย — โดยเฉพาะ
 * OrganizationModule ที่ต้องเติมโครงสร้างภาษีให้บริษัทที่เพิ่งสร้าง
 *
 * ถ้าไปดึง PayrollModule ทั้งก้อนเข้าไปแทน จะลากทั้งโมดูลเงินเดือน
 * (controller/queue/service อีกหลายสิบตัว) ไปผูกกับการสร้างบริษัทโดยไม่จำเป็น
 */
@Module({
  imports: [PrismaModule],
  providers: [PayrollStatutoryDefaultsService],
  exports: [PayrollStatutoryDefaultsService],
})
export class PayrollStatutoryDefaultsModule {}
