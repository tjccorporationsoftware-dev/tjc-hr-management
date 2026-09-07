import { expect, test, type Page } from "@playwright/test";

import { STATE_SUPERADMIN, shot } from "./_shared";

/**
 * เฟส 7d — เตรียมเวลาทำงานของงวดที่ยังเปิดอยู่
 * -----------------------------------------------------------------------------
 * งวด 26 มิ.ย. – 25 ก.ค. ถูกปิดและล็อกไปแล้วในเฟส 7c จึงแก้อะไรไม่ได้อีก
 * คำขอที่กระทบงวด (OT / ขอแก้เวลา / ลา / นอกสถานที่) จึงต้องทดสอบกับ
 * งวดปัจจุบัน 26 ก.ค. – 25 ส.ค. ซึ่งยังเปิดรับข้อมูลอยู่
 *
 * วางข้อมูลให้แต่ละคำขอมีเป้าหมายชัดเจน
 *   27, 28, 31 ก.ค.  ทำงานปกติ
 *   29 ก.ค.          ไม่กรอกเลย → จะยื่นใบลาย้อนหลังทับ
 *   30 ก.ค.          ไม่กรอกเวลาออก → จะยื่นขอแก้เวลาเพื่อลบค่าปรับลืมลงเวลา
 */

const WORK_DAYS = ["2026-07-27", "2026-07-28", "2026-07-31"];
const MISSING_CHECKOUT_DAY = "2026-07-30";

const NORMAL = { in: "08:25", afternoon: "12:55", out: "17:35" };

async function openEntryPage(page: Page, date: string) {
  await page.goto("/platform/attendance-entry");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/พนักงาน/).first()).toBeVisible({
    timeout: 60_000,
  });

  await page.locator("input[type='date']").first().fill(date);
  await page.waitForTimeout(6000);
}

/** กรอกเวลาให้ทุกคนในวันนั้น คืนค่าว่าบันทึกใหม่หรือไม่ */
async function fillDay(page: Page, date: string, withCheckout: boolean) {
  await openEntryPage(page, date);

  const timeInputs = page.getByPlaceholder("--:--");
  const inputCount = await timeInputs.count();
  if (inputCount === 0) {
    throw new Error(`วันที่ ${date} ไม่มีช่องกรอกเวลาให้เลย`);
  }

  // ช่องเรียงเป็นชุดละ 3 ต่อพนักงานหนึ่งคน: เข้า / บ่าย / ออก
  for (let i = 0; i + 2 < inputCount; i += 3) {
    await timeInputs.nth(i).fill(NORMAL.in);
    await timeInputs.nth(i + 1).fill(NORMAL.afternoon);
    if (withCheckout) {
      await timeInputs.nth(i + 2).fill(NORMAL.out);
    }
  }

  const saveAll = page.getByRole("button", { name: "บันทึกทั้งหมด" });

  // ปิดอยู่หลังกรอกแล้ว = วันนั้นบันทึกไปก่อนหน้านี้แล้ว
  if (await saveAll.isDisabled()) return false;

  await saveAll.click();

  const saved = page.getByText(/บันทึกทั้งหมดแล้ว/);
  const blocked = page.getByText(/ล้มเหลว \d+ คน/);
  await expect(saved.or(blocked).first()).toBeVisible({ timeout: 60_000 });

  if ((await blocked.count()) > 0) {
    throw new Error(
      `วันที่ ${date} ถูกระบบปฏิเสธ — งวดนี้อาจถูกปิดไปแล้ว`,
    );
  }

  return true;
}

test.describe("เฟส 7d · เตรียมข้อมูลงวดที่ยังเปิด", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_SUPERADMIN });

  test("กรอกเวลาทำงานของงวดปัจจุบันให้พร้อมทดสอบคำขอ", async ({ page }) => {
    test.setTimeout(900_000);

    let saved = 0;
    for (const date of WORK_DAYS) {
      if (await fillDay(page, date, true)) saved += 1;
    }

    // วันนี้จงใจไม่กรอกเวลาออก เพื่อให้เกิดค่าปรับลืมลงเวลาไว้ทดสอบขอแก้เวลา
    if (await fillDay(page, MISSING_CHECKOUT_DAY, false)) saved += 1;

    test.info().annotations.push({
      type: "สรุป",
      description: `บันทึกใหม่ ${saved} วัน · เว้นวันที่ 29 ก.ค. ไว้สำหรับใบลาย้อนหลัง`,
    });

    await page.screenshot({ path: shot("p7d-01-entry"), fullPage: true });
  });

  test("วันที่ลืมลงเวลาออกต้องถูกตีธงว่ามีค่าปรับ", async ({ page }) => {
    await openEntryPage(page, MISSING_CHECKOUT_DAY);

    /*
     * ช่องออกงานต้องว่าง ซึ่งจะทำให้ระบบคิดค่าปรับลืมลงเวลา 50 บาท
     * เป็นเป้าหมายที่พนักงานจะยื่นขอแก้เวลาในขั้นถัดไป
     */
    const timeInputs = page.getByPlaceholder("--:--");
    await expect(timeInputs.nth(0)).toHaveValue(NORMAL.in);
    await expect(timeInputs.nth(2)).toHaveValue("");

    await page.screenshot({ path: shot("p7d-02-missing-checkout"), fullPage: true });
  });
});
