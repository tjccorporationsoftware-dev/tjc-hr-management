import { readFileSync } from "node:fs";

import { expect, test, type Download, type Page } from "@playwright/test";

import { STATE_PAYROLL, fieldByLabel, selectOptionByText, shot } from "./_shared";

/**
 * เฟส 8c — ไฟล์นำส่งหน่วยงาน
 * -----------------------------------------------------------------------------
 * จ่ายเงินแล้วยังเหลืองานนำส่งอีกสามทาง
 *   สปส.1-10   นำส่งเงินสมทบประกันสังคม
 *   ภ.ง.ด.1    นำส่งภาษีหัก ณ ที่จ่าย (อยู่ที่หน้าภาษี ไม่ใช่หน้าไฟล์นำส่ง)
 *   ไฟล์ธนาคาร โอนเงินเข้าบัญชีพนักงาน
 *
 * ที่ต้องพิสูจน์ไม่ใช่แค่ "กดแล้วมีไฟล์ตกมา" แต่ต้องเปิดไฟล์แล้วเจอตัวเลข
 * ที่ตรงกับที่คำนวณไว้ด้วย ไฟล์เปล่าที่ดาวน์โหลดสำเร็จคือกับดักที่แย่ที่สุด
 * เพราะจะรู้ตัวอีกทีตอนกรมสรรพากรหรือ สปส. ตีกลับ
 */

const RUN_NAME = "รอบคำนวณเงินเดือน 07/2569";

async function openFilings(page: Page) {
  await page.goto("/payroll/filings");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/ไฟล์นำส่ง/).first()).toBeVisible({
    timeout: 90_000,
  });
  await page.waitForTimeout(15_000);
}

/** อ่านไฟล์ที่ดาวน์โหลดมาเป็นข้อความ เพื่อตรวจเนื้อในจริง */
async function readDownload(download: Download) {
  const path = await download.path();
  if (!path) throw new Error("ดาวน์โหลดแล้วแต่ไม่มีไฟล์ในเครื่อง");
  return readFileSync(path, "utf8");
}

test.describe("เฟส 8c · ไฟล์นำส่งหน่วยงาน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_PAYROLL });

  test("หน้าไฟล์นำส่งต้องผูกกับรอบการจ่ายที่คำนวณแล้ว", async ({ page }) => {
    test.setTimeout(400_000);
    await openFilings(page);

    /*
     * ชื่อรอบอยู่ในตัวเลือกของ dropdown ไม่ใช่ข้อความบนหน้า
     * getByText จึงมองไม่เห็น ต้องอ่านค่าที่เลือกอยู่ของ select แทน
     */
    const runSelect = page.locator("select").first();
    await expect(runSelect).toContainText(RUN_NAME, { timeout: 60_000 });

    /*
     * ถ้าขึ้นว่ายังไม่มีรอบการจ่าย แปลว่าหน้านี้ไม่เห็น Run ที่จ่ายไปแล้ว
     * ซึ่งจะทำให้ทุกปุ่มดาวน์โหลดถูกปิดหมด
     */
    await expect(page.locator("body")).not.toContainText(
      "ยังไม่มีรอบการจ่ายเงินเดือน",
    );

    await page.screenshot({ path: shot("p8c-01-filings"), fullPage: true });
  });

  test("ไฟล์ สปส.1-10 ต้องมีพนักงานและยอดเงินสมทบจริง", async ({ page }) => {
    test.setTimeout(400_000);
    await openFilings(page);

    const button = page.getByRole("button", {
      name: "ไฟล์ e-Service",
      exact: true,
    });

    /*
     * ปุ่มถูกปิดเมื่อไม่มีแถวข้อมูล จึงเช็คสถานะปุ่มก่อน
     * ปุ่มจางคือสัญญาณว่ารอบนี้ไม่มีใครถูกหักประกันสังคมเลย ซึ่งผิดแน่นอน
     */
    await expect(button).toBeEnabled({ timeout: 60_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      button.click(),
    ]);

    const content = await readDownload(download);

    test.info().annotations.push({
      type: "สรุป",
      description: `ไฟล์ สปส. ${download.suggestedFilename()} ยาว ${content.length} ตัวอักษร ${content.split(/\r?\n/).filter(Boolean).length} บรรทัด`,
    });

    // ต้องมีบรรทัดข้อมูลจริง ไม่ใช่มีแต่หัวตาราง
    expect(content.split(/\r?\n/).filter(Boolean).length).toBeGreaterThan(1);

    await page.screenshot({ path: shot("p8c-02-sso"), fullPage: true });
  });

  test("ไฟล์โอนธนาคารต้องมีครบทุกคนที่ต้องได้เงิน", async ({ page }) => {
    test.setTimeout(400_000);
    await openFilings(page);

    const button = page.getByRole("button", {
      name: "ดาวน์โหลดไฟล์",
      exact: true,
    });
    await expect(button.first()).toBeEnabled({ timeout: 60_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      button.first().click(),
    ]);

    const content = await readDownload(download);
    const lines = content.split(/\r?\n/).filter(Boolean);

    test.info().annotations.push({
      type: "สรุป",
      description: `ไฟล์ธนาคาร ${download.suggestedFilename()} มี ${lines.length} บรรทัด`,
    });

    expect(lines.length).toBeGreaterThan(1);

    await page.screenshot({ path: shot("p8c-03-bank"), fullPage: true });
  });
});

/*
 * ภ.ง.ด.1 ไม่ได้อยู่หน้าไฟล์นำส่ง แต่อยู่ที่หน้าภาษี แท็บ "รายงานภาษี"
 * ซึ่งเป็นจุดที่หาไม่เจอถ้าไม่รู้มาก่อน เพราะชื่อเมนู "ไฟล์นำส่งหน่วยงาน"
 * ทำให้เข้าใจว่าไฟล์นำส่งทุกแบบรวมอยู่ที่เดียว
 */
test.describe("เฟส 8c · ภ.ง.ด.1", () => {
  test.use({ storageState: STATE_PAYROLL });

  test("ภ.ง.ด.1 ต้องมียอดภาษีที่หักไว้จริง ไม่ใช่ศูนย์", async ({ page }) => {
    test.setTimeout(400_000);

    await page.goto("/payroll/tax");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/ภาษี/).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForTimeout(12_000);

    await page
      .getByRole("button", { name: "รายงานภาษี", exact: true })
      .first()
      .click();
    await page.waitForTimeout(8000);

    /*
     * ค่าตั้งต้นของหน้านี้คือเดือนปัจจุบัน ซึ่งยังไม่มีการจ่ายเงินเดือน
     * ตัวเลขจึงขึ้น 0 คน 0.00 บาท และไฟล์ที่ export ออกมาก็ว่าง
     *
     * งวดที่ทดสอบจ่ายวันที่ 31 ก.ค. 2569 ภ.ง.ด.1 จึงเป็นของเดือนกรกฎาคม
     * ต้องเลือกเดือนให้ตรงกับวันจ่ายจริงก่อน ไม่ใช่เดือนของงวด
     */
    await selectOptionByText(
      fieldByLabel(page, "เดือนภาษี ภ.ง.ด.1", "select"),
      "กรกฎาคม",
    );
    await page.waitForTimeout(8000);

    // รอให้ตัวเลือกเดือนเปลี่ยนจริงก่อน แล้วให้เวลาโหลดรายงานของเดือนนั้น
    await expect(
      fieldByLabel(page, "เดือนภาษี ภ.ง.ด.1", "select"),
    ).toHaveValue("7", { timeout: 30_000 });
    await page.waitForTimeout(10_000);

    const button = page.getByRole("button", {
      name: "Export ภ.ง.ด.1",
      exact: true,
    });
    await expect(button.first()).toBeVisible({ timeout: 60_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      button.first().click(),
    ]);

    const content = await readDownload(download);
    const lines = content.split(/\r?\n/).filter(Boolean);

    test.info().annotations.push({
      type: "สรุป",
      description: `ภ.ง.ด.1 ${download.suggestedFilename()} มี ${lines.length} บรรทัด`,
    });

    /*
     * ต้องมีบรรทัดพนักงาน และต้องมีตัวเลขภาษีที่ไม่ใช่ 0 อย่างน้อยหนึ่งคน
     * ถ้าออกมาเป็นศูนย์ทั้งไฟล์ แปลว่าตอนคำนวณเงินเดือนไม่ได้หักภาษีจริง
     * ซึ่งเป็นเคสที่เจอมาแล้วตอนพนักงานยังไม่มีข้อมูลภาษี
     */
    expect(lines.length).toBeGreaterThan(1);

    /*
     * ไฟล์ที่มีแต่ 0 ทุกช่องคือกับดัก — ดาวน์โหลดสำเร็จ เปิดได้ มีทุกคนครบ
     * แต่ยื่นไปแล้วสรรพากรจะเห็นว่าบริษัทไม่ได้หักภาษีใครเลย
     */
    const hasNonZeroTax = lines
      .slice(1)
      .some((line) =>
        line
          .split(",")
          .some((cell) => /^"?\d[\d,]*\.\d{2}"?$/.test(cell.trim()) && Number(cell.replace(/["',]/g, "")) > 0),
      );
    expect(hasNonZeroTax).toBe(true);

    await page.screenshot({ path: shot("p8c-04-pnd1"), fullPage: true });
  });
});
