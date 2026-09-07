"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  EmployeePicker,
  type PickerEmployee,
} from "@/components/common/employee-picker";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  Field,
  FieldGrid,
  Modal,
  ModalActions,
  Notice,
  Select,
  TextInput,
  Textarea,
} from "@/components/kit";

import type { OrganizationOption } from "@/types/employee";
import type {
  CreateEmployeeTransferForm,
  CreateEmployeeTransferPayload,
} from "@/types/employee-transfer";

export type TransferOptions = {
  branches: OrganizationOption[];
  departments: OrganizationOption[];
  divisions: OrganizationOption[];
  positions: OrganizationOption[];
  employeeTypes: OrganizationOption[];
};

/**
 * ฟอร์มออกใบโยกย้าย/ปรับตำแหน่ง
 * -----------------------------
 * ทุกช่องปลายทางว่างได้ — ว่าง = ไม่เปลี่ยนช่องนั้น ใบเดียวจึงเปลี่ยนพร้อมกัน
 * ได้หลายอย่าง (ย้ายสาขาพร้อมเลื่อนตำแหน่ง) หรือเปลี่ยนอย่างเดียวก็ได้
 *
 * แถบ "สังกัดปัจจุบัน" ต้องอยู่ในฟอร์ม ไม่ใช่ให้ไปเปิดดูอีกหน้า เพราะคนกรอก
 * ต้องเห็นว่ากำลังย้ายจากไหนไปไหนก่อนกดบันทึก ไม่งั้นเลือกปลายทางผิดคน
 */
export function CreateTransferModal({
  open,
  options,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  options: TransferOptions;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateEmployeeTransferPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateEmployeeTransferForm>(emptyForm);
  const [employee, setEmployee] = useState<PickerEmployee | null>(null);
  const [error, setError] = useState("");

  function setField<K extends keyof CreateEmployeeTransferForm>(
    key: K,
    value: CreateEmployeeTransferForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function close() {
    setForm(emptyForm);
    setEmployee(null);
    setError("");
    onClose();
  }

  /*
   * ฝ่ายผูกกับแผนกเสมอ จึงเหลือเฉพาะฝ่ายของแผนกปลายทางที่เลือกไว้
   * ยังไม่เลือกแผนก = ไม่มีฝ่ายให้เลือก (ช่องฝ่ายถูกปิดไว้อยู่แล้ว)
   */
  const divisionOptions = useMemo(() => {
    if (!form.toDepartmentId) return [];

    return options.divisions.filter(
      (division) => division.departmentId === form.toDepartmentId,
    );
  }, [form.toDepartmentId, options.divisions]);

  const changedCount = countChanges(form);

  async function submit() {
    if (!form.employeeId) {
      setError("กรุณาเลือกพนักงานที่จะโยกย้าย");
      return;
    }

    if (!form.effectiveDate) {
      setError("กรุณาระบุวันที่มีผล");
      return;
    }

    if (changedCount === 0) {
      setError("กรุณาระบุปลายทางอย่างน้อยหนึ่งอย่าง (สาขา แผนก ฝ่าย ตำแหน่ง ประเภท หรือหัวหน้างาน)");
      return;
    }

    setError("");
    await onSubmit(buildPayload(form));
    setForm(emptyForm);
    setEmployee(null);
  }

  return (
    <Modal
      open={open}
      title="ออกใบโยกย้าย/ปรับตำแหน่ง"
      description="ตั้งวันที่มีผลล่วงหน้าได้ ระบบจะอัปเดตทะเบียนพนักงานให้เองเมื่อถึงวัน"
      size="md-wide"
      onClose={close}
      footer={
        <ModalActions
          onCancel={close}
          onConfirm={() => void submit()}
          confirmLabel="บันทึกใบโยกย้าย"
          loading={loading}
        />
      }
    >
      <div className="space-y-5">
        {error ? <Notice tone="critical">{error}</Notice> : null}

        <FormSection title="ย้ายใคร มีผลวันไหน">
          <FieldGrid columns={2}>
            <Field label="พนักงาน" required>
            <EmployeePicker
              value={form.employeeId}
              onChange={(id, picked) => {
                setField("employeeId", id);
                setEmployee(picked);
              }}
                placeholder="ค้นหาชื่อหรือรหัสพนักงาน"
              />
            </Field>

            <Field label="วันที่มีผล" required hint="ตั้งเป็นวันในอนาคตได้">
              <ThaiDateInput
                value={form.effectiveDate}
                onChange={(event) =>
                  setField("effectiveDate", event.target.value)
                }
              />
            </Field>
          </FieldGrid>

          {/* สังกัดปัจจุบันของคนที่เลือก — ไว้เทียบกับปลายทางที่กำลังจะกรอก */}
          {employee ? (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[12px] text-slate-500">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                สังกัดปัจจุบัน
              </span>
              <span className="font-semibold text-slate-700">
                {[
                  employee.branch?.nameTh,
                  employee.department?.nameTh,
                  employee.position,
                ]
                  .filter(Boolean)
                  .join(" · ") || "ยังไม่ได้ระบุสังกัด"}
              </span>
            </p>
          ) : null}
        </FormSection>

        <FormSection
          title="ย้ายไปที่ไหน"
          hint="เว้นว่างไว้แปลว่าไม่เปลี่ยนของเดิม"
        >
          <FieldGrid columns={2}>
            <Field label="สาขาปลายทาง">
              <Select
                value={form.toBranchId}
                onChange={(event) => setField("toBranchId", event.target.value)}
              >
                <option value="">— ไม่เปลี่ยนสาขา —</option>
                {options.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.nameTh}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="แผนกปลายทาง">
              <Select
                value={form.toDepartmentId}
                onChange={(event) => {
                  setField("toDepartmentId", event.target.value);
                  // เปลี่ยนแผนกแล้วฝ่ายเดิมอาจไม่ได้อยู่ใต้แผนกใหม่ ต้องล้างทิ้ง
                  setField("toDivisionId", "");
                }}
              >
                <option value="">— ไม่เปลี่ยนแผนก —</option>
                {options.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.nameTh}
                  </option>
                ))}
              </Select>
            </Field>

            {/*
              ต้องเลือกแผนกปลายทางก่อนถึงจะเลือกฝ่ายได้
              ฝ่ายผูกกับแผนกเสมอ ถ้าปล่อยให้เลือกฝ่ายลอย ๆ จะย้ายคนไปอยู่ฝ่าย
              ที่ไม่ได้อยู่ใต้แผนกของตัวเอง — ฟอร์มแก้ทะเบียนกันกรณีนี้ไว้แล้ว
              ที่นี่ก็ต้องกันด้วย ไม่งั้นใบโยกย้ายจะเป็นทางลัดสร้างข้อมูลที่ขัดกันเอง
              ย้ายเฉพาะฝ่ายโดยไม่เปลี่ยนแผนก ให้เลือกแผนกเดิมซ้ำได้
            */}
            <Field
              label="ฝ่ายปลายทาง"
              hint={
                form.toDepartmentId ? undefined : "เลือกแผนกปลายทางก่อน"
              }
            >
              <Select
                value={form.toDivisionId}
                disabled={!form.toDepartmentId}
                onChange={(event) =>
                  setField("toDivisionId", event.target.value)
                }
              >
                <option value="">— ไม่เปลี่ยนฝ่าย —</option>
                {divisionOptions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.nameTh}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ตำแหน่งปลายทาง">
              <Select
                value={form.toPositionId}
                onChange={(event) =>
                  setField("toPositionId", event.target.value)
                }
              >
                <option value="">— ไม่เปลี่ยนตำแหน่ง —</option>
                {options.positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.nameTh}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ประเภทพนักงานปลายทาง">
              <Select
                value={form.toEmployeeTypeId}
                onChange={(event) =>
                  setField("toEmployeeTypeId", event.target.value)
                }
              >
                <option value="">— ไม่เปลี่ยนประเภท —</option>
                {options.employeeTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.nameTh}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="หัวหน้างานคนใหม่">
              <EmployeePicker
                value={form.toSupervisorId}
                onChange={(id) => setField("toSupervisorId", id)}
                placeholder="— ไม่เปลี่ยนหัวหน้างาน —"
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="เอกสารอ้างอิง">
          <FieldGrid columns={2}>
            <Field label="เลขที่คำสั่ง" hint="อ้างอิงกับเอกสารตัวจริง">
              <TextInput
                value={form.documentNo}
                onChange={(event) => setField("documentNo", event.target.value)}
                placeholder="เช่น คำสั่งที่ 12/2569"
              />
            </Field>

            <Field label="เหตุผล">
              <TextInput
                value={form.reason}
                onChange={(event) => setField("reason", event.target.value)}
                placeholder="เช่น ขยายสาขาใหม่"
              />
            </Field>
          </FieldGrid>

          <Field label="หมายเหตุ" className="mt-3">
            <Textarea
              value={form.note}
              onChange={(event) => setField("note", event.target.value)}
              placeholder="รายละเอียดเพิ่มเติมที่อยากให้คนอ่านย้อนหลังเห็น"
            />
          </Field>
        </FormSection>
      </div>
    </Modal>
  );
}

/** หัวข้อย่อยในฟอร์ม — ป้ายกำกับสีฟ้าคั่นด้วยเส้นบาง ชุดเดียวกับฟอร์มอื่นในระบบ */
function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 border-b border-brand-100 pb-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {title}
        </p>
        {hint ? (
          <p className="text-[11.5px] text-slate-400">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const emptyForm: CreateEmployeeTransferForm = {
  employeeId: "",
  effectiveDate: "",
  toBranchId: "",
  toDepartmentId: "",
  toDivisionId: "",
  toPositionId: "",
  toEmployeeTypeId: "",
  toSupervisorId: "",
  documentNo: "",
  reason: "",
  note: "",
};

function countChanges(form: CreateEmployeeTransferForm) {
  return [
    form.toBranchId,
    form.toDepartmentId,
    form.toDivisionId,
    form.toPositionId,
    form.toEmployeeTypeId,
    form.toSupervisorId,
  ].filter(Boolean).length;
}

/**
 * ตัดช่องที่เว้นว่างออกก่อนส่ง
 *
 * หลังบ้านแยก "ไม่ส่งมา" (ไม่เปลี่ยน) ออกจาก "ส่งค่าว่างมา" (ถอดออก)
 * ถ้าส่งช่องว่างไปทั้งชุด ทุกช่องที่ไม่ได้กรอกจะกลายเป็นการสั่งถอดสังกัดทิ้ง
 */
function buildPayload(
  form: CreateEmployeeTransferForm,
): CreateEmployeeTransferPayload {
  const payload: CreateEmployeeTransferPayload = {
    employeeId: form.employeeId,
    effectiveDate: form.effectiveDate,
  };

  if (form.toBranchId) payload.toBranchId = form.toBranchId;
  if (form.toDepartmentId) payload.toDepartmentId = form.toDepartmentId;
  if (form.toDivisionId) payload.toDivisionId = form.toDivisionId;
  if (form.toPositionId) payload.toPositionId = form.toPositionId;
  if (form.toEmployeeTypeId) payload.toEmployeeTypeId = form.toEmployeeTypeId;
  if (form.toSupervisorId) payload.toSupervisorId = form.toSupervisorId;
  if (form.documentNo.trim()) payload.documentNo = form.documentNo.trim();
  if (form.reason.trim()) payload.reason = form.reason.trim();
  if (form.note.trim()) payload.note = form.note.trim();

  return payload;
}
