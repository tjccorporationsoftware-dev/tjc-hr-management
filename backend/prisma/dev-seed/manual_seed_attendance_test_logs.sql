-- HR WFM Manual Seed: Attendance Test Logs
-- ใช้สำหรับทดสอบ Batch 5/6: Attendance Calculation Engine + HR Attendance UI
--
-- วิธีรันจากโฟลเดอร์ backend:
-- Get-Content .\prisma\manual_seed_attendance_test_logs.sql | docker exec -i hr_postgres psql -U hr_admin -d hr_workforce
--
-- หลังรันเสร็จ:
-- 1) เปิด /attendance
-- 2) เลือกช่วงวันที่ 10/06/2569 - 15/06/2569
-- 3) กด "คำนวณใหม่" หรือ "Force recalculate"
-- 4) ตรวจผลตาม test case ด้านล่าง

BEGIN;

-- ลบข้อมูล seed เดิมก่อน เพื่อให้รันซ้ำได้
DELETE FROM "attendance_daily_summaries"
WHERE "workDate" BETWEEN DATE '2026-06-10' AND DATE '2026-06-15'
  AND "employeeId" IN (
    SELECT "id"
    FROM "employees"
    WHERE "deletedAt" IS NULL
    ORDER BY "employeeCode"
    LIMIT 6
  );

DELETE FROM "attendance_logs"
WHERE "id" LIKE 'att_seed_case_%';

-- สร้าง test logs 6 เคส โดยใช้พนักงาน 6 คนแรกในระบบ
WITH selected_employees AS (
  SELECT
    "id" AS "employeeId",
    ROW_NUMBER() OVER (ORDER BY "employeeCode") AS rn
  FROM "employees"
  WHERE "deletedAt" IS NULL
  ORDER BY "employeeCode"
  LIMIT 6
),
test_logs AS (
  -- Case 1: ปกติ ไม่สาย ไม่ลืมสแกน
  SELECT 'att_seed_case_01_morning' AS id, "employeeId", DATE '2026-06-10' AS "workDate",
         'CHECK_IN'::"AttendanceLogType" AS "logType", TIMESTAMP '2026-06-10 07:55:00' AS "logTime",
         'WEB'::"AttendanceChannel" AS channel, 'NORMAL'::"AttendanceLogStatus" AS status,
         'WEB' AS source, 'MORNING' AS session, 'TEST: Case 1 normal morning in' AS note
  FROM selected_employees WHERE rn = 1
  UNION ALL
  SELECT 'att_seed_case_01_afternoon', "employeeId", DATE '2026-06-10',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-10 12:58:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'AFTERNOON', 'TEST: Case 1 normal afternoon in'
  FROM selected_employees WHERE rn = 1
  UNION ALL
  SELECT 'att_seed_case_01_checkout', "employeeId", DATE '2026-06-10',
         'CHECK_OUT'::"AttendanceLogType", TIMESTAMP '2026-06-10 17:10:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'EVENING', 'TEST: Case 1 normal check out'
  FROM selected_employees WHERE rn = 1

  UNION ALL

  -- Case 2: สายเช้า 10 นาที = 10 × 5 = 50 บาท
  SELECT 'att_seed_case_02_morning', "employeeId", DATE '2026-06-11',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-11 08:10:00',
         'WEB'::"AttendanceChannel", 'LATE'::"AttendanceLogStatus",
         'WEB', 'MORNING', 'TEST: Case 2 morning late 10 minutes'
  FROM selected_employees WHERE rn = 2
  UNION ALL
  SELECT 'att_seed_case_02_afternoon', "employeeId", DATE '2026-06-11',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-11 12:58:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'AFTERNOON', 'TEST: Case 2 afternoon normal'
  FROM selected_employees WHERE rn = 2
  UNION ALL
  SELECT 'att_seed_case_02_checkout', "employeeId", DATE '2026-06-11',
         'CHECK_OUT'::"AttendanceLogType", TIMESTAMP '2026-06-11 17:10:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'EVENING', 'TEST: Case 2 checkout normal'
  FROM selected_employees WHERE rn = 2

  UNION ALL

  -- Case 3: สายบ่าย 7 นาที = 7 × 5 = 35 บาท
  SELECT 'att_seed_case_03_morning', "employeeId", DATE '2026-06-12',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-12 07:55:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'MORNING', 'TEST: Case 3 morning normal'
  FROM selected_employees WHERE rn = 3
  UNION ALL
  SELECT 'att_seed_case_03_afternoon', "employeeId", DATE '2026-06-12',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-12 13:07:00',
         'WEB'::"AttendanceChannel", 'LATE'::"AttendanceLogStatus",
         'WEB', 'AFTERNOON', 'TEST: Case 3 afternoon late 7 minutes'
  FROM selected_employees WHERE rn = 3
  UNION ALL
  SELECT 'att_seed_case_03_checkout', "employeeId", DATE '2026-06-12',
         'CHECK_OUT'::"AttendanceLogType", TIMESTAMP '2026-06-12 17:10:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'EVENING', 'TEST: Case 3 checkout normal'
  FROM selected_employees WHERE rn = 3

  UNION ALL

  -- Case 4: สายเช้า 12 นาที + สายบ่าย 8 นาที = 20 × 5 = 100 บาท
  SELECT 'att_seed_case_04_morning', "employeeId", DATE '2026-06-13',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-13 08:12:00',
         'WEB'::"AttendanceChannel", 'LATE'::"AttendanceLogStatus",
         'WEB', 'MORNING', 'TEST: Case 4 morning late 12 minutes'
  FROM selected_employees WHERE rn = 4
  UNION ALL
  SELECT 'att_seed_case_04_afternoon', "employeeId", DATE '2026-06-13',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-13 13:08:00',
         'WEB'::"AttendanceChannel", 'LATE'::"AttendanceLogStatus",
         'WEB', 'AFTERNOON', 'TEST: Case 4 afternoon late 8 minutes'
  FROM selected_employees WHERE rn = 4
  UNION ALL
  SELECT 'att_seed_case_04_checkout', "employeeId", DATE '2026-06-13',
         'CHECK_OUT'::"AttendanceLogType", TIMESTAMP '2026-06-13 17:10:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'EVENING', 'TEST: Case 4 checkout normal'
  FROM selected_employees WHERE rn = 4

  UNION ALL

  -- Case 5: ลืมเข้าเช้า มีแค่เข้าบ่าย + ออกงาน = missing log 50 บาท/วัน
  SELECT 'att_seed_case_05_afternoon', "employeeId", DATE '2026-06-14',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-14 13:00:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'AFTERNOON', 'TEST: Case 5 missing morning'
  FROM selected_employees WHERE rn = 5
  UNION ALL
  SELECT 'att_seed_case_05_checkout', "employeeId", DATE '2026-06-14',
         'CHECK_OUT'::"AttendanceLogType", TIMESTAMP '2026-06-14 17:10:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'EVENING', 'TEST: Case 5 checkout normal'
  FROM selected_employees WHERE rn = 5

  UNION ALL

  -- Case 6: ลืมออกงาน มีเข้าเช้า + เข้าบ่าย = missing log 50 บาท/วัน
  SELECT 'att_seed_case_06_morning', "employeeId", DATE '2026-06-15',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-15 07:55:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'MORNING', 'TEST: Case 6 morning normal'
  FROM selected_employees WHERE rn = 6
  UNION ALL
  SELECT 'att_seed_case_06_afternoon', "employeeId", DATE '2026-06-15',
         'CHECK_IN'::"AttendanceLogType", TIMESTAMP '2026-06-15 12:58:00',
         'WEB'::"AttendanceChannel", 'NORMAL'::"AttendanceLogStatus",
         'WEB', 'AFTERNOON', 'TEST: Case 6 missing checkout'
  FROM selected_employees WHERE rn = 6
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
  channel,
  status,
  source,
  session,
  note,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM test_logs;

COMMIT;

-- ตรวจผล log ที่ seed เข้าไป
SELECT
  "employeeId",
  "workDate",
  "logType",
  "logTime",
  "source",
  "session",
  "status",
  "note"
FROM "attendance_logs"
WHERE "id" LIKE 'att_seed_case_%'
ORDER BY "workDate", "employeeId", "logTime";
