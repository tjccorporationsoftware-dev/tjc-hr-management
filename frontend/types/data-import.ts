/**
 * นำเข้าข้อมูลจากไฟล์ Excel
 *
 * โครงเดียวใช้ได้ทุกชุดข้อมูล — หน้าเว็บอ่านรายการฟิลด์กับคอลัมน์จากหลังบ้าน
 * แล้วสร้างฟอร์มจับคู่คอลัมน์เอง เพิ่มชุดข้อมูลใหม่จึงไม่ต้องแก้หน้าเว็บ
 */

export type DataImportType = "EMPLOYEE" | "ATTENDANCE" | "PAYROLL_SUMMARY";

export type DataImportStatus =
  | "ANALYZED"
  | "COMMITTED"
  | "FAILED"
  | "CANCELLED";

/** วิธีจัดการแถวที่ตรงกับข้อมูลเดิมในระบบ */
export type DataImportDuplicateMode = "UPDATE" | "SKIP" | "ERROR";

export type DataImportRowAction = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

export type DataImportFieldType = "TEXT" | "DATE" | "NUMBER";

export type DataImportField = {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
  type: DataImportFieldType;
  hint?: string;
};

export type DataImportColumn = {
  index: number;
  label: string;
};

/** { fieldKey: หมายเลขคอลัมน์เริ่มที่ 1 } — null = ไม่ได้จับคู่ */
export type DataImportMapping = Record<string, number | null>;

export type DataImportDatasetInfo = {
  type: DataImportType;
  label: string;
  description: string;
  fields: DataImportField[];
};

export type DataImportJob = {
  id: string;
  type: DataImportType;
  status: DataImportStatus;
  fileName: string;
  sheetName: string | null;
  headerRowNo: number | null;
  duplicateMode: DataImportDuplicateMode;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  committedAt: string | null;
  createdAt: string;
};

export type DataImportPreviewRow = {
  rowNo: number;
  key: string;
  title: string;
  action: DataImportRowAction;
  values: Record<string, string>;
  errors: string[];
  warnings: string[];
};

export type DataImportSummary = {
  total: number;
  create: number;
  update: number;
  skip: number;
  error: number;
  warning: number;
};

export type DataImportPreview = {
  import: DataImportJob;
  fields: DataImportField[];
  columns: DataImportColumn[];
  mapping: DataImportMapping;
  /** ช่องที่จำเป็นแต่ยังจับคู่คอลัมน์ไม่ได้ — ต้องเลือกเองก่อนถึงจะอ่านแถวได้ */
  missingFields: string[];
  summary: DataImportSummary;
  rows: DataImportPreviewRow[];
  rowsTruncated: boolean;
};

export type DataImportRowError = {
  rowNo: number;
  key: string;
  message: string;
};

export type DataImportCommitResult = {
  import: DataImportJob;
  result: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: DataImportRowError[];
  };
};

export type DataImportHistoryItem = DataImportJob & {
  createdBy?: {
    id: string;
    email: string | null;
    displayName: string | null;
  } | null;
  rowErrors?: DataImportRowError[] | null;
};

export type DataImportListParams = {
  page?: number;
  pageSize?: number;
  type?: DataImportType;
  status?: DataImportStatus;
};

export type DataImportListResponse = {
  items: DataImportHistoryItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type UploadDataImportForm = {
  type: DataImportType;
  duplicateMode: DataImportDuplicateMode;
  file: File;
};

export type DataImportRunForm = {
  mapping?: DataImportMapping;
  duplicateMode?: DataImportDuplicateMode;
};
