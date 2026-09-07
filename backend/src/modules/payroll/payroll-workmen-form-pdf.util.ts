import puppeteer from 'puppeteer';

import { escapeHtml } from './payroll-document.util';
import type { WorkmenCompensationReport } from './services/payroll-workmen-compensation.service';

/**
 * แบบคำนวณค่าจ้างประกอบการรายงานค่าจ้าง กท.20 (PDF)
 * -----------------------------------------------------------------------------
 * รูปแบบอ้างอิงจากไฟล์ตัวอย่างที่ลูกค้าใช้อยู่จริง
 * (docs/ข้อมูลรูปแบบไฟล์รายงาน/รายงานกองทุนเงินทดแทน (กท.20))
 *
 * เอกสารหน้าเดียว A4 แนวตั้ง ประกอบด้วย
 *   หัวเรื่อง + ข้อมูลสถานประกอบการ
 *   ตาราง 12 เดือน ช่อง (ข) ประเภทค่าจ้าง / (1) รวม / (2) ส่วนเกิน / (3) สุทธิ
 *   (ง) ค่าจ้างต่ำสุด
 *   (จ) ยอดตามแบบ ภ.ง.ด.1ก พร้อมช่องลงนามนายจ้าง
 *   กล่อง "สำหรับเจ้าหน้าที่" ที่เว้นว่างให้เจ้าหน้าที่กรอก
 *
 * ตัวเลขในช่อง (ข) ไม่รวมค่าล่วงเวลาและโบนัส ส่วนช่อง (จ) รวม — ตัวคำนวณ
 * แยกให้แล้ว ไฟล์นี้แค่วางลงช่อง ไม่คิดเลขเอง
 */

export type WorkmenFormFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

function money(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** ช่องที่เว้นให้เจ้าหน้าที่หรือผู้กรอกเติมเอง */
const BLANK = '';

function renderMonthRows(report: WorkmenCompensationReport) {
  return report.months
    .map(
      (row) => `
      <tr>
        <td class="month">${escapeHtml(row.monthLabel)}</td>
        <td class="count">${row.employeeCount}</td>
        <td class="amount">${money(row.monthlySalary)}</td>
        <td class="amount">${money(row.dailyWage)}</td>
        <td class="amount">${money(row.otherIncome)}</td>
        <td class="amount">${money(row.totalWage)}</td>
        <td class="amount">${money(row.excessOverCap)}</td>
        <td class="amount">${money(row.netWage)}</td>
      </tr>`,
    )
    .join('');
}

export function buildWorkmenFormHtml(report: WorkmenCompensationReport) {
  const { company, totals, lowest, annualTaxSummary } = report;

  const rateText =
    company.workmenCompensationRate === null
      ? BLANK
      : String(company.workmenCompensationRate);

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>แบบคำนวณค่าจ้าง (กท.20) ประจำปี ${report.buddhistYear}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }

    * { box-sizing: border-box; }

    html, body { margin: 0; padding: 0; background: #ffffff; }

    body {
      color: #000000;
      font-family: "TH Sarabun New", "Sarabun", "Garuda", "Leelawadee UI",
        "Noto Sans Thai", Tahoma, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .sheet { padding: 12mm 10mm; }

    /* ---------- หัวเรื่อง ---------- */

    h1 {
      margin: 0 0 4px;
      text-align: center;
      font-size: 16px;
      font-weight: 700;
      text-decoration: underline;
    }

    h2 {
      margin: 0 0 8px;
      text-align: center;
      font-size: 14px;
      font-weight: 400;
    }

    /* ---------- ข้อมูลสถานประกอบการ ---------- */

    .info { margin-bottom: 6px; }

    .info-line {
      display: flex;
      gap: 10px;
      margin-bottom: 2px;
    }

    .info-line .label { flex: 0 0 auto; }
    .info-line .value { flex: 1 1 auto; }
    .info-line .right { flex: 0 0 34%; }

    /* ตัวอักษรในวงกลม เช่น (ก) (ข) — แบบพิมพ์ใช้วงกลมไม่ใช่วงเล็บ */
    .mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 15px;
      height: 15px;
      border: 1px solid #000000;
      border-radius: 50%;
      font-size: 10px;
      line-height: 1;
    }

    /* ---------- ตารางหลัก ---------- */

    table.main {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    table.main th,
    table.main td {
      border: 1px solid #000000;
      padding: 2px 4px;
      font-weight: 400;
    }

    table.main th {
      text-align: center;
      font-weight: 400;
      font-size: 11.5px;
      line-height: 1.25;
    }

    table.main .month { text-align: center; }
    table.main .count { text-align: right; }

    table.main .amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .wage-note {
      font-size: 10.5px;
      text-align: center;
      padding: 2px 4px;
    }

    tr.total td { font-weight: 400; }
    tr.total .month { text-align: center; }

    /* ---------- ท้ายตาราง ---------- */

    .lowest {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 6px 0;
    }

    .bottom {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .tax-box {
      flex: 1 1 58%;
      border: 1px solid #000000;
      padding: 5px 8px 8px;
    }

    .tax-box .row {
      display: flex;
      gap: 6px;
      margin-bottom: 3px;
    }

    .tax-box .caption { flex: 0 0 auto; }

    .tax-box .num {
      flex: 0 0 auto;
      min-width: 96px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .sign-area {
      flex: 1 1 40%;
      padding-top: 14px;
      text-align: center;
    }

    .sign-area .line {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .stamp {
      width: 86px;
      height: 86px;
      margin: 14px auto 0;
      border: 1px solid #000000;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 10.5px;
      line-height: 1.3;
    }

    /* ---------- กล่องเจ้าหน้าที่ ---------- */

    .officer-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 12px 0 4px;
    }

    .officer-head .title { font-weight: 700; }

    table.officer {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    table.officer th,
    table.officer td {
      border: 1px solid #000000;
      padding: 4px 6px;
      font-weight: 400;
      height: 22px;
    }

    table.officer th {
      text-align: center;
      font-weight: 400;
    }

    .officer-note { margin-top: 4px; font-size: 11.5px; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>โปรดกรอกเอกสารฉบับนี้และส่งคืนสำนักงานพร้อมแบบ กท. 20 ก</h1>
    <h2>แบบคำนวณค่าจ้างเพื่อประกอบการรายงานค่าจ้างตามแบบ กท. 20 ก ประจำปี ${report.buddhistYear}</h2>

    <div class="info">
      <div class="info-line">
        <span class="label">สำนักงานประกันสังคมจังหวัด</span>
        <span class="value"></span>
        <span class="right">โทร.</span>
      </div>
      <div class="info-line">
        <span class="label">ชื่อสถานประกอบการ</span>
        <span class="value">${escapeHtml(company.nameTh || '')}</span>
        <span class="right">เลขที่บัญชี ${escapeHtml(company.socialSecurityAccountNo || '')}</span>
      </div>
      <div class="info-line">
        <span class="label"><span class="mark">ก</span> รหัสกิจการ ${escapeHtml(company.workmenCompensationCode || '')}</span>
        <span class="value">อัตราเงินสมทบ&nbsp;&nbsp;${escapeHtml(rateText)}</span>
        <span class="right">โทร. ${escapeHtml(company.phone || '')}</span>
      </div>
    </div>

    <table class="main">
      <colgroup>
        <col style="width:8%" />
        <col style="width:9%" />
        <col style="width:14%" />
        <col style="width:13%" />
        <col style="width:12%" />
        <col style="width:14%" />
        <col style="width:15%" />
        <col style="width:15%" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="3">เดือน</th>
          <th rowspan="3">จำนวน<br />ลูกจ้าง</th>
          <th colspan="4"><span class="mark">ข</span> ประเภทของค่าจ้างตามกฎหมาย (รวมทุกสาขา)</th>
          <th rowspan="2"><span class="mark">2</span><br />ส่วนที่เกิน<br />20,000/คน/เดือน<br />(รวมของทุกคน)</th>
          <th rowspan="2"><span class="mark">1</span>-<span class="mark">2</span> =<span class="mark">3</span><br />ค่าจ้างสุทธิ<br />ที่ต้องแจ้ง</th>
        </tr>
        <tr>
          <th>เงินเดือน</th>
          <th>ค่าจ้างรายวัน</th>
          <th>เงินได้อื่นๆ</th>
          <th><span class="mark">1</span> รวมค่าจ้าง</th>
        </tr>
        <tr>
          <th colspan="3" class="wage-note">** ไม่รวมเงินที่ไม่ใช่ค่าจ้าง เช่น ค่าล่วงเวลา โบนัส ฯลฯ**</th>
          <th></th>
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${renderMonthRows(report)}
        <tr class="total">
          <td class="month" colspan="2">รวม</td>
          <td class="amount">${money(totals.monthlySalary)}</td>
          <td class="amount">${money(totals.dailyWage)}</td>
          <td class="amount">${money(totals.otherIncome)}</td>
          <td class="amount">${money(totals.totalWage)}</td>
          <td class="amount">${money(totals.excessOverCap)}</td>
          <td class="amount"><span class="mark">ค</span> ${money(totals.netWage)}</td>
        </tr>
      </tbody>
    </table>

    <div class="lowest">
      <span class="mark">ง</span>
      <span>
        ค่าจ้างรายเดือนของลูกจ้างที่ได้รับต่ำสุด เดือนละ
        <strong>${money(lowest.monthlySalary)}</strong> บาท
        ค่าจ้างรายวันของลูกจ้างที่ได้รับต่ำสุดวันละ
        <strong>${money(lowest.dailyWage)}</strong> บาท
      </span>
    </div>

    <div class="bottom">
      <div class="tax-box">
        <div class="row">
          <span class="mark">จ</span>
          <span>รายการเงินได้ตามแบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย ภงด. 1 ก</span>
        </div>
        <div class="row">
          <span class="caption">จำนวน</span>
          <span class="num">${annualTaxSummary.employeeCount}</span>
          <span class="caption">ราย&nbsp;&nbsp;เงินได้ทั้งสิ้น</span>
          <span class="num">${money(annualTaxSummary.totalIncome)}</span>
          <span class="caption">บาท</span>
        </div>
        <div class="row">
          <span class="caption">ประกอบด้วย&nbsp;&nbsp;เงินเดือน</span>
          <span class="num">${money(annualTaxSummary.monthlySalary)}</span>
          <span class="caption">บาท</span>
        </div>
        <div class="row">
          <span class="caption">ค่าจ้างรายวัน</span>
          <span class="num">${money(annualTaxSummary.dailyWage)}</span>
          <span class="caption">บาท&nbsp;&nbsp;เงินได้อื่นๆ</span>
          <span class="num">${money(annualTaxSummary.otherIncome)}</span>
          <span class="caption">บาท</span>
        </div>
        <div class="row">
          <span class="caption">ค่าล่วงเวลา</span>
          <span class="num">${money(annualTaxSummary.overtime)}</span>
          <span class="caption">บาท</span>
        </div>
      </div>

      <div class="sign-area">
        <div class="line"><span>ลงชื่อ</span><span>นายจ้าง</span></div>
        <div class="line"><span>(</span><span>)</span></div>
        <div class="line"><span>ตำแหน่ง</span><span></span></div>
        <div class="stamp">
          <div>ประทับตรา</div>
          <div>นิติบุคคล</div>
        </div>
      </div>
    </div>

    <div class="officer-head">
      <span>ประจำปี ${report.buddhistYear}</span>
      <span>รหัสกิจการ ............................. อัตราเงินสมทบ .........................................</span>
      <span class="title">สำหรับเจ้าหน้าที่</span>
    </div>

    <table class="officer">
      <colgroup>
        <col style="width:22%" />
        <col style="width:20%" />
        <col style="width:24%" />
        <col style="width:17%" />
        <col style="width:17%" />
      </colgroup>
      <thead>
        <tr>
          <th>ประเภท</th>
          <th>ค่าจ้าง</th>
          <th>ปรับขั้นต่ำ (เฉพาะลูกจ้าง 1 คน)</th>
          <th>ค่าจ้างสุทธิ</th>
          <th>เงินสมทบ</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>การประเมินต้นปี</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>การรายงานค่าจ้าง</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>สปส 1-10</td><td></td><td></td><td></td><td></td></tr>
      </tbody>
    </table>

    <div class="officer-note">
      กองทุนเงินทดแทน&nbsp;&nbsp;สรุปผลเป็น&nbsp;&nbsp;เรียกเพิ่ม (Dr.), จ่ายคืน (Cr.)
    </div>
  </div>
</body>
</html>`;
}

function getChromeExecutablePath() {
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}

export async function generateWorkmenFormPdf(
  report: WorkmenCompensationReport,
): Promise<WorkmenFormFile> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildWorkmenFormHtml(report), { waitUntil: 'load' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    return {
      buffer: Buffer.from(pdf),
      fileName: `kt-20-${report.buddhistYear}.pdf`,
      mimeType: 'application/pdf',
    };
  } finally {
    await browser.close();
  }
}
