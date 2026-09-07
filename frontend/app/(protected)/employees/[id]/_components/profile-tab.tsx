"use client";

import type { EmployeeDetail } from "@/types/employee";

import {
  dateText,
  genderText,
  maritalStatusText,
  textOf,
} from "./employee-format";
import { InfoGrid, InfoItem, InfoSection } from "@/components/common/info-list";

/**
 * ข้อมูลส่วนตัว
 * -------------
 * เดิมเป็นหัวข้อพับได้ 5 อัน ที่ปิดไว้หมดตอนเปิดหน้า — ต้องกด 5 ครั้งกว่าจะเห็นข้อมูล
 * เปลี่ยนเป็นกางทั้งหมดแล้วคั่นด้วยเส้น เลื่อนอ่านรวดเดียวจบและ Ctrl+F เจอ
 */

export function ProfileTab({ employee }: { employee: EmployeeDetail }) {
  const profile = employee.profile;
  const educations = employee.educations ?? [];
  /*
   * หัวข้อ "ครอบครัว" ปิดไว้ก่อนตามที่ผู้ใช้สั่ง
   *
   * ข้อมูลยังอยู่ครบในตาราง employee_family_members (289 ราย) และ API
   * ยังส่ง familyMembers มาให้ตามปกติ เปิดกลับได้ด้วยการเอาคอมเมนต์ออก
   * ทั้งบล็อกนี้กับหัวข้อ <InfoSection title="ครอบครัว"> ด้านล่าง
   *
   * const family = employee.familyMembers ?? [];
   *
   * ช่อง "ผู้ติดต่อฉุกเฉิน" ด้านบนคัดมาจากรายชื่อครอบครัวชุดนี้เอง (ตอนนำเข้าทะเบียน)
   * ถ้าเปิดกลับต้องติดป้ายกำกับไว้ ไม่งั้นจะดูเหมือนมีคนซ้ำสองที่
   *
   * const emergencyNames = new Set(
   *   [profile?.emergencyContactName, profile?.emergencyContactName2]
   *     .map((name) => name?.trim())
   *     .filter(Boolean) as string[],
   * );
   */

  const thaiName = [employee.title, employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(" ");
  const englishName = [profile?.firstNameEn, profile?.lastNameEn]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-w-0">
      <InfoSection title="ข้อมูลส่วนบุคคล">
        <InfoGrid>
          <InfoItem label="ชื่อ-นามสกุล" value={textOf(thaiName)} />
          <InfoItem label="ชื่อภาษาอังกฤษ" value={textOf(englishName)} />
          <InfoItem label="ชื่อเล่น" value={textOf(employee.nickname)} />
          <InfoItem label="เพศ" value={genderText(profile?.gender)} />
          <InfoItem label="วันเกิด" value={dateText(profile?.birthDate)} />
          <InfoItem
            label="สถานภาพ"
            value={maritalStatusText(profile?.maritalStatus)}
          />
          <InfoItem
            label="เลขบัตรประชาชน"
            value={textOf(profile?.nationalId)}
          />
          <InfoItem
            label="เลขหนังสือเดินทาง"
            value={textOf(profile?.passportNo)}
          />
          <InfoItem label="สัญชาติ" value={textOf(profile?.nationality)} />
          <InfoItem label="ศาสนา" value={textOf(profile?.religion)} />
          <InfoItem label="กรุ๊ปเลือด" value={textOf(profile?.bloodType)} />
        </InfoGrid>
      </InfoSection>

      <InfoSection title="ที่อยู่และผู้ติดต่อฉุกเฉิน">
        <InfoGrid>
          <InfoItem
            label="ที่อยู่ปัจจุบัน"
            value={textOf(profile?.currentAddress)}
            full
          />
          <InfoItem
            label="ที่อยู่ตามทะเบียนบ้าน"
            value={textOf(profile?.registeredAddress)}
            full
          />
          <InfoItem
            label="ชื่อผู้ติดต่อฉุกเฉิน"
            value={textOf(profile?.emergencyContactName)}
          />
          <InfoItem
            label="เบอร์โทรฉุกเฉิน"
            value={textOf(profile?.emergencyContactPhone)}
          />
          <InfoItem
            label="ความสัมพันธ์"
            value={textOf(profile?.emergencyContactRelation)}
          />
          <InfoItem
            label="ที่อยู่ผู้ติดต่อฉุกเฉิน"
            value={textOf(profile?.emergencyContactAddress)}
            full
          />

          {/* คนที่สอง — โชว์เสมอ จะได้รู้ว่ายังไม่ได้กรอก */}
          <InfoItem
            label="ชื่อผู้ติดต่อฉุกเฉิน 2"
            value={textOf(profile?.emergencyContactName2)}
          />
          <InfoItem
            label="เบอร์โทรฉุกเฉิน 2"
            value={textOf(profile?.emergencyContactPhone2)}
          />
          <InfoItem
            label="ความสัมพันธ์ 2"
            value={textOf(profile?.emergencyContactRelation2)}
          />
          <InfoItem
            label="ที่อยู่ผู้ติดต่อฉุกเฉิน 2"
            value={textOf(profile?.emergencyContactAddress2)}
            full
          />
        </InfoGrid>
      </InfoSection>

      {/* ปิดหัวข้อ "ครอบครัว" ไว้ก่อน — เอาคอมเมนต์ออกเพื่อเปิดกลับ
      (* ครอบครัว — มาจากทะเบียนต้นทาง หลายคนต่อพนักงานหนึ่งคน *)
      <InfoSection
      title="ครอบครัว"
      actions={
      family.length > 0 ? (
      <span className="text-[11px] font-semibold text-slate-400">
      {family.length.toLocaleString("th-TH")} คน
      </span>
      ) : undefined
      }
      >
      {family.length === 0 ? (
      <p className="py-2 text-[13px] text-slate-400">
      ยังไม่มีข้อมูลครอบครัว
      </p>
      ) : (
      <div className="divide-y divide-slate-100">
      {family.map((member) => (
      <div
      key={member.id}
      className="grid gap-x-8 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,2fr)]"
      >
      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-slate-800">
      {member.name}
      {emergencyNames.has(member.name.trim()) ? (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
      ผู้ติดต่อฉุกเฉิน
      </span>
      ) : null}
      </p>
      <p className="text-[12.5px] text-brand-700">
      {textOf(member.relation)}
      </p>
      <p className="text-[12.5px] tabular-nums text-slate-600">
      {member.phone ? member.phone : "—"}
      </p>
      <p className="min-w-0 break-words text-[12.5px] text-slate-500">
      {[
      member.birthDate ? `เกิด ${dateText(member.birthDate)}` : null,
      member.address,
      ]
      .filter(Boolean)
      .join(" · ") || "—"}
      </p>
      </div>
      ))}
      </div>
      )}
      </InfoSection>

      */}

      {/*
        * ประวัติการศึกษาเต็มชุด แทนที่ช่องเดี่ยว 3 ช่องของเดิม
        *
        * ช่องเดิม (educationLevel/Institute/Major) เก็บได้แค่วุฒิสูงสุด และตอนนี้
        * ถูกเติมจากรายการชุดนี้อยู่แล้ว ถ้าโชว์ทั้งสองอย่างจะเห็นวุฒิสูงสุดซ้ำสองที่
        * คนที่ยังไม่มีประวัติในตารางจึงถอยไปแสดงช่องเดิมแทน
        */}
      <InfoSection
        title="การศึกษา"
        actions={
          educations.length > 1 ? (
            <span className="text-[11px] font-semibold text-slate-400">
              {educations.length.toLocaleString("th-TH")} วุฒิ
            </span>
          ) : undefined
        }
      >
        {educations.length === 0 ? (
          <InfoGrid>
            <InfoItem
              label="ระดับการศึกษา"
              value={textOf(profile?.educationLevel)}
            />
            <InfoItem
              label="สถาบัน"
              value={textOf(profile?.educationInstitute)}
            />
            <InfoItem
              label="สาขาวิชา"
              value={textOf(profile?.educationMajor)}
            />
          </InfoGrid>
        ) : (
          <div className="divide-y divide-slate-100">
            {educations.map((education) => (
              <div
                key={education.id}
                className="grid gap-x-8 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_6rem]"
              >
                <p className="text-[13px] font-semibold text-slate-800">
                  {education.level}
                </p>
                <p className="min-w-0 break-words text-[12.5px] text-slate-600">
                  {textOf(education.institute)}
                </p>
                <p className="min-w-0 break-words text-[12.5px] text-slate-500">
                  {textOf(education.major)}
                </p>
                <p className="text-[12.5px] tabular-nums text-slate-500">
                  {[
                    education.gradYear ? `ปี ${education.gradYear}` : null,
                    education.gpa ? `เกรด ${education.gpa}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </InfoSection>

      <InfoSection title="สัญญาจ้างและสถานที่ทำงาน">
        <InfoGrid>
          <InfoItem label="เลขที่สัญญา" value={textOf(profile?.contractNo)} />
          <InfoItem
            label="วันที่เริ่มสัญญา"
            value={dateText(profile?.contractStartDate)}
          />
          <InfoItem
            label="วันที่สิ้นสุดสัญญา"
            value={dateText(profile?.contractEndDate)}
          />
          <InfoItem
            label="สถานที่ทำงานหลัก"
            value={textOf(profile?.workLocation)}
          />
          <InfoItem label="หมายเหตุ" value={textOf(profile?.note)} wide />
        </InfoGrid>
      </InfoSection>

      <InfoSection title="ใบอนุญาตทำงานและวีซ่า">
        <InfoGrid>
          <InfoItem
            label="เลข Work Permit"
            value={textOf(profile?.workPermitNo)}
          />
          <InfoItem
            label="Work Permit หมดอายุ"
            value={dateText(profile?.workPermitExpiredDate)}
          />
          <InfoItem label="เลข Visa" value={textOf(profile?.visaNo)} />
          <InfoItem
            label="Visa หมดอายุ"
            value={dateText(profile?.visaExpiredDate)}
          />
        </InfoGrid>
      </InfoSection>
    </div>
  );
}
