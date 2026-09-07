/*
 * เลือกนโยบาย OT ที่ใช้กับพนักงานคนหนึ่งในวันประเภทหนึ่ง
 *
 * กติกาเดียวกับตอน payroll คิดเงินจริง (`payroll-handoff-import.service`):
 * นโยบายที่ระบุสาขาไว้ชนะนโยบายที่ระบุแค่ประเภทพนักงาน และนโยบายที่ระบุสาขา
 * หรือประเภทไม่ตรงกับคนนั้นถือว่า "ใช้ไม่ได้" ไม่ใช่ของสำรอง
 *
 * แยกออกมาเป็นตัวกลางเพราะเดิมสามที่คิดคนละแบบ ทั้งที่อ่านตารางเดียวกัน —
 * payroll ให้คะแนนสาขา 2 ประเภท 1, จอค่าจ้างรายวันไล่สี่ชั้นด้วยมือ, ส่วนหน้า
 * preview ของ HR ไม่ดูสาขาเลยแล้วเก็บ "ตัวแรกที่เจอ" จากรายการที่เรียงอัตรา
 * จากน้อยไปมาก ซึ่งแปลว่าได้อัตราต่ำสุดเสมอเมื่อบริษัทตั้งนโยบายรายสาขา
 */

export interface OvertimePolicyScope {
  branchId?: string | null;
  companyId?: string | null;
  employeeTypeId?: string | null;
  workType: string;
}

export interface OvertimePolicyLike {
  branchId?: string | null;
  companyId?: string | null;
  employeeTypeId?: string | null;
  workType: unknown;
}

/**
 * คืนนโยบายที่เจาะจงที่สุดที่ใช้กับคนนี้ได้ หรือ `null` เมื่อไม่มีเลย
 *
 * `null` แปลว่า "ยังไม่ได้ตั้งนโยบายให้คนกลุ่มนี้" ผู้เรียกต้องบอกผู้ใช้
 * ไม่ใช่เดาอัตราขั้นต่ำตามกฎหมายแทน — เดาแล้วยอดจะไม่ตรงกับสลิปที่ payroll
 * ออกให้ และไม่มีอะไรบนจอบอกว่าตัวเลขนั้นมาจากการเดา
 */
export function pickOvertimePolicy<T extends OvertimePolicyLike>(
  policies: T[],
  scope: OvertimePolicyScope,
): T | null {
  const usable = policies.filter((policy) => {
    if (String(policy.workType) !== scope.workType) return false;
    if (
      scope.companyId &&
      policy.companyId &&
      policy.companyId !== scope.companyId
    ) {
      return false;
    }
    if (policy.branchId && policy.branchId !== (scope.branchId ?? null)) {
      return false;
    }
    if (
      policy.employeeTypeId &&
      policy.employeeTypeId !== (scope.employeeTypeId ?? null)
    ) {
      return false;
    }

    return true;
  });

  return (
    usable
      .map((policy) => ({
        policy,
        score: (policy.branchId ? 2 : 0) + (policy.employeeTypeId ? 1 : 0),
      }))
      .sort((left, right) => right.score - left.score)[0]?.policy ?? null
  );
}
