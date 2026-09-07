UPDATE leave_types
SET
  "allowHourly" = true,
  "minLeaveUnitMinutes" = 60,
  "updatedAt" = NOW()
WHERE code = 'UAT-PAID'
  AND "deletedAt" IS NULL;
