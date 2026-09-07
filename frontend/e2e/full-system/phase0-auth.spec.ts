import { expect, test } from "@playwright/test";

import {
  SUPERADMIN,
  expectToast,
  loginViaUi,
  logoutViaUi,
  shot,
} from "./_shared";

/**
 * เฟส 0 — เข้าระบบ
 * -----------------------------------------------------------------------------
 * พิสูจน์ว่าประตูหน้าบ้านใช้งานได้จริงก่อนไปเฟสอื่น
 *   - กันคนที่ยังไม่ล็อกอินออกจากหน้าใน
 *   - รหัสผิดต้องไม่เข้า และต้องบอกเหตุผล
 *   - บทบาทที่บังคับ 2FA ต้องเจอหน้ายืนยัน และย้อนกลับได้
 *   - เข้าได้แล้วเมนูต้องตรงกับสิทธิ์
 *   - จัดการ session ของตัวเองได้
 *   - ออกจากระบบแล้วกลับเข้าหน้าในไม่ได้
 */
test.describe("เฟส 0 · เข้าสู่ระบบ", () => {
  test.describe.configure({ mode: "serial" });
  // เฟสนี้ต้องเริ่มจากสถานะยังไม่ล็อกอิน จึงล้าง session ที่ setup เก็บไว้
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ยังไม่ล็อกอิน เปิดหน้าในไม่ได้ ต้องเด้งไปหน้าล็อกอิน", async ({
    page,
  }) => {
    await page.goto("/employees");
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "เข้าสู่ระบบ" }),
    ).toBeVisible();
    await page.screenshot({ path: shot("p0-01-redirect-to-login") });
  });

  test("รหัสผ่านผิด ต้องไม่เข้าระบบ และแจ้งเหตุผล", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("demo0008@example.com").fill(SUPERADMIN.email);
    await page.getByPlaceholder("กรอกรหัสผ่าน").fill("รหัสผ่านผิดแน่นอน1234");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();

    await expectToast(page, /ไม่ถูกต้อง|ไม่สำเร็จ/);
    await expect(page).toHaveURL(/\/login/);
    await page.screenshot({ path: shot("p0-02-wrong-password") });
  });

  test("รหัสถูก ต้องเจอหน้ายืนยัน 2FA และย้อนกลับได้", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("demo0008@example.com").fill(SUPERADMIN.email);
    await page.getByPlaceholder("กรอกรหัสผ่าน").fill(SUPERADMIN.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();

    await expect(page.getByRole("heading", { name: "ยืนยัน 2FA" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Dev 2FA Code")).toBeVisible();
    await page.screenshot({ path: shot("p0-03-two-factor-screen") });

    // ปุ่มยืนยันต้องกดไม่ได้จนกว่าจะครบ 6 หลัก
    const confirm = page.getByRole("button", { name: "ยืนยันและเข้าสู่ระบบ" });
    await expect(confirm).toBeDisabled();
    await page.getByPlaceholder("000000").fill("123");
    await expect(confirm).toBeDisabled();

    await page
      .getByRole("button", { name: /กลับไปกรอกอีเมลและรหัสผ่านใหม่/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "เข้าสู่ระบบ" }),
    ).toBeVisible();
  });

  test("ใส่รหัส 2FA ผิด ต้องไม่เข้าระบบ", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("demo0008@example.com").fill(SUPERADMIN.email);
    await page.getByPlaceholder("กรอกรหัสผ่าน").fill(SUPERADMIN.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ยืนยัน 2FA" })).toBeVisible({
      timeout: 20_000,
    });

    const devCode = (
      await page
        .locator("div", { hasText: /^Dev 2FA Code$/ })
        .locator("xpath=following-sibling::div[1]")
        .innerText()
    ).trim();

    // สร้างรหัสผิดที่ไม่ซ้ำกับของจริง
    const wrong = devCode === "000000" ? "111111" : "000000";
    await page.getByPlaceholder("000000").fill(wrong);
    await page.getByRole("button", { name: "ยืนยันและเข้าสู่ระบบ" }).click();

    await expectToast(page, /ไม่ถูกต้อง|ไม่สำเร็จ|หมดอายุ/);
    await expect(page).toHaveURL(/\/login/);
    await page.screenshot({ path: shot("p0-04-wrong-2fa") });
  });

  test("เข้าระบบสำเร็จ เมนูตรงกับสิทธิ์ และออกจากระบบได้", async ({ page }) => {
    const { usedTwoFactor } = await loginViaUi(
      page,
      SUPERADMIN.email,
      SUPERADMIN.password,
    );
    expect(usedTwoFactor).toBe(true);

    await expect(page).not.toHaveURL(/\/login/);
    await page.screenshot({
      path: shot("p0-05-logged-in"),
      fullPage: true,
    });

    /*
     * ผู้ใช้ระดับ GLOBAL เข้าไปเจอ "Platform Console" ไม่ใช่เมนูบริษัทปกติ
     * เป็นคนละ shell กัน และไม่ได้อยู่ใน lib/navigation.ts
     * นี่คือจุดเริ่มจริงของการตั้งระบบ: สร้างบริษัทแล้วผูกผู้ดูแลบริษัท
     */
    await expect(page).toHaveURL(/\/platform/);
    await expect(page.getByText("Platform Console").first()).toBeVisible();

    const platformLinks = [
      "/platform",
      "/platform/companies",
      "/platform/users",
      "/platform/access",
      "/platform/attendance-entry",
      "/platform/roles",
      "/platform/permissions",
    ];
    for (const href of platformLinks) {
      await expect(
        page.getByRole("navigation").locator(`a[href="${href}"]`),
      ).toBeVisible({ timeout: 15_000 });
    }

    // การ์ดสรุปต้องขึ้นจริง ไม่ค้างที่สถานะกำลังโหลด
    await expect(page.getByText(/บริษัททั้งหมด/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/กำลังโหลด/)).toHaveCount(0);

    // ทางเข้าพื้นที่บริษัทต้องกดได้
    await page.getByRole("link", { name: /เข้าสู่พื้นที่บริษัท/ }).click();
    await page.waitForURL(/\/hr\/dashboard/, { timeout: 30_000 });
    await page.screenshot({ path: shot("p0-05b-company-area"), fullPage: true });

    // จัดการ session ของตัวเอง
    await page.goto("/settings/security");
    await expect(page).toHaveURL(/\/settings\/security/);
    await expect(page.locator("body")).not.toContainText("Unauthorized");
    await page.screenshot({ path: shot("p0-06-security-sessions"), fullPage: true });

    await logoutViaUi(page);
    await expect(
      page.getByRole("heading", { name: "เข้าสู่ระบบ" }),
    ).toBeVisible();

    // ออกแล้วต้องเข้าหน้าในไม่ได้อีก
    await page.goto("/employees");
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await page.screenshot({ path: shot("p0-07-after-logout") });
  });
});
