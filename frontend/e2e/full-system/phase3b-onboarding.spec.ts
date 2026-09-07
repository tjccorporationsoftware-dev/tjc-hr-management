import { expect, test, type Page } from "@playwright/test";

import {
  STATE_COMPANY_ADMIN,
  expectSuccessDialog,
  fieldByLabel,
  selectOptionByText,
  shot,
} from "./_shared";
import { NEW_HIRE, NEW_HIRE_NAME } from "./_data";

/**
 * เฟส 3b — เริ่มงานพนักงานใหม่
 * -----------------------------------------------------------------------------
 * หน้า /onboarding มี 4 แท็บที่ต่อกันเป็นเส้นเดียว
 *   เช็กลิสต์        แม่แบบว่าคนเข้าใหม่ต้องทำอะไรบ้าง
 *   งานที่ต้องทำ     มอบหมายรายการจากเช็กลิสต์ให้คนจริง
 *   เอกสารพนักงานใหม่ ตามเอกสารที่ต้องส่งและตรวจรับ
 *   ทดลองงาน       ติดตามวันครบกำหนดและบันทึกผลรีวิว
 *
 * ทดลองงานต้องรีวิวก่อนครบ 120 วัน ไม่งั้นกลายเป็นพนักงานประจำอัตโนมัติ
 * ตามกฎหมายแรงงาน จึงเป็นขั้นที่พลาดไม่ได้
 */

const CHECKLIST = {
  code: "ONB_OFFICE",
  name: "ต้อนรับพนักงานออฟฟิศ",
  items: [
    { name: "ทำบัตรพนักงานและคีย์การ์ด", category: "อุปกรณ์" },
    { name: "เปิดบัญชีอีเมลและระบบภายใน", category: "ระบบ" },
    { name: "ปฐมนิเทศนโยบายบริษัท", category: "อบรม" },
  ],
};

async function openOnboarding(page: Page, tab: string) {
  await page.goto("/onboarding");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/เริ่มงานพนักงานใหม่|ต้อนรับ/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(8_000);

  await page.getByRole("button", { name: new RegExp(`^${tab}`) }).first().click();
  await page.waitForTimeout(3000);
}

test.describe("เฟส 3b · เริ่มงานพนักงานใหม่", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("สร้างเช็กลิสต์ต้อนรับพร้อมรายการที่ต้องทำ", async ({ page }) => {
    await openOnboarding(page, "เช็กลิสต์");

    if ((await page.getByText(CHECKLIST.code).count()) > 0) {
      test.info().annotations.push({
        type: "note",
        description: "มีเช็กลิสต์นี้อยู่แล้ว ข้ามการสร้างซ้ำ",
      });
    } else {
      await page.getByRole("button", { name: /สร้างเช็กลิสต์/ }).first().click();
      await page.waitForTimeout(2000);

      await page.getByPlaceholder("เช่น ONB_OFFICE").fill(CHECKLIST.code);
      await page
        .getByPlaceholder("เช่น ต้อนรับพนักงานออฟฟิศ")
        .fill(CHECKLIST.name);

      /*
       * โมดัลเปิดมาพร้อมแถวว่างให้อยู่แล้ว ต้องกรอกลงแถวที่มี
       * ห้ามกด "เพิ่มรายการ" พร่ำเพรื่อ เพราะแถวว่างที่เหลือถูกติ๊ก "บังคับ" ไว้
       * ระบบจะบันทึกไม่ผ่านและปุ่มค้างหมุนโดยไม่บอกสาเหตุ
       */
      for (const [index, item] of CHECKLIST.items.entries()) {
        const rows = await page.getByPlaceholder("ชื่อรายการ").count();
        if (index >= rows) {
          await page.getByRole("button", { name: /เพิ่มรายการ/ }).first().click();
          await page.waitForTimeout(800);
        }

        await page.getByPlaceholder("ชื่อรายการ").nth(index).fill(item.name);
        await page.getByPlaceholder("หมวด").nth(index).fill(item.category);
      }

      // ลบแถวว่างที่เหลือทิ้ง ไม่งั้นจะกลายเป็นรายการบังคับที่ไม่มีชื่อ
      let blankRows = (await page.getByPlaceholder("ชื่อรายการ").count()) -
        CHECKLIST.items.length;
      while (blankRows > 0) {
        await page
          .getByRole("button", { name: "ลบรายการ" })
          .last()
          .click()
          .catch(async () => {
            await page.locator("button:has(svg)").last().click();
          });
        await page.waitForTimeout(600);
        blankRows -= 1;
      }

      await page
        .getByRole("button", { name: "สร้างเช็กลิสต์", exact: true })
        .last()
        .click();
      await expectSuccessDialog(page, /สร้าง Checklist สำเร็จ/);
    }

    await expect(page.getByText(CHECKLIST.code).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p3b-01-checklist"), fullPage: true });
  });

  test("มอบหมายงานต้อนรับให้พนักงานใหม่", async ({ page }) => {
    await openOnboarding(page, "งานที่ต้องทำ");

    await page.getByRole("button", { name: /มอบหมายงาน/ }).first().click();
    await page.waitForTimeout(2500);

    const modal = page
      .locator("div")
      .filter({
        has: page.getByRole("button", { name: "มอบหมายงาน", exact: true }),
      })
      .first();

    await selectOptionByText(fieldByLabel(modal, "บริษัท", "select"), "ทีเจซี");
    await selectOptionByText(
      fieldByLabel(modal, "พนักงาน", "select"),
      NEW_HIRE.firstName,
    );
    await selectOptionByText(
      fieldByLabel(modal, "ใช้เช็กลิสต์", "select"),
      CHECKLIST.name,
    );
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("p3b-02-task-form"), fullPage: true });

    await page
      .getByRole("button", { name: "มอบหมายงาน", exact: true })
      .last()
      .click();
    await expectSuccessDialog(page, /สร้าง Onboarding Task สำเร็จ/);

    await expect(page.getByText(NEW_HIRE_NAME).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p3b-03-tasks"), fullPage: true });
  });

  test("เริ่มบันทึกทดลองงานและติดตามวันครบกำหนด", async ({ page }) => {
    await openOnboarding(page, "ทดลองงาน");

    if ((await page.getByText(NEW_HIRE_NAME).count()) === 0) {
      await page
        .getByRole("button", { name: /เริ่มบันทึกทดลองงาน|บันทึกทดลองงาน/ })
        .first()
        .click();
      await page.waitForTimeout(2500);

      const modal = page
        .locator("div")
        .filter({
          has: page.getByRole("button", { name: "บันทึกทดลองงาน", exact: true }),
        })
        .first();

      await selectOptionByText(fieldByLabel(modal, "บริษัท", "select"), "ทีเจซี");
      await selectOptionByText(
        fieldByLabel(modal, "พนักงาน", "select"),
        NEW_HIRE.firstName,
      );

      await page
        .getByRole("button", { name: "บันทึกทดลองงาน", exact: true })
        .last()
        .click();
      await expectSuccessDialog(page, /สำเร็จ/);
    }

    await expect(page.getByText(NEW_HIRE_NAME).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p3b-04-probation"), fullPage: true });
  });

  test("บันทึกผลผ่านทดลองงาน แล้วสถานะพนักงานต้องเปลี่ยนตาม", async ({ page }) => {
    await openOnboarding(page, "ทดลองงาน");

    const row = page
      .locator("tr")
      .filter({ hasText: NEW_HIRE_NAME })
      .first();
    await expect(row).toBeVisible({ timeout: 30_000 });

    /*
     * รีวิวไปแล้วจะไม่มีปุ่มให้กดอีก ถือว่าผ่านขั้นนี้แล้ว
     * เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูลก่อน
     */
    const passButton = row.getByRole("button", { name: "ผ่าน", exact: true });

    if ((await passButton.count()) > 0) {
      await passButton.click();
      await page.waitForTimeout(2500);

      // เปิดโมดัลให้คะแนนตามแบบประเมิน แล้วยืนยัน
      await page
        .getByRole("button", { name: "บันทึกผล", exact: true })
        .last()
        .click();
      await expectSuccessDialog(page, /ผ่านทดลองงานแล้ว/);
    }

    await page.screenshot({ path: shot("p3b-05-probation-passed"), fullPage: true });

    /*
     * ผลลัพธ์ที่ต้องได้จริงคือสถานะพนักงานเปลี่ยนเป็น "ใช้งาน"
     * ไม่ใช่แค่ใบทดลองงานถูกปิด ถ้าสองที่ไม่ตรงกันจะกระทบสิทธิ์และเงินเดือน
     */
    await page.goto("/employees");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(12_000);
    await page
      .getByPlaceholder("ชื่อ, รหัสพนักงาน, อีเมล, เบอร์โทร")
      .fill(NEW_HIRE.firstName);
    await page.waitForTimeout(4000);

    const employeeRow = page
      .locator("tr")
      .filter({ hasText: NEW_HIRE_NAME })
      .first();
    // ตารางแสดงสถานะเป็นรหัสอังกฤษ ไม่ใช่คำไทย
    await expect(employeeRow).toContainText("ACTIVE", { timeout: 30_000 });

    await page.screenshot({ path: shot("p3b-06-employee-active"), fullPage: true });
  });
});
