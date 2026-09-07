-- Add absence fields to AttendanceDailySummary.
-- Absence is used when all required attendance sessions are missing after all sessions are closed.
ALTER TABLE "attendance_daily_summaries"
  ADD COLUMN IF NOT EXISTS "isAbsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "absentDays" DECIMAL(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "absentDeductionAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "attendance_daily_summaries_isAbsent_idx"
  ON "attendance_daily_summaries"("isAbsent");
