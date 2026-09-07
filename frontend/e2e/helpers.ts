import { readFileSync } from "fs";
import { join } from "path";
import { expect, type Page } from "@playwright/test";

/**
 * บัญชีที่ใช้ทดสอบ
 * ----------------
 * ค่าเริ่มต้นเดิมชี้ไป uat.*@hr.local ซึ่งมาจาก
 * backend/prisma/dev-seed/uat_seed_full_system.sql ที่ไม่ได้ถูกรันกับฐานข้อมูล
 * dev จริง (ตรวจแล้วมี 0 แถว) ทำให้ทุกเทสต์ล้มที่ขั้น login ด้วย 401 มาตลอด
 *
 * เปลี่ยนมาใช้บัญชีที่ `npm run db:seed:fresh` สร้างจริง ซึ่งเป็นสคริปต์ที่ใช้
 * ตั้งฐานข้อมูล dev อยู่แล้ว ยังคง override ผ่าน env ได้เหมือนเดิมถ้าจะชี้ไป
 * ชุดข้อมูล UAT
 *
 * หมายเหตุเรื่อง 2FA: role SYSTEM_ADMIN / HR_ADMIN / PAYROLL_ACCOUNTING ถูก
 * บังคับ 2FA ตาม TWO_FACTOR_REQUIRED_ROLE_CODES ใน backend/.env
 * loginByApi ด้านล่างรองรับอยู่แล้วโดยอ่าน debugTwoFactorCode
 * ซึ่งจะมีก็ต่อเมื่อ TWO_FACTOR_DEV_SHOW_CODE=true
 */
export const UAT = {
  password: process.env.E2E_UAT_PASSWORD ?? "Admin@123456",
  admin: process.env.E2E_ADMIN_EMAIL ?? "superadmin@tjc.local",
  hr: process.env.E2E_HR_EMAIL ?? "hr.alpha@tjc.local",
  payroll: process.env.E2E_PAYROLL_EMAIL ?? "payroll.alpha@tjc.local",
  executive: process.env.E2E_EXECUTIVE_EMAIL ?? "exec.alpha@tjc.local",
  managerA: process.env.E2E_MANAGER_A_EMAIL ?? "mgr.alpha.hq@tjc.local",
  managerB: process.env.E2E_MANAGER_B_EMAIL ?? "mgr.beta.cm@tjc.local",
  employeeA1: process.env.E2E_EMPLOYEE_A1_EMAIL ?? "emp.alpha.lp@tjc.local",
  payrollRunId: process.env.E2E_PAYROLL_RUN_ID ?? "uat_payroll_run_202606",
};

const ACCESS_TOKEN_KEY = "hr_access_token";
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:4000/api";

type LoginBody = {
  requiresTwoFactor?: boolean;
  accessToken?: string;
  tokenType?: string;
  user?: unknown;
  twoFactorToken?: string;
  debugTwoFactorCode?: string;
  data?: {
    requiresTwoFactor?: boolean;
    accessToken?: string;
    tokenType?: string;
    user?: unknown;
    twoFactorToken?: string;
    debugTwoFactorCode?: string;
  };
};

function unwrap<T extends Record<string, unknown>>(body: T): T | T["data"] {
  if (body && typeof body === "object" && "data" in body && body.data) {
    return body.data as T["data"];
  }

  return body;
}

async function loginByApi(page: Page, email: string, password: string) {
  const response = await page.request.post(`${API_BASE_URL}/auth/login`, {
    data: {
      email,
      password,
    },
  });

  const rawBody = (await response.json().catch(() => null)) as LoginBody | null;

  if (!response.ok()) {
    throw new Error(
      `API login failed for ${email}. Status=${response.status()} Body=${JSON.stringify(rawBody)}`,
    );
  }

  let body = unwrap(rawBody ?? {}) as LoginBody;

  if (body.requiresTwoFactor) {
    const code = body.debugTwoFactorCode;

    if (!body.twoFactorToken || !code) {
      throw new Error(
        `2FA is required for ${email}, but debug code is not available. Restart backend with TWO_FACTOR_REQUIRED_ROLE_CODES="" or TWO_FACTOR_DEV_SHOW_CODE=true.`,
      );
    }

    const verifyResponse = await page.request.post(`${API_BASE_URL}/auth/2fa/verify`, {
      data: {
        twoFactorToken: body.twoFactorToken,
        code,
      },
    });

    const verifyRawBody = (await verifyResponse.json().catch(() => null)) as LoginBody | null;

    if (!verifyResponse.ok()) {
      throw new Error(
        `2FA verify failed for ${email}. Status=${verifyResponse.status()} Body=${JSON.stringify(verifyRawBody)}`,
      );
    }

    body = unwrap(verifyRawBody ?? {}) as LoginBody;
  }

  if (!body.accessToken) {
    throw new Error(
      `Login response for ${email} does not include accessToken. Body=${JSON.stringify(rawBody)}`,
    );
  }

  await page.addInitScript(
    ({ key, token }) => {
      window.sessionStorage.setItem(key, token);
    },
    {
      key: ACCESS_TOKEN_KEY,
      token: body.accessToken,
    },
  );

  return body.accessToken;
}

export async function login(page: Page, email: string, password = UAT.password) {
  await loginByApi(page, email, password);
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

/** ไฟล์ที่ global-setup เขียน token ไว้ให้ทุกเทสต์ใช้ร่วมกัน */
export const TOKEN_STORE_PATH = join(
  process.cwd(),
  "test-results",
  ".auth-tokens.json",
);

let tokenStore: Record<string, string> | null = null;

function readTokenStore(): Record<string, string> {
  if (tokenStore) return tokenStore;

  try {
    tokenStore = JSON.parse(readFileSync(TOKEN_STORE_PATH, "utf8")) as Record<
      string,
      string
    >;
  } catch {
    tokenStore = {};
  }

  return tokenStore;
}

/**
 * ใส่ token ที่เตรียมไว้แล้วจาก global-setup ลง sessionStorage
 *
 * ใช้แทนการล็อกอินในทุกเทสต์ เพราะ backend จำกัด
 *   POST /auth/login       10 ครั้ง / 60 วินาที  (คิดตาม IP + email)
 *   POST /auth/2fa/verify  10 ครั้ง / 300 วินาที (คิดตาม IP เท่านั้น)
 * ชุดที่ไล่หลายหน้าจะโดน 429 กลางทางแล้วล้มด้วยเหตุที่ไม่เกี่ยวกับสิ่งที่ทดสอบ
 *
 * ถ้าไม่มี token ในไฟล์ (setup ล้ม) จะ fallback ไปล็อกอินเองเพื่อให้เห็นสาเหตุจริง
 */
export async function loginCached(
  page: Page,
  email: string,
  password = UAT.password,
) {
  const token = readTokenStore()[email];

  if (!token) {
    return loginByApi(page, email, password);
  }

  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, value);
    },
    { key: ACCESS_TOKEN_KEY, value: token },
  );

  return token;
}

export async function expectForbiddenPage(
  page: Page,
  path: string,
  expectedPermission?: string,
) {
  await page.goto(path);

  await expect(
    page.getByText(/ไม่มีสิทธิ์|คุณไม่มีสิทธิ์|Forbidden|permission|สิทธิ์/i).first(),
  ).toBeVisible();

  if (expectedPermission) {
    await expect(page.getByText(expectedPermission, { exact: false }).first()).toBeVisible();
  }
}

export async function safeClick(page: Page, label: RegExp, timeout = 5_000) {
  const button = page.getByRole("button", { name: label }).first();

  if (await button.isVisible({ timeout }).catch(() => false)) {
    await button.click();
    return true;
  }

  return false;
}

export async function waitForPageReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
}