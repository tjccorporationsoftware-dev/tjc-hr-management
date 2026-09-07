"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  ButtonLink,
  Field,
  Notice,
  PageChip,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
} from "@/components/kit";
import { LoadingState } from "@/components/common/feedback-state";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate } from "@/lib/date-format";

import {
  apiFetch,
  createReportJob,
  downloadReportExportFile,
  getDocumentEmployees,
  getOrganizationCompanies,
  processReportJob,
} from "@/lib/api";
import type {
  ExportFileFormat,
  ReportDataQueryParams,
  ReportDataResponse,
} from "@/types/reports";

import type { ReportDefinition } from "./report-definitions";
import { ReportTable } from "./report-table";
import { getErrorMessage } from "./report-utils";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

/**
 * รายงาน HR รายตัว
 * -----------------------------------------------------------------------------
 * เดิมรายงานกลุ่มนี้กดจากรายการแล้วระบบสร้างไฟล์ให้เลย โดยที่คนกดยังไม่เห็นว่า
 * ข้างในมีอะไร และไฟล์ที่ได้ไปโผล่อีกแท็บหนึ่ง — ต้องเดินไปหาเอง
 *
 * ที่นี่ทำเป็น เลือกตัวกรอง → เห็นข้อมูลจริง → พอใจแล้วค่อยโหลด
 * ไฟล์ที่โหลดใช้ตัวกรองชุดเดียวกับที่เห็นบนจอ จึงไม่มีทางได้ไฟล์คนละชุดกับตัวอย่าง
 *
 * การโหลดยังผ่านคิวสร้างไฟล์ของ backend เหมือนเดิม (สร้างใบงาน → ประมวลผล)
 * แต่พอเสร็จแล้วดึงไฟล์ลงเครื่องให้ทันที ไม่ต้องมีหน้ารวมไฟล์ที่สร้างไว้อีก
 */

const PAGE_SIZE = 50;

const FORMATS: ExportFileFormat[] = ["XLSX", "CSV", "PDF", "JSON"];

/** โหมดช่วงเวลาของรายงาน */
type PeriodMode = "month" | "year" | "custom";

const PERIOD_MODES: Array<{ key: PeriodMode; label: string; hint: string }> = [
  { key: "month", label: "รายเดือน", hint: "ทั้งเดือนที่เลือก" },
  { key: "year", label: "รายปี", hint: "ทั้งปีที่เลือก" },
  { key: "custom", label: "กำหนดเอง", hint: "ระบุวันเริ่ม–วันจบเอง" },
];

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

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

function count(value: number) {
  return value.toLocaleString("th-TH");
}

export function ReportView({ definition }: { definition: ReportDefinition }) {
  const [companies, setCompanies] = useState<
    Array<{ id: string; nameTh?: string; name?: string; code?: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; nameTh?: string; name?: string }>
  >([]);
  const [employees, setEmployees] = useState<
    Array<{
      id: string;
      employeeCode: string;
      displayName?: string | null;
      firstName: string;
      lastName: string;
      companyId?: string | null;
      departmentId?: string | null;
    }>
  >([]);
  const [employeeTotal, setEmployeeTotal] = useState(0);

  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  /*
   * โหมดช่วงเวลา — คนใช้จริงคิดเป็น "เดือนนี้" หรือ "ทั้งปี" ไม่ได้คิดเป็นช่วงวันที่
   * (เช่น ดูลา/ขาดสะสมของเดือนกรกฎาคม หรือดูการลงเวลาทั้งปีของคนหนึ่ง)
   * เลือกโหมดแล้วระบบคำนวณวันเริ่ม–วันจบให้ ส่วน "กำหนดเอง" ไว้ตอนอยากคร่อมเดือน
   */
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [customFrom, setCustomFrom] = useState(() => daysAgo(29));
  const [customTo, setCustomTo] = useState(() => isoDate(new Date()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<ExportFileFormat | null>(null);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => current - index);
  }, []);

  /** วันเริ่ม–วันจบจริงที่ส่งให้ API ตามโหมดที่เลือก */
  const { dateFrom, dateTo } = useMemo(() => {
    if (periodMode === "custom") {
      return { dateFrom: customFrom, dateTo: customTo };
    }

    const yearNumber = Number(year) || new Date().getFullYear();

    if (periodMode === "year") {
      return {
        dateFrom: `${yearNumber}-01-01`,
        dateTo: `${yearNumber}-12-31`,
      };
    }

    const monthNumber = Number(month) || 1;
    // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้ ไม่ต้องจำว่าเดือนไหนมีกี่วัน
    const lastDay = new Date(yearNumber, monthNumber, 0).getDate();

    return {
      dateFrom: `${yearNumber}-${String(monthNumber).padStart(2, "0")}-01`,
      dateTo: `${yearNumber}-${String(monthNumber).padStart(2, "0")}-${lastDay}`,
    };
  }, [customFrom, customTo, month, periodMode, year]);

  /** บอกใต้ปุ่มว่าโหมดที่เลือกครอบวันไหนถึงวันไหนจริง ๆ */
  const periodHint = useMemo(() => {
    if (definition.periodBasis === "year") return undefined;

    return `${formatThaiDate(dateFrom)} – ${formatThaiDate(dateTo)}`;
  }, [dateFrom, dateTo, definition.periodBasis]);

  /** ตัวกรองชุดเดียว ใช้ทั้งตอนดูตัวอย่างและตอนสั่งสร้างไฟล์ */
  const filters: ReportDataQueryParams = useMemo(
    () => ({
      companyId: companyId || undefined,
      departmentId: departmentId || undefined,
      employeeId: employeeId || undefined,
      q: keyword.trim() || undefined,
      ...(definition.periodBasis === "year"
        ? { year: Number(year) || undefined }
        : {
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          }),
    }),
    [
      companyId,
      dateFrom,
      dateTo,
      definition.periodBasis,
      departmentId,
      employeeId,
      keyword,
      year,
    ],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setData(await definition.load({ ...filters, page, pageSize: PAGE_SIZE }));
    } catch (caught) {
      setError(getErrorMessage(caught, "โหลดข้อมูลรายงานไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [definition, filters, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดใหม่เมื่อตัวกรองหรือหน้าที่ดูเปลี่ยน
    void load();
  }, [load]);

  // เปลี่ยนตัวกรองแล้วต้องกลับไปหน้าแรกเสมอ ไม่งั้นอาจค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตหน้าเมื่อเงื่อนไขเปลี่ยน
    setPage(1);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      const [companyData, departmentData] = await Promise.all([
        getOrganizationCompanies().catch(() => []),
        apiFetch<{ items?: Array<{ id: string; nameTh?: string }> }>(
          "/organization/departments?page=1&pageSize=200",
        ).catch(() => ({ items: [] })),
      ]);

      if (cancelled) return;

      setCompanies(
        Array.isArray(companyData)
          ? companyData
          : ((companyData as { items?: typeof companies })?.items ?? []),
      );
      setDepartments(
        Array.isArray(departmentData)
          ? departmentData
          : (departmentData?.items ?? []),
      );
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  /* รายชื่อพนักงานแคบลงตามบริษัท/แผนกที่เลือก — จำเป็นเพราะ endpoint จำกัด 100 คน */
  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      try {
        const response = await getDocumentEmployees({ pageSize: 100 });
        if (cancelled) return;

        const items = (response.items ?? []).filter(
          (item) =>
            (!companyId || item.companyId === companyId) &&
            (!departmentId || item.departmentId === departmentId),
        );

        setEmployees(items);
        setEmployeeTotal(response.meta?.total ?? items.length);
      } catch {
        if (!cancelled) {
          setEmployees([]);
          setEmployeeTotal(0);
        }
      }
    }

    void loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [companyId, departmentId]);

  useEffect(() => {
    if (employeeId && !employees.some((item) => item.id === employeeId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างคนที่หลุดจากตัวกรองแผนก
      setEmployeeId("");
    }
  }, [employeeId, employees]);

  async function handleDownload(format: ExportFileFormat) {
    setDownloading(format);

    try {
      const job = await createReportJob({
        reportCode: definition.code,
        companyId: companyId || undefined,
        /* ชื่อนี้ไปขึ้นเป็นหัวเอกสารบนไฟล์ PDF ต้องเป็นวันที่ไทย ไม่ใช่ ISO ดิบ */
        name: `${definition.name} ${
          definition.periodBasis === "year"
            ? `ปี ${year}`
            : `${formatThaiDate(dateFrom)} – ${formatThaiDate(dateTo)}`
        }`,
        format,
        /*
         * แนบมุมมองไปด้วย ไม่งั้นกดโหลดจากหน้าสรุปกับหน้าปฏิทินจะได้ไฟล์
         * หน้าตาเดียวกันทั้ง 43 คอลัมน์ ทั้งที่บนจอแยกกันแล้ว
         */
        params: {
          ...(filters as Record<string, unknown>),
          ...(definition.exportView ? { view: definition.exportView } : {}),
        },
      });

      const result = await processReportJob(job.id);

      // ดึงไฟล์ลงเครื่องต่อทันที ผู้ใช้จะได้ไม่ต้องไปตามหาไฟล์ที่หน้าอื่น
      await downloadReportExportFile(
        result.exportFile.id,
        result.exportFile.fileName,
      );

      toast.success(`ดาวน์โหลด ${result.exportFile.fileName} แล้ว`);
    } catch (caught) {
      toast.error(getErrorMessage(caught, "ดาวน์โหลดไม่สำเร็จ"));
    } finally {
      setDownloading(null);
    }
  }

  const rows = data?.rows ?? [];
  const total = data?.meta?.total ?? rows.length;
  const totalPages = data?.meta?.totalPages ?? 1;

  return (
    <PageSurface>
      <PageHeading
        title={definition.name}
        description={definition.useCase}
        chips={
          <>
            <PageChip>{definition.description}</PageChip>
            <PageChip>
              {definition.periodBasis === "year"
                ? `ยึดตามปี ${Number(year) + 543}`
                : "ยึดตามช่วงวันที่"}
            </PageChip>
          </>
        }
        actions={
          <div className="grid grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <StatTile
              label="แถวทั้งหมด"
              value={count(total)}
              helper="ตามตัวกรองที่เลือก"
            />
            <StatTile
              label="กำลังดู"
              value={`${count(page)} / ${count(totalPages)}`}
              helper={`หน้าละ ${PAGE_SIZE} แถว`}
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
            onClick={() => void load()}
            disabled={loading}
            icon={
              <RefreshCw
                className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
              />
            }
          >
            รีเฟรช
          </Button>

          <span className="text-[12px] text-slate-500 3xl:text-[13px]">
            ดาวน์โหลดเป็น
          </span>

          {FORMATS.map((format) => (
            <Button
              key={format}
              variant={format === "XLSX" ? "primary" : "secondary"}
              disabled={downloading !== null || total === 0}
              loading={downloading === format}
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => void handleDownload(format)}
            >
              {format}
            </Button>
          ))}
        </div>
      </div>

      {/* ตัวกรอง — ชุดเดียวกับที่ไฟล์ดาวน์โหลดใช้ */}
      <div className="grid gap-3 border-b border-slate-200 px-5 py-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-3 3xl:px-7">
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

        <Field label="แผนก">
          <Select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">ทุกแผนก</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.nameTh ?? department.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="พนักงาน"
          hint={
            employeeTotal > employees.length
              ? `แสดง ${employees.length} จาก ${employeeTotal} คน — เลือกแผนกเพื่อให้รายชื่อแคบลง`
              : undefined
          }
        >
          <Select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">ทุกคน</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeCode} ·{" "}
                {employee.displayName ||
                  `${employee.firstName} ${employee.lastName}`.trim()}
              </option>
            ))}
          </Select>
        </Field>

        {definition.periodBasis === "year" ? (
          <Field label="ปี" hint="รายงานนี้คิดทั้งปี ไม่ได้คิดตามช่วงวันที่">
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
        ) : (
          <>
            {/*
              ปุ่มสลับโหมดช่วงเวลา — เลือกทีเดียวได้ทั้งเดือนหรือทั้งปี
              ไม่ใช้ <Field> เพราะมันครอบด้วย <label> ซึ่งกลืน role ของปุ่มข้างใน
              และทำให้คลิกปุ่มไปโดนพฤติกรรมของ label ด้วย
            */}
            <div className="block min-w-0">
              <span className="mb-1 block text-[13px] font-medium text-slate-600 3xl:text-[14px]">
                ช่วงเวลา
              </span>

              <div
                role="group"
                aria-label="โหมดช่วงเวลา"
                className="flex overflow-hidden rounded-lg border border-slate-200"
              >
                {PERIOD_MODES.map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    aria-pressed={mode.key === periodMode}
                    title={mode.hint}
                    onClick={() => setPeriodMode(mode.key)}
                    className={
                      mode.key === periodMode
                        ? "flex-1 bg-brand-600 px-3 py-2 text-[12px] font-semibold text-white 3xl:text-[13px]"
                        : "flex-1 bg-white px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50 3xl:text-[13px]"
                    }
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {periodHint ? (
                <span className="mt-1 block text-xs text-slate-400">
                  {periodHint}
                </span>
              ) : null}
            </div>

            {periodMode === "custom" ? (
              <>
                <Field label="ตั้งแต่วันที่">
                  <ThaiDateInput
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                    aria-label="ตั้งแต่วันที่"
                  />
                </Field>

                <Field label="ถึงวันที่">
                  <ThaiDateInput
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                    aria-label="ถึงวันที่"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="ปี">
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

                {periodMode === "month" ? (
                  <Field label="เดือน">
                    <Select
                      value={month}
                      onChange={(event) => setMonth(event.target.value)}
                    >
                      {MONTH_NAMES.map((name, index) => (
                        <option key={name} value={String(index + 1)}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </>
            )}
          </>
        )}

        <Field label="ค้นหา">
          <SearchInput
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="รหัสหรือชื่อพนักงาน"
            aria-label="ค้นหาในรายงาน"
          />
        </Field>
      </div>

      {error ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="critical">{error}</Notice>
        </div>
      ) : null}

      {data?.warning ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="warning">{data.warning}</Notice>
        </div>
      ) : null}

      {loading && !data ? (
        <LoadingState title="กำลังโหลดข้อมูลรายงาน" />
      ) : rows.length === 0 ? (
        <div className="px-5 py-16 text-center sm:px-6">
          <p className="text-[14px] font-semibold text-slate-700">
            ไม่มีข้อมูลตามตัวกรองที่เลือก
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            {definition.periodBasis === "year"
              ? "ลองเปลี่ยนปี หรือเอาตัวกรองพนักงาน/แผนกออก"
              : "ลองขยายช่วงวันที่ หรือเอาตัวกรองพนักงาน/แผนกออก"}
          </p>
        </div>
      ) : (
        <>
          <ReportTable rows={rows} columns={definition.columns} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
            <p className="text-[12px] text-slate-500 3xl:text-[13px]">
              แสดง {count(rows.length)} จาก {count(total)} แถว
            </p>

            <div className="flex items-center gap-2">
              <Button
                disabled={page <= 1 || loading}
                onClick={() => {
                  setPage((current) => Math.max(current - 1, 1));
                  scrollPagerToTop();
                }}
              >
                ก่อนหน้า
              </Button>
              <span className="text-[12px] tabular-nums text-slate-600 3xl:text-[13px]">
                {count(page)} / {count(totalPages)}
              </span>
              <Button
                disabled={page >= totalPages || loading}
                onClick={() => {
                  setPage((current) => Math.min(current + 1, totalPages));
                  scrollPagerToTop();
                }}
              >
                ถัดไป
              </Button>
            </div>
          </div>
        </>
      )}
    </PageSurface>
  );
}
