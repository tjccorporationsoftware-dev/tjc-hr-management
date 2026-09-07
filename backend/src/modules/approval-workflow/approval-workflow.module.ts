import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ApprovalMatrixResolverService } from './services/approval-matrix-resolver.service';
import { ApprovalDelegationService } from './services/approval-delegation.service';
import { ApprovalDelegationController } from './approval-delegation.controller';

/**
 * ApprovalWorkflowModule
 * -----------------------------------------------------------------------------
 * โมดูลกลางสำหรับ logic ที่ใช้ร่วมกันของระบบอนุมัติทุกประเภท
 * เช่น ใบลา, OT, ขอแก้เวลา, เอกสาร หรือ workflow อื่น ๆ ในอนาคต
 *
 * ทำไมต้องแยกเป็น module กลาง?
 * - ถ้าเอา resolver ไว้ใน ApprovalsModule แล้วให้ Leaves/OT/TimeAdjust import
 *   จะเกิด circular dependency เพราะ ApprovalsModule เองก็ import module เหล่านั้นอยู่แล้ว
 * - Module นี้จึงทำหน้าที่เป็น shared workflow utility ที่ไม่มี controller
 * - Module อื่น import ตัวนี้เพื่อใช้ ApprovalMatrixResolverService ได้อย่างปลอดภัย
 */
@Module({
  imports: [PrismaModule],
  // ตัวจัดการใบมอบอำนาจมี controller ของตัวเอง ต่างจาก resolver ที่เป็น utility ล้วน
  controllers: [ApprovalDelegationController],
  providers: [ApprovalMatrixResolverService, ApprovalDelegationService],
  exports: [ApprovalMatrixResolverService, ApprovalDelegationService],
})
export class ApprovalWorkflowModule {}
