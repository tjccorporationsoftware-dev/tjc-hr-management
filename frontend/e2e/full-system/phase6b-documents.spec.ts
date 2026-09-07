import { expect, test, type Page } from "@playwright/test";

import {
  STATE_EMPLOYEE,
  STATE_PAYROLL,
  expectToast,
  fieldByLabel,
  modalRoot,
  selectOptionByText,
  shot,
} from "./_shared";

/**
 * เฟส 6b — ศูนย์เอกสารและหนังสือรับรอง
 * -----------------------------------------------------------------------------
 * ปิดวงจรที่เริ่มไว้ในเฟส 2g: ประเภทเอกสารและ Template ที่ตั้งไว้
 * ต้องถูกพนักงานเรียกใช้ได้จริง และ HR ต้องออกเอกสารให้ได้
 *
 * หนังสือรับรองการทำงานเป็นเอกสารที่พนักงานขอบ่อยที่สุด
 * (ยื่นวีซ่า สมัครสินเชื่อ ติดต่อราชการ) ถ้าออกไม่ได้ HR ต้องทำมือทุกใบ
 */

const DOC_REQUEST = {
  type: "หนังสือรับรองการทำงาน",
  title: "ขอหนังสือรับรองการทำงาน",
  purpose: "ใช้ประกอบการยื่นขอสินเชื่อกับธนาคาร",
};

async function openEssDocuments(page: Page) {
  await page.goto("/ess/requests/documents");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/เอกสาร/).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(10_000);
}

test.describe("เฟส 6b · พนักงานขอเอกสาร", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_EMPLOYEE });

  test("ประเภทเอกสารที่ HR ตั้งไว้ต้องเลือกได้จริง", async ({ page }) => {
    await openEssDocuments(page);

    /*
     * ปุ่มขอเอกสารถูกปิดไว้เมื่อบริษัทยังไม่มีประเภทเอกสาร
     * ถ้ายังกดไม่ได้ แปลว่าที่ตั้งไว้ในเฟส 2g ไม่ถึงมือพนักงาน
     */
    await expect(
      page.getByRole("button", { name: "ขอเอกสารใหม่" }),
    ).toBeEnabled({ timeout: 30_000 });

    await page.screenshot({ path: shot("p6b-01-can-request"), fullPage: true });
  });

  test("ยื่นคำขอหนังสือรับรองการทำงาน", async ({ page }) => {
    await openEssDocuments(page);

    // เคยยื่นไว้แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูล
    if ((await page.getByText(DOC_REQUEST.title).count()) === 0) {
      await page.getByRole("button", { name: "ขอเอกสารใหม่" }).click();
      await page.waitForTimeout(2500);

      const modal = modalRoot(page);
      await selectOptionByText(
        fieldByLabel(modal, "ประเภทเอกสาร", "select"),
        DOC_REQUEST.type,
      );
      await page
        .getByPlaceholder("เช่น ขอหนังสือรับรองการทำงาน")
        .fill(DOC_REQUEST.title);
      await page
        .getByPlaceholder(/ใช้ประกอบการยื่นวีซ่า/)
        .fill(DOC_REQUEST.purpose);

      await page.getByRole("button", { name: "ส่งคำขอเอกสาร" }).click();
      await expectToast(page, /ส่งคำขอเอกสารเรียบร้อย/);
      await page.waitForTimeout(3000);
    }

    await expect(page.getByText(DOC_REQUEST.title).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p6b-02-requested"), fullPage: true });
  });
});

test.describe("เฟส 6b · HR ออกเอกสาร", () => {
  test.use({ storageState: STATE_PAYROLL });

  test("คำขอเอกสารต้องเข้าศูนย์ออกหนังสือรับรองของ HR", async ({ page }) => {
    await page.goto("/documents");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/เอกสาร|รับรอง/).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForTimeout(10_000);

    /*
     * ถ้าคำขอไม่มาถึงหน้านี้ พนักงานจะยื่นแล้วเงียบหาย
     * และ HR ไม่มีทางรู้ว่ามีใครรออยู่
     */
    await expect(page.getByText("กมล").first()).toBeVisible({ timeout: 30_000 });

    await page.screenshot({ path: shot("p6b-03-hr-center"), fullPage: true });
  });
});
