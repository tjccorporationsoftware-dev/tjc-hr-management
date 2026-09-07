"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  RefreshCcw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";
import { getMyProfile, getPublicFileUrl, uploadMyAvatar } from "@/lib/api";
import type { MyProfileResponse } from "@/types/profile";

import { formatThaiDate as formatDateFixDate } from "@/lib/date-format";
type LooseRecord = Record<string, any>;

type RichProfileResponse = MyProfileResponse & {
  summary?: LooseRecord;
  employee?: LooseRecord | null;
};

const panelClass =
  "overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.07)]";

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function formatDate(value?: string | Date | null) {
  return formatDateFixDate(value);
}

function getInitials(name?: string | null) {
  if (!name) return "U";

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "U";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function getEmployeeFullName(employee?: LooseRecord | null) {
  if (!employee) return "-";

  if (employee.displayName) return employee.displayName;

  return (
    [employee.title, employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "-"
  );
}

function getMasterName(item?: LooseRecord | null) {
  if (!item) return "-";

  if (item.code && item.nameTh) {
    return `${item.code} - ${item.nameTh}`;
  }

  return item.nameTh || item.nameEn || item.code || "-";
}

function getNationalId(employee?: LooseRecord | null) {
  return (
    employee?.profile?.nationalId ||
    employee?.profile?.citizenId ||
    employee?.profile?.idCardNo ||
    "-"
  );
}

function getEmergencyContact(employee?: LooseRecord | null) {
  return (
    employee?.profile?.emergencyContactName ||
    employee?.profile?.emergencyContact ||
    "-"
  );
}

function getEmployeeType(employee?: LooseRecord | null) {
  if (!employee) return "-";

  return (
    employee.employeeType?.nameTh ||
    employee.employeeType?.nameEn ||
    employee.employeeType?.code ||
    employee.employmentType ||
    employee.employeeTypeName ||
    employee.type ||
    "-"
  );
}

function getStatusClass(status?: string | null) {
  const value = String(status ?? "").toUpperCase();

  if (["ACTIVE", "APPROVED", "PAID", "COMPLETED"].includes(value)) {
    return "border-emerald-100 bg-emerald-50 text-emerald-600";
  }

  if (["SUBMITTED", "PENDING", "WAITING", "DRAFT"].includes(value)) {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (["REJECTED", "CANCELLED", "EXPIRED", "INACTIVE"].includes(value)) {
    return "border-rose-100 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function BackToEssButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 text-[13px] font-extrabold text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50"
    >
      <ArrowLeft className="h-4 w-4" />
      ย้อนกลับแดชบอร์ดพนักงาน
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<RichProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [imageError, setImageError] = useState(false);

  const avatarUrl = useMemo(() => {
    return getPublicFileUrl(profile?.user.avatarUrl);
  }, [profile?.user.avatarUrl]);

  useEffect(() => {
    setImageError(false);
  }, [avatarUrl]);

  async function loadProfile() {
    try {
      setLoading(true);

      const result = (await getMyProfile()) as RichProfileResponse;

      setProfile(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "โหลดข้อมูลโปรไฟล์ไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("ขนาดรูปต้องไม่เกิน 2MB");
      event.target.value = "";
      return;
    }

    try {
      setSavingAvatar(true);

      const result = (await uploadMyAvatar(file)) as RichProfileResponse;

      setProfile(result);
      await refreshMe();

      toast.success("เปลี่ยนรูปโปรไฟล์สำเร็จ");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ",
      );
    } finally {
      setSavingAvatar(false);
      event.target.value = "";
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100dvh-72px)] w-full">
        <div className="mb-4 flex items-center justify-between gap-3">
          <BackToEssButton onClick={() => router.push("/ess")} />
        </div>

        <div className="flex min-h-[calc(100dvh-140px)] items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            กำลังโหลดข้อมูลโปรไฟล์...
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[calc(100dvh-72px)] w-full">
        <div className="mb-4 flex items-center justify-between gap-3">
          <BackToEssButton onClick={() => router.push("/ess")} />
        </div>

        <div className={cn(panelClass, "p-8 text-center")}>
          <p className="text-sm font-semibold text-slate-500">
            ไม่พบข้อมูลโปรไฟล์
          </p>

          <button
            type="button"
            onClick={loadProfile}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 text-sm font-bold text-blue-600 shadow-sm transition hover:bg-blue-50"
          >
            <RefreshCcw className="h-4 w-4" />
            โหลดใหม่
          </button>
        </div>
      </div>
    );
  }

  const user = profile.user;
  const employee = profile.employee;
  const primaryRole = user.roles?.[0]?.code ?? "-";
  const employeeName = getEmployeeFullName(employee);
  const displayName = employeeName !== "-" ? employeeName : user.displayName;
  const phone = employee?.phone || user.phone || "-";
  const employeeType = getEmployeeType(employee);

  return (
    <div className="min-h-[calc(100dvh-72px)] w-full space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[15px] font-extrabold text-slate-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BadgeCheck className="h-4 w-4" />
          </span>
          ข้อมูลบัญชีผู้ใช้งาน
        </div>

        <BackToEssButton onClick={() => router.push("/ess")} />
      </div>

      <section className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.075)]">
        <div className="relative min-h-[238px] overflow-hidden bg-white">
          {/* Decorative Background */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[linear-gradient(115deg,#ffffff_0%,#ffffff_42%,#eef6ff_72%,#dbeafe_100%)]" />
            <div className="absolute right-0 top-0 h-full w-[44%] rounded-bl-[120px] bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.18),rgba(14,165,233,0.10)_45%,rgba(255,255,255,0)_78%)]" />
            <div className="absolute -right-24 -top-24 h-[340px] w-[520px] rounded-full bg-blue-300/18 blur-3xl" />
            <div className="absolute left-8 top-8 h-28 w-28 rounded-full bg-sky-100/70 blur-2xl" />

            <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-blue-200/80 to-transparent" />
            <div className="absolute bottom-0 left-0 h-px w-full bg-slate-200/80" />
          </div>

          <div className="relative z-10 flex flex-col justify-between gap-6 px-5 py-7 sm:px-7 lg:flex-row lg:items-start lg:px-10">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative mx-auto shrink-0 sm:mx-0">
                <div className="relative flex h-[126px] w-[126px] overflow-hidden rounded-full border-[7px] border-white bg-slate-100 text-slate-500 shadow-[0_18px_38px_rgba(15,23,42,0.14)]">
                  {avatarUrl && !imageError ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-extrabold text-blue-600">
                      {getInitials(displayName)}
                    </div>
                  )}
                </div>

                <span className="absolute bottom-2 right-2 h-5 w-5 rounded-full border-[3px] border-white bg-emerald-400 shadow-sm" />
              </div>

              <div className="min-w-0 text-center sm:text-left">
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-extrabold text-blue-600 shadow-sm">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Verified Account
                </div>

                <div className="mt-3 flex min-w-0 flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h1 className="max-w-full truncate text-[30px] font-extrabold tracking-[-0.04em] text-slate-950 sm:text-[34px]">
                    {displayName}
                  </h1>

                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)]">
                    <BadgeCheck className="h-4 w-4" />
                  </span>
                </div>

                <p className="mt-2 truncate text-sm font-semibold text-slate-600">
                  {user.email}
                </p>

                <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <span
                    className={cn(
                      "inline-flex h-8 items-center rounded-2xl border px-4 text-xs font-extrabold shadow-sm",
                      getStatusClass(user.status),
                    )}
                  >
                    {user.status}
                  </span>

                  <span className="inline-flex h-8 items-center rounded-2xl border border-blue-200 bg-blue-600 px-4 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20">
                    {primaryRole}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-center gap-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] lg:items-end">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={savingAvatar}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                เปลี่ยนรูปโปรไฟล์
              </button>

              <p className="max-w-[220px] text-center text-xs font-semibold leading-5 text-slate-500 lg:text-right">
                รองรับไฟล์ JPG, PNG หรือ WEBP ขนาดไม่เกิน 2MB
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 bg-slate-50/45 px-4 pb-6 sm:px-6 lg:px-8">
          <SectionCard title="ข้อมูลบัญชี" className="-mt-8 relative z-20">
            <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
              <ReadOnlyField label="ชื่อที่แสดงผล" value={displayName} />
              <ReadOnlyField label="เบอร์โทรศัพท์" value={phone} />
              <ReadOnlyField label="อีเมล" value={user.email} />
              <ReadOnlyField label="สถานะบัญชี" value={user.status} />
              <ReadOnlyField label="บทบาทผู้ใช้งาน" value={primaryRole} />
              <ReadOnlyField label="ประเภทพนักงาน" value={employeeType} />
            </div>
          </SectionCard>

          <SectionCard title="ข้อมูลพนักงาน">
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
              <ReadOnlyField
                label="รหัสพนักงาน"
                value={employee?.employeeCode || "-"}
              />

              <ReadOnlyField
                label="ชื่อ-นามสกุล"
                value={getEmployeeFullName(employee)}
              />

              <ReadOnlyField
                label="ตำแหน่ง"
                value={employee?.position || "-"}
              />

              <ReadOnlyField
                label="สถานะพนักงาน"
                value={employee?.status || "-"}
              />

              <ReadOnlyField
                label="บริษัท"
                value={getMasterName(employee?.company)}
              />

              <ReadOnlyField
                label="สาขา"
                value={getMasterName(employee?.branch)}
              />

              <ReadOnlyField
                label="แผนก"
                value={getMasterName(employee?.department)}
              />

              <ReadOnlyField
                label="ฝ่าย / กลุ่มงาน"
                value={getMasterName(employee?.division)}
              />

              <ReadOnlyField
                label="วันที่เริ่มงาน"
                value={formatDate(employee?.startDate)}
              />

              <ReadOnlyField
                label="สิ้นสุดทดลองงาน"
                value={formatDate(employee?.probationEndDate)}
              />

              <ReadOnlyField
                label="อีเมลพนักงาน"
                value={employee?.email || "-"}
              />

              <ReadOnlyField
                label="เบอร์โทรพนักงาน"
                value={employee?.phone || "-"}
              />
            </div>
          </SectionCard>

          <SectionCard title="ข้อมูลส่วนบุคคลเพิ่มเติม">
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
              <ReadOnlyField
                label="เลขบัตรประชาชน / เลขเอกสาร"
                value={getNationalId(employee)}
              />

              <ReadOnlyField
                label="วันเกิด"
                value={formatDate(employee?.profile?.birthDate)}
              />

              <ReadOnlyField
                label="เพศ"
                value={employee?.profile?.gender || "-"}
              />

              <ReadOnlyField
                label="ผู้ติดต่อฉุกเฉิน"
                value={getEmergencyContact(employee)}
              />
            </div>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(panelClass, className)}>
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-100 via-white to-white px-5 py-4 sm:px-6 lg:px-7">
        <div className="flex items-center gap-3">
          <span className="h-7 w-1 rounded-full bg-blue-500" />
          <h3 className="text-[15px] font-extrabold text-blue-600">
            {title}
          </h3>
        </div>
      </div>

      <div className="p-5 sm:p-6 lg:p-7">{children}</div>
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-sm font-extrabold text-slate-700">
        {label}
      </span>

      <div className="flex h-11 w-full items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <span className="truncate">{value || "-"}</span>
      </div>
    </label>
  );
}