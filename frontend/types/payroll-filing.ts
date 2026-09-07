/** รายงานสำหรับนำส่งหน่วยงาน อ้างอิงจากรอบการจ่ายเงินเดือนที่คำนวณแล้ว */

export type FilingRunInfo = {
  id: string;
  runNo: string;
  name?: string | null;
  status: string;
  periodName?: string | null;
  periodStartDate: string;
  periodEndDate: string;
  paymentDate: string;
};

export type FilingCompanyInfo = {
  id: string;
  nameTh?: string | null;
  taxId?: string | null;
  socialSecurityAccountNo?: string | null;
  socialSecurityBranchNo?: string | null;
  bankCompanyCode?: string | null;
  bankDebitAccountNo?: string | null;
};

/** รูปแบบไฟล์นำเข้าระบบจ่ายเงินเดือนของธนาคาร */
export type BankTransferFormat = "GENERIC_CSV" | "KTB_IPAY";

export const BANK_FORMAT_LABEL: Record<BankTransferFormat, string> = {
  GENERIC_CSV: "CSV รูปแบบกลาง",
  KTB_IPAY: "กรุงไทย (KTB iPay)",
};

export type SocialSecurityFilingRow = {
  sequence: number;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  nationalId?: string | null;
  socialSecurityNo?: string | null;
  contributionBase: number;
  employeeContribution: number;
  employerContribution: number;
  totalContribution: number;
  missingFields: string[];
};

export type SocialSecurityFilingReport = {
  formType: string;
  run: FilingRunInfo;
  company: FilingCompanyInfo;
  rows: SocialSecurityFilingRow[];
  summary: {
    employeeCount: number;
    totalContributionBase: number;
    totalEmployeeContribution: number;
    totalEmployerContribution: number;
    totalContribution: number;
    incompleteCount: number;
    /** ข้อมูลนายจ้างที่ยังขาด ต้องเติมก่อนสร้างไฟล์ e-Service */
    missingCompanyFields: string[];
  };
};

export type BankTransferFilingRow = {
  sequence: number;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  paymentMethod?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName: string;
  netPay: number;
  missingFields: string[];
};

export type BankTransferFilingReport = {
  run: FilingRunInfo;
  company: FilingCompanyInfo;
  rows: BankTransferFilingRow[];
  summary: {
    employeeCount: number;
    totalNetPay: number;
    incompleteCount: number;
    /** ข้อมูลบริษัทที่ไฟล์รูปแบบธนาคารต้องใช้ */
    missingCompanyFields: string[];
  };
};

export type StudentLoanFilingRow = {
  sequence: number;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  nationalId?: string | null;
  referenceNo?: string | null;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  isPartial: boolean;
  missingFields: string[];
};

export type StudentLoanFilingReport = {
  run: FilingRunInfo;
  company: FilingCompanyInfo;
  rows: StudentLoanFilingRow[];
  summary: {
    employeeCount: number;
    totalAmount: number;
    partialCount: number;
    incompleteCount: number;
  };
};

export type FilingReportKind =
  | "social-security"
  | "bank-transfer"
  | "student-loan";
