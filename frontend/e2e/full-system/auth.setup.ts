import { type Page, test as setup } from "@playwright/test";

import {
  COMPANY_ADMIN,
  EMPLOYEE_USER,
  PAYROLL_USER,
  STATE_COMPANY_ADMIN,
  STATE_EMPLOYEE,
  STATE_PAYROLL,
  STATE_SUPERADMIN,
  SUPERADMIN,
  loginViaUi,
} from "./_shared";

/**
 * ล็อกอินผ่าน UI จริงครั้งเดียวต่อบัญชี แล้วเก็บ session ไว้ให้ทุกเฟสใช้ต่อ
 * เหตุผล: POST /auth/login ถูกจำกัด 10 ครั้งต่อ 60 วินาที ถ้าทุกเทสล็อกอินเอง
 * จะโดน 429 กลางทาง ส่วนขั้นตอนล็อกอิน/2FA พิสูจน์ไปแล้วครบในเฟส 0
 */
async function saveSession(
  page: Page,
  email: string,
  password: string,
  statePath: string,
) {
  // ถ้าเพิ่งรันเทสรอบก่อนหน้าอาจยังติดลิมิต จึงรอแล้วลองใหม่
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await loginViaUi(page, email, password);
      await page.context().storageState({ path: statePath });
      return;
    } catch (error) {
      lastError = error;
      console.log(
        `[auth.setup] ${email} ครั้งที่ ${attempt} ไม่สำเร็จ: ${String(error)}`,
      );
      await page.waitForTimeout(45_000);
    }
  }

  throw lastError;
}

setup("ล็อกอิน superadmin แล้วเก็บ session", async ({ page }) => {
  setup.setTimeout(400_000);
  await saveSession(
    page,
    SUPERADMIN.email,
    SUPERADMIN.password,
    STATE_SUPERADMIN,
  );
});

setup("ล็อกอินผู้ดูแลบริษัทแล้วเก็บ session", async ({ page }) => {
  setup.setTimeout(400_000);
  await saveSession(
    page,
    COMPANY_ADMIN.email,
    COMPANY_ADMIN.password,
    STATE_COMPANY_ADMIN,
  );
});

setup("ล็อกอินบัญชีเงินเดือนแล้วเก็บ session", async ({ page }) => {
  setup.setTimeout(400_000);
  await saveSession(
    page,
    PAYROLL_USER.email,
    PAYROLL_USER.password,
    STATE_PAYROLL,
  );
});

setup("ล็อกอินพนักงานแล้วเก็บ session", async ({ page }) => {
  setup.setTimeout(400_000);
  await saveSession(
    page,
    EMPLOYEE_USER.email,
    EMPLOYEE_USER.password,
    STATE_EMPLOYEE,
  );
});
