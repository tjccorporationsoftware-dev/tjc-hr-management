"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  CellStack,
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
  joinClassName,
  type Column,
} from "@/components/kit";
import { getPayrollPeriods } from "@/lib/api";
import {
  approvePayrollAdjustment,
  createPayrollAdjustment,
  deletePayrollAdjustment,
  getPayrollAdjustments,
} from "@/lib/payroll-extensions-api";
import { dateText, errorText, money } from "@/lib/payroll-format";
import type { PayrollPeriod } from "@/types/payroll";
import type { PayrollAdjustment } from "@/types/payroll-extensions";

import { periodLabel } from "../../_components/period-format";
import {
  usePayrollComponentOptions,
  type PayrollComponentOption,
} from "./use-payroll-component-options";
import { PayrollItemNameInput } from "./payroll-item-name-input";

/**
 * รายรับ/รายหักเฉพาะงวด
 * ---------------------
 * ต่างจาก "รายการประจำ" ตรงที่ผูกกับงวดเดียว เช่น โบนัส ค่าคอมมิชชั่น
 * หักเงินยืม หรือหักค่าเสียหาย — ใส่แล้วเข้าเฉพาะงวดนั้นงวดเดียว
 *
 * ต้องกดอนุมัติก่อน payroll ถึงจะดึงเข้ารอบ (สถานะ APPROVED เท่านั้นที่ถูกนำเข้า)
 */

type Props = {
  companyId: string;
  employeeId: string;
};

const emptyForm = {
  type: "EARNING" as "EARNING" | "DEDUCTION",
  code: "",
  name: "",
  amount: "",
  reason: "",
  isTaxable: true,
  isSocialSecurityBase: true,
};

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "brand" | "positive" | "warning" | "critical" }> = {
  DRAFT: { label: "ร่าง", tone: "warning" },
  APPROVED: { label: "อนุมัติแล้ว", tone: "brand" },
  IMPORTED: { label: "เข้างวดแล้ว", tone: "positive" },
  CANCELLED: { label: "ยกเลิก", tone: "neutral" },
};

export function AdjustmentTab({ companyId, employeeId }: Props) {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { options: componentOptions, findByLabel } = usePayrollComponentOptions(companyId);

  /** เหลือเฉพาะตัวเลือกที่ตรงกับประเภทที่เลือกไว้ (รายรับ/รายหัก) */
  const pickableComponents = useMemo(
    () => componentOptions.filter((option) => option.type === form.type),
    [componentOptions, form.type],
  );

  /**
   * ช่องชื่อรายการเป็นทั้งช่องพิมพ์และช่องเลือก (datalist)
   *
   * ถ้าพิมพ์/เลือกตรงกับรายการที่ระบบมีให้ จะเติมรหัสและธงคิดภาษี/ฐานประกันสังคม
   * ให้อัตโนมัติ ถ้าเป็นชื่อใหม่ที่ไม่มีในลิสต์ ก็ปล่อยให้กรอกเองตามปกติ
   */
  function changeItemName(
    name: string,
    picked: PayrollComponentOption | null = null,
  ) {
    /* เลือกจากลิสต์ = รู้ตัวเลือกแน่นอน · พิมพ์เอง = ต้องหาจากชื่อว่าตรงกับอะไร */
    const option = picked ?? findByLabel(name);

    setForm((f) => ({
      ...f,
      name,
      ...(option && option.type === f.type
        ? {
            code: option.code,
            isTaxable: option.isTaxable,
            isSocialSecurityBase: option.isSocialSecurityBase,
          }
        : {}),
    }));
  }

  /** งวดทั้งหมดของบริษัท ใช้ทั้งกรองรายการและเลือกงวดปลายทางตอนเพิ่ม */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!companyId) return;

      try {
        const result = await getPayrollPeriods({
          companyId,
          page: 1,
          pageSize: 24,
        });
        if (cancelled) return;

        setPeriods(result.data);
        setPeriodId((current) => current || result.data[0]?.id || "");
      } catch (error) {
        if (!cancelled) toast.error(errorText(error, "โหลดงวดเงินเดือนไม่สำเร็จ"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const loadAdjustments = useCallback(async () => {
    if (!employeeId) return;

    setLoading(true);
    try {
      const result = await getPayrollAdjustments({
        employeeId,
        periodId: periodId || undefined,
        pageSize: 100,
      });
      setAdjustments(result.items ?? []);
    } catch (error) {
      toast.error(errorText(error, "โหลดรายการเฉพาะงวดไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [employeeId, periodId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAdjustments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAdjustments]);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId) ?? null,
    [periods, periodId],
  );

  const totals = useMemo(() => {
    let earning = 0;
    let deduction = 0;

    for (const item of adjustments) {
      if (item.status === "CANCELLED") continue;
      const amount = Number(item.amount ?? 0);
      if (item.type === "DEDUCTION") deduction += amount;
      else earning += amount;
    }

    return { earning, deduction };
  }, [adjustments]);

  async function save() {
    if (!periodId) {
      toast.error("เลือกงวดก่อน");
      return;
    }
    if (!form.name.trim() || !form.amount) {
      toast.error("กรุณากรอกชื่อรายการและจำนวนเงิน");
      return;
    }

    setSaving(true);
    try {
      await createPayrollAdjustment({
        companyId,
        employeeId,
        periodId,
        code:
          form.code.trim().toUpperCase() ||
          `ADJ_${Date.now().toString(36).toUpperCase()}`,
        name: form.name.trim(),
        type: form.type,
        amount: Number(form.amount),
        reason: form.reason.trim() || null,
        isTaxable: form.type === "EARNING" ? form.isTaxable : false,
        isSocialSecurityBase:
          form.type === "EARNING" ? form.isSocialSecurityBase : false,
      });

      setModalOpen(false);
      setForm(emptyForm);
      await loadAdjustments();
      toast.success("เพิ่มรายการแล้ว — กดอนุมัติก่อนคำนวณงวด");
    } catch (error) {
      toast.error(errorText(error, "เพิ่มรายการไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function approve(row: PayrollAdjustment) {
    setBusyId(row.id);
    try {
      await approvePayrollAdjustment(row.id);
      await loadAdjustments();
      toast.success("อนุมัติแล้ว จะถูกดึงเข้างวดตอนคำนวณ");
    } catch (error) {
      toast.error(errorText(error, "อนุมัติไม่สำเร็จ"));
    } finally {
      setBusyId("");
    }
  }

  async function remove(row: PayrollAdjustment) {
    setBusyId(row.id);
    try {
      await deletePayrollAdjustment(row.id);
      await loadAdjustments();
      toast.success("ลบรายการแล้ว");
    } catch (error) {
      toast.error(errorText(error, "ลบรายการไม่สำเร็จ"));
    } finally {
      setBusyId("");
    }
  }

  const columns: Array<Column<PayrollAdjustment>> = [
    {
      key: "name",
      header: "รายการ",
      cell: (row) => (
        <CellStack
          primary={row.name}
          secondary={row.reason ? `${row.code} · ${row.reason}` : row.code}
        />
      ),
    },
    {
      key: "type",
      header: "ประเภท",
      width: "w-24",
      cell: (row) => (
        <Badge tone={row.type === "DEDUCTION" ? "critical" : "positive"}>
          {row.type === "DEDUCTION" ? "รายหัก" : "รายรับ"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-32",
      cell: (row) => {
        const status = STATUS_LABEL[row.status ?? "DRAFT"] ?? STATUS_LABEL.DRAFT;
        return <Badge tone={status.tone}>{status.label}</Badge>;
      },
    },
    {
      key: "amount",
      header: "จำนวนเงิน",
      align: "right",
      width: "w-32",
      cell: (row) => (
        <span
          className={joinClassName(
            "font-semibold tabular-nums",
            row.type === "DEDUCTION" ? "text-rose-700" : "text-slate-900",
          )}
        >
          {row.type === "DEDUCTION" ? "−" : ""}
          {money(row.amount)}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "w-32",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.status === "DRAFT" ? (
            <Button
              size="sm"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              disabled={busyId === row.id}
              onClick={() => void approve(row)}
            >
              อนุมัติ
            </Button>
          ) : null}

          {row.status !== "IMPORTED" ? (
            <IconButton
              title="ลบรายการ"
              tone="danger"
              icon={<Trash2 className="h-4 w-4" />}
              disabled={busyId === row.id}
              onClick={() => void remove(row)}
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* เลือกงวดก่อน ทั้งตารางและรายการที่เพิ่มใหม่ผูกกับงวดนี้ */}
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 3xl:px-6 4xl:px-7 py-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2">
          <span className="text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] font-medium text-slate-600">งวด</span>
          <Select
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
            className="w-56"
            aria-label="งวดเงินเดือน"
          >
            {periods.length === 0 ? <option value="">ยังไม่มีงวด</option> : null}
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {periodLabel(period)}
              </option>
            ))}
          </Select>
        </label>

        <Button
          icon={<Plus className="h-4 w-4" />}
          disabled={!periodId}
          onClick={() => setModalOpen(true)}
        >
          เพิ่มรายการ
        </Button>
      </div>

      {selectedPeriod ? (
        <p className="px-5 3xl:px-6 4xl:px-7 py-2 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] text-slate-400">
          ช่วงงวด {dateText(selectedPeriod.startDate)} –{" "}
          {dateText(selectedPeriod.endDate)} · จ่าย{" "}
          {dateText(selectedPeriod.paymentDate)}
        </p>
      ) : null}

      <DataTable
        loading={loading}
        columns={columns}
        rows={adjustments}
        rowKey={(row) => row.id}
        minWidth="min-w-[42rem]"
        emptyTitle="งวดนี้ยังไม่มีรายการเฉพาะงวด"
        emptyDescription="เช่น โบนัส ค่าคอมมิชชั่น หักเงินยืม หรือหักค่าเสียหาย"
      />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-slate-200 bg-brand-50/50 px-5 3xl:px-6 4xl:px-7 py-4">
        <p className="text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] text-slate-500">
          รายการสถานะ &quot;ร่าง&quot; จะยังไม่ถูกดึงเข้างวด ต้องกดอนุมัติก่อนคำนวณ
        </p>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-600">
          <span>
            รายรับ{" "}
            <span className="text-[15px] 3xl:text-[16px] 4xl:text-[17px] font-bold tabular-nums text-slate-900">
              {money(totals.earning)}
            </span>
          </span>
          <span>
            รายหัก{" "}
            <span className="text-[15px] 3xl:text-[16px] 4xl:text-[17px] font-bold tabular-nums text-rose-700">
              {money(totals.deduction)}
            </span>
          </span>
          <span>
            สุทธิ{" "}
            <span className="text-[15px] 3xl:text-[16px] 4xl:text-[17px] font-bold tabular-nums text-brand-700">
              {money(totals.earning - totals.deduction)}
            </span>
          </span>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title="เพิ่มรายการเฉพาะงวด"
        description={
          selectedPeriod
            ? `เข้าเฉพาะงวด ${periodLabel(selectedPeriod)} งวดเดียว`
            : "เข้าเฉพาะงวดที่เลือกไว้"
        }
        size="md-wide"
        onClose={() => setModalOpen(false)}
        footer={
          <ModalActions
            onCancel={() => setModalOpen(false)}
            onConfirm={() => void save()}
            confirmLabel="เพิ่มรายการ"
            loading={saving}
          />
        }
      >
        <FieldGrid columns={3}>
          {/* จำนวนเงินมาก่อน เพราะเป็นค่าที่คนกรอกเสมอและกรอกก่อนอย่างอื่น */}
          <Field label="จำนวนเงิน" required>
            <MoneyInput
              align="left"
              value={form.amount}
              onChange={(event) =>
                setForm((f) => ({ ...f, amount: event.target.value }))
              }
              placeholder="0.00"
            />
          </Field>
          <Field label="ประเภท">
            <Select
              value={form.type}
              onChange={(event) =>
                setForm((f) => ({
                  ...f,
                  type: event.target.value as "EARNING" | "DEDUCTION",
                }))
              }
            >
              <option value="EARNING">รายรับ</option>
              <option value="DEDUCTION">รายหัก</option>
            </Select>
          </Field>
          <Field label="รหัสรายการ" hint="เว้นว่างได้ ระบบตั้งให้เอง">
            <TextInput
              value={form.code}
              onChange={(event) =>
                setForm((f) => ({ ...f, code: event.target.value }))
              }
              placeholder="BONUS"
            />
          </Field>
          <Field
            label="ชื่อรายการ"
            required
            className="xl:col-span-2"
            hint={
              pickableComponents.length
                ? "พิมพ์เองได้ หรือเลือกจากรายการที่ระบบมีให้ แล้วจะเติมรหัสและธงให้"
                : "พิมพ์ชื่อที่จะขึ้นในสลิป"
            }
          >
            <PayrollItemNameInput
              value={form.name}
              options={pickableComponents}
              placeholder="เช่น โบนัสประจำปี, หักเงินยืม"
              onChange={changeItemName}
            />
          </Field>
          <Field label="เหตุผล" hint="ใช้ตอนตรวจย้อนหลัง">
            <TextInput
              value={form.reason}
              onChange={(event) =>
                setForm((f) => ({ ...f, reason: event.target.value }))
              }
            />
          </Field>
        </FieldGrid>

        {form.type === "EARNING" ? (
          <div className="mt-4 flex flex-wrap gap-6 border-t border-slate-200 pt-4">
            <Checkbox
              label="คิดภาษี"
              checked={form.isTaxable}
              onChange={(event) =>
                setForm((f) => ({ ...f, isTaxable: event.target.checked }))
              }
            />
            <Checkbox
              label="เข้าฐานประกันสังคม"
              checked={form.isSocialSecurityBase}
              onChange={(event) =>
                setForm((f) => ({
                  ...f,
                  isSocialSecurityBase: event.target.checked,
                }))
              }
            />
          </div>
        ) : (
          <Notice tone="info">
            รายการหักไม่กระทบฐานภาษีและประกันสังคม ระบบจะหักจากเงินสุทธิของงวดนี้
          </Notice>
        )}
      </Modal>
    </div>
  );
}
