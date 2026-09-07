import { expect, test, type Page } from "@playwright/test";

import {
  STATE_COMPANY_ADMIN,
  fieldByLabel,
  selectOptionByText,
  shot,
} from "./_shared";

/**
 * เฟส 2g — แม่แบบเอกสาร
 * -----------------------------------------------------------------------------
 * พนักงานขอหนังสือรับรองเงินเดือน/รับรองการทำงานผ่าน ESS ได้ก็ต่อเมื่อ
 * มีประเภทเอกสารและ Template อยู่แล้ว เฟส 6 (ศูนย์เอกสาร) จะใช้ของที่ตั้งตรงนี้
 *
 * ประเภทที่ตั้งไว้จงใจให้ต่างกัน เพื่อทดสอบสองเส้นทาง
 *   - หนังสือรับรองการทำงาน  ต้องผ่านการอนุมัติ
 *   - ใบรับรองเงินเดือน      แสดงเงินเดือนได้ จึงต้องอนุมัติเช่นกัน
 */

const DOC_TYPES = [
  {
    code: "WORK_CERTIFICATE",
    category: "CERTIFICATE",
    nameTh: "หนังสือรับรองการทำงาน",
    nameEn: "Work Certificate",
  },
  {
    code: "SALARY_CERTIFICATE",
    category: "CERTIFICATE",
    nameTh: "หนังสือรับรองเงินเดือน",
    nameEn: "Salary Certificate",
  },
];

/** โมดัลคือกล่องนอกสุดที่มีปุ่มบันทึกอยู่ข้างใน */
function typeModal(page: Page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: "บันทึก", exact: true }) })
    .first();
}

async function openDocumentTemplates(page: Page) {
  await page.goto("/settings/system/document-templates");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/เอกสาร/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(8_000);
}

test.describe("เฟส 2g · แม่แบบเอกสาร", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("สร้างประเภทเอกสารที่พนักงานขอได้", async ({ page }) => {
    await openDocumentTemplates(page);

    for (const type of DOC_TYPES) {
      // เคยสร้างไว้แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูล
      if ((await page.getByText(type.nameTh).count()) > 0) {
        continue;
      }

      await page
        .getByRole("button", { name: "เพิ่มประเภทเอกสาร", exact: true })
        .click();
      await page.waitForTimeout(1500);

      const modal = typeModal(page);
      await fieldByLabel(modal, "รหัสประเภทเอกสาร").fill(type.code);
      await fieldByLabel(modal, "หมวดหมู่").fill(type.category);
      await fieldByLabel(modal, "ชื่อภาษาไทย").fill(type.nameTh);
      await fieldByLabel(modal, "ชื่อภาษาอังกฤษ").fill(type.nameEn);

      await page.getByRole("button", { name: "บันทึก", exact: true }).click();
      await page.waitForTimeout(3000);

      await expect(page.getByText(type.nameTh).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.screenshot({ path: shot("p2g-01-document-types"), fullPage: true });
  });

  test("สร้าง Template ให้ครบทุกประเภท ไม่งั้นออก PDF ไม่ได้", async ({
    page,
  }) => {
    await openDocumentTemplates(page);

    // ป้ายแท็บมีตัวนับต่อท้าย เช่น "Template 0" จึงเทียบแบบขึ้นต้น
    await page.getByRole("button", { name: /^Template/ }).click();
    await page.waitForTimeout(2500);

    for (const type of DOC_TYPES) {
      if ((await page.getByText(`${type.code}_DEFAULT`).count()) > 0) {
        continue;
      }

      await page
        .getByRole("button", { name: "เพิ่ม Template", exact: true })
        .click();
      await page.waitForTimeout(2000);

      const modal = typeModal(page);
      await selectOptionByText(
        fieldByLabel(modal, "ประเภทเอกสาร", "select"),
        type.nameTh,
      );
      await fieldByLabel(modal, "รหัส Template").fill(`${type.code}_DEFAULT`);
      await fieldByLabel(modal, "ชื่อ Template").fill(`แบบมาตรฐาน · ${type.nameTh}`);
      await fieldByLabel(modal, "ชื่อผู้ลงนาม").fill("นาย สมชาย ผู้บริหาร");
      await fieldByLabel(modal, "ตำแหน่งผู้ลงนาม").fill("กรรมการผู้จัดการ");

      await page.getByRole("button", { name: "บันทึก", exact: true }).click();
      await page.waitForTimeout(3000);

      await expect(page.getByText(`${type.code}_DEFAULT`).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    /*
     * คำเตือนนี้แปลว่าคำขอประเภทนั้นจะสร้าง PDF ไม่ได้จริง
     * ต้องหายไปหลังสร้าง Template ครบ
     */
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(8_000);
    await expect(
      page.getByText(/ประเภทเอกสารที่ยังไม่มี Template ใช้งาน/),
    ).toHaveCount(0);

    await page.screenshot({ path: shot("p2g-02-templates"), fullPage: true });
  });
});
