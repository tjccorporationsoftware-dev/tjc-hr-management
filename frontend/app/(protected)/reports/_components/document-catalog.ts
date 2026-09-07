import {
  apiFetchBlob,
  downloadPayrollRunExcel,
  downloadPayrollRunPdf,
  downloadPayrollTaxPnd1FormPdf,
  downloadPayrollTaxPnd1FormXlsx,
  downloadPayrollTaxPnd1FilingFile,
  downloadPayrollTaxPnd1aSummaryPdf,
  downloadPayrollTaxPnd1aAttachmentPdf,
  downloadPayrollTaxPnd1aCertificatePdf,
  downloadPayrollTaxPnd1TableCsv,
  downloadPayrollTaxPnd1aTableCsv,
  downloadPnd3FormPdf,
  downloadPnd3TableCsv,
} from "@/lib/api";
import type { ReportCode } from "@/types/reports";

/**
 * ทะเบียนเอกสารที่ดาวน์โหลดได้ทั้งระบบ
 * ------------------------------------
 * เดิมไฟล์แต่ละอย่างซ่อนอยู่คนละหน้า — ไฟล์ธนาคาร/สปส. อยู่ในหน้ารอบเงินเดือน
 * รายงานภาษีอยู่ในหน้าภาษี สรุปรอบอยู่ในหน้ารายละเอียดรอบ คนที่ต้อง "หาไฟล์"
 * จึงต้องรู้ก่อนว่าไฟล์นั้นอยู่หน้าไหน ที่นี่รวมมาไว้จุดเดียวและบอกด้วยว่า
 * แต่ละไฟล์ต้องเลือกอะไรก่อนถึงจะโหลดได้
 *
 * เส้นทาง API และสิทธิ์ยึดตาม controller ฝั่ง backend ตามจริง ไม่ได้เดา
 */

/** สิ่งที่ต้องเลือกก่อน ถึงจะกดดาวน์โหลดเอกสารนั้นได้ */
export type CatalogNeed =
  "payrollRun" | "taxYear" | "taxMonth" | "reportFilter";

export const NEED_TEXT: Record<CatalogNeed, string> = {
  payrollRun: "เลือกรอบเงินเดือน",
  taxYear: "เลือกปีภาษี",
  // ภ.ง.ด.1 เป็นแบบยื่นรายเดือน backend ตอบ 400 ถ้าไม่ส่ง month มา
  taxMonth: "เลือกเดือนภาษี",
  reportFilter: "เลือกช่วงวันที่",
};

export type CatalogGroup =
  | "รอบเงินเดือน"
  | "นำส่งราชการและธนาคาร"
  | "ภาษีเงินได้"
  | "รายงาน HR และ Payroll";

export type CatalogContext = {
  /** id ของรอบเงินเดือน (payroll run) ที่เลือกอยู่ */
  runId: string;
  /** เลขที่รอบ ใช้ตั้งชื่อไฟล์ให้ตรงกับที่ backend ตั้ง */
  runNo: string;
  companyId: string;
  year: string;
  month: string;
  /** ช่วงวันที่ของรายงาน HR/Payroll ที่คิดตามช่วงเวลา */
  dateFrom: string;
  dateTo: string;
  /** กรองรายงานให้เหลือเฉพาะแผนกเดียว — ว่าง = ทุกแผนก */
  departmentId: string;
  /** กรองรายงานให้เหลือพนักงานคนเดียว — ว่าง = ทุกคน */
  employeeId: string;
  /**
   * วันที่ออกเอกสารที่ผู้ใช้เลือกก่อนดาวน์โหลด (yyyy-MM-dd ค.ศ.)
   * ว่าง = ไม่ระบุ แบบฟอร์มจะเว้นช่อง "ยื่นวันที่" ไว้
   */
  issueDate: string;
};

/**
 * ดูตัวอย่างได้แบบไหน
 * table = CSV แยกคอลัมน์ให้ · text = ไฟล์ความกว้างคงที่ ต้องดูดิบ ๆ
 * pdf   = ฝังตัวอ่านในกล่อง · none = ไฟล์ไบนารีที่อ่านเองไม่ได้ (xlsx)
 * report = ดูตัวอย่างที่แท็บข้อมูลรายงาน เพราะไฟล์ยังไม่ถูกสร้าง
 */
export type CatalogPreviewKind = "table" | "text" | "pdf" | "none" | "report";

export type CatalogDocument = {
  key: string;
  /** ต้องถาม "วันออกเอกสาร" ก่อนดาวน์โหลด — แบบยื่นราชการที่มีช่องยื่นวันที่ */
  needsIssueDate?: boolean;
  /** ใช้เป็น URL ของหน้าเอกสารนั้น — `/reports/<slug>` */
  slug: string;
  group: CatalogGroup;
  name: string;
  description: string;
  /** ป้ายรูปแบบไฟล์ที่ backend ส่งกลับมาจริง */
  format: string;
  need: CatalogNeed;
  /** สิทธิ์ที่ backend บังคับไว้ที่ route นั้น */
  permission: string;
  /** รายงานที่ระบบต้องสร้างไฟล์ให้ก่อน ไม่ได้มีไฟล์รออยู่แล้ว */
  reportCode?: ReportCode;
  preview: CatalogPreviewKind;
  /**
   * ดึงไฟล์เป็น blob — ใช้ทั้งดูตัวอย่างและดาวน์โหลด
   * ยิงเส้นเดียวกันทั้งสองทาง จะได้ไม่มีทางที่ตัวอย่างกับไฟล์จริงไม่ตรงกัน
   */
  fetchFile?: (context: CatalogContext) => Promise<Blob>;
  fileName?: (context: CatalogContext) => string;
};

/** บันทึก blob ที่ API ส่งกลับมาเป็นไฟล์ (เส้นที่ไม่มี helper ดาวน์โหลดของตัวเอง) */
export async function saveBlobAsFile(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.URL.revokeObjectURL(url);
  }

  return fileName;
}

function taxParams(context: CatalogContext) {
  return {
    companyId: context.companyId || undefined,
    year: context.year ? Number(context.year) : undefined,
    month: context.month ? Number(context.month) : undefined,
  };
}

/**
 * เส้นทางแบบ กท.20 ของกองทุนเงินทดแทน
 *
 * ผูกกับบริษัทและปีทั้งปี ไม่ใช่รอบเงินเดือนรอบเดียวเหมือนไฟล์นำส่งอื่น
 * จึงใช้เส้นทางคนละชุดกับ filingBlob
 */
function workmenBlob(
  context: CatalogContext,
  format: "pdf" | "xlsx",
  /** "" = แบบ กท.20 · "annual/" = รายชื่อลูกจ้างแบบ กท.20ก */
  variant: "" | "annual/" = "",
) {
  const query = context.companyId
    ? `?companyId=${encodeURIComponent(context.companyId)}`
    : "";

  return apiFetchBlob(
    `/payroll/workmen-compensation/${context.year}/${variant}${format}${query}`,
  );
}

/** เส้นทางไฟล์นำส่งของรอบเงินเดือน — ยิงเป็น blob เพื่อให้ดูตัวอย่างกับดาวน์โหลดใช้ร่วมกัน */
function filingBlob(runId: string, path: string) {
  return apiFetchBlob(`/payroll/runs/${runId}/filings/${path}`);
}

export const DOCUMENT_CATALOG: CatalogDocument[] = [
  /* ---------------- รอบเงินเดือน ---------------- */
  {
    key: "payroll-run-excel",
    slug: "payroll-run-excel",
    group: "รอบเงินเดือน",
    name: "สรุปรอบเงินเดือน (Excel)",
    description: "รายรับ รายหัก และยอดสุทธิรายคนของทั้งรอบ",
    format: "XLSX",
    need: "payrollRun",
    permission: "PAYROLL_READ",
    preview: "none",
    fetchFile: (context) => downloadPayrollRunExcel(context.runId),
    fileName: (context) => `payroll-run-${context.runNo}.xlsx`,
  },
  {
    key: "payroll-run-pdf",
    slug: "payroll-run-pdf",
    group: "รอบเงินเดือน",
    name: "สรุปรอบเงินเดือน (PDF)",
    description: "เอกสารสรุปรอบสำหรับแนบเสนออนุมัติ",
    format: "PDF",
    need: "payrollRun",
    permission: "PAYROLL_READ",
    preview: "pdf",
    fetchFile: (context) => downloadPayrollRunPdf(context.runId),
    fileName: (context) => `payroll-run-${context.runNo}.pdf`,
  },

  /* ---------------- นำส่งราชการและธนาคาร ---------------- */
  {
    key: "sso-1-10-pdf",
    slug: "social-security-form",
    group: "นำส่งราชการและธนาคาร",
    name: "แบบ สปส.1-10 (PDF)",
    description:
      "แบบพิมพ์ราชการ ส่วนที่ 1 และ ส่วนที่ 2 พร้อมพิมพ์ยื่น แนบหน้าบันทึกช่วยตรวจท้ายเล่ม",
    format: "PDF",
    need: "payrollRun",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    fetchFile: (context) =>
      filingBlob(context.runId, "social-security/form-pdf"),
    fileName: (context) => `sso-1-10-${context.runNo}.pdf`,
  },
  {
    key: "sso-1-10-xlsx",
    slug: "social-security-form-xlsx",
    group: "นำส่งราชการและธนาคาร",
    name: "แบบ สปส.1-10 (Excel)",
    description: "ช่องตามแบบพิมพ์ พร้อมคอลัมน์กระทบยอดกับที่หักจากเงินเดือน",
    format: "XLSX",
    need: "payrollRun",
    permission: "REPORT_EXPORT",
    preview: "none",
    fetchFile: (context) =>
      filingBlob(context.runId, "social-security/form-xlsx"),
    fileName: (context) => `sso-1-10-${context.runNo}.xlsx`,
  },
  {
    key: "sso-1-10-csv",
    slug: "social-security-contribution",
    group: "นำส่งราชการและธนาคาร",
    name: "เงินสมทบประกันสังคม (CSV ตรวจทาน)",
    description:
      "รายการเงินสมทบรายคนแบบตาราง ไว้เปิดดูเร็ว ๆ ไม่ใช่แบบพิมพ์ยื่น",
    format: "CSV",
    need: "payrollRun",
    permission: "REPORT_EXPORT",
    preview: "table",
    fetchFile: (context) => filingBlob(context.runId, "social-security/export"),
    fileName: (context) => `sso-1-10-${context.runNo}.csv`,
  },
  {
    key: "sso-e-filing",
    slug: "social-security-efiling",
    group: "นำส่งราชการและธนาคาร",
    name: "ไฟล์นำส่งประกันสังคม e-Service",
    description:
      "ข้อความความกว้างคงที่ format 135 สำหรับอัปโหลดเข้า e-Service — ผังยังไม่ได้ยืนยันกับ สปส. ทดสอบอัปโหลดก่อนใช้จริง",
    format: "TXT",
    need: "payrollRun",
    permission: "REPORT_EXPORT",
    preview: "text",
    fetchFile: (context) =>
      filingBlob(context.runId, "social-security/e-filing"),
    fileName: (context) => `sso-1-10-${context.runNo}.txt`,
  },
  {
    key: "bank-transfer-pdf",
    slug: "bank-transfer-instruction",
    group: "นำส่งราชการและธนาคาร",
    name: "หนังสือแจ้งการโอนเงินเข้าบัญชี",
    description:
      "ใบปะหน้าคำสั่งโอนพร้อมช่องลงนามผู้มีอำนาจ ใช้ยื่นธนาคารคู่กับไฟล์นำเข้า และเสนออนุมัติก่อนส่งเงินออก",
    format: "PDF",
    need: "payrollRun",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    fetchFile: (context) =>
      filingBlob(context.runId, "bank-transfer/pdf?format=KTB_IPAY"),
    fileName: (context) => `bank-transfer-${context.runNo}.pdf`,
  },
  {
    key: "bank-transfer-csv",
    slug: "bank-transfer",
    group: "นำส่งราชการและธนาคาร",
    name: "รายการโอนเงินเข้าธนาคาร",
    description: "รายชื่อ เลขบัญชี และยอดโอนของรอบ สำหรับตรวจทาน",
    format: "CSV",
    need: "payrollRun",
    permission: "REPORT_EXPORT",
    preview: "table",
    fetchFile: (context) => filingBlob(context.runId, "bank-transfer/export"),
    fileName: (context) => `bank-transfer-${context.runNo}.csv`,
  },
  {
    key: "bank-transfer-ktb",
    slug: "bank-transfer-ktb",
    group: "นำส่งราชการและธนาคาร",
    name: "ไฟล์นำเข้าธนาคาร กรุงไทย (KTB iPay)",
    description: "รูปแบบยังไม่ได้เทียบกับสเปกที่ธนาคารออกให้ ตรวจก่อนใช้จริง",
    format: "TXT",
    need: "payrollRun",
    permission: "REPORT_EXPORT",
    preview: "text",
    fetchFile: (context) =>
      filingBlob(context.runId, "bank-transfer/file?format=KTB_IPAY"),
    fileName: (context) => `ktb-ipay-${context.runNo}.txt`,
  },
  {
    key: "student-loan-csv",
    slug: "student-loan",
    group: "นำส่งราชการและธนาคาร",
    name: "ไฟล์นำส่ง กยศ.",
    description: "ยอดหักชำระหนี้ กยศ. รายคนของรอบ",
    format: "CSV",
    need: "payrollRun",
    permission: "REPORT_EXPORT",
    preview: "table",
    fetchFile: (context) => filingBlob(context.runId, "student-loan/export"),
    fileName: (context) => `student-loan-${context.runNo}.csv`,
  },

  {
    key: "workmen-kt20-pdf",
    slug: "workmen-compensation-kt20",
    group: "นำส่งราชการและธนาคาร",
    name: "แบบคำนวณค่าจ้างกองทุนเงินทดแทน (กท.20)",
    description:
      "ค่าจ้างทั้งปีแยกรายเดือน สำหรับยื่นคู่กับแบบ กท.20 ก — ไม่รวมค่าล่วงเวลาและโบนัส เพดาน 20,000/คน/เดือน",
    format: "PDF",
    need: "taxYear",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    fetchFile: (context) => workmenBlob(context, "pdf"),
    // ชื่อไฟล์ใช้ พ.ศ. ให้ตรงกับที่พิมพ์บนหัวแบบฟอร์ม ส่วน URL ยังส่ง ค.ศ. ตามระบบ
    fileName: (context) => `kt-20-${context.year + 543}.pdf`,
  },
  {
    key: "workmen-kt20-xlsx",
    slug: "workmen-compensation-kt20-xlsx",
    group: "นำส่งราชการและธนาคาร",
    name: "แบบคำนวณค่าจ้างกองทุนเงินทดแทน (Excel)",
    description: "ข้อมูลชุดเดียวกับ กท.20 แบบแก้ต่อในตารางได้",
    format: "XLSX",
    need: "taxYear",
    permission: "REPORT_EXPORT",
    preview: "none",
    fetchFile: (context) => workmenBlob(context, "xlsx"),
    // ชื่อไฟล์ใช้ พ.ศ. ให้ตรงกับที่พิมพ์บนหัวแบบฟอร์ม ส่วน URL ยังส่ง ค.ศ. ตามระบบ
    fileName: (context) => `kt-20-${context.year + 543}.xlsx`,
  },

  {
    key: "workmen-kt20k-xlsx",
    slug: "workmen-compensation-kt20k-xlsx",
    group: "นำส่งราชการและธนาคาร",
    name: "รายงานกองทุนเงินทดแทนประจำปี (กท.20ก)",
    description:
      "รายชื่อลูกจ้างรายคนพร้อมค่าจ้างที่ต้องแจ้งทั้งปี แนบไปกับแบบ กท.20 — ยอดรวมต้องเท่ากับช่อง (ค) ของ กท.20",
    format: "XLSX",
    need: "taxYear",
    permission: "REPORT_EXPORT",
    preview: "none",
    fetchFile: (context) => workmenBlob(context, "xlsx", "annual/"),
    fileName: (context) => `kt-20-k-${context.year + 543}.xlsx`,
  },
  {
    key: "workmen-kt20k-pdf",
    slug: "workmen-compensation-kt20k",
    group: "นำส่งราชการและธนาคาร",
    name: "รายงานกองทุนเงินทดแทนประจำปี (ฉบับพิมพ์)",
    description: "ข้อมูลชุดเดียวกับ กท.20ก จัดหน้าให้พิมพ์แนบแฟ้มได้",
    format: "PDF",
    need: "taxYear",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    fetchFile: (context) => workmenBlob(context, "pdf", "annual/"),
    fileName: (context) => `kt-20-k-${context.year + 543}.pdf`,
  },

  /* ---------------- ภาษีเงินได้ ---------------- */
  {
    key: "tax-pnd1-form-pdf",
    /* ใช้ slug เดิมของรายการ CSV ที่ถอดออก ลิงก์เก่าที่ชี้มาจะได้ไม่พัง */
    slug: "tax-pnd1",
    group: "ภาษีเงินได้",
    name: "ภ.ง.ด.1 (แบบพิมพ์)",
    description:
      "แบบยื่นราชการเต็มรูป หน้าปกพร้อมใบแนบแผ่นละ 21 คน พิมพ์ยื่นสรรพากรพื้นที่ได้เลย",
    format: "PDF",
    need: "taxMonth",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    fetchFile: (context) => downloadPayrollTaxPnd1FormPdf(taxParams(context)),
    fileName: (context) => `pnd1-${context.year}-${context.month}.pdf`,
  },
  {
    key: "tax-pnd1-efiling",
    slug: "tax-pnd1-efiling",
    group: "ภาษีเงินได้",
    name: "ไฟล์นำส่ง ภ.ง.ด.1 (e-Filing)",
    description:
      "ไฟล์อัปโหลดเข้าระบบกรมสรรพากร คั่นด้วย | เข้ารหัส UTF-8 — ตรวจเลขบัตรประชาชนให้ครบก่อนส่ง",
    format: "TXT",
    need: "taxMonth",
    permission: "REPORT_EXPORT",
    preview: "text",
    fetchFile: (context) =>
      downloadPayrollTaxPnd1FilingFile(taxParams(context)),
    fileName: (context) => `pnd1-${context.year}-${context.month}.txt`,
  },
  {
    key: "tax-pnd1-form-xlsx",
    slug: "tax-pnd1-form-xlsx",
    group: "ภาษีเงินได้",
    name: "ตาราง ภ.ง.ด.1 (Excel)",
    description: "รายชื่อและยอดชุดเดียวกับแบบพิมพ์ ไว้ตรวจก่อนยื่น",
    format: "XLSX",
    need: "taxMonth",
    permission: "REPORT_EXPORT",
    preview: "none",
    fetchFile: (context) => downloadPayrollTaxPnd1FormXlsx(taxParams(context)),
    fileName: (context) => `pnd1-${context.year}-${context.month}.xlsx`,
  },

  {
    key: "tax-pnd1-table-csv",
    slug: "tax-pnd1-table-csv",
    group: "ภาษีเงินได้",
    name: "ตาราง ภ.ง.ด.1 (CSV)",
    description:
      "คอลัมน์เรียงตามช่องบนแบบพิมพ์ พร้อมคอลัมน์บอกว่าใครข้อมูลไม่ครบ",
    format: "CSV",
    need: "taxMonth",
    permission: "REPORT_EXPORT",
    preview: "table",
    fetchFile: (context) => downloadPayrollTaxPnd1TableCsv(taxParams(context)),
    fileName: (context) => `pnd1-${context.year}-${context.month}.csv`,
  },
  {
    key: "tax-pnd1a-summary",
    slug: "tax-pnd1a-summary",
    group: "ภาษีเงินได้",
    name: "ใบสรุป ภ.ง.ด.1ก",
    description:
      "แบบยื่นรายการภาษีหัก ณ ที่จ่ายประจำปี — หน้าปกพร้อมยอดรวมทั้งบริษัท",
    format: "PDF",
    need: "taxYear",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    needsIssueDate: true,
    fetchFile: (context) =>
      downloadPayrollTaxPnd1aSummaryPdf({
        ...taxParams(context),
        month: undefined,
        issueDate: context.issueDate || undefined,
      }),
    fileName: (context) => `pnd1a-summary-${context.year + 543}.pdf`,
  },
  {
    key: "tax-pnd1a-attachment",
    slug: "tax-pnd1a-attachment",
    group: "ภาษีเงินได้",
    name: "ใบแนบ ใบสรุป ภ.ง.ด.1ก",
    description: "รายชื่อผู้มีเงินได้พร้อมที่อยู่ แผ่นละ 21 คน แนบไปกับใบสรุป",
    format: "PDF",
    need: "taxYear",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    needsIssueDate: true,
    fetchFile: (context) =>
      downloadPayrollTaxPnd1aAttachmentPdf({
        ...taxParams(context),
        month: undefined,
        issueDate: context.issueDate || undefined,
      }),
    fileName: (context) => `pnd1a-attachment-${context.year + 543}.pdf`,
  },
  {
    key: "tax-50-tawi",
    slug: "tax-50-tawi",
    group: "ภาษีเงินได้",
    name: "50 ทวิ (ทั้งบริษัท)",
    description: "หนังสือรับรองการหักภาษี ณ ที่จ่าย หนึ่งหน้าต่อพนักงานหนึ่งคน",
    format: "PDF",
    need: "taxYear",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    needsIssueDate: true,
    fetchFile: (context) =>
      downloadPayrollTaxPnd1aCertificatePdf({
        ...taxParams(context),
        month: undefined,
        issueDate: context.issueDate || undefined,
      }),
    fileName: (context) => `50-tawi-${context.year + 543}.pdf`,
  },

  {
    key: "tax-pnd1a-table-csv",
    slug: "tax-pnd1a-table-csv",
    group: "ภาษีเงินได้",
    name: "ตาราง ภ.ง.ด.1ก (CSV)",
    description:
      "รายชื่อผู้มีเงินได้ทั้งปีพร้อมที่อยู่ ยอดชุดเดียวกับใบสรุป ใบแนบ และ 50 ทวิ",
    format: "CSV",
    need: "taxYear",
    permission: "REPORT_EXPORT",
    preview: "table",
    fetchFile: (context) =>
      downloadPayrollTaxPnd1aTableCsv({
        ...taxParams(context),
        month: undefined,
      }),
    fileName: (context) => `pnd1a-${context.year + 543}.csv`,
  },

  {
    key: "tax-pnd3-form-pdf",
    slug: "tax-pnd3-form",
    group: "ภาษีเงินได้",
    name: "ภ.ง.ด.3 (แบบพิมพ์)",
    description:
      "ภาษีหัก ณ ที่จ่ายของผู้รับเงินที่ไม่ใช่ลูกจ้าง — หน้าปกพร้อมใบแนบแนวนอนแผ่นละ 6 บรรทัด",
    format: "PDF",
    need: "taxMonth",
    permission: "REPORT_EXPORT",
    preview: "pdf",
    needsIssueDate: true,
    fetchFile: (context) =>
      downloadPnd3FormPdf({
        companyId: context.companyId || undefined,
        year: context.year ? Number(context.year) : undefined,
        month: context.month ? Number(context.month) : undefined,
        issueDate: context.issueDate || undefined,
      }),
    fileName: (context) => `pnd3-${context.year}-${context.month}.pdf`,
  },
  {
    key: "tax-pnd3-table-csv",
    slug: "tax-pnd3-table-csv",
    group: "ภาษีเงินได้",
    name: "ตาราง ภ.ง.ด.3 (CSV)",
    description: "รายการจ่ายรายบรรทัดพร้อมประเภทเงินได้และอัตราภาษี",
    format: "CSV",
    need: "taxMonth",
    permission: "REPORT_EXPORT",
    preview: "table",
    fetchFile: (context) =>
      downloadPnd3TableCsv({
        companyId: context.companyId || undefined,
        year: context.year ? Number(context.year) : undefined,
        month: context.month ? Number(context.month) : undefined,
      }),
    fileName: (context) => `pnd3-${context.year}-${context.month}.csv`,
  },

  /* ---------------- รายงาน HR และ Payroll ---------------- */
  {
    key: "report-work-status",
    slug: "work-status",
    group: "รายงาน HR และ Payroll",
    name: "สรุปสถานะการมาทำงาน",
    description: "นับยอดมา สาย ลา ขาด และลืมลงเวลาของแต่ละคนในหนึ่งเดือน",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "WORK_STATUS",
  },
  {
    key: "report-work-calendar",
    slug: "work-calendar",
    group: "รายงาน HR และ Payroll",
    name: "ปฏิทินการมาทำงาน",
    description: "ปฏิทินทั้งเดือน วันไหนมา ลา ขาด หรือหยุด",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "WORK_STATUS",
  },
  {
    key: "report-attendance",
    slug: "attendance",
    group: "รายงาน HR และ Payroll",
    name: "ตารางเวลาการทำงาน",
    description: "รายคนรายวัน เข้ากี่โมง ออกกี่โมง สาย และ OT",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "ATTENDANCE",
  },
  {
    key: "report-attendance-log",
    slug: "attendance-log",
    group: "รายงาน HR และ Payroll",
    name: "การลงเวลา",
    description: "บันทึกดิบทุกครั้งที่แตะลงเวลา",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "ATTENDANCE_LOG",
  },
  {
    key: "report-leave-quota",
    slug: "leave-quota",
    group: "รายงาน HR และ Payroll",
    name: "โควตาวันลา",
    description: "สิทธิ์ ใช้ไป และคงเหลือรายคน",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "LEAVE_QUOTA",
  },
  {
    key: "report-leave-request",
    slug: "leave-request",
    group: "รายงาน HR และ Payroll",
    name: "รายการใบลา",
    description: "ใครลาวันไหน ประเภทอะไร กี่วัน",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "LEAVE_REQUEST",
  },
  {
    key: "report-employee-register",
    slug: "employee-register",
    group: "รายงาน HR และ Payroll",
    name: "ทะเบียนพนักงาน",
    description: "รายชื่อพร้อมสังกัด วันเริ่มงาน และอายุงาน",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "EMPLOYEE_REGISTER",
  },
  {
    key: "report-payroll-basic",
    slug: "payroll-basic",
    group: "รายงาน HR และ Payroll",
    name: "สรุปเงินเดือนเบื้องต้น",
    description: "ยอดรับ-หักรายคนตามช่วงวันที่",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "PAYROLL_BASIC",
  },
  {
    key: "report-social-security",
    slug: "social-security",
    group: "รายงาน HR และ Payroll",
    name: "รายงานประกันสังคม",
    description: "ฐานค่าจ้างและเงินสมทบตามช่วงวันที่",
    format: "CSV / XLSX / PDF / JSON",
    need: "reportFilter",
    permission: "REPORT_EXPORT",
    preview: "report",
    reportCode: "SOCIAL_SECURITY",
  },
];
