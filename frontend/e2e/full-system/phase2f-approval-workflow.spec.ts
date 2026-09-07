import { expect, test, type Page } from "@playwright/test";

import { STATE_COMPANY_ADMIN, shot } from "./_shared";

/**
 * เฟส 2f — สายอนุมัติ
 * -----------------------------------------------------------------------------
 * ถ้าประเภทคำขอใดไม่มีสายอนุมัติ พนักงานจะยื่นคำขอนั้นไม่ได้เลย
 * หน้าเองก็เตือนไว้ว่า "ยังไม่มีสายอนุมัติ พนักงานสาขานี้จะส่งคำขอไม่ได้"
 *
 * ตั้งให้ครบทั้ง 4 ประเภทที่ระบบเปิดใช้จริง เพราะเฟส 5 (ESS) จะยื่นทุกประเภท
 * ใช้สายเริ่มต้น "หัวหน้าโดยตรง 1 ขั้น" ระดับบริษัท ซึ่งครอบคลุมทุกสาขา
 */

const REQUEST_TYPES = [
  "ใบลา",
  "ทำงานล่วงเวลา (OT)",
  "ขอแก้เวลา",
  "ทำงานนอกสถานที่",
];

async function openApprovalWorkflow(page: Page) {
  await page.goto("/settings/approval-workflow");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/สายอนุมัติ/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(8_000);
}

test.describe("เฟส 2f · สายอนุมัติ", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("ตั้งสายอนุมัติเริ่มต้นให้ครบทุกประเภทคำขอ", async ({ page }) => {
    await openApprovalWorkflow(page);

    for (const type of REQUEST_TYPES) {
      await page.getByText(type, { exact: true }).first().click();
      await page.waitForTimeout(2500);

      /*
       * สวิตช์เปิดใช้งานคือทางที่ระบบออกแบบไว้ให้ตั้งเร็วที่สุด
       * ตามข้อความในหน้า: กดแล้วสร้างสายเริ่มต้น (หัวหน้าโดยตรง 1 ขั้น)
       * ให้ทั้งบริษัททันที ไม่ต้องเข้าหน้าแก้ไขทีละขั้น
       *
       * ถ้าเปิดอยู่แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูลก่อน
       */
      const toggle = page.getByRole("switch", {
        name: new RegExp(`^เปิดใช้งาน ${type.replace(/[()]/g, "\\$&")}$`),
      });

      if ((await toggle.count()) === 0) {
        continue;
      }

      await toggle.first().click();
      await page.waitForTimeout(4000);

      // ต้องได้สายอนุมัติระดับบริษัทที่ใช้งานอยู่จริง
      await expect(page.getByText("ทั้งบริษัท (ทุกสาขา)").first()).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.screenshot({ path: shot("p2f-01-workflows"), fullPage: true });
  });

  test("ทุกประเภทคำขอต้องไม่เหลือคำเตือนว่ายังส่งคำขอไม่ได้", async ({ page }) => {
    await openApprovalWorkflow(page);

    for (const type of REQUEST_TYPES) {
      await page.getByText(type, { exact: true }).first().click();
      await page.waitForTimeout(2500);

      // คำเตือนนี้แปลว่าพนักงานยื่นคำขอประเภทนั้นไม่ได้จริง
      await expect(
        page.getByText(/ยังไม่มีสายอนุมัติ พนักงานสาขานี้จะส่งคำขอไม่ได้/),
      ).toHaveCount(0);
      await expect(
        page.getByText(/ยังไม่มีค่าเริ่มต้น สาขาที่ไม่ได้ตั้งแยกจะส่งคำขอไม่ได้/),
      ).toHaveCount(0);
    }

    await page.screenshot({ path: shot("p2f-02-no-gap"), fullPage: true });
  });
});
