-- ข้อมูลใบสมัครที่ขาดไป — ทุกคอลัมน์ nullable ใบสมัครเดิมจึงไม่กระทบ
ALTER TABLE "job_applications"
  ADD COLUMN IF NOT EXISTS "nationalId" TEXT,
  ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "currentCompany" TEXT,
  ADD COLUMN IF NOT EXISTS "currentSalary" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "yearsOfExperience" INTEGER,
  ADD COLUMN IF NOT EXISTS "educationLevel" TEXT,
  ADD COLUMN IF NOT EXISTS "educationInstitute" TEXT,
  ADD COLUMN IF NOT EXISTS "educationMajor" TEXT,
  ADD COLUMN IF NOT EXISTS "resumeUrl" TEXT;
