"use client";

import { ClipboardPen } from "lucide-react";

import { RequestOnBehalfPanel } from "./_components/request-on-behalf-panel";

export default function PlatformRequestsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-600">
          Platform Console
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-950">
          <ClipboardPen className="h-6 w-6 text-violet-600" />
          ยื่นคำขอแทนพนักงาน
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          ยื่นใบลา / OT / แก้ไขเวลา / ทำงานนอกสถานที่ ให้พนักงานที่ยื่นเองไม่ได้
          (ไม่มีบัญชี ไม่มีมือถือ หรือแจ้งมาทางอื่น) — ใบจะเข้าสายอนุมัติของพนักงานคนนั้นตามปกติ
        </p>
      </header>

      <RequestOnBehalfPanel />
    </div>
  );
}
