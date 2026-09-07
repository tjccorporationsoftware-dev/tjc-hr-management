import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  STATE_COMPANY_ADMIN,
  STATE_EMPLOYEE,
  STATE_PAYROLL,
  expectToast,
  fieldByLabel,
  modalRoot,
  selectOptionByText,
  shot,
  thaiDateField,
} from "./_shared";

/**
 * เฟส 7e — คำขอที่กระทบงวดเวลาทำงาน
 * -----------------------------------------------------------------------------
 * เฟส 7a–7c พิสูจน์แค่ "เวลาเข้า-ออกและค่าปรับ" ซึ่งเป็นแค่ส่วนเดียวของยอดจริง
 * เฟสนี้เติมอีก 4 เส้นทางที่ตั้งสายอนุมัติไว้ในเฟส 2f แต่ยังไม่เคยมีใครยื่น
 *
 *   OT              เพิ่มเงินให้พนักงาน
 *   ขอแก้เวลา       ลบค่าปรับลืมลงเวลาที่เกิดจากความผิดพลาด
 *   ทำงานนอกสถานที่ ให้ลงเวลานอกพื้นที่ได้โดยไม่ถือว่าขาดงาน
 *   ลาย้อนหลัง      เปลี่ยนวันขาดงานเป็นวันลา
 *
 * ใช้งวดปัจจุบัน 26 ก.ค. – 25 ส.ค. เพราะงวดก่อนถูกล็อกไปแล้ว
 * ข้อมูลตั้งต้นเตรียมไว้ในเฟส 7d
 */

const OT = {
  date: "2026-07-28",
  reason: "ปิดงบการเงินประจำเดือน ต้องอยู่ต่อหลังเลิกงาน",
};

const TIME_ADJUST = {
  date: "2026-07-30",
  hour: "17",
  minute: "35",
  reason: "ลืมสแกนออกเพราะรีบไปส่งเอกสารให้ลูกค้า",
};

const OFFSITE = {
  date: "2026-08-05",
  startHour: "09",
  startMinute: "00",
  endHour: "16",
  endMinute: "00",
  reason: "ไปตรวจรับงานที่ไซต์ลูกค้าย่านบางนา",
};

/** ใบรับรองแพทย์จำลอง — ไฟล์ PNG จริงเพราะช่องแนบรับแค่ JPEG/PNG */
const MEDICAL_CERTIFICATE = path.join(
  __dirname,
  "fixtures",
  "medical-certificate.png",
);

const LEAVE_IN_PERIOD = {
  date: "2026-07-29",
  reason: "ป่วยเป็นไข้หวัดใหญ่ มีใบรับรองแพทย์",
};

async function openEss(page: Page, href: string, heading: RegExp) {
  await page.goto(href);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(heading).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(10_000);
}

test.describe("เฟส 7e · พนักงานยื่นคำขอที่กระทบงวด", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_EMPLOYEE });

  test("ยื่นขอ OT ย้อนหลังในงวด", async ({ page }) => {
    test.setTimeout(300_000);
    await openEss(page, "/ess/requests/overtime", /OT|ล่วงเวลา/);

    /*
     * เคยยื่นแล้วให้ข้าม เทสจึงรันซ้ำได้
     *
     * ต้องนับจากแถวในตารางเท่านั้น และต้องข้ามจริงๆ
     * ถ้ายื่นซ้ำวันเดิม ระบบจะตอบ "เกิดข้อผิดพลาดจากฐานข้อมูล"
     * ซึ่งเป็นข้อความที่ผู้ใช้อ่านไม่รู้เรื่องว่าชนกับใบเดิม
     */
    /*
     * ต้องรอให้ตารางโหลดรายการเดิมเสร็จก่อนนับ
     * ถ้านับตอนตารางยังว่าง จะเข้าใจว่ายังไม่เคยยื่นแล้วยื่นซ้ำ
     * ซึ่งเคยทำให้เกิดใบ OT วันเดียวกันสองใบจริง (ตอนนี้หลังบ้านกันไว้แล้ว)
     */
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/ยังไม่มีคำขอ|ไม่พบ/).first()),
    ).toBeVisible({ timeout: 60_000 });

    // เทียบด้วยเหตุผล ไม่ใช่วันที่ เพราะหน้าจอแสดงเป็น พ.ศ. ไม่ใช่ ค.ศ.
    const existing = page.locator("tbody tr").filter({ hasText: OT.reason });

    if ((await existing.count()) === 0) {
      await page.getByRole("button", { name: /เปิดฟอร์มคำขอ OT/ }).click();
      await page.waitForTimeout(2500);

      const modal = modalRoot(page);
      await thaiDateField(modal, "วันที่ทำ OT").fill(OT.date);

      /*
       * ใช้ชุดเวลาสำเร็จรูป "หลังเลิกงาน 2 ชม." แทนการพิมพ์เวลาเอง
       * เพราะเป็นทางที่พนักงานใช้จริงและกันพิมพ์เวลาผิดรูปแบบ
       */
      await page.getByRole("button", { name: /หลังเลิกงาน 2 ชม/ }).click();
      await page.waitForTimeout(1500);

      await page
        .getByPlaceholder(/ระบุเหตุผลในการทำ OT/)
        .fill(OT.reason);

      await page.getByRole("button", { name: "ส่งคำขอ OT" }).click();
      // ส่งคำขอ OT ใช้เวลานานกว่าฟอร์มอื่น เพราะไปเดินสายอนุมัติต่อทันที
      await expectToast(page, /ส่งคำขอ OT เรียบร้อย|ส่งคำขอ/, 60_000);
      await page.waitForTimeout(3000);
    }

    await expect(page.getByText(OT.reason).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p7e-01-ot"), fullPage: true });
  });

  test("ยื่นขอแก้เวลาสำหรับวันที่ลืมลงเวลาออก", async ({ page }) => {
    test.setTimeout(300_000);
    await openEss(page, "/ess/requests/time-adjust", /แก้เวลา|นอกสถานที่/);

    if ((await page.getByText(TIME_ADJUST.reason).count()) === 0) {
      await page.getByRole("button", { name: /เปิดฟอร์มคำขอ/ }).first().click();
      await page.waitForTimeout(2500);

      const modal = modalRoot(page);
      await selectOptionByText(
        fieldByLabel(modal, "ประเภทคำขอ", "select"),
        "ลืมลงเวลาออก",
      );
      await page.waitForTimeout(1500);

      /*
       * ต้องเลือก "รายการที่ต้องการแก้" ให้ตรงกับประเภทคำขอด้วย
       * ค่าเริ่มต้นคือ "เข้างานเช้า" ซึ่งไม่ใช่สิ่งที่ลืมลงเวลา
       */
      await selectOptionByText(
        fieldByLabel(modal, "รายการที่ต้องการแก้", "select"),
        "เวลาออกงาน",
      );
      await page.waitForTimeout(1000);

      await thaiDateField(modal, "วันที่ต้องการแก้").fill(TIME_ADJUST.date);

      /*
       * ต้องตั้งเวลาที่ถูกต้องด้วย ค่าเริ่มต้นคือ 08:00
       * ถ้าปล่อยไว้จะได้เวลาออกงาน 08:00 ซึ่งอยู่ก่อนเวลาเข้างาน 08:25
       * และระบบก็รับไว้โดยไม่ทักท้วง กลายเป็นข้อมูลที่เป็นไปไม่ได้จริง
       */
      await modal
        .getByLabel("เวลาที่ถูกต้อง ชั่วโมง")
        .selectOption(TIME_ADJUST.hour);
      await modal
        .getByLabel("เวลาที่ถูกต้อง นาที")
        .selectOption(TIME_ADJUST.minute);

      // เหตุผลเป็นช่องบังคับ ถ้าไม่กรอกเบราว์เซอร์จะกันไว้เองโดยไม่มี toast
      await page
        .getByPlaceholder("เช่น ลืมสแกนนิ้วตอนเข้างาน, เครื่องสแกนขัดข้อง")
        .fill(TIME_ADJUST.reason);

      await page.getByRole("button", { name: "ส่งคำขอแก้เวลา" }).click();
      await expectToast(page, /ส่งคำขอแก้เวลาเรียบร้อย|ส่งคำขอ/);
      await page.waitForTimeout(3000);
    }

    await expect(page.getByText(TIME_ADJUST.reason).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p7e-02-time-adjust"), fullPage: true });
  });

  test("ยื่นขอทำงานนอกสถานที่", async ({ page }) => {
    test.setTimeout(300_000);
    await openEss(page, "/ess/requests/time-adjust", /แก้เวลา|นอกสถานที่/);

    if (
      (await page.locator("tbody tr").filter({ hasText: OFFSITE.reason }).count()) === 0
    ) {
      await page.getByRole("button", { name: /เปิดฟอร์มคำขอ/ }).first().click();
      await page.waitForTimeout(2500);

      const modal = modalRoot(page);

      /*
       * คำขอนอกสถานที่อยู่ในฟอร์มเดียวกับขอแก้เวลา
       * เลือกประเภทเป็น "ทำงานนอกสถานที่" แล้วฟอร์มจะสลับช่องให้เอง
       */
      await selectOptionByText(
        fieldByLabel(modal, "ประเภทคำขอ", "select"),
        "ทำงานนอกสถานที่",
      );
      await page.waitForTimeout(2000);

      await thaiDateField(modal, "วันที่ทำงานนอกสถานที่").fill(OFFSITE.date);
      await modal.getByLabel("เวลาเริ่ม ชั่วโมง").selectOption(OFFSITE.startHour);
      await modal.getByLabel("เวลาเริ่ม นาที").selectOption(OFFSITE.startMinute);
      await modal.getByLabel("เวลาสิ้นสุด ชั่วโมง").selectOption(OFFSITE.endHour);
      await modal.getByLabel("เวลาสิ้นสุด นาที").selectOption(OFFSITE.endMinute);

      await page
        .getByPlaceholder(
          "เช่น ออกไปตรวจรับงานลูกค้า, ติดตั้งอุปกรณ์, ประชุมนอกสถานที่",
        )
        .fill(OFFSITE.reason);

      await page.getByRole("button", { name: "ส่งคำขอ Offsite" }).click();
      await expectToast(page, /ส่งคำขอ Offsite เรียบร้อย|ส่งคำขอ/);
      await page.waitForTimeout(3000);
    }

    await expect(page.getByText(OFFSITE.reason).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p7e-05-offsite"), fullPage: true });
  });

  test("ยื่นใบลาย้อนหลังในงวดสำหรับวันที่ไม่มีเวลาทำงาน", async ({ page }) => {
    test.setTimeout(300_000);
    await openEss(page, "/ess/requests/leave", /ลา/);

    /*
     * วันที่ 29 ก.ค. จงใจไม่กรอกเวลาไว้ในเฟส 7d
     * ถ้าไม่ยื่นลา วันนั้นจะถูกนับเป็นขาดงานและหักเงิน
     * การลาย้อนหลังจึงเป็นเส้นทางที่พนักงานใช้จริงเมื่อป่วยกะทันหัน
     */
    if (
      (await page.locator("tbody tr").filter({ hasText: LEAVE_IN_PERIOD.reason }).count()) === 0
    ) {
      await page.getByRole("button", { name: "เปิดฟอร์มใบลา" }).click();
      await page.waitForTimeout(2500);

      const modal = modalRoot(page);
      await selectOptionByText(
        modal.locator("select").filter({ hasText: /เลือกประเภทลา/ }).first(),
        "ลาป่วยมีใบรับรองแพทย์",
      );
      await thaiDateField(modal, "วันที่เริ่มลา").fill(LEAVE_IN_PERIOD.date);
      await thaiDateField(modal, "วันที่สิ้นสุดลา").fill(LEAVE_IN_PERIOD.date);
      await page
        .getByPlaceholder("ระบุเหตุผลในการลา")
        .fill(LEAVE_IN_PERIOD.reason);

      /*
       * ลาย้อนหลังต้องระบุเหตุผลเพิ่มอีกช่อง ระบบบังคับไว้
       * ถ้าไม่กรอกจะขึ้น "กรุณาระบุเหตุผลการลาย้อนหลัง"
       */
      const retroReason = page.getByPlaceholder(
        "ระบุเหตุผลที่ยื่นย้อนหลัง เช่น มีเหตุจำเป็น / เอกสารล่าช้า",
      );
      if ((await retroReason.count()) > 0) {
        await retroReason.fill("ป่วยกะทันหัน เพิ่งได้ใบรับรองแพทย์");
      }

      /*
       * ลาป่วยตั้งไว้ว่าต้องแนบหลักฐาน ไม่แนบจะขึ้น "กรุณาแนบรูปหลักฐานประกอบใบลา"
       * ช่องรับเฉพาะ JPEG/PNG จึงใช้ไฟล์รูปจริง ไม่ใช่ไฟล์ข้อความเปลี่ยนนามสกุล
       */
      await modal
        .locator("input[type='file']")
        .first()
        .setInputFiles(MEDICAL_CERTIFICATE);
      await page.waitForTimeout(2000);

      await page.getByRole("button", { name: "ส่งใบลา" }).click();
      await expectToast(page, /ส่งใบลาเรียบร้อย|ส่งใบลา/, 60_000);
      await page.waitForTimeout(3000);
    }

    await expect(page.getByText(LEAVE_IN_PERIOD.reason).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p7e-06-leave"), fullPage: true });
  });
});

test.describe("เฟส 7e · หัวหน้าอนุมัติคำขอในงวด", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_PAYROLL });


  test("อนุมัติคำขอที่ค้างอยู่ทั้งหมด", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto("/approvals");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(12_000);

    let approved = 0;

    /*
     * อนุมัติทีละใบจนกว่าคิวจะว่าง
     * รายการจะหายออกจากตัวกรอง "รออนุมัติ" ทันทีที่อนุมัติ
     * จึงหยิบแถวแรกเสมอ ไม่ใช่ไล่ตามดัชนี
     */
    for (let guard = 0; guard < 20; guard += 1) {
      const row = page.locator("tbody tr").first();
      if ((await row.count()) === 0) break;

      const approveButton = row.getByRole("button", {
        name: "อนุมัติ",
        exact: true,
      });
      if ((await approveButton.count()) === 0) break;

      /*
       * ปุ่มถูกปิดเมื่อรายการนั้นอนุมัติไปแล้วหรือยังไม่ถึงคิวของเรา
       * ถือว่าไม่มีอะไรให้ทำต่อ ไม่ใช่ความล้มเหลว
       */
      if (!(await approveButton.isEnabled())) break;

      await approveButton.click();
      await page.waitForTimeout(2000);
      await page
        .getByRole("button", { name: "อนุมัติ", exact: true })
        .last()
        .click();
      await page.waitForTimeout(5000);
      approved += 1;
    }

    test.info().annotations.push({
      type: "สรุป",
      description: `อนุมัติไป ${approved} รายการ`,
    });

    await page.screenshot({ path: shot("p7e-03-approved"), fullPage: true });
  });
});

/*
 * แยก describe เพราะหน้าตรวจเวลาทำงานรายวันต้องมีสิทธิ์อ่านทั้งบริษัท
 * บัญชีเงินเดือนเข้าไม่ได้ จะถูกพากลับหน้าหลักตามสิทธิ์
 */
test.describe("เฟส 7e · ผลของคำขอต่อข้อมูลในงวด", () => {
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("อนุมัติขอแก้เวลาแล้วค่าปรับลืมลงเวลาต้องหายไป", async ({ page }) => {
    test.setTimeout(400_000);

    await page.goto("/attendance");
    await page.waitForLoadState("domcontentloaded");

    /*
     * หน้านี้ดึงข้อมูลทั้งเดือนมาคำนวณก่อนจึงจะแสดงตัวกรอง
     * ต้องรอให้ช่องวันที่โผล่จริง ไม่ใช่รอเวลาตายตัว
     * ไม่งั้นจะกรอกไม่ได้เพราะหน้ายังขึ้น "กำลังโหลดข้อมูล Attendance"
     */
    const dateInputs = page.locator("input[type='date']");
    await expect(dateInputs.first()).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(3000);
    await dateInputs.nth(0).fill(TIME_ADJUST.date);
    await dateInputs.nth(1).fill(TIME_ADJUST.date);
    await page.waitForTimeout(10_000);

    /*
     * ผลลัพธ์ที่ต้องได้คือวันนั้นมีเวลาออกงานตามที่ขอแก้
     * ไม่ใช่ยังขึ้น "ไม่พบเวลา" ซึ่งแปลว่าการอนุมัติไม่ได้ย้อนกลับมาแก้ข้อมูล
     */
    const row = page.locator("tbody tr").filter({ hasText: "กมล" }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(
      `${TIME_ADJUST.hour}:${TIME_ADJUST.minute}`,
    );
    await expect(row).not.toContainText("ไม่พบเวลา");

    await page.screenshot({ path: shot("p7e-04-adjust-effect"), fullPage: true });
  });
});
