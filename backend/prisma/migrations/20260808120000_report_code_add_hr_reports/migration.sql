-- เพิ่มรหัสรายงานชุดงาน HR ให้ครบตามที่โปรแกรม HR ทั่วไปออกให้ได้
-- ALTER TYPE ... ADD VALUE เป็นการเพิ่มค่าอย่างเดียว ไม่กระทบข้อมูลเดิม
ALTER TYPE "ReportCode" ADD VALUE IF NOT EXISTS 'WORK_STATUS';
ALTER TYPE "ReportCode" ADD VALUE IF NOT EXISTS 'ATTENDANCE_LOG';
ALTER TYPE "ReportCode" ADD VALUE IF NOT EXISTS 'LEAVE_REQUEST';
ALTER TYPE "ReportCode" ADD VALUE IF NOT EXISTS 'EMPLOYEE_REGISTER';
