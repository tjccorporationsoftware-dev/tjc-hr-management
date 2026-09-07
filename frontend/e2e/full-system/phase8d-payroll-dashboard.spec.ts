import { expect, test } from "@playwright/test";

import { STATE_PAYROLL, shot } from "./_shared";

/**
 * เฟส 8d — Dashboard เงินเดือน
 * -----------------------------------------------------------------------------
 * หน้านี้เป็นที่แรกที่ฝ่ายบัญชีเปิดดูตอนเช้า ถ้าตัวเลขไม่ตรงกับความจริง
 * จะไม่มีใครรู้ว่ามีอะไรค้างจนกว่าจะถึงวันจ่ายเงิน
 *
 * เคสที่เจอจริงในเฟสนี้: หน้างวดเงินเดือนขึ้นการ์ดสรุปเป็น 0 ทุกช่อง
 * ทั้งที่มีงวดอยู่จริง เพราะตัวเรียก API ทิ้งข้อมูลสรุปที่หลังบ้านส่งมา
 * จึงต้องตรวจว่า Dashboard นี้ไม่เป็นแบบเดียวกัน
 */

const RUN_NAME = "รอบคำนวณเงินเดือน 07/2569";

test.describe("เฟส 8d · Dashboard เงินเดือน", () => {
  test.use({ storageState: STATE_PAYROLL });

  test("Dashboard ต้องสะท้อนรอบที่จ่ายไปแล้ว ไม่ใช่ศูนย์ทั้งหน้า", async ({
    page,
  }) => {
    test.setTimeout(400_000);

    await page.goto("/payroll");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/เงินเดือน/).first()).toBeVisible({
      timeout: 90_000,
    });
    await page.waitForTimeout(15_000);

    await expect(page.locator("body")).not.toContainText(
      "โหลด Dashboard เงินเดือนไม่สำเร็จ",
    );

    /*
     * ต้องเห็น Run ล่าสุดเป็นรอบที่เพิ่งจ่ายไป
     * ถ้าขึ้นว่ายังไม่มี Payroll Run แปลว่า Dashboard ไม่ได้ดึงข้อมูลจริง
     */
    await expect(page.locator("body")).not.toContainText("ยังไม่มี Payroll Run");
    await expect(page.getByText(RUN_NAME).first()).toBeVisible({
      timeout: 60_000,
    });

    /*
     * ยอดสุทธิรวมต้องเป็นตัวเลขที่มีหลักพันขึ้นไป ไม่ใช่ 0
     * ผูกแบบมีเครื่องหมายคั่นหลักพันเพื่อกันเคสที่การ์ดขึ้น "0.00"
     */
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/\d{1,3}(,\d{3})+/);

    await page.screenshot({ path: shot("p8d-01-dashboard"), fullPage: true });
  });
});
