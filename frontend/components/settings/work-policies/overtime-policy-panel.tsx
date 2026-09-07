"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CalendarOff,
  Check,
  ChevronRight,
  Loader2,
  Pencil,
  RefreshCcw,
  Save,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";

import { ActionDialog, type ActionDialogState } from "@/components/common/action-dialog";
import {
  Badge,
  Button,
  Notice,
  Toolbar,
  joinClassName,
} from "@/components/kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/feedback-state";
import {
  ModalField,
  PolicyModal,
  modalInputClass,
} from "@/components/settings/work-policies/policy-modal";
import type { WorkPolicyScope } from "@/components/settings/work-policies/work-policy-types";
import {
  getOvertimeMatrix,
  getOvertimePolicies,
  saveOvertimeMatrix,
  setOvertimeMatrixStatus,
} from "@/lib/api";
import type {
  OvertimeAmountRoundingMode,
  OvertimeCalcStartMode,
  OvertimeHourRoundingMode,
  OvertimeMatrixResponse,
  OvertimePolicy,
  OvertimeWorkType,
  SaveOvertimeMatrixForm,
} from "@/types/overtime";

/* ------------------------------------------------------------------ */
/* work types                                                          */
/* ------------------------------------------------------------------ */

const workTypes: Array<{
  value: OvertimeWorkType;
  referenceCode: string;
  label: string;
  nameEn: string;
  description: string;
  defaultRate: number;
  icon: LucideIcon;
}> = [
  {
    value: "WORKDAY",
    referenceCode: "OT-WD",
    label: "โอทีล่วงเวลา",
    nameEn: "Workday overtime",
    description: "ทำงานเกินเวลากะปกติในวันทำงาน",
    defaultRate: 1.5,
    icon: Timer,
  },
  {
    value: "HOLIDAY",
    referenceCode: "OT-HD",
    label: "โอทีวันหยุด",
    nameEn: "Holiday overtime",
    description: "ทำงานในวันหยุดประจำสัปดาห์",
    defaultRate: 2,
    icon: CalendarOff,
  },
  {
    value: "SPECIAL_HOLIDAY",
    referenceCode: "OT-SP",
    label: "โอทีวันหยุดพิเศษ",
    nameEn: "Special holiday overtime",
    description: "ทำงานในวันหยุดนักขัตฤกษ์หรือวันหยุดพิเศษ",
    defaultRate: 3,
    icon: Sparkles,
  },
];

const calcStartModes: Array<{ value: OvertimeCalcStartMode; label: string }> = [
  { value: "IMMEDIATE", label: "เริ่มคำนวณทันที" },
  { value: "AFTER_MIN_MINUTES", label: "เริ่มคำนวณหลังครบขั้นต่ำ" },
];

const hourRoundingModes: Array<{
  value: OvertimeHourRoundingMode;
  label: string;
}> = [
  { value: "NONE", label: "ไม่ปัดเศษ" },
  { value: "HALF_HOUR_DOWN", label: "ปัดลงครึ่งชั่วโมง" },
  { value: "HALF_HOUR_UP", label: "ปัดขึ้นครึ่งชั่วโมง" },
  { value: "HOUR_DOWN", label: "ปัดลงเต็มชั่วโมง" },
  { value: "HOUR_UP", label: "ปัดขึ้นเต็มชั่วโมง" },
];

const amountRoundingModes: Array<{
  value: OvertimeAmountRoundingMode;
  label: string;
}> = [
  { value: "NONE", label: "ไม่ปัดเศษ" },
  { value: "ROUND_DOWN", label: "ปัดลงเต็มบาท" },
  { value: "ROUND_UP", label: "ปัดขึ้นเต็มบาท" },
  { value: "ROUND_NEAREST", label: "ปัดเข้าใกล้เต็มบาท" },
];

/* ------------------------------------------------------------------ */
/* form state                                                          */
/* ------------------------------------------------------------------ */

/** 1 แถวของตารางประเภทพนักงาน */
type RowDraft = {
  employeeTypeId: string;
  employeeTypeName: string;
  isOwnScope: boolean;
  inheritedFrom: "COMPANY" | "ALL_EMPLOYEE_TYPES" | null;
  enabled: boolean;
  rateMultiplier: string;
  minMinutes: string;
  maxHoursPerDay: string;
  calcStartMode: OvertimeCalcStartMode;
  hourRoundingMode: OvertimeHourRoundingMode;
  amountRoundingMode: OvertimeAmountRoundingMode;
  includeInTax: boolean;
  includeInSocialSecurity: boolean;
  requireApproval: boolean;
};

/** เงื่อนไขระดับประเภทวัน — ใช้ร่วมกันทุกแถว */
type TypeDraft = {
  nameTh: string;
  nameEn: string;
  description: string;
};

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
function draftsFromMatrix(
  matrix: OvertimeMatrixResponse,
  workType: (typeof workTypes)[number],
): { type: TypeDraft; rows: RowDraft[] } {
  const named = matrix.rows.find((row) => row.policy)?.policy ?? null;

  return {
    type: {
      nameTh: named?.nameTh ?? workType.label,
      nameEn: named?.nameEn ?? "",
      description: named?.description ?? "",
    },
    rows: matrix.rows.map((row) => ({
      employeeTypeId: row.employeeType.id,
      employeeTypeName: row.employeeType.nameTh,
      isOwnScope: row.isOwnScope,
      inheritedFrom: row.inheritedFrom,
      enabled: row.policy ? row.policy.status === "ACTIVE" : false,
      rateMultiplier: toInputNumber(
        row.policy?.rateMultiplier,
        String(workType.defaultRate),
      ),
      minMinutes: toInputNumber(row.policy?.minMinutes, "30"),
      maxHoursPerDay:
        row.policy?.maxHoursPerDay == null
          ? ""
          : String(Number(row.policy.maxHoursPerDay)),
      calcStartMode: row.policy?.calcStartMode ?? "IMMEDIATE",
      hourRoundingMode: row.policy?.hourRoundingMode ?? "NONE",
      amountRoundingMode: row.policy?.amountRoundingMode ?? "NONE",
      includeInTax: row.policy?.includeInTax ?? true,
      includeInSocialSecurity: row.policy?.includeInSocialSecurity ?? false,
      requireApproval: row.policy?.requireApproval ?? true,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* panel                                                               */
/* ------------------------------------------------------------------ */

export function OvertimePolicyPanel({
  scope,
  canManage,
}: {
  scope: WorkPolicyScope;
  canManage: boolean;
}) {
  const [policies, setPolicies] = useState<OvertimePolicy[]>([]);
  const [selectedWorkType, setSelectedWorkType] =
    useState<OvertimeWorkType>("WORKDAY");

  const [matrix, setMatrix] = useState<OvertimeMatrixResponse | null>(null);
  const [typeDraft, setTypeDraft] = useState<TypeDraft | null>(null);
  const [rowDrafts, setRowDrafts] = useState<RowDraft[]>([]);
  const [dirty, setDirty] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [togglingType, setTogglingType] = useState<OvertimeWorkType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  /** ประเภทพนักงานที่กางค่าตั้งอยู่ (กางได้ทีละแถว) */
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  /** ป๊อปอัพแก้ชื่อ/คำอธิบายของประเภทวัน — ตั้งครั้งเดียว ไม่ต้องกินที่หน้าหลัก */
  const [nameModalOpen, setNameModalOpen] = useState(false);

  // กันไม่ให้ผลลัพธ์ของ request เก่ามาทับ selection ปัจจุบัน
  const detailRequestRef = useRef(0);

  /* ---------------- data ---------------- */

  const loadCatalog = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        if (mode === "refresh") setRefreshing(true);
        setError(null);

        const result = await getOvertimePolicies({ companyId: scope.companyId });
        setPolicies(result ?? []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "ไม่สามารถโหลดรายการนโยบาย OT ได้",
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
    async (workType: OvertimeWorkType) => {
      const requestId = detailRequestRef.current + 1;
      detailRequestRef.current = requestId;

      try {
        setDetailLoading(true);
        setDetailError(null);

        const result = await getOvertimeMatrix({
          companyId: scope.companyId,
          branchId: scope.branchId,
          workType,
        });
        if (detailRequestRef.current !== requestId) return;

        const config =
          workTypes.find((item) => item.value === workType) ?? workTypes[0];
        const drafts = draftsFromMatrix(result, config);
        setMatrix(result);
        setTypeDraft(drafts.type);
        setRowDrafts(drafts.rows);
        setDirty(false);
      } catch (loadError) {
        if (detailRequestRef.current !== requestId) return;
        setDetailError(
          loadError instanceof Error
            ? loadError.message
            : "ไม่สามารถโหลดนโยบายของประเภทวันนี้ได้",
        );
      } finally {
        if (detailRequestRef.current === requestId) setDetailLoading(false);
      }
    },
    [scope.companyId, scope.branchId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDetail(selectedWorkType);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedWorkType, loadDetail]);

  /** สถานะของแต่ละประเภทวันในขอบเขตที่เลือก — ใช้กับรายการด้านซ้าย */
  const catalog = useMemo(
    () =>
      workTypes.map((workType) => {
        const scoped = policies.filter(
          (policy) =>
            policy.workType === workType.value &&
            (policy.branchId ?? null) === scope.branchId,
        );
        const inherited = policies.filter(
          (policy) => policy.workType === workType.value && !policy.branchId,
        );
        const effective = scoped.length > 0 ? scoped : inherited;
        const active = effective.filter((policy) => policy.status === "ACTIVE");

        return {
          ...workType,
          enabled: active.length > 0,
          isOwnScope: scoped.length > 0,
          activeCount: active.length,
          rate: active[0] ? Number(active[0].rateMultiplier) : null,
        };
      }),
    [policies, scope.branchId],
  );

  const selected = catalog.find((item) => item.value === selectedWorkType) ?? catalog[0];
  const summary = useMemo(
    () => ({
      total: catalog.length,
      enabled: catalog.filter((item) => item.enabled).length,
    }),
    [catalog],
  );

  /* ---------------- actions ---------------- */

  function patchType(patch: Partial<TypeDraft>) {
    setTypeDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }

  function patchRow(employeeTypeId: string, patch: Partial<RowDraft>) {
    setRowDrafts((current) =>
      current.map((row) =>
        row.employeeTypeId === employeeTypeId ? { ...row, ...patch } : row,
      ),
    );
    setDirty(true);
  }

  /** คัดค่าของแถวแรกไปทุกแถว — ลดการพิมพ์ซ้ำหลายรอบ */
  function applyFirstRowToAll() {
    setRowDrafts((current) => {
      const [first, ...rest] = current;
      if (!first) return current;

      return [
        first,
        ...rest.map((row) => ({
          ...row,
          enabled: first.enabled,
          rateMultiplier: first.rateMultiplier,
          minMinutes: first.minMinutes,
          maxHoursPerDay: first.maxHoursPerDay,
          calcStartMode: first.calcStartMode,
          hourRoundingMode: first.hourRoundingMode,
          amountRoundingMode: first.amountRoundingMode,
          includeInTax: first.includeInTax,
          includeInSocialSecurity: first.includeInSocialSecurity,
          requireApproval: first.requireApproval,
        })),
      ];
    });
    setDirty(true);
  }

  async function toggleWorkType(item: (typeof catalog)[number]) {
    if (!canManage) return;

    const run = async () => {
      setTogglingType(item.value);
      try {
        await setOvertimeMatrixStatus({
          companyId: scope.companyId,
          branchId: scope.branchId,
          workType: item.value,
          enabled: !item.enabled,
        });
        setSelectedWorkType(item.value);
        await loadCatalog("refresh");
        await loadDetail(item.value);
      } finally {
        setTogglingType(null);
      }
    };

    if (item.enabled) {
      setDialog({
        title: `ปิดใช้ ${item.label}?`,
        description:
          "พนักงานจะยื่นขอ OT ประเภทวันนี้ไม่ได้ แต่ค่าที่ตั้งไว้และคำขอเดิมยังอยู่ครบ เปิดกลับได้ทุกเมื่อ",
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
          : "เปิดใช้ประเภทวัน OT ไม่สำเร็จ",
      );
    });
  }

  async function submit() {
    if (!matrix || !typeDraft) return;

    if (!typeDraft.nameTh.trim()) {
      setDetailError("กรุณาระบุชื่อนโยบาย OT");
      return;
    }

    const invalidRate = rowDrafts.find((row) => {
      const rate = Number(row.rateMultiplier);
      return !Number.isFinite(rate) || rate < 0 || rate > 10;
    });

    if (invalidRate) {
      setDetailError(
        `อัตราคูณของ ${invalidRate.employeeTypeName} ต้องอยู่ระหว่าง 0 – 10`,
      );
      return;
    }

    setSaving(true);
    setDetailError(null);

    try {
      const payload: SaveOvertimeMatrixForm = {
        companyId: scope.companyId,
        branchId: scope.branchId,
        workType: matrix.workType,
        nameTh: typeDraft.nameTh.trim(),
        nameEn: typeDraft.nameEn.trim() || null,
        description: typeDraft.description.trim() || null,
        rows: rowDrafts.map((row) => ({
          employeeTypeId: row.employeeTypeId,
          enabled: row.enabled,
          rateMultiplier: numberOrZero(row.rateMultiplier),
          minMinutes: numberOrZero(row.minMinutes),
          maxHoursPerDay: numberOrNull(row.maxHoursPerDay),
          calcStartMode: row.calcStartMode,
          hourRoundingMode: row.hourRoundingMode,
          amountRoundingMode: row.amountRoundingMode,
          includeInTax: row.includeInTax,
          includeInSocialSecurity: row.includeInSocialSecurity,
          requireApproval: row.requireApproval,
        })),
      };

      await saveOvertimeMatrix(payload);
      await loadDetail(matrix.workType);
      await loadCatalog("refresh");
      setSavedAt(Date.now());
    } catch (saveError) {
      setDetailError(
        saveError instanceof Error
          ? saveError.message
          : "บันทึกนโยบาย OT ไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- render ---------------- */

  if (loading) {
    return (
      <LoadingState
        title="กำลังโหลดนโยบาย OT"
        description="กำลังตรวจอัตราและเงื่อนไข OT ของขอบเขตที่เลือก"
      />
    );
  }

  if (error && policies.length === 0 && !matrix) {
    return (
      <ErrorState
        title="โหลดนโยบาย OT ไม่สำเร็จ"
        description={error}
        action={<Button onClick={() => void loadCatalog()}>ลองใหม่</Button>}
      />
    );
  }


  return (
    <div className="w-full min-w-0">
      {/* แถบหัวข้อ: บอกว่ากำลังตั้งอะไร + ตัวเลขสรุป + ปุ่มรีเฟรช */}
      <Toolbar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-700 3xl:text-[14px]">
            ประเภทวันที่ทำ OT
          </span>
          <Badge tone={summary.enabled > 0 ? "positive" : "neutral"}>
            เปิดใช้ {summary.enabled}/{summary.total}
          </Badge>
          <span className="text-[13px] text-slate-400">
            เปิดเฉพาะประเภทที่บริษัทใช้จริง แล้วตั้งอัตราแยกตามประเภทพนักงานได้
          </span>
        </div>

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
      </Toolbar>

      {error ? (
        <div className="px-5 pt-4 3xl:px-6">
          <Notice tone="critical">{error}</Notice>
        </div>
      ) : null}

      {/* ซ้าย = เลือกประเภทวัน / ขวา = ตั้งค่าอัตราของประเภทนั้น */}
      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(260px,320px)_1fr]">
        <aside className="min-w-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
          <ul className="divide-y divide-slate-100">
            {catalog.map((item) => {
              const active = item.value === selectedWorkType;

              return (
                <li key={item.value}>
                  <div
                    className={joinClassName(
                      "flex items-center gap-2.5 px-3 py-2.5 transition",
                      active
                        ? "bg-brand-50/70 shadow-[inset_2px_0_0_#2563eb]"
                        : "hover:bg-slate-50",
                    )}
                  >
                    {/* สวิตช์เปิด/ปิด แยกจากปุ่มเลือก เพื่อไม่ให้กดผิด */}
                    <button
                      type="button"
                      onClick={() => void toggleWorkType(item)}
                      disabled={!canManage || togglingType === item.value}
                      title={
                        item.enabled ? "ปิดใช้ประเภทวันนี้" : "เปิดใช้ประเภทวันนี้"
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
                        {togglingType === item.value ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-500" />
                        ) : null}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedWorkType(item.value)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={joinClassName(
                              "truncate text-[13px] font-semibold 3xl:text-[14px]",
                              item.enabled ? "text-slate-900" : "text-slate-400",
                            )}
                          >
                            {item.label}
                          </span>
                          {item.rate != null ? (
                            <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-brand-700">
                              ×{item.rate.toLocaleString("th-TH")}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[11px] text-slate-400">
                          {item.description}
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

        </aside>

        {/* detail */}
        <section className="min-w-0">
          {!selected ? (
            <div className="flex min-h-[320px] items-center justify-center px-5 3xl:px-6 4xl:px-7 text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-slate-400">
              เลือกประเภทวัน OT จากรายการด้านซ้าย
            </div>
          ) : detailLoading || !typeDraft ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm 3xl:text-[15px] 4xl:text-[15.5px] font-semibold text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              กำลังโหลดนโยบาย…
            </div>
          ) : rowDrafts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Building2 className="h-6 w-6" />}
                title="ยังไม่มีประเภทพนักงาน"
                description={`บริษัท ${scope.companyName} ยังไม่มีประเภทพนักงานที่ใช้งานอยู่ — เพิ่มที่ ตั้งค่าองค์กร ก่อนจึงจะตั้งอัตรา OT ได้`}
              />
            </div>
          ) : (
            <div className="min-w-0 space-y-5 p-5 xl:p-6 max-[1536px]:p-4">
              {/* หัวข้อของประเภทวันที่เลือก + ปุ่มบันทึก */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[15px] font-bold text-slate-900 3xl:text-[16.5px]">
                      {typeDraft.nameTh}
                    </h3>
                    <Badge tone={selected.enabled ? "positive" : "neutral"}>
                      {selected.enabled ? "เปิดใช้อยู่" : "ปิดใช้อยู่"}
                    </Badge>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNameModalOpen(true)}
                      icon={<Pencil className="h-3.5 w-3.5" />}
                    >
                      แก้ชื่อ
                    </Button>

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

              {detailError ? <Notice tone="critical">{detailError}</Notice> : null}

              <DetailSection
                title="อัตราและเงื่อนไขตามประเภทพนักงาน"
                badge={
                  <Badge tone="brand">
                    {scope.branchName ?? "ค่ามาตรฐานบริษัท"}
                  </Badge>
                }
                action={
                  canManage && rowDrafts.length > 1 ? (
                    <Button variant="ghost" size="sm" onClick={applyFirstRowToAll}>
                      ใช้ค่าแถวแรกกับทุกประเภท
                    </Button>
                  ) : null
                }
              >
                {/*
                  หนึ่งประเภทพนักงาน = หนึ่งแถว
                  เปิด/ปิดจากสวิตช์ซ้ายมือ ส่วนค่าตั้งกดกางออกมาแก้ในแถวได้เลย
                  (กางทีละแถว หน้าจึงไม่ยาวและไม่รก)
                */}
                <div className="divide-y divide-slate-100">
                  {rowDrafts.map((row) => {
                    const open = row.employeeTypeId === openRowId;

                    return (
                      <div
                        key={row.employeeTypeId}
                        className={joinClassName(
                          "-mx-4 px-4 transition-colors",
                          open && "bg-brand-50/50",
                          row.enabled ? "" : "opacity-60",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-3 py-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              patchRow(row.employeeTypeId, {
                                enabled: !row.enabled,
                              })
                            }
                            disabled={!canManage}
                            title={
                              row.enabled
                                ? "ปิดใช้กับประเภทพนักงานนี้"
                                : "เปิดใช้กับประเภทพนักงานนี้"
                            }
                            aria-label={row.enabled ? "ปิดใช้" : "เปิดใช้"}
                            aria-pressed={row.enabled}
                            className={joinClassName(
                              "relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
                              row.enabled
                                ? "border-brand-600 bg-brand-600"
                                : "border-slate-300 bg-slate-200",
                            )}
                          >
                            <span
                              className={joinClassName(
                                "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all",
                                row.enabled ? "left-[18px]" : "left-0.5",
                              )}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setOpenRowId(open ? null : row.employeeTypeId)
                            }
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <ChevronRight
                              className={joinClassName(
                                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                                open && "rotate-90",
                              )}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
                                {row.employeeTypeName}
                              </span>
                              <span className="block truncate text-[11px] text-slate-400">
                                {rowSummary(row)}
                              </span>
                            </span>
                          </button>

                          {!row.isOwnScope && row.inheritedFrom ? (
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {row.inheritedFrom === "COMPANY"
                                ? "สืบทอดจากบริษัท"
                                : "สืบทอดจากค่าทุกประเภท"}
                            </span>
                          ) : null}
                        </div>

                        {open ? (
                          <div className="mb-3 rounded-lg border border-slate-200 bg-white p-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&_input:not([type=checkbox])]:max-w-40">
                              <Field label="ขั้นต่ำก่อนคิดเป็น OT" hint="นาที">
                                <input
                                  type="number"
                                  min="0"
                                  max="480"
                                  value={row.minMinutes}
                                  disabled={!canManage}
                                  onChange={(event) =>
                                    patchRow(row.employeeTypeId, {
                                      minMinutes: event.target.value,
                                    })
                                  }
                                  className={modalInputClass}
                                />
                              </Field>

                              <Field label="เวลาที่เริ่มคำนวณ">
                                <select
                                  value={row.calcStartMode}
                                  disabled={!canManage}
                                  onChange={(event) =>
                                    patchRow(row.employeeTypeId, {
                                      calcStartMode: event.target
                                        .value as OvertimeCalcStartMode,
                                    })
                                  }
                                  className={modalInputClass}
                                >
                                  {calcStartModes.map((item) => (
                                    <option key={item.value} value={item.value}>
                                      {item.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <Field label="อัตรา" hint="เท่าของค่าแรงต่อชั่วโมง">
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  step="0.01"
                                  value={row.rateMultiplier}
                                  disabled={!canManage}
                                  onChange={(event) =>
                                    patchRow(row.employeeTypeId, {
                                      rateMultiplier: event.target.value,
                                    })
                                  }
                                  className={modalInputClass}
                                />
                              </Field>

                              <Field label="สูงสุดต่อวัน" hint="ว่าง = ไม่จำกัด (ชั่วโมง)">
                                <input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={row.maxHoursPerDay}
                                  disabled={!canManage}
                                  placeholder="—"
                                  onChange={(event) =>
                                    patchRow(row.employeeTypeId, {
                                      maxHoursPerDay: event.target.value,
                                    })
                                  }
                                  className={modalInputClass}
                                />
                              </Field>

                              <Field label="ปัดเศษชั่วโมง" hint="ปัดก่อนคูณอัตรา">
                                <select
                                  value={row.hourRoundingMode}
                                  disabled={!canManage}
                                  onChange={(event) =>
                                    patchRow(row.employeeTypeId, {
                                      hourRoundingMode: event.target
                                        .value as OvertimeHourRoundingMode,
                                    })
                                  }
                                  className={modalInputClass}
                                >
                                  {hourRoundingModes.map((item) => (
                                    <option key={item.value} value={item.value}>
                                      {item.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <Field label="ปัดเศษจำนวนเงิน" hint="ปัดหลังคูณอัตรา">
                                <select
                                  value={row.amountRoundingMode}
                                  disabled={!canManage}
                                  onChange={(event) =>
                                    patchRow(row.employeeTypeId, {
                                      amountRoundingMode: event.target
                                        .value as OvertimeAmountRoundingMode,
                                    })
                                  }
                                  className={modalInputClass}
                                >
                                  {amountRoundingModes.map((item) => (
                                    <option key={item.value} value={item.value}>
                                      {item.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                นำไปคำนวณกับ
                              </span>
                              <CheckLine
                                label="ภาษี"
                                checked={row.includeInTax}
                                disabled={!canManage}
                                onChange={(value) =>
                                  patchRow(row.employeeTypeId, {
                                    includeInTax: value,
                                  })
                                }
                              />
                              <CheckLine
                                label="ประกันสังคม"
                                checked={row.includeInSocialSecurity}
                                disabled={!canManage}
                                onChange={(value) =>
                                  patchRow(row.employeeTypeId, {
                                    includeInSocialSecurity: value,
                                  })
                                }
                              />
                              <CheckLine
                                label="ต้องอนุมัติ"
                                checked={row.requireApproval}
                                disabled={!canManage}
                                onChange={(value) =>
                                  patchRow(row.employeeTypeId, {
                                    requireApproval: value,
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

      {/* ชื่อและคำอธิบายของประเภทวัน — ตั้งครั้งเดียว เลยเก็บไว้ในป๊อปอัพ */}
      <PolicyModal
        open={nameModalOpen && Boolean(typeDraft)}
        title="แก้ชื่อและคำอธิบาย"
        description={selected ? `${selected.label} · ใช้ร่วมกันทุกประเภทพนักงาน` : undefined}
        submitLabel="เสร็จสิ้น"
        onClose={() => setNameModalOpen(false)}
        onSubmit={() => setNameModalOpen(false)}
      >
        {typeDraft ? (
          <div className="space-y-4">
            <ModalField label="ชื่อนโยบาย OT" required>
              <input
                value={typeDraft.nameTh}
                disabled={!canManage}
                onChange={(event) => patchType({ nameTh: event.target.value })}
                className={modalInputClass}
              />
            </ModalField>

            <ModalField label="ชื่อภาษาอังกฤษ" hint="ไม่บังคับ">
              <input
                value={typeDraft.nameEn}
                disabled={!canManage}
                placeholder={selected?.nameEn}
                onChange={(event) => patchType({ nameEn: event.target.value })}
                className={modalInputClass}
              />
            </ModalField>

            <ModalField label="คำอธิบาย" hint="ไม่บังคับ">
              <input
                value={typeDraft.description}
                disabled={!canManage}
                placeholder={selected?.description}
                onChange={(event) =>
                  patchType({ description: event.target.value })
                }
                className={modalInputClass}
              />
            </ModalField>

            {canManage ? (
              <p className="text-[12px] text-slate-400">
                ค่าที่แก้จะยังไม่ถูกบันทึกจนกว่าจะกดปุ่ม “บันทึก” ด้านบนของหน้า
              </p>
            ) : null}
          </div>
        ) : null}
      </PolicyModal>

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

/** สรุปค่าที่ตั้งไว้ของหนึ่งประเภทพนักงาน ให้อ่านได้จบในบรรทัดเดียว */
function rowSummary(row: RowDraft) {
  const parts = [
    `ขั้นต่ำ ${row.minMinutes || 0} นาที`,
    `×${row.rateMultiplier || 0}`,
    row.maxHoursPerDay ? `สูงสุด ${row.maxHoursPerDay} ชม./วัน` : "ไม่จำกัดต่อวัน",
    row.requireApproval ? "ต้องอนุมัติ" : "ไม่ต้องอนุมัติ",
  ];

  return parts.join(" · ");
}

/** ป้ายกำกับ + ช่องกรอกในแถวที่กางออก — ชุดเดียวกับฟอร์มอื่นในหน้านี้ */
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

