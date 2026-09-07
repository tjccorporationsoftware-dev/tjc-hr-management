import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { joinClassName } from "@/components/ui/class-name";
import { CONTROL_HEIGHT, FOCUS_RING, RADIUS_CONTROL } from "./tokens";

/**
 * ปุ่มเดียวของทั้งโซน — แบน ไม่มีเงา
 * `primary` เป็นสีทึบและควรมีปุ่มเดียวต่อหน้า คือจุดนำสายตา
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
  ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
  danger:
    "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-[12px] 3xl:h-9 3xl:px-3 3xl:text-[12.5px] 4xl:text-[13px]",
  md: `${CONTROL_HEIGHT} gap-1.5 px-3.5 text-[13px] 3xl:px-4 3xl:text-[13.5px] 4xl:text-[14px]`,
};

function buttonClass(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
) {
  return joinClassName(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold transition disabled:pointer-events-none disabled:opacity-50",
    RADIUS_CONTROL,
    FOCUS_RING,
    sizeClass[size],
    variantClass[variant],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        (icon ?? null)
      )}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon ?? null}
      {children}
    </Link>
  );
}

/** ปุ่มไอคอนล้วนในแถวตาราง — ต้องมี title เสมอเพื่อให้รู้ว่าทำอะไร */
export function IconButton({
  title,
  icon,
  tone = "neutral",
  size = "sm",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  icon: ReactNode;
  tone?: "neutral" | "danger";
  /**
   * `md` = สูงเท่า `Select` และ `Button` ขนาดปกติ (36px)
   * ใช้เมื่อวางเรียงอยู่ในแถวเดียวกับคอนโทรลพวกนั้น ไม่งั้นความสูงจะไม่ตรงกัน
   */
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={joinClassName(
        "inline-flex items-center justify-center rounded-lg text-slate-400 transition disabled:pointer-events-none disabled:opacity-50",
        size === "md"
          ? "h-9 w-9 3xl:h-10 3xl:w-10"
          : "h-8 w-8 3xl:h-9 3xl:w-9",
        FOCUS_RING,
        tone === "danger"
          ? "hover:bg-rose-50 hover:text-rose-600"
          : "hover:bg-slate-100 hover:text-slate-700",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
