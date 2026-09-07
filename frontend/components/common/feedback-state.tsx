import type { ReactNode } from "react";
import { AlertCircle, Loader2, SearchX, ShieldAlert } from "lucide-react";

type FeedbackStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

type EmptyStateProps = FeedbackStateProps & {
  icon?: ReactNode;
};

function joinClassName(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

function StateShell({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={joinClassName(
        "flex min-h-[280px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-10 text-center",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
          {icon}
        </div>

        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        {description ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {description}
          </p>
        ) : null}

        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

export function LoadingState({
  title = "กำลังโหลดข้อมูล",
  description = "กรุณารอสักครู่ ระบบกำลังดึงข้อมูลล่าสุด",
  className,
}: FeedbackStateProps) {
  return (
    <div
      className={joinClassName(
        "flex min-h-[280px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-10 text-center",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>

        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        {description ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title = "เกิดข้อผิดพลาด",
  description = "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง",
  action,
  className,
}: FeedbackStateProps) {
  return (
    <StateShell
      className={className}
      icon={<AlertCircle className="h-6 w-6" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

export function EmptyState({
  icon,
  title = "ยังไม่มีข้อมูล",
  description = "เมื่อมีข้อมูลในระบบ รายการจะแสดงที่นี่",
  action,
  className,
}: EmptyStateProps) {
  return (
    <StateShell
      className={className}
      icon={icon ?? <SearchX className="h-6 w-6" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

export function PermissionDenied({
  title = "ไม่มีสิทธิ์เข้าถึงหน้านี้",
  description = "บัญชีของคุณยังไม่มีสิทธิ์ใช้งานเมนูนี้ กรุณาติดต่อผู้ดูแลระบบ",
  action,
  className,
}: FeedbackStateProps) {
  return (
    <StateShell
      className={className}
      icon={<ShieldAlert className="h-6 w-6" />}
      title={title}
      description={description}
      action={action}
    />
  );
}