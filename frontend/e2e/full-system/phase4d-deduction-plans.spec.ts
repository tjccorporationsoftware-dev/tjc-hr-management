import { expect, test, type Page } from "@playwright/test";

import {
  STATE_PAYROLL,
  fieldByLabel,
  modalRoot,
  selectOptionByText,
  shot,
  thaiDateField,
} from "./_shared";

/**
 * เฟส 4d — หักผ่อนงวด (กยศ. / เงินกู้)
 * -----------------------------------------------------------------------------
 * กยศ. เป็นหน้าที่ตามกฎหมายที่นายจ้างต้องหักและนำส่ง ระบบจึงจัดลำดับให้หักก่อน
 * หนี้ประเภทอื่นโดยอัตโนมัติ ตามที่หน้าจอเองระบุไว้
 *
 * ตั้งสองแผนเพื่อทดสอบสองพฤติกรรมที่ต่างกัน
 *   - กยศ. ของกมล        มียอดหนี้รวม จึงต้องหยุดหักเองเมื่อครบ
 *   - เงินกู้ของชัยวัฒน์   หักบางส่วนได้เมื่อเงินเดือนไม่พอ
 */

type Plan = {
  employee: string;
  type: string;
  code: string;
  name: string;
  contractNo: string;
  startDate: string;
  totalAmount: string;
  perPeriod: string;
};

const PLANS: Plan[] = [
  {
    employee: "กมล",
    type: "กยศ",
    code: "SL_2569",
    name: "หัก กยศ.",
    contractNo: "STU-2569-0001",
    startDate: "2026-07-26",
    totalAmount: "48000",
    perPeriod: "2000",
  },
  {
    employee: "ชัยวัฒน์",
    type: "เงินกู้",
    code: "LOAN_2569",
    name: "หักเงินกู้สวัสดิการ",
    contractNo: "LN-2569-0007",
    startDate: "2026-07-26",
    totalAmount: "24000",
    perPeriod: "1000",
  },
];

async function openDeductionPlans(page: Page) {
  await page.goto("/payroll/deduction-plans");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/หักผ่อนงวด|กยศ/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(10_000);
}

test.describe("เฟส 4d · หักผ่อนงวด กยศ. และเงินกู้", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_PAYROLL });

  test("สร้างแผนหักผ่อนงวดให้พนักงาน", async ({ page }) => {
    test.setTimeout(400_000);
    await openDeductionPlans(page);

    for (const plan of PLANS) {
      // เคยสร้างไว้แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูล
      if ((await page.getByText(plan.contractNo).count()) > 0) continue;

      await page.getByRole("button", { name: "เพิ่มแผนหัก" }).click();
      await page.waitForTimeout(2000);

      const modal = modalRoot(page);
      await selectOptionByText(
        fieldByLabel(modal, "พนักงาน", "select"),
        plan.employee,
      );
      await selectOptionByText(
        fieldByLabel(modal, "ประเภท", "select"),
        plan.type,
      );
      await page.getByPlaceholder("เช่น SL_2569").fill(plan.code);
      await page.getByPlaceholder("เช่น หัก กยศ.").fill(plan.name);
      await fieldByLabel(modal, "เลขที่สัญญา", "input").fill(plan.contractNo);
      await thaiDateField(modal, "วันที่เริ่มหัก").fill(plan.startDate);
      await fieldByLabel(modal, "ยอดหนี้ทั้งหมด", "input").fill(
        plan.totalAmount,
      );
      await fieldByLabel(modal, "หักต่องวด", "input").fill(plan.perPeriod);

      await page.getByRole("button", { name: "บันทึก", exact: true }).click();

      /*
       * หน้านี้ไม่ใช้ toast เลย เป็นรูปแบบที่สี่ในระบบเดียว
       * สำเร็จ = ฟอร์มปิดเอง / ล้มเหลว = ขึ้นข้อความค้างในฟอร์ม
       * จึงต้องรอให้ฟอร์มปิด และดักข้อความ error ออกมาให้เห็นสาเหตุจริง
       */
      const stillOpen = await page
        .getByRole("button", { name: "บันทึก", exact: true })
        .waitFor({ state: "hidden", timeout: 30_000 })
        .then(() => false)
        .catch(() => true);

      if (stillOpen) {
        const text = (await modalRoot(page).innerText()).replace(/\s+/g, " ");
        // ข้อความผิดพลาดอยู่ท้ายฟอร์ม ไม่ใช่ต้น จึงต้องตัดจากท้ายมาดู
        throw new Error(
          `บันทึกแผนหักไม่สำเร็จ — ท้ายฟอร์ม: ${text.slice(-300)}`,
        );
      }

      await page.waitForTimeout(2500);
    }

    await page.screenshot({ path: shot("p4d-01-plans"), fullPage: true });
  });

  test("ยอดค้างต้องคำนวณจากยอดหนี้ลบด้วยที่หักไปแล้ว", async ({ page }) => {
    await openDeductionPlans(page);

    for (const plan of PLANS) {
      const row = page
        .locator("tbody tr")
        .filter({ hasText: plan.contractNo })
        .first();
      await expect(row).toBeVisible({ timeout: 30_000 });

      /*
       * ยังไม่เคยหักงวดใด ยอดค้างจึงต้องเท่ากับยอดหนี้ทั้งหมด
       * ถ้าไม่ตรงแปลว่าการยกยอดหรือการนับงวดผิดตั้งแต่ต้น
       */
      await expect(row).toContainText(
        Number(plan.totalAmount).toLocaleString("en-US"),
      );
    }

    await page.screenshot({ path: shot("p4d-02-outstanding"), fullPage: true });
  });
});
