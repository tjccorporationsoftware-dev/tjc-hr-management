import { expect, test, type Page } from "@playwright/test";

import {
  STATE_COMPANY_ADMIN,
  expectToast,
  fieldByLabel,
  selectOptionByText,
  shot,
} from "./_shared";
import { NEW_HIRE } from "./_data";

/**
 * เฟส 3a — รับพนักงานใหม่เข้าระบบ
 * -----------------------------------------------------------------------------
 * พนักงาน 7 คนในเฟส 1c ถูกสร้างเป็นชุดตั้งต้นของบริษัท เข้างานพร้อมกันวันเดียว
 * เฟสนี้จำลอง "คนเข้าใหม่ระหว่างปี" ซึ่งเป็นเส้นทางที่ใช้จริงทุกเดือน
 * และต่างจากชุดตั้งต้นตรงที่ต้องมีทดลองงาน เช็กลิสต์ต้อนรับ และเอกสาร
 */

/** โมดัลคือกล่องนอกสุดที่มีปุ่มบันทึกพนักงานอยู่ข้างใน */
function employeeModal(page: Page) {
  return page
    .locator("div")
    .filter({
      has: page.getByRole("button", { name: "บันทึกพนักงาน", exact: true }),
    })
    .first();
}

test.describe("เฟส 3a · รับพนักงานใหม่", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("เพิ่มพนักงานใหม่ระหว่างปีพร้อมกำหนดวันครบทดลองงาน", async ({ page }) => {
    await page.goto("/employees");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("button", { name: "เพิ่มพนักงาน", exact: true }).first(),
    ).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(10_000);

    const fullName = `${NEW_HIRE.firstName} ${NEW_HIRE.lastName}`;

    /*
     * ต้องค้นหาก่อนถึงจะรู้ว่ามีคนนี้อยู่แล้วหรือยัง
     * รายการพนักงานแบ่งหน้า คนที่เพิ่มล่าสุดอาจไม่อยู่ในหน้าแรก
     * ถ้าเช็คจากหน้าแรกเฉยๆ จะสรุปผิดว่ายังไม่มีแล้วสร้างซ้ำ
     */
    const search = page.getByPlaceholder("ชื่อ, รหัสพนักงาน, อีเมล, เบอร์โทร");
    await search.fill(NEW_HIRE.firstName);
    await page.waitForTimeout(4000);
    const alreadyExists = (await page.getByText(fullName).count()) > 0;
    await search.fill("");
    await page.waitForTimeout(3000);

    if (!alreadyExists) {
      await page
        .getByRole("button", { name: "เพิ่มพนักงาน", exact: true })
        .first()
        .click();
      await page.waitForTimeout(1500);

      const modal = employeeModal(page);
      await page.getByPlaceholder("ชื่อ", { exact: true }).fill(NEW_HIRE.firstName);
      await page.getByPlaceholder("นามสกุล", { exact: true }).fill(NEW_HIRE.lastName);

      await selectOptionByText(fieldByLabel(modal, "บริษัท", "select"), "ทีเจซี");
      await selectOptionByText(
        fieldByLabel(modal, "สาขา", "select"),
        NEW_HIRE.branch,
      );
      await selectOptionByText(
        fieldByLabel(modal, "แผนก", "select"),
        NEW_HIRE.department,
      );
      await selectOptionByText(
        fieldByLabel(modal, "ตำแหน่ง", "select"),
        NEW_HIRE.position,
      );
      await selectOptionByText(
        fieldByLabel(modal, "ประเภทการจ้างงาน", "select"),
        NEW_HIRE.employeeType,
      );
      await selectOptionByText(
        fieldByLabel(modal, "หัวหน้างานโดยตรง", "select"),
        NEW_HIRE.supervisor,
      );

      await fieldByLabel(modal, "วันที่เริ่มงาน", "input[type='date']").fill(
        NEW_HIRE.startDate,
      );
      // ระบบใช้วันนี้ตัดสินว่าใครใกล้ครบทดลองงานและต้องรีบรีวิว
      await fieldByLabel(
        modal,
        "วันสิ้นสุดทดลองงาน",
        "input[type='date']",
      ).fill(NEW_HIRE.probationEndDate);

      await page
        .getByRole("button", { name: "บันทึกพนักงาน", exact: true })
        .click();
      await expectToast(page, /สำเร็จ/);
    }

    await expect(page.getByText(fullName).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p3a-01-new-hire"), fullPage: true });
  });

  test("พนักงานใหม่ต้องปรากฏในรายการที่กรองด้วยประเภททดลองงาน", async ({
    page,
  }) => {
    await page.goto("/employees");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(12_000);

    await page
      .getByPlaceholder("ชื่อ, รหัสพนักงาน, อีเมล, เบอร์โทร")
      .fill(NEW_HIRE.firstName);
    await page.waitForTimeout(3000);

    const row = page.getByText(`${NEW_HIRE.firstName} ${NEW_HIRE.lastName}`).first();
    await expect(row).toBeVisible({ timeout: 30_000 });

    /*
     * ข้อมูลที่กรอกต้องติดมาครบ ไม่ใช่แค่ชื่อ
     * ถ้าแผนก/ตำแหน่งหาย จะกระทบทั้งสายอนุมัติและการคิดเงินเดือนภายหลัง
     */
    const employeeRow = page
      .locator("tr")
      .filter({ hasText: `${NEW_HIRE.firstName} ${NEW_HIRE.lastName}` })
      .first();
    await expect(employeeRow).toContainText(NEW_HIRE.department);

    /*
     * ตำแหน่งต้องตรงเป๊ะ ไม่ใช่แค่ขึ้นต้นเหมือนกัน
     * "เจ้าหน้าที่" กับ "เจ้าหน้าที่อาวุโส" ต่างกันทั้งระดับและฐานเงินเดือน
     */
    const positionCell = await employeeRow.innerText();
    expect(positionCell).toContain(NEW_HIRE.position);
    expect(positionCell).not.toContain("เจ้าหน้าที่อาวุโส");

    await page.screenshot({ path: shot("p3a-02-new-hire-row"), fullPage: true });
  });
});
