import { expect, test, type Page } from "@playwright/test";

import { STATE_COMPANY_ADMIN, fieldByLabel, shot } from "./_shared";

/**
 * เฟส 2h — เปิดใช้ประเภทการลาและตั้งโควตา
 * -----------------------------------------------------------------------------
 * ระบบมีแค็ตตาล็อกประเภทการลากลาง 15 ประเภท แต่บริษัทต้อง "เปิดใช้" เอง
 * ถ้าไม่เปิด พนักงานจะเห็น "ประเภทลา 0 ประเภท" และยื่นใบลาไม่ได้เลย
 *
 * เฟสนี้แยกออกมาทำทีหลัง เพราะตอนทดสอบเฟส 2 รอบแรก ผู้ดูแลยังมีขอบเขต
 * ระดับสาขา แผงนี้จึงเป็น "ดูอย่างเดียว" ตามกติกาที่ว่าสิทธิ์ลาต้องเป็น
 * มาตรฐานเดียวทั้งบริษัท หลังยกเป็นระดับบริษัทในเฟส 1d จึงตั้งค่าได้
 */

/*
 * ชื่อต้องตรงกับแค็ตตาล็อกกลางเป๊ะ ไม่ใช่ชื่อที่คนทั่วไปเรียก
 * เช่นในระบบไม่มีคำว่า "ลาป่วย" เฉยๆ มีแต่ "ลาป่วยมีใบรับรองแพทย์"
 * สามประเภทนี้คือชุดขั้นต่ำที่บริษัทต้องมีตามกฎหมายคุ้มครองแรงงาน
 */
const LEAVE_TYPES = [
  "ลาพักร้อน",
  "ลากิจได้รับค่าจ้าง",
  "ลาป่วยมีใบรับรองแพทย์",
];

async function openLeavePolicies(page: Page) {
  await page.goto("/settings/work-policies");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: "นโยบายการทำงาน" }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(8_000);

  await page.getByText("การลา", { exact: true }).first().click();

  /*
   * ต้องรอให้แค็ตตาล็อกโหลดเสร็จจริง ไม่ใช่รอเวลาตายตัว
   * หน้านี้ดึงประเภทลา นโยบาย และโควตาพร้อมกัน บางครั้งใช้เวลาเกิน 10 วินาที
   * ถ้าไม่รอ จะหาสวิตช์ไม่เจอแล้วรายงานผิดว่าไม่มีประเภทลานั้นในระบบ
   */
  await expect(
    page.getByRole("button", { name: /^(เปิดใช้|ปิดใช้)$/ }).first(),
  ).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(3000);
}

test.describe("เฟส 2h · ประเภทการลาและโควตา", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("ผู้ดูแลระดับบริษัทต้องแก้ไขนโยบายการลาได้ ไม่ใช่ดูอย่างเดียว", async ({
    page,
  }) => {
    await openLeavePolicies(page);

    /*
     * ถ้ายังขึ้น "ดูอย่างเดียว" แปลว่าขอบเขตสิทธิ์ยังเป็นระดับสาขาอยู่
     * ซึ่งจะทำให้ตั้งประเภทการลาไม่ได้ทั้งบริษัท
     */
    const toggles = page.getByRole("button", { name: /เปิดใช้|ปิดใช้/ });
    await expect(toggles.first()).toBeEnabled({ timeout: 30_000 });

    await page.screenshot({ path: shot("p2h-01-leave-panel"), fullPage: true });
  });

  test("เปิดใช้ประเภทการลาที่บริษัทต้องมีตามกฎหมาย", async ({ page }) => {
    test.setTimeout(400_000);
    await openLeavePolicies(page);

    for (const name of LEAVE_TYPES) {
      /*
       * แถวในแค็ตตาล็อกขึ้นต้นด้วยเลขลำดับ เช่น "06ลาพักร้อน Annual Leave"
       * จึงห้ามยึด ^ กับชื่อ ต้องหาแบบ "มีข้อความนี้อยู่"
       * และต้องจับแถวที่มีสวิตช์อยู่ด้วย ไม่งั้นจะได้ span ของชื่อที่ไม่มีปุ่ม
       */
      const row = page
        .locator("div")
        .filter({ hasText: name })
        .filter({
          has: page.getByRole("button", { name: /^(เปิดใช้|ปิดใช้)$/ }),
        })
        .last();

      const enableToggle = row.getByRole("button", { name: "เปิดใช้" });
      const disableToggle = row.getByRole("button", { name: "ปิดใช้" });

      if ((await enableToggle.count()) > 0) {
        await enableToggle.first().click();
        await page.waitForTimeout(3500);
      } else if ((await disableToggle.count()) === 0) {
        /*
         * ห้ามข้ามเงียบ ไม่งั้นเทสจะผ่านทั้งที่ไม่ได้เปิดใช้อะไรเลย
         * ซึ่งเคยเกิดมาแล้ว: ผ่านเขียวแต่ฐานข้อมูลมีประเภทลาแค่ 1 จาก 3
         */
        throw new Error(`หาสวิตช์เปิด/ปิดของ "${name}" ไม่เจอในแค็ตตาล็อก`);
      }
    }

    // ต้องเปิดครบทุกประเภทจริง ตรวจจากตัวนับบนหัวตาราง
    await expect(
      page.getByText(new RegExp(`เปิดใช้ ${LEAVE_TYPES.length}`)),
    ).toBeVisible({ timeout: 30_000 });

    await page.screenshot({ path: shot("p2h-02-enabled"), fullPage: true });
  });

  test("ลาป่วยต้องยื่นย้อนหลังได้ ไม่งั้นคนป่วยยื่นลาไม่ได้เลย", async ({
    page,
  }) => {
    test.setTimeout(400_000);
    await openLeavePolicies(page);

    /*
     * ค่าเริ่มต้นของทุกประเภทลาคือ "ลาย้อนหลัง 0 วัน" = ย้อนหลังไม่ได้
     * ซึ่งใช้กับลาป่วยไม่ได้จริง เพราะไม่มีใครรู้ล่วงหน้าว่าจะป่วย
     * ถ้าไม่ตั้ง ระบบจะตอบ "ประเภทลานี้ยังไม่อนุญาตให้ลาย้อนหลัง" ทันทีที่ยื่น
     *
     * ตั้งไว้ 7 วันตามที่บริษัททั่วไปใช้ (ยื่นพร้อมใบรับรองแพทย์ภายในสัปดาห์)
     */
    await page.getByText("ลาป่วยมีใบรับรองแพทย์").first().click();
    await page.waitForTimeout(4000);

    const backdatedField = fieldByLabel(page, "ลาย้อนหลัง", "input");
    await expect(backdatedField).toBeVisible({ timeout: 30_000 });

    const current = await backdatedField.inputValue();
    if (current !== "7") {
      await backdatedField.fill("7");
      await page.waitForTimeout(1500);

      const saveButton = page.getByRole("button", {
        name: "บันทึก",
        exact: true,
      });
      await expect(saveButton).toBeEnabled({ timeout: 30_000 });
      await saveButton.click();
      await page.waitForTimeout(5000);
    }

    await expect(backdatedField).toHaveValue("7", { timeout: 30_000 });
    await page.screenshot({ path: shot("p2h-04-backdated"), fullPage: true });
  });

  test("ลาป่วยต้องนับอายุงานจากวันเริ่มงาน ไม่ใช่วันบรรจุ", async ({ page }) => {
    test.setTimeout(400_000);
    await openLeavePolicies(page);

    /*
     * ค่าตั้งต้นของลาป่วยคือ "นับอายุงานจากวันที่บรรจุ" ซึ่งทำให้คนที่ยัง
     * ไม่ผ่านทดลองงานลาป่วยไม่ได้เลย ระบบตอบว่า
     * "ลาป่วยมีใบรับรองแพทย์ ใช้สิทธิ์ได้เมื่อผ่านการบรรจุแล้วเท่านั้น"
     *
     * ขัดกับ พ.ร.บ.คุ้มครองแรงงาน ม.32 ที่ให้ลาป่วยได้เท่าที่ป่วยจริง
     * ตั้งแต่วันแรกของการทำงาน ไม่มีเงื่อนไขว่าต้องผ่านทดลองงานก่อน
     * (ต่างจากลาพักร้อน ม.30 ที่ต้องทำงานครบหนึ่งปีจริง)
     */
    await page.getByText("ลาป่วยมีใบรับรองแพทย์").first().click();
    await page.waitForTimeout(4000);

    const basisField = fieldByLabel(page, "นับอายุงานจาก", "select");
    await expect(basisField).toBeVisible({ timeout: 30_000 });

    if ((await basisField.inputValue()) !== "HIRE_DATE") {
      await basisField.selectOption("HIRE_DATE");
      await page.waitForTimeout(1500);

      const saveButton = page.getByRole("button", {
        name: "บันทึก",
        exact: true,
      });
      await expect(saveButton).toBeEnabled({ timeout: 30_000 });
      await saveButton.click();
      await page.waitForTimeout(5000);
    }

    await expect(basisField).toHaveValue("HIRE_DATE", { timeout: 30_000 });
    await page.screenshot({ path: shot("p2h-05-service-basis"), fullPage: true });
  });

  test("พนักงานต้องเห็นประเภทการลาที่เปิดใช้แล้ว", async ({ page }) => {
    await openLeavePolicies(page);

    /*
     * ยืนยันจากหน้าตั้งค่าเองก่อนว่ามีประเภทที่เปิดใช้จริง
     * ส่วนฝั่งพนักงานจะถูกตรวจอีกครั้งในเฟส 5b ตอนยื่นใบลา
     */
    for (const name of LEAVE_TYPES) {
      await expect(page.getByText(name).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.screenshot({ path: shot("p2h-03-verified"), fullPage: true });
  });
});
