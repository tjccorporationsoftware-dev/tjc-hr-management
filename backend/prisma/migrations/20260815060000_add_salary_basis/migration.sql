-- ฐานของค่าจ้าง: ต่อเดือน / ต่อวัน / ต่อชั่วโมง
--
-- ก่อนมีคอลัมน์นี้ ระบบเหมาว่า baseSalary เป็นค่าจ้างรายเดือนเสมอ แล้วหารด้วย
-- salaryDivisorDays (30) ทุกครั้งที่หาอัตราต่อวัน/ต่อชั่วโมง
-- พนักงานรายวันที่ได้ค่าแรงวันละ 500 จึงถูกคิดอัตรา OT เป็น 500/30/8 = 2.08 บาท
-- ต่อชั่วโมง แทนที่จะเป็น 500/8 = 62.50 บาท — ต่างกัน 30 เท่า
--
-- ค่าเริ่มต้น MONTHLY ทำให้ข้อมูลเดิมทั้งหมดคำนวณเหมือนเดิมทุกประการ

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalaryBasis') THEN
    CREATE TYPE "SalaryBasis" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY');
  END IF;
END $$;

ALTER TABLE "employee_compensations"
  ADD COLUMN IF NOT EXISTS "salaryBasis" "SalaryBasis" NOT NULL DEFAULT 'MONTHLY';
