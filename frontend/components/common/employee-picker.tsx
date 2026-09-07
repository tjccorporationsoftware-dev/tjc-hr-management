"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { joinClassName } from "@/components/kit";

/**
 * ช่องเลือกพนักงานแบบค้นหาได้
 * --------------------------
 * เดิมทุกหน้าใช้ <select> ยัดพนักงานทุกคนลงไป พอมีพนักงานหลักร้อยคน
 * ก็หาชื่อไม่เจอ ต้องไล่เลื่อนทีละบรรทัด และเลือกผิดคนได้ง่ายเพราะชื่อซ้ำกัน
 *
 * ค้นหาที่เซิร์ฟเวอร์ (ส่ง q ไป /employees) จึงไม่ต้องโหลดพนักงานทั้งบริษัท
 * มาไว้ในหน้า และแต่ละบรรทัดบอกรหัส/ตำแหน่ง/สาขา/แผนก ให้แยกคนชื่อซ้ำออกจากกันได้
 *
 * รายการลอยทับด้วย portal ไปที่ body ไม่ใช่กางดันเนื้อหาลง เพราะช่องนี้ถูกใช้
 * ในป๊อปอัพที่เลื่อนได้ ถ้าวางไว้ในสายเดิมจะโดนกรอบป๊อปอัพตัดหาย
 */

export type PickerEmployee = {
  id: string;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  position?: string | null;
  startDate?: string | null;
  status?: string | null;
  branch?: { nameTh?: string | null } | null;
  department?: { nameTh?: string | null } | null;
};

type EmployeeListShape =
  | PickerEmployee[]
  | { items?: PickerEmployee[]; data?: PickerEmployee[] };

/** ความสูงที่กล่องต้องการ ใช้ตัดสินว่าจะกางลงหรือกางขึ้น */
const PANEL_HEIGHT = 320;

export function pickerEmployeeName(employee?: PickerEmployee | null) {
  if (!employee) return "";

  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.employeeCode ||
    ""
  );
}

function employeeMeta(employee: PickerEmployee) {
  return [
    employee.employeeCode,
    employee.position,
    employee.branch?.nameTh,
    employee.department?.nameTh,
  ]
    .filter(Boolean)
    .join(" · ");
}

type Anchor = { left: number; width: number; top?: number; bottom?: number };

export function EmployeePicker({
  value,
  onChange,
  companyId,
  /**
   * รายชื่อที่หน้าโหลดมาเองแล้ว — ใส่มาเมื่อไหร่จะค้นในลิสต์นี้แทนการยิงเซิร์ฟเวอร์
   *
   * มีไว้สำหรับหน้าที่ดึงรายชื่อมาจากเส้นอื่น (เช่นเส้นของงานลงเวลา) และผู้ใช้
   * ที่เข้าหน้านั้นอาจไม่มีสิทธิ์อ่านทะเบียนพนักงานเต็ม ๆ
   */
  options,
  /** พนักงานที่ห้ามเลือก เช่น คนที่มีเคสค้างอยู่แล้ว */
  excludeIds,
  /** สถานะพนักงานที่ยอมให้เลือก ไม่ระบุ = ทุกสถานะ */
  status = "ACTIVE",
  placeholder = "ค้นหาชื่อหรือรหัสพนักงาน",
  disabled,
  emptyText = "ไม่พบพนักงานที่ตรงกับที่ค้นหา",
}: {
  value: string;
  onChange: (employeeId: string, employee: PickerEmployee | null) => void;
  companyId?: string;
  options?: PickerEmployee[];
  excludeIds?: string[];
  status?: string;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<PickerEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PickerEmployee | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // พ่อแม่ล้างค่าเลือก (เช่นเปลี่ยนบริษัท / บันทึกเสร็จ) ต้องล้างชื่อที่โชว์ด้วย
  if (!value && selected) setSelected(null);

  /**
   * วัดตำแหน่งปุ่มแล้วยึดกล่องไว้กับพิกัดจอ
   * เรียกจาก event handler ตลอด (คลิก / เลื่อน / ปรับขนาดจอ) จึงไม่ต้อง
   * ตั้ง state ใน effect ซึ่งจะชนกฎ react-hooks ของโปรเจกต์
   */
  function measure() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < PANEL_HEIGHT && rect.top > spaceBelow;

    setAnchor({
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  }

  // ค้นหาที่เซิร์ฟเวอร์ หน่วง 300ms กันยิงทุกตัวอักษร (โหมดลิสต์ในหน้าไม่ต้องยิง)
  useEffect(() => {
    if (!open || options) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);

        try {
          const params = new URLSearchParams({ page: "1", pageSize: "50" });
          if (term.trim()) params.set("q", term.trim());
          if (companyId) params.set("companyId", companyId);
          if (status) params.set("status", status);

          const response = await apiFetch<EmployeeListShape>(
            `/employees?${params.toString()}`,
          );

          setItems(
            Array.isArray(response)
              ? response
              : (response.items ?? response.data ?? []),
          );
        } catch {
          setItems([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, term, companyId, status, options]);

  // เลื่อนจอ/ปรับขนาดจอ = ขยับกล่องตามปุ่ม · คลิกนอกหรือ Esc = ปิด
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // กันไม่ให้ Esc ทะลุไปปิดป๊อปอัพที่ครอบอยู่
        event.stopPropagation();
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const excluded = new Set(excludeIds ?? []);
  const keyword = term.trim().toLowerCase();
  const source = options
    ? options.filter((item) =>
        keyword
          ? [pickerEmployeeName(item), item.employeeCode]
              .filter(Boolean)
              .some((text) => String(text).toLowerCase().includes(keyword))
          : true,
      )
    : items;
  const visible = source.filter((item) => !excluded.has(item.id));

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          measure();
          setOpen((prev) => !prev);
          window.setTimeout(() => searchRef.current?.focus(), 0);
        }}
        className={joinClassName(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-[13px] outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 3xl:h-10 3xl:text-[14px]",
          open && "border-brand-500 ring-2 ring-brand-100",
        )}
      >
        <span
          className={joinClassName(
            "min-w-0 flex-1 truncate",
            selected ? "text-slate-800" : "text-slate-400",
          )}
        >
          {selected ? pickerEmployeeName(selected) : "เลือกพนักงาน"}
        </span>

        {selected ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="ล้างพนักงานที่เลือก"
            onClick={(event) => {
              event.stopPropagation();
              setSelected(null);
              onChange("", null);
            }}
            className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : null}

        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                left: anchor.left,
                width: anchor.width,
                ...(anchor.top !== undefined ? { top: anchor.top } : {}),
                ...(anchor.bottom !== undefined
                  ? { bottom: anchor.bottom }
                  : {}),
              }}
              className="animate-dialog-in fixed z-[90] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
            >
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <input
                  ref={searchRef}
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder={placeholder}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400 3xl:text-[14px]"
                />
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
                ) : null}
              </div>

              <div className="max-h-64 overflow-y-auto">
                {visible.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[13px] text-slate-400">
                    {loading ? "กำลังค้นหา..." : emptyText}
                  </p>
                ) : (
                  visible.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelected(item);
                        onChange(item.id, item);
                        setOpen(false);
                        setTerm("");
                      }}
                      className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                          {pickerEmployeeName(item)}
                        </span>
                        <span className="block truncate text-[11px] text-slate-400 3xl:text-[12px]">
                          {employeeMeta(item) || "ไม่มีข้อมูลสังกัด"}
                        </span>
                      </span>

                      {value === item.id ? (
                        <Check className="h-4 w-4 shrink-0 text-brand-600" />
                      ) : null}
                    </button>
                  ))
                )}
              </div>

              {visible.length >= 50 ? (
                <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">
                  แสดง 50 คนแรก · พิมพ์ค้นหาเพื่อจำกัดให้แคบลง
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
