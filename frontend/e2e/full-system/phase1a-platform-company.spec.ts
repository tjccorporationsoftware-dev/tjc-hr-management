import { expect, test } from "@playwright/test";

import { shot } from "./_shared";

/**
 * เฟส 1a — ตั้งบริษัทและสาขา
 * -----------------------------------------------------------------------------
 * จุดเริ่มจริงของการตั้งระบบ ทำจาก Platform Console ด้วยบัญชีระดับ GLOBAL
 * เพราะยังไม่มีบริษัทใดในระบบ จึงยังไม่มีผู้ดูแลบริษัทให้ใช้
 *
 * ลำดับที่ระบบบังคับคือ บริษัท → สาขา → ข้อมูลหลักองค์กร → พนักงาน → บัญชีผู้ใช้
 */

const COMPANY = {
  code: "TJC",
  nameTh: "บริษัท ทีเจซี คอร์ปอเรชั่น จำกัด",
  nameEn: "TJC Corporation Co., Ltd.",
  taxId: "0105558123456",
};

const BRANCHES = [
  { code: "HQ", nameTh: "สำนักงานใหญ่" },
  { code: "BKK-WH", nameTh: "คลังสินค้าบางนา" },
];

test.describe("เฟส 1a · ตั้งบริษัทและสาขา", () => {
  test.describe.configure({ mode: "serial" });

  test("สร้างบริษัทและสาขาจาก Platform Console", async ({ page }) => {
    await page.goto("/platform/companies");
    await page.waitForLoadState("domcontentloaded");

    // ---- สร้างบริษัท ----
    await page.getByPlaceholder("เช่น GAMMA").fill(COMPANY.code);
    await page.getByPlaceholder("บริษัท ... จำกัด").fill(COMPANY.nameTh);
    await page.getByPlaceholder("Gamma Co., Ltd.").fill(COMPANY.nameEn);
    await page.getByPlaceholder("0...").fill(COMPANY.taxId);
    await page.getByRole("button", { name: "สร้างบริษัท" }).click();

    await expect(page.getByText(COMPANY.nameTh).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p1a-01-company"), fullPage: true });

    // ---- เพิ่มสาขา ----
    for (const branch of BRANCHES) {
      await page.getByPlaceholder("เช่น BKK").fill(branch.code);
      await page.getByPlaceholder("สาขา...").fill(branch.nameTh);
      await page.getByRole("button", { name: "เพิ่มสาขา" }).click();
      await expect(page.getByText(branch.nameTh).first()).toBeVisible({
        timeout: 30_000,
      });
    }
    await page.screenshot({ path: shot("p1a-02-branches"), fullPage: true });
  });

  test("หน้าภาพรวมแพลตฟอร์มนับบริษัทได้ถูก", async ({ page }) => {
    await page.goto("/platform");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText(/บริษัททั้งหมด/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(COMPANY.nameTh).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p1a-03-overview"), fullPage: true });
  });
});
