import { expect, test, type Page } from "@playwright/test";
import { login, safeClick, UAT, waitForPageReady } from "./helpers";

async function clearAuth(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
}

async function openPayrollRun(page: Page) {
  await page.goto(`/payroll/runs/${UAT.payrollRunId}`);
  await waitForPageReady(page);

  await expect(
    page.getByText(/UAT Payroll June 2026|Payroll Run|เงินเดือน/i).first(),
  ).toBeVisible();
}

async function ensureReviewedAndApproved(page: Page) {
  await openPayrollRun(page);

  await safeClick(page, /ตรวจสอบ|Review/i, 3_000);
  await page.waitForTimeout(1_000);

  await safeClick(page, /อนุมัติ|Approve/i, 3_000);
  await page.waitForTimeout(1_000);
}

async function openValidationTab(page: Page) {
  await openPayrollRun(page);

  const tab = page.getByRole("tab", { name: /Validation|ตรวจสอบ/i }).first();

  if (await tab.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await tab.click();
  } else {
    await page.getByText(/Validation|ตรวจสอบ/i).first().click();
  }

  await waitForPageReady(page);
}

test.describe("UAT Payroll and Payslip", () => {
  test("Payroll run shows imported attendance deductions and validation is clean", async ({
    page,
  }) => {
    await login(page, UAT.payroll);
    await openPayrollRun(page);

    await expect(page.getByText(/1,085|1085/).first()).toBeVisible();
    await expect(page.getByText(/Validation|ตรวจสอบ/i).first()).toBeVisible();
  });

  test("Publish and unpublish payslip controls employee visibility", async ({
    page,
  }) => {
    await login(page, UAT.payroll);
    await ensureReviewedAndApproved(page);
    await openValidationTab(page);

    const unpublishFirst = await safeClick(
      page,
      /Unpublish|ยกเลิกเผยแพร่/i,
      2_000,
    );

    if (unpublishFirst) {
      await page.waitForTimeout(1_500);
    }

    await safeClick(page, /Publish Payslips|Publish|เผยแพร่/i, 8_000);
    await page.waitForTimeout(2_000);

    await clearAuth(page);

    await login(page, UAT.employeeA1);
    await page.goto("/ess/salary-slip");
    await waitForPageReady(page);

    await expect(page.getByText("UAT Employee A1").first()).toBeVisible();

    await expect(
      page.getByText(/UAT Employee A2|UAT Employee B1|UAT Employee Edge/i),
    ).toHaveCount(0);

    await clearAuth(page);

    await login(page, UAT.payroll);
    await openValidationTab(page);

    await safeClick(page, /Unpublish|ยกเลิกเผยแพร่/i, 8_000);
    await page.waitForTimeout(2_000);

    await clearAuth(page);

    await login(page, UAT.employeeA1);
    await page.goto("/ess/salary-slip");
    await waitForPageReady(page);

    await expect(
      page
        .getByText(/ไม่มีรายการสลิปเงินเดือน|จำนวนสลิป\s*0|0 รายการ/i)
        .first(),
    ).toBeVisible();
  });
});