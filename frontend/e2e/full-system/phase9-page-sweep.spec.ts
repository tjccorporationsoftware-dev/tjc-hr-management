import { expect, test, type Page } from "@playwright/test";

import {
  STATE_COMPANY_ADMIN,
  STATE_EMPLOYEE,
  STATE_SUPERADMIN,
  shot,
} from "./_shared";

/**
 * เฟส 9–10 — กวาดทุกหน้าที่อยู่ในเมนู
 * -----------------------------------------------------------------------------
 * เฟส 0–8 ไล่ตรวจเส้นทางที่เงินเดินผ่านอย่างละเอียดไปแล้ว
 * เฟสนี้ตั้งใจให้เร็ว ไม่ไล่ตัวเลขทีละบรรทัด แค่พิสูจน์ว่า
 * ทุกหน้าที่ผู้ใช้กดจากเมนูได้จริง เปิดขึ้น ไม่เด้งออก ไม่พัง ไม่ว่างเปล่า
 *
 * นับเฉพาะเมนูที่เปิดใช้อยู่ ส่วนที่คอมเมนต์ไว้ใน lib/navigation.ts ไม่นับ
 *
 * เกณฑ์ที่ถือว่าไม่ผ่าน
 *   เด้งไปหน้า login          session หลุดหรือหน้านั้นต้องสิทธิ์ที่บัญชีนี้ไม่มี
 *   ขึ้นข้อความ error         หน้าพังจริง
 *   เนื้อหาสั้นผิดปกติ         โหลดไม่เสร็จหรือ render ไม่ออก
 * ส่วนการถูกพาไปหน้าอื่นเฉยๆ จะบันทึกไว้รายงาน ไม่ตัดสินว่าผิด
 * เพราะบางหน้าออกแบบให้เด้งตามสิทธิ์อยู่แล้ว
 */

const ADMIN_PAGES = [
  "/hr/dashboard",
  "/employees",
  "/organization",
  "/manpower",
  "/approvals",
  "/hr/requests",
  "/attendance",
  "/hr-review",
  "/documents",
  "/onboarding",
  "/performance",
  "/reports",
  "/payroll",
  "/payroll/periods",
  "/payroll/compensation",
  "/payroll/deduction-plans",
  "/payroll/filings",
  "/payroll/tax",
  "/payroll/payslips",
  "/users",
  "/roles",
  "/settings/work-policies",
  "/settings/system",
  "/settings/system/holiday-calendar",
  "/settings/system/attendance-devices",
  "/settings/system/attendance-methods",
  "/settings/system/document-templates",
  "/settings/approval-workflow",
  "/settings/audit",
  "/settings/trash",
];

/** หน้าที่ต้องใช้ขอบเขตระดับ GLOBAL เท่านั้น */
const PLATFORM_PAGES = ["/settings/security", "/settings/monitoring"];

const ESS_PAGES = [
  "/ess",
  "/ess/my-profile",
  "/ess/check-in",
  "/ess/my-attendance",
  "/ess/requests",
  "/ess/requests/leave",
  "/ess/requests/overtime",
  "/ess/requests/time-adjust",
  "/ess/requests/documents",
  "/ess/salary-slip",
];

/*
 * ห้ามใส่ "500" เป็นสัญญาณผิดพลาด เพราะหน้าที่แสดงจำนวนเงินจะมีเลข 500
 * อยู่ในยอดเสมอ (เช่น 428,500.00) แล้วถูกตัดสินว่าพังทั้งที่ปกติดี
 * เคสนี้เกิดจริงกับหน้า /payroll, /payroll/payslips และ /ess/salary-slip
 */
const ERROR_MARKERS = [
  "Application error",
  "Unhandled Runtime Error",
  "This page could not be found",
  "Internal Server Error",
  "เกิดข้อผิดพลาดที่ไม่คาดคิด",
];

type PageResult = {
  href: string;
  verdict: "ok" | "login" | "error" | "empty";
  finalUrl: string;
  length: number;
};

async function visit(page: Page, href: string): Promise<PageResult> {
  await page.goto(href, { waitUntil: "domcontentloaded" });

  /*
   * หน้าส่วนใหญ่ยิง API หลายจุดพร้อมกัน ต้องรอให้ render เสร็จก่อนอ่านเนื้อหา
   * ไม่งั้นจะอ่านได้แต่โครงหน้ากับข้อความ "กำลังโหลด" แล้วตัดสินว่าว่าง
   */
  await page.waitForTimeout(15_000);

  const finalUrl = new URL(page.url()).pathname;
  const body = await page.locator("body").innerText();
  const length = body.replace(/\s+/g, " ").trim().length;

  if (finalUrl.startsWith("/login")) {
    return { href, verdict: "login", finalUrl, length };
  }

  if (ERROR_MARKERS.some((marker) => body.includes(marker))) {
    return { href, verdict: "error", finalUrl, length };
  }

  // หน้าจริงในระบบนี้ยาวเกิน 400 ตัวอักษรทั้งหมด สั้นกว่านั้นคือ render ไม่ออก
  if (length < 400) {
    return { href, verdict: "empty", finalUrl, length };
  }

  return { href, verdict: "ok", finalUrl, length };
}

/** สรุปผลเป็นข้อความเดียว แล้วโยนถ้ามีหน้าที่ไม่ผ่าน */
function report(results: PageResult[]) {
  const broken = results.filter((item) => item.verdict !== "ok");
  const redirected = results.filter(
    (item) => item.verdict === "ok" && item.finalUrl !== item.href,
  );

  const summary = [
    `เปิดได้ ${results.length - broken.length}/${results.length} หน้า`,
    redirected.length
      ? `ถูกพาไปหน้าอื่น ${redirected.length}: ${redirected.map((r) => `${r.href}→${r.finalUrl}`).join(", ")}`
      : null,
    broken.length
      ? `มีปัญหา: ${broken.map((r) => `${r.href} (${r.verdict}, ${r.length} ตัวอักษร)`).join(" | ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  test.info().annotations.push({ type: "สรุป", description: summary });

  expect(broken.map((r) => `${r.href}:${r.verdict}`)).toEqual([]);
}

test.describe("เฟส 9 · หน้าฝั่งผู้ดูแล", () => {
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("ทุกหน้าในเมนูผู้ดูแลต้องเปิดได้", async ({ page }) => {
    test.setTimeout(1_800_000);

    const results: PageResult[] = [];
    for (const href of ADMIN_PAGES) {
      results.push(await visit(page, href));
    }

    await page.screenshot({ path: shot("p9-01-admin-sweep"), fullPage: true });
    report(results);
  });
});

test.describe("เฟส 9 · หน้าที่ต้องใช้สิทธิ์ระดับแพลตฟอร์ม", () => {
  test.use({ storageState: STATE_SUPERADMIN });

  test("หน้าความปลอดภัยและการเฝ้าระวังต้องเปิดได้ด้วยบัญชี GLOBAL", async ({
    page,
  }) => {
    test.setTimeout(600_000);

    const results: PageResult[] = [];
    for (const href of PLATFORM_PAGES) {
      results.push(await visit(page, href));
    }

    await page.screenshot({ path: shot("p9-02-platform"), fullPage: true });
    report(results);
  });
});

test.describe("เฟส 9 · หน้าฝั่งพนักงาน", () => {
  test.use({ storageState: STATE_EMPLOYEE });

  test("ทุกหน้าในเมนูพนักงานต้องเปิดได้", async ({ page }) => {
    test.setTimeout(900_000);

    const results: PageResult[] = [];
    for (const href of ESS_PAGES) {
      results.push(await visit(page, href));
    }

    await page.screenshot({ path: shot("p9-03-ess-sweep"), fullPage: true });
    report(results);
  });
});
