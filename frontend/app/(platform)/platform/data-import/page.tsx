"use client";

import { FileSpreadsheet, ShieldCheck } from "lucide-react";

import { PageChip, PageHeading, PageSurface } from "@/components/kit";

import { DataImportPanel } from "./_components/import-panel";

/**
 * นำเข้าข้อมูล
 * ------------
 * รับไฟล์รายงานจากระบบเดิมตรง ๆ โดยไม่ต้องจัดรูปแบบไฟล์ใหม่ก่อน — ระบบหาแถว
 * หัวตารางเอง เดาการจับคู่คอลัมน์ให้ แล้วบังคับให้ตรวจผลก่อนกดยืนยันเสมอ
 *
 * ทุกครั้งที่นำเข้าจะถูกบันทึกไว้ในประวัติพร้อมผลลัพธ์รายแถว เพราะไฟล์เดียว
 * เขียนทะเบียนพนักงานทั้งบริษัทได้ในคลิกเดียว ต้องตามรอยย้อนหลังได้เสมอ
 *
 * อยู่ใน Platform Console ไม่ใช่พื้นที่บริษัท เพราะเป็นเครื่องมือที่เขียนทับข้อมูล
 * ได้ทั้งบริษัทในคลิกเดียว จึงคุมด้วยด่านของ Platform (บัญชีระดับ GLOBAL +
 * โรลผู้ดูแลระบบ) ซ้อนกับสิทธิ์ DATA_IMPORT ที่หลังบ้านตรวจอยู่แล้ว
 */
export default function DataImportPage() {
  return (
    <PageSurface>
      <PageHeading
        title="นำเข้าข้อมูล"
        description="อัปโหลดไฟล์ Excel จากระบบเดิม ตรวจผลก่อนยืนยัน แล้วจึงเขียนเข้าระบบ"
        leading={<FileSpreadsheet className="h-7 w-7 text-brand-600" />}
        chips={
          <PageChip icon={<ShieldCheck className="h-3.5 w-3.5" />} tone="brand">
            เฉพาะผู้ดูแลระบบทั้งระบบ
          </PageChip>
        }
      />

      <DataImportPanel />
    </PageSurface>
  );
}
