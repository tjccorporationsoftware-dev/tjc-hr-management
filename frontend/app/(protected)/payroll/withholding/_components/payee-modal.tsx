"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldGrid,
  Modal,
  ModalActions,
  Select,
  TextInput,
  Textarea,
} from "@/components/kit";
import { errorText } from "@/lib/payroll-format";
import type { WithholdingPayee } from "@/lib/api";

/**
 * เพิ่ม/แก้ไขผู้รับเงินที่ไม่ใช่ลูกจ้าง
 *
 * บุคคลธรรมดากรอกคำนำหน้า/ชื่อ/สกุลแยกช่อง เพราะใบแนบ ภ.ง.ด.3 มีช่องแยกจริง
 * ถ้าเก็บรวมช่องเดียวแล้วมาตัดสตริงตอนพิมพ์ จะพลาดกับชื่อที่มีหลายพยางค์
 */
export function PayeeModal({
  companyId,
  payee,
  onClose,
  onSaved,
  onSubmit,
}: {
  companyId: string;
  payee: WithholdingPayee | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    type: payee?.type ?? "INDIVIDUAL",
    taxId: payee?.taxId ?? "",
    branchNo: payee?.branchNo ?? "00000",
    title: payee?.title ?? "",
    firstName: payee?.firstName ?? "",
    lastName: payee?.lastName ?? "",
    name: payee?.name ?? "",
    address: payee?.address ?? "",
    phone: payee?.phone ?? "",
    note: payee?.note ?? "",
  });
  const [saving, setSaving] = useState(false);

  const individual = form.type === "INDIVIDUAL";

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);

    try {
      await onSubmit({
        companyId,
        type: form.type,
        taxId: form.taxId.replace(/\D/g, ""),
        branchNo: form.branchNo || "00000",
        title: individual ? form.title || undefined : undefined,
        firstName: individual ? form.firstName || undefined : undefined,
        lastName: individual ? form.lastName || undefined : undefined,
        name: individual ? undefined : form.name,
        address: form.address || undefined,
        phone: form.phone || undefined,
        note: form.note || undefined,
      });

      toast.success(payee ? "บันทึกการแก้ไขแล้ว" : "เพิ่มผู้รับเงินแล้ว");
      await onSaved();
    } catch (error) {
      toast.error(errorText(error, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={payee ? "แก้ไขผู้รับเงิน" : "เพิ่มผู้รับเงิน"}
      description="ข้อมูลชุดนี้จะถูกพิมพ์ลงใบแนบ ภ.ง.ด.3 โดยตรง"
      size="md"
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void save()}
          loading={saving}
        />
      }
    >
      <FieldGrid>
        <Field
          label="ประเภทผู้รับเงิน"
          hint="บุคคลธรรมดายื่น ภ.ง.ด.3 · นิติบุคคลยื่น ภ.ง.ด.53"
        >
          <Select
            value={form.type}
            onChange={(event) =>
              update("type", event.target.value as typeof form.type)
            }
          >
            <option value="INDIVIDUAL">บุคคลธรรมดา</option>
            <option value="JURISTIC">นิติบุคคล</option>
          </Select>
        </Field>

        <Field label="เลขประจำตัวผู้เสียภาษี" hint="13 หลัก ตัวเลขล้วน">
          <TextInput
            value={form.taxId}
            inputMode="numeric"
            onChange={(event) =>
              update(
                "taxId",
                event.target.value.replace(/\D/g, "").slice(0, 13),
              )
            }
            placeholder="1234567890123"
          />
        </Field>

        {individual ? (
          <>
            <Field label="คำนำหน้า">
              <TextInput
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="นาย / นาง / นางสาว"
              />
            </Field>
            <Field label="ชื่อ">
              <TextInput
                value={form.firstName}
                onChange={(event) => update("firstName", event.target.value)}
              />
            </Field>
            <Field label="นามสกุล">
              <TextInput
                value={form.lastName}
                onChange={(event) => update("lastName", event.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="ชื่อนิติบุคคล">
              <TextInput
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="บริษัท ... จำกัด"
              />
            </Field>
            <Field label="สาขาที่" hint="สำนักงานใหญ่ = 00000">
              <TextInput
                value={form.branchNo}
                inputMode="numeric"
                onChange={(event) =>
                  update(
                    "branchNo",
                    event.target.value.replace(/\D/g, "").slice(0, 5),
                  )
                }
              />
            </Field>
          </>
        )}

        <Field label="เบอร์โทร">
          <TextInput
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </Field>
      </FieldGrid>

      <Field
        label="ที่อยู่"
        hint="ใบแนบ ภ.ง.ด.3 มีช่องที่อยู่ ถ้าเว้นไว้แบบฟอร์มจะพิมพ์ช่องว่าง"
      >
        <Textarea
          value={form.address}
          rows={2}
          onChange={(event) => update("address", event.target.value)}
          placeholder="เลขที่ หมู่ที่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
        />
      </Field>

      <Field label="หมายเหตุ">
        <Textarea
          value={form.note}
          rows={2}
          onChange={(event) => update("note", event.target.value)}
        />
      </Field>
    </Modal>
  );
}
