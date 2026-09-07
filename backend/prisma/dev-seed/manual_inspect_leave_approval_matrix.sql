-- ตรวจสายอนุมัติใบลาและข้อมูลพนักงานสำหรับ debug UAT/dev
SELECT
  am.id,
  am.code,
  am."nameTh",
  am."targetType",
  am."companyId",
  am."departmentId",
  am."employeeTypeId",
  am.priority,
  am.status,
  COUNT(ams.id) AS active_step_count
FROM approval_matrices am
LEFT JOIN approval_matrix_steps ams
  ON ams."approvalMatrixId" = am.id
 AND ams.status = 'ACTIVE'
 AND ams."deletedAt" IS NULL
WHERE am."targetType" = 'LEAVE_REQUEST'
  AND am."deletedAt" IS NULL
GROUP BY am.id
ORDER BY am.priority ASC, am."createdAt" ASC;
