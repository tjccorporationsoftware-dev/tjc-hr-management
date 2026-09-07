import { expect, test, type Page } from "@playwright/test";

import { HQ_GEOLOCATION, STATE_EMPLOYEE, shot } from "./_shared";

/**
 * เฟส 5c — ลงเวลาเข้างานจริงผ่าน ESS
 * -----------------------------------------------------------------------------
 * กมลถูกตั้งวิธีลงเวลาเป็น "ประจำออฟฟิศ" ในเฟส 2e คือเว็บ + บังคับอยู่ในพื้นที่
 * จึงต้องจำลองพิกัดให้ตรงกับจุดลงเวลาของสำนักงานใหญ่ที่ตั้งไว้ในเฟส 2d
 *
 * เทสนี้ขึ้นกับ "เวลาจริงตอนรัน" เพราะแต่ละรอบมีช่วงเปิด-ปิดของตัวเอง
 *   เข้ารอบ 1   06:00–11:59
 *   เข้ารอบ 2   12:00–16:59
 *   ออกงาน      00:00–23:59
 * จึงไม่ยึดว่าต้องได้รอบไหน แต่ยึดว่า "รอบที่ระบบเปิดให้ ต้องกดได้และบันทึกจริง"
 */

async function openCheckIn(page: Page) {
  /*
   * หน้านี้ยืนยันการลงเวลาด้วย window.confirm ของเบราว์เซอร์
   * ซึ่งต่างจากหน้าอื่นในระบบที่ใช้โมดัลของตัวเอง
   * Playwright จะกด "ยกเลิก" ให้อัตโนมัติถ้าไม่ดักไว้
   * ทำให้การกดลงเวลาเงียบหายโดยไม่มี error ให้เห็นเลย
   */
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/ess/check-in");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/ลงเวลา/).first()).toBeVisible({ timeout: 60_000 });
  // หน้านี้ต้องรอขอพิกัด GPS จากเบราว์เซอร์ก่อนถึงจะปลดล็อกปุ่ม
  await page.waitForTimeout(12_000);
}

test.describe("เฟส 5c · ลงเวลาเข้างาน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({
    storageState: STATE_EMPLOYEE,
    geolocation: HQ_GEOLOCATION,
    permissions: ["geolocation"],
  });

  test("วันเสาร์เป็นวันทำงานแล้ว หน้าลงเวลาต้องไม่ขึ้นว่าวันหยุด", async ({
    page,
  }) => {
    await openCheckIn(page);

    /*
     * เปลี่ยนวันหยุดประจำสัปดาห์เป็นเฉพาะอาทิตย์ในเฟส 2c แล้ว
     * ถ้ายังขึ้นว่าวันหยุด แปลว่าหน้าลงเวลาไม่ได้อ่านค่าล่าสุด
     */
    await expect(page.getByText(/วันนี้เป็นวันหยุด|ไม่ต้องลงเวลา/)).toHaveCount(0);

    await page.screenshot({ path: shot("p5c-01-workday"), fullPage: true });
  });

  test("ระบบรับพิกัดและยืนยันว่าอยู่ในพื้นที่ลงเวลา", async ({ page }) => {
    await openCheckIn(page);

    /*
     * กมลถูกบังคับ geofence ถ้าระบบยังไม่ได้พิกัดหรือคำนวณว่าอยู่นอกพื้นที่
     * ปุ่มจะขึ้น "รอ GPS เพื่อตรวจพื้นที่" หรือ "อยู่นอกพื้นที่ลงเวลา"
     * ทั้งสองกรณีแปลว่าพนักงานลงเวลาไม่ได้จริง
     */
    const body = page.locator("body");
    await expect(body).not.toContainText("อยู่นอกพื้นที่ลงเวลา");
    await expect(body).not.toContainText("รอ GPS เพื่อตรวจพื้นที่");

    await page.screenshot({ path: shot("p5c-02-geofence-ok"), fullPage: true });
  });

  test("กดลงเวลาแล้วต้องบันทึกสำเร็จและขึ้นในประวัติของฉัน", async ({ page }) => {
    test.setTimeout(300_000);
    await openCheckIn(page);

    /*
     * ปุ่มลงเวลาเป็นปุ่มใหญ่ปุ่มสุดท้ายของหน้า ป้ายเปลี่ยนตามรอบที่เปิดอยู่
     * เช่น "บันทึกลงเวลาเข้า รอบที่ 1" หรือ "บันทึกออกงาน"
     */
    const punchButton = page
      .getByRole("button", { name: /^บันทึก/ })
      .last();

    const label = (await punchButton.innerText()).replace(/\s+/g, " ").trim();

    if (await punchButton.isDisabled()) {
      /*
       * นอกช่วงรอบถือว่าระบบทำงานถูก ไม่ใช่ความล้มเหลว
       * แต่ต้องบอกเหตุผลให้ชัด ไม่ใช่ผ่านเงียบเหมือนทดสอบแล้ว
       */
      const reason = await page.locator("body").innerText();
      test.info().annotations.push({
        type: "ข้ามการกดลงเวลา",
        description: `ตอนนี้อยู่นอกช่วงรอบลงเวลา ปุ่มขึ้นว่า "${label}" · ${reason.includes("รอรอบ") ? "รอรอบถัดไป" : "รอบถูกบันทึกแล้ว"}`,
      });
      await page.screenshot({ path: shot("p5c-03-out-of-session"), fullPage: true });
      return;
    }

    await punchButton.click();

    // บันทึกสำเร็จจะขึ้น toast ที่บอกชื่อรอบที่บันทึก
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /สำเร็จ/ }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: shot("p5c-04-punched"), fullPage: true });

    // ต้องเห็นในประวัติของตัวเองด้วย ไม่ใช่แค่ขึ้น toast แล้วหาย
    await page.goto("/ess/my-attendance");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(10_000);

    await expect(page.locator("tbody tr").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p5c-05-history"), fullPage: true });
  });
});
