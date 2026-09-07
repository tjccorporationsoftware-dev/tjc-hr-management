import { expect, test, type Page } from "@playwright/test";

import {
  STATE_COMPANY_ADMIN,
  expectToast,
  fieldByLabel,
  selectOptionByText,
  shot,
} from "./_shared";

/**
 * เฟส 2d — จุดลงเวลา GPS
 * -----------------------------------------------------------------------------
 * ถ้าบังคับให้พนักงานลงเวลาในพื้นที่ (geofence) แต่สาขายังไม่มีจุด GPS
 * พนักงานจะกดลงเวลาไม่ได้เลยทั้งสาขา จึงต้องตั้งจุดให้ครบก่อนเปิดใช้วิธีนี้
 *
 * ยังไม่ตั้งเครื่องสแกนนิ้ว/ใบหน้า เพราะต้องมีอุปกรณ์จริงถึงจะทดสอบได้จริง
 */

type Location = {
  code: string;
  nameTh: string;
  nameEn: string;
  branch: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
};

const LOCATIONS: Location[] = [
  {
    code: "GPS_HQ",
    nameTh: "สำนักงานใหญ่",
    nameEn: "Head Office",
    branch: "สำนักงานใหญ่",
    latitude: "13.7563000",
    longitude: "100.5018000",
    radiusMeters: "150",
  },
  {
    code: "GPS_WH",
    nameTh: "คลังสินค้าบางนา",
    nameEn: "Bangna Warehouse",
    branch: "คลังสินค้าบางนา",
    latitude: "13.6680000",
    longitude: "100.6050000",
    radiusMeters: "300",
  },
];

/** โมดัลคือกล่องนอกสุดที่มีปุ่มยืนยันอยู่ข้างใน */
function locationModal(page: Page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: "เพิ่มจุดลงเวลา", exact: true }) })
    .first();
}

test.describe("เฟส 2d · จุดลงเวลา GPS", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STATE_COMPANY_ADMIN });

  test("เพิ่มจุดลงเวลาให้ครบทั้งสองสาขา", async ({ page }) => {
    await page.goto("/settings/system/attendance-devices");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("button", { name: /จุดลงเวลา GPS/ })).toBeVisible(
      { timeout: 60_000 },
    );
    await page.waitForTimeout(8_000);

    // หน้านี้เปิดมาที่แท็บเครื่องสแกน ต้องสลับมาแท็บจุดลงเวลาก่อน
    await page.getByRole("button", { name: /จุดลงเวลา GPS/ }).click();
    await page.waitForTimeout(2000);

    for (const location of LOCATIONS) {
      // เคยตั้งไว้แล้วให้ข้าม เทสจึงรันซ้ำได้โดยไม่ต้องล้างข้อมูลก่อน
      if ((await page.getByText(location.code).count()) > 0) {
        continue;
      }

      await page
        .getByRole("button", { name: "เพิ่มจุดลงเวลา", exact: true })
        .first()
        .click();
      await page.waitForTimeout(1500);

      const modal = locationModal(page);
      await selectOptionByText(
        fieldByLabel(modal, "บริษัท", "select"),
        "ทีเจซี",
      );
      await selectOptionByText(
        fieldByLabel(modal, "สาขา", "select"),
        location.branch,
      );
      await fieldByLabel(modal, "รหัสจุดลงเวลา").fill(location.code);
      await fieldByLabel(modal, "ชื่อ \\(ไทย\\)").fill(location.nameTh);
      await fieldByLabel(modal, "ชื่อ \\(อังกฤษ\\)").fill(location.nameEn);
      await fieldByLabel(modal, "ละติจูด").fill(location.latitude);
      await fieldByLabel(modal, "ลองจิจูด").fill(location.longitude);
      await fieldByLabel(modal, "รัศมี").fill(location.radiusMeters);

      await page
        .getByRole("button", { name: "เพิ่มจุดลงเวลา", exact: true })
        .last()
        .click();
      await expectToast(page, /สำเร็จ|เพิ่ม/);

      await expect(page.getByText(location.code).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.screenshot({ path: shot("p2d-01-locations"), fullPage: true });
  });
});
