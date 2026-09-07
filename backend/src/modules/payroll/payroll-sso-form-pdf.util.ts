import puppeteer from 'puppeteer';

import { escapeHtml, formatBahtText } from './payroll-document.util';
import { SSO_LOGO_DATA_URI } from './sso-logo.asset';

/**
 * แบบ สปส.1-10 แบบรายการแสดงการส่งเงินสมทบ (PDF)
 * -----------------------------------------------------------------------------
 * รูปแบบอ้างอิงจากไฟล์ตัวอย่างที่ลูกค้าใช้อยู่จริง (docs/ข้อมูลรูปแบบไฟล์รายงาน)
 * ไม่ใช่แบบพิมพ์เปล่าของราชการ — สองอย่างนี้หน้าตาต่างกันหลายจุด
 *
 *   หน้า 1     แบบ สปส.1-10 ส่วนที่ 1 สรุปยอดนำส่งของทั้งงวด
 *   หน้า 2+    รายชื่อผู้ประกันตนพร้อมค่าจ้างและเงินสมทบรายคน
 *
 * ต่างจากแบบพิมพ์เปล่าตรงที่ใช้ตราสำนักงานประกันสังคม ไม่ใช่โลโก้บริษัท
 * ช่องเลขที่บัญชีเป็นข้อความไม่ใช่กล่องทีละหลัก และหน้ารายชื่อเป็นตารางเรียบ
 * ที่แยกชื่อกับนามสกุลคนละคอลัมน์
 *
 * ตัวเลขทุกช่องอิงกติกาท้ายแบบ สปส.1-10 (ฉบับที่ ๒) พ.ศ. ๒๕๖๘
 *   ค่าจ้างคือค่าจ้างที่จ่ายจริง เพดานมีผลเฉพาะตอนคำนวณเงินสมทบ (ข้อ 1)
 *   เงินสมทบปัดเป็นบาทเต็มรายคน นายจ้างเท่ากับลูกจ้างหลังปัด (ข้อ 4)
 *   ผู้ประกันตนที่ไม่มีค่าจ้างต้องมีชื่อในแบบ โดยค่าจ้างและเงินสมทบเป็น 0 (ข้อ 6)
 */

/** จำนวนแถวต่อหน้าของหน้ารายชื่อ */
const ROWS_FIRST_LIST_PAGE = 27;
const ROWS_NEXT_LIST_PAGE = 30;

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export type SsoFormRow = {
  sequence: number;
  employeeCode: string;
  employeeName: string;
  /* แบบพิมพ์และไฟล์อัปโหลดแยกคำนำหน้า ชื่อ และสกุลคนละช่อง ไม่ใช่ชื่อเต็มช่องเดียว */
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  nationalId?: string | null;
  socialSecurityNo?: string | null;
  actualWage: number;
  contributionBase: number;
  employeeContribution: number;
  employeeContributionFiled: number;
  employerContributionFiled: number;
  missingFields: string[];
};

export type SsoFormSummary = {
  employeeCount: number;
  totalActualWage: number;
  totalEmployeeContribution: number;
  totalEmployerContribution: number;
  totalEmployeeContributionFiled: number;
  totalEmployerContributionFiled: number;
  totalContributionFiled: number;
  roundingDifference: number;
  roundedRowCount: number;
  incompleteCount: number;
  zeroWageCount: number;
  missingCompanyFields: string[];
};

export type SsoFormCompany = {
  nameTh?: string | null;
  nameEn?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  socialSecurityAccountNo?: string | null;
  socialSecurityBranchNo?: string | null;
};

export type SsoFormInput = {
  company: SsoFormCompany;
  run: {
    runNo: string;
    periodName?: string | null;
    periodStartDate?: string | null;
    periodEndDate?: string | null;
    paymentDate?: string | null;
  };
  /** อัตราเงินสมทบฝั่งผู้ประกันตน (ร้อยละ) ที่ใช้ในงวดนี้ */
  employeeRatePercent?: number | null;
  rows: SsoFormRow[];
  summary: SsoFormSummary;
};

export type SsoFormFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

/* ===============================================================
   ตัวช่วยจัดรูปแบบ
   =============================================================== */

function digitsOnly(value?: string | null) {
  return (value ?? '').replace(/\D/g, '');
}

/** จำนวนเต็มบาท ใส่ตัวคั่นหลักพัน */
function bahtPart(amount: number) {
  return Math.floor(Math.abs(amount)).toLocaleString('en-US');
}

/** เศษสตางค์สองหลัก — แบบพิมพ์แยกช่องบาทกับสตางค์ออกจากกัน */
function satangPart(amount: number) {
  const satang = Math.round((Math.abs(amount) - Math.floor(Math.abs(amount))) * 100);
  return String(satang).padStart(2, '0');
}

function money2(amount: number) {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * เดือนค่าจ้างของงวด
 *
 * ยึดวันสิ้นงวดเป็นหลัก ไม่ใช่วันจ่าย เพราะงวดที่คร่อมเดือน (26 มิ.ย. – 25 ก.ค.)
 * ถือเป็นค่าจ้างของเดือนที่งวดสิ้นสุด ส่วนวันจ่ายอาจข้ามไปเดือนถัดไปแล้ว
 */
function wageMonth(run: SsoFormInput['run']) {
  const source = run.periodEndDate || run.paymentDate;
  const date = source ? new Date(source) : new Date();

  const bangkok = new Date(
    date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }),
  );

  return {
    monthName: THAI_MONTHS[bangkok.getMonth()],
    buddhistYear: bangkok.getFullYear() + 543,
    gregorianYear: bangkok.getFullYear(),
  };
}

/** แยกคำนำหน้า ชื่อ สกุล — หน้ารายชื่อวางชื่อกับนามสกุลคนละคอลัมน์ */
function splitName(row: SsoFormRow) {
  const title = (row.title ?? '').trim();
  const firstName = (row.firstName ?? '').trim();
  const lastName = (row.lastName ?? '').trim();

  if (firstName || lastName) return { title, firstName, lastName };

  const parts = (row.employeeName ?? '').trim().split(/\s+/).filter(Boolean);

  return {
    title,
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

/** เลขที่ใช้ระบุตัว — คนต่างด้าวใช้เลขที่บัตรประกันสังคมในช่องเดียวกัน (คำชี้แจงข้อ 3) */
function identityNo(row: SsoFormRow) {
  return digitsOnly(row.nationalId || row.socialSecurityNo);
}

/* ===============================================================
   หน้า 1 — แบบ สปส.1-10 ส่วนที่ 1
   =============================================================== */

function renderPartOne(input: SsoFormInput) {
  const { company, summary } = input;
  const month = wageMonth(input.run);

  const rate = Number(input.employeeRatePercent);
  const rateText = Number.isFinite(rate) && rate > 0 ? rate.toFixed(2) : '';

  const amountRow = (no: string, label: string, amount: number) => `
    <tr>
      <td class="item">${no}${escapeHtml(label)}</td>
      <td class="baht">${bahtPart(amount)}</td>
      <td class="satang">${satangPart(amount)}</td>
    </tr>`;

  return `
  <section class="sheet part-one">
    <div class="head">
      <img class="sso-logo" src="${SSO_LOGO_DATA_URI}" alt="สำนักงานประกันสังคม" />
      <h1>แบบรายการแสดงการส่งเงินสมทบ</h1>
      <div class="form-no">สปส. 1-10 ส่วนที่ 1</div>
    </div>

    <div class="identity">
      <div class="identity-left">
        <div>ชื่อสถานประกอบการ&nbsp;&nbsp;${escapeHtml(company.nameTh || '')}</div>
        <div>ที่ตั้งสำนักงานใหญ่&nbsp;&nbsp;${escapeHtml(company.address || '')}</div>
        <div>
          รหัสไปรษณีย์&nbsp;&nbsp;${escapeHtml(postcodeOf(company.address))}
          &nbsp;&nbsp;โทรศัพท์ : ${escapeHtml(company.phone || '')}
          &nbsp;&nbsp;โทรสาร :
        </div>
      </div>
      <div class="identity-right">
        <div>เลขที่บัญชี&nbsp;&nbsp;${escapeHtml(digitsOnly(company.socialSecurityAccountNo))}</div>
        <div>สาขา&nbsp;&nbsp;${escapeHtml(digitsOnly(company.socialSecurityBranchNo) || '00000')}</div>
        <div>อัตราเงินสมทบร้อยละ&nbsp;&nbsp;${escapeHtml(rateText)}</div>
      </div>
    </div>

    <div class="body">
      <div class="body-left">
        <table class="amount-table">
          <thead>
            <tr>
              <th rowspan="2" class="item">
                การนำส่งเงินสมทบสำหรับค่าจ้างเดือน ${escapeHtml(month.monthName)} พ.ศ. ${month.buddhistYear}
              </th>
            </tr>
          </thead>
        </table>

        <table class="amount-table">
          <tr class="head-row">
            <th class="item">รายการ</th>
            <th class="money" colspan="2">จำนวนเงิน</th>
          </tr>
          <tr class="head-row">
            <th class="item"></th>
            <th class="baht">THB</th>
            <th class="satang"></th>
          </tr>
          ${amountRow('1.', 'เงินค่าจ้างทั้งสิ้น', summary.totalActualWage)}
          ${amountRow('2.', 'เงินสมทบผู้ประกันตน', summary.totalEmployeeContributionFiled)}
          ${amountRow('3.', 'เงินสมทบนายจ้าง', summary.totalEmployerContributionFiled)}
          ${amountRow('4.', 'รวมเงินสมทบที่นำส่งทั้งสิ้น', summary.totalContributionFiled)}
          <tr>
            <td class="baht-text" colspan="3">
              (${escapeHtml(formatBahtText(summary.totalContributionFiled))})
            </td>
          </tr>
          <tr>
            <td class="item">5.จำนวนผู้ประกันตนที่ส่งเงินสมทบ</td>
            <td class="baht">${summary.employeeCount}</td>
            <td class="satang">คน</td>
          </tr>
        </table>

        <p class="certify">ข้าพเจ้าขอรับรองว่ารายงานที่แจ้งไว้เป็นรายการที่ถูกต้องครบถ้วนและเป็นจริงทุกประการ</p>
        <p class="attach">พร้อมนี้ได้แนบ</p>

        <div class="checks">
          <div class="check">
            <span class="box"></span>รายละเอียดการนำส่งเงินสมทบ
            <span class="amount-blank">จำนวน......................แผ่น</span> หรือ
          </div>
          <div class="check">
            <span class="box"></span>สื่อข้อมูลอิเล็กทรอนิกส์
            <span class="amount-blank">จำนวน......................แผ่น</span>
          </div>
          <div class="check"><span class="box"></span>อินเตอร์เน็ต</div>
          <div class="check"><span class="box"></span>อื่นๆ................................</div>
        </div>

        <div class="sign">
          <div class="stamp">
            <div>ประทับตรา</div>
            <div>นิติบุคคล</div>
            <div>(ถ้ามี)</div>
          </div>
          <div class="sign-lines">
            <div>ลงชื่อ................................................................นายจ้าง</div>
            <div class="paren">(................................................................)</div>
            <div class="role">ตำแหน่ง ผู้จัดการ</div>
            <div>ยื่นแบบวันที่..........เดือน......................พ.ศ...............</div>
          </div>
        </div>
      </div>

      <div class="body-right">
        <div class="official-box">
          <div class="official-title">สำหรับเจ้าหน้าที่สำนักงานประกันสังคม</div>
          <div class="official-body">
            <div>ชำระเงินวันที่............................................................................</div>
            <div>เงินเพิ่ม (ถ้ามี)................................บาท ................สตางค์</div>
            <div>ใบเสร็จรับเงินเลขที่.................................................................</div>
            <div class="gap"></div>
            <div>ลงชื่อ ......................................................................................</div>
            <div class="paren">(......................................................................)</div>
            <div>ตำแหน่ง ..................................................................................</div>
          </div>
        </div>

        <div class="official-box">
          <div class="official-title">สำหรับเจ้าหน้าที่ธนาคาร/หน่วยบริการ</div>
          <div class="official-body">
            <div>ชำระเงินวันที่............................................................................</div>
            <div>ใบเสร็จรับเงินเลขที่.................................................................</div>
            <div>ประทับตราธนาคาร/</div>
            <div>หน่วยบริการ</div>
            <div class="gap"></div>
            <div>ลงชื่อ ......................................................................................</div>
            <div class="paren">(......................................................................)</div>
            <div>ตำแหน่ง ..................................................................................</div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/** รหัสไปรษณีย์จากท้ายที่อยู่ — แบบพิมพ์แยกช่องไว้ แต่ระบบเก็บรวมอยู่ในที่อยู่ */
function postcodeOf(address?: string | null) {
  const match = /(\d{5})\s*$/.exec((address ?? '').trim());
  return match ? match[1] : '';
}

/* ===============================================================
   หน้า 2 เป็นต้นไป — รายชื่อผู้ประกันตน
   =============================================================== */

function paginateRows(rows: SsoFormRow[]) {
  if (rows.length === 0) return [[]];

  const pages: SsoFormRow[][] = [];
  let cursor = 0;

  while (cursor < rows.length) {
    const size = pages.length === 0 ? ROWS_FIRST_LIST_PAGE : ROWS_NEXT_LIST_PAGE;
    pages.push(rows.slice(cursor, cursor + size));
    cursor += size;
  }

  return pages;
}

function renderListPage(
  input: SsoFormInput,
  pageRows: SsoFormRow[],
  showHeading: boolean,
) {
  const month = wageMonth(input.run);

  const body = pageRows
    .map((row) => {
      const name = splitName(row);
      const incomplete = row.missingFields.length > 0;

      return `
        <tr class="${incomplete ? 'incomplete' : ''}">
          <td class="seq">${row.sequence}</td>
          <td class="nid">${escapeHtml(identityNo(row))}</td>
          <td class="name">${escapeHtml(`${name.title}${name.firstName}`)}</td>
          <td class="surname">${escapeHtml(name.lastName)}</td>
          <td class="amount">${money2(row.actualWage)}</td>
          <td class="amount">${money2(row.employeeContributionFiled)}</td>
        </tr>`;
    })
    .join('');

  return `
  <section class="sheet list-page">
    ${
      showHeading
        ? `<h2 class="list-heading">${escapeHtml(
            input.company.nameTh || '',
          )} ประจำเดือน${escapeHtml(month.monthName)} ${month.gregorianYear}</h2>`
        : ''
    }

    <table class="list-table">
      <colgroup>
        <col style="width:8%" />
        <col style="width:22%" />
        <col style="width:23%" />
        <col style="width:21%" />
        <col style="width:13%" />
        <col style="width:13%" />
      </colgroup>
      <thead>
        <tr>
          <th class="seq">ลำดับ</th>
          <th class="nid">เลขที่บัตรประชาชน</th>
          <th class="name">ชื่อ</th>
          <th class="surname">นามสกุล</th>
          <th class="amount">ค่าแรง</th>
          <th class="amount">ยอดจ่าย</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

/* ===============================================================
   ประกอบเอกสาร
   =============================================================== */

export function buildSsoFormHtml(input: SsoFormInput) {
  const listPages = paginateRows(input.rows);

  const listHtml = listPages
    .map((pageRows, index) => renderListPage(input, pageRows, index === 0))
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>แบบ สปส.1-10 ${escapeHtml(input.run.runNo)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }

    * { box-sizing: border-box; }

    html, body { margin: 0; padding: 0; background: #ffffff; }

    body {
      color: #000000;
      /* แบบพิมพ์ราชการไทยใช้ TH Sarabun New ถ้าเครื่องไม่มีจะไล่ลงมาที่ตัวใกล้เคียง */
      font-family: "TH Sarabun New", "Sarabun", "Garuda", "Leelawadee UI",
        "Noto Sans Thai", Tahoma, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .sheet {
      padding: 12mm 10mm;
      break-after: page;
    }

    .sheet:last-child { break-after: auto; }

    /* ---------- หน้า 1 หัวแบบพิมพ์ ---------- */

    .head {
      position: relative;
      min-height: 62px;
      margin-bottom: 10px;
    }

    .sso-logo {
      position: absolute;
      left: 46px;
      top: 0;
      width: 56px;
    }

    .head h1 {
      margin: 8px 0 0;
      text-align: center;
      font-size: 19px;
      font-weight: 700;
    }

    .form-no {
      position: absolute;
      right: 0;
      top: 6px;
      font-size: 13px;
    }

    /* ---------- ข้อมูลสถานประกอบการ ---------- */

    .identity {
      display: flex;
      gap: 18px;
      margin-bottom: 8px;
    }

    .identity-left { flex: 1 1 62%; min-width: 0; }
    .identity-right { flex: 0 0 34%; }
    .identity div { margin-bottom: 2px; }

    /* ---------- เนื้อหาสองคอลัมน์ ---------- */

    .body { display: flex; gap: 14px; align-items: flex-start; }
    .body-left { flex: 1 1 58%; min-width: 0; }
    .body-right { flex: 0 0 40%; }

    /* ---------- ตารางจำนวนเงิน ---------- */

    .amount-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
    }

    .amount-table th,
    .amount-table td {
      border: 1px solid #000000;
      padding: 3px 6px;
      font-weight: 400;
    }

    .amount-table thead th {
      text-align: center;
      font-weight: 700;
      padding: 4px 6px;
    }

    .amount-table .head-row th {
      text-align: center;
      font-weight: 700;
    }

    .amount-table .item { text-align: left; }

    .amount-table .baht {
      width: 92px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .amount-table .satang {
      width: 34px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .amount-table .baht-text {
      text-align: center;
      border-top: 1px solid #000000;
    }

    .certify { margin: 8px 0 0; }
    .attach { margin: 2px 0 4px; }

    /* ---------- ช่องติ๊ก ---------- */

    .checks { margin-bottom: 16px; }

    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .box {
      display: inline-block;
      width: 11px;
      height: 11px;
      border: 1px solid #000000;
      flex: 0 0 auto;
    }

    .amount-blank { margin-left: auto; }

    /* ---------- ลงนาม ---------- */

    .sign {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-top: 18px;
    }

    .stamp {
      flex: 0 0 auto;
      width: 84px;
      height: 84px;
      border: 1px solid #000000;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 11.5px;
      line-height: 1.3;
    }

    .sign-lines { flex: 1 1 auto; padding-top: 14px; }
    .sign-lines div { margin-bottom: 3px; }
    .sign-lines .paren { padding-left: 46px; }
    .sign-lines .role { text-align: center; padding-right: 40px; }

    /* ---------- กล่องเจ้าหน้าที่ ---------- */

    .official-box {
      border: 1px solid #000000;
      margin-bottom: 12px;
    }

    .official-title {
      padding: 4px 6px;
      text-align: center;
      font-weight: 700;
      font-size: 15px;
    }

    .official-body { padding: 0 8px 10px; }
    .official-body div { margin-bottom: 4px; }
    .official-body .paren { padding-left: 26px; }
    .official-body .gap { height: 14px; margin: 0; }

    /* ---------- หน้ารายชื่อ ---------- */

    .list-heading {
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 700;
    }

    .list-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .list-table thead { display: table-header-group; }

    .list-table th {
      padding: 5px 6px;
      background: #d9d9d9;
      font-weight: 700;
      text-align: center;
      white-space: nowrap;
    }

    .list-table td {
      padding: 3px 6px;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .list-table .seq { text-align: center; }

    .list-table .nid {
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .list-table .name,
    .list-table .surname { text-align: left; }

    .list-table td.amount,
    .list-table th.amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    /*
     * แถวที่ข้อมูลไม่ครบต้องสะดุดตาคนตรวจ ไม่ใช่กลืนไปกับแถวปกติ
     * เอกสารนี้ใช้ยื่นราชการ ถ้าเลขบัตรหายไปหนึ่งแถวจะถูกตีกลับทั้งชุด
     */
    .list-table tr.incomplete td { background: #ffe9e9; }
  </style>
</head>
<body>
  ${renderPartOne(input)}
  ${listHtml}
</body>
</html>`;
}

function getChromeExecutablePath() {
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}

export async function generateSsoFormPdf(
  input: SsoFormInput,
): Promise<SsoFormFile> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildSsoFormHtml(input), { waitUntil: 'load' });

    /*
     * ระยะขอบสั่งจาก CSS (@page margin: 0 แล้วให้ .sheet คุม padding เอง)
     * เพราะแบบพิมพ์ราชการต้องคุมตำแหน่งบล็อกเองทั้งหน้า ไม่ใช่ให้เบราว์เซอร์จัดให้
     */
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    return {
      buffer: Buffer.from(pdf),
      fileName: `sso-1-10-${input.run.runNo}.pdf`,
      mimeType: 'application/pdf',
    };
  } finally {
    await browser.close();
  }
}
