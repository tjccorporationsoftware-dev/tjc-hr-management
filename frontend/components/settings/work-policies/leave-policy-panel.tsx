"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  X,
} from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  Badge,
  Button,
  Checkbox,
  Notice,
  SearchInput,
  Toolbar,
  joinClassName,
} from "@/components/kit";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/feedback-state";
import {
  modalInputClass,
  modalInputCompactClass,
} from "@/components/settings/work-policies/policy-modal";
import type { WorkPolicyScope } from "@/components/settings/work-policies/work-policy-types";
import {
  disableLeaveCatalogItem,
  enableLeaveCatalogItem,
  getLeaveCatalog,
  getLeaveTypeMatrix,
  saveLeaveTypeMatrix,
} from "@/lib/api";
import type {
  LeaveCatalogRow,
  LeaveGenderEligibility,
  LeaveRoundingMode,
  LeaveServiceStartBasis,
  LeaveTypeMatrixResponse,
  SaveLeaveTypeMatrixForm,
} from "@/types/leave";

/* ------------------------------------------------------------------ */
/* form state                                                          */
/* ------------------------------------------------------------------ */

/** โควตาขั้นบันได 1 ขั้น — "4 เดือน / 3 วัน" */
type TierDraft = {
  key: string;
  minServiceMonths: string;
  quotaDays: string;
};

/** 1 แถวของตารางประเภทพนักงาน */
type PolicyDraft = {
  employeeTypeId: string;
  employeeTypeName: string;
  isOwnScope: boolean;
  inheritedFrom: "COMPANY" | "ALL_EMPLOYEE_TYPES" | null;
  unpaidDeductionMultiplier: string;
  includeInTax: boolean;
  includeInSocialSecurity: boolean;
  allowCarryForward: boolean;
  carryForwardLimitDays: string;
  requireApproval: boolean;
  tiers: TierDraft[];
};

/** เงื่อนไขระดับประเภทลา — มีผลทุกสาขา */
type TypeDraft = {
  nameTh: string;
  nameEn: string;
  advanceNoticeDays: string;
  maxBackdatedDays: string;
  maxConsecutiveDays: string;
  quotaAccrualYears: string;
  isPaid: boolean;
  requiresAttachment: boolean;
  enforceQuotaLimit: boolean;
  roundingMode: LeaveRoundingMode;
  genderEligibility: LeaveGenderEligibility;
  serviceStartBasis: LeaveServiceStartBasis;
  requireProbationPassed: boolean;
  prorateFirstYear: boolean;
  includeHoliday: boolean;
  includeWeekend: boolean;
  allowHalfDay: boolean;
  allowHourly: boolean;
};

let tierKeySeed = 0;
function nextTierKey() {
  tierKeySeed += 1;
  return `tier-${tierKeySeed}`;
}

function toInputNumber(value: unknown, fallback = "0") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : fallback;
}

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** แปลง response เป็น draft ที่แก้ inline ได้ */
function draftsFromMatrix(matrix: LeaveTypeMatrixResponse): {
  type: TypeDraft;
  policies: PolicyDraft[];
} {
  const leaveType = matrix.leaveType;

  // ลาติดต่อกันสูงสุดใช้ร่วมกันทุกแถวในเอกสารต้นฉบับ จึงหยิบค่าแรกที่มีมาแสดง
  const sharedConsecutive =
    matrix.rows.find((row) => row.policy?.maxConsecutiveDays != null)?.policy
      ?.maxConsecutiveDays ?? null;

  return {
    type: {
      nameTh: leaveType.nameTh,
      nameEn: leaveType.nameEn ?? "",
      advanceNoticeDays: toInputNumber(leaveType.advanceNoticeDays),
      maxBackdatedDays: toInputNumber(leaveType.maxBackdatedDays),
      maxConsecutiveDays:
        sharedConsecutive == null ? "" : String(sharedConsecutive),
      quotaAccrualYears: toInputNumber(leaveType.quotaAccrualYears, "1"),
      isPaid: leaveType.isPaid,
      requiresAttachment: leaveType.requiresAttachment,
      enforceQuotaLimit: leaveType.enforceQuotaLimit ?? true,
      roundingMode: leaveType.roundingMode ?? "NONE",
      genderEligibility: leaveType.genderEligibility ?? "ALL",
      serviceStartBasis: leaveType.serviceStartBasis ?? "HIRE_DATE",
      requireProbationPassed: leaveType.requireProbationPassed ?? false,
      prorateFirstYear: leaveType.prorateFirstYear ?? false,
      includeHoliday: leaveType.includeHoliday ?? false,
      includeWeekend: leaveType.includeWeekend ?? false,
      allowHalfDay: leaveType.allowHalfDay,
      allowHourly: leaveType.allowHourly,
    },
    policies: matrix.rows.map((row) => ({
      employeeTypeId: row.employeeType.id,
      employeeTypeName: row.employeeType.nameTh,
      isOwnScope: row.isOwnScope,
      inheritedFrom: row.inheritedFrom,
      unpaidDeductionMultiplier: toInputNumber(
        row.policy?.unpaidDeductionMultiplier,
      ),
      includeInTax: row.policy?.includeInTax ?? true,
      includeInSocialSecurity: row.policy?.includeInSocialSecurity ?? false,
      allowCarryForward: row.policy?.allowCarryForward ?? false,
      carryForwardLimitDays: toInputNumber(row.policy?.carryForwardLimitDays),
      requireApproval: row.policy?.requireApproval ?? true,
      tiers: row.policy?.quotaTiers?.length
        ? row.policy.quotaTiers.map((tier) => ({
            key: nextTierKey(),
            minServiceMonths: String(tier.minServiceMonths),
            quotaDays: toInputNumber(tier.quotaDays),
          }))
        : [
            {
              key: nextTierKey(),
              minServiceMonths: "0",
              quotaDays: toInputNumber(row.policy?.annualQuotaDays),
            },
          ],
    })),
  };
}

/* ------------------------------------------------------------------ */
/* panel                                                               */
/* ------------------------------------------------------------------ */

export function LeavePolicyPanel({
  scope,
  canManage,
  onRequestCopy,
  isBranchScoped = false,
}: {
  scope: WorkPolicyScope;
  canManage: boolean;
  onRequestCopy?: () => void;
  /** บัญชีระดับสาขา — เปิด/ปิดประเภทลาและแก้ค่ากลางของบริษัทไม่ได้ */
  isBranchScoped?: boolean;
}) {
  const [catalog, setCatalog] = useState<LeaveCatalogRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, enabled: 0, custom: 0 });
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);

  const [matrix, setMatrix] = useState<LeaveTypeMatrixResponse | null>(null);
  const [typeDraft, setTypeDraft] = useState<TypeDraft | null>(null);
  const [policyDrafts, setPolicyDrafts] = useState<PolicyDraft[]>([]);
  const [dirty, setDirty] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  /** ประเภทพนักงานที่กางค่าตั้งอยู่ (กางได้ทีละแถว) */
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // กันไม่ให้ผลลัพธ์ของ request เก่ามาทับ selection ปัจจุบัน
  const detailRequestRef = useRef(0);

  /* ---------------- data ---------------- */

  const loadCatalog = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        if (mode === "refresh") setRefreshing(true);
        setError(null);

        const result = await getLeaveCatalog({ companyId: scope.companyId });
        setCatalog(result.items ?? []);
        setSummary(result.summary ?? { total: 0, enabled: 0, custom: 0 });
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "ไม่สามารถโหลดรายการประเภทการลาได้",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scope.companyId],
  );

  // เลื่อนออกนอกรอบ render เดียวกัน ตามแนวทางเดียวกับ panel อื่นในหน้านี้
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCatalog();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCatalog]);

  const loadDetail = useCallback(
    async (leaveTypeId: string) => {
      const requestId = detailRequestRef.current + 1;
      detailRequestRef.current = requestId;

      try {
        setDetailLoading(true);
        setDetailError(null);

        const result = await getLeaveTypeMatrix(leaveTypeId, scope.branchId);
        if (detailRequestRef.current !== requestId) return;

        const drafts = draftsFromMatrix(result);
        setMatrix(result);
        setTypeDraft(drafts.type);
        setPolicyDrafts(drafts.policies);
        setDirty(false);
      } catch (loadError) {
        if (detailRequestRef.current !== requestId) return;
        setDetailError(
          loadError instanceof Error
            ? loadError.message
            : "ไม่สามารถโหลดนโยบายของประเภทการลานี้ได้",
        );
      } finally {
        if (detailRequestRef.current === requestId) setDetailLoading(false);
      }
    },
    [scope.branchId],
  );

  const selected = useMemo(
    () => catalog.find((item) => item.id === selectedCatalogId) ?? null,
    [catalog, selectedCatalogId],
  );

  // เลือกรายการแรกที่เปิดใช้อยู่ให้อัตโนมัติ
  useEffect(() => {
    if (selectedCatalogId || catalog.length === 0) return;

    const timer = window.setTimeout(() => {
      const firstEnabled = catalog.find((item) => item.enabled) ?? catalog[0];
      if (firstEnabled) setSelectedCatalogId(firstEnabled.id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [catalog, selectedCatalogId]);

  const selectedLeaveTypeId = selected?.companyLeaveType?.id ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedLeaveTypeId) {
        setMatrix(null);
        setTypeDraft(null);
        setPolicyDrafts([]);
        setDirty(false);
        return;
      }

      void loadDetail(selectedLeaveTypeId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedLeaveTypeId, loadDetail]);

  const visibleCatalog = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return catalog.filter((item) => {
      if (showEnabledOnly && !item.enabled) return false;
      if (!keyword) return true;

      return (
        item.referenceCode.toLowerCase().includes(keyword) ||
        item.nameTh.toLowerCase().includes(keyword) ||
        (item.nameEn ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [catalog, search, showEnabledOnly]);

  /* ---------------- actions ---------------- */

  function patchType(patch: Partial<TypeDraft>) {
    setTypeDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }

  function patchPolicy(employeeTypeId: string, patch: Partial<PolicyDraft>) {
    setPolicyDrafts((current) =>
      current.map((row) =>
        row.employeeTypeId === employeeTypeId ? { ...row, ...patch } : row,
      ),
    );
    setDirty(true);
  }

  function patchTier(
    employeeTypeId: string,
    tierKey: string,
    patch: Partial<TierDraft>,
  ) {
    setPolicyDrafts((current) =>
      current.map((row) =>
        row.employeeTypeId === employeeTypeId
          ? {
              ...row,
              tiers: row.tiers.map((tier) =>
                tier.key === tierKey ? { ...tier, ...patch } : tier,
              ),
            }
          : row,
      ),
    );
    setDirty(true);
  }

  function addTier(employeeTypeId: string) {
    setPolicyDrafts((current) =>
      current.map((row) =>
        row.employeeTypeId === employeeTypeId
          ? {
              ...row,
              tiers: [
                ...row.tiers,
                { key: nextTierKey(), minServiceMonths: "12", quotaDays: "0" },
              ],
            }
          : row,
      ),
    );
    setDirty(true);
  }

  function removeTier(employeeTypeId: string, tierKey: string) {
    setPolicyDrafts((current) =>
      current.map((row) =>
        row.employeeTypeId === employeeTypeId
          ? { ...row, tiers: row.tiers.filter((tier) => tier.key !== tierKey) }
          : row,
      ),
    );
    setDirty(true);
  }

  /** คัดค่าของแถวแรกไปทุกแถว — ลดการพิมพ์ซ้ำ 3 รอบ */
  function applyFirstRowToAll() {
    setPolicyDrafts((current) => {
      const [first, ...rest] = current;
      if (!first) return current;

      return [
        first,
        ...rest.map((row) => ({
          ...row,
          unpaidDeductionMultiplier: first.unpaidDeductionMultiplier,
          includeInTax: first.includeInTax,
          includeInSocialSecurity: first.includeInSocialSecurity,
          allowCarryForward: first.allowCarryForward,
          carryForwardLimitDays: first.carryForwardLimitDays,
          requireApproval: first.requireApproval,
          tiers: first.tiers.map((tier) => ({ ...tier, key: nextTierKey() })),
        })),
      ];
    });
    setDirty(true);
  }

  async function toggleCatalogItem(item: LeaveCatalogRow) {
    if (!canManage || isBranchScoped) return;

    const run = async () => {
      setTogglingId(item.id);
      try {
        if (item.enabled) {
          await disableLeaveCatalogItem(item.id, scope.companyId);
        } else {
          await enableLeaveCatalogItem(item.id, scope.companyId);
        }
        setSelectedCatalogId(item.id);
        await loadCatalog("refresh");
      } finally {
        setTogglingId(null);
      }
    };

    if (item.enabled) {
      setDialog({
        title: `ปิดใช้ ${item.nameTh}?`,
        description:
          "พนักงานจะยื่นลาประเภทนี้ไม่ได้ แต่ข้อมูลโควตาและคำขอเดิมยังอยู่ครบ เปิดกลับได้ทุกเมื่อ",
        confirmLabel: "ปิดใช้",
        tone: "red",
        onConfirm: run,
      });
      return;
    }

    await run().catch((toggleError) => {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "เปิดใช้ประเภทการลาไม่สำเร็จ",
      );
    });
  }

  async function submit() {
    if (!matrix || !typeDraft) return;

    if (!typeDraft.nameTh.trim()) {
      setDetailError("กรุณาระบุชื่อประเภทลา");
      return;
    }

    setSaving(true);
    setDetailError(null);

    try {
      const sharedConsecutive = numberOrNull(typeDraft.maxConsecutiveDays);

      const payload: SaveLeaveTypeMatrixForm = {
        branchId: scope.branchId,
        nameTh: typeDraft.nameTh.trim(),
        nameEn: typeDraft.nameEn.trim() || null,
        isPaid: typeDraft.isPaid,
        requiresAttachment: typeDraft.requiresAttachment,
        allowHalfDay: typeDraft.allowHalfDay,
        allowHourly: typeDraft.allowHourly,
        advanceNoticeDays: numberOrZero(typeDraft.advanceNoticeDays),
        allowBackdated: numberOrZero(typeDraft.maxBackdatedDays) > 0,
        maxBackdatedDays: numberOrZero(typeDraft.maxBackdatedDays),
        enforceQuotaLimit: typeDraft.enforceQuotaLimit,
        includeHoliday: typeDraft.includeHoliday,
        includeWeekend: typeDraft.includeWeekend,
        quotaAccrualYears: Math.max(
          numberOrZero(typeDraft.quotaAccrualYears),
          1,
        ),
        genderEligibility: typeDraft.genderEligibility,
        serviceStartBasis: typeDraft.serviceStartBasis,
        requireProbationPassed: typeDraft.requireProbationPassed,
        prorateFirstYear: typeDraft.prorateFirstYear,
        roundingMode: typeDraft.roundingMode,
        policies: policyDrafts.map((row) => {
          const tiers = row.tiers
            .map((tier) => ({
              minServiceMonths: numberOrZero(tier.minServiceMonths),
              quotaDays: numberOrZero(tier.quotaDays),
            }))
            .sort((a, b) => a.minServiceMonths - b.minServiceMonths);

          return {
            employeeTypeId: row.employeeTypeId,
            // โควตาหลักคือขั้นแรกสุด เก็บไว้ให้ report เดิมที่อ่านค่าเดียวยังทำงานได้
            annualQuotaDays: tiers[0]?.quotaDays ?? 0,
            maxConsecutiveDays: sharedConsecutive,
            allowCarryForward: row.allowCarryForward,
            carryForwardLimitDays: numberOrZero(row.carryForwardLimitDays),
            requireApproval: row.requireApproval,
            unpaidDeductionMultiplier: numberOrZero(
              row.unpaidDeductionMultiplier,
            ),
            includeInTax: row.includeInTax,
            includeInSocialSecurity: row.includeInSocialSecurity,
            quotaTiers: tiers,
          };
        }),
      };

      await saveLeaveTypeMatrix(matrix.leaveType.id, payload);
      await loadDetail(matrix.leaveType.id);
      await loadCatalog("refresh");
      setSavedAt(Date.now());
    } catch (saveError) {
      setDetailError(
        saveError instanceof Error
          ? saveError.message
          : "บันทึกนโยบายการลาไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- render ---------------- */

  if (loading) {
    return (
      <LoadingState
        title="กำลังโหลดประเภทการลา"
        description="กำลังตรวจรายการมาตรฐานของระบบและสถานะการเปิดใช้ของบริษัท"
      />
    );
  }

  if (error && catalog.length === 0) {
    return (
      <ErrorState
        title="โหลดประเภทการลาไม่สำเร็จ"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void loadCatalog()}
            className="rounded-xl border border-brand-600 bg-brand-600 px-4 py-2.5 text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-bold text-white"
          >
            ลองใหม่
          </button>
        }
      />
    );
  }

  return (
    <div className="w-full min-w-0">
      {/* แถบหัวข้อ: ตัวเลขสรุป + ปุ่มคัดลอก/รีเฟรช */}
      <Toolbar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            ประเภทการลา
          </span>
          <Badge tone={summary.enabled > 0 ? "positive" : "neutral"}>
            เปิดใช้ {summary.enabled}/{summary.total}
          </Badge>
          <span className="text-[12px] text-slate-400 3xl:text-[12.5px]">
            เปิดเฉพาะประเภทที่บริษัทใช้ แล้วตั้งโควตาแยกตามประเภทพนักงาน
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onRequestCopy && canManage && !isBranchScoped ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRequestCopy}
              icon={<Copy className="h-3.5 w-3.5" />}
            >
              คัดลอกจากบริษัทอื่น
            </Button>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadCatalog("refresh")}
            disabled={refreshing}
            icon={
              refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" />
              )
            }
          >
            รีเฟรช
          </Button>
        </div>
      </Toolbar>

      {error ? (
        <div className="px-5 pt-4 3xl:px-6">
          <Notice tone="critical">{error}</Notice>
        </div>
      ) : null}

      {/* ซ้าย = เลือกประเภทลา / ขวา = ตั้งค่าของประเภทนั้น */}
      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(260px,320px)_1fr]">
        <aside className="min-w-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="space-y-2 border-b border-slate-200 bg-slate-50/50 px-3 py-3 [&_input]:bg-white">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหารหัสหรือชื่อประเภทลา"
              aria-label="ค้นหาประเภทลา"
            />
            <Checkbox
              label="แสดงเฉพาะที่เปิดใช้"
              checked={showEnabledOnly}
              onChange={(event) => setShowEnabledOnly(event.target.checked)}
            />
          </div>

          {visibleCatalog.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[13px] font-semibold text-slate-600">
                ไม่พบประเภทการลา
              </p>
              <p className="mt-1 text-[13px] text-slate-400">
                ลองเปลี่ยนคำค้นหา หรือเอาตัวกรองออก
              </p>
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-slate-400">
              {visibleCatalog.map((item) => {
                const active = item.id === selectedCatalogId;

                return (
                  <li key={item.id}>
                    <div
                      className={joinClassName(
                        "flex items-center gap-2.5 border-l-2 px-3 py-2.5 transition",
                        active
                          ? "border-brand-600 bg-brand-50/70"
                          : "border-transparent hover:bg-brand-50/40",
                      )}
                    >
                      {/* สวิตช์เปิด/ปิด แยกจากปุ่มเลือก เพื่อไม่ให้กดผิด */}
                      <button
                        type="button"
                        onClick={() => void toggleCatalogItem(item)}
                        disabled={
                          !canManage || isBranchScoped || togglingId === item.id
                        }
                        title={
                          item.enabled ? "ปิดใช้ประเภทนี้" : "เปิดใช้ประเภทนี้"
                        }
                        aria-label={item.enabled ? "ปิดใช้" : "เปิดใช้"}
                        aria-pressed={item.enabled}
                        className={joinClassName(
                          "relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
                          item.enabled
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-slate-300 bg-slate-200",
                        )}
                      >
                        <span
                          className={joinClassName(
                            "absolute top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white shadow-sm transition-all",
                            item.enabled ? "left-[18px]" : "left-0.5",
                          )}
                        >
                          {togglingId === item.id ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-500" />
                          ) : null}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedCatalogId(item.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={joinClassName(
                              "block truncate text-[13px] font-semibold 3xl:text-[14px]",
                              item.enabled
                                ? "text-slate-900"
                                : "text-slate-400",
                            )}
                          >
                            {item.nameTh}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {item.referenceCode}
                            {item.nameEn ? ` · ${item.nameEn}` : ""}
                          </span>
                        </span>

                        {active ? (
                          <ChevronRight className="h-4 w-4 shrink-0 text-brand-500" />
                        ) : null}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* detail */}
        <section className="min-w-0">
          {!selected ? (
            <div className="flex min-h-[320px] items-center justify-center px-5 3xl:px-6 4xl:px-7 text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-slate-400">
              เลือกประเภทการลาจากรายการด้านซ้าย
            </div>
          ) : !selected.enabled || !selected.companyLeaveType ? (
            <div className="p-5">
              <EmptyState
                icon={<CalendarDays className="h-6 w-6" />}
                title={`${selected.nameTh} ยังไม่ได้เปิดใช้`}
                description={
                  isBranchScoped
                    ? `บริษัท ${scope.companyName} ยังไม่ได้เปิดใช้ประเภทการลานี้ — การเปิดใช้มีผลทั้งบริษัท ต้องให้ผู้ดูแลระดับบริษัทเป็นคนเปิด`
                    : `บริษัท ${scope.companyName} ยังไม่ได้เปิดใช้ประเภทการลานี้ กดเปิดใช้เพื่อสร้างโควตาตั้งต้นให้ทุกประเภทพนักงาน`
                }
                action={
                  canManage && !isBranchScoped ? (
                    <Button
                      variant="primary"
                      onClick={() => void toggleCatalogItem(selected)}
                      loading={togglingId === selected.id}
                      icon={<Plus className="h-3.5 w-3.5" />}
                    >
                      เปิดใช้ประเภทนี้
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : detailLoading || !typeDraft ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              กำลังโหลดนโยบาย…
            </div>
          ) : (
            <div className="min-w-0 space-y-5 p-5 xl:p-6 max-[1536px]:p-4">
              {/* หัวข้อของประเภทลาที่เลือก + ปุ่มบันทึก */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[15px] font-bold text-slate-900 3xl:text-[16.5px]">
                      {typeDraft.nameTh}
                    </h3>
                    <Badge tone="positive">เปิดใช้อยู่</Badge>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                      {selected.referenceCode}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-slate-500">
                    {scope.branchName
                      ? `กำลังตั้งค่าเฉพาะสาขา ${scope.branchName}`
                      : "กำลังตั้งค่าเป็นค่ามาตรฐานของบริษัท ทุกสาขาที่ไม่ได้ตั้งแยกจะใช้ค่านี้"}
                  </p>
                </div>

                {canManage ? (
                  <div className="flex items-center gap-2">
                    {savedAt && !dirty ? (
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600">
                        <Check className="h-3.5 w-3.5" />
                        บันทึกแล้ว
                      </span>
                    ) : null}
                    <Button
                      variant="primary"
                      onClick={() => void submit()}
                      loading={saving}
                      disabled={!dirty}
                      icon={<Save className="h-3.5 w-3.5" />}
                    >
                      บันทึก
                    </Button>
                  </div>
                ) : null}
              </div>

              {detailError ? (
                <Notice tone="critical">{detailError}</Notice>
              ) : null}

              {/* section 1 : ข้อมูลทั่วไป (ระดับบริษัท) */}
              <DetailSection
                title="ข้อมูลทั่วไป"
                badge={<Badge tone="warning">มีผลทุกสาขา</Badge>}
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="ชื่อประเภทลา">
                    <input
                      value={typeDraft.nameTh}
                      disabled={!canManage}
                      onChange={(event) =>
                        patchType({ nameTh: event.target.value })
                      }
                      className={modalInputClass}
                    />
                  </Field>
                  <Field label="ลาล่วงหน้า (วัน)" hint="0 = ยื่นวันไหนก็ได้">
                    <input
                      type="number"
                      min="0"
                      value={typeDraft.advanceNoticeDays}
                      disabled={!canManage}
                      onChange={(event) =>
                        patchType({ advanceNoticeDays: event.target.value })
                      }
                      className={modalInputClass}
                    />
                  </Field>
                  <Field label="ลาย้อนหลัง (วัน)" hint="0 = ย้อนหลังไม่ได้">
                    <input
                      type="number"
                      min="0"
                      value={typeDraft.maxBackdatedDays}
                      disabled={!canManage}
                      onChange={(event) =>
                        patchType({ maxBackdatedDays: event.target.value })
                      }
                      className={modalInputClass}
                    />
                  </Field>
                  <Field
                    label="ลาติดต่อกันสูงสุด (วัน)"
                    hint="เว้นว่าง = ไม่จำกัด"
                  >
                    <input
                      type="number"
                      min="1"
                      value={typeDraft.maxConsecutiveDays}
                      disabled={!canManage}
                      placeholder="ไม่จำกัด"
                      onChange={(event) =>
                        patchType({ maxConsecutiveDays: event.target.value })
                      }
                      className={modalInputClass}
                    />
                  </Field>
                  <Field
                    label="จำนวนปีสะสม"
                    hint="วันที่สะสมข้ามปีมา ใช้ได้กี่ปีก่อนหมดอายุ"
                  >
                    <input
                      type="number"
                      min="1"
                      value={typeDraft.quotaAccrualYears}
                      disabled={!canManage}
                      onChange={(event) =>
                        patchType({ quotaAccrualYears: event.target.value })
                      }
                      className={modalInputClass}
                    />
                  </Field>
                  <Field label="ลาได้เฉพาะเพศ">
                    <select
                      value={typeDraft.genderEligibility}
                      disabled={!canManage}
                      onChange={(event) =>
                        patchType({
                          genderEligibility: event.target
                            .value as LeaveGenderEligibility,
                        })
                      }
                      className={modalInputClass}
                    >
                      <option value="ALL">ทั้งเพศชายและเพศหญิง</option>
                      <option value="FEMALE">เฉพาะเพศหญิง</option>
                      <option value="MALE">เฉพาะเพศชาย</option>
                    </select>
                  </Field>
                  <Field label="นับอายุงานจาก">
                    <select
                      value={typeDraft.serviceStartBasis}
                      disabled={!canManage}
                      onChange={(event) =>
                        patchType({
                          serviceStartBasis: event.target
                            .value as LeaveServiceStartBasis,
                        })
                      }
                      className={modalInputClass}
                    >
                      <option value="HIRE_DATE">วันที่เริ่มงาน</option>
                      <option value="PROBATION_PASS_DATE">วันที่บรรจุ</option>
                    </select>
                    <p className="mt-1.5 text-[11px] text-slate-400 3xl:text-[12px]">
                      ใช้คิดโควตาเท่านั้น ไม่ได้ห้ามยื่นใบลา
                    </p>
                  </Field>
                  <Field label="การปัดเศษเวลาลา">
                    <select
                      value={typeDraft.roundingMode}
                      disabled={!canManage}
                      onChange={(event) =>
                        patchType({
                          roundingMode: event.target.value as LeaveRoundingMode,
                        })
                      }
                      className={modalInputClass}
                    >
                      <option value="NONE">ไม่ปัดเศษ</option>
                      <option value="HALF_HOUR_UP">
                        ปัดให้เต็มครึ่งชั่วโมง
                      </option>
                      <option value="HALF_DAY_UP">ปัดให้เต็มครึ่งวัน</option>
                    </select>
                  </Field>
                </div>

                <div className="mt-3 grid gap-x-6 gap-y-1 rounded-lg border border-slate-200 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Toggle
                    label="ได้รับค่าจ้าง"
                    checked={typeDraft.isPaid}
                    disabled={!canManage}
                    onChange={(value) => patchType({ isPaid: value })}
                  />
                  <Toggle
                    label="ห้ามลาเกินโควตา"
                    checked={typeDraft.enforceQuotaLimit}
                    disabled={!canManage}
                    onChange={(value) =>
                      patchType({ enforceQuotaLimit: value })
                    }
                  />
                  {/*
                    เปิดแล้วพนักงานที่ยังไม่ผ่านทดลองงานจะยื่นลาประเภทนี้ไม่ได้เลย
                    (ไม่ใช่แค่โควตาเป็นศูนย์) จึงเขียนผลลัพธ์ไว้ใต้ปุ่มให้เห็นก่อนกด
                    สิทธิลาตามกฎหมาย เช่น ลาป่วย ลาคลอด ลากิจจำเป็น เปิดแล้วไม่มีผล
                  */}
                  <Toggle
                    label="ต้องผ่านการบรรจุก่อน"
                    checked={typeDraft.requireProbationPassed}
                    disabled={!canManage}
                    onChange={(value) =>
                      patchType({ requireProbationPassed: value })
                    }
                  />
                  <Toggle
                    label="เฉลี่ยโควตาในปี"
                    checked={typeDraft.prorateFirstYear}
                    disabled={!canManage}
                    onChange={(value) => patchType({ prorateFirstYear: value })}
                  />
                  <Toggle
                    label="ต้องแนบเอกสาร"
                    checked={typeDraft.requiresAttachment}
                    disabled={!canManage}
                    onChange={(value) =>
                      patchType({ requiresAttachment: value })
                    }
                  />
                  <Toggle
                    label="ลาได้ครึ่งวัน"
                    checked={typeDraft.allowHalfDay}
                    disabled={!canManage}
                    onChange={(value) => patchType({ allowHalfDay: value })}
                  />
                  <Toggle
                    label="ลารายชั่วโมง"
                    checked={typeDraft.allowHourly}
                    disabled={!canManage}
                    onChange={(value) => patchType({ allowHourly: value })}
                  />
                  <Toggle
                    label="นับวันหยุดนักขัตฤกษ์"
                    checked={typeDraft.includeHoliday}
                    disabled={!canManage}
                    onChange={(value) => patchType({ includeHoliday: value })}
                  />
                  <Toggle
                    label="นับวันหยุดประจำสัปดาห์"
                    checked={typeDraft.includeWeekend}
                    disabled={!canManage}
                    onChange={(value) => patchType({ includeWeekend: value })}
                  />
                </div>

                <p className="mt-3 text-[12px] leading-6 text-slate-400">
                  <strong className="font-bold text-slate-700">
                    นับวันหยุด
                  </strong>{" "}
                  — ติ๊กไว้ = วันหยุดที่คร่อมอยู่ในช่วงลา ถูกนับเป็นวันลาด้วย
                  (ค่าเริ่มต้น เท่าระบบเดิม) · เอาออก = ข้ามวันหยุดนั้น เช่น
                  ลาศุกร์ถึงจันทร์ จากเดิมหักโควตา 4 วัน จะเหลือหัก 2 วัน
                </p>
              </DetailSection>

              {/* section 2 : ตารางประเภทพนักงาน */}
              <DetailSection
                title="โควตาตามประเภทพนักงาน"
                badge={
                  <Badge tone="brand">
                    {scope.branchName ?? "ค่ามาตรฐานบริษัท"}
                  </Badge>
                }
                action={
                  canManage && policyDrafts.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={applyFirstRowToAll}
                    >
                      ใช้ค่าแถวแรกกับทุกประเภท
                    </Button>
                  ) : null
                }
              >
                {policyDrafts.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-slate-400">
                    บริษัทนี้ยังไม่มีประเภทพนักงาน — เพิ่มที่ ตั้งค่าองค์กร ก่อน
                  </p>
                ) : (
                  /*
                    หนึ่งประเภทพนักงาน = หนึ่งแถว กดกางออกมาแก้ค่าในแถวได้เลย
                    (แบบเดียวกับแท็บ OT — ตารางหลายคอลัมน์บีบช่องจนกรอกยากบนจอโน้ตบุ๊ก)
                  */
                  <div className="divide-y divide-brand-50">
                    {policyDrafts.map((row) => {
                      const open = row.employeeTypeId === openRowId;

                      return (
                        <div
                          key={row.employeeTypeId}
                          className={joinClassName(
                            "-mx-4 px-4 transition-colors",
                            open && "bg-brand-50/50",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenRowId(open ? null : row.employeeTypeId)
                            }
                            className="flex w-full items-center gap-2 py-2.5 text-left"
                          >
                            <ChevronRight
                              className={joinClassName(
                                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                                open && "rotate-90",
                              )}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
                                {row.employeeTypeName}
                              </span>
                              <span className="block truncate text-[11px] text-slate-400">
                                {quotaSummary(row)}
                              </span>
                            </span>

                            {!row.isOwnScope && row.inheritedFrom ? (
                              <span className="shrink-0 text-[11px] text-slate-400">
                                {row.inheritedFrom === "COMPANY"
                                  ? "สืบทอดจากบริษัท"
                                  : "สืบทอดจากค่าทุกประเภท"}
                              </span>
                            ) : null}
                          </button>

                          {open ? (
                            <div className="mb-3 space-y-4 border-t border-brand-100 pb-3 pt-3">
                              {/* ขั้นโควตาตามอายุงาน */}
                              <div>
                                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                                  โควตาตามอายุงาน
                                </p>

                                <div className="space-y-1.5">
                                  {row.tiers.map((tier) => (
                                    <div
                                      key={tier.key}
                                      className="flex flex-wrap items-center gap-x-2 gap-y-1"
                                    >
                                      <span className="text-[12px] text-slate-400">
                                        อายุงานตั้งแต่
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={tier.minServiceMonths}
                                        disabled={!canManage}
                                        onChange={(event) =>
                                          patchTier(
                                            row.employeeTypeId,
                                            tier.key,
                                            {
                                              minServiceMonths:
                                                event.target.value,
                                            },
                                          )
                                        }
                                        className={`${modalInputCompactClass} w-16 px-2 text-center`}
                                      />
                                      <span className="text-[12px] text-slate-400">
                                        เดือน · ได้
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={tier.quotaDays}
                                        disabled={!canManage}
                                        onChange={(event) =>
                                          patchTier(
                                            row.employeeTypeId,
                                            tier.key,
                                            {
                                              quotaDays: event.target.value,
                                            },
                                          )
                                        }
                                        className={`${modalInputCompactClass} w-20 px-2 text-center`}
                                      />
                                      <span className="text-[12px] text-slate-400">
                                        วัน/ปี
                                      </span>

                                      {canManage && row.tiers.length > 1 ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeTier(
                                              row.employeeTypeId,
                                              tier.key,
                                            )
                                          }
                                          aria-label="ลบขั้นนี้"
                                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>

                                {canManage ? (
                                  <button
                                    type="button"
                                    onClick={() => addTier(row.employeeTypeId)}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 underline-offset-2 hover:underline"
                                  >
                                    <Plus className="h-3 w-3" />
                                    เพิ่มขั้นอายุงาน
                                  </button>
                                ) : null}
                              </div>

                              {/* ค่าที่เหลือของประเภทพนักงานนี้ */}
                              <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 [&_input:not([type=checkbox])]:max-w-40">
                                <Field
                                  label="ตัวคูณค่าปรับ"
                                  hint="0 = ไม่หักค่าจ้าง · 1 = หักเต็มวัน"
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={row.unpaidDeductionMultiplier}
                                    disabled={!canManage}
                                    onChange={(event) =>
                                      patchPolicy(row.employeeTypeId, {
                                        unpaidDeductionMultiplier:
                                          event.target.value,
                                      })
                                    }
                                    className={modalInputClass}
                                  />
                                </Field>

                                <Field
                                  label="สะสมวันลาข้ามปี"
                                  hint="ยกวันคงเหลือไปเป็นยอดตั้งต้นปีหน้า"
                                >
                                  <div className="flex items-center gap-2">
                                    <label className="inline-flex h-9 items-center gap-1.5 text-[13px] text-slate-600 3xl:h-10">
                                      <input
                                        type="checkbox"
                                        checked={row.allowCarryForward}
                                        disabled={!canManage}
                                        onChange={(event) =>
                                          patchPolicy(row.employeeTypeId, {
                                            allowCarryForward:
                                              event.target.checked,
                                          })
                                        }
                                        className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                                      />
                                      สะสมได้
                                    </label>

                                    {row.allowCarryForward ? (
                                      <>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.5"
                                          value={row.carryForwardLimitDays}
                                          disabled={!canManage}
                                          onChange={(event) =>
                                            patchPolicy(row.employeeTypeId, {
                                              carryForwardLimitDays:
                                                event.target.value,
                                            })
                                          }
                                          className={`${modalInputCompactClass} w-20 px-2 text-center`}
                                        />
                                        <span className="text-[12px] text-slate-400">
                                          วัน (0 = ไม่จำกัด)
                                        </span>
                                      </>
                                    ) : null}
                                  </div>
                                </Field>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3">
                                <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                                  นำไปคำนวณกับ
                                </span>
                                <CheckLine
                                  label="ภาษี"
                                  checked={row.includeInTax}
                                  disabled={!canManage}
                                  onChange={(value) =>
                                    patchPolicy(row.employeeTypeId, {
                                      includeInTax: value,
                                    })
                                  }
                                />
                                <CheckLine
                                  label="ประกันสังคม"
                                  checked={row.includeInSocialSecurity}
                                  disabled={!canManage}
                                  onChange={(value) =>
                                    patchPolicy(row.employeeTypeId, {
                                      includeInSocialSecurity: value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </DetailSection>

              {/* section 3 : สาขาที่ตั้งค่าแยก */}
              {matrix && matrix.overriddenBranches.length > 0 ? (
                <DetailSection title="สาขาที่ตั้งค่าแยกจากบริษัท">
                  <div className="flex flex-wrap gap-1.5">
                    {matrix.overriddenBranches.map((branch) => (
                      <span
                        key={branch.id}
                        className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-bold text-violet-700"
                      >
                        <Building2 className="h-3 w-3" />
                        {branch.nameTh}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-medium text-slate-400">
                    เลือกสาขาจากแถบด้านบนเพื่อดูและแก้ค่าเฉพาะสาขานั้น
                  </p>
                </DetailSection>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

function DetailSection({
  title,
  badge,
  action,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-[13px] font-bold uppercase tracking-wide text-slate-500 3xl:text-[14px]">
            {title}
          </h4>
          {badge}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** สรุปโควตาของหนึ่งประเภทพนักงาน ให้อ่านจบในบรรทัดเดียว */
function quotaSummary(row: PolicyDraft) {
  const tiers = [...row.tiers].sort(
    (a, b) => Number(a.minServiceMonths) - Number(b.minServiceMonths),
  );

  const quota = tiers.length
    ? tiers
        .map((tier) =>
          Number(tier.minServiceMonths) > 0
            ? `${tier.minServiceMonths} ด.ขึ้นไป ${tier.quotaDays || 0} วัน`
            : `${tier.quotaDays || 0} วัน`,
        )
        .join(" · ")
    : "ยังไม่ตั้งโควตา";

  const carry = row.allowCarryForward
    ? `สะสมข้ามปีได้${
        Number(row.carryForwardLimitDays) > 0
          ? ` ${row.carryForwardLimitDays} วัน`
          : ""
      }`
    : "ไม่สะสมข้ามปี";

  return `${quota} · ${carry}`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[13px] font-medium text-slate-600 3xl:text-[14px]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs leading-5 text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Checkbox
      label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function CheckLine({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-1.5 text-[12px] ${
        disabled ? "text-slate-400" : "cursor-pointer text-slate-600"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
      />
      {label}
    </label>
  );
}
