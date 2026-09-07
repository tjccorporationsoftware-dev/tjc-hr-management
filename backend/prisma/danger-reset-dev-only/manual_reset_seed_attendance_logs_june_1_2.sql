-- HR WFM Manual Reset + Seed Attendance Logs
-- ใช้สำหรับล้างข้อมูลเวลาเข้าออกงานทั้งหมด แล้ว seed ใหม่สำหรับทดสอบวันที่ 1-2 มิถุนายน 2569
--
-- วันที่ใน DB ใช้ ค.ศ. 2026
-- UI จะแสดงเป็น พ.ศ. 2569
--
-- วิธีรันจากโฟลเดอร์ backend:
-- Get-Content .\prisma\manual_reset_seed_attendance_logs_june_1_2.sql | docker exec -i hr_postgres psql -U hr_admin -d hr_workforce
--
-- หลังรันเสร็จ:
-- 1) เปิด /attendance
-- 2) เลือกช่วงวันที่ 01/06/2569 - 02/06/2569
-- 3) กด Force recalculate
-- 4) ตรวจแท็บ สรุปรายวัน และ ค่าปรับ/หักเงิน

BEGIN;

-- 1) ล้าง daily summary ก่อน เพราะเป็นผลคำนวณจาก attendance_logs
DELETE FROM "attendance_daily_summaries";

-- 2) ล้าง attendance logs ทั้งหมดของทุกคน
DELETE FROM "attendance_logs";

-- 3) Seed attendance logs ใหม่
-- แนวคิด:
-- - วันที่ 01/06/2026: ทุกคนลงเวลาปกติครบ 3 จุด
-- - วันที่ 02/06/2026: แบ่ง pattern ตามลำดับพนักงานเพื่อทดสอบหลายเคส
--
-- Pattern วันที่ 02/06/2026:
-- rn % 6 = 1: ปกติ
-- rn % 6 = 2: สายเช้า 10 นาที = 50 บาท
-- rn % 6 = 3: สายบ่าย 7 นาที = 35 บาท
-- rn % 6 = 4: สายเช้า 12 นาที + สายบ่าย 8 นาที = 100 บาท
-- rn % 6 = 5: ลืมเข้าเช้า = missing log 50 บาท
-- rn % 6 = 0: ลืมออกงาน = missing log 50 บาท

WITH employees_for_seed AS (
  SELECT
    "id" AS "employeeId",
    "employeeCode",
    ROW_NUMBER() OVER (ORDER BY "employeeCode") AS rn
  FROM "employees"
  WHERE "deletedAt" IS NULL
  ORDER BY "employeeCode"
),
logs AS (
  -- 01/06/2026: Normal day for every employee
  SELECT
    'att_seed_20260601_' || rn || '_morning' AS id,
    "employeeId",
    DATE '2026-06-01' AS "workDate",
    'CHECK_IN'::"AttendanceLogType" AS "logType",
    TIMESTAMP '2026-06-01 07:55:00' AS "logTime",
    'WEB'::"AttendanceChannel" AS "channel",
    'NORMAL'::"AttendanceLogStatus" AS "status",
    'WEB' AS "source",
    'MORNING' AS "session",
    'SEED 01/06/2569: normal morning in' AS "note"
  FROM employees_for_seed

  UNION ALL

  SELECT
    'att_seed_20260601_' || rn || '_afternoon',
    "employeeId",
    DATE '2026-06-01',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-01 12:58:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 01/06/2569: normal afternoon in'
  FROM employees_for_seed

  UNION ALL

  SELECT
    'att_seed_20260601_' || rn || '_checkout',
    "employeeId",
    DATE '2026-06-01',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-01 17:10:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 01/06/2569: normal checkout'
  FROM employees_for_seed

  UNION ALL

  -- 02/06/2026 Pattern 1: Normal
  SELECT
    'att_seed_20260602_' || rn || '_morning_normal',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 07:55:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: normal morning in'
  FROM employees_for_seed
  WHERE rn % 6 = 1

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_afternoon_normal',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 12:58:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: normal afternoon in'
  FROM employees_for_seed
  WHERE rn % 6 = 1

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_checkout_normal',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 17:10:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: normal checkout'
  FROM employees_for_seed
  WHERE rn % 6 = 1

  UNION ALL

  -- 02/06/2026 Pattern 2: Morning late 10 minutes
  SELECT
    'att_seed_20260602_' || rn || '_morning_late10',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 08:10:00',
    'WEB'::"AttendanceChannel",
    'LATE'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: morning late 10 minutes'
  FROM employees_for_seed
  WHERE rn % 6 = 2

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_afternoon_ok_late10_case',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 12:58:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: afternoon normal'
  FROM employees_for_seed
  WHERE rn % 6 = 2

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_checkout_ok_late10_case',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 17:10:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: checkout normal'
  FROM employees_for_seed
  WHERE rn % 6 = 2

  UNION ALL

  -- 02/06/2026 Pattern 3: Afternoon late 7 minutes
  SELECT
    'att_seed_20260602_' || rn || '_morning_ok_afternoon_late7',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 07:55:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: morning normal'
  FROM employees_for_seed
  WHERE rn % 6 = 3

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_afternoon_late7',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 13:07:00',
    'WEB'::"AttendanceChannel",
    'LATE'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: afternoon late 7 minutes'
  FROM employees_for_seed
  WHERE rn % 6 = 3

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_checkout_ok_afternoon_late7',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 17:10:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: checkout normal'
  FROM employees_for_seed
  WHERE rn % 6 = 3

  UNION ALL

  -- 02/06/2026 Pattern 4: Morning late 12 + Afternoon late 8
  SELECT
    'att_seed_20260602_' || rn || '_morning_late12',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 08:12:00',
    'WEB'::"AttendanceChannel",
    'LATE'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: morning late 12 minutes'
  FROM employees_for_seed
  WHERE rn % 6 = 4

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_afternoon_late8',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 13:08:00',
    'WEB'::"AttendanceChannel",
    'LATE'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: afternoon late 8 minutes'
  FROM employees_for_seed
  WHERE rn % 6 = 4

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_checkout_ok_late_both',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 17:10:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: checkout normal'
  FROM employees_for_seed
  WHERE rn % 6 = 4

  UNION ALL

  -- 02/06/2026 Pattern 5: Missing morning
  SELECT
    'att_seed_20260602_' || rn || '_afternoon_only_missing_morning',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 13:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: missing morning'
  FROM employees_for_seed
  WHERE rn % 6 = 5

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_checkout_missing_morning',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 17:10:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: checkout normal, missing morning'
  FROM employees_for_seed
  WHERE rn % 6 = 5

  UNION ALL

  -- 02/06/2026 Pattern 6: Missing checkout
  SELECT
    'att_seed_20260602_' || rn || '_morning_missing_checkout',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 07:55:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: morning normal, missing checkout'
  FROM employees_for_seed
  WHERE rn % 6 = 0

  UNION ALL

  SELECT
    'att_seed_20260602_' || rn || '_afternoon_missing_checkout',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 12:58:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: afternoon normal, missing checkout'
  FROM employees_for_seed
  WHERE rn % 6 = 0
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
  id,
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

-- Summary หลัง seed
SELECT
  "workDate",
  COUNT(*) AS log_count
FROM "attendance_logs"
GROUP BY "workDate"
ORDER BY "workDate";

-- Preview logs
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
