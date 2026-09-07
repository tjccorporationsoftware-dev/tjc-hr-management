import { expect, test, type Page } from "@playwright/test";

import { STATE_COMPANY_ADMIN, selectOptionByText, shot } from "./_shared";

/**
 * เฟส 7b — ตรวจเวลาทำงานรายวันและคำนวณใหม่
 * -----------------------------------------------------------------------------
 * เวลาทำงานที่กรอกในเฟส 7a ถูกคำนวณตอนบันทึกด้วยกะที่มีผลอยู่ ณ ตอนนั้น
 * พอแก้วันที่เริ่มใช้ของกะให้ย้อนไปถึงต้นปี ต้องสั่งคำนวณใหม่ทั้งงวด
 * ไม่งั้นค่าปรับที่คิดไว้เดิมจะค้างเป็นตัวเลขเก่า
 *
 * นี่เป็นงานที่ HR ทำจริงทุกงวด: แก้กะ แก้เวลา แล้วสั่งคำนวณใหม่ก่อนปิดงวด
 */

const PERIOD = { from: "2026-06-26", to: "2026-07-25" };

async function openAttendance(page: Page) {
  await page.goto("/attendance");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/เวลาทำงาน|ตรวจเวลา/).first()).toBeVisible({
    timeout: 90_000,
  });
  await page.waitForTimeout(12_000);
}

/** ตั้งช่วงวันที่ของตัวกรองแล้วกดค้นหา */
async function applyPeriod(page: Page) {
  /*
   * หน้านี้ค้นหาอัตโนมัติเมื่อเปลี่ยนตัวกรอง ไม่มีปุ่มค้นหาให้กด
   * ตามที่หน้าจอเขียนไว้เองว่า "ค้นหาอัตโนมัติเมื่อเปลี่ยนตัวกรอง"
   */
  const dateInputs = page.locator("input[type='date']");
  await dateInputs.nth(0).fill(PERIOD.from);
  await dateInputs.nth(1).fill(PERIOD.to);
  await page.waitForTimeout(12_000);
}

/** ปิดกล่องรายละเอียดแล้วรอให้หายจริง */
async function closeDetail(page: Page) {
  await page
    .getByRole("button", { name: "ปิดหน้าต่างรายละเอียด" })
    .last()
    .click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, {
    timeout: 20_000,
  });
  await page.waitForTimeout(1500);
}

test.describe("เฟส 7b · ตรวจเวลาทำงานรายวัน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("หน้าตรวจเวลาต้องเห็นข้อมูลทั้งงวดที่กรอกไว้", async ({ page }) => {
    test.setTimeout(400_000);
    await openAttendance(page);
    await applyPeriod(page);

    /*
     * ถ้าไม่เห็นข้อมูล แปลว่า HR ตรวจงวดก่อนปิดไม่ได้เลย
     * และจะปล่อยให้เวลาผิดหลุดเข้าไปคิดเงินเดือน
     */
    await expect(page.locator("tbody tr").first()).toBeVisible({
      timeout: 60_000,
    });

    await page.screenshot({ path: shot("p7b-01-period"), fullPage: true });
  });

  test("สั่งคำนวณใหม่แล้วค่าปรับต้องอิงกะจริง ไม่ใช่ค่ากลางของระบบ", async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await openAttendance(page);
    await applyPeriod(page);

    await page.getByRole("button", { name: "คำนวณใหม่" }).click();

    /*
     * คำนวณทั้งงวดใช้เวลานาน จึงรอ toast แบบเผื่อไว้มาก
     * ถ้าไม่ขึ้นแปลว่าคำนวณไม่สำเร็จ ซึ่งจะทำให้ตัวเลขค้างของเก่า
     */
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /คำนวณข้อมูล Attendance ใหม่แล้ว/ })
        .first(),
    ).toBeVisible({ timeout: 180_000 });

    await page.waitForTimeout(10_000);

    /*
     * ต้องตรวจตัวเลขจริง ไม่ใช่แค่ว่ามี toast ขึ้น
     * เคสที่เคยพลาด: toast ขึ้นแต่ตัวเลขยังคิดด้วยค่ากลางของระบบ
     *
     * ตารางหน้านี้แสดงเป็นรายวัน ไม่มียอดรวมรายคน
     * จึงต้องเปิดรายละเอียดของวันที่มาสายจริงเพื่อดูยอดหัก
     *
     * ธนาอยู่คลังสินค้า เข้า 08:00 ผ่อนผัน 10 นาที ปรับ 3 บาท/นาที
     * วันที่ 02/07 มาสาย 09:10 → เกิน 08:10 อยู่ 60 นาที × 3 = 180 บาท
     * ถ้าใช้ค่ากลางของระบบ (08:00 ไม่ผ่อนผัน 5 บาท) จะได้ 70 × 5 = 350 บาท
     */
    await page.getByPlaceholder("ชื่อ / รหัสพนักงาน / แผนก").fill("ธนา");
    await page.waitForTimeout(10_000);

    /*
     * หาแถวจาก "เวลาที่มาสาย" ไม่ใช่จากวันที่
     * เพราะตารางแบ่งหน้าและเรียงจากวันล่าสุด วันที่ต้องการอาจอยู่หน้าถัดไป
     * ส่วนเวลา 09:10 คือเวลาที่ตั้งไว้ให้เป็นวันมาสายโดยเฉพาะ
     */
    const lateRow = page
      .locator("tbody tr")
      .filter({ hasText: "09:10" })
      .first();
    await expect(lateRow).toBeVisible({ timeout: 30_000 });
    await lateRow.getByRole("button", { name: "ดูรายละเอียด" }).click();
    await page.waitForTimeout(3000);

    const dialog = page.locator('[role="dialog"]').last();
    await expect(dialog).toContainText("180");
    await expect(dialog).not.toContainText("350.00");

    await closeDetail(page);

    await page.screenshot({ path: shot("p7b-02-recalculated"), fullPage: true });
  });

  test("ยืนยันตรวจสอบรายการที่ระบบตีธงไว้ให้ครบ", async ({ page }) => {
    // เปิดรายละเอียดทีละรายการ จึงใช้เวลานาน
    test.setTimeout(1_200_000);
    await openAttendance(page);
    await applyPeriod(page);

    /*
     * ระบบบังคับว่าต้องเคลียร์รายการที่ตีธงก่อน ถึงจะทำเครื่องหมาย
     * "พร้อมเข้า Payroll" ได้ในหน้า HR Review
     * ตราบใดที่ยังมีรายการค้างตรวจ ปุ่มปิดงวดจะส่งได้ 0 คน
     *
     * กรองเฉพาะรายการที่ต้องตรวจ แล้วเปิดทีละใบเพื่อยืนยัน
     */
    await selectOptionByText(
      page.locator("select").filter({ hasText: /ทั้งหมด/ }).first(),
      "ต้องตรวจ",
    );
    await page.waitForTimeout(10_000);

    let confirmed = 0;
    let skipped = 0;

    /*
     * รายการที่ยืนยันแล้วจะหลุดออกจากตัวกรอง "ต้องตรวจ"
     * จึงหยิบใบแรกเสมอ ไม่ใช่ไล่ตามดัชนี เพราะดัชนีจะเลื่อนทุกครั้ง
     *
     * แต่ถ้าเจอใบที่กดยืนยันไม่ได้ มันจะค้างอยู่ที่เดิม
     * จึงนับจำนวนครั้งที่ข้ามติดกันไว้กันวนไม่จบ
     */
    for (let guard = 0; guard < 60; guard += 1) {
      const detailButtons = page.getByRole("button", { name: "ดูรายละเอียด" });
      if ((await detailButtons.count()) === 0) break;
      if (skipped >= 3) break;

      await detailButtons.first().click();
      await page.waitForTimeout(2500);

      const dialog = page.locator('[role="dialog"]').last();
      const confirmInDetail = dialog.getByRole("button", {
        name: "ยืนยันการตรวจสอบ",
      });

      if ((await confirmInDetail.count()) === 0) {
        skipped += 1;
        await closeDetail(page);
        continue;
      }

      await confirmInDetail.click();
      await page.waitForTimeout(2000);
      /*
       * กล่องยืนยันชั้นที่สองไม่ได้ใช้ role="dialog" เหมือนกล่องรายละเอียด
       * จึงต้องหาปุ่มที่ระดับหน้า ไม่ใช่ในขอบเขตกล่องเดิม
       */
      await page.getByRole("button", { name: "ตรวจแล้ว" }).last().click();
      await page.waitForTimeout(4000);
      confirmed += 1;
      skipped = 0;

      /*
       * กล่องรายละเอียดไม่ปิดเองหลังยืนยัน (ระบบแค่อัปเดตสถานะในกล่อง)
       * และไม่รับปุ่ม Escape ต้องกดปุ่มปิดซึ่งชื่อ "ปิดหน้าต่างรายละเอียด"
       * ถ้าไม่ปิด ใบถัดไปจะกดไม่โดนเพราะโดนกล่องบังไว้
       */
      await closeDetail(page);
      await expect(page.locator('[role="dialog"]')).toHaveCount(0, {
        timeout: 20_000,
      });
      await page.waitForTimeout(2000);
    }

    test.info().annotations.push({
      type: "สรุป",
      description: `ยืนยันตรวจสอบใหม่ ${confirmed} รายการ · ข้าม ${skipped} รายการ`,
    });

    await page.screenshot({ path: shot("p7b-03-reviewed"), fullPage: true });
  });
});
