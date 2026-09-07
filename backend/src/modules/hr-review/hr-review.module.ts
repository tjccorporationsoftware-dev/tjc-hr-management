import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { HrReviewController } from './hr-review.controller';
import { HrReviewService } from './hr-review.service';

/**
 * HR Review Module
 * ----------------
 * โมดูลนี้เป็นชั้นกลางระหว่าง Approval กับ Payroll
 * ไม่แก้ flow อนุมัติเดิม และยังไม่คำนวณเงินเดือนจริงใน Phase นี้
 */
@Module({
  imports: [PrismaModule],
  controllers: [HrReviewController],
  providers: [HrReviewService],
  exports: [HrReviewService],
})
export class HrReviewModule {}
