-- เพิ่มวันที่ผ่านทดลองงานไว้ที่ตัวพนักงาน เพื่อให้หน้า /employees/[id] อ่านได้โดยตรง
ALTER TABLE "employees" ADD COLUMN "probationPassedAt" TIMESTAMP(3);

-- เติมย้อนหลังจากใบทดลองงานที่รีวิวผ่านไปแล้ว (เอาใบล่าสุดของแต่ละคน)
UPDATE "employees" AS e
SET "probationPassedAt" = p."reviewedAt"
FROM (
  SELECT DISTINCT ON ("employeeId") "employeeId", "reviewedAt"
  FROM "probation_records"
  WHERE "status" = 'PASSED'
    AND "reviewedAt" IS NOT NULL
    AND "deletedAt" IS NULL
  ORDER BY "employeeId", "reviewedAt" DESC
) AS p
WHERE e."id" = p."employeeId";
