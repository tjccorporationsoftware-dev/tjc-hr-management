import { expect, test, type Page } from "@playwright/test";

import {
  STATE_COMPANY_ADMIN,
  STATE_PAYROLL,
  fieldByLabel,
  modalRoot,
  selectOptionByText,
  shot,
  thaiDateField,
} from "./_shared";

/**
 * เฟส 8a — รันเงินเดือนงวดที่ปิดไปแล้ว
 * -----------------------------------------------------------------------------
 * นี่คือจุดที่ทุกอย่างในเฟส 1–7 มาบรรจบกัน
 * เวลาทำงาน ค่าปรับ OT ใบลา ฐานเงินเดือน ประกันสังคม และภาษี
 * ต้องกลายเป็นยอดจ่ายจริงของพนักงานแต่ละคน
 *
 * ลำดับที่ระบบบังคับ (ดูจากปุ่มที่โผล่ตามสถานะในหน้า /payroll/periods)
 *   1) สร้างงวดเงินเดือน — สถานะ DRAFT
 *   2) เปิดงวด          — DRAFT → OPEN จึงจะสร้าง Run ได้
 *   3) สร้าง Payroll Run
 *   4) คำนวณ            — ดึงข้อมูลจากทุกโมดูลมาคิดเป็นเงิน
 *   5) ตรวจแล้ว         — ขั้นนี้บังคับ ปุ่มอนุมัติจะยังไม่โผล่ถ้าไม่ผ่านขั้นนี้
 *   6) อนุมัติ          — ต้องเป็นคนละคนกับผู้ตรวจ (แยกหน้าที่)
 *   7) จ่ายแล้ว
 *
 * ใช้งวด 26 มิ.ย. – 25 ก.ค. ที่ล็อกไปแล้วในเฟส 7c
 * เพราะเป็นงวดเดียวที่ข้อมูลเวลาทำงานผ่านการตรวจครบทั้ง 240 รายการ
 *
 * หมายเหตุเรื่องการยืนยันผล — หน้านี้ไม่มี toast เลยสักจุด
 * บันทึกสำเร็จคือ "ฟอร์มปิดเงียบๆ แล้วรายการเปลี่ยน" ส่วนบันทึกไม่สำเร็จ
 * จะขึ้นแถบแดงในฟอร์มแทน เทสจึงต้องดูสถานะบนหน้าจอ ไม่ใช่รอ toast
 */

const PERIOD = {
  code: "PAY-2569-07",
  name: "งวดเงินเดือน 07/2569",
  startDate: "2026-06-26",
  endDate: "2026-07-25",
  paymentDate: "2026-07-31",
  month: "07",
  yearBuddhist: "2569",
};

const RUN = {
  no: "RUN-2569-07",
  name: "รอบคำนวณเงินเดือน 07/2569",
};

async function openPeriods(page: Page) {
  await page.goto("/payroll/periods");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/งวดเงินเดือน/).first()).toBeVisible({
    timeout: 90_000,
  });

  /*
   * ต้องรอให้รายการงวดโหลดเสร็จจริงก่อน ไม่ใช่รอเวลาตายตัว
   * ป้ายนับจำนวนงวดจะขึ้นเมื่อโหลดเสร็จ (ขึ้น "0 งวด" ได้ถ้ายังไม่มีงวด)
   * ถ้านับตอนรายการยังว่าง เทสจะเข้าใจว่ายังไม่มีงวดแล้วสร้างซ้ำ
   * ซึ่งจะโดนรหัสงวดซ้ำตีกลับ
   */
  await expect(page.getByText(/^\d+ งวด$/).first()).toBeVisible({
    timeout: 180_000,
  });
  await page.waitForTimeout(6000);
}

/**
 * กางการ์ดงวดให้เห็นปุ่มจัดการ
 *
 * การ์ดงวดพับอยู่โดยค่าเริ่มต้น เห็นแค่ชื่อกับปุ่ม "แก้ไข" / "ดูรายการ"
 * ปุ่ม เปิดงวด / สร้าง Run / คำนวณ / อนุมัติ / จ่ายแล้ว อยู่ข้างในทั้งหมด
 * ถ้าไม่กาง เทสจะหาปุ่มไม่เจอแล้วข้ามเงียบๆ ทั้งที่งวดยังเป็นแบบร่าง
 */
async function selectPeriod(page: Page) {
  const expand = page.getByRole("button", { name: "ดูรายการ" });
  if ((await expand.count()) > 0) {
    await expand.first().click();
    await page.waitForTimeout(6000);
  }

  await expect(page.getByRole("button", { name: "พับรายการ" }).first()).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("เฟส 8a · รันเงินเดือน", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_PAYROLL });

  test("สร้างงวดเงินเดือน 26 มิ.ย. – 25 ก.ค.", async ({ page }) => {
    test.setTimeout(400_000);
    await openPeriods(page);

    /*
     * มีงวดนี้แล้วให้ข้าม เทสจึงรันซ้ำได้
     * รหัสงวดต้องไม่ซ้ำ ถ้ายิงซ้ำจะได้ error จากฐานข้อมูล
     */
    if ((await page.getByText(PERIOD.name).count()) === 0) {
      await page.getByRole("button", { name: "เพิ่มงวดเงินเดือน" }).first().click();
      await page.waitForTimeout(3000);

      const modal = modalRoot(page);

      /*
       * ต้องเลือกบริษัทก่อน ไม่งั้นหัวฟอร์มจะขึ้นว่า
       * "กรุณาเลือกบริษัทก่อนสร้างงวดเงินเดือน" และบันทึกไม่ผ่าน
       */
      await selectOptionByText(
        fieldByLabel(modal, "บริษัท", "select"),
        "บริษัท ทีเจซี คอร์ปอเรชั่น จำกัด",
      );
      await page.waitForTimeout(3000);

      /*
       * ตัวเลือกเดือนในหน้านี้เป็นตัวเลข "01"–"12" ไม่ใช่ชื่อเดือนไทย
       * ต่างจากหน้าอื่นในระบบที่ใช้ชื่อเดือน จึงต้องเลือกด้วยเลข
       */
      await selectOptionByText(fieldByLabel(modal, "เดือน", "select"), "07");
      await fieldByLabel(modal, "ปี พ.ศ.", "input").fill(PERIOD.yearBuddhist);
      await page.waitForTimeout(2500);

      await fieldByLabel(modal, "รหัสงวด", "input").fill(PERIOD.code);
      await fieldByLabel(modal, "ชื่องวด", "input").fill(PERIOD.name);

      /*
       * ระบบเดางวดให้จากนโยบายรอบเงินเดือนของบริษัท แต่ต้องเขียนทับ
       * ให้ตรงกับงวดที่ปิดและล็อกไว้จริงในเฟส 7c คือ 26 มิ.ย. – 25 ก.ค.
       * ถ้าวันที่ไม่ตรง จะไม่มีเวลาทำงานถูกดึงเข้ามาคิดเงินเลย
       */
      await thaiDateField(modal, "วันที่เริ่มงวด").fill(PERIOD.startDate);
      await thaiDateField(modal, "วันที่สิ้นสุดงวด").fill(PERIOD.endDate);
      await thaiDateField(modal, "วันที่จ่ายเงิน").fill(PERIOD.paymentDate);

      await page.getByRole("button", { name: "สร้างงวดเงินเดือน" }).click();

      /*
       * ฟอร์มปิดเอง = บันทึกผ่าน ถ้าไม่ผ่านจะค้างพร้อมแถบแดงบอกเหตุผล
       * จึงอ่านแถบแดงมารายงานแทนที่จะปล่อยให้ timeout เฉยๆ
       */
      const formError = modal.locator("div.bg-rose-50").first();
      await expect
        .poll(
          async () =>
            (await modal.count()) === 0
              ? "closed"
              : ((await formError.count()) > 0
                  ? (await formError.innerText()).trim()
                  : "waiting"),
          { timeout: 90_000 },
        )
        .toBe("closed");

      await page.waitForTimeout(6000);
    }

    await expect(page.getByText(PERIOD.name).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p8a-01-period"), fullPage: true });
  });

  test("เปิดงวดแล้วสร้าง Payroll Run", async ({ page }) => {
    test.setTimeout(600_000);
    await openPeriods(page);
    await selectPeriod(page);

    /*
     * ปุ่ม "เปิดงวด" โผล่เฉพาะตอนสถานะเป็น DRAFT
     * ไม่เจอปุ่มแปลว่าเปิดไปแล้ว ไม่ใช่ความล้มเหลว
     */
    const openButton = page.getByRole("button", { name: "เปิดงวด" });
    if ((await openButton.count()) > 0) {
      await openButton.first().click();
      await page.waitForTimeout(2500);
      await page.getByRole("button", { name: /^ยืนยัน/ }).last().click();
      await page.waitForTimeout(8000);
    }

    /*
     * สร้าง Run ได้หลายรอบต่อหนึ่งงวด ปุ่มจึงไม่หายไปหลังสร้างแล้ว
     * ต้องเช็คจากชื่อ Run เอง ไม่งั้นรันเทสซ้ำจะได้ Run ซ้ำเรื่อยๆ
     */
    const runExists = (await page.getByText(RUN.name).count()) > 0;
    const createRun = page.getByRole("button", { name: "สร้าง Run" });

    if (!runExists && (await createRun.count()) > 0) {
      await createRun.first().click();
      await page.waitForTimeout(3000);

      const modal = modalRoot(page);
      await fieldByLabel(modal, "Run No", "input").fill(RUN.no);
      await fieldByLabel(modal, "ชื่อ Run", "input").fill(RUN.name);

      /*
       * ต้องเจาะจงปุ่มในฟอร์ม เพราะชื่อ "สร้าง Payroll Run" ซ้ำกับปุ่มบนหน้า
       * ที่ใช้เปิดฟอร์มนี้ขึ้นมา ถ้าไม่เจาะจงจะโดน strict mode ตีกลับ
       */
      await modal
        .getByRole("button", { name: "สร้าง Payroll Run" })
        .click();
      /*
       * สร้าง Run ฝั่งหลังบ้าน upsert ผังรายรับ/รายหักมาตรฐาน 22 รายการก่อน
       * ครั้งแรกของบริษัทจึงช้ากว่าปกติมาก ต้องรอนานพอ
       */
      await expect(modal).toHaveCount(0, { timeout: 180_000 });
      await page.waitForTimeout(8000);
    }

    await expect(page.getByText(RUN.name).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({ path: shot("p8a-02-run"), fullPage: true });
  });

  test("คำนวณเงินเดือนทั้งงวด", async ({ page }) => {
    test.setTimeout(900_000);
    await openPeriods(page);
    await selectPeriod(page);

    /*
     * ปุ่ม "คำนวณ" ขึ้นเฉพาะสถานะที่ยังคำนวณได้
     * ไม่มีปุ่ม = คำนวณไปแล้ว ให้ไปตรวจผลลัพธ์ต่อได้เลย
     */
    const calculate = page.getByRole("button", { name: "คำนวณ", exact: true });
    if ((await calculate.count()) > 0) {
      await calculate.first().click();

      /*
       * กล่องยืนยันของแต่ละขั้นใช้ข้อความบนปุ่มไม่เหมือนกัน
       * คำนวณ = "เริ่มคำนวณ" · อนุมัติ = "อนุมัติ" · จ่ายแล้ว = "Mark as Paid"
       * ไม่มีขั้นไหนใช้คำว่า "ยืนยัน" เฉยๆ เลย จึงต้องระบุให้ตรงทีละขั้น
       */
      await page
        .getByRole("button", { name: "เริ่มคำนวณ", exact: true })
        .click();

      /*
       * คำนวณทั้งบริษัทใช้เวลานาน ดึงข้อมูลจากทุกโมดูลมารวมกัน
       * รู้ว่าจบเมื่อปุ่มถัดไปคือ "ตรวจแล้ว" โผล่ขึ้นมา
       * ไม่ใช่ "อนุมัติ" — สถานะหลังคำนวณคือ CALCULATED ซึ่งต้องผ่านการตรวจก่อน
       */
      await expect(
        page.getByRole("button", { name: "ตรวจแล้ว", exact: true }).first(),
      ).toBeVisible({ timeout: 300_000 });
      await page.waitForTimeout(10_000);
    }

    /*
     * ต้องมีคนถูกคำนวณจริง ไม่ใช่ Run เปล่า
     * ถ้าไม่มีพนักงานเข้าเงื่อนไข ระบบจะสร้าง Run สำเร็จแต่ยอดเป็นศูนย์ทั้งหมด
     * การ์ด Run บอกจำนวนคนไว้ ต้องไม่ใช่ "0 คน"
     */
    await expect(page.getByText(/^[1-9]\d* คน$/).first()).toBeVisible({
      timeout: 60_000,
    });

    await page.screenshot({ path: shot("p8a-03-calculated"), fullPage: true });
  });

  test("ผู้ตรวจสอบรอบจ่ายทำเครื่องหมายว่าตรวจแล้ว", async ({ page }) => {
    test.setTimeout(600_000);
    await openPeriods(page);
    await selectPeriod(page);

    const steps = [
      { button: "ตรวจแล้ว", confirm: "ยืนยันว่าตรวจ Payroll Run แล้ว?" },
    ];

    for (const step of steps) {
      const button = page.getByRole("button", { name: step.button, exact: true });
      if ((await button.count()) === 0) continue;

      await button.first().click();

      /*
       * ปุ่มยืนยันในกล่องคือปุ่มสุดท้ายของกล่องนั้น
       * อ้างจากหัวข้อกล่องแทนชื่อปุ่ม เพราะ "อนุมัติ" ซ้ำกับปุ่มบนหน้า
       * และขั้นจ่ายแล้วใช้คำว่า "Mark as Paid" ซึ่งเดาไม่ได้จากชื่อปุ่มบนหน้า
       */
      const dialog = page
        .locator("div.fixed.inset-0")
        .filter({ hasText: step.confirm })
        .last();
      await dialog.getByRole("button").last().click();

      // ปุ่มของขั้นนี้ต้องหายไปหลังทำสำเร็จ เพราะสถานะ Run เดินหน้าไปแล้ว
      await expect(button.first()).toBeHidden({ timeout: 180_000 });
      await page.waitForTimeout(8000);
    }

    await page.screenshot({ path: shot("p8a-04-reviewed"), fullPage: true });
  });
});

/*
 * ต้องแยก describe เพราะระบบบังคับหลักแยกหน้าที่ (segregation of duties)
 *
 * ถ้าคนตรวจกดอนุมัติเอง ระบบจะตอบว่า
 * "ผู้อนุมัติต้องไม่ใช่คนเดียวกับผู้ตรวจสอบรอบการจ่าย กรุณาให้ผู้มีสิทธิ์อีกคนเป็นผู้อนุมัติ"
 *
 * เป็นการควบคุมที่ถูกต้อง เงินเดือนทั้งบริษัทไม่ควรออกได้ด้วยมือคนเดียว
 * จึงต้องใช้ผู้ดูแลบริษัทซึ่งมีสิทธิ์ PAYROLL_APPROVE เหมือนกันมาอนุมัติแทน
 */
test.describe("เฟส 8a · ผู้อนุมัติอีกคนปิดรอบจ่าย", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("อนุมัติแล้วทำเครื่องหมายจ่ายแล้ว", async ({ page }) => {
    test.setTimeout(1_200_000);
    await openPeriods(page);
    await selectPeriod(page);

    /*
     * ปุ่มยืนยันในกล่องใช้คำต่างจากปุ่มบนหน้า และเดาจากชื่อปุ่มบนหน้าไม่ได้
     * ขั้นจ่ายแล้วใช้คำว่า "Mark as Paid" ซึ่งเป็นภาษาอังกฤษคำเดียวในหน้านี้
     */
    const steps = [
      {
        button: "อนุมัติ",
        dialog: "อนุมัติ Payroll Run นี้?",
        confirm: "อนุมัติ",
      },
      {
        button: "จ่ายแล้ว",
        dialog: "บันทึกว่าจ่ายเงินแล้ว?",
        confirm: "Mark as Paid",
      },
    ];

    for (const step of steps) {
      const button = page.getByRole("button", { name: step.button, exact: true });
      if ((await button.count()) === 0) continue;

      await button.first().click();

      const dialog = page
        .locator("div.fixed.inset-0")
        .filter({ hasText: step.dialog })
        .last();

      // กล่องต้องเปิดจริง ไม่งั้นขั้นถัดไปจะกดลงที่ว่างแล้วเงียบ
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      /*
       * กล่องนี้แสดงข้อความผิดพลาดในตัวเอง (ต่างจากกล่องเปลี่ยนสถานะงวด)
       * ถ้าขึ้นแถบแดง ให้ยกมารายงานเลย จะได้ไม่ต้องเดาว่าทำไมปุ่มไม่หาย
       */
      await dialog
        .getByRole("button", { name: step.confirm, exact: true })
        .click();

      const dialogError = dialog.locator("div.bg-rose-50").first();
      await expect
        .poll(
          async () =>
            (await button.count()) === 0
              ? "done"
              : ((await dialogError.count()) > 0
                  ? (await dialogError.innerText()).trim()
                  : "waiting"),
          /*
           * ขั้น "จ่ายแล้ว" ช้ากว่าขั้นอื่นมาก เพราะนอกจากเปลี่ยนสถานะ Run
           * ยังไล่ล็อกสรุปเวลาทำงานทุกวันของทุกคนในงวดด้วย
           * วัดจริงแล้วเกิน 3 นาที ระหว่างนั้นหน้าจอไม่บอกอะไรนอกจากปุ่มจาง
           */
          { timeout: 420_000 },
        )
        .toBe("done");

      await page.waitForTimeout(8000);
    }

    /*
     * ต้องจบที่สถานะจ่ายแล้วจริง
     *
     * ห้ามเช็คด้วยข้อความ "จ่ายแล้ว" ทั้งหน้า เพราะการ์ดสรุปด้านบนมีคำนี้
     * เป็นชื่อช่องอยู่ตลอดเวลา เคยทำให้เทสผ่านเขียวทั้งที่ Run ยังเป็นแบบร่าง
     *
     * เช็คจากปุ่มแทน — แต่ละสถานะจะมีปุ่มของขั้นถัดไปโผล่เสมอ
     * แบบร่าง→คำนวณ · คำนวณแล้ว→ตรวจแล้ว · ตรวจแล้ว→อนุมัติ · อนุมัติแล้ว→จ่ายแล้ว
     * ไม่เหลือปุ่มไหนเลยแปลว่าเดินจนสุดทางแล้วจริง
     */
    for (const remaining of ["คำนวณ", "ตรวจแล้ว", "อนุมัติ", "จ่ายแล้ว"]) {
      await expect(
        page.getByRole("button", { name: remaining, exact: true }),
      ).toHaveCount(0, { timeout: 60_000 });
    }

    await page.screenshot({ path: shot("p8a-05-paid"), fullPage: true });
  });
});
