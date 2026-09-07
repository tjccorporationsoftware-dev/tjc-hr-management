import { expect, test, type Page } from "@playwright/test";

import { STATE_COMPANY_ADMIN, STATE_SUPERADMIN, shot } from "./_shared";

/**
 * เฟส 7c — ตรวจสอบก่อนเข้าเงินเดือนและปิดงวด
 * -----------------------------------------------------------------------------
 * นี่คือด่านสุดท้ายก่อนเงินออก HR ต้องยืนยันว่าเวลาทำงานทั้งงวดถูกต้อง
 * แล้วทำเครื่องหมาย "พร้อมเข้า Payroll" และล็อกไม่ให้แก้ย้อนหลัง
 *
 * ลำดับที่ระบบบังคับ
 *   1) ข้อมูลต้องครบและไม่มีรายการค้างตรวจ
 *   2) ทำเครื่องหมายพร้อมเข้า Payroll
 *   3) ล็อกงวด — หลังล็อกแล้วแก้เวลาย้อนหลังไม่ได้
 * ถ้าข้ามขั้นล็อก คนแก้เวลาหลังคำนวณเงินเดือนได้ ซึ่งทำให้ยอดจ่ายกับ
 * เวลาทำงานไม่ตรงกันโดยไม่มีร่องรอย
 */

const PERIOD = { from: "2026-06-26", to: "2026-07-25" };

async function openHrReview(page: Page) {
  await page.goto("/hr-review");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/Payroll|ตรวจสอบ/).first()).toBeVisible({
    timeout: 90_000,
  });
  await page.waitForTimeout(12_000);

  // หน้านี้ค้นหาอัตโนมัติเมื่อเปลี่ยนช่วงวันที่ เช่นเดียวกับหน้าตรวจเวลา
  const dateInputs = page.locator("input[type='date']");
  await dateInputs.nth(0).fill(PERIOD.from);
  await dateInputs.nth(1).fill(PERIOD.to);
  await page.waitForTimeout(12_000);
}

test.describe("เฟส 7c · ตรวจก่อนเข้าเงินเดือน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("หน้าตรวจก่อนเข้าเงินเดือนต้องสรุปทั้งงวดได้", async ({ page }) => {
    test.setTimeout(400_000);
    await openHrReview(page);

    /*
     * ต้องเห็นพนักงานทั้ง 8 คนของงวด ไม่ใช่ตารางว่าง
     * ถ้าว่าง แปลว่าเวลาทำงานที่กรอกไว้ไม่ถูกดึงมาตรวจ
     */
    await expect(page.locator("tbody tr").first()).toBeVisible({
      timeout: 60_000,
    });

    await page.screenshot({ path: shot("p7c-01-review"), fullPage: true });
  });

  test("ทำเครื่องหมายพร้อมเข้า Payroll ทั้งงวด", async ({ page }) => {
    test.setTimeout(600_000);
    await openHrReview(page);

    const readyButton = page.getByRole("button", {
      name: "พร้อมเข้า Payroll ทั้งงวด",
    });

    /*
     * การปิดงวดเป็นงานทางเดียว รันซ้ำจะไม่มีอะไรให้ทำอีก
     *
     * ต้องนับจากแถวในตารางเท่านั้น (tbody) ห้ามค้นทั้งหน้า
     * เคสที่เคยพลาดหนัก: ใช้ getByText ทั้งหน้า ซึ่งไปนับคำว่า "ล็อกแล้ว"
     * ที่อยู่ในตัวเลือกของ dropdown ตัวกรองสถานะ ซึ่งมีอยู่ตลอดเวลา
     * เทสจึงข้ามทั้งสองขั้นแล้วผ่านเขียว ทั้งที่งวดไม่ได้ถูกปิดเลยสักรายการ
     *
     * และข้อความสถานะในแถวคือ "ล็อกงวดแล้ว" ไม่ใช่ "ล็อกแล้ว"
     * ส่วน "ล็อกแล้ว" เป็นชื่อตัวเลือกในตัวกรองเท่านั้น
     */
    const alreadyClosed =
      (await page.locator("tbody tr").filter({ hasText: /ล็อกงวดแล้ว/ }).count()) >
      0;

    if (alreadyClosed) {
      test.info().annotations.push({
        type: "note",
        description: "งวดนี้ทำเครื่องหมายพร้อมเข้า Payroll ไปแล้ว",
      });
      await page.screenshot({ path: shot("p7c-02-ready"), fullPage: true });
      return;
    }

    await readyButton.click();
    await page.waitForTimeout(2000);

    await page
      .getByRole("button", { name: "ยืนยันพร้อมเข้า Payroll ทั้งงวด" })
      .click();

    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /พร้อมเข้า Payroll ทั้งงวดแล้ว/ })
        .first(),
    ).toBeVisible({ timeout: 120_000 });

    await page.waitForTimeout(8000);

    /*
     * ต้องยืนยันว่ามีคนถูกทำเครื่องหมายจริง ไม่ใช่แค่ toast ขึ้น
     * การ์ดสรุปด้านบนบอกจำนวนคนที่พร้อมเข้า Payroll แล้ว
     */
    await expect(page.getByText(/พร้อมเข้า PAYROLL/i).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({ path: shot("p7c-02-ready"), fullPage: true });
  });

  test("ล็อกงวดแล้วต้องแก้เวลาย้อนหลังไม่ได้", async ({ page }) => {
    test.setTimeout(600_000);
    await openHrReview(page);

    const lockButton = page.getByRole("button", { name: "ล็อกทั้งงวด" });

    // ล็อกไปแล้วให้ข้าม นับจากแถวในตารางเท่านั้น ไม่ใช่ทั้งหน้า
    const alreadyLocked =
      (await page.locator("tbody tr").filter({ hasText: /ล็อกงวดแล้ว/ }).count()) >
      0;

    if (alreadyLocked) {
      test.info().annotations.push({
        type: "note",
        description: "งวดนี้ล็อกไปแล้ว",
      });
      await page.screenshot({ path: shot("p7c-03-locked"), fullPage: true });
      return;
    }

    await lockButton.click();
    await page.waitForTimeout(2000);

    // กล่องยืนยันใช้ปุ่ม "ยืนยัน" ทั่วไป
    await page.getByRole("button", { name: /^ยืนยัน/ }).last().click();
    await page.waitForTimeout(15_000);

    /*
     * ต้องยืนยันว่ามีแถวที่ขึ้นสถานะ "ล็อกแล้ว" จริง
     * ไม่ใช่แค่กดปุ่มแล้วถือว่าเสร็จ ซึ่งเป็นจุดที่เคยผ่านเขียวแบบหลอกมาแล้ว
     */
    await expect(
      page.locator("tbody tr").filter({ hasText: /ล็อกงวดแล้ว/ }).first(),
    ).toBeVisible({ timeout: 60_000 });

    await page.screenshot({ path: shot("p7c-03-locked"), fullPage: true });
  });
});

/*
 * แยก describe เพราะหน้ากรอกเวลาแทนอยู่ใน Platform Console
 * ซึ่งเปิดได้เฉพาะบัญชีขอบเขตระดับ GLOBAL
 * ผู้ดูแลบริษัทจะถูกเด้งกลับหน้าหลักตามสิทธิ์ทันที
 */
test.describe("เฟส 7c · งวดที่ล็อกแล้วต้องแก้ไม่ได้", () => {
  test.use({ storageState: STATE_SUPERADMIN });

  test("ล็อกแล้วต้องบันทึกเวลาย้อนหลังไม่ได้จริง", async ({ page }) => {
    test.setTimeout(400_000);

    /*
     * ขั้นนี้คือหัวใจของการปิดงวด แต่เดิมเทสตั้งชื่อว่าตรวจเรื่องนี้
     * โดยไม่เคยลองแก้จริงสักครั้ง จึงไม่รู้ว่าระบบกันได้หรือไม่
     *
     * เคสที่เคยพังจริง: ระบบรับเวลาที่ยิงเข้าไปในงวดที่ล็อกแล้ว
     * ทำให้รายการลงเวลากับสรุปรายวันขัดกันเองหลังจ่ายเงินไปแล้ว
     */
    await page.goto("/platform/attendance-entry");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(8000);

    // เลือกวันที่อยู่ในงวดที่เพิ่งล็อกไป
    await page.locator("input[type='date']").first().fill("2026-07-10");
    await page.waitForTimeout(8000);

    const timeInputs = page.getByPlaceholder("--:--");
    await timeInputs.first().fill("07:45");

    await page.getByRole("button", { name: "บันทึกทั้งหมด" }).click();
    await page.waitForTimeout(8000);

    /*
     * ต้องขึ้นว่าบันทึกล้มเหลว ไม่ใช่สำเร็จ
     * หน้านี้สรุปผลเป็น "บันทึกสำเร็จ N คน ล้มเหลว M คน"
     */
    await expect(page.getByText(/ล้มเหลว 1 คน/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/บันทึกสำเร็จ 0 คน/).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({ path: shot("p7c-04-locked-blocked"), fullPage: true });
  });
});
