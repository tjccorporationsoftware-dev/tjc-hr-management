/**
 * กติการหัสพนักงาน — ต้องตรงกับ backend/src/modules/employees/utils/employee-code.util.ts
 *
 * อักษรอังกฤษ (พิมพ์เล็ก/ใหญ่) กับตัวเลขเท่านั้น เพราะรหัสนี้ใช้เป็นชื่อผู้ใช้ล็อกอิน
 * ฝั่งเว็บตรวจก่อนส่งเพื่อให้ฟ้องได้ทันทีที่ช่อง ส่วน backend ตรวจซ้ำเป็นด่านจริง
 */
export const EMPLOYEE_CODE_PATTERN = /^[A-Za-z0-9]+$/;
export const EMPLOYEE_CODE_MAX_LENGTH = 20;
export const EMPLOYEE_CODE_RULE_MESSAGE =
  "รหัสพนักงานต้องเป็นตัวอักษรภาษาอังกฤษหรือตัวเลขเท่านั้น (ไม่มีเว้นวรรคหรืออักขระพิเศษ)";

export function isValidEmployeeCode(value: string) {
  const code = value.trim();
  return (
    code.length > 0 &&
    code.length <= EMPLOYEE_CODE_MAX_LENGTH &&
    EMPLOYEE_CODE_PATTERN.test(code)
  );
}
