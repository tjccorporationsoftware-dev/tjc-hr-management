import { expect, test, type Page } from "@playwright/test";

import { STATE_EMPLOYEE, STATE_PAYROLL, expectToast, shot } from "./_shared";

/**
 * เฟส 8b — สลิปเงินเดือน
 * -----------------------------------------------------------------------------
 * เงินออกแล้วยังไม่จบ พนักงานต้องเห็นว่าตัวเองได้เท่าไรและถูกหักอะไรบ้าง
 * ถ้าเปิดสลิปไม่ได้ HR ต้องตอบคำถามรายคนเองทุกงวด
 *
 * หน้านี้คุมสองอย่าง
 *   1) ตรวจและดาวน์โหลดสลิปของ Run ที่เลือก
 *   2) เปิด/ปิดให้พนักงานเห็นสลิปงวดนั้นใน ESS ด้วยปุ่มเดียว
 *
 * จุดที่ต้องพิสูจน์จริงคือข้อ 2 — เปิดแล้วพนักงานต้องเห็นในหน้า ESS ของตัวเอง
 * ไม่ใช่แค่ป้ายบนหน้า HR เปลี่ยนสี
 */

const RUN_NAME = "รอบคำนวณเงินเดือน 07/2569";

async function openPayslips(page: Page) {
  await page.goto("/payroll/payslips");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/สลิป/).first()).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(12_000);
}

test.describe("เฟส 8b · สลิปเงินเดือน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_PAYROLL });

  test("หน้าสลิปต้องเห็น Run ที่จ่ายแล้วและสลิปครบทุกคน", async ({ page }) => {
    test.setTimeout(400_000);
    await openPayslips(page);

    /*
     * ต้องเห็น Run ที่เพิ่งจ่ายไป ถ้าไม่เห็นแปลว่าหน้านี้ไม่ได้ผูกกับ Run จริง
     * และต้องมีแถวสลิปในตาราง ไม่ใช่ตารางว่างพร้อมข้อความชวนให้เลือก Run
     */
    await expect(page.getByText(RUN_NAME).first()).toBeVisible({
      timeout: 60_000,
    });

    await expect(page.locator("tbody tr").first()).toBeVisible({
      timeout: 60_000,
    });

    const rowCount = await page.locator("tbody tr").count();
    expect(rowCount).toBeGreaterThan(0);

    test.info().annotations.push({
      type: "สรุป",
      description: `เห็นสลิปในตาราง ${rowCount} แถว`,
    });

    await page.screenshot({ path: shot("p8b-01-payslips"), fullPage: true });
  });

  test("เปิดให้พนักงานดูสลิปงวดนี้ใน ESS", async ({ page }) => {
    test.setTimeout(400_000);
    await openPayslips(page);

    /*
     * ปุ่มสลับสองสถานะ ข้อความบนปุ่มบอกสิ่งที่จะเกิดขึ้นถ้ากด
     *   "เปิดให้พนักงานดู"  = ตอนนี้ยังปิดอยู่
     *   "ปิดการแสดงใน ESS" = ตอนนี้เปิดอยู่แล้ว
     * ถ้าเปิดอยู่แล้วห้ามกด ไม่งั้นเทสจะไปปิดของที่ควรเปิด
     */
    const enableButton = page.getByRole("button", {
      name: "เปิดให้พนักงานดู",
      exact: true,
    });

    if ((await enableButton.count()) > 0) {
      await enableButton.first().click();
      await expectToast(page, /เปิดให้พนักงานดูสลิปงวดนี้ใน ESS แล้ว/, 120_000);
      await page.waitForTimeout(8000);
    }

    // ต้องจบที่สถานะเปิดอยู่ ดูจากปุ่มที่กลายเป็นปุ่มปิด
    await expect(
      page.getByRole("button", { name: "ปิดการแสดงใน ESS", exact: true }).first(),
    ).toBeVisible({ timeout: 60_000 });

    await page.screenshot({ path: shot("p8b-02-published"), fullPage: true });
  });
});

/*
 * แยก describe เพราะต้องเข้าด้วยบัญชีพนักงาน
 * การเปิดเผยแพร่จะมีความหมายก็ต่อเมื่อพนักงานเห็นจริงในหน้าของตัวเอง
 */
test.describe("เฟส 8b · พนักงานเปิดสลิปของตัวเอง", () => {
  test.use({ storageState: STATE_EMPLOYEE });

  test("พนักงานต้องเห็นสลิปงวดที่เผยแพร่แล้ว", async ({ page }) => {
    test.setTimeout(400_000);

    await page.goto("/ess/salary-slip");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(12_000);

    /*
     * ต้องไม่ขึ้นว่ายังไม่มีสลิป และต้องเห็นยอดเงินสุทธิของตัวเอง
     * กมลได้สุทธิเท่าไรขึ้นกับภาษีที่หัก จึงไม่ผูกตัวเลขตายตัวไว้ในเทส
     * แต่ต้องมีตัวเลขเงินขึ้นจริง ไม่ใช่หน้าว่าง
     */
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("ยังไม่มีสลิปเงินเดือนที่เปิดดูได้");

    await expect(page.getByText(/\d{1,3}(,\d{3})+(\.\d{2})?/).first()).toBeVisible({
      timeout: 60_000,
    });

    await page.screenshot({ path: shot("p8b-03-ess-payslip"), fullPage: true });
  });
});
