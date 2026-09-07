-- 1) รอบประเมินเปลี่ยนจากข้อความอิสระเป็น enum
CREATE TYPE "EvaluationPeriodType" AS ENUM ('PROBATION', 'ANNUAL', 'HALF_YEAR', 'QUARTER', 'CUSTOM');

ALTER TABLE "evaluation_forms" ADD COLUMN "periodTypeEnum" "EvaluationPeriodType";

-- แปลงค่าเดิม รองรับทั้งรหัสอังกฤษและข้อความไทยที่เคยพิมพ์ไว้
UPDATE "evaluation_forms"
SET "periodTypeEnum" = CASE
  WHEN "periodType" IS NULL OR btrim("periodType") = '' THEN NULL
  WHEN upper("periodType") = 'PROBATION' OR "periodType" LIKE '%ทดลองงาน%' THEN 'PROBATION'::"EvaluationPeriodType"
  WHEN upper("periodType") = 'ANNUAL' OR "periodType" LIKE '%รายปี%' OR "periodType" LIKE '%ประจำปี%' THEN 'ANNUAL'::"EvaluationPeriodType"
  WHEN upper("periodType") = 'HALF_YEAR' OR "periodType" LIKE '%ครึ่งปี%' THEN 'HALF_YEAR'::"EvaluationPeriodType"
  WHEN upper("periodType") = 'QUARTER' OR "periodType" LIKE '%ไตรมาส%' THEN 'QUARTER'::"EvaluationPeriodType"
  ELSE 'CUSTOM'::"EvaluationPeriodType"
END;

ALTER TABLE "evaluation_forms" DROP COLUMN "periodType";
ALTER TABLE "evaluation_forms" RENAME COLUMN "periodTypeEnum" TO "periodType";

-- 2) ผูกผลประเมินเข้ากับใบทดลองงาน
ALTER TABLE "evaluation_results" ADD COLUMN "probationRecordId" TEXT;

CREATE INDEX "evaluation_results_probationRecordId_idx"
  ON "evaluation_results"("probationRecordId");

ALTER TABLE "evaluation_results"
  ADD CONSTRAINT "evaluation_results_probationRecordId_fkey"
  FOREIGN KEY ("probationRecordId") REFERENCES "probation_records"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
