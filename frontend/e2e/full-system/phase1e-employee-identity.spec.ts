import { expect, test, type Page } from "@playwright/test";

import { STATE_COMPANY_ADMIN, expectToast, fieldByLabel, modalRoot, shot } from "./_shared";

/**
 * เฟส 1e — เลขประจำตัวและบัญชีธนาคารของพนักงาน
 * -----------------------------------------------------------------------------
 * ตอนสร้างพนักงานในเฟส 1c ระบบไม่ได้บังคับให้กรอกเลขบัตรประชาชน
 * เลขประกันสังคม และเลขบัญชีธนาคาร จึงสร้างพนักงานได้โดยเว้นว่างไว้ทั้งหมด
 *
 * เรื่องนี้ไม่มีผลอะไรเลยจนกระทั่งถึงขั้นออกไฟล์นำส่งในเฟส 8c แล้วพบว่า
 *   ไฟล์ สปส.1-10 e-Service  ออกมามีแต่บรรทัดหัวไฟล์ ไม่มีพนักงานสักคน
 *                            เพราะระบบข้ามคนที่ไม่มีเลขบัตรและเลขผู้ประกันตน
 *   ไฟล์โอนธนาคาร            ออกมาครบ 8 แถวพร้อมยอดเงิน แต่ช่องธนาคาร
 *                            และเลขที่บัญชีว่างทั้งหมด ธนาคารจะปฏิเสธทั้งไฟล์
 *
 * ทั้งสองไฟล์ดาวน์โหลดได้ตามปกติ ปุ่มไม่ถูกปิด และไม่มีอะไรบังคับให้รู้ตัว
 * เฟสนี้จึงเติมข้อมูลที่ขาดให้ครบก่อน แล้วค่อยไปตรวจไฟล์นำส่งอีกที
 */

/*
 * เลขบัตรประชาชนไทยมี 13 หลักและมีหลักตรวจสอบ ระบบอาจตรวจความถูกต้อง
 * จึงคำนวณหลักสุดท้ายให้ถูกตามสูตรจริง ไม่ใช่สุ่มตัวเลข 13 ตัว
 */
function thaiNationalId(seed: number) {
  const base = `1${String(100000000000 + seed * 7919).slice(0, 11)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(base[i]) * (13 - i);
  }
  const check = (11 - (sum % 11)) % 10;
  return `${base}${check}`;
}

async function openEmployees(page: Page) {
  await page.goto("/employees");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("tbody tr").first()).toBeVisible({
    timeout: 90_000,
  });
  await page.waitForTimeout(5000);
}

test.describe("เฟส 1e · เลขประจำตัวและบัญชีธนาคาร", () => {
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("พนักงานทุกคนต้องมีเลขบัตร เลขประกันสังคม และเลขบัญชี", async ({
    page,
  }) => {
    test.setTimeout(1_800_000);

    await openEmployees(page);
    const total = await page.locator("tbody tr").count();
    expect(total).toBeGreaterThan(0);

    let updated = 0;

    for (let i = 0; i < total; i += 1) {
      await openEmployees(page);

      /*
       * ต้องกดปุ่ม "ดูรายละเอียด" ในแถว การคลิกที่ตัวแถวเฉยๆ ไม่พาไปไหน
       * เคสที่เพิ่งพลาด: คลิกแถวแล้วหาปุ่มแก้ไขไม่เจอ เลย continue ข้ามทุกคน
       * เทสผ่านเขียวทั้งที่ไม่ได้แก้อะไรเลยสักคน
       */
      await page
        .locator("tbody tr")
        .nth(i)
        .getByRole("button", { name: "ดูรายละเอียด" })
        .click();
      await page.waitForURL(/\/employees\/[^/]+$/, { timeout: 240_000 });
      await page.waitForTimeout(6000);

      /*
       * หน้ารายละเอียดพนักงานดึงข้อมูลหลายชุดพร้อมกัน (ค่าตอบแทน เอกสาร
       * ประวัติการจ้าง สิทธิการลา) บางครั้งค้างที่ "กำลังโหลดข้อมูลพนักงาน..."
       * นานเกินหนึ่งนาที จึงต้องรอนานกว่าปกติ
       */
      const editButton = page.getByRole("button", { name: "แก้ไขข้อมูล" });
      await expect(editButton.first()).toBeVisible({ timeout: 240_000 });

      await editButton.first().click();
      await page.waitForTimeout(3000);

      const modal = modalRoot(page);

      const nationalIdField = fieldByLabel(modal, "เลขบัตรประชาชน", "input");
      const current = await nationalIdField.inputValue();

      // มีเลขบัตรแล้วแปลว่าเคยเติมไปแล้ว ปิดฟอร์มแล้วข้ามไปคนถัดไป
      if (current.trim()) {
        await page.getByRole("button", { name: "ยกเลิก" }).first().click();
        await page.waitForTimeout(1500);
        continue;
      }

      const nationalId = thaiNationalId(i + 1);

      await nationalIdField.fill(nationalId);
      await fieldByLabel(modal, "เลขประกันสังคม", "input").fill(nationalId);
      await fieldByLabel(modal, "ธนาคาร", "input").fill("ธนาคารกสิกรไทย");
      await fieldByLabel(modal, "เลขบัญชี", "input").fill(
        `${1000000000 + i * 137}`,
      );

      await modal.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expectToast(page, /แก้ไขข้อมูลพนักงานสำเร็จ/, 90_000);
      await page.waitForTimeout(4000);
      updated += 1;
    }

    test.info().annotations.push({
      type: "สรุป",
      description: `เติมข้อมูลประจำตัวและบัญชีธนาคารให้ ${updated} คน จากทั้งหมด ${total} คน`,
    });

    /*
     * ยืนยันผลจากหน้าจอจริง ไม่ใช่เชื่อว่าลูปทำงานแล้ว
     * เปิดคนแรกขึ้นมาดูว่าเลขบัตรถูกบันทึกลงไปจริง
     */
    await openEmployees(page);
    await page
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "ดูรายละเอียด" })
      .click();
    await page.waitForURL(/\/employees\/[^/]+$/, { timeout: 240_000 });
    await page.waitForTimeout(8000);

    /*
     * ยืนยันจากช่องกรอกในฟอร์มแก้ไข ไม่ใช่ข้อความบนหน้าสรุป
     * เพราะหน้าสรุปอาจซ่อนหรือจัดรูปแบบเลขบัตรต่างออกไป
     * ส่วนช่องกรอกต้องมีค่าที่บันทึกไว้จริงเสมอ
     */
    await expect(
      page.getByRole("button", { name: "แก้ไขข้อมูล" }).first(),
    ).toBeVisible({ timeout: 240_000 });
    await page.getByRole("button", { name: "แก้ไขข้อมูล" }).first().click();
    await page.waitForTimeout(3000);

    const verifyModal = modalRoot(page);
    await expect(
      fieldByLabel(verifyModal, "เลขบัตรประชาชน", "input"),
    ).toHaveValue(/^\d{13}$/, { timeout: 30_000 });
    await expect(
      fieldByLabel(verifyModal, "เลขบัญชี", "input"),
    ).toHaveValue(/^\d+$/, { timeout: 30_000 });

    await page.screenshot({ path: shot("p1e-01-identity"), fullPage: true });
  });
});
