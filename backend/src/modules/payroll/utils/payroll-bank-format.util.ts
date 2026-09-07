import { BadRequestException } from '@nestjs/common';
import {
  buildFixedWidthLine,
  formatDateDMY,
  joinFixedWidthLines,
  padAmountSatang,
  padNumber,
  padText,
} from './payroll-fixed-width.util';
import { buildCsv, csvDigits, csvMoney } from './payroll-csv.util';

/**
 * รูปแบบไฟล์นำเข้าระบบจ่ายเงินเดือนของธนาคาร
 * -----------------------------------------------------------------------------
 * แต่ละธนาคารมีรูปแบบของตัวเอง ไฟล์นี้เก็บไว้ที่เดียวเพื่อเพิ่มธนาคารใหม่ได้ง่าย
 *
 * ⚠️ ตำแหน่งและความกว้างของช่องในรูปแบบ KTB ด้านล่าง อ้างอิงโครงสร้างทั่วไป
 *    ของ KTB iPay ต้องนำไปเทียบกับเอกสารสเปกที่ธนาคารออกให้ก่อนใช้งานจริง
 *    ถ้าธนาคารให้สเปกมาแล้ว แก้ที่ KTB_FIELD_WIDTHS จุดเดียวได้เลย
 */

export type BankTransferRow = {
  sequence: number;
  employeeCode: string;
  employeeName: string;
  bankAccountNo?: string | null;
  bankAccountName: string;
  bankName?: string | null;
  netPay: number;
};

export type BankTransferContext = {
  companyName: string;
  /** รหัสบริษัทที่ธนาคารออกให้ */
  companyCode?: string | null;
  /** บัญชีบริษัทที่ใช้ตัดจ่าย */
  debitAccountNo?: string | null;
  paymentDate?: string | Date | null;
  runNo: string;
};

export type BankTransferSkippedRow = {
  employeeName: string;
  missing: string[];
};

export type BankTransferFile = {
  content: string;
  fileName: string;
  /** true = ยังต้องเทียบกับสเปกจริงของธนาคารก่อนนำไปใช้ */
  requiresSpecReview: boolean;
  note: string;
  /** จำนวนรายการทั้งหมดก่อนคัดออก */
  totalRows?: number;
  /** จำนวนรายการที่โอนได้จริง */
  filedRows?: number;
  /** รายชื่อที่ถูกข้าม พร้อมข้อมูลที่ขาด — ต้องเอาไปแสดงบนหน้าจอ */
  skipped?: BankTransferSkippedRow[];
};

export const SUPPORTED_BANK_FORMATS = ['GENERIC_CSV', 'KTB_IPAY'] as const;
export type BankTransferFormat = (typeof SUPPORTED_BANK_FORMATS)[number];

export const BANK_FORMAT_LABEL: Record<BankTransferFormat, string> = {
  GENERIC_CSV: 'CSV รูปแบบกลาง',
  KTB_IPAY: 'กรุงไทย (KTB iPay)',
};

/**
 * ความกว้างของแต่ละช่องในไฟล์ KTB iPay
 * รวมทั้งบรรทัด 200 ตัวอักษร
 */
const KTB_FIELD_WIDTHS = {
  recordType: 1,
  sequence: 6,
  receivingBankCode: 3,
  receivingBranchCode: 4,
  receivingAccountNo: 11,
  amountSatang: 13,
  receiverName: 100,
  employeeRef: 20,
  effectiveDate: 8,
  filler: 34,
} as const;

const KTB_TOTAL_WIDTH = Object.values(KTB_FIELD_WIDTHS).reduce(
  (sum, width) => sum + width,
  0,
);

/** รหัสธนาคารกรุงไทยตามมาตรฐานธนาคารแห่งประเทศไทย */
const KTB_BANK_CODE = '006';

function buildKtbHeader(context: BankTransferContext, rows: BankTransferRow[]) {
  const totalSatang = rows.reduce(
    (sum, row) => sum + Math.round(row.netPay * 100),
    0,
  );

  return buildFixedWidthLine([
    { name: 'recordType', value: '1', width: 1 },
    {
      name: 'companyCode',
      value: padText(context.companyCode ?? '', 10),
      width: 10,
    },
    {
      name: 'debitAccountNo',
      value: padNumber(context.debitAccountNo ?? '', 11),
      width: 11,
    },
    {
      name: 'effectiveDate',
      value: formatDateDMY(context.paymentDate),
      width: 8,
    },
    { name: 'totalRecords', value: padNumber(rows.length, 6), width: 6 },
    {
      name: 'totalAmount',
      value: String(totalSatang).padStart(15, '0'),
      width: 15,
    },
    {
      name: 'companyName',
      value: padText(context.companyName, 100),
      width: 100,
    },
    {
      name: 'filler',
      value: padText('', KTB_TOTAL_WIDTH - 151),
      width: KTB_TOTAL_WIDTH - 151,
    },
  ]);
}

function buildKtbDetail(row: BankTransferRow, context: BankTransferContext) {
  return buildFixedWidthLine([
    { name: 'recordType', value: '2', width: KTB_FIELD_WIDTHS.recordType },
    {
      name: 'sequence',
      value: padNumber(row.sequence, KTB_FIELD_WIDTHS.sequence),
      width: KTB_FIELD_WIDTHS.sequence,
    },
    {
      name: 'receivingBankCode',
      value: KTB_BANK_CODE,
      width: KTB_FIELD_WIDTHS.receivingBankCode,
    },
    {
      // โอนเข้าบัญชีกรุงไทยด้วยกัน ไม่ต้องระบุสาขา ใช้ 0000
      name: 'receivingBranchCode',
      value: padNumber('', KTB_FIELD_WIDTHS.receivingBranchCode),
      width: KTB_FIELD_WIDTHS.receivingBranchCode,
    },
    {
      name: 'receivingAccountNo',
      value: padNumber(
        row.bankAccountNo ?? '',
        KTB_FIELD_WIDTHS.receivingAccountNo,
      ),
      width: KTB_FIELD_WIDTHS.receivingAccountNo,
    },
    {
      name: 'amountSatang',
      value: padAmountSatang(row.netPay, KTB_FIELD_WIDTHS.amountSatang),
      width: KTB_FIELD_WIDTHS.amountSatang,
    },
    {
      name: 'receiverName',
      value: padText(row.bankAccountName, KTB_FIELD_WIDTHS.receiverName),
      width: KTB_FIELD_WIDTHS.receiverName,
    },
    {
      name: 'employeeRef',
      value: padText(row.employeeCode, KTB_FIELD_WIDTHS.employeeRef),
      width: KTB_FIELD_WIDTHS.employeeRef,
    },
    {
      name: 'effectiveDate',
      value: formatDateDMY(context.paymentDate),
      width: KTB_FIELD_WIDTHS.effectiveDate,
    },
    {
      name: 'filler',
      value: padText('', KTB_FIELD_WIDTHS.filler),
      width: KTB_FIELD_WIDTHS.filler,
    },
  ]);
}

function buildKtbFile(
  rows: BankTransferRow[],
  context: BankTransferContext,
): BankTransferFile {
  // รายการที่ไม่มีเลขบัญชีจะสร้างบรรทัดที่ธนาคารปฏิเสธ จึงตัดออกก่อน
  const payableRows = rows.filter(
    (row) => Boolean(row.bankAccountNo) && row.netPay > 0,
  );

  const skipped = rows
    .filter((row) => !row.bankAccountNo && row.netPay > 0)
    .map((row) => ({
      employeeName: row.employeeName,
      missing: ['เลขที่บัญชีธนาคาร'],
    }));

  /*
   * ปฏิเสธไม่ให้สร้างไฟล์ที่ธนาคารจะตีกลับทั้งไฟล์
   *
   * ของเดิมถ้าทุกคนไม่มีเลขบัญชี จะได้ไฟล์ที่มีแต่บรรทัดหัว แล้วส่งเข้าธนาคารจริงได้
   * โดยหน้าจอยังขึ้นยอดเงินครบถ้วน ไม่มีอะไรเตือนว่าไฟล์ใช้ไม่ได้
   */
  if (payableRows.length === 0) {
    throw new BadRequestException(
      rows.length === 0
        ? 'ไม่มีรายการจ่ายเงินในรอบนี้ จึงสร้างไฟล์โอนเงินไม่ได้'
        : `ไม่มีรายการที่มีเลขบัญชีธนาคารครบ (จากทั้งหมด ${rows.length} รายการ) กรุณากรอกเลขบัญชีพนักงานให้ครบก่อน`,
    );
  }

  const lines = [
    buildKtbHeader(context, payableRows),
    ...payableRows.map((row) => buildKtbDetail(row, context)),
  ];

  return {
    content: joinFixedWidthLines(lines),
    fileName: `ktb-ipay-${context.runNo}.txt`,
    requiresSpecReview: true,
    note: [
      `รวม ${payableRows.length} รายการ`,
      skipped.length > 0
        ? `ข้าม ${skipped.length} รายการที่ไม่มีเลขบัญชี`
        : null,
      'ต้องเทียบกับเอกสารสเปก KTB iPay ก่อนอัปโหลดจริง',
    ]
      .filter(Boolean)
      .join(' | '),
    totalRows: rows.length,
    filedRows: payableRows.length,
    skipped,
  };
}

function buildGenericCsvFile(
  rows: BankTransferRow[],
  context: BankTransferContext,
): BankTransferFile {
  const headers = [
    'ลำดับ',
    'ธนาคาร',
    'เลขที่บัญชี',
    'ชื่อบัญชี',
    'รหัสพนักงาน',
    'ชื่อ-สกุล',
    'จำนวนเงินโอน',
  ];

  const content = buildCsv(
    headers,
    rows.map((row) => ({
      ลำดับ: row.sequence,
      ธนาคาร: row.bankName ?? '',
      เลขที่บัญชี: csvDigits(row.bankAccountNo),
      ชื่อบัญชี: row.bankAccountName,
      รหัสพนักงาน: row.employeeCode,
      'ชื่อ-สกุล': row.employeeName,
      จำนวนเงินโอน: csvMoney(row.netPay),
    })),
  );

  return {
    content,
    fileName: `bank-transfer-${context.runNo}.csv`,
    requiresSpecReview: false,
    note: `รวม ${rows.length} รายการ`,
  };
}

export function buildBankTransferFile(
  format: BankTransferFormat,
  rows: BankTransferRow[],
  context: BankTransferContext,
): BankTransferFile {
  if (format === 'KTB_IPAY') return buildKtbFile(rows, context);
  return buildGenericCsvFile(rows, context);
}

export { KTB_FIELD_WIDTHS, KTB_TOTAL_WIDTH };
