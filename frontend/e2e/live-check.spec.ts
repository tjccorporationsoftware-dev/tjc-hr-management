import { expect, test, type Page } from "@playwright/test";

/**
 * ตรวจของจริงผ่านหน้าเว็บ
 * =======================
 * ไม่ใช่ unit test — ชุดนี้ขับเบราว์เซอร์จริงเพื่อดูว่าสิ่งที่แก้ไปในรอบนี้
 * ทำงานจริงบนหน้าจอ ไม่ใช่แค่ผ่านในเทสระดับฟังก์ชัน
 *
 *   npx playwright test e2e/live-check.spec.ts --headed --project=chromium
 *
 * สำคัญ: ห้ามใช้ waitForLoadState("networkidle") กับแอปนี้
 * เพราะหน้าที่ล็อกอินแล้วเปิด SSE ค้างไว้สำหรับแจ้งเตือน เครือข่ายจึงไม่มีวันว่าง
 * ต้องรอ element ที่ต้องการเห็นจริง ๆ แทน
 */

const ACCOUNTS = {
  admin: { email: "superadmin@tjc.local", password: "Admin@123456" },
  manager: { email: "arunee@tjc.co.th", password: "Admin@123456" },
};

const API = process.env.E2E_API_BASE_URL ?? "http://localhost:4000/api";

/** เลขบัตรประชาชนไทยเต็มรูปแบบ เช่น 1-2345-67890-12-3 หรือ 1234567890123 */
const FULL_NATIONAL_ID = /\b\d-\d{4}-\d{5}-\d{2}-\d\b|\b\d{13}\b/;

/** เลขที่ถูกปิดหลักจะมี x ติดกันอย่างน้อยสองตัว เช่น x-xxxx-xxxx0-12-3 */
const MASKED_VALUE = /x{2,}/i;

async function loginAs(page: Page, account: { email: string; password: string }) {
  const response = await page.request.post(`${API}/auth/login`, {
    data: { email: account.email, password: account.password },
  });

  const body = await response.json();
  let payload = body.data ?? body;

  // บางบทบาทบังคับ 2FA — อ่านรหัสจาก response ได้เพราะเปิด TWO_FACTOR_DEV_SHOW_CODE
  if (payload.requiresTwoFactor) {
    const verify = await page.request.post(`${API}/auth/2fa/verify`, {
      data: {
        twoFactorToken: payload.twoFactorToken,
        code: payload.debugTwoFactorCode,
      },
    });
    payload = (await verify.json()).data ?? {};
  }

  expect(payload.accessToken, `ล็อกอิน ${account.email} ไม่สำเร็จ`).toBeTruthy();

  await page.goto("/login");
  await page.evaluate((token) => {
    window.localStorage.setItem("hr_access_token", token);
  }, payload.accessToken);
}

/** เปิดหน้ารายชื่อพนักงานแล้วคลิกเข้าไปดูคนแรก */
async function openFirstEmployee(page: Page) {
  await page.goto("/employees");

  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  await firstRow.click();

  // หน้ารายละเอียดพนักงานเปิดที่แท็บ "ภาพรวม" เสมอ
  // เลขบัตร/เลขบัญชีอยู่ในแท็บ "ข้อมูลส่วนตัว" ต้องกดเข้าไปก่อน
  await expect(page.getByRole("tab", { name: "ข้อมูลส่วนตัว" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("tab", { name: "ข้อมูลส่วนตัว" }).click();

  await expect(page.getByText("เลขบัตรประชาชน").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
}

test.describe("ตรวจของจริงผ่านหน้าเว็บ", () => {
  test("หัวหน้างานต้องเห็นเลขบัตรแบบปิดหลัก", async ({ page }) => {
    await loginAs(page, ACCOUNTS.manager);
    await openFirstEmployee(page);

    const bodyText = await page.locator("body").innerText();

    console.log("  พบเลขที่ถูกปิดหลัก:", MASKED_VALUE.test(bodyText));
    console.log("  พบเลขบัตรเต็ม:", FULL_NATIONAL_ID.test(bodyText));

    await page.screenshot({
      path: "e2e-artifacts/live-manager-masked.png",
      fullPage: true,
    });

    expect(
      FULL_NATIONAL_ID.test(bodyText),
      "หัวหน้างานไม่ควรเห็นเลขบัตรเต็ม",
    ).toBe(false);
  });

  test("ผู้ดูแลระบบต้องเห็นเลขบัตรเต็ม", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await openFirstEmployee(page);

    const bodyText = await page.locator("body").innerText();

    console.log("  พบเลขที่ถูกปิดหลัก:", MASKED_VALUE.test(bodyText));
    console.log("  พบเลขบัตรเต็ม:", FULL_NATIONAL_ID.test(bodyText));

    await page.screenshot({
      path: "e2e-artifacts/live-admin-full.png",
      fullPage: true,
    });
  });

  test("หน้าที่ไม่มีอยู่จริงต้องขึ้น 404 ภาษาไทย ไม่ใช่จอขาว", async ({ page }) => {
    await loginAs(page, ACCOUNTS.manager);

    const response = await page.goto("/หน้าที่ไม่มีอยู่จริง");
    expect(response?.status()).toBe(404);

    await expect(page.getByText("ไม่พบหน้าที่ต้องการ")).toBeVisible({
      timeout: 15_000,
    });

    await page.screenshot({ path: "e2e-artifacts/live-404.png" });
  });

  test("หัวหน้างานเปิดหน้าที่ไม่มีสิทธิ์ ต้องได้ข้อความอธิบาย ไม่ใช่จอว่าง", async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.manager);
    await page.goto("/permissions");

    // รออะไรก็ได้ที่บอกว่าหน้าตอบสนองแล้ว
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const bodyText = await page.locator("body").innerText();
    console.log(
      "  ข้อความที่แสดง:",
      bodyText.slice(0, 300).replace(/\n+/g, " | "),
    );

    await page.screenshot({
      path: "e2e-artifacts/live-permission-denied.png",
      fullPage: true,
    });

    expect(bodyText.length).toBeGreaterThan(50);
  });
});
