-- ใช้ตรวจว่าพนักงานที่ยื่นลา match กับ LeavePolicy หรือไม่
-- แก้ email / employee code / leave type name ตามข้อมูลที่ต้องตรวจ
SELECT
  e.id AS employee_id,
  e."employeeCode" AS employee_code,
  u.email,
  e."companyId" AS employee_company_id,
  c."nameTh" AS employee_company,
  e."employeeTypeId" AS employee_type_id,
  et."nameTh" AS employee_type,
  lt.id AS leave_type_id,
  lt.code AS leave_type_code,
  lt."nameTh" AS leave_type_name,
  lp.id AS policy_id,
  lp."employeeTypeId" AS policy_employee_type_id,
  pet."nameTh" AS policy_employee_type,
  lp."annualQuotaDays",
  lp.status AS policy_status
FROM employees e
LEFT JOIN users u ON u.id = e."userId"
LEFT JOIN companies c ON c.id = e."companyId"
LEFT JOIN employee_types et ON et.id = e."employeeTypeId"
JOIN leave_types lt ON lt."companyId" = e."companyId" AND lt."deletedAt" IS NULL
LEFT JOIN leave_policies lp ON lp."companyId" = e."companyId"
  AND lp."leaveTypeId" = lt.id
  AND lp."deletedAt" IS NULL
LEFT JOIN employee_types pet ON pet.id = lp."employeeTypeId"
WHERE e."deletedAt" IS NULL
  AND lt."nameTh" = 'ลาพักร้อน'
ORDER BY e."employeeCode", lp."employeeTypeId" NULLS LAST;
