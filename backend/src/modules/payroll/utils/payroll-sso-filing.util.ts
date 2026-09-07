import { BadRequestException } from '@nestjs/common';
import {
  buildFixedWidthLine,
  formatDateDMY6,
  formatMonthYear4,
  joinFixedWidthLines,
  padAmountSatang,
  padNumber,
  padText,
} from './payroll-fixed-width.util';

/**
 * ไฟล์นำส่งเงินสมทบประกันสังคม (สปส.1-10) สำหรับอัปโหลดเข้าระบบ e-Service
 * -----------------------------------------------------------------------------
 * รูปแบบ "format 135" — บรรทัดละ 135 ตัวอักษร มี 2 ชนิดระเบียน
 *   1 = ระเบียนหัวไฟล์  ข้อมูลนายจ้างและยอดรวมของงวด   1 บรรทัด
 *   2 = ระเบียนรายคน    ผู้ประกันตน 1 คนต่อ 1 บรรทัด
 * ไม่มีระเบียนท้ายไฟล์ ยอดรวมอยู่ในระเบียนหัวไฟล์แล้ว
 *
 * ที่มาของผัง — ยังไม่ใช่เอกสารทางการของสำนักงานประกันสังคม แต่มีสองแหล่งอิสระ
 * ที่ตรงกัน คือคำอธิบายผังของ Panyame และโปรแกรมเงินเดือน Nimitr ที่ตั้งชื่อไฟล์
 * ส่งออกว่า "สปส.1-10 การส่งเงินสมทบ (format 135)_YYMMDD_HHMM.txt" พร้อมระบุว่า
 * วันที่เป็น 6 หลัก (ววดดปป) ส่วนคู่มือ e-Services ของ สปส. ยืนยันเฉพาะว่า
 * ไฟล์ที่รับคือ .txt และ .dat โดยไม่ได้ให้ผังไว้
 *
 * ยังเหลือจุดที่เดาไว้และต้องยืนยันกับ สปส. ก่อนใช้จริง ดู SSO_UNVERIFIED_ASSUMPTIONS
 * ถ้าได้สเปกจริงมาแล้วให้แก้ที่ SSO_RECORD_LAYOUT กับ SSO_TITLE_CODES จุดเดียว
 *
 * ตัวเลขในไฟล์อ้างอิงกติกาเดียวกับแบบพิมพ์ สปส.1-10 (ฉบับที่ ๒) พ.ศ. ๒๕๖๘
 *   - ค่าจ้างคือค่าจ้าง "ที่จ่ายจริง" ไม่ใช่ฐานหลังชนเพดาน (คำชี้แจงข้อ 1)
 *   - เงินสมทบปัดเป็นบาทเต็มรายคน นายจ้างเท่ากับลูกจ้างหลังปัด (ข้อ 4)
 *   - ผู้ประกันตนที่ไม่มีค่าจ้างต้องอยู่ในไฟล์ด้วย โดยค่าจ้างและเงินสมทบเป็น 0 (ข้อ 6)
 * ฝั่งเรียกใช้ต้องส่งตัวเลขที่ผ่านกติกาพวกนี้มาแล้ว ไฟล์นี้ไม่คำนวณซ้ำ
 */

export type SsoFilingRow = {
  sequence: number;
  /** คำนำหน้านามตามที่เก็บในทะเบียนพนักงาน เช่น "นาย" */
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** ใช้เมื่อไม่มีชื่อ-สกุลแยกช่อง */
  employeeName: string;
  nationalId?: string | null;
  socialSecurityNo?: string | null;
  /** ค่าจ้างที่จ่ายจริงของงวด (ช่อง 4 ของแบบ) */
  actualWage: number;
  /** ฐานคำนวณหลังชนเพดาน เก็บไว้อ้างอิง ไม่ได้ลงไฟล์ */
  contributionBase: number;
  /** เงินสมทบที่นำส่งจริง ปัดเป็นบาทเต็มแล้ว */
  employeeContributionFiled: number;
  employerContributionFiled: number;
};

export type SsoFilingContext = {
  companyName: string;
  /** เลขที่บัญชีนายจ้าง 10 หลัก */
  accountNo?: string | null;
  /** ลำดับที่สาขา 6 หลัก สำนักงานใหญ่ปกติเป็น 000000 */
  branchNo?: string | null;
  /** เดือนค่าจ้างที่นำส่ง */
  wageMonthDate?: string | Date | null;
  /** วันที่ทำรายการ/ชำระเงิน ถ้าไม่ส่งมาจะใช้วันที่ออกไฟล์ */
  paymentDate?: string | Date | null;
  /** อัตราเงินสมทบฝั่งผู้ประกันตน (ร้อยละ) เช่น 5 */
  employeeRatePercent?: number | null;
  runNo: string;
};

export type SsoFilingSkippedRow = {
  employeeName: string;
  missing: string[];
};

export type SsoFilingFile = {
  content: string;
  fileName: string;
  requiresSpecReview: boolean;
  note: string;
  missingCompanyFields: string[];
  /** จำนวนแถวที่ส่งมาทั้งหมด (ก่อนคัดออก) */
  totalRows: number;
  /** จำนวนแถวที่ยื่นได้จริง */
  filedRows: number;
  /** รายชื่อคนที่ถูกข้าม พร้อมข้อมูลที่ขาด — ต้องเอาไปแสดงบนหน้าจอ */
  skipped: SsoFilingSkippedRow[];
  /** ความกว้างจริงของแต่ละบรรทัด ไว้ให้เทียบกับสเปกตอนได้ของจริง */
  recordWidth: number;
  /** คำนำหน้านามที่ยังไม่มีรหัสรองรับ — ต้องเติมใน SSO_TITLE_CODES */
  unmappedTitles: string[];
  /** ข้อสมมติที่ยังไม่ได้ยืนยันกับ สปส. ต้องแสดงบนหน้าจอ */
  assumptions: string[];
};

/**
 * ผังระเบียน — แหล่งความจริงจุดเดียวของรูปแบบไฟล์
 *
 * ผลรวมของแต่ละระเบียนต้องเท่ากับ lineWidth พอดี มี assertLayout ตรวจตอนโหลดไฟล์
 */
export const SSO_RECORD_LAYOUT = {
  /** ความกว้างของทุกบรรทัดในไฟล์ */
  lineWidth: 135,

  header: {
    recordType: 1,
    accountNo: 10,
    branchNo: 6,
    paymentDate: 6,
    salaryPeriod: 4,
    companyName: 45,
    contributionRate: 4,
    insuredCount: 6,
    totalWage: 15,
    totalContribution: 14,
    totalEmployeeContribution: 12,
    totalEmployerContribution: 12,
  },

  detail: {
    recordType: 1,
    identityNo: 13,
    titleCode: 3,
    firstName: 30,
    lastName: 35,
    wage: 14,
    contribution: 12,
    filler: 27,
  },
} as const;

/**
 * รหัสคำนำหน้านาม 3 หลัก
 *
 * ⚠️ ยังไม่ได้ยืนยันกับ สปส. — ใช้ชุดตัวเลขตามทะเบียนราษฎรที่หน่วยงานไทยใช้กันทั่วไป
 * ถ้าไฟล์ถูกปฏิเสธเพราะช่องนี้ ให้แก้ที่ตารางนี้จุดเดียว
 */
export const SSO_TITLE_CODES: Record<string, string> = {
  นาย: '001',
  นาง: '002',
  นางสาว: '003',
  'น.ส.': '003',
  เด็กชาย: '004',
  เด็กหญิง: '005',
};

/** ข้อสมมติที่ยังไม่ได้ยืนยัน ติดไปกับไฟล์เพื่อให้ผู้ใช้เห็นก่อนอัปโหลดจริง */
export const SSO_UNVERIFIED_ASSUMPTIONS = [
  'รหัสคำนำหน้านาม 3 หลัก ใช้ชุดทะเบียนราษฎร (นาย=001 นาง=002 นางสาว=003)',
  'ปีในช่องวันที่และงวดเดือน ใช้ปี พ.ศ. สองหลักท้าย',
  'จำนวนเงินเก็บเป็นสตางค์เต็มจำนวน ไม่มีจุดทศนิยม',
  'อัตราเงินสมทบเก็บเป็นตัวเลข 4 หลัก ทศนิยม 2 ตำแหน่งโดยปริยาย (5% = 0500)',
  'ตัดบรรทัดด้วย CRLF และเข้ารหัสเป็น UTF-8',
];

type LayoutKey = keyof Omit<typeof SSO_RECORD_LAYOUT, 'lineWidth'>;

function layoutWidth(record: LayoutKey) {
  return Object.values(SSO_RECORD_LAYOUT[record]).reduce(
    (sum, width) => sum + width,
    0,
  );
}

/*
 * ตรวจผังตั้งแต่ตอนโหลดไฟล์ ไม่ใช่ตอนสร้างไฟล์ — ถ้าใครมาแก้ความกว้างช่องแล้ว
 * ผลรวมไม่ลงตัว จะรู้ทันทีที่แอปบูต ไม่ใช่ตอนผู้ใช้กดดาวน์โหลดวันนำส่ง
 */
(['header', 'detail'] as LayoutKey[]).forEach((record) => {
  const width = layoutWidth(record);

  if (width !== SSO_RECORD_LAYOUT.lineWidth) {
    throw new Error(
      `ผังระเบียน "${record}" ของไฟล์ สปส.1-10 กว้าง ${width} ตัวอักษร แต่ต้องเป็น ${SSO_RECORD_LAYOUT.lineWidth}`,
    );
  }
});

function sumOf(rows: SsoFilingRow[], pick: (row: SsoFilingRow) => number) {
  return rows.reduce((total, row) => total + pick(row), 0);
}

/** อัตราร้อยละเป็นตัวเลข 4 หลัก ทศนิยม 2 ตำแหน่งโดยปริยาย เช่น 5 → "0500" */
function padRate(percent: number | null | undefined, width: number) {
  const rate = Number(percent);
  const value = Number.isFinite(rate) && rate > 0 ? rate : 0;

  return String(Math.round(value * 100)).padStart(width, '0');
}

/**
 * แยกคำนำหน้า/ชื่อ/สกุล — ระเบียนรายคนขอสามช่องแยกกัน ไม่ใช่ชื่อเต็มช่องเดียว
 * ถ้าทะเบียนพนักงานไม่ได้แยกไว้ ค่อยถอยไปตัดจากชื่อเต็มด้วยช่องว่างแรก
 */
function splitName(row: SsoFilingRow) {
  const title = (row.title ?? '').trim();
  const firstName = (row.firstName ?? '').trim();
  const lastName = (row.lastName ?? '').trim();

  if (firstName || lastName) return { title, firstName, lastName };

  const parts = (row.employeeName ?? '').trim().split(/\s+/).filter(Boolean);

  // ชื่อเต็มที่ขึ้นต้นด้วยคำนำหน้าที่รู้จัก ให้ตัดคำนำหน้าออกก่อน
  const leading = parts[0] && SSO_TITLE_CODES[parts[0]] ? parts.shift() : '';

  return {
    title: title || (leading ?? ''),
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

function titleCodeOf(title: string) {
  return SSO_TITLE_CODES[title.trim()] ?? '';
}

function buildHeader(context: SsoFilingContext, rows: SsoFilingRow[]) {
  const w = SSO_RECORD_LAYOUT.header;

  const employeeTotal = sumOf(rows, (row) => row.employeeContributionFiled);
  const employerTotal = sumOf(rows, (row) => row.employerContributionFiled);

  return buildFixedWidthLine([
    { name: 'recordType', value: '1', width: w.recordType },
    {
      name: 'accountNo',
      value: padNumber(context.accountNo ?? '', w.accountNo),
      width: w.accountNo,
    },
    {
      name: 'branchNo',
      value: padNumber(context.branchNo ?? '0', w.branchNo),
      width: w.branchNo,
    },
    {
      name: 'paymentDate',
      value: formatDateDMY6(context.paymentDate),
      width: w.paymentDate,
    },
    {
      name: 'salaryPeriod',
      value: formatMonthYear4(context.wageMonthDate),
      width: w.salaryPeriod,
    },
    {
      name: 'companyName',
      value: padText(context.companyName, w.companyName),
      width: w.companyName,
    },
    {
      name: 'contributionRate',
      value: padRate(context.employeeRatePercent, w.contributionRate),
      width: w.contributionRate,
    },
    {
      name: 'insuredCount',
      value: padNumber(rows.length, w.insuredCount),
      width: w.insuredCount,
    },
    {
      name: 'totalWage',
      value: padAmountSatang(
        sumOf(rows, (row) => row.actualWage),
        w.totalWage,
      ),
      width: w.totalWage,
    },
    {
      name: 'totalContribution',
      value: padAmountSatang(
        employeeTotal + employerTotal,
        w.totalContribution,
      ),
      width: w.totalContribution,
    },
    {
      name: 'totalEmployeeContribution',
      value: padAmountSatang(employeeTotal, w.totalEmployeeContribution),
      width: w.totalEmployeeContribution,
    },
    {
      name: 'totalEmployerContribution',
      value: padAmountSatang(employerTotal, w.totalEmployerContribution),
      width: w.totalEmployerContribution,
    },
  ]);
}

function buildDetail(row: SsoFilingRow) {
  const w = SSO_RECORD_LAYOUT.detail;
  const name = splitName(row);

  /*
   * คำชี้แจงข้อ 3: คนต่างด้าวให้ใช้เลขที่บัตรประกันสังคมในช่องเลขประจำตัวประชาชน
   * จึงเลือกเลขบัตรก่อน แล้วค่อยตกมาที่เลขผู้ประกันตน
   */
  const identityNo = row.nationalId || row.socialSecurityNo || '';

  return buildFixedWidthLine([
    { name: 'recordType', value: '2', width: w.recordType },
    {
      name: 'identityNo',
      value: padNumber(identityNo, w.identityNo),
      width: w.identityNo,
    },
    {
      name: 'titleCode',
      value: padText(titleCodeOf(name.title), w.titleCode),
      width: w.titleCode,
    },
    {
      name: 'firstName',
      value: padText(name.firstName, w.firstName),
      width: w.firstName,
    },
    {
      name: 'lastName',
      value: padText(name.lastName, w.lastName),
      width: w.lastName,
    },
    {
      name: 'wage',
      value: padAmountSatang(row.actualWage, w.wage),
      width: w.wage,
    },
    {
      name: 'contribution',
      value: padAmountSatang(row.employeeContributionFiled, w.contribution),
      width: w.contribution,
    },
    { name: 'filler', value: padText('', w.filler), width: w.filler },
  ]);
}

export function buildSsoFilingFile(
  rows: SsoFilingRow[],
  context: SsoFilingContext,
): SsoFilingFile {
  /*
   * คนที่ไม่มีทั้งเลขบัตรประชาชนและเลขผู้ประกันตน สร้างบรรทัดไปก็ถูกปฏิเสธ
   * ส่วนคนที่ "ไม่มีค่าจ้าง" ต้องอยู่ในไฟล์ตามคำชี้แจงข้อ 6 จึงไม่คัดออก
   */
  const filedRows = rows.filter(
    (row) => Boolean(row.nationalId) || Boolean(row.socialSecurityNo),
  );

  const skipped: SsoFilingSkippedRow[] = rows
    .filter((row) => !row.nationalId && !row.socialSecurityNo)
    .map((row) => ({
      employeeName: row.employeeName,
      missing: ['เลขบัตรประชาชน', 'เลขผู้ประกันตน'],
    }));

  const missingCompanyFields = [
    context.accountNo ? null : 'เลขที่บัญชีนายจ้าง',
  ].filter((value): value is string => Boolean(value));

  /*
   * ปฏิเสธไม่ให้สร้างไฟล์เปล่า
   *
   * ของเดิมถ้าทุกคนขาดเลขบัตรและเลขผู้ประกันตน จะได้ไฟล์ที่มีแต่บรรทัดหัว
   * ไม่มีพนักงานสักคน แล้วผู้ใช้กดดาวน์โหลดไปยื่นจริงได้เลย โดยหน้าจอยังขึ้นว่า
   * มีพนักงานครบและยอดเงินสมทบถูกต้อง
   */
  if (filedRows.length === 0) {
    throw new BadRequestException(
      rows.length === 0
        ? 'ไม่มีผู้ประกันตนในรอบนี้ จึงสร้างไฟล์นำส่งประกันสังคมไม่ได้'
        : `ไม่มีผู้ประกันตนที่ข้อมูลครบพอจะยื่นได้ (ทั้ง ${rows.length} คนขาดทั้งเลขบัตรประชาชนและเลขผู้ประกันตน) กรุณากรอกข้อมูลให้ครบก่อน`,
    );
  }

  if (missingCompanyFields.length > 0) {
    throw new BadRequestException(
      `ข้อมูลนายจ้างไม่ครบ: ${missingCompanyFields.join(', ')} — กรอกที่ โครงสร้างองค์กร › ข้อมูลบริษัท ก่อนสร้างไฟล์นำส่ง`,
    );
  }

  // เลขลำดับในไฟล์ต้องไล่ต่อเนื่องหลังคัดคนที่ข้อมูลไม่ครบออกแล้ว
  const numbered = filedRows.map((row, index) => ({
    ...row,
    sequence: index + 1,
  }));

  /*
   * คำนำหน้านามที่ไม่มีรหัสรองรับจะได้ช่องว่าง ซึ่ง สปส. อาจปฏิเสธทั้งไฟล์
   * จึงต้องรายงานกลับไปให้เห็น ไม่ใช่ปล่อยเงียบ
   */
  const unmappedTitles = Array.from(
    new Set(
      numbered
        .map((row) => splitName(row).title.trim())
        .filter((title) => title && !SSO_TITLE_CODES[title]),
    ),
  );

  const lines = [buildHeader(context, numbered), ...numbered.map(buildDetail)];

  return {
    content: joinFixedWidthLines(lines),
    fileName: `sso-1-10-${context.runNo}.txt`,
    requiresSpecReview: true,
    note: [
      `รวม ${numbered.length} คน · รูปแบบ format 135`,
      skipped.length > 0
        ? `ข้าม ${skipped.length} คนที่ไม่มีเลขบัตรประชาชนและเลขผู้ประกันตน`
        : null,
      unmappedTitles.length > 0
        ? `ไม่มีรหัสคำนำหน้าสำหรับ: ${unmappedTitles.join(', ')}`
        : null,
      'เงินสมทบในไฟล์ปัดเป็นบาทเต็มแล้วตามคำชี้แจงข้อ 4 ท้ายแบบ สปส.1-10',
      'ผังอ้างอิงจากแหล่งที่ไม่ใช่เอกสารทางการ ต้องทดสอบอัปโหลดก่อนใช้จริง',
    ]
      .filter(Boolean)
      .join(' | '),
    missingCompanyFields,
    totalRows: rows.length,
    filedRows: numbered.length,
    skipped,
    recordWidth: SSO_RECORD_LAYOUT.lineWidth,
    unmappedTitles,
    assumptions: SSO_UNVERIFIED_ASSUMPTIONS,
  };
}
