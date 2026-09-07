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
 * เฟส 4b — ฐานเงินเดือนและรายรับประจำ
 * -----------------------------------------------------------------------------
 * ไม่มีฐานเงินเดือน = คำนวณเงินเดือนไม่ได้เลย เป็นข้อบังคับก่อนเฟส 8
 *
 * ชุดข้อมูลตั้งใจให้ครอบคลุมหลายกรณีที่คิดภาษีต่างกัน
 *   - เงินเดือนสูงพอเสียภาษี (กรรมการผู้จัดการ / ผู้จัดการ)
 *   - เงินเดือนต่ำกว่าเกณฑ์ภาษี (เจ้าหน้าที่ / พนักงานรายวัน)
 *   - เกินเพดานประกันสังคม 17,500 (กรรมการผู้จัดการ) เพื่อทดสอบการตัดเพดาน
 *   - ต่ำกว่าฐานขั้นต่ำ 1,650 ไม่มีในชุดนี้เพราะไม่สมจริงกับพนักงานประจำ
 */

type Compensation = {
  employee: string;
  baseSalary: string;
  positionAllowance: string;
  travelAllowance: string;
};

const COMPENSATIONS: Compensation[] = [
  { employee: "สมชาย", baseSalary: "120000", positionAllowance: "20000", travelAllowance: "5000" },
  { employee: "วราภรณ์", baseSalary: "55000", positionAllowance: "8000", travelAllowance: "3000" },
  { employee: "ปิยะ", baseSalary: "52000", positionAllowance: "8000", travelAllowance: "3000" },
  { employee: "อรุณี", baseSalary: "50000", positionAllowance: "8000", travelAllowance: "3000" },
  { employee: "กมล", baseSalary: "28000", positionAllowance: "0", travelAllowance: "1500" },
  { employee: "ชัยวัฒน์", baseSalary: "22000", positionAllowance: "0", travelAllowance: "1500" },
  { employee: "ธนา", baseSalary: "15000", positionAllowance: "0", travelAllowance: "1000" },
  { employee: "ณัฐพล", baseSalary: "23000", positionAllowance: "0", travelAllowance: "1500" },
];

const EFFECTIVE_FROM = "2026-01-05";

async function openCompensation(page: Page) {
  await page.goto("/payroll/compensation");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/ฐานเงินเดือน/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(10_000);
}

test.describe("เฟส 4b · ฐานเงินเดือน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_PAYROLL });

  test("ตั้งฐานเงินเดือนให้พนักงานครบทุกคน", async ({ page }) => {
    test.setTimeout(600_000);
    await openCompensation(page);

    for (const item of COMPENSATIONS) {
      /*
       * เคยตั้งไว้แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูล
       *
       * ต้องนับจาก "แถวในตาราง" เท่านั้น
       * เคสที่เคยพลาด: ใช้ getByText แล้วมันไปนับชื่อพนักงานที่อยู่ใน <option>
       * ของ dropdown ตัวกรองด้วย เทสเลยคิดว่ามีข้อมูลครบและข้ามการสร้างทั้งหมด
       * สุดท้ายผ่านเขียวทั้งที่ยังไม่มีฐานเงินเดือนสักคน
       */
      const search = page.getByPlaceholder("เลขที่ / ชื่อ / รหัสพนักงาน / หมายเหตุ");
      await search.fill(item.employee);
      await page.waitForTimeout(3000);
      const exists =
        (await page.locator("tbody tr").filter({ hasText: item.employee }).count()) > 0;
      await search.fill("");
      await page.waitForTimeout(2000);

      if (exists) continue;

      await page
        .getByRole("button", { name: "เพิ่มฐานเงินเดือน", exact: true })
        .click();
      await page.waitForTimeout(2000);

      const modal = modalRoot(page);
      await selectOptionByText(
        fieldByLabel(modal, "พนักงาน", "select"),
        item.employee,
      );
      await thaiDateField(modal, "วันที่เริ่มใช้").fill(EFFECTIVE_FROM);
      await fieldByLabel(modal, "เงินเดือนหลัก", "input").fill(item.baseSalary);
      await fieldByLabel(modal, "ค่าตำแหน่ง", "input").fill(
        item.positionAllowance,
      );
      await fieldByLabel(modal, "ค่าเดินทาง", "input").fill(
        item.travelAllowance,
      );

      await page.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expectToast(page, /เรียบร้อย|สำเร็จ/);
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: shot("p4b-01-base-salary"), fullPage: true });
  });

  test("ทุกคนต้องมีฐานเงินเดือน ไม่งั้นคำนวณงวดไม่ได้", async ({ page }) => {
    await openCompensation(page);

    /*
     * ตรวจทีละคนด้วยการค้นหา ไม่ใช่ดูจากหน้าแรก
     * เพราะรายการแบ่งหน้า คนที่อยู่หน้าถัดไปจะถูกมองข้าม
     */
    for (const item of COMPENSATIONS) {
      const search = page.getByPlaceholder("เลขที่ / ชื่อ / รหัสพนักงาน / หมายเหตุ");
      await search.fill(item.employee);
      await page.waitForTimeout(3000);

      const row = page.locator("tbody tr").filter({ hasText: item.employee }).first();
      await expect(row).toBeVisible({ timeout: 30_000 });

      // ตัวเลขต้องตรงกับที่กรอก ไม่ใช่แค่มีแถว
      const expected = Number(item.baseSalary).toLocaleString("en-US");
      await expect(row).toContainText(expected);
    }

    await page.screenshot({ path: shot("p4b-02-verified"), fullPage: true });
  });
});
