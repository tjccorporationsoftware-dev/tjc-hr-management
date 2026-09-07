/** ชุดข้อมูลหนึ่งชุดในหน้าดูแลข้อมูลรายบริษัท (platform) */
export type CompanyDatasetMeta = {
  key: string;
  label: string;
  group: string;
  dateLabel: string;
  /** ลบแล้วไปอยู่ถังขยะ กู้คืนได้ */
  softDelete: boolean;
  /** ลบจากหน้านี้ได้ไหม */
  deletable: boolean;
  note: string | null;
};

export type CompanyDatasetsResponse = {
  groups: Array<{ key: string; label: string }>;
  datasets: CompanyDatasetMeta[];
};

export type CompanyDataSummaryResponse = {
  company: {
    id: string;
    code: string;
    nameTh: string;
    nameEn: string | null;
  };
  items: Array<{
    key: string;
    total: number;
    error: string | null;
  }>;
};

export type CompanyDataItem = {
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  date: string | null;
  employeeCode: string | null;
  employeeName: string | null;
};

export type CompanyDataListParams = {
  companyId: string;
  dataset: string;
  page?: number;
  pageSize?: number;
  search?: string;
  from?: string;
  to?: string;
};

export type CompanyDataListResponse = {
  dataset: {
    key: string;
    label: string;
    dateLabel: string;
    softDelete: boolean;
    deletable: boolean;
    note: string | null;
  };
  items: CompanyDataItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type CompanyDataDeleteResult = {
  requested: number;
  deleted: number;
  skipped: number;
  softDeleted: boolean;
};

export type CompanyDataPurgeResult = {
  deleted: number;
  softDeleted: boolean;
};
