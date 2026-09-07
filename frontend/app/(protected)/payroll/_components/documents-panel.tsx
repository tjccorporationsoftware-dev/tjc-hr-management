"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Download,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button, Select, joinClassName } from "@/components/kit";
import {
  downloadBankTransferFile,
  downloadFilingReportCsv,
  downloadPayrollRunExcel,
  downloadPayrollRunPayslipsZip,
  type PayslipPaperLayout,
  downloadPayrollRunPdf,
  downloadPayrollTaxPnd1AReportCsv,
  downloadPayrollTaxPnd1ReportCsv,
  downloadSsoEFilingFile,
  getBankTransferFilingReport,
  getPayrollRunPayslipPublicationStatus,
  getSocialSecurityFilingReport,
  getStudentLoanFilingReport,
  hidePayrollRunPayslipDetails,
  publishPayrollRunPayslips,
  showPayrollRunPayslipDetails,
  unpublishPayrollRunPayslips,
} from "@/lib/api";
import { downloadBlob, errorText, money } from "@/lib/payroll-format";
import {
  BANK_FORMAT_LABEL,
  type BankTransferFilingReport,
  type BankTransferFormat,
  type SocialSecurityFilingReport,
  type StudentLoanFilingReport,
} from "@/types/payroll-filing";
import type { PayrollPayslipPublicationStatusResponse } from "@/types/payroll";

/**
 * เอกสารและไฟล์นำส่งของงวดที่เลือก
 * -------------------------------
 * ทุกไฟล์ดึงยอดจากรอบที่คำนวณไว้แล้ว ไม่มีการคำนวณซ้ำ
 * ตัวเลขที่ยื่นจึงตรงกับสลิปที่พนักงานได้รับเสมอ
 */

type Props = {
  runId: string;
  runNo: string;
  runStatus: string;
  taxYearId: string;
  companyId: string;
  paymentMonth: number;
  paymentYear: number;
  /** ส่งสถานะการเผยแพร่สลิปกลับให้หน้าหลัก จะได้ไม่ต้องยิง API ซ้ำเพื่อโชว์บนแถบหัว */
  onPublicationChange?: (status: PayrollPayslipPublicationStatusResponse) => void;
};

type Reports = {
  sso: SocialSecurityFilingReport | null;
  bank: BankTransferFilingReport | null;
  loan: StudentLoanFilingReport | null;
};

export function DocumentsPanel({
  runId,
  runNo,
  runStatus,
  taxYearId,
  companyId,
  paymentMonth,
  paymentYear,
  onPublicationChange,
}: Props) {
  const [reports, setReports] = useState<Reports>({
    sso: null,
    bank: null,
    loan: null,
  });
  const [publication, setPublication] =
    useState<PayrollPayslipPublicationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [bankFormat, setBankFormat] = useState<BankTransferFormat>("KTB_IPAY");
  /* ครึ่งหน้า A5 ไว้พิมพ์ 2 ใบต่อแผ่นแล้วตัดแบ่ง ประหยัดกระดาษตอนแจกทั้งบริษัท */
  const [paperLayout, setPaperLayout] = useState<PayslipPaperLayout>("FULL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sso, bank, loan, publicationStatus] = await Promise.all([
        getSocialSecurityFilingReport(runId),
        getBankTransferFilingReport(runId),
        getStudentLoanFilingReport(runId),
        getPayrollRunPayslipPublicationStatus(runId),
      ]);
      setReports({ sso, bank, loan });
      setPublication(publicationStatus);
      onPublicationChange?.(publicationStatus);
    } catch (error) {
      toast.error(errorText(error, "โหลดข้อมูลเอกสารไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [runId, onPublicationChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  /** ครอบการดาวน์โหลดทุกแบบ ให้จัดการสถานะปุ่มและ error ที่เดียว */
  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast.error(errorText(error, "ดาวน์โหลดไฟล์ไม่สำเร็จ"));
    } finally {
      setBusy(null);
    }
  }

  async function downloadRunBlob(
    key: string,
    fetcher: () => Promise<Blob>,
    fileName: string,
  ) {
    await run(key, async () => {
      const blob = await fetcher();
      downloadBlob(blob, fileName);
    });
  }

  const isVisibleInEss = Boolean(
    publication?.isPublished && publication?.payslipDetailsVisible,
  );

  async function toggleEss() {
    setBusy("ess");
    try {
      if (isVisibleInEss) {
        await hidePayrollRunPayslipDetails(runId);
        const next = await unpublishPayrollRunPayslips(runId);
        setPublication(next);
        onPublicationChange?.(next);
        toast.success("ปิดการแสดงสลิปใน ESS แล้ว");
      } else {
        await publishPayrollRunPayslips(runId);
        const next = await showPayrollRunPayslipDetails(runId);
        setPublication(next);
        onPublicationChange?.(next);
        toast.success("เปิดให้พนักงานดูสลิปใน ESS แล้ว");
      }
    } catch (error) {
      toast.error(errorText(error, "เปลี่ยนการแสดงสลิปไม่สำเร็จ"));
    } finally {
      setBusy(null);
    }
  }

  const canIssue = runStatus === "APPROVED" || runStatus === "PAID";

  return (
    <div>
      {!canIssue ? (
        <p className="border-b border-slate-200 bg-amber-50/70 px-5 3xl:px-6 4xl:px-7 py-2.5 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-amber-800 sm:px-6">
          งวดนี้ยังไม่อนุมัติ — ดาวน์โหลดไว้ตรวจทานได้
          แต่อย่าเพิ่งนำส่งหน่วยงานจนกว่าจะอนุมัติเสร็จ
        </p>
      ) : null}

      <DocRow
        title="สลิปเงินเดือน"
        meta="เอกสารที่พนักงานได้รับ"
        status={
          <StatusPill tone={isVisibleInEss ? "positive" : "neutral"}>
            {isVisibleInEss ? "พนักงานเห็นสลิปแล้ว" : "ยังไม่เปิดให้พนักงานเห็น"}
          </StatusPill>
        }
        actions={
          <>
            <span className="block w-36 shrink-0">
              <Select
                value={paperLayout}
                onChange={(event) =>
                  setPaperLayout(event.target.value as PayslipPaperLayout)
                }
                disabled={busy !== null}
                aria-label="รูปแบบกระดาษของสลิป"
              >
                <option value="FULL">สลิปเต็มหน้า A4</option>
                <option value="HALF">สลิปครึ่งหน้า A5</option>
              </Select>
            </span>
            <Button
              variant="primary"
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "payslip-zip"}
              onClick={() =>
                void downloadRunBlob(
                  "payslip-zip",
                  () => downloadPayrollRunPayslipsZip(runId, paperLayout),
                  `payslips-${runNo}${paperLayout === "HALF" ? "-a5" : ""}.zip`,
                )
              }
            >
              สลิปทุกคน (ZIP)
            </Button>
            <Button
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "run-pdf"}
              onClick={() =>
                void downloadRunBlob(
                  "run-pdf",
                  () => downloadPayrollRunPdf(runId),
                  `payroll-${runNo}.pdf`,
                )
              }
            >
              PDF ทั้งงวด
            </Button>
            <Button
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "run-excel"}
              onClick={() =>
                void downloadRunBlob(
                  "run-excel",
                  () => downloadPayrollRunExcel(runId),
                  `payroll-${runNo}.xlsx`,
                )
              }
            >
              Excel ทั้งงวด
            </Button>
            <Button
              variant={isVisibleInEss ? "danger" : "primary"}
              icon={
                isVisibleInEss ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )
              }
              loading={busy === "ess"}
              onClick={() => void toggleEss()}
            >
              {isVisibleInEss ? "ปิดไม่ให้พนักงานเห็น" : "เผยแพร่สลิป"}
            </Button>
          </>
        }
      />

      <DocRow
        title="โอนเงินเข้าธนาคาร"
        meta={
          reports.bank
            ? `${reports.bank.summary.employeeCount} คน · ยอดโอนรวม ${money(reports.bank.summary.totalNetPay)} บาท`
            : "ยอดเงินสุทธิหลังหักทุกรายการแล้ว"
        }
        note="ไฟล์สร้างจากยอดที่คำนวณไว้แล้ว ตรงกับสลิปที่พนักงานได้รับ"
        warning={
          (reports.bank?.summary.incompleteCount ?? 0) > 0
            ? `มี ${reports.bank?.summary.incompleteCount} คนที่ยังไม่มีเลขบัญชี — รายการเหล่านี้จะถูกข้ามในไฟล์ ไปเติมที่หน้า พนักงาน > เงินเดือน`
            : null
        }
        actions={
          <>
            <Select
              value={bankFormat}
              onChange={(event) =>
                setBankFormat(event.target.value as BankTransferFormat)
              }
              className="w-44"
              aria-label="รูปแบบไฟล์ธนาคาร"
            >
              {Object.entries(BANK_FORMAT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Button
              variant="primary"
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "bank"}
              disabled={loading || !reports.bank?.rows.length}
              onClick={() =>
                void run("bank", () =>
                  downloadBankTransferFile(
                    runId,
                    bankFormat,
                    bankFormat === "KTB_IPAY"
                      ? `ktb-ipay-${runNo}.txt`
                      : `bank-transfer-${runNo}.csv`,
                  ),
                )
              }
            >
              ดาวน์โหลดไฟล์โอน
            </Button>
          </>
        }
      />

      <DocRow
        title="ประกันสังคม (สปส.1-10)"
        meta={
          reports.sso
            ? `${reports.sso.summary.employeeCount} คน · นำส่งรวม ${money(reports.sso.summary.totalContribution)} บาท`
            : "ยื่นภายในวันที่ 15 ของเดือนถัดไป"
        }
        note="ไฟล์ e-Service สร้างตามโครงสร้างทั่วไปของ สปส. ควรทดลองอัปโหลดเดือนแรกแล้วดูผลตรวจก่อนใช้ประจำ"
        warning={
          (reports.sso?.summary.incompleteCount ?? 0) > 0
            ? `มี ${reports.sso?.summary.incompleteCount} คนที่ข้อมูลไม่ครบ — เติมเลขบัตรประชาชนและเลขผู้ประกันตนที่ประวัติพนักงาน`
            : null
        }
        actions={
          <>
            <Button
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "sso-csv"}
              disabled={loading || !reports.sso?.rows.length}
              onClick={() =>
                void run("sso-csv", () =>
                  downloadFilingReportCsv(
                    runId,
                    "social-security",
                    `sso-1-10-${runNo}.csv`,
                  ),
                )
              }
            >
              CSV ตรวจทาน
            </Button>
            <Button
              variant="primary"
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "sso-file"}
              disabled={loading || !reports.sso?.rows.length}
              onClick={() =>
                void run("sso-file", () =>
                  downloadSsoEFilingFile(runId, `sso-1-10-${runNo}.txt`),
                )
              }
            >
              ไฟล์ e-Service
            </Button>
          </>
        }
      />

      <DocRow
        title="ภาษีหัก ณ ที่จ่าย"
        meta="ภ.ง.ด.1 ยื่นรายเดือน · ภ.ง.ด.1ก ยื่นสรุปทั้งปี"
        note={
          taxYearId
            ? "ยอดภาษีมาจากรอบที่คำนวณแล้วในปีภาษีเดียวกัน ไม่ได้คำนวณใหม่ตอนออกไฟล์"
            : null
        }
        warning={
          taxYearId
            ? null
            : "บริษัทนี้ยังไม่มีปีภาษี — ไปสร้างที่หน้า ตั้งค่า > ภาษี ก่อนถึงจะออก ภ.ง.ด. ได้"
        }
        actions={
          <>
            <Button
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "pnd1"}
              disabled={!taxYearId}
              onClick={() =>
                void downloadRunBlob(
                  "pnd1",
                  () =>
                    downloadPayrollTaxPnd1ReportCsv({
                      companyId,
                      taxYearId,
                      month: paymentMonth,
                      year: paymentYear,
                      pageSize: 1000,
                    }),
                  `pnd1-${paymentYear}-${String(paymentMonth).padStart(2, "0")}.csv`,
                )
              }
            >
              ภ.ง.ด.1 (เดือนนี้)
            </Button>
            <Button
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "pnd1a"}
              disabled={!taxYearId}
              onClick={() =>
                void downloadRunBlob(
                  "pnd1a",
                  () =>
                    downloadPayrollTaxPnd1AReportCsv({
                      companyId,
                      taxYearId,
                      pageSize: 1000,
                    }),
                  `pnd1a-${paymentYear}.csv`,
                )
              }
            >
              ภ.ง.ด.1ก (ทั้งปี)
            </Button>
          </>
        }
      />

      {reports.loan && reports.loan.rows.length > 0 ? (
        <DocRow
          title="นำส่ง กยศ. / กรอ."
          meta={`${reports.loan.summary.employeeCount} คน · นำส่งรวม ${money(reports.loan.summary.totalAmount)} บาท`}
          note={
            reports.loan.summary.partialCount > 0
              ? null
              : "หักครบทุกคนในงวดนี้"
          }
          warning={
            reports.loan.summary.partialCount > 0
              ? `มี ${reports.loan.summary.partialCount} คนที่หักไม่เต็มงวด เพราะเงินสุทธิเหลือไม่พอ`
              : null
          }
          actions={
            <Button
              icon={<Download className="h-3.5 w-3.5" />}
              loading={busy === "loan"}
              onClick={() =>
                void run("loan", () =>
                  downloadFilingReportCsv(
                    runId,
                    "student-loan",
                    `student-loan-${runNo}.csv`,
                  ),
                )
              }
            >
              ดาวน์โหลด CSV
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

/** ป้ายสถานะเล็ก ๆ โทนเดียวกับที่ใช้บนแถบหัวของหน้า */
function StatusPill({
  tone,
  children,
}: {
  tone: "positive" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      className={joinClassName(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold",
        tone === "positive"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500",
      )}
    >
      {children}
    </span>
  );
}

/**
 * หนึ่งเอกสารหนึ่งแถว — ชื่อกับรายละเอียดอยู่ซ้าย ปุ่มอยู่ขวา คั่นด้วยเส้นบาง
 * ใช้โครงเดียวกับแถบอื่นในหน้านี้ จะได้ไม่มีการ์ดลอยซ้อนขึ้นมาอีกชั้น
 */
function DocRow({
  title,
  meta,
  note,
  warning,
  status,
  actions,
}: {
  title: string;
  meta?: string;
  note?: string | null;
  warning?: string | null;
  status?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 last:border-b-0">
      <div className="flex flex-col gap-3 px-5 3xl:px-6 4xl:px-7 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] font-bold text-slate-800">{title}</h3>
            {status}
          </div>
          {meta ? (
            <p className="mt-0.5 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-500">{meta}</p>
          ) : null}
          {warning ? (
            <p className="mt-2 max-w-2xl text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] leading-5 text-amber-700">
              {warning}
            </p>
          ) : null}
          {note ? (
            <p className="mt-2 max-w-2xl text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] leading-5 text-slate-400">
              {note}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
          {actions}
        </div>
      </div>
    </section>
  );
}
