import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';

/**
 * LeaveApprovalService
 * -----------------------------------------------------------------------------
 * จุดประสงค์ของไฟล์นี้คือเตรียมแยก logic Approval Matrix / Approval Step
 * ออกจาก LeaveRequestsService ในรอบถัดไป
 *
 * ตอนนี้ LeaveRequestsService ยังเป็น facade หลัก เพื่อไม่ให้ endpoint เดิมพัง
 * แต่ไฟล์นี้ทำหน้าที่เป็นพื้นที่รวมแนวคิด/เมธอดเกี่ยวกับ approval โดยเฉพาะ
 * เช่น:
 * - หา Approval Matrix ที่เหมาะสม
 * - สร้าง LeaveApprovalStep
 * - ตรวจว่าผู้ใช้ปัจจุบันมีสิทธิ์อนุมัติ step นั้นหรือไม่
 * - เลื่อนไป step ถัดไปเมื่ออนุมัติผ่าน
 *
 * หมายเหตุสำหรับรอบ refactor ถัดไป:
 * ควรค่อย ๆ ย้าย private methods จาก LeaveRequestsService มาที่นี่ทีละชุด
 * แล้วรัน build/test ทุกครั้ง เพื่อป้องกัน flow ใบลาพัง
 */
@Injectable()
export class LeaveApprovalService {
  /**
   * Type alias ใช้ในคอมเมนต์/ตัวอย่างเพื่ออธิบายว่า service นี้ควรทำงานใน transaction
   * เพราะ approval step, leave request และ leave balance ต้อง update พร้อมกัน
   */
  readonly transactionClientTypeExample!: Prisma.TransactionClient;
}
