import { expect, test } from "@playwright/test";

import {
  TEST_PASSWORD,
  expectToast,
  loginViaUi,
  selectOptionByText,
  shot,
} from "./_shared";

/**
 * เฟส 1d — บัญชีผู้ใช้ ขอบเขตสิทธิ์ และโรล
 * -----------------------------------------------------------------------------
 * บัญชีผู้ใช้ต้องผูกกับพนักงานเสมอ จึงต้องทำหลังเฟส 1c
 * ตั้งใจสร้างครบทุกบทบาทที่จะใช้ในเฟสถัดๆ ไป
 *   - ผู้ดูแลบริษัท (SYSTEM_ADMIN)  ตั้งค่าระบบทั้งหมด
 *   - ฝ่ายบุคคล (HR_ADMIN)          อนุมัติและปิดงวด
 *   - บัญชีเงินเดือน (PAYROLL_ACCOUNTING)
 *   - หัวหน้างาน (MANAGER)          อนุมัติขั้นแรก
 *   - พนักงาน (EMPLOYEE)            ใช้ ESS
 */

type NewUser = {
  /** ข้อความบางส่วนของพนักงานใน dropdown */
  employee: string;
  email: string;
  roles: string[];
};

const USERS: NewUser[] = [
  { employee: "สมชาย", email: "somchai@tjc.co.th", roles: ["EXECUTIVE"] },
  {
    employee: "วราภรณ์",
    email: "waraporn@tjc.co.th",
    roles: ["SYSTEM_ADMIN", "HR_ADMIN"],
  },
  {
    employee: "ปิยะ",
    email: "piya@tjc.co.th",
    roles: ["PAYROLL_ACCOUNTING", "MANAGER"],
  },
  { employee: "อรุณี", email: "arunee@tjc.co.th", roles: ["MANAGER"] },
  { employee: "ชัยวัฒน์", email: "chaiwat@tjc.co.th", roles: ["EMPLOYEE"] },
  { employee: "กมล", email: "kamon@tjc.co.th", roles: ["EMPLOYEE"] },
  { employee: "ธนา", email: "thana@tjc.co.th", roles: ["EMPLOYEE"] },
];

/** เลือกพนักงานจาก dropdown ด้วยข้อความบางส่วน */
async function pickEmployee(
  page: import("@playwright/test").Page,
  keyword: string,
) {
  const select = page
    .locator("label")
    .filter({ hasText: /^พนักงานที่ยังไม่มีบัญชี/ })
    .locator("select")
    .first();
  const options = await select
    .locator("option")
    .evaluateAll((els) =>
      els.map((el) => ({
        value: (el as HTMLOptionElement).value,
        text: el.textContent?.trim() ?? "",
      })),
    );
  const match = options.find((o) => o.value && o.text.includes(keyword));
  if (!match) {
    throw new Error(
      `ไม่พบพนักงาน "${keyword}" ในรายการที่ยังไม่มีบัญชี — มี: ${options
        .map((o) => o.text)
        .join(" | ")}`,
    );
  }
  await select.selectOption(match.value);
}

test.describe("เฟส 1d · บัญชีผู้ใช้และโรล", () => {
  test.describe.configure({ mode: "serial" });

  test("สร้างบัญชีผู้ใช้ครบทุกบทบาท", async ({ page }) => {
    await page.goto("/platform/users");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("button", { name: /เพิ่มผู้ใช้/ }).first(),
    ).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(8_000);

    for (const user of USERS) {
      await page.getByRole("button", { name: /เพิ่มผู้ใช้/ }).first().click();
      await expect(page.getByText("เพิ่มผู้ใช้งาน")).toBeVisible({
        timeout: 20_000,
      });

      await pickEmployee(page, user.employee);

      // เลือกพนักงานแล้วระบบเติมอีเมลให้เอง จึงต้องเขียนทับด้วยอีเมลที่ต้องการ
      await page.getByPlaceholder("email@company.com").fill(user.email);
      await page
        .locator("form input[type='password']")
        .first()
        .fill(TEST_PASSWORD);

      /*
       * ระบบติ๊ก EMPLOYEE ให้อัตโนมัติอยู่แล้วในฐานะสิทธิ์พื้นฐาน
       * จึงติ๊กเพิ่มเฉพาะบทบาทที่ต้องการ และต้องจำกัดขอบเขตไว้ในโมดัล
       * ไม่งั้นจะไปโดน label ของหน้าที่อยู่ข้างหลังซึ่งกดไม่ได้
       */
      const modal = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "สร้างผู้ใช้" }) })
        .first();

      for (const role of user.roles) {
        // ข้อความใน label ติดกันเป็น "EXECUTIVEExecutive" จึงเทียบจากชื่อที่ใช้อ่านออกเสียงแทน
        await modal
          .getByRole("checkbox", { name: new RegExp(`^${role}\\s`) })
          .check();
      }

      await page.getByRole("button", { name: "สร้างผู้ใช้" }).click();
      await expectToast(page, /สำเร็จ/);
      await expect(page.getByText(user.email).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.screenshot({ path: shot("p1d-01-users"), fullPage: true });
  });

  test("บัญชีใหม่ได้ขอบเขตสิทธิ์ตามสาขาของพนักงานที่ผูกไว้", async ({ page }) => {
    await page.goto("/platform/access");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(10_000);

    await page
      .getByPlaceholder("ค้นหาชื่อ / อีเมล / รหัสพนักงาน")
      .fill("waraporn@tjc.co.th");
    await page.waitForTimeout(3000);
    await page.getByText("waraporn@tjc.co.th").first().click();
    await page.waitForTimeout(2500);

    // ระบบตั้งขอบเขตให้อัตโนมัติจากสาขาของพนักงาน ไม่ได้ปล่อยเป็น GLOBAL
    await expect(page.getByText("BRANCH", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    // ผูกกับพนักงานและบริษัทที่ถูกต้อง
    await expect(page.getByText(/EMP-0002 · บริษัท ทีเจซี/)).toBeVisible({
      timeout: 30_000,
    });
    // โรลที่ติ๊กไว้ตอนสร้างต้องติดมาครบ
    for (const role of ["Employee", "HR Admin", "System Admin"]) {
      await expect(page.getByText(role, { exact: true }).first()).toBeVisible();
    }
    await page.screenshot({ path: shot("p1d-02-access-scope"), fullPage: true });
  });

  /*
   * ระบบตั้ง scope ให้อัตโนมัติเป็น BRANCH ตามสาขาของพนักงานที่ผูกไว้
   * ถูกสำหรับพนักงานทั่วไป แต่ผิดสำหรับคนที่ต้องดูแลทั้งบริษัท
   *   - ผู้ดูแลระบบ/ฝ่ายบุคคล  ตั้งค่ากะของสาขาอื่นไม่ได้เลย
   *   - บัญชีเงินเดือน         ทำเงินเดือนได้แค่สาขาเดียว
   *   - ผู้บริหาร              เห็นภาพรวมไม่ครบบริษัท
   * ผู้ดูแลแพลตฟอร์มจึงต้องยกระดับให้เป็น COMPANY เป็นขั้นตอนหนึ่งของการตั้งระบบ
   */
  const COMPANY_SCOPE_USERS = [
    "waraporn@tjc.co.th",
    "piya@tjc.co.th",
    "somchai@tjc.co.th",
  ];

  test("ยกระดับขอบเขตของผู้ดูแล บัญชีเงินเดือน และผู้บริหาร เป็นระดับบริษัท", async ({
    page,
  }) => {
    await page.goto("/platform/access");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(10_000);

    for (const email of COMPANY_SCOPE_USERS) {
      const search = page.getByPlaceholder("ค้นหาชื่อ / อีเมล / รหัสพนักงาน");
      await search.fill(email);
      await page.waitForTimeout(2500);
      await page.getByText(email).first().click();
      await page.waitForTimeout(2000);

      await page.getByRole("button", { name: /ระดับบริษัท/ }).click();
      await page.waitForTimeout(1000);

      const companySelect = page
        .locator("label")
        .filter({ hasText: /^บริษัท \*/ })
        .locator("select")
        .first();
      await selectOptionByText(companySelect, "บริษัท ทีเจซี");

      await page.getByRole("button", { name: /บันทึกสิทธิ์/ }).click();
      await expectToast(page, /สำเร็จ/);
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: shot("p1d-04-company-scope"), fullPage: true });
  });

  /*
   * แต่ละบทบาทต้องลงหน้าเริ่มต้นที่ตรงกับงานของตัวเอง
   * เคสที่เคยพัง: ผู้ดูแลระบบของบริษัทเดียวถูกส่งเข้า Platform Console
   * ซึ่งเป็นหน้าคุมข้ามบริษัท จึงขึ้นเลข 0 ทั้งหน้าเพราะมองไม่เห็นบริษัทใดเลย
   */
  const LANDING: { email: string; expect: RegExp; label: string }[] = [
    { email: "waraporn@tjc.co.th", expect: /\/hr\/dashboard/, label: "ฝ่ายบุคคล" },
    { email: "somchai@tjc.co.th", expect: /\/executive\//, label: "ผู้บริหาร" },
    { email: "arunee@tjc.co.th", expect: /\/manager\//, label: "หัวหน้างาน" },
    { email: "kamon@tjc.co.th", expect: /\/ess/, label: "พนักงาน" },
  ];

  for (const target of LANDING) {
    test(`${target.label} เข้าระบบแล้วลงหน้าเริ่มต้นที่ถูกต้อง`, async ({
      browser,
    }) => {
      // ต้องเป็นคนละ session กับ superadmin จึงเปิด context ใหม่ที่ยังไม่ล็อกอิน
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();

      await loginViaUi(page, target.email, TEST_PASSWORD);
      await expect(page).toHaveURL(target.expect, { timeout: 30_000 });
      await expect(page).not.toHaveURL(/\/platform/);
      await page.screenshot({
        path: shot(`p1d-03-landing-${target.email.split("@")[0]}`),
        fullPage: true,
      });

      await context.close();
    });
  }
});
