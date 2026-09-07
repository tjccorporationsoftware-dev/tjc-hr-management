"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, FileDown, FolderOpen, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  PageChip,
  PageHeading,
  PageSurface,
  Select,
  StatTile,
  Tabs,
  type TabItem,
} from "@/components/kit";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { useAuth } from "@/contexts/auth-context";

import { getOrganizationCompanies, getReportStatistics } from "@/lib/api";
import type { ReportStatistics } from "@/types/reports";

import { CatalogPanel } from "./_components/catalog-panel";
import { StatisticsPanel } from "./_components/statistics-panel";
import { DOCUMENT_CATALOG } from "./_components/document-catalog";
import { getErrorMessage } from "./_components/report-utils";

/**
 * ศูนย์เอกสารและสถิติ
 * -----------------------------------------------------------------------------
 * รวมสองเรื่องที่คนเปิดหน้านี้มาหาจริง ๆ
 *   1. เอกสาร — ไฟล์ทุกอย่างที่ระบบออกได้ อยู่ที่นี่ที่เดียว ไม่ต้องไล่หาตามหน้า
 *   2. สถิติ  — ช่วงที่เลือก องค์กรเกิดอะไรขึ้นบ้าง และระบบถูกใช้งานยังไง
 *
 * เดิมหน้านี้แยก "คลังเอกสาร" กับ "ข้อมูลรายงาน" เป็นคนละแท็บ ทำให้ต้องสลับ
 * ไปดูตารางที่แท็บหนึ่ง แล้วเดินกลับมากดโหลดอีกแท็บหนึ่ง ตอนนี้ดูตัวอย่าง
 * และกดสร้างไฟล์อยู่ในที่เดียวกันแล้ว
 *
 * บริบทที่เอกสารต้องใช้ (บริษัท/รอบเงินเดือน/ปีภาษี/ช่วงวันที่) เลือกที่หัวหน้าครั้งเดียว
 * ใช้ร่วมกันทั้งหน้า — ช่วงวันที่เดียวกันนี้เป็นตัวกำหนดสถิติด้วย
 */

type TabKey = "catalog" | "statistics";

const TAB_KEYS: TabKey[] = ["catalog", "statistics"];

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0";

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

function ReportsWorkspace() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const permissions = useMemo(
    () =>
      new Set(
        (user?.permissions ?? []).map((permission) =>
          permission.trim().toUpperCase(),
        ),
      ),
    [user?.permissions],
  );

  const [tab, setTab] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    return (TAB_KEYS as string[]).includes(requested ?? "")
      ? (requested as TabKey)
      : "catalog";
  });

  /* ---------------- บริบทที่ใช้ร่วมกันทั้งหน้า ---------------- */

  const [companies, setCompanies] = useState<
    Array<{ id: string; nameTh?: string; name?: string; code?: string }>
  >([]);
  const [companyId, setCompanyId] = useState("");
  const [dateFrom, setDateFrom] = useState(() => daysAgo(29));
  const [dateTo, setDateTo] = useState(() => isoDate(new Date()));

  /* ---------------- ข้อมูลของแต่ละแท็บ ---------------- */

  const [statistics, setStatistics] = useState<ReportStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  /* นับเฉพาะเอกสารที่สิทธิ์ของผู้ใช้คนนี้เปิดได้จริง ตรงกับที่แท็บคลังเอกสารกรอง
     ไม่ใช่จำนวนทั้งทะเบียน ซึ่งจะไม่ตรงกับที่เขาเห็น */
  const availableDocuments = useMemo(
    () =>
      DOCUMENT_CATALOG.filter((item) => permissions.has(item.permission))
        .length,
    [permissions],
  );

  /* ---------------- โหลดข้อมูล ---------------- */

  const loadStatistics = useCallback(async () => {
    setStatsLoading(true);
    setStatsError("");

    try {
      setStatistics(
        await getReportStatistics({
          companyId: companyId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      );
    } catch (error) {
      setStatsError(getErrorMessage(error, "โหลดสถิติไม่สำเร็จ"));
    } finally {
      setStatsLoading(false);
    }
  }, [companyId, dateFrom, dateTo]);

  // ข้อมูลตั้งต้นที่ทุกแท็บใช้ร่วมกัน โหลดครั้งเดียวตอนเข้าหน้า
  useEffect(() => {
    let cancelled = false;

    async function loadBase() {
      try {
        const companyData = await getOrganizationCompanies().catch(() => []);

        if (cancelled) return;

        setCompanies(
          Array.isArray(companyData)
            ? companyData
            : ((companyData as { items?: typeof companies })?.items ?? []),
        );
      } catch (error) {
        if (!cancelled) {
          toast.error(getErrorMessage(error, "โหลดข้อมูลตั้งต้นไม่สำเร็จ"));
        }
      }
    }

    void loadBase();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดสถิติใหม่เมื่อบริบท (บริษัท/ช่วงวันที่) เปลี่ยน
    void loadStatistics();
  }, [loadStatistics]);

  /* ---------------- การกระทำ ---------------- */

  const tabs: Array<TabItem<TabKey>> = [
    { key: "catalog", label: "คลังเอกสาร" },
    { key: "statistics", label: "สถิติระบบ" },
  ];

  const isCatalog = tab === "catalog";

  return (
    <PageSurface>
      <PageHeading
        heroMotif="reports"
        eyebrow="Reports"
        title="ศูนย์เอกสารและ"
        titleAccent="สถิติ"
        description="ดาวน์โหลดเอกสารทุกอย่างของระบบได้จากที่นี่ พร้อมดูสถิติการทำงานขององค์กรในช่วงที่เลือก"
        chips={
          <>
            <PageChip>
              {dateFrom || "—"} ถึง {dateTo || "—"}
            </PageChip>
            <PageChip>
              {companyId
                ? (companies.find((item) => item.id === companyId)?.nameTh ??
                  "บริษัทที่เลือก")
                : "ทุกบริษัทในขอบเขตของคุณ"}
            </PageChip>
          </>
        }
        actions={
          <div className={TILE_BOX}>
            <StatTile
              icon={<Users className="h-4 w-4" />}
              label="พนักงานที่ทำงานอยู่"
              value={count(statistics?.workforce.activeTotal ?? 0)}
              helper="ยอด ณ วันนี้"
            />
            <StatTile
              icon={<Activity className="h-4 w-4" />}
              label="กิจกรรมในระบบ"
              value={count(statistics?.system.totalEvents ?? 0)}
              helper="ในช่วงที่เลือก"
            />
            <StatTile
              icon={<FileDown className="h-4 w-4" />}
              label="ไฟล์ที่ระบบสร้าง"
              value={count(statistics?.documents.exportsGenerated ?? 0)}
              helper="ในช่วงที่เลือก"
            />
            <StatTile
              icon={<FolderOpen className="h-4 w-4" />}
              label="เอกสารที่โหลดได้"
              value={count(availableDocuments)}
              helper="ชนิดเอกสารที่สิทธิ์ของคุณเปิดได้"
            />
          </div>
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {/*
        แถบช่วงเวลา — ใช้เฉพาะแท็บสถิติ
        แท็บคลังเอกสารไม่ต้องใช้แล้ว เพราะเลือกงวด/ปี/ตัวกรองในหน้าของเอกสารเอง
      */}
      {isCatalog ? null : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 3xl:px-7">
          <div className="w-full sm:w-60 [&_select]:bg-white">
            <Select
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              aria-label="บริษัท"
            >
              <option value="">ทุกบริษัทในขอบเขตของคุณ</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nameTh ?? company.name ?? company.code}
                </option>
              ))}
            </Select>
          </div>

          {/* ช่วงวันที่อ่านเป็นชุดเดียว จึงวางติดกันโดยมีขีดคั่นแทนป้ายกำกับสองอัน */}
          <div className="flex items-center gap-2 [&_input]:bg-white">
            <div className="w-36">
              <ThaiDateInput
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                aria-label="ตั้งแต่วันที่"
              />
            </div>
            <span className="text-slate-400">–</span>
            <div className="w-36">
              <ThaiDateInput
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                aria-label="ถึงวันที่"
              />
            </div>
          </div>

          <div className="ml-auto">
            <Button
              onClick={() => void loadStatistics()}
              disabled={statsLoading}
              icon={
                <RefreshCw
                  className={
                    statsLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
                  }
                />
              }
            >
              รีเฟรชสถิติ
            </Button>
          </div>
        </div>
      )}

      {tab === "catalog" ? <CatalogPanel permissions={permissions} /> : null}

      {tab === "statistics" ? (
        <StatisticsPanel
          data={statistics}
          loading={statsLoading}
          error={statsError}
          onRetry={() => void loadStatistics()}
        />
      ) : null}
    </PageSurface>
  );
}

export default function ReportsPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <ReportsWorkspace />
    </Suspense>
  );
}
