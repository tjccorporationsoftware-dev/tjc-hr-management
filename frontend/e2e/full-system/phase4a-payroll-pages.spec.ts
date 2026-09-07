import { expect, test, type Page } from "@playwright/test";

import { STATE_PAYROLL, shot } from "./_shared";

/**
 * เฟส 4a — หน้าเงินเดือนเปิดได้ครบ
 * -----------------------------------------------------------------------------
 * เดินด้วยบัญชีเงินเดือน (PAYROLL_ACCOUNTING) ซึ่งเป็นคนที่ทำงานนี้จริง
 * ตรวจว่าเข้าถึงได้และไม่พังก่อน แล้วค่อยลงลึกทีละหน้าในเฟสถัดไป
 *
 * บัญชีนี้ถูกยกขอบเขตเป็นระดับบริษัทในเฟส 1d จึงต้องเห็นข้อมูลครบทุกสาขา
 */

type PayrollPage = { href: string; heading: RegExp };

const PAYROLL_PAGES: PayrollPage[] = [
  { href: "/payroll", heading: /เงินเดือน/ },
  { href: "/payroll/periods", heading: /งวดเงินเดือน/ },
  { href: "/payroll/compensation", heading: /ฐานเงินเดือน|รายรับ/ },
  { href: "/payroll/deduction-plans", heading: /หักผ่อนงวด|กยศ/ },
  { href: "/payroll/tax", heading: /ภาษี/ },
  { href: "/payroll/filings", heading: /ไฟล์นำส่ง|นำส่ง/ },
  { href: "/payroll/payslips", heading: /Payslip|สลิป/ },
];

async function expectPageHealthy(page: Page, target: PayrollPage) {
  const failedRequests: string[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto(target.href);
  await page.waitForLoadState("domcontentloaded");

  await expect(page).toHaveURL(new RegExp(target.href.replace(/\//g, "\\/")));
  await expect(page.getByText(target.heading).first()).toBeVisible({
    timeout: 60_000,
  });

  await page.waitForTimeout(8_000);

  await expect(page.locator("body")).not.toContainText("Unauthorized");
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.getByText(/ไม่มีสิทธิ์เข้าถึงหน้านี้/)).toHaveCount(0);

  if (failedRequests.length > 0) {
    throw new Error(
      `${target.href} ยิง API แล้วพัง: ${failedRequests.join(" , ")}`,
    );
  }

  await page.screenshot({
    path: shot(`p4a-${target.href.replace(/\//g, "-").slice(1)}`),
    fullPage: true,
  });
}

test.describe("เฟส 4a · หน้าเงินเดือน", () => {
  test.use({ storageState: STATE_PAYROLL });

  for (const target of PAYROLL_PAGES) {
    test(`บัญชีเงินเดือนเปิด ${target.href} ได้และไม่ขึ้นข้อผิดพลาด`, async ({
      page,
    }) => {
      await expectPageHealthy(page, target);
    });
  }
});
