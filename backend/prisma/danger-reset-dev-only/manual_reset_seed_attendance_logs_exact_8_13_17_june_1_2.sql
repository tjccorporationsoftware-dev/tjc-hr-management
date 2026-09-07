-- HR WFM Manual Reset + Seed Attendance Logs EXACT TIME
-- ใช้สำหรับล้างข้อมูลเวลาเข้าออกงานทั้งหมด แล้ว seed ใหม่แบบเวลาตรง policy:
-- เข้าเช้า 08:00
-- เข้าบ่าย 13:00
-- ออกงาน 17:00
--
-- วันที่ใน DB ใช้ ค.ศ. 2026
-- UI จะแสดงเป็น พ.ศ. 2569
--
-- Seed วันที่:
-- 01/06/2569 = 2026-06-01
-- 02/06/2569 = 2026-06-02
--
-- วิธีรันจากโฟลเดอร์ backend:
-- Get-Content .\prisma\manual_reset_seed_attendance_logs_exact_8_13_17_june_1_2.sql | docker exec -i hr_postgres psql -U hr_admin -d hr_workforce
--
-- หลังรัน:
-- 1) เปิด /attendance
-- 2) เลือกช่วงวันที่ 01/06/2569 - 02/06/2569
-- 3) กด Force recalculate
-- 4) ผลที่ควรได้: สาย 0 นาที / Missing 0 / ค่าปรับ 0 บาท

BEGIN;

-- ล้างผลคำนวณก่อน
DELETE FROM "attendance_daily_summaries";

-- ล้าง log เข้าออกงานทั้งหมด
DELETE FROM "attendance_logs";

-- Seed log ใหม่ให้ทุกคนลงเวลาตรงตาม policy ทั้ง 2 วัน
WITH employees_for_seed AS (
  SELECT
    "id" AS "employeeId",
    "employeeCode",
    ROW_NUMBER() OVER (ORDER BY "employeeCode") AS rn
  FROM "employees"
  WHERE "deletedAt" IS NULL
  ORDER BY "employeeCode"
),
seed_days AS (
  SELECT DATE '2026-06-01' AS "workDate", '20260601' AS "dateKey"
  UNION ALL
  SELECT DATE '2026-06-02' AS "workDate", '20260602' AS "dateKey"
),
logs AS (
  -- เข้าเช้า 08:00
  SELECT
    'att_exact_' || d."dateKey" || '_' || e.rn || '_morning_0800' AS "id",
    e."employeeId",
    d."workDate",
    'CHECK_IN'::"AttendanceLogType" AS "logType",
    (d."workDate"::timestamp + TIME '08:00:00') AS "logTime",
    'WEB'::"AttendanceChannel" AS "channel",
    'NORMAL'::"AttendanceLogStatus" AS "status",
    'WEB' AS "source",
    'MORNING' AS "session",
    'SEED EXACT: เข้าเช้า 08:00' AS "note"
  FROM employees_for_seed e
  CROSS JOIN seed_days d

  UNION ALL

  -- เข้าบ่าย 13:00
  SELECT
    'att_exact_' || d."dateKey" || '_' || e.rn || '_afternoon_1300' AS "id",
    e."employeeId",
    d."workDate",
    'CHECK_IN'::"AttendanceLogType" AS "logType",
    (d."workDate"::timestamp + TIME '13:00:00') AS "logTime",
    'WEB'::"AttendanceChannel" AS "channel",
    'NORMAL'::"AttendanceLogStatus" AS "status",
    'WEB' AS "source",
    'AFTERNOON' AS "session",
    'SEED EXACT: เข้าบ่าย 13:00' AS "note"
  FROM employees_for_seed e
  CROSS JOIN seed_days d

  UNION ALL

  -- ออกงาน 17:00
  SELECT
    'att_exact_' || d."dateKey" || '_' || e.rn || '_checkout_1700' AS "id",
    e."employeeId",
    d."workDate",
    'CHECK_OUT'::"AttendanceLogType" AS "logType",
    (d."workDate"::timestamp + TIME '17:00:00') AS "logTime",
    'WEB'::"AttendanceChannel" AS "channel",
    'NORMAL'::"AttendanceLogStatus" AS "status",
    'WEB' AS "source",
    'EVENING' AS "session",
    'SEED EXACT: ออกงาน 17:00' AS "note"
  FROM employees_for_seed e
  CROSS JOIN seed_days d
)
INSERT INTO "attendance_logs" (
  "id",
  "employeeId",
  "workDate",
  "logType",
  "logTime",
  "channel",
  "status",
  "source",
  "session",
  "note",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "employeeId",
  "workDate",
  "logType",
  "logTime",
  "channel",
  "status",
  "source",
  "session",
  "note",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM logs;

COMMIT;

-- ตรวจจำนวน log หลัง seed
SELECT
  "workDate",
  COUNT(*) AS log_count
FROM "attendance_logs"
GROUP BY "workDate"
ORDER BY "workDate";

-- Preview ข้อมูลที่ seed เข้าไป
SELECT
  e."employeeCode",
  e."firstName",
  e."lastName",
  l."workDate",
  l."logType",
  l."logTime",
  l."source",
  l."session",
  l."status",
  l."note"
FROM "attendance_logs" l
JOIN "employees" e ON e."id" = l."employeeId"
ORDER BY l."workDate", e."employeeCode", l."logTime";
