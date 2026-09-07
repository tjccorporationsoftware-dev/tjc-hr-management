/**
 * ลำดับอาวุโสจากระดับตำแหน่ง — ใช้ร่วมกันทุกหน้าที่มีรายชื่อพนักงาน
 * ==============================================================
 * ระบบกำหนดระดับตำแหน่งไว้ Level 1 = ผู้บริหารสูงสุด ไล่ลงถึง Level 9 = ชั่วคราว
 * (ดูตัวเลือกระดับตำแหน่งในหน้าโครงสร้างองค์กร) เลขน้อยจึงแปลว่าอาวุโสกว่า
 * และการเรียงจากน้อยไปมากทำให้ผู้บริหารอยู่บนสุดของรายชื่อเสมอ
 *
 * ตำแหน่งที่ยังไม่ตั้งระดับ หรือพนักงานที่ยังไม่ได้ผูกตำแหน่งกับทะเบียนตำแหน่ง
 * จะไปอยู่ท้ายกลุ่ม แทนที่จะแทรกสลับกับคนที่ตั้งระดับไว้แล้ว
 */

export const UNRANKED_POSITION_LEVEL = 99;

export type SeniorityEmployee =
  | {
      positionMaster?: { level?: number | null } | null;
      /** บาง payload ส่งระดับมาเป็นตัวเลขตรง ๆ ไม่ได้ส่งทั้งก้อนตำแหน่ง */
      positionLevel?: number | null;
    }
  | null
  | undefined;

export function getEmployeeSeniorityRank(employee: SeniorityEmployee) {
  const level = employee?.positionMaster?.level ?? employee?.positionLevel;

  return typeof level === "number" && Number.isFinite(level)
    ? level
    : UNRANKED_POSITION_LEVEL;
}

/** ใช้เป็นคีย์เรียงลำดับ: ค่าติดลบ = ฝั่งซ้ายอาวุโสกว่าและต้องอยู่ก่อน */
export function compareEmployeeSeniority(
  left: SeniorityEmployee,
  right: SeniorityEmployee,
) {
  return getEmployeeSeniorityRank(left) - getEmployeeSeniorityRank(right);
}
