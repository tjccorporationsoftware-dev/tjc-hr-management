"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Eye,
  MessageSquareWarning,
  Plus,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import { useAuth } from "@/contexts/auth-context";

import {
  closeComplaint,
  createComplaint,
  getComplaints,
  getDocumentEmployees,
  getOrganizationBranches,
  processComplaint,
  resolveComplaint,
} from "@/lib/api";

import type { Complaint, ComplaintStatus } from "@/types/document-workflow";
import type { EmployeeListItem } from "@/types/employee";
import type { BranchItem } from "@/types/organization";

import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDateTime } from "@/lib/date-format";

import { scrollPagerToTop } from "@/lib/scroll-to-top";
import {
  Badge,
  Button,
  Field,
  IconButton,
  Modal,
  ModalActions,
  Notice,
  RowMenu,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  type Tone,
} from "@/components/kit";

const PAGE_SIZE = 20;

/**
 * แท็บ "เรื่องร้องเรียน" — เดิมเป็นหน้า /complaints แยก ยุบมาเป็นแท็บในหน้า
 * "ศูนย์บริการพนักงาน" ข้อมูลอ่อนไหว: สร้าง/จัดการเรื่องใช้ COMPLAINT_MANAGE
 * เท่านั้น (ไม่ใช่ COMPLAINT_READ) ให้ตรงกับเงื่อนไขฝั่ง backend
 */

type ComplaintFilters = {
  search: string;
  status: "" | ComplaintStatus;
  branchId: string;
  category: string;
  dateFrom: string;
  dateTo: string;
};

type ComplaintFormState = {
  title: string;
  category: string;
  description: string;
  expectation: string;
  note: string;
};

type ComplaintActionType = "process" | "resolve" | "close";

type ComplaintActionTarget = {
  action: ComplaintActionType;
  item: Complaint;
} | null;

const emptyFilters: ComplaintFilters = {
  search: "",
  status: "",
  branchId: "",
  category: "",
  dateFrom: "",
  dateTo: "",
};

const emptyForm: ComplaintFormState = {
  title: "",
  category: "",
  description: "",
  expectation: "",
  note: "",
};

const statusOptions: { value: "" | ComplaintStatus; label: string }[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "SUBMITTED", label: "รับเรื่องแล้ว" },
  { value: "IN_PROGRESS", label: "กำลังดำเนินการ" },
  { value: "RESOLVED", label: "ดำเนินการแล้ว" },
  { value: "CLOSED", label: "ปิดเรื่อง" },
  { value: "CANCELLED", label: "ยกเลิก" },
];

export type ComplaintsSummary = {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
};

function getStatusLabel(status: ComplaintStatus) {
  return statusOptions.find((item) => item.value === status)?.label ?? status;
}

function getStatusTone(status: ComplaintStatus): Tone {
  if (status === "RESOLVED" || status === "CLOSED") return "positive";
  if (status === "IN_PROGRESS") return "brand";
  if (status === "CANCELLED") return "critical";
  return "warning";
}

function getActionTitle(action: ComplaintActionType) {
  if (action === "process") return "รับเรื่องเข้าสู่กระบวนการ";
  if (action === "resolve") return "บันทึกผลการดำเนินการ";
  return "ปิดเรื่องร้องเรียน";
}

/**
 * เรื่องร้องเรียนหนึ่งเรื่องในรายการ — บรรทัดเดียว
 * ซ้ายบอกว่าเรื่องอะไรของใคร ขวาเป็นหมวดหมู่ วันที่แจ้ง และอายุเรื่อง
 */
function ComplaintRow({
  item,
  onOpen,
  menu,
}: {
  item: Complaint;
  onOpen: () => void;
  menu: Parameters<typeof RowMenu>[0]["items"];
}) {
  const isOpen = item.status === "SUBMITTED" || item.status === "IN_PROGRESS";
  const aging = daysSince(item.submittedAt);
  const agingDays = isOpen ? aging : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <MessageSquareWarning className="h-4 w-4" />
      </span>

      <div className="min-w-[13rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[13.5px] font-bold tabular-nums text-slate-900 3xl:text-[14.5px]">
            {item.complaintNo}
          </p>
          {item.category ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
              {item.category}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
          {item.title}
        </p>
      </div>

      {/* ใครเป็นคนแจ้ง */}
      <div className="w-44 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          ผู้แจ้ง
        </p>
        <p className="break-words text-[12.5px] font-semibold text-slate-800 3xl:text-[13px]">
          {getSubmitterName(item)}
        </p>
      </div>

      <div className="flex shrink-0 items-center divide-x divide-brand-100">
        <ComplaintFact
          label="วันที่แจ้ง"
          value={formatThaiDateTime(item.submittedAt)}
        />
        <ComplaintFact
          label="ค้างมา"
          value={
            agingDays === null
              ? "-"
              : `${agingDays.toLocaleString("th-TH")} วัน`
          }
          muted={agingDays === null}
          tone={
            agingDays === null
              ? undefined
              : agingDays >= 7
                ? "critical"
                : agingDays >= 3
                  ? "warning"
                  : undefined
          }
        />
      </div>

      <div className="w-28 shrink-0">
        <Badge tone={getStatusTone(item.status)}>
          {getStatusLabel(item.status)}
        </Badge>
      </div>

      {/* กดเมนูแล้วไม่ต้องเปิดรายละเอียดตามไปด้วย */}
      <div
        className="flex w-8 shrink-0 justify-end"
        onClick={(event) => event.stopPropagation()}
      >
        <RowMenu items={menu} />
      </div>
    </article>
  );
}

/** ตัวเลขหนึ่งช่องในแถวเรื่องร้องเรียน */
function ComplaintFact({
  label,
  value,
  tone,
  muted = false,
}: {
  label: string;
  value: string;
  tone?: "warning" | "critical";
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={`whitespace-nowrap text-[12.5px] font-semibold tabular-nums 3xl:text-[13px] ${
          muted
            ? "text-slate-300"
            : tone === "critical"
              ? "text-rose-600"
              : tone === "warning"
                ? "text-amber-600"
                : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function getSubmitterName(item: Complaint) {
  const employee = item.employee;

  if (employee) {
    return (
      employee.displayName ||
      `${employee.title ?? ""}${employee.firstName} ${employee.lastName}`.trim()
    );
  }

  return item.submittedBy?.displayName ?? "ไม่ระบุผู้แจ้ง";
}

function daysSince(value?: string | null) {
  if (!value) return null;

  const submitted = new Date(value);
  if (Number.isNaN(submitted.getTime())) return null;

  const diff = Date.now() - submitted.getTime();
  return Math.max(Math.floor(diff / (1000 * 60 * 60 * 24)), 0);
}

function hasPermission(userPermissions: string[], permission: string) {
  return userPermissions.includes(permission);
}

export function ComplaintsPanel({
  onSummaryChange,
  renderTabBar,
}: {
  onSummaryChange?: (summary: ComplaintsSummary) => void;
  /** วาดแถบแท็บของหน้าให้ พร้อมรับช่องค้นหา/ปุ่มของแผงนี้ไปวางท้ายแถวเดียวกัน */
  renderTabBar?: (trailing: ReactNode) => ReactNode;
}) {
  const { user } = useAuth();
  const userPermissions = user?.permissions ?? [];

  // POST /documents/complaints ระบุ employeeId ของคนอื่นได้ (HR คีย์แทน)
  // จึงต้องใช้ COMPLAINT_MANAGE ให้ตรงกับ backend ไม่ใช่ COMPLAINT_READ
  const canCreate = hasPermission(userPermissions, "COMPLAINT_MANAGE");
  const canManage = hasPermission(userPermissions, "COMPLAINT_MANAGE");

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState<ComplaintFilters>(emptyFilters);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ComplaintFormState>(emptyForm);

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  // ว่าง = บันทึกในชื่อตัวเอง · มีค่า = HR คีย์แทนพนักงานที่เดินมาแจ้ง
  const [targetEmployeeId, setTargetEmployeeId] = useState("");

  const [detailTarget, setDetailTarget] = useState<Complaint | null>(null);
  const [actionTarget, setActionTarget] = useState<ComplaintActionTarget>(null);
  const [actionNote, setActionNote] = useState("");

  // ตัวเลข "รอรับเรื่อง / กำลังดำเนินการ / ดำเนินการแล้ว" นับจากหน้าที่โหลดอยู่
  // เท่านั้น (getComplaints ไม่ส่ง summary รวมทุกหน้ากลับมาเหมือน getDocumentRequests)
  // — คงพฤติกรรมเดิมของหน้า /complaints ไว้ตามเดิม ไม่ได้แก้เป็นยอดรวมจริง
  const openCount = complaints.filter(
    (item) => item.status === "SUBMITTED",
  ).length;
  const inProgressCount = complaints.filter(
    (item) => item.status === "IN_PROGRESS",
  ).length;
  const resolvedCount = complaints.filter(
    (item) => item.status === "RESOLVED" || item.status === "CLOSED",
  ).length;

  async function loadComplaints(nextPage = page, overrideFilters = filters) {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await getComplaints({
        page: nextPage,
        pageSize: PAGE_SIZE,
        search: overrideFilters.search.trim() || undefined,
        status: overrideFilters.status || undefined,
        branchId: overrideFilters.branchId || undefined,
        category: overrideFilters.category.trim() || undefined,
        dateFrom: overrideFilters.dateFrom || undefined,
        dateTo: overrideFilters.dateTo || undefined,
      });

      setComplaints(response.items);
      setPage(response.meta.page);
      setTotal(response.meta.total);
      setTotalPages(Math.max(response.meta.totalPages, 1));

      setDetailTarget((current) => {
        if (!current) return current;
        return response.items.find((item) => item.id === current.id) ?? current;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดเรื่องร้องเรียนไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage) return;

    getDocumentEmployees()
      .then((response) => setEmployees(response.items))
      .catch(() => setEmployees([]));
  }, [canManage]);

  useEffect(() => {
    // ผู้ใช้ scope ระดับสาขาจะได้กลับมาสาขาเดียว ตัวกรองจึงไม่หลอกว่าเลือกได้มากกว่านั้น
    getOrganizationBranches({ pageSize: 300, status: "ACTIVE" })
      .then((response) => setBranches(response.items))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      loadComplaints(1, filters);
    }, 350);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    onSummaryChange?.({
      total,
      open: openCount,
      inProgress: inProgressCount,
      resolved: resolvedCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, openCount, inProgressCount, resolvedCount]);

  function openCreateModal() {
    setForm(emptyForm);
    setTargetEmployeeId("");
    setFormOpen(true);
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      setErrorMessage("กรุณาระบุหัวข้อเรื่องร้องเรียน");
      return;
    }

    if (!form.description.trim()) {
      setErrorMessage("กรุณาระบุรายละเอียดเรื่องร้องเรียน");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createComplaint({
        employeeId: targetEmployeeId || undefined,
        title: form.title.trim(),
        category: form.category.trim() || null,
        description: form.description.trim(),
        expectation: form.expectation.trim() || null,
        note: form.note.trim() || null,
      });

      setFormOpen(false);
      await loadComplaints(1, filters);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "สร้างเรื่องร้องเรียนไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAction() {
    if (!actionTarget) return;

    const payload = { note: actionNote.trim() || undefined };

    setSaving(true);
    setErrorMessage("");

    try {
      if (actionTarget.action === "process") {
        await processComplaint(actionTarget.item.id, payload);
      }

      if (actionTarget.action === "resolve") {
        await resolveComplaint(actionTarget.item.id, payload);
      }

      if (actionTarget.action === "close") {
        await closeComplaint(actionTarget.item.id, payload);
      }

      setActionTarget(null);
      setActionNote("");
      await loadComplaints(page, filters);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "ดำเนินการเรื่องร้องเรียนไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  /* เมนูจัดการของเรื่องหนึ่งเรื่อง — เงื่อนไขสิทธิ์และสถานะยกมาจากตารางเดิมทั้งชุด */
  function buildComplaintMenu(item: Complaint) {
    return [
      {
        label: "ดูรายละเอียด",
        icon: <Eye className="h-4 w-4" />,
        onSelect: () => setDetailTarget(item),
      },
      ...(canManage && item.status === "SUBMITTED"
        ? [
            {
              label: "รับเรื่อง",
              icon: <ShieldCheck className="h-4 w-4" />,
              onSelect: () => {
                setActionTarget({ action: "process", item });
                setActionNote("");
              },
            },
          ]
        : []),
      ...(canManage &&
      (item.status === "SUBMITTED" || item.status === "IN_PROGRESS")
        ? [
            {
              label: "บันทึกผลการดำเนินการ",
              icon: <CheckCircle2 className="h-4 w-4" />,
              onSelect: () => {
                setActionTarget({ action: "resolve", item });
                setActionNote("");
              },
            },
          ]
        : []),
      ...(canManage && item.status === "RESOLVED"
        ? [
            {
              label: "ปิดเรื่อง",
              icon: <X className="h-4 w-4" />,
              separated: true,
              onSelect: () => {
                setActionTarget({ action: "close", item });
                setActionNote("");
              },
            },
          ]
        : []),
    ];
  }

  /* ท้ายแถวแท็บ — ค้นหา รีเฟรช และปุ่มหลักของหน้า */
  const tabTrailing = (
    <div className="flex items-center gap-2 pb-2 sm:pb-0">
      <SearchInput
        value={filters.search}
        onChange={(event) =>
          setFilters((current) => ({ ...current, search: event.target.value }))
        }
        placeholder="เลขที่เรื่อง หัวข้อ รายละเอียด"
        aria-label="ค้นหาเรื่องร้องเรียน"
        className="w-full sm:w-72 3xl:w-80"
      />

      <IconButton
        title="โหลดข้อมูลใหม่"
        icon={<RefreshCcw className="h-4 w-4" />}
        onClick={() => void loadComplaints(page, filters)}
      />

      {canCreate ? (
        <Button
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={openCreateModal}
        >
          บันทึกเรื่องใหม่
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      {renderTabBar ? renderTabBar(tabTrailing) : null}

      {/* ตัวกรองแถวเดียว 4 คอลัมน์เท่ากัน โครงเดียวกับแท็บหนังสือรับรอง */}
      <div className="grid gap-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:grid-cols-2 sm:px-7 xl:grid-cols-3 3xl:px-8">
        <Select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              status: event.target.value as ComplaintFilters["status"],
            }))
          }
          className="w-full bg-white"
          aria-label="สถานะเรื่อง"
        >
          {statusOptions.map((option) => (
            <option key={option.value || "ALL"} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <TextInput
          value={filters.category}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              category: event.target.value,
            }))
          }
          placeholder="หมวดหมู่ เช่น SYSTEM / HR"
          className="bg-white"
          aria-label="หมวดหมู่"
        />

        <Select
          value={filters.branchId}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              branchId: event.target.value,
            }))
          }
          className="w-full bg-white"
          aria-label="สาขา"
        >
          <option value="">ทุกสาขา</option>
          {branches.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nameTh}
            </option>
          ))}
        </Select>

        <ThaiDateInput
          value={filters.dateFrom}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              dateFrom: event.target.value,
            }))
          }
          placeholder="แจ้งตั้งแต่วันที่"
          className="bg-white"
          aria-label="แจ้งตั้งแต่วันที่"
        />

        <ThaiDateInput
          value={filters.dateTo}
          min={filters.dateFrom || undefined}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              dateTo: event.target.value,
            }))
          }
          placeholder="ถึงวันที่"
          className="bg-white"
          aria-label="ถึงวันที่"
        />
      </div>

      {/*
       * คำเตือนเรื่องข้อมูลอ่อนไหว — เดิมเป็นกล่อง Notice เต็มความกว้างค้างอยู่บนสุด
       * ตลอดเวลา ดันตารางลงไปทุกครั้งที่เปิดแท็บ ทั้งที่เป็นข้อความคงที่ไม่เปลี่ยน
       */}
      <p className="flex items-center gap-1.5 border-b border-slate-200 bg-amber-50/50 px-6 py-2 text-[12px] text-amber-700 sm:px-7 3xl:px-8 3xl:text-[13px]">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        ข้อมูลอ่อนไหว เปิดให้เฉพาะผู้ที่มีสิทธิ์ COMPLAINT_READ เท่านั้น
      </p>

      {errorMessage ? (
        <div className="px-5 pt-4 sm:px-6 3xl:px-7">
          <Notice tone="critical">{errorMessage}</Notice>
        </div>
      ) : null}

      {/*
       * รายการทีละเรื่อง ไม่ใช่ตาราง — โครงเดียวกับแท็บหนังสือรับรอง
       * เรื่องหนึ่งเรื่องมีทั้งเลขที่ หัวข้อ ผู้แจ้ง หมวดหมู่ อายุเรื่อง และสถานะ
       */}
      <div className="divide-y divide-slate-200">
        {loading && complaints.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              กำลังโหลด…
            </p>
          </div>
        ) : complaints.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ไม่พบเรื่องร้องเรียนตามเงื่อนไข
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
              ลองเปลี่ยนสถานะ หมวดหมู่ หรือช่วงวันที่ด้านบน
            </p>
          </div>
        ) : (
          complaints.map((item) => (
            <ComplaintRow
              key={item.id}
              item={item}
              onOpen={() => setDetailTarget(item)}
              menu={buildComplaintMenu(item)}
            />
          ))
        )}
      </div>

      {!loading && complaints.length > 0 ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6 3xl:px-7">
          <span className="text-[13px] text-slate-400">
            หน้า {page.toLocaleString("th-TH")} จาก{" "}
            {totalPages.toLocaleString("th-TH")} · ทั้งหมด{" "}
            {total.toLocaleString("th-TH")} เรื่อง
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                loadComplaints(page - 1, filters);
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                loadComplaints(page + 1, filters);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <Modal
          open
          title="บันทึกเรื่องร้องเรียน / ข้อเสนอแนะ"
          description="เรื่องที่บันทึกจะถูกติดตามสถานะจนกว่าจะปิดเรื่อง"
          onClose={() => setFormOpen(false)}
        >
          <div className="space-y-4">
            <Field label="บันทึกในชื่อของ">
              <Select
                value={targetEmployeeId}
                onChange={(event) => setTargetEmployeeId(event.target.value)}
              >
                {/* ตัวเลือกแรกใส่ชื่อผู้ใช้ที่ล็อกอินไว้ด้วย ให้อ่านคู่กับรายชื่อพนักงานข้างล่างได้ */}
                <option value="">
                  {user?.displayName ? `ตนเอง · ${user.displayName}` : "ตนเอง"}
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeCode} ·{" "}
                    {employee.displayName ||
                      `${employee.title ?? ""}${employee.firstName} ${employee.lastName}`.trim()}
                  </option>
                ))}
              </Select>
              <span className="mt-1.5 block text-[11px] leading-4 text-slate-400">
                ใช้เมื่อพนักงานเดินมาแจ้งหรือโทรแจ้ง — พนักงานที่แจ้งเองใช้เมนู
                &quot;แจ้งเรื่องถึง HR&quot; ฝั่ง ESS
              </span>
            </Field>

            <Field label="หัวข้อ">
              <TextInput
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="หมวดหมู่">
              <TextInput
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                placeholder="เช่น SYSTEM / HR / WORKPLACE"
              />
            </Field>

            <Field label="รายละเอียด">
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={4}
              />
            </Field>

            <Field label="ความคาดหวัง">
              <Textarea
                value={form.expectation}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expectation: event.target.value,
                  }))
                }
                rows={4}
              />
            </Field>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <Button onClick={() => setFormOpen(false)} disabled={saving}>
                ยกเลิก
              </Button>
              <Button variant="primary" loading={saving} onClick={handleCreate}>
                บันทึกเรื่อง
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {detailTarget ? (
        <Modal
          open
          title="รายละเอียดเรื่องร้องเรียน"
          description={detailTarget.complaintNo}
          onClose={() => setDetailTarget(null)}
        >
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <DetailRow label="เลขที่เรื่อง" value={detailTarget.complaintNo} />
            <DetailRow label="หัวข้อ" value={detailTarget.title} />
            <DetailRow label="ผู้แจ้ง" value={getSubmitterName(detailTarget)} />
            <DetailRow label="หมวดหมู่" value={detailTarget.category ?? "-"} />
            <DetailRow
              label="สถานะ"
              value={
                <Badge tone={getStatusTone(detailTarget.status)}>
                  {getStatusLabel(detailTarget.status)}
                </Badge>
              }
            />
            <DetailRow
              label="วันที่แจ้ง"
              value={formatThaiDateTime(detailTarget.submittedAt)}
            />
            <DetailRow
              label="ผู้รับผิดชอบ"
              value={
                detailTarget.handledBy?.displayName ?? "ยังไม่มีผู้รับเรื่อง"
              }
            />
            <DetailRow label="รายละเอียด" value={detailTarget.description} />
            <DetailRow
              label="ความคาดหวัง"
              value={detailTarget.expectation ?? "-"}
            />
            <DetailRow label="หมายเหตุ" value={detailTarget.note ?? "-"} last />
          </div>
        </Modal>
      ) : null}

      {actionTarget ? (
        <Modal
          open
          title={getActionTitle(actionTarget.action)}
          description={`${actionTarget.item.complaintNo} · ${actionTarget.item.title}`}
          size="sm"
          onClose={() => setActionTarget(null)}
        >
          <div className="space-y-4">
            <Field label="หมายเหตุ">
              <Textarea
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
                rows={4}
              />
            </Field>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <ModalActions
                onCancel={() => setActionTarget(null)}
                onConfirm={handleAction}
                confirmLabel="ยืนยัน"
                loading={saving}
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`grid gap-1 bg-white px-4 py-3 md:grid-cols-[180px_1fr] md:gap-4 ${
        last ? "" : "border-b border-slate-200"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="text-[13px] leading-6 text-slate-800 3xl:text-[14px]">
        {value}
      </div>
    </div>
  );
}
