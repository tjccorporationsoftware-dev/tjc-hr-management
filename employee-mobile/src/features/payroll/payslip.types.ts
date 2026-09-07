import { z } from 'zod';

/**
 * สลิปเงินเดือน
 *
 * ทุกยอดเงินมาจาก backend ทั้งหมด แอปไม่บวกลบเองแม้แต่ช่องเดียว
 * ถ้าเลขในแอปกับสลิปกระดาษต่างกันแม้บาทเดียว พนักงานจะเลิกเชื่อทั้งระบบ
 */

export const payslipLineSchema = z.object({
  amount: z.coerce.number().default(0),
  name: z.string(),
});

export type PayslipLine = z.infer<typeof payslipLineSchema>;

export const payslipListItemSchema = z.object({
  id: z.string(),
  netPay: z.coerce.number().default(0),
  paymentDate: z.coerce.date().nullish(),
  periodCode: z.string().nullish(),
  periodEnd: z.coerce.date().nullish(),
  periodName: z.string(),
  periodStart: z.coerce.date().nullish(),
  status: z.string().nullish(),
  totalDeductions: z.coerce.number().default(0),
  totalEarnings: z.coerce.number().default(0),
});

export type PayslipListItem = z.infer<typeof payslipListItemSchema>;

export const payslipListSchema = z.object({
  items: z.array(payslipListItemSchema).default([]),
  summary: z
    .object({
      latestNetPay: z.coerce.number().default(0),
      total: z.coerce.number().default(0),
    })
    .default({ latestNetPay: 0, total: 0 }),
});

export const payslipDetailSchema = payslipListItemSchema.extend({
  companyName: z.string().nullish(),
  deductions: z.array(payslipLineSchema).default([]),
  earnings: z.array(payslipLineSchema).default([]),
  employeeCode: z.string().nullish(),
  employeeName: z.string().nullish(),
  employerContributions: z.array(payslipLineSchema).default([]),
  grossPay: z.coerce.number().default(0),
  notes: z.array(payslipLineSchema).default([]),
});

export type PayslipDetail = z.infer<typeof payslipDetailSchema>;

/**
 * หนังสือรับรองหักภาษี 50 ทวิ
 *
 * รับเฉพาะ field ที่ backend PayrollTaxReportService เป็นเจ้าของจริง
 * แอปแสดงผลอย่างเดียว ไม่คำนวณยอดเงินได้หรือภาษีซ้ำเอง
 */
const taxPartySchema = z
  .object({
    id: z.string().nullish(),
    code: z.string().nullish(),
    name: z.string().nullish(),
    taxId: z.string().nullish(),
    address: z.string().nullish(),
  })
  .passthrough();

export const taxCertificateSchema = z
  .object({
    certificateType: z.string().nullish(),
    certificateNo: z.string().nullish(),
    issueDate: z.coerce.date().nullish(),
    status: z.string().nullish(),
    note: z.string().nullish(),
    company: taxPartySchema,
    employee: taxPartySchema,
    taxYear: z
      .object({
        id: z.string().nullish(),
        year: z.coerce.number().nullish(),
        name: z.string().nullish(),
      })
      .passthrough(),
    incomeType: z.string().nullish(),
    incomeTypeCode: z.string().nullish(),
    paidAmount: z.coerce.number().default(0),
    taxWithheldAmount: z.coerce.number().default(0),
    paymentCount: z.coerce.number().default(0),
    lastPaymentDate: z.coerce.date().nullish(),
    rows: z.array(z.unknown()).default([]),
  })
  .passthrough();

export const taxCertificateYearsSchema = z.object({
  years: z.array(z.coerce.number()).default([]),
});

export type TaxCertificate = z.infer<typeof taxCertificateSchema>;

export const money = (value: number) =>
  value.toLocaleString('th-TH', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
