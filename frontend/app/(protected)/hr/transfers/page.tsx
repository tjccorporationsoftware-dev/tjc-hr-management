"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Layers,
  Plus,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  Avatar,
  Button,
  Notice,
  PageHeading,
  PageSurface,
  RowMenu,
  SearchInput,
  Select,
  StatTile,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorText } from "@/lib/payroll-format";
import { EMPLOYEE_TRANSFER_STATUS } from "@/lib/status-labels";

import {
  apiFetchWithMeta,
  applyEmployeeTransfer,
  cancelEmployeeTransfer,
  createEmployeeTransfer,
  getEmployeeTransfers,
} from "@/lib/api";

import type { OrganizationOption, PaginationMeta } from "@/types/employee";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import type {
  CreateEmployeeTransferPayload,
  EmployeeTransferItem,
  EmployeeTransferStatus,
  EmployeeTransferSummary,
} from "@/types/employee-transfer";

import {
  CreateTransferModal,
  type TransferOptions,
} from "./_components/create-transfer-modal";

/**
 * โยกย้าย/ปรับตำแหน่ง
 * -------------------
 * เดิมการย้ายสาขาหรือเลื่อนตำแหน่งทำได้ทางเดียวคือเข้าไปแก้ทะเบียนพนักงานตรง ๆ
 * ซึ่งมีผลทันทีเสมอ ทั้งที่คำสั่งย้ายจริงออกล่วงหน้าเป็นสัปดาห์ HR จึงต้องจำแล้ว
 * กลับมาแก้เองในวันนั้น ถ้าลืมก็ไปโผล่ที่งวดเงินเดือนผิดสาขา
 *
 * หน้านี้ให้ออกใบไว้ล่วงหน้า แล้วระบบอัปเดตทะเบียนให้เองเมื่อถึงวันมีผล
 * พร้อมบันทึกลงประวัติการทำงานของพนักงานคนนั้นให้ตรวจย้อนหลังได้
 */

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(8.5rem,max-content))] sm:divide-y-0";

const PAGE_SIZE = 20;

type StatusFilter = EmployeeTransferStatus | "";

const emptyOptions: TransferOptions = {
  branches: [],
  departments: [],
  divisions: [],
  positions: [],
  employeeTypes: [],
};

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function personName(person: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  employeeCode?: string | null;
}) {
  return (
    person.displayName ||
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.employeeCode ||
    "-"
  );
}

function dateText(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * บรรทัด "จาก → ไป" ของแต่ละอย่างที่เปลี่ยน
 *
 * แสดงเฉพาะช่องที่เปลี่ยนจริง ช่องที่ค่าเท่าเดิมถูกบันทึกไว้ให้ from เท่ากับ to
 * อยู่แล้ว การกรองด้วยความเท่ากันจึงตรงกับ "สิ่งที่ใบนี้ตั้งใจเปลี่ยน" พอดี
 */
/**
 * ใบโยกย้ายหนึ่งใบในรายการ — บรรทัดเดียว
 * ใครถูกย้าย · เปลี่ยนอะไรจากอะไรเป็นอะไร · มีผลวันไหน · สถานะและคนบันทึก
 */
function TransferRow({
  row,
  onApplyNow,
  onCancel,
}: {
  row: EmployeeTransferItem;
  onApplyNow: () => void;
  onCancel: () => void;
}) {
  const changes = transferChanges(row);

  return (
    <article className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8">
      <div className="flex min-w-[15rem] flex-1 items-center gap-3">
        <Avatar name={personName(row.employee)} size="md" />
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
            {personName(row.employee)}
          </p>
          <p className="break-words text-[11.5px] text-slate-500 3xl:text-[12px]">
            {[row.employee.employeeCode, row.employee.position]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>
      </div>

      {/* เปลี่ยนอะไรบ้าง — ใบหนึ่งใบมีได้หลายบรรทัด */}
      <div className="min-w-[18rem] flex-[1.4]">
        {changes.length === 0 ? (
          <span className="text-[12.5px] text-slate-300">ไม่มีการเปลี่ยนแปลง</span>
        ) : (
          <div className="space-y-0.5">
            {changes.map((change) => (
              <div
                key={change.label}
                className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-slate-600 3xl:text-[13px]"
              >
                <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                  {change.label}
                </span>
                <span className="text-slate-400">{change.from}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-brand-300" />
                <span className="font-semibold text-slate-900">
                  {change.to}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* มีผลวันไหน */}
      <div className="w-36 shrink-0">
        <p className="truncate text-[12.5px] font-semibold tabular-nums text-slate-800 3xl:text-[13px]">
          {dateText(row.effectiveDate)}
        </p>
        <p className="truncate text-[11px] text-slate-400 3xl:text-[11.5px]">
          {row.status === "APPLIED"
            ? `อัปเดตเมื่อ ${dateText(row.appliedAt)}`
            : row.documentNo || "ยังไม่ถึงวันมีผล"}
        </p>
      </div>

      {/* สถานะและคนบันทึก */}
      <div className="w-40 shrink-0">
        <StatusBadge
          vocabulary={EMPLOYEE_TRANSFER_STATUS}
          status={row.status}
        />
        <p className="mt-0.5 break-words text-[11px] text-slate-400 3xl:text-[11.5px]">
          {row.createdBy?.displayName ?? "-"} · {dateText(row.createdAt)}
        </p>
      </div>

      <div className="flex w-8 shrink-0 justify-end">
        {row.status === "SCHEDULED" ? (
          <RowMenu
            items={[
              { label: "ให้มีผลทันที", onSelect: onApplyNow },
              { label: "ยกเลิกใบนี้", tone: "danger", onSelect: onCancel },
            ]}
          />
        ) : null}
      </div>
    </article>
  );
}

function transferChanges(transfer: EmployeeTransferItem) {
  const rows: Array<{ label: string; from: string; to: string }> = [];

  const push = (
    label: string,
    fromId: string | null,
    toId: string | null,
    fromText: string | null | undefined,
    toText: string | null | undefined,
  ) => {
    if (fromId === toId) return;
    rows.push({ label, from: fromText || "—", to: toText || "—" });
  };

  push(
    "สาขา",
    transfer.fromBranchId,
    transfer.toBranchId,
    transfer.fromBranch?.nameTh,
    transfer.toBranch?.nameTh,
  );
  push(
    "แผนก",
    transfer.fromDepartmentId,
    transfer.toDepartmentId,
    transfer.fromDepartment?.nameTh,
    transfer.toDepartment?.nameTh,
  );
  push(
    "ฝ่าย",
    transfer.fromDivisionId,
    transfer.toDivisionId,
    transfer.fromDivision?.nameTh,
    transfer.toDivision?.nameTh,
  );
  push(
    "ตำแหน่ง",
    transfer.fromPositionId,
    transfer.toPositionId,
    transfer.fromPosition?.nameTh ?? transfer.fromPositionTitle,
    transfer.toPosition?.nameTh ?? transfer.toPositionTitle,
  );
  push(
    "ประเภทพนักงาน",
    transfer.fromEmployeeTypeId,
    transfer.toEmployeeTypeId,
    transfer.fromEmployeeType?.nameTh,
    transfer.toEmployeeType?.nameTh,
  );
  push(
    "หัวหน้างาน",
    transfer.fromSupervisorId,
    transfer.toSupervisorId,
    transfer.fromSupervisor ? personName(transfer.fromSupervisor) : null,
    transfer.toSupervisor ? personName(transfer.toSupervisor) : null,
  );

  return rows;
}

export default function EmployeeTransfersPage() {
  const [items, setItems] = useState<EmployeeTransferItem[]>([]);
  const [summary, setSummary] = useState<EmployeeTransferSummary | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [branchId, setBranchId] = useState("");
  const [page, setPage] = useState(1);

  const [options, setOptions] = useState<TransferOptions>(emptyOptions);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);

  async function loadTransfers() {
    setLoading(true);
    setError(null);

    try {
      const result = await getEmployeeTransfers({
        q: term.trim() || undefined,
        status: status || undefined,
        branchId: branchId || undefined,
        page,
        pageSize: PAGE_SIZE,
      });

      setItems(result.items);
      setSummary(result.summary);
      setMeta(result.meta);
    } catch (loadError) {
      setError(errorText(loadError, "โหลดรายการโยกย้ายไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions() {
    try {
      const [branches, departments, divisions, positions, employeeTypes] =
        await Promise.all([
          apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
            "/organization/branches?pageSize=100",
          ),
          apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
            "/organization/departments?pageSize=100",
          ),
          apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
            "/organization/divisions?pageSize=100",
          ),
          apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
            "/organization/positions?pageSize=100",
          ),
          apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
            "/organization/employee-types?pageSize=100",
          ),
        ]);

      setOptions({
        branches: branches.data,
        departments: departments.data,
        divisions: divisions.data,
        positions: positions.data,
        employeeTypes: employeeTypes.data,
      });
    } catch (loadError) {
      toast.error(errorText(loadError, "โหลดข้อมูลตั้งต้นไม่สำเร็จ"));
    }
  }

  /*
   * ยิงโหลดนอกจังหวะ render เหมือนหน้าอื่นในระบบ
   * ถ้าเรียกตรง ๆ ในเอฟเฟกต์ setLoading จะทำให้เกิด render ซ้อนตั้งแต่รอบแรก
   */
  useEffect(() => {
    const timer = window.setTimeout(() => void loadTransfers(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, status, branchId, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOptions(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleCreate(payload: CreateEmployeeTransferPayload) {
    setSaving(true);

    try {
      const created = await createEmployeeTransfer(payload);

      toast.success(
        created.status === "APPLIED"
          ? "บันทึกและอัปเดตทะเบียนพนักงานเรียบร้อย"
          : "บันทึกใบโยกย้ายเรียบร้อย ระบบจะอัปเดตให้เองเมื่อถึงวันที่มีผล",
      );
      setCreateOpen(false);
      setPage(1);
      await loadTransfers();
    } catch (saveError) {
      toast.error(errorText(saveError, "บันทึกใบโยกย้ายไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  function askCancel(transfer: EmployeeTransferItem) {
    setDialog({
      title: "ยกเลิกใบโยกย้าย",
      description: `ยกเลิกใบของ ${personName(transfer.employee)} ที่ตั้งให้มีผลวันที่ ${dateText(
        transfer.effectiveDate,
      )} — ทะเบียนพนักงานจะไม่ถูกเปลี่ยน`,
      confirmLabel: "ยกเลิกใบนี้",
      tone: "red",
      reasonLabel: "เหตุผลที่ยกเลิก",
      reasonPlaceholder: "เช่น ผู้บริหารเปลี่ยนคำสั่ง",
      onConfirm: async (reason) => {
        await cancelEmployeeTransfer(transfer.id, { cancelReason: reason });
        toast.success("ยกเลิกใบโยกย้ายเรียบร้อย");
        setDialog(null);
        await loadTransfers();
      },
    });
  }

  function askApplyNow(transfer: EmployeeTransferItem) {
    setDialog({
      title: "ให้มีผลทันที",
      description: `อัปเดตสังกัดของ ${personName(transfer.employee)} เดี๋ยวนี้ โดยไม่รอถึงวันที่ ${dateText(
        transfer.effectiveDate,
      )} — ประวัติการทำงานจะยังบันทึกวันที่มีผลตามใบเดิม`,
      confirmLabel: "ให้มีผลทันที",
      tone: "orange",
      onConfirm: async () => {
        await applyEmployeeTransfer(transfer.id);
        toast.success("อัปเดตทะเบียนพนักงานเรียบร้อย");
        setDialog(null);
        await loadTransfers();
      },
    });
  }

  return (
    <PageSurface>
      <PageHeading
        heroMotif="transfer"
        eyebrow="Transfers"
        title="โยกย้าย/"
        titleAccent="ปรับตำแหน่ง"
        description="ออกคำสั่งย้ายสาขา ย้ายแผนก และเลื่อนตำแหน่งไว้ล่วงหน้า ระบบจะอัปเดตทะเบียนพนักงานให้เองเมื่อถึงวันที่มีผล"
        actions={
          <div className={TILE_BOX}>
            <StatTile
              icon={<CalendarClock className="h-4 w-4" />}
              label="รอถึงวันมีผล"
              value={count(summary?.scheduled ?? 0)}
              helper="ยังแก้/ยกเลิกได้"
            />
            <StatTile
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="มีผลแล้ว"
              value={count(summary?.applied ?? 0)}
              helper="อัปเดตทะเบียนแล้ว"
            />
            <StatTile
              icon={<XCircle className="h-4 w-4" />}
              label="ยกเลิก"
              value={count(summary?.cancelled ?? 0)}
              helper="ไม่ถูกนำไปใช้"
            />
            <StatTile
              icon={<Layers className="h-4 w-4" />}
              label="ทั้งหมด"
              value={count(summary?.total ?? 0)}
              helper="ตามตัวกรองที่เลือก"
            />
          </div>
        }
      />

      {/*
       * แถบเครื่องมือพื้นเทาอ่อน คั่นตัวเองออกจากหัวเรื่องและตาราง
       * ซ้าย = เลือกว่าจะดูอะไร ขวา = ปุ่มที่ลงมือทำ
       */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="min-w-[16rem] flex-1 [&_input]:bg-white">
          <SearchInput
            value={term}
            onChange={(event) => {
              setPage(1);
              setTerm(event.target.value);
            }}
            placeholder="ชื่อ รหัสพนักงาน หรือเลขที่คำสั่ง"
            aria-label="ค้นหาใบโยกย้าย"
          />
        </div>

        <div className="w-[11rem] shrink-0">
          <Select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as StatusFilter);
            }}
            aria-label="สถานะ"
          >
            <option value="">ทุกสถานะ</option>
            <option value="SCHEDULED">รอถึงวันมีผล</option>
            <option value="APPLIED">มีผลแล้ว</option>
            <option value="CANCELLED">ยกเลิก</option>
          </Select>
        </div>

        <div className="w-[13rem] shrink-0">
          <Select
            value={branchId}
            onChange={(event) => {
              setPage(1);
              setBranchId(event.target.value);
            }}
            aria-label="สาขา"
          >
            <option value="">ทุกสาขา</option>
            {options.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nameTh}
              </option>
            ))}
          </Select>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
            onClick={() => void loadTransfers()}
          >
            รีเฟรช
          </Button>

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreateOpen(true)}
          >
            ออกใบโยกย้าย
          </Button>
        </div>
      </div>

      {error ? (
        <div className="px-6 pt-4 sm:px-7 3xl:px-8">
          <Notice tone="critical">{error}</Notice>
        </div>
      ) : null}

      {/*
       * รายการทีละใบ ไม่ใช่ตาราง — ใบหนึ่งใบมีได้หลายการเปลี่ยนแปลง (สาขา แผนก ตำแหน่ง)
       * ยัดลงคอลัมน์เดียวแล้วความสูงของแถวไม่เท่ากันจนตารางดูขาดจังหวะ
       */}
      <div className="divide-y divide-slate-200">
        {loading && items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ยังไม่มีใบโยกย้าย
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              กด &ldquo;ออกใบโยกย้าย&rdquo; เพื่อตั้งคำสั่งย้ายสาขา ย้ายแผนก
              หรือเลื่อนตำแหน่งไว้ล่วงหน้า
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                ออกใบโยกย้าย
              </Button>
            </div>
          </div>
        ) : (
          items.map((row) => (
            <TransferRow
              key={row.id}
              row={row}
              onApplyNow={() => askApplyNow(row)}
              onCancel={() => askCancel(row)}
            />
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
          <p className="text-[12px] text-slate-500 3xl:text-[13px]">
            หน้า {count(meta.page)} จาก {count(meta.totalPages)} ·{" "}
            {count(meta.total)} รายการ
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => {
                setPage((current) => current + 1);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      <CreateTransferModal
        open={createOpen}
        options={options}
        loading={saving}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />
    </PageSurface>
  );
}
