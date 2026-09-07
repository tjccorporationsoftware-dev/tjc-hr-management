"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { SidebarContent } from "./sidebar";

type MobileSidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="ปิดเมนู"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
      />

      <aside className="relative flex h-full w-[86vw] max-w-[350px] flex-col border-r border-slate-300 bg-white shadow-2xl">
        <div className="absolute right-4 top-4.5 z-20">
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <SidebarContent onNavigate={onClose} />
      </aside>
    </div>
  );
}