import { existsSync, readFileSync } from 'fs';
import { basename, extname, isAbsolute, join } from 'path';

/**
 * ของกลางของเอกสาร PDF ฝั่ง Payroll
 * ---------------------------------
 * สลิปเงินเดือนกับรายงานสรุปรอบต้องหน้าตาเป็นชุดเดียวกัน — ฟอนต์ สี หัวจดหมาย
 * และท้ายเอกสารจึงอยู่ที่ไฟล์นี้ที่เดียว ถ้าจะเปลี่ยนธีมเอกสารให้แก้ที่นี่
 * ไม่ใช่ไปแก้ทีละไฟล์แล้วค่อย ๆ เพี้ยนออกจากกัน
 */

export type DocumentCompany = {
  code?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
  logoUrl?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

const uploadRoot = process.env.UPLOAD_DIR ?? 'uploads';
const logoUploadRoot = isAbsolute(uploadRoot)
  ? uploadRoot
  : join(process.cwd(), uploadRoot);

/**
 * โลโก้ที่พิมพ์บนเอกสารมาได้สองระดับ — ของบริษัท กับของสาขา
 * เก็บคนละโฟลเดอร์ จึงต้องแปลง URL กลับเป็นพาธจริงได้ทั้งสองแบบ
 */
const LOGO_PUBLIC_PREFIXES: Record<string, string> = {
  '/uploads/company-logos': 'company-logos',
  '/uploads/branch-logos': 'branch-logos',
};

export function escapeHtml(value: unknown) {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? value.toString()
        : '';

  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function toAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatMoney(value: unknown) {
  return toAmount(value).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return '-';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return '-';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('th-TH');
}

/* ---------------------------------------------------------------
   จำนวนเงินเป็นตัวอักษรไทย
   --------------------------------------------------------------- */

const THAI_DIGIT_WORDS = [
  'ศูนย์',
  'หนึ่ง',
  'สอง',
  'สาม',
  'สี่',
  'ห้า',
  'หก',
  'เจ็ด',
  'แปด',
  'เก้า',
];

const THAI_POSITION_WORDS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

export function thaiNumberToWords(value: number): string {
  const target = Math.floor(Math.abs(value));

  if (target === 0) return 'ศูนย์';

  if (target >= 1_000_000) {
    const millions = Math.floor(target / 1_000_000);
    const remainder = target % 1_000_000;

    return `${thaiNumberToWords(millions)}ล้าน${
      remainder > 0 ? thaiNumberToWords(remainder) : ''
    }`;
  }

  const digits = String(target).split('').map(Number);

  return digits.reduce((text, digit, index) => {
    const position = digits.length - index - 1;

    if (digit === 0) return text;
    if (position === 1 && digit === 1) return `${text}สิบ`;
    if (position === 1 && digit === 2) return `${text}ยี่สิบ`;
    if (position === 0 && digit === 1 && digits.length > 1) {
      return `${text}เอ็ด`;
    }

    return `${text}${THAI_DIGIT_WORDS[digit]}${THAI_POSITION_WORDS[position]}`;
  }, '');
}

/** จำนวนเงินเป็นตัวอักษรไทย เช่น 25,330.00 → "สองหมื่นห้าพันสามร้อยสามสิบบาทถ้วน" */
export function formatBahtText(value: unknown) {
  const amount = toAmount(value);
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);

  const prefix = amount < 0 ? 'ลบ' : '';
  const bahtText = `${prefix}${thaiNumberToWords(baht)}บาท`;

  if (satang === 0) {
    return `${bahtText}ถ้วน`;
  }

  return `${bahtText}${thaiNumberToWords(satang)}สตางค์`;
}

/* ---------------------------------------------------------------
   โลโก้บริษัท
   --------------------------------------------------------------- */

function mimeTypeFromFileName(fileName: string) {
  const ext = extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/png';
}

function getLocalCompanyLogoPath(logoUrl?: string | null) {
  if (!logoUrl) return null;

  const prefix = Object.keys(LOGO_PUBLIC_PREFIXES).find((candidate) =>
    logoUrl.startsWith(`${candidate}/`),
  );

  if (!prefix) return null;

  const fileName = basename(logoUrl);

  return fileName
    ? join(logoUploadRoot, LOGO_PUBLIC_PREFIXES[prefix], fileName)
    : null;
}

/**
 * puppeteer โหลดรูปจาก URL ภายนอกไม่ได้ (ไม่มี session/เน็ต) จึงต้องอ่านไฟล์
 * จากดิสก์แล้วฝังเป็น data URI ถ้าไม่เจอไฟล์ค่อยปล่อยให้เป็น URL ตรง ๆ
 */
export function getCompanyLogoSource(logoUrl?: string | null) {
  if (!logoUrl) return null;

  const localPath = getLocalCompanyLogoPath(logoUrl);

  if (localPath && existsSync(localPath)) {
    const data = readFileSync(localPath).toString('base64');
    return `data:${mimeTypeFromFileName(localPath)};base64,${data}`;
  }

  if (/^(https?:|data:|file:)/i.test(logoUrl)) return logoUrl;

  return null;
}

export function getCompanyInitials(company: DocumentCompany) {
  const code = company.code?.trim();
  if (code) return code.slice(0, 4).toUpperCase();

  const name = company.nameEn || company.nameTh || '';

  return (
    name
      .split(/\s+/)
      .map((part) => part.trim()[0])
      .filter(Boolean)
      .slice(0, 3)
      .join('')
      .toUpperCase() || 'HR'
  );
}

export function renderCompanyLogo(company: DocumentCompany) {
  const logoSource = getCompanyLogoSource(company.logoUrl);

  if (logoSource) {
    return `
      <div class="logo">
        <img src="${escapeHtml(logoSource)}" alt="Company Logo" />
      </div>
    `;
  }

  return `
    <div class="logo logo-fallback">${escapeHtml(getCompanyInitials(company))}</div>
  `;
}

export function companyContactLine(company: DocumentCompany) {
  return [
    company.phone ? `โทร. ${company.phone}` : null,
    company.email,
    company.taxId ? `เลขประจำตัวผู้เสียภาษี ${company.taxId}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
}

/**
 * หัวจดหมาย: โลโก้ + ชื่อบริษัท + ที่อยู่ + ช่องทางติดต่อ
 *
 * `extra` คือบล็อกที่จะไปเกาะขอบขวาของหัวจดหมาย (ปกติคือชื่อเอกสาร) — เอกสาร
 * แนวนอนกว้าง 1,047px ถ้าปล่อยว่างจะเหลือที่โล่งครึ่งหน้า หัวเอกสารเลยดูเล็กลอย
 */
export function renderLetterhead(company: DocumentCompany, extra = '') {
  const name = company.nameTh || company.nameEn || company.code || '-';
  const contact = companyContactLine(company);

  return `
    <div class="letterhead">
      ${renderCompanyLogo(company)}
      <div class="letterhead-body">
        <div class="company-name">${escapeHtml(name)}</div>
        ${company.nameEn ? `<div class="company-name-en">${escapeHtml(company.nameEn)}</div>` : ''}
        ${company.address ? `<div class="company-line">${escapeHtml(company.address)}</div>` : ''}
        ${contact ? `<div class="company-line">${escapeHtml(contact)}</div>` : ''}
      </div>
      ${extra}
    </div>
  `;
}

/* ---------------------------------------------------------------
   ธีม CSS ที่เอกสารทุกใบใช้ร่วมกัน
   --------------------------------------------------------------- */

export const DOCUMENT_BASE_CSS = `
  * { box-sizing: border-box; }

  :root {
    --ink: #111827;
    --ink-soft: #4b5563;
    --ink-faint: #6b7280;
    --rule-strong: #64748b;
    --rule: #cbd5e1;
    --rule-soft: #e2e8f0;
    --accent: #1e3a8a;
    --accent-bg: #eff6ff;
  }

  html, body { height: 100%; }

  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: var(--ink);
    /* TH Sarabun New คือฟอนต์เอกสารราชการไทย ถ้าเครื่องที่เรนเดอร์ไม่มี
       จะไล่ลงมาที่ Sarabun / Garuda (มากับ fonts-thai-tlwg ในอิมเมจ) */
    font-family: "TH Sarabun New", "Sarabun", "Garuda", "Leelawadee UI",
      "Noto Sans Thai", Tahoma, Arial, sans-serif;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    border: 1px solid var(--rule-strong);
  }

  /* ---------- หัวจดหมาย ---------- */

  .letterhead {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--rule-strong);
  }

  .logo {
    width: 64px;
    height: 64px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--rule-soft);
  }

  .logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 3px;
  }

  .logo-fallback {
    background: #f8fafc;
    color: var(--ink-soft);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .letterhead-body { flex: 1 1 auto; min-width: 0; }

  .company-name { font-size: 19px; font-weight: 800; line-height: 1.2; }
  .company-name-en {
    margin-top: 2px;
    color: var(--ink-soft);
    font-size: 11.5px;
    font-weight: 600;
  }
  .company-line {
    margin-top: 3px;
    color: var(--ink-faint);
    font-size: 10.6px;
    line-height: 1.35;
  }

  /* ---------- ชื่อเอกสาร ---------- */

  /*
   * ชื่อเอกสารเกาะขอบขวาของหัวจดหมาย ไม่ใช่แถบกลางหน้าแยกต่างหาก — บนกระดาษ
   * แนวนอนแถบกลางหน้าทำให้หัวเอกสารสูงขึ้นสองแถบโดยที่ทั้งสองแถบยังโล่งอยู่ดี
   */
  .doc-title {
    flex: 0 0 auto;
    max-width: 46%;
    padding-left: 18px;
    text-align: right;
    border-left: 1px solid var(--rule-soft);
  }

  .doc-title h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.01em;
    line-height: 1.2;
  }

  .doc-title .en {
    margin-top: 2px;
    color: var(--ink-soft);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .doc-title .subtitle {
    margin-top: 4px;
    font-size: 12.5px;
    font-weight: 700;
  }

  /* ---------- ตารางข้อมูลหัวเอกสาร ---------- */

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }

  /*
   * table-layout: fixed — ปล่อย auto แล้วเบราว์เซอร์กะความกว้างคอลัมน์ตาม
   * ความยาวข้อความในนั้น เส้นคั่นแต่ละแถวเลยไม่ตรงกันและไม่ตรงกับแถบยอดรวม
   * ข้างล่าง ดูเป็นตารางเบี้ยว ๆ ทั้งที่ข้อมูลถูก
   */
  .field-table { table-layout: fixed; }

  .field-table td.field {
    padding: 6px 12px 7px;
    border-right: 1px solid var(--rule-soft);
    border-bottom: 1px solid var(--rule-soft);
    vertical-align: top;
  }

  .field-table tr:last-child td.field { border-bottom: 0; }
  .field-table td.field:last-child { border-right: 0; }

  .field-label {
    color: var(--ink-faint);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .field-value {
    margin-top: 2px;
    font-size: 13px;
    font-weight: 700;
    word-break: break-word;
  }

  /* ---------- ลงนาม ---------- */

  .signatures {
    display: flex;
    gap: 24px;
    padding: 26px 14px 12px;
    border-top: 1px solid var(--rule);
  }

  .signature { flex: 1; text-align: center; }

  .signature-line {
    margin: 0 auto;
    width: 72%;
    border-bottom: 1px dotted #94a3b8;
  }

  .signature-name {
    margin-top: 6px;
    font-size: 11.5px;
    font-weight: 700;
  }

  .signature-role {
    margin-top: 2px;
    color: var(--ink-faint);
    font-size: 10.4px;
  }

  /* ---------- ท้ายเอกสาร ---------- */

  .footer {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
    padding: 6px 14px 7px;
    border-top: 1px solid var(--rule-soft);
    color: var(--ink-faint);
    font-size: 10px;
  }

  .confidential { font-weight: 700; letter-spacing: 0.04em; }
`;
