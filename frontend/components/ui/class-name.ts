/**
 * รวม className แบบข้ามค่าที่เป็น falsy
 * เดิมฟังก์ชันนี้ถูกเขียนซ้ำใน hr-ui.tsx, manager-ui.tsx และ payroll-ui.tsx
 */
export function joinClassName(
  ...classes: Array<string | undefined | false | null>
) {
  return classes.filter(Boolean).join(" ");
}
