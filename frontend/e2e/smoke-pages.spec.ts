import { expect, test, type Page } from "@playwright/test";

import { loginCached, UAT, waitForPageReady } from "./helpers";

/**
 * Smoke test ที่ไม่ผูกกับชุดข้อมูล
 * ================================
 * spec อื่นในโฟลเดอร์นี้ตรวจค่าจากชุดข้อมูล UAT (พนักงานชื่อ "UAT Employee A1",
 * งวด uat_payroll_run_202606) ซึ่งมาจาก
 * backend/prisma/dev-seed/uat_seed_full_system.sql และสคริปต์นั้นตั้งใจให้รัน
 * กับฐานข้อมูลแยกที่ชื่อมีคำว่า "uat" เท่านั้น (มี guard RAISE EXCEPTION อยู่)
 * เทสต์กลุ่มนั้นจึงรันไม่ผ่านถ้าชี้มาที่ฐานข้อมูล dev ปกติ
 *
 * ไฟล์นี้เติมสิ่งที่ขาด: ตาข่ายที่รันได้กับฐานข้อมูลไหนก็ได้ ใช้ตรวจว่า
 *   - หน้าเปิดได้ ไม่เด้งกลับ login
 *   - ไม่มี error หลุดขึ้นจอ
 *   - ไม่มี request ไหนพังด้วย 5xx
 *   - หน้าไม่ได้ค้างอยู่ที่สถานะกำลังโหลด (แปลว่า fetch จบจริง)
 *
 * มีไว้เพื่อจับ regression ตอนย้ายหน้าจาก useEffect ไป react-query โดยเฉพาะ
 * เพราะสิ่งที่พังง่ายที่สุดคือ "หน้าโหลดค้าง" หรือ "ยิง API ไม่ออก"
 * ซึ่งไม่ต้องรู้ค่าข้อมูลก็ตรวจได้
 */

type PageCheck = {
  path: string;
  as: string;
};

const PAGES: PageCheck[] = [
  { path: "/dashboard", as: UAT.hr },
  { path: "/permissions", as: UAT.admin },
  { path: "/roles", as: UAT.admin },
  { path: "/users", as: UAT.admin },
  { path: "/employees", as: UAT.hr },
  { path: "/attendance", as: UAT.hr },
  { path: "/approvals", as: UAT.hr },
  { path: "/organization", as: UAT.hr },
  { path: "/onboarding", as: UAT.hr },
  { path: "/offboarding", as: UAT.hr },
  { path: "/recruitment", as: UAT.hr },
  { path: "/performance", as: UAT.hr },
  { path: "/documents", as: UAT.hr },
  { path: "/hr-review", as: UAT.hr },
  { path: "/reports", as: UAT.hr },
  { path: "/payroll/periods", as: UAT.payroll },
  { path: "/payroll/compensation", as: UAT.payroll },
  { path: "/payroll/payslips", as: UAT.payroll },
  { path: "/settings/work-policies", as: UAT.admin },
  { path: "/settings/system", as: UAT.admin },
  { path: "/settings/system/attendance-methods", as: UAT.hr },
  { path: "/ess", as: UAT.employeeA1 },
  { path: "/manager/team", as: UAT.managerB },
];

/** เก็บ request ที่ตอบ 5xx ไว้ตรวจตอนท้าย */
function trackServerErrors(page: Page) {
  const failures: string[] = [];

  page.on("response", (response) => {
    if (response.status() >= 500) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  return failures;
}

for (const target of PAGES) {
  test(`smoke ${target.path}`, async ({ page }) => {
    const serverErrors = trackServerErrors(page);

    await loginCached(page, target.as);
    await page.goto(target.path);
    await waitForPageReady(page);

    // ยังอยู่ในหน้าที่ขอ ไม่ถูกเด้งออกไป login
    await expect(page).not.toHaveURL(/\/login/);

    // ให้เวลา query ที่ยิงตอน mount ทำงานจนจบ
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => undefined);

    // ไม่ควรค้างอยู่ที่สถานะกำลังโหลดหลัง network เงียบแล้ว
    const stillLoading = page.getByText(/กำลังโหลด/i).first();
    await expect(stillLoading).toBeHidden({ timeout: 15_000 }).catch(async () => {
      throw new Error(`${target.path} ค้างอยู่ที่สถานะกำลังโหลดหลัง network เงียบแล้ว`);
    });

    // ไม่มีข้อความ error ค้างบนหน้า
    await expect(
      page.getByText(/เกิดข้อผิดพลาด|ไม่สำเร็จ|Internal server error/i).first(),
    ).toBeHidden();

    expect(
      serverErrors,
      `${target.path} มี request ที่ตอบ 5xx:\n${serverErrors.join("\n")}`,
    ).toEqual([]);
  });
}
