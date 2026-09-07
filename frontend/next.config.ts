import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";

/**
 * dev server ยอมรับคำขอจาก localhost อย่างเดียว เปิดผ่าน IP วงแลน (เช่นทดสอบบนมือถือ)
 * จะโดนตอบ 403 ทั้ง /_next/static/* และ websocket ของ HMR
 *
 * IP วงแลนมาจาก DHCP เปลี่ยนได้เรื่อย ๆ จึงอ่านจากการ์ดเน็ตของเครื่องตอนบูตแทนการฮาร์ดโค้ด
 * และเปิดช่องให้ระบุเพิ่มเองผ่าน NEXT_DEV_ALLOWED_ORIGINS (คั่นด้วยจุลภาค) สำหรับกรณี
 * เข้าผ่าน hostname หรือ tunnel เช่น ngrok
 */
function devOrigins(): string[] {
  const extra = (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const localAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry!.address);

  return [...new Set([...localAddresses, ...extra])];
}

/**
 * โซนเงินเดือนถูกยุบจาก 9 route เหลือ 3 (ทำเงินเดือน / พนักงาน / ตั้งค่า)
 * URL เก่าถูกบุ๊กมาร์กและลิงก์ไว้จากหน้าอื่น จึงส่งต่อไปหน้าที่รับงานนั้นแทน
 */
const payrollRedirects = [
  { from: "/payroll/periods", to: "/payroll" },
  { from: "/payroll/periods/:id", to: "/payroll" },
  { from: "/payroll/runs", to: "/payroll" },
  { from: "/payroll/runs/:id", to: "/payroll" },
  { from: "/payroll/payslips", to: "/payroll" },
  { from: "/payroll/filings", to: "/payroll" },
  { from: "/payroll/compensation", to: "/payroll/employees" },
  { from: "/payroll/adjustments", to: "/payroll/employees" },
  { from: "/payroll/deduction-plans", to: "/payroll/employees" },
  { from: "/payroll/extensions", to: "/payroll/employees" },
  { from: "/payroll/tax", to: "/payroll/settings" },
];

/**
 * Security headers ของหน้าเว็บ
 * ============================
 * helmet บน backend คุมเฉพาะ response ของ API ส่วนหน้าที่ผู้ใช้เปิดจริงถูกเสิร์ฟ
 * โดย Next.js ซึ่งเดิมไม่ได้ตั้ง header อะไรเลย
 *
 * เรื่องนี้สำคัญเพราะ access token เก็บอยู่ใน sessionStorage ซึ่ง JavaScript
 * อ่านได้ ถ้ามี XSS หลุดเข้ามาทางใดทางหนึ่ง — จาก dependency ก็ได้ — token
 * จะถูกขโมยทันที CSP คือชั้นที่ทำให้ XSS หนึ่งจุดไม่กลายเป็นการยึดบัญชี
 *
 * `'unsafe-inline'` ใน style-src จำเป็นสำหรับ Next.js/Tailwind ที่ฉีด style
 * ตอน runtime ส่วน script-src ต้องมี `'unsafe-inline'` เพราะ Next ฝัง
 * __NEXT_DATA__ และ bootstrap script แบบ inline โดยไม่มี nonce
 * ถ้าจะรัดกว่านี้ต้องทำ nonce ผ่าน middleware ซึ่งเป็นงานคนละก้อน
 *
 * เริ่มด้วยโหมด report-only ได้ด้วย CSP_REPORT_ONLY=true เพื่อดูว่ามีอะไรโดนบล็อก
 * ก่อนบังคับจริง — แนะนำให้เปิดดูสักสัปดาห์แล้วค่อยสลับ
 */
function buildContentSecurityPolicy(apiOrigin: string | undefined) {
  const connectSrc = ["'self'", apiOrigin].filter(Boolean).join(" ");

  /*
   * ไฟล์ที่ผู้ใช้อัปโหลด (โลโก้บริษัท รูปพนักงาน ลายเซ็น) ถูกเสิร์ฟจาก /uploads
   * ของ backend ไม่ใช่จาก Next — คนละ origin จึงต้องอนุญาตไว้ตรง ๆ
   * ขาดไปแล้วเบราว์เซอร์บล็อกเงียบ ๆ เห็นเป็นรูปแตกทั้งที่ไฟล์ตอบ 200
   */
  const imgSrc = ["'self'", "data:", "blob:", apiOrigin].filter(Boolean).join(" ");

  /*
   * แผนที่ตำแหน่งจุดลงเวลา (หน้า /settings/attendance และ /attendance)
   * ฝัง Google Maps แบบ `output=embed` ซึ่งไม่ต้องใช้ API key
   *
   * ต้องใส่ทั้งสองโดเมน เพราะ maps.google.com redirect ไป www.google.com/maps/embed
   * เบราว์เซอร์ตรวจ frame-src กับปลายทางหลัง redirect ด้วย ใส่ตัวเดียวจึงยังโดนบล็อก
   * อาการคือกล่องแผนที่ว่างเปล่าโดยไม่มี error ในหน้า เห็นเฉพาะใน console
   */
  const frameSrc = [
    "'self'",
    "blob:",
    "https://maps.google.com",
    "https://www.google.com",
  ].join(" ");

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    // data: สำหรับโลโก้ที่ฝังมาเป็น base64, blob: สำหรับพรีวิวรูปก่อนอัปโหลด
    `img-src ${imgSrc}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    // ดาวน์โหลดสลิป/รายงานเป็น PDF ผ่าน blob URL
    "object-src 'none'",
    `frame-src ${frameSrc}`,
    "base-uri 'self'",
    "form-action 'self'",
    // แทน X-Frame-Options: DENY — กัน clickjacking
    "frame-ancestors 'none'",
  ];

  /*
   * upgrade-insecure-requests เปิดเฉพาะตอน API เป็น https จริง
   *
   * ถ้าใส่ตลอด เบราว์เซอร์จะอัปเกรดคำขอไป http://<api> เป็น https:// ให้เอง
   * ซึ่งพังทันทีบนเครื่องพัฒนาและบน staging ที่ยังไม่มีใบรับรอง
   * (Chrome ยกเว้น localhost ให้ แต่ staging ที่ใช้ IP หรือ hostname ไม่ได้รับยกเว้น)
   */
  if (apiOrigin?.startsWith("https://")) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

function securityHeaders() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  let apiOrigin: string | undefined;

  if (apiBaseUrl) {
    try {
      apiOrigin = new URL(apiBaseUrl).origin;
    } catch {
      // ปล่อยว่างไว้ — connect-src จะเหลือแค่ 'self'
      // ดีกว่าใส่ค่าที่ parse ไม่ได้ลง header แล้วทำให้ทั้งนโยบายเพี้ยน
      apiOrigin = undefined;
    }
  }

  const reportOnly = process.env.CSP_REPORT_ONLY === "true";

  return [
    {
      key: reportOnly
        ? "Content-Security-Policy-Report-Only"
        : "Content-Security-Policy",
      value: buildContentSecurityPolicy(apiOrigin),
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    {
      key: "Permissions-Policy",
      /*
       * ปิดทุกอย่างที่ไม่ได้ใช้ เหลือ geolocation ที่หน้าลงเวลาต้องใช้จริง
       * เดิมปิด geolocation ด้วย เพราะตอนเขียนคิดว่าลงเวลาด้วย GPS อยู่บนแอปมือถือเท่านั้น
       * แต่ /ess/check-in และหน้าตั้งค่าอุปกรณ์ลงเวลาบนเว็บก็ขอพิกัด
       * ผลคือเบราว์เซอร์บล็อกให้เงียบ ๆ ตอบเป็น PERMISSION_DENIED โดยไม่เด้งขออนุญาต
       * ทำให้ดูเหมือนผู้ใช้กดไม่อนุญาตไว้ ทั้งที่ไม่เคยเห็น prompt เลย
       *
       * `(self)` = เฉพาะหน้าของเราเอง iframe ข้ามโดเมนยังขอไม่ได้
       */
      value: "camera=(), microphone=(), geolocation=(self), payment=()",
    },
  ];
}

const nextConfig: NextConfig = {
  /*
   * standalone = แพ็กเฉพาะไฟล์ที่รันจริงพร้อมเซิร์ฟเวอร์ในตัว
   * ทำให้อิมเมจไม่ต้องมี node_modules ทั้งก้อน (จากหลักร้อย MB เหลือหลักสิบ)
   * และไม่ต้องพึ่ง `next start` ซึ่งต้องการ dev dependency
   */
  output: "standalone",

  allowedDevOrigins: devOrigins(),

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },

  async redirects() {
    return payrollRedirects.map(({ from, to }) => ({
      source: from,
      destination: to,
      permanent: true,
    }));
  },
};

export default nextConfig;
