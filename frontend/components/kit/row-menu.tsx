"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

import { joinClassName } from "@/components/ui/class-name";
import { FOCUS_RING } from "./tokens";

/**
 * เมนูจัดการท้ายแถวตาราง
 * ----------------------
 * แถวหนึ่งมักทำได้หลายอย่าง (แก้ไข ผูก รีเซ็ต ลบ ฯลฯ) ถ้าวางเป็นปุ่มไอคอนเรียงกัน
 * ตารางจะรกและผู้ใช้ต้องเดาว่าไอคอนไหนคืออะไร จึงยุบไว้ในปุ่มสามจุดปุ่มเดียว
 * แล้วกางเป็นรายการที่มีข้อความกำกับชัดเจน
 *
 * ตัวเมนูวาดที่ `document.body` ด้วย position: fixed ไม่ใช่ absolute ในแถว
 * เพราะ `DataTable` ห่อด้วย `overflow-x-auto` และ CSS บังคับว่าถ้าแกนหนึ่งเป็น auto
 * อีกแกนจะ visible ไม่ได้ กลายเป็น auto ตามไปด้วย เมนูที่วางในนั้นจึงโดนตัด
 * และดันสกรอลบาร์ขึ้นมา
 *
 * ปิดเมื่อคลิกนอกเมนู กด Esc เลื่อนหน้า ย่อ-ขยายจอ หรือเลือกรายการไปแล้ว
 */

export type RowMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
  /** ขึ้นเส้นคั่นเหนือรายการนี้ ใช้แยกกลุ่มที่อันตรายออกจากงานปกติ */
  separated?: boolean;
};

const MENU_WIDTH = 208;
const MENU_GAP = 6;

type MenuPosition = { top: number; left: number; openUpward: boolean };

export function RowMenu({
  items,
  label = "จัดการ",
}: {
  items: RowMenuItem[];
  label?: string;
}) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = position !== null;

  function openMenu() {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    // เผื่อความสูงเมนูคร่าว ๆ จากจำนวนรายการ ถ้าล่างไม่พอให้กางขึ้นแทน
    const estimatedHeight = items.length * 38 + 12;
    const openUpward =
      rect.bottom + MENU_GAP + estimatedHeight > window.innerHeight &&
      rect.top - MENU_GAP - estimatedHeight > 0;

    setPosition({
      top: openUpward
        ? rect.top - MENU_GAP - estimatedHeight
        : rect.bottom + MENU_GAP,
      // ชิดขวาของปุ่ม แต่ไม่ให้ทะลุขอบซ้ายจอ
      left: Math.max(8, rect.right - MENU_WIDTH),
      openUpward,
    });
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setPosition(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPosition(null);
    }

    // เลื่อนหรือย่อขยายแล้วตำแหน่งที่คำนวณไว้ใช้ไม่ได้ ปิดไปเลยง่ายกว่าไล่คำนวณใหม่
    function onViewportChange() {
      setPosition(null);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) setPosition(null);
          else openMenu();
        }}
        className={joinClassName(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
          FOCUS_RING,
          open
            ? "bg-brand-50 text-brand-700"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                top: position.top,
                left: position.left,
                width: MENU_WIDTH,
              }}
              onClick={(event) => event.stopPropagation()}
              className="animate-dialog-in fixed z-[90] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left shadow-xl shadow-slate-900/10"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPosition(null);
                    item.onSelect();
                  }}
                  className={joinClassName(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-40",
                    item.separated && "mt-1 border-t border-slate-100 pt-2.5",
                    item.tone === "danger"
                      ? "text-rose-600 hover:bg-rose-50"
                      : "text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <span
                    className={joinClassName(
                      "shrink-0",
                      item.tone === "danger"
                        ? "text-rose-500"
                        : "text-slate-400",
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
