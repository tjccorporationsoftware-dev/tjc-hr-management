"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarClock,
  Minus,
  Plus,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  Button,
  DataTable,
  IconButton,
  Modal,
  Notice,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  TextInput,
  Toggle,
  type Column,
} from "@/components/kit";
import { AttendanceGroupHeading } from "@/components/common/attendance-group-heading";
import {
  ApiClientError,
  generateLeaveBalancesBulk,
  getLeaveBalances,
  getLeaveTypes,
  updateLeaveBalance,
} from "@/lib/api";
import type { LeaveBalance, LeaveType } from "@/types/leave";

/* ─── ตัวช่วย ──────────────────────────────────────────────────────────────── */

/** ดึงได้ทีละ 100 แถว (เพดานของ API) */
const PAGE_SIZE = 100;

/** กันวนไม่รู้จบถ้า meta เพี้ยน — 40 หน้า = 4,000 แถว */
const MAX_PAGES = 40;

/**
 * ข้อความที่ระบบเขียนเองตอนสร้างยอด ไม่ใช่เหตุผลที่ HR กรอก
 * ถ้าเอามาโชว์ในช่อง "เหตุผล" จะขึ้นเหมือนกันทุกแถวจนดูรก และทำให้เข้าใจผิด
 * ว่ามีคนเคยปรับไว้แล้ว จึงกรองทิ้งทั้งตอนแสดงและตอนเริ่มแก้
 */
const AUTO_NOTE = "สร้างจากนโยบายวันลาอัตโนมัติ";

/** ก้าวละครึ่งวัน เพราะระบบรองรับลาครึ่งวัน */
const STEP = 0.5;

function humanNote(note: string | null | undefined) {
  const trimmed = (note ?? "").trim();
  if (!trimmed || trimmed === AUTO_NOTE) return "";
  return trimmed;
}

/** ตัดศูนย์ท้ายทิ้ง — 1.5 อ่านง่ายกว่า 1.50 */
function formatDays(value: number) {
  if (!Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(2)));
}

/** แสดงค่าปรับพร้อมเครื่องหมาย — +2 / -1 / — */
function formatAdjusted(value: number) {
  if (value === 0) return "—";
  return `${value > 0 ? "+" : ""}${formatDays(value)}`;
}

function parseDays(value: string) {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "-") return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [
  currentYear + 1,
  currentYear,
  currentYear - 1,
  currentYear - 2,
];

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0";

/* ป้ายกำกับคอลัมน์และช่องกรอก — ชุดเดียวกับป้ายหัวข้อของหน้าอื่นในระบบ */
const LABEL_CLASS =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500";

/** หนึ่งแถวในตารางหลัก = พนักงานหนึ่งคน พร้อมสิทธิ์ทุกประเภทของเขา */
type EmployeeRow = {
  employeeId: string;
  employee: LeaveBalance["employee"];
  name: string;
  balances: LeaveBalance[];
  entitled: number;
  used: number;
  pending: number;
  remaining: number;
  adjustedCount: number;
};

function employeeName(employee: LeaveBalance["employee"]) {
  if (employee.displayName?.trim()) return employee.displayName.trim();
  const full = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
  return full || employee.employeeCode;
}

/* ─── หน้าหลัก ─────────────────────────────────────────────────────────────── */

export function LeaveQuotaPanel() {
  const [year, setYear] = useState(currentYear);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [search, setSearch] = useState("");

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);

  /** แก้ได้ทีละประเภท เพื่อให้สายตารู้ว่ากำลังยุ่งกับแถวไหนอยู่ */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("0");
  const [saving, setSaving] = useState(false);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadBalances = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const collected: LeaveBalance[] = [];
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && page <= MAX_PAGES) {
        const response = await getLeaveBalances({
          page,
          pageSize: PAGE_SIZE,
          year,
          leaveTypeId: leaveTypeId || undefined,
          search: search.trim() || undefined,
        });

        collected.push(...response.items);
        totalPages = response.meta.totalPages || 1;
        page += 1;
      }

      setBalances(collected);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "โหลดสิทธิ์วันลาไม่สำเร็จ",
      );
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [leaveTypeId, search, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBalances();
  }, [loadBalances]);

  useEffect(() => {
    getLeaveTypes({ status: "ACTIVE" })
      .then((items) => setLeaveTypes(items))
      // ตัวกรองใช้ไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย ตารางยังอ่านได้ตามปกติ
      .catch(() => setLeaveTypes([]));
  }, []);

  /*
   * ยุบเป็นรายคน แล้วเรียงตาม สาขา → แผนก → รหัสพนักงาน
   * ตัวตารางขึ้นหัวกลุ่มใหม่เมื่อ key เปลี่ยนเท่านั้น แถวจึงต้องเรียงมาก่อน
   */
  const employeeRows = useMemo(() => {
    const map = new Map<string, EmployeeRow>();

    for (const balance of balances) {
      const existing = map.get(balance.employeeId);
      const row =
        existing ??
        ({
          adjustedCount: 0,
          balances: [],
          employee: balance.employee,
          employeeId: balance.employeeId,
          entitled: 0,
          name: employeeName(balance.employee),
          pending: 0,
          remaining: 0,
          used: 0,
        } satisfies EmployeeRow);

      row.balances.push(balance);
      row.entitled += balance.totalAvailableBeforeUsed;
      row.used += balance.usedDays;
      row.pending += balance.pendingDays;
      row.remaining += balance.remainingDays;
      if (balance.adjustedDays !== 0) row.adjustedCount += 1;

      map.set(balance.employeeId, row);
    }

    const rows = [...map.values()];

    for (const row of rows) {
      row.balances.sort((a, b) =>
        (a.leaveType.code ?? "").localeCompare(b.leaveType.code ?? ""),
      );
    }

    return rows.sort((a, b) => {
      const byBranch = (a.employee.branch?.code ?? "zzz").localeCompare(
        b.employee.branch?.code ?? "zzz",
      );
      if (byBranch !== 0) return byBranch;

      const byDepartment = (a.employee.department?.code ?? "zzz").localeCompare(
        b.employee.department?.code ?? "zzz",
      );
      if (byDepartment !== 0) return byDepartment;

      return a.employee.employeeCode.localeCompare(b.employee.employeeCode);
    });
  }, [balances]);

  const summary = useMemo(() => {
    let remaining = 0;
    let used = 0;
    let adjusted = 0;

    for (const row of employeeRows) {
      remaining += row.remaining;
      used += row.used;
      adjusted += row.adjustedCount;
    }

    return {
      adjusted,
      employeeCount: employeeRows.length,
      remaining,
      used,
    };
  }, [employeeRows]);

  /** จำนวนคนในแต่ละกลุ่ม ใช้โชว์ข้างหัวกลุ่ม */
  const groupCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of employeeRows) {
      const branchKey = row.employee.branch?.id ?? "no-branch";
      const departmentKey = `${branchKey}:${row.employee.department?.id ?? "no-department"}`;
      map.set(branchKey, (map.get(branchKey) ?? 0) + 1);
      map.set(departmentKey, (map.get(departmentKey) ?? 0) + 1);
    }
    return map;
  }, [employeeRows]);

  const openRow = useMemo(
    () => employeeRows.find((row) => row.employeeId === openEmployeeId) ?? null,
    [employeeRows, openEmployeeId],
  );

  function closeDetail() {
    if (saving) return;
    setOpenEmployeeId(null);
    setEditingId(null);
  }

  function startEdit(balance: LeaveBalance) {
    setEditingId(balance.id);
    setEditAmount(String(balance.adjustedDays));
  }

  function bumpAmount(delta: number) {
    setEditAmount(String(Number((parseDays(editAmount) + delta).toFixed(2))));
  }

  async function saveEdit(balance: LeaveBalance) {
    const amount = parseDays(editAmount);

    try {
      setSaving(true);

      /*
       * หน้าจอไม่ให้กรอกเหตุผลแล้ว แต่ยังส่งค่าเดิมกลับไปด้วย
       * ไม่งั้นการปรับตัวเลขครั้งถัดไปจะลบหมายเหตุที่เคยบันทึกไว้ทิ้ง
       */
      await updateLeaveBalance(balance.id, {
        adjustedDays: amount,
        note: humanNote(balance.note) || null,
      });

      toast.success(`ปรับ${balance.leaveType.nameTh}แล้ว`);
      setEditingId(null);
      await loadBalances();
    } catch (caught) {
      toast.error(
        caught instanceof ApiClientError ? caught.message : "บันทึกไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitGenerate() {
    try {
      setGenerating(true);

      const result = await generateLeaveBalancesBulk({
        year,
        overwriteEntitlement: overwrite,
      });

      /*
       * คนที่ล้มไม่ทำให้ทั้งงานล้ม จึงต้องรายงานทั้งสองส่วน
       * สาเหตุที่พบบ่อยคือยังไม่ได้ตั้งนโยบายวันลาให้ประเภทพนักงานนั้น
       */
      if (result.failed.length > 0) {
        toast.warning(
          `สร้างยอดให้ ${result.succeeded} คน · ข้าม ${result.failed.length} คน`,
          {
            description: result.failed
              .slice(0, 3)
              .map((item) => `${item.employeeCode} — ${item.reason}`)
              .join(" · "),
          },
        );
      } else {
        toast.success(
          `สร้างยอดให้ ${result.succeeded} คน รวม ${result.balanceCount} รายการ`,
        );
      }

      setGenerateOpen(false);
      setOverwrite(false);
      await loadBalances();
    } catch (caught) {
      toast.error(
        caught instanceof ApiClientError ? caught.message : "สร้างยอดไม่สำเร็จ",
      );
    } finally {
      setGenerating(false);
    }
  }

  const columns: Array<Column<EmployeeRow>> = [
    {
      key: "employee",
      header: "พนักงาน",
      width: "w-[30%]",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.name} size="lg" />
          <div className="min-w-0">
            <p className="break-words text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px] 4xl:text-[15px]">
              {row.name}
            </p>
            <p className="truncate text-[12px] text-slate-400 3xl:text-[13px]">
              {row.employee.employeeCode}
              {row.employee.position ? ` · ${row.employee.position}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "types",
      header: "ประเภทที่มีสิทธิ์",
      align: "right",
      hideBelow: "lg",
      cell: (row) => (
        <span className="text-[13px] text-slate-500 3xl:text-[14px]">
          {row.balances.length}
        </span>
      ),
    },
    {
      key: "entitled",
      header: "สิทธิ์ทั้งหมด",
      align: "right",
      hideBelow: "lg",
      cell: (row) => <DayText value={row.entitled} />,
    },
    {
      key: "used",
      header: "ใช้ไปแล้ว",
      align: "right",
      cell: (row) => <DayText value={row.used} />,
    },
    {
      key: "pending",
      header: "รออนุมัติ",
      align: "right",
      hideBelow: "lg",
      cell: (row) => (
        <span
          className={
            row.pending === 0
              ? "text-[13px] text-slate-300 3xl:text-[14px]"
              : "text-[13px] font-semibold text-amber-600 3xl:text-[14px]"
          }
        >
          {formatDays(row.pending)}
        </span>
      ),
    },
    {
      key: "adjusted",
      header: "ปรับเอง",
      align: "right",
      hideBelow: "xl",
      cell: (row) => (
        <span
          className={
            row.adjustedCount === 0
              ? "text-[13px] text-slate-300 3xl:text-[14px]"
              : "text-[13px] font-semibold text-slate-700 3xl:text-[14px]"
          }
        >
          {row.adjustedCount === 0 ? "0" : `${row.adjustedCount} รายการ`}
        </span>
      ),
    },
    {
      key: "remaining",
      header: "คงเหลือรวม",
      align: "right",
      cell: (row) => (
        <span className="text-[14px] font-bold text-brand-700 3xl:text-[15px]">
          {formatDays(row.remaining)}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "w-[9rem]",
      cell: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={(event) => {
            // แถวทั้งแถวกดได้อยู่แล้ว ปุ่มนี้จึงต้องกันไม่ให้สั่งซ้ำสองรอบ
            event.stopPropagation();
            setEditingId(null);
            setOpenEmployeeId(row.employeeId);
          }}
        >
          ดูรายละเอียด
        </Button>
      ),
    },
  ];

  return (
    <PageSurface className="xl:overflow-visible">
      <PageHeading
        heroMotif="leave-quota"
        eyebrow="Leave Quota"
        title="สิทธิ์วันลา"
        titleAccent="พนักงาน"
        description="ดูสิทธิ์วันลาคงเหลือรายคน และปรับเพิ่ม/ลดเป็นรายประเภท"
        actions={
          <div className={TILE_BOX}>
            <StatTile
              icon={<Users className="h-4 w-4" />}
              label="พนักงาน"
              value={String(summary.employeeCount)}
              helper={`ปีสิทธิ์ ${year}`}
            />
            <StatTile
              icon={<CalendarCheck className="h-4 w-4" />}
              label="ใช้ไปแล้ว"
              value={formatDays(summary.used)}
            />
            <StatTile
              icon={<CalendarClock className="h-4 w-4" />}
              label="คงเหลือรวม"
              value={formatDays(summary.remaining)}
              tone="positive"
            />
            <StatTile
              icon={<SlidersHorizontal className="h-4 w-4" />}
              label="ที่ปรับเอง"
              value={String(summary.adjusted)}
            />
          </div>
        }
      />

      {/*
       * แถบเครื่องมือพื้นเทาอ่อน คั่นตัวเองออกจากหัวเรื่องด้านบนและตารางด้านล่าง
       * โทนเดียวกับหน้า /attendance และ /hr-review
       *   ซ้าย = เลือกว่าจะดูอะไร  ขวา = ปุ่มที่ลงมือทำ
       */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="w-[9.5rem] shrink-0">
          <Select
            value={String(year)}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="ปีสิทธิ์"
          >
            {YEAR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                ปีสิทธิ์ {option}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-[14rem] shrink-0">
          <Select
            value={leaveTypeId}
            onChange={(event) => setLeaveTypeId(event.target.value)}
            aria-label="ประเภทการลา"
          >
            <option value="">ทุกประเภทการลา</option>
            {leaveTypes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nameTh}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[14rem] flex-1 [&_input]:bg-white">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหารหัสหรือชื่อพนักงาน"
            className="w-full"
            aria-label="ค้นหาพนักงาน"
          />
        </div>

        <p className="shrink-0 text-[12px] tabular-nums text-slate-500">
          พบ {summary.employeeCount} คน
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={() => void loadBalances()}>
            <RefreshCcw className="h-3.5 w-3.5" />
            โหลดใหม่
          </Button>
          <Button variant="primary" onClick={() => setGenerateOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" />
            สร้างยอดจากนโยบาย
          </Button>
        </div>
      </div>

      {/*
        ยอดวันลาถูกสร้างตอนพนักงานเปิดดูสิทธิ์ตัวเองเท่านั้น คนที่ยังไม่เคยล็อกอิน
        จะไม่มีแถวเลย ถ้าไม่บอกไว้ตรงนี้ HR จะเข้าใจว่าระบบคำนวณไม่ครบ
      */}
      {!loading && !error && summary.employeeCount === 0 ? (
        <div className="px-5 pt-4 3xl:px-7">
          <Notice tone="info">
            ยังไม่มียอดวันลาของปีนี้ — กด &quot;สร้างยอดจากนโยบาย&quot;
            เพื่อสร้างให้พนักงานทุกคนตามที่ตั้งไว้ในหน้านโยบายการทำงาน
          </Notice>
        </div>
      ) : null}

      {/* หัวคอลัมน์สูงขึ้นอีกนิดให้อ่านง่ายกว่าค่ากลางของตาราง */}
      <div className="[&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:tracking-normal [&_thead_th]:text-slate-700 [&_thead_th]:py-3.5 [&_thead_th]:text-[12.5px] 3xl:[&_thead_th]:py-4 3xl:[&_thead_th]:text-[13px] 4xl:[&_thead_th]:py-[1.125rem] 4xl:[&_thead_th]:text-[13.5px]">
        <DataTable
          columns={columns}
          rows={employeeRows}
          rowKey={(row) => row.employeeId}
          loading={loading}
          error={error || null}
          onRetry={() => void loadBalances()}
          onRowClick={(row) => {
            setEditingId(null);
            setOpenEmployeeId(row.employeeId);
          }}
          emptyTitle="ยังไม่มีข้อมูลสิทธิ์วันลา"
          emptyDescription="ลองเปลี่ยนปีสิทธิ์หรือตัวกรอง หรือกดสร้างยอดจากนโยบาย"
          groupBy={(row) => {
            const branchKey = row.employee.branch?.id ?? "no-branch";
            const departmentKey = `${branchKey}:${row.employee.department?.id ?? "no-department"}`;

            return [
              {
                key: branchKey,
                label: (
                  <AttendanceGroupHeading
                    level="branch"
                    title={
                      row.employee.branch?.nameTh ||
                      row.employee.company?.nameTh ||
                      "ไม่ระบุสาขา"
                    }
                    code={row.employee.branch?.code}
                    employeeCount={groupCounts.get(branchKey)}
                  />
                ),
              },
              {
                key: departmentKey,
                label: (
                  <AttendanceGroupHeading
                    level="department"
                    title={row.employee.department?.nameTh || "ไม่ระบุแผนก"}
                    code={row.employee.department?.code}
                    employeeCount={groupCounts.get(departmentKey)}
                  />
                ),
              },
            ];
          }}
          /* 5rem = ความสูงแถบบนสุด — หัวตารางกับแถบชื่อสาขาจะไปค้างต่อจากแถบนั้น */
          pageStickyTop="5rem"
        />
      </div>

      {openRow ? (
        <Modal
          open
          size="lg"
          onClose={closeDetail}
          title="สิทธิ์วันลารายคน"
          footer={
            <Button variant="secondary" disabled={saving} onClick={closeDetail}>
              ปิด
            </Button>
          }
        >
          <div className="-mx-5 -mt-4">
            {/* แถวตัวตนอยู่บนพื้นฟ้าอ่อน ทำหน้าที่เป็นหัวเรื่องจริงของกล่อง */}
            <div className="flex items-center gap-3 border-b border-brand-100 bg-brand-50/50 px-5 py-3">
              <Avatar name={openRow.name} size="md" />
              <div className="min-w-0">
                <p className="break-words text-[14px] font-bold text-slate-900 3xl:text-[15px]">
                  {openRow.name}
                </p>
                <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
                  {[
                    openRow.employee.employeeCode,
                    openRow.employee.department?.nameTh,
                    openRow.employee.branch?.nameTh,
                    `ปีสิทธิ์ ${year}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {/* สรุปสามตัวเลขก่อน จะได้เห็นภาพรวมของคนนี้ก่อนลงรายละเอียด */}
            <div className="grid grid-cols-3 divide-x divide-brand-100 overflow-hidden rounded-xl border border-brand-100">
              <SummaryCell label="สิทธิ์ทั้งหมด" value={openRow.entitled} />
              <SummaryCell label="ใช้ไปแล้ว" value={openRow.used} />
              <SummaryCell label="คงเหลือรวม" value={openRow.remaining} />
            </div>

            {/*
             * เดิมเป็นตาราง 7 คอลัมน์ที่เป็นตัวเลขล้วนถึง 5 คอลัมน์ ทั้งที่ค่าที่ต้องดูจริง
             * คือ "เหลือเท่าไร" ส่วนตามนโยบาย/ปรับ/สิทธิ์รวม เป็นที่มาของยอดเดียวกัน
             *
             * จัดใหม่เหลือ 4 คอลัมน์ — ชื่อประเภท (พร้อมที่มาของยอดเป็นบรรทัดรอง)
             * แถบการใช้สิทธิ์ที่ดูออกในแวบเดียว ยอดคงเหลือตัวใหญ่ และปุ่มปรับ
             */}
            <div className="overflow-hidden rounded-xl border border-brand-100">
              <div className="grid grid-cols-[minmax(0,1fr)_11rem_5.5rem_6rem] items-center gap-3 border-b border-brand-100 bg-brand-50/60 px-4 py-2">
                <span className={LABEL_CLASS}>ประเภทการลา</span>
                <span className={LABEL_CLASS}>การใช้สิทธิ์</span>
                <span className={`text-right ${LABEL_CLASS}`}>คงเหลือ</span>
                <span aria-hidden />
              </div>

              {openRow.balances.map((balance) => {
                const editing = editingId === balance.id;
                // ตามนโยบาย = สิทธิ์ที่ระบบคิดให้ + ที่ยกมาจากปีก่อน (ยังไม่รวมที่ปรับเอง)
                const byPolicy =
                  balance.entitlementDays + balance.carriedForwardDays;
                const note = humanNote(balance.note);
                const total = balance.totalAvailableBeforeUsed;
                const usedPercent =
                  total > 0
                    ? Math.min(100, Math.round((balance.usedDays / total) * 100))
                    : 0;

                return (
                  <div
                    key={balance.id}
                    className="border-b border-brand-100 last:border-b-0"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_11rem_5.5rem_6rem] items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-slate-900 3xl:text-[13.5px]">
                          {balance.leaveType.nameTh}
                        </p>
                        <p className="truncate text-[11px] text-slate-400 3xl:text-[11.5px]">
                          {[
                            balance.leaveType.isPaid
                              ? "ได้รับค่าจ้าง"
                              : "ไม่ได้รับค่าจ้าง",
                            `นโยบาย ${formatDays(byPolicy)}`,
                            balance.adjustedDays !== 0
                              ? `ปรับ ${formatAdjusted(balance.adjustedDays)}`
                              : "",
                            balance.carriedForwardDays > 0
                              ? `ยกมา ${formatDays(balance.carriedForwardDays)}`
                              : "",
                            note,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      {/* แถบการใช้สิทธิ์ — เทียบใช้ไปกับสิทธิ์รวมในแวบเดียว */}
                      <div className="min-w-0">
                        <div className="h-1.5 overflow-hidden rounded-full bg-brand-100">
                          <div
                            className={
                              usedPercent >= 100
                                ? "h-full rounded-full bg-rose-400"
                                : "h-full rounded-full bg-brand-500"
                            }
                            style={{ width: `${usedPercent}%` }}
                          />
                        </div>
                        <p className="mt-1 truncate text-[11px] tabular-nums text-slate-400 3xl:text-[11.5px]">
                          ใช้ไป {formatDays(balance.usedDays)} จาก{" "}
                          {formatDays(total)} วัน
                        </p>
                      </div>

                      <p
                        className={
                          balance.remainingDays <= 0
                            ? "text-right text-[15px] font-bold tabular-nums text-slate-300 3xl:text-[16px]"
                            : "text-right text-[15px] font-bold tabular-nums text-slate-900 3xl:text-[16px]"
                        }
                      >
                        {formatDays(balance.remainingDays)}
                      </p>

                      <div className="flex justify-end">
                        {editing ? null : (
                          <Button
                            size="sm"
                            disabled={saving}
                            onClick={() => startEdit(balance)}
                          >
                            ปรับสิทธิ์
                          </Button>
                        )}
                      </div>
                    </div>

                    {editing ? (
                      <EditRow
                        balance={balance}
                        amount={editAmount}
                        saving={saving}
                        onAmountChange={setEditAmount}
                        onBump={bumpAmount}
                        onCancel={() => setEditingId(null)}
                        onSave={() => void saveEdit(balance)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* วิธีคิดตัวเลข — ขีดนำหน้าแบบเดียวกับหมายเหตุในหน้าอื่น */}
            <div className="border-l-2 border-brand-200 pl-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                วิธีคิด
              </p>
              <p className="mt-0.5 text-[12px] leading-5 text-slate-500">
                สิทธิ์รวม = ตามนโยบาย + ปรับเพิ่ม/ลด &nbsp;·&nbsp; คงเหลือ =
                สิทธิ์รวม − ใช้ไป − รออนุมัติ
              </p>
              <p className="mt-0.5 text-[12px] leading-5 text-slate-400">
                &quot;ตามนโยบาย&quot; คิดจากนโยบายการลาตามอายุงาน ส่วน
                &quot;ใช้ไป&quot; มาจากใบลาที่อนุมัติแล้ว — สองค่านี้แก้ที่นี่ไม่ได้
                ถ้าต้องการเพิ่มหรือหักวันให้คนใดคนหนึ่งเป็นกรณีพิเศษ ให้ใช้
                &quot;ปรับสิทธิ์&quot;
              </p>
            </div>
          </div>
        </Modal>
      ) : null}

      {generateOpen ? (
        <Modal
          open
          onClose={() => (generating ? undefined : setGenerateOpen(false))}
          title="สร้างยอดวันลาจากนโยบาย"
          description={`สร้างให้พนักงานที่ยังทำงานอยู่ทุกคนในขอบเขตของคุณ สำหรับปีสิทธิ์ ${year}`}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={generating}
                onClick={() => setGenerateOpen(false)}
              >
                ยกเลิก
              </Button>
              <Button disabled={generating} onClick={() => void submitGenerate()}>
                สร้างยอด
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Notice tone="info">
              ระบบจะอ่านนโยบายการลาที่ตั้งไว้ แล้วคำนวณสิทธิ์ตามอายุงานของแต่ละคน
              คนที่มียอดอยู่แล้วจะถูกข้าม เว้นแต่จะเปิดตัวเลือกด้านล่าง
            </Notice>

            <Toggle
              label="คำนวณสิทธิ์ใหม่ทับของเดิม"
              checked={overwrite}
              onChange={setOverwrite}
            />

            {overwrite ? (
              <Notice tone="warning">
                ช่อง &quot;สิทธิ์ตามนโยบาย&quot; ของทุกคนจะถูกคำนวณใหม่ทับค่าเดิม
                ส่วนที่ปรับเพิ่ม/ลดไว้เองและวันที่ใช้ไปแล้วไม่ถูกแตะ
              </Notice>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </PageSurface>
  );
}

/* ─── ชิ้นส่วนย่อย ─────────────────────────────────────────────────────────── */

/**
 * แผงแก้ไขของประเภทลาหนึ่งตัว
 *
 * แยกออกมาเพราะเป็นส่วนเดียวในหน้าที่มีสถานะของตัวเอง และต้องเห็นชัดว่า
 * "กดแล้วคงเหลือจะกลายเป็นเท่าไร" ก่อนกดบันทึก ไม่ใช่ให้เดาจากตัวเลขที่กรอก
 */
function EditRow({
  balance,
  amount,
  saving,
  onAmountChange,
  onBump,
  onCancel,
  onSave,
}: {
  balance: LeaveBalance;
  amount: string;
  saving: boolean;
  onAmountChange: (value: string) => void;
  onBump: (delta: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const nextAdjusted = parseDays(amount);
  const delta = nextAdjusted - balance.adjustedDays;
  // ถอนค่าปรับเก่าออกก่อน แล้วใส่ค่าใหม่เข้าไป ทั้งสิทธิ์รวมและคงเหลือขยับเท่ากัน
  const nextTotal = balance.totalAvailableBeforeUsed + delta;
  const nextRemaining = balance.remainingDays + delta;
  const changed = nextAdjusted !== balance.adjustedDays;

  return (
    /*
     * แผงปรับสิทธิ์อยู่บรรทัดเดียว — ช่องกรอก · ผลที่จะเกิด · ปุ่ม
     * ไม่ต้องมีหัวข้อหรือป้ายกำกับ เพราะแผงนี้กางอยู่ใต้แถวของประเภทการลานั้นอยู่แล้ว
     *
     * ความกว้างช่องกรอกต้องคุมที่ div ที่ครอบ ห้ามส่งคลาสไปทับ `TextInput`
     * เพราะคลาสฐานของมันมี `w-full` ซึ่งชนะคลาสที่ส่งไป ช่องจะยืดเต็มแถว
     */
    <div className="border-t border-brand-100 bg-brand-50/40 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton
            size="md"
            title="ลดครึ่งวัน"
            icon={<Minus className="h-4 w-4" />}
            disabled={saving}
            onClick={() => onBump(-STEP)}
          />
          <div className="w-20">
            <TextInput
              value={amount}
              inputMode="decimal"
              disabled={saving}
              className="text-center"
              aria-label="ปรับเพิ่ม / ลด (วัน)"
              onChange={(event) => onAmountChange(event.target.value)}
            />
          </div>
          <IconButton
            size="md"
            title="เพิ่มครึ่งวัน"
            icon={<Plus className="h-4 w-4" />}
            disabled={saving}
            onClick={() => onBump(STEP)}
          />
          <span className="ml-1 whitespace-nowrap text-[11px] text-slate-400">
            วัน · ติดลบคือหักออก
          </span>
        </div>

        {/*
         * ผลลัพธ์ต้องเห็นก่อนกดบันทึก และต้องเห็นทั้งสองตัว
         * เพราะค่าปรับบวกเข้าที่ "สิทธิ์รวม" ก่อน แล้วคงเหลือค่อยตามมา
         * ถ้าโชว์แต่คงเหลือ จะเข้าใจผิดว่าค่าปรับข้ามไปโผล่ที่คงเหลืออย่างเดียว
         */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1">
          <ChangePreview
            label="สิทธิ์รวม"
            from={balance.totalAvailableBeforeUsed}
            to={nextTotal}
          />
          <ChangePreview
            label="คงเหลือ"
            from={balance.remainingDays}
            to={nextRemaining}
          />

          {nextRemaining < 0 ? (
            <span className="text-[11.5px] font-semibold text-rose-600">
              คงเหลือจะติดลบ
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={onCancel}
          >
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={saving || !changed}
            onClick={onSave}
          >
            บันทึก
          </Button>
        </div>
      </div>
    </div>
  );
}

/** ค่าก่อน → หลัง ใช้ลูกศรแทนเส้นขีดฆ่า อ่านออกว่าอันไหนคือค่าใหม่ */
function ChangePreview({
  label,
  from,
  to,
}: {
  label: string;
  from: number;
  to: number;
}) {
  const changed = from !== to;

  return (
    <p className="flex items-baseline gap-1.5 whitespace-nowrap text-[12px] text-slate-500">
      {label}
      <span className="tabular-nums text-slate-400">{formatDays(from)}</span>
      <span className="text-slate-300">→</span>
      <span
        className={
          changed
            ? "text-[15px] font-bold tabular-nums text-brand-700"
            : "text-[15px] font-bold tabular-nums text-slate-900"
        }
      >
        {formatDays(to)}
      </span>
      <span className="text-[11px] text-slate-400">วัน</span>
    </p>
  );
}

/* ตัวเลขสรุปเป็นสีดำเหมือนกันทุกช่อง ชุดเดียวกับแผงตัวเลขบนหัวหน้า */
function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p className="mt-0.5 text-[17px] font-bold leading-6 tabular-nums text-slate-900 3xl:text-[18px]">
        {formatDays(value)}
        <span className="ml-1 text-[11.5px] font-medium text-slate-400">
          วัน
        </span>
      </p>
    </div>
  );
}

/** ตัวเลขวันลา — ศูนย์ให้จางตามกติกาของชุด kit */
function DayText({ value }: { value: number }) {
  return (
    <span
      className={
        value === 0
          ? "text-[13px] text-slate-300 3xl:text-[14px]"
          : "text-[13px] text-slate-700 3xl:text-[14px]"
      }
    >
      {formatDays(value)}
    </span>
  );
}
