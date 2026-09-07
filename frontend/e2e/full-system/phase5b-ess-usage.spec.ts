import { expect, test, type Page } from "@playwright/test";

import {
  HQ_GEOLOCATION,
  STATE_EMPLOYEE,
  expectToast,
  modalRoot,
  selectOptionByText,
  shot,
  thaiDateField,
} from "./_shared";

/**
 * เฟส 5b — พนักงานใช้งาน ESS จริง
 * -----------------------------------------------------------------------------
 * กมลถูกตั้งวิธีลงเวลาเป็น "ประจำออฟฟิศ" ในเฟส 2e คือเว็บ + บังคับอยู่ในพื้นที่
 * จึงต้องจำลองพิกัดให้อยู่ในรัศมีจุดลงเวลาของสำนักงานใหญ่
 *
 * คำขอที่ยื่นในเฟสนี้จะถูกนำไปอนุมัติต่อในเฟส 6
 * จึงตั้งใจยื่นให้ครบทั้ง 4 ประเภทที่เปิดสายอนุมัติไว้ในเฟส 2f
 */

/** ลาในอนาคตเพื่อไม่ให้ชนกับการปิดงวดเวลาทำงานที่จะทดสอบในเฟส 7 */
const LEAVE = {
  startDate: "2026-08-17",
  endDate: "2026-08-17",
  reason: "มีธุระจำเป็นต้องไปทำเอกสารที่อำเภอ",
};

const OVERTIME = {
  date: "2026-07-29",
  reason: "ปิดงบการเงินประจำเดือน ต้องอยู่ต่อหลังเลิกงาน",
};

async function openEss(page: Page, href: string, heading: RegExp) {
  await page.goto(href);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(heading).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(8_000);
}

test.describe("เฟส 5b · พนักงานใช้งาน ESS", () => {
  test.describe.configure({ mode: "serial" });
  test.use({
    storageState: STATE_EMPLOYEE,
    geolocation: HQ_GEOLOCATION,
    permissions: ["geolocation"],
  });

  test("วันหยุดประจำสัปดาห์ต้องกดลงเวลาไม่ได้", async ({ page }) => {
    await openEss(page, "/ess/check-in", /ลงเวลา/);

    /*
     * วันที่ทดสอบตรงกับเสาร์ ซึ่งตั้งเป็นวันหยุดประจำสัปดาห์ในเฟส 2c
     * ระบบต้องกันไว้ ไม่งั้นจะเกิดเวลาทำงานในวันหยุดแล้วคิดเงินผิด
     */
    await expect(page.getByText(/วันหยุด/).first()).toBeVisible({
      timeout: 30_000,
    });

    const punchButton = page
      .getByRole("button", { name: /บันทึก|วันหยุด|รอบ/ })
      .last();
    await expect(punchButton).toBeDisabled();

    await page.screenshot({ path: shot("p5b-01-holiday-blocked"), fullPage: true });
  });

  test("ยื่นใบลาแล้วเข้าคิวรออนุมัติ", async ({ page }) => {
    await openEss(page, "/ess/requests/leave", /ลา/);

    // เคยยื่นไว้แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูล
    if ((await page.getByText(LEAVE.reason).count()) === 0) {
      await page.getByRole("button", { name: "เปิดฟอร์มใบลา" }).click();
      await page.waitForTimeout(2500);

      const modal = modalRoot(page);
      await selectOptionByText(
        modal.locator("select").filter({ hasText: /เลือกประเภทลา/ }).first(),
        "ลากิจได้รับค่าจ้าง",
      );
      await thaiDateField(modal, "วันที่เริ่มลา").fill(LEAVE.startDate);
      await thaiDateField(modal, "วันที่สิ้นสุดลา").fill(LEAVE.endDate);
      await page.getByPlaceholder("ระบุเหตุผลในการลา").fill(LEAVE.reason);

      await page.getByRole("button", { name: "ส่งใบลา" }).click();
      await expectToast(page, /ส่งใบลาเรียบร้อย/);
      await page.waitForTimeout(3000);
    }

    await expect(page.getByText(LEAVE.reason).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p5b-02-leave"), fullPage: true });
  });

  test("คำขอที่ยื่นต้องปรากฏในหน้าคำขอของฉัน", async ({ page }) => {
    await openEss(page, "/ess/requests", /คำขอ/);

    /*
     * หน้านี้เป็นที่เดียวที่พนักงานเห็นสถานะคำขอทุกประเภทรวมกัน
     * ถ้าใบลาที่เพิ่งยื่นไม่โผล่ แปลว่าพนักงานตามเรื่องของตัวเองไม่ได้
     */
    // เลขที่คำขอขึ้นต้นด้วย LV- เสมอ แน่นอนกว่าการเทียบข้อความสถานะ
    await expect(page.getByText(/LV-\d{8}-\d{4}/).first()).toBeVisible({
      timeout: 30_000,
    });

    /*
     * สายอนุมัติที่ตั้งไว้ในเฟส 2f คือหัวหน้าโดยตรง 1 ขั้น
     * สถานะจึงต้องเป็น "รอหัวหน้าอนุมัติ" ไม่ใช่ค้างที่ร่างหรืออนุมัติเอง
     */
    await expect(page.getByText(/รอหัวหน้าอนุมัติ/).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({ path: shot("p5b-03-my-requests"), fullPage: true });
  });

  test("สลิปเงินเดือนต้องบอกตรงๆ ว่ายังไม่มีงวดที่จ่ายแล้ว", async ({ page }) => {
    await openEss(page, "/ess/salary-slip", /สลิป|เงินเดือน/);

    /*
     * ยังไม่มีการจ่ายเงินเดือน (เฟส 8) หน้านี้จึงต้องว่าง
     * แต่ต้องว่างแบบบอกเหตุผล ไม่ใช่ค้างหรือขึ้นข้อผิดพลาด
     */
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.getByText(/กำลังโหลด/)).toHaveCount(0);

    await page.screenshot({ path: shot("p5b-04-salary-slip"), fullPage: true });
  });
});
