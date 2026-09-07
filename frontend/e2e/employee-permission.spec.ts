import { expect, test } from "@playwright/test";
import { expectForbiddenPage, login, UAT, waitForPageReady } from "./helpers";

test.describe("UAT Employee Permission", () => {
  test("Employee A1 cannot access payroll or system settings", async ({ page }) => {
    await login(page, UAT.employeeA1);

    await expectForbiddenPage(page, "/payroll/runs", "PAYROLL_READ");
    await expectForbiddenPage(page, "/settings/system", "ORG_MANAGE");
  });

  test("Employee A1 sees only own attendance scope", async ({ page }) => {
    await login(page, UAT.employeeA1);
    await page.goto("/ess/my-attendance");
    await waitForPageReady(page);

    await expect(page.getByText("UAT Employee A1").first()).toBeVisible();
    await expect(page.getByText("UAT Employee A2").first()).toHaveCount(0);
    await expect(page.getByText("UAT Employee B1").first()).toHaveCount(0);
  });

  test("ESS dashboard and check-in load without forbidden API errors", async ({ page }) => {
    const forbiddenResponses: string[] = [];

    page.on("response", (response) => {
      if (response.status() === 403) {
        forbiddenResponses.push(response.url());
      }
    });

    await login(page, UAT.employeeA1);

    await page.goto("/ess");
    await waitForPageReady(page);
    await expect(page.getByText(/Employee Self Service|ESS/i).first()).toBeVisible();

    await page.goto("/ess/check-in");
    await waitForPageReady(page);
    await expect(page.getByText(/ลงเวลาเข้า-ออกงาน|Attendance/i).first()).toBeVisible();

    expect(forbiddenResponses, `Unexpected 403 responses:\n${forbiddenResponses.join("\n")}`).toEqual([]);
  });
});
