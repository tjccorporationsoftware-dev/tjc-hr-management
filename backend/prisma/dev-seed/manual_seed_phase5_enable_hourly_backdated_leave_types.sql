-- UAT/DEV helper only: เปิดสิทธิ์ลารายชั่วโมงและลาย้อนหลังสำหรับประเภทลาที่มักใช้ทดสอบ
-- ห้ามใช้กับ production โดยไม่ผ่าน HR policy approval

UPDATE leave_types
SET
  "allowHourly" = true,
  "minLeaveUnitMinutes" = 60,
  "allowBackdated" = true,
  "maxBackdatedDays" = 30,
  "backdatedRequiresHrApproval" = true,
  "updatedAt" = NOW()
WHERE "deletedAt" IS NULL
  AND status = 'ACTIVE'
  AND (
    code IN ('ANNUAL', 'SICK', 'PERSONAL', 'UAT-PAID')
    OR "nameTh" IN ('ลาพักร้อน', 'ลาป่วย', 'ลากิจ')
  );
