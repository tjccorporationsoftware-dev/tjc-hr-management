"use client";

import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ButtonLink, PageSurface } from "@/components/kit";
import { ErrorState } from "@/components/common/feedback-state";

import { DocumentView } from "../_components/document-view";
import { DOCUMENT_CATALOG } from "../_components/document-catalog";
import { ReportView } from "../_components/report-view";
import { findReportBySlug } from "../_components/report-definitions";

/**
 * หน้ารายละเอียดของเอกสารหนึ่งฉบับ
 * -----------------------------------------------------------------------------
 * ใช้ URL ชุดเดียว `/reports/<slug>` สำหรับทุกอย่างในคลัง แล้วแยกหน้าตาข้างใน
 * ตามชนิดของเอกสาร เพราะสองกลุ่มนี้ทำงานคนละแบบ
 *
 *   รายงาน HR    — กรองด้วยช่วงวันที่/พนักงาน แล้วอ่านข้อมูลเป็นตารางจาก API
 *   เอกสารอื่น    — ผูกกับงวดเงินเดือนหรือปีภาษี แล้วดึงไฟล์จริงมาแสดงตัวอย่าง
 *
 * แยก URL เป็นคนละชุดก็ได้ แต่คนใช้ไม่ได้แยกสองอย่างนี้ในหัว เขาแค่ "เปิดเอกสาร"
 */
export default function ReportDocumentPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const report = findReportBySlug(slug);
  if (report) return <ReportView definition={report} />;

  const document = DOCUMENT_CATALOG.find((item) => item.slug === slug);
  if (document) return <DocumentView document={document} />;

  return (
    <PageSurface>
      <ErrorState
        title="ไม่พบเอกสารนี้"
        description="ลิงก์อาจพิมพ์ผิด หรือเอกสารถูกเปลี่ยนชื่อไปแล้ว"
        action={
          <ButtonLink
            href="/reports"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            กลับไปคลังเอกสาร
          </ButtonLink>
        }
      />
    </PageSurface>
  );
}
