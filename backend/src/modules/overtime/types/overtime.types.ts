/*
 * Shared types for the overtime module.
 *
 * Keep small cross-file types here so controller/service/helper files do not
 * redefine the same shapes repeatedly. This makes later maintenance easier and
 * reduces the chance of type drift between files.
 */

export type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
};

export type OvertimeWorkTypeValue = 'WORKDAY' | 'HOLIDAY' | 'SPECIAL_HOLIDAY';

export type ResolvedOvertimeApprover = {
  expectedApproverId: string;
  expectedEmployeeId: string | null;
};
