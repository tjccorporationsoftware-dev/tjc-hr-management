-- Inspect current pending leave approval steps and expected approver mapping.
-- Use this in dev/UAT only.
SELECT
  lr.id AS leave_request_id,
  lr."requestNo" AS request_no,
  lr.status AS request_status,
  requester."employeeCode" AS requester_code,
  COALESCE(requester."displayName", requester."firstName" || ' ' || requester."lastName") AS requester_name,
  supervisor."employeeCode" AS requester_supervisor_code,
  COALESCE(supervisor."displayName", supervisor."firstName" || ' ' || supervisor."lastName") AS requester_supervisor_name,
  las."stepNo" AS step_no,
  las."nameTh" AS step_name,
  las."approverType" AS approver_type,
  las.status AS step_status,
  las."expectedApproverId" AS expected_user_id,
  expected_user.email AS expected_user_email,
  expected_employee."employeeCode" AS expected_employee_code,
  COALESCE(expected_employee."displayName", expected_employee."firstName" || ' ' || expected_employee."lastName") AS expected_employee_name,
  expected_employee."userId" AS expected_employee_user_id
FROM leave_requests lr
JOIN employees requester ON requester.id = lr."employeeId"
LEFT JOIN employees supervisor ON supervisor.id = requester."supervisorId"
JOIN leave_approval_steps las ON las."leaveRequestId" = lr.id
LEFT JOIN users expected_user ON expected_user.id = las."expectedApproverId"
LEFT JOIN employees expected_employee ON expected_employee.id = las."expectedEmployeeId"
WHERE lr.status = 'SUBMITTED'
  AND lr."deletedAt" IS NULL
ORDER BY lr."createdAt" DESC, las."stepNo" ASC;
