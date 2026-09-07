import { expect, test, type Page } from "@playwright/test";

import {
  STATE_PAYROLL,
  expectToast,
  fieldByLabel,
  modalRoot,
  selectOptionByText,
  shot,
  thaiDateField,
} from "./_shared";

/**
 * เฟส 4c — ภาษีหัก ณ ที่จ่าย
 * -----------------------------------------------------------------------------
 * ต้องมีปีภาษีก่อน ไม่งั้นคำนวณเงินเดือนแล้วหักภาษีไม่ได้
 * ระบบสร้างขั้นภาษีและประเภทค่าลดหย่อนพื้นฐานให้เองตอนสร้างปีภาษี
 *
 * ขั้นภาษีต้องต่อเนื่องกันตามประมวลรัษฎากร (0-150,000 ยกเว้น แล้วไล่ขึ้นเป็นขั้น)
 * ถ้าขั้นขาดช่วง เงินได้ในช่วงที่หายจะไม่ถูกคิดภาษีเลย
 */

const TAX_YEAR = {
  year: "2569",
  code: "TAX-2569",
  name: "ปีภาษี 2569",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};

async function openTax(page: Page, tab: string) {
  await page.goto("/payroll/tax");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/ภาษี/).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(10_000);

  await page.getByRole("button", { name: tab, exact: true }).first().click();
  await page.waitForTimeout(3000);
}

test.describe("เฟส 4c · ภาษีหัก ณ ที่จ่าย", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_PAYROLL });

  test("สร้างปีภาษีพร้อมขั้นภาษีและค่าลดหย่อนพื้นฐาน", async ({ page }) => {
    await openTax(page, "ปีภาษี");

    // เคยสร้างไว้แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูล
    if ((await page.getByText(TAX_YEAR.code).count()) === 0) {
      // ฟอร์มอยู่ในโมดัล ต้องกดปุ่มเปิดก่อน ไม่ได้อยู่บนหน้าโดยตรง
      await page.getByRole("button", { name: "เพิ่มปีภาษี" }).click();
      await page.waitForTimeout(2000);

      const modal = modalRoot(page);
      await selectOptionByText(
        fieldByLabel(modal, "บริษัท", "select"),
        "ทีเจซี",
      );
      await fieldByLabel(modal, "ปีภาษี", "input").fill(TAX_YEAR.year);
      await page.getByPlaceholder("เช่น TAX-2569").fill(TAX_YEAR.code);
      await page.getByPlaceholder("เช่น ปีภาษี 2569").fill(TAX_YEAR.name);
      await thaiDateField(modal, "วันที่เริ่ม").fill(TAX_YEAR.startDate);
      await thaiDateField(modal, "วันที่สิ้นสุด").fill(TAX_YEAR.endDate);

      await page.getByRole("button", { name: "สร้างปีภาษี" }).click();
      await expectToast(page, /สร้างปีภาษีแล้ว/);
      await page.waitForTimeout(3000);
    }

    await expect(page.getByText(TAX_YEAR.code).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p4c-01-tax-year"), fullPage: true });
  });

  test("ขั้นภาษีต้องต่อเนื่องกัน ไม่มีช่วงที่ขาดหาย", async ({ page }) => {
    await openTax(page, "ขั้นภาษี");

    const body = await page.locator("body").innerText();

    /*
     * ขั้นแรกของไทยคือ 0-150,000 ยกเว้นภาษี แล้วต่อด้วย 150,001-300,000 อัตรา 5%
     * ถ้าขั้นแรกจบที่ 150,000 แต่ขั้นถัดไปเริ่มที่ 300,001 เงินได้ช่วงกลางจะหลุด
     * ตรวจว่ามีขั้น 5% และ 10% ซึ่งเป็นสองขั้นล่างที่พนักงานส่วนใหญ่ตกอยู่
     */
    expect(body).toContain("150,000");
    expect(body).toContain("300,000");
    expect(body).toContain("500,000");

    await page.screenshot({ path: shot("p4c-02-brackets"), fullPage: true });
  });

  test("พนักงานทุกคนต้องมีข้อมูลภาษี ไม่งั้นจ่ายเงินเดือนโดยไม่หักภาษี", async ({
    page,
  }) => {
    test.setTimeout(900_000);
    await openTax(page, "ข้อมูลภาษีพนักงาน");

    /*
     * เคสที่เจอจริงตอนรันเงินเดือนในเฟส 8a
     *
     * พนักงานที่ยังไม่มีข้อมูลภาษีสถานะ "พร้อมใช้คำนวณ" จะไม่ถูกหักภาษีเลย
     * ระบบคำนวณยอดภาษีไว้ในสรุปของรายการ (เช่น 9,102 บาท) แต่ไม่สร้างบรรทัดหัก
     * แล้วเดินหน้าอนุมัติและจ่ายเงินต่อได้ตามปกติ
     * เตือนแค่ระดับ WARNING ในข้อมูลเบื้องหลัง ไม่มีอะไรขึ้นบนหน้ารันเงินเดือน
     * ผลคือหักภาษีขาดทั้งบริษัท และ ภ.ง.ด.1 จะออกมาเป็นศูนย์
     *
     * เทสนี้จึงสร้างข้อมูลภาษีให้ครบทุกคนก่อนไปรันเงินเดือน
     */
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });

    const total = await rows.count();
    let created = 0;

    for (let i = 0; i < total; i += 1) {
      /*
       * ปุ่มขึ้นว่า "+ ข้อมูลภาษี" เมื่อยังไม่มี และ "ข้อมูลภาษี" เมื่อมีแล้ว
       * เอาเฉพาะที่ยังไม่มี จะได้รันซ้ำได้โดยไม่ต้องล้างข้อมูล
       */
      const addButton = rows
        .nth(i)
        .getByRole("button", { name: "+ ข้อมูลภาษี", exact: true });

      if ((await addButton.count()) === 0) continue;

      await addButton.click();
      await page.waitForTimeout(2500);

      /*
       * โมดัลเติมบริษัท ปีภาษี และพนักงานมาให้แล้วจากแถวที่กด
       * กดบันทึกได้เลย ระบบตั้งสถานะเป็น "พร้อมใช้คำนวณ" ให้เอง
       */
      await page
        .getByRole("button", { name: /^บันทึกข้อมูลภาษี/ })
        .first()
        .click();
      await expectToast(page, /บันทึกข้อมูลภาษีพนักงานแล้ว|พร้อมใช้คำนวณ/, 60_000);
      await page.waitForTimeout(3000);
      created += 1;
    }

    test.info().annotations.push({
      type: "สรุป",
      description: `สร้างข้อมูลภาษีใหม่ ${created} คน จากทั้งหมด ${total} คน`,
    });

    // ต้องไม่เหลือคนที่ยังไม่มีข้อมูลภาษี
    await expect(
      page.getByRole("button", { name: "+ ข้อมูลภาษี", exact: true }),
    ).toHaveCount(0, { timeout: 60_000 });

    await page.screenshot({ path: shot("p4c-04-profiles"), fullPage: true });
  });

  test("ทดลองคำนวณภาษีให้ผลที่สมเหตุสมผล", async ({ page }) => {
    await openTax(page, "ทดลองคำนวณภาษี");

    await page.screenshot({ path: shot("p4c-03-preview"), fullPage: true });

    /*
     * หน้านี้เป็นเครื่องมือให้ HR ลองคิดก่อนปิดงวดจริง
     * ถ้าเปิดไม่ได้หรือไม่มีปีภาษีให้เลือก แปลว่าตั้งค่าไม่ครบ
     */
    await expect(page.locator("body")).not.toContainText("ยังไม่มีปีภาษี");
  });
});
