import { expect, test } from "@playwright/test";
import { login, UAT } from "./helpers";

test.describe("UAT Auth", () => {
  test("admin can login and reach dashboard", async ({ page }) => {
    await login(page, UAT.admin);
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/Dashboard|แดชบอร์ด|HR Workforce/i).first()).toBeVisible();
  });
});
