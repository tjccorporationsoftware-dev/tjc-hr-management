import { expect, test } from "@playwright/test";

import { expectToast, shot } from "./_shared";

/**
 * เฟส 1b — ข้อมูลหลักขององค์กร
 * -----------------------------------------------------------------------------
 * หน้า /organization ใช้แท็บเดียวกันทั้งหน้า และมีเงื่อนไขที่ต้องรู้
 *   - ต้อง "เลือกสาขา" ที่ตัวกรองด้านบนก่อน ถึงจะกดเพิ่มแผนกได้
 *   - โมดัลไม่ได้ใช้ role=dialog จึงอ้างอิงช่องกรอกด้วย placeholder
 */

const DEPARTMENTS = [
  { branch: "สำนักงานใหญ่", code: "HRD", nameTh: "ฝ่ายทรัพยากรบุคคล", nameEn: "Human Resources" },
  { branch: "สำนักงานใหญ่", code: "FIN", nameTh: "ฝ่ายบัญชีและการเงิน", nameEn: "Finance" },
  { branch: "สำนักงานใหญ่", code: "ITD", nameTh: "ฝ่ายเทคโนโลยีสารสนเทศ", nameEn: "IT" },
  { branch: "คลังสินค้าบางนา", code: "OPS", nameTh: "ฝ่ายปฏิบัติการคลังสินค้า", nameEn: "Warehouse Operations" },
];

const POSITIONS = [
  { code: "MD", nameTh: "กรรมการผู้จัดการ", nameEn: "Managing Director", level: "1", sortOrder: "1" },
  { code: "MGR", nameTh: "ผู้จัดการฝ่าย", nameEn: "Manager", level: "4", sortOrder: "10" },
  { code: "SNR", nameTh: "เจ้าหน้าที่อาวุโส", nameEn: "Senior Officer", level: "5", sortOrder: "20" },
  { code: "OFF", nameTh: "เจ้าหน้าที่", nameEn: "Officer", level: "7", sortOrder: "30" },
  { code: "OPR", nameTh: "พนักงานปฏิบัติการ", nameEn: "Operator", level: "7", sortOrder: "40" },
];

const EMPLOYEE_TYPES = [
  { code: "MONTHLY", nameTh: "พนักงานประจำ (รายเดือน)", nameEn: "Monthly Permanent" },
  { code: "DAILY", nameTh: "พนักงานรายวัน", nameEn: "Daily Wage" },
  { code: "PROBATION", nameTh: "พนักงานทดลองงาน", nameEn: "Probation" },
];

/** ช่องกรอกในโมดัลคือ input ที่มองเห็นได้ ถัดจากช่องค้นหาของหน้า */
async function modalInputs(page: import("@playwright/test").Page) {
  return page.locator("input:visible, textarea:visible");
}

async function openOrganization(page: import("@playwright/test").Page) {
  await page.goto("/organization");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: "ข้อมูลบริษัทและโครงสร้างองค์กร" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(15_000);
}

async function selectBranch(page: import("@playwright/test").Page, label: string) {
  await page.locator("select").nth(1).selectOption({ label });
  await page.waitForTimeout(2000);
}

async function goTab(page: import("@playwright/test").Page, tab: string) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.waitForTimeout(1800);
}

test.describe("เฟส 1b · ข้อมูลหลักขององค์กร", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ actionTimeout: 30_000 });

  test("สร้างแผนกในแต่ละสาขา", async ({ page }) => {
    test.setTimeout(300_000);
    await openOrganization(page);
    await goTab(page, "แผนก");

    for (const dept of DEPARTMENTS) {
      await selectBranch(page, dept.branch);
      await page.getByRole("button", { name: "เพิ่มแผนก", exact: true }).click();
      await page.waitForTimeout(1200);

      await page.getByPlaceholder("HR", { exact: true }).fill(dept.code);
      await page.getByPlaceholder("ฝ่ายทรัพยากรบุคคล").fill(dept.nameTh);
      await page.getByPlaceholder("Human Resources").fill(dept.nameEn);
      await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();

      await expectToast(page, /สำเร็จ|บันทึก|เพิ่ม/);
      await expect(page.getByText(dept.nameTh).first()).toBeVisible({
        timeout: 30_000,
      });
    }
    await page.screenshot({ path: shot("p1b-01-departments"), fullPage: true });
  });

  test("สร้างตำแหน่งงาน", async ({ page }) => {
    test.setTimeout(300_000);
    await openOrganization(page);
    // ทุกแท็บของหน้านี้ต้องเลือกสาขาที่ตัวกรองด้านบนก่อน ปุ่มเพิ่มถึงจะเปิดโมดัล
    await selectBranch(page, "สำนักงานใหญ่");
    await goTab(page, "ตำแหน่ง");

    for (const pos of POSITIONS) {
      await page.getByRole("button", { name: "เพิ่มตำแหน่ง", exact: true }).click();
      await page.waitForTimeout(1200);

      await page.getByPlaceholder("เช่น HR-MANAGER").fill(pos.code);
      await page.getByPlaceholder("เช่น ผู้จัดการฝ่ายทรัพยากรบุคคล").fill(pos.nameTh);
      await page.getByPlaceholder("เช่น HR Manager").fill(pos.nameEn);

      /*
       * "ระดับตำแหน่ง" เป็น dropdown ไม่ใช่ช่องพิมพ์
       * ตัวหน้าจอเองบอกว่า กรรมการผู้จัดการ = Level 1, ผู้จัดการ = Level 4,
       * พนักงาน = Level 7 ยืนยัน convention ว่า level 1 คือสูงสุด
       */
      const levelSelect = page
        .locator("select")
        .filter({ hasText: /Level/ })
        .last();
      // option ใน select ที่ปิดอยู่ไม่ visible จึงอ่านค่าจาก DOM แทน
      const options = await levelSelect
        .locator("option")
        .evaluateAll((els) =>
          els.map((el) => ({
            value: (el as HTMLOptionElement).value,
            text: el.textContent?.trim() ?? "",
          })),
        );
      const wanted = options.find((o) => o.text.startsWith(`Level ${pos.level}`));
      if (!wanted) {
        throw new Error(
          `ไม่พบ Level ${pos.level} ใน dropdown — มีให้เลือก: ${options.map((o) => o.text).join(" | ")}`,
        );
      }
      await levelSelect.selectOption(wanted.value);

      // ลำดับในผังองค์กร (คนละช่องกับระดับตำแหน่ง)
      await page.getByPlaceholder("เลขน้อยอยู่บน เช่น 1, 2, 3").fill(pos.sortOrder);
      await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();

      await expectToast(page, /สำเร็จ|บันทึก|เพิ่ม/);
      await expect(page.getByText(pos.nameTh).first()).toBeVisible({
        timeout: 30_000,
      });
    }
    await page.screenshot({ path: shot("p1b-02-positions"), fullPage: true });
  });

  test("สร้างประเภทพนักงาน", async ({ page }) => {
    test.setTimeout(300_000);
    await openOrganization(page);
    await selectBranch(page, "สำนักงานใหญ่");
    await goTab(page, "ประเภทพนักงาน");

    for (const type of EMPLOYEE_TYPES) {
      await page
        .getByRole("button", { name: "เพิ่มประเภทพนักงาน", exact: true })
        .click();
      await page.waitForTimeout(1200);

      const inputs = await modalInputs(page);
      // index 0 คือช่องค้นหาของหน้า ช่องโมดัลเริ่มที่ 1
      await inputs.nth(1).fill(type.code);
      await inputs.nth(2).fill(type.nameTh);
      await inputs.nth(3).fill(type.nameEn);
      await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();

      await expectToast(page, /สำเร็จ|บันทึก|เพิ่ม/);
      await expect(page.getByText(type.nameTh).first()).toBeVisible({
        timeout: 30_000,
      });
    }
    await page.screenshot({ path: shot("p1b-03-employee-types"), fullPage: true });
  });

  test("ผังองค์กรสรุปตัวเลขได้ถูก", async ({ page }) => {
    test.setTimeout(300_000);
    await openOrganization(page);

    /*
     * การ์ดสรุปด้านบนต้องนับตรงกับที่เพิ่งสร้างจริง
     * ตัวกรองสาขาต้องเป็น "ทุกสาขา" ไม่งั้นตัวเลขจะถูกจำกัดเฉพาะสาขาที่เลือก
     */
    for (const [label, expected] of [
      ["Branches", "2"],
      ["Departments", "4"],
      ["Positions", "5"],
      ["Employee Types", "3"],
    ] as const) {
      // โครงการ์ด: บรรทัดชื่อภาษาอังกฤษ แล้วบรรทัดถัดไปคือตัวเลข
      const value = page
        .getByText(label, { exact: true })
        .locator("xpath=following-sibling::div[1]");
      await expect(value).toHaveText(expected, { timeout: 30_000 });
    }

    await goTab(page, "ผังองค์กร");
    // ยังไม่มีพนักงานในระบบ ผังจึงต้องบอกตรงๆ ว่าศูนย์ ไม่ใช่ค้างหรือพัง
    await expect(page.getByText(/แสดง 0 พนักงาน/)).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p1b-04-org-chart"), fullPage: true });
  });
});
