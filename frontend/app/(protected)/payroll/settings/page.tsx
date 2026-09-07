"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Building2,
  CalendarRange,
  Divide,
  Landmark,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  CollapsibleSection,
  Field,
  FieldGrid,
  IconButton,
  Modal,
  ModalActions,
  Notice,
  PageChip,
  PageHeading,
  PageSurface,
  Select,
  StatTile,
  Tabs,
  TextInput,
} from "@/components/kit";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { LoadingState } from "@/components/common/feedback-state";
import { SeveranceTierPanel } from "./_components/severance-tier-panel";
import {
  createPayrollTaxAllowanceType,
  createPayrollTaxBracket,
  createPayrollTaxYear,
  deletePayrollTaxAllowanceType,
  deletePayrollTaxBracket,
  deletePayrollTaxYear,
  getCompanyPayrollSetting,
  getOrganizationCompanies,
  getPayrollTaxAllowanceTypes,
  getPayrollTaxBrackets,
  getPayrollTaxYears,
  resetCompanyPayrollSetting,
  updateCompanyPayrollSetting,
} from "@/lib/api";
import {
  allowanceLimitText,
  dedupeTaxYears,
  errorText,
  money,
  percentFromRate,
  taxYearLabel,
  toIsoYear,
} from "@/lib/payroll-format";
import type { CompanyItem } from "@/types/organization";
import type {
  CompanyPayrollSetting,
  CompanyPayrollSettingSource,
} from "@/types/system-settings";
import type {
  PayrollTaxAllowanceType,
  PayrollTaxBracket,
  PayrollTaxYear,
} from "@/types/payroll";

/**
 * ตั้งค่าเงินเดือน
 * ---------------
 * ค่าที่ตั้งครั้งเดียวแล้วใช้ทุกเดือน ไม่ใช่งานประจำงวด จึงแยกออกมาจากหน้าทำเงินเดือน
 *
 * แบ่ง 2 เรื่องเท่านั้น:
 *   การคำนวณ — รอบตัดยอด ฐานหารเงินเดือน ประกันสังคม (ต่อบริษัท)
 *   ภาษี      — ปีภาษี ขั้นภาษี ประเภทค่าลดหย่อน (ต่อปีภาษี)
 */

type TabKey = "rules" | "taxTable" | "severance";

type CalcForm = {
  payrollCutoffDay: string;
  payrollPeriodStartDay: string;
  salaryDivisorDays: string;
  workingHoursPerDay: string;
  socialSecurityEmployeeRate: string;
  socialSecurityEmployerRate: string;
  socialSecurityMinBase: string;
  socialSecurityMaxBase: string;
};

const emptyCalcForm: CalcForm = {
  payrollCutoffDay: "25",
  payrollPeriodStartDay: "26",
  salaryDivisorDays: "30",
  workingHoursPerDay: "8",
  socialSecurityEmployeeRate: "5",
  socialSecurityEmployerRate: "5",
  socialSecurityMinBase: "1650",
  socialSecurityMaxBase: "17500",
};

function settingToForm(setting: CompanyPayrollSetting): CalcForm {
  return {
    payrollCutoffDay: String(setting.payrollCutoffDay ?? 25),
    payrollPeriodStartDay: String(setting.payrollPeriodStartDay ?? 26),
    salaryDivisorDays: String(setting.salaryDivisorDays ?? 30),
    workingHoursPerDay: String(setting.workingHoursPerDay ?? 8),
    socialSecurityEmployeeRate: String(setting.socialSecurityEmployeeRate ?? 5),
    socialSecurityEmployerRate: String(setting.socialSecurityEmployerRate ?? 5),
    socialSecurityMinBase: String(setting.socialSecurityMinBase ?? 1650),
    socialSecurityMaxBase: String(setting.socialSecurityMaxBase ?? 17500),
  };
}

const emptyYearForm = {
  taxYear: String(new Date().getFullYear() + 543),
  startDate: `${new Date().getFullYear()}-01-01`,
  endDate: `${new Date().getFullYear()}-12-31`,
  personalExpenseRate: "0.50",
  personalExpenseMax: "100000",
  standardPersonalAllowance: "60000",
};

const emptyBracketForm = {
  minIncome: "",
  maxIncome: "",
  rate: "",
  quickDeduction: "0",
  sortOrder: "100",
};

const emptyAllowanceForm = {
  code: "",
  nameTh: "",
  category: "GENERAL",
  defaultAmount: "0",
  maxAmount: "",
  maxPercentOfIncome: "",
  requiresAttachment: false,
  sortOrder: "100",
};

export default function PayrollSettingsPage() {
  const [tab, setTab] = useState<TabKey>("rules");
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [booting, setBooting] = useState(true);

  // การคำนวณ
  const [calcForm, setCalcForm] = useState<CalcForm>(emptyCalcForm);
  const [calcSource, setCalcSource] =
    useState<CompanyPayrollSettingSource | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcSaving, setCalcSaving] = useState(false);

  // ภาษี
  const [taxYears, setTaxYears] = useState<PayrollTaxYear[]>([]);
  const [taxYearId, setTaxYearId] = useState("");
  const [brackets, setBrackets] = useState<PayrollTaxBracket[]>([]);
  const [allowanceTypes, setAllowanceTypes] = useState<
    PayrollTaxAllowanceType[]
  >([]);
  const [taxLoading, setTaxLoading] = useState(false);

  const [modal, setModal] = useState<"year" | "bracket" | "allowance" | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [yearForm, setYearForm] = useState(emptyYearForm);
  const [bracketForm, setBracketForm] = useState(emptyBracketForm);
  const [allowanceForm, setAllowanceForm] = useState(emptyAllowanceForm);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);

  const visibleYears = useMemo(() => dedupeTaxYears(taxYears), [taxYears]);
  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId],
  );
  const selectedYear = useMemo(
    () => visibleYears.find((year) => year.id === taxYearId) ?? null,
    [visibleYears, taxYearId],
  );
  const limitGroups = selectedYear?.allowanceLimitGroups ?? [];

  useEffect(() => {
    void (async () => {
      try {
        const result = await getOrganizationCompanies({
          page: 1,
          pageSize: 100,
          status: "ACTIVE",
        });
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
      } catch (error) {
        toast.error(errorText(error, "โหลดรายชื่อบริษัทไม่สำเร็จ"));
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const loadCalculation = useCallback(async (targetCompanyId: string) => {
    if (!targetCompanyId) return;
    setCalcLoading(true);
    try {
      const setting = await getCompanyPayrollSetting(targetCompanyId);
      setCalcForm(settingToForm(setting));
      setCalcSource(setting.source);
    } catch (error) {
      toast.error(errorText(error, "โหลดค่าการคำนวณไม่สำเร็จ"));
    } finally {
      setCalcLoading(false);
    }
  }, []);

  const loadTax = useCallback(
    async (targetCompanyId: string, preferredYearId?: string) => {
      if (!targetCompanyId) return;
      setTaxLoading(true);
      try {
        const yearResult = await getPayrollTaxYears({
          companyId: targetCompanyId,
          page: 1,
          pageSize: 50,
        });
        const years = yearResult.data;
        setTaxYears(years);

        const canonical = dedupeTaxYears(years);
        const nextYearId =
          preferredYearId &&
          canonical.some((year) => year.id === preferredYearId)
            ? preferredYearId
            : canonical[0]?.id || "";
        setTaxYearId(nextYearId);

        if (!nextYearId) {
          setBrackets([]);
          setAllowanceTypes([]);
          return;
        }

        const [bracketResult, allowanceResult] = await Promise.all([
          getPayrollTaxBrackets({ taxYearId: nextYearId }),
          getPayrollTaxAllowanceTypes({ taxYearId: nextYearId }),
        ]);
        setBrackets(bracketResult);
        setAllowanceTypes(allowanceResult);
      } catch (error) {
        toast.error(errorText(error, "โหลดข้อมูลภาษีไม่สำเร็จ"));
      } finally {
        setTaxLoading(false);
      }
    },
    [],
  );

  // เลื่อนออกจากรอบ render เพื่อไม่ให้ setState ในตัวโหลดทำให้ render ซ้อนกัน
  useEffect(() => {
    if (!companyId) return;

    const timer = window.setTimeout(() => {
      void loadCalculation(companyId);
      void loadTax(companyId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [companyId, loadCalculation, loadTax]);

  async function onTaxYearChange(nextYearId: string) {
    setTaxYearId(nextYearId);
    if (!nextYearId) {
      setBrackets([]);
      setAllowanceTypes([]);
      return;
    }
    setTaxLoading(true);
    try {
      const [bracketResult, allowanceResult] = await Promise.all([
        getPayrollTaxBrackets({ taxYearId: nextYearId }),
        getPayrollTaxAllowanceTypes({ taxYearId: nextYearId }),
      ]);
      setBrackets(bracketResult);
      setAllowanceTypes(allowanceResult);
    } catch (error) {
      toast.error(errorText(error, "โหลดข้อมูลปีภาษีไม่สำเร็จ"));
    } finally {
      setTaxLoading(false);
    }
  }

  async function saveCalculation() {
    if (!companyId) return;
    setCalcSaving(true);
    try {
      const setting = await updateCompanyPayrollSetting(companyId, {
        payrollCutoffDay: Number(calcForm.payrollCutoffDay),
        payrollPeriodStartDay: Number(calcForm.payrollPeriodStartDay),
        salaryDivisorDays: Number(calcForm.salaryDivisorDays),
        workingHoursPerDay: Number(calcForm.workingHoursPerDay),
        socialSecurityEmployeeRate: Number(calcForm.socialSecurityEmployeeRate),
        socialSecurityEmployerRate: Number(calcForm.socialSecurityEmployerRate),
        socialSecurityMinBase: Number(calcForm.socialSecurityMinBase),
        socialSecurityMaxBase: Number(calcForm.socialSecurityMaxBase),
      });
      setCalcForm(settingToForm(setting));
      setCalcSource(setting.source);
      toast.success("บันทึกค่าการคำนวณแล้ว งวดถัดไปจะใช้ค่านี้");
    } catch (error) {
      toast.error(errorText(error, "บันทึกค่าการคำนวณไม่สำเร็จ"));
    } finally {
      setCalcSaving(false);
    }
  }

  function confirmResetCalculation() {
    setDialog({
      title: "กลับไปใช้ค่ากลางของระบบ?",
      description:
        "ค่าที่ตั้งไว้เฉพาะบริษัทนี้จะถูกลบ แล้วกลับไปใช้ค่ามาตรฐานที่ระบบกำหนด",
      confirmLabel: "ใช้ค่ากลาง",
      tone: "orange",
      onConfirm: async () => {
        const setting = await resetCompanyPayrollSetting(companyId);
        setCalcForm(settingToForm(setting));
        setCalcSource(setting.source);
      },
    });
  }

  async function saveTaxYear() {
    const isoYear = toIsoYear(yearForm.taxYear);
    if (!isoYear) {
      toast.error("กรุณาระบุปีภาษี");
      return;
    }
    setSaving(true);
    try {
      await createPayrollTaxYear({
        companyId,
        taxYear: isoYear,
        startDate: yearForm.startDate,
        endDate: yearForm.endDate,
        personalExpenseRate: yearForm.personalExpenseRate,
        personalExpenseMax: yearForm.personalExpenseMax,
        standardPersonalAllowance: yearForm.standardPersonalAllowance,
      });
      setModal(null);
      setYearForm(emptyYearForm);
      await loadTax(companyId);
      toast.success(
        "สร้างปีภาษีแล้ว ระบบใส่ขั้นภาษีและค่าลดหย่อนมาตรฐานให้อัตโนมัติ",
      );
    } catch (error) {
      toast.error(errorText(error, "สร้างปีภาษีไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function saveBracket() {
    if (!taxYearId) return;
    setSaving(true);
    try {
      await createPayrollTaxBracket({
        taxYearId,
        minIncome: bracketForm.minIncome || "0",
        maxIncome: bracketForm.maxIncome || undefined,
        rate: bracketForm.rate || "0",
        quickDeduction: bracketForm.quickDeduction || "0",
        sortOrder: Number(bracketForm.sortOrder || 0),
      });
      setModal(null);
      setBracketForm(emptyBracketForm);
      await onTaxYearChange(taxYearId);
      toast.success("เพิ่มขั้นภาษีแล้ว");
    } catch (error) {
      toast.error(errorText(error, "เพิ่มขั้นภาษีไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function saveAllowanceType() {
    if (!taxYearId) return;
    if (!allowanceForm.code.trim() || !allowanceForm.nameTh.trim()) {
      toast.error("กรุณากรอกรหัสและชื่อค่าลดหย่อน");
      return;
    }
    setSaving(true);
    try {
      await createPayrollTaxAllowanceType({
        taxYearId,
        code: allowanceForm.code.trim().toUpperCase(),
        nameTh: allowanceForm.nameTh.trim(),
        category: allowanceForm.category,
        defaultAmount: allowanceForm.defaultAmount || "0",
        maxAmount: allowanceForm.maxAmount || undefined,
        maxPercentOfIncome: allowanceForm.maxPercentOfIncome || undefined,
        requiresAttachment: allowanceForm.requiresAttachment,
        sortOrder: Number(allowanceForm.sortOrder || 0),
      });
      setModal(null);
      setAllowanceForm(emptyAllowanceForm);
      await onTaxYearChange(taxYearId);
      toast.success("เพิ่มประเภทค่าลดหย่อนแล้ว");
    } catch (error) {
      toast.error(errorText(error, "เพิ่มประเภทค่าลดหย่อนไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  /* เพดานเงินสมทบต่อคนต่อเดือน = ฐานสูงสุด × อัตรา (ปัดเป็นบาทแบบเดียวกับที่ สปส. ใช้) */
  const socialSecurityCap = (() => {
    const base = Number(calcForm.socialSecurityMaxBase) || 0;
    const rateOf = (rate: string) =>
      Math.round((base * (Number(rate) || 0)) / 100).toLocaleString("th-TH");

    return {
      employee: rateOf(calcForm.socialSecurityEmployeeRate),
      employer: rateOf(calcForm.socialSecurityEmployerRate),
    };
  })();

  if (booting) {
    return (
      <PageSurface className="px-5 py-6 sm:px-6">
        <LoadingState title="กำลังโหลดการตั้งค่า" />
      </PageSurface>
    );
  }

  return (
    <PageSurface>
      <PageHeading
        heroMotif="settings"
        eyebrow="Payroll Settings"
        title="ตั้งค่า"
        titleAccent="เงินเดือน"
        description="ค่าที่ตั้งครั้งเดียวแล้วใช้ทุกงวด — รอบตัดยอด ประกันสังคม และโครงสร้างภาษี"
        chips={
          <>
            {selectedCompany ? (
              <PageChip tone="brand" icon={<Building2 className="h-3 w-3" />}>
                {selectedCompany.nameTh ||
                  selectedCompany.nameEn ||
                  selectedCompany.code}
              </PageChip>
            ) : null}
            <PageChip>
              {calcSource === "COMPANY"
                ? "ใช้ค่าเฉพาะของบริษัทนี้"
                : "ใช้ค่ากลางของระบบ"}
            </PageChip>
          </>
        }
        actions={
          <>
            {/* ค่าที่ใช้จริงตอนนี้ เห็นได้โดยไม่ต้องเปิดแท็บเข้าไปดู */}
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(9.5rem,max-content))] sm:divide-y-0">
              <StatTile
                icon={<CalendarRange className="h-4 w-4" />}
                label="รอบตัดยอด"
                value={`${calcForm.payrollPeriodStartDay} – ${calcForm.payrollCutoffDay}`}
                helper="วันเริ่ม – วันตัดรอบ"
              />
              <StatTile
                icon={<Divide className="h-4 w-4" />}
                label="ฐานหารเงินเดือน"
                value={`${calcForm.salaryDivisorDays} วัน`}
                helper={`ทำงานวันละ ${calcForm.workingHoursPerDay} ชม.`}
              />
              <StatTile
                icon={<ShieldCheck className="h-4 w-4" />}
                label="ประกันสังคม"
                value={`${calcForm.socialSecurityEmployeeRate}%`}
                helper={`นายจ้าง ${calcForm.socialSecurityEmployerRate}%`}
              />
              <StatTile
                icon={<Landmark className="h-4 w-4" />}
                label="ปีภาษีที่ใช้"
                value={selectedYear ? taxYearLabel(selectedYear) : "ยังไม่มี"}
                tone={selectedYear ? "neutral" : "warning"}
                helper={`${visibleYears.length} ปีในระบบ`}
              />
            </div>
          </>
        }
      />

      {/*
        เนื้อหาอยู่บนผืนเดียวกับหัวเรื่อง: แท็บอยู่ใต้หัว แล้วแต่ละหัวข้อคั่นด้วยเส้น
        ฟิลด์กับผลลัพธ์ของสูตรวางคู่กันซ้าย-ขวา จะได้ไม่ต้องเลื่อนหาว่าค่าที่กรอกทำอะไร
      */}
      <>
        {/*
         * แถบเครื่องมือพื้นเทาอ่อน — เลือกบริษัทที่จะตั้งค่าก่อน
         * เดิมช่องนี้ซ่อนอยู่ในหัวเรื่องเหนือแผงตัวเลข ทำให้หัวหน้าสูงและหาไม่เจอ
         */}
        {companies.length > 1 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
            <div className="w-full sm:w-64 [&_select]:bg-white">
              <Select
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                aria-label="บริษัท"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nameTh || company.nameEn || company.code}
                  </option>
                ))}
              </Select>
            </div>

            <p className="text-[12.5px] text-slate-500 3xl:text-[13px]">
              {calcSource === "COMPANY"
                ? "กำลังใช้ค่าเฉพาะของบริษัทนี้"
                : "กำลังใช้ค่ากลางของระบบ"}
            </p>
          </div>
        ) : null}

        <Tabs
          className="border-slate-300"
          value={tab}
          onChange={setTab}
          items={[
            { key: "rules", label: "กฎการคำนวณ" },
            { key: "taxTable", label: "โครงสร้างภาษี" },
            { key: "severance", label: "ค่าชดเชย" },
          ]}
          trailing={
            tab === "severance" ? null : tab === "rules" ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={confirmResetCalculation}
                  disabled={calcSaving || !companyId}
                >
                  ใช้ค่ากลาง
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Save className="h-3.5 w-3.5" />}
                  onClick={() => void saveCalculation()}
                  loading={calcSaving}
                  disabled={!companyId}
                >
                  บันทึก
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setModal("year")}
                disabled={!companyId}
              >
                เพิ่มปีภาษี
              </Button>
            )
          }
        />

        {tab === "rules" ? (
          calcLoading ? (
            <div className="px-5 py-16 text-center text-[13px] text-slate-400">
              กำลังโหลด…
            </div>
          ) : (
            <>
              {calcSource === "SYSTEM_DEFAULT" ? (
                <div className="border-b border-slate-200 px-5 py-3">
                  <Notice tone="warning">
                    บริษัทนี้ยังใช้ค่ากลางของระบบอยู่ —
                    แก้แล้วกดบันทึกเพื่อให้เป็นค่าเฉพาะของบริษัทนี้
                  </Notice>
                </div>
              ) : null}

              <RuleSection
                title="รอบเงินเดือน"
                description="ใช้ตอนสร้างงวดเงินเดือน ระบบตั้งช่วงวันที่ให้อัตโนมัติ"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
                  <FieldGrid columns={2}>
                    <Field label="เริ่มรอบวันที่" hint="ของเดือนก่อนหน้า">
                      <TextInput
                        type="number"
                        min={1}
                        max={31}
                        value={calcForm.payrollPeriodStartDay}
                        onChange={(event) =>
                          setCalcForm((c) => ({
                            ...c,
                            payrollPeriodStartDay: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="ตัดยอดวันที่" hint="ของเดือนที่จ่าย">
                      <TextInput
                        type="number"
                        min={1}
                        max={31}
                        value={calcForm.payrollCutoffDay}
                        onChange={(event) =>
                          setCalcForm((c) => ({
                            ...c,
                            payrollCutoffDay: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </FieldGrid>

                  <RuleResult
                    icon={<CalendarRange className="h-4 w-4" />}
                    label="งวดที่จะได้"
                  >
                    วันที่ {calcForm.payrollPeriodStartDay} ถึงวันที่{" "}
                    {calcForm.payrollCutoffDay} ของเดือนถัดไป
                  </RuleResult>
                </div>
              </RuleSection>

              <RuleSection
                title="ฐานคำนวณเงินเดือน"
                description="ใช้ตอนหักลาไม่รับค่าจ้างและรายการหักที่คิดตามเวลา"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
                  <FieldGrid columns={2}>
                    <Field label="หารเงินเดือนด้วย" hint="จำนวนวันต่อเดือน">
                      <TextInput
                        type="number"
                        min={1}
                        max={31}
                        value={calcForm.salaryDivisorDays}
                        onChange={(event) =>
                          setCalcForm((c) => ({
                            ...c,
                            salaryDivisorDays: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="ชั่วโมงทำงานต่อวัน">
                      <TextInput
                        type="number"
                        min={1}
                        max={24}
                        value={calcForm.workingHoursPerDay}
                        onChange={(event) =>
                          setCalcForm((c) => ({
                            ...c,
                            workingHoursPerDay: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </FieldGrid>

                  <RuleResult
                    icon={<Divide className="h-4 w-4" />}
                    label="สูตรที่ได้"
                  >
                    ค่าจ้างต่อวัน = เงินเดือน ÷ {calcForm.salaryDivisorDays}
                    <span className="mx-1.5 text-slate-300">·</span>
                    ต่อชั่วโมง = ค่าจ้างต่อวัน ÷ {calcForm.workingHoursPerDay}
                  </RuleResult>
                </div>
              </RuleSection>

              <RuleSection
                title="ประกันสังคม"
                description="อัตราและฐานค่าจ้างที่ใช้คำนวณเงินสมทบทั้งสองฝ่าย"
              >
                <FieldGrid columns={4}>
                  <Field label="อัตราลูกจ้าง (%)">
                    <TextInput
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={calcForm.socialSecurityEmployeeRate}
                      onChange={(event) =>
                        setCalcForm((c) => ({
                          ...c,
                          socialSecurityEmployeeRate: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="อัตรานายจ้าง (%)">
                    <TextInput
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={calcForm.socialSecurityEmployerRate}
                      onChange={(event) =>
                        setCalcForm((c) => ({
                          ...c,
                          socialSecurityEmployerRate: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="ฐานค่าจ้างต่ำสุด (บาท)">
                    <TextInput
                      type="number"
                      min={0}
                      value={calcForm.socialSecurityMinBase}
                      onChange={(event) =>
                        setCalcForm((c) => ({
                          ...c,
                          socialSecurityMinBase: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="ฐานค่าจ้างสูงสุด (บาท)">
                    <TextInput
                      type="number"
                      min={0}
                      value={calcForm.socialSecurityMaxBase}
                      onChange={(event) =>
                        setCalcForm((c) => ({
                          ...c,
                          socialSecurityMaxBase: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </FieldGrid>

                {/*
                  ยอดสมทบสูงสุดต่อคนต่อเดือน — ตัวเลขที่คนตั้งค่าอยากรู้จริง ๆ
                  เดิมต้องเอาอัตรากับเพดานมาคูณกันเองถึงจะรู้ว่าหักได้ไม่เกินเท่าไหร่
                */}
                <div className="mt-4">
                  <RuleResult
                    icon={<ShieldCheck className="h-4 w-4" />}
                    label="สมทบสูงสุดต่อเดือน"
                  >
                    ลูกจ้าง{" "}
                    <strong className="font-bold tabular-nums">
                      {socialSecurityCap.employee}
                    </strong>{" "}
                    บาท
                    <span className="mx-1.5 text-slate-300">·</span>
                    นายจ้าง{" "}
                    <strong className="font-bold tabular-nums">
                      {socialSecurityCap.employer}
                    </strong>{" "}
                    บาท
                    <span className="mx-1.5 text-slate-300">·</span>
                    คิดจากฐานสูงสุด {calcForm.socialSecurityMaxBase} บาท
                  </RuleResult>
                </div>
              </RuleSection>
            </>
          )
        ) : null}

        {tab === "taxTable" ? (
          <>
            <RuleSection
              title="ปีภาษี"
              description="โครงสร้างภาษีแยกตามปี เพราะกฎหมายเปลี่ยนได้ทุกปี"
              actions={
                <>
                  <div className="w-40 shrink-0 [&_select]:bg-white">
                    <Select
                      value={taxYearId}
                      onChange={(event) =>
                        void onTaxYearChange(event.target.value)
                      }
                      aria-label="ปีภาษี"
                    >
                      {visibleYears.length === 0 ? (
                        <option value="">ยังไม่มีปีภาษี</option>
                      ) : null}
                      {visibleYears.map((year) => (
                        <option key={year.id} value={year.id}>
                          {taxYearLabel(year)}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {selectedYear ? (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() =>
                        setDialog({
                          title: "ลบปีภาษีนี้?",
                          description:
                            "ขั้นภาษี ประเภทค่าลดหย่อน และค่าลดหย่อนของพนักงานในปีนี้จะถูกลบไปด้วย",
                          confirmLabel: "ลบ",
                          tone: "red",
                          onConfirm: async () => {
                            await deletePayrollTaxYear(selectedYear.id);
                            await loadTax(companyId);
                          },
                        })
                      }
                    >
                      ลบปีนี้
                    </Button>
                  ) : null}
                </>
              }
            >
              {selectedYear ? (
                <div className="flex flex-wrap items-stretch divide-x divide-brand-100">
                  <YearFact
                    label="หักค่าใช้จ่าย"
                    value={`${percentFromRate(selectedYear.personalExpenseRate)} · ไม่เกิน ${money(selectedYear.personalExpenseMax)}`}
                  />
                  <YearFact
                    label="ลดหย่อนส่วนตัว"
                    value={`${money(selectedYear.standardPersonalAllowance)} บาท`}
                  />
                  <YearFact
                    label="ช่วงปีภาษี"
                    value={`${selectedYear.startDate.slice(0, 10)} – ${selectedYear.endDate.slice(0, 10)}`}
                  />
                  <YearFact
                    label="ที่ตั้งไว้"
                    value={`ขั้นภาษี ${brackets.length} · ลดหย่อน ${allowanceTypes.length}`}
                  />
                </div>
              ) : (
                <Notice tone="warning">
                  บริษัทนี้ยังไม่มีปีภาษี — กด &quot;เพิ่มปีภาษี&quot;
                  แล้วระบบจะใส่ขั้นภาษีและประเภทค่าลดหย่อนมาตรฐานให้อัตโนมัติ
                </Notice>
              )}
            </RuleSection>

            {selectedYear ? (
              /*
                สองตารางนี้ยาวมาก (ขั้นภาษี 8 แถว ค่าลดหย่อน 23 แถว)
                จึงทำเป็นหัวข้อกดกางออก ปิดไว้ก่อนเพื่อให้หน้าไม่ยืด
              */
              <>
                <CollapsibleSection
                  defaultOpen
                  title="ขั้นภาษี"
                  count={brackets.length}
                  description="ต้องต่อเนื่องกันตั้งแต่ 0 และขั้นสูงสุดต้องไม่มีเพดาน"
                  actions={
                    <Button
                      size="sm"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => setModal("bracket")}
                    >
                      เพิ่มขั้น
                    </Button>
                  }
                >
                  {/*
                    รายการทีละขั้น ไม่ใช่ตาราง — สามค่าต่อขั้นเท่านั้น
                    ตารางเดิมกว้าง 36rem และซ่อนคอลัมน์ "หักลัด" ในจอเล็ก
                    ทั้งที่เป็นตัวเลขที่ต้องตรวจคู่กับอัตราเสมอ
                  */}
                  {taxLoading && brackets.length === 0 ? (
                    <p className="px-5 py-10 text-center text-[13px] text-slate-400 sm:px-6">
                      กำลังโหลด…
                    </p>
                  ) : brackets.length === 0 ? (
                    <div className="px-5 py-10 text-center sm:px-6">
                      <p className="text-[13px] font-semibold text-slate-600">
                        ยังไม่มีขั้นภาษี
                      </p>
                      <p className="mt-1 text-[12.5px] text-slate-400">
                        ถ้าไม่มีขั้นภาษี ระบบจะไม่หักภาษีให้พนักงานเลย
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-brand-100 border-t border-brand-100">
                      {brackets.map((row, index) => (
                        <BracketRow
                          key={row.id}
                          index={index}
                          row={row}
                          onDelete={() =>
                            setDialog({
                              title: "ลบขั้นภาษีนี้?",
                              description:
                                "ขั้นภาษีต้องต่อเนื่องกัน ถ้าลบแล้วเกิดช่องว่างระบบจะคำนวณภาษีผิด",
                              confirmLabel: "ลบ",
                              tone: "red",
                              onConfirm: async () => {
                                await deletePayrollTaxBracket(row.id);
                                await onTaxYearChange(taxYearId);
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title="ประเภทค่าลดหย่อน"
                  count={allowanceTypes.length}
                  description="รายการที่พนักงานเลือกกรอกได้ในหน้าค่าจ้างพนักงาน"
                  actions={
                    <Button
                      size="sm"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => setModal("allowance")}
                    >
                      เพิ่มประเภท
                    </Button>
                  }
                >
                  {taxLoading && allowanceTypes.length === 0 ? (
                    <p className="px-5 py-10 text-center text-[13px] text-slate-400 sm:px-6">
                      กำลังโหลด…
                    </p>
                  ) : allowanceTypes.length === 0 ? (
                    <p className="px-5 py-10 text-center text-[13px] font-semibold text-slate-600 sm:px-6">
                      ยังไม่มีประเภทค่าลดหย่อน
                    </p>
                  ) : (
                    <div className="divide-y divide-brand-100 border-t border-brand-100">
                      {allowanceTypes.map((row) => (
                        <AllowanceRow
                          key={row.id}
                          row={row}
                          limitText={allowanceLimitText(row)}
                          groupText={
                            row.limitGroupCode
                              ? (limitGroups.find(
                                  (group) => group.code === row.limitGroupCode,
                                )?.nameTh ?? row.limitGroupCode)
                              : null
                          }
                          onDelete={() =>
                            setDialog({
                              title: `ลบ ${row.nameTh}?`,
                              description:
                                "พนักงานที่เคยกรอกค่าลดหย่อนประเภทนี้ไว้จะไม่ถูกนำไปคำนวณอีก",
                              confirmLabel: "ลบ",
                              tone: "red",
                              onConfirm: async () => {
                                await deletePayrollTaxAllowanceType(row.id);
                                await onTaxYearChange(taxYearId);
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </CollapsibleSection>
              </>
            ) : null}
          </>
        ) : null}

        {tab === "severance" ? (
          companyId ? (
            <SeveranceTierPanel companyId={companyId} />
          ) : (
            <div className="px-5 py-16 text-center text-[13px] text-slate-400">
              เลือกบริษัทก่อน
            </div>
          )
        ) : null}
      </>

      <Modal
        open={modal === "year"}
        title="เพิ่มปีภาษี"
        description="ระบบจะใส่ขั้นภาษีและประเภทค่าลดหย่อนมาตรฐานให้อัตโนมัติ"
        onClose={() => setModal(null)}
        footer={
          <ModalActions
            onCancel={() => setModal(null)}
            onConfirm={() => void saveTaxYear()}
            confirmLabel="สร้างปีภาษี"
            loading={saving}
          />
        }
      >
        <FieldGrid columns={2}>
          <Field label="ปีภาษี (พ.ศ.)" required>
            <TextInput
              value={yearForm.taxYear}
              onChange={(event) =>
                setYearForm((f) => ({ ...f, taxYear: event.target.value }))
              }
              placeholder="2569"
            />
          </Field>
          <Field label="ลดหย่อนส่วนตัว (บาท)">
            <TextInput
              value={yearForm.standardPersonalAllowance}
              onChange={(event) =>
                setYearForm((f) => ({
                  ...f,
                  standardPersonalAllowance: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="วันที่เริ่ม">
            <TextInput
              type="date"
              value={yearForm.startDate}
              onChange={(event) =>
                setYearForm((f) => ({ ...f, startDate: event.target.value }))
              }
            />
          </Field>
          <Field label="วันที่สิ้นสุด">
            <TextInput
              type="date"
              value={yearForm.endDate}
              onChange={(event) =>
                setYearForm((f) => ({ ...f, endDate: event.target.value }))
              }
            />
          </Field>
          <Field label="หักค่าใช้จ่าย" hint="0.50 = 50%">
            <TextInput
              value={yearForm.personalExpenseRate}
              onChange={(event) =>
                setYearForm((f) => ({
                  ...f,
                  personalExpenseRate: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="เพดานค่าใช้จ่าย (บาท)">
            <TextInput
              value={yearForm.personalExpenseMax}
              onChange={(event) =>
                setYearForm((f) => ({
                  ...f,
                  personalExpenseMax: event.target.value,
                }))
              }
            />
          </Field>
        </FieldGrid>
      </Modal>

      <Modal
        open={modal === "bracket"}
        title="เพิ่มขั้นภาษี"
        description="ขอบล่างของขั้นนี้ต้องเท่ากับขอบบนของขั้นก่อนหน้าพอดี"
        size="sm"
        onClose={() => setModal(null)}
        footer={
          <ModalActions
            onCancel={() => setModal(null)}
            onConfirm={() => void saveBracket()}
            confirmLabel="เพิ่มขั้น"
            loading={saving}
          />
        }
      >
        <FieldGrid columns={2}>
          <Field label="เงินได้สุทธิตั้งแต่" required>
            <TextInput
              value={bracketForm.minIncome}
              onChange={(event) =>
                setBracketForm((f) => ({ ...f, minIncome: event.target.value }))
              }
              placeholder="150000"
            />
          </Field>
          <Field label="ถึง" hint="เว้นว่าง = ขั้นสูงสุด">
            <TextInput
              value={bracketForm.maxIncome}
              onChange={(event) =>
                setBracketForm((f) => ({ ...f, maxIncome: event.target.value }))
              }
              placeholder="300000"
            />
          </Field>
          <Field label="อัตราภาษี" required hint="0.05 = 5%">
            <TextInput
              value={bracketForm.rate}
              onChange={(event) =>
                setBracketForm((f) => ({ ...f, rate: event.target.value }))
              }
              placeholder="0.05"
            />
          </Field>
          <Field label="ลำดับ">
            <TextInput
              value={bracketForm.sortOrder}
              onChange={(event) =>
                setBracketForm((f) => ({ ...f, sortOrder: event.target.value }))
              }
            />
          </Field>
        </FieldGrid>
      </Modal>

      <Modal
        open={modal === "allowance"}
        title="เพิ่มประเภทค่าลดหย่อน"
        onClose={() => setModal(null)}
        footer={
          <ModalActions
            onCancel={() => setModal(null)}
            onConfirm={() => void saveAllowanceType()}
            confirmLabel="เพิ่มประเภท"
            loading={saving}
          />
        }
      >
        <FieldGrid columns={2}>
          <Field label="รหัส" required>
            <TextInput
              value={allowanceForm.code}
              onChange={(event) =>
                setAllowanceForm((f) => ({ ...f, code: event.target.value }))
              }
              placeholder="LIFE_INSURANCE"
            />
          </Field>
          <Field label="ชื่อที่แสดง" required>
            <TextInput
              value={allowanceForm.nameTh}
              onChange={(event) =>
                setAllowanceForm((f) => ({ ...f, nameTh: event.target.value }))
              }
              placeholder="เบี้ยประกันชีวิต"
            />
          </Field>
          <Field label="เพดานจำนวนเงิน (บาท)" hint="เว้นว่าง = ไม่จำกัด">
            <TextInput
              value={allowanceForm.maxAmount}
              onChange={(event) =>
                setAllowanceForm((f) => ({
                  ...f,
                  maxAmount: event.target.value,
                }))
              }
              placeholder="100000"
            />
          </Field>
          <Field label="เพดาน % ของเงินได้" hint="0.15 = 15%">
            <TextInput
              value={allowanceForm.maxPercentOfIncome}
              onChange={(event) =>
                setAllowanceForm((f) => ({
                  ...f,
                  maxPercentOfIncome: event.target.value,
                }))
              }
            />
          </Field>
        </FieldGrid>
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={allowanceForm.requiresAttachment}
            onChange={(event) =>
              setAllowanceForm((f) => ({
                ...f,
                requiresAttachment: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
          />
          ต้องแนบหลักฐานถึงจะกรอกยอดได้
        </label>
      </Modal>

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </PageSurface>
  );
}

/** หัวข้อย่อยในแท็บตั้งค่า — ป้ายฟ้าคั่นด้วยเส้นบาง แทนหัวข้อเทาตัวใหญ่ */
function RuleSection({
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
    <section className="border-b border-slate-200 px-5 py-4 last:border-b-0 sm:px-6 3xl:px-7">
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
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** ผลลัพธ์ของค่าที่กรอก — บอกว่าตั้งแบบนี้แล้วระบบจะคิดยังไง */
function RuleResult({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-brand-50/70 px-3.5 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-brand-100">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {label}
        </p>
        <p className="text-[13px] leading-5 text-slate-800 3xl:text-[13.5px]">
          {children}
        </p>
      </div>
    </div>
  );
}

/** ค่าประจำปีภาษีหนึ่งช่อง */
function YearFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[10rem] flex-auto px-4 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p className="text-[13px] font-semibold tabular-nums text-slate-900 3xl:text-[13.5px]">
        {value}
      </p>
    </div>
  );
}

/** ขั้นภาษีหนึ่งขั้น — บรรทัดเดียว */
function BracketRow({
  index,
  row,
  onDelete,
}: {
  index: number;
  row: PayrollTaxBracket;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11.5px] font-bold tabular-nums text-brand-700">
        {index + 1}
      </span>

      <p className="min-w-[12rem] flex-1 text-[13.5px] font-semibold tabular-nums text-slate-900 3xl:text-[14px]">
        {money(row.minIncome)} –{" "}
        {row.maxIncome ? money(row.maxIncome) : "ขึ้นไป"}
      </p>

      <div className="flex shrink-0 items-stretch divide-x divide-brand-100">
        <div className="w-24 px-4 first:pl-0">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
            อัตราภาษี
          </p>
          <p className="text-[13.5px] font-bold tabular-nums text-slate-900 3xl:text-[14px]">
            {percentFromRate(row.rate)}
          </p>
        </div>
        <div className="w-32 px-4 last:pr-0">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
            หักลัด
          </p>
          <p className="text-[13px] font-semibold tabular-nums text-slate-700 3xl:text-[13.5px]">
            {money(row.quickDeduction)}
          </p>
        </div>
      </div>

      <div className="flex w-9 shrink-0 justify-end">
        <IconButton
          title="ลบขั้นภาษี"
          tone="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={onDelete}
        />
      </div>
    </article>
  );
}

/** ประเภทค่าลดหย่อนหนึ่งรายการ — บรรทัดเดียว */
function AllowanceRow({
  row,
  limitText,
  groupText,
  onDelete,
}: {
  row: PayrollTaxAllowanceType;
  limitText: string;
  groupText: string | null;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6">
      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
            {row.nameTh}
          </p>
          {row.requiresAttachment ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">
              ต้องแนบหลักฐาน
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
          {row.code}
        </p>
      </div>

      {/* ตรึงความกว้างไว้ ทุกแถวจะได้ขึ้นต้นตรงแนวเดียวกันทั้งคอลัมน์ */}
      <div className="flex shrink-0 items-stretch divide-x divide-brand-100">
        <div className="w-56 px-4 first:pl-0 3xl:w-64">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
            เพดาน
          </p>
          <p className="text-[13px] font-semibold leading-5 tabular-nums text-slate-900 3xl:text-[13.5px]">
            {limitText}
          </p>
        </div>
        <div className="w-52 px-4 last:pr-0 3xl:w-56">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
            กลุ่มเพดานรวม
          </p>
          <p className="text-[13px] font-semibold leading-5 text-slate-700 3xl:text-[13.5px]">
            {groupText ?? <span className="text-slate-300">ไม่มี</span>}
          </p>
        </div>
      </div>

      <div className="flex w-9 shrink-0 justify-end">
        <IconButton
          title="ลบประเภทค่าลดหย่อน"
          tone="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={onDelete}
        />
      </div>
    </article>
  );
}
