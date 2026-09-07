"use client";

import { useState } from "react";
import { MobileSidebar } from "./mobile-sidebar";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <MobileSidebar
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />

        <div className="min-w-0 flex-1">
          <Topbar onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />

          <main className="w-full px-3 py-4 sm:px-5 lg:px-6 lg:py-5 2xl:px-8 3xl:px-9 3xl:py-6 4xl:px-12">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
