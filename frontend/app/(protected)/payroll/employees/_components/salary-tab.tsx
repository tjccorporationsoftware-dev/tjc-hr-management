"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Checkbox,
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
} from "@/components/kit";
import {
  createEmployeeCompensation,
  getEmployeeCompensations,
  updateEmployeeCompensation,
} from "@/lib/api";
import {
  createPayrollCompensationItem,
  updatePayrollCompensationItem,
  deletePayrollCompensationItem,
  getPayrollCompensationItems,
} from "@/lib/payroll-extensions-api";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { dateText, errorText, money } from "@/lib/payroll-format";
import { THAI_BANKS } from "@/lib/thai-banks";
import type { EmployeeCompensation, SalaryBasis } from "@/types/payroll";
import type { EmployeeCompensationItem } from "@/types/payroll-extensions";

import {
  usePayrollComponentOptions,
  type PayrollComponentOption,
} from "./use-payroll-component-options";
import { PayrollItemNameInput } from "./payroll-item-name-input";

/**
 * เงินเดือนของพนักงานหนึ่งคน
 * -------------------------
 * ฐานเงินเดือนมีได้ชุดเดียวที่ใช้งานอยู่ ส่วนรายการประจำ (ค่าตำแหน่ง ค่าเดินทาง
 * หักที่จอดรถ ฯลฯ) มีได้หลายรายการและเข้าทุกงวดจนกว่าจะลบ
 */

/** หัวข้อย่อยในแท็บ — ป้ายฟ้าคั่นด้วยเส้นบาง แทนหัวข้อเทาตัวใหญ่ */
function TabSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 px-5 py-4 last:border-b-0 3xl:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-brand-100 pb-1.5">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            {title}
          </p>
          {description ? (
            <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
        {actions ?? null}
      </div>
      {children}
    </section>
  );
}

/**
 * รายการประจำหนึ่งรายการ — บรรทัดเดียว
 * ซ้ายบอกว่ารายการอะไรมีผลช่วงไหน กลางเป็นเงื่อนไขที่ติ๊กได้ ขวาเป็นจำนวนเงิน
 */
function RecurringRow({
  row,
  busy,
  onToggle,
  onDelete,
}: {
  row: EmployeeCompensationItem;
  busy: boolean;
  onToggle: (
    field: "isTaxable" | "isSocialSecurityBase",
    value: boolean,
  ) => void;
  onDelete: () => void;
}) {
  const deduction = row.type === "DEDUCTION";

  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
      <div className="min-w-[11rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
            {row.name}
          </p>
          <Badge tone={deduction ? "critical" : "positive"}>
            {deduction ? "รายหัก" : "รายรับ"}
          </Badge>
        </div>
        <p className="truncate text-[11px] text-slate-400 3xl:text-[11.5px]">
          {[
            row.code,
            `${dateText(row.effectiveDate)}${row.endDate ? ` – ${dateText(row.endDate)}` : " เป็นต้นไป"}`,
            row.prorateByEmploymentDays === false
              ? "เข้า/ออกกลางงวดจ่ายเต็ม"
              : "เข้า/ออกกลางงวดหารตามวัน",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/*
       * รายการหักไม่มีทั้งสองอย่าง — หักหลังคำนวณแล้ว ไม่ได้ทำให้ฐานเปลี่ยน
       * แสดงเป็นข้อความแทนช่องติ๊ก จะได้ไม่มีใครไปติ๊กแล้วงงว่าทำไมไม่มีอะไรเกิดขึ้น
       */}
      <div className="w-44 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          คิดภาษี / ฐาน สปส.
        </p>
        {deduction ? (
          <p className="text-[12px] text-slate-400">ไม่เกี่ยวกับฐาน</p>
        ) : (
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
            <Checkbox
              label="คิดภาษี"
              className="text-[12px]"
              checked={row.isTaxable !== false}
              disabled={busy}
              onChange={(event) => onToggle("isTaxable", event.target.checked)}
            />
            <Checkbox
              label="ฐาน สปส."
              className="text-[12px]"
              checked={row.isSocialSecurityBase === true}
              disabled={busy}
              onChange={(event) =>
                onToggle("isSocialSecurityBase", event.target.checked)
              }
            />
          </div>
        )}
      </div>

      <p
        className={joinClassName(
          "w-28 shrink-0 text-right text-[14px] font-bold tabular-nums 3xl:text-[15px]",
          deduction ? "text-rose-700" : "text-slate-900",
        )}
      >
        {deduction ? "−" : ""}
        {money(row.amount)}
      </p>

      <div className="flex w-9 shrink-0 justify-end">
        <IconButton
          title="ลบรายการ"
          tone="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          /*
           * ต้องถามก่อนลบ — รายการนี้เข้าทุกงวดจนกว่าจะลบ
           * กดพลาดหนึ่งครั้งคือเงินเพิ่ม/รายการหักหายจากงวดถัดไปทันที
           */
          onClick={onDelete}
        />
      </div>
    </article>
  );
}

type Props = {
  companyId: string;
  employeeId: string;
  onSaved: () => void;
};

/*
 * ป้ายกำกับช่องเงินต้องเปลี่ยนตามฐานค่าจ้าง
 * ถ้าเขียน "เงินเดือน" ไว้ตายตัว คนกรอกค่าแรงรายวัน 500 จะเข้าใจว่ากรอกเงินเดือน
 * ทั้งเดือน ซึ่งเป็นที่มาของยอด OT และค่าจ้างที่ผิดมาตลอด
 */
const SALARY_BASIS_OPTIONS: Array<{
  value: SalaryBasis;
  label: string;
  amountLabel: string;
  hint: string;
}> = [
  {
    value: "MONTHLY",
    label: "รายเดือน",
    amountLabel: "เงินเดือน",
    hint: "จ่ายเต็มเดือน หักตามสัดส่วนถ้าเข้า/ออกกลางงวด",
  },
  {
    value: "DAILY",
    label: "รายวัน",
    amountLabel: "ค่าแรงต่อวัน",
    hint: "จ่ายตามจำนวนวันที่มาทำงานจริงในงวด",
  },
  {
    value: "HOURLY",
    label: "รายชั่วโมง",
    amountLabel: "ค่าแรงต่อชั่วโมง",
    hint: "จ่ายตามชั่วโมงที่ทำจริง ใช้กับพนักงานพาร์ทไทม์",
  },
];

type SalaryForm = {
  effectiveDate: string;
  baseSalary: string;
  salaryBasis: SalaryBasis;
  bankName: string;
  bankAccountNo: string;
  taxEnabled: boolean;
  socialSecurityEnabled: boolean;
};

const emptySalaryForm: SalaryForm = {
  effectiveDate: new Date().toISOString().slice(0, 10),
  baseSalary: "",
  salaryBasis: "MONTHLY",
  bankName: "",
  bankAccountNo: "",
  taxEnabled: true,
  socialSecurityEnabled: true,
};

const emptyItemForm = {
  type: "EARNING" as "EARNING" | "DEDUCTION",
  code: "",
  name: "",
  amount: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  isTaxable: true,
  isSocialSecurityBase: true,
  prorateByEmploymentDays: true,
};

export function SalaryTab({ companyId, employeeId, onSaved }: Props) {
  const [compensation, setCompensation] = useState<EmployeeCompensation | null>(
    null,
  );
  const [items, setItems] = useState<EmployeeCompensationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SalaryForm>(emptySalaryForm);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  /** id ของรายการที่กำลังบันทึกธงอยู่ ใช้ปิดช่องกันกดรัวระหว่างรอผล */
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const { options: componentOptions, findByLabel } =
    usePayrollComponentOptions(companyId);

  /** เหลือเฉพาะตัวเลือกที่ตรงกับประเภทที่เลือกไว้ (รายรับ/รายหัก) */
  const pickableComponents = useMemo(
    () => componentOptions.filter((option) => option.type === itemForm.type),
    [componentOptions, itemForm.type],
  );

  /**
   * ช่องชื่อรายการเป็นทั้งช่องพิมพ์และช่องเลือก (datalist)
   *
   * ถ้าพิมพ์/เลือกตรงกับรายการที่ระบบมีให้ จะเติมรหัสและธงคิดภาษี/ฐานประกันสังคม
   * ให้อัตโนมัติ ถ้าเป็นชื่อใหม่ที่ไม่มีในลิสต์ ก็ปล่อยให้กรอกเองตามปกติ
   * ไม่บังคับให้เลือกจากลิสต์ เพราะแต่ละบริษัทมีรายการเฉพาะของตัวเองได้
   */
  function changeItemName(
    name: string,
    picked: PayrollComponentOption | null = null,
  ) {
    /* เลือกจากลิสต์ = รู้ตัวเลือกแน่นอน · พิมพ์เอง = ต้องหาจากชื่อว่าตรงกับอะไร */
    const option = picked ?? findByLabel(name);

    setItemForm((f) => ({
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [compensationResult, itemResult] = await Promise.all([
          getEmployeeCompensations({
            employeeId,
            pageSize: 1,
            status: "ACTIVE",
          }),
          getPayrollCompensationItems({ employeeId, pageSize: 100 }),
        ]);
        if (cancelled) return;

        const current = compensationResult.data[0] ?? null;
        setCompensation(current);
        setItems(itemResult.items ?? []);
        setForm(
          current
            ? {
                effectiveDate: current.effectiveDate.slice(0, 10),
                baseSalary: String(current.baseSalary ?? ""),
                salaryBasis: current.salaryBasis ?? "MONTHLY",
                bankName: current.bankName ?? "",
                bankAccountNo: current.bankAccountNo ?? "",
                taxEnabled: current.taxEnabled,
                socialSecurityEnabled: current.socialSecurityEnabled,
              }
            : emptySalaryForm,
        );
      } catch (error) {
        if (!cancelled)
          toast.error(errorText(error, "โหลดข้อมูลเงินเดือนไม่สำเร็จ"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  /** รายการประจำสุทธิ: รายรับประจำ − รายการหักประจำ */
  const recurringTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const amount = Number(item.amount ?? 0);
        return item.type === "DEDUCTION" ? sum - amount : sum + amount;
      }, 0),
    [items],
  );

  const monthlyTotal = useMemo(
    () => Number(form.baseSalary || 0) + recurringTotal,
    [form.baseSalary, recurringTotal],
  );

  const basisOption = useMemo(
    () =>
      SALARY_BASIS_OPTIONS.find(
        (option) => option.value === form.salaryBasis,
      ) ?? SALARY_BASIS_OPTIONS[0],
    [form.salaryBasis],
  );

  async function reloadItems() {
    const result = await getPayrollCompensationItems({
      employeeId,
      pageSize: 100,
    });
    setItems(result.items ?? []);
  }

  async function save() {
    if (!form.baseSalary) {
      toast.error(`กรุณากรอก${basisOption.amountLabel}`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        effectiveDate: form.effectiveDate,
        baseSalary: form.baseSalary,
        salaryBasis: form.salaryBasis,
        bankName: form.bankName || undefined,
        bankAccountNo: form.bankAccountNo || undefined,
        taxEnabled: form.taxEnabled,
        socialSecurityEnabled: form.socialSecurityEnabled,
      };

      const saved = compensation
        ? await updateEmployeeCompensation(compensation.id, payload)
        : await createEmployeeCompensation({
            companyId,
            employeeId,
            ...payload,
          });

      setCompensation(saved);
      onSaved();
      toast.success("บันทึกเงินเดือนแล้ว");
    } catch (error) {
      toast.error(errorText(error, "บันทึกเงินเดือนไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function saveItem() {
    if (!itemForm.name.trim() || !itemForm.amount) {
      toast.error("กรุณากรอกชื่อรายการและจำนวนเงิน");
      return;
    }

    setSavingItem(true);
    try {
      await createPayrollCompensationItem({
        companyId,
        employeeId,
        compensationId: compensation?.id ?? null,
        code:
          itemForm.code.trim().toUpperCase() ||
          `ITEM_${Date.now().toString(36).toUpperCase()}`,
        name: itemForm.name.trim(),
        type: itemForm.type,
        amount: Number(itemForm.amount),
        effectiveDate: itemForm.effectiveDate,
        isTaxable: itemForm.type === "EARNING" ? itemForm.isTaxable : false,
        isSocialSecurityBase:
          itemForm.type === "EARNING" ? itemForm.isSocialSecurityBase : false,
        prorateByEmploymentDays: itemForm.prorateByEmploymentDays,
        status: "ACTIVE",
      });

      setItemModalOpen(false);
      setItemForm(emptyItemForm);
      await reloadItems();
      toast.success("เพิ่มรายการประจำแล้ว");
    } catch (error) {
      toast.error(errorText(error, "เพิ่มรายการประจำไม่สำเร็จ"));
    } finally {
      setSavingItem(false);
    }
  }

  /**
   * สลับธง "คิดภาษี / เข้าฐานประกันสังคม" ของรายการประจำได้จากตาราง
   *
   * เดิมตั้งได้แค่ตอนสร้าง พอสร้างไปแล้วต้องแก้ผ่าน API เท่านั้น
   * ซึ่งเป็นที่มาของกรณีเงินประจำตำแหน่งที่ไม่เข้าฐานประกันสังคมทั้งที่ควรเข้า
   * และไม่มีใครเห็นเพราะหน้าจอไม่เคยแสดงธงนี้เลย
   *
   * บันทึกทันทีที่ติ๊ก เพราะเป็นค่าเดียวจบ ไม่ใช่ฟอร์มที่ต้องกรอกหลายช่องแล้วกดยืนยัน
   * แต่ยังต้องคำนวณเงินเดือนของงวดใหม่ ธงถึงจะไปมีผลกับยอดที่จ่ายจริง
   */
  async function toggleItemFlag(
    item: EmployeeCompensationItem,
    field: "isTaxable" | "isSocialSecurityBase",
    checked: boolean,
  ) {
    setTogglingItemId(item.id);
    try {
      await updatePayrollCompensationItem(item.id, { [field]: checked });
      await reloadItems();
      toast.success(
        checked
          ? `${item.name} เข้า${field === "isTaxable" ? "การคิดภาษี" : "ฐานประกันสังคม"}แล้ว`
          : `${item.name} ไม่เข้า${field === "isTaxable" ? "การคิดภาษี" : "ฐานประกันสังคม"}แล้ว`,
      );
    } catch (error) {
      toast.error(errorText(error, "บันทึกไม่สำเร็จ"));
    } finally {
      setTogglingItemId(null);
    }
  }

  return (
    <div>
      {!loading && !compensation ? (
        <Notice tone="warning">
          พนักงานคนนี้ยังไม่มีเงินเดือนในระบบ จะไม่ถูกดึงเข้ารอบจ่าย —
          กรอกเงินเดือนแล้วกดบันทึก
        </Notice>
      ) : null}

      <TabSection
        title="เงินเดือนและบัญชีรับเงิน"
        description={'เงินเพิ่มประจำอื่น ๆ ให้เพิ่มที่ "รายการประจำ" ด้านล่าง'}
      >
        <FieldGrid columns={3}>
          <Field label="ฐานค่าจ้าง" hint={basisOption.hint}>
            <Select
              value={form.salaryBasis}
              onChange={(event) =>
                setForm((f) => ({
                  ...f,
                  salaryBasis: event.target.value as SalaryBasis,
                }))
              }
            >
              {SALARY_BASIS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={basisOption.amountLabel} required>
            <MoneyInput
              value={form.baseSalary}
              onChange={(event) =>
                setForm((f) => ({ ...f, baseSalary: event.target.value }))
              }
              placeholder="0.00"
              align="left"
            />
          </Field>
          <Field label="มีผลตั้งแต่">
            <TextInput
              type="date"
              value={form.effectiveDate}
              onChange={(event) =>
                setForm((f) => ({ ...f, effectiveDate: event.target.value }))
              }
            />
          </Field>
        </FieldGrid>

        <div className="mt-4 border-t border-brand-100 pt-4">
          <FieldGrid columns={2}>
            <Field label="ธนาคาร" hint="ใช้ตอนสร้างไฟล์โอนเงิน">
              <Select
                value={form.bankName}
                onChange={(event) =>
                  setForm((f) => ({ ...f, bankName: event.target.value }))
                }
              >
                <option value="">เลือกธนาคาร</option>
                {THAI_BANKS.map((bank) => (
                  <option key={bank.code} value={bank.name}>
                    {bank.name}
                  </option>
                ))}
                {/* ข้อมูลเก่าที่พิมพ์ชื่อเองไว้ ต้องยังเลือกค้างไว้ได้ ไม่งั้นจะโดนล้างตอนบันทึก */}
                {form.bankName &&
                !THAI_BANKS.some((bank) => bank.name === form.bankName) ? (
                  <option value={form.bankName}>{form.bankName}</option>
                ) : null}
              </Select>
            </Field>
            <Field label="เลขที่บัญชี">
              <TextInput
                value={form.bankAccountNo}
                onChange={(event) =>
                  setForm((f) => ({ ...f, bankAccountNo: event.target.value }))
                }
              />
            </Field>
          </FieldGrid>

          <div className="mt-4 flex flex-wrap gap-6">
            <Checkbox
              label="หักภาษี ณ ที่จ่าย"
              checked={form.taxEnabled}
              onChange={(event) =>
                setForm((f) => ({ ...f, taxEnabled: event.target.checked }))
              }
            />
            <Checkbox
              label="หักประกันสังคม"
              checked={form.socialSecurityEnabled}
              onChange={(event) =>
                setForm((f) => ({
                  ...f,
                  socialSecurityEnabled: event.target.checked,
                }))
              }
            />
          </div>
        </div>
      </TabSection>

      <TabSection
        title="รายการประจำ"
        description="เงินเพิ่มและรายการหักที่เข้าทุกงวดจนกว่าจะลบ เช่น ค่าตำแหน่ง ค่าเดินทาง ค่าโทรศัพท์"
        actions={
          <Button
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setItemModalOpen(true)}
          >
            เพิ่มรายการ
          </Button>
        }
      >
        {/*
         * รายการทีละใบ ไม่ใช่ตาราง — หนึ่งรายการมีทั้งชื่อ ประเภท ช่วงที่มีผล
         * วิธีคิดตอนเข้า/ออกกลางงวด ช่องติ๊กสองช่อง และจำนวนเงิน
         * ยัดลงตารางแล้วต้องกว้าง 48rem จนล้นกล่องป๊อปอัพ
         */}
        {loading && items.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-400">
            กำลังโหลด…
          </p>
        ) : items.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ยังไม่มีรายการประจำ
            </p>
            <p className="mt-1 text-[12.5px] text-slate-400">
              เช่น ค่าครองชีพ เบี้ยขยัน หรือหักค่าที่จอดรถ
            </p>
          </div>
        ) : (
          <div className="divide-y divide-brand-100 border-y border-brand-100">
            {items.map((row) => (
              <RecurringRow
                key={row.id}
                row={row}
                busy={togglingItemId === row.id}
                onToggle={(field, value) =>
                  void toggleItemFlag(row, field, value)
                }
                onDelete={() =>
                  setDialog({
                    title: `ลบ ${row.name}?`,
                    description:
                      "รายการนี้จะไม่เข้างวดถัดไปอีก และกู้คืนจากหน้าจอไม่ได้ · ยอดที่จ่ายไปแล้วในงวดก่อนหน้ายังอยู่ครบ",
                    confirmLabel: "ลบรายการ",
                    tone: "red",
                    onConfirm: async () => {
                      await deletePayrollCompensationItem(row.id);
                      await reloadItems();
                      toast.success("ลบรายการแล้ว");
                    },
                  })
                }
              />
            ))}
          </div>
        )}
      </TabSection>

      {/* ยอดรวมอยู่ท้ายสุด เพราะต้องเห็นเงินเดือนกับรายการประจำครบก่อนถึงจะรวมได้ */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-brand-100 bg-brand-50/50 px-5 py-3.5 3xl:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-600">
          <span>{basisOption.amountLabel}</span>
          <span className="text-[15px] 3xl:text-[16px] 4xl:text-[17px] font-bold tabular-nums text-slate-900">
            {money(form.baseSalary || 0)}
          </span>
          <span className="text-slate-400">+</span>
          <span>รายการประจำ</span>
          <span
            className={joinClassName(
              "text-[15px] 3xl:text-[16px] 4xl:text-[17px] font-bold tabular-nums",
              recurringTotal < 0 ? "text-rose-700" : "text-slate-900",
            )}
          >
            {recurringTotal < 0 ? "−" : ""}
            {money(Math.abs(recurringTotal))}
          </span>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            {/* รายวัน/รายชั่วโมงไม่มียอด "ต่อเดือน" ตายตัว ต้องรอจำนวนวันที่มาทำงานจริง */}
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              {form.salaryBasis === "MONTHLY"
                ? "รวมต่อเดือนก่อนหักภาษี / ประกันสังคม"
                : "รวมรายการประจำต่อเดือน (ยังไม่รวมค่าแรงตามวันทำงานจริง)"}
            </p>
            <p className="text-[22px] font-bold leading-tight tabular-nums tracking-tight text-slate-900 3xl:text-[24px]">
              {money(
                form.salaryBasis === "MONTHLY" ? monthlyTotal : recurringTotal,
              )}
            </p>
          </div>

          <Button
            variant="primary"
            icon={<Save className="h-4 w-4" />}
            onClick={() => void save()}
            loading={saving}
            disabled={loading}
          >
            บันทึกเงินเดือน
          </Button>
        </div>
      </div>

      <Modal
        open={itemModalOpen}
        title="เพิ่มรายการประจำ"
        description="จะเข้าทุกงวดที่คำนวณหลังวันที่มีผล"
        size="md-wide"
        onClose={() => setItemModalOpen(false)}
        footer={
          <ModalActions
            onCancel={() => setItemModalOpen(false)}
            onConfirm={() => void saveItem()}
            confirmLabel="เพิ่มรายการ"
            loading={savingItem}
          />
        }
      >
        <FieldGrid columns={3}>
          {/* จำนวนเงินมาก่อน เพราะเป็นค่าที่คนกรอกเสมอและกรอกก่อนอย่างอื่น */}
          <Field label="จำนวนเงิน" required>
            <MoneyInput
              align="left"
              value={itemForm.amount}
              onChange={(event) =>
                setItemForm((f) => ({ ...f, amount: event.target.value }))
              }
              placeholder="0.00"
            />
          </Field>
          <Field label="ประเภท">
            <Select
              value={itemForm.type}
              onChange={(event) =>
                setItemForm((f) => ({
                  ...f,
                  type: event.target.value as "EARNING" | "DEDUCTION",
                }))
              }
            >
              <option value="EARNING">รายรับ</option>
              <option value="DEDUCTION">รายหัก</option>
            </Select>
          </Field>
          <Field label="มีผลตั้งแต่">
            <TextInput
              type="date"
              value={itemForm.effectiveDate}
              onChange={(event) =>
                setItemForm((f) => ({
                  ...f,
                  effectiveDate: event.target.value,
                }))
              }
            />
          </Field>
          <Field
            label="ชื่อที่แสดงในสลิป"
            required
            className="xl:col-span-2"
            hint={
              pickableComponents.length
                ? "พิมพ์เองได้ หรือเลือกจากรายการที่ระบบมีให้ แล้วจะเติมรหัสและธงให้"
                : "พิมพ์ชื่อที่จะขึ้นในสลิป"
            }
          >
            <PayrollItemNameInput
              value={itemForm.name}
              options={pickableComponents}
              placeholder="เช่น ค่าครองชีพ"
              onChange={changeItemName}
            />
          </Field>
          <Field label="รหัส" hint="เว้นว่าง = ระบบสร้างให้">
            <TextInput
              value={itemForm.code}
              onChange={(event) =>
                setItemForm((f) => ({ ...f, code: event.target.value }))
              }
            />
          </Field>
        </FieldGrid>

        {itemForm.type === "EARNING" ? (
          <div className="mt-4 flex flex-wrap gap-6">
            <Checkbox
              label="นำไปคิดภาษี"
              checked={itemForm.isTaxable}
              onChange={(event) =>
                setItemForm((f) => ({ ...f, isTaxable: event.target.checked }))
              }
            />
            <Checkbox
              label="เป็นฐานประกันสังคม"
              checked={itemForm.isSocialSecurityBase}
              onChange={(event) =>
                setItemForm((f) => ({
                  ...f,
                  isSocialSecurityBase: event.target.checked,
                }))
              }
            />
          </div>
        ) : null}

        {/*
          อยู่นอกเงื่อนไข EARNING เพราะรายการหักก็ต้องเลือกได้เหมือนกัน
          หักค่าหอพักควรหารตามวัน แต่หักผ่อนชำระงวดคงที่ต้องหักเต็ม
        */}
        <div className="mt-4 border-t border-slate-200 pt-4">
          <Checkbox
            label="คิดตามสัดส่วนวันที่เป็นพนักงานจริง"
            checked={itemForm.prorateByEmploymentDays}
            onChange={(event) =>
              setItemForm((f) => ({
                ...f,
                prorateByEmploymentDays: event.target.checked,
              }))
            }
          />
          <p className="mt-1.5 pl-6 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] leading-relaxed text-slate-500">
            {itemForm.prorateByEmploymentDays
              ? "พนักงานที่เข้าใหม่หรือลาออกกลางงวด จะได้ตามจำนวนวันที่เป็นพนักงานจริง เช่น เข้าวันที่ 16 ได้ครึ่งเดียว — เหมาะกับค่าอาหาร ค่าเดินทาง ค่าตำแหน่ง"
              : "ได้เต็มจำนวนเสมอ ไม่ว่าจะเป็นพนักงานกี่วันในงวดนั้น — เหมาะกับประกันกลุ่มรายเดือน หรือค่าผ่อนชำระที่งวดละเท่ากันตายตัว"}
          </p>
        </div>
      </Modal>

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
