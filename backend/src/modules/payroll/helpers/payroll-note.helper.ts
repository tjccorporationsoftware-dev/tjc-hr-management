/**
 * Payroll note helper
 *
 * ใช้ต่อท้ายหมายเหตุของ Payroll Run โดยเก็บ timestamp ทุกครั้ง
 * ทำให้เห็นประวัติการ review/approve/cancel แบบอ่านง่ายโดยไม่ต้องสร้าง table ใหม่ใน phase นี้
 */
export function appendPayrollNote(
  currentNote: string | null | undefined,
  newNote?: string,
) {
  const cleanedNote = newNote?.trim();

  if (!cleanedNote) {
    return currentNote ?? null;
  }

  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${cleanedNote}`;

  return [currentNote, entry].filter(Boolean).join('\n');
}
