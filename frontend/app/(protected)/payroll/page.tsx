"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarRange,
  Clock,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  PageChip,
  PageHeading,
  PageSurface,
  Select,
  StatTile,
} from "@/components/kit";
import { LoadingState } from "@/components/common/feedback-state";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  deletePayrollPeriod,
  getOrganizationCompanies,
  getPayrollPeriods,
  getPayrollRuns,
} from "@/lib/api";
import { count, dateText, errorText, money } from "@/lib/payroll-format";
import type { CompanyItem } from "@/types/organization";
import type { PayrollPeriod, PayrollRun } from "@/types/payroll";

import { CreatePeriodModal } from "./_components/create-period-modal";
import { periodLabel } from "./_components/period-format";
import { canDeletePeriod, PeriodList } from "./_components/period-list";

/**
 * รายการงวดเงินเดือน
 * ------------------
 * หน้าแรกของโซนเงินเดือนตอบว่า "งวดไหนถึงขั้นไหนแล้ว" ไม่ใช่ยอดของงวดใดงวดหนึ่ง
 * งานจริงของแต่ละงวดอยู่ที่ /payroll/:periodId
 */

export default function PayrollPeriodsPage() {
  const router = useRouter();

  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [booting, setBooting] = useState(true);

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(false);

  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

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

  /**
   * โหลดงวดพร้อมรอบคำนวณของทุกงวดในครั้งเดียว
   * ตารางจะได้มีสถานะและยอดครบโดยไม่ต้องยิง API รายงวด
   */
  const loadPeriods = useCallback(async (targetCompanyId: string) => {
    if (!targetCompanyId) return;

    setLoading(true);
    try {
      const [periodResult, runResult] = await Promise.all([
        getPayrollPeriods({
          companyId: targetCompanyId,
          page: 1,
          pageSize: 50,
        }),
        getPayrollRuns({ companyId: targetCompanyId, page: 1, pageSize: 100 }),
      ]);

      setPeriods(periodResult.data);
      setRuns(runResult.data);
    } catch (error) {
      toast.error(errorText(error, "โหลดงวดเงินเดือนไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const timer = window.setTimeout(() => void loadPeriods(companyId), 0);
    return () => window.clearTimeout(timer);
  }, [companyId, loadPeriods]);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId],
  );

  /** รอบที่ยังใช้งานอยู่ของแต่ละงวด — หนึ่งงวดควรมีรอบเดียวที่ไม่ถูกยกเลิก */
  const runByPeriodId = useMemo(() => {
    const map = new Map<string, PayrollRun>();
    for (const item of runs) {
      if (item.status === "CANCELLED") continue;
      if (!map.has(item.periodId)) map.set(item.periodId, item);
    }
    return map;
  }, [runs]);

  /**
   * ลบงวด — ถามยืนยันก่อนเสมอ เพราะกดพลาดแล้วงวดหายจากรายการทันที
   *
   * ปุ่มโผล่เฉพาะงวดที่ยังไม่มีรอบคำนวณและยังไม่ถูกล็อก แต่เช็คซ้ำตรงนี้อีกที
   * เผื่อข้อมูลบนจอเก่ากว่าของจริง (มีคนเพิ่งเริ่มคำนวณงวดนี้จากอีกเครื่อง)
   */
  function confirmDeletePeriod(period: PayrollPeriod) {
    const run = runByPeriodId.get(period.id);

    if (!canDeletePeriod(period, run)) {
      toast.error("งวดนี้เริ่มคำนวณหรือถูกล็อกแล้ว จึงลบไม่ได้");
      return;
    }

    setActionDialog({
      title: `ลบงวด ${periodLabel(period)}`,
      description:
        "งวดนี้จะถูกลบออกจากระบบถาวร พร้อมรอบคำนวณที่ยังว่างเปล่าของงวด · รายการปรับปรุงและงานที่ HR ตรวจไว้ของช่วงนี้จะถูกปลดออกจากงวด แล้วถูกดึงกลับเข้างวดใหม่ที่ครอบวันเดียวกันเอง",
      confirmLabel: "ยืนยันลบงวด",
      cancelLabel: "กลับไป",
      tone: "red",
      onConfirm: async () => {
        try {
          setDeletingId(period.id);
          await deletePayrollPeriod(period.id);
          toast.success("ลบงวดเรียบร้อยแล้ว");
          await loadPeriods(companyId);
        } catch (error) {
          toast.error(errorText(error, "ลบงวดไม่สำเร็จ"));
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  /**
   * ตัวเลขบนหัวหน้า — ตอบสามคำถามแรกที่คนเปิดหน้านี้อยากรู้:
   * ยังมีงวดค้างไหม / ค้างเป็นเงินเท่าไหร่ / ปีนี้จ่ายไปแล้วเท่าไหร่
   */
  const overview = useMemo(() => {
    const activeRuns = Array.from(runByPeriodId.values());
    const pendingRuns = activeRuns.filter((item) => item.status !== "PAID");
    const thisYear = new Date().getFullYear();

    const paidThisYear = periods.filter((period) => {
      if (period.year !== thisYear) return false;
      return runByPeriodId.get(period.id)?.status === "PAID";
    });

    const latest = periods[0] ?? null;

    return {
      totalPeriods: periods.length,
      pendingCount: pendingRuns.length,
      pendingNetPay: pendingRuns.reduce(
        (sum, item) => sum + Number(item.totalNetPay ?? 0),
        0,
      ),
      notStartedCount: periods.filter((period) => !runByPeriodId.get(period.id))
        .length,
      paidThisYearCount: paidThisYear.length,
      paidThisYearNetPay: paidThisYear.reduce(
        (sum, period) =>
          sum + Number(runByPeriodId.get(period.id)?.totalNetPay ?? 0),
        0,
      ),
      latestPeriod: latest,
      latestRun: latest ? (runByPeriodId.get(latest.id) ?? null) : null,
    };
  }, [periods, runByPeriodId]);

  if (booting) {
    return (
      <PageSurface className="px-5 py-6 sm:px-6">
        <LoadingState title="กำลังเปิดหน้าทำเงินเดือน" />
      </PageSurface>
    );
  }

  return (
    <PageSurface>
      <PageHeading
        heroMotif="payroll"
        eyebrow="Payroll"
        title="รอบจ่าย"
        titleAccent="เงินเดือน"
        description="เลือกงวดที่ต้องการทำงาน แล้วเข้าไปคำนวณ ตรวจสอบ อนุมัติ จนถึงออกเอกสาร"
        chips={
          <>
            {selectedCompany ? (
              <PageChip tone="brand" icon={<Building2 className="h-3 w-3" />}>
                {selectedCompany.nameTh ||
                  selectedCompany.nameEn ||
                  selectedCompany.code}
              </PageChip>
            ) : null}
            {overview.latestRun ? (
              <PageChip icon={<Users className="h-3 w-3" />}>
                พนักงานในงวดล่าสุด {count(overview.latestRun.totalEmployees)} คน
              </PageChip>
            ) : null}
          </>
        }
        actions={
          <>
            {/* ตัวเลขของทั้งบริษัท วางคู่หัวเรื่อง เห็นภาพรวมก่อนไล่ดูรายงวด */}
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(9.5rem,max-content))] sm:divide-y-0">
              <StatTile
                icon={<CalendarRange className="h-4 w-4" />}
                label="งวดทั้งหมด"
                value={`${count(overview.totalPeriods)} งวด`}
                helper={
                  overview.notStartedCount > 0
                    ? `ยังไม่เริ่มทำ ${count(overview.notStartedCount)} งวด`
                    : "เริ่มทำครบทุกงวดแล้ว"
                }
              />

              <StatTile
                icon={<Clock className="h-4 w-4" />}
                label="ยังไม่จ่าย"
                value={`${count(overview.pendingCount)} งวด`}
                tone={overview.pendingCount > 0 ? "warning" : "positive"}
                helper={
                  overview.pendingCount > 0
                    ? `ยอดที่ต้องโอน ${money(overview.pendingNetPay)}`
                    : "จ่ายครบทุกงวดแล้ว"
                }
              />

              <StatTile
                icon={<Banknote className="h-4 w-4" />}
                label={`จ่ายแล้วปี ${new Date().getFullYear() + 543}`}
                value={money(overview.paidThisYearNetPay)}
                helper={`${count(overview.paidThisYearCount)} งวดที่จ่ายเสร็จแล้ว`}
              />

              <StatTile
                icon={<BadgeCheck className="h-4 w-4" />}
                label="งวดล่าสุด"
                value={
                  overview.latestPeriod
                    ? periodLabel(overview.latestPeriod)
                    : "-"
                }
                helper={
                  overview.latestRun
                    ? `สุทธิ ${money(overview.latestRun.totalNetPay)}`
                    : overview.latestPeriod
                      ? `จ่าย ${dateText(overview.latestPeriod.paymentDate)} · ยังไม่เริ่มทำ`
                      : "ยังไม่มีงวดในระบบ"
                }
              />
            </div>
          </>
        }
      />

      {/*
       * แถบเครื่องมือพื้นเทาอ่อน — เลือกบริษัทกับสร้างงวดใหม่คือสิ่งที่ทำก่อนดูรายการ
       * เดิมซ่อนอยู่ในหัวเรื่องรวมกับแผงตัวเลข ทำให้หัวหน้าสูงและหาปุ่มยาก
       */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        {companies.length > 1 ? (
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
        ) : null}

        <p className="text-[12.5px] text-slate-500 3xl:text-[13px]">
          {loading
            ? "กำลังโหลดงวด…"
            : `${count(overview.totalPeriods)} งวด${
                overview.pendingCount > 0
                  ? ` · ยังไม่จ่าย ${count(overview.pendingCount)} งวด`
                  : ""
              }`}
        </p>

        <div className="ml-auto">
          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setPeriodModalOpen(true)}
            disabled={!companyId}
          >
            สร้างงวดใหม่
          </Button>
        </div>
      </div>

      <PeriodList
        periods={periods}
        runByPeriodId={runByPeriodId}
        loading={loading}
        onOpen={(period) => router.push(`/payroll/${period.id}`)}
        onDelete={confirmDeletePeriod}
        deletingId={deletingId}
      />

      <ActionDialog
        state={actionDialog}
        onClose={() => setActionDialog(null)}
      />

      <CreatePeriodModal
        open={periodModalOpen}
        companyId={companyId}
        onClose={() => setPeriodModalOpen(false)}
        onCreated={(period) => {
          setPeriodModalOpen(false);
          router.push(`/payroll/${period.id}`);
        }}
      />
    </PageSurface>
  );
}
