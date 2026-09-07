"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  CellStack,
  Section,
  Checkbox,
  DataTable,
  Field,
  FieldGrid,
  IconButton,
  Modal,
  ModalActions,
  MoneyInput,
  Notice,
  Select,
  TextInput,
  type Column,
  type Tone,
} from "@/components/kit";
import { ActionDialog, type ActionDialogState } from "@/components/common/action-dialog";
import {
  cancelDeductionPlan,
  createDeductionPlan,
  deleteDeductionPlan,
  getDeductionPlans,
  resumeDeductionPlan,
  suspendDeductionPlan,
  updateDeductionPlan,
} from "@/lib/api";
import { dateText, errorText, money } from "@/lib/payroll-format";
import {
  DEDUCTION_PLAN_STATUS_LABEL,
  DEDUCTION_PLAN_TYPE_LABEL,
  type DeductionPlan,
  type DeductionPlanStatus,
  type DeductionPlanType,
} from "@/types/deduction-plan";

/**
 * หนี้ที่หักผ่อนงวดของพนักงานหนึ่งคน
 * ---------------------------------
 * กยศ. เงินกู้พนักงาน สหกรณ์ — ระบบหักอัตโนมัติทุกงวดจนครบยอด
 * และหักหลังภาษีกับประกันสังคมเสมอ เพื่อไม่ให้เงินสุทธิติดลบ
 */

type Props = {
  companyId: string;
  employeeId: string;
};

const statusTone: Record<DeductionPlanStatus, Tone> = {
  ACTIVE: "positive",
  COMPLETED: "neutral",
  SUSPENDED: "warning",
  CANCELLED: "critical",
};

const emptyForm = {
  planType: "STUDENT_LOAN" as DeductionPlanType,
  name: "",
  code: "",
  referenceNo: "",
  totalAmount: "",
  installmentAmount: "",
  paidAmount: "0",
  startDate: new Date().toISOString().slice(0, 10),
  allowPartialDeduction: true,
};

export function LoanTab({ companyId, employeeId }: Props) {
  const [plans, setPlans] = useState<DeductionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  /** null = กำลังเพิ่มรายการใหม่ · มีค่า = กำลังแก้รายการนั้น */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDeductionPlans({ employeeId, pageSize: 100 });
      setPlans(result.data);
    } catch (error) {
      toast.error(errorText(error, "โหลดรายการหักผ่อนงวดไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  /*
   * เปิดของเดิมขึ้นมาดู/แก้ — เดิมหน้านี้ตั้งรายการได้อย่างเดียว
   * ตั้งเสร็จแล้วดูไม่ได้ว่าใส่ยอดหนี้ทั้งหมด เลขสัญญา หรือวันเริ่มหักไว้เท่าไร
   * ทั้งที่หลังบ้านรองรับการแก้ครบทุกช่องมาตั้งแต่แรก
   */
  function openEdit(plan: DeductionPlan) {
    setEditingId(plan.id);
    setForm({
      planType: plan.planType,
      name: plan.name,
      code: plan.code ?? "",
      referenceNo: plan.referenceNo ?? "",
      totalAmount: plan.totalAmount == null ? "" : String(plan.totalAmount),
      installmentAmount: String(plan.installmentAmount),
      paidAmount: String(plan.paidAmount ?? 0),
      startDate: String(plan.startDate).slice(0, 10),
      allowPartialDeduction: plan.allowPartialDeduction ?? true,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("กรุณากรอกชื่อรายการ");
      return;
    }

    const installment = Number(form.installmentAmount);
    if (!Number.isFinite(installment) || installment <= 0) {
      toast.error("ยอดหักต่องวดต้องมากกว่า 0");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        /*
         * ยอดที่หักไปแล้วแก้ที่นี่ไม่ได้ เพราะเป็นผลจากงวดที่จ่ายจริงไปแล้ว
         * ถ้าให้แก้จะทำให้ยอดคงเหลือไม่ตรงกับเงินที่หักออกจากสลิปจริง
         */
        await updateDeductionPlan(editingId, {
          name: form.name.trim(),
          referenceNo: form.referenceNo.trim() || null,
          totalAmount: form.totalAmount ? Number(form.totalAmount) : null,
          installmentAmount: installment,
          startDate: form.startDate,
          allowPartialDeduction: form.allowPartialDeduction,
        });

        closeModal();
        await load();
        toast.success("แก้ไขรายการแล้ว มีผลกับงวดถัดไปที่คำนวณ");
        return;
      }

      await createDeductionPlan({
        companyId,
        employeeId,
        planType: form.planType,
        code:
          form.code.trim().toUpperCase() ||
          `${form.planType}_${Date.now().toString(36).toUpperCase()}`,
        name: form.name.trim(),
        referenceNo: form.referenceNo.trim() || null,
        totalAmount: form.totalAmount ? Number(form.totalAmount) : null,
        installmentAmount: installment,
        paidAmount: Number(form.paidAmount) || 0,
        startDate: form.startDate,
        allowPartialDeduction: form.allowPartialDeduction,
      });

      closeModal();
      await load();
      toast.success("เพิ่มรายการหักผ่อนงวดแล้ว จะเริ่มหักในงวดถัดไป");
    } catch (error) {
      toast.error(
        errorText(error, editingId ? "แก้ไขไม่สำเร็จ" : "เพิ่มรายการไม่สำเร็จ"),
      );
    } finally {
      setSaving(false);
    }
  }

  const columns: Array<Column<DeductionPlan>> = [
    {
      key: "name",
      header: "รายการ",
      cell: (row) => (
        <CellStack
          primary={row.name}
          secondary={
            <>
              {DEDUCTION_PLAN_TYPE_LABEL[row.planType]}
              {row.referenceNo ? ` · ${row.referenceNo}` : ""} · เริ่ม{" "}
              {dateText(row.startDate)}
            </>
          }
        />
      ),
    },
    {
      key: "installment",
      header: "หัก/งวด",
      align: "right",
      width: "w-32",
      cell: (row) => money(row.installmentAmount),
    },
    {
      key: "outstanding",
      header: "คงเหลือ",
      align: "right",
      width: "w-40",
      cell: (row) =>
        row.outstandingAmount === null ? (
          <span className="text-slate-400">ไม่กำหนด</span>
        ) : (
          <div>
            <div className="font-semibold text-slate-900">
              {money(row.outstandingAmount)}
            </div>
            {row.remainingInstallments !== null ? (
              <div className="text-xs 3xl:text-[12.5px] 4xl:text-[13px] text-slate-500">
                อีก {row.remainingInstallments} งวด
              </div>
            ) : null}
          </div>
        ),
    },
    {
      key: "progress",
      header: "หักไปแล้ว",
      width: "w-40",
      hideBelow: "lg",
      cell: (row) =>
        row.progressPercent === null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${row.progressPercent}%` }}
              />
            </div>
            <div className="mt-1 text-xs 3xl:text-[12.5px] 4xl:text-[13px] text-slate-500 tabular-nums">
              {money(row.paidAmount)} ({row.progressPercent}%)
            </div>
          </div>
        ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-28",
      cell: (row) => (
        <Badge tone={statusTone[row.status]}>
          {DEDUCTION_PLAN_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "w-32",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {/* ยกเลิกแล้วเปิดดูได้ แต่แก้ไม่ได้ เพราะแผนจบไปแล้ว */}
          {row.status !== "CANCELLED" ? (
            <IconButton
              title="ดูและแก้ไขรายละเอียด"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => openEdit(row)}
            />
          ) : null}

          {row.status === "ACTIVE" ? (
            <IconButton
              title="พักการหัก"
              icon={<Pause className="h-4 w-4" />}
              onClick={() =>
                setDialog({
                  title: `พักการหัก ${row.name}?`,
                  description:
                    "งวดถัดไปจะข้ามรายการนี้ ยอดหนี้คงเหลือยังอยู่ครบ เปิดกลับได้ทุกเมื่อ",
                  confirmLabel: "พักการหัก",
                  tone: "orange",
                  onConfirm: async () => {
                    await suspendDeductionPlan(row.id);
                    await load();
                  },
                })
              }
            />
          ) : null}

          {row.status === "SUSPENDED" ? (
            <IconButton
              title="กลับมาหักต่อ"
              icon={<Play className="h-4 w-4" />}
              onClick={() => {
                /*
                 * ต้องจับ error เอง — ตัวอื่นในตารางนี้ผ่าน ActionDialog ซึ่งจัดการให้แล้ว
                 * แต่ปุ่มนี้ยิงตรง ถ้าล้มจะเงียบสนิท ผู้ใช้เห็นว่ากดแล้วไม่มีอะไรเกิดขึ้น
                 * แล้วกดซ้ำ ทั้งที่รายการนี้กระทบยอดหักเงินเดือนจริง
                 */
                void (async () => {
                  try {
                    await resumeDeductionPlan(row.id);
                    await load();
                    toast.success(`กลับมาหัก ${row.name} แล้ว`);
                  } catch (error) {
                    toast.error(errorText(error, "กลับมาหักต่อไม่สำเร็จ"));
                  }
                })();
              }}
            />
          ) : null}

          {row.status !== "CANCELLED" ? (
            <IconButton
              title="ยกเลิกแผน"
              tone="danger"
              icon={<Ban className="h-4 w-4" />}
              onClick={() =>
                setDialog({
                  title: `ยกเลิก ${row.name}?`,
                  description:
                    "หยุดหักถาวร แต่ประวัติการหักที่เกิดขึ้นแล้วยังเก็บไว้ครบ",
                  confirmLabel: "ยกเลิกแผน",
                  tone: "red",
                  onConfirm: async () => {
                    await cancelDeductionPlan(row.id);
                    await load();
                  },
                })
              }
            />
          ) : null}

          {row.paidAmount === 0 ? (
            <IconButton
              title="ลบแผน"
              tone="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() =>
                setDialog({
                  title: `ลบ ${row.name}?`,
                  description: "ลบได้เพราะยังไม่เคยหักเงินจริง",
                  confirmLabel: "ลบแผน",
                  tone: "red",
                  onConfirm: async () => {
                    await deleteDeductionPlan(row.id);
                    await load();
                  },
                })
              }
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <Section
        tight
        title="หนี้ที่หักผ่อนงวด"
        description="ระบบหักอัตโนมัติทุกงวดจนครบยอด และหักหลังภาษี/ประกันสังคมเสมอ"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            เพิ่มรายการ
          </Button>
        }
      >
        <DataTable
          loading={loading}
          columns={columns}
          rows={plans}
          rowKey={(row) => row.id}
          minWidth="min-w-[52rem]"
          emptyTitle="ไม่มีรายการหักผ่อนงวด"
          emptyDescription="เช่น กยศ. เงินกู้พนักงาน หรือหุ้นสหกรณ์"
        />
      </Section>

      <Modal
        open={modalOpen}
        title={editingId ? "แก้ไขรายการหักผ่อนงวด" : "เพิ่มรายการหักผ่อนงวด"}
        description={
          editingId
            ? "แก้แล้วมีผลกับงวดถัดไปที่คำนวณ งวดที่หักไปแล้วไม่เปลี่ยน"
            : "ระบบจะเริ่มหักในงวดถัดไปที่คำนวณ"
        }
        onClose={closeModal}
        footer={
          <ModalActions
            onCancel={closeModal}
            onConfirm={() => void save()}
            confirmLabel={editingId ? "บันทึก" : "เพิ่มรายการ"}
            loading={saving}
          />
        }
      >
        <FieldGrid columns={2}>
          <Field
            label="ประเภท"
            hint={editingId ? "เปลี่ยนประเภททีหลังไม่ได้ ต้องยกเลิกแล้วสร้างใหม่" : undefined}
          >
            <Select
              disabled={Boolean(editingId)}
              value={form.planType}
              onChange={(event) =>
                setForm((f) => ({
                  ...f,
                  planType: event.target.value as DeductionPlanType,
                }))
              }
            >
              {Object.entries(DEDUCTION_PLAN_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ชื่อที่แสดงในสลิป" required>
            <TextInput
              value={form.name}
              onChange={(event) =>
                setForm((f) => ({ ...f, name: event.target.value }))
              }
              placeholder="หัก กยศ."
            />
          </Field>
          <Field label="หักต่องวด" required>
            <MoneyInput
              align="left"
              value={form.installmentAmount}
              onChange={(event) =>
                setForm((f) => ({ ...f, installmentAmount: event.target.value }))
              }
            />
          </Field>
          <Field label="ยอดหนี้ทั้งหมด" hint="เว้นว่าง = หักไปเรื่อย ๆ">
            <MoneyInput
              align="left"
              value={form.totalAmount}
              onChange={(event) =>
                setForm((f) => ({ ...f, totalAmount: event.target.value }))
              }
            />
          </Field>
          <Field
            label="ยกยอดที่หักไปแล้ว"
            hint={
              editingId
                ? "แก้ไม่ได้ เพราะเป็นยอดที่หักออกจากสลิปจริงไปแล้ว"
                : "ใช้ตอนย้ายจากระบบเดิม"
            }
          >
            <MoneyInput
              align="left"
              disabled={Boolean(editingId)}
              value={form.paidAmount}
              onChange={(event) =>
                setForm((f) => ({ ...f, paidAmount: event.target.value }))
              }
            />
          </Field>
          <Field label="วันที่เริ่มหัก">
            <TextInput
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm((f) => ({ ...f, startDate: event.target.value }))
              }
            />
          </Field>
          <Field label="เลขที่สัญญา / เลขที่ผู้กู้" className="sm:col-span-2">
            <TextInput
              value={form.referenceNo}
              onChange={(event) =>
                setForm((f) => ({ ...f, referenceNo: event.target.value }))
              }
            />
          </Field>
        </FieldGrid>

        <div className="mt-4">
          <Checkbox
            label="หักบางส่วนได้เมื่อเงินไม่พอ"
            hint="เอาออก = งวดไหนเงินเหลือไม่พอจะข้ามไปทั้งงวด"
            checked={form.allowPartialDeduction}
            onChange={(event) =>
              setForm((f) => ({
                ...f,
                allowPartialDeduction: event.target.checked,
              }))
            }
          />
        </div>

        {/*
          สามประเภทนี้มีข้อกฎหมายกำกับที่ HR ต้องรู้ก่อนตั้ง ไม่ใช่แค่ตัวเลขหัก
          เขียนไว้ตรงจุดที่กำลังตั้งค่า ดีกว่าให้ไปเปิดคู่มือทีหลัง
        */}
        {form.planType === "STUDENT_LOAN" ? (
          <div className="mt-4">
            <Notice tone="info">
              กยศ. จะได้ลำดับการหักก่อนหนี้ประเภทอื่นอัตโนมัติ
              เพราะเป็นหน้าที่ที่นายจ้างต้องหักตามกฎหมาย
            </Notice>
          </div>
        ) : null}

        {form.planType === "WORK_GUARANTEE" ? (
          <div className="mt-4">
            <Notice tone="warning">
              เงินประกันการทำงานเรียกได้เฉพาะงานที่ลูกจ้างต้องรับผิดชอบเงินหรือ
              ทรัพย์สินของนายจ้าง (ม.10) และ
              <strong> ต้องคืนภายใน 7 วันนับแต่วันที่เลิกจ้างหรือลาออก</strong> —
              ระบบไม่ได้เตือนวันคืนให้ ต้องติดตามเอง
            </Notice>
          </div>
        ) : null}

        {form.planType === "DAMAGE_PAYMENT" ? (
          <div className="mt-4">
            <Notice tone="warning">
              หักค่าเสียหายจากค่าจ้างต้องมี
              <strong> หนังสือยินยอมจากลูกจ้าง</strong> และรวมรายการหักทั้งหมด
              (ไม่นับภาษี ประกันสังคม สหกรณ์ กองทุนสำรองเลี้ยงชีพ) แล้ว
              <strong> ต้องไม่เกิน 10% ของค่าจ้างงวดนั้น</strong> ตาม ม.76
            </Notice>
          </div>
        ) : null}
      </Modal>

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
