"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ImageIcon,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Field,
  FieldGrid,
  Modal,
  Section,
  Select,
  TextInput,
  Textarea,
  joinClassName,
} from "@/components/kit";
import { ApiClientError, apiFetch, getPublicFileUrl } from "@/lib/api";
import type { CompanyItem, MasterStatus } from "@/types/organization";

const COMPANY_LOGO_MAX_SIZE = 2 * 1024 * 1024;

const emptyCreateForm = {
  code: "",
  nameTh: "",
  nameEn: "",
  taxId: "",
  phone: "",
  email: "",
  address: "",
};

/**
 * ฟอร์มข้อมูลบริษัทอยู่ในหน้าเลย ไม่ใช่ modal เพราะเป็นข้อมูลที่ต้องกลับมาแก้บ่อย
 * และถูกใช้ต่อในเอกสาร/สลิป/รายงาน — ยกมาจาก CompanyInfoPanel เดิมทั้งฟิลด์และข้อความ
 */
export function CompanyPanel({
  companyId,
  companies,
  onChanged,
}: {
  companyId: string;
  companies: CompanyItem[];
  /** เรียกทุกครั้งที่บันทึก/อัปโหลดโลโก้/สร้างบริษัทใหม่ เพื่อให้หน้าหลักรีเฟรชรายการอ้างอิง */
  onChanged: () => Promise<void> | void;
}) {
  const company = companies.find((item) => item.id === companyId);

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);

  // ซิงก์ฟอร์มบริษัทเมื่อสลับบริษัทหรือโหลดข้อมูลใหม่
  useEffect(() => {
    if (!company) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์ฟอร์มกับ prop ที่มาจาก fetch ภายนอก ไม่ใช่ state ภายในคอมโพเนนต์
      setForm({});
      return;
    }

    setForm({
      code: company.code ?? "",
      nameTh: company.nameTh ?? "",
      nameEn: company.nameEn ?? "",
      taxId: company.taxId ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      address: company.address ?? "",
      socialSecurityAccountNo: company.socialSecurityAccountNo ?? "",
      socialSecurityBranchNo: company.socialSecurityBranchNo ?? "",
      workmenCompensationCode: company.workmenCompensationCode ?? "",
      workmenCompensationRate:
        company.workmenCompensationRate === null ||
        company.workmenCompensationRate === undefined
          ? ""
          : String(company.workmenCompensationRate),
      bankCompanyCode: company.bankCompanyCode ?? "",
      bankDebitAccountNo: company.bankDebitAccountNo ?? "",
      status: company.status ?? "ACTIVE",
    });
  }, [company]);

  function updateForm(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** ฟิลด์ที่ถูกใช้เป็นหัวจดหมายในหนังสือรับรอง — ขาดแล้วเอกสารออกมาไม่สมบูรณ์ */
  const readiness = [
    { key: "address", label: "ที่อยู่บริษัท", ok: Boolean(company?.address) },
    {
      key: "taxId",
      label: "เลขประจำตัวผู้เสียภาษี",
      ok: Boolean(company?.taxId),
    },
    { key: "phone", label: "เบอร์โทร", ok: Boolean(company?.phone) },
    { key: "logoUrl", label: "โลโก้บริษัท", ok: Boolean(company?.logoUrl) },
  ];
  const missing = readiness.filter((item) => !item.ok);

  async function handleSave() {
    if (!company) return;

    if (!form.nameTh?.trim()) {
      toast.error("กรุณาระบุชื่อบริษัทภาษาไทย");
      return;
    }

    try {
      setSaving(true);

      await apiFetch(`/organization/companies/${company.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nameTh: form.nameTh.trim(),
          nameEn: form.nameEn?.trim() || null,
          taxId: form.taxId?.trim() || null,
          phone: form.phone?.trim() || null,
          email: form.email?.trim() || null,
          address: form.address?.trim() || null,
          socialSecurityAccountNo: form.socialSecurityAccountNo?.trim() || null,
          socialSecurityBranchNo: form.socialSecurityBranchNo?.trim() || null,
          workmenCompensationCode: form.workmenCompensationCode?.trim() || null,
          /*
           * ช่องว่างต้องส่ง null ไม่ใช่ 0 — 0 แปลว่า "อัตราเงินสมทบศูนย์" ซึ่งคนละ
           * ความหมายกับ "ยังไม่ได้กรอก" และจะทำให้แบบ กท.20 ไม่ขึ้นเตือนว่าข้อมูลขาด
           */
          workmenCompensationRate: form.workmenCompensationRate?.trim()
            ? Number(form.workmenCompensationRate)
            : null,
          bankCompanyCode: form.bankCompanyCode?.trim() || null,
          bankDebitAccountNo: form.bankDebitAccountNo?.trim() || null,
          status: (form.status as MasterStatus) || "ACTIVE",
        }),
      });

      toast.success("บันทึกข้อมูลบริษัทแล้ว");
      await onChanged();
    } catch (error) {
      handleApiError(error, "บันทึกข้อมูลบริษัทไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadLogo(file?: File | null) {
    if (!company || !file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    if (file.size > COMPANY_LOGO_MAX_SIZE) {
      toast.error("ขนาดไฟล์โลโก้ต้องไม่เกิน 2 MB");
      return;
    }

    const formData = new FormData();
    formData.append("logo", file);

    try {
      setUploading(true);

      await apiFetch<CompanyItem>(
        `/organization/companies/${company.id}/logo`,
        {
          method: "POST",
          body: formData,
        },
      );

      toast.success("อัปเดตโลโก้บริษัทแล้ว");
      await onChanged();
    } catch (error) {
      handleApiError(error, "อัปโหลดโลโก้บริษัทไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteLogo() {
    if (!company) return;

    try {
      setUploading(true);

      await apiFetch<CompanyItem>(
        `/organization/companies/${company.id}/logo`,
        {
          method: "DELETE",
        },
      );

      toast.success("ลบโลโก้บริษัทแล้ว");
      await onChanged();
    } catch (error) {
      handleApiError(error, "ลบโลโก้บริษัทไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!createForm.code.trim() || !createForm.nameTh.trim()) {
      toast.error("กรุณากรอกรหัสและชื่อบริษัทภาษาไทย");
      return;
    }

    try {
      setCreating(true);

      await apiFetch("/organization/companies", {
        method: "POST",
        body: JSON.stringify({
          code: createForm.code.trim(),
          nameTh: createForm.nameTh.trim(),
          nameEn: createForm.nameEn.trim() || undefined,
          taxId: createForm.taxId.trim() || undefined,
          phone: createForm.phone.trim() || undefined,
          email: createForm.email.trim() || undefined,
          address: createForm.address.trim() || undefined,
        }),
      });

      toast.success("เพิ่มบริษัทสำเร็จ");
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      await onChanged();
    } catch (error) {
      handleApiError(error, "เพิ่มบริษัทไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  if (!company) {
    return (
      <>
        <div className="px-5 py-14 text-center 3xl:px-6">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="text-[13px] font-semibold text-slate-600">
              ยังไม่ได้เลือกบริษัท
            </span>
            <span className="text-[13px] text-slate-500">
              เลือกบริษัทจากด้านบน หรือสร้างบริษัทใหม่เพื่อเริ่มตั้งค่า
            </span>
            <Button
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}
            >
              เพิ่มบริษัท
            </Button>
          </div>
        </div>

        <CreateCompanyModal
          open={createOpen}
          form={createForm}
          creating={creating}
          onChange={(key, value) =>
            setCreateForm((current) => ({ ...current, [key]: value }))
          }
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreateCompany}
        />
      </>
    );
  }

  const logoUrl = company.logoUrl ? getPublicFileUrl(company.logoUrl) : null;

  return (
    <>
      {/*
        1. ตัวตนของบริษัท — โลโก้ ชื่อ รหัส สถานะ และความพร้อมของข้อมูล อยู่แถบเดียว
        เดิมโลโก้กินบล็อกของตัวเองทั้งบล็อก ทั้งที่เป็นข้อมูลชิ้นเดียว
      */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4 border-b border-slate-200 bg-brand-50/40 px-5 py-4 sm:px-6 3xl:px-7">
        <div className="grid h-[86px] w-[150px] shrink-0 place-items-center overflow-hidden rounded-xl border border-brand-100 bg-white">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={company.nameTh}
              width={200}
              height={100}
              unoptimized
              className="max-h-[74px] w-auto object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-300">
              <ImageIcon className="h-5 w-5" />
              <span className="text-[10.5px] font-semibold">ยังไม่มีโลโก้</span>
            </div>
          )}
        </div>

        <div className="min-w-[14rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[16px] font-bold text-slate-900 3xl:text-[17px]">
              {company.nameTh}
            </p>
            <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
              {company.code}
            </span>
            <Badge tone={company.status === "ACTIVE" ? "positive" : "neutral"}>
              {company.status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
            </Badge>
          </div>

          <p className="truncate text-[12px] text-slate-500 3xl:text-[12.5px]">
            {[company.nameEn, company.taxId ? `เลขภาษี ${company.taxId}` : null]
              .filter(Boolean)
              .join(" · ") || "ยังไม่ได้กรอกชื่อภาษาอังกฤษและเลขผู้เสียภาษี"}
          </p>

          {/* ความพร้อมของข้อมูล — บอกจำนวนที่ขาดก่อน แล้วค่อยไล่ชื่อช่อง */}
          <p
            className={joinClassName(
              "mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] 3xl:text-[12px]",
              missing.length > 0 ? "text-amber-700" : "text-emerald-700",
            )}
          >
            {missing.length > 0 ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="font-semibold">
                  ยังไม่ได้กรอก {missing.length} ช่อง —
                  หัวจดหมายในหนังสือรับรองจะไม่สมบูรณ์:
                </span>
                <span className="text-amber-600">
                  {missing.map((item) => item.label).join(" · ")}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="font-semibold">
                  ข้อมูลครบ พร้อมใช้เป็นหัวจดหมายในหนังสือรับรองและสลิปเงินเดือน
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              handleUploadLogo(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          <Button
            size="sm"
            icon={<Upload className="h-3.5 w-3.5" />}
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {logoUrl ? "เปลี่ยนโลโก้" : "อัปโหลดโลโก้"}
          </Button>

          {logoUrl ? (
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              disabled={uploading}
              onClick={handleDeleteLogo}
            >
              ลบโลโก้
            </Button>
          ) : null}
        </div>
      </div>

      {/* 2. ข้อมูลที่ไปโผล่บนหัวจดหมายและสลิป */}
      <Section
        title="ข้อมูลที่ใช้บนเอกสาร"
        description="ชื่อ เลขผู้เสียภาษี ที่อยู่ และช่องทางติดต่อ จะถูกพิมพ์บนหนังสือรับรองและสลิปเงินเดือน"
      >
        <FieldGrid columns={2}>
          <Field label="ชื่อบริษัทภาษาไทย" required>
            <TextInput
              value={form.nameTh ?? ""}
              onChange={(event) => updateForm("nameTh", event.target.value)}
              placeholder="ชื่อบริษัท"
            />
          </Field>

          <Field label="ชื่อบริษัทภาษาอังกฤษ">
            <TextInput
              value={form.nameEn ?? ""}
              onChange={(event) => updateForm("nameEn", event.target.value)}
              placeholder="Example Co., Ltd."
            />
          </Field>

          <Field label="เลขประจำตัวผู้เสียภาษี">
            <TextInput
              value={form.taxId ?? ""}
              onChange={(event) => updateForm("taxId", event.target.value)}
              placeholder="13 หลัก"
            />
          </Field>

          <Field label="เบอร์โทร">
            <TextInput
              value={form.phone ?? ""}
              onChange={(event) => updateForm("phone", event.target.value)}
              placeholder="02-000-0000"
            />
          </Field>

          <Field label="อีเมล">
            <TextInput
              value={form.email ?? ""}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="contact@company.com"
            />
          </Field>

          {/* รหัสกับสถานะเป็นค่าที่แก้ไม่บ่อย จึงอยู่ท้ายกลุ่ม */}
          <Field label="สถานะ">
            <Select
              value={form.status ?? "ACTIVE"}
              onChange={(event) => updateForm("status", event.target.value)}
            >
              <option value="ACTIVE">เปิดใช้งาน</option>
              <option value="INACTIVE">ปิดใช้งาน</option>
            </Select>
          </Field>
        </FieldGrid>

        <Field label="ที่อยู่บริษัท" className="mt-4">
          <Textarea
            value={form.address ?? ""}
            onChange={(event) => updateForm("address", event.target.value)}
            placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
          />
        </Field>
      </Section>

      {/* 3. เลขที่ใช้ตอนออกไฟล์นำส่ง แยกเป็นสองชุดตามหน่วยงานปลายทาง */}
      <Section
        title="ประกันสังคมและกองทุนเงินทดแทน"
        description="ใช้ตอนดาวน์โหลดแบบ สปส.1-10 และ กท.20 · ขอเลขเหล่านี้จากสำนักงานประกันสังคม"
      >
        <FieldGrid columns={2}>
          <Field
            label="เลขที่บัญชีนายจ้าง (ประกันสังคม)"
            hint="ปรากฏบนหัวแบบ สปส.1-10"
          >
            <TextInput
              value={form.socialSecurityAccountNo ?? ""}
              onChange={(event) =>
                updateForm("socialSecurityAccountNo", event.target.value)
              }
              placeholder="10 หลัก"
            />
          </Field>

          <Field
            label="ลำดับที่สาขา (ประกันสังคม)"
            hint="ถ้าไม่ได้แยกขึ้นทะเบียนเป็นสาขา ให้ใส่ 000"
          >
            <TextInput
              value={form.socialSecurityBranchNo ?? ""}
              onChange={(event) =>
                updateForm("socialSecurityBranchNo", event.target.value)
              }
              placeholder="000"
            />
          </Field>

          <Field
            label="รหัสกิจการ (กองทุนเงินทดแทน)"
            hint="ใช้ในแบบ กท.20 และ กท.20ก คนละรหัสกับประกันสังคม"
          >
            <TextInput
              value={form.workmenCompensationCode ?? ""}
              onChange={(event) =>
                updateForm("workmenCompensationCode", event.target.value)
              }
              placeholder="เช่น 10100"
            />
          </Field>

          <Field
            label="อัตราเงินสมทบกองทุนเงินทดแทน (%)"
            hint="กฎหมายกำหนด 0.2-1.0% ตามความเสี่ยงของประเภทกิจการ"
          >
            <TextInput
              value={form.workmenCompensationRate ?? ""}
              onChange={(event) =>
                updateForm("workmenCompensationRate", event.target.value)
              }
              placeholder="เช่น 0.2"
            />
          </Field>
        </FieldGrid>
      </Section>

      <Section
        title="ธนาคารที่ใช้จ่ายเงินเดือน"
        description="ใช้ตอนสร้างไฟล์โอนเงินเดือน · ขอเลขจากธนาคารที่เปิดบัญชีจ่ายเงินเดือน"
      >
        <FieldGrid columns={2}>
          <Field label="รหัสบริษัทที่ธนาคารออกให้">
            <TextInput
              value={form.bankCompanyCode ?? ""}
              onChange={(event) =>
                updateForm("bankCompanyCode", event.target.value)
              }
              placeholder="เช่น รหัส Company ID จากกรุงไทย"
            />
          </Field>

          <Field label="บัญชีบริษัทที่ใช้ตัดจ่าย">
            <TextInput
              value={form.bankDebitAccountNo ?? ""}
              onChange={(event) =>
                updateForm("bankDebitAccountNo", event.target.value)
              }
              placeholder="เลขที่บัญชีเงินฝาก"
            />
          </Field>
        </FieldGrid>
      </Section>

      {/*
        แถบบันทึกท้ายหน้า — ค้างอยู่ล่างจอ กรอกช่องไหนอยู่ก็กดบันทึกได้ทันที
        ไม่ต้องเลื่อนกลับไปหาปุ่มที่ท้ายกลุ่มใดกลุ่มหนึ่ง
      */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 bg-white/95 px-5 py-3 backdrop-blur sm:px-6 3xl:px-7">
        <p className="text-[12px] text-slate-500 3xl:text-[12.5px]">
          รหัสบริษัท{" "}
          <span className="font-semibold text-slate-800">{company.code}</span>{" "}
          แก้ไขไม่ได้ เพราะถูกใช้อ้างอิงในเลขที่หนังสือและไฟล์นำส่ง
        </p>

        <Button variant="primary" loading={saving} onClick={handleSave}>
          บันทึกข้อมูลบริษัท
        </Button>
      </div>
    </>
  );
}

function CreateCompanyModal({
  open,
  form,
  creating,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: typeof emptyCreateForm;
  creating: boolean;
  onChange: (key: string, value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal open={open} title="เพิ่มบริษัท" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <FieldGrid columns={2}>
          <Field label="รหัสบริษัท" required>
            <TextInput
              value={form.code}
              onChange={(event) => onChange("code", event.target.value)}
              placeholder="MAIN"
            />
          </Field>

          <Field label="ชื่อบริษัทภาษาไทย" required>
            <TextInput
              value={form.nameTh}
              onChange={(event) => onChange("nameTh", event.target.value)}
              placeholder="ชื่อบริษัท"
            />
          </Field>

          <Field label="ชื่อบริษัทภาษาอังกฤษ">
            <TextInput
              value={form.nameEn}
              onChange={(event) => onChange("nameEn", event.target.value)}
              placeholder="Company name"
            />
          </Field>

          <Field label="เลขประจำตัวผู้เสียภาษี">
            <TextInput
              value={form.taxId}
              onChange={(event) => onChange("taxId", event.target.value)}
              placeholder="Tax ID"
            />
          </Field>

          <Field label="เบอร์โทร">
            <TextInput
              value={form.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              placeholder="02-000-0000"
            />
          </Field>

          <Field label="อีเมล">
            <TextInput
              value={form.email}
              onChange={(event) => onChange("email", event.target.value)}
              placeholder="contact@company.com"
            />
          </Field>
        </FieldGrid>

        <Field label="ที่อยู่" className="mt-4">
          <Textarea
            value={form.address}
            onChange={(event) => onChange("address", event.target.value)}
            placeholder="ที่อยู่บริษัท"
          />
        </Field>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" onClick={onClose} disabled={creating}>
            ยกเลิก
          </Button>
          <Button type="submit" variant="primary" loading={creating}>
            เพิ่มบริษัท
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function handleApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) {
    toast.error(error.message);
    return;
  }
  toast.error(fallbackMessage);
}
