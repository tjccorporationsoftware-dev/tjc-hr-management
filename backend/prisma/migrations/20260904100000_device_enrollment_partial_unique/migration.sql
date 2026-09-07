-- ผูกพนักงานกับเครื่องสแกน: ห้ามซ้ำเฉพาะแถวที่ยังใช้อยู่
--
-- เดิมเป็น unique ธรรมดา แถวที่ถูกยกเลิกการผูก (ลบแบบซอฟต์) จึงยังกินที่อยู่
-- พอผูกพนักงานคนเดิมหรือใช้รหัสในเครื่องเดิมอีกครั้ง หลังบ้านตอบ "ข้อมูลซ้ำ"
-- ทั้งที่รายการบนหน้าจอ (ซึ่งกรอง deletedAt IS NULL) ว่างเปล่า ไล่ต้นเหตุไม่ได้เลย
--
-- ตัวตรวจในโค้ด (ensureEnrollmentIsAvailable) นับเฉพาะแถวที่ยังใช้อยู่มาตลอด
-- ดัชนีชุดนี้จึงทำให้ฐานข้อมูลใช้กติกาเดียวกับโค้ด

DROP INDEX IF EXISTS "attendance_device_enrollments_deviceId_deviceUserId_key";
DROP INDEX IF EXISTS "attendance_device_enrollments_deviceId_employeeId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_device_enrollments_active_device_user_idx"
ON "attendance_device_enrollments"("deviceId", "deviceUserId")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_device_enrollments_active_employee_idx"
ON "attendance_device_enrollments"("deviceId", "employeeId")
WHERE "deletedAt" IS NULL;

-- ดัชนีค้นหาปกติ (ไม่ unique) ให้ตรงกับที่ประกาศไว้ในสคีมา
CREATE INDEX IF NOT EXISTS "attendance_device_enrollments_deviceId_deviceUserId_idx"
ON "attendance_device_enrollments"("deviceId", "deviceUserId");

CREATE INDEX IF NOT EXISTS "attendance_device_enrollments_deviceId_employeeId_idx"
ON "attendance_device_enrollments"("deviceId", "employeeId");
