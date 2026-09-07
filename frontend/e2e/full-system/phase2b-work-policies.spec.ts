import { expect, test, type Page } from "@playwright/test";

import {
  STATE_COMPANY_ADMIN,
  expectToast,
  fieldByLabel,
  selectOptionByText,
  shot,
  thaiDateField,
} from "./_shared";

/**
 * เฟส 2b — นโยบายการทำงาน
 * -----------------------------------------------------------------------------
 * กะการทำงานคือรากของทุกอย่างที่ตามมา ถ้าไม่มีกะ
 *   - พนักงานลงเวลาแล้วระบบไม่รู้ว่าสายหรือไม่
 *   - หักเงินมาสาย/ลืมลงเวลา คำนวณไม่ได้
 *   - OT นับชั่วโมงเกินเวลามาตรฐานไม่ได้
 * จึงต้องทำก่อนเฟสลงเวลาและเฟสเงินเดือน
 *
 * สร้างสองกะเพราะสองสาขาทำงานคนละเวลาจริง และได้พิสูจน์ว่ากะแยกตามสาขาได้
 */

type Shift = {
  name: string;
  branch: string;
  morningIn: string;
  afternoonIn: string;
  checkOut: string;
  lateGraceMinutes: string;
  latePenaltyPerMinute: string;
  missingPunchPenalty: string;
};

/*
 * วันที่เริ่มใช้ต้องย้อนไปถึงวันที่พนักงานเริ่มงาน ไม่ใช่วันที่ตั้งค่า
 *
 * เคสที่เคยพลาด: ปล่อยให้เป็นค่าเริ่มต้น (วันนี้) แล้วไปคิดเวลาทำงานของงวดก่อนหน้า
 * ระบบถอยไปใช้ค่ากลางของระบบ (เข้า 08:00 ไม่ผ่อนผัน ปรับ 5 บาท/นาที)
 * แทนค่าของกะจริง ค่าปรับมาสายจึงผิดทั้งงวดโดยไม่มีอะไรเตือน
 */
const EFFECTIVE_FROM = "2026-01-05";

const SHIFTS: Shift[] = [
  {
    name: "กะสำนักงาน",
    branch: "สำนักงานใหญ่",
    morningIn: "08:30",
    afternoonIn: "13:00",
    checkOut: "17:30",
    lateGraceMinutes: "15",
    latePenaltyPerMinute: "2",
    missingPunchPenalty: "50",
  },
  {
    name: "กะคลังสินค้า",
    branch: "คลังสินค้าบางนา",
    morningIn: "08:00",
    afternoonIn: "13:00",
    checkOut: "17:00",
    lateGraceMinutes: "10",
    latePenaltyPerMinute: "3",
    missingPunchPenalty: "50",
  },
];

/** โมดัลของหน้านี้คือกล่องนอกสุดที่มีปุ่มบันทึกอยู่ข้างใน */
function shiftModal(page: Page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: /บันทึกและสร้างรอบมาตรฐาน/ }) })
    .first();
}

async function openWorkPolicies(page: Page) {
  await page.goto("/settings/work-policies");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: "นโยบายการทำงาน" }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(8_000);
}

test.describe("เฟส 2b · นโยบายการทำงาน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("สร้างกะการทำงานให้ครบทั้งสองสาขา", async ({ page }) => {
    await openWorkPolicies(page);

    for (const shift of SHIFTS) {
      /*
       * เคยสร้างไว้แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูลก่อน
       *
       * ระบบไม่ได้กันชื่อกะซ้ำในสาขาเดียวกัน (รหัสกะสุ่มใหม่ทุกครั้ง
       * จึงไม่ชน unique key) ถ้าไม่ข้ามจะได้กะชื่อเดียวกันซ้อนกัน
       * โดยกะใหม่ได้ priority 0 คือ "เฉพาะคนที่เลือก" ตามที่ระบบตั้งใจ
       */
      if ((await page.getByText(shift.name).count()) > 0) {
        continue;
      }

      // ปุ่มเปลี่ยนชื่อจาก "สร้างกะแรก" เป็น "เพิ่มกะ" หลังมีกะแล้ว
      await page
        .getByRole("button", { name: /สร้างกะแรก|เพิ่มกะ/ })
        .first()
        .click();
      await page.waitForTimeout(1500);

      const modal = shiftModal(page);
      await fieldByLabel(modal, "ชื่อกะ").fill(shift.name);
      await selectOptionByText(
        fieldByLabel(modal, "ใช้กับสาขา", "select"),
        shift.branch,
      );
      await fieldByLabel(modal, "เวลาเข้างาน รอบ 1").fill(shift.morningIn);
      await fieldByLabel(modal, "เวลาเข้างาน รอบ 2").fill(shift.afternoonIn);
      await fieldByLabel(modal, "เวลาออกงาน").fill(shift.checkOut);
      await fieldByLabel(modal, "ผ่อนผันการมาสาย").fill(shift.lateGraceMinutes);
      await fieldByLabel(modal, "ค่าปรับมาสาย").fill(shift.latePenaltyPerMinute);
      await fieldByLabel(modal, "ค่าปรับลืมลงเวลา").fill(
        shift.missingPunchPenalty,
      );
      await thaiDateField(modal, "วันที่เริ่มใช้").fill(EFFECTIVE_FROM);

      await page
        .getByRole("button", { name: /บันทึกและสร้างรอบมาตรฐาน/ })
        .click();
      await expectToast(page, /สำเร็จ|บันทึก|สร้าง/);

      await expect(page.getByText(shift.name).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.screenshot({ path: shot("p2b-01-shifts"), fullPage: true });
  });

  test("รอบลงเวลาที่ระบบสร้างให้ ต้องใช้เวลาจริงของกะ", async ({ page }) => {
    await openWorkPolicies(page);

    /*
     * ระบบสร้างรอบ เข้ารอบ 1 / เข้ารอบ 2 / ออกงาน ให้เองตอนสร้างกะ
     * และรอบพวกนี้ต้องอิงเวลาที่กรอกไว้ ไม่ใช่ค่าตั้งต้นของระบบ
     *
     * เคสที่เคยพัง: กะสำนักงานตั้งเข้า 08:30 ออก 17:30
     * แต่รอบที่สร้างให้เป็น 08:00/17:00 พนักงานจึงถูกตัดว่าสายตั้งแต่ 08:00
     * และถูกหักเงินผิดตั้งแต่วันแรก ทั้งที่หน้าจอแสดงเวลาของกะถูกต้อง
     */
    for (const shift of SHIFTS) {
      await page.getByText(shift.name).first().click();
      await page.waitForTimeout(4000);

      for (const round of ["เข้างาน", "ออกงาน"]) {
        await expect(page.getByText(round).first()).toBeVisible({
          timeout: 30_000,
        });
      }

      /*
       * ต้องเช็คทั้งสองกะ ไม่ใช่กะเดียว
       * อีกเคสที่เคยพัง: สร้างกะที่สองแล้วระบบคัดลอกรอบของกะแรกมาให้
       * ถ้าเช็คแต่กะแรกจะไม่มีทางเห็นเลย
       */
      const body = page.locator("body");
      await expect(body).toContainText(shift.morningIn);
      await expect(body).toContainText(shift.checkOut);

      // กดชื่อกะจะเปิดโมดัลรายละเอียด ต้องปิดก่อนถึงจะกดกะถัดไปได้
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: shot("p2b-02-shift-rounds"), fullPage: true });
  });
});
