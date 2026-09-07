"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { joinClassName } from "@/components/kit";
import { CONTROL_BASE } from "@/components/kit/tokens";

import type { PayrollComponentOption } from "./use-payroll-component-options";

/**
 * ช่องชื่อรายการเงินเดือน — พิมพ์เองได้ และเลือกจากรายการที่ระบบมีให้ได้
 * ===============================================================
 * เดิมใช้ `<datalist>` ของเบราว์เซอร์ ซึ่งได้ฟังก์ชันครบแต่หน้าตาคุมไม่ได้เลย
 * ระยะบรรทัด ฟอนต์ และเงาเป็นของระบบปฏิบัติการ ไม่เข้ากับฟอร์มรอบข้าง
 * และบอกอะไรเพิ่มไม่ได้ — คนเลือก "โบนัส" ไม่รู้ว่าเลือกแล้วธงจะเปลี่ยนเป็นอะไร
 *
 * ตัวนี้เขียนเอง จึงบอกได้ว่าแต่ละรายการเข้าฐานภาษี/ประกันสังคมหรือไม่ตั้งแต่ตอนเลือก
 * และยังยอมให้พิมพ์ชื่อที่ไม่มีในลิสต์ เพราะแต่ละบริษัทมีรายการเฉพาะของตัวเอง
 *
 * คีย์บอร์ด: ลูกศรขึ้น-ลงเลื่อน · Enter เลือก · Esc ปิด · Tab ออกแล้วปิดเอง
 */

/** พื้นที่ที่แผงอยากได้ ถ้าด้านล่างเหลือน้อยกว่านี้และด้านบนกว้างกว่า จะพลิกขึ้น */
const PANEL_MAX_HEIGHT = 256;
const PANEL_GAP = 4;
const VIEWPORT_MARGIN = 8;

type PanelPosition = {
  left: number;
  width: number;
  /** ตั้งได้ทีละอย่าง — วางใต้ช่องใช้ top วางเหนือช่องใช้ bottom */
  top?: number;
  bottom?: number;
  maxHeight: number;
};

function measurePanel(anchor: HTMLElement): PanelPosition {
  const rect = anchor.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - PANEL_GAP - VIEWPORT_MARGIN;

  /* ปกติวางใต้ช่อง ยกเว้นด้านล่างเหลือไม่พอจริง ๆ แล้วด้านบนกว้างกว่า */
  const placeAbove = spaceBelow < Math.min(PANEL_MAX_HEIGHT, spaceAbove) && spaceAbove > spaceBelow;

  return {
    left: rect.left,
    width: rect.width,
    ...(placeAbove
      ? { bottom: window.innerHeight - rect.top + PANEL_GAP }
      : { top: rect.bottom + PANEL_GAP }),
    maxHeight: Math.max(96, Math.min(PANEL_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow)),
  };
}

export function PayrollItemNameInput({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: PayrollComponentOption[];
  placeholder?: string;
  /** ส่ง option มาด้วยเมื่อชื่อตรงกับรายการที่ระบบมีให้ ผู้เรียกเอาไปเติมรหัส/ธง */
  onChange: (name: string, option: PayrollComponentOption | null) => void;
}) {
  /*
   * ตำแหน่งแผงเก็บเป็น state ตัวเดียวกับสถานะเปิด — มีค่า = เปิดอยู่
   * ทำให้ไม่มีจังหวะที่เปิดแล้วยังไม่รู้ตำแหน่ง ซึ่งจะเห็นแผงกระพริบไปมุมซ้ายบน
   */
  const [panel, setPanel] = useState<PanelPosition | null>(null);
  const [highlight, setHighlight] = useState(0);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /* ต้องไม่ซ้ำกันเมื่อมีหลายช่องในหน้าเดียว จึงใช้ id ที่ React ออกให้ */
  const listId = `${useId()}-payroll-item-options`;

  const open = panel !== null;
  const normalize = (text: string) => text.replace(/\s+/g, "").toLowerCase();

  /*
   * กรองตามที่พิมพ์ แต่ถ้าที่พิมพ์ตรงกับรายการใดพอดีให้โชว์ทั้งลิสต์
   * ไม่งั้นพอเลือกไปแล้วกดเปิดดูอีกครั้งจะเหลือรายการเดียว เปลี่ยนใจไม่ได้
   */
  const filtered = useMemo(() => {
    const keyword = normalize(value);
    if (!keyword) return options;
    if (options.some((option) => normalize(option.label) === keyword)) return options;
    return options.filter((option) => normalize(option.label).includes(keyword));
  }, [options, value]);

  const exactMatch = useMemo(
    () => options.find((option) => normalize(option.label) === normalize(value)) ?? null,
    [options, value],
  );

  function openPanel() {
    if (anchorRef.current) setPanel(measurePanel(anchorRef.current));
  }

  function closePanel() {
    setPanel(null);
  }

  /*
   * แผงอยู่ใน portal จึงต้องตามช่องเองเมื่อหน้าเลื่อนหรือย่อขยาย
   * scroll ต้องดักแบบ capture เพราะตัวที่เลื่อนคือ body ของ Modal ไม่ใช่ window
   */
  useEffect(() => {
    if (!open) return;

    function reposition() {
      if (anchorRef.current) setPanel(measurePanel(anchorRef.current));
    }

    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    /* คลิกที่อื่นแล้วต้องปิด — เช็คทั้งช่องและแผง เพราะแผงไม่ได้อยู่ใต้ช่องใน DOM */
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closePanel();
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  function select(option: PayrollComponentOption) {
    onChange(option.label, option);
    closePanel();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      closePanel();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openPanel();
        return;
      }
      if (!filtered.length) return;

      setHighlight((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + filtered.length) % filtered.length;
      });
      return;
    }

    if (event.key === "Enter" && open && filtered[highlight]) {
      event.preventDefault();
      select(filtered[highlight]);
    }
  }

  return (
    <div ref={anchorRef} className="relative">
      <input
        className={joinClassName(CONTROL_BASE, "pr-9")}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(event) => {
          onChange(event.target.value, null);
          openPanel();
          /* ที่พิมพ์เปลี่ยน ผลกรองก็เปลี่ยน ไฮไลต์ต้องกลับไปตัวแรก ไม่ค้างที่เดิม */
          setHighlight(0);
        }}
        onFocus={openPanel}
        onKeyDown={onKeyDown}
      />

      {/* ปุ่มลูกศร — บอกว่าช่องนี้มีรายการให้เลือก ไม่ใช่ช่องพิมพ์เปล่า */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "ปิดรายการ" : "เปิดรายการ"}
        onClick={() => {
          if (open) closePanel();
          else openPanel();
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 transition hover:text-slate-600"
      >
        <ChevronDown
          className={joinClassName(
            "h-4 w-4 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/*
       * ต้องออกไปอยู่ที่ body — `Modal` ครอบเนื้อหาด้วย `overflow-y-auto`
       * ในกรอบ `overflow-hidden` แผงที่วางแบบ absolute จึงถูกตัดหายลงไปใต้ป๊อปอัพ
       */}
      {panel && options.length
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                left: panel.left,
                width: panel.width,
                top: panel.top,
                bottom: panel.bottom,
                maxHeight: panel.maxHeight,
              }}
              /* z สูงกว่าฉากหลังของ Modal ไม่งั้นแผงไปอยู่ใต้ป๊อปอัพ */
              className="fixed z-[120] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10"
            >
              {filtered.length ? (
                <ul id={listId} className="min-h-0 flex-1 overflow-y-auto py-1">
                  {filtered.map((option, index) => {
                    const active = index === highlight;
                    const picked = exactMatch?.code === option.code;

                    return (
                      <li key={option.id}>
                        <button
                          type="button"
                          /* mousedown ก่อน blur ของ input ไม่งั้นแผงปิดก่อนคลิกติด */
                          onMouseDown={(event) => {
                            event.preventDefault();
                            select(option);
                          }}
                          onMouseEnter={() => setHighlight(index)}
                          className={joinClassName(
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition",
                            active ? "bg-brand-50" : "hover:bg-slate-50",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {picked ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                            ) : null}
                            <span
                              className={joinClassName(
                                "truncate text-[13.5px] 3xl:text-[14.5px]",
                                active ? "text-brand-800" : "text-slate-700",
                              )}
                            >
                              {option.label}
                            </span>
                          </span>

                          {/* บอกล่วงหน้าว่าเลือกแล้วธงจะเป็นอะไร */}
                          <span className="flex shrink-0 items-center gap-1">
                            {option.isTaxable ? <Tag>ภาษี</Tag> : null}
                            {option.isSocialSecurityBase ? <Tag>ฐาน สปส.</Tag> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                /*
                 * ไม่ตรงกับรายการไหน ไม่ใช่ความผิด — บริษัทมีรายการเฉพาะของตัวเองได้
                 * บอกให้รู้ว่าจะใช้ชื่อที่พิมพ์ แล้วต้องตั้งธงเอง
                 */
                <p className="px-3 py-2.5 text-[12.5px] 3xl:text-[13.5px] text-slate-500">
                  ไม่มีรายการชื่อนี้ · จะใช้ชื่อที่พิมพ์ และตั้งธงด้านล่างเอง
                </p>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] 3xl:text-[10.5px] font-medium text-slate-500">
      {children}
    </span>
  );
}
