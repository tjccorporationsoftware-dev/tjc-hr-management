import type { ComplaintCreatePayload } from './complaints.types';

export interface ComplaintFormState {
  category: string;
  description: string;
  expectation: string;
  note: string;
  title: string;
}

export function emptyComplaintForm(): ComplaintFormState {
  return {
    category: '',
    description: '',
    expectation: '',
    note: '',
    title: '',
  };
}

export function validateComplaintForm(form: ComplaintFormState): string | null {
  if (!form.title.trim()) return 'กรุณาระบุหัวข้อเรื่องร้องเรียน';
  if (form.title.trim().length > 200) return 'หัวข้อต้องไม่เกิน 200 ตัวอักษร';
  if (form.category.trim().length > 100) return 'หมวดหมู่ต้องไม่เกิน 100 ตัวอักษร';
  if (!form.description.trim()) return 'กรุณาระบุรายละเอียดเรื่องร้องเรียน';
  return null;
}

export function buildComplaintPayload(
  form: ComplaintFormState,
): ComplaintCreatePayload {
  return {
    category: form.category.trim() || null,
    description: form.description.trim(),
    expectation: form.expectation.trim() || null,
    note: form.note.trim() || null,
    title: form.title.trim(),
  };
}
