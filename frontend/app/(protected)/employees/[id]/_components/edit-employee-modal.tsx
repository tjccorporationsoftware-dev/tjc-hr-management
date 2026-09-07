"use client";

import {
  Field,
  FieldGrid,
  Modal,
  ModalActions,
  Select,
  TextInput,
  Textarea,
} from "@/components/kit";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import {
  departmentFitsBranch,
  filterDepartmentsByScope,
} from "@/lib/department-options";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import {
  buildSupervisorOptionLabel,
  sortSupervisorsByDepartment,
} from "@/lib/supervisor-options";
import type {
  CreateEmployeeForm,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeStatus,
  OrganizationOption,
} from "@/types/employee";

import { dateText, personNameOf } from "./employee-format";

/**
 * ค่าที่ถูกปกปิดมาจากเซิร์ฟเวอร์ (ไม่มีสิทธิ์ EMPLOYEE_SENSITIVE_READ)
 *
 * เซิร์ฟเวอร์กันไว้แล้วว่าจะไม่บันทึกค่าแบบนี้ทับเลขจริง แต่ต้องบอกผู้ใช้ด้วย
 * ไม่งั้นจะนึกว่าข้อมูลในระบบเสียหรือถูกกรอกผิด
 */
const MASKED_HINT = "ถูกปกปิดตามสิทธิ์ ปล่อยไว้ได้ ระบบจะไม่ทับเลขเดิม";

function maskedHint(value: string | null | undefined) {
  return typeof value === "string" && /x/i.test(value)
    ? MASKED_HINT
    : undefined;
}

/**
 * แก้ไขข้อมูลพนักงาน
 * ------------------
 * ฟอร์มเดียวยาว ๆ แบ่งเป็นหัวข้อคั่นด้วยเส้น เรียงตามความถี่ที่ HR แก้จริง:
 * ตัวตน → สังกัด → ติดต่อ → ส่วนตัว → การเงิน → สัญญา/วีซ่า
 *
 * วันสิ้นสุดทดลองงานเป็นแบบอ่านอย่างเดียว เพราะระบบคุมจากใบทดลองงานที่หน้า /onboarding
 */

const STATUS_OPTIONS = Object.keys(EMPLOYEE_STATUS) as EmployeeStatus[];

const TITLE_OPTIONS = ["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms."];

const BLOOD_TYPE_OPTIONS = [
  "A",
  "B",
  "AB",
  "O",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function OptionList({
  items,
  emptyLabel,
}: {
  items: OrganizationOption[];
  emptyLabel: string;
}) {
  return (
    <>
      <option value="">{emptyLabel}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.nameTh || item.nameEn || item.code}
        </option>
      ))}
    </>
  );
}

export function EditEmployeeModal({
  open,
  employee,
  form,
  submitting,
  companies,
  branches,
  departments,
  divisions,
  employeeTypes,
  positions,
  supervisors,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  employee: EmployeeDetail;
  form: CreateEmployeeForm | null;
  submitting: boolean;
  companies: OrganizationOption[];
  branches: OrganizationOption[];
  departments: OrganizationOption[];
  divisions: OrganizationOption[];
  employeeTypes: OrganizationOption[];
  positions: OrganizationOption[];
  supervisors: EmployeeListItem[];
  onChange: (next: CreateEmployeeForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  // ตัวเลือกเป็นการกรองรายการไม่กี่ร้อยตัว คำนวณสดทุกครั้งเร็วกว่าจัดการ dependency ของ memo
  if (!form) return null;

  const branchOptions = branches.filter(
    (branch) => !form.companyId || branch.companyId === form.companyId,
  );

  /* แผนกระดับบริษัท (branchId ว่าง) ใช้ได้ทุกสาขา ตัดออกเฉพาะแผนกของสาขาอื่น */
  const departmentOptions = filterDepartmentsByScope(departments, {
    companyId: form.companyId,
    branchId: form.branchId,
  });

  const divisionOptions = divisions.filter(
    (division) =>
      !form.departmentId || division.departmentId === form.departmentId,
  );

  /*
   * เงื่อนไขต้องตรงกับที่ backend บังคับจริง (ensureValidSupervisor)
   * คือบริษัทและสาขาเดียวกัน ไม่ได้บังคับว่าต้องแผนกเดียวกัน
   * แผนกใช้แค่จัดลำดับให้หาง่าย — คนแผนกเดียวกันขึ้นก่อน
   */
  const supervisorOptions = sortSupervisorsByDepartment(
    supervisors.filter((supervisor) => {
      if (supervisor.id === employee.id) return false;
      if (form.companyId && supervisor.companyId !== form.companyId)
        return false;
      if (form.branchId && supervisor.branchId !== form.branchId) return false;

      return (
        supervisor.status === "ACTIVE" || supervisor.status === "PROBATION"
      );
    }),
    form.departmentId,
  );

  function setField<K extends keyof CreateEmployeeForm>(
    key: K,
    value: CreateEmployeeForm[K],
  ) {
    if (!form) return;
    onChange({ ...form, [key]: value });
  }

  function setProfile<K extends keyof CreateEmployeeForm["profile"]>(
    key: K,
    value: CreateEmployeeForm["profile"][K],
  ) {
    if (!form) return;
    onChange({ ...form, profile: { ...form.profile, [key]: value } });
  }

  return (
    <Modal
      open={open}
      title="แก้ไขข้อมูลพนักงาน"
      description="ช่องที่มีดอกจันเป็นข้อมูลที่ระบบต้องใช้ ที่เหลือเว้นว่างได้"
      size="lg"
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={onSubmit}
          confirmLabel="บันทึกการแก้ไข"
          loading={submitting}
        />
      }
    >
      <div className="space-y-6">
        <FormSection title="ข้อมูลระบุตัวตน">
          <FieldGrid columns={3}>
            <Field label="รหัสพนักงาน" required>
              <TextInput
                value={form.employeeCode}
                onChange={(event) =>
                  setField("employeeCode", event.target.value)
                }
              />
            </Field>

            <Field label="สถานะการจ้างงาน">
              <Select
                value={form.status}
                onChange={(event) =>
                  setField("status", event.target.value as EmployeeStatus)
                }
              >
                {STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {EMPLOYEE_STATUS[value].label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="คำนำหน้า">
              <Select
                value={form.title}
                onChange={(event) => setField("title", event.target.value)}
              >
                <option value="">ไม่ระบุ</option>
                {TITLE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ชื่อ" required>
              <TextInput
                value={form.firstName}
                onChange={(event) => setField("firstName", event.target.value)}
              />
            </Field>

            <Field label="นามสกุล" required>
              <TextInput
                value={form.lastName}
                onChange={(event) => setField("lastName", event.target.value)}
              />
            </Field>

            <Field label="ชื่อเล่น">
              <TextInput
                value={form.nickname}
                onChange={(event) => setField("nickname", event.target.value)}
              />
            </Field>

            <Field label="First name (EN)">
              <TextInput
                value={form.profile.firstNameEn}
                onChange={(event) =>
                  setProfile("firstNameEn", event.target.value)
                }
              />
            </Field>

            <Field label="Last name (EN)">
              <TextInput
                value={form.profile.lastNameEn}
                onChange={(event) =>
                  setProfile("lastNameEn", event.target.value)
                }
              />
            </Field>

            <Field label="ชื่อที่แสดง" hint="เว้นว่างได้ ระบบจะรวมชื่อให้เอง">
              <TextInput
                value={form.displayName}
                onChange={(event) =>
                  setField("displayName", event.target.value)
                }
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="สังกัดและการจ้างงาน">
          <FieldGrid columns={3}>
            <Field label="บริษัท" required>
              <Select
                value={form.companyId}
                onChange={(event) =>
                  onChange({
                    ...form,
                    companyId: event.target.value,
                    branchId: "",
                    departmentId: "",
                    divisionId: "",
                    supervisorId: "",
                  })
                }
              >
                <OptionList items={companies} emptyLabel="เลือกบริษัท" />
              </Select>
            </Field>

            <Field label="สาขา">
              <Select
                value={form.branchId}
                onChange={(event) =>
                  onChange({
                    ...form,
                    branchId: event.target.value,
                    supervisorId: "",
                    // แผนกที่ผูกกับสาขาอื่นใช้ต่อไม่ได้ ส่วนแผนกระดับบริษัทเก็บไว้ได้
                    ...(departmentFitsBranch(
                      departments,
                      form.departmentId,
                      event.target.value,
                    )
                      ? {}
                      : { departmentId: "", divisionId: "" }),
                  })
                }
              >
                <OptionList items={branchOptions} emptyLabel="ไม่ระบุสาขา" />
              </Select>
            </Field>

            <Field label="แผนก">
              <Select
                value={form.departmentId}
                onChange={(event) =>
                  onChange({
                    ...form,
                    departmentId: event.target.value,
                    divisionId: "",
                  })
                }
              >
                <OptionList
                  items={departmentOptions}
                  emptyLabel="ไม่ระบุแผนก"
                />
              </Select>
            </Field>

            <Field label="ฝ่าย / กลุ่มงาน">
              <Select
                value={form.divisionId}
                onChange={(event) => setField("divisionId", event.target.value)}
              >
                <OptionList
                  items={divisionOptions}
                  emptyLabel="ไม่ระบุฝ่าย/กลุ่มงาน"
                />
              </Select>
            </Field>

            <Field label="ตำแหน่ง">
              <Select
                value={form.positionId}
                onChange={(event) => {
                  const selected = positions.find(
                    (item) => item.id === event.target.value,
                  );

                  onChange({
                    ...form,
                    positionId: event.target.value,
                    position: selected?.nameTh ?? "",
                  });
                }}
              >
                <OptionList items={positions} emptyLabel="เลือกตำแหน่ง" />
              </Select>
            </Field>

            <Field label="ประเภทการจ้างงาน">
              <Select
                value={form.employeeTypeId}
                onChange={(event) =>
                  setField("employeeTypeId", event.target.value)
                }
              >
                <OptionList
                  items={employeeTypes}
                  emptyLabel="ไม่ระบุประเภทพนักงาน"
                />
              </Select>
            </Field>

            <Field
              label="หัวหน้างานโดยตรง"
              hint="เลือกได้เฉพาะคนในบริษัทและสาขาเดียวกัน"
            >
              <Select
                value={form.supervisorId}
                onChange={(event) =>
                  setField("supervisorId", event.target.value)
                }
              >
                <option value="">ไม่ระบุหัวหน้างาน</option>
                {supervisorOptions.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {buildSupervisorOptionLabel(
                      personNameOf(supervisor),
                      supervisor,
                    )}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="วันที่เริ่มงาน" required>
              <ThaiDateInput
                value={form.startDate}
                onChange={(event) => setField("startDate", event.target.value)}
                aria-label="วันที่เริ่มงาน"
              />
            </Field>

            <Field
              label="วันสิ้นสุดทดลองงาน"
              hint="ระบบคุมจากใบทดลองงาน แก้ที่หน้าเริ่มงานพนักงานใหม่"
            >
              <TextInput
                value={
                  employee.probationEndDate
                    ? dateText(employee.probationEndDate)
                    : "ไม่มีข้อมูล"
                }
                disabled
              />
            </Field>

            <Field label="สถานที่ทำงานหลัก">
              <TextInput
                value={form.profile.workLocation}
                onChange={(event) =>
                  setProfile("workLocation", event.target.value)
                }
                placeholder="สำนักงานใหญ่ / สาขา / Remote"
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="ข้อมูลติดต่อ">
          <FieldGrid columns={3}>
            <Field label="อีเมล">
              <TextInput
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
              />
            </Field>

            <Field label="อีเมลส่วนตัว">
              <TextInput
                type="email"
                value={form.profile.personalEmail}
                onChange={(event) =>
                  setProfile("personalEmail", event.target.value)
                }
              />
            </Field>

            <Field label="เบอร์โทรหลัก">
              <TextInput
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
              />
            </Field>

            <Field label="เบอร์ต่อภายใน">
              <TextInput
                value={form.profile.workPhoneExt}
                onChange={(event) =>
                  setProfile("workPhoneExt", event.target.value)
                }
              />
            </Field>

            <Field label="Line ID / Chat ID">
              <TextInput
                value={form.profile.lineId}
                onChange={(event) => setProfile("lineId", event.target.value)}
              />
            </Field>

            <Field label="กรุ๊ปเลือด">
              <Select
                value={form.profile.bloodType}
                onChange={(event) =>
                  setProfile("bloodType", event.target.value)
                }
              >
                <option value="">ไม่ระบุ</option>
                {BLOOD_TYPE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ชื่อผู้ติดต่อฉุกเฉิน">
              <TextInput
                value={form.profile.emergencyContactName}
                onChange={(event) =>
                  setProfile("emergencyContactName", event.target.value)
                }
              />
            </Field>

            <Field label="เบอร์โทรฉุกเฉิน">
              <TextInput
                value={form.profile.emergencyContactPhone}
                onChange={(event) =>
                  setProfile("emergencyContactPhone", event.target.value)
                }
              />
            </Field>

            <Field label="ความสัมพันธ์">
              <TextInput
                value={form.profile.emergencyContactRelation}
                onChange={(event) =>
                  setProfile("emergencyContactRelation", event.target.value)
                }
              />
            </Field>
          </FieldGrid>

          {/*
            ผู้ติดต่อฉุกเฉินคนที่สอง — คนแรกติดต่อไม่ได้ยังมีอีกทาง เว้นว่างไว้ก็ได้
          */}
          <p className="mt-5 border-b border-brand-100 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            ผู้ติดต่อฉุกเฉินคนที่ 2 (ถ้ามี)
          </p>

          <FieldGrid columns={3} className="mt-3">
            <Field label="ชื่อผู้ติดต่อฉุกเฉิน 2">
              <TextInput
                value={form.profile.emergencyContactName2}
                onChange={(event) =>
                  setProfile("emergencyContactName2", event.target.value)
                }
              />
            </Field>

            <Field label="เบอร์โทรฉุกเฉิน 2">
              <TextInput
                value={form.profile.emergencyContactPhone2}
                onChange={(event) =>
                  setProfile("emergencyContactPhone2", event.target.value)
                }
              />
            </Field>

            <Field label="ความสัมพันธ์ 2">
              <TextInput
                value={form.profile.emergencyContactRelation2}
                onChange={(event) =>
                  setProfile("emergencyContactRelation2", event.target.value)
                }
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={2} className="mt-4">
            <Field label="ที่อยู่ปัจจุบัน">
              <Textarea
                value={form.profile.currentAddress}
                onChange={(event) =>
                  setProfile("currentAddress", event.target.value)
                }
              />
            </Field>

            <Field label="ที่อยู่ตามทะเบียนบ้าน">
              <Textarea
                value={form.profile.registeredAddress}
                onChange={(event) =>
                  setProfile("registeredAddress", event.target.value)
                }
              />
            </Field>

            <Field label="ที่อยู่ผู้ติดต่อฉุกเฉิน">
              <Textarea
                value={form.profile.emergencyContactAddress}
                onChange={(event) =>
                  setProfile("emergencyContactAddress", event.target.value)
                }
              />
            </Field>

            <Field label="ที่อยู่ผู้ติดต่อฉุกเฉิน 2">
              <Textarea
                value={form.profile.emergencyContactAddress2}
                onChange={(event) =>
                  setProfile("emergencyContactAddress2", event.target.value)
                }
              />
            </Field>

            <Field label="หมายเหตุ">
              <Textarea
                value={form.profile.note}
                onChange={(event) => setProfile("note", event.target.value)}
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="ข้อมูลส่วนตัวและการศึกษา">
          <FieldGrid columns={3}>
            <Field label="เพศ">
              <Select
                value={form.profile.gender}
                onChange={(event) =>
                  setProfile(
                    "gender",
                    event.target
                      .value as CreateEmployeeForm["profile"]["gender"],
                  )
                }
              >
                <option value="NOT_SPECIFIED">ไม่ระบุ</option>
                <option value="MALE">ชาย</option>
                <option value="FEMALE">หญิง</option>
                <option value="OTHER">อื่น ๆ</option>
              </Select>
            </Field>

            <Field label="วันเกิด">
              <ThaiDateInput
                value={form.profile.birthDate}
                onChange={(event) =>
                  setProfile("birthDate", event.target.value)
                }
                aria-label="วันเกิด"
              />
            </Field>

            <Field label="สถานภาพ">
              <Select
                value={form.profile.maritalStatus}
                onChange={(event) =>
                  setProfile(
                    "maritalStatus",
                    event.target
                      .value as CreateEmployeeForm["profile"]["maritalStatus"],
                  )
                }
              >
                <option value="NOT_SPECIFIED">ไม่ระบุ</option>
                <option value="SINGLE">โสด</option>
                <option value="MARRIED">สมรส</option>
                <option value="DIVORCED">หย่า</option>
                <option value="WIDOWED">หม้าย</option>
              </Select>
            </Field>

            <Field
              label="เลขบัตรประชาชน"
              hint={maskedHint(form.profile.nationalId)}
            >
              <TextInput
                value={form.profile.nationalId}
                onChange={(event) =>
                  setProfile("nationalId", event.target.value)
                }
              />
            </Field>

            <Field
              label="หนังสือเดินทาง"
              hint={maskedHint(form.profile.passportNo)}
            >
              <TextInput
                value={form.profile.passportNo}
                onChange={(event) =>
                  setProfile("passportNo", event.target.value)
                }
              />
            </Field>

            <Field label="สัญชาติ">
              <TextInput
                value={form.profile.nationality}
                onChange={(event) =>
                  setProfile("nationality", event.target.value)
                }
              />
            </Field>

            <Field label="ศาสนา">
              <TextInput
                value={form.profile.religion}
                onChange={(event) => setProfile("religion", event.target.value)}
              />
            </Field>

            <Field label="ระดับการศึกษา">
              <TextInput
                value={form.profile.educationLevel}
                onChange={(event) =>
                  setProfile("educationLevel", event.target.value)
                }
              />
            </Field>

            <Field label="สถาบัน">
              <TextInput
                value={form.profile.educationInstitute}
                onChange={(event) =>
                  setProfile("educationInstitute", event.target.value)
                }
              />
            </Field>

            <Field label="สาขาวิชา">
              <TextInput
                value={form.profile.educationMajor}
                onChange={(event) =>
                  setProfile("educationMajor", event.target.value)
                }
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="บัญชีธนาคาร ภาษี และประกันสังคม">
          <FieldGrid columns={3}>
            <Field label="ธนาคาร">
              <TextInput
                value={form.profile.bankName}
                onChange={(event) => setProfile("bankName", event.target.value)}
              />
            </Field>

            <Field
              label="เลขบัญชี"
              hint={maskedHint(form.profile.bankAccountNo)}
            >
              <TextInput
                value={form.profile.bankAccountNo}
                onChange={(event) =>
                  setProfile("bankAccountNo", event.target.value)
                }
              />
            </Field>

            <Field label="ชื่อบัญชี">
              <TextInput
                value={form.profile.bankAccountName}
                onChange={(event) =>
                  setProfile("bankAccountName", event.target.value)
                }
              />
            </Field>

            <Field label="เลขผู้เสียภาษี" hint={maskedHint(form.profile.taxId)}>
              <TextInput
                value={form.profile.taxId}
                onChange={(event) => setProfile("taxId", event.target.value)}
              />
            </Field>

            <Field
              label="เลขประกันสังคม"
              hint={maskedHint(form.profile.socialSecurityNo)}
            >
              <TextInput
                value={form.profile.socialSecurityNo}
                onChange={(event) =>
                  setProfile("socialSecurityNo", event.target.value)
                }
              />
            </Field>

            <Field label="โรงพยาบาลประกันสังคม">
              <TextInput
                value={form.profile.socialSecurityHospital}
                onChange={(event) =>
                  setProfile("socialSecurityHospital", event.target.value)
                }
              />
            </Field>

            <Field label="เลขกองทุนสำรองเลี้ยงชีพ">
              <TextInput
                value={form.profile.providentFundNo}
                onChange={(event) =>
                  setProfile("providentFundNo", event.target.value)
                }
              />
            </Field>

            <Field label="วิธีรับเงินเดือน">
              <Select
                value={form.profile.payrollPaymentMethod}
                onChange={(event) =>
                  setProfile("payrollPaymentMethod", event.target.value)
                }
              >
                <option value="">ไม่ระบุ</option>
                <option value="BANK_TRANSFER">โอนเข้าบัญชี</option>
                <option value="CASH">เงินสด</option>
                <option value="CHEQUE">เช็ค</option>
                <option value="OTHER">อื่น ๆ</option>
              </Select>
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="สัญญาจ้าง ใบอนุญาตทำงาน และวีซ่า">
          <FieldGrid columns={3}>
            <Field label="เลขที่สัญญา">
              <TextInput
                value={form.profile.contractNo}
                onChange={(event) =>
                  setProfile("contractNo", event.target.value)
                }
              />
            </Field>

            <Field label="วันที่เริ่มสัญญา">
              <ThaiDateInput
                value={form.profile.contractStartDate}
                onChange={(event) =>
                  setProfile("contractStartDate", event.target.value)
                }
                aria-label="วันที่เริ่มสัญญา"
              />
            </Field>

            <Field label="วันที่สิ้นสุดสัญญา">
              <ThaiDateInput
                value={form.profile.contractEndDate}
                onChange={(event) =>
                  setProfile("contractEndDate", event.target.value)
                }
                aria-label="วันที่สิ้นสุดสัญญา"
              />
            </Field>

            <Field label="Work permit no.">
              <TextInput
                value={form.profile.workPermitNo}
                onChange={(event) =>
                  setProfile("workPermitNo", event.target.value)
                }
              />
            </Field>

            <Field label="วันหมดอายุ Work permit">
              <ThaiDateInput
                value={form.profile.workPermitExpiredDate}
                onChange={(event) =>
                  setProfile("workPermitExpiredDate", event.target.value)
                }
                aria-label="วันหมดอายุ Work permit"
              />
            </Field>

            <Field label="Visa no.">
              <TextInput
                value={form.profile.visaNo}
                onChange={(event) => setProfile("visaNo", event.target.value)}
              />
            </Field>

            <Field label="วันหมดอายุ Visa">
              <ThaiDateInput
                value={form.profile.visaExpiredDate}
                onChange={(event) =>
                  setProfile("visaExpiredDate", event.target.value)
                }
                aria-label="วันหมดอายุ Visa"
              />
            </Field>
          </FieldGrid>
        </FormSection>
      </div>
    </Modal>
  );
}
