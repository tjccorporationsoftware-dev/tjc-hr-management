/**
 * งานบำรุงรักษาที่ต้องรันเองตามเวลา
 * -----------------------------------------------------------------------------
 * เดิมระบบไม่มีตัวตั้งเวลาเลย สคริปต์ backup / ล้าง audit log / ล้างไฟล์ export
 * มีอยู่ใน package.json แต่ไม่เคยถูกเรียกเอง ต้องมีคนจำแล้วสั่งเอง
 * ผลคือ AuditLog โตไม่หยุด ไฟล์ export ค้างเต็มดิสก์ และไม่มีสำรองข้อมูลเลย
 *
 * ใช้ repeatable job ของ BullMQ แทน @nestjs/schedule เพราะเมื่อรันหลาย instance
 * cron ในโปรเซสจะยิงพร้อมกันทุกเครื่อง (สำรองข้อมูลซ้อนกัน 3 ชุด)
 * ขณะที่ BullMQ ใช้ Redis เป็นตัวกลาง งานหนึ่งรอบจึงถูกหยิบไปทำเครื่องเดียว
 */
export const MAINTENANCE_QUEUE = 'maintenance';

export const MAINTENANCE_JOB_BACKUP = 'backup';
export const MAINTENANCE_JOB_CLEANUP_AUDIT = 'cleanup-audit';
export const MAINTENANCE_JOB_CLEANUP_STORAGE = 'cleanup-storage';

/**
 * ตารางเวลา (เวลาไทย — กระบวนการตั้ง TZ=Asia/Bangkok ไว้แล้ว)
 *
 * เลี่ยงเวลาที่คนใช้งานจริง และไม่ให้ชนกันเองเพื่อไม่ให้แย่ง I/O
 */
export const MAINTENANCE_SCHEDULES = [
  {
    name: MAINTENANCE_JOB_BACKUP,
    /** ตีสองทุกวัน — หลังงานเดินเอกสารของวันก่อนหน้าจบแล้ว */
    pattern: '0 2 * * *',
    description: 'สำรองฐานข้อมูลและไฟล์ที่ผู้ใช้อัปโหลด',
  },
  {
    name: MAINTENANCE_JOB_CLEANUP_STORAGE,
    /** ตีสามทุกวัน — หลังสำรองข้อมูลเสร็จ จะได้ไม่ลบไฟล์ที่ยังไม่ถูกสำรอง */
    pattern: '0 3 * * *',
    description: 'ล้างไฟล์ชั่วคราวและไฟล์ดาวน์โหลดที่หมดอายุ',
  },
  {
    name: MAINTENANCE_JOB_CLEANUP_AUDIT,
    /** ตีสี่ของวันอาทิตย์ — เป็นงานหนัก ทำสัปดาห์ละครั้งพอ */
    pattern: '0 4 * * 0',
    description: 'ล้างบันทึกการใช้งานที่เกินระยะเก็บ',
  },
] as const;

export type MaintenanceJobName =
  (typeof MAINTENANCE_SCHEDULES)[number]['name'];
