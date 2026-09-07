"use client";

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldGrid,
  Modal,
  ModalActions,
  MoneyInput,
  Select,
  TextInput,
} from "@/components/kit";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { errorText } from "@/lib/payroll-format";
import type {
  WithholdingIncomeType,
  WithholdingPayee,
  WithholdingPayment,
} from "@/lib/api";

/**
 * บันทึก/แก้ไขรายการจ่ายเงินหนึ่งครั้ง = หนึ่งบรรทัดบนใบแนบ ภ.ง.ด.3
 *
 * ภาษีที่หักคำนวณให้อัตโนมัติจากอัตรา แต่แก้ทับได้ เพราะยอดที่หักจริงบางครั้ง
 * ปัดเศษต่างจากที่คูณตรง ๆ และแบบยื่นต้องตรงกับที่จ่ายจริงเสมอ
 */
export function PaymentModal({
  companyId,
  payees,
  incomeTypes,
  payment,
  onClose,
  onSaved,
  onSubmit,
}: {
  companyId: string;
  payees: WithholdingPayee[];
  incomeTypes: WithholdingIncomeType[];
  payment: WithholdingPayment | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    payeeId: payment?.payeeId ?? payees[0]?.id ?? "",
    paidOn:
      payment?.paidOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    incomeTypeCode: payment?.incomeTypeCode ?? incomeTypes[0]?.code ?? "",
    incomeTypeLabel: payment?.incomeTypeLabel ?? incomeTypes[0]?.label ?? "",
    taxRatePercent: payment
      ? String(Number(payment.taxRatePercent))
      : String(incomeTypes[0]?.defaultRate ?? 3),
    amount: payment?.amount ?? "",
    taxAmount: payment?.taxAmount ?? "",
    condition: payment?.condition ?? "WITHHELD",
    reference: payment?.reference ?? "",
    note: payment?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  /** ผู้ใช้แก้ยอดภาษีเองแล้วหรือยัง — ถ้าแก้แล้วห้ามคำนวณทับ */
  const [taxTouched, setTaxTouched] = useState(Boolean(payment));

  const selectedIncomeType = incomeTypes.find(
    (item) => item.code === form.incomeTypeCode,
  );

  const suggestedTax = useMemo(() => {
    const amount = Number(form.amount || 0);
    const rate = Number(form.taxRatePercent || 0);
    if (!amount || !rate) return "";
    return (Math.round(((amount * rate) / 100) * 100) / 100).toFixed(2);
  }, [form.amount, form.taxRatePercent]);

  /* ยอดที่ผู้รับจะได้จริง = ที่จ่าย − ภาษีที่หัก (ใช้ค่าที่กรอกทับถ้ามี) */
  const payoutAmount = Number(form.amount) || 0;
  const payoutTax = Number(taxTouched ? form.taxAmount : suggestedTax) || 0;

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function pickIncomeType(code: string) {
    const type = incomeTypes.find((item) => item.code === code);
    if (!type) return;

    setForm((prev) => ({
      ...prev,
      incomeTypeCode: code,
      incomeTypeLabel: type.label,
      taxRatePercent: String(type.defaultRate),
    }));
    setTaxTouched(false);
  }

  async function save() {
    setSaving(true);

    try {
      await onSubmit({
        companyId,
        payeeId: form.payeeId,
        paidOn: form.paidOn,
        incomeTypeCode: form.incomeTypeCode,
        incomeTypeLabel: form.incomeTypeLabel || undefined,
        taxRatePercent: Number(form.taxRatePercent),
        amount: Number(form.amount),
        taxAmount: Number(taxTouched ? form.taxAmount : suggestedTax),
        condition: form.condition,
        reference: form.reference || undefined,
        note: form.note || undefined,
      });

      toast.success(payment ? "บันทึกการแก้ไขแล้ว" : "บันทึกรายการจ่ายแล้ว");
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
      title={payment ? "แก้ไขรายการจ่าย" : "บันทึกการจ่ายเงิน"}
      description="หนึ่งรายการ = หนึ่งบรรทัดบนใบแนบ ภ.ง.ด.3 จ่ายหลายครั้งในเดือนเดียวกันบันทึกแยกกันได้"
      size="md"
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void save()}
          loading={saving}
          disabled={!form.payeeId || !form.amount || !form.incomeTypeCode}
        />
      }
    >
      {/* แบ่งเป็นหัวข้อย่อยคั่นด้วยเส้นบาง ไม่ใช่ช่องกรอกสิบช่องเรียงติดกันรวด */}
      <div className="space-y-5">
        <FormSection title="ผู้รับเงินและวันที่จ่าย">
          <FieldGrid>
            <Field label="ผู้รับเงิน" required>
              <Select
                value={form.payeeId}
                onChange={(event) => update("payeeId", event.target.value)}
              >
                {payees.length === 0 ? (
                  <option value="">— ยังไม่มีผู้รับเงิน —</option>
                ) : null}
                {payees.map((payee) => (
                  <option key={payee.id} value={payee.id}>
                    {payee.name} · {payee.taxId}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="วันที่จ่าย" required>
              <ThaiDateInput
                value={form.paidOn}
                onChange={(event) => update("paidOn", event.target.value)}
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection
          title="ประเภทเงินได้"
          hint={
            selectedIncomeType?.note ?? "เลือกแล้วอัตราภาษีจะตั้งให้ตามกฎหมาย"
          }
        >
          <FieldGrid>
            <Field label="ประเภทตามแบบ ภ.ง.ด.3" required>
              <Select
                value={form.incomeTypeCode}
                onChange={(event) => pickIncomeType(event.target.value)}
              >
                {/*
                 * ช่องว่างเปล่าอ่านไม่ออกว่าคือ "ยังไม่ได้เลือก" หรือ "โหลดไม่มา"
                 * บอกไปตรง ๆ แบบเดียวกับช่องผู้รับเงิน
                 */}
                {incomeTypes.length === 0 ? (
                  <option value="">— ยังไม่ได้โหลดประเภทเงินได้ —</option>
                ) : null}
                {incomeTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label} · {type.section} · {type.defaultRate}%
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="ข้อความบนแบบฟอร์ม"
              hint="แก้ได้ถ้าต้องระบุให้ชัดกว่ารายการมาตรฐาน"
            >
              <TextInput
                value={form.incomeTypeLabel}
                onChange={(event) =>
                  update("incomeTypeLabel", event.target.value)
                }
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="จำนวนเงินและภาษี">
          <FieldGrid>
            {/* ตัวเลขชิดซ้ายให้ตรงแนวกับทุกช่องในฟอร์ม — ชิดขวาใช้กับตารางที่ต้องอ่านยอดเทียบกัน */}
            <Field label="จำนวนเงินที่จ่าย" required>
              <MoneyInput
                align="left"
                value={form.amount}
                onChange={(event) => {
                  update("amount", event.target.value);
                  setTaxTouched(false);
                }}
              />
            </Field>

            <Field label="อัตราภาษี (%)">
              <TextInput
                value={form.taxRatePercent}
                inputMode="decimal"
                onChange={(event) => {
                  update("taxRatePercent", event.target.value);
                  setTaxTouched(false);
                }}
              />
            </Field>

            <Field
              label="ภาษีที่หัก"
              hint={
                taxTouched
                  ? `คำนวณจากอัตราได้ ${suggestedTax || "-"}`
                  : "คำนวณให้อัตโนมัติ แก้ทับได้"
              }
            >
              <MoneyInput
                align="left"
                value={taxTouched ? form.taxAmount : suggestedTax}
                onChange={(event) => {
                  setTaxTouched(true);
                  update("taxAmount", event.target.value);
                }}
              />
            </Field>

            <Field label="เงื่อนไขการหักภาษี">
              <Select
                value={form.condition}
                onChange={(event) =>
                  update(
                    "condition",
                    event.target.value as typeof form.condition,
                  )
                }
              >
                <option value="WITHHELD">1 — หัก ณ ที่จ่าย</option>
                <option value="PAID_ALWAYS">2 — ผู้จ่ายออกให้ตลอดไป</option>
                <option value="PAID_ONCE">3 — ผู้จ่ายออกให้ครั้งเดียว</option>
              </Select>
            </Field>
          </FieldGrid>

          {/*
            ยอดที่ผู้รับจะได้จริง — เดิมไม่มีที่ไหนบอก ต้องเอาสองช่องมาลบกันเอง
            ทั้งที่เป็นตัวเลขที่ต้องบอกผู้รับเงินตอนโอน
          */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-brand-50/60 px-3.5 py-2.5">
            <p className="text-[12px] text-slate-600 3xl:text-[12.5px]">
              จ่าย{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {payoutAmount.toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="mx-1.5 text-slate-400">−</span>
              ภาษี{" "}
              <span className="font-semibold tabular-nums text-rose-600">
                {payoutTax.toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
            <p className="flex items-baseline gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                ผู้รับได้จริง
              </span>
              <span className="text-[17px] font-bold tabular-nums text-slate-900 3xl:text-[18px]">
                {(payoutAmount - payoutTax).toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
          </div>
        </FormSection>

        <FormSection title="อ้างอิงและหมายเหตุ" hint="เว้นว่างไว้ก็ได้">
          <FieldGrid>
            <Field label="เลขที่เอกสารอ้างอิง" hint="เช่น เลขที่ใบสำคัญจ่าย">
              <TextInput
                value={form.reference}
                onChange={(event) => update("reference", event.target.value)}
              />
            </Field>

            <Field label="หมายเหตุ">
              <TextInput
                value={form.note}
                onChange={(event) => update("note", event.target.value)}
              />
            </Field>
          </FieldGrid>
        </FormSection>
      </div>
    </Modal>
  );
}

/** หัวข้อย่อยในฟอร์ม — ป้ายฟ้าคั่นด้วยเส้นบาง แทนการครอบเป็นกล่อง */
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
      <div className="mb-2 border-b border-brand-100 pb-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {title}
        </p>
        {hint ? (
          <p className="mt-0.5 text-[11.5px] text-slate-400">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
