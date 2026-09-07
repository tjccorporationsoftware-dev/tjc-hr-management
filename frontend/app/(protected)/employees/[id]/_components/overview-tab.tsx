"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import type { EmployeeDetail } from "@/types/employee";

import {
  attendanceMethodsText,
  countText,
  dateText,
  onOffText,
  personNameOf,
  tenureText,
  textOf,
  userStatusText,
} from "./employee-format";
import { InfoGrid, InfoItem, InfoSection } from "@/components/common/info-list";

/**
 * ภาพรวมพนักงาน
 * -------------
 * รวมของเดิมสองแท็บ (ภาพรวม + การทำงาน) ที่แสดงชุดข้อมูลเดียวกันเกือบทั้งหมด
 * ไล่จากบนลงล่างตามที่ HR ถามจริง: สังกัด → ติดต่อ → บัญชีและการลงเวลา → กิจกรรม
 */

export function OverviewTab({ employee }: { employee: EmployeeDetail }) {
  const profile = employee.profile;

  return (
    <div className="min-w-0">
      <InfoSection title="สังกัดและการจ้างงาน">
        <InfoGrid>
          <InfoItem label="บริษัท" value={textOf(employee.company?.nameTh)} />
          <InfoItem label="สาขา" value={textOf(employee.branch?.nameTh)} />
          <InfoItem label="แผนก" value={textOf(employee.department?.nameTh)} />
          <InfoItem
            label="ฝ่าย / กลุ่มงาน"
            value={textOf(employee.division?.nameTh)}
          />
          <InfoItem
            label="ตำแหน่ง"
            value={textOf(employee.positionMaster?.nameTh || employee.position)}
          />
          <InfoItem
            label="หัวหน้างานโดยตรง"
            value={
              employee.supervisor ? personNameOf(employee.supervisor) : "-"
            }
          />
          <InfoItem
            label="ประเภทการจ้าง"
            value={textOf(employee.employeeType?.nameTh)}
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
            label="ผู้ใต้บังคับบัญชา"
            value={`${countText(employee.subordinates.length)} คน`}
          />
          <InfoItem
            label="วันที่เริ่มงาน"
            value={dateText(employee.startDate)}
          />
          <InfoItem label="อายุงาน" value={tenureText(employee.startDate)} />
          <InfoItem
            label="สิ้นสุดทดลองงาน"
            value={dateText(employee.probationEndDate)}
          />
          <InfoItem
            label="สถานที่ทำงานหลัก"
            value={textOf(profile?.workLocation)}
          />
        </InfoGrid>
      </InfoSection>

      <InfoSection title="ข้อมูลติดต่อ">
        <InfoGrid>
          <InfoItem label="อีเมล" value={textOf(employee.email)} />
          <InfoItem label="เบอร์โทรหลัก" value={textOf(employee.phone)} />
          <InfoItem
            label="อีเมลส่วนตัว"
            value={textOf(profile?.personalEmail)}
          />
          <InfoItem
            label="เบอร์ต่อภายใน"
            value={textOf(profile?.workPhoneExt)}
          />
          <InfoItem label="Line ID / Chat ID" value={textOf(profile?.lineId)} />
          <InfoItem
            label="ผู้ติดต่อฉุกเฉิน"
            value={textOf(profile?.emergencyContactName)}
          />
          <InfoItem
            label="ความสัมพันธ์"
            value={textOf(profile?.emergencyContactRelation)}
          />
          <InfoItem
            label="เบอร์โทรฉุกเฉิน"
            value={textOf(profile?.emergencyContactPhone)}
          />
          {/* คนที่สอง — โชว์เฉพาะเมื่อกรอกไว้ จะได้ไม่มีช่องว่างเปล่าในหน้าภาพรวม */}
          {profile?.emergencyContactName2 ? (
            <InfoItem
              label="ผู้ติดต่อฉุกเฉิน 2"
              value={`${textOf(profile.emergencyContactName2)}${
                profile.emergencyContactRelation2
                  ? ` · ${profile.emergencyContactRelation2}`
                  : ""
              }${
                profile.emergencyContactPhone2
                  ? ` · ${profile.emergencyContactPhone2}`
                  : ""
              }`}
            />
          ) : null}
        </InfoGrid>
      </InfoSection>

      <InfoSection title="บัญชีผู้ใช้และการลงเวลา">
        <InfoGrid>
          <InfoItem
            label="บัญชีผู้ใช้งาน"
            value={textOf(employee.user?.displayName || employee.user?.email)}
          />
          <InfoItem
            label="สถานะบัญชี"
            value={
              employee.user
                ? userStatusText(employee.user.status)
                : "ยังไม่มีบัญชี"
            }
          />
          <InfoItem
            label="วิธีลงเวลาที่อนุญาต"
            value={attendanceMethodsText(employee.allowedAttendanceMethods)}
          />
          <InfoItem
            label="ตรวจสอบพื้นที่ลงเวลา"
            value={onOffText(employee.attendanceGeofenceRequired)}
          />
        </InfoGrid>
      </InfoSection>
    </div>
  );
}
