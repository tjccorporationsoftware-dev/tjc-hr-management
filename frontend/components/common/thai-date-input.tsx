"use client";

import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { CalendarDays } from "lucide-react";

import {
  formatDateInputValue,
  formatThaiDate,
  parseDisplayDateToIso,
} from "@/lib/date-format";

type NativeDateInput = HTMLInputElement & {
  showPicker?: () => void;
};

type ThaiDateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "defaultValue"
> & {
  value?: string | Date | null;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  displayPlaceholder?: string;
  inputClassName?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function setForwardedRef<T>(
  forwardedRef: React.ForwardedRef<T>,
  value: T | null,
) {
  if (typeof forwardedRef === "function") {
    forwardedRef(value);
    return;
  }

  if (forwardedRef) {
    forwardedRef.current = value;
  }
}

function buildSyntheticChangeEvent(
  source: HTMLInputElement,
  nextIsoValue: string,
): ChangeEvent<HTMLInputElement> {
  const target = Object.assign(source, { value: nextIsoValue });

  return {
    target,
    currentTarget: target,
  } as ChangeEvent<HTMLInputElement>;
}

export const ThaiDateInput = forwardRef<HTMLInputElement, ThaiDateInputProps>(
  function ThaiDateInput(
    {
      value,
      onChange,
      disabled,
      readOnly,
      className,
      inputClassName,
      placeholder,
      displayPlaceholder = "วัน/เดือน/ปี",
      onClick,
      onKeyDown,
      onBlur,
      ...props
    },
    forwardedRef,
  ) {
    const nativeInputRef = useRef<HTMLInputElement | null>(null);
    const displayInputRef = useRef<HTMLInputElement | null>(null);

    const setNativeInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        nativeInputRef.current = node;
        setForwardedRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    const isoValue = formatDateInputValue(value);
    const displayValue = isoValue ? formatThaiDate(isoValue) : "";

    /*
     * ค่าที่ผู้ใช้กำลังพิมพ์ — null แปลว่าไม่ได้พิมพ์อยู่ ให้โชว์ค่าจริง
     *
     * เดิมช่องนี้เป็น controlled input ที่ onChange ไม่ทำอะไรเลย ตัวอักษรที่พิมพ์
     * จึงไม่ขึ้นบนจอ และค่าที่ตั้งใจพิมพ์ทับก็ไม่เคยถูกอ่าน — ฟอร์มที่เติมวันที่
     * วันนี้ไว้ก่อนจึงแก้ไม่ได้เลย ต้องกดปฏิทินเลือกอย่างเดียว
     */
    const [draft, setDraft] = useState<string | null>(null);
    const shownValue = draft ?? displayValue;

    const openPicker = useCallback(() => {
      if (disabled || readOnly) return;

      const nativeInput = nativeInputRef.current as NativeDateInput | null;
      if (!nativeInput) return;

      nativeInput.focus({ preventScroll: true });

      if (typeof nativeInput.showPicker === "function") {
        nativeInput.showPicker();
        return;
      }

      nativeInput.click();
    }, [disabled, readOnly]);

    function handleWrapperClick(event: React.MouseEvent<HTMLDivElement>) {
      onClick?.(event as unknown as React.MouseEvent<HTMLInputElement>);

      // คลิกในช่องข้อความ = แค่วางเคอร์เซอร์เพื่อพิมพ์ ไม่ต้องเด้งปฏิทิน
      // (เดิมเด้งทุกครั้ง แล้วโฟกัสถูกดึงไปช่อง date ที่ซ่อนอยู่ พิมพ์ไม่ติด)
      if (event.target === displayInputRef.current) return;

      openPicker();
    }

    function handleDisplayKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      onKeyDown?.(event);

      if (event.defaultPrevented) return;

      if (event.key === "Enter") {
        event.preventDefault();
        commitDraft();
        return;
      }

      if (event.key === "Escape" && draft !== null) {
        event.preventDefault();
        setDraft(null);
      }
    }

    function handleNativeChange(event: ChangeEvent<HTMLInputElement>) {
      setDraft(null);
      onChange?.(event);
    }

    /**
     * ยืนยันสิ่งที่พิมพ์
     * พิมพ์ไม่ถูกรูปแบบ = คืนค่าเดิม ไม่ปล่อยให้ค้างเป็นข้อความมั่ว ๆ บนจอ
     * ลบจนว่าง = ล้างค่าวันที่
     */
    function commitDraft() {
      if (draft === null) return;

      const typedValue = draft.trim();
      setDraft(null);

      if (!nativeInputRef.current) return;
      if (typedValue === displayValue) return;

      if (!typedValue) {
        if (isoValue) {
          onChange?.(buildSyntheticChangeEvent(nativeInputRef.current, ""));
        }
        return;
      }

      const nextIsoValue = parseDisplayDateToIso(typedValue);
      if (!nextIsoValue) return;

      onChange?.(buildSyntheticChangeEvent(nativeInputRef.current, nextIsoValue));
    }

    function handleDisplayChange(event: ChangeEvent<HTMLInputElement>) {
      if (disabled || readOnly) return;
      setDraft(event.target.value);
    }

    function handleDisplayBlur(event: React.FocusEvent<HTMLInputElement>) {
      onBlur?.(event);
      commitDraft();
    }

    return (
      <div
        className={cn(
          /*
           * ต้องสูงและมนเท่า CONTROL_BASE ของ kit เป๊ะ ๆ ตั้งแต่ค่าเริ่มต้น
           * เดิมตั้งเป็น h-11 rounded-2xl shadow-sm แล้วให้แต่ละหน้าส่ง class มาทับ
           * ซึ่งทับไม่ขึ้นจริง — ใน CSS ที่คอมไพล์ออกมา .h-11 กับ .shadow-sm
           * อยู่หลัง .h-9 และ .shadow-none ช่องวันที่จึงสูง 44px มีเงา
           * ยืนอยู่ข้างช่องอื่นที่สูง 36px แบนเรียบ
           */
          "relative flex h-9 w-full cursor-pointer items-center rounded-lg border border-slate-200 bg-white text-[13px] text-slate-800 transition hover:border-slate-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 3xl:h-10 3xl:text-[13.5px] 4xl:text-[14px]",
          disabled && "cursor-not-allowed bg-slate-50 text-slate-400 opacity-70",
          className,
        )}
        onClick={handleWrapperClick}
      >
        <input
          ref={displayInputRef}
          type="text"
          inputMode="numeric"
          value={shownValue}
          placeholder={placeholder ?? displayPlaceholder}
          disabled={disabled}
          readOnly={readOnly}
          onKeyDown={handleDisplayKeyDown}
          onBlur={handleDisplayBlur}
          onChange={handleDisplayChange}
          className={cn(
            "h-full min-w-0 flex-1 cursor-text rounded-lg bg-transparent px-3 pr-9 text-inherit text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400 3xl:px-3.5 3xl:pr-10",
            inputClassName,
          )}
          aria-label={props["aria-label"] ?? placeholder ?? displayPlaceholder}
        />

        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || readOnly}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openPicker();
          }}
          className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 disabled:pointer-events-none disabled:text-slate-300"
          aria-label="เลือกวันที่"
        >
          <CalendarDays className="h-4 w-4" />
        </button>

        <input
          {...props}
          ref={setNativeInputRef}
          type="date"
          value={isoValue}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleNativeChange}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    );
  },
);

ThaiDateInput.displayName = "ThaiDateInput";
