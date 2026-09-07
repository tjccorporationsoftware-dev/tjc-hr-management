export type PayrollRunAction =
  "calculate" | "review" | "approve" | "paid" | "cancel";

export function hasPermission(
  userPermissions: string[] | undefined | null,
  permission: string,
) {
  return Boolean(userPermissions?.includes(permission));
}

export function canCalculatePayroll(
  userPermissions: string[] | undefined | null,
) {
  return hasPermission(userPermissions, "PAYROLL_CALCULATE");
}

export function canApprovePayroll(
  userPermissions: string[] | undefined | null,
) {
  return hasPermission(userPermissions, "PAYROLL_APPROVE");
}

export function canManagePayrollPayment(
  userPermissions: string[] | undefined | null,
) {
  return hasPermission(userPermissions, "PAYROLL_PAYMENT_MANAGE");
}

export function canManagePayrollPeriod(
  userPermissions: string[] | undefined | null,
) {
  return hasPermission(userPermissions, "PAYROLL_PERIOD_MANAGE");
}

export function canManagePayrollMaster(
  userPermissions: string[] | undefined | null,
) {
  return hasPermission(userPermissions, "PAYROLL_MANAGE");
}

export function canManagePayrollCompensation(
  userPermissions: string[] | undefined | null,
) {
  return hasPermission(userPermissions, "PAYROLL_COMPENSATION_MANAGE");
}

export function canViewPayslip(userPermissions: string[] | undefined | null) {
  return hasPermission(userPermissions, "PAYROLL_SLIP_VIEW");
}

export function canRunPayrollAction(
  status: string,
  action: PayrollRunAction,
  userPermissions: string[] | undefined | null,
) {
  if (action === "calculate") {
    return (
      canCalculatePayroll(userPermissions) &&
      ["DRAFT", "FAILED"].includes(status)
    );
  }

  if (action === "review") {
    return canApprovePayroll(userPermissions) && status === "CALCULATED";
  }

  if (action === "approve") {
    return canApprovePayroll(userPermissions) && status === "REVIEWED";
  }

  if (action === "paid") {
    return canManagePayrollPayment(userPermissions) && status === "APPROVED";
  }

  if (action === "cancel") {
    return (
      canCalculatePayroll(userPermissions) &&
      ["DRAFT", "CALCULATING", "CALCULATED", "REVIEWED", "FAILED"].includes(
        status,
      )
    );
  }

  return false;
}
