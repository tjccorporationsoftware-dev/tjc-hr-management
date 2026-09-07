"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Section,
  Field,
  FieldGrid,
  HAIRLINE,
  IconButton,
  MoneyInput,
  Notice,
  Select,
  TextInput,
  joinClassName,
} from "@/components/kit";
import { LoadingState } from "@/components/common/feedback-state";
import {
  createEmployeeTaxProfile,
  deleteEmployeeTaxAllowance,
  getEmployeeTaxProfiles,
  updateEmployeeTaxProfile,
  upsertEmployeeTaxAllowance,
} from "@/lib/api";
import { allowanceLimitText, errorText, money } from "@/lib/payroll-format";
import type {
  EmployeeTaxProfile,
  PayrollTaxAllowanceType,
} from "@/types/payroll";

/**
 * ค่าลดหย่อนภาษีของพนักงานหนึ่งคน
 * ------------------------------
 * แสดงเฉพาะรายการที่พนักงานแจ้งไว้จริง ที่เหลือเลือกจากดรอปดาวน์แล้วกดเพิ่ม
 * เพราะปีภาษีหนึ่งมีประเภทค่าลดหย่อนหลายสิบตัว แต่คนหนึ่งใช้จริงไม่กี่ตัว
 *
 * ไม่มีสายอนุมัติ บันทึกแล้วใช้คำนวณทันที คนที่ไม่กรอกก็ยังถูกคิดภาษีด้วย
 * ลดหย่อนส่วนตัว + ประกันสังคมที่ tax engine ใส่ให้อยู่แล้ว
 */

type Props = {
  companyId: string;
  employeeId: string;
  taxYearId: string;
  allowanceTypes: PayrollTaxAllowanceType[];
  onSaved: () => void;
};

const maritalOptions = [
  { value: "NOT_SPECIFIED", label: "ไม่ระบุ" },
  { value: "SINGLE", label: "โสด" },
  { value: "MARRIED", label: "สมรส" },
  { value: "DIVORCED", label: "หย่า" },
  { value: "WIDOWED", label: "หม้าย" },
];

export function TaxTab({
  companyId,
  employeeId,
  taxYearId,
  allowanceTypes,
  onSaved,
}: Props) {
  const [profile, setProfile] = useState<EmployeeTaxProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxId, setTaxId] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("NOT_SPECIFIED");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  /** id ของประเภทค่าลดหย่อนที่แสดงเป็นแถวอยู่ตอนนี้ */
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [typeToAdd, setTypeToAdd] = useState("");

  const activeTypes = useMemo(
    () => allowanceTypes.filter((type) => type.status === "ACTIVE"),
    [allowanceTypes],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!taxYearId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const result = await getEmployeeTaxProfiles({
          employeeId,
          taxYearId,
          pageSize: 1,
        });
        if (cancelled) return;

        const current = result.data[0] ?? null;
        setProfile(current);
        setTaxId(current?.taxId ?? "");
        setMaritalStatus(current?.maritalStatus || "NOT_SPECIFIED");

        const next: Record<string, string> = {};
        const picked: string[] = [];
        for (const type of activeTypes) {
          const existing = current?.allowances?.find(
            (allowance) => allowance.allowanceTypeId === type.id,
          );
          next[type.id] = existing ? String(existing.declaredAmount ?? "") : "";
          if (existing) picked.push(type.id);
        }
        setAmounts(next);
        setPickedIds(picked);
      } catch (error) {
        if (!cancelled) toast.error(errorText(error, "โหลดค่าลดหย่อนไม่สำเร็จ"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [employeeId, taxYearId, activeTypes]);

  const total = useMemo(
    () =>
      Object.values(amounts).reduce((sum, value) => sum + Number(value || 0), 0),
    [amounts],
  );

  /** รายการที่แสดงเป็นแถวอยู่ เรียงตามลำดับที่ตั้งไว้ในปีภาษี */
  const pickedTypes = useMemo(
    () => activeTypes.filter((type) => pickedIds.includes(type.id)),
    [activeTypes, pickedIds],
  );

  const availableTypes = useMemo(
    () => activeTypes.filter((type) => !pickedIds.includes(type.id)),
    [activeTypes, pickedIds],
  );

  /** สร้างข้อมูลภาษีให้ถ้ายังไม่มี แล้วคืน id เพื่อบันทึกค่าลดหย่อนต่อ */
  async function ensureProfileId() {
    if (profile?.id) return profile.id;

    const created = await createEmployeeTaxProfile({
      companyId,
      employeeId,
      taxYearId,
      taxId: taxId || undefined,
      maritalStatus,
    });
    setProfile(created);
    return created.id;
  }

  async function save() {
    if (!taxYearId) return;

    setSaving(true);
    try {
      const profileId = await ensureProfileId();

      await updateEmployeeTaxProfile(profileId, {
        taxId: taxId || undefined,
        maritalStatus,
      });

      for (const type of activeTypes) {
        const nextAmount = (amounts[type.id] ?? "").trim();
        const existing = profile?.allowances?.find(
          (allowance) => allowance.allowanceTypeId === type.id,
        );
        const currentAmount = existing ? String(existing.declaredAmount ?? "") : "";
        if (Number(nextAmount || 0) === Number(currentAmount || 0)) continue;

        if (!nextAmount || Number(nextAmount) === 0) {
          if (existing) await deleteEmployeeTaxAllowance(existing.id);
          continue;
        }

        await upsertEmployeeTaxAllowance(profileId, {
          allowanceTypeId: type.id,
          declaredAmount: nextAmount,
        });
      }

      const refreshed = await getEmployeeTaxProfiles({
        employeeId,
        taxYearId,
        pageSize: 1,
      });
      setProfile(refreshed.data[0] ?? null);
      onSaved();
      toast.success("บันทึกค่าลดหย่อนแล้ว ใช้คำนวณได้ทันที");
    } catch (error) {
      toast.error(errorText(error, "บันทึกค่าลดหย่อนไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  if (!taxYearId) {
    return (
      <Notice tone="warning">
        ยังไม่มีปีภาษีของบริษัทนี้ — ไปสร้างที่หน้า ตั้งค่า &gt; ภาษี ก่อน
        ระบบจึงจะหักภาษีให้ได้
      </Notice>
    );
  }

  if (loading) return <LoadingState title="กำลังโหลดค่าลดหย่อน" />;

  return (
    <div>
      <Section title="ข้อมูลผู้เสียภาษี">
        <FieldGrid columns={2}>
          <Field label="เลขประจำตัวผู้เสียภาษี" hint="ใช้ตอนยื่น ภ.ง.ด.1">
            <TextInput
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
              placeholder="เลข 13 หลัก"
            />
          </Field>
          <Field label="สถานะสมรส">
            <Select
              value={maritalStatus}
              onChange={(event) => setMaritalStatus(event.target.value)}
            >
              {maritalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGrid>
      </Section>

      <Section
        title="ค่าลดหย่อนที่พนักงานแจ้ง"
        description="เลือกรายการที่พนักงานใช้จริงมาเพิ่ม แล้วกรอกจำนวนเงิน"
      >
        {activeTypes.length === 0 ? (
          <Notice tone="warning">
            ปีภาษีนี้ยังไม่มีประเภทค่าลดหย่อน — ตั้งค่าที่หน้า ตั้งค่า &gt; ภาษี
          </Notice>
        ) : (
          <>
            {/* เลือกจากดรอปดาวน์แล้วกดเพิ่ม จะได้ไม่ต้องเลื่อนผ่านรายการที่ไม่ได้ใช้ */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={typeToAdd}
                onChange={(event) => setTypeToAdd(event.target.value)}
                className="w-full sm:w-80"
                aria-label="เลือกค่าลดหย่อนที่จะเพิ่ม"
                disabled={availableTypes.length === 0}
              >
                <option value="">
                  {availableTypes.length
                    ? "เลือกค่าลดหย่อนที่จะเพิ่ม"
                    : "เพิ่มครบทุกรายการแล้ว"}
                </option>
                {availableTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.nameTh}
                  </option>
                ))}
              </Select>

              <Button
                icon={<Plus className="h-4 w-4" />}
                disabled={!typeToAdd}
                onClick={() => {
                  if (!typeToAdd) return;
                  setPickedIds((current) => [...current, typeToAdd]);
                  setTypeToAdd("");
                }}
              >
                เพิ่มรายการ
              </Button>
            </div>

            {pickedTypes.length === 0 ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] text-slate-400">
                ยังไม่ได้แจ้งค่าลดหย่อน — ระบบจะคิดให้ด้วยลดหย่อนส่วนตัวและประกันสังคมเท่านั้น
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                {pickedTypes.map((type) => (
                  <div
                    key={type.id}
                    className="grid items-center gap-3 py-2.5 sm:grid-cols-[1fr_180px_auto]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-medium text-slate-800">
                        {type.nameTh}
                      </p>
                      <p className="text-xs 3xl:text-[12.5px] 4xl:text-[13px] text-slate-400">
                        {allowanceLimitText(type)}
                        {type.requiresAttachment ? " · ต้องมีหลักฐาน" : ""}
                      </p>
                    </div>
                    <MoneyInput
                      value={amounts[type.id] ?? ""}
                      onChange={(event) =>
                        setAmounts((current) => ({
                          ...current,
                          [type.id]: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                      aria-label={type.nameTh}
                    />
                    <IconButton
                      title="เอารายการนี้ออก"
                      tone="danger"
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => {
                        // ล้างยอดด้วย ตอนบันทึกจะได้ลบรายการเดิมที่เคยแจ้งไว้
                        setAmounts((current) => ({ ...current, [type.id]: "" }));
                        setPickedIds((current) =>
                          current.filter((id) => id !== type.id),
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div
          className={joinClassName(
            "mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4",
            HAIRLINE,
          )}
        >
          <p className="text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] text-slate-500">
            รวมค่าลดหย่อนที่แจ้ง{" "}
            <strong className="text-base text-slate-900 tabular-nums">
              {money(total)}
            </strong>{" "}
            บาท
            <span className="mt-0.5 block text-xs 3xl:text-[12.5px] 4xl:text-[13px] text-slate-400">
              ยังไม่รวมลดหย่อนส่วนตัวและประกันสังคมที่ระบบใส่ให้อัตโนมัติ
            </span>
          </p>
          <Button
            variant="primary"
            icon={<Save className="h-4 w-4" />}
            onClick={() => void save()}
            loading={saving}
            disabled={activeTypes.length === 0}
          >
            บันทึกค่าลดหย่อน
          </Button>
        </div>
      </Section>
    </div>
  );
}
