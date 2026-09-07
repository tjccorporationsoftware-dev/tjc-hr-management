"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  ButtonLink,
  Field,
  Notice,
  PageChip,
  PageHeading,
  PageSurface,
  Select,
  StatTile,
} from "@/components/kit";
import { LoadingState } from "@/components/common/feedback-state";
import { formatThaiDate } from "@/lib/date-format";

import {
  getOrganizationCompanies,
  getPayrollRuns,
  getPayrollTaxYears,
} from "@/lib/api";
import type { PayrollRun, PayrollTaxYear } from "@/types/payroll";

import {
  saveBlobAsFile,
  type CatalogContext,
  type CatalogDocument,
} from "./document-catalog";
import { IssueDateDialog } from "./issue-date-dialog";
import { getErrorMessage } from "./report-utils";

/**
 * เอกสารรายฉบับ — รอบเงินเดือน · นำส่งราชการและธนาคาร · ภาษีเงินได้
 * -----------------------------------------------------------------------------
 * เอกสารกลุ่มนี้ต่างจากรายงาน HR ตรงที่ไม่ได้กรองด้วยช่วงวันที่ แต่ผูกกับ
 * **งวดจริงในระบบ** — ไฟล์นำส่งทุกตัวออกจาก "รอบเงินเดือน" หนึ่งรอบ
 * ส่วนแบบยื่นภาษีออกตาม "ปีภาษี" ที่บริษัทตั้งไว้
 *
 * ตัวเลือกจึงเป็น เดือน/ปี ไม่ใช่ช่วงวันที่ แล้วระบบไปหางวดที่ตรงให้เอง —
 * คนทำเงินเดือนคิดเป็น "งวดกรกฎาคม" ไม่ได้คิดเป็น "1–31 ก.ค."
 * ถ้าเดือนนั้นมีหลายรอบ (เช่นรอบพิเศษ) จะมีตัวเลือกให้เจาะจงอีกชั้น
 *
 * ตัวอย่างกับไฟล์ที่โหลดยิงเส้นเดียวกัน จึงไม่มีทางได้คนละชุดกัน
 */

const MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/** อ่านมาแค่นี้พอ — ไฟล์จริงเป็นพันแถว ตัวอย่างมีไว้ดูว่าหน้าตาถูกไหม */
const PREVIEW_ROWS = 40;

const RUN_STATUS_TEXT: Record<string, string> = {
  DRAFT: "ร่าง",
  CALCULATING: "กำลังคำนวณ",
  CALCULATED: "คำนวณแล้ว",
  REVIEWED: "ตรวจแล้ว",
  APPROVED: "อนุมัติแล้ว",
  PAID: "จ่ายแล้ว",
  CANCELLED: "ยกเลิก",
  FAILED: "คำนวณไม่สำเร็จ",
};

/** แยกบรรทัด CSV โดยเคารพเครื่องหมายคำพูด (ชื่อคนไทยมีจุลภาคได้) */
function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(text: string) {
  const lines = text
    // BOM ที่ Excel ต้องการ ถ้าไม่ตัดจะติดไปกับหัวคอลัมน์แรก
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  return {
    header: lines[0] ? splitCsvLine(lines[0]) : [],
    rows: lines.slice(1, PREVIEW_ROWS + 1).map(splitCsvLine),
    totalRows: Math.max(lines.length - 1, 0),
  };
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "csv";
      header: string[];
      rows: string[][];
      totalRows: number;
      size: number;
    }
  | { status: "text"; lines: string[]; totalLines: number; size: number }
  | { status: "pdf"; url: string; size: number }
  | { status: "binary"; size: number };

function sizeText(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    return `${(size / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} KB`;
  }
  return `${(size / 1024 / 1024).toLocaleString("th-TH", { maximumFractionDigits: 2 })} MB`;
}

/**
 * อ่านเนื้อไฟล์เป็นข้อความ โดยเดาชุดอักขระจากตัวไบต์เอง
 *
 * blob.text() ถอดรหัสเป็น UTF-8 เสมอ แต่ไฟล์นำส่งราชการแบบความกว้างคงที่
 * (เช่น สปส.1-10) ต้องเป็น TIS-620 เพื่อให้ 1 อักขระ = 1 ไบต์ ถ้าถอดผิดชุด
 * ชื่อไทยจะกลายเป็นขยะทั้งหน้า
 *
 * ไม่ดู charset จาก Content-Type เพราะเชื่อถือไม่ได้ (พร็อกซีตัดทิ้งได้ และ
 * blob.type ก็ไม่ได้เก็บมาทุกเบราว์เซอร์) ใช้วิธีถอดแบบเข้มงวดเป็น UTF-8 ก่อน
 * ไบต์ TIS-620 จะไม่ผ่านกฎ UTF-8 จึงโยน error ให้ตกไปใช้ windows-874 เอง
 */
async function readBlobText(blob: Blob) {
  const buffer = await blob.arrayBuffer();

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // TIS-620 เป็นชุดย่อยของ windows-874 ซึ่งเป็นชื่อที่ TextDecoder รู้จัก
    return new TextDecoder("windows-874").decode(buffer);
  }
}

export function DocumentView({ document: doc }: { document: CatalogDocument }) {
  const now = new Date();

  const [companies, setCompanies] = useState<
    Array<{ id: string; nameTh?: string; name?: string; code?: string }>
  >([]);
  const [companyId, setCompanyId] = useState("");

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runId, setRunId] = useState("");
  const [taxYears, setTaxYears] = useState<PayrollTaxYear[]>([]);

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [downloading, setDownloading] = useState(false);

  const needsRun = doc.need === "payrollRun";
  const needsMonth = doc.need === "taxMonth";

  /* ---------------- ตัวเลือกที่หน้านี้ใช้ ---------------- */

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      const [companyData, runData, taxYearData] = await Promise.all([
        getOrganizationCompanies().catch(() => []),
        getPayrollRuns({ page: 1, pageSize: 200 }).catch(() => null),
        getPayrollTaxYears({ page: 1, pageSize: 50 }).catch(() => null),
      ]);

      if (cancelled) return;

      setCompanies(
        Array.isArray(companyData)
          ? companyData
          : ((companyData as { items?: typeof companies })?.items ?? []),
      );
      setRuns(runData?.data ?? []);
      setTaxYears(taxYearData?.data ?? []);
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const scopedRuns = useMemo(
    () => runs.filter((run) => !companyId || run.companyId === companyId),
    [companyId, runs],
  );

  /**
   * ปีที่เลือกได้ — เอาจากงวดจริงที่มีในระบบ ไม่ใช่ไล่ปีปฏิทินย้อนหลังลอย ๆ
   * เอกสารภาษีใช้ปีภาษีที่บริษัทตั้งไว้ ส่วนไฟล์นำส่งใช้ปีของงวดเงินเดือน
   */
  const yearOptions = useMemo(() => {
    const values = needsRun
      ? scopedRuns.map((run) => run.period?.year)
      : taxYears
          .filter((item) => !companyId || item.companyId === companyId)
          .map((item) => item.taxYear);

    const unique = [...new Set(values.filter(Boolean) as number[])].sort(
      (a, b) => b - a,
    );

    // ยังไม่มีข้อมูลในระบบเลย อย่างน้อยให้เลือกปีปัจจุบันได้
    return unique.length > 0 ? unique : [now.getFullYear()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, needsRun, scopedRuns, taxYears]);

  /** เดือนที่มีงวดจริงในปีที่เลือก — เดือนที่ไม่มีงวดจะกดไปก็ไม่มีไฟล์ */
  const monthsWithRun = useMemo(() => {
    if (!needsRun) return null;

    return new Set(
      scopedRuns
        .filter((run) => String(run.period?.year) === year)
        .map((run) => run.period?.month)
        .filter(Boolean) as number[],
    );
  }, [needsRun, scopedRuns, year]);

  /** รอบเงินเดือนของเดือน/ปีที่เลือก — ปกติมีรอบเดียว แต่รองรับรอบพิเศษด้วย */
  const runsInMonth = useMemo(() => {
    if (!needsRun) return [];

    return scopedRuns.filter(
      (run) =>
        String(run.period?.year) === year &&
        String(run.period?.month) === month,
    );
  }, [month, needsRun, scopedRuns, year]);

  // เปลี่ยนเดือน/ปีแล้วเลือกรอบแรกของเดือนนั้นให้อัตโนมัติ
  useEffect(() => {
    if (!needsRun) return;

    if (!runsInMonth.some((run) => run.id === runId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ผูกรอบให้ตรงกับเดือน/ปีที่เลือก
      setRunId(runsInMonth[0]?.id ?? "");
    }
  }, [needsRun, runId, runsInMonth]);

  const selectedRun = runsInMonth.find((run) => run.id === runId) ?? null;

  /*
   * วันที่ออกเอกสารของแบบยื่นราชการ — ถามก่อนดาวน์โหลดทุกครั้ง ไม่จำค่าไว้
   * เพราะเป็นวันที่ผู้มีอำนาจลงนาม ไม่ใช่ค่าตั้งของหน้าจอ
   */
  const [issueDate, setIssueDate] = useState("");
  const [askingIssueDate, setAskingIssueDate] = useState(false);

  const context: CatalogContext = {
    runId,
    runNo: selectedRun?.runNo ?? "",
    companyId,
    year,
    month,
    dateFrom: "",
    dateTo: "",
    departmentId: "",
    employeeId: "",
    issueDate,
  };

  const missing =
    needsRun && !selectedRun ? "ยังไม่มีรอบเงินเดือนของเดือนนี้" : null;

  /* ---------------- ตัวอย่างและดาวน์โหลด ---------------- */

  const loadPreview = useCallback(async () => {
    if (missing || !doc.fetchFile) {
      setPreview({ status: "idle" });
      return;
    }

    setPreview({ status: "loading" });

    try {
      const blob = await doc.fetchFile(context);

      if (doc.preview === "pdf") {
        setPreview({
          status: "pdf",
          url: window.URL.createObjectURL(blob),
          size: blob.size,
        });
        return;
      }

      if (doc.preview === "none") {
        // ไฟล์ไบนารี (xlsx) อ่านเนื้อในเบราว์เซอร์ไม่ได้ บอกได้แค่ว่าไฟล์พร้อมแล้ว
        setPreview({ status: "binary", size: blob.size });
        return;
      }

      const text = await readBlobText(blob);

      if (doc.preview === "table") {
        setPreview({ status: "csv", ...parseCsv(text), size: blob.size });
        return;
      }

      const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
      setPreview({
        status: "text",
        lines: lines.slice(0, PREVIEW_ROWS),
        totalLines: lines.length,
        size: blob.size,
      });
    } catch (error) {
      setPreview({
        status: "error",
        message: getErrorMessage(error, "ดึงตัวอย่างไม่สำเร็จ"),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, doc, missing, month, runId, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ดึงตัวอย่างใหม่เมื่อเปลี่ยนงวด/ปี/เดือน
    void loadPreview();
  }, [loadPreview]);

  // ปล่อย object URL ของ PDF เมื่อเปลี่ยนไฟล์ ไม่งั้นหน่วยความจำค้าง
  useEffect(() => {
    const url = preview.status === "pdf" ? preview.url : "";

    return () => {
      if (url) window.URL.revokeObjectURL(url);
    };
  }, [preview]);

  /**
   * แบบยื่นราชการมีช่อง "ยื่นวันที่" ที่ระบบเดาแทนผู้ใช้ไม่ได้ จึงถามก่อนทุกครั้ง
   * ที่เหลือดาวน์โหลดได้เลย
   */
  function handleDownload() {
    if (!doc.fetchFile || missing) return;

    if (doc.needsIssueDate) {
      setAskingIssueDate(true);
      return;
    }

    void runDownload(context);
  }

  async function runDownload(downloadContext: CatalogContext) {
    if (!doc.fetchFile) return;

    setDownloading(true);

    try {
      const blob = await doc.fetchFile(downloadContext);
      const fileName = doc.fileName?.(downloadContext) ?? `${doc.slug}.dat`;

      await saveBlobAsFile(blob, fileName);
      toast.success(`ดาวน์โหลด ${fileName} แล้ว`);
    } catch (error) {
      toast.error(getErrorMessage(error, "ดาวน์โหลดไม่สำเร็จ"));
    } finally {
      setDownloading(false);
    }
  }

  const rowCount =
    preview.status === "csv"
      ? preview.totalRows
      : preview.status === "text"
        ? preview.totalLines
        : 0;

  return (
    <PageSurface>
      <PageHeading
        title={doc.name}
        description={doc.description}
        chips={
          <>
            <PageChip>{doc.format}</PageChip>
            <PageChip>
              {needsRun
                ? "ออกตามรอบเงินเดือน"
                : needsMonth
                  ? "ออกตามปีภาษีและเดือน"
                  : "ออกตามปีภาษี"}
            </PageChip>
          </>
        }
        actions={
          <div className="grid grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <StatTile
              label={needsRun ? "รอบที่ใช้" : "ปีภาษี"}
              value={
                needsRun
                  ? (selectedRun?.runNo ?? "—")
                  : String(Number(year) + 543)
              }
              helper={
                needsRun
                  ? (selectedRun?.period?.name ?? "ยังไม่มีรอบของเดือนนี้")
                  : needsMonth
                    ? MONTH_NAMES[Number(month) - 1]
                    : "ทั้งปี"
              }
            />
            <StatTile
              label="ขนาดไฟล์"
              value={
                preview.status === "csv" ||
                preview.status === "text" ||
                preview.status === "pdf" ||
                preview.status === "binary"
                  ? sizeText(preview.size)
                  : "—"
              }
              helper={
                rowCount > 0
                  ? `${rowCount.toLocaleString("th-TH")} แถว`
                  : "ยังไม่ได้ดึงไฟล์"
              }
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
        <ButtonLink
          href="/reports"
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
        >
          คลังเอกสาร
        </ButtonLink>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void loadPreview()}
            disabled={preview.status === "loading" || Boolean(missing)}
            icon={
              <RefreshCw
                className={
                  preview.status === "loading"
                    ? "h-3.5 w-3.5 animate-spin"
                    : "h-3.5 w-3.5"
                }
              />
            }
          >
            รีเฟรช
          </Button>

          <Button
            variant="primary"
            loading={downloading}
            disabled={Boolean(missing)}
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => void handleDownload()}
          >
            ดาวน์โหลด {doc.format}
          </Button>
        </div>
      </div>

      {/* ตัวเลือกงวด — เดือน/ปี ไม่ใช่ช่วงวันที่ */}
      <div className="grid gap-3 border-b border-slate-200 px-5 py-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-4 3xl:px-7">
        <Field label="บริษัท">
          <Select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            <option value="">ทุกบริษัทในขอบเขตของคุณ</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nameTh ?? company.name ?? company.code}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={needsRun ? "ปี" : "ปีภาษี"}
          hint={
            needsRun
              ? "ปีที่มีงวดเงินเดือนในระบบ"
              : "ปีภาษีที่ตั้งไว้ในหน้าตั้งค่าเงินเดือน"
          }
        >
          <Select
            value={year}
            onChange={(event) => setYear(event.target.value)}
          >
            {yearOptions.map((option) => (
              <option key={option} value={String(option)}>
                {option + 543}
              </option>
            ))}
          </Select>
        </Field>

        {needsRun || needsMonth ? (
          <Field
            label="เดือน"
            hint={
              needsRun && monthsWithRun && monthsWithRun.size > 0
                ? `มีงวด ${monthsWithRun.size} เดือนในปีนี้`
                : undefined
            }
          >
            <Select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name}
                  {/* บอกตั้งแต่ในรายการว่าเดือนไหนยังไม่มีงวด จะได้ไม่ต้องลองกด */}
                  {monthsWithRun && !monthsWithRun.has(index + 1)
                    ? " (ยังไม่มีงวด)"
                    : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {needsRun && runsInMonth.length > 1 ? (
          <Field label="รอบในเดือนนี้" hint="เดือนนี้มีมากกว่าหนึ่งรอบ">
            <Select
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
            >
              {runsInMonth.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.runNo} · {run.period?.name ?? ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {selectedRun ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-200 bg-slate-50/60 px-5 py-2.5 sm:px-6 3xl:px-7">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            งวดที่ใช้ออกไฟล์
          </span>
          <span className="text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
            {selectedRun.runNo} · {selectedRun.period?.name}
          </span>
          <Badge tone={selectedRun.status === "PAID" ? "positive" : "neutral"}>
            {RUN_STATUS_TEXT[selectedRun.status] ?? selectedRun.status}
          </Badge>
          <span className="text-[12px] text-slate-500 3xl:text-[13px]">
            {formatThaiDate(selectedRun.period?.startDate)} –{" "}
            {formatThaiDate(selectedRun.period?.endDate)} · พนักงาน{" "}
            {selectedRun.totalEmployees.toLocaleString("th-TH")} คน
          </span>
        </div>
      ) : null}

      {missing ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="warning">
            {missing} — เลือกเดือนอื่น หรือไปสร้างรอบเงินเดือนที่หน้ารอบจ่ายก่อน
          </Notice>
        </div>
      ) : null}

      {preview.status === "error" ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="critical">{preview.message}</Notice>
        </div>
      ) : null}

      {preview.status === "loading" ? (
        <LoadingState title="กำลังดึงไฟล์มาแสดง" />
      ) : null}

      {preview.status === "binary" ? (
        <div className="px-5 py-16 text-center sm:px-6">
          <p className="text-[14px] font-semibold text-slate-700">
            ไฟล์พร้อมดาวน์โหลดแล้ว ({sizeText(preview.size)})
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            ไฟล์ {doc.format} เปิดดูในหน้าเว็บไม่ได้ — กดดาวน์โหลดแล้วเปิดด้วย
            Excel
          </p>
        </div>
      ) : null}

      {preview.status === "csv" ? (
        preview.header.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px] 3xl:text-[13px]">
                <thead>
                  <tr>
                    {preview.header.map((cell, index) => (
                      <th
                        key={`${cell}-${index}`}
                        scope="col"
                        className="whitespace-nowrap border-b border-slate-300 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* หัวคอลัมน์มาแล้วแต่ไม่มีแถว = งวดนี้ยังไม่มีรายการในไฟล์ */}
                  {preview.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={preview.header.length}
                        className="px-3 py-10 text-center text-[13px] text-slate-400"
                      >
                        งวดนี้ยังไม่มีรายการในไฟล์ — ไฟล์จะมีแต่หัวคอลัมน์
                      </td>
                    </tr>
                  ) : null}

                  {preview.rows.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      {preview.header.map((_, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="whitespace-nowrap px-3 py-1.5 text-slate-700 tabular-nums"
                        >
                          {row[cellIndex] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="border-t border-slate-200 px-5 py-3 text-[12px] text-slate-500 sm:px-6 3xl:px-7 3xl:text-[13px]">
              แสดง {preview.rows.length.toLocaleString("th-TH")} จาก{" "}
              {preview.totalRows.toLocaleString("th-TH")} แถว —
              ไฟล์ที่ดาวน์โหลดมีครบทุกแถว
            </p>
          </>
        ) : (
          <p className="px-5 py-16 text-center text-[13px] text-slate-400 sm:px-6">
            งวดนี้ยังไม่มีข้อมูลในไฟล์
          </p>
        )
      ) : null}

      {preview.status === "text" ? (
        <>
          <pre className="mx-5 my-4 max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12px] leading-5 text-slate-700 sm:mx-6 3xl:mx-7">
            {preview.lines.join("\n") || "งวดนี้ยังไม่มีข้อมูลในไฟล์"}
          </pre>

          <p className="border-t border-slate-200 px-5 py-3 text-[12px] text-slate-500 sm:px-6 3xl:px-7 3xl:text-[13px]">
            แสดง {preview.lines.length.toLocaleString("th-TH")} จาก{" "}
            {preview.totalLines.toLocaleString("th-TH")} บรรทัด —
            ไฟล์ที่ดาวน์โหลดมีครบทุกบรรทัด
          </p>
        </>
      ) : null}

      {preview.status === "pdf" ? (
        <iframe
          src={preview.url}
          title={doc.name}
          className="mx-5 my-4 h-[65vh] w-[calc(100%-2.5rem)] rounded-xl border border-slate-200 sm:mx-6 sm:w-[calc(100%-3rem)]"
        />
      ) : null}

      {askingIssueDate ? (
        <IssueDateDialog
          documentName={doc.name}
          onCancel={() => setAskingIssueDate(false)}
          onConfirm={(picked) => {
            setAskingIssueDate(false);
            setIssueDate(picked ?? "");
            /* ส่ง context ที่มีวันที่ใหม่ไปเลย ไม่รอ state รอบถัดไป */
            void runDownload({ ...context, issueDate: picked ?? "" });
          }}
        />
      ) : null}
    </PageSurface>
  );
}
