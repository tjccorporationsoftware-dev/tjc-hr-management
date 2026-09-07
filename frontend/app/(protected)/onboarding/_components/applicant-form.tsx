"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";

import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  Field,
  FieldGrid,
  ModalActions,
  Select,
  TextInput,
  Textarea,
} from "@/components/kit";

export type ApplicantDraft = {
  postingId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  nationalId: string;
  birthDate: string;
  address: string;

  currentPosition: string;
  currentCompany: string;
  currentSalary: string;
  yearsOfExperience: string;

  educationLevel: string;
  educationInstitute: string;
  educationMajor: string;

  resumeUrl: string;
  expectedSalary: string;
  availableFrom: string;
  source: string;
  note: string;
};

/**
 * ฟอร์มผู้สมัคร — เปิดจากในกล่องประกาศเสมอ ประกาศจึงถูกล็อกไว้ ไม่ให้เลือกเอง
 * เดิมเป็นดรอปดาวน์ให้เลือกประกาศ ซึ่งเป็นจุดที่บันทึกผิดใบได้ง่ายที่สุด

 */
export function ApplicantForm({
  draft,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: ApplicantDraft;
  saving: boolean;
  onChange: Dispatch<SetStateAction<ApplicantDraft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    /*
     * ฟอร์มแบ่งเป็นหัวข้อย่อย หัวข้อละหนึ่งเรื่อง คั่นด้วยเส้นบาง
     * ไม่มีกล่องครอบซ้อนในกล่อง — ป๊อปอัพเป็นผืนเดียว แบ่งด้วยเส้นเหมือนหน้าอื่น
     *
     * ไม่มีช่อง "สมัครตำแหน่ง" แล้ว เพราะหัวป๊อปอัพบอกรหัสกับชื่อประกาศไว้อยู่แล้ว
     * และผู้ใช้เปิดฟอร์มนี้จากหน้าประกาศใบนั้นโดยตรง
     */
    <div className="space-y-5">
      <FormSection title="ข้อมูลผู้สมัคร">
        <FieldGrid columns={2}>
          <Field label="ชื่อ" required>
            <TextInput
              value={draft.firstName}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, firstName: event.target.value }))
              }
            />
          </Field>

          <Field label="นามสกุล" required>
            <TextInput
              value={draft.lastName}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, lastName: event.target.value }))
              }
            />
          </Field>

          <Field label="อีเมล">
            <TextInput
              type="email"
              value={draft.email}
              placeholder="เช่น name@mail.com"
              onChange={(event) =>
                onChange((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </Field>

          <Field label="เบอร์โทร">
            <TextInput
              value={draft.phone}
              placeholder="เช่น 081-234-5678"
              onChange={(event) =>
                onChange((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </Field>

          <Field label="เลขบัตรประชาชน">
            <TextInput
              value={draft.nationalId}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, nationalId: event.target.value }))
              }
              placeholder="13 หลัก"
            />
          </Field>

          <Field label="วันเกิด">
            <ThaiDateInput
              value={draft.birthDate}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, birthDate: event.target.value }))
              }
              aria-label="วันเกิด"
            />
          </Field>

          <Field label="ที่อยู่" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={draft.address}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, address: event.target.value }))
              }
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="ประวัติการทำงาน">
        <FieldGrid columns={2}>
          <Field label="ตำแหน่งปัจจุบัน">
            <TextInput
              value={draft.currentPosition}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  currentPosition: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="บริษัทปัจจุบัน">
            <TextInput
              value={draft.currentCompany}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  currentCompany: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="เงินเดือนปัจจุบัน (บาท)">
            <TextInput
              type="number"
              min={0}
              value={draft.currentSalary}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  currentSalary: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="ประสบการณ์ (ปี)">
            <TextInput
              type="number"
              min={0}
              value={draft.yearsOfExperience}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  yearsOfExperience: event.target.value,
                }))
              }
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="การศึกษา">
        <FieldGrid columns={3}>
          <Field label="วุฒิการศึกษา">
            <Select
              value={draft.educationLevel}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  educationLevel: event.target.value,
                }))
              }
            >
              <option value="">ไม่ระบุ</option>
              <option value="ต่ำกว่ามัธยมปลาย">ต่ำกว่ามัธยมปลาย</option>
              <option value="มัธยมปลาย / ปวช.">มัธยมปลาย / ปวช.</option>
              <option value="ปวส. / อนุปริญญา">ปวส. / อนุปริญญา</option>
              <option value="ปริญญาตรี">ปริญญาตรี</option>
              <option value="ปริญญาโท">ปริญญาโท</option>
              <option value="ปริญญาเอก">ปริญญาเอก</option>
            </Select>
          </Field>

          <Field label="สถาบัน">
            <TextInput
              value={draft.educationInstitute}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  educationInstitute: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="สาขา">
            <TextInput
              value={draft.educationMajor}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  educationMajor: event.target.value,
                }))
              }
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="เงื่อนไขการเข้าทำงาน">
        <FieldGrid columns={3}>
          <Field label="เงินเดือนที่ต้องการ (บาท)">
            <TextInput
              type="number"
              min={0}
              value={draft.expectedSalary}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  expectedSalary: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="เริ่มงานได้วันที่">
            <ThaiDateInput
              value={draft.availableFrom}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  availableFrom: event.target.value,
                }))
              }
              aria-label="เริ่มงานได้วันที่"
            />
          </Field>

          <Field label="ช่องทางที่มา">
            <TextInput
              value={draft.source}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, source: event.target.value }))
              }
              placeholder="เช่น JobsDB / พนักงานแนะนำ"
            />
          </Field>

          <Field label="ลิงก์เรซูเม่ / แฟ้มผลงาน" className="sm:col-span-2">
            <TextInput
              value={draft.resumeUrl}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, resumeUrl: event.target.value }))
              }
              placeholder="วางลิงก์ Google Drive หรือ URL ไฟล์"
            />
          </Field>

          <Field label="หมายเหตุ" className="sm:col-span-2 xl:col-span-3">
            <Textarea
              rows={2}
              value={draft.note}
              placeholder="เช่น ว่างสัมภาษณ์เฉพาะช่วงเย็น"
              onChange={(event) =>
                onChange((prev) => ({ ...prev, note: event.target.value }))
              }
            />
          </Field>
        </FieldGrid>
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-brand-100 pt-4">
        <ModalActions
          onCancel={onCancel}
          onConfirm={onSubmit}
          confirmLabel="บันทึกผู้สมัคร"
          loading={saving}
        />
      </div>
    </div>
  );
}

/** หัวข้อย่อยในฟอร์ม — ป้ายกำกับสีฟ้าคั่นด้วยเส้นบาง ชุดเดียวกับฟอร์มสร้างประกาศ */
function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
        {title}
      </p>
      {children}
    </section>
  );
}
