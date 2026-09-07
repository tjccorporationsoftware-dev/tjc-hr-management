-- ผู้ประเมินที่บันทึกไว้กับใบประเมินแต่ละใบ
-- อ้าง employee ให้ตรงกับผู้ประเมินที่ตั้งไว้ในแบบฟอร์ม (EvaluationFormEvaluator ก็อ้าง employee)
ALTER TABLE "evaluation_results"
  ADD COLUMN IF NOT EXISTS "evaluatorEmployeeId" TEXT;

ALTER TABLE "evaluation_results"
  ADD CONSTRAINT "evaluation_results_evaluatorEmployeeId_fkey"
  FOREIGN KEY ("evaluatorEmployeeId") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "evaluation_results_evaluatorEmployeeId_idx"
  ON "evaluation_results"("evaluatorEmployeeId");
