"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Camera, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { InfoGrid, InfoItem, InfoSection } from "@/components/common/info-list";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/feedback-state";
import {
  Avatar,
  Button,
  Field,
  FieldGrid,
  Notice,
  Select,
  TextInput,
  Textarea,
  Toolbar,
} from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/auth-context";
import { compressImageToDataUrl } from "@/lib/compress-image";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import {
  deleteMyAvatar,
  getMyProfile,
  getPublicFileUrl,
  updateMyProfile,
  uploadMyAvatar,
} from "@/lib/api";
import { formatThaiDate, formatThaiDateTime } from "@/lib/date-format";
import { queryKeys } from "@/lib/query-keys";
import { getErrorMessage, useApiMutation, useApiQuery } from "@/lib/use-api";
import type {
  MyProfileResponse,
  UpdateMyProfilePayload,
} from "@/types/profile";

/**
 * แฟ้มข้อมูลพนักงานของตัวเอง
 * --------------------------
 * เนื้อหาชุดเดียวกับแท็บภาพรวมของ /employees/[id] ฝั่ง HR จึงใช้
 * `InfoSection`/`InfoGrid`/`InfoItem` ตัวเดียวกัน เพื่อให้พนักงานกับ HR
 * เห็นข้อมูลตัวเดียวกันในหน้าตาเดียวกัน
 *
 * โหมดแก้ไข
 * ---------
 * พนักงานแก้ได้เฉพาะข้อมูลที่ตัวเองรู้ดีที่สุดและแก้แล้วไม่กระทบเงินหรือสิทธิ์:
 * ที่อยู่ · ผู้ติดต่อฉุกเฉิน · ข้อมูลส่วนตัวทั่วไป · การศึกษา · ชื่อที่แสดงและรูป
 * ส่วนสังกัด ตำแหน่ง สถานะการจ้าง เลขบัตรประชาชน และบัญชีธนาคาร เป็นของ HR เท่านั้น
 * (ขอบเขตจริงบังคับที่ `UpdateMyProfileDto` ฝั่ง backend ไม่ใช่ที่หน้าจอนี้)
 *
 * ตอนแก้ไขจะซ่อนช่องที่แก้ไม่ได้ทิ้ง เพื่อไม่ให้ฟอร์มปนกับข้อความอ่านอย่างเดียว
 * แล้วส่งขึ้น backend เฉพาะช่องที่ค่าเปลี่ยนจริง
 */

const genderLabels: Record<string, string> = {
  MALE: "ชาย",
  FEMALE: "หญิง",
  OTHER: "อื่น ๆ",
  NOT_SPECIFIED: "ไม่ระบุ",
};

const maritalStatusLabels: Record<string, string> = {
  SINGLE: "โสด",
  MARRIED: "สมรส",
  DIVORCED: "หย่า",
  WIDOWED: "หม้าย",
  NOT_SPECIFIED: "ไม่ระบุ",
};

const MARITAL_STATUS_OPTIONS = [
  "NOT_SPECIFIED",
  "SINGLE",
  "MARRIED",
  "DIVORCED",
  "WIDOWED",
] as const;

const userStatusLabels: Record<string, string> = {
  ACTIVE: "ใช้งานได้",
  INACTIVE: "ปิดใช้งาน",
  SUSPENDED: "ถูกระงับ",
  LOCKED: "ถูกล็อก",
};

/** เพดานเดียวกับ AVATAR_MAX_FILE_SIZE ฝั่ง backend — ใหญ่กว่านี้ต้องย่อก่อนส่ง */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

function text(value?: string | null, fallback = "-") {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function labelOf(
  value: string | null | undefined,
  labels: Record<string, string>,
) {
  const key = value?.trim();
  if (!key) return "-";
  return labels[key] ?? key;
}

/** ชื่อเต็มพร้อมรหัส ใช้กับหัวหน้างาน */
function personText(
  person?: {
    employeeCode?: string | null;
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
  } | null,
) {
  if (!person) return "-";

  const name =
    [person.title, person.firstName, person.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ") ||
    person.displayName ||
    "";

  const code = person.employeeCode?.trim();

  if (code && name) return `${code} · ${name}`;
  return name || code || "-";
}

/** รหัส + ชื่อ ของข้อมูลหลัก (บริษัท/แผนก/ตำแหน่ง) */
function masterText(
  master?: {
    code?: string | null;
    nameTh?: string | null;
    nameEn?: string | null;
  } | null,
) {
  if (!master) return "-";

  const name = master.nameTh?.trim() || master.nameEn?.trim() || "";
  const code = master.code?.trim();

  if (code && name) return `${code} · ${name}`;
  return name || code || "-";
}

function ageText(birthDate?: string | null) {
  if (!birthDate) return "-";

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "-";

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 0 ? `${age} ปี` : "-";
}

/** ที่อยู่หลายบรรทัด — ขึ้นบรรทัดตามที่กรอกไว้ ไม่ตัดทิ้ง */
function AddressText({ value }: { value?: string | null }) {
  const trimmed = value?.trim();

  if (!trimmed) return <span className="text-slate-300">-</span>;
  return <span className="whitespace-pre-line">{trimmed}</span>;
}

/* =========================================================
   ฟอร์มแก้ไข
========================================================= */

/** ทุกช่องเป็นสตริงในฟอร์ม — ค่าว่างหมายถึง "ลบข้อมูลนี้ทิ้ง" */
type ProfileForm = {
  displayName: string;
  phone: string;

  maritalStatus: string;
  nationality: string;
  religion: string;
  bloodType: string;
  lineId: string;
  personalEmail: string;

  currentAddress: string;
  registeredAddress: string;

  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  emergencyContactAddress: string;
  emergencyContactName2: string;
  emergencyContactPhone2: string;
  emergencyContactRelation2: string;
  emergencyContactAddress2: string;

  educationLevel: string;
  educationInstitute: string;
  educationMajor: string;
};

type ProfileFormField = keyof ProfileForm;

function seedForm(profile: MyProfileResponse): ProfileForm {
  const personal = profile.employee?.profile ?? null;

  return {
    displayName: profile.user.displayName ?? "",
    phone: profile.user.phone ?? "",

    maritalStatus: personal?.maritalStatus || "NOT_SPECIFIED",
    nationality: personal?.nationality ?? "",
    religion: personal?.religion ?? "",
    bloodType: personal?.bloodType ?? "",
    lineId: personal?.lineId ?? "",
    personalEmail: personal?.personalEmail ?? "",

    currentAddress: personal?.currentAddress ?? "",
    registeredAddress: personal?.registeredAddress ?? "",

    emergencyContactName: personal?.emergencyContactName ?? "",
    emergencyContactPhone: personal?.emergencyContactPhone ?? "",
    emergencyContactRelation: personal?.emergencyContactRelation ?? "",
    emergencyContactAddress: personal?.emergencyContactAddress ?? "",
    emergencyContactName2: personal?.emergencyContactName2 ?? "",
    emergencyContactPhone2: personal?.emergencyContactPhone2 ?? "",
    emergencyContactRelation2: personal?.emergencyContactRelation2 ?? "",
    emergencyContactAddress2: personal?.emergencyContactAddress2 ?? "",

    educationLevel: personal?.educationLevel ?? "",
    educationInstitute: personal?.educationInstitute ?? "",
    educationMajor: personal?.educationMajor ?? "",
  };
}

/** ส่งขึ้น backend เฉพาะช่องที่ค่าเปลี่ยนจริง — จะได้ไม่ไปทับของที่ HR เพิ่งแก้ */
function buildChangedPayload(initial: ProfileForm, next: ProfileForm) {
  const payload: UpdateMyProfilePayload = {};
  let changed = false;

  for (const field of Object.keys(next) as ProfileFormField[]) {
    const value = next[field].trim();
    if (value === initial[field].trim()) continue;

    // ช่องอื่นส่งค่าว่างไปได้ backend จะเก็บเป็น null ให้ = ลบข้อมูลทิ้ง
    payload[field] = value;
    changed = true;
  }

  return changed ? payload : null;
}

/** รูปจากมือถือมักใหญ่เกินเพดาน 2MB ของ backend จึงย่อให้ก่อนส่ง */
async function toUploadableAvatar(file: File) {
  if (AVATAR_MIME_TYPES.includes(file.type) && file.size <= AVATAR_MAX_BYTES) {
    return file;
  }

  const dataUrl = await compressImageToDataUrl(file);
  const blob = await (await fetch(dataUrl)).blob();

  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

export function MyProfilePanel() {
  const { refreshMe } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = useApiQuery<MyProfileResponse>(queryKeys.ess.profile(), () =>
    getMyProfile(),
  );

  /* ฟอร์มสร้างตอนกดแก้ไขเท่านั้น — null คือกำลังอยู่ในโหมดอ่าน */
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [initialForm, setInitialForm] = useState<ProfileForm | null>(null);

  const saveMutation = useApiMutation(
    (payload: UpdateMyProfilePayload) => updateMyProfile(payload),
    {
      invalidates: [queryKeys.ess.profile()],
      successMessage: "บันทึกข้อมูลของฉันเรียบร้อย",
      onSuccess: async () => {
        setForm(null);
        setInitialForm(null);
        // ชื่อที่แสดงโผล่อยู่บนแถบบนและเมนูผู้ใช้ ต้องรีเฟรชตามด้วย
        await refreshMe();
      },
    },
  );

  const avatarMutation = useApiMutation(
    (file: File | null) => (file ? uploadMyAvatar(file) : deleteMyAvatar()),
    {
      invalidates: [queryKeys.ess.profile()],
      onSuccess: async () => {
        await refreshMe();
      },
    },
  );

  if (query.isPending) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <LoadingState title="กำลังโหลดแฟ้มข้อมูลของฉัน" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <ErrorState
          title="โหลดข้อมูลไม่สำเร็จ"
          description={getErrorMessage(
            query.error,
            "ไม่สามารถโหลดข้อมูลส่วนตัวของฉันได้",
          )}
          action={
            <Button variant="primary" onClick={() => void query.refetch()}>
              ลองใหม่
            </Button>
          }
        />
      </div>
    );
  }

  const profile = query.data;
  const employee = profile?.employee ?? null;
  const personal = employee?.profile ?? null;
  const user = profile?.user;

  if (!profile || !employee || !user) {
    return (
      <div className="px-5 py-6 sm:px-6">
        <EmptyState
          title="ยังไม่พบข้อมูลพนักงานที่ผูกกับบัญชีนี้"
          description="บัญชีผู้ใช้งานนี้เข้าสู่ระบบได้แล้ว แต่ยังไม่มีข้อมูลพนักงานในระบบ HR กรุณาติดต่อฝ่าย HR หรือผู้ดูแลระบบ"
        />
      </div>
    );
  }

  const roleText =
    user.roles
      ?.map((role) => role.name || role.code)
      .filter(Boolean)
      .join(" · ") || "-";

  const avatarUrl = getPublicFileUrl(user.avatarUrl);

  function startEdit() {
    if (!profile) return;

    const seeded = seedForm(profile);
    setForm(seeded);
    setInitialForm(seeded);
  }

  function cancelEdit() {
    setForm(null);
    setInitialForm(null);
  }

  function setField(field: ProfileFormField, value: string) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function submit() {
    if (!form || !initialForm) return;

    if (!form.displayName.trim()) {
      toast.error("กรุณากรอกชื่อที่แสดงในระบบ");
      return;
    }

    const payload = buildChangedPayload(initialForm, form);

    if (!payload) {
      toast.info("ยังไม่มีข้อมูลที่เปลี่ยนแปลง");
      cancelEdit();
      return;
    }

    saveMutation.mutate(payload);
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    let uploadable: File;

    try {
      uploadable = await toUploadableAvatar(file);
    } catch (error) {
      // ย่อรูปไม่ผ่าน (ไฟล์เสียหรือรูปละเอียดเกินไป) — ยังไม่ได้ยิง API
      toast.error(getErrorMessage(error, "เตรียมรูปโปรไฟล์ไม่สำเร็จ"));
      return;
    }

    // error ของ API มี toast ของ useApiMutation อยู่แล้ว จึงกลืน reject ทิ้ง
    await avatarMutation.mutateAsync(uploadable).then(
      () => toast.success("เปลี่ยนรูปโปรไฟล์เรียบร้อย"),
      () => undefined,
    );
  }

  async function removeAvatar() {
    await avatarMutation.mutateAsync(null).then(
      () => toast.success("ลบรูปโปรไฟล์เรียบร้อย"),
      () => undefined,
    );
  }

  /* ---------------------------------------------------------
     โหมดแก้ไข — แสดงเฉพาะช่องที่พนักงานแก้เองได้
  --------------------------------------------------------- */
  if (form) {
    const busy = saveMutation.isPending || avatarMutation.isPending;

    return (
      <div className="min-w-0">
        <Toolbar>
          <p className="min-w-0 flex-1 text-[12.5px] leading-5 text-slate-500 3xl:text-[13px]">
            แก้ได้เฉพาะข้อมูลที่คุณดูแลเอง — สังกัด ตำแหน่ง สถานะการจ้าง
            เลขบัตรประชาชน และบัญชีธนาคาร ต้องแจ้งฝ่าย HR ให้แก้ให้
          </p>

          <Button
            icon={<X className="h-3.5 w-3.5" />}
            onClick={cancelEdit}
            disabled={busy}
          >
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={saveMutation.isPending}
            disabled={busy}
          >
            บันทึก
          </Button>
        </Toolbar>

        <InfoSection title="รูปโปรไฟล์และชื่อที่แสดง">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={form.displayName || "-"} src={avatarUrl} size="lg" />

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleAvatarChange(event)}
              />
              <Button
                icon={<Camera className="h-3.5 w-3.5" />}
                onClick={() => fileInputRef.current?.click()}
                loading={avatarMutation.isPending}
                disabled={busy}
              >
                เปลี่ยนรูป
              </Button>
              {user.avatarUrl ? (
                <Button
                  variant="danger"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => void removeAvatar()}
                  disabled={busy}
                >
                  ลบรูป
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-slate-400 3xl:text-[12.5px]">
              รองรับ JPG, PNG หรือ WEBP — รูปใหญ่เกิน 2MB ระบบจะย่อให้เอง
            </p>
          </div>

          <FieldGrid className="mt-4">
            <Field
              label="ชื่อที่แสดงในระบบ"
              required
              hint="ชื่อนี้จะขึ้นบนแถบบนและในรายการอนุมัติ"
            >
              <TextInput
                value={form.displayName}
                maxLength={120}
                onChange={(event) =>
                  setField("displayName", event.target.value)
                }
              />
            </Field>
          </FieldGrid>
        </InfoSection>

        <InfoSection title="ข้อมูลส่วนตัว">
          <FieldGrid columns={3}>
            <Field label="สถานภาพสมรส">
              <Select
                value={form.maritalStatus}
                onChange={(event) =>
                  setField("maritalStatus", event.target.value)
                }
              >
                {MARITAL_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {maritalStatusLabels[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="สัญชาติ">
              <TextInput
                value={form.nationality}
                maxLength={60}
                onChange={(event) => setField("nationality", event.target.value)}
              />
            </Field>
            <Field label="ศาสนา">
              <TextInput
                value={form.religion}
                maxLength={60}
                onChange={(event) => setField("religion", event.target.value)}
              />
            </Field>
            <Field label="กรุ๊ปเลือด">
              <TextInput
                value={form.bloodType}
                maxLength={10}
                onChange={(event) => setField("bloodType", event.target.value)}
              />
            </Field>
          </FieldGrid>
        </InfoSection>

        <InfoSection title="ข้อมูลติดต่อและที่อยู่">
          <FieldGrid columns={3}>
            <Field label="เบอร์โทรส่วนตัว">
              <TextInput
                value={form.phone}
                maxLength={30}
                inputMode="tel"
                onChange={(event) => setField("phone", event.target.value)}
              />
            </Field>
            <Field label="อีเมลส่วนตัว">
              <TextInput
                value={form.personalEmail}
                maxLength={120}
                inputMode="email"
                onChange={(event) =>
                  setField("personalEmail", event.target.value)
                }
              />
            </Field>
            <Field label="LINE ID">
              <TextInput
                value={form.lineId}
                maxLength={60}
                onChange={(event) => setField("lineId", event.target.value)}
              />
            </Field>
          </FieldGrid>

          <FieldGrid className="mt-4">
            <Field label="ที่อยู่ปัจจุบัน">
              <Textarea
                value={form.currentAddress}
                maxLength={500}
                onChange={(event) =>
                  setField("currentAddress", event.target.value)
                }
              />
            </Field>
            <Field label="ที่อยู่ตามทะเบียนบ้าน">
              <Textarea
                value={form.registeredAddress}
                maxLength={500}
                onChange={(event) =>
                  setField("registeredAddress", event.target.value)
                }
              />
            </Field>
          </FieldGrid>

          <p className="mt-2 text-xs text-slate-400 3xl:text-[12.5px]">
            อีเมลหลักและเบอร์โทรที่ทำงานเป็นข้อมูลที่ฝ่าย HR ดูแล (อีเมลหลักใช้เป็นอีเมลล็อกอินด้วย)
          </p>
        </InfoSection>

        <InfoSection title="ผู้ติดต่อฉุกเฉิน">
          <FieldGrid columns={3}>
            <Field label="ชื่อผู้ติดต่อ">
              <TextInput
                value={form.emergencyContactName}
                maxLength={120}
                onChange={(event) =>
                  setField("emergencyContactName", event.target.value)
                }
              />
            </Field>
            <Field label="ความสัมพันธ์">
              <TextInput
                value={form.emergencyContactRelation}
                maxLength={60}
                onChange={(event) =>
                  setField("emergencyContactRelation", event.target.value)
                }
              />
            </Field>
            <Field label="เบอร์โทร">
              <TextInput
                value={form.emergencyContactPhone}
                maxLength={30}
                inputMode="tel"
                onChange={(event) =>
                  setField("emergencyContactPhone", event.target.value)
                }
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={1} className="mt-4">
            <Field label="ที่อยู่ผู้ติดต่อ">
              <Textarea
                rows={2}
                value={form.emergencyContactAddress}
                maxLength={500}
                onChange={(event) =>
                  setField("emergencyContactAddress", event.target.value)
                }
              />
            </Field>
          </FieldGrid>

          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            ผู้ติดต่อสำรอง
          </p>

          <FieldGrid columns={3}>
            <Field label="ชื่อผู้ติดต่อ 2">
              <TextInput
                value={form.emergencyContactName2}
                maxLength={120}
                onChange={(event) =>
                  setField("emergencyContactName2", event.target.value)
                }
              />
            </Field>
            <Field label="ความสัมพันธ์ 2">
              <TextInput
                value={form.emergencyContactRelation2}
                maxLength={60}
                onChange={(event) =>
                  setField("emergencyContactRelation2", event.target.value)
                }
              />
            </Field>
            <Field label="เบอร์โทร 2">
              <TextInput
                value={form.emergencyContactPhone2}
                maxLength={30}
                inputMode="tel"
                onChange={(event) =>
                  setField("emergencyContactPhone2", event.target.value)
                }
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={1} className="mt-4">
            <Field label="ที่อยู่ผู้ติดต่อ 2">
              <Textarea
                rows={2}
                value={form.emergencyContactAddress2}
                maxLength={500}
                onChange={(event) =>
                  setField("emergencyContactAddress2", event.target.value)
                }
              />
            </Field>
          </FieldGrid>
        </InfoSection>

        <InfoSection title="การศึกษา">
          <FieldGrid columns={3}>
            <Field label="ระดับการศึกษา">
              <TextInput
                value={form.educationLevel}
                maxLength={120}
                onChange={(event) =>
                  setField("educationLevel", event.target.value)
                }
              />
            </Field>
            <Field label="สถาบัน">
              <TextInput
                value={form.educationInstitute}
                maxLength={160}
                onChange={(event) =>
                  setField("educationInstitute", event.target.value)
                }
              />
            </Field>
            <Field label="สาขาวิชา">
              <TextInput
                value={form.educationMajor}
                maxLength={160}
                onChange={(event) =>
                  setField("educationMajor", event.target.value)
                }
              />
            </Field>
          </FieldGrid>
        </InfoSection>

        <div className="px-5 py-4 sm:px-6 3xl:px-7">
          <Notice tone="info">
            บัญชีธนาคาร เลขบัตรประชาชน วันเกิด และเพศ
            ใช้ยืนยันตัวตนกับงานเงินเดือนและงานราชการ
            หากไม่ถูกต้องกรุณาแจ้งฝ่าย HR พร้อมเอกสารประกอบ
          </Notice>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------
     โหมดอ่าน
  --------------------------------------------------------- */
  return (
    <div className="min-w-0">
      <Toolbar>
        <p className="min-w-0 flex-1 text-[12.5px] leading-5 text-slate-500 3xl:text-[13px]">
          ช่วยตรวจข้อมูลของคุณให้เป็นปัจจุบันเสมอ
          โดยเฉพาะที่อยู่และผู้ติดต่อฉุกเฉิน
        </p>

        <Button
          variant="primary"
          icon={<Pencil className="h-3.5 w-3.5" />}
          onClick={startEdit}
        >
          แก้ไขข้อมูล
        </Button>
      </Toolbar>

      <InfoSection title="สังกัดและการจ้างงาน">
        <InfoGrid>
          <InfoItem label="บริษัท" value={masterText(employee.company)} />
          <InfoItem label="สาขา" value={masterText(employee.branch)} />
          <InfoItem
            label="ฝ่าย / กลุ่มงาน"
            value={masterText(employee.division)}
          />
          <InfoItem label="แผนก" value={masterText(employee.department)} />
          <InfoItem
            label="ตำแหน่ง"
            value={text(employee.positionMaster?.nameTh || employee.position)}
          />
          <InfoItem
            label="รหัสตำแหน่ง"
            value={masterText(employee.positionMaster)}
          />
          <InfoItem
            label="หัวหน้างานโดยตรง"
            value={personText(employee.supervisor)}
          />
          <InfoItem
            label="ติดต่อหัวหน้างาน"
            value={
              employee.supervisor
                ? [employee.supervisor.phone, employee.supervisor.email]
                    .map((part) => part?.trim())
                    .filter(Boolean)
                    .join(" · ") || "-"
                : "-"
            }
          />
          <InfoItem
            label="ประเภทการจ้าง"
            value={text(employee.employeeType?.nameTh)}
          />
          <InfoItem
            label="สถานะการจ้างงาน"
            value={
              <StatusBadge
                vocabulary={EMPLOYEE_STATUS}
                status={employee.status}
              />
            }
          />
          <InfoItem
            label="วันที่เริ่มงาน"
            value={formatThaiDate(employee.startDate)}
          />
          <InfoItem
            label="สิ้นสุดทดลองงาน"
            value={formatThaiDate(employee.probationEndDate)}
          />
        </InfoGrid>
      </InfoSection>

      <InfoSection title="ข้อมูลระบุตัวตน">
        <InfoGrid>
          <InfoItem label="คำนำหน้า" value={text(employee.title)} />
          <InfoItem label="ชื่อ" value={text(employee.firstName)} />
          <InfoItem label="นามสกุล" value={text(employee.lastName)} />
          <InfoItem label="ชื่อเล่น" value={text(employee.nickname)} />
          <InfoItem label="รหัสพนักงาน" value={text(employee.employeeCode)} />
          <InfoItem
            label="วันเกิด"
            value={formatThaiDate(personal?.birthDate)}
          />
          <InfoItem label="อายุ" value={ageText(personal?.birthDate)} />
          <InfoItem
            label="เพศ"
            value={labelOf(personal?.gender, genderLabels)}
          />
          <InfoItem
            label="สถานภาพสมรส"
            value={labelOf(personal?.maritalStatus, maritalStatusLabels)}
          />
          <InfoItem label="สัญชาติ" value={text(personal?.nationality)} />
          <InfoItem label="ศาสนา" value={text(personal?.religion)} />
          <InfoItem label="กรุ๊ปเลือด" value={text(personal?.bloodType)} />
          <InfoItem label="เลขบัตรประชาชน" value={text(personal?.nationalId)} />
          <InfoItem label="หนังสือเดินทาง" value={text(personal?.passportNo)} />
        </InfoGrid>
      </InfoSection>

      <InfoSection title="ข้อมูลติดต่อและที่อยู่">
        <InfoGrid>
          <InfoItem label="อีเมล" value={text(employee.email)} />
          <InfoItem label="เบอร์โทรที่ทำงาน" value={text(employee.phone)} />
          <InfoItem label="เบอร์โทรส่วนตัว" value={text(user.phone)} />
          <InfoItem
            label="อีเมลส่วนตัว"
            value={text(personal?.personalEmail)}
          />
          <InfoItem label="LINE ID" value={text(personal?.lineId)} />
          <InfoItem
            label="ที่อยู่ปัจจุบัน"
            wide
            value={<AddressText value={personal?.currentAddress} />}
          />
          <InfoItem
            label="ที่อยู่ตามทะเบียนบ้าน"
            wide
            value={<AddressText value={personal?.registeredAddress} />}
          />
        </InfoGrid>
      </InfoSection>

      <InfoSection title="ผู้ติดต่อฉุกเฉิน">
        <InfoGrid>
          <InfoItem
            label="ชื่อผู้ติดต่อ"
            value={text(personal?.emergencyContactName)}
          />
          <InfoItem
            label="ความสัมพันธ์"
            value={text(personal?.emergencyContactRelation)}
          />
          <InfoItem
            label="เบอร์โทร"
            value={text(personal?.emergencyContactPhone)}
          />
          {personal?.emergencyContactAddress ? (
            <InfoItem
              label="ที่อยู่ผู้ติดต่อ"
              full
              value={<AddressText value={personal.emergencyContactAddress} />}
            />
          ) : null}

          {/* คนที่สอง — โชว์เฉพาะเมื่อกรอกไว้ */}
          {personal?.emergencyContactName2 ? (
            <>
              <InfoItem
                label="ชื่อผู้ติดต่อ 2"
                value={text(personal?.emergencyContactName2)}
              />
              <InfoItem
                label="ความสัมพันธ์ 2"
                value={text(personal?.emergencyContactRelation2)}
              />
              <InfoItem
                label="เบอร์โทร 2"
                value={text(personal?.emergencyContactPhone2)}
              />
              {personal.emergencyContactAddress2 ? (
                <InfoItem
                  label="ที่อยู่ผู้ติดต่อ 2"
                  full
                  value={
                    <AddressText value={personal.emergencyContactAddress2} />
                  }
                />
              ) : null}
            </>
          ) : null}
        </InfoGrid>
      </InfoSection>

      <InfoSection title="การศึกษาและบัญชีธนาคาร">
        <InfoGrid>
          <InfoItem
            label="ระดับการศึกษา"
            value={text(personal?.educationLevel)}
          />
          <InfoItem label="สถาบัน" value={text(personal?.educationInstitute)} />
          <InfoItem label="สาขาวิชา" value={text(personal?.educationMajor)} />
          <InfoItem label="ธนาคาร" value={text(personal?.bankName)} />
          <InfoItem label="ชื่อบัญชี" value={text(personal?.bankAccountName)} />
          <InfoItem
            label="เลขที่บัญชี"
            value={
              <span className="tabular-nums">
                {text(personal?.bankAccountNo)}
              </span>
            }
          />
        </InfoGrid>
      </InfoSection>

      <InfoSection title="บัญชีผู้ใช้งาน">
        <InfoGrid>
          <InfoItem label="ชื่อที่แสดงในระบบ" value={text(user.displayName)} />
          <InfoItem label="อีเมลที่ใช้เข้าระบบ" value={text(user.email)} />
          <InfoItem
            label="สถานะบัญชี"
            value={labelOf(user.status, userStatusLabels)}
          />
          <InfoItem
            label="เข้าสู่ระบบล่าสุด"
            value={formatThaiDateTime(user.lastLoginAt)}
          />
          <InfoItem label="บทบาทในระบบ" value={roleText} wide />
        </InfoGrid>
      </InfoSection>

      {personal?.note?.trim() ? (
        <InfoSection title="หมายเหตุจากแฟ้มพนักงาน">
          <InfoGrid columns={2}>
            <InfoItem
              label="หมายเหตุ"
              wide
              value={<AddressText value={personal.note} />}
            />
          </InfoGrid>
        </InfoSection>
      ) : null}
    </div>
  );
}
