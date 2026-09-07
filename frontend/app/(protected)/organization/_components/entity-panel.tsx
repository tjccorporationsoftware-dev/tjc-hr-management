"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Edit3,
  Image as ImageIcon,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  Badge,
  Button,
  Field,
  FieldGrid,
  Modal,
  Notice,
  RowMenu,
  joinClassName,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  Toggle,
} from "@/components/kit";
import {
  ApiClientError,
  apiFetch,
  apiFetchWithMeta,
  getPublicFileUrl,
} from "@/lib/api";
import { CatalogPickerModal, type CatalogKind } from "./catalog-picker-modal";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import type {
  BranchItem,
  CompanyItem,
  DepartmentItem,
  DivisionItem,
  EmployeeTypeItem,
  MasterStatus,
  OrganizationTabKey,
  PaginationMeta,
  PositionItem,
} from "@/types/organization";

/**
 * แท็บข้อมูลย่อยที่ใช้แบบฟอร์ม CRUD หน้าตาเดียวกัน
 * (companies มีหน้าตัวเองแล้วใน company-panel, approval-matrices ไม่มีปุ่มเรียกใช้จริง
 * ในหน้านี้จึงตัดออกไปพร้อมกับการรวมหน้า — ดู HANDOFF/รายงานการแปลงสำหรับรายละเอียด)
 */
export type EntityTabKey = Extract<
  OrganizationTabKey,
  "branches" | "departments" | "divisions" | "positions" | "employee-types"
>;

type EntityItem =
  BranchItem | DepartmentItem | DivisionItem | PositionItem | EmployeeTypeItem;

type ModalMode = "create" | "edit";
type ModalState = { mode: ModalMode; item?: EntityItem };

const endpointMap: Record<EntityTabKey, string> = {
  branches: "/organization/branches",
  departments: "/organization/departments",
  divisions: "/organization/divisions",
  positions: "/organization/positions",
  "employee-types": "/organization/employee-types",
};

const tabTitleMap: Record<EntityTabKey, string> = {
  branches: "สาขา",
  departments: "แผนก",
  divisions: "ฝ่าย/กลุ่มงาน",
  positions: "ตำแหน่ง",
  "employee-types": "ประเภทพนักงาน",
};

const positionLevelOptions = [
  { value: "1", label: "Level 1 - ผู้บริหารสูงสุด" },
  { value: "2", label: "Level 2 - ผู้บริหารระดับสูง" },
  { value: "3", label: "Level 3 - ผู้บริหาร / Head" },
  { value: "4", label: "Level 4 - Manager" },
  { value: "5", label: "Level 5 - Supervisor / Lead" },
  { value: "6", label: "Level 6 - Senior Officer" },
  { value: "7", label: "Level 7 - Officer / Staff" },
  { value: "8", label: "Level 8 - Operation / Support" },
  { value: "9", label: "Level 9 - Trainee / Temporary" },
];

/** ป้ายระดับตำแหน่งแบบอ่านออก — ตำแหน่งที่ยังไม่ตั้งระดับจะไปอยู่ท้ายตาราง */
function positionLevelLabel(level?: number | null) {
  if (level === null || level === undefined) return "ยังไม่ระบุระดับ";

  return (
    positionLevelOptions.find((option) => option.value === String(level))
      ?.label ?? `Level ${level}`
  );
}

const emptyForm: Record<string, string> = {
  code: "",
  nameTh: "",
  nameEn: "",
  address: "",
  phone: "",
  email: "",
  companyId: "",
  branchId: "",
  departmentId: "",
  description: "",
  level: "",
  status: "ACTIVE",
  /* ข้อมูลสาขาที่ใช้ทำหัวสลิปเงินเดือน */
  logoUrl: "",
  usePayslipHeader: "false",
  taxId: "",
  taxBranchNo: "",
  socialSecurityBranchNo: "",
  payslipNote: "",
};

/** ขนาดไฟล์โลโก้สูงสุดที่หลังบ้านรับ — เช็คตั้งแต่ฝั่งเว็บจะได้ไม่เสียเที่ยวอัปโหลด */
const BRANCH_LOGO_MAX_SIZE = 2 * 1024 * 1024;

export function EntityPanel({
  tab,
  companyId,
  branchId,
  departmentId,
  companies,
  branches,
  departments,
  onChanged,
}: {
  tab: EntityTabKey;
  /** ตัวกรองบริษัท/สาขา/แผนกที่ใช้ร่วมกันทุกแท็บ มาจากหน้าหลัก */
  companyId: string;
  branchId: string;
  departmentId: string;
  companies: CompanyItem[];
  /** รายการอ้างอิงเต็ม (ไม่กรองตามตัวกรองด้านบน) ใช้ประกอบตัวเลือกในฟอร์ม */
  branches: BranchItem[];
  departments: DepartmentItem[];
  /** เรียกทุกครั้งที่ข้อมูลเปลี่ยน เพื่อให้หน้าหลักรีเฟรชตัวเลขสรุป/รายการอ้างอิง */
  onChanged: () => void;
}) {
  const [items, setItems] = useState<EntityItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<MasterStatus | "">("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  /*
   * แผนก / ฝ่าย / ตำแหน่ง / ประเภทพนักงาน มีรายการมาตรฐานระดับระบบให้เลือกเปิดใช้
   * ทุกบริษัทใช้ชุดเดียวกัน จะได้ไม่ต้องพิมพ์เองใหม่ทุกบริษัทและรหัสตรงกันทั้งระบบ
   * ส่วนสาขาเป็นที่ตั้งจริงของแต่ละบริษัท ไม่มีชุดกลางให้เลือก
   */
  const supportsCatalog = tab !== "branches";
  const [catalogOpen, setCatalogOpen] = useState(false);

  // เปลี่ยนตัวกรองบริษัท/สาขา/แผนก ให้กลับไปหน้าแรกเหมือนพฤติกรรมเดิม
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตหน้าเมื่อ prop ตัวกรองจากหน้าหลักเปลี่ยน ไม่ใช่ derive จาก state ในเรนเดอร์นี้
    setPage(1);
  }, [companyId, branchId, departmentId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (companyId) params.set("companyId", companyId);
    if (tab !== "branches" && branchId) params.set("branchId", branchId);

    if (
      (tab === "divisions" ||
        tab === "positions" ||
        tab === "employee-types") &&
      departmentId
    ) {
      params.set("departmentId", departmentId);
    }

    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    return params.toString();
  }, [branchId, companyId, departmentId, page, q, status, tab]);

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);

      const result = await apiFetchWithMeta<EntityItem[], PaginationMeta>(
        `${endpointMap[tab]}?${queryString}`,
      );

      setItems(result.data);
      setMeta(result.meta ?? null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "โหลดข้อมูลไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดรายการใหม่ทุกครั้งที่ query เปลี่ยน (แพตเทิร์นเดียวกับทั้งระบบ)
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const formBranchOptions = useMemo(() => {
    if (!form.companyId) return [];
    return branches.filter((branch) => branch.companyId === form.companyId);
  }, [branches, form.companyId]);

  /**
   * แผนกผูกกับบริษัทเป็นหลัก ส่วน branchId เป็น optional
   * แผนกระดับบริษัท (branchId = null) จึงต้องเลือกได้ทุกสาขา
   * ไม่งั้น dropdown จะว่างจนสร้างฝ่าย/กลุ่มงานไม่ได้เลย
   */
  const formDepartmentOptions = useMemo(() => {
    if (!form.companyId) return [];

    return departments.filter((department) => {
      if (department.companyId !== form.companyId) return false;
      if (!department.branchId) return true;
      return !form.branchId || department.branchId === form.branchId;
    });
  }, [departments, form.branchId, form.companyId]);

  function updateForm(key: string, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "companyId") {
        next.branchId = "";
        next.departmentId = "";
      }

      if (key === "branchId") {
        next.departmentId = "";
      }

      return next;
    });
  }

  function openCreate() {
    if (!companyId) {
      toast.error("กรุณาเลือกบริษัทก่อนเพิ่มข้อมูล");
      return;
    }

    if (tab !== "branches" && !branchId) {
      toast.error(`กรุณาเลือกสาขาก่อนเพิ่ม${tabTitleMap[tab]}`);
      return;
    }

    setForm({
      ...emptyForm,
      status: "ACTIVE",
      companyId,
      branchId: tab === "branches" ? "" : branchId,
      departmentId,
      level: tab === "positions" ? "5" : "",
    });

    setModal({ mode: "create" });
  }

  function openEdit(item: EntityItem) {
    setForm(mapItemToForm(tab, item));
    setModal({ mode: "edit", item });
  }

  function closeModal() {
    setModal(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;

    const requiredMessage = validateForm(tab, modal.mode, form);
    if (requiredMessage) {
      toast.error(requiredMessage);
      return;
    }

    try {
      setSubmitting(true);

      const payload = buildPayload(tab, modal.mode, form);
      const endpoint = endpointMap[tab];

      if (modal.mode === "create") {
        await apiFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("เพิ่มข้อมูลสำเร็จ");
      } else {
        if (!modal.item) return;
        await apiFetch(`${endpoint}/${modal.item.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("แก้ไขข้อมูลสำเร็จ");
      }

      closeModal();
      await loadItems();
      onChanged();
    } catch (submitError) {
      toast.error(getErrorMessage(submitError, "บันทึกข้อมูลไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * โลโก้สาขาอัปโหลดแยกจากปุ่มบันทึก (ต้องมี id ของสาขาก่อน) — อัปเสร็จแล้ว
   * อัปเดต URL ในฟอร์มทันทีเพื่อให้เห็นรูปใหม่ โดยไม่ต้องปิดป๊อปอัพแล้วเปิดใหม่
   */
  async function handleUploadBranchLogo(file?: File | null) {
    const branchIdToUpdate = modal?.item?.id;
    if (!branchIdToUpdate || !file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    if (file.size > BRANCH_LOGO_MAX_SIZE) {
      toast.error("ขนาดไฟล์โลโก้ต้องไม่เกิน 2 MB");
      return;
    }

    const formData = new FormData();
    formData.append("logo", file);

    try {
      setLogoUploading(true);

      const branch = await apiFetch<BranchItem>(
        `/organization/branches/${branchIdToUpdate}/logo`,
        { method: "POST", body: formData },
      );

      updateForm("logoUrl", branch.logoUrl ?? "");
      toast.success("อัปเดตโลโก้สาขาแล้ว");
      await loadItems();
      onChanged();
    } catch (uploadError) {
      toast.error(getErrorMessage(uploadError, "อัปโหลดโลโก้สาขาไม่สำเร็จ"));
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleDeleteBranchLogo() {
    const branchIdToUpdate = modal?.item?.id;
    if (!branchIdToUpdate) return;

    try {
      setLogoUploading(true);

      await apiFetch(`/organization/branches/${branchIdToUpdate}/logo`, {
        method: "DELETE",
      });

      updateForm("logoUrl", "");
      toast.success("ลบโลโก้สาขาแล้ว");
      await loadItems();
      onChanged();
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, "ลบโลโก้สาขาไม่สำเร็จ"));
    } finally {
      setLogoUploading(false);
    }
  }

  function handleDelete(item: EntityItem) {
    setActionDialog({
      title: "ยืนยันการปิดใช้งานข้อมูล",
      description: `ต้องการปิดใช้งาน "${getItemTitle(tab, item)}" หรือไม่ รายการนี้จะไม่ถูกลบถาวร แต่จะถูกปิดสถานะเพื่อเก็บประวัติไว้ในระบบ`,
      confirmLabel: "ปิดใช้งาน",
      cancelLabel: "ยกเลิก",
      tone: "red",
      onConfirm: async () => {
        try {
          await apiFetch(`${endpointMap[tab]}/${item.id}`, {
            method: "DELETE",
          });
          toast.success("ปิดใช้งานข้อมูลสำเร็จ");
          await loadItems();
          onChanged();
        } catch (deleteError) {
          toast.error(getErrorMessage(deleteError, "ปิดใช้งานข้อมูลไม่สำเร็จ"));
        }
      },
    });
  }

  const total = meta?.total ?? items.length;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <>
      {/* แถบเครื่องมือพื้นเทาอ่อน ชุดเดียวกับหน้าอื่นทั้งระบบ */}
      <div className="flex flex-col justify-between gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:flex-row sm:items-center sm:px-6 3xl:px-7">
        <p className="text-[12.5px] text-slate-500 3xl:text-[13px]">
          แสดง {items.length.toLocaleString("th-TH")} จาก{" "}
          {total.toLocaleString("th-TH")} รายการ
        </p>

        <div className="flex flex-wrap items-center gap-2 [&_input]:bg-white [&_select]:bg-white">
          <SearchInput
            value={q}
            onChange={(event) => {
              setPage(1);
              setQ(event.target.value);
            }}
            placeholder="ค้นหารหัสหรือชื่อ"
            className="w-full sm:w-60"
            aria-label="ค้นหา"
          />

          <Select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as MasterStatus | "");
            }}
            className="w-full sm:w-40"
            aria-label="สถานะ"
          >
            <option value="">ทุกสถานะ</option>
            <option value="ACTIVE">เปิดใช้งาน</option>
            <option value="INACTIVE">ปิดใช้งาน</option>
          </Select>

          <Button
            onClick={loadItems}
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
          >
            รีเฟรช
          </Button>

          {supportsCatalog ? (
            <Button
              icon={<Sparkles className="h-3.5 w-3.5" />}
              onClick={() => {
                if (!companyId) {
                  toast.error("กรุณาเลือกบริษัทก่อนเลือกจากรายการมาตรฐาน");
                  return;
                }
                setCatalogOpen(true);
              }}
            >
              เลือกจากรายการมาตรฐาน
            </Button>
          ) : null}

          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={openCreate}
          >
            เพิ่ม{tabTitleMap[tab]}
          </Button>
        </div>
      </div>

      {/*
        รายการทีละใบ ไม่ใช่ตาราง — ตารางเดิมซ่อนคอลัมน์ "ชื่อภาษาอังกฤษ" กับ
        "รายละเอียด" ตามความกว้างจอ ทั้งที่ยุบเป็นบรรทัดรองใต้ชื่อได้
      */}
      {loading ? (
        <p className="px-5 py-16 text-center text-[13px] font-semibold text-slate-600">
          กำลังโหลด…
        </p>
      ) : error ? (
        <div className="px-5 py-16 text-center">
          <p className="text-[13px] font-semibold text-slate-600">{error}</p>
          <div className="mt-4 flex justify-center">
            <Button size="sm" onClick={loadItems}>
              ลองใหม่
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-[13px] font-semibold text-slate-600">
            ยังไม่มี{tabTitleMap[tab]}ตามเงื่อนไขที่เลือก
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
            ลองเปลี่ยนคำค้นหรือสถานะด้านบน หรือกดเพิ่มรายการใหม่
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {items.map((item) => {
            const reference = getReferenceText(tab, item);
            const detail = getDetailText(tab, item);
            const nameEn = getNameEn(tab, item);
            const active = item.status === "ACTIVE";
            /* สาขา แผนก และตำแหน่ง มีจำนวนพนักงานจากหลังบ้าน ที่เหลือยังไม่มี */
            const showEmployeeCount =
              tab === "branches" ||
              tab === "departments" ||
              tab === "positions";
            const employeeCount = showEmployeeCount
              ? ((item as BranchItem | DepartmentItem | PositionItem)._count
                  ?.employees ?? 0)
              : 0;

            return (
              <article
                key={item.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6 3xl:px-7"
              >
                {/*
                  แท็บสาขานำแถวด้วยโลโก้ชิ้นเดียว ส่วนรหัสไปเป็นป้ายเล็กข้างชื่อ
                  (แบบเดียวกับหัวข้อมูลบริษัท) — รหัสสาขาสั้นแค่ 3 ตัว
                  ไม่คุ้มกับบล็อกกว้าง ๆ ที่แย่งสายตาไปจากชื่อสาขา
                */}
                {tab === "branches" ? (
                  <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-brand-100 bg-white">
                    {(item as BranchItem).logoUrl ? (
                      <Image
                        src={getPublicFileUrl((item as BranchItem).logoUrl)}
                        alt={(item as BranchItem).nameTh}
                        width={72}
                        height={72}
                        unoptimized
                        className="max-h-8 w-auto object-contain"
                      />
                    ) : (
                      <ImageIcon className="h-3.5 w-3.5 text-slate-300" />
                    )}
                  </div>
                ) : (
                  /*
                    รหัสคือกุญแจที่ใช้อ้างอิงทุกที่ จึงยกมาไว้หน้าสุด
                    ตรึงความกว้างไว้ ไม่งั้นรหัสยาวไม่เท่ากัน (POS-DEV กับ POS-PRODSPEC)
                    จะดันชื่อของแต่ละแถวไปคนละตำแหน่ง
                  */
                  <span
                    title={getItemCode(tab, item) || undefined}
                    className={joinClassName(
                      "flex h-9 w-[6.5rem] shrink-0 items-center justify-center rounded-lg px-2 text-[11.5px] font-bold tabular-nums 3xl:w-[7rem] 3xl:text-[12px]",
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "bg-slate-100 text-slate-400",
                    )}
                  >
                    <span className="truncate">
                      {getItemCode(tab, item) || "-"}
                    </span>
                  </span>
                )}

                <div className="min-w-[12rem] flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
                      {getItemTitle(tab, item)}
                    </p>

                    {tab === "branches" ? (
                      <span
                        className={joinClassName(
                          "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums",
                          active
                            ? "bg-brand-50 text-brand-700"
                            : "bg-slate-100 text-slate-400",
                        )}
                      >
                        {getItemCode(tab, item) || "-"}
                      </span>
                    ) : null}

                    {/* บอกให้เห็นว่ารายการไหนมาจากชุดมาตรฐาน ไหนที่บริษัทพิมพ์เอง */}
                    {supportsCatalog && isFromCatalog(item) ? (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500">
                        มาตรฐาน
                      </span>
                    ) : null}

                    {tab === "branches" &&
                    (item as BranchItem).usePayslipHeader ? (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-brand-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
                        หัวสลิปของสาขา
                      </span>
                    ) : null}
                  </div>

                  <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
                    {[nameEn, detail].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>

                {/* ระดับตำแหน่งเป็นคอลัมน์ของตัวเอง ทุกแถวจึงเทียบระดับกันได้ในแนวตั้ง */}
                {tab === "positions" ? (
                  <div className="w-52 shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                      ระดับตำแหน่ง
                    </p>
                    <p
                      className={joinClassName(
                        "truncate text-[12.5px] font-semibold 3xl:text-[13px]",
                        (item as PositionItem).level
                          ? "text-brand-700"
                          : "text-slate-300",
                      )}
                    >
                      {positionLevelLabel((item as PositionItem).level)}
                    </p>
                  </div>
                ) : (
                  <div className="w-56 shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                      สังกัด
                    </p>
                    <p className="truncate text-[12.5px] font-semibold text-slate-800 3xl:text-[13px]">
                      {reference || "—"}
                    </p>
                  </div>
                )}

                {/*
                  สาขา/แผนกต้องรู้ว่ามีคนอยู่กี่คน ก่อนจะปิดใช้งานหรือย้ายโครงสร้าง
                */}
                {showEmployeeCount ? (
                  <div className="w-28 shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                      พนักงาน
                    </p>
                    <p
                      className={joinClassName(
                        "text-[13.5px] font-bold tabular-nums 3xl:text-[14px]",
                        employeeCount > 0 ? "text-slate-900" : "text-slate-300",
                      )}
                    >
                      {employeeCount.toLocaleString("th-TH")} คน
                    </p>
                  </div>
                ) : null}

                <div className="w-28 shrink-0">
                  <Badge tone={active ? "positive" : "neutral"}>
                    {active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  </Badge>
                </div>

                <div className="flex w-8 shrink-0 justify-end">
                  <RowMenu
                    items={[
                      {
                        label: "แก้ไข",
                        icon: <Edit3 className="h-4 w-4" />,
                        onSelect: () => openEdit(item),
                      },
                      ...(active
                        ? [
                            {
                              label: "ปิดใช้งาน",
                              icon: <Trash2 className="h-4 w-4" />,
                              tone: "danger" as const,
                              separated: true,
                              onSelect: () => handleDelete(item),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !error && items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <span className="text-[13px] text-slate-400">
            หน้า {page.toLocaleString("th-TH")} จาก{" "}
            {totalPages.toLocaleString("th-TH")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((value) => Math.max(value - 1, 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((value) => value + 1);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      {modal ? (
        <Modal
          open
          title={`${modal.mode === "create" ? "เพิ่ม" : "แก้ไข"}${tabTitleMap[tab]}`}
          description="ช่องที่มีเครื่องหมาย * ต้องกรอก"
          size={tab === "positions" || tab === "branches" ? "lg" : "md"}
          onClose={closeModal}
        >
          <form onSubmit={handleSubmit}>
            <EntityFormFields
              tab={tab}
              mode={modal.mode}
              form={form}
              companies={companies}
              branchOptions={formBranchOptions}
              departmentOptions={formDepartmentOptions}
              updateForm={updateForm}
              logoUploading={logoUploading}
              onUploadLogo={handleUploadBranchLogo}
              onDeleteLogo={handleDeleteBranchLogo}
            />

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button type="button" onClick={closeModal} disabled={submitting}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                บันทึกข้อมูล
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {supportsCatalog ? (
        <CatalogPickerModal
          kind={tab as CatalogKind}
          companyId={companyId}
          open={catalogOpen}
          onClose={() => setCatalogOpen(false)}
          onApplied={async () => {
            await loadItems();
            onChanged();
          }}
        />
      ) : null}

      <ActionDialog
        state={actionDialog}
        onClose={() => setActionDialog(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* form fields                                                         */
/* ------------------------------------------------------------------ */

function EntityFormFields({
  tab,
  mode,
  form,
  companies,
  branchOptions,
  departmentOptions,
  updateForm,
  logoUploading,
  onUploadLogo,
  onDeleteLogo,
}: {
  tab: EntityTabKey;
  mode: ModalMode;
  form: Record<string, string>;
  companies: CompanyItem[];
  branchOptions: BranchItem[];
  departmentOptions: DepartmentItem[];
  updateForm: (key: string, value: string) => void;
  /* ใช้เฉพาะแท็บสาขา — โลโก้อัปโหลดแยกจากปุ่มบันทึก */
  logoUploading: boolean;
  onUploadLogo: (file?: File | null) => void;
  onDeleteLogo: () => void;
}) {
  const showCode = mode === "create";

  if (tab === "branches") {
    return (
      <div className="space-y-4">
        <FieldGrid columns={2}>
          {mode === "create" ? (
            <Field label="บริษัท" required>
              <Select
                value={form.companyId}
                onChange={(event) =>
                  updateForm("companyId", event.target.value)
                }
                required
              >
                <option value="">เลือกบริษัท</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nameTh}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {showCode ? (
            <Field label="รหัสสาขา" required>
              <TextInput
                value={form.code}
                onChange={(event) => updateForm("code", event.target.value)}
                placeholder="HQ"
                required
              />
            </Field>
          ) : null}

          <Field label="ชื่อสาขาภาษาไทย" required>
            <TextInput
              value={form.nameTh}
              onChange={(event) => updateForm("nameTh", event.target.value)}
              placeholder="สำนักงานใหญ่"
              required
            />
          </Field>

          <Field label="ชื่อสาขาภาษาอังกฤษ">
            <TextInput
              value={form.nameEn}
              onChange={(event) => updateForm("nameEn", event.target.value)}
              placeholder="Head Office"
            />
          </Field>

        </FieldGrid>

        <BranchDocumentFields
          mode={mode}
          form={form}
          updateForm={updateForm}
          logoUploading={logoUploading}
          onUploadLogo={onUploadLogo}
          onDeleteLogo={onDeleteLogo}
        />

        {mode === "edit" ? (
          <StatusField form={form} updateForm={updateForm} />
        ) : null}
      </div>
    );
  }

  if (tab === "departments") {
    return (
      <div className="space-y-4">
        <FieldGrid columns={2}>
          {mode === "create" ? (
            <Field label="บริษัท" required>
              <Select
                value={form.companyId}
                onChange={(event) =>
                  updateForm("companyId", event.target.value)
                }
                required
              >
                <option value="">เลือกบริษัท</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nameTh}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="สาขา" required>
            <Select
              value={form.branchId}
              onChange={(event) => updateForm("branchId", event.target.value)}
              required
            >
              <option value="">เลือกสาขา</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.nameTh}
                </option>
              ))}
            </Select>
          </Field>

          {showCode ? (
            <Field label="รหัสแผนก" required>
              <TextInput
                value={form.code}
                onChange={(event) => updateForm("code", event.target.value)}
                placeholder="HR"
                required
              />
            </Field>
          ) : null}

          <Field label="ชื่อแผนกภาษาไทย" required>
            <TextInput
              value={form.nameTh}
              onChange={(event) => updateForm("nameTh", event.target.value)}
              placeholder="ฝ่ายทรัพยากรบุคคล"
              required
            />
          </Field>

          <Field label="ชื่อแผนกภาษาอังกฤษ">
            <TextInput
              value={form.nameEn}
              onChange={(event) => updateForm("nameEn", event.target.value)}
              placeholder="Human Resources"
            />
          </Field>
        </FieldGrid>

        {mode === "edit" ? (
          <StatusField form={form} updateForm={updateForm} />
        ) : null}
      </div>
    );
  }

  if (tab === "divisions") {
    return (
      <div className="space-y-4">
        <FieldGrid columns={2}>
          {mode === "create" ? (
            <Field label="แผนก" required>
              <Select
                value={form.departmentId}
                onChange={(event) =>
                  updateForm("departmentId", event.target.value)
                }
                required
              >
                <option value="">เลือกแผนก</option>
                {departmentOptions.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.nameTh}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {showCode ? (
            <Field label="รหัสฝ่าย/กลุ่มงาน" required>
              <TextInput
                value={form.code}
                onChange={(event) => updateForm("code", event.target.value)}
                placeholder="HR-OPS"
                required
              />
            </Field>
          ) : null}

          <Field label="ชื่อฝ่าย/กลุ่มงานภาษาไทย" required>
            <TextInput
              value={form.nameTh}
              onChange={(event) => updateForm("nameTh", event.target.value)}
              required
            />
          </Field>

          <Field label="ชื่อฝ่าย/กลุ่มงานภาษาอังกฤษ">
            <TextInput
              value={form.nameEn}
              onChange={(event) => updateForm("nameEn", event.target.value)}
            />
          </Field>
        </FieldGrid>

        {mode === "edit" ? (
          <StatusField form={form} updateForm={updateForm} />
        ) : null}
      </div>
    );
  }

  if (tab === "positions") {
    return (
      <div className="space-y-4">
        <Notice tone="info">
          <span className="font-semibold">ระดับตำแหน่ง</span>{" "}
          เป็นตัวจัดลำดับตำแหน่งทั้งระบบ — ทั้งการเรียงในตาราง ผังองค์กร
          และการหาผู้อนุมัติตามสายงาน ระดับน้อยคือตำแหน่งสูงกว่า
        </Notice>

        <FieldGrid columns={2}>
          {showCode ? (
            <Field label="รหัสตำแหน่ง" required>
              <TextInput
                value={form.code}
                onChange={(event) => updateForm("code", event.target.value)}
                placeholder="เช่น HR-MANAGER"
                required
              />
            </Field>
          ) : null}

          <Field label="ชื่อตำแหน่งภาษาไทย" required>
            <TextInput
              value={form.nameTh}
              onChange={(event) => updateForm("nameTh", event.target.value)}
              placeholder="เช่น ผู้จัดการฝ่ายทรัพยากรบุคคล"
              required
            />
          </Field>

          <Field label="ชื่อตำแหน่งภาษาอังกฤษ">
            <TextInput
              value={form.nameEn}
              onChange={(event) => updateForm("nameEn", event.target.value)}
              placeholder="เช่น HR Manager"
            />
          </Field>

          <Field
            label="ระดับตำแหน่ง"
            required
            hint="ใช้เรียงลำดับทั้งระบบ ถ้าไม่ระบุตำแหน่งจะไปอยู่ท้ายสุด"
          >
            <Select
              value={form.level}
              onChange={(event) => updateForm("level", event.target.value)}
            >
              {positionLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGrid>

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] leading-5 text-slate-500">
          ตัวอย่าง: กรรมการผู้จัดการใช้ Level 1 · ผู้จัดการใช้ Level 4 ·
          หัวหน้าทีมใช้ Level 5 · พนักงานใช้ Level 7
        </p>

        <Field label="คำอธิบาย">
          <Textarea
            value={form.description}
            onChange={(event) => updateForm("description", event.target.value)}
            placeholder="ระบุหน้าที่หรือคำอธิบายตำแหน่งแบบสั้น ๆ"
          />
        </Field>

        {mode === "edit" ? (
          <StatusField form={form} updateForm={updateForm} />
        ) : null}
      </div>
    );
  }

  // employee-types
  return (
    <div className="space-y-4">
      <FieldGrid columns={2}>
        {showCode ? (
          <Field label="รหัสประเภทพนักงาน" required>
            <TextInput
              value={form.code}
              onChange={(event) => updateForm("code", event.target.value)}
              placeholder="MONTHLY"
              required
            />
          </Field>
        ) : null}

        <Field label="ชื่อประเภทพนักงานภาษาไทย" required>
          <TextInput
            value={form.nameTh}
            onChange={(event) => updateForm("nameTh", event.target.value)}
            required
          />
        </Field>

        <Field label="ชื่อประเภทพนักงานภาษาอังกฤษ">
          <TextInput
            value={form.nameEn}
            onChange={(event) => updateForm("nameEn", event.target.value)}
          />
        </Field>
      </FieldGrid>

      <Field label="คำอธิบาย">
        <Textarea
          value={form.description}
          onChange={(event) => updateForm("description", event.target.value)}
        />
      </Field>

      {mode === "edit" ? (
        <StatusField form={form} updateForm={updateForm} />
      ) : null}
    </div>
  );
}

/**
 * ที่ตั้งสาขาและข้อมูลที่ไปโผล่บนสลิปเงินเดือน
 * -------------------------------------------
 * สาขาที่ออกเอกสารในนามตัวเอง (คนละที่ตั้ง คนละเบอร์ติดต่อกับสำนักงานใหญ่)
 * ตั้งหัวสลิปของตัวเองได้ที่นี่ ช่องไหนเว้นว่างระบบจะถอยไปใช้ค่าของบริษัทให้เอง
 * จึงกรอกเฉพาะช่องที่ต่างจากบริษัทก็พอ
 *
 * ที่ตั้ง/เบอร์/อีเมล ถูกยกมารวมในกล่องนี้ทั้งชุด เพราะทั้งหมดคือบรรทัดเดียวกัน
 * บนหัวเอกสาร — เดิมกระจายอยู่คนละที่จนหาช่องที่อยู่ไม่เจอ
 */
function BranchDocumentFields({
  mode,
  form,
  updateForm,
  logoUploading,
  onUploadLogo,
  onDeleteLogo,
}: {
  mode: ModalMode;
  form: Record<string, string>;
  updateForm: (key: string, value: string) => void;
  logoUploading: boolean;
  onUploadLogo: (file?: File | null) => void;
  onDeleteLogo: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoUrl = form.logoUrl ? getPublicFileUrl(form.logoUrl) : "";
  const usePayslipHeader = form.usePayslipHeader === "true";

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <p className="text-[13px] font-bold text-slate-900">
        ที่ตั้งสาขาและข้อมูลบนสลิปเงินเดือน
      </p>
      <p className="mt-0.5 text-[12px] leading-5 text-slate-500">
        เปิดสวิตช์แล้วสลิปของพนักงานสาขานี้จะใช้โลโก้ ชื่อ ที่ตั้ง
        และช่องทางติดต่อในกล่องนี้แทนของบริษัท
        ช่องไหนไม่ได้กรอกจะใช้ของบริษัทเหมือนเดิม
      </p>

      <div className="mt-3 border-t border-brand-100 pt-1">
        <Toggle
          checked={usePayslipHeader}
          onChange={(next) =>
            updateForm("usePayslipHeader", next ? "true" : "false")
          }
          label="ใช้ข้อมูลสาขานี้เป็นหัวสลิป"
          hint="ปิดไว้ = ใช้หัวสลิปของบริษัทเหมือนเดิม"
        />
      </div>

      {/* โลโก้ต้องมี id ของสาขาก่อนจึงอัปโหลดได้ ตอนสร้างใหม่จึงบอกให้มาทำทีหลัง */}
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-brand-100 pt-4">
        <div className="grid h-[62px] w-[110px] shrink-0 place-items-center overflow-hidden rounded-xl border border-brand-100 bg-white">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={form.nameTh || "โลโก้สาขา"}
              width={200}
              height={100}
              unoptimized
              className="max-h-[52px] w-auto object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-300">
              <ImageIcon className="h-5 w-5" />
              <span className="text-[10.5px] font-semibold">ยังไม่มีโลโก้</span>
            </div>
          )}
        </div>

        {mode === "create" ? (
          <p className="min-w-[12rem] flex-1 text-[12px] leading-5 text-slate-500">
            อัปโหลดโลโก้ได้หลังบันทึกสาขาแล้ว — กดแก้ไขสาขานี้อีกครั้งเพื่ออัปโหลด
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                onUploadLogo(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              icon={<Upload className="h-3.5 w-3.5" />}
              loading={logoUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {logoUrl ? "เปลี่ยนโลโก้สาขา" : "อัปโหลดโลโก้สาขา"}
            </Button>

            {logoUrl ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                disabled={logoUploading}
                onClick={onDeleteLogo}
              >
                ลบโลโก้
              </Button>
            ) : null}

            <span className="text-[11.5px] text-slate-400">
              JPG, PNG หรือ WEBP ไม่เกิน 2 MB
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-brand-100 pt-4">
        <Field
          label="ที่ตั้งสาขา"
          hint="ที่อยู่เต็มตามที่ต้องการให้พิมพ์บนหัวสลิปและเอกสารของสาขา"
        >
          <Textarea
            value={form.address}
            onChange={(event) => updateForm("address", event.target.value)}
            rows={3}
            placeholder="เลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
          />
        </Field>

        <FieldGrid className="mt-4" columns={2}>
          <Field label="เบอร์โทรสาขา" hint="เว้นว่าง = ใช้เบอร์ของบริษัท">
            <TextInput
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
            />
          </Field>

          <Field label="อีเมลสาขา" hint="เว้นว่าง = ใช้อีเมลของบริษัท">
            <TextInput
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
            />
          </Field>
        </FieldGrid>
      </div>

      <div className="mt-4 border-t border-brand-100 pt-4">
        <FieldGrid columns={2}>
          <Field
            label="เลขประจำตัวผู้เสียภาษี"
            hint="เว้นว่าง = ใช้เลขของบริษัท"
          >
            <TextInput
              value={form.taxId}
              onChange={(event) => updateForm("taxId", event.target.value)}
              placeholder="0000000000000"
            />
          </Field>

          <Field label="เลขที่สาขา (ภาษี)" hint="00000 = สำนักงานใหญ่">
            <TextInput
              value={form.taxBranchNo}
              onChange={(event) =>
                updateForm("taxBranchNo", event.target.value)
              }
              placeholder="00000"
            />
          </Field>

          <Field
            label="ลำดับที่สาขา (ประกันสังคม)"
            hint="ลำดับสาขาของนายจ้างในระบบประกันสังคม เช่น 001"
          >
            <TextInput
              value={form.socialSecurityBranchNo}
              onChange={(event) =>
                updateForm("socialSecurityBranchNo", event.target.value)
              }
              placeholder="000"
            />
          </Field>
        </FieldGrid>

        <Field
          className="mt-4"
          label="หมายเหตุท้ายสลิป"
          hint="ข้อความสั้น ๆ ต่อท้ายบรรทัดล่างสุดของสลิป เช่น ช่องทางติดต่อฝ่ายบุคคลประจำสาขา"
        >
          <TextInput
            value={form.payslipNote}
            onChange={(event) => updateForm("payslipNote", event.target.value)}
            placeholder="สอบถามฝ่ายบุคคลสาขา โทร. 0X-XXX-XXXX"
          />
        </Field>
      </div>
    </div>
  );
}

function StatusField({
  form,
  updateForm,
}: {
  form: Record<string, string>;
  updateForm: (key: string, value: string) => void;
}) {
  return (
    <Field label="สถานะ" className="max-w-xs">
      <Select
        value={form.status ?? "ACTIVE"}
        onChange={(event) => updateForm("status", event.target.value)}
      >
        <option value="ACTIVE">เปิดใช้งาน</option>
        <option value="INACTIVE">ปิดใช้งาน</option>
      </Select>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* validation / payload / mapping                                      */
/* ------------------------------------------------------------------ */

function validateForm(
  tab: EntityTabKey,
  mode: ModalMode,
  form: Record<string, string>,
) {
  if (mode === "create" && !form.code.trim()) {
    return "กรุณากรอกรหัสข้อมูล";
  }

  if (!form.nameTh.trim()) {
    return "กรุณากรอกชื่อภาษาไทย";
  }

  if (tab === "branches" && !form.companyId) {
    return "กรุณาเลือกบริษัทก่อนบันทึกสาขา";
  }

  if (tab === "departments") {
    if (!form.companyId) return "กรุณาเลือกบริษัทก่อนบันทึกแผนก";
    if (!form.branchId) return "กรุณาเลือกสาขาก่อนบันทึกแผนก";
  }

  /*
   * เช็คเฉพาะตอนสร้างใหม่
   * ผู้ใช้ระดับ GLOBAL ไม่มีบริษัทติดตัว ตอนสร้างจึงต้องรู้ว่าจะสร้างเข้าบริษัทไหน
   * ซึ่งมาจากช่อง "บริษัท" ที่หัวหน้า ไม่ใช่ในฟอร์ม
   *
   * แต่ตอนแก้ไข ฟอร์มไม่ได้เก็บ companyId ไว้ (และไม่จำเป็น เพราะย้ายบริษัทไม่ได้
   * — payload ตอนแก้ไขก็ไม่ได้ส่ง companyId ไปด้วย) เช็คตรงนี้จึงเด้ง
   * "กรุณาเลือกบริษัท" ทุกครั้งที่กดบันทึก ทั้งที่ไม่มีช่องให้เลือกในป๊อปอัพเลย
   */
  if (
    mode === "create" &&
    (tab === "positions" || tab === "employee-types") &&
    !form.companyId
  ) {
    return "กรุณาเลือกบริษัทก่อนบันทึกข้อมูล";
  }

  if (tab === "divisions" && !form.departmentId) {
    return "กรุณาเลือกแผนกในสาขานี้ก่อนบันทึกฝ่าย/กลุ่มงาน";
  }

  return "";
}

function buildPayload(
  tab: EntityTabKey,
  mode: ModalMode,
  form: Record<string, string>,
) {
  if (tab === "branches") {
    return {
      ...(mode === "create"
        ? { companyId: form.companyId, code: form.code }
        : {}),
      nameTh: form.nameTh,
      nameEn: form.nameEn || undefined,
      address: form.address || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      /*
       * ข้อมูลหัวสลิปของสาขา — ส่งสตริงว่างเมื่อผู้ใช้ลบข้อความทิ้ง
       * (undefined = ไม่แตะช่องนั้น หลังบ้านจะเก็บค่าเดิมไว้ ลบไม่ออก)
       */
      usePayslipHeader: form.usePayslipHeader === "true",
      ...(mode === "edit"
        ? {
            taxId: form.taxId,
            taxBranchNo: form.taxBranchNo,
            socialSecurityBranchNo: form.socialSecurityBranchNo,
            payslipNote: form.payslipNote,
            status: form.status,
          }
        : {
            taxId: form.taxId || undefined,
            taxBranchNo: form.taxBranchNo || undefined,
            socialSecurityBranchNo: form.socialSecurityBranchNo || undefined,
            payslipNote: form.payslipNote || undefined,
          }),
    };
  }

  if (tab === "departments") {
    return {
      ...(mode === "create"
        ? { companyId: form.companyId, code: form.code }
        : {}),
      branchId: form.branchId || undefined,
      nameTh: form.nameTh,
      nameEn: form.nameEn || undefined,
      ...(mode === "edit" ? { status: form.status } : {}),
    };
  }

  if (tab === "divisions") {
    return {
      ...(mode === "create"
        ? { departmentId: form.departmentId, code: form.code }
        : {}),
      nameTh: form.nameTh,
      nameEn: form.nameEn || undefined,
      ...(mode === "edit" ? { status: form.status } : {}),
    };
  }

  if (tab === "positions") {
    return {
      ...(mode === "create"
        ? { companyId: form.companyId, code: form.code }
        : {}),
      nameTh: form.nameTh,
      nameEn: form.nameEn || undefined,
      description: form.description || undefined,
      level: form.level ? Number(form.level) : undefined,
      ...(mode === "edit" ? { status: form.status } : {}),
    };
  }

  // employee-types
  return {
    ...(mode === "create"
      ? { companyId: form.companyId, code: form.code }
      : {}),
    nameTh: form.nameTh,
    nameEn: form.nameEn || undefined,
    description: form.description || undefined,
    ...(mode === "edit" ? { status: form.status } : {}),
  };
}

function mapItemToForm(tab: EntityTabKey, item: EntityItem) {
  const base = {
    ...emptyForm,
    code: getItemCode(tab, item),
    nameTh: getItemTitle(tab, item),
    nameEn: getNameEn(tab, item),
    status: item.status,
  };

  if (tab === "branches") {
    const branch = item as BranchItem;
    return {
      ...base,
      companyId: branch.companyId,
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      email: branch.email ?? "",
      logoUrl: branch.logoUrl ?? "",
      usePayslipHeader: branch.usePayslipHeader ? "true" : "false",
      taxId: branch.taxId ?? "",
      taxBranchNo: branch.taxBranchNo ?? "",
      socialSecurityBranchNo: branch.socialSecurityBranchNo ?? "",
      payslipNote: branch.payslipNote ?? "",
    };
  }

  if (tab === "departments") {
    const department = item as DepartmentItem;
    return {
      ...base,
      companyId: department.companyId,
      branchId: department.branchId ?? "",
    };
  }

  if (tab === "divisions") {
    const division = item as DivisionItem;
    return {
      ...base,
      departmentId: division.departmentId,
    };
  }

  if (tab === "positions") {
    const position = item as PositionItem;
    return {
      ...base,
      description: position.description ?? "",
      level:
        position.level !== null && position.level !== undefined
          ? String(position.level)
          : "",
    };
  }

  const employeeType = item as EmployeeTypeItem;
  return {
    ...base,
    description: employeeType.description ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* display helpers                                                     */
/* ------------------------------------------------------------------ */

/** รายการที่มาจากชุดมาตรฐานของระบบ (สาขาไม่มีชุดมาตรฐาน จึงเป็น false เสมอ) */
function isFromCatalog(item: EntityItem) {
  return Boolean((item as Exclude<EntityItem, BranchItem>).catalogId);
}

function getItemCode(tab: EntityTabKey, item: EntityItem) {
  if (tab === "branches") return (item as BranchItem).code;
  if (tab === "departments") return (item as DepartmentItem).code;
  if (tab === "divisions") return (item as DivisionItem).code;
  if (tab === "positions") return (item as PositionItem).code;
  return (item as EmployeeTypeItem).code;
}

function getItemTitle(tab: EntityTabKey, item: EntityItem) {
  if (tab === "branches") return (item as BranchItem).nameTh;
  if (tab === "departments") return (item as DepartmentItem).nameTh;
  if (tab === "divisions") return (item as DivisionItem).nameTh;
  if (tab === "positions") return (item as PositionItem).nameTh;
  return (item as EmployeeTypeItem).nameTh;
}

function getNameEn(tab: EntityTabKey, item: EntityItem) {
  if (tab === "branches") return (item as BranchItem).nameEn ?? "";
  if (tab === "departments") return (item as DepartmentItem).nameEn ?? "";
  if (tab === "divisions") return (item as DivisionItem).nameEn ?? "";
  if (tab === "positions") return (item as PositionItem).nameEn ?? "";
  return (item as EmployeeTypeItem).nameEn ?? "";
}

function getReferenceText(tab: EntityTabKey, item: EntityItem) {
  if (tab === "branches") {
    const branch = item as BranchItem;
    return branch.company?.nameTh ?? "-";
  }

  if (tab === "departments") {
    const department = item as DepartmentItem;
    const company = department.company?.nameTh ?? "-";
    const branch = department.branch?.nameTh ?? "ไม่ระบุสาขา";
    return `${company} / ${branch}`;
  }

  if (tab === "divisions") {
    const division = item as DivisionItem;
    if (!division.department) return "-";
    const company = division.department.company?.nameTh ?? "ไม่ระบุบริษัท";
    const branch = division.department.branch?.nameTh ?? "ไม่ระบุสาขา";
    return `${company} / ${branch} / ${division.department.nameTh}`;
  }

  if (tab === "positions") {
    const position = item as PositionItem;
    return `พนักงานที่ใช้ ${position._count?.employees ?? 0} คน`;
  }

  const employeeType = item as EmployeeTypeItem;
  return `พนักงานที่ใช้ ${employeeType._count?.employees ?? 0} คน`;
}

function getDetailText(tab: EntityTabKey, item: EntityItem) {
  if (tab === "branches") {
    const branch = item as BranchItem;
    const departmentCount = branch._count?.departments ?? 0;

    return (
      [
        departmentCount > 0
          ? `${departmentCount.toLocaleString("th-TH")} แผนก`
          : null,
        branch.phone || branch.email || branch.address,
      ]
        .filter(Boolean)
        .join(" · ") || "-"
    );
  }

  if (tab === "departments") {
    const department = item as DepartmentItem;
    const divisionCount = department._count?.divisions ?? 0;

    return divisionCount > 0
      ? `${divisionCount.toLocaleString("th-TH")} ฝ่าย/กลุ่มงาน`
      : "-";
  }

  if (tab === "positions") {
    /*
     * เดิมไม่มีคำอธิบายก็เขียน "คลิกแก้ไขเพื่อปรับลำดับ..." ทุกแถว
     * ข้อความเดียวกันซ้ำสิบกว่าบรรทัดกลายเป็นเสียงรบกวน ไม่ใช่ข้อมูล
     */
    return (item as PositionItem).description || "-";
  }

  if (tab === "employee-types") {
    const employeeType = item as EmployeeTypeItem;
    return employeeType.description ?? "-";
  }

  return "-";
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) return error.message;
  return fallbackMessage;
}
