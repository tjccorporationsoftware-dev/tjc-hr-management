import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';

/**
 * LeaveBalanceLedgerService
 * -----------------------------------------------------------------------------
 * เตรียมแยก logic การขยับตัวเลขวันลาออกจาก LeaveRequestsService
 *
 * แนวคิด:
 * - ตอน submit: pendingDays เพิ่ม
 * - ตอน approve ครบทุกขั้น: pendingDays ลด และ usedDays เพิ่ม
 * - ตอน reject: pendingDays ลด
 * - ตอน cancel:
 *   - ถ้า SUBMITTED ให้ pendingDays ลด
 *   - ถ้า APPROVED ให้ usedDays ลด
 *
 * เหตุผลที่ควรแยก:
 * Leave balance เป็น logic สำคัญมาก ถ้าไปปะปนกับ approval flow จะอ่านยาก
 * และมีโอกาสแก้ผิดจนยอดวันลาคงเหลือเพี้ยน
 */
@Injectable()
export class LeaveBalanceLedgerService {
  /**
   * คง type reference ไว้เพื่อช่วยให้คนอ่านเข้าใจว่าเมธอดในอนาคตควรรับ tx
   * ไม่ควรใช้ PrismaService ตรง ๆ ใน flow ที่ต้อง update หลายตารางพร้อมกัน
   */
  readonly transactionClientTypeExample!: Prisma.TransactionClient;
}
