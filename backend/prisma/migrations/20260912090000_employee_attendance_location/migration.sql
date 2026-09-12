-- จุดลงเวลา GPS ที่ผูกให้พนักงานรายคน
--
-- ของเดิมเลือกจุดจากสาขาที่สังกัดอย่างเดียว (จุดแรกของสาขา ไม่งั้นจุดระดับบริษัท)
-- สาขาที่ไม่ได้ติดเครื่องสแกนใช้ GPS แทน และบางคนประจำอยู่ที่หน้างานคนละที่กับสาขา
-- จึงต้องเลือกจุดให้เป็นรายคนได้ — null = ใช้ของสาขาเหมือนเดิม
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "attendanceLocationId" TEXT;

CREATE INDEX IF NOT EXISTS "employees_attendanceLocationId_idx"
  ON "employees" ("attendanceLocationId");

-- ลบจุดแล้วให้พนักงานหลุดกลับไปใช้ของสาขา ไม่ใช่ลบพนักงานตาม
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_attendanceLocationId_fkey'
  ) THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_attendanceLocationId_fkey"
      FOREIGN KEY ("attendanceLocationId") REFERENCES "attendance_locations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
