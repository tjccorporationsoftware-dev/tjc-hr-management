import { expect, test, type Page } from "@playwright/test";

import { STATE_COMPANY_ADMIN, shot } from "./_shared";

/*
 * หน้านี้ต่างจากหน้าอื่นในระบบ: แจ้งผลด้วยแถบข้อความในหน้า (notice)
 * ไม่ได้ใช้ toast ของ sonner จึงรอด้วยข้อความบนหน้าแทน
 */
async function expectNotice(page: Page, pattern: RegExp) {
  await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 60_000 });
}

/**
 * เฟส 2c — ปฏิทินวันหยุด
 * -----------------------------------------------------------------------------
 * วันหยุดมีผลโดยตรงกับการคิดเงิน
 *   - วันหยุดประจำสัปดาห์  ตัดสินว่าวันนั้นขาดงานหรือไม่ต้องมาทำงาน
 *   - วันหยุดนักขัตฤกษ์     ทำงานวันนั้นคิดเป็น OT วันหยุด (เรตสูงกว่า)
 *   - วันหยุดบริษัท        นับเป็นวันทำงานที่ได้เงินแต่ไม่ต้องมา
 * ถ้าไม่ตั้ง ระบบจะมองว่าเสาร์อาทิตย์คือวันทำงานแล้วหักขาดงานทั้งเดือน
 */

const COMPANY_HOLIDAY = {
  date: "2026-12-30",
  name: "หยุดชดเชยสิ้นปีของบริษัท",
};

async function openHolidayCalendar(page: Page) {
  await page.goto("/settings/system/holiday-calendar");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/วันหยุด/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(8_000);
}

test.describe("เฟส 2c · ปฏิทินวันหยุด", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("ตั้งวันหยุดประจำสัปดาห์เป็นวันอาทิตย์", async ({ page }) => {
    await openHolidayCalendar(page);

    await page.getByRole("button", { name: /วันหยุดประจำสัปดาห์/ }).click();
    await page.waitForTimeout(1500);

    /*
     * บริษัทนี้ทำงานจันทร์ถึงเสาร์ หยุดเฉพาะวันอาทิตย์
     * ซึ่งเป็นรูปแบบที่ใช้จริงในโรงงานและคลังสินค้าจำนวนมาก
     * และทำให้ทดสอบการลงเวลาในวันเสาร์ได้ด้วย
     */
    const HOLIDAY_DAYS = ["อาทิตย์"];
    const WORK_DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

    for (const day of HOLIDAY_DAYS) {
      const toggle = page
        .locator("label")
        .filter({ hasText: new RegExp(`^${day}$`) })
        .locator("input[type='checkbox']")
        .first();
      if (!(await toggle.isChecked())) {
        await toggle.check();
      }
    }

    for (const day of WORK_DAYS) {
      const toggle = page
        .locator("label")
        .filter({ hasText: new RegExp(`^${day}$`) })
        .locator("input[type='checkbox']")
        .first();
      if (await toggle.isChecked()) {
        await toggle.uncheck();
      }
    }

    await page
      .getByRole("button", { name: /บันทึกวันหยุดประจำสัปดาห์/ })
      .click();
    await expectNotice(page, /บันทึกวันหยุดประจำสัปดาห์เรียบร้อยแล้ว/);

    await page.screenshot({ path: shot("p2c-01-weekly"), fullPage: true });
  });

  test("นำเข้าวันหยุดนักขัตฤกษ์ของปีเข้าปฏิทินบริษัท", async ({ page }) => {
    await openHolidayCalendar(page);

    await page.getByRole("button", { name: /นำเข้าวันหยุดฟรี/ }).click();
    await page.waitForTimeout(1500);

    await page.getByRole("button", { name: /ดึงข้อมูลฟรี/ }).click();
    // ดึงจากแหล่งข้อมูลภายนอก จึงเผื่อเวลาไว้มากกว่าปกติ
    await expect(page.getByRole("button", { name: /เลือกทั้งหมด/ })).toBeVisible(
      { timeout: 60_000 },
    );

    await page.getByRole("button", { name: /เลือกทั้งหมด/ }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: shot("p2c-02-import-preview"), fullPage: true });

    /*
     * ถ้าเคยนำเข้าไปแล้วจะไม่มีรายการใหม่ ปุ่มบันทึกจะกดไม่ได้
     * ถือว่าผ่านขั้นนี้แล้ว ไม่ใช่ความล้มเหลว เทสจึงรันซ้ำได้
     */
    const saveButton = page.getByRole("button", {
      name: /บันทึกเข้าปฏิทินบริษัท/,
    });

    if (await saveButton.isEnabled()) {
      await saveButton.click();
      // บันทึกทีละรายการ 20 กว่ารายการ จึงช้ากว่าฟอร์มทั่วไปมาก
      await expect(
        page.getByRole("heading", { name: /นำเข้าวันหยุดนักขัตฤกษ์ไทย/ }),
      ).toBeHidden({ timeout: 180_000 });
    } else {
      await page.getByRole("button", { name: "ปิด" }).first().click();
    }

    await page.waitForTimeout(3000);

    /*
     * ผลลัพธ์ที่ต้องได้คือวันหยุดอยู่ในปฏิทินจริง ไม่ใช่แค่ข้อความแจ้งเตือน
     * ปฏิทินเปิดมาที่เดือนปัจจุบัน ต้องสลับเป็นมุมมองทั้งปีก่อนจึงจะเห็นสงกรานต์
     */
    await page.getByRole("button", { name: "ทั้งปี" }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: shot("p2c-03b-year-view"), fullPage: true });

    // มุมมองทั้งปีบอกแค่จำนวน ต้องกดเข้าเดือนถึงจะเห็นชื่อวันหยุด
    await page.getByText("เมษายน", { exact: true }).first().click();
    await page.waitForTimeout(3000);

    await expect(page.getByText(/สงกรานต์/).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({ path: shot("p2c-03-imported"), fullPage: true });
  });

  test("เพิ่มวันหยุดบริษัทเองได้", async ({ page }) => {
    await openHolidayCalendar(page);

    await page.getByRole("button", { name: /^เพิ่มวันหยุด$/ }).first().click();
    await page.waitForTimeout(1500);

    await page.locator("input[type='date']").first().fill(COMPANY_HOLIDAY.date);
    await page.getByPlaceholder("ชื่อวันหยุด").fill(COMPANY_HOLIDAY.name);

    await page
      .getByRole("button", { name: /^เพิ่มวันหยุด$/ })
      .last()
      .click();
    await expectNotice(page, /บันทึกวันหยุดลงตารางจริงแล้ว/);

    await expect(page.getByText(COMPANY_HOLIDAY.name).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p2c-04-company-holiday"), fullPage: true });
  });
});
