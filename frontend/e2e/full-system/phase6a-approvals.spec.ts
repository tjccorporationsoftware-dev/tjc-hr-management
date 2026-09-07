import { expect, test, type Page } from "@playwright/test";

import { STATE_PAYROLL, selectOptionByText, shot } from "./_shared";

/**
 * เฟส 6a — ศูนย์อนุมัติคำขอ
 * -----------------------------------------------------------------------------
 * ใบลาที่กมลยื่นในเฟส 5b รออยู่ที่ "หัวหน้าอนุมัติ" ซึ่งคือปิยะ
 * ปิยะมีสิทธิ์ครบทั้ง APPROVAL_ACCESS, LEAVE_APPROVE, OT_APPROVE,
 * TIME_ADJUST_APPROVE, OFFSITE_REQUEST_APPROVE และ DOCUMENT_APPROVE
 *
 * หมายเหตุขอบเขต: เมนูของหัวหน้างาน (/manager/*) ถูกคอมเมนต์ไว้ในระบบ
 * จึงอยู่นอกขอบเขตทดสอบ ศูนย์อนุมัติที่เปิดใช้จริงคือ /approvals
 */

async function openApprovals(page: Page) {
  await page.goto("/approvals");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/อนุมัติ/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(10_000);
}

test.describe("เฟส 6a · อนุมัติคำขอ", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_PAYROLL });

  test("ศูนย์อนุมัติต้องเห็นใบลาของลูกทีม", async ({ page }) => {
    await openApprovals(page);

    /*
     * ถ้าไม่เห็น แปลว่าสายอนุมัติไม่ได้ส่งเรื่องมาถึงคนที่ควรอนุมัติ
     * ซึ่งคำขอจะค้างในระบบตลอดไปโดยไม่มีใครรู้
     *
     * หน้านี้เปิดมาที่ตัวกรอง "รออนุมัติ" ถ้ารันซ้ำหลังอนุมัติไปแล้ว
     * จะไม่มีรายการค้าง จึงต้องสลับไปดูสถานะที่อนุมัติแล้วแทน
     */
    const requestNo = page.getByText(/LV-\d{8}-\d{4}/);

    if ((await requestNo.count()) === 0) {
      await selectOptionByText(
        page.locator("select").filter({ hasText: /รออนุมัติ/ }).first(),
        "อนุมัติแล้ว",
      );
      await page.waitForTimeout(4000);
    }

    await expect(requestNo.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("กมล").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({ path: shot("p6a-01-pending"), fullPage: true });
  });

  test("อนุมัติใบลาแล้วสถานะต้องเปลี่ยนทั้งฝั่งอนุมัติและฝั่งพนักงาน", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openApprovals(page);

    const row = page
      .locator("tbody tr")
      .filter({ hasText: /LV-\d{8}-\d{4}/ })
      .first();

    // เคยอนุมัติไปแล้วจะไม่มีคำขอค้าง เทสจึงรันซ้ำได้
    if ((await row.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "ไม่มีคำขอค้างอยู่แล้ว ข้ามการอนุมัติซ้ำ",
      });
      return;
    }

    /*
     * ปุ่มอนุมัติอยู่ในแถวโดยตรง ("จัดการ" เป็นชื่อคอลัมน์ ไม่ใช่ปุ่ม)
     * กดแล้วจะขึ้นกล่องยืนยันที่มีปุ่มชื่อเดียวกันอีกใบ
     */
    await row.getByRole("button", { name: "อนุมัติ", exact: true }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: shot("p6a-02-confirm"), fullPage: true });

    await page.getByRole("button", { name: "อนุมัติ", exact: true }).last().click();
    await page.waitForTimeout(5000);

    /*
     * ยืนยันที่ผลลัพธ์ ไม่ใช่ที่ toast
     * toast หายเองใน ~4 วินาที และหน้าโหลดรายการใหม่ทันทีหลังอนุมัติ
     * ถ้าไปผูกกับ toast เทสจะล้มเป็นครั้งคราวทั้งที่ระบบทำงานถูก
     */
    await expect(
      page.locator("tbody tr").filter({ hasText: /LV-\d{8}-\d{4}/ }),
    ).toHaveCount(0, { timeout: 30_000 });

    await page.screenshot({ path: shot("p6a-03-approved"), fullPage: true });
  });

  test("ประวัติคำขอของ HR ต้องบันทึกผลการอนุมัติไว้", async ({ page }) => {
    await page.goto("/hr/requests");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(10_000);

    /*
     * หน้านี้คือร่องรอยตรวจสอบย้อนหลังว่าใครลาอะไรและผลเป็นอย่างไร
     * ถ้าไม่มีข้อมูล จะตรวจสอบไม่ได้เวลามีข้อพิพาทเรื่องวันลา
     *
     * หน้านี้ไม่ได้แสดงเลขที่คำขอ แต่แสดงรหัสพนักงานกับสถานะแทน
     */
    const row = page.locator("tbody tr").filter({ hasText: "EMP-0004" }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText("อนุมัติแล้ว");
    await expect(row).toContainText("ลากิจได้รับค่าจ้าง");

    await page.screenshot({ path: shot("p6a-04-history"), fullPage: true });
  });
});
