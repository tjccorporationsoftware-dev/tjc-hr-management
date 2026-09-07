import { expect, test, type Page } from "@playwright/test";

import { STATE_SUPERADMIN, shot } from "./_shared";

/**
 * เฟส 7a — กรอกเวลาทำงานย้อนหลังทั้งงวด
 * -----------------------------------------------------------------------------
 * งวดเงินเดือนของบริษัทนี้คือวันที่ 26 ถึง 25 ของเดือนถัดไป
 * งวดล่าสุดที่ปิดได้จริงคือ 26 มิ.ย. – 25 ก.ค. 2569
 *
 * ต้องมีเวลาทำงานครบทั้งงวดก่อน ไม่งั้นเฟส 8 จะคิดว่าขาดงานทุกวัน
 * และหักเงินจนติดลบ ซึ่งไม่ได้พิสูจน์อะไรเลย
 *
 * ใช้หน้า "กรอกเวลาแทน" ของผู้ดูแลแพลตฟอร์ม ซึ่งออกแบบมาให้กรอกทั้งวันทีเดียว
 * เป็นเส้นทางเดียวกับที่ HR ใช้จริงตอนพนักงานลืมลงเวลาหรือเครื่องสแกนเสีย
 *
 * ข้อมูลตั้งใจให้มีความหลากหลายเหมือนของจริง
 *   - ส่วนใหญ่มาตรงเวลา
 *   - บางวันมาสาย เพื่อให้มีค่าปรับมาสายไปคิดในงวด
 *   - หนึ่งวันขาดงาน เพื่อทดสอบการหักขาดงาน
 *   - ลืมลงเวลาออก เพื่อทดสอบค่าปรับลืมลงเวลา
 */

/** วันทำงานของงวด 26 มิ.ย. – 25 ก.ค. 2569 (หยุดเฉพาะอาทิตย์) */
const PERIOD_DAYS = [
  "2026-06-26", "2026-06-27", "2026-06-29", "2026-06-30",
  "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04",
  "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09",
  "2026-07-10", "2026-07-11",
  "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18",
  "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24",
  "2026-07-25",
];

/** วันที่จงใจให้ผิดปกติ เพื่อให้มีรายการหักจริงในงวด */
const LATE_DAYS = new Set(["2026-07-02", "2026-07-15"]);
const ABSENT_DAYS = new Set(["2026-07-09"]);
const MISSING_CHECKOUT_DAYS = new Set(["2026-07-21"]);

const NORMAL = { in: "08:25", afternoon: "12:55", out: "17:35" };
const LATE = { in: "09:10", afternoon: "12:58", out: "17:32" };

async function openEntryPage(page: Page, date: string) {
  await page.goto("/platform/attendance-entry");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/พนักงาน/).first()).toBeVisible({
    timeout: 60_000,
  });

  await page.locator("input[type='date']").first().fill(date);
  // เปลี่ยนวันแล้วหน้าจะโหลดรายชื่อและเวลาที่บันทึกไว้ของวันนั้นใหม่
  await page.waitForTimeout(6000);
}

test.describe("เฟส 7a · กรอกเวลาทำงานย้อนหลัง", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_SUPERADMIN });

  test("กรอกเวลาทำงานให้ครบทั้งงวด 26 มิ.ย. – 25 ก.ค.", async ({ page }) => {
    // 25 วัน × โหลดหน้า + กรอก + บันทึก จึงต้องเผื่อเวลาไว้มาก
    test.setTimeout(1_800_000);

    let savedDays = 0;
    let lockedDays = 0;

    for (const date of PERIOD_DAYS) {
      await openEntryPage(page, date);

      const timeInputs = page.getByPlaceholder("--:--");
      const inputCount = await timeInputs.count();

      if (inputCount === 0) {
        throw new Error(`วันที่ ${date} ไม่มีช่องกรอกเวลาให้เลย`);
      }

      const saveAll = page.getByRole("button", { name: "บันทึกทั้งหมด" });

      if (ABSENT_DAYS.has(date)) {
        // ขาดงาน = ไม่กรอกอะไรเลย ระบบต้องตีเป็นขาดงานเอง
        continue;
      }

      const preset = LATE_DAYS.has(date) ? LATE : NORMAL;
      const skipCheckout = MISSING_CHECKOUT_DAYS.has(date);

      // ช่องเรียงเป็นชุดละ 3 ต่อพนักงานหนึ่งคน: เข้า / บ่าย / ออก
      for (let i = 0; i + 2 < inputCount; i += 3) {
        await timeInputs.nth(i).fill(preset.in);
        await timeInputs.nth(i + 1).fill(preset.afternoon);
        if (!skipCheckout) {
          await timeInputs.nth(i + 2).fill(preset.out);
        }
      }

      /*
       * ต้องเช็คปุ่ม "หลัง" กรอกเสมอ
       * เพราะปุ่มจะเปิดก็ต่อเมื่อมีรายการที่ยังไม่ได้บันทึกอยู่ในหน้า
       * ถ้าเช็คก่อนกรอก จะเจอว่าปิดอยู่ตลอดแล้วข้ามทุกวันโดยเทสยังผ่าน
       *
       * ปิดอยู่หลังกรอกแล้ว = วันนั้นบันทึกไปก่อนหน้านี้แล้ว ถือว่าผ่าน
       */
      if (await saveAll.isDisabled()) continue;

      await saveAll.click();

      /*
       * งวดที่ปิดและล็อกไปแล้วจะถูกระบบปฏิเสธ ซึ่งถูกต้องตามที่ควรเป็น
       * ไม่ใช่ความล้มเหลวของการทดสอบ จึงต้องแยกสองกรณีออกจากกัน
       *   สำเร็จ  → "บันทึกทั้งหมดแล้ว N คน"
       *   ถูกกัน  → "บันทึกสำเร็จ 0 คน ล้มเหลว N คน"
       */
      const saved = page.getByText(/บันทึกทั้งหมดแล้ว/);
      const blocked = page.getByText(/ล้มเหลว \d+ คน/);

      await expect(saved.or(blocked).first()).toBeVisible({ timeout: 60_000 });

      if ((await blocked.count()) > 0) {
        lockedDays += 1;
        continue;
      }

      savedDays += 1;
    }

    test.info().annotations.push({
      type: "สรุป",
      description: `บันทึกใหม่ ${savedDays} วัน · ถูกกันเพราะปิดงวดแล้ว ${lockedDays} วัน · ทั้งงวด ${PERIOD_DAYS.length} วัน`,
    });

    /*
     * ต้องมีข้อมูลจริงในระบบ ไม่ใช่แค่เดินจนจบลูป
     * เคสที่เคยพลาด: เช็คปุ่มผิดจังหวะจนข้ามทุกวัน แต่เทสยังผ่านเขียว
     * โดยฐานข้อมูลไม่มีเวลาทำงานสักรายการ
     */
    await page.goto("/platform/attendance-entry");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("input[type='date']").first().fill(PERIOD_DAYS[0]);
    await page.waitForTimeout(6000);
    await expect(page.getByPlaceholder("--:--").first()).toHaveValue(NORMAL.in);

    await page.screenshot({ path: shot("p7a-01-entry"), fullPage: true });
  });
});
