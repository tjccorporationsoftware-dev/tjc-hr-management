-- 1) เคลียร์ reference ใน AttendanceLog ที่ผูกกับ Offsite Request
UPDATE "attendance_logs"
SET
  "isOffsite" = false,
  "offsiteRequestId" = NULL,
  "locationVerified" = NULL,
  "distanceFromApprovedLocationMeters" = NULL,
  "gpsVerificationStatus" = NULL,
  "photoUrl" = NULL
WHERE
  "isOffsite" = true
  OR "offsiteRequestId" IS NOT NULL;

-- 2) เคลียร์สถานะ offsite ใน daily summary
UPDATE "attendance_daily_summaries"
SET "offsiteStatus" = NULL
WHERE "offsiteStatus" IS NOT NULL;

-- 3) ลบคำขอทำงานนอกสถานที่ทั้งหมด
DELETE FROM "offsite_work_requests";
