UPDATE leave_types
SET
  "allowBackdated" = true,
  "maxBackdatedDays" = 30,
  "backdatedRequiresHrApproval" = true,
  "updatedAt" = NOW()
WHERE code = 'UAT-PAID'
  AND "deletedAt" IS NULL;
