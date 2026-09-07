"use client";

import { useEffect, useState } from "react";
import { Download, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/feedback-state";
import {
  Button,
  Modal,
  Notice,
  Section,
  Select,
  StatTile,
  formatMoney,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import { PAYROLL_STATUS } from "@/lib/status-labels";
import {
  downloadEssSalarySlipPdf,
  getEssSalarySlip,
  getEssSalarySlips,
  getMyWithholdingCertificate,
  type PayslipPaperLayout,
} from "@/lib/api";
import { formatThaiDate } from "@/lib/date-format";
import { queryKeys } from "@/lib/query-keys";
import { useApiQuery } from "@/lib/use-api";
import type {
  PayrollPayslip,
  PayrollPayslipListSummary,
} from "@/types/payroll";

/**
 * สลิปเงินเดือนของตัวเอง
 * ----------------------
 * เลือกงวด → เห็นยอดสรุปของงวดนั้น แล้วไล่ดูรายการรายได้/รายการหักด้านล่าง
 * สลิปเป็นเอกสารอ่านอย่างเดียว จึงไม่มีการ์ดซ้อนการ์ด ใช้เส้นคั่นแบบเดียวกับ
 * หน้าเงินเดือนฝั่ง HR (/payroll/[periodId]) — รายได้เป็นสีกลาง รายการหักเป็นสีชมพู
 * และยอดสุทธิเป็นสี brand ตัวเดียวของหน้า
 */

const emptyPayslipSummary: PayrollPayslipListSummary = {
  total: 0,
  ready: 0,
  paid: 0,
  totalGrossPay: 0,
  totalEarnings: 0,
  totalDeductions: 0,
  totalNetPay: 0,
  latestNetPay: 0,
  latestPeriodName: null,
  latestPaymentDate: null,
  periods: [],
  selectedRunId: null,
};

/*
 * ตัวเลขสรุปในเนื้อหน้าไม่ต้องมีกรอบครอบ — อยู่ในผืนขาวของหน้าอยู่แล้ว
 * กรอบอีกชั้นทำให้กลายเป็นกล่องซ้อนกล่อง คั่นด้วยเส้นก็พอ
 */
const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0";

type PayslipLine = PayrollPayslip["lines"][number];

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function saveBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);

  triggerDownload(url, fileName);
  window.URL.revokeObjectURL(url);
}

const PAPER_LAYOUT_OPTIONS: { value: PayslipPaperLayout; label: string }[] = [
  { value: "FULL", label: "เต็มหน้า A4" },
  { value: "HALF", label: "ครึ่งหน้า A5" },
];

function payslipFileName(item: PayrollPayslip, layout: PayslipPaperLayout) {
  const suffix = layout === "HALF" ? "-a5" : "";

  return `salary-slip-${item.employee.employeeCode}-${item.run.period.code}${suffix}.pdf`;
}

function isGenericOtherIncomeName(name: string | null | undefined) {
  const normalized = (name ?? "").replace(/\s+/g, "").toLowerCase();

  return (
    normalized === "รายได้อื่นๆ" ||
    normalized === "รายได้อื่นฯ" ||
    normalized === "รายได้อื่น" ||
    normalized === "otherearning" ||
    normalized === "otherearnings" ||
    normalized === "otherincome"
  );
}

/** ชื่อรายการที่พนักงานอ่านแล้วเข้าใจ — "รายได้อื่น ๆ" เฉย ๆ บอกอะไรไม่ได้ */
function lineName(line: PayslipLine) {
  const componentName = line.component?.nameTh || line.component?.nameEn;
  const name = line.name || componentName || "รายการเงินเดือน";

  if (isGenericOtherIncomeName(name) && line.note) return line.note;
  return name;
}

/** แถวเงินหนึ่งบรรทัด — ชื่อซ้าย จำนวนเงินขวา */
function AmountRow({
  label,
  amount,
  tone = "neutral",
}: {
  label: string;
  amount: number;
  tone?: "neutral" | "deduction";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="min-w-0 truncate text-[13px] text-slate-600 3xl:text-[14px]">
        {label}
      </span>
      <span
        className={`shrink-0 text-[13px] font-semibold tabular-nums 3xl:text-[14px] ${
          tone === "deduction" ? "text-rose-600" : "text-slate-900"
        } ${amount === 0 ? "text-slate-300!" : ""}`}
      >
        {formatMoney(amount)}
      </span>
    </div>
  );
}

function AmountColumn({
  title,
  lines,
  totalLabel,
  total,
  tone = "neutral",
}: {
  title: string;
  lines: PayslipLine[];
  totalLabel: string;
  total: number;
  tone?: "neutral" | "deduction";
}) {
  return (
    <div className="min-w-0 px-5 py-4 3xl:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[11.5px]">
        {title}
      </p>

      <div className="mt-2 divide-y divide-slate-100">
        {lines.length === 0 ? (
          <p className="py-3 text-[13px] text-slate-400">ไม่มีรายการในงวดนี้</p>
        ) : (
          lines.map((line) => (
            <AmountRow
              key={line.id}
              label={lineName(line)}
              amount={Number(line.amount ?? 0)}
              tone={tone}
            />
          ))
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2.5">
        <span className="text-[13px] font-semibold text-slate-700 3xl:text-[14px]">
          {totalLabel}
        </span>
        <span
          className={`text-[15px] font-bold tabular-nums 3xl:text-[16px] ${
            tone === "deduction" ? "text-rose-600" : "text-slate-950"
          }`}
        >
          {formatMoney(total)}
        </span>
      </div>
    </div>
  );
}

export function SalarySlipPanel() {
  /*
   * งวดที่ผู้ใช้เลือกเองเท่านั้น ("" = ยังไม่เลือก ให้ backend ตัดสินใจ)
   * ไม่ sync ค่ากลับเข้า state หลังโหลด เพราะจะกลายเป็น setState ใน effect
   * แล้ววนเรนเดอร์ — ค่าที่แสดงในช่องเลือกอ่านจากผลลัพธ์โดยตรงแทน
   */
  const [selectedRunId, setSelectedRunId] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [paperLayout, setPaperLayout] = useState<PayslipPaperLayout>("FULL");
  /* ไฟล์ที่โหลดมาแล้วสำหรับดูก่อนบันทึก — กดดาวน์โหลดในกล่องใช้ไฟล์นี้ซ้ำ ไม่ยิงใหม่ */
  const [preview, setPreview] = useState<{
    url: string;
    fileName: string;
  } | null>(null);

  /*
   * ปล่อย object URL ทิ้งเมื่อปิดกล่องหรือออกจากหน้า ไม่งั้นไฟล์ PDF ค้างใน
   * หน่วยความจำของเบราว์เซอร์สะสมทุกครั้งที่กดดู
   */
  useEffect(() => {
    if (!preview) return;
    return () => window.URL.revokeObjectURL(preview.url);
  }, [preview]);

  const query = useApiQuery(
    queryKeys.ess.payslips({ runId: selectedRunId || "latest" }),
    async () => {
      const result = await getEssSalarySlips({
        runId: selectedRunId || undefined,
        page: 1,
        pageSize: 1,
      });

      const item = result.data[0] ?? null;

      return {
        summary: result.summary ?? emptyPayslipSummary,
        payslip: item ? await getEssSalarySlip(item.id) : null,
      };
    },
  );

  const summary = query.data?.summary ?? emptyPayslipSummary;
  const payslip = query.data?.payslip ?? null;
  const loading = query.isPending;

  const periodOptions = summary.periods ?? [];
  const activeRunId =
    selectedRunId || summary.selectedRunId || periodOptions[0]?.runId || "";
  const selectedPeriod =
    periodOptions.find((period) => period.runId === activeRunId) ?? null;

  async function downloadPdf(item: PayrollPayslip) {
    setDownloading(true);
    try {
      const blob = await downloadEssSalarySlipPdf(item.id, paperLayout);

      saveBlob(blob, payslipFileName(item, paperLayout));
      toast.success("ดาวน์โหลด PDF แล้ว");
    } catch (error) {
      toast.error(errorText(error, "ดาวน์โหลด PDF ไม่สำเร็จ"));
    } finally {
      setDownloading(false);
    }
  }

  async function openPreview(item: PayrollPayslip) {
    setPreviewLoading(true);
    try {
      const blob = await downloadEssSalarySlipPdf(item.id, paperLayout);

      setPreview({
        url: window.URL.createObjectURL(blob),
        fileName: payslipFileName(item, paperLayout),
      });
    } catch (error) {
      toast.error(errorText(error, "เปิดดูสลิปไม่สำเร็จ"));
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <LoadingState title="กำลังโหลดสลิปเงินเดือน" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <ErrorState
          title="โหลดสลิปเงินเดือนไม่สำเร็จ"
          description={errorText(query.error, "ลองใหม่อีกครั้ง")}
          action={
            <Button variant="primary" onClick={() => void query.refetch()}>
              ลองใหม่
            </Button>
          }
        />
      </div>
    );
  }

  const detailsVisible =
    payslip?.payslipDetailsVisible ??
    payslip?.run.payslipDetailsVisible ??
    true;
  const earnings = detailsVisible
    ? (payslip?.lines ?? []).filter((line) => line.type === "EARNING")
    : [];
  const deductions = detailsVisible
    ? (payslip?.lines ?? []).filter((line) => line.type === "DEDUCTION")
    : [];

  return (
    <>
      <Section
        title="งวดเงินเดือน"
        description="เลือกงวด ระบบจะแสดงยอดและรายการของงวดนั้นทันที"
        actions={
          <>
            <span className="block w-56 shrink-0">
              <Select
                value={activeRunId}
                onChange={(event) => setSelectedRunId(event.target.value)}
                disabled={periodOptions.length === 0 || query.isFetching}
                className="border-slate-300 bg-white shadow-none"
                aria-label="งวดเงินเดือน"
              >
                {periodOptions.length === 0 ? (
                  <option value="">ยังไม่มีงวดที่เปิดให้ดู</option>
                ) : (
                  periodOptions.map((period) => (
                    <option key={period.runId} value={period.runId}>
                      {period.periodName} · {period.runNo}
                    </option>
                  ))
                )}
              </Select>
            </span>

            {payslip ? (
              <>
                <span className="block w-36 shrink-0">
                  <Select
                    value={paperLayout}
                    onChange={(event) =>
                      setPaperLayout(event.target.value as PayslipPaperLayout)
                    }
                    disabled={previewLoading || downloading}
                    className="border-slate-300 bg-white shadow-none"
                    aria-label="รูปแบบกระดาษ"
                  >
                    {PAPER_LAYOUT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </span>
                <Button
                  onClick={() => void openPreview(payslip)}
                  disabled={previewLoading || downloading}
                  icon={<Eye className="h-3.5 w-3.5" />}
                >
                  {previewLoading ? "กำลังเปิด…" : "ดูสลิป"}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void downloadPdf(payslip)}
                  disabled={downloading || previewLoading}
                  icon={<Download className="h-3.5 w-3.5" />}
                >
                  {downloading ? "กำลังสร้าง…" : "ดาวน์โหลด PDF"}
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <div className={TILE_BOX}>
          <StatTile
            label="งวดที่เลือก"
            value={selectedPeriod?.periodName ?? "ยังไม่มีงวด"}
            helper={
              selectedPeriod?.paymentDate
                ? `จ่าย ${formatThaiDate(selectedPeriod.paymentDate)}`
                : "บริษัทจะเปิดให้ดูเมื่อพร้อม"
            }
          />
          <StatTile
            label="รายได้รวม"
            value={formatMoney(summary.totalEarnings)}
            helper="ก่อนหักรายการต่าง ๆ"
          />
          <StatTile
            label="รายการหักรวม"
            value={formatMoney(summary.totalDeductions)}
            helper="ภาษี ประกันสังคม และอื่น ๆ"
          />
          <StatTile
            label="เงินสุทธิ"
            value={formatMoney(summary.totalNetPay)}
            tone={summary.totalNetPay > 0 ? "positive" : "neutral"}
            helper="ยอดที่โอนเข้าบัญชี"
          />
        </div>
      </Section>

      {!payslip ? (
        <div className="px-5 py-6 sm:px-6">
          <EmptyState
            title="ยังไม่มีสลิปเงินเดือนที่เปิดดูได้"
            description="เมื่อบริษัทเปิดให้ดูสลิปของงวดใดใน ESS ข้อมูลของงวดนั้นจะแสดงที่นี่"
          />
        </div>
      ) : (
        <>
          <Section
            title="รายละเอียดสลิป"
            description={`${payslip.run.period.name} · ${formatThaiDate(payslip.run.period.startDate)} - ${formatThaiDate(payslip.run.period.endDate)}`}
            actions={
              <StatusBadge
                vocabulary={PAYROLL_STATUS}
                status={payslip.run.status}
              />
            }
            tight
          >
            {detailsVisible ? (
              <div className="grid divide-y divide-slate-200 border-t border-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <AmountColumn
                  title="รายได้"
                  lines={earnings}
                  totalLabel="รวมรายได้"
                  total={Number(payslip.totalEarnings ?? 0)}
                />
                <AmountColumn
                  title="รายการหัก"
                  lines={deductions}
                  totalLabel="รวมรายการหัก"
                  total={Number(payslip.totalDeductions ?? 0)}
                  tone="deduction"
                />
              </div>
            ) : (
              <div className="border-t border-slate-200 px-5 py-4 3xl:px-6">
                <Notice tone="info" icon={<EyeOff className="h-4 w-4" />}>
                  <p className="font-semibold">
                    บริษัทปิดการแสดงรายละเอียดรายรับ/รายหักของงวดนี้
                  </p>
                  <p className="mt-0.5 opacity-80">
                    ยังดูยอดรายได้รวม รายการหักรวม และเงินสุทธิได้ตามปกติ
                    แต่รายการย่อยและไฟล์ PDF จะไม่แสดงจนกว่าบริษัทจะเปิดอีกครั้ง
                  </p>
                </Notice>
              </div>
            )}

            {/* ยอดสุทธิเป็นคำตอบของทั้งหน้า จึงแยกออกมาเป็นแถบของตัวเอง */}
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-slate-200 bg-brand-50/60 px-5 py-3.5 3xl:px-6">
              <span className="text-[13px] font-bold text-slate-800 3xl:text-[14px]">
                เงินสุทธิที่ได้รับ
              </span>
              <span className="text-[22px] font-bold tabular-nums leading-7 text-brand-700 3xl:text-[24px]">
                {formatMoney(payslip.totalNetPay)}
                <span className="ml-1.5 text-[12px] font-semibold text-brand-500">
                  บาท
                </span>
              </span>
            </div>
          </Section>

          <Section
            title="ข้อมูลบนเอกสาร"
            description="ใช้อ้างอิงเวลาติดต่อ HR หรือฝ่ายเงินเดือน"
          >
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <DocumentItem label="บริษัท" value={payslip.run.company.nameTh} />
              <DocumentItem
                label="งวดเงินเดือน"
                value={payslip.run.period.code}
              />
              <DocumentItem
                label="วันที่จ่าย"
                value={formatThaiDate(payslip.run.period.paymentDate)}
              />
              <DocumentItem label="รอบคำนวณ" value={payslip.run.runNo} />
              <DocumentItem
                label="รหัสพนักงาน"
                value={payslip.employee.employeeCode}
              />
              <DocumentItem
                label="ตำแหน่ง"
                value={payslip.employee.position ?? "-"}
              />
              <DocumentItem
                label="แผนก"
                value={payslip.employee.department?.nameTh ?? "-"}
              />
              <DocumentItem
                label="สาขา"
                value={payslip.employee.branch?.nameTh ?? "-"}
              />
            </div>

            <p className="mt-4 text-[12px] leading-5 text-slate-400 3xl:text-[12.5px]">
              เอกสารนี้แสดงข้อมูลจากรอบคำนวณที่อนุมัติหรือจ่ายเงินแล้ว
              หากข้อมูลไม่ถูกต้องให้ติดต่อ HR หรือฝ่ายเงินเดือน
            </p>
          </Section>
        </>
      )}

      <TaxCertificateSection />

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        size="lg"
        title="สลิปเงินเดือน"
        description={
          payslip
            ? `${payslip.run.period.name} · ${payslip.run.runNo}`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setPreview(null)}>ปิด</Button>
            <Button
              variant="primary"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => {
                if (!preview) return;
                triggerDownload(preview.url, preview.fileName);
              }}
            >
              ดาวน์โหลด PDF
            </Button>
          </>
        }
      >
        {preview ? (
          <iframe
            src={preview.url}
            title="ตัวอย่างสลิปเงินเดือน"
            className="h-[68vh] w-full rounded-lg border border-slate-200 bg-slate-50"
          />
        ) : null}
      </Modal>
    </>
  );
}

/**
 * หนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) — ดึงเองได้ ไม่ต้องเดินไปขอบัญชี
 * เป็น "ร่าง" สำหรับตรวจยอดก่อนยื่นภาษี ฉบับลงนามจริงยังออกโดยฝ่ายบัญชี
 */
function TaxCertificateSection() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [cert, setCert] = useState<Awaited<
    ReturnType<typeof getMyWithholdingCertificate>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(selectedYear: number) {
    setLoading(true);
    setError(null);
    try {
      setCert(await getMyWithholdingCertificate({ year: selectedYear }));
    } catch (err) {
      setCert(null);
      setError(errorText(err, "ยังไม่มีข้อมูลภาษีของปีที่เลือก"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      tight
      title="หนังสือรับรองหักภาษี (50 ทวิ)"
      description="ยอดเงินได้และภาษีสะสมของปีภาษี ใช้ตรวจก่อนยื่นภาษีประจำปี"
      actions={
        <>
          <span className="block w-28 shrink-0">
            <Select
              value={String(year)}
              onChange={(event) => setYear(Number(event.target.value))}
              aria-label="ปีภาษี"
              className="border-slate-300 bg-white shadow-none"
            >
              {[currentYear, currentYear - 1].map((y) => (
                <option key={y} value={y}>
                  ปี {y + 543}
                </option>
              ))}
            </Select>
          </span>
          <Button onClick={() => void load(year)} disabled={loading}>
            {loading ? "กำลังโหลด…" : "ดูข้อมูล"}
          </Button>
        </>
      }
    >
      {error ? (
        <p className="px-5 py-4 text-[13px] text-slate-500 sm:px-6">{error}</p>
      ) : cert ? (
        <>
          <div className={TILE_BOX}>
            <StatTile
              label="เงินได้ทั้งปี (40(1))"
              value={formatMoney(Number(cert.paidAmount ?? 0))}
              helper={`จ่ายแล้ว ${cert.paymentCount ?? 0} งวด`}
            />
            <StatTile
              label="ภาษีหัก ณ ที่จ่ายสะสม"
              value={formatMoney(Number(cert.taxWithheldAmount ?? 0))}
              helper={
                cert.lastPaymentDate
                  ? `ถึงงวดจ่าย ${formatThaiDate(cert.lastPaymentDate)}`
                  : ""
              }
            />
            <StatTile
              label="เลขที่เอกสาร"
              value={cert.certificateNo ?? "-"}
              helper={`ปีภาษี ${(cert.taxYear?.year ?? year) + 543}`}
            />
          </div>
          <p className="px-5 pb-4 text-[12px] text-slate-500 sm:px-6">
            เอกสารนี้เป็นร่างสำหรับตรวจสอบยอด ฉบับจริงพร้อมลายเซ็นผู้จ่ายเงิน
            ให้ติดต่อฝ่ายบัญชี
          </p>
        </>
      ) : (
        <p className="px-5 py-4 text-[13px] text-slate-500 sm:px-6">
          เลือกปีภาษีแล้วกด &quot;ดูข้อมูล&quot;
        </p>
      )}
    </Section>
  );
}

function DocumentItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
        {value || "-"}
      </p>
    </div>
  );
}
