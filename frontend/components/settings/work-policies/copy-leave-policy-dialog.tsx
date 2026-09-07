"use client";

import { useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";

import {
  ModalField,
  PolicyModal,
  modalInputClass,
} from "@/components/settings/work-policies/policy-modal";
import { copyLeavePolicies } from "@/lib/api";
import type { CopyLeavePolicyResult } from "@/types/leave";
import type { OrganizationOption } from "@/types/employee";

/**
 * คัดลอกนโยบายการลาข้ามบริษัท/สาขา
 *
 * ใช้ตอนตั้งค่าบริษัทแรกเสร็จแล้วอยากให้บริษัทอื่นเริ่มจากค่าเดียวกัน
 * จับคู่ประเภทพนักงานด้วยรหัส (รายเดือน/รายวัน/เหมาจ่าย)
 * ประเภทพนักงานที่ปลายทางไม่มี จะถูกข้ามไปเงียบ ๆ
 */
export function CopyLeavePolicyDialog({
  open,
  companies,
  branches,
  targetCompanyId,
  targetBranchId,
  onClose,
  onCopied,
}: {
  open: boolean;
  companies: OrganizationOption[];
  branches: OrganizationOption[];
  targetCompanyId: string;
  targetBranchId: string | null;
  onClose: () => void;
  onCopied: () => void;
}) {
  const [fromCompanyId, setFromCompanyId] = useState("");
  const [fromBranchId, setFromBranchId] = useState("");
  const [mode, setMode] = useState<"MERGE" | "REPLACE">("MERGE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopyLeavePolicyResult | null>(null);

  const sourceCompanies = useMemo(
    () => companies.filter((item) => item.id !== targetCompanyId),
    [companies, targetCompanyId],
  );

  const sourceBranches = useMemo(
    () => branches.filter((item) => item.companyId === fromCompanyId),
    [branches, fromCompanyId],
  );

  const targetCompanyName =
    companies.find((item) => item.id === targetCompanyId)?.nameTh ?? "-";
  const targetBranchName = targetBranchId
    ? (branches.find((item) => item.id === targetBranchId)?.nameTh ?? null)
    : null;

  async function submit() {
    if (!fromCompanyId) {
      setError("กรุณาเลือกบริษัทต้นทาง");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const copied = await copyLeavePolicies({
        fromCompanyId,
        fromBranchId: fromBranchId || null,
        toCompanyId: targetCompanyId,
        toBranchId: targetBranchId,
        mode,
      });

      setResult(copied);
      onCopied();
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "คัดลอกนโยบายการลาไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <PolicyModal
      open={open}
      title="คัดลอกนโยบายการลา"
      description="คัดลอกประเภทลาที่เปิดใช้ พร้อมโควตาและค่าปรับ จากอีกบริษัทหรือสาขาหนึ่ง"
      icon={Copy}
      saving={saving}
      error={error}
      submitLabel={result ? "คัดลอกอีกครั้ง" : "คัดลอก"}
      onClose={close}
      onSubmit={() => void submit()}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold leading-5 text-slate-900">
          ปลายทาง: <strong>{targetCompanyName}</strong>
          {targetBranchName ? ` · สาขา ${targetBranchName}` : " · ค่ามาตรฐานบริษัท"}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="บริษัทต้นทาง" required>
            <select
              value={fromCompanyId}
              disabled={saving}
              onChange={(event) => {
                setFromCompanyId(event.target.value);
                setFromBranchId("");
              }}
              className={modalInputClass}
            >
              <option value="">เลือกบริษัท</option>
              {sourceCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nameTh || company.nameEn || company.code}
                </option>
              ))}
            </select>
          </ModalField>

          <ModalField
            label="สาขาต้นทาง"
            hint="เว้นว่าง = ใช้ค่ามาตรฐานของบริษัทต้นทาง"
          >
            <select
              value={fromBranchId}
              disabled={saving || !fromCompanyId || sourceBranches.length === 0}
              onChange={(event) => setFromBranchId(event.target.value)}
              className={modalInputClass}
            >
              <option value="">ค่ามาตรฐานบริษัท</option>
              {sourceBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.nameTh || branch.nameEn || branch.code}
                </option>
              ))}
            </select>
          </ModalField>
        </div>

        <ModalField label="วิธีคัดลอก">
          <div className="space-y-2">
            <ModeOption
              label="รวมกับของเดิม (แนะนำ)"
              description="เขียนทับเฉพาะประเภทลาที่ต้นทางมี ประเภทอื่นของปลายทางคงไว้เหมือนเดิม"
              value="MERGE"
              current={mode}
              disabled={saving}
              onSelect={setMode}
            />
            <ModeOption
              label="แทนที่ทั้งหมด"
              description="ประเภทลาของปลายทางที่ต้นทางไม่ได้เปิดใช้ จะถูกปิดใช้ไปด้วย"
              value="REPLACE"
              current={mode}
              disabled={saving}
              onSelect={setMode}
            />
          </div>
        </ModalField>

        {result ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-emerald-800">
            คัดลอกสำเร็จ — ประเภทลา {result.copiedLeaveTypes.toLocaleString("th-TH")} รายการ
            {" · "}
            นโยบาย {result.copiedPolicies.toLocaleString("th-TH")} แถว
          </p>
        ) : null}

        {saving ? (
          <p className="flex items-center gap-2 text-xs 3xl:text-[12.5px] 4xl:text-[13px] font-semibold text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            กำลังคัดลอก…
          </p>
        ) : null}
      </div>
    </PolicyModal>
  );
}

function ModeOption({
  label,
  description,
  value,
  current,
  disabled,
  onSelect,
}: {
  label: string;
  description: string;
  value: "MERGE" | "REPLACE";
  current: "MERGE" | "REPLACE";
  disabled?: boolean;
  onSelect: (value: "MERGE" | "REPLACE") => void;
}) {
  const active = current === value;

  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition ${
        active
          ? "border-slate-300 bg-slate-50 ring-2 ring-brand-100"
          : "border-slate-200 bg-white hover:border-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        checked={active}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
      />
      <span className="min-w-0">
        <span className="block text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] font-bold text-slate-800">{label}</span>
        <span className="mt-0.5 block text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-medium leading-4 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}
