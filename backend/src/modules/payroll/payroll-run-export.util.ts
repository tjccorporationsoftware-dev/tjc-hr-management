import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';

import {
  DOCUMENT_BASE_CSS,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  renderLetterhead,
  toAmount,
  type DocumentCompany,
} from './payroll-document.util';

/**
 * รายงานสรุปรอบเงินเดือน
 * ----------------------
 * ออกได้ 2 แบบจากข้อมูลชุดเดียวกัน
 *  - PDF (A4 แนวนอน) เอกสารสำหรับพิมพ์เสนอผู้บริหาร มีหัวจดหมาย ช่องลงนาม เลขหน้า
 *  - XLSX 2 ชีต      ชีตแรกละเอียดรายคนไว้ทำงานต่อ ชีตสองสรุปยอดไว้กระทบยอด
 *
 * หน้าตา PDF ใช้ธีมเดียวกับสลิปเงินเดือน (payroll-document.util) เอกสารจากระบบ
 * จึงเป็นชุดเดียวกันทั้งหมด
 */

export type PayrollRunExportResult = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

type ExportLineType =
  | 'EARNING'
  | 'DEDUCTION'
  | 'EMPLOYER_CONTRIBUTION'
  | 'INFO';

type ExportLine = {
  code?: string | null;
  name?: string | null;
  type?: ExportLineType | null;
  amount?: unknown;
  sortOrder?: number | null;
};

type ExportPayrollItem = {
  id: string;
  baseSalary?: unknown;
  totalEarnings?: unknown;
  totalDeductions?: unknown;
  totalGrossPay?: unknown;
  totalNetPay?: unknown;
  branchName?: string | null;
  departmentName?: string | null;
  snapshot?: unknown;
  employee: {
    employeeCode?: string | null;
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    position?: string | null;
    department?: { nameTh?: string | null } | null;
    branch?: { nameTh?: string | null } | null;
  };
  compensation?: {
    paymentMethod?: string | null;
    bankName?: string | null;
    bankAccountNo?: string | null;
    bankAccountName?: string | null;
  } | null;
  lines: ExportLine[];
};

type ExportActor = {
  displayName?: string | null;
  email?: string | null;
} | null;

type ExportPayrollRun = {
  runNo: string;
  name?: string | null;
  status?: string | null;
  totalEmployees?: number | null;
  totalEarnings?: unknown;
  totalDeductions?: unknown;
  totalGrossPay?: unknown;
  totalNetPay?: unknown;
  calculatedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  paidAt?: Date | string | null;
  createdBy?: ExportActor;
  calculatedBy?: ExportActor;
  reviewedBy?: ExportActor;
  approvedBy?: ExportActor;
  company: DocumentCompany;
  period: {
    code?: string | null;
    name?: string | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    paymentDate?: Date | string | null;
  };
  items: ExportPayrollItem[];
};

type LineDefinition = {
  key: string;
  label: string;
  code: string;
  sortOrder: number;
};

const RUN_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'ฉบับร่าง',
  CALCULATING: 'กำลังคำนวณ',
  CALCULATED: 'คำนวณแล้ว',
  REVIEWED: 'ตรวจสอบแล้ว',
  APPROVED: 'อนุมัติแล้ว',
  PAID: 'จ่ายเงินแล้ว',
  CANCELLED: 'ยกเลิก',
  FAILED: 'ไม่สำเร็จ',
};

/* สีของ Excel ล้อ token ฝั่ง PDF: accent = #1e3a8a, พื้นอ่อน = #eff6ff */
const XLSX_ACCENT = 'FF1E3A8A';
const XLSX_ACCENT_SOFT = 'FFEFF6FF';
const XLSX_BAND = 'FFF8FAFC';
const XLSX_RULE = 'FFCBD5E1';
const XLSX_RULE_SOFT = 'FFE2E8F0';
const MONEY_FORMAT = '#,##0.00;[Red]-#,##0.00';

function money(value: unknown) {
  return toAmount(value);
}

function moneyText(value: unknown) {
  return formatMoney(value);
}

function dateText(value: Date | string | null | undefined) {
  return formatDate(value);
}

function dateTimeText(value: Date | string | null | undefined) {
  return formatDateTime(value);
}

function safeText(value: unknown, fallback = '-') {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text || fallback;
}

function statusLabel(status?: string | null) {
  if (!status) return '-';
  return RUN_STATUS_LABEL[status] ?? status;
}

function actorName(actor: ExportActor | undefined) {
  if (!actor) return '';
  return safeText(actor.displayName, '') || safeText(actor.email, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function snapshotSection(
  item: ExportPayrollItem,
  key: 'employee' | 'compensation',
) {
  const snapshot = isRecord(item.snapshot) ? item.snapshot : null;
  const section = snapshot?.[key];
  return isRecord(section) ? section : null;
}

function snapshotString(
  item: ExportPayrollItem,
  section: 'employee' | 'compensation',
  key: string,
) {
  const value = snapshotSection(item, section)?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function employeeName(item: ExportPayrollItem) {
  return (
    snapshotString(item, 'employee', 'name') ||
    safeText(item.employee.displayName, '') ||
    [item.employee.title, item.employee.firstName, item.employee.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    safeText(item.employee.employeeCode)
  );
}

function employeeDepartment(item: ExportPayrollItem) {
  return (
    item.departmentName ||
    item.branchName ||
    snapshotString(item, 'employee', 'department') ||
    snapshotString(item, 'employee', 'branch') ||
    item.employee.department?.nameTh ||
    item.employee.branch?.nameTh ||
    '-'
  );
}

function employeePosition(item: ExportPayrollItem) {
  return (
    snapshotString(item, 'employee', 'position') ||
    item.employee.position ||
    '-'
  );
}

function paymentMethodLabel(method?: string | null) {
  if (method === 'BANK_TRANSFER') return 'โอนธนาคาร';
  if (method === 'CASH') return 'เงินสด';
  if (method === 'CHEQUE') return 'เช็ค';
  if (method === 'OTHER') return 'อื่น ๆ';
  return 'ยังไม่ระบุ';
}

function itemPaymentMethod(item: ExportPayrollItem) {
  return (
    snapshotString(item, 'compensation', 'paymentMethod') ||
    item.compensation?.paymentMethod ||
    null
  );
}

function itemBankName(item: ExportPayrollItem) {
  return (
    snapshotString(item, 'compensation', 'bankName') ||
    item.compensation?.bankName ||
    '-'
  );
}

function itemBankAccountName(item: ExportPayrollItem) {
  return (
    snapshotString(item, 'compensation', 'bankAccountName') ||
    item.compensation?.bankAccountName ||
    '-'
  );
}

function itemBankAccountNo(item: ExportPayrollItem) {
  return (
    snapshotString(item, 'compensation', 'bankAccountNo') ||
    item.compensation?.bankAccountNo ||
    ''
  );
}

function maskBankAccount(accountNo?: string | null) {
  const text = accountNo?.trim();
  return text || '-';
}

function lineLabel(line: ExportLine) {
  return safeText(line.name, safeText(line.code, 'ไม่ระบุรายการ'));
}

function lineKey(line: ExportLine) {
  return `${safeText(line.code, 'NO_CODE')}::${lineLabel(line)}`;
}

function lineType(line: ExportLine) {
  return line.type === 'EARNING' || line.type === 'DEDUCTION'
    ? line.type
    : null;
}

function buildLineDefinitions(
  run: ExportPayrollRun,
  type: 'EARNING' | 'DEDUCTION',
) {
  const map = new Map<string, LineDefinition>();

  run.items.forEach((item) => {
    item.lines.forEach((line) => {
      if (lineType(line) !== type || money(line.amount) === 0) return;
      const key = lineKey(line);
      if (map.has(key)) return;
      map.set(key, {
        key,
        label: lineLabel(line),
        code: safeText(line.code, ''),
        sortOrder: Number(line.sortOrder ?? 999),
      });
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label, 'th');
  });
}

function sumLinesByDefinition(
  item: ExportPayrollItem,
  definition: LineDefinition,
  type: 'EARNING' | 'DEDUCTION',
) {
  return item.lines
    .filter(
      (line) => lineType(line) === type && lineKey(line) === definition.key,
    )
    .reduce((sum, line) => sum + money(line.amount), 0);
}

function buildRunLineTotals(
  run: ExportPayrollRun,
  type: 'EARNING' | 'DEDUCTION',
) {
  const totals = new Map<string, number>();

  run.items.forEach((item) => {
    item.lines.forEach((line) => {
      if (lineType(line) !== type || money(line.amount) === 0) return;
      const label = lineLabel(line);
      totals.set(label, (totals.get(label) ?? 0) + money(line.amount));
    });
  });

  return Array.from(totals.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function safeFilePart(value: string | null | undefined) {
  return (
    (value || 'payroll-run')
      .replace(/[^\w.\-ก-๙]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'payroll-run'
  );
}

function companyName(run: ExportPayrollRun) {
  return run.company.nameTh || run.company.nameEn || run.company.code || '-';
}

function periodName(run: ExportPayrollRun) {
  return run.period.name || run.period.code || '-';
}

function periodRange(run: ExportPayrollRun) {
  return `${dateText(run.period.startDate)} - ${dateText(run.period.endDate)}`;
}

function makeFileName(run: ExportPayrollRun, ext: 'xlsx' | 'pdf') {
  return `${safeFilePart(run.runNo)}-${safeFilePart(run.period.code || run.period.name)}.${ext}`;
}

/* ===============================================================
   XLSX
   =============================================================== */

function thinBorder(color: string): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}

function fillCell(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/** หัวตาราง: พื้นน้ำเงินเข้ม ตัวหนังสือขาว ล้อสี accent ของ PDF */
function styleTableHeader(row: ExcelJS.Row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    fillCell(cell, XLSX_ACCENT);
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = thinBorder(XLSX_RULE);
  });
}

function styleSectionTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 11, color: { argb: XLSX_ACCENT } };
}

function addInfoRow(
  sheet: ExcelJS.Worksheet,
  pairs: [string, string][],
): ExcelJS.Row {
  const row = sheet.addRow(pairs.flat());

  pairs.forEach((_, index) => {
    const labelCell = row.getCell(index * 2 + 1);
    labelCell.font = { size: 10, color: { argb: 'FF6B7280' } };
    row.getCell(index * 2 + 2).font = { bold: true, size: 10 };
  });

  return row;
}

function buildDetailSheet(run: ExportPayrollRun, workbook: ExcelJS.Workbook) {
  const incomeDefinitions = buildLineDefinitions(run, 'EARNING');
  const deductionDefinitions = buildLineDefinitions(run, 'DEDUCTION');
  const sheet = workbook.addWorksheet('รายละเอียดรายคน', {
    views: [{ state: 'frozen' }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const header = [
    'ลำดับ',
    'รหัสพนักงาน',
    'ชื่อพนักงาน',
    'แผนก / สาขา',
    'ตำแหน่ง',
    ...incomeDefinitions.map((item) => item.label),
    'รวมรายได้',
    ...deductionDefinitions.map((item) => item.label),
    'รวมรายการหัก',
    'เงินสุทธิ',
    'วิธีจ่าย',
    'ธนาคาร',
    'ชื่อบัญชี',
    'เลขบัญชี',
  ];

  /* คอลัมน์เงินคือช่วงหลังข้อมูลพนักงาน 5 คอลัมน์ ถึงก่อนข้อมูลบัญชี 4 คอลัมน์ */
  const firstMoneyColumn = 6;
  const lastMoneyColumn = header.length - 4;

  const titleRow = sheet.addRow(['รายงานสรุปการจ่ายเงินเดือน']);
  sheet.mergeCells(
    titleRow.number,
    1,
    titleRow.number,
    Math.min(header.length, 12),
  );
  titleRow.getCell(1).font = {
    bold: true,
    size: 15,
    color: { argb: XLSX_ACCENT },
  };
  titleRow.height = 22;

  const companyRow = sheet.addRow([companyName(run)]);
  sheet.mergeCells(
    companyRow.number,
    1,
    companyRow.number,
    Math.min(header.length, 12),
  );
  companyRow.getCell(1).font = { size: 10.5, color: { argb: 'FF4B5563' } };

  sheet.addRow([]);

  addInfoRow(sheet, [
    ['เลขที่รอบคำนวณ', run.runNo],
    ['งวดเงินเดือน', periodName(run)],
    ['สถานะ', statusLabel(run.status)],
  ]);
  addInfoRow(sheet, [
    ['ช่วงงวด', periodRange(run)],
    ['วันที่จ่าย', dateText(run.period.paymentDate)],
    ['จำนวนพนักงาน', `${run.items.length} คน`],
  ]);
  addInfoRow(sheet, [
    ['คำนวณเมื่อ', dateTimeText(run.calculatedAt)],
    ['อนุมัติเมื่อ', dateTimeText(run.approvedAt)],
    ['ออกรายงานเมื่อ', dateTimeText(new Date())],
  ]);

  sheet.addRow([]);

  const headerRow = sheet.addRow(header);
  const headerRowNumber = headerRow.number;
  styleTableHeader(headerRow);

  run.items.forEach((item, index) => {
    const values: Array<string | number> = [
      index + 1,
      item.employee.employeeCode || '-',
      employeeName(item),
      employeeDepartment(item),
      employeePosition(item),
    ];

    incomeDefinitions.forEach((definition) => {
      values.push(sumLinesByDefinition(item, definition, 'EARNING'));
    });

    values.push(money(item.totalEarnings));

    deductionDefinitions.forEach((definition) => {
      values.push(sumLinesByDefinition(item, definition, 'DEDUCTION'));
    });

    values.push(money(item.totalDeductions));
    values.push(money(item.totalNetPay));
    values.push(paymentMethodLabel(itemPaymentMethod(item)));
    values.push(itemBankName(item));
    values.push(itemBankAccountName(item));
    values.push(maskBankAccount(itemBankAccountNo(item)));

    const row = sheet.addRow(values);

    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder(XLSX_RULE_SOFT);
      cell.font = { size: 10 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 1 ? 'center' : 'left',
        wrapText: colNumber >= 3 && colNumber <= 5,
      };

      /* แถบสลับสีช่วยไล่สายตาตอนตารางกว้างจนต้องเลื่อนจอ */
      if (index % 2 === 1) fillCell(cell, XLSX_BAND);

      if (colNumber >= firstMoneyColumn && colNumber <= lastMoneyColumn) {
        cell.numFmt = MONEY_FORMAT;
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });

    /* เงินสุทธิคือตัวเลขที่คนอ่านมองหาก่อน จึงเน้นให้เด่นกว่าคอลัมน์อื่น */
    const netCell = row.getCell(lastMoneyColumn);
    netCell.font = { size: 10, bold: true, color: { argb: XLSX_ACCENT } };
  });

  const dataStartRow = headerRowNumber + 1;
  const dataEndRow = headerRowNumber + run.items.length;

  const totalRow = sheet.addRow(['รวมทั้งงวด']);
  sheet.mergeCells(totalRow.number, 1, totalRow.number, 5);

  for (
    let columnIndex = firstMoneyColumn;
    columnIndex <= lastMoneyColumn;
    columnIndex += 1
  ) {
    const letter = sheet.getColumn(columnIndex).letter;
    const cell = totalRow.getCell(columnIndex);

    cell.value = run.items.length
      ? {
          formula: `SUM(${letter}${dataStartRow}:${letter}${dataEndRow})`,
          result: 0,
        }
      : 0;
    cell.numFmt = MONEY_FORMAT;
  }

  totalRow.height = 22;
  for (let columnIndex = 1; columnIndex <= header.length; columnIndex += 1) {
    const cell = totalRow.getCell(columnIndex);
    cell.font = { bold: true, size: 10.5, color: { argb: XLSX_ACCENT } };
    fillCell(cell, XLSX_ACCENT_SOFT);
    cell.border = {
      top: { style: 'double', color: { argb: XLSX_RULE } },
      bottom: { style: 'thin', color: { argb: XLSX_RULE } },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: columnIndex >= firstMoneyColumn ? 'right' : 'left',
    };
  }

  sheet.columns.forEach((column, index) => {
    column.width = index < 5 ? [7, 15, 26, 22, 22][index] : 15;
  });

  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: header.length },
  };

  /*
   * ตรึงทั้งหัวตารางและ 3 คอลัมน์แรก — ตารางนี้กว้างตามจำนวนรายการเงินได้/รายการหัก
   * ถ้าไม่ตรึง พอเลื่อนไปดูคอลัมน์ท้าย ๆ จะไม่รู้ว่ากำลังดูของพนักงานคนไหน
   */
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: headerRowNumber }];

  /* ให้ Excel พิมพ์หัวตารางซ้ำทุกหน้า */
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
}

function buildSummarySheet(run: ExportPayrollRun, workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet('สรุปยอด', {
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      paperSize: 9,
    },
  });

  const titleRow = sheet.addRow(['สรุปยอดการจ่ายเงินเดือน']);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 3);
  titleRow.getCell(1).font = {
    bold: true,
    size: 15,
    color: { argb: XLSX_ACCENT },
  };
  titleRow.height = 22;

  const companyRow = sheet.addRow([companyName(run)]);
  sheet.mergeCells(companyRow.number, 1, companyRow.number, 3);
  companyRow.getCell(1).font = { size: 10.5, color: { argb: 'FF4B5563' } };

  sheet.addRow([]);
  addInfoRow(sheet, [['เลขที่รอบคำนวณ', run.runNo]]);
  addInfoRow(sheet, [['งวดเงินเดือน', periodName(run)]]);
  addInfoRow(sheet, [['ช่วงงวด', periodRange(run)]]);
  addInfoRow(sheet, [['วันที่จ่าย', dateText(run.period.paymentDate)]]);
  addInfoRow(sheet, [['สถานะ', statusLabel(run.status)]]);
  addInfoRow(sheet, [['จำนวนพนักงาน', `${run.items.length} คน`]]);
  sheet.addRow([]);

  function addTotalsBlock(
    title: string,
    rows: { label: string; amount: number }[],
    totalLabel: string,
    totalAmount: number,
  ) {
    const sectionRow = sheet.addRow([title]);
    styleSectionTitle(sectionRow.getCell(1));

    const headerRow = sheet.addRow(['รายการ', 'จำนวนเงิน', 'สัดส่วน']);
    styleTableHeader(headerRow);

    const base = rows.reduce((sum, row) => sum + row.amount, 0);

    rows.forEach((rowValue, index) => {
      const row = sheet.addRow([
        rowValue.label,
        rowValue.amount,
        base > 0 ? rowValue.amount / base : 0,
      ]);

      row.eachCell((cell, colNumber) => {
        cell.border = thinBorder(XLSX_RULE_SOFT);
        cell.font = { size: 10 };
        if (index % 2 === 1) fillCell(cell, XLSX_BAND);
        if (colNumber === 2) {
          cell.numFmt = MONEY_FORMAT;
          cell.alignment = { horizontal: 'right' };
        }
        if (colNumber === 3) {
          cell.numFmt = '0.0%';
          cell.alignment = { horizontal: 'right' };
        }
      });
    });

    if (rows.length === 0) {
      const row = sheet.addRow(['ไม่มีรายการ', 0, 0]);
      row.getCell(1).font = {
        size: 10,
        italic: true,
        color: { argb: 'FF9CA3AF' },
      };
      row.getCell(2).numFmt = MONEY_FORMAT;
      row.getCell(3).numFmt = '0.0%';
    }

    const totalRow = sheet.addRow([totalLabel, totalAmount, base > 0 ? 1 : 0]);
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 10.5, color: { argb: XLSX_ACCENT } };
      fillCell(cell, XLSX_ACCENT_SOFT);
      cell.border = {
        top: { style: 'double', color: { argb: XLSX_RULE } },
        bottom: { style: 'thin', color: { argb: XLSX_RULE } },
      };
      if (colNumber === 2) {
        cell.numFmt = MONEY_FORMAT;
        cell.alignment = { horizontal: 'right' };
      }
      if (colNumber === 3) {
        cell.numFmt = '0.0%';
        cell.alignment = { horizontal: 'right' };
      }
    });

    sheet.addRow([]);
  }

  addTotalsBlock(
    'รายการรายได้',
    buildRunLineTotals(run, 'EARNING'),
    'รวมรายได้',
    money(run.totalEarnings),
  );
  addTotalsBlock(
    'รายการหัก',
    buildRunLineTotals(run, 'DEDUCTION'),
    'รวมรายการหัก',
    money(run.totalDeductions),
  );

  const netSectionRow = sheet.addRow(['ยอดจ่ายสุทธิ']);
  styleSectionTitle(netSectionRow.getCell(1));

  const netRow = sheet.addRow([
    'เงินสุทธิที่ต้องจ่าย',
    money(run.totalNetPay),
    '',
  ]);
  netRow.height = 24;
  netRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 12, color: { argb: XLSX_ACCENT } };
    fillCell(cell, XLSX_ACCENT_SOFT);
    cell.border = thinBorder(XLSX_RULE);
    if (colNumber === 2) {
      cell.numFmt = MONEY_FORMAT;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.alignment = { vertical: 'middle' };
    }
  });

  sheet.columns = [{ width: 38 }, { width: 18 }, { width: 12 }];
}

export async function generatePayrollRunExcel(
  run: ExportPayrollRun,
): Promise<PayrollRunExportResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HR Workforce Management System';
  workbook.created = new Date();

  buildDetailSheet(run, workbook);
  buildSummarySheet(run, workbook);

  const xlsx = await workbook.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(xlsx),
    fileName: makeFileName(run, 'xlsx'),
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/* ===============================================================
   PDF
   =============================================================== */

function renderFieldCell(label: string, value: unknown, span = 1) {
  return `
    <td class="field" ${span > 1 ? `colspan="${span}"` : ''}>
      <div class="field-label">${escapeHtml(label)}</div>
      <div class="field-value">${escapeHtml(value || '-')}</div>
    </td>
  `;
}

/**
 * แถวสรุปหนึ่งรายการ — ชื่อรายการชิดซ้าย จำนวนเงินชิดขวา คั่นด้วยจุดไข่ปลา
 * กระดาษแนวนอนกว้างเกินกว่าจะปล่อยให้ชื่อกับตัวเลขห่างกันลอย ๆ ครึ่งหน้า
 */
function renderSummaryRow(
  label: string,
  amount: unknown,
  variant: 'item' | 'total' = 'item',
) {
  return `
    <div class="sum-row${variant === 'total' ? ' sum-total' : ''}">
      <span class="sum-label">${escapeHtml(label)}</span>
      <span class="sum-dots"></span>
      <span class="sum-amount">${moneyText(amount)}</span>
    </div>
  `;
}

function renderSummaryColumn(
  title: string,
  rows: { label: string; amount: number }[],
  totalLabel: string,
  totalAmount: unknown,
) {
  const body = rows.length
    ? rows.map((row) => renderSummaryRow(row.label, row.amount)).join('')
    : '<div class="sum-row sum-empty">ไม่มีรายการ</div>';

  return `
    <div class="sum-col">
      <div class="sum-head">
        <span>${escapeHtml(title)}</span>
        <span>จำนวนเงิน</span>
      </div>
      <div class="sum-body">${body}</div>
      ${renderSummaryRow(totalLabel, totalAmount, 'total')}
    </div>
  `;
}

function renderSignature(role: string, name: string) {
  return `
    <div class="signature">
      <div class="signature-line">&nbsp;</div>
      <div class="signature-name">${name ? `( ${escapeHtml(name)} )` : '(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)'}</div>
      <div class="signature-role">${escapeHtml(role)}</div>
    </div>
  `;
}

function buildPdfHtml(run: ExportPayrollRun) {
  const incomeTotals = buildRunLineTotals(run, 'EARNING');
  const deductionTotals = buildRunLineTotals(run, 'DEDUCTION');

  const employeeRows = run.items
    .map(
      (item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(item.employee.employeeCode || '-')}</td>
        <td>${escapeHtml(employeeName(item))}</td>
        <td>${escapeHtml(employeeDepartment(item))}</td>
        <td>${escapeHtml(itemBankName(item))}</td>
        <td>${escapeHtml(maskBankAccount(itemBankAccountNo(item)))}</td>
        <td class="amount">${moneyText(item.totalEarnings)}</td>
        <td class="amount">${moneyText(item.totalDeductions)}</td>
        <td class="amount net">${moneyText(item.totalNetPay)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>รายงานสรุปการจ่ายเงินเดือน ${escapeHtml(run.runNo)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 10mm 14mm; }

    ${DOCUMENT_BASE_CSS}

    body { font-size: 12px; }

    /* ---------- แถบยอดรวม ---------- */

    /*
     * minmax(0, 1fr) ไม่ใช่ 1fr เฉย ๆ — 1fr มีพื้นขั้นต่ำเป็น min-content ช่อง
     * "เงินสุทธิที่ต้องจ่าย" ที่ป้ายยาวกว่าเพื่อนเลยกินที่มากกว่า เส้นคั่นจึงไม่
     * ตรงกับตารางข้อมูลหัวเอกสารข้างบนที่แบ่ง 4 ช่องเท่ากัน
     */
    .totals {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-top: 1px solid var(--rule);
      border-bottom: 1px solid var(--rule);
    }

    .total-item {
      padding: 9px 12px 10px;
      border-right: 1px solid var(--rule-soft);
    }

    .total-item:last-child { border-right: 0; }

    .total-item.net { background: var(--accent-bg); }

    .total-label {
      color: var(--ink-faint);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .total-value {
      margin-top: 3px;
      font-size: 18px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .total-item.net .total-value { color: var(--accent); font-size: 21px; }

    /* ---------- หัวข้อของแต่ละส่วน ---------- */

    .section-title {
      break-after: avoid;
      padding: 7px 14px 6px;
      border-top: 1px solid var(--rule-strong);
      border-bottom: 1px solid var(--rule);
      background: #f8fafc;
      font-size: 12.5px;
      font-weight: 800;
    }

    /* ---------- สรุปตามประเภทรายการ ---------- */

    .sum-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      break-inside: avoid;
    }

    /*
     * ทั้งสองคอลัมน์มีจำนวนรายการไม่เท่ากันเสมอ ถ้าไม่ดันแถวรวมลงล่างสุด
     * คอลัมน์ที่รายการน้อยกว่าจะจบก่อนแล้วเหลือพื้นขาวห้อยอยู่ข้างใต้
     */
    .sum-col {
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--rule);
    }

    .sum-col:last-child { border-right: 0; }

    .sum-body { flex: 1 1 auto; }

    .sum-head {
      display: flex;
      justify-content: space-between;
      padding: 5px 14px;
      background: #f1f5f9;
      border-bottom: 1px solid var(--rule);
      color: var(--ink-soft);
      font-size: 10.4px;
      font-weight: 800;
      letter-spacing: 0.03em;
    }

    .sum-row {
      display: flex;
      align-items: baseline;
      gap: 7px;
      padding: 4px 14px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 11.6px;
    }

    .sum-label { flex: 0 1 auto; }

    /* เส้นจุดไข่ปลาโยงชื่อรายการไปหาจำนวนเงิน */
    .sum-dots {
      flex: 1 1 auto;
      min-width: 14px;
      border-bottom: 1px dotted #cbd5e1;
      transform: translateY(-3px);
    }

    .sum-amount {
      flex: 0 0 auto;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .sum-empty { color: var(--ink-faint); }

    .sum-total {
      border-top: 1px solid var(--rule-strong);
      border-bottom: 0;
      background: #f8fafc;
      font-size: 12px;
      font-weight: 800;
    }

    .sum-total .sum-dots { border-bottom-color: transparent; }

    /* ---------- ตารางรายพนักงาน ---------- */

    /*
     * table-layout: fixed + colgroup — ตาราง auto บนกระดาษแนวนอนจะเอาที่ว่าง
     * ไปโปะคอลัมน์ที่ข้อความยาวสุด คอลัมน์จำนวนเงินเลยกว้างเป็นสองเท่าของตัวเลข
     * และตัวเลขที่ชิดขวาก็หลุดออกจากหัวคอลัมน์ของตัวเอง
     */
    .data-table { table-layout: fixed; }

    .data-table th {
      padding: 6px 9px;
      background: #f1f5f9;
      border-bottom: 1px solid var(--rule);
      border-right: 1px solid var(--rule-soft);
      font-size: 10.4px;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-align: left;
    }

    /*
     * ปล่อยให้ตัดบรรทัดได้ ไม่ตัดท้ายด้วย ellipsis — ชื่อพนักงานหรือชื่อธนาคาร
     * ที่ยาวเกินคอลัมน์ต้องอ่านได้ครบ เอกสารนี้ใช้เสนออนุมัติจ่ายเงิน
     */
    .data-table td {
      padding: 4px 9px;
      border-bottom: 1px solid #f1f5f9;
      border-right: 1px solid var(--rule-soft);
      vertical-align: middle;
      font-size: 11.4px;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .data-table tbody tr:nth-child(even) td { background: #fafcfe; }

    .data-table th:last-child,
    .data-table td:last-child { border-right: 0; }

    .data-table .amount,
    .data-table th.amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .data-table .center,
    .data-table th.center { text-align: center; }

    .data-table td.net { font-weight: 800; color: var(--accent); }

    /*
     * ค่าเริ่มต้นของ tfoot คือ table-footer-group ซึ่งเบราว์เซอร์จะพิมพ์ซ้ำท้าย
     * "ทุกหน้า" — หน้าแรกจะขึ้นยอดรวมทั้งงวดทั้งที่ยังแสดงพนักงานไม่ครบ อ่านแล้วเข้าใจผิด
     * บังคับเป็น row-group ให้แถวรวมโผล่ครั้งเดียวตอนจบตารางจริง ๆ
     */
    .data-table tfoot { display: table-row-group; }

    .data-table tfoot td {
      padding: 7px 9px;
      border-top: 1px solid var(--rule-strong);
      border-bottom: 0;
      background: #f8fafc;
      font-size: 11.8px;
      font-weight: 800;
    }

    .data-table tfoot tr td { background: #f8fafc; }

    .closing { break-inside: avoid; }
  </style>
</head>
<body>
  <div class="sheet">
    ${renderLetterhead(
      run.company,
      `
        <div class="doc-title">
          <h1>รายงานสรุปการจ่ายเงินเดือน</h1>
          <div class="en">Payroll Run Summary</div>
          <div class="subtitle">
            งวด ${escapeHtml(periodName(run))} (${escapeHtml(periodRange(run))})
          </div>
        </div>
      `,
    )}

    <table class="field-table">
      <tbody>
        <tr>
          ${renderFieldCell('เลขที่รอบคำนวณ', run.runNo)}
          ${renderFieldCell('รหัสงวด', run.period.code)}
          ${renderFieldCell('วันที่จ่าย', dateText(run.period.paymentDate))}
          ${renderFieldCell('สถานะ', statusLabel(run.status))}
        </tr>
        <tr>
          ${renderFieldCell('คำนวณเมื่อ', dateTimeText(run.calculatedAt))}
          ${renderFieldCell('อนุมัติเมื่อ', dateTimeText(run.approvedAt))}
          ${renderFieldCell('จ่ายเงินเมื่อ', dateTimeText(run.paidAt))}
          ${renderFieldCell('ออกรายงานเมื่อ', dateTimeText(new Date()))}
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="total-item">
        <div class="total-label">จำนวนพนักงาน</div>
        <div class="total-value">${run.items.length}<span style="font-size:10px;font-weight:700"> คน</span></div>
      </div>
      <div class="total-item">
        <div class="total-label">รวมรายได้</div>
        <div class="total-value">${moneyText(run.totalEarnings)}</div>
      </div>
      <div class="total-item">
        <div class="total-label">รวมรายการหัก</div>
        <div class="total-value">${moneyText(run.totalDeductions)}</div>
      </div>
      <div class="total-item net">
        <div class="total-label">เงินสุทธิที่ต้องจ่าย</div>
        <div class="total-value">${moneyText(run.totalNetPay)}</div>
      </div>
    </div>

    <div class="section-title">สรุปตามประเภทรายการ</div>
    <div class="sum-grid">
      ${renderSummaryColumn('รายการรายได้', incomeTotals, 'รวมรายได้', run.totalEarnings)}
      ${renderSummaryColumn('รายการหัก', deductionTotals, 'รวมรายการหัก', run.totalDeductions)}
    </div>

    <div class="section-title">รายละเอียดรายพนักงาน</div>
    <table class="data-table">
      <colgroup>
        <col style="width:4%" />
        <col style="width:7%" />
        <col style="width:20%" />
        <col style="width:15%" />
        <col style="width:13%" />
        <col style="width:12%" />
        <col style="width:9.5%" />
        <col style="width:9.5%" />
        <col style="width:10%" />
      </colgroup>
      <thead>
        <tr>
          <th class="center">ลำดับ</th>
          <th>รหัส</th>
          <th>ชื่อพนักงาน</th>
          <th>แผนก / สาขา</th>
          <th>ธนาคาร</th>
          <th>เลขที่บัญชี</th>
          <th class="amount">รวมรายได้</th>
          <th class="amount">รวมรายการหัก</th>
          <th class="amount">เงินสุทธิ</th>
        </tr>
      </thead>
      <tbody>${employeeRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="6">รวมทั้งงวด ${run.items.length} คน</td>
          <td class="amount">${moneyText(run.totalEarnings)}</td>
          <td class="amount">${moneyText(run.totalDeductions)}</td>
          <td class="amount net">${moneyText(run.totalNetPay)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="closing">
      <div class="signatures">
        ${renderSignature('ผู้จัดทำ', actorName(run.calculatedBy) || actorName(run.createdBy))}
        ${renderSignature('ผู้ตรวจสอบ', actorName(run.reviewedBy))}
        ${renderSignature('ผู้อนุมัติ', actorName(run.approvedBy))}
      </div>

      <div class="footer">
        <div class="confidential">เอกสารลับ — ใช้ภายในองค์กรเท่านั้น</div>
        <div>ออกจากระบบเมื่อ ${escapeHtml(dateTimeText(new Date()))}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function getChromeExecutablePath() {
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}

export async function generatePayrollRunPdf(
  run: ExportPayrollRun,
): Promise<PayrollRunExportResult> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildPdfHtml(run), { waitUntil: 'load' });

    /*
     * รายงานนี้ยาวหลายหน้าได้ตามจำนวนพนักงาน จึงต้องมีเลขหน้า ซึ่งทำได้ทาง
     * footerTemplate เท่านั้น และ footerTemplate ใช้ร่วมกับ preferCSSPageSize
     * ไม่ได้ ขนาดกระดาษกับระยะขอบจึงสั่งจากฝั่ง puppeteer แทน @page
     */
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;padding:0 10mm;font-size:8px;color:#6b7280;
                    font-family:'TH Sarabun New','Sarabun','Garuda',Tahoma,sans-serif;
                    display:flex;justify-content:space-between;">
          <span>${escapeHtml(companyName(run))} · ${escapeHtml(run.runNo)}</span>
          <span>หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '14mm',
        left: '10mm',
      },
    });

    return {
      buffer: Buffer.from(pdf),
      fileName: makeFileName(run, 'pdf'),
      mimeType: 'application/pdf',
    };
  } finally {
    await browser.close();
  }
}
