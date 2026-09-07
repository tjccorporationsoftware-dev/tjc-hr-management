import { expect, test } from "@playwright/test";

import { STATE_COMPANY_ADMIN, expectToast, shot } from "./_shared";

/**
 * เฟส 2e — วิธีลงเวลารายพนักงาน
 * -----------------------------------------------------------------------------
 * หน้านี้ตัดสินว่าพนักงานแต่ละคนกดลงเวลาด้วยอะไรได้บ้าง และต้องอยู่ในพื้นที่ไหม
 * ต้องทำหลังตั้งจุด GPS เสร็จ (เฟส 2d) เพราะถ้าบังคับพื้นที่แต่สาขาไม่มีจุด
 * พนักงานจะกดลงเวลาไม่ได้เลย หน้านี้เองก็เตือนเรื่องนี้อยู่
 */

test.describe("เฟส 2e · วิธีลงเวลารายพนักงาน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("ทุกสาขามีจุด GPS แล้ว หน้าจึงต้องไม่เตือนเรื่องจุดที่ขาด", async ({
    page,
  }) => {
    await page.goto("/settings/system/attendance-methods");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/วิธีลงเวลา/).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForTimeout(8_000);

    // การ์ดสรุปด้านบนต้องบอกว่าครบแล้ว หลังเพิ่งตั้งจุดครบสองสาขาในเฟสก่อน
    await expect(page.getByText("จุด GPS ครบทุกสาขา")).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p2e-01-overview"), fullPage: true });
  });

  test("ตั้งพนักงานออฟฟิศให้ลงเวลาแบบบังคับพื้นที่", async ({ page }) => {
    await page.goto("/settings/system/attendance-methods");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(10_000);

    await page.getByPlaceholder("ค้นหาชื่อ รหัส สาขา ประเภทพนักงาน").fill("กมล");
    await page.waitForTimeout(3000);

    await page.getByRole("button", { name: "ตั้งค่าวิธีลงเวลา" }).first().click();
    await page.waitForTimeout(2000);

    // ชุดค่าสำเร็จรูป "ประจำออฟฟิศ" = เว็บ + บังคับอยู่ในพื้นที่
    await page.getByRole("button", { name: /ประจำออฟฟิศ/ }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: shot("p2e-02-office-preset"), fullPage: true });

    await page.getByRole("button", { name: /บันทึกการตั้งค่า/ }).click();
    await expectToast(page, /สำเร็จ|บันทึก/);
  });

  test("ตั้งพนักงานคลังสินค้าให้ลงเวลานอกสถานที่ได้", async ({ page }) => {
    await page.goto("/settings/system/attendance-methods");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(10_000);

    await page.getByPlaceholder("ค้นหาชื่อ รหัส สาขา ประเภทพนักงาน").fill("ธนา");
    await page.waitForTimeout(3000);

    await page.getByRole("button", { name: "ตั้งค่าวิธีลงเวลา" }).first().click();
    await page.waitForTimeout(2000);

    // ชุด "ออกนอกสถานที่" = ไม่บังคับพื้นที่ ใช้กับงานที่ต้องออกไปข้างนอก
    await page.getByRole("button", { name: /ออกนอกสถานที่/ }).click();
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: /บันทึกการตั้งค่า/ }).click();
    await expectToast(page, /สำเร็จ|บันทึก/);

    await page.screenshot({ path: shot("p2e-03-field-preset"), fullPage: true });
  });
});
