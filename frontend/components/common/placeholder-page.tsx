import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Construction,
  ShieldCheck,
} from "lucide-react";

type PlaceholderPageProps = {
  title: string;
  group: string;
  status?: "Soon" | "ใหม่" | "เปิดเมนู" | "ปรับปรุง" | "ใช้ได้";
  description?: string;
  features?: string[];
  permissionNote?: string;
  backHref?: string;
  backLabel?: string;
};

const statusClassName: Record<NonNullable<PlaceholderPageProps["status"]>, string> =
  {
    Soon: "border-amber-200 bg-amber-50 text-amber-700",
    ใหม่: "border-blue-200 bg-blue-50 text-blue-700",
    เปิดเมนู: "border-emerald-200 bg-emerald-50 text-emerald-700",
    ปรับปรุง: "border-violet-200 bg-violet-50 text-violet-700",
    ใช้ได้: "border-slate-200 bg-slate-50 text-slate-700",
  };

function joinClassName(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

export function PlaceholderPage({
  title,
  group,
  status = "Soon",
  description = "หน้านี้ถูกเพิ่มไว้ตามแผน Sprint 1 เพื่อให้เมนูกดเข้าได้ก่อน และไม่เกิด 404 ระหว่างรอพัฒนาฟังก์ชันจริง",
  features = [],
  permissionNote = "จะแสดงข้อมูลตามสิทธิ์ของผู้ใช้งานเมื่อเชื่อมกับฟังก์ชันจริง",
  backHref = "/dashboard",
  backLabel = "กลับไปหน้าภาพรวม",
}: PlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 lg:px-8">
      <div className="mx-auto flex max-w-[1720px] flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>{group}</span>
              <span>/</span>
              <span>{title}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {title}
              </h1>

              <span
                className={joinClassName(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                  statusClassName[status],
                )}
              >
                {status}
              </span>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>

          <Link
            href={backHref}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Construction className="h-6 w-6" />
            </div>

            <h2 className="mt-4 text-base font-semibold text-slate-900">
              อยู่ในแผนพัฒนา
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              หน้านี้ถูกสร้างเป็น placeholder ตาม Blueprint ก่อน เพื่อให้
              navigation ใหม่ใช้งานได้ครบทุกเมนู
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <h2 className="mt-4 text-base font-semibold text-slate-900">
              รองรับ Permission Guard
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {permissionNote}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <CalendarClock className="h-6 w-6" />
            </div>

            <h2 className="mt-4 text-base font-semibold text-slate-900">
              มาตรฐานวันที่
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              เมื่อพัฒนาหน้านี้จริง วันที่ใน UI ต้องแสดงเป็น วัน/เดือน/ปี เช่น
              30/05/2569 และวันเวลาเป็น 30/05/2569 08:30
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            สิ่งที่จะมีในหน้านี้
          </h2>

          {features.length > 0 ? (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              ยังไม่ได้กำหนดรายละเอียดของฟังก์ชันในหน้านี้
            </div>
          )}
        </section>
      </div>
    </main>
  );
}