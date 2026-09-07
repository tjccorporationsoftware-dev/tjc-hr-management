import { expect, test, type Page } from "@playwright/test";

import { STATE_COMPANY_ADMIN, shot } from "./_shared";

/**
 * เฟส 2i — เปิดใช้ประเภทวัน OT
 * -----------------------------------------------------------------------------
 * ระบบต้องมีนโยบาย OT ของบริษัทก่อน พนักงานจึงจะยื่นขอ OT ได้
 * ถ้าไม่มี API จะตอบ "ยังไม่พบนโยบาย OT สำหรับพนักงานคนนี้" ทันทีที่กดส่ง
 *
 * เฟสนี้แยกออกมาทำทีหลังด้วยเหตุผลเดียวกับเฟส 2h (ประเภทการลา)
 * คือตอนทดสอบเฟส 2 รอบแรก ผู้ดูแลยังมีขอบเขตระดับสาขา แผงนี้จึงเป็นดูอย่างเดียว
 * ตามกติกาที่ว่าอัตรา OT ต้องเป็นมาตรฐานเดียวทั้งบริษัท
 *
 * อัตราขั้นต่ำตามกฎหมายแรงงาน — วันทำงาน 1.5 เท่า วันหยุด 2 เท่า
 * ซึ่งหน้าจอเองก็เขียนกำกับไว้
 */

/*
 * ชื่อในแผงคือ "โอทีล่วงเวลา" / "โอทีวันหยุด" ไม่ใช่ "วันทำงาน" / "วันหยุด"
 * ซึ่งเป็นแค่คำอธิบายใต้ชื่อเท่านั้น
 */
const OT_TYPES = [
  { code: "OT-WD", name: "โอทีล่วงเวลา" },
  { code: "OT-HD", name: "โอทีวันหยุด" },
];

async function openOvertimePolicies(page: Page) {
  await page.goto("/settings/work-policies");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: "นโยบายการทำงาน" }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(8_000);

  await page.getByText("OT", { exact: true }).first().click();
  await page.waitForTimeout(5000);
}

test.describe("เฟส 2i · นโยบาย OT", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("ผู้ดูแลระดับบริษัทต้องแก้ไขอัตรา OT ได้", async ({ page }) => {
    await openOvertimePolicies(page);

    const toggles = page.getByRole("button", { name: /^(เปิดใช้|ปิดใช้)$/ });
    await expect(toggles.first()).toBeEnabled({ timeout: 30_000 });

    await page.screenshot({ path: shot("p2i-01-ot-panel"), fullPage: true });
  });

  test("เปิดใช้ประเภทวัน OT และเปิดให้ทุกประเภทพนักงานใช้ได้", async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await openOvertimePolicies(page);

    for (const { code, name } of OT_TYPES) {
      /*
       * แผงนี้มีสวิตช์สองชั้น
       *   ชั้นนอก  เปิดใช้ประเภทวัน OT (รายการทางซ้าย)
       *   ชั้นใน   เปิดให้แต่ละประเภทพนักงานใช้ได้ (ตารางทางขวา)
       * ถ้าเปิดแค่ชั้นนอก หน้าจอจะบอกเองว่า
       * "ประเภทที่ปิดไว้จะยื่นขอ OT ประเภทวันนี้ไม่ได้"
       */
      /*
       * อ้างด้วยรหัส (OT-WD / OT-HD) ไม่ใช่ชื่อ
       * เพราะชื่อในรายการมีป้ายอัตราต่อท้าย เช่น "โอทีวันหยุด ×2"
       * และ "โอทีวันหยุดพิเศษ" ก็มีคำว่า "โอทีวันหยุด" อยู่ข้างในด้วย
       */
      const row = page
        .locator("div")
        .filter({ hasText: code })
        .filter({
          has: page.getByRole("button", { name: /^(เปิดใช้|ปิดใช้)$/ }),
        })
        .last();

      const enableToggle = row.getByRole("button", { name: "เปิดใช้" });
      if ((await enableToggle.count()) > 0) {
        await enableToggle.first().click();
        await page.waitForTimeout(3500);
      }

      // เลือกประเภทนี้เพื่อให้ตารางอัตราทางขวาแสดงของประเภทนี้
      await page.getByText(code, { exact: true }).first().click();
      await page.waitForTimeout(3000);

      // เปิดสวิตช์ของทุกประเภทพนักงานในตารางอัตรา
      const employeeToggles = page
        .locator("tbody")
        .getByRole("button", { name: /^(เปิดใช้|ปิดใช้)$/ });
      const count = await employeeToggles.count();

      for (let i = 0; i < count; i += 1) {
        const toggle = employeeToggles.nth(i);
        const label = await toggle.getAttribute("aria-label");
        if (label === "เปิดใช้") {
          await toggle.click();
          await page.waitForTimeout(800);
        }
      }

      /*
       * ปุ่มบันทึกเปิดเฉพาะตอนมีการแก้ไขที่ยังไม่ได้บันทึก
       * ถ้าตั้งค่าครบไปแล้วรอบก่อน ปุ่มจะถูกปิด ไม่ใช่ความล้มเหลว
       */
      const saveButton = page.getByRole("button", {
        name: "บันทึก",
        exact: true,
      });
      if (await saveButton.isEnabled()) {
        await saveButton.click();
        await page.waitForTimeout(4000);
      }
    }

    /*
     * ต้องมีประเภทที่เปิดใช้จริงอย่างน้อยหนึ่ง ไม่ใช่ "เปิดใช้ 0"
     * ไม่ยึดตัวเลขตายตัว เพราะการเปิดหนึ่งประเภทอาจสร้างนโยบาย
     * ให้ประเภทพนักงานทุกกลุ่มพร้อมกัน จำนวนจึงต่างจากที่กดไป
     */
    await expect(page.getByText(/เปิดใช้ [1-9]/).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({ path: shot("p2i-02-enabled"), fullPage: true });
  });
});
