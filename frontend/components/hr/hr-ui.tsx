import type { ReactNode } from "react";
import { BriefcaseBusiness } from "lucide-react";

import { DateDisplay } from "@/components/common/date-display";
import {
  getEmployeeName,
  type EmployeeNameLike,
} from "@/components/ui/employee-name";
import {
  MetricCard,
  PageHeader,
  PageShell,
  QuickLink,
  type MetricTone,
} from "@/components/ui/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { EMPLOYEE_STATUS, REQUEST_STATUS } from "@/lib/status-labels";

/**
 * โซน HR — ต่อยอดจากชุด UI กลางใน components/ui
 * ไฟล์นี้เคยมี PageShell / PageHeader / MetricCard / QuickLink / joinClassName
 * เป็นของตัวเอง ซ้ำกับ manager-ui.tsx และ payroll-ui.tsx เกือบทั้งไฟล์
 */

export { joinClassName } from "@/components/ui/class-name";

export function getHrEmployeeName(employee?: EmployeeNameLike | null) {
  return getEmployeeName(employee);
}

/**
 * หน้า HR ใช้ badge นี้กับทั้งสถานะพนักงานและสถานะคำขอ จึงรวมสองคลังคำ
 * โดยให้สถานะพนักงานมาก่อน เหมือนลำดับใน map เดิมของไฟล์นี้
 */
const HR_STATUS = { ...REQUEST_STATUS, ...EMPLOYEE_STATUS };

export function HrStatusBadge({ status }: { status?: string | null }) {
  return <StatusBadge vocabulary={HR_STATUS} status={status || "INACTIVE"} />;
}

export function HrPageShell({ children }: { children: ReactNode }) {
  return <PageShell>{children}</PageShell>;
}

export function HrPageHeader(props: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <PageHeader breadcrumb="งาน HR" {...props} />;
}

export function HrMetricCard(props: {
  label: string;
  value: string | number;
  description?: string;
  tone?: MetricTone;
}) {
  return <MetricCard badge="HR" {...props} />;
}

export function HrQuickLink({
  icon,
  ...props
}: {
  href: string;
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <QuickLink
      icon={icon || <BriefcaseBusiness className="h-5 w-5" />}
      {...props}
    />
  );
}

export function HrEmployeeMiniCard({
  employee,
  label,
  date,
}: {
  employee?:
    | (EmployeeNameLike & {
        position?: string | null;
        department?: { nameTh?: string | null } | null;
      })
    | null;
  label?: string;
  date?: string | null;
}) {
  const name = getHrEmployeeName(employee);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700">
          {name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-slate-900">
            {name}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {employee?.employeeCode || "-"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {label || employee?.position || employee?.department?.nameTh || "-"}
          </p>
          {date ? (
            <p className="mt-2 text-xs text-slate-500">
              วันที่: <DateDisplay value={date} />
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
