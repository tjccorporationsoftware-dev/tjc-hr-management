import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { AttendanceImportDataset } from './datasets/attendance-import.dataset';
import { EmployeeImportDataset } from './datasets/employee-import.dataset';
import { AttendanceSummaryQueueModule } from '../attendance/attendance-summary-queue.module';

/**
 * นำเข้าข้อมูลจากไฟล์ Excel
 *
 * โครงกลางใช้ร่วมกันทุกชุดข้อมูล (อ่านไฟล์ เดาหัวตาราง จับคู่คอลัมน์ พรีวิว ยืนยัน
 * เก็บประวัติ) ชุดข้อมูลใหม่เพิ่มเป็น dataset provider แล้วลงทะเบียนใน DataImportService
 */
@Module({
  // ใช้คิวสรุปเวลารายวันตัวเดิม เพื่อสั่งคำนวณใหม่หลังนำเข้า (ไม่ได้แก้ระบบลงเวลา)
  imports: [PrismaModule, AttendanceSummaryQueueModule],
  controllers: [DataImportController],
  providers: [DataImportService, EmployeeImportDataset, AttendanceImportDataset],
  exports: [DataImportService],
})
export class DataImportModule {}
