-- HR WFM Manual Reset + Seed Attendance Logs REALISTIC (UTC-STORAGE FIX)
-- ล้างข้อมูลเวลาเข้าออกงานทั้งหมด แล้ว seed ใหม่สำหรับทดสอบวันที่ 1-2 มิถุนายน 2569
--
-- สำคัญ:
-- ระบบแสดงผลเวลาเป็น Asia/Bangkok ผ่าน DateTimeDisplay
-- ดังนั้นเวลาใน DB ต้องเก็บเป็น UTC equivalent:
-- 08:00 ไทย = 01:00 UTC
-- 13:00 ไทย = 06:00 UTC
-- 17:00 ไทย = 10:00 UTC
--
-- ถ้าใส่ DB เป็น 08:00 ตรง ๆ frontend จะบวก timezone เป็น 15:00
--
-- หลักข้อมูล:
-- 01/06/2569 = ทุกคนมาตรงเวลา
-- 02/06/2569 = ส่วนใหญ่ปกติ + บางคนสายเล็กน้อย + บางคนลืมสแกน
--
-- Policy ที่ใช้เทียบ:
-- เข้าเช้า <= 08:00
-- เข้าบ่าย <= 13:00
-- ออกงาน >= 17:00
-- สาย 5 บาท/นาที
-- ลืมสแกน 50 บาท/วัน
--
-- วิธีรันจากโฟลเดอร์ backend:
-- Get-Content .\prisma\manual_reset_seed_attendance_logs_realistic_june_1_2.sql | docker exec -i hr_postgres psql -U hr_admin -d hr_workforce
--
-- หลังรัน:
-- 1) เปิด /attendance
-- 2) เลือกช่วงวันที่ 01/06/2569 - 02/06/2569
-- 3) กด Force recalculate
-- 4) ตรวจแท็บ สรุปรายวัน และ ค่าปรับ/หักเงิน

BEGIN;

-- ล้างผลคำนวณก่อน
DELETE FROM "attendance_daily_summaries";

-- ล้าง log เข้าออกงานทั้งหมด
DELETE FROM "attendance_logs";

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
  --------------------------------------------------------------------
  -- 01/06/2026: ทุกคนตรงเวลา
  -- แสดงบน UI เป็น 08:00 / 13:00 / 17:00
  --------------------------------------------------------------------
  SELECT
    'att_real_20260601_' || rn || '_morning_0800' AS "id",
    "employeeId",
    DATE '2026-06-01' AS "workDate",
    'CHECK_IN'::"AttendanceLogType" AS "logType",
    TIMESTAMP '2026-06-01 01:00:00' AS "logTime",
    'WEB'::"AttendanceChannel" AS "channel",
    'NORMAL'::"AttendanceLogStatus" AS "status",
    'WEB' AS "source",
    'MORNING' AS "session",
    'SEED 01/06/2569: เข้าเช้าตรงเวลา 08:00' AS "note"
  FROM employees_for_seed

  UNION ALL

  SELECT
    'att_real_20260601_' || rn || '_afternoon_1300',
    "employeeId",
    DATE '2026-06-01',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-01 06:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 01/06/2569: เข้าบ่ายตรงเวลา 13:00'
  FROM employees_for_seed

  UNION ALL

  SELECT
    'att_real_20260601_' || rn || '_checkout_1700',
    "employeeId",
    DATE '2026-06-01',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-01 10:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 01/06/2569: ออกงานตรงเวลา 17:00'
  FROM employees_for_seed

  --------------------------------------------------------------------
  -- 02/06/2026: ข้อมูล realistic
  -- rn % 10 = 1-5 : ปกติ
  -- rn % 10 = 6   : สายเช้า 5 นาที แสดง 08:05
  -- rn % 10 = 7   : สายบ่าย 4 นาที แสดง 13:04
  -- rn % 10 = 8   : สายเช้า 8 นาที + สายบ่าย 3 นาที แสดง 08:08 / 13:03
  -- rn % 10 = 9   : ลืมเข้าเช้า
  -- rn % 10 = 0   : ลืมออกงาน
  --------------------------------------------------------------------

  UNION ALL

  -- กลุ่มปกติ
  SELECT
    'att_real_20260602_' || rn || '_morning_normal',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 01:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: เข้าเช้าปกติ 08:00'
  FROM employees_for_seed
  WHERE rn % 10 BETWEEN 1 AND 5

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_afternoon_normal',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 06:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: เข้าบ่ายปกติ 13:00'
  FROM employees_for_seed
  WHERE rn % 10 BETWEEN 1 AND 5

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_checkout_normal',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 10:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: ออกงานปกติ 17:00'
  FROM employees_for_seed
  WHERE rn % 10 BETWEEN 1 AND 5

  UNION ALL

  -- สายเช้า 5 นาที: 08:05 ไทย = 01:05 UTC
  SELECT
    'att_real_20260602_' || rn || '_morning_late_0805',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 01:05:00',
    'WEB'::"AttendanceChannel",
    'LATE'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: สายเช้า 5 นาที'
  FROM employees_for_seed
  WHERE rn % 10 = 6

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_afternoon_ok_morning_late',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 06:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: เข้าบ่ายปกติ หลังสายเช้า'
  FROM employees_for_seed
  WHERE rn % 10 = 6

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_checkout_ok_morning_late',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 10:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: ออกงานปกติ หลังสายเช้า'
  FROM employees_for_seed
  WHERE rn % 10 = 6

  UNION ALL

  -- สายบ่าย 4 นาที: 13:04 ไทย = 06:04 UTC
  SELECT
    'att_real_20260602_' || rn || '_morning_ok_afternoon_late',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 01:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: เข้าเช้าปกติ ก่อนสายบ่าย'
  FROM employees_for_seed
  WHERE rn % 10 = 7

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_afternoon_late_1304',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 06:04:00',
    'WEB'::"AttendanceChannel",
    'LATE'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: สายบ่าย 4 นาที'
  FROM employees_for_seed
  WHERE rn % 10 = 7

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_checkout_ok_afternoon_late',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 10:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: ออกงานปกติ หลังสายบ่าย'
  FROM employees_for_seed
  WHERE rn % 10 = 7

  UNION ALL

  -- สายทั้งเช้าและบ่าย: 08:08 / 13:03 ไทย = 01:08 / 06:03 UTC
  SELECT
    'att_real_20260602_' || rn || '_morning_late_0808',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 01:08:00',
    'WEB'::"AttendanceChannel",
    'LATE'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: สายเช้า 8 นาที'
  FROM employees_for_seed
  WHERE rn % 10 = 8

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_afternoon_late_1303',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 06:03:00',
    'WEB'::"AttendanceChannel",
    'LATE'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: สายบ่าย 3 นาที'
  FROM employees_for_seed
  WHERE rn % 10 = 8

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_checkout_ok_late_both',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 10:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: ออกงานปกติ หลังสายทั้งสองรอบ'
  FROM employees_for_seed
  WHERE rn % 10 = 8

  UNION ALL

  -- ลืมเข้าเช้า
  SELECT
    'att_real_20260602_' || rn || '_afternoon_only_missing_morning',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 06:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: ลืมเข้าเช้า'
  FROM employees_for_seed
  WHERE rn % 10 = 9

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_checkout_missing_morning',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_OUT'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 10:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'EVENING',
    'SEED 02/06/2569: ออกงานปกติ แต่ลืมเข้าเช้า'
  FROM employees_for_seed
  WHERE rn % 10 = 9

  UNION ALL

  -- ลืมออกงาน
  SELECT
    'att_real_20260602_' || rn || '_morning_missing_checkout',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 01:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'MORNING',
    'SEED 02/06/2569: เข้าเช้าปกติ แต่ลืมออกงาน'
  FROM employees_for_seed
  WHERE rn % 10 = 0

  UNION ALL

  SELECT
    'att_real_20260602_' || rn || '_afternoon_missing_checkout',
    "employeeId",
    DATE '2026-06-02',
    'CHECK_IN'::"AttendanceLogType",
    TIMESTAMP '2026-06-02 06:00:00',
    'WEB'::"AttendanceChannel",
    'NORMAL'::"AttendanceLogStatus",
    'WEB',
    'AFTERNOON',
    'SEED 02/06/2569: เข้าบ่ายปกติ แต่ลืมออกงาน'
  FROM employees_for_seed
  WHERE rn % 10 = 0
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
